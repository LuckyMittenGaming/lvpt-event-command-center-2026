/**
 * R16 / T27 — safe Calendar task reconciliation (VM + provider stubs only).
 * Loads TaskSync.safe-review + TaskSync.safe-integrate + TaskSync.safe-sync.
 * Never calls live Calendar, Sheets, clasp, or runLVPTSafeTaskSync entry I/O.
 */
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const safeSyncPath = path.join(ROOT, 'apps-script/calendar-command-center/TaskSync.safe-sync.js');
const safeReviewPath = path.join(ROOT, 'apps-script/calendar-command-center/TaskSync.safe-review.js');
const safeIntegratePath = path.join(ROOT, 'apps-script/calendar-command-center/TaskSync.safe-integrate.js');
const retiredLocalPath = path.join(ROOT, 'apps-script/calendar-command-center/TaskSync.js');

const safeSync = fs.readFileSync(safeSyncPath, 'utf8');
const safeReview = fs.readFileSync(safeReviewPath, 'utf8');
const safeIntegrate = fs.readFileSync(safeIntegratePath, 'utf8');
const retiredLocal = fs.readFileSync(retiredLocalPath, 'utf8');

assert.match(safeSync, /function runLVPTSafeTaskSync\(/);
assert.equal(/function runLVPTTaskSync\s*\(/.test(safeSync), false);
assert.equal(/function runLVPTTaskSync\s*\(/.test(safeReview), false);
assert.equal(/function runLVPTTaskSync\s*\(/.test(safeIntegrate), false);
assert.match(safeSync, /The old runLVPTTaskSync stays retired/);
assert.match(retiredLocal, /function runLVPTTaskSync\(/);
assert.equal(retiredLocal.includes('function runLVPTSafeTaskSync'), false);

[
  'UrlFetchApp',
  'GmailApp',
  'MailApp',
  'ScriptApp',
  'newTrigger',
  'Calendar.Events.remove',
  'Calendar.Events.delete',
  'Calendar.Events.update'
].forEach(function (token) {
  assert.equal(safeSync.includes(token), false, 'safe-sync must not include ' + token);
  assert.equal(safeReview.includes(token), false, 'safe-review must not include ' + token);
});

let calendarTouched = 0;
let sheetsTouched = 0;
const sandbox = {
  console: { log() {}, error() {} },
  Intl,
  Date,
  Map,
  Set,
  Object,
  String,
  Array,
  Error,
  RegExp,
  Math,
  JSON,
  Number,
  isFinite,
  isNaN,
  Utilities: {
    DigestAlgorithm: { SHA_256: 'SHA_256' },
    Charset: { UTF_8: 'UTF_8' },
    computeDigest: function (_algorithm, value) {
      return Array.from(crypto.createHash('sha256').update(String(value)).digest()).map(function (byte) {
        return byte > 127 ? byte - 256 : byte;
      });
    }
  },
  SpreadsheetApp: {
    openById: function () {
      sheetsTouched += 1;
      throw new Error('tests must not open spreadsheets');
    }
  },
  CalendarApp: {
    getCalendarsByName: function () {
      calendarTouched += 1;
      throw new Error('tests must not read live calendars');
    },
    getDefaultCalendar: function () {
      calendarTouched += 1;
      throw new Error('tests must not read the default calendar');
    }
  },
  Calendar: {
    Events: {
      list: function () {
        calendarTouched += 1;
        throw new Error('tests must not list live Calendar events');
      },
      get: function () {
        calendarTouched += 1;
        throw new Error('tests must not get live Calendar events');
      },
      insert: function () {
        calendarTouched += 1;
        throw new Error('tests must not insert live Calendar events');
      },
      patch: function () {
        calendarTouched += 1;
        throw new Error('tests must not patch live Calendar events');
      }
    }
  },
  LockService: {
    getScriptLock: function () {
      throw new Error('tests must not take the live script lock');
    }
  }
};
vm.createContext(sandbox);
vm.runInContext(safeReview, sandbox, { filename: 'TaskSync.safe-review.js' });
vm.runInContext(safeIntegrate, sandbox, { filename: 'TaskSync.safe-integrate.js' });
vm.runInContext(safeSync, sandbox, { filename: 'TaskSync.safe-sync.js' });

assert.equal(typeof sandbox.runLVPTSafeTaskSync, 'function');
assert.equal(typeof sandbox.runLVPTTaskSync, 'undefined');
assert.equal(typeof sandbox.lvptDecideSafeSync_, 'function');
assert.equal(typeof sandbox.lvptPlanSafeReminderActions_, 'function');
assert.equal(typeof sandbox.lvptGateSafeWrites_, 'function');
assert.equal(typeof sandbox.lvptApplyCreates_, 'function');
assert.equal(typeof sandbox.lvptStableEventId_, 'function');

const CAL = {
  sales: 'c_451b7f3ca8c727da168891a0d1d53475beb13c0c649c6157acdd98959b5cc334@group.calendar.google.com',
  proposals: 'c_e68f6233ff8a0e2fb22168ee24da99dc06e0416d652a0e1b964d3a88f5c0935b@group.calendar.google.com',
  operations: 'c_a9756e49c39a571a2c21d99524f4c226e1772fca9f0c4156e245d5fd7d941a2a@group.calendar.google.com',
  confirmed: 'c_972d7e50b66cba545967cf0f8de32d22990e6e8aa98051bdfa34b9122ed7962c@group.calendar.google.com'
};
const SCAN_IDS = [CAL.sales, CAL.proposals, CAL.operations, CAL.confirmed];

function task(overrides) {
  return Object.assign({
    taskId: 'task-recon-0001',
    status: 'open',
    due: '2026-12-15',
    start: '2026-12-15T14:00:00.000Z',
    timeZone: 'America/New_York',
    calendarId: CAL.operations,
    summary: 'ACTION — Northwind — Collect venue invoice',
    description: 'LVPT INTERNAL ACTION REMINDER\nTask ID: task-recon-0001'
  }, overrides || {});
}

function managed(id, taskId, status) {
  return {
    calendarId: CAL.operations,
    event: {
      id: id,
      status: status || 'confirmed',
      transparency: 'transparent',
      summary: 'ACTION — Northwind — Collect venue invoice',
      description: 'LVPT INTERNAL ACTION REMINDER\nTask ID: ' + taskId,
      start: { dateTime: '2026-12-15T14:00:00.000Z', timeZone: 'America/New_York' },
      end: { dateTime: '2026-12-15T14:15:00.000Z', timeZone: 'America/New_York' },
      extendedProperties: {
        private: {
          lvptManaged: 'taskSyncV1',
          lvptTaskId: taskId,
          lvptDueDate: '2026-12-15'
        }
      }
    }
  };
}

function clientMeeting() {
  return {
    calendarId: CAL.confirmed,
    event: {
      id: 'client-booking-real',
      status: 'confirmed',
      summary: 'CONFIRMED — Northwind private session',
      description: 'Actual customer booking. Not an internal reminder.',
      attendees: [{ email: 'guest@client.example' }],
      hangoutLink: 'https://meet.google.com/real-client-meet',
      conferenceData: { conferenceId: 'real-meet' },
      start: { dateTime: '2026-12-01T18:00:00.000Z' },
      end: { dateTime: '2026-12-01T20:00:00.000Z' },
      transparency: 'opaque'
    }
  };
}

function ledgerReady() {
  return [
    { history_key: 'ledger_ready', observation: 'ledger_ready', outcome: 'complete', task_id: '' },
    { history_key: 'writer_enabled', observation: 'writer_enabled', outcome: 'new_tasks_only', task_id: '' }
  ];
}

function decide(overrides) {
  return sandbox.lvptDecideSafeSync_(Object.assign({
    scanComplete: true,
    cancellationComplete: true,
    lockHeld: true,
    writerEnabled: true,
    ledger: ledgerReady(),
    calendarIds: Object.assign({}, CAL),
    cancellationScan: { complete: true, calendarIds: SCAN_IDS.slice(), events: [] },
    events: [],
    tasks: [],
    ownerEmail: 'book@pokertraininglasvegas.com',
    nowIso: '2026-11-22T04:00:00.000Z',
    runId: 'reconcile-test'
  }, overrides || {}));
}

function plan(events, tasks, extra) {
  return sandbox.lvptPlanSafeReminderActions_(Object.assign({
    scanComplete: true,
    lockHeld: true,
    calendarIds: Object.assign({}, CAL),
    cancellationScan: { complete: true, calendarIds: SCAN_IDS.slice(), events: [] },
    events: events || [],
    tasks: tasks || []
  }, extra || {}));
}

function creates(result) {
  return sandbox.lvptGateSafeWrites_(result).allowed.filter(function (change) {
    return change.action === 'CREATE';
  });
}

const stableA = sandbox.lvptStableEventId_('task-stable-alpha');
const stableB = sandbox.lvptStableEventId_('task-stable-beta');
const stableAgain = sandbox.lvptStableEventId_('task-stable-alpha');
assert.equal(stableA, stableAgain);
assert.notEqual(stableA, stableB);
assert.match(stableA, /^lvpt[0-9a-v]+$/);

const duplicateIds = plan([], [task(), task({ summary: 'Second row same id' })]);
assert.equal(creates(duplicateIds).length, 0);
assert.ok(duplicateIds.reviews.some(function (row) {
  return row.action === 'REVIEW' && /duplicate task id/i.test(row.reason);
}));

const openCompletedConflict = plan(
  [managed('rem-conflict', 'task-conflict')],
  [
    task({ taskId: 'task-conflict', status: 'open' }),
    task({ taskId: 'task-conflict', status: 'completed', summary: 'Completed copy' })
  ]
);
assert.equal(creates(openCompletedConflict).length, 0);
assert.ok(openCompletedConflict.reviews.some(function (row) {
  return row.action === 'REVIEW' && /duplicate task id/i.test(row.reason);
}));

const undated = plan([], [task({ due: '', ownerApprovedCreate: true, creationApprovalId: 'create-undated' })]);
assert.equal(creates(undated).length, 0);
assert.ok(undated.reviews.some(function (row) {
  return row.action === 'REVIEW' && /due date/i.test(row.reason);
}));

const impossibleDue = plan([], [task({ due: '2026-02-31', ownerApprovedCreate: true, creationApprovalId: 'create-bad-due' })]);
assert.equal(creates(impossibleDue).length, 0);
assert.ok(impossibleDue.reviews.some(function (row) {
  return row.action === 'REVIEW' && /due date/i.test(row.reason);
}));

const dueToday = plan([], [task({
  taskId: 'task-due-today-cal',
  due: '2026-11-22',
  start: '2026-11-22T15:00:00.000Z',
  description: 'LVPT INTERNAL ACTION REMINDER\nTask ID: task-due-today-cal',
  ownerApprovedCreate: true,
  creationApprovalId: 'create-due-today'
})]);
assert.equal(creates(dueToday).length, 1);
assert.equal(creates(dueToday)[0].due, '2026-11-22');
assert.equal(creates(dueToday)[0].body.transparency, 'transparent');

const futureDue = plan([], [task({
  taskId: 'task-due-future-cal',
  due: '2026-12-15',
  start: '2026-12-15T14:00:00.000Z',
  description: 'LVPT INTERNAL ACTION REMINDER\nTask ID: task-due-future-cal',
  ownerApprovedCreate: true,
  creationApprovalId: 'create-due-future'
})]);
assert.equal(creates(futureDue).length, 1);
assert.equal(creates(futureDue)[0].due, '2026-12-15');

const completed = plan(
  [managed('rem-done', 'task-done')],
  [task({ taskId: 'task-done', status: 'completed' })]
);
assert.equal(creates(completed).length, 0);
assert.equal(completed.reviews[0].action, 'NO CHANGE');
assert.equal(JSON.stringify(completed.writes).includes('remove'), false);

const cancelled = plan(
  [{ calendarId: CAL.operations, event: Object.assign({}, managed('rem-old', 'task-cancel').event, { status: 'cancelled' }) }],
  [task({ taskId: 'task-cancel' })]
);
assert.equal(creates(cancelled).length, 0);
assert.ok(cancelled.reviews.some(function (row) {
  return /cancelled managed reminder/i.test(row.reason);
}));

const withMeeting = plan([clientMeeting()], [task({ taskId: 'task-guest' })]);
assert.equal(creates(withMeeting).length, 0);
assert.equal(JSON.stringify(withMeeting.writes).includes('client-booking-real'), false);
assert.equal(JSON.stringify(withMeeting.reviews).includes('client-booking-real'), false);

const approved = plan([], [task({
  taskId: 'task-new-free',
  ownerApprovedCreate: true,
  creationApprovalId: 'create-2026-11-26',
  description: 'LVPT INTERNAL ACTION REMINDER\nTask ID: task-new-free'
})]);
assert.equal(creates(approved).length, 1);
const body = creates(approved)[0].body;
assert.equal(body.transparency, 'transparent');
assert.equal(body.attendees, undefined);
assert.equal(body.conferenceData, undefined);
assert.equal(body.hangoutLink, undefined);
assert.equal(Array.isArray(body.recurrence) && body.recurrence.length, 0);
assert.equal(Date.parse(body.end.dateTime) - Date.parse(body.start.dateTime), 15 * 60000);

const existing = decide({
  events: [managed('rem-keep', 'task-recon-0001'), clientMeeting()],
  cancellationScan: {
    complete: true,
    calendarIds: SCAN_IDS.slice(),
    events: [managed('rem-keep', 'task-recon-0001')]
  },
  tasks: [task()]
});
assert.equal(existing.ok, true);
assert.equal(existing.creates.length, 0);

const newTask = task({
  taskId: 'task-post-baseline-0007',
  description: 'LVPT INTERNAL ACTION REMINDER\nTask ID: task-post-baseline-0007',
  ownerApprovedCreate: true,
  creationApprovalId: 'create-post-baseline'
});
const firstDecision = decide({
  events: [clientMeeting()],
  cancellationScan: { complete: true, calendarIds: SCAN_IDS.slice(), events: [] },
  tasks: [newTask]
});
assert.equal(firstDecision.ok, true);
assert.equal(firstDecision.creates.length, 1);
assert.equal(firstDecision.creates[0].body.transparency, 'transparent');
assert.equal(firstDecision.creates[0].body.attendees, undefined);
assert.equal(firstDecision.creates[0].body.conferenceData, undefined);
assert.equal(Array.isArray(firstDecision.creates[0].body.recurrence) && firstDecision.creates[0].body.recurrence.length, 0);
assert.equal(
  Date.parse(firstDecision.creates[0].body.end.dateTime) - Date.parse(firstDecision.creates[0].body.start.dateTime),
  15 * 60000
);

const store = {};
let inserts = 0;
const io = {
  getEvent: function (_calendarId, eventId) {
    return store[eventId] || null;
  },
  insertEvent: function (calendarId, resource) {
    inserts += 1;
    assert.equal(calendarId, CAL.operations);
    assert.equal(resource.transparency, 'transparent');
    assert.equal(resource.attendees, undefined);
    assert.equal(resource.conferenceData, undefined);
    assert.equal(resource.hangoutLink, undefined);
    assert.ok(!resource.recurrence || resource.recurrence.length === 0);
    assert.equal(Date.parse(resource.end.dateTime) - Date.parse(resource.start.dateTime), 15 * 60000);
    const event = Object.assign({}, resource, { status: 'confirmed' });
    store[resource.id] = event;
    return event;
  }
};
const applied = sandbox.lvptApplyCreates_(
  firstDecision.creates,
  io,
  ledgerReady(),
  'run-1',
  '2026-11-22T04:10:00.000Z'
);
assert.equal(inserts, 1);
assert.equal(applied.inserted.length, 1);
const createdId = applied.inserted[0].eventId;
assert.equal(createdId, sandbox.lvptStableEventId_(newTask.taskId));

const secondDecision = decide({
  ledger: ledgerReady().concat(applied.ledgerRows),
  events: [{ calendarId: CAL.operations, event: store[createdId] }, clientMeeting()],
  cancellationScan: {
    complete: true,
    calendarIds: SCAN_IDS.slice(),
    events: [{ calendarId: CAL.operations, event: store[createdId] }]
  },
  tasks: [newTask]
});
const appliedAgain = sandbox.lvptApplyCreates_(
  secondDecision.creates,
  io,
  ledgerReady().concat(applied.ledgerRows),
  'run-2',
  '2026-11-22T05:00:00.000Z'
);
assert.equal(secondDecision.creates.length, 0);
assert.equal(appliedAgain.inserted.length, 0);
assert.equal(inserts, 1);

store[createdId].status = 'cancelled';
const afterCancel = decide({
  ledger: ledgerReady().concat(applied.ledgerRows).concat([{
    history_key: 'cancelled:' + CAL.operations + ':' + createdId,
    observation: 'cancelled_managed',
    outcome: 'retained',
    task_id: newTask.taskId,
    calendar_id: CAL.operations,
    event_id: createdId
  }]),
  events: [],
  cancellationScan: { complete: true, calendarIds: SCAN_IDS.slice(), events: [] },
  tasks: [newTask]
});
const cancelledApply = sandbox.lvptApplyCreates_(
  afterCancel.creates,
  io,
  ledgerReady().concat(applied.ledgerRows),
  'run-3',
  '2026-11-22T06:00:00.000Z'
);
assert.equal(afterCancel.creates.length, 0);
assert.equal(cancelledApply.inserted.length, 0);
assert.equal(inserts, 1);
assert.equal(JSON.stringify(afterCancel).includes('client-booking-real'), false);

const duplicateManaged = plan(
  [managed('rem-a', 'task-dupe', 'confirmed'), managed('rem-b', 'task-dupe', 'confirmed')],
  [task({ taskId: 'task-dupe' })]
);
assert.equal(creates(duplicateManaged).length, 0);
assert.ok(duplicateManaged.reviews.some(function (row) {
  return row.action === 'REVIEW' && /duplicate managed reminders/i.test(row.reason);
}));

assert.equal(calendarTouched, 0);
assert.equal(sheetsTouched, 0);

console.log('calendar-task-reconcile: safe TaskSync R16 checks passed');
