import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import {
  BULK_TAB_OVERWRITE_ENABLED,
  createGranularWriteStore,
  validateEventOverridePayload,
  validateBusinessExpensePayload,
  formatOverrideDiff,
  rejectBulkPayload,
  GRANULAR_WRITE_ERROR_CODES,
  CHANGE_LOG_SOURCE
} from '../lib/granular-sheet-writes.mjs';
import * as granularWrites from '../lib/granular-sheet-writes.mjs';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

assert.equal(BULK_TAB_OVERWRITE_ENABLED, false);
assert.equal(rejectBulkPayload({ events: [] }).ok, false);
assert.equal(rejectBulkPayload({ bulk: true }).code, GRANULAR_WRITE_ERROR_CODES.BULK_REJECTED);

const badField = validateEventOverridePayload({
  eventId: 'evt-a',
  secretField: 'nope',
  status: 'Booked'
});
assert.equal(badField.ok, false);
assert.equal(badField.code, GRANULAR_WRITE_ERROR_CODES.UNKNOWN_FIELD);

const okPayload = validateEventOverridePayload({
  eventId: 'evt-a',
  status: 'Booked',
  note: 'Owner confirmed'
});
assert.equal(okPayload.ok, true);
assert.equal(okPayload.field, 'status');
assert.equal(okPayload.value, 'Booked');
assert.equal(okPayload.note, 'Owner confirmed');
assert.match(formatOverrideDiff('status', 'Proposal Sent', 'Booked'), /Status: Proposal Sent → Booked/);

const expenseBad = validateBusinessExpensePayload({
  date: '2026-11-27',
  vendor: 'Acme',
  category: 'Not A Category',
  amount: 12
});
assert.equal(expenseBad.ok, false);

const expenseOk = validateBusinessExpensePayload({
  date: '2026-11-27',
  vendor: 'Acme SaaS',
  category: 'Software/SaaS',
  amount: '49.99',
  description: 'Command Center tooling',
  paymentMethod: 'Card',
  notes: 'Monthly'
});
assert.equal(expenseOk.ok, true);
assert.equal(expenseOk.expense.amount, 49.99);

const store = createGranularWriteStore({
  events: [{
    id: 'evt-a',
    status: 'Proposal Sent',
    pipelineStage: 'quote_proposal',
    paymentStatus: 'Not Invoiced',
    owner: 'Matt',
    eventDate: '2026-12-01',
    followUpSnoozeUntil: '',
    setup: { internalOwner: 'Matt' },
    payment: { status: 'Not Invoiced' }
  }]
}, { clock: () => '2026-11-27T18:00:00.000Z' });

const unauth = store.applyEventOverride({
  eventId: 'evt-a',
  status: 'Booked',
  idempotencyKey: 'u1',
  auth: { authorized: false, actor: 'Intruder' }
});
assert.equal(unauth.ok, false);
assert.equal(unauth.code, GRANULAR_WRITE_ERROR_CODES.UNAUTHORIZED);

const bulkApply = store.applyEventOverride({
  eventId: 'evt-a',
  status: 'Booked',
  events: [{ id: 'evt-a' }],
  idempotencyKey: 'bulk1',
  auth: { authorized: true, actor: 'Owner' }
});
assert.equal(bulkApply.ok, false);
assert.equal(bulkApply.code, GRANULAR_WRITE_ERROR_CODES.BULK_REJECTED);

const saved = store.applyEventOverride({
  eventId: 'evt-a',
  status: 'Booked',
  note: 'Client signed',
  idempotencyKey: 's1',
  auth: { authorized: true, actor: 'Matt' }
});
assert.equal(saved.ok, true);
assert.equal(saved.writesPerformed, true);
assert.equal(saved.bulkOverwrite, false);
assert.equal(saved.diff, 'Status: Proposal Sent → Booked');
assert.equal(saved.changeLog.source, CHANGE_LOG_SOURCE);
assert.equal(saved.changeLog.note, 'Client signed');
assert.equal(store.snapshot().events[0].status, 'Booked');
assert.equal(store.snapshot().changeLog.length, 1);

const replay = store.applyEventOverride({
  eventId: 'evt-a',
  status: 'Booked',
  note: 'Client signed',
  idempotencyKey: 's1',
  auth: { authorized: true, actor: 'Matt' }
});
assert.equal(replay.idempotentReplay, true);
assert.equal(replay.writesPerformed, false);
assert.equal(store.snapshot().changeLog.length, 1);

const stage = store.applyEventOverride({
  eventId: 'evt-a',
  pipelineStage: 'invoiced_not_booked',
  note: '',
  idempotencyKey: 's2',
  auth: { authorized: true, actor: 'Matt' }
});
assert.equal(stage.ok, true);
assert.equal(store.snapshot().events[0].status, 'Invoice Sent');

const expense = store.applyBusinessExpense({
  date: expenseOk.expense.date,
  vendor: expenseOk.expense.vendor,
  category: expenseOk.expense.category,
  amount: expenseOk.expense.amount,
  description: expenseOk.expense.description,
  paymentMethod: expenseOk.expense.payment_method,
  notes: expenseOk.expense.notes,
  expenseId: expenseOk.expense.expense_id,
  idempotencyKey: 'e1',
  auth: { authorized: true, actor: 'Matt' }
});
assert.equal(expense.ok, true);
assert.equal(store.snapshot().expenses.length, 1);
assert.equal(store.snapshot().changeLog.length, 3);
assert.ok(store.snapshot().changeLog.some((row) => row.field === 'business_expense' && row.note.includes('Monthly')));

function jsonNoStore(value, status = 200) {
  return Response.json(value, {
    status,
    headers: { 'Cache-Control': 'no-store' }
  });
}

function denyUnauthorized() {
  return jsonNoStore({ ok: false, reason: 'unauthorized', readOnly: true, sendEnabled: false }, 401);
}

function loadRoute(relativePath, { authorized = false, appsScript = null } = {}) {
  const routeSource = readFileSync(join(root, relativePath), 'utf8');
  const js = ts.transpileModule(routeSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const seen = { appsScriptCalls: [] };
  const mod = { exports: {} };
  const source = {
    '../_lib': {
      appsScriptRequest: async (action, payload) => {
        seen.appsScriptCalls.push({ action, payload });
        if (appsScript) return appsScript(action, payload);
        return { ok: true, writesPerformed: true };
      },
      serverError: (error) => Response.json({
        message: error instanceof Error ? error.message : 'Unexpected server error.'
      }, { status: 500 })
    },
    '../_owner-read': {
      denyPrivateRead: () => (authorized ? null : denyUnauthorized())
    },
    '../../sms/staging/_lib': { jsonNoStore },
    '../../../../lib/granular-sheet-writes.mjs': granularWrites
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
  }, { filename: `${relativePath}.mock.cjs`, timeout: 1000 });
  return { seen, POST: mod.exports.POST };
}

const overrideSrc = readFileSync(join(root, 'app/api/sync/event-override/route.ts'), 'utf8');
const expenseSrc = readFileSync(join(root, 'app/api/sync/business-expense/route.ts'), 'utf8');
assert.match(overrideSrc, /denyPrivateRead/);
assert.match(expenseSrc, /denyPrivateRead/);
assert.ok(overrideSrc.indexOf('denyPrivateRead') < overrideSrc.indexOf('appsScriptRequest'));
assert.ok(expenseSrc.indexOf('denyPrivateRead') < expenseSrc.indexOf('appsScriptRequest'));
assert.doesNotMatch(overrideSrc, /authorizeAppRequest/);
assert.doesNotMatch(expenseSrc, /authorizeAppRequest/);

const eventsRoute = readFileSync(join(root, 'app/api/sync/events/route.ts'), 'utf8');
assert.match(eventsRoute, /bulk_event_mutation_disabled/);

const host = 'synthetic.lvpt.test';

const unauthOverrideRoute = loadRoute('app/api/sync/event-override/route.ts', { authorized: false });
const unauthOverride = await unauthOverrideRoute.POST(new Request(`https://${host}/api/sync/event-override`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ eventId: 'evt-a', status: 'Booked' })
}));
assert.equal(unauthOverride.status, 401);
assert.equal(unauthOverrideRoute.seen.appsScriptCalls.length, 0);

const authOverride = loadRoute('app/api/sync/event-override/route.ts', {
  authorized: true,
  appsScript: async (action, payload) => ({
    ok: true,
    writesPerformed: true,
    eventId: payload.eventId,
    field: payload.field,
    oldValue: 'Proposal Sent',
    newValue: payload.value,
    note: payload.note || '',
    changeLog: { note: payload.note || '', source: 'Command Center' }
  })
});

const bulkAuth = await authOverride.POST(new Request(`https://${host}/api/sync/event-override`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ eventId: 'evt-a', status: 'Booked', events: [{ id: 'evt-a' }] })
}));
assert.equal(bulkAuth.status, 403);
assert.equal(authOverride.seen.appsScriptCalls.length, 0);

const happy = await authOverride.POST(new Request(`https://${host}/api/sync/event-override`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ eventId: 'evt-a', status: 'Booked', note: 'Signed' })
}));
assert.equal(happy.status, 200);
const happyBody = await happy.json();
assert.equal(happyBody.ok, true);
assert.equal(happyBody.writesPerformed, true);
assert.equal(happyBody.bulkOverwrite, false);
assert.match(happyBody.diff, /Status: Proposal Sent → Booked/);
assert.equal(happyBody.changeLog.note, 'Signed');
assert.equal(authOverride.seen.appsScriptCalls[0].action, 'updateEventOverride');

const authExpense = loadRoute('app/api/sync/business-expense/route.ts', {
  authorized: true,
  appsScript: async (action, payload) => ({
    ok: true,
    writesPerformed: true,
    expense: payload.expense,
    changeLog: { field: 'business_expense', source: 'Command Center' }
  })
});
const expensePost = await authExpense.POST(new Request(`https://${host}/api/sync/business-expense`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    date: '2026-11-27',
    vendor: 'Notion',
    category: 'Software/SaaS',
    amount: 20,
    notes: 'Workspace'
  })
}));
assert.equal(expensePost.status, 200);
const expenseBody = await expensePost.json();
assert.equal(expenseBody.ok, true);
assert.equal(expenseBody.bankVerified, false);
assert.equal(expenseBody.drawableCashCents, null);
assert.equal(authExpense.seen.appsScriptCalls[0].action, 'appendBusinessExpense');

const unauthExpenseRoute = loadRoute('app/api/sync/business-expense/route.ts', { authorized: false });
const unauthExpense = await unauthExpenseRoute.POST(new Request(`https://${host}/api/sync/business-expense`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ date: '2026-11-27', vendor: 'X', category: 'Misc', amount: 1 })
}));
assert.equal(unauthExpense.status, 401);
assert.equal(unauthExpenseRoute.seen.appsScriptCalls.length, 0);

const masterSrc = readFileSync(join(root, 'public/v2/js/master-controls.js'), 'utf8');
assert.match(masterSrc, /Save with Note/);
assert.match(masterSrc, /Skip (?:&|&amp;) Save/);
assert.match(masterSrc, /Add a quick note \(optional\)/);
assert.match(masterSrc, /Change History/);

console.log('granular-sheet-writes.test.mjs: ok');
