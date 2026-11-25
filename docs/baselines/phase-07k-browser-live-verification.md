# Phase 7K — browser live verification

Recorded: 2026-11-21, 11:03–11:04 PM America/New_York. The live function ran once in LVPT Calendar Preview Staging. No clasp token was refreshed. Production was not opened. `TaskSync.gs` was not edited. No Calendar or Sheet write, trigger, deployment, or OAuth change was made.

## Live execution

Account: `book@pokertraininglasvegas.com`. Project title: LVPT Calendar Preview Staging. Script ID: `1rDlSTCuf7R9yYY3h5ggM-Z3Ivv9S5AMMvRZSnatrgYpTDKKiwMACJm8f`.

Three new files were saved beside the existing files: `TaskSync.safe-review.gs`, `TaskSync.safe-integrate.gs`, and `verifyLVPTSafeIntegrationLive.gs`. The editor still showed `var LVPT_STAGING_PREVIEW_ONLY = true` in `TaskSync.gs`. Services remained Calendar and Sheets. The function dropdown listed `verifyLVPTSafeIntegrationLive`. Google did not show a new consent screen. The execution log reported start at 11:03:57 PM and the summary at 11:04:15 PM, then `Execution completed`.

`LVPT_SAFE_LIVE_SUMMARY`

```json
{"tasksRows":169,"datedActiveTasks":52,"fourCalendarScanComplete":true,"calendarScan":{"sales":true,"proposals":true,"operations":true,"confirmed":true},"cancelledManagedRecords":870,"activeManagedReminders":33,"legacyReminders":21,"suppressedCreates":19,"busyManagedReminders":18,"unchangedManagedReminders":15,"reviewDecisions":0,"noChangeDecisions":33,"proposedWrites":0,"calendarWrites":0,"sheetWrites":0,"baseline":{"syntheticBaseline":{"suppressedCreates":19,"busyManagedReminders":18,"unchangedManagedReminders":15},"matchesSyntheticBaseline":true,"differences":[],"adjustedToBaseline":false}}
```

The 19 / 18 / 15 decision buckets matched the synthetic baseline, and `adjustedToBaseline` is false. The live inventory is not the same shape as that fixture:

- Cancelled managed records are 870, not 17. `showDeleted` returned the retained cancelled managed history for these tasks. Several suppressed tasks have 30–42 matching event IDs. The 17 previously identified duplicates are inside that history.
- Legacy reminders are 21. Nineteen dated active tasks are suppressed because a legacy reminder still exists. Two additional legacy reminders sit beside an active managed reminder and were left unchanged: `gmail-task-1a1103615d047784-clientdecision` and `gmail-task-1a1bed5c2d1df7df-discoveryreply` (event `b024q97161v3c8oa86qnopl864`).
- Active managed reminders are 33: 18 Busy and 15 transparent. The 15 count matches the baseline count. Those 15 are the current transparent managed events, not the synthetic stand-in IDs.
- CertaPro `kg49e1cfu2o9rvtkbq0l3erdeg` and Cowbell `d0679uii6sfi6ig6metb4u21vc` are in the suppress lists. Joyce `bq7th2lis1p5dq0n9vv5hqmtok` is one of the 18 Busy managed reminders and is `NO CHANGE`.
- Proposed writes, Calendar writes, and Sheet writes are 0. Review decisions are 0.

`LVPT_SAFE_LIVE_ISSUES` has 15 notes. Each says a canonical event from Tasks notes is cancelled and was left to the managed history query. The scan stayed complete. There were no execution errors or warnings.

The Events column below is the number of matching event IDs in that decision. The execution log holds the full ID arrays.

| Task ID | Decision | Classification | Busy | Events | Reason |
|---|---|---|---|---|---|
| id-o7d4f2t0-msgkz6li | SUPPRESS CREATE | legacy+cancelled_managed | no | 34 | active legacy reminder; no duplicate create and no legacy mutation |
| gmail-task-19f965e4b17d99eb-followup | NO CHANGE | managed+cancelled_managed | no | 7 | managed reminder exists |
| gmail-task-19df5db3edf313f9-reengage | NO CHANGE | managed+cancelled_managed | no | 10 | managed reminder exists |
| gmail-task-19ea7defa95c310b-reengage | NO CHANGE | managed+cancelled_managed | no | 4 | managed reminder exists |
| gmail-task-19edcdff0628b880-reengage | NO CHANGE | managed | no | 1 | managed reminder exists |
| gmail-task-19d642281ac488db-reengage | NO CHANGE | managed+cancelled_managed | no | 7 | managed reminder exists |
| gmail-task-19d4cb2af541973e-reengage | NO CHANGE | managed | no | 1 | managed reminder exists |
| gmail-task-19d4672cca5278cc-reengage | NO CHANGE | managed | no | 1 | managed reminder exists |
| gmail-task-19c7f51322d18e96-reengage | NO CHANGE | managed | no | 1 | managed reminder exists |
| gmail-task-19d1293ffc286089-reengage | NO CHANGE | managed | no | 1 | managed reminder exists |
| gmail-task-19cfea5e4c98eb7f-reengage | NO CHANGE | managed | no | 1 | managed reminder exists |
| gmail-task-1a01a0153c0414d5-decisionfollowup | SUPPRESS CREATE | legacy+cancelled_managed | no | 38 | active legacy reminder; no duplicate create and no legacy mutation |
| gmail-task-1a03b1faffef9dba-bellagioprocess | SUPPRESS CREATE | legacy+cancelled_managed | no | 38 | active legacy reminder; no duplicate create and no legacy mutation |
| gmail-task-1a03aa8f6434eb1b-decision | NO CHANGE | managed | no | 1 | managed reminder exists |
| gmail-task-1a04fe720da18e40-clientdecision | SUPPRESS CREATE | legacy+cancelled_managed | no | 39 | active legacy reminder; no duplicate create and no legacy mutation |
| gmail-task-1a059ae0795bc721-clientdecision | SUPPRESS CREATE | legacy+cancelled_managed | no | 35 | active legacy reminder; no duplicate create and no legacy mutation |
| gmail-task-1a05f0fe9f0a382d-instructor | SUPPRESS CREATE | legacy+cancelled_managed | no | 35 | active legacy reminder; no duplicate create and no legacy mutation |
| gmail-task-1a06f0295ab4e6bb-groupscope | SUPPRESS CREATE | legacy+cancelled_managed | no | 39 | active legacy reminder; no duplicate create and no legacy mutation |
| gmail-task-1a0a78195ff7c8a0-joycevenetian | NO CHANGE | managed+cancelled_managed | yes | 6 | managed reminder exists |
| gmail-task-1a0a78195ff7c8a0-kristinvenetian | SUPPRESS CREATE | legacy+cancelled_managed | no | 34 | active legacy reminder; no duplicate create and no legacy mutation |
| gmail-task-1a0bada019f53ead-elevatedbilling | SUPPRESS CREATE | legacy+cancelled_managed | no | 35 | active legacy reminder; no duplicate create and no legacy mutation |
| task-neo-kenna-mc-20260921 | NO CHANGE | managed+cancelled_managed | no | 7 | managed reminder exists |
| gmail-task-1a08876d1e56e0fd-jeffpayment | SUPPRESS CREATE | legacy+cancelled_managed | no | 38 | active legacy reminder; no duplicate create and no legacy mutation |
| gmail-task-1a0feaed6e132db9-venuefeasibility | NO CHANGE | managed+cancelled_managed | yes | 9 | managed reminder exists |
| gmail-task-1a102722f4286987-discovery | SUPPRESS CREATE | legacy+cancelled_managed | no | 35 | active legacy reminder; no duplicate create and no legacy mutation |
| task-neo-postevent-20261004 | NO CHANGE | managed+cancelled_managed | no | 4 | managed reminder exists |
| gmail-task-1a1103615d047784-clientdecision | NO CHANGE | legacy+managed+cancelled_managed | yes | 26 | managed reminder exists; legacy reminder is not modified |
| gmail-task-1a114c283f7aa9e7-clientdecision | NO CHANGE | managed+cancelled_managed | no | 9 | managed reminder exists |
| gmail-task-1a14afb878ba0aee-postevent | NO CHANGE | managed+cancelled_managed | no | 4 | managed reminder exists |
| gmail-task-1a1564e8e21a05f3-production | SUPPRESS CREATE | legacy+cancelled_managed | no | 30 | active legacy reminder; no duplicate create and no legacy mutation |
| gmail-task-1a158ceb30c849d1-postevent | SUPPRESS CREATE | legacy+cancelled_managed | no | 37 | active legacy reminder; no duplicate create and no legacy mutation |
| gmail-task-1a16b8891d4a7770-bookingpayment | NO CHANGE | managed+cancelled_managed | yes | 26 | managed reminder exists |
| gmail-task-1a17b46e09a272df-bookingpayment | NO CHANGE | managed | yes | 1 | managed reminder exists |
| gmail-task-1a17faf048bae5f1-clientdecision | SUPPRESS CREATE | legacy+cancelled_managed | no | 38 | active legacy reminder; no duplicate create and no legacy mutation |
| gmail-task-1a189f1dffa1d00f-production | SUPPRESS CREATE | legacy+cancelled_managed | no | 33 | active legacy reminder; no duplicate create and no legacy mutation |
| gmail-task-1a191299d3c0dd3d-clientdecision | SUPPRESS CREATE | legacy+cancelled_managed | no | 37 | active legacy reminder; no duplicate create and no legacy mutation |
| gmail-task-1a19a95026eded7f-clientdecision | SUPPRESS CREATE | legacy+cancelled_managed | no | 36 | active legacy reminder; no duplicate create and no legacy mutation |
| gmail-task-1a1a7443ca3565f9-discoveryfollowup | SUPPRESS CREATE | legacy+cancelled_managed | no | 37 | active legacy reminder; no duplicate create and no legacy mutation |
| gmail-task-1a1a8b32395152af-vendorquote | SUPPRESS CREATE | legacy+cancelled_managed | no | 42 | active legacy reminder; no duplicate create and no legacy mutation |
| gmail-task-1a1bed5c2d1df7df-discoveryreply | NO CHANGE | managed+legacy+cancelled_managed | yes | 17 | managed reminder exists; legacy reminder is not modified |
| gmail-task-1a1c67469016c306-clientdecision | NO CHANGE | managed+cancelled_managed | yes | 18 | managed reminder exists |
| gmail-task-1a1d76cf9dfafdc4-wynnavailability | NO CHANGE | managed+cancelled_managed | yes | 2 | managed reminder exists |
| gmail-task-1a1d7503cc983f54-clientdecision | NO CHANGE | managed | yes | 1 | managed reminder exists |
| gmail-task-1a1d7040c8853895-timechangeconfirm | NO CHANGE | managed | yes | 1 | managed reminder exists |
| gmail-task-1a1d72076f909e47-finalpayment | NO CHANGE | managed | yes | 1 | managed reminder exists |
| gmail-task-1a1d8a6f27318b66-servicerecovery | NO CHANGE | managed | yes | 1 | managed reminder exists |
| gmail-task-1a1e489547ec192b-clientdecision | NO CHANGE | managed | yes | 1 | managed reminder exists |
| gmail-task-1a1eae8c91203b91-pokergocall | NO CHANGE | managed | yes | 1 | managed reminder exists |
| gmail-task-1a1ea80f87c9972f-tasksyncfailure | NO CHANGE | managed | yes | 1 | managed reminder exists |
| gmail-task-1a1f5465289712d1-clientdecision | NO CHANGE | managed | yes | 1 | managed reminder exists |
| gmail-task-1a1f5d69c2088b29-discoveryreply | NO CHANGE | managed | yes | 1 | managed reminder exists |
| gmail-task-1a1f5df6298c515c-discoveryreply | NO CHANGE | managed | yes | 1 | managed reminder exists |

## Function

`verifyLVPTSafeIntegrationLive`

Paste source: `apps-script/calendar-command-center/verifyLVPTSafeIntegrationLive.js`

It is not in the staging clasp root. The installed `apps-script/staging-calendar-preview/TaskSync.js` planner was not edited.

## What it does

The function checks `LVPT_STAGING_PREVIEW_ONLY === true`, checks that the active account is `book@pokertraininglasvegas.com`, and checks that `automaticCreateEnabled` is still false. It then uses the installed readers:

- `lvptStagingReadSheet_` for the Tasks tab
- `lvptListCalendarEvents_` for all four LVPT calendars
- `lvptCanonicalReferences_` and one `Calendar.Events.get` for a note reference that was not already listed
- `lvptTaskCategory_` only to label a task’s existing placement calendar in memory

The list selectors come from `lvptSafeDiscoveryQueries_`: the managed private-property query, `LVPT INTERNAL`, `INTERNAL OWNER REMINDER`, and the same managed query with `showDeleted: true`. The installed list helper walks pages and throws if a page token repeats or the page cap is reached. That throw makes the scan incomplete. An incomplete scan produces no decisions and no proposed writes.

Records are deduplicated by calendar ID and event ID. A cancelled copy is kept when both copies appear. The function calls `lvptDryRunSafeDecisions_` with no owner-approval flags and an empty tombstone list. It does not call the installed planner, `previewLVPTTaskSync`, or the production runner.

## Owner steps

These steps were performed in the browser on 2026-11-21.

1. Open the LVPT Calendar Preview Staging project while signed in as `book@pokertraininglasvegas.com`: `https://script.google.com/d/1rDlSTCuf7R9yYY3h5ggM-Z3Ivv9S5AMMvRZSnatrgYpTDKKiwMACJm8f/edit`
2. Leave the existing TaskSync file unchanged.
3. Add three new files and paste these sources without editing them:
   - `TaskSync.safe-review.js`
   - `TaskSync.safe-integrate.js`
   - `verifyLVPTSafeIntegrationLive.js`
4. Save. Do not add a trigger and do not deploy.
5. Choose `verifyLVPTSafeIntegrationLive` and run it. If Google asks for a scope that is not already `spreadsheets.readonly` or `calendar.readonly`, cancel.
6. Read the execution log. Do not run a writer from that log.

## Dependencies and permissions

The staging project already has the Calendar and Sheets advanced services and these scopes:

- `https://www.googleapis.com/auth/spreadsheets.readonly`
- `https://www.googleapis.com/auth/calendar.readonly`

No new scope, service, or library is required. The function needs the existing staging file because that file holds the preview flag, the calendar names, and the read helpers. It needs the two Phase 7J files because those hold the decision functions. Both engine files use ordinary Apps Script functions and have no Node dependency.

## Log format

One summary line:

`LVPT_SAFE_LIVE_SUMMARY {"tasksRows":0,"datedActiveTasks":0,"fourCalendarScanComplete":false,"calendarScan":{"sales":false,"proposals":false,"operations":false,"confirmed":false},"cancelledManagedRecords":0,"activeManagedReminders":0,"legacyReminders":0,"suppressedCreates":0,"busyManagedReminders":0,"unchangedManagedReminders":0,"reviewDecisions":0,"noChangeDecisions":0,"proposedWrites":0,"calendarWrites":0,"sheetWrites":0,"baseline":{"syntheticBaseline":{"suppressedCreates":19,"busyManagedReminders":18,"unchangedManagedReminders":15},"matchesSyntheticBaseline":false,"differences":[],"adjustedToBaseline":false}}`

One line per dated active task after a complete scan:

`LVPT_SAFE_LIVE_DECISION {"taskId":"","classification":"","eventIds":[],"history":"","decision":"NO CHANGE","reason":"","transparencyHeld":false,"writes":0}`

`decision` is `NO CHANGE`, `SUPPRESS CREATE`, or `REVIEW`. `history` lists each matching role and event ID. `calendarWrites` and `sheetWrites` are fixed at 0.

One issues line:

`LVPT_SAFE_LIVE_ISSUES []`

The baseline object names each of the 19 previously suppressed task IDs and 18 Busy task IDs whose live decision differs. The 15 unchanged reminders are compared as a count because their live event IDs were not part of the synthetic fixture. `adjustedToBaseline` stays false.

## Local check

`node tests/calendar-safe-live-verify.test.cjs` passed against a fake Calendar service and the real staging page walker. That run is not a live inventory. It confirmed the four queries, deduplication, the CertaPro line-wrapped reminder, rejection of a repeated page token, and zero writer calls.

## Still not tested

The separate transparency correction was not run. No fresh ETag was sent. Production TaskSync was not opened or executed. The hourly trigger was not restored.
