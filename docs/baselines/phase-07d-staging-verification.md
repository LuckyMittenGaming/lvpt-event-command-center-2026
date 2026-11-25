# Phase 7D — read-only staging diagnostic for the 18 candidates

Recorded: 2026-11-20, 4:40 PM ET. Prepared only. The function was not added to Apps Script, not run, and not deployed. No Calendar write, no production edit, no manifest change, no scope change, and no clasp command.

All 18 events remain **HELD — INCOMPLETE VERIFICATION** until the owner runs this diagnostic and sends back the execution log. This document is not a verification result.

Technical eligibility, if a later run reports it, is still not owner authorization to change a calendar.

## 1. Diagnostic function

Paste the following into a new file in the existing staging project. Do not paste it into `TaskSync.gs` and do not paste it into the production project.

The function is self-contained. It does not call `previewLVPTTaskSync`, `runLVPTTaskSync`, or any other TaskSync function.

```javascript
/**
 * One-time read-only check of the Phase 7A 18-event allowlist.
 * Calls Calendar.Events.get and one Sheets values read. No writes.
 * Do not add scopes, triggers, or deployments.
 */
function verifyLVPT18CalendarMetadata() {
  var OWNER = 'book@pokertraininglasvegas.com';
  var SHEET_ID = '1oHoVdD5CDcEreyRnB7cEvYfp6wWEgAmf04BwrktkMYs';
  var MANAGED = 'taskSyncV1';
  var OPS = 'c_a9756e49c39a571a2c21d99524f4c226e1772fca9f0c4156e245d5fd7d941a2a@group.calendar.google.com';
  var SALES = 'c_451b7f3ca8c727da168891a0d1d53475beb13c0c649c6157acdd98959b5cc334@group.calendar.google.com';
  var PROPOSALS = 'c_e68f6233ff8a0e2fb22168ee24da99dc06e0416d652a0e1b964d3a88f5c0935b@group.calendar.google.com';
  var NOV12_START = Date.parse('2026-11-12T14:00:00Z');
  var NOV12_END = Date.parse('2026-11-12T14:15:00Z');
  var NOV13_START = Date.parse('2026-11-13T14:00:00Z');
  var NOV13_END = Date.parse('2026-11-13T14:15:00Z');
  var ACTIVE = { open: 1, 'in progress': 1, waiting: 1, blocked: 1, pending: 1, 'on hold': 1 };
  var COMPLETE = { complete: 1, completed: 1, resolved: 1, done: 1 };
  var ALLOW = [
    ['qeldb1q51645jklbu85q4e04jk', OPS, 'id-o7d4f2t0-msgkz6li', NOV12_START, NOV12_END],
    ['kuvubcaj89o7u9l5ql5n0jbs50', OPS, 'gmail-task-1a01a0153c0414d5-decisionfollowup', NOV12_START, NOV12_END],
    ['1bc70raopb4mj9alj1re0ohhl0', OPS, 'gmail-task-1a03b1faffef9dba-bellagioprocess', NOV12_START, NOV12_END],
    ['urus99830didvj72ep5qdol5d8', OPS, 'gmail-task-1a04fe720da18e40-clientdecision', NOV12_START, NOV12_END],
    ['3th8nnbtdhoj1ed0fsssa8h4v0', OPS, 'gmail-task-1a059ae0795bc721-clientdecision', NOV12_START, NOV12_END],
    ['jh89up246rkqogdo7vp7qh6lek', OPS, 'gmail-task-1a06f0295ab4e6bb-groupscope', NOV12_START, NOV12_END],
    ['bq7th2lis1p5dq0n9vv5hqmtok', OPS, 'gmail-task-1a0a78195ff7c8a0-joycevenetian', NOV13_START, NOV13_END],
    ['4764mu1mon4t9t1054oaarq7do', OPS, 'gmail-task-1a0a78195ff7c8a0-kristinvenetian', NOV12_START, NOV12_END],
    ['75ifa5h75j8up225r4k896nsnc', OPS, 'gmail-task-1a102722f4286987-discovery', NOV12_START, NOV12_END],
    ['l2q0a40p8lipfk58g81ajhga8c', OPS, 'gmail-task-1a19a95026eded7f-clientdecision', NOV12_START, NOV12_END],
    ['e7dhiv8vcsnfbd1gf2bpnqam3k', OPS, 'gmail-task-1a1a7443ca3565f9-discoveryfollowup', NOV12_START, NOV12_END],
    ['gbljhks6kl6sh7krjdm0sj7ses', OPS, 'gmail-task-1a1a8b32395152af-vendorquote', NOV12_START, NOV12_END],
    ['hav83pf1j93ur9dr6l79o7g5f8', SALES, 'gmail-task-1a05f0fe9f0a382d-instructor', NOV12_START, NOV12_END],
    ['3etst3v579klkd2hk86backuuk', SALES, 'gmail-task-1a0bada019f53ead-elevatedbilling', NOV12_START, NOV12_END],
    ['k1l0o6pkfqosnrfpd23l5q7aek', SALES, 'gmail-task-1a08876d1e56e0fd-jeffpayment', NOV12_START, NOV12_END],
    ['pprrs36p091auhrmmonjek8lao', SALES, 'gmail-task-1a158ceb30c849d1-postevent', NOV12_START, NOV12_END],
    ['qno1altoshdauhp1421vqpuifk', PROPOSALS, 'gmail-task-1a17faf048bae5f1-clientdecision', NOV12_START, NOV12_END],
    ['gk9tlvf7pfrhimbed2lk64u148', PROPOSALS, 'gmail-task-1a191299d3c0dd3d-clientdecision', NOV12_START, NOV12_END]
  ];
  var EXCLUDED = {
    mi358tus1pbj72iu2068db7c88: 1,
    b024q97161v3c8oa86qnopl864: 1,
    ls1b1f2omslf3m7dhg2bvb2fmo: 1,
    '5t20p2q88fshpbn450bp93q1qo': 1,
    jfq4sf39ovdqokb52e4ns9pohg: 1,
    gpgtdkh0p7rmik88v479dfhghk: 1
  };

  function authFailure(error) {
    var text = String(error && error.message ? error.message : error);
    return /insufficient permission|required permission|authorization|unauthorized|forbidden|invalid_grant|permission denied|access_not_configured|not having permission/i.test(text) ||
      /\b(401|403)\b/.test(text);
  }

  function instant(point) {
    if (!point || point.date || !point.dateTime) return null;
    var raw = String(point.dateTime);
    if (!/(?:Z|[+-]\d{2}:\d{2})$/.test(raw)) return null;
    var ms = Date.parse(raw);
    return isFinite(ms) ? ms : null;
  }

  function hasConference(event) {
    if (!event || event.hangoutLink) return Boolean(event && event.hangoutLink);
    var data = event.conferenceData;
    if (!data) return false;
    if (data.conferenceId) return true;
    return Array.isArray(data.entryPoints) && data.entryPoints.length > 0;
  }

  function descriptionHasTaskLine(description, taskId) {
    var lines = String(description || '').replace(/^\uFEFF/, '').split(/\r?\n/);
    var wanted = 'Task ID: ' + taskId;
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].trim() === wanted) return true;
    }
    return false;
  }

  function loadTasks() {
    var response = Sheets.Spreadsheets.Values.get(SHEET_ID, 'Tasks!A1:J');
    var rows = response && response.values ? response.values : [];
    if (!rows.length) throw new Error('Tasks sheet returned no header row.');
    var headers = rows[0].map(function (cell) { return String(cell).trim(); });
    var idCol = headers.indexOf('task_id');
    var statusCol = headers.indexOf('status');
    if (idCol < 0 || statusCol < 0) throw new Error('Tasks sheet is missing task_id or status.');
    var found = {};
    for (var r = 1; r < rows.length; r++) {
      var id = String(rows[r][idCol] || '').trim();
      if (!id) continue;
      var status = String(rows[r][statusCol] || '').trim().toLowerCase();
      if (!found[id]) found[id] = { count: 0, status: status };
      found[id].count++;
      found[id].status = status;
    }
    return found;
  }

  if (ALLOW.length !== 18) throw new Error('Allowlist length is not 18. No Calendar call was made.');
  var seen = {};
  for (var n = 0; n < ALLOW.length; n++) {
    if (seen[ALLOW[n][0]] || EXCLUDED[ALLOW[n][0]]) {
      throw new Error('Allowlist is not the Phase 7A 18. No Calendar call was made.');
    }
    seen[ALLOW[n][0]] = 1;
  }
  if (!Calendar || !Calendar.Events || typeof Calendar.Events.get !== 'function') {
    throw new Error('Calendar advanced service is unavailable. No event was read.');
  }
  if (!Sheets || !Sheets.Spreadsheets || !Sheets.Spreadsheets.Values || typeof Sheets.Spreadsheets.Values.get !== 'function') {
    throw new Error('Sheets advanced service is unavailable. No event was read.');
  }

  var tasks;
  try {
    tasks = loadTasks();
  } catch (error) {
    if (authFailure(error)) {
      console.log('LVPT18_SUMMARY ' + JSON.stringify({
        stopped: true,
        reason: 'Spreadsheet authorization is unavailable. No Calendar event was read.',
        verified: 0,
        held: 18,
        rejected: 0
      }));
      throw new Error('Authorization unavailable on the Tasks read. Stopped before Calendar.Events.get.');
    }
    throw error;
  }

  var totals = { verified: 0, held: 0, rejected: 0 };
  var readEvent = Calendar.Events.get;

  for (var i = 0; i < ALLOW.length; i++) {
    var eventId = ALLOW[i][0];
    var calendarId = ALLOW[i][1];
    var taskId = ALLOW[i][2];
    var expectStart = ALLOW[i][3];
    var expectEnd = ALLOW[i][4];
    var rejects = [];
    var holds = [];
    var row = {
      calendarId: calendarId,
      eventId: eventId,
      taskId: taskId,
      etag: '',
      privateManaged: '',
      privateTaskId: '',
      summary: '',
      checks: {},
      classification: '',
      reason: ''
    };

    var event;
    try {
      event = readEvent(calendarId, eventId);
    } catch (error) {
      if (authFailure(error)) {
        console.log('LVPT18_EVENT ' + JSON.stringify({
          calendarId: calendarId,
          eventId: eventId,
          taskId: taskId,
          classification: 'HELD — INCOMPLETE VERIFICATION',
          reason: 'Calendar authorization failed. Remaining events were not read.'
        }));
        totals.held++;
        console.log('LVPT18_SUMMARY ' + JSON.stringify({
          stopped: true,
          reason: 'Calendar authorization is unavailable.',
          verified: totals.verified,
          held: totals.held + (ALLOW.length - i - 1),
          rejected: totals.rejected,
          unread: ALLOW.length - i - 1
        }));
        throw new Error('Authorization unavailable on Calendar.Events.get. Stopped.');
      }
      row.classification = 'HELD — INCOMPLETE VERIFICATION';
      row.reason = 'Calendar.Events.get failed for this event: ' + String(error && error.message ? error.message : error).slice(0, 240);
      totals.held++;
      console.log('LVPT18_EVENT ' + JSON.stringify(row));
      continue;
    }

    if (!event || typeof event !== 'object') {
      row.classification = 'HELD — INCOMPLETE VERIFICATION';
      row.reason = 'Calendar.Events.get returned no event resource.';
      totals.held++;
      console.log('LVPT18_EVENT ' + JSON.stringify(row));
      continue;
    }

    row.etag = typeof event.etag === 'string' ? event.etag : '';
    var priv = event.extendedProperties && event.extendedProperties.private ? event.extendedProperties.private : null;
    row.privateManaged = priv && priv.lvptManaged ? String(priv.lvptManaged) : '';
    row.privateTaskId = priv && priv.lvptTaskId ? String(priv.lvptTaskId) : '';
    row.summary = String(event.summary || '').slice(0, 180);

    var returnedIdOk = event.id === eventId;
    var etagOk = row.etag.length > 2;
    var managedOk = priv && priv.lvptManaged === MANAGED;
    var privateTaskOk = priv && priv.lvptTaskId === taskId;
    var markerAbsent = !priv || !Object.prototype.hasOwnProperty.call(priv, 'lvptManaged');
    var statusOk = event.status === 'confirmed';
    var busyOk = event.transparency === 'opaque';
    var attendeesOmitted = event.attendeesOmitted === true;
    var attendees = Array.isArray(event.attendees) ? event.attendees : null;
    var noAttendees = attendees === null || attendees.length === 0;
    var startMs = instant(event.start);
    var endMs = instant(event.end);
    var scheduleOk = startMs === expectStart && endMs === expectEnd;
    var description = String(event.description || '').replace(/^\uFEFF/, '');
    var prefixOk = description.indexOf('LVPT INTERNAL ACTION REMINDER') === 0;
    var descriptionTaskOk = descriptionHasTaskLine(description, taskId);
    var conference = hasConference(event);
    var eventType = event.eventType || 'default';
    var organizerEmail = event.organizer && event.organizer.email ? String(event.organizer.email).toLowerCase() : '';
    var organizerOk = !organizerEmail || organizerEmail === OWNER || organizerEmail === calendarId.toLowerCase();
    var taskRow = tasks[taskId];
    var commandOk = false;
    if (!taskRow) rejects.push('Command Center Tasks tab has no row for this task ID.');
    else if (taskRow.count !== 1) holds.push('Command Center task ID is duplicated.');
    else if (COMPLETE[taskRow.status]) rejects.push('Command Center task is not active. Status: ' + taskRow.status + '.');
    else if (!ACTIVE[taskRow.status]) holds.push('Command Center task status is ambiguous: ' + (taskRow.status || 'blank') + '.');
    else commandOk = true;

    if (!returnedIdOk) rejects.push('Returned event ID does not match the allowlisted event ID.');
    if (!etagOk) holds.push('ETag was not present on the event resource.');
    if (markerAbsent || !managedOk) rejects.push('Private lvptManaged is not taskSyncV1.');
    if (!privateTaskOk) rejects.push('Private lvptTaskId does not match the Phase 7A task ID.');
    if (!statusOk) {
      if (!event.status) holds.push('Status was omitted.');
      else rejects.push('Status is not confirmed.');
    }
    if (!busyOk) {
      if (!event.transparency) holds.push('Transparency was omitted, so Busy status is not explicit.');
      else rejects.push('Transparency is not opaque.');
    }
    if (attendeesOmitted) holds.push('attendeesOmitted is true, so attendee absence cannot be validated.');
    else if (attendees === null && event.attendees) holds.push('Attendee data was not an array.');
    else if (!noAttendees) rejects.push('Attendees are present. Phase 7A recorded none.');
    if (!scheduleOk) {
      if (startMs === null || endMs === null) holds.push('Start or end has no offset dateTime, so the baseline instant cannot be compared.');
      else rejects.push('Start or end does not match the Phase 7A instant.');
    }
    if (!prefixOk) rejects.push('Description does not start with LVPT INTERNAL ACTION REMINDER.');
    if (!descriptionTaskOk) rejects.push('Description does not contain the Phase 7A Task ID line.');
    if (conference) rejects.push('Conference or Meet data is present.');
    if (eventType !== 'default') holds.push('eventType is not default: ' + eventType + '.');
    if (!organizerOk) rejects.push('Organizer is not the business account or this calendar.');
    holds.push('Exact title was not preserved in the Phase 7A baseline, so the live summary cannot be certified.');
    holds.push('Exact full description was not preserved in the Phase 7A baseline, so only the prefix and Task ID line were compared.');

    row.checks = {
      calendarId: true,
      eventId: returnedIdOk,
      etagPresent: etagOk,
      privateOwnershipMarker: Boolean(managedOk),
      privateTaskId: Boolean(privateTaskOk),
      commandCenterTask: commandOk,
      commandCenterStatus: taskRow && taskRow.count === 1 ? taskRow.status : '',
      statusConfirmed: statusOk,
      busyOpaque: busyOk,
      clientAttendeesAbsent: !attendeesOmitted && noAttendees,
      attendeesOmitted: attendeesOmitted,
      scheduleMatchesBaseline: scheduleOk,
      descriptionPrefixMatchesBaseline: prefixOk,
      descriptionTaskLineMatchesBaseline: descriptionTaskOk,
      exactTitleComparable: false,
      exactDescriptionComparable: false,
      conferenceAbsent: !conference,
      organizerAccepted: organizerOk,
      eventType: eventType
    };

    if (rejects.length) {
      row.classification = 'REJECTED — FAILED SAFETY CHECK';
      row.reason = rejects.concat(holds).join(' ');
      totals.rejected++;
    } else {
      row.classification = 'HELD — INCOMPLETE VERIFICATION';
      row.reason = holds.join(' ');
      totals.held++;
    }
    console.log('LVPT18_EVENT ' + JSON.stringify(row));
  }

  console.log('LVPT18_SUMMARY ' + JSON.stringify({
    stopped: false,
    verified: totals.verified,
    held: totals.held,
    rejected: totals.rejected,
    note: 'VERIFIED is unreachable until exact Phase 7A titles and full descriptions are added. A passing log is not owner authorization to write.'
  }));
  return totals;
}
```

## 2. Allowlist

The function contains the 18 pairs from `docs/baselines/phase-07a-reconciliation.md` and no others. It throws before any API call if that list is not exactly those 18 IDs.

| Event ID | Calendar | Task ID | Baseline start–end |
|---|---|---|---|
| qeldb1q51645jklbu85q4e04jk | Operations | id-o7d4f2t0-msgkz6li | 2026-11-12 14:00:00Z–14:15:00Z |
| kuvubcaj89o7u9l5ql5n0jbs50 | Operations | gmail-task-1a01a0153c0414d5-decisionfollowup | 2026-11-12 14:00:00Z–14:15:00Z |
| 1bc70raopb4mj9alj1re0ohhl0 | Operations | gmail-task-1a03b1faffef9dba-bellagioprocess | 2026-11-12 14:00:00Z–14:15:00Z |
| urus99830didvj72ep5qdol5d8 | Operations | gmail-task-1a04fe720da18e40-clientdecision | 2026-11-12 14:00:00Z–14:15:00Z |
| 3th8nnbtdhoj1ed0fsssa8h4v0 | Operations | gmail-task-1a059ae0795bc721-clientdecision | 2026-11-12 14:00:00Z–14:15:00Z |
| jh89up246rkqogdo7vp7qh6lek | Operations | gmail-task-1a06f0295ab4e6bb-groupscope | 2026-11-12 14:00:00Z–14:15:00Z |
| bq7th2lis1p5dq0n9vv5hqmtok | Operations | gmail-task-1a0a78195ff7c8a0-joycevenetian | 2026-11-13 14:00:00Z–14:15:00Z |
| 4764mu1mon4t9t1054oaarq7do | Operations | gmail-task-1a0a78195ff7c8a0-kristinvenetian | 2026-11-12 14:00:00Z–14:15:00Z |
| 75ifa5h75j8up225r4k896nsnc | Operations | gmail-task-1a102722f4286987-discovery | 2026-11-12 14:00:00Z–14:15:00Z |
| l2q0a40p8lipfk58g81ajhga8c | Operations | gmail-task-1a19a95026eded7f-clientdecision | 2026-11-12 14:00:00Z–14:15:00Z |
| e7dhiv8vcsnfbd1gf2bpnqam3k | Operations | gmail-task-1a1a7443ca3565f9-discoveryfollowup | 2026-11-12 14:00:00Z–14:15:00Z |
| gbljhks6kl6sh7krjdm0sj7ses | Operations | gmail-task-1a1a8b32395152af-vendorquote | 2026-11-12 14:00:00Z–14:15:00Z |
| hav83pf1j93ur9dr6l79o7g5f8 | Sales | gmail-task-1a05f0fe9f0a382d-instructor | 2026-11-12 14:00:00Z–14:15:00Z |
| 3etst3v579klkd2hk86backuuk | Sales | gmail-task-1a0bada019f53ead-elevatedbilling | 2026-11-12 14:00:00Z–14:15:00Z |
| k1l0o6pkfqosnrfpd23l5q7aek | Sales | gmail-task-1a08876d1e56e0fd-jeffpayment | 2026-11-12 14:00:00Z–14:15:00Z |
| pprrs36p091auhrmmonjek8lao | Sales | gmail-task-1a158ceb30c849d1-postevent | 2026-11-12 14:00:00Z–14:15:00Z |
| qno1altoshdauhp1421vqpuifk | Proposals | gmail-task-1a17faf048bae5f1-clientdecision | 2026-11-12 14:00:00Z–14:15:00Z |
| gk9tlvf7pfrhimbed2lk64u148 | Proposals | gmail-task-1a191299d3c0dd3d-clientdecision | 2026-11-12 14:00:00Z–14:15:00Z |

Operations: `c_a9756e49c39a571a2c21d99524f4c226e1772fca9f0c4156e245d5fd7d941a2a@group.calendar.google.com`

Sales: `c_451b7f3ca8c727da168891a0d1d53475beb13c0c649c6157acdd98959b5cc334@group.calendar.google.com`

Proposals: `c_e68f6233ff8a0e2fb22168ee24da99dc06e0416d652a0e1b964d3a88f5c0935b@group.calendar.google.com`

These IDs are refused if they are edited into the allowlist: Thom Johnston `mi358tus1pbj72iu2068db7c88`, William Traynor `b024q97161v3c8oa86qnopl864`, Cowbell `ls1b1f2omslf3m7dhg2bvb2fmo`, Kristin / Ethan `5t20p2q88fshpbn450bp93q1qo`, OWS AWS `jfq4sf39ovdqokb52e4ns9pohg`, and the legacy NIUM Meet event `gpgtdkh0p7rmik88v479dfhghk`. Secondary calendar copies are not listed.

Ownership comes only from `extendedProperties.private.lvptManaged === "taskSyncV1"` and `extendedProperties.private.lvptTaskId` equal to the allowlisted task ID. That is the schema written by staging `TaskSync.js`. A matching title or description is not ownership. `lvptDueDate` is part of the written schema and is not a pass/fail field here, because Phase 7A did not preserve its value.

## 3. Existing services and scopes

The staging manifest already has:

- `https://www.googleapis.com/auth/calendar.readonly`
- `https://www.googleapis.com/auth/spreadsheets.readonly`
- Advanced Calendar service, v3
- Advanced Sheets service, v4

The diagnostic uses those services. It does not edit `appsscript.json`, add a scope, or call `CalendarApp`, `Session`, `UrlFetchApp`, `GmailApp`, or `ScriptApp`.

Phase 7A preserved the schedule instants, the description prefix `LVPT INTERNAL ACTION REMINDER`, and the description `Task ID:` line. It did not preserve the exact summary string or the full description. Those two comparisons stay incomplete on purpose. A clean read therefore classifies the event as **HELD — INCOMPLETE VERIFICATION** rather than **VERIFIED — TECHNICALLY ELIGIBLE**. A failed ownership, status, transparency, attendee, schedule, or active-task check classifies it as **REJECTED — FAILED SAFETY CHECK**.

The Tasks read is a values read of `Tasks!A1:J`. Only `task_id` and `status` are used. Active statuses are the statuses already used by TaskSync: open, in progress, waiting, blocked, pending, and on hold.

## 4. Safety review

| Call | Method | What it does |
|---|---|---|
| `Sheets.Spreadsheets.Values.get` | Read | One values read of the Tasks tab. No update, append, clear, or batch write. |
| `Calendar.Events.get` | Read | One full `events.get` for each of the 18 allowlisted pairs. No `fields` filter. Called 18 times only after the sheet read succeeds. |

No code path calls Calendar `insert`, `patch`, `update`, `remove`, `move`, `import`, `quickAdd`, or `watch`. No code path calls a spreadsheet write. No code path sends mail, creates a trigger, or creates a deployment. No code path calls TaskSync. An authorization failure on the sheet read stops the function before any event read. An authorization failure on an event read logs that event, counts the unread remainder as held, and throws without reading the rest.

The function was checked as source. It was not executed.

## 5. Owner run instructions

1. Sign in to the browser as `book@pokertraininglasvegas.com`.
2. Open the existing staging project only: https://script.google.com/d/1rDlSTCuf7R9yYY3h5ggM-Z3Ivv9S5AMMvRZSnatrgYpTDKKiwMACJm8f/edit
3. Confirm the project title is **LVPT Calendar Preview Staging**. Do not open the production Calendar Command Center.
4. Add a new script file named `Verify18`. Leave `TaskSync.gs` and `appsscript.json` unchanged.
5. Paste only `verifyLVPT18CalendarMetadata` from section 1. Save that new file.
6. Do not click Deploy. Do not add a trigger. Do not select `runLVPTTaskSync` or `previewLVPTTaskSync`.
7. Choose `verifyLVPT18CalendarMetadata` in the function list and click Run.
8. If Google asks for permission, continue only when the request is to view calendars and view spreadsheets. Cancel the run if it asks to change calendars, send email, manage triggers, or change any other scope.
9. Open the execution log. Copy every line that starts with `LVPT18_EVENT` or `LVPT18_SUMMARY`.

## 6. What to send back

Send the copied log lines. Do not send a screenshot in place of the log if the log text is available. Do not change a calendar event from the result.

Each event line has the calendar ID, event ID, allowlisted task ID, ETag, private marker, private task ID, a short title, the check booleans, the classification, and the reason. The summary line has the verified, held, and rejected totals.

This preparation does not authorize a production correction.
