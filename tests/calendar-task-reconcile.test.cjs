/**
 * Synthetic calendar reconciliation. No Google API calls.
 *
 * Payment reconciliation stays in public/sms-review/reconciliation.js
 * (checkCase) and public/sms-review/action-queue.js (buildQueue).
 * Email approval stays in app/api/sms/staging/reply-send/route.ts and
 * Apps Script lvptStep48SendApprovedReply_. TaskSync does not decide
 * Paid In Full and does not send mail.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('apps-script/calendar-command-center/TaskSync.js', 'utf8');
const sandbox = {
  console: { log() {}, error() {} },
  Intl, Date, Map, Set, Object, String, Array, Error, RegExp, Math, JSON, Number
};
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: 'TaskSync.js' });
function unwrap(value) {
  return JSON.parse(JSON.stringify(value));
}
const plan = sandbox.lvptPlanTaskCalendarSync_;
const apply = sandbox.lvptApplyTaskCalendarChanges_;
assert.equal(typeof plan, 'function', 'lvptPlanTaskCalendarSync_ is missing');
assert.equal(typeof apply, 'function', 'lvptApplyTaskCalendarChanges_ is missing');
assert.equal(source.includes('UrlFetchApp'), false);
assert.equal(source.includes('getOAuthToken'), false);
assert.equal(source.includes('newTrigger'), false);
assert.equal(sandbox.LVPT_SYNC_CONFIG.conferenceRestClear, false);
assert.match(source, /function runLVPTTaskSync\(/);

const CAL = {
  sales: 'cal-sales',
  proposals: 'cal-proposals',
  operations: 'cal-operations',
  confirmed: 'cal-confirmed'
};
const NOW = new Date('2026-11-12T16:00:00.000Z');

function task(overrides) {
  return Object.assign({
    task_id: 'task-ops-0001',
    event_id: 'evt-sample',
    task: 'Collect venue invoice from vendor',
    due_date: '2026-12-01',
    priority: 'High',
    status: 'open',
    notes: ''
  }, overrides);
}

function input(events, rows) {
  return {
    now: NOW,
    calendarIds: Object.assign({}, CAL),
    companies: { 'evt-sample': 'Northwind Studio' },
    taskRows: rows || [task()],
    events: events || []
  };
}

function eventFrom(body, overrides) {
  return Object.assign({
    id: 'rem-keep',
    status: 'confirmed',
    summary: body.summary,
    description: body.description,
    start: body.start,
    end: body.end,
    transparency: body.transparency,
    reminders: body.reminders,
    extendedProperties: body.extendedProperties
  }, overrides);
}

const created = plan(input());
assert.equal(created.ok, true, created.error);
assert.equal(created.changes.length, 1);
assert.equal(created.changes[0].kind, 'create');
assert.equal(created.scannedCalendarIds.length, 4);
assert.deepEqual(unwrap(created.scannedCalendarIds).sort(), Object.values(CAL).slice().sort());
const body = created.changes[0].target.body;
assert.equal(created.changes[0].target.calendarId, CAL.operations);
assert.notEqual(created.changes[0].target.calendarId, CAL.confirmed);
assert.equal(new Date(body.end.dateTime) - new Date(body.start.dateTime), 15 * 60000);
assert.equal(body.transparency, 'transparent');
assert.equal(body.conferenceData, undefined);
assert.equal(body.hangoutLink, undefined);
assert.equal(body.recurrence, undefined);
assert.equal(body.attendees, undefined);
assert.match(body.description, /^LVPT INTERNAL ACTION REMINDER/);

const stored = eventFrom(body);
const again = plan(input([{ calendarId: CAL.operations, event: stored, fromManagedQuery: true }]));
assert.equal(again.ok, true);
assert.deepEqual(unwrap(again.changes), []);
assert.equal(again.unchanged, 1);

const duplicates = ['cal-sales', 'cal-proposals', 'cal-operations', 'cal-confirmed'].map((calendarId, index) => ({
  calendarId,
  fromManagedQuery: true,
  event: eventFrom(body, { id: index === 2 ? 'rem-keep' : 'rem-dup-' + calendarId })
}));
const deduped = plan(input(duplicates));
assert.equal(deduped.ok, true);
assert.equal(deduped.changes.filter(change => change.kind === 'create').length, 0);
assert.equal(deduped.changes.filter(change => change.kind === 'remove_duplicate').length, 3);
assert.ok(deduped.changes.every(change => change.classification === 'managed_internal_reminder'));
const removedCalendars = deduped.changes.map(change => change.reminder.calendarId).sort();
assert.deepEqual(unwrap(removedCalendars), [CAL.sales, CAL.proposals, CAL.confirmed].sort());

const clientBooking = {
  calendarId: CAL.confirmed,
  fromManagedQuery: false,
  event: {
    id: 'client-booking',
    status: 'confirmed',
    summary: 'Northwind Studio private session',
    description: 'Actual customer booking',
    attendees: [{ email: 'guest@example.com' }],
    start: { dateTime: '2026-12-01T18:00:00.000Z' },
    end: { dateTime: '2026-12-01T20:00:00.000Z' },
    hangoutLink: 'https://meet.google.com/real-client-meet',
    conferenceData: { conferenceId: 'real-meet', conferenceDataVersion: 2, entryPoints: [{ uri: 'https://meet.google.com/real-client-meet' }] }
  }
};
const unrelated = {
  calendarId: CAL.sales,
  fromManagedQuery: false,
  event: {
    id: 'unrelated-block',
    status: 'confirmed',
    summary: 'Internal lunch',
    description: 'Not a task reminder',
    start: { dateTime: '2026-12-01T17:00:00.000Z' },
    end: { dateTime: '2026-12-01T18:00:00.000Z' }
  }
};
const withBystanders = plan(input([
  { calendarId: CAL.operations, event: stored, fromManagedQuery: true },
  clientBooking,
  unrelated
]));
assert.equal(withBystanders.changes.length, 0);
assert.equal(JSON.stringify(withBystanders.changes).includes('client-booking'), false);
assert.equal(JSON.stringify(withBystanders.changes).includes('unrelated-block'), false);
assert.ok(withBystanders.protected.some(item => item.eventId === 'client-booking' && item.classification === 'customer_or_attended_event'));

const meetEvent = eventFrom(body, {
  id: 'rem-meet',
  hangoutLink: 'https://meet.google.com/aaa-bbbb-ccc',
  conferenceData: {
    conferenceId: 'fake-meet',
    conferenceDataVersion: 4,
    entryPoints: [{ entryPointType: 'video', uri: 'https://meet.google.com/aaa-bbbb-ccc' }]
  }
});
const meetPlan = plan(input([
  { calendarId: CAL.operations, event: meetEvent, fromManagedQuery: true },
  clientBooking
]));
assert.equal(meetPlan.changes.length, 1);
assert.equal(meetPlan.changes[0].kind, 'clear_conference');
assert.equal(meetPlan.changes[0].classification, 'managed_internal_reminder');
assert.equal(meetPlan.changes[0].reminder.event.id, 'rem-meet');
assert.equal(JSON.stringify(meetPlan.changes).includes('client-booking'), false);

const longEvent = eventFrom(body, {
  id: 'rem-long',
  transparency: 'opaque',
  end: { dateTime: new Date(new Date(body.start.dateTime).getTime() + 120 * 60000).toISOString() }
});
const longPlan = plan(input([{ calendarId: CAL.operations, event: longEvent, fromManagedQuery: true }]));
const durationPatch = longPlan.changes.find(change => change.kind === 'patch_managed');
assert.ok(durationPatch);
assert.equal(durationPatch.classification, 'managed_internal_reminder');
assert.equal(durationPatch.fields.transparency, 'transparent');
assert.equal(new Date(durationPatch.fields.end.dateTime) - new Date(durationPatch.fields.start.dateTime), 15 * 60000);
assert.equal(durationPatch.fields.recurrence.length, 0);
assert.equal(longPlan.changes.some(change => change.kind === 'create'), false);

const recurring = eventFrom(body, {
  id: 'rem-weekly',
  recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR']
});
const recurringPlan = plan(input([{ calendarId: CAL.operations, event: recurring, fromManagedQuery: true }]));
assert.equal(recurringPlan.changes.some(change => change.kind === 'replace_recurring'), true);
assert.equal(recurringPlan.changes.some(change => change.kind === 'create'), false);
assert.equal(recurringPlan.changes.find(change => change.kind === 'replace_recurring').target.body.recurrence, undefined);

const attended = eventFrom(body, {
  id: 'attended-task-lookalike',
  attendees: [{ email: 'guest@example.com' }]
});
const attendedPlan = plan(input([
  { calendarId: CAL.confirmed, event: attended, fromManagedQuery: true },
  clientBooking
]));
assert.equal(JSON.stringify(attendedPlan.changes).includes('attended-task-lookalike'), false);
assert.equal(JSON.stringify(attendedPlan.changes).includes('client-booking'), false);
assert.equal(attendedPlan.changes.filter(change => change.kind === 'create').length, 1);
assert.equal(attendedPlan.protected.filter(item => item.eventId === 'attended-task-lookalike').length, 1);

const manualMeet = eventFrom(body, {
  id: 'manual-meet',
  hangoutLink: 'https://meet.google.com/manual-link',
  conferenceData: { conferenceId: 'manual', conferenceDataVersion: 1, entryPoints: [{ uri: 'https://meet.google.com/manual-link' }] },
  extendedProperties: { private: {} }
});
const manualPlan = plan(input([{ calendarId: CAL.operations, event: manualMeet, fromManagedQuery: false }]));
assert.equal(manualPlan.changes.length, 0);
assert.match(manualPlan.issues.join('\n'), /preserved/i);

const unknown = plan(input(
  [{ calendarId: CAL.operations, event: stored, fromManagedQuery: true }],
  [task({ status: 'needs-review' })]
));
assert.equal(unknown.ok, true);
assert.deepEqual(unwrap(unknown.changes), []);
assert.equal(unknown.unchanged, 1);

const unknownWithoutReminder = plan(input([], [task({ status: 'mystery-state' })]));
assert.equal(unknownWithoutReminder.ok, true);
assert.deepEqual(unwrap(unknownWithoutReminder.changes), []);

const blankId = plan(input([], [task({ task_id: '' }), task()]));
assert.equal(blankId.ok, true);
assert.equal(blankId.changes.filter(change => change.kind === 'create').length, 1);

const duplicateIds = plan(input([], [task(), task({ task: 'Second row same id' })]));
assert.equal(duplicateIds.ok, false);
assert.deepEqual(unwrap(duplicateIds.changes), []);

const missingTitle = plan(input([], [task({ task: '   ' })]));
assert.equal(missingTitle.ok, false);
assert.deepEqual(unwrap(missingTitle.changes), []);

const undated = plan(input(
  [{ calendarId: CAL.operations, event: stored, fromManagedQuery: true }],
  [task({ due_date: '' })]
));
assert.equal(undated.ok, true);
assert.deepEqual(unwrap(undated.changes), []);
assert.equal(undated.unchanged, 1);

const missingCalendar = plan(Object.assign(input(), {
  calendarIds: { sales: CAL.sales, proposals: CAL.proposals, operations: CAL.operations }
}));
assert.equal(missingCalendar.ok, false);
assert.deepEqual(unwrap(missingCalendar.changes), []);

const calls = [];
const api = {
  conferenceRestClear: false,
  insert(resource, calendarId, options) {
    calls.push({ op: 'insert', resource, calendarId, options });
    return { id: 'created-1' };
  },
  patch() { throw new Error('Advanced Service patch must not clear Meet'); },
  remove() { throw new Error('unexpected remove'); },
  restPatch() { throw new Error('REST clear is disabled'); }
};
apply(meetPlan.changes, api);
assert.equal(calls.length, 0);
const restCalls = [];
apply(meetPlan.changes, {
  conferenceRestClear: true,
  restPatch(request) {
    restCalls.push(request);
    return { status: 200 };
  },
  insert() { throw new Error('unexpected insert'); },
  patch() { throw new Error('Advanced Service patch must not clear Meet'); },
  remove() { throw new Error('unexpected remove'); }
});
assert.equal(restCalls.length, 1);
assert.equal(restCalls[0].payload, '{"conferenceData":null}');
assert.equal(restCalls[0].conferenceDataVersion, 1);
assert.equal(restCalls[0].sendUpdates, 'none');
assert.match(restCalls[0].url, /[?&]conferenceDataVersion=1(?:&|$)/);
assert.match(restCalls[0].url, /[?&]sendUpdates=none(?:&|$)/);
assert.equal(restCalls[0].url.includes('conferenceDataVersion=4'), false);
assert.match(restCalls[0].url, /\/events\/rem-meet\?/);
const cleared = eventFrom(body, { id: 'rem-meet' });
const afterClear = plan(input([{ calendarId: CAL.operations, event: cleared, fromManagedQuery: true }]));
assert.deepEqual(unwrap(afterClear.changes), []);

assert.throws(() => apply([{
  kind: 'clear_conference',
  classification: 'managed_internal_reminder',
  confirmedCalendarId: CAL.confirmed,
  reminder: {
    managed: true,
    calendarId: CAL.confirmed,
    event: clientBooking.event
  }
}], api));
assert.equal(calls.length, 0);
assert.equal(restCalls.length, 1);

const partial = [];
assert.throws(() => apply([
  created.changes[0],
  {
    kind: 'remove',
    classification: 'managed_internal_reminder',
    confirmedCalendarId: CAL.confirmed,
    reminder: { managed: true, calendarId: CAL.confirmed, event: clientBooking.event }
  }
], {
  insert() { partial.push('insert'); },
  patch() { partial.push('patch'); },
  remove() { partial.push('remove'); }
}));
assert.deepEqual(partial, []);

const repeatStore = [];
apply(created.changes, {
  insert(resource, calendarId, options) {
    assert.equal(resource.transparency, 'transparent');
    assert.equal(resource.conferenceData, undefined);
    assert.equal(resource.recurrence, undefined);
    assert.equal(options.sendUpdates, 'none');
    repeatStore.push({
      calendarId,
      fromManagedQuery: true,
      event: eventFrom(resource, { id: 'created-once' })
    });
    return { id: 'created-once' };
  },
  patch() { throw new Error('unexpected patch'); },
  remove() { throw new Error('unexpected remove'); }
});
const third = plan(input(repeatStore));
assert.deepEqual(unwrap(third.changes), []);
assert.equal(third.unchanged, 1);
const fourth = plan(input(repeatStore));
assert.deepEqual(unwrap(fourth.changes), []);

const selfHeld = eventFrom(body, {
  id: 'rem-self',
  attendees: [{ email: 'book@pokertraininglasvegas.com', self: true, organizer: true }]
});
const selfPlan = plan(input([{ calendarId: CAL.operations, event: selfHeld, fromManagedQuery: true }]));
const selfAgain = plan(input([{ calendarId: CAL.operations, event: selfHeld, fromManagedQuery: true }]));
assert.deepEqual(unwrap(selfPlan.changes), []);
assert.deepEqual(unwrap(selfAgain.changes), []);

const confirmedLookalike = {
  calendarId: CAL.confirmed,
  fromManagedQuery: false,
  event: eventFrom(body, { id: 'confirmed-lookalike', extendedProperties: { private: {} } })
};
const keptConfirmed = plan(input([confirmedLookalike, clientBooking]));
const keptConfirmedAgain = plan(input([confirmedLookalike, clientBooking]));
assert.equal(keptConfirmed.changes.length, 0);
assert.equal(keptConfirmedAgain.changes.length, 0);
assert.ok(keptConfirmed.protected.some(item => item.eventId === 'confirmed-lookalike' && item.reason === 'confirmed_calendar_unmanaged'));
assert.equal(JSON.stringify(keptConfirmed.changes).includes('client-booking'), false);

const moved = plan(input([
  { calendarId: CAL.confirmed, fromManagedQuery: true, event: eventFrom(body, { id: 'managed-on-confirmed' }) },
  clientBooking
]));
assert.equal(moved.changes.some(change => change.kind === 'replace_managed' && change.prior.event.id === 'managed-on-confirmed'), true);
assert.equal(moved.changes.some(change => change.target && change.target.calendarId === CAL.operations), true);
assert.equal(JSON.stringify(moved.changes).includes('client-booking'), false);

const weeklyClient = {
  calendarId: CAL.confirmed,
  fromManagedQuery: false,
  event: {
    id: 'weekly-client',
    status: 'confirmed',
    summary: 'Northwind weekly game',
    description: 'Standing client session',
    recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=TU'],
    start: { dateTime: '2026-12-01T18:00:00.000Z' },
    end: { dateTime: '2026-12-01T20:00:00.000Z' }
  }
};
const weeklyPlan = plan(input([weeklyClient]));
assert.equal(weeklyPlan.changes.length, 1);
assert.equal(weeklyPlan.changes[0].kind, 'create');
assert.equal(weeklyPlan.changes[0].target.calendarId, CAL.operations);
assert.equal(JSON.stringify(weeklyPlan.changes).includes('weekly-client'), false);

const busyReminder = eventFrom(body, {
  id: 'busy-internal',
  transparency: 'opaque'
});
const paidClient = {
  calendarId: CAL.confirmed,
  fromManagedQuery: false,
  event: {
    id: 'kristin-booking',
    status: 'confirmed',
    summary: 'CONFIRMED — Kristin / Ethan — 6-person private poker training',
    description: 'LVPT CONFIRMED CLIENT BOOKING. Paid in full. Not an internal task reminder.',
    start: { dateTime: '2026-11-14T04:30:00.000Z' },
    end: { dateTime: '2026-11-14T06:30:00.000Z' },
    transparency: 'opaque',
    location: 'The Venetian Poker Room, Las Vegas, NV'
  }
};
const legacyOwnerReminder = {
  calendarId: CAL.operations,
  fromManagedQuery: false,
  event: {
    id: 'legacy-nium-meet',
    status: 'confirmed',
    summary: 'ACTION — NIUM — Verify remaining deliveries and archive photos',
    description: '<p>LVPT INTERNAL OWNER REMINDER — not a client appointment.\nTask ID: task-ops-0001\nAlready confirmed: client invoices PAID IN FULL. Do not request final-invoice payment again.</p>\nJoin with Google Meet: https://meet.google.com/nqe-mxhb-zda',
    start: { dateTime: '2026-11-09T14:30:00.000Z' },
    end: { dateTime: '2026-11-09T14:45:00.000Z' },
    transparency: 'transparent',
    hangoutLink: 'https://meet.google.com/nqe-mxhb-zda',
    conferenceData: { conferenceId: 'nqe-mxhb-zda', entryPoints: [{ uri: 'https://meet.google.com/nqe-mxhb-zda' }] }
  }
};
const safePatch = plan(input([
  { calendarId: CAL.operations, fromManagedQuery: true, event: busyReminder },
  paidClient,
  legacyOwnerReminder
]));
assert.equal(safePatch.ok, true, safePatch.error);
assert.equal(safePatch.counts.patchManaged, 1);
assert.equal(safePatch.counts.clearConference, 0);
assert.equal(safePatch.counts.remove, 0);
assert.equal(safePatch.changes.length, 1);
const onlyChange = safePatch.changes[0];
assert.equal(onlyChange.kind, 'patch_managed');
assert.equal(onlyChange.prior.event.id, 'busy-internal');
assert.deepEqual(unwrap(onlyChange.reasons), ['transparency']);
assert.equal(onlyChange.fields.transparency, 'transparent');
assert.equal(onlyChange.fields.start, undefined);
assert.equal(onlyChange.fields.end, undefined);
assert.equal(onlyChange.fields.conferenceData, undefined);
assert.equal(onlyChange.fields.attendees, undefined);
assert.equal(JSON.stringify(safePatch.changes).includes('kristin-booking'), false);
assert.equal(JSON.stringify(safePatch.changes).includes('legacy-nium-meet'), false);
assert.equal(onlyChange.fields.summary, busyReminder.summary);
assert.equal(onlyChange.fields.description, busyReminder.description);

console.log('calendar-task-reconcile: ok');
