import { MAX_BODY_BYTES, RELAY_REPO } from './constants.mjs';
import { coordinate } from './coordinate.mjs';
import { readEvent } from './event.mjs';
import { verifyGitHubSignature } from './signature.mjs';

function header(headers, name) {
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(headers || {})) {
    if (key.toLowerCase() === wanted) return Array.isArray(value) ? value[0] : value;
  }
  return '';
}

function publicBody(result) {
  return {
    ok: result.ok,
    transition: result.transition,
    decision: result.decision,
    dryRun: result.dryRun,
  };
}

async function early(runtime, transition, extra = {}) {
  const result = {
    httpStatus: extra.httpStatus || 200,
    ok: extra.ok !== false,
    transition,
    decision: null,
    dryRun: !runtime.live,
    iterations: 0,
    plannedComment: null,
    mentionsCursor: false,
  };
  if (extra.audit) {
    try {
      const spendMicro = await runtime.store.readSpendMicro();
      await runtime.store.appendAudit({
        at: new Date(runtime.now()).toISOString(),
        deliveryId: extra.deliveryId || null,
        repo: extra.repo || null,
        pr: extra.pr || null,
        sha: extra.sha || null,
        event: extra.event || null,
        action: extra.action || null,
        decision: null,
        transition,
        iterations: 0,
        tokens: 0,
        costUsd: 0,
        totalSpendUsd: spendMicro / 1e6,
        dryRun: !runtime.live,
      });
    } catch {
      result.transition = 'state_unreadable';
      result.ok = false;
    }
  }
  return result;
}

export async function handleSignedDelivery({ rawBody, headers, runtime, suppliedEvidence = null, suppliedPull = null }) {
  if (header(headers, 'x-relay-method') === 'GET') {
    return early(runtime, 'rejected_method', { httpStatus: 405, ok: false });
  }
  if (Buffer.byteLength(rawBody) > MAX_BODY_BYTES) {
    return early(runtime, 'rejected_size', { httpStatus: 413, ok: false });
  }
  const signature = header(headers, 'x-hub-signature-256');
  if (!verifyGitHubSignature(rawBody, signature, runtime.config.webhookSecret)) {
    return early(runtime, 'rejected_signature', { httpStatus: 401, ok: false });
  }
  if (runtime.live) {
    try {
      await runtime.store.ping();
    } catch {
      return early(runtime, 'state_unreadable', { ok: false });
    }
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return early(runtime, 'rejected_json', { httpStatus: 400, ok: false });
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return early(runtime, 'rejected_json', { httpStatus: 400, ok: false });
  }

  const deliveryId = header(headers, 'x-github-delivery');
  if (!/^[A-Za-z0-9._:-]{8,80}$/.test(deliveryId)) {
    return early(runtime, 'rejected_delivery', { httpStatus: 400, ok: false });
  }
  const eventName = header(headers, 'x-github-event');
  if (!/^[a-z_]{1,40}$/.test(eventName)) {
    return early(runtime, 'rejected_event', { httpStatus: 200, ok: false, audit: true, deliveryId, event: null });
  }

  let claimed = false;
  try {
    claimed = await runtime.store.claimDelivery(deliveryId);
  } catch {
    return early(runtime, 'state_unreadable', { ok: false });
  }
  if (!claimed) {
    return early(runtime, 'duplicate_delivery', { audit: true, deliveryId, event: eventName });
  }

  if (runtime.config.killSwitch) {
    return early(runtime, 'killed', { audit: true, deliveryId, event: eventName });
  }
  if (!runtime.config.enabled) {
    return early(runtime, 'disabled', { audit: true, deliveryId, event: eventName });
  }
  if (runtime.config.live || runtime.config.dryRun === false) {
    if (!runtime.live) return early(runtime, 'live_misconfigured', { audit: true, deliveryId, event: eventName });
  }

  const parsed = readEvent(eventName, payload, runtime.config.requiredLabel);
  if (!parsed.ok) {
    return early(runtime, parsed.transition, {
      audit: true,
      deliveryId,
      event: eventName,
      action: typeof payload.action === 'string' ? payload.action : null,
      pr: parsed.ctx?.pr || null,
      sha: parsed.ctx?.sha || null,
      repo: parsed.ctx?.repo === RELAY_REPO ? RELAY_REPO : null,
      ok: false,
    });
  }
  if (parsed.ping) return early(runtime, 'pong', { audit: true, deliveryId, event: 'ping', repo: RELAY_REPO });
  if (parsed.self) {
    return early(runtime, 'ignored_self', { audit: true, deliveryId, event: eventName, pr: parsed.ctx.pr, sha: parsed.ctx.sha, repo: RELAY_REPO });
  }

  let ctx = parsed.ctx;
  if (parsed.lookup) {
    let found;
    try {
      found = await runtime.lookupPull({
        ...parsed.hint,
        requiredLabel: runtime.config.requiredLabel,
        suppliedPull: runtime.live ? null : suppliedPull,
      });
    } catch {
      return early(runtime, 'access_denied', { audit: true, deliveryId, event: eventName, ok: false, repo: RELAY_REPO });
    }
    if (!found.ok) {
      return early(runtime, found.transition, {
        audit: true,
        deliveryId,
        event: eventName,
        pr: parsed.hint.pr,
        sha: parsed.hint.sha,
        repo: RELAY_REPO,
        ok: false,
      });
    }
    ctx = found.ctx;
  }

  return coordinate({
    ...ctx,
    deliveryId,
    suppliedEvidence: runtime.live ? null : suppliedEvidence,
  }, runtime);
}

export async function handleWebhook(request, runtime) {
  try {
    const method = request.method || 'POST';
    if (method !== 'POST') {
      return Response.json(publicBody({ ok: false, transition: 'rejected_method', decision: null, dryRun: true }), { status: 405 });
    }
    const rawBody = await request.text();
    const headers = Object.fromEntries(request.headers.entries());
    const rich = await handleSignedDelivery({ rawBody, headers, runtime });
    return Response.json(publicBody(rich), { status: rich.httpStatus });
  } catch {
    return Response.json({ ok: false, transition: 'fail_closed', decision: null, dryRun: true }, { status: 200 });
  }
}
