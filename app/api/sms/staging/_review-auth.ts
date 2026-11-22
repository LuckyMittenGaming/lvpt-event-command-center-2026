import { authorized } from './_lib';
import {
  REVIEW_COOKIE_NAME, REVIEW_SESSION_TTL_SECONDS,
  createReviewSession, verifyReviewSession
} from '../../../../lib/sms-review-session.mjs';

function sessionKey(): Buffer | null {
  try {
    const data=Buffer.from(process.env.LVPT_SMS_STAGING_DATA_KEY_BASE64 || '', 'base64');
    return data.length===32 ? data : null;
  } catch { return null; }
}

function requestHost(request: Request): string {
  // Use the actual URL rather than untrusted X-Forwarded-Host for the session binding.
  return new URL(request.url).host.toLowerCase();
}

function cookieValue(request: Request): string {
  const cookies=(request.headers.get('cookie')||'').split(';');
  const match=cookies.map(part=>part.trim()).find(part=>part.startsWith(REVIEW_COOKIE_NAME+'='));
  return match ? match.slice(REVIEW_COOKIE_NAME.length+1) : '';
}

export function hasReviewSession(request: Request): boolean {
  const key=sessionKey();
  if(!key) return false;
  const hash=process.env.LVPT_SMS_STAGING_TOKEN_SHA256 || '';
  return verifyReviewSession(cookieValue(request),key,hash,requestHost(request));
}

// Keep original API header authentication temporarily for legacy owner pilot,
// but browser session cannot authorize Android ingest.
export function authorizedReviewer(request: Request): boolean {
  return hasReviewSession(request) || authorized(request);
}

export function makeReviewSessionCookie(request: Request): string {
  const key=sessionKey();
  if(!key) throw new Error('Review session encryption not configured');
  const hash=process.env.LVPT_SMS_STAGING_TOKEN_SHA256 || '';
  const value=createReviewSession(key,hash,requestHost(request));
  return REVIEW_COOKIE_NAME + '=' + value + '; Path=/; Max-Age=' +
    REVIEW_SESSION_TTL_SECONDS + '; Secure; HttpOnly; SameSite=Strict';
}

export function clearedReviewSessionCookie(): string {
  return REVIEW_COOKIE_NAME +
    '=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Secure; HttpOnly; SameSite=Strict';
}

// A cookie-authenticated mutation must originate at the same HTTPS origin.
// A stolen cookie cannot be used by a third-party origin via a cross-site POST.
export function allowedReviewMutation(request: Request): boolean {
  const origin=request.headers.get('origin');
  if(!origin) return false;
  try {
    const expected=new URL(request.url);
    const provided=new URL(origin);
    return expected.protocol==='https:' && provided.protocol==='https:' &&
      provided.origin===expected.origin;
  }catch{return false;}
}
