/**
 * R18 / T31 — Private asset exposure audit (deterministic, sanitized).
 *
 * Acceptance mode requires generated public artifacts from the existing
 * safe build (`npm run build` → prebuild staging-safety + next build).
 * Never prints matching secret values or customer content — findings
 * report path + reason only.
 */
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const findings = [];

function rel(abs) {
  return relative(root, abs).split(sep).join('/');
}

function record(path, reason) {
  findings.push({ path, reason });
}

function walkFiles(dir, filter = () => true, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(abs, filter, out);
    else if (filter(abs, entry.name)) out.push(abs);
  }
  return out;
}

function readText(abs) {
  return readFileSync(abs, 'utf8');
}

function isTextCandidate(name) {
  return /\.(html?|js|mjs|cjs|css|json|txt|md|map|xml|svg|ts|tsx|rsc)$/i.test(name);
}

/** Credential names that must not appear as assigned values in public/generated assets. */
const CREDENTIAL_NAMES = [
  'SUPABASE_SERVICE_ROLE',
  'SUPABASE_SERVICE_ROLE_KEY',
  'VERCEL_AUTOMATION_BYPASS_SECRET',
  'VERCEL_AUTOMATION_BYPASS',
  'LVPT_SMS_STAGING_SUPABASE_SERVICE_KEY',
  'LVPT_SMS_STAGING_DATA_KEY_BASE64',
  'LVPT_SMS_STAGING_TOKEN_SHA256',
  'SMS_REVIEW_SESSION_SECRET',
  'DEVICE_TOKEN'
];

function assignmentPatternsFor(name) {
  const n = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [
    // env / bare: NAME = "value" or NAME="value" (whitespace flexible)
    new RegExp(`${n}\\s*=\\s*['"][^'"]{12,}`),
    // JS/JSON property: NAME: "value" or "NAME": 'value'
    new RegExp(`(?:["']${n}["']|\\b${n}\\b)\\s*:\\s*['"][^'"]{12,}`)
  ];
}

const SECRET_PATTERNS = [
  { id: 'aws-access-key', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { id: 'private-key-block', re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { id: 'stripe-live-key', re: /\bsk_live_[A-Za-z0-9]{16,}\b/ },
  { id: 'github-pat', re: /\bghp_[A-Za-z0-9]{20,}\b/ },
  { id: 'jwt-like-secret', re: /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/ },
  ...CREDENTIAL_NAMES.flatMap((name) => {
    const [eq, colon] = assignmentPatternsFor(name);
    return [
      { id: `${name.toLowerCase()}-eq-assignment`, re: eq },
      { id: `${name.toLowerCase()}-colon-assignment`, re: colon }
    ];
  })
];

function detectSecretPatternIds(text) {
  const hits = [];
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.re.test(text)) hits.push(pattern.id);
  }
  return hits;
}

// --- 0. Isolated synthetic positive controls (never print matched values) ---
const POSITIVE_CONTROLS = [
  { expectId: 'supabase_service_role-eq-assignment', sample: 'SUPABASE_SERVICE_ROLE = "syn_service_role_xxxxxxxxxxxxxxxx"' },
  { expectId: 'supabase_service_role-colon-assignment', sample: '{ "SUPABASE_SERVICE_ROLE": "syn_service_role_yyyyyyyyyyyyyyyy" }' },
  { expectId: 'supabase_service_role_key-eq-assignment', sample: 'SUPABASE_SERVICE_ROLE_KEY="syn_service_role_key_zzzzzzzzzzzz"' },
  { expectId: 'vercel_automation_bypass_secret-colon-assignment', sample: 'VERCEL_AUTOMATION_BYPASS_SECRET: \'syn_bypass_secret_aaaaaaaaaaaa\'' },
  { expectId: 'lvpt_sms_staging_data_key_base64-eq-assignment', sample: 'LVPT_SMS_STAGING_DATA_KEY_BASE64  =  "c3luX2RhdGFfa2V5X2JiYmJiYmJiYmI="' },
  { expectId: 'sms_review_session_secret-colon-assignment', sample: 'smsCfg = { SMS_REVIEW_SESSION_SECRET: "syn_session_secret_cccccccccccc" }' },
  { expectId: 'device_token-eq-assignment', sample: "DEVICE_TOKEN='syn_device_token_dddddddddddd'" },
  { expectId: 'aws-access-key', sample: 'accessKeyId = "AKIASYNTHETICKEY0001"' },
  { expectId: 'private-key-block', sample: '-----BEGIN RSA PRIVATE KEY-----\nSYNTHETIC\n-----END RSA PRIVATE KEY-----' },
  { expectId: 'stripe-live-key', sample: 'key = "sk_live_syntheticstripekey01"' },
  { expectId: 'github-pat', sample: 'token = "ghp_syntheticgithubpat0001"' },
  { expectId: 'jwt-like-secret', sample: 'auth = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJzeW4ifQ.synthetic_sig_xxxxx"' }
];

for (const control of POSITIVE_CONTROLS) {
  const hits = detectSecretPatternIds(control.sample);
  assert.ok(
    hits.includes(control.expectId),
    `positive control must detect ${control.expectId} (detected=${hits.join(',') || 'none'}; value not printed)`
  );
}

// Negative control: documentation mentioning names without assigned secret values must not trip.
const negativeDoc = 'Set SUPABASE_SERVICE_ROLE in Vercel. Never commit DEVICE_TOKEN. See SMS-STAGING-SETUP.md.';
assert.equal(
  detectSecretPatternIds(negativeDoc).length,
  0,
  'credential name mentions without assigned values must not match'
);

const ARCHIVED_ROSTER_DIR = 'archive/public-roster-2026-11-24';
const ARCHIVED_ROSTER_FILES = [
  'live-roster.js',
  'roster-nium.js',
  'roster-neo.js',
  'roster-lineaje.js',
  'roster-confirmed-updates.js',
  'nium-profit-lineaje-neo-update.js'
];
const ARCHIVED_MARKERS = [
  'LIVE_ROSTER_VERSION',
  'LIVE_ROSTER_KEY',
  'cloneLiveRoster',
  'LVPT_LIVE_EVENTS',
  'mergeOfficialWithLocal'
];

const PRIVATE_PAGES = [
  'public/v2/index.html',
  'public/sms-review/index.html'
];

const MESSAGE_STORAGE_OWNERS = [
  'public/sms-review/app.js',
  'public/sms-review/review-engine.js',
  'public/sms-review/case-engine.js',
  'public/sms-review/message-preview.js',
  'public/sms-review/reply-workflow.js',
  'public/sms-review/draft-helper.js',
  'public/v2/js/sheet-snapshot.js',
  'public/v2/js/authoritative-finance.js',
  'lib/sms-review-session.mjs'
];

const FIXTURE_FILES = [
  'tests/command-center-browser.test.mjs',
  'tests/command-center-acceptance.test.mjs',
  'tests/owner-read-guard.test.mjs',
  'tests/sms-review-session.test.mjs',
  'tests/sms-intelligence.test.mjs'
];

// --- 1. Archived private roster stays out of public source ---
const archiveDir = join(root, ARCHIVED_ROSTER_DIR);
assert.equal(existsSync(archiveDir), true, `${ARCHIVED_ROSTER_DIR} must remain archived`);
for (const name of ARCHIVED_ROSTER_FILES) {
  const archived = join(archiveDir, name);
  assert.equal(existsSync(archived), true, `archived roster file missing: ${name}`);
  assert.equal(existsSync(join(root, 'public', name)), false, `archived roster must not be served from public/: ${name}`);
  assert.equal(existsSync(join(root, 'public', 'v2', name)), false, `archived roster must not be served from public/v2/: ${name}`);
  assert.equal(existsSync(join(root, 'public', 'v2', 'js', name)), false, `archived roster must not be served from public/v2/js/: ${name}`);
}

const publicTextFiles = walkFiles(join(root, 'public'), (abs, name) => isTextCandidate(name));
for (const abs of publicTextFiles) {
  const text = readText(abs);
  const path = rel(abs);
  for (const name of ARCHIVED_ROSTER_FILES) {
    if (text.includes(name) || text.includes(`archive/public-roster-2026-11-24/${name}`)) {
      record(path, `references archived roster asset ${name}`);
    }
  }
  for (const marker of ARCHIVED_MARKERS) {
    if (text.includes(marker)) record(path, `contains archived-roster marker ${marker}`);
  }
}

const appLoader = readText(join(root, 'public', 'v2', 'app.js'));
for (const name of ARCHIVED_ROSTER_FILES) {
  assert.equal(appLoader.includes(name), false, `v2 app loader must not load ${name}`);
}
assert.doesNotMatch(appLoader, /live-roster|LVPT_LIVE_EVENTS|cloneLiveRoster/);

// --- 2. Private operational pages exclude indexing ---
for (const page of PRIVATE_PAGES) {
  const abs = join(root, page);
  assert.equal(existsSync(abs), true, `missing private page ${page}`);
  const html = readText(abs);
  assert.match(html, /<meta\s+name=["']robots["']\s+content=["'][^"']*noindex[^"']*["']/i, `${page} must declare noindex`);
  assert.match(html, /nofollow/i, `${page} must declare nofollow`);
  assert.match(html, /noarchive/i, `${page} must declare noarchive`);
}

assert.equal(existsSync(join(root, 'public', 'robots.txt')), false,
  'No public robots.txt is required; private pages rely on meta robots');

// --- 3. Generated public artifacts REQUIRED (acceptance mode) ---
const REQUIRED_GENERATED_ROOTS = [
  { id: 'next-static', path: join(root, '.next', 'static'), kind: 'publicly-served' },
  { id: 'next-prerender', path: join(root, '.next', 'server'), kind: 'prerendered-server-output' }
];

const missingGenerated = REQUIRED_GENERATED_ROOTS.filter((entry) => !existsSync(entry.path));
assert.equal(
  missingGenerated.length,
  0,
  `Acceptance mode requires generated public artifacts from the safe build (npm run build). Missing: ${missingGenerated.map((m) => rel(m.path)).join(', ') || 'none'}`
);

const optionalGeneratedRoots = [
  { id: 'static-export-out', path: join(root, 'out'), kind: 'static-export' },
  { id: 'vercel-output-static', path: join(root, '.vercel', 'output', 'static'), kind: 'vercel-output' }
].filter((entry) => existsSync(entry.path));

const generatedRoots = [...REQUIRED_GENERATED_ROOTS, ...optionalGeneratedRoots];
const generatedScanSummary = [];

const credentialHits = [];

function scanTree(scanRoot, label) {
  const files = walkFiles(scanRoot, (abs, name) => isTextCandidate(name));
  let hitCount = 0;
  for (const abs of files) {
    const text = readText(abs);
    const path = rel(abs);
    for (const id of detectSecretPatternIds(text)) {
      credentialHits.push({ path, reason: `credential-pattern:${id}` });
      hitCount += 1;
    }
    for (const name of ARCHIVED_ROSTER_FILES) {
      if (text.includes(name)) record(path, `generated-output references archived roster asset ${name}`);
    }
    for (const marker of ARCHIVED_MARKERS) {
      if (text.includes(marker)) record(path, `generated-output contains archived-roster marker ${marker}`);
    }
  }
  return { label, root: rel(scanRoot), filesScanned: files.length, credentialHits: hitCount };
}

generatedScanSummary.push(scanTree(join(root, 'public'), 'public-source'));
for (const entry of generatedRoots) {
  generatedScanSummary.push(scanTree(entry.path, `${entry.kind}:${entry.id}`));
}

for (const hit of credentialHits) record(hit.path, hit.reason);
assert.equal(
  credentialHits.length,
  0,
  `public/generated output must not embed credentials (sanitized): ${credentialHits.map((h) => `${h.path} (${h.reason})`).join('; ') || 'none'}`
);

for (const banned of ['.env', '.env.local', '.env.production', 'credentials.json']) {
  assert.equal(existsSync(join(root, banned)), false, `${banned} must not be present in the workspace root`);
}

// --- 4. Fixtures are synthetic; no private message persistence in localStorage ---
for (const fixture of FIXTURE_FILES) {
  const abs = join(root, fixture);
  if (!existsSync(abs)) continue;
  const text = readText(abs);
  const path = rel(abs);
  const syntheticOk =
    /Synthetic|example\.test|example\.com|555-01\d{2}|synthetic-|device-test|sms-dev-/i.test(text) ||
    /randomBytes|A{20,}|5{20,}|6{20,}/.test(text);
  assert.equal(syntheticOk, true, `${path} must use synthetic fixture markers`);
  for (const id of detectSecretPatternIds(text)) {
    // Positive-control samples live only in this file; other fixtures must stay clean.
    if (path !== 'tests/private-asset-exposure.test.mjs') {
      record(path, `fixture-credential-pattern:${id}`);
    }
  }
}

for (const owner of MESSAGE_STORAGE_OWNERS) {
  const abs = join(root, owner);
  assert.equal(existsSync(abs), true, `missing storage owner ${owner}`);
  const text = readText(abs);
  const path = rel(abs);
  const writesStorage =
    /localStorage\.setItem\s*\(|sessionStorage\.setItem\s*\(|indexedDB\.open\s*\(/i.test(text);
  if (writesStorage) {
    const isRemovalOnly =
      /localStorage\.removeItem|sessionStorage\.removeItem/.test(text) &&
      !/localStorage\.setItem\s*\(|sessionStorage\.setItem\s*\(/.test(text);
    if (!isRemovalOnly) record(path, 'private-message-owner writes browser storage');
  }
  assert.doesNotMatch(
    text,
    /localStorage\.setItem\s*\(\s*['"][^'"]*(message|sms|body|ciphertext|gmail|thread)/i,
    `${path} must not persist message content keys`
  );
}

const sheetSnapshot = readText(join(root, 'public/v2/js/sheet-snapshot.js'));
assert.doesNotMatch(sheetSnapshot, /localStorage|sessionStorage|indexedDB/i,
  'sheet-snapshot must keep the signed-in snapshot in memory only');

const smsReviewHtml = readText(join(root, 'public/sms-review/index.html'));
assert.match(smsReviewHtml, /not written to browser storage|Raw messages are not written to browser storage/i);

const hub = readText(join(root, 'public/v2/js/unified-hub.js'));
assert.doesNotMatch(hub, /localStorage\.setItem\s*\(\s*['"][^'"]*(message|sms|body|ciphertext)/i);
const lifecycle = readText(join(root, 'public/v2/js/lifecycle-command-center.js'));
assert.match(lifecycle, /localStorage\.setItem\(VIEW_KEY/);
assert.doesNotMatch(lifecycle, /localStorage\.setItem\s*\(\s*['"][^'"]*(message|sms|body|ciphertext)/i);

const centralSync = readText(join(root, 'public/v2/js/central-sync.js'));
assert.match(centralSync, /lvptReloadSheetSnapshot/,
  'central-sync must prefer the in-memory sheet snapshot helper');
if (/localStorage\.setItem\(STORAGE_KEY,\s*JSON\.stringify\(events\)\)/.test(centralSync)) {
  record('public/v2/js/central-sync.js', 'residual-fallback:event-json-localStorage-when-snapshot-helper-absent');
}

// --- 5. Logs and orchestrator state must not embed live secrets ---
const logDirs = ['logs', '.orchestrator'].map((d) => join(root, d)).filter((d) => existsSync(d));
for (const dir of logDirs) {
  for (const abs of walkFiles(dir, (a, name) => isTextCandidate(name) || name.endsWith('.log'))) {
    const text = readText(abs);
    const path = rel(abs);
    // Skip this test file if ever copied; otherwise report sanitized hits only.
    if (path.endsWith('private-asset-exposure.test.mjs')) continue;
    for (const id of detectSecretPatternIds(text)) {
      record(path, `log-credential-pattern:${id}`);
    }
  }
}

// --- 6. Deployment protection evidence (inspect only; do not assert historical safety) ---
const protectionEvidenceFiles = [
  'SMS-STAGING-SETUP.md',
  'docs/baselines/lvpt-unified-hub-audit.md',
  'docs/command-center-staging-acceptance.md',
  'docs/command-center-completion-matrix.md'
];
let protectionEvidence = 0;
for (const file of protectionEvidenceFiles) {
  const abs = join(root, file);
  if (!existsSync(abs)) continue;
  const text = readText(abs);
  if (/Vercel Authentication|deployment protection|Protection Bypass|Vercel SSO/i.test(text)) {
    protectionEvidence += 1;
  }
}
assert.ok(
  protectionEvidence >= 1,
  'Repository docs must retain deployment-protection evidence without requiring live dashboard mutation'
);

const historicalProbeClaim = /older deployments (?:are|were) (?:safe|cleaned|verified)|historical deployments? (?:are|were) safe/i;
for (const file of [
  'docs/command-center-security-acceptance.md',
  'docs/command-center-staging-acceptance.md',
  'docs/command-center-completion-matrix.md'
]) {
  const abs = join(root, file);
  if (!existsSync(abs)) continue;
  const text = readText(abs);
  assert.doesNotMatch(
    text,
    historicalProbeClaim,
    `${rel(abs)} must not falsely claim historical deployment safety`
  );
}

// --- 7. Findings must stay sanitized (path + reason only) ---
for (const finding of findings) {
  assert.equal(typeof finding.path, 'string');
  assert.equal(typeof finding.reason, 'string');
  assert.ok(finding.path.length > 0 && finding.reason.length > 0);
  assert.doesNotMatch(finding.reason, /eyJ[A-Za-z0-9_-]{10,}|sk_live_|AKIA[0-9A-Z]{16}|BEGIN [A-Z ]*PRIVATE KEY/);
}

const blocking = findings.filter((f) => !f.reason.startsWith('residual-'));
assert.equal(
  blocking.length,
  0,
  `blocking private-asset findings (sanitized): ${blocking.map((f) => `${f.path} :: ${f.reason}`).join(' | ') || 'none'}`
);

const residual = findings.filter((f) => f.reason.startsWith('residual-'));
console.log(
  JSON.stringify(
    {
      ok: true,
      acceptanceMode: 'generated-artifacts-required',
      publicFilesScanned: publicTextFiles.length,
      generatedRootsRequired: REQUIRED_GENERATED_ROOTS.map((e) => rel(e.path)),
      generatedRootsOptionalPresent: optionalGeneratedRoots.map((e) => rel(e.path)),
      scanSummary: generatedScanSummary,
      protectionEvidenceDocs: protectionEvidence,
      residualRisks: residual.map((f) => ({ path: f.path, reason: f.reason })),
      historicalDeploymentsProbed: false,
      productionHold: true,
      note: 'Older production URLs were not fetched. Do not treat historical deployments as cleaned. Safe build artifacts were scanned; this is not a live deployment probe.'
    },
    null,
    2
  )
);
console.log('private-asset-exposure checks passed.');
