import { authorized, encryptBatch, jsonNoStore, MAX_REQUEST_BYTES, ready,
  supabaseEndpoint, supabaseHeaders, validatePayload } from '../_lib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 20;

// Authenticated device enrollment is handled manually via a user-entered high-entropy token.
// This pilot accepts only the server-configured list of approved phone aliases.
export async function POST(request: Request) {
  if (!ready()) return jsonNoStore({ ok: false, reason: 'staging_unconfigured' }, 503);
  if (!authorized(request)) return jsonNoStore({ ok: false, reason: 'unauthorized' }, 401);
  const contentType = request.headers.get('content-type') || '';
  if (!/^application\/json(?:;|$)/i.test(contentType))
    return jsonNoStore({ ok: false, reason: 'json_required' }, 415);
  const length = Number(request.headers.get('content-length') || '0');
  if (length > MAX_REQUEST_BYTES)
    return jsonNoStore({ ok: false, reason: 'payload_too_large' }, 413);
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw, 'utf8') > MAX_REQUEST_BYTES)
      return jsonNoStore({ ok: false, reason: 'payload_too_large' }, 413);
    const parsed = JSON.parse(raw);
    const valid = validatePayload(parsed);
    if (!valid) return jsonNoStore({ ok: false, reason: 'invalid_or_unapproved_messages' }, 400);
    if (valid.messages.length === 0)
      return jsonNoStore({ ok: true, accepted: 0, staging: true }, 200);

    const tenant = 'lvpt-owner-pilot';
    const rows = encryptBatch(tenant, valid.device_id, valid.messages);
    const response = await fetch(
      supabaseEndpoint('lvpt_sms_staging?on_conflict=tenant_id,device_id,sms_id'),
      {
        method: 'POST',
        headers: supabaseHeaders('resolution=ignore-duplicates,return=minimal'),
        body: JSON.stringify(rows),
        cache: 'no-store',
        signal: AbortSignal.timeout(15_000)
      }
    );
    if (!response.ok) {
      // Deliberately don't return provider body, SQL, sensitive values, or message text.
      return jsonNoStore({ ok: false, reason: 'staging_write_failed' }, 502);
    }
    return jsonNoStore({ ok: true, accepted: rows.length, staging: true }, 200);
  } catch {
    return jsonNoStore({ ok: false, reason: 'staging_request_failed' }, 500);
  }
}
