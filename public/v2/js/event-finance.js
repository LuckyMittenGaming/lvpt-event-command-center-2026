(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.LVPTEventFinance = api;
})(typeof window === 'undefined' ? null : window, function () {
  'use strict';

  const ROLES = ['client_receivable', 'vendor_expense', 'owner_distribution', 'tax', 'fee', 'unclassified'];

  function cents(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    return Math.round(value * 100);
  }

  function settlementKind(status) {
    const raw = String(status || '').trim();
    if (/^paid[\s-]*in[\s-]*full$/i.test(raw)) return 'ledger_settled';
    if (/refund/i.test(raw)) return 'refunded';
    if (/payment\s+initiated|processing|in\s+progress/i.test(raw)) return 'initiated_not_settled';
    if (/invoice\s+sent|awaiting\s+(?:deposit|payment)|balance\s+due|partial/i.test(raw)) return 'open';
    if (/^not invoiced$/i.test(raw)) return 'not_invoiced';
    return 'unknown';
  }

  function explicitRole(value) {
    const role = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
    if (role === 'client' || role === 'receivable' || role === 'client_invoice') return 'client_receivable';
    if (role === 'vendor' || role === 'expense' || role === 'vendor_bill') return 'vendor_expense';
    if (role === 'owner' || role === 'distribution' || role === 'owner_draw') return 'owner_distribution';
    if (ROLES.includes(role) && role !== 'unclassified') return role;
    return '';
  }

  function inferRole(row) {
    const declared = explicitRole(row.ledgerRole);
    if (declared) return { role: declared, roleSource: 'ledger_role' };
    const label = [row.lineLabel, row.counterparty, row.paymentType].filter(Boolean).join(' ');
    if (/\b(elevated|venetian|heo)\b/i.test(label)) return { role: 'vendor_expense', roleSource: 'named_vendor_marker' };
    if (/\b(owner\s+draw|owner\s+distribution)\b/i.test(label)) return { role: 'owner_distribution', roleSource: 'named_distribution_marker' };
    return { role: 'unclassified', roleSource: 'unconfirmed' };
  }

  function normalizePayment(row) {
    const identity = inferRole(row);
    const settlement = settlementKind(row.paymentStatus);
    return {
      paymentId: String(row.paymentId || ''),
      eventId: String(row.eventId || ''),
      invoiceNumber: String(row.invoiceNumber || ''),
      lineLabel: String(row.lineLabel || ''),
      counterparty: String(row.counterparty || ''),
      role: identity.role,
      roleSource: identity.roleSource,
      settlement,
      paymentStatus: String(row.paymentStatus || 'Unknown'),
      invoiceTotalCents: cents(row.invoiceTotal),
      amountPaidCents: cents(row.amountPaid),
      balanceDueCents: cents(row.balanceDue),
      bankVerified: false
    };
  }

  function sum(rows, pick) {
    let total = 0;
    let gaps = 0;
    rows.forEach((row) => {
      const value = pick(row);
      if (value === null) gaps += 1;
      else total += value;
    });
    return { cents: total, gaps };
  }

  function payoutRole(row) {
    const label = [row.payoutType, row.payee].filter(Boolean).join(' ');
    if (/\b(owner\s+draw|distribution|owner)\b/i.test(label)) return 'owner_distribution';
    return 'payout_obligation';
  }

  function buildLedger(input) {
    const payments = (Array.isArray(input && input.payments) ? input.payments : []).map(normalizePayment);
    const seen = new Set();
    const duplicatePaymentIds = [];
    payments.forEach((row) => {
      if (!row.paymentId) return;
      if (seen.has(row.paymentId)) duplicatePaymentIds.push(row.paymentId);
      seen.add(row.paymentId);
    });

    const vendorAmounts = new Map();
    payments.filter((row) => row.role === 'vendor_expense' && row.invoiceTotalCents !== null).forEach((row) => {
      const key = row.eventId + ':' + row.invoiceTotalCents;
      vendorAmounts.set(key, (vendorAmounts.get(key) || 0) + 1);
    });

    const payouts = (Array.isArray(input && input.payouts) ? input.payouts : []).map((row) => {
      const amount = cents(row.amount);
      const key = String(row.eventId || '') + ':' + amount;
      const duplicatesPayment = amount !== null && vendorAmounts.has(key);
      return {
        payoutId: String(row.payoutId || ''),
        eventId: String(row.eventId || ''),
        payee: String(row.payee || ''),
        payoutType: String(row.payoutType || ''),
        status: String(row.status || 'Unknown'),
        amountCents: amount,
        role: payoutRole(row),
        duplicatesPayment,
        bankVerified: false
      };
    });

    const clients = payments.filter((row) => row.role === 'client_receivable');
    const vendors = payments.filter((row) => row.role === 'vendor_expense');
    const owners = payments.filter((row) => row.role === 'owner_distribution');
    const unclassified = payments.filter((row) => row.role === 'unclassified');
    const settledClients = clients.filter((row) => row.settlement === 'ledger_settled');
    const openClients = clients.filter((row) => row.settlement === 'open' || row.settlement === 'initiated_not_settled' || row.settlement === 'unknown');
    const countedPayouts = payouts.filter((row) => !row.duplicatesPayment);

    const verified = sum(settledClients, (row) => row.amountPaidCents);
    const clientInvoiced = sum(clients.filter((row) => row.settlement !== 'not_invoiced'), (row) => row.invoiceTotalCents);
    const vendorCommitted = sum(vendors.filter((row) => row.settlement !== 'not_invoiced'), (row) => row.invoiceTotalCents);
    const vendorLedgerPaid = sum(vendors.filter((row) => row.settlement === 'ledger_settled'), (row) => row.amountPaidCents);
    const ownerCommitted = sum(owners, (row) => row.invoiceTotalCents);
    const payoutObligations = sum(countedPayouts.filter((row) => !/^paid$/i.test(row.status)), (row) => row.amountCents);
    const marginGaps = clientInvoiced.gaps + vendorCommitted.gaps + ownerCommitted.gaps;
    const forecastMarginCents = marginGaps ? null : clientInvoiced.cents - vendorCommitted.cents - ownerCommitted.cents;
    const verifiedContributionCents = (verified.gaps || vendorLedgerPaid.gaps) ? null : verified.cents - vendorLedgerPaid.cents;

    return {
      payments,
      payouts,
      duplicatePaymentIds,
      counts: {
        payments: payments.length,
        clientInvoices: clients.length,
        vendorBills: vendors.length,
        unclassified: unclassified.length,
        payouts: payouts.length,
        payoutsExcludedAsDuplicateExpense: payouts.filter((row) => row.duplicatesPayment).length
      },
      money: {
        verifiedClientReceiptsCents: verified.cents,
        verifiedClientReceiptGaps: verified.gaps,
        clientInvoiceTotalCents: clientInvoiced.cents,
        openClientExposureCents: sum(openClients, (row) => row.balanceDueCents !== null ? row.balanceDueCents : row.invoiceTotalCents).cents,
        initiatedNotSettledCents: sum(clients.filter((row) => row.settlement === 'initiated_not_settled'), (row) => row.invoiceTotalCents).cents,
        vendorCommittedCents: vendorCommitted.cents,
        vendorLedgerPaidCents: vendorLedgerPaid.cents,
        ownerDistributionCents: ownerCommitted.cents,
        payoutObligationCents: payoutObligations.cents,
        forecastMarginCents,
        verifiedContributionCents
      },
      warnings: [
        'Ledger statuses are not bank settlement.',
        'Payment Initiated is excluded from verified receipts.',
        'Unclassified Payments rows are excluded from revenue and expense totals.',
        'A 3.5% tax rate is not applied unless a row already carries its own tax amount.'
      ]
    };
  }

  function sourceStatus(input) {
    const probe = input || {};
    if (probe.disabled) return 'DISABLED';
    if (!probe.connected) return 'NOT CONNECTED';
    if (!probe.lastSuccess) return probe.partial ? 'PARTIAL' : 'NOT VERIFIED';
    const age = new Date(probe.now || Date.now()).getTime() - new Date(probe.lastSuccess).getTime();
    if (!Number.isFinite(age) || age < 0) return 'NOT VERIFIED';
    if (age > Number(probe.staleAfterHours || 36) * 3600000) return 'STALE';
    return probe.partial ? 'PARTIAL' : 'LIVE';
  }

  return { buildLedger, sourceStatus, settlementKind, inferRole, cents };
});
