# Phase 7I — final reminder reconciliation

Recorded: 2026-11-21, after the 8:46 PM staging preview, then updated with `LVPT_Phase7I_Verified_Event_Handoff.json`. The hourly production trigger is still deleted. No production edit, no Calendar write, no Command Center edit, no scope change, and no deployment were made.

## Recommendation

**STOP. Do not recreate the 19 reminders and do not apply the 18 transparency corrections.**

The 8:46 PM preview and the patch diagnostic agree: 19 `CREATE`, 18 `PATCH_MANAGED`, 15 unchanged, and 0 writes. `19 + 18 + 15 = 52`, the same dated-active count as the earlier November 21 preview. That earlier preview was 37 patches and 15 unchanged. Nineteen tasks moved from patch to create. Seventeen of them are the managed duplicates the authorized read found cancelled. The other two are named below. The local candidate blocks all 19. It was not saved to production.

## The 19 proposed creates

Staging proposes a create when it no longer sees an active managed reminder. It drops cancelled events, and it does not treat an HTML `LVPT INTERNAL OWNER REMINDER` as the existing reminder. A surviving legacy copy therefore does not stop the create.

| Group | Tasks | What the authorized read established | Candidate result |
|---|---|---|---|
| Known managed duplicates | 17 task IDs below | The active managed copy is `cancelled`. The paired legacy reminder is `confirmed` and Free | No create. Legacy event is not modified |
| Located legacy reminders | `gmail-task-1a1564e8e21a05f3-production`, `gmail-task-1a189f1dffa1d00f-production` | Confirmed Free reminders `kg49e1cfu2o9rvtkbq0l3erdeg` and `d0679uii6sfi6ig6metb4u21vc`. Text is not TaskSync ownership | No create and no modification |

The 17 task IDs are the original managed set except Joyce Chang’s Venetian task, which was not part of this cancellation report:

- `id-o7d4f2t0-msgkz6li`
- `gmail-task-1a01a0153c0414d5-decisionfollowup`
- `gmail-task-1a03b1faffef9dba-bellagioprocess`
- `gmail-task-1a04fe720da18e40-clientdecision`
- `gmail-task-1a059ae0795bc721-clientdecision`
- `gmail-task-1a06f0295ab4e6bb-groupscope`
- `gmail-task-1a0a78195ff7c8a0-kristinvenetian`
- `gmail-task-1a102722f4286987-discovery`
- `gmail-task-1a19a95026eded7f-clientdecision`
- `gmail-task-1a1a7443ca3565f9-discoveryfollowup`
- `gmail-task-1a1a8b32395152af-vendorquote`
- `gmail-task-1a05f0fe9f0a382d-instructor`
- `gmail-task-1a0bada019f53ead-elevatedbilling`
- `gmail-task-1a08876d1e56e0fd-jeffpayment`
- `gmail-task-1a158ceb30c849d1-postevent`
- `gmail-task-1a17faf048bae5f1-clientdecision`
- `gmail-task-1a191299d3c0dd3d-clientdecision`

## The 17 legacy reminders

The authorized read says each paired legacy reminder is still `confirmed` and Free. The November 12 audit already classed that shape as an HTML owner reminder: 15 minutes, Free, with a Meet link, and outside the managed patch list. The candidate recognizes `Task ID:` and `task_id:`, including a line break between `gmail-` and `task-`. `INTERNAL OWNER REMINDER` counts with or without the `LVPT` prefix. That match blocks a new reminder. It is not the private `lvptManaged` marker, so it never authorizes a patch, replace, or delete. A self or business-account attendee stays on the event. An unknown or external attendee makes the event protected.

No actor is known for the managed cancellations. The read established the status value `cancelled`. It did not establish who cancelled the events or why. The earlier original managed copies for these same tasks were already cancelled. This phase does not restore either generation.

## The two located reminders

Neither reminder is recreated, and neither event is modified. The connected Calendar read located the legacy copies. A description match is not TaskSync ownership.

### CertaPro PowerPoint template

`kg49e1cfu2o9rvtkbq0l3erdeg` on Operations & Payments, task `gmail-task-1a1564e8e21a05f3-production`. Status `confirmed`, transparency Free. The description begins `INTERNAL OWNER REMINDER` and does not begin with `LVPT`. The task ID is split across a line as `gmail-` and then `task-...`. The business account is an attendee. That attendee is the owner account, so it does not make the event a client booking. This is not the CertaPro workbook task `gmail-task-1a102722f4286987-discovery`.

### Cowbell room and felt layout

`d0679uii6sfi6ig6metb4u21vc` on Confirmed Events, task `gmail-task-1a189f1dffa1d00f-production`. Status `confirmed`, transparency Free. The description begins `LVPT INTERNAL OWNER REMINDER`, and the task ID is split the same way. This is not the Cowbell client booking `ls1b1f2omslf3m7dhg2bvb2fmo`.

Both event IDs are in `knownLegacyReminders`. Both task IDs also remain on `unresolvedTaskIds`, so a scan that does not return the event still cannot create. Owner approval to recreate a cancelled reminder does not clear that hold. The earlier managed copies that made these two part of the 37 patches were not in the cancellation report, so those managed event IDs remain unknown.

## Local candidate

`apps-script/calendar-command-center/TaskSync.safe-review.js` is still not approved and was not deployed. Relative to the Phase 7H file, it now:

1. Still requires all four calendar IDs before any plan can succeed.
2. Treats a line-wrapped `gmail-` / `task-` ID, with or without the `LVPT` prefix, as a legacy reminder when the description is an internal owner reminder. The two located event IDs are recognized directly.
3. Leaves that legacy event out of every write. A self or business-account attendee is kept. An unknown or external attendee is protected.
4. Refuses a create when a cancelled managed event is in the history read.
5. Accepts an in-memory `ownerTombstones` list as an owner-supplied block. Nothing is written to a sheet, script property, or other store. A durable tombstone still needs a separate approval.
6. Returns zero writes when the cancellation read is missing, partial, or in error.
7. Dedupes by calendar ID plus event ID, and stops when two active managed reminders share a task.
8. Does not modify an attended event. A task ID on an attended event blocks a new reminder for that task.
9. Requires `ownerApprovedRecreation` and a non-empty approval ID before a cancelled or tombstoned task can create. The two unresolved IDs stay blocked anyway.
10. Adds no OAuth scope. The history query remains `showDeleted: true` with the existing managed private property. The file does not perform that read.

The gate still rejects the whole batch if any one create is unsafe. An unresolved task ID in a write list also clears the allowed list.

## Tests and limits

`node tests/calendar-safe-review.test.cjs` passed 38 synthetic cases. No case called Google. The 8:46 preview was not run again.

The dry-run of all 19 tasks allowed 0 creates. The plan’s write list was empty, so it also contained no delete, replace, or patch. A separate case used the two verified descriptions, including `gmail-\ntask-...` with and without `LVPT`, the CertaPro self attendee, and the two event IDs. That case also produced no write. The 17 cancelled-event IDs in the broader dry-run are decision stand-ins, not a claim that those fixture IDs were re-read tonight.

Limits that remain:

- A successful `showDeleted` read is not permanent. If Google drops a cancelled event and the owner has not supplied a tombstone, that task is no longer blocked by cancellation history.
- The in-memory tombstone lasts for one call. It is not a database.
- The two unresolved holds are explicit IDs. Removing them before a fresh event read would let the other rules decide.
- Production `runLVPTTaskSync` does not contain this candidate. With the trigger off it does not run. Turning the trigger on against the current live file would again use the three-calendar create path.

## Transparency-only plan

The handoff JSON identifies 18 managed reminders whose only recorded drift was `transparency`. Joyce Chang’s event `bq7th2lis1p5dq0n9vv5hqmtok` is one of them. The other 17 are a different set from the November 12 originals. Those historical ETags are audit values. The test loaded all 18 and produced 0 eligible writes. None of the historical ETags was copied into an `If-Match` header.

A future authorized correction, after a fresh `Calendar.Events.get` for each row, may send only this call:

```javascript
Calendar.Events.patch(
  { transparency: 'transparent' },
  calendarId,
  eventId,
  { sendUpdates: 'none' },
  { 'If-Match': freshEtag }
);
```

That shape follows the advanced-service signature: body, calendar ID, event ID, optional query arguments, then HTTP headers. Google’s Calendar advanced-service guide shows the same five-argument form with `If-Match` on `Calendar.Events.update`. The header slot applies to `patch` as well. Production already calls `Calendar.Events.patch` with `{sendUpdates:'none'}` and no pinned `oauthScopes` in `apps-script/live/calendar-command-center/appsscript.json`. Adding the header uses that same Calendar service. It does not need `UrlFetchApp` or the external-request scope.

The fresh read has to show the same event ID and calendar ID, `lvptManaged` of `taskSyncV1`, the same task ID, status `confirmed`, Busy transparency (`opaque` or omitted), no external attendee, a 15-minute duration, and no conference data. Omitted transparency is Busy. The historical ETag is not reused. Google’s sample says a mismatched `If-Match` throws and describes that failure as precondition failed. On that exception, or any other API error, stop that event. Do not retry without the header and do not send a full event resource.

`lvptPlanTransparencyCorrection_` builds that request only when `etagSource` is `fresh-get`. It still returns `executable: false` and `writes: 0`. This design was not executed.

Before any approved run, take the script lock, re-read inside the lock, and record the before and after event ID, calendar ID, task ID, ETag, status, and transparency. The lock stops a second script run. `If-Match` stops the patch when the event changed after the read.

## Rollback and the hourly trigger

Nothing in this phase reached production or Calendar, so there is no change to roll back. The trigger stays empty.

If a later approved transparency patch is applied, its rollback is a separate conditional patch of `{ "transparency": "opaque" }` on the same event, using the ETag returned by that patch as `If-Match`. Do not delete the event and do not restore a saved copy over it. Do not do that now.

Do not recreate the hourly trigger. It was a time-driven call to `runLVPTTaskSync` in the production Calendar Command Center. Recreating it means adding that one hourly trigger only after a reviewed candidate is the saved head and a preview shows no unwanted creates. Production Triggers shows zero triggers. Leave it that way.
