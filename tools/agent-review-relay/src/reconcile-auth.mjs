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

export function signQstashRequest({ rawBody, key, url, now = Date.now() }) {
  const headerPart = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payloadPart = Buffer.from(JSON.stringify({
    iss: 'Upstash',
    sub: url,
    body: createHash('sha256').update(rawBody).digest('base64url'),
    iat: Math.floor(now / 1000),
    nbf: Math.floor(now / 1000) - 5,
    exp: Math.floor(now / 1000) + 300,
  })).toString('base64url');
  const data = `${headerPart}.${payloadPart}`;
  const signature = createHmac('sha256', key).update(data).digest('base64url');
  return `${data}.${signature}`;
}

function verifyQstashJwt(token, key, rawBody, now, expectedUrl) {
  if (!key || key.length < 16 || !expectedUrl) return false;
  return token.split(/[,\s]+/).filter(Boolean).some((part) => verifyOneJwt(part, key, rawBody, now, expectedUrl));
}

function verifyOneJwt(token, key, rawBody, now, expectedUrl) {
  const pieces = token.split('.');
  if (pieces.length !== 3) return false;
  let headerJson;
  try {
    headerJson = JSON.parse(Buffer.from(pieces[0], 'base64url').toString('utf8'));
  } catch {
    return false;
  }
  if (!headerJson || headerJson.alg !== 'HS256') return false;
  const data = `${pieces[0]}.${pieces[1]}`;
  const expected = createHmac('sha256', key).update(data).digest('base64url');
  if (!same(expected, pieces[2])) return false;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(pieces[1], 'base64url').toString('utf8'));
  } catch {
    return false;
  }
  const seconds = Math.floor(now / 1000);
  if (payload.iss !== 'Upstash') return false;
  if (typeof payload.sub !== 'string' || payload.sub !== expectedUrl) return false;
  if (!Number.isFinite(payload.exp) || payload.exp < seconds) return false;
  if (Number.isFinite(payload.nbf) && payload.nbf > seconds) return false;
  const hash = createHash('sha256').update(rawBody).digest('base64url');
  return payload.body === hash;
}

export function reconcileAuthorized(rawBody, headers, config, now = Date.now()) {
  const hmac = header(headers, 'x-relay-reconcile-signature');
  if (verifyHmac(rawBody, hmac, config.reconcileSecret || '')) {
    return { ok: true, replayKey: createHash('sha256').update(hmac).digest('hex') };
  }
  const qstash = header(headers, 'upstash-signature');
  const expectedUrl = config.reconcileUrl || '';
  if (qstash && (
    verifyQstashJwt(qstash, config.qstashCurrentKey, rawBody, now, expectedUrl)
    || verifyQstashJwt(qstash, config.qstashNextKey, rawBody, now, expectedUrl)
  )) {
    return { ok: true, replayKey: createHash('sha256').update(qstash).digest('hex') };
  }
  return { ok: false, replayKey: '' };
}
