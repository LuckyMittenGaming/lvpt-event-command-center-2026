# Phase 7M — production TaskSync is the scheduled writer

Recorded: 2026-11-22, 12:12–12:25 AM America/New_York. Account: `book@pokertraininglasvegas.com`. Production project: LVPT Calendar Command Center, script `1bYJcEE5GUbfiWvXNiew_bfgBwDyfakhO8aiPWDtGF70ZO_zqd0z_4XDP`. Spreadsheet: `1oHoVdD5CDcEreyRnB7cEvYfp6wWEgAmf04BwrktkMYs`. Branch: `feature/lvpt-sms-intelligence-review`. No `clasp` command was used. Google did not show a new consent screen.

This document records live production actions. The Node tests named below use fixtures. They are not the live Google read.

## What is installed

Production editor files after save:

| File | Role |
| --- | --- |
| `Code.gs` | Unchanged. `setupLVPTCalendars` was not run. |
| `TaskSync.gs` | `runLVPTTaskSync` now throws before any read or write: "Retired on 2026-11-22. The hourly trigger must call runLVPTSafeTaskSync." Saved length 18,297. |
| `TaskSync.safe-review.gs` | Phase 7K classification. Length 20,742. |
| `TaskSync.safe-integrate.gs` | Integration helpers. Length 5,399. |
| `TaskSync.safe-sync.gs` | Guarded writer. Length 48,772. Hash 2629021980, matching local `apps-script/calendar-command-center/TaskSync.safe-sync.js`. |

Services remain Calendar advanced service v3 only. `appsscript.json` was not edited. The new file uses `SpreadsheetApp`, `CalendarApp`, `Calendar.Events`, and `LockService`. It does not call `UrlFetchApp`, `GmailApp`, `MailApp`, or `ScriptApp`.

Before the retirement edit, live `TaskSync.gs` matched the audited local copy: length 18,365, hash 590863739.

## Ledger

`initializeLVPTReminderHistory` ran 12:12:01–12:12:35 AM.

```json
{"initialized":true,"calendarWrites":0,"rowsAppended":1094,"taskCount":169,"cancelledManagedRecords":870,"managedAssociations":33,"legacyAssociations":21,"writerEnabled":false}
```

The sheet is `Reminder History`. Keys are append-only. Repeating a key does not add another row. `ledger_ready` is written only after a complete scan. The 870 cancelled managed records were stored as evidence and were not restored or deleted. All 169 task IDs present at initialization are `historical_baseline` and cannot qualify as new.

`previewLVPTSafeTaskSync` ran 12:13:17–12:13:47 AM, before the writer was enabled.

```json
{"preview":true,"calendarWrites":0,"sheetWrites":0,"tasksRows":169,"datedActiveTasks":52,"historicalBaselines":169,"proposedCreates":0,"dueDrifts":0,"writerEnabled":false,"ledgerReady":true,"ok":true,"error":""}
```

## Isolated proof

`runLVPTIsolatedSyncProof` ran 12:14:24–12:14:32 AM.

```json
{"pass":true,"taskId":"lvpt-isolated-proof-20261122001427","eventId":"lvptso1nnnu9gr15hqcoq1nt984sa5bb5nrl","activeRemindersAfterCleanup":0}
```

The proof created one disposable calendar and one disposable ledger, inserted one 15-minute Free reminder with no attendees, ran again and inserted nothing, cancelled that reminder, confirmed it was not recreated, then deleted the test calendar and test sheet. It appended `isolated_proof` / `pass` to production `Reminder History`. Production calendars and client events were not the insert target.

## Transparency correction

`maintainLVPTTransparencyOnce` ran 12:14:59–12:15:19 AM.

```json
{"patched":18,"skipped":0,"rowsAppended":18}
```

Each of the 18 historical allowlist events was read again, checked for TaskSync ownership, confirmed status, no attendees, a 15-minute duration, and Busy transparency, then patched with a fresh `If-Match` and the body `{ transparency: "transparent" }`. None were skipped. The hourly function does not call this maintenance.

Patched event IDs: `bq7th2lis1p5dq0n9vv5hqmtok`, `i1bda5g9usd1pb6rnht9g7u99g`, `neen6fp4lkipntjildvlug8pag`, `8t2f59a9clftb8grf1tgrutif4`, `ov3gqkv6g49meo9lbld2iad51c`, `gvth60bvatdciotc88nmv74aa8`, `bumn1n8p8s9cp2q27dkb1tk010`, `6lf2a7dte90d6040tr4qpr2gro`, `j38iq5k7liies0oavambdtblmo`, `pll561gsgk28e8uldqvbtabrbg`, `pe5u1inod26kk31mcq03gvf89g`, `r7vabu23rm3d9g5crtph78eqgg`, `q8f6lsoe37bhqckicl18eftso4`, `3rrgcddu2qfgek0m9qcgmqkruc`, `dri6e13421i1dc7q8fe1c1e5ec`, `h2cf4q85tuurc5d3rs8jkvl1g8`, `1khm17g8ca6kfb62tt0el3ktgk`, `sq419e6iloj79vd1st84r4n95k`.

## Writer and two clean cycles

`enableLVPTNewTaskWriter` ran 12:15:50–12:16:18 AM and refused to enable itself unless the in-memory writer still proposed zero creates for the current tasks.

```json
{"writerEnabled":true,"rowsAppended":1,"proposedCreates":0}
```

`runLVPTSafeTaskSync` then ran twice:

| Run | Time | Result |
| --- | --- | --- |
| `sync-20261122-001634` | 12:16:34–12:17:04 AM | calendar writes 0, reconciled 0, failed 0, due drifts 0, rows appended 0, deletes 0, patches 0, replaces 0 |
| `sync-20261122-001710` | 12:17:11–12:17:40 AM | the same zeros |

Existing reminders were not edited. Due-date changes stay reported rather than patched. The live runs reported zero due-date changes. Client bookings and the 21 legacy reminders were outside the create and patch paths.

## Hourly trigger

The Triggers page showed zero triggers before this change. One trigger was saved at about 12:25 AM:

- Owned by the signed-in book account
- Deployment: Head
- Event: Time-based, every hour
- Function: `runLVPTSafeTaskSync`
- Failure notification: Notify me immediately

The page then read "Showing 1 trigger". `runLVPTTaskSync` is not in the list. Last run was blank because the first scheduled hour had not arrived. The two cycles above were started by hand before the trigger existed.

## Synthetic tests

`tests/calendar-safe-sync.test.cjs` passed inside `npm run test:staging-safety` before the production paste. It checks the source bans, idempotent history, an incomplete scan, suppression of the 19 known task IDs, one post-baseline create, a second run with zero inserts, a cancellation that is not recreated, a failed read that does not insert, an occupied event ID that is not retried, a due-date change that is reported without a create, and 18 transparency patches that send only a fresh `If-Match` body. Those fixtures are not the live calendars.

## Left as designed

- A task already in the 169-ID baseline does not get a new automatic reminder.
- A cancelled managed reminder stays suppressed even if Google later omits the cancelled event.
- Automatic edits to existing reminders, including due-date moves, stay off. A future due-date change will be recorded and left for a separate decision.
- The first unattended hourly execution is recorded in the health check below.

## Health check — 2026-11-22, about 1:10 AM

Read-only. Nothing was run, created, deleted, or edited. The trigger dialog was not opened.

| Check | Result |
| --- | --- |
| Hourly trigger | PASS |
| Unattended execution | PASS |
| Duplicate prevention | PASS |
| New-task creation | PENDING |
| Error notifications | PASS |

### Hourly trigger — PASS

The Triggers page showed exactly one trigger:

- Owner: the signed-in book account
- Last run: Nov 22, 2026, 12:37:03 AM
- Deployment: Head
- Event: Time-based
- Function: `runLVPTSafeTaskSync`
- Error rate: 0%

`runLVPTTaskSync` is not in the trigger list. Older execution history still shows that retired function running hourly through Nov 21, 2026, 5:03:06 PM. There is no time-driven execution of it after the new trigger was installed.

### Unattended execution — PASS

The 12:37:03 AM execution is Type Time-Driven, Duration 35.646 seconds, Status Completed. It was not an editor run. Its cloud log is:

```json
{"runId":"sync-20261122-003704","calendarWrites":0,"reconciled":0,"failed":0,"dueDrifts":0,"rowsAppended":0,"deletes":0,"patches":0,"replaces":0}
```

The two earlier `runLVPTSafeTaskSync` rows are Type Editor, at 12:16:34 AM and 12:17:10 AM. The first 50 executions on the page were all Completed. None were Failed.

### Reminder History and duplicates — PASS

The spreadsheet’s last edit was still the ledger write from about 12:16 AM. `Reminder History` row 1115 is the last filled row: `writer_enabled`, recorded 11/22/2026 12:16:54 AM, outcome confirmed, detail `new_tasks_only`. The rows immediately above it are the 18 transparency patches, then `isolated_proof` / pass and `ledger_ready`. The 12:37 AM run appended nothing. It also reported zero deletes, patches, replaces, and calendar writes.

### New-task creation — PENDING

The Tasks table still ends at row 170. Row 1 is the header, so that is 169 task IDs. A171 is empty. The last task ID is `gmail-task-1a1f5df6298c515c-discoveryreply`. No task has been added since the November 22 baseline, so a real Command Center task has not yet received its automatic Free reminder.

### Error notifications — PASS

The hourly trigger was saved with failure notification set to notify immediately. This run completed, so no failure notice was due. In `book@pokertraininglasvegas.com`, mail from `apps-script-notifications@google.com` in the last two days returned no messages. A second search for “Summary of failures”, “recently failed to finish”, and `runLVPTSafeTaskSync` also returned no messages.
