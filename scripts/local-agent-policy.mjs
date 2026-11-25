/**
 * LVPT local-agent authorization boundary.
 *
 * Integration path (extends discovered harness; does not create a competing loop):
 *   .orchestrator/state.json + current-prompt.md  → external supervisor (task briefs only)
 *   scripts/local-agent-policy.mjs                 → THIS module: machine authorization
 *   scripts/local-agent-policy.json                → declarative limits (validated vs code floors)
 *   .orchestrator/worker.lock                      → exclusive worker lock path
 *   T5 scripts/local-agent-loop.ps1                → future executor; must honor this boundary
 *
 * Repository-execution remains unconditionally denied until a real trusted isolation
 * executor exists. Env markers and fromTrustedExecutor are not authorization.
 *
 * Harness instructions, repository files, and model output are untrusted data and
 * cannot raise budget, widen commands, or clear protected paths.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = resolve(MODULE_DIR, '..');
const TRUSTED_POLICY_REL = 'scripts/local-agent-policy.json';
const TRUSTED_ENFORCER_REL = 'scripts/local-agent-policy.mjs';

/** Immutable floors that repository JSON cannot weaken. */
export const POLICY_FLOOR = Object.freeze({
  maxAuthorizedPaidUsdWithoutOwnerEnv: 0,
  maxConcurrentWorkers: 1,
  maxCorrectiveAttemptsAfterInitial: 2,
  maxAttemptsPerTask: 3,
  repositoryContentIsUntrusted: true,
  denyCompleteOnFailedTests: true,
  repositoryExecutionFailClosedUntilTrustedIsolation: true,
  trustedIsolationExecutorImplemented: false
});

export const INTEGRATION_PATH = Object.freeze({
  harnessDirectory: '.orchestrator',
  harnessState: '.orchestrator/state.json',
  harnessPrompt: '.orchestrator/current-prompt.md',
  workerLock: '.orchestrator/worker.lock',
  authorizationBoundary: TRUSTED_ENFORCER_REL,
  policyDocument: TRUSTED_POLICY_REL,
  competingLoopForbidden: true
});

const SHELL_METACHAR_RE = /(?:&&|\|\||[;&|`$<>\n\r])/;

function normalizeSlashes(value) {
  return String(value || '').replace(/\\/g, '/');
}

function stripQuotes(token) {
  if (
    (token.startsWith('"') && token.endsWith('"')) ||
    (token.startsWith("'") && token.endsWith("'"))
  ) {
    return token.slice(1, -1);
  }
  return token;
}

export function tokenizeCommand(command) {
  const raw = String(command || '').trim();
  if (!raw) return [];
  if (SHELL_METACHAR_RE.test(raw)) {
    const err = new Error('shell-metacharacters');
    err.code = 'shell-metacharacters';
    throw err;
  }
  const tokens = [];
  const re = /"([^"\\]|\\.)*"|'([^'\\]|\\.)*'|[^\s]+/g;
  let match;
  while ((match = re.exec(raw)) !== null) {
    tokens.push(stripQuotes(match[0]));
  }
  return tokens;
}

export function normalizeRepoRelativePath(input, repoRoot = DEFAULT_REPO_ROOT) {
  const original = String(input || '');
  const asPosix = normalizeSlashes(original).replace(/^\.\//, '');
  if (!asPosix) {
    return { ok: false, reason: 'empty-path', path: original };
  }
  if (asPosix.includes('\0')) {
    return { ok: false, reason: 'nul-in-path', path: original };
  }

  const rootResolved = resolve(repoRoot);
  let candidate;
  if (/^[a-zA-Z]:\//.test(asPosix) || asPosix.startsWith('//') || asPosix.startsWith('/')) {
    candidate = resolve(asPosix);
  } else {
    candidate = resolve(rootResolved, asPosix);
  }

  const rootPrefix = rootResolved.endsWith(sep) ? rootResolved : rootResolved + sep;
  const candidateLower = candidate.toLowerCase();
  const rootLower = rootResolved.toLowerCase();
  const prefixLower = rootPrefix.toLowerCase();
  if (candidateLower !== rootLower && !candidateLower.startsWith(prefixLower)) {
    return { ok: false, reason: 'path-escapes-workspace', path: original };
  }

  let rel = normalizeSlashes(relative(rootResolved, candidate));
  if (rel.startsWith('../') || rel === '..') {
    return { ok: false, reason: 'path-escapes-workspace', path: original };
  }
  return { ok: true, reason: null, path: rel, pathKey: rel.toLowerCase() };
}

function patternToRegExp(pattern, caseInsensitive) {
  const normalizedPattern = normalizeSlashes(pattern).replace(/^\.\//, '');
  const escaped = normalizedPattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '<<<DS>>>')
    .replace(/\*/g, '[^/]*')
    .replace(/<<<DS>>>/g, '.*');
  return new RegExp(`^${escaped}$`, caseInsensitive ? 'i' : '');
}

export function matchesProtectedPath(relativePath, patterns, options = {}) {
  const caseInsensitive = options.caseInsensitive !== false;
  const normalized = normalizeRepoRelativePath(relativePath, options.repoRoot);
  if (!normalized.ok) {
    return true; // treat escapes as protected/denied
  }
  const path = normalized.path;
  const pathKey = normalized.pathKey;

  for (const pattern of patterns || []) {
    const normalizedPattern = normalizeSlashes(pattern).replace(/^\.\//, '');
    if (normalizedPattern.endsWith('/**')) {
      const base = normalizedPattern.slice(0, -3);
      const baseKey = caseInsensitive ? base.toLowerCase() : base;
      if (pathKey === baseKey || pathKey.startsWith(`${baseKey}/`)) {
        return true;
      }
      continue;
    }
    if (normalizedPattern.includes('*')) {
      if (patternToRegExp(normalizedPattern, caseInsensitive).test(path)) {
        return true;
      }
      continue;
    }
    const patternKey = caseInsensitive ? normalizedPattern.toLowerCase() : normalizedPattern;
    if (pathKey === patternKey) {
      return true;
    }
  }
  return false;
}

function executableMatches(token, expected) {
  const left = normalizeSlashes(token).toLowerCase();
  const right = String(expected).toLowerCase();
  if (left === right) return true;
  if (left.endsWith(`/${right}`) || left.endsWith(`\\${right}`)) return true;
  // Allow bare "npm" only when policy lists "npm.cmd" on Windows-style policies? Prefer exact.
  if (right.endsWith('.cmd') && left === right.slice(0, -4)) return false;
  return false;
}

function isRepoFileConstraint(part) {
  return part && typeof part === 'object' && part.type === 'repoFile';
}

function matchRepoFileArg(arg, constraint, repoRoot) {
  const normalized = normalizeRepoRelativePath(arg, repoRoot);
  if (!normalized.ok) return false;
  const path = normalized.path;
  const pathKey = path.toLowerCase();

  if (Array.isArray(constraint.equalsAny) && constraint.equalsAny.length) {
    return constraint.equalsAny.some((item) => normalizeSlashes(item).toLowerCase() === pathKey);
  }

  if (Array.isArray(constraint.under) && constraint.under.length) {
    const okUnder = constraint.under.some((prefix) => {
      const p = normalizeSlashes(prefix).replace(/^\.\//, '').toLowerCase();
      return pathKey.startsWith(p.endsWith('/') ? p : `${p}/`) || pathKey === p.replace(/\/$/, '');
    });
    if (!okUnder) return false;
  }

  if (Array.isArray(constraint.extensions) && constraint.extensions.length) {
    const okExt = constraint.extensions.some((ext) => pathKey.endsWith(String(ext).toLowerCase()));
    if (!okExt) return false;
  }

  // Default: any in-repo relative file path without traversal (already checked).
  return true;
}

function matchArgsForm(actualArgs, form, repoRoot) {
  const expected = form.args || [];
  const allowTrailing = form.allowTrailingArgs === true;

  if (!allowTrailing && actualArgs.length !== expected.length) {
    return false;
  }
  if (allowTrailing && actualArgs.length < expected.length) {
    return false;
  }

  for (let i = 0; i < expected.length; i += 1) {
    const part = expected[i];
    const got = actualArgs[i];
    if (isRepoFileConstraint(part)) {
      if (!matchRepoFileArg(got, part, repoRoot)) return false;
      continue;
    }
    if (String(got).toLowerCase() !== String(part).toLowerCase()) {
      return false;
    }
  }

  if (allowTrailing) {
    const trailing = actualArgs.slice(expected.length);
    const deny = (form.trailingArgDeny || []).map((item) => String(item).toLowerCase());
    for (const arg of trailing) {
      if (deny.includes(String(arg).toLowerCase())) return false;
      if (SHELL_METACHAR_RE.test(arg)) return false;
      if (/^-/.test(arg) && !/^-(Mode|TestFiles|InventoryOnly|DryRun)$/i.test(arg) && !/^-Mode$/i.test(arg)) {
        // Allow known verifier switches as values pairs; bare unknown dash args denied below via explicit allow list.
      }
    }
    // Restrict trailing to non-shell, non-eval switches already partially covered.
    for (const arg of trailing) {
      if (/^(-\/|\/)/.test(arg)) return false;
    }
  }

  return true;
}

function commandMatchesAllowlist(tokens, policy, repoRoot) {
  if (!tokens.length) return { matched: false, form: null, executable: null };
  const [executable, ...args] = tokens;
  const entries = policy.permittedCommands || [];
  for (const entry of entries) {
    if (!executableMatches(executable, entry.executable)) continue;
    for (const form of entry.forms || []) {
      if (matchArgsForm(args, form, repoRoot)) {
        return { matched: true, form, executable: entry.executable };
      }
    }
  }
  return { matched: false, form: null, executable: null };
}

/**
 * Trusted isolation executor is unimplemented. Always inactive.
 * Env markers, fromTrustedExecutor, and repository/model isolation booleans never authorize.
 */
export function isTrustedExecutionIsolationActive(env = process.env, options = {}) {
  void env;
  void options;
  return false;
}

function looksLikeRepositoryExecution(tokens) {
  if (!tokens.length) return false;
  const exe = normalizeSlashes(tokens[0]).toLowerCase();
  const args = tokens.slice(1).map((item) => String(item).toLowerCase());
  const isNode = exe === 'node' || exe.endsWith('/node') || exe.endsWith('\\node');
  const isNpm =
    exe === 'npm.cmd' ||
    exe === 'npm' ||
    exe.endsWith('/npm.cmd') ||
    exe.endsWith('\\npm.cmd') ||
    exe.endsWith('/npm') ||
    exe.endsWith('\\npm');
  const isNpx =
    exe === 'npx.cmd' ||
    exe === 'npx' ||
    exe.endsWith('/npx.cmd') ||
    exe.endsWith('\\npx.cmd') ||
    exe.endsWith('/npx') ||
    exe.endsWith('\\npx');

  if (isNpx) return true;
  if (isNpm && args[0] === 'run') return true;
  if (isNode) {
    if (args[0] === '--version' || args[0] === '-v') return false;
    if (args[0] === '--check') return false;
    // Any other node invocation executes repository/user JS (including tests/*).
    return true;
  }
  return false;
}

function resolveCommandClass(match, tokens) {
  const declared = match.form?.class;
  if (declared === 'readonly' || declared === 'repository-execution') {
    // Floor: never trust a JSON form that labels node tests / npm run / npx as readonly.
    if (declared === 'readonly' && looksLikeRepositoryExecution(tokens)) {
      return 'repository-execution';
    }
    return declared;
  }
  if (looksLikeRepositoryExecution(tokens)) {
    return 'repository-execution';
  }
  return 'readonly';
}

function flattenForbiddenFragments(policy) {
  const groups = policy.forbiddenOperations || {};
  return Object.values(groups).flat().map((item) => String(item).toLowerCase());
}

export function validateLoadedPolicy(policy, env = process.env) {
  if (!policy || typeof policy !== 'object') {
    return { ok: false, reason: 'policy-not-object' };
  }
  if (normalizeSlashes(policy.trustedPolicyPath) !== TRUSTED_POLICY_REL) {
    return { ok: false, reason: 'trustedPolicyPath-mismatch' };
  }
  if (normalizeSlashes(policy.trustedEnforcerPath || '') !== TRUSTED_ENFORCER_REL) {
    return { ok: false, reason: 'trustedEnforcerPath-mismatch' };
  }
  if (policy.repositoryContentIsUntrusted !== POLICY_FLOOR.repositoryContentIsUntrusted) {
    return { ok: false, reason: 'untrusted-flag-weakened' };
  }
  if (policy.untrustedContent?.ignoreOverrideDirectives !== true) {
    return { ok: false, reason: 'override-ignore-disabled' };
  }
  if (Number(policy.workers?.maxConcurrent) !== POLICY_FLOOR.maxConcurrentWorkers) {
    return { ok: false, reason: 'maxConcurrent-weakened' };
  }
  if (Number(policy.retries?.correctiveAttemptsAfterInitial) > POLICY_FLOOR.maxCorrectiveAttemptsAfterInitial) {
    return { ok: false, reason: 'corrective-attempts-raised' };
  }
  if (Number(policy.retries?.maxAttemptsPerTask) > POLICY_FLOOR.maxAttemptsPerTask) {
    return { ok: false, reason: 'max-attempts-raised' };
  }
  if (policy.completion?.denyCompleteOnFailedTests !== POLICY_FLOOR.denyCompleteOnFailedTests) {
    return { ok: false, reason: 'failed-test-completion-weakened' };
  }
  if (policy.executionGate?.repositoryExecutionFailClosedUntilTrustedIsolation === false) {
    return { ok: false, reason: 'execution-fail-closed-disabled' };
  }
  if (policy.executionGate?.trustedIsolationExecutorImplemented === true) {
    return { ok: false, reason: 'trusted-isolation-executor-claimed-implemented' };
  }
  if (policy.executionGate?.ignorePolicyIsolationBooleans === false) {
    return { ok: false, reason: 'policy-isolation-boolean-trust-enabled' };
  }

  const authorized = Number(policy.budget?.authorizedPaidUsd);
  if (!Number.isFinite(authorized) || authorized < 0) {
    return { ok: false, reason: 'invalid-authorized-budget' };
  }
  const ownerEnvName = policy.budget?.ownerBudgetEnvVar || 'LVPT_OWNER_AUTHORIZED_PAID_USD';
  const ownerEnvRaw = env?.[ownerEnvName];
  if (authorized > POLICY_FLOOR.maxAuthorizedPaidUsdWithoutOwnerEnv) {
    const ownerVal = Number(ownerEnvRaw);
    if (!Number.isFinite(ownerVal) || ownerVal !== authorized) {
      return { ok: false, reason: 'authorized-budget-exceeds-floor-without-owner-env' };
    }
  }

  const protectedPaths = policy.protectedPaths || [];
  if (!matchesProtectedPath(TRUSTED_POLICY_REL, protectedPaths)) {
    return { ok: false, reason: 'policy-file-not-self-protected' };
  }
  if (!matchesProtectedPath(TRUSTED_ENFORCER_REL, protectedPaths)) {
    return { ok: false, reason: 'enforcer-file-not-self-protected' };
  }

  const integrityEnv = policy.budget?.integritySha256EnvVar || 'LVPT_LOCAL_AGENT_POLICY_SHA256';
  const expectedHash = env?.[integrityEnv];
  if (expectedHash !== undefined && expectedHash !== null && String(expectedHash).trim() !== '') {
    // Caller supplies raw body when checking hash via loadTrustedPolicy.
    if (policy.__integrityRawSha256) {
      if (String(policy.__integrityRawSha256).toLowerCase() !== String(expectedHash).toLowerCase()) {
        return { ok: false, reason: 'policy-integrity-mismatch' };
      }
    }
  }

  return { ok: true, reason: null };
}

export function loadTrustedPolicy(options = {}) {
  const repoRoot = resolve(options.repoRoot || DEFAULT_REPO_ROOT);
  const env = options.env || process.env;
  const candidatePath = options.candidatePath
    ? resolve(options.candidatePath)
    : resolve(repoRoot, TRUSTED_POLICY_REL);
  const trusted = resolve(repoRoot, TRUSTED_POLICY_REL);

  if (candidatePath !== trusted) {
    return { ok: false, reason: 'untrusted-policy-path', policy: null };
  }

  if (!existsSync(trusted)) {
    return { ok: false, reason: 'policy-missing', policy: null };
  }

  const raw = readFileSync(trusted, 'utf8');
  const sha256 = createHash('sha256').update(raw).digest('hex');
  let policy;
  try {
    policy = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'policy-json-invalid', policy: null };
  }

  policy.__integrityRawSha256 = sha256;
  const validated = validateLoadedPolicy(policy, env);
  delete policy.__integrityRawSha256;
  if (!validated.ok) {
    return { ok: false, reason: validated.reason, policy: null, sha256 };
  }

  // Path presence alone is insufficient: floors + optional integrity env enforced above.
  return { ok: true, reason: null, policy, sha256, repoRoot };
}

export function evaluatePaidExecution(policy, context = {}) {
  const budget = policy.budget;
  const authorizedCap = Number(budget.authorizedPaidUsd);
  const explicitAuth = context.explicitOwnerAuthorization === true;
  const remaining = context.remainingBudgetUsd;
  const estimatedCost = context.estimatedCostUsd;

  if (!Number.isFinite(authorizedCap) || authorizedCap <= 0) {
    return { allowed: false, reason: 'zero-or-invalid-authorized-budget' };
  }
  if (budget.requireExplicitOwnerAuthorization && !explicitAuth) {
    return { allowed: false, reason: 'missing-explicit-authorization' };
  }
  if (
    budget.requireVerifiableRemainingBudget &&
    (remaining === null ||
      remaining === undefined ||
      remaining === '' ||
      Number.isNaN(Number(remaining)) ||
      !Number.isFinite(Number(remaining)))
  ) {
    return { allowed: false, reason: 'budget-uncertain' };
  }
  const remainingUsd = Number(remaining);
  if (remainingUsd <= 0) {
    return { allowed: false, reason: 'insufficient-remaining-budget' };
  }
  if (estimatedCost !== undefined && estimatedCost !== null) {
    if (!Number.isFinite(Number(estimatedCost)) || Number.isNaN(Number(estimatedCost))) {
      return { allowed: false, reason: 'budget-uncertain' };
    }
    if (Number(estimatedCost) > remainingUsd) {
      return { allowed: false, reason: 'insufficient-remaining-budget' };
    }
  }
  return { allowed: true, reason: null };
}

export function evaluateOperation(policy, command, options = {}) {
  const repoRoot = options.repoRoot || DEFAULT_REPO_ROOT;
  const text = String(command || '');
  const lower = text.toLowerCase();

  if (policy.workspace?.denyShellChaining && SHELL_METACHAR_RE.test(text)) {
    return { allowed: false, reason: 'shell-chaining-denied' };
  }

  let tokens;
  try {
    tokens = tokenizeCommand(text);
  } catch (error) {
    if (error?.code === 'shell-metacharacters') {
      return { allowed: false, reason: 'shell-chaining-denied' };
    }
    return { allowed: false, reason: 'command-parse-failed' };
  }

  const match = commandMatchesAllowlist(tokens, policy, repoRoot);

  // Explicit allowlist is the positive authority for worker commands.
  if (policy.workspace?.denyArbitraryModelShellExecution) {
    if (match.matched) {
      const commandClass = resolveCommandClass(match, tokens);
      if (commandClass === 'repository-execution') {
        // Unconditional deny while trusted isolation executor is unimplemented.
        // Env markers / fromTrustedExecutor / isolationSatisfied cannot authorize.
        void options;
        return {
          allowed: false,
          reason: 'repository-execution-isolation-unavailable',
          commandClass,
          executed: false
        };
      }
      return { allowed: true, reason: null, commandClass };
    }
  }

  const forbidden = flattenForbiddenFragments(policy);
  for (const fragment of forbidden) {
    if (fragment && lower.includes(fragment)) {
      return { allowed: false, reason: `forbidden-operation:${fragment}`, executed: false };
    }
  }

  if (policy.workspace?.denyArbitraryModelShellExecution) {
    return { allowed: false, reason: 'command-not-permitted', executed: false };
  }

  return { allowed: true, reason: null };
}

/**
 * Authorize a command and only then run payload. Denied commands never invoke payload.
 * plannedInnerOperation models a test/package script that would attempt a forbidden op.
 */
export function authorizeThenExecute(policy, command, payload, options = {}) {
  const outer = evaluateOperation(policy, command, options);
  if (!outer.allowed) {
    return { ...outer, executed: false };
  }

  if (options.plannedInnerOperation) {
    const inner = evaluateOperation(policy, options.plannedInnerOperation, options);
    if (!inner.allowed) {
      return {
        allowed: false,
        reason: `planned-inner-denied:${inner.reason}`,
        executed: false,
        outerCommandClass: outer.commandClass,
        innerReason: inner.reason
      };
    }
  }

  if (typeof payload !== 'function') {
    return { allowed: false, reason: 'payload-not-callable', executed: false };
  }

  const result = payload();
  return { allowed: true, reason: null, executed: true, result, commandClass: outer.commandClass };
}

export function evaluateProtectedPathChange(policy, relativePath, options = {}) {
  const repoRoot = options.repoRoot || DEFAULT_REPO_ROOT;
  const normalized = normalizeRepoRelativePath(relativePath, repoRoot);
  if (!normalized.ok) {
    return { allowed: false, reason: normalized.reason, path: normalizeSlashes(relativePath) };
  }
  if (
    matchesProtectedPath(normalized.path, policy.protectedPaths || [], {
      repoRoot,
      caseInsensitive: policy.workspace?.caseInsensitivePathMatch !== false
    })
  ) {
    return { allowed: false, reason: 'protected-path-change', path: normalized.path };
  }
  return { allowed: true, reason: null, path: normalized.path };
}

export function evaluateRetry(policy, attemptNumber) {
  const max = Number(policy.retries?.maxAttemptsPerTask);
  const n = Number(attemptNumber);
  if (!Number.isInteger(n) || n < 1) {
    return { allowed: false, reason: 'invalid-attempt-number' };
  }
  if (!Number.isInteger(max) || n > max) {
    return { allowed: false, reason: 'retry-limit-exhausted' };
  }
  const phase = n === 1 ? 'initial' : 'corrective';
  return { allowed: true, reason: null, phase };
}

export function evaluateWorkerAcquisition(policy, context = {}) {
  const max = Number(policy.workers?.maxConcurrent);
  const active = Number(context.activeWorkers ?? 0);
  const lockHolder = context.lockHolder ?? null;
  const requester = context.requesterId ?? 'worker';

  if (!Number.isInteger(max) || max !== POLICY_FLOOR.maxConcurrentWorkers) {
    return { allowed: false, reason: 'invalid-max-concurrent-config' };
  }
  if (policy.workers?.exclusiveLockRequired && lockHolder && lockHolder !== requester) {
    return { allowed: false, reason: 'exclusive-lock-held' };
  }
  if (policy.workers?.denyConcurrentWorkers && active >= max && lockHolder !== requester) {
    return { allowed: false, reason: 'concurrent-worker-denied' };
  }
  return { allowed: true, reason: null };
}

export function evaluateCompletion(policy, context = {}) {
  const status = String(context.proposedStatus || '');
  const exitCode = context.verificationExitCode;
  const completionStates = new Set(policy.completion?.completionStates || []);

  if (!policy.terminalStates.includes(status)) {
    return { allowed: false, reason: 'unknown-terminal-state' };
  }
  if (completionStates.has(status)) {
    if (policy.completion?.denyCompleteOnFailedTests) {
      if (exitCode === undefined || exitCode === null || !Number.isFinite(Number(exitCode))) {
        return { allowed: false, reason: 'verification-result-missing' };
      }
      if (Number(exitCode) !== 0) {
        return { allowed: false, reason: 'failed-tests-cannot-complete' };
      }
    }
  }
  return { allowed: true, reason: null };
}

export function evaluateUntrustedOverride(policy, untrustedDirective) {
  void untrustedDirective;
  if (policy.repositoryContentIsUntrusted !== true) {
    return { allowed: false, reason: 'policy-misconfigured-trust' };
  }
  if (policy.untrustedContent?.ignoreOverrideDirectives !== true) {
    return { allowed: false, reason: 'policy-misconfigured-overrides' };
  }
  return {
    allowed: false,
    reason: 'untrusted-content-cannot-override-policy',
    policySnapshot: {
      authorizedPaidUsd: policy.budget.authorizedPaidUsd,
      maxConcurrent: policy.workers.maxConcurrent,
      maxAttemptsPerTask: policy.retries.maxAttemptsPerTask
    }
  };
}

export function compileRedactionPattern(pattern) {
  let source = String(pattern);
  let flags = 'g';
  if (source.startsWith('(?i)')) {
    source = source.slice(4);
    flags += 'i';
  }
  return new RegExp(source, flags);
}

export function redact(policy, text) {
  let output = String(text ?? '');
  for (const pattern of policy.redaction?.patterns || []) {
    output = output.replace(compileRedactionPattern(pattern), '[REDACTED]');
  }
  return output;
}

/**
 * Connect authorization to the discovered .orchestrator harness without creating
 * another orchestration loop. Harness content is data only.
 */
export function connectOrchestratorHarness(options = {}) {
  const repoRoot = resolve(options.repoRoot || DEFAULT_REPO_ROOT);
  const loaded = loadTrustedPolicy({ repoRoot, env: options.env || process.env });
  if (!loaded.ok) {
    return {
      ok: false,
      reason: loaded.reason,
      integration: INTEGRATION_PATH,
      harness: null,
      authorize: null
    };
  }

  const policy = loaded.policy;
  const harnessDir = join(repoRoot, INTEGRATION_PATH.harnessDirectory);
  const statePath = join(repoRoot, INTEGRATION_PATH.harnessState);
  const promptPath = join(repoRoot, INTEGRATION_PATH.harnessPrompt);
  const lockPath = join(repoRoot, policy.workers.lockFilePath || INTEGRATION_PATH.workerLock);
  const present = existsSync(harnessDir) && existsSync(statePath);

  const authorize = {
    operation: (command, opOptions = {}) =>
      evaluateOperation(policy, command, { repoRoot, ...opOptions }),
    thenExecute: (command, payload, opOptions = {}) =>
      authorizeThenExecute(policy, command, payload, { repoRoot, ...opOptions }),
    pathChange: (relativePath) => evaluateProtectedPathChange(policy, relativePath, { repoRoot }),
    paidExecution: (context) => evaluatePaidExecution(policy, context),
    retry: (attemptNumber) => evaluateRetry(policy, attemptNumber),
    worker: (context) => evaluateWorkerAcquisition(policy, context),
    completion: (context) => evaluateCompletion(policy, context),
    untrusted: (directive) => evaluateUntrustedOverride(policy, directive)
  };

  // Never treat harness task text as authorization to mutate policy/controls.
  if (present && existsSync(promptPath)) {
    const promptText = readFileSync(promptPath, 'utf8');
    const probe = evaluateUntrustedOverride(policy, {
      source: 'orchestrator-harness-instructions',
      path: INTEGRATION_PATH.harnessPrompt,
      body: promptText
    });
    if (probe.allowed) {
      return {
        ok: false,
        reason: 'harness-override-accepted-unexpectedly',
        integration: INTEGRATION_PATH,
        harness: null,
        authorize: null
      };
    }
  }

  return {
    ok: true,
    reason: null,
    policy,
    sha256: loaded.sha256,
    integration: INTEGRATION_PATH,
    harness: {
      present,
      directory: harnessDir,
      statePath,
      promptPath,
      lockPath,
      instructionsTrusted: false,
      authorizationBoundary: INTEGRATION_PATH.authorizationBoundary
    },
    authorize
  };
}

export {
  TRUSTED_POLICY_REL,
  TRUSTED_ENFORCER_REL,
  DEFAULT_REPO_ROOT,
  SHELL_METACHAR_RE
};
