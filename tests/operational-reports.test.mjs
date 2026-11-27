import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const reports = require('../public/v2/js/reports.js');
const finance = require('../public/v2/js/event-finance.js');
const crm = require('../public/v2/js/lifecycle-command-center.js');

const events = [
  {
    id: 'evt-lead',
    eventName: 'Synthetic Lead',
    company: 'Lead Co',
    status: 'New Lead',
    leadSource: 'Website form',
    eventDate: '2026-12-15',
    setup: { targetQuote: 12000 },
    targetQuoteSupplied: 12000,
    quote: [],
    payment: {},
    tasks: [{ id: 'task-lead-1', title: 'Call lead', status: 'Open', owner: 'Matt', dueDate: '2026-11-27', priority: 'High' }]
  },
  {
    id: 'evt-booked',
    eventName: 'Booked Night',
    company: 'Booked Co',
    status: 'Booked',
    leadSource: 'Referral from partner',
    eventDate: '2026-10-01',
    setup: { targetQuote: 5000 },
    targetQuoteSupplied: 5000,
    quote: [{ id: 'q1', quantity: 1, unitPrice: 8000, internalCost: 3000 }],
    payment: { amountPaid: 4000, status: 'Partial' },
    tasks: [{ id: 'task-booked-1', title: 'Confirm dealers', status: 'Complete', owner: 'Mark', dueDate: '2026-09-20' }]
  },
  {
    id: 'evt-unpriced',
    eventName: 'Unpriced Inquiry',
    company: 'Unknown Co',
    status: 'Needs Discovery',
    leadSource: '',
    eventDate: '2027-01-10',
    setup: {},
    quote: null,
    payment: {},
    tasks: []
  }
];

const ledger = finance.buildLedger({
  payments: [
    {
      paymentId: 'pay-booked',
      eventId: 'evt-booked',
      ledgerRole: 'client_receivable',
      invoiceTotal: 8000,
      amountPaid: 4000,
      balanceDue: 4000,
      paymentStatus: 'Invoice Sent'
    },
    {
      paymentId: 'pay-vendor',
      eventId: 'evt-booked',
      lineLabel: 'Elevated vendor expense',
      invoiceTotal: 1200,
      amountPaid: 0,
      balanceDue: 1200,
      paymentStatus: 'Invoice Sent'
    },
    {
      paymentId: 'pay-other',
      eventId: 'evt-other',
      ledgerRole: 'client_receivable',
      invoiceTotal: 9999,
      amountPaid: 0,
      balanceDue: 9999,
      paymentStatus: 'Invoice Sent'
    }
  ],
  payouts: []
});

const jobs = [
  { id: 'financial-sync', name: 'Sheet ledger', connected: true, lastSuccess: '2026-11-26T12:00:00Z', status: 'HEALTHY' },
  { id: 'sms-heartbeat', name: 'Android SMS', connected: false, lastSuccess: '', status: 'UNVERIFIED' }
];

const exceptions = [
  { id: 'ex-booked', eventId: 'evt-booked', detail: 'Booked event exception', includedInTotals: false },
  { id: 'ex-other', eventId: 'evt-other', detail: 'Other event exception', includedInTotals: false }
];

const portfolio = reports.buildOperationalReport({
  events,
  ledger,
  jobs,
  exceptions,
  today: '2026-11-26',
  now: '2026-11-26T18:00:00Z',
  authenticated: true
});

assert.equal(portfolio.scope.kind, 'portfolio');
assert.match(portfolio.scope.label, /portfolio|snapshot/i);
assert.equal(portfolio.financialConfidence.unknownIsNotZero, true);
assert.equal(portfolio.financialConfidence.targetsSeparate, true);
assert.match(portfolio.financialConfidence.note, /Unknown amounts remain unknown/i);
assert.match(portfolio.freshness.label, /Source freshness/i);
assert.equal(portfolio.csvExport, null);
assert.match(portfolio.csvExportReason, /omitted/i);

assert.equal(portfolio.quotes.recordedTargetCount >= 1, true);
assert.equal(portfolio.quotes.pricedCount, 1);
assert.equal(portfolio.quotes.pricedLineItemCents, 800000);
assert.notEqual(portfolio.quotes.pricedLineItemCents, (portfolio.quotes.recordedTargetCents || 0) + 800000);
assert.match(portfolio.quotes.note, /not added to priced/i);

assert.equal(portfolio.tasks.openCount, 1);
assert.equal(portfolio.tasks.open[0].eventId, 'evt-lead');
assert.equal(portfolio.exceptions.available, true);
assert.equal(portfolio.exceptions.count, 2);
assert.equal(portfolio.acquisition.sources.form >= 1, true);
assert.equal(portfolio.acquisition.sources.referral >= 1, true);
assert.equal(portfolio.acquisition.sources.unknown >= 1, true);

assert.equal(portfolio.conversion.rate, null);
assert.match(portfolio.conversion.rateLabel, /Unavailable/i);
assert.match(portfolio.conversion.reason, /cohort|conversion rate/i);

const selected = reports.buildOperationalReport({
  events,
  eventId: 'evt-booked',
  ledger,
  jobs,
  exceptions,
  today: '2026-11-26',
  authenticated: true
});

assert.equal(selected.scope.kind, 'selected-event');
assert.equal(selected.scope.eventId, 'evt-booked');
assert.deepEqual(selected.scope.eventIds, ['evt-booked']);
assert.equal(selected.isolation.selectedEventOnly, true);
assert.equal(selected.isolation.containsOtherEventData, false);
assert.equal(selected.isolation.excludedEventIds.includes('evt-lead'), true);
assert.equal(selected.isolation.excludedEventIds.includes('evt-unpriced'), true);
assert.equal(selected.exceptions.count, 1);
assert.equal(selected.exceptions.items[0].eventId, 'evt-booked');
assert.equal(selected.tasks.openCount, 0);
assert.equal(selected.quotes.pricedLineItemCents, 800000);
assert.equal(selected.quotes.recordedTargetCents, 500000);
assert.notEqual(
  selected.quotes.pricedLineItemCents,
  selected.quotes.pricedLineItemCents + selected.quotes.recordedTargetCents
);

const selectedText = reports.formatOperationalReportText(selected);
assert.match(selectedText, /evt-booked/);
assert.match(selectedText, /Selected event/i);
assert.match(selectedText, /Cross-event data: none/);
assert.equal(selectedText.includes('Synthetic Lead'), false);
assert.equal(selectedText.includes('evt-lead'), false);
assert.equal(selectedText.includes('Unpriced Inquiry'), false);
assert.equal(selectedText.includes('evt-other'), false);
assert.match(selectedText, /Unknown amounts remain unknown/i);
assert.match(selectedText, /Source freshness/i);
assert.match(selectedText, /CSV export is omitted/i);

const missing = reports.buildOperationalReport({
  events,
  eventId: 'evt-missing',
  ledger,
  jobs,
  exceptions
});
assert.equal(missing.scope.kind, 'selected-missing');
assert.deepEqual(missing.scope.eventIds, []);
assert.match(missing.scope.note, /not substituted/i);
assert.equal(missing.quotes.pricedLineItemCents, 0);
assert.equal(missing.tasks.openCount, 0);

const unknownQuotes = reports.buildOperationalReport({
  events: [events[2]],
  today: '2026-11-26'
});
assert.equal(unknownQuotes.quotes.pricedLineItemCents, null);
assert.equal(unknownQuotes.quotes.recordedTargetCents, null);
assert.equal(reports.moneyLabel(null), 'Unknown');
assert.equal(reports.moneyLabel(undefined), 'Unknown');

const eligibleConversion = reports.buildOperationalReport({
  events,
  conversion: {
    denominator: 10,
    stages: { booked: 2 },
    conversion: {
      cohort: '2026 Q3 website form leads',
      period: '2026-07-01 to 2026-09-30',
      outcomeNumerator: 2,
      outcomeDenominator: 8,
      rate: 0.25,
      reason: 'Eligible cohort conversion uses the outcome denominator.'
    }
  }
});
assert.equal(eligibleConversion.conversion.canComputeRate, true);
assert.equal(eligibleConversion.conversion.rate, 0.25);
assert.match(eligibleConversion.conversion.denominator, /8/);

const deniedConversion = reports.buildOperationalReport({
  events,
  conversion: {
    denominator: events.length,
    stages: { booked: 1 },
    conversion: {
      numerator: 1,
      denominator: events.length,
      rate: null,
      reason: 'No eligible cohort and period are defined, so a conversion rate is unavailable.'
    }
  }
});
assert.equal(deniedConversion.conversion.rate, null);
assert.equal(deniedConversion.conversion.canComputeRate, false);

const incomplete = reports.confidenceOf('openClientExposure', 1000, 'incomplete', ['openClientExposure']);
assert.equal(incomplete.cents, null);
assert.equal(incomplete.label, 'Incomplete');
assert.equal(incomplete.confidence, 'low');

const crmPanel = crm.formatAttributionPanel(crm.conversionReport(null));
assert.match(crmPanel, /unavailable/i);

const reportsJs = require('node:fs').readFileSync(new URL('../public/v2/js/reports.js', import.meta.url), 'utf8');
assert.match(reportsJs, /buildOperationalReport/);
assert.match(reportsJs, /Another event was not substituted/);
assert.match(reportsJs, /CSV export is omitted/);
assert.match(reportsJs, /Unknown amounts remain unknown/);
assert.equal(/download\('lvpt-2026-events\.csv'/.test(reportsJs), false);

const lifecycleJs = require('node:fs').readFileSync(new URL('../public/v2/js/lifecycle-command-center.js', import.meta.url), 'utf8');
assert.match(lifecycleJs, /LVPTOperationalReports/);
assert.match(lifecycleJs, /buildScopedOperationalReport/);
assert.match(lifecycleJs, /data-operational-report/);
assert.match(lifecycleJs, /data-report-freshness/);
assert.match(lifecycleJs, /data-report-confidence/);

console.log('operational-reports.test.mjs passed');
