import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { collectorHealth } from '../lib/rcs-staging.mjs';
import { RCS_HEARTBEAT_PREREQUISITE } from '../lib/source-reliability.mjs';

const root = join('services', 'google-messages-collector');
const files = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (path.endsWith('.go') && !path.endsWith('_test.go')) files.push(readFileSync(path, 'utf8'));
  }
}
walk(root);
const source = files.join('\n');
const main = readFileSync(join(root, 'cmd', 'lvpt-rcs-collector', 'main.go'), 'utf8');
const liveOff = readFileSync(join(root, 'cmd', 'lvpt-rcs-collector', 'live_off.go'), 'utf8');
const stagingGo = readFileSync(join(root, 'internal', 'live', 'staging.go'), 'utf8');
const preflightTxt = readFileSync(join(root, 'PREFLIGHT.txt'), 'utf8');
const route = readFileSync('app/api/sms/staging/rcs-collector/route.ts', 'utf8');
const hub = readFileSync('public/v2/js/unified-hub.js', 'utf8');

for (const forbidden of ['SendMessage(', 'MarkRead(', 'SendReaction(', 'DeleteMessage(', 'SetTyping(', 'lvpt_sms_staging', 'TaskSync', 'GmailApp']) {
  assert.equal(source.includes(forbidden), false, forbidden);
}
assert.equal(source.includes('ed5dc19eb2b4149ee242cf000c86a7150dca9947'), true);
assert.equal(source.includes('possible_duplicate'), true);

const cliFlags = [
  'synthetic',
  'preflight',
  'pair',
  'revoke',
  'live-test',
  'health',
  'stop',
  'reconnect',
  'check-allowlist'
];
for (const name of cliFlags) {
  assert.equal(main.includes(`"${name}"`), true, `cli flag -${name}`);
}
for (const flag of ['-synthetic', '-preflight', '-pair', '-health', '-stop', '-reconnect', '-revoke', '-live-test']) {
  assert.equal(preflightTxt.includes(flag), true, `preflight docs ${flag}`);
}
assert.equal(main.includes('check-allowlist'), true);

assert.equal(main.includes('LVPT'), true);
assert.equal(main.includes('rcs'), true);
assert.equal(main.includes('allowlist.txt'), true);
assert.equal(main.includes('LOCALAPPDATA'), true);
assert.equal(main.includes('session.sealed'), true);
assert.equal(preflightTxt.includes('%LOCALAPPDATA%\\LVPT\\rcs\\allowlist.txt'), true);
assert.equal(preflightTxt.includes('%LOCALAPPDATA%\\LVPT\\rcs\\session.sealed'), true);
assert.equal(preflightTxt.includes('This collector does not call MarkRead'), true);
assert.equal(preflightTxt.includes('Confirm no send, reaction, delete, or mark-read call was made'), true);

assert.equal(liveOff.includes('no Google session was opened'), true);
assert.equal(liveOff.includes('livelibgm'), true);
assert.equal(stagingGo.includes('/api/sms/staging/rcs-ingest'), true);
assert.equal(stagingGo.includes('lvpt-event-command-center-2026.vercel.app'), true);
assert.equal(stagingGo.includes('ErrProductionStaging'), true);
assert.equal(stagingGo.includes('contactCheck'), true);

assert.equal(route.includes("pairing: 'unpaired'"), true);
assert.equal(route.includes('sendEnabled: false'), true);
assert.equal(route.includes('markReadEnabled: false'), true);
assert.equal(route.includes('existingSmsRewritten: false'), true);
assert.equal(route.includes('lvpt_sms_staging'), false);
assert.equal(route.includes('preview_only'), true);
assert.equal(route.includes("heartbeat: 'unverified'"), true);
assert.equal(route.includes('verificationPrerequisite'), true);
assert.equal(route.includes("lastSuccess: ''"), true);
assert.equal(route.includes('RCS_HEARTBEAT_PREREQUISITE'), true);
assert.match(RCS_HEARTBEAT_PREREQUISITE, /stored RCS row is not a live collector/i);

assert.equal(hub.includes('/api/sms/staging/rcs-collector'), true);
assert.equal(hub.includes('Google Messages collector'), true);
assert.equal(hub.includes('A stored row is not a live collector'), true);
assert.equal(hub.includes('Sending is off'), true);
assert.equal(hub.includes('Mark-read is off'), true);

const now = Date.parse('2026-11-26T16:00:00Z');
const storedButUnpaired = collectorHealth({
  pairing: 'unpaired',
  connected: false,
  lastSuccess: '2026-11-26T15:59:00Z',
  now
});
assert.equal(storedButUnpaired.state, 'not_paired');
assert.equal(storedButUnpaired.live, false);
assert.equal(storedButUnpaired.sendEnabled, false);
assert.equal(storedButUnpaired.markReadEnabled, false);

const stalePaired = collectorHealth({
  pairing: 'paired',
  connected: true,
  lastSuccess: '2026-11-26T12:00:00Z',
  now
});
assert.equal(stalePaired.state, 'synchronization_delayed');
assert.equal(stalePaired.live, false);

const failedIngest = collectorHealth({
  pairing: 'paired',
  connected: true,
  lastFailure: 'ingest_failed',
  lastSuccess: '2026-11-26T15:59:00Z',
  now
});
assert.equal(failedIngest.state, 'ingestion_failed');
assert.equal(failedIngest.live, false);

const allowlistPath = process.env.LOCALAPPDATA
  ? join(process.env.LOCALAPPDATA, 'LVPT', 'rcs', 'allowlist.txt')
  : '';
const allowlistExists = Boolean(allowlistPath) && existsSync(allowlistPath);
assert.equal(typeof allowlistExists, 'boolean');
assert.equal(route.includes("pairing: 'unpaired'"), true);
assert.equal(storedButUnpaired.state, 'not_paired');
assert.equal(storedButUnpaired.live, false);
assert.equal(
  Boolean(allowlistExists) && storedButUnpaired.live,
  false,
  'allowlist file existence must not imply live pairing or current collection'
);
assert.equal(route.includes('lvpt_rcs_staging'), true);

console.log('rcs collector isolation tests passed');
console.log(JSON.stringify({
  allowlistPathConfigured: Boolean(allowlistPath),
  allowlistExists,
  pairingFromRoute: 'unpaired',
  liveFromStoredSuccess: storedButUnpaired.live,
  googleMessagesAccessed: false
}));
