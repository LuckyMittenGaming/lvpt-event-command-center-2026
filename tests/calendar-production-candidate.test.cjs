/**
 * Synthetic checks for the undeployed production candidate.
 * The staging page walker is real. Calendar and Sheets are fakes.
 * This file does not read Google.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const candidateSource = fs.readFileSync('apps-script/calendar-command-center/TaskSync.production-candidate.js', 'utf8');
const productionSource = fs.readFileSync('apps-script/live/calendar-command-center/TaskSync.js', 'utf8');
[
  'Calendar.Events.insert',
  'Calendar.Events.patch',
  'Calendar.Events.update',
  'Calendar.Events.delete',
  'Calendar.Events.remove',
  'UrlFetchApp',
  'ScriptApp',
  'SpreadsheetApp',
  'setValues',
  'appendRow',
  'LockService.getScriptLock()',
  'runLVPTTaskSync(',
  'previewLVPTTaskSync(',
  '3589157238401502'
].forEach(function (token) {
  assert.equal(candidateSource.includes(token), false, token);
});
assert.equal(candidateSource.split('maintainLVPTTransparencyOnce(').length, 2);
assert.equal(productionSource.includes('Calendar.Events.insert'), true);
assert.equal(productionSource.includes('showDeleted: true'), false);
assert.equal(candidateSource.includes('automaticCreateEnabled !== false'), true);
assert.equal(candidateSource.includes('showDeleted'), true);
assert.equal(candidateSource.includes('INTERNAL OWNER REMINDER'), false);
assert.equal(candidateSource.includes('lvptSafeDiscoveryQueries_'), true);

const IDS = {
  sales: 'cal-sales',
  proposals: 'cal-proposals',
  operations: 'c_a9756e49c39a571a2c21d99524f4c226e1772fca9f0c4156e245d5fd7d941a2a@group.calendar.google.com',
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
const state = { failConfirmed: false, calls: [] };
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
    extendedProperties: { private: { lvptManaged: 'taskSyncV1', lvptTaskId: taskId } },
    start: { dateTime: '2026-11-21T14:00:00.000Z' },
    end: { dateTime: '2026-11-21T14:15:00.000Z' }
  };
}
add(IDS.operations, managed('cancelled-a', 'gmail-task-1a0a78195ff7c8a0-kristinvenetian', 'transparent', 'cancelled'));
add(IDS.operations, managed('cancelled-b', 'gmail-task-1a0a78195ff7c8a0-kristinvenetian', 'transparent', 'cancelled'));
add(IDS.operations, {
  id: 'legacy-kristin',
  status: 'confirmed',
  transparency: 'transparent',
  description: 'LVPT INTERNAL OWNER REMINDER\nTask ID: gmail-task-1a0a78195ff7c8a0-kristinvenetian'
});
add(IDS.operations, managed(JOYCE, 'gmail-task-1a0a78195ff7c8a0-joycevenetian', null, 'confirmed'));
add(IDS.operations, {
  id: 'kg49e1cfu2o9rvtkbq0l3erdeg',
  status: 'confirmed',
  transparency: 'transparent',
  description: 'INTERNAL OWNER REMINDER\nTask ID: gmail-\ntask-1a1564e8e21a05f3-production',
  attendees: [{ email: 'book@pokertraininglasvegas.com', self: true }]
});
add(IDS.confirmed, {
  id: 'client-booking',
  status: 'confirmed',
  transparency: 'opaque',
  description: 'Client booking',
  attendees: [{ email: 'guest@example.com' }]
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
        return { sheets: [{ properties: { title: 'Tasks' } }] };
      },
      Values: {
        get: function () { return { values: sheet() }; },
        update: rejectWrite('sheet'),
        append: rejectWrite('sheet')
      }
    }
  }
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync('apps-script/staging-calendar-preview/TaskSync.js', 'utf8'), sandbox, { filename: 'staging-TaskSync.js' });
vm.runInContext(fs.readFileSync('apps-script/calendar-command-center/TaskSync.safe-review.js', 'utf8'), sandbox, { filename: 'safe-review.js' });
vm.runInContext(fs.readFileSync('apps-script/calendar-command-center/TaskSync.safe-integrate.js', 'utf8'), sandbox, { filename: 'safe-integrate.js' });
vm.runInContext(candidateSource, sandbox, { filename: 'production-candidate.js' });
sandbox.previewLVPTTaskSync = function () { throw new Error('installed preview called'); };
sandbox.runLVPTTaskSync = function () { throw new Error('installed runner called'); };

function sheet() {
  var header = ['task_id', 'event_id', 'task', 'due_date', 'priority', 'status', 'notes', '', '', ''];
  return [
    header,
    ['gmail-task-1a0a78195ff7c8a0-kristinvenetian', 'ev', 'vendor invoice', '11/12/2026', '', 'open', '', '', '', ''],
    ['gmail-task-1a0a78195ff7c8a0-joycevenetian', 'ev', 'Joyce follow up', '2026-11-21', '', 'open', '', '', '', ''],
    ['gmail-task-1a1564e8e21a05f3-production', 'ev', 'CertaPro PowerPoint template', '11/9/2026', '', 'open', '', '', '', ''],
    ['gmail-task-1a189f1dffa1d00f-production', 'ev', 'Cowbell room and felt layout', '11/9/2026', '', 'waiting', '', '', '', '']
  ];
}

const first = sandbox.previewLVPTProductionCandidate();
const second = sandbox.previewLVPTProductionCandidate();
assert.equal(JSON.stringify(first.actions), JSON.stringify(second.actions));
assert.equal(first.summary.calendarWrites, 0);
assert.equal(first.summary.sheetWrites, 0);
assert.equal(first.summary.create, 0);
assert.equal(first.summary.delete, 0);
assert.equal(first.summary.replace, 0);
assert.equal(first.summary.patch, 0);
assert.equal(first.summary.proposedWrites, 0);
assert.equal(first.summary.automaticCreateEnabled, false);
assert.equal(first.summary.transparencyMaintenanceCalled, false);
assert.equal(first.summary.fourCalendarScanComplete, true);
assert.equal(first.summary.cancelledManagedRecords, 2);
assert.equal(first.summary.tasksWithRepeatedCancelledManagedEvents, undefined);
assert.equal(first.audit.cancellationHistory.tasksWithRepeatedCancelledManagedEvents, 1);
assert.equal(first.audit.cancellationHistory.actor, null);
assert.equal(first.audit.approvals.length, 0);
assert.equal(first.audit.durableStoreWritten, false);
assert.equal(first.audit.lockAcquired, false);
assert.ok(first.audit.cancellationHistory.pattern.indexOf('who cancelled') >= 0);
assert.equal(first.summary.phase7k.adjustedToPhase7k, false);
assert.equal(first.summary.phase7k.matchesPhase7k, false);
assert.equal(writes.length, 0);

const byId = {};
first.actions.forEach(function (row) { byId[row.taskId] = row; });
assert.equal(byId['gmail-task-1a0a78195ff7c8a0-joycevenetian'].action, 'NO CHANGE');
assert.equal(byId['gmail-task-1a0a78195ff7c8a0-joycevenetian'].transparencyHeld, true);
assert.equal(byId['gmail-task-1a0a78195ff7c8a0-joycevenetian'].patch, false);
assert.equal(byId['gmail-task-1a0a78195ff7c8a0-joycevenetian'].transparencyCorrection, 'outside scheduled workflow');
assert.equal(byId['gmail-task-1a0a78195ff7c8a0-kristinvenetian'].action, 'SUPPRESS CREATE');
assert.equal(byId['gmail-task-1a0a78195ff7c8a0-kristinvenetian'].create, false);
assert.equal(byId['gmail-task-1a1564e8e21a05f3-production'].action, 'SUPPRESS CREATE');
assert.equal(byId['gmail-task-1a189f1dffa1d00f-production'].action, 'SUPPRESS CREATE');
assert.equal(JSON.stringify(first.actions).indexOf('client-booking'), -1);

const refused = sandbox.runLVPTProductionCandidate();
assert.equal(refused.applied, false);
assert.equal(refused.calendarWrites, 0);
assert.equal(refused.lockAcquired, false);

const maintenanceCalls = [];
const plan = sandbox.lvptPlanTransparencyCorrection_;
sandbox.lvptPlanTransparencyCorrection_ = function (rows) {
  maintenanceCalls.push(rows);
  return plan(rows);
};
const disabled = sandbox.maintainLVPTTransparencyOnce([{ etag: '3589157238401502' }]);
assert.equal(disabled.executable, false);
assert.equal(disabled.writes, 0);
assert.equal(disabled.requests.length, 0);
assert.equal(disabled.allowlistCount, 18);
assert.equal(maintenanceCalls.length, 0);

const fresh = sandbox.lvptBuildTransparencyMaintenancePlan_([
  {
    eventId: JOYCE,
    calendarId: IDS.operations,
    taskId: 'gmail-task-1a0a78195ff7c8a0-joycevenetian',
    etagSource: 'fresh-get',
    etag: 'fresh-etag',
    status: 'confirmed',
    transparency: null,
    taskSyncOwned: true,
    externalAttendees: false,
    durationMinutes: 15,
    conference: false,
    reasons: ['transparency']
  },
  {
    eventId: 'not-on-allowlist',
    calendarId: IDS.sales,
    taskId: 'gmail-task-other',
    etagSource: 'fresh-get',
    etag: 'other',
    status: 'confirmed',
    transparency: null,
    taskSyncOwned: true,
    durationMinutes: 15,
    reasons: ['transparency']
  }
]);
assert.equal(fresh.executable, false);
assert.equal(fresh.writes, 0);
assert.equal(fresh.eligible.length, 1);
assert.equal(JSON.stringify(fresh.eligible[0].resource), JSON.stringify({ transparency: 'transparent' }));
assert.equal(fresh.eligible[0].headers['If-Match'], 'fresh-etag');
assert.equal(JSON.stringify(fresh).indexOf('3589157238401502'), -1);
assert.ok(fresh.held.some(function (row) { return row.eventId === 'not-on-allowlist'; }));
assert.equal(fresh.held.filter(function (row) { return row.problems.indexOf('fresh read is missing') >= 0; }).length, 17);

state.failConfirmed = true;
const blocked = sandbox.previewLVPTProductionCandidate();
assert.equal(blocked.summary.fourCalendarScanComplete, false);
assert.equal(blocked.actions.length, 0);
assert.equal(blocked.summary.create, 0);
assert.equal(blocked.summary.calendarWrites, 0);
assert.equal(blocked.summary.phase7k.adjustedToPhase7k, false);
assert.ok(blocked.issues.some(function (issue) { return String(issue).indexOf('Repeated Calendar pagination token') >= 0; }));
assert.equal(writes.length, 0);

console.log('calendar-production-candidate: synthetic checks passed');
