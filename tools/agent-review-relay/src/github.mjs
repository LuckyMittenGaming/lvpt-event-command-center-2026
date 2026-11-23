import { createSign } from 'node:crypto';
import { GITHUB_API, RELAY_REPO } from './constants.mjs';
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

export function summarizeEvidence(filesPayload, checksPayload) {
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
  if (!runs.length) return { testSummary: 'unavailable', changedFiles, diff: diff || 'diff unavailable' };
  const failed = runs.filter((run) => ['failure', 'cancelled', 'timed_out'].includes(run.conclusion));
  const pending = runs.filter((run) => run.status !== 'completed');
  if (pending.length && !failed.length) return { testSummary: 'unavailable', changedFiles, diff: diff || 'diff unavailable' };
  if (failed.length) {
    const names = failed.map((run) => safeCheckName(run.name)).filter(Boolean);
    return {
      testSummary: names.length ? `FAIL ${names.join(' ')}` : 'FAIL checks',
      changedFiles,
      diff: diff || 'diff unavailable',
    };
  }
  const settled = runs.every((run) => ['success', 'skipped', 'neutral'].includes(run.conclusion));
  if (settled) return { testSummary: 'PASS', changedFiles, diff: diff || 'diff unavailable' };
  return { testSummary: 'unavailable', changedFiles, diff: diff || 'diff unavailable' };
}

export async function fetchPullEvidence({ config, fetchImpl, cache, pr, sha, now }) {
  const token = await resolveGitHubToken(config, fetchImpl, cache, now);
  const headers = {
    authorization: `Bearer ${token}`,
    accept: 'application/vnd.github+json',
    'user-agent': 'lvpt-agent-review-relay',
    'x-github-api-version': '2022-11-28',
  };
  const filesResponse = await fetchImpl(`${GITHUB_API}/repos/${RELAY_REPO}/pulls/${pr}/files?per_page=100`, { headers });
  if (!filesResponse.ok) throw new Error(`GitHub evidence failed (${filesResponse.status})`);
  const checksResponse = await fetchImpl(`${GITHUB_API}/repos/${RELAY_REPO}/commits/${sha}/check-runs?per_page=100`, { headers });
  if (!checksResponse.ok) throw new Error(`GitHub evidence failed (${checksResponse.status})`);
  return summarizeEvidence(await filesResponse.json(), await checksResponse.json());
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
