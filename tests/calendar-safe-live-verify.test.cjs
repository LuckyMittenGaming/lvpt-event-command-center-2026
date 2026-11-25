/**
 * Wiring test for the unread live verifier.
 * Uses the installed staging list helper with a fake Calendar service.
 * No Google call and no Apps Script execution.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const verifySource = fs.readFileSync('apps-script/calendar-command-center/verifyLVPTSafeIntegrationLive.js', 'utf8');
const stagingSource = fs.readFileSync('apps-script/staging-calendar-preview/TaskSync.js', 'utf8');
[
  'Calendar.Events.insert',
  'Calendar.Events.patch',
  'Calendar.Events.update',
  'Calendar.Events.delete',
  'Calendar.Events.remove',
  'UrlFetchApp',
  'ScriptApp',
  'setValues',
  'appendRow',
  'runLVPTTaskSync(',
  'previewLVPTTaskSync(',
  'lvptPlanTaskCalendarSync_(',
  'lvptApplyTaskCalendarChanges_(',
  '3589157238401502'
].forEach(function (token) {
  assert.equal(verifySource.includes(token), false, token);
});
assert.equal(stagingSource.includes('verifyLVPTSafeIntegrationLive'), false);
assert.equal(verifySource.includes('automaticCreateEnabled !== false'), true);
assert.equal(verifySource.includes('showDeleted'), true);
assert.equal(verifySource.includes('LVPT_SAFE_LIVE_SUMMARY'), true);
assert.equal(verifySource.includes('LVPT_SAFE_LIVE_DECISION'), true);
assert.equal(verifySource.includes('LVPT_SAFE_LIVE_ISSUES'), true);

const IDS = {
  sales: 'cal-sales',
  proposals: 'cal-proposals',
  operations: 'cal-ops',
  confirmed: 'cal-confirmed'
};
const JOYCE = 'bq7th2lis1p5dq0n9vv5hqmtok';
const writes = [];
function rejectWrite(name) {
  return function () {
    writes.push(name);
    throw new Error('write attempted: ' + name);
  };
}

const state = { failConfirmed: false, calls: [], gets: [] };
const events = [];
function add(calendarId, event) {
  events.push({ calendarId: calendarId, event: event });
}
function managed(id, taskId, transparency, status) {
  return {
    id: id,
    status: status || 'confirmed',
    transparency: transparency,
    description: 'LVPT INTERNAL ACTION REMINDER\nTask ID: ' + taskId,
    extendedProperties: { private: { lvptManaged: 'taskSyncV1', lvptTaskId: taskId } }
  };
}
add(IDS.operations, managed('cancelled-kristin', 'gmail-task-1a0a78195ff7c8a0-kristinvenetian', 'transparent', 'cancelled'));
add(IDS.operations, {
  id: 'legacy-kristin',
  status: 'confirmed',
  transparency: 'transparent',
  description: 'LVPT INTERNAL OWNER REMINDER\nTask ID: gmail-task-1a0a78195ff7c8a0-kristinvenetian'
});
add(IDS.sales, managed(JOYCE, 'gmail-task-1a0a78195ff7c8a0-joycevenetian', null, 'confirmed'));
add(IDS.sales, managed('free-live', 'gmail-task-unchanged-live-0001', 'transparent', 'confirmed'));
add(IDS.operations, {
  id: 'kg49e1cfu2o9rvtkbq0l3erdeg',
  status: 'confirmed',
  transparency: 'transparent',
  description: 'INTERNAL OWNER REMINDER\nTask ID: gmail-\ntask-1a1564e8e21a05f3-production',
  attendees: [{ email: 'book@pokertraininglasvegas.com', self: true }]
});

function matches(event, args) {
  if (args.privateExtendedProperty) {
    var props = event.extendedProperties && event.extendedProperties.private;
    if (!props || props.lvptManaged !== 'taskSyncV1') return false;
    if (args.showDeleted === true) return true;
    return event.status !== 'cancelled';
  }
  if (args.q) return String(event.description || '').indexOf(args.q) >= 0;
  return false;
}

const sandbox = {
  console: { log() {} },
  Date: Date,
  Map: Map,
  Set: Set,
  Object: Object,
  String: String,
  Array: Array,
  Error: Error,
  JSON: JSON,
  Math: Math,
  Intl: Intl,
  Number: Number,
  isFinite: isFinite,
  isNaN: isNaN,
  encodeURIComponent: encodeURIComponent,
  CalendarApp: {
    getDefaultCalendar: function () {
      return { getId: function () { return 'book@pokertraininglasvegas.com'; } };
    },
    getOwnedCalendarsByName: function (name) {
      var names = sandbox.LVPT_SYNC_CONFIG.calendarNames;
      var category = Object.keys(names).find(function (key) { return names[key] === name; });
      if (!category) return [];
      return [{ getId: function () { return IDS[category]; } }];
    }
  },
  Calendar: {
    Events: {
      list: function (calendarId, args) {
        state.calls.push({ calendarId: calendarId, args: args });
        if (state.failConfirmed && calendarId === IDS.confirmed && args.showDeleted === true) {
          return { items: [], nextPageToken: 'again' };
        }
        return {
          items: events.filter(function (item) {
            return item.calendarId === calendarId && matches(item.event, args);
          }).map(function (item) { return item.event; })
        };
      },
      get: function (calendarId, eventId) {
        state.gets.push(eventId);
        if (eventId === 'missing-event') throw new Error('404 not found');
        var found = events.find(function (item) {
          return item.calendarId === calendarId && item.event.id === eventId;
        });
        return found ? found.event : null;
      },
      insert: rejectWrite('insert'),
      patch: rejectWrite('patch'),
      update: rejectWrite('update'),
      remove: rejectWrite('delete')
    }
  },
  Sheets: {
    Spreadsheets: {
      get: function () {
        return { sheets: [{ properties: { title: 'Tasks' } }, { properties: { title: 'Events' } }] };
      },
      Values: {
        get: function () {
          return { values: sheet() };
        },
        update: rejectWrite('sheet-update'),
        append: rejectWrite('sheet-append')
      }
    }
  }
};
vm.createContext(sandbox);
vm.runInContext(stagingSource, sandbox, { filename: 'staging-TaskSync.js' });
vm.runInContext(fs.readFileSync('apps-script/calendar-command-center/TaskSync.safe-review.js', 'utf8'), sandbox, { filename: 'safe-review.js' });
vm.runInContext(fs.readFileSync('apps-script/calendar-command-center/TaskSync.safe-integrate.js', 'utf8'), sandbox, { filename: 'safe-integrate.js' });
vm.runInContext(verifySource, sandbox, { filename: 'verifyLVPTSafeIntegrationLive.js' });
sandbox.lvptPlanTaskCalendarSync_ = function () { throw new Error('planner called'); };
sandbox.previewLVPTTaskSync = function () { throw new Error('preview called'); };
sandbox.runLVPTTaskSync = function () { throw new Error('runner called'); };

function sheet() {
  var header = ['task_id', 'event_id', 'task', 'due_date', 'priority', 'status', 'notes', '', '', ''];
  var notes = 'canonical_calendar_id=' + IDS.sales + '; canonical_event_id=' + JOYCE +
    ' canonical_calendar_id=' + IDS.sales + '; canonical_event_id=missing-event';
  return [
    header,
    ['gmail-task-1a0a78195ff7c8a0-kristinvenetian', 'ev', 'vendor invoice', '11/12/2026', '', 'open', '', '', '', ''],
    ['gmail-task-1a0a78195ff7c8a0-joycevenetian', 'ev', 'Joyce follow up', '2026-11-21', '', 'open', notes, '', '', ''],
    ['gmail-task-unchanged-live-0001', 'ev', 'Send the deck', '2026-11-22', '', 'in progress', '', '', '', ''],
    ['gmail-task-1a1564e8e21a05f3-production', 'ev', 'CertaPro PowerPoint template', '11/9/2026', '', 'open', '', '', '', ''],
    ['gmail-task-1a189f1dffa1d00f-production', 'ev', 'Cowbell room and felt layout', '11/9/2026', '', 'waiting', '', '', '', ''],
    ['gmail-task-completed-live-0001', 'ev', 'Done item', '2026-11-01', '', 'complete', '', '', '', ''],
    ['gmail-task-undated-live-0001', 'ev', 'No date', '', '', 'open', '', '', '', '']
  ];
}

const seen = [];
const decide = sandbox.lvptDryRunSafeDecisions_;
sandbox.lvptDryRunSafeDecisions_ = function (input) {
  seen.push(input);
  return decide(input);
};

const first = sandbox.verifyLVPTSafeIntegrationLive();
const second = sandbox.verifyLVPTSafeIntegrationLive();
assert.equal(JSON.stringify(first.decisions), JSON.stringify(second.decisions));
assert.equal(first.summary.calendarWrites, 0);
assert.equal(first.summary.sheetWrites, 0);
assert.equal(first.summary.proposedWrites, 0);
assert.equal(first.summary.tasksRows, 7);
assert.equal(first.summary.datedActiveTasks, 5);
assert.equal(first.summary.fourCalendarScanComplete, true);
assert.equal(JSON.stringify(first.summary.calendarScan), JSON.stringify({ sales: true, proposals: true, operations: true, confirmed: true }));
assert.equal(first.summary.cancelledManagedRecords, 1);
assert.equal(first.summary.activeManagedReminders, 2);
assert.equal(first.summary.legacyReminders, 2);
assert.equal(first.summary.suppressedCreates, 3);
assert.equal(first.summary.busyManagedReminders, 1);
assert.equal(first.summary.unchangedManagedReminders, 1);
assert.equal(first.summary.reviewDecisions, 0);
assert.equal(first.summary.baseline.adjustedToBaseline, false);
assert.equal(first.summary.baseline.matchesSyntheticBaseline, false);
assert.equal(first.summary.baseline.differences.some(function (line) { return line.indexOf('joycevenetian') >= 0; }), false);
assert.ok(first.summary.baseline.differences.some(function (line) { return line.indexOf('suppressedCreates is 3') >= 0; }));
assert.equal(writes.length, 0);

const byId = {};
first.decisions.forEach(function (row) { byId[row.taskId] = row; });
assert.equal(byId['gmail-task-1a0a78195ff7c8a0-joycevenetian'].decision, 'NO CHANGE');
assert.equal(byId['gmail-task-1a0a78195ff7c8a0-joycevenetian'].transparencyHeld, true);
assert.equal(JSON.stringify(byId['gmail-task-1a0a78195ff7c8a0-joycevenetian'].eventIds), JSON.stringify([JOYCE]));
assert.equal(byId['gmail-task-1a0a78195ff7c8a0-kristinvenetian'].decision, 'SUPPRESS CREATE');
assert.equal(byId['gmail-task-1a1564e8e21a05f3-production'].decision, 'SUPPRESS CREATE');
assert.ok(byId['gmail-task-1a1564e8e21a05f3-production'].eventIds.indexOf('kg49e1cfu2o9rvtkbq0l3erdeg') >= 0);
assert.equal(byId['gmail-task-1a189f1dffa1d00f-production'].decision, 'SUPPRESS CREATE');
assert.ok(first.issues.some(function (issue) { return issue.indexOf('d0679uii6sfi6ig6metb4u21vc') >= 0; }));
assert.ok(first.issues.some(function (issue) { return issue.indexOf('missing-event') >= 0; }));
assert.equal(seen[0].ownerTombstones.length, 0);
seen[0].taskRows.forEach(function (row) {
  assert.equal(row.ownerApprovedCreate, undefined);
  assert.equal(row.ownerApprovedRecreation, undefined);
});

const queries = state.calls.map(function (call) { return call.args.q || call.args.privateExtendedProperty; });
assert.ok(queries.indexOf('LVPT INTERNAL') >= 0);
assert.ok(queries.indexOf('INTERNAL OWNER REMINDER') >= 0);
assert.ok(state.calls.some(function (call) {
  return call.args.showDeleted === true && String(call.args.privateExtendedProperty).indexOf('lvptManaged=taskSyncV1') >= 0;
}));
assert.equal(state.calls.length, 32);

state.calls = [];
state.failConfirmed = true;
const blocked = sandbox.verifyLVPTSafeIntegrationLive();
assert.equal(blocked.summary.fourCalendarScanComplete, false);
assert.equal(blocked.summary.calendarScan.confirmed, false);
assert.equal(blocked.decisions.length, 0);
assert.equal(blocked.summary.proposedWrites, 0);
assert.equal(blocked.summary.calendarWrites, 0);
assert.equal(blocked.summary.sheetWrites, 0);
assert.equal(blocked.summary.datedActiveTasks, 5);
assert.equal(blocked.summary.baseline.adjustedToBaseline, false);
assert.ok(blocked.issues.some(function (issue) { return issue.indexOf('Repeated Calendar pagination token') >= 0; }));
assert.equal(writes.length, 0);

state.failConfirmed = false;
sandbox.LVPT_STAGING_PREVIEW_ONLY = false;
assert.throws(function () { sandbox.verifyLVPTSafeIntegrationLive(); }, /LVPT_STAGING_PREVIEW_ONLY/);
sandbox.LVPT_STAGING_PREVIEW_ONLY = true;
sandbox.LVPT_SAFE_REVIEW_CONFIG.automaticCreateEnabled = true;
assert.throws(function () { sandbox.verifyLVPTSafeIntegrationLive(); }, /automaticCreateEnabled/);
sandbox.LVPT_SAFE_REVIEW_CONFIG.automaticCreateEnabled = false;
sandbox.CalendarApp.getDefaultCalendar = function () {
  return { getId: function () { return 'someone-else@example.com'; } };
};
assert.throws(function () { sandbox.verifyLVPTSafeIntegrationLive(); }, /Wrong account/);
assert.equal(writes.length, 0);

const compared = sandbox.lvptCompareSafeLiveBaseline_({
  suppressedCreates: 19,
  busyManagedReminders: 18,
  unchangedManagedReminders: 14
}, []);
assert.equal(compared.adjustedToBaseline, false);
assert.equal(compared.matchesSyntheticBaseline, false);
assert.ok(compared.differences.some(function (line) { return line.indexOf('unchangedManagedReminders is 14') >= 0; }));

console.log('calendar-safe-live-verify: wiring checks passed');
