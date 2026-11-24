import { RELAY_REPO } from './constants.mjs';

export const CURSOR_API_ORIGIN = 'https://api.cursor.com';

const ACTIVE_RUN = new Set(['CREATING', 'RUNNING', 'WAITING_FOR_BACKGROUND_WORK']);
const TERMINAL_RUN = new Set(['FINISHED', 'ERROR', 'CANCELLED', 'EXPIRED']);

function basicAuth(key) {
  return `Basic ${Buffer.from(`${key}:`).toString('base64')}`;
}

function launchError(message, ambiguous) {
  const error = new Error(message);
  error.ambiguous = ambiguous;
  return error;
}

export function buildLaunchBody({ pr, task }) {
  return {
    prompt: { text: String(task || '').slice(0, 12000) },
    name: `LVPT staging PR ${pr}`.slice(0, 100),
    repos: [{
      url: `https://github.com/${RELAY_REPO}`,
      prUrl: `https://github.com/${RELAY_REPO}/pull/${pr}`,
    }],
    workOnCurrentBranch: true,
    autoCreatePR: false,
    mode: 'agent',
  };
}

async function cursorFetch(fetchImpl, path, options) {
  if (!path.startsWith('/v1/agents')) throw launchError('Cursor launch failed (path)', false);
  const url = `${CURSOR_API_ORIGIN}${path}`;
  return fetchImpl(url, options);
}

export async function launchCursorRun({ config, fetchImpl, pr, task, timeoutMs }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs || config.timeoutMs);
  try {
    const response = await cursorFetch(fetchImpl, '/v1/agents', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        authorization: basicAuth(config.cursorApiKey),
        'content-type': 'application/json',
      },
      body: JSON.stringify(buildLaunchBody({ pr, task })),
    });
    if (!response.ok) {
      throw launchError(`Cursor launch failed (${response.status})`, response.status >= 500 || response.status === 408 || response.status === 429);
    }
    const data = await response.json();
    const agentId = data?.agent?.id;
    const runId = data?.run?.id;
    if (!/^bc-[A-Za-z0-9-]{8,80}$/.test(agentId || '') || !/^run-[A-Za-z0-9-]{8,80}$/.test(runId || '')) {
      throw launchError('Cursor launch failed (invalid_id)', true);
    }
    return { agentId, runId, status: typeof data.run.status === 'string' ? data.run.status : 'CREATING' };
  } catch (error) {
    if (error?.name === 'AbortError') throw launchError('Cursor launch failed (timeout)', true);
    if (error?.ambiguous === true || error?.ambiguous === false) throw error;
    throw launchError('Cursor launch failed (network)', true);
  } finally {
    clearTimeout(timer);
  }
}

export async function readCursorRun({ config, fetchImpl, agentId, runId, timeoutMs }) {
  if (!/^bc-[A-Za-z0-9-]{8,80}$/.test(agentId) || !/^run-[A-Za-z0-9-]{8,80}$/.test(runId)) {
    return { unknown: true };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs || config.timeoutMs);
  try {
    const response = await cursorFetch(fetchImpl, `/v1/agents/${agentId}/runs/${runId}`, {
      method: 'GET',
      signal: controller.signal,
      headers: { authorization: basicAuth(config.cursorApiKey) },
    });
    if (!response.ok) return { unknown: true };
    const data = await response.json();
    const status = typeof data?.status === 'string' ? data.status : '';
    if (TERMINAL_RUN.has(status)) return { terminal: true, status };
    if (ACTIVE_RUN.has(status)) return { terminal: false, status };
    return { unknown: true };
  } catch {
    return { unknown: true };
  } finally {
    clearTimeout(timer);
  }
}
