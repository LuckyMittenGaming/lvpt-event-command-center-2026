# Phase 7H — production correction review

Recorded: 2026-11-21. The hourly production trigger is off and must stay off. No production edit, no deployment, no Calendar write, and no Command Center edit were made.

The November 21 staging preview is the source of the counts below. `previewLVPTTaskSync` returned `calendarWrites: 0`. This phase did not run it again.

## Recommendation

**STOP. The diagnostic has not been run. `TaskSync.safe-review.js` is not approved for production.**

Do not install the trigger, do not paste either local file into the production project, and do not apply the 37 patches. The corrected diagnostic is ready to paste into staging only. The decision-core corrections are local and were tested with synthetic events. They were not executed against Google.

## 1. Why the duplicates exist

Two mechanisms stacked.

Production `runLVPTTaskSync` scans three calendars and drops `status === 'cancelled'`. When the managed copy is cancelled and the surviving copy is not recognized, the task looks empty and the live function inserts a new reminder. Legacy HTML reminders fail that recognition test because they do not start with `LVPT INTERNAL ACTION REMINDER` or `LVPT INTERNAL ONE-TIME OWNER REMINDER`. Copies on Confirmed Events are invisible because that calendar is not in the production map.

Staging already scans four calendars, does not delete an unmanaged legacy copy, and does not create when a managed reminder is still present. That is why the November 21 preview shows `create: 0` and `removeDuplicate: 0`. The remaining staging action is `patchManaged: 37`, which is a different operation from the recreation bug.

## 2. The 37 patch proposals

`patchManaged` is emitted only from this branch in `apps-script/staging-calendar-preview/TaskSync.js`:

- the preferred reminder is managed
- it is already on the planner’s target calendar
- its stored due date matches the task due date
- `lvptManagedDrift_` returns at least one reason

`lvptManagedDrift_` can return only these reasons:

| Reason | Condition |
|---|---|
| summary | Event title differs from the title generated from the current task row |
| description | Event description differs from the generated internal-reminder text |
| reminders | Popup reminders differ from the generated set |
| transparency | Value is anything other than the explicit string `transparent`, including omitted |
| duration | Start/end is missing, zero, or longer than 15 minutes |

No other property produces `patchManaged`. Attendees, client bookings, and conference data do not. Conference data is a separate `clearConference` change, and that count was 0. Status is not compared.

The arithmetic is 52 dated active tasks, 15 unchanged, 37 patches, and 0 creates. Every dated active task already had one preferred managed reminder. Fifteen already matched all five checks. Thirty-seven failed at least one. The 17 Busy managed reminders are enough to fail the transparency check, so they sit inside the 37 if they are the preferred managed event. The log does not say whether the other patches are title, description, reminders, duration, or transparency on a different task. Omitted transparency is Busy by the Calendar API default, so it fails the same check as explicit `opaque`.

When any reason is present, `lvptPatchFields_` still sends summary, description, reminders, private metadata, `transparency: transparent`, and an empty recurrence list. Start and end are added only when duration is one of the reasons. A transparency-only reason means the title and description already matched, and those fields would be written back unchanged. A summary or description reason would change that text. The per-event reason list is the only way to tell those apart.

Legacy Free reminders without `lvptManaged` are not patch targets. `removeDuplicate: 0` matches that: an unmanaged extra is preserved, not deleted.

### Read-only diagnostic

The first draft of this function did not match the installed preview. It dropped text-search hits that the managed query had already returned, and it never loaded `canonical_calendar_id` / `canonical_event_id` references from Tasks notes. It also continued when a Tasks column was missing. Those differences could change the patch count without any Calendar change.

The corrected function follows `lvptSyncTasks_` in `apps-script/staging-calendar-preview/TaskSync.js`:

- It resolves all four named calendars and stops if any name is not exactly one owned calendar.
- It reads the current Tasks and Events sheets and stops if a required column is missing.
- It lists `privateExtendedProperty=lvptManaged=taskSyncV1` on each calendar.
- It lists `q=LVPT INTERNAL` on each calendar and keeps those hits even when the managed query already returned the same event. The installed planner then keeps the managed-query copy.
- It loads canonical note references with `Calendar.Events.get`, skips a 404, and skips a cancelled reference, matching the preview.
- It passes that list to the installed `lvptPlanTaskCalendarSync_`. This function does not replace that planner.
- It then calls `previewLVPTTaskSync()` and compares the two patch counts with the November 21 baseline of 37. It does not add or drop rows to force 37.

`byReason` counts patches that include each reason. A patch with two reasons increments both, so the reason totals can exceed the patch count. Descriptions, titles, notes, and attendee addresses are not logged.

The same function is stored at `apps-script/calendar-command-center/reportLVPTManagedPatchDetails.js`. That folder has no clasp project. It was syntax-checked and was not executed.

```javascript
function reportLVPTManagedPatchDetails() {
  if (typeof lvptPlanTaskCalendarSync_ !== 'function' || typeof previewLVPTTaskSync !== 'function') {
    throw new Error('Installed staging preview is not loaded. No write was attempted.');
  }
  var cfg = LVPT_SYNC_CONFIG;
  var account = String(CalendarApp.getDefaultCalendar().getId()).toLowerCase();
  if (account !== cfg.ownerEmail) throw new Error('Wrong account: ' + account);
  var calendars = {};
  var category;
  for (category in cfg.calendarNames) {
    if (!Object.prototype.hasOwnProperty.call(cfg.calendarNames, category)) continue;
    var owned = CalendarApp.getOwnedCalendarsByName(cfg.calendarNames[category]);
    if (owned.length !== 1) throw new Error('Expected one owned calendar: ' + cfg.calendarNames[category]);
    calendars[category] = owned[0].getId();
  }
  var values = lvptStagingReadSheet_(cfg.spreadsheetId, 'Tasks', 10);
  var eventRows = lvptStagingReadSheet_(cfg.spreadsheetId, 'Events', 3);
  if (!values || !eventRows || values.length < 2) {
    throw new Error('Tasks or Events spreadsheet data is unavailable.');
  }
  var headers = values.shift().map(function (cell) { return String(cell).trim(); });
  var columns = {};
  ['task_id', 'event_id', 'task', 'due_date', 'priority', 'status', 'notes'].forEach(function (key) {
    var index = headers.indexOf(key);
    if (index < 0) throw new Error('Missing Tasks column: ' + key);
    columns[key] = index;
  });
  var companies = {};
  eventRows.slice(1).forEach(function (row) {
    if (row[0]) companies[row[0]] = row[2] || row[1] || row[0];
  });
  var taskRows = values.map(function (row) {
    return {
      task_id: row[columns.task_id], event_id: row[columns.event_id], task: row[columns.task],
      due_date: row[columns.due_date], priority: row[columns.priority], status: row[columns.status],
      notes: row[columns.notes]
    };
  });
  var scanIds = ['sales', 'proposals', 'operations', 'confirmed'].map(function (key) {
    return calendars[key];
  });
  var listed = [];
  var seen = {};
  var inventory = { managedQuery: 0, textSearch: 0, textSearchAlreadySeen: 0, canonicalAdded: 0, canonicalNotFound: 0 };
  scanIds.forEach(function (calendarId) {
    lvptListCalendarEvents_(calendarId, { privateExtendedProperty: 'lvptManaged=' + cfg.managedTag })
      .forEach(function (ev) {
        listed.push({ calendarId: calendarId, event: ev, fromManagedQuery: true });
        seen[calendarId + '::' + ev.id] = true;
        inventory.managedQuery++;
      });
    lvptListCalendarEvents_(calendarId, { q: 'LVPT INTERNAL' }).forEach(function (ev) {
      var key = calendarId + '::' + ev.id;
      if (seen[key]) inventory.textSearchAlreadySeen++;
      listed.push({ calendarId: calendarId, event: ev, fromManagedQuery: false });
      seen[key] = true;
      inventory.textSearch++;
    });
  });
  taskRows.forEach(function (row) {
    lvptCanonicalReferences_(row.notes, scanIds).forEach(function (ref) {
      var key = ref.calendarId + '::' + ref.eventId;
      if (seen[key]) return;
      var ev;
      try { ev = Calendar.Events.get(ref.calendarId, ref.eventId); }
      catch (error) {
        if (/\b(?:404|not found)\b/i.test(String(error))) {
          inventory.canonicalNotFound++;
          return;
        }
        throw new Error('Calendar lookup failed for ' + row.task_id + ': ' + error);
      }
      if (ev && ev.status !== 'cancelled') {
        listed.push({ calendarId: ref.calendarId, event: ev, fromManagedQuery: false });
        seen[key] = true;
        inventory.canonicalAdded++;
      }
    });
  });

  var plan = lvptPlanTaskCalendarSync_({
    now: new Date(),
    cfg: cfg,
    calendarIds: calendars,
    companies: companies,
    taskRows: taskRows,
    events: listed
  });
  if (!plan.ok) throw new Error(plan.error || 'Plan failed. No write was attempted.');

  var rows = [];
  var byReason = {};
  (plan.changes || []).forEach(function (change) {
    if (change.kind !== 'patch_managed') return;
    var event = change.prior && change.prior.event || {};
    var props = ((event.extendedProperties || {}).private || {});
    var reasons = (change.reasons || []).slice();
    reasons.forEach(function (reason) {
      byReason[reason] = (byReason[reason] || 0) + 1;
    });
    rows.push({
      eventId: event.id || '',
      calendarId: change.prior.calendarId,
      taskId: change.id,
      status: event.status == null || event.status === '' ? null : event.status,
      transparency: event.transparency == null || event.transparency === '' ? null : event.transparency,
      etag: typeof event.etag === 'string' ? event.etag : '',
      privateManaged: props.lvptManaged || '',
      privateTaskId: props.lvptTaskId || '',
      taskSyncOwned: props.lvptManaged === cfg.managedTag && props.lvptTaskId === change.id,
      reasons: reasons,
      fieldNames: change.fields ? Object.keys(change.fields) : [],
      durationMinutes: lvptDurationMinutes_(event),
      externalAttendees: lvptExternalAttendees_(event, cfg.ownerEmail).length,
      conference: lvptHasConference_(event)
    });
  });

  var preview = previewLVPTTaskSync();
  var previewPatches = preview && preview.counts ? preview.counts.patchManaged : null;
  var baseline = 37;
  var comparison = {
    baselinePatchManaged: baseline,
    diagnosticPatchManaged: rows.length,
    previewPatchManaged: previewPatches,
    adjustedToBaseline: false,
    inventory: inventory,
    listedEvents: listed.length,
    plannerCounts: plan.counts,
    datedActiveTasks: plan.datedActiveTasks,
    unchanged: plan.unchanged,
    totalTaskRows: plan.totalTaskRows
  };
  if (previewPatches !== rows.length) {
    comparison.inventoryMismatch = true;
    comparison.cause = 'The diagnostic count and previewLVPTTaskSync disagree. That is an inventory mismatch. The count was not changed to 37.';
  } else if (rows.length !== baseline) {
    comparison.inventoryMismatch = false;
    comparison.cause = 'The diagnostic and previewLVPTTaskSync agree, and both differ from 37. Discovery is not the mismatch. The calendars or Tasks sheet changed after the November 21 preview, or the installed planner is no longer the planner that produced 37.';
  } else {
    comparison.inventoryMismatch = false;
    comparison.cause = 'The diagnostic, previewLVPTTaskSync, and the November 21 baseline all report 37 patch_managed proposals.';
  }

  console.log('LVPT_PATCH_SUMMARY ' + JSON.stringify({
    count: rows.length,
    byReason: byReason,
    comparison: comparison,
    calendarWrites: 0
  }));
  rows.forEach(function (row) { console.log('LVPT_PATCH ' + JSON.stringify(row)); });
  return { count: rows.length, byReason: byReason, comparison: comparison, calendarWrites: 0 };
}
```

How to read the result:

- `comparison.inventoryMismatch === true` means this function and the installed preview disagreed. That is an inventory bug. The count is the raw count.
- `inventoryMismatch === false` and `diagnosticPatchManaged !== 37` means both reads agree and the November 21 count is stale. The calendars or the Tasks sheet changed, or the installed planner is no longer the reviewed staging file.
- `diagnosticPatchManaged === 37` means the new read still matches the baseline. The `LVPT_PATCH` lines are then the missing per-event reasons.
- `adjustedToBaseline` is always false.

## 3. Staging versus production

| Behavior | Production `live/calendar-command-center/TaskSync.js` | Staging `staging-calendar-preview/TaskSync.js` |
|---|---|---|
| Calendars | Sales, Proposals, Operations | Those three plus Confirmed Events |
| Managed recognition | `lvptManaged=taskSyncV1` and matching `lvptTaskId`, plus the action-reminder text shape | Same private marker, and the title must also match `ACTION —` or `OVERDUE —` |
| Legacy reminders | Not collected unless they match the action-reminder shape. A second collected reminder is deleted | Unmanaged reminders are preserved. They are not patched |
| Cancelled managed events | Dropped. An empty list becomes create | Same drop. Create is suppressed only when another collected reminder or a protected Confirmed Events entry remains |
| Create | Inserts on a live run when no collected reminder remains | Preview only. The write function throws. November 21 proposed 0 creates |
| Patch and replace | Live run patches summary, description, reminders, and private metadata when text or due date drifts. It does not set transparency | Preview proposes `patchManaged` for text, reminders, transparency, and duration. Replace moves calendar or due date |
| Duplicates | Deletes every collected reminder after the first, managed or not | Deletes only when both copies are managed |
| New reminder shape | 15 minutes, no recurrence, no attendees, no Meet. Transparency is not set, so the API default is Busy | 15 minutes, explicit Free, no recurrence, no attendees, no Meet |
| Client bookings | Events with attendees or without the internal marker are not collected | Attended events and unmanaged Confirmed Events entries are protected |
| Meet | Not cleared. Patch does not send conference data | `clearConference` is counted and was 0. `conferenceRestClear` stays false, and staging does not send a Meet removal |
| Trigger and auth | `runLVPTTaskSync` writes. The hourly trigger was deleted on November 21 and now shows zero triggers | `runLVPTTaskSync` throws. Scopes stay spreadsheet read and calendar read |

The November 21 result describes staging, not production. Production would still treat a cancelled managed event with no recognized survivor as a create.

## 4. Candidate safety findings

`apps-script/calendar-command-center/TaskSync.safe-review.js` is still not approved and is not connected to a Calendar write. The first version could approve a create when cancelled history had not been read, because the ordinary calendar list uses `showDeleted: false`. It also kept the safe creates in a batch after dropping an unsafe one. Those two gaps are corrected in the local file. The corrections were not deployed.

| Requirement | Local correction |
|---|---|
| Cancelled history | `lvptCancellationHistoryQuery_` names the read: `showDeleted: true`, the managed private property, all four calendars. The file does not perform the read. |
| Fail closed | A missing scan, a scan error, or any of the four calendar IDs absent returns `ok: false` and zero writes. |
| Calendar IDs | A create is allowed only onto the sales, proposals, or operations ID supplied for that run. Confirmed Events and any other ID are refused. |
| Task ID and due date | The task ID must match the existing safe pattern. A create also requires a real `YYYY-MM-DD` due date. An existing managed reminder still blocks create when the due date is missing. |
| Duration and time | The start must be a finite timestamp. The body is 15 minutes in `America/New_York`. Any other duration, zone, recurrence, attendee list, or conference field fails the gate. |
| Duplicates | Active events and history events are deduped by calendar ID plus event ID before counting. Two managed reminders stop for review. The same event listed twice counts once. |
| Client bookings | An attended event that carries the task ID blocks create and is not modified. An attended event with no task ID is left out of the write list. An empty attendee email counts as external. |
| Lock and idempotency | Without `lockHeld`, proposed creates move to `blockedWrites` and the gate returns nothing. A second plan that sees the created managed event does not create again. The file does not call `LockService`. The future caller would use the existing script lock. That is not a new scope, and it is not installed. |
| Legacy reminders | A legacy reminder is never a write target. Owner approval to recreate a cancelled reminder does not create a second copy while the legacy reminder is active. |
| Owner approval | Recreation requires `ownerApprovedRecreation === true` and a non-empty `recreationApprovalId`, after a complete history read, with no active managed or legacy reminder. The flag does not bypass a failed history read. |
| Unsafe filter | If any proposed create fails a check, or two creates share a task ID, the gate returns an empty allowed list. It does not keep the other rows. |

No tombstone sheet, script property, or OAuth scope was added. A durable record of cancelled events still needs a separate owner approval, because a successful `showDeleted` read only lasts as long as Google returns the event. That limit is unchanged.

## 5. Proposed diff

Production creates when its three-calendar reminder list is empty and deletes the rest of that list. The local candidate replaces that decision with `lvptPlanSafeReminderActions_` and `lvptGateSafeWrites_`. Review rows are not writes. The candidate file contains no Calendar call. Pasting it into production is not authorized.

## 6. Tests that were run

`node tests/calendar-safe-review.test.cjs` passed 30 synthetic cases. `node --check` passed for the decision file and the diagnostic file. No test called Google. The November 21 count of 37 was not reproduced, because those live events are not in the fixture.

The 30 cases cover: an existing managed reminder, a legacy reminder beside it, a cancelled managed reminder, a Confirmed Events reminder, duplicate managed reminders, one new Free 15-minute create, a completed task, an unrelated client booking, an attended event tied to the task, a failed calendar scan, a missing cancellation scan, a partial cancellation scan, a second pass, a stale task, the same event listed twice, owner-approved recreation, approval without an ID, approval during a failed history read, approval while a legacy reminder exists, an unknown calendar, Confirmed Events as a target, an unsafe task ID, a missing due date, an impossible due date, an invalid start, a non-Eastern timezone, a missing lock, a mixed safe and unsafe batch, a recurring body, and two creates for one task.

## 7. Diagnostic instructions

Do not run this until you intend to. It has not been run.

1. Stay signed in as `book@pokertraininglasvegas.com`.
2. Open only LVPT Calendar Preview Staging. Do not open the production project and do not change `appsscript.json`.
3. Paste `reportLVPTManagedPatchDetails` from the code block above into a staging file. Leave the existing preview functions in place.
4. Run `reportLVPTManagedPatchDetails`. Do not run `runLVPTTaskSync`.
5. The function also calls `previewLVPTTaskSync()`. That call is read-only. Its `WOULD` lines are the installed preview log. The per-event rows are the `LVPT_PATCH` lines, and the comparison is the `LVPT_PATCH_SUMMARY` line.
6. Send back the summary line and the patch lines. If the count is not 37, use `comparison.cause` instead of treating the difference as a mistake to be corrected in the report.

## 8. Rollback

Nothing in this phase was saved to production, so there is nothing to roll back there. The trigger is already absent. If a later edit replaces production `TaskSync.gs`, restore the current live file `apps-script/live/calendar-command-center/TaskSync.js` and leave Triggers empty until a separate approval. Restoring that file brings back the create-after-cancel path, which is why the trigger stays off.

## 9. Hourly trigger

Do not recreate it now.

The deleted trigger was a time-driven hourly call to `runLVPTTaskSync` in the production Calendar Command Center. Recreating it later means: open that project’s Triggers page, add one hourly trigger for `runLVPTTaskSync`, and add no other trigger. Do that only after the safe candidate is the saved head and a preview shows no unwanted creates. Production Triggers currently shows zero triggers. Leave it that way.

## 10. Remaining risk

The 37 field-level reasons are still unknown. The corrected diagnostic has not been run, so this review does not claim that the count is still 37 or name which reason applies to which event. Saving the current staging planner into production would turn those proposals into writes, including title and description changes wherever those reasons are present. The local candidate does not apply them.

The cancelled-event guard lasts only while Google returns the cancelled event and its private task ID. A durable tombstone was not added. Owner approval for recreation exists only in the local candidate, and that file is not in production.

November 21 staging showed no create and no duplicate deletion. Production, if the trigger were turned back on against the current live file, would not have that four-calendar behavior. The trigger remains off, and no production change is authorized.
