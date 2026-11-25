/**
 * Read-only integration of the safe decision engine.
 * No Google calls.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const sandbox = {
  console: { log() {} },
  Date, Map, Set, Object, String, Array, Error, JSON, Math, isFinite, isNaN
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync('apps-script/calendar-command-center/TaskSync.safe-review.js', 'utf8'), sandbox);
vm.runInContext(fs.readFileSync('apps-script/calendar-command-center/TaskSync.safe-integrate.js', 'utf8'), sandbox);

const CAL = {
  sales: 'cal-sales',
  proposals: 'cal-proposals',
  operations: 'cal-operations',
  confirmed: 'cal-confirmed'
};
const OPS = 'c_a9756e49c39a571a2c21d99524f4c226e1772fca9f0c4156e245d5fd7d941a2a@group.calendar.google.com';
const CONFIRMED = 'c_972d7e50b66cba545967cf0f8de32d22990e6e8aa98051bdfa34b9122ed7962c@group.calendar.google.com';

function managed(id, taskId, transparency) {
  return {
    calendarId: CAL.operations,
    event: {
      id: id,
      status: 'confirmed',
      transparency: transparency,
      description: 'LVPT INTERNAL ACTION REMINDER\nTask ID: ' + taskId,
      extendedProperties: { private: { lvptManaged: 'taskSyncV1', lvptTaskId: taskId } }
    }
  };
}

const duplicates = [
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
  'gmail-task-1a191299d3c0dd3d-clientdecision'
];
const handoff = JSON.parse(fs.readFileSync('tests/fixtures/LVPT_Phase7I_Verified_Event_Handoff.json', 'utf8'));
assert.equal(handoff.patchCandidates.length, 18);

const events = [];
const rows = [];
duplicates.forEach(function (taskId, index) {
  events.push({
    calendarId: CAL.operations,
    event: Object.assign({}, managed('cancelled-' + index, taskId, 'opaque').event, { status: 'cancelled' })
  });
  events.push({
    calendarId: CAL.operations,
    event: {
      id: 'legacy-' + index,
      status: 'confirmed',
      transparency: 'transparent',
      description: 'LVPT INTERNAL OWNER REMINDER\nTask ID: ' + taskId
    }
  });
  rows.push({ task_id: taskId, status: 'open', due_date: '2026-11-12' });
});
events.push({
  calendarId: OPS,
  event: {
    id: 'kg49e1cfu2o9rvtkbq0l3erdeg',
    status: 'confirmed',
    transparency: 'transparent',
    description: 'INTERNAL OWNER REMINDER\nTask ID: gmail-\ntask-1a1564e8e21a05f3-production',
    attendees: [{ email: 'book@pokertraininglasvegas.com', self: true }]
  }
});
events.push({
  calendarId: CONFIRMED,
  event: {
    id: 'd0679uii6sfi6ig6metb4u21vc',
    status: 'confirmed',
    transparency: 'transparent',
    description: 'LVPT INTERNAL OWNER REMINDER\nTask ID: gmail-\ntask-1a189f1dffa1d00f-production'
  }
});
rows.push({ task_id: 'gmail-task-1a1564e8e21a05f3-production', status: 'open', due_date: '11/9/2026' });
rows.push({ task_id: 'gmail-task-1a189f1dffa1d00f-production', status: 'open', due_date: '11/9/2026' });
handoff.patchCandidates.forEach(function (row) {
  events.push(managed(row.eventId, row.taskId, null));
  rows.push({ task_id: row.taskId, status: 'open', due_date: '2026-11-21' });
});
for (let i = 0; i < 15; i++) {
  const id = 'gmail-task-unchanged-' + i;
  events.push(managed('free-' + i, id, 'transparent'));
  rows.push({ task_id: id, status: 'in progress', due_date: '2026-11-22' });
}
events.push({
  calendarId: CAL.confirmed,
  event: {
    id: 'client-booking',
    status: 'confirmed',
    description: 'Confirmed client booking',
    attendees: [{ email: 'guest@client.example' }]
  }
});

const input = {
  inventoryComplete: true,
  scanComplete: true,
  calendarIds: CAL,
  cancellationScan: {
    complete: true,
    calendarIds: [CAL.sales, CAL.proposals, CAL.operations, CAL.confirmed],
    events: events.filter(function (item) { return item.event.status === 'cancelled'; })
  },
  events: events.filter(function (item) { return item.event.status !== 'cancelled'; }),
  taskRows: rows
};

const first = sandbox.lvptDryRunSafeDecisions_(input);
const second = sandbox.lvptDryRunSafeDecisions_(input);
assert.equal(first.ok, true);
assert.equal(first.writes.length, 0);
assert.equal(second.writes.length, 0);
assert.equal(first.counts.suppressCreate, 19);
assert.equal(first.counts.transparencyHeld, 18);
assert.equal(first.counts.noChange, 33);
assert.equal(first.decisions.length, 52);
assert.equal(JSON.stringify(first.writes).includes('client-booking'), false);
assert.equal(JSON.stringify(second.decisions), JSON.stringify(first.decisions));
const certapro = first.decisions.find(function (row) { return row.taskId === 'gmail-task-1a1564e8e21a05f3-production'; });
const cowbell = first.decisions.find(function (row) { return row.taskId === 'gmail-task-1a189f1dffa1d00f-production'; });
assert.equal(certapro.decision, 'SUPPRESS CREATE');
assert.equal(certapro.eventIds.includes('kg49e1cfu2o9rvtkbq0l3erdeg'), true);
assert.equal(cowbell.decision, 'SUPPRESS CREATE');
assert.equal(cowbell.eventIds.includes('d0679uii6sfi6ig6metb4u21vc'), true);

const queries = sandbox.lvptSafeDiscoveryQueries_('taskSyncV1');
assert.equal(queries.active.some(function (query) { return query.q === 'LVPT INTERNAL'; }), true);
assert.equal(queries.active.some(function (query) { return query.q === 'INTERNAL OWNER REMINDER'; }), true);
assert.equal(queries.cancellation[0].showDeleted, true);

const blocked = sandbox.lvptDryRunSafeDecisions_({ inventoryComplete: false, taskRows: rows, events: events });
assert.equal(blocked.ok, false);
assert.equal(blocked.writes.length, 0);
assert.equal(blocked.decisions.length, 0);

console.log('calendar-safe-integrate: synthetic dry-run passed');
