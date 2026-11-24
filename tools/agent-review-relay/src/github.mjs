import { createSign } from 'node:crypto';
import { GITHUB_API, RELAY_REPO } from './constants.mjs';
import { contextFromPull } from './event.mjs';
import { containsSensitiveLeak, isSafePath, isSensitivePath } from './sanitize.mjs';

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

export function createAppJwt({ appId, privateKey, now }) {
  const pem = privateKey.includes('\\n') ? privateKey.replace(/\\n/g, '\n') : privateKey;
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const iat = Math.floor(now / 1000) - 60;
  const payload = base64url(JSON.stringify({ iat, exp: iat + 9 * 60, iss: String(appId) }));
  const data = `${header}.${payload}`;
  const signer = createSign('RSA-SHA256');
  signer.update(data);
  const signature = signer.sign(pem).toString('base64url');
  return `${data}.${signature}`;
}

export async function resolveGitHubToken(config, fetchImpl, cache, now) {
  if (config.githubAppId && config.githubAppInstallationId && config.githubAppPrivateKey) {
    if (cache.token && cache.exp > now + 60_000) return cache.token;
    const jwt = createAppJwt({ appId: config.githubAppId, privateKey: config.githubAppPrivateKey, now });
    const response = await fetchImpl(`${GITHUB_API}/app/installations/${config.githubAppInstallationId}/access_tokens`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${jwt}`,
        accept: 'application/vnd.github+json',
        'user-agent': 'lvpt-agent-review-relay',
        'x-github-api-version': '2022-11-28',
      },
    });
    if (!response.ok) throw new Error(`GitHub authentication failed (${response.status})`);
    const data = await response.json();
    if (!data || typeof data.token !== 'string' || data.token.length < 10) {
      throw new Error('GitHub authentication failed (empty)');
    }
    cache.token = data.token;
    cache.exp = Date.parse(data.expires_at || '') || (now + 50 * 60 * 1000);
    return cache.token;
  }
  if (!config.githubToken) throw new Error('GitHub authentication failed (not_configured)');
  return config.githubToken;
}

function safeCheckName(name) {
  if (typeof name !== 'string') return '';
  if (!/^[A-Za-z0-9_ .:/-]{1,80}$/.test(name)) return '';
  if (containsSensitiveLeak(name)) return '';
  return name;
}

export function summarizeEvidence(filesPayload, checksPayload, statusPayload = null) {
  const files = Array.isArray(filesPayload) ? filesPayload : [];
  if (files.length >= 100) {
    return { testSummary: 'unavailable', changedFiles: [], diff: 'diff unavailable', incomplete: true };
  }
  const changedFiles = [];
  let diff = '';
  for (const file of files) {
    const filename = file && typeof file.filename === 'string' ? file.filename : '';
    if (!isSafePath(filename)) return { testSummary: 'unavailable', changedFiles: [], diff: 'diff unavailable', unsafe: true };
    changedFiles.push(filename);
    if (isSensitivePath(filename)) continue;
    const patch = file && typeof file.patch === 'string' ? file.patch : '';
    if (!patch || containsSensitiveLeak(patch)) continue;
    const chunk = `FILE ${filename}\n${patch}\n`;
    if (diff.length + chunk.length > 8000) continue;
    diff += chunk;
  }
  const runs = checksPayload && Array.isArray(checksPayload.check_runs) ? checksPayload.check_runs : [];
  // The isolated relay is linked to this monorepo for hosting. Its Vercel build
  // status is unrelated to ordinary Command Center PRs and often fails because
  // those PR branches intentionally do not contain tools/agent-review-relay.
  // Never let that infrastructure-only status override the PR's relevant checks.
  const irrelevantRelayContexts = new Set([
    'Vercel – lvpt-agent-review-relay-staging',
    'Vercel - lvpt-agent-review-relay-staging',
  ]);
  const statuses = statusPayload && Array.isArray(statusPayload.statuses)
    ? statusPayload.statuses.filter((status) => status && !irrelevantRelayContexts.has(status.context))
    : [];
  if (!runs.length && !statuses.length) {
    return { testSummary: 'unavailable', changedFiles, diff: diff || 'diff unavailable', noChecks: true };
  }
  const failedRuns = runs.filter((run) => ['failure', 'cancelled', 'timed_out'].includes(run.conclusion));
  const pendingRuns = runs.filter((run) => run.status !== 'completed');
  const failedStatuses = statuses.filter((status) => status.state === 'failure' || status.state === 'error');
  const pendingStatuses = statuses.filter((status) => status.state === 'pending');
  if ((pendingRuns.length || pendingStatuses.length) && !failedRuns.length && !failedStatuses.length) {
    return { testSummary: 'unavailable', changedFiles, diff: diff || 'diff unavailable' };
  }
  if (failedRuns.length || failedStatuses.length) {
    const names = [
      ...failedRuns.map((run) => safeCheckName(run.name)),
      ...failedStatuses.map((status) => safeCheckName(status.context)),
    ].filter(Boolean);
    return {
      testSummary: names.length ? `FAIL ${names.join(' ')}` : 'FAIL checks',
      changedFiles,
      diff: diff || 'diff unavailable',
    };
  }
  const runsOk = runs.every((run) => ['success', 'skipped', 'neutral'].includes(run.conclusion));
  const statusesOk = statuses.every((status) => status.state === 'success');
  if (runsOk && statusesOk) return { testSummary: 'PASS', changedFiles, diff: diff || 'diff unavailable' };
  return { testSummary: 'unavailable', changedFiles, diff: diff || 'diff unavailable' };
}

function githubHeaders(token) {
  return {
    authorization: `Bearer ${token}`,
    accept: 'application/vnd.github+json',
    'user-agent': 'lvpt-agent-review-relay',
    'x-github-api-version': '2022-11-28',
  };
}

function accessError(status) {
  const error = new Error(`GitHub access failed (${status})`);
  error.code = status === 401 || status === 403 || status === 404 ? 'access_denied' : 'github';
  return error;
}

export async function fetchPullRequest({ config, fetchImpl, cache, pr, now }) {
  const token = await resolveGitHubToken(config, fetchImpl, cache, now);
  const response = await fetchImpl(`${GITHUB_API}/repos/${RELAY_REPO}/pulls/${pr}`, { headers: githubHeaders(token) });
  if (!response.ok) throw accessError(response.status);
  const pull = await response.json();
  if (!pull || pull.head?.repo?.full_name && pull.head.repo.full_name !== RELAY_REPO) {
    throw accessError(404);
  }
  return pull;
}

export async function findPullNumberForSha({ config, fetchImpl, cache, sha, now }) {
  const token = await resolveGitHubToken(config, fetchImpl, cache, now);
  const response = await fetchImpl(`${GITHUB_API}/repos/${RELAY_REPO}/commits/${sha}/pulls`, { headers: githubHeaders(token) });
  if (!response.ok) throw accessError(response.status);
  const pulls = await response.json();
  if (!Array.isArray(pulls) || !pulls.length) return null;
  const match = pulls.find((pull) => pull?.head?.sha === sha) || pulls[0];
  return Number.isInteger(match?.number) ? match.number : null;
}

export async function fetchPullEvidence({ config, fetchImpl, cache, pr, sha, now }) {
  const token = await resolveGitHubToken(config, fetchImpl, cache, now);
  const headers = githubHeaders(token);
  const filesResponse = await fetchImpl(`${GITHUB_API}/repos/${RELAY_REPO}/pulls/${pr}/files?per_page=100`, { headers });
  if (!filesResponse.ok) throw accessError(filesResponse.status);
  const checksResponse = await fetchImpl(`${GITHUB_API}/repos/${RELAY_REPO}/commits/${sha}/check-runs?per_page=100`, { headers });
  if (!checksResponse.ok) throw accessError(checksResponse.status);
  const statusResponse = await fetchImpl(`${GITHUB_API}/repos/${RELAY_REPO}/commits/${sha}/status`, { headers });
  if (!statusResponse.ok) throw accessError(statusResponse.status);
  return summarizeEvidence(await filesResponse.json(), await checksResponse.json(), await statusResponse.json());
}

export async function confirmPullHead({ config, fetchImpl, cache, pr, sha, now, requiredLabel }) {
  try {
    const pull = await fetchPullRequest({ config, fetchImpl, cache, pr, now });
    const parsed = contextFromPull(pull, {
      sha,
      requiredLabel,
      event: 'pull_request',
      action: 'synchronize',
      repo: RELAY_REPO,
    });
    if (!parsed.ok) return { ok: false, transition: parsed.transition };
    if (parsed.ctx.sha !== sha) return { ok: false, transition: 'stale_head' };
    return { ok: true, ctx: parsed.ctx };
  } catch (error) {
    if (error && error.code === 'access_denied') return { ok: false, transition: 'access_denied' };
    throw error;
  }
}

export async function postIssueComment({ config, fetchImpl, cache, pr, body, now }) {
  const token = await resolveGitHubToken(config, fetchImpl, cache, now);
  const response = await fetchImpl(`${GITHUB_API}/repos/${RELAY_REPO}/issues/${pr}/comments`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'content-type': 'application/json',
      'user-agent': 'lvpt-agent-review-relay',
      'x-github-api-version': '2022-11-28',
    },
    body: JSON.stringify({ body }),
  });
  if (!response.ok) throw new Error(`GitHub comment failed (${response.status})`);
  return response.json();
}
