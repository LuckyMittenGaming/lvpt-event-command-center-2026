import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const route = readFileSync('app/api/sms/staging/rcs-ingest/route.ts', 'utf8') + readFileSync('lib/rcs-staging.mjs', 'utf8');
assert.equal(route.includes('production_ingest_disabled'), true);
assert.equal(route.includes('lvpt_rcs_staging'), true);
assert.equal(route.includes('lvpt_sms_staging'), false);
assert.equal(route.includes('sendEnabled: false'), true);
assert.equal(route.includes('merged: false'), true);
assert.equal(route.includes("'body'"), true);
assert.equal(route.includes('ignore-duplicates'), true);
assert.equal(route.includes('x-lvpt-rcs-sync-token'), true);
assert.equal(route.includes('LVPT_RCS_STAGING_TOKEN_SHA256'), true);
assert.equal(route.includes('LVPT_SMS_STAGING_TOKEN_SHA256'), false);

const live = readFileSync('services/google-messages-collector/internal/live/gateway_libgm.go', 'utf8');
for (const forbidden of ['SendMessage(', 'MarkRead(', 'SendReaction(', 'DeleteMessage(', 'SetTyping(']) {
  assert.equal(live.includes(forbidden), false, forbidden);
}
assert.equal(live.includes('StartGaiaPairing'), true);
assert.equal(live.includes('FetchMessages'), true);
assert.equal(live.includes('//go:build livelibgm'), true);

const off = readFileSync('services/google-messages-collector/cmd/lvpt-rcs-collector/live_off.go', 'utf8');
assert.equal(off.includes('no Google session was opened'), true);

console.log('rcs live boundary tests passed');
