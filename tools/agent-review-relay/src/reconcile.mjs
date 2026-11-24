import { RELAY_REPO } from './constants.mjs';
import { reconcileAuthorized } from './reconcile-auth.mjs';
import { renderComment } from './comment.mjs';
import { applyEvidencePolicy, fixedHuman, normalizeDecision } from './policy.mjs';
import { evidenceKind } from './sanitize.mjs';

const TERMINAL_FAILURE = new Set(['ERROR', 'CANCELLED', 'EXPIRED']);

async function save(runtime, pr, record, next) {
  const saved = await runtime.store.commitPr(pr, record.version, next);
  if (!saved) {
    const error = new Error('relay state conflict');
    error.code = 'conflict';
    throw error;
  }
  return { ...next, version: record.version + 1 };
}

async function stopPending(runtime, pr, record, transition) {
  await save(runtime, pr, record, {
    ...record,
    stopped: transition,
    cursorLaunch: record.cursorLaunch ? { ...record.cursorLaunch, state: 'terminal' } : null,
  });
  await runtime.store.clearPending(pr);
  return { pr, transition };
}

export async function reconcilePending(runtime, nowMs = Date.now()) {
  const ids = await runtime.store.listPending(10);
  const results = [];
  for (const pr of ids) {
    try {
      results.push(await reconcileOne(runtime, pr, nowMs));
    } catch {
      results.push({ pr, transition: 'state_unreadable' });
    }
  }
  return results;
}

async function reconcileOne(runtime, pr, nowMs) {
  let record;
  try {
    record = await runtime.store.loadPr(pr);
  } catch {
    await runtime.store.clearPending(pr);
    return { pr, transition: 'state_unreadable' };
  }
  const launch = record.cursorLaunch;
  if (!launch || launch.state === 'terminal' || launch.state === 'failed' || launch.state === 'ambiguous') {
    await runtime.store.clearPending(pr);
    return { pr, transition: 'already_stopped' };
  }
  if (launch.state === 'claiming' || !launch.agentId || !launch.runId) {
    return stopPending(runtime, pr, record, 'cursor_launch_ambiguous');
  }
  const started = Date.parse(launch.launchedAt || '');
  if (!Number.isFinite(started) || nowMs - started > runtime.config.reconcileTimeoutMs) {
    return stopPending(runtime, pr, record, 'cursor_run_timeout');
  }
  const status = await runtime.readCursorRun(launch);
  if (!status || status.unknown || (status.terminal !== true && status.terminal !== false)) {
    const attempts = (launch.attempts || 0) + 1;
    if (attempts >= 5) return stopPending(runtime, pr, record, 'cursor_launch_ambiguous');
    await save(runtime, pr, record, { ...record, cursorLaunch: { ...launch, attempts } });
    return { pr, transition: 'cursor_run_active' };
  }
  if (!status.terminal) return { pr, transition: 'cursor_run_active' };
  if (TERMINAL_FAILURE.has(status.status)) return stopPending(runtime, pr, record, 'cursor_run_terminal_failed');

  const loaded = await runtime.loadPull(pr);
  if (!loaded?.ok || loaded.ctx?.repo !== RELAY_REPO) {
    return stopPending(runtime, pr, record, 'access_denied');
  }
  const head = loaded.ctx.sha;
  if (head === launch.sha) return stopPending(runtime, pr, record, 'cursor_finished_unchanged');
  if (record.reviewed.includes(head)) {
    await runtime.store.clearPending(pr);
    return { pr, transition: 'already_stopped' };
  }

  let evidence;
  try {
    evidence = await runtime.evidence({ ...loaded.ctx, pr, sha: head });
  } catch {
    evidence = null;
  }
  if (!evidence || evidence.noChecks || evidenceKind(evidence) === 'unknown') {
    const attempts = (launch.attempts || 0) + 1;
    if (attempts >= 3) return stopPending(runtime, pr, record, 'cursor_evidence_timeout');
    await save(runtime, pr, record, { ...record, cursorLaunch: { ...launch, attempts } });
    return { pr, transition: 'evidence_pending' };
  }
  let decision;
  try {
    const reviewed = await runtime.review({ evidence, untrusted: loaded.ctx.untrusted, config: runtime.config });
    decision = applyEvidencePolicy(normalizeDecision(reviewed.decision || reviewed), evidence);
  } catch {
    return stopPending(runtime, pr, record, 'api_failure_stopped');
  }
  if (decision.decision !== 'PASS') decision = fixedHuman('max_iterations');
  const transition = decision.decision === 'PASS' ? 'pass_stopped' : 'max_iterations_stopped';
  const next = {
    ...record,
    reviewed: [...record.reviewed, head],
    stopped: transition,
    capReviewed: true,
    cursorLaunch: { ...launch, state: 'terminal' },
  };
  await save(runtime, pr, record, next);
  await runtime.store.clearPending(pr);
  try {
    const body = renderComment({
      ...decision,
      sha: head,
      iteration: record.iterations,
      pr,
      maxIterations: runtime.config.maxIterations,
      handoff: 'api',
    });
    if (runtime.live) await runtime.postComment({ pr, body, now: nowMs });
    else runtime.onPlan(body);
  } catch {
    /* The terminal state is already stored, so a comment failure cannot relaunch. */
  }
  return { pr, transition };
}

export async function handleReconcile({ rawBody, headers, runtime, now = Date.now() }) {
  if (!reconcileAuthorized(rawBody, headers, runtime.config, now)) {
    return { httpStatus: 401, ok: false, transition: 'rejected_signature', results: [] };
  }
  const results = await reconcilePending(runtime, runtime.now ? runtime.now() : now);
  return { httpStatus: 200, ok: true, transition: 'reconciled', results };
}
