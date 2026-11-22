// Append-only Gmail ingestion for an isolated staging sheet.
// This file is not registered in doPost. Do not clasp push the parent
// apps-script folder, and do not deploy it onto the production web app.
// A staging project contains only this file plus
// apps-script/staging-gmail-ingest/appsscript.json.
// It never sends mail and it never rewrites existing Gmail Activity rows.

var LVPT_GMAIL_INGEST_PRODUCTION_SHEET_ID = '1oHoVdD5CDcEreyRnB7cEvYfp6wWEgAmf04BwrktkMYs';
var LVPT_GMAIL_INGEST_BOOKING = 'book@pokertraininglasvegas.com';
var LVPT_GMAIL_INGEST_HANDLER = 'lvptRunGmailIngestStaging_';
var LVPT_GMAIL_INGEST_HEADERS = [
  'gmail_activity_id', 'event_id', 'thread_id', 'message_id', 'direction',
  'message_date', 'from_email', 'to_email', 'cc_email', 'subject', 'snippet',
  'gmail_url', 'matched_terms', 'task_created', 'last_synced_at'
];

function lvptGmailIngestSheetAllowed_(sheetId) {
  var id = String(sheetId || '').trim();
  return /^[a-zA-Z0-9_-]{20,}$/.test(id) && id !== LVPT_GMAIL_INGEST_PRODUCTION_SHEET_ID;
}

function lvptGmailIngestDefaultState_() {
  return {
    mode: 'backfill',
    queryAfter: '2026/01/01',
    pageToken: '',
    pendingHistoryId: '',
    historyId: '',
    historyPageToken: '',
    lastAttempt: '',
    lastSuccess: '',
    lastError: '',
    examined: 0,
    created: 0,
    duplicates: 0,
    unmatched: 0,
    ambiguous: 0
  };
}

function lvptGmailIngestReadState_(properties) {
  var raw = properties.getProperty('LVPT_GMAIL_INGEST_STATE');
  var state = lvptGmailIngestDefaultState_();
  if (!raw) return state;
  try {
    var saved = JSON.parse(raw);
    Object.keys(state).forEach(function(key) {
      if (saved && Object.prototype.hasOwnProperty.call(saved, key) && saved[key] !== undefined && saved[key] !== null) {
        state[key] = saved[key];
      }
    });
  } catch (ignore) {}
  return state;
}

function lvptGmailIngestWriteState_(properties, state) {
  properties.setProperty('LVPT_GMAIL_INGEST_STATE', JSON.stringify(state));
}

function lvptGmailIngestResult_(ok, state, reason) {
  return {
    ok: ok,
    reason: reason || '',
    writesPerformed: state.created > 0,
    examined: state.examined,
    created: state.created,
    duplicates: state.duplicates,
    unmatched: state.unmatched,
    ambiguous: state.ambiguous,
    lastAttempt: state.lastAttempt,
    lastSuccess: state.lastSuccess,
    lastError: state.lastError,
    mode: state.mode,
    pageToken: state.pageToken,
    historyId: state.historyId
  };
}

function lvptGmailIngestHeaders_(sheet) {
  var width = sheet.getLastColumn();
  if (!width) throw new Error('Gmail Activity has no header row.');
  return sheet.getRange(1, 1, 1, width).getValues()[0].map(function(header) {
    return String(header || '').trim();
  });
}

function lvptGmailIngestRequireHeaders_(headers) {
  var present = {};
  headers.forEach(function(header) { if (header) present[header] = true; });
  LVPT_GMAIL_INGEST_HEADERS.forEach(function(header) {
    if (!present[header]) throw new Error('Gmail Activity is missing column ' + header);
  });
}

function lvptGmailIngestColumn_(headers, name) {
  for (var index = 0; index < headers.length; index++) {
    if (headers[index] === name) return index;
  }
  return -1;
}

function lvptGmailIngestExistingIds_(sheet, headers) {
  var column = lvptGmailIngestColumn_(headers, 'message_id');
  var existing = {};
  var values = sheet.getDataRange().getValues();
  for (var row = 1; row < values.length; row++) {
    var messageId = String(values[row][column] || '').trim();
    if (messageId) existing[messageId] = true;
  }
  return existing;
}

function lvptGmailIngestEvents_(sheet) {
  var values = sheet.getDataRange().getValues();
  if (!values.length) return {};
  var headers = values[0].map(function(header) { return String(header || '').trim(); });
  var emailColumn = lvptGmailIngestColumn_(headers, 'contact_email');
  var idColumn = lvptGmailIngestColumn_(headers, 'event_id');
  var eventsByEmail = {};
  if (emailColumn < 0 || idColumn < 0) return eventsByEmail;
  for (var row = 1; row < values.length; row++) {
    var email = String(values[row][emailColumn] || '').trim().toLowerCase();
    var eventId = String(values[row][idColumn] || '').trim();
    if (!email || !eventId || email === LVPT_GMAIL_INGEST_BOOKING) continue;
    eventsByEmail[email] = eventsByEmail[email] || [];
    if (eventsByEmail[email].indexOf(eventId) < 0) eventsByEmail[email].push(eventId);
  }
  return eventsByEmail;
}

function lvptGmailIngestAddresses_(value) {
  var found = String(value || '').toLowerCase().match(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}/g);
  return found || [];
}

function lvptGmailIngestHeader_(message, name) {
  var headers = (message.payload && message.payload.headers) || [];
  var match = headers.filter(function(header) {
    return String(header.name || '').toLowerCase() === name;
  })[0];
  return String(match && match.value || '');
}

function lvptGmailIngestDirection_(message, from) {
  var labels = message.labelIds || [];
  var booking = '(?:^|[<,\\s])' + LVPT_GMAIL_INGEST_BOOKING.replace(/\./g, '\\.') + '(?=[>,\\s]|$)';
  var sent = labels.indexOf('SENT') >= 0 || new RegExp(booking, 'i').test(from);
  return sent ? 'Outbound' : 'Inbound';
}

function lvptGmailIngestMatch_(from, to, cc, eventsByEmail) {
  var emails = {};
  lvptGmailIngestAddresses_([from, to, cc].join(' ')).forEach(function(email) {
    if (email !== LVPT_GMAIL_INGEST_BOOKING) emails[email] = true;
  });
  var eventIds = {};
  Object.keys(emails).forEach(function(email) {
    (eventsByEmail[email] || []).forEach(function(eventId) { eventIds[eventId] = true; });
  });
  var ids = Object.keys(eventIds);
  if (ids.length === 1) return { eventId: ids[0], terms: 'exact-contact-email' };
  if (ids.length > 1) return { eventId: '', terms: 'ambiguous-contact-email' };
  return { eventId: '', terms: 'unmatched' };
}

function lvptGmailIngestRecord_(message, eventsByEmail, syncedAt) {
  var from = lvptGmailIngestHeader_(message, 'from');
  var to = lvptGmailIngestHeader_(message, 'to');
  var cc = lvptGmailIngestHeader_(message, 'cc');
  var match = lvptGmailIngestMatch_(from, to, cc, eventsByEmail);
  var threadId = String(message.threadId || '').trim();
  var messageId = String(message.id || '').trim();
  return {
    gmail_activity_id: 'ingest-' + messageId,
    event_id: match.eventId,
    thread_id: threadId,
    message_id: messageId,
    direction: lvptGmailIngestDirection_(message, from),
    message_date: new Date(Number(message.internalDate)).toISOString(),
    from_email: from.slice(0, 200),
    to_email: to.slice(0, 200),
    cc_email: cc.slice(0, 200),
    subject: lvptGmailIngestHeader_(message, 'subject').slice(0, 180),
    snippet: '',
    gmail_url: 'https://mail.google.com/mail/u/0/#all/' + encodeURIComponent(threadId),
    matched_terms: match.terms,
    task_created: false,
    last_synced_at: syncedAt
  };
}

function lvptGmailIngestConsumeIds_(ids, deps, sheet, headers, existing, eventsByEmail, counters) {
  ids.forEach(function(rawId) {
    var messageId = String(rawId || '').trim();
    if (!messageId) return;
    counters.examined++;
    if (existing[messageId]) {
      counters.duplicates++;
      return;
    }
    var message = deps.getMessage(messageId);
    var threadId = message && String(message.threadId || '').trim();
    var internalDate = Number(message && message.internalDate);
    if (!message || message.id !== messageId || !threadId || !Number.isFinite(internalDate) || internalDate <= 0) {
      throw new Error('Gmail metadata incomplete. The checkpoint was not advanced.');
    }
    var record = lvptGmailIngestRecord_(message, eventsByEmail, deps.now());
    sheet.appendRow(headers.map(function(name) {
      return Object.prototype.hasOwnProperty.call(record, name) ? record[name] : '';
    }));
    existing[messageId] = true;
    counters.created++;
    if (record.matched_terms === 'ambiguous-contact-email') counters.ambiguous++;
    if (!record.event_id) counters.unmatched++;
  });
}

function lvptIngestGmailWithDeps_(deps) {
  var properties = deps.properties;
  var now = deps.now();
  var state = lvptGmailIngestReadState_(properties);
  var previousSuccess = state.lastSuccess;
  if (!deps.lock.tryLock(deps.lockWaitMs || 5000)) {
    state.lastAttempt = now;
    state.lastError = 'lock_held';
    lvptGmailIngestWriteState_(properties, state);
    return lvptGmailIngestResult_(false, state, 'lock_held');
  }
  var counters = { examined: 0, created: 0, duplicates: 0, unmatched: 0, ambiguous: 0 };
  try {
    var sheetId = String(properties.getProperty('LVPT_GMAIL_INGEST_SPREADSHEET_ID') || '').trim();
    if (!lvptGmailIngestSheetAllowed_(sheetId)) {
      throw new Error('Refusing to write. LVPT_GMAIL_INGEST_SPREADSHEET_ID must be an isolated sheet, not the production command center.');
    }
    state.lastAttempt = now;
    state.lastError = '';
    lvptGmailIngestWriteState_(properties, state);
    var spreadsheet = deps.openSpreadsheet(sheetId);
    var activity = spreadsheet.getSheetByName('Gmail Activity');
    if (!activity) throw new Error('Missing sheet: Gmail Activity');
    var headers = lvptGmailIngestHeaders_(activity);
    lvptGmailIngestRequireHeaders_(headers);
    var existing = lvptGmailIngestExistingIds_(activity, headers);
    var eventsSheet = spreadsheet.getSheetByName('Events');
    var eventsByEmail = eventsSheet ? lvptGmailIngestEvents_(eventsSheet) : {};
    var maxPages = deps.maxPages || 10;
    if (!state.pendingHistoryId) {
      var profile = deps.getProfile();
      if (!profile || !profile.historyId) throw new Error('Gmail profile history id was not returned.');
      state.pendingHistoryId = String(profile.historyId);
      lvptGmailIngestWriteState_(properties, state);
    }
    var pages = 0;
    if (state.mode !== 'history') {
      while (pages < maxPages) {
        var listed = deps.listMessages({
          query: 'after:' + state.queryAfter + ' -in:spam -in:trash',
          pageToken: state.pageToken || '',
          maxResults: 100
        });
        var messages = listed && listed.messages ? listed.messages : [];
        lvptGmailIngestConsumeIds_(messages.map(function(item) { return item && item.id; }), deps, activity, headers, existing, eventsByEmail, counters);
        state.pageToken = listed && listed.nextPageToken ? String(listed.nextPageToken) : '';
        pages++;
        lvptGmailIngestWriteState_(properties, state);
        if (!state.pageToken) {
          state.mode = 'history';
          state.historyId = state.pendingHistoryId;
          state.historyPageToken = '';
          lvptGmailIngestWriteState_(properties, state);
          break;
        }
      }
    }
    if (state.mode === 'history') {
      var historyPages = 0;
      while (historyPages < maxPages) {
        var history = deps.listHistory({
          startHistoryId: state.historyId,
          pageToken: state.historyPageToken || ''
        });
        if (history && history.notFound) {
          state.mode = 'backfill';
          state.pageToken = '';
          state.historyPageToken = '';
          state.pendingHistoryId = '';
          state.lastError = 'history_expired_backfill_restarted';
          break;
        }
        lvptGmailIngestConsumeIds_(history && history.messageIds ? history.messageIds : [], deps, activity, headers, existing, eventsByEmail, counters);
        state.historyPageToken = history && history.nextPageToken ? String(history.nextPageToken) : '';
        historyPages++;
        if (!state.historyPageToken) {
          if (history && history.historyId) {
            state.historyId = String(history.historyId);
            state.pendingHistoryId = state.historyId;
          }
          break;
        }
      }
    }
    state.examined = counters.examined;
    state.created = counters.created;
    state.duplicates = counters.duplicates;
    state.unmatched = counters.unmatched;
    state.ambiguous = counters.ambiguous;
    if (state.lastError === 'history_expired_backfill_restarted') {
      lvptGmailIngestWriteState_(properties, state);
      return lvptGmailIngestResult_(false, state, state.lastError);
    }
    state.lastSuccess = deps.now();
    state.lastError = '';
    lvptGmailIngestWriteState_(properties, state);
    return lvptGmailIngestResult_(true, state, '');
  } catch (error) {
    var failed = lvptGmailIngestReadState_(properties);
    failed.lastAttempt = now;
    failed.lastSuccess = previousSuccess;
    failed.lastError = String(error && error.message || error).slice(0, 180);
    failed.examined = counters.examined;
    failed.created = counters.created;
    failed.duplicates = counters.duplicates;
    failed.unmatched = counters.unmatched;
    failed.ambiguous = counters.ambiguous;
    lvptGmailIngestWriteState_(properties, failed);
    return lvptGmailIngestResult_(false, failed, failed.lastError);
  } finally {
    try { deps.lock.releaseLock(); } catch (ignoreRelease) {}
  }
}

function lvptGmailIngestGet_(url) {
  var response = UrlFetchApp.fetch(url, {
    method: 'get',
    muteHttpExceptions: true,
    followRedirects: false,
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }
  });
  return { status: response.getResponseCode(), body: response.getContentText() };
}

function lvptGmailIngestLiveDeps_() {
  return {
    now: function() { return new Date().toISOString(); },
    properties: PropertiesService.getScriptProperties(),
    lock: LockService.getScriptLock(),
    maxPages: 10,
    openSpreadsheet: function(id) { return SpreadsheetApp.openById(id); },
    getProfile: function() {
      var response = lvptGmailIngestGet_('https://gmail.googleapis.com/gmail/v1/users/me/profile');
      if (response.status !== 200) throw new Error('Gmail profile was not readable.');
      return JSON.parse(response.body);
    },
    listMessages: function(query) {
      var url = 'https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=100&q=' + encodeURIComponent(query.query);
      if (query.pageToken) url += '&pageToken=' + encodeURIComponent(query.pageToken);
      var response = lvptGmailIngestGet_(url);
      if (response.status !== 200) throw new Error('Gmail message list was not readable.');
      return JSON.parse(response.body);
    },
    getMessage: function(messageId) {
      var url = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/' + encodeURIComponent(messageId) +
        '?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Subject&metadataHeaders=Date';
      var response = lvptGmailIngestGet_(url);
      if (response.status !== 200) throw new Error('Gmail message metadata was not readable.');
      return JSON.parse(response.body);
    },
    listHistory: function(query) {
      var url = 'https://gmail.googleapis.com/gmail/v1/users/me/history?historyTypes=messageAdded&maxResults=100&startHistoryId=' +
        encodeURIComponent(query.startHistoryId);
      if (query.pageToken) url += '&pageToken=' + encodeURIComponent(query.pageToken);
      var response = lvptGmailIngestGet_(url);
      if (response.status === 404) return { notFound: true, messageIds: [] };
      if (response.status !== 200) throw new Error('Gmail history was not readable.');
      var payload = JSON.parse(response.body);
      var ids = [];
      (payload.history || []).forEach(function(entry) {
        (entry.messagesAdded || []).forEach(function(item) {
          if (item.message && item.message.id) ids.push(item.message.id);
        });
      });
      return { historyId: payload.historyId, nextPageToken: payload.nextPageToken || '', messageIds: ids };
    }
  };
}

function lvptRunGmailIngestStaging_() {
  return lvptIngestGmailWithDeps_(lvptGmailIngestLiveDeps_());
}

function lvptIngestGmailIncremental_() {
  return lvptRunGmailIngestStaging_();
}

function lvptInstallGmailIngestTriggerWithDeps_(deps) {
  var sheetId = String(deps.properties.getProperty('LVPT_GMAIL_INGEST_SPREADSHEET_ID') || '');
  if (!lvptGmailIngestSheetAllowed_(sheetId)) {
    throw new Error('Refusing to schedule ingestion without an isolated test sheet.');
  }
  var found = deps.listTriggers().filter(function(trigger) {
    return trigger.getHandlerFunction() === LVPT_GMAIL_INGEST_HANDLER;
  });
  while (found.length > 1) deps.deleteTrigger(found.pop());
  if (found.length === 1) return { ok: true, created: false, handler: LVPT_GMAIL_INGEST_HANDLER };
  deps.createTrigger();
  return { ok: true, created: true, handler: LVPT_GMAIL_INGEST_HANDLER };
}

function lvptInstallGmailIngestTrigger_() {
  return lvptInstallGmailIngestTriggerWithDeps_({
    properties: PropertiesService.getScriptProperties(),
    listTriggers: function() { return ScriptApp.getProjectTriggers(); },
    deleteTrigger: function(trigger) { ScriptApp.deleteTrigger(trigger); },
    createTrigger: function() {
      ScriptApp.newTrigger(LVPT_GMAIL_INGEST_HANDLER).timeBased().everyHours(1).create();
    }
  });
}
