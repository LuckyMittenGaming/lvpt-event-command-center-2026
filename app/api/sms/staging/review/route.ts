import { createDecipheriv } from 'node:crypto';
import { authorized, jsonNoStore, ready, supabaseEndpoint, supabaseHeaders } from '../_lib';
import { classifyBusinessSms } from '../../../../../lib/sms-intelligence.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 20;

type EncryptedRow = {
  device_id: string; sms_id: number; direction: string; timestamp_ms: number;
  body_nonce: string; body_ciphertext: string;
};

function decrypt(row: EncryptedRow): string {
  const key = Buffer.from(process.env.LVPT_SMS_STAGING_DATA_KEY_BASE64 || '', 'base64');
  const nonce = Buffer.from(row.body_nonce, 'base64');
  const combined = Buffer.from(row.body_ciphertext, 'base64');
  if (key.length !== 32 || nonce.length !== 12 || combined.length < 16)
    throw new Error('Invalid ciphertext');
  const decipher = createDecipheriv('aes-256-gcm', key, nonce);
  decipher.setAAD(Buffer.from('lvpt-owner-pilot:' + row.device_id + ':' + row.sms_id, 'utf8'));
  decipher.setAuthTag(combined.subarray(combined.length-16));
  return Buffer.concat([decipher.update(combined.subarray(0, combined.length-16)), decipher.final()]).toString('utf8');
}

export async function GET(request: Request) {
  if (!ready()) return jsonNoStore({ok:false, reason:'staging_unconfigured'},503);
  if (!authorized(request)) return jsonNoStore({ok:false,reason:'unauthorized'},401);
  try {
    const search = new URL(request.url).searchParams;
    const after = search.get('after') || '2026-01-01';
    const offset = Number(search.get('offset') || 0);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(after) || !Number.isFinite(Date.parse(after+'T00:00:00Z')) ||
      !Number.isSafeInteger(offset) || offset < 0 || offset > 100_000)
      return jsonNoStore({ok:false,reason:'invalid_filter'},400);

    const limit = 200;
    const query = new URLSearchParams({
      select:'device_id,sms_id,direction,timestamp_ms,body_nonce,body_ciphertext',
      tenant_id:'eq.lvpt-owner-pilot',
      timestamp_ms:'gte.'+Date.parse(after+'T00:00:00Z'),
      order:'timestamp_ms.desc',
      offset:String(offset),
      limit:String(limit)
    });
    const response = await fetch(supabaseEndpoint('lvpt_sms_staging?'+query.toString()), {
      headers:supabaseHeaders(), cache:'no-store', signal:AbortSignal.timeout(15_000)
    });
    if (!response.ok) return jsonNoStore({ok:false,reason:'staging_read_failed'},502);
    const rows = await response.json() as EncryptedRow[];
    const findings: Array<Record<string,unknown>> = [];
    let invalidCipherCount = 0;
    for (const row of rows) {
      try {
        const match = classifyBusinessSms(decrypt(row));
        if (!match) continue;
        findings.push({
          id:'sms-'+row.device_id+'-'+row.sms_id,
          smsId:row.sms_id,
          deviceId:row.device_id,
          date:new Date(row.timestamp_ms).toISOString(),
          direction:row.direction,
          ...match,
          reviewAction: match.category === 'Finance' ?
            'Compare with bank and invoice evidence; SMS financial claims do not establish settlement.' :
            'Verify historical statements against current records before any change.'
        });
      } catch {
        // Decryption errors must not disclose ciphertext or plaintext.
        invalidCipherCount++;
      }
    }
    return jsonNoStore({
      ok:true, staging:true, after, scanned:rows.length, offset,
      nextOffset:rows.length === limit ? offset+limit : null,
      invalidCipherCount,
      findings
    },200);
  } catch {
    return jsonNoStore({ok:false,reason:'staging_review_failed'},500);
  }
}
