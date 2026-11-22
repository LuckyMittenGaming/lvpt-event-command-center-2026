import { readFileSync } from 'node:fs';
import path from 'node:path';
import { runInNewContext } from 'node:vm';
import { gmailConfigured } from '../../gmail/_lib';
import { supabaseHeaders } from '../../sms/staging/_lib';
import { appsScriptRequest, syncConfigured } from '../_lib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function ledgerApi(): { buildLedger: (input: Record<string, unknown>) => Record<string, unknown>; documentedExceptions: () => Array<Record<string, unknown>> } {
  const filename = path.join(process.cwd(), 'public/v2/js/event-finance.js');
  const sandbox = { module: { exports: {} as Record<string, unknown> }, exports: {} as Record<string, unknown> };
  sandbox.exports = sandbox.module.exports;
  runInNewContext(readFileSync(filename, 'utf8'), sandbox, { filename });
  const loaded = sandbox.module.exports;
  if (typeof loaded.buildLedger !== 'function' || typeof loaded.documentedExceptions !== 'function') {
    throw new Error('Ledger builder did not load.');
  }
  return loaded as { buildLedger: (input: Record<string, unknown>) => Record<string, unknown>; documentedExceptions: () => Array<Record<string, unknown>> };
}

type Raw = Record<string, unknown>;

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).host.toLowerCase() === new URL(request.url).host.toLowerCase();
  } catch {
    return false;
  }
}

function text(value: unknown, max: number): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function closed(status: string): boolean {
  return /complete|completed|resolved|done|closed|cancel/i.test(status);
}

function safeError(error: unknown): string {
  const err = error as { name?: string; message?: string; cause?: { code?: string; message?: string } };
  const code = err?.cause?.code ? ` ${err.cause.code}` : '';
  const message = `${err?.name || 'Error'}:${code} ${err?.message || 'request failed'}`;
  return message.replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[redacted]').slice(0, 180);
}

function smsStoreConfigured(): boolean {
  return /^https:\/\/[a-z0-9.-]+\.supabase\.co\/?$/i.test((process.env.LVPT_SMS_STAGING_SUPABASE_URL || '').trim()) &&
    (process.env.LVPT_SMS_STAGING_SUPABASE_SERVICE_KEY || '').trim().length >= 50;
}

async function smsMeta(): Promise<Record<string, unknown>> {
  if (!smsStoreConfigured()) {
    return {
      connected: false,
      lastAttempt: new Date().toISOString(),
      detail: 'SMS staging is not configured on this deployment. An audit response is not a message sync.'
    };
  }
  const attempt = new Date().toISOString();
  try {
    const url = (process.env.LVPT_SMS_STAGING_SUPABASE_URL || '').trim().replace(/\/$/, '');
    const key = (process.env.LVPT_SMS_STAGING_SUPABASE_SERVICE_KEY || '').trim();
    const headers = { ...supabaseHeaders('count=exact'), apikey: key, Authorization: `Bearer ${key}` };
    const ingest = await fetch(`${url}/rest/v1/lvpt_sms_staging?select=received_at&tenant_id=eq.lvpt-owner-pilot&order=received_at.desc&limit=1`, {
      headers, cache: 'no-store', signal: AbortSignal.timeout(12000)
    });
    if (!ingest.ok) {
      return { connected: false, lastAttempt: attempt, detail: `The SMS store returned HTTP ${ingest.status}. Message text was not read.` };
    }
    const ingested = await ingest.json() as Array<{ received_at?: string }>;
    const newestIngestAt = ingested[0]?.received_at || '';
    const countMatch = (ingest.headers.get('content-range') || '').match(/\/(\d+)$/);
    const message = await fetch(`${url}/rest/v1/lvpt_sms_staging?select=timestamp_ms&tenant_id=eq.lvpt-owner-pilot&order=timestamp_ms.desc&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(12000)
    });
    const messages = message.ok ? await message.json() as Array<{ timestamp_ms?: number }> : [];
    const newestMessageAt = messages[0]?.timestamp_ms ? new Date(Number(messages[0].timestamp_ms)).toISOString() : '';
    const historical = Boolean(newestMessageAt) && Date.now() - Date.parse(newestMessageAt) > 14 * 86400000;
    return {
      connected: Boolean(newestIngestAt),
      partial: historical,
      lastAttempt: attempt,
      lastSuccess: newestIngestAt,
      staleAfterHours: 48,
      detail: newestIngestAt
        ? `Newest import ${newestIngestAt}. Newest stored message time ${newestMessageAt || 'unknown'}. ${historical ? 'That message is old, so this is not a live feed.' : 'Encrypted staging rows only. GoHighLevel is not the source.'} Rows ${countMatch ? countMatch[1] : 'unknown'}.`
        : 'The SMS store answered and has no imported rows.'
    };
  } catch (error) {
    const busy = /EBUSY|ECONNRESET|UND_ERR_SOCKET/.test(safeError(error));
    if (busy) {
      try {
        const retry = await fetch(`${url}/rest/v1/lvpt_sms_staging?select=received_at&tenant_id=eq.lvpt-owner-pilot&order=received_at.desc&limit=1`, {
          headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: 'count=exact' },
          cache: 'no-store',
          signal: AbortSignal.timeout(12000)
        });
        if (retry.ok) {
          const rows = await retry.json() as Array<{ received_at?: string }>;
          const newestIngestAt = rows[0]?.received_at || '';
          return {
            connected: Boolean(newestIngestAt),
            lastAttempt: attempt,
            lastSuccess: newestIngestAt,
            staleAfterHours: 48,
            detail: newestIngestAt
              ? `Newest import ${newestIngestAt}. The first connection was busy and the retry returned metadata only. Message text was not read.`
              : 'The SMS store answered on retry and has no imported rows.'
          };
        }
        return { connected: false, lastAttempt: attempt, detail: `SMS metadata returned HTTP ${retry.status} after a busy connection. Message text was not read.` };
      } catch (retryError) {
        return { connected: false, lastAttempt: attempt, detail: `SMS metadata did not respond (${safeError(retryError)}). Message text was not read.` };
      }
    }
    return { connected: false, lastAttempt: attempt, detail: `SMS metadata did not respond (${safeError(error)}). Message text was not read.` };
  }
}

async function gmailProbe(): Promise<Record<string, unknown>> {
  const attempt = new Date().toISOString();
  try {
    const evidence = await appsScriptRequest<Raw>('listGmailThreadEvidence', { eventKey: 'ows-aws' });
    const threads = Array.isArray(evidence.threads) ? evidence.threads as Raw[] : [];
    const newest = threads.map((thread) => text(thread.lastMessageAt, 40)).sort().at(-1) || '';
    return {
      connected: false,
      lastAttempt: attempt,
      detail: `Apps Script read ${threads.length} OWS header threads at ${text(evidence.checkedAt, 40) || attempt}. Newest stored header ${newest || 'none'}. This read does not write Gmail Activity and is not incremental ingestion for the mailbox.`
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Gmail read failed.';
    return {
      connected: false,
      lastAttempt: attempt,
      detail: `No new Gmail row was written. ${message.slice(0, 160)}`
    };
  }
}

export async function GET(request: Request) {
  if (process.env.VERCEL_ENV === 'production') {
    return Response.json({ ok: false, readOnly: true, reason: 'preview_only' }, { status: 403 });
  }
  if (!sameOrigin(request)) {
    return Response.json({ ok: false, readOnly: true, reason: 'same_origin_required' }, { status: 403 });
  }
  if (!syncConfigured()) {
    return Response.json({
      ok: false,
      readOnly: true,
      writesPerformed: false,
      message: 'The sheet connection is not configured on this deployment.'
    }, { status: 503 });
  }

  try {
    const ledger = await appsScriptRequest<Raw>('listReconciliationEvidence');
    let eventRows: Raw[] = [];
    let eventRead = 'unread';
    try {
      const listed = await appsScriptRequest<Raw>('listEvents');
      eventRows = Array.isArray(listed.events) ? listed.events as Raw[] : [];
      eventRead = 'read';
    } catch {
      eventRead = 'failed';
    }
    let scanAt = '';
    try {
      const automation = await appsScriptRequest<Raw>('automationStatus');
      scanAt = typeof automation.lastScanAt === 'string' ? automation.lastScanAt : '';
    } catch {
      scanAt = '';
    }

    const payments = Array.isArray(ledger.paymentRecords) ? ledger.paymentRecords : null;
    const payouts = Array.isArray(ledger.payouts) ? ledger.payouts : null;
    if (!payments || !payouts) {
      return Response.json({
        ok: false,
        readOnly: true,
        writesPerformed: false,
        paymentSourceStatus: 'not_connected',
        message: 'The live Apps Script response did not include every Payments row and every payout row.'
      }, { status: 502 });
    }

    const finance = ledgerApi();
    const report = finance.buildLedger({ payments, payouts });
    const exceptions = finance.documentedExceptions();
    const events = eventRows.map((event) => {
      const mail = Array.isArray(event.emailActivity) ? event.emailActivity as Raw[] : [];
      const staff = Array.isArray(event.staff) ? event.staff as Raw[] : [];
      let newestGmailAt = '';
      mail.forEach((item) => {
        const when = text(item.date, 40);
        if (when > newestGmailAt) newestGmailAt = when;
      });
      return {
        id: text(event.id, 120),
        eventName: text(event.eventName, 160),
        company: text(event.company, 160),
        eventDate: text(event.eventDate, 20),
        status: text(event.status, 40),
        gmailCount: mail.length,
        newestGmailAt,
        staff: staff.slice(0, 8).map((person) => ({
          name: text(person.name, 80),
          role: text(person.role, 80),
          confirmed: person.confirmed === true
        }))
      };
    }).filter((event) => event.id);

    const tasks = eventRows.flatMap((event) => {
      const eventId = text(event.id, 120);
      const rows = Array.isArray(event.tasks) ? event.tasks as Raw[] : [];
      return rows.map((task) => {
        const status = text(task.status, 40);
        if (!text(task.id, 80) || closed(status)) return null;
        return {
          id: text(task.id, 80),
          eventId,
          title: text(task.title, 180),
          owner: text(task.owner, 40),
          dueDate: text(task.dueDate, 20),
          status
        };
      }).filter(Boolean);
    }).slice(0, 200);

    let gmailRows = 0;
    let newestGmail = '';
    eventRows.forEach((event) => {
      const mail = Array.isArray(event.emailActivity) ? event.emailActivity as Raw[] : [];
      mail.forEach((item) => {
        gmailRows += 1;
        const when = text(item.date, 40);
        if (when > newestGmail) newestGmail = when;
      });
    });

    const serverTime = typeof ledger.serverTime === 'string' ? ledger.serverTime : new Date().toISOString();
    const gmailReady = gmailConfigured();
    const [sms, gmailLive] = await Promise.all([smsMeta(), gmailProbe()]);
    const sendEnabled = process.env.LVPT_ENABLE_OWNER_APPROVED_GMAIL_SEND === 'true';

    return Response.json({
      ok: true,
      readOnly: true,
      writesPerformed: false,
      bankVerified: false,
      serverTime,
      eventRead,
      paymentSourceStatus: 'command_center_all_payments',
      payoutSourceStatus: 'command_center_ledger',
      paymentCount: payments.length,
      payoutCount: payouts.length,
      gmailActivityCount: gmailRows,
      newestSheetGmailAt: newestGmail,
      report,
      exceptions,
      events,
      tasks,
      jobs: [
        { name: 'Safe TaskSync', schedule: 'Hourly', owner: 'LVPT Calendar Command Center', connected: false, detail: 'This preview does not read Calendar triggers and does not change runLVPTSafeTaskSync.' },
        { name: 'Client lifecycle scan', schedule: 'Apps Script property only', owner: 'LVPT_LAST_CLIENT_SCAN_AT', connected: Boolean(scanAt), lastSuccess: scanAt, staleAfterHours: 36, detail: scanAt ? `Last success ${scanAt}. A separate last-attempt time is not stored. It is not the morning review, evening review, or executive brief.` : 'No client-scan timestamp was returned. Last attempt is not stored.' },
        { name: 'Morning client review', schedule: '8:00 AM ET', owner: 'Separate schedule', connected: false, detail: 'No last-success timestamp of its own. The client-scan time is not used here.' },
        { name: 'Evening client review', schedule: '7:00 PM ET', owner: 'Separate schedule', connected: false, detail: 'No last-success timestamp of its own.' },
        { name: 'Morning executive inbox brief', schedule: '8:01 AM ET', owner: 'External schedule', connected: false, detail: 'No last-success timestamp is stored for this job.' },
        { name: 'Gmail credentials', schedule: 'Server environment', owner: 'Vercel Gmail routes', connected: gmailReady, partial: gmailReady, detail: gmailReady ? 'Credentials exist. That is not a mailbox read.' : 'GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, and GMAIL_SYNC_KEY are absent on this deployment. Add them in Vercel project settings for Preview. Do not paste them into chat. Apps Script remains the authorized mailbox reader.' },
        { name: 'Gmail ingestion', schedule: 'Not scheduled here', owner: 'Gmail Activity sheet', connected: false, lastAttempt: gmailLive.lastAttempt, detail: `${gmailLive.detail} The sheet already holds ${gmailRows} Gmail Activity rows, newest stored date ${newestGmail || 'none'}. Those rows are prior sheet records, not a new ingest from this request.` },
        { name: 'SMS ingestion', schedule: 'Android staging import', owner: 'Encrypted Supabase rows', ...sms },
        { name: 'Email approval workflow', schedule: 'Off', owner: 'Owner approval gate', disabled: true, detail: sendEnabled ? 'The send switch is on. This preview still blocks the old reminder route.' : 'Sending is disabled. A browser confirmation is not owner approval.' },
        { name: 'Financial source sync', schedule: 'This page read', owner: 'Command Center Payments and Event Payouts', connected: true, lastAttempt: serverTime, lastSuccess: serverTime, staleAfterHours: 6, detail: `Read ${payments.length} payment rows and ${payouts.length} payout rows. Ledger status is not bank verification.` }
      ]
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Ledger read failed.';
    return Response.json({
      ok: false,
      readOnly: true,
      writesPerformed: false,
      paymentSourceStatus: 'not_connected',
      message
    }, { status: 502 });
  }
}
