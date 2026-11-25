import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = fileURLToPath(new URL('../public/', import.meta.url));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
const fixture = {
  events: [
    { id: 'evt-lead', eventName: 'Synthetic Lead', company: 'Private Client', contactName: 'Synthetic Guest', status: 'New Lead', eventDate: '12/20/2026', venue: 'Synthetic Room', city: 'Las Vegas', state: 'NV', proposalUrl: 'https://example.test/lead', nextAction: 'Send the recorded proposal', setup: { targetQuote: 2500, budgetRange: '$5,000–$10,000' }, staff: [{ id: 'staff-lead', name: 'Lead Host', role: 'Host' }], tasks: [{ id: 'task-1', title: 'Send proposal', owner: 'Synthetic Owner', dueDate: '2026-11-21', status: 'Open', priority: 'High' }] },
    { id: 'evt-partial', eventName: 'Synthetic Partial', status: 'Quote Needed', eventDate: '2026-12-18', quote: [{ quantity: 1, unitPrice: 100 }, { quantity: 1 }], tasks: [] },
    { id: 'evt-budget', eventName: 'Synthetic Budget', status: 'Needs Discovery', eventDate: '2026-12-16', setup: { budgetRange: '$10,000–$20,000', targetQuote: 0 }, tasks: [] },
    { id: 'evt-awaiting', eventName: 'Synthetic Awaiting', company: 'Private Client', status: 'Invoice Sent / Awaiting Deposit', eventDate: '2026-12-15', tasks: [] },
    { id: 'evt-processing', eventName: 'Synthetic Processing', company: 'Private Client', status: 'Booked — Payment Processing', eventDate: '2026-12-10', tasks: [] },
    { id: 'evt-active', eventName: 'Synthetic Booked', company: 'Synthetic Active', status: 'Booked', eventDate: '2026-12-01', venue: 'Synthetic Hall', city: 'Las Vegas', state: 'NV', staff: [{ id: 'staff-floor', name: 'Floor Lead', role: 'Floor' }], tasks: [{ id: 'task-floor', title: 'Confirm the floor', owner: 'Synthetic Owner', dueDate: '2026-12-02', status: 'Open', priority: 'High' }] },
    { id: 'evt-declined', eventName: 'Synthetic Declined', status: 'Client Declined', eventDate: '2026-12-18', tasks: [] },
    { id: 'evt-unknown', eventName: 'Synthetic Unverified', status: 'Outcome Unverified', eventDate: '2026-12-19', tasks: [] },
    { id: 'evt-closed', eventName: 'Synthetic Closed', status: 'Closed', eventDate: '2026-12-05', tasks: [] },
    { id: 'evt-past', eventName: 'Synthetic Past', company: 'Synthetic Past Co', status: 'Booked', eventDate: '1/2/2026', venue: 'Synthetic Archive', city: 'Las Vegas', state: 'NV', tasks: [{ id: 'task-old', title: 'Archive note', owner: 'Synthetic Owner', dueDate: '2026-01-01', status: 'Open' }] }
  ]
};
const ledger = {
  ok: true,
  readOnly: true,
  paymentSourceStatus: 'command_center_all_payments',
  payoutSourceStatus: 'command_center_ledger',
  eventRead: 'read',
  tasks: [
    { id: 'task-1', eventId: 'evt-lead', title: 'Send proposal', owner: 'Synthetic Owner', dueDate: '2026-11-21', status: 'Open' },
    { id: 'task-floor', eventId: 'evt-active', title: 'Confirm the floor', owner: 'Synthetic Owner', dueDate: '2026-12-02', status: 'Open' }
  ],
  taskConflicts: [],
  events: fixture.events.map((event) => ({ id: event.id, eventName: event.eventName, company: event.company, status: event.status, staff: event.staff || [] })),
  exceptions: [],
  report: {
    money: {
      verifiedClientReceiptsCents: 0,
      clientInvoiceTotalCents: 150000,
      openClientExposureCents: 50000,
      initiatedNotSettledCents: 0,
      vendorCommittedCents: 20000,
      ownerPaidCents: 0,
      ownerPlannedCents: 30000,
      verifiedContributionCents: null,
      forecastMarginCents: null,
      drawableCashCents: null,
      incompleteFields: [],
      coverage: 'complete',
      profitReason: 'Tax treatment is not established. No tax rate was applied.',
      drawableCashReason: 'Drawable cash is unavailable.'
    },
    counts: { payments: 2, clientInvoices: 2, vendorBills: 1, unclassified: 0, payouts: 2, payoutsExcludedAsDuplicateExpense: 0, amountOverlapsNotMerged: 0 },
    payments: [
      { eventId: 'evt-lead', paymentId: 'pay-lead', role: 'client_receivable', invoiceTotalCents: 11100, amountPaidCents: 1000, balanceDueCents: 10100, paymentStatus: 'Invoice Sent', settlement: 'issued', duplicateTreatment: '' },
      { eventId: 'evt-active', paymentId: 'pay-booked', role: 'client_receivable', invoiceTotalCents: 22200, amountPaidCents: 2000, balanceDueCents: 20200, paymentStatus: 'Paid In Full', settlement: 'paid', duplicateTreatment: '' }
    ],
    payouts: []
  },
  gmailActivityCount: 4,
  gmailThreadCount: 2,
  gmailQueue: [{ domainKey: 'example.test', lastMessageAt: '2026-11-20T18:00:00.000Z', lastDirection: 'inbound', subject: 'Synthetic header' }],
  jobs: [{ id: 'gmail-production', name: 'Gmail production ingestion', coverage: 'read-complete', connected: true, detail: 'Bounded header read.' }]
};
const inbox = {
  ok: true,
  counts: { actionRequired: 1, review: 0, recordedRecipientUnverified: 0, vendorExcluded: 0 },
  pipeline: { denominator: 1, stages: { open: 1, booked: 1 }, sources: { referral: 1 }, excluded: {}, qualificationGaps: 1, dueFollowUps: 0, overdueFollowUps: 1, proposalLinks: [{ eventId: 'evt-lead', url: 'https://example.test/lead' }] },
  records: [{ id: 'event:evt-lead', eventId: 'evt-lead', bucket: 'follow_up_due', source: 'Referral', contact: 'Synthetic Guest', company: 'Synthetic Co', eventName: 'Synthetic Lead', channel: 'unknown', qualification: { missing: ['phone'] }, draft: { body: 'Draft preview', recipient: '' }, timeline: [] }],
  sources: { events: 3 },
  gmail: { blocker: 'Production writes are off.' }
};

let mode = 'unauthorized';
let pictureGets = 0;
let releaseLedger = null;
const posts = [];
const server = createServer((request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1');
  if (request.method === 'POST') posts.push(url.pathname);
  const path = decodeURIComponent(url.pathname);
  if (path === '/sms-review/index.html') {
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end('<!doctype html><title>Review sign-in</title><p>Owner review sign-in handoff</p>');
    return;
  }
  const filePath = normalize(join(root, path.replace(/^\/+/, '')));
  if (!filePath.startsWith(root)) {
    response.writeHead(403);
    response.end('no');
    return;
  }
  try {
    const body = readFileSync(filePath);
    response.writeHead(200, { 'content-type': types[extname(filePath)] || 'application/octet-stream' });
    response.end(body);
  } catch {
    response.writeHead(404);
    response.end('missing');
  }
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.route('**/api/**', async (route) => {
  const request = route.request();
  if (request.method() === 'POST') posts.push(new URL(request.url()).pathname);
  if (mode === 'unauthorized') {
    await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ ok: false, reason: 'unauthorized', readOnly: true }) });
    return;
  }
  if (mode === 'unavailable') {
    await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ ok: false, reason: 'unavailable' }) });
    return;
  }
  const pathname = new URL(request.url()).pathname;
  if (mode === 'malformed' && pathname === '/api/sync/events') {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, readOnly: true }) });
    return;
  }
  if (mode === 'empty' && pathname === '/api/sync/events') {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, readOnly: true, events: [], eventCount: 0 }) });
    return;
  }
  if (pathname === '/api/sync/events') {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, readOnly: true, writesPerformed: false, events: fixture.events, eventCount: fixture.events.length }) });
    return;
  }
  if (pathname === '/api/sync/operating-picture') {
    pictureGets += 1;
    if (mode === 'delay-ledger') await new Promise((resolve) => { releaseLedger = resolve; });
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ledger) });
    return;
  }
  if (pathname === '/api/sync/action-inbox') {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(inbox) });
    return;
  }
  if (pathname === '/api/sms/staging/conversations') {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, storedMessages: 0, threads: [], sendEnabled: false, messageTextIncluded: false }) });
    return;
  }
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, authenticated: true }) });
});

page.on('console', (msg) => console.log('BROWSER', msg.type(), msg.text()));
page.on('pageerror', (error) => console.log('PAGEERROR', error.message));
page.on('request', (request) => {
  if (request.url().includes('/api/')) console.log('REQ', request.method(), request.url());
});
async function openHub(width, height) {
  await page.setViewportSize({ width, height });
  await page.goto(`http://127.0.0.1:${port}/v2/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.lvptSheetSnapshot && window.lvptSheetSnapshot.state && window.lvptSheetSnapshot.state !== 'loading', null, { timeout: 15000 });
}

function overflow() {
  return page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
}

try {
  mode = 'unauthorized';
  await openHub(1280, 800);
  await page.waitForFunction(() => window.lvptSheetSnapshot && window.lvptSheetSnapshot.state === 'auth-required');
  const unauthText = await page.locator('body').innerText();
  assert.match(unauthText, /Owner sign-in required/);
  assert.equal(unauthText.includes('NIUM'), false);
  assert.equal(unauthText.includes('Synthetic Lead'), false);
  await page.locator('[data-command-view="pipeline"]').click();
  await page.waitForTimeout(200);
  const pipeline = await page.locator('#commandView').innerText();
  assert.match(pipeline, /Owner sign-in required/);
  assert.equal(pipeline.includes('No deals'), false);
  await page.locator('[data-command-view="communications"]').click();
  await page.waitForTimeout(400);
  const communications = await page.locator('#commandView').innerText();
  assert.match(communications, /SMS metadata was not read|AUTH REQUIRED/);
  assert.equal(/\d+ stored SMS metadata rows/.test(communications), false);
  await page.locator('#ownerSignInLink').click();
  await page.waitForURL(/sms-review/);
  assert.match(await page.locator('body').innerText(), /Owner review sign-in handoff/);

  mode = 'ready';
  await openHub(1280, 800);
  await page.waitForFunction(() => window.lvptSheetSnapshot && window.lvptSheetSnapshot.state === 'ready');
  const afterReady = pictureGets;
  await page.locator('[data-command-view="overview"]').click();
  await page.waitForTimeout(200);
  const overview = await page.locator('#commandView').innerText();
  assert.match(overview, /Confirmed upcoming/);
  assert.match(overview, /Dated inquiries and proposals/);
  assert.match(overview, /ledger-recorded receipts/i);
  assert.equal(await page.locator('#eventEditorPanel').isVisible(), false);
  assert.equal(await page.locator('#reportCenter').isVisible(), false);
  assert.equal(await page.locator('#ownerSignInLink').count(), 1);
  await page.evaluate(() => { document.body.style.minHeight = '2400px'; });
  await page.waitForFunction(() => document.body.scrollHeight > 2000);
  await page.evaluate(() => window.scrollTo(0, 640));
  await page.waitForFunction(() => window.scrollY > 500);
  const listScroll = await page.evaluate(() => window.scrollY);
  await page.locator('[data-open-task="task-1"]').click();
  const taskView = await page.locator('#commandView').innerText();
  assert.match(taskView, /Priority open tasks/);
  assert.match(taskView, /Send proposal/);
  assert.match(taskView, /Synthetic Lead/);
  assert.equal(await page.locator('[data-open-task-panel="task-1"]').count(), 1);
  assert.equal(taskView.includes('Floor Lead'), false);
  assert.equal(taskView.includes('$222'), false);
  assert.equal(await page.locator('#eventEditorPanel').isVisible(), false);
  assert.equal(await page.locator('#reportCenter').isVisible(), false);
  assert.equal(page.url().includes('Synthetic'), false);
  await page.goBack();
  await page.waitForFunction(() => !document.querySelector('[data-open-task-panel="task-1"]'));
  assert.match(await page.locator('#commandView').innerText(), /Priority open tasks/);
  await page.goForward();
  await page.waitForFunction(() => document.querySelector('[data-open-task-panel="task-1"]'));
  await page.locator('[data-view-event="evt-lead"]').click();
  await page.waitForFunction(() => {
    const record = document.querySelector('[data-record-event="evt-lead"]');
    return record && record.innerText.includes('$111.00');
  });
  const record = await page.locator('[data-record-event="evt-lead"]').innerText();
  assert.match(record, /Synthetic Lead/);
  assert.match(record, /Lead Host/);
  assert.match(record, /Send proposal/);
  assert.match(record, /\$111\.00/);
  assert.equal(record.includes('Floor Lead'), false);
  assert.equal(record.includes('$222'), false);
  assert.equal(record.includes('Synthetic Booked'), false);
  assert.equal(record.includes('Confirm the floor'), false);
  const editorText = await page.locator('#eventEditorPanel').textContent();
  assert.match(editorText, /Synthetic Lead/);
  assert.equal(editorText.includes('Floor Lead'), false);
  assert.equal(editorText.includes('$222'), false);
  assert.equal(editorText.includes('Synthetic Booked'), false);
  assert.equal(page.url().includes('Synthetic'), false);
  await page.locator('[data-back-list]').click();
  await page.waitForFunction(() => Math.abs(window.scrollY - 640) < 80 || document.querySelector('[data-open-task-panel="task-1"]'));
  await page.locator('[data-close-task]').click();
  await page.waitForFunction((y) => !document.querySelector('[data-open-task-panel]') && Math.abs(window.scrollY - y) < 80, listScroll);
  await page.evaluate(() => { document.body.style.minHeight = ''; window.lvptOpenRecord('evt-active'); window.lvptOpenRecord('evt-lead'); });
  await page.waitForFunction(() => {
    const node = document.querySelector('[data-record-event]');
    return node && node.getAttribute('data-record-event') === 'evt-lead' && node.innerText.includes('$111.00') && !node.innerText.includes('$222');
  });
  const rapid = await page.locator('#commandView').innerText();
  assert.equal(rapid.includes('Floor Lead'), false);
  assert.equal(rapid.includes('Synthetic Booked'), false);
  await page.evaluate(() => window.lvptOpenRecord('not-a-real-event'));
  const missing = await page.locator('#commandView').innerText();
  assert.match(missing, /not in the signed-in/);
  assert.equal(missing.includes('Synthetic Lead'), false);
  assert.equal(missing.includes('Synthetic Booked'), false);
  assert.equal(missing.includes('$111'), false);
  assert.equal(missing.includes('$222'), false);
  await page.locator('[data-command-view="overview"]').click();
  await page.locator('[data-command-view="pipeline"]').click();
  await page.waitForTimeout(200);
  const pipelineText = await page.locator('#commandView').innerText();
  assert.match(pipelineText, /Synthetic Lead/);
  assert.match(pipelineText, /Synthetic Awaiting/);
  assert.match(pipelineText, /Synthetic Unverified/);
  assert.match(pipelineText, /Cost not recorded/);
  assert.match(pipelineText, /Recorded target/);
  assert.match(pipelineText, /Unpriced/);
  assert.equal(pipelineText.includes('Synthetic Processing'), false);
  await page.locator('[data-command-view="active"]').click();
  await page.waitForTimeout(200);
  const activeText = await page.locator('#commandView').innerText();
  assert.match(activeText, /Synthetic Booked/);
  assert.match(activeText, /Synthetic Processing/);
  assert.equal(activeText.includes('Synthetic Awaiting'), false);
  await page.locator('[data-command-view="archive"]').click();
  await page.waitForTimeout(200);
  const past = await page.locator('#commandView').innerText();
  assert.match(past, /Synthetic Past/);
  assert.match(past, /Synthetic Declined/);
  assert.match(past, /Synthetic Closed/);
  assert.match(past, /Outcome needs review/);
  assert.match(past, /Past date/);
  await page.locator('[data-command-view="proposals"]').click();
  await page.waitForTimeout(200);
  const proposals = await page.locator('#commandView').innerText();
  assert.match(proposals, /Recorded on the sheet/);
  assert.match(proposals, /Historical reference, not verified/);
  assert.equal(proposals.includes('Proposal Active'), false);
  await page.locator('#proposalSearch').fill('zzz-filter');
  await page.locator('[data-open-event="evt-lead"]').click();
  await page.locator('[data-back-list]').click();
  await page.waitForFunction(() => document.querySelector('#proposalSearch'));
  assert.equal(await page.locator('#proposalSearch').inputValue(), 'zzz-filter');
  assert.match(await page.locator('#commandView').innerText(), /Recorded on the sheet/);
  await page.locator('[data-command-view="followup"]').click();
  await page.waitForTimeout(200);
  assert.match(await page.locator('#commandView').innerText(), /Send proposal/);
  await page.locator('[data-command-view="finance"]').click();
  await page.waitForTimeout(300);
  await page.locator('[data-command-view="communications"]').click();
  await page.waitForTimeout(300);
  assert.equal(pictureGets, afterReady);
  const communicationsReady = await page.locator('#commandView').innerText();
  assert.match(communicationsReady, /Owner session/);
  assert.match(communicationsReady, /4 stored Gmail Activity rows/);
  assert.match(communicationsReady, /2 unique thread ids/);
  assert.match(communicationsReady, /Synthetic header/);
  assert.equal(communicationsReady.includes('no new threads'), false);
  await page.locator('[data-command-view="action"]').click();
  await page.waitForTimeout(400);
  assert.match(await page.locator('#commandView').innerText(), /Synthetic Lead/);
  assert.match(await page.locator('#commandView').innerText(), /Due /);
  await page.locator('#actionSearch').fill('zzzz-no-match');
  await page.waitForFunction(() => document.querySelectorAll('.action-card:not([hidden])').length === 0);
  const searchScroll = await page.evaluate(() => window.scrollY);
  await page.locator('#actionFilterClear').click();
  assert.equal(await page.locator('#actionSearch').inputValue(), '');
  assert.match(await page.locator('#commandView').innerText(), /Synthetic Lead/);
  assert.ok(Math.abs(await page.evaluate(() => window.scrollY) - searchScroll) < 80);
  await page.locator('[data-command-view="health"]').click();
  await page.waitForTimeout(400);
  const health = await page.locator('#commandView').innerText();
  assert.equal(health.includes('AUTH REQUIRED'), false);
  assert.equal(await overflow(), true);

  await page.setViewportSize({ width: 375, height: 800 });
  await page.locator('[data-command-view="overview"]').click();
  await page.locator('[data-open-task="task-1"]').click();
  assert.match(await page.locator('#commandView').innerText(), /Priority open tasks/);
  assert.equal(await page.locator('#eventEditorPanel').isVisible(), false);
  await page.waitForTimeout(200);
  assert.equal(await overflow(), true);
  assert.equal(await page.locator('#commandNav').isVisible(), true);

  mode = 'delay-ledger';
  releaseLedger = null;
  await openHub(1280, 800);
  await page.waitForFunction(() => window.lvptSheetSnapshot && window.lvptSheetSnapshot.state === 'ready');
  await page.evaluate(() => window.lvptOpenRecord('evt-active'));
  await page.waitForFunction(() => /still loading/i.test(document.querySelector('[data-record-ledger]')?.textContent || ''));
  const waiting = await page.locator('[data-record-ledger]').innerText();
  assert.equal(waiting.includes('222'), false);
  assert.equal(waiting.includes('111'), false);
  assert.equal(waiting.includes('Lead Host'), false);
  for (let attempt = 0; attempt < 50 && !releaseLedger; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 20));
  releaseLedger();
  releaseLedger = null;
  await page.waitForFunction(() => (document.querySelector('[data-record-event="evt-active"] [data-record-ledger]')?.innerText || '').includes('$222.00'));
  const delayed = await page.locator('[data-record-event="evt-active"]').innerText();
  assert.match(delayed, /Synthetic Booked/);
  assert.match(delayed, /Floor Lead/);
  assert.match(delayed, /\$222\.00/);
  assert.equal(delayed.includes('$111'), false);
  assert.equal(delayed.includes('Lead Host'), false);
  assert.equal(delayed.includes('Send proposal'), false);

  mode = 'unavailable';
  await page.locator('#refreshSheetBtn').click();
  await page.waitForFunction(() => window.lvptSheetSnapshot && window.lvptSheetSnapshot.state === 'unavailable');
  await page.locator('[data-command-view="pipeline"]').click();
  await page.waitForTimeout(200);
  const failed = await page.locator('#commandView').innerText();
  assert.match(failed, /unavailable/);
  assert.equal(failed.includes('No deals'), false);
  assert.equal(failed.includes('Synthetic Lead'), false);

  mode = 'empty';
  await page.locator('#commandView #retrySnapshotBtn').click();
  await page.waitForFunction(() => window.lvptSheetSnapshot && window.lvptSheetSnapshot.state === 'empty');
  await page.locator('[data-command-view="active"]').click();
  await page.waitForTimeout(200);
  assert.match(await page.locator('#commandView').innerText(), /returned no events/);

  mode = 'malformed';
  await page.locator('#refreshSheetBtn').click();
  await page.waitForFunction(() => window.lvptSheetSnapshot && window.lvptSheetSnapshot.state === 'unavailable');
  assert.match(await page.locator('#snapshotBanner').innerText(), /unavailable/);
  const asset = await page.request.get(`http://127.0.0.1:${port}/v2/js/roster-nium.js`);
  assert.equal(asset.status(), 404);
  mode = 'unauthorized';
  await page.locator('[data-command-view="overview"]').click();
  await page.locator('#refreshSheetBtn').click();
  await page.waitForFunction(() => window.lvptSheetSnapshot && window.lvptSheetSnapshot.state === 'auth-required');
  assert.match(await page.locator('#snapshotBanner').innerText(), /Owner sign-in required/);
  const cleared = await page.locator('body').innerText();
  assert.equal(cleared.includes('Synthetic Lead'), false);
  assert.equal(cleared.includes('Floor Lead'), false);
  assert.equal(cleared.includes('$111'), false);
  assert.equal(cleared.includes('$222'), false);
  assert.equal(await page.locator('[data-record-event]').count(), 0);
  assert.equal(posts.some((path) => path === '/api/sync/events' && false), false);
  assert.equal(posts.includes('/api/sync/events'), false);
  assert.equal(posts.includes('/api/gmail/send'), false);
  console.log('Command Center browser regression passed.');
} finally {
  await browser.close();
  server.close();
}
