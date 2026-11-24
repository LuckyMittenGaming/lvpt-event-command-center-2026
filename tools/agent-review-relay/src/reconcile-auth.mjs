import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

function header(headers, name) {
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(headers || {})) {
    if (key.toLowerCase() === wanted) return Array.isArray(value) ? String(value[0]) : String(value || '');
  }
  return '';
}

function same(left, right) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length || a.length === 0) return false;
  return timingSafeEqual(a, b);
}

export function signReconcileBody(rawBody, secret) {
  return `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
}

function verifyHmac(rawBody, signature, secret) {
  if (!secret || secret.length < 24 || !signature.startsWith('sha256=')) return false;
  const actual = signature.slice('sha256='.length);
  if (!/^[0-9a-f]{64}$/i.test(actual)) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  return same(actual.toLowerCase(), expected);
}

function canonicalBase64Url(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+={0,2}$/.test(value)) return '';
  const stripped = value.replace(/=+$/, '');
  if (!stripped) return '';
  const pad = (4 - (stripped.length % 4)) % 4;
  if (pad === 3) return '';
  if (value !== stripped && value !== `${stripped}${'='.repeat(pad)}`) return '';
  return stripped;
}

function bodyHashMatches(claim, rawBody) {
  const expected = createHash('sha256').update(rawBody).digest('base64url');
  const actual = canonicalBase64Url(claim);
  return Boolean(actual) && same(actual, expected);
}

export function signQstashRequest({ rawBody, key, url, now = Date.now(), padBody = false }) {
  const digest = createHash('sha256').update(rawBody).digest('base64url');
  const pad = (4 - (digest.length % 4)) % 4;
  const headerPart = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payloadPart = Buffer.from(JSON.stringify({
    iss: 'Upstash',
    sub: url,
    body: padBody ? `${digest}${'='.repeat(pad)}` : digest,
    iat: Math.floor(now / 1000),
    nbf: Math.floor(now / 1000) - 5,
    exp: Math.floor(now / 1000) + 300,
  })).toString('base64url');
  const data = `${headerPart}.${payloadPart}`;
  const signature = createHmac('sha256', key).update(data).digest('base64url');
  return `${data}.${signature}`;
}

function verifyQstashJwt(token, key, rawBody, now, expectedUrl) {
  if (!key || key.length < 16 || !expectedUrl) return 'jwt_signature';
  const parts = token.split(/[,\s]+/).filter(Boolean);
  let reason = 'jwt_malformed';
  for (const part of parts) {
    const status = verifyOneJwt(part, key, rawBody, now, expectedUrl);
    if (status === 'ok') return 'ok';
    if (status === 'jwt_claim' || (status === 'jwt_signature' && reason !== 'jwt_claim')) reason = status;
  }
  return reason;
}

function verifyOneJwt(token, key, rawBody, now, expectedUrl) {
  const pieces = token.split('.');
  if (pieces.length !== 3) return 'jwt_malformed';
  let headerJson;
  try {
    headerJson = JSON.parse(Buffer.from(pieces[0], 'base64url').toString('utf8'));
  } catch {
    return 'jwt_malformed';
  }
  if (!headerJson || headerJson.alg !== 'HS256') return 'jwt_signature';
  const data = `${pieces[0]}.${pieces[1]}`;
  const expected = createHmac('sha256', key).update(data).digest('base64url');
  if (!same(expected, pieces[2])) return 'jwt_signature';
  let payload;
  try {
    payload = JSON.parse(Buffer.from(pieces[1], 'base64url').toString('utf8'));
  } catch {
    return 'jwt_malformed';
  }
  const seconds = Math.floor(now / 1000);
  if (payload.iss !== 'Upstash') return 'jwt_claim';
  if (typeof payload.sub !== 'string' || payload.sub !== expectedUrl) return 'jwt_claim';
  if (!Number.isFinite(payload.exp) || payload.exp < seconds) return 'jwt_claim';
  if (Number.isFinite(payload.nbf) && payload.nbf > seconds) return 'jwt_claim';
  if (!bodyHashMatches(payload.body, rawBody)) return 'jwt_claim';
  return 'ok';
}

function signatureDiagnostic(headers, config, reason) {
  return {
    hmacHeader: Boolean(header(headers, 'x-relay-reconcile-signature')),
    qstashHeader: Boolean(header(headers, 'upstash-signature')),
    currentKey: typeof config.qstashCurrentKey === 'string' && config.qstashCurrentKey.length >= 16,
    nextKey: typeof config.qstashNextKey === 'string' && config.qstashNextKey.length >= 16,
    urlConfigured: Boolean(config.reconcileUrl),
    reason,
  };
}

export function reconcileAuthorized(rawBody, headers, config, now = Date.now()) {
  const hmac = header(headers, 'x-relay-reconcile-signature');
  if (verifyHmac(rawBody, hmac, config.reconcileSecret || '')) {
    return { ok: true, replayKey: createHash('sha256').update(hmac).digest('hex') };
  }
  const qstash = header(headers, 'upstash-signature');
  const expectedUrl = config.reconcileUrl || '';
  let reason = 'missing_header';
  if (qstash) {
    const current = verifyQstashJwt(qstash, config.qstashCurrentKey, rawBody, now, expectedUrl);
    if (current === 'ok') return { ok: true, replayKey: createHash('sha256').update(qstash).digest('hex') };
    const next = verifyQstashJwt(qstash, config.qstashNextKey, rawBody, now, expectedUrl);
    if (next === 'ok') return { ok: true, replayKey: createHash('sha256').update(qstash).digest('hex') };
    reason = current === 'jwt_claim' || next === 'jwt_claim' ? 'jwt_claim' : (current === 'jwt_signature' || next === 'jwt_signature' ? 'jwt_signature' : 'jwt_malformed');
  } else if (hmac) {
    reason = 'hmac_rejected';
  }
  return { ok: false, replayKey: '', diagnostic: signatureDiagnostic(headers, config, reason) };
}
