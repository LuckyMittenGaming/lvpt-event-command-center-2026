import { estimateCostUsd, maxCallCostUsd, round6 } from './cost.mjs';
import { renderComment } from './comment.mjs';
import { classifyFiles, evidenceKind } from './sanitize.mjs';
import { applyEvidencePolicy, fixedHuman, normalizeDecision } from './policy.mjs';

function outcome(transition, extra = {}) {
  return {
    httpStatus: 200,
    ok: extra.ok !== false,
    transition,
    decision: extra.decision || null,
    dryRun: extra.dryRun !== false,
    iterations: extra.iterations || 0,
    plannedComment: extra.plannedComment || null,
    mentionsCursor: Boolean(extra.plannedComment && extra.plannedComment.includes('\n@cursor ')),
  };
}

async function publish(runtime, ctx, decision, iteration, dryRun, nowMs) {
  const comment = renderComment({ ...decision, sha: ctx.sha, iteration, pr: ctx.pr });
  if (dryRun) {
    runtime.onPlan(comment);
    return comment;
  }
  await runtime.postComment({ pr: ctx.pr, body: comment, now: nowMs });
  return null;
}

export async function coordinate(ctx, runtime) {
  const { config, state } = runtime;
  const nowMs = runtime.now();
  const dryRun = !runtime.live;
  const prKey = String(ctx.pr);
  const shaKey = `${ctx.pr}:${ctx.sha}`;
  let seal = false;

  const audit = (transition, extra = {}) => {
    state.record({
      at: new Date(nowMs).toISOString(),
      deliveryId: ctx.deliveryId,
      repo: ctx.repo,
      pr: ctx.pr,
      sha: ctx.sha,
      event: ctx.event,
      action: ctx.action,
      decision: extra.decision || null,
      transition,
      iterations: state.data.iterations[prKey] || 0,
      tokens: extra.tokens || 0,
      costUsd: extra.costUsd || 0,
      totalSpendUsd: state.data.spendUsd,
      dryRun,
    });
  };

  const finish = async (transition, decision, { sealSha = true, comment = true, tokens = 0, costUsd = 0, ok = true } = {}) => {
    if (sealSha) {
      seal = true;
      if (!state.data.reviewed.includes(shaKey)) state.data.reviewed.push(shaKey);
    }
    if (decision?.decision === 'REQUEST_CHANGES') {
      state.data.iterations[prKey] = (state.data.iterations[prKey] || 0) + 1;
    } else if (decision && transition !== 'evidence_pending' && transition !== 'duplicate_sha' && transition !== 'rejected_stale') {
      state.data.stopped[prKey] = transition;
    }
    let plannedComment = null;
    if (comment && decision) {
      try {
        plannedComment = await publish(
          runtime,
          ctx,
          decision,
          state.data.iterations[prKey] || 0,
          dryRun,
          nowMs,
        );
      } catch {
        state.data.stopped[prKey] = 'comment_failed_stopped';
        seal = sealSha;
        audit('comment_failed_stopped', { decision: decision.decision, tokens, costUsd });
        return outcome('comment_failed_stopped', { decision: decision.decision, dryRun, iterations: state.data.iterations[prKey] || 0, ok: false });
      }
    }
    audit(transition, { decision: decision?.decision || null, tokens, costUsd });
    return outcome(transition, {
      decision: decision?.decision || null,
      dryRun,
      iterations: state.data.iterations[prKey] || 0,
      plannedComment,
      ok,
    });
  };

  try {
    if (state.data.stopped[prKey]) {
      return await finish('already_stopped', null, { sealSha: false, comment: false });
    }

    const age = nowMs - Date.parse(ctx.updatedAt);
    if (!Number.isFinite(age) || age > config.maxEventAgeMs || age < -120_000) {
      return await finish('rejected_stale', null, { sealSha: false, comment: false, ok: false });
    }

    if (!state.data.firstSeen[prKey]) state.data.firstSeen[prKey] = new Date(nowMs).toISOString();
    if (nowMs - Date.parse(state.data.firstSeen[prKey]) > config.prBudgetMs) {
      return await finish('pr_budget_stopped', fixedHuman('pr_budget'));
    }

    if (round6(state.data.spendUsd + maxCallCostUsd(config)) > config.spendCapUsd) {
      return await finish('spend_cap_stopped', fixedHuman('spend_cap'));
    }

    if (state.data.reviewed.includes(shaKey) || state.data.inFlight[shaKey]) {
      return await finish('duplicate_sha', null, { sealSha: false, comment: false });
    }

    state.data.inFlight[shaKey] = true;
    let evidence;
    try {
      evidence = runtime.live
        ? await runtime.evidence(ctx)
        : (ctx.suppliedEvidence || await runtime.evidence(ctx));
    } catch {
      return await finish('api_failure_stopped', fixedHuman('api_failure'));
    }
    const fileClass = classifyFiles(evidence?.changedFiles);
    if (evidence?.incomplete || evidence?.unsafe || fileClass !== 'ok') {
      const sensitive = fileClass === 'sensitive';
      return await finish(sensitive ? 'sensitive_path_stopped' : 'unsafe_path_stopped', fixedHuman(sensitive ? 'sensitive_path' : 'unsafe_path'));
    }

    if (evidenceKind(evidence) === 'unknown') {
      return await finish('evidence_pending', null, { sealSha: false, comment: false });
    }

    const iterations = state.data.iterations[prKey] || 0;
    if (iterations >= config.maxIterations) {
      if (evidenceKind(evidence) === 'pass') {
        return await finish('pass_stopped', {
          decision: 'PASS',
          rationale: 'Checks passed for this commit.',
          findings: [],
          cursorTask: null,
          reason: 'checks_passed',
        });
      }
      return await finish('max_iterations_stopped', fixedHuman('max_iterations'));
    }

    let reviewed;
    try {
      reviewed = await runtime.review({ evidence, untrusted: ctx.untrusted, config });
    } catch {
      return await finish('api_failure_stopped', fixedHuman('api_failure'));
    }

    const usage = reviewed.usage || {};
    const charged = usage.inputTokens == null || usage.outputTokens == null
      ? (dryRun
        ? { inputTokens: 0, outputTokens: 0 }
        : { inputTokens: Math.ceil(config.maxInputChars / 4), outputTokens: config.maxOutputTokens })
      : usage;
    const costUsd = estimateCostUsd(config, charged);
    state.data.spendUsd = round6(state.data.spendUsd + costUsd);
    const tokens = (charged.inputTokens || 0) + (charged.outputTokens || 0);

    let decision = applyEvidencePolicy(normalizeDecision(reviewed.decision || reviewed), evidence);
    if (decision.decision === 'PASS') return await finish('pass_stopped', decision, { tokens, costUsd });
    if (decision.decision === 'HUMAN_APPROVAL_REQUIRED') return await finish('human_stopped', decision, { tokens, costUsd });
    return await finish(dryRun ? 'dry_run_planned' : 'comment_posted', decision, { tokens, costUsd });
  } finally {
    delete state.data.inFlight[shaKey];
    if (seal && !state.data.reviewed.includes(shaKey)) state.data.reviewed.push(shaKey);
    try {
      state.persist();
    } catch {
      /* The caller fail-closes if a later read cannot trust state. */
    }
  }
}
