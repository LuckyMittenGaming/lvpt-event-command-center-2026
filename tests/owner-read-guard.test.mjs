import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createReviewSession } from '../lib/sms-review-session.mjs';
import { privateReadDecision } from '../lib/owner-read-guard.mjs';

const key = randomBytes(32);
const hash = 'ab'.repeat(32);
const host = 'preview.example.test';
const env = {
  LVPT_SMS_STAGING_DATA_KEY_BASE64: key.toString('base64'),
  LVPT_SMS_STAGING_TOKEN_SHA256: hash
};

function request(headers = {}) {
  return new Request(`https://${host}/api/sync/action-inbox`, { headers });
}

function cookie(now = Date.now()) {
  return `__Host-lvpt-sms-review=${createReviewSession(key, hash, host, now)}`;
}

const absent = privateReadDecision(request(), env);
assert.equal(absent.allow, false);
assert.equal(absent.status, 401);
assert.equal(absent.reason, 'unauthorized');

const spoofed = privateReadDecision(request({ origin: 'https://evil.example' }), env);
assert.equal(spoofed.allow, false);
assert.equal(spoofed.status, 401);
assert.equal(spoofed.reason, 'unauthorized');

const expired = privateReadDecision(request({
  cookie: cookie(Date.now() - 8 * 24 * 3600 * 1000)
}), env);
assert.equal(expired.allow, false);
assert.equal(expired.status, 401);

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

const inboxSource = readFileSync(new URL('../app/api/sync/action-inbox/route.ts', import.meta.url), 'utf8');
const pictureSource = readFileSync(new URL('../app/api/sync/operating-picture/route.ts', import.meta.url), 'utf8');
for (const source of [inboxSource, pictureSource]) {
  const body = source.slice(source.indexOf('export async function GET'));
  const guardAt = body.indexOf('denyPrivateRead');
  const providerAt = body.indexOf('appsScriptRequest');
  assert.equal(guardAt >= 0 && providerAt > guardAt, true);
  assert.match(source, /listGmailThreadEvidence', \{ eventKey \}, 8000/);
}
const gate = readFileSync(new URL('../app/api/sync/_owner-read.ts', import.meta.url), 'utf8');
assert.match(gate, /privateReadDecision/);
assert.doesNotMatch(gate, /x-lvpt-sync-key|x-lvpt-sms-sync-token/);
assert.match(readFileSync(new URL('../lib/owner-read-guard.mjs', import.meta.url), 'utf8'), /verifyReviewSession/);

const hub = readFileSync(new URL('../public/v2/js/unified-hub.js', import.meta.url), 'utf8');
assert.equal(hub.includes('/api/sms/staging/bridge-status'), false);
assert.equal(hub.includes('No new header thread was waiting'), false);
assert.match(hub, /Open the protected approval workspace/);
assert.match(hub, /do not send exactly once|does not prove exactly-once delivery/);
assert.match(hub, /not an empty mailbox/);
assert.match(hub, /not a full mailbox/);
assert.match(hub, /last_success_at/);

console.log('owner read guard tests passed');
