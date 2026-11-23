import assert from 'node:assert/strict';
import test from 'node:test';
import { handleNodeRequest } from '../api/webhook.js';
import { loadConfig } from '../src/config.mjs';
import { RELAY_REPO } from '../src/constants.mjs';
import { summarizeEvidence } from '../src/github.mjs';
import { createRuntime } from '../src/runtime.mjs';
import { createMemoryStore, createRedisStore } from '../src/store.mjs';
import { handleSignedDelivery } from '../src/webhook.mjs';
import { FIXED_NOW, UPDATED_AT, buildPayload, signedHeaders } from './helpers.mjs';

const secret = 'test-webhook-secret-value';
const sha = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

function enabledRuntime(store = createMemoryStore(), extras = {}) {
  const config = loadConfig({ GITHUB_WEBHOOK_SECRET: secret, AGENT_RELAY_ENABLED: 'true' });
  const plans = [];
  const runtime = createRuntime(config, {
    store,
    now: () => FIXED_NOW,
    onPlan: (comment) => plans.push(comment),
    ...extras,
  });
  return { runtime, plans, store };
}

async function deliver(runtime, payload, options = {}) {
  const rawBody = JSON.stringify(payload);
  return handleSignedDelivery({
    rawBody,
    headers: signedHeaders(rawBody, secret, options.deliveryId || 'delivery-0001', options.eventName || 'pull_request'),
    runtime,
    suppliedEvidence: options.evidence || null,
    suppliedPull: options.suppliedPull || null,
  });
}

test('a pending pull request proceeds when checks complete, and relay comments do not recurse', async () => {
  const { runtime, plans } = enabledRuntime();
  let reviews = 0;
  runtime.review = async (input) => {
    reviews += 1;
    const { deterministicDecision } = await import('../src/policy.mjs');
    return { decision: deterministicDecision(input.evidence), usage: { inputTokens: 0, outputTokens: 0 } };
  };
  const pending = await deliver(runtime, buildPayload(), {
    evidence: { testSummary: 'unavailable', changedFiles: ['lib/sample.mjs'] },
  });
  assert.equal(pending.transition, 'evidence_pending');
  assert.equal(reviews, 0);

  const check = {
    action: 'completed',
    repository: { full_name: RELAY_REPO },
    check_run: {
      head_sha: sha,
      completed_at: UPDATED_AT,
      conclusion: 'failure',
      pull_requests: [{ number: 21 }],
    },
  };
  const proceeded = await deliver(runtime, check, {
    deliveryId: 'delivery-check1',
    eventName: 'check_run',
    suppliedPull: buildPayload().pull_request,
    evidence: { testSummary: 'FAIL tests/sample.test.mjs', changedFiles: ['lib/sample.mjs'] },
  });
  assert.equal(proceeded.decision, 'REQUEST_CHANGES');
  assert.equal(reviews, 1);
  assert.equal(plans.length, 1);

  const echo = {
    action: 'created',
    repository: { full_name: RELAY_REPO },
    issue: { number: 21, pull_request: { url: `https://api.github.com/repos/${RELAY_REPO}/pulls/21` } },
    comment: {
      body: plans[0],
      user: { login: 'cursor[bot]' },
      created_at: UPDATED_AT,
    },
  };
  const ignored = await deliver(runtime, echo, { deliveryId: 'delivery-self1', eventName: 'issue_comment' });
  assert.equal(ignored.transition, 'ignored_self');
  assert.equal(reviews, 1);

  const issue = {
    action: 'created',
    repository: { full_name: RELAY_REPO },
    issue: { number: 9 },
    comment: { body: 'not a pull request', user: { login: 'LuckyMittenGaming' }, created_at: UPDATED_AT },
  };
  const rejected = await deliver(runtime, issue, { deliveryId: 'delivery-issue1', eventName: 'issue_comment' });
  assert.equal(rejected.transition, 'rejected_event');
});

test('status events can supply Vercel evidence and empty checks cannot pass', async () => {
  const none = summarizeEvidence([], { check_runs: [] }, { statuses: [] });
  assert.equal(none.noChecks, true);
  assert.equal(none.testSummary, 'unavailable');
  const vercelFail = summarizeEvidence(
    [{ filename: 'lib/sample.mjs', patch: '+ok' }],
    { check_runs: [] },
    { statuses: [{ state: 'failure', context: 'Vercel' }] },
  );
  assert.equal(vercelFail.testSummary.includes('FAIL'), true);
  assert.equal(vercelFail.testSummary.includes('Vercel'), true);
  const pending = summarizeEvidence(
    [{ filename: 'lib/sample.mjs', patch: '+ok' }],
    { check_runs: [{ name: 'unit', status: 'completed', conclusion: 'success' }] },
    { statuses: [{ state: 'pending', context: 'Vercel' }] },
  );
  assert.equal(pending.testSummary, 'unavailable');

  const { runtime } = enabledRuntime();
  const status = {
    state: 'success',
    sha,
    updated_at: UPDATED_AT,
    repository: { full_name: RELAY_REPO },
    context: 'Vercel',
  };
  const result = await deliver(runtime, status, {
    deliveryId: 'delivery-status1',
    eventName: 'status',
    suppliedPull: buildPayload().pull_request,
    evidence: { testSummary: 'PASS', changedFiles: ['lib/sample.mjs'] },
  });
  assert.equal(result.transition, 'pass_stopped');
  assert.equal(result.plannedComment.includes('@cursor'), false);
});

test('green checks still allow a concrete review, and the cap does not skip that review', async () => {
  const { runtime, plans } = enabledRuntime();
  let reviews = 0;
  runtime.review = async () => {
    reviews += 1;
    return {
      decision: {
        decision: 'REQUEST_CHANGES',
        rationale: 'A null guard is missing.',
        findings: [{ path: 'lib/sample.mjs', line: 12, summary: 'Null guard is missing before the call.' }],
        cursorTask: 'Add the null guard in lib/sample.mjs only. Do not merge or deploy.',
        reason: 'review_finding',
      },
      usage: { inputTokens: 0, outputTokens: 0 },
    };
  };
  const green = await deliver(runtime, buildPayload(), {
    evidence: { testSummary: 'PASS', changedFiles: ['lib/sample.mjs'] },
  });
  assert.equal(green.decision, 'REQUEST_CHANGES');
  assert.equal(green.plannedComment.includes('@cursor'), true);
  assert.equal(reviews, 1);

  const store = createMemoryStore();
  const capped = enabledRuntime(store);
  let cappedReviews = 0;
  capped.runtime.review = async () => {
    cappedReviews += 1;
    return {
      decision: {
        decision: 'REQUEST_CHANGES',
        rationale: 'A null guard is missing.',
        findings: [{ path: 'lib/sample.mjs', line: 12, summary: 'Null guard is missing before the call.' }],
        cursorTask: 'Add the null guard in lib/sample.mjs only.',
      },
      usage: { inputTokens: 0, outputTokens: 0 },
    };
  };
  assert.equal(await store.commitPr(21, 0, {
    iterations: 3,
    stopped: '',
    reviewed: [],
    firstSeen: new Date(FIXED_NOW).toISOString(),
  }), true);
  const limited = await deliver(capped.runtime, buildPayload(), {
    deliveryId: 'delivery-cap-green',
    evidence: { testSummary: 'PASS', changedFiles: ['lib/sample.mjs'] },
  });
  assert.equal(cappedReviews, 1);
  assert.equal(limited.transition, 'max_iterations_stopped');
  assert.equal(limited.plannedComment.includes('@cursor'), false);
  assert.equal(plans.length, 1);
});

test('two instances share one store and a second delivery cannot double post', async () => {
  const store = createMemoryStore();
  const left = enabledRuntime(store);
  const right = enabledRuntime(store);
  const payload = buildPayload();
  const evidence = { testSummary: 'PASS', changedFiles: ['lib/sample.mjs'] };
  const [first, second] = await Promise.all([
    deliver(left.runtime, payload, { deliveryId: 'delivery-shared', evidence }),
    deliver(right.runtime, payload, { deliveryId: 'delivery-shared', evidence }),
  ]);
  const transitions = [first.transition, second.transition].sort();
  assert.deepEqual(transitions, ['duplicate_delivery', 'pass_stopped']);
  assert.equal(left.plans.length + right.plans.length, 1);
});

test('live mode uses host fetch and redis, while dry-run stays offline', async () => {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    calls.push(String(url));
    if (String(url).includes('upstash.io')) {
      const command = JSON.parse(options.body);
      if (command[0] === 'PING') return { ok: true, json: async () => ({ result: 'PONG' }) };
      if (command[0] === 'EVAL' && command[1].includes('relay:claim')) {
        return { ok: true, json: async () => ({ result: 1 }) };
      }
      if (command[0] === 'GET') return { ok: true, json: async () => ({ result: null }) };
      if (command[0] === 'EVAL' && command[1].includes('relay:commit')) {
        return { ok: true, json: async () => ({ result: 1 }) };
      }
      if (command[0] === 'INCRBY') return { ok: true, json: async () => ({ result: 10 }) };
      if (command[0] === 'LPUSH' || command[0] === 'LTRIM') return { ok: true, json: async () => ({ result: 'OK' }) };
    }
    if (String(url).includes('/pulls/21') && !String(url).includes('/files') && !String(url).includes('/comments')) {
      return { ok: true, json: async () => buildPayload().pull_request };
    }
    if (String(url).includes('/files')) return { ok: true, json: async () => [{ filename: 'lib/sample.mjs', patch: '+ok' }] };
    if (String(url).includes('/check-runs')) {
      return { ok: true, json: async () => ({ check_runs: [{ name: 'unit', status: 'completed', conclusion: 'failure' }] }) };
    }
    if (String(url).endsWith('/status')) return { ok: true, json: async () => ({ statuses: [{ state: 'failure', context: 'Vercel' }] }) };
    if (String(url).includes('api.openai.com')) {
      return {
        ok: true,
        json: async () => ({
          output_text: JSON.stringify({
            decision: 'REQUEST_CHANGES',
            rationale: 'The sample check failed.',
            findings: [{ path: 'lib/sample.mjs', line: 2, summary: 'Check failed.' }],
            cursorTask: 'Fix only lib/sample.mjs. Do not merge or deploy.',
          }),
          usage: { input_tokens: 20, output_tokens: 10 },
        }),
      };
    }
    if (String(url).includes('/comments')) return { ok: true, json: async () => ({ id: 3 }) };
    throw new Error(`unexpected ${url}`);
  };
  try {
    const freshPayload = buildPayload({ updatedAt: new Date().toISOString() });
    const offline = await handleNodeRequest(nodeRequest(freshPayload, secret), recordingResponse(), {
      env: { GITHUB_WEBHOOK_SECRET: secret, AGENT_RELAY_ENABLED: 'true' },
    });
    assert.equal(offline, undefined);
    assert.equal(calls.length, 0);

    calls.length = 0;
    const res = recordingResponse();
    await handleNodeRequest(nodeRequest(freshPayload, 'local-test-webhook-secret-32'), res, {
      env: {
        AGENT_RELAY_ENABLED: 'true',
        AGENT_RELAY_DRY_RUN: 'false',
        AGENT_RELAY_LIVE: 'true',
        GITHUB_WEBHOOK_SECRET: 'local-test-webhook-secret-32',
        GITHUB_TOKEN: `github_pat_${'abcDEF123'.repeat(4)}`,
        OPENAI_API_KEY: 'sk-livepathsimulationkey01',
        UPSTASH_REDIS_REST_URL: 'https://relay-test.upstash.io',
        UPSTASH_REDIS_REST_TOKEN: 'upstashTokenForLocalTest01',
      },
    });
    assert.equal(res.statusCode, 200);
    assert.equal(JSON.parse(res.body).transition, 'comment_posted');
    assert.equal(calls.some((url) => url.includes('upstash.io')), true);
    assert.equal(calls.some((url) => url.includes('api.github.com')), true);
    assert.equal(calls.some((url) => url.includes('api.openai.com')), true);
    assert.equal(calls.every((url) => url.includes('upstash.io') || url.includes('api.github.com') || url.includes('api.openai.com')), true);
  } finally {
    globalThis.fetch = original;
  }
});

test('redis clients share claims and a deleted record cannot lower the floor', async () => {
  const kv = new Map();
  const fetchImpl = async (url, options) => {
    const command = JSON.parse(options.body);
    let result;
    if (command[0] === 'PING') result = 'PONG';
    else if (command[0] === 'GET') result = kv.has(command[1]) ? kv.get(command[1]) : null;
    else if (command[0] === 'INCRBY') {
      const next = Number(kv.get(command[1]) || 0) + Number(command[2]);
      kv.set(command[1], String(next));
      result = next;
    } else if (command[0] === 'EVAL' && command[1].includes('relay:claim')) {
      result = kv.has(command[3]) ? 0 : (kv.set(command[3], '1'), 1);
    } else if (command[0] === 'EVAL' && command[1].includes('relay:commit')) {
      const prKey = command[3];
      const floorKey = command[4];
      const expected = Number(command[5]);
      const next = JSON.parse(command[6]);
      const raw = kv.get(prKey);
      const current = raw ? JSON.parse(raw) : { version: 0, iterations: 0 };
      const floor = Number(kv.get(floorKey) || 0);
      if (current.iterations < floor || current.version !== expected || next.iterations < current.iterations || next.iterations > 3) result = 0;
      else {
        if (next.iterations > floor) kv.set(floorKey, String(next.iterations));
        kv.set(prKey, JSON.stringify(next));
        result = 1;
      }
    } else if (command[0] === 'LPUSH' || command[0] === 'LTRIM') result = 'OK';
    else throw new Error(command[0]);
    return { ok: true, json: async () => ({ result }) };
  };
  const url = 'https://relay-test.upstash.io';
  const token = 'upstashTokenForLocalTest01';
  const left = createRedisStore({ url, token, fetchImpl });
  const right = createRedisStore({ url, token, fetchImpl });
  assert.equal(await left.claimDelivery('delivery-redis1'), true);
  assert.equal(await right.claimDelivery('delivery-redis1'), false);
  assert.equal(await left.commitPr(21, 0, { iterations: 2, stopped: '', reviewed: [], firstSeen: '' }), true);
  assert.equal((await right.loadPr(21)).iterations, 2);
  assert.equal(await right.commitPr(21, 1, { iterations: 0, stopped: '', reviewed: [], firstSeen: '' }), false);
  kv.delete('relay:pr:21');
  await assert.rejects(() => left.loadPr(21), /relay state rejected/);
  fetchImpl.ok = false;
});

test('a moved head is not commented on', async () => {
  const posts = [];
  let pulls = 0;
  const fetchImpl = async (url) => {
    if (String(url).includes('/pulls/21') && !String(url).includes('/comments')) {
      pulls += 1;
      const head = pulls === 1 ? sha : 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
      return { ok: true, json: async () => buildPayload({ head: { sha: head } }).pull_request };
    }
    if (String(url).includes('/comments')) {
      posts.push(url);
      return { ok: true, json: async () => ({ id: 1 }) };
    }
    throw new Error(`unexpected ${url}`);
  };
  const config = loadConfig({
    AGENT_RELAY_ENABLED: 'true',
    AGENT_RELAY_DRY_RUN: 'false',
    AGENT_RELAY_LIVE: 'true',
    GITHUB_WEBHOOK_SECRET: 'local-test-webhook-secret-32',
    GITHUB_TOKEN: `github_pat_${'abcDEF123'.repeat(4)}`,
    OPENAI_API_KEY: 'sk-livepathsimulationkey01',
    UPSTASH_REDIS_REST_URL: 'https://relay-test.upstash.io',
    UPSTASH_REDIS_REST_TOKEN: 'upstashTokenForLocalTest01',
  });
  const runtime = createRuntime(config, {
    fetchImpl,
    store: createMemoryStore(),
    now: () => FIXED_NOW,
    review: async () => ({
      decision: {
        decision: 'REQUEST_CHANGES',
        rationale: 'The sample check failed.',
        findings: [{ path: 'lib/sample.mjs', line: 4, summary: 'Check failed.' }],
        cursorTask: 'Fix only lib/sample.mjs. Do not merge or deploy.',
      },
      usage: { inputTokens: 5, outputTokens: 5 },
    }),
    evidence: async () => ({ testSummary: 'FAIL tests/sample.test.mjs', changedFiles: ['lib/sample.mjs'] }),
  });
  const rawBody = JSON.stringify(buildPayload());
  const result = await handleSignedDelivery({
    rawBody,
    headers: signedHeaders(rawBody, config.webhookSecret, 'delivery-stale1'),
    runtime,
  });
  assert.equal(result.transition, 'stale_head');
  assert.equal(posts.length, 0);
});

function nodeRequest(payload, webhookSecret) {
  const raw = JSON.stringify(payload);
  const chunks = [Buffer.from(raw)];
  return {
    method: 'POST',
    headers: signedHeaders(raw, webhookSecret),
    async *[Symbol.asyncIterator]() {
      yield* chunks;
    },
  };
}

function recordingResponse() {
  return {
    statusCode: 0,
    body: '',
    setHeader() {},
    end(body) { this.body = body; },
  };
}
