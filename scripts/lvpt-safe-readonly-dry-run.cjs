/**
 * Read-only dry-run. Refreshes the existing clasp token in memory, reads
 * Calendar and Sheets, and writes decisions without descriptions.
 * It does not update calendars, the sheet, Apps Script, or the token file.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const outPath = path.join(root, 'docs', 'baselines', 'phase-07j-readonly-decisions.json');
const handoff = JSON.parse(fs.readFileSync(path.join(root, 'tests', 'fixtures', 'LVPT_Phase7I_Verified_Event_Handoff.json'), 'utf8'));
const sheetId = '1oHoVdD5CDcEreyRnB7cEvYfp6wWEgAmf04BwrktkMYs';

function fail(message) {
  console.log(JSON.stringify({ ok: false, liveDryRun: false, error: message }));
  process.exit(2);
}

async function refresh() {
  const file = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.clasprc.json'), 'utf8'));
  const saved = file.tokens && file.tokens.default;
  if (!saved || !saved.refresh_token) fail('No clasp refresh token is available.');
  const body = new URLSearchParams({
    client_id: saved.client_id,
    client_secret: saved.client_secret,
    refresh_token: saved.refresh_token,
    grant_type: 'refresh_token'
  });
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  const payload = await response.json();
  if (!response.ok) {
    fail('Token refresh failed: ' + (payload.error || response.status) + (payload.error_description ? ' ' + payload.error_description : ''));
  }
  return payload.access_token;
}

async function tokenInfo(token) {
  const response = await fetch('https://oauth2.googleapis.com/tokeninfo?access_token=' + encodeURIComponent(token));
  const payload = await response.json();
  if (!response.ok) fail('Token info failed: ' + (payload.error || response.status));
  return String(payload.scope || '').split(/\s+/).filter(Boolean);
}

async function getJson(token, url) {
  const response = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
  const text = await response.text();
  let payload;
  try { payload = JSON.parse(text); } catch (error) { payload = { raw: text.slice(0, 180) }; }
  if (!response.ok) {
    const reason = payload.error && (payload.error.message || payload.error) || response.status;
    throw new Error(response.status + ' ' + reason);
  }
  return payload;
}

async function listEvents(token, calendarId, query) {
  const items = [];
  let pageToken = '';
  for (let page = 0; page < 12; page++) {
    const params = new URLSearchParams({
      maxResults: '250',
      singleEvents: 'false',
      showDeleted: query.showDeleted ? 'true' : 'false'
    });
    if (query.privateExtendedProperty) params.set('privateExtendedProperty', query.privateExtendedProperty);
    if (query.q) params.set('q', query.q);
    if (pageToken) params.set('pageToken', pageToken);
    params.set('fields', 'items(id,status,transparency,description,attendees(email,self),extendedProperties/private,start,end,hangoutLink,conferenceData,recurrence,recurringEventId),nextPageToken');
    const url = 'https://www.googleapis.com/calendar/v3/calendars/' + encodeURIComponent(calendarId) + '/events?' + params.toString();
    const batch = await getJson(token, url);
    items.push.apply(items, batch.items || []);
    if (!batch.nextPageToken) return items;
    if (pageToken === batch.nextPageToken) throw new Error('Repeated page token');
    pageToken = batch.nextPageToken;
  }
  throw new Error('Calendar page limit reached');
}

async function main() {
  const token = await refresh();
  const scopes = await tokenInfo(token);
  const scopeNames = scopes.map(function (scope) { return scope.split('/').pop(); });
  const canReadCalendar = scopes.some(function (scope) { return /calendar(\.readonly|\.events\.readonly)?$/.test(scope) || scope.endsWith('/auth/calendar'); });
  const canReadSheets = scopes.some(function (scope) { return scope.indexOf('spreadsheets') >= 0; });
  if (!canReadCalendar || !canReadSheets) {
    fail('Refreshed token cannot read both Calendar and Sheets. Scopes: ' + scopeNames.join(' '));
  }
  const sandbox = { console: { log() {} }, Date, Map, Set, Object, String, Array, Error, JSON, Math, isFinite, isNaN };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, 'apps-script/calendar-command-center/TaskSync.safe-review.js'), 'utf8'), sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, 'apps-script/calendar-command-center/TaskSync.safe-integrate.js'), 'utf8'), sandbox);
  const queries = sandbox.lvptSafeDiscoveryQueries_('taskSyncV1');
  const calendars = handoff.calendars;
  const calendarIds = {
    sales: calendars.sales,
    proposals: calendars.proposals,
    operations: calendars.operations,
    confirmed: calendars.confirmed
  };
  const seen = {};
  const active = [];
  const cancelled = [];
  const errors = [];
  for (const name of Object.keys(calendarIds)) {
    const calendarId = calendarIds[name];
    for (const query of queries.active) {
      let found;
      try { found = await listEvents(token, calendarId, query); }
      catch (error) { errors.push(name + ' active: ' + error.message); continue; }
      found.forEach(function (event) {
        const key = calendarId + '::' + event.id;
        if (seen[key]) return;
        seen[key] = true;
        active.push({ calendarId: calendarId, event: event, fromManagedQuery: Boolean(query.privateExtendedProperty) });
      });
    }
    try {
      const history = await listEvents(token, calendarId, queries.cancellation[0]);
      history.forEach(function (event) {
        if (event.status !== 'cancelled') return;
        cancelled.push({ calendarId: calendarId, event: event });
      });
    } catch (error) {
      errors.push(name + ' history: ' + error.message);
    }
  }
  const tasks = await getJson(token, 'https://sheets.googleapis.com/v4/spreadsheets/' + sheetId + '/values/Tasks!A:J?valueRenderOption=FORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING');
  const values = tasks.values || [];
  const headers = (values.shift() || []).map(function (cell) { return String(cell).trim(); });
  const columns = {};
  ['task_id', 'status', 'due_date'].forEach(function (key) {
    const index = headers.indexOf(key);
    if (index < 0) fail('Tasks sheet is missing column ' + key);
    columns[key] = index;
  });
  const taskRows = values.map(function (row) {
    return { task_id: row[columns.task_id] || '', status: row[columns.status] || '', due_date: row[columns.due_date] || '' };
  });
  const inventoryComplete = errors.length === 0;
  const report = sandbox.lvptDryRunSafeDecisions_({
    inventoryComplete: inventoryComplete,
    scanComplete: inventoryComplete,
    calendarIds: calendarIds,
    cancellationScan: { complete: inventoryComplete, calendarIds: Object.keys(calendarIds).map(function (name) { return calendarIds[name]; }), events: cancelled, error: errors.join('; ') },
    events: active,
    taskRows: taskRows
  });
  const repeat = inventoryComplete ? sandbox.lvptDryRunSafeDecisions_({
    inventoryComplete: true,
    scanComplete: true,
    calendarIds: calendarIds,
    cancellationScan: { complete: true, calendarIds: Object.keys(calendarIds).map(function (name) { return calendarIds[name]; }), events: cancelled },
    events: active,
    taskRows: taskRows
  }) : null;
  const output = {
    ok: report.ok,
    liveDryRun: true,
    writes: (report.writes || []).length,
    repeatWrites: repeat ? repeat.writes.length : null,
    decisionsMatchRepeat: repeat ? JSON.stringify(report.decisions) === JSON.stringify(repeat.decisions) : false,
    counts: report.counts,
    datedActive: report.datedActive,
    skipped: report.skipped,
    activeEvents: active.length,
    cancelledManagedEvents: cancelled.length,
    errors: errors,
    baselineComparison: {
      expectedSuppressCreate: 19,
      expectedTransparencyHeld: 18,
      expectedUnchangedWithinNoChange: 15,
      observed: report.counts || {},
      forced: false
    },
    decisions: report.decisions || []
  };
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(JSON.stringify({
    ok: output.ok,
    writes: output.writes,
    repeatWrites: output.repeatWrites,
    counts: output.counts,
    datedActive: output.datedActive,
    activeEvents: output.activeEvents,
    cancelledManagedEvents: output.cancelledManagedEvents,
    errors: output.errors,
    scopes: scopeNames
  }));
}

main().catch(function (error) { fail(error.message); });
