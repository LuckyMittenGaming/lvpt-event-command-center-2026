(() => {
  const finance = window.LVPTEventFinance;
  const KEY = 'lvptAppSyncKey';
  const HUB_VIEWS = ['finance', 'communications', 'health', 'action'];
  let ledgerCache = null;

  function esc(value) {
    return typeof escapeHtml === 'function' ? escapeHtml(value) : String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }

  function dollars(cents) {
    if (cents === null || cents === undefined || !Number.isFinite(cents)) return 'Unavailable';
    return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  }

  function badge(status) {
    const tone = status === 'LIVE' ? 'green' : status === 'DISABLED' || status === 'NOT CONNECTED' || status === 'STALE' ? 'red' : 'warn';
    return `<span class="badge ${tone}">${esc(status)}</span>`;
  }

  function examinedLabel(value) {
    if (value === null || value === undefined || value === '') return 'Not counted';
    return value;
  }

  function coverageLabel(value) {
    const raw = String(value || '').trim();
    if (!raw || raw === 'unspecified') return 'Unspecified';
    if (raw === 'read-complete') return 'Read complete';
    if (raw === 'partial' || raw === 'newest_row_only' || raw === 'property-only') {
      return raw === 'partial' ? 'Partial' : raw === 'newest_row_only' ? 'Newest row only' : 'Property only';
    }
    if (raw === 'unavailable') return 'Unavailable';
    return raw;
  }

  function honestJobStatus(job) {
    const probe = job && typeof job === 'object' ? { ...job } : { connected: false };
    const scheduleOnly = probe.scheduleVersusExecution
      && probe.scheduleVersusExecution.scheduleIsNotExecution === true
      && !probe.executedAt;
    if (scheduleOnly && probe.observable !== false && !probe.disabled) {
      // A configured schedule must never paint green as a successful run.
      probe.lastSuccess = '';
      if (probe.status === 'LIVE' || probe.status === 'HEALTHY') delete probe.status;
    }
    if (probe.heartbeatVerified === false && /heartbeat/i.test(String(probe.name || probe.id || ''))) {
      probe.lastSuccess = '';
      probe.status = probe.status === 'UNVERIFIED' ? 'UNVERIFIED' : 'NOT VERIFIED';
    }
    return finance.sourceStatus(probe);
  }

  function sourceHealthCards(sourceHealth) {
    if (!sourceHealth || typeof sourceHealth !== 'object') return '';
    const cards = [
      ['Gmail', sourceHealth.gmail],
      ['SMS store', sourceHealth.sms],
      ['SMS collector', sourceHealth.smsHeartbeat],
      ['RCS collector', sourceHealth.rcs],
      ['Safe TaskSync', sourceHealth.calendar]
    ].filter((entry) => entry[1] && typeof entry[1] === 'object');
    if (!cards.length) return '';
    const rows = cards.map(([label, evidence]) => {
      const status = evidence.explicitState || evidence.status || 'NOT VERIFIED';
      const scheduleNote = evidence.scheduleVersusExecution && evidence.scheduleVersusExecution.scheduleIsNotExecution
        ? 'Schedule is not execution.'
        : (evidence.executedAt ? `Executed ${evidence.executedAt}.` : 'No execution evidence.');
      const freshness = `Coverage ${coverageLabel(evidence.coverage)}. Latest record ${evidence.latestRecordAt || 'none'}. Latest ingest ${evidence.latestIngestAt || 'none'}. Heartbeat ${evidence.heartbeatVerified ? (evidence.heartbeatAt || 'verified') : 'not verified'}.`;
      return `<tr data-source-health="${esc(evidence.source || label)}"><td>${esc(label)}</td><td>${badge(status)}</td><td>${esc(coverageLabel(evidence.coverage))}</td><td>${esc(evidence.latestRecordAt || '—')}</td><td>${esc(evidence.latestIngestAt || '—')}</td><td>${esc(evidence.executedAt || '—')}</td><td>${esc(scheduleNote)} ${esc(freshness)}</td><td>${esc(evidence.ownerAction || '')}</td></tr>`;
    }).join('');
    return `<h3>Normalized source health</h3><p class="muted">Scheduler ownership, actual execution, stored activity, collector health, and owner-required actions stay separate. A stored row is not a heartbeat. A schedule is not a successful run.</p><div class="hub-table-wrap"><table class="hub-table" data-health-table="source-health"><thead><tr><th>Source</th><th>Status</th><th>Coverage</th><th>Latest record</th><th>Latest ingest</th><th>Executed</th><th>Freshness</th><th>Owner action</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  function healthJobRows(jobs) {
    return jobs.map((job) => {
      const status = honestJobStatus(job);
      const scheduleNote = job.scheduleVersusExecution && job.scheduleVersusExecution.scheduleIsNotExecution
        ? 'Schedule only — not execution'
        : (job.executedAt ? `Executed ${job.executedAt}` : (job.observable === false ? 'Not observable' : 'No execution evidence'));
      return `<tr data-job-id="${esc(job.id || '')}" data-job-name="${esc(job.name || '')}"><td>${esc(job.name)}</td><td>${esc(job.owner || '—')}</td><td>${esc(job.schedule || '—')}</td><td>${badge(status)}</td><td>${esc(coverageLabel(job.coverage))}</td><td>${esc(job.lastAttempt || '—')}</td><td>${esc(job.lastSuccess || '—')}</td><td>${esc(job.latestRecordAt || '—')}</td><td>${esc(job.latestIngestAt || '—')}</td><td>${esc(examinedLabel(job.recordsExamined))}</td><td>${esc(scheduleNote)}</td><td>${esc(job.ownerAction || '')}</td><td>${esc(job.detail || '')}</td></tr>`;
    }).join('');
  }

  function smsScanBlock(sms, probe) {
    const source = probe && typeof probe === 'object' ? probe : { connected: false, detail: 'SMS scan status was not reported. No message count is shown.' };
    const status = finance.sourceStatus(source);
    const coverage = sms && sms.coverage === 'read-complete' ? 'Read complete' : sms && sms.coverage === 'partial' ? 'Partial' : 'Unavailable';
    const connected = sms && sms.connected === true ? 'Connected' : 'Not connected';
    const counted = !sms
      ? 'Rows were not counted'
      : sms.countComplete
        ? `${sms.storedMessages} stored metadata rows, and that count is complete`
        : sms.storedMessages == null
          ? 'Rows were not counted'
          : `${sms.storedMessages} metadata rows were read. That is not a complete count`;
    const message = sms && sms.newestMessageAt ? sms.newestMessageAt : 'No valid message time';
    const ingest = sms && sms.newestIngestAt ? sms.newestIngestAt : 'No valid import time';
    const among = sms && sms.coverage === 'partial'
      ? `<p>Newest message among rows read: ${esc(sms.newestMessageAmongRead || 'none')}. Newest import among rows read: ${esc(sms.newestIngestAmongRead || 'none')}. Those times are not the latest successful import.</p>`
      : '';
    return `<div class="hub-callout"><strong>SMS metadata scan</strong><p>${badge(status)} Coverage: ${esc(coverage)}. ${esc(connected)}.</p><p>${esc((sms && sms.detail) || source.detail || '')}</p><p>Latest successful import: ${esc(ingest)}. Newest message: ${esc(message)}. ${esc(counted)}.</p>${among}</div>`;
  }

  function gmailScanBlock(header) {
    const source = header && header.probe ? header.probe : header;
    const known = header && header.coverage;
    const status = finance.sourceStatus(known ? {
      connected: header.connected === true,
      partial: header.partial === true,
      lastSuccess: '',
      now: header.checkedAt
    } : { connected: false });
    const coverage = header && header.coverage === 'read-complete' ? 'Read complete' : header && header.coverage === 'partial' ? 'Partial' : 'Unavailable';
    const counted = !known
      ? 'Header threads were not counted'
      : header.countComplete
        ? `${header.headerThreads} header threads, and that count is complete for the requested domains`
        : header.headerThreads == null
          ? 'Header threads were not counted'
          : `${header.headerThreads} header threads were read. That is not a complete count`;
    return `<div class="hub-callout"><strong>Gmail header read</strong><p>${badge(status)} Coverage: ${esc(coverage)}. Metadata only. Full threads were not opened.</p><p>${esc((header && header.detail) || (source && source.detail) || 'The header read did not report coverage. An empty queue is not proof the mailbox is empty.')}</p><p>Newest header: ${esc((header && header.newestHeaderAt) || 'No valid header time')}. Stored sheet date: ${esc((header && header.storedNewestAt) || 'not a valid stored date')}. ${esc(counted)}.</p></div>`;
  }

  function smsScanJob(inbox) {
    if (inbox.ok && inbox.data && inbox.data.ok === true && inbox.data.smsProbe) return inbox.data.smsProbe;
    return {
      name: 'SMS metadata scan',
      connected: false,
      partial: false,
      lastAttempt: '',
      lastSuccess: '',
      recordsExamined: null,
      recordsCreated: 0,
      duplicates: null,
      unmatched: null,
      detail: (inbox.data && (inbox.data.reason || inbox.data.message)) || 'The SMS metadata scan did not load. No count was taken.'
    };
  }

  function syncKey() {
    return localStorage.getItem(KEY) || '';
  }

  async function readJson(url, withKey, timeoutMs = 12000) {
    const headers = {};
    if (withKey && syncKey()) headers['x-lvpt-sync-key'] = syncKey();
    try {
      const response = await fetch(url, { headers, credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) });
      const data = await response.json().catch(() => ({}));
      return { ok: response.ok, status: response.status, data };
    } catch (error) {
      return { ok: false, status: 0, data: { message: 'The source did not respond in time.', reason: 'timeout' } };
    }
  }

  function eventName(eventId) {
    const sheetEvents = ledgerCache && Array.isArray(ledgerCache.events) ? ledgerCache.events : [];
    const sheet = sheetEvents.find((event) => event.id === eventId);
    if (sheet && (sheet.eventName || sheet.company)) return sheet.eventName || sheet.company;
    const match = (typeof events !== 'undefined' ? events : []).find((event) => event.id === eventId);
    return match ? (match.eventName || match.company || eventId) : eventId || 'Event not on the sheet';
  }

  function shell(eyebrow, title, copy, body) {
    return `<div class="command-view-shell"><div class="command-view-head"><div><p class="eyebrow">${esc(eyebrow)}</p><h2>${esc(title)}</h2><p>${esc(copy)}</p></div></div><div class="command-view-body">${body}</div></div>`;
  }

  let actionInboxPromise = null;
  let actionInboxResult = null;
  let readGeneration = 0;
  async function loadActionInbox() {
    if (actionInboxResult) return actionInboxResult;
    if (actionInboxPromise) return actionInboxPromise;
    const generation = readGeneration;
    actionInboxPromise = readJson('/api/sync/action-inbox', false, 55000).then((result) => {
      actionInboxPromise = null;
      if (generation !== readGeneration) return result;
      if (result.ok && result.data && result.data.ok === true) actionInboxResult = result;
      else actionInboxResult = null;
      return result;
    });
    return actionInboxPromise;
  }
  function clearOwnerReads() {
    readGeneration += 1;
    actionInboxPromise = null;
    actionInboxResult = null;
    if (typeof window.lvptReloadOperatingPicture === 'function') window.lvptReloadOperatingPicture();
  }
  window.lvptClearOwnerReads = clearOwnerReads;
  async function loadLedger() {
    const result = typeof window.lvptLoadOperatingPicture === 'function'
      ? await window.lvptLoadOperatingPicture()
      : await readJson('/api/sync/operating-picture', false, 50000);
    if (result && result.ok && result.data && result.data.ok === true) ledgerCache = result.data;
    return result || { ok: false, status: 0, data: { reason: 'timeout' } };
  }

  function paymentMeaning(row) {
    if (row.duplicateTreatment === 'duplicate_copy') return 'Identical copy, counted once';
    if (row.duplicateTreatment === 'conflict_excluded') return 'Conflicting id, excluded from totals';
    if (row.duplicateTreatment === 'missing_id_excluded') return 'No stable id, excluded from totals';
    return String(row.settlement || 'unknown').replaceAll('_', ' ');
  }

  function payoutMeaning(row) {
    if (row.duplicateTreatment === 'conflict_excluded') return 'Conflicting payout id, excluded';
    if (row.duplicateTreatment === 'missing_id_excluded') return 'No stable id, excluded from totals';
    if (row.duplicateTreatment === 'duplicate_copy') return 'Identical copy, counted once';
    if (row.duplicatesPayment) return 'Excluded — same-event included vendor bill';
    if (row.linkUnresolved) return 'Link does not match an included vendor bill, so the cost stays';
    if (row.amountOverlap) return 'Same amount, kept as its own record';
    if (row.role === 'owner_distribution') return /^paid\b/i.test(String(row.status || '')) ? 'Paid distribution' : 'Planned, not paid';
    return 'Separate obligation';
  }

  function recordOpen(eventId) {
    return eventId
      ? `<button type="button" class="btn small" data-view-record="${esc(eventId)}">View event</button>`
      : 'No event id';
  }

  function financeBody(result) {
    if (result.status === 401) {
      return `<div class="hub-callout"><strong>Owner sign-in required.</strong><p>The ledger was not read. This is not an empty sheet.</p><p><a class="btn primary" href="/sms-review/index.html">Owner sign-in</a></p></div>`;
    }
    if (!result.ok || !result.data || result.data.ok !== true || !result.data.report) {
      return `<div class="hub-callout">${esc((result.data && (result.data.message || result.data.reason)) || 'The sheet ledger is unavailable.')} <p>Status: ${badge('NOT CONNECTED')}</p><p>This is not an empty ledger. Browser copies stay off this screen.</p></div>`;
    }
    const data = result.data;
    if (data.paymentSourceStatus !== 'command_center_all_payments') {
      return `<div class="hub-callout"><strong>Every-invoice source is not deployed.</strong><p>The live Apps Script response did not include one row per Payments entry. This screen will not invent totals from the first invoice on an event.</p>${badge('NOT CONNECTED')}</div>`;
    }
    const report = data.report;
    const reconciliation = data.reconciliation && typeof data.reconciliation === 'object' ? data.reconciliation : null;
    const exceptions = Array.isArray(data.exceptions) ? data.exceptions : (reconciliation && Array.isArray(reconciliation.linkedExceptions) ? reconciliation.linkedExceptions : []);
    const incomplete = new Set(report.money.incompleteFields || []);
    const shown = (field, cents) => incomplete.has(field) ? 'Incomplete' : dollars(cents);
    const cards = [
      ['Payment rows read', report.counts.payments],
      ['Client payment rows', report.counts.clientPaymentRows ?? report.counts.clientInvoices],
      ['Vendor bills', report.counts.vendorBills],
      ['Unclassified, excluded', report.counts.unclassified],
      ['Ledger-recorded receipts', shown('verifiedClientReceipts', report.money.verifiedClientReceiptsCents)],
      ['Issued invoices', report.counts.issuedInvoices ?? report.counts.clientInvoices],
      ['Not invoiced', report.counts.notInvoicedRows ?? 0],
      ['Initiated, not settled', shown('initiatedNotSettled', report.money.initiatedNotSettledCents)],
      ['Vendor committed', shown('vendorCommitted', report.money.vendorCommittedCents)],
      ['Owner paid', shown('ownerPaid', report.money.ownerPaidCents)],
      ['Owner planned', shown('ownerPlanned', report.money.ownerPlannedCents)],
      ['Ledger contribution', report.money.verifiedContributionCents == null ? 'Unavailable' : dollars(report.money.verifiedContributionCents)],
      ['Forecast margin', report.money.forecastMarginCents == null ? 'Unavailable' : dollars(report.money.forecastMarginCents)],
      ['Drawable cash', 'Unavailable']
    ].map(([label, value]) => `<div><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join('');

    const payments = Array.isArray(report.payments) ? report.payments : [];
    const payouts = Array.isArray(report.payouts) ? report.payouts : [];
    const clientRows = payments.filter((row) => row.role === 'client_receivable');
    const vendorRows = payments.filter((row) => row.role === 'vendor_expense');
    const ownerPaymentRows = payments.filter((row) => row.role === 'owner_distribution');
    const otherPaymentRows = payments.filter((row) => !['client_receivable', 'vendor_expense', 'owner_distribution'].includes(row.role));
    const ownerPayoutRows = payouts.filter((row) => row.role === 'owner_distribution');
    const vendorPayoutRows = payouts.filter((row) => row.role !== 'owner_distribution');

    const clientTable = clientRows.map((row) => {
      const sourceId = row.paymentId || 'missing payment id';
      return `<tr data-payment-id="${esc(row.paymentId || '')}" data-event-id="${esc(row.eventId || '')}" data-finance-role="client_receivable"><td>${esc(eventName(row.eventId))}</td><td>${esc(sourceId)}</td><td>${esc(row.invoiceNumber || '—')}</td><td>${esc(row.paymentStatus)}</td><td>${esc(paymentMeaning(row))}</td><td>${esc(row.dueDate || 'No due date')}</td><td>${esc(dollars(row.invoiceTotalCents))}</td><td>${esc(dollars(row.amountPaidCents))}</td><td>${esc(dollars(row.balanceDueCents))}</td><td>${recordOpen(row.eventId)}</td></tr>`;
    }).join('');

    const vendorTable = vendorRows.map((row) => {
      const sourceId = row.paymentId || 'missing payment id';
      const label = row.lineLabel || row.counterparty || row.invoiceNumber || sourceId;
      return `<tr data-payment-id="${esc(row.paymentId || '')}" data-event-id="${esc(row.eventId || '')}" data-finance-role="vendor_expense"><td>${esc(eventName(row.eventId))}</td><td>${esc(sourceId)}</td><td>${esc(label)}</td><td>${esc(row.paymentStatus)}</td><td>${esc(paymentMeaning(row))}</td><td>${esc(row.dueDate || 'No due date')}</td><td>${esc(dollars(row.invoiceTotalCents))}</td><td>${esc(dollars(row.amountPaidCents))}</td><td>${esc(dollars(row.balanceDueCents))}</td><td>${recordOpen(row.eventId)}</td></tr>`;
    }).join('');

    const ownerPaymentTable = ownerPaymentRows.map((row) => {
      const sourceId = row.paymentId || 'missing payment id';
      return `<tr data-payment-id="${esc(row.paymentId || '')}" data-event-id="${esc(row.eventId || '')}" data-finance-role="owner_distribution"><td>${esc(eventName(row.eventId))}</td><td>${esc(sourceId)}</td><td>${esc(row.lineLabel || 'Owner distribution')}</td><td>${esc(row.paymentStatus)}</td><td>${esc(paymentMeaning(row))}</td><td>${esc(row.dueDate || 'No due date')}</td><td>${esc(dollars(row.invoiceTotalCents))}</td><td>${esc(dollars(row.amountPaidCents))}</td><td>${recordOpen(row.eventId)}</td></tr>`;
    }).join('');

    const ownerPayoutTable = ownerPayoutRows.map((row) => {
      const sourceId = row.payoutId || 'missing payout id';
      return `<tr data-payout-id="${esc(row.payoutId || '')}" data-event-id="${esc(row.eventId || '')}" data-finance-role="owner_distribution"><td>${esc(eventName(row.eventId))}</td><td>${esc(sourceId)}</td><td>${esc(row.payee || 'Owner')}</td><td>${esc(`${row.payoutType || 'Owner distribution'} · ${row.status || 'Unknown'}`)}</td><td>${esc(payoutMeaning(row))}</td><td>${esc(row.dueDate || 'No due date')}</td><td>${esc(dollars(row.amountCents))}</td><td>${esc(/^paid\b/i.test(String(row.status || '')) ? dollars(row.amountCents) : 'Not paid')}</td><td>${recordOpen(row.eventId)}</td></tr>`;
    }).join('');

    const vendorPayoutTable = vendorPayoutRows.map((row) => {
      const sourceId = row.payoutId || 'missing payout id';
      const link = row.linkedPaymentId ? `Linked payment ${row.linkedPaymentId}` : 'No payment link';
      return `<tr data-payout-id="${esc(row.payoutId || '')}" data-event-id="${esc(row.eventId || '')}" data-linked-payment-id="${esc(row.linkedPaymentId || '')}" data-finance-role="payout_obligation"><td>${esc(eventName(row.eventId))}</td><td>${esc(sourceId)}</td><td>${esc(row.payee)}</td><td>${esc(row.payoutType)}</td><td>${esc(row.status)}</td><td>${esc(payoutMeaning(row))}</td><td>${esc(link)}</td><td>${esc(row.dueDate || 'No due date')}</td><td>${esc(dollars(row.amountCents))}</td><td>${recordOpen(row.eventId)}</td></tr>`;
    }).join('');

    const otherTable = otherPaymentRows.map((row) => {
      const sourceId = row.paymentId || 'missing payment id';
      return `<tr data-payment-id="${esc(row.paymentId || '')}" data-event-id="${esc(row.eventId || '')}" data-finance-role="${esc(row.role || 'unclassified')}"><td>${esc(eventName(row.eventId))}</td><td>${esc(sourceId)}</td><td>${esc(String(row.role || 'unclassified').replaceAll('_', ' '))}</td><td>${esc(row.paymentStatus)}</td><td>${esc(paymentMeaning(row))}</td><td>${esc(row.dueDate || 'No due date')}</td><td>${esc(dollars(row.invoiceTotalCents))}</td><td>${recordOpen(row.eventId)}</td></tr>`;
    }).join('');

    const eventRows = reconciliation && Array.isArray(reconciliation.byEvent)
      ? reconciliation.byEvent
      : (Array.isArray(report.byEvent) ? report.byEvent : []);
    const eventReconcileTable = eventRows.map((row) => {
      const incompleteEvent = row.totalsIncomplete === true ? 'Incomplete' : 'Qualified';
      return `<tr data-event-id="${esc(row.eventId || '')}" data-finance-reconcile="event"><td>${esc(eventName(row.eventId))}</td><td>${esc(incompleteEvent)}</td><td>${esc(dollars(row.invoiceTotalCents))}</td><td>${esc(dollars(row.collectedCents))}</td><td>${esc(dollars(row.outstandingCents))}</td><td>${esc(dollars(row.vendorCommittedCents))}</td><td>${esc(dollars(row.ownerPaidCents))}</td><td>${esc(dollars(row.ownerPlannedCents))}</td><td>${recordOpen(row.eventId)}</td></tr>`;
    }).join('');

    const comparisons = reconciliation && Array.isArray(reconciliation.comparisons) ? reconciliation.comparisons : [];
    const globalTable = comparisons.length
      ? comparisons.map((row) => {
        const status = row.matches === true ? 'Reconciled' : row.status === 'incomplete' ? 'Incomplete' : 'Mismatch';
        const label = String(row.field || '').replace(/([A-Z])/g, ' $1').replace(/^./, (ch) => ch.toUpperCase()).trim();
        return `<tr data-finance-reconcile="global" data-reconcile-field="${esc(row.field || '')}"><td>${esc(label)}</td><td>${esc(status)}</td><td>${esc(dollars(row.globalCents))}</td><td>${esc(dollars(row.qualifiedEventCents))}</td><td>${esc(row.reason || '')}</td></tr>`;
      }).join('')
      : `<tr><td colspan="5">${reconciliation ? 'No global comparisons were returned.' : 'Global reconciliation was not returned on this operating-picture read. Per-event rows above still use the shared ledger model.'}</td></tr>`;

    const exceptionTable = exceptions.map((row) => {
      const source = row.paymentId
        ? `payment ${row.paymentId}`
        : row.payoutId
          ? `payout ${row.payoutId}`
          : 'No payment or payout id';
      const included = row.includedInTotals === true ? 'Included' : 'Excluded from totals';
      return `<tr data-exception-id="${esc(row.id || '')}" data-payment-id="${esc(row.paymentId || '')}" data-event-id="${esc(row.eventId || '')}" data-finance-exception="1"><td>${esc(row.id || 'exception')}</td><td>${esc(eventName(row.eventId))}</td><td>${esc(source)}</td><td>${esc(dollars(row.amountCents))}</td><td>${esc(included)}</td><td>${esc(row.detail || '')}</td><td>${recordOpen(row.eventId)}</td></tr>`;
    }).join('');

    const duplicateNote = ` Identical payment ids counted once: ${(report.duplicatePaymentIds || []).length}. Conflicting payment ids excluded: ${(report.conflictPaymentIds || []).length}. Identical payout ids counted once: ${(report.duplicatePayoutIds || []).length}. Conflicting payout ids excluded: ${(report.conflictPayoutIds || []).length}. A missing amount stays unavailable.`;
    const incompleteNote = report.money.coverage === 'incomplete' ? ` ${report.money.incompleteReason}` : '';
    const marginNote = report.money.profitReason ? ` ${report.money.profitReason}` : '';
    const reconcileNote = reconciliation
      ? (reconciliation.allReconciled === true
        ? ' Global totals reconcile with the sum of qualified per-event totals.'
        : ` Global reconciliation is incomplete or mismatched for ${(reconciliation.incompleteEventIds || []).length} event id(s). Linked exceptions stay visible.`)
      : '';

    return `<div class="hub-warning">Read-only Google Sheets ledger. Paid In Full here is not a bank confirmation. Payment Initiated is not money received. A refund stays out of settled receipts. Unclassified rows stay out of both revenue and expenses. Client receipts, vendor bills, and owner draws stay in separate totals. Forecast margin does not subtract owner draws. Ledger contribution is not bank-verified and is not drawable cash. ${esc(report.money.drawableCashReason || 'Drawable cash is unavailable.')}${esc(incompleteNote)}${esc(marginNote)}${esc(reconcileNote)}</div><div class="lifecycle-summary hub-metrics">${cards}</div><h3>Client invoices</h3><p class="muted">Invoice-by-invoice client ledger. Same-amount invoices stay independent. Source id is the Payments payment_id.</p><div class="hub-table-wrap"><table class="hub-table" data-finance-table="client-invoices"><thead><tr><th>Event</th><th>Source id</th><th>Invoice</th><th>Ledger status</th><th>Meaning</th><th>Due date</th><th>Invoice</th><th>Ledger paid</th><th>Balance</th><th>Record</th></tr></thead><tbody>${clientTable || '<tr><td colspan="10">No client invoice rows returned.</td></tr>'}</tbody></table></div><h3>Vendor obligations</h3><p class="muted">Vendor-by-vendor obligations. Vendor bills are not client revenue. Due dates stay on the source row.</p><div class="hub-table-wrap"><table class="hub-table" data-finance-table="vendor-obligations"><thead><tr><th>Event</th><th>Source id</th><th>Vendor</th><th>Ledger status</th><th>Meaning</th><th>Due date</th><th>Invoice</th><th>Ledger paid</th><th>Balance</th><th>Record</th></tr></thead><tbody>${vendorTable || '<tr><td colspan="10">No vendor obligation rows returned.</td></tr>'}</tbody></table></div><h3>Owner distributions</h3><p class="muted">Owner draws stay separate from operating expenses. Planned is not paid.</p><div class="hub-table-wrap"><table class="hub-table" data-finance-table="owner-distributions"><thead><tr><th>Event</th><th>Source id</th><th>Label / payee</th><th>Type / status</th><th>Meaning</th><th>Due date</th><th>Amount</th><th>Ledger paid</th><th>Record</th></tr></thead><tbody>${(ownerPaymentTable + ownerPayoutTable) || '<tr><td colspan="9">No owner distribution rows returned.</td></tr>'}</tbody></table></div><h3>Vendor payouts, kept separate</h3><p class="muted">Payout overlaps stay reviewable. A matching amount does not merge a payout into a vendor bill.</p><div class="hub-table-wrap"><table class="hub-table" data-finance-table="vendor-payouts"><thead><tr><th>Event</th><th>Source id</th><th>Payee</th><th>Type</th><th>Status</th><th>Treatment</th><th>Payment link</th><th>Due date</th><th>Amount</th><th>Record</th></tr></thead><tbody>${vendorPayoutTable || '<tr><td colspan="10">No vendor payout rows returned.</td></tr>'}</tbody></table></div>${otherPaymentRows.length ? `<h3>Fee, tax, and unclassified rows</h3><div class="hub-table-wrap"><table class="hub-table" data-finance-table="other-payments"><thead><tr><th>Event</th><th>Source id</th><th>Role</th><th>Ledger status</th><th>Meaning</th><th>Due date</th><th>Invoice</th><th>Record</th></tr></thead><tbody>${otherTable}</tbody></table></div>` : ''}<h3>Per-event reconciliation</h3><p class="muted">Qualified event totals come from the shared ledger model. Incomplete event rows stay incomplete.</p><div class="hub-table-wrap"><table class="hub-table" data-finance-table="event-reconciliation"><thead><tr><th>Event</th><th>State</th><th>Client invoices</th><th>Collected</th><th>Outstanding</th><th>Vendor committed</th><th>Owner paid</th><th>Owner planned</th><th>Record</th></tr></thead><tbody>${eventReconcileTable || '<tr><td colspan="9">No per-event reconciliation rows returned.</td></tr>'}</tbody></table></div><h3>Global reconciliation</h3><p class="muted">Global totals must equal the sum of qualified per-event totals. Exceptions are never hidden to force a match.</p><div class="hub-table-wrap"><table class="hub-table" data-finance-table="global-reconciliation"><thead><tr><th>Field</th><th>Status</th><th>Global</th><th>Qualified event sum</th><th>Note</th></tr></thead><tbody>${globalTable}</tbody></table></div><h3>Linked exceptions</h3><p class="muted">Documented exceptions stay source-linked and out of fabricated totals.</p><div class="hub-table-wrap"><table class="hub-table" data-finance-table="linked-exceptions"><thead><tr><th>Exception</th><th>Event</th><th>Source</th><th>Amount</th><th>Totals</th><th>Detail</th><th>Record</th></tr></thead><tbody>${exceptionTable || '<tr><td colspan="7">No linked exceptions were returned.</td></tr>'}</tbody></table></div><p class="muted">Payout source: ${esc(data.payoutSourceStatus)}. ${report.counts.payoutsExcludedAsDuplicateExpense} payout row(s) share a payment id and were not counted twice. ${report.counts.amountOverlapsNotMerged} same-amount row(s) stayed separate.${duplicateNote} Server time ${esc(data.serverTime || 'not provided')}. writesPerformed ${esc(String(data.writesPerformed === true))}.</p>`;
  }

  function communicationsBody(session, audit) {
    const sessionLabel = session.status === 401 || !(session.data && session.data.authenticated === true) ? 'AUTH REQUIRED' : 'AUTHENTICATED';
    const auditLabel = audit.status === 0 ? 'TIMED OUT' : audit.ok && audit.data && audit.data.ok === true ? 'CHECKED' : 'NOT CHECKED';
    return `<div class="hub-split"><section><h3>Approval queue</h3><p>Approve, Make Changes, Deny, and Edit Myself are recorded only in the protected review workspace. That workspace checks the exact recipient. This page does not send and does not record those decisions. Opening approvals here does not prove exactly-once delivery.</p><div class="actions"><a class="btn primary" href="/sms-review/index.html#inboxReviewTitle">Open the protected approval workspace</a></div></section><section><h3>Session</h3><p>Owner session ${badge(sessionLabel)}. Audit route ${badge(auditLabel)}. An audit check does not prove the session, and the session does not prove a collector heartbeat.</p><p class="muted">${sessionLabel === 'AUTH REQUIRED' ? 'The owner review session is missing or expired.' : 'The HttpOnly review session is present. Message text is not on this page.'}</p></section></div>`;
  }

  function jobRows(probes) {
    const jobs = [
      { name: 'Safe TaskSync', schedule: 'Hourly', owner: 'LVPT Calendar Command Center · runLVPTSafeTaskSync', ...probes.taskSync },
      { name: 'Morning client review', schedule: '8:00 AM ET', owner: 'Scheduled review · read only for calendar', ...probes.morning },
      { name: 'Evening client review', schedule: '7:00 PM ET', owner: 'Scheduled review · read only for calendar', ...probes.evening },
      { name: 'Morning executive inbox brief', schedule: '8:01 AM ET', owner: 'Scheduled inbox brief', ...probes.brief },
      { name: 'Email approval checks', schedule: '6:00 AM, noon, 7:00 PM, midnight ET', owner: 'Disabled approval automation', disabled: true },
      { name: 'Gmail credentials', schedule: 'On demand from this hub', owner: 'Vercel Gmail routes', ...probes.gmail },
      { name: 'Sheets ledger read', schedule: 'When this page is opened with the sync key', owner: 'Existing Apps Script web app', ...probes.ledger },
      { name: 'SMS staging intake', schedule: 'Android best effort', owner: 'Supabase project LVPT SMS Staging', ...probes.sms }
    ];
    return jobs.map((job) => {
      const status = finance.sourceStatus(job);
      return `<tr><td>${esc(job.name)}</td><td>${esc(job.schedule)}</td><td>${esc(job.owner)}</td><td>${badge(status)}</td><td>${esc(job.detail || '')}</td></tr>`;
    }).join('');
  }

  async function renderFinance(view) {
    view.innerHTML = shell('Event finance', 'Invoice by invoice', 'Each Payments row stays separate. Client receipts, vendor bills, and payouts are not added together.', '<p class="muted">Reading the ledger…</p>');
    const result = await loadLedger();
    view.innerHTML = shell('Event finance', 'Invoice by invoice', 'Each Payments row stays separate. Client receipts, vendor bills, and payouts are not added together.', financeBody(result));
    view.querySelectorAll('[data-view-record]').forEach((button) => button.addEventListener('click', () => {
      if (typeof window.lvptOpenRecord === 'function') window.lvptOpenRecord(button.getAttribute('data-view-record'));
    }));
  }

  async function renderCommunications(view) {
    view.innerHTML = shell('Communications', 'Gmail and approved SMS', 'The existing review workspace remains the place where a thread is opened. This hub only shows whether that session is healthy.', '<p class="muted">Checking the review session…</p>');
    const generation = readGeneration;
    const [session, audit, picture, conversations, rcs] = await Promise.all([
      readJson('/api/sms/staging/session', false, 12000),
      readJson('/api/sms/staging/audit-health', false, 12000),
      loadLedger(),
      readJson('/api/sms/staging/conversations', false, 12000),
      readJson('/api/sms/staging/rcs-collector', false, 12000)
    ]);
    if (generation !== readGeneration) return;
    let ledger = picture;
    if (session.status === 401) {
      actionInboxResult = null;
      actionInboxPromise = null;
      window.lvptOperatingPictureResult = null;
      window.lvptOperatingPicturePromise = null;
      ledger = { ok: false, status: 401, data: {} };
    }
    const jobs = ledger.ok && ledger.data && Array.isArray(ledger.data.jobs) ? ledger.data.jobs : [];
    const evidence = jobs.filter((job) => /gmail|sms/i.test(job.name)).map((job) => `<tr><td>${esc(job.name)}</td><td>${badge(finance.sourceStatus(job))}</td><td>${esc(job.detail || '')}</td></tr>`).join('');
    const queue = ledger.ok && ledger.data && Array.isArray(ledger.data.gmailQueue) ? ledger.data.gmailQueue : [];
    const gmailJob = jobs.find((job) => job.id === 'gmail-production') || null;
    const gmailCoverage = gmailJob && gmailJob.coverage;
    const queueRows = queue.map((item) => `<tr><td>${esc(item.domainKey)}</td><td>${esc(item.lastMessageAt || '')}</td><td>${esc(item.lastDirection || '')}</td><td>Needs review</td><td>${esc(item.subject || '')}</td></tr>`).join('');
    const queueEmpty = !ledger.ok
      ? 'Gmail header status did not load. This is not an empty mailbox.'
      : gmailCoverage === 'partial'
        ? `The header read is partial. ${queue.length} header thread${queue.length === 1 ? ' is' : 's are'} in this queue. A missing row is not an empty mailbox, and this is not a full mailbox scan.`
        : gmailCoverage === 'read-complete'
          ? (queue.length
            ? `The bounded header read finished. ${queue.length} header thread${queue.length === 1 ? ' is' : 's are'} in this queue. This is not a full mailbox scan.`
            : 'The bounded domain header read finished with no new threads. This is not a full mailbox scan.')
          : 'The header read is unavailable. No header count was taken. This is not an empty mailbox.';
    const storedRows = ledger.ok && ledger.data && Number.isFinite(Number(ledger.data.gmailActivityCount)) ? Number(ledger.data.gmailActivityCount) : null;
    const storedThreads = ledger.ok && ledger.data && Number.isFinite(Number(ledger.data.gmailThreadCount)) ? Number(ledger.data.gmailThreadCount) : null;
    const stored = !ledger.ok || !ledger.data
      ? 'The sheet did not load, so stored mail counts are hidden.'
      : `${storedRows == null ? 'Stored Gmail Activity rows were not counted' : `${storedRows} stored Gmail Activity rows`}. ${storedThreads == null ? 'Unique thread ids were not counted on this read' : `${storedThreads} unique thread ids in those rows`}. A stored row is not a header thread in this queue. A thread is not assigned to an event from this page.`;
    const threads = conversations.status === 401 ? [] : (conversations.ok && conversations.data && Array.isArray(conversations.data.threads) ? conversations.data.threads : []);
    const rcsData = rcs.ok && rcs.data ? rcs.data : null;
    const rcsRecords = rcsData && Array.isArray(rcsData.records) ? rcsData.records : [];
    const collectorLabel = rcsData && rcsData.collectorLabel ? rcsData.collectorLabel : 'Not paired';
    const collectorBadge = rcsData && rcsData.live === true ? badge('LIVE') : badge(collectorLabel);
    const smsDirection = (item) => item.incoming && item.outgoing ? 'Incoming and outgoing' : item.outgoing ? 'Outgoing' : 'Incoming';
    const smsRows = threads.slice(0, 12).map((item) => `<tr><td>SMS</td><td>${esc(smsDirection(item))}</td><td>${esc(item.newestAt || '')}</td><td>Not reported</td><td>${esc(item.match || 'unmatched')}</td><td>Android bridge</td><td>Not a Google pairing</td><td>Encrypted</td><td>${esc(item.threadKey)}</td></tr>`).join('');
    const rcsTimeline = rcsRecords.map((item) => `<tr><td>RCS</td><td>${esc(item.direction === 'outgoing' ? 'Outgoing' : 'Incoming')}</td><td>${esc(item.messageAt || '')}</td><td>${esc(item.ingestedAt || '')}</td><td>${esc(item.match || 'unmatched')}${item.label === 'TEST' ? ' · TEST' : ''}</td><td>${esc(collectorLabel)}</td><td>${esc(collectorLabel)}</td><td>Read only</td><td>${esc(item.providerId || item.googleMessageId || '')}</td></tr>`).join('');
    const rcsNote = rcsData
      ? `${collectorBadge} Last stored RCS ingestion ${esc(rcsData.lastIngestionAt || 'none')}. Newest RCS message ${esc(rcsData.newestMessageAt || 'none')}. Read only. Sending is off. Mark-read is off. A stored row is not a live collector. ${esc(rcsData.verificationPrerequisite || 'Collector heartbeat was not verified.')} ${rcsRecords.length} Google Messages rows were returned. Existing SMS rows were not rewritten. The staging server validates AES-GCM ciphertext with its storage key. That is not end-to-end encryption.`
      : `Google Messages collector status did not load (${esc((rcs.data && rcs.data.reason) || 'unavailable')}).`;
    const smsNote = conversations.status === 401
      ? 'Owner sign-in required. SMS metadata was not read.'
      : conversations.ok
      ? `${conversations.data.storedMessages || 0} stored SMS metadata rows. Message text stays encrypted. Exact matches use the event contact phone. Ambiguous and unmatched threads stay in review. Outgoing SMS is disabled.`
      : `SMS conversations did not load (${esc((conversations.data && conversations.data.reason) || 'unavailable')}). Ciphertext was not shown. This is not an empty inbox.`;
    const heartbeatJob = jobs.find((job) => job.id === 'sms-heartbeat') || null;
    const heartbeatStatus = heartbeatJob ? finance.sourceStatus(heartbeatJob) : 'NOT VERIFIED';
    const headerState = ledger.status === 0 ? 'TIMED OUT' : gmailCoverage || 'unavailable';
    view.innerHTML = shell('Communications', 'Gmail and approved SMS', 'Approve, Make Changes, Deny, and Edit Myself stay in the review workspace. This page does not send.', `${communicationsBody(session, audit)}<h3>Stored Gmail activity</h3><p class="muted">${esc(stored)}</p><h3>Bounded header read</h3><p class="muted">${badge(headerState)} ${esc(queueEmpty)} Full threads were not opened.</p><div class="hub-table-wrap"><table class="hub-table"><thead><tr><th>Domain</th><th>Newest header</th><th>Direction</th><th>Match</th><th>Subject</th></tr></thead><tbody>${queueRows || `<tr><td colspan="5">${esc(queueEmpty)}</td></tr>`}</tbody></table></div><h3>SMS historical metadata</h3><p class="muted">${smsNote}</p><h3>Android heartbeat</h3><p>${badge(ledger.status === 0 ? 'TIMED OUT' : heartbeatStatus)} ${esc((heartbeatJob && heartbeatJob.detail) || 'No phone heartbeat is stored. A stored SMS row cannot certify that the approved handset is collecting. Run the LVPT SMS bridge on the approved handset and confirm last_success_at. This server does not read that report.')}</p><h3>RCS pairing</h3><p class="muted">${rcsNote}</p><h3>SMS and RCS rows</h3><div class="hub-table-wrap" style="max-width:100%;overflow-x:auto"><table class="hub-table"><thead><tr><th>Source</th><th>Direction</th><th>Message time</th><th>Ingested</th><th>Match</th><th>Sync</th><th>Pairing</th><th>Access</th><th>Provider ID</th></tr></thead><tbody>${rcsTimeline}${smsRows}${(smsRows || rcsTimeline) ? '' : '<tr><td colspan="9">No SMS or RCS conversation metadata was returned.</td></tr>'}</tbody></table></div><p class="muted">Sending stays off. Gmail full threads stay on the authorized thread route. Calendar confirmation is still runLVPTSafeTaskSync on the approved Apps Script project.</p>`);
  }

  async function renderHealth(view) {
    view.innerHTML = shell('Source health', 'What ran, and what is only claimed', 'A finished job and a fresh source are different. Missing timestamps stay unmarked.', '<p class="muted">Checking sources…</p>');
    const generation = readGeneration;
    const [picture, inbox] = await Promise.all([
      loadLedger(),
      loadActionInbox()
    ]);
    if (generation !== readGeneration) return;
    if (picture.status === 401 || inbox.status === 401) {
      view.innerHTML = shell('Source health', 'What ran, and what is only claimed', 'Sign-in is separate from provider health.', `<p>${badge('AUTH REQUIRED')} Owner session required.</p><p>Provider status was not read. A blocked read is not a disconnected provider and not an empty source. Failed authorization does not invent zero totals.</p><p><a class="btn primary" href="/sms-review/index.html">Owner sign-in</a></p>`);
      return;
    }
    const pictureTimedOut = picture.status === 0;
    const inboxTimedOut = inbox.status === 0;
    const jobs = picture.ok && picture.data && Array.isArray(picture.data.jobs) ? picture.data.jobs : [];
    const namedJobs = jobs.length ? jobs : [
      { name: 'Financial source sync', schedule: 'This page read', owner: 'Command Center sheet', connected: false, recordsExamined: null, coverage: 'unavailable', detail: (picture.data && picture.data.message) || 'The sheet ledger did not load.', ownerAction: 'Restore the shared operating-picture read before trusting source counts.', scheduleVersusExecution: { scheduleIsNotExecution: true } },
      { name: 'Gmail ingestion', schedule: 'Not scheduled here', owner: 'No ingestion cursor', connected: false, recordsExamined: null, coverage: 'unavailable', detail: 'No mailbox read was recorded.', ownerAction: 'Do not treat a missing Gmail read as an empty mailbox.' },
      { name: 'SMS ingestion', schedule: 'Android staging import', owner: 'Encrypted store', connected: false, recordsExamined: null, coverage: 'unavailable', detail: 'An audit response is not a message sync.', ownerAction: 'Confirm SMS staging metadata separately from audit health.' }
    ];
    const scan = smsScanJob(inbox);
    const gmailHeader = inbox.ok && inbox.data && inbox.data.sources ? inbox.data.sources.gmailHeader : null;
    const gmailJob = inbox.ok && inbox.data && inbox.data.gmailProbe
      ? inbox.data.gmailProbe
      : { name: 'Gmail header metadata', connected: false, lastSuccess: '', recordsExamined: null, recordsCreated: 0, coverage: 'unavailable', detail: 'The Gmail header read did not load. No header count was taken.', ownerAction: 'Retry the bounded header read after authorization. A failed read is not zero headers.' };
    const listed = namedJobs.concat([scan, gmailJob]);
    const sms = inbox.ok && inbox.data && inbox.data.sources ? inbox.data.sources.sms : null;
    const sourceHealth = picture.ok && picture.data ? picture.data.sourceHealth : null;
    const timeoutNote = (pictureTimedOut || inboxTimedOut)
      ? `<div class="hub-callout"><strong>${badge('TIMED OUT')} Shared read timed out.</strong><p>A timeout is not disconnection proof of an empty source and is not a successful schedule execution. Examined counts stay not counted until a complete authorized read finishes.</p></div>`
      : '';
    const body = `${timeoutNote}${smsScanBlock(sms, scan)}${gmailScanBlock(gmailHeader)}${sourceHealthCards(sourceHealth)}<h3>Jobs and collectors</h3><p class="muted">Owner column is scheduler ownership. Executed stays blank unless actual run evidence exists. Partial coverage and freshness timestamps are listed beside status — never as green success alone.</p><div class="hub-table-wrap"><table class="hub-table" data-health-table="jobs"><thead><tr><th>Job</th><th>Owner</th><th>Schedule</th><th>Status</th><th>Coverage</th><th>Last attempt</th><th>Last success</th><th>Latest record</th><th>Latest ingest</th><th>Examined</th><th>Execution</th><th>Owner action</th><th>Evidence</th></tr></thead><tbody>${healthJobRows(listed)}</tbody></table></div><p class="muted">A historical import is not a current ingestion. A database response is not a phone upload. A stored row is not a device heartbeat. A partial metadata scan is not a complete import. A Gmail header is not a full thread. A job with no readable history stays Not observable. Schedules are never successful executions. No customer message was sent by this check. Shared operating-picture and action-inbox requests were reused for this view.</p>`;
    view.innerHTML = shell('Source health', 'What ran, and what is only claimed', 'A finished job and a fresh source are different. Missing timestamps stay unmarked.', body);
  }

  const ACTION_LABELS = {
    new_inquiry: 'New inquiry',
    reply_required: 'Reply required',
    awaiting_response: 'Awaiting response',
    new_activity: 'New activity',
    follow_up_due: 'Follow-up due',
    payment_confirmation: 'Payment confirmation required',
    event_task: 'Event task',
    vendor_obligation: 'Vendor obligation',
    needs_review: 'Needs review',
    unassigned: 'Unassigned',
    booked: 'Booked',
    invoice_sent: 'Invoice sent, not booked',
    payment_processing: 'Payment confirmation required',
    invoice_awaiting_deposit: 'Payment confirmation required',
    declined: 'Declined',
    cancelled: 'Cancelled',
    unknown_closure: 'Closure unknown',
    resolved: 'Resolved',
    unknown: 'Stage unknown',
    vendor: 'Vendor, not a sales lead'
  };

  const PRIORITY_RANK = { critical: 0, high: 1, medium: 2, low: 3 };

  function moneyCents(cents) {
    if (cents == null || !Number.isFinite(cents)) return 'Not recorded';
    return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  }

  function field(value) {
    return value == null || value === '' ? 'Not recorded' : value;
  }

  const actionUi = { filter: 'action', query: '', scroll: 0 };
  window.lvptActionUi = actionUi;
  window.lvptRememberActionView = function () {
    const input = document.querySelector('#actionSearch');
    if (input) actionUi.query = input.value;
    actionUi.scroll = window.scrollY;
  };
  function localLabel(value) {
    const raw = String(value || '').trim();
    if (!raw) return 'Not recorded';
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(raw);
    const parsed = dateOnly ? new Date(`${raw}T12:00:00`) : new Date(raw);
    if (Number.isNaN(parsed.getTime())) return raw;
    return parsed.toLocaleString('en-US', dateOnly
      ? { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric', year: 'numeric' }
      : { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  function priorityRank(value) {
    const key = String(value || '').trim().toLowerCase();
    return Object.prototype.hasOwnProperty.call(PRIORITY_RANK, key) ? PRIORITY_RANK[key] : 4;
  }

  function actionKind(record) {
    const classified = record && record.classification && record.classification.kind;
    if (classified) return classified;
    if (record && record.vendor) return 'vendor_obligation';
    return record && record.bucket ? record.bucket : 'needs_review';
  }

  function isValidCalendarDate(value) {
    const raw = String(value || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
    const year = Number(raw.slice(0, 4));
    const month = Number(raw.slice(5, 7));
    const day = Number(raw.slice(8, 10));
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return parsed.getUTCFullYear() === year
      && parsed.getUTCMonth() === month - 1
      && parsed.getUTCDate() === day;
  }

  function dueState(record, today) {
    const due = String(record && record.dueDate || '').trim();
    const day = String(today || '').trim();
    if (!due) return 'undated';
    if (!day) return 'unknown';
    if (!isValidCalendarDate(due) || !isValidCalendarDate(day)) return 'unknown';
    if (due < day) return 'overdue';
    if (due === day) return 'due';
    return 'scheduled';
  }

  function reviewHref(record) {
    const id = String(record && record.id || '').trim();
    if (!id) return '/sms-review/index.html#inboxReviewTitle';
    return `/sms-review/index.html?record=${encodeURIComponent(id)}#inboxReviewTitle`;
  }

  // Only omit proven presentation-only keys. Never omit channel, draft,
  // timeline, classification.evidence, or other business identity fields.
  const ACTION_SIGNATURE_OMIT = new Set();

  function canonicalizeActionValue(value) {
    if (value === null || value === undefined) return null;
    if (Array.isArray(value)) return value.map((item) => canonicalizeActionValue(item));
    if (typeof value === 'object') {
      const out = Object.create(null);
      for (const key of Object.keys(value).sort()) out[key] = canonicalizeActionValue(value[key]);
      return out;
    }
    if (typeof value === 'string') return value;
    if (typeof value === 'boolean' || typeof value === 'number') return value;
    return String(value);
  }

  function actionRecordSignature(record) {
    if (!record || typeof record !== 'object') return JSON.stringify(null);
    const filtered = Object.create(null);
    for (const key of Object.keys(record)) {
      if (ACTION_SIGNATURE_OMIT.has(key)) continue;
      filtered[key] = record[key];
    }
    return JSON.stringify(canonicalizeActionValue(filtered));
  }

  function collapseActionRecords(records) {
    const identity = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
    const grouped = new Map();
    const missingIdentity = [];
    for (const record of records || []) {
      const id = identity(record && record.id);
      if (!id) {
        missingIdentity.push(record);
        continue;
      }
      const list = grouped.get(id) || [];
      list.push(record);
      grouped.set(id, list);
    }
    const rows = [];
    const conflicts = [];
    for (const [id, list] of grouped) {
      const signatures = new Set(list.map(actionRecordSignature));
      if (signatures.size > 1) {
        conflicts.push({
          id,
          copies: list.length,
          kind: 'conflict',
          reason: 'Conflicting rows share this stable id and were excluded from the active queue until reviewed.'
        });
        continue;
      }
      rows.push(list[0]);
    }
    const missingIds = missingIdentity.map((record, index) => ({
      id: `(missing:${index + 1})`,
      copies: 1,
      kind: 'missing_id',
      label: record && (record.eventName || record.contact || record.eventId || 'Unlabeled record'),
      reason: 'Action record is missing a stable id and was excluded from the active queue until reviewed.'
    }));
    return { rows, conflicts, missingIds };
  }

  function renderAction(view) {
    view.innerHTML = shell('New leads and action required', 'One inbox', 'Gmail, approved SMS, events, and follow-ups. A draft is not a sent message.', '<p class="muted">Reading the sheet, mailbox headers, and SMS metadata…</p>');
    const generation = readGeneration;
    loadActionInbox().then((result) => {
      if (generation !== readGeneration) return;
      if (result.status === 401) {
        view.innerHTML = shell('New leads and action required', 'One inbox', 'Gmail, approved SMS, events, and follow-ups.', '<p class="hub-callout">Owner sign-in required. Action Required was not read. This is not an empty inbox.</p><p><a class="btn primary" href="/sms-review/index.html">Owner sign-in</a></p>');
        return;
      }
      if (!result.ok || !result.data || result.data.ok !== true) {
        view.innerHTML = shell('New leads and action required', 'One inbox', 'Gmail, approved SMS, events, and follow-ups.', `<p class="hub-callout">${esc((result.data && result.data.reason) || 'The inbox did not load.')}</p>`);
        return;
      }
      const data = result.data;
      const sources = data.sources || {};
      const gmail = data.gmail || {};
      const today = String(data.today || '').trim();
      const collapsed = collapseActionRecords(Array.isArray(data.records) ? data.records : []);
      const records = collapsed.rows;
      const recordConflicts = Array.isArray(collapsed.conflicts) ? collapsed.conflicts : [];
      const missingIdIssues = Array.isArray(collapsed.missingIds) ? collapsed.missingIds : [];
      const counts = data.counts || {};
      const filters = [
        ['action', 'Action required'],
        ['reply_required', 'Reply required'],
        ['follow_up_due', 'Follow-up due'],
        ['payment_confirmation', 'Payment confirmation'],
        ['review', 'Needs review'],
        ['resolved', 'Resolved'],
        ['vendor', 'Vendor'],
        ['due', 'Due or overdue'],
        ['all', 'All']
      ];
      const pipe = data.pipeline || {};
      const stages = pipe.stages || {};
      const crm = window.LVPTCrmAttribution;
      const conversionPanel = crm
        ? crm.formatAttributionPanel(crm.conversionReport(pipe), esc)
        : `<p class="muted">${esc((pipe.conversion && pipe.conversion.reason) || 'Booked divided by all events is not a conversion rate.')}</p>`;
      const pipeline = `<p class="muted">Lead pipeline. Stages: open ${esc(stages.open || 0)}, payment processing ${esc(stages.paymentProcessing || 0)}, awaiting deposit ${esc(stages.invoiceAwaitingDeposit || 0)}, invoice sent ${esc(stages.invoiceSent || 0)}, booked ${esc(stages.booked || 0)}, declined ${esc(stages.declined || 0)}, unknown ${esc(stages.unknown || 0)}. Due today ${esc(pipe.dueFollowUps || 0)}. Overdue ${esc(pipe.overdueFollowUps || 0)}. Vendors and resolved rows stay out of the default list.</p>${conversionPanel}`;
      const conflictBanner = recordConflicts.length
        ? `<div class="hub-callout" data-action-integrity="conflict"><strong>Integrity review required.</strong><p>${esc(recordConflicts.length)} conflicting action id${recordConflicts.length === 1 ? '' : 's'} excluded from the active queue. Identical copies still collapse to one row.</p><ul class="action-conflict-list">${recordConflicts.map((item) => `<li data-conflict-id="${esc(item.id)}">${esc(item.id)} · ${esc(item.copies)} copies · ${esc(item.reason)}</li>`).join('')}</ul></div>`
        : '';
      const missingIdBanner = missingIdIssues.length
        ? `<div class="hub-callout" data-action-integrity="missing-id"><strong>Integrity review required.</strong><p>${esc(missingIdIssues.length)} action record${missingIdIssues.length === 1 ? '' : 's'} missing a stable id excluded from the active queue.</p><ul class="action-conflict-list">${missingIdIssues.map((item) => `<li data-missing-id="${esc(item.id)}">${esc(item.label)} · ${esc(item.reason)}</li>`).join('')}</ul></div>`
        : '';
      const summary = `<div class="lifecycle-summary hub-metrics"><div><span>Action required</span><strong>${esc(counts.actionRequired || 0)}</strong></div><div><span>Needs review</span><strong>${esc(counts.review || 0)}</strong></div><div><span>Recorded email, not verified</span><strong>${esc(counts.recordedRecipientUnverified || 0)}</strong></div></div>${pipeline}${conflictBanner}${missingIdBanner}<p><a class="btn primary" href="/sms-review/index.html#inboxReviewTitle">Open the protected approval workspace</a></p><p class="muted">This Action Required page does not approve, send, or confirm receipt. The review workspace is where decisions are recorded; opening it from here is not an approval.</p><details><summary>Source status</summary>${smsScanBlock(sources.sms, data.smsProbe)}${gmailScanBlock(sources.gmailHeader)}<p>${esc(gmail.blocker || '')}</p></details>`;
      const ordered = records.slice().sort((a, b) => {
        const priorityDiff = priorityRank(a.priority) - priorityRank(b.priority);
        if (priorityDiff) return priorityDiff;
        const dueDiff = String(a.dueDate || '9999-99-99').localeCompare(String(b.dueDate || '9999-99-99'));
        if (dueDiff) return dueDiff;
        const nameDiff = String(a.eventName || a.contact || '').localeCompare(String(b.eventName || b.contact || ''));
        if (nameDiff) return nameDiff;
        return String(a.id || '').localeCompare(String(b.id || ''));
      });
      const cards = ordered.map((record) => {
        const info = record.qualification || {};
        const classification = record.classification || {};
        const evidence = classification.evidence || {};
        const draft = record.draft || {};
        const kind = actionKind(record);
        const label = ACTION_LABELS[kind] || ACTION_LABELS[record.bucket] || record.pipelineStage || record.bucket;
        const due = dueState(record, today);
        const dueText = due === 'unknown'
          ? 'Due date invalid or unavailable'
          : due === 'undated' || !record.dueDate
            ? 'No due date recorded'
            : `Due ${localLabel(record.dueDate)}`;
        const priorityText = record.priority ? `${record.priority} priority` : 'No priority recorded';
        const openEvent = record.eventId
          ? `<button type="button" class="btn small" data-view-record="${esc(record.eventId)}">View event</button>`
          : '';
        const reviewLink = `<a class="btn small" data-review-link="${esc(record.id || '')}" href="${esc(reviewHref(record))}" aria-label="Open review workspace for ${esc(record.id || 'this record')}. Does not approve or send.">Open review</a>`;
        const timeline = (record.timeline || []).map((item) => `<li><span>${esc(localLabel(item.at))}</span> ${esc(item.source || 'Unknown source')} ${esc(item.direction || '')}. Message text stays collapsed here.</li>`).join('');
        const evidenceBits = [];
        if (evidence.eventId) evidenceBits.push(`event ${evidence.eventId}`);
        if (Array.isArray(evidence.taskIds) && evidence.taskIds.length) evidenceBits.push(`tasks ${evidence.taskIds.join(', ')}`);
        if (Array.isArray(evidence.timelineSources) && evidence.timelineSources.length) evidenceBits.push(`sources ${evidence.timelineSources.join(', ')}`);
        if (Array.isArray(evidence.candidateEventIds) && evidence.candidateEventIds.length > 1) evidenceBits.push(`ambiguous candidates ${evidence.candidateEventIds.join(', ')}`);
        if (evidence.uncertainMatch) evidenceBits.push('uncertain match');
        if (evidence.missingEventId) evidenceBits.push('missing event id');
        const evidenceLine = evidenceBits.length
          ? evidenceBits.join(' · ')
          : 'No stronger stable-id evidence is attached to this row.';
        const recipientLine = draft.recipientVerified === true
          ? `Verified recipient evidence is present for ${esc(draft.recipient)}. Verification still does not send from this page.`
          : `Recorded Gmail address: ${esc(draft.recipient || 'None')}. Stored addresses are not verified recipients. Not verified and not an approval.`;
        const attribution = crm
          ? crm.acquisitionChannelLines(record)
          : { kind: 'unknown', channel: record.channel || 'unknown', combined: `${record.channel || 'unknown'} · acquisition not classified`, acquisitionText: 'Acquisition: Unknown (not recorded)', channelText: `Channel: ${record.channel || 'unknown'}` };
        return `<article class="action-card" data-record-id="${esc(record.id || '')}" data-event-id="${esc(record.eventId || '')}" data-bucket="${esc(record.bucket || '')}" data-classification="${esc(kind)}" data-priority="${esc(record.priority || '')}" data-due-date="${esc(record.dueDate || '')}" data-due-state="${esc(due)}" data-review="${record.review || kind === 'needs_review' ? 'yes' : 'no'}" data-vendor="${record.vendor || kind === 'vendor_obligation' ? 'yes' : 'no'}" data-overdue="${due === 'overdue' ? 'yes' : 'no'}" data-acquisition-kind="${esc(attribution.kind)}" data-channel="${esc(attribution.channel)}"><header><span class="badge warn">${esc(label)}</span><strong>${esc(record.eventName || field(record.contact))}</strong><span class="action-card-meta"><span>${esc(priorityText)}</span><span>${esc(dueText)}</span></span></header><p>${esc(field(record.nextAction))}</p><p class="muted" data-crm-acquisition-channel>${esc(attribution.combined)} Latest ${esc(localLabel(record.lastActivity))}. Times are America/Los_Angeles.</p><div class="actions">${openEvent}${reviewLink}</div><details class="action-evidence"><summary>Minimal evidence</summary><p>${esc(classification.reason || 'Classification evidence was not supplied for this row.')}</p><p class="muted">${esc(evidenceLine)}</p><p>${esc(record.company || '')} · ${esc(field(info.stage))}</p><p data-crm-acquisition>${esc(attribution.acquisitionText)}</p><p data-crm-channel>${esc(attribution.channelText)}</p><ul class="action-timeline">${timeline || '<li>No message metadata is stored on this record.</li>'}</ul><p>${recipientLine}</p><p class="muted">Expanding evidence does not approve, send, or confirm receipt.</p></details></article>`;
      }).join('');
      const empty = sources.sms && sources.sms.coverage === 'read-complete'
        ? 'No lead or follow-up records were returned.'
        : 'No records are listed. This is not proof that the inbox is empty.';
      const filterButtons = filters.map(([id, label]) => `<button type="button" class="btn small" data-action-filter="${id}" aria-pressed="false">${label}</button>`).join('');
      view.innerHTML = shell('New leads and action required', 'One inbox', 'A short list. Open a row for details. This page does not approve or send.', `${summary}<div class="review-actions action-filters" role="search" aria-label="Action Required filters"><label class="action-search-label" for="actionSearch">Search this list</label><input class="input" id="actionSearch" type="search" placeholder="Search this list" value="${esc(actionUi.query)}" aria-label="Search Action Required" />${filterButtons}<button type="button" class="btn small" id="actionFilterClear">Clear filter</button></div><div class="action-list" data-action-order="priority-due">${cards || `<p>${empty}</p>`}</div>`);
      const applyFilter = (name) => {
        actionUi.filter = name || 'all';
        const query = (view.querySelector('#actionSearch') && view.querySelector('#actionSearch').value || '').toLowerCase();
        actionUi.query = view.querySelector('#actionSearch') ? view.querySelector('#actionSearch').value : '';
        view.querySelectorAll('[data-action-filter]').forEach((item) => {
          const active = item.getAttribute('data-action-filter') === actionUi.filter;
          item.classList.toggle('active', active);
          item.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
        view.querySelectorAll('.action-card').forEach((card) => {
          const bucket = card.getAttribute('data-bucket');
          const kind = card.getAttribute('data-classification');
          const textMatch = !query || card.textContent.toLowerCase().includes(query);
          const dueStateAttr = card.getAttribute('data-due-state');
          const show = textMatch && (name === 'all'
            || (name === 'review' && (card.getAttribute('data-review') === 'yes' || kind === 'needs_review'))
            || (name === 'vendor' && (card.getAttribute('data-vendor') === 'yes' || kind === 'vendor_obligation'))
            || (name === 'due' && (dueStateAttr === 'due' || dueStateAttr === 'overdue') && !['resolved', 'declined', 'cancelled', 'unknown_closure'].includes(bucket) && kind !== 'resolved' && card.getAttribute('data-vendor') !== 'yes')
            || (name === 'resolved' && (bucket === 'resolved' || kind === 'resolved'))
            || (name === 'reply_required' && kind === 'reply_required')
            || (name === 'follow_up_due' && kind === 'follow_up_due')
            || (name === 'payment_confirmation' && kind === 'payment_confirmation')
            || (name === 'action' && !['resolved', 'declined', 'cancelled', 'unknown_closure'].includes(bucket) && card.getAttribute('data-vendor') !== 'yes'));
          card.hidden = !show;
        });
      };
      applyFilter(actionUi.filter || 'action');
      view.querySelector('#actionSearch')?.addEventListener('input', () => {
        const y = window.scrollY;
        applyFilter(actionUi.filter || 'action');
        window.scrollTo(0, y);
      });
      view.querySelectorAll('[data-action-filter]').forEach((button) => {
        button.addEventListener('click', () => {
          const y = window.scrollY;
          applyFilter(button.getAttribute('data-action-filter'));
          window.scrollTo(0, y);
        });
      });
      view.querySelector('#actionFilterClear')?.addEventListener('click', () => {
        const y = window.scrollY;
        const input = view.querySelector('#actionSearch');
        if (input) input.value = '';
        applyFilter('all');
        window.scrollTo(0, y);
      });
      if (actionUi.scroll) requestAnimationFrame(() => window.scrollTo(0, actionUi.scroll));
      view.querySelectorAll('[data-view-record]').forEach((button) => button.addEventListener('click', () => {
        if (typeof window.lvptOpenRecord === 'function') window.lvptOpenRecord(button.getAttribute('data-view-record'));
      }));
    });
  }

  window.lvptRenderUnifiedView = function (view, name) {
    if (name === 'finance') renderFinance(view);
    else if (name === 'communications') renderCommunications(view);
    else if (name === 'action') renderAction(view);
    else renderHealth(view);
  };

  window.lvptPaintOverviewHealth = function () {
    let strip = document.getElementById('hubOverviewStrip');
    if (!strip) {
      strip = document.createElement('section');
      strip.id = 'hubOverviewStrip';
      strip.className = 'hub-overview-strip';
      const anchor = document.getElementById('metricsGrid');
      if (anchor) anchor.before(strip);
    }
    strip.innerHTML = `<div><span>Operations hub</span><strong>Finance, communications, and source health reuse the shared operating-picture read. A stored row is not a heartbeat. Missing coverage stays unavailable, not zero.</strong></div><div><span>Approvals waiting</span><strong>Unavailable on Overview. Evidence lives in the review workspace. A draft is not an approval. Sends stay off until you approve a specific message.</strong></div><a class="btn small" href="/sms-review/index.html#inboxReviewTitle">Open approvals</a><a class="btn small" href="#" data-command-jump="health">Check source health</a>`;
    strip.querySelector('[data-command-jump]').addEventListener('click', (event) => {
      event.preventDefault();
      const button = document.querySelector('[data-command-view="health"]');
      if (button) button.click();
    });
    if (typeof window.lvptPaintOverviewLedger === 'function') window.lvptPaintOverviewLedger();
  };

  if (HUB_VIEWS.includes(localStorage.getItem('lvptCommandCenterView')) && typeof render === 'function') render();
  else window.lvptPaintOverviewHealth();
})();
