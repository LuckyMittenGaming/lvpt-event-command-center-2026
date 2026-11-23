import { authorized, jsonNoStore, ready, supabaseEndpoint, supabaseHeaders } from '../_lib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 20;

const TENANT = 'lvpt-owner-pilot';

type RcsRecord = {
  google_message_id: string;
  conversation_id: string;
  transport: 'SMS' | 'RCS';
  direction: 'incoming' | 'outgoing';
  timestamp_ms: number;
  contact_hash: string;
  body_ciphertext: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function validateRcsBatch(payload: unknown): RcsRecord[] | null {
  if (!isRecord(payload) || !Array.isArray(payload.records) || payload.records.length > 50) return null;
  const seen = new Set<string>();
  const records: RcsRecord[] = [];
  for (const item of payload.records) {
    if (!isRecord(item)) return null;
    for (const forbidden of ['body', 'phone', 'preview', 'cookie', 'cookies', 'password', 'SID', 'HSID', 'SSID', 'APISID', 'SAPISID', 'OSID']) {
      if (forbidden in item) return null;
    }
    const googleMessageId = item.googleMessageId;
    const conversationId = item.conversationId;
    const transport = item.transport;
    const direction = item.direction;
    const timestamp = item.timestampMs;
    const contactHash = item.contactHash;
    const ciphertext = item.bodyCiphertext;
    if (typeof googleMessageId !== 'string' || !/^[A-Za-z0-9_.:-]{1,128}$/.test(googleMessageId) || seen.has(googleMessageId)) return null;
    if (typeof conversationId !== 'string' || !/^[A-Za-z0-9_.:-]{1,128}$/.test(conversationId)) return null;
    if (transport !== 'SMS' && transport !== 'RCS') return null;
    if (direction !== 'incoming' && direction !== 'outgoing') return null;
    if (typeof timestamp !== 'number' || !Number.isSafeInteger(timestamp) || timestamp < 946684800000) return null;
    if (typeof contactHash !== 'string' || !/^[a-f0-9]{64}$/.test(contactHash)) return null;
    if (typeof ciphertext !== 'string' || ciphertext.length < 16 || ciphertext.length > 20000) return null;
    seen.add(googleMessageId);
    records.push({
      google_message_id: googleMessageId,
      conversation_id: conversationId,
      transport,
      direction,
      timestamp_ms: timestamp,
      contact_hash: contactHash,
      body_ciphertext: ciphertext
    });
  }
  return records;
}

export async function POST(request: Request) {
  if (process.env.VERCEL_ENV === 'production') {
    return jsonNoStore({ ok: false, reason: 'production_ingest_disabled', sendEnabled: false }, 403);
  }
  if (!ready()) return jsonNoStore({ ok: false, reason: 'staging_unconfigured', sendEnabled: false }, 503);
  if (!authorized(request)) return jsonNoStore({ ok: false, reason: 'unauthorized', sendEnabled: false }, 401);
  if (!/^application\/json(?:;|$)/i.test(request.headers.get('content-type') || '')) {
    return jsonNoStore({ ok: false, reason: 'json_required', sendEnabled: false }, 415);
  }
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw, 'utf8') > 256000) return jsonNoStore({ ok: false, reason: 'payload_too_large', sendEnabled: false }, 413);
    const records = validateRcsBatch(JSON.parse(raw));
    if (!records) return jsonNoStore({ ok: false, reason: 'invalid_or_unapproved_messages', sendEnabled: false }, 400);
    if (records.length === 0) return jsonNoStore({ ok: true, accepted: 0, sendEnabled: false }, 200);
    const response = await fetch(supabaseEndpoint('lvpt_rcs_staging?on_conflict=tenant_id,google_message_id'), {
      method: 'POST',
      headers: supabaseHeaders('resolution=ignore-duplicates,return=minimal'),
      body: JSON.stringify(records.map((record) => ({ ...record, tenant_id: TENANT }))),
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000)
    });
    if (!response.ok) return jsonNoStore({ ok: false, reason: 'staging_write_failed', sendEnabled: false }, 502);
    return jsonNoStore({ ok: true, accepted: records.length, sendEnabled: false, merged: false }, 200);
  } catch {
    return jsonNoStore({ ok: false, reason: 'staging_request_failed', sendEnabled: false }, 500);
  }
}
