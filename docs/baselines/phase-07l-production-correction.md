# Phase 7L — production correction candidate

Recorded: 2026-11-21, after the Phase 7K live verification. The candidate was not deployed. Production TaskSync was not edited. No Calendar event, Command Center cell, OAuth scope, or trigger was changed. Automatic creation stays disabled. The transparency correction was not executed.

## Candidate

Undeployed files, outside every clasp root:

- `apps-script/calendar-command-center/TaskSync.production-candidate.js`
- `apps-script/calendar-command-center/TaskSync.safe-review.js`
- `apps-script/calendar-command-center/TaskSync.safe-integrate.js`

The scheduled entry is `previewLVPTProductionCandidate`. It reads through the helpers already authorized in LVPT Calendar Preview Staging, scans all four calendars, keeps cancelled managed history, legacy reminders, and canonical references, and calls the Phase 7K decision engine. It does not call the installed planner.

`runLVPTProductionCandidate` returns before a lock, a read, or a Calendar call. `LVPT_PRODUCTION_CANDIDATE_WRITES_ENABLED` is false. The file contains no Calendar or Sheet writer. A later approved writer would take the script lock before the read. That call is not in this file.

`maintainLVPTTransparencyOnce` is a separate function. The preview does not call it. While `LVPT_TRANSPARENCY_MAINTENANCE_ENABLED` is false, it returns no requests. `lvptBuildTransparencyMaintenancePlan_` accepts only the 18 historical event IDs, requires a fresh read and a fresh ETag, and builds a body of `{ transparency: 'transparent' }` with `If-Match`. It does not call Calendar, and its result stays `executable: false`. Historical ETags are not in the candidate.

## Source diff

`docs/baselines/phase-07l-production-diff.diff` is the complete difference between production `apps-script/live/calendar-command-center/TaskSync.js` and the undeployed candidate. It was not applied to the production file.

Production still creates when the visible reminder list is empty, deletes managed duplicates, and patches managed reminders. Its scan uses three calendars and does not request `showDeleted: true`. The candidate removes those write branches. An incomplete four-calendar read produces no actions. A repeated preview cannot create a duplicate because it proposes no create, delete, replace, or patch.

## Tests

`npm run test:staging-safety` passed on 2026-11-21, including the existing calendar and SMS suites and `tests/calendar-production-candidate.test.cjs`.

The new synthetic test uses the real staging page walker and a fake Calendar. It checks a legacy reminder, a Busy managed reminder, repeated cancelled managed events, an external client booking, an incomplete page token, a disabled transparency plan, and a fresh-ETag plan that is not executable. Those fixtures are not the live calendars.

## Live read-only preview

`previewLVPTProductionCandidate` ran twice in LVPT Calendar Preview Staging as `book@pokertraininglasvegas.com`. The runs were 11:22:48–11:23:04 PM and 11:25:45–11:26:00 PM. Both summaries were identical. Google did not show a new consent screen. `TaskSync.gs` remained the staging preview file, 31,105 bytes, with `LVPT_STAGING_PREVIEW_ONLY = true`. Services remained Calendar and Sheets.

```json
{"tasksRows":169,"datedActiveTasks":52,"fourCalendarScanComplete":true,"calendarScan":{"sales":true,"proposals":true,"operations":true,"confirmed":true},"cancelledManagedRecords":870,"legacyReminders":21,"activeManagedReminders":33,"suppressedCreates":19,"busyManagedReminders":18,"unchangedManagedReminders":15,"reviewDecisions":0,"noChangeDecisions":33,"proposedActions":52,"proposedWrites":0,"create":0,"delete":0,"replace":0,"patch":0,"calendarWrites":0,"sheetWrites":0,"automaticCreateEnabled":false,"transparencyMaintenanceCalled":false,"phase7k":{"matchesPhase7k":true,"differences":[],"adjustedToPhase7k":false}}
```

The comparison matched the Phase 7K live counts and was not adjusted to force that match. The log contains 52 `LVPT_PRODUCTION_CANDIDATE_ACTION` lines: 19 `SUPPRESS CREATE`, 33 `NO CHANGE`, 18 of those marked Busy and `transparencyCorrection: "outside scheduled workflow"`. Every action has `create`, `delete`, `replace`, and `patch` false. The task decisions are the same 52 rows recorded in `docs/baselines/phase-07k-browser-live-verification.md`.

The issues are the same 15 notes as Phase 7K: a canonical event in Tasks notes is cancelled and was left to the managed history query. There were no execution errors.

## Cancelled history

The live read still holds 870 cancelled managed records. Production TaskSync reads visible events with `showDeleted` false, drops a cancelled event, and creates a reminder when no visible reminder remains. A later run can repeat that after the cancelled event leaves the active list. That is the likely duplicate-generation pattern. These records stay history. The read does not identify who cancelled an event.

## Durable reminder history

Do not create this store until it is approved.

Use the existing Command Center spreadsheet. Add one append-only tab, `Reminder History`, with columns `recorded_at`, `task_id`, `calendar_id`, `event_id`, `observation`, `run_id`, and `approval_id`. An observation is one of `cancelled_managed_observed`, `legacy_preserved`, `create_suppressed`, or `transparency_corrected`. The row records the script run. It does not name a person as the canceller.

An unattended create stays impossible until that tab exists and an owner approval ID is present. An in-memory tombstone does not survive the next run, and Google can drop a cancelled event. The candidate does not add the tab or write a row.

## Deployment and rollback

These steps are not approved and were not performed.

1. Confirm the hourly trigger is still absent.
2. Export the current production `TaskSync.gs` before any paste.
3. Approve the Reminder History tab and create it.
4. Adapt the candidate reader to production's existing spreadsheet read without adding a scope, and include the Confirmed Events calendar.
5. Paste the candidate and the two engine files into the production project. Do not run them yet.
6. Run only the read-only preview and compare it with a fresh inventory.
7. Leave `automaticCreateEnabled` false and `LVPT_PRODUCTION_CANDIDATE_WRITES_ENABLED` false.
8. Recreate the hourly trigger only after a separate approval. The trigger must call the candidate, not the old writer.

Rollback: restore the exported production `TaskSync.gs`. Leave Triggers empty. No transparency patch has an ETag to reverse, because none was sent.

## Owner approval required

- Creating the Reminder History tab or changing any Command Center cell.
- Enabling automatic reminder creation.
- Enabling the candidate write flag. The current file still has no writer.
- Running `maintainLVPTTransparencyOnce` after a fresh read of the 18 Busy reminders.
- Pasting this candidate into the production Apps Script project.
- Recreating the hourly trigger.
- Any Calendar insert, patch, update, or delete.
