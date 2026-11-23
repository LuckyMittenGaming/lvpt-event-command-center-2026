// Owner wiring for a NEW, separate Vercel project rooted at tools/agent-review-relay.
// Do not move this file into the command center app/api tree.

import { loadConfig } from '../src/config.mjs';
import { createRuntime } from '../src/runtime.mjs';
import { handleWebhook } from '../src/webhook.mjs';

export async function POST(request) {
  const config = loadConfig(process.env);
  const runtime = createRuntime(config);
  return handleWebhook(request, runtime);
}
