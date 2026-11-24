import { cursorApiReady, pilotDispatchReady } from './config.mjs';
import { maxCallCostUsd, spendOverageUsd } from './cost.mjs';
import { renderComment } from './comment.mjs';
import { classifyFiles, evidenceKind } from './sanitize.mjs';
import { applyEvidencePolicy, fixedHuman, hasConcreteFindings, normalizeDecision } from './policy.mjs';
import { claimGraceMs, persistConfirmedRun, reconcileOne } from './reconcile.mjs';

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

async function publish(runtime, ctx, decision, iteration, dryRun, nowMs, options = {}) {
  const comment = renderComment({
    ...decision,
    sha: ctx.sha,
    iteration,
    pr: ctx.pr,
    maxIterations: options.maxIterations || runtime.config.maxIterations,
    handoff: options.handoff || 'mention',
    agentId: options.agentId || '',
    runId: options.runId || '',
  });
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

  const commit = async (next, options) => {
    const saved = await store.commitPr(ctx.pr, record.version, next, options);
    if (!saved) {
      const error = new Error('relay state conflict');
      error.code = 'conflict';
      throw error;
    }
    record = { ...next, version: record.version + 1 };
  };

  const finish = async (transition, decision, { sealSha = true, comment = true, tokens = 0, costUsd = 0, ok = true, handoff = 'mention', agentId = '', runId = '', skipFreshness = false, reserveAlready = false, keepLaunch = false, reserved = false } = {}) => {
    const next = {
      ...record,
      reviewed: [...record.reviewed],
      stopped: record.stopped,
    };
    if (sealSha && sha && !next.reviewed.includes(sha)) next.reviewed.push(sha);
    if (comment && decision && !dryRun && !skipFreshness) {
      const fresh = await runtime.confirmHead(ctx);
      if (!fresh.ok) {
        await audit(fresh.transition || 'stale_head');
        return outcome(fresh.transition || 'stale_head', { ok: false, dryRun, iterations: record.iterations });
      }
    }
    if (decision?.decision === 'REQUEST_CHANGES' && !reserveAlready) {
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
    if (costUsd > 0 && !reserved) await store.addSpendMicro(toMicro(costUsd));
    if (reserved) {
      const reservedUsd = maxCallCostUsd(config);
      if (costUsd > reservedUsd) await store.addSpendMicro(toMicro(costUsd - reservedUsd));
    }
    try {
      const launchChanged = JSON.stringify(next.cursorLaunch || null) !== JSON.stringify(record.cursorLaunch || null);
      const holdChanged = JSON.stringify(next.reviewHold || null) !== JSON.stringify(record.reviewHold || null);
      if (next.iterations !== record.iterations || next.stopped !== record.stopped || next.reviewed.join() !== record.reviewed.join() || next.firstSeen !== record.firstSeen || next.capReviewed !== record.capReviewed || launchChanged || holdChanged) {
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
        plannedComment = await publish(runtime, ctx, decision, record.iterations, dryRun, nowMs, { handoff, agentId, runId });
        if (record.cursorLaunch && record.cursorLaunch.state !== 'active' && record.cursorLaunch.state !== 'claiming' && record.cursorLaunch.notified !== true) {
          record.cursorLaunch = { ...record.cursorLaunch, notified: true };
          await commit({ ...record }, { pending: 'remove' });
        }
      } catch {
        if (!keepLaunch) {
          const stopped = { ...record, stopped: 'comment_failed_stopped' };
          try {
            await commit(stopped);
          } catch {
            /* The delivery is already claimed, so a failed save cannot retry this event. */
          }
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

  if (record.cursorLaunch && (
    record.cursorLaunch.state === 'active'
    || record.cursorLaunch.state === 'claiming'
    || (record.stopped && record.cursorLaunch.notified !== true)
  )) {
    const result = await reconcileOne(runtime, ctx.pr, nowMs, {
      deliveryId: ctx.deliveryId,
      event: ctx.event,
      action: ctx.action,
      repo: ctx.repo,
    });
    let latest = record;
    try {
      latest = await store.loadPr(ctx.pr);
    } catch {
      latest = record;
    }
    record = latest;
    return outcome(result.transition, {
      ok: result.ok !== false,
      dryRun,
      iterations: latest.iterations || 0,
      decision: result.decision || null,
    });
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

  const finalReview = record.iterations >= config.maxIterations;
  if (finalReview && record.capReviewed) {
    return finish('already_stopped', null, { sealSha: false, comment: false });
  }

  const reserveMicro = toMicro(maxCallCostUsd(config));
  try {
    await commit({ ...record, reviewed: [...record.reviewed, sha] }, { reserveMicro, capMicro: toMicro(config.spendCapUsd) });
  } catch (error) {
    if (error && error.code === 'spend_cap') return finish('spend_cap_stopped', fixedHuman('spend_cap'));
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
    return finish('api_failure_stopped', fixedHuman('api_failure'), { reserved: true });
  }

  const usage = reviewed.usage || {};
  const charged = usage.inputTokens == null || usage.outputTokens == null
    ? (dryRun
      ? { inputTokens: 0, outputTokens: 0 }
      : { inputTokens: Math.ceil((config.maxInputChars) / 4), outputTokens: config.maxOutputTokens })
    : usage;
  const costUsd = spendOverageUsd(config, charged).actual;
  const tokens = (charged.inputTokens || 0) + (charged.outputTokens || 0);
  let decision = applyEvidencePolicy(normalizeDecision(reviewed.decision || reviewed), evidence);
  if (finalReview) record.capReviewed = true;
  if (finalReview && decision.decision === 'REQUEST_CHANGES') {
    decision = fixedHuman('max_iterations');
  }
  if (decision.decision === 'PASS') return finish('pass_stopped', decision, { tokens, costUsd, reserved: true });
  if (decision.decision === 'HUMAN_APPROVAL_REQUIRED') {
    const transition = decision.reason === 'max_iterations' ? 'max_iterations_stopped' : 'human_stopped';
    return finish(transition, decision, { tokens, costUsd, reserved: true });
  }
  if (config.cursorApi === true) {
    if (!runtime.live) {
      return finish('dry_run_planned', decision, { tokens, costUsd, handoff: 'api', reserved: true });
    }
    if (!cursorApiReady(config)) {
      return finish('cursor_api_unavailable', fixedHuman('cursor_api_unavailable'), { tokens, costUsd, handoff: 'blocked', reserved: true });
    }
    if (!pilotDispatchReady(config)) {
      return finish('reconcile_unavailable', fixedHuman('reconcile_unavailable'), { tokens, costUsd, handoff: 'blocked', reserved: true });
    }
    if (!hasConcreteFindings(decision, evidence)) {
      return finish('human_stopped', fixedHuman('evidence_missing'), { tokens, costUsd, handoff: 'blocked', reserved: true });
    }
    const launchedAt = new Date(nowMs).toISOString();
    try {
      await commit({
        ...record,
        iterations: record.iterations + 1,
        cursorLaunch: {
          state: 'claiming',
          agentId: '',
          runId: '',
          sha,
          launchedAt,
          claimUntil: new Date(nowMs + claimGraceMs(config)).toISOString(),
          attempts: 0,
          notified: false,
        },
      }, { pending: 'add' });
    } catch (error) {
      if (error && error.code === 'pending_full') {
        return finish('pending_full', fixedHuman('pending_full'), { tokens, costUsd, handoff: 'blocked', reserveAlready: true, reserved: true });
      }
      if (error && error.code === 'conflict') {
        const latest = await store.loadPr(ctx.pr);
        record = latest;
        return outcome(latest.cursorLaunch ? 'cursor_run_active' : 'state_conflict', { ok: false, dryRun, iterations: record.iterations });
      }
      return outcome('state_unreadable', { ok: false, dryRun });
    }
    const again = await runtime.confirmHead(ctx);
    if (!again.ok) {
      record.cursorLaunch = { state: 'failed', agentId: '', runId: '', sha, launchedAt: record.cursorLaunch?.launchedAt || '', attempts: 0, notified: false, claimUntil: '' };
      return finish(again.transition || 'stale_head', fixedHuman('cursor_launch_failed'), { tokens, costUsd, handoff: 'blocked', reserveAlready: true, comment: true, reserved: true, skipFreshness: true });
    }
    try {
      const launched = await runtime.launchCursor({
        pr: ctx.pr,
        task: [
          `Make only this bounded change on the existing staging pull request. The configured autonomous correction cap is ${config.maxIterations}. Do not open a new pull request, merge, deploy, or expand scope.`,
          decision.cursorTask,
        ].join('\n'),
      });
      const confirmed = {
        state: 'active',
        agentId: launched.agentId,
        runId: launched.runId,
        sha,
        launchedAt: record.cursorLaunch?.launchedAt || new Date(nowMs).toISOString(),
        claimUntil: '',
        attempts: 0,
        notified: false,
      };
      const stored = await persistConfirmedRun(runtime, ctx.pr, record, confirmed);
      if (!stored) return outcome('cursor_launch_ambiguous', { ok: false, dryRun, iterations: record.iterations });
      record = await store.loadPr(ctx.pr);
      return finish('cursor_dispatched', decision, {
        tokens,
        costUsd,
        handoff: 'api',
        agentId: launched.agentId,
        runId: launched.runId,
        skipFreshness: true,
        reserveAlready: true,
        keepLaunch: true,
        reserved: true,
      });
    } catch (error) {
      const ambiguous = error?.ambiguous !== false;
      record.cursorLaunch = { state: ambiguous ? 'ambiguous' : 'failed', agentId: '', runId: '', sha, launchedAt: record.cursorLaunch?.launchedAt || '', attempts: 0, notified: false, claimUntil: '' };
      const reason = ambiguous ? 'cursor_launch_ambiguous' : 'cursor_launch_failed';
      return finish(reason, fixedHuman(reason), { tokens, costUsd, handoff: 'blocked', reserveAlready: true, reserved: true });
    }
  }
  return finish(dryRun ? 'dry_run_planned' : 'comment_posted', decision, { tokens, costUsd, reserved: true });
}
