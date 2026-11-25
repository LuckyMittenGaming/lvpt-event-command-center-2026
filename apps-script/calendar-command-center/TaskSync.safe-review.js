/**
 * Proposed TaskSync decision core. Not approved. Not deployed.
 * Not the live hourly script. Do not clasp push this file.
 *
 * It performs no Calendar or Sheet writes and adds no OAuth scope.
 * A caller may pass events only after a complete four-calendar read.
 * Cancelled history has to be read separately with showDeleted and the
 * managed private property, on all four calendars. This file does not
 * perform that read. If that history is missing or incomplete, every
 * write is refused.
 *
 * Google can drop a cancelled event. A durable tombstone would be a new
 * store and needs a separate owner approval. This file does not add one.
 *
 * A later production caller would take the existing script lock, re-read
 * inside that lock, then call lvptPlanSafeReminderActions_ and
 * lvptGateSafeWrites_. Only the gate's allowed list can become a create.
 * Review rows are not applied. Recreating a cancelled reminder also
 * requires that task's ownerApprovedRecreation flag and a non-empty
 * recreationApprovalId. The flag does not bypass an incomplete history
 * read, a missing lock, a legacy reminder, or an attended event.
 */

var LVPT_SAFE_REVIEW_CONFIG = {
  ownerEmail: 'book@pokertraininglasvegas.com',
  managedTag: 'taskSyncV1',
  timeZone: 'America/New_York',
  // Unattended creates stay off. An in-memory tombstone does not survive
  // the next hourly run, and a durable store is not authorized.
  automaticCreateEnabled: false,
  requiredCalendars: ['sales', 'proposals', 'operations', 'confirmed'],
  mutableCalendars: ['sales', 'proposals', 'operations'],
  // Held even after the events were located, so a scan that misses them
  // still cannot create. This is not a stored tombstone and not ownership.
  unresolvedTaskIds: [
    'gmail-task-1a1564e8e21a05f3-production',
    'gmail-task-1a189f1dffa1d00f-production'
  ],
  knownLegacyReminders: {
    kg49e1cfu2o9rvtkbq0l3erdeg: {
      taskId: 'gmail-task-1a1564e8e21a05f3-production',
      calendarId: 'c_a9756e49c39a571a2c21d99524f4c226e1772fca9f0c4156e245d5fd7d941a2a@group.calendar.google.com'
    },
    d0679uii6sfi6ig6metb4u21vc: {
      taskId: 'gmail-task-1a189f1dffa1d00f-production',
      calendarId: 'c_972d7e50b66cba545967cf0f8de32d22990e6e8aa98051bdfa34b9122ed7962c@group.calendar.google.com'
    }
  }
};

function lvptCancellationHistoryQuery_() {
  return {
    showDeleted: true,
    singleEvents: false,
    privateExtendedProperty: 'lvptManaged=' + LVPT_SAFE_REVIEW_CONFIG.managedTag,
    maxResults: 250,
    pageLimit: 12
  };
}

function lvptSafeTaskIdFromDescription_(description) {
  var text = String(description || '').replace(/gmail-\s+task-/gi, 'gmail-task-');
  var match = text.match(/Task\s*ID:\s*([A-Za-z0-9_.:-]{6,180})/i);
  if (!match) match = text.match(/task_id:\s*([A-Za-z0-9_.:-]{6,180})/i);
  if (!match) return '';
  var id = match[1].replace(/\.$/, '');
  return /^[\w.:-]{6,180}$/.test(id) ? id : '';
}

function lvptLegacyDescription_(description) {
  return /INTERNAL\s+OWNER\s+REMINDER/i.test(String(description || '')) ||
    /LVPT\s+INTERNAL/i.test(String(description || ''));
}

function lvptSafeExternalAttendees_(event, ownerEmail) {
  var owner = String(ownerEmail || LVPT_SAFE_REVIEW_CONFIG.ownerEmail).toLowerCase();
  return (Array.isArray(event && event.attendees) ? event.attendees : []).filter(function (person) {
    if (!person || typeof person !== 'object') return false;
    if (person.self === true) return false;
    var email = String(person.email || '').toLowerCase();
    if (!email) return true;
    if (email === owner) return false;
    return true;
  });
}

function lvptClassifyReminderEvent_(event, ownerEmail) {
  if (!event || !event.id) return { role: 'ignore' };
  var props = ((event.extendedProperties || {}).private || {});
  var managedId = props.lvptManaged === LVPT_SAFE_REVIEW_CONFIG.managedTag ? String(props.lvptTaskId || '') : '';
  var describedId = lvptSafeTaskIdFromDescription_(event.description);
  var known = LVPT_SAFE_REVIEW_CONFIG.knownLegacyReminders[event.id];
  var taskId = managedId || describedId || (known && known.taskId) || '';
  if (lvptSafeExternalAttendees_(event, ownerEmail).length) {
    return { role: 'protected', eventId: event.id, taskId: taskId, managed: false };
  }
  if (event.status === 'cancelled') {
    if (!managedId) return { role: 'ignore', eventId: event.id };
    return { role: 'cancelled_managed', eventId: event.id, taskId: managedId, managed: true };
  }
  if (event.recurringEventId) return { role: 'ignore', eventId: event.id };
  if (managedId) return { role: 'managed', eventId: event.id, taskId: managedId, managed: true };
  if (known && event.status !== 'cancelled') {
    return { role: 'legacy', eventId: event.id, taskId: known.taskId, managed: false };
  }
  if (describedId && lvptLegacyDescription_(event.description)) {
    return { role: 'legacy', eventId: event.id, taskId: describedId, managed: false };
  }
  return { role: 'ignore', eventId: event.id };
}

function lvptSafeTaskIdentity_(task) {
  var id = String(task && (task.taskId || task.task_id) || '').trim();
  if (!/^[\w.:-]{6,180}$/.test(id)) return { ok: false, reason: 'task id is not a safe identifier' };
  var due = String(task && task.due || '').trim();
  if (!due) return { ok: false, reason: 'due date is missing', taskId: id };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) return { ok: false, reason: 'due date is not YYYY-MM-DD', taskId: id };
  var parsed = new Date(due + 'T12:00:00Z');
  if (isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== due) {
    return { ok: false, reason: 'due date is not a real calendar day', taskId: id };
  }
  return { ok: true, taskId: id, due: due };
}

function lvptMutableCalendarIds_(ids) {
  return LVPT_SAFE_REVIEW_CONFIG.mutableCalendars.map(function (name) { return ids[name]; });
}

function lvptSafeCreateBody_(task, identity) {
  var start = new Date(task.start);
  var end = new Date(start.getTime() + 15 * 60000);
  return {
    summary: String(task.summary || '').slice(0, 220),
    description: String(task.description || ''),
    start: { dateTime: start.toISOString(), timeZone: LVPT_SAFE_REVIEW_CONFIG.timeZone },
    end: { dateTime: end.toISOString(), timeZone: LVPT_SAFE_REVIEW_CONFIG.timeZone },
    transparency: 'transparent',
    recurrence: [],
    extendedProperties: {
      private: {
        lvptManaged: LVPT_SAFE_REVIEW_CONFIG.managedTag,
        lvptTaskId: identity.taskId,
        lvptDueDate: identity.due
      }
    }
  };
}

function lvptEmptyBucket_() {
  return { managed: [], legacy: [], cancelled: [], protected: [] };
}

function lvptCancellationScanOk_(input, ids) {
  var scan = input && input.cancellationScan;
  if (!scan || scan.complete !== true || scan.error) return false;
  var covered = Array.isArray(scan.calendarIds) ? scan.calendarIds : [];
  return LVPT_SAFE_REVIEW_CONFIG.requiredCalendars.every(function (name) {
    return ids[name] && covered.indexOf(ids[name]) >= 0;
  });
}

function lvptPlanSafeReminderActions_(input) {
  var cfg = LVPT_SAFE_REVIEW_CONFIG;
  var ids = input && input.calendarIds || {};
  var missing = cfg.requiredCalendars.filter(function (name) { return !ids[name]; });
  var refused = {
    ok: false,
    writes: [],
    blockedWrites: [],
    reviews: [],
    lockHeld: false,
    cancellationScanComplete: false,
    preservedLegacyEventIds: [],
    protectedEventIds: [],
    mutableCalendarIds: []
  };
  if (!input || input.scanComplete !== true || missing.length || input.scanError) {
    refused.error = input && input.scanError ? String(input.scanError) : 'Incomplete calendar scan. No writes.';
    return refused;
  }
  if (!lvptCancellationScanOk_(input, ids)) {
    refused.error = 'Cancellation history could not be established. No writes.';
    return refused;
  }
  var lockHeld = input.lockHeld === true;
  var mutable = lvptMutableCalendarIds_(ids);
  var tombstones = {};
  (input.ownerTombstones || []).forEach(function (taskId) {
    var id = String(taskId || '').trim();
    if (id) tombstones[id] = true;
  });
  var unique = {};
  function remember(item) {
    var event = item && item.event;
    if (!event || !event.id || !item.calendarId) return;
    var key = item.calendarId + '::' + event.id;
    var previous = unique[key];
    if (!previous || event.status === 'cancelled') unique[key] = item;
  }
  (input.events || []).forEach(remember);
  ((input.cancellationScan && input.cancellationScan.events) || []).forEach(remember);

  var buckets = {};
  var preservedLegacy = [];
  var protectedIds = [];
  Object.keys(unique).forEach(function (key) {
    var item = unique[key];
    var info = lvptClassifyReminderEvent_(item.event, input.ownerEmail);
    if (info.role === 'protected') {
      protectedIds.push(item.event.id);
      if (!info.taskId) return;
      if (!buckets[info.taskId]) buckets[info.taskId] = lvptEmptyBucket_();
      buckets[info.taskId].protected.push(item);
      return;
    }
    if (!info.taskId) return;
    if (!buckets[info.taskId]) buckets[info.taskId] = lvptEmptyBucket_();
    if (info.role === 'managed') buckets[info.taskId].managed.push(item);
    else if (info.role === 'legacy') {
      buckets[info.taskId].legacy.push(item);
      preservedLegacy.push(item.event.id);
    } else if (info.role === 'cancelled_managed') buckets[info.taskId].cancelled.push(item);
  });

  var writes = [];
  var reviews = [];
  var seenTasks = {};
  (input.tasks || []).forEach(function (task) {
    var id = String(task && (task.taskId || task.task_id) || '').trim();
    if (id && seenTasks[id]) {
      reviews.push({ taskId: id, action: 'REVIEW', reason: 'duplicate task id in the input; no create' });
      return;
    }
    if (id) seenTasks[id] = true;
    var status = String(task && task.status || '').toLowerCase();
    var group = buckets[id] || lvptEmptyBucket_();
    if (!/^[\w.:-]{6,180}$/.test(id)) {
      reviews.push({ taskId: id, action: 'REVIEW', reason: 'task id is not a safe identifier' });
      return;
    }
    if (task.conflict || task.stale) {
      reviews.push({ taskId: id, action: 'REVIEW', reason: 'stale or conflicting event' });
      return;
    }
    if (['complete', 'completed', 'resolved', 'done'].indexOf(status) >= 0) {
      reviews.push({ taskId: id, action: 'NO CHANGE', reason: 'completed task; reminders are not removed automatically' });
      return;
    }
    if (group.protected.length) {
      reviews.push({
        taskId: id,
        action: 'REVIEW',
        reason: 'attended or client event is protected; it is not modified and no reminder is created for it',
        eventIds: group.protected.map(function (item) { return item.event.id; })
      });
      return;
    }
    if (group.managed.length > 1) {
      reviews.push({
        taskId: id,
        action: 'REVIEW',
        reason: 'duplicate managed reminders; no automatic deletion',
        eventIds: group.managed.map(function (item) { return item.event.id; })
      });
      return;
    }
    if (group.managed.length === 1) {
      reviews.push({
        taskId: id,
        action: 'NO CREATE',
        reason: group.legacy.length ? 'managed reminder exists; legacy reminder is not modified' : 'managed reminder exists',
        eventId: group.managed[0].event.id,
        legacyEventIds: group.legacy.map(function (item) { return item.event.id; })
      });
      return;
    }
    if (group.legacy.length) {
      reviews.push({
        taskId: id,
        action: 'SUPPRESS CREATE',
        reason: 'active legacy reminder; no duplicate create and no legacy mutation',
        eventIds: group.legacy.map(function (item) { return item.event.id; })
      });
      return;
    }
    var approved = task.ownerApprovedRecreation === true && String(task.recreationApprovalId || '').trim();
    var tombstoned = tombstones[id] === true;
    if ((group.cancelled.length || tombstoned) && !approved) {
      reviews.push({
        taskId: id,
        action: 'SUPPRESS CREATE',
        reason: tombstoned && !group.cancelled.length ? 'owner tombstone; no automatic recreation' : 'cancelled managed reminder; no automatic recreation',
        eventIds: group.cancelled.map(function (item) { return item.event.id; })
      });
      return;
    }
    if (cfg.unresolvedTaskIds.indexOf(id) >= 0) {
      reviews.push({ taskId: id, action: 'SUPPRESS CREATE', reason: 'unresolved reminder history; no create' });
      return;
    }
    if (status !== 'open' && ['in progress', 'waiting', 'blocked', 'pending', 'on hold'].indexOf(status) < 0) {
      reviews.push({ taskId: id, action: 'REVIEW', reason: 'task status is not an active state' });
      return;
    }
    var identity = lvptSafeTaskIdentity_(task);
    if (!identity.ok) {
      reviews.push({ taskId: id, action: 'REVIEW', reason: identity.reason });
      return;
    }
    if (mutable.indexOf(task.calendarId) < 0) {
      reviews.push({ taskId: id, action: 'REVIEW', reason: 'target calendar is not an approved internal calendar' });
      return;
    }
    var zone = task.timeZone || cfg.timeZone;
    if (zone !== cfg.timeZone) {
      reviews.push({ taskId: id, action: 'REVIEW', reason: 'reminder timezone is not America/New_York' });
      return;
    }
    var startMs = Date.parse(task.start);
    if (!isFinite(startMs)) {
      reviews.push({ taskId: id, action: 'REVIEW', reason: 'start timestamp is invalid' });
      return;
    }
    var creationApproval = task.ownerApprovedCreate === true && String(task.creationApprovalId || '').trim();
    if (cfg.automaticCreateEnabled !== true && !approved && !creationApproval) {
      reviews.push({
        taskId: id,
        action: 'SUPPRESS CREATE',
        reason: 'automatic creation is disabled until a durable cancellation record is authorized'
      });
      return;
    }
    writes.push({
      taskId: id,
      action: 'CREATE',
      calendarId: task.calendarId,
      due: identity.due,
      replacesCancelled: group.cancelled.length > 0 || tombstoned,
      ownerApprovedRecreation: group.cancelled.length > 0 || tombstoned,
      recreationApprovalId: (group.cancelled.length || tombstoned) ? String(task.recreationApprovalId).trim() : '',
      ownerApprovedCreate: Boolean(creationApproval),
      creationApprovalId: creationApproval ? String(task.creationApprovalId).trim() : '',
      body: lvptSafeCreateBody_(task, identity)
    });
  });

  return {
    ok: true,
    error: '',
    lockHeld: lockHeld,
    cancellationScanComplete: true,
    writes: lockHeld ? writes : [],
    blockedWrites: lockHeld ? [] : writes,
    reviews: reviews,
    preservedLegacyEventIds: preservedLegacy,
    protectedEventIds: protectedIds,
    mutableCalendarIds: mutable
  };
}

function lvptUnsafeCreateReason_(change, plan) {
  if (!change || change.action !== 'CREATE') return 'write is not a create';
  var mutable = plan.mutableCalendarIds || [];
  if (!change.calendarId || mutable.indexOf(change.calendarId) < 0) return 'create calendar is not an internal calendar';
  if (!/^[\w.:-]{6,180}$/.test(String(change.taskId || ''))) return 'create task id is invalid';
  if (change.replacesCancelled === true) {
    if (change.ownerApprovedRecreation !== true || !String(change.recreationApprovalId || '').trim()) {
      return 'cancelled reminder recreation has no owner approval';
    }
  }
  if (LVPT_SAFE_REVIEW_CONFIG.automaticCreateEnabled !== true) {
    var exceptional = (change.ownerApprovedRecreation === true && String(change.recreationApprovalId || '').trim()) ||
      (change.ownerApprovedCreate === true && String(change.creationApprovalId || '').trim());
    if (!exceptional) return 'automatic creation is disabled';
  }
  var body = change.body;
  if (!body || body.transparency !== 'transparent') return 'create is not Free';
  if (body.attendees != null) return 'create includes attendees';
  if (body.conferenceData != null || body.hangoutLink != null) return 'create includes conference data';
  if (!Array.isArray(body.recurrence) || body.recurrence.length !== 0) return 'create is recurring';
  var start = body.start || {};
  var end = body.end || {};
  var startMs = Date.parse(start.dateTime);
  var endMs = Date.parse(end.dateTime);
  if (!isFinite(startMs) || !isFinite(endMs) || endMs - startMs !== 15 * 60000) return 'create duration is not 15 minutes';
  if (start.timeZone !== LVPT_SAFE_REVIEW_CONFIG.timeZone || end.timeZone !== LVPT_SAFE_REVIEW_CONFIG.timeZone) {
    return 'create timezone is not America/New_York';
  }
  var props = body.extendedProperties && body.extendedProperties.private;
  if (!props || props.lvptManaged !== LVPT_SAFE_REVIEW_CONFIG.managedTag) return 'create is missing TaskSync ownership';
  if (props.lvptTaskId !== change.taskId) return 'create task id does not match ownership';
  if (props.lvptDueDate !== change.due || !/^\d{4}-\d{2}-\d{2}$/.test(String(change.due || ''))) return 'create due date is invalid';
  return '';
}

function lvptGateSafeWrites_(plan) {
  if (!plan || plan.ok !== true) {
    return { allowed: [], refused: plan && plan.error ? plan.error : 'Plan refused. Zero writes.' };
  }
  if (plan.lockHeld !== true) return { allowed: [], refused: 'Script lock is not held. Zero writes.' };
  if (plan.cancellationScanComplete !== true) return { allowed: [], refused: 'Cancellation history is incomplete. Zero writes.' };
  var writes = plan.writes || [];
  if (!writes.length) return { allowed: [], refused: '' };
  var seen = {};
  var problems = [];
  writes.forEach(function (change) {
    var problem = lvptUnsafeCreateReason_(change, plan);
    if (problem) problems.push(problem);
    var id = change && change.taskId;
    if (id && seen[id]) problems.push('duplicate create for ' + id);
    if (id) seen[id] = true;
  });
  if (problems.length) return { allowed: [], refused: problems.join('; ') };
  var held = LVPT_SAFE_REVIEW_CONFIG.unresolvedTaskIds;
  if (writes.some(function (change) { return held.indexOf(change.taskId) >= 0; })) {
    return { allowed: [], refused: 'An unresolved task was proposed for create. Zero writes.' };
  }
  return { allowed: writes, refused: '' };
}

function lvptIdentifyHistoricalTransparencyRows_(rows) {
  var list = rows || [];
  return {
    count: list.length,
    eventIds: list.map(function (row) { return row.eventId; }),
    taskIds: list.map(function (row) { return row.taskId; }),
    writes: 0,
    usesHistoricalEtag: false
  };
}

function lvptPlanTransparencyCorrection_(rows) {
  var eligible = [];
  var held = [];
  (rows || []).forEach(function (row) {
    var reasons = row && row.reasons || [];
    var problems = [];
    if (!row || !row.eventId || !row.calendarId) problems.push('identity missing');
    if (!row || row.etagSource !== 'fresh-get' || !row.etag) problems.push('etag is not from a fresh read');
    if (!row || row.status !== 'confirmed') problems.push('status is not confirmed');
    if (!row || (row.transparency !== 'opaque' && row.transparency != null)) problems.push('transparency is not busy');
    if (!row || row.taskSyncOwned !== true || !row.taskId) problems.push('ownership not verified');
    if (row && row.externalAttendees) problems.push('external attendees');
    if (!row || row.durationMinutes !== 15) problems.push('duration is not 15 minutes');
    if (row && row.conference) problems.push('conference data');
    if (reasons.length !== 1 || reasons[0] !== 'transparency') problems.push('drift is not transparency only');
    if (problems.length) {
      held.push({ eventId: row && row.eventId || '', problems: problems });
      return;
    }
    var resource = { transparency: 'transparent' };
    if (Object.keys(resource).length !== 1) {
      held.push({ eventId: row.eventId, problems: ['body is not transparency only'] });
      return;
    }
    eligible.push({
      eventId: row.eventId,
      calendarId: row.calendarId,
      taskId: row.taskId,
      resource: resource,
      optionalArguments: { sendUpdates: 'none' },
      headers: { 'If-Match': row.etag },
      executable: false
    });
  });
  return {
    eligible: eligible,
    held: held,
    writes: 0,
    executable: false,
    block: 'Design only. A future patch would pass the fresh ETag as If-Match. This function does not call Calendar.'
  };
}
