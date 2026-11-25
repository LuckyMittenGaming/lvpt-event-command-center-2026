# Phase 7B — API-level verification of the 18 Busy-to-Free candidates

Recorded: 2026-11-20, 1:20 PM ET. Read-only. No Calendar write, no Apps Script change, no trigger, no deployment, no spreadsheet edit, and no new OAuth scope or credential.

The 18 pairs are the pairs in `docs/baselines/phase-07a-reconciliation.md`. No identifier was reconstructed and no candidate was added.

## Recommendation

**NOT READY — ADDITIONAL VERIFICATION REQUIRED**

| Result | Count |
|---|---|
| VERIFIED — TECHNICALLY ELIGIBLE | 0 |
| HELD — INCOMPLETE VERIFICATION | 18 |
| REJECTED — FAILED SAFETY CHECK | 0 |

No event is certified for a write. Technical eligibility was not reached, and technical eligibility would not be owner authorization.

## A. API access findings

ETags and private ownership markers were not retrieved. No `events.get` call returned an event resource. There is no raw event body to archive. The responses that came back were API errors, not events.

The TaskSync metadata that a successful read must show is `extendedProperties.private.lvptManaged` equal to `taskSyncV1`, plus `extendedProperties.private.lvptTaskId` equal to the Phase 6 task ID. Those keys are what `apps-script/staging-calendar-preview/TaskSync.js` writes. A matching title, description, or task ID in the description is not ownership.

### Why the Phase 7A read did not expose the ETag or the private marker

The Phase 7A call never received an event body. Three separate limits stacked:

1. The request used a `fields=` filter. Phase 7B did not repeat that filter. A reduced field list was not the reason this phase failed, because this phase requested the full resource and the service still refused the call.
2. Calls that sent `Origin: https://calendar.google.com` to `googleapis.com` or `clients6.google.com`, with a SAPISIDHASH built for that origin, returned HTTP 400: `Origin doesn't match Host for XD3.`
3. The same host with the hash origin set to `https://clients6.google.com` returned HTTP 401. A copied Firefox cookie plus SAPISIDHASH is not an OAuth access token. Replaying those cookies against `https://calendar.google.com/calendar/u/1/r` redirected to the Google sign-in page, so the copied jar does not carry a usable Calendar session.

The clasp refresh token now returns `invalid_grant`. It was not refreshed and no scope was added. The last token recorded for that client did not include `calendar.readonly`.

### What the live Calendar session returned

Firefox was already signed in to Google Calendar as the Las Vegas business profile at `calendar.google.com/calendar/u/1/r`. That page can render the four LVPT calendars. From that page, with no field filter, this request was sent for the first allowlisted event:

`GET https://clients6.google.com/calendar/v3/calendars/{operationsCalendarId}/events/qeldb1q51645jklbu85q4e04jk`

The service answered HTTP 403. The JSON error message was:

`Permission denied on the service.`

That is a refusal of the Calendar API service. It is not an event resource with extended properties omitted. The private marker was neither confirmed nor shown to be absent. A missing response is not evidence that `lvptManaged` is missing, so these events are held rather than rejected.

A second diagnostic attached an API key already present on an unrelated `clients6.google.com` request in that same page. That call returned HTTP 404. The key belongs to a different Google service, not to a Calendar authorization, so the 404 is not evidence that the event was deleted and is not evidence about ownership. No new API key, OAuth client, scope, or Apps Script setting was created.

The week view still showed overdue reminder bars for November 16–20. That is a screen observation only. It does not identify these 18 event IDs and it does not supply an ETag, transparency, attendees, or `extendedProperties`.

## B. Exact 18-event eligibility matrix

Operations calendar: `c_a9756e49c39a571a2c21d99524f4c226e1772fca9f0c4156e245d5fd7d941a2a@group.calendar.google.com`

Sales calendar: `c_451b7f3ca8c727da168891a0d1d53475beb13c0c649c6157acdd98959b5cc334@group.calendar.google.com`

Proposals calendar: `c_e68f6233ff8a0e2fb22168ee24da99dc06e0416d652a0e1b964d3a88f5c0935b@group.calendar.google.com`

Every row failed closed for the same reason: `events.get` did not return the event. Columns 5–11 are therefore no. The title cell is `Not returned` because the API did not supply a summary. The task ID is the Phase 7A allowlist value, not a value read from the event.

| Calendar ID | Event ID | Task ID | Event title | ETag present | Private ownership marker verified | Command Center task verified | Status confirmed | Busy status verified | Client attendees absent | Baseline unchanged | Final classification | Reason for rejection or hold |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Operations | qeldb1q51645jklbu85q4e04jk | id-o7d4f2t0-msgkz6li | Not returned | No | No | No | No | No | No | No | HELD — INCOMPLETE VERIFICATION | events.get HTTP 403, Permission denied on the service. No event resource. |
| Operations | kuvubcaj89o7u9l5ql5n0jbs50 | gmail-task-1a01a0153c0414d5-decisionfollowup | Not returned | No | No | No | No | No | No | No | HELD — INCOMPLETE VERIFICATION | Same API refusal. Not requested individually after the service denied the first full read. |
| Operations | 1bc70raopb4mj9alj1re0ohhl0 | gmail-task-1a03b1faffef9dba-bellagioprocess | Not returned | No | No | No | No | No | No | No | HELD — INCOMPLETE VERIFICATION | Same API refusal. |
| Operations | urus99830didvj72ep5qdol5d8 | gmail-task-1a04fe720da18e40-clientdecision | Not returned | No | No | No | No | No | No | No | HELD — INCOMPLETE VERIFICATION | Same API refusal. |
| Operations | 3th8nnbtdhoj1ed0fsssa8h4v0 | gmail-task-1a059ae0795bc721-clientdecision | Not returned | No | No | No | No | No | No | No | HELD — INCOMPLETE VERIFICATION | Same API refusal. |
| Operations | jh89up246rkqogdo7vp7qh6lek | gmail-task-1a06f0295ab4e6bb-groupscope | Not returned | No | No | No | No | No | No | No | HELD — INCOMPLETE VERIFICATION | Same API refusal. |
| Operations | bq7th2lis1p5dq0n9vv5hqmtok | gmail-task-1a0a78195ff7c8a0-joycevenetian | Not returned | No | No | No | No | No | No | No | HELD — INCOMPLETE VERIFICATION | Same API refusal. |
| Operations | 4764mu1mon4t9t1054oaarq7do | gmail-task-1a0a78195ff7c8a0-kristinvenetian | Not returned | No | No | No | No | No | No | No | HELD — INCOMPLETE VERIFICATION | Same API refusal. |
| Operations | 75ifa5h75j8up225r4k896nsnc | gmail-task-1a102722f4286987-discovery | Not returned | No | No | No | No | No | No | No | HELD — INCOMPLETE VERIFICATION | Same API refusal. |
| Operations | l2q0a40p8lipfk58g81ajhga8c | gmail-task-1a19a95026eded7f-clientdecision | Not returned | No | No | No | No | No | No | No | HELD — INCOMPLETE VERIFICATION | Same API refusal. |
| Operations | e7dhiv8vcsnfbd1gf2bpnqam3k | gmail-task-1a1a7443ca3565f9-discoveryfollowup | Not returned | No | No | No | No | No | No | No | HELD — INCOMPLETE VERIFICATION | Same API refusal. |
| Operations | gbljhks6kl6sh7krjdm0sj7ses | gmail-task-1a1a8b32395152af-vendorquote | Not returned | No | No | No | No | No | No | No | HELD — INCOMPLETE VERIFICATION | Same API refusal. |
| Sales | hav83pf1j93ur9dr6l79o7g5f8 | gmail-task-1a05f0fe9f0a382d-instructor | Not returned | No | No | No | No | No | No | No | HELD — INCOMPLETE VERIFICATION | Same API refusal. |
| Sales | 3etst3v579klkd2hk86backuuk | gmail-task-1a0bada019f53ead-elevatedbilling | Not returned | No | No | No | No | No | No | No | HELD — INCOMPLETE VERIFICATION | Same API refusal. |
| Sales | k1l0o6pkfqosnrfpd23l5q7aek | gmail-task-1a08876d1e56e0fd-jeffpayment | Not returned | No | No | No | No | No | No | No | HELD — INCOMPLETE VERIFICATION | Same API refusal. |
| Sales | pprrs36p091auhrmmonjek8lao | gmail-task-1a158ceb30c849d1-postevent | Not returned | No | No | No | No | No | No | No | HELD — INCOMPLETE VERIFICATION | Same API refusal. |
| Proposals | qno1altoshdauhp1421vqpuifk | gmail-task-1a17faf048bae5f1-clientdecision | Not returned | No | No | No | No | No | No | No | HELD — INCOMPLETE VERIFICATION | Same API refusal. |
| Proposals | gk9tlvf7pfrhimbed2lk64u148 | gmail-task-1a191299d3c0dd3d-clientdecision | Not returned | No | No | No | No | No | No | No | HELD — INCOMPLETE VERIFICATION | Same API refusal. |

The first event was requested directly and returned HTTP 403. The other 17 were not sent as a batch after that refusal. They use the same account, the same API, and the same missing authorization. Sending them would not create an event resource. Each remains held because its own `events.get` body was not obtained.

## C. Rejections and holds

Nothing was rejected. A rejection for a missing private marker requires a full event resource that actually lacks `extendedProperties.private.lvptManaged`. That resource was not returned.

All 18 are held because ownership cannot be established. The blocked checks are:

- ETag present
- `lvptManaged` equal to `taskSyncV1`
- `lvptTaskId` equal to the Phase 6 allowlist ID
- that task ID still mapped to the active Command Center task
- the event still on the allowlisted calendar
- status `confirmed`
- transparency explicitly `opaque`
- title, description, start, and end unchanged from the Phase 7A baseline
- no client attendees
- no client-booking indicators

The Command Center spreadsheet was not re-read and was not modified. Task identity for this phase stays the Phase 7A allowlist. A sheet read would not repair the missing Calendar resource.

No production permission was added. The staging project was open in the editor and was not edited, saved, deployed, or run.

## D. Future execution plan

There is no executable allowlist. Zero events passed. The procedure below is recorded so a later phase can use it only after a new read-only `events.get` returns a full resource for that exact event and every check in section B passes. It was not run.

For each event that a future verification marks technically eligible:

1. Operate only on that verified pair. Do not discover or add events.
2. Immediately before any change, call `events.get` again with no field filter.
3. Revalidate `lvptManaged=taskSyncV1`, `lvptTaskId`, status `confirmed`, transparency `opaque`, no client attendees, and the saved title, description, start, and end.
4. Save the complete pre-change response.
5. Send one conditional PATCH with `If-Match` set to the ETag just read and `sendUpdates=none`. The body is only `{"transparency":"transparent"}`.
6. Do not send an unconditional update. Do not delete or recreate the event. Do not change the description, title, schedule, reminders, attendees, or Google Meet data.
7. Save the response and the new ETag.
8. On HTTP 412, a failed revalidation, or any other error, stop that event and do not retry with a broader body.

Rollback, if a later change is made and must be undone, is a new conditional PATCH. Read the event again, confirm the same event ID and task marker, and send only `{"transparency":"opaque"}` with `If-Match` set to the ETag from that new read. Do not replay the saved event record as the update body.

## E. Exclusions and final recommendation

The correction allowlist is the 18 IDs in section B and nothing else. These stay off it:

- Thom Johnston’s additional Sales reminder, `mi358tus1pbj72iu2068db7c88`
- William Traynor’s additional Sales reminder, `b024q97161v3c8oa86qnopl864`
- The 21 legacy HTML owner reminders, including the November 9 NIUM Meet event `gpgtdkh0p7rmik88v479dfhghk`
- Cowbell, `ls1b1f2omslf3m7dhg2bvb2fmo`
- Kristin / Ethan’s 21st, `5t20p2q88fshpbn450bp93q1qo`
- The OWS AWS client session, `jfq4sf39ovdqokb52e4ns9pohg`
- Every secondary calendar copy, including the 17 twins of these tasks
- Any event found after Phase 6

No duplicate was merged. No client booking, legacy reminder, or secondary copy was changed.

**NOT READY — ADDITIONAL VERIFICATION REQUIRED**

Verified: 0. Held: 18. Rejected: 0.

Stop here. A production Calendar change waits for an explicit owner approval after a later read actually returns each ETag and `lvptManaged=taskSyncV1`.
