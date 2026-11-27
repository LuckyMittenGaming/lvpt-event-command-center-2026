import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { createReviewSession } from '../lib/sms-review-session.mjs';
import { privateReadDecision } from '../lib/owner-read-guard.mjs';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const key = randomBytes(32);
const hash = 'ab'.repeat(32);
const host = 'preview.example.test';
const env = {
  LVPT_SMS_STAGING_DATA_KEY_BASE64: key.toString('base64'),
  LVPT_SMS_STAGING_TOKEN_SHA256: hash
};

function request(headers = {}, url = `https://${host}/api/sync/action-inbox`) {
  return new Request(url, { headers });
}

function cookie(now = Date.now()) {
  return `__Host-lvpt-sms-review=${createReviewSession(key, hash, host, now)}`;
}

function assertDeniedUnauthorized(decision) {
  assert.equal(decision.allow, false);
  assert.equal(decision.status, 401);
  assert.equal(decision.reason, 'unauthorized');
}

function jsonNoStore(value, status = 200) {
  return Response.json(value, {
    status,
    headers: { 'Cache-Control': 'no-store' }
  });
}

function denyPrivateRead(request) {
  const decision = privateReadDecision(request, env);
  if (decision.allow) return null;
  return jsonNoStore({
    ok: false,
    reason: decision.reason,
    readOnly: true,
    sendEnabled: false
  }, decision.status);
}

/**
 * Isolated handler harness for GET/POST /api/sync/events.
 * Real privateReadDecision drives denial; provider adapters are mocked counters.
 */
function loadEventsHandlerHarness() {
  const eventsRoute = readFileSync(join(root, 'app/api/sync/events/route.ts'), 'utf8');
  const js = ts.transpileModule(eventsRoute, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const counters = {
    providerReads: 0,
    providerMutations: 0,
    appsScriptActions: []
  };
  const mod = { exports: {} };
  const source = {
    '../_lib': {
      appsScriptRequest: async (action, payload = {}) => {
        counters.appsScriptActions.push({ action, payload });
        // Any list/read action counts as a provider read; write-shaped actions as mutations.
        if (/^(create|update|delete|upload|write|replace|mutate)/i.test(String(action))
          || Object.keys(payload || {}).some((key) => /event|document|task|payment/i.test(key) && key !== 'eventKey')) {
          counters.providerMutations += 1;
        } else {
          counters.providerReads += 1;
        }
        if (action === 'listEvents') {
          return { events: [{ id: 'evt-synthetic', eventName: 'Synthetic Fixture' }], serverTime: '2026-11-26T00:00:00Z' };
        }
        throw new Error(`Unexpected Apps Script action in guard harness: ${action}`);
      },
      authorizeAppRequest: (req) => req.headers.get('x-lvpt-sync-key') === 'synthetic-valid-sync-key',
      unauthorizedResponse: () => Response.json({ message: 'Invalid LVPT app sync key.' }, { status: 401 }),
      serverError: (error) => Response.json({
        message: error instanceof Error ? error.message : 'Unexpected server error.'
      }, { status: 500 })
    },
    '../_owner-read': { denyPrivateRead },
    '../../sms/staging/_lib': { jsonNoStore }
  };
  vm.runInNewContext(js, {
    module: mod,
    exports: mod.exports,
    require: (id) => {
      if (Object.prototype.hasOwnProperty.call(source, id)) return source[id];
      throw new Error(`Unexpected import ${id}`);
    },
    Response,
    Request,
    URL,
    console
  }, { filename: 'events-route.owner-read.mock.cjs', timeout: 1000 });
  return { counters, GET: mod.exports.GET, POST: mod.exports.POST };
}

async function invokeGet(get, headers = {}) {
  const response = await get(new Request(`https://${host}/api/sync/events`, { headers }));
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
}

// --- Decision-level synthetic cases ---

const absent = privateReadDecision(request(), env);
assertDeniedUnauthorized(absent);

const forgedOriginOnly = privateReadDecision(request({
  origin: `https://${host}`
}), env);
assertDeniedUnauthorized(forgedOriginOnly);

const spoofedForeignOrigin = privateReadDecision(request({
  origin: 'https://evil.example'
}), env);
assertDeniedUnauthorized(spoofedForeignOrigin);

const expired = privateReadDecision(request({
  cookie: cookie(Date.now() - 8 * 24 * 3600 * 1000)
}), env);
assertDeniedUnauthorized(expired);

const forgedCookie = `__Host-lvpt-sms-review=v1.${Math.floor(Date.now() / 1000) + 3600}.${'A'.repeat(43)}`;
assertDeniedUnauthorized(privateReadDecision(request({ cookie: forgedCookie }), env));

assertDeniedUnauthorized(privateReadDecision(request({ cookie: cookie() }), {}));
assertDeniedUnauthorized(privateReadDecision(request({ cookie: cookie() }), {
  LVPT_SMS_STAGING_DATA_KEY_BASE64: Buffer.alloc(16).toString('base64'),
  LVPT_SMS_STAGING_TOKEN_SHA256: hash
}));
assertDeniedUnauthorized(privateReadDecision(request({ cookie: cookie() }), {
  LVPT_SMS_STAGING_DATA_KEY_BASE64: key.toString('base64'),
  LVPT_SMS_STAGING_TOKEN_SHA256: 'cd'.repeat(32)
}));

const approved = privateReadDecision(request({ cookie: cookie() }), env);
assert.equal(approved.allow, true);

const approvedSameOrigin = privateReadDecision(request({
  cookie: cookie(),
  origin: `https://${host}`
}), env);
assert.equal(approvedSameOrigin.allow, true);

const approvedForeign = privateReadDecision(request({
  cookie: cookie(),
  origin: 'https://evil.example'
}), env);
assert.equal(approvedForeign.allow, false);
assert.equal(approvedForeign.status, 403);
assert.equal(approvedForeign.reason, 'same_origin_required');

const approvedMalformedOrigin = privateReadDecision(request({
  cookie: cookie(),
  origin: 'not-a-url'
}), env);
assert.equal(approvedMalformedOrigin.allow, false);
assert.equal(approvedMalformedOrigin.status, 403);
assert.equal(approvedMalformedOrigin.reason, 'same_origin_required');

const otherHostCookie = `__Host-lvpt-sms-review=${createReviewSession(key, hash, 'other.example.test')}`;
assertDeniedUnauthorized(privateReadDecision(request({ cookie: otherHostCookie }), env));

// --- Ordering: verification-before-Origin must use the call site, not the import ---
const guardSource = readFileSync(new URL('../lib/owner-read-guard.mjs', import.meta.url), 'utf8');
assert.match(guardSource, /verifyReviewSession/);
assert.match(guardSource, /same_origin_required/);
assert.doesNotMatch(guardSource, /x-lvpt-sync-key|x-lvpt-sms-sync-token/);
const decisionBody = guardSource.slice(guardSource.indexOf('export function privateReadDecision'));
const sessionCallAt = decisionBody.search(/(?<![A-Za-z0-9_$])verifyReviewSession\s*\(/);
const originCheckAt = decisionBody.indexOf('request.headers.get(\'origin\')');
assert.equal(sessionCallAt >= 0, true, 'verifyReviewSession call must appear inside privateReadDecision');
assert.equal(originCheckAt > sessionCallAt, true, 'Origin must be read only after verifyReviewSession runs');
// Prove the import line is not what sessionCallAt matched.
const importAt = guardSource.indexOf('verifyReviewSession');
assert.equal(importAt >= 0 && importAt < guardSource.indexOf('export function privateReadDecision'), true);

const gate = readFileSync(new URL('../app/api/sync/_owner-read.ts', import.meta.url), 'utf8');
assert.match(gate, /privateReadDecision/);
assert.doesNotMatch(gate, /x-lvpt-sync-key|x-lvpt-sms-sync-token/);
assert.match(gate, /readOnly:\s*true/);
assert.match(gate, /sendEnabled:\s*false/);

// --- Handler-level mocked provider counters (events GET) ---
const harness = loadEventsHandlerHarness();

async function assertDeniedBeforeProvider(headers, expectedStatus, expectedReason) {
  const beforeReads = harness.counters.providerReads;
  const beforeMutations = harness.counters.providerMutations;
  const beforeActions = harness.counters.appsScriptActions.length;
  const result = await invokeGet(harness.GET, headers);
  assert.equal(result.status, expectedStatus);
  assert.equal(result.body.ok, false);
  assert.equal(result.body.reason, expectedReason);
  assert.equal(result.body.readOnly, true);
  assert.equal(harness.counters.providerReads, beforeReads, 'denied request must not read providers');
  assert.equal(harness.counters.providerMutations, beforeMutations, 'denied request must not mutate providers');
  assert.equal(harness.counters.appsScriptActions.length, beforeActions, 'denied request must not call Apps Script');
  return result;
}

await assertDeniedBeforeProvider({}, 401, 'unauthorized'); // missing session
await assertDeniedBeforeProvider({ origin: `https://${host}` }, 401, 'unauthorized'); // Origin-only
await assertDeniedBeforeProvider({ origin: 'https://evil.example' }, 401, 'unauthorized'); // forged Origin alone
await assertDeniedBeforeProvider({
  cookie: cookie(Date.now() - 8 * 24 * 3600 * 1000)
}, 401, 'unauthorized'); // expired
await assertDeniedBeforeProvider({ cookie: forgedCookie }, 401, 'unauthorized'); // forged signature
await assertDeniedBeforeProvider({
  cookie: cookie(),
  origin: 'https://evil.example'
}, 403, 'same_origin_required'); // valid session + foreign Origin

// Authorized positive control: mocks intercept the real handler provider call.
const authorizedResult = await invokeGet(harness.GET, { cookie: cookie() });
assert.equal(authorizedResult.status, 200);
assert.equal(authorizedResult.body.ok, true);
assert.equal(authorizedResult.body.writesPerformed, false);
assert.equal(authorizedResult.body.eventCount, 1);
assert.equal(harness.counters.providerReads, 1, 'authorized GET must hit the mocked Apps Script read exactly once');
assert.equal(harness.counters.providerMutations, 0);
assert.deepEqual(harness.counters.appsScriptActions.map((item) => item.action), ['listEvents']);

const authorizedSameOrigin = await invokeGet(harness.GET, {
  cookie: cookie(),
  origin: `https://${host}`
});
assert.equal(authorizedSameOrigin.status, 200);
assert.equal(harness.counters.providerReads, 2);
assert.equal(harness.counters.providerMutations, 0);

// POST path: unauthorized and authorized bulk writes never reach Apps Script.
const postUnauthorized = await harness.POST(new Request(`https://${host}/api/sync/events`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-lvpt-sync-key': 'wrong' },
  body: JSON.stringify({ events: [{ id: 'evt-x' }] })
}));
assert.equal(postUnauthorized.status, 401);
assert.equal(harness.counters.providerMutations, 0);
assert.equal(harness.counters.appsScriptActions.length, 2); // only the two authorized GETs above

const postAuthorizedDisabled = await harness.POST(new Request(`https://${host}/api/sync/events`, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'x-lvpt-sync-key': 'synthetic-valid-sync-key'
  },
  body: JSON.stringify({ events: [{ id: 'evt-x' }] })
}));
assert.equal(postAuthorizedDisabled.status, 403);
const postBody = await postAuthorizedDisabled.json();
assert.equal(postBody.writesPerformed, false);
assert.equal(postBody.reason, 'bulk_event_mutation_disabled');
assert.equal(harness.counters.providerMutations, 0);
assert.equal(harness.counters.appsScriptActions.length, 2);

/**
 * Owner-authorized remediation: sync/status and gmail/status fail closed with denyPrivateRead.
 */
function loadSyncStatusHarness() {
  const routeSource = readFileSync(join(root, 'app/api/sync/status/route.ts'), 'utf8');
  const js = ts.transpileModule(routeSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const counters = { providerReads: 0, appsScriptActions: [], envReads: 0 };
  const mod = { exports: {} };
  const source = {
    '../_lib': {
      appsScriptRequest: async (action) => {
        counters.providerReads += 1;
        counters.appsScriptActions.push(action);
        return { ok: true, spreadsheetTitle: 'Synthetic Status Sheet' };
      },
      syncConfigured: () => {
        counters.envReads += 1;
        return true;
      },
      syncEnvironment: {
        get appSyncKey() {
          counters.envReads += 1;
          return 'synthetic-app-sync-key';
        }
      }
    },
    '../_owner-read': { denyPrivateRead }
  };
  vm.runInNewContext(js, {
    module: mod,
    exports: mod.exports,
    require: (id) => {
      if (Object.prototype.hasOwnProperty.call(source, id)) return source[id];
      throw new Error(`Unexpected import ${id}`);
    },
    Response,
    Request,
    URL,
    console
  }, { filename: 'sync-status.owner-read.mock.cjs', timeout: 1000 });
  return { counters, GET: mod.exports.GET };
}

function loadGmailStatusHarness() {
  const routeSource = readFileSync(join(root, 'app/api/gmail/status/route.ts'), 'utf8');
  const js = ts.transpileModule(routeSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const counters = { configuredCalls: 0, emailReads: 0 };
  const privateEmail = 'book-synthetic@pokertraininglasvegas.test';
  const mod = { exports: {} };
  const source = {
    '../_lib': {
      gmailConfigured: () => {
        counters.configuredCalls += 1;
        return true;
      },
      gmailEnvironment: {
        get accountEmail() {
          counters.emailReads += 1;
          return privateEmail;
        }
      }
    },
    '../sync/_owner-read': { denyPrivateRead }
  };
  vm.runInNewContext(js, {
    module: mod,
    exports: mod.exports,
    require: (id) => {
      if (Object.prototype.hasOwnProperty.call(source, id)) return source[id];
      throw new Error(`Unexpected import ${id}`);
    },
    Response,
    Request,
    URL,
    console
  }, { filename: 'gmail-status.owner-read.mock.cjs', timeout: 1000 });
  return { counters, privateEmail, GET: mod.exports.GET };
}

async function invokeStatusGet(get, url, headers = {}) {
  const response = await get(new Request(url, { headers }));
  const body = await response.json().catch(() => ({}));
  const text = JSON.stringify(body);
  return { status: response.status, body, text };
}

const syncStatus = loadSyncStatusHarness();
const gmailStatus = loadGmailStatusHarness();

async function assertStatusDenied(get, url, counters, headers, expectedStatus, expectedReason) {
  const before = {
    providerReads: counters.providerReads || 0,
    appsScriptActions: (counters.appsScriptActions || []).length,
    envReads: counters.envReads || 0,
    configuredCalls: counters.configuredCalls || 0,
    emailReads: counters.emailReads || 0
  };
  const result = await invokeStatusGet(get, url, headers);
  assert.equal(result.status, expectedStatus);
  assert.equal(result.body.ok, false);
  assert.equal(result.body.reason, expectedReason);
  assert.equal(result.body.readOnly, true);
  assert.equal(Object.prototype.hasOwnProperty.call(result.body, 'email'), false);
  assert.equal(result.text.includes('@'), false, 'denied status must not leak email addresses');
  assert.equal(result.text.toLowerCase().includes('pokertraining'), false);
  assert.equal(counters.providerReads || 0, before.providerReads);
  assert.equal((counters.appsScriptActions || []).length, before.appsScriptActions);
  assert.equal(counters.envReads || 0, before.envReads);
  assert.equal(counters.configuredCalls || 0, before.configuredCalls);
  assert.equal(counters.emailReads || 0, before.emailReads);
  return result;
}

const syncStatusUrl = `https://${host}/api/sync/status`;
const gmailStatusUrl = `https://${host}/api/gmail/status`;

for (const headers of [
  {},
  { origin: `https://${host}` },
  { origin: 'https://evil.example' },
  { cookie: cookie(Date.now() - 8 * 24 * 3600 * 1000) },
  { cookie: forgedCookie }
]) {
  await assertStatusDenied(syncStatus.GET, syncStatusUrl, syncStatus.counters, headers, 401, 'unauthorized');
  await assertStatusDenied(gmailStatus.GET, gmailStatusUrl, gmailStatus.counters, headers, 401, 'unauthorized');
}

await assertStatusDenied(syncStatus.GET, syncStatusUrl, syncStatus.counters, {
  cookie: cookie(),
  origin: 'https://evil.example'
}, 403, 'same_origin_required');
await assertStatusDenied(gmailStatus.GET, gmailStatusUrl, gmailStatus.counters, {
  cookie: cookie(),
  origin: 'https://evil.example'
}, 403, 'same_origin_required');

const syncAuthorized = await invokeStatusGet(syncStatus.GET, syncStatusUrl, { cookie: cookie() });
assert.equal(syncAuthorized.status, 200);
assert.equal(syncAuthorized.body.configured, true);
assert.equal(syncStatus.counters.providerReads, 1);
assert.deepEqual(syncStatus.counters.appsScriptActions, ['status']);

const gmailAuthorized = await invokeStatusGet(gmailStatus.GET, gmailStatusUrl, {
  cookie: cookie(),
  origin: `https://${host}`
});
assert.equal(gmailAuthorized.status, 200);
assert.equal(gmailAuthorized.body.configured, true);
assert.equal(gmailAuthorized.body.email, gmailStatus.privateEmail);
assert.equal(gmailStatus.counters.configuredCalls, 1);
assert.equal(gmailStatus.counters.emailReads, 1);

function assertGuardBeforeProvider(source, providers) {
  const body = source.includes('export async function GET')
    ? source.slice(source.indexOf('export async function GET'))
    : source;
  const guardAt = body.indexOf('denyPrivateRead');
  assert.equal(guardAt >= 0, true, 'private route must call denyPrivateRead');
  for (const marker of providers) {
    const providerAt = body.indexOf(marker);
    if (providerAt < 0) continue;
    assert.equal(providerAt > guardAt, true, `${marker} must run after denyPrivateRead`);
  }
  assert.doesNotMatch(body.slice(0, guardAt), /appsScriptRequest|supabaseEndpoint|supabaseHeaders/);
}

const denyPrivateReadRoutes = [
  {
    path: '../app/api/sync/events/route.ts',
    providers: ['appsScriptRequest']
  },
  {
    path: '../app/api/sync/action-inbox/route.ts',
    providers: ['appsScriptRequest', 'supabaseEndpoint', 'fetch(']
  },
  {
    path: '../app/api/sync/operating-picture/route.ts',
    providers: ['appsScriptRequest', 'smsMeta', 'fetch(']
  },
  {
    path: '../app/api/sync/status/route.ts',
    providers: ['appsScriptRequest', 'syncConfigured', 'syncEnvironment']
  },
  {
    path: '../app/api/gmail/status/route.ts',
    providers: ['gmailConfigured', 'gmailEnvironment', 'accountEmail']
  },
  {
    path: '../app/api/sms/staging/conversations/route.ts',
    providers: ['appsScriptRequest', 'supabaseEndpoint', 'messageMeta', 'fetch(']
  },
  {
    path: '../app/api/sms/staging/rcs-collector/route.ts',
    providers: ['supabaseEndpoint', 'fetch(']
  }
];

for (const route of denyPrivateReadRoutes) {
  const source = readFileSync(new URL(route.path, import.meta.url), 'utf8');
  assertGuardBeforeProvider(source, route.providers);
  assert.match(source, /denyPrivateRead/);
  if (source.includes('writesPerformed')) {
    assert.match(source, /writesPerformed:\s*false/);
  }
  assert.doesNotMatch(source, /export async function POST[\s\S]*appsScriptRequest\(/);
}

const eventsRoute = readFileSync(new URL('../app/api/sync/events/route.ts', import.meta.url), 'utf8');
assert.match(eventsRoute, /bulk_event_mutation_disabled/);
assert.match(eventsRoute, /writesPerformed:\s*false/);
const eventsPost = eventsRoute.slice(eventsRoute.indexOf('export async function POST'));
assert.match(eventsPost, /authorizeAppRequest|unauthorizedResponse/);
assert.doesNotMatch(eventsPost, /appsScriptRequest/);

const inboxSource = readFileSync(new URL('../app/api/sync/action-inbox/route.ts', import.meta.url), 'utf8');
const pictureSource = readFileSync(new URL('../app/api/sync/operating-picture/route.ts', import.meta.url), 'utf8');
for (const source of [inboxSource, pictureSource]) {
  assert.match(source, /listGmailThreadEvidence',\s*\{\s*eventKey\s*\},\s*8000/);
}

// Static inventory: every app/api route declares an identifiable guard or an explicit closed/public-status posture.
const routeInventory = [
  ['app/api/sync/events/route.ts', /denyPrivateRead|authorizeAppRequest/],
  ['app/api/sync/action-inbox/route.ts', /denyPrivateRead/],
  ['app/api/sync/operating-picture/route.ts', /denyPrivateRead/],
  ['app/api/sync/ledger/route.ts', /authorizeAppRequest/],
  ['app/api/sync/documents/route.ts', /authorizeAppRequest/],
  ['app/api/sync/automation/route.ts', /authorizeAppRequest/],
  ['app/api/sms/staging/conversations/route.ts', /denyPrivateRead/],
  ['app/api/sms/staging/rcs-collector/route.ts', /denyPrivateRead/],
  ['app/api/sms/staging/session/route.ts', /hasReviewSession|allowedReviewMutation|authorized\(/],
  ['app/api/sms/staging/review/route.ts', /authorizedReviewer/],
  ['app/api/sms/staging/audit-health/route.ts', /authorizedReviewer/],
  ['app/api/sms/staging/inbox-review/route.ts', /authorizedReviewer/],
  ['app/api/sms/staging/inbox-thread/route.ts', /authorizedReviewer/],
  ['app/api/sms/staging/gmail-evidence/route.ts', /authorizedReviewer/],
  ['app/api/sms/staging/reconcile/route.ts', /authorizedReviewer/],
  ['app/api/sms/staging/decisions/route.ts', /authorizedReviewer|allowedReviewMutation/],
  ['app/api/sms/staging/draft-context/route.ts', /hasReviewSession/],
  ['app/api/sms/staging/reply-recipient/route.ts', /hasReviewSession/],
  ['app/api/sms/staging/reply-send/route.ts', /hasReviewSession|allowedReviewMutation/],
  ['app/api/sms/staging/reply-decisions/route.ts', /hasReviewSession|allowedReviewMutation/],
  ['app/api/sms/staging/reply-personalized-draft/route.ts', /hasReviewSession|allowedReviewMutation/],
  ['app/api/sms/staging/personalized-draft/route.ts', /hasReviewSession|allowedReviewMutation/],
  ['app/api/sms/staging/action-decisions/route.ts', /hasReviewSession|allowedReviewMutation/],
  ['app/api/sms/staging/inbox-diagnostics/route.ts', /hasReviewSession|allowedReviewMutation/],
  ['app/api/sms/staging/ai-smoke-test/route.ts', /hasReviewSession|allowedReviewMutation/],
  ['app/api/sms/staging/ingest/route.ts', /authorized\(/],
  ['app/api/sms/staging/rcs-ingest/route.ts', /ingestRcs/],
  ['app/api/gmail/search/route.ts', /authorizeSyncRequest/],
  ['app/api/gmail/send/route.ts', /Sending is disabled/],
  ['app/api/sync/status/route.ts', /denyPrivateRead/],
  ['app/api/gmail/status/route.ts', /denyPrivateRead/]
];

for (const [relative, pattern] of routeInventory) {
  const source = readFileSync(join(root, relative), 'utf8');
  assert.match(source, pattern, `${relative} missing expected guard/posture marker`);
}

const hub = readFileSync(new URL('../public/v2/js/unified-hub.js', import.meta.url), 'utf8');
assert.equal(hub.includes('/api/sms/staging/bridge-status'), false);
assert.equal(hub.includes('No new header thread was waiting'), false);
assert.match(hub, /Open the protected approval workspace/);
assert.match(hub, /do not send exactly once|does not prove exactly-once delivery/);
assert.match(hub, /not an empty mailbox/);
assert.match(hub, /not a full mailbox/);
assert.match(hub, /last_success_at/);
assert.match(hub, /lvptClearOwnerReads|clearOwnerReads/);

const snapshot = readFileSync(new URL('../public/v2/js/sheet-snapshot.js', import.meta.url), 'utf8');
assert.match(snapshot, /status === 401 \|\| response\.status === 403/);
assert.match(snapshot, /auth-required/);
assert.match(snapshot, /state\.events = \[\]/);
assert.match(snapshot, /lvptClearOwnerReads/);

console.log('owner read guard tests passed');
