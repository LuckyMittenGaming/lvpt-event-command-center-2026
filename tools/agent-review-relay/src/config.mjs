import {
  FIXTURE_WEBHOOK_SECRET,
  MAX_ITERATIONS_CEILING,
  OPENAI_RESPONSES_URL,
  REQUIRED_LABEL,
} from './constants.mjs';

const BLOCKED_SECRET_MARKERS = ['not-real', 'canary', 'fixture', 'example', 'changeme'];

function intEnv(value, fallback, min, max) {
  if (value == null || value === '') return fallback;
  if (!/^\d+$/.test(String(value))) return fallback;
  const n = Number(value);
  if (!Number.isInteger(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function moneyEnv(value, fallback, max) {
  if (value == null || value === '') return fallback;
  if (!/^\d+(\.\d{1,6})?$/.test(String(value))) return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > max) return fallback;
  return n;
}

function cleanSecret(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (/\s/.test(trimmed)) return '';
  return trimmed;
}

function hasBlockedMarker(value) {
  const lower = value.toLowerCase();
  return BLOCKED_SECRET_MARKERS.some((marker) => lower.includes(marker));
}

export function loadConfig(env = {}) {
  const label = typeof env.AGENT_RELAY_REQUIRED_LABEL === 'string' && /^[a-z0-9][a-z0-9-]{1,40}$/.test(env.AGENT_RELAY_REQUIRED_LABEL)
    ? env.AGENT_RELAY_REQUIRED_LABEL
    : REQUIRED_LABEL;
  const model = typeof env.AGENT_RELAY_MODEL === 'string' && /^[A-Za-z0-9._-]{1,64}$/.test(env.AGENT_RELAY_MODEL)
    ? env.AGENT_RELAY_MODEL
    : 'gpt-4.1-mini';

  // The isolated Preview integration injects a complete KV REST credential pair.
  // Never mix credential pairs, fall back in Production, or widen the pilot cap.
  const explicitRedisUrl = cleanSecret(env.UPSTASH_REDIS_REST_URL);
  const explicitRedisToken = cleanSecret(env.UPSTASH_REDIS_REST_TOKEN);
  const integrationRedisUrl = cleanSecret(env.KV_REST_API_URL);
  const integrationRedisToken = cleanSecret(env.KV_REST_API_TOKEN);
  const usePreviewIntegration = env.VERCEL_ENV === 'preview'
    && env.AGENT_RELAY_MAX_ITERATIONS === '1'
    && env.AGENT_RELAY_SPEND_CAP_USD === '0.25'
    && !upstashUrlAllowed(explicitRedisUrl)
    && !explicitRedisToken
    && upstashUrlAllowed(integrationRedisUrl)
    && integrationRedisToken.length >= 20
    && !hasBlockedMarker(integrationRedisToken);

  return {
    enabled: env.AGENT_RELAY_ENABLED === 'true',
    dryRun: env.AGENT_RELAY_DRY_RUN !== 'false',
    live: env.AGENT_RELAY_LIVE === 'true',
    killSwitch: env.AGENT_RELAY_KILL_SWITCH === 'true',
    webhookSecret: cleanSecret(env.GITHUB_WEBHOOK_SECRET),
    githubToken: cleanSecret(env.GITHUB_TOKEN),
    githubAppId: /^\d{1,12}$/.test(String(env.GITHUB_APP_ID || '')) ? String(env.GITHUB_APP_ID) : '',
    githubAppInstallationId: /^\d{1,12}$/.test(String(env.GITHUB_APP_INSTALLATION_ID || '')) ? String(env.GITHUB_APP_INSTALLATION_ID) : '',
    githubAppPrivateKey: typeof env.GITHUB_APP_PRIVATE_KEY === 'string' ? env.GITHUB_APP_PRIVATE_KEY : '',
    openaiApiKey: cleanSecret(env.OPENAI_API_KEY),
    openaiUrl: OPENAI_RESPONSES_URL,
    upstashUrl: usePreviewIntegration ? integrationRedisUrl : explicitRedisUrl,
    upstashToken: usePreviewIntegration ? integrationRedisToken : explicitRedisToken,
    requiredLabel: label,
    maxIterations: intEnv(env.AGENT_RELAY_MAX_ITERATIONS, MAX_ITERATIONS_CEILING, 1, MAX_ITERATIONS_CEILING),
    maxEventAgeMs: intEnv(env.AGENT_RELAY_MAX_EVENT_AGE_MS, 30 * 60 * 1000, 60 * 1000, 24 * 60 * 60 * 1000),
    prBudgetMs: intEnv(env.AGENT_RELAY_PR_BUDGET_MS, 6 * 60 * 60 * 1000, 60 * 1000, 7 * 24 * 60 * 60 * 1000),
    spendCapUsd: moneyEnv(env.AGENT_RELAY_SPEND_CAP_USD, 1, 25),
    maxOutputTokens: intEnv(env.AGENT_RELAY_MAX_OUTPUT_TOKENS, 800, 100, 2000),
    maxInputChars: intEnv(env.AGENT_RELAY_MAX_INPUT_CHARS, 12000, 1000, 20000),
    timeoutMs: intEnv(env.AGENT_RELAY_TIMEOUT_MS, 20000, 1000, 30000),
    model,
    inputUsdPerMillion: moneyEnv(env.AGENT_RELAY_INPUT_USD_PER_MILLION, 0.4, 100),
    outputUsdPerMillion: moneyEnv(env.AGENT_RELAY_OUTPUT_USD_PER_MILLION, 1.6, 200),
    cursorApi: env.AGENT_RELAY_CURSOR_API === 'true',
    cursorApiKey: cleanSecret(env.CURSOR_API_KEY),
    cursorSpendAuthorized: env.AGENT_RELAY_CURSOR_SPEND_AUTHORIZED === 'true',
  };
}

export function cursorApiReady(config) {
  return config.cursorApi === true
    && config.cursorSpendAuthorized === true
    && config.cursorApiKey.length >= 20
    && !hasBlockedMarker(config.cursorApiKey);
}

export function simulationConfig() {
  const config = loadConfig({});
  config.enabled = true;
  config.dryRun = true;
  config.live = false;
  config.killSwitch = false;
  config.webhookSecret = FIXTURE_WEBHOOK_SECRET;
  config.githubToken = '';
  config.openaiApiKey = '';
  config.githubAppPrivateKey = '';
  config.upstashUrl = '';
  config.upstashToken = '';
  config.cursorApi = false;
  config.cursorApiKey = '';
  config.cursorSpendAuthorized = false;
  return config;
}

export function upstashUrlAllowed(value) {
  if (typeof value !== 'string' || !value) return false;
  try {
    const parsed = new URL(value);
    const host = parsed.hostname;
    return parsed.protocol === 'https:'
      && parsed.username === ''
      && parsed.password === ''
      && parsed.pathname === '/'
      && (host === 'upstash.io' || host.endsWith('.upstash.io'))
      && !host.includes('..');
  } catch {
    return false;
  }
}

function pemOk(value) {
  if (typeof value !== 'string' || value.length < 100) return false;
  if (hasBlockedMarker(value)) return false;
  return value.includes('BEGIN') && value.includes('PRIVATE KEY');
}

function patOk(token) {
  return /^(github_pat_|ghp_)[A-Za-z0-9_]{20,}$/.test(token);
}

export function hasGitHubApp(config) {
  return Boolean(config.githubAppId && config.githubAppInstallationId && pemOk(config.githubAppPrivateKey));
}

export function assertLiveReady(config) {
  const problems = [];
  if (!config.enabled) problems.push('disabled');
  if (config.killSwitch) problems.push('killed');
  if (config.dryRun) problems.push('dry_run');
  if (!config.live) problems.push('not_live');
  if (!config.webhookSecret || config.webhookSecret.length < 24) problems.push('webhook_secret');
  if (config.webhookSecret === FIXTURE_WEBHOOK_SECRET || hasBlockedMarker(config.webhookSecret)) problems.push('webhook_secret');
  if (!upstashUrlAllowed(config.upstashUrl) || !config.upstashToken || config.upstashToken.length < 20 || hasBlockedMarker(config.upstashToken)) {
    problems.push('store');
  }
  if (!hasGitHubApp(config) && !patOk(config.githubToken)) problems.push('github');
  if (!/^sk-[A-Za-z0-9_-]{20,}$/.test(config.openaiApiKey) || hasBlockedMarker(config.openaiApiKey)) problems.push('openai');
  if (config.openaiUrl !== OPENAI_RESPONSES_URL) problems.push('openai_url');
  return [...new Set(problems)];
}
