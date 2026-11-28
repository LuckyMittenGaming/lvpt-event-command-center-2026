/**
 * LVPT Gmail Auto Triage — read + label + archive + Sheet log ONLY.
 * NEVER deletes emails. NEVER sends emails.
 *
 * dryRun defaults to true. Owner must call runLVPTGmailAutoTriage({ dryRun: false })
 * and separately enable setupHourlyGmailTriageTrigger() after verification.
 *
 * Mailbox: book@pokertraininglasvegas.com
 * This module is repository-only until the owner explicitly clasp-pushes it.
 */

var LVPT_TRIAGE_MAILBOX = 'book@pokertraininglasvegas.com';
var LVPT_TRIAGE_LABELS = [
  'LVPT/01-Active-Events',
  'LVPT/02-Leads-Pipeline',
  'LVPT/03-Vendors-Staff',
  'LVPT/04-Billing-Receipts',
  'LVPT/05-Needs-Review',
  'LVPT/06-Archive-Completed'
];
var LVPT_TRIAGE_HANDLER = 'runLVPTGmailAutoTriageHourly';

function lvptTriageText_(value, max) {
  var clean = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  return clean.slice(0, max || 500);
}

function lvptEnsureGmailLabels_() {
  var created = [];
  LVPT_TRIAGE_LABELS.forEach(function (name) {
    var label = GmailApp.getUserLabelByName(name);
    if (!label) {
      label = GmailApp.createLabel(name);
      created.push(name);
    }
  });
  return { ok: true, labels: LVPT_TRIAGE_LABELS.slice(), created: created };
}

function lvptExtractOperationalSignals_(message, linkedEvent) {
  var blob = [
    message.getSubject ? message.getSubject() : message.subject,
    message.getPlainBody ? String(message.getPlainBody() || '').slice(0, 800) : message.snippet,
    message.getFrom ? message.getFrom() : message.from
  ].join(' ');
  var signals = [];
  if (/\b(poker room|room rental|venue fee|bar tab|beverage|instructor fee|dealer fee|vendor invoice|staffing invoice|payout)\b/i.test(blob)) {
    signals.push({ kind: 'vendor_financial_commitment', label: 'LVPT/03-Vendors-Staff', summary: 'Vendor/venue financial commitment signal' });
  }
  if (/\b(zelle|ach|quickbooks|paid in full|payment received|funds received|receipt|remittance|wire transfer)\b/i.test(blob)) {
    signals.push({ kind: 'payment_receipt', label: 'LVPT/04-Billing-Receipts', summary: 'Payment/receipt acknowledgment signal' });
  }
  if (/\b(uploaded|attached|delivered|confirmed staff|document uploaded|coi attached|w-?9|signed contract)\b/i.test(blob)) {
    signals.push({
      kind: 'task_completion_evidence',
      label: linkedEvent ? 'LVPT/01-Active-Events' : 'LVPT/05-Needs-Review',
      summary: 'Task-completion evidence signal'
    });
  }
  if (/\b(inquiry|interested in|poker training|event quote|looking for a poker)\b/i.test(blob) && !linkedEvent) {
    signals.push({ kind: 'lead_pipeline', label: 'LVPT/02-Leads-Pipeline', summary: 'New lead / pipeline inquiry signal' });
  }
  if (/\b(event tomorrow|day-of|run of show|load-?in|on site)\b/i.test(blob) && linkedEvent) {
    signals.push({ kind: 'active_event_ops', label: 'LVPT/01-Active-Events', summary: 'Active event operations signal' });
  }
  if (!signals.length) {
    signals.push({ kind: 'unclassified', label: 'LVPT/05-Needs-Review', summary: 'No confident operational match' });
  }
  return signals;
}

function lvptRouteThreadLabels_(message, linkedEvent, signals) {
  var extracted = signals || lvptExtractOperationalSignals_(message, linkedEvent);
  var blob = [
    message.getSubject ? message.getSubject() : message.subject,
    message.getFrom ? message.getFrom() : message.from
  ].join(' ');
  var primary = extracted[0] || { kind: 'unclassified', label: 'LVPT/05-Needs-Review' };
  var unreadClient = message.isUnread && message.isUnread() && linkedEvent && !/\b(unsubscribe|newsletter|noreply@|no-reply@)\b/i.test(blob);
  var needsReview = primary.label === 'LVPT/05-Needs-Review' || primary.kind === 'unclassified';
  var clearlyProcessed = /\b(unsubscribe|newsletter|noreply@|no-reply@)\b/i.test(blob)
    || primary.kind === 'payment_receipt'
    || primary.kind === 'task_completion_evidence';
  var archiveInbox = clearlyProcessed && !needsReview && !unreadClient;
  return {
    primaryLabel: primary.label,
    signals: extracted,
    archiveInbox: archiveInbox,
    keepInInbox: !archiveInbox,
    neverDelete: true,
    neverSend: true,
    linkedEventId: linkedEvent && linkedEvent.eventId ? String(linkedEvent.eventId) : ''
  };
}

function lvptTriageLinkEvent_(subject, events) {
  var lower = String(subject || '').toLowerCase();
  for (var i = 0; i < events.length; i++) {
    var event = events[i];
    var company = lvptTriageText_(event.company, 120).toLowerCase();
    var name = lvptTriageText_(event.eventName, 120).toLowerCase();
    if ((company && lower.indexOf(company) !== -1) || (name && lower.indexOf(name) !== -1)) {
      return { eventId: event.id || event.eventId, eventName: event.eventName, status: event.status };
    }
  }
  return null;
}

function lvptTriageEnsureSheet_(name, headers) {
  var ss = lvptSpreadsheet_();
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    return sheet;
  }
  if (sheet.getLastRow() < 1) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  return sheet;
}

function lvptTriageAppendRow_(sheetName, headers, rowObject) {
  var sheet = lvptTriageEnsureSheet_(sheetName, headers);
  var existing = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), headers.length)).getValues()[0]
    .map(function (header) { return String(header || '').trim(); });
  var values = existing.map(function (header) {
    return Object.prototype.hasOwnProperty.call(rowObject, header) ? rowObject[header] : '';
  });
  sheet.getRange(sheet.getLastRow() + 1, 1, 1, values.length).setValues([values]);
}

/**
 * Main entry. dryRun defaults to true.
 */
function runLVPTGmailAutoTriage(options) {
  options = options || {};
  var dryRun = options.dryRun !== false; // default true
  var maxThreads = Number(options.maxThreads) || 40;
  var labelState = lvptEnsureGmailLabels_();
  var events = [];
  try {
    events = typeof lvptListEvents_ === 'function' ? lvptListEvents_() : [];
  } catch (ignore) {
    events = [];
  }

  var threads = GmailApp.search('in:inbox newer_than:14d', 0, maxThreads);
  var examined = 0;
  var labeled = 0;
  var archived = 0;
  var logged = 0;
  var planned = [];

  threads.forEach(function (thread) {
    examined += 1;
    var messages = thread.getMessages();
    if (!messages || !messages.length) return;
    var message = messages[messages.length - 1];
    var subject = message.getSubject() || '';
    var linked = lvptTriageLinkEvent_(subject, events);
    var signals = lvptExtractOperationalSignals_(message, linked);
    var routing = lvptRouteThreadLabels_(message, linked, signals);
    var plan = {
      threadId: thread.getId(),
      messageId: message.getId(),
      subject: subject,
      primaryLabel: routing.primaryLabel,
      archiveInbox: routing.archiveInbox,
      signalKinds: signals.map(function (row) { return row.kind; }).join(','),
      eventId: routing.linkedEventId
    };
    planned.push(plan);

    if (dryRun) return;

    var label = GmailApp.getUserLabelByName(routing.primaryLabel);
    if (label) {
      thread.addLabel(label);
      labeled += 1;
    }
    if (routing.archiveInbox) {
      // Archive = remove INBOX only. Never trash / never delete.
      GmailApp.moveThreadToArchive(thread);
      archived += 1;
    }

    var automationRow = {
      detected_at: new Date(),
      thread_id: thread.getId(),
      message_id: message.getId(),
      event_id: routing.linkedEventId,
      subject: lvptTriageText_(subject, 200),
      snippet: lvptTriageText_(message.getPlainBody(), 280),
      signal_kinds: plan.signalKinds,
      primary_label: routing.primaryLabel,
      archive_inbox: routing.archiveInbox,
      dry_run: false,
      source: 'GmailAutoTriage'
    };
    lvptTriageAppendRow_('Automation Inbox', [
      'detected_at', 'thread_id', 'message_id', 'event_id', 'subject', 'snippet',
      'signal_kinds', 'primary_label', 'archive_inbox', 'dry_run', 'source'
    ], automationRow);
    lvptTriageAppendRow_('Gmail Activity', [
      'gmail_activity_id', 'event_id', 'thread_id', 'message_id', 'direction',
      'message_date', 'from_email', 'to_email', 'cc_email', 'subject', 'snippet',
      'gmail_url', 'matched_terms', 'task_created', 'last_synced_at'
    ], {
      gmail_activity_id: Utilities.getUuid(),
      event_id: routing.linkedEventId,
      thread_id: thread.getId(),
      message_id: message.getId(),
      direction: 'received',
      message_date: message.getDate(),
      from_email: message.getFrom(),
      to_email: LVPT_TRIAGE_MAILBOX,
      cc_email: '',
      subject: lvptTriageText_(subject, 200),
      snippet: lvptTriageText_(message.getPlainBody(), 280),
      gmail_url: 'https://mail.google.com/mail/u/0/#inbox/' + thread.getId(),
      matched_terms: plan.signalKinds,
      task_created: false,
      last_synced_at: new Date()
    });
    logged += 1;
  });

  return {
    ok: true,
    dryRun: dryRun,
    mailbox: LVPT_TRIAGE_MAILBOX,
    neverDelete: true,
    neverSend: true,
    labels: labelState,
    examined: examined,
    labeled: labeled,
    archived: archived,
    logged: logged,
    planned: dryRun ? planned : planned.slice(0, 25)
  };
}

/** Hourly trigger target — still respects Script property dry-run gate. */
function runLVPTGmailAutoTriageHourly() {
  var props = PropertiesService.getScriptProperties();
  var dryRun = String(props.getProperty('LVPT_GMAIL_TRIAGE_DRY_RUN') || 'true') !== 'false';
  return runLVPTGmailAutoTriage({ dryRun: dryRun, maxThreads: 40 });
}

/**
 * Install hourly trigger. Does not enable live writes — dry-run stays on until
 * Script property LVPT_GMAIL_TRIAGE_DRY_RUN is explicitly set to "false".
 */
function setupHourlyGmailTriageTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === LVPT_TRIAGE_HANDLER) ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger(LVPT_TRIAGE_HANDLER).timeBased().everyHours(1).create();
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('LVPT_GMAIL_TRIAGE_DRY_RUN')) {
    props.setProperty('LVPT_GMAIL_TRIAGE_DRY_RUN', 'true');
  }
  return {
    ok: true,
    handler: LVPT_TRIAGE_HANDLER,
    dryRunDefault: true,
    message: 'Hourly triage trigger installed. dryRun remains true until LVPT_GMAIL_TRIAGE_DRY_RUN=false.'
  };
}
