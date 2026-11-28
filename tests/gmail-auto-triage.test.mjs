import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LVPT_GMAIL_LABELS,
  DEFAULT_TRIAGE_OPTIONS,
  extractOperationalSignals,
  routeThreadLabels,
  planTriagePass,
  buildAutomationInboxRow
} from '../lib/gmail-auto-triage.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const gs = readFileSync(join(root, 'apps-script/GmailAutoTriage.gs'), 'utf8');

assert.equal(DEFAULT_TRIAGE_OPTIONS.dryRun, true);
assert.equal(LVPT_GMAIL_LABELS.length, 6);
assert.ok(LVPT_GMAIL_LABELS.includes('LVPT/05-Needs-Review'));

assert.match(gs, /dryRun !== false/);
assert.match(gs, /setupHourlyGmailTriageTrigger/);
assert.match(gs, /NEVER deletes emails|Never trash|never delete/i);
assert.match(gs, /NEVER sends emails|neverSend/i);
assert.doesNotMatch(gs, /GmailApp\.sendEmail|MailApp\.sendEmail/);
assert.doesNotMatch(gs, /\.moveToTrash\(|\.deleteThread\(|setTrashed\(true\)/);
assert.match(gs, /LVPT\/01-Active-Events/);
assert.match(gs, /LVPT\/06-Archive-Completed/);
assert.match(gs, /Automation Inbox/);
assert.match(gs, /Gmail Activity/);

const vendorSignals = extractOperationalSignals({
  subject: 'Poker room fee invoice',
  snippet: 'Venue fee and bar tab settlement for Saturday',
  from: 'billing@venuetest.example'
});
assert.ok(vendorSignals.some((row) => row.kind === 'vendor_financial_commitment'));
assert.equal(vendorSignals[0].label, 'LVPT/03-Vendors-Staff');

const paymentSignals = extractOperationalSignals({
  subject: 'Zelle payment received',
  snippet: 'Paid in full via QuickBooks receipt',
  from: 'payments@client.example'
});
assert.ok(paymentSignals.some((row) => row.kind === 'payment_receipt'));
assert.equal(paymentSignals[0].label, 'LVPT/04-Billing-Receipts');

const taskSignals = extractOperationalSignals({
  subject: 'COI attached',
  snippet: 'Uploaded W-9 and confirmed staff for the event',
  from: 'ops@partner.example'
}, { eventId: 'evt-1', eventName: 'Demo' });
assert.ok(taskSignals.some((row) => row.kind === 'task_completion_evidence'));

const leadSignals = extractOperationalSignals({
  subject: 'Interested in poker training',
  snippet: 'Looking for a poker event quote next month',
  from: 'lead@example.com'
});
assert.ok(leadSignals.some((row) => row.kind === 'lead_pipeline'));

const routing = routeThreadLabels({
  subject: 'Newsletter blast',
  snippet: 'Unsubscribe here',
  from: 'noreply@marketing.example',
  unread: false
}, null);
assert.equal(routing.neverDelete, true);
assert.equal(routing.neverSend, true);

const needsReview = routeThreadLabels({
  subject: 'Random question',
  snippet: 'Can you help?',
  from: 'person@example.com',
  unread: true
}, { eventId: 'evt-1' });
assert.equal(needsReview.primaryLabel, 'LVPT/05-Needs-Review');
assert.equal(needsReview.keepInInbox, true);

const plan = planTriagePass([
  {
    threadId: 't1',
    messageId: 'm1',
    subject: 'Acme Corp poker room fee',
    snippet: 'Instructor fee invoice attached',
    from: 'vendor@example.com'
  },
  {
    threadId: 't2',
    messageId: 'm2',
    subject: 'Zelle paid in full',
    snippet: 'Payment received receipt',
    from: 'pay@example.com'
  }
], [{ id: 'evt-acme', company: 'Acme Corp', eventName: 'Acme Night' }], { dryRun: true });

assert.equal(plan.ok, true);
assert.equal(plan.dryRun, true);
assert.equal(plan.neverDelete, true);
assert.equal(plan.neverSend, true);
assert.equal(plan.examined, 2);
assert.equal(plan.planned[0].routing.linkedEventId, 'evt-acme');
assert.equal(plan.planned[0].mutations.length, 0, 'dry-run must not queue mutations');

const livePlan = planTriagePass([{
  threadId: 't3',
  messageId: 'm3',
  subject: 'Noise newsletter',
  snippet: 'Unsubscribe please',
  from: 'noreply@ads.example'
}], [], { dryRun: false });
assert.ok(livePlan.planned[0].mutations.some((row) => row.type === 'ensure_label'));

const row = buildAutomationInboxRow({
  threadId: 't1',
  messageId: 'm1',
  subject: 'Test',
  snippet: 'Snippet'
}, {
  linkedEventId: 'evt-1',
  primaryLabel: 'LVPT/04-Billing-Receipts',
  archiveInbox: true,
  signals: [{ kind: 'payment_receipt' }]
}, { dryRun: true, now: '2026-11-27T18:00:00.000Z' });
assert.equal(row.dry_run, true);
assert.equal(row.source, 'GmailAutoTriage');
assert.equal(row.primary_label, 'LVPT/04-Billing-Receipts');

console.log('gmail-auto-triage.test.mjs: ok');
