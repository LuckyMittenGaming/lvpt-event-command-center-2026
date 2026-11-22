const assert = require('node:assert/strict');
const { buildLedger, sourceStatus, documentedExceptions } = require('../public/v2/js/event-finance.js');

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
assert.equal(niumOws.counts.payoutsExcludedAsDuplicateExpense, 0, 'a matching amount does not merge a payout into a vendor bill');
assert.equal(niumOws.counts.amountOverlapsNotMerged, 1);
assert.equal(niumOws.money.payoutObligationCents, 320000);
assert.equal(niumOws.money.forecastMarginCents, null, 'profit stays unavailable when the vendor ledger is not marked complete');

const blank = buildLedger({
  payments: [
    { paymentId: 'pay-unknown', eventId: 'evt-x', invoiceNumber: 'INV-9', ledgerRole: 'unclassified', invoiceTotal: 100, amountPaid: 100, paymentStatus: 'Paid In Full' }
  ],
  payouts: []
});
assert.equal(blank.counts.unclassified, 1);
assert.equal(blank.counts.clientInvoices, 0);
assert.equal(blank.money.verifiedClientReceiptsCents, 0, 'explicitly unclassified paid rows are not revenue');

const sheetClients = buildLedger({
  payments: [
    { paymentId: 'PAY-evt-lineaje-2026', eventId: 'evt-lineaje-2026', invoiceTotal: 10491.25, amountPaid: 10491.25, balanceDue: 0, paymentStatus: 'Paid In Full' },
    { paymentId: 'PAY-evt-neo-reunion-2026', eventId: 'evt-neo-reunion-2026', invoiceTotal: 42610.95, amountPaid: 42610.95, balanceDue: 0, paymentStatus: 'Paid In Full' },
    { paymentId: 'PAY-evt-nium-2026', eventId: 'evt-nium-2026', invoiceTotal: 50578.38, amountPaid: 50578.38, balanceDue: 0, paymentStatus: 'Paid In Full' }
  ],
  payouts: [
    { payoutId: 'payout-nium-matt', eventId: 'evt-nium-2026', payoutType: 'Owner Distribution', amount: 3000, status: 'Paid' },
    { payoutId: 'payout-nium-mark', eventId: 'evt-nium-2026', payoutType: 'Owner Distribution', amount: 3000, status: 'Paid' },
    { payoutId: 'payout-neo-planned-matt', eventId: 'evt-neo-reunion-2026', payoutType: 'Owner Distribution', amount: 6233.28, status: 'Planned' },
    { payoutId: 'payout-neo-planned-mark', eventId: 'evt-neo-reunion-2026', payoutType: 'Owner Distribution', amount: 6233.28, status: 'Planned' },
    { payoutId: 'payout-neo-paid-matt', eventId: 'evt-neo-reunion-2026', payoutType: 'Owner Distribution', amount: 3000, status: 'Paid' }
  ]
});
const nium = sheetClients.byEvent.find((row) => row.eventId === 'evt-nium-2026');
const neo = sheetClients.byEvent.find((row) => row.eventId === 'evt-neo-reunion-2026');
const lineaje = sheetClients.byEvent.find((row) => row.eventId === 'evt-lineaje-2026');
assert.equal(nium.outstandingCents, 0);
assert.equal(nium.collectedCents, 5057838);
assert.equal(nium.ownerPaidCents, 600000);
assert.equal(nium.ownerPlannedCents, 0);
assert.equal(neo.invoiceTotalCents, 4261095);
assert.equal(neo.outstandingCents, 0);
assert.equal(neo.ownerPlannedCents, 1246656);
assert.equal(neo.ownerPaidCents, 300000);
assert.equal(lineaje.collectedCents, 1049125);
assert.equal(lineaje.outstandingCents, 0);
assert.equal(sheetClients.money.ownerPlannedCents, 1246656);
assert.equal(sheetClients.money.verifiedContributionCents, null);
assert.equal(sheetClients.payments.every((row) => row.bankVerified === false), true);

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
assert.equal(sourceStatus({ observable: false, connected: true, lastSuccess: '2026-11-22T12:00:00Z' }), 'NOT OBSERVABLE');
assert.equal(sourceStatus({ status: 'UNVERIFIED', connected: true, lastSuccess: '2026-11-22T12:00:00Z' }), 'UNVERIFIED');
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
assert.equal(flow.money.forecastMarginCents, null);
const completeExpenses = buildLedger({
  expensesComplete: true,
  payments: [
    { paymentId: 'lead-invoice-a', eventId: 'evt-synthetic', ledgerRole: 'client_receivable', invoiceTotal: 1000, amountPaid: 0, balanceDue: 1000, paymentStatus: 'Invoice Sent' },
    { paymentId: 'lead-invoice-b', eventId: 'evt-synthetic', ledgerRole: 'client_receivable', invoiceTotal: 1000, amountPaid: 0, balanceDue: 1000, paymentStatus: 'Invoice Sent' },
    { paymentId: 'lead-vendor', eventId: 'evt-synthetic', lineLabel: 'Elevated staging vendor', invoiceTotal: 250, amountPaid: 0, balanceDue: 250, paymentStatus: 'Invoice Sent' }
  ],
  payouts: []
});
assert.equal(completeExpenses.money.forecastMarginCents, 175000);
assert.equal(flow.payments.every((row) => row.bankVerified === false), true);

const linked = buildLedger({
  payments: [
    { paymentId: 'pay-vendor', eventId: 'evt-nium-2026', lineLabel: 'Elevated vendor expense', invoiceTotal: 2200, amountPaid: 0, balanceDue: 2200, paymentStatus: 'Invoice Sent' }
  ],
  payouts: [
    { payoutId: 'po-same-amount', eventId: 'evt-nium-2026', payoutType: 'Vendor', amount: 2200, status: 'Planned' },
    { payoutId: 'po-linked', eventId: 'evt-nium-2026', payoutType: 'Vendor', amount: 2200, status: 'Planned', linkedPaymentId: 'pay-vendor' }
  ]
});
assert.equal(linked.counts.payoutsExcludedAsDuplicateExpense, 1);
assert.equal(linked.counts.amountOverlapsNotMerged, 1);

const markedById = buildLedger({
  payments: [
    { paymentId: 'PAY-evt-nium-2026', eventId: 'evt-nium-2026', invoiceTotal: 50578.38, amountPaid: 50578.38, balanceDue: 0, paymentStatus: 'Paid In Full' },
    { paymentId: 'PAY-evt-nium-2026-elevated-final-20261016', eventId: 'evt-nium-2026', invoiceTotal: 4120.20, amountPaid: 4120.20, balanceDue: 0, paymentStatus: 'Payment Initiated' },
    { paymentId: 'PAY-evt-ows-20261130-venetian-heo-1350064', eventId: 'evt-ows-20261130', invoiceTotal: 11134.34, amountPaid: 0, balanceDue: 11134.34, paymentStatus: 'Awaiting Approval' }
  ],
  payouts: []
});
const markedNium = markedById.byEvent.find((row) => row.eventId === 'evt-nium-2026');
assert.equal(markedById.counts.vendorBills, 2);
assert.equal(markedById.counts.clientInvoices, 1);
assert.equal(markedNium.invoiceTotalCents, 5057838);
assert.equal(markedNium.collectedCents, 5057838);
assert.equal(markedNium.outstandingCents, 0);
assert.equal(markedById.money.verifiedClientReceiptsCents, 5057838);

const exceptions = documentedExceptions();
assert.equal(exceptions.every((row) => row.includedInTotals === false), true);
assert.equal(exceptions.find((row) => row.id === 'nium-decks-documentation').amountCents, 41851);
assert.equal(exceptions.find((row) => row.id === 'neo-21fun-reconciliation').amountCents, 36562);
const withDecks = buildLedger({
  payments: [
    { paymentId: 'PAY-evt-nium-2026', eventId: 'evt-nium-2026', invoiceTotal: 50578.38, amountPaid: 50578.38, balanceDue: 0, paymentStatus: 'Paid In Full' },
    { paymentId: 'PAY-evt-nium-2026-additional-decks-20260927', eventId: 'evt-nium-2026', invoiceTotal: 1353.39, amountPaid: 1353.39, balanceDue: 0, paymentStatus: 'Paid In Full' }
  ],
  payouts: []
});
assert.equal(withDecks.money.verifiedClientReceiptsCents, 5057838 + 135339);
assert.notEqual(withDecks.money.verifiedClientReceiptsCents, 5057838 + 135339 - 41851);

console.log('Event finance and source-status tests passed.');
