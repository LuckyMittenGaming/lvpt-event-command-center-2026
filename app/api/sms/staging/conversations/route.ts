import { jsonNoStore, ready, supabaseEndpoint, supabaseHeaders } from '../_lib';
import { appsScriptRequest, syncConfigured } from '../../../sync/_lib';
import { denyPrivateRead } from '../../../sync/_owner-read';
import { matchThreads } from '../../../../../lib/sms-bridge.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

function productionBlocked() {
  return process.env.VERCEL_ENV === 'production';
}

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).host.toLowerCase() === new URL(request.url).host.toLowerCase();
  } catch {
    return false;
  }
}

function keyBytes(): Buffer | null {
  try {
    const key = Buffer.from(process.env.LVPT_SMS_STAGING_DATA_KEY_BASE64 || '', 'base64');
    return key.length === 32 ? key : null;
  } catch {
    return null;
  }
}

async function messageMeta(): Promise<Array<{ contact_hash: string; direction: string; timestamp_ms: number }>> {
  const rows: Array<{ contact_hash: string; direction: string; timestamp_ms: number }> = [];
  let after = 0;
  for (let page = 0; page < 8; page += 1) {
    const query = new URLSearchParams({
      select: 'contact_hash,direction,timestamp_ms,sms_id',
      tenant_id: 'eq.lvpt-owner-pilot',
      sms_id: `gt.${after}`,
      order: 'sms_id.asc',
      limit: '1000'
    });
    const response = await fetch(supabaseEndpoint(`lvpt_sms_staging?${query}`), {
      headers: supabaseHeaders(),
      cache: 'no-store',
      signal: AbortSignal.timeout(12_000)
    });
    if (!response.ok) throw new Error('sms_metadata_unavailable');
    const batch = await response.json() as Array<Record<string, unknown>>;
    if (!Array.isArray(batch) || batch.length === 0) break;
    for (const row of batch) {
      const smsId = Number(row.sms_id);
      if (Number.isSafeInteger(smsId) && smsId > after) after = smsId;
      rows.push({
        contact_hash: String(row.contact_hash || ''),
        direction: String(row.direction || ''),
        timestamp_ms: Number(row.timestamp_ms) || 0
      });
    }
    if (batch.length < 1000) break;
  }
  return rows;
}

export async function GET(request: Request) {
  const denied = denyPrivateRead(request);
  if (denied) return denied;
  if (productionBlocked()) return jsonNoStore({ ok: false, reason: 'production_ingest_disabled', threads: [], sendEnabled: false }, 403);
  if (!sameOrigin(request)) return jsonNoStore({ ok: false, reason: 'same_origin_required', threads: [] }, 403);
  if (!ready()) return jsonNoStore({ ok: false, reason: 'staging_unconfigured', threads: [] }, 503);
  const key = keyBytes();
  if (!key) return jsonNoStore({ ok: false, reason: 'staging_unconfigured', threads: [] }, 503);
  try {
    const messages = await messageMeta();
    let events: Array<{ id?: string; contactPhone?: string }> = [];
    let matchSource = 'unavailable';
    if (syncConfigured()) {
      try {
        const listed = await Promise.race([
          appsScriptRequest<{ events?: Array<{ id?: string; contactPhone?: string }> }>('listEvents'),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000))
        ]);
        events = Array.isArray(listed.events) ? listed.events : [];
        matchSource = 'command_center_contact_phone';
      } catch {
        matchSource = 'unavailable';
      }
    }
    const threads = matchThreads(messages, events, key);
    return jsonNoStore({
      ok: true,
      sendEnabled: false,
      messageTextIncluded: false,
      matchSource,
      storedMessages: messages.length,
      threads
    }, 200);
  } catch {
    return jsonNoStore({ ok: false, reason: 'sms_metadata_unavailable', threads: [], messageTextIncluded: false }, 502);
  }
}
