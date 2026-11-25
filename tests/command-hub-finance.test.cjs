const assert = require('node:assert/strict');
const finance = require('../public/v2/js/ledger-finance.js');

const niumMain = {
  paymentId: 'PAY-evt-nium-2026',
  eventId: 'evt-nium-2026',
  invoiceNumber: 'INV-000839',
  invoiceTotal: 50578.38,
  amountPaid: 50578.38,
  paymentStatus: 'Paid In Full'
};
const niumDecks = {
  paymentId: 'PAY-evt-nium-decks',
  eventId: 'evt-nium-2026',
  invoiceNumber: 'INV-000847',
  invoiceTotal: 1353.39,
  amountPaid: 1353.39,
  paymentStatus: 'Paid In Full'
};
const elevated = {
  paymentId: 'PAY-evt-nium-elevated',
  eventId: 'evt-nium-2026',
  invoiceNumber: 'Elevated vendor expense',
  invoiceTotal: 3740.89,
  amountPaid: 3740.89,
  paymentStatus: 'Payment Initiated'
};
const certapro = {
  paymentId: 'PAY-evt-certapro-painters-20270224',
  eventId: 'evt-certapro-painters-20270224',
  invoiceNumber: '227282',
  invoiceTotal: 11281.50,
  amountPaid: 0,
  paymentStatus: 'Payment Initiated'
};
const mentionedVendor = {
  paymentId: 'PAY-evt-lineaje-2026',
  eventId: 'evt-lineaje-2026',
  invoiceNumber: 'LINEAJE-MAIN',
  invoiceTotal: 10491.25,
  amountPaid: 10491.25,
  paymentStatus: 'Paid In Full',
  notes: 'Client paid in full. Vendor expense complete on a separate row.'
};

const summary = finance.summarize(
  [niumMain, niumDecks, niumMain, elevated, certapro, mentionedVendor],
  [{ payoutId: 'S7WXQ', eventId: 'evt-nium-2026', payee: 'Staff', amount: 1500, status: 'Paid' }]
);

assert.equal(summary.rows.length, 5, 'a repeated payment id is kept once');
assert.equal(summary.clientInvoiceCount, 4);
assert.equal(summary.vendorExpenseInPayments, 3740.89);
assert.equal(summary.clientLedgerReceived, 50578.38 + 1353.39 + 10491.25);
assert.equal(summary.initiatedNotSettled, 11281.50);
assert.equal(summary.rows.find(row => row.paymentId === elevated.paymentId).countsAsClientReceived, 0);
assert.equal(summary.rows.find(row => row.paymentId === certapro.paymentId).settlement, 'initiated_not_settled');
assert.equal(summary.payoutLedgerTotal, 1500);
assert.equal(summary.clientLedgerReceived === summary.clientInvoiced, false);
assert.equal(summary.profitComputed, false);
assert.equal(summary.bankConfirmed, false);
assert.equal(finance.party(mentionedVendor), 'client_invoice');

console.log('command-hub-finance: ok');
