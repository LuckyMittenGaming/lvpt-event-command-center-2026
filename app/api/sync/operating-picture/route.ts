import { readFileSync } from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import { runInNewContext } from 'node:vm';
import { gmailConfigured } from '../../gmail/_lib';
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

function httpsGet(urlString: string, headers: Record<string, string>): Promise<{ status: number; body: string; contentRange: string }> {
  return new Promise((resolve, reject) => {
    const request = https.get(urlString, { headers, timeout: 12000 }, (response) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () => resolve({
        status: response.statusCode || 0,
        body: Buffer.concat(chunks).toString('utf8'),
        contentRange: String(response.headers['content-range'] || '')
      }));
    });
    request.on('timeout', () => {
      request.destroy();
      reject(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT', syscall: 'timeout' }));
    });
    request.on('error', reject);
  });
}

function socketError(error: unknown): string {
  const err = error as { code?: string; syscall?: string; cause?: { code?: string; syscall?: string } };
  const code = err.code || err.cause?.code || '';
  const syscall = err.syscall || err.cause?.syscall || '';
  return [code, syscall].filter(Boolean).join(' ') || safeError(error);
}

async function smsMeta(): Promise<Record<string, unknown>> {
  const attempt = new Date().toISOString();
  if (!smsStoreConfigured()) {
    return {
      connected: false,
      lastAttempt: attempt,
      recordsExamined: 0,
      recordsCreated: 0,
      detail: 'SMS staging is not configured on this deployment. An audit response is not a message sync.'
    };
  }
  const url = (process.env.LVPT_SMS_STAGING_SUPABASE_URL || '').trim().replace(/\/$/, '');
  const key = (process.env.LVPT_SMS_STAGING_SUPABASE_SERVICE_KEY || '').trim();
  const headers = { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' };
  try {
    const ingest = await httpsGet(`${url}/rest/v1/lvpt_sms_staging?select=received_at&tenant_id=eq.lvpt-owner-pilot&order=received_at.desc&limit=1`, {
      ...headers,
      Prefer: 'count=exact'
    });
    if (ingest.status < 200 || ingest.status >= 300) {
      return { connected: false, lastAttempt: attempt, recordsExamined: 0, recordsCreated: 0, detail: `The SMS store returned HTTP ${ingest.status}. Message text was not read.` };
    }
    const ingested = JSON.parse(ingest.body) as Array<{ received_at?: string }>;
    const newestIngestAt = ingested[0]?.received_at || '';
    const countMatch = ingest.contentRange.match(/\/(\d+)$/);
    const message = await httpsGet(`${url}/rest/v1/lvpt_sms_staging?select=timestamp_ms&tenant_id=eq.lvpt-owner-pilot&order=timestamp_ms.desc&limit=1`, headers);
    const messages = message.status >= 200 && message.status < 300 ? JSON.parse(message.body) as Array<{ timestamp_ms?: number }> : [];
    const newestMessageAt = messages[0]?.timestamp_ms ? new Date(Number(messages[0].timestamp_ms)).toISOString() : '';
    const historical = Boolean(newestMessageAt) && Date.now() - Date.parse(newestMessageAt) > 14 * 86400000;
    return {
      connected: Boolean(newestIngestAt) && !historical,
      partial: historical,
      lastAttempt: attempt,
      lastSuccess: newestIngestAt,
      recordsExamined: countMatch ? Number(countMatch[1]) : ingested.length,
      recordsCreated: 0,
      staleAfterHours: 48,
      detail: newestIngestAt
        ? `Newest import ${newestIngestAt}. Newest stored message time ${newestMessageAt || 'unknown'}. ${historical ? 'That message is older than 14 days, so this is a historical import.' : 'The newest stored message is recent. GoHighLevel is not the source.'} Rows ${countMatch ? countMatch[1] : 'unknown'}. Message text was not read.`
        : 'The SMS store answered and has no imported rows. Message text was not read.'
    };
  } catch (error) {
    return {
      connected: false,
      lastAttempt: attempt,
      recordsExamined: 0,
      recordsCreated: 0,
      detail: `SMS metadata did not respond (${socketError(error)}). The request stopped before an HTTP status. Message text was not read.`
    };
  }
}

async function gmailProbe(knownThreadIds: Set<string>): Promise<Record<string, unknown>> {
  const attempt = new Date().toISOString();
  const keys = ['ows-aws', 'lithic', 'imperativex', 'kirkland', 'quinn-emanuel'];
  const queue: Array<Record<string, string>> = [];
  let examined = 0;
  let duplicates = 0;
  let reads = 0;
  let newest = '';
  const errors: string[] = [];
  const started = Date.now();
  for (const eventKey of keys) {
    if (Date.now() - started > 20000) {
      errors.push(`${eventKey} was not checked in this request`);
      continue;
    }
    try {
      const evidence = await appsScriptRequest<Raw>('listGmailThreadEvidence', { eventKey });
      reads += 1;
      const threads = Array.isArray(evidence.threads) ? evidence.threads as Raw[] : [];
      threads.forEach((thread) => {
        examined += 1;
        const threadId = text(thread.threadId, 80);
        const when = text(thread.lastMessageAt, 40);
        if (when > newest) newest = when;
        if (threadId && knownThreadIds.has(threadId)) {
          duplicates += 1;
          return;
        }
        if (queue.length < 8) {
          queue.push({
            domainKey: eventKey,
            subject: text(thread.subject, 140),
            lastMessageAt: when,
            lastDirection: text(thread.lastDirection, 20),
            match: 'needs_review'
          });
        }
      });
    } catch (error) {
      errors.push(text(error instanceof Error ? error.message : 'read failed', 100));
    }
  }
  return {
    connected: false,
    status: reads ? 'UNVERIFIED' : undefined,
    lastAttempt: attempt,
    recordsExamined: examined,
    recordsCreated: 0,
    duplicates,
    queue,
    newest,
    detail: reads
      ? `Authorized Apps Script read ${reads} domain searches and ${examined} header threads. ${duplicates} were already on the sheet. ${queue.length} are queued for review and were not assigned to an event. Newest header ${newest || 'none'}. No Gmail Activity row was written.`
      : `No mailbox read completed. ${errors[0] || 'The Apps Script reader did not answer.'}`
  };
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
    let scanRead = 'failed';
    try {
      const automation = await appsScriptRequest<Raw>('automationStatus');
      scanAt = typeof automation.lastScanAt === 'string' ? automation.lastScanAt : '';
      scanRead = scanAt ? 'present' : 'empty';
    } catch {
      scanRead = 'failed';
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
    const knownThreadIds = new Set<string>();
    eventRows.forEach((event) => {
      const mail = Array.isArray(event.emailActivity) ? event.emailActivity as Raw[] : [];
      mail.forEach((item) => {
        gmailRows += 1;
        const when = text(item.date, 40);
        const threadId = text(item.threadId, 80);
        if (threadId) knownThreadIds.add(threadId);
        if (when > newestGmail) newestGmail = when;
      });
    });

    const serverTime = typeof ledger.serverTime === 'string' ? ledger.serverTime : new Date().toISOString();
    const gmailReady = gmailConfigured();
    const sms = await smsMeta();
    const gmailLive = await gmailProbe(knownThreadIds);
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
      gmailQueue: gmailLive.queue,
      jobs: [
        { id: 'tasksync', name: 'Safe TaskSync', schedule: 'Hourly', nextExpected: 'Hourly in Apps Script. This deployment cannot read the trigger.', owner: 'LVPT Calendar Command Center', observable: false, recordsExamined: 0, recordsCreated: 0, detail: 'Not observable from this preview. runLVPTSafeTaskSync was not called and was not changed.' },
        { id: 'client-lifecycle', name: 'Client lifecycle scan', schedule: 'Apps Script property only', nextExpected: 'Not scheduled by this preview.', owner: 'LVPT_LAST_CLIENT_SCAN_AT', connected: scanRead === 'present', lastSuccess: scanAt, staleAfterHours: 36, recordsExamined: 0, recordsCreated: 0, detail: scanRead === 'failed' ? 'The scan property could not be read.' : scanRead === 'present' ? `Last success ${scanAt}. A separate last-attempt time is not stored.` : 'The property was read and is empty. That is not a success.' },
        { id: 'morning-review', name: 'Morning client review', schedule: '8:00 AM ET', nextExpected: '8:00 AM ET is the known schedule. The next run was not confirmed.', owner: 'External schedule', observable: false, recordsExamined: 0, recordsCreated: 0, detail: 'Not observable. This job does not share the client-scan timestamp.' },
        { id: 'evening-review', name: 'Evening client review', schedule: '7:00 PM ET', nextExpected: '7:00 PM ET is the known schedule. The next run was not confirmed.', owner: 'External schedule', observable: false, recordsExamined: 0, recordsCreated: 0, detail: 'Not observable. This job does not share the client-scan timestamp.' },
        { id: 'executive-brief', name: 'Morning executive inbox brief', schedule: '8:01 AM ET', nextExpected: '8:01 AM ET is the known schedule. The next run was not confirmed.', owner: 'External schedule', observable: false, recordsExamined: 0, recordsCreated: 0, detail: 'Not observable. No run history is stored for this job.' },
        { id: 'gmail-credentials', name: 'Gmail credentials', schedule: 'Server environment', owner: 'Vercel Gmail routes', connected: false, recordsExamined: 0, recordsCreated: 0, detail: gmailReady ? 'Vercel Gmail credentials exist. They are not the ingestion path.' : 'Vercel has no Gmail OAuth variables. The authorized reader is the existing Apps Script project, so a second OAuth client was not added.' },
        { id: 'gmail-ingestion', name: 'Gmail ingestion', schedule: 'Read-only Apps Script evidence', nextExpected: 'No incremental writer is scheduled here.', owner: 'Gmail Activity sheet', ...gmailLive, detail: `${gmailLive.detail} The sheet already holds ${gmailRows} Gmail Activity rows, newest stored date ${newestGmail || 'none'}.` },
        { id: 'sms-ingestion', name: 'SMS ingestion', schedule: 'Android staging import', nextExpected: 'No new schedule was created.', owner: 'Encrypted Supabase rows', ...sms },
        { id: 'email-approval', name: 'Email approval workflow', schedule: 'Off', nextExpected: 'Off until a supervised send test.', owner: 'Owner approval gate', disabled: true, recordsExamined: 0, recordsCreated: 0, detail: sendEnabled ? 'The send switch is on. The reminder route still returns 403.' : 'Sending is disabled. A browser confirmation is not owner approval.' },
        { id: 'financial-sync', name: 'Financial source sync', schedule: 'This page read', nextExpected: 'Each time this page reads the sheet.', owner: 'Command Center Payments and Event Payouts', connected: true, lastAttempt: serverTime, lastSuccess: serverTime, recordsExamined: payments.length + payouts.length, recordsCreated: 0, staleAfterHours: 6, detail: `Read ${payments.length} payment rows and ${payouts.length} payout rows. No financial row was written.` }
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
