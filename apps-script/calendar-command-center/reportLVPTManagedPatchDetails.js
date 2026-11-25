/**
 * Paste this function into LVPT Calendar Preview Staging only.
 * Do not paste it into production. Do not clasp push it.
 *
 * It calls the installed preview helpers and lvptPlanTaskCalendarSync_.
 * It does not change planner rules and does not write.
 * This file was not executed against Google.
 */
function reportLVPTManagedPatchDetails() {
  if (typeof lvptPlanTaskCalendarSync_ !== 'function' || typeof previewLVPTTaskSync !== 'function') {
    throw new Error('Installed staging preview is not loaded. No write was attempted.');
  }
  var cfg = LVPT_SYNC_CONFIG;
  var account = String(CalendarApp.getDefaultCalendar().getId()).toLowerCase();
  if (account !== cfg.ownerEmail) throw new Error('Wrong account: ' + account);
  var calendars = {};
  var category;
  for (category in cfg.calendarNames) {
    if (!Object.prototype.hasOwnProperty.call(cfg.calendarNames, category)) continue;
    var owned = CalendarApp.getOwnedCalendarsByName(cfg.calendarNames[category]);
    if (owned.length !== 1) throw new Error('Expected one owned calendar: ' + cfg.calendarNames[category]);
    calendars[category] = owned[0].getId();
  }

  var values = lvptStagingReadSheet_(cfg.spreadsheetId, 'Tasks', 10);
  var eventRows = lvptStagingReadSheet_(cfg.spreadsheetId, 'Events', 3);
  if (!values || !eventRows || values.length < 2) {
    throw new Error('Tasks or Events spreadsheet data is unavailable.');
  }
  var headers = values.shift().map(function (cell) { return String(cell).trim(); });
  var columns = {};
  ['task_id', 'event_id', 'task', 'due_date', 'priority', 'status', 'notes'].forEach(function (key) {
    var index = headers.indexOf(key);
    if (index < 0) throw new Error('Missing Tasks column: ' + key);
    columns[key] = index;
  });
  var companies = {};
  eventRows.slice(1).forEach(function (row) {
    if (row[0]) companies[row[0]] = row[2] || row[1] || row[0];
  });
  var taskRows = values.map(function (row) {
    return {
      task_id: row[columns.task_id],
      event_id: row[columns.event_id],
      task: row[columns.task],
      due_date: row[columns.due_date],
      priority: row[columns.priority],
      status: row[columns.status],
      notes: row[columns.notes]
    };
  });

  var scanIds = ['sales', 'proposals', 'operations', 'confirmed'].map(function (key) {
    return calendars[key];
  });
  var listed = [];
  var seen = {};
  var inventory = { managedQuery: 0, textSearch: 0, textSearchAlreadySeen: 0, canonicalAdded: 0, canonicalNotFound: 0 };
  scanIds.forEach(function (calendarId) {
    lvptListCalendarEvents_(calendarId, { privateExtendedProperty: 'lvptManaged=' + cfg.managedTag })
      .forEach(function (ev) {
        listed.push({ calendarId: calendarId, event: ev, fromManagedQuery: true });
        seen[calendarId + '::' + ev.id] = true;
        inventory.managedQuery++;
      });
    lvptListCalendarEvents_(calendarId, { q: 'LVPT INTERNAL' }).forEach(function (ev) {
      var key = calendarId + '::' + ev.id;
      if (seen[key]) inventory.textSearchAlreadySeen++;
      listed.push({ calendarId: calendarId, event: ev, fromManagedQuery: false });
      seen[key] = true;
      inventory.textSearch++;
    });
  });
  taskRows.forEach(function (row) {
    lvptCanonicalReferences_(row.notes, scanIds).forEach(function (ref) {
      var key = ref.calendarId + '::' + ref.eventId;
      if (seen[key]) return;
      var ev;
      try { ev = Calendar.Events.get(ref.calendarId, ref.eventId); }
      catch (error) {
        if (/\b(?:404|not found)\b/i.test(String(error))) {
          inventory.canonicalNotFound++;
          return;
        }
        throw new Error('Calendar lookup failed for ' + row.task_id + ': ' + error);
      }
      if (ev && ev.status !== 'cancelled') {
        listed.push({ calendarId: ref.calendarId, event: ev, fromManagedQuery: false });
        seen[key] = true;
        inventory.canonicalAdded++;
      }
    });
  });

  var plan = lvptPlanTaskCalendarSync_({
    now: new Date(),
    cfg: cfg,
    calendarIds: calendars,
    companies: companies,
    taskRows: taskRows,
    events: listed
  });
  if (!plan.ok) throw new Error(plan.error || 'Plan failed. No write was attempted.');

  var rows = [];
  var byReason = {};
  (plan.changes || []).forEach(function (change) {
    if (change.kind !== 'patch_managed') return;
    var event = change.prior && change.prior.event || {};
    var props = ((event.extendedProperties || {}).private || {});
    var reasons = (change.reasons || []).slice();
    reasons.forEach(function (reason) {
      byReason[reason] = (byReason[reason] || 0) + 1;
    });
    rows.push({
      eventId: event.id || '',
      calendarId: change.prior.calendarId,
      taskId: change.id,
      status: event.status == null || event.status === '' ? null : event.status,
      transparency: event.transparency == null || event.transparency === '' ? null : event.transparency,
      etag: typeof event.etag === 'string' ? event.etag : '',
      privateManaged: props.lvptManaged || '',
      privateTaskId: props.lvptTaskId || '',
      taskSyncOwned: props.lvptManaged === cfg.managedTag && props.lvptTaskId === change.id,
      reasons: reasons,
      fieldNames: change.fields ? Object.keys(change.fields) : [],
      durationMinutes: lvptDurationMinutes_(event),
      externalAttendees: lvptExternalAttendees_(event, cfg.ownerEmail).length,
      conference: lvptHasConference_(event)
    });
  });

  var preview = previewLVPTTaskSync();
  var previewPatches = preview && preview.counts ? preview.counts.patchManaged : null;
  var baseline = 37;
  var comparison = {
    baselinePatchManaged: baseline,
    diagnosticPatchManaged: rows.length,
    previewPatchManaged: previewPatches,
    adjustedToBaseline: false,
    inventory: inventory,
    listedEvents: listed.length,
    plannerCounts: plan.counts,
    datedActiveTasks: plan.datedActiveTasks,
    unchanged: plan.unchanged,
    totalTaskRows: plan.totalTaskRows
  };
  if (previewPatches !== rows.length) {
    comparison.inventoryMismatch = true;
    comparison.cause = 'The diagnostic count and previewLVPTTaskSync disagree. That is an inventory mismatch. The count was not changed to 37.';
  } else if (rows.length !== baseline) {
    comparison.inventoryMismatch = false;
    comparison.cause = 'The diagnostic and previewLVPTTaskSync agree, and both differ from 37. Discovery is not the mismatch. The calendars or Tasks sheet changed after the November 21 preview, or the installed planner is no longer the planner that produced 37.';
  } else {
    comparison.inventoryMismatch = false;
    comparison.cause = 'The diagnostic, previewLVPTTaskSync, and the November 21 baseline all report 37 patch_managed proposals.';
  }

  console.log('LVPT_PATCH_SUMMARY ' + JSON.stringify({
    count: rows.length,
    byReason: byReason,
    comparison: comparison,
    calendarWrites: 0
  }));
  rows.forEach(function (row) { console.log('LVPT_PATCH ' + JSON.stringify(row)); });
  return { count: rows.length, byReason: byReason, comparison: comparison, calendarWrites: 0 };
}
