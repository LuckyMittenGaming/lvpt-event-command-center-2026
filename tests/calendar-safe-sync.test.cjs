/**
 * Synthetic checks for the guarded TaskSync writer.
 * Calendar and Sheets are not contacted.
 */
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('apps-script/calendar-command-center/TaskSync.safe-sync.js', 'utf8');
[
  'UrlFetchApp',
  'GmailApp',
  'MailApp',
  'ScriptApp',
  'Calendar.Events.remove',
  'Calendar.Events.delete',
  'Calendar.Events.update',
  '3589157238401502'
].forEach(function (token) {
  assert.equal(source.includes(token), false, token);
});
assert.equal(source.includes('function runLVPTSafeTaskSync'), true);
assert.equal(source.includes('function maintainLVPTTransparencyOnce'), true);
assert.equal(source.includes("'transparent'"), true);

const context = {
  Utilities: {
    DigestAlgorithm: { SHA_256: 'SHA_256' },
    Charset: { UTF_8: 'UTF_8' },
    computeDigest: function (_algorithm, value) {
      return Array.from(crypto.createHash('sha256').update(String(value)).digest()).map(function (byte) {
        return byte > 127 ? byte - 256 : byte;
      });
    }
  },
  console: console
};
vm.createContext(context);
vm.runInContext(fs.readFileSync('apps-script/calendar-command-center/TaskSync.safe-review.js', 'utf8'), context);
vm.runInContext(fs.readFileSync('apps-script/calendar-command-center/TaskSync.safe-integrate.js', 'utf8'), context);
vm.runInContext(source, context);

const IDS = {
  sales: 'c_451b7f3ca8c727da168891a0d1d53475beb13c0c649c6157acdd98959b5cc334@group.calendar.google.com',
  proposals: 'c_e68f6233ff8a0e2fb22168ee24da99dc06e0416d652a0e1b964d3a88f5c0935b@group.calendar.google.com',
  operations: 'c_a9756e49c39a571a2c21d99524f4c226e1772fca9f0c4156e245d5fd7d941a2a@group.calendar.google.com',
  confirmed: 'c_972d7e50b66cba545967cf0f8de32d22990e6e8aa98051bdfa34b9122ed7962c@group.calendar.google.com'
};
const SUPPRESS = [
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

function task(id, calendarId) {
  return {
    taskId: id,
    status: 'open',
    due: '2026-12-15',
    start: '2026-12-15T14:00:00.000Z',
    timeZone: 'America/New_York',
    calendarId: calendarId || IDS.sales,
    summary: 'ACTION — LVPT — ' + id,
    description: 'LVPT INTERNAL ACTION REMINDER\nTask ID: ' + id
  };
}
function managed(id, taskId, status, transparency) {
  return {
    calendarId: IDS.operations,
    event: {
      id: id,
      status: status || 'confirmed',
      transparency: transparency,
      description: 'LVPT INTERNAL ACTION REMINDER\nTask ID: ' + taskId,
      extendedProperties: { private: { lvptManaged: 'taskSyncV1', lvptTaskId: taskId, lvptDueDate: '2026-12-15' } },
      start: { dateTime: '2026-12-15T14:00:00.000Z' },
      end: { dateTime: '2026-12-15T14:15:00.000Z' },
      etag: 'fresh-' + id
    }
  };
}
function scan(events) {
  return {
    complete: true,
    calendarIds: [IDS.sales, IDS.proposals, IDS.operations, IDS.confirmed],
    events: events || []
  };
}
function decide(overrides) {
  const input = Object.assign({
    scanComplete: true,
    cancellationComplete: true,
    lockHeld: true,
    writerEnabled: true,
    ledger: [
      { history_key: 'ledger_ready', observation: 'ledger_ready', outcome: 'complete', task_id: '' },
      { history_key: 'writer_enabled', observation: 'writer_enabled', outcome: 'new_tasks_only', task_id: '' }
    ],
    calendarIds: IDS,
    cancellationScan: scan(),
    events: [],
    tasks: [],
    ownerEmail: 'book@pokertraininglasvegas.com',
    nowIso: '2026-11-22T04:00:00.000Z',
    runId: 'test'
  }, overrides || {});
  return context.lvptDecideSafeSync_(input);
}

const historical = SUPPRESS.concat(['gmail-task-existing-managed']);
const events = historical.filter(function (id) { return id !== 'gmail-task-existing-managed'; }).map(function (id, index) {
  return managed('cancelled-' + index, id, 'cancelled', 'transparent');
});
events.push(managed('managed-existing', 'gmail-task-existing-managed', 'confirmed', 'transparent'));
events.push({
  calendarId: IDS.sales,
  event: {
    id: 'client-booking',
    status: 'confirmed',
    transparency: 'opaque',
    attendees: [{ email: 'guest@example.com' }],
    description: 'Client appointment',
    start: { dateTime: '2026-12-15T16:00:00.000Z' },
    end: { dateTime: '2026-12-15T17:00:00.000Z' }
  }
});
const built = context.lvptBuildInitialHistory_({
  scanComplete: true,
  cancellationComplete: true,
  taskIds: historical,
  events: events,
  ownerEmail: 'book@pokertraininglasvegas.com',
  runId: 'init',
  nowIso: '2026-11-22T04:00:00.000Z'
});
assert.equal(built.ok, true);
assert.equal(built.taskCount, 20);
assert.equal(built.cancelledManagedRecords, 19);
assert.equal(built.managedAssociations, 1);
const ready = context.lvptReadyHistoryRow_(built, 'init', '2026-11-22T04:00:00.000Z');
const firstAppend = context.lvptNewLedgerRows_([], built.rows.concat([ready]));
const secondAppend = context.lvptNewLedgerRows_(firstAppend, built.rows.concat([ready]));
assert.equal(secondAppend.length, 0);
assert.equal(context.lvptBuildInitialHistory_({ scanComplete: false }).ok, false);

const ledger = firstAppend.concat([
  { history_key: 'writer_enabled', observation: 'writer_enabled', outcome: 'new_tasks_only', task_id: '' }
]);
const protectedDecision = decide({
  ledger: ledger,
  events: events,
  cancellationScan: scan(events),
  tasks: historical.map(function (id) { return task(id); })
});
assert.equal(protectedDecision.ok, true);
assert.equal(protectedDecision.creates.length, 0);

const newTask = task('gmail-task-new-after-baseline');
const newDecision = decide({
  ledger: ledger,
  events: events,
  cancellationScan: scan(events),
  tasks: historical.map(function (id) { return task(id); }).concat([newTask])
});
assert.equal(newDecision.creates.length, 1);
assert.equal(newDecision.creates[0].taskId, newTask.taskId);
assert.equal(newDecision.creates[0].body.transparency, 'transparent');
assert.equal(newDecision.creates[0].body.attendees, undefined);

const store = {};
let inserts = 0;
const io = {
  getEvent: function (_calendarId, eventId) { return store[eventId] || null; },
  insertEvent: function (calendarId, body) {
    inserts += 1;
    const event = Object.assign({}, body, {
      id: body.id,
      status: 'confirmed',
      extendedProperties: body.extendedProperties
    });
    store[body.id] = event;
    assert.equal(calendarId, IDS.sales);
    return event;
  }
};
const applied = context.lvptApplyCreates_(newDecision.creates, io, ledger, 'run-1', '2026-11-22T04:10:00.000Z');
assert.equal(inserts, 1);
assert.equal(applied.inserted.length, 1);
const eventId = applied.inserted[0].eventId;
assert.equal(eventId, context.lvptStableEventId_(newTask.taskId));
const created = store[eventId];
assert.equal(Date.parse(created.end.dateTime) - Date.parse(created.start.dateTime), 15 * 60000);
const second = decide({
  ledger: ledger.concat(applied.ledgerRows),
  events: events.concat([{ calendarId: IDS.sales, event: created }]),
  cancellationScan: scan(events),
  tasks: historical.map(function (id) { return task(id); }).concat([newTask])
});
const appliedAgain = context.lvptApplyCreates_(second.creates, io, ledger.concat(applied.ledgerRows), 'run-2', '2026-11-22T05:00:00.000Z');
assert.equal(second.creates.length, 0);
assert.equal(appliedAgain.inserted.length, 0);
assert.equal(inserts, 1);

created.status = 'cancelled';
const cancelledLedger = ledger.concat(applied.ledgerRows).concat([{
  history_key: 'cancelled:' + IDS.sales + ':' + eventId,
  observation: 'cancelled_managed',
  outcome: 'retained',
  task_id: newTask.taskId,
  calendar_id: IDS.sales,
  event_id: eventId
}]);
const afterCancel = decide({
  ledger: cancelledLedger,
  events: [],
  cancellationScan: scan([]),
  tasks: [newTask]
});
const cancelledApply = context.lvptApplyCreates_(afterCancel.creates, io, cancelledLedger, 'run-3', '2026-11-22T06:00:00.000Z');
assert.equal(afterCancel.creates.length, 0);
assert.equal(cancelledApply.inserted.length, 0);

const incomplete = decide({ scanComplete: false, lockHeld: true });
assert.equal(incomplete.ok, false);
assert.equal(incomplete.creates.length, 0);
const unlocked = decide({ lockHeld: false });
assert.equal(unlocked.ok, false);

const failingIo = {
  getEvent: function () { throw new Error('Calendar get failed'); },
  insertEvent: function () { throw new Error('insert should not run'); }
};
const failedApply = context.lvptApplyCreates_(newDecision.creates, failingIo, ledger, 'fail', '2026-11-22T04:20:00.000Z');
assert.equal(failedApply.inserted.length, 0);
assert.equal(failedApply.failed[0].outcome, 'retryable');
assert.equal(failedApply.failed[0].retried, false);

const occupied = {};
const occupiedIo = {
  getEvent: function () { return { id: 'other', status: 'confirmed', extendedProperties: { private: {} } }; },
  insertEvent: function () { throw new Error('insert should not run'); }
};
const occupiedApply = context.lvptApplyCreates_(newDecision.creates, occupiedIo, ledger, 'occupied', '2026-11-22T04:30:00.000Z');
assert.equal(occupiedApply.failed[0].outcome, 'permanent');
const noRetry = context.lvptApplyCreates_(newDecision.creates, occupiedIo, ledger.concat(occupiedApply.ledgerRows), 'occupied-2', '2026-11-22T04:40:00.000Z');
assert.equal(noRetry.failed[0].retried, false);
assert.equal(noRetry.inserted.length, 0);

const drift = decide({
  ledger: ledger,
  events: [managed('managed-existing', 'gmail-task-existing-managed', 'confirmed', 'transparent')],
  tasks: [Object.assign(task('gmail-task-existing-managed', IDS.operations), { due: '2026-12-20' })]
});
assert.equal(drift.creates.length, 0);
assert.equal(drift.dueDrifts.length, 1);
assert.equal(drift.dueDrifts[0].taskDue, '2026-12-20');

const fresh = {};
context.LVPT_TRANSPARENCY_ALLOWLIST.forEach(function (spec) {
  fresh[spec.eventId] = {
    id: spec.eventId,
    status: 'confirmed',
    transparency: null,
    etag: 'fresh-etag-' + spec.eventId,
    start: { dateTime: '2026-12-15T14:00:00.000Z' },
    end: { dateTime: '2026-12-15T14:15:00.000Z' },
    extendedProperties: { private: { lvptManaged: 'taskSyncV1', lvptTaskId: spec.taskId } }
  };
});
const patches = [];
const transparency = context.lvptExecuteTransparency_(fresh, {
  patchEvent: function (calendarId, eventId, resource, optionalArguments, headers) {
    patches.push({ calendarId: calendarId, eventId: eventId, resource: resource, headers: headers, optionalArguments: optionalArguments });
  }
}, 'transparency', '2026-11-22T07:00:00.000Z');
assert.equal(transparency.patched, 18);
assert.equal(patches.length, 18);
assert.equal(JSON.stringify(patches[0].resource), JSON.stringify({ transparency: 'transparent' }));
assert.equal(patches[0].headers['If-Match'].indexOf('3589157238401502'), -1);
assert.equal(patches[0].headers['If-Match'].indexOf('fresh-etag-'), 0);
fresh[context.LVPT_TRANSPARENCY_ALLOWLIST[0].eventId].attendees = [{ email: 'guest@example.com' }];
const skipped = context.lvptExecuteTransparency_(fresh, {
  patchEvent: function () { throw new Error('unsafe patch'); }
}, 'transparency-2', '2026-11-22T07:10:00.000Z');
assert.equal(skipped.results.filter(function (row) { return row.eventId === context.LVPT_TRANSPARENCY_ALLOWLIST[0].eventId && row.patched; }).length, 0);

console.log('calendar-safe-sync: synthetic checks passed');
