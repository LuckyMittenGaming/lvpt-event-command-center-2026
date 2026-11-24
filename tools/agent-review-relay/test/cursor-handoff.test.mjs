import assert from 'node:assert/strict';
import test from 'node:test';
import { cursorApiReady, loadConfig, simulationConfig } from '../src/config.mjs';
import { CURSOR_API_ORIGIN } from '../src/cursor-api.mjs';
import { createRuntime } from '../src/runtime.mjs';
import { createMemoryStore } from '../src/store.mjs';
import { handleSignedDelivery } from '../src/webhook.mjs';
import { FIXED_NOW, buildPayload, signedHeaders } from './helpers.mjs';

const KEY = 'cursor_live_test_key_value_01';
const secret = 'local-test-webhook-secret-32';

function config(extra = {}) {
  return loadConfig({
    AGENT_RELAY_ENABLED: 'true',
    AGENT_RELAY_DRY_RUN: 'false',
    AGENT_RELAY_LIVE: 'true',
    AGENT_RELAY_CURSOR_API: 'true',
    AGENT_RELAY_CURSOR_SPEND_AUTHORIZED: 'true',
    AGENT_RELAY_MAX_ITERATIONS: '1',
    AGENT_RELAY_SPEND_CAP_USD: '0.25',
    VERCEL_ENV: 'preview',
    AGENT_RELAY_RECONCILE_URL: 'https://preview.example/api/reconcile',
    AGENT_RELAY_RECONCILE_SECRET: 'reconcile_test_secret_value_01',
    GITHUB_WEBHOOK_SECRET: secret,
    GITHUB_TOKEN: `github_pat_${'abcDEF123'.repeat(4)}`,
    OPENAI_API_KEY: 'sk-livepathsimulationkey01',
    UPSTASH_REDIS_REST_URL: 'https://relay-test.upstash.io',
    UPSTASH_REDIS_REST_TOKEN: 'upstashTokenForLocalTest01',
    CURSOR_API_KEY: KEY,
    ...extra,
  });
}

function reviewDecision() {
  return {
    decision: {
      decision: 'REQUEST_CHANGES',
      rationale: 'The sample check failed.',
      findings: [{ path: 'lib/sample.mjs', line: 4, summary: 'Check failed.' }],
      cursorTask: 'Fix only lib/sample.mjs. Do not merge or deploy.',
    },
    usage: { inputTokens: 10, outputTokens: 10 },
  };
}

function harness(cfg, { launch, status = 'RUNNING' } = {}) {
  const calls = [];
  const store = createMemoryStore();
  let runStatus = status;
  let headSha = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const fetchImpl = async (url, options = {}) => {
    const target = String(url);
    calls.push({ url: target, options });
    if (target === `${CURSOR_API_ORIGIN}/v1/agents` && options.method === 'POST') {
      if (launch) return launch(options);
      return {
        ok: true,
        json: async () => ({
          agent: { id: 'bc-11111111-1111-1111-1111-111111111111' },
          run: { id: 'run-11111111-1111-1111-1111-111111111111', status: 'CREATING' },
        }),
      };
    }
    if (target.startsWith(`${CURSOR_API_ORIGIN}/v1/agents/`) && options.method === 'GET') {
      return { ok: true, json: async () => ({ status: runStatus }) };
    }
    if (target.includes('/pulls/21') && !target.includes('/comments')) {
      return { ok: true, json: async () => buildPayload({ head: { sha: headSha } }).pull_request };
    }
    if (target.includes('/comments')) return { ok: true, json: async () => ({ id: 4 }) };
    throw new Error(`unexpected ${target}`);
  };
  const runtime = createRuntime(cfg, {
    fetchImpl,
    store,
    now: () => FIXED_NOW,
    review: async () => reviewDecision(),
    evidence: async () => ({ testSummary: 'FAIL tests/sample.test.mjs', changedFiles: ['lib/sample.mjs'] }),
  });
  return {
    runtime,
    store,
    calls,
    posts: () => calls.filter((call) => call.url === `${CURSOR_API_ORIGIN}/v1/agents` && call.options.method === 'POST'),
    setStatus(next) { runStatus = next; },
    setHead(next) { headSha = next; },
  };
}

async function deliver(runtime, { deliveryId = 'delivery-cursor1', base, sha, secretOverride = secret } = {}) {
  const payload = buildPayload({
    base,
    head: sha ? { sha } : undefined,
  });
  const rawBody = JSON.stringify(payload);
  return handleSignedDelivery({
    rawBody,
    headers: signedHeaders(rawBody, secretOverride, deliveryId),
    runtime,
  });
}

test('cursor handoff stays off unless the key and spend authorization are both present', () => {
  const off = loadConfig({});
  assert.equal(off.cursorApi, false);
  assert.equal(cursorApiReady(off), false);
  const missing = config({ CURSOR_API_KEY: '', AGENT_RELAY_CURSOR_SPEND_AUTHORIZED: 'false' });
  assert.equal(missing.cursorApi, true);
  assert.equal(cursorApiReady(missing), false);
  assert.equal(cursorApiReady(simulationConfig()), false);
});

test('a live handoff uses the fixed Cursor host and does not mention the bot or the key', async () => {
  const box = harness(config());
  const result = await deliver(box.runtime);
  assert.equal(result.transition, 'cursor_dispatched');
  assert.equal(result.iterations, 1);
  assert.equal(box.posts().length, 1);
  const body = JSON.parse(box.posts()[0].options.body);
  assert.equal(body.workOnCurrentBranch, true);
  assert.equal(body.autoCreatePR, false);
  assert.equal(body.repos[0].prUrl, 'https://github.com/LuckyMittenGaming/lvpt-event-command-center-2026/pull/21');
  assert.equal(body.repos[0].url, 'https://github.com/LuckyMittenGaming/lvpt-event-command-center-2026');
  assert.match(body.prompt.text, /cap is 1/);
  assert.equal(JSON.stringify(body).includes(KEY), false);
  const comment = JSON.parse(box.calls.find((call) => call.url.includes('/comments')).options.body).body;
  assert.equal(comment.includes('@cursor'), false);
  assert.equal(comment.includes(KEY), false);
  assert.match(comment, /of 1/);
  assert.match(comment, /bc-11111111-1111-1111-1111-111111111111/);
  assert.equal(JSON.stringify(box.store.audits).includes(KEY), false);
  assert.equal(box.posts().every((call) => call.url === `${CURSOR_API_ORIGIN}/v1/agents`), true);
});

test('a launch is refused unless the preview scheduler and the pilot caps are ready', async () => {
  const box = harness(config({ AGENT_RELAY_RECONCILE_URL: '', VERCEL_ENV: 'production' }));
  const blocked = await deliver(box.runtime, { deliveryId: 'delivery-nopreview1' });
  assert.equal(blocked.transition, 'reconcile_unavailable');
  assert.equal(box.posts().length, 0);
});

test('missing authorization, the wrong base, and a stale head do not launch', async () => {
  const missing = harness(config({ CURSOR_API_KEY: '', AGENT_RELAY_CURSOR_SPEND_AUTHORIZED: '' }));
  const blocked = await deliver(missing.runtime, { deliveryId: 'delivery-missing1' });
  assert.equal(blocked.transition, 'cursor_api_unavailable');
  assert.equal(missing.posts().length, 0);
  assert.equal(JSON.stringify(missing.store.audits).includes('cursor_live_test'), false);

  const wrong = harness(config());
  const rejected = await deliver(wrong.runtime, { deliveryId: 'delivery-base1', base: 'main' });
  assert.equal(rejected.transition, 'rejected_base');
  assert.equal(wrong.posts().length, 0);

  const stale = harness(config());
  stale.runtime.confirmHead = async () => ({ ok: false, transition: 'stale_head' });
  const moved = await deliver(stale.runtime, { deliveryId: 'delivery-stale1' });
  assert.equal(moved.transition, 'stale_head');
  assert.equal(stale.posts().length, 0);
});

test('an ambiguous launch is not retried, and a definite failure is not either', async () => {
  const ambiguous = harness(config(), {
    launch(options) {
      return new Promise((resolve, reject) => {
        options.signal.addEventListener('abort', () => {
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        });
      });
    },
  });
  ambiguous.runtime.config.timeoutMs = 20;
  const first = await deliver(ambiguous.runtime, { deliveryId: 'delivery-timeout1' });
  assert.equal(first.transition, 'cursor_launch_ambiguous');
  const second = await deliver(ambiguous.runtime, { deliveryId: 'delivery-timeout2', sha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' });
  assert.equal(second.transition, 'already_stopped');
  assert.equal(ambiguous.posts().length, 1);
  assert.equal(JSON.stringify(ambiguous.store.audits).includes(KEY), false);

  const failed = harness(config(), {
    launch: async () => ({ ok: false, status: 400, json: async () => ({ error: KEY }) }),
  });
  const denied = await deliver(failed.runtime, { deliveryId: 'delivery-denied1' });
  assert.equal(denied.transition, 'cursor_launch_failed');
  const again = await deliver(failed.runtime, { deliveryId: 'delivery-denied2', sha: 'cccccccccccccccccccccccccccccccccccccccc' });
  assert.equal(again.transition, 'already_stopped');
  assert.equal(failed.posts().length, 1);
});

test('a running handoff blocks the next correction until the run is terminal, and the cap review does not dispatch again', async () => {
  const box = harness(config());
  const started = await deliver(box.runtime);
  assert.equal(started.transition, 'cursor_dispatched');
  const busy = await deliver(box.runtime, { deliveryId: 'delivery-busy1', sha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' });
  assert.equal(busy.transition, 'cursor_run_active');
  assert.equal(box.posts().length, 1);
  box.setStatus('FINISHED');
  box.setHead('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
  const capped = await deliver(box.runtime, { deliveryId: 'delivery-cap1', sha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' });
  assert.equal(capped.transition, 'max_iterations_stopped');
  assert.equal(box.posts().length, 1);
  const comment = JSON.parse(box.calls.filter((call) => call.url.includes('/comments')).at(-1).options.body).body;
  assert.equal(comment.includes('@cursor'), false);
});

test('duplicate and concurrent deliveries launch at most once', async () => {
  const box = harness(config());
  const payload = buildPayload();
  const rawBody = JSON.stringify(payload);
  const headers = signedHeaders(rawBody, secret, 'delivery-dup1');
  const [first, second] = await Promise.all([
    handleSignedDelivery({ rawBody, headers, runtime: box.runtime }),
    handleSignedDelivery({ rawBody, headers, runtime: box.runtime }),
  ]);
  assert.equal([first.transition, second.transition].sort().join(), 'cursor_dispatched,duplicate_delivery');
  assert.equal(box.posts().length, 1);

  const shared = createMemoryStore();
  const left = harness(config());
  const right = harness(config());
  left.runtime.store = shared;
  right.runtime.store = shared;
  const other = buildPayload();
  const otherRaw = JSON.stringify(other);
  const [one, two] = await Promise.all([
    handleSignedDelivery({ rawBody: otherRaw, headers: signedHeaders(otherRaw, secret, 'delivery-race1'), runtime: left.runtime }),
    handleSignedDelivery({ rawBody: otherRaw, headers: signedHeaders(otherRaw, secret, 'delivery-race2'), runtime: right.runtime }),
  ]);
  const launches = left.posts().length + right.posts().length;
  assert.equal(launches, 1);
  assert.equal([one.transition, two.transition].includes('cursor_dispatched'), true);
});

test('the default mention path remains when the Cursor API flag is off', async () => {
  const box = harness(config({ AGENT_RELAY_CURSOR_API: 'false', AGENT_RELAY_MAX_ITERATIONS: '3' }));
  const result = await deliver(box.runtime, { deliveryId: 'delivery-mention1' });
  assert.equal(result.transition, 'comment_posted');
  assert.equal(box.posts().length, 0);
  const comment = JSON.parse(box.calls.find((call) => call.url.includes('/comments')).options.body).body;
  assert.equal(comment.split('@cursor').length - 1, 1);
  assert.match(comment, /of 3/);
});
