# Phase 7F — cancelled managed events and active reminders

Recorded: 2026-11-20, 5:15 PM ET. Read-only. No Calendar write, no restore, no recreate, no production edit, no trigger change, no spreadsheet edit, and no new OAuth scope.

The original 18-event Busy-to-Free plan is superseded. It must not be executed. A cancelled event is not an active Busy reminder, even when `transparency` is omitted and the API default is `opaque`.

This phase did not call `events.list`. The Calendar grant that can read these calendars is the staging Apps Script runtime. That runtime is not executable from this session. The current status of the original 18 is the Phase 7E `Calendar.Events.get` run.

## A. Cancelled-event findings

Phase 7E returned an explicit `status` of `cancelled` for these 17 events and `confirmed` for Joyce Chang. All 17 still had an ETag, `lvptManaged=taskSyncV1`, the allowlisted `lvptTaskId`, an active Command Center task, no client attendees, and an omitted `transparency`.

| Event ID | Calendar | Task ID | Phase 7E status |
|---|---|---|---|
| qeldb1q51645jklbu85q4e04jk | Operations | id-o7d4f2t0-msgkz6li | cancelled |
| kuvubcaj89o7u9l5ql5n0jbs50 | Operations | gmail-task-1a01a0153c0414d5-decisionfollowup | cancelled |
| 1bc70raopb4mj9alj1re0ohhl0 | Operations | gmail-task-1a03b1faffef9dba-bellagioprocess | cancelled |
| urus99830didvj72ep5qdol5d8 | Operations | gmail-task-1a04fe720da18e40-clientdecision | cancelled |
| 3th8nnbtdhoj1ed0fsssa8h4v0 | Operations | gmail-task-1a059ae0795bc721-clientdecision | cancelled |
| jh89up246rkqogdo7vp7qh6lek | Operations | gmail-task-1a06f0295ab4e6bb-groupscope | cancelled |
| 4764mu1mon4t9t1054oaarq7do | Operations | gmail-task-1a0a78195ff7c8a0-kristinvenetian | cancelled |
| 75ifa5h75j8up225r4k896nsnc | Operations | gmail-task-1a102722f4286987-discovery | cancelled |
| l2q0a40p8lipfk58g81ajhga8c | Operations | gmail-task-1a19a95026eded7f-clientdecision | cancelled |
| e7dhiv8vcsnfbd1gf2bpnqam3k | Operations | gmail-task-1a1a7443ca3565f9-discoveryfollowup | cancelled |
| gbljhks6kl6sh7krjdm0sj7ses | Operations | gmail-task-1a1a8b32395152af-vendorquote | cancelled |
| hav83pf1j93ur9dr6l79o7g5f8 | Sales | gmail-task-1a05f0fe9f0a382d-instructor | cancelled |
| 3etst3v579klkd2hk86backuuk | Sales | gmail-task-1a0bada019f53ead-elevatedbilling | cancelled |
| k1l0o6pkfqosnrfpd23l5q7aek | Sales | gmail-task-1a08876d1e56e0fd-jeffpayment | cancelled |
| pprrs36p091auhrmmonjek8lao | Sales | gmail-task-1a158ceb30c849d1-postevent | cancelled |
| qno1altoshdauhp1421vqpuifk | Proposals | gmail-task-1a17faf048bae5f1-clientdecision | cancelled |
| gk9tlvf7pfrhimbed2lk64u148 | Proposals | gmail-task-1a191299d3c0dd3d-clientdecision | cancelled |

Joyce Chang remains separate: `bq7th2lis1p5dq0n9vv5hqmtok` on Operations, task `gmail-task-1a0a78195ff7c8a0-joycevenetian`, status `confirmed`.

The November 12 export showed these 17 as one-time confirmed events, not recurring series. Phase 7E still returned private properties, the schedule, and the description prefix together with `cancelled`. The Calendar API says a cancelled exception of a recurring event is only guaranteed to keep `id`, `recurringEventId`, and `originalStartTime`, while a cancelled event on the organizer’s calendar keeps its details. The retained details fit a deleted one-time event, not a stripped recurring exception. `recurringEventId`, `created`, and `updated` were not in the Phase 7E log, so the deletion time and the actor are not known. Status alone does not say who cancelled the event or why.

TaskSync does not hardcode these 17 IDs. It can see an ID only if `events.list` returns the event or if the Tasks notes contain `canonical_calendar_id` and `canonical_event_id`. The Phase 7E sheet read did not include the notes column, so stored canonical IDs were not checked.

## B. Active-reminder reconciliation

Phase 7A, from the November 12 export, found a second copy for each of these 17 tasks and none for Joyce. Those copies were not read again. A November 12 copy is not evidence that an active reminder exists today.

| Task ID | Historical second copy | November 12 calendar note | Classification |
|---|---|---|---|
| id-o7d4f2t0-msgkz6li | 7r78utpij6787lifhte6vm17jk | Calendar not named in the recovered note | UNRESOLVED |
| gmail-task-1a01a0153c0414d5-decisionfollowup | pmiuo210amsdf98q37fi7qs988 | Proposals | UNRESOLVED |
| gmail-task-1a03b1faffef9dba-bellagioprocess | fs8toes3gp8slclfbc9solti4k | Proposals | UNRESOLVED |
| gmail-task-1a04fe720da18e40-clientdecision | ssiirrmm9lc5hh41t0rbhbc430 | Proposals | UNRESOLVED |
| gmail-task-1a059ae0795bc721-clientdecision | 2o5p51hv3d13tpvu6ui94fg3fs | Proposals | UNRESOLVED |
| gmail-task-1a06f0295ab4e6bb-groupscope | 87lqjhdo5qq4auong34bfp47l8 | Operations | UNRESOLVED |
| gmail-task-1a0a78195ff7c8a0-kristinvenetian | t81hbisjdtcvutkqd5k3re6co8 | Operations | UNRESOLVED |
| gmail-task-1a102722f4286987-discovery | e733somvk0gi7g85lsacpu57eg | Calendar not named in the recovered note | UNRESOLVED |
| gmail-task-1a19a95026eded7f-clientdecision | u3h0gkah40fbpouhf2uecvsrak | Proposals | UNRESOLVED |
| gmail-task-1a1a7443ca3565f9-discoveryfollowup | 48hbsi4gdbjl0m11hoogm9lla8 | Sales | UNRESOLVED |
| gmail-task-1a1a8b32395152af-vendorquote | v9l36pnv1jh96r5b2rcvrreo84 | Confirmed Events | UNRESOLVED |
| gmail-task-1a05f0fe9f0a382d-instructor | mafkf4p2e7p2ac0jbgms9tfnrc | Confirmed Events | UNRESOLVED |
| gmail-task-1a0bada019f53ead-elevatedbilling | dlsu4h9uct7qbmef54kklm3l68 | Operations | UNRESOLVED |
| gmail-task-1a08876d1e56e0fd-jeffpayment | 4ta5rivap92km00nm5sdjtj1bk | Operations | UNRESOLVED |
| gmail-task-1a158ceb30c849d1-postevent | gpgtdkh0p7rmik88v479dfhghk | Operations, legacy HTML Meet copy, not the managed original | UNRESOLVED |
| gmail-task-1a17faf048bae5f1-clientdecision | dgv3r4smrpu19u2tf87upi1ei8 | Proposals | UNRESOLVED |
| gmail-task-1a191299d3c0dd3d-clientdecision | n66sk38bad9532hoe8b0pirj1g | Proposals | UNRESOLVED |
| gmail-task-1a0a78195ff7c8a0-joycevenetian | none in the November 12 export | Operations `bq7th2lis1p5dq0n9vv5hqmtok` is confirmed | ACTIVE REMINDER EXISTS |

`gpgtdkh0p7rmik88v479dfhghk` is the legacy NIUM HTML reminder. It is not a second managed action reminder. None of the second copies were classified as an active usable reminder, because they were not retrieved.

## C. True calendar occupancy

Cancelled records are excluded from Busy/Free clutter. The 17 cancelled originals do not occupy the calendar. Omitted transparency does not put them back on the grid.

Joyce Chang’s confirmed event omits `transparency`, so the API default is Busy. That event does occupy 15 minutes. It stays held for the reasons in section E.

No new `events.list` with `showDeleted: false` was run, so today’s counts of confirmed reminders, client bookings, legacy HTML reminders, and tasks with no active reminder are not known. The November 12 inventory (66 events, 23 Busy, 21 legacy HTML, 3 client bookings) is not today’s occupancy.

These stay protected and were not changed: Cowbell `ls1b1f2omslf3m7dhg2bvb2fmo`, Kristin / Ethan `5t20p2q88fshpbn450bp93q1qo`, OWS AWS `jfq4sf39ovdqokb52e4ns9pohg`, and the 21 legacy HTML reminders.

## D. TaskSync defect analysis

### Verified

Production `apps-script/live/calendar-command-center/TaskSync.js` and staging `apps-script/staging-calendar-preview/TaskSync.js` both:

- call `Calendar.Events.list` with `showDeleted: false` and no `syncToken` or `updatedMin`
- call `Calendar.Events.get` only for canonical IDs in task notes
- drop an event when `status === 'cancelled'` or `recurringEventId` is set
- create a new reminder when the task is active and dated and the visible reminder list is empty

`events.list` does not return cancelled events in that mode. `events.get` does. The get result is then discarded. The cancelled event is not treated as an active reminder. It is treated as no reminder.

Production `runLVPTTaskSync` calls that path with preview false and can `Calendar.Events.insert`. The hourly trigger runs `runLVPTTaskSync`. Staging `runLVPTTaskSync` throws before any write. A staging preview would only log a create.

Production scans Sales, Proposals, and Operations. It does not scan Confirmed Events. The historical copies `v9l36pnv1jh96r5b2rcvrreo84` and `mafkf4p2e7p2ac0jbgms9tfnrc` are on Confirmed Events, so production cannot use them as the existing reminder. Staging scans all four calendars.

There is no tombstone. A cancelled managed ID does not block a later create. That is the defect. It is in the proposed hourly production script, not only in the staging candidate.

Live patch bodies do not set `transparency`. The Busy-to-Free correction was never part of production v3.0.

### Suspected, not verified

If none of the second copies are still a visible, matching reminder, the next production `runLVPTTaskSync` would insert a new reminder for each of these 17 open tasks. That condition was not re-read. A still-active managed copy on Sales, Proposals, or Operations would satisfy the empty-list check and no create would be planned for that task.

Who cancelled the 17 events, and when, is not in the Phase 7E log or in a repository audit. Do not attribute the cancellation to TaskSync or to an owner delete from status alone.

Duplicate reminders are not shown to be intentional. The November 12 export had two copies for 23 tasks. Whether any pair is still two active events is unresolved. No duplicate was merged.

### Not applied

Do not recreate a reminder because its prior copy is cancelled. A later code change should record a cancelled managed event as a tombstone and require an explicit owner decision before insert. That change was not written into either TaskSync file.

## E. Joyce Chang review

`bq7th2lis1p5dq0n9vv5hqmtok` is confirmed, owned by `taskSyncV1`, tied to active task `gmail-task-1a0a78195ff7c8a0-joycevenetian`, and effectively Busy. It is the one remaining original that occupies time.

The repository does not contain an owner receipt for a $900 Venetian venue fee on October 17, and it does not contain the exact event title or full description. Other Venetian notes in the public roster, including INV-000838, are a different event and are not this task’s payment record. An open task status is not proof the fee is unpaid, and it is not proof the administrative work is finished.

The reminder stays **HELD**. It was not changed. The task status was not changed.

## F. Recommended next actions

1. Do not run the original transparency correction. The 17 targets are cancelled.
2. Do not restore or recreate those 17 events.
3. Before the next production `runLVPTTaskSync`, read the 17 historical second copies with `Calendar.Events.get` and list the four calendars with `showDeleted: false`. That read has not been done.
4. Change TaskSync so a cancelled managed reminder is a tombstone, not an empty slot that creates a new event. Apply that only after a separate review. The hourly production script has this create path today.
5. Leave Joyce Chang’s reminder held until the fee record and the exact title and description are verified.
6. Leave client bookings, legacy HTML reminders, and duplicate copies unchanged.

**NOT READY for any calendar write.**

Verified defects: cancelled events are dropped, and an empty visible list becomes a create in production `runLVPTTaskSync`. Suspected: that create would fire for these 17 tasks on the next hourly run. Unresolved: current status of every second copy, and whether Joyce’s administrative task is still required.
