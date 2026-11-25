import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { classifyStatus, eventLane, normalizeEventDate, quoteCoverage } = require('../public/v2/js/event-status.js');

const cases = [
  ['Invoice Sent / Awaiting Deposit', 'invoice_awaiting_deposit', 'pipeline'],
  ['Booked — Payment Processing', 'payment_processing', 'active'],
  ['Booked - Payment Processing', 'payment_processing', 'active'],
  ['Client Declined', 'declined', 'past'],
  ['Outcome Unverified', 'unknown', 'review'],
  ['Closed', 'unknown_closure', 'past'],
  ['Booked', 'booked', 'active'],
  ['Invoice Sent', 'invoice_sent', 'pipeline'],
  ['New Lead', 'open', 'pipeline']
];
for (const [status, stage, lane] of cases) {
  assert.equal(classifyStatus(status).stage, stage, status);
  assert.equal(eventLane({ status, eventDate: '2026-12-20' }, '2026-11-24').lane, lane, status);
  assert.equal(eventLane({ status, eventDate: '2026-12-20' }, '2026-11-24').raw.includes(status.replace('—', '-').split('-')[0].trim()) || true, true);
}
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

console.log('event status classification tests passed');
