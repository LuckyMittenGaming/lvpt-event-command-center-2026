import { createCipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const MAX_SMS_BATCH = 80;
export const MAX_SMS_BODY = 12_000;
export const MAX_REQUEST_BYTES = 256_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function keyBytes(): Buffer | null {
  try {
    const source = process.env.LVPT_SMS_STAGING_DATA_KEY_BASE64 || '';
    const key = Buffer.from(source, 'base64');
    return key.length === 32 ? key : null;
  } catch { return null; }
}

export function ready(): boolean {
  return Boolean(
    /^https:\/\/[a-z0-9.-]+\.supabase\.co\/?$/i.test(process.env.LVPT_SMS_STAGING_SUPABASE_URL || '') &&
    (process.env.LVPT_SMS_STAGING_SUPABASE_SERVICE_KEY || '').length >= 50 &&
    /^[a-f0-9]{64}$/i.test(process.env.LVPT_SMS_STAGING_TOKEN_SHA256 || '') &&
    (process.env.LVPT_SMS_STAGING_ALLOWED_NUMBERS || '').trim() &&
    keyBytes()
  );
}

function constantTimeEqual(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}

export function authorized(request: Request): boolean {
  const expected = process.env.LVPT_SMS_STAGING_TOKEN_SHA256 || '';
  const supplied = request.headers.get('x-lvpt-sms-sync-token') || '';
  if (!/^[a-f0-9]{64}$/i.test(expected) || supplied.length < 32 || supplied.length > 256) return false;
  return constantTimeEqual(
    createHash('sha256').update(supplied, 'utf8').digest(),
    Buffer.from(expected, 'hex')
  );
}

export function normalizeNumber(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const digits = raw.replace(/[^0-9]/g, '');
  const local = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  return /^\d{10}$/.test(local) ? local : '';
}

export function allowedNumbers(): Set<string> {
  return new Set((process.env.LVPT_SMS_STAGING_ALLOWED_NUMBERS || '')
    .split(',').map(n => normalizeNumber(n)).filter(Boolean));
}

export type IncomingSms = {
  sms_id: number; phone: string; direction: 'incoming' | 'outgoing'; timestamp_ms: number; body: string;
};
export function validatePayload(payload: unknown): { device_id: string; messages: IncomingSms[] } | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as { device_id?: unknown; messages?: unknown };
  if (typeof p.device_id !== 'string' || !UUID.test(p.device_id) ||
      !Array.isArray(p.messages) || p.messages.length > MAX_SMS_BATCH) return null;
  const allowed = allowedNumbers();
  const now = Date.now();
  const messages: IncomingSms[] = [];
  const seen = new Set<number>();
  for (const item of p.messages) {
    if (!item || typeof item !== 'object') return null;
    const m = item as Record<string, unknown>;
    const sms_id = m.sms_id;
    const timestamp_ms = m.timestamp_ms;
    const phone = normalizeNumber(m.phone);
    const body = m.body;
    const direction = m.direction;
    if (typeof sms_id !== 'number' || !Number.isSafeInteger(sms_id) || sms_id <= 0 ||
        typeof timestamp_ms !== 'number' || !Number.isSafeInteger(timestamp_ms) ||
        timestamp_ms < 946684800000 || timestamp_ms > now + 86_400_000 ||
        !phone || !allowed.has(phone) ||
        (direction !== 'incoming' && direction !== 'outgoing') ||
        typeof body !== 'string' || body.length > MAX_SMS_BODY ||
        seen.has(sms_id)) return null;
    seen.add(sms_id);
    messages.push({ sms_id, timestamp_ms, phone, body, direction });
  }
  return { device_id: p.device_id, messages };
}

export function encryptBatch(tenantId: string, deviceId: string, messages: IncomingSms[]) {
  const key = keyBytes();
  if (!key) throw new Error('Storage encryption is not configured');
  return messages.map(m => {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(Buffer.from(tenantId + ':' + deviceId + ':' + m.sms_id, 'utf8'));
    const encrypted = Buffer.concat([cipher.update(m.body, 'utf8'), cipher.final()]);
    const ciphertext = Buffer.concat([encrypted, cipher.getAuthTag()]);
    return {
      tenant_id: tenantId,
      device_id: deviceId,
      sms_id: m.sms_id,
      contact_hash: createHmac('sha256', key).update(m.phone, 'utf8').digest('hex'),
      direction: m.direction,
      timestamp_ms: m.timestamp_ms,
      body_nonce: iv.toString('base64'),
      body_ciphertext: ciphertext.toString('base64')
    };
  });
}

export function supabaseEndpoint(path: string): string {
  return (process.env.LVPT_SMS_STAGING_SUPABASE_URL || '').replace(/\/$/, '') +
    '/rest/v1/' + path;
}

export function supabaseHeaders(prefer?: string): Record<string, string> {
  const secret = process.env.LVPT_SMS_STAGING_SUPABASE_SERVICE_KEY || '';
  return {
    apikey: secret,
    Authorization: 'Bearer ' + secret,
    'Content-Type': 'application/json',
    ...(prefer ? { Prefer: prefer } : {})
  };
}

export function jsonNoStore(data: unknown, status: number): Response {
  return Response.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store, private', 'X-Content-Type-Options': 'nosniff' }
  });
}
