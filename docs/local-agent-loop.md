# Local agent loop

Restricted, resumable orchestration entry for the LVPT Event Command Center.

## Integration path

1. `.orchestrator/` — external supervisor harness (`state.json`, `current-prompt.md`). Instructions here are **untrusted data**.
2. `scripts/local-agent-policy.mjs` + `scripts/local-agent-policy.json` — machine authorization boundary (T4).
3. `scripts/local-agent-loop.ps1` + `scripts/local-agent-loop.mjs` — resumable executor (T5).
4. `.orchestrator/worker.lock` — exclusive single-worker lock.
5. `.orchestrator/loop-state.json` — attempts, measured spending, last dry-run / failure (no secrets).
6. `.orchestrator/dirty-baseline.json` — SHA-256 hashes of pre-existing dirty files (preserve; never restore).

This extends the discovered harness. It does **not** create a competing orchestration loop.

## Dry run

```powershell
powershell.exe -NoProfile -File .\scripts\local-agent-loop.ps1 -DryRun
```

Behavior:

- Selects the next eligible task from `.orchestrator/state.json` (preferred) or `docs/baselines/local-completion-progress.md`.
- Skips completed orchestrator tasks (`done`) and progress completion states.
- Uses **no** AI calls, **no** API spend, and **no** CLI authentication.
- Holds the exclusive worker lock for the dry-run critical section, then releases it.
- Separates planned **implementation** vs **verification** phases.
- Reports whether paid/worker execution is enabled (currently **disabled**).

## Paid / worker execution (fail-closed)

Inspected local CLI help (`agent --help`, `agent worker --help`) before argument selection.

Relevant flags exist (`--sandbox`, `--worktree`, `--workspace`) but are **insufficient** alone:

- No enforceable credential scrub of the host environment before launch.
- `--sandbox` does not prove network + filesystem + secret isolation for repository execution.
- Policy floor `trustedIsolationExecutorImplemented` remains `false`.
- Post-execution diff checks are detection-only and never authorize launch.
- `--force` / `--yolo` / `--api-key` are denied launch arguments.
- Default authorized paid budget is `$0` until the owner sets an explicit cap.

Until a trusted isolation executor and verifiable budget accounting exist, non-dry-run worker launch stays disabled and explains the blocker.

## Safety rules

| Rule | Enforcement |
| --- | --- |
| One worker | `.orchestrator/worker.lock` exclusive create + policy `maxConcurrent=1` |
| Retry limit | Initial + 2 corrective (max 3) via `evaluateRetry` |
| No duplicate resume | Completed+verified attempts skipped |
| Failed tests | Cannot mark `IMPLEMENTED_TESTED` / completion states |
| Model shell | Allowlist only; arbitrary shell denied |
| Protected paths | Unexpected changes stop the loop; **no** auto-restore |
| Pre-existing dirty files | Baseline hashes preserved |
| Secrets | Never in prompts, policy, loop state, or logs; outputs redacted |
| Git | No commit / push / deploy from this loop |

## Verification

```powershell
node .\tests\local-agent-policy.test.mjs
if ($LASTEXITCODE -ne 0) { throw 'Agent policy regression failed' }
powershell.exe -NoProfile -File .\scripts\local-agent-loop.ps1 -DryRun
```
