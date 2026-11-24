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
    const label = [row.lineLabel, row.counterparty, row.paymentType, row.paymentId, row.invoiceNumber].filter(Boolean).join(' ');
    if (/\b(elevated|venetian|heo)\b/i.test(label)) return { role: 'vendor_expense', roleSource: 'named_vendor_marker' };
    if (/\b(owner\s+draw|owner\s+distribution)\b/i.test(label)) return { role: 'owner_distribution', roleSource: 'named_distribution_marker' };
    const explicitBlank = String(row.ledgerRole || '').trim().toLowerCase();
    if (explicitBlank === 'unclassified' || explicitBlank === 'unknown' || explicitBlank === 'exclude') {
      return { role: 'unclassified', roleSource: 'explicit_exclusion' };
    }
    // Payments-tab rows are the client invoice ledger. A blank role is that tab,
    // not an inference from the dollar amount. Named vendor markers above still win.
    return { role: 'client_receivable', roleSource: 'payments_sheet' };
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
      dueDate: String(row.dueDate || '').slice(0, 20),
      bankVerified: false
    };
  }

  function reported(total) {
    return total.gaps ? null : total.cents;
  }

  function markDuplicateIds(rows, idKey, signature) {
    const groups = new Map();
    rows.forEach((row) => {
      const id = row[idKey];
      if (!id) {
        row.includedInTotals = true;
        return;
      }
      const list = groups.get(id) || [];
      list.push(row);
      groups.set(id, list);
    });
    const duplicates = [];
    const conflicts = [];
    groups.forEach((list, id) => {
      if (list.length < 2) {
        list[0].includedInTotals = true;
        return;
      }
      if (new Set(list.map(signature)).size === 1) {
        duplicates.push(id);
        list.forEach((row, index) => {
          row.includedInTotals = index === 0;
          row.duplicateTreatment = index === 0 ? 'counted_once' : 'duplicate_copy';
        });
      } else {
        conflicts.push(id);
        list.forEach((row) => {
          row.includedInTotals = false;
          row.duplicateTreatment = 'conflict_excluded';
        });
      }
    });
    return { duplicates, conflicts };
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
    const duplicateReport = markDuplicateIds(payments, 'paymentId', (row) => [row.eventId, row.role, row.settlement, row.invoiceTotalCents, row.amountPaidCents, row.balanceDueCents, row.paymentStatus].join('|'));
    const duplicatePaymentIds = duplicateReport.duplicates;
    const conflictPaymentIds = duplicateReport.conflicts;

    const paymentIds = new Set(payments.map((row) => row.paymentId).filter(Boolean));
    const payouts = (Array.isArray(input && input.payouts) ? input.payouts : []).map((row) => {
      const amount = cents(row.amount);
      const linkedPaymentId = String(row.linkedPaymentId || '');
      const duplicatesPayment = Boolean(linkedPaymentId) && paymentIds.has(linkedPaymentId);
      const amountOverlap = !duplicatesPayment && amount !== null && payments.some((payment) => (
        payment.role === 'vendor_expense' &&
        payment.eventId === String(row.eventId || '') &&
        payment.invoiceTotalCents === amount
      ));
      return {
        payoutId: String(row.payoutId || ''),
        eventId: String(row.eventId || ''),
        payee: String(row.payee || ''),
        payoutType: String(row.payoutType || ''),
        status: String(row.status || 'Unknown'),
        amountCents: amount,
        linkedPaymentId,
        role: payoutRole(row),
        duplicatesPayment,
        amountOverlap,
        bankVerified: false,
        includedInTotals: true
      };
    });
    const payoutReport = markDuplicateIds(payouts, 'payoutId', (row) => [row.eventId, row.role, row.status, row.amountCents, row.linkedPaymentId].join('|'));

    const countablePayments = payments.filter((row) => row.includedInTotals !== false);
    const clients = countablePayments.filter((row) => row.role === 'client_receivable');
    const vendors = countablePayments.filter((row) => row.role === 'vendor_expense');
    const owners = countablePayments.filter((row) => row.role === 'owner_distribution');
    const unclassified = countablePayments.filter((row) => row.role === 'unclassified');
    const settledClients = clients.filter((row) => row.settlement === 'ledger_settled');
    const openClients = clients.filter((row) => row.settlement === 'open' || row.settlement === 'initiated_not_settled' || row.settlement === 'unknown');
    const countedPayouts = payouts.filter((row) => !row.duplicatesPayment && row.includedInTotals !== false);

    const verified = sum(settledClients, (row) => row.amountPaidCents);
    const clientInvoiced = sum(clients.filter((row) => row.settlement !== 'not_invoiced'), (row) => row.invoiceTotalCents);
    const vendorCommitted = sum(vendors.filter((row) => row.settlement !== 'not_invoiced'), (row) => row.invoiceTotalCents);
    const vendorLedgerPaid = sum(vendors.filter((row) => row.settlement === 'ledger_settled'), (row) => row.amountPaidCents);
    const ownerCommitted = sum(owners, (row) => row.invoiceTotalCents);
    function payoutPaid(row) { return /^paid\b/i.test(String(row.status || '').trim()); }
    const ownerPayouts = countedPayouts.filter((row) => row.role === 'owner_distribution');
    const otherPayouts = countedPayouts.filter((row) => row.role !== 'owner_distribution');
    const ownerPaid = sum(ownerPayouts.filter(payoutPaid), (row) => row.amountCents);
    const ownerPlanned = sum(ownerPayouts.filter((row) => !payoutPaid(row)), (row) => row.amountCents);
    const payoutPaidTotal = sum(otherPayouts.filter(payoutPaid), (row) => row.amountCents);
    const payoutPlanned = sum(otherPayouts.filter((row) => !payoutPaid(row)), (row) => row.amountCents);
    const payoutObligations = sum(countedPayouts.filter((row) => !payoutPaid(row)), (row) => row.amountCents);
    const openExposure = sum(openClients, (row) => row.balanceDueCents);
    const expensesComplete = input && input.expensesComplete === true;
    const marginGaps = clientInvoiced.gaps + vendorCommitted.gaps + ownerCommitted.gaps + ownerPaid.gaps + ownerPlanned.gaps;
    const forecastMarginCents = expensesComplete && !marginGaps
      ? clientInvoiced.cents - vendorCommitted.cents - ownerCommitted.cents - ownerPaid.cents - ownerPlanned.cents
      : null;
    const verifiedContributionCents = expensesComplete && !verified.gaps && !vendorLedgerPaid.gaps && !ownerPaid.gaps && !payoutPaidTotal.gaps
      ? verified.cents - vendorLedgerPaid.cents - ownerPaid.cents - payoutPaidTotal.cents
      : null;

    const eventIds = new Set(payments.map((row) => row.eventId).concat(payouts.map((row) => row.eventId)).filter(Boolean));
    const byEvent = [...eventIds].map((eventId) => {
      const eventClients = clients.filter((row) => row.eventId === eventId);
      const invoiced = sum(eventClients.filter((row) => row.settlement !== 'not_invoiced'), (row) => row.invoiceTotalCents);
      const collected = sum(eventClients.filter((row) => row.settlement === 'ledger_settled'), (row) => row.amountPaidCents);
      const outstanding = sum(eventClients.filter((row) => row.settlement === 'open' || row.settlement === 'initiated_not_settled' || row.settlement === 'unknown'), (row) => row.balanceDueCents);
      const eventOwner = ownerPayouts.filter((row) => row.eventId === eventId);
      return {
        eventId,
        invoiceTotalCents: invoiced.gaps ? null : invoiced.cents,
        collectedCents: collected.gaps ? null : collected.cents,
        outstandingCents: outstanding.gaps ? null : outstanding.cents,
        ownerPaidCents: reported(sum(eventOwner.filter(payoutPaid), (row) => row.amountCents)),
        ownerPlannedCents: reported(sum(eventOwner.filter((row) => !payoutPaid(row)), (row) => row.amountCents)),
        bankVerified: false
      };
    });

    return {
      payments,
      payouts,
      duplicatePaymentIds,
      conflictPaymentIds,
      duplicatePayoutIds: payoutReport.duplicates,
      conflictPayoutIds: payoutReport.conflicts,
      counts: {
        payments: payments.length,
        clientInvoices: clients.length,
        vendorBills: vendors.length,
        unclassified: unclassified.length,
        payouts: payouts.length,
        payoutsExcludedAsDuplicateExpense: payouts.filter((row) => row.duplicatesPayment).length,
        amountOverlapsNotMerged: payouts.filter((row) => row.amountOverlap).length
      },
      byEvent,
      money: {
        verifiedClientReceiptsCents: reported(verified),
        verifiedClientReceiptGaps: verified.gaps,
        clientInvoiceTotalCents: reported(clientInvoiced),
        openClientExposureCents: reported(openExposure),
        openClientExposureGaps: openExposure.gaps,
        initiatedNotSettledCents: reported(sum(clients.filter((row) => row.settlement === 'initiated_not_settled'), (row) => row.invoiceTotalCents)),
        vendorCommittedCents: reported(vendorCommitted),
        vendorLedgerPaidCents: reported(vendorLedgerPaid),
        ownerDistributionCents: reported(ownerCommitted),
        ownerPaidCents: reported(ownerPaid),
        ownerPlannedCents: reported(ownerPlanned),
        payoutPaidCents: reported(payoutPaidTotal),
        payoutPlannedCents: reported(payoutPlanned),
        payoutObligationCents: reported(payoutObligations),
        forecastMarginCents,
        verifiedContributionCents,
        profitReason: expensesComplete ? '' : 'vendor_ledger_incomplete'
      },
      warnings: [
        'Ledger statuses are not bank settlement.',
        'Payment Initiated is excluded from verified receipts.',
        'Rows explicitly marked unclassified stay out of revenue and expenses.',
        'A matching amount does not merge a payout into a vendor bill.',
        'Planned owner distributions are not money already paid.',
        'Profit stays unavailable until vendor bills are a complete ledger.',
        'A 3.5% tax rate is not applied unless a row already carries its own tax amount.',
        'A missing amount is unknown, not zero.',
        'Duplicate payment or payout ids that disagree are excluded from totals. Identical copies are counted once.'
      ]
    };
  }

  function sourceStatus(input) {
    const probe = input || {};
    if (probe.disabled) return 'DISABLED';
    if (probe.observable === false) return 'NOT OBSERVABLE';
    if (probe.status === 'UNVERIFIED' || probe.status === 'NOT OBSERVABLE' || probe.status === 'HEALTHY') return probe.status;
    if (!probe.connected) return probe.partial ? 'PARTIAL' : 'NOT CONNECTED';
    if (!probe.lastSuccess) return probe.partial ? 'PARTIAL' : 'NOT VERIFIED';
    const age = new Date(probe.now || Date.now()).getTime() - new Date(probe.lastSuccess).getTime();
    if (!Number.isFinite(age) || age < 0) return 'NOT VERIFIED';
    if (age > Number(probe.staleAfterHours || 36) * 3600000) return 'STALE';
    return probe.partial ? 'PARTIAL' : 'LIVE';
  }

  function documentedExceptions() {
    return [
      {
        id: 'nium-decks-documentation',
        eventId: 'evt-nium-2026',
        paymentId: 'PAY-evt-nium-2026-additional-decks-20260927',
        amountCents: 41851,
        includedInTotals: false,
        detail: 'NIUM decks documentation differs by $418.51. The sheet invoice stays at its recorded amount. No adjustment was created.'
      },
      {
        id: 'neo-21fun-reconciliation',
        eventId: 'evt-neo-reunion-2026',
        amountCents: 36562,
        includedInTotals: false,
        detail: 'NEO/21 Fun differs by $365.62. That difference is not a Payments or payout row, so it is excluded from totals.'
      }
    ];
  }

  return { buildLedger, sourceStatus, settlementKind, inferRole, cents, documentedExceptions };
});
