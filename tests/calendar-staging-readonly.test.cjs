/**
 * Staging preview must be unable to write, even if the writer is selected.
 * Synthetic sheets and calendars only.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const root = 'apps-script/staging-calendar-preview/';
const source = fs.readFileSync(root + 'TaskSync.js', 'utf8');
const manifest = JSON.parse(fs.readFileSync(root + 'appsscript.json', 'utf8'));
const production = JSON.parse(fs.readFileSync('apps-script/live/calendar-command-center/.clasp.json', 'utf8'));

assert.deepEqual(manifest.oauthScopes, [
  'https://www.googleapis.com/auth/spreadsheets.readonly',
  'https://www.googleapis.com/auth/calendar.readonly'
]);
assert.equal(JSON.stringify(manifest).includes('script.scriptapp'), false);
assert.equal(JSON.stringify(manifest).includes('gmail'), false);
assert.deepEqual(manifest.dependencies.enabledAdvancedServices.map(service => service.serviceId).sort(), ['calendar', 'sheets']);
assert.equal(manifest.dependencies.enabledAdvancedServices.find(service => service.serviceId === 'sheets').version, 'v4');
assert.equal(source.includes('SpreadsheetApp'), false);
assert.match(source, /Sheets\.Spreadsheets\.Values\.get/);
assert.equal(/Values\.update\s*\(/.test(source), false);
assert.equal(/\bbatchUpdate\s*\(/.test(source), false);
[/\.insert\s*\(/, /\.patch\s*\(/, /\.remove\s*\(/, /newTrigger/, /GmailApp/, /MailApp/,
  /setValue\s*\(/, /appendRow\s*\(/, /UrlFetchApp/, /createEvent\s*\(/, /LockService/, /ScriptApp/, /Acl\./
].forEach(pattern => assert.equal(pattern.test(source), false, String(pattern)));

if (fs.existsSync(root + '.clasp.json')) {
  const staging = JSON.parse(fs.readFileSync(root + '.clasp.json', 'utf8'));
  assert.notEqual(staging.scriptId, production.scriptId);
}

const writes = [];
const reads = [];
const sandbox = {
  console: { log() {}, error() {} },
  Intl, Date, Map, Set, Object, String, Array, Error, RegExp, Math, JSON, Number,
  CalendarApp: {
    getDefaultCalendar() {
      return { getId() { return 'book@pokertraininglasvegas.com'; } };
    },
    getOwnedCalendarsByName(name) {
      const ids = {
        'LVPT | Sales & Follow-Ups': 'cal-sales',
        'LVPT | Proposals & Holds': 'cal-proposals',
        'LVPT | Operations & Payments': 'cal-operations',
        'LVPT | Confirmed Events': 'cal-confirmed'
      };
      return [{ getId() { return ids[name]; } }];
    }
  },
  SpreadsheetApp: {
    openById() { writes.push('spreadsheet-open'); }
  },
  Sheets: {
    Spreadsheets: {
      get(spreadsheetId, options) {
        reads.push({ op: 'meta', spreadsheetId: spreadsheetId, fields: options && options.fields });
        return { sheets: [
          { properties: { title: 'Tasks' } },
          { properties: { title: 'Events' } }
        ] };
      },
      batchUpdate() { writes.push('spreadsheets.batchUpdate'); },
      Values: {
        get(spreadsheetId, range, options) {
          reads.push({
            op: 'values',
            spreadsheetId: spreadsheetId,
            range: range,
            valueRenderOption: options && options.valueRenderOption,
            dateTimeRenderOption: options && options.dateTimeRenderOption
          });
          if (range === 'Tasks!A:J') return { values: [
            ['task_id', 'event_id', 'task', 'due_date', 'priority', 'status', 'notes'],
            ['undated1', 'evt-sample', 'Hold vendor note', '', 'Low', 'open'],
            ['undated2', 'evt-sample', 'Hold print note', '', 'Low', 'open'],
            ['undated3', 'evt-sample', 'Hold staff note', '', 'Low', 'open'],
            ['undated4', 'evt-sample', 'Hold room note', '', 'Low', 'open'],
            ['task-iso-0001', 'evt-sample', 'Collect venue invoice', '2026-12-15', 'High', 'open'],
            ['task-us-00001', 'evt-sample', 'Follow up call', '12/1/2026', 'Low', 'open'],
            ['baddate1', 'evt-sample', 'Check bad date', '2026-02-31', 'Low', 'open']
          ] };
          if (range === 'Events!A:C') return { values: [
            ['event_id', 'event_name', 'company'],
            ['evt-sample', 'Sample', 'Northwind Studio']
          ] };
          return { values: [] };
        },
        update() { writes.push('values.update'); },
        batchUpdate() { writes.push('values.batchUpdate'); }
      }
    }
  },
  Calendar: {
    Events: {
      list(calendarId, args) {
        if (args && args.privateExtendedProperty) return { items: [] };
        if (calendarId !== 'cal-confirmed') return { items: [] };
        return { items: [{
          id: 'client-booking',
          status: 'confirmed',
          summary: 'Northwind Studio private session',
          description: 'Actual customer booking',
          attendees: [{ email: 'guest@example.com' }],
          start: { dateTime: '2026-12-01T18:00:00.000Z' },
          end: { dateTime: '2026-12-01T20:00:00.000Z' }
        }] };
      },
      get() { const error = new Error('404 not found'); throw error; },
      insert() { writes.push('insert'); },
      patch() { writes.push('patch'); },
      remove() { writes.push('remove'); }
    }
  }
};
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: 'staging-TaskSync.js' });

assert.equal(sandbox.LVPT_STAGING_PREVIEW_ONLY, true);
assert.equal(sandbox.LVPT_SYNC_CONFIG.conferenceRestClear, false);
assert.throws(() => sandbox.runLVPTTaskSync(), /cannot write/);
assert.throws(() => sandbox.lvptSyncTasks_(false), /refused a write pass/);
assert.throws(() => sandbox.lvptApplyTaskCalendarChanges_(), /blocked/);

assert.equal(sandbox.lvptParseTaskDate_('2026-12-01'), '2026-12-01');
assert.equal(sandbox.lvptParseTaskDate_('12/1/2026'), '2026-12-01');
assert.equal(sandbox.lvptParseTaskDate_('1/2/2026'), '2026-01-02');
assert.equal(sandbox.lvptParseTaskDate_('12/01/2026'), '2026-12-01');
assert.equal(sandbox.lvptParseTaskDate_(''), '');
assert.equal(sandbox.lvptParseTaskDate_('not-a-date'), '');
assert.equal(sandbox.lvptParseTaskDate_('2026-13-01'), '');
assert.equal(sandbox.lvptParseTaskDate_('2026-02-31'), '');
assert.equal(sandbox.lvptParseTaskDate_('13/40/2026'), '');
assert.equal(sandbox.lvptParseTaskDate_('2026-12-1'), '');

const report = sandbox.previewLVPTTaskSync();
assert.equal(report.preview, true);
assert.equal(report.stagingPreviewOnly, true);
assert.equal(report.calendarWrites, 0);
assert.equal(report.noDueDate, 4);
assert.equal(report.invalidDates, 1);
assert.equal(report.datedActiveTasks, 2);
assert.equal(report.counts.create, 2);
assert.equal(report.counts.remove, 0);
assert.equal(writes.length, 0);
assert.equal(reads.some(call => call.range === 'Tasks!A:J' && call.valueRenderOption === 'FORMATTED_VALUE' && call.dateTimeRenderOption === 'FORMATTED_STRING'), true);
assert.equal(reads.some(call => call.range === 'Events!A:C'), true);
assert.equal(report.protected.some(item => item.eventId === 'client-booking' && item.classification === 'customer_or_attended_event'), true);

console.log('calendar-staging-readonly: ok');
