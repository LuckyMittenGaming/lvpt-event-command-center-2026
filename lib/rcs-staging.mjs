import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const SCHEMA_VERSION = 1;
export const TENANT = 'lvpt-owner-pilot';
export const PRODUCTION_HOST = 'lvpt-event-command-center-2026.vercel.app';
const SOURCES = new Set(['google-messages', 'synthetic-test']);
const MAX_BODY = 12_000;
const MAX_BATCH = 50;
const MAX_BYTES = 256_000;

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function normalizeNumber(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  const local = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  return /^\d{10}$/.test(local) ? local : '';
}

export function keyFrom(env) {
  try {
    const key = Buffer.from(env.LVPT_RCS_STAGING_DATA_KEY_BASE64 || '', 'base64');
    return key.length === 32 ? key : null;
  } catch {
    return null;
  }
}

export function rcsReady(env) {
  return Boolean(
    /^https:\/\/[a-z0-9.-]+\.supabase\.co\/?$/i.test(env.LVPT_SMS_STAGING_SUPABASE_URL || '') &&
    (env.LVPT_SMS_STAGING_SUPABASE_SERVICE_KEY || '').length >= 50 &&
    /^[a-f0-9]{64}$/i.test(env.LVPT_RCS_STAGING_TOKEN_SHA256 || '') &&
    keyFrom(env) &&
    (env.LVPT_RCS_STAGING_ALLOWED_NUMBERS || '').trim()
  );
}

export function contactHash(key, phone) {
  const local = normalizeNumber(phone);
  if (!key || !local) return '';
  return createHmac('sha256', key).update(local, 'utf8').digest('hex');
}

export function allowedHashes(env) {
  const key = keyFrom(env);
  const hashes = new Set();
  if (!key) return hashes;
  for (const part of String(env.LVPT_RCS_STAGING_ALLOWED_NUMBERS || '').split(',')) {
    const hash = contactHash(key, part);
    if (hash) hashes.add(hash);
  }
  return hashes;
}

export function aadBytes(fields) {
  return Buffer.from([
    'lvpt-rcs-v1',
    TENANT,
    fields.googleMessageId,
    fields.source,
    fields.contactHash,
    fields.transport,
    fields.direction,
    String(fields.timestampMs),
    String(fields.schemaVersion)
  ].join('|'), 'utf8');
}

export function encryptBody(key, fields, plaintext, nonce = randomBytes(12)) {
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(aadBytes(fields));
  const encrypted = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final(), cipher.getAuthTag()]);
  return { bodyNonce: nonce.toString('base64'), bodyCiphertext: encrypted.toString('base64') };
}

export function openBody(key, fields, nonceB64, cipherB64) {
  try {
    const nonce = Buffer.from(nonceB64, 'base64');
    const blob = Buffer.from(cipherB64, 'base64');
    if (nonce.length !== 12 || blob.length < 17) return null;
    const decipher = createDecipheriv('aes-256-gcm', key, nonce);
    decipher.setAAD(aadBytes(fields));
    decipher.setAuthTag(blob.subarray(blob.length - 16));
    const plain = Buffer.concat([decipher.update(blob.subarray(0, blob.length - 16)), decipher.final()]);
    if (plain.length < 1 || plain.length > MAX_BODY) return null;
    return plain.toString('utf8');
  } catch {
    return null;
  }
}

function hostName(request) {
  const raw = request.headers.get('x-forwarded-host') || request.headers.get('host') || '';
  return raw.split(',')[0].trim().split(':')[0].toLowerCase();
}

function authorized(request, env) {
  const expected = env.LVPT_RCS_STAGING_TOKEN_SHA256 || '';
  const supplied = request.headers.get('x-lvpt-rcs-sync-token') || '';
  if (!/^[a-f0-9]{64}$/i.test(expected) || supplied.length < 32 || supplied.length > 256) return false;
  const actual = createHash('sha256').update(supplied, 'utf8').digest();
  const want = Buffer.from(expected, 'hex');
  return actual.length === want.length && timingSafeEqual(actual, want);
}

function json(data, status) {
  return Response.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store, private', 'X-Content-Type-Options': 'nosniff' }
  });
}

function endpoint(env, path) {
  return (env.LVPT_SMS_STAGING_SUPABASE_URL || '').replace(/\/$/, '') + '/rest/v1/' + path;
}

function supabaseHeaders(env, prefer) {
  const secret = env.LVPT_SMS_STAGING_SUPABASE_SERVICE_KEY || '';
  return {
    apikey: secret,
    Authorization: 'Bearer ' + secret,
    'Content-Type': 'application/json',
    ...(prefer ? { Prefer: prefer } : {})
  };
}

export function rowsFromPayload(env, payload) {
  if (!isRecord(payload) || !Array.isArray(payload.records) || payload.records.length > MAX_BATCH) {
    return { error: 'invalid_or_unapproved_messages' };
  }
  const key = keyFrom(env);
  const allowed = allowedHashes(env);
  if (!key || allowed.size === 0) return { error: 'staging_unconfigured' };
  const seen = new Set();
  const rows = [];
  for (const item of payload.records) {
    if (!isRecord(item)) return { error: 'invalid_or_unapproved_messages' };
    for (const forbidden of ['body', 'phone', 'preview', 'cookie', 'cookies', 'password', 'SID', 'HSID', 'SSID', 'APISID', 'SAPISID', 'OSID']) {
      if (forbidden in item) return { error: 'invalid_or_unapproved_messages' };
    }
    if (item.tenantId !== undefined && item.tenantId !== TENANT) return { error: 'unapproved_tenant' };
    if (item.schemaVersion !== SCHEMA_VERSION) return { error: 'invalid_schema' };
    if (!SOURCES.has(item.source)) return { error: 'invalid_source' };
    if (typeof item.googleMessageId !== 'string' || !/^[A-Za-z0-9_.:-]{1,128}$/.test(item.googleMessageId) || seen.has(item.googleMessageId)) {
      return { error: 'invalid_or_unapproved_messages' };
    }
    if (typeof item.conversationId !== 'string' || !/^[A-Za-z0-9_.:-]{1,128}$/.test(item.conversationId)) {
      return { error: 'invalid_or_unapproved_messages' };
    }
    if (item.transport !== 'SMS' && item.transport !== 'RCS') return { error: 'invalid_or_unapproved_messages' };
    if (item.direction !== 'incoming' && item.direction !== 'outgoing') return { error: 'invalid_or_unapproved_messages' };
    if (typeof item.timestampMs !== 'number' || !Number.isSafeInteger(item.timestampMs) || item.timestampMs <= 946684800000 || item.timestampMs > Date.now() + 86_400_000) {
      return { error: 'invalid_or_unapproved_messages' };
    }
    if (typeof item.contactHash !== 'string' || !allowed.has(item.contactHash)) return { error: 'unapproved_contact' };
    const fields = {
      googleMessageId: item.googleMessageId,
      source: item.source,
      contactHash: item.contactHash,
      transport: item.transport,
      direction: item.direction,
      timestampMs: item.timestampMs,
      schemaVersion: item.schemaVersion
    };
    if (openBody(key, fields, item.bodyNonce, item.bodyCiphertext) === null) return { error: 'tampered_ciphertext' };
    seen.add(item.googleMessageId);
    rows.push({
      tenant_id: TENANT,
      google_message_id: item.googleMessageId,
      conversation_id: item.conversationId,
      schema_version: SCHEMA_VERSION,
      source: item.source,
      transport: item.transport,
      direction: item.direction,
      timestamp_ms: item.timestampMs,
      contact_hash: item.contactHash,
      body_nonce: item.bodyNonce,
      body_ciphertext: item.bodyCiphertext
    });
  }
  return { rows };
}

export async function ingestRcs(request, deps = {}) {
  const env = deps.env || process.env;
  const doFetch = deps.fetch || fetch;
  if (env.VERCEL_ENV === 'production' || hostName(request) === PRODUCTION_HOST) {
    return json({ ok: false, reason: 'production_ingest_disabled', sendEnabled: false }, 403);
  }
  if (!rcsReady(env)) return json({ ok: false, reason: 'staging_unconfigured', sendEnabled: false }, 503);
  if (!authorized(request, env)) return json({ ok: false, reason: 'unauthorized', sendEnabled: false }, 401);
  if (!/^application\/json(?:;|$)/i.test(request.headers.get('content-type') || '')) {
    return json({ ok: false, reason: 'json_required', sendEnabled: false }, 415);
  }
  const declared = Number(request.headers.get('content-length') || '0');
  if (declared > MAX_BYTES) return json({ ok: false, reason: 'payload_too_large', sendEnabled: false }, 413);
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw, 'utf8') > MAX_BYTES) return json({ ok: false, reason: 'payload_too_large', sendEnabled: false }, 413);
    const parsed = JSON.parse(raw);
    const prepared = rowsFromPayload(env, parsed);
    if (prepared.error) return json({ ok: false, reason: prepared.error, sendEnabled: false }, prepared.error === 'staging_unconfigured' ? 503 : 400);
    if (prepared.rows.length === 0) {
      const probe = await doFetch(endpoint(env, 'lvpt_rcs_staging?select=google_message_id&limit=0'), {
        headers: supabaseHeaders(env),
        cache: 'no-store',
        signal: AbortSignal.timeout(15_000)
      });
      if (!probe.ok) return json({ ok: false, reason: 'staging_write_failed', retryable: true, sendEnabled: false }, 502);
      return json({ ok: true, accepted: 0, sendEnabled: false }, 200);
    }
    const response = await doFetch(endpoint(env, 'lvpt_rcs_staging?on_conflict=tenant_id,google_message_id'), {
      method: 'POST',
      headers: supabaseHeaders(env, 'resolution=ignore-duplicates,return=representation'),
      body: JSON.stringify(prepared.rows),
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000)
    });
    if (response.status === 409) return json({ ok: true, accepted: 0, duplicate: true, merged: false, sendEnabled: false }, 200);
    if (!response.ok) return json({ ok: false, reason: 'staging_write_failed', retryable: true, sendEnabled: false }, 502);
    const created = await response.json().catch(() => null);
    const accepted = Array.isArray(created) ? created.length : 0;
    return json({ ok: true, accepted, duplicate: accepted < prepared.rows.length, merged: false, sendEnabled: false }, 200);
  } catch {
    return json({ ok: false, reason: 'staging_request_failed', retryable: true, sendEnabled: false }, 500);
  }
}

export function publicRcsRecord(row) {
  return {
    googleMessageId: row.google_message_id,
    conversationId: row.conversation_id,
    transport: row.transport,
    direction: row.direction,
    timestampMs: row.timestamp_ms,
    ingestedAt: row.ingested_at,
    schemaVersion: row.schema_version,
    label: row.source === 'synthetic-test' ? 'TEST' : 'RCS'
  };
}
