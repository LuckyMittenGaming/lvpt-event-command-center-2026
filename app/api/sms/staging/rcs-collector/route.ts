import { jsonNoStore, supabaseEndpoint, supabaseHeaders } from '../_lib';
import { publicRcsRecord } from '../../../../../lib/rcs-staging.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 10;

const LIBGM_COMMIT = 'ed5dc19eb2b4149ee242cf000c86a7150dca9947';

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).host.toLowerCase() === new URL(request.url).host.toLowerCase();
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  if (process.env.VERCEL_ENV === 'production') {
    return jsonNoStore({ ok: false, reason: 'preview_only', pairing: 'unpaired', sendEnabled: false }, 403);
  }
  if (!sameOrigin(request)) {
    return jsonNoStore({ ok: false, reason: 'same_origin_required', sendEnabled: false }, 403);
  }
  const records: ReturnType<typeof publicRcsRecord>[] = [];
  let readOk = false;
  if ((process.env.LVPT_SMS_STAGING_SUPABASE_URL || '').includes('.supabase.co')) {
    try {
      const response = await fetch(supabaseEndpoint('lvpt_rcs_staging?select=google_message_id,conversation_id,transport,direction,timestamp_ms,source,schema_version,ingested_at&order=ingested_at.desc&limit=20'), {
        headers: supabaseHeaders(),
        cache: 'no-store',
        signal: AbortSignal.timeout(8_000)
      });
      if (response.ok) {
        const rows = await response.json();
        if (Array.isArray(rows)) {
          for (const row of rows) {
            if (!row || typeof row !== 'object' || 'body_ciphertext' in row || 'contact_hash' in row) continue;
            records.push(publicRcsRecord(row));
          }
          readOk = true;
        }
      }
    } catch {
      readOk = false;
    }
  }
  return jsonNoStore({
    ok: true,
    pairing: 'unpaired',
    connected: false,
    sendEnabled: false,
    markReadEnabled: false,
    lastSuccess: '',
    lastFailure: readOk ? '' : 'rcs_metadata_unavailable',
    reconnects: 0,
    records,
    transports: ['SMS', 'RCS'],
    existingSmsRewritten: false,
    libgmCommit: LIBGM_COMMIT,
    protocolAck: 'A connected libgm session acks Google RPC responses. That is not a read receipt. This deployment is not connected and does not call MarkRead.',
    previewLimitation: 'Google includes a latest-message preview for every conversation before an allowlist can skip the full fetch. Non-approved previews must be discarded and never logged.',
    writesPerformed: false
  }, 200);
}
