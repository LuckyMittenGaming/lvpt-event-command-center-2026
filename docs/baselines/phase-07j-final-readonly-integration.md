# Phase 7J — read-only integration

Recorded: 2026-11-21. Local development only. The hourly trigger stays deleted. No production file, Calendar event, Command Center cell, OAuth scope, or Apps Script project was changed.

## Recommendation

**STOP before every production action.**

The safe engine is integrated with a four-calendar inventory in local code. Unattended creates are off, because a durable cancellation record is not authorized. The live Google read did not run: the existing clasp refresh token returned `invalid_grant` / `reauth related error (invalid_rapt)`. It was not refreshed again and no new sign-in was started.

## What was integrated

`apps-script/calendar-command-center/TaskSync.safe-integrate.js` sits on top of `TaskSync.safe-review.js`. It does not call Calendar or Sheets.

- Discovery queries are the managed private-property search, `LVPT INTERNAL`, and `INTERNAL OWNER REMINDER`. The third query is required for the CertaPro reminder, whose text has no `LVPT` prefix. The installed staging preview still searches only `LVPT INTERNAL`, and that project was not edited.
- Dated active tasks use the same active statuses and due-date parse as the staging planner.
- Cancelled managed events must come from a complete `showDeleted` read before any decision is trusted. An incomplete inventory returns no decisions and no writes.
- Line-wrapped `gmail-` / `task-` IDs, with and without `LVPT`, remain legacy matches. Those matches block creation and never authorize a change.
- `kg49e1cfu2o9rvtkbq0l3erdeg` and `d0679uii6sfi6ig6metb4u21vc` stay known legacy reminders.
- One active managed reminder is `NO CHANGE`. Two active managed reminders are `REVIEW`, with no deletion.
- An external or unknown attendee is `REVIEW` and is not modified. A self or business-account attendee does not by itself protect the event.
- A second call with the same inventory produces the same decisions and no new write.
- `automaticCreateEnabled` is false. A task with no blocking reminder is `SUPPRESS CREATE` unless that task carries `ownerApprovedCreate` and a non-empty approval ID. Cancelled-reminder recreation still requires `ownerApprovedRecreation` and an approval ID.

The transparency function is not called by the dry-run. It remains a separate, disabled maintenance path and still rejects a historical ETag.

## Tests that ran

`node tests/calendar-safe-review.test.cjs` passed 39 synthetic cases.

`node tests/calendar-safe-integrate.test.cjs` passed one synthetic inventory built from the Phase 7I handoff and the 17 known task IDs. It was not a Google read. On that fixture:

| Result | Count |
|---|---|
| Dated active decisions | 52 |
| `SUPPRESS CREATE` | 19 |
| `NO CHANGE` | 33 |
| Of those, Busy managed reminders held for a separate transparency correction | 18 |
| Free managed reminders with no other action | 15 |
| Writes, including the repeat call | 0 |
| Client booking `client-booking` in the write list | 0 |

The 19 suppressed rows are the 17 cancelled-managed tasks plus the CertaPro and Cowbell legacy reminders. The 18 held rows are the handoff `patchCandidates`. The 15 free rows are synthetic stand-ins, not the 15 live events from 8:46 PM. If the live calendars have changed, these counts are not a claim about tonight’s inventory.

## Live read

`node scripts/lvpt-safe-readonly-dry-run.cjs` refreshed the saved clasp token once. Google returned `invalid_grant` and `reauth related error (invalid_rapt)`. No Calendar or Sheets request was sent. No decision file was written from live data. The counts above must not be treated as a fresh staging execution.

What remains untested against live data:

- The current four-calendar inventory and the Tasks sheet as of this run.
- Whether the installed staging preview still reports 19 creates, 18 patches, and 15 unchanged.
- Whether every cancelled managed duplicate is still returned by `showDeleted`.
- A fresh ETag, ownership, attendee, duration, and conference check for the 18 transparency rows.
- The `If-Match` patch itself. It was not sent.

## Cancellation persistence

An in-memory tombstone disappears when the script run ends. Google can also drop a cancelled event, so a later `showDeleted` read can miss it. Either gap lets an unattended hourly run treat an old task as new.

A durable record would be an append-only sheet, for example a `Reminder History` tab, written only after the owner confirms a cancellation: task ID, cancelled event ID, calendar ID, decision, and the owner approval ID. The existing spreadsheet scope on the production Calendar project is not pinned in the manifest, and adding a tab would be new persistent storage. That store was not created and no sheet cell was edited.

Until that store is separately authorized, `automaticCreateEnabled` stays false. Previously existing tasks cannot be recreated by the hourly path. An exceptional create or recreation still requires the matching approval ID on that one task.

## Production checklist

Do not perform this list now.

1. Leave the production trigger page at zero triggers.
2. Do not paste these files into the production Calendar Command Center.
3. After a later approval, run the read-only dry-run with a current book@ token and keep the output.
4. Confirm every previously proposed create is `SUPPRESS CREATE` or `NO CHANGE`, and that the write list is empty.
5. Enable a durable cancellation record only with a separate approval, and keep automatic creates off until that record is part of the scan.
6. Run the 18-event transparency correction only as its own one-time job: fresh get, ownership and shape checks, then `Calendar.Events.patch({ transparency: 'transparent' }, calendarId, eventId, { sendUpdates: 'none' }, { 'If-Match': freshEtag })`. Stop that event on any error. Do not use the historical ETags.
7. Install one hourly `runLVPTTaskSync` trigger only after the saved production head is this candidate and a preview shows no unwanted creates.

## Rollback

Nothing was deployed, so production still has the current live `TaskSync.js` and no hourly trigger. If a later edit replaces that file, paste `apps-script/live/calendar-command-center/TaskSync.js` back and leave Triggers empty. Restoring that file brings back the three-calendar create path, which is why the trigger stays off. A transparency change, if one is later approved, rolls back by a separate conditional patch of `{ "transparency": "opaque" }` using the ETag from the change response.
