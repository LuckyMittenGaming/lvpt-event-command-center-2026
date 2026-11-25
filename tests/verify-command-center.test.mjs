import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const scriptPath = join(root, 'scripts', 'verify-command-center.ps1');
const source = readFileSync(scriptPath, 'utf8');

const requiredCiTests = [
  'tests/sms-review.test.js',
  'tests/sms-intelligence.test.mjs',
  'tests/sms-reconciliation.test.cjs',
  'tests/sms-evidence.test.cjs',
  'tests/sms-action-queue.test.cjs',
  'tests/sms-reply-qualification.test.cjs',
  'tests/sms-message-preview.test.cjs',
  'tests/sms-inbox-diagnostics.test.cjs',
  'tests/sms-inbox-diagnostics-autoselect.test.mjs',
  'tests/sms-diagnostic-message.test.mjs',
  'tests/sms-negative-gmail-canary.test.mjs',
  'tests/sms-gas-long-thread-preview.test.cjs',
  'tests/sms-gas-recipient-verification.test.cjs',
  'tests/sms-reply-review.test.cjs',
  'tests/sms-reply-send.test.cjs',
  'tests/sms-reply-send-runtime.test.cjs',
  'tests/sms-reply-send-ui.test.cjs',
  'tests/sms-reply-ai.test.cjs',
  'tests/sms-draft-preview.test.cjs',
  'tests/sms-personalized-draft.test.cjs',
  'tests/sms-ai-smoke-test.test.cjs',
  'tests/sms-ai-oidc-auth.test.cjs',
  'tests/gmail-thread-triage.test.cjs',
  'tests/sms-gmail-intelligence.test.cjs',
  'tests/sms-gmail-scope-static.test.cjs',
  'tests/sms-review-audit-static.test.cjs',
  'tests/sms-review-session.test.mjs'
];

const requiredFullKinds = [
  'syntax',
  'gas-syntax',
  'ci-regression',
  'local-phase',
  'staging-safety',
  'acceptance',
  'browser',
  'typescript',
  'build'
];

assert.match(source, /ValidateSet\('Targeted',\s*'Full'\)/);
assert.match(source, /\$TestFiles/);
assert.match(source, /InventoryOnly/);
assert.match(source, /LVPT_VERIFY_OFFLINE/);
assert.match(source, /test:staging-safety/);
assert.match(source, /command-center-browser\.test\.mjs/);
assert.match(source, /tsc --noEmit/);
assert.match(source, /npm\.cmd run build/);
assert.match(source, /ForbiddenCommandFragments/);

const sourceOutsideDenyList = source.replace(/\$Script:ForbiddenCommandFragments = @\([\s\S]*?\)/, '');
assert.equal(/\bclasp\s+push\b/i.test(sourceOutsideDenyList), false);
assert.equal(/\bvercel\s+deploy\b/i.test(sourceOutsideDenyList), false);
assert.equal(/\bgit\s+push\b/i.test(sourceOutsideDenyList), false);
assert.equal(/lvpt-safe-readonly-dry-run\.cjs/.test(sourceOutsideDenyList), false);
assert.equal(/oauth2\.googleapis\.com\/token/.test(sourceOutsideDenyList), false);

function runVerifier(args) {
  const result = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-File', scriptPath, ...args],
    {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        LVPT_VERIFY_SELFTEST: '1',
        // Inject a fake credential that must be stripped / unused.
        LVPT_SMS_STAGING_SUPABASE_SERVICE_KEY: 'should-not-leak-into-child-tests',
        OPENAI_API_KEY: 'should-not-be-required'
      }
    }
  );
  return {
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    output: `${result.stdout || ''}\n${result.stderr || ''}`
  };
}

function parseInventoryJson(output) {
  const begin = output.indexOf('[verify-inventory-json]');
  const end = output.indexOf('[/verify-inventory-json]');
  assert.ok(begin >= 0 && end > begin, 'Expected [verify-inventory-json] markers in verifier output');
  const block = output.slice(begin + '[verify-inventory-json]'.length, end).trim();
  const parsed = JSON.parse(block);
  assert.ok(Array.isArray(parsed), 'Inventory JSON must be an array');
  return parsed;
}

const fullInventoryRun = runVerifier(['-Mode', 'Full', '-InventoryOnly']);
assert.equal(fullInventoryRun.status, 0, fullInventoryRun.output);
const fullInventory = parseInventoryJson(fullInventoryRun.output);
assert.ok(Array.isArray(fullInventory) && fullInventory.length > 0);

const kinds = new Set(fullInventory.map((item) => item.kind));
for (const kind of requiredFullKinds) {
  assert.ok(kinds.has(kind), `Full inventory missing kind: ${kind}`);
}

const fullPaths = new Set(fullInventory.map((item) => String(item.path || '').replace(/\\/g, '/')));
for (const file of requiredCiTests) {
  assert.ok(fullPaths.has(file), `Full inventory missing CI regression: ${file}`);
}
assert.ok(fullPaths.has('tests/command-center-acceptance.test.mjs'));
assert.ok(fullPaths.has('tests/command-center-browser.test.mjs'));
assert.ok(fullPaths.has('tests/calendar-safe-sync.test.cjs'), 'local-phase calendar coverage required');
assert.ok(fullInventory.some((item) => item.kind === 'staging-safety'));
assert.ok(fullInventory.some((item) => item.kind === 'typescript'));
assert.ok(fullInventory.some((item) => item.kind === 'build'));

const targetedInventoryRun = runVerifier([
  '-Mode',
  'Targeted',
  '-InventoryOnly',
  '-TestFiles',
  'tests/command-center-acceptance.test.mjs,tests/event-status.test.mjs'
]);
assert.equal(targetedInventoryRun.status, 0, targetedInventoryRun.output);
const targetedInventory = parseInventoryJson(targetedInventoryRun.output);
assert.equal(targetedInventory.length, 2);
assert.deepEqual(
  targetedInventory.map((item) => item.path.replace(/\\/g, '/')),
  ['tests/command-center-acceptance.test.mjs', 'tests/event-status.test.mjs']
);
assert.ok(targetedInventory.every((item) => item.kind === 'node-test'));

// Fail-fast: first file fails, second must not start.
const tempDir = mkdtempSync(join(tmpdir(), 'lvpt-verify-'));
const failPath = join(root, 'tests', '_verify-command-center-fail-temp.mjs');
const passProbePath = join(root, 'tests', '_verify-command-center-pass-temp.mjs');
const probeMarker = join(tempDir, 'second-ran.txt');

try {
  writeFileSync(
    failPath,
    "console.error('intentional verify fail-fast probe'); process.exit(17);\n",
    'utf8'
  );
  writeFileSync(
    passProbePath,
    `import { writeFileSync } from 'node:fs';\nwriteFileSync(${JSON.stringify(probeMarker)}, 'ran');\nconsole.log('second test should not run');\n`,
    'utf8'
  );

  const failRun = runVerifier([
    '-Mode',
    'Targeted',
    '-TestFiles',
    'tests/_verify-command-center-fail-temp.mjs,tests/_verify-command-center-pass-temp.mjs'
  ]);

  assert.notEqual(failRun.status, 0, 'Failing targeted command must return nonzero');
  assert.match(failRun.output, /EXIT node tests\/_verify-command-center-fail-temp\.mjs code=17|Verification failed/i);
  assert.equal(
    failRun.output.includes('START node tests/_verify-command-center-pass-temp.mjs'),
    false,
    'Runner must stop before later Targeted files after a failure'
  );
  assert.equal(
    failRun.output.includes('PASS Mode=Targeted'),
    false,
    'Runner must not report PASS after a failed step'
  );

  let secondRan = false;
  try {
    readFileSync(probeMarker, 'utf8');
    secondRan = true;
  } catch {
    secondRan = false;
  }
  assert.equal(secondRan, false, 'Second Targeted test file must not execute after fail-fast stop');
} finally {
  try { rmSync(failPath, { force: true }); } catch { /* ignore */ }
  try { rmSync(passProbePath, { force: true }); } catch { /* ignore */ }
  try { rmSync(tempDir, { recursive: true, force: true }); } catch { /* ignore */ }
}

console.log('verify-command-center runner regression passed');
