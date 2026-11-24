import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyDiscount } from './discount.js';

// Test-only fixture; this draft PR is never to be merged.
test('20 percent off 100 equals 80', () => {
  assert.equal(applyDiscount(100, 20), 80);
});
test('10 percent off 50 equals 45', () => {
  assert.equal(applyDiscount(50, 10), 45);
});
