import { createHmac, timingSafeEqual } from 'node:crypto';

// Server-only signed reviewer session. No Device Token, Vercel Bypass Token or
// service-role credential is included in the cookie or sent back to the browser.
export const REVIEW_COOKIE_NAME = '__Host-lvpt-sms-review';
export const REVIEW_SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
const VERSION = 'v1';
const TOKEN_HASH = /^[a-f0-9]{64}$/i;
const SESSION_PATTERN = /^v1\.([0-9]{10})\.([A-Za-z0-9_-]{43})$/;

function signingKey(masterKey) {
  if (!Buffer.isBuffer(masterKey) || masterKey.length !== 32)
    throw new Error('Review session signing key is not configured.');
  return createHmac('sha256', masterKey)
    .update('lvpt-staging-review-session-only-v1', 'utf8').digest();
}

function signature(masterKey, expectedTokenHash, host, expiresAt) {
  if (!TOKEN_HASH.test(expectedTokenHash || '') ||
      typeof host !== 'string' || host.length < 4)
    throw new Error('Invalid review session binding.');
  const payload = [
    VERSION, String(expiresAt), expectedTokenHash.toLowerCase(), host.toLowerCase()
  ].join('|');
  return createHmac('sha256', signingKey(masterKey))
    .update(payload, 'utf8').digest('base64url');
}

export function createReviewSession(masterKey, expectedTokenHash, host, now = Date.now()) {
  if (!Number.isFinite(now) || now < 0) throw new Error('Invalid session clock.');
  const expiresAt = Math.floor(now / 1000) + REVIEW_SESSION_TTL_SECONDS;
  return VERSION + '.' + expiresAt + '.' +
    signature(masterKey, expectedTokenHash, host, expiresAt);
}

export function verifyReviewSession(cookie, masterKey, expectedTokenHash, host, now = Date.now()) {
  if (typeof cookie !== 'string' || cookie.length > 180 ||
      !Number.isFinite(now) || now < 0) return false;
  const match = cookie.match(SESSION_PATTERN);
  if (!match) return false;
  const expiresAt = Number(match[1]);
  const nowSeconds = Math.floor(now / 1000);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= nowSeconds ||
      expiresAt > nowSeconds + REVIEW_SESSION_TTL_SECONDS) return false;
  let actual, expected;
  try {
    actual = Buffer.from(match[2], 'base64url');
    expected = Buffer.from(signature(masterKey, expectedTokenHash, host, expiresAt), 'base64url');
  } catch { return false; }
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
