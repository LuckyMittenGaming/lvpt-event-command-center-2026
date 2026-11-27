const assert = require('node:assert/strict');
const finance = require('../public/v2/js/event-finance.js');

// Successor coverage for the retired ledger-finance.js hub fixtures.
// event-finance.js is the authoritative Payments-tab classifier (cents, roles, settlements).

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

const ledger = finance.buildLedger({
  payments: [niumMain, niumDecks, niumMain, elevated, certapro, mentionedVendor],
  payouts: [{ payoutId: 'S7WXQ', eventId: 'evt-nium-2026', payee: 'Staff', amount: 1500, status: 'Paid' }]
});

const countable = ledger.payments.filter((row) => row.includedInTotals !== false);
assert.equal(countable.length, 5, 'a repeated payment id is kept once');
assert.equal(ledger.counts.clientInvoices, 4);
assert.equal(ledger.money.vendorCommittedCents, Math.round(3740.89 * 100));
assert.equal(
  ledger.money.verifiedClientReceiptsCents,
  Math.round((50578.38 + 1353.39 + 10491.25) * 100)
);
assert.equal(ledger.money.initiatedNotSettledCents, Math.round(11281.50 * 100));

const elevatedRow = ledger.payments.find((row) => row.paymentId === elevated.paymentId);
assert.equal(elevatedRow.role, 'vendor_expense');
assert.equal(elevatedRow.settlement, 'initiated_not_settled');
assert.notEqual(elevatedRow.role, 'client_receivable', 'Elevated never counts as client receipt');

const certaproRow = ledger.payments.find((row) => row.paymentId === certapro.paymentId);
assert.equal(certaproRow.settlement, 'initiated_not_settled');

assert.equal(ledger.money.payoutPaidCents, Math.round(1500 * 100));
assert.notEqual(
  ledger.money.verifiedClientReceiptsCents,
  ledger.money.clientInvoiceTotalCents,
  'receipts and invoiced totals stay distinct when vendor/initiated rows exist'
);
assert.equal(ledger.money.forecastMarginCents, null, 'profit stays unavailable without expense completeness');
assert.equal(ledger.money.bankSettlementVerified, false);
assert.equal(ledger.payments.every((row) => row.bankVerified === false), true);

const mentionedRole = finance.inferRole(mentionedVendor).role;
assert.equal(mentionedRole, 'client_receivable', 'vendor mention in notes does not reclassify a client invoice');

console.log('command-hub-finance: ok');
