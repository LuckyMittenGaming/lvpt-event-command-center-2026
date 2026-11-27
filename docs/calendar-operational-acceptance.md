# Calendar operational acceptance — R27 actual TaskSync execution

Decision: **Hold production.** This file prepares the owner-run protocol for **current** Safe TaskSync execution acceptance (R27). It is **not** LIVE_VERIFIED, **not** authorization to run the live writer from Cursor, and **not** permission to install or change triggers.

T42 / R27 preparation date: 2026-11-26. No `runLVPTSafeTaskSync` execution, no trigger change, no clasp push, no Calendar mutation, and no Sheet write were performed for this update.

Dependencies: R16 (safe TaskSync fixture / source verification). Live fill-in requires owner access to the approved LVPT Calendar Command Center Apps Script project and current execution logs.

Related historical enablement evidence (not current acceptance): `docs/baselines/phase-07m-production-sync.md`. Phase-07m records the November 22, 2026 enablement window only. Those logs **cannot** satisfy R27 current-cycle acceptance.

---

## Status words for this file

| Status | Meaning |
| --- | --- |
| PROCEDURE_READY | Owner protocol and evidence fields are defined. Not a live pass. |
| LOCAL_SYNTHETIC_PASS | Offline fixture / VM TaskSync tests only. Never promotes to LIVE_VERIFIED. |
| PENDING_OWNER_EVIDENCE | Live evidence cells stay empty until the owner records authorized current results. |
| LIVE_OBSERVED | Owner recorded a sanitized `runId` / timestamp from an authorized current observation. |
| LIVE_VERIFIED | Reserved. Requires one current successful run **plus** two subsequent genuine scheduled cycles, current hourly trigger ownership, duplicate-free Free/transparent nonrecurring reminders, cancelled suppression, preserved client meetings, and no retired/parallel writer. Not used until those exist. |
| BLOCKED_OWNER | Requires owner Apps Script access, separate approval for any manual live run, or live evidence. |
| HISTORICAL_ONLY | Prior phase evidence. Informative; does not pass R27. |
| DISABLED / RETIRED | Capability must stay off or unused. |

Live evidence rows below remain **PENDING_OWNER_EVIDENCE**. Do not invent execution timestamps, `runId` values, or trigger ownership from fixtures, CI, hub schedule text, or phase-07m history.

---

## Exact inspected TaskSync identity (read-only)

Recorded from local safe sources and the phase-07m production identity baseline. Owner must reconfirm these values in the live Apps Script UI before filling evidence.

| Identity field | Inspected value | Source |
| --- | --- | --- |
| Apps Script project name | LVPT Calendar Command Center | `docs/baselines/phase-07m-production-sync.md` |
| Script ID | `1bYJcEE5GUbfiWvXNiew_bfgBwDyfakhO8aiPWDtGF70ZO_zqd0z_4XDP` | phase-07m / phase-07c |
| Authorized owner mailbox | `book@pokertraininglasvegas.com` | `TaskSync.safe-sync.js` → `LVPT_SAFE_SYNC.ownerEmail` |
| Authoritative spreadsheet | `1oHoVdD5CDcEreyRnB7cEvYfp6wWEgAmf04BwrktkMYs` | `LVPT_SAFE_SYNC.spreadsheetId` |
| Ledger tab | `Reminder History` | `LVPT_SAFE_SYNC.historySheet` |
| Time zone | `America/New_York` | `LVPT_SAFE_SYNC.timeZone` |
| Sole authorized writer entry | `runLVPTSafeTaskSync` | `TaskSync.safe-sync.js` header + `function runLVPTSafeTaskSync` |
| Retired writer (must not be scheduled) | `runLVPTTaskSync` | Safe sources ban scheduling; local `TaskSync.js` retains retired planner only |
| Local development candidate files | `TaskSync.safe-sync.js`, `TaskSync.safe-review.js`, `TaskSync.safe-integrate.js` under `apps-script/calendar-command-center/` | R16 |
| Live export tree | `apps-script/live/calendar-command-center/` — **read-only historical**; do not edit in place | AGENTS.md §7.1 |
| Authorized business calendars | `LVPT \| Sales & Follow-Ups`, `LVPT \| Proposals & Holds`, `LVPT \| Operations & Payments`, `LVPT \| Confirmed Events` | `LVPT_SAFE_SYNC.calendarNames` |
| Expected calendar IDs | sales `c_451b7f3c…@group.calendar.google.com`; proposals `c_e68f6233…@group.calendar.google.com`; operations `c_a9756e49…@group.calendar.google.com`; confirmed `c_972d7e50…@group.calendar.google.com` | `LVPT_SAFE_SYNC.expectedCalendarIds` |
| Expected reminder shape | Free (`transparency: transparent`), ≤15 minutes, no external guests, no Meet/conference, no recurrence | safe-sync create + isolated proof |
| Expected run log shape | Console `LVPT_SAFE_SYNC_RUN` JSON with `runId`, `calendarWrites`, `reconciled`, `failed`, `dueDrifts`, `rowsAppended`, `deletes`, `patches`, `replaces` | `runLVPTSafeTaskSync` |

Do not paste OAuth tokens, clasp credentials, or client meeting contents into this file.

---

## Hard boundaries (do not cross during prep or acceptance)

1. **Schedule ≠ execution.** An hourly trigger configuration, hub “Hourly” schedule label, or successful audit check is **not** proof that `runLVPTSafeTaskSync` ran. Execution logs (Executions page and/or `LVPT_SAFE_SYNC_RUN` cloud log with timestamp + `runId`) are required.
2. **Three current observations required.** R27 needs (A) one **current** successful run, then (B) two **subsequent genuine scheduled** cycles. Historical phase-07m runs are HISTORICAL_ONLY.
3. **No Cursor / autonomous writer execution.** This preparation task must not call `runLVPTSafeTaskSync`, change triggers, clasp push, or mutate Calendar/Sheets.
4. **Manual live writer execution requires separate owner approval.** Running the function from the Apps Script editor can change live Calendar data. Do not treat this checklist as that approval. If a current successful observation must be an Editor run, obtain **written owner approval** first and record the approval reference in the evidence log.
5. **Prefer Time-Driven observations for cycles B and C.** The two subsequent cycles must be Type Time-Driven (scheduled), not Editor, not API-triggered from this loop.
6. **Never schedule or run `runLVPTTaskSync`.** It remains RETIRED.
7. **No parallel Calendar reminder writers.** No second trigger, no other Apps Script project, no Command Center UI path, and no autonomous job may create/update/delete internal reminders.
8. **Preserve client meetings.** Actual appointments stay untouched. Internal reminders remain Free / transparent / ≤15 minutes / nonrecurring / no guests / no Meet.
9. **Cancelled suppression stays on.** A cancelled managed reminder must not be recreated.
10. **Do not invent evidence** from fixtures, CI, Reminder History row counts alone without matching Executions timestamps, or November 22 historical logs.

---

## Local / code prerequisites (already implemented; synthetic only)

These establish PROCEDURE_READY / LOCAL_SYNTHETIC_PASS. They do **not** satisfy LIVE_VERIFIED.

| Gate | Local evidence | Live status |
| --- | --- | --- |
| Sole writer identity | `runLVPTSafeTaskSync` present; `runLVPTTaskSync` absent from safe-sync / safe-review / safe-integrate | PENDING_OWNER_EVIDENCE (trigger list) |
| Reminder constraints | Free / 15-minute / no guests / no conference / no recurrence; idempotent create; cancelled not recreated | PENDING_OWNER_EVIDENCE |
| Real meetings untouched | Safe decision path does not patch/delete non-managed client events | PENDING_OWNER_EVIDENCE |
| Due today ≠ overdue | `lib/action-inbox.mjs` + acceptance fixtures | LOCAL_SYNTHETIC_PASS |
| Hub schedule disclaimer | Operating picture / Source Health: hourly schedule is configuration, not execution proof | LOCAL_SYNTHETIC_PASS |
| Phase-07m historical enablement | Prior live trigger + cycles documented | HISTORICAL_ONLY |

Local prerequisite commands (synthetic; no Calendar / Sheets / clasp):

```powershell
node .\tests\action-inbox.test.mjs
node .\tests\calendar-task-reconcile.test.cjs
```

Or the targeted package:

```powershell
powershell.exe -NoProfile -File .\scripts\verify-command-center.ps1 -Mode Targeted -TestFiles tests/action-inbox.test.mjs,tests/calendar-task-reconcile.test.cjs
```

A green local run is **LOCAL_SYNTHETIC_PASS** only.

---

## Current hourly trigger ownership (read-only inspection)

Owner inspects **Triggers** in the LVPT Calendar Command Center project. Do not add, edit, or delete triggers during R27 unless a separate owner decision explicitly authorizes a repair — that repair is outside this checklist’s default path.

| Check | Pass criteria | Evidence status |
| --- | --- | --- |
| Function | Exactly one time-based hourly trigger whose function is `runLVPTSafeTaskSync` | PENDING_OWNER_EVIDENCE |
| Owner | Trigger owned by `book@pokertraininglasvegas.com` (or the signed-in book account that owns the project) | PENDING_OWNER_EVIDENCE |
| Deployment | Head (or the owner-confirmed authorized deployment) | PENDING_OWNER_EVIDENCE |
| Event | Time-based, every hour | PENDING_OWNER_EVIDENCE |
| Retired writer | `runLVPTTaskSync` is **not** in the trigger list | PENDING_OWNER_EVIDENCE |
| Parallel writers | No second LVPT internal-reminder trigger in this or another project | PENDING_OWNER_EVIDENCE |
| Failure notification | Owner-confirmed notification setting recorded | PENDING_OWNER_EVIDENCE |

Seeing the trigger configured without matching Executions rows does **not** pass R27.

---

## Three required execution observations

Fill each observation from the Apps Script **Executions** page and matching cloud log / Reminder History correlation. All three must be **current** relative to the acceptance window (not phase-07m).

| Observation | Required type | What to record | Status |
| --- | --- | --- | --- |
| **A — Current successful run** | Time-Driven preferred. Editor allowed **only** with separate written owner approval because the writer can change live Calendar data. | `observed_at`, execution type, status Completed, duration, `runId` from `LVPT_SAFE_SYNC_RUN`, summary counts | PENDING_OWNER_EVIDENCE |
| **B — Subsequent scheduled cycle 1** | Genuine **Time-Driven** cycle after A (later start time) | Same fields; must not be a duplicate view of A | PENDING_OWNER_EVIDENCE |
| **C — Subsequent scheduled cycle 2** | Genuine **Time-Driven** cycle after B (later start time) | Same fields; must not be a duplicate view of A or B | PENDING_OWNER_EVIDENCE |

Rules for counting:

- A, B, and C must have **distinct** start timestamps and distinct `runId` values when logs expose `runId`.
- B and C must be Type Time-Driven.
- Status must be Completed (or owner-recorded equivalent success). Failed / timed-out runs do not count toward the three.
- Hub Source Health “Hourly” text cannot substitute for these three rows.
- November 22, 2026 phase-07m `sync-20261122-*` IDs are HISTORICAL_ONLY and must not be copied into A/B/C as current evidence.

---

## Reminder integrity checks (after the three cycles)

Perform as **read-only** Calendar / Reminder History inspection. Do not create, edit, or delete events to “make” the check pass.

| Check | Pass criteria | Evidence status |
| --- | --- | --- |
| Duplicate-free | One active internal reminder per stable `task_id`; no duplicate managed creates for the same task across the three cycles | PENDING_OWNER_EVIDENCE |
| Transparent / Free | Managed internal reminders remain `transparency: transparent` (Free) | PENDING_OWNER_EVIDENCE |
| Nonrecurring | No recurrence rule on managed internal reminders | PENDING_OWNER_EVIDENCE |
| Duration | Managed internal reminders ≤ 15 minutes | PENDING_OWNER_EVIDENCE |
| No guests / no Meet | No external attendees; no conferenceData / hangoutLink on managed reminders | PENDING_OWNER_EVIDENCE |
| Cancelled suppression | Cancelled managed reminders remain suppressed (not recreated) | PENDING_OWNER_EVIDENCE |
| Client meetings preserved | Actual client appointments on the four business calendars unchanged by TaskSync (no unauthorized delete/edit) | PENDING_OWNER_EVIDENCE |
| No retired writer activity | No new Time-Driven or Editor executions of `runLVPTTaskSync` in the acceptance window | PENDING_OWNER_EVIDENCE |
| No parallel writer | No other function writing LVPT internal task reminders | PENDING_OWNER_EVIDENCE |

---

## Owner-run protocol (ordered)

Stop at the first failed expected result. Record only sanitized IDs, timestamps, and pass/fail. Do not execute the writer from Cursor. Do not change triggers unless a separate owner repair decision exists.

### Phase A — Identity and trigger (read-only)

1. Open the Apps Script project **LVPT Calendar Command Center** (`1bYJcEE5GUbfiWvXNiew_bfgBwDyfakhO8aiPWDtGF70ZO_zqd0z_4XDP`) as `book@pokertraininglasvegas.com`.
2. Confirm authorized entry `runLVPTSafeTaskSync` exists and retired `runLVPTTaskSync` is not scheduled.
3. Open **Triggers**. Record current hourly ownership fields from the table above. Expected: exactly one hourly `runLVPTSafeTaskSync` trigger; zero `runLVPTTaskSync` triggers.
4. Confirm no unauthorized parallel reminder writer is visible.

### Phase B — Three current executions

5. Open **Executions**. Identify observation **A**: a **current** successful `runLVPTSafeTaskSync` run. Prefer an existing recent Time-Driven Completed row.
   - If no current successful run exists and an Editor run is required: **STOP** and obtain separate written owner approval before any manual execution. Record the approval reference. Only then may the owner run `runLVPTSafeTaskSync` once.
6. Wait for (or later return to record) observation **B**: the next genuine Time-Driven Completed cycle after A.
7. Wait for (or later return to record) observation **C**: the next genuine Time-Driven Completed cycle after B.
8. For A, B, and C, open the cloud log and record `LVPT_SAFE_SYNC_RUN` JSON (`runId` + counts). Correlate with Reminder History only as supporting evidence — ledger rows alone without Executions timestamps do not pass.

### Phase C — Integrity (read-only)

9. Spot-check managed reminders for Free / ≤15 minutes / nonrecurring / no guests / no Meet.
10. Confirm no duplicate active reminders for the same `task_id` introduced by A–C.
11. Confirm cancelled managed reminders remain suppressed.
12. Confirm sample real client meetings on the four LVPT calendars were not modified by these cycles.
13. Confirm Executions show no `runLVPTTaskSync` activity in the acceptance window.

If any cycle Failed: record the failure timestamp, do **not** mark LIVE_VERIFIED, and escalate. Do not “fix” by running the retired writer or adding a second trigger.

---

## Live success requirements (LIVE_VERIFIED gate)

R27 may be marked **LIVE_VERIFIED** only when **all** of the following are owner-recorded from **current** observations:

1. Exact project / script / writer identity reconfirmed.
2. Current hourly trigger owned correctly and points only at `runLVPTSafeTaskSync`.
3. Observation A: current successful run with timestamp + `runId` (and separate owner approval if it was an Editor run).
4. Observation B: subsequent genuine Time-Driven cycle with later timestamp + distinct `runId`.
5. Observation C: subsequent genuine Time-Driven cycle with later timestamp + distinct `runId`.
6. Duplicate-free managed reminders for stable task IDs.
7. Managed reminders remain Free/transparent, nonrecurring, ≤15 minutes, no guests, no Meet.
8. Cancelled-reminder suppression preserved.
9. Real client meetings unaffected.
10. No `runLVPTTaskSync` executions or triggers in the acceptance window.
11. No unauthorized parallel Calendar reminder writer.

Missing any of the three timestamped execution observations ⇒ **not** LIVE_VERIFIED. Trigger configuration alone ⇒ **not** LIVE_VERIFIED.

---

## Evidence log (authorized entries only)

Fill only with owner-supplied authorized evidence. Leave PENDING otherwise. IDs and timestamps only — no client meeting titles, attendee lists, or message bodies.

### Trigger ownership

| Field | Value | Status |
| --- | --- | --- |
| `trigger_inspected_at` (ISO-8601 + tz) | | PENDING_OWNER_EVIDENCE |
| Project name confirmed | LVPT Calendar Command Center | PENDING_OWNER_EVIDENCE |
| Script ID confirmed | `1bYJcEE5GUbfiWvXNiew_bfgBwDyfakhO8aiPWDtGF70ZO_zqd0z_4XDP` | PENDING_OWNER_EVIDENCE |
| Trigger function | `runLVPTSafeTaskSync` | PENDING_OWNER_EVIDENCE |
| Trigger owner | | PENDING_OWNER_EVIDENCE |
| Trigger cadence | Hourly / Time-based | PENDING_OWNER_EVIDENCE |
| Deployment | | PENDING_OWNER_EVIDENCE |
| `runLVPTTaskSync` triggers present | | PENDING_OWNER_EVIDENCE (must be none) |
| Parallel reminder triggers present | | PENDING_OWNER_EVIDENCE (must be none) |

### Observation A — current successful run

| Field | Value | Status |
| --- | --- | --- |
| `observed_at` (ISO-8601 + tz) | | PENDING_OWNER_EVIDENCE |
| Execution type (`Time-Driven` / `Editor`) | | PENDING_OWNER_EVIDENCE |
| Separate owner approval reference (required if Editor) | | PENDING_OWNER_EVIDENCE / n/a |
| Status | | PENDING_OWNER_EVIDENCE |
| Duration | | PENDING_OWNER_EVIDENCE |
| `runId` | | PENDING_OWNER_EVIDENCE |
| `calendarWrites` / `reconciled` / `failed` / `dueDrifts` / `rowsAppended` | | PENDING_OWNER_EVIDENCE |
| `deletes` / `patches` / `replaces` | | PENDING_OWNER_EVIDENCE |

### Observation B — subsequent scheduled cycle 1

| Field | Value | Status |
| --- | --- | --- |
| `observed_at` (ISO-8601 + tz) | | PENDING_OWNER_EVIDENCE |
| Execution type (must be `Time-Driven`) | | PENDING_OWNER_EVIDENCE |
| Status | | PENDING_OWNER_EVIDENCE |
| Duration | | PENDING_OWNER_EVIDENCE |
| `runId` (must differ from A) | | PENDING_OWNER_EVIDENCE |
| Summary counts | | PENDING_OWNER_EVIDENCE |

### Observation C — subsequent scheduled cycle 2

| Field | Value | Status |
| --- | --- | --- |
| `observed_at` (ISO-8601 + tz) | | PENDING_OWNER_EVIDENCE |
| Execution type (must be `Time-Driven`) | | PENDING_OWNER_EVIDENCE |
| Status | | PENDING_OWNER_EVIDENCE |
| Duration | | PENDING_OWNER_EVIDENCE |
| `runId` (must differ from A and B) | | PENDING_OWNER_EVIDENCE |
| Summary counts | | PENDING_OWNER_EVIDENCE |

### Integrity

| Field | Value | Status |
| --- | --- | --- |
| Duplicate-free managed reminders | | PENDING_OWNER_EVIDENCE |
| Free / transparent | | PENDING_OWNER_EVIDENCE |
| Nonrecurring | | PENDING_OWNER_EVIDENCE |
| ≤15 minutes | | PENDING_OWNER_EVIDENCE |
| No guests / no Meet | | PENDING_OWNER_EVIDENCE |
| Cancelled suppression preserved | | PENDING_OWNER_EVIDENCE |
| Client meetings preserved | | PENDING_OWNER_EVIDENCE |
| No retired writer activity | | PENDING_OWNER_EVIDENCE |
| No parallel writer | | PENDING_OWNER_EVIDENCE |
| LIVE_VERIFIED | | Not claimed |

### Historical reference (not current evidence)

| Field | Value | Status |
| --- | --- | --- |
| Phase-07m enablement window | 2026-11-22 ≈ 12:12–1:10 AM America/New_York | HISTORICAL_ONLY |
| Phase-07m example scheduled `runId` | `sync-20261122-003704` | HISTORICAL_ONLY |

---

## What was not done in T42

- No execution of `runLVPTSafeTaskSync` or `runLVPTTaskSync`.
- No trigger install, edit, or delete.
- No clasp push / deploy.
- No Calendar create/update/delete and no Sheet write from this loop.
- No LIVE_VERIFIED claim.
- Phase-07m history was not treated as current acceptance evidence.

---

## Remaining blockers

- R27 live execution remains BLOCKED_OWNER / PENDING_OWNER_EVIDENCE until the owner fills the three timestamped observations and integrity checks above.
- Any Editor / manual live writer run remains blocked until separate written owner approval.
- R29 and other automations must not create Calendar reminder writes outside Safe TaskSync.

Completion matrix: `docs/command-center-completion-matrix.md`.

COMMAND_CENTER_R27_CALENDAR_EXECUTION_ACCEPTANCE_READY
