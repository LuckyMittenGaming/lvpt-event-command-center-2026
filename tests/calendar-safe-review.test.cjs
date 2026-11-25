/**
 * Decision tests for the undeployed TaskSync review candidate.
 * No Google API calls and no production files are loaded.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('apps-script/calendar-command-center/TaskSync.safe-review.js', 'utf8');
assert.equal(source.includes('Calendar.Events'), false);
assert.equal(source.includes('newTrigger'), false);
assert.equal(source.includes('UrlFetchApp'), false);
assert.equal(source.includes('LockService'), false);

const sandbox = { console: { log() {} }, Date, Map, Set, Object, String, Array, Error, JSON, Math, isFinite, isNaN };
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: 'TaskSync.safe-review.js' });
const plan = sandbox.lvptPlanSafeReminderActions_;
const gate = sandbox.lvptGateSafeWrites_;

const CAL = {
  sales: 'cal-sales',
  proposals: 'cal-proposals',
  operations: 'cal-operations',
  confirmed: 'cal-confirmed'
};
const SCAN_IDS = [CAL.sales, CAL.proposals, CAL.operations, CAL.confirmed];

function managed(id, taskId, calendarId) {
  return {
    calendarId: calendarId || CAL.operations,
    event: {
      id: id,
      status: 'confirmed',
      transparency: 'opaque',
      summary: 'OVERDUE — Sample — File the invoice',
      description: 'LVPT INTERNAL ACTION REMINDER\nTask ID: ' + taskId,
      attendees: [],
      extendedProperties: { private: { lvptManaged: 'taskSyncV1', lvptTaskId: taskId } }
    }
  };
}

function legacy(id, taskId, calendarId) {
  return {
    calendarId: calendarId || CAL.operations,
    event: {
      id: id,
      status: 'confirmed',
      transparency: 'transparent',
      summary: 'Owner note',
      description: '<p>LVPT INTERNAL OWNER REMINDER</p><p>Task ID: ' + taskId + '</p>',
      attendees: [],
      extendedProperties: { private: {} }
    }
  };
}

function task(overrides) {
  return Object.assign({
    taskId: 'task-new-0001',
    status: 'open',
    due: '2026-11-23',
    summary: 'ACTION — Northwind — File the invoice',
    description: 'LVPT INTERNAL ACTION REMINDER\nTask ID: task-new-0001',
    start: '2026-11-23T14:00:00.000Z',
    calendarId: CAL.operations
  }, overrides);
}

function run(events, tasks, extra) {
  return plan(Object.assign({
    scanComplete: true,
    lockHeld: true,
    calendarIds: Object.assign({}, CAL),
    cancellationScan: { complete: true, calendarIds: SCAN_IDS.slice(), events: [] },
    events: events,
    tasks: tasks
  }, extra || {}));
}

function creates(result) {
  return gate(result).allowed.filter(function (change) { return change.action === 'CREATE'; });
}

let cases = 0;
function check(name, fn) {
  fn();
  cases++;
}

check('existing managed reminder does not create', function () {
  const kept = run([managed('rem-keep', 'task-ops-0001')], [task({ taskId: 'task-ops-0001' })]);
  assert.equal(creates(kept).length, 0);
  assert.equal(kept.reviews[0].action, 'NO CREATE');
});

check('legacy beside managed is not mutated', function () {
  const both = run(
    [managed('rem-managed', 'task-both'), legacy('rem-legacy', 'task-both')],
    [task({ taskId: 'task-both' })]
  );
  assert.equal(creates(both).length, 0);
  assert.equal(JSON.stringify(both.writes).includes('rem-legacy'), false);
  assert.equal(both.reviews[0].reason.includes('legacy'), true);
  assert.equal(both.preservedLegacyEventIds.includes('rem-legacy'), true);
});

check('cancelled managed reminder is not recreated', function () {
  const cancelled = run(
    [{ calendarId: CAL.sales, event: Object.assign({}, managed('rem-old', 'task-cancel').event, { status: 'cancelled' }) }],
    [task({ taskId: 'task-cancel', calendarId: CAL.sales })]
  );
  assert.equal(creates(cancelled).length, 0);
  assert.equal(cancelled.reviews[0].reason.includes('cancelled'), true);
});

check('managed reminder on Confirmed Events blocks create', function () {
  const onConfirmed = run(
    [managed('rem-confirmed', 'task-confirmed', CAL.confirmed)],
    [task({ taskId: 'task-confirmed', calendarId: CAL.sales })]
  );
  assert.equal(creates(onConfirmed).length, 0);
  assert.equal(onConfirmed.reviews[0].eventId, 'rem-confirmed');
});

check('duplicate managed reminders are not deleted', function () {
  const dupes = run(
    [managed('rem-a', 'task-dupe', CAL.sales), managed('rem-b', 'task-dupe', CAL.operations)],
    [task({ taskId: 'task-dupe' })]
  );
  assert.equal(creates(dupes).length, 0);
  assert.equal(dupes.reviews[0].action, 'REVIEW');
  assert.equal(dupes.reviews[0].reason.includes('no automatic deletion'), true);
});

check('an unattended new task does not create', function () {
  const fresh = run([], [task()]);
  assert.equal(creates(fresh).length, 0);
  assert.equal(fresh.reviews[0].action, 'SUPPRESS CREATE');
});

check('an explicitly approved new task creates one Free 15-minute reminder', function () {
  const fresh = run([], [task({ ownerApprovedCreate: true, creationApprovalId: 'create-2026-11-21' })]);
  assert.equal(creates(fresh).length, 1);
  const body = creates(fresh)[0].body;
  assert.equal(body.transparency, 'transparent');
  assert.equal(body.attendees, undefined);
  assert.equal(body.conferenceData, undefined);
  assert.equal(body.recurrence.length, 0);
  assert.equal(new Date(body.end.dateTime) - new Date(body.start.dateTime), 15 * 60000);
  assert.equal(body.start.timeZone, 'America/New_York');
});

check('completed task authorizes no removal', function () {
  const done = run(
    [managed('rem-done', 'task-done')],
    [task({ taskId: 'task-done', status: 'complete', due: '' })]
  );
  assert.equal(creates(done).length, 0);
  assert.equal(done.reviews[0].action, 'NO CHANGE');
  assert.equal(JSON.stringify(done.writes).includes('remove'), false);
});

check('unrelated client booking is not written', function () {
  const guest = {
    calendarId: CAL.confirmed,
    event: {
      id: 'client-booking',
      status: 'confirmed',
      summary: 'Client session',
      description: 'Confirmed client booking',
      attendees: [{ email: 'guest@client.example', self: false }]
    }
  };
  const protectedPlan = run([guest], [task({ taskId: 'task-guest' })]);
  assert.equal(creates(protectedPlan).length, 0);
  assert.equal(JSON.stringify(protectedPlan.writes).includes('client-booking'), false);
  assert.equal(JSON.stringify(protectedPlan.reviews).includes('client-booking'), false);
});

check('attended event tied to the task blocks create', function () {
  const tied = {
    calendarId: CAL.confirmed,
    event: {
      id: 'client-tied',
      status: 'confirmed',
      description: 'Task ID: task-tied-0001',
      attendees: [{ email: 'guest@client.example' }]
    }
  };
  const result = run([tied], [task({ taskId: 'task-tied-0001' })]);
  assert.equal(creates(result).length, 0);
  assert.equal(result.reviews[0].reason.includes('protected'), true);
  assert.equal(JSON.stringify(result.writes).includes('client-tied'), false);
});

check('incomplete calendar scan writes nothing', function () {
  const failed = plan({ scanComplete: false, lockHeld: true, calendarIds: CAL, events: [], tasks: [task()] });
  assert.equal(failed.ok, false);
  assert.equal(gate(failed).allowed.length, 0);
});

check('missing cancellation history writes nothing', function () {
  const missing = plan({
    scanComplete: true,
    lockHeld: true,
    calendarIds: Object.assign({}, CAL),
    events: [],
    tasks: [task()]
  });
  assert.equal(missing.ok, false);
  assert.equal(missing.writes.length, 0);
  assert.equal(gate(missing).allowed.length, 0);
  assert.equal(missing.error.includes('Cancellation history'), true);
});

check('a partial cancellation scan writes nothing', function () {
  const partial = run([], [task()], {
    cancellationScan: { complete: true, calendarIds: [CAL.sales, CAL.proposals, CAL.operations], events: [] }
  });
  assert.equal(partial.ok, false);
  assert.equal(gate(partial).allowed.length, 0);
});

check('a second pass does not create again', function () {
  const first = run([], [task({ taskId: 'task-repeat', ownerApprovedCreate: true, creationApprovalId: 'create-repeat' })]);
  const createdEvent = managed('rem-new', 'task-repeat');
  const second = run([createdEvent], [task({ taskId: 'task-repeat' })]);
  assert.equal(creates(first).length, 1);
  assert.equal(creates(second).length, 0);
});

check('stale input writes nothing', function () {
  const stale = run(
    [managed('rem-stale', 'task-stale')],
    [task({ taskId: 'task-stale', stale: true })]
  );
  assert.equal(creates(stale).length, 0);
  assert.equal(stale.reviews[0].reason.includes('stale'), true);
});

check('the same event listed twice is one reminder', function () {
  const copy = managed('rem-same', 'task-same');
  const twice = run([copy, copy], [task({ taskId: 'task-same' })]);
  assert.equal(creates(twice).length, 0);
  assert.equal(twice.reviews[0].action, 'NO CREATE');
});

check('owner approval can recreate after a complete history read', function () {
  const cancelled = {
    calendarId: CAL.sales,
    event: Object.assign({}, managed('rem-old', 'task-cancel').event, { status: 'cancelled' })
  };
  const approved = run(
    [cancelled],
    [task({
      taskId: 'task-cancel',
      calendarId: CAL.sales,
      ownerApprovedRecreation: true,
      recreationApprovalId: 'approve-2026-11-21'
    })]
  );
  assert.equal(creates(approved).length, 1);
  assert.equal(creates(approved)[0].replacesCancelled, true);
  assert.equal(creates(approved)[0].recreationApprovalId, 'approve-2026-11-21');
});

check('owner approval without an approval id does not create', function () {
  const cancelled = {
    calendarId: CAL.sales,
    event: Object.assign({}, managed('rem-old', 'task-cancel').event, { status: 'cancelled' })
  };
  const result = run(
    [cancelled],
    [task({ taskId: 'task-cancel', calendarId: CAL.sales, ownerApprovedRecreation: true })]
  );
  assert.equal(creates(result).length, 0);
  assert.equal(result.reviews[0].reason.includes('no automatic recreation'), true);
});

check('owner approval does not bypass a failed history read', function () {
  const cancelled = {
    calendarId: CAL.sales,
    event: Object.assign({}, managed('rem-old', 'task-cancel').event, { status: 'cancelled' })
  };
  const result = run(
    [cancelled],
    [task({
      taskId: 'task-cancel',
      calendarId: CAL.sales,
      ownerApprovedRecreation: true,
      recreationApprovalId: 'approve-2026-11-21'
    })],
    { cancellationScan: { complete: false, error: 'page limit', calendarIds: SCAN_IDS, events: [cancelled] } }
  );
  assert.equal(result.ok, false);
  assert.equal(gate(result).allowed.length, 0);
});

check('owner approval does not override a legacy reminder', function () {
  const cancelled = {
    calendarId: CAL.sales,
    event: Object.assign({}, managed('rem-old', 'task-legacy-keep').event, { status: 'cancelled' })
  };
  const result = run(
    [cancelled, legacy('rem-html', 'task-legacy-keep')],
    [task({
      taskId: 'task-legacy-keep',
      ownerApprovedRecreation: true,
      recreationApprovalId: 'approve-2026-11-21'
    })]
  );
  assert.equal(creates(result).length, 0);
  assert.equal(result.reviews[0].reason.includes('legacy'), true);
  assert.equal(JSON.stringify(result.writes).includes('rem-html'), false);
});

check('an unknown target calendar does not create', function () {
  const result = run([], [task({ calendarId: 'https://calendar.example/other' })]);
  assert.equal(creates(result).length, 0);
  assert.equal(result.reviews[0].reason.includes('calendar'), true);
});

check('Confirmed Events is not a create target', function () {
  const result = run([], [task({ calendarId: CAL.confirmed })]);
  assert.equal(creates(result).length, 0);
  assert.equal(result.reviews[0].reason.includes('calendar'), true);
});

check('an unsafe task id does not create', function () {
  const result = run([], [task({ taskId: 'bad id' })]);
  assert.equal(creates(result).length, 0);
  assert.equal(result.reviews[0].reason.includes('task id'), true);
});

check('a missing or impossible due date does not create', function () {
  const missing = run([], [task({ due: '' })]);
  const impossible = run([], [task({ due: '2026-02-31' })]);
  assert.equal(creates(missing).length, 0);
  assert.equal(creates(impossible).length, 0);
  assert.equal(missing.reviews[0].reason.includes('due date'), true);
  assert.equal(impossible.reviews[0].reason.includes('due date'), true);
});

check('an invalid start timestamp does not create', function () {
  const result = run([], [task({ start: 'tomorrow' })]);
  assert.equal(creates(result).length, 0);
  assert.equal(result.reviews[0].reason.includes('timestamp'), true);
});

check('a non-Eastern timezone does not create', function () {
  const result = run([], [task({ timeZone: 'America/Los_Angeles' })]);
  assert.equal(creates(result).length, 0);
  assert.equal(result.reviews[0].reason.includes('timezone'), true);
});

check('a missing lock leaves the create unapproved', function () {
  const unlocked = run([], [task({ ownerApprovedCreate: true, creationApprovalId: 'create-locked' })], { lockHeld: false });
  assert.equal(unlocked.ok, true);
  assert.equal(unlocked.writes.length, 0);
  assert.equal(unlocked.blockedWrites.length, 1);
  assert.equal(gate(unlocked).allowed.length, 0);
  assert.equal(gate(unlocked).refused.includes('lock'), true);
});

check('one unsafe create refuses the whole batch', function () {
  const fresh = run([], [task({ ownerApprovedCreate: true, creationApprovalId: 'create-batch' })]);
  const mixed = JSON.parse(JSON.stringify(fresh));
  mixed.writes.push({
    action: 'CREATE',
    taskId: 'task-other-0002',
    calendarId: CAL.operations,
    due: '2026-11-23',
    ownerApprovedCreate: true,
    creationApprovalId: 'create-unsafe',
    body: {
      transparency: 'transparent',
      attendees: [{ email: 'guest@client.example' }],
      recurrence: [],
      start: { dateTime: '2026-11-23T14:00:00.000Z', timeZone: 'America/New_York' },
      end: { dateTime: '2026-11-23T14:15:00.000Z', timeZone: 'America/New_York' },
      extendedProperties: { private: { lvptManaged: 'taskSyncV1', lvptTaskId: 'task-other-0002', lvptDueDate: '2026-11-23' } }
    }
  });
  assert.equal(fresh.writes.length, 1);
  assert.equal(gate(mixed).allowed.length, 0);
  assert.equal(gate(mixed).refused.includes('attendees'), true);
});

check('a recurring body is not approved', function () {
  const fresh = run([], [task({ ownerApprovedCreate: true, creationApprovalId: 'create-recur' })]);
  const recurring = JSON.parse(JSON.stringify(fresh));
  recurring.writes[0].body.recurrence = ['RRULE:FREQ=DAILY'];
  assert.equal(gate(recurring).allowed.length, 0);
  assert.equal(gate(fresh).allowed.length, 1);
});

check('two creates for one task are refused together', function () {
  const fresh = run([], [task({ ownerApprovedCreate: true, creationApprovalId: 'create-double' })]);
  const doubled = JSON.parse(JSON.stringify(fresh));
  doubled.writes.push(JSON.parse(JSON.stringify(doubled.writes[0])));
  assert.equal(gate(doubled).allowed.length, 0);
  assert.equal(gate(doubled).refused.includes('duplicate create'), true);
});

check('history query asks for deleted managed events and does not fetch them', function () {
  const query = sandbox.lvptCancellationHistoryQuery_();
  assert.equal(query.showDeleted, true);
  assert.equal(query.privateExtendedProperty, 'lvptManaged=taskSyncV1');
  assert.equal(query.singleEvents, false);
});

check('an HTML legacy reminder is recognized and not modified', function () {
  const html = {
    calendarId: CAL.operations,
    event: {
      id: 'legacy-html-certapro',
      status: 'confirmed',
      transparency: 'transparent',
      description: '<p>LVPT INTERNAL OWNER REMINDER</p><p>task_id: gmail-task-1a102722f4286987-discovery</p>',
      attendees: [],
      extendedProperties: { private: {} }
    }
  };
  const result = run([html], [task({ taskId: 'gmail-task-1a102722f4286987-discovery' })]);
  assert.equal(creates(result).length, 0);
  assert.equal(result.reviews[0].reason.includes('legacy'), true);
  assert.equal(JSON.stringify(result.writes).includes('legacy-html-certapro'), false);
});

check('an owner tombstone blocks recreation without approval', function () {
  const result = run([], [task({ taskId: 'gmail-task-1a01a0153c0414d5-decisionfollowup' })], {
    ownerTombstones: ['gmail-task-1a01a0153c0414d5-decisionfollowup']
  });
  assert.equal(creates(result).length, 0);
  assert.equal(result.reviews[0].reason.includes('tombstone'), true);
});

const DUPLICATE_TASKS = [
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
const UNRESOLVED = [
  'gmail-task-1a1564e8e21a05f3-production',
  'gmail-task-1a189f1dffa1d00f-production'
];

check('the 19 proposed creates do not pass the gate', function () {
  const events = [];
  DUPLICATE_TASKS.forEach(function (taskId, index) {
    events.push({
      calendarId: CAL.operations,
      event: Object.assign({}, managed('cancelled-' + index, taskId).event, { status: 'cancelled' })
    });
    events.push({
      calendarId: CAL.confirmed,
      event: {
        id: 'legacy-' + index,
        status: 'confirmed',
        transparency: 'transparent',
        description: '<p>LVPT INTERNAL OWNER REMINDER</p><p>task_id: ' + taskId + '</p>',
        attendees: [],
        extendedProperties: { private: {} }
      }
    });
  });
  UNRESOLVED.forEach(function (taskId, index) {
    events.push({
      calendarId: index === 0 ? CAL.operations : CAL.confirmed,
      event: {
        id: 'legacy-unresolved-' + index,
        status: 'confirmed',
        transparency: 'transparent',
        description: '<p>LVPT INTERNAL OWNER REMINDER</p><p>task_id: ' + taskId + '</p>',
        attendees: []
      }
    });
  });
  const tasks = DUPLICATE_TASKS.concat(UNRESOLVED).map(function (taskId) {
    return task({ taskId: taskId, calendarId: CAL.operations });
  });
  const result = run(events, tasks);
  assert.equal(result.ok, true);
  assert.equal(creates(result).length, 0);
  assert.equal(result.writes.length, 0);
  assert.equal(result.reviews.length, 19);
  UNRESOLVED.forEach(function (taskId) {
    assert.equal(JSON.stringify(result.writes).includes(taskId), false);
  });
});

check('the two unresolved tasks stay blocked with no calendar evidence', function () {
  const result = run([], UNRESOLVED.map(function (taskId) { return task({ taskId: taskId }); }));
  assert.equal(creates(result).length, 0);
  assert.equal(result.reviews.every(function (row) { return row.reason.includes('unresolved'); }), true);
});

check('a transparency correction cannot add other fields or run', function () {
  const planTransparency = sandbox.lvptPlanTransparencyCorrection_;
  const good = planTransparency([{
    eventId: 'managed-free-candidate',
    calendarId: CAL.operations,
    taskId: 'gmail-task-1a01a0153c0414d5-decisionfollowup',
    etag: '"fresh-etag"',
    etagSource: 'fresh-get',
    status: 'confirmed',
    transparency: 'opaque',
    taskSyncOwned: true,
    externalAttendees: 0,
    durationMinutes: 15,
    conference: false,
    reasons: ['transparency']
  }]);
  assert.equal(good.eligible.length, 1);
  assert.equal(JSON.stringify(good.eligible[0].resource), '{"transparency":"transparent"}');
  assert.equal(good.eligible[0].headers['If-Match'], '"fresh-etag"');
  assert.equal(good.executable, false);
  assert.equal(good.writes, 0);
  const dirty = planTransparency([{
    eventId: 'busy-with-guests',
    calendarId: CAL.confirmed,
    etag: '"etag-2"',
    status: 'confirmed',
    transparency: 'opaque',
    taskSyncOwned: true,
    externalAttendees: 1,
    durationMinutes: 15,
    conference: false,
    reasons: ['transparency', 'summary']
  }]);
  assert.equal(dirty.eligible.length, 0);
  assert.equal(dirty.held.length, 1);
  assert.equal(dirty.writes, 0);
});

check('line-wrapped task ids are legacy reminders and not ownership', function () {
  const certapro = {
    calendarId: 'c_a9756e49c39a571a2c21d99524f4c226e1772fca9f0c4156e245d5fd7d941a2a@group.calendar.google.com',
    event: {
      id: 'kg49e1cfu2o9rvtkbq0l3erdeg',
      status: 'confirmed',
      transparency: 'transparent',
      description: 'INTERNAL OWNER REMINDER\nTask ID: gmail-\ntask-1a1564e8e21a05f3-production',
      attendees: [{ email: 'book@pokertraininglasvegas.com', self: true }],
      extendedProperties: { private: {} }
    }
  };
  const cowbell = {
    calendarId: 'c_972d7e50b66cba545967cf0f8de32d22990e6e8aa98051bdfa34b9122ed7962c@group.calendar.google.com',
    event: {
      id: 'd0679uii6sfi6ig6metb4u21vc',
      status: 'confirmed',
      transparency: 'transparent',
      description: 'LVPT INTERNAL OWNER REMINDER\nTask ID: gmail-\ntask-1a189f1dffa1d00f-production',
      attendees: [],
      extendedProperties: { private: {} }
    }
  };
  const result = run(
    [certapro, cowbell],
    UNRESOLVED.map(function (taskId) { return task({ taskId: taskId }); })
  );
  assert.equal(creates(result).length, 0);
  assert.equal(result.writes.length, 0);
  assert.equal(result.reviews.every(function (row) { return row.reason.includes('legacy'); }), true);
  assert.equal(JSON.stringify(result.writes).includes('kg49e1cfu2o9rvtkbq0l3erdeg'), false);
  assert.equal(JSON.stringify(result.writes).includes('d0679uii6sfi6ig6metb4u21vc'), false);
  const parsed = sandbox.lvptSafeTaskIdFromDescription_(certapro.event.description);
  const parsedWithPrefix = sandbox.lvptSafeTaskIdFromDescription_(cowbell.event.description);
  assert.equal(parsed, 'gmail-task-1a1564e8e21a05f3-production');
  assert.equal(parsedWithPrefix, 'gmail-task-1a189f1dffa1d00f-production');
});

check('an external attendee on a known legacy event is protected', function () {
  const event = {
    calendarId: CAL.operations,
    event: {
      id: 'kg49e1cfu2o9rvtkbq0l3erdeg',
      status: 'confirmed',
      description: 'INTERNAL OWNER REMINDER\nTask ID: gmail-\ntask-1a1564e8e21a05f3-production',
      attendees: [
        { email: 'book@pokertraininglasvegas.com', self: true },
        { email: 'guest@client.example', self: false }
      ]
    }
  };
  const result = run([event], [task({ taskId: 'gmail-task-1a1564e8e21a05f3-production' })]);
  assert.equal(creates(result).length, 0);
  assert.equal(result.reviews[0].reason.includes('protected'), true);
  assert.equal(JSON.stringify(result.writes).includes('kg49e1cfu2o9rvtkbq0l3erdeg'), false);
});

check('historical transparency rows are identification only', function () {
  const handoff = JSON.parse(fs.readFileSync('tests/fixtures/LVPT_Phase7I_Verified_Event_Handoff.json', 'utf8'));
  assert.equal(handoff.patchCandidates.length, 18);
  const identified = sandbox.lvptIdentifyHistoricalTransparencyRows_(handoff.patchCandidates);
  assert.equal(identified.count, 18);
  assert.equal(identified.writes, 0);
  assert.equal(identified.usesHistoricalEtag, false);
  const historical = sandbox.lvptPlanTransparencyCorrection_(handoff.patchCandidates.map(function (row) {
    return {
      eventId: row.eventId,
      calendarId: row.calendarId,
      taskId: row.taskId,
      etag: row.historicalEtag,
      etagSource: 'historical',
      status: row.historicalStatus,
      transparency: row.historicalTransparency,
      taskSyncOwned: true,
      externalAttendees: 0,
      durationMinutes: 15,
      conference: false,
      reasons: row.historicalDriftReasons
    };
  }));
  assert.equal(historical.eligible.length, 0);
  assert.equal(historical.held.length, 18);
  assert.equal(historical.writes, 0);
  assert.equal(JSON.stringify(historical).includes(handoff.patchCandidates[0].historicalEtag), false);
});

console.log('calendar-safe-review: ' + cases + ' cases passed');
