import assert from 'node:assert/strict';
import { buildBusinessOverhead, normalizeBusinessExpense, BUSINESS_EXPENSE_HEADERS } from '../lib/business-expenses.mjs';

assert.deepEqual(BUSINESS_EXPENSE_HEADERS, [
  'expense_id',
  'date',
  'vendor',
  'category',
  'description',
  'amount',
  'payment_method',
  'status',
  'receipt_url',
  'notes'
]);

const missing = buildBusinessOverhead(null);
assert.equal(missing.available, false);
assert.equal(missing.coverage, 'unavailable');
assert.equal(missing.totalCents, null);
assert.match(missing.note, /unavailable, not zero/i);

const empty = buildBusinessOverhead([]);
assert.equal(empty.available, true);
assert.equal(empty.coverage, 'empty');
assert.equal(empty.totalCents, 0);

const row = normalizeBusinessExpense({
  expense_id: 'exp-rent-1',
  date: '2025-11-01',
  vendor: 'Workspace LLC',
  category: 'Rent',
  description: 'November office',
  amount: 1200.5,
  payment_method: 'ACH',
  status: 'Paid',
  receipt_url: 'https://example.test/receipt',
  notes: 'Business overhead'
});
assert.equal(row.expenseId, 'exp-rent-1');
assert.equal(row.amountCents, 120050);

const filled = buildBusinessOverhead([row, {
  expenseId: 'exp-software',
  vendor: 'Tools Co',
  amount: 99,
  status: 'Paid'
}]);
assert.equal(filled.coverage, 'complete');
assert.equal(filled.totalCents, 120050 + 9900);
assert.match(filled.note, /separate from Direct Event Costs/i);

const gap = buildBusinessOverhead([{ expense_id: 'exp-gap', vendor: 'Unknown', amount: null }]);
assert.equal(gap.coverage, 'incomplete');
assert.equal(gap.totalCents, null);

// Re-normalizing already-normalized rows must not multiply cents again.
const again = buildBusinessOverhead([row]);
assert.equal(again.totalCents, 120050);

console.log('business-expenses.test.mjs: ok');
