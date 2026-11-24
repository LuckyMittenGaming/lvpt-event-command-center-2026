import { appsScriptRequest, syncConfigured } from '../_lib';
import { denyPrivateRead } from '../_owner-read';
import { jsonNoStore, ready, supabaseEndpoint, supabaseHeaders } from '../../sms/staging/_lib';
import { buildActionInbox } from '../../../../lib/action-inbox.mjs';
import { publicRcsRecord } from '../../../../lib/rcs-staging.mjs';
import { matchThreads } from '../../../../lib/sms-bridge.mjs';
import { classifySmsScan, observedTime, SMS_PAGE_CAP, SMS_PAGE_SIZE } from '../../../../lib/sms-scan-health.mjs';
import { classifyGmailHeaderRead } from '../../../../lib/source-reliability.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Raw = Record<string, unknown>;

function text(value: unknown, max: number): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function keyBytes(): Buffer | null {
  try {
    const key = Buffer.from(process.env.LVPT_SMS_STAGING_DATA_KEY_BASE64 || '', 'base64');
    return key.length === 32 ? key : null;
  } catch {
    return null;
  }
}

function offlineScan(configured: boolean) {
  return classifySmsScan({
    configured,
    pages: [{ ok: false, reason: 'offline' }],
    now: Date.now()
  });
}

async function smsThreads(events: Array<{ id?: string; contactPhone?: string }>) {
  const now = Date.now();
  const key = keyBytes();
  if (!ready() || !key) {
    return { threads: [] as Array<Record<string, unknown>>, health: classifySmsScan({ configured: false, pages: [], now }) };
  }
  const pages: Array<Record<string, unknown>> = [];
  const matchRows: Array<{ contact_hash: string; direction: string; timestamp_ms: number }> = [];
  let after = 0;
  for (let page = 0; page < SMS_PAGE_CAP; page += 1) {
    try {
      const query = new URLSearchParams({
        select: 'contact_hash,direction,timestamp_ms,sms_id,received_at',
        tenant_id: 'eq.lvpt-owner-pilot',
        sms_id: `gt.${after}`,
        order: 'sms_id.asc',
        limit: String(SMS_PAGE_SIZE)
      });
      const response = await fetch(supabaseEndpoint(`lvpt_sms_staging?${query}`), {
        headers: supabaseHeaders(),
        cache: 'no-store',
        signal: AbortSignal.timeout(12_000)
      });
      if (!response.ok) {
        pages.push({ ok: false, reason: 'http' });
        break;
      }
      let batch: unknown;
      try {
        batch = await response.json();
      } catch {
        pages.push({ ok: false, reason: 'invalid_body' });
        break;
      }
      if (!Array.isArray(batch)) {
        pages.push({ ok: false, reason: 'invalid_body' });
        break;
      }
      let cursor = after;
      const summary: Array<{ timestamp_ms: unknown; received_at: unknown }> = [];
      for (const row of batch) {
        if (!row || typeof row !== 'object') continue;
        const record = row as Record<string, unknown>;
        const smsId = Number(record.sms_id);
        if (Number.isSafeInteger(smsId) && smsId > cursor) cursor = smsId;
        summary.push({ timestamp_ms: record.timestamp_ms, received_at: record.received_at });
        const messageAt = observedTime(record.timestamp_ms, now);
        matchRows.push({
          contact_hash: String(record.contact_hash || ''),
          direction: String(record.direction || ''),
          timestamp_ms: messageAt ? Number(record.timestamp_ms) : 0
        });
      }
      const advanced = cursor > after;
      after = cursor;
      pages.push({ ok: true, rows: summary, full: batch.length >= SMS_PAGE_SIZE });
      if (batch.length < SMS_PAGE_SIZE) break;
      if (!advanced) {
        pages.push({ ok: false, reason: 'cursor_stalled' });
        break;
      }
    } catch {
      pages.push({ ok: false, reason: 'offline' });
      break;
    }
  }
  const health = classifySmsScan({ configured: true, pages, now });
  let threads: Array<Record<string, unknown>> = [];
  try {
    threads = matchThreads(matchRows, events, key);
  } catch {
    threads = [];
  }
  return { threads, health };
}

export async function GET(request: Request) {
  if (process.env.VERCEL_ENV === 'production') {
    return jsonNoStore({ ok: false, reason: 'preview_only', sendEnabled: false }, 403);
  }
  const denied = denyPrivateRead(request);
  if (denied) return denied;
  if (!syncConfigured()) return jsonNoStore({ ok: false, reason: 'sheet_unconfigured', sendEnabled: false }, 503);
  try {
    const listed = await appsScriptRequest<{ events?: Raw[] }>('listEvents');
    const sourceEvents = Array.isArray(listed.events) ? listed.events : [];
    let gmailRows = 0;
    let newestGmail = '';
    const events = sourceEvents.map((event) => {
      const mail = Array.isArray(event.emailActivity) ? event.emailActivity as Raw[] : [];
      gmailRows += mail.length;
      const setup = event.setup && typeof event.setup === 'object' ? event.setup as Raw : {};
      const quote = Array.isArray(event.quote) ? event.quote as Raw[] : [];
      mail.forEach((item) => {
        const when = text(item.date, 40);
        if (when > newestGmail) newestGmail = when;
      });
      return {
        id: text(event.id, 120),
        eventName: text(event.eventName, 160),
        company: text(event.company, 160),
        contactName: text(event.contactName, 120),
        contactEmail: text(event.contactEmail, 160),
        contactPhone: text(event.contactPhone, 40),
        eventType: text(event.eventType, 80),
        status: text(event.status, 40),
        eventDate: text(event.eventDate, 20),
        venue: text(event.venue, 160),
        guestCount: Number(event.guestCount) || 0,
        leadSource: text(event.leadSource, 80),
        nextAction: text(event.nextAction, 180),
        setup: { budgetRange: text(setup.budgetRange, 80), targetQuote: Number(setup.targetQuote) || 0 },
        quote: quote.slice(0, 40).map((line) => ({
          quantity: Number(line.quantity) || 0,
          unitPrice: Number(line.unitPrice) || 0
        })),
        emailActivity: mail.slice(-12).map((item) => ({
          threadId: text(item.threadId, 80),
          subject: text(item.subject, 140),
          date: text(item.date, 40),
          direction: text(item.direction, 20),
          snippet: text(item.snippet, 180)
        }))
      };
    }).filter((event) => event.id);

    const tasks = sourceEvents.flatMap((event) => {
      const rows = Array.isArray(event.tasks) ? event.tasks as Raw[] : [];
      return rows.map((task) => ({
        id: text(task.id, 80),
        eventId: text(event.id, 120),
        title: text(task.title, 180),
        dueDate: text(task.dueDate, 20),
        status: text(task.status, 40),
        owner: text(task.owner, 80)
      }));
    });

    const gmailThreads: Array<Record<string, string>> = [];
    const gmailKeys = ['ows-aws', 'lithic', 'imperativex', 'kirkland', 'quinn-emanuel'];
    const gmailReads: Array<{ domain: string; ok: boolean; reason?: string; providerPartial?: boolean; threads?: Array<{ lastMessageAt: string }> }> = [];
    let gmailCapped = false;
    const started = Date.now();
    for (const eventKey of gmailKeys) {
      if (Date.now() - started > 15000) {
        gmailCapped = true;
        break;
      }
      try {
        const evidence = await appsScriptRequest<{ threads?: Raw[]; partial?: boolean }>('listGmailThreadEvidence', { eventKey }, 8000);
        const threads = Array.isArray(evidence.threads) ? evidence.threads : null;
        if (!threads) {
          gmailReads.push({ domain: eventKey, ok: false, reason: 'invalid_body' });
          continue;
        }
        gmailReads.push({
          domain: eventKey,
          ok: true,
          providerPartial: evidence.partial === true,
          threads: threads.map((thread) => ({ lastMessageAt: text(thread.lastMessageAt, 40) }))
        });
        threads.forEach((thread) => {
          gmailThreads.push({
            threadId: text(thread.threadId, 80),
            subject: text(thread.subject, 140),
            lastMessageAt: text(thread.lastMessageAt, 40),
            lastDirection: text(thread.lastDirection, 20),
            domainKey: eventKey
          });
        });
      } catch {
        gmailReads.push({ domain: eventKey, ok: false, reason: 'read_failed' });
      }
    }
    const gmailHealth = classifyGmailHeaderRead({
      requested: gmailKeys.length,
      reads: gmailReads,
      capped: gmailCapped,
      storedNewest: newestGmail,
      now: Date.now()
    });

    let sms = { threads: [] as Array<Record<string, unknown>>, health: offlineScan(true) };
    try {
      sms = await smsThreads(sourceEvents.map((event) => ({
        id: text(event.id, 120),
        contactPhone: text(event.contactPhone, 40)
      })));
    } catch {
      sms = { threads: [], health: offlineScan(true) };
    }

    let rcsMessages: ReturnType<typeof publicRcsRecord>[] = [];
    try {
      if (ready()) {
        const listed = await fetch(supabaseEndpoint('lvpt_rcs_staging?select=google_message_id,conversation_id,transport,direction,timestamp_ms,source,schema_version,ingested_at&order=timestamp_ms.desc&limit=50'), {
          headers: supabaseHeaders(),
          cache: 'no-store',
          signal: AbortSignal.timeout(8_000)
        });
        if (listed.ok) {
          const rows = await listed.json();
          if (Array.isArray(rows)) {
            rcsMessages = rows
              .filter((row) => row && typeof row === 'object' && !('body_ciphertext' in row) && !('contact_hash' in row))
              .map((row) => publicRcsRecord(row));
          }
        }
      }
    } catch {
      rcsMessages = [];
    }

    const inbox = buildActionInbox({
      today: new Date().toISOString().slice(0, 10),
      events,
      tasks,
      gmailThreads,
      smsThreads: sms.threads,
      rcsMessages
    });
    return jsonNoStore({
      ok: true,
      ...inbox,
      sources: {
        events: events.length,
        gmailRows,
        newestGmail: gmailHealth.storedNewestAt,
        gmailFresh: false,
        gmailHeaders: gmailHealth.headerThreads,
        gmailHeader: {
          coverage: gmailHealth.coverage,
          connected: gmailHealth.connected,
          partial: gmailHealth.partial,
          unavailable: gmailHealth.unavailable,
          readComplete: gmailHealth.readComplete,
          metadataOnly: true,
          fullThreadAccess: false,
          domainsRequested: gmailHealth.domainsRequested,
          domainsRead: gmailHealth.domainsRead,
          headerThreads: gmailHealth.headerThreads,
          countComplete: gmailHealth.countComplete,
          newestHeaderAt: gmailHealth.newestHeaderAt,
          newestHeaderAmongRead: gmailHealth.newestHeaderAmongRead,
          storedNewestAt: gmailHealth.storedNewestAt,
          invalidTimestamps: gmailHealth.invalidTimestamps,
          fresh: false,
          detail: gmailHealth.detail
        },
        smsMessages: sms.health.countComplete ? sms.health.storedMessages : null,
        newestSms: sms.health.newestMessageAt,
        newestSmsIngest: sms.health.newestIngestAt,
        smsFresh: sms.health.fresh === true,
        smsCoverage: sms.health.coverage,
        sms: {
          connected: sms.health.connected,
          coverage: sms.health.coverage,
          readComplete: sms.health.readComplete,
          partial: sms.health.partial,
          unavailable: sms.health.unavailable,
          pagesRead: sms.health.pagesRead,
          pageCap: sms.health.pageCap,
          truncated: sms.health.truncated,
          providerError: sms.health.providerError,
          storedMessages: sms.health.storedMessages,
          countComplete: sms.health.countComplete,
          newestMessageAt: sms.health.newestMessageAt,
          newestIngestAt: sms.health.newestIngestAt,
          newestMessageAmongRead: sms.health.newestMessageAmongRead,
          newestIngestAmongRead: sms.health.newestIngestAmongRead,
          invalidMessageTimestamps: sms.health.invalidMessageTimestamps,
          invalidIngestTimestamps: sms.health.invalidIngestTimestamps,
          checkedAt: sms.health.checkedAt,
          staleAfterHours: sms.health.staleAfterHours,
          detail: sms.health.detail
        },
        rcsMessages: rcsMessages.length,
        newestRcs: rcsMessages.reduce((latest, record) => record.messageAt > latest ? record.messageAt : latest, ''),
        messageTextIncluded: false
      },
      smsProbe: sms.health.probe,
      gmailProbe: gmailHealth.probe,
      gmail: {
        productionWrites: false,
        historicalRowsPreserved: gmailRows,
        stagingUnattended: 'not_observable_from_this_deployment',
        blocker: 'Production Gmail Activity writes stay off. The staging project hard-refuses the production sheet. Its hourly trigger was installed, and this server cannot see whether that unattended run has completed. Turn production writes on only after an explicit authorization.'
      }
    }, 200);
  } catch {
    return jsonNoStore({ ok: false, reason: 'action_inbox_unavailable', sendEnabled: false, writesPerformed: false }, 502);
  }
}
