import { createDecipheriv } from 'node:crypto';
import { authorized, jsonNoStore, ready, supabaseEndpoint, supabaseHeaders } from '../_lib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 20;

type EncryptedRow = {
  device_id: string; sms_id: number; direction: string; timestamp_ms: number;
  body_nonce: string; body_ciphertext: string;
};

const categories = {
  Finance: /\b(?:paid|payment|invoice|deposit|balance|owed|owe|expense|receipt|reimburs|refund|draws?|transfer|vendor|profit|cost|pricing|split|payout|fee|ach|venmo|zelle)\b|\$\s?[\d,]+/i,
  'Follow-up': /\b(?:follow.up|waiting|remind|haven.t heard|no response|tomorrow|please (?:call|send)|still need|check email|asap)\b/i,
  'Lead / sales': /\b(?:client|lead|inquiry|request|prospect|quote|proposal|rebooking|referral|potential)\b/i,
  'Event operations': /\b(?:event|tournament|staff|booking|training|pro|dealers?|venue|transportation|tables?|equipment|confirmed|run.of.show)\b/i
};
const business = /\b(?:poker|lvpt|nium|mosaic|neo\b|ows|aws|allegiant|certapro|venetian|bellagio|palms|21\s?fun|event|client|customer|invoice|tournament|training|dealer|kenna|madsen|jeff|business|booking|quote|proposal|vendor|transportation|corporate|decks?|cards?|chips?|staffing)\b/i;
const unrelatedPersonal = /\b(?:wife|girlfriend|dating|stock market|share price|doctor|surgery|my kids?|personal lawsuit)\b/i;
const events: Array<[string, RegExp]> = [
  ['NIUM', /\bnium\b/i],
  ['Mosaic / NEO', /\b(?:mosaic|neo\s?2026|ritz.carlton)\b/i],
  ['OWS / AWS', /\b(?:ows|allegiant|aws\s?re.invent)\b/i],
  ['CertaPro', /\bcertapro\b/i],
  ['Venetian', /\bvenetian\b/i],
  ['Palms', /\bpalms\b/i]
];

function redact(source: string): string {
  return source.replace(/https?:\/\/\S+/ig, '[link]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/ig, '[email]')
    .replace(/(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g, '[phone]')
    .replace(/\b\d{8,17}\b/g, '[number]')
    .replace(/\s+/g,' ').trim().slice(0,180);
}
function classify(text: string): {category:string; eventHint:string; excerpt:string} | null {
  if (text.length < 10 || !business.test(text)) return null;
  if (unrelatedPersonal.test(text) && !/\b(?:invoice|poker|client|event|payment|vendor)\b/i.test(text))
    return null;
  const category = Object.entries(categories).find(([,pattern]) => pattern.test(text))?.[0] || 'Business context';
  const eventHint = events.find(([,pattern]) => pattern.test(text))?.[0] || 'Unmatched — verify event';
  return { category, eventHint, excerpt: redact(text) };
}
function decrypt(row: EncryptedRow): string {
  const key = Buffer.from(process.env.LVPT_SMS_STAGING_DATA_KEY_BASE64 || '', 'base64');
  const nonce = Buffer.from(row.body_nonce, 'base64');
  const combined = Buffer.from(row.body_ciphertext, 'base64');
  if (key.length !== 32 || nonce.length !== 12 || combined.length < 16)
    throw new Error('Invalid ciphertext');
  const decipher = createDecipheriv('aes-256-gcm', key, nonce);
  decipher.setAAD(Buffer.from('lvpt-owner-pilot:' + row.device_id + ':' + row.sms_id, 'utf8'));
  decipher.setAuthTag(combined.subarray(combined.length-16));
  return Buffer.concat([decipher.update(combined.subarray(0,combined.length-16)),decipher.final()]).toString('utf8');
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
    for (const row of rows) {
      try {
        const match = classify(decrypt(row));
        if (!match) continue;
        findings.push({
          id:'sms-'+row.device_id+'-'+row.sms_id,
          smsId:row.sms_id,
          date:new Date(row.timestamp_ms).toISOString(),
          direction:row.direction,
          category:match.category,
          eventHint:match.eventHint,
          excerpt:match.excerpt,
          amounts:[],
          reviewAction:match.category === 'Finance' ?
            'Check bank, invoice and vendor records before financial changes.' :
            'Verify this historical detail against current event records.'
        });
      } catch {
        // Malformed cipher must not be returned as plaintext or halt the entire response.
      }
    }
    return jsonNoStore({
      ok:true, staging:true, after, scanned:rows.length, offset,
      nextOffset:rows.length === limit ? offset+limit : null,
      findings
    },200);
  } catch {
    return jsonNoStore({ok:false,reason:'staging_review_failed'},500);
  }
}
