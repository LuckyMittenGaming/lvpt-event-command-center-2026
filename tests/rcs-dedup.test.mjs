import assert from 'node:assert/strict';
import { reconcileMessages } from '../lib/rcs-dedup.mjs';

const key = Buffer.alloc(32, 9);
const phone = '7025550199';
const body = 'Synthetic rehearsal message 1';

const result = reconcileMessages([
  { source: 'sms', deviceId: 'device-a', smsId: 41, phone, direction: 'incoming', timestampMs: 1_700_000_000_000, body },
  { source: 'sms', deviceId: 'device-a', smsId: 41, phone, direction: 'incoming', timestampMs: 1_700_000_000_000, body },
  { source: 'rcs', googleMessageId: 'gm-1', phone: '+1 (702) 555-0199', direction: 'incoming', timestampMs: 1_700_000_002_000, body, protocol: 4 },
  { source: 'rcs', googleMessageId: 'gm-1', phone, direction: 'incoming', timestampMs: 1_700_000_002_000, body, protocol: 4 },
  { source: 'rcs', googleMessageId: 'gm-2', phone, direction: 'incoming', timestampMs: 1_700_000_002_000, body: 'A different synthetic sentence', protocol: 4 },
  { source: 'rcs', googleMessageId: 'gm-3', phone, direction: 'outgoing', timestampMs: 1_700_000_002_000, body, protocol: 4 },
  { source: 'rcs', googleMessageId: 'gm-4', phone, direction: 'incoming', timestampMs: 1_700_000_030_000, body, protocol: 4 },
  { source: 'rcs', googleMessageId: '', phone, direction: 'incoming', timestampMs: 1_700_000_040_000, body },
  { source: 'rcs', googleMessageId: 'gm-rcs-only', phone: '7025550100', direction: 'outgoing', timestampMs: 1_700_000_050_000, body: 'RCS only synthetic', protocol: 4 }
], key);

assert.deepEqual(result.kept.map((row) => row.id), ['sms:device-a:41', 'rcs:gm-1', 'rcs:gm-2', 'rcs:gm-3', 'rcs:gm-4', 'rcs:gm-rcs-only']);
assert.deepEqual(result.links, [{
  status: 'possible_duplicate',
  left: 'sms:device-a:41',
  right: 'rcs:gm-1',
  reason: 'contact_direction_fingerprint_timestamp'
}]);
assert.equal(result.duplicates.filter((row) => row.reason === 'same_source_id').length, 2);
assert.equal(result.duplicates.some((row) => row.reason === 'sms_rcs_overlap'), false);
assert.equal(result.review.length, 1);
assert.equal(JSON.stringify(result).includes('702555'), false);
assert.equal(JSON.stringify(result).includes('Synthetic'), false);

console.log('rcs dedup synthetic tests passed');
