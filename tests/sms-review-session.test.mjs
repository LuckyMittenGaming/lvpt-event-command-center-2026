import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  REVIEW_COOKIE_NAME, REVIEW_SESSION_TTL_SECONDS, createReviewSession, verifyReviewSession
} from '../lib/sms-review-session.mjs';

const key = randomBytes(32);
const otherKey = randomBytes(32);
const tokenHash = '5'.repeat(64); // Synthetic only; not the owner's secret hash.
const host = 'lvpt-preview-example.vercel.app';
const now = Date.parse('2026-11-05T00:00:00Z');
const session = createReviewSession(key, tokenHash, host, now);

assert.equal(REVIEW_COOKIE_NAME, '__Host-lvpt-sms-review');
assert.equal(session.split('.').length, 3);
assert.equal(verifyReviewSession(session, key, tokenHash, host, now), true);
assert.equal(verifyReviewSession(session, key, tokenHash, host, now + REVIEW_SESSION_TTL_SECONDS * 1000 - 1000), true);
assert.equal(verifyReviewSession(session, key, tokenHash, host, now + REVIEW_SESSION_TTL_SECONDS * 1000), false);
assert.equal(verifyReviewSession(session, key, tokenHash, host, now - 1000), false);
assert.equal(verifyReviewSession(session, otherKey, tokenHash, host, now), false);
assert.equal(verifyReviewSession(session, key, '6'.repeat(64), host, now), false);
assert.equal(verifyReviewSession(session, key, tokenHash, 'another-host.vercel.app', now), false);
assert.equal(verifyReviewSession(session + 'junk', key, tokenHash, host, now), false);
assert.equal(verifyReviewSession('', key, tokenHash, host, now), false);
assert.equal(verifyReviewSession(null, key, tokenHash, host, now), false);
assert.equal(verifyReviewSession(undefined, key, tokenHash, host, now), false);
assert.equal(verifyReviewSession('v1.notanexpiry.' + 'A'.repeat(43), key, tokenHash, host, now), false);
assert.equal(verifyReviewSession('v2.' + (Math.floor(now / 1000) + 60) + '.' + 'A'.repeat(43), key, tokenHash, host, now), false);

// Forged signature over a valid expiry must fail.
const parts = session.split('.');
const forged = `${parts[0]}.${parts[1]}.${'A'.repeat(43)}`;
assert.equal(verifyReviewSession(forged, key, tokenHash, host, now), false);

// Truncated / oversized cookies are rejected.
assert.equal(verifyReviewSession(session.slice(0, 20), key, tokenHash, host, now), false);
assert.equal(verifyReviewSession(`${session}${'x'.repeat(200)}`, key, tokenHash, host, now), false);

assert(!session.includes(tokenHash) && !session.includes('DEVICE TOKEN'),
  'Cookie must never contain device token or expected token hash');
assert(!session.toLowerCase().includes(host.toLowerCase()),
  'Cookie payload must not embed the host in cleartext');
assert.throws(() => createReviewSession(randomBytes(16), tokenHash, host, now), /signing key/);
assert.throws(() => createReviewSession(key, 'short', host, now), /Invalid review session binding/);
assert.throws(() => createReviewSession(key, tokenHash, 'ab', now), /Invalid review session binding/);
assert.throws(() => createReviewSession(key, tokenHash, host, Number.NaN), /Invalid session clock/);

const sessionSource = readFileSync(new URL('../lib/sms-review-session.mjs', import.meta.url), 'utf8');
assert.match(sessionSource, /timingSafeEqual/);
assert.match(sessionSource, /createHmac\('sha256'/);
assert.match(sessionSource, /__Host-lvpt-sms-review/);
assert.match(sessionSource, /lvpt-staging-review-session-only-v1/);
assert.doesNotMatch(sessionSource, /localStorage|sessionStorage/);
// Signing primitives stay cookie-only — no env credential reads or header token auth in this module.
assert.doesNotMatch(sessionSource, /process\.env|x-lvpt-sms-sync-token|SUPABASE_SERVICE|VERCEL_AUTOMATION_BYPASS/i);

const reviewAuth = readFileSync(new URL('../app/api/sms/staging/_review-auth.ts', import.meta.url), 'utf8');
assert.match(reviewAuth, /HttpOnly/);
assert.match(reviewAuth, /Secure/);
assert.match(reviewAuth, /SameSite=Strict/);
assert.match(reviewAuth, /Max-Age=0/);
assert.match(reviewAuth, /verifyReviewSession/);
assert.match(reviewAuth, /createReviewSession/);
assert.match(reviewAuth, /allowedReviewMutation/);
assert.match(reviewAuth, /X-Forwarded-Host/);
assert.match(reviewAuth, /actual URL rather than untrusted X-Forwarded-Host/);
// Cookie-authenticated mutations require same HTTPS origin — Origin alone is not enough to mint a session.
assert.match(reviewAuth, /provided\.origin===expected\.origin/);
assert.match(reviewAuth, /expected\.protocol==='https:'/);
assert.match(reviewAuth, /if\(!origin\) return false/);

const sessionRoute = readFileSync(new URL('../app/api/sms/staging/session/route.ts', import.meta.url), 'utf8');
assert.match(sessionRoute, /allowedReviewMutation/);
assert.match(sessionRoute, /same_origin_required/);
assert.match(sessionRoute, /makeReviewSessionCookie|clearedReviewSessionCookie/);
assert.match(sessionRoute, /hasReviewSession/);
// Login still requires the device token hash comparison — Origin/cookie forging is insufficient.
assert.match(sessionRoute, /authorized\(verificationRequest\)/);
assert.match(sessionRoute, /x-lvpt-sms-sync-token/);

console.log('SMS secure browser session tests passed.');
