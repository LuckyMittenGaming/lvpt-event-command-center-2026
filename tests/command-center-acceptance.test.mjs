import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { buildActionInbox, openTasks, prepareDraft } from '../lib/action-inbox.mjs';
import { classifyGmailHeaderRead, classifyStoredCollection } from '../lib/source-reliability.mjs';

const require = createRequire(import.meta.url);
const { buildLedger, sourceStatus } = require('../public/v2/js/event-finance.js');

const today = '2026-11-22';
const lead = buildActionInbox({
  today,
  events: [
    {
      id: 'evt-acceptance',
      status: 'New Lead',
      eventName: 'Synthetic Acceptance',
      leadSource: 'Referral',
      contactName: 'Synthetic Guest',
      contactEmail: 'synthetic.guest@example.test',
      company: 'Synthetic Co',
      eventDate: '2026-12-01',
      guestCount: 12,
      eventType: 'Corporate Poker Training',
      setup: { budgetRange: '5000' },
      venue: 'Synthetic Room',
      proposalUrl: 'https://example.test/proposal',
      emailActivity: [{ threadId: 'mail-accept', date: '2026-11-21T15:00:00.000Z', direction: 'received', snippet: 'Can you send a proposal?' }]
    },
    {
      id: 'evt-acceptance',
      status: 'New Lead',
      eventName: 'Synthetic Acceptance',
      leadSource: 'Referral'
    },
    {
      id: 'evt-conflict',
      status: 'Booked',
      eventName: 'Synthetic Conflict'
    },
    {
      id: 'evt-conflict',
      status: 'Declined',
      eventName: 'Synthetic Conflict'
    }
  ],
  tasks: [
    { id: 'task-owned', eventId: 'evt-acceptance', title: 'Send proposal', owner: 'Synthetic Owner', dueDate: '2026-11-21', status: 'Open' },
    { id: 'task-owned', eventId: 'evt-acceptance', title: 'Send proposal', owner: 'Synthetic Owner', dueDate: '2026-11-21', status: 'Open' },
    { id: 'task-split', eventId: 'evt-acceptance', title: 'Confirm date', owner: 'Synthetic Owner', dueDate: '2026-11-20', status: 'Open' },
    { id: 'task-split', eventId: 'evt-acceptance', title: 'Confirm date', owner: 'Synthetic Owner', dueDate: '2026-11-20', status: 'Completed' }
  ],
  smsThreads: [
    { threadKey: 'sms-old', match: 'exact', eventId: 'evt-acceptance', newestAt: '2026-11-18T00:00:00.000Z', newestDirection: 'incoming', incoming: 4, outgoing: 0 },
    { threadKey: 'sms-new', match: 'exact', eventId: 'evt-acceptance', newestAt: '2026-11-22T00:00:00.000Z', newestDirection: 'outgoing', incoming: 4, outgoing: 1 }
  ]
});

assert.equal(lead.pipeline.denominator, 1);
assert.deepEqual(lead.pipeline.duplicateEventsCountedOnce, ['evt-acceptance']);
assert.deepEqual(lead.pipeline.excluded.eventConflicts, ['evt-conflict']);
assert.equal(lead.records.filter((row) => row.eventId === 'evt-acceptance').length, 1);
const event = lead.records.find((row) => row.eventId === 'evt-acceptance');
assert.equal(event.pipelineStage, 'open');
assert.equal(event.acquisitionKind, 'referral');
assert.equal(event.channel, 'SMS');
assert.equal(event.activityDirection, 'outbound');
assert.notEqual(event.bucket, 'awaiting_response');
assert.equal(event.proposalLink, 'https://example.test/proposal');
assert.equal(lead.sendEnabled, false);
assert.equal(lead.writesPerformed, false);
const tasks = openTasks([
  { id: 'task-owned', eventId: 'evt-acceptance', title: 'Send proposal', owner: 'Synthetic Owner', dueDate: '2026-11-21', status: 'Open' },
  { id: 'task-owned', eventId: 'evt-acceptance', title: 'Send proposal', owner: 'Synthetic Owner', dueDate: '2026-11-21', status: 'Open' },
  { id: 'task-split', eventId: 'evt-acceptance', title: 'Confirm date', owner: 'Synthetic Owner', dueDate: '2026-11-20', status: 'Open' },
  { id: 'task-split', eventId: 'evt-acceptance', title: 'Confirm date', owner: 'Synthetic Owner', dueDate: '2026-11-20', status: 'Completed' }
]);
assert.equal(tasks.rows.filter((row) => row.id === 'task-owned').length, 1);
assert.equal(tasks.rows[0].owner, 'Synthetic Owner');
assert.deepEqual(tasks.conflicts, ['task-split']);
assert.equal(lead.pipeline.taskConflicts.includes('task-split'), true);
assert.equal(lead.pipeline.overdueFollowUps, 1);
const draft = prepareDraft(event);
assert.equal(draft.recipient, 'synthetic.guest@example.test');
assert.equal(draft.recipientRecorded, true);
assert.equal(draft.recipientVerified, false);
assert.equal(draft.readyToApprove, false);
assert.equal(draft.readyToSend, false);
assert.equal(draft.sent, false);
assert.equal(draft.sendEnabled, false);
assert.equal(lead.counts.readyForApproval, 0);

const report = buildLedger({
  expensesComplete: true,
  taxEstablished: true,
  payments: [
    { paymentId: 'inv-a', eventId: 'evt-acceptance', ledgerRole: 'client_receivable', invoiceTotal: 1000, amountPaid: 1000, balanceDue: 0, paymentStatus: 'Paid In Full' },
    { paymentId: 'inv-b', eventId: 'evt-acceptance', ledgerRole: 'client_receivable', invoiceTotal: 500, amountPaid: 0, balanceDue: 500, paymentStatus: 'Invoice Sent' },
    { paymentId: 'vendor-bill', eventId: 'evt-acceptance', lineLabel: 'Elevated vendor', invoiceTotal: 200, amountPaid: 0, balanceDue: 200, paymentStatus: 'Invoice Sent' }
  ],
  payouts: [
    { payoutId: 'po-vendor', eventId: 'evt-acceptance', payoutType: 'Vendor', amount: 80, status: 'Planned' },
    { payoutId: 'po-owner', eventId: 'evt-acceptance', payoutType: 'Owner distribution', amount: 300, status: 'Planned' }
  ]
});
assert.equal(report.counts.clientInvoices, 2);
assert.equal(report.counts.vendorBills, 1);
assert.equal(report.money.verifiedClientReceiptsCents, 100000);
assert.equal(report.money.forecastMarginCents, 122000);
assert.notEqual(report.money.forecastMarginCents, 150000);
assert.notEqual(report.money.forecastMarginCents, 92000);
assert.equal(report.money.drawableCashCents, null);
assert.equal(report.money.verifiedContributionCents, null);
assert.notEqual(report.money.verifiedClientReceiptsCents, report.money.drawableCashCents);
assert.equal(report.money.ownerPlannedCents, 30000);
assert.equal(report.money.coverage, 'complete');
assert.equal(report.payments.every((row) => row.bankVerified === false), true);

const failed = buildLedger({
  expensesComplete: true,
  taxEstablished: true,
  payments: [
    { paymentId: 'inv-a', eventId: 'evt-acceptance', ledgerRole: 'client_receivable', invoiceTotal: 1000, amountPaid: 1000, balanceDue: 0, paymentStatus: 'Paid In Full' },
    { eventId: 'evt-acceptance', ledgerRole: 'client_receivable', invoiceTotal: 50, amountPaid: 50, balanceDue: 0, paymentStatus: 'Paid In Full' },
    { paymentId: 'pay-clash', eventId: 'evt-acceptance', ledgerRole: 'client_receivable', invoiceTotal: 10, amountPaid: 10, balanceDue: 0, paymentStatus: 'Paid In Full' },
    { paymentId: 'pay-clash', eventId: 'evt-acceptance', ledgerRole: 'client_receivable', invoiceTotal: 25, amountPaid: 25, balanceDue: 0, paymentStatus: 'Paid In Full' }
  ],
  payouts: [
    { payoutId: 'po-wrong', eventId: 'evt-acceptance', payoutType: 'Vendor', amount: 40, status: 'Planned', linkedPaymentId: 'inv-a' },
    { eventId: 'evt-acceptance', payoutType: 'Vendor', amount: 15, status: 'Planned' }
  ]
});
assert.equal(failed.counts.missingPaymentIds, 1);
assert.equal(failed.counts.missingPayoutIds, 1);
assert.equal(failed.payments.find((row) => !row.paymentId).includedInTotals, false);
assert.equal(failed.payouts.find((row) => row.payoutId === 'po-wrong').duplicatesPayment, false);
assert.equal(failed.payouts.find((row) => row.payoutId === 'po-wrong').linkUnresolved, true);
assert.equal(failed.money.verifiedClientReceiptsCents, null);
assert.equal(failed.money.coverage, 'incomplete');
assert.equal(failed.money.forecastMarginCents, null);
assert.equal(failed.money.drawableCashCents, null);
assert.match(failed.money.incompleteReason, /incomplete/);

const gmail = classifyGmailHeaderRead({ requested: 2, reads: [{ ok: false }, { ok: true, threads: [], providerPartial: true }] });
assert.equal(gmail.coverage, 'partial');
assert.equal(gmail.metadataOnly, true);
assert.equal(gmail.fullThreadAccess, false);
const gmailDown = classifyGmailHeaderRead({ requested: 1, reads: [{ ok: false }] });
assert.equal(gmailDown.coverage, 'unavailable');
const sms = classifyStoredCollection({ storeReached: true, rowCount: 3, newestImportAt: '2026-11-22T00:00:00.000Z', newestMessageAt: '2026-11-18T00:00:00.000Z', now: '2026-11-22T12:00:00.000Z' });
assert.equal(sms.heartbeatVerified, false);
assert.notEqual(sms.heartbeatStatus, 'LIVE');
assert.equal(sourceStatus({ observable: false, connected: true, lastSuccess: '2026-11-22T12:00:00.000Z' }), 'NOT OBSERVABLE');

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const html = read('public/v2/index.html');
const nav = read('public/v2/js/lifecycle-command-center.js');
const lifecycleCss = read('public/v2/lifecycle-command-center.css');
const hubCss = read('public/v2/unified-hub.css');
const polish = read('public/v2/responsive-polish.css');
const hub = read('public/v2/js/unified-hub.js');
const picture = read('app/api/sync/operating-picture/route.ts');
const inboxRoute = read('app/api/sync/action-inbox/route.ts');
const pictureGet = picture.slice(picture.indexOf('export async function GET'));
assert.match(html, /name="viewport" content="width=device-width, initial-scale=1"/);
assert.match(nav, /Cost coverage/);
assert.match(nav, /Cost not recorded/);
assert.match(nav, /Missing cost is not zero/);
assert.match(nav, /A margin figure appears only when coverage is complete/);
assert.match(nav, /A budget is not a target/);
assert.match(nav, /Not added to priced line items/);
assert.equal(nav.includes('Projected Profit'), false);
assert.equal(nav.includes('Quote profit'), false);
const documentsJs = read('public/v2/js/documents.js');
const reportsJs = read('public/v2/js/reports.js');
assert.match(documentsJs, /function validateDocumentSourceUrl/);
assert.match(documentsJs, /function resolveDocumentSourceUrl/);
assert.match(documentsJs, /function documentMutationsEnabled\(\)\{\s*return false;/);
assert.match(documentsJs, /formatDocumentAssociationHtml/);
assert.match(documentsJs, /Unsupported or invalid source link/);
assert.equal(documentsJs.includes('chooseDocumentsBtn'), false);
assert.equal(documentsJs.includes('data-delete-doc'), false);
assert.match(reportsJs, /Another event was not substituted/);
assert.match(reportsJs, /formatDocumentAssociationText/);
assert.match(nav, /formatDocumentAssociationHtml/);
assert.match(nav, /data-print-record/);
assert.match(nav, /data-generate-report="pre"/);
assert.match(nav, /Another event was not substituted/);
assert.match(nav, /\['overview','Overview'\]/);
assert.match(nav, /data-command-view="\$\{view\}"/);
assert.match(nav, /popstate/);
assert.match(nav, /scrollRestoration/);
assert.match(nav, /history\.back/);
assert.match(nav, /data-back-list/);
assert.match(nav, /data-close-task/);
assert.match(nav, /View associated event/);
assert.match(hub, /lvptRememberActionView/);
assert.match(hub, /actionUi\.filter/);
assert.match(hub, /actionUi\.query/);
assert.match(hub, /actionUi\.scroll/);
for (const label of ['Overview', 'Action Required', 'Pipeline', 'Active Events', 'Past Events', 'Proposals', 'Client Follow-Up', 'Event Finance', 'Communications', 'Source Health']) {
  assert.match(nav, new RegExp(label));
}
for (const viewId of ['overview', 'action', 'pipeline', 'active', 'archive', 'proposals', 'followup', 'finance', 'communications', 'health']) {
  assert.match(nav, new RegExp(`\\['${viewId}',`));
}
assert.match(lifecycleCss, /\.command-nav\{display:flex;[^}]*overflow-x:auto/);
assert.match(lifecycleCss, /@media\(max-width:1120px\)/);
assert.match(lifecycleCss, /@media\(max-width:720px\)/);
assert.match(lifecycleCss, /@media\(max-width:320px\)/);
assert.match(hubCss, /@media\(max-width:720px\)/);
assert.match(polish, /overflow-x:hidden/);
assert.match(polish, /@media\(max-width:280px\)/);
assert.match(hub, /Forecast margin/);
assert.match(hub, /Incomplete/);
assert.match(hub, /\/sms-review\/index\.html#inboxReviewTitle/);
assert.equal(hub.includes('data-decision="approve"'), false);
assert.match(inboxRoute, /owner: text\(task\.owner/);
assert.ok(pictureGet.indexOf('denyPrivateRead') < pictureGet.indexOf('appsScriptRequest'));
const eventsRoute = read('app/api/sync/events/route.ts');
const eventsGet = eventsRoute.slice(eventsRoute.indexOf('export async function GET'));
assert.ok(eventsGet.indexOf('denyPrivateRead') < eventsGet.indexOf('appsScriptRequest'));
assert.ok(eventsGet.indexOf('export async function POST') === -1 || eventsRoute.slice(eventsRoute.indexOf('export async function POST')).includes('authorizeAppRequest'));
const conversations = read('app/api/sms/staging/conversations/route.ts');
const conversationsGet = conversations.slice(conversations.indexOf('export async function GET'));
assert.ok(conversationsGet.indexOf('denyPrivateRead') < conversationsGet.indexOf('messageMeta'));
assert.ok(conversationsGet.indexOf('denyPrivateRead') < conversationsGet.indexOf('appsScriptRequest'));
assert.ok(pictureGet.indexOf('collapseDuplicateIds') < pictureGet.indexOf('closed('));
assert.match(picture, /The hourly schedule is configuration, not proof that runLVPTSafeTaskSync ran/);
assert.match(read('app/api/gmail/send/route.ts'), /403/);
assert.match(read('app/api/sms/staging/reply-send/route.ts'), /staging_only_no_production_send/);
const checklist = read('docs/command-center-staging-acceptance.md');
assert.match(checklist, /COMMAND_CENTER_BROWSER_REGRESSION_READY/);
assert.match(checklist, /Hold production/);
assert.match(checklist, /Owner-only checks/);
assert.match(checklist, /Rollback/);

console.log('Command Center integrated acceptance regression passed.');
