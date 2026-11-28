import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import {
  OPERATIONS,
  PRODUCTION_MUTATIONS_ENABLED,
  createSyntheticMutationStore,
  rejectBulkSnapshotReplacement,
  isProductionEditingDisabled,
  applyEventMutation,
  MUTATION_ERROR_CODES
} from '../lib/event-mutation-contract.mjs';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const libSource = readFileSync(join(root, 'lib/event-mutation-contract.mjs'), 'utf8');
const coreSource = readFileSync(join(root, 'public/v2/js/core.js'), 'utf8');
const eventsRoute = readFileSync(join(root, 'app/api/sync/events/route.ts'), 'utf8');
const eventOverrideRoute = readFileSync(join(root, 'app/api/sync/event-override/route.ts'), 'utf8');
const businessExpenseRoute = readFileSync(join(root, 'app/api/sync/business-expense/route.ts'), 'utf8');
const matrix = readFileSync(join(root, 'docs/command-center-completion-matrix.md'), 'utf8');
const contractDoc = readFileSync(join(root, 'docs/event-mutation-contract.md'), 'utf8');
const eventsPostSource = eventsRoute.slice(eventsRoute.indexOf('export async function POST'));

function auth(actor = 'Synthetic Owner') {
  return { authorized: true, actor };
}

function seedStore() {
  return createSyntheticMutationStore([
    {
      id: 'evt-a',
      eventName: 'Event A',
      company: 'Alpha Co',
      status: 'Quote Needed',
      nextAction: 'Send quote',
      nextActionDue: '2026-12-01',
      revision: 3,
      quote: [{ id: 'ql-a1', category: 'Training', name: 'Half day', quantity: 1, unitPrice: 2500, internalCost: 900 }],
      tasks: [{ id: 'task-a1', title: 'Send quote', owner: 'Matt', dueDate: '2026-12-01', status: 'Open' }],
      postEvent: { notes: 'Keep A notes', rebookingLikelihood: 'Medium' }
    },
    {
      id: 'evt-b',
      eventName: 'Event B',
      company: 'Beta Co',
      status: 'Booked',
      revision: 5,
      quote: [{ id: 'ql-b1', category: 'Tables', name: 'Felt package', quantity: 2, unitPrice: 400, internalCost: 150 }],
      tasks: [{ id: 'task-b1', title: 'Confirm dealers', owner: 'Matt', dueDate: '2026-11-28', status: 'Open' }],
      postEvent: { notes: 'Keep B notes', thankYouSent: false }
    }
  ], { clock: () => '2026-11-25T18:00:00.000Z' });
}

// --- Stage 3: granular owner overrides in code; bulk writes permanently disabled ---
assert.equal(PRODUCTION_MUTATIONS_ENABLED, false);
assert.equal(isProductionEditingDisabled(), true);
assert.match(coreSource, /function saveEvents\(message\)\{\s*if\(message\) toast\('This preview is read only/);
assert.match(matrix, /Event writes\s*\|\s*GRANULAR OWNER OVERRIDES \(code\)\s*\/\s*BULK DISABLED/);
assert.match(matrix, /BULK DISABLED/);
assert.match(matrix, /bulk_event_mutation_disabled/);
assert.match(matrix, /\/api\/sync\/event-override/);
assert.match(matrix, /\/api\/sync\/business-expense/);
assert.match(matrix, /denyPrivateRead/);
assert.match(eventsRoute, /writesPerformed:\s*false/);
assert.match(eventsPostSource, /authorizeAppRequest/);
assert.match(eventsPostSource, /bulk_event_mutation_disabled/);
assert.match(eventsPostSource, /status:\s*403/);
assert.ok(eventsPostSource.indexOf('authorizeAppRequest') < eventsPostSource.indexOf('bulk_event_mutation_disabled'));
assert.doesNotMatch(eventsPostSource, /appsScriptRequest\s*\(/);
assert.doesNotMatch(eventsPostSource, /saveAllEvents/);
assert.doesNotMatch(eventsPostSource, /event-mutation-contract/);
assert.doesNotMatch(libSource, /clasp push|appsScriptRequest\s*\(/);
assert.doesNotMatch(libSource, /from ['"].*apps-script/);
assert.match(libSource, /PRODUCTION_MUTATIONS_ENABLED = false/);
assert.match(contractDoc, /bulk_event_mutation_disabled/);
assert.match(contractDoc, /bulk snapshot/i);
assert.match(contractDoc, /BULK DISABLED|bulk writes remain permanently disabled/i);
// POST /api/sync/event-override and /api/sync/business-expense: owner session via denyPrivateRead (401 unauthenticated)
assert.match(eventOverrideRoute, /denyPrivateRead/);
assert.match(businessExpenseRoute, /denyPrivateRead/);
assert.ok(eventOverrideRoute.indexOf('denyPrivateRead') < eventOverrideRoute.indexOf('appsScriptRequest'));
assert.ok(businessExpenseRoute.indexOf('denyPrivateRead') < businessExpenseRoute.indexOf('appsScriptRequest'));
assert.doesNotMatch(eventOverrideRoute, /export async function DELETE/);
assert.doesNotMatch(businessExpenseRoute, /export async function DELETE/);

const bulk = rejectBulkSnapshotReplacement({ events: [{ id: 'x' }] });
assert.equal(bulk.ok, false);
assert.equal(bulk.code, MUTATION_ERROR_CODES.BULK_REJECTED);

const store = seedStore();
const bulkApply = store.apply({
  operation: OPERATIONS.UPDATE_EVENT_FIELDS,
  eventId: 'evt-a',
  expectedRevision: 3,
  idempotencyKey: 'bulk-1',
  auth: auth(),
  events: [{ id: 'evt-a' }, { id: 'evt-b' }],
  payload: { eventName: 'Nope' }
});
assert.equal(bulkApply.ok, false);
assert.equal(bulkApply.code, MUTATION_ERROR_CODES.BULK_REJECTED);
assert.equal(store.getEvent('evt-a').eventName, 'Event A');

const forcedProd = applyEventMutation(store, {
  operation: OPERATIONS.UPDATE_EVENT_FIELDS,
  eventId: 'evt-a',
  expectedRevision: 3,
  idempotencyKey: 'prod-1',
  forceProductionWrite: true,
  auth: auth(),
  payload: { eventName: 'Should fail' }
});
assert.equal(forcedProd.ok, false);
assert.equal(forcedProd.code, MUTATION_ERROR_CODES.PRODUCTION_DISABLED);

// --- Unauthorized ---
const unauth = store.apply({
  operation: OPERATIONS.UPDATE_EVENT_STATUS,
  eventId: 'evt-a',
  expectedRevision: 3,
  idempotencyKey: 'unauth-1',
  auth: { authorized: false, actor: 'Intruder' },
  payload: { status: 'Booked' }
});
assert.equal(unauth.ok, false);
assert.equal(unauth.code, MUTATION_ERROR_CODES.UNAUTHORIZED);
assert.equal(store.getEvent('evt-a').status, 'Quote Needed');

const missingActor = store.apply({
  operation: OPERATIONS.UPDATE_EVENT_STATUS,
  eventId: 'evt-a',
  expectedRevision: 3,
  idempotencyKey: 'unauth-2',
  auth: { authorized: true, actor: '  ' },
  payload: { status: 'Booked' }
});
assert.equal(missingActor.ok, false);
assert.equal(missingActor.code, MUTATION_ERROR_CODES.UNAUTHORIZED);

// --- Unknown fields ---
const unknown = store.apply({
  operation: OPERATIONS.UPDATE_EVENT_FIELDS,
  eventId: 'evt-a',
  expectedRevision: 3,
  idempotencyKey: 'unknown-1',
  auth: auth(),
  payload: { eventName: 'Renamed', secretField: 'nope' }
});
assert.equal(unknown.ok, false);
assert.equal(unknown.code, MUTATION_ERROR_CODES.UNKNOWN_FIELD);
assert.equal(store.getEvent('evt-a').eventName, 'Event A');
assert.equal(Object.prototype.hasOwnProperty.call(store.getEvent('evt-a'), 'secretField'), false);

// --- Stale revision ---
const stale = store.apply({
  operation: OPERATIONS.UPDATE_EVENT_STATUS,
  eventId: 'evt-a',
  expectedRevision: 1,
  idempotencyKey: 'stale-1',
  auth: auth(),
  payload: { status: 'Booked' }
});
assert.equal(stale.ok, false);
assert.equal(stale.code, MUTATION_ERROR_CODES.STALE_REVISION);
assert.equal(store.getEvent('evt-a').status, 'Quote Needed');
assert.equal(store.getEvent('evt-a').revision, 3);

// --- Cross-event: updating A must not change B; foreign task/quote rejected ---
const updateA = store.apply({
  operation: OPERATIONS.UPDATE_EVENT_FIELDS,
  eventId: 'evt-a',
  expectedRevision: 3,
  idempotencyKey: 'update-a-1',
  auth: auth(),
  payload: { eventName: 'Event A Updated', city: 'Las Vegas' }
});
assert.equal(updateA.ok, true);
assert.equal(updateA.revision, 4);
assert.equal(store.getEvent('evt-a').eventName, 'Event A Updated');
assert.equal(store.getEvent('evt-a').city, 'Las Vegas');
assert.equal(store.getEvent('evt-b').eventName, 'Event B');
assert.equal(store.getEvent('evt-b').revision, 5);
assert.equal(store.getEvent('evt-b').postEvent.notes, 'Keep B notes');

const crossTask = store.apply({
  operation: OPERATIONS.COMPLETE_TASK,
  eventId: 'evt-a',
  expectedRevision: 4,
  idempotencyKey: 'cross-task-1',
  auth: auth(),
  payload: { taskId: 'task-b1' }
});
assert.equal(crossTask.ok, false);
assert.equal(crossTask.code, MUTATION_ERROR_CODES.CROSS_EVENT);
assert.equal(store.getEvent('evt-b').tasks[0].status, 'Open');
assert.equal(store.getEvent('evt-a').revision, 4);

const crossQuote = store.apply({
  operation: OPERATIONS.UPSERT_QUOTE_LINE,
  eventId: 'evt-a',
  expectedRevision: 4,
  idempotencyKey: 'cross-quote-1',
  auth: auth(),
  payload: { quoteLineId: 'ql-b1', name: 'Stolen line' }
});
assert.equal(crossQuote.ok, false);
assert.equal(crossQuote.code, MUTATION_ERROR_CODES.CROSS_EVENT);
assert.equal(store.getEvent('evt-b').quote[0].name, 'Felt package');

// --- Happy-path granular ops ---
const statusOk = store.apply({
  operation: OPERATIONS.UPDATE_EVENT_STATUS,
  eventId: 'evt-a',
  expectedRevision: 4,
  idempotencyKey: 'status-a-1',
  auth: auth(),
  payload: { status: 'Proposal Sent' }
});
assert.equal(statusOk.ok, true);
assert.equal(store.getEvent('evt-a').status, 'Proposal Sent');

const quoteOk = store.apply({
  operation: OPERATIONS.UPSERT_QUOTE_LINE,
  eventId: 'evt-a',
  expectedRevision: 5,
  idempotencyKey: 'quote-a-1',
  auth: auth(),
  payload: { quoteLineId: 'ql-a1', unitPrice: 2750, internalCost: 950 }
});
assert.equal(quoteOk.ok, true);
assert.equal(store.getEvent('evt-a').quote[0].unitPrice, 2750);
assert.equal(store.getEvent('evt-a').quote.length, 1);

const quoteAdd = store.apply({
  operation: OPERATIONS.UPSERT_QUOTE_LINE,
  eventId: 'evt-a',
  expectedRevision: 6,
  idempotencyKey: 'quote-a-2',
  auth: auth(),
  payload: { quoteLineId: 'ql-a2', category: 'Add-on', name: 'Branding', quantity: 1, unitPrice: 300 }
});
assert.equal(quoteAdd.ok, true);
assert.equal(store.getEvent('evt-a').quote.length, 2);

const complete = store.apply({
  operation: OPERATIONS.COMPLETE_TASK,
  eventId: 'evt-a',
  expectedRevision: 7,
  idempotencyKey: 'task-complete-1',
  auth: auth(),
  payload: { taskId: 'task-a1' }
});
assert.equal(complete.ok, true);
assert.equal(store.getEvent('evt-a').tasks[0].status, 'Completed');

const reopen = store.apply({
  operation: OPERATIONS.REOPEN_TASK,
  eventId: 'evt-a',
  expectedRevision: 8,
  idempotencyKey: 'task-reopen-1',
  auth: auth(),
  payload: { taskId: 'task-a1' }
});
assert.equal(reopen.ok, true);
assert.equal(store.getEvent('evt-a').tasks[0].status, 'Open');

const proposal = store.apply({
  operation: OPERATIONS.LINK_PROPOSAL,
  eventId: 'evt-a',
  expectedRevision: 9,
  idempotencyKey: 'proposal-1',
  auth: auth(),
  payload: { proposalUrl: 'https://example.test/proposals/a', proposalId: 'prop-a', proposalStatus: 'Sent' }
});
assert.equal(proposal.ok, true);
assert.equal(store.getEvent('evt-a').proposalUrl, 'https://example.test/proposals/a');

const badProposal = store.apply({
  operation: OPERATIONS.LINK_PROPOSAL,
  eventId: 'evt-a',
  expectedRevision: 10,
  idempotencyKey: 'proposal-bad',
  auth: auth(),
  payload: { proposalUrl: 'http://insecure.example/proposal' }
});
assert.equal(badProposal.ok, false);
assert.equal(badProposal.code, MUTATION_ERROR_CODES.INVALID_VALUE);
assert.equal(store.getEvent('evt-a').proposalUrl, 'https://example.test/proposals/a');

const followUp = store.apply({
  operation: OPERATIONS.RECORD_FOLLOW_UP,
  eventId: 'evt-a',
  expectedRevision: 10,
  idempotencyKey: 'follow-1',
  auth: auth(),
  payload: { followUpId: 'fu-1', nextAction: 'Call planner', nextActionDue: '2026-12-02', followUpDate: '2026-12-02', notes: 'Synthetic follow-up' }
});
assert.equal(followUp.ok, true);
assert.equal(store.getEvent('evt-a').nextAction, 'Call planner');
assert.equal(store.getEvent('evt-a').followUps.length, 1);
assert.equal(store.getEvent('evt-a').postEvent.followUpDate, '2026-12-02');

const postEvent = store.apply({
  operation: OPERATIONS.UPDATE_POST_EVENT,
  eventId: 'evt-a',
  expectedRevision: 11,
  idempotencyKey: 'post-1',
  auth: auth(),
  payload: { thankYouSent: true, rebookingLikelihood: 'High' }
});
assert.equal(postEvent.ok, true);
assert.equal(store.getEvent('evt-a').postEvent.thankYouSent, true);
assert.equal(store.getEvent('evt-a').postEvent.rebookingLikelihood, 'High');
assert.equal(store.getEvent('evt-a').postEvent.notes, 'Synthetic follow-up');
assert.equal(store.getEvent('evt-b').postEvent.notes, 'Keep B notes');
assert.equal(store.getEvent('evt-b').eventName, 'Event B');

// --- Create event ---
const created = store.apply({
  operation: OPERATIONS.CREATE_EVENT,
  idempotencyKey: 'create-1',
  auth: auth(),
  payload: {
    eventId: 'evt-c',
    eventName: 'Event C',
    company: 'Gamma Co',
    status: 'New Lead',
    city: 'Las Vegas'
  }
});
assert.equal(created.ok, true);
assert.equal(store.getEvent('evt-c').revision, 1);
assert.equal(store.getEvent('evt-c').eventName, 'Event C');
assert.equal(store.snapshot().events.length, 3);

// --- Idempotency: replay does not duplicate ---
const replay = store.apply({
  operation: OPERATIONS.CREATE_EVENT,
  idempotencyKey: 'create-1',
  auth: auth(),
  payload: {
    eventId: 'evt-c',
    eventName: 'Event C Duplicate',
    company: 'Gamma Co'
  }
});
assert.equal(replay.ok, true);
assert.equal(replay.idempotentReplay, true);
assert.equal(replay.writesPerformed, false);
assert.equal(store.snapshot().events.filter((e) => e.id === 'evt-c').length, 1);
assert.equal(store.getEvent('evt-c').eventName, 'Event C');

const quoteReplay = store.apply({
  operation: OPERATIONS.UPSERT_QUOTE_LINE,
  eventId: 'evt-a',
  expectedRevision: 6,
  idempotencyKey: 'quote-a-2',
  auth: auth(),
  payload: { quoteLineId: 'ql-a2', category: 'Add-on', name: 'Branding Dup', quantity: 1, unitPrice: 999 }
});
assert.equal(quoteReplay.idempotentReplay, true);
assert.equal(store.getEvent('evt-a').quote.filter((q) => q.id === 'ql-a2').length, 1);
assert.equal(store.getEvent('evt-a').quote.find((q) => q.id === 'ql-a2').name, 'Branding');

// --- Atomic failure leaves no partial changes ---
const beforeAtomic = store.snapshot();
store.armAtomicFailure();
const atomic = store.apply({
  operation: OPERATIONS.UPDATE_EVENT_FIELDS,
  eventId: 'evt-b',
  expectedRevision: 5,
  idempotencyKey: 'atomic-1',
  auth: auth(),
  payload: { eventName: 'Event B Partial', venue: 'Should Roll Back' }
});
assert.equal(atomic.ok, false);
assert.equal(atomic.code, MUTATION_ERROR_CODES.ATOMIC_FAILURE);
assert.equal(store.getEvent('evt-b').eventName, 'Event B');
assert.equal(store.getEvent('evt-b').venue, beforeAtomic.events.find((e) => e.id === 'evt-b').venue);
assert.equal(store.getEvent('evt-b').revision, 5);
assert.equal(store.getEvent('evt-a').eventName, beforeAtomic.events.find((e) => e.id === 'evt-a').eventName);
assert.deepEqual(
  store.listAudit().map((row) => row.auditId),
  beforeAtomic.audit.map((row) => row.auditId)
);

// --- Audit present for successful ops ---
const audits = store.listAudit();
assert.ok(audits.length >= 8);
assert.ok(audits.every((row) => row.actor === 'Synthetic Owner'));
assert.ok(audits.every((row) => row.idempotencyKey && row.eventId && row.operation));
assert.ok(audits.some((row) => row.operation === OPERATIONS.CREATE_EVENT));
assert.ok(audits.some((row) => row.operation === OPERATIONS.COMPLETE_TASK));

// --- Invalid status rejected without write ---
const badStatus = store.apply({
  operation: OPERATIONS.UPDATE_EVENT_STATUS,
  eventId: 'evt-b',
  expectedRevision: 5,
  idempotencyKey: 'bad-status',
  auth: auth(),
  payload: { status: 'Totally Invented' }
});
assert.equal(badStatus.ok, false);
assert.equal(badStatus.code, MUTATION_ERROR_CODES.INVALID_STATUS);
assert.equal(store.getEvent('evt-b').status, 'Booked');

/**
 * Behavioral coverage for POST /api/sync/events:
 * even with a valid sync-key auth result, bulk snapshot bodies must not reach Apps Script.
 */
function loadEventsRouteHarness() {
  const js = ts.transpileModule(eventsRoute, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const seen = { appsScriptCalls: [], authorizeCalls: 0 };
  const mod = { exports: {} };
  const source = {
    '../_lib': {
      appsScriptRequest: async (action, payload) => {
        seen.appsScriptCalls.push({ action, payload });
        throw new Error(`Provider mutation must not run (${action}).`);
      },
      authorizeAppRequest: (request) => {
        seen.authorizeCalls += 1;
        return request.headers.get('x-lvpt-sync-key') === 'synthetic-valid-sync-key';
      },
      unauthorizedResponse: () => Response.json({ message: 'Invalid LVPT app sync key.' }, { status: 401 }),
      serverError: (error) => Response.json({
        message: error instanceof Error ? error.message : 'Unexpected server error.'
      }, { status: 500 })
    },
    '../_owner-read': {
      denyPrivateRead: () => null
    },
    '../../sms/staging/_lib': {
      jsonNoStore: (value, status = 200) => Response.json(value, {
        status,
        headers: { 'Cache-Control': 'no-store' }
      })
    }
  };
  vm.runInNewContext(js, {
    module: mod,
    exports: mod.exports,
    require: (id) => {
      if (Object.prototype.hasOwnProperty.call(source, id)) return source[id];
      throw new Error(`Unexpected import ${id}`);
    },
    Response,
    Request,
    URL,
    console
  }, { filename: 'events-route.mock.cjs', timeout: 1000 });
  return { seen, POST: mod.exports.POST };
}

async function postBulkEvents(post, { authorized, body }) {
  const headers = { 'content-type': 'application/json' };
  if (authorized) headers['x-lvpt-sync-key'] = 'synthetic-valid-sync-key';
  else headers['x-lvpt-sync-key'] = 'wrong-key';
  const response = await post(new Request('https://synthetic.invalid/api/sync/events', {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  }));
  return { status: response.status, json: await response.json() };
}

const routeHarness = loadEventsRouteHarness();
const unauthorizedBulk = await postBulkEvents(routeHarness.POST, {
  authorized: false,
  body: {
    events: [{ id: 'evt-a', eventName: 'Should never write' }],
    actor: 'Synthetic Owner',
    reason: 'bulk snapshot attempt'
  }
});
assert.equal(unauthorizedBulk.status, 401);
assert.equal(routeHarness.seen.appsScriptCalls.length, 0);
assert.equal(routeHarness.seen.authorizeCalls, 1);

const authenticatedBulk = await postBulkEvents(routeHarness.POST, {
  authorized: true,
  body: {
    events: [
      { id: 'evt-a', eventName: 'Bulk A' },
      { id: 'evt-b', eventName: 'Bulk B' }
    ],
    actor: 'Synthetic Owner',
    reason: 'authenticated bulk snapshot'
  }
});
assert.equal(authenticatedBulk.status, 403);
assert.equal(authenticatedBulk.json.ok, false);
assert.equal(authenticatedBulk.json.writesPerformed, false);
assert.equal(authenticatedBulk.json.reason, 'bulk_event_mutation_disabled');
assert.equal(routeHarness.seen.appsScriptCalls.length, 0, 'authenticated bulk POST must not call Apps Script');
assert.equal(routeHarness.seen.authorizeCalls, 2);

console.log('event-mutation-contract.test.mjs: ok');
