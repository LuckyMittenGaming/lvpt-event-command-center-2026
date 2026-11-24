import { loadConfig } from '../src/config.mjs';
import { createRuntime } from '../src/runtime.mjs';
import { handleSignedDelivery } from '../src/webhook.mjs';

export const config = { api: { bodyParser: false } };

async function readRawBody(req) {
  if (typeof req.text === 'function') return req.text();
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

export async function handleNodeRequest(req, res, deps = {}) {
  try {
    if ((req.method || 'POST') !== 'POST') {
      res.statusCode = 405;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ ok: false, transition: 'rejected_method', decision: null, dryRun: true }));
      return;
    }
    const rawBody = await readRawBody(req);
    const runtime = (deps.createRuntime || createRuntime)((deps.loadConfig || loadConfig)(deps.env || process.env));
    const rich = await handleSignedDelivery({
      rawBody,
      headers: req.headers || {},
      runtime,
    });
    // Log only the decision category and HTTP status. Never log URLs, headers,
    // webhook signatures, payloads, credentials, comments, or contact data.
    console.info('lvpt_relay_webhook', JSON.stringify({ status: rich.httpStatus, transition: rich.transition, dryRun: rich.dryRun }));
    res.statusCode = rich.httpStatus;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({
      ok: rich.ok,
      transition: rich.transition,
      decision: rich.decision,
      dryRun: rich.dryRun,
    }));
  } catch {
    res.statusCode = 200;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ ok: false, transition: 'fail_closed', decision: null, dryRun: true }));
  }
}

export default function handler(req, res) {
  return handleNodeRequest(req, res);
}
