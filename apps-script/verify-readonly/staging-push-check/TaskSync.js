/**
 * LVPT staging preview only. This is not the production Calendar Command Center.
 *
 * LVPT_STAGING_PREVIEW_ONLY is hard-coded. Every entry point reads the Tasks
 * sheet and four business calendars, then stops. Selecting runLVPTTaskSync,
 * or calling the writer directly, throws before any Google write API.
 * The staging manifest grants spreadsheet and calendar read scopes only.
 *
 * Do not copy this file into the production project. Do not install a trigger.
 *
 * LOCAL REVIEW COPY. Do not clasp push this file to production.
 * Snapshotted from apps-script/calendar-command-center/TaskSync.js.
 *
 * v3 never creates recurring task reminders. v3.2 local also:
 * - scans all four business calendars, including Confirmed Events
 * - never mutates customer bookings, guest events, or unmanaged Confirmed Events entries
 * - writes internal reminders as 15 minutes, Free, with no Meet link
 * - identifies Meet links on managed internal reminders
 *
 * Existing Meet links are not cleared by Calendar.Events.patch. The Advanced
 * Service drops null fields, and conferenceDataVersion must be the client
 * value 1, not the event's own conference version. This file therefore makes
 * no direct HTTP call and adds no OAuth scope. conferenceRestClear stays
 * false so the existing hourly trigger keeps its current authorization.
 *
 * Run previewLVPTTaskSync() before any future authorized live run.
 * Apps Script Advanced Calendar service must stay enabled.
 * Do not add a trigger. Production runLVPTTaskSync stays in the other project.
 */

var LVPT_STAGING_PREVIEW_ONLY = true;

var LVPT_SYNC_CONFIG = {
  spreadsheetId: '1oHoVdD5CDcEreyRnB7cEvYfp6wWEgAmf04BwrktkMYs',
  ownerEmail: 'book@pokertraininglasvegas.com',
  reminderTimeZone: 'America/New_York',
  calendarNames: {
    sales: 'LVPT | Sales & Follow-Ups',
    proposals: 'LVPT | Proposals & Holds',
    operations: 'LVPT | Operations & Payments',
    confirmed: 'LVPT | Confirmed Events'
  },
  managedTag: 'taskSyncV1',
  // Keep false. True would require a REST sender and a new Apps Script scope.
  conferenceRestClear: false,
  scanMaxPages: 12,
  scanPageSize: 250
};

function previewLVPTTaskSync() {
  return lvptSyncTasks_(true);
}

function runLVPTTaskSync() {
  throw new Error('LVPT staging cannot write. Run previewLVPTTaskSync. No Calendar, Sheet, Gmail, or trigger change was made.');
}

function lvptSyncTasks_(preview) {
  if (LVPT_STAGING_PREVIEW_ONLY !== true) {
    throw new Error('Staging preview flag missing. No writes were made.');
  }
  if (preview !== true) {
    throw new Error('LVPT staging refused a write pass. No Calendar, Sheet, Gmail, or trigger change was made.');
  }
  var cfg = LVPT_SYNC_CONFIG;
  var account = String(CalendarApp.getDefaultCalendar().getId()).toLowerCase();
  if (account !== cfg.ownerEmail) {
    throw new Error('Wrong account: ' + account + '. Expected ' + cfg.ownerEmail);
  }
  var calendars = {};
  var category;
  for (category in cfg.calendarNames) {
    if (!Object.prototype.hasOwnProperty.call(cfg.calendarNames, category)) continue;
    var owned = CalendarApp.getOwnedCalendarsByName(cfg.calendarNames[category]);
    if (owned.length !== 1) throw new Error('Expected one owned calendar: ' + cfg.calendarNames[category]);
    calendars[category] = owned[0].getId();
  }

  var ss = SpreadsheetApp.openById(cfg.spreadsheetId);
  var tasksSheet = ss.getSheetByName('Tasks');
  var eventsSheet = ss.getSheetByName('Events');
  if (!tasksSheet || !eventsSheet || tasksSheet.getLastRow() < 2) {
    throw new Error('Tasks or Events spreadsheet data is unavailable.');
  }
  var values = tasksSheet.getRange(1, 1, tasksSheet.getLastRow(), 10).getDisplayValues();
  var headers = values.shift().map(function (cell) { return String(cell).trim(); });
  var columns = {};
  ['task_id', 'event_id', 'task', 'due_date', 'priority', 'status', 'notes'].forEach(function (key) {
    var index = headers.indexOf(key);
    if (index < 0) throw new Error('Missing Tasks column: ' + key);
    columns[key] = index;
  });
  var companies = {};
  var eventRows = eventsSheet.getRange(1, 1, Math.max(eventsSheet.getLastRow(), 1), 3).getDisplayValues();
  eventRows.slice(1).forEach(function (row) {
    if (row[0]) companies[row[0]] = row[2] || row[1] || row[0];
  });
  var taskRows = values.map(function (row) {
    return {
      task_id: row[columns.task_id],
      event_id: row[columns.event_id],
      task: row[columns.task],
      due_date: row[columns.due_date],
      priority: row[columns.priority],
      status: row[columns.status],
      notes: row[columns.notes]
    };
  });

  var scanIds = ['sales', 'proposals', 'operations', 'confirmed'].map(function (key) {
    return calendars[key];
  });
  var listed = [];
  var seen = {};
  scanIds.forEach(function (calendarId) {
    lvptListCalendarEvents_(calendarId, { privateExtendedProperty: 'lvptManaged=' + cfg.managedTag })
      .forEach(function (ev) {
        listed.push({ calendarId: calendarId, event: ev, fromManagedQuery: true });
        seen[calendarId + '::' + ev.id] = true;
      });
    lvptListCalendarEvents_(calendarId, { q: 'LVPT INTERNAL' }).forEach(function (ev) {
      listed.push({ calendarId: calendarId, event: ev, fromManagedQuery: false });
      seen[calendarId + '::' + ev.id] = true;
    });
  });
  taskRows.forEach(function (row) {
    lvptCanonicalReferences_(row.notes, scanIds).forEach(function (ref) {
      var key = ref.calendarId + '::' + ref.eventId;
      if (seen[key]) return;
      var ev;
      try { ev = Calendar.Events.get(ref.calendarId, ref.eventId); }
      catch (error) {
        if (/\b(?:404|not found)\b/i.test(String(error))) return;
        throw new Error('Calendar lookup failed for ' + row.task_id + ': ' + error);
      }
      if (ev && ev.status !== 'cancelled') {
        listed.push({ calendarId: ref.calendarId, event: ev, fromManagedQuery: false });
        seen[key] = true;
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
  if (!plan.ok) throw new Error(plan.error || 'Task calendar plan failed');

  var counts = plan.counts;
  plan.changes.forEach(function (change) {
    console.log('WOULD ' + change.kind.toUpperCase() + ' — ' + change.id + ' (not applied)');
  });

  var report = {
    preview: true,
    stagingPreviewOnly: true,
    calendarWrites: 0,
    totalTaskRows: plan.totalTaskRows,
    datedActiveTasks: plan.datedActiveTasks,
    noDueDate: plan.noDueDate,
    invalidDates: plan.invalidDates,
    unchanged: plan.unchanged,
    counts: counts,
    issues: plan.issues,
    protected: plan.protected,
    scannedCalendarIds: plan.scannedCalendarIds,
    note: plan.note
  };
  console.log(JSON.stringify(report));
  if (preview) console.log('PREVIEW ONLY: zero Calendar writes.');
  return report;
}

/**
 * Pure planner. `events` are already loaded by the caller. Customer events
 * and any event with attendees are reported as protected and omitted from
 * changes. Conference cleanup is a separate change from create/patch/remove.
 */
function lvptPlanTaskCalendarSync_(input) {
  var cfg = (input && input.cfg) || LVPT_SYNC_CONFIG;
  var calendarIds = (input && input.calendarIds) || {};
  var required = ['sales', 'proposals', 'operations', 'confirmed'];
  var key;
  for (key of required) {
    if (!calendarIds[key]) return { ok: false, error: 'Missing calendar: ' + key, changes: [] };
  }
  var scannedCalendarIds = required.map(function (name) { return calendarIds[name]; });
  var now = input && input.now ? new Date(input.now) : new Date();
  var today = lvptFormatDay_(now, cfg.reminderTimeZone);
  var companies = (input && input.companies) || {};
  var issues = [];
  var protectedEvents = [];
  var tasks = new Map();
  var wanted = new Map();
  var undated = 0;
  var invalidDates = 0;
  var knownActive = ['open', 'in progress', 'waiting', 'blocked', 'pending', 'on hold'];
  var knownComplete = ['complete', 'completed', 'resolved', 'done'];

  for (var row of input.taskRows || []) {
    var id = String(row.task_id || '').trim();
    if (!id) {
      issues.push('Blank task_id skipped');
      continue;
    }
    if (!/^[\w.:-]{6,180}$/.test(id)) {
      return { ok: false, error: 'Unsafe Tasks task_id: ' + id.slice(0, 70), changes: [] };
    }
    if (tasks.has(id)) return { ok: false, error: 'Duplicate Tasks task_id: ' + id, changes: [] };
    var status = String(row.status || '').trim().toLowerCase();
    var taskRecord = { id: id, status: status, notes: String(row.notes || '') };
    tasks.set(id, taskRecord);
    if (knownComplete.indexOf(status) >= 0) continue;
    if (knownActive.indexOf(status) < 0) {
      issues.push('Unknown status, preserving Calendar reminder: ' + id + ' (' + status + ')');
      continue;
    }
    var rawDue = String(row.due_date || '').trim();
    if (!rawDue) {
      undated++;
      issues.push('Undated task, preserve current reminder: ' + id);
      continue;
    }
    var due = lvptParseTaskDate_(rawDue);
    if (!due) {
      invalidDates++;
      issues.push('Invalid task date, preserve current reminder: ' + id + ' (' + rawDue + ')');
      continue;
    }
    var action = String(row.task || '').trim();
    if (!action) return { ok: false, error: 'Open task has no title: ' + id, changes: [] };
    var eventId = String(row.event_id || '').trim();
    var company = companies[eventId] || eventId || 'LVPT';
    var category = lvptTaskCategory_(action);
    if (!calendarIds[category] || category === 'confirmed') {
      return { ok: false, error: 'Task has no placement calendar: ' + id, changes: [] };
    }
    var dueAtNine = lvptZonedTime_(due, 9, 0, cfg.reminderTimeZone);
    var overdue = due < today || dueAtNine.getTime() <= now.getTime();
    var firstDay = overdue ? lvptNextReminderDay_(now) : due;
    var start = lvptZonedTime_(firstDay, 9, 0, cfg.reminderTimeZone);
    var end = new Date(start.getTime() + 15 * 60000);
    var gmail = (taskRecord.notes.match(/https:\/\/mail\.google\.com\/mail\/[^\s|]+/) || [])[0] || '';
    var description = [
      'LVPT INTERNAL ACTION REMINDER',
      'Action: ' + action,
      'Original due date: ' + due,
      'Priority: ' + (row.priority || 'Not specified'),
      'Task ID: ' + id,
      'Client/Event ID: ' + eventId,
      'Tracker: https://docs.google.com/spreadsheets/d/' + cfg.spreadsheetId + '/edit',
      gmail ? 'Gmail thread: ' + gmail : '',
      'Set Status to Complete in the LVPT Tasks tab when the specific task is done.'
    ].filter(Boolean).join('\n');
    var body = {
      summary: ((overdue ? 'OVERDUE' : 'ACTION') + ' \u2014 ' + company + ' \u2014 ' + action).slice(0, 220),
      description: description,
      start: { dateTime: start.toISOString(), timeZone: cfg.reminderTimeZone },
      end: { dateTime: end.toISOString(), timeZone: cfg.reminderTimeZone },
      transparency: 'transparent',
      reminders: {
        useDefault: false,
        overrides: overdue ? [{ method: 'popup', minutes: 30 }] :
          [{ method: 'popup', minutes: 1440 }, { method: 'popup', minutes: 30 }]
      },
      extendedProperties: { private: {
        lvptManaged: cfg.managedTag,
        lvptTaskId: id,
        lvptDueDate: due
      } }
    };
    wanted.set(id, { id: id, due: due, overdue: overdue, calendarId: calendarIds[category], body: body });
  }

  var indexed = new Map();
  for (var item of input.events || []) {
    if (!item || !item.event || !item.event.id) continue;
    var eventKey = item.calendarId + '::' + item.event.id;
    var previous = indexed.get(eventKey);
    if (!previous || item.fromManagedQuery) indexed.set(eventKey, item);
  }
  var entriesByKey = new Map();
  var preserveOnConfirmed = new Set();
  for (var loaded of indexed.values()) {
    var inspected = lvptInspectCalendarEvent_(loaded.calendarId, loaded.event, Boolean(loaded.fromManagedQuery), cfg, calendarIds.confirmed);
    if (inspected.disposition === 'abort') {
      return { ok: false, error: inspected.error, changes: [] };
    }
    if (inspected.disposition === 'protected') {
      protectedEvents.push({
        eventId: inspected.eventId,
        calendarId: inspected.calendarId,
        classification: inspected.reason === 'attendees' ? 'customer_or_attended_event' : 'preserved_unmanaged_event',
        reason: inspected.reason,
        taskId: inspected.taskId || ''
      });
      if (inspected.reason === 'confirmed_calendar_unmanaged' && inspected.taskId) {
        preserveOnConfirmed.add(inspected.taskId);
      }
      continue;
    }
    if (inspected.disposition === 'reminder') {
      var reminder = inspected.reminder;
      entriesByKey.set(reminder.calendarId + '::' + reminder.event.id, reminder);
    }
  }

  var byTask = new Map();
  for (var found of entriesByKey.values()) {
    if (!byTask.has(found.taskId)) byTask.set(found.taskId, []);
    byTask.get(found.taskId).push(found);
  }

  var changes = [];
  var unchanged = 0;
  for (var taskEntry of tasks) {
    var taskId = taskEntry[0];
    var task = taskEntry[1];
    var target = wanted.get(taskId);
    var reminders = (byTask.get(taskId) || []).slice().sort(function (a, b) {
      return lvptReminderPriority_(a, b, target && target.calendarId);
    });
    if (!target) {
      if (knownComplete.indexOf(task.status) >= 0) {
        reminders.forEach(function (existing) {
          if (!existing.managed) {
            issues.push('Completed task left an unverified reminder in place: ' + existing.event.id);
            return;
          }
          changes.push({
            kind: 'remove',
            id: taskId,
            reminder: existing,
            classification: 'managed_internal_reminder'
          });
        });
      } else {
        unchanged += reminders.length;
      }
      continue;
    }
    if (!reminders.length) {
      if (preserveOnConfirmed.has(taskId)) {
        issues.push('Confirmed Events entry preserved; no new reminder created: ' + taskId);
        continue;
      }
      changes.push({ kind: 'create', id: taskId, target: target, classification: 'managed_internal_reminder' });
      continue;
    }
    var preferred = reminders[0];
    reminders.slice(1).forEach(function (duplicate) {
      if (!duplicate.managed || !preferred.managed) {
        issues.push('Unverified internal reminder preserved: ' + duplicate.event.id);
        return;
      }
      changes.push({
        kind: 'remove_duplicate',
        id: taskId,
        reminder: duplicate,
        classification: 'managed_internal_reminder'
      });
    });
    if (preferred.recurring) {
      if (!preferred.managed) {
        unchanged++;
        issues.push('Unverified recurring reminder preserved: ' + preferred.event.id);
      } else {
        changes.push({
          kind: 'replace_recurring',
          id: taskId,
          prior: preferred,
          target: target,
          classification: 'managed_internal_reminder'
        });
      }
    } else if (preferred.managed) {
      var previousDue = ((preferred.event.extendedProperties || {}).private || {}).lvptDueDate ||
        ((preferred.event.description || '').match(/Original due date: (\d{4}-\d{2}-\d{2})/) || [])[1] || '';
      if (preferred.calendarId !== target.calendarId || previousDue !== target.due) {
        changes.push({
          kind: 'replace_managed',
          id: taskId,
          prior: preferred,
          target: target,
          classification: 'managed_internal_reminder'
        });
      } else {
        var reasons = lvptManagedDrift_(preferred.event, target.body);
        if (reasons.length) {
          changes.push({
            kind: 'patch_managed',
            id: taskId,
            prior: preferred,
            target: target,
            reasons: reasons,
            fields: lvptPatchFields_(preferred.event, target.body, reasons, cfg.reminderTimeZone),
            classification: 'managed_internal_reminder'
          });
        } else {
          unchanged++;
        }
        if (lvptHasConference_(preferred.event)) {
          changes.push({
            kind: 'clear_conference',
            id: taskId,
            reminder: preferred,
            classification: 'managed_internal_reminder'
          });
        }
      }
    } else {
      unchanged++;
      if (lvptHasConference_(preferred.event)) {
        issues.push('Manual internal reminder has conference data; preserved: ' + taskId);
      }
    }
  }
  for (var orphan of byTask) {
    if (tasks.has(orphan[0])) continue;
    orphan[1].forEach(function (existing) {
      if (existing.managed) {
        changes.push({
          kind: 'remove_orphan_managed',
          id: orphan[0],
          reminder: existing,
          classification: 'managed_internal_reminder'
        });
      } else {
        issues.push('Unmatched manual task reminder; preserved: ' + orphan[0]);
      }
    });
  }

  var counts = {
    create: 0, replaceRecurring: 0, replaceManaged: 0, patchManaged: 0,
    remove: 0, removeDuplicate: 0, removeOrphanManaged: 0, clearConference: 0
  };
  changes.forEach(function (change) {
    change.confirmedCalendarId = calendarIds.confirmed;
    var name = change.kind.replace(/_([a-z])/g, function (_, letter) { return letter.toUpperCase(); });
    counts[name] = (counts[name] || 0) + 1;
  });
  return {
    ok: true,
    changes: changes,
    unchanged: unchanged,
    issues: issues.slice(0, 40),
    protected: protectedEvents.slice(0, 40),
    counts: counts,
    totalTaskRows: tasks.size,
    datedActiveTasks: wanted.size,
    noDueDate: undated,
    invalidDates: invalidDates,
    scannedCalendarIds: scannedCalendarIds,
    note: 'Only managed internal reminders are mutable. Customer, attended, and unmanaged Confirmed Events entries are preserved. Meet removal is identified but not sent while conferenceRestClear is false.'
  };
}

function lvptRefuseStagingWrite_(action) {
  throw new Error('LVPT staging blocked "' + action + '". No Calendar, Sheet, Gmail, or trigger change was made.');
}

function lvptApplyTaskCalendarChanges_() {
  lvptRefuseStagingWrite_('calendar apply');
}

function lvptPreflightTaskCalendarChanges_(changes) {
  (changes || []).forEach(function (change) {
    if (!change || !change.kind) throw new Error('Calendar change is incomplete');
    if (change.kind === 'create' || change.kind === 'replace_recurring' || change.kind === 'replace_managed') {
      lvptAssertSafeInternalBody_(change.target && change.target.body);
      if (change.confirmedCalendarId && change.target.calendarId === change.confirmedCalendarId) {
        throw new Error('Refusing to create an internal reminder on Confirmed Events');
      }
    }
    if (change.kind === 'replace_recurring' || change.kind === 'replace_managed' || change.kind === 'patch_managed') {
      lvptGuardReminderMutation_(change.prior);
      if (change.classification !== 'managed_internal_reminder') {
        throw new Error('Patch is limited to managed internal reminders');
      }
    }
    if (change.kind === 'clear_conference') lvptBuildConferenceClearRequest_(change);
    if (change.kind === 'remove' || change.kind === 'remove_duplicate' || change.kind === 'remove_orphan_managed') {
      lvptGuardReminderMutation_(change.reminder);
    }
  });
}

function lvptBuildConferenceClearRequest_(change) {
  lvptGuardReminderMutation_(change.reminder);
  if (!change.reminder.managed || change.classification !== 'managed_internal_reminder') {
    throw new Error('Conference cleanup is limited to managed internal reminders');
  }
  var calendarId = change.reminder.calendarId;
  var eventId = change.reminder.event.id;
  var payload = JSON.stringify({ conferenceData: null });
  if (payload !== '{"conferenceData":null}') {
    throw new Error('Conference cleanup payload lost the null field');
  }
  return {
    method: 'patch',
    calendarId: calendarId,
    eventId: eventId,
    payload: payload,
    conferenceDataVersion: 1,
    sendUpdates: 'none',
    url: 'https://www.googleapis.com/calendar/v3/calendars/'
      + encodeURIComponent(calendarId) + '/events/' + encodeURIComponent(eventId)
      + '?conferenceDataVersion=1&sendUpdates=none'
  };
}

function lvptAssertSafeInternalBody_(body) {
  if (!body || body.transparency !== 'transparent') throw new Error('Internal reminder must be Free');
  if (body.conferenceData || body.hangoutLink) throw new Error('Internal reminder must not create Meet');
  if (body.recurrence && body.recurrence.length) throw new Error('Internal reminder must not recur');
  if (body.attendees && body.attendees.length) throw new Error('Internal reminder must not invite guests');
  var minutes = lvptDurationMinutes_(body);
  if (minutes == null || minutes <= 0 || minutes > 15) throw new Error('Internal reminder exceeds 15 minutes');
}

function lvptExternalAttendees_(ev, ownerEmail) {
  var owner = String(ownerEmail || LVPT_SYNC_CONFIG.ownerEmail || '').toLowerCase();
  return (Array.isArray(ev && ev.attendees) ? ev.attendees : []).filter(function (person) {
    if (!person || typeof person !== 'object') return false;
    if (person.self === true) return false;
    var email = String(person.email || '').toLowerCase();
    if (!email) return true;
    if (email === owner) return false;
    return true;
  });
}

function lvptGuardReminderMutation_(reminder) {
  var ev = reminder && reminder.event;
  if (!ev || !ev.id) throw new Error('Missing reminder event');
  if (lvptExternalAttendees_(ev).length) {
    throw new Error('Refusing to mutate attended event ' + ev.id);
  }
  var description = String(ev.description || '').replace(/\s+/g, ' ').trim();
  if (!/^LVPT INTERNAL (?:ACTION REMINDER|ONE-TIME OWNER REMINDER)/i.test(description)) {
    throw new Error('Refusing to mutate non-internal event ' + ev.id);
  }
  if (!reminder.managed) throw new Error('Refusing to mutate an unmanaged event ' + ev.id);
}

function lvptInspectCalendarEvent_(calendarId, ev, fromManagedQuery, cfg, confirmedCalendarId) {
  if (!ev || !ev.id || ev.status === 'cancelled' || ev.recurringEventId) return { disposition: 'ignore' };
  if (lvptExternalAttendees_(ev, cfg && cfg.ownerEmail).length) {
    return { disposition: 'protected', reason: 'attendees', eventId: ev.id, calendarId: calendarId };
  }
  var normalizedDescription = String(ev.description || '').replace(/\s+/g, ' ').trim();
  var ownMarker = /^LVPT INTERNAL (?:ACTION REMINDER|ONE-TIME OWNER REMINDER)/i.test(normalizedDescription);
  var taskMatch = normalizedDescription.match(/\bTask\s+ID:\s*([A-Za-z0-9_.:-]{6,180})/i);
  var taskId = taskMatch && taskMatch[1].replace(/\.$/, '');
  var props = ((ev.extendedProperties || {}).private || {});
  var managed = props.lvptManaged === cfg.managedTag;
  var summaryOk = /^(?:ACTION|OVERDUE)\s+\u2014\s+/.test(String(ev.summary || ''));
  if (fromManagedQuery && (!managed || !ownMarker || !taskMatch || !summaryOk || props.lvptTaskId !== taskId)) {
    return { disposition: 'abort', error: 'Managed reminder is inconsistent: ' + ev.id };
  }
  if (!ownMarker || !taskMatch || !summaryOk) return { disposition: 'ignore' };
  if (managed && props.lvptTaskId !== taskId) {
    return { disposition: 'abort', error: 'Managed Task ID mismatch on Calendar event ' + ev.id };
  }
  if (calendarId === confirmedCalendarId && !managed) {
    return {
      disposition: 'protected',
      reason: 'confirmed_calendar_unmanaged',
      eventId: ev.id,
      calendarId: calendarId,
      taskId: taskId
    };
  }
  return {
    disposition: 'reminder',
    reminder: {
      taskId: taskId,
      calendarId: calendarId,
      event: ev,
      managed: managed,
      onConfirmedCalendar: calendarId === confirmedCalendarId,
      recurring: Array.isArray(ev.recurrence) && ev.recurrence.length > 0
    }
  };
}

function lvptReminderPriority_(a, b, targetCalendarId) {
  var rank = function (item) { return (item.recurring ? 4 : 0) + (item.managed ? 2 : 0); };
  var delta = rank(a) - rank(b);
  if (delta) return delta;
  var aHome = a.calendarId === targetCalendarId ? 0 : 1;
  var bHome = b.calendarId === targetCalendarId ? 0 : 1;
  if (aHome !== bHome) return aHome - bHome;
  return String(a.event.id).localeCompare(String(b.event.id));
}

function lvptHasConference_(event) {
  if (!event) return false;
  if (event.hangoutLink) return true;
  var data = event.conferenceData;
  if (!data) return false;
  if (data.conferenceId) return true;
  return Array.isArray(data.entryPoints) && data.entryPoints.length > 0;
}

function lvptDurationMinutes_(event) {
  if (!event || !event.start || !event.end || !event.start.dateTime || !event.end.dateTime) return null;
  var ms = new Date(event.end.dateTime).getTime() - new Date(event.start.dateTime).getTime();
  return Number.isFinite(ms) ? ms / 60000 : null;
}

function lvptManagedDrift_(event, targetBody) {
  var reasons = [];
  if (event.summary !== targetBody.summary) reasons.push('summary');
  if (event.description !== targetBody.description) reasons.push('description');
  if (!lvptSameReminders_(event.reminders, targetBody.reminders)) reasons.push('reminders');
  if (event.transparency !== 'transparent') reasons.push('transparency');
  var minutes = lvptDurationMinutes_(event);
  if (minutes == null || minutes <= 0 || minutes > 15) reasons.push('duration');
  return reasons;
}

function lvptPatchFields_(event, targetBody, reasons, timeZone) {
  var fields = {
    summary: targetBody.summary,
    description: targetBody.description,
    reminders: targetBody.reminders,
    extendedProperties: targetBody.extendedProperties,
    transparency: 'transparent',
    recurrence: []
  };
  if (reasons.indexOf('duration') >= 0) {
    var start = event.start && event.start.dateTime ? {
      dateTime: event.start.dateTime,
      timeZone: event.start.timeZone || timeZone
    } : targetBody.start;
    fields.start = start;
    fields.end = {
      dateTime: new Date(new Date(start.dateTime).getTime() + 15 * 60000).toISOString(),
      timeZone: start.timeZone || timeZone
    };
  }
  return fields;
}

function lvptListCalendarEvents_(calendarId, selector) {
  var result = [];
  var seenTokens = new Set();
  var pageToken = '';
  for (var page = 0; page < LVPT_SYNC_CONFIG.scanMaxPages; page++) {
    var args = Object.assign({
      singleEvents: false,
      showDeleted: false,
      maxResults: LVPT_SYNC_CONFIG.scanPageSize
    }, selector);
    if (pageToken) args.pageToken = pageToken;
    var batch = Calendar.Events.list(calendarId, args);
    if (!batch || !Array.isArray(batch.items || [])) {
      throw new Error('Calendar listing returned unusable data for ' + calendarId);
    }
    result.push.apply(result, batch.items || []);
    var next = String(batch.nextPageToken || '');
    if (!next) return result;
    if (seenTokens.has(next)) throw new Error('Repeated Calendar pagination token.');
    seenTokens.add(next);
    pageToken = next;
  }
  throw new Error('Calendar page limit reached: ' + calendarId + '. No writes made.');
}

function lvptCanonicalReferences_(notes, allowedCalendarIds) {
  var refs = [];
  var text = String(notes || '');
  var re = /canonical_calendar_id=([^\s;,]+)\s*;\s*canonical_event_id=([A-Za-z0-9_-]+)/g;
  var match;
  while ((match = re.exec(text))) {
    if (allowedCalendarIds.indexOf(match[1]) >= 0) {
      refs.push({ calendarId: match[1], eventId: match[2] });
    }
  }
  return refs.slice(-3);
}

function lvptTaskCategory_(text) {
  if (/invoice|payment|deposit|balance|vendor|ship|print|production|venue|staff|equipment|receipt|travel|reconcil|felt|room|\bav\b|documents?|upload|contract/i.test(text)) return 'operations';
  if (/proposal|quote|hold|scope selection/i.test(text)) return 'proposals';
  return 'sales';
}

function lvptParseTaskDate_(input) {
  var us = String(input || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  var iso = us ? us[3] + '-' + us[1].padStart(2, '0') + '-' + us[2].padStart(2, '0') :
    /^\d{4}-\d{2}-\d{2}$/.test(input) ? input : '';
  if (!iso) return '';
  var date = new Date(iso + 'T12:00:00Z');
  return !isNaN(date.getTime()) && date.toISOString().slice(0, 10) === iso ? iso : '';
}

function lvptFormatDay_(date, timeZone) {
  var parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);
  var get = function (type) { return parts.find(function (part) { return part.type === type; }).value; };
  return get('year') + '-' + get('month') + '-' + get('day');
}

function lvptZonedTime_(day, hour, minute, timeZone) {
  var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) throw new Error('Invalid day: ' + day);
  var year = Number(match[1]);
  var month = Number(match[2]);
  var date = Number(match[3]);
  var utcGuess = new Date(Date.UTC(year, month - 1, date, hour, minute, 0));
  var parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).formatToParts(utcGuess);
  var get = function (type) { return Number(parts.find(function (part) { return part.type === type; }).value); };
  var asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  var offset = asUtc - utcGuess.getTime();
  return new Date(Date.UTC(year, month - 1, date, hour, minute, 0) - offset);
}

function lvptNextReminderDay_(now) {
  var zone = LVPT_SYNC_CONFIG.reminderTimeZone;
  var today = lvptFormatDay_(now, zone);
  var earliest = lvptZonedTime_(today, 9, 0, zone).getTime() - 40 * 60000;
  var cursor = new Date(today + 'T12:00:00Z');
  if (cursor.getUTCDay() !== 0 && cursor.getUTCDay() !== 6 && now.getTime() < earliest) return today;
  do { cursor = new Date(cursor.getTime() + 86400000); }
  while (cursor.getUTCDay() === 0 || cursor.getUTCDay() === 6);
  return cursor.toISOString().slice(0, 10);
}

function lvptSameReminders_(a, b) {
  function norm(reminders) {
    if (!reminders) return '';
    var overrides = (reminders.overrides || []).map(function (item) {
      return item.method + ':' + item.minutes;
    }).sort();
    return String(reminders.useDefault) + '|' + overrides.join(',');
  }
  return norm(a) === norm(b);
}
