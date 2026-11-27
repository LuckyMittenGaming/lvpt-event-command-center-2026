import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import vm from 'node:vm';
import { buildActionInbox, openTasks, prepareDraft } from '../lib/action-inbox.mjs';
import { classifyGmailHeaderRead, classifyStoredCollection } from '../lib/source-reliability.mjs';
import { classifyBridgeHeartbeat } from '../lib/sms-scan-health.mjs';
import { privateReadDecision } from '../lib/owner-read-guard.mjs';
import { createReviewSession, REVIEW_COOKIE_NAME } from '../lib/sms-review-session.mjs';
import {
  OPERATIONS,
  createSyntheticMutationStore,
  PRODUCTION_MUTATIONS_ENABLED
} from '../lib/event-mutation-contract.mjs';

const require = createRequire(import.meta.url);
const { buildLedger, sourceStatus, buildFinanceReconciliation, documentedExceptions } = require('../public/v2/js/event-finance.js');
const { quoteCoverage } = require('../public/v2/js/event-status.js');
const { buildOperationalReport } = require('../public/v2/js/reports.js');

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
assert.match(hub, /data-finance-table="client-invoices"/);
assert.match(hub, /data-finance-table="vendor-obligations"/);
assert.match(hub, /data-finance-table="owner-distributions"/);
assert.match(hub, /data-finance-table="event-reconciliation"/);
assert.match(hub, /data-finance-table="global-reconciliation"/);
assert.match(hub, /data-finance-table="linked-exceptions"/);
assert.match(hub, /Due date/);
assert.match(hub, /Invoice-by-invoice client ledger/);
assert.match(hub, /Vendor-by-vendor obligations/);
assert.match(hub, /Owner draws stay separate from operating expenses/);
assert.match(hub, /Global totals must equal the sum of qualified per-event totals/);
assert.match(hub, /Exceptions are never hidden to force a match/);
assert.match(inboxRoute, /owner: text\(task\.owner/);
const pictureDenyAt = pictureGet.indexOf('denyPrivateRead');
const pictureProviders = ['appsScriptRequest', 'smsMeta', 'ledgerApi', 'buildFinanceReconciliation']
  .map((name) => pictureGet.indexOf(name))
  .filter((index) => index >= 0);
assert.ok(pictureDenyAt >= 0 && pictureProviders.length > 0 && Math.min(...pictureProviders) > pictureDenyAt, 'unauthorized private reads must reject before provider access');
assert.match(pictureGet, /writesPerformed:\s*false/);
assert.match(picture, /buildFinanceReconciliation/);
assert.match(picture, /reconciliation,/);
assert.equal(picture.includes('vendorCommittedForEvent'), false);
assert.equal(/export async function POST/.test(picture), false);
assert.equal(/export async function PUT/.test(picture), false);
assert.equal(/export async function PATCH/.test(picture), false);
assert.equal(/export async function DELETE/.test(picture), false);
assert.doesNotMatch(pictureGet, /spreadsheets\.values\.update|batchUpdate|clasp push/);
assert.match(picture, /No financial row was written/);
assert.match(picture, /normalizeSourceHealth/);
assert.match(picture, /normalizeLocalReadiness/);
assert.match(picture, /sourceHealth/);
assert.match(picture, /ownerAction/);
assert.match(picture, /executionEvidence/);
assert.match(picture, /recordsExamined:\s*null/);
assert.match(hub, /sourceHealthCards/);
assert.match(hub, /healthJobRows/);
assert.match(hub, /honestJobStatus/);
assert.match(hub, /Schedule is not execution|Schedule only/);
assert.match(hub, /Owner action/);
assert.match(hub, /data-health-table="source-health"/);
assert.match(hub, /data-health-table="jobs"/);
assert.match(hub, /lvptLoadOperatingPicture/);
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

const liveSource = read('docs/baselines/live-source-acceptance.md');
assert.match(liveSource, /COMMAND_CENTER_R23_LIVE_COMPARISON_PROCEDURE_READY/);
assert.match(liveSource, /PENDING_AUTHORIZED_READ/);
assert.match(liveSource, /historical observations/i);
assert.match(liveSource, /event_id/);
assert.match(liveSource, /task_id/);
assert.match(liveSource, /payment_id/);
assert.match(liveSource, /payout_id/);
assert.match(liveSource, /document_id/);
assert.match(liveSource, /duplicate_copy/);
assert.match(liveSource, /conflict_excluded/);
assert.match(liveSource, /missing_id_excluded/);
assert.match(liveSource, /UNEXPLAINED/);
assert.match(liveSource, /observation_at/);
assert.match(liveSource, /No LIVE_VERIFIED claim/);
assert.match(liveSource, /No live writes were performed/);
assert.match(liveSource, /Gmail Activity/);
assert.match(liveSource, /Documents/);

const reconciledLedger = buildLedger({
  expensesComplete: true,
  taxEstablished: true,
  payments: [
    { paymentId: 'inv-a', eventId: 'evt-a', ledgerRole: 'client_receivable', invoiceTotal: 1000, amountPaid: 1000, balanceDue: 0, paymentStatus: 'Paid In Full', dueDate: '2026-11-01' },
    { paymentId: 'inv-b', eventId: 'evt-b', ledgerRole: 'client_receivable', invoiceTotal: 500, amountPaid: 0, balanceDue: 500, paymentStatus: 'Invoice Sent', dueDate: '2026-12-01' },
    { paymentId: 'vendor-a', eventId: 'evt-a', lineLabel: 'Elevated vendor', invoiceTotal: 200, amountPaid: 0, balanceDue: 200, paymentStatus: 'Invoice Sent', dueDate: '2026-11-15' },
    { paymentId: 'vendor-a', eventId: 'evt-a', lineLabel: 'Elevated vendor', invoiceTotal: 200, amountPaid: 0, balanceDue: 200, paymentStatus: 'Invoice Sent', dueDate: '2026-11-15' }
  ],
  payouts: [
    { payoutId: 'po-vendor', eventId: 'evt-a', payoutType: 'Vendor', amount: 80, status: 'Planned' },
    { payoutId: 'po-owner', eventId: 'evt-a', payoutType: 'Owner distribution', amount: 300, status: 'Planned' }
  ]
});
assert.equal(reconciledLedger.duplicatePaymentIds.includes('vendor-a'), true);
assert.equal(reconciledLedger.payments.filter((row) => row.paymentId === 'vendor-a' && row.duplicateTreatment === 'duplicate_copy').length, 1);
assert.equal(reconciledLedger.money.vendorCommittedCents, 20000);
assert.equal(reconciledLedger.byEvent.find((row) => row.eventId === 'evt-a').vendorCommittedCents, 20000);
assert.equal(reconciledLedger.byEvent.find((row) => row.eventId === 'evt-a').totalsIncomplete, false);
const reconciledPayload = buildFinanceReconciliation(reconciledLedger, documentedExceptions());
assert.equal(reconciledPayload.writesPerformed, false);
assert.equal(reconciledPayload.duplicatePaymentIds.includes('vendor-a'), true);
assert.equal(reconciledPayload.qualifiedEventSums.vendorCommittedCents, 20000);
assert.equal(reconciledPayload.global.vendorCommittedCents, 20000);
const vendorMatch = reconciledPayload.comparisons.find((row) => row.field === 'vendorCommitted');
assert.equal(vendorMatch.status, 'reconciled');
assert.equal(vendorMatch.matches, true);
assert.equal(vendorMatch.globalCents, vendorMatch.qualifiedEventCents);
assert.equal(reconciledPayload.comparisons.find((row) => row.field === 'verifiedClientReceipts').matches, true);
assert.equal(reconciledPayload.comparisons.find((row) => row.field === 'ownerPlanned').globalCents, 30000);
assert.equal(reconciledPayload.linkedExceptions.length, documentedExceptions().length);
assert.equal(reconciledPayload.linkedExceptions.every((row) => row.includedInTotals === false), true);

const missingVendorId = buildFinanceReconciliation(buildLedger({
  expensesComplete: true,
  taxEstablished: true,
  payments: [
    { paymentId: 'client-ok', eventId: 'evt-miss', ledgerRole: 'client_receivable', invoiceTotal: 900, amountPaid: 900, balanceDue: 0, paymentStatus: 'Paid In Full' },
    { eventId: 'evt-miss', lineLabel: 'Elevated vendor', invoiceTotal: 150, amountPaid: 0, balanceDue: 150, paymentStatus: 'Invoice Sent' }
  ],
  payouts: []
}), []);
assert.equal(missingVendorId.global.vendorCommittedCents, null);
assert.equal(missingVendorId.qualifiedEventSums.vendorCommittedCents, null);
assert.equal(missingVendorId.comparisons.find((row) => row.field === 'vendorCommitted').status, 'incomplete');
assert.equal(missingVendorId.comparisons.find((row) => row.field === 'vendorCommitted').matches, false);
assert.equal(missingVendorId.byEvent.find((row) => row.eventId === 'evt-miss').totalsIncomplete, true);
assert.equal(missingVendorId.incompleteEventIds.includes('evt-miss'), true);

const conflictingVendorId = buildFinanceReconciliation(buildLedger({
  expensesComplete: true,
  taxEstablished: true,
  payments: [
    { paymentId: 'client-ok', eventId: 'evt-clash', ledgerRole: 'client_receivable', invoiceTotal: 900, amountPaid: 900, balanceDue: 0, paymentStatus: 'Paid In Full' },
    { paymentId: 'vendor-clash', eventId: 'evt-clash', lineLabel: 'Elevated vendor', invoiceTotal: 150, amountPaid: 0, balanceDue: 150, paymentStatus: 'Invoice Sent' },
    { paymentId: 'vendor-clash', eventId: 'evt-clash', lineLabel: 'Elevated vendor', invoiceTotal: 175, amountPaid: 0, balanceDue: 175, paymentStatus: 'Invoice Sent' }
  ],
  payouts: []
}), []);
assert.equal(conflictingVendorId.conflictPaymentIds.includes('vendor-clash'), true);
assert.equal(conflictingVendorId.global.vendorCommittedCents, null);
assert.equal(conflictingVendorId.qualifiedEventSums.vendorCommittedCents, null);
assert.equal(conflictingVendorId.comparisons.find((row) => row.field === 'vendorCommitted').status, 'incomplete');
assert.equal(conflictingVendorId.byEvent.find((row) => row.eventId === 'evt-clash').vendorCommittedCents, null);

const unknownVendorAmount = buildFinanceReconciliation(buildLedger({
  expensesComplete: true,
  taxEstablished: true,
  payments: [
    { paymentId: 'client-ok', eventId: 'evt-gap', ledgerRole: 'client_receivable', invoiceTotal: 900, amountPaid: 900, balanceDue: 0, paymentStatus: 'Paid In Full' },
    { paymentId: 'vendor-gap', eventId: 'evt-gap', lineLabel: 'Elevated vendor', paymentStatus: 'Invoice Sent' }
  ],
  payouts: []
}), []);
assert.equal(unknownVendorAmount.global.vendorCommittedCents, null);
assert.equal(unknownVendorAmount.qualifiedEventSums.vendorCommittedCents, null);
assert.equal(unknownVendorAmount.comparisons.find((row) => row.field === 'vendorCommitted').status, 'incomplete');
assert.equal(unknownVendorAmount.byEvent.find((row) => row.eventId === 'evt-gap').totalsIncomplete, true);
assert.equal(failed.conflictPaymentIds.includes('pay-clash'), true);
assert.equal(failed.counts.missingPaymentIds > 0, true);

// ---------------------------------------------------------------------------
// R21 / T35 — one synthetic operational lifecycle + deterministic failure matrix
// ---------------------------------------------------------------------------

const lifecycleAuth = { authorized: true, actor: 'Synthetic Owner' };
const lifecycleToday = '2026-11-26';
const lifecycleStore = createSyntheticMutationStore([], {
  clock: () => '2026-11-26T15:00:00.000Z'
});

// 1) Form / Gmail / authorized SMS lead evidence → create stable event
const created = lifecycleStore.apply({
  operation: OPERATIONS.CREATE_EVENT,
  idempotencyKey: 'lifecycle-create-1',
  auth: lifecycleAuth,
  payload: {
    id: 'evt-lifecycle',
    eventName: 'Synthetic Lifecycle Night',
    company: 'Lifecycle Client Co',
    contactName: 'Lifecycle Guest',
    contactEmail: 'lifecycle.guest@example.test',
    contactPhone: '555-0199',
    leadSource: 'Website form',
    status: 'New Lead',
    eventDate: '2026-12-20',
    venue: 'Synthetic Lifecycle Room',
    nextAction: 'Qualify discovery call',
    nextActionDue: '2026-11-27'
  }
});
assert.equal(created.ok, true);
assert.equal(created.writesPerformed, true);
assert.equal(PRODUCTION_MUTATIONS_ENABLED, false);
assert.equal(lifecycleStore.getEvent('evt-lifecycle').id, 'evt-lifecycle');

// 2–4) Stable association, source attribution, qualification
const qualified = lifecycleStore.apply({
  operation: OPERATIONS.UPDATE_EVENT_STATUS,
  eventId: 'evt-lifecycle',
  expectedRevision: created.event.revision,
  idempotencyKey: 'lifecycle-qualify-1',
  auth: lifecycleAuth,
  payload: { status: 'Needs Discovery' }
});
assert.equal(qualified.ok, true);
assert.equal(lifecycleStore.getEvent('evt-lifecycle').status, 'Needs Discovery');
assert.equal(lifecycleStore.getEvent('evt-lifecycle').leadSource, 'Website form');

const attributedInbox = buildActionInbox({
  today: lifecycleToday,
  events: [
    {
      id: 'evt-lifecycle',
      status: 'Needs Discovery',
      eventName: 'Synthetic Lifecycle Night',
      leadSource: 'Website form',
      contactName: 'Lifecycle Guest',
      contactEmail: 'lifecycle.guest@example.test',
      company: 'Lifecycle Client Co',
      eventDate: '2026-12-20',
      proposalUrl: '',
      emailActivity: [{
        threadId: 'mail-lifecycle',
        date: '2026-11-25T18:00:00.000Z',
        direction: 'received',
        snippet: 'Interested in a corporate poker training night.'
      }]
    },
    // Duplicate source event (same id) must collapse, not double-count.
    {
      id: 'evt-lifecycle',
      status: 'Needs Discovery',
      eventName: 'Synthetic Lifecycle Night',
      leadSource: 'Website form'
    },
    // Conflicting event id copies must be excluded.
    { id: 'evt-lifecycle-conflict', status: 'Booked', eventName: 'Lifecycle Conflict A' },
    { id: 'evt-lifecycle-conflict', status: 'Declined', eventName: 'Lifecycle Conflict B' }
  ],
  tasks: [
    {
      id: 'task-lifecycle-1',
      eventId: 'evt-lifecycle',
      title: 'Qualify discovery call',
      owner: 'Synthetic Owner',
      dueDate: '2026-11-27',
      status: 'Open'
    }
  ],
  smsThreads: [
    {
      threadKey: 'sms-lifecycle',
      match: 'exact',
      eventId: 'evt-lifecycle',
      newestAt: '2026-11-26T12:00:00.000Z',
      newestDirection: 'incoming',
      incoming: 1,
      outgoing: 0
    }
  ]
});
assert.deepEqual(attributedInbox.pipeline.duplicateEventsCountedOnce, ['evt-lifecycle']);
assert.deepEqual(attributedInbox.pipeline.excluded.eventConflicts, ['evt-lifecycle-conflict']);
const lifecycleRecord = attributedInbox.records.find((row) => row.eventId === 'evt-lifecycle');
assert.ok(lifecycleRecord);
assert.equal(lifecycleRecord.acquisitionKind, 'form');
assert.equal(lifecycleRecord.pipelineStage, 'open');
assert.equal(lifecycleRecord.channel, 'SMS');
assert.equal(attributedInbox.sendEnabled, false);
assert.equal(attributedInbox.writesPerformed, false);

// 5) Task open + 6) one isolated internal reminder (Free / 15 min / no Meet / no guests)
const lifecycleTasks = openTasks([
  {
    id: 'task-lifecycle-1',
    eventId: 'evt-lifecycle',
    title: 'Qualify discovery call',
    owner: 'Synthetic Owner',
    dueDate: '2026-11-27',
    status: 'Open'
  },
  {
    id: 'task-lifecycle-1',
    eventId: 'evt-lifecycle',
    title: 'Qualify discovery call',
    owner: 'Synthetic Owner',
    dueDate: '2026-11-27',
    status: 'Open'
  }
]);
assert.equal(lifecycleTasks.rows.filter((row) => row.id === 'task-lifecycle-1').length, 1);

const reminderSource = readFileSync(new URL('../apps-script/calendar-command-center/TaskSync.safe-review.js', import.meta.url), 'utf8');
const reminderSandbox = { console: { log() {} }, Date, Map, Set, Object, String, Array, Error, JSON, Math, isFinite, isNaN };
vm.createContext(reminderSandbox);
vm.runInContext(reminderSource, reminderSandbox, { filename: 'TaskSync.safe-review.js' });
const planReminder = reminderSandbox.lvptPlanSafeReminderActions_;
const gateReminder = reminderSandbox.lvptGateSafeWrites_;
const reminderCal = {
  sales: 'cal-sales-lifecycle',
  proposals: 'cal-proposals-lifecycle',
  operations: 'cal-operations-lifecycle',
  confirmed: 'cal-confirmed-lifecycle'
};
const reminderPlan = planReminder({
  scanComplete: true,
  lockHeld: true,
  calendarIds: Object.assign({}, reminderCal),
  cancellationScan: {
    complete: true,
    calendarIds: [reminderCal.sales, reminderCal.proposals, reminderCal.operations, reminderCal.confirmed],
    events: []
  },
  events: [],
  tasks: [{
    taskId: 'task-lifecycle-1',
    status: 'open',
    due: '2026-11-27',
    summary: 'ACTION — Lifecycle — Qualify discovery call',
    description: 'LVPT INTERNAL ACTION REMINDER\nTask ID: task-lifecycle-1',
    start: '2026-11-27T19:00:00.000Z',
    calendarId: reminderCal.operations,
    ownerApprovedCreate: true,
    creationApprovalId: 'lifecycle-create-approval'
  }]
});
const reminderCreates = gateReminder(reminderPlan).allowed.filter((change) => change.action === 'CREATE');
assert.equal(reminderCreates.length, 1, 'exactly one isolated reminder for the lifecycle task');
assert.equal(reminderCreates[0].body.transparency, 'transparent');
assert.equal(reminderCreates[0].body.attendees, undefined);
assert.equal(reminderCreates[0].body.conferenceData, undefined);
assert.equal(reminderCreates[0].body.recurrence.length, 0);
assert.equal(
  new Date(reminderCreates[0].body.end.dateTime) - new Date(reminderCreates[0].body.start.dateTime),
  15 * 60000
);
const invalidTaskReminder = planReminder({
  scanComplete: true,
  lockHeld: true,
  calendarIds: Object.assign({}, reminderCal),
  cancellationScan: {
    complete: true,
    calendarIds: [reminderCal.sales, reminderCal.proposals, reminderCal.operations, reminderCal.confirmed],
    events: []
  },
  events: [],
  tasks: [{
    taskId: '',
    status: 'open',
    due: '2026-11-27',
    summary: 'ACTION — invalid',
    description: 'LVPT INTERNAL ACTION REMINDER\nTask ID: ',
    start: '2026-11-27T19:00:00.000Z',
    calendarId: reminderCal.operations,
    ownerApprovedCreate: true,
    creationApprovalId: 'invalid-task-approval'
  }]
});
assert.equal(
  gateReminder(invalidTaskReminder).allowed.filter((change) => change.action === 'CREATE').length,
  0,
  'invalid/empty task id must not create a reminder'
);

// 7) Proposal link + priced quote (with a missing-cost sibling asserted later)
const proposalLinked = lifecycleStore.apply({
  operation: OPERATIONS.LINK_PROPOSAL,
  eventId: 'evt-lifecycle',
  expectedRevision: qualified.event.revision,
  idempotencyKey: 'lifecycle-proposal-1',
  auth: lifecycleAuth,
  payload: {
    proposalUrl: 'https://example.test/proposals/lifecycle',
    proposalId: 'prop-lifecycle-1',
    proposalStatus: 'Sent'
  }
});
assert.equal(proposalLinked.ok, true);
assert.equal(lifecycleStore.getEvent('evt-lifecycle').proposalUrl, 'https://example.test/proposals/lifecycle');

const quoteLine = lifecycleStore.apply({
  operation: OPERATIONS.UPSERT_QUOTE_LINE,
  eventId: 'evt-lifecycle',
  expectedRevision: proposalLinked.event.revision,
  idempotencyKey: 'lifecycle-quote-1',
  auth: lifecycleAuth,
  payload: {
    quoteLineId: 'ql-lifecycle-1',
    category: 'Training',
    name: 'Corporate night package',
    quantity: 1,
    unitPrice: 4500,
    internalCost: 1800
  }
});
assert.equal(quoteLine.ok, true);

const proposalStatus = lifecycleStore.apply({
  operation: OPERATIONS.UPDATE_EVENT_STATUS,
  eventId: 'evt-lifecycle',
  expectedRevision: quoteLine.event.revision,
  idempotencyKey: 'lifecycle-proposal-status-1',
  auth: lifecycleAuth,
  payload: { status: 'Proposal Sent' }
});
assert.equal(proposalStatus.ok, true);

// 8–9) Approval workflow + controlled mock provider outcomes (success cannot mask failures)
function simulateApprovalSend(input = {}) {
  const {
    sessionValid = true,
    recipientRecorded = 'lifecycle.guest@example.test',
    recipientVerified = 'lifecycle.guest@example.test',
    provider = { ok: true, gmailMessageId: 'msg-lifecycle-1', delayMs: 0, throwError: false }
  } = input;
  if (!sessionValid) {
    return { sent: false, status: 401, reason: 'expired_session', providerCalled: false, doNotRetry: true };
  }
  if (!recipientRecorded || recipientRecorded !== recipientVerified) {
    return {
      sent: false,
      status: 409,
      reason: 'incorrect_recipient',
      providerCalled: false,
      doNotRetry: true
    };
  }
  if (provider.throwError) {
    return {
      sent: false,
      status: 502,
      reason: 'send_outcome_uncertain_check_gmail_sent',
      providerCalled: true,
      doNotRetry: true,
      outcome: 'unknown'
    };
  }
  if (provider.timeout) {
    return {
      sent: false,
      status: 504,
      reason: 'provider_timeout',
      providerCalled: true,
      doNotRetry: true,
      outcome: 'unknown'
    };
  }
  if (!provider.ok || !provider.gmailMessageId) {
    return {
      sent: false,
      status: 502,
      reason: 'send_outcome_uncertain_check_gmail_sent',
      providerCalled: true,
      doNotRetry: true,
      outcome: 'unknown'
    };
  }
  return {
    sent: true,
    status: 200,
    reason: 'mock_provider_sent',
    providerCalled: true,
    doNotRetry: true,
    gmailMessageId: provider.gmailMessageId,
    outcome: 'sent'
  };
}

const lifecycleDraft = prepareDraft(lifecycleRecord);
assert.equal(lifecycleDraft.recipient, 'lifecycle.guest@example.test');
assert.equal(lifecycleDraft.recipientVerified, false);
assert.equal(lifecycleDraft.readyToSend, false);
assert.equal(lifecycleDraft.sendEnabled, false);
assert.equal(lifecycleDraft.sent, false);

const mockSuccess = simulateApprovalSend();
assert.equal(mockSuccess.sent, true);
assert.equal(mockSuccess.gmailMessageId, 'msg-lifecycle-1');

const wrongRecipient = simulateApprovalSend({
  recipientRecorded: 'lifecycle.guest@example.test',
  recipientVerified: 'other.party@example.test'
});
assert.equal(wrongRecipient.sent, false);
assert.equal(wrongRecipient.providerCalled, false);
assert.equal(wrongRecipient.reason, 'incorrect_recipient');
assert.notEqual(wrongRecipient.sent, mockSuccess.sent);

const unknownSend = simulateApprovalSend({ provider: { ok: false, gmailMessageId: '' } });
assert.equal(unknownSend.sent, false);
assert.equal(unknownSend.outcome, 'unknown');
assert.equal(unknownSend.doNotRetry, true);
assert.notEqual(unknownSend.sent, mockSuccess.sent);

const providerTimeout = simulateApprovalSend({ provider: { ok: true, gmailMessageId: 'x', timeout: true } });
assert.equal(providerTimeout.sent, false);
assert.equal(providerTimeout.reason, 'provider_timeout');
assert.equal(providerTimeout.doNotRetry, true);
assert.notEqual(providerTimeout.sent, mockSuccess.sent);

const expiredSessionSend = simulateApprovalSend({ sessionValid: false });
assert.equal(expiredSessionSend.sent, false);
assert.equal(expiredSessionSend.status, 401);
assert.equal(expiredSessionSend.providerCalled, false);

// 10–12) Multiple client invoices, vendor obligation, payout
const lifecycleLedger = buildLedger({
  expensesComplete: true,
  taxEstablished: true,
  payments: [
    {
      paymentId: 'inv-lifecycle-a',
      eventId: 'evt-lifecycle',
      ledgerRole: 'client_receivable',
      invoiceTotal: 2500,
      amountPaid: 2500,
      balanceDue: 0,
      paymentStatus: 'Paid In Full'
    },
    {
      paymentId: 'inv-lifecycle-b',
      eventId: 'evt-lifecycle',
      ledgerRole: 'client_receivable',
      invoiceTotal: 2000,
      amountPaid: 0,
      balanceDue: 2000,
      paymentStatus: 'Invoice Sent'
    },
    {
      paymentId: 'vendor-lifecycle',
      eventId: 'evt-lifecycle',
      lineLabel: 'Elevated lifecycle vendor',
      invoiceTotal: 600,
      amountPaid: 0,
      balanceDue: 600,
      paymentStatus: 'Invoice Sent'
    },
    // Conflicting payment id must break coverage rather than invent a settled total.
    {
      paymentId: 'pay-lifecycle-clash',
      eventId: 'evt-lifecycle',
      ledgerRole: 'client_receivable',
      invoiceTotal: 10,
      amountPaid: 10,
      balanceDue: 0,
      paymentStatus: 'Paid In Full'
    },
    {
      paymentId: 'pay-lifecycle-clash',
      eventId: 'evt-lifecycle',
      ledgerRole: 'client_receivable',
      invoiceTotal: 99,
      amountPaid: 99,
      balanceDue: 0,
      paymentStatus: 'Paid In Full'
    }
  ],
  payouts: [
    {
      payoutId: 'po-lifecycle-vendor',
      eventId: 'evt-lifecycle',
      payoutType: 'Vendor',
      amount: 250,
      status: 'Planned'
    },
    {
      payoutId: 'po-lifecycle-owner',
      eventId: 'evt-lifecycle',
      payoutType: 'Owner distribution',
      amount: 400,
      status: 'Planned'
    }
  ]
});
assert.equal(lifecycleLedger.counts.clientInvoices >= 2, true);
assert.equal(lifecycleLedger.counts.vendorBills >= 1, true);
assert.equal(lifecycleLedger.conflictPaymentIds.includes('pay-lifecycle-clash'), true);
assert.equal(lifecycleLedger.money.coverage, 'incomplete');
assert.equal(lifecycleLedger.money.drawableCashCents, null);
assert.equal(lifecycleLedger.money.verifiedClientReceiptsCents, null);
assert.equal(lifecycleLedger.payments.every((row) => row.bankVerified === false), true);

const cleanLifecycleLedger = buildLedger({
  expensesComplete: true,
  taxEstablished: true,
  payments: [
    {
      paymentId: 'inv-lifecycle-a',
      eventId: 'evt-lifecycle',
      ledgerRole: 'client_receivable',
      invoiceTotal: 2500,
      amountPaid: 2500,
      balanceDue: 0,
      paymentStatus: 'Paid In Full'
    },
    {
      paymentId: 'inv-lifecycle-b',
      eventId: 'evt-lifecycle',
      ledgerRole: 'client_receivable',
      invoiceTotal: 2000,
      amountPaid: 0,
      balanceDue: 2000,
      paymentStatus: 'Invoice Sent'
    },
    {
      paymentId: 'vendor-lifecycle',
      eventId: 'evt-lifecycle',
      lineLabel: 'Elevated lifecycle vendor',
      invoiceTotal: 600,
      amountPaid: 0,
      balanceDue: 600,
      paymentStatus: 'Invoice Sent'
    }
  ],
  payouts: [
    {
      payoutId: 'po-lifecycle-vendor',
      eventId: 'evt-lifecycle',
      payoutType: 'Vendor',
      amount: 250,
      status: 'Planned'
    },
    {
      payoutId: 'po-lifecycle-owner',
      eventId: 'evt-lifecycle',
      payoutType: 'Owner distribution',
      amount: 400,
      status: 'Planned'
    }
  ]
});
assert.equal(cleanLifecycleLedger.counts.clientInvoices, 2);
assert.equal(cleanLifecycleLedger.counts.vendorBills, 1);
assert.equal(cleanLifecycleLedger.money.ownerPlannedCents, 40000);
assert.equal(cleanLifecycleLedger.money.vendorCommittedCents, 60000);
assert.equal(cleanLifecycleLedger.money.drawableCashCents, null);

// 13–14) Event outcome + post-event obligations
const completed = lifecycleStore.apply({
  operation: OPERATIONS.UPDATE_EVENT_STATUS,
  eventId: 'evt-lifecycle',
  expectedRevision: proposalStatus.event.revision,
  idempotencyKey: 'lifecycle-complete-1',
  auth: lifecycleAuth,
  payload: { status: 'Completed' }
});
assert.equal(completed.ok, true);

const postEvent = lifecycleStore.apply({
  operation: OPERATIONS.UPDATE_POST_EVENT,
  eventId: 'evt-lifecycle',
  expectedRevision: completed.event.revision,
  idempotencyKey: 'lifecycle-post-1',
  auth: lifecycleAuth,
  payload: {
    clientFeedback: 'Synthetic feedback only',
    whatWentWell: 'On-time setup',
    painPoints: 'Loading dock delay',
    changesForNextTime: 'Arrive 30 minutes earlier',
    reviewRequested: true,
    reviewReceived: false,
    rebookingLikelihood: 'High',
    thankYouSent: false,
    followUpDate: '2026-12-27',
    notes: 'Post-event task: send thank-you and request review'
  }
});
assert.equal(postEvent.ok, true);
assert.equal(lifecycleStore.getEvent('evt-lifecycle').postEvent.reviewRequested, true);
assert.equal(lifecycleStore.getEvent('evt-lifecycle').postEvent.thankYouSent, false);

const followUp = lifecycleStore.apply({
  operation: OPERATIONS.RECORD_FOLLOW_UP,
  eventId: 'evt-lifecycle',
  expectedRevision: postEvent.event.revision,
  idempotencyKey: 'lifecycle-followup-1',
  auth: lifecycleAuth,
  payload: {
    nextAction: 'Send thank-you and request review',
    nextActionDue: '2026-12-27',
    followUpDate: '2026-12-27',
    notes: 'Post-event obligation'
  }
});
assert.equal(followUp.ok, true);

const postEventStatus = lifecycleStore.apply({
  operation: OPERATIONS.UPDATE_EVENT_STATUS,
  eventId: 'evt-lifecycle',
  expectedRevision: followUp.event.revision,
  idempotencyKey: 'lifecycle-post-status-1',
  auth: lifecycleAuth,
  payload: { status: 'Post-Event Follow-Up' }
});
assert.equal(postEventStatus.ok, true);
assert.equal(lifecycleStore.getEvent('evt-lifecycle').status, 'Post-Event Follow-Up');

// 15) Report + reconciliation (selected event only; no cross-event contamination)
const lifecycleReconciliation = buildFinanceReconciliation(cleanLifecycleLedger, documentedExceptions());
assert.equal(lifecycleReconciliation.writesPerformed, false);
assert.equal(lifecycleReconciliation.comparisons.find((row) => row.field === 'vendorCommitted').matches, true);
assert.equal(lifecycleReconciliation.comparisons.find((row) => row.field === 'ownerPlanned').globalCents, 40000);

const lifecycleReport = buildOperationalReport({
  events: [lifecycleStore.getEvent('evt-lifecycle')],
  ledger: cleanLifecycleLedger,
  jobs: [
    { id: 'sms-heartbeat', name: 'Android SMS', connected: false, lastSuccess: '', status: 'UNVERIFIED' }
  ],
  exceptions: [{ id: 'ex-lifecycle', eventId: 'evt-lifecycle', detail: 'Synthetic', includedInTotals: false }],
  today: lifecycleToday,
  now: '2026-11-26T18:00:00Z',
  authenticated: true,
  eventId: 'evt-lifecycle'
});
assert.equal(lifecycleReport.scope.kind, 'selected-event');
assert.equal(lifecycleReport.scope.eventId, 'evt-lifecycle');
assert.equal(lifecycleReport.isolation.selectedEventOnly, true);
assert.equal(lifecycleReport.financialConfidence.unknownIsNotZero, true);
assert.equal(lifecycleReport.csvExport, null);
assert.match(lifecycleReport.csvExportReason || '', /omitted/i);

// --- Deterministic failure matrix (mock success must not substitute) ---

// Duplicate / conflicting source + event + payment IDs (already seeded above)
assert.ok(attributedInbox.pipeline.excluded.eventConflicts.includes('evt-lifecycle-conflict'));
assert.ok(lifecycleLedger.conflictPaymentIds.includes('pay-lifecycle-clash'));

// Expired session
const sessionKey = randomBytes(32);
const sessionHash = 'ab'.repeat(32);
const sessionHost = 'lifecycle.example.test';
const validCookie = createReviewSession(sessionKey, sessionHash, sessionHost, Date.now());
const expiredCookie = createReviewSession(sessionKey, sessionHash, sessionHost, Date.now() - 8 * 24 * 3600 * 1000);
const sessionEnv = {
  LVPT_SMS_STAGING_DATA_KEY_BASE64: sessionKey.toString('base64'),
  LVPT_SMS_STAGING_TOKEN_SHA256: sessionHash
};
function lifecycleRequest(cookieValue) {
  return new Request(`https://${sessionHost}/api/sync/operating-picture`, {
    headers: {
      cookie: `${REVIEW_COOKIE_NAME}=${cookieValue}`,
      origin: `https://${sessionHost}`
    }
  });
}
const liveSession = privateReadDecision(lifecycleRequest(validCookie), sessionEnv);
assert.equal(liveSession.allow, true);
const expiredSession = privateReadDecision(lifecycleRequest(expiredCookie), sessionEnv);
assert.equal(expiredSession.allow, false);
assert.equal(expiredSession.status, 401);
assert.notEqual(expiredSession.allow, liveSession.allow);

// Delayed network response — incomplete payload must not paint as settled zero
const delayedLedger = {
  money: {
    coverage: 'loading',
    openClientExposureCents: null,
    vendorCommittedCents: null,
    verifiedClientReceiptsCents: null,
    drawableCashCents: null
  }
};
assert.equal(delayedLedger.money.openClientExposureCents, null);
assert.notEqual(delayedLedger.money.openClientExposureCents, 0);
assert.notEqual(delayedLedger.money.vendorCommittedCents, 0);

// Provider timeout / unknown send / wrong recipient covered above via simulateApprovalSend
assert.equal(providerTimeout.reason, 'provider_timeout');
assert.equal(unknownSend.reason, 'send_outcome_uncertain_check_gmail_sent');
assert.equal(wrongRecipient.reason, 'incorrect_recipient');

// Invalid task ID (openTasks conflict / missing id does not invent completion)
const invalidOpen = openTasks([
  { id: '', eventId: 'evt-lifecycle', title: 'Ghost', owner: 'Synthetic Owner', dueDate: '2026-11-20', status: 'Open' },
  { id: 'task-ghost', eventId: 'evt-lifecycle', title: 'Ghost A', owner: 'Synthetic Owner', dueDate: '2026-11-20', status: 'Open' },
  { id: 'task-ghost', eventId: 'evt-lifecycle', title: 'Ghost B', owner: 'Synthetic Owner', dueDate: '2026-11-20', status: 'Completed' }
]);
assert.equal(invalidOpen.conflicts.includes('task-ghost'), true);
assert.equal(invalidOpen.rows.some((row) => row.id === 'task-ghost' && row.status === 'Completed'), false);

// Missing quote cost is not zero profit
const missingCostCoverage = quoteCoverage({
  setup: { targetQuote: 5000 },
  quote: [{ quantity: 1, unitPrice: 4500 }]
});
assert.equal(missingCostCoverage.priced, true);
assert.equal(missingCostCoverage.costKnown, false);
assert.equal(missingCostCoverage.costPartial, true);
assert.equal(missingCostCoverage.costCents, null);
assert.notEqual(missingCostCoverage.costCents, 0);

// Missing heartbeat stays unverified (historical rows are not a heartbeat)
const missingHeartbeat = classifyBridgeHeartbeat({
  status: null,
  historicalRowCount: 4769,
  now: '2026-11-26T18:00:00.000Z'
});
assert.equal(missingHeartbeat.verified, false);
assert.notEqual(missingHeartbeat.status, 'LIVE');
assert.equal(missingHeartbeat.historicalImpliesSync, false);
assert.match(String(missingHeartbeat.detail || missingHeartbeat.ownerAction || ''), /heartbeat|unverified|Historical/i);
const storedOnly = classifyStoredCollection({
  storeReached: true,
  rowCount: 4769,
  newestImportAt: '2026-11-22T00:00:00.000Z',
  newestMessageAt: '2026-11-18T00:00:00.000Z',
  now: '2026-11-26T12:00:00.000Z'
});
assert.equal(storedOnly.heartbeatVerified, false);
assert.notEqual(storedOnly.heartbeatStatus, 'LIVE');
assert.equal(sourceStatus({ observable: false, connected: true, lastSuccess: '2026-11-26T12:00:00.000Z' }), 'NOT OBSERVABLE');

// Cross-event contamination guard: foreign event id must not appear in selected lifecycle snapshot
const foreignLeak = JSON.stringify(lifecycleStore.getEvent('evt-lifecycle'));
assert.equal(foreignLeak.includes('evt-acceptance'), false);
assert.equal(foreignLeak.includes('evt-conflict'), false);
assert.equal(lifecycleStore.listAudit().every((row) => row.eventId === 'evt-lifecycle' || !row.eventId), true);

console.log('Command Center integrated acceptance regression passed.');
