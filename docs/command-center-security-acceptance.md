# Command Center security acceptance

Decision: **Hold production.** This file records the R18 private-data and authorization audit for the current workspace. It is source evidence plus deterministic local tests against current `public/` source and safe-build generated artifacts. It is not a live provider read, not a signed-in browser session on a deployed host, and not a probe of older production URLs.

Status words match the completion matrix: STAGING means present on this draft and still needs an owner session or live confirmation. NOT VERIFIED means evidence is missing. DISABLED means the control stays off. Do not treat a passing local test as LIVE VERIFIED.

## Capability status

| Control | Status | Evidence in this repo |
| --- | --- | --- |
| Private API reads | STAGING | `lib/owner-read-guard.mjs` `denyPrivateRead` runs before provider reads on protected sync/SMS/Gmail status routes. Missing session → 401. Foreign Origin → 403. Origin alone cannot authenticate. Signing primitives were not changed. See T30 inventory in `docs/baselines/local-completion-progress.md`. |
| Review session | STAGING | `lib/sms-review-session.mjs` mints/verifies the `__Host-lvpt-sms-review` HttpOnly cookie. Expiry and host binding are unit-tested. Cookie payload does not embed the device token. |
| Session expiry clears private UI state | STAGING | `tests/command-center-browser.test.mjs` proves unauthorized refresh clears the in-memory sheet snapshot and operating-picture cache and does not leave synthetic private values in `localStorage` / `sessionStorage`. |
| Archived private roster exclusion | STAGING | `archive/public-roster-2026-11-24/` holds the former public roster scripts. They are not under `public/`, not loaded by `public/v2/app.js`, and are asserted absent from public source and generated trees by `tests/private-asset-exposure.test.mjs`. Git history still contains them. |
| Private page indexing | STAGING | `public/v2/index.html` and `public/sms-review/index.html` declare `noindex,nofollow,noarchive`. No `public/robots.txt` is required for this control. |
| Credentials in public / generated output | STAGING | Acceptance mode requires safe-build artifacts, then scans `public/`, `.next/static` (publicly served), and `.next/server` (prerendered/server output). Credential patterns cover env-style and quoted JS/JSON property assignments with flexible whitespace. Zero hits on the measured run below. Workspace root has no `.env` / `credentials.json`. |
| Synthetic fixtures | STAGING | Command-center and auth regressions use `Synthetic` / `example.test` / synthetic tokens. Isolated positive controls in the exposure test prove detection without printing matched values. No customer message bodies are committed as fixtures. |
| Private messages vs browser storage | STAGING | SMS review modules and `sheet-snapshot.js` do not write message bodies to `localStorage` / `sessionStorage` / IndexedDB. Preferred sheet path keeps the signed-in snapshot in memory. Device token is not saved in browser storage. |
| Gmail / SMS send | DISABLED | `app/api/gmail/send/route.ts` returns 403. SMS reply remains staging-only with no production send. Four-times-daily approval automation stays disabled. |
| Deployment protection (current project policy) | STAGING | Repository docs (`SMS-STAGING-SETUP.md`, hub audit) state Vercel Authentication / SSO for preview and that the Automation Bypass token must not be stored in the browser or GitHub. This audit did not change Vercel dashboard settings and did not download historical customer material. |
| Historical / legacy deployment exposure | NOT VERIFIED | Older production and preview deployments were **not** requested or scraped. This package does **not** claim they no longer serve archived roster files or other private assets. |

## Measured local acceptance run (T31 revision)

| Step | Command | Exit code |
| --- | --- | --- |
| Auth regression (import-path fix) | `node .\tests\owner-read-guard.test.mjs` | **0** |
| Safe build (prebuild staging-safety + `next build`) | `npm.cmd run build` | **0** |
| Private-asset acceptance | `node .\tests\private-asset-exposure.test.mjs` | **0** |

Generated roots required and scanned:

| Root | Role | Files scanned | Credential hits |
| --- | --- | --- | --- |
| `public/` | Current public source | 43 | 0 |
| `.next/static` | Publicly served generated assets | 10 | 0 |
| `.next/server` | Prerendered / server output | 464 | 0 |

Optional roots (`out/`, `.vercel/output/static/`) were absent on this run and were not asserted present.

Bounded conclusions from this run only:

- Current public source and this safe-build output do not embed the scanned credential assignment patterns.
- Archived roster markers/filenames are absent from those trees.
- This does **not** prove older deployed URLs are clean.
- This does **not** authorize production release.

## Residual risks (sanitized)

| Path | Reason |
| --- | --- |
| `public/v2/js/central-sync.js` | Fallback still contains a `localStorage` write of event JSON when the in-memory sheet-snapshot helper is absent. Preferred path uses `lvptReloadSheetSnapshot`. Not a private SMS/Gmail message store; still a residual browser-storage risk for sheet-shaped records. |
| `public/lvpt-event-command-center.html` | Legacy demo MVP remains under `public/`. It uses demo/`example.com` seed data and browser `localStorage`. It is not the archived private roster package and is not loaded by the V2 command-center shell. |
| `public/v2/js/roster-source-notes.js` | Short source-note comments only. Not the archived roster scripts; contains no credentials. |
| `archive/public-roster-2026-11-24/**` | Intentionally retained offline. Must never be copied back into `public/`. |
| Git history | Prior commits may still contain roster content. History rewrite is out of scope and requires explicit owner authorization. |
| Production / older preview URLs | Not probed. Protection settings were not changed. Any cleanup of historical deployments is an owner ops decision. |

## What local verification covers

```text
npm.cmd run build
node .\tests\owner-read-guard.test.mjs
node .\tests\sms-review-session.test.mjs
node .\tests\private-asset-exposure.test.mjs
```

`tests/private-asset-exposure.test.mjs` fails closed when `.next/static` or `.next/server` is missing (run the safe build first). It checks current public source, required generated output, expanded credential patterns with synthetic positive controls (values not printed), synthetic fixtures, private-message storage owners, indexing meta tags, archived-roster exclusion, and documentation that does not falsely assert historical deployment safety.

Browser session-clear evidence remains in `tests/command-center-browser.test.mjs` (synthetic fixture + system Chrome). It is not a live sheet read.

## Owner-only checks (not done here)

1. Confirm Vercel Authentication / deployment protection is still enabled on the live project without pasting bypass tokens into chat or GitHub.
2. Open production and any retained older preview URLs signed out and confirm archived roster paths are not still served. This audit did not fetch those URLs.
3. Complete the signed-in staging checklist in `docs/command-center-staging-acceptance.md`.
4. Rotate credentials only if a material exposure is confirmed; do not rotate from this package.

## Release and rollback

Release remains owner-gated. Passing these checks does not authorize merge, production deploy, clasp push, Calendar writes, or customer sends.

Rollback: do not merge. Production stays on its current release. There is no Apps Script or database migration in this security package.

## Explicit non-claims

- Historical deployments are not asserted safe.
- Deployment protection was inspected from repository evidence only; dashboard settings were not changed.
- Archived roster content was not downloaded, redistributed, or printed to demonstrate exposure.
- Drawable cash, live collector heartbeats, and full-mailbox Gmail reads remain outside this audit.
- A clean local safe-build scan is not evidence that a previously published deployment was cleaned.

COMMAND_CENTER_SECURITY_ACCEPTANCE_READY
