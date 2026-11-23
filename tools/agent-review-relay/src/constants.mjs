export const RELAY_REPO = 'LuckyMittenGaming/lvpt-event-command-center-2026';
export const RELAY_BASE = 'feature/unified-command-center-staging';
export const DENIED_BASES = new Set(['main', 'master', 'production', 'prod']);
export const REQUIRED_LABEL = 'agent-loop';
export const ALLOWED_AUTHORS = Object.freeze(['LuckyMittenGaming', 'cursor[bot]', 'cursor']);
export const MAX_ITERATIONS_CEILING = 3;
export const FIXTURE_WEBHOOK_SECRET = 'fixture-webhook-secret-not-real';
export const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
export const GITHUB_API = 'https://api.github.com';
export const MAX_BODY_BYTES = 1_000_000;
export const STATE_VERSION = 1;
export const MARKER = 'lvpt-agent-relay';

export const DECISIONS = Object.freeze(['PASS', 'REQUEST_CHANGES', 'HUMAN_APPROVAL_REQUIRED']);

export const TRANSITIONS = Object.freeze([
  'pong',
  'disabled',
  'killed',
  'live_misconfigured',
  'rejected_signature',
  'rejected_json',
  'rejected_delivery',
  'rejected_size',
  'rejected_method',
  'rejected_event',
  'rejected_repo',
  'rejected_fork',
  'rejected_base',
  'rejected_label',
  'rejected_author',
  'rejected_stale',
  'duplicate_delivery',
  'duplicate_sha',
  'already_stopped',
  'ignored_self',
  'evidence_pending',
  'dry_run_planned',
  'comment_posted',
  'api_failure_stopped',
  'comment_failed_stopped',
  'spend_cap_stopped',
  'pass_stopped',
  'human_stopped',
  'max_iterations_stopped',
  'sensitive_path_stopped',
  'unsafe_path_stopped',
  'pr_budget_stopped',
  'state_unreadable',
  'fail_closed',
]);
