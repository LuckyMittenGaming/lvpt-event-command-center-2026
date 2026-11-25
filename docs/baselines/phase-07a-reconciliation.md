# Phase 7A — reconciliation of the 18 Busy-to-Free candidates

Recorded: 2026-11-12, 3:34 AM ET. Read-only. No Calendar write, no Apps Script change, no trigger, no deployment, and no spreadsheet edit.

The file `LVPT_Phase7_Observed_Busy_Reminders_NOT_APPROVED.csv` was not on disk. The comparison uses the Phase 6 calendar export (1:58 AM ET) and a second export of the same four calendars (3:33 AM ET). Both contain 66 LVPT events.

## Recommendation

**NOT READY — ADDITIONAL VERIFICATION REQUIRED**

The 18 event IDs are recovered and still Busy. They are not certified for a write. The calendar export does not include an ETag or the private `lvptManaged` property. A Calendar API read did not return those fields. Fail closed: the 18 stay held until a pre-write GET confirms the ETag, `lvptManaged=taskSyncV1`, the task ID, Busy status, and the absence of client attendees.

## A. Reconciliation

| Item | Count |
|---|---|
| Phase 6 candidates recovered by event ID | 18 |
| Busy events in the 66-event inventory | 23 |
| Busy internal reminders | 20 |
| Busy confirmed client bookings | 3 |
| Original 18 still Busy at 3:33 AM | 18 |
| Original 18 that changed or disappeared | 0 |
| Additional Busy reminders not in the 18 | 2 |
| Tasks with two calendar copies | 23 |

The 18-versus-20 gap is the two Sales reminders below. They are Busy and titled like internal actions, and their descriptions do not use `LVPT INTERNAL ACTION REMINDER` or `Task ID:`. The Phase 6 planner ignores that shape, so they were never proposed. They must not be added to the allowlist.

Calendar IDs did not differ between the two exports. Every recovered event ID was present once.

## B. Held candidate set

These are the original 18. Preflight status for every row is **HELD**, not eligible. Original transparency is Busy (`opaque`). The only intended future change is Free (`transparent`). No other field is authorized to change.

Operations calendar: `c_a9756e49c39a571a2c21d99524f4c226e1772fca9f0c4156e245d5fd7d941a2a@group.calendar.google.com`

Sales calendar: `c_451b7f3ca8c727da168891a0d1d53475beb13c0c649c6157acdd98959b5cc334@group.calendar.google.com`

Proposals calendar: `c_e68f6233ff8a0e2fb22168ee24da99dc06e0416d652a0e1b964d3a88f5c0935b@group.calendar.google.com`

Seventeen events run 2026-11-12 14:00:00Z through 14:15:00Z. The Joyce Chang event runs 2026-11-13 14:00:00Z through 14:15:00Z.

| Event ID | Calendar | Task ID |
|---|---|---|
| qeldb1q51645jklbu85q4e04jk | Operations | id-o7d4f2t0-msgkz6li |
| kuvubcaj89o7u9l5ql5n0jbs50 | Operations | gmail-task-1a01a0153c0414d5-decisionfollowup |
| 1bc70raopb4mj9alj1re0ohhl0 | Operations | gmail-task-1a03b1faffef9dba-bellagioprocess |
| urus99830didvj72ep5qdol5d8 | Operations | gmail-task-1a04fe720da18e40-clientdecision |
| 3th8nnbtdhoj1ed0fsssa8h4v0 | Operations | gmail-task-1a059ae0795bc721-clientdecision |
| jh89up246rkqogdo7vp7qh6lek | Operations | gmail-task-1a06f0295ab4e6bb-groupscope |
| bq7th2lis1p5dq0n9vv5hqmtok | Operations | gmail-task-1a0a78195ff7c8a0-joycevenetian |
| 4764mu1mon4t9t1054oaarq7do | Operations | gmail-task-1a0a78195ff7c8a0-kristinvenetian |
| 75ifa5h75j8up225r4k896nsnc | Operations | gmail-task-1a102722f4286987-discovery |
| l2q0a40p8lipfk58g81ajhga8c | Operations | gmail-task-1a19a95026eded7f-clientdecision |
| e7dhiv8vcsnfbd1gf2bpnqam3k | Operations | gmail-task-1a1a7443ca3565f9-discoveryfollowup |
| gbljhks6kl6sh7krjdm0sj7ses | Operations | gmail-task-1a1a8b32395152af-vendorquote |
| hav83pf1j93ur9dr6l79o7g5f8 | Sales | gmail-task-1a05f0fe9f0a382d-instructor |
| 3etst3v579klkd2hk86backuuk | Sales | gmail-task-1a0bada019f53ead-elevatedbilling |
| k1l0o6pkfqosnrfpd23l5q7aek | Sales | gmail-task-1a08876d1e56e0fd-jeffpayment |
| pprrs36p091auhrmmonjek8lao | Sales | gmail-task-1a158ceb30c849d1-postevent |
| qno1altoshdauhp1421vqpuifk | Proposals | gmail-task-1a17faf048bae5f1-clientdecision |
| gk9tlvf7pfrhimbed2lk64u148 | Proposals | gmail-task-1a191299d3c0dd3d-clientdecision |

Each export record is `CONFIRMED`, has no attendee lines, and starts with `LVPT INTERNAL ACTION REMINDER`. The task ID inside the description matches the Phase 6 task ID. That is the ownership evidence the export can show. It is not a direct read of `extendedProperties.private.lvptManaged`.

Selection reason for all 18: the managed reminder was opaque, and no other field differed from the task record.

## C. Rejected or held

Held, the original 18: ETag and the private managed tag were not returned by the calendar record used here.

Excluded, the two reminders that make 20:

- Sales `mi358tus1pbj72iu2068db7c88`, task `gmail-task-1a1c67469016c306-clientdecision`, Thom Johnston. Busy, 15 minutes, no attendees. Description uses `task_id:` inside HTML and does not carry the managed action-reminder marker. A second copy, `4hl5lq664g19hrmgpn9mhpdguo`, is already on Operations.
- Sales `b024q97161v3c8oa86qnopl864`, task `gmail-task-1a1bed5c2d1df7df-discoveryreply`, William Traynor. Same shape. A second copy, `7p80f1s2na5qs6938393ou2bj4`, is already on Operations.

Excluded, three Busy client bookings on Confirmed Events:

- `ls1b1f2omslf3m7dhg2bvb2fmo`, Cowbell Cyber VIP mini-class.
- `5t20p2q88fshpbn450bp93q1qo`, Kristin / Ethan’s 21st.
- `jfq4sf39ovdqokb52e4ns9pohg`, OWS AWS executive poker.

Excluded, the legacy HTML owner reminders, including the November 9 NIUM Meet event `gpgtdkh0p7rmik88v479dfhghk`. They are not part of this correction. Seventeen of the 18 tasks also have one of those second copies. Joyce Chang’s Venetian reminder is the only candidate without a twin. The correction must name only the event IDs in the table above.

## D. Rollback record required before any future write

For each allowed event, save the GET response before changing it: calendar ID, event ID, ETag, status, transparency (`opaque`), summary, start, end, description, reminders, attendees, conference data, and `extendedProperties.private`. Restoration is a later patch of `transparency` back to `opaque` on that same event ID, using the ETag from the change response, and only if that ETag still matches. Do not delete or recreate the event.

## E. Unexecuted correction procedure

1. Read each allowlisted event again.
2. Abort that event if the ETag is missing, the status is not confirmed, transparency is not `opaque`, `lvptManaged` is not `taskSyncV1`, `lvptTaskId` differs, any attendee is not the business account, or the summary, start, or end differs from the saved record.
3. Send one PATCH whose body is only `{"transparency":"transparent"}`, with `If-Match` set to the ETag just read and `sendUpdates=none`.
4. On HTTP 412 or any other error, stop that event and do not retry with a broader body.
5. Log calendar ID, event ID, old ETag, new ETag, and result.
6. Do not discover or add further events. Do not touch the legacy HTML reminders, client bookings, the hourly TaskSync script, or the spreadsheet.

This procedure was not run. The read-only staging project was not given write permission.

## F. Final recommendation

**NOT READY — ADDITIONAL VERIFICATION REQUIRED**
