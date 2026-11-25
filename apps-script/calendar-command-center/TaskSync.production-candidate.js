/**
 * Undeployed production TaskSync candidate. Phase 7L.
 * Do not clasp push. Do not replace the live TaskSync.gs. Do not add a trigger.
 *
 * The scheduled path is previewLVPTProductionCandidate. It reads through the
 * helpers already authorized in LVPT Calendar Preview Staging and calls the
 * Phase 7K decision engine. It does not call the installed planner.
 *
 * runLVPTProductionCandidate returns before a lock, a read, or a Calendar
 * call. LVPT_PRODUCTION_CANDIDATE_WRITES_ENABLED stays false. Automatic
 * creation stays false in the decision engine. This file contains no
 * Calendar or Sheet writer.
 *
 * A later approved writer would take LockService.getScriptLock for 10 seconds
 * before the read, hold it through the gate, and still refuse every delete,
 * replace, and patch. That call is not in this file.
 *
 * Transparency maintenance is maintainLVPTTransparencyOnce. The preview does
 * not call it. The function is disabled and sends no Calendar request.
 */

var LVPT_PRODUCTION_CANDIDATE_WRITES_ENABLED = false;
var LVPT_TRANSPARENCY_MAINTENANCE_ENABLED = false;

var LVPT_PHASE7K_LIVE_BASELINE = {
  tasksRows: 169,
  datedActiveTasks: 52,
  cancelledManagedRecords: 870,
  legacyReminders: 21,
  activeManagedReminders: 33,
  suppressedCreates: 19,
  busyManagedReminders: 18,
  unchangedManagedReminders: 15,
  reviewDecisions: 0,
  proposedWrites: 0
};

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

function runLVPTProductionCandidate() {
  return {
    applied: false,
    calendarWrites: 0,
    sheetWrites: 0,
    lockAcquired: false,
    reason: 'LVPT_PRODUCTION_CANDIDATE_WRITES_ENABLED is false. This entry returns before a lock, a read, or a Calendar call.'
  };
}

function lvptProductionCandidateRemember_(records, calendarId, event, source) {
  if (!calendarId || !event || !event.id) return false;
  var key = calendarId + '::' + event.id;
  var prior = records[key];
  if (!prior || event.status === 'cancelled') {
    records[key] = { calendarId: calendarId, event: event, source: source };
  }
  return true;
}

function lvptDescribeCancelledManagedHistory_(records, ownerEmail) {
  var byTask = {};
  Object.keys(records || {}).forEach(function (key) {
    var item = records[key];
    var info = lvptClassifyReminderEvent_(item.event, ownerEmail);
    if (info.role !== 'cancelled_managed' || !info.taskId) return;
    if (!byTask[info.taskId]) byTask[info.taskId] = [];
    byTask[info.taskId].push(item.event.id);
  });
  var taskIds = Object.keys(byTask);
  var repeated = taskIds.filter(function (id) { return byTask[id].length > 1; });
  var largest = 0;
  taskIds.forEach(function (id) {
    if (byTask[id].length > largest) largest = byTask[id].length;
  });
  return {
    cancelledManagedRecords: taskIds.reduce(function (count, id) { return count + byTask[id].length; }, 0),
    tasksWithCancelledManagedHistory: taskIds.length,
    tasksWithRepeatedCancelledManagedEvents: repeated.length,
    largestCancelledManagedSet: largest,
    actor: null,
    pattern: 'Production TaskSync reads visible events with showDeleted false, drops a cancelled event, and creates a reminder when no visible reminder remains. A later run can repeat that after the cancelled event leaves the active list. These records are retained history. This description does not identify who cancelled an event.'
  };
}

function lvptProductionCandidateActions_(decisions) {
  return (decisions || []).map(function (row) {
    var decision = row && row.decision;
    var known = decision === 'NO CHANGE' || decision === 'SUPPRESS CREATE' || decision === 'REVIEW';
    return {
      taskId: row && row.taskId || '',
      action: known ? decision : 'REVIEW',
      classification: row && row.classification || '',
      reason: row && row.reason || '',
      transparencyHeld: row ? row.transparencyHeld === true : false,
      transparencyCorrection: 'outside scheduled workflow',
      create: false,
      delete: false,
      replace: false,
      patch: false,
      writes: 0
    };
  });
}

function lvptCompareProductionCandidateBaseline_(summary) {
  var differences = [];
  Object.keys(LVPT_PHASE7K_LIVE_BASELINE).forEach(function (key) {
    if (summary[key] !== LVPT_PHASE7K_LIVE_BASELINE[key]) {
      differences.push(key + ' is ' + summary[key] + '. The Phase 7K live read was ' + LVPT_PHASE7K_LIVE_BASELINE[key] + '. This read was not changed to match it.');
    }
  });
  return {
    phase7k: LVPT_PHASE7K_LIVE_BASELINE,
    matchesPhase7k: differences.length === 0,
    differences: differences,
    adjustedToPhase7k: false
  };
}

function lvptProductionCandidateAudit_(actions, issues, pattern) {
  return {
    proposedOperations: actions,
    failures: issues || [],
    approvals: [],
    cancellationHistory: pattern,
    calendarWrites: 0,
    sheetWrites: 0,
    durableStoreWritten: false,
    lockAcquired: false
  };
}

function previewLVPTProductionCandidate() {
  if (LVPT_PRODUCTION_CANDIDATE_WRITES_ENABLED !== false) {
    throw new Error('Production candidate writes are not disabled. No write was attempted.');
  }
  if (typeof LVPT_STAGING_PREVIEW_ONLY === 'undefined' || LVPT_STAGING_PREVIEW_ONLY !== true) {
    throw new Error('LVPT_STAGING_PREVIEW_ONLY is not true. No write was attempted.');
  }
  if (typeof lvptDryRunSafeDecisions_ !== 'function' || typeof lvptSafeDiscoveryQueries_ !== 'function' || typeof lvptClassifyReminderEvent_ !== 'function' || typeof lvptSelectDatedActiveTasks_ !== 'function') {
    throw new Error('Phase 7K decision engine is not loaded. No write was attempted.');
  }
  if (typeof lvptStagingReadSheet_ !== 'function' || typeof lvptListCalendarEvents_ !== 'function' || typeof lvptCanonicalReferences_ !== 'function' || typeof lvptTaskCategory_ !== 'function') {
    throw new Error('Read helpers are not loaded. No write was attempted.');
  }
  if (!LVPT_SAFE_REVIEW_CONFIG || LVPT_SAFE_REVIEW_CONFIG.automaticCreateEnabled !== false) {
    throw new Error('automaticCreateEnabled is not false. No write was attempted.');
  }
  var cfg = LVPT_SYNC_CONFIG;
  var categories = ['sales', 'proposals', 'operations', 'confirmed'];
  categories.forEach(function (category) {
    if (!cfg || !cfg.calendarNames || !cfg.calendarNames[category]) {
      throw new Error('Four-calendar configuration is incomplete. No write was attempted.');
    }
  });
  if (!cfg || String(cfg.ownerEmail || '').toLowerCase() !== String(LVPT_SAFE_REVIEW_CONFIG.ownerEmail || '').toLowerCase()) {
    throw new Error('Owner configuration differs. No write was attempted.');
  }
  var account = String(CalendarApp.getDefaultCalendar().getId()).toLowerCase();
  if (account !== String(cfg.ownerEmail).toLowerCase()) {
    throw new Error('Wrong account: ' + account + '. Expected ' + cfg.ownerEmail + '. No write was attempted.');
  }

  var issues = [];
  var calendars = {};
  var calendarScan = { sales: false, proposals: false, operations: false, confirmed: false };
  var scanComplete = true;
  categories.forEach(function (category) {
    var owned = CalendarApp.getOwnedCalendarsByName(cfg.calendarNames[category]);
    if (owned.length !== 1) {
      scanComplete = false;
      issues.push('Expected one owned calendar for ' + category + '.');
      return;
    }
    calendars[category] = owned[0].getId();
  });

  var values = lvptStagingReadSheet_(cfg.spreadsheetId, 'Tasks', 10);
  if (!values || values.length < 2) throw new Error('Tasks spreadsheet data is unavailable. No write was attempted.');
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
          if (!lvptProductionCandidateRemember_(records, calendarId, event, selector.showDeleted === true ? 'cancelled-managed' : 'active')) {
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
  if (!scanComplete) {
    categories.forEach(function (category) {
      if (!calendars[category]) calendarScan[category] = false;
    });
  }

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
        lvptProductionCandidateRemember_(records, ref.calendarId, event, 'canonical-cancelled');
        return;
      }
      lvptProductionCandidateRemember_(records, ref.calendarId, event, 'canonical');
    });
  });

  var active = [];
  var cancelled = [];
  Object.keys(records).forEach(function (key) {
    if (records[key].event.status === 'cancelled') cancelled.push(records[key]);
    else active.push(records[key]);
  });
  var pattern = lvptDescribeCancelledManagedHistory_(records, cfg.ownerEmail);
  var result = lvptDryRunSafeDecisions_({
    inventoryComplete: scanComplete,
    scanComplete: scanComplete,
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
  } else {
    decisions = result.decisions || [];
  }
  var actions = lvptProductionCandidateActions_(decisions);
  var unwanted = { create: 0, delete: 0, replace: 0, patch: 0 };
  actions.forEach(function (action) {
    if (action.create) unwanted.create++;
    if (action.delete) unwanted.delete++;
    if (action.replace) unwanted.replace++;
    if (action.patch) unwanted.patch++;
  });
  if (unwanted.create || unwanted.delete || unwanted.replace || unwanted.patch) {
    issues.push('A scheduled action proposed a write. None were applied.');
    actions = [];
  }
  if (result && result.writes && result.writes.length) {
    issues.push('The decision engine proposed ' + result.writes.length + ' writes. None were applied.');
  }

  var selected = lvptSelectDatedActiveTasks_(taskRows);
  var counts = { suppressedCreates: 0, reviewDecisions: 0, noChangeDecisions: 0 };
  actions.forEach(function (action) {
    if (action.action === 'SUPPRESS CREATE') counts.suppressedCreates++;
    else if (action.action === 'REVIEW') counts.reviewDecisions++;
    else if (action.action === 'NO CHANGE') counts.noChangeDecisions++;
  });
  var busy = 0;
  var free = 0;
  var legacy = 0;
  Object.keys(records).forEach(function (key) {
    var info = lvptClassifyReminderEvent_(records[key].event, cfg.ownerEmail);
    if (info.role === 'legacy') legacy++;
    if (info.role !== 'managed') return;
    if (records[key].event.transparency === 'transparent') free++;
    else busy++;
  });
  var summary = {
    tasksRows: taskRows.length,
    datedActiveTasks: selected.datedActive.length,
    fourCalendarScanComplete: scanComplete,
    calendarScan: calendarScan,
    cancelledManagedRecords: pattern.cancelledManagedRecords,
    legacyReminders: legacy,
    activeManagedReminders: busy + free,
    suppressedCreates: counts.suppressedCreates,
    busyManagedReminders: busy,
    unchangedManagedReminders: free,
    reviewDecisions: counts.reviewDecisions,
    noChangeDecisions: counts.noChangeDecisions,
    proposedActions: actions.length,
    proposedWrites: 0,
    create: unwanted.create,
    delete: unwanted.delete,
    replace: unwanted.replace,
    patch: unwanted.patch,
    calendarWrites: 0,
    sheetWrites: 0,
    automaticCreateEnabled: false,
    transparencyMaintenanceCalled: false,
    phase7k: null
  };
  summary.phase7k = scanComplete ? lvptCompareProductionCandidateBaseline_(summary) : {
    phase7k: LVPT_PHASE7K_LIVE_BASELINE,
    matchesPhase7k: false,
    differences: ['Baseline comparison was not applied because the inventory did not complete.'],
    adjustedToPhase7k: false
  };
  var audit = lvptProductionCandidateAudit_(actions, issues, pattern);
  console.log('LVPT_PRODUCTION_CANDIDATE_SUMMARY ' + JSON.stringify(summary));
  actions.forEach(function (action) {
    console.log('LVPT_PRODUCTION_CANDIDATE_ACTION ' + JSON.stringify(action));
  });
  console.log('LVPT_PRODUCTION_CANDIDATE_AUDIT ' + JSON.stringify(audit));
  console.log('LVPT_PRODUCTION_CANDIDATE_ISSUES ' + JSON.stringify(issues));
  return { summary: summary, actions: actions, audit: audit, issues: issues };
}

function lvptBuildTransparencyMaintenancePlan_(freshReads) {
  var allow = {};
  LVPT_TRANSPARENCY_ALLOWLIST.forEach(function (row) { allow[row.eventId] = row; });
  var held = [];
  var candidates = [];
  (freshReads || []).forEach(function (read) {
    var known = read && allow[read.eventId];
    if (!known) {
      held.push({ eventId: read && read.eventId || '', problems: ['event is not on the historical identification allowlist'] });
      return;
    }
    if (read.calendarId !== known.calendarId || read.taskId !== known.taskId) {
      held.push({ eventId: read.eventId, problems: ['fresh identity does not match the allowlist'] });
      return;
    }
    candidates.push(read);
  });
  LVPT_TRANSPARENCY_ALLOWLIST.forEach(function (row) {
    var present = (freshReads || []).some(function (read) { return read && read.eventId === row.eventId; });
    if (!present) held.push({ eventId: row.eventId, problems: ['fresh read is missing'] });
  });
  var planned = lvptPlanTransparencyCorrection_(candidates);
  return {
    eligible: planned.eligible,
    held: held.concat(planned.held),
    writes: 0,
    executable: false,
    block: 'Design only. A future patch would send transparency and the fresh ETag as If-Match. This function does not call Calendar.'
  };
}

function maintainLVPTTransparencyOnce() {
  return {
    enabled: LVPT_TRANSPARENCY_MAINTENANCE_ENABLED === true,
    executable: false,
    writes: 0,
    requests: [],
    allowlistCount: LVPT_TRANSPARENCY_ALLOWLIST.length,
    block: 'Disabled. Scheduled TaskSync does not call this function. No Calendar request was sent.'
  };
}
