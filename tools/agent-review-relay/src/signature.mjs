import { createHmac, timingSafeEqual } from 'node:crypto';

export function signGitHubBody(rawBody, secret) {
  const digest = createHmac('sha256', secret).update(rawBody).digest('hex');
  return `sha256=${digest}`;
}

export function verifyGitHubSignature(rawBody, signatureHeader, secret) {
  if (typeof secret !== 'string' || secret.length < 16) return false;
  if (typeof signatureHeader !== 'string' || !signatureHeader.startsWith('sha256=')) return false;
  const actualHex = signatureHeader.slice('sha256='.length);
  if (!/^[0-9a-f]{64}$/i.test(actualHex)) return false;
  const expectedHex = createHmac('sha256', secret).update(rawBody).digest('hex');
  const actual = Buffer.from(actualHex, 'hex');
  const expected = Buffer.from(expectedHex, 'hex');
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}
