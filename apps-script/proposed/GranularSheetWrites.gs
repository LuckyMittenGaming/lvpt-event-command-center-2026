/**
 * PROPOSED Apps Script handlers for Stage 3 granular sheet writes.
 * Do NOT clasp push without explicit owner approval.
 * Wire into doPost only after review:
 *   if (action === 'updateEventOverride') return lvptJson_(lvptUpdateEventOverride_(payload));
 *   if (action === 'appendBusinessExpense') return lvptJson_(lvptAppendBusinessExpense_(payload));
 *
 * Single-record only. Never rewrite entire Events / Business Expenses tabs.
 * Never send mail. Never mutate Payments / Event Payouts ledgers.
 */

var LVPT_GRANULAR_OVERRIDE_FIELDS = {
  status: 'status',
  pipelineStage: 'planning_stage',
  paymentStatus: 'payment_status',
  owner: 'internal_owner',
  eventDate: 'event_date',
  followUpSnoozeUntil: 'follow_up_snooze_until'
};

var LVPT_BUSINESS_EXPENSE_HEADERS = [
  'expense_id', 'date', 'vendor', 'category', 'description',
  'amount', 'payment_method', 'status', 'receipt_url', 'notes'
];

function lvptGranularHeaders_(sheet) {
  var width = sheet.getLastColumn();
  if (!width) throw new Error('Sheet has no header row.');
  return sheet.getRange(1, 1, 1, width).getValues()[0].map(function (header) {
    return String(header || '').trim();
  });
}

function lvptGranularColumn_(headers, name) {
  for (var i = 0; i < headers.length; i++) {
    if (headers[i] === name) return i;
  }
  return -1;
}

function lvptAppendGranularChangeLog_(entry) {
  var sheet = lvptSpreadsheet_().getSheetByName('Change Log');
  if (!sheet) return null;
  var headers = lvptGranularHeaders_(sheet);
  var rowObject = {
    change_id: Utilities.getUuid(),
    timestamp: entry.timestamp || new Date(),
    event: entry.eventId || '',
    event_id: entry.eventId || '',
    actor: entry.actor || 'Owner',
    field: entry.field || '',
    old_value: entry.oldValue == null ? '' : String(entry.oldValue),
    new_value: entry.newValue == null ? '' : String(entry.newValue),
    note: entry.note || '',
    source: entry.source || 'Command Center'
  };
  var values = headers.map(function (header) {
    if (Object.prototype.hasOwnProperty.call(rowObject, header)) return rowObject[header];
    return '';
  });
  if (!headers.length) {
    values = [
      rowObject.change_id, rowObject.timestamp, rowObject.event_id, rowObject.actor,
      rowObject.field, rowObject.old_value, rowObject.new_value, rowObject.note, rowObject.source
    ];
  }
  sheet.getRange(sheet.getLastRow() + 1, 1, 1, values.length).setValues([values]);
  return rowObject;
}

/**
 * Patch one Events row by event_id for a single allowlisted field.
 */
function lvptUpdateEventOverride_(payload) {
  var eventId = String(payload.eventId || '').trim();
  var field = String(payload.field || '').trim();
  var value = payload.value;
  var actor = String(payload.actor || 'Owner').trim() || 'Owner';
  var note = String(payload.note || '').trim();
  var source = String(payload.source || 'Command Center').trim() || 'Command Center';

  if (!eventId) throw new Error('eventId is required.');
  if (!Object.prototype.hasOwnProperty.call(LVPT_GRANULAR_OVERRIDE_FIELDS, field)) {
    throw new Error('Field is not allowlisted: ' + field);
  }

  var sheet = lvptSpreadsheet_().getSheetByName('Events');
  if (!sheet) throw new Error('Missing sheet: Events');
  var headers = lvptGranularHeaders_(sheet);
  var idCol = lvptGranularColumn_(headers, 'event_id');
  var targetColName = LVPT_GRANULAR_OVERRIDE_FIELDS[field];
  var targetCol = lvptGranularColumn_(headers, targetColName);
  if (idCol < 0) throw new Error('Events sheet is missing event_id.');
  if (targetCol < 0) throw new Error('Events sheet is missing column ' + targetColName);

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) throw new Error('Event not found: ' + eventId);
  var idValues = sheet.getRange(2, idCol + 1, lastRow, idCol + 1).getValues();
  var rowIndex = -1;
  for (var i = 0; i < idValues.length; i++) {
    if (String(idValues[i][0] || '').trim() === eventId) {
      rowIndex = i + 2;
      break;
    }
  }
  if (rowIndex < 0) throw new Error('Event not found: ' + eventId);

  var oldValue = sheet.getRange(rowIndex, targetCol + 1).getValue();
  sheet.getRange(rowIndex, targetCol + 1).setValue(value == null ? '' : value);

  var updatedAtCol = lvptGranularColumn_(headers, 'updated_at');
  if (updatedAtCol >= 0) sheet.getRange(rowIndex, updatedAtCol + 1).setValue(new Date());
  var actorCol = lvptGranularColumn_(headers, 'last_actor');
  if (actorCol >= 0) sheet.getRange(rowIndex, actorCol + 1).setValue(actor);

  var changeLog = lvptAppendGranularChangeLog_({
    timestamp: new Date(),
    eventId: eventId,
    actor: actor,
    field: field,
    oldValue: oldValue,
    newValue: value,
    note: note,
    source: source
  });

  return {
    ok: true,
    writesPerformed: true,
    bulkOverwrite: false,
    eventId: eventId,
    field: field,
    oldValue: oldValue == null ? '' : String(oldValue),
    newValue: value == null ? '' : String(value),
    note: note,
    changeLog: changeLog
  };
}

/**
 * Append one Business Expenses row. Creates the tab with headers if missing.
 */
function lvptAppendBusinessExpense_(payload) {
  var expense = payload.expense || {};
  var actor = String(payload.actor || 'Owner').trim() || 'Owner';
  var source = String(payload.source || 'Command Center').trim() || 'Command Center';
  var expenseId = String(expense.expense_id || expense.expenseId || Utilities.getUuid()).trim();
  if (!expenseId) throw new Error('expense_id is required.');

  var ss = lvptSpreadsheet_();
  var sheet = ss.getSheetByName('Business Expenses');
  if (!sheet) {
    sheet = ss.insertSheet('Business Expenses');
    sheet.getRange(1, 1, 1, LVPT_BUSINESS_EXPENSE_HEADERS.length).setValues([LVPT_BUSINESS_EXPENSE_HEADERS]);
  }
  var headers = lvptGranularHeaders_(sheet);
  if (!headers.length || !headers[0]) {
    sheet.getRange(1, 1, 1, LVPT_BUSINESS_EXPENSE_HEADERS.length).setValues([LVPT_BUSINESS_EXPENSE_HEADERS]);
    headers = LVPT_BUSINESS_EXPENSE_HEADERS.slice();
  }

  var rowObject = {
    expense_id: expenseId,
    date: expense.date || '',
    vendor: expense.vendor || '',
    category: expense.category || 'Misc',
    description: expense.description || '',
    amount: expense.amount == null ? '' : expense.amount,
    payment_method: expense.payment_method || expense.paymentMethod || '',
    status: expense.status || 'Recorded',
    receipt_url: expense.receipt_url || expense.receiptUrl || '',
    notes: expense.notes || ''
  };
  var values = headers.map(function (header) {
    return Object.prototype.hasOwnProperty.call(rowObject, header) ? rowObject[header] : '';
  });
  sheet.getRange(sheet.getLastRow() + 1, 1, 1, values.length).setValues([values]);

  var changeLog = lvptAppendGranularChangeLog_({
    timestamp: new Date(),
    eventId: expenseId,
    actor: actor,
    field: 'business_expense',
    oldValue: '',
    newValue: String(rowObject.vendor || '') + ' ' + String(rowObject.amount || ''),
    note: rowObject.notes || ('Added business expense ' + expenseId),
    source: source
  });

  return {
    ok: true,
    writesPerformed: true,
    bulkOverwrite: false,
    expense: rowObject,
    changeLog: changeLog,
    bankVerified: false
  };
}
