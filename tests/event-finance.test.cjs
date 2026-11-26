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
assert.equal(sourceStatus({ status: 'HEALTHY', connected: true, lastSuccess: '2026-11-05T05:36:06Z' }), 'HEALTHY');
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
assert.equal(flow.counts.issuedInvoices, 2);
assert.equal(flow.counts.notInvoicedRows, 0);
const placeholders = buildLedger({
  payments: [
    { paymentId: 'placeholder', eventId: 'evt-placeholder', ledgerRole: 'client_receivable', invoiceTotal: 10, amountPaid: 0, balanceDue: 10, paymentStatus: 'Not Invoiced' },
    { paymentId: 'issued', eventId: 'evt-placeholder', ledgerRole: 'client_receivable', invoiceTotal: 20, amountPaid: 0, balanceDue: 20, paymentStatus: 'Invoice Sent' },
    { paymentId: 'unknown-status', eventId: 'evt-placeholder', ledgerRole: 'client_receivable', invoiceTotal: 5, amountPaid: 0, balanceDue: 5, paymentStatus: 'Outcome Unverified' }
  ],
  payouts: []
});
assert.equal(placeholders.counts.clientPaymentRows, 3);
assert.equal(placeholders.counts.issuedInvoices, 1);
assert.equal(placeholders.counts.notInvoicedRows, 1);
assert.equal(placeholders.counts.unknownInvoiceRows, 1);
assert.equal(placeholders.money.drawableCashCents, null);
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
assert.equal(completeExpenses.money.forecastMarginCents, null);
assert.match(completeExpenses.money.profitReason, /Tax treatment is not established/);
const taxedExpenses = buildLedger({
  expensesComplete: true,
  taxEstablished: true,
  payments: completeExpenses.payments.map((row) => ({
    paymentId: row.paymentId,
    eventId: row.eventId,
    ledgerRole: row.role,
    lineLabel: row.lineLabel,
    invoiceTotal: row.invoiceTotalCents / 100,
    amountPaid: row.amountPaidCents / 100,
    balanceDue: row.balanceDueCents / 100,
    paymentStatus: row.paymentStatus
  })),
  payouts: []
});
assert.equal(taxedExpenses.money.forecastMarginCents, 175000);
assert.equal(taxedExpenses.money.drawableCashCents, null);
assert.equal(taxedExpenses.money.verifiedContributionCents, null);
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
const samePayment = buildLedger({
  payments: [
    { paymentId: 'pay-copy', eventId: 'evt-copy', ledgerRole: 'client_receivable', invoiceTotal: 10, amountPaid: 10, balanceDue: 0, paymentStatus: 'Paid In Full' },
    { paymentId: 'pay-copy', eventId: 'evt-copy', ledgerRole: 'client_receivable', invoiceTotal: 10, amountPaid: 10, balanceDue: 0, paymentStatus: 'Paid In Full' }
  ],
  payouts: []
});
assert.equal(samePayment.money.verifiedClientReceiptsCents, 1000);
assert.deepEqual(samePayment.duplicatePaymentIds, ['pay-copy']);
assert.equal(samePayment.conflictPaymentIds.length, 0);
const clashingPayment = buildLedger({
  payments: [
    { paymentId: 'pay-clash', eventId: 'evt-copy', ledgerRole: 'client_receivable', invoiceTotal: 10, amountPaid: 10, balanceDue: 0, paymentStatus: 'Paid In Full' },
    { paymentId: 'pay-clash', eventId: 'evt-copy', ledgerRole: 'client_receivable', invoiceTotal: 25, amountPaid: 25, balanceDue: 0, paymentStatus: 'Paid In Full' }
  ],
  payouts: []
});
assert.equal(clashingPayment.money.verifiedClientReceiptsCents, null);
assert.equal(clashingPayment.money.coverage, 'incomplete');
assert.equal(clashingPayment.money.incompleteFields.includes('verifiedClientReceipts'), true);
assert.deepEqual(clashingPayment.conflictPaymentIds, ['pay-clash']);
assert.equal(clashingPayment.duplicatePaymentIds.includes('pay-clash'), false);
assert.equal(clashingPayment.payments.every((row) => row.includedInTotals === false), true);
const unknownAmount = buildLedger({
  payments: [
    { paymentId: 'pay-missing', eventId: 'evt-copy', ledgerRole: 'client_receivable', invoiceTotal: 10, paymentStatus: 'Paid In Full' }
  ],
  payouts: []
});
assert.equal(unknownAmount.money.verifiedClientReceiptsCents, null);
const zeroAmount = buildLedger({
  payments: [
    { paymentId: 'pay-zero', eventId: 'evt-copy', ledgerRole: 'client_receivable', invoiceTotal: 10, amountPaid: 0, balanceDue: 10, paymentStatus: 'Paid In Full' }
  ],
  payouts: []
});
assert.equal(zeroAmount.money.verifiedClientReceiptsCents, 0);
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

const missingId = buildLedger({
  payments: [
    { eventId: 'evt-copy', ledgerRole: 'client_receivable', invoiceTotal: 10, amountPaid: 10, balanceDue: 0, paymentStatus: 'Paid In Full' }
  ],
  payouts: [
    { eventId: 'evt-copy', payoutType: 'Vendor', amount: 4, status: 'Planned' }
  ]
});
assert.equal(missingId.counts.missingPaymentIds, 1);
assert.equal(missingId.counts.missingPayoutIds, 1);
assert.equal(missingId.payments[0].includedInTotals, false);
assert.equal(missingId.payouts[0].includedInTotals, false);
assert.equal(missingId.money.verifiedClientReceiptsCents, null);
assert.equal(missingId.money.payoutObligationCents, null);
assert.equal(missingId.money.coverage, 'incomplete');

const wrongLink = buildLedger({
  payments: [
    { paymentId: 'inv-client', eventId: 'evt-a', ledgerRole: 'client_receivable', invoiceTotal: 100, amountPaid: 100, balanceDue: 0, paymentStatus: 'Paid In Full' }
  ],
  payouts: [
    { payoutId: 'po-vendor', eventId: 'evt-a', payoutType: 'Vendor', amount: 40, status: 'Planned', linkedPaymentId: 'inv-client' }
  ]
});
assert.equal(wrongLink.counts.payoutsExcludedAsDuplicateExpense, 0);
assert.equal(wrongLink.payouts[0].linkUnresolved, true);
assert.equal(wrongLink.money.payoutObligationCents, 4000);
assert.equal(wrongLink.money.forecastMarginCents, null);

const otherEvent = buildLedger({
  payments: [
    { paymentId: 'vendor-elsewhere', eventId: 'evt-b', lineLabel: 'Elevated vendor', invoiceTotal: 40, amountPaid: 0, balanceDue: 40, paymentStatus: 'Invoice Sent' }
  ],
  payouts: [
    { payoutId: 'po-here', eventId: 'evt-a', payoutType: 'Vendor', amount: 40, status: 'Planned', linkedPaymentId: 'vendor-elsewhere' }
  ]
});
assert.equal(otherEvent.payouts[0].duplicatesPayment, false);
assert.equal(otherEvent.money.payoutObligationCents, 4000);

const gross = buildLedger({
  expensesComplete: true,
  taxEstablished: true,
  payments: [
    { paymentId: 'inv-a', eventId: 'evt-a', ledgerRole: 'client_receivable', invoiceTotal: 1000, amountPaid: 1000, balanceDue: 0, paymentStatus: 'Paid In Full' },
    { paymentId: 'inv-b', eventId: 'evt-a', ledgerRole: 'client_receivable', invoiceTotal: 500, amountPaid: 0, balanceDue: 500, paymentStatus: 'Invoice Sent' },
    { paymentId: 'vendor-bill', eventId: 'evt-a', lineLabel: 'Elevated vendor', invoiceTotal: 200, amountPaid: 0, balanceDue: 200, paymentStatus: 'Invoice Sent' }
  ],
  payouts: [
    { payoutId: 'po-vendor', eventId: 'evt-a', payoutType: 'Vendor', amount: 80, status: 'Planned' },
    { payoutId: 'po-owner', eventId: 'evt-a', payoutType: 'Owner distribution', amount: 300, status: 'Planned' }
  ]
});
assert.equal(gross.money.forecastMarginCents, 122000);
assert.notEqual(gross.money.forecastMarginCents, 92000);
assert.equal(gross.money.drawableCashCents, null);
assert.notEqual(gross.money.verifiedContributionCents, 100000);
assert.equal(gross.money.verifiedContributionCents, null);
assert.equal(gross.money.ownerPlannedCents, 30000);
const settledLedger = buildLedger({
  expensesComplete: true,
  taxEstablished: true,
  payments: [
    { paymentId: 'inv-paid', eventId: 'evt-a', ledgerRole: 'client_receivable', invoiceTotal: 1000, amountPaid: 1000, balanceDue: 0, paymentStatus: 'Paid In Full' },
    { paymentId: 'vendor-paid', eventId: 'evt-a', lineLabel: 'Elevated vendor', invoiceTotal: 200, amountPaid: 200, balanceDue: 0, paymentStatus: 'Paid In Full' }
  ],
  payouts: [
    { payoutId: 'po-vendor-paid', eventId: 'evt-a', payoutType: 'Vendor', amount: 80, status: 'Paid' },
    { payoutId: 'po-owner-paid', eventId: 'evt-a', payoutType: 'Owner distribution', amount: 300, status: 'Paid' }
  ]
});
assert.equal(settledLedger.money.drawableCashCents, null);
assert.equal(settledLedger.payments.every((row) => row.bankVerified === false), true);
assert.equal(settledLedger.money.verifiedContributionCents, 42000);
assert.notEqual(settledLedger.money.verifiedContributionCents, settledLedger.money.drawableCashCents);
const overlapped = buildLedger({
  expensesComplete: true,
  taxEstablished: true,
  payments: gross.payments.map((row) => ({
    paymentId: row.paymentId,
    eventId: row.eventId,
    ledgerRole: row.role,
    lineLabel: row.lineLabel,
    invoiceTotal: row.invoiceTotalCents / 100,
    amountPaid: row.amountPaidCents / 100,
    balanceDue: row.balanceDueCents / 100,
    paymentStatus: row.paymentStatus
  })),
  payouts: [
    { payoutId: 'po-vendor', eventId: 'evt-a', payoutType: 'Vendor', amount: 200, status: 'Planned' },
    { payoutId: 'po-owner', eventId: 'evt-a', payoutType: 'Owner distribution', amount: 300, status: 'Planned' }
  ]
});
assert.equal(overlapped.counts.amountOverlapsNotMerged, 1);
assert.equal(overlapped.money.forecastMarginCents, null);
assert.equal(overlapped.money.drawableCashCents, null);

// R10 / T18 — financial classification and reconciliation safeguards
const sameAmountDistinct = buildLedger({
  payments: [
    { paymentId: 'inv-a', eventId: 'evt-same', ledgerRole: 'client_receivable', invoiceTotal: 5000, amountPaid: 0, balanceDue: 5000, paymentStatus: 'Invoice Sent' },
    { paymentId: 'inv-b', eventId: 'evt-same', ledgerRole: 'client_receivable', invoiceTotal: 5000, amountPaid: 0, balanceDue: 5000, paymentStatus: 'Invoice Sent' }
  ],
  payouts: []
});
assert.equal(sameAmountDistinct.counts.clientInvoices, 2);
assert.equal(sameAmountDistinct.counts.issuedInvoices, 2);
assert.equal(sameAmountDistinct.money.clientInvoiceTotalCents, 1000000);
assert.notEqual(sameAmountDistinct.payments[0].paymentId, sameAmountDistinct.payments[1].paymentId);

const initiatedVsReceived = buildLedger({
  payments: [
    { paymentId: 'paid-row', eventId: 'evt-flow', ledgerRole: 'client_receivable', invoiceTotal: 100, amountPaid: 100, balanceDue: 0, paymentStatus: 'Paid In Full' },
    { paymentId: 'initiated-row', eventId: 'evt-flow', ledgerRole: 'client_receivable', invoiceTotal: 40, amountPaid: 40, balanceDue: 40, paymentStatus: 'Payment Initiated' }
  ],
  payouts: []
});
assert.equal(initiatedVsReceived.money.verifiedClientReceiptsCents, 10000);
assert.equal(initiatedVsReceived.money.initiatedNotSettledCents, 4000);
assert.equal(initiatedVsReceived.money.bankSettlementVerified, false);
assert.equal(initiatedVsReceived.money.drawableCashCents, null);

const refundLedger = buildLedger({
  expensesComplete: true,
  taxEstablished: true,
  payments: [
    { paymentId: 'kept', eventId: 'evt-refund', ledgerRole: 'client_receivable', invoiceTotal: 1000, amountPaid: 1000, balanceDue: 0, paymentStatus: 'Paid In Full' },
    { paymentId: 'refunded', eventId: 'evt-refund', ledgerRole: 'client_receivable', invoiceTotal: 200, amountPaid: 200, balanceDue: 0, paymentStatus: 'Refunded' }
  ],
  payouts: []
});
assert.equal(refundLedger.counts.refundedClientRows, 1);
assert.equal(refundLedger.counts.unresolvedRefundRows, 1);
assert.equal(refundLedger.counts.issuedInvoices, 1);
assert.equal(refundLedger.money.verifiedClientReceiptsCents, 100000);
assert.equal(refundLedger.money.refundedClientCents, null);
assert.equal(refundLedger.money.clientInvoiceTotalCents, 100000);
assert.equal(refundLedger.money.forecastMarginCents, null);
assert.equal(refundLedger.money.verifiedContributionCents, null);
assert.equal(refundLedger.money.coverage, 'incomplete');
assert.equal(refundLedger.money.incompleteFields.includes('refundTreatment'), true);
assert.match(refundLedger.money.profitReason, /Unresolved refund/);
assert.deepEqual(refundLedger.money.unresolvedRefundIds, ['refunded']);
assert.equal(refundLedger.money.drawableCashCents, null);
assert.equal(refundLedger.money.bankSettlementVerified, false);

const separateClientRefund = buildLedger({
  expensesComplete: true,
  taxEstablished: true,
  payments: [
    { paymentId: 'receipt-full', eventId: 'evt-client-refund', ledgerRole: 'client_receivable', invoiceTotal: 800, amountPaid: 800, balanceDue: 0, paymentStatus: 'Paid In Full' },
    { paymentId: 'refund-separate', eventId: 'evt-client-refund', ledgerRole: 'client_receivable', invoiceTotal: 150, amountPaid: 150, balanceDue: 0, paymentStatus: 'Refunded' }
  ],
  payouts: []
});
assert.equal(separateClientRefund.money.verifiedClientReceiptsCents, 80000);
assert.equal(separateClientRefund.money.forecastMarginCents, null);
assert.equal(separateClientRefund.money.verifiedContributionCents, null);
assert.equal(separateClientRefund.money.incompleteFields.includes('refundTreatment'), true);
assert.equal(separateClientRefund.money.drawableCashCents, null);
assert.notEqual(separateClientRefund.money.verifiedClientReceiptsCents - 15000, separateClientRefund.money.verifiedContributionCents);

const ambiguousPartialRefund = buildLedger({
  expensesComplete: true,
  taxEstablished: true,
  payments: [
    { paymentId: 'receipt-partial-base', eventId: 'evt-partial-refund', ledgerRole: 'client_receivable', invoiceTotal: 500, amountPaid: 500, balanceDue: 0, paymentStatus: 'Paid In Full' },
    { paymentId: 'refund-partial', eventId: 'evt-partial-refund', ledgerRole: 'client_receivable', paymentStatus: 'Partial Refund', refundOfPaymentId: 'receipt-partial-base', refundDirection: 'client_outflow' }
  ],
  payouts: []
});
assert.equal(ambiguousPartialRefund.counts.unresolvedRefundRows, 1);
assert.equal(ambiguousPartialRefund.money.forecastMarginCents, null);
assert.equal(ambiguousPartialRefund.money.verifiedContributionCents, null);
assert.equal(ambiguousPartialRefund.money.refundedClientCents, null);
assert.equal(ambiguousPartialRefund.money.coverage, 'incomplete');
assert.match(ambiguousPartialRefund.money.profitReason, /Unresolved refund/);
assert.equal(ambiguousPartialRefund.money.drawableCashCents, null);

const vendorRefundUnresolved = buildLedger({
  expensesComplete: true,
  taxEstablished: true,
  payments: [
    { paymentId: 'client-ok', eventId: 'evt-vendor-refund', ledgerRole: 'client_receivable', invoiceTotal: 1000, amountPaid: 1000, balanceDue: 0, paymentStatus: 'Paid In Full' },
    { paymentId: 'vendor-bill', eventId: 'evt-vendor-refund', lineLabel: 'Elevated vendor', invoiceTotal: 300, amountPaid: 300, balanceDue: 0, paymentStatus: 'Paid In Full' },
    { paymentId: 'vendor-refund', eventId: 'evt-vendor-refund', lineLabel: 'Elevated vendor', invoiceTotal: 50, amountPaid: 50, balanceDue: 0, paymentStatus: 'Refunded' }
  ],
  payouts: []
});
assert.equal(vendorRefundUnresolved.counts.refundedVendorRows, 1);
assert.equal(vendorRefundUnresolved.counts.unresolvedRefundRows, 1);
assert.equal(vendorRefundUnresolved.money.vendorCommittedCents, 30000);
assert.equal(vendorRefundUnresolved.money.forecastMarginCents, null);
assert.equal(vendorRefundUnresolved.money.verifiedContributionCents, null);
assert.equal(vendorRefundUnresolved.money.refundedVendorCents, null);
assert.equal(vendorRefundUnresolved.money.incompleteFields.includes('refundTreatment'), true);
assert.deepEqual(vendorRefundUnresolved.money.unresolvedRefundIds, ['vendor-refund']);
assert.equal(vendorRefundUnresolved.money.drawableCashCents, null);

const evidencedClientRefund = buildLedger({
  expensesComplete: true,
  taxEstablished: true,
  payments: [
    { paymentId: 'receipt-linked', eventId: 'evt-evidenced-refund', ledgerRole: 'client_receivable', invoiceTotal: 1000, amountPaid: 1000, balanceDue: 0, paymentStatus: 'Paid In Full' },
    {
      paymentId: 'refund-linked',
      eventId: 'evt-evidenced-refund',
      ledgerRole: 'client_receivable',
      invoiceTotal: 200,
      amountPaid: 200,
      balanceDue: 0,
      paymentStatus: 'Refunded',
      refundOfPaymentId: 'receipt-linked',
      refundDirection: 'client_outflow'
    }
  ],
  payouts: []
});
assert.equal(evidencedClientRefund.counts.unresolvedRefundRows, 0);
assert.equal(evidencedClientRefund.counts.refundRows, 1);
assert.equal(evidencedClientRefund.money.verifiedClientReceiptsCents, 100000);
assert.equal(evidencedClientRefund.money.forecastMarginCents, null, 'linked refund must not leave profitability available while excluding its effect');
assert.equal(evidencedClientRefund.money.verifiedContributionCents, null, 'linked refund must not leave contribution available while excluding its effect');
assert.equal(evidencedClientRefund.money.refundedClientCents, null);
assert.equal(evidencedClientRefund.money.incompleteFields.includes('refundTreatment'), true);
assert.match(evidencedClientRefund.money.profitReason, /Refund accounting is not established/);
assert.notEqual(evidencedClientRefund.money.verifiedContributionCents, 100000);
assert.notEqual(evidencedClientRefund.money.verifiedContributionCents, 80000);
assert.equal(evidencedClientRefund.money.drawableCashCents, null);

const refundedFeeBlocksProfit = buildLedger({
  expensesComplete: true,
  taxEstablished: true,
  payments: [
    { paymentId: 'client-settled', eventId: 'evt-fee-refund', ledgerRole: 'client_receivable', invoiceTotal: 1000, amountPaid: 1000, balanceDue: 0, paymentStatus: 'Paid In Full' },
    { paymentId: 'vendor-settled', eventId: 'evt-fee-refund', lineLabel: 'Elevated vendor', invoiceTotal: 200, amountPaid: 200, balanceDue: 0, paymentStatus: 'Paid In Full' },
    { paymentId: 'fee-original', eventId: 'evt-fee-refund', ledgerRole: 'fee', invoiceTotal: 50, amountPaid: 50, balanceDue: 0, paymentStatus: 'Paid In Full' },
    {
      paymentId: 'fee-refunded',
      eventId: 'evt-fee-refund',
      ledgerRole: 'fee',
      invoiceTotal: 50,
      amountPaid: 50,
      balanceDue: 0,
      paymentStatus: 'Refunded',
      refundOfPaymentId: 'fee-original',
      refundDirection: 'vendor_inflow'
    }
  ],
  payouts: []
});
assert.equal(refundedFeeBlocksProfit.counts.refundRows, 1);
assert.equal(refundedFeeBlocksProfit.money.verifiedClientReceiptsCents, 100000);
assert.equal(refundedFeeBlocksProfit.money.forecastMarginCents, null);
assert.equal(refundedFeeBlocksProfit.money.verifiedContributionCents, null);
assert.equal(refundedFeeBlocksProfit.money.incompleteFields.includes('refundTreatment'), true);
assert.equal(refundedFeeBlocksProfit.money.coverage, 'incomplete');
assert.match(refundedFeeBlocksProfit.money.profitReason, /Refund accounting is not established|Unresolved refund/);
assert.equal(refundedFeeBlocksProfit.money.drawableCashCents, null);
assert.equal(refundedFeeBlocksProfit.conflictPaymentIds.length, 0);

const refundedTaxBlocksProfit = buildLedger({
  expensesComplete: true,
  taxEstablished: true,
  payments: [
    { paymentId: 'client-settled-tax', eventId: 'evt-tax-refund', ledgerRole: 'client_receivable', invoiceTotal: 1000, amountPaid: 1000, balanceDue: 0, paymentStatus: 'Paid In Full' },
    { paymentId: 'vendor-settled-tax', eventId: 'evt-tax-refund', lineLabel: 'Elevated vendor', invoiceTotal: 200, amountPaid: 200, balanceDue: 0, paymentStatus: 'Paid In Full' },
    { paymentId: 'tax-original', eventId: 'evt-tax-refund', ledgerRole: 'tax', invoiceTotal: 35, amountPaid: 35, balanceDue: 0, paymentStatus: 'Paid In Full' },
    {
      paymentId: 'tax-refunded',
      eventId: 'evt-tax-refund',
      ledgerRole: 'tax',
      invoiceTotal: 35,
      amountPaid: 35,
      balanceDue: 0,
      paymentStatus: 'Refunded',
      refundOfPaymentId: 'tax-original',
      refundDirection: 'vendor_inflow'
    }
  ],
  payouts: []
});
assert.equal(refundedTaxBlocksProfit.counts.refundRows, 1);
assert.equal(refundedTaxBlocksProfit.money.forecastMarginCents, null);
assert.equal(refundedTaxBlocksProfit.money.verifiedContributionCents, null);
assert.equal(refundedTaxBlocksProfit.money.incompleteFields.includes('refundTreatment'), true);
assert.equal(refundedTaxBlocksProfit.money.incompleteFields.includes('forecastMargin'), true);
assert.equal(refundedTaxBlocksProfit.money.incompleteFields.includes('verifiedContribution'), true);
assert.equal(refundedTaxBlocksProfit.money.coverage, 'incomplete');
assert.match(refundedTaxBlocksProfit.money.profitReason, /Refund accounting is not established|Unresolved refund/);
assert.equal(refundedTaxBlocksProfit.money.drawableCashCents, null);
assert.equal(refundedTaxBlocksProfit.conflictPaymentIds.length, 0);
assert.equal(refundedTaxBlocksProfit.counts.missingPaymentIds, 0);

const feeTaxLedger = buildLedger({
  expensesComplete: true,
  taxEstablished: true,
  payments: [
    { paymentId: 'client-paid', eventId: 'evt-fee', ledgerRole: 'client_receivable', invoiceTotal: 1000, amountPaid: 1000, balanceDue: 0, paymentStatus: 'Paid In Full' },
    { paymentId: 'vendor-paid', eventId: 'evt-fee', lineLabel: 'Elevated vendor', invoiceTotal: 200, amountPaid: 200, balanceDue: 0, paymentStatus: 'Paid In Full' },
    { paymentId: 'fee-paid', eventId: 'evt-fee', ledgerRole: 'fee', invoiceTotal: 50, amountPaid: 50, balanceDue: 0, paymentStatus: 'Paid In Full' },
    { paymentId: 'tax-open', eventId: 'evt-fee', ledgerRole: 'tax', invoiceTotal: 35, amountPaid: 0, balanceDue: 35, paymentStatus: 'Invoice Sent' }
  ],
  payouts: []
});
assert.equal(feeTaxLedger.counts.feeTaxRows, 2);
assert.equal(feeTaxLedger.money.feeTaxCommittedCents, 8500);
assert.equal(feeTaxLedger.money.forecastMarginCents, 71500);
assert.equal(feeTaxLedger.money.verifiedContributionCents, null, 'open tax obligation blocks contribution');
assert.equal(feeTaxLedger.money.drawableCashCents, null);

const feeTaxSettled = buildLedger({
  expensesComplete: true,
  taxEstablished: true,
  payments: [
    { paymentId: 'client-paid', eventId: 'evt-fee', ledgerRole: 'client_receivable', invoiceTotal: 1000, amountPaid: 1000, balanceDue: 0, paymentStatus: 'Paid In Full' },
    { paymentId: 'vendor-paid', eventId: 'evt-fee', lineLabel: 'Elevated vendor', invoiceTotal: 200, amountPaid: 200, balanceDue: 0, paymentStatus: 'Paid In Full' },
    { paymentId: 'fee-paid', eventId: 'evt-fee', ledgerRole: 'fee', invoiceTotal: 50, amountPaid: 50, balanceDue: 0, paymentStatus: 'Paid In Full' },
    { paymentId: 'tax-paid', eventId: 'evt-fee', ledgerRole: 'tax', invoiceTotal: 35, amountPaid: 35, balanceDue: 0, paymentStatus: 'Paid In Full' }
  ],
  payouts: []
});
assert.equal(feeTaxSettled.money.forecastMarginCents, 71500);
assert.equal(feeTaxSettled.money.verifiedContributionCents, 71500);
assert.equal(feeTaxSettled.money.drawableCashCents, null);
assert.equal(feeTaxSettled.money.bankSettlementVerified, false);

const noAutoTax = buildLedger({
  expensesComplete: true,
  payments: [
    { paymentId: 'client-only', eventId: 'evt-tax', ledgerRole: 'client_receivable', invoiceTotal: 1000, amountPaid: 0, balanceDue: 1000, paymentStatus: 'Invoice Sent' }
  ],
  payouts: []
});
assert.equal(noAutoTax.money.forecastMarginCents, null);
assert.match(noAutoTax.money.profitReason, /Tax treatment is not established/);
assert.equal(noAutoTax.money.drawableCashCents, null);

const negativeProfit = buildLedger({
  expensesComplete: true,
  taxEstablished: true,
  payments: [
    { paymentId: 'small-client', eventId: 'evt-loss', ledgerRole: 'client_receivable', invoiceTotal: 100, amountPaid: 100, balanceDue: 0, paymentStatus: 'Paid In Full' },
    { paymentId: 'large-vendor', eventId: 'evt-loss', lineLabel: 'Elevated vendor', invoiceTotal: 500, amountPaid: 500, balanceDue: 0, paymentStatus: 'Paid In Full' }
  ],
  payouts: []
});
assert.equal(negativeProfit.money.forecastMarginCents, -40000);
assert.ok(negativeProfit.money.forecastMarginCents < 0);
assert.equal(negativeProfit.money.verifiedContributionCents, -40000);
assert.equal(negativeProfit.money.drawableCashCents, null);

const missingCost = buildLedger({
  expensesComplete: true,
  taxEstablished: true,
  payments: [
    { paymentId: 'client-ok', eventId: 'evt-gap', ledgerRole: 'client_receivable', invoiceTotal: 1000, amountPaid: 0, balanceDue: 1000, paymentStatus: 'Invoice Sent' },
    { paymentId: 'vendor-gap', eventId: 'evt-gap', lineLabel: 'Elevated vendor', paymentStatus: 'Invoice Sent' }
  ],
  payouts: []
});
assert.equal(missingCost.money.forecastMarginCents, null);
assert.equal(missingCost.money.coverage, 'incomplete');
assert.equal(missingCost.money.incompleteFields.includes('vendorCommitted'), true);
assert.equal(missingCost.money.drawableCashCents, null);

const ownerNotExpense = buildLedger({
  expensesComplete: true,
  taxEstablished: true,
  payments: [
    { paymentId: 'client', eventId: 'evt-own', ledgerRole: 'client_receivable', invoiceTotal: 1000, amountPaid: 1000, balanceDue: 0, paymentStatus: 'Paid In Full' },
    { paymentId: 'vendor', eventId: 'evt-own', lineLabel: 'Elevated vendor', invoiceTotal: 200, amountPaid: 200, balanceDue: 0, paymentStatus: 'Paid In Full' }
  ],
  payouts: [
    { payoutId: 'draw', eventId: 'evt-own', payoutType: 'Owner distribution', amount: 300, status: 'Paid' }
  ]
});
assert.equal(ownerNotExpense.money.forecastMarginCents, 80000);
assert.notEqual(ownerNotExpense.money.forecastMarginCents, 50000);
assert.equal(ownerNotExpense.money.verifiedContributionCents, 50000);
assert.equal(ownerNotExpense.money.ownerPaidCents, 30000);
assert.equal(ownerNotExpense.money.drawableCashCents, null);

const explicitOverlapLink = buildLedger({
  expensesComplete: true,
  taxEstablished: true,
  payments: [
    { paymentId: 'client', eventId: 'evt-link', ledgerRole: 'client_receivable', invoiceTotal: 1000, amountPaid: 0, balanceDue: 1000, paymentStatus: 'Invoice Sent' },
    { paymentId: 'vendor-bill', eventId: 'evt-link', lineLabel: 'Elevated vendor', invoiceTotal: 220, amountPaid: 0, balanceDue: 220, paymentStatus: 'Invoice Sent' }
  ],
  payouts: [
    { payoutId: 'linked-once', eventId: 'evt-link', payoutType: 'Vendor', amount: 220, status: 'Planned', linkedPaymentId: 'vendor-bill' },
    { payoutId: 'amount-only', eventId: 'evt-link', payoutType: 'Vendor', amount: 220, status: 'Planned' }
  ]
});
assert.equal(explicitOverlapLink.counts.payoutsExcludedAsDuplicateExpense, 1);
assert.equal(explicitOverlapLink.counts.amountOverlapsNotMerged, 1);
assert.equal(explicitOverlapLink.money.forecastMarginCents, null);
assert.equal(explicitOverlapLink.money.drawableCashCents, null);

const noAuthoritativeRewrite = documentedExceptions();
assert.equal(noAuthoritativeRewrite.every((row) => row.includedInTotals === false), true);
const decksUnadjusted = buildLedger({
  payments: [
    { paymentId: 'PAY-evt-nium-2026', eventId: 'evt-nium-2026', invoiceTotal: 50578.38, amountPaid: 50578.38, balanceDue: 0, paymentStatus: 'Paid In Full' },
    { paymentId: 'PAY-evt-nium-2026-additional-decks-20260927', eventId: 'evt-nium-2026', invoiceTotal: 1353.39, amountPaid: 1353.39, balanceDue: 0, paymentStatus: 'Paid In Full' }
  ],
  payouts: []
});
assert.equal(decksUnadjusted.money.verifiedClientReceiptsCents, 5057838 + 135339);
assert.notEqual(decksUnadjusted.money.verifiedClientReceiptsCents, 5057838 + 135339 - 41851);

console.log('Event finance and source-status tests passed.');
