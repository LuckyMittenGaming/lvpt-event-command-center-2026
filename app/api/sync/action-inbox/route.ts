import { appsScriptRequest, syncConfigured } from '../_lib';
import { jsonNoStore, ready, supabaseEndpoint, supabaseHeaders } from '../../sms/staging/_lib';
import { buildActionInbox } from '../../../../lib/action-inbox.mjs';
import { publicRcsRecord } from '../../../../lib/rcs-staging.mjs';
import { matchThreads } from '../../../../lib/sms-bridge.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

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

function keyBytes(): Buffer | null {
  try {
    const key = Buffer.from(process.env.LVPT_SMS_STAGING_DATA_KEY_BASE64 || '', 'base64');
    return key.length === 32 ? key : null;
  } catch {
    return null;
  }
}

async function smsThreads(events: Array<{ id?: string; contactPhone?: string }>): Promise<{ threads: Array<Record<string, unknown>>; storedMessages: number; newestAt: string; fresh: boolean }> {
  if (!ready()) return { threads: [], storedMessages: 0, newestAt: '', fresh: false };
  const key = keyBytes();
  if (!key) return { threads: [], storedMessages: 0, newestAt: '', fresh: false };
  const rows: Array<{ contact_hash: string; direction: string; timestamp_ms: number }> = [];
  let after = 0;
  let newest = 0;
  for (let page = 0; page < 8; page += 1) {
    const query = new URLSearchParams({
      select: 'contact_hash,direction,timestamp_ms,sms_id',
      tenant_id: 'eq.lvpt-owner-pilot',
      sms_id: `gt.${after}`,
      order: 'sms_id.asc',
      limit: '1000'
    });
    const response = await fetch(supabaseEndpoint(`lvpt_sms_staging?${query}`), {
      headers: supabaseHeaders(),
      cache: 'no-store',
      signal: AbortSignal.timeout(12_000)
    });
    if (!response.ok) break;
    const batch = await response.json() as Array<Record<string, unknown>>;
    if (!Array.isArray(batch) || batch.length === 0) break;
    for (const row of batch) {
      const smsId = Number(row.sms_id);
      const stamp = Number(row.timestamp_ms) || 0;
      if (Number.isSafeInteger(smsId) && smsId > after) after = smsId;
      if (stamp > newest) newest = stamp;
      rows.push({
        contact_hash: String(row.contact_hash || ''),
        direction: String(row.direction || ''),
        timestamp_ms: stamp
      });
    }
    if (batch.length < 1000) break;
  }
  const threads = matchThreads(rows, events, key);
  const newestAt = newest ? new Date(newest).toISOString() : '';
  const fresh = Boolean(newestAt) && Date.now() - Date.parse(newestAt) < 14 * 86400000;
  return { threads, storedMessages: rows.length, newestAt, fresh };
}

export async function GET(request: Request) {
  if (process.env.VERCEL_ENV === 'production') {
    return jsonNoStore({ ok: false, reason: 'preview_only', sendEnabled: false }, 403);
  }
  if (!sameOrigin(request)) return jsonNoStore({ ok: false, reason: 'same_origin_required', sendEnabled: false }, 403);
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
        status: text(task.status, 40)
      }));
    });

    const gmailThreads: Array<Record<string, string>> = [];
    const keys = ['ows-aws', 'lithic', 'imperativex', 'kirkland', 'quinn-emanuel'];
    const started = Date.now();
    for (const eventKey of keys) {
      if (Date.now() - started > 15000) break;
      try {
        const evidence = await appsScriptRequest<{ threads?: Raw[] }>('listGmailThreadEvidence', { eventKey });
        (Array.isArray(evidence.threads) ? evidence.threads : []).forEach((thread) => {
          gmailThreads.push({
            threadId: text(thread.threadId, 80),
            subject: text(thread.subject, 140),
            lastMessageAt: text(thread.lastMessageAt, 40),
            lastDirection: text(thread.lastDirection, 20),
            domainKey: eventKey
          });
        });
      } catch {
        // A missed header read stays out of the inbox. Stored sheet rows remain.
      }
    }

    let sms = { threads: [] as Array<Record<string, unknown>>, storedMessages: 0, newestAt: '', fresh: false };
    try {
      sms = await smsThreads(sourceEvents.map((event) => ({
        id: text(event.id, 120),
        contactPhone: text(event.contactPhone, 40)
      })));
    } catch {
      sms = { threads: [], storedMessages: 0, newestAt: '', fresh: false };
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
    const gmailFresh = Boolean(newestGmail) && Date.now() - Date.parse(newestGmail) < 14 * 86400000;
    return jsonNoStore({
      ok: true,
      ...inbox,
      sources: {
        events: events.length,
        gmailRows,
        newestGmail,
        gmailFresh,
        gmailHeaders: gmailThreads.length,
        smsMessages: sms.storedMessages,
        newestSms: sms.newestAt,
        smsFresh: sms.fresh,
        rcsMessages: rcsMessages.length,
        newestRcs: rcsMessages.reduce((latest, record) => record.messageAt > latest ? record.messageAt : latest, ''),
        messageTextIncluded: false
      },
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
