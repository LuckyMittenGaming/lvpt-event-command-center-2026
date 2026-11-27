# T36 Full local regression — R21 Full gate

Updated: 2026-11-26 21:31 -05:00
Status: **IMPLEMENTED_TESTED** (local synthetic Full suite — not LIVE_VERIFIED)

Companion progress: `docs/baselines/local-completion-progress.md`
Preserved T35 baseline (unchanged): `docs/baselines/final-local-regression.md`
Policy: `AGENTS.md`, `remaining-spec.md` R21
Branch: `ai-build/command-center-loop` @ `6f00ddec47af9a7d08a7e93f94903d84ffd0cf26`

This document records the **T36 Full verification** run only.
The completed T35 lifecycle baseline remains in
`docs/baselines/final-local-regression.md` and must not be overwritten.

---

## Environment

| Field | Value |
| --- | --- |
| OS | Windows 10.0.26300 |
| Node (PATH) | `v24.22.1` (owner-approved local runtime) |
| npm | `11.17.0` |
| Chrome | `C:\Program Files\Google\Chrome\Application\chrome.exe` · `158.0.8127.37` |
| `LVPT_CHROME_PATH` | unset (auto-resolved) |
| playwright-core | `1.65.1` |
| CI Node pin | still `22` in workflow (unchanged; not used for this local run) |

---

## Attempt 1 — initial Full failure

Command:

```powershell
powershell.exe -NoProfile -File .\scripts\verify-command-center.ps1 -Mode Full
```

Observed process exit (T36 session shell marker): **`FULL_EXIT=1`**

Failing step:

```text
[verify] START node tests/command-hub-finance.test.cjs
...
Error: Cannot find module '../public/v2/js/ledger-finance.js'
Require stack:
- ...\tests\command-hub-finance.test.cjs
...
[verify] EXIT node tests/command-hub-finance.test.cjs code=1
[verify] FAIL: Verification failed at 'node tests/command-hub-finance.test.cjs' with exit code 1.
FULL_EXIT=1
```

### Exit-code evidence note

The initial failure exit code **1** was captured in the live T36 agent shell
output as `FULL_EXIT=1` and `EXIT ... command-hub-finance.test.cjs code=1`.

A durable on-disk Tee log for that first failure was **not** retained:
`.orchestrator/full-verify-t36.log` was created later for a successful rerun
and contains only `[verify] PASS Mode=Full`. No separate agent-tools log file
for Attempt 1 exists. The exit code below is therefore recorded from the
session shell result, not from a surviving failure log file.

| Field | Value |
| --- | --- |
| Full mode process exit | **1** |
| Failing step exit | **1** (`node tests/command-hub-finance.test.cjs`) |
| Root cause | Test required deleted `public/v2/js/ledger-finance.js` |

Steps that completed before the fail-fast stop (all exit **0**): CI syntax
(18), GAS syntax (3), CI regressions (27), calendar local-phase through
`calendar-task-reconcile.test.cjs`. Suite stopped at `command-hub-finance`.

---

## Corrective changes (Attempt 1 → Attempt 2)

1. `tests/command-hub-finance.test.cjs`
   - Retargeted require from missing `ledger-finance.js` to
     `public/v2/js/event-finance.js` (`buildLedger` / `inferRole`).
   - Preserved NIUM / Elevated / Certapro / Lineaje fixture intent with
     cents-based assertions and bank-settlement refusal.

2. `scripts/verify-command-center.ps1`
   - Expanded Full `LocalPhaseFiles` with applicable R00–R20 offline tests
     (`event-finance`, `event-status`, `event-mutation-contract`,
     `action-inbox`, `owner-read-guard`, `source-reliability`,
     `sms-scan-health`, `crm-attribution`, `gmail-ingest`,
     `approval-idempotency`, `operational-reports`,
     `private-asset-exposure`, `local-agent-policy`,
     `verify-command-center`, `rcs-collector`, `rcs-dedup`,
     `rcs-staging`, plus existing calendar suite and `rcs-live`).

No production credentials, clasp, Calendar writes, customer sends, Sheet
writes, git commit/push, or protected Apps Script / workflow edits.

---

## Attempt 2 — successful Full rerun

Command:

```powershell
powershell.exe -NoProfile -File .\scripts\verify-command-center.ps1 -Mode Full
```

| Field | Value |
| --- | --- |
| Mode steps | **79** |
| Process exit | **`FULL_EXIT=0`** |
| Result | `[verify] PASS Mode=Full` |
| Durable log | `.orchestrator/full-verify-t36.log` (PASS) |
| Agent-tools capture | `2c649433-8142-4117-8baa-a19df97aac9b.txt` |

Post-finish re-verification (same Full command + `git diff --check`) also
passed (`9d1f2900-fd0f-4b35-9fbf-dd09401c3d18.txt`, `POST_VERIFY_OK`).

### Category results (all exit 0)

| Category | Count / command | Exit |
| --- | --- | --- |
| Syntax | 18 `node --check` | **0** |
| GAS syntax | 3 Apps Script pipe checks | **0** |
| CI regressions | 27 workflow tests | **0** |
| Local-phase | 26 offline tests (calendar + R00–R20 additions + fixed hub finance) | **0** |
| Staging-safety | `npm.cmd run test:staging-safety` | **0** |
| Acceptance | `node tests/command-center-acceptance.test.mjs` | **0** |
| Browser | `node tests/command-center-browser.test.mjs` | **0** |
| TypeScript | `npx.cmd --no-install tsc --noEmit` | **0** |
| Build | `npm.cmd run build` | **0** (Next.js 16.3.1 compiled in 873ms) |

### Browser platforms

| Platform | Viewport | Result |
| --- | --- | --- |
| Chrome 158 (Windows Program Files) | desktop **1280** | PASS |
| Chrome 158 | mobile **375** | PASS |
| Chrome 158 | layout guards **320** / **280** | PASS |

Expected fixture console 401/503 lines during unauthorized / unavailable
paths do not fail the suite.

---

## Lifecycle / failure contracts

Covered by the preserved T35 baseline harnesses
(`tests/command-center-acceptance.test.mjs`,
`tests/command-center-browser.test.mjs`) and re-executed inside Full.
See `docs/baselines/final-local-regression.md` for the T35 lifecycle path
and failure-contract table. T36 did not weaken those assertions.

---

## Protected-file preservation

After T36 corrective edits and Full PASS, these paths remained **unmodified**:

- `apps-script/Code.gs`
- `apps-script/GmailEvidence.gs`
- `apps-script/GmailDraftContext.gs`
- `apps-script/appsscript.json`
- `apps-script/release/**`
- `apps-script/live/**`
- `apps-script/calendar-command-center/**`
- `.github/workflows/**`
- `docs/baselines/phase-*` historical baselines
- `docs/baselines/final-local-regression.md` (T35 baseline restored verbatim; content hash matches `HEAD:docs/baselines/final-local-regression.md`)

---

## Local development readiness (synthetic)

| Gate | Result |
| --- | --- |
| Deterministic regressions | PASS |
| Browser desktop + mobile | PASS |
| Staging-safety | PASS |
| TypeScript | PASS |
| Production build | PASS |
| Required tests missing/skipped | **None** in Full inventory after corrective expansion |
| Production mutation | **None** |
| Local synthetic development ready | **YES** (offline / fixture only) |

---

## Explicit non-claims / unresolved blockers

- Not LIVE_VERIFIED
- Not authenticated staging browser acceptance (**R22** — BLOCKED_OWNER)
- Not live Gmail / SMS / RCS / Calendar execution proof (**R23–R29** as applicable — BLOCKED_OWNER)
- Production remains HOLD
- Drawable cash / bank settlement remain unavailable by design

---

## Files changed for T36

- `tests/command-hub-finance.test.cjs`
- `scripts/verify-command-center.ps1`
- `docs/baselines/t36-full-local-regression.md` (this file)
- `docs/baselines/local-completion-progress.md` (references T35 + T36 records)

Not modified for T36 evidence storage:

- `docs/baselines/final-local-regression.md` (T35 baseline preserved)
