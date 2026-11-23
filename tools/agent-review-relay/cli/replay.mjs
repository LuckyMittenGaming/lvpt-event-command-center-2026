#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { simulationConfig } from '../src/config.mjs';
import { handleSignedDelivery } from '../src/webhook.mjs';
import { createRuntime } from '../src/runtime.mjs';
import { signGitHubBody } from '../src/signature.mjs';

const fixturePath = process.argv[2];
if (!fixturePath || process.argv.includes('--help')) {
  console.log('Usage: node tools/agent-review-relay/cli/replay.mjs <fixture.json>');
  process.exit(fixturePath ? 0 : 1);
}

const scenario = JSON.parse(readFileSync(fixturePath, 'utf8'));
const times = [];
for (const event of scenario.events || []) {
  const stamp = event.payload?.pull_request?.updated_at || event.payload?.comment?.created_at;
  const parsed = Date.parse(stamp || '');
  if (Number.isFinite(parsed)) times.push(parsed);
}
const now = (times.length ? Math.max(...times) : Date.parse('2026-11-23T21:00:00.000Z')) + 1000;
const config = simulationConfig();
const runtime = createRuntime(config, {
  now: () => now,
  forceDryRun: true,
  fetchImpl() {
    return Promise.reject(new Error('network disabled'));
  },
});

const results = [];
for (const event of scenario.events || []) {
  const rawBody = JSON.stringify(event.payload);
  const rich = await handleSignedDelivery({
    rawBody,
    headers: {
      'x-hub-signature-256': signGitHubBody(rawBody, config.webhookSecret),
      'x-github-delivery': event.deliveryId,
      'x-github-event': event.event,
    },
    runtime,
    suppliedEvidence: event.evidence || null,
  });
  results.push({
    deliveryId: event.deliveryId,
    transition: rich.transition,
    decision: rich.decision,
    dryRun: rich.dryRun,
    iterations: rich.iterations,
    mentionsCursor: Boolean(rich.plannedComment && rich.plannedComment.includes('\n@cursor ')),
    plannedComment: rich.plannedComment,
  });
}

for (const result of results) console.log(JSON.stringify(result));
console.log(JSON.stringify({ marker: 'RELAY_SIMULATION_COMPLETE', events: results.length, dryRun: true }));
