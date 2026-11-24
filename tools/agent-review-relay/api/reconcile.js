import { loadConfig, reconcileGateReport } from '../src/config.mjs';
import { createRuntime } from '../src/runtime.mjs';
import { handleReconcile } from '../src/reconcile.mjs';

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
      res.end(JSON.stringify({ ok: false, transition: 'rejected_method' }));
      return;
    }
    const rawBody = await readRawBody(req);
    const runtime = (deps.createRuntime || createRuntime)((deps.loadConfig || loadConfig)(deps.env || process.env));
    const rich = await handleReconcile({ rawBody, headers: req.headers || {}, runtime });
    console.info('lvpt_relay_reconcile', JSON.stringify({ status: rich.httpStatus, transition: rich.transition, count: rich.results.length }));
    if (rich.transition === 'rejected_signature' && rich.diagnostic) {
      console.info('lvpt_relay_reconcile_signature', JSON.stringify(rich.diagnostic));
    }
    if (rich.transition === 'reconcile_unavailable') {
      console.info('lvpt_relay_reconcile_readiness', JSON.stringify(reconcileGateReport(runtime.config, runtime)));
    }
    if (rich.preflight) {
      const category = ['ready', 'unauthorized', 'unsupported', 'rate_limited', 'invalid', 'unavailable'].includes(rich.preflight.category)
        ? rich.preflight.category
        : 'unavailable';
      console.info('lvpt_relay_cursor_preflight', JSON.stringify({
        status: Number.isInteger(rich.preflight.status) ? rich.preflight.status : 0,
        category,
        cached: rich.preflight.cached === true,
      }));
    }
    res.statusCode = rich.httpStatus;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ ok: rich.ok, transition: rich.transition, count: rich.results.length }));
  } catch {
    res.statusCode = 200;
    res.end(JSON.stringify({ ok: false, transition: 'fail_closed', count: 0 }));
  }
}

export default function handler(req, res) {
  return handleNodeRequest(req, res);
}
