import { estimateCostUsd, maxCallCostUsd, round6 } from './cost.mjs';
import { renderComment } from './comment.mjs';
import { classifyFiles, evidenceKind } from './sanitize.mjs';
import { applyEvidencePolicy, fixedHuman, normalizeDecision } from './policy.mjs';

function toMicro(usd) {
  return Math.max(0, Math.round(usd * 1e6));
}

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
  const { config, store } = runtime;
  const nowMs = runtime.now();
  const dryRun = !runtime.live;
  const sha = ctx.sha;
  let record = await store.loadPr(ctx.pr);

  const audit = async (transition, extra = {}) => {
    const spendMicro = await store.readSpendMicro();
    await store.appendAudit({
      at: new Date(nowMs).toISOString(),
      deliveryId: ctx.deliveryId,
      repo: ctx.repo,
      pr: ctx.pr,
      sha,
      event: ctx.event,
      action: ctx.action,
      decision: extra.decision || null,
      transition,
      iterations: record.iterations || 0,
      tokens: extra.tokens || 0,
      costUsd: extra.costUsd || 0,
      totalSpendUsd: spendMicro / 1e6,
      dryRun,
    });
  };

  const commit = async (next) => {
    const saved = await store.commitPr(ctx.pr, record.version, next);
    if (!saved) {
      const error = new Error('relay state conflict');
      error.code = 'conflict';
      throw error;
    }
    record = { ...next, version: record.version + 1 };
  };

  const finish = async (transition, decision, { sealSha = true, comment = true, tokens = 0, costUsd = 0, ok = true } = {}) => {
    const next = {
      ...record,
      reviewed: [...record.reviewed],
      stopped: record.stopped,
    };
    if (sealSha && sha && !next.reviewed.includes(sha)) next.reviewed.push(sha);
    if (comment && decision && !dryRun) {
      const fresh = await runtime.confirmHead(ctx);
      if (!fresh.ok) {
        await audit(fresh.transition || 'stale_head');
        return outcome(fresh.transition || 'stale_head', { ok: false, dryRun, iterations: record.iterations });
      }
    }
    if (decision?.decision === 'REQUEST_CHANGES') {
      if (next.iterations >= config.maxIterations) {
        decision = fixedHuman('max_iterations');
        transition = 'max_iterations_stopped';
      } else {
        next.iterations += 1;
      }
    }
    if (decision && decision.decision !== 'REQUEST_CHANGES' && !['evidence_pending', 'duplicate_sha', 'rejected_stale', 'stale_head', 'access_denied', 'state_conflict'].includes(transition)) {
      next.stopped = transition;
    }
    if (costUsd > 0) await store.addSpendMicro(toMicro(costUsd));
    try {
      if (next.iterations !== record.iterations || next.stopped !== record.stopped || next.reviewed.join() !== record.reviewed.join() || next.firstSeen !== record.firstSeen) {
        await commit(next);
      }
    } catch (error) {
      if (error && error.code === 'conflict') {
        await audit('state_conflict');
        return outcome('state_conflict', { ok: false, dryRun, iterations: record.iterations });
      }
      await audit('state_unreadable').catch(() => {});
      return outcome('state_unreadable', { ok: false, dryRun });
    }
    let plannedComment = null;
    if (comment && decision) {
      try {
        plannedComment = await publish(runtime, ctx, decision, record.iterations, dryRun, nowMs);
      } catch {
        const stopped = { ...record, stopped: 'comment_failed_stopped' };
        try {
          await commit(stopped);
        } catch {
          /* The delivery is already claimed, so a failed save cannot retry this event. */
        }
        await audit('comment_failed_stopped', { decision: decision.decision, tokens, costUsd });
        return outcome('comment_failed_stopped', { decision: decision.decision, dryRun, iterations: record.iterations, ok: false });
      }
    }
    await audit(transition, { decision: decision?.decision || null, tokens, costUsd });
    return outcome(transition, {
      decision: decision?.decision || null,
      dryRun,
      iterations: record.iterations,
      plannedComment,
      ok,
    });
  };

  if (record.stopped) {
    return finish('already_stopped', null, { sealSha: false, comment: false });
  }

  const age = nowMs - Date.parse(ctx.updatedAt);
  if (!Number.isFinite(age) || age > config.maxEventAgeMs || age < -120_000) {
    return finish('rejected_stale', null, { sealSha: false, comment: false, ok: false });
  }

  if (!record.firstSeen) {
    record = { ...record, firstSeen: new Date(nowMs).toISOString() };
    try {
      await commit(record);
    } catch (error) {
      if (error && error.code === 'conflict') return outcome('state_conflict', { ok: false, dryRun });
      return outcome('state_unreadable', { ok: false, dryRun });
    }
  }
  if (nowMs - Date.parse(record.firstSeen) > config.prBudgetMs) {
    return finish('pr_budget_stopped', fixedHuman('pr_budget'));
  }

  const spendMicro = await store.readSpendMicro();
  if ((spendMicro + toMicro(maxCallCostUsd(config))) / 1e6 > config.spendCapUsd) {
    return finish('spend_cap_stopped', fixedHuman('spend_cap'));
  }

  if (runtime.live) {
    const fresh = await runtime.confirmHead(ctx);
    if (!fresh.ok) return finish(fresh.transition || 'stale_head', null, { sealSha: false, comment: false, ok: false });
  }

  if (record.reviewed.includes(sha)) {
    return finish('duplicate_sha', null, { sealSha: false, comment: false });
  }

  let evidence;
  try {
    evidence = runtime.live
      ? await runtime.evidence(ctx)
      : (ctx.suppliedEvidence || await runtime.evidence(ctx));
  } catch (error) {
    if (error && error.code === 'access_denied') {
      return finish('access_denied', null, { sealSha: false, comment: false, ok: false });
    }
    return finish('api_failure_stopped', fixedHuman('api_failure'));
  }

  const fileClass = classifyFiles(evidence?.changedFiles);
  if (evidence?.incomplete || evidence?.unsafe || fileClass !== 'ok') {
    const sensitive = fileClass === 'sensitive';
    return finish(sensitive ? 'sensitive_path_stopped' : 'unsafe_path_stopped', fixedHuman(sensitive ? 'sensitive_path' : 'unsafe_path'));
  }

  if (evidenceKind(evidence) === 'unknown' || evidence?.noChecks) {
    return finish('evidence_pending', null, { sealSha: false, comment: false });
  }

  if (record.iterations >= config.maxIterations && evidenceKind(evidence) === 'fail') {
    return finish('max_iterations_stopped', fixedHuman('max_iterations'));
  }

  try {
    await commit({ ...record, reviewed: [...record.reviewed, sha] });
  } catch (error) {
    if (error && error.code === 'conflict') {
      const latest = await store.loadPr(ctx.pr);
      if (latest.reviewed.includes(sha) || latest.stopped) {
        record = latest;
        return finish(latest.stopped ? 'already_stopped' : 'duplicate_sha', null, { sealSha: false, comment: false });
      }
      return outcome('state_conflict', { ok: false, dryRun });
    }
    return outcome('state_unreadable', { ok: false, dryRun });
  }

  let reviewed;
  try {
    reviewed = await runtime.review({ evidence, untrusted: ctx.untrusted, config });
  } catch {
    return finish('api_failure_stopped', fixedHuman('api_failure'));
  }

  const usage = reviewed.usage || {};
  const charged = usage.inputTokens == null || usage.outputTokens == null
    ? (dryRun
      ? { inputTokens: 0, outputTokens: 0 }
      : { inputTokens: Math.ceil(config.maxInputChars / 4), outputTokens: config.maxOutputTokens })
    : usage;
  const costUsd = estimateCostUsd(config, charged);
  const tokens = (charged.inputTokens || 0) + (charged.outputTokens || 0);
  let decision = applyEvidencePolicy(normalizeDecision(reviewed.decision || reviewed), evidence);
  if (record.iterations >= config.maxIterations && decision.decision === 'REQUEST_CHANGES') {
    decision = fixedHuman('max_iterations');
  }
  if (decision.decision === 'PASS') return finish('pass_stopped', decision, { tokens, costUsd });
  if (decision.decision === 'HUMAN_APPROVAL_REQUIRED') {
    const transition = decision.reason === 'max_iterations' ? 'max_iterations_stopped' : 'human_stopped';
    return finish(transition, decision, { tokens, costUsd });
  }
  return finish(dryRun ? 'dry_run_planned' : 'comment_posted', decision, { tokens, costUsd });
}
