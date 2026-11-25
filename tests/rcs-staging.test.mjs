import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import {
  TENANT, collectorHealth, contactHash, encryptBody, ingestRcs, openBody, publicRcsRecord
} from '../lib/rcs-staging.mjs';
import { buildActionInbox } from '../lib/action-inbox.mjs';

const key = Buffer.alloc(32, 7);
const token = 'synthetic-rcs-token-not-a-google-secret';
const phone = '5550100199';
const hash = contactHash(key, phone);
const env = {
  VERCEL_ENV: 'preview',
  LVPT_SMS_STAGING_SUPABASE_URL: 'https://ogfrcwmsjbtiydlvqoyj.supabase.co',
  LVPT_SMS_STAGING_SUPABASE_SERVICE_KEY: 'x'.repeat(50),
  LVPT_RCS_STAGING_TOKEN_SHA256: createHash('sha256').update(token).digest('hex'),
  LVPT_RCS_STAGING_DATA_KEY_BASE64: key.toString('base64'),
  LVPT_RCS_STAGING_ALLOWED_NUMBERS: phone
};
const fields = {
  googleMessageId: 'gm-test-phase11',
  conversationId: 'test-conversation',
  source: 'synthetic-test',
  transport: 'RCS',
  direction: 'incoming',
  timestampMs: Date.now() - 60_000,
  schemaVersion: 1,
  contactHash: hash
};
const sealed = encryptBody(key, fields, 'TEST', Buffer.alloc(12, 4));
assert.equal(openBody(key, fields, sealed.bodyNonce, sealed.bodyCiphertext), 'TEST');
const tampered = Buffer.from(sealed.bodyCiphertext, 'base64');
tampered[0] ^= 1;
assert.equal(openBody(key, fields, sealed.bodyNonce, tampered.toString('base64')), null);

function request(body, headers = {}) {
  return new Request('https://lvpt-event-command-center-2026-sms-staging.vercel.app/api/sms/staging/rcs-ingest', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-lvpt-rcs-sync-token': token, ...headers },
    body: JSON.stringify(body)
  });
}

const stored = [];
const fakeFetch = async (url, options = {}) => {
  if (options.method === 'POST' && String(url).includes('lvpt_sms_staging')) throw new Error('sms table was addressed');
  if (options.method === 'POST') {
    const rows = JSON.parse(options.body);
    assert.equal(rows.some((row) => String(row.body_ciphertext).includes('TEST') || String(row.body_nonce).includes('TEST')), false);
    assert.equal(options.headers.Prefer.includes('ignore-duplicates'), true);
    const created = [];
    for (const row of rows) {
      if (!stored.some((existing) => existing.google_message_id === row.google_message_id)) {
        stored.push(row);
        created.push({ google_message_id: row.google_message_id });
      }
    }
    return new Response(JSON.stringify(created), { status: 201 });
  }
  return new Response('[]', { status: 200 });
};

const payload = { records: [{ ...fields, ...sealed }] };
const first = await ingestRcs(request(payload), { env, fetch: fakeFetch });
assert.equal(first.status, 200);
assert.deepEqual(await first.json(), { ok: true, accepted: 1, duplicate: false, sendEnabled: false, merged: false });
const replay = await ingestRcs(request(payload), { env, fetch: fakeFetch });
assert.equal(replay.status, 200);
assert.deepEqual(await replay.json(), { ok: true, accepted: 0, duplicate: true, sendEnabled: false, merged: false });
assert.equal(stored.length, 1);
assert.equal(stored[0].tenant_id, TENANT);
assert.equal(stored[0].source, 'synthetic-test');
assert.equal(publicRcsRecord(stored[0]).label, 'TEST');
assert.equal(publicRcsRecord(stored[0]).transport, 'RCS');

const smsToken = await ingestRcs(request(payload, { 'x-lvpt-rcs-sync-token': '', 'x-lvpt-sms-sync-token': token }), { env, fetch: fakeFetch });
assert.equal(smsToken.status, 401);
const badToken = await ingestRcs(request(payload, { 'x-lvpt-rcs-sync-token': token + '-no' }), { env, fetch: fakeFetch });
assert.equal(badToken.status, 401);

const badPayload = await ingestRcs(request({ records: [{ ...payload.records[0], source: 'gmail' }] }), { env, fetch: fakeFetch });
assert.equal((await badPayload.json()).reason, 'invalid_source');
const badTenant = await ingestRcs(request({ records: [{ ...payload.records[0], tenantId: 'other-tenant' }] }), { env, fetch: fakeFetch });
assert.equal((await badTenant.json()).reason, 'unapproved_tenant');
const otherHash = contactHash(key, '5550100100');
const badContact = await ingestRcs(request({ records: [{ ...payload.records[0], contactHash: otherHash }] }), { env, fetch: fakeFetch });
assert.equal((await badContact.json()).reason, 'unapproved_contact');
const badCipher = await ingestRcs(request({ records: [{ ...payload.records[0], bodyCiphertext: tampered.toString('base64') }] }), { env, fetch: fakeFetch });
assert.equal((await badCipher.json()).reason, 'tampered_ciphertext');
const badId = await ingestRcs(request({ records: [{ ...payload.records[0], googleMessageId: 'not a real id' }] }), { env, fetch: fakeFetch });
assert.equal(badId.status, 400);

const production = await ingestRcs(new Request('https://lvpt-event-command-center-2026.vercel.app/api/sms/staging/rcs-ingest', {
  method: 'POST',
  headers: { host: 'lvpt-event-command-center-2026.vercel.app', 'content-type': 'application/json', 'x-lvpt-rcs-sync-token': token },
  body: JSON.stringify(payload)
}), { env, fetch: fakeFetch });
assert.equal(production.status, 403);

let failed = false;
const down = await ingestRcs(request(payload), {
  env,
  fetch: async () => new Response('no', { status: 503 })
});
assert.equal(down.status, 502);
assert.equal((await down.json()).retryable, true);
failed = stored.length === 1;

const empty = await ingestRcs(request({ records: [] }), { env, fetch: fakeFetch });
assert.equal(empty.status, 200);
assert.equal(stored.length, 1);
assert.equal(failed, true);
const check = await ingestRcs(request({ contactCheck: hash }), { env, fetch: fakeFetch });
assert.deepEqual(await check.json(), { ok: true, allowed: true, sendEnabled: false });
const mismatch = await ingestRcs(request({ contactCheck: contactHash(key, '5550100100') }), { env, fetch: fakeFetch });
assert.equal((await mismatch.json()).allowed, false);
assert.equal(stored.length, 1);

const now = Date.parse('2026-11-23T16:00:00Z');
assert.equal(collectorHealth({ pairing: 'unpaired', now }).state, 'not_paired');
assert.equal(collectorHealth({ pairing: 'unpaired', lastSuccess: '2026-11-23T15:59:00Z', now }).live, false);
assert.equal(collectorHealth({ pairing: 'paired', connected: false, now }).state, 'paired_disconnected');
assert.equal(collectorHealth({ pairing: 'paired', connected: true, lastSuccess: '2026-11-23T15:50:00Z', now }).state, 'collecting');
assert.equal(collectorHealth({ pairing: 'paired', connected: true, lastSuccess: '2026-11-23T12:00:00Z', now }).state, 'synchronization_delayed');
assert.equal(collectorHealth({ pairing: 'paired', connected: true, lastFailure: 'credentials_expired', now }).state, 'authentication_expired');
assert.equal(collectorHealth({ lastFailure: 'ingest_failed', now }).state, 'ingestion_failed');

const inbox = buildActionInbox({
  today: '2026-11-23',
  smsThreads: [{ threadKey: 'abc123', match: 'unmatched', newestAt: '2026-11-23T15:00:00Z', incoming: 1, outgoing: 0 }],
  rcsMessages: [
    { googleMessageId: 'gm-in', conversationId: 'test-conversation', direction: 'incoming', messageAt: '2026-11-23T15:01:00Z', label: 'TEST' },
    { googleMessageId: 'gm-out', conversationId: 'test-conversation', direction: 'outgoing', messageAt: '2026-11-23T15:02:00Z', label: 'TEST' }
  ]
});
const rcsRecord = inbox.records.find((row) => row.id === 'rcs:test-conversation');
const smsRecord = inbox.records.find((row) => row.id === 'sms:abc123');
assert.equal(Boolean(rcsRecord && smsRecord), true);
assert.equal(rcsRecord.providerIds.join(','), 'gm-in,gm-out');
assert.equal(rcsRecord.timeline.length, 2);
assert.equal(rcsRecord.timeline.some((item) => item.direction === 'inbound'), true);
assert.equal(rcsRecord.timeline.some((item) => item.direction === 'outbound'), true);
assert.equal(rcsRecord.timeline.every((item) => item.contentAvailable === false), true);
assert.equal(rcsRecord.contact, 'TEST');
assert.equal(smsRecord.channel, 'SMS');
assert.equal(smsRecord.source, 'Unknown');
assert.equal(smsRecord.acquisitionKind, 'unknown');
assert.equal(randomBytes(1).length, 1);
console.log('rcs staging contract tests passed');
