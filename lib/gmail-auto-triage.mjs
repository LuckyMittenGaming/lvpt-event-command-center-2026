/**
 * Pure Gmail auto-triage signal extraction + label routing.
 * Mirrors apps-script/GmailAutoTriage.gs for deterministic unit tests.
 * Never sends or deletes mail.
 */

export const LVPT_GMAIL_LABELS = Object.freeze([
  'LVPT/01-Active-Events',
  'LVPT/02-Leads-Pipeline',
  'LVPT/03-Vendors-Staff',
  'LVPT/04-Billing-Receipts',
  'LVPT/05-Needs-Review',
  'LVPT/06-Archive-Completed'
]);

export const DEFAULT_TRIAGE_OPTIONS = Object.freeze({
  dryRun: true,
  mailbox: 'book@pokertraininglasvegas.com',
  maxThreads: 40
});

const VENDOR_RE = /\b(poker room|room rental|venue fee|bar tab|beverage|instructor fee|dealer fee|vendor invoice|staffing invoice|payout)\b/i;
const PAYMENT_RE = /\b(zelle|ach|quickbooks|paid in full|payment received|funds received|receipt|remittance|wire transfer)\b/i;
const TASK_EVIDENCE_RE = /\b(uploaded|attached|delivered|confirmed staff|document uploaded|coi attached|w-?9|signed contract)\b/i;
const LEAD_RE = /\b(inquiry|interested in|poker training|event quote|looking for a poker)\b/i;
const NOISE_RE = /\b(unsubscribe|newsletter|marketing blast|noreply@|no-reply@)\b/i;
const ACTIVE_CLIENT_RE = /\b(event tomorrow|day-of|run of show|load-?in|on site)\b/i;

function text(value, max = 500) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

/**
 * @param {{ subject?: string, snippet?: string, from?: string, labels?: string[] }} message
 * @param {{ eventId?: string, eventName?: string, status?: string } | null} linkedEvent
 */
export function extractOperationalSignals(message = {}, linkedEvent = null) {
  const blob = `${message.subject || ''} ${message.snippet || ''} ${message.from || ''}`;
  const signals = [];

  if (VENDOR_RE.test(blob)) {
    signals.push({
      kind: 'vendor_financial_commitment',
      label: 'LVPT/03-Vendors-Staff',
      summary: 'Vendor/venue financial commitment signal'
    });
  }
  if (PAYMENT_RE.test(blob)) {
    signals.push({
      kind: 'payment_receipt',
      label: 'LVPT/04-Billing-Receipts',
      summary: 'Payment/receipt acknowledgment signal'
    });
  }
  if (TASK_EVIDENCE_RE.test(blob)) {
    signals.push({
      kind: 'task_completion_evidence',
      label: linkedEvent ? 'LVPT/01-Active-Events' : 'LVPT/05-Needs-Review',
      summary: 'Task-completion evidence signal'
    });
  }
  if (LEAD_RE.test(blob) && !linkedEvent) {
    signals.push({
      kind: 'lead_pipeline',
      label: 'LVPT/02-Leads-Pipeline',
      summary: 'New lead / pipeline inquiry signal'
    });
  }
  if (ACTIVE_CLIENT_RE.test(blob) && linkedEvent) {
    signals.push({
      kind: 'active_event_ops',
      label: 'LVPT/01-Active-Events',
      summary: 'Active event operations signal'
    });
  }
  if (!signals.length) {
    signals.push({
      kind: 'unclassified',
      label: 'LVPT/05-Needs-Review',
      summary: 'No confident operational match'
    });
  }
  return signals;
}

/**
 * Choose primary LVPT label + whether Inbox may be archived (never deleted).
 */
export function routeThreadLabels(message = {}, linkedEvent = null, signals = null) {
  const extracted = Array.isArray(signals) ? signals : extractOperationalSignals(message, linkedEvent);
  const blob = `${message.subject || ''} ${message.snippet || ''} ${message.from || ''}`;
  const primary = extracted[0] || { kind: 'unclassified', label: 'LVPT/05-Needs-Review' };
  const unreadClient = Boolean(message.unread) && Boolean(linkedEvent) && !NOISE_RE.test(blob);
  const needsReview = primary.label === 'LVPT/05-Needs-Review' || primary.kind === 'unclassified';
  const clearlyProcessed = NOISE_RE.test(blob) || primary.kind === 'payment_receipt' || primary.kind === 'task_completion_evidence';
  const archiveInbox = clearlyProcessed && !needsReview && !unreadClient;

  return {
    primaryLabel: primary.label,
    signals: extracted,
    archiveInbox,
    keepInInbox: !archiveInbox,
    neverDelete: true,
    neverSend: true,
    linkedEventId: linkedEvent && linkedEvent.eventId ? String(linkedEvent.eventId) : ''
  };
}

export function buildAutomationInboxRow(message = {}, routing = {}, options = {}) {
  return {
    detected_at: options.now || new Date().toISOString(),
    thread_id: text(message.threadId, 120),
    message_id: text(message.messageId, 120),
    event_id: text(routing.linkedEventId, 120),
    subject: text(message.subject, 200),
    snippet: text(message.snippet, 280),
    signal_kinds: (routing.signals || []).map((row) => row.kind).join(','),
    primary_label: text(routing.primaryLabel, 80),
    archive_inbox: routing.archiveInbox === true,
    dry_run: options.dryRun !== false,
    source: 'GmailAutoTriage'
  };
}

export function planTriagePass(threads = [], events = [], options = {}) {
  const opts = { ...DEFAULT_TRIAGE_OPTIONS, ...options };
  const eventIndex = new Map();
  (Array.isArray(events) ? events : []).forEach((event) => {
    const id = text(event && (event.eventId || event.id), 120);
    if (id) eventIndex.set(id.toLowerCase(), event);
    const company = text(event && event.company, 120).toLowerCase();
    if (company) eventIndex.set(`company:${company}`, event);
  });

  const planned = [];
  const list = (Array.isArray(threads) ? threads : []).slice(0, opts.maxThreads);
  list.forEach((thread) => {
    const subject = text(thread.subject, 200).toLowerCase();
    let linked = null;
    if (thread.eventId && eventIndex.has(String(thread.eventId).toLowerCase())) {
      linked = eventIndex.get(String(thread.eventId).toLowerCase());
    } else {
      for (const event of Array.isArray(events) ? events : []) {
        const company = text(event.company, 120).toLowerCase();
        const name = text(event.eventName, 120).toLowerCase();
        if ((company && subject.includes(company)) || (name && subject.includes(name))) {
          linked = event;
          break;
        }
      }
    }
    const linkedEvent = linked
      ? { eventId: linked.eventId || linked.id, eventName: linked.eventName, status: linked.status }
      : null;
    const signals = extractOperationalSignals(thread, linkedEvent);
    const routing = routeThreadLabels(thread, linkedEvent, signals);
    planned.push({
      threadId: text(thread.threadId, 120),
      messageId: text(thread.messageId, 120),
      routing,
      automationRow: buildAutomationInboxRow(thread, routing, opts),
      mutations: opts.dryRun
        ? []
        : [
            { type: 'ensure_label', label: routing.primaryLabel },
            ...(routing.archiveInbox ? [{ type: 'remove_inbox_label' }] : [])
          ]
    });
  });

  return {
    ok: true,
    dryRun: opts.dryRun !== false,
    mailbox: opts.mailbox,
    neverDelete: true,
    neverSend: true,
    labelsRequired: [...LVPT_GMAIL_LABELS],
    planned,
    examined: planned.length
  };
}
