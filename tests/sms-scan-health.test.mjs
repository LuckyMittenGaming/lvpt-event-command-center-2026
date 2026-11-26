import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import {
  ANDROID_BRIDGE_PACKAGE,
  classifyBridgeHeartbeat,
  classifySmsScan,
  observedTime,
  SMS_BRIDGE_HEARTBEAT_UNVERIFIED,
  SMS_PAGE_CAP
} from '../lib/sms-scan-health.mjs';
import { validateBridgeStatus } from '../lib/sms-bridge.mjs';
import { classifyStoredCollection } from '../lib/source-reliability.mjs';

const require = createRequire(import.meta.url);
const { sourceStatus } = require('../public/v2/js/event-finance.js');

const now = Date.parse('2026-11-24T18:00:00.000Z');
const recentIngest = '2026-11-24T17:30:00.000Z';
const recentMessage = Date.parse('2026-11-24T17:00:00.000Z');
const oldIngest = '2026-11-05T05:36:06.000Z';
const oldMessage = Date.parse('2026-11-19T12:00:00.000Z');
const recentHeartbeat = '2026-11-24T17:50:00.000Z';
const staleHeartbeat = '2026-11-20T12:00:00.000Z';

/** Synthetic bridge status — no live collection, no real contacts. */
function bridgeStatus(overrides = {}) {
  return {
    device_id: '11111111-2222-4333-8444-555555555555',
    read_sms: true,
    receive_sms: true,
    monitoring: true,
    auto_sync: true,
    battery_unrestricted: true,
    cursor_sms_id: 42,
    accepted_last_batch: 3,
    last_failure: null,
    last_success_at: recentHeartbeat,
    ...overrides
  };
}

function row(message, ingest) {
  return {
    timestamp_ms: message,
    received_at: ingest,
    body: 'do not expose this message',
    contact_hash: 'a'.repeat(64),
    phone: '7025550100'
  };
}

function assertPrivate(result) {
  const encoded = JSON.stringify(result);
  assert.equal(encoded.includes('do not expose this message'), false);
  assert.equal(encoded.includes('7025550100'), false);
  assert.equal(encoded.includes('contact_hash'), false);
  assert.equal(encoded.includes('body_ciphertext'), false);
  assert.equal('status' in result.probe, false);
  assert.equal(result.status, sourceStatus(result.probe));
}

const failed = classifySmsScan({
  configured: true,
  now,
  pages: [
    { ok: true, full: true, rows: [row(recentMessage, recentIngest)] },
    { ok: false, reason: 'http' }
  ]
});
assertPrivate(failed);
assert.equal(failed.connected, true);
assert.equal(failed.coverage, 'partial');
assert.equal(failed.readComplete, false);
assert.equal(failed.unavailable, false);
assert.equal(failed.providerError, true);
assert.equal(failed.status, 'PARTIAL');
assert.equal(failed.fresh, false);
assert.equal(failed.newestMessageAt, '');
assert.equal(failed.newestIngestAt, '');
assert.equal(failed.newestIngestAmongRead, observedTime(recentIngest, now));
assert.equal(failed.countComplete, false);
assert.equal(failed.storedMessages, 1);

const stalled = classifySmsScan({
  configured: true,
  now,
  pages: [
    { ok: true, full: true, rows: [row(recentMessage, recentIngest)] },
    { ok: false, reason: 'cursor_stalled' }
  ]
});
assert.equal(stalled.coverage, 'partial');
assert.equal(stalled.fresh, false);
assert.match(stalled.detail, /cursor stopped advancing/);

const capped = classifySmsScan({
  configured: true,
  now,
  pages: Array.from({ length: SMS_PAGE_CAP + 1 }, () => ({ ok: true, full: true, rows: [row(recentMessage, recentIngest)] }))
});
assertPrivate(capped);
assert.equal(capped.pagesRead, SMS_PAGE_CAP);
assert.equal(capped.truncated, true);
assert.equal(capped.coverage, 'partial');
assert.equal(capped.providerError, false);
assert.equal(capped.status, 'PARTIAL');
assert.equal(capped.fresh, false);
assert.equal(capped.storedMessages, SMS_PAGE_CAP);
assert.equal(capped.newestIngestAt, '');

const stale = classifySmsScan({
  configured: true,
  now,
  pages: [{ ok: true, rows: [row(recentMessage, oldIngest)] }]
});
assertPrivate(stale);
assert.equal(stale.connected, true);
assert.equal(stale.coverage, 'read-complete');
assert.equal(stale.status, 'STALE');
assert.equal(stale.fresh, false);
assert.equal(stale.newestMessageAt, observedTime(recentMessage, now));
assert.equal(stale.newestIngestAt, observedTime(oldIngest, now));
assert.equal(stale.newestMessageAt > stale.newestIngestAt, true);

const missing = classifySmsScan({
  configured: true,
  now,
  pages: [{ ok: true, rows: [{ timestamp_ms: null, received_at: '' }] }]
});
assert.equal(missing.coverage, 'read-complete');
assert.equal(missing.status, 'NOT VERIFIED');
assert.equal(missing.fresh, false);
assert.equal(missing.newestMessageAt, '');
assert.equal(missing.newestIngestAt, '');
assert.equal(missing.invalidMessageTimestamps, 1);
assert.equal(missing.invalidIngestTimestamps, 1);
assert.equal(missing.storedMessages, 1);
assert.match(missing.detail, /missing or future timestamp/);

const future = classifySmsScan({
  configured: true,
  now,
  pages: [{ ok: true, rows: [row(now + 2 * 86400000, new Date(now + 2 * 86400000).toISOString())] }]
});
assert.equal(future.status, 'NOT VERIFIED');
assert.equal(future.fresh, false);
assert.equal(future.newestMessageAt, '');
assert.equal(future.newestIngestAt, '');
assert.equal(future.invalidMessageTimestamps, 1);
assert.equal(future.invalidIngestTimestamps, 1);
assert.equal(observedTime(now + 5 * 60 * 1000, now).length > 0, true);
assert.equal(observedTime(now + 5 * 60 * 1000 + 1, now), '');

const offline = classifySmsScan({
  configured: true,
  now,
  pages: [{ ok: false, reason: 'offline' }]
});
assert.equal(offline.connected, false);
assert.equal(offline.coverage, 'unavailable');
assert.equal(offline.unavailable, true);
assert.equal(offline.status, 'NOT CONNECTED');
assert.equal(offline.storedMessages, null);
assert.equal(offline.fresh, false);
assert.equal(offline.providerError, true);
assert.match(offline.detail, /not an empty inbox/);

const fresh = classifySmsScan({
  configured: true,
  now,
  pages: [{ ok: true, rows: [row(oldMessage, recentIngest)] }]
});
assertPrivate(fresh);
assert.equal(fresh.connected, true);
assert.equal(fresh.coverage, 'read-complete');
assert.equal(fresh.readComplete, true);
assert.equal(fresh.partial, false);
assert.equal(fresh.status, 'LIVE');
assert.equal(fresh.fresh, true);
assert.equal(fresh.newestIngestAt, observedTime(recentIngest, now));
assert.equal(fresh.newestMessageAt, observedTime(oldMessage, now));
assert.notEqual(fresh.newestMessageAt, fresh.newestIngestAt);
assert.equal(fresh.countComplete, true);
assert.equal(fresh.storedMessages, 1);

const exactly = classifySmsScan({
  configured: true,
  now,
  pages: [{ ok: true, rows: [row(oldMessage, new Date(now - 48 * 3600000).toISOString())] }]
});
const justOver = classifySmsScan({
  configured: true,
  now,
  pages: [{ ok: true, rows: [row(recentMessage, new Date(now - 48 * 3600000 - 1).toISOString())] }]
});
assert.equal(exactly.status, 'LIVE');
assert.equal(justOver.status, 'STALE');

const unconfigured = classifySmsScan({
  configured: false,
  now,
  pages: [{ ok: true, rows: [row(recentMessage, recentIngest)] }]
});
assert.equal(unconfigured.coverage, 'unavailable');
assert.equal(unconfigured.connected, false);
assert.equal(unconfigured.storedMessages, null);
assert.equal(unconfigured.fresh, false);
assert.match(unconfigured.detail, /not configured/);

const empty = classifySmsScan({ configured: true, now, pages: [{ ok: true, rows: [] }] });
assert.equal(empty.coverage, 'read-complete');
assert.equal(empty.connected, true);
assert.equal(empty.storedMessages, 0);
assert.equal(empty.status, 'NOT VERIFIED');
assert.match(empty.detail, /not a successful import/);

const uploadProbe = {
  connected: true,
  lastSuccess: observedTime(oldIngest, now),
  staleAfterHours: 48,
  now: new Date(now).toISOString()
};
assert.equal(sourceStatus(uploadProbe), 'STALE');
assert.equal(sourceStatus({ ...uploadProbe, lastSuccess: observedTime(recentIngest, now) }), 'LIVE');
assert.equal(sourceStatus({ ...uploadProbe, lastSuccess: '', partial: true }), 'PARTIAL');
assert.equal(observedTime('not-a-time', now), '');

const route = readFileSync(new URL('../app/api/sync/action-inbox/route.ts', import.meta.url), 'utf8');
assert.match(route, /select: 'contact_hash,direction,timestamp_ms,sms_id,received_at'/);
assert.match(route, /classifySmsScan/);
assert.match(route, /cursor_stalled/);
assert.match(route, /preview_only/);
assert.match(route, /denyPrivateRead/);
const routeGet = route.slice(route.indexOf('export async function GET'));
const ownerGate = routeGet.indexOf('denyPrivateRead');
const providerCall = routeGet.indexOf('appsScriptRequest');
assert.equal(ownerGate >= 0 && ownerGate < providerCall, true);
assert.match(route, /sheet_unconfigured/);
assert.match(route, /productionWrites: false/);
assert.match(route, /messageTextIncluded: false/);
assert.match(route, /!\('body_ciphertext' in row\)/);
assert.doesNotMatch(route, /select: '[^']*body/);
assert.doesNotMatch(route, /Date\.now\(\) - Date\.parse\(newestAt\)/);

const hub = readFileSync(new URL('../public/v2/js/unified-hub.js', import.meta.url), 'utf8');
assert.match(hub, /smsScanBlock/);
assert.match(hub, /newestIngestAt/);
assert.match(hub, /newestMessageAt/);
assert.match(hub, /Coverage:/);
assert.match(hub, /\/api\/sync\/action-inbox/);
assert.match(hub, /finance\.sourceStatus/);
assert.doesNotMatch(hub, /smsFresh \? 'fresh'/);

const picture = readFileSync(new URL('../app/api/sync/operating-picture/route.ts', import.meta.url), 'utf8');
const reliability = readFileSync(new URL('../lib/source-reliability.mjs', import.meta.url), 'utf8');
assert.match(picture, /observedTime/);
assert.match(picture, /classifyStoredCollection/);
assert.match(reliability, /Message time is not an import/);
assert.match(picture, /command_center_all_payments/);
assert.match(picture, /name: 'Financial source sync'/);
assert.doesNotMatch(picture, /new Date\(Number\(messages\[0\]\.timestamp_ms\)\)\.toISOString/);

function element() {
  return {
    innerHTML: '',
    className: '',
    id: '',
    hidden: false,
    querySelector() { return element(); },
    querySelectorAll() { return []; },
    addEventListener() {},
    before() {},
    setAttribute() {},
    getAttribute() { return ''; }
  };
}

global.window = global;
global.LVPTEventFinance = require('../public/v2/js/event-finance.js');
global.localStorage = { getItem: () => '', setItem() {}, removeItem() {} };
global.document = {
  getElementById: () => null,
  createElement: () => element(),
  querySelector: () => null
};
global.escapeHtml = (value) => String(value ?? '');

const responses = new Map();
global.fetch = async (url) => {
  const body = responses.get(url);
  if (!body) return { ok: false, status: 503, json: async () => ({ reason: 'not_stubbed' }) };
  return { ok: body.ok !== false, status: body.status || 200, json: async () => body };
};

require('../public/v2/js/unified-hub.js');

async function rendered(name) {
  const view = element();
  window.lvptRenderUnifiedView(view, name);
  for (let attempt = 0; attempt < 30 && !view.innerHTML.includes('badge'); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return view.innerHTML;
}

const partial = classifySmsScan({
  configured: true,
  now,
  pages: [
    { ok: true, full: true, rows: [row(recentMessage, recentIngest)] },
    { ok: false, reason: 'offline' }
  ]
});
responses.set('/api/sync/operating-picture', {
  ok: true,
  jobs: [
    { name: 'Financial source sync', connected: true, lastAttempt: recentIngest, lastSuccess: recentIngest, recordsExamined: 3, recordsCreated: 0, staleAfterHours: 48, now: new Date(now).toISOString(), detail: 'Read 3 payment rows and 0 payout rows. No financial row was written.' },
    { name: 'Android SMS upload freshness', status: 'UNVERIFIED', connected: false, lastSuccess: '', recordsExamined: 12, recordsCreated: 0, detail: 'No upload has arrived since the November 5 historical import.' }
  ]
});
responses.set('/api/sync/action-inbox', {
  ok: true,
  records: [],
  counts: {},
  sources: { events: 0, gmailRows: 2, newestGmail: oldIngest, gmailFresh: false, rcsMessages: 0, sms: partial },
  smsProbe: partial.probe,
  gmail: { blocker: 'Production Gmail Activity writes stay off.', historicalRowsPreserved: 2, stagingUnattended: 'not_observable_from_this_deployment' }
});

const healthHtml = await rendered('health');
assert.match(healthHtml, /Financial source sync/);
assert.match(healthHtml, /Read 3 payment rows/);
assert.match(healthHtml, /SMS metadata scan/);
assert.match(healthHtml, /PARTIAL/);
assert.match(healthHtml, /Coverage: Partial/);
assert.match(healthHtml, /UNVERIFIED/);
assert.equal(healthHtml.indexOf('Coverage: Partial') < healthHtml.indexOf('>LIVE<'), true);

const actionHtml = await rendered('action');
assert.match(actionHtml, /No records are listed/);
assert.match(actionHtml, /not proof that the inbox is empty/);
assert.match(actionHtml, /PARTIAL/);
assert.match(actionHtml, /Latest successful import: No valid import time/);
assert.equal(actionHtml.includes('>LIVE<'), false);

if (typeof window.lvptClearOwnerReads === 'function') window.lvptClearOwnerReads();
const live = classifySmsScan({
  configured: true,
  now,
  pages: [{ ok: true, rows: [row(oldMessage, recentIngest)] }]
});
responses.set('/api/sync/action-inbox', {
  ok: true,
  records: [],
  counts: { actionRequired: 0, review: 0, readyForApproval: 0, vendorExcluded: 0 },
  sources: { events: 1, gmailRows: 0, rcsMessages: 0, sms: live },
  smsProbe: live.probe,
  gmail: { blocker: 'Production Gmail Activity writes stay off.', historicalRowsPreserved: 0, stagingUnattended: 'not_observable_from_this_deployment' }
});
const liveHtml = await rendered('action');
assert.match(liveHtml, />LIVE</);
assert.match(liveHtml, /Coverage: Read complete/);
assert.match(liveHtml, /Connected\./);
assert.match(liveHtml, new RegExp(live.newestIngestAt));
assert.match(liveHtml, new RegExp(live.newestMessageAt));
assert.match(liveHtml, /No lead or follow-up records were returned/);

if (typeof window.lvptClearOwnerReads === 'function') window.lvptClearOwnerReads();
responses.set('/api/sync/action-inbox', { ok: false, status: 502, reason: 'action_inbox_unavailable' });
const errorHtml = await rendered('action');
assert.match(errorHtml, /action_inbox_unavailable/);
assert.equal(errorHtml.includes('>LIVE<'), false);
assert.equal(errorHtml.includes('stored metadata rows'), false);

// --- R14 / T25: bridge heartbeat contract (offline; no collection initiated) ---
assert.equal(validateBridgeStatus({ body: 'secret', phone: '7025550100', device_id: '11111111-2222-4333-8444-555555555555' }), null);
assert.equal(validateBridgeStatus({ ...bridgeStatus(), ciphertext: 'x' }), null);

const missingHeartbeat = classifyBridgeHeartbeat({
  status: null,
  historicalRowCount: 12,
  now
});
assert.equal(missingHeartbeat.verified, false);
assert.equal(missingHeartbeat.status, 'NOT VERIFIED');
assert.equal(missingHeartbeat.fresh, false);
assert.equal(missingHeartbeat.heartbeat, null);
assert.equal(missingHeartbeat.historicalImpliesSync, false);
assert.equal(missingHeartbeat.historicalRowCount, 12);
assert.match(missingHeartbeat.detail, /Historical stored rows/);
assert.match(missingHeartbeat.detail, /not this heartbeat/);
assert.equal(missingHeartbeat.detail.includes(SMS_BRIDGE_HEARTBEAT_UNVERIFIED.slice(0, 40)), true);
assert.equal(JSON.stringify(missingHeartbeat).includes('7025550100'), false);
assert.equal(JSON.stringify(missingHeartbeat).includes('body'), false);

const emptySuccess = classifyBridgeHeartbeat({
  status: bridgeStatus({ last_success_at: null, last_failure: 'network_timeout' }),
  historicalRowCount: 99,
  now
});
assert.equal(emptySuccess.verified, false);
assert.equal(emptySuccess.status, 'NOT VERIFIED');
assert.equal(emptySuccess.collectorFailure, true);
assert.equal(emptySuccess.heartbeat, null);
assert.equal(emptySuccess.historicalImpliesSync, false);
assert.match(emptySuccess.detail, /last_success_at is missing/);
assert.match(emptySuccess.detail, /network_timeout/);

const currentHeartbeat = classifyBridgeHeartbeat({
  status: bridgeStatus(),
  historicalRowCount: 12,
  now
});
assert.equal(currentHeartbeat.verified, true);
assert.equal(currentHeartbeat.status, 'LIVE');
assert.equal(currentHeartbeat.fresh, true);
assert.equal(currentHeartbeat.collectorFailure, false);
assert.equal(currentHeartbeat.orderingUncertain, false);
assert.equal(currentHeartbeat.lastSuccessAt, recentHeartbeat);
assert.equal(currentHeartbeat.priorLastSuccessAt, recentHeartbeat);
assert.deepEqual(currentHeartbeat.heartbeat, { read: true, lastSuccessAt: recentHeartbeat });
assert.equal(currentHeartbeat.probe.owner, ANDROID_BRIDGE_PACKAGE);
assert.equal(currentHeartbeat.historicalImpliesSync, false);
assert.match(currentHeartbeat.detail, /collector execution evidence/);

const successWithUnresolvedFailure = classifyBridgeHeartbeat({
  status: bridgeStatus({ last_success_at: recentHeartbeat, last_failure: 'sync_http_502' }),
  historicalRowCount: 12,
  now
});
assert.equal(successWithUnresolvedFailure.priorLastSuccessAt, recentHeartbeat);
assert.equal(successWithUnresolvedFailure.lastSuccessAt, recentHeartbeat);
assert.equal(successWithUnresolvedFailure.collectorFailure, true);
assert.equal(successWithUnresolvedFailure.orderingUncertain, true);
assert.equal(successWithUnresolvedFailure.verified, false);
assert.equal(successWithUnresolvedFailure.fresh, false);
assert.notEqual(successWithUnresolvedFailure.status, 'LIVE');
assert.equal(successWithUnresolvedFailure.status, 'NOT VERIFIED');
assert.equal(successWithUnresolvedFailure.heartbeat, null);
assert.equal(successWithUnresolvedFailure.probe.lastSuccess, '');
assert.match(successWithUnresolvedFailure.detail, /ordering cannot be established/);
assert.match(successWithUnresolvedFailure.detail, /not treated as healthy or current/);
assert.match(successWithUnresolvedFailure.detail, /sync_http_502/);
assert.match(successWithUnresolvedFailure.detail, /preserved separately/);

const staleBridge = classifyBridgeHeartbeat({
  status: bridgeStatus({ last_success_at: staleHeartbeat }),
  now
});
assert.equal(staleBridge.verified, true);
assert.equal(staleBridge.status, 'STALE');
assert.equal(staleBridge.fresh, false);
assert.equal(staleBridge.orderingUncertain, false);

const storedWithoutHeartbeat = classifyStoredCollection({
  storeReached: true,
  newestIngestAt: recentIngest,
  newestMessageAt: observedTime(oldMessage, now),
  rowCount: 12,
  recentImportCount: 1,
  heartbeat: missingHeartbeat.heartbeat,
  now
});
assert.equal(storedWithoutHeartbeat.heartbeatVerified, false);
assert.equal(storedWithoutHeartbeat.collectionLive, false);
assert.equal(storedWithoutHeartbeat.uploadStatus, 'UNVERIFIED');
assert.equal(storedWithoutHeartbeat.heartbeatStatus, 'NOT VERIFIED');
assert.notEqual(storedWithoutHeartbeat.uploadStatus, 'LIVE');

const storedWithHeartbeat = classifyStoredCollection({
  storeReached: true,
  newestIngestAt: recentIngest,
  newestMessageAt: observedTime(oldMessage, now),
  rowCount: 12,
  recentImportCount: 1,
  heartbeat: currentHeartbeat.heartbeat,
  now
});
assert.equal(storedWithHeartbeat.heartbeatVerified, true);
assert.equal(storedWithHeartbeat.collectionLive, true);
assert.equal(storedWithHeartbeat.heartbeat.lastSuccess, recentHeartbeat);
assert.notEqual(storedWithHeartbeat.heartbeat.lastSuccess, storedWithHeartbeat.newestMessageAt);
assert.notEqual(storedWithHeartbeat.heartbeat.lastSuccess, storedWithHeartbeat.newestIngestAt);

const checklist = readFileSync(new URL('../docs/android-sms-operational-checklist.md', import.meta.url), 'utf8');
assert.match(checklist, /com\.lvpt\.smsbridge/);
assert.match(checklist, /last_success_at/);
assert.match(checklist, /LVPT_SMS_STAGING_ALLOWED_NUMBERS/);
assert.match(checklist, /lib\/sms-bridge\.mjs/);
assert.match(checklist, /feature\/lvpt-sms-bridge-prototype/);
assert.match(checklist, /AES-256-GCM|body_ciphertext/);
assert.match(checklist, /on_conflict=tenant_id,device_id,sms_id|ignore-duplicates/);
assert.doesNotMatch(checklist, /702555\d{4}/);
assert.doesNotMatch(checklist, /eyJ[A-Za-z0-9_-]{10,}/);

const bridgeLib = readFileSync(new URL('../lib/sms-bridge.mjs', import.meta.url), 'utf8');
assert.match(bridgeLib, /export function validateBridgeStatus/);
assert.match(bridgeLib, /last_success_at/);
assert.match(picture, /heartbeat: null/);
assert.match(picture, /com\.lvpt\.smsbridge/);

const ingest = readFileSync(new URL('../app/api/sms/staging/ingest/route.ts', import.meta.url), 'utf8');
const stagingLib = readFileSync(new URL('../app/api/sms/staging/_lib.ts', import.meta.url), 'utf8');
assert.match(ingest, /ignore-duplicates/);
assert.match(stagingLib, /allowedNumbers/);
assert.match(stagingLib, /encryptBatch/);
assert.match(stagingLib, /createCipheriv\('aes-256-gcm'/);
assert.match(stagingLib, /seen\.has\(sms_id\)/);
assert.doesNotMatch(ingest, /fetch\(['\"]https:\/\/.*supabase/);

console.log('sms scan health tests passed');
