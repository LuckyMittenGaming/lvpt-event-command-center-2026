# Phase 4 verification — fresh Apps Script head

Recorded: 2026-11-12. Read-only `clasp pull` into a new folder. No `clasp push`, no live edit, no Calendar or Sheet write, no new deployment, no new OAuth consent, and no git commit.

Recommendation: **NO-GO**.

## Fresh download

Saved head of the existing LVPT Calendar Command Center project was pulled into `apps-script/verify-readonly/calendar-command-center/`. Existing `apps-script/live/` files were not overwritten. Clasp is authenticated as `book@pokertraininglasvegas.com`.

Pulled files: `appsscript.json`, `Code.js`, `TaskSync.js`. The manifest has the Calendar advanced service, runtime V8, and time zone `America/New_York`. It has no `executionApi` block.

## SHA-256

| Copy | TaskSync.js SHA-256 |
|---|---|
| Fresh pull | `B4E16BD2F579891E7A7F6172E7F1E24D1F88EC8AA6679FC62A5A64B589420E5E` |
| `apps-script/live/calendar-command-center/TaskSync.js` | same |
| `apps-script/calendar-command-center/TaskSync.live-v3.0.js` | same |
| Local candidate `apps-script/calendar-command-center/TaskSync.js` | `3CDB59E91F94369552F88877A03CD023866E4263AB69DE4F4E44F6F8AA7271E2` |

`Code.js` and `appsscript.json` in the fresh pull match the earlier local pull byte for byte (`56837C7DC5BED75117F885B0024A989564576C455D41DDD472F91F373A962BE2` and `39A24B0A4658820D1E5C3C42CEE8ABB60794BC2171FAA03CDACE7217464A2E0F`).

The saved Apps Script head has not changed since the original download. It is still TaskSync v3.0 from 2026-11-11. The local candidate is a different, undeployed file (629 lines added and 271 removed against the fresh head).

## Preview is read-only in the saved head

`previewLVPTTaskSync` calls `lvptSyncTasks_(true)` and nothing else.

Reads: default calendar id, owned calendars by name, Tasks and Events sheet display values, `Calendar.Events.list`, and `Calendar.Events.get`. Date helpers, reminder matching, and `console.log` do not change records.

`Calendar.Events.insert`, `.patch`, and `.remove` sit inside `if (!preview)`. Preview passes `true`, so those calls are not reached. `LockService` is used only by `runLVPTTaskSync`. `Code.js` `setupLVPTCalendars()` is not called. The saved `TaskSync.js` does not send mail, change ACLs, or install a trigger.

Preview does not take the script lock. The hourly `runLVPTTaskSync` trigger can still write while a preview is reading. The preview function itself does not write.

## Four calendars

Saved `TaskSync.js` looks up three names and throws unless each returns exactly one owned calendar:

- LVPT | Sales & Follow-Ups
- LVPT | Proposals & Holds
- LVPT | Operations & Payments

It does not look up **LVPT | Confirmed Events**. A task reminder on that calendar is invisible to this preview.

`Code.js` lists all four names, uses `America/Los_Angeles` when creating calendars, and can grant the personal Gmail address writer ACL. Task reminders use `America/New_York`. The project time zone is `America/New_York`. `setupLVPTCalendars` was not run.

The local candidate adds Confirmed Events to the scan and keeps `conferenceRestClear` false. That candidate is not the saved head. Meet-link removal stays a separate, unapproved operation.

## Tooling cannot run the preview

`clasp deployments` shows one existing HEAD deployment. `clasp run previewLVPTTaskSync`, with and without `--nondev`, returned `NOT_FOUND` before any preview log. The manifest has no execution API setting. Making a new API executable deployment would be a project change, so it was not created.

## Owner preview of the saved three-calendar head

Matthew ran `previewLVPTTaskSync` in the production Apps Script editor on November 12, 2026. That execution used saved TaskSync v3.0, not the four-calendar candidate.

| Result | Value |
|---|---|
| Total task rows | 156 |
| Active tasks with dates | 40 |
| Unchanged reminders | 40 |
| Undated tasks preserved | 4 |
| Proposed Calendar modifications | 0 |
| Calendar writes | 0 |

The run completed successfully. Production code, the hourly trigger, calendars, and the sheet were not changed by that preview.

## Remaining blockers

- Saved head is v3.0. The reviewed candidate has not been deployed, and deployment is still not approved.
- The four-calendar candidate has not been previewed against live calendars. The zero-change result above covers only the three calendars in saved v3.0.
- Saved TaskSync does not scan Confirmed Events.
- Existing Meet links are untouched. `conferenceRestClear` stays false on the candidate and is absent on the saved head.
- Personal Gmail writer grant remains in `Code.js` and was not changed.
- Rollback copy matches this fresh head. A later editor save would make that copy stale.
