import { RELAY_BASE, RELAY_REPO } from '../src/constants.mjs';
import { signGitHubBody } from '../src/signature.mjs';

export const FIXED_NOW = Date.parse('2026-11-23T21:00:05.000Z');
export const UPDATED_AT = '2026-11-23T21:00:00.000Z';

export function buildPayload(overrides = {}) {
  const head = {
    sha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    ref: 'cursor/sample',
    repo: { full_name: RELAY_REPO },
    ...(overrides.head || {}),
  };
  if (overrides.headRepo) head.repo = { full_name: overrides.headRepo };
  return {
    action: overrides.action || 'opened',
    repository: { full_name: overrides.repo || RELAY_REPO },
    pull_request: {
      number: overrides.number || 21,
      draft: overrides.draft !== false,
      title: overrides.title || 'Staging sample',
      body: overrides.body || 'Bounded staging change.',
      user: { login: overrides.author || 'LuckyMittenGaming' },
      base: {
        ref: overrides.base || RELAY_BASE,
        repo: { full_name: RELAY_REPO },
      },
      head,
      labels: overrides.labels || [{ name: 'agent-loop' }],
      updated_at: overrides.updatedAt || UPDATED_AT,
      html_url: overrides.htmlUrl || 'https://evil.example/phish',
    },
    comment: overrides.comment,
  };
}

export function signedHeaders(rawBody, secret, deliveryId = 'delivery-0001', eventName = 'pull_request') {
  return {
    'x-hub-signature-256': signGitHubBody(rawBody, secret),
    'x-github-delivery': deliveryId,
    'x-github-event': eventName,
  };
}
