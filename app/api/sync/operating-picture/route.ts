import { readFileSync } from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import { runInNewContext } from 'node:vm';
import { gmailConfigured } from '../../gmail/_lib';
import { appsScriptRequest, syncConfigured } from '../_lib';
import { denyPrivateRead } from '../_owner-read';
import { jsonNoStore } from '../../sms/staging/_lib';
import { collapseDuplicateIds } from '../../../../lib/action-inbox.mjs';
import { observedTime, SMS_INGEST_STALE_HOURS } from '../../../../lib/sms-scan-health.mjs';
import { classifyGmailHeaderRead, classifyStoredCollection } from '../../../../lib/source-reliability.mjs';

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
    const unread = classifyStoredCollection({ storeReached: false, now: attempt });
    return {
      database: { connected: false, lastAttempt: attempt, recordsExamined: 0, recordsCreated: 0, detail: 'SMS staging is not configured on this deployment.' },
      upload: unread.upload,
      heartbeat: unread.heartbeat
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
      const unread = classifyStoredCollection({ storeReached: false, now: attempt });
      return {
        database: { connected: false, lastAttempt: attempt, recordsExamined: 0, recordsCreated: 0, detail: `The SMS store returned HTTP ${ingest.status}. Message text was not read.` },
        upload: unread.upload,
        heartbeat: unread.heartbeat
      };
    }
    const ingested = JSON.parse(ingest.body) as Array<{ received_at?: string }>;
    const rawIngest = typeof ingested[0]?.received_at === 'string' ? ingested[0].received_at : '';
    const countMatch = ingest.contentRange.match(/\/(\d+)$/);
    let messageTimeNote = 'not read';
    try {
      const message = await httpsGet(`${url}/rest/v1/lvpt_sms_staging?select=timestamp_ms&tenant_id=eq.lvpt-owner-pilot&order=timestamp_ms.desc&limit=1`, headers);
      if (message.status >= 200 && message.status < 300) {
        const messages = JSON.parse(message.body) as Array<{ timestamp_ms?: unknown }>;
        if (!Array.isArray(messages) || messages.length === 0) messageTimeNote = 'none';
        else messageTimeNote = observedTime(messages[0]?.timestamp_ms, Date.now()) || 'not a valid timestamp';
      }
    } catch {
      messageTimeNote = 'not read';
    }
    const cutoff = new Date(Date.now() - SMS_INGEST_STALE_HOURS * 3600000).toISOString();
    const recent = await httpsGet(`${url}/rest/v1/lvpt_sms_staging?select=received_at&tenant_id=eq.lvpt-owner-pilot&received_at=gte.${encodeURIComponent(cutoff)}&limit=1`, {
      ...headers,
      Prefer: 'count=exact'
    });
    const recentMatch = recent.status >= 200 && recent.status < 300 ? recent.contentRange.match(/\/(\d+)$/) : null;
    const recentCount = recentMatch ? Number(recentMatch[1]) : null;
    const rowCount = countMatch ? Number(countMatch[1]) : null;
    const stored = classifyStoredCollection({
      storeReached: true,
      newestIngestAt: rawIngest,
      newestMessageAt: messageTimeNote === 'not read' ? '' : messageTimeNote === 'none' || messageTimeNote === 'not a valid timestamp' ? '' : messageTimeNote,
      rowCount,
      recentImportCount: recentCount,
      heartbeat: null,
      now: attempt
    });
    return {
      database: {
        status: 'HEALTHY',
        lastAttempt: attempt,
        lastSuccess: '',
        recordsExamined: rowCount,
        recordsCreated: 0,
        detail: `The metadata query succeeded. Stored rows ${rowCount === null ? 'not counted' : rowCount}. A healthy database is not a fresh phone upload and is not a device heartbeat. Message text was not read.`
      },
      upload: stored.upload,
      heartbeat: stored.heartbeat
    };
  } catch (error) {
    const detail = `SMS metadata did not respond (${socketError(error)}). This stopped before an HTTP status. Message text was not read.`;
    const unread = classifyStoredCollection({ storeReached: false, now: attempt });
    return {
      database: { connected: false, lastAttempt: attempt, recordsExamined: 0, recordsCreated: 0, detail },
      upload: { ...unread.upload, detail: 'Upload freshness was not checked because the database query did not finish.' },
      heartbeat: unread.heartbeat
    };
  }
}

async function gmailProbe(knownThreadIds: Set<string>, storedNewest: string): Promise<Record<string, unknown>> {
  const keys = ['ows-aws', 'lithic', 'imperativex', 'kirkland', 'quinn-emanuel'];
  const queue: Array<Record<string, string>> = [];
  const reads: Array<{ domain: string; ok: boolean; reason?: string; providerPartial?: boolean; threads?: Array<{ lastMessageAt: string }> }> = [];
  let duplicates = 0;
  let capped = false;
  const started = Date.now();
  for (const eventKey of keys) {
    if (Date.now() - started > 20000) {
      capped = true;
      break;
    }
    try {
      const evidence = await appsScriptRequest<Raw>('listGmailThreadEvidence', { eventKey }, 8000);
      const threads = Array.isArray(evidence.threads) ? evidence.threads as Raw[] : null;
      if (!threads) {
        reads.push({ domain: eventKey, ok: false, reason: 'invalid_body' });
        continue;
      }
      const headers = threads.map((thread) => ({ lastMessageAt: text(thread.lastMessageAt, 40) }));
      reads.push({ domain: eventKey, ok: true, providerPartial: evidence.partial === true, threads: headers });
      threads.forEach((thread) => {
        const threadId = text(thread.threadId, 80);
        const when = text(thread.lastMessageAt, 40);
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
    } catch {
      reads.push({ domain: eventKey, ok: false, reason: 'read_failed' });
    }
  }
  const health = classifyGmailHeaderRead({
    requested: keys.length,
    reads,
    capped,
    storedNewest,
    now: Date.now()
  });
  return {
    ...health.probe,
    duplicates,
    queue,
    newest: health.newestHeaderAt,
    coverage: health.coverage,
    metadataOnly: true,
    fullThreadAccess: false,
    detail: `${health.detail} ${duplicates} header threads were already on the sheet. ${queue.length} are queued for review and were not assigned to an event. No Gmail Activity row was written.`
  };
}

export async function GET(request: Request) {
  if (process.env.VERCEL_ENV === 'production') {
    return jsonNoStore({ ok: false, readOnly: true, reason: 'preview_only' }, 403);
  }
  const denied = denyPrivateRead(request);
  if (denied) return denied;
  if (!syncConfigured()) {
    return jsonNoStore({
      ok: false,
      readOnly: true,
      writesPerformed: false,
      message: 'The sheet connection is not configured on this deployment.'
    }, 503);
  }

  try {
    const sms = await smsMeta();
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
      return jsonNoStore({
        ok: false,
        readOnly: true,
        writesPerformed: false,
        paymentSourceStatus: 'not_connected',
        message: 'The live Apps Script response did not include every Payments row and every payout row.'
      }, 502);
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

    const taskRows = eventRows.flatMap((event) => {
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
      }).filter((row): row is NonNullable<typeof row> => Boolean(row));
    });
    const taskLedger = collapseDuplicateIds(taskRows, ['eventId', 'title', 'owner', 'dueDate', 'status']);
    const tasks = taskLedger.rows.slice(0, 200);
    const taskConflicts = taskLedger.conflicts;

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
    const gmailLive = await gmailProbe(knownThreadIds, newestGmail);
    const sendEnabled = process.env.LVPT_ENABLE_OWNER_APPROVED_GMAIL_SEND === 'true';

    return jsonNoStore({
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
      taskConflicts,
      gmailQueue: gmailLive.queue,
      jobs: [
        { id: 'tasksync', name: 'Safe TaskSync', schedule: 'Hourly', nextExpected: 'Hourly in Apps Script. This deployment cannot read the trigger.', owner: 'LVPT Calendar Command Center', observable: false, recordsExamined: 0, recordsCreated: 0, detail: 'Not observable from this preview. The hourly schedule is configuration, not proof that runLVPTSafeTaskSync ran. The writer was not called and was not changed.' },
        { id: 'client-lifecycle', name: 'Client lifecycle scan', schedule: 'Apps Script property only', nextExpected: 'Not scheduled by this preview.', owner: 'LVPT_LAST_CLIENT_SCAN_AT', connected: scanRead === 'present', lastSuccess: scanAt, staleAfterHours: 36, recordsExamined: 0, recordsCreated: 0, detail: scanRead === 'failed' ? 'The scan property could not be read.' : scanRead === 'present' ? `Last success ${scanAt}. A separate last-attempt time is not stored.` : 'The property was read and is empty. That is not a success.' },
        { id: 'morning-review', name: 'Morning client review', schedule: '8:00 AM ET', nextExpected: '8:00 AM ET is the known schedule. The next run was not confirmed.', owner: 'External schedule', observable: false, recordsExamined: 0, recordsCreated: 0, detail: 'Not observable. This job does not share the client-scan timestamp.' },
        { id: 'evening-review', name: 'Evening client review', schedule: '7:00 PM ET', nextExpected: '7:00 PM ET is the known schedule. The next run was not confirmed.', owner: 'External schedule', observable: false, recordsExamined: 0, recordsCreated: 0, detail: 'Not observable. This job does not share the client-scan timestamp.' },
        { id: 'executive-brief', name: 'Morning executive inbox brief', schedule: '8:01 AM ET', nextExpected: '8:01 AM ET is the known schedule. The next run was not confirmed.', owner: 'External schedule', observable: false, recordsExamined: 0, recordsCreated: 0, detail: 'Not observable. No run history is stored for this job.' },
        { id: 'gmail-credentials', name: 'Gmail credentials', schedule: 'Server environment', owner: 'Vercel Gmail routes', connected: false, recordsExamined: 0, recordsCreated: 0, detail: gmailReady ? 'Vercel Gmail credentials exist. They are not the ingestion path.' : 'Vercel has no Gmail OAuth variables. The authorized reader is the existing Apps Script project, so a second OAuth client was not added.' },
        { id: 'gmail-staging', name: 'Gmail staging ingestion', schedule: 'Hourly Apps Script trigger, not installed', nextExpected: 'No staging trigger exists yet.', owner: 'LVPT Gmail Ingestion — Staging', observable: false, recordsExamined: 0, recordsCreated: 0, duplicates: 0, unmatched: 0, detail: 'This preview cannot read a staging Apps Script run. The business mailbox sign-in is required before that project can be created. A header read below is not an ingested row.' },
        { id: 'gmail-production', schedule: 'Not enabled', nextExpected: 'No production writer is scheduled.', owner: 'Command Center Gmail Activity', ...gmailLive, name: 'Gmail production ingestion', unmatched: Array.isArray(gmailLive.queue) ? gmailLive.queue.length : 0, lastSuccess: '', recordsCreated: 0, detail: `${gmailLive.detail} Production Gmail Activity still has ${gmailRows} stored rows. Appended to that sheet: 0.` },
        { id: 'sms-database', name: 'SMS database health', schedule: 'This metadata query', nextExpected: 'Each time this page reads metadata.', owner: 'LVPT SMS Staging', ...(sms.database as Record<string, unknown>) },
        { id: 'sms-upload', name: 'Android SMS upload freshness', schedule: 'LVPT SMS Test, about every 15 minutes when auto-sync is on', nextExpected: 'The phone decides. This server has no heartbeat.', owner: 'com.lvpt.smsbridge', ...(sms.upload as Record<string, unknown>) },
        { id: 'sms-heartbeat', name: 'Android SMS collector heartbeat', schedule: 'Not read by this preview', nextExpected: 'Unknown until the approved handset reports last_success_at.', owner: 'com.lvpt.smsbridge', ...(sms.heartbeat as Record<string, unknown>) },
        { id: 'email-approval', name: 'Email approval workflow', schedule: 'Off', nextExpected: 'Off until a supervised send test.', owner: 'Owner approval gate', disabled: true, recordsExamined: 0, recordsCreated: 0, detail: sendEnabled ? 'The send switch is on. The reminder route still returns 403.' : 'Sending is disabled. A browser confirmation is not owner approval.' },
        { id: 'financial-sync', name: 'Financial source sync', schedule: 'This page read', nextExpected: 'Each time this page reads the sheet.', owner: 'Command Center Payments and Event Payouts', connected: true, lastAttempt: serverTime, lastSuccess: serverTime, recordsExamined: payments.length + payouts.length, recordsCreated: 0, staleAfterHours: 6, detail: `Read ${payments.length} payment rows and ${payouts.length} payout rows. No financial row was written.` }
      ]
    }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Ledger read failed.';
    return jsonNoStore({
      ok: false,
      readOnly: true,
      writesPerformed: false,
      paymentSourceStatus: 'not_connected',
      message
    }, 502);
  }
}
