# Local test environment — Windows verification baseline

Updated: 2026-11-25 (America/New_York)
Task: R01 / orchestrator T2 (browser executable resolution)
Scope: environment discovery and browser harness path resolution.
No production credentials, customer content, or paid browser services.
T2 agent work does not edit dependency manifests; pinned `playwright-core` arrived via approved commit `1c9b1ec`.

---

## Runtime discovery (read-only)

| Check | Result | Notes |
| --- | --- | --- |
| `node --version` | `v24.22.1` | Local major is **24**. Verified CI / AGENTS baseline expects **Node 22**. No Node install or version switch performed. ES-module browser harness syntax is compatible with both majors; treat Node 22 as the CI contract until an approved local pin exists. |
| `npm.cmd --version` | `11.17.0` | Present. |
| `git --version` | Available via PATH | Used for inspection only; local agents must not commit/push. |
| `Get-Command cursor` | `cursor.cmd` → `E:\cursor\resources\app\bin\cursor.cmd` | Discovered; not invoked for paid agent execution. |
| `Get-Command cursor-agent` | `cursor-agent.ps1` → `C:\Users\wsopa\AppData\Local\cursor-agent\versions\2026.11.22-e9042b2\cursor-agent.ps1` | Discovered; not invoked for paid orchestration in this task. |
| Paid CLI / cloud agent run | Not invoked | Deterministic local checks only. |

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
| T2 agent manifest edits | None |
| Paid browser SaaS | Not introduced |
| Playwright browser download | Not used — launches installed system Chrome via `executablePath` |

Harness behavior: resolve Chrome first; then dynamic-import `playwright-core`. Missing module fails with an actionable `npm.cmd ci` message. The regression is **not** skipped.

---

## Assertions and safety

- All existing browser UI / navigation / finance / auth assertions in `tests/command-center-browser.test.mjs` are preserved.
- Harness continues to use synthetic fixtures and local HTTP only (no live Sheet, Gmail, SMS, Calendar, or Vercel calls).
- No Chrome download, Playwright browser binary install, or paid remote browser service was added.
- `scripts/verify-command-center.ps1` is **out of scope for T2** (orchestrator T3 / R01 remainder).

---

## Verification commands

```powershell
node --version
npm.cmd --version
Get-Command cursor, cursor-agent -ErrorAction SilentlyContinue
node -e "import('playwright-core').then(()=>console.log('playwright-core available')).catch(()=>process.exit(1))"
node .\tests\command-center-browser.test.mjs
```

Expected after pinned dependency install: browser regression exit 0 against installed Windows Chrome.
)