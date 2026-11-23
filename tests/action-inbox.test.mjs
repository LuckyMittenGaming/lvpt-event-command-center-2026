import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildActionInbox, prepareDraft } from '../lib/action-inbox.mjs';

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

const route = readFileSync(new URL('../app/api/sync/action-inbox/route.ts', import.meta.url), 'utf8');
assert.match(route, /productionWrites: false/);
assert.match(route, /preview_only/);
const send = readFileSync(new URL('../app/api/gmail/send/route.ts', import.meta.url), 'utf8');
assert.match(send, /403/);
const smsSend = readFileSync(new URL('../app/api/sms/staging/reply-send/route.ts', import.meta.url), 'utf8');
assert.match(smsSend, /staging_only_no_production_send/);

console.log('action-inbox tests passed');
