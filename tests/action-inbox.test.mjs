import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildActionInbox, collapseDuplicateIds, openTasks, prepareDraft } from '../lib/action-inbox.mjs';
import { contactHash, matchThreads } from '../lib/sms-bridge.mjs';

const today = '2026-11-22';

const corporate = {
  id: 'evt-corporate',
  eventName: 'Harbor Corporate Casino Night',
  company: 'Harbor Systems',
  contactName: 'Avery Quinn',
  contactEmail: 'avery@harbor.example',
  contactPhone: '7025550101',
  eventType: 'Corporate Casino Night',
  status: 'New Lead',
  eventDate: '2026-12-04',
  venue: 'Client suite',
  guestCount: 40,
  leadSource: 'Website',
  nextAction: 'Send the corporate pricing options.',
  setup: { budgetRange: '$10,000–$20,000', targetQuote: 0 },
  quote: [{ quantity: 1, unitPrice: 14500 }],
  emailActivity: [{ threadId: 'thread-corp', subject: 'Corporate poker inquiry', date: '2026-11-21T15:00:00.000Z', direction: 'received', snippet: 'We would like a private casino night for 40 guests.' }]
};

const coaching = {
  id: 'evt-coach',
  eventName: 'Private coaching',
  company: '',
  contactName: 'Jordan Lee',
  contactEmail: 'jordan@guest.example',
  contactPhone: '',
  eventType: 'Private Poker Lesson',
  status: 'Needs Discovery',
  eventDate: '',
  venue: '',
  guestCount: 0,
  leadSource: 'Phone',
  nextAction: '',
  setup: { budgetRange: '', targetQuote: 0 },
  quote: [],
  emailActivity: []
};

const booked = {
  id: 'evt-booked',
  eventName: 'Booked reunion',
  company: 'Northwind',
  contactName: 'Sam North',
  contactEmail: 'sam@northwind.example',
  contactPhone: '7025550108',
  eventType: 'Corporate Training + Tournament',
  status: 'Booked',
  eventDate: '2026-12-18',
  venue: 'Client venue',
  guestCount: 24,
  leadSource: 'Repeat Client',
  nextAction: 'Confirm the floor plan.',
  setup: { budgetRange: '$20,000–$40,000', targetQuote: 22000 },
  quote: [],
  emailActivity: [
    { threadId: 'thread-booked', subject: 'Schedule confirmation', date: '2026-11-20T12:00:00.000Z', direction: 'received', snippet: 'Can we move the start time?' }
  ]
};

const inbox = buildActionInbox({
  today,
  events: [corporate, coaching, booked],
  tasks: [
    { id: 'task-floor', eventId: 'evt-booked', title: 'Confirm the floor plan.', dueDate: '2026-11-20', status: 'Open' },
    { id: 'task-floor', eventId: 'evt-booked', title: 'Confirm the floor plan.', dueDate: '2026-11-20', status: 'Open' },
    { id: 'task-done', eventId: 'evt-booked', title: 'Closed task', dueDate: '2026-11-01', status: 'Completed' }
  ],
  gmailThreads: [
    { threadId: 'thread-booked', subject: 'Schedule confirmation', lastMessageAt: '2026-11-20T12:00:00.000Z', lastDirection: 'inbound' },
    { threadId: 'thread-vendor', subject: 'Venetian dealer invoice', lastMessageAt: '2026-11-19T12:00:00.000Z', lastDirection: 'inbound', domainKey: 'venue' },
    { threadId: 'thread-new', subject: 'Question about a private event', lastMessageAt: '2026-11-22T12:00:00.000Z', lastDirection: 'inbound' }
  ],
  smsThreads: [
    { threadKey: 'abc123', match: 'unmatched', eventId: '', newestAt: '2026-11-05T00:06:49.642Z', incoming: 1, outgoing: 0, review: true },
    { threadKey: 'def456', match: 'exact', eventId: 'evt-booked', newestAt: '2026-11-18T00:00:00.000Z', incoming: 2, outgoing: 1 },
    { threadKey: 'ghi789', match: 'ambiguous', eventId: '', candidateEventIds: ['evt-booked', 'evt-corporate'], newestAt: '2026-11-02T00:00:00.000Z', incoming: 1, outgoing: 1 }
  ]
});

assert.equal(inbox.sendEnabled, false);
const corp = inbox.records.find((row) => row.id === 'event:evt-corporate');
assert.equal(corp.qualification.inquiry, 'corporate');
assert.equal(corp.qualification.guestCount, 40);
assert.equal(corp.qualification.estimatedValueCents, 1450000);
assert.equal(corp.qualification.missing.includes('budget'), false);
assert.equal(corp.timeline[0].contentAvailable, true);
assert.equal(corp.draft.sent, false);
assert.equal(corp.draft.recipient, 'avery@harbor.example');
assert.match(corp.draft.body, /Harbor Systems/);
assert.doesNotMatch(corp.draft.body, /I assume|probably|around \$/);

const coach = inbox.records.find((row) => row.id === 'event:evt-coach');
assert.equal(coach.qualification.inquiry, 'private');
assert.equal(coach.qualification.budget, '');
assert.ok(coach.qualification.missing.includes('budget'));
assert.ok(coach.qualification.missing.includes('guest count'));
assert.ok(coach.qualification.missing.includes('estimated opportunity value'));
assert.equal(coach.draft.body.includes('Budget recorded'), false);

const bookedRow = inbox.records.find((row) => row.id === 'event:evt-booked');
assert.equal(bookedRow.bucket, 'awaiting_response');
assert.equal(bookedRow.taskIds.length, 1);
assert.equal(inbox.records.filter((row) => row.id === 'gmail:thread-booked').length, 0);
assert.ok(bookedRow.timeline.some((item) => item.source === 'SMS' && item.contentAvailable === false));

const vendor = inbox.records.find((row) => row.id === 'gmail:thread-vendor');
assert.equal(vendor.bucket, 'vendor');
assert.equal(vendor.vendor, true);
assert.equal(inbox.records.filter((row) => row.bucket === 'new_inquiry' && row.vendor).length, 0);

const unmatchedMail = inbox.records.find((row) => row.id === 'gmail:thread-new');
const unmatchedSms = inbox.records.find((row) => row.id === 'sms:abc123');
const ambiguous = inbox.records.find((row) => row.id === 'sms:ghi789');
assert.equal(unmatchedMail.bucket, 'unassigned');
assert.equal(unmatchedMail.review, true);
assert.equal(unmatchedMail.contact, '');
assert.equal(unmatchedSms.review, true);
assert.equal(unmatchedSms.timeline[0].contentAvailable, false);
assert.match(ambiguous.nextAction, /More than one event/);
assert.equal(inbox.counts.review >= 3, true);
assert.equal(inbox.counts.vendorExcluded, 1);

const blank = prepareDraft({ qualification: coach.qualification });
assert.equal(blank.sent, false);
assert.equal(blank.sendEnabled, false);
assert.equal(blank.recipientVerified, false);
assert.equal(blank.readyToApprove, false);
assert.equal(blank.readyToSend, false);
assert.equal(corp.acquisitionKind, 'recorded');
assert.equal(corp.acquisitionLabel, 'Website');
assert.equal(corp.source, 'Website');
assert.equal(corp.channel, 'Gmail');
assert.equal(inbox.counts.readyForApproval, 0);

const decisions = buildActionInbox({
  today,
  events: [
    { id: 'evt-unknown', status: 'Considering', leadSource: '', contactEmail: 'only@example.test' },
    { id: 'evt-declined', status: 'Declined', leadSource: 'Referral from a partner' },
    { id: 'evt-invoice', status: 'Invoice sent', leadSource: 'Organic' },
    { id: 'evt-booked-explicit', status: 'Booked', leadSource: 'Contact form', proposalUrl: 'https://example.test/proposal', utmSource: '' },
    { id: 'evt-utm', status: 'New Lead', utmSource: 'spring', utmCampaign: 'poker', leadSource: 'Phone' }
  ],
  tasks: [
    { id: 'task-overdue', eventId: 'evt-unknown', title: 'Call back', dueDate: '2026-11-01', status: 'Open' }
  ],
  gmailThreads: [],
  smsThreads: [
    { threadKey: 'sms-old', match: 'exact', eventId: 'evt-invoice', newestAt: '2026-11-21T00:00:00.000Z', newestDirection: 'outgoing', incoming: 4, outgoing: 1 }
  ],
  rcsMessages: [
    { googleMessageId: 'gm-same', conversationId: 'conv-1', direction: 'incoming', messageAt: '2026-11-21T01:00:00.000Z' },
    { googleMessageId: 'gm-same', conversationId: 'conv-1', direction: 'outgoing', messageAt: '2026-11-21T02:00:00.000Z' },
    { googleMessageId: 'gm-other', conversationId: 'conv-1', direction: 'incoming', messageAt: '2026-11-21T03:00:00.000Z' }
  ]
});
const byId = (id) => decisions.records.find((row) => row.id === id);
assert.equal(byId('event:evt-unknown').pipelineStage, 'unknown');
assert.notEqual(byId('event:evt-unknown').bucket, 'booked');
assert.equal(byId('event:evt-unknown').acquisitionKind, 'unknown');
assert.equal(byId('event:evt-declined').pipelineStage, 'declined');
assert.equal(byId('event:evt-declined').bucket, 'declined');
assert.equal(byId('event:evt-declined').acquisitionKind, 'referral');
assert.equal(byId('event:evt-invoice').pipelineStage, 'invoice_sent');
assert.notEqual(byId('event:evt-invoice').bucket, 'booked');
assert.equal(byId('event:evt-invoice').acquisitionKind, 'organic');
assert.equal(byId('event:evt-booked-explicit').pipelineStage, 'booked');
assert.equal(byId('event:evt-booked-explicit').bucket, 'booked');
assert.equal(byId('event:evt-booked-explicit').acquisitionKind, 'form');
assert.equal(byId('event:evt-booked-explicit').proposalLink, 'https://example.test/proposal');
assert.equal(byId('event:evt-utm').acquisitionKind, 'utm');
assert.equal(byId('event:evt-utm').acquisitionLabel.includes('Phone'), false);
const invoiceSms = byId('event:evt-invoice').timeline.find((item) => item.source === 'SMS');
assert.equal(invoiceSms.direction, 'outbound');
assert.equal(decisions.counts.readyForApproval, 0);
assert.equal(byId('event:evt-unknown').draft.recipientRecorded, true);
assert.equal(byId('event:evt-unknown').draft.recipientVerified, false);
const rcs = byId('rcs:conv-1');
assert.equal(rcs.timeline.length, 2);
assert.deepEqual(rcs.providerIds, ['gm-same', 'gm-other']);
assert.equal(decisions.pipeline.denominator, 5);
assert.equal(decisions.pipeline.stages.booked, 1);
assert.equal(decisions.pipeline.stages.invoiceSent, 1);
assert.equal(decisions.pipeline.stages.declined, 1);
assert.equal(decisions.pipeline.stages.unknown, 1);
assert.equal(decisions.pipeline.conversion.numerator, 1);
assert.equal(decisions.pipeline.conversion.denominator, 5);
assert.equal(decisions.pipeline.excluded.ambiguous, 0);
assert.equal(decisions.pipeline.overdueFollowUps, 1);
const ambiguousOnly = buildActionInbox({
  today,
  events: [],
  smsThreads: [{ threadKey: 'amb', match: 'ambiguous', candidateEventIds: ['evt-a', 'evt-b'], newestAt: '2026-11-02T00:00:00.000Z', incoming: 3, outgoing: 0 }]
});
assert.equal(ambiguousOnly.records[0].timeline[0].direction, '');
assert.equal(ambiguousOnly.pipeline.excluded.ambiguous, 1);
assert.equal(ambiguousOnly.pipeline.denominator, 0);
assert.equal(ambiguousOnly.pipeline.conversion, null);

const bridgeKey = Buffer.alloc(32, 4);
const phone = '7025550199';
const hash = contactHash(bridgeKey, phone);
const matched = matchThreads([
  { contact_hash: hash, direction: 'incoming', timestamp_ms: 1000 },
  { contact_hash: hash, direction: 'incoming', timestamp_ms: 2000 },
  { contact_hash: hash, direction: 'outgoing', timestamp_ms: 3000 }
], [{ id: 'evt-1', contactPhone: phone }], bridgeKey);
assert.equal(matched[0].incoming, 2);
assert.equal(matched[0].outgoing, 1);
assert.equal(matched[0].newestDirection, 'outgoing');

const duplicates = buildActionInbox({
  today,
  events: [
    { id: 'evt-copy', status: 'Booked', eventName: 'Same' },
    { id: 'evt-copy', status: 'Booked', eventName: 'Same' },
    { id: 'evt-clash', status: 'Booked', eventName: 'One' },
    { id: 'evt-clash', status: 'Declined', eventName: 'One' }
  ]
});
assert.equal(duplicates.records.filter((row) => row.eventId === 'evt-copy').length, 1);
assert.equal(duplicates.pipeline.denominator, 1);
assert.deepEqual(duplicates.pipeline.duplicateEventsCountedOnce, ['evt-copy']);
assert.equal(duplicates.records.some((row) => row.eventId === 'evt-clash'), false);
assert.deepEqual(duplicates.pipeline.excluded.eventConflicts, ['evt-clash']);

const closures = buildActionInbox({
  today,
  events: [
    { id: 'evt-cancel', status: 'Cancelled' },
    { id: 'evt-won', status: 'Closed won' },
    { id: 'evt-closed', status: 'Closed' },
    { id: 'evt-done', status: 'Completed' }
  ],
  smsThreads: [
    { threadKey: 'sms-cancel', match: 'exact', eventId: 'evt-cancel', newestAt: '2026-11-21T00:00:00.000Z', newestDirection: 'incoming', incoming: 1, outgoing: 0 }
  ]
});
assert.equal(closures.records.find((row) => row.id === 'event:evt-cancel').pipelineStage, 'cancelled');
assert.equal(closures.records.find((row) => row.id === 'event:evt-cancel').bucket, 'cancelled');
assert.equal(closures.records.find((row) => row.id === 'event:evt-won').pipelineStage, 'closed_won');
assert.equal(closures.records.find((row) => row.id === 'event:evt-won').bucket, 'resolved');
assert.equal(closures.records.find((row) => row.id === 'event:evt-closed').pipelineStage, 'unknown_closure');
assert.notEqual(closures.records.find((row) => row.id === 'event:evt-closed').pipelineStage, 'completed');
assert.equal(closures.records.find((row) => row.id === 'event:evt-done').pipelineStage, 'completed');
assert.equal(closures.pipeline.stages.completed, 1);
assert.equal(closures.pipeline.stages.cancelled, 1);
assert.equal(closures.pipeline.stages.closedWon, 1);
assert.equal(closures.pipeline.stages.unknownClosure, 1);

const ordered = buildActionInbox({
  today,
  events: [{
    id: 'evt-order',
    status: 'New Lead',
    emailActivity: [{ threadId: 'mail-1', date: '2026-11-21T12:00:00.000Z', direction: 'received', snippet: 'Question' }]
  }],
  smsThreads: [
    { threadKey: 'sms-older', match: 'exact', eventId: 'evt-order', newestAt: '2026-11-18T00:00:00.000Z', newestDirection: 'outgoing', incoming: 3, outgoing: 0 },
    { threadKey: 'sms-newer', match: 'exact', eventId: 'evt-order', newestAt: '2026-11-22T00:00:00.000Z', newestDirection: 'outgoing', incoming: 9, outgoing: 1 }
  ]
});
const orderedRow = ordered.records.find((row) => row.id === 'event:evt-order');
assert.equal(orderedRow.timeline[0].source, 'SMS');
assert.equal(orderedRow.timeline[0].at, '2026-11-22T00:00:00.000Z');
assert.equal(orderedRow.activityDirection, 'outbound');
assert.notEqual(orderedRow.bucket, 'awaiting_response');
const tied = buildActionInbox({
  today,
  events: [{
    id: 'evt-tie',
    status: 'New Lead',
    emailActivity: [{ threadId: 'mail-tie', date: '2026-11-22T00:00:00.000Z', direction: 'received', snippet: 'Question' }]
  }],
  smsThreads: [
    { threadKey: 'sms-tie', match: 'exact', eventId: 'evt-tie', newestAt: '2026-11-22T00:00:00.000Z', newestDirection: 'outgoing', incoming: 1, outgoing: 0, partial: true }
  ]
});
assert.equal(tied.records[0].activityDirection, 'unknown');
assert.notEqual(tied.records[0].bucket, 'awaiting_response');
const directionTie = buildActionInbox({
  today,
  events: [{
    id: 'evt-direction-tie',
    status: 'New Lead',
    emailActivity: [{ threadId: 'mail-direction', date: '2026-11-22T00:00:00.000Z', direction: 'received', snippet: 'Question' }]
  }],
  smsThreads: [
    { threadKey: 'sms-direction', match: 'exact', eventId: 'evt-direction-tie', newestAt: '2026-11-22T00:00:00.000Z', newestDirection: 'outgoing', incoming: 0, outgoing: 1 }
  ]
});
assert.equal(directionTie.records[0].activityDirection, 'unknown');
assert.notEqual(directionTie.records[0].bucket, 'awaiting_response');
const sheetTasks = collapseDuplicateIds([
  { id: 'task-copy', eventId: 'evt-due', title: 'Call', owner: 'Matt', dueDate: '2026-11-21', status: 'Open' },
  { id: 'task-copy', eventId: 'evt-due', title: 'Call', owner: 'Matt', dueDate: '2026-11-21', status: 'Open' },
  { id: 'task-owner', eventId: 'evt-due', title: 'Call', owner: 'Matt', dueDate: '2026-11-21', status: 'Open' },
  { id: 'task-owner', eventId: 'evt-due', title: 'Call', owner: 'Alex', dueDate: '2026-11-21', status: 'Open' }
], ['eventId', 'title', 'owner', 'dueDate', 'status']);
assert.equal(sheetTasks.rows.filter((row) => row.id === 'task-copy').length, 1);
assert.equal(sheetTasks.rows.some((row) => row.id === 'task-owner'), false);
assert.deepEqual(sheetTasks.conflicts, ['task-owner']);

assert.equal(buildActionInbox({ today, events: [{ id: 'evt-link', status: 'New Lead', proposalUrl: 'https://user:pass@example.test/proposal' }] }).records[0].proposalLink, '');
assert.equal(buildActionInbox({ today, events: [{ id: 'evt-link-ok', status: 'New Lead', proposalUrl: 'https://example.test/proposal' }] }).records[0].proposalLink, 'https://example.test/proposal');
const dueSplit = buildActionInbox({
  today: '2026-11-22',
  events: [{ id: 'evt-due', status: 'New Lead' }],
  tasks: [
    { id: 'task-today', eventId: 'evt-due', title: 'Due today', dueDate: '2026-11-22', status: 'Open' },
    { id: 'task-late', eventId: 'evt-due', title: 'Late', dueDate: '2026-11-21', status: 'Open' },
    { id: 'task-late', eventId: 'evt-due', title: 'Late', dueDate: '2026-11-21', status: 'Open' },
    { id: 'task-clash', eventId: 'evt-due', title: 'One', dueDate: '2026-11-21', status: 'Open' },
    { id: 'task-clash', eventId: 'evt-due', title: 'Other', dueDate: '2026-11-20', status: 'Open' }
  ]
});
const splitTask = openTasks([
  { id: 'task-split', eventId: 'evt-due', title: 'Confirm', owner: 'Synthetic Owner', dueDate: '2026-11-21', status: 'Open' },
  { id: 'task-split', eventId: 'evt-due', title: 'Confirm', owner: 'Synthetic Owner', dueDate: '2026-11-21', status: 'Completed' },
  { id: 'task-owned', eventId: 'evt-due', title: 'Call', owner: 'Synthetic Owner', dueDate: '2026-11-22', status: 'Open' }
]);
assert.deepEqual(splitTask.conflicts, ['task-split']);
assert.equal(splitTask.rows.some((row) => row.id === 'task-split'), false);
assert.equal(splitTask.rows.find((row) => row.id === 'task-owned').owner, 'Synthetic Owner');
assert.equal(dueSplit.pipeline.dueFollowUps, 1);
assert.equal(dueSplit.pipeline.overdueFollowUps, 1);
assert.deepEqual(dueSplit.pipeline.taskConflicts, ['task-clash']);

const hub = readFileSync(new URL('../public/v2/js/unified-hub.js', import.meta.url), 'utf8');
assert.equal(hub.includes('data-decision="approve"'), false);
assert.match(hub, /Not verified and not an approval/);
assert.match(hub, /Recorded email, not verified/);
assert.match(hub, /Lead pipeline/);
assert.match(hub, /Vendors and resolved rows stay out of the default list/);
assert.match(hub, /name === 'action' && !\['resolved', 'declined', 'cancelled', 'unknown_closure'\]\.includes\(bucket\) && card\.getAttribute\('data-vendor'\) !== 'yes'/);

const picture = readFileSync(new URL('../app/api/sync/operating-picture/route.ts', import.meta.url), 'utf8');
const pictureBody = picture.slice(picture.indexOf('export async function GET'));
assert.ok(pictureBody.indexOf('collapseDuplicateIds') < pictureBody.indexOf('taskConflicts'));
assert.match(picture, /The hourly schedule is configuration, not proof that runLVPTSafeTaskSync ran/);
const route = readFileSync(new URL('../app/api/sync/action-inbox/route.ts', import.meta.url), 'utf8');
assert.match(route, /productionWrites: false/);
assert.match(route, /preview_only/);
assert.match(route, /writesPerformed: false/);
assert.match(route, /sendEnabled: false/);
assert.doesNotMatch(route, /export async function (POST|PUT|PATCH|DELETE)\b/);
const routeGet = route.slice(route.indexOf('export async function GET'));
const denyAt = routeGet.indexOf('denyPrivateRead');
const firstProvider = Math.min(
  ...['appsScriptRequest', 'supabaseEndpoint', 'fetch(']
    .map((token) => routeGet.indexOf(token))
    .filter((index) => index >= 0)
);
assert.ok(denyAt >= 0 && firstProvider > denyAt, 'unauthorized private reads must reject before provider access');
const send = readFileSync(new URL('../app/api/gmail/send/route.ts', import.meta.url), 'utf8');
assert.match(send, /403/);
const smsSend = readFileSync(new URL('../app/api/sms/staging/reply-send/route.ts', import.meta.url), 'utf8');
assert.match(smsSend, /staging_only_no_production_send/);

// R05 / T10 — synthetic evidence-based classification matrix
const classified = buildActionInbox({
  today: '2026-11-22',
  events: [
    {
      id: 'evt-new',
      eventName: 'New inquiry only',
      status: 'New Lead',
      company: 'Fresh Co',
      contactName: 'Pat Fresh',
      contactEmail: 'pat@fresh.example',
      contactPhone: '7025550201',
      eventType: 'Corporate Casino Night',
      eventDate: '2026-12-20',
      venue: 'Suite',
      guestCount: 30,
      leadSource: 'Organic',
      setup: { budgetRange: '$5,000–$10,000' },
      quote: [{ quantity: 1, unitPrice: 8000 }],
      emailActivity: []
    },
    {
      id: 'evt-reply',
      eventName: 'Reply required',
      status: 'Proposal Sent',
      contactName: 'Riley Inbound',
      contactEmail: 'riley@reply.example',
      leadSource: 'Website',
      emailActivity: [
        { threadId: 'thread-reply', subject: 'Can we confirm Friday?', date: '2026-11-22T14:00:00.000Z', direction: 'received', snippet: 'Please reply when you can.' }
      ]
    },
    {
      id: 'evt-follow',
      eventName: 'Historical follow-up',
      status: 'Needs Discovery',
      contactName: 'Casey Follow',
      leadSource: 'Phone',
      emailActivity: [
        { threadId: 'thread-follow', subject: 'Earlier outreach', date: '2026-11-10T12:00:00.000Z', direction: 'sent', snippet: 'Checking in from last week.' }
      ]
    },
    {
      id: 'evt-pay',
      eventName: 'Payment confirmation',
      status: 'Booked - Payment Processing',
      contactName: 'Morgan Pay',
      leadSource: 'Referral',
      emailActivity: []
    },
    {
      id: 'evt-deposit',
      eventName: 'Awaiting deposit',
      status: 'Invoice Sent / Awaiting Deposit',
      contactName: 'Drew Deposit',
      leadSource: 'Form',
      emailActivity: []
    },
    {
      id: 'evt-tasked',
      eventName: 'Booked with open task',
      status: 'Booked',
      contactName: 'Taylor Task',
      leadSource: 'Repeat Client',
      emailActivity: []
    },
    {
      id: 'evt-booked-plain',
      eventName: 'Booked without tasks',
      status: 'Booked',
      contactName: 'Quiet Booked',
      leadSource: 'Repeat Client',
      emailActivity: []
    },
    {
      id: 'evt-done',
      eventName: 'Resolved event',
      status: 'Completed',
      contactName: 'Finished Client',
      leadSource: 'Organic',
      emailActivity: [
        { threadId: 'thread-done', subject: 'Thanks', date: '2026-11-21T09:00:00.000Z', direction: 'received', snippet: 'All set.' }
      ]
    },
    { id: 'evt-dup', status: 'New Lead', eventName: 'Stable once' },
    { id: 'evt-dup', status: 'New Lead', eventName: 'Stable once' },
    { id: 'evt-conflict', status: 'Booked', eventName: 'Conflict A' },
    { id: 'evt-conflict', status: 'Declined', eventName: 'Conflict A' }
  ],
  tasks: [
    { id: 'task-follow', eventId: 'evt-follow', title: 'Call Casey about discovery', dueDate: '2026-11-20', status: 'Open', owner: 'Matt' },
    { id: 'task-booked', eventId: 'evt-tasked', title: 'Confirm staffing', dueDate: '2026-11-25', status: 'Open', owner: 'Matt' },
    { id: 'task-orphan', eventId: '', title: 'Orphan event task', dueDate: '2026-11-21', status: 'Open', owner: 'Matt' },
    { id: 'task-missing-event', eventId: 'evt-missing', title: 'Task for unknown event', dueDate: '2026-11-21', status: 'Open', owner: 'Matt' },
    { id: 'task-copy', eventId: 'evt-tasked', title: 'Confirm staffing', dueDate: '2026-11-25', status: 'Open', owner: 'Matt' },
    { id: 'task-copy', eventId: 'evt-tasked', title: 'Confirm staffing', dueDate: '2026-11-25', status: 'Open', owner: 'Matt' },
    { id: 'task-clash', eventId: 'evt-tasked', title: 'One title', dueDate: '2026-11-24', status: 'Open', owner: 'Matt' },
    { id: 'task-clash', eventId: 'evt-tasked', title: 'Other title', dueDate: '2026-11-23', status: 'Open', owner: 'Alex' }
  ],
  gmailThreads: [
    { threadId: 'thread-vendor-matrix', subject: 'Elevated Billing dealer invoice', lastMessageAt: '2026-11-19T12:00:00.000Z', lastDirection: 'inbound', domainKey: 'elevated' },
    { threadId: 'thread-unassigned-matrix', subject: 'Unknown prospect question', lastMessageAt: '2026-11-22T11:00:00.000Z', lastDirection: 'inbound' }
  ],
  smsThreads: [
    { threadKey: 'sms-amb-matrix', match: 'ambiguous', candidateEventIds: ['evt-new', 'evt-reply'], newestAt: '2026-11-21T00:00:00.000Z', newestDirection: 'incoming', incoming: 2, outgoing: 0 },
    { threadKey: 'sms-none', match: 'unmatched', newestAt: '2026-11-18T00:00:00.000Z', newestDirection: 'incoming', incoming: 1, outgoing: 0 }
  ]
});

const classOf = (id) => classified.records.find((row) => row.id === id);
assert.equal(classOf('event:evt-new').classification.kind, 'new_inquiry');
assert.equal(classOf('event:evt-new').bucket, 'new_inquiry');
assert.ok(classOf('event:evt-new').classification.evidence.pipelineStage === 'open');

assert.equal(classOf('event:evt-reply').classification.kind, 'reply_required');
assert.equal(classOf('event:evt-reply').bucket, 'awaiting_response');
assert.equal(classOf('event:evt-reply').classification.evidence.activityDirection, 'inbound');
assert.ok(classOf('event:evt-reply').classification.evidence.timelineSources.includes('Gmail'));

assert.equal(classOf('event:evt-follow').classification.kind, 'follow_up_due');
assert.equal(classOf('event:evt-follow').bucket, 'follow_up_due');
assert.equal(classOf('event:evt-follow').classification.evidence.dueDate, '2026-11-20');
assert.notEqual(classOf('event:evt-follow').classification.kind, 'reply_required');

assert.equal(classOf('event:evt-pay').classification.kind, 'payment_confirmation');
assert.equal(classOf('event:evt-pay').pipelineStage, 'payment_processing');
assert.match(classOf('event:evt-pay').classification.reason, /owner receipt confirmation/i);

assert.equal(classOf('event:evt-deposit').classification.kind, 'payment_confirmation');
assert.equal(classOf('event:evt-deposit').pipelineStage, 'invoice_awaiting_deposit');

assert.equal(classOf('event:evt-tasked').classification.kind, 'event_task');
assert.ok(classOf('event:evt-tasked').classification.evidence.taskIds.includes('task-booked'));
assert.equal(classOf('event:evt-tasked').taskIds.filter((id) => id === 'task-copy').length, 1);
assert.equal(classOf('event:evt-booked-plain').bucket, 'booked');
assert.equal(classOf('event:evt-booked-plain').classification.evidence.taskIds.length, 0);
assert.notEqual(classOf('event:evt-booked-plain').classification.kind, 'event_task');
assert.equal(classOf('event:evt-booked-plain').classification.kind, 'needs_review');
assert.match(classOf('event:evt-booked-plain').classification.reason, /No stronger evidence|reviewable/i);

assert.equal(classOf('gmail:thread-vendor-matrix').classification.kind, 'vendor_obligation');
assert.equal(classOf('gmail:thread-vendor-matrix').vendor, true);
assert.equal(classOf('gmail:thread-vendor-matrix').bucket, 'vendor');

assert.equal(classOf('gmail:thread-unassigned-matrix').classification.kind, 'needs_review');
assert.equal(classOf('gmail:thread-unassigned-matrix').review, true);
assert.equal(classOf('sms:sms-amb-matrix').classification.kind, 'needs_review');
assert.equal(classOf('sms:sms-amb-matrix').classification.evidence.uncertainMatch, true);
assert.deepEqual(classOf('sms:sms-amb-matrix').candidateEventIds, ['evt-new', 'evt-reply']);
assert.equal(classOf('sms:sms-none').classification.kind, 'needs_review');

assert.equal(classOf('event:evt-done').classification.kind, 'resolved');
assert.equal(classOf('event:evt-done').bucket, 'resolved');
assert.notEqual(classOf('event:evt-done').bucket, 'awaiting_response');

assert.equal(classOf('task:task-orphan').classification.kind, 'event_task');
assert.equal(classOf('task:task-orphan').review, true);
assert.equal(classOf('task:task-missing-event').classification.kind, 'event_task');
assert.equal(classOf('task:task-missing-event').eventId, 'evt-missing');

assert.equal(classified.records.filter((row) => row.eventId === 'evt-dup').length, 1);
assert.equal(classified.records.some((row) => row.eventId === 'evt-conflict'), false);
assert.deepEqual(classified.pipeline.excluded.eventConflicts, ['evt-conflict']);
assert.deepEqual(classified.pipeline.taskConflicts, ['task-clash']);
assert.ok(classified.pipeline.duplicateEventsCountedOnce.includes('evt-dup'));

const activeIds = classified.records
  .filter((row) => !['resolved', 'vendor', 'declined', 'cancelled', 'unknown_closure'].includes(row.bucket) && row.vendor !== true)
  .map((row) => row.id);
assert.equal(classified.counts.actionRequired, activeIds.length);
assert.equal(activeIds.includes('event:evt-done'), false);
assert.equal(activeIds.includes('gmail:thread-vendor-matrix'), false);
assert.ok(activeIds.includes('event:evt-reply'));
assert.ok(activeIds.includes('event:evt-follow'));
assert.ok(classified.counts.vendorExcluded >= 1);
assert.ok(classified.counts.resolved >= 1);
assert.ok(classified.counts.byClassification.new_inquiry >= 1);
assert.ok(classified.counts.byClassification.reply_required >= 1);
assert.ok(classified.counts.byClassification.follow_up_due >= 1);
assert.ok(classified.counts.byClassification.payment_confirmation >= 2);
assert.ok(classified.counts.byClassification.event_task >= 1);
assert.ok(classified.counts.byClassification.vendor_obligation >= 1);
assert.ok(classified.counts.byClassification.needs_review >= 1);
assert.ok(classified.counts.byClassification.resolved >= 1);
assert.equal(classified.writesPerformed, false);
assert.equal(classified.sendEnabled, false);

console.log('action-inbox tests passed');
