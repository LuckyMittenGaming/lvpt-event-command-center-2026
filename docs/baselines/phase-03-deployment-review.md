# Phase 3 deployment review — local only

Recorded: 2026-11-12. No clasp pull or push, no Calendar/Gmail/Sheets/Apps Script write, no customer message, and no git commit.

Recommendation: **NO-GO** for production deployment.

## What was compared

- Candidate: `apps-script/calendar-command-center/TaskSync.js`
- Original local pull, unchanged this session: `apps-script/live/calendar-command-center/TaskSync.js`
- Rollback copy, byte-identical to that pull: `apps-script/calendar-command-center/TaskSync.live-v3.0.js`
- Shared live hash: `B4E16BD2F579891E7A7F6172E7F1E24D1F88EC8AA6679FC62A5A64B589420E5E`

The live pull was not refreshed from Apps Script. This hash is the file already on disk, not a new export of the hourly trigger's Head.

## API operations

Valid for the Advanced Calendar service already enabled in `apps-script/live/calendar-command-center/appsscript.json` (Calendar v3, runtime V8):

| Call | Use | Verdict |
|---|---|---|
| `Events.list` | `singleEvents: false`, `showDeleted: false`, `privateExtendedProperty`, `q`, `pageToken` | Valid. Pagination stops with no writes if the page cap is hit. |
| `Events.get` | Canonical ids stored in task notes | Valid. A 404 is skipped. |
| `Events.insert` | New 15-minute reminder, `sendUpdates: 'none'` | Valid. Body has `transparency: 'transparent'` and no conference, guests, or recurrence. |
| `Events.patch` | Summary, description, reminders, extended properties, Free, duration cap | Valid. Omitted `conferenceData` stays unchanged. |
| `Events.remove` | Managed duplicate, completed, or orphan reminder, `sendUpdates: 'none'` | Valid. |

Meet removal is not valid through `Calendar.Events.patch({ conferenceData: null })`. The Advanced Service drops nulls, and the query parameter `conferenceDataVersion` accepts only 0 or 1. The earlier candidate copied the event's own conference version (which can be greater than 1) into that parameter. The corrected request, tested but not sent, is:

`PATCH /calendar/v3/calendars/{calendarId}/events/{eventId}?conferenceDataVersion=1&sendUpdates=none`

body: `{"conferenceData":null}`

`conferenceRestClear` is false. The candidate contains no direct HTTP call, so saving it does not add an OAuth scope and does not force the hourly trigger to reauthorize.

## Safeguards added after review

- Every change is checked before the first Calendar write. An unsafe later change does not leave an earlier write from that same run.
- Deletes, patches, replacements, and Meet identification require the managed tag `taskSyncV1`, the internal description marker, a matching task id, and no external guest.
- The calendar owner listed as `self` is not treated as a guest, so the hourly run does not create a new reminder for its own event.
- Unmanaged events on Confirmed Events are preserved. They also suppress creation, so a hand-copied task description on a client calendar is not deleted and does not spawn a twin reminder.
- A managed reminder found only on Confirmed Events is moved to Sales, Proposals, or Operations. A client booking beside it is not in the change list.
- Unmanaged reminders are not deleted when a task is marked complete.
- `runLVPTTaskSync` is still the only entry point. The file installs no trigger.

## Single writer

The hourly trigger already calls `runLVPTTaskSync` in the existing Calendar Command Center project. Replacing `TaskSync.js` in that project updates the same function. It does not create a project, a web app, or a second trigger.

`setupLVPTCalendars()` lives in `Code.js` and is not called by task sync. A deployment must not run it.

`Code.js` and the candidate do not share function names. The manifest already enables the Calendar advanced service used here. No manifest edit is required for this candidate.

## Personal Gmail writer grant

`setupLVPTCalendars()` in the live `Code.js` grants `wsopamatt@gmail.com` Calendar ACL role `writer` on all four business calendars when it is executed. Writer can add, change, and delete events and can see event details. Writer cannot change ACLs or delete the calendar; those stay with the owner `book@pokertraininglasvegas.com`.

This is an ownership risk: the personal mailbox can edit client meetings and task reminders outside TaskSync. It is not a second Apps Script writer, and it does not copy task events onto the personal calendar. Permissions were not read live and were not changed. Do not run `setupLVPTCalendars` as part of a TaskSync replacement.

## Deployment checklist

Use this only after a later, explicit approval. This review does not grant that approval.

1. In the Apps Script editor, copy the current `TaskSync.gs` to a local file and confirm it matches `TaskSync.live-v3.0.js`, or save a new export beside it if the editor differs.
2. Run `previewLVPTTaskSync` only. Confirm the account is `book@pokertraininglasvegas.com` and each of the four calendar names resolves to exactly one owned calendar.
3. Read every `REMOVE`, `REPLACE`, and `PATCH` line. Each id must be a managed internal reminder. Stop if a client session appears.
4. Replace only `TaskSync.gs` in the existing Calendar Command Center project. Do not create a project, add a trigger, edit `Code.js`, edit the manifest, or run `setupLVPTCalendars`.
5. Leave `conferenceRestClear` false.
6. Run preview again. Then run `runLVPTTaskSync` once. Run it a second time and expect zero writes.
7. Do not deploy the Vercel app for this change. Do not send email or SMS.

## Rollback

1. Paste `apps-script/calendar-command-center/TaskSync.live-v3.0.js` back into `TaskSync.gs` and save. The existing hourly trigger uses the saved head; do not add or delete a trigger.
2. Do not delete calendars. Do not delete an event on Confirmed Events unless the preview log shows that exact id was a managed internal reminder created by the candidate run.
3. If the candidate run inserted reminders, remove only those managed ids from the log, with `sendUpdates` left at `none`.
4. A failed preview throws before writes. Leaving the previous head in place is sufficient when no live run has been made.

## Tests

`npm run test:staging-safety` passed after the safeguards, including `tests/calendar-task-reconcile.test.cjs` and the existing SMS/Gmail suite. The fixtures are synthetic. No live Calendar call was made.

## Why this is NO-GO

- Meet links are identified and left in place. This candidate does not finish that cleanup.
- The four-calendar lookup can stop the hourly job if Confirmed Events is not exactly one owned calendar. Preview has not been run.
- The rollback file is the local pull, not a fresh editor export.
- A personal mailbox already has writer rights on the business calendars. That is outside this patch, and it is unresolved.
- An unmanaged Confirmed Events entry that copies the internal template blocks a new reminder instead of being edited. That avoids a bad delete, and it can also hide a real task until someone reviews the issue log.
- Google can rewrite description whitespace and cause a later patch. That updates a managed reminder; it does not delete a client event.
