const assert = require('node:assert/strict');
const { buildLedger, sourceStatus } = require('../public/v2/js/event-finance.js');

const niumOws = buildLedger({
  payments: [
    { paymentId: 'pay-nium-main', eventId: 'evt-nium-2026', invoiceNumber: 'INV-000839', ledgerRole: 'client_receivable', invoiceTotal: 50578.38, amountPaid: 50578.38, balanceDue: 0, paymentStatus: 'Paid In Full' },
    { paymentId: 'pay-nium-decks', eventId: 'evt-nium-2026', invoiceNumber: 'INV-000847', ledgerRole: 'client_receivable', invoiceTotal: 1353.39, amountPaid: 1353.39, balanceDue: 1353.39, paymentStatus: 'Payment Initiated' },
    { paymentId: 'pay-nium-elevated', eventId: 'evt-nium-2026', invoiceNumber: 'EL-100', lineLabel: 'Elevated vendor expense', invoiceTotal: 2200, amountPaid: 0, balanceDue: 2200, paymentStatus: 'Payment Initiated' },
    { paymentId: 'pay-ows-1', eventId: 'evt-ows-2026', invoiceNumber: 'OWS-1', ledgerRole: 'client_receivable', invoiceTotal: 21183.5, amountPaid: 0, balanceDue: 21183.5, paymentStatus: 'Payment Initiated' },
    { paymentId: 'pay-ows-heo', eventId: 'evt-ows-2026', invoiceNumber: 'OWS-HEO', lineLabel: 'Venetian HEO obligation', invoiceTotal: 4800, amountPaid: 0, balanceDue: 4800, paymentStatus: 'Invoice Sent' },
    { paymentId: 'pay-ows-2', eventId: 'evt-ows-2026', invoiceNumber: 'OWS-2', ledgerRole: 'client_receivable', invoiceTotal: 21183.5, amountPaid: 0, balanceDue: 21183.5, paymentStatus: 'Invoice Sent' }
  ],
  payouts: [
    { payoutId: 'po-elevated', eventId: 'evt-nium-2026', payee: 'Elevated', payoutType: 'Vendor', amount: 2200, status: 'Planned' },
    { payoutId: 'po-owner', eventId: 'evt-nium-2026', payee: 'Owner', payoutType: 'Owner distribution', amount: 1000, status: 'Planned' }
  ]
});

assert.equal(niumOws.counts.payments, 6);
assert.equal(niumOws.counts.clientInvoices, 4, 'same-amount OWS invoices stay separate and NIUM decks stays a client invoice');
assert.equal(niumOws.counts.vendorBills, 2, 'Elevated and Venetian HEO stay vendor bills');
assert.equal(niumOws.money.verifiedClientReceiptsCents, 5057838);
assert.equal(niumOws.money.initiatedNotSettledCents, 135339 + 2118350);
assert.equal(niumOws.counts.payoutsExcludedAsDuplicateExpense, 1, 'matching vendor payout is not added again');
assert.equal(niumOws.money.payoutObligationCents, 100000);
assert.ok(niumOws.money.forecastMarginCents < niumOws.money.clientInvoiceTotalCents);

const blank = buildLedger({
  payments: [
    { paymentId: 'pay-unknown', eventId: 'evt-x', invoiceNumber: 'INV-9', invoiceTotal: 100, amountPaid: 100, paymentStatus: 'Paid In Full' }
  ],
  payouts: []
});
assert.equal(blank.counts.unclassified, 1);
assert.equal(blank.counts.clientInvoices, 0);
assert.equal(blank.money.verifiedClientReceiptsCents, 0, 'unclassified paid rows are not revenue');

const fixture = {
  payments: [
    { paymentId: 'pay-nium-main', eventId: 'evt-nium-2026', ledgerRole: 'client_receivable', invoiceTotal: 50578.38, amountPaid: 50578.38, balanceDue: 0, paymentStatus: 'Paid In Full' },
    { paymentId: 'pay-nium-decks', eventId: 'evt-nium-2026', ledgerRole: 'client_receivable', invoiceTotal: 1353.39, amountPaid: 1353.39, balanceDue: 1353.39, paymentStatus: 'Payment Initiated' }
  ],
  payouts: [{ payoutId: 'po-owner', eventId: 'evt-nium-2026', payee: 'Owner', payoutType: 'Owner distribution', amount: 1000, status: 'Planned' }]
};
assert.equal(JSON.stringify(buildLedger(fixture)), JSON.stringify(buildLedger(fixture)));

assert.equal(sourceStatus({ disabled: true, connected: true }), 'DISABLED');
assert.equal(sourceStatus({ connected: false }), 'NOT CONNECTED');
assert.equal(sourceStatus({ connected: false, partial: true }), 'PARTIAL');
assert.equal(sourceStatus({ connected: true }), 'NOT VERIFIED');
assert.equal(sourceStatus({ connected: true, partial: true }), 'PARTIAL');
assert.equal(sourceStatus({ connected: true, lastSuccess: '2026-11-20T12:00:00Z', now: '2026-11-22T12:00:00Z', staleAfterHours: 36 }), 'STALE');
assert.equal(sourceStatus({ connected: true, lastSuccess: '2026-11-22T11:00:00Z', now: '2026-11-22T12:00:00Z', staleAfterHours: 36 }), 'LIVE');

const flow = buildLedger({
  payments: [
    { paymentId: 'lead-invoice-a', eventId: 'evt-synthetic', ledgerRole: 'client_receivable', invoiceTotal: 1000, amountPaid: 0, balanceDue: 1000, paymentStatus: 'Invoice Sent' },
    { paymentId: 'lead-invoice-b', eventId: 'evt-synthetic', ledgerRole: 'client_receivable', invoiceTotal: 1000, amountPaid: 0, balanceDue: 1000, paymentStatus: 'Invoice Sent' },
    { paymentId: 'lead-vendor', eventId: 'evt-synthetic', lineLabel: 'Elevated staging vendor', invoiceTotal: 250, amountPaid: 0, balanceDue: 250, paymentStatus: 'Invoice Sent' }
  ],
  payouts: []
});
assert.equal(flow.counts.clientInvoices, 2);
assert.equal(flow.money.verifiedClientReceiptsCents, 0);
assert.equal(flow.money.forecastMarginCents, 175000);
assert.equal(flow.payments.every((row) => row.bankVerified === false), true);

console.log('Event finance and source-status tests passed.');
