import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import {
  REVIEW_COOKIE_NAME, REVIEW_SESSION_TTL_SECONDS, createReviewSession, verifyReviewSession
} from '../lib/sms-review-session.mjs';

const key=randomBytes(32);
const otherKey=randomBytes(32);
const tokenHash='5'.repeat(64); // Synthetic only; not the owner's secret hash.
const host='lvpt-preview-example.vercel.app';
const now=Date.parse('2026-11-05T00:00:00Z');
const session=createReviewSession(key,tokenHash,host,now);

assert.equal(REVIEW_COOKIE_NAME,'__Host-lvpt-sms-review');
assert.equal(session.split('.').length,3);
assert.equal(verifyReviewSession(session,key,tokenHash,host,now),true);
assert.equal(verifyReviewSession(session,key,tokenHash,host,now+REVIEW_SESSION_TTL_SECONDS*1000-1000),true);
assert.equal(verifyReviewSession(session,key,tokenHash,host,now+REVIEW_SESSION_TTL_SECONDS*1000),false);
assert.equal(verifyReviewSession(session,key,tokenHash,host,now-1000),false);
assert.equal(verifyReviewSession(session,otherKey,tokenHash,host,now),false);
assert.equal(verifyReviewSession(session,key,'6'.repeat(64),host,now),false);
assert.equal(verifyReviewSession(session,key,tokenHash,'another-host.vercel.app',now),false);
assert.equal(verifyReviewSession(session+'junk',key,tokenHash,host,now),false);
assert.equal(verifyReviewSession('',key,tokenHash,host,now),false);
assert(!session.includes(tokenHash) && !session.includes('DEVICE TOKEN'),
  'Cookie must never contain device token or expected token hash');
assert.throws(()=>createReviewSession(randomBytes(16),tokenHash,host,now),/signing key/);
console.log('SMS secure browser session tests passed.');
