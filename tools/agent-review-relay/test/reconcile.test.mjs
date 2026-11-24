import assert from 'node:assert/strict';
import test from 'node:test';
import { assertReconcileReady, cursorApiReady, loadConfig, simulationConfig } from '../src/config.mjs';
import { RELAY_BASE, RELAY_REPO } from '../src/constants.mjs';
import { launchCursorRun } from '../src/cursor-api.mjs';
import { createRuntime } from '../src/runtime.mjs';
import { handleReconcile, persistConfirmedRun, reconcileOne, reconcilePending } from '../src/reconcile.mjs';
import { reconcileAuthorized, signQstashRequest, signReconcileBody } from '../src/reconcile-auth.mjs';
import { PENDING_LIMIT, RELAY_COMMIT_SCRIPT, createMemoryStore } from '../src/store.mjs';
import { handleNodeRequest } from '../api/reconcile.js';
import { handleSignedDelivery } from '../src/webhook.mjs';
import { FIXED_NOW, buildPayload, signedHeaders } from './helpers.mjs';

const OLD = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const NEW = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const AGENT = 'bc-11111111-1111-1111-1111-111111111111';
const RUN = 'run-11111111-1111-1111-1111-111111111111';

function launchRecord(extra = {}) {
  return {
    state: 'active',
    agentId: AGENT,
    runId: RUN,
    sha: OLD,
    launchedAt: new Date(FIXED_NOW).toISOString(),
    attempts: 0,
    ...extra,
  };
}

async function seed(store, launch = launchRecord()) {
  assert.equal(await store.commitPr(21, 0, {
    iterations: 1,
    stopped: '',
    reviewed: [OLD],
    firstSeen: new Date(FIXED_NOW).toISOString(),
    cursorLaunch: launch,
    capReviewed: false,
  }), true);
  assert.equal(await store.markPending(21), true);
}

function runtimeFor(store, { status = 'FINISHED', head = NEW, evidence, review, postComment } = {}) {
  const comments = [];
  const runtime = createRuntime(simulationConfig(), {
    store,
    now: () => FIXED_NOW,
    readCursorRun: async () => ({ terminal: true, status }),
    loadPull: async () => ({
      ok: true,
      ctx: {
        repo: RELAY_REPO,
        headRepo: RELAY_REPO,
        pr: 21,
        sha: head,
        base: RELAY_BASE,
        draft: true,
        labels: ['agent-loop'],
        author: 'LuckyMittenGaming',
        untrusted: { title: 'bounded', body: '', comment: '' },
      },
    }),
    evidence: async () => evidence || { testSummary: 'PASS', changedFiles: ['lib/sample.mjs'] },
    review: review || (async () => ({
      decision: { decision: 'PASS', rationale: 'Checks passed for this commit.', findings: [], cursorTask: null },
      usage: { inputTokens: 0, outputTokens: 0 },
    })),
    postComment: postComment || (async (input) => { comments.push(input.body); return { id: 1 }; }),
  });
  runtime.live = true;
  runtime.config.reconcileTimeoutMs = 20 * 60 * 1000;
  runtime.config.maxIterations = 1;
  runtime.config.spendCapUsd = 0.25;
  runtime.config.enabled = true;
  runtime.config.killSwitch = false;
  runtime.config.vercelEnv = 'preview';
  runtime.config.reconcileUrl = 'https://preview.example/api/reconcile';
  runtime.config.reconcileSecret = 'reconcile_test_secret_value_01';
  return { runtime, comments };
}

test('a scheduler request is rejected until it is signed, and the body cannot choose the head', async () => {
  const store = createMemoryStore();
  await seed(store);
  const { runtime } = runtimeFor(store);
  const raw = JSON.stringify({ sha: 'evil', prUrl: 'https://evil.example/pull/1' });
  const unsigned = await handleReconcile({ rawBody: raw, headers: {}, runtime, now: FIXED_NOW });
  assert.equal(unsigned.httpStatus, 401);
  runtime.config.reconcileSecret = 'reconcile_test_secret_value_01';
  const signed = await handleReconcile({
    rawBody: raw,
    headers: { 'x-relay-reconcile-signature': signReconcileBody(raw, runtime.config.reconcileSecret) },
    runtime,
    now: FIXED_NOW,
  });
  assert.equal(signed.transition, 'reconciled');
  assert.equal(signed.results[0].transition, 'pass_stopped');
  assert.equal(JSON.stringify(signed).includes('evil.example'), false);
  const saved = await store.loadPr(21);
  assert.equal(saved.reviewed.includes(NEW), true);
  assert.deepEqual(await store.listPending(), []);
});

test('QStash signatures authorize reconciliation and a finished unchanged head does not dispatch', async () => {
  const key = 'qstash_signing_key_value_01';
  const raw = '{}';
  const signature = signQstashRequest({ rawBody: raw, key, url: 'https://preview.example/api/reconcile', now: FIXED_NOW });
  const store = createMemoryStore();
  await seed(store);
  const { runtime } = runtimeFor(store, { head: OLD });
  runtime.config.qstashCurrentKey = key;
  assert.equal(reconcileAuthorized(raw, { 'upstash-signature': signature }, runtime.config, FIXED_NOW).ok, true);
  const wrong = signQstashRequest({ rawBody: raw, key, url: 'https://evil.example/api/reconcile', now: FIXED_NOW });
  assert.equal(reconcileAuthorized(raw, { 'upstash-signature': wrong }, runtime.config, FIXED_NOW).ok, false);
  const none = `eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.${Buffer.from('{}').toString('base64url')}.`;
  assert.equal(reconcileAuthorized(raw, { 'upstash-signature': none }, runtime.config, FIXED_NOW).ok, false);
  const result = await handleReconcile({ rawBody: raw, headers: { 'upstash-signature': signature }, runtime, now: FIXED_NOW });
  assert.equal(result.results[0].transition, 'cursor_finished_unchanged');
  assert.equal((await store.listPending()).length, 0);
});

test('terminal failure, expiry, and missing evidence stop without another launch', async () => {
  for (const status of ['ERROR', 'CANCELLED', 'EXPIRED']) {
    const store = createMemoryStore();
    await seed(store);
    const { runtime } = runtimeFor(store, { status });
    const [result] = await reconcilePending(runtime, FIXED_NOW);
    assert.equal(result.transition, 'cursor_run_terminal_failed');
  }
  const expired = createMemoryStore();
  await seed(expired, launchRecord({ launchedAt: new Date(FIXED_NOW - 3 * 60 * 60 * 1000).toISOString() }));
  const timeoutRuntime = runtimeFor(expired).runtime;
  assert.equal((await reconcilePending(timeoutRuntime, FIXED_NOW))[0].transition, 'cursor_run_timeout');

  const waiting = createMemoryStore();
  await seed(waiting);
  let reads = 0;
  const missing = runtimeFor(waiting, { evidence: { testSummary: 'unavailable', changedFiles: ['lib/sample.mjs'], noChecks: true } }).runtime;
  missing.readCursorRun = async () => {
    reads += 1;
    return { terminal: true, status: 'FINISHED' };
  };
  assert.equal((await reconcilePending(missing, FIXED_NOW))[0].transition, 'evidence_pending');
  assert.equal((await reconcilePending(missing, FIXED_NOW))[0].transition, 'evidence_pending');
  assert.equal((await reconcilePending(missing, FIXED_NOW))[0].transition, 'cursor_evidence_timeout');
  assert.equal(reads, 3);
});

test('a failed check with no in-diff finding is not dispatched, and a concrete finding is', async () => {
  assert.equal(cursorApiReady(loadConfig({
    AGENT_RELAY_CURSOR_API: 'true',
    AGENT_RELAY_CURSOR_SPEND_AUTHORIZED: 'true',
    CURSOR_API_KEY: 'grok_this_key_is_not_allowed_01',
  })), false);
  const posts = [];
  const fetchImpl = async (url, options = {}) => {
    posts.push({ url: String(url), redirect: options.redirect, method: options.method });
    if (String(url).includes('/pulls/21')) return { ok: true, json: async () => buildPayload().pull_request };
    if (String(url) === 'https://api.cursor.com/v1/agents') {
      return { ok: true, json: async () => ({ agent: { id: AGENT }, run: { id: RUN, status: 'CREATING' } }) };
    }
    if (String(url).includes('/comments')) return { ok: true, json: async () => ({ id: 1 }) };
    throw new Error(String(url));
  };
  const cfg = loadConfig({
    AGENT_RELAY_ENABLED: 'true',
    AGENT_RELAY_DRY_RUN: 'false',
    AGENT_RELAY_LIVE: 'true',
    AGENT_RELAY_CURSOR_API: 'true',
    AGENT_RELAY_CURSOR_SPEND_AUTHORIZED: 'true',
    AGENT_RELAY_MAX_ITERATIONS: '1',
    GITHUB_WEBHOOK_SECRET: 'local-test-webhook-secret-32',
    GITHUB_TOKEN: `github_pat_${'abcDEF123'.repeat(4)}`,
    OPENAI_API_KEY: 'sk-livepathsimulationkey01',
    UPSTASH_REDIS_REST_URL: 'https://relay-test.upstash.io',
    UPSTASH_REDIS_REST_TOKEN: 'upstashTokenForLocalTest01',
    CURSOR_API_KEY: 'cursor_live_test_key_value_01',
  });
  const vague = createRuntime(cfg, {
    fetchImpl,
    store: createMemoryStore(),
    now: () => FIXED_NOW,
    evidence: async () => ({ testSummary: 'FAIL unrelated', changedFiles: ['lib/sample.mjs'] }),
    review: async () => ({
      decision: {
        decision: 'REQUEST_CHANGES',
        rationale: 'Something failed.',
        findings: [{ path: 'tests/not-in-diff.test.mjs', line: 1, summary: 'Unrelated check failed.' }],
        cursorTask: 'Edit tests/not-in-diff.test.mjs.',
      },
      usage: { inputTokens: 1, outputTokens: 1 },
    }),
  });
  const raw = JSON.stringify(buildPayload());
  const vagueResult = await handleSignedDelivery({
    rawBody: raw,
    headers: signedHeaders(raw, cfg.webhookSecret, 'delivery-vague1'),
    runtime: vague,
  });
  assert.equal(vagueResult.transition, 'human_stopped');
  assert.equal(posts.some((call) => call.url.includes('api.cursor.com')), false);

  let reserved = 0;
  const concrete = createRuntime(cfg, {
    fetchImpl,
    store: createMemoryStore(),
    now: () => FIXED_NOW,
    evidence: async () => ({ testSummary: 'FAIL unrelated', changedFiles: ['lib/sample.mjs'] }),
    review: async () => ({
      decision: {
        decision: 'REQUEST_CHANGES',
        rationale: 'The sample check failed.',
        findings: [{ path: 'lib/sample.mjs', line: 4, summary: 'Check failed.' }],
        cursorTask: 'Fix only lib/sample.mjs. Do not merge or deploy.',
      },
      usage: { inputTokens: 1, outputTokens: 1 },
    }),
    launchCursor: async () => {
      reserved = (await concrete.store.loadPr(21)).iterations;
      return { agentId: AGENT, runId: RUN, status: 'CREATING' };
    },
  });
  const concreteRaw = JSON.stringify(buildPayload());
  const sent = await handleSignedDelivery({
    rawBody: concreteRaw,
    headers: signedHeaders(concreteRaw, cfg.webhookSecret, 'delivery-concrete1'),
    runtime: concrete,
  });
  assert.equal(sent.transition, 'cursor_dispatched');
  assert.equal(reserved, 1);
  assert.equal(posts.some((call) => call.redirect === 'error' && call.url === 'https://api.cursor.com/v1/agents'), false);
  const direct = [];
  await launchCursorRun({
    config: cfg,
    fetchImpl: async (url, options) => {
      direct.push(options.redirect);
      return { ok: true, json: async () => ({ agent: { id: AGENT }, run: { id: RUN, status: 'CREATING' } }) };
    },
    pr: 21,
    task: 'Fix only lib/sample.mjs.',
    timeoutMs: 1000,
  });
  assert.deepEqual(direct, ['error']);
});

test('a comment failure keeps the run id, and a stale head after the reserve does not launch', async () => {
  const store = createMemoryStore();
  let confirms = 0;
  const cfg = loadConfig({
    AGENT_RELAY_ENABLED: 'true',
    AGENT_RELAY_DRY_RUN: 'false',
    AGENT_RELAY_LIVE: 'true',
    AGENT_RELAY_CURSOR_API: 'true',
    AGENT_RELAY_CURSOR_SPEND_AUTHORIZED: 'true',
    AGENT_RELAY_MAX_ITERATIONS: '1',
    GITHUB_WEBHOOK_SECRET: 'local-test-webhook-secret-32',
    GITHUB_TOKEN: `github_pat_${'abcDEF123'.repeat(4)}`,
    OPENAI_API_KEY: 'sk-livepathsimulationkey01',
    UPSTASH_REDIS_REST_URL: 'https://relay-test.upstash.io',
    UPSTASH_REDIS_REST_TOKEN: 'upstashTokenForLocalTest01',
    CURSOR_API_KEY: 'cursor_live_test_key_value_01',
  });
  const fetchImpl = async (url) => {
    if (String(url).includes('/pulls/21')) return { ok: true, json: async () => buildPayload().pull_request };
    if (String(url).includes('/comments')) return { ok: true, json: async () => ({ id: 1 }) };
    throw new Error(String(url));
  };
  const runtime = createRuntime(cfg, {
    fetchImpl,
    store,
    now: () => FIXED_NOW,
    evidence: async () => ({ testSummary: 'FAIL tests/sample.test.mjs', changedFiles: ['lib/sample.mjs'] }),
    review: async () => ({
      decision: {
        decision: 'REQUEST_CHANGES',
        rationale: 'The sample check failed.',
        findings: [{ path: 'lib/sample.mjs', line: 4, summary: 'Check failed.' }],
        cursorTask: 'Fix only lib/sample.mjs. Do not merge or deploy.',
      },
      usage: { inputTokens: 1, outputTokens: 1 },
    }),
    launchCursor: async () => ({ agentId: AGENT, runId: RUN, status: 'CREATING' }),
    postComment: async () => { throw new Error('GitHub comment failed (503)'); },
  });
  const raw = JSON.stringify(buildPayload());
  const posted = await handleSignedDelivery({
    rawBody: raw,
    headers: signedHeaders(raw, cfg.webhookSecret, 'delivery-comment1'),
    runtime,
  });
  assert.equal(posted.transition, 'comment_failed_stopped');
  const saved = await store.loadPr(21);
  assert.equal(saved.cursorLaunch.agentId, AGENT);
  assert.equal(saved.cursorLaunch.runId, RUN);
  assert.equal(saved.iterations, 1);
  assert.deepEqual(await store.listPending(), [21]);

  const stale = createRuntime(cfg, {
    fetchImpl,
    store: createMemoryStore(),
    now: () => FIXED_NOW,
    evidence: async () => ({ testSummary: 'FAIL tests/sample.test.mjs', changedFiles: ['lib/sample.mjs'] }),
    review: async () => ({
      decision: {
        decision: 'REQUEST_CHANGES',
        rationale: 'The sample check failed.',
        findings: [{ path: 'lib/sample.mjs', line: 4, summary: 'Check failed.' }],
        cursorTask: 'Fix only lib/sample.mjs.',
      },
      usage: { inputTokens: 1, outputTokens: 1 },
    }),
    launchCursor: async () => { throw new Error('should not launch'); },
    confirmHead: async () => {
      confirms += 1;
      return confirms < 2 ? { ok: true } : { ok: false, transition: 'stale_head' };
    },
  });
  const staleRaw = JSON.stringify(buildPayload());
  const moved = await handleSignedDelivery({
    rawBody: staleRaw,
    headers: signedHeaders(staleRaw, cfg.webhookSecret, 'delivery-stale-gap1'),
    runtime: stale,
  });
  assert.equal(moved.transition, 'stale_head');
  assert.equal((await stale.store.loadPr(21)).iterations, 1);
});

test('preview reconciliation is refused in production and a signature cannot be replayed', async () => {
  const preview = loadConfig({
    AGENT_RELAY_ENABLED: 'true',
    AGENT_RELAY_DRY_RUN: 'false',
    AGENT_RELAY_LIVE: 'true',
    AGENT_RELAY_MAX_ITERATIONS: '1',
    AGENT_RELAY_SPEND_CAP_USD: '0.25',
    VERCEL_ENV: 'preview',
    AGENT_RELAY_RECONCILE_URL: 'https://preview.example/api/reconcile',
    AGENT_RELAY_RECONCILE_SECRET: 'reconcile_test_secret_value_01',
    GITHUB_WEBHOOK_SECRET: 'local-test-webhook-secret-32',
    GITHUB_TOKEN: `github_pat_${'abcDEF123'.repeat(4)}`,
    OPENAI_API_KEY: 'sk-livepathsimulationkey01',
    UPSTASH_REDIS_REST_URL: 'https://relay-test.upstash.io',
    UPSTASH_REDIS_REST_TOKEN: 'upstashTokenForLocalTest01',
  });
  assert.deepEqual(assertReconcileReady(preview), []);
  assert.equal(preview.maxIterations, 1);
  assert.equal(preview.spendCapUsd, 0.25);
  const production = loadConfig({ ...{
    AGENT_RELAY_ENABLED: 'true',
    VERCEL_ENV: 'production',
    AGENT_RELAY_RECONCILE_URL: 'https://preview.example/api/reconcile',
    AGENT_RELAY_RECONCILE_SECRET: 'reconcile_test_secret_value_01',
  } });
  assert.equal(assertReconcileReady(production).includes('production'), true);
  assert.equal(assertReconcileReady(loadConfig({})).includes('not_preview'), true);
  assert.match(RELAY_COMMIT_SCRIPT, /SCARD/);
  assert.match(RELAY_COMMIT_SCRIPT, /return -2/);
  assert.match(RELAY_COMMIT_SCRIPT, /return -3/);

  const store = createMemoryStore();
  await seed(store);
  const { runtime } = runtimeFor(store);
  let reviews = 0;
  runtime.review = async () => {
    reviews += 1;
    return {
      decision: { decision: 'PASS', rationale: 'Checks passed for this commit.', findings: [], cursorTask: null },
      usage: { inputTokens: 1, outputTokens: 1 },
    };
  };
  const raw = '{}';
  const headers = { 'x-relay-reconcile-signature': signReconcileBody(raw, runtime.config.reconcileSecret) };
  const first = await handleReconcile({ rawBody: raw, headers, runtime, now: FIXED_NOW });
  const second = await handleReconcile({ rawBody: raw, headers, runtime, now: FIXED_NOW });
  assert.equal(first.transition, 'reconciled');
  assert.equal(second.transition, 'rejected_replay');
  assert.equal(reviews, 1);
  runtime.config.killSwitch = true;
  const killedBody = '{"tick":"killed"}';
  const killed = await handleReconcile({
    rawBody: killedBody,
    headers: { 'x-relay-reconcile-signature': signReconcileBody(killedBody, runtime.config.reconcileSecret) },
    runtime,
    now: FIXED_NOW,
  });
  assert.equal(killed.transition, 'killed');
  runtime.config.killSwitch = false;
  runtime.config.enabled = false;
  const disabledBody = '{"tick":"disabled"}';
  const disabled = await handleReconcile({
    rawBody: disabledBody,
    headers: { 'x-relay-reconcile-signature': signReconcileBody(disabledBody, runtime.config.reconcileSecret) },
    runtime,
    now: FIXED_NOW,
  });
  assert.equal(disabled.transition, 'disabled');

  const res = { statusCode: 0, body: '', setHeader() {}, end(body) { this.body = body; } };
  await handleNodeRequest({
    method: 'POST',
    headers: { 'x-relay-reconcile-signature': signReconcileBody('{}', 'reconcile_test_secret_value_01') },
    async *[Symbol.asyncIterator]() { yield Buffer.from('{}'); },
  }, res, {
    env: {
      AGENT_RELAY_ENABLED: 'true',
      VERCEL_ENV: 'production',
      AGENT_RELAY_RECONCILE_URL: 'https://preview.example/api/reconcile',
      AGENT_RELAY_RECONCILE_SECRET: 'reconcile_test_secret_value_01',
    },
  });
  assert.equal(JSON.parse(res.body).transition, 'reconcile_unavailable');
});

test('a finished failure is not reviewed, and the scheduler does not drop an in-flight launch', async () => {
  const store = createMemoryStore();
  await seed(store);
  let reviews = 0;
  const failed = runtimeFor(store, { status: 'ERROR' }).runtime;
  failed.review = async () => { reviews += 1; throw new Error('should not review'); };
  assert.equal((await reconcilePending(failed, FIXED_NOW))[0].transition, 'cursor_run_terminal_failed');
  assert.equal(reviews, 0);
  assert.equal((await store.loadPr(21)).cursorLaunch.agentId, AGENT);

  const cfg = loadConfig({
    AGENT_RELAY_ENABLED: 'true',
    AGENT_RELAY_DRY_RUN: 'false',
    AGENT_RELAY_LIVE: 'true',
    AGENT_RELAY_CURSOR_API: 'true',
    AGENT_RELAY_CURSOR_SPEND_AUTHORIZED: 'true',
    AGENT_RELAY_MAX_ITERATIONS: '1',
    GITHUB_WEBHOOK_SECRET: 'local-test-webhook-secret-32',
    GITHUB_TOKEN: `github_pat_${'abcDEF123'.repeat(4)}`,
    OPENAI_API_KEY: 'sk-livepathsimulationkey01',
    UPSTASH_REDIS_REST_URL: 'https://relay-test.upstash.io',
    UPSTASH_REDIS_REST_TOKEN: 'upstashTokenForLocalTest01',
    CURSOR_API_KEY: 'cursor_live_test_key_value_01',
  });
  const live = createMemoryStore();
  let raced = '';
  const runtime = createRuntime(cfg, {
    fetchImpl: async (url) => {
      if (String(url).includes('/pulls/21')) return { ok: true, json: async () => buildPayload().pull_request };
      if (String(url).includes('/comments')) return { ok: true, json: async () => ({ id: 1 }) };
      throw new Error(String(url));
    },
    store: live,
    now: () => FIXED_NOW,
    evidence: async () => ({ testSummary: 'FAIL tests/sample.test.mjs', changedFiles: ['lib/sample.mjs'] }),
    review: async () => ({
      decision: {
        decision: 'REQUEST_CHANGES',
        rationale: 'The sample check failed.',
        findings: [{ path: 'lib/sample.mjs', line: 4, summary: 'Check failed.' }],
        cursorTask: 'Fix only lib/sample.mjs.',
      },
      usage: { inputTokens: 1, outputTokens: 1 },
    }),
    launchCursor: async () => {
      raced = (await reconcileOne(runtime, 21, FIXED_NOW)).transition;
      return { agentId: AGENT, runId: RUN, status: 'CREATING' };
    },
  });
  const raw = JSON.stringify(buildPayload());
  const sent = await handleSignedDelivery({
    rawBody: raw,
    headers: signedHeaders(raw, cfg.webhookSecret, 'delivery-race-launch'),
    runtime,
  });
  assert.equal(raced, 'cursor_run_active');
  assert.equal(sent.transition, 'cursor_dispatched');
  assert.equal((await live.loadPr(21)).cursorLaunch.agentId, AGENT);
  let reviewsAfter = 0;
  runtime.review = async () => { reviewsAfter += 1; throw new Error('should not review'); };
  runtime.readCursorRun = async () => ({ terminal: true, status: 'ERROR' });
  const failedRaw = JSON.stringify(buildPayload({ head: { sha: NEW } }));
  const webhookFailed = await handleSignedDelivery({
    rawBody: failedRaw,
    headers: signedHeaders(failedRaw, cfg.webhookSecret, 'delivery-terminal-fail'),
    runtime,
  });
  assert.equal(webhookFailed.transition, 'cursor_run_terminal_failed');
  assert.equal(reviewsAfter, 0);

  const expired = createMemoryStore();
  await expired.commitPr(21, 0, {
    iterations: 1,
    stopped: '',
    reviewed: [OLD],
    firstSeen: new Date(FIXED_NOW).toISOString(),
    cursorLaunch: { state: 'claiming', agentId: '', runId: '', sha: OLD, launchedAt: new Date(FIXED_NOW - 10 * 60 * 1000).toISOString(), claimUntil: new Date(FIXED_NOW - 60 * 1000).toISOString(), attempts: 0 },
  });
  await expired.markPending(21);
  const late = runtimeFor(expired).runtime;
  assert.equal((await reconcilePending(late, FIXED_NOW))[0].transition, 'cursor_launch_ambiguous');
  const revived = await persistConfirmedRun(late, 21, await expired.loadPr(21), {
    agentId: AGENT,
    runId: RUN,
    sha: OLD,
    launchedAt: new Date(FIXED_NOW).toISOString(),
  });
  assert.equal(revived, true);
  assert.equal((await expired.loadPr(21)).cursorLaunch.agentId, AGENT);
  assert.equal((await expired.loadPr(21)).cursorLaunch.state, 'active');
});

test('unsafe paths, spend, stale publication, and a full pending set do not dispatch another run', async () => {
  const unsafeStore = createMemoryStore();
  await seed(unsafeStore);
  let reviews = 0;
  const unsafe = runtimeFor(unsafeStore, { evidence: { testSummary: 'FAIL app/api/sms/send', changedFiles: ['app/api/sms/send/route.js'] } }).runtime;
  unsafe.review = async () => { reviews += 1; throw new Error('should not review'); };
  assert.equal((await reconcilePending(unsafe, FIXED_NOW))[0].transition, 'sensitive_path_stopped');
  assert.equal(reviews, 0);

  const spent = createMemoryStore();
  await seed(spent);
  await spent.addSpendMicro(250_000);
  const capped = runtimeFor(spent).runtime;
  capped.config.spendCapUsd = 0.25;
  capped.review = async () => { reviews += 1; throw new Error('should not review'); };
  assert.equal((await reconcilePending(capped, FIXED_NOW))[0].transition, 'spend_cap_stopped');
  assert.equal(reviews, 0);

  const staleStore = createMemoryStore();
  await seed(staleStore);
  const stale = runtimeFor(staleStore).runtime;
  stale.confirmHead = async () => ({ ok: false, transition: 'stale_head' });
  let staleReviews = 0;
  stale.review = async () => {
    staleReviews += 1;
    return {
      decision: { decision: 'PASS', rationale: 'Checks passed for this commit.', findings: [], cursorTask: null },
      usage: { inputTokens: 1, outputTokens: 1 },
    };
  };
  const comments = [];
  stale.postComment = async (input) => { comments.push(input.body); return { id: 1 }; };
  assert.equal((await reconcilePending(stale, FIXED_NOW))[0].transition, 'stale_head');
  assert.equal(staleReviews, 1);
  assert.equal(comments.length, 0);
  assert.equal((await reconcilePending(stale, FIXED_NOW))[0].transition, 'stale_head');
  assert.equal(staleReviews, 1);

  const full = createMemoryStore();
  for (let id = 1; id <= PENDING_LIMIT; id += 1) {
    assert.equal(await full.commitPr(1000 + id, 0, { iterations: 0, stopped: '', reviewed: [], firstSeen: '' }, { pending: 'add' }), true);
  }
  await assert.rejects(() => full.commitPr(21, 0, { iterations: 1, stopped: '', reviewed: [], firstSeen: '' }, { pending: 'add' }), /pending full/);
  const pageA = await full.listPending(10);
  const pageB = await full.listPending(10);
  assert.equal(pageA.length, 10);
  assert.equal(pageB.length, 10);
  assert.equal(pageA[0] === pageB[0], false);
});
