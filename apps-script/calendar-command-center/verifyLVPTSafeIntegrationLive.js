/**
 * Paste into LVPT Calendar Preview Staging as a new file.
 * Do not replace TaskSync. Do not clasp push. Do not install a trigger.
 *
 * Also add, as separate new files, the unchanged Phase 7J engine:
 *   apps-script/calendar-command-center/TaskSync.safe-review.js
 *   apps-script/calendar-command-center/TaskSync.safe-integrate.js
 *
 * Run verifyLVPTSafeIntegrationLive. This file was not executed against Google.
 * It reads through the installed staging helpers and stops. It does not call
 * the installed planner or any Calendar or Sheet writer.
 */

var LVPT_SAFE_LIVE_SUPPRESS_TASKS = [
  'id-o7d4f2t0-msgkz6li',
  'gmail-task-1a01a0153c0414d5-decisionfollowup',
  'gmail-task-1a03b1faffef9dba-bellagioprocess',
  'gmail-task-1a04fe720da18e40-clientdecision',
  'gmail-task-1a059ae0795bc721-clientdecision',
  'gmail-task-1a06f0295ab4e6bb-groupscope',
  'gmail-task-1a0a78195ff7c8a0-kristinvenetian',
  'gmail-task-1a102722f4286987-discovery',
  'gmail-task-1a19a95026eded7f-clientdecision',
  'gmail-task-1a1a7443ca3565f9-discoveryfollowup',
  'gmail-task-1a1a8b32395152af-vendorquote',
  'gmail-task-1a05f0fe9f0a382d-instructor',
  'gmail-task-1a0bada019f53ead-elevatedbilling',
  'gmail-task-1a08876d1e56e0fd-jeffpayment',
  'gmail-task-1a158ceb30c849d1-postevent',
  'gmail-task-1a17faf048bae5f1-clientdecision',
  'gmail-task-1a191299d3c0dd3d-clientdecision',
  'gmail-task-1a1564e8e21a05f3-production',
  'gmail-task-1a189f1dffa1d00f-production'
];

var LVPT_SAFE_LIVE_BUSY_TASKS = [
  'gmail-task-1a0a78195ff7c8a0-joycevenetian',
  'gmail-task-1a0feaed6e132db9-venuefeasibility',
  'gmail-task-1a1103615d047784-clientdecision',
  'gmail-task-1a16b8891d4a7770-bookingpayment',
  'gmail-task-1a17b46e09a272df-bookingpayment',
  'gmail-task-1a1bed5c2d1df7df-discoveryreply',
  'gmail-task-1a1c67469016c306-clientdecision',
  'gmail-task-1a1d76cf9dfafdc4-wynnavailability',
  'gmail-task-1a1d7503cc983f54-clientdecision',
  'gmail-task-1a1d7040c8853895-timechangeconfirm',
  'gmail-task-1a1d72076f909e47-finalpayment',
  'gmail-task-1a1d8a6f27318b66-servicerecovery',
  'gmail-task-1a1e489547ec192b-clientdecision',
  'gmail-task-1a1eae8c91203b91-pokergocall',
  'gmail-task-1a1ea80f87c9972f-tasksyncfailure',
  'gmail-task-1a1f5465289712d1-clientdecision',
  'gmail-task-1a1f5d69c2088b29-discoveryreply',
  'gmail-task-1a1f5df6298c515c-discoveryreply'
];

var LVPT_SAFE_LIVE_LEGACY_EVENTS = [
  'kg49e1cfu2o9rvtkbq0l3erdeg',
  'd0679uii6sfi6ig6metb4u21vc'
];

function lvptCompareSafeLiveBaseline_(counts, decisions) {
  var differences = [];
  function expect(name, actual, expected) {
    if (actual !== expected) {
      differences.push(name + ' is ' + actual + '. The Phase 7J synthetic baseline was ' + expected + '. The live count was not changed.');
    }
  }
  expect('suppressedCreates', counts.suppressedCreates, 19);
  expect('busyManagedReminders', counts.busyManagedReminders, 18);
  expect('unchangedManagedReminders', counts.unchangedManagedReminders, 15);
  var byTask = {};
  (decisions || []).forEach(function (row) {
    if (row && row.taskId) byTask[row.taskId] = row;
  });
  LVPT_SAFE_LIVE_SUPPRESS_TASKS.forEach(function (id) {
    var row = byTask[id];
    if (!row) differences.push(id + ' was in the 19-task suppress baseline and is not a dated active task in this read.');
    else if (row.decision !== 'SUPPRESS CREATE') differences.push(id + ' was suppressed in the synthetic baseline and is now ' + row.decision + '.');
  });
  LVPT_SAFE_LIVE_BUSY_TASKS.forEach(function (id) {
    var row = byTask[id];
    if (!row) differences.push(id + ' was in the 18 Busy baseline and is not a dated active task in this read.');
    else if (row.decision !== 'NO CHANGE' || row.transparencyHeld !== true) {
      differences.push(id + ' was a Busy managed reminder in the synthetic baseline. This read reports ' + row.decision + ', transparencyHeld ' + row.transparencyHeld + '.');
    }
  });
  return {
    syntheticBaseline: { suppressedCreates: 19, busyManagedReminders: 18, unchangedManagedReminders: 15 },
    matchesSyntheticBaseline: differences.length === 0,
    differences: differences,
    adjustedToBaseline: false
  };
}

function lvptSafeLiveRemember_(records, calendarId, event, source) {
  if (!calendarId || !event || !event.id) return false;
  var key = calendarId + '::' + event.id;
  var prior = records[key];
  if (!prior || event.status === 'cancelled') {
    records[key] = { calendarId: calendarId, event: event, source: source };
  }
  return true;
}

function lvptSafeLiveCountReminders_(records, ownerEmail) {
  var counts = {
    cancelledManagedRecords: 0,
    activeManagedReminders: 0,
    legacyReminders: 0,
    busyManagedReminders: 0,
    unchangedManagedReminders: 0
  };
  Object.keys(records).forEach(function (key) {
    var item = records[key];
    var info = lvptClassifyReminderEvent_(item.event, ownerEmail);
    if (info.role === 'cancelled_managed') counts.cancelledManagedRecords++;
    else if (info.role === 'managed') {
      counts.activeManagedReminders++;
      if (item.event.transparency === 'transparent') counts.unchangedManagedReminders++;
      else counts.busyManagedReminders++;
    } else if (info.role === 'legacy') counts.legacyReminders++;
  });
  return counts;
}

function verifyLVPTSafeIntegrationLive() {
  if (typeof LVPT_STAGING_PREVIEW_ONLY === 'undefined' || LVPT_STAGING_PREVIEW_ONLY !== true) {
    throw new Error('LVPT_STAGING_PREVIEW_ONLY is not true. No write was attempted.');
  }
  if (typeof lvptDryRunSafeDecisions_ !== 'function' || typeof lvptSafeDiscoveryQueries_ !== 'function' || typeof lvptClassifyReminderEvent_ !== 'function' || typeof lvptSelectDatedActiveTasks_ !== 'function') {
    throw new Error('Phase 7J decision engine is not loaded. No write was attempted.');
  }
  if (typeof lvptStagingReadSheet_ !== 'function' || typeof lvptListCalendarEvents_ !== 'function' || typeof lvptCanonicalReferences_ !== 'function' || typeof lvptTaskCategory_ !== 'function') {
    throw new Error('Staging read helpers are not loaded. No write was attempted.');
  }
  if (!LVPT_SAFE_REVIEW_CONFIG || LVPT_SAFE_REVIEW_CONFIG.automaticCreateEnabled !== false) {
    throw new Error('automaticCreateEnabled is not false. No write was attempted.');
  }
  var cfg = LVPT_SYNC_CONFIG;
  if (!cfg || String(cfg.ownerEmail || '').toLowerCase() !== String(LVPT_SAFE_REVIEW_CONFIG.ownerEmail || '').toLowerCase()) {
    throw new Error('Staging owner and safe-engine owner differ. No write was attempted.');
  }
  var account = String(CalendarApp.getDefaultCalendar().getId()).toLowerCase();
  if (account !== String(cfg.ownerEmail).toLowerCase()) {
    throw new Error('Wrong account: ' + account + '. Expected ' + cfg.ownerEmail + '. No write was attempted.');
  }

  var issues = [];
  var categories = ['sales', 'proposals', 'operations', 'confirmed'];
  var calendars = {};
  var calendarScan = { sales: false, proposals: false, operations: false, confirmed: false };
  var scanComplete = true;
  categories.forEach(function (category) {
    var name = cfg.calendarNames && cfg.calendarNames[category];
    var owned = name ? CalendarApp.getOwnedCalendarsByName(name) : [];
    if (!name || owned.length !== 1) {
      scanComplete = false;
      issues.push('Expected one owned calendar for ' + category + '.');
      return;
    }
    calendars[category] = owned[0].getId();
  });

  var values = lvptStagingReadSheet_(cfg.spreadsheetId, 'Tasks', 10);
  if (!values || values.length < 2) {
    throw new Error('Tasks spreadsheet data is unavailable. No write was attempted.');
  }
  var headers = values.shift().map(function (cell) { return String(cell).trim(); });
  var columns = {};
  ['task_id', 'event_id', 'task', 'due_date', 'priority', 'status', 'notes'].forEach(function (key) {
    var index = headers.indexOf(key);
    if (index < 0) throw new Error('Missing Tasks column: ' + key + '. No write was attempted.');
    columns[key] = index;
  });
  var taskRows = values.map(function (row) {
    var title = String(row[columns.task] || '').trim();
    var record = {
      task_id: row[columns.task_id],
      event_id: row[columns.event_id],
      task: title,
      due_date: row[columns.due_date],
      priority: row[columns.priority],
      status: row[columns.status],
      notes: row[columns.notes]
    };
    if (title) {
      var category = lvptTaskCategory_(title);
      if (calendars[category] && category !== 'confirmed') record.calendarId = calendars[category];
    }
    return record;
  });

  var records = {};
  var queries = lvptSafeDiscoveryQueries_(cfg.managedTag || LVPT_SAFE_REVIEW_CONFIG.managedTag);
  var selectors = queries.active.concat(queries.cancellation);
  categories.forEach(function (category) {
    var calendarId = calendars[category];
    if (!calendarId) return;
    var categoryComplete = true;
    selectors.forEach(function (selector) {
      try {
        lvptListCalendarEvents_(calendarId, selector).forEach(function (event) {
          if (!lvptSafeLiveRemember_(records, calendarId, event, selector.showDeleted === true ? 'cancelled-managed' : (selector.privateExtendedProperty ? 'managed-query' : 'text-search'))) {
            scanComplete = false;
            categoryComplete = false;
            issues.push('Calendar list returned a record without an id on ' + category + '.');
          }
        });
      } catch (error) {
        scanComplete = false;
        categoryComplete = false;
        issues.push('Calendar list did not finish for ' + category + ': ' + error);
      }
    });
    calendarScan[category] = categoryComplete;
  });

  var scanIds = categories.map(function (category) { return calendars[category]; }).filter(Boolean);
  taskRows.forEach(function (row) {
    lvptCanonicalReferences_(row.notes, scanIds).forEach(function (ref) {
      var key = ref.calendarId + '::' + ref.eventId;
      if (records[key]) return;
      var event;
      try {
        event = Calendar.Events.get(ref.calendarId, ref.eventId);
      } catch (error) {
        if (/\b(?:404|not found)\b/i.test(String(error))) {
          issues.push('Canonical event was not found for ' + row.task_id + ': ' + ref.eventId);
          return;
        }
        scanComplete = false;
        issues.push('Canonical lookup failed for ' + row.task_id + ': ' + error);
        return;
      }
      if (!event) {
        issues.push('Canonical lookup returned no event for ' + row.task_id + ': ' + ref.eventId);
        return;
      }
      if (event.status === 'cancelled') {
        issues.push('Canonical event is cancelled and is left to the managed history query: ' + ref.eventId);
        lvptSafeLiveRemember_(records, ref.calendarId, event, 'canonical-cancelled');
        return;
      }
      lvptSafeLiveRemember_(records, ref.calendarId, event, 'canonical');
    });
  });

  Object.keys(records).forEach(function (key) {
    var item = records[key];
    if (item.source !== 'managed-query') return;
    var info = lvptClassifyReminderEvent_(item.event, cfg.ownerEmail);
    if (info.role === 'ignore') issues.push('Managed query returned an unclassified event: ' + item.event.id);
  });
  LVPT_SAFE_LIVE_LEGACY_EVENTS.forEach(function (eventId) {
    var found = Object.keys(records).some(function (key) { return records[key].event.id === eventId; });
    if (!found) issues.push('Known legacy reminder was not found: ' + eventId);
  });

  var active = [];
  var cancelled = [];
  Object.keys(records).forEach(function (key) {
    var item = records[key];
    if (item.event.status === 'cancelled') cancelled.push(item);
    else active.push(item);
  });
  var reminderCounts = lvptSafeLiveCountReminders_(records, cfg.ownerEmail);
  var result = lvptDryRunSafeDecisions_({
    inventoryComplete: scanComplete,
    scanComplete: scanComplete,
    scanError: scanComplete ? '' : 'Incomplete calendar scan. No decisions were applied.',
    ownerEmail: cfg.ownerEmail,
    calendarIds: calendars,
    taskRows: taskRows,
    events: active,
    cancellationScan: {
      complete: scanComplete,
      error: scanComplete ? '' : 'Cancellation history could not be established.',
      calendarIds: scanIds,
      events: cancelled
    },
    ownerTombstones: []
  });
  var decisions = [];
  if (!scanComplete || !result || result.ok !== true) {
    if (result && result.decisions && result.decisions.length) {
      issues.push('The decision engine returned decisions for an incomplete or refused inventory. They were discarded.');
    }
    if (result && result.error) issues.push(result.error);
    decisions = [];
  } else {
    decisions = result.decisions || [];
  }
  var proposedWrites = result && result.writes ? result.writes.length : 0;
  if (proposedWrites !== 0) issues.push('The decision engine proposed ' + proposedWrites + ' writes. None were applied.');
  decisions.forEach(function (row) {
    if (!row || row.writes === 0) return;
    issues.push('Decision row for ' + row.taskId + ' carried a write count. It was not applied.');
  });

  var selectedTasks = lvptSelectDatedActiveTasks_(taskRows);
  if (decisions.length && decisions.length !== selectedTasks.datedActive.length) {
    issues.push('Decision count ' + decisions.length + ' does not match dated active tasks ' + selectedTasks.datedActive.length + '.');
  }
  var decisionCounts = { suppressedCreates: 0, reviewDecisions: 0, noChangeDecisions: 0 };
  decisions.forEach(function (row) {
    if (row.decision === 'SUPPRESS CREATE') decisionCounts.suppressedCreates++;
    else if (row.decision === 'REVIEW') decisionCounts.reviewDecisions++;
    else if (row.decision === 'NO CHANGE') decisionCounts.noChangeDecisions++;
  });
  var summary = {
    tasksRows: taskRows.length,
    datedActiveTasks: selectedTasks.datedActive.length,
    fourCalendarScanComplete: scanComplete,
    calendarScan: calendarScan,
    cancelledManagedRecords: reminderCounts.cancelledManagedRecords,
    activeManagedReminders: reminderCounts.activeManagedReminders,
    legacyReminders: reminderCounts.legacyReminders,
    suppressedCreates: decisionCounts.suppressedCreates,
    busyManagedReminders: reminderCounts.busyManagedReminders,
    unchangedManagedReminders: reminderCounts.unchangedManagedReminders,
    reviewDecisions: decisionCounts.reviewDecisions,
    noChangeDecisions: decisionCounts.noChangeDecisions,
    proposedWrites: proposedWrites,
    calendarWrites: 0,
    sheetWrites: 0,
    baseline: scanComplete && result && result.ok === true
      ? lvptCompareSafeLiveBaseline_({
        suppressedCreates: decisionCounts.suppressedCreates,
        busyManagedReminders: reminderCounts.busyManagedReminders,
        unchangedManagedReminders: reminderCounts.unchangedManagedReminders
      }, decisions)
      : {
        syntheticBaseline: { suppressedCreates: 19, busyManagedReminders: 18, unchangedManagedReminders: 15 },
        matchesSyntheticBaseline: false,
        differences: ['Baseline comparison was not applied because the inventory or decision engine did not complete.'],
        adjustedToBaseline: false
      }
  };
  console.log('LVPT_SAFE_LIVE_SUMMARY ' + JSON.stringify(summary));
  decisions.forEach(function (row) {
    console.log('LVPT_SAFE_LIVE_DECISION ' + JSON.stringify(row));
  });
  console.log('LVPT_SAFE_LIVE_ISSUES ' + JSON.stringify(issues));
  return { summary: summary, decisions: decisions, issues: issues };
}
