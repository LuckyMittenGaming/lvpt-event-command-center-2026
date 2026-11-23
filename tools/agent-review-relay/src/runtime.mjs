import { assertLiveReady } from './config.mjs';
import { fetchPullEvidence, postIssueComment } from './github.mjs';
import { deterministicDecision } from './policy.mjs';
import { openAiReview } from './reviewers.mjs';
import { createState } from './state.mjs';

export function refuseNetwork() {
  return Promise.reject(new Error('network disabled'));
}

export function createRuntime(config, overrides = {}) {
  const live = assertLiveReady(config).length === 0 && overrides.forceDryRun !== true;
  const fetchImpl = overrides.fetchImpl || refuseNetwork;
  const state = overrides.state || createState({ file: live ? config.statePath : '' });
  const cache = { token: '', exp: 0 };
  return {
    config,
    state,
    live,
    now: overrides.now || (() => Date.now()),
    fetchImpl,
    review: overrides.review || (live
      ? (input) => openAiReview({ ...input, config, fetchImpl })
      : async (input) => ({ decision: deterministicDecision(input.evidence), usage: { inputTokens: 0, outputTokens: 0 } })),
    evidence: overrides.evidence || (live
      ? (ctx) => fetchPullEvidence({ config, fetchImpl, cache, pr: ctx.pr, sha: ctx.sha, now: runtimeNow(overrides) })
      : async (ctx) => ctx.suppliedEvidence || { testSummary: 'unavailable', changedFiles: [] }),
    postComment: overrides.postComment || (live
      ? (input) => postIssueComment({ config, fetchImpl, cache, pr: input.pr, body: input.body, now: input.now })
      : async () => { throw new Error('dry-run refused to post'); }),
    onPlan: overrides.onPlan || (() => {}),
  };
}

function runtimeNow(overrides) {
  return overrides.now ? overrides.now() : Date.now();
}
