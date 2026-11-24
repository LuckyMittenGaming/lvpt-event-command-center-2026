import { REVIEW_COOKIE_NAME, verifyReviewSession } from './sms-review-session.mjs';

function cookieValue(request) {
  const cookies = String(request.headers.get('cookie') || '').split(';');
  const match = cookies.map((part) => part.trim()).find((part) => part.startsWith(`${REVIEW_COOKIE_NAME}=`));
  return match ? match.slice(REVIEW_COOKIE_NAME.length + 1) : '';
}

function requestHost(request) {
  try {
    return new URL(request.url).host.toLowerCase();
  } catch {
    return '';
  }
}

// Same signed HttpOnly review session the SMS workspace already uses.
// Origin is checked only after the cookie verifies, and a missing Origin is
// not treated as permission.
export function privateReadDecision(request, env = process.env, now = Date.now()) {
  let key = null;
  try {
    const decoded = Buffer.from(env.LVPT_SMS_STAGING_DATA_KEY_BASE64 || '', 'base64');
    key = decoded.length === 32 ? decoded : null;
  } catch {
    key = null;
  }
  const hash = env.LVPT_SMS_STAGING_TOKEN_SHA256 || '';
  const session = Boolean(key) && verifyReviewSession(cookieValue(request), key, hash, requestHost(request), now);
  if (!session) return { allow: false, status: 401, reason: 'unauthorized' };
  const origin = request.headers.get('origin');
  if (!origin) return { allow: true };
  try {
    const provided = new URL(origin);
    const expected = new URL(request.url);
    if (provided.origin !== expected.origin) {
      return { allow: false, status: 403, reason: 'same_origin_required' };
    }
  } catch {
    return { allow: false, status: 403, reason: 'same_origin_required' };
  }
  return { allow: true };
}
