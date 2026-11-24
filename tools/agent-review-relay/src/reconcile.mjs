import { RELAY_REPO } from './constants.mjs';
import { assertReconcileReady, cursorApiReady, pilotDispatchReady } from './config.mjs';
import { reconcileAuthorized } from './reconcile-auth.mjs';
import { renderComment } from './comment.mjs';
import { maxCallCostUsd, spendOverageUsd } from './cost.mjs';
import { applyEvidencePolicy, fixedHuman, normalizeDecision } from './policy.mjs';
import { classifyFiles, evidenceKind } from './sanitize.mjs';
import { authorizeEvent } from './event.mjs';

const TERMINAL_FAILURE = new Set(['ERROR', 'CANCELLED', 'EXPIRED']);

export function claimGraceMs(config) {
  const timeout = Number(config?.timeoutMs) || 20_000;
  return Math.min(3 * 60 * 1000, Math.max(90_000, timeout + 30_000));
}

function toMicro(usd) {
  return Math.max(0, Math.round(usd * 1e6));
}

function claimIsFresh(launch, nowMs, config) {
  const until = Date.parse(launch?.claimUntil || '');
  if (Number.isFinite(until)) return nowMs < until;
  const started = Date.parse(launch?.launchedAt || '');
  return Number.isFinite(started) && nowMs - started < claimGraceMs(config);
}

async function save(runtime, pr, record, next, options) {
  const saved = await runtime.store.commitPr(pr, record.version, next, options);
  if (!saved) {
    const error = new Error('relay state conflict');
    error.code = 'conflict';
    throw error;
  }
  return { ...next, version: record.version + 1, reviewHold: next.reviewHold || null };
}

async function audit(runtime, pr, record, transition, extra, meta, nowMs) {
  const spendMicro = await runtime.store.readSpendMicro();
  await runtime.store.appendAudit({
    at: new Date(nowMs).toISOString(),
    deliveryId: meta.deliveryId || null,
    repo: meta.repo || RELAY_REPO,
    pr,
    sha: extra.sha || record.cursorLaunch?.sha || null,
    event: meta.event || 'reconcile',
    action: meta.action || 'schedule',
    decision: extra.decision || null,
    transition,
    iterations: record.iterations || 0,
    tokens: extra.tokens || 0,
    costUsd: extra.costUsd || 0,
    totalSpendUsd: spendMicro / 1e6,
    dryRun: !runtime.live,
  });
}

function storedDecision(launch) {
  if (launch?.noticeDecision === 'PASS' || launch?.noticeDecision === 'REQUEST_CHANGES' || launch?.noticeDecision === 'HUMAN_APPROVAL_REQUIRED') {
    return {
      decision: launch.noticeDecision,
      rationale: launch.noticeRationale || 'Review completed.',
      findings: [],
      cursorTask: null,
      reason: launch.notice || 'model_review',
    };
  }
  return fixedHuman(launch?.notice || 'human_review');
}

async function claimNotify(runtime, pr, record, nowMs) {
  const launch = record.cursorLaunch;
  if (!launch || launch.notified === true || launch.notifyState === 'sent') return { ok: false, done: true, record };
  const until = Date.parse(launch.notifyUntil || '');
  if (launch.notifyState === 'claiming' && Number.isFinite(until) && nowMs < until) return { ok: false, done: false, record };
  try {
    const next = await save(runtime, pr, record, {
      ...record,
      cursorLaunch: {
        ...launch,
        notifyState: 'claiming',
        notifyUntil: new Date(nowMs + 30_000).toISOString(),
      },
    });
    return { ok: true, done: false, record: next };
  } catch (error) {
    if (error && error.code === 'conflict') return { ok: false, done: false, record };
    throw error;
  }
}

async function passStillCurrent(runtime, pr, sha) {
  const loaded = await runtime.loadPull(pr);
  if (!loaded?.ok || !loaded.ctx) return false;
  if (authorizeEvent(loaded.ctx, runtime.config.requiredLabel) || loaded.ctx.repo !== RELAY_REPO) return false;
  if (loaded.ctx.sha !== sha) return false;
  const fresh = await runtime.confirmHead({ ...loaded.ctx, pr, sha });
  return fresh?.ok === true;
}

async function notify(runtime, pr, record, decision, nowMs, sha = '') {
  const launch = record.cursorLaunch;
  if (!launch || launch.notified === true) {
    try {
      await save(runtime, pr, record, record, { pending: 'remove' });
    } catch {
      return false;
    }
    return true;
  }
  const claimed = await claimNotify(runtime, pr, record, nowMs);
  if (!claimed.ok) return claimed.done === true;
  const current = claimed.record;
  const commentSha = sha || current.cursorLaunch.noticeSha || current.cursorLaunch.sha || '0'.repeat(40);
  if (decision.decision === 'PASS') {
    const still = await passStillCurrent(runtime, pr, commentSha);
    if (!still) {
      try {
        await save(runtime, pr, current, {
          ...current,
          cursorLaunch: { ...current.cursorLaunch, notified: true, notifyState: 'sent' },
        }, { pending: 'remove' });
      } catch {
        return false;
      }
      return false;
    }
  }
  const body = renderComment({
    ...decision,
    sha: commentSha,
    iteration: current.iterations,
    pr,
    maxIterations: runtime.config.maxIterations,
    handoff: 'blocked',
  });
  try {
    if (runtime.live) await runtime.postComment({ pr, body, now: nowMs });
    else runtime.onPlan(body);
  } catch {
    try {
      await save(runtime, pr, current, {
        ...current,
        cursorLaunch: { ...current.cursorLaunch, notifyState: '', notifyUntil: '' },
      });
    } catch {
      /* The claim expires, so a later tick can retry the same decision. */
    }
    return false;
  }
  try {
    await save(runtime, pr, current, {
      ...current,
      cursorLaunch: { ...current.cursorLaunch, notified: true, notifyState: 'sent' },
    }, { pending: 'remove' });
  } catch {
    return false;
  }
  return true;
}

async function stopRun(runtime, pr, record, transition, decision, meta, nowMs, extra = {}) {
  const launch = record.cursorLaunch
    ? {
      ...record.cursorLaunch,
      state: transition === 'cursor_launch_ambiguous' ? 'ambiguous' : 'terminal',
      notified: false,
      agentId: record.cursorLaunch.agentId,
      runId: record.cursorLaunch.runId,
      notice: decision?.reason || '',
      noticeDecision: decision?.decision || '',
      noticeRationale: typeof decision?.rationale === 'string' ? decision.rationale.slice(0, 500) : '',
      noticeSha: extra.sha || record.cursorLaunch.noticeSha || record.cursorLaunch.sha || '',
    }
    : null;
  const next = await save(runtime, pr, record, {
    ...record,
    stopped: transition,
    capReviewed: record.capReviewed || transition === 'pass_stopped' || transition === 'max_iterations_stopped',
    cursorLaunch: launch,
    reviewHold: null,
  });
  try {
    await audit(runtime, pr, next, transition, { ...extra, decision: decision?.decision || null }, meta, nowMs);
  } catch {
    return { pr, transition: 'state_unreadable', ok: false, decision: null, iterations: next.iterations };
  }
  await notify(runtime, pr, next, decision, nowMs, extra.sha || '');
  return { pr, transition, ok: transition !== 'state_unreadable', decision: decision?.decision || null, iterations: next.iterations };
}

export async function reconcilePending(runtime, nowMs = Date.now(), meta = {}) {
  let ids;
  try {
    ids = await runtime.store.listPending(10);
  } catch {
    return [{ pr: null, transition: 'state_unreadable', ok: false }];
  }
  const results = [];
  for (const pr of ids) {
    try {
      results.push(await reconcileOne(runtime, pr, nowMs, meta));
    } catch {
      results.push({ pr, transition: 'state_unreadable', ok: false });
    }
  }
  return results;
}

export async function reconcileOne(runtime, pr, nowMs = Date.now(), meta = {}) {
  let record;
  try {
    record = await runtime.store.loadPr(pr);
  } catch {
    return { pr, transition: 'state_unreadable', ok: false };
  }
  const launch = record.cursorLaunch;
  if (!launch) {
    try {
      await runtime.store.clearPending(pr);
    } catch {
      return { pr, transition: 'state_unreadable', ok: false };
    }
    return { pr, transition: 'already_stopped', ok: true, iterations: record.iterations };
  }
  if (record.stopped && launch.notified !== true) {
    const decision = storedDecision(launch);
    await notify(runtime, pr, record, decision, nowMs, launch.noticeSha || '');
    return { pr, transition: record.stopped, ok: true, decision: decision.decision, iterations: record.iterations };
  }
  if (record.stopped) {
    try {
      await runtime.store.clearPending(pr);
    } catch {
      return { pr, transition: 'state_unreadable', ok: false };
    }
    return { pr, transition: 'already_stopped', ok: true, iterations: record.iterations };
  }
  if (launch.state === 'claiming' || !launch.agentId || !launch.runId) {
    if (claimIsFresh(launch, nowMs, runtime.config)) {
      return { pr, transition: 'cursor_run_active', ok: true, iterations: record.iterations };
    }
    return stopRun(runtime, pr, record, 'cursor_launch_ambiguous', fixedHuman('cursor_launch_ambiguous'), meta, nowMs);
  }
  if (launch.state === 'ambiguous' || launch.state === 'failed') {
    return stopRun(runtime, pr, record, launch.state === 'failed' ? 'cursor_launch_failed' : 'cursor_launch_ambiguous', fixedHuman(launch.state === 'failed' ? 'cursor_launch_failed' : 'cursor_launch_ambiguous'), meta, nowMs);
  }
  const started = Date.parse(launch.launchedAt || '');
  if (!Number.isFinite(started) || nowMs - started > runtime.config.reconcileTimeoutMs) {
    return stopRun(runtime, pr, record, 'cursor_run_timeout', fixedHuman('cursor_run_timeout'), meta, nowMs);
  }

  const hold = record.reviewHold;
  if (hold && hold.phase === 'calling') {
    const holdStart = Date.parse(hold.startedAt || '');
    if (Number.isFinite(holdStart) && nowMs - holdStart < claimGraceMs(runtime.config)) {
      return { pr, transition: 'cursor_run_active', ok: true, iterations: record.iterations };
    }
    return stopRun(runtime, pr, record, 'api_failure_stopped', fixedHuman('api_failure'), meta, nowMs);
  }

  let status = null;
  if (!(hold && hold.phase === 'ready')) {
    try {
      status = await runtime.readCursorRun(launch);
    } catch {
      status = { unknown: true };
    }
    if (!status || status.unknown || (status.terminal !== true && status.terminal !== false)) {
      const attempts = (launch.attempts || 0) + 1;
      if (attempts >= 5) return stopRun(runtime, pr, record, 'cursor_launch_ambiguous', fixedHuman('cursor_launch_ambiguous'), meta, nowMs);
      await save(runtime, pr, record, { ...record, cursorLaunch: { ...launch, attempts } });
      return { pr, transition: 'cursor_run_active', ok: true, iterations: record.iterations };
    }
    if (!status.terminal) return { pr, transition: 'cursor_run_active', ok: true, iterations: record.iterations };
    if (TERMINAL_FAILURE.has(status.status)) {
      return stopRun(runtime, pr, record, 'cursor_run_terminal_failed', fixedHuman('cursor_run_terminal_failed'), meta, nowMs);
    }
  }

  if (hold && hold.phase === 'ready') return publishHeld(runtime, pr, record, hold, meta, nowMs);

  const loaded = await runtime.loadPull(pr);
  if (!loaded?.ok || !loaded.ctx) {
    return stopRun(runtime, pr, record, loaded?.transition || 'access_denied', fixedHuman('human_review'), meta, nowMs);
  }
  const rejection = authorizeEvent(loaded.ctx, runtime.config.requiredLabel);
  if (rejection || loaded.ctx.repo !== RELAY_REPO) {
    return stopRun(runtime, pr, record, rejection || 'rejected_repo', fixedHuman('human_review'), meta, nowMs);
  }
  const head = loaded.ctx.sha;
  if (head === launch.sha) {
    return stopRun(runtime, pr, record, 'cursor_finished_unchanged', fixedHuman('cursor_finished_unchanged'), meta, nowMs, { sha: head });
  }
  if (hold && hold.phase === 'stale' && hold.sha === head) {
    return { pr, transition: 'stale_head', ok: false, iterations: record.iterations };
  }
  if (record.reviewed.includes(head)) {
    return { pr, transition: 'already_stopped', ok: true, iterations: record.iterations };
  }

  let evidence;
  try {
    evidence = await runtime.evidence({ ...loaded.ctx, pr, sha: head });
  } catch (error) {
    if (error && error.code === 'access_denied') {
      return stopRun(runtime, pr, record, 'access_denied', fixedHuman('human_review'), meta, nowMs, { sha: head });
    }
    evidence = null;
  }
  const fileClass = classifyFiles(evidence?.changedFiles);
  if (evidence && (evidence.incomplete || evidence.unsafe || fileClass !== 'ok')) {
    const sensitive = fileClass === 'sensitive';
    const transition = sensitive ? 'sensitive_path_stopped' : 'unsafe_path_stopped';
    return stopRun(runtime, pr, record, transition, fixedHuman(sensitive ? 'sensitive_path' : 'unsafe_path'), meta, nowMs, { sha: head });
  }
  if (!evidence || evidence.noChecks || evidenceKind(evidence) === 'unknown') {
    const attempts = (launch.attempts || 0) + 1;
    if (attempts >= 3) return stopRun(runtime, pr, record, 'cursor_evidence_timeout', fixedHuman('cursor_evidence_timeout'), meta, nowMs, { sha: head });
    await save(runtime, pr, record, { ...record, cursorLaunch: { ...launch, attempts } });
    return { pr, transition: 'evidence_pending', ok: true, iterations: record.iterations };
  }

  const reserve = toMicro(maxCallCostUsd(runtime.config));
  const cap = toMicro(runtime.config.spendCapUsd);
  let claimed;
  try {
    claimed = await save(runtime, pr, record, {
      ...record,
      reviewed: [...record.reviewed, head],
      reviewHold: { sha: head, phase: 'calling', startedAt: new Date(nowMs).toISOString(), decision: '', rationale: '', reason: '', tokens: 0, costUsd: 0 },
    }, { reserveMicro: reserve, capMicro: cap });
  } catch (error) {
    if (error && error.code === 'spend_cap') {
      return stopRun(runtime, pr, record, 'spend_cap_stopped', fixedHuman('spend_cap'), meta, nowMs, { sha: head });
    }
    if (error && error.code === 'conflict') {
      return { pr, transition: 'cursor_run_active', ok: true, iterations: record.iterations };
    }
    return { pr, transition: 'state_unreadable', ok: false, iterations: record.iterations };
  }

  let reviewed;
  try {
    reviewed = await runtime.review({ evidence, untrusted: loaded.ctx.untrusted, config: runtime.config });
  } catch {
    return stopRun(runtime, pr, claimed, 'api_failure_stopped', fixedHuman('api_failure'), meta, nowMs, { sha: head });
  }
  const usage = reviewed.usage || {};
  const charged = usage.inputTokens == null || usage.outputTokens == null
    ? { inputTokens: Math.ceil(runtime.config.maxInputChars / 4), outputTokens: runtime.config.maxOutputTokens }
    : usage;
  const settled = spendOverageUsd(runtime.config, charged);
  const costUsd = settled.actual;
  if (settled.overage > 0) await runtime.store.addSpendMicro(toMicro(settled.overage));
  const tokens = (charged.inputTokens || 0) + (charged.outputTokens || 0);
  let decision = applyEvidencePolicy(normalizeDecision(reviewed.decision || reviewed), evidence);
  if (decision.decision === 'REQUEST_CHANGES') decision = fixedHuman('max_iterations');
  const ready = await save(runtime, pr, claimed, {
    ...claimed,
    reviewHold: {
      sha: head,
      phase: 'ready',
      startedAt: claimed.reviewHold.startedAt,
      decision: decision.decision,
      rationale: decision.rationale,
      reason: decision.reason || '',
      tokens,
      costUsd,
    },
  });
  return publishHeld(runtime, pr, ready, ready.reviewHold, meta, nowMs, loaded.ctx);
}

async function publishHeld(runtime, pr, record, hold, meta, nowMs, ctx) {
  const decision = hold.decision === 'PASS'
    ? { decision: 'PASS', rationale: hold.rationale || 'Checks passed for this commit.', findings: [], cursorTask: null, reason: hold.reason || 'checks_passed' }
    : fixedHuman(hold.reason || 'max_iterations');
  let current = ctx;
  if (!current) {
    const loaded = await runtime.loadPull(pr);
    if (!loaded?.ok) return stopRun(runtime, pr, record, loaded?.transition || 'access_denied', fixedHuman('human_review'), meta, nowMs, { sha: hold.sha, tokens: hold.tokens, costUsd: hold.costUsd });
    current = loaded.ctx;
  }
  const fresh = await runtime.confirmHead({ ...current, pr, sha: hold.sha });
  if (!fresh.ok) {
    await save(runtime, pr, record, {
      ...record,
      reviewHold: { ...hold, phase: 'stale', decision: '' },
    });
    try {
      await audit(runtime, pr, record, fresh.transition || 'stale_head', { sha: hold.sha, tokens: hold.tokens, costUsd: hold.costUsd, decision: null }, meta, nowMs);
    } catch {
      return { pr, transition: 'state_unreadable', ok: false };
    }
    return { pr, transition: fresh.transition || 'stale_head', ok: false, iterations: record.iterations };
  }
  const transition = decision.decision === 'PASS' ? 'pass_stopped' : 'max_iterations_stopped';
  return stopRun(runtime, pr, record, transition, decision, meta, nowMs, { sha: hold.sha, tokens: hold.tokens, costUsd: hold.costUsd });
}

export async function persistConfirmedRun(runtime, pr, record, launch) {
  const nextLaunch = {
    state: 'active',
    agentId: launch.agentId,
    runId: launch.runId,
    sha: launch.sha,
    launchedAt: launch.launchedAt,
    claimUntil: '',
    attempts: 0,
    notified: false,
  };
  const next = {
    ...record,
    stopped: record.stopped === 'cursor_launch_ambiguous' ? '' : record.stopped,
    cursorLaunch: nextLaunch,
  };
  try {
    await save(runtime, pr, record, next, { pending: 'add' });
    return true;
  } catch (error) {
    if (error && error.code === 'pending_full') {
      try {
        await save(runtime, pr, record, next);
        return true;
      } catch {
        return false;
      }
    }
    if (!error || error.code !== 'conflict') return false;
    let latest;
    try {
      latest = await runtime.store.loadPr(pr);
    } catch {
      return false;
    }
    if (latest.cursorLaunch?.agentId) return latest.cursorLaunch.agentId === launch.agentId;
    const revived = {
      ...latest,
      stopped: latest.stopped === 'cursor_launch_ambiguous' ? '' : latest.stopped,
      cursorLaunch: { ...nextLaunch, launchedAt: latest.cursorLaunch?.launchedAt || launch.launchedAt },
    };
    try {
      await save(runtime, pr, latest, revived, { pending: 'add' });
      return true;
    } catch (again) {
      if (!again || again.code !== 'pending_full') return false;
      try {
        await save(runtime, pr, latest, revived);
        return true;
      } catch {
        return false;
      }
    }
  }
}

export async function handleReconcile({ rawBody, headers, runtime, now = Date.now() }) {
  const verdict = reconcileAuthorized(rawBody, headers, runtime.config, now);
  if (!verdict.ok) return { httpStatus: 401, ok: false, transition: 'rejected_signature', results: [] };
  try {
    const claimed = await runtime.store.claimDelivery(`reconcile-${verdict.replayKey}`);
    if (!claimed) return { httpStatus: 200, ok: false, transition: 'rejected_replay', results: [] };
  } catch {
    return { httpStatus: 200, ok: false, transition: 'state_unreadable', results: [] };
  }
  if (!runtime.config.enabled) return { httpStatus: 200, ok: false, transition: 'disabled', results: [] };
  if (runtime.config.killSwitch) return { httpStatus: 200, ok: false, transition: 'killed', results: [] };
  if (!runtime.live || !cursorApiReady(runtime.config) || !pilotDispatchReady(runtime.config) || assertReconcileReady(runtime.config).length > 0) {
    return { httpStatus: 200, ok: false, transition: 'reconcile_unavailable', results: [] };
  }
  const results = await reconcilePending(runtime, runtime.now ? runtime.now() : now);
  return { httpStatus: 200, ok: true, transition: 'reconciled', results };
}
