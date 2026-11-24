import assert from 'node:assert/strict';
import test from 'node:test';
import { assertLiveReady, loadConfig, simulationConfig } from '../src/config.mjs';
import { FIXTURE_WEBHOOK_SECRET, OPENAI_RESPONSES_URL, RELAY_BASE, RELAY_REPO } from '../src/constants.mjs';

test('defaults are off, dry-run, and capped at three corrections', () => {
  const config = loadConfig({});
  assert.equal(config.enabled, false);
  assert.equal(config.dryRun, true);
  assert.equal(config.live, false);
  assert.equal(config.killSwitch, false);
  assert.equal(config.maxIterations, 3);
  assert.equal(config.spendCapUsd, 1);
  assert.equal(config.openaiUrl, OPENAI_RESPONSES_URL);
  assert.equal(config.webhookSecret, '');
  assert.equal(config.openaiApiKey, '');
  assert.deepEqual(assertLiveReady(config).includes('disabled'), true);
});

test('iteration and spend settings cannot be raised past the hard ceiling', () => {
  const config = loadConfig({
    AGENT_RELAY_MAX_ITERATIONS: '99',
    AGENT_RELAY_SPEND_CAP_USD: '1000',
    AGENT_RELAY_OPENAI_URL: 'http://evil.example/steal',
    AGENT_RELAY_ALLOWED_BASE: 'main',
    AGENT_RELAY_ALLOWED_REPO: 'evil/other',
  });
  assert.equal(config.maxIterations, 3);
  assert.equal(config.spendCapUsd, 1);
  assert.equal(config.openaiUrl, OPENAI_RESPONSES_URL);
  assert.equal(RELAY_BASE, 'feature/unified-command-center-staging');
  assert.equal(RELAY_REPO, 'LuckyMittenGaming/lvpt-event-command-center-2026');
});

test('a zero spend cap is kept and live mode rejects the public fixture secret', () => {
  const config = loadConfig({
    AGENT_RELAY_ENABLED: 'true',
    AGENT_RELAY_DRY_RUN: 'false',
    AGENT_RELAY_LIVE: 'true',
    AGENT_RELAY_SPEND_CAP_USD: '0',
    GITHUB_WEBHOOK_SECRET: FIXTURE_WEBHOOK_SECRET,
    OPENAI_API_KEY: 'sk-canaryshouldnotleakxxxxxx',
    GITHUB_TOKEN: `github_pat_${'a'.repeat(24)}`,
    AGENT_RELAY_STATE_PATH: '/tmp/relay-state.json',
  });
  assert.equal(config.spendCapUsd, 0);
  assert.equal(config.dryRun, false);
  const problems = assertLiveReady(config);
  assert.equal(problems.includes('webhook_secret'), true);
  assert.equal(problems.includes('openai'), true);
});

test('simulation mode ignores ambient credentials', () => {
  const config = simulationConfig();
  assert.equal(config.enabled, true);
  assert.equal(config.dryRun, true);
  assert.equal(config.live, false);
  assert.equal(config.openaiApiKey, '');
  assert.equal(config.githubToken, '');
  assert.equal(assertLiveReady(config).length > 0, true);
});
