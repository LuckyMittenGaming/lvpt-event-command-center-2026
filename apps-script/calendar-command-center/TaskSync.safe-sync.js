/**
 * Guarded LVPT TaskSync writer. Phase 7M.
 * Hourly entry: runLVPTSafeTaskSync.
 * The old runLVPTTaskSync stays retired and must not be scheduled.
 * This file does not send mail and does not install a trigger.
 * Automatic edits of existing reminders stay off. The 18 Busy reminders
 * are handled only by maintainLVPTTransparencyOnce.
 */

var LVPT_SAFE_SYNC = {
  spreadsheetId: '1oHoVdD5CDcEreyRnB7cEvYfp6wWEgAmf04BwrktkMYs',
  historySheet: 'Reminder History',
  ownerEmail: 'book@pokertraininglasvegas.com',
  timeZone: 'America/New_York',
  calendarNames: {
    sales: 'LVPT | Sales & Follow-Ups',
    proposals: 'LVPT | Proposals & Holds',
    operations: 'LVPT | Operations & Payments',
    confirmed: 'LVPT | Confirmed Events'
  },
  expectedCalendarIds: {
    sales: 'c_451b7f3ca8c727da168891a0d1d53475beb13c0c649c6157acdd98959b5cc334@group.calendar.google.com',
    proposals: 'c_e68f6233ff8a0e2fb22168ee24da99dc06e0416d652a0e1b964d3a88f5c0935b@group.calendar.google.com',
    operations: 'c_a9756e49c39a571a2c21d99524f4c226e1772fca9f0c4156e245d5fd7d941a2a@group.calendar.google.com',
    confirmed: 'c_972d7e50b66cba545967cf0f8de32d22990e6e8aa98051bdfa34b9122ed7962c@group.calendar.google.com'
  },
  pageSize: 250,
  pageLimit: 12
};

var LVPT_HISTORY_HEADERS = [
  'history_key', 'recorded_at', 'task_id', 'calendar_id', 'event_id',
  'observation', 'transaction_state', 'outcome', 'run_id', 'detail'
];

var LVPT_TRANSPARENCY_ALLOWLIST = [
  { eventId: 'bq7th2lis1p5dq0n9vv5hqmtok', calendarId: 'c_a9756e49c39a571a2c21d99524f4c226e1772fca9f0c4156e245d5fd7d941a2a@group.calendar.google.com', taskId: 'gmail-task-1a0a78195ff7c8a0-joycevenetian' },
  { eventId: 'i1bda5g9usd1pb6rnht9g7u99g', calendarId: 'c_451b7f3ca8c727da168891a0d1d53475beb13c0c649c6157acdd98959b5cc334@group.calendar.google.com', taskId: 'gmail-task-1a0feaed6e132db9-venuefeasibility' },
  { eventId: 'neen6fp4lkipntjildvlug8pag', calendarId: 'c_a9756e49c39a571a2c21d99524f4c226e1772fca9f0c4156e245d5fd7d941a2a@group.calendar.google.com', taskId: 'gmail-task-1a1103615d047784-clientdecision' },
  { eventId: '8t2f59a9clftb8grf1tgrutif4', calendarId: 'c_a9756e49c39a571a2c21d99524f4c226e1772fca9f0c4156e245d5fd7d941a2a@group.calendar.google.com', taskId: 'gmail-task-1a16b8891d4a7770-bookingpayment' },
  { eventId: 'ov3gqkv6g49meo9lbld2iad51c', calendarId: 'c_a9756e49c39a571a2c21d99524f4c226e1772fca9f0c4156e245d5fd7d941a2a@group.calendar.google.com', taskId: 'gmail-task-1a17b46e09a272df-bookingpayment' },
  { eventId: 'gvth60bvatdciotc88nmv74aa8', calendarId: 'c_451b7f3ca8c727da168891a0d1d53475beb13c0c649c6157acdd98959b5cc334@group.calendar.google.com', taskId: 'gmail-task-1a1bed5c2d1df7df-discoveryreply' },
  { eventId: 'bumn1n8p8s9cp2q27dkb1tk010', calendarId: 'c_a9756e49c39a571a2c21d99524f4c226e1772fca9f0c4156e245d5fd7d941a2a@group.calendar.google.com', taskId: 'gmail-task-1a1c67469016c306-clientdecision' },
  { eventId: '6lf2a7dte90d6040tr4qpr2gro', calendarId: 'c_451b7f3ca8c727da168891a0d1d53475beb13c0c649c6157acdd98959b5cc334@group.calendar.google.com', taskId: 'gmail-task-1a1d76cf9dfafdc4-wynnavailability' },
  { eventId: 'j38iq5k7liies0oavambdtblmo', calendarId: 'c_a9756e49c39a571a2c21d99524f4c226e1772fca9f0c4156e245d5fd7d941a2a@group.calendar.google.com', taskId: 'gmail-task-1a1d7503cc983f54-clientdecision' },
  { eventId: 'pll561gsgk28e8uldqvbtabrbg', calendarId: 'c_451b7f3ca8c727da168891a0d1d53475beb13c0c649c6157acdd98959b5cc334@group.calendar.google.com', taskId: 'gmail-task-1a1d7040c8853895-timechangeconfirm' },
  { eventId: 'pe5u1inod26kk31mcq03gvf89g', calendarId: 'c_a9756e49c39a571a2c21d99524f4c226e1772fca9f0c4156e245d5fd7d941a2a@group.calendar.google.com', taskId: 'gmail-task-1a1d72076f909e47-finalpayment' },
  { eventId: 'r7vabu23rm3d9g5crtph78eqgg', calendarId: 'c_451b7f3ca8c727da168891a0d1d53475beb13c0c649c6157acdd98959b5cc334@group.calendar.google.com', taskId: 'gmail-task-1a1d8a6f27318b66-servicerecovery' },
  { eventId: 'q8f6lsoe37bhqckicl18eftso4', calendarId: 'c_a9756e49c39a571a2c21d99524f4c226e1772fca9f0c4156e245d5fd7d941a2a@group.calendar.google.com', taskId: 'gmail-task-1a1e489547ec192b-clientdecision' },
  { eventId: '3rrgcddu2qfgek0m9qcgmqkruc', calendarId: 'c_a9756e49c39a571a2c21d99524f4c226e1772fca9f0c4156e245d5fd7d941a2a@group.calendar.google.com', taskId: 'gmail-task-1a1eae8c91203b91-pokergocall' },
  { eventId: 'dri6e13421i1dc7q8fe1c1e5ec', calendarId: 'c_451b7f3ca8c727da168891a0d1d53475beb13c0c649c6157acdd98959b5cc334@group.calendar.google.com', taskId: 'gmail-task-1a1ea80f87c9972f-tasksyncfailure' },
  { eventId: 'h2cf4q85tuurc5d3rs8jkvl1g8', calendarId: 'c_e68f6233ff8a0e2fb22168ee24da99dc06e0416d652a0e1b964d3a88f5c0935b@group.calendar.google.com', taskId: 'gmail-task-1a1f5465289712d1-clientdecision' },
  { eventId: '1khm17g8ca6kfb62tt0el3ktgk', calendarId: 'c_451b7f3ca8c727da168891a0d1d53475beb13c0c649c6157acdd98959b5cc334@group.calendar.google.com', taskId: 'gmail-task-1a1f5d69c2088b29-discoveryreply' },
  { eventId: 'sq419e6iloj79vd1st84r4n95k', calendarId: 'c_451b7f3ca8c727da168891a0d1d53475beb13c0c649c6157acdd98959b5cc334@group.calendar.google.com', taskId: 'gmail-task-1a1f5df6298c515c-discoveryreply' }
];

function lvptHistoryRow_(key, taskId, calendarId, eventId, observation, state, outcome, runId, detail, nowIso) {
  return {
    history_key: key,
    recorded_at: nowIso || '',
    task_id: taskId || '',
    calendar_id: calendarId || '',
    event_id: eventId || '',
    observation: observation,
    transaction_state: state || 'observed',
    outcome: outcome || '',
    run_id: runId || '',
    detail: String(detail || '').slice(0, 500)
  };
}

function lvptNewLedgerRows_(existingRows, proposedRows) {
  var seen = {};
  (existingRows || []).forEach(function (row) {
    if (row && row.history_key) seen[row.history_key] = true;
  });
  var fresh = [];
  (proposedRows || []).forEach(function (row) {
    if (!row || !row.history_key || seen[row.history_key]) return;
    seen[row.history_key] = true;
    fresh.push(row);
  });
  return fresh;
}

function lvptLedgerHas_(rows, observation, outcome) {
  return (rows || []).some(function (row) {
    return row.observation === observation && (!outcome || row.outcome === outcome);
  });
}

function lvptStableEventId_(taskId) {
  var digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    'lvpt-tasksync-v1:' + taskId,
    Utilities.Charset.UTF_8
  );
  var alphabet = '0123456789abcdefghijklmnopqrstuv';
  var out = 'lvpt';
  for (var i = 0; i < digest.length; i++) {
    var value = digest[i];
    if (value < 0) value += 256;
    out += alphabet[value & 31];
  }
  return out;
}

function lvptRememberSyncEvent_(records, calendarId, event) {
  if (!calendarId || !event || !event.id) return;
  var key = calendarId + '::' + event.id;
  var prior = records[key];
  if (!prior || event.status === 'cancelled') records[key] = { calendarId: calendarId, event: event };
}

function lvptBuildInitialHistory_(input) {
  var nowIso = input.nowIso || '';
  var runId = input.runId || '';
  if (!input || input.scanComplete !== true || input.cancellationComplete !== true) {
    return { ok: false, ready: false, rows: [], error: input && input.error || 'Incomplete read. History was not initialized.' };
  }
  var taskIds = input.taskIds || [];
  var seenTask = {};
  var rows = [];
  taskIds.forEach(function (taskId) {
    var id = String(taskId || '').trim();
    if (!id || seenTask[id]) return;
    seenTask[id] = true;
    rows.push(lvptHistoryRow_(
      'baseline:' + id, id, '', '', 'historical_baseline', 'confirmed', 'historical',
      runId, 'Task existed when Reminder History was initialized. It is not eligible for automatic creation.', nowIso
    ));
  });
  var records = {};
  (input.events || []).forEach(function (item) { lvptRememberSyncEvent_(records, item.calendarId, item.event); });
  Object.keys(records).forEach(function (key) {
    var item = records[key];
    var info = lvptClassifyReminderEvent_(item.event, input.ownerEmail);
    if (!info.taskId) return;
    if (info.role === 'cancelled_managed') {
      rows.push(lvptHistoryRow_(
        'cancelled:' + item.calendarId + ':' + item.event.id, info.taskId, item.calendarId, item.event.id,
        'cancelled_managed', 'confirmed', 'retained', runId,
        'Cancelled managed reminder retained as evidence. It is not restored or recreated.', nowIso
      ));
    } else if (info.role === 'managed') {
      rows.push(lvptHistoryRow_(
        'managed:' + item.calendarId + ':' + item.event.id, info.taskId, item.calendarId, item.event.id,
        'managed_association', 'confirmed', 'preserved', runId, 'Existing managed reminder preserved.', nowIso
      ));
    } else if (info.role === 'legacy') {
      rows.push(lvptHistoryRow_(
        'legacy:' + item.calendarId + ':' + item.event.id, info.taskId, item.calendarId, item.event.id,
        'legacy_association', 'confirmed', 'preserved', runId, 'Legacy reminder preserved without modification.', nowIso
      ));
    }
  });
  return {
    ok: true,
    ready: false,
    rows: rows,
    error: '',
    taskCount: Object.keys(seenTask).length,
    cancelledManagedRecords: rows.filter(function (row) { return row.observation === 'cancelled_managed'; }).length,
    managedAssociations: rows.filter(function (row) { return row.observation === 'managed_association'; }).length,
    legacyAssociations: rows.filter(function (row) { return row.observation === 'legacy_association'; }).length
  };
}

function lvptReadyHistoryRow_(built, runId, nowIso) {
  if (!built || built.ok !== true) return null;
  return lvptHistoryRow_(
    'ledger_ready', '', '', '', 'ledger_ready', 'confirmed', 'complete', runId,
    'tasks=' + built.taskCount + ' cancelled=' + built.cancelledManagedRecords +
      ' managed=' + built.managedAssociations + ' legacy=' + built.legacyAssociations,
    nowIso
  );
}

function lvptSyncTombstones_(ledger) {
  var ids = {};
  (ledger || []).forEach(function (row) {
    if (!row || !row.task_id) return;
    if (row.observation === 'historical_baseline' || row.observation === 'cancelled_managed' || row.observation === 'create_cancelled') {
      ids[row.task_id] = true;
    }
  });
  return Object.keys(ids);
}

function lvptWithAutomaticCreate_(enabled, callback) {
  var prior = LVPT_SAFE_REVIEW_CONFIG.automaticCreateEnabled;
  LVPT_SAFE_REVIEW_CONFIG.automaticCreateEnabled = enabled === true;
  try { return callback(); }
  finally { LVPT_SAFE_REVIEW_CONFIG.automaticCreateEnabled = prior; }
}

function lvptDueDrifts_(tasks, events, ownerEmail) {
  var drifts = [];
  (tasks || []).forEach(function (task) {
    (events || []).forEach(function (item) {
      var info = lvptClassifyReminderEvent_(item.event, ownerEmail);
      if (info.role !== 'managed' || info.taskId !== task.taskId) return;
      var due = (((item.event.extendedProperties || {}).private || {}).lvptDueDate) || '';
      if (due && due !== task.due) {
        drifts.push({
          taskId: task.taskId,
          eventId: item.event.id,
          calendarId: item.calendarId,
          calendarDue: due,
          taskDue: task.due
        });
      }
    });
  });
  return drifts;
}

function lvptDecideSafeSync_(input) {
  var refused = { ok: false, creates: [], dueDrifts: [], ledgerRows: [], error: 'Incomplete read. No Calendar writes.' };
  if (!input || input.scanComplete !== true || input.cancellationComplete !== true || input.lockHeld !== true) {
    refused.error = input && input.error ? input.error : refused.error;
    return refused;
  }
  var ledger = input.ledger || [];
  if (!lvptLedgerHas_(ledger, 'ledger_ready', 'complete')) {
    return { ok: false, creates: [], dueDrifts: [], ledgerRows: [], error: 'Reminder History is not initialized. No Calendar writes.' };
  }
  var writerOn = input.writerEnabled === true && lvptLedgerHas_(ledger, 'writer_enabled', 'new_tasks_only');
  var tombstones = lvptSyncTombstones_(ledger);
  var baseline = {};
  ledger.forEach(function (row) {
    if (row.observation === 'historical_baseline' && row.task_id) baseline[row.task_id] = true;
  });
  var gated = lvptWithAutomaticCreate_(writerOn, function () {
    var plan = lvptPlanSafeReminderActions_({
      scanComplete: true,
      lockHeld: true,
      calendarIds: input.calendarIds,
      cancellationScan: input.cancellationScan,
      events: input.events,
      tasks: input.tasks || [],
      ownerTombstones: tombstones,
      ownerEmail: input.ownerEmail
    });
    return { plan: plan, gate: plan.ok ? lvptGateSafeWrites_(plan) : { allowed: [], refused: plan.error } };
  });
  var plan = gated.plan;
  var gate = gated.gate;
  if (!plan.ok) return { ok: false, creates: [], dueDrifts: [], ledgerRows: [], error: plan.error || refused.error };
  if (gate.refused && (plan.writes || []).length) {
    return { ok: false, creates: [], dueDrifts: [], ledgerRows: [], error: gate.refused };
  }
  var creates = [];
  (gate.allowed || []).forEach(function (change) {
    if (baseline[change.taskId]) return;
    creates.push(change);
  });
  if ((gate.allowed || []).length !== creates.length) {
    return { ok: false, creates: [], dueDrifts: [], ledgerRows: [], error: 'A historical task was proposed for creation. No Calendar writes.' };
  }
  var nowIso = input.nowIso || '';
  var runId = input.runId || '';
  var ledgerRows = [];
  lvptDueDrifts_(input.tasks, input.events, input.ownerEmail).forEach(function (drift) {
    ledgerRows.push(lvptHistoryRow_(
      'drift:' + drift.taskId + ':' + drift.eventId + ':' + drift.taskDue,
      drift.taskId, drift.calendarId, drift.eventId, 'due_date_drift', 'reported', 'not_patched',
      runId, 'Calendar due ' + drift.calendarDue + ' differs from task due ' + drift.taskDue + '. Existing reminder was not modified.',
      nowIso
    ));
  });
  (input.events || []).forEach(function (item) {
    var info = lvptClassifyReminderEvent_(item.event, input.ownerEmail);
    if (info.role === 'cancelled_managed' && info.taskId) {
      ledgerRows.push(lvptHistoryRow_(
        'cancelled:' + item.calendarId + ':' + item.event.id, info.taskId, item.calendarId, item.event.id,
        'cancelled_managed', 'confirmed', 'retained', runId, 'Cancelled managed reminder observed. It stays suppressed.', nowIso
      ));
    }
  });
  return {
    ok: true,
    creates: creates,
    dueDrifts: lvptDueDrifts_(input.tasks, input.events, input.ownerEmail),
    ledgerRows: ledgerRows,
    error: '',
    reviews: plan.reviews || []
  };
}

function lvptOwnedReminder_(event, taskId) {
  var props = ((event || {}).extendedProperties || {}).private || {};
  return props.lvptManaged === LVPT_SAFE_REVIEW_CONFIG.managedTag && props.lvptTaskId === taskId;
}

function lvptApplyCreates_(creates, io, ledger, runId, nowIso) {
  var rows = [];
  var inserted = [];
  var confirmed = [];
  var failed = [];
  (creates || []).forEach(function (change) {
    var permanent = (ledger || []).some(function (row) {
      return row.task_id === change.taskId && row.observation === 'create_failed' && row.outcome === 'permanent';
    });
    if (permanent) {
      failed.push({ taskId: change.taskId, outcome: 'permanent', retried: false });
      return;
    }
    var eventId = lvptStableEventId_(change.taskId);
    rows.push(lvptHistoryRow_(
      'intent:' + change.taskId, change.taskId, change.calendarId, eventId,
      'create_intent', 'proposed', 'pending', runId, 'Creation intent recorded before insert.', nowIso
    ));
    var found = null;
    try {
      found = io.getEvent(change.calendarId, eventId);
    } catch (error) {
      rows.push(lvptHistoryRow_(
        'failed:' + change.taskId + ':retryable', change.taskId, change.calendarId, eventId,
        'create_failed', 'failed', 'retryable', runId, String(error && error.message || error), nowIso
      ));
      failed.push({ taskId: change.taskId, outcome: 'retryable', retried: false });
      return;
    }
    if (found && found.status === 'cancelled') {
      rows.push(lvptHistoryRow_(
        'cancelled:' + change.calendarId + ':' + found.id, change.taskId, change.calendarId, found.id,
        'create_cancelled', 'confirmed', 'suppressed', runId, 'Stable reminder is cancelled and is not recreated.', nowIso
      ));
      return;
    }
    if (found) {
      if (!lvptOwnedReminder_(found, change.taskId)) {
        rows.push(lvptHistoryRow_(
          'failed:' + change.taskId + ':permanent', change.taskId, change.calendarId, eventId,
          'create_failed', 'failed', 'permanent', runId, 'Stable event id is already used by a different event.', nowIso
        ));
        failed.push({ taskId: change.taskId, outcome: 'permanent', retried: false });
        return;
      }
      rows.push(lvptHistoryRow_(
        'confirmed:' + change.taskId + ':' + found.id, change.taskId, change.calendarId, found.id,
        'create_confirmed', 'confirmed', 'already_present', runId, 'Existing owned reminder reconciled. No insert.', nowIso
      ));
      confirmed.push({ taskId: change.taskId, eventId: found.id, created: false });
      return;
    }
    var body = JSON.parse(JSON.stringify(change.body));
    body.id = eventId;
    body.reminders = { useDefault: false };
    if (body.attendees != null || body.conferenceData != null || body.hangoutLink != null) {
      rows.push(lvptHistoryRow_(
        'failed:' + change.taskId + ':permanent', change.taskId, change.calendarId, eventId,
        'create_failed', 'failed', 'permanent', runId, 'Create body included attendees or a meeting.', nowIso
      ));
      failed.push({ taskId: change.taskId, outcome: 'permanent', retried: false });
      return;
    }
    var created = null;
    try {
      created = io.insertEvent(change.calendarId, body);
    } catch (error) {
      var reconciled = null;
      try { reconciled = io.getEvent(change.calendarId, eventId); } catch (ignored) { reconciled = null; }
      if (reconciled && lvptOwnedReminder_(reconciled, change.taskId) && reconciled.status !== 'cancelled') {
        rows.push(lvptHistoryRow_(
          'confirmed:' + change.taskId + ':' + reconciled.id, change.taskId, change.calendarId, reconciled.id,
          'create_confirmed', 'confirmed', 'reconciled_after_error', runId, 'Insert reported an error and the owned reminder was found.', nowIso
        ));
        confirmed.push({ taskId: change.taskId, eventId: reconciled.id, created: false });
        return;
      }
      rows.push(lvptHistoryRow_(
        'failed:' + change.taskId + ':retryable', change.taskId, change.calendarId, eventId,
        'create_failed', 'failed', 'retryable', runId, String(error && error.message || error), nowIso
      ));
      failed.push({ taskId: change.taskId, outcome: 'retryable', retried: false });
      return;
    }
    var createdId = created && created.id || eventId;
    rows.push(lvptHistoryRow_(
      'confirmed:' + change.taskId + ':' + createdId, change.taskId, change.calendarId, createdId,
      'create_confirmed', 'confirmed', 'created', runId, 'One Free 15-minute reminder created.', nowIso
    ));
    inserted.push({ taskId: change.taskId, eventId: createdId, created: true });
  });
  return { ledgerRows: rows, inserted: inserted, confirmed: confirmed, failed: failed };
}

function lvptTransparencyCandidate_(spec, event) {
  if (!event || event.id !== spec.eventId) {
    return { eventId: spec.eventId, calendarId: spec.calendarId, taskId: spec.taskId, reasons: ['missing'], etagSource: 'missing' };
  }
  var start = Date.parse(event.start && event.start.dateTime);
  var end = Date.parse(event.end && event.end.dateTime);
  var props = ((event.extendedProperties || {}).private || {});
  return {
    eventId: event.id,
    calendarId: spec.calendarId,
    taskId: spec.taskId,
    etag: event.etag || '',
    etagSource: 'fresh-get',
    status: event.status || 'confirmed',
    transparency: event.transparency == null || event.transparency === '' ? null : event.transparency,
    taskSyncOwned: props.lvptManaged === LVPT_SAFE_REVIEW_CONFIG.managedTag && props.lvptTaskId === spec.taskId,
    externalAttendees: lvptSafeExternalAttendees_(event, LVPT_SAFE_REVIEW_CONFIG.ownerEmail).length > 0,
    durationMinutes: isFinite(start) && isFinite(end) ? Math.round((end - start) / 60000) : 0,
    conference: Boolean(event.conferenceData || event.hangoutLink),
    reasons: ['transparency']
  };
}

function lvptExecuteTransparency_(freshEvents, io, runId, nowIso) {
  var byId = {};
  LVPT_TRANSPARENCY_ALLOWLIST.forEach(function (spec) { byId[spec.eventId] = spec; });
  var rows = LVPT_TRANSPARENCY_ALLOWLIST.map(function (spec) {
    return lvptTransparencyCandidate_(spec, freshEvents[spec.eventId]);
  });
  var plan = lvptPlanTransparencyCorrection_(rows);
  var results = [];
  var ledgerRows = [];
  (plan.held || []).forEach(function (row) {
    results.push({ eventId: row.eventId, patched: false, problems: row.problems });
    ledgerRows.push(lvptHistoryRow_(
      'transparency_skipped:' + row.eventId, '', '', row.eventId, 'transparency_skipped', 'skipped', 'not_patched',
      runId, (row.problems || []).join('; '), nowIso
    ));
  });
  (plan.eligible || []).forEach(function (item) {
    var spec = byId[item.eventId];
    if (!spec || spec.calendarId !== item.calendarId || spec.taskId !== item.taskId) {
      results.push({ eventId: item.eventId, patched: false, problems: ['not on the allowlist'] });
      return;
    }
    if (!item.resource || Object.keys(item.resource).join(',') !== 'transparency' || item.resource.transparency !== 'transparent') {
      results.push({ eventId: item.eventId, patched: false, problems: ['body is not transparency only'] });
      return;
    }
    try {
      io.patchEvent(item.calendarId, item.eventId, item.resource, item.optionalArguments, item.headers);
      results.push({ eventId: item.eventId, patched: true });
      ledgerRows.push(lvptHistoryRow_(
        'transparency:' + item.eventId, item.taskId, item.calendarId, item.eventId,
        'transparency_corrected', 'confirmed', 'patched', runId, 'If-Match patch changed only transparency to transparent.', nowIso
      ));
    } catch (error) {
      results.push({ eventId: item.eventId, patched: false, problems: [String(error && error.message || error)] });
      ledgerRows.push(lvptHistoryRow_(
        'transparency_skipped:' + item.eventId, item.taskId, item.calendarId, item.eventId,
        'transparency_skipped', 'failed', 'not_patched', runId, String(error && error.message || error), nowIso
      ));
    }
  });
  return { results: results, ledgerRows: ledgerRows, patched: results.filter(function (row) { return row.patched; }).length };
}

function lvptSafeSyncRunId_() {
  return 'sync-' + Utilities.formatDate(new Date(), LVPT_SAFE_SYNC.timeZone, 'yyyyMMdd-HHmmss');
}

function lvptSafeSyncNowIso_() {
  return new Date().toISOString();
}

function lvptSafeSyncLock_(callback) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('Another LVPT safe task sync is running. No writes were made.');
  try { return callback(); }
  finally { lock.releaseLock(); }
}

function lvptSafeSyncCalendarIds_() {
  var account = String(CalendarApp.getDefaultCalendar().getId()).toLowerCase();
  if (account !== LVPT_SAFE_SYNC.ownerEmail) throw new Error('Wrong account: ' + account);
  var ids = {};
  Object.keys(LVPT_SAFE_SYNC.calendarNames).forEach(function (name) {
    var label = LVPT_SAFE_SYNC.calendarNames[name];
    var owned = CalendarApp.getOwnedCalendarsByName(label);
    if (owned.length !== 1) throw new Error('Expected one owned calendar: ' + label);
    var id = owned[0].getId();
    if (id !== LVPT_SAFE_SYNC.expectedCalendarIds[name]) throw new Error('Calendar id mismatch: ' + label);
    ids[name] = id;
  });
  return ids;
}

function lvptSafeSyncList_(calendarId, selector) {
  var events = [];
  var token = '';
  var seen = {};
  for (var page = 0; page < LVPT_SAFE_SYNC.pageLimit; page++) {
    var args = { maxResults: LVPT_SAFE_SYNC.pageSize, singleEvents: false };
    Object.keys(selector || {}).forEach(function (key) { args[key] = selector[key]; });
    if (token) args.pageToken = token;
    var batch = Calendar.Events.list(calendarId, args);
    if (!batch || !Array.isArray(batch.items)) throw new Error('Calendar listing returned unusable data for ' + calendarId);
    events = events.concat(batch.items);
    if (!batch.nextPageToken) return events;
    if (seen[batch.nextPageToken]) throw new Error('Repeated Calendar pagination token for ' + calendarId);
    seen[batch.nextPageToken] = true;
    token = batch.nextPageToken;
  }
  throw new Error('Calendar page limit reached for ' + calendarId + '. No writes made.');
}

function lvptSafeSyncReadEvents_(calendarIds) {
  var queries = lvptSafeDiscoveryQueries_(LVPT_SAFE_REVIEW_CONFIG.managedTag);
  var events = [];
  var scan = { sales: false, proposals: false, operations: false, confirmed: false };
  Object.keys(calendarIds).forEach(function (name) {
    queries.active.forEach(function (selector) {
      lvptSafeSyncList_(calendarIds[name], selector).forEach(function (event) {
        events.push({ calendarId: calendarIds[name], event: event });
      });
    });
    queries.cancellation.forEach(function (selector) {
      lvptSafeSyncList_(calendarIds[name], selector).forEach(function (event) {
        events.push({ calendarId: calendarIds[name], event: event });
      });
    });
    scan[name] = true;
  });
  return { events: events, scan: scan, complete: scan.sales && scan.proposals && scan.operations && scan.confirmed };
}

function lvptSafeSyncReadSheetRows_() {
  var ss = SpreadsheetApp.openById(LVPT_SAFE_SYNC.spreadsheetId);
  var tasksSheet = ss.getSheetByName('Tasks');
  var eventsSheet = ss.getSheetByName('Events');
  if (!tasksSheet || !eventsSheet || tasksSheet.getLastRow() < 2) {
    throw new Error('Tasks or Events spreadsheet data is unavailable.');
  }
  var values = tasksSheet.getRange(1, 1, tasksSheet.getLastRow(), 10).getDisplayValues();
  var headers = values.shift().map(function (cell) { return String(cell).trim(); });
  var columns = {};
  ['task_id', 'event_id', 'task', 'due_date', 'priority', 'status', 'notes'].forEach(function (key) {
    columns[key] = headers.indexOf(key);
    if (columns[key] < 0) throw new Error('Missing Tasks column: ' + key);
  });
  var companies = {};
  var eventValues = eventsSheet.getRange(1, 1, Math.max(eventsSheet.getLastRow(), 1), 3).getDisplayValues();
  eventValues.slice(1).forEach(function (row) {
    if (row[0]) companies[row[0]] = row[2] || row[1] || row[0];
  });
  var rows = [];
  var seen = {};
  values.forEach(function (row) {
    var id = String(row[columns.task_id] || '').trim();
    if (!id) return;
    if (seen[id]) throw new Error('Duplicate Tasks task_id: ' + id);
    seen[id] = true;
    rows.push({
      task_id: id,
      event_id: String(row[columns.event_id] || '').trim(),
      task: String(row[columns.task] || '').trim(),
      due_date: String(row[columns.due_date] || '').trim(),
      priority: String(row[columns.priority] || '').trim(),
      status: String(row[columns.status] || '').trim(),
      notes: String(row[columns.notes] || '')
    });
  });
  return { rows: rows, companies: companies };
}

function lvptSafeSyncCategory_(text) {
  if (/invoice|payment|deposit|balance|vendor|ship|print|production|venue|staff|equipment|receipt|travel|reconcil|felt|room|\bav\b|documents?|upload|contract/i.test(text)) return 'operations';
  if (/proposal|quote|hold|scope selection/i.test(text)) return 'proposals';
  return 'sales';
}

function lvptSafeSyncParseDate_(input) {
  var text = String(input || '').trim();
  var us = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  var iso = us ? us[3] + '-' + ('0' + us[1]).slice(-2) + '-' + ('0' + us[2]).slice(-2) : (/^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '');
  if (!iso) return '';
  var date = new Date(iso + 'T12:00:00Z');
  return !isNaN(date.getTime()) && date.toISOString().slice(0, 10) === iso ? iso : '';
}

function lvptSafeSyncStartIso_(due, now) {
  var zone = LVPT_SAFE_SYNC.timeZone;
  var today = Utilities.formatDate(now, zone, 'yyyy-MM-dd');
  var dueSlot = Utilities.parseDate(due + ' 09:00', zone, 'yyyy-MM-dd HH:mm');
  var day = due;
  if (due < today || dueSlot.getTime() <= now.getTime()) {
    var cursor = new Date(today + 'T12:00:00Z');
    var earliest = Utilities.parseDate(today + ' 09:00', zone, 'yyyy-MM-dd HH:mm').getTime() - 40 * 60000;
    if (cursor.getUTCDay() === 0 || cursor.getUTCDay() === 6 || now.getTime() >= earliest) {
      do { cursor = new Date(cursor.getTime() + 86400000); }
      while (cursor.getUTCDay() === 0 || cursor.getUTCDay() === 6);
    }
    day = cursor.toISOString().slice(0, 10);
  }
  return Utilities.parseDate(day + ' 09:00', zone, 'yyyy-MM-dd HH:mm').toISOString();
}

function lvptSafeSyncShapeTasks_(sheet, calendarIds, now) {
  var active = ['open', 'in progress', 'waiting', 'blocked', 'pending', 'on hold'];
  var shaped = [];
  sheet.rows.forEach(function (row) {
    var status = row.status.toLowerCase();
    if (active.indexOf(status) < 0) return;
    var due = lvptSafeSyncParseDate_(row.due_date);
    if (!due) return;
    var category = lvptSafeSyncCategory_(row.task);
    var company = sheet.companies[row.event_id] || row.event_id || 'LVPT';
    shaped.push({
      taskId: row.task_id,
      status: status,
      due: due,
      start: lvptSafeSyncStartIso_(due, now),
      timeZone: LVPT_SAFE_SYNC.timeZone,
      calendarId: calendarIds[category],
      summary: ('ACTION — ' + company + ' — ' + row.task).slice(0, 220),
      description: [
        'LVPT INTERNAL ACTION REMINDER',
        'Action: ' + row.task,
        'Original due date: ' + due,
        'Priority: ' + (row.priority || 'Not specified'),
        'Task ID: ' + row.task_id,
        'Client/Event ID: ' + row.event_id,
        'Set Status to Complete in the LVPT Tasks tab when the specific task is done.'
      ].join('\n')
    });
  });
  return shaped;
}

function lvptSafeSyncCanonicalEvents_(sheet, calendarIds, events) {
  var allowed = Object.keys(calendarIds).map(function (name) { return calendarIds[name]; });
  var text = '';
  sheet.rows.forEach(function (row) { text += '\n' + row.notes; });
  var match;
  var re = /canonical_calendar_id=([^\s;,]+)\s*;\s*canonical_event_id=([A-Za-z0-9_-]+)/g;
  var added = 0;
  while ((match = re.exec(text))) {
    if (allowed.indexOf(match[1]) < 0) continue;
    try {
      var event = Calendar.Events.get(match[1], match[2]);
      if (event && event.status !== 'cancelled') {
        events.push({ calendarId: match[1], event: event });
        added++;
      }
    } catch (error) {
      var message = String(error && error.message || error);
      if (!/not found|404/i.test(message)) throw error;
    }
  }
  return added;
}

function lvptSafeSyncSheet_(name) {
  var ss = SpreadsheetApp.openById(LVPT_SAFE_SYNC.spreadsheetId);
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.getRange(1, 1, 1, LVPT_HISTORY_HEADERS.length).setValues([LVPT_HISTORY_HEADERS]);
  }
  return sheet;
}

function lvptSafeSyncReadLedger_(sheet) {
  var last = sheet.getLastRow();
  if (last < 2) return [];
  var values = sheet.getRange(2, 1, last - 1, LVPT_HISTORY_HEADERS.length).getValues();
  return values.filter(function (row) { return row[0]; }).map(function (row) {
    var item = {};
    LVPT_HISTORY_HEADERS.forEach(function (header, index) { item[header] = row[index] == null ? '' : String(row[index]); });
    return item;
  });
}

function lvptSafeSyncAppend_(sheet, rows) {
  var existing = lvptSafeSyncReadLedger_(sheet);
  var fresh = lvptNewLedgerRows_(existing, rows);
  if (!fresh.length) return 0;
  var values = fresh.map(function (row) {
    return LVPT_HISTORY_HEADERS.map(function (header) { return row[header] || ''; });
  });
  sheet.getRange(sheet.getLastRow() + 1, 1, fresh.length, LVPT_HISTORY_HEADERS.length).setValues(values);
  return fresh.length;
}

function lvptSafeSyncProductionIo_(calendarIds) {
  var mutable = [calendarIds.sales, calendarIds.proposals, calendarIds.operations];
  return {
    getEvent: function (calendarId, eventId) {
      try {
        return Calendar.Events.get(calendarId, eventId);
      } catch (error) {
        var message = String(error && error.message || error);
        if (/not found|404/i.test(message)) return null;
        throw error;
      }
    },
    insertEvent: function (calendarId, body) {
      if (mutable.indexOf(calendarId) < 0) throw new Error('Refusing insert outside an internal LVPT calendar.');
      return Calendar.Events.insert(body, calendarId, { sendUpdates: 'none' });
    },
    patchEvent: function (calendarId, eventId, resource, optionalArguments, headers) {
      return Calendar.Events.patch(resource, calendarId, eventId, optionalArguments || { sendUpdates: 'none' }, headers);
    }
  };
}

function lvptSafeSyncInventory_() {
  var calendarIds = lvptSafeSyncCalendarIds_();
  var read = lvptSafeSyncReadEvents_(calendarIds);
  if (!read.complete) throw new Error('Incomplete four-calendar scan. No writes made.');
  var sheet = lvptSafeSyncReadSheetRows_();
  lvptSafeSyncCanonicalEvents_(sheet, calendarIds, read.events);
  var now = new Date();
  return {
    calendarIds: calendarIds,
    events: read.events,
    sheet: sheet,
    tasks: lvptSafeSyncShapeTasks_(sheet, calendarIds, now),
    now: now
  };
}

function previewLVPTSafeTaskSync() {
  var inventory = lvptSafeSyncInventory_();
  var ledgerSheet = SpreadsheetApp.openById(LVPT_SAFE_SYNC.spreadsheetId).getSheetByName(LVPT_SAFE_SYNC.historySheet);
  var ledger = ledgerSheet ? lvptSafeSyncReadLedger_(ledgerSheet) : [];
  var decision = lvptDecideSafeSync_({
    scanComplete: true,
    cancellationComplete: true,
    lockHeld: true,
    writerEnabled: lvptLedgerHas_(ledger, 'writer_enabled', 'new_tasks_only'),
    ledger: ledger,
    calendarIds: inventory.calendarIds,
    cancellationScan: { complete: true, calendarIds: Object.keys(inventory.calendarIds).map(function (name) { return inventory.calendarIds[name]; }), events: inventory.events },
    events: inventory.events,
    tasks: inventory.tasks,
    ownerEmail: LVPT_SAFE_SYNC.ownerEmail,
    nowIso: inventory.now.toISOString(),
    runId: 'preview'
  });
  var summary = {
    preview: true,
    calendarWrites: 0,
    sheetWrites: 0,
    tasksRows: inventory.sheet.rows.length,
    datedActiveTasks: inventory.tasks.length,
    historicalBaselines: ledger.filter(function (row) { return row.observation === 'historical_baseline'; }).length,
    proposedCreates: decision.ok ? decision.creates.length : 0,
    dueDrifts: decision.ok ? decision.dueDrifts.length : 0,
    writerEnabled: lvptLedgerHas_(ledger, 'writer_enabled', 'new_tasks_only'),
    ledgerReady: lvptLedgerHas_(ledger, 'ledger_ready', 'complete'),
    ok: decision.ok,
    error: decision.error || ''
  };
  console.log('LVPT_SAFE_SYNC_PREVIEW ' + JSON.stringify(summary));
  (decision.creates || []).forEach(function (change) {
    console.log('LVPT_SAFE_SYNC_PROPOSED_CREATE ' + JSON.stringify({ taskId: change.taskId, calendarId: change.calendarId }));
  });
  return summary;
}

function initializeLVPTReminderHistory() {
  return lvptSafeSyncLock_(function () {
    var runId = lvptSafeSyncRunId_();
    var nowIso = lvptSafeSyncNowIso_();
    var inventory;
    try {
      inventory = lvptSafeSyncInventory_();
    } catch (error) {
      console.error('LVPT_SAFE_SYNC_INIT_FAILED ' + String(error && error.message || error));
      throw error;
    }
    var built = lvptBuildInitialHistory_({
      scanComplete: true,
      cancellationComplete: true,
      taskIds: inventory.sheet.rows.map(function (row) { return row.task_id; }),
      events: inventory.events,
      ownerEmail: LVPT_SAFE_SYNC.ownerEmail,
      runId: runId,
      nowIso: nowIso
    });
    if (!built.ok) throw new Error(built.error);
    var ready = lvptReadyHistoryRow_(built, runId, nowIso);
    var sheet = lvptSafeSyncSheet_(LVPT_SAFE_SYNC.historySheet);
    var appended = lvptSafeSyncAppend_(sheet, built.rows.concat([ready]));
    var summary = {
      initialized: true,
      calendarWrites: 0,
      rowsAppended: appended,
      taskCount: built.taskCount,
      cancelledManagedRecords: built.cancelledManagedRecords,
      managedAssociations: built.managedAssociations,
      legacyAssociations: built.legacyAssociations,
      writerEnabled: false
    };
    console.log('LVPT_SAFE_SYNC_INIT ' + JSON.stringify(summary));
    return summary;
  });
}

function runLVPTSafeTaskSync() {
  return lvptSafeSyncLock_(function () {
    var runId = lvptSafeSyncRunId_();
    var nowIso = lvptSafeSyncNowIso_();
    var inventory = lvptSafeSyncInventory_();
    var sheet = SpreadsheetApp.openById(LVPT_SAFE_SYNC.spreadsheetId).getSheetByName(LVPT_SAFE_SYNC.historySheet);
    if (!sheet) throw new Error('Reminder History is missing. No Calendar writes.');
    var ledger = lvptSafeSyncReadLedger_(sheet);
    var decision = lvptDecideSafeSync_({
      scanComplete: true,
      cancellationComplete: true,
      lockHeld: true,
      writerEnabled: true,
      ledger: ledger,
      calendarIds: inventory.calendarIds,
      cancellationScan: { complete: true, calendarIds: Object.keys(inventory.calendarIds).map(function (name) { return inventory.calendarIds[name]; }), events: inventory.events },
      events: inventory.events,
      tasks: inventory.tasks,
      ownerEmail: LVPT_SAFE_SYNC.ownerEmail,
      nowIso: nowIso,
      runId: runId
    });
    if (!decision.ok) throw new Error(decision.error || 'Safe sync refused. No Calendar writes.');
    var applied = lvptApplyCreates_(decision.creates, lvptSafeSyncProductionIo_(inventory.calendarIds), ledger, runId, nowIso);
    var appended = lvptSafeSyncAppend_(sheet, decision.ledgerRows.concat(applied.ledgerRows));
    var summary = {
      runId: runId,
      calendarWrites: applied.inserted.length,
      reconciled: applied.confirmed.length,
      failed: applied.failed.length,
      dueDrifts: decision.dueDrifts.length,
      rowsAppended: appended,
      deletes: 0,
      patches: 0,
      replaces: 0
    };
    console.log('LVPT_SAFE_SYNC_RUN ' + JSON.stringify(summary));
    decision.dueDrifts.forEach(function (drift) {
      console.log('LVPT_SAFE_SYNC_DUE_DRIFT ' + JSON.stringify(drift));
    });
    if (applied.failed.some(function (row) { return row.outcome === 'retryable'; })) {
      throw new Error('One or more reminder creates failed after the ledger was updated. They were not retried in this run.');
    }
    return summary;
  });
}

function enableLVPTNewTaskWriter() {
  return lvptSafeSyncLock_(function () {
    var sheet = SpreadsheetApp.openById(LVPT_SAFE_SYNC.spreadsheetId).getSheetByName(LVPT_SAFE_SYNC.historySheet);
    if (!sheet) throw new Error('Reminder History is missing.');
    var ledger = lvptSafeSyncReadLedger_(sheet);
    if (!lvptLedgerHas_(ledger, 'ledger_ready', 'complete')) throw new Error('Ledger is not ready.');
    if (!lvptLedgerHas_(ledger, 'isolated_proof', 'pass')) throw new Error('Isolated create proof has not passed.');
    var inventory = lvptSafeSyncInventory_();
    var simulated = ledger.concat([lvptHistoryRow_(
      'writer_enabled', '', '', '', 'writer_enabled', 'confirmed', 'new_tasks_only', 'enable-check', '', lvptSafeSyncNowIso_()
    )]);
    var decision = lvptDecideSafeSync_({
      scanComplete: true,
      cancellationComplete: true,
      lockHeld: true,
      writerEnabled: true,
      ledger: simulated,
      calendarIds: inventory.calendarIds,
      cancellationScan: {
        complete: true,
        calendarIds: Object.keys(inventory.calendarIds).map(function (name) { return inventory.calendarIds[name]; }),
        events: inventory.events
      },
      events: inventory.events,
      tasks: inventory.tasks,
      ownerEmail: LVPT_SAFE_SYNC.ownerEmail,
      nowIso: lvptSafeSyncNowIso_(),
      runId: 'enable-check'
    });
    if (!decision.ok || decision.creates.length !== 0) {
      throw new Error('Current tasks still propose creates. Writer stays disabled.');
    }
    var appended = lvptSafeSyncAppend_(sheet, [lvptHistoryRow_(
      'writer_enabled', '', '', '', 'writer_enabled', 'confirmed', 'new_tasks_only',
      lvptSafeSyncRunId_(), 'Automatic creation is limited to tasks absent from the historical baseline.', lvptSafeSyncNowIso_()
    )]);
    var summary = { writerEnabled: true, rowsAppended: appended, proposedCreates: decision.creates.length };
    console.log('LVPT_SAFE_SYNC_WRITER ' + JSON.stringify(summary));
    return summary;
  });
}

function maintainLVPTTransparencyOnce() {
  return lvptSafeSyncLock_(function () {
    var calendarIds = lvptSafeSyncCalendarIds_();
    var io = lvptSafeSyncProductionIo_(calendarIds);
    var fresh = {};
    LVPT_TRANSPARENCY_ALLOWLIST.forEach(function (spec) {
      if (spec.calendarId !== calendarIds.sales && spec.calendarId !== calendarIds.proposals && spec.calendarId !== calendarIds.operations) {
        throw new Error('Allowlist calendar is not an internal LVPT calendar: ' + spec.eventId);
      }
      fresh[spec.eventId] = io.getEvent(spec.calendarId, spec.eventId);
    });
    var executed = lvptExecuteTransparency_(fresh, io, lvptSafeSyncRunId_(), lvptSafeSyncNowIso_());
    var sheet = lvptSafeSyncSheet_(LVPT_SAFE_SYNC.historySheet);
    var appended = lvptSafeSyncAppend_(sheet, executed.ledgerRows);
    var summary = { patched: executed.patched, skipped: executed.results.length - executed.patched, rowsAppended: appended, results: executed.results };
    console.log('LVPT_SAFE_SYNC_TRANSPARENCY ' + JSON.stringify(summary));
    return summary;
  });
}

function runLVPTIsolatedSyncProof() {
  var createdCalendar = null;
  var proofSheet = null;
  var ss = SpreadsheetApp.openById(LVPT_SAFE_SYNC.spreadsheetId);
  try {
    createdCalendar = CalendarApp.createCalendar('LVPT TaskSync Isolated Proof');
    var testId = createdCalendar.getId();
    proofSheet = ss.insertSheet('Reminder History Isolated Proof');
    proofSheet.getRange(1, 1, 1, LVPT_HISTORY_HEADERS.length).setValues([LVPT_HISTORY_HEADERS]);
    var taskId = 'lvpt-isolated-proof-' + Utilities.formatDate(new Date(), LVPT_SAFE_SYNC.timeZone, 'yyyyMMddHHmmss');
    var due = '2026-12-15';
    var calendarIds = {
      sales: testId,
      proposals: LVPT_SAFE_SYNC.expectedCalendarIds.proposals,
      operations: LVPT_SAFE_SYNC.expectedCalendarIds.operations,
      confirmed: LVPT_SAFE_SYNC.expectedCalendarIds.confirmed
    };
    var task = {
      taskId: taskId,
      status: 'open',
      due: due,
      start: '2026-12-15T14:00:00.000Z',
      timeZone: 'America/New_York',
      calendarId: testId,
      summary: 'ACTION — LVPT — isolated proof',
      description: 'LVPT INTERNAL ACTION REMINDER\nTask ID: ' + taskId
    };
    var ledger = [
      lvptHistoryRow_('ledger_ready', '', '', '', 'ledger_ready', 'confirmed', 'complete', 'proof', '', new Date().toISOString()),
      lvptHistoryRow_('writer_enabled', '', '', '', 'writer_enabled', 'confirmed', 'new_tasks_only', 'proof', '', new Date().toISOString())
    ];
    var scan = { complete: true, calendarIds: [testId, calendarIds.proposals, calendarIds.operations, calendarIds.confirmed], events: [] };
    var io = {
      getEvent: function (calendarId, eventId) {
        if (calendarId !== testId) throw new Error('Isolated proof refused a read outside the test calendar.');
        try { return Calendar.Events.get(calendarId, eventId); }
        catch (error) {
          if (/not found|404/i.test(String(error && error.message || error))) return null;
          throw error;
        }
      },
      insertEvent: function (calendarId, body) {
        if (calendarId !== testId) throw new Error('Isolated proof refused an insert outside the test calendar.');
        return Calendar.Events.insert(body, calendarId, { sendUpdates: 'none' });
      }
    };
    function decide(events) {
      return lvptDecideSafeSync_({
        scanComplete: true,
        cancellationComplete: true,
        lockHeld: true,
        writerEnabled: true,
        ledger: ledger,
        calendarIds: calendarIds,
        cancellationScan: scan,
        events: events,
        tasks: [task],
        ownerEmail: LVPT_SAFE_SYNC.ownerEmail,
        nowIso: new Date().toISOString(),
        runId: 'proof'
      });
    }
    var first = decide([]);
    if (!first.ok || first.creates.length !== 1) throw new Error('Isolated proof did not propose one create.');
    var applied = lvptApplyCreates_(first.creates, io, ledger, 'proof', new Date().toISOString());
    if (applied.inserted.length !== 1) throw new Error('Isolated proof did not create one reminder.');
    ledger = ledger.concat(applied.ledgerRows);
    var eventId = applied.inserted[0].eventId;
    var created = Calendar.Events.get(testId, eventId);
    if (!created || created.transparency !== 'transparent') throw new Error('Isolated reminder was not Free.');
    var duration = Date.parse(created.end.dateTime) - Date.parse(created.start.dateTime);
    if (duration !== 15 * 60000) throw new Error('Isolated reminder was not 15 minutes.');
    if (created.attendees && created.attendees.length) throw new Error('Isolated reminder had attendees.');
    var second = decide([{ calendarId: testId, event: created }]);
    var appliedAgain = lvptApplyCreates_(second.creates, io, ledger, 'proof-2', new Date().toISOString());
    if (appliedAgain.inserted.length !== 0) throw new Error('Second proof run created another reminder.');
    Calendar.Events.patch({ status: 'cancelled' }, testId, eventId, { sendUpdates: 'none' });
    var cancelled = Calendar.Events.get(testId, eventId);
    ledger.push(lvptHistoryRow_(
      'cancelled:' + testId + ':' + eventId, taskId, testId, eventId,
      'cancelled_managed', 'confirmed', 'retained', 'proof', 'Isolated reminder cancelled for the recreation test.', new Date().toISOString()
    ));
    var third = decide([{ calendarId: testId, event: cancelled }]);
    var appliedThird = lvptApplyCreates_(third.creates, io, ledger, 'proof-3', new Date().toISOString());
    if (third.creates.length !== 0 || appliedThird.inserted.length !== 0) throw new Error('Cancelled isolated reminder was recreated.');
    var listed = Calendar.Events.list(testId, { privateExtendedProperty: 'lvptManaged=taskSyncV1', showDeleted: true });
    var stillThere = (listed.items || []).filter(function (event) { return event.status !== 'cancelled'; });
    if (stillThere.length !== 0) throw new Error('Isolated calendar still has an active reminder.');
    createdCalendar.deleteCalendar();
    createdCalendar = null;
    ss.deleteSheet(proofSheet);
    proofSheet = null;
    var productionSheet = lvptSafeSyncSheet_(LVPT_SAFE_SYNC.historySheet);
    lvptSafeSyncAppend_(productionSheet, [lvptHistoryRow_(
      'isolated_proof', taskId, '', '', 'isolated_proof', 'confirmed', 'pass',
      lvptSafeSyncRunId_(), 'Isolated calendar created one Free reminder, a second run added none, and cancellation was not recreated. Test artifacts were removed.',
      lvptSafeSyncNowIso_()
    )]);
    var summary = { pass: true, taskId: taskId, eventId: eventId, activeRemindersAfterCleanup: 0 };
    console.log('LVPT_SAFE_SYNC_PROOF ' + JSON.stringify(summary));
    return summary;
  } catch (error) {
    if (createdCalendar) {
      try { createdCalendar.deleteCalendar(); } catch (ignored) {}
    }
    if (proofSheet) {
      try { ss.deleteSheet(proofSheet); } catch (ignored) {}
    }
    console.error('LVPT_SAFE_SYNC_PROOF_FAILED ' + String(error && error.message || error));
    throw error;
  }
}
