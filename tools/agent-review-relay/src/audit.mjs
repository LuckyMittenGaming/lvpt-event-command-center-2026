import { TRANSITIONS } from './constants.mjs';

const KEYS = ['at', 'deliveryId', 'repo', 'pr', 'sha', 'event', 'action', 'decision', 'transition', 'iterations', 'tokens', 'costUsd', 'totalSpendUsd', 'dryRun'];

function cleanId(value) {
  if (typeof value !== 'string') return null;
  return /^[A-Za-z0-9._:-]{8,80}$/.test(value) ? value : null;
}

function cleanSha(value) {
  if (typeof value !== 'string') return null;
  return /^[0-9a-f]{40}$/.test(value) ? value : null;
}

export function buildAuditEntry(input) {
  const transition = TRANSITIONS.includes(input.transition) ? input.transition : 'fail_closed';
  const decision = input.decision === 'PASS' || input.decision === 'REQUEST_CHANGES' || input.decision === 'HUMAN_APPROVAL_REQUIRED'
    ? input.decision
    : null;
  const pr = Number.isInteger(input.pr) && input.pr > 0 ? input.pr : null;
  const tokens = Number.isFinite(input.tokens) ? Math.max(0, Math.round(input.tokens)) : 0;
  const costUsd = Number.isFinite(input.costUsd) ? Math.max(0, input.costUsd) : 0;
  const totalSpendUsd = Number.isFinite(input.totalSpendUsd) ? Math.max(0, input.totalSpendUsd) : 0;
  return {
    at: typeof input.at === 'string' ? input.at : new Date(0).toISOString(),
    deliveryId: cleanId(input.deliveryId),
    repo: input.repo === 'LuckyMittenGaming/lvpt-event-command-center-2026' ? input.repo : null,
    pr,
    sha: cleanSha(input.sha),
    event: typeof input.event === 'string' && /^[a-z_]{1,40}$/.test(input.event) ? input.event : null,
    action: typeof input.action === 'string' && /^[a-z_]{1,40}$/.test(input.action) ? input.action : null,
    decision,
    transition,
    iterations: Number.isInteger(input.iterations) ? Math.max(0, Math.min(3, input.iterations)) : 0,
    tokens,
    costUsd,
    totalSpendUsd,
    dryRun: input.dryRun !== false,
  };
}

export function auditKeys() {
  return KEYS;
}
