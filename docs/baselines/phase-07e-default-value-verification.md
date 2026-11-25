# Phase 7E — Calendar API defaults and the 18-event eligibility review

Recorded: 2026-11-20, 5:05 PM ET. Read-only. The corrected diagnostic was not added to Apps Script and was not run. No Calendar write, no production edit, no manifest change, no scope change, and no spreadsheet change.

## Recommendation

**NOT READY — ADDITIONAL VERIFICATION REQUIRED**

| Result | Phase 7D execution | This evidence review |
|---|---|---|
| VERIFIED — TECHNICALLY ELIGIBLE | 0 | 0 |
| HELD — INCOMPLETE VERIFICATION | 1 | 18 |
| REJECTED — FAILED SAFETY CHECK | 17 | 0 pending a rerun that logs raw status |

The 17 Phase 7D rejections are not cleared. They are held because the raw status string was not stored. This review did not call the Calendar API.

## 1. Root cause of the 17 rejections

The executed function is the one in `docs/baselines/phase-07d-staging-verification.md`. These are the exact expressions:

```javascript
var statusOk = event.status === 'confirmed';
var busyOk = event.transparency === 'opaque';
```

```javascript
if (!statusOk) {
  if (!event.status) holds.push('Status was omitted.');
  else rejects.push('Status is not confirmed.');
}
if (!busyOk) {
  if (!event.transparency) holds.push('Transparency was omitted, so Busy status is not explicit.');
  else rejects.push('Transparency is not opaque.');
}
```

```javascript
if (rejects.length) {
  row.classification = 'REJECTED — FAILED SAFETY CHECK';
} else {
  row.classification = 'HELD — INCOMPLETE VERIFICATION';
}
```

Omitted status is a hold, not a rejection. Omitted transparency is a hold, not a rejection. A rejection from these two fields happens only when the property is present and is not the expected string.

The Phase 7D report says transparency was omitted on all 18. That path adds a hold. It cannot produce the 17-to-1 split.

Joyce Chang’s event passed `statusConfirmed`, so `event.status` was the string `confirmed`. The other 17 failed that check and were classified rejected. The only status path that rejects is a nonempty value other than `confirmed`. An omitted status would have held those 17 as well, and the result would have been 18 held and 0 rejected.

The log stored the boolean `statusConfirmed` and, on that branch, the sentence `Status is not confirmed.` It did not store the raw status string. That string is not in the repository, the Phase 7D document, or a saved execution log. The 17 values are therefore unknown. They are not the documented default, because the default path does not reject. They also cannot be labeled `cancelled` or `tentative` without the raw token.

The title and description holds were added on every event, including Joyce. They explain why Joyce was held. They do not explain why the other 17 were rejected.

## 2. Calendar API default behavior

The Events resource documents both fields as optional.

https://developers.google.com/workspace/calendar/api/v3/reference/events

- `status`: optional. `confirmed` means the event is confirmed and is the default. `tentative` and `cancelled` are the other defined values.
- `transparency`: optional. `opaque` is the default and means Busy. `transparent` means Free.

The production TaskSync body in `apps-script/live/calendar-command-center/TaskSync.js` does not set `status` or `transparency` when it builds a reminder. An insert that omits those fields leaves the API defaults in force. A later `events.get` may omit them again. Omission is not an explicit invalid value. A nonempty value outside the documented set is not a default and must not be rewritten into one.

The corrected function records the raw value, the effective value, and whether the documented default was applied. It does not write that default back to the event.

## 3. Corrected read-only diagnostic

Replace the function in the staging file `Verify18` with the version below. Do not edit `TaskSync.gs`, `appsscript.json`, or the production project.

The allowlist is the same 18 pairs. The function still calls only `Sheets.Spreadsheets.Values.get` and `Calendar.Events.get`. It does not call TaskSync.

```javascript
/**
 * Read-only recheck of the Phase 7A 18-event allowlist.
 * Calendar.Events.get and one Sheets values read. No writes.
 * Absent status defaults to confirmed. Absent transparency defaults to opaque.
 * Any other nonempty value is kept and is not treated as the default.
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

  function shown(value) {
    if (value === undefined || value === null || value === '') return null;
    if (typeof value === 'string') return value;
    return { unexpectedType: typeof value, preview: String(value).slice(0, 80) };
  }

  function interpretStatus(raw) {
    if (raw === undefined || raw === null || raw === '') {
      return { raw: null, effective: 'confirmed', defaultApplied: true, outcome: 'pass' };
    }
    if (raw === 'confirmed') return { raw: raw, effective: 'confirmed', defaultApplied: false, outcome: 'pass' };
    if (raw === 'cancelled' || raw === 'tentative') return { raw: raw, effective: raw, defaultApplied: false, outcome: 'reject' };
    return { raw: shown(raw), effective: null, defaultApplied: false, outcome: 'hold' };
  }

  function interpretTransparency(raw) {
    if (raw === undefined || raw === null || raw === '') {
      return { raw: null, effective: 'opaque', defaultApplied: true, outcome: 'pass' };
    }
    if (raw === 'opaque') return { raw: raw, effective: 'opaque', defaultApplied: false, outcome: 'pass' };
    if (raw === 'transparent') return { raw: raw, effective: 'transparent', defaultApplied: false, outcome: 'exclude' };
    return { raw: shown(raw), effective: null, defaultApplied: false, outcome: 'hold' };
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
      rawStatus: null,
      effectiveStatus: null,
      statusDefaultApplied: false,
      rawTransparency: null,
      effectiveTransparency: null,
      transparencyDefaultApplied: false,
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

    var statusInfo = interpretStatus(event.status);
    var transparencyInfo = interpretTransparency(event.transparency);
    row.etag = typeof event.etag === 'string' ? event.etag : '';
    var priv = event.extendedProperties && event.extendedProperties.private ? event.extendedProperties.private : null;
    row.privateManaged = priv && priv.lvptManaged ? String(priv.lvptManaged) : '';
    row.privateTaskId = priv && priv.lvptTaskId ? String(priv.lvptTaskId) : '';
    row.rawStatus = statusInfo.raw;
    row.effectiveStatus = statusInfo.effective;
    row.statusDefaultApplied = statusInfo.defaultApplied;
    row.rawTransparency = transparencyInfo.raw;
    row.effectiveTransparency = transparencyInfo.effective;
    row.transparencyDefaultApplied = transparencyInfo.defaultApplied;
    row.summary = String(event.summary || '').slice(0, 180);

    var returnedIdOk = event.id === eventId;
    var etagOk = row.etag.length > 2;
    var managedOk = priv && priv.lvptManaged === MANAGED;
    var privateTaskOk = priv && priv.lvptTaskId === taskId;
    var markerAbsent = !priv || !Object.prototype.hasOwnProperty.call(priv, 'lvptManaged');
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
    if (statusInfo.outcome === 'reject') rejects.push('Status is ' + statusInfo.raw + '.');
    if (statusInfo.outcome === 'hold') holds.push('Status value is unexpected: ' + JSON.stringify(statusInfo.raw) + '.');
    if (transparencyInfo.outcome === 'exclude') rejects.push('Transparency is transparent. The event is already Free and is excluded from correction.');
    if (transparencyInfo.outcome === 'hold') holds.push('Transparency value is unexpected: ' + JSON.stringify(transparencyInfo.raw) + '.');
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
    holds.push('Exact title was not preserved in an independent baseline.');
    holds.push('Exact full description was not preserved in an independent baseline.');

    row.checks = {
      calendarId: true,
      eventId: returnedIdOk,
      etagPresent: etagOk,
      privateOwnershipMarker: Boolean(managedOk),
      privateTaskId: Boolean(privateTaskOk),
      commandCenterTask: commandOk,
      commandCenterStatus: taskRow && taskRow.count === 1 ? taskRow.status : '',
      statusConfirmed: statusInfo.effective === 'confirmed',
      busyOpaque: transparencyInfo.effective === 'opaque',
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
    } else if (holds.length) {
      row.classification = 'HELD — INCOMPLETE VERIFICATION';
      row.reason = holds.join(' ');
      totals.held++;
    } else {
      row.classification = 'VERIFIED — TECHNICALLY ELIGIBLE';
      row.reason = '';
      totals.verified++;
    }
    console.log('LVPT18_EVENT ' + JSON.stringify(row));
  }

  console.log('LVPT18_SUMMARY ' + JSON.stringify({
    stopped: false,
    verified: totals.verified,
    held: totals.held,
    rejected: totals.rejected,
    note: 'A technically eligible result is not owner authorization to write. Exact titles and full descriptions are still unpreserved, so VERIFIED stays blocked.'
  }));
  return totals;
}
```

Local syntax check of this function succeeded. It was not executed. A source scan shows the only Google calls are `Sheets.Spreadsheets.Values.get` and `Calendar.Events.get`.

With the current evidence, the two baseline holds fire for every event. `VERIFIED — TECHNICALLY ELIGIBLE` is present in the function and is not reachable until an independent exact title and full description exist for that event.

## 4. Missing historical baselines

No independent exact title or full description was found for these 18 events.

Searched: Phase 6 and Phase 7A baseline documents, staging and production TaskSync source, calendar tests, and the local Downloads folder. The November 12 calendar export is not on disk. The Phase 7D execution log was not saved in the repository, so the ETag strings and raw status strings from that run are not archived here.

Phase 7A preserved the schedule instants, the description prefix `LVPT INTERNAL ACTION REMINDER`, and the `Task ID:` line. Phase 7D reported that those checks passed for all 18. That is not the full description.

TaskSync can build a summary of the form `OVERDUE — {company} — {action}` or `ACTION — {company} — {action}`, and a description from the task row, priority, due date, and Gmail link. Running that generator against the sheet today would be reconstructed current content, not a November 12 historical record. The corrected diagnostic does not do that comparison and does not treat it as a pass.

The live event’s own summary and description are not used as the historical baseline.

## 5. Preliminary eligibility matrix

This matrix uses the Phase 7D reported checks and the source-code path above. It is not a new API read and it is not a run of the corrected function.

Full calendar IDs:

- Operations: `c_a9756e49c39a571a2c21d99524f4c226e1772fca9f0c4156e245d5fd7d941a2a@group.calendar.google.com`
- Sales: `c_451b7f3ca8c727da168891a0d1d53475beb13c0c649c6157acdd98959b5cc334@group.calendar.google.com`
- Proposals: `c_e68f6233ff8a0e2fb22168ee24da99dc06e0416d652a0e1b964d3a88f5c0935b@group.calendar.google.com`

Shared reported results for every row: ETag present, `lvptManaged=taskSyncV1`, private task ID matched, Command Center task active, no client attendees, schedule matched, description prefix and Task ID line matched. Transparency was omitted, so the corrected reading is raw null, effective `opaque`, default applied. Exact title and full description remain unavailable.

| Event ID | Calendar | Task ID | Raw status | Effective status | Raw transparency | Effective transparency | Defaults applied | Final classification | Remaining reason |
|---|---|---|---|---|---|---|---|---|---|
| qeldb1q51645jklbu85q4e04jk | Operations | id-o7d4f2t0-msgkz6li | Nonempty, not `confirmed`; token not logged | Unknown | absent | opaque | Transparency only | HELD — INCOMPLETE VERIFICATION | Raw status unknown. Exact title and full description unavailable. |
| kuvubcaj89o7u9l5ql5n0jbs50 | Operations | gmail-task-1a01a0153c0414d5-decisionfollowup | Nonempty, not `confirmed`; token not logged | Unknown | absent | opaque | Transparency only | HELD — INCOMPLETE VERIFICATION | Raw status unknown. Exact title and full description unavailable. |
| 1bc70raopb4mj9alj1re0ohhl0 | Operations | gmail-task-1a03b1faffef9dba-bellagioprocess | Nonempty, not `confirmed`; token not logged | Unknown | absent | opaque | Transparency only | HELD — INCOMPLETE VERIFICATION | Raw status unknown. Exact title and full description unavailable. |
| urus99830didvj72ep5qdol5d8 | Operations | gmail-task-1a04fe720da18e40-clientdecision | Nonempty, not `confirmed`; token not logged | Unknown | absent | opaque | Transparency only | HELD — INCOMPLETE VERIFICATION | Raw status unknown. Exact title and full description unavailable. |
| 3th8nnbtdhoj1ed0fsssa8h4v0 | Operations | gmail-task-1a059ae0795bc721-clientdecision | Nonempty, not `confirmed`; token not logged | Unknown | absent | opaque | Transparency only | HELD — INCOMPLETE VERIFICATION | Raw status unknown. Exact title and full description unavailable. |
| jh89up246rkqogdo7vp7qh6lek | Operations | gmail-task-1a06f0295ab4e6bb-groupscope | Nonempty, not `confirmed`; token not logged | Unknown | absent | opaque | Transparency only | HELD — INCOMPLETE VERIFICATION | Raw status unknown. Exact title and full description unavailable. |
| bq7th2lis1p5dq0n9vv5hqmtok | Operations | gmail-task-1a0a78195ff7c8a0-joycevenetian | confirmed | confirmed | absent | opaque | Transparency only | HELD — INCOMPLETE VERIFICATION | Exact title and full description unavailable. |
| 4764mu1mon4t9t1054oaarq7do | Operations | gmail-task-1a0a78195ff7c8a0-kristinvenetian | Nonempty, not `confirmed`; token not logged | Unknown | absent | opaque | Transparency only | HELD — INCOMPLETE VERIFICATION | Raw status unknown. Exact title and full description unavailable. |
| 75ifa5h75j8up225r4k896nsnc | Operations | gmail-task-1a102722f4286987-discovery | Nonempty, not `confirmed`; token not logged | Unknown | absent | opaque | Transparency only | HELD — INCOMPLETE VERIFICATION | Raw status unknown. Exact title and full description unavailable. |
| l2q0a40p8lipfk58g81ajhga8c | Operations | gmail-task-1a19a95026eded7f-clientdecision | Nonempty, not `confirmed`; token not logged | Unknown | absent | opaque | Transparency only | HELD — INCOMPLETE VERIFICATION | Raw status unknown. Exact title and full description unavailable. |
| e7dhiv8vcsnfbd1gf2bpnqam3k | Operations | gmail-task-1a1a7443ca3565f9-discoveryfollowup | Nonempty, not `confirmed`; token not logged | Unknown | absent | opaque | Transparency only | HELD — INCOMPLETE VERIFICATION | Raw status unknown. Exact title and full description unavailable. |
| gbljhks6kl6sh7krjdm0sj7ses | Operations | gmail-task-1a1a8b32395152af-vendorquote | Nonempty, not `confirmed`; token not logged | Unknown | absent | opaque | Transparency only | HELD — INCOMPLETE VERIFICATION | Raw status unknown. Exact title and full description unavailable. |
| hav83pf1j93ur9dr6l79o7g5f8 | Sales | gmail-task-1a05f0fe9f0a382d-instructor | Nonempty, not `confirmed`; token not logged | Unknown | absent | opaque | Transparency only | HELD — INCOMPLETE VERIFICATION | Raw status unknown. Exact title and full description unavailable. |
| 3etst3v579klkd2hk86backuuk | Sales | gmail-task-1a0bada019f53ead-elevatedbilling | Nonempty, not `confirmed`; token not logged | Unknown | absent | opaque | Transparency only | HELD — INCOMPLETE VERIFICATION | Raw status unknown. Exact title and full description unavailable. |
| k1l0o6pkfqosnrfpd23l5q7aek | Sales | gmail-task-1a08876d1e56e0fd-jeffpayment | Nonempty, not `confirmed`; token not logged | Unknown | absent | opaque | Transparency only | HELD — INCOMPLETE VERIFICATION | Raw status unknown. Exact title and full description unavailable. |
| pprrs36p091auhrmmonjek8lao | Sales | gmail-task-1a158ceb30c849d1-postevent | Nonempty, not `confirmed`; token not logged | Unknown | absent | opaque | Transparency only | HELD — INCOMPLETE VERIFICATION | Raw status unknown. Exact title and full description unavailable. |
| qno1altoshdauhp1421vqpuifk | Proposals | gmail-task-1a17faf048bae5f1-clientdecision | Nonempty, not `confirmed`; token not logged | Unknown | absent | opaque | Transparency only | HELD — INCOMPLETE VERIFICATION | Raw status unknown. Exact title and full description unavailable. |
| gk9tlvf7pfrhimbed2lk64u148 | Proposals | gmail-task-1a191299d3c0dd3d-clientdecision | Nonempty, not `confirmed`; token not logged | Unknown | absent | opaque | Transparency only | HELD — INCOMPLETE VERIFICATION | Raw status unknown. Exact title and full description unavailable. |

ETag verification, private ownership, and attendee verification are the Phase 7D passes listed above the table. Baseline comparison is a pass for the preserved prefix, Task ID line, and schedule only.

The 17 are not reclassified as rejected here, because the new rule holds an unexpected nonempty status and rejects only `cancelled` or `tentative`. The token that would decide that was not logged. They are not eligible.

## 6. Manual rerun

1. Sign in as `book@pokertraininglasvegas.com`.
2. Open only https://script.google.com/d/1rDlSTCuf7R9yYY3h5ggM-Z3Ivv9S5AMMvRZSnatrgYpTDKKiwMACJm8f/edit and confirm the title **LVPT Calendar Preview Staging**.
3. Replace the body of `verifyLVPT18CalendarMetadata` in `Verify18` with section 3. Do not change `TaskSync.gs` or `appsscript.json`.
4. Do not deploy, add a trigger, or run `runLVPTTaskSync`.
5. Run `verifyLVPT18CalendarMetadata`. Accept a prompt only when it asks to view calendars and view spreadsheets.
6. Copy every `LVPT18_EVENT` and `LVPT18_SUMMARY` line. Each event line now includes `rawStatus`, `effectiveStatus`, `statusDefaultApplied`, `rawTransparency`, `effectiveTransparency`, and `transparencyDefaultApplied`.

## 7. Final recommendation

**NOT READY — ADDITIONAL VERIFICATION REQUIRED**

Verified on this review: 0. Held: 18. Rejected pending the raw status string: the original 17 are not eligible and are not assumed safe. The corrected function has not been run. No Calendar correction is authorized.
