import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  classifyStatus,
  eventLane,
  normalizeEventDate,
  normalizeStatus,
  proposalLinkState,
  quoteCoverage,
  redactedProposalUrl,
  validateProposalUrl
} = require('../public/v2/js/event-status.js');

const cases = [
  ['Invoice Sent / Awaiting Deposit', 'invoice_awaiting_deposit', 'pipeline'],
  ['Booked — Payment Processing', 'payment_processing', 'active'],
  ['Booked - Payment Processing', 'payment_processing', 'active'],
  ['Client Declined', 'declined', 'past'],
  ['Outcome Unverified', 'outcome_unverified', 'review'],
  ['Closed', 'unknown_closure', 'past'],
  ['Booked', 'booked', 'active'],
  ['Invoice Sent', 'invoice_sent', 'pipeline'],
  ['New Lead', 'open', 'pipeline'],
  ['Needs Discovery', 'open', 'pipeline'],
  ['Quote Needed', 'open', 'pipeline'],
  ['Proposal Sent', 'open', 'pipeline'],
  ['Completed', 'completed', 'past'],
  ['Declined', 'declined', 'past'],
  ['Cancelled', 'cancelled', 'past']
];
for (const [status, stage, lane] of cases) {
  const classified = classifyStatus(status);
  assert.equal(classified.stage, stage, status);
  assert.equal(classified.raw, status, `exact original preserved for ${status}`);
  assert.equal(classified.normalized, normalizeStatus(status), status);
  const laneInfo = eventLane({ status, eventDate: '2026-12-20' }, '2026-11-24');
  assert.equal(laneInfo.lane, lane, status);
  assert.equal(laneInfo.raw, status, status);
  assert.equal(laneInfo.normalized, classified.normalized, status);
}

const unicodeDash = 'Booked \u2014 Payment Processing';
const unicodeClassified = classifyStatus(unicodeDash);
assert.equal(unicodeClassified.raw, unicodeDash);
assert.equal(unicodeClassified.normalized, 'Booked - Payment Processing');
assert.equal(unicodeClassified.stage, 'payment_processing');
assert.notEqual(unicodeClassified.stage, 'booked');
assert.equal(eventLane({ status: unicodeDash, eventDate: '2026-12-20' }, '2026-11-24').raw, unicodeDash);
assert.equal(eventLane({ status: unicodeDash, eventDate: '2026-12-20' }, '2026-11-24').normalized, 'Booked - Payment Processing');

const enDash = 'Booked \u2013 Payment Processing';
assert.equal(classifyStatus(enDash).raw, enDash);
assert.equal(classifyStatus(enDash).normalized, 'Booked - Payment Processing');
assert.equal(classifyStatus(enDash).stage, 'payment_processing');

const messyWhitespace = '  Needs   Discovery  ';
const messyClassified = classifyStatus(messyWhitespace);
assert.equal(messyClassified.raw, messyWhitespace);
assert.equal(messyClassified.normalized, 'Needs Discovery');
assert.equal(messyClassified.stage, 'open');
assert.equal(eventLane({ status: messyWhitespace, eventDate: '2026-12-20' }, '2026-11-24').raw, messyWhitespace);
assert.equal(eventLane({ status: messyWhitespace, eventDate: '2026-12-20' }, '2026-11-24').lane, 'pipeline');

assert.equal(eventLane({ status: 'Outcome Unverified', eventDate: '2026-12-20' }, '2026-11-24').needsOutcomeReview, true);
assert.equal(classifyStatus('Outcome Unverified').stage, 'outcome_unverified');
assert.notEqual(classifyStatus('Outcome Unverified').stage, 'unknown');
assert.notEqual(classifyStatus('Closed').stage, 'completed');
assert.equal(classifyStatus('Booked — Payment Processing').stage, 'payment_processing');
assert.notEqual(classifyStatus('Booked — Payment Processing').stage, 'booked');
assert.equal(eventLane({ status: 'New Lead', eventDate: '2026-01-02' }, '2026-11-24').lane, 'past');
assert.equal(eventLane({ status: 'New Lead', eventDate: '2026-01-02' }, '2026-11-24').completed, false);
const slash = normalizeEventDate('1/2/2026');
assert.equal(slash.iso, '2026-01-02');
assert.equal(slash.timeZone, 'America/Los_Angeles');
assert.equal(normalizeEventDate('not a date').recognized, false);
const missingCost = quoteCoverage({ quote: [{ quantity: 1, unitPrice: 100 }] });
assert.equal(missingCost.pricedCents, 10000);
assert.equal(missingCost.costKnown, false);
const recordedZero = quoteCoverage({ quote: [{ quantity: 1, unitPrice: 0, internalCost: 0 }] });
assert.equal(recordedZero.recordedZero, true);
assert.equal(recordedZero.priced, false);
const loss = quoteCoverage({ quote: [{ quantity: 1, unitPrice: 100, internalCost: 150 }] });
assert.equal(loss.costKnown, true);
assert.equal(loss.pricedCents - loss.costCents, -5000);
const target = quoteCoverage({ setup: { targetQuote: 5000 } });
assert.equal(target.priced, false);
assert.equal(target.recordedTargetCents, 500000);
assert.equal(target.targetState, 'recorded');
assert.equal(quoteCoverage({ setup: { budgetRange: '$10,000–$20,000' } }).targetState, 'omitted');
assert.equal(quoteCoverage({ setup: { targetQuote: 0 } }).targetState, 'blank-or-zero');
const partial = quoteCoverage({ quote: [{ quantity: 1, unitPrice: 100 }, { quantity: 1 }] });
assert.equal(partial.linePartial, true);
assert.equal(partial.pricedCents, 10000);
assert.equal(partial.costKnown, false);
assert.equal(quoteCoverage({ quote: [{ quantity: 1, unitPrice: 100 }], setup: { targetQuote: 5000 } }).pricedCents, 10000);

// R07 — proposal URL validation and portfolio lane membership
assert.equal(validateProposalUrl('').reason, 'missing');
assert.equal(validateProposalUrl('   ').reason, 'missing');
assert.equal(validateProposalUrl('http://example.test/proposal').reason, 'invalid');
assert.equal(validateProposalUrl('https://user:pass@example.test/proposal').reason, 'invalid');
assert.equal(validateProposalUrl('not a url').reason, 'invalid');
assert.equal(validateProposalUrl('https://example.test/lead with spaces').reason, 'invalid');
const validProposal = validateProposalUrl('https://example.test/lead');
assert.equal(validProposal.ok, true);
assert.equal(validProposal.url, 'https://example.test/lead');
assert.equal(proposalLinkState({ proposalUrl: 'https://example.test/lead' }), 'Linked');
assert.equal(proposalLinkState({ proposalUrl: 'http://example.test/lead' }), 'Invalid link');
assert.equal(proposalLinkState({ proposalUrl: '' }), 'Not linked');
assert.equal(proposalLinkState({}), 'Not linked');
const tokenUrl = 'https://example.test/proposal?access_token=synthetic-secret-token';
assert.equal(validateProposalUrl(tokenUrl).ok, true);
assert.equal(redactedProposalUrl(tokenUrl), 'https://example.test/proposal');
assert.equal(redactedProposalUrl(tokenUrl).includes('synthetic-secret-token'), false);
assert.equal(redactedProposalUrl('http://example.test/x'), '[invalid proposal url]');
assert.equal(redactedProposalUrl(''), '');

const portfolioCases = [
  ['Booked — Payment Processing', '2026-12-10', 'payment_processing', 'active'],
  ['Booked', '2026-12-01', 'booked', 'active'],
  ['Client Declined', '2026-12-18', 'declined', 'past'],
  ['Completed', '2026-11-01', 'completed', 'past'],
  ['Outcome Unverified', '2026-12-19', 'outcome_unverified', 'review'],
  ['Closed', '2026-12-05', 'unknown_closure', 'past'],
  ['New Lead', '2026-01-02', 'open', 'past']
];
for (const [status, eventDate, stage, lane] of portfolioCases) {
  const info = eventLane({ status, eventDate }, '2026-11-24');
  assert.equal(info.stage, stage, status);
  assert.equal(info.lane, lane, status);
  if (stage === 'payment_processing') {
    assert.notEqual(info.stage, 'booked');
    assert.equal(info.lane, 'active');
  }
  if (stage === 'outcome_unverified') {
    assert.equal(info.needsOutcomeReview, true);
    assert.notEqual(info.lane, 'active');
  }
}

console.log('event status classification tests passed');
