import {
  ALLOWED_AUTHORS,
  DENIED_BASES,
  MARKER,
  RELAY_BASE,
  RELAY_REPO,
} from './constants.mjs';
import { redactSensitive, truncate } from './sanitize.mjs';

function asObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value;
}

function labelNames(pr) {
  if (!Array.isArray(pr.labels)) return [];
  const names = [];
  for (const label of pr.labels) {
    const name = label && typeof label.name === 'string' ? label.name : '';
    if (/^[A-Za-z0-9][A-Za-z0-9._-]{0,50}$/.test(name)) names.push(name);
    if (names.length === 30) break;
  }
  return names;
}

export function authorizeEvent(ctx, requiredLabel) {
  if (ctx.repo !== RELAY_REPO) return 'rejected_repo';
  if (ctx.headRepo !== RELAY_REPO) return 'rejected_fork';
  if (DENIED_BASES.has(ctx.base) || ctx.base !== RELAY_BASE) return 'rejected_base';
  if (!ctx.labels.includes(requiredLabel)) return 'rejected_label';
  if (!ALLOWED_AUTHORS.includes(ctx.author)) return 'rejected_author';
  return null;
}

export function readEvent(eventName, payload, requiredLabel) {
  if (eventName === 'ping') {
    const repository = asObject(payload.repository);
    const repo = repository && typeof repository.full_name === 'string' ? repository.full_name : '';
    if (repo !== RELAY_REPO) return { ok: false, transition: 'rejected_repo' };
    return { ok: true, ping: true };
  }

  const allowed = (eventName === 'pull_request' && (payload.action === 'opened' || payload.action === 'synchronize'))
    || (eventName === 'pull_request_review_comment' && payload.action === 'created');
  if (!allowed) return { ok: false, transition: 'rejected_event' };

  const repository = asObject(payload.repository);
  const pr = asObject(payload.pull_request);
  if (!repository || !pr) return { ok: false, transition: 'rejected_event' };

  const base = asObject(pr.base);
  const head = asObject(pr.head);
  const headRepo = head && asObject(head.repo);
  const user = asObject(pr.user);
  const number = pr.number;
  const sha = head && typeof head.sha === 'string' ? head.sha : '';
  if (!Number.isInteger(number) || number < 1 || number > 1_000_000) return { ok: false, transition: 'rejected_event' };
  if (!/^[0-9a-f]{40}$/.test(sha)) return { ok: false, transition: 'rejected_event' };

  const comment = asObject(payload.comment);
  const commentBody = comment && typeof comment.body === 'string' ? comment.body : '';
  const updatedAt = eventName === 'pull_request_review_comment'
    ? (comment && typeof comment.created_at === 'string' ? comment.created_at : '')
    : (typeof pr.updated_at === 'string' ? pr.updated_at : '');

  const ctx = {
    pr: number,
    sha,
    action: typeof payload.action === 'string' ? payload.action : '',
    event: eventName,
    repo: typeof repository.full_name === 'string' ? repository.full_name : '',
    headRepo: headRepo && typeof headRepo.full_name === 'string' ? headRepo.full_name : '',
    base: base && typeof base.ref === 'string' ? base.ref : '',
    labels: labelNames(pr),
    author: user && typeof user.login === 'string' ? user.login : '',
    updatedAt,
    untrusted: {
      title: redactSensitive(truncate(pr.title, 200)),
      body: redactSensitive(truncate(pr.body, 4000)),
      comment: redactSensitive(truncate(commentBody, 2000)),
    },
  };

  const rejection = authorizeEvent(ctx, requiredLabel);
  if (rejection) return { ok: false, transition: rejection, ctx };
  if (eventName === 'pull_request_review_comment' && commentBody.includes(MARKER)) {
    return { ok: true, self: true, ctx };
  }
  return { ok: true, ctx };
}
