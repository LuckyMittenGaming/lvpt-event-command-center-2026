import { assertLiveReady } from './config.mjs';
import { RELAY_REPO } from './constants.mjs';
import { launchCursorRun, readCursorRun } from './cursor-api.mjs';
import { confirmPullHead, fetchPullEvidence, findPullNumberForSha, fetchPullRequest, postIssueComment } from './github.mjs';
import { contextFromPull } from './event.mjs';
import { deterministicDecision } from './policy.mjs';
import { openAiReview } from './reviewers.mjs';
import { createMemoryStore, createRedisStore } from './store.mjs';

export function refuseNetwork() {
  return Promise.reject(new Error('network disabled'));
}

export function hostFetch(url, options) {
  if (typeof globalThis.fetch !== 'function') return refuseNetwork();
  return globalThis.fetch(url, options);
}

export function createRuntime(config, overrides = {}) {
  const live = assertLiveReady(config).length === 0 && overrides.forceDryRun !== true;
  const fetchImpl = overrides.fetchImpl || (live ? hostFetch : refuseNetwork);
  const store = overrides.store || (live
    ? createRedisStore({ url: config.upstashUrl, token: config.upstashToken, fetchImpl })
    : createMemoryStore());
  const cache = { token: '', exp: 0 };
  const now = overrides.now || (() => Date.now());
  return {
    config,
    store,
    live,
    now,
    fetchImpl,
    review: overrides.review || (live
      ? (input) => openAiReview({ ...input, config, fetchImpl })
      : async (input) => ({ decision: deterministicDecision(input.evidence), usage: { inputTokens: 0, outputTokens: 0 } })),
    evidence: overrides.evidence || (live
      ? (ctx) => fetchPullEvidence({ config, fetchImpl, cache, pr: ctx.pr, sha: ctx.sha, now: now() })
      : async (ctx) => ctx.suppliedEvidence || { testSummary: 'unavailable', changedFiles: [] }),
    postComment: overrides.postComment || (live
      ? (input) => postIssueComment({ config, fetchImpl, cache, pr: input.pr, body: input.body, now: input.now })
      : async () => { throw new Error('dry-run refused to post'); }),
    confirmHead: overrides.confirmHead || (live
      ? (ctx) => confirmPullHead({
        config,
        fetchImpl,
        cache,
        pr: ctx.pr,
        sha: ctx.sha,
        now: now(),
        requiredLabel: config.requiredLabel,
      })
      : async () => ({ ok: true })),
    lookupPull: overrides.lookupPull || (live
      ? (hint) => lookupLivePull({ config, fetchImpl, cache, hint, now: now() })
      : async (hint) => lookupSuppliedPull(hint)),
    onPlan: overrides.onPlan || (() => {}),
    launchCursor: overrides.launchCursor || ((input) => launchCursorRun({
      config,
      fetchImpl,
      timeoutMs: config.timeoutMs,
      ...input,
    })),
    loadPull: overrides.loadPull || (live
      ? async (pr) => {
        const pull = await fetchPullRequest({ config, fetchImpl, cache, pr, now: now() });
        return contextFromPull(pull, {
          requiredLabel: config.requiredLabel,
          event: 'pull_request',
          action: 'synchronize',
          repo: RELAY_REPO,
        });
      }
      : async () => ({ ok: false, transition: 'rejected_event' })),
    readCursorRun: overrides.readCursorRun || ((launch) => readCursorRun({
      config,
      fetchImpl,
      timeoutMs: config.timeoutMs,
      agentId: launch.agentId,
      runId: launch.runId,
    })),
  };
}

async function lookupLivePull({ config, fetchImpl, cache, hint, now }) {
  let number = hint.pr;
  if (!number) {
    number = await findPullNumberForSha({ config, fetchImpl, cache, sha: hint.sha, now });
  }
  if (!number) return { ok: false, transition: 'rejected_event' };
  try {
    const pull = await fetchPullRequest({ config, fetchImpl, cache, pr: number, now });
    return contextFromPull(pull, { ...hint, requiredLabel: config.requiredLabel });
  } catch (error) {
    if (error && error.code === 'access_denied') return { ok: false, transition: 'access_denied' };
    throw error;
  }
}

function lookupSuppliedPull(hint) {
  if (!hint.suppliedPull) return { ok: false, transition: 'rejected_event' };
  return contextFromPull(hint.suppliedPull, hint);
}
