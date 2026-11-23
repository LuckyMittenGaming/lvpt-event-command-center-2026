import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');

function replay(fixture) {
  return spawnSync(process.execPath, [
    'tools/agent-review-relay/cli/replay.mjs',
    fixture,
  ], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      OPENAI_API_KEY: 'sk-canaryshouldnotleak',
      GITHUB_TOKEN: 'ghp_canaryshouldnotleakxxxx',
      GITHUB_WEBHOOK_SECRET: 'live-secret-should-not-be-used',
      AGENT_RELAY_ENABLED: 'true',
      AGENT_RELAY_LIVE: 'true',
      AGENT_RELAY_DRY_RUN: 'false',
    },
  });
}

function parse(result) {
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.includes('sk-canaryshouldnotleak'), false);
  assert.equal(result.stdout.includes('ghp_canary'), false);
  assert.equal(result.stdout.includes('live-secret-should-not-be-used'), false);
  const lines = result.stdout.trim().split('\n').map((line) => JSON.parse(line));
  return lines;
}

test('simulated Cursor loop plans two fixes, passes, and then stops', () => {
  const lines = parse(replay('tools/agent-review-relay/fixtures/cursor-loop.json'));
  const events = lines.slice(0, 4);
  const summary = lines.at(-1);
  assert.equal(summary.marker, 'RELAY_SIMULATION_COMPLETE');
  assert.equal(summary.dryRun, true);
  assert.deepEqual(events.map((event) => event.transition), [
    'dry_run_planned',
    'dry_run_planned',
    'pass_stopped',
    'already_stopped',
  ]);
  assert.deepEqual(events.map((event) => event.decision), [
    'REQUEST_CHANGES',
    'REQUEST_CHANGES',
    'PASS',
    null,
  ]);
  assert.deepEqual(events.map((event) => event.mentionsCursor), [true, true, false, false]);
  assert.equal(events[0].iterations, 1);
  assert.equal(events[1].iterations, 2);
  assert.equal(events.every((event) => event.dryRun), true);
  assert.equal(events[0].plannedComment.split('@cursor').length - 1, 1);
  assert.match(events[2].plannedComment, /does not wake a ChatGPT conversation/);
  assert.equal(events[3].plannedComment, null);
});

test('prompt injection in the fixture cannot redirect the dry-run or leak into the comment', () => {
  const lines = parse(replay('tools/agent-review-relay/fixtures/prompt-injection.json'));
  const event = lines[0];
  assert.equal(event.decision, 'REQUEST_CHANGES');
  assert.equal(event.mentionsCursor, true);
  assert.equal(event.plannedComment.includes('sk-'), false);
  assert.equal(event.plannedComment.includes('avery@'), false);
  assert.equal(event.plannedComment.includes('7025550101'), false);
  assert.equal(event.plannedComment.includes('evil.example'), false);
  assert.equal(event.plannedComment.includes('merge to main'), false);
  assert.match(event.plannedComment, /tests\/sample\.test\.mjs/);
});
