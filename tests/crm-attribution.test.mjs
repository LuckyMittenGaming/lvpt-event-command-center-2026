import assert from 'node:assert/strict';
import { buildActionInbox } from '../lib/action-inbox.mjs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { classifyStatus, eventLane, normalizeStatus } = require('../public/v2/js/event-status.js');

const today = '2026-11-22';

const lifecycleCases = [
  ['New Lead', 'open', 'New inquiry'],
  ['Needs Discovery', 'open', 'Discovery'],
  ['Quote Needed', 'open', 'Quote required'],
  ['Proposal Sent', 'open', 'Proposal sent'],
  ['Invoice Sent / Awaiting Deposit', 'invoice_awaiting_deposit', 'Invoice awaiting deposit'],
  ['Booked - Payment Processing', 'payment_processing', 'Booked/payment processing'],
  ['Booked', 'booked', 'Booked'],
  ['Completed', 'completed', 'Completed'],
  ['Declined', 'declined', 'Declined'],
  ['Cancelled', 'cancelled', 'Cancelled'],
  ['Closed', 'unknown_closure', 'Closed'],
  ['Outcome Unverified', 'outcome_unverified', 'Outcome unverified']
];

for (const [raw, stage] of lifecycleCases) {
  const classified = classifyStatus(raw);
  assert.equal(classified.stage, stage, raw);
  assert.equal(classified.raw, raw, `exact original preserved for ${raw}`);
  assert.equal(classified.normalized, normalizeStatus(raw), raw);
}

const unicodePay = 'Booked \u2014 Payment Processing';
const unicodeClassified = classifyStatus(unicodePay);
assert.equal(unicodeClassified.raw, unicodePay);
assert.equal(unicodeClassified.normalized, 'Booked - Payment Processing');
assert.equal(unicodeClassified.stage, 'payment_processing');

const messyDiscovery = '  Needs   Discovery  ';
const messyClassified = classifyStatus(messyDiscovery);
assert.equal(messyClassified.raw, messyDiscovery);
assert.equal(messyClassified.normalized, 'Needs Discovery');
assert.equal(messyClassified.stage, 'open');

const inbox = buildActionInbox({
  today,
  events: [
    { id: 'evt-new', status: 'New Lead', leadSource: 'Organic Search', eventName: 'Organic lead' },
    { id: 'evt-discovery', status: 'Needs Discovery', leadSource: 'Referral from partner', eventName: 'Referral lead' },
    { id: 'evt-quote', status: 'Quote Needed', leadSource: 'Website form', eventName: 'Form lead' },
    { id: 'evt-proposal', status: 'Proposal Sent', leadSource: 'Website', eventName: 'Other known' },
    {
      id: 'evt-utm',
      status: 'New Lead',
      leadSource: 'Phone',
      utmSource: 'google',
      utmCampaign: 'brand',
      eventName: 'UTM lead',
      emailActivity: [
        { threadId: 'mail-utm', date: '2026-11-21T12:00:00.000Z', direction: 'received', snippet: 'Hello' }
      ]
    },
    { id: 'evt-unknown-source', status: 'New Lead', leadSource: '', eventName: 'Unknown source' },
    { id: 'evt-deposit', status: 'Invoice Sent / Awaiting Deposit', leadSource: 'SEO' },
    { id: 'evt-pay', status: 'Booked - Payment Processing', leadSource: 'Organic' },
    { id: 'evt-booked', status: 'Booked', leadSource: 'Repeat Client' },
    { id: 'evt-done', status: 'Completed', leadSource: 'Organic' },
    { id: 'evt-declined', status: 'Declined', leadSource: 'Referral' },
    { id: 'evt-cancelled', status: 'Cancelled', leadSource: 'Website form' },
    { id: 'evt-closed', status: 'Closed', leadSource: 'Phone' },
    { id: 'evt-outcome', status: 'Outcome Unverified', leadSource: '' },
    { id: 'evt-unicode', status: 'Booked \u2014 Payment Processing', leadSource: 'Organic' },
    { id: 'evt-messy', status: '  Needs   Discovery  ', leadSource: 'Referral from partner' },
    { id: 'evt-copy', status: 'Booked', eventName: 'Same once', leadSource: 'Organic' },
    { id: 'evt-copy', status: 'Booked', eventName: 'Same once', leadSource: 'Organic' },
    { id: 'evt-clash', status: 'Booked', eventName: 'Conflict' },
    { id: 'evt-clash', status: 'Declined', eventName: 'Conflict' }
  ],
  gmailThreads: [
    { threadId: 'gmail-orphan', subject: 'Unassigned inquiry', lastMessageAt: '2026-11-22T10:00:00.000Z', lastDirection: 'inbound' }
  ],
  smsThreads: [
    {
      threadKey: 'sms-orphan',
      match: 'unmatched',
      newestAt: '2026-11-22T09:00:00.000Z',
      newestDirection: 'incoming',
      incoming: 1,
      outgoing: 0
    },
    {
      threadKey: 'sms-on-unknown',
      match: 'exact',
      eventId: 'evt-unknown-source',
      newestAt: '2026-11-22T08:00:00.000Z',
      newestDirection: 'incoming',
      incoming: 2,
      outgoing: 0
    }
  ]
});

const byId = (id) => inbox.records.find((row) => row.id === id);
const eventRows = inbox.records.filter((row) => String(row.id).startsWith('event:'));

assert.equal(inbox.pipeline.denominator, 17, 'every valid non-conflicting event is counted once');
assert.equal(eventRows.length, 17);
assert.deepEqual(inbox.pipeline.excluded.eventConflicts, ['evt-clash']);
assert.equal(eventRows.some((row) => row.eventId === 'evt-clash'), false);
assert.ok(inbox.pipeline.duplicateEventsCountedOnce.includes('evt-copy'));

const stageSum = Object.values(inbox.pipeline.stages).reduce((sum, value) => sum + value, 0);
assert.equal(stageSum, inbox.pipeline.denominator, 'every valid event is accounted in a lifecycle stage');

assert.equal(byId('event:evt-new').lifecycleRaw, 'New Lead');
assert.equal(byId('event:evt-new').pipelineStage, 'open');
assert.equal(byId('event:evt-discovery').lifecycleRaw, 'Needs Discovery');
assert.equal(byId('event:evt-quote').lifecycleRaw, 'Quote Needed');
assert.equal(byId('event:evt-proposal').lifecycleRaw, 'Proposal Sent');
assert.equal(byId('event:evt-deposit').pipelineStage, 'invoice_awaiting_deposit');
assert.equal(byId('event:evt-pay').pipelineStage, 'payment_processing');
assert.equal(byId('event:evt-booked').pipelineStage, 'booked');
assert.equal(byId('event:evt-done').pipelineStage, 'completed');
assert.equal(byId('event:evt-declined').pipelineStage, 'declined');
assert.equal(byId('event:evt-cancelled').pipelineStage, 'cancelled');
assert.equal(byId('event:evt-closed').pipelineStage, 'unknown_closure');
assert.equal(byId('event:evt-closed').lifecycleRaw, 'Closed');
assert.equal(byId('event:evt-outcome').pipelineStage, 'outcome_unverified');
assert.equal(byId('event:evt-outcome').lifecycleRaw, 'Outcome Unverified');
assert.equal(byId('event:evt-outcome').bucket, 'outcome_unverified');
assert.equal(byId('event:evt-unicode').lifecycleRaw, 'Booked \u2014 Payment Processing');
assert.equal(byId('event:evt-unicode').pipelineStage, 'payment_processing');
assert.notEqual(byId('event:evt-unicode').lifecycleRaw, 'Booked - Payment Processing');
assert.equal(byId('event:evt-messy').lifecycleRaw, '  Needs   Discovery  ');
assert.equal(byId('event:evt-messy').pipelineStage, 'open');
assert.notEqual(byId('event:evt-messy').lifecycleRaw, 'Needs Discovery');
assert.equal(inbox.pipeline.stages.outcomeUnverified, 1);
assert.equal(inbox.pipeline.stages.paymentProcessing, 2);
assert.equal(eventLane({ status: 'Outcome Unverified', eventDate: '2026-12-01' }, today).needsOutcomeReview, true);

assert.equal(byId('event:evt-new').acquisitionKind, 'organic');
assert.equal(byId('event:evt-discovery').acquisitionKind, 'referral');
assert.equal(byId('event:evt-quote').acquisitionKind, 'form');
assert.equal(byId('event:evt-proposal').acquisitionKind, 'recorded');
assert.equal(byId('event:evt-proposal').acquisitionLabel, 'Website');
assert.equal(byId('event:evt-utm').acquisitionKind, 'utm');
assert.equal(byId('event:evt-utm').acquisitionLabel, 'google / brand');
assert.equal(byId('event:evt-utm').acquisitionLeadSource, 'Phone');
assert.equal(byId('event:evt-utm').acquisitionLabel.includes('Phone'), false);
assert.equal(byId('event:evt-utm').channel, 'Gmail');
assert.notEqual(byId('event:evt-utm').acquisitionKind, 'Gmail');
assert.equal(byId('event:evt-unknown-source').acquisitionKind, 'unknown');
assert.equal(byId('event:evt-unknown-source').acquisitionLabel, '');
assert.equal(byId('event:evt-unknown-source').source, 'Unknown');
assert.equal(byId('event:evt-unknown-source').channel, 'SMS');
assert.notEqual(byId('event:evt-unknown-source').acquisitionKind, 'SMS');

const orphanGmail = byId('gmail:gmail-orphan');
const orphanSms = byId('sms:sms-orphan');
assert.equal(orphanGmail.channel, 'Gmail');
assert.equal(orphanGmail.acquisitionKind, 'unknown');
assert.equal(orphanGmail.acquisitionLabel, '');
assert.equal(orphanSms.channel, 'SMS');
assert.equal(orphanSms.acquisitionKind, 'unknown');
assert.equal(orphanSms.source, 'Unknown');

assert.equal(inbox.pipeline.sources.organic >= 1, true);
assert.equal(inbox.pipeline.sources.referral >= 1, true);
assert.equal(inbox.pipeline.sources.form >= 1, true);
assert.equal(inbox.pipeline.sources.utm, 1);
assert.equal(inbox.pipeline.sources.recorded >= 1, true);
assert.equal(inbox.pipeline.sources.unknown >= 1, true);

const prospectIds = new Set(inbox.pipeline.activeProspectEventIds);
assert.equal(prospectIds.has('evt-declined'), false);
assert.equal(prospectIds.has('evt-cancelled'), false);
assert.equal(prospectIds.has('evt-closed'), false);
assert.equal(prospectIds.has('evt-done'), false);
assert.equal(byId('event:evt-declined').bucket, 'declined');
assert.equal(byId('event:evt-cancelled').bucket, 'cancelled');
assert.equal(byId('event:evt-closed').bucket, 'unknown_closure');
assert.equal(byId('event:evt-done').bucket, 'resolved');
assert.ok(prospectIds.has('evt-new'));
assert.ok(prospectIds.has('evt-outcome'), 'outcome unverified stays reviewable, not treated as closed');
assert.equal(inbox.pipeline.excluded.declined, 1);
assert.equal(inbox.pipeline.excluded.cancelled, 1);
assert.ok(inbox.pipeline.excluded.closed >= 2);

assert.equal(inbox.pipeline.conversion.rate, null);
assert.match(inbox.pipeline.conversion.reason, /not a conversion rate/i);
assert.equal(inbox.pipeline.conversion.numerator, inbox.pipeline.stages.booked);

console.log('crm-attribution tests passed');
