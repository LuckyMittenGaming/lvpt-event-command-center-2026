# Local test environment — Windows verification baseline

Updated: 2026-11-25 (America/New_York)
Task: R01 / orchestrator T3 complete (owner-approved Node 24 local runtime)
Scope: environment discovery, browser harness path resolution, and offline local verification runner.
No production credentials, customer content, or paid browser services.
T2/T3 agents did not edit dependency manifests or install runtimes; pinned `playwright-core` arrived via approved commit `1c9b1ec`.
T3 added `scripts/verify-command-center.ps1`.

---

## Owner-approved local Node runtime

| Field | Value |
| --- | --- |
| Owner decision | **Approved** — Node 24 (`node -v` on this host) is explicitly approved for **local verification across all tasks** |
| Decision date | 2026-11-25 |
| Approved runtime | PATH `node --version` → `v24.22.1` (`C:\Users\wsopa\AppData\Local\cursor-agent\versions\2026.11.22-e9042b2\node.exe`) |
| Also present | `C:\Program Files\nodejs\node.exe` → `v24.19.0` |
| CI workflow pin | Still `node-version: '22'` in `.github/workflows/sms-intelligence-review-ci.yml` (unchanged; GitHub Actions contract) |
| Local policy | Do **not** re-escalate or block tasks solely because local major is 24 vs CI 22. Use the owner-approved Node 24 runtime for local verification. |
| Manifests / installs | No Node install and no package manifest changes from this approval recording |

---

## Runtime discovery (read-only)

| Check | Result | Notes |
| --- | --- | --- |
| `Get-Command node` (PATH) | `C:\Users\wsopa\AppData\Local\cursor-agent\versions\2026.11.22-e9042b2\node.exe` | Reports `v24.22.1` — **owner-approved** for local verification. |
| `node --version` (PATH) | `v24.22.1` | Used for T3 finish verification. |
| `C:\Program Files\nodejs\node.exe --version` | `v24.19.0` | System install; major 24. |
| Cursor helper `E:\cursor\resources\app\resources\helpers\node.exe --version` | `v24.22.1` | Bundled helper; major 24. |
| `npm.cmd --version` | `11.17.0` | Present. |
| Node 22 binary on this host | NOT FOUND | Historical discovery; superseded by owner Node 24 approval for local work. |
| `git --version` | Available via PATH | Inspection only; local agents must not commit/push. |
| `Get-Command cursor` | `cursor.cmd` → `E:\cursor\resources\app\bin\cursor.cmd` | Discovered; not invoked for paid agent execution. |
| `Get-Command cursor-agent` | `cursor-agent.ps1` → `C:\Users\wsopa\AppData\Local\cursor-agent\versions\2026.11.22-e9042b2\cursor-agent.ps1` | Discovered; not invoked for paid orchestration. |
| Paid CLI / cloud agent run | Not invoked | Deterministic local checks only. |

### T3 deterministic verification (Node 24, owner-approved)

```powershell
node .\tests\verify-command-center.test.mjs; if ($LASTEXITCODE -ne 0) { throw 'Runner regression failed' }; powershell.exe -NoProfile -File .\scripts\verify-command-center.ps1 -Mode Targeted -TestFiles tests/command-center-acceptance.test.mjs
```

| Field | Value |
| --- | --- |
| Runtime | `v24.22.1` (PATH) |
| `node .\tests\verify-command-center.test.mjs` | **exit 0** |
| Targeted acceptance via verify script | **exit 0** |
| Status | **IMPLEMENTED_TESTED** — R01/T3 finished under owner-approved Node 24 |

---

## Browser executable resolution

Implemented in `tests/command-center-browser.test.mjs`.

### Override

- Environment variable: `LVPT_CHROME_PATH`
- When set (non-empty after trim): path must exist, be a readable file, or the harness **fails immediately** with an actionable message.
- Invalid / missing override paths must never fall through to auto-discovery and must never skip the test.

### Automatic discovery order

**Windows (`win32`)**

1. `%ProgramFiles%\Google\Chrome\Application\chrome.exe`
2. `%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe`
3. `%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe`

**Linux (non-Windows; preserves prior CI path and common Chromium locations)**

1. `/usr/bin/google-chrome` (historical hard-coded path)
2. `/usr/bin/google-chrome-stable`
3. `/usr/bin/chromium-browser`
4. `/usr/bin/chromium`

If none exist, the harness throws and lists every candidate. Tests are never skipped.

### Local machine evidence (this workspace)

| Candidate | Present |
| --- | --- |
| `C:\Program Files\Google\Chrome\Application\chrome.exe` | Yes — Chrome `158.0.8127.37` |
| `C:\Program Files (x86)\Google\Chrome\Application\chrome.exe` | No |
| `%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe` | No |
| `LVPT_CHROME_PATH` at inspection time | Unset |

Default resolution on this host therefore selects Program Files Chrome without requiring `LVPT_CHROME_PATH`.

---

## playwright-core dependency

| Check | Result |
| --- | --- |
| `package.json` declares `playwright-core` | Yes — `devDependencies["playwright-core"] = "1.65.1"` (commit `1c9b1ec`) |
| Local `import('playwright-core')` | Available (`chromium` export present) |
| T2/T3 agent manifest edits | None |
| Paid browser SaaS | Not introduced |
| Playwright browser download | Not used — launches installed system Chrome via `executablePath` |

Harness behavior: resolve Chrome first; then dynamic-import `playwright-core`. Missing module fails with an actionable `npm.cmd ci` message. The regression is **not** skipped.

---

## Fail-fast local verification runner

Implemented in `scripts/verify-command-center.ps1`.
Regression coverage: `tests/verify-command-center.test.mjs`.

### Modes

| Mode | Behavior |
| --- | --- |
| `Targeted` | Requires `-TestFiles` (comma-separated and/or array). Runs only listed offline Node files under `tests/`. |
| `Full` | Explicit inventory: CI syntax checks, CI regressions, local-phase offline tests, `npm.cmd run test:staging-safety`, acceptance, browser (desktop+mobile assertions inside harness), `npx.cmd --no-install tsc --noEmit`, `npm.cmd run build`. |
| `-InventoryOnly` | Prints the selected mode inventory as JSON and exits 0 without executing checks. |

### Safety controls

- Captures each step exit code and **stops on first nonzero**.
- Sets `LVPT_VERIFY_OFFLINE=1` for child commands.
- Strips inherited provider/credential environment names (Google/clasp/Supabase/Vercel/OpenAI keys, LVPT secrets, owner-approved send flag).
- Keeps `LVPT_CHROME_PATH` for the offline browser harness.
- Refuses inventory commands containing clasp push/deploy, vercel deploy, git commit/push, live dry-run, or token endpoints.
- Does **not** invoke `scripts/lvpt-safe-readonly-dry-run.cjs`.
- Does **not** edit workflows, install dependencies, deploy, or mutate Git.

### Explicit Full inventory families

1. SMS Review Engine workflow syntax files (`node --check`) including Apps Script sources.
2. Exact CI regression file list from `.github/workflows/sms-intelligence-review-ci.yml`.
3. Local-phase offline suite (`tests/calendar-*.cjs`, `tests/command-hub-finance.test.cjs`, `tests/rcs-live.test.mjs`).
4. Staging-safety npm script.
5. Integrated acceptance + browser harness.
6. TypeScript noEmit + production build (build still runs prebuild staging-safety).

---

## Assertions and safety

- All existing browser UI / navigation / finance / auth assertions in `tests/command-center-browser.test.mjs` are preserved.
- Harness continues to use synthetic fixtures and local HTTP only (no live Sheet, Gmail, SMS, Calendar, or Vercel calls).
- No Chrome download, Playwright browser binary install, or paid remote browser service was added.
- Verification runner requires no live credentials and performs no provider writes.

---

## Verification commands

Local precondition: use the **owner-approved Node 24** runtime from `node -v` (`v24.22.1` on this host). Do not re-block on CI's Node 22 pin for local verification.

```powershell
node --version
npm.cmd --version
Get-Command cursor, cursor-agent -ErrorAction SilentlyContinue
node -e "import('playwright-core').then(()=>console.log('playwright-core available')).catch(()=>process.exit(1))"
node .\tests\command-center-browser.test.mjs
node .\tests\verify-command-center.test.mjs; if ($LASTEXITCODE -ne 0) { throw 'Runner regression failed' }
powershell.exe -NoProfile -File .\scripts\verify-command-center.ps1 -Mode Targeted -TestFiles tests/command-center-acceptance.test.mjs
powershell.exe -NoProfile -File .\scripts\verify-command-center.ps1 -Mode Full -InventoryOnly
```

Recorded on finish: `node --version` → `v24.22.1`; runner regression **exit 0**; Targeted acceptance **exit 0**. Full InventoryOnly remains available for reproducible inventory inspection; Full execution is owned by later regression tasks (R21).
