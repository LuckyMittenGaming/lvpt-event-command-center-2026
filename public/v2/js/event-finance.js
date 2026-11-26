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
    const refundDirection = String(row.refundDirection || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
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
      refundOfPaymentId: String(row.refundOfPaymentId || '').trim(),
      refundDirection,
      bankVerified: false
    };
  }

  function refundEvidenceEstablished(row, catalog) {
    const amountKnown = row.amountPaidCents !== null || row.invoiceTotalCents !== null;
    if (!amountKnown || !row.refundOfPaymentId) return false;
    const original = catalog.find((payment) => (
      payment.paymentId === row.refundOfPaymentId &&
      payment.includedInTotals === true &&
      payment.eventId === row.eventId &&
      payment.settlement !== 'refunded'
    ));
    if (!original) return false;
    const direction = row.refundDirection || (
      row.role === 'client_receivable' && original.role === 'client_receivable'
        ? 'client_outflow'
        : row.role === 'vendor_expense' && original.role === 'vendor_expense'
          ? 'vendor_inflow'
          : ''
    );
    if (direction === 'client_outflow') {
      return row.role === 'client_receivable' && original.role === 'client_receivable';
    }
    if (direction === 'vendor_inflow') {
      return row.role === 'vendor_expense' && original.role === 'vendor_expense';
    }
    return false;
  }

  function reported(total) {
    return total.gaps ? null : total.cents;
  }

  function markDuplicateIds(rows, idKey, signature) {
    const groups = new Map();
    rows.forEach((row) => {
      const id = row[idKey];
      if (!id) {
        row.includedInTotals = false;
        row.duplicateTreatment = 'missing_id_excluded';
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

    const payouts = (Array.isArray(input && input.payouts) ? input.payouts : []).map((row) => {
      const amount = cents(row.amount);
      const linkedPaymentId = String(row.linkedPaymentId || '');
      const eventId = String(row.eventId || '');
      const linked = payments.filter((payment) => payment.paymentId && payment.paymentId === linkedPaymentId && payment.duplicateTreatment !== 'duplicate_copy');
      const includedVendor = linked.filter((payment) => payment.includedInTotals === true && payment.role === 'vendor_expense' && payment.eventId === eventId);
      const linkBlocked = linked.some((payment) => payment.includedInTotals !== true || payment.role !== 'vendor_expense' || payment.eventId !== eventId);
      const duplicatesPayment = Boolean(linkedPaymentId) && includedVendor.length > 0 && !linkBlocked;
      const linkUnresolved = Boolean(linkedPaymentId) && !duplicatesPayment;
      const amountOverlap = !duplicatesPayment && amount !== null && payments.some((payment) => (
        payment.includedInTotals === true &&
        payment.role === 'vendor_expense' &&
        payment.eventId === eventId &&
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
        linkUnresolved,
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
    const feeTaxRows = countablePayments.filter((row) => row.role === 'fee' || row.role === 'tax');
    const unclassified = countablePayments.filter((row) => row.role === 'unclassified');
    const settledClients = clients.filter((row) => row.settlement === 'ledger_settled');
    const refundedClients = clients.filter((row) => row.settlement === 'refunded');
    const refundedVendors = vendors.filter((row) => row.settlement === 'refunded');
    const openClients = clients.filter((row) => row.settlement === 'open' || row.settlement === 'initiated_not_settled' || row.settlement === 'unknown');
    const countedPayouts = payouts.filter((row) => !row.duplicatesPayment && row.includedInTotals !== false);
    // Include every refund settlement (client, vendor, fee, tax, owner, unclassified, etc.).
    const refundCandidates = countablePayments.filter((row) => row.settlement === 'refunded');
    refundCandidates.forEach((row) => {
      row.refundUnresolved = !refundEvidenceEstablished(row, countablePayments);
    });
    const unresolvedRefundRows = refundCandidates.filter((row) => row.refundUnresolved);
    const unresolvedRefundIds = unresolvedRefundRows.map((row) => row.paymentId).filter(Boolean);
    const hasUnresolvedRefund = unresolvedRefundRows.length > 0;
    // Any refund-classified payment keeps profit/contribution unavailable until supported refund accounting exists.
    // Evidence links are recorded, but excluding a refund amount is not treated as settled profitability.
    const hasRefund = refundCandidates.length > 0;
    const refundBlocksProfit = hasRefund;

    const verified = sum(settledClients, (row) => row.amountPaidCents);
    // Refunded client rows stay out of issued invoice and settled-receipt totals. No netting is inferred.
    const issuedClients = clients.filter((row) => row.settlement !== 'not_invoiced' && row.settlement !== 'unknown' && row.settlement !== 'refunded');
    const clientInvoiced = sum(issuedClients, (row) => row.invoiceTotalCents);
    const refundedClient = sum(refundedClients, (row) => (row.amountPaidCents !== null ? row.amountPaidCents : row.invoiceTotalCents));
    const refundedVendor = sum(refundedVendors, (row) => (row.amountPaidCents !== null ? row.amountPaidCents : row.invoiceTotalCents));
    const vendorCommitted = sum(vendors.filter((row) => row.settlement !== 'not_invoiced' && row.settlement !== 'refunded'), (row) => row.invoiceTotalCents);
    const vendorLedgerPaid = sum(vendors.filter((row) => row.settlement === 'ledger_settled'), (row) => row.amountPaidCents);
    const feeTaxCommitted = sum(feeTaxRows.filter((row) => row.settlement !== 'not_invoiced' && row.settlement !== 'refunded'), (row) => row.invoiceTotalCents);
    const feeTaxPaid = sum(feeTaxRows.filter((row) => row.settlement === 'ledger_settled'), (row) => row.amountPaidCents);
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
    const unlinkedVendorPayouts = countedPayouts.filter((row) => row.role === 'payout_obligation');
    const unlinkedVendorCommitted = sum(unlinkedVendorPayouts, (row) => row.amountCents);
    const unlinkedVendorPaid = sum(unlinkedVendorPayouts.filter(payoutPaid), (row) => row.amountCents);
    const expensesComplete = input && input.expensesComplete === true;
    const taxEstablished = input && input.taxEstablished === true;
    const uncertain = (row) => row.duplicateTreatment === 'conflict_excluded' || row.duplicateTreatment === 'missing_id_excluded';
    const paymentUncertain = (predicate) => payments.some((row) => uncertain(row) && predicate(row));
    const payoutUncertain = (predicate) => payouts.some((row) => uncertain(row) && predicate(row));
    const overlapUnresolved = payouts.some((row) => row.amountOverlap || row.linkUnresolved) || conflictPaymentIds.length > 0 || payoutReport.conflicts.length > 0;
    const missingIds = payments.some((row) => row.duplicateTreatment === 'missing_id_excluded') || payouts.some((row) => row.duplicateTreatment === 'missing_id_excluded');
    const feeTaxGaps = feeTaxRows.length ? feeTaxCommitted.gaps : 0;
    const marginGaps = clientInvoiced.gaps + vendorCommitted.gaps + unlinkedVendorCommitted.gaps + (taxEstablished ? feeTaxGaps : 0);
    let profitReason = '';
    if (!expensesComplete) profitReason = 'Expense completeness is not established.';
    else if (!taxEstablished) profitReason = 'Tax treatment is not established. No tax rate was applied.';
    else if (refundBlocksProfit) {
      profitReason = hasUnresolvedRefund
        ? 'Unresolved refund: direction, amount, or original-transaction link is not established. No netting was inferred.'
        : 'Refund accounting is not established. Profit and contribution stay unavailable while a refund row is present; excluding the refund is not supported profitability.';
    }
    else if (overlapUnresolved || missingIds) profitReason = 'Overlap, a conflicting id, or a missing stable id is not resolved.';
    else if (marginGaps) profitReason = 'An expense amount is missing.';
    const marginAvailable = !profitReason;
    // Owner distributions are never subtracted from forecast margin. Negative margin is preserved.
    // Refund amounts are never netted into margin or contribution.
    const forecastMarginCents = marginAvailable
      ? clientInvoiced.cents - vendorCommitted.cents - unlinkedVendorCommitted.cents - feeTaxCommitted.cents
      : null;
    const unpaidFeeTax = feeTaxRows.some((row) => !['ledger_settled', 'not_invoiced', 'refunded'].includes(row.settlement));
    const unpaidObligations = vendors.some((row) => !['ledger_settled', 'not_invoiced', 'refunded'].includes(row.settlement))
      || unlinkedVendorPayouts.some((row) => !payoutPaid(row))
      || ownerPayouts.some((row) => !payoutPaid(row))
      || unpaidFeeTax;
    const contributionGaps = verified.gaps + vendorLedgerPaid.gaps + unlinkedVendorPaid.gaps + ownerPaid.gaps + feeTaxPaid.gaps;
    const verifiedContributionCents = !refundBlocksProfit && !unpaidObligations && !contributionGaps && marginAvailable
      ? verified.cents - vendorLedgerPaid.cents - unlinkedVendorPaid.cents - ownerPaid.cents - feeTaxPaid.cents
      : null;
    const drawableCashCents = null;
    const drawableCashReason = 'Drawable cash is unavailable. The ledger does not verify the cash balance, bank settlement, remaining obligations, tax reserve, prior distributions, or overlap.';

    const incompleteFields = [];
    function qualify(field, total, affected) {
      if (affected || total.gaps) {
        if (!incompleteFields.includes(field)) incompleteFields.push(field);
        return null;
      }
      return total.cents;
    }
    if (refundBlocksProfit) {
      incompleteFields.push('refundTreatment');
      incompleteFields.push('forecastMargin');
      incompleteFields.push('verifiedContribution');
    }
    const clientUncertain = (row) => row.role === 'client_receivable';
    const openSettlement = (row) => row.settlement === 'open' || row.settlement === 'initiated_not_settled' || row.settlement === 'unknown';
    const issuedSettlement = (row) => row.settlement !== 'not_invoiced' && row.settlement !== 'unknown' && row.settlement !== 'refunded';
    const money = {
      verifiedClientReceiptsCents: qualify('verifiedClientReceipts', verified, paymentUncertain((row) => clientUncertain(row) && row.settlement === 'ledger_settled')),
      verifiedClientReceiptGaps: verified.gaps,
      clientInvoiceTotalCents: qualify('clientInvoiceTotal', clientInvoiced, paymentUncertain((row) => clientUncertain(row) && issuedSettlement(row))),
      openClientExposureCents: qualify('openClientExposure', openExposure, paymentUncertain((row) => clientUncertain(row) && openSettlement(row))),
      openClientExposureGaps: openExposure.gaps,
      initiatedNotSettledCents: qualify('initiatedNotSettled', sum(clients.filter((row) => row.settlement === 'initiated_not_settled'), (row) => row.invoiceTotalCents), paymentUncertain((row) => clientUncertain(row) && row.settlement === 'initiated_not_settled')),
      refundedClientCents: qualify('refundedClient', refundedClient, refundBlocksProfit || paymentUncertain((row) => clientUncertain(row) && row.settlement === 'refunded')),
      refundedVendorCents: qualify('refundedVendor', refundedVendor, refundBlocksProfit || paymentUncertain((row) => row.role === 'vendor_expense' && row.settlement === 'refunded')),
      vendorCommittedCents: qualify('vendorCommitted', vendorCommitted, paymentUncertain((row) => row.role === 'vendor_expense' && row.settlement !== 'not_invoiced' && row.settlement !== 'refunded')),
      vendorLedgerPaidCents: qualify('vendorLedgerPaid', vendorLedgerPaid, paymentUncertain((row) => row.role === 'vendor_expense' && row.settlement === 'ledger_settled')),
      feeTaxCommittedCents: qualify('feeTaxCommitted', feeTaxCommitted, paymentUncertain((row) => (row.role === 'fee' || row.role === 'tax') && row.settlement !== 'not_invoiced' && row.settlement !== 'refunded')),
      feeTaxPaidCents: qualify('feeTaxPaid', feeTaxPaid, paymentUncertain((row) => (row.role === 'fee' || row.role === 'tax') && row.settlement === 'ledger_settled')),
      ownerDistributionCents: qualify('ownerDistribution', ownerCommitted, paymentUncertain((row) => row.role === 'owner_distribution')),
      ownerPaidCents: qualify('ownerPaid', ownerPaid, payoutUncertain((row) => row.role === 'owner_distribution' && payoutPaid(row))),
      ownerPlannedCents: qualify('ownerPlanned', ownerPlanned, payoutUncertain((row) => row.role === 'owner_distribution' && !payoutPaid(row))),
      payoutPaidCents: qualify('payoutPaid', payoutPaidTotal, payoutUncertain((row) => row.role !== 'owner_distribution' && payoutPaid(row))),
      payoutPlannedCents: qualify('payoutPlanned', payoutPlanned, payoutUncertain((row) => row.role !== 'owner_distribution' && !payoutPaid(row))),
      payoutObligationCents: qualify('payoutObligation', payoutObligations, payoutUncertain((row) => !payoutPaid(row))),
      forecastMarginCents,
      drawableCashCents,
      drawableCashReason,
      verifiedContributionCents,
      bankSettlementVerified: false,
      unresolvedRefundIds,
      coverage: incompleteFields.length ? 'incomplete' : 'complete',
      incompleteFields,
      incompleteReason: incompleteFields.length
        ? (refundBlocksProfit
          ? (hasUnresolvedRefund
            ? 'Unresolved refund rows lack established direction, amount, or original-transaction evidence, so affected profit and contribution totals stay unavailable.'
            : 'A refund row is present and supported refund accounting is not established, so profit and contribution stay unavailable.')
          : 'Conflicting or unidentified rows were excluded, so the marked totals are incomplete.')
        : '',
      profitReason
    };

    const eventIds = new Set(payments.map((row) => row.eventId).concat(payouts.map((row) => row.eventId)).filter(Boolean));
    const byEvent = [...eventIds].map((eventId) => {
      const eventClients = clients.filter((row) => row.eventId === eventId);
      const eventUncertain = payments.some((row) => uncertain(row) && row.eventId === eventId && row.role === 'client_receivable');
      const ownerUncertain = payouts.some((row) => uncertain(row) && row.eventId === eventId && row.role === 'owner_distribution');
      const invoiced = sum(eventClients.filter((row) => issuedSettlement(row)), (row) => row.invoiceTotalCents);
      const collected = sum(eventClients.filter((row) => row.settlement === 'ledger_settled'), (row) => row.amountPaidCents);
      const outstanding = sum(eventClients.filter((row) => openSettlement(row)), (row) => row.balanceDueCents);
      const eventOwner = ownerPayouts.filter((row) => row.eventId === eventId);
      const ownerPaidTotal = sum(eventOwner.filter(payoutPaid), (row) => row.amountCents);
      const ownerPlannedTotal = sum(eventOwner.filter((row) => !payoutPaid(row)), (row) => row.amountCents);
      return {
        eventId,
        invoiceTotalCents: eventUncertain || invoiced.gaps ? null : invoiced.cents,
        collectedCents: eventUncertain || collected.gaps ? null : collected.cents,
        outstandingCents: eventUncertain || outstanding.gaps ? null : outstanding.cents,
        ownerPaidCents: ownerUncertain || ownerPaidTotal.gaps ? null : ownerPaidTotal.cents,
        ownerPlannedCents: ownerUncertain || ownerPlannedTotal.gaps ? null : ownerPlannedTotal.cents,
        totalsIncomplete: eventUncertain || ownerUncertain,
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
        clientPaymentRows: clients.length,
        issuedInvoices: issuedClients.length,
        notInvoicedRows: clients.filter((row) => row.settlement === 'not_invoiced').length,
        unknownInvoiceRows: clients.filter((row) => row.settlement === 'unknown').length,
        refundedClientRows: refundedClients.length,
        refundedVendorRows: refundedVendors.length,
        refundRows: refundCandidates.length,
        unresolvedRefundRows: unresolvedRefundRows.length,
        vendorBills: vendors.length,
        feeTaxRows: feeTaxRows.length,
        unclassified: unclassified.length,
        payouts: payouts.length,
        payoutsExcludedAsDuplicateExpense: payouts.filter((row) => row.duplicatesPayment).length,
        amountOverlapsNotMerged: payouts.filter((row) => row.amountOverlap).length,
        missingPaymentIds: payments.filter((row) => row.duplicateTreatment === 'missing_id_excluded').length,
        missingPayoutIds: payouts.filter((row) => row.duplicateTreatment === 'missing_id_excluded').length
      },
      byEvent,
      money,
      warnings: [
        'Ledger statuses are not bank settlement.',
        'Payment Initiated is excluded from verified receipts.',
        'Refunded rows stay out of settled receipts and issued invoice totals. Any refund keeps forecast margin and contribution unavailable until supported refund accounting exists. No refund netting is inferred, and a ledger refund is not a verified bank reversal.',
        'Fee and tax ledger rows enter forecast costs only when tax treatment is explicitly established. No automatic 3.5% rate is applied.',
        'Rows explicitly marked unclassified stay out of revenue and expenses.',
        'A matching amount does not merge a payout into a vendor bill.',
        'A payout is left out of costs only when its linked payment is an included vendor bill on the same event.',
        'Planned owner distributions are not money already paid and are not operating expenses.',
        'Forecast margin is a ledger estimate and may be negative. Drawable cash stays unavailable until cash, settlement, obligations, tax reserve, prior distributions, and overlap are independently verified.',
        'A missing amount is unknown, not zero.',
        'A row without a stable id is excluded, and the affected total is incomplete.',
        'Duplicate payment or payout ids that disagree are excluded from totals. Identical copies are counted once.',
        'Documented exceptions are reported without correcting authoritative sheet rows.'
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
