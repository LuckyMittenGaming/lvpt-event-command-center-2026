import test from 'node:test';
import assert from 'node:assert/strict';
import { applyDiscount } from './discount.mjs';
test('20 percent discount reduces 100 to 80', () => assert.equal(applyDiscount(100, 20), 80));
test('10 percent discount reduces 50 to 45', () => assert.equal(applyDiscount(50, 10), 45));
