# Phase 7G — active reminders and recreation safety

Recorded: 2026-11-20, 5:20 PM ET. Read-only. The diagnostic below was not added to Apps Script and was not run. No Calendar write, no production edit, no trigger change, no deployment, and no spreadsheet edit.

The Busy-to-Free plan remains withdrawn. A cancelled event is not recreated by this phase.

## Recommendation

**FURTHER VERIFICATION REQUIRED. Do not patch production yet.**

The dry-run shows current production `runLVPTTaskSync` can insert a new reminder for every one of these 17 tasks. Two cases are certain from the saved source. The other fifteen depend on a description shape that the November 20 connector did not return. The read-only function in section A is the check that resolves them. No production change is requested.

## A. Active reminder verification

On November 20 a connected Calendar read found all 17 historical second copies, each `confirmed` and `transparent` (Free), with the task ID somewhere in the description. That connector does not return an ETag or `extendedProperties.private`. Those reads are not TaskSync ownership.

This session did not call `Calendar.Events.get`. Classifications below use the connector result plus the November 12 production preview, which reported 40 unchanged reminders and zero modifications while both the managed original and the second copy existed. A recognized second copy would have produced `remove_duplicate`. None did.

| Event ID | Calendar | Task ID | November 20 connector | Ownership | Classification |
|---|---|---|---|---|---|
| 7r78utpij6787lifhte6vm17jk | Operations | id-o7d4f2t0-msgkz6li | confirmed, Free | Not read | UNRESOLVED |
| e733somvk0gi7g85lsacpu57eg | Operations | gmail-task-1a102722f4286987-discovery | confirmed, Free | Not read | UNRESOLVED |
| 87lqjhdo5qq4auong34bfp47l8 | Operations | gmail-task-1a06f0295ab4e6bb-groupscope | confirmed, Free | Not read | UNRESOLVED |
| t81hbisjdtcvutkqd5k3re6co8 | Operations | gmail-task-1a0a78195ff7c8a0-kristinvenetian | confirmed, Free | Not read | UNRESOLVED |
| dlsu4h9uct7qbmef54kklm3l68 | Operations | gmail-task-1a0bada019f53ead-elevatedbilling | confirmed, Free | Not read | UNRESOLVED |
| 4ta5rivap92km00nm5sdjtj1bk | Operations | gmail-task-1a08876d1e56e0fd-jeffpayment | confirmed, Free | Not read | UNRESOLVED |
| gpgtdkh0p7rmik88v479dfhghk | Operations | gmail-task-1a158ceb30c849d1-postevent | confirmed, Free | Legacy HTML, not managed | LEGACY ACTIVE REMINDER |
| pmiuo210amsdf98q37fi7qs988 | Proposals | gmail-task-1a01a0153c0414d5-decisionfollowup | confirmed, Free | Not read | UNRESOLVED |
| fs8toes3gp8slclfbc9solti4k | Proposals | gmail-task-1a03b1faffef9dba-bellagioprocess | confirmed, Free | Not read | UNRESOLVED |
| ssiirrmm9lc5hh41t0rbhbc430 | Proposals | gmail-task-1a04fe720da18e40-clientdecision | confirmed, Free | Not read | UNRESOLVED |
| 2o5p51hv3d13tpvu6ui94fg3fs | Proposals | gmail-task-1a059ae0795bc721-clientdecision | confirmed, Free | Not read | UNRESOLVED |
| u3h0gkah40fbpouhf2uecvsrak | Proposals | gmail-task-1a19a95026eded7f-clientdecision | confirmed, Free | Not read | UNRESOLVED |
| dgv3r4smrpu19u2tf87upi1ei8 | Proposals | gmail-task-1a17faf048bae5f1-clientdecision | confirmed, Free | Not read | UNRESOLVED |
| n66sk38bad9532hoe8b0pirj1g | Proposals | gmail-task-1a191299d3c0dd3d-clientdecision | confirmed, Free | Not read | UNRESOLVED |
| 48hbsi4gdbjl0m11hoogm9lla8 | Sales | gmail-task-1a1a7443ca3565f9-discoveryfollowup | confirmed, Free | Not read | UNRESOLVED |
| v9l36pnv1jh96r5b2rcvrreo84 | Confirmed Events | gmail-task-1a1a8b32395152af-vendorquote | confirmed, Free | Not read | ACTIVE BUT NOT RECOGNIZED |
| mafkf4p2e7p2ac0jbgms9tfnrc | Confirmed Events | gmail-task-1a05f0fe9f0a382d-instructor | confirmed, Free | Not read | ACTIVE BUT NOT RECOGNIZED |

`gpgtdkh0p7rmik88v479dfhghk` is the November 9 NIUM HTML reminder. Its description starts with `LVPT INTERNAL OWNER REMINDER`, not `LVPT INTERNAL ACTION REMINDER` or `LVPT INTERNAL ONE-TIME OWNER REMINDER`. A task ID in that description is not the managed marker. Production’s text search can see `LVPT INTERNAL` and then drop the event. It does not count as the existing reminder.

The two Confirmed Events copies are active and Free. Production’s calendar map has no Confirmed Events entry, and canonical IDs are kept only when the calendar is in that three-calendar list. Production cannot recognize them.

The other fourteen are active and Free on a calendar production does scan. Private ownership is unread, so they stay unresolved until the function below runs. The November 12 preview is evidence they were not a second recognized reminder that day.

### Read-only function

Paste this into a new file in LVPT Calendar Preview Staging only. Do not paste it into production. It calls `Calendar.Events.get` seventeen times and one Sheets values read. It does not call TaskSync.

```javascript
function verifyLVPT17ActiveReminders() {
  var SHEET_ID = '1oHoVdD5CDcEreyRnB7cEvYfp6wWEgAmf04BwrktkMYs';
  var MANAGED = 'taskSyncV1';
  var OPS = 'c_a9756e49c39a571a2c21d99524f4c226e1772fca9f0c4156e245d5fd7d941a2a@group.calendar.google.com';
  var SALES = 'c_451b7f3ca8c727da168891a0d1d53475beb13c0c649c6157acdd98959b5cc334@group.calendar.google.com';
  var PROPOSALS = 'c_e68f6233ff8a0e2fb22168ee24da99dc06e0416d652a0e1b964d3a88f5c0935b@group.calendar.google.com';
  var CONFIRMED = 'c_972d7e50b66cba545967cf0f8de32d22990e6e8aa98051bdfa34b9122ed7962c@group.calendar.google.com';
  var PRODUCTION_SCANS = {};
  PRODUCTION_SCANS[OPS] = true;
  PRODUCTION_SCANS[SALES] = true;
  PRODUCTION_SCANS[PROPOSALS] = true;
  var ALLOW = [
    ['7r78utpij6787lifhte6vm17jk', OPS, 'id-o7d4f2t0-msgkz6li', false],
    ['e733somvk0gi7g85lsacpu57eg', OPS, 'gmail-task-1a102722f4286987-discovery', false],
    ['87lqjhdo5qq4auong34bfp47l8', OPS, 'gmail-task-1a06f0295ab4e6bb-groupscope', false],
    ['t81hbisjdtcvutkqd5k3re6co8', OPS, 'gmail-task-1a0a78195ff7c8a0-kristinvenetian', false],
    ['dlsu4h9uct7qbmef54kklm3l68', OPS, 'gmail-task-1a0bada019f53ead-elevatedbilling', false],
    ['4ta5rivap92km00nm5sdjtj1bk', OPS, 'gmail-task-1a08876d1e56e0fd-jeffpayment', false],
    ['gpgtdkh0p7rmik88v479dfhghk', OPS, 'gmail-task-1a158ceb30c849d1-postevent', true],
    ['pmiuo210amsdf98q37fi7qs988', PROPOSALS, 'gmail-task-1a01a0153c0414d5-decisionfollowup', false],
    ['fs8toes3gp8slclfbc9solti4k', PROPOSALS, 'gmail-task-1a03b1faffef9dba-bellagioprocess', false],
    ['ssiirrmm9lc5hh41t0rbhbc430', PROPOSALS, 'gmail-task-1a04fe720da18e40-clientdecision', false],
    ['2o5p51hv3d13tpvu6ui94fg3fs', PROPOSALS, 'gmail-task-1a059ae0795bc721-clientdecision', false],
    ['u3h0gkah40fbpouhf2uecvsrak', PROPOSALS, 'gmail-task-1a19a95026eded7f-clientdecision', false],
    ['dgv3r4smrpu19u2tf87upi1ei8', PROPOSALS, 'gmail-task-1a17faf048bae5f1-clientdecision', false],
    ['n66sk38bad9532hoe8b0pirj1g', PROPOSALS, 'gmail-task-1a191299d3c0dd3d-clientdecision', false],
    ['48hbsi4gdbjl0m11hoogm9lla8', SALES, 'gmail-task-1a1a7443ca3565f9-discoveryfollowup', false],
    ['v9l36pnv1jh96r5b2rcvrreo84', CONFIRMED, 'gmail-task-1a1a8b32395152af-vendorquote', false],
    ['mafkf4p2e7p2ac0jbgms9tfnrc', CONFIRMED, 'gmail-task-1a05f0fe9f0a382d-instructor', false]
  ];

  function authFailure(error) {
    var text = String(error && error.message ? error.message : error);
    return /insufficient permission|authorization|unauthorized|forbidden|permission denied/i.test(text) || /\b(401|403)\b/.test(text);
  }

  function productionView(event, expectedTaskId) {
    if (!event || event.status === 'cancelled' || event.recurringEventId) {
      return { recognized: false, managed: false, reason: 'cancelled, missing, or recurring exception' };
    }
    var description = String(event.description || '').replace(/\s+/g, ' ').trim();
    var ownMarker = /^LVPT INTERNAL (?:ACTION REMINDER|ONE-TIME OWNER REMINDER)/i.test(description);
    var taskMatch = description.match(/\bTask\s+ID:\s*([A-Za-z0-9_.:-]{6,180})/i);
    var taskId = taskMatch && taskMatch[1].replace(/\.$/, '');
    var ownerOnly = !event.attendees || event.attendees.length === 0;
    var summaryOk = /^(?:ACTION|OVERDUE)\s+\u2014\s+/.test(String(event.summary || ''));
    var props = event.extendedProperties && event.extendedProperties.private ? event.extendedProperties.private : {};
    var managed = props.lvptManaged === MANAGED && props.lvptTaskId === expectedTaskId;
    if (!ownMarker || !taskMatch || taskId !== expectedTaskId || !ownerOnly || !summaryOk) {
      return { recognized: false, managed: managed, reason: 'fails the production reminder matcher' };
    }
    if (props.lvptManaged && props.lvptManaged !== MANAGED) {
      return { recognized: false, managed: false, reason: 'unexpected private marker' };
    }
    if (managed && props.lvptTaskId !== taskId) {
      return { recognized: false, managed: false, reason: 'private task ID mismatch' };
    }
    return { recognized: true, managed: managed, reason: managed ? 'managed reminder' : 'manual reminder shape' };
  }

  if (ALLOW.length !== 17) throw new Error('Allowlist length is not 17.');
  if (!Calendar || !Calendar.Events || typeof Calendar.Events.get !== 'function') {
    throw new Error('Calendar advanced service is unavailable.');
  }
  var sheet = Sheets.Spreadsheets.Values.get(SHEET_ID, 'Tasks!A1:J');
  var rows = sheet && sheet.values ? sheet.values : [];
  var headers = (rows[0] || []).map(function (cell) { return String(cell).trim(); });
  var idCol = headers.indexOf('task_id');
  var statusCol = headers.indexOf('status');
  if (idCol < 0 || statusCol < 0) throw new Error('Tasks sheet is missing task_id or status.');
  var tasks = {};
  for (var r = 1; r < rows.length; r++) {
    var id = String(rows[r][idCol] || '').trim();
    if (!id) continue;
    tasks[id] = String(rows[r][statusCol] || '').trim().toLowerCase();
  }

  var totals = { managed: 0, legacy: 0, unrecognized: 0, cancelledOrMissing: 0, unresolved: 0 };
  for (var i = 0; i < ALLOW.length; i++) {
    var eventId = ALLOW[i][0];
    var calendarId = ALLOW[i][1];
    var taskId = ALLOW[i][2];
    var legacyHtml = ALLOW[i][3];
    var row = { eventId: eventId, calendarId: calendarId, taskId: taskId, commandCenterStatus: tasks[taskId] || '' };
    var event;
    try {
      event = Calendar.Events.get(calendarId, eventId);
    } catch (error) {
      if (authFailure(error)) throw new Error('Calendar authorization unavailable. Stopped.');
      row.classification = 'CANCELLED OR MISSING';
      row.reason = String(error && error.message ? error.message : error).slice(0, 180);
      totals.cancelledOrMissing++;
      console.log('LVPT17_EVENT ' + JSON.stringify(row));
      continue;
    }
    var props = event.extendedProperties && event.extendedProperties.private ? event.extendedProperties.private : {};
    var view = productionView(event, taskId);
    var conference = Boolean(event.hangoutLink || (event.conferenceData && (event.conferenceData.conferenceId || (event.conferenceData.entryPoints || []).length)));
    row.etag = typeof event.etag === 'string' ? event.etag : '';
    row.status = event.status || null;
    row.transparency = event.transparency || null;
    row.privateManaged = props.lvptManaged || '';
    row.privateTaskId = props.lvptTaskId || '';
    row.productionScansCalendar = Boolean(PRODUCTION_SCANS[calendarId]);
    row.productionRecognizes = view.recognized && Boolean(PRODUCTION_SCANS[calendarId]);
    row.meet = conference;
    row.attendeeCount = Array.isArray(event.attendees) ? event.attendees.length : 0;
    if (!event || event.status === 'cancelled') {
      row.classification = 'CANCELLED OR MISSING';
      totals.cancelledOrMissing++;
    } else if (!row.etag || !event.status) {
      row.classification = 'UNRESOLVED';
      totals.unresolved++;
    } else if (legacyHtml || (!view.recognized && /OWNER REMINDER/i.test(String(event.description || '')) && !view.managed)) {
      row.classification = 'LEGACY ACTIVE REMINDER';
      totals.legacy++;
    } else if (view.recognized && view.managed && row.productionScansCalendar) {
      row.classification = 'MANAGED ACTIVE REMINDER';
      totals.managed++;
    } else if (!view.recognized || !row.productionScansCalendar) {
      row.classification = 'ACTIVE BUT NOT RECOGNIZED';
      totals.unrecognized++;
    } else {
      row.classification = 'UNRESOLVED';
      totals.unresolved++;
    }
    row.matcher = view.reason;
    console.log('LVPT17_EVENT ' + JSON.stringify(row));
  }
  console.log('LVPT17_SUMMARY ' + JSON.stringify(totals));
  return totals;
}
```

Run only `verifyLVPT17ActiveReminders` in the staging project as `book@pokertraininglasvegas.com`. Accept a prompt only to view calendars and view spreadsheets. Copy every `LVPT17_EVENT` line. Do not deploy or run `runLVPTTaskSync`.

## B. Production dry-run matrix

Source: saved production `apps-script/live/calendar-command-center/TaskSync.js`. This simulation does not call that function. Production drops `status === 'cancelled'`. The original managed copy for each task is cancelled, so it does not fill the reminder slot. An empty slot becomes `create`, which `runLVPTTaskSync` inserts.

November 12, while those originals were still confirmed, the production preview proposed no duplicate removal. The second copies were therefore not recognized as extra reminders that day.

| Task ID | Active copy | Calendar production scans | Recognized today | Dry-run proposal | Duplicate risk | Cancelled original involved |
|---|---|---|---|---|---|---|
| id-o7d4f2t0-msgkz6li | 7r78utpij6787lifhte6vm17jk | Yes, Operations | Not proven | CREATE if the matcher still rejects it | Yes | Yes, qeldb1q51645jklbu85q4e04jk |
| gmail-task-1a102722f4286987-discovery | e733somvk0gi7g85lsacpu57eg | Yes, Operations | Not proven | CREATE if the matcher still rejects it | Yes | Yes, 75ifa5h75j8up225r4k896nsnc |
| gmail-task-1a06f0295ab4e6bb-groupscope | 87lqjhdo5qq4auong34bfp47l8 | Yes, Operations | Not proven | CREATE if the matcher still rejects it | Yes | Yes, jh89up246rkqogdo7vp7qh6lek |
| gmail-task-1a0a78195ff7c8a0-kristinvenetian | t81hbisjdtcvutkqd5k3re6co8 | Yes, Operations | Not proven | CREATE if the matcher still rejects it | Yes | Yes, 4764mu1mon4t9t1054oaarq7do |
| gmail-task-1a0bada019f53ead-elevatedbilling | dlsu4h9uct7qbmef54kklm3l68 | Yes, Operations | Not proven | CREATE if the matcher still rejects it | Yes | Yes, 3etst3v579klkd2hk86backuuk |
| gmail-task-1a08876d1e56e0fd-jeffpayment | 4ta5rivap92km00nm5sdjtj1bk | Yes, Operations | Not proven | CREATE if the matcher still rejects it | Yes | Yes, k1l0o6pkfqosnrfpd23l5q7aek |
| gmail-task-1a158ceb30c849d1-postevent | gpgtdkh0p7rmik88v479dfhghk | Yes, Operations | No. HTML owner-reminder shape | CREATE | Yes. The HTML event would remain | Yes, pprrs36p091auhrmmonjek8lao |
| gmail-task-1a01a0153c0414d5-decisionfollowup | pmiuo210amsdf98q37fi7qs988 | Yes, Proposals | Not proven | CREATE if the matcher still rejects it | Yes | Yes, kuvubcaj89o7u9l5ql5n0jbs50 |
| gmail-task-1a03b1faffef9dba-bellagioprocess | fs8toes3gp8slclfbc9solti4k | Yes, Proposals | Not proven | CREATE if the matcher still rejects it | Yes | Yes, 1bc70raopb4mj9alj1re0ohhl0 |
| gmail-task-1a04fe720da18e40-clientdecision | ssiirrmm9lc5hh41t0rbhbc430 | Yes, Proposals | Not proven | CREATE if the matcher still rejects it | Yes | Yes, urus99830didvj72ep5qdol5d8 |
| gmail-task-1a059ae0795bc721-clientdecision | 2o5p51hv3d13tpvu6ui94fg3fs | Yes, Proposals | Not proven | CREATE if the matcher still rejects it | Yes | Yes, 3th8nnbtdhoj1ed0fsssa8h4v0 |
| gmail-task-1a19a95026eded7f-clientdecision | u3h0gkah40fbpouhf2uecvsrak | Yes, Proposals | Not proven | CREATE if the matcher still rejects it | Yes | Yes, l2q0a40p8lipfk58g81ajhga8c |
| gmail-task-1a17faf048bae5f1-clientdecision | dgv3r4smrpu19u2tf87upi1ei8 | Yes, Proposals | Not proven | CREATE if the matcher still rejects it | Yes | Yes, qno1altoshdauhp1421vqpuifk |
| gmail-task-1a191299d3c0dd3d-clientdecision | n66sk38bad9532hoe8b0pirj1g | Yes, Proposals | Not proven | CREATE if the matcher still rejects it | Yes | Yes, gk9tlvf7pfrhimbed2lk64u148 |
| gmail-task-1a1a7443ca3565f9-discoveryfollowup | 48hbsi4gdbjl0m11hoogm9lla8 | Yes, Sales | Not proven | CREATE if the matcher still rejects it | Yes | Yes, e7dhiv8vcsnfbd1gf2bpnqam3k |
| gmail-task-1a1a8b32395152af-vendorquote | v9l36pnv1jh96r5b2rcvrreo84 | No | No | CREATE | Yes | Yes, gbljhks6kl6sh7krjdm0sj7ses |
| gmail-task-1a05f0fe9f0a382d-instructor | mafkf4p2e7p2ac0jbgms9tfnrc | No | No | CREATE | Yes | Yes, hav83pf1j93ur9dr6l79o7g5f8 |

A task ID in the description is not ownership and is not enough for the matcher. The matcher also requires the action-reminder or one-time-owner prefix, no attendees, and a summary that starts with `ACTION —` or `OVERDUE —`. Managed ownership is only `lvptManaged=taskSyncV1` plus the same `lvptTaskId`.

If the unread fourteen do match that full shape, production would propose NO CHANGE for an unmanaged match, or PATCH / REPLACE for a managed match whose text or due date drifted. The November 12 preview makes that the less likely branch. The diagnostic decides it. Destination calendar for a CREATE comes from `lvptTaskCategory_` on the current task title. That title was not re-read, so the destination is not stated here.

No row is SKIP. SKIP would require a completed, undated, or unrecognized task status. Phase 7E reported these task IDs active. That sheet read was not repeated in this phase.

## C. Confirmed Events coverage gap

Production scans only:

- LVPT | Sales & Follow-Ups
- LVPT | Proposals & Holds
- LVPT | Operations & Payments

`v9l36pnv1jh96r5b2rcvrreo84` and `mafkf4p2e7p2ac0jbgms9tfnrc` are confirmed and Free on Confirmed Events. Production will not list them and will not accept a canonical note that points at that calendar. Their cancelled originals sit on Operations and Sales, which production does scan, and those originals are ignored because they are cancelled. The visible reminder list for those two tasks is empty. The next live run inserts a new reminder on a scanned calendar and leaves the Confirmed Events copy in place.

## D. Cancellation and duplicate prevention

Do not add storage in this phase. The smallest rule that stops the unwanted insert, using data the cancelled events already carry:

1. Before any create, list Sales, Proposals, Operations, and Confirmed Events.
2. If any non-cancelled event on those four calendars is recognized for the task, do not create.
3. If the only managed event for that `lvptTaskId` is cancelled, do not create. Log it for review. A cancelled managed event is not permission to replace it.
4. Unknown cancellation intent stays in review. Do not guess that the owner deleted it, and do not guess that TaskSync did.
5. An explicit recreation is a separate owner-approved action for one task ID. It is not part of the hourly run.
6. Keep the existing script lock so two runs cannot insert together. A retry must see the reminder created by the first attempt and then take the no-create path.
7. Do not change the Tasks row. Do not patch client bookings, events with outside attendees, or unmanaged Confirmed Events entries.
8. Do not start a second hourly sync.

That rule survives later hourly runs only while Google still returns the cancelled event and its private task ID. The Calendar API does not promise to keep deleted events forever. A durable tombstone, such as a sheet tab written only after owner approval, is a later stage and is not authorized now.

Stage A is the diagnostic and this dry-run. Stage B is an owner-approved edit of the existing `runLVPTTaskSync` path, with the create guard above, previewed before any live run. It was not written into the production file.

## E. Trigger risk

The saved production project is documented to have an hourly trigger on `runLVPTTaskSync`. Matthew’s November 12 preview did not add, remove, or edit that trigger, and it reported zero writes. This session did not list triggers and did not read execution logs after November 12. The clasp credential still cannot do that without a new sign-in, and no sign-in was started.

If that hourly trigger is still installed, it can insert the creates in section B before a fix is saved. That is an immediate operational risk. Whether it has already inserted new reminders since the originals were cancelled is not in the available logs.

Owner-only pause, not performed here: open the production Calendar Command Center trigger list, suspend only the hourly `runLVPTTaskSync` trigger, and leave every other trigger and the script body unchanged. Re-enable it only after a reviewed fix. Do not delete the project or add a trigger.

## F. Safe sequence

1. Run `verifyLVPT17ActiveReminders` in staging and keep the log.
2. Optionally suspend only the hourly production trigger, by the owner, if that log is not back before the next hour.
3. For each task the log marks unrecognized, or for the two Confirmed Events copies, treat CREATE as the live proposal.
4. Prepare a production patch only after that log is in hand. The patch adds the four-calendar check and the do-not-create rule for a cancelled managed task ID. It does not restore the 17 cancelled events, edit the 17 active copies, or change Joyce Chang’s reminder.
5. Preview the patched function. Confirm the seventeen tasks produce no CREATE. Then stop for a separate approval before any live run.

## G. Final recommendation

**FURTHER VERIFICATION REQUIRED.**

The dry-run already shows unwanted CREATE for the NIUM HTML reminder and for both Confirmed Events reminders, with the cancelled originals ignored. The other fourteen are the same pattern if their matcher result is unchanged since November 12. Private ownership of those fourteen is still unread, so a production patch is not ready to apply. Run the staging diagnostic. Do not run production TaskSync.
