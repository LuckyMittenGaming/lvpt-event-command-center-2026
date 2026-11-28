/**
 * R28 Stage 3 — granular owner sheet writes (single-record only).
 * Bulk tab overwrite remains permanently rejected.
 * Synthetic adapters only in tests; live Apps Script wiring is proposed separately.
 */

export const BULK_TAB_OVERWRITE_ENABLED = false;

export const EVENT_OVERRIDE_FIELDS = Object.freeze([
  'status',
  'pipelineStage',
  'paymentStatus',
  'owner',
  'eventDate',
  'followUpSnoozeUntil'
]);

export const EVENT_STATUS_OPTIONS = Object.freeze([
  'New Lead',
  'Needs Discovery',
  'Quote Needed',
  'Proposal Sent',
  'Invoice Sent',
  'Invoice Sent / Awaiting Deposit',
  'Deposit Paid',
  'Booked',
  'Booked - Payment Processing',
  'Pre-Production',
  'Event Day',
  'Completed',
  'Post-Event Follow-Up',
  'Closed Won',
  'Closed Lost',
  'Outcome Unverified',
  'Declined',
  'Cancelled'
]);

export const PIPELINE_STAGE_OPTIONS = Object.freeze([
  'new_discovery',
  'quote_proposal',
  'invoiced_not_booked',
  'needs_review',
  'follow_up_due'
]);

export const PIPELINE_LANE_STATUS = Object.freeze({
  new_discovery: 'Needs Discovery',
  quote_proposal: 'Proposal Sent',
  invoiced_not_booked: 'Invoice Sent',
  needs_review: 'Outcome Unverified',
  follow_up_due: null
});

export const PAYMENT_STATUS_OPTIONS = Object.freeze([
  'Not Invoiced',
  'Invoice Sent',
  'Deposit Paid',
  'Payment Initiated',
  'Awaiting owner receipt confirmation',
  'Paid In Full',
  'Partial',
  'Refunded',
  'Unknown'
]);

export const BUSINESS_EXPENSE_CATEGORIES = Object.freeze([
  'Software/SaaS',
  'Marketing/Ads',
  'Poker Gear/Cards/Chips',
  'Travel',
  'Legal/Insurance',
  'Misc'
]);

export const CHANGE_LOG_SOURCE = 'Command Center';

const BULK_KEYS = Object.freeze(['events', 'snapshot', 'bulk', 'allEvents', 'replaceAll', 'rows', 'expenses']);

const ERROR = Object.freeze({
  UNAUTHORIZED: 'unauthorized',
  MISSING_ID: 'missing_stable_id',
  UNKNOWN_FIELD: 'unknown_field',
  INVALID_VALUE: 'invalid_value',
  EVENT_NOT_FOUND: 'event_not_found',
  BULK_REJECTED: 'bulk_snapshot_rejected',
  NO_CHANGES: 'no_changes',
  MISSING_IDEMPOTENCY: 'missing_idempotency_key'
});

function text(value, max = 400) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function freezeDeep(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  if (Array.isArray(value)) {
    value.forEach(freezeDeep);
    return Object.freeze(value);
  }
  for (const key of Object.keys(value)) freezeDeep(value[key]);
  return Object.freeze(value);
}

function clone(value) {
  return structuredClone(value);
}

function nowIso(clock) {
  if (typeof clock === 'function') return clock();
  if (typeof clock === 'string' && clock) return clock;
  return new Date().toISOString();
}

export function rejectBulkPayload(input = {}) {
  if (Array.isArray(input)) {
    return { ok: false, code: ERROR.BULK_REJECTED, message: 'Bulk arrays are rejected. Use a single-record mutation.' };
  }
  const keys = Object.keys(input || {});
  const hit = keys.filter((key) => BULK_KEYS.includes(key));
  if (hit.length) {
    return {
      ok: false,
      code: ERROR.BULK_REJECTED,
      message: `Bulk overwrite keys are rejected (${hit.join(', ')}).`
    };
  }
  return { ok: true };
}

function requireAuth(auth) {
  if (!auth || auth.authorized !== true) {
    return { ok: false, code: ERROR.UNAUTHORIZED, message: 'Owner session required.' };
  }
  const actor = text(auth.actor || 'Owner', 60);
  if (!actor) return { ok: false, code: ERROR.UNAUTHORIZED, message: 'Owner actor required.' };
  return { ok: true, actor };
}

function failure(code, message, extra = {}) {
  return freezeDeep({ ok: false, code, message, writesPerformed: false, ...extra });
}

function isoDate(value) {
  const raw = text(value, 40);
  if (!raw) return { ok: true, value: '' };
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return { ok: true, value: raw };
  return { ok: false, code: ERROR.INVALID_VALUE, message: `Invalid date: ${raw}` };
}

/**
 * Validate a single-field event override payload.
 * Exactly one allowlisted field must be present (plus optional note / eventId / idempotency).
 */
export function validateEventOverridePayload(body = {}) {
  const bulk = rejectBulkPayload(body);
  if (!bulk.ok) return failure(bulk.code, bulk.message);

  const eventId = text(body.eventId || body.event_id, 120);
  if (!eventId) return failure(ERROR.MISSING_ID, 'eventId is required.');

  const unknown = Object.keys(body).filter((key) => {
    if (['eventId', 'event_id', 'note', 'idempotencyKey', 'actor', 'auth', 'field', 'value', 'oldValue'].includes(key)) return false;
    return !EVENT_OVERRIDE_FIELDS.includes(key);
  });
  if (unknown.length) {
    return failure(ERROR.UNKNOWN_FIELD, `Unknown field(s): ${unknown.join(', ')}.`, { unknown });
  }

  let field = text(body.field, 40);
  let value = body.value;
  if (!field) {
    const present = EVENT_OVERRIDE_FIELDS.filter((key) => Object.prototype.hasOwnProperty.call(body, key));
    if (present.length !== 1) {
      return failure(ERROR.INVALID_VALUE, 'Provide exactly one allowlisted override field.');
    }
    field = present[0];
    value = body[field];
  } else if (!EVENT_OVERRIDE_FIELDS.includes(field)) {
    return failure(ERROR.UNKNOWN_FIELD, `Field is not allowlisted: ${field}`);
  }

  const normalized = normalizeOverrideValue(field, value);
  if (!normalized.ok) return normalized;

  const note = text(body.note, 500);
  const idempotencyKey = text(body.idempotencyKey, 160);

  return freezeDeep({
    ok: true,
    eventId,
    field,
    value: normalized.value,
    note,
    idempotencyKey,
    diffLabel: fieldLabel(field)
  });
}

function fieldLabel(field) {
  return {
    status: 'Status',
    pipelineStage: 'Deal Stage',
    paymentStatus: 'Payment Status',
    owner: 'Owner',
    eventDate: 'Event Date',
    followUpSnoozeUntil: 'Follow-Up Snooze'
  }[field] || field;
}

function normalizeOverrideValue(field, value) {
  if (field === 'status') {
    const next = text(value, 80);
    if (!EVENT_STATUS_OPTIONS.includes(next)) {
      return failure(ERROR.INVALID_VALUE, `Status is not allowlisted: ${next}`);
    }
    return { ok: true, value: next };
  }
  if (field === 'pipelineStage') {
    const next = text(value, 80).toLowerCase().replace(/\s+/g, '_');
    if (!PIPELINE_STAGE_OPTIONS.includes(next)) {
      return failure(ERROR.INVALID_VALUE, `Deal stage is not allowlisted: ${next}`);
    }
    return { ok: true, value: next };
  }
  if (field === 'paymentStatus') {
    const next = text(value, 80);
    if (!PAYMENT_STATUS_OPTIONS.includes(next)) {
      return failure(ERROR.INVALID_VALUE, `Payment status is not allowlisted: ${next}`);
    }
    return { ok: true, value: next };
  }
  if (field === 'owner') {
    const next = text(value, 80);
    if (!next) return failure(ERROR.INVALID_VALUE, 'Owner is required.');
    return { ok: true, value: next };
  }
  if (field === 'eventDate' || field === 'followUpSnoozeUntil') {
    const dated = isoDate(value);
    if (!dated.ok) return dated;
    return { ok: true, value: dated.value };
  }
  return failure(ERROR.UNKNOWN_FIELD, `Unsupported field: ${field}`);
}

export function formatOverrideDiff(field, oldValue, newValue) {
  const label = fieldLabel(field);
  const from = text(oldValue, 120) || '(empty)';
  const to = text(newValue, 120) || '(empty)';
  return `${label}: ${from} → ${to}`;
}

export function validateBusinessExpensePayload(body = {}) {
  const bulk = rejectBulkPayload(body);
  if (!bulk.ok) return failure(bulk.code, bulk.message);

  const unknown = Object.keys(body).filter((key) => ![
    'expenseId', 'expense_id', 'date', 'vendor', 'category', 'description',
    'amount', 'paymentMethod', 'payment_method', 'status', 'receiptUrl', 'receipt_url',
    'notes', 'note', 'idempotencyKey', 'actor', 'auth'
  ].includes(key));
  if (unknown.length) {
    return failure(ERROR.UNKNOWN_FIELD, `Unknown expense field(s): ${unknown.join(', ')}.`, { unknown });
  }

  const dated = isoDate(body.date);
  if (!dated.ok) return dated;
  if (!dated.value) return failure(ERROR.INVALID_VALUE, 'Expense date is required.');

  const vendor = text(body.vendor, 120);
  if (!vendor) return failure(ERROR.INVALID_VALUE, 'Vendor is required.');

  const category = text(body.category, 80);
  if (!BUSINESS_EXPENSE_CATEGORIES.includes(category)) {
    return failure(ERROR.INVALID_VALUE, `Category is not allowlisted: ${category}`);
  }

  const amountRaw = body.amount;
  const amountNumber = typeof amountRaw === 'number' ? amountRaw : Number(String(amountRaw ?? '').replace(/[$,\s]/g, ''));
  if (!Number.isFinite(amountNumber) || amountNumber < 0 || amountNumber >= 1e9) {
    return failure(ERROR.INVALID_VALUE, 'Amount must be a non-negative number.');
  }

  const expenseId = text(body.expenseId || body.expense_id, 120) || `exp-${Date.now().toString(36)}`;
  return freezeDeep({
    ok: true,
    expense: {
      expense_id: expenseId,
      date: dated.value,
      vendor,
      category,
      description: text(body.description, 280),
      amount: Math.round(amountNumber * 100) / 100,
      payment_method: text(body.paymentMethod || body.payment_method, 80),
      status: text(body.status, 80) || 'Recorded',
      receipt_url: text(body.receiptUrl || body.receipt_url, 400),
      notes: text(body.notes || body.note, 400)
    },
    idempotencyKey: text(body.idempotencyKey, 160)
  });
}

function readField(event, field) {
  if (!event) return '';
  if (field === 'status') return text(event.status, 80);
  if (field === 'pipelineStage') return text(event.pipelineStage || event.dealStage, 80);
  if (field === 'paymentStatus') return text(event.paymentStatus || (event.payment && event.payment.status), 80);
  if (field === 'owner') return text(event.owner || (event.setup && event.setup.internalOwner), 80);
  if (field === 'eventDate') return text(event.eventDate, 40);
  if (field === 'followUpSnoozeUntil') return text(event.followUpSnoozeUntil, 40);
  return '';
}

function writeField(event, field, value) {
  if (field === 'status') {
    event.status = value;
    const mappedStage = Object.entries(PIPELINE_LANE_STATUS).find(([, status]) => status === value);
    if (mappedStage) event.pipelineStage = mappedStage[0];
    return;
  }
  if (field === 'pipelineStage') {
    event.pipelineStage = value;
    const mapped = PIPELINE_LANE_STATUS[value];
    if (mapped) event.status = mapped;
    return;
  }
  if (field === 'paymentStatus') {
    event.paymentStatus = value;
    event.payment = event.payment || {};
    event.payment.status = value;
    return;
  }
  if (field === 'owner') {
    event.owner = value;
    event.setup = event.setup || {};
    event.setup.internalOwner = value;
    return;
  }
  if (field === 'eventDate') {
    event.eventDate = value;
    return;
  }
  if (field === 'followUpSnoozeUntil') {
    event.followUpSnoozeUntil = value;
  }
}

function appendChangeLog(store, entry) {
  store.changeLog.push(freezeDeep({
    changeId: `chg-${store.changeSeq += 1}`,
    timestamp: entry.timestamp,
    event: entry.eventId,
    actor: entry.actor,
    field: entry.field,
    old_value: entry.oldValue,
    new_value: entry.newValue,
    note: entry.note || '',
    source: CHANGE_LOG_SOURCE
  }));
}

/**
 * Apply one validated event override against a synthetic in-memory store.
 */
export function applyEventOverride(store, request = {}) {
  const bulk = rejectBulkPayload(request);
  if (!bulk.ok) return failure(bulk.code, bulk.message);

  const auth = requireAuth(request.auth);
  if (!auth.ok) return failure(auth.code, auth.message);

  const validated = validateEventOverridePayload(request);
  if (!validated.ok) return validated;

  if (!validated.idempotencyKey) {
    return failure(ERROR.MISSING_IDEMPOTENCY, 'idempotencyKey is required.');
  }
  if (store.idempotency.has(validated.idempotencyKey)) {
    const prior = store.idempotency.get(validated.idempotencyKey);
    return freezeDeep({ ...clone(prior), idempotentReplay: true, writesPerformed: false });
  }

  const event = store.events.find((row) => row.id === validated.eventId);
  if (!event) return failure(ERROR.EVENT_NOT_FOUND, `Event ${validated.eventId} was not found.`);

  const oldValue = readField(event, validated.field);
  if (String(oldValue) === String(validated.value)) {
    return failure(ERROR.NO_CHANGES, 'New value matches the current value.');
  }

  writeField(event, validated.field, validated.value);
  const at = nowIso(store.clock);
  appendChangeLog(store, {
    timestamp: at,
    eventId: validated.eventId,
    actor: auth.actor,
    field: validated.field,
    oldValue,
    newValue: validated.value,
    note: validated.note
  });

  const result = freezeDeep({
    ok: true,
    writesPerformed: true,
    bulkOverwrite: false,
    eventId: validated.eventId,
    field: validated.field,
    oldValue,
    newValue: validated.value,
    note: validated.note,
    diff: formatOverrideDiff(validated.field, oldValue, validated.value),
    changeLog: store.changeLog[store.changeLog.length - 1],
    event: clone(event)
  });
  store.idempotency.set(validated.idempotencyKey, clone(result));
  return result;
}

export function applyBusinessExpense(store, request = {}) {
  const bulk = rejectBulkPayload(request);
  if (!bulk.ok) return failure(bulk.code, bulk.message);

  const auth = requireAuth(request.auth);
  if (!auth.ok) return failure(auth.code, auth.message);

  const validated = validateBusinessExpensePayload(request);
  if (!validated.ok) return validated;

  if (!validated.idempotencyKey) {
    return failure(ERROR.MISSING_IDEMPOTENCY, 'idempotencyKey is required.');
  }
  if (store.idempotency.has(validated.idempotencyKey)) {
    const prior = store.idempotency.get(validated.idempotencyKey);
    return freezeDeep({ ...clone(prior), idempotentReplay: true, writesPerformed: false });
  }

  store.expenses.push(clone(validated.expense));
  const at = nowIso(store.clock);
  appendChangeLog(store, {
    timestamp: at,
    eventId: validated.expense.expense_id,
    actor: auth.actor,
    field: 'business_expense',
    oldValue: '',
    newValue: `${validated.expense.vendor} ${validated.expense.amount}`,
    note: validated.expense.notes || `Added business expense ${validated.expense.expense_id}`
  });

  const result = freezeDeep({
    ok: true,
    writesPerformed: true,
    bulkOverwrite: false,
    expense: validated.expense,
    changeLog: store.changeLog[store.changeLog.length - 1]
  });
  store.idempotency.set(validated.idempotencyKey, clone(result));
  return result;
}

export function createGranularWriteStore(seed = {}, options = {}) {
  const store = {
    events: clone(Array.isArray(seed.events) ? seed.events : []),
    expenses: clone(Array.isArray(seed.expenses) ? seed.expenses : []),
    changeLog: [],
    changeSeq: 0,
    idempotency: new Map(),
    clock: options.clock || null
  };
  return {
    snapshot() {
      return freezeDeep({
        events: clone(store.events),
        expenses: clone(store.expenses),
        changeLog: clone(store.changeLog),
        bulkTabOverwriteEnabled: BULK_TAB_OVERWRITE_ENABLED
      });
    },
    applyEventOverride(request) {
      return applyEventOverride(store, request);
    },
    applyBusinessExpense(request) {
      return applyBusinessExpense(store, request);
    }
  };
}

export const GRANULAR_WRITE_ERROR_CODES = ERROR;
