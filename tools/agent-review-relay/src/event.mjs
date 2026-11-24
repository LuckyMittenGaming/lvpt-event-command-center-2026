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
  if (ctx.draft !== true) return 'rejected_draft';
  if (!ctx.labels.includes(requiredLabel)) return 'rejected_label';
  if (!ALLOWED_AUTHORS.includes(ctx.author)) return 'rejected_author';
  if (ctx.commentAuthor && !ALLOWED_AUTHORS.includes(ctx.commentAuthor)) return 'rejected_author';
  return null;
}

export function contextFromPull(pull, extra = {}) {
  const repositoryName = extra.repo || RELAY_REPO;
  const base = asObject(pull.base);
  const head = asObject(pull.head);
  const headRepo = head && asObject(head.repo);
  const user = asObject(pull.user);
  const number = pull.number;
  const headSha = head && typeof head.sha === 'string' ? head.sha : '';
  if (extra.sha && headSha && extra.sha !== headSha) return { ok: false, transition: 'stale_head' };
  const sha = extra.sha || headSha;
  if (!Number.isInteger(number) || number < 1 || number > 1_000_000) return { ok: false, transition: 'rejected_event' };
  if (!/^[0-9a-f]{40}$/.test(sha)) return { ok: false, transition: 'rejected_event' };
  const ctx = {
    pr: number,
    sha,
    action: extra.action || '',
    event: extra.event || 'pull_request',
    repo: repositoryName,
    headRepo: headRepo && typeof headRepo.full_name === 'string' ? headRepo.full_name : '',
    base: base && typeof base.ref === 'string' ? base.ref : '',
    labels: labelNames(pull),
    author: user && typeof user.login === 'string' ? user.login : '',
    commentAuthor: extra.commentAuthor || '',
    draft: pull.draft === true,
    updatedAt: extra.updatedAt || (typeof pull.updated_at === 'string' ? pull.updated_at : ''),
    untrusted: {
      title: redactSensitive(truncate(pull.title, 200)),
      body: redactSensitive(truncate(pull.body, 4000)),
      comment: redactSensitive(truncate(extra.commentBody, 2000)),
    },
  };
  const rejection = authorizeEvent(ctx, extra.requiredLabel);
  if (rejection) return { ok: false, transition: rejection, ctx };
  return { ok: true, ctx };
}

export function readEvent(eventName, payload, requiredLabel) {
  if (eventName === 'ping') {
    const repository = asObject(payload.repository);
    const repo = repository && typeof repository.full_name === 'string' ? repository.full_name : '';
    if (repo !== RELAY_REPO) return { ok: false, transition: 'rejected_repo' };
    return { ok: true, ping: true };
  }

  const repository = asObject(payload.repository);
  const repo = repository && typeof repository.full_name === 'string' ? repository.full_name : '';
  if (repo !== RELAY_REPO) return { ok: false, transition: 'rejected_repo' };

  if (eventName === 'check_run' || eventName === 'status') {
    return readCompletionEvent(eventName, payload, repo);
  }
  if (eventName === 'issue_comment') {
    return readIssueComment(payload, repo);
  }

  const allowed = (eventName === 'pull_request' && (payload.action === 'opened' || payload.action === 'synchronize'))
    || (eventName === 'pull_request_review_comment' && payload.action === 'created');
  if (!allowed) return { ok: false, transition: 'rejected_event' };

  const pr = asObject(payload.pull_request);
  if (!pr) return { ok: false, transition: 'rejected_event' };
  const comment = asObject(payload.comment);
  const commentBody = comment && typeof comment.body === 'string' ? comment.body : '';
  const commentAuthor = comment && asObject(comment.user) && typeof comment.user.login === 'string' ? comment.user.login : '';
  const updatedAt = eventName === 'pull_request_review_comment'
    ? (comment && typeof comment.created_at === 'string' ? comment.created_at : '')
    : (typeof pr.updated_at === 'string' ? pr.updated_at : '');
  const parsed = contextFromPull(pr, {
    repo,
    action: payload.action,
    event: eventName,
    updatedAt,
    commentBody,
    commentAuthor,
    requiredLabel,
  });
  if (!parsed.ok) return parsed;
  if (eventName === 'pull_request_review_comment' && commentBody.includes(MARKER)) {
    return { ok: true, self: true, ctx: parsed.ctx };
  }
  return parsed;
}

function readCompletionEvent(eventName, payload, repo) {
  if (eventName === 'check_run') {
    if (payload.action !== 'completed') return { ok: false, transition: 'rejected_event' };
    const run = asObject(payload.check_run);
    const sha = run && typeof run.head_sha === 'string' ? run.head_sha : '';
    if (!/^[0-9a-f]{40}$/.test(sha)) return { ok: false, transition: 'rejected_event' };
    const pulls = Array.isArray(run.pull_requests) ? run.pull_requests : [];
    const first = asObject(pulls[0]);
    const number = first && Number.isInteger(first.number) ? first.number : null;
    return {
      ok: true,
      lookup: true,
      hint: {
        repo,
        sha,
        pr: number,
        event: 'check_run',
        action: 'completed',
        updatedAt: typeof run.completed_at === 'string' ? run.completed_at : '',
      },
    };
  }
  if (payload.state !== 'success' && payload.state !== 'failure' && payload.state !== 'error' && payload.state !== 'pending') {
    return { ok: false, transition: 'rejected_event' };
  }
  const sha = typeof payload.sha === 'string' ? payload.sha : '';
  if (!/^[0-9a-f]{40}$/.test(sha)) return { ok: false, transition: 'rejected_event' };
  return {
    ok: true,
    lookup: true,
    hint: {
      repo,
      sha,
      pr: null,
      event: 'status',
      action: payload.state,
      updatedAt: typeof payload.updated_at === 'string' ? payload.updated_at : '',
    },
  };
}

function readIssueComment(payload, repo) {
  if (payload.action !== 'created') return { ok: false, transition: 'rejected_event' };
  const issue = asObject(payload.issue);
  if (!issue || !asObject(issue.pull_request)) return { ok: false, transition: 'rejected_event' };
  const comment = asObject(payload.comment);
  const commentBody = comment && typeof comment.body === 'string' ? comment.body : '';
  const commentAuthor = comment && asObject(comment.user) && typeof comment.user.login === 'string' ? comment.user.login : '';
  const number = issue.number;
  if (!Number.isInteger(number)) return { ok: false, transition: 'rejected_event' };
  if (commentBody.includes(MARKER)) {
    return {
      ok: true,
      self: true,
      ctx: { pr: number, sha: null, repo, event: 'issue_comment', action: 'created' },
    };
  }
  return {
    ok: true,
    lookup: true,
    hint: {
      repo,
      sha: '',
      pr: number,
      event: 'issue_comment',
      action: 'created',
      updatedAt: comment && typeof comment.created_at === 'string' ? comment.created_at : '',
      commentBody,
      commentAuthor,
    },
  };
}
