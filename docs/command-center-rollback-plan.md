# Command Center production rollback plan — R30

Decision: **HOLD production.** This file defines the actionable, data-preserving rollback sequence if a later owner-approved release must be reversed. It is **not** permission to deploy, mutate live data, or perform rollback now.

T45 / R30 preparation date: 2026-11-26. No rollback, redeploy, Sheet restore, Calendar mutation, or provider write was performed for this update.

Companion release plan: `docs/command-center-release-plan.md`

---

## Status words for this file

| Status | Meaning |
| --- | --- |
| PROCEDURE_READY | Rollback steps are defined. Not an executed rollback. |
| RECORDED | Git tip or URL known from local inspection. |
| UNKNOWN | Live production SHA / Deployment ID not confirmed this session — must be filled before relying on it. |
| HOLD | Prefer “do not promote” over rollback when still pre-release. |
| DATA_PRESERVE | Step must not destroy authoritative Sheet, Calendar, Gmail, or SMS history. |

---

## 1. Rollback objectives

1. Restore the **application** to the last verified production Deployment / Git SHA.
2. **Preserve** authoritative business data (Google Sheet ledgers, Calendar client meetings, Gmail history, SMS/RCS stored identities).
3. Keep dangerous capabilities **DISABLED** (send, event writes, four-times-daily, RCS send/mark-read, retired TaskSync).
4. Leave an auditable record of what was rolled back and what was left untouched.

---

## 2. Verified revisions and unknowns

| Revision role | Value | Status |
| --- | --- | --- |
| Preferred pre-release posture | Do not merge / do not promote — production stays as-is | HOLD / PROCEDURE_READY |
| `origin/main` tip (Git, this session) | `63d5921ac1da1d6e4cab01a220cc00232b40246c` | RECORDED — **may not equal** live production |
| Live production Deployment ID / SHA | Owner must record before promote (release plan backup B1) | **UNKNOWN** until owner fills |
| Last independently verified remote candidate | `292103fc14480adbe84ae9c2404e4fed54ac1bf9` | HISTORICAL candidate — not automatically the rollback target |
| Local development HEAD | `3330948a77f7957d35f920290b0b83f86ea33d45` | RECORDED — development only; not a production rollback target |
| Staging remote tip | `292103fc14480adbe84ae9c2404e4fed54ac1bf9` | RECORDED |

**Rule:** Rollback target = the **owner-recorded production Deployment ID / SHA from backup B1**, not a guessed commit from documentation. If B1 was skipped, stop and escalate — do not invent a target.

---

## 3. Pre-release rollback (preferred)

If the candidate has **not** been merged to `main` and **not** promoted:

| Step | Action | Data impact |
| --- | --- | --- |
| P1 | Do not merge PR #19 | None |
| P2 | Do not promote any preview to production | None |
| P3 | Leave production on its current release | DATA_PRESERVE |
| P4 | Optionally revert or fix the staging branch / preview only | Preview only; no Sheet/Calendar/Gmail/SMS writes |
| P5 | Do not merge PR #6 wholesale as an alternate path | Avoids unreviewed history |

This is the default rollback while production remains **HOLD**.

---

## 4. Post-promote application rollback (Vercel)

Use only after an owner-approved production promote that must be reversed.

| Step | Action | Notes |
| --- | --- | --- |
| A1 | Identify failing production Deployment and the **prior good** Deployment ID from backup B1 | UNKNOWN without B1 |
| A2 | In Vercel project `prj_XWIQD5ptbx3J7NnVr1n6EfrdMEFs`, promote / rollback to that prior good Deployment | Owner dashboard only |
| A3 | Confirm production URL `https://lvpt-event-command-center-2026.vercel.app/v2/index.html` serves the prior SHA | Record evidence |
| A4 | Confirm deployment protection still enabled | Do not disable protection during rollback |
| A5 | Confirm activation flags still DISABLED on the restored build (send 403, event writes off, schedules off) | If flags were enabled mid-release, disable them **before** or **with** app rollback |

**Forbidden application rollback actions:**

- Creating a new Vercel project
- Force-pushing `main` without explicit owner instruction
- Deploying an unrelated branch “to fix” without naming the B1 target
- Using clasp push / Sheet overwrite as an application rollback

---

## 5. Data-preserving rules (authoritative sources)

Application rollback **must not** automatically roll back business ledgers.

| Data store | During app rollback | Allowed only with separate owner approval |
| --- | --- | --- |
| Google Sheet `1oHoVdD5CDcEreyRnB7cEvYfp6wWEgAmf04BwrktkMYs` | **Leave intact** | Targeted row restore from backup B2 for a proven bad write |
| Payments / Event Payouts | **Never** bulk-rewritten by Command Center release/rollback | Manual owner financial correction only |
| Gmail (business mailbox) | **No trash, no auto-send, no bulk archive** as rollback | Single-thread owner actions only |
| Calendar client meetings | **Preserve** | Never delete client appointments to “undo” a release |
| Internal TaskSync reminders | Only `runLVPTSafeTaskSync` may manage reminders; rollback of app deploy does not reinstall `runLVPTTaskSync` | R27 owner ops only |
| Supabase SMS staging `ogfrcwmsjbtiydlvqoyj` | **No destructive truncate** as app rollback | Separate SMS ops approval |
| Reminder History / Change Log | Append-only evidence preferred; do not wipe history to hide a bad release | — |

If a **capability activation** (R28) wrote canary or live sheet rows, use that capability’s own rollback step in `docs/event-editing-release-plan.md` — do not full-sheet restore unless the owner explicitly authorizes it after proving scope.

---

## 6. Capability and automation rollback (if enabled during a failed release)

| Capability | Immediate disable | Data rollback | Forbidden |
| --- | --- | --- | --- |
| Event writes CAP-01–CAP-08 | Turn UI/route flags off; keep bulk POST 403 | Per-capability reverse mutation on canary/live id per editing plan | `saveAllEvents` full rewrite |
| Gmail send | Keep / restore `POST /api/gmail/send` → 403 | Do not unsend; reconcile uncertain outcomes | Auto-resend |
| Four-times-daily approvals | Disable schedule slots | Do not invent delivery receipts | Competing Cursor crons |
| Document upload/delete | Disable UI + harden route gate | Restore specific `document_id` only if owner-approved | Bulk document purge |
| RCS send/mark-read | Remain off | N/A | Enabling to “test rollback” |
| Retired `runLVPTTaskSync` | Must stay retired | N/A | Reinstalling as rollback |

Global emergency posture: `PRODUCTION_MUTATIONS_ENABLED = false`, events bulk POST 403, UI writes off, send 403, four-times-daily DISABLED, no clasp push.

---

## 7. Git / PR rollback hygiene

| Situation | Action |
| --- | --- |
| PR #19 merged, production promoted, app rolled back on Vercel | Leave Git history intact unless owner requests a revert commit on `main` pointing clear intent; Vercel rollback is the urgent path |
| PR #19 merged but not promoted | Revert merge on `main` **or** avoid promote; owner chooses |
| Pressure to “just use PR #6” | **Refuse** — never wholesale integrate PR #6 as rollback or forward fix |
| Local `ai-build/command-center-loop` dirty | Do not reset/clean owner work; development branch is not production |

Autonomous Cursor agents must not `git reset`, `git clean`, force-push, or delete owner work as recovery.

---

## 8. Agent Relay and orchestration

| Issue | Rollback relevance |
| --- | --- |
| Agent Relay build failure | **UNRESOLVED** — not fixed by rolling back Command Center |
| Local loop replacement | Orchestration-only; rolling back production does not require repairing the relay |
| Forbidden | Introducing unrelated Command Center changes to “fix” the relay during an incident |

If release was blocked on relay dependency, the correct action is **remain HOLD** (pre-release), not a production data change.

---

## 9. Post-rollback verification

| Check | Expected |
| --- | --- |
| Production URL SHA | Matches B1 prior good Deployment |
| Signed-out privacy | Owner sign-in required; no private records |
| Event writes / send / schedules | DISABLED |
| Sheet / Payments / Payouts | Unchanged by the app rollback itself |
| Client Calendar meetings | Preserved |
| Owner notification | Record rollback time, from-SHA, to-SHA, what was not touched |

---

## 10. Explicit non-actions of this prep

- No Vercel rollback executed
- No Git revert / reset / push
- No Sheet, Calendar, Gmail, or SMS mutation
- No clasp deploy
- No PR #6 integration
- No claim that `origin/main` is the live production SHA without owner confirmation

---

## Marker

COMMAND_CENTER_R30_ROLLBACK_PLAN_READY

Until a promote occurs, the actionable rollback is: **do not merge; do not promote; production stays on its current release.**
