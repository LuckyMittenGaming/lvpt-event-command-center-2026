(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.LVPTOperationalReports = api;
})(typeof window === 'undefined' ? null : window, function (root) {
  'use strict';

  function deps() {
    if (typeof module === 'object' && module.exports && typeof require === 'function' && !root) {
      return {
        statusApi: require('./event-status.js'),
        crmApi: require('./lifecycle-command-center.js'),
        financeApi: require('./event-finance.js')
      };
    }
    return {
      statusApi: root && root.LVPTEventStatus,
      crmApi: root && root.LVPTCrmAttribution,
      financeApi: root && root.LVPTEventFinance
    };
  }

  function text(value, max) {
    return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max || 240);
  }

  function moneyLabel(cents) {
    if (cents === null || cents === undefined || !Number.isFinite(Number(cents))) return 'Unknown';
    return (Number(cents) / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  }

  function confidenceOf(field, cents, coverage, incompleteFields) {
    const incomplete = Array.isArray(incompleteFields) ? incompleteFields : [];
    if (incomplete.includes(field) || coverage === 'incomplete') {
      return {
        cents: null,
        label: 'Incomplete',
        confidence: 'low',
        source: 'operating-picture ledger',
        note: 'Coverage incomplete. Unknown amounts stay unknown and are not treated as zero.'
      };
    }
    if (cents === null || cents === undefined || !Number.isFinite(Number(cents))) {
      return {
        cents: null,
        label: 'Unknown',
        confidence: 'unavailable',
        source: 'operating-picture ledger',
        note: 'Amount was not supplied. Missing monetary data is not zero.'
      };
    }
    return {
      cents: Number(cents),
      label: moneyLabel(cents),
      confidence: 'ledger',
      source: 'Payments / Event Payouts sheet via shared operating picture',
      note: 'Ledger figure only. Not independent bank settlement.'
    };
  }

  function quoteSummaryFor(event) {
    const statusApi = deps().statusApi;
    if (statusApi && typeof statusApi.quoteCoverage === 'function') {
      return statusApi.quoteCoverage(event);
    }
    const lines = event && Array.isArray(event.quote) ? event.quote : [];
    let pricedCents = 0;
    let priced = false;
    lines.forEach((line) => {
      const quantity = Number(line && line.quantity);
      const price = Number(line && line.unitPrice);
      if (!Number.isFinite(quantity) || !Number.isFinite(price) || quantity <= 0 || price <= 0) return;
      priced = true;
      pricedCents += Math.round(quantity * price * 100);
    });
    const supplied = event && event.setup && Object.prototype.hasOwnProperty.call(event.setup, 'targetQuote')
      ? event.setup.targetQuote
      : undefined;
    let recordedTargetCents = null;
    let targetState = 'omitted';
    if (supplied !== undefined && supplied !== null && supplied !== '') {
      const number = Number(supplied);
      if (Number.isFinite(number) && number > 0) {
        recordedTargetCents = Math.round(number * 100);
        targetState = 'recorded';
      }
    }
    return {
      priced,
      pricedCents: priced ? pricedCents : null,
      recordedTargetCents,
      targetState,
      costKnown: false,
      costCents: null,
      linePartial: false,
      recordedZero: false
    };
  }

  function laneOf(event, today) {
    const statusApi = deps().statusApi;
    if (statusApi && typeof statusApi.eventLane === 'function') {
      return statusApi.eventLane(event, today);
    }
    return { lane: 'review', stage: 'unknown', past: false, completed: false, raw: event && event.status || '' };
  }

  function openTasksFor(event) {
    return (Array.isArray(event && event.tasks) ? event.tasks : []).filter((task) => {
      const status = String(task && task.status || '').toLowerCase();
      return status !== 'complete' && status !== 'completed' && status !== 'done';
    });
  }

  function resolveScope(events, options) {
    const list = Array.isArray(events) ? events.filter((row) => row && row.id) : [];
    const eventId = options && options.eventId ? String(options.eventId) : '';
    if (!eventId) {
      return {
        kind: 'portfolio',
        eventId: '',
        events: list,
        label: 'Authenticated portfolio · signed-in sheet snapshot',
        isolated: true,
        note: 'Portfolio scope includes every event id present in the supplied snapshot only.'
      };
    }
    const match = list.find((row) => String(row.id) === eventId) || null;
    if (!match) {
      return {
        kind: 'selected-missing',
        eventId,
        events: [],
        label: `Selected event ${eventId} is not in the current snapshot`,
        isolated: true,
        note: 'Another event was not substituted.'
      };
    }
    return {
      kind: 'selected-event',
      eventId: String(match.id),
      events: [match],
      label: `Selected event only · ${match.id}`,
      isolated: true,
      note: 'Selected-event reports contain no other event data.'
    };
  }

  function buildPipeline(scopedEvents, today) {
    const counts = { pipeline: 0, active: 0, past: 0, review: 0, booked: 0, historical: 0 };
    scopedEvents.forEach((event) => {
      const lane = laneOf(event, today);
      if (Object.prototype.hasOwnProperty.call(counts, lane.lane)) counts[lane.lane] += 1;
      else counts.review += 1;
      if (lane.lane === 'active' || /^booked$/i.test(String(event.status || ''))) counts.booked += 1;
      if (lane.lane === 'past' || lane.past) counts.historical += 1;
    });
    return counts;
  }

  function buildAcquisition(scopedEvents) {
    const crmApi = deps().crmApi;
    if (crmApi && typeof crmApi.summarizeEventAcquisition === 'function') {
      const summary = crmApi.summarizeEventAcquisition(scopedEvents);
      return {
        sources: summary.sources || {},
        bookedShare: summary.bookedShare || null,
        note: 'Recorded acquisition sources stay separate from communication channel.'
      };
    }
    return {
      sources: { organic: 0, referral: 0, form: 0, utm: 0, recorded: 0, unknown: scopedEvents.length },
      bookedShare: null,
      note: 'CRM attribution helper unavailable. Acquisition counts were not invented.'
    };
  }

  function buildQuotes(scopedEvents) {
    let pricedCents = 0;
    let pricedCount = 0;
    let targetCents = 0;
    let targetCount = 0;
    let unpriced = 0;
    let partial = 0;
    const eventIds = [];
    scopedEvents.forEach((event) => {
      const quote = quoteSummaryFor(event);
      eventIds.push(String(event.id));
      if (quote.targetState === 'recorded' && quote.recordedTargetCents != null) {
        targetCount += 1;
        targetCents += quote.recordedTargetCents;
      }
      if (quote.priced && quote.pricedCents != null) {
        pricedCount += 1;
        pricedCents += quote.pricedCents;
        if (quote.linePartial) partial += 1;
      } else if (quote.recordedZero) {
        // recorded zero stays zero, not unknown
      } else if (quote.targetState !== 'recorded') {
        unpriced += 1;
      }
    });
    return {
      pricedLineItemCents: pricedCount ? pricedCents : (scopedEvents.length ? null : 0),
      pricedCount,
      recordedTargetCents: targetCount ? targetCents : null,
      recordedTargetCount: targetCount,
      unpricedCount: unpriced,
      partialCount: partial,
      eventIds,
      note: 'Recorded target quotes are not added to priced line-item totals. A budget is not a quote.'
    };
  }

  function buildTasks(scopedEvents) {
    const open = [];
    scopedEvents.forEach((event) => {
      openTasksFor(event).forEach((task) => {
        open.push({
          eventId: String(event.id),
          taskId: String(task.id || task.task_id || ''),
          title: text(task.title || 'Untitled task', 160),
          owner: text(task.owner || '', 80),
          dueDate: text(task.dueDate || '', 40),
          priority: text(task.priority || '', 40)
        });
      });
    });
    return { openCount: open.length, open };
  }

  function buildLedgerSlice(ledger, eventId) {
    const money = ledger && ledger.money && typeof ledger.money === 'object' ? ledger.money : null;
    const coverage = money ? String(money.coverage || '') : '';
    const incompleteFields = money && Array.isArray(money.incompleteFields) ? money.incompleteFields : [];
    const payments = Array.isArray(ledger && ledger.payments) ? ledger.payments : null;
    const byEvent = Array.isArray(ledger && ledger.byEvent) ? ledger.byEvent : [];

    let receivables = confidenceOf('openClientExposure', money && money.openClientExposureCents, coverage, incompleteFields);
    let vendor = confidenceOf('vendorCommitted', money && money.vendorCommittedCents, coverage, incompleteFields);
    let receipts = confidenceOf(
      'verifiedClientReceipts',
      money && (money.verifiedClientReceiptGaps ? null : money.verifiedClientReceiptsCents),
      coverage,
      incompleteFields
    );

    if (eventId) {
      const row = byEvent.find((item) => item && String(item.eventId) === String(eventId)) || null;
      if (!row) {
        receivables = {
          cents: null,
          label: payments ? 'None recorded for this event' : 'Unknown',
          confidence: payments ? 'ledger' : 'unavailable',
          source: 'operating-picture byEvent',
          note: 'Selected-event receivables stay scoped to this event id.'
        };
        vendor = {
          cents: null,
          label: payments ? 'None recorded for this event' : 'Unknown',
          confidence: payments ? 'ledger' : 'unavailable',
          source: 'operating-picture byEvent',
          note: 'Selected-event vendor obligations stay scoped to this event id.'
        };
        receipts = {
          cents: null,
          label: payments ? 'None recorded for this event' : 'Unknown',
          confidence: payments ? 'ledger' : 'unavailable',
          source: 'operating-picture byEvent',
          note: 'Selected-event receipts stay scoped to this event id.'
        };
      } else {
        const incomplete = row.totalsIncomplete === true;
        receivables = confidenceOf('openClientExposure', incomplete ? null : row.outstandingCents, incomplete ? 'incomplete' : 'complete', incomplete ? ['openClientExposure'] : []);
        vendor = confidenceOf('vendorCommitted', incomplete ? null : row.vendorCommittedCents, incomplete ? 'incomplete' : 'complete', incomplete ? ['vendorCommitted'] : []);
        receipts = confidenceOf('verifiedClientReceipts', incomplete ? null : row.collectedCents, incomplete ? 'incomplete' : 'complete', incomplete ? ['verifiedClientReceipts'] : []);
      }
      if (Array.isArray(payments)) {
        const scopedPayments = payments.filter((row) => row && String(row.eventId) === String(eventId));
        receivables.paymentIds = scopedPayments.filter((row) => row.role === 'client_receivable').map((row) => row.paymentId).filter(Boolean);
        vendor.paymentIds = scopedPayments.filter((row) => row.role === 'vendor_expense').map((row) => row.paymentId).filter(Boolean);
      }
    }

    return {
      available: Boolean(money),
      coverage: coverage || (money ? 'unknown' : 'unavailable'),
      receivables,
      vendorObligations: vendor,
      verifiedReceipts: receipts,
      drawableCash: {
        cents: null,
        label: 'Unavailable',
        confidence: 'unavailable',
        source: 'ledger policy',
        note: (money && money.drawableCashReason) || 'Drawable cash is unavailable from the ledger.'
      }
    };
  }

  function buildExceptions(exceptions, eventId) {
    if (!Array.isArray(exceptions)) {
      return {
        available: false,
        count: null,
        items: [],
        note: 'Exceptions collection was not supplied. This is not an empty exception list.'
      };
    }
    const items = exceptions
      .filter((row) => row && (!eventId || String(row.eventId || '') === String(eventId)))
      .map((row) => ({
        id: String(row.id || ''),
        eventId: String(row.eventId || ''),
        detail: text(row.detail || row.id || 'Documented exception', 320),
        includedInTotals: row.includedInTotals === true
      }));
    return {
      available: true,
      count: items.length,
      items,
      note: 'Unresolved exceptions stay listed and are not used to invent totals.'
    };
  }

  function buildFreshness(jobs, financeHelper, now) {
    if (!Array.isArray(jobs)) {
      return {
        available: false,
        status: 'UNAVAILABLE',
        label: 'Source freshness unavailable',
        note: 'The jobs collection was not returned. It is not marked connected.',
        sources: []
      };
    }
    const financeApi = deps().financeApi;
    const statusFn = financeHelper && typeof financeHelper.sourceStatus === 'function'
      ? financeHelper.sourceStatus
      : (financeApi && typeof financeApi.sourceStatus === 'function' ? financeApi.sourceStatus : null);
    const sources = jobs.map((job) => {
      const probe = {
        connected: job && job.connected !== false,
        lastSuccess: job && job.lastSuccess,
        status: job && job.status,
        partial: job && job.partial === true,
        disabled: job && job.disabled === true,
        observable: job && job.observable,
        now: now || undefined
      };
      const status = statusFn ? statusFn(probe) : (job && job.status) || 'NOT VERIFIED';
      return {
        id: String(job && job.id || ''),
        name: text(job && (job.name || job.id) || 'Unnamed source', 120),
        status: String(status),
        lastSuccess: text(job && job.lastSuccess || '', 40)
      };
    });
    const worst = sources.some((row) => /UNAVAILABLE|NOT CONNECTED|DISABLED/i.test(row.status))
      ? 'DEGRADED'
      : sources.some((row) => /STALE|PARTIAL|UNVERIFIED|NOT VERIFIED/i.test(row.status))
        ? 'ATTENTION'
        : sources.length ? 'LIVE VERIFIED' : 'UNAVAILABLE';
    return {
      available: true,
      status: worst,
      label: `Source freshness: ${worst}`,
      note: 'A stored row is not a heartbeat. Scheduled time is not proof of execution.',
      sources
    };
  }

  function buildConversion(conversionInput, scopedEvents) {
    const crmApi = deps().crmApi;
    if (crmApi && typeof crmApi.conversionReport === 'function') {
      return crmApi.conversionReport(conversionInput || {
        denominator: scopedEvents.length,
        stages: {},
        conversion: {
          rate: null,
          reason: 'No eligible cohort and period are defined, so a conversion rate is unavailable. The booked count is a share of events on this list, not a conversion rate.'
        }
      });
    }
    return {
      cohort: 'Unavailable — no eligible cohort is defined',
      period: 'Unavailable — no conversion date range is defined',
      denominator: 'Unavailable — no consistent outcome denominator is defined for conversion',
      rate: null,
      rateLabel: 'Conversion rate: Unavailable',
      reason: 'Conversion requires a valid cohort denominator. Booked share is not a conversion rate.',
      canComputeRate: false
    };
  }

  function buildOperationalReport(input) {
    const options = input && typeof input === 'object' ? input : {};
    const apis = deps();
    const today = options.today
      || (apis.statusApi && typeof apis.statusApi.todayIso === 'function' ? apis.statusApi.todayIso(options.now) : '')
      || '';
    const scope = resolveScope(options.events, options);
    const scopedEvents = scope.events;
    const ledger = options.ledger && typeof options.ledger === 'object' ? options.ledger : null;
    const finance = buildLedgerSlice(ledger, scope.kind === 'selected-event' ? scope.eventId : '');
    const quotes = buildQuotes(scopedEvents);
    const pipeline = buildPipeline(scopedEvents, today);
    const acquisition = buildAcquisition(scopedEvents);
    const tasks = buildTasks(scopedEvents);
    const exceptions = buildExceptions(options.exceptions, scope.kind === 'selected-event' ? scope.eventId : '');
    const freshness = buildFreshness(options.jobs, options.financeApi || apis.financeApi, options.now);
    const conversion = buildConversion(options.conversion, scopedEvents);

    const forbiddenIds = [];
    if (scope.kind === 'selected-event') {
      const allowed = new Set([scope.eventId]);
      const all = Array.isArray(options.events) ? options.events : [];
      all.forEach((row) => {
        if (row && row.id && !allowed.has(String(row.id))) forbiddenIds.push(String(row.id));
      });
    }

    return {
      scope: {
        kind: scope.kind,
        eventId: scope.eventId,
        label: scope.label,
        isolated: scope.isolated,
        note: scope.note,
        eventCount: scopedEvents.length,
        eventIds: scopedEvents.map((row) => String(row.id))
      },
      pipeline,
      acquisition,
      quotes,
      bookedHistorical: {
        bookedCount: pipeline.booked,
        historicalCount: pipeline.historical,
        note: 'A past event date does not establish completion. Booked status stays explicit.'
      },
      finance,
      tasks,
      exceptions,
      freshness,
      conversion: {
        rate: conversion.rate,
        rateLabel: conversion.rateLabel,
        cohort: conversion.cohort,
        period: conversion.period,
        denominator: conversion.denominator,
        reason: conversion.reason,
        canComputeRate: conversion.canComputeRate === true,
        bookedShare: conversion.bookedShare || acquisition.bookedShare || null
      },
      financialConfidence: {
        pricedQuotes: quotes.pricedCount ? 'line-items' : 'unavailable',
        targetsSeparate: true,
        ledgerCoverage: finance.coverage,
        unknownIsNotZero: true,
        note: 'Unknown amounts remain unknown. Target quotes are not double-counted into priced totals.'
      },
      csvExport: null,
      csvExportReason: 'CSV export is omitted until authenticated scope, minimal fields, and spreadsheet-formula safety are authorized for operational reports.',
      isolation: {
        selectedEventOnly: scope.kind === 'selected-event',
        excludedEventIds: forbiddenIds,
        containsOtherEventData: false
      }
    };
  }

  function formatOperationalReportText(report) {
    const safe = report && typeof report === 'object' ? report : buildOperationalReport({});
    const lines = [
      'LVPT OPERATIONAL REPORT',
      '',
      `Scope: ${safe.scope.label}`,
      `Scope note: ${safe.scope.note}`,
      `Financial confidence: ${safe.financialConfidence.note}`,
      `Source freshness: ${safe.freshness.label}. ${safe.freshness.note}`,
      '',
      'PIPELINE',
      `Pipeline: ${safe.pipeline.pipeline}`,
      `Active: ${safe.pipeline.active}`,
      `Past / historical: ${safe.pipeline.historical}`,
      `Needs review: ${safe.pipeline.review}`,
      `Booked (explicit): ${safe.bookedHistorical.bookedCount}`,
      '',
      'ACQUISITION',
      `Organic: ${(safe.acquisition.sources && safe.acquisition.sources.organic) || 0}`,
      `Referral: ${(safe.acquisition.sources && safe.acquisition.sources.referral) || 0}`,
      `Website form: ${(safe.acquisition.sources && safe.acquisition.sources.form) || 0}`,
      `UTM: ${(safe.acquisition.sources && safe.acquisition.sources.utm) || 0}`,
      `Other known: ${(safe.acquisition.sources && safe.acquisition.sources.recorded) || 0}`,
      `Unknown: ${(safe.acquisition.sources && safe.acquisition.sources.unknown) || 0}`,
      safe.acquisition.note,
      '',
      'KNOWN QUOTE VALUES',
      `Priced line items: ${moneyLabel(safe.quotes.pricedLineItemCents)} (${safe.quotes.pricedCount} priced)`,
      `Recorded targets (separate): ${moneyLabel(safe.quotes.recordedTargetCents)} (${safe.quotes.recordedTargetCount} recorded)`,
      safe.quotes.note,
      '',
      'RECEIVABLES & VENDOR OBLIGATIONS',
      `Verified receipts: ${safe.finance.verifiedReceipts.label} [${safe.finance.verifiedReceipts.confidence}]`,
      `Receivables: ${safe.finance.receivables.label} [${safe.finance.receivables.confidence}]`,
      `Vendor obligations: ${safe.finance.vendorObligations.label} [${safe.finance.vendorObligations.confidence}]`,
      `Drawable cash: ${safe.finance.drawableCash.label}`,
      '',
      'TASKS',
      `Open tasks: ${safe.tasks.openCount}`,
      '',
      'EXCEPTIONS',
      safe.exceptions.available
        ? `Unresolved exceptions: ${safe.exceptions.count}`
        : safe.exceptions.note,
      '',
      'CONVERSION',
      safe.conversion.rateLabel,
      `Cohort: ${safe.conversion.cohort}`,
      `Period: ${safe.conversion.period}`,
      `Denominator: ${safe.conversion.denominator}`,
      safe.conversion.reason,
      '',
      'EXPORT',
      safe.csvExportReason
    ];
    if (safe.scope.kind === 'selected-event') {
      lines.splice(4, 0, `Selected event id: ${safe.scope.eventId}`);
      lines.splice(5, 0, 'Cross-event data: none');
    }
    return lines.join('\n');
  }

  return {
    buildOperationalReport,
    formatOperationalReportText,
    resolveScope,
    moneyLabel,
    confidenceOf
  };
});

function renderPostTab(event){ $('#tabContent').innerHTML=`<div class="panel-head"><div><p class="eyebrow small">After Action Review</p><h2>Post-Event Tracker</h2></div><button class="btn primary small" id="savePostBtn">Save Post-Event Notes</button></div><div class="form-grid two-col"><label>Client Feedback<textarea class="input" data-post="clientFeedback">${escapeHtml(event.postEvent.clientFeedback)}</textarea></label><label>What Went Well<textarea class="input" data-post="whatWentWell">${escapeHtml(event.postEvent.whatWentWell)}</textarea></label><label>Pain Points<textarea class="input" data-post="painPoints">${escapeHtml(event.postEvent.painPoints)}</textarea></label><label>Changes Next Time<textarea class="input" data-post="changesForNextTime">${escapeHtml(event.postEvent.changesForNextTime)}</textarea></label><label>Review Requested<select class="input" data-post="reviewRequested"><option value="false" ${!event.postEvent.reviewRequested?'selected':''}>No</option><option value="true" ${event.postEvent.reviewRequested?'selected':''}>Yes</option></select></label><label>Review Received<select class="input" data-post="reviewReceived"><option value="false" ${!event.postEvent.reviewReceived?'selected':''}>No</option><option value="true" ${event.postEvent.reviewReceived?'selected':''}>Yes</option></select></label><label>Rebooking Likelihood<select class="input" data-post="rebookingLikelihood">${['Low','Medium','High'].map(s=>`<option ${event.postEvent.rebookingLikelihood===s?'selected':''}>${s}</option>`).join('')}</select></label></div>`; all('[data-post]').forEach(field=>field.addEventListener('change',()=>{ const key=field.dataset.post; event.postEvent[key]=['reviewRequested','reviewReceived'].includes(key)?field.value==='true':field.value; saveEvents('Post-event note saved'); })); $('#savePostBtn').addEventListener('click',()=>saveEvents('Post-event notes saved')); }
function renderReportsTab(event){ $('#tabContent').innerHTML=`<div class="panel-head"><div><p class="eyebrow small">Partner Reports</p><h2>Before, After & Annual Summary</h2></div><select class="input" id="reportSelect" style="max-width:230px"><option value="pre">Pre-Event Report</option><option value="post">Post-Event Report</option><option value="year">Overall 2026 Report</option></select></div><textarea class="input report-box" id="reportBox" readonly></textarea><div class="actions top-gap"><button class="btn primary" id="copyReportBtn">Copy Report</button><button class="btn" onclick="window.print()">Print / Save PDF</button></div>`; const select=$('#reportSelect'); const box=$('#reportBox'); const refresh=()=>{ box.value=generateReport(event,select.value); }; select.addEventListener('change',refresh); $('#copyReportBtn').addEventListener('click',()=>navigator.clipboard.writeText(box.value).then(()=>toast('Report copied'))); refresh(); }
function renderSystemTab(){ $('#tabContent').innerHTML=`<div class="panel-head"><div><p class="eyebrow small">Security & Integrations</p><h2>System Configuration</h2></div><button class="btn small" id="systemCheckGmailBtn">Recheck Gmail</button></div><div class="system-grid"><div class="integration-card"><h3>Current Storage Mode</h3><p><strong>Event data:</strong> localStorage<br><strong>File data:</strong> IndexedDB<br><strong>Device sharing:</strong> Not yet enabled</p><p>This immediate version works without a paid database, but another browser or device cannot see the same records.</p></div><div class="integration-card"><h3>Cloud Document Upgrade</h3><p>For shared, durable invoices and receipts, connect private Vercel Blob storage and a database. Files should be private and served only through authenticated routes.</p><ul class="code-list"><li>BLOB_READ_WRITE_TOKEN</li><li>DATABASE_URL</li><li>Admin authentication / role controls</li></ul></div><div class="integration-card"><h3>Gmail Server Variables</h3><p>The included Gmail API routes activate after these encrypted Vercel environment variables are added:</p><ul class="code-list"><li>GMAIL_CLIENT_ID</li><li>GMAIL_CLIENT_SECRET</li><li>GMAIL_REFRESH_TOKEN</li><li>GMAIL_ACCOUNT_EMAIL=book@pokertraininglasvegas.com</li><li>GMAIL_SYNC_KEY (long random secret)</li></ul></div><div class="integration-card"><h3>Security Boundary</h3><p>The session sync key is typed by an administrator and stored only in sessionStorage until the browser tab closes. Gmail search and sending are blocked without the matching server-side secret.</p><p>Before broader staff access, add a true login system and move all event records to a central database.</p></div></div><div class="roadmap-list top-gap"><div class="roadmap-item"><h3>Recommended Production Order</h3><p>1. Complete the guided workflow with real events. 2. Add admin login. 3. Move events and tasks to Postgres. 4. Move files to private Blob storage. 5. authorize the book@ Gmail account. 6. Add scheduled server-side reminders and daily inbox sync.</p></div></div>`; $('#systemCheckGmailBtn').addEventListener('click',()=>checkGmailStatus(true)); }
function bindCollectionFields(collection){ all(`[data-collection="${collection}"]`).forEach(field=>field.addEventListener('change',()=>{ const event=current(); const item=event[collection].find(row=>row.id===field.dataset.id); if(!item) return; let value=field.value; if(['quantity','unitPrice','internalCost','rate'].includes(field.dataset.key)) value=num(value); if(field.dataset.key==='confirmed') value=field.value==='true'; item[field.dataset.key]=value; if(collection==='tasks'&&field.dataset.key==='status'){ if(taskIsComplete(item)) completeTask(item); else { delete item.completedAt; delete item.completedBy; } } saveEvents('Saved'); render(); })); all(`[data-remove="${collection}"]`).forEach(button=>button.addEventListener('click',()=>{ const event=current(); event[collection]=event[collection].filter(row=>row.id!==button.dataset.id); saveEvents('Removed'); render(); })); }

function reportMoneyLabel(value, known){
  if(known===false || value===null || value===undefined || value==='') return 'Unknown';
  if(typeof money==='function') return money(value);
  const number=Number(value);
  if(!Number.isFinite(number)) return 'Unknown';
  return number.toLocaleString('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0});
}

function generateReport(event,type){
  const ops=typeof window!=='undefined' ? window.LVPTOperationalReports : null;
  if(type==='year' || type==='overall' || type==='operational'){
    const built=ops && typeof ops.buildOperationalReport==='function'
      ? ops.buildOperationalReport({
          events: Array.isArray(events) ? events : [],
          ledger: window.lvptOperatingPicture && window.lvptOperatingPicture.report ? window.lvptOperatingPicture.report : null,
          jobs: window.lvptOperatingPicture && Array.isArray(window.lvptOperatingPicture.jobs) ? window.lvptOperatingPicture.jobs : null,
          exceptions: window.lvptOperatingPicture && Array.isArray(window.lvptOperatingPicture.exceptions) ? window.lvptOperatingPicture.exceptions : null,
          authenticated: true
        })
      : null;
    if(built && typeof ops.formatOperationalReportText==='function'){
      return ops.formatOperationalReportText(built);
    }
  }
  if(type!=='year'){
    if(!event||!event.id){
      return 'No event selected. Print/report output was not generated for another event.';
    }
    const scoped=Array.isArray(events)?events.find((row)=>row&&row.id===event.id):null;
    if(!scoped){
      return 'Selected event id is not in the current snapshot. Another event was not substituted.';
    }
    event=scoped;
  }
  const setup=event.setup||{};
  const payment=event.payment||{};
  const post=event.postEvent||{};
  const staff=Array.isArray(event.staff)?event.staff:[];
  const compliance=Array.isArray(event.compliance)?event.compliance:[];
  const tasks=Array.isArray(event.tasks)?event.tasks:[];
  const docs=Array.isArray(event.documents)?event.documents:[];
  const quote=window.LVPTEventStatus && typeof window.LVPTEventStatus.quoteCoverage==='function'
    ? window.LVPTEventStatus.quoteCoverage(event)
    : null;
  const pricedKnown=quote ? quote.priced===true && quote.pricedCents!=null : Array.isArray(event.quote) && event.quote.length>0;
  const total=quote && quote.priced ? (quote.pricedCents/100) : (pricedKnown ? quoteTotal(event) : null);
  const costKnown=quote ? quote.costKnown===true && quote.costCents!=null : false;
  const cost=costKnown ? (quote.costCents/100) : null;
  const profit=pricedKnown && costKnown ? total-cost : null;
  const targetKnown=quote ? quote.targetState==='recorded' && quote.recordedTargetCents!=null : (setup.targetQuote!==undefined && setup.targetQuote!==null && setup.targetQuote!=='' && Number(setup.targetQuote)>0);
  const targetDisplay=targetKnown ? (quote ? quote.recordedTargetCents/100 : setup.targetQuote) : null;
  const paidKnown=payment && Object.prototype.hasOwnProperty.call(payment,'amountPaid') && payment.amountPaid!=='' && payment.amountPaid!=null;
  const paidValue=paidKnown ? Number(payment.amountPaid) : null;
  const balanceValue=pricedKnown && paidKnown ? Math.max(total-Number(paidValue||0),0) : null;
  const completion=setupCompleteness(event);
  const documentText=typeof formatDocumentAssociationText==='function'
    ? formatDocumentAssociationText(event)
    : (docs.map((d)=>`- ${d.id||'missing-id'}: ${d.category||'Category unavailable'}: ${d.name||'Untitled'}`).join('\n')||'No documents indexed.');
  const scopeLine=`Scope: selected event only (${event.id}). Source freshness and ledger confidence belong on the operational portfolio report. Target quotes stay separate from priced line items. Unknown amounts remain Unknown.`;
  if(type==='post') return `LVPT POST-EVENT PARTNER REPORT\n\n${scopeLine}\n\nEvent ID: ${event.id}\nEvent: ${event.eventName}\nClient/Company: ${event.company}\nDate: ${event.eventDate}\nLocation: ${event.venue}, ${event.city}, ${event.state}\nFinal / Expected Attendance: ${event.guestCount}\nRevenue (priced lines): ${reportMoneyLabel(total,pricedKnown)}\nEstimated Cost: ${reportMoneyLabel(cost,costKnown)}\nEstimated Profit: ${reportMoneyLabel(profit,pricedKnown&&costKnown)}\nPayment Status: ${payment.status||'Unknown'}\nBalance Due: ${reportMoneyLabel(balanceValue,pricedKnown&&paidKnown)}\nDocuments Indexed: ${docs.length}\n\nClient Feedback:\n${post.clientFeedback||'Not entered yet.'}\n\nWhat Went Well:\n${post.whatWentWell||'Not entered yet.'}\n\nPain Points:\n${post.painPoints||'Not entered yet.'}\n\nChanges For Next Time:\n${post.changesForNextTime||'Not entered yet.'}\n\nReview Requested: ${post.reviewRequested?'Yes':'No'}\nReview Received: ${post.reviewReceived?'Yes':'No'}\nRebooking Likelihood: ${post.rebookingLikelihood||'Unavailable'}\n\nDOCUMENTS\n${documentText}\n\nNext Recommended Action:\n${event.nextAction||''}`;
  return `LVPT PRE-EVENT COMMAND REPORT\n\n${scopeLine}\n\nEvent ID: ${event.id}\nEvent: ${event.eventName}\nClient/Company: ${event.company}\nPrimary Contact: ${event.contactName} | ${event.contactEmail} | ${event.contactPhone}\nDate/Time: ${event.eventDate}, ${humanTime(event.startTime)} - ${humanTime(event.endTime)}\nLocation: ${event.venue}, ${event.city}, ${event.state}\nVenue Status: ${setup.venueStatus}\nEvent Type: ${event.eventType}\nPrimary Goal: ${setup.primaryGoal}\nFormat: ${event.eventFormat}\nGuest Count: ${event.guestCount}\nTraining Participants: ${event.studentCount}\nPipeline Status: ${event.status}\nClose Probability: ${event.probabilityToClose}%\nSetup Completion: ${completion.percent}%\n\nFINANCIAL SUMMARY\nQuote Total (priced lines): ${reportMoneyLabel(total,pricedKnown)}\nRecorded target quote (not added to priced total): ${reportMoneyLabel(targetDisplay,targetKnown)}\nAmount Paid: ${reportMoneyLabel(paidValue,paidKnown)}\nBalance Due: ${reportMoneyLabel(balanceValue,pricedKnown&&paidKnown)}\nEstimated Cost: ${reportMoneyLabel(cost,costKnown)}\nEstimated Profit: ${reportMoneyLabel(profit,pricedKnown&&costKnown)}\nDeposit Required: ${reportMoneyLabel(payment.depositRequired,payment && payment.depositRequired!=null && payment.depositRequired!=='')}\nPayment Status: ${payment.status||'Unknown'}\nPO Required: ${setup.poRequired}\nPO Number: ${setup.poNumber||'Not provided'}\n\nPRODUCTION\nTables: ${setup.tableCount}\nPros / Instructors: ${setup.proCount}\nDealers: ${setup.dealerCount}\nSetup Access: ${humanTime(setup.setupTime)}\nStrike By: ${humanTime(setup.strikeTime)}\nEquipment: ${setup.equipmentSource}\nParking / Loading: ${setup.parkingInstructions||'Not entered'}\n\nCLIENT EXPECTATIONS\n${event.clientExpectations}\n\nKNOWN RISKS\n${event.knownRisks}\n\nSTAFFING PLAN\n${staff.map(s=>`- ${s.name} | ${s.role} | Confirmed: ${s.confirmed?'Yes':'No'} | Arrival: ${humanTime(s.arrivalTime)}`).join('\n')||'No staff assigned yet.'}\n\nCOMPLIANCE STATUS\n${compliance.map(c=>`- ${c.name}: ${c.status} | Due: ${c.dueDate||'N/A'}`).join('\n')||'No compliance items yet.'}\n\nOPEN TASKS\n${tasks.filter(t=>t.status!=='Complete').map(t=>`- ${t.title} | Owner: ${t.owner} | Due: ${t.dueDate||'N/A'} | Priority: ${t.priority}`).join('\n')||'No open tasks.'}\n\nDOCUMENTS\n${documentText}\n\nNEXT ACTION\n${event.nextAction}\nDue: ${event.nextActionDue||'Not set'}`;
}
function exportJson(){ const exportEvents=events.map(event=>({...event,documents:event.documents.map(document=>({...document,fileStoredLocally:true}))})); download('lvpt-2026-event-command-center-export.json',JSON.stringify(exportEvents,null,2),'application/json'); }
function exportCsv(){
  toast('Operational CSV export is omitted until authenticated minimal-field spreadsheet safety is authorized.');
}
function download(name,content,type){ const blob=new Blob([content],{type}); const url=URL.createObjectURL(blob); const anchor=document.createElement('a'); anchor.href=url; anchor.download=name; anchor.click(); URL.revokeObjectURL(url); }
function resetDemoData(){ toast('Restore Official Roster is off in this preview. The sheet was not changed.'); }

if (typeof window !== 'undefined' && typeof document !== 'undefined' && typeof init === 'function') {
  init();
}
