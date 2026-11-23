import { DECISIONS } from './constants.mjs';
import {
  classifyFiles,
  containsInjectionEcho,
  containsSensitiveLeak,
  evidenceKind,
  extractSafePaths,
  isSafePath,
  stripMentions,
  truncate,
} from './sanitize.mjs';

const HUMAN_RATIONALE = {
  sensitive_path: 'A changed file is outside the autonomous staging boundary.',
  unsafe_path: 'The changed-file list was incomplete or unsafe, so the loop stopped.',
  evidence_missing: 'Check evidence was missing or ambiguous, so the loop stopped.',
  model_disagreed_with_failing_checks: 'The reviewer disagreed with failing checks, so a person must decide.',
  model_disagreed_with_passing_checks: 'The reviewer asked for a change without a concrete in-diff finding, so a person must decide.',
  unsafe_model_output: 'The reviewer output was discarded because it contained unsafe content.',
  max_iterations: 'The autonomous correction cap was reached. A person must decide before another change.',
  spend_cap: 'The configured spend cap was reached. The loop stopped before another paid review.',
  api_failure: 'The reviewer did not return a usable result. The loop stopped.',
  comment_failed: 'The status comment could not be posted. The loop stopped.',
  pr_budget: 'The time budget for this pull request was reached. The loop stopped.',
  checks_passed: 'Checks passed for this commit.',
  human_review: 'A person needs to decide before the loop continues.',
};

export function fixedHuman(reason) {
  return {
    decision: 'HUMAN_APPROVAL_REQUIRED',
    rationale: HUMAN_RATIONALE[reason] || HUMAN_RATIONALE.human_review,
    findings: [],
    cursorTask: null,
    reason,
    unsafe: false,
  };
}

export function deterministicDecision(evidence) {
  const files = classifyFiles(evidence?.changedFiles);
  if (files === 'sensitive') return fixedHuman('sensitive_path');
  if (files !== 'ok') return fixedHuman('unsafe_path');
  const kind = evidenceKind(evidence);
  if (kind === 'fail') {
    const paths = extractSafePaths(evidence.testSummary);
    return {
      decision: 'REQUEST_CHANGES',
      rationale: 'Checks failed for this commit.',
      findings: paths.map((path) => ({ path, line: null, summary: 'Check failed.' })),
      cursorTask: paths.length
        ? `Fix only the failing check covered by ${paths.join(', ')}. Do not merge, deploy, edit workflows, secrets, or files outside this pull request.`
        : 'Fix only the failing checks for this commit. Do not merge, deploy, or expand scope.',
      reason: 'checks_failed',
      unsafe: false,
    };
  }
  if (kind === 'pass') {
    return {
      decision: 'PASS',
      rationale: 'Checks passed for this commit.',
      findings: [],
      cursorTask: null,
      reason: 'checks_passed',
      unsafe: false,
    };
  }
  return fixedHuman('evidence_missing');
}

function cleanFinding(finding) {
  if (!finding || typeof finding !== 'object') return null;
  if (!isSafePath(finding.path)) return null;
  const line = Number.isInteger(finding.line) && finding.line >= 1 && finding.line <= 20000 ? finding.line : null;
  const summary = stripMentions(truncate(finding.summary, 200)).replace(/-->/g, '');
  if (!summary || containsSensitiveLeak(summary) || containsInjectionEcho(summary)) return null;
  return { path: finding.path, line, summary };
}

export function normalizeDecision(raw) {
  const source = raw && raw.decision && raw.rationale !== undefined ? raw : raw?.decision;
  const decision = source && typeof source === 'object' ? source : raw;
  if (!decision || typeof decision !== 'object' || !DECISIONS.includes(decision.decision)) {
    return fixedHuman('unsafe_model_output');
  }
  const blob = `${decision.rationale || ''}\n${decision.cursorTask || ''}\n${JSON.stringify(decision.findings || [])}`;
  if (containsSensitiveLeak(blob) || containsInjectionEcho(blob)) return fixedHuman('unsafe_model_output');
  const findings = Array.isArray(decision.findings) ? decision.findings.map(cleanFinding).filter(Boolean).slice(0, 5) : [];
  const rationale = stripMentions(truncate(decision.rationale, 500)).replace(/-->/g, '');
  let cursorTask = decision.decision === 'REQUEST_CHANGES'
    ? stripMentions(truncate(decision.cursorTask, 600)).replace(/-->/g, '')
    : null;
  if (decision.decision === 'REQUEST_CHANGES' && !cursorTask) return fixedHuman('unsafe_model_output');
  return {
    decision: decision.decision,
    rationale: rationale || 'Review completed.',
    findings,
    cursorTask,
    reason: typeof decision.reason === 'string' && /^[a-z_]{1,60}$/.test(decision.reason) ? decision.reason : 'model_review',
    unsafe: false,
  };
}

export function hasConcreteFindings(decision, evidence) {
  const changed = new Set(Array.isArray(evidence?.changedFiles) ? evidence.changedFiles : []);
  if (!decision?.cursorTask || !Array.isArray(decision.findings)) return false;
  return decision.findings.some((finding) => changed.has(finding.path)
    && isSafePath(finding.path)
    && finding.summary
    && finding.summary.length >= 8);
}

export function applyEvidencePolicy(decision, evidence) {
  const files = classifyFiles(evidence?.changedFiles);
  if (files === 'sensitive') return fixedHuman('sensitive_path');
  if (files !== 'ok') return fixedHuman('unsafe_path');
  const kind = evidenceKind(evidence);
  if (kind === 'unknown') return fixedHuman('evidence_missing');
  if (kind === 'fail' && decision.decision === 'PASS') return fixedHuman('model_disagreed_with_failing_checks');
  if (kind === 'pass' && decision.decision === 'REQUEST_CHANGES' && !hasConcreteFindings(decision, evidence)) {
    return fixedHuman('model_disagreed_with_passing_checks');
  }
  if (decision.decision === 'HUMAN_APPROVAL_REQUIRED') return fixedHuman(decision.reason || 'human_review');
  return decision;
}
