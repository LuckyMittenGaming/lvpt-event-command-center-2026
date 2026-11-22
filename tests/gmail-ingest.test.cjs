const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { runInNewContext } = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'GmailIngest.gs'), 'utf8');
const sandbox = {};
runInNewContext(source, sandbox);
const PRODUCTION = '1oHoVdD5CDcEreyRnB7cEvYfp6wWEgAmf04BwrktkMYs';
const TEST_SHEET = 'isolatedTestSheet00000001';
const HEADERS = sandbox.LVPT_GMAIL_INGEST_HEADERS;

function properties(initial) {
  const values = Object.assign({}, initial);
  return {
    values,
    getProperty(key) { return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null; },
    setProperty(key, value) { values[key] = String(value); }
  };
}

function sheet(headers, rows) {
  const data = [headers.slice(), ...rows.map((row) => headers.map((header) => row[header] || ''))];
  return {
    data,
    appends: 0,
    rewrites: 0,
    getLastColumn() { return headers.length; },
    getRange() { return { getValues: () => [data[0].slice()] }; },
    getDataRange() { return { getValues: () => data.map((row) => row.slice()) }; },
    appendRow(values) {
      this.appends += 1;
      data.push(values.slice());
    },
    setValues() { this.rewrites += 1; throw new Error('rewrite'); },
    clear() { this.rewrites += 1; throw new Error('rewrite'); }
  };
}

function message(id, options) {
  const settings = options || {};
  return {
    id,
    threadId: settings.threadId || `thread-${id}`,
    internalDate: String(settings.internalDate || 1762300000000),
    labelIds: settings.sent ? ['SENT'] : ['INBOX'],
    payload: {
      headers: [
        { name: 'From', value: settings.from || 'Client <client@example.com>' },
        { name: 'To', value: settings.to || 'book@pokertraininglasvegas.com' },
        { name: 'Cc', value: settings.cc || '' },
        { name: 'Subject', value: settings.subject || `Subject ${id}` }
      ]
    }
  };
}

function harness(options) {
  const settings = options || {};
  const activity = settings.activity || sheet(HEADERS, []);
  const events = settings.events || sheet(
    ['event_id', 'contact_email'],
    [{ event_id: 'evt-one', contact_email: 'client@example.com' }]
  );
  const store = properties({ LVPT_GMAIL_INGEST_SPREADSHEET_ID: settings.sheetId || TEST_SHEET });
  if (settings.state) store.setProperty('LVPT_GMAIL_INGEST_STATE', JSON.stringify(settings.state));
  const pages = settings.pages || [[{ id: 'm1' }, { id: 'm2' }]];
  const calls = { opened: [], listed: [], fetched: [], history: [], profile: 0 };
  const messages = settings.messages || {};
  let locked = false;
  const deps = {
    now: () => settings.now || '2026-11-22T22:00:00.000Z',
    properties: store,
    lock: {
      tryLock() { if (settings.locked) return false; locked = true; return true; },
      releaseLock() { locked = false; }
    },
    maxPages: settings.maxPages || 10,
    openSpreadsheet(id) {
      calls.opened.push(id);
      return {
        getSheetByName(name) {
          if (name === 'Gmail Activity') return activity;
          if (name === 'Events') return events;
          return null;
        }
      };
    },
    getProfile() {
      calls.profile += 1;
      return { historyId: settings.historyId || '100' };
    },
    listMessages(query) {
      const token = query.pageToken || '';
      calls.listed.push(token);
      const index = token ? Number(token.replace('page-', '')) : 0;
      const page = pages[index] || [];
      const next = index + 1 < pages.length ? `page-${index + 1}` : '';
      return { messages: page, nextPageToken: next };
    },
    getMessage(id) {
      calls.fetched.push(id);
      if (settings.failOn === id && !calls.failed) {
        calls.failed = true;
        throw new Error('metadata failed');
      }
      return messages[id] || message(id, settings.messageOptions);
    },
    listHistory() {
      calls.history.push(true);
      return settings.history || { historyId: '101', nextPageToken: '', messageIds: [] };
    }
  };
  return { activity, store, calls, deps, locked: () => locked };
}

function rowObject(activity, index) {
  const values = activity.data[index];
  return Object.fromEntries(HEADERS.map((header, column) => [header, values[column]]));
}

const first = harness();
const created = sandbox.lvptIngestGmailWithDeps_(first.deps);
assert.equal(created.ok, true);
assert.equal(created.created, 2);
assert.equal(created.duplicates, 0);
assert.equal(first.activity.appends, 2);
assert.equal(first.activity.rewrites, 0);
assert.equal(rowObject(first.activity, 1).direction, 'Inbound');
assert.equal(rowObject(first.activity, 1).event_id, 'evt-one');
assert.equal(rowObject(first.activity, 1).thread_id, 'thread-m1');
assert.equal(rowObject(first.activity, 1).gmail_url, 'https://mail.google.com/mail/u/0/#all/thread-m1');
assert.equal(rowObject(first.activity, 1).message_id, 'm1');
assert.ok(created.lastSuccess);
assert.equal(first.calls.history.length, 1);

const outbound = harness({
  pages: [[{ id: 'sent-1' }]],
  messages: { 'sent-1': message('sent-1', { sent: true, from: 'Matt <book@pokertraininglasvegas.com>', to: 'client@example.com' }) }
});
const sent = sandbox.lvptIngestGmailWithDeps_(outbound.deps);
assert.equal(sent.created, 1);
assert.equal(rowObject(outbound.activity, 1).direction, 'Outbound');
assert.equal(rowObject(outbound.activity, 1).event_id, 'evt-one');

const ambiguous = harness({
  pages: [[{ id: 'amb-1' }]],
  events: sheet(['event_id', 'contact_email'], [
    { event_id: 'evt-a', contact_email: 'client@example.com' },
    { event_id: 'evt-b', contact_email: 'client@example.com' }
  ])
});
const queued = sandbox.lvptIngestGmailWithDeps_(ambiguous.deps);
assert.equal(queued.unmatched, 1);
assert.equal(queued.ambiguous, 1);
assert.equal(rowObject(ambiguous.activity, 1).event_id, '');
assert.equal(rowObject(ambiguous.activity, 1).matched_terms, 'ambiguous-contact-email');

const empty = harness({ pages: [[]] });
const none = sandbox.lvptIngestGmailWithDeps_(empty.deps);
assert.equal(none.ok, true);
assert.equal(none.created, 0);
assert.equal(none.examined, 0);
assert.ok(none.lastSuccess);
assert.equal(empty.activity.appends, 0);

const again = harness({ activity: first.activity, pages: [[{ id: 'm1' }, { id: 'm2' }]] });
const duplicate = sandbox.lvptIngestGmailWithDeps_(again.deps);
assert.equal(duplicate.ok, true);
assert.equal(duplicate.created, 0);
assert.equal(duplicate.duplicates, 2);
assert.equal(first.activity.appends, 2);

const interrupted = harness({ pages: [[{ id: 'a1' }, { id: 'a2' }], [{ id: 'a3' }]], failOn: 'a2' });
const failed = sandbox.lvptIngestGmailWithDeps_(interrupted.deps);
assert.equal(failed.ok, false);
assert.equal(interrupted.activity.appends, 1);
assert.equal(rowObject(interrupted.activity, 1).message_id, 'a1');
const saved = JSON.parse(interrupted.store.values.LVPT_GMAIL_INGEST_STATE);
assert.equal(saved.pageToken, '');
assert.equal(saved.lastSuccess, '');
const recovered = sandbox.lvptIngestGmailWithDeps_(interrupted.deps);
assert.equal(recovered.ok, true);
assert.equal(recovered.created, 2);
assert.equal(recovered.duplicates, 1);
assert.equal(interrupted.activity.appends, 3);
assert.deepEqual(interrupted.activity.data.slice(1).map((row) => row[HEADERS.indexOf('message_id')]), ['a1', 'a2', 'a3']);

const locked = harness({ locked: true });
const busy = sandbox.lvptIngestGmailWithDeps_(locked.deps);
assert.equal(busy.ok, false);
assert.equal(busy.reason, 'lock_held');
assert.equal(busy.lastSuccess, '');
assert.equal(locked.calls.opened.length, 0);

const production = harness({ sheetId: PRODUCTION });
const refused = sandbox.lvptIngestGmailWithDeps_(production.deps);
assert.equal(refused.ok, false);
assert.match(refused.reason, /Refusing to write/);
assert.equal(production.calls.opened.length, 0);
assert.equal(production.activity.appends, 0);

const paged = harness({
  pages: [[{ id: 'p1' }], [{ id: 'p2' }]],
  maxPages: 1
});
const partial = sandbox.lvptIngestGmailWithDeps_(paged.deps);
assert.equal(partial.ok, true);
assert.equal(partial.created, 1);
assert.equal(JSON.parse(paged.store.values.LVPT_GMAIL_INGEST_STATE).pageToken, 'page-1');
const rest = sandbox.lvptIngestGmailWithDeps_(paged.deps);
assert.equal(rest.created, 1);
assert.equal(paged.activity.appends, 2);

const expired = harness({
  state: { mode: 'history', historyId: '50', pendingHistoryId: '50', pageToken: '' },
  history: { notFound: true, messageIds: [] }
});
const restart = sandbox.lvptIngestGmailWithDeps_(expired.deps);
assert.equal(restart.ok, false);
assert.equal(restart.reason, 'history_expired_backfill_restarted');
assert.equal(JSON.parse(expired.store.values.LVPT_GMAIL_INGEST_STATE).mode, 'backfill');
assert.equal(expired.activity.appends, 0);

const triggers = [];
const installer = {
  properties: properties({ LVPT_GMAIL_INGEST_SPREADSHEET_ID: TEST_SHEET }),
  listTriggers() { return triggers.map((handler) => ({ getHandlerFunction: () => handler })); },
  deleteTrigger() { triggers.pop(); },
  createTrigger() { triggers.push(sandbox.LVPT_GMAIL_INGEST_HANDLER); }
};
assert.equal(sandbox.lvptInstallGmailIngestTriggerWithDeps_(installer).created, true);
assert.equal(sandbox.lvptInstallGmailIngestTriggerWithDeps_(installer).created, false);
assert.equal(triggers.length, 1);
triggers.push(sandbox.LVPT_GMAIL_INGEST_HANDLER);
assert.equal(sandbox.lvptInstallGmailIngestTriggerWithDeps_(installer).created, false);
assert.equal(triggers.length, 1);
assert.throws(() => sandbox.lvptInstallGmailIngestTriggerWithDeps_({
  properties: properties({ LVPT_GMAIL_INGEST_SPREADSHEET_ID: PRODUCTION }),
  listTriggers() { return []; },
  deleteTrigger() {},
  createTrigger() { throw new Error('should not create'); }
}), /isolated test sheet/);

assert.equal(source.includes('sendEmail'), false);
assert.equal(source.includes("method: 'get'"), true);
assert.equal(source.includes('function doPost'), false);

console.log('Gmail ingest isolated-sheet tests passed.');
