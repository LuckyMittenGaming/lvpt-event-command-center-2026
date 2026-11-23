import assert from 'node:assert/strict';
import test from 'node:test';
import { signGitHubBody, verifyGitHubSignature } from '../src/signature.mjs';

const secret = 'test-webhook-secret-value';
const body = '{"ok":true}';

test('accepts the raw-body HMAC and rejects tampering, sha1, and a missing secret', () => {
  const signature = signGitHubBody(body, secret);
  assert.equal(verifyGitHubSignature(body, signature, secret), true);
  assert.equal(verifyGitHubSignature(`${body} `, signature, secret), false);
  assert.equal(verifyGitHubSignature(body, signature, 'different-webhook-secret'), false);
  assert.equal(verifyGitHubSignature(body, `sha1=${'a'.repeat(40)}`, secret), false);
  assert.equal(verifyGitHubSignature(body, '', secret), false);
  assert.equal(verifyGitHubSignature(body, signature, ''), false);
  assert.equal(verifyGitHubSignature(body, 'sha256=abcd', secret), false);
});
