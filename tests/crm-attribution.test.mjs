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

const crm = require('../public/v2/js/lifecycle-command-center.js');

const utmLines = crm.acquisitionChannelLines(byId('event:evt-utm'));
assert.equal(utmLines.kind, 'utm');
assert.equal(utmLines.channel, 'Gmail');
assert.match(utmLines.acquisitionText, /Acquisition:.*utm/i);
assert.match(utmLines.channelText, /^Channel: Gmail$/);
assert.match(utmLines.combined, /Channel is not an acquisition source/i);
assert.equal(utmLines.kind === utmLines.channel, false);

const smsLines = crm.acquisitionChannelLines(byId('event:evt-unknown-source'));
assert.equal(smsLines.kind, 'unknown');
assert.equal(smsLines.channel, 'SMS');
assert.match(smsLines.acquisitionText, /Acquisition: Unknown/i);
assert.match(smsLines.channelText, /^Channel: SMS$/);
assert.notEqual(smsLines.kind, 'SMS');

const referralFromSourceOnly = crm.acquisitionChannelLines({
  source: 'Referral from partner',
  channel: 'Gmail'
});
assert.equal(referralFromSourceOnly.kind, 'referral');
assert.equal(referralFromSourceOnly.channel, 'Gmail');
assert.match(referralFromSourceOnly.combined, /Acquisition:.*referral/i);
assert.match(referralFromSourceOnly.combined, /Channel: Gmail/);

const sheetSummary = crm.summarizeEventAcquisition([
  { id: 'a', status: 'New Lead', leadSource: 'Organic Search' },
  { id: 'b', status: 'Booked', leadSource: 'Referral' },
  { id: 'c', status: 'Booked - Payment Processing', leadSource: 'Website form' },
  { id: 'd', status: 'New Lead', utmSource: 'google', utmCampaign: 'brand', leadSource: 'Phone' },
  { id: 'e', status: 'Needs Discovery', leadSource: '' }
]);
assert.equal(sheetSummary.sources.organic, 1);
assert.equal(sheetSummary.sources.referral, 1);
assert.equal(sheetSummary.sources.form, 1);
assert.equal(sheetSummary.sources.utm, 1);
assert.equal(sheetSummary.sources.unknown, 1);
assert.equal(sheetSummary.bookedShare.numerator, 1);
assert.equal(sheetSummary.bookedShare.denominator, 5);
assert.equal(sheetSummary.rate, null);
assert.match(sheetSummary.rateLabel, /Unavailable/i);
assert.match(sheetSummary.cohort, /Unavailable/i);
assert.match(sheetSummary.period, /Unavailable/i);
assert.match(sheetSummary.denominator, /Unavailable/i);
assert.match(sheetSummary.bookedShare.text, /Booked share:/i);
assert.match(sheetSummary.bookedShare.note, /not a conversion rate/i);
assert.match(sheetSummary.reason, /not a conversion rate/i);

const unavailablePanel = crm.formatAttributionPanel(crm.conversionReport(inbox.pipeline));
assert.match(unavailablePanel, /data-crm-attribution="panel"/);
assert.match(unavailablePanel, /data-crm-conversion-rate="unavailable"/);
assert.match(unavailablePanel, /Cohort: Unavailable/i);
assert.match(unavailablePanel, /Period: Unavailable/i);
assert.match(unavailablePanel, /Denominator: Unavailable/i);
assert.match(unavailablePanel, /Booked share:/i);
assert.match(unavailablePanel, /not a conversion rate/i);
assert.equal(/conversion rate:\s*\d/i.test(unavailablePanel), false);
assert.match(unavailablePanel, /data-crm-source-kind="organic"/);
assert.match(unavailablePanel, /Acquisition source stays separate from communication channel/i);

const eligible = crm.conversionReport({
  denominator: 10,
  stages: { booked: 2 },
  sources: { organic: 4, referral: 3, form: 1, utm: 1, recorded: 1, unknown: 0 },
  conversion: {
    cohort: '2026 Q3 website form leads',
    period: '2026-07-01 to 2026-09-30',
    outcomeNumerator: 2,
    outcomeDenominator: 8,
    numerator: 2,
    denominator: 10,
    rate: 0.25,
    reason: 'Eligible cohort conversion uses the outcome denominator.'
  }
});
assert.equal(eligible.canComputeRate, true);
assert.equal(eligible.rate, 0.25);
assert.match(eligible.cohort, /2026 Q3 website form leads/);
assert.match(eligible.period, /2026-07-01 to 2026-09-30/);
assert.match(eligible.denominator, /Conversion denominator: 8/);
assert.match(eligible.rateLabel, /25\.0%/);
assert.match(eligible.reason, /Eligible cohort conversion uses the outcome denominator/);
assert.equal(/No eligible cohort and period are defined/i.test(eligible.reason), false);
assert.match(eligible.bookedShare.text, /Booked share: 2 of 10/);
assert.match(eligible.bookedShare.note, /not a conversion rate/i);

const eligiblePanel = crm.formatAttributionPanel(eligible);
assert.match(eligiblePanel, /data-crm-conversion-rate="0\.25"/);
assert.match(eligiblePanel, /Cohort: 2026 Q3 website form leads/);
assert.match(eligiblePanel, /Period: 2026-07-01 to 2026-09-30/);
assert.match(eligiblePanel, /Denominator: Conversion denominator: 8/);
assert.match(eligiblePanel, /Eligible cohort conversion uses the outcome denominator/);
assert.equal(/No eligible cohort and period are defined/i.test(eligiblePanel), false);
assert.match(eligiblePanel, /Booked share: 2 of 10/);
assert.match(eligiblePanel, /not a conversion rate/i);

const derivedWithoutSuppliedRate = crm.conversionReport({
  denominator: 10,
  stages: { booked: 2 },
  conversion: {
    cohort: '2026 Q3 website form leads',
    period: '2026-07-01 to 2026-09-30',
    outcomeNumerator: 2,
    outcomeDenominator: 8
  }
});
assert.equal(derivedWithoutSuppliedRate.canComputeRate, true);
assert.equal(derivedWithoutSuppliedRate.rate, 0.25);
assert.match(derivedWithoutSuppliedRate.reason, /derived from the validated cohort outcome counts/i);
assert.equal(/No eligible cohort and period are defined/i.test(derivedWithoutSuppliedRate.reason), false);

const negativeCounts = crm.conversionReport({
  denominator: 10,
  conversion: {
    cohort: '2026 Q3 website form leads',
    period: '2026-07-01 to 2026-09-30',
    outcomeNumerator: -1,
    outcomeDenominator: 8,
    rate: 0.25
  }
});
assert.equal(negativeCounts.canComputeRate, false);
assert.equal(negativeCounts.rate, null);
assert.match(negativeCounts.reason, /must not be negative/i);

const numeratorExceedsDenominator = crm.conversionReport({
  denominator: 10,
  conversion: {
    cohort: '2026 Q3 website form leads',
    period: '2026-07-01 to 2026-09-30',
    outcomeNumerator: 9,
    outcomeDenominator: 8,
    rate: 1
  }
});
assert.equal(numeratorExceedsDenominator.canComputeRate, false);
assert.equal(numeratorExceedsDenominator.rate, null);
assert.match(numeratorExceedsDenominator.reason, /exceeds the outcome denominator/i);

const inconsistentRate = crm.conversionReport({
  denominator: 10,
  conversion: {
    cohort: '2026 Q3 website form leads',
    period: '2026-07-01 to 2026-09-30',
    outcomeNumerator: 2,
    outcomeDenominator: 8,
    rate: 0.5
  }
});
assert.equal(inconsistentRate.canComputeRate, false);
assert.equal(inconsistentRate.rate, null);
assert.match(inconsistentRate.reason, /does not match the validated outcome counts/i);

const inconsistentDenominators = crm.conversionReport({
  denominator: 10,
  conversion: {
    cohort: '2026 Q3 website form leads',
    period: '2026-07-01 to 2026-09-30',
    outcomeNumerator: 2,
    outcomeDenominator: 8,
    cohortDenominator: 10,
    rate: 0.25
  }
});
assert.equal(inconsistentDenominators.canComputeRate, false);
assert.equal(inconsistentDenominators.rate, null);
assert.match(inconsistentDenominators.reason, /outcome denominators are inconsistent/i);

const missingOutcomeNumerator = crm.conversionReport({
  denominator: 10,
  conversion: {
    cohort: '2026 Q3 website form leads',
    period: '2026-07-01 to 2026-09-30',
    outcomeDenominator: 8,
    numerator: 2,
    rate: 0.25
  }
});
assert.equal(missingOutcomeNumerator.canComputeRate, false);
assert.equal(missingOutcomeNumerator.rate, null);
assert.match(missingOutcomeNumerator.reason, /outcome numerator and outcome denominator/i);

console.log('crm-attribution tests passed');
