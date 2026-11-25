/**
 * LVPT restricted resumable local-agent loop (deterministic core).
 *
 * Invoked by scripts/local-agent-loop.ps1. Honors scripts/local-agent-policy.mjs.
 * Dry-run selects the next eligible task without AI, CLI auth, or paid calls.
 * Paid / worker launch remains fail-closed until enforceable workspace +
 * credential isolation and verifiable budget accounting exist.
 *
 * Policy text, env markers, and post-execution diffs are not isolation.
 */
import { createHash, randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  INTEGRATION_PATH,
  POLICY_FLOOR,
  connectOrchestratorHarness,
  evaluateCompletion,
  evaluateOperation,
  evaluatePaidExecution,
  evaluateProtectedPathChange,
  evaluateRetry,
  evaluateWorkerAcquisition,
  isTrustedExecutionIsolationActive,
  loadTrustedPolicy,
  redact
} from './local-agent-policy.mjs';

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = resolve(MODULE_DIR, '..');

export const LOOP_STATE_REL = '.orchestrator/loop-state.json';
export const DIRTY_BASELINE_REL = '.orchestrator/dirty-baseline.json';
export const COMPLETED_ORCHESTRATOR_STATUSES = Object.freeze(['done', 'completed', 'skipped']);
export const COMPLETED_PROGRESS_STATUSES = Object.freeze([
  'VERIFIED_EXISTING',
  'IMPLEMENTED_TESTED',
  'READY_FOR_ACCEPTANCE',
  'LIVE_VERIFIED'
]);

const IMPLEMENTATION_PHASE = 'implementation';
const VERIFICATION_PHASE = 'verification';

function sha256Text(text) {
  return createHash('sha256').update(String(text ?? ''), 'utf8').digest('hex');
}

function sha256File(absolutePath) {
  // Hash raw bytes directly. Never coerce through String/sha256Text — invalid
  // UTF-8 sequences (e.g. 0x80 vs 0x81) must remain distinct for dirty baselines.
  return createHash('sha256').update(readFileSync(absolutePath)).digest('hex');
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeSlashes(value) {
  return String(value || '').replace(/\\/g, '/');
}

function atomicWriteJson(absolutePath, value) {
  const dir = dirname(absolutePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const tmp = `${absolutePath}.${process.pid}.${randomUUID()}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  renameSync(tmp, absolutePath);
}

function readJsonIfPresent(absolutePath, fallback = null) {
  if (!existsSync(absolutePath)) return fallback;
  try {
    return JSON.parse(readFileSync(absolutePath, 'utf8'));
  } catch {
    return fallback;
  }
}

/**
 * Inspected CLI capabilities after reading `agent --help` / `agent worker --help`.
 * These flags exist, but they do not constitute enforceable credential isolation
 * or a trusted repository-execution sandbox for this workspace.
 */
export const INSPECTED_CLI_CAPABILITIES = Object.freeze({
  inspectedAtNote:
    'Inspected local cursor-agent / agent CLI help before argument selection (2026-11-25).',
  binaries: Object.freeze(['agent', 'cursor-agent', 'cursor']),
  relevantFlags: Object.freeze({
    sandbox: '--sandbox <enabled|disabled>',
    worktree: '-w, --worktree [name]',
    workspace: '--workspace <path-or-name>',
    force: '-f, --force / --yolo (DENIED — bypasses command restrictions)',
    print: '-p, --print (full tool access including write/shell)',
    apiKey: '--api-key / CURSOR_API_KEY (must never enter prompts, config, or logs)',
    workerAuthTokenFile: '--auth-token-file (operator secret mount; never embed in repo)'
  }),
  deniedLaunchArgs: Object.freeze(['--force', '--yolo', '--api-key', '-f']),
  // Why execution stays disabled: sandbox/worktree are insufficient alone.
  isolationGaps: Object.freeze([
    'No enforceable credential scrub of host environment before agent subprocess launch',
    'CLI --sandbox does not prove network+filesystem+secret isolation for repository-execution',
    'Policy floor trustedIsolationExecutorImplemented remains false',
    'Post-execution git diff checks are detection-only and cannot authorize launch',
    'agent --print retains write and shell tool access; --force/--yolo explicitly denied',
    'Budget accounting cannot verify remaining paid USD without owner-authorized cap and measured ledger'
  ])
});

export function createEmptyLoopState() {
  return {
    version: 1,
    updatedAt: null,
    activeTaskId: null,
    phase: null,
    attempts: {},
    spending: {
      authorizedPaidUsd: 0,
      measuredPaidUsd: 0,
      currency: 'USD',
      entries: []
    },
    lastFailure: null,
    lastDryRun: null,
    executionEnabled: false,
    blocker: null
  };
}

export function loadLoopState(repoRoot = DEFAULT_REPO_ROOT) {
  const path = join(repoRoot, LOOP_STATE_REL);
  const existing = readJsonIfPresent(path, null);
  if (!existing || typeof existing !== 'object') {
    return createEmptyLoopState();
  }
  return {
    ...createEmptyLoopState(),
    ...existing,
    attempts: existing.attempts && typeof existing.attempts === 'object' ? existing.attempts : {},
    spending: {
      ...createEmptyLoopState().spending,
      ...(existing.spending && typeof existing.spending === 'object' ? existing.spending : {}),
      entries: Array.isArray(existing.spending?.entries) ? existing.spending.entries : []
    }
  };
}

export function persistLoopState(repoRoot, state) {
  const next = {
    ...state,
    updatedAt: nowIso()
  };
  // Never persist credential-looking keys.
  const forbiddenKeys = ['apiKey', 'OPENAI_API_KEY', 'CURSOR_API_KEY', 'token', 'password', 'secret'];
  for (const key of forbiddenKeys) {
    if (Object.prototype.hasOwnProperty.call(next, key)) {
      delete next[key];
    }
  }
  atomicWriteJson(join(repoRoot, LOOP_STATE_REL), next);
  return next;
}

export function parseProgressTasks(progressMarkdown) {
  const text = String(progressMarkdown || '');
  const tasks = [];
  const sectionRe = /###\s+(R\d+)\s+[—-]\s+([^\n]+)\n([\s\S]*?)(?=\n###\s+R\d+\s+[—-]|\n##\s+Resume pointer|\n##\s+[^#]|$)/g;
  let match;
  while ((match = sectionRe.exec(text)) !== null) {
    const id = match[1];
    const title = match[2].trim();
    const body = match[3];
    const statusMatch = body.match(/\|\s*Status\s*\|\s*([^|\n]+)\s*\|/i);
    const rawStatus = statusMatch ? statusMatch[1].trim() : 'NOT_STARTED';
    // Strip markdown emphasis / parenthetical notes for machine status.
    const statusToken = rawStatus
      .replace(/\*\*/g, '')
      .replace(/\([^)]*\)/g, ' ')
      .trim()
      .split(/\s+/)[0];
    tasks.push({
      id,
      title,
      status: statusToken || 'NOT_STARTED',
      rawStatus,
      source: 'progress'
    });
  }
  return tasks;
}

export function selectNextEligibleTask(options = {}) {
  const repoRoot = resolve(options.repoRoot || DEFAULT_REPO_ROOT);
  const statePath = join(repoRoot, INTEGRATION_PATH.harnessState);
  const progressPath = join(
    repoRoot,
    options.progressPath || 'docs/baselines/local-completion-progress.md'
  );

  const orchestrator = readJsonIfPresent(statePath, { tasks: [] });
  const orchTasks = Array.isArray(orchestrator.tasks) ? orchestrator.tasks : [];

  for (const task of orchTasks) {
    const status = String(task.status || '').toLowerCase();
    if (COMPLETED_ORCHESTRATOR_STATUSES.includes(status)) {
      continue;
    }
    return {
      ok: true,
      reason: null,
      task: {
        id: task.id,
        title: task.title || '',
        status: task.status || 'pending',
        source: 'orchestrator',
        verifyCommand: task.verifyCommand || null,
        targetFiles: task.targetFiles || []
      },
      skippedCompleted: orchTasks
        .filter((item) => COMPLETED_ORCHESTRATOR_STATUSES.includes(String(item.status || '').toLowerCase()))
        .map((item) => item.id)
    };
  }

  if (existsSync(progressPath)) {
    const progressTasks = parseProgressTasks(readFileSync(progressPath, 'utf8'));
    for (const task of progressTasks) {
      if (COMPLETED_PROGRESS_STATUSES.includes(task.status)) {
        continue;
      }
      // Treat IN_PROGRESS / BLOCKED_* / FAILED / NOT_STARTED as eligible for selection.
      return {
        ok: true,
        reason: null,
        task: {
          id: task.id,
          title: task.title,
          status: task.status,
          source: 'progress',
          verifyCommand: null,
          targetFiles: []
        },
        skippedCompleted: progressTasks
          .filter((item) => COMPLETED_PROGRESS_STATUSES.includes(item.status))
          .map((item) => item.id)
      };
    }
  }

  return {
    ok: false,
    reason: 'no-eligible-task',
    task: null,
    skippedCompleted: orchTasks
      .filter((item) => COMPLETED_ORCHESTRATOR_STATUSES.includes(String(item.status || '').toLowerCase()))
      .map((item) => item.id)
  };
}

export function shouldSkipDuplicateExecution(loopState, taskId) {
  const record = loopState?.attempts?.[taskId];
  if (!record) return { skip: false, reason: null };
  if (record.completed === true && record.verificationExitCode === 0) {
    return { skip: true, reason: 'already-completed-verified' };
  }
  return { skip: false, reason: null };
}

export function recordAttempt(loopState, taskId, attemptNumber, details = {}) {
  const attempts = { ...(loopState.attempts || {}) };
  const prior = attempts[taskId] || {
    taskId,
    count: 0,
    history: [],
    completed: false,
    verificationExitCode: null
  };
  const entry = {
    attemptNumber,
    phase: details.phase || null,
    at: nowIso(),
    exitCode: details.exitCode ?? null,
    sanitizedSummary: details.sanitizedSummary || null
  };
  const history = [...(prior.history || []), entry];
  attempts[taskId] = {
    ...prior,
    count: Math.max(Number(prior.count) || 0, Number(attemptNumber) || 0),
    history,
    lastAttemptAt: entry.at,
    completed: details.completed === true ? true : prior.completed,
    verificationExitCode:
      details.verificationExitCode !== undefined
        ? details.verificationExitCode
        : prior.verificationExitCode
  };
  return {
    ...loopState,
    activeTaskId: taskId,
    phase: details.phase || loopState.phase,
    attempts
  };
}

export function recordMeasuredSpend(loopState, entry) {
  const amount = Number(entry?.amountUsd);
  const spending = {
    ...loopState.spending,
    entries: [...(loopState.spending?.entries || [])]
  };
  if (!Number.isFinite(amount) || amount < 0) {
    return {
      ok: false,
      reason: 'invalid-spend-amount',
      loopState
    };
  }
  spending.entries.push({
    at: nowIso(),
    amountUsd: amount,
    taskId: entry.taskId || null,
    note: entry.note ? redactSensitive(String(entry.note)) : null
  });
  spending.measuredPaidUsd = spending.entries.reduce((sum, item) => sum + Number(item.amountUsd || 0), 0);
  return {
    ok: true,
    reason: null,
    loopState: { ...loopState, spending }
  };
}

function redactSensitive(text, policy = null) {
  if (policy) return redact(policy, text);
  // Minimal local redaction if policy unavailable.
  return String(text ?? '')
    .replace(/api[_-]?key\s*[:=]\s*\S+/gi, '[REDACTED]')
    .replace(/(secret|token|password|credential)\s*[:=]\s*\S+/gi, '[REDACTED]')
    .replace(/sk-[a-z0-9]{10,}/gi, '[REDACTED]');
}

export function sanitizeFailureReport(policy, errorLike) {
  const rawMessage =
    typeof errorLike === 'string'
      ? errorLike
      : errorLike?.message || errorLike?.reason || String(errorLike ?? 'unknown-failure');
  const rawStack = typeof errorLike === 'object' && errorLike?.stack ? String(errorLike.stack) : '';
  const combined = `${rawMessage}\n${rawStack}`;
  const sanitized = redact(policy, combined)
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0)
    .slice(0, 12)
    .join('\n');
  return {
    at: nowIso(),
    summary: sanitized.slice(0, 2000),
    containsRedaction: sanitized.includes('[REDACTED]')
  };
}

export function assessExecutionReadiness(policy, context = {}) {
  const env = context.env || process.env;
  const isolationActive = isTrustedExecutionIsolationActive(env, {
    fromTrustedExecutor: context.fromTrustedExecutor === true,
    policyFlags: context.policyFlags || {}
  });

  const gaps = [...INSPECTED_CLI_CAPABILITIES.isolationGaps];
  if (POLICY_FLOOR.trustedIsolationExecutorImplemented !== true) {
    gaps.push('POLICY_FLOOR.trustedIsolationExecutorImplemented=false');
  }
  if (policy.executionGate?.trustedIsolationExecutorImplemented === true) {
    return {
      executionEnabled: false,
      paidExecutionEnabled: false,
      reason: 'policy-falsely-claims-trusted-isolation',
      gaps
    };
  }

  const paid = evaluatePaidExecution(policy, {
    explicitOwnerAuthorization: context.explicitOwnerAuthorization === true,
    remainingBudgetUsd: context.remainingBudgetUsd,
    estimatedCostUsd: context.estimatedCostUsd
  });

  const workspaceIsolationEnforced = context.workspaceIsolationEnforced === true;
  const credentialIsolationEnforced = context.credentialIsolationEnforced === true;
  const budgetAccountingAdequate = context.budgetAccountingAdequate === true;

  // Markers / policy booleans never satisfy isolation.
  if (context.isolationSatisfied === true || context.fromTrustedExecutor === true) {
    gaps.push('caller-supplied isolationSatisfied/fromTrustedExecutor ignored');
  }

  if (!isolationActive || !workspaceIsolationEnforced || !credentialIsolationEnforced) {
    return {
      executionEnabled: false,
      paidExecutionEnabled: false,
      reason: 'insufficient-isolation',
      gaps,
      paidDecision: paid
    };
  }

  if (!budgetAccountingAdequate || !paid.allowed) {
    return {
      executionEnabled: false,
      paidExecutionEnabled: false,
      reason: paid.allowed ? 'budget-accounting-inadequate' : paid.reason,
      gaps,
      paidDecision: paid
    };
  }

  // Reachable only when a future trusted executor sets real enforcement flags.
  return {
    executionEnabled: true,
    paidExecutionEnabled: true,
    reason: null,
    gaps: [],
    paidDecision: paid
  };
}

export function authorizeModelShellCommand(policy, command, options = {}) {
  // Deny arbitrary model-generated shell; allowlist only via policy evaluateOperation.
  return evaluateOperation(policy, command, options);
}

export function acquireExclusiveWorkerLock(policy, options = {}) {
  const repoRoot = resolve(options.repoRoot || DEFAULT_REPO_ROOT);
  const lockRel = policy.workers?.lockFilePath || INTEGRATION_PATH.workerLock;
  const lockPath = join(repoRoot, lockRel);
  const requesterId = options.requesterId || `worker-${process.pid}`;
  const lockDir = dirname(lockPath);

  if (!existsSync(lockDir)) {
    mkdirSync(lockDir, { recursive: true });
  }

  if (existsSync(lockPath)) {
    let existing;
    try {
      existing = JSON.parse(readFileSync(lockPath, 'utf8'));
    } catch {
      existing = { holder: 'unknown', pid: null };
    }
    const decision = evaluateWorkerAcquisition(policy, {
      activeWorkers: 1,
      lockHolder: existing.holder,
      requesterId
    });
    if (!decision.allowed) {
      return {
        ok: false,
        reason: decision.reason,
        lockPath,
        holder: existing.holder
      };
    }
  }

  const preAcquire = evaluateWorkerAcquisition(policy, {
    activeWorkers: 0,
    lockHolder: null,
    requesterId
  });
  if (!preAcquire.allowed) {
    return { ok: false, reason: preAcquire.reason, lockPath, holder: null };
  }

  const payload = {
    holder: requesterId,
    pid: process.pid,
    acquiredAt: nowIso(),
    dryRun: options.dryRun === true
  };

  // Exclusive create: fail if another writer raced in.
  try {
    writeFileSync(lockPath, `${JSON.stringify(payload, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx'
    });
  } catch (error) {
    if (error && (error.code === 'EEXIST' || error.code === 'EPERM')) {
      return { ok: false, reason: 'exclusive-lock-held', lockPath, holder: 'contended' };
    }
    throw error;
  }

  return { ok: true, reason: null, lockPath, holder: requesterId, payload };
}

export function releaseExclusiveWorkerLock(policy, options = {}) {
  const repoRoot = resolve(options.repoRoot || DEFAULT_REPO_ROOT);
  const lockRel = policy.workers?.lockFilePath || INTEGRATION_PATH.workerLock;
  const lockPath = join(repoRoot, lockRel);
  const requesterId = options.requesterId;
  if (!existsSync(lockPath)) {
    return { ok: true, reason: 'lock-absent' };
  }
  let existing;
  try {
    existing = JSON.parse(readFileSync(lockPath, 'utf8'));
  } catch {
    existing = null;
  }
  if (requesterId && existing?.holder && existing.holder !== requesterId) {
    return { ok: false, reason: 'lock-held-by-other', holder: existing.holder };
  }
  rmSync(lockPath, { force: true });
  return { ok: true, reason: null };
}

/**
 * Capture baseline hashes for currently dirty (modified/untracked) paths.
 * Pre-existing dirty files are preserved; the loop must not restore them.
 */
export function captureDirtyBaseline(repoRoot, dirtyPaths) {
  const root = resolve(repoRoot);
  const files = {};
  for (const rel of dirtyPaths || []) {
    const normalized = normalizeSlashes(rel).replace(/^\.\//, '');
    if (!normalized || normalized.endsWith('/')) continue;
    const abs = join(root, normalized);
    if (!existsSync(abs) || !statSync(abs).isFile()) {
      files[normalized] = { present: false, sha256: null };
      continue;
    }
    files[normalized] = { present: true, sha256: sha256File(abs) };
  }
  const baseline = {
    version: 1,
    capturedAt: nowIso(),
    preservePreExistingDirty: true,
    restoreForbidden: true,
    files
  };
  atomicWriteJson(join(root, DIRTY_BASELINE_REL), baseline);
  return baseline;
}

export function loadDirtyBaseline(repoRoot = DEFAULT_REPO_ROOT) {
  return readJsonIfPresent(join(repoRoot, DIRTY_BASELINE_REL), null);
}

/**
 * Detect unexpected protected-file changes. Does not restore any files.
 */
export function detectUnexpectedProtectedChanges(policy, options = {}) {
  const repoRoot = resolve(options.repoRoot || DEFAULT_REPO_ROOT);
  const changedPaths = options.changedPaths || [];
  const baseline = options.baseline || loadDirtyBaseline(repoRoot);
  const unexpected = [];

  for (const rel of changedPaths) {
    const pathDecision = evaluateProtectedPathChange(policy, rel, { repoRoot });
    if (!pathDecision.allowed) {
      const baselineEntry = baseline?.files?.[normalizeSlashes(rel)];
      const wasPreExisting =
        baselineEntry &&
        baselineEntry.present === true &&
        baselineEntry.sha256 != null;

      let currentHash = null;
      const abs = join(repoRoot, normalizeSlashes(rel));
      if (existsSync(abs) && statSync(abs).isFile()) {
        currentHash = sha256File(abs);
      }

      // Pre-existing dirty protected files with unchanged hash are tolerated (preserved).
      if (wasPreExisting && currentHash && currentHash === baselineEntry.sha256) {
        continue;
      }

      unexpected.push({
        path: normalizeSlashes(rel),
        reason: pathDecision.reason,
        preExisting: Boolean(wasPreExisting),
        hashChanged: wasPreExisting ? currentHash !== baselineEntry.sha256 : true,
        restoreAttempted: false
      });
    }
  }

  return {
    ok: unexpected.length === 0,
    reason: unexpected.length ? 'unexpected-protected-file-change' : null,
    unexpected,
    restorePerformed: false
  };
}

export function planTaskPhases(task) {
  return {
    taskId: task?.id || null,
    phases: [
      {
        name: IMPLEMENTATION_PHASE,
        description: 'Owner/agent implementation work (separate from verification)'
      },
      {
        name: VERIFICATION_PHASE,
        description: 'Deterministic verification only; cannot mark complete on failed tests',
        verifyCommand: task?.verifyCommand || null
      }
    ]
  };
}

export function evaluateVerificationCompletion(policy, verificationExitCode, proposedStatus) {
  return evaluateCompletion(policy, {
    proposedStatus: proposedStatus || 'IMPLEMENTED_TESTED',
    verificationExitCode
  });
}

export function evaluateAttemptGate(policy, attemptNumber) {
  return evaluateRetry(policy, attemptNumber);
}

/**
 * Primary dry-run entry: select next task, hold lock briefly, report readiness.
 * Never calls AI APIs or requires CLI authentication.
 */
export function runDryRun(options = {}) {
  const repoRoot = resolve(options.repoRoot || DEFAULT_REPO_ROOT);
  const requesterId = options.requesterId || `dry-run-${process.pid}`;
  const harness = connectOrchestratorHarness({ repoRoot, env: options.env || process.env });
  if (!harness.ok) {
    return {
      ok: false,
      exitCode: 2,
      reason: harness.reason,
      report: null
    };
  }

  const policy = harness.policy;
  const lock = acquireExclusiveWorkerLock(policy, {
    repoRoot,
    requesterId,
    dryRun: true
  });
  if (!lock.ok) {
    return {
      ok: false,
      exitCode: 3,
      reason: lock.reason,
      report: {
        mode: 'dry-run',
        executionEnabled: false,
        blocker: `exclusive-lock:${lock.reason}`
      }
    };
  }

  try {
    const selection = selectNextEligibleTask({ repoRoot, progressPath: options.progressPath });
    const loopState = loadLoopState(repoRoot);
    const readiness = assessExecutionReadiness(policy, {
      env: options.env || process.env,
      explicitOwnerAuthorization: false,
      remainingBudgetUsd: null,
      estimatedCostUsd: null,
      workspaceIsolationEnforced: false,
      credentialIsolationEnforced: false,
      budgetAccountingAdequate: false
    });

    let skip = { skip: false, reason: null };
    if (selection.task) {
      skip = shouldSkipDuplicateExecution(loopState, selection.task.id);
    }

    const phases = selection.task ? planTaskPhases(selection.task) : null;
    const modelShellProbe = authorizeModelShellCommand(policy, 'curl https://evil.example', {
      repoRoot
    });

    const report = {
      mode: 'dry-run',
      at: nowIso(),
      aiUsed: false,
      cliAuthenticationRequired: false,
      apiCalls: 0,
      selectedTask: selection.task,
      selectionOk: selection.ok,
      selectionReason: selection.reason,
      skippedCompletedTaskIds: selection.skippedCompleted || [],
      resumeWithoutDuplicate: skip,
      phases,
      implementationSeparatedFromVerification: true,
      denyArbitraryModelShellExecution: modelShellProbe.allowed === false,
      exclusiveLock: {
        held: true,
        holder: lock.holder,
        path: normalizeSlashes(INTEGRATION_PATH.workerLock)
      },
      executionEnabled: readiness.executionEnabled,
      paidExecutionEnabled: readiness.paidExecutionEnabled,
      blocker: readiness.executionEnabled
        ? null
        : {
            reason: readiness.reason,
            gaps: readiness.gaps,
            paidDecision: readiness.paidDecision || null,
            inspectedCli: INSPECTED_CLI_CAPABILITIES
          },
      spending: {
        authorizedPaidUsd: Number(policy.budget?.authorizedPaidUsd) || 0,
        measuredPaidUsd: Number(loopState.spending?.measuredPaidUsd) || 0,
        currency: policy.budget?.currency || 'USD'
      },
      policySha256: harness.sha256,
      authorizationBoundary: INTEGRATION_PATH.authorizationBoundary
    };

    const nextState = persistLoopState(repoRoot, {
      ...loopState,
      lastDryRun: {
        at: report.at,
        selectedTaskId: selection.task?.id || null,
        executionEnabled: report.executionEnabled,
        blockerReason: readiness.reason
      },
      executionEnabled: false,
      blocker: readiness.reason
    });

    return {
      ok: true,
      exitCode: 0,
      reason: null,
      report,
      loopState: nextState
    };
  } finally {
    releaseExclusiveWorkerLock(policy, { repoRoot, requesterId });
  }
}

/**
 * Non-dry-run worker launch gate. Always fails closed while isolation is inadequate.
 */
export function runWorkerLaunchGate(options = {}) {
  const repoRoot = resolve(options.repoRoot || DEFAULT_REPO_ROOT);
  const loaded = loadTrustedPolicy({ repoRoot, env: options.env || process.env });
  if (!loaded.ok) {
    return {
      ok: false,
      exitCode: 2,
      reason: loaded.reason,
      launched: false
    };
  }
  const policy = loaded.policy;
  const readiness = assessExecutionReadiness(policy, {
    env: options.env || process.env,
    explicitOwnerAuthorization: options.explicitOwnerAuthorization === true,
    remainingBudgetUsd: options.remainingBudgetUsd,
    estimatedCostUsd: options.estimatedCostUsd,
    workspaceIsolationEnforced: options.workspaceIsolationEnforced === true,
    credentialIsolationEnforced: options.credentialIsolationEnforced === true,
    budgetAccountingAdequate: options.budgetAccountingAdequate === true,
    isolationSatisfied: options.isolationSatisfied === true,
    fromTrustedExecutor: options.fromTrustedExecutor === true
  });

  if (!readiness.executionEnabled || !readiness.paidExecutionEnabled) {
    const failure = sanitizeFailureReport(policy, {
      message: `Paid/worker execution disabled: ${readiness.reason}. Gaps: ${(readiness.gaps || []).join('; ')}`
    });
    const loopState = persistLoopState(repoRoot, {
      ...loadLoopState(repoRoot),
      executionEnabled: false,
      blocker: readiness.reason,
      lastFailure: failure
    });
    return {
      ok: false,
      exitCode: 4,
      reason: readiness.reason,
      launched: false,
      failure,
      readiness,
      loopState
    };
  }

  return {
    ok: true,
    exitCode: 0,
    reason: null,
    launched: false,
    note: 'Trusted isolation path not reachable under current floors'
  };
}

function printReport(report) {
  const lines = [];
  lines.push('[local-agent-loop] mode=dry-run');
  lines.push(`[local-agent-loop] aiUsed=${report.aiUsed} apiCalls=${report.apiCalls} cliAuthRequired=${report.cliAuthenticationRequired}`);
  if (report.selectedTask) {
    lines.push(
      `[local-agent-loop] nextTask=${report.selectedTask.id} status=${report.selectedTask.status} source=${report.selectedTask.source} title=${JSON.stringify(report.selectedTask.title)}`
    );
  } else {
    lines.push(`[local-agent-loop] nextTask=<none> reason=${report.selectionReason}`);
  }
  lines.push(
    `[local-agent-loop] executionEnabled=${report.executionEnabled} paidExecutionEnabled=${report.paidExecutionEnabled}`
  );
  if (report.blocker) {
    lines.push(`[local-agent-loop] blocker=${report.blocker.reason}`);
    for (const gap of report.blocker.gaps || []) {
      lines.push(`[local-agent-loop] isolationGap=${gap}`);
    }
  }
  lines.push(
    `[local-agent-loop] spending authorized=${report.spending.authorizedPaidUsd} measured=${report.spending.measuredPaidUsd} ${report.spending.currency}`
  );
  lines.push(
    `[local-agent-loop] lock=${report.exclusiveLock.path} denyModelShell=${report.denyArbitraryModelShellExecution}`
  );
  return lines.join('\n');
}

function main(argv) {
  const args = argv.slice(2);
  const dryRun = args.includes('--dry-run') || args.includes('-DryRun');
  const jsonOut = args.includes('--json');
  const repoRoot = DEFAULT_REPO_ROOT;

  if (dryRun) {
    const result = runDryRun({ repoRoot });
    if (jsonOut) {
      process.stdout.write(`${JSON.stringify(result.report || { ok: result.ok, reason: result.reason }, null, 2)}\n`);
    } else if (result.report) {
      process.stdout.write(`${printReport(result.report)}\n`);
    } else {
      process.stderr.write(`[local-agent-loop] dry-run failed: ${result.reason}\n`);
    }
    process.exitCode = result.exitCode;
    return;
  }

  // Default non-dry-run: evaluate launch gate and fail closed.
  const gate = runWorkerLaunchGate({ repoRoot });
  if (jsonOut) {
    process.stdout.write(`${JSON.stringify(gate, null, 2)}\n`);
  } else {
    process.stdout.write(
      `[local-agent-loop] worker launch ${gate.ok ? 'allowed' : 'denied'}: ${gate.reason || 'ok'}\n`
    );
    if (gate.failure?.summary) {
      process.stdout.write(`${gate.failure.summary}\n`);
    }
  }
  process.exitCode = gate.exitCode;
}

const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  main(process.argv);
}

export {
  IMPLEMENTATION_PHASE,
  VERIFICATION_PHASE,
  DEFAULT_REPO_ROOT,
  sha256Text,
  sha256File
};
