/**
 * Read-only integration of the safe decision engine with a four-calendar
 * inventory. This file does not call Calendar or Sheets and does not write.
 * Do not clasp push it to production.
 *
 * Automatic creates stay off. A durable cancellation record was not created.
 */

function lvptSafeDiscoveryQueries_(managedTag) {
  return {
    active: [
      { privateExtendedProperty: 'lvptManaged=' + managedTag, showDeleted: false },
      { q: 'LVPT INTERNAL', showDeleted: false },
      { q: 'INTERNAL OWNER REMINDER', showDeleted: false }
    ],
    cancellation: [
      { privateExtendedProperty: 'lvptManaged=' + managedTag, showDeleted: true }
    ]
  };
}

function lvptSelectDatedActiveTasks_(rows) {
  var active = ['open', 'in progress', 'waiting', 'blocked', 'pending', 'on hold'];
  var selected = [];
  var skipped = [];
  (rows || []).forEach(function (row) {
    var id = String(row.task_id || row.taskId || '').trim();
    var status = String(row.status || '').trim().toLowerCase();
    if (!id) {
      skipped.push({ taskId: '', reason: 'blank task id' });
      return;
    }
    if (active.indexOf(status) < 0) {
      skipped.push({ taskId: id, reason: 'status is not an active dated state' });
      return;
    }
    var due = String(row.due || row.due_date || '').trim();
    var us = due.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    var iso = us ? us[3] + '-' + ('0' + us[1]).slice(-2) + '-' + ('0' + us[2]).slice(-2) : (/^\d{4}-\d{2}-\d{2}$/.test(due) ? due : '');
    var parsed = iso ? new Date(iso + 'T12:00:00Z') : new Date(NaN);
    if (!iso || isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== iso) {
      skipped.push({ taskId: id, reason: 'due date is missing or invalid' });
      return;
    }
    selected.push({
      taskId: id,
      status: status,
      due: iso,
      start: iso + 'T14:00:00.000Z',
      calendarId: row.calendarId || ''
    });
  });
  return { datedActive: selected, skipped: skipped };
}

function lvptClassifyInventory_(events, ownerEmail) {
  var classes = {};
  (events || []).forEach(function (item) {
    var info = lvptClassifyReminderEvent_(item.event, ownerEmail);
    if (!info.taskId || info.role === 'ignore') return;
    if (!classes[info.taskId]) classes[info.taskId] = [];
    classes[info.taskId].push({
      role: info.role,
      eventId: item.event.id,
      calendarId: item.calendarId,
      transparency: item.event.transparency == null || item.event.transparency === '' ? null : item.event.transparency,
      status: item.event.status || null,
      managed: info.managed === true
    });
  });
  return classes;
}

function lvptDryRunSafeDecisions_(input) {
  var empty = { ok: false, decisions: [], writes: [], counts: {}, error: 'Incomplete inventory. No decisions were applied.' };
  if (!input || input.inventoryComplete !== true) return empty;
  var selected = lvptSelectDatedActiveTasks_(input.taskRows || input.tasks || []);
  var scanEvents = (input.events || []).concat((input.cancellationScan && input.cancellationScan.events) || []);
  var classes = lvptClassifyInventory_(scanEvents, input.ownerEmail);
  var plan = lvptPlanSafeReminderActions_({
    scanComplete: input.scanComplete === true,
    lockHeld: true,
    calendarIds: input.calendarIds,
    cancellationScan: input.cancellationScan,
    events: input.events,
    tasks: selected.datedActive,
    ownerTombstones: input.ownerTombstones || []
  });
  if (!plan.ok) {
    return { ok: false, decisions: [], writes: [], counts: {}, error: plan.error || empty.error };
  }
  var byId = {};
  (plan.reviews || []).forEach(function (review) { byId[review.taskId] = review; });
  var decisions = selected.datedActive.map(function (task) {
    var review = byId[task.taskId] || { action: 'REVIEW', reason: 'no decision was produced' };
    var found = classes[task.taskId] || [];
    var decision = review.action === 'NO CREATE' || review.action === 'NO CHANGE' ? 'NO CHANGE' :
      review.action === 'SUPPRESS CREATE' ? 'SUPPRESS CREATE' : 'REVIEW';
    var busyManaged = found.filter(function (item) {
      return item.role === 'managed' && item.status !== 'cancelled' && item.transparency !== 'transparent';
    });
    return {
      taskId: task.taskId,
      classification: found.map(function (item) { return item.role; }).filter(function (role, index, list) {
        return list.indexOf(role) === index;
      }).join('+') || 'none',
      eventIds: found.map(function (item) { return item.eventId; }),
      history: found.map(function (item) { return item.role + ':' + item.eventId; }).join(', '),
      decision: decision,
      reason: review.reason,
      transparencyHeld: busyManaged.length > 0,
      writes: 0
    };
  });
  var counts = { noChange: 0, suppressCreate: 0, review: 0, transparencyHeld: 0 };
  decisions.forEach(function (row) {
    if (row.decision === 'NO CHANGE') counts.noChange++;
    else if (row.decision === 'SUPPRESS CREATE') counts.suppressCreate++;
    else counts.review++;
    if (row.transparencyHeld) counts.transparencyHeld++;
  });
  return {
    ok: true,
    error: '',
    decisions: decisions,
    writes: plan.writes || [],
    counts: counts,
    datedActive: selected.datedActive.length,
    skipped: selected.skipped.length
  };
}
