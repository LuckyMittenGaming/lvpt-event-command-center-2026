/**
 * Isolated granular event mutation contract (R09).
 *
 * Pure library + synthetic in-memory adapter only.
 * Does not call Apps Script, Sheets, Calendar, Gmail, or production routes.
 * Production editing remains disabled until a later owner-approved activation (R28).
 */

export const PRODUCTION_MUTATIONS_ENABLED = false;

export const OPERATIONS = Object.freeze({
  CREATE_EVENT: 'create_event',
  UPDATE_EVENT_FIELDS: 'update_event_fields',
  UPDATE_EVENT_STATUS: 'update_event_status',
  UPSERT_QUOTE_LINE: 'upsert_quote_line',
  COMPLETE_TASK: 'complete_task',
  REOPEN_TASK: 'reopen_task',
  LINK_PROPOSAL: 'link_proposal',
  RECORD_FOLLOW_UP: 'record_follow_up',
  UPDATE_POST_EVENT: 'update_post_event'
});

export const EVENT_STATUSES = Object.freeze([
  'New Lead',
  'Needs Discovery',
  'Quote Needed',
  'Proposal Sent',
  'Invoice Sent',
  'Deposit Paid',
  'Booked',
  'Pre-Production',
  'Event Day',
  'Completed',
  'Post-Event Follow-Up',
  'Closed Won',
  'Closed Lost'
]);

/** Top-level event fields the contract may update (not nested collections). */
export const ALLOWED_EVENT_UPDATE_FIELDS = Object.freeze([
  'eventName',
  'company',
  'contactName',
  'contactEmail',
  'contactPhone',
  'eventType',
  'eventDate',
  'startTime',
  'endTime',
  'city',
  'state',
  'venue',
  'guestCount',
  'studentCount',
  'skillLevel',
  'leadSource',
  'probabilityToClose',
  'eventGoal',
  'eventFormat',
  'clientExpectations',
  'knownRisks',
  'nextAction',
  'nextActionDue'
]);

export const ALLOWED_QUOTE_LINE_FIELDS = Object.freeze([
  'quoteLineId',
  'category',
  'name',
  'quantity',
  'unitPrice',
  'internalCost',
  'notes'
]);

export const ALLOWED_POST_EVENT_FIELDS = Object.freeze([
  'clientFeedback',
  'whatWentWell',
  'painPoints',
  'changesForNextTime',
  'reviewRequested',
  'reviewReceived',
  'reviewUrl',
  'rebookingLikelihood',
  'thankYouSent',
  'followUpDate',
  'notes'
]);

export const ALLOWED_FOLLOW_UP_FIELDS = Object.freeze([
  'nextAction',
  'nextActionDue',
  'followUpDate',
  'notes'
]);

export const ALLOWED_PROPOSAL_FIELDS = Object.freeze([
  'proposalUrl',
  'proposalId',
  'proposalStatus'
]);

const BULK_KEYS = Object.freeze(['events', 'snapshot', 'bulk', 'allEvents', 'replaceAll']);

const ERROR = Object.freeze({
  UNAUTHORIZED: 'unauthorized',
  UNKNOWN_OPERATION: 'unknown_operation',
  UNKNOWN_FIELD: 'unknown_field',
  MISSING_ID: 'missing_stable_id',
  MISSING_IDEMPOTENCY: 'missing_idempotency_key',
  MISSING_REVISION: 'missing_expected_revision',
  STALE_REVISION: 'stale_revision',
  EVENT_NOT_FOUND: 'event_not_found',
  CROSS_EVENT: 'cross_event_mutation',
  INVALID_STATUS: 'invalid_status',
  INVALID_VALUE: 'invalid_value',
  BULK_REJECTED: 'bulk_snapshot_rejected',
  PRODUCTION_DISABLED: 'production_editing_disabled',
  ATOMIC_FAILURE: 'atomic_failure',
  DUPLICATE_EVENT_ID: 'duplicate_event_id'
});

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

function stableId(value) {
  const id = String(value ?? '').trim();
  return id || '';
}

function requireAuth(auth) {
  if (!auth || auth.authorized !== true) {
    return { ok: false, code: ERROR.UNAUTHORIZED, message: 'Mutation requires an authorized owner context.' };
  }
  const actor = String(auth.actor || '').trim();
  if (!actor) {
    return { ok: false, code: ERROR.UNAUTHORIZED, message: 'Authorized mutations require a stable actor identity.' };
  }
  return { ok: true, actor: actor.slice(0, 60) };
}

function rejectUnknownFields(payload, allowlist, label) {
  if (payload == null || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, code: ERROR.INVALID_VALUE, message: `${label} payload must be an object.` };
  }
  const unknown = Object.keys(payload).filter((key) => !allowlist.includes(key));
  if (unknown.length) {
    return {
      ok: false,
      code: ERROR.UNKNOWN_FIELD,
      message: `Unknown ${label} field(s): ${unknown.join(', ')}.`,
      unknown
    };
  }
  return { ok: true };
}

/**
 * Explicitly reject bulk snapshot replacement shapes used by the legacy full-sheet rewrite path.
 */
export function rejectBulkSnapshotReplacement(input = {}) {
  const keys = Object.keys(input || {});
  const hit = keys.filter((key) => BULK_KEYS.includes(key));
  if (hit.length) {
    return {
      ok: false,
      code: ERROR.BULK_REJECTED,
      message: `Bulk snapshot replacement is rejected (${hit.join(', ')}). Use a single granular operation.`
    };
  }
  if (Array.isArray(input)) {
    return {
      ok: false,
      code: ERROR.BULK_REJECTED,
      message: 'Bulk snapshot replacement is rejected. Use a single granular operation.'
    };
  }
  return { ok: true };
}

export function isProductionEditingDisabled() {
  return PRODUCTION_MUTATIONS_ENABLED !== true;
}

export function validateProposalUrl(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return { ok: false, url: '', reason: 'missing', raw: '' };
  if (/\s/.test(raw)) return { ok: false, url: '', reason: 'invalid', raw };
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) {
      return { ok: false, url: '', reason: 'invalid', raw };
    }
    return { ok: true, url: url.toString(), reason: 'valid', raw };
  } catch {
    return { ok: false, url: '', reason: 'invalid', raw };
  }
}

function emptyEventShell(id) {
  return {
    id,
    eventName: '',
    company: '',
    contactName: '',
    contactEmail: '',
    contactPhone: '',
    eventType: '',
    status: 'New Lead',
    eventDate: '',
    startTime: '',
    endTime: '',
    city: '',
    state: '',
    venue: '',
    guestCount: null,
    studentCount: null,
    skillLevel: '',
    leadSource: '',
    probabilityToClose: null,
    eventGoal: '',
    eventFormat: '',
    clientExpectations: '',
    knownRisks: '',
    nextAction: '',
    nextActionDue: '',
    proposalUrl: '',
    proposalId: '',
    proposalStatus: '',
    quote: [],
    tasks: [],
    followUps: [],
    postEvent: {
      clientFeedback: '',
      whatWentWell: '',
      painPoints: '',
      changesForNextTime: '',
      reviewRequested: false,
      reviewReceived: false,
      reviewUrl: '',
      rebookingLikelihood: 'Medium',
      thankYouSent: false,
      followUpDate: '',
      notes: ''
    },
    revision: 1
  };
}

function normalizeSeedEvent(raw, index) {
  const id = stableId(raw && raw.id);
  if (!id) throw new Error(`Seed event at index ${index} is missing a stable id.`);
  const base = emptyEventShell(id);
  const merged = {
    ...base,
    ...clone(raw),
    id,
    quote: Array.isArray(raw.quote) ? clone(raw.quote) : [],
    tasks: Array.isArray(raw.tasks) ? clone(raw.tasks) : [],
    followUps: Array.isArray(raw.followUps) ? clone(raw.followUps) : [],
    postEvent: { ...base.postEvent, ...(raw.postEvent && typeof raw.postEvent === 'object' ? clone(raw.postEvent) : {}) },
    revision: Number.isInteger(raw.revision) && raw.revision >= 1 ? raw.revision : 1
  };
  return merged;
}

function failure(code, message, extra = {}) {
  return freezeDeep({ ok: false, code, message, writesPerformed: false, ...extra });
}

function success(result) {
  return freezeDeep({ ok: true, writesPerformed: true, productionEditingEnabled: false, ...result });
}

function bumpRevision(event) {
  event.revision = (Number.isInteger(event.revision) ? event.revision : 0) + 1;
  return event.revision;
}

function findEvent(store, eventId) {
  return store.events.find((event) => event.id === eventId) || null;
}

function assertRevision(event, expectedRevision) {
  if (!Number.isInteger(expectedRevision)) {
    return failure(ERROR.MISSING_REVISION, 'expectedRevision is required and must be an integer.');
  }
  if (event.revision !== expectedRevision) {
    return failure(ERROR.STALE_REVISION, 'expectedRevision does not match the current event revision.', {
      eventId: event.id,
      expectedRevision,
      currentRevision: event.revision
    });
  }
  return null;
}

function appendAudit(store, entry) {
  store.audit.push(freezeDeep({
    auditId: `audit-${store.auditSeq += 1}`,
    at: entry.at,
    actor: entry.actor,
    operation: entry.operation,
    eventId: entry.eventId,
    idempotencyKey: entry.idempotencyKey,
    beforeRevision: entry.beforeRevision,
    afterRevision: entry.afterRevision,
    summary: entry.summary
  }));
}

function applyCreate(store, request, actor, at) {
  const payload = request.payload || {};
  const fieldCheck = rejectUnknownFields(payload, [...ALLOWED_EVENT_UPDATE_FIELDS, 'eventId', 'status', 'id'], 'create_event');
  if (!fieldCheck.ok) return fieldCheck;

  const eventId = stableId(payload.eventId || payload.id || request.eventId);
  if (!eventId) return failure(ERROR.MISSING_ID, 'create_event requires a stable eventId.');
  if (findEvent(store, eventId)) {
    return failure(ERROR.DUPLICATE_EVENT_ID, `Event ${eventId} already exists.`);
  }

  let status = 'New Lead';
  if (payload.status != null) {
    const next = String(payload.status).trim();
    if (!EVENT_STATUSES.includes(next)) {
      return failure(ERROR.INVALID_STATUS, `Status is not allowlisted: ${next}`);
    }
    status = next;
  }

  const event = emptyEventShell(eventId);
  for (const key of ALLOWED_EVENT_UPDATE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(payload, key)) event[key] = clone(payload[key]);
  }
  event.status = status;
  event.revision = 1;
  store.events.push(event);

  appendAudit(store, {
    at,
    actor,
    operation: OPERATIONS.CREATE_EVENT,
    eventId,
    idempotencyKey: request.idempotencyKey,
    beforeRevision: 0,
    afterRevision: 1,
    summary: 'Created event'
  });

  return success({
    operation: OPERATIONS.CREATE_EVENT,
    eventId,
    revision: event.revision,
    event: clone(event),
    audit: store.audit[store.audit.length - 1]
  });
}

function applyUpdateFields(store, request, actor, at) {
  const eventId = stableId(request.eventId);
  if (!eventId) return failure(ERROR.MISSING_ID, 'update_event_fields requires eventId.');
  const event = findEvent(store, eventId);
  if (!event) return failure(ERROR.EVENT_NOT_FOUND, `Event ${eventId} was not found.`);

  const revisionError = assertRevision(event, request.expectedRevision);
  if (revisionError) return revisionError;

  const payload = request.payload || {};
  const fieldCheck = rejectUnknownFields(payload, ALLOWED_EVENT_UPDATE_FIELDS, 'update_event_fields');
  if (!fieldCheck.ok) return fieldCheck;
  if (!Object.keys(payload).length) {
    return failure(ERROR.INVALID_VALUE, 'update_event_fields requires at least one allowlisted field.');
  }

  const beforeRevision = event.revision;
  for (const key of Object.keys(payload)) event[key] = clone(payload[key]);
  const afterRevision = bumpRevision(event);

  appendAudit(store, {
    at,
    actor,
    operation: OPERATIONS.UPDATE_EVENT_FIELDS,
    eventId,
    idempotencyKey: request.idempotencyKey,
    beforeRevision,
    afterRevision,
    summary: `Updated fields: ${Object.keys(payload).join(', ')}`
  });

  return success({
    operation: OPERATIONS.UPDATE_EVENT_FIELDS,
    eventId,
    revision: afterRevision,
    changedFields: Object.keys(payload),
    event: clone(event),
    audit: store.audit[store.audit.length - 1]
  });
}

function applyUpdateStatus(store, request, actor, at) {
  const eventId = stableId(request.eventId);
  if (!eventId) return failure(ERROR.MISSING_ID, 'update_event_status requires eventId.');
  const event = findEvent(store, eventId);
  if (!event) return failure(ERROR.EVENT_NOT_FOUND, `Event ${eventId} was not found.`);

  const revisionError = assertRevision(event, request.expectedRevision);
  if (revisionError) return revisionError;

  const payload = request.payload || {};
  const fieldCheck = rejectUnknownFields(payload, ['status'], 'update_event_status');
  if (!fieldCheck.ok) return fieldCheck;
  const status = String(payload.status ?? '').trim();
  if (!EVENT_STATUSES.includes(status)) {
    return failure(ERROR.INVALID_STATUS, `Status is not allowlisted: ${status}`);
  }

  const beforeRevision = event.revision;
  event.status = status;
  const afterRevision = bumpRevision(event);

  appendAudit(store, {
    at,
    actor,
    operation: OPERATIONS.UPDATE_EVENT_STATUS,
    eventId,
    idempotencyKey: request.idempotencyKey,
    beforeRevision,
    afterRevision,
    summary: `Status set to ${status}`
  });

  return success({
    operation: OPERATIONS.UPDATE_EVENT_STATUS,
    eventId,
    revision: afterRevision,
    status,
    event: clone(event),
    audit: store.audit[store.audit.length - 1]
  });
}

function applyUpsertQuoteLine(store, request, actor, at) {
  const eventId = stableId(request.eventId);
  if (!eventId) return failure(ERROR.MISSING_ID, 'upsert_quote_line requires eventId.');
  const event = findEvent(store, eventId);
  if (!event) return failure(ERROR.EVENT_NOT_FOUND, `Event ${eventId} was not found.`);

  const revisionError = assertRevision(event, request.expectedRevision);
  if (revisionError) return revisionError;

  const payload = request.payload || {};
  const fieldCheck = rejectUnknownFields(payload, ALLOWED_QUOTE_LINE_FIELDS, 'upsert_quote_line');
  if (!fieldCheck.ok) return fieldCheck;

  if (Object.prototype.hasOwnProperty.call(payload, 'eventId') && stableId(payload.eventId) !== eventId) {
    return failure(ERROR.CROSS_EVENT, 'Quote line eventId does not match the request eventId.');
  }

  const quoteLineId = stableId(payload.quoteLineId);
  if (!quoteLineId) return failure(ERROR.MISSING_ID, 'upsert_quote_line requires quoteLineId.');

  // Guard: a quote line owned by another seeded event must not move.
  for (const other of store.events) {
    if (other.id === eventId) continue;
    if ((other.quote || []).some((line) => stableId(line.id) === quoteLineId)) {
      return failure(ERROR.CROSS_EVENT, `Quote line ${quoteLineId} belongs to event ${other.id}, not ${eventId}.`);
    }
  }

  const beforeRevision = event.revision;
  const existing = (event.quote || []).find((line) => stableId(line.id) === quoteLineId);
  if (existing) {
    for (const key of ALLOWED_QUOTE_LINE_FIELDS) {
      if (key === 'quoteLineId') continue;
      if (Object.prototype.hasOwnProperty.call(payload, key)) existing[key] = clone(payload[key]);
    }
  } else {
    event.quote.push({
      id: quoteLineId,
      category: payload.category || '',
      name: payload.name || '',
      quantity: payload.quantity ?? null,
      unitPrice: payload.unitPrice ?? null,
      internalCost: Object.prototype.hasOwnProperty.call(payload, 'internalCost') ? payload.internalCost : null,
      notes: payload.notes || ''
    });
  }
  const afterRevision = bumpRevision(event);

  appendAudit(store, {
    at,
    actor,
    operation: OPERATIONS.UPSERT_QUOTE_LINE,
    eventId,
    idempotencyKey: request.idempotencyKey,
    beforeRevision,
    afterRevision,
    summary: `Upserted quote line ${quoteLineId}`
  });

  return success({
    operation: OPERATIONS.UPSERT_QUOTE_LINE,
    eventId,
    revision: afterRevision,
    quoteLineId,
    event: clone(event),
    audit: store.audit[store.audit.length - 1]
  });
}

function applyTaskStatus(store, request, actor, at, nextStatus, operation) {
  const eventId = stableId(request.eventId);
  if (!eventId) return failure(ERROR.MISSING_ID, `${operation} requires eventId.`);
  const event = findEvent(store, eventId);
  if (!event) return failure(ERROR.EVENT_NOT_FOUND, `Event ${eventId} was not found.`);

  const revisionError = assertRevision(event, request.expectedRevision);
  if (revisionError) return revisionError;

  const payload = request.payload || {};
  const fieldCheck = rejectUnknownFields(payload, ['taskId'], operation);
  if (!fieldCheck.ok) return fieldCheck;

  const taskId = stableId(payload.taskId);
  if (!taskId) return failure(ERROR.MISSING_ID, `${operation} requires taskId.`);

  for (const other of store.events) {
    if (other.id === eventId) continue;
    if ((other.tasks || []).some((task) => stableId(task.id) === taskId)) {
      return failure(ERROR.CROSS_EVENT, `Task ${taskId} belongs to event ${other.id}, not ${eventId}.`);
    }
  }

  const task = (event.tasks || []).find((row) => stableId(row.id) === taskId);
  if (!task) return failure(ERROR.EVENT_NOT_FOUND, `Task ${taskId} was not found on event ${eventId}.`);

  const beforeRevision = event.revision;
  task.status = nextStatus;
  if (nextStatus === 'Completed') task.completedAt = at;
  else delete task.completedAt;
  const afterRevision = bumpRevision(event);

  appendAudit(store, {
    at,
    actor,
    operation,
    eventId,
    idempotencyKey: request.idempotencyKey,
    beforeRevision,
    afterRevision,
    summary: `Task ${taskId} set to ${nextStatus}`
  });

  return success({
    operation,
    eventId,
    revision: afterRevision,
    taskId,
    taskStatus: nextStatus,
    event: clone(event),
    audit: store.audit[store.audit.length - 1]
  });
}

function applyLinkProposal(store, request, actor, at) {
  const eventId = stableId(request.eventId);
  if (!eventId) return failure(ERROR.MISSING_ID, 'link_proposal requires eventId.');
  const event = findEvent(store, eventId);
  if (!event) return failure(ERROR.EVENT_NOT_FOUND, `Event ${eventId} was not found.`);

  const revisionError = assertRevision(event, request.expectedRevision);
  if (revisionError) return revisionError;

  const payload = request.payload || {};
  const fieldCheck = rejectUnknownFields(payload, ALLOWED_PROPOSAL_FIELDS, 'link_proposal');
  if (!fieldCheck.ok) return fieldCheck;

  if (Object.prototype.hasOwnProperty.call(payload, 'proposalUrl')) {
    const validated = validateProposalUrl(payload.proposalUrl);
    if (!validated.ok) {
      return failure(ERROR.INVALID_VALUE, `proposalUrl is ${validated.reason}. Only https URLs without credentials are accepted.`);
    }
    payload.proposalUrl = validated.url;
  }

  const beforeRevision = event.revision;
  for (const key of ALLOWED_PROPOSAL_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(payload, key)) event[key] = clone(payload[key]);
  }
  const afterRevision = bumpRevision(event);

  appendAudit(store, {
    at,
    actor,
    operation: OPERATIONS.LINK_PROPOSAL,
    eventId,
    idempotencyKey: request.idempotencyKey,
    beforeRevision,
    afterRevision,
    summary: 'Linked proposal metadata'
  });

  return success({
    operation: OPERATIONS.LINK_PROPOSAL,
    eventId,
    revision: afterRevision,
    event: clone(event),
    audit: store.audit[store.audit.length - 1]
  });
}

function applyRecordFollowUp(store, request, actor, at) {
  const eventId = stableId(request.eventId);
  if (!eventId) return failure(ERROR.MISSING_ID, 'record_follow_up requires eventId.');
  const event = findEvent(store, eventId);
  if (!event) return failure(ERROR.EVENT_NOT_FOUND, `Event ${eventId} was not found.`);

  const revisionError = assertRevision(event, request.expectedRevision);
  if (revisionError) return revisionError;

  const payload = request.payload || {};
  const fieldCheck = rejectUnknownFields(payload, [...ALLOWED_FOLLOW_UP_FIELDS, 'followUpId'], 'record_follow_up');
  if (!fieldCheck.ok) return fieldCheck;

  const followUpId = stableId(payload.followUpId) || `followup-${store.followUpSeq += 1}`;
  const beforeRevision = event.revision;

  if (Object.prototype.hasOwnProperty.call(payload, 'nextAction')) event.nextAction = payload.nextAction;
  if (Object.prototype.hasOwnProperty.call(payload, 'nextActionDue')) event.nextActionDue = payload.nextActionDue;
  if (Object.prototype.hasOwnProperty.call(payload, 'followUpDate')) {
    event.postEvent = event.postEvent || {};
    event.postEvent.followUpDate = payload.followUpDate;
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'notes')) {
    event.postEvent = event.postEvent || {};
    event.postEvent.notes = payload.notes;
  }

  const existing = (event.followUps || []).find((row) => stableId(row.id) === followUpId);
  const entry = {
    id: followUpId,
    nextAction: payload.nextAction ?? (existing && existing.nextAction) ?? event.nextAction ?? '',
    nextActionDue: payload.nextActionDue ?? (existing && existing.nextActionDue) ?? event.nextActionDue ?? '',
    followUpDate: payload.followUpDate ?? (existing && existing.followUpDate) ?? '',
    notes: payload.notes ?? (existing && existing.notes) ?? '',
    recordedAt: at,
    recordedBy: actor
  };
  if (existing) Object.assign(existing, entry);
  else {
    if (!Array.isArray(event.followUps)) event.followUps = [];
    event.followUps.push(entry);
  }

  const afterRevision = bumpRevision(event);
  appendAudit(store, {
    at,
    actor,
    operation: OPERATIONS.RECORD_FOLLOW_UP,
    eventId,
    idempotencyKey: request.idempotencyKey,
    beforeRevision,
    afterRevision,
    summary: `Recorded follow-up ${followUpId}`
  });

  return success({
    operation: OPERATIONS.RECORD_FOLLOW_UP,
    eventId,
    revision: afterRevision,
    followUpId,
    event: clone(event),
    audit: store.audit[store.audit.length - 1]
  });
}

function applyUpdatePostEvent(store, request, actor, at) {
  const eventId = stableId(request.eventId);
  if (!eventId) return failure(ERROR.MISSING_ID, 'update_post_event requires eventId.');
  const event = findEvent(store, eventId);
  if (!event) return failure(ERROR.EVENT_NOT_FOUND, `Event ${eventId} was not found.`);

  const revisionError = assertRevision(event, request.expectedRevision);
  if (revisionError) return revisionError;

  const payload = request.payload || {};
  const fieldCheck = rejectUnknownFields(payload, ALLOWED_POST_EVENT_FIELDS, 'update_post_event');
  if (!fieldCheck.ok) return fieldCheck;
  if (!Object.keys(payload).length) {
    return failure(ERROR.INVALID_VALUE, 'update_post_event requires at least one allowlisted field.');
  }

  const beforeRevision = event.revision;
  event.postEvent = event.postEvent || {};
  for (const key of Object.keys(payload)) event.postEvent[key] = clone(payload[key]);
  const afterRevision = bumpRevision(event);

  appendAudit(store, {
    at,
    actor,
    operation: OPERATIONS.UPDATE_POST_EVENT,
    eventId,
    idempotencyKey: request.idempotencyKey,
    beforeRevision,
    afterRevision,
    summary: `Updated post-event fields: ${Object.keys(payload).join(', ')}`
  });

  return success({
    operation: OPERATIONS.UPDATE_POST_EVENT,
    eventId,
    revision: afterRevision,
    changedFields: Object.keys(payload),
    event: clone(event),
    audit: store.audit[store.audit.length - 1]
  });
}

function dispatch(store, request, actor, at) {
  switch (request.operation) {
    case OPERATIONS.CREATE_EVENT:
      return applyCreate(store, request, actor, at);
    case OPERATIONS.UPDATE_EVENT_FIELDS:
      return applyUpdateFields(store, request, actor, at);
    case OPERATIONS.UPDATE_EVENT_STATUS:
      return applyUpdateStatus(store, request, actor, at);
    case OPERATIONS.UPSERT_QUOTE_LINE:
      return applyUpsertQuoteLine(store, request, actor, at);
    case OPERATIONS.COMPLETE_TASK:
      return applyTaskStatus(store, request, actor, at, 'Completed', OPERATIONS.COMPLETE_TASK);
    case OPERATIONS.REOPEN_TASK:
      return applyTaskStatus(store, request, actor, at, 'Open', OPERATIONS.REOPEN_TASK);
    case OPERATIONS.LINK_PROPOSAL:
      return applyLinkProposal(store, request, actor, at);
    case OPERATIONS.RECORD_FOLLOW_UP:
      return applyRecordFollowUp(store, request, actor, at);
    case OPERATIONS.UPDATE_POST_EVENT:
      return applyUpdatePostEvent(store, request, actor, at);
    default:
      return failure(ERROR.UNKNOWN_OPERATION, `Unknown operation: ${String(request.operation)}`);
  }
}

/**
 * Create an isolated synthetic mutation store.
 * Optional forceFailureOnNext causes the next apply to roll back atomically.
 */
export function createSyntheticMutationStore(seedEvents = [], options = {}) {
  const events = (Array.isArray(seedEvents) ? seedEvents : []).map(normalizeSeedEvent);
  const store = {
    events,
    audit: [],
    auditSeq: 0,
    followUpSeq: 0,
    idempotency: new Map(),
    forceFailureOnNext: options.forceFailureOnNext === true,
    clock: options.clock || null
  };

  return {
    /** Read-only snapshot for assertions. */
    snapshot() {
      return freezeDeep({
        events: clone(store.events),
        audit: clone(store.audit),
        productionEditingEnabled: false,
        bulkSnapshotReplacementSupported: false
      });
    },
    getEvent(eventId) {
      const event = findEvent(store, eventId);
      return event ? freezeDeep(clone(event)) : null;
    },
    listAudit() {
      return freezeDeep(clone(store.audit));
    },
    armAtomicFailure() {
      store.forceFailureOnNext = true;
    },
    apply(request) {
      return applyEventMutation(store, request);
    }
  };
}

/**
 * Validate + apply one granular mutation against a synthetic store object.
 * Exported for direct unit use; prefer createSyntheticMutationStore().apply().
 */
export function applyEventMutation(store, request = {}) {
  if (isProductionEditingDisabled() && request && request.forceProductionWrite === true) {
    return failure(ERROR.PRODUCTION_DISABLED, 'Production editing remains disabled. Isolated synthetic adapters only.');
  }

  const bulk = rejectBulkSnapshotReplacement(request);
  if (!bulk.ok) return failure(bulk.code, bulk.message);

  if (request.payload) {
    const payloadBulk = rejectBulkSnapshotReplacement(request.payload);
    if (!payloadBulk.ok) return failure(payloadBulk.code, payloadBulk.message);
  }

  const auth = requireAuth(request.auth);
  if (!auth.ok) return failure(auth.code, auth.message);

  const idempotencyKey = String(request.idempotencyKey || '').trim();
  if (!idempotencyKey) {
    return failure(ERROR.MISSING_IDEMPOTENCY, 'idempotencyKey is required.');
  }

  if (store.idempotency.has(idempotencyKey)) {
    const prior = store.idempotency.get(idempotencyKey);
    return freezeDeep({
      ...clone(prior),
      idempotentReplay: true,
      writesPerformed: false
    });
  }

  if (!Object.values(OPERATIONS).includes(request.operation)) {
    return failure(ERROR.UNKNOWN_OPERATION, `Unknown operation: ${String(request.operation)}`);
  }

  const at = nowIso(store.clock);
  const before = {
    events: clone(store.events),
    audit: clone(store.audit),
    auditSeq: store.auditSeq,
    followUpSeq: store.followUpSeq
  };

  let result;
  try {
    result = dispatch(store, request, auth.actor, at);
    if (result.ok && store.forceFailureOnNext) {
      store.forceFailureOnNext = false;
      throw new Error('Synthetic atomic failure');
    }
  } catch (error) {
    store.events = before.events;
    store.audit = before.audit;
    store.auditSeq = before.auditSeq;
    store.followUpSeq = before.followUpSeq;
    return failure(ERROR.ATOMIC_FAILURE, 'Mutation failed atomically; no partial synthetic changes were kept.', {
      detail: String(error && error.message ? error.message : error)
    });
  }

  if (!result.ok) {
    store.events = before.events;
    store.audit = before.audit;
    store.auditSeq = before.auditSeq;
    store.followUpSeq = before.followUpSeq;
    return result;
  }

  store.idempotency.set(idempotencyKey, clone(result));
  return result;
}

export const MUTATION_ERROR_CODES = ERROR;
