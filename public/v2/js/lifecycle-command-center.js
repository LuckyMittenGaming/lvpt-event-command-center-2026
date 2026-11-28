(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.LVPTCrmAttribution = api;
})(typeof window === 'undefined' ? null : window, function () {
  'use strict';

  const SOURCE_KIND_LABELS = {
    organic: 'Organic search',
    referral: 'Referral',
    form: 'Website form',
    utm: 'UTM attribution',
    recorded: 'Other known source',
    unknown: 'Unknown source'
  };

  function text(value, max) {
    return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max || 180);
  }

  function recorded(value, max) {
    const clean = text(value, max);
    if (!clean || clean === '0' || /^(not provided|tbd|unknown|n\/a)$/i.test(clean)) return '';
    return clean;
  }

  function classifyLeadSource(leadSource) {
    if (!leadSource) return { kind: 'unknown', label: '' };
    if (/^(organic|seo|organic search)$/i.test(leadSource)) return { kind: 'organic', label: leadSource };
    if (/referral/i.test(leadSource)) return { kind: 'referral', label: leadSource };
    if (/\bform\b/i.test(leadSource)) return { kind: 'form', label: leadSource };
    return { kind: 'recorded', label: leadSource };
  }

  function acquisitionOf(row) {
    if (!row || typeof row !== 'object') {
      return { kind: 'unknown', label: '', leadSource: '', utmSource: '', utmCampaign: '' };
    }
    if (recorded(row.acquisitionKind)) {
      return {
        kind: String(row.acquisitionKind),
        label: recorded(row.acquisitionLabel) || recorded(row.acquisitionLeadSource) || '',
        leadSource: recorded(row.acquisitionLeadSource) || recorded(row.leadSource) || '',
        utmSource: recorded(row.acquisitionUtmSource) || recorded(row.utmSource) || recorded(row.utm_source) || '',
        utmCampaign: recorded(row.acquisitionUtmCampaign) || recorded(row.utmCampaign) || recorded(row.utm_campaign) || ''
      };
    }
    const leadSource = recorded(row.leadSource) || recorded(row.acquisitionLeadSource) || '';
    const utmSource = recorded(row.utmSource || row.utm_source || row.acquisitionUtmSource);
    const utmCampaign = recorded(row.utmCampaign || row.utm_campaign || row.acquisitionUtmCampaign);
    const utm = [utmSource, utmCampaign].filter(Boolean);
    if (utm.length) {
      return { kind: 'utm', label: utm.join(' / '), leadSource, utmSource, utmCampaign };
    }
    if (leadSource) {
      const classified = classifyLeadSource(leadSource);
      return { kind: classified.kind, label: classified.label, leadSource, utmSource: '', utmCampaign: '' };
    }
    const fallback = recorded(row.source);
    if (fallback && fallback !== 'Unknown') {
      const classified = classifyLeadSource(fallback);
      return { kind: classified.kind, label: classified.label, leadSource: fallback, utmSource: '', utmCampaign: '' };
    }
    return { kind: 'unknown', label: '', leadSource: '', utmSource: '', utmCampaign: '' };
  }

  function channelOf(row) {
    const channel = recorded(row && row.channel);
    return channel || 'unknown';
  }

  function acquisitionChannelLines(row) {
    const acquired = acquisitionOf(row);
    const channel = channelOf(row);
    const kindLabel = SOURCE_KIND_LABELS[acquired.kind] || acquired.kind;
    const acquisitionText = acquired.kind === 'unknown'
      ? 'Acquisition: Unknown (not recorded)'
      : `Acquisition: ${acquired.label || kindLabel} (${acquired.kind})`;
    const channelText = `Channel: ${channel}`;
    return {
      kind: acquired.kind,
      label: acquired.label,
      channel,
      acquisitionText,
      channelText,
      combined: `${acquisitionText}. ${channelText}. Channel is not an acquisition source.`,
      kindLabel
    };
  }

  function emptySources() {
    return { organic: 0, referral: 0, form: 0, utm: 0, recorded: 0, unknown: 0 };
  }

  function finiteCount(value) {
    if (value == null || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function conversionReport(pipeline) {
    const pipe = pipeline && typeof pipeline === 'object' ? pipeline : {};
    const conversion = pipe.conversion && typeof pipe.conversion === 'object' ? pipe.conversion : null;
    const stages = pipe.stages && typeof pipe.stages === 'object' ? pipe.stages : {};
    const sources = pipe.sources && typeof pipe.sources === 'object' ? { ...emptySources(), ...pipe.sources } : emptySources();
    const listDenominator = finiteCount(pipe.denominator);
    const bookedNumeratorRaw = conversion ? finiteCount(conversion.numerator) : null;
    const bookedNumerator = bookedNumeratorRaw != null
      ? bookedNumeratorRaw
      : finiteCount(stages.booked);
    const bookedDenominatorRaw = conversion ? finiteCount(conversion.denominator) : null;
    const bookedDenominator = bookedDenominatorRaw != null ? bookedDenominatorRaw : listDenominator;
    const bookedShareValid = bookedNumerator != null
      && bookedDenominator != null
      && bookedNumerator >= 0
      && bookedDenominator >= 0
      && bookedNumerator <= bookedDenominator;
    const cohort = recorded(conversion && conversion.cohort, 240);
    const period = recorded(conversion && conversion.period, 240);
    const outcomeNumerator = conversion ? finiteCount(conversion.outcomeNumerator) : null;
    const outcomeDenominator = conversion ? finiteCount(conversion.outcomeDenominator) : null;
    const suppliedRate = conversion && conversion.rate != null ? finiteCount(conversion.rate) : null;
    const hasCohort = Boolean(cohort);
    const hasPeriod = Boolean(period);
    const unavailableReason = 'No eligible cohort and period are defined, so a conversion rate is unavailable. The booked count is a share of events on this list, not a conversion rate.';
    const suppliedReason = recorded(conversion && conversion.reason, 500);
    let canComputeRate = false;
    let rateValue = null;
    let denial = '';

    if (!hasCohort || !hasPeriod) {
      denial = unavailableReason;
    } else if (outcomeNumerator == null || outcomeDenominator == null) {
      denial = 'Conversion rate is unavailable because a valid outcome numerator and outcome denominator were not both provided.';
    } else if (outcomeNumerator < 0 || outcomeDenominator < 0) {
      denial = 'Conversion rate is unavailable because outcome counts must not be negative.';
    } else if (outcomeDenominator === 0) {
      denial = 'Conversion rate is unavailable because the outcome denominator must be greater than zero.';
    } else if (outcomeNumerator > outcomeDenominator) {
      denial = 'Conversion rate is unavailable because the outcome numerator exceeds the outcome denominator.';
    } else if (
      Number.isInteger(outcomeNumerator) === false
      || Number.isInteger(outcomeDenominator) === false
    ) {
      denial = 'Conversion rate is unavailable because outcome counts must be whole numbers.';
    } else {
      const derivedRate = outcomeNumerator / outcomeDenominator;
      const alternateOutcomeDenominator = conversion ? finiteCount(conversion.cohortDenominator) : null;
      if (
        alternateOutcomeDenominator != null
        && alternateOutcomeDenominator !== outcomeDenominator
      ) {
        denial = 'Conversion rate is unavailable because outcome denominators are inconsistent.';
      } else if (suppliedRate != null) {
        if (suppliedRate < 0 || suppliedRate > 1) {
          denial = 'Conversion rate is unavailable because the supplied rate is outside the valid 0 to 1 range.';
        } else if (Math.abs(suppliedRate - derivedRate) > 0.0001) {
          denial = 'Conversion rate is unavailable because the supplied rate does not match the validated outcome counts.';
        } else {
          canComputeRate = true;
          rateValue = derivedRate;
        }
      } else {
        canComputeRate = true;
        rateValue = derivedRate;
      }
    }

    const reason = canComputeRate
      ? (suppliedReason || 'Conversion rate derived from the validated cohort outcome counts.')
      : (denial || suppliedReason || unavailableReason);

    return {
      cohort: hasCohort ? cohort : 'Unavailable — no eligible cohort is defined',
      period: hasPeriod ? period : 'Unavailable — no conversion date range is defined',
      denominator: canComputeRate
        ? `Conversion denominator: ${outcomeDenominator}`
        : 'Unavailable — no consistent outcome denominator is defined for conversion',
      rate: canComputeRate ? rateValue : null,
      rateLabel: canComputeRate ? `Conversion rate: ${(rateValue * 100).toFixed(1)}%` : 'Conversion rate: Unavailable',
      reason,
      bookedShare: {
        label: 'Booked share',
        numerator: bookedShareValid ? bookedNumerator : null,
        denominator: bookedShareValid ? bookedDenominator : null,
        text: bookedShareValid
          ? `Booked share: ${bookedNumerator} of ${bookedDenominator} events with explicit Booked status`
          : 'Booked share: Unavailable',
        note: 'Booked share is not a conversion rate.'
      },
      sources,
      canComputeRate
    };
  }

  function normalizeStatus(value) {
    return String(value ?? '').replace(/[\u2012\u2013\u2014\u2015]/g, '-').replace(/\s+/g, ' ').trim();
  }

  function isExplicitBooked(event) {
    if (recorded(event && event.pipelineStage) === 'booked') return true;
    return /^booked$/i.test(normalizeStatus(event && event.status));
  }

  function summarizeEventAcquisition(events) {
    const list = Array.isArray(events) ? events : [];
    const sources = emptySources();
    let booked = 0;
    list.forEach((event) => {
      const acquired = acquisitionOf(event);
      if (Object.prototype.hasOwnProperty.call(sources, acquired.kind)) sources[acquired.kind] += 1;
      else sources.recorded += 1;
      if (isExplicitBooked(event)) booked += 1;
    });
    return conversionReport({
      denominator: list.length,
      stages: { booked },
      sources,
      conversion: {
        numerator: booked,
        denominator: list.length,
        rate: null,
        reason: 'No eligible cohort and period are defined, so a conversion rate is unavailable. The booked count is a share of events on this list, not a conversion rate.'
      }
    });
  }

  function formatAttributionPanel(report, escapeHtml) {
    const esc = typeof escapeHtml === 'function'
      ? escapeHtml
      : (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    const safe = report && typeof report === 'object' ? report : conversionReport(null);
    const sourceBits = Object.keys(SOURCE_KIND_LABELS).map((kind) => {
      const count = safe.sources && Number.isFinite(Number(safe.sources[kind])) ? Number(safe.sources[kind]) : 0;
      return `<li data-crm-source-kind="${esc(kind)}">${esc(SOURCE_KIND_LABELS[kind])}: ${esc(count)}</li>`;
    }).join('');
    const booked = safe.bookedShare || {};
    return `<section class="hub-callout" data-crm-attribution="panel"><strong>CRM attribution</strong><p data-crm-conversion-rate="${esc(safe.rate == null ? 'unavailable' : String(safe.rate))}">${esc(safe.rateLabel)}</p><p data-crm-cohort>${esc(`Cohort: ${safe.cohort}`)}</p><p data-crm-period>${esc(`Period: ${safe.period}`)}</p><p data-crm-denominator>${esc(`Denominator: ${safe.denominator}`)}</p><p data-crm-booked-share>${esc(booked.text || 'Booked share: Unavailable')}. ${esc(booked.note || 'Booked share is not a conversion rate.')}</p><p class="muted">${esc(safe.reason)}</p><p><strong>Recorded acquisition sources</strong></p><ul data-crm-acquisition-sources>${sourceBits}</ul><p class="muted">Acquisition source stays separate from communication channel (Gmail, SMS, RCS).</p></section>`;
  }

  return {
    SOURCE_KIND_LABELS,
    acquisitionOf,
    channelOf,
    acquisitionChannelLines,
    conversionReport,
    summarizeEventAcquisition,
    formatAttributionPanel
  };
});

if (typeof window !== 'undefined' && typeof document !== 'undefined') (() => {
  const VIEW_KEY = 'lvptCommandCenterView';
  const APP_KEY = 'lvptAppSyncKey';
  let recordOpen = false;
  const statusApi = () => window.LVPTEventStatus;
  const crmApi = () => window.LVPTCrmAttribution;
  const reportsApi = () => window.LVPTOperationalReports;
  const dateTimeApi = () => window.LVPTEventDateTime;
  const financeApi = () => window.LVPTEventFinance;
  const cadenceApi = () => window.LVPTFollowUpCadence;
  const masterApi = () => window.LVPTMasterControls;
  const HISTORICAL_PROPOSAL_STATUS = 'Historical reference, not verified';
  const proposals = [
    { id:'proposal-nium', client:'NIUM', title:'NIUM VIP Casino Lounge', project:'lvpt-nium-proposal', url:'https://lvpt-nium-proposal.vercel.app/', status:HISTORICAL_PROPOSAL_STATUS, updated:'2026-07-16', eventId:'evt-nium-2026', tags:['Palms Place','Casino Night','Custom Assets','Transportation'], notes:'Enterprise proposal with venue comparisons, custom chips/cards/felts, premium catering, open bar and transportation.' },
    { id:'proposal-neo-2026', client:'Mosaic Events / NEO', title:'NEO Reunion 2026', project:'mosaic-neo-2026-proposal', url:'https://mosaic-neo-2026-proposal.vercel.app/', status:HISTORICAL_PROPOSAL_STATUS, updated:'2026-08-13', eventId:'evt-neo-reunion-2026', tags:['Training','Tournament','Ritz-Carlton','Repeat Client'], notes:'Year-two training and tournament proposal with premium instructor positioning and event improvements.' },
    { id:'proposal-workato', client:'Workato', title:'Workato Poker Experience', project:'workato-poker-experience', url:'https://workato-poker-experience.vercel.app/', status:HISTORICAL_PROPOSAL_STATUS, updated:'2026-08-12', eventId:'', tags:['Venue Options','Transportation','Catering','Image Gallery'], notes:'Multi-route Las Vegas proposal featuring Palms Place, Venetian poker room, Mob Museum and Allegiant Stadium.' },
    { id:'proposal-safelease', client:'SafeLease', title:'SafeLease Poker Experience', project:'safelease-poker-experience', url:'https://safelease-poker-experience.vercel.app/', status:HISTORICAL_PROPOSAL_STATUS, updated:'2026-08-05', eventId:'', tags:['Trade Show','Lead Generation','ARIA','Booth Activation'], notes:'Trade-show poker activation proposal with booth engagement and future tournament opportunity.' },
    { id:'proposal-ownwell', client:'Ownwell', title:'Ownwell Poker Proposal', project:'ownwell-poker-proposal', url:'https://ownwell-poker-proposal.vercel.app/', status:HISTORICAL_PROPOSAL_STATUS, updated:'2026-08-05', eventId:'', tags:['Gallery','Visual Reference','Poker Experience'], notes:'Past proposal retained as a visual and image-gallery reference for future builds.' },
    { id:'proposal-defending-education', client:'Defending Education', title:'Defending Education Poker Proposal', project:'defending-education-poker-proposal', url:'https://defending-education-poker-proposal.vercel.app/', status:HISTORICAL_PROPOSAL_STATUS, updated:'2026-07-24', eventId:'', tags:['Corporate','Training','Proposal Reference'], notes:'Past corporate poker proposal retained for layouts, copy modules and reusable presentation patterns.' },
  ];

  let commandView = localStorage.getItem(VIEW_KEY) || 'overview';
  let detail = null;
  let suppressHistory = false;
  const listMemory = {};
  let proposalQuery = '';
  let automationState = { loading:false, loaded:false, configured:false, lastScanAt:'', nextMorning:'', nextEvening:'', items:[], stats:{} };

  const baseEnsureEventShape = ensureEventShape;
  ensureEventShape = function(event) {
    const hadPayment = event && event.payment && event.payment.amountPaid !== undefined && event.payment.amountPaid !== null && event.payment.amountPaid !== '';
    const shaped = baseEnsureEventShape(event);
    shaped.paymentRecorded = Boolean(hadPayment);
    shaped.proposalUrl = shaped.proposalUrl || '';
    shaped.proposalId = shaped.proposalId || '';
    shaped.proposalStatus = shaped.proposalStatus || '';
    shaped.automationReview = Array.isArray(shaped.automationReview) ? shaped.automationReview : [];
    shaped.automationMeta = shaped.automationMeta || {};
    return shaped;
  };
  events = events.map(ensureEventShape);

  function todayString() { return statusApi() ? statusApi().todayIso() : new Date().toISOString().slice(0, 10); }
  function laneOf(event) { return statusApi() ? statusApi().eventLane(event, todayString()) : { lane: 'review', stage: 'unknown', past: false, completed: false, raw: event.status || '' }; }
  function isPastDate(event) { return laneOf(event).past && !laneOf(event).completed; }
  function isPipeline(event) { return laneOf(event).lane === 'pipeline'; }
  function isActive(event) { return laneOf(event).lane === 'active'; }
  function isArchive(event) { return laneOf(event).lane === 'past'; }
  function openTaskCount(event) { return (event.tasks || []).filter(task => !taskIsComplete(task)).length; }
  function eventTz(event) {
    return dateTimeApi() ? dateTimeApi().resolveEventTimeZone(event) : 'America/Los_Angeles';
  }
  function dateLabel(value, event) {
    if (!value) return 'Date TBD';
    if (dateTimeApi()) return dateTimeApi().formatEventDate(value, event || {}) || value;
    const date = new Date(`${value}T12:00:00`);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
  function formatCommWhen(value, event) {
    if (!value) return 'Date unavailable';
    if (dateTimeApi() && dateTimeApi().formatEventDateTime) {
      const stamped = dateTimeApi().formatEventDateTime(value, event);
      if (stamped) return stamped;
    }
    return String(value);
  }
  function runOfShowTime(value, event) {
    if (value == null || value === '') return '';
    if (dateTimeApi()) return dateTimeApi().formatEventTime(value, event) || String(value);
    return typeof humanTime === 'function' ? humanTime(value) : String(value);
  }
  function ageInDays(value) { if(!value) return Infinity; return Math.floor((Date.now()-new Date(value).getTime())/86400000); }
  function historicalProposalForEvent(event) {
    if (!event || !event.id) return null;
    return proposals.find((item) => item.eventId && item.eventId === event.id) || null;
  }
  function proposalUrlState(event) {
    return statusApi() && statusApi().proposalLinkState
      ? statusApi().proposalLinkState(event)
      : (String(event && event.proposalUrl || '').trim() ? 'Linked' : 'Not linked');
  }
  function explicitProposalUrl(event) {
    if (statusApi() && statusApi().validateProposalUrl) {
      const validated = statusApi().validateProposalUrl(event && event.proposalUrl);
      return validated.ok ? validated.url : '';
    }
    const raw = String(event && event.proposalUrl || '').trim();
    if (!raw || /\s/.test(raw)) return '';
    try {
      const url = new URL(raw);
      if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) return '';
      return url.toString();
    } catch { return ''; }
  }
  function snapshotBlocks(view, eyebrow, title) {
    const snap = window.lvptSheetSnapshot;
    if (snap && snap.state === 'ready') return false;
    const retry = snap && snap.state === 'unavailable';
    const empty = snap && snap.state === 'empty';
    const message = !snap || snap.state === 'loading'
      ? 'Reading the authoritative sheet…'
      : snap.state === 'auth-required'
        ? 'Owner sign-in required. The sheet was not read.'
        : empty
          ? 'The sheet returned no events.'
          : 'The sheet is unavailable. This is not an empty list.';
    view.innerHTML = `<div class="command-view-shell">${viewHeader(eyebrow, title, 'Authoritative sheet')}<div class="command-view-body"><p>${escapeHtml(message)}</p>${snap && snap.state === 'auth-required' ? '<p><a class="btn primary" href="/sms-review/index.html">Owner sign-in</a></p>' : ''}${retry ? '<p><button type="button" class="btn" id="retrySnapshotBtn">Retry</button></p>' : ''}</div></div>`;
    view.querySelector('#retrySnapshotBtn')?.addEventListener('click', () => window.lvptReloadSheetSnapshot && window.lvptReloadSheetSnapshot());
    return true;
  }

  function ensureShell() {
    if ($('#commandNav')) return;
    const nav = document.createElement('nav');
    nav.id = 'commandNav';
    nav.className = 'command-nav';
    nav.setAttribute('aria-label','Command Center sections');
    nav.innerHTML = [
      ['overview','Overview'],['action','Action Required'],['pipeline','Pipeline'],['active','Active Events'],['archive','Past Events'],['proposals','Proposals'],['followup','Client Follow-Up'],['finance','Event Finance'],['communications','Communications'],['health','Source Health']
    ].map(([view,label]) => `<button type="button" data-command-view="${view}">${label}</button>`).join('') + '<a class="btn small" id="ownerSignInLink" href="/sms-review/index.html">Owner sign-in</a>';
    $('.hero-card').after(nav);
    const view = document.createElement('section');
    view.id = 'commandView';
    view.className = 'command-view';
    nav.after(view);
    nav.addEventListener('click', event => {
      const button = event.target.closest('[data-command-view]');
      if (button) setCommandView(button.dataset.commandView);
    });
    ensureProposalModal();
  }

  function clearRecordSurfaces() {
    const editor = document.getElementById('eventEditorPanel');
    if (editor) editor.innerHTML = '<h2>No event selected</h2>';
    const panel = document.getElementById('selectedEventTasksPanel');
    if (panel) panel.innerHTML = '';
    const tab = document.getElementById('tabContent');
    if (tab) tab.innerHTML = '';
    document.querySelectorAll('[data-payment-field="amountPaid"]').forEach((field) => { field.value = ''; });
    const report = document.getElementById('generatedReportOutput');
    if (report) { report.hidden = true; report.innerHTML = ''; }
    const context = document.getElementById('reportContext');
    if (context) context.textContent = 'No event selected';
    document.body.classList.remove('record-open');
  }
  function snapshotReady() { return window.lvptSheetSnapshot && window.lvptSheetSnapshot.state === 'ready'; }
  function eventById(eventId) {
    if (!eventId || !snapshotReady()) return null;
    return events.find((event) => event.id === eventId) || null;
  }
  function navState() {
    return { lvptNav: { view: commandView, eventId: detail && detail.eventId ? detail.eventId : '', taskId: detail && detail.mode === 'task' ? detail.taskId : '' } };
  }
  function rememberList() {
    listMemory[commandView] = window.scrollY;
    if (typeof window.lvptRememberActionView === 'function') window.lvptRememberActionView();
  }
  function restoreListScroll() {
    window.scrollTo(0, listMemory[commandView] || 0);
  }
  function pushHistory() { if (!suppressHistory) history.pushState(navState(), ''); }
  function ledgerAmount(cents) {
    if (cents == null || !Number.isFinite(Number(cents))) return 'Unavailable';
    return (Number(cents) / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  }
  function moneyCoverageReason(money) {
    if (!money) return 'The money report was not returned on the shared operating-picture read.';
    if (money.incompleteReason) return String(money.incompleteReason);
    if (money.coverage === 'incomplete') return 'Ledger coverage is incomplete.';
    if (money.coverage !== 'complete') return `Ledger coverage is ${money.coverage || 'unverified'}, not complete.`;
    return '';
  }
  function moneyFieldLabel(money, field, cents, gaps) {
    if (!money) return 'Unavailable';
    const incompleteFields = Array.isArray(money.incompleteFields) ? money.incompleteFields : null;
    const incomplete = new Set(incompleteFields || []);
    const reason = moneyCoverageReason(money);
    const withReason = (label) => (reason ? `${label} — ${reason}` : label);
    if (gaps || incomplete.has(field)) return withReason('Incomplete');
    const coverageComplete = money.coverage === 'complete';
    // Incomplete/unverified coverage must not show numeric totals just because incompleteFields is absent or empty.
    // Only an explicit non-empty incompleteFields list that omits this field is field-level completeness evidence.
    if (!coverageComplete) {
      const fieldLevelComplete = Boolean(incompleteFields && incompleteFields.length > 0 && !incomplete.has(field));
      if (!fieldLevelComplete) {
        return withReason(money.coverage === 'incomplete' ? 'Incomplete' : 'Unavailable');
      }
    }
    if (cents == null || !Number.isFinite(Number(cents))) return 'Unavailable';
    return ledgerAmount(cents);
  }
  function overviewPictureState() {
    const result = window.lvptOperatingPictureResult;
    const pending = Boolean(window.lvptOperatingPicturePromise && !result);
    if (!result || result.ok === false || !result.data || !result.data.report) {
      return { ready: false, pending, data: null, money: null };
    }
    return { ready: true, pending: false, data: result.data, money: result.data.report.money || null };
  }
  function overviewRetryControl() {
    return '<p><button type="button" class="btn" data-retry-operating-picture>Retry ledger</button></p>';
  }
  function moneyCoverageComplete(money) {
    return Boolean(money) && money.coverage === 'complete' && !(money.incompleteFields || []).length && !money.verifiedClientReceiptGaps;
  }
  function overviewPaymentsSections(report, money) {
    if (!report || !Object.prototype.hasOwnProperty.call(report, 'payments')) {
      return `<h3>Open client balances</h3><p class="hub-warning">Unavailable. The payments collection was not returned on the shared operating-picture read. This is not an empty balance list.</p><h3>Open vendor bills</h3><p class="hub-warning">Unavailable. The payments collection was not returned on the shared operating-picture read. This is not an empty vendor list.</p>`;
    }
    if (!Array.isArray(report.payments)) {
      return `<h3>Open client balances</h3><p class="hub-warning">Unavailable. The payments collection was not a usable array. This is not an empty balance list.</p><h3>Open vendor bills</h3><p class="hub-warning">Unavailable. The payments collection was not a usable array. This is not an empty vendor list.</p>`;
    }
    if (!moneyCoverageComplete(money)) {
      const reason = escapeHtml((money && (money.incompleteReason || money.coverage)) || 'Payments coverage is incomplete or not marked complete.');
      return `<h3>Open client balances</h3><p class="hub-warning">Unavailable. Ledger coverage is incomplete (${reason}). Open balances are not treated as zero or empty.</p><h3>Open vendor bills</h3><p class="hub-warning">Unavailable. Ledger coverage is incomplete (${reason}). Open vendor bills are not treated as zero or empty.</p>`;
    }
    const payments = report.payments;
    const deadlines = payments.filter((row) => row && row.eventId && row.role === 'client_receivable' && Number(row.balanceDueCents) > 0).slice(0, 4);
    const vendorDue = payments.filter((row) => row && row.eventId && row.role === 'vendor_expense' && row.settlement && !['ledger_settled', 'not_invoiced', 'refunded'].includes(row.settlement)).slice(0, 3);
    const deadlineHtml = deadlines.map((row) => `<li><button type="button" class="btn small" data-open-event="${escapeHtml(row.eventId)}">${escapeHtml(row.paymentId || 'Invoice')}</button> <span>${escapeHtml(ledgerAmount(row.balanceDueCents))} open · ${escapeHtml(row.dueDate || 'no due date')}</span></li>`).join('');
    const vendorHtml = vendorDue.map((row) => `<li><button type="button" class="btn small" data-open-event="${escapeHtml(row.eventId)}">${escapeHtml(row.paymentId || 'Vendor bill')}</button> <span>${escapeHtml(ledgerAmount(row.invoiceTotalCents))} · ${escapeHtml(String(row.settlement || 'open').replaceAll('_', ' '))}</span></li>`).join('');
    return `<h3>Open client balances</h3><p class="muted">Evidence: Payments rows on the shared operating picture. Coverage complete.</p><ul>${deadlineHtml || '<li>No open client balance was returned on the complete ledger read.</li>'}</ul><h3>Open vendor bills</h3><p class="muted">Evidence: vendor expense rows on the shared operating picture. Coverage complete.</p><ul>${vendorHtml || '<li>No open vendor bill was returned on the complete ledger read.</li>'}</ul>`;
  }
  function overviewExceptionsSection(picture) {
    if (!picture || !Object.prototype.hasOwnProperty.call(picture, 'exceptions')) {
      return `<h3>Actionable exceptions</h3><p class="hub-warning">Unavailable. The exceptions collection was not returned on the shared operating-picture read. This is not an empty exception list.</p>`;
    }
    if (!Array.isArray(picture.exceptions)) {
      return `<h3>Actionable exceptions</h3><p class="hub-warning">Unavailable. The exceptions collection was not a usable array. This is not an empty exception list.</p>`;
    }
    const exceptionHtml = picture.exceptions.length
      ? `<ul>${picture.exceptions.slice(0, 4).map((row) => `<li><strong>Unresolved exception</strong> ${escapeHtml(row.detail || row.id || 'Documented exception')}${row.includedInTotals === false ? ' Excluded from totals.' : ''}</li>`).join('')}</ul>`
      : '<p class="muted">No unresolved finance exceptions were returned on the complete operating-picture read.</p>';
    return `<h3>Actionable exceptions</h3><p class="muted">Evidence: documentedExceptions on the shared operating picture. These stay out of fabricated totals.</p>${exceptionHtml}`;
  }
  function overviewFreshnessLine(picture) {
    if (!picture || !Object.prototype.hasOwnProperty.call(picture, 'jobs')) {
      return 'Source freshness is unavailable. The jobs collection was not returned on the shared operating-picture read. It is not marked connected.';
    }
    if (!Array.isArray(picture.jobs)) {
      return 'Source freshness is unavailable. The jobs collection was not a usable array. It is not marked connected.';
    }
    const sheetJob = picture.jobs.find((job) => job.id === 'financial-sync');
    const heartbeat = picture.jobs.find((job) => job.id === 'sms-heartbeat');
    return `Sheet ledger last success ${escapeHtml((sheetJob && sheetJob.lastSuccess) || 'not recorded')}. SMS heartbeat ${escapeHtml((heartbeat && heartbeat.status) || 'not verified')}. Source: shared operating-picture jobs. A stored row is not a heartbeat.`;
  }
  function overviewLedgerInner() {
    const state = overviewPictureState();
    if (!state.ready || !state.money) {
      return state.pending
        ? '<p class="muted">Ledger-recorded receipts, outstanding balances, and vendor commitments are still loading from the shared operating-picture read. A blank figure is not zero and not a bank balance.</p>'
        : `<p class="muted">Ledger-recorded receipts, outstanding balances, and vendor commitments did not load from the shared operating-picture read. This is not zero.</p>${overviewRetryControl()}`;
    }
    const money = state.money;
    const coverageNote = moneyCoverageReason(money);
    const receipts = moneyFieldLabel(money, 'verifiedClientReceipts', money.verifiedClientReceiptGaps ? null : money.verifiedClientReceiptsCents, money.verifiedClientReceiptGaps);
    const outstanding = moneyFieldLabel(money, 'openClientExposure', money.openClientExposureCents);
    const vendor = moneyFieldLabel(money, 'vendorCommitted', money.vendorCommittedCents);
    const coverageMuted = coverageNote
      ? ` Coverage: ${escapeHtml(coverageNote)}`
      : ' Coverage complete.';
    return `<div class="lifecycle-summary"><div><span>Ledger-recorded receipts</span><strong>${escapeHtml(receipts)}</strong><p class="muted">Scope: Payments sheet via shared operating picture. Not a bank receipt. Incomplete means a conflicting or unidentified row was excluded.${coverageMuted}</p></div><div><span>Ledger outstanding</span><strong>${escapeHtml(outstanding)}</strong><p class="muted">Scope: open client balances on the sheet. Not drawable cash.${coverageMuted}</p></div><div><span>Open vendor obligations</span><strong>${escapeHtml(vendor)}</strong><p class="muted">Scope: vendor bills on the sheet that are not marked not-invoiced. Not bank-settled.${coverageMuted}</p></div><div><span>Drawable cash</span><strong>Unavailable</strong><p class="muted">${escapeHtml(money.drawableCashReason || 'Drawable cash is unavailable from the ledger.')}</p></div></div>`;
  }
  function overviewOperatingInner() {
    const state = overviewPictureState();
    if (!state.ready) {
      return state.pending
        ? '<p class="muted">Open balances, vendor bills, source freshness, and exceptions are waiting on the shared operating-picture read. An empty list is not shown as zero coverage.</p>'
        : `<p class="muted">Open balances, vendor bills, source freshness, and exceptions are unavailable. The shared operating-picture read did not succeed. This is not an empty ledger.</p>${overviewRetryControl()}`;
    }
    const picture = state.data;
    const freshness = overviewFreshnessLine(picture);
    return `<p class="muted">${freshness} Approvals waiting: Unavailable on Overview. Open the review workspace. This page does not count a draft as an approval.</p>${overviewPaymentsSections(picture.report, state.money)}${overviewExceptionsSection(picture)}`;
  }
  function bindLedgerRetry(scope) {
    scope.querySelectorAll('[data-retry-operating-picture]').forEach((button) => {
      button.addEventListener('click', () => window.lvptReloadOperatingPicture && window.lvptReloadOperatingPicture());
    });
    scope.querySelectorAll('#retryRecordLedger, [data-retry-record-ledger]').forEach((button) => {
      button.addEventListener('click', () => window.lvptReloadOperatingPicture && window.lvptReloadOperatingPicture());
    });
  }
  window.lvptPaintOverviewLedger = function () {
    const ledger = document.getElementById('overviewLedger');
    if (ledger) {
      ledger.innerHTML = overviewLedgerInner();
      bindLedgerRetry(ledger);
    }
    const operating = document.getElementById('overviewOperating');
    if (operating) {
      operating.innerHTML = overviewOperatingInner();
      bindLedgerRetry(operating);
      bindEventOpeners(operating);
    }
  };
  function recordLedgerInner(eventId) {
    const result = window.lvptOperatingPictureResult;
    const pending = window.lvptOperatingPicturePromise && !result;
    if (!result || result.ok === false || !result.data || !result.data.report) {
      return pending
        ? '<p>Ledger for this event is still loading. It is not zero and not another event.</p>'
        : '<p>Ledger for this event did not load. This is not zero.</p><p><button type="button" class="btn" id="retryRecordLedger">Retry ledger</button></p>';
    }
    const rows = (result.data.report.payments || []).filter((row) => row && row.eventId === eventId && row.role === 'client_receivable');
    if (!rows.length) return '<p>No client invoice row for this event.</p>';
    const missing = rows.some((row) => row.invoiceTotalCents == null || !Number.isFinite(Number(row.invoiceTotalCents)));
    const total = rows.reduce((sum, row) => sum + (Number.isFinite(Number(row.invoiceTotalCents)) ? Number(row.invoiceTotalCents) : 0), 0);
    const lines = rows.map((row) => `${escapeHtml(row.paymentId || 'invoice')} ${escapeHtml(ledgerAmount(row.invoiceTotalCents))}`).join(', ');
    return `<p>Client invoice rows for this event only: ${lines}. Total ${missing ? 'Incomplete' : escapeHtml(ledgerAmount(total))}. Ledger-recorded, not a bank receipt.</p>`;
  }
  window.lvptPaintRecordLedger = function () {
    const root = document.querySelector('[data-record-event]');
    const slot = root && root.querySelector('[data-record-ledger]');
    if (!root || !slot) return;
    const id = root.getAttribute('data-record-event');
    const generation = Number(root.getAttribute('data-record-generation'));
    if (id !== selectedId || generation !== window.lvptRecordGeneration) {
      slot.textContent = 'This record changed before the ledger returned. The previous event was not shown.';
      return;
    }
    slot.innerHTML = recordLedgerInner(id);
    bindLedgerRetry(slot);
  };
  function setCommandView(view) {
    commandView = view || 'overview';
    detail = null;
    selectedId = '';
    recordOpen = false;
    clearRecordSurfaces();
    localStorage.setItem(VIEW_KEY, commandView);
    renderCommandView();
    if (!suppressHistory) history.pushState(navState(), '');
    window.scrollTo(0, 0);
  }

  function toggleStandardWorkspace(show) {
    ['#attentionBar','#metricScopeBar','#hubOverviewStrip','#metricsGrid','.layout-grid','#reportCenter','#selectedEventTasksPanel','#eventEditorPanel','#fullEventEditorTabs'].forEach(selector => {
      const element = document.querySelector(selector);
      if (element) element.hidden = !show;
    });
  }

  function renderCommandView() {
    ensureShell();
    window.lvptCommandViewGeneration = (window.lvptCommandViewGeneration || 0) + 1;
    window.lvptActiveCommandView = commandView;
    all('[data-command-view]').forEach(button => button.classList.toggle('active', button.dataset.commandView === commandView));
    const view = $('#commandView');
    recordOpen = false;
    document.body.classList.remove('record-open');
    toggleStandardWorkspace(false);
    view.hidden = false;
    if (!snapshotReady()) {
      detail = null;
      selectedId = '';
      clearRecordSurfaces();
    }
    if (detail && detail.mode === 'record') {
      renderRecord(view, detail.eventId);
      return;
    }
    if (commandView === 'overview') {
      renderOverview(view);
      if (typeof window.lvptPaintOverviewHealth === 'function') window.lvptPaintOverviewHealth();
      return;
    }
    if (commandView === 'pipeline') renderPipeline(view);
    else if (commandView === 'active') renderPortfolio(view, 'active');
    else if (commandView === 'archive') renderPortfolio(view, 'archive');
    else if (commandView === 'proposals') renderProposals(view);
    else if (commandView === 'finance' || commandView === 'communications' || commandView === 'health' || commandView === 'action') {
      if (typeof window.lvptRenderUnifiedView === 'function') window.lvptRenderUnifiedView(view, commandView);
      else view.innerHTML = '<div class="command-view-shell"><div class="command-view-body">Loading the operations hub…</div></div>';
    }
    else renderFollowUp(view);
  }

  function viewHeader(eyebrow, title, copy, action='') {
    return `<div class="command-view-head"><div><p class="eyebrow">${escapeHtml(eyebrow)}</p><h2>${escapeHtml(title)}</h2><p>${escapeHtml(copy)}</p></div>${action}</div>`;
  }

  function moneyCents(cents) {
    if (cents == null || !Number.isFinite(cents)) return 'Unpriced';
    return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  }
  /** Wrap only currency tokens in money-nowrap; never nowrap a multi-phrase label. */
  function moneyAwareHtml(text) {
    return escapeHtml(String(text ?? '')).replace(/\$[\d,]+(?:\.\d{2})?/g, (token) => `<span class="money-nowrap">${token}</span>`);
  }
  function paymentLabelHtml(label) {
    const parts = String(label || '').split(' · ').map((part) => part.trim()).filter(Boolean);
    if (parts.length > 1) {
      return `<strong class="payment-label-stack">${parts.map((part) => `<span class="payment-label-line">${moneyAwareHtml(part)}</span>`).join('')}</strong>`;
    }
    return `<strong class="payment-label-stack"><span class="payment-label-line">${moneyAwareHtml(label || 'Not recorded')}</span></strong>`;
  }
  function kpiValueHtml(text) {
    return `<strong>${moneyAwareHtml(text)}</strong>`;
  }
  function buildScopedOperationalReport(options) {
    const api = reportsApi();
    if (!api || typeof api.buildOperationalReport !== 'function') return null;
    const pictureState = overviewPictureState();
    const picture = pictureState.ready ? pictureState.data : null;
    return api.buildOperationalReport({
      events: Array.isArray(events) ? events : [],
      eventId: options && options.eventId ? options.eventId : '',
      ledger: picture && picture.report ? picture.report : null,
      jobs: picture && Object.prototype.hasOwnProperty.call(picture, 'jobs') ? picture.jobs : null,
      exceptions: picture && Object.prototype.hasOwnProperty.call(picture, 'exceptions') ? picture.exceptions : null,
      conversion: options && options.conversion ? options.conversion : null,
      today: todayString(),
      authenticated: true
    });
  }
  function operationalReportPanel(report) {
    if (!report) {
      return '<section class="hub-callout" data-operational-report="unavailable"><strong>Operational report</strong><p class="muted">Scoped operational report model is unavailable in this session.</p></section>';
    }
    const conversion = report.conversion || {};
    const freshness = report.freshness || {};
    const finance = report.finance || {};
    const quotes = report.quotes || {};
    const pricedQuotes = quotes.pricedLineItemCents == null ? 'Unknown' : moneyCents(quotes.pricedLineItemCents);
    const receivables = (finance.receivables && finance.receivables.label) || 'Unknown';
    const vendor = (finance.vendorObligations && finance.vendorObligations.label) || 'Unknown';
    const exceptions = report.exceptions.available ? String(report.exceptions.count) : 'Unavailable';
    const conversionValue = conversion.canComputeRate && conversion.rate != null
      ? `${(Number(conversion.rate) * 100).toFixed(1)}%`
      : 'Unavailable';
    const conversionFootnote = [
      conversion.canComputeRate
        ? (conversion.rateLabel || conversion.reason || '')
        : (conversion.reason || conversion.rateLabel || 'Conversion rate: Unavailable'),
      quotes.recordedTargetCents == null
        ? 'Targets separate: None recorded'
        : `Targets separate: ${moneyCents(quotes.recordedTargetCents)}`,
      finance.receivables && finance.receivables.confidence
        ? `Receivables confidence: ${finance.receivables.confidence}`
        : ''
    ].filter(Boolean).join(' · ');
    return `<section class="hub-callout" data-operational-report="${escapeHtml(report.scope.kind)}" data-report-scope="${escapeHtml(report.scope.eventId || 'portfolio')}"><strong>Operational report</strong><p data-report-scope-label>${escapeHtml(report.scope.label)}</p><p class="muted">${escapeHtml(report.scope.note)}</p><p data-report-freshness>${escapeHtml(freshness.label || 'Source freshness unavailable')}. ${escapeHtml(freshness.note || '')}</p><p data-report-confidence>${escapeHtml((report.financialConfidence && report.financialConfidence.note) || 'Unknown amounts remain unknown. Target quotes are not double-counted.')}</p><div class="lifecycle-summary kpi-stat-grid"><div><span>Pipeline</span>${kpiValueHtml(String(report.pipeline.pipeline))}</div><div><span>Booked / historical</span>${kpiValueHtml(`${report.bookedHistorical.bookedCount} / ${report.bookedHistorical.historicalCount}`)}</div><div><span>Priced quotes</span>${kpiValueHtml(pricedQuotes)}</div><div><span>Receivables</span>${kpiValueHtml(receivables)}</div><div><span>Vendor obligations</span>${kpiValueHtml(vendor)}</div><div><span>Open tasks</span>${kpiValueHtml(String(report.tasks.openCount))}</div><div><span>Exceptions</span>${kpiValueHtml(exceptions)}</div><div><span>Conversion</span>${kpiValueHtml(conversionValue)}</div></div><p class="kpi-footnote muted" data-conversion-footnote>${escapeHtml(conversionFootnote)}</p><p class="muted">${escapeHtml(report.csvExportReason || 'CSV export omitted.')}</p></section>`;
  }
  function summarizeQuotes(items) {
    let pricedCents = 0;
    let priced = 0;
    let unpriced = 0;
    let recordedZero = 0;
    let profitCents = 0;
    let costKnown = 0;
    let targetCents = 0;
    let targets = 0;
    let partial = 0;
    items.forEach((event) => {
      const quote = statusApi().quoteCoverage(event);
      if (quote.targetState === 'recorded') {
        targets += 1;
        targetCents += quote.recordedTargetCents;
      }
      if (quote.linePartial) partial += 1;
      if (quote.priced) {
        priced += 1;
        pricedCents += quote.pricedCents;
        if (quote.costKnown) {
          costKnown += 1;
          profitCents += quote.pricedCents - quote.costCents;
        }
      } else if (quote.recordedZero) recordedZero += 1;
      else if (quote.targetState !== 'recorded') unpriced += 1;
    });
    const profit = priced === 0 ? 'No complete line quotes' : costKnown === priced ? moneyCents(profitCents) : 'Cost not recorded';
    const costCoverage = priced === 0 ? 'No priced lines' : `${costKnown} of ${priced} priced`;
    return `<div class="lifecycle-summary"><div><span>Records</span><strong>${items.length}</strong><p class="muted">Scope: signed-in sheet snapshot · Events.</p></div><div><span>Recorded targets</span><strong>${targets ? moneyCents(targetCents) : 'None recorded'}</strong><p class="muted">${targets} explicit target quotes from setup.targetQuote. Not added to priced line items. A budget is not a target.</p></div><div><span>Priced line items</span><strong>${moneyCents(priced ? pricedCents : null)}</strong><p class="muted">${priced} complete · ${partial} partial · ${unpriced} unpriced · ${recordedZero} recorded zero. Targets stay separate.</p></div><div><span>Cost coverage</span><strong>${escapeHtml(profit)}</strong><p class="muted">${escapeHtml(costCoverage)} line quotes have a cost on every line. Missing cost is not zero. A margin figure appears only when coverage is complete.</p></div><div><span>Open tasks</span><strong>${items.reduce((sum, event) => sum + openTaskCount(event), 0)}</strong><p class="muted">Scope: open Tasks rows on the sheet snapshot.</p></div></div>`;
  }
  function renderOverview(view) {
    if (snapshotBlocks(view, 'Overview', 'Current sheet')) return;
    const lanes = events.map(laneOf);
    const count = (lane) => lanes.filter((item) => item.lane === lane).length;
    const confirmed = events.filter((event) => {
      const lane = laneOf(event);
      return lane.lane === 'active' && lane.date.recognized && !lane.past;
    }).sort((a, b) => String(a.eventDate).localeCompare(String(b.eventDate))).slice(0, 5);
    const tentative = events.filter((event) => laneOf(event).lane === 'pipeline' && laneOf(event).date.recognized).sort((a, b) => String(a.eventDate).localeCompare(String(b.eventDate))).slice(0, 5);
    const tasks = [];
    events.forEach((event) => {
      (event.tasks || []).forEach((task) => {
        const status = String(task.status || '').trim().toLowerCase();
        if (['complete', 'completed', 'resolved', 'done', 'cancelled', 'canceled', 'closed', 'declined'].includes(status)) return;
        if (!task.dueDate) return;
        const priority = String(task.priority || '').trim().toLowerCase();
        tasks.push({ event, task, due: task.dueDate, priority: priority === 'critical' ? 0 : priority === 'high' ? 1 : priority === 'medium' ? 2 : priority === 'low' ? 3 : 4 });
      });
    });
    tasks.sort((a, b) => String(a.due).localeCompare(String(b.due)) || a.priority - b.priority);
    let shown = tasks.slice(0, 6);
    if (detail && detail.mode === 'task') {
      const selected = tasks.find((item) => item.task.id === detail.taskId && item.event.id === detail.eventId);
      if (selected && !shown.some((item) => item.task.id === selected.task.id)) shown = [selected].concat(shown);
    }
    const taskHtml = shown.map((item) => {
      const expanded = detail && detail.mode === 'task' && detail.taskId === item.task.id && detail.eventId === item.event.id;
      const inline = expanded ? `<div class="task-inline" data-open-task-panel="${escapeHtml(item.task.id)}"><p><strong>${escapeHtml(item.task.title || 'Open task')}</strong></p><p>${escapeHtml(item.event.eventName || 'Untitled event')} · Due ${escapeHtml(item.task.dueDate || 'not recorded')} · ${escapeHtml(item.task.status || 'Open')} · ${escapeHtml(item.task.priority || 'No priority')}</p><div class="actions"><button type="button" class="btn small primary" data-view-event="${escapeHtml(item.event.id)}">View associated event</button><button type="button" class="btn small" data-close-task>Close</button></div></div>` : '';
      return `<li><button type="button" class="btn small" data-open-task="${escapeHtml(item.task.id)}" data-task-event="${escapeHtml(item.event.id)}">${escapeHtml(item.task.title || 'Open task')}</button> <span>${escapeHtml(item.event.eventName || 'Untitled event')} · ${escapeHtml(item.due)}</span>${inline}</li>`;
    }).join('');
    const listHtml = (rows) => rows.map((event) => `<li><button type="button" class="btn small" data-open-event="${escapeHtml(event.id)}">${escapeHtml(event.eventName || 'Untitled event')}</button> <span>${escapeHtml(laneOf(event).raw || 'Status not recorded')} · ${escapeHtml(event.eventDate)}</span></li>`).join('');
    const missingNote = detail && detail.mode === 'missing' ? '<p class="hub-warning">That task is not in the signed-in snapshot. Another event was not opened.</p>' : '';
    const operational = operationalReportPanel(buildScopedOperationalReport({}));
    view.innerHTML = `<div class="command-view-shell">${viewHeader('Overview', 'Current sheet', 'Global sheet snapshot. Dates are calendar dates in America/Los_Angeles. A task opens here. View associated event opens one record.')}<div class="command-view-body"><div id="overviewLedger">${overviewLedgerInner()}</div>${dailyOverview()}${summarizeQuotes(events)}${operational}<div class="lifecycle-summary top-gap"><div><span>Pipeline</span><strong>${count('pipeline')}</strong><p class="muted">Sheet snapshot · Events. Tentative opportunities.</p></div><div><span>Active</span><strong>${count('active')}</strong><p class="muted">Sheet snapshot · confirmed and in progress.</p></div><div><span>Past</span><strong>${count('past')}</strong><p class="muted">Sheet snapshot · dated past. A past date is not completion.</p></div><div><span>Needs review</span><strong>${count('review')}</strong><p class="muted">Sheet snapshot · unverified outcomes.</p></div></div>${missingNote}<h3>Priority open tasks</h3><ul>${taskHtml || '<li>No open dated task on the sheet.</li>'}</ul><h3>Confirmed upcoming</h3><p class="muted">Evidence: Booked / payment-processing on the sheet snapshot. Kept apart from dated inquiries.</p><ul>${listHtml(confirmed) || '<li>No confirmed upcoming event.</li>'}</ul><h3>Dated inquiries and proposals</h3><p class="muted">Evidence: pipeline lane with a recognized date on the sheet snapshot.</p><ul>${listHtml(tentative) || '<li>No dated inquiry or proposal.</li>'}</ul><p class="muted">Booked and payment-processing events are confirmed. A past date does not complete an event. Unknown outcomes stay in Needs review. Unanswered mail is not inferred here.</p></div></div>`;
    bindEventOpeners(view);
    bindLedgerRetry(view);
  }

  function taskOpen(task) {
    const status = String(task && task.status || '').trim().toLowerCase();
    return !['complete', 'completed', 'resolved', 'done', 'cancelled', 'canceled', 'closed', 'declined'].includes(status);
  }
  function dailyOverview() {
    const today = todayString();
    let overdue = 0;
    let dueToday = 0;
    let undated = 0;
    events.forEach((event) => (event.tasks || []).forEach((task) => {
      if (!taskOpen(task)) return;
      if (!task.dueDate) undated += 1;
      else if (task.dueDate < today) overdue += 1;
      else if (task.dueDate === today) dueToday += 1;
    }));
    const newLeads = events.filter((event) => laneOf(event).lane === 'pipeline' && laneOf(event).stage === 'open').length;
    return `<div class="lifecycle-summary"><div><span>New and open leads</span><strong>${newLeads}</strong><p class="muted">Scope: sheet snapshot stage open in Pipeline. Unanswered mail is not guessed from the event list.</p></div><div><span>Overdue tasks</span><strong>${overdue}</strong><p class="muted">Scope: open Tasks on the sheet snapshot with due date before today. Due today is not overdue.</p></div><div><span>Due today</span><strong>${dueToday}</strong><p class="muted">Scope: open Tasks on the sheet snapshot due today.</p></div><div><span>Undated open tasks</span><strong>${undated}</strong><p class="muted">Scope: open Tasks without a due date. They stay open and are not completed.</p></div></div><div id="overviewOperating">${overviewOperatingInner()}</div>`;
  }
  function countMissingFields(values) {
    return (values || []).filter((value) => value == null || value === '').length;
  }
  function recordedLine(label, value, options) {
    options = options || {};
    const missing = value == null || value === '';
    const spanAttr = options.full ? ' data-span="full"' : '';
    let valueHtml;
    if (missing) {
      valueHtml = '<span class="status-pill status-pill--missing">Unavailable</span>';
    } else if (options.html) {
      valueHtml = `<strong>${value}</strong>`;
    } else if (options.money) {
      valueHtml = `<strong class="money-nowrap">${escapeHtml(String(value))}</strong>`;
    } else {
      valueHtml = `<strong>${escapeHtml(String(value))}</strong>`;
    }
    return `<div data-field-state="${missing ? 'unavailable' : 'recorded'}"${spanAttr}><span>${escapeHtml(label)}</span>${valueHtml}</div>`;
  }
  function workspaceSection(eventId, sectionId, title, body, options) {
    options = options || {};
    const openAttr = options.open ? ' open' : '';
    const count = options.count;
    const missing = Number(options.missing) || 0;
    const countHtml = count != null && count !== ''
      ? `<span class="workspace-count">${escapeHtml(String(count))}</span>`
      : '';
    const missingHtml = missing > 0
      ? `<span class="missing-badge">Missing: ${missing}</span>`
      : '';
    return `<details class="workspace-section workspace-accordion"${openAttr} data-workspace-section="${escapeHtml(sectionId)}" data-event-id="${escapeHtml(eventId)}"><summary><span class="workspace-summary-title">${escapeHtml(title)}</span>${countHtml}${missingHtml}</summary><div class="workspace-accordion-body">${body}</div></details>`;
  }
  function linkifyCommunicationNotes(value) {
    if (value == null || value === '') return '';
    const raw = String(value);
    const re = /https:\/\/mail\.google\.com\/mail\/#all\/[A-Za-z0-9_-]+/g;
    const parts = [];
    let last = 0;
    let match;
    while ((match = re.exec(raw))) {
      if (match.index > last) parts.push(escapeHtml(raw.slice(last, match.index)));
      parts.push(`<a class="mail-pill" href="${escapeHtml(match[0])}" target="_blank" rel="noopener">Open email ↗</a>`);
      last = match.index + match[0].length;
    }
    if (last < raw.length) parts.push(escapeHtml(raw.slice(last)));
    return parts.join('');
  }
  function documentRows(event) {
    if (typeof formatDocumentAssociationHtml === 'function') {
      return formatDocumentAssociationHtml(event);
    }
    const rows = typeof documentAssociationRows === 'function'
      ? documentAssociationRows(event)
      : (Array.isArray(event.documents) ? event.documents : []).map((doc) => {
        const source = typeof resolveDocumentSourceUrl === 'function'
          ? resolveDocumentSourceUrl(doc)
          : { ok: false, reason: 'missing' };
        return {
          id: doc && doc.id ? String(doc.id) : '',
          name: doc && (doc.name || doc.title) ? String(doc.name || doc.title) : 'Untitled document',
          category: doc && doc.category ? String(doc.category) : 'Category unavailable',
          linkState: source.ok ? 'linked' : source.reason === 'invalid' ? 'unsupported' : 'unavailable',
          linkLabel: source.ok ? 'Open source link' : source.reason === 'invalid' ? 'Unsupported or invalid source link' : 'Source link unavailable',
          source
        };
      });
    if (!rows.length) {
      return '<p data-document-count="0">0 document rows on this event. File bytes are not opened here. Document writes stay off.</p>';
    }
    const types = [];
    rows.forEach((row) => {
      const category = row.category || 'Category unavailable';
      if (!types.includes(category)) types.push(category);
    });
    const typePills = types.map((type) => `<button type="button" class="doc-type-pill" data-doc-type="${escapeHtml(type)}">${escapeHtml(type)}</button>`).join('');
    const items = rows.map((row) => {
      const link = row.linkState === 'linked'
        ? `<a class="mail-pill" href="${escapeHtml(row.source.url)}" target="_blank" rel="noopener" data-document-link="linked">Open source link</a>`
        : `<span data-document-link="${escapeHtml(row.linkState)}">${escapeHtml(row.linkLabel)}</span>`;
      return `<tr data-document-id="${escapeHtml(row.id)}" data-document-link-state="${escapeHtml(row.linkState)}" data-doc-category="${escapeHtml(row.category || '')}"><td>${escapeHtml(row.name)}</td><td><span class="doc-type-pill">${escapeHtml(row.category)}</span></td><td>${link}</td></tr>`;
    }).join('');
    return `<div data-doc-workspace data-event-id="${escapeHtml(event.id || '')}"><p data-document-count="${rows.length}">${rows.length} document row${rows.length === 1 ? '' : 's'} on this event. File bytes are not opened here. Document writes stay off.</p><div class="doc-filter-bar"><input class="input" type="search" data-doc-search placeholder="Filter documents…" aria-label="Filter documents"><button type="button" class="doc-type-pill is-active" data-doc-type="all">All</button>${typePills}</div><div class="table-scroll"><table class="doc-table" data-document-associations><thead><tr><th>Name</th><th>Type</th><th>Source</th></tr></thead><tbody>${items}</tbody></table></div></div>`;
  }
  function communicationRows(event) {
    const rows = Array.isArray(event.emailActivity) ? event.emailActivity.slice() : [];
    if (!rows.length) {
      return '<p>0 stored mail rows on this event. A stored row is not a full thread. SMS/RCS content is unavailable on this record.</p>';
    }
    rows.sort((a, b) => String(b && b.date || '').localeCompare(String(a && a.date || '')));
    const items = rows.map((row, index) => {
      const subject = row && (row.subject || row.snippet) ? String(row.subject || row.snippet).slice(0, 120) : 'Subject unavailable';
      const when = formatCommWhen(row && row.date, event);
      const direction = row && row.direction ? String(row.direction) : 'Direction unavailable';
      const hiddenAttr = index >= 8 ? ' hidden' : '';
      return `<li data-mail-index="${index}" data-comm-item data-comm-direction="${escapeHtml(direction)}"${hiddenAttr}>${escapeHtml(subject)} · ${escapeHtml(direction)} · ${escapeHtml(when)}</li>`;
    }).join('');
    const showAll = rows.length > 8
      ? `<button type="button" class="btn small" data-comm-show-all>Show all (${rows.length})</button>`
      : '';
    return `<div data-comm-workspace data-event-id="${escapeHtml(event.id || '')}"><div class="comm-filter-bar"><button type="button" class="doc-type-pill is-active" data-comm-filter="all">All</button><button type="button" class="doc-type-pill" data-comm-filter="inbound">Inbound</button><button type="button" class="doc-type-pill" data-comm-filter="outbound">Outbound</button><input class="input" type="search" data-comm-search placeholder="Search communications…" aria-label="Search communications"></div><p>${rows.length} stored mail row${rows.length === 1 ? '' : 's'} on this event. A stored row is not a full thread. SMS/RCS content is unavailable on this record.</p><ul data-comm-list>${items}</ul>${showAll}</div>`;
  }
  function bindWorkspaceFilters(scope) {
    const root = scope || document;
    root.querySelectorAll('[data-comm-workspace]').forEach((workspace) => {
      const list = workspace.querySelector('[data-comm-list]');
      if (!list) return;
      const search = workspace.querySelector('[data-comm-search]');
      const showAllBtn = workspace.querySelector('[data-comm-show-all]');
      let filter = 'all';
      let expanded = false;
      const apply = () => {
        const query = String(search && search.value || '').trim().toLowerCase();
        const items = Array.from(list.querySelectorAll('[data-comm-item]'));
        let matched = 0;
        items.forEach((item) => {
          const direction = String(item.dataset.commDirection || '').toLowerCase();
          const text = String(item.textContent || '').toLowerCase();
          const inbound = /in|received|inbound/.test(direction);
          const outbound = /out|sent|outbound/.test(direction);
          const dirOk = filter === 'all' || (filter === 'inbound' && inbound) || (filter === 'outbound' && outbound);
          const queryOk = !query || text.includes(query);
          const match = dirOk && queryOk;
          if (match) matched += 1;
          const withinLimit = expanded || matched <= 8;
          item.hidden = !match || !withinLimit;
        });
        if (showAllBtn) {
          showAllBtn.hidden = expanded || matched <= 8;
          showAllBtn.textContent = `Show all (${matched})`;
        }
      };
      workspace.querySelectorAll('[data-comm-filter]').forEach((button) => {
        button.addEventListener('click', () => {
          filter = button.getAttribute('data-comm-filter') || 'all';
          workspace.querySelectorAll('[data-comm-filter]').forEach((node) => node.classList.toggle('is-active', node === button));
          apply();
        });
      });
      search?.addEventListener('input', apply);
      showAllBtn?.addEventListener('click', () => {
        expanded = true;
        apply();
      });
      apply();
    });
    root.querySelectorAll('[data-doc-workspace]').forEach((workspace) => {
      const search = workspace.querySelector('[data-doc-search]');
      let type = 'all';
      const apply = () => {
        const query = String(search && search.value || '').trim().toLowerCase();
        workspace.querySelectorAll('[data-document-id]').forEach((row) => {
          const category = String(row.dataset.docCategory || '').toLowerCase();
          const text = String(row.textContent || '').toLowerCase();
          const typeOk = type === 'all' || category === String(type).toLowerCase();
          const queryOk = !query || text.includes(query);
          row.hidden = !(typeOk && queryOk);
        });
      };
      workspace.querySelectorAll('[data-doc-type]').forEach((button) => {
        button.addEventListener('click', () => {
          type = button.getAttribute('data-doc-type') || 'all';
          workspace.querySelectorAll('[data-doc-type]').forEach((node) => node.classList.toggle('is-active', node === button));
          apply();
        });
      });
      search?.addEventListener('input', apply);
      apply();
    });
  }
  function recordSections(event) {
    const eventId = event.id;
    const setup = event.setup || {};
    const payment = event.payment || {};
    const quote = statusApi() && typeof statusApi().quoteCoverage === 'function'
      ? statusApi().quoteCoverage(event)
      : { targetState: 'omitted', priced: false, recordedZero: false, linePartial: false, pricedCents: null, recordedTargetCents: null };
    const quoteLines = (event.quote || []).map((line) => `<li>${escapeHtml(line.name || line.category || 'Line')} · qty ${line.quantity == null || line.quantity === '' ? 'unavailable' : escapeHtml(line.quantity)} · price ${line.unitPrice == null || line.unitPrice === '' ? 'unavailable' : escapeHtml(line.unitPrice)} · cost ${line.internalCost == null || line.internalCost === '' ? 'unavailable' : escapeHtml(line.internalCost)}</li>`).join('') || '<li>No quote lines on this event.</li>';
    const targetLabel = quote.targetState === 'recorded'
      ? moneyCents(quote.recordedTargetCents)
      : '';
    const pricedLabel = quote.priced
      ? (quote.linePartial ? `Partial ${moneyCents(quote.pricedCents)}` : moneyCents(quote.pricedCents))
      : (quote.recordedZero ? 'Recorded zero' : '');
    const complianceRows = Array.isArray(event.compliance) ? event.compliance : [];
    const compliance = complianceRows.map((item) => `<li>${escapeHtml(item.name || 'Requirement')} · ${escapeHtml(item.status || 'Unavailable')} · ${escapeHtml(item.dueDate || 'Due date unavailable')}</li>`).join('') || '<li>No compliance row on this event.</li>';
    const post = event.postEvent || {};
    const reviewRequested = Object.prototype.hasOwnProperty.call(post, 'reviewRequested')
      ? (post.reviewRequested ? 'Yes' : 'No')
      : '';
    const reviewReceived = Object.prototype.hasOwnProperty.call(post, 'reviewReceived')
      ? (post.reviewReceived ? 'Yes' : 'No')
      : '';
    const acquired = crmApi() ? crmApi().acquisitionOf(event) : { kind: 'unknown', label: '', leadSource: '', utmSource: '', utmCampaign: '' };
    const acquisitionLabel = acquired.kind === 'unknown'
      ? 'Unknown (not recorded)'
      : `${acquired.label || acquired.kind} (${acquired.kind})`;
    const paymentAmount = Object.prototype.hasOwnProperty.call(payment, 'amountPaid') && payment.amountPaid !== '' && payment.amountPaid != null
      ? payment.amountPaid
      : '';
    const depositAmount = Object.prototype.hasOwnProperty.call(payment, 'depositRequired') && payment.depositRequired !== '' && payment.depositRequired != null
      ? payment.depositRequired
      : '';
    const startLabel = runOfShowTime(event.startTime, event);
    const endLabel = runOfShowTime(event.endTime, event);
    const setupAccess = runOfShowTime(setup.setupTime, event);
    const strikeLabel = runOfShowTime(setup.strikeTime, event);
    const guestCount = event.guestCount == null || event.guestCount === '' ? '' : event.guestCount;
    const mailRows = Array.isArray(event.emailActivity) ? event.emailActivity.length : 0;
    const docRows = Array.isArray(event.documents) ? event.documents.length : 0;
    const quoteLineCount = Array.isArray(event.quote) ? event.quote.length : 0;
    const notesHtml = linkifyCommunicationNotes(setup.communicationNotes);
    const clientMissing = countMissingFields([event.company, event.contactName, event.contactEmail, event.contactPhone, event.eventType]);
    const discoveryMissing = countMissingFields([setup.planningStage, setup.budgetRange, setup.venueStatus, setup.internalOwner, setup.stakeholders, event.nextAction]);
    const dateMissing = countMissingFields([event.eventDate, event.venue, event.city, event.state, setup.timeZone || eventTz(event), setup.venueContact]);
    const goalsMissing = countMissingFields([setup.primaryGoal, event.eventGoal, event.eventFormat, event.clientExpectations, event.knownRisks, guestCount]);
    const quoteMissing = countMissingFields([
      quote.targetState === 'recorded' ? 'ok' : '',
      quote.priced || quote.recordedZero ? 'ok' : '',
      payment.status,
      paymentAmount,
      depositAmount,
      payment.balanceDueDate
    ]);
    const runMissing = countMissingFields([startLabel, endLabel, setupAccess, strikeLabel, setup.experienceDuration, setup.trainingFormat, setup.gameFormat]);
    const logisticsMissing = countMissingFields([setup.parkingInstructions, setup.travelNeeds, setup.powerInternet, setup.accessibilityNeeds, setup.layoutNotes, setup.productionNotes, setup.equipmentSource, setup.avNeeded]);
    const postMissing = countMissingFields([post.clientFeedback, post.whatWentWell, post.painPoints, post.changesForNextTime, reviewRequested, reviewReceived, post.rebookingLikelihood]);
    const kpi = (inner) => `<div class="kpi-autofit prop-rows">${inner}</div>`;
    return [
      workspaceSection(eventId, 'client-contact', 'Client and contact', kpi(`${recordedLine('Company / client', event.company)}${recordedLine('Contact name', event.contactName)}${recordedLine('Contact email', event.contactEmail)}${recordedLine('Contact phone', event.contactPhone)}${recordedLine('Event type', event.eventType)}`), { open: true, missing: clientMissing }),
      workspaceSection(eventId, 'discovery', 'Discovery and setup', kpi(`${recordedLine('Planning', setup.planningStage)}${recordedLine('Budget range', setup.budgetRange)}${recordedLine('Venue status', setup.venueStatus)}${recordedLine('Owner', setup.internalOwner)}${recordedLine('Stakeholders', setup.stakeholders, { full: true })}${recordedLine('Next action', event.nextAction, { full: true })}`), { open: true, missing: discoveryMissing }),
      workspaceSection(eventId, 'date-venue', 'Event date and venue', kpi(`${recordedLine('Event date', event.eventDate ? dateLabel(event.eventDate, event) : '')}${recordedLine('Venue', event.venue)}${recordedLine('City', event.city)}${recordedLine('State', event.state)}${recordedLine('Time zone', setup.timeZone || eventTz(event))}${recordedLine('Venue contact', setup.venueContact)}`), { open: true, missing: dateMissing }),
      workspaceSection(eventId, 'goals', 'Event goals', kpi(`${recordedLine('Primary goal', setup.primaryGoal)}${recordedLine('Event goal', event.eventGoal, { full: true })}${recordedLine('Event format', event.eventFormat)}${recordedLine('Client expectations', event.clientExpectations, { full: true })}${recordedLine('Known risks', event.knownRisks, { full: true })}${recordedLine('Guest count', guestCount)}`), { open: true, missing: goalsMissing }),
      workspaceSection(eventId, 'quote-payment', 'Quote / Line Items', `${kpi(`${recordedLine('Recorded target quote', targetLabel, { money: Boolean(targetLabel) })}${recordedLine('Priced line items', pricedLabel, { money: Boolean(pricedLabel) && pricedLabel !== 'Recorded zero' })}${recordedLine('Payment status', payment.status)}${recordedLine('Amount paid (event payment field)', paymentAmount, { money: Boolean(paymentAmount) })}${recordedLine('Deposit required', depositAmount, { money: Boolean(depositAmount) })}${recordedLine('Balance due date', payment.balanceDueDate)}`)}<p class="muted">A budget is not a quote. Payment initiated is not owner-confirmed receipt. Ledger invoices for this event are listed above.</p><ul>${quoteLines}</ul>`, { open: false, count: quoteLineCount, missing: quoteMissing }),
      workspaceSection(eventId, 'compliance', 'Compliance', `<ul>${compliance}</ul>`, { open: false, count: complianceRows.length }),
      workspaceSection(eventId, 'documents', 'Documents', documentRows(event), { open: false, count: docRows }),
      workspaceSection(eventId, 'run-of-show', 'Run of show', kpi(`${recordedLine('Start', startLabel)}${recordedLine('End', endLabel)}${recordedLine('Setup access', setupAccess)}${recordedLine('Strike', strikeLabel)}${recordedLine('Experience duration', setup.experienceDuration)}${recordedLine('Training format', setup.trainingFormat)}${recordedLine('Game format', setup.gameFormat)}`), { open: true, missing: runMissing }),
      workspaceSection(eventId, 'logistics', 'Logistics', kpi(`${recordedLine('Parking / loading', setup.parkingInstructions, { full: true })}${recordedLine('Travel / lodging', setup.travelNeeds, { full: true })}${recordedLine('Power / internet', setup.powerInternet)}${recordedLine('Accessibility', setup.accessibilityNeeds, { full: true })}${recordedLine('Layout / floor plan', setup.layoutNotes, { full: true })}${recordedLine('Production notes', setup.productionNotes, { full: true })}${recordedLine('Equipment source', setup.equipmentSource)}${recordedLine('AV needed', setup.avNeeded)}`), { open: true, missing: logisticsMissing }),
      workspaceSection(eventId, 'communications', 'Communications', `${communicationRows(event)}<div class="kpi-autofit prop-rows top-gap">${recordedLine('Gmail keywords', setup.gmailKeywords)}${recordedLine('Communication notes', notesHtml ? notesHtml : '', notesHtml ? { html: true, full: true } : { full: true })}</div>`, { open: false, count: mailRows }),
      workspaceSection(eventId, 'crm-attribution', 'CRM attribution', `<div class="kpi-autofit prop-rows" data-crm-record-attribution>${recordedLine('Acquisition source', acquisitionLabel)}${recordedLine('Recorded lead source', acquired.leadSource || '')}${recordedLine('UTM source', acquired.utmSource || '')}${recordedLine('UTM campaign', acquired.utmCampaign || '')}<div data-span="full"><span>Communication channel</span><strong>Not inferred from acquisition. Channel evidence stays on Communications / Action Required.</strong></div></div>`, { open: false }),
      workspaceSection(eventId, 'post-event', 'Post-event obligations', `${kpi(`${recordedLine('Client feedback', post.clientFeedback, { full: true })}${recordedLine('What went well', post.whatWentWell, { full: true })}${recordedLine('Pain points', post.painPoints, { full: true })}${recordedLine('Changes next time', post.changesForNextTime, { full: true })}${recordedLine('Review requested', reviewRequested)}${recordedLine('Review received', reviewReceived)}${recordedLine('Rebooking likelihood', post.rebookingLikelihood)}`)}<p class="muted">A past event date does not close open tasks, vendor bills, or payouts by itself.</p>`, { open: false, missing: postMissing }),
      workspaceSection(eventId, 'reports', 'Financial Summary & Operational Report', `${operationalReportPanel(buildScopedOperationalReport({ eventId }))}<p class="muted">Print/report output is limited to this validated event id (${escapeHtml(eventId)}). Overall portfolio reports stay off this record. Unknown amounts remain unknown. Target quotes are not added to priced totals. CSV export is omitted.</p><p><button type="button" class="btn small" data-print-record>Print this record</button></p>`, { open: true }),
      masterApi() ? masterApi().changeHistoryAccordion(event) : '',
      `<p class="muted">Task completion, proposal changes, and document writes stay off until separately approved. Master Controls allow owner-only single-field overrides with Change Log audit. No delete control is on this record.</p>`
    ].join('');
  }
  function renderRecord(view, eventId) {
    const generation = (window.lvptRecordGeneration = (window.lvptRecordGeneration || 0) + 1);
    const event = eventById(eventId);
    recordOpen = false;
    document.body.classList.remove('record-open');
    if (!event) {
      selectedId = '';
      clearRecordSurfaces();
      view.innerHTML = `<div class="command-view-shell">${viewHeader('Record', 'Unavailable', 'This id is not in the signed-in snapshot.')}<div class="command-view-body"><p class="hub-warning">This event is not in the signed-in sheet snapshot. Another event was not opened.</p><p><button type="button" class="btn" data-back-list>Back to list</button></p></div></div>`;
      bindEventOpeners(view);
      return;
    }
    selectedId = event.id;
    const staff = (event.staff || []).map((person) => `${escapeHtml(person.name || 'Unnamed')} · ${escapeHtml(person.role || 'Staff')}`).join(', ') || 'No staffing row on this event.';
    const allTasks = Array.isArray(event.tasks) ? event.tasks : [];
    const openTasks = allTasks.filter((task) => taskOpen(task));
    const completedTasks = allTasks.filter((task) => !taskOpen(task));
    const taskItem = (task) => `<li data-task-id="${escapeHtml(task.id)}">${escapeHtml(task.title || 'Untitled task')} · ${escapeHtml(task.dueDate || 'No due date')} · ${escapeHtml(task.status || 'Open')}</li>`;
    const openTaskHtml = openTasks.map(taskItem).join('') || '<li>No open task on this event.</li>';
    const completedTaskHtml = completedTasks.length
      ? `<details class="workspace-completed-tasks"><summary>Completed Tasks <span class="workspace-count">${completedTasks.length}</span></summary><ul>${completedTasks.map(taskItem).join('')}</ul></details>`
      : '<p class="muted">No completed tasks on this event.</p>';
    const tasksBody = `<ul data-open-tasks>${openTaskHtml}</ul>${completedTaskHtml}`;
    const headerDate = event.eventDate ? dateLabel(event.eventDate, event) : 'Date unavailable';
    const controls = masterApi() ? masterApi().masterControlsBar(event) : '';
    const html = `<div class="command-view-shell">${viewHeader('Event record', event.eventName || 'Untitled event', 'One event. Master Controls write a single audited field at a time.', '<button type="button" class="btn" data-back-list>Back to list</button>')}<div class="command-view-body"><article class="record-detail" data-record-event="${escapeHtml(event.id)}" data-record-generation="${generation}"><h2>${escapeHtml(event.eventName || 'Untitled event')}</h2><p>${escapeHtml(event.status || 'Status unavailable')} · ${escapeHtml(headerDate)} · ${escapeHtml(event.venue || 'Venue unavailable')}</p>${controls}${workspaceSection(event.id, 'tasks', 'Open Tasks', tasksBody, { open: true, count: openTasks.length })}${workspaceSection(event.id, 'staffing', 'Staffing', `<p data-record-staff>${staff}</p>`, { open: true, count: Array.isArray(event.staff) ? event.staff.length : 0 })}${workspaceSection(event.id, 'invoices', 'Invoices', `<div data-record-ledger>${recordLedgerInner(event.id)}</div>`, { open: true })}${recordSections(event)}</article></div></div>`;
    if (window.lvptRecordGeneration !== generation) return;
    view.innerHTML = html;
    if (typeof renderEditor === 'function') renderEditor();
    if (typeof renderTab === 'function') renderTab();
    ['saveEditorBtn', 'deleteEventBtn', 'duplicateEventBtn', 'reopenWizardBtn', 'quickAddTaskBtn', 'manageTasksBtn'].forEach((id) => {
      const button = document.getElementById(id);
      if (button) {
        button.disabled = true;
        button.hidden = true;
      }
    });
    document.querySelectorAll('#selectedEventTasksPanel [data-complete-task], #selectedEventTasksPanel [data-complete-compliance]').forEach((button) => {
      button.disabled = true;
      button.hidden = true;
    });
    bindEventOpeners(view);
    bindLedgerRetry(view);
    bindWorkspaceFilters(view);
    bindMasterControls(view, event.id);
    view.querySelector('[data-print-record]')?.addEventListener('click', () => {
      const recordEvent = eventById(event.id);
      if (!recordEvent) {
        toast('Selected event id is not in the current snapshot. Another event was not substituted.');
        return;
      }
      selectedId = recordEvent.id;
      const center = document.getElementById('reportCenter');
      if (center) center.hidden = false;
      const preButton = document.querySelector('[data-generate-report="pre"]');
      if (preButton) {
        preButton.click();
      } else if (typeof generateReport === 'function') {
        const output = document.getElementById('generatedReportOutput');
        if (output) {
          output.hidden = false;
          output.textContent = generateReport(recordEvent, 'pre');
        }
      }
      window.print();
    });
  }

  function followUpDueItems(scopeEvents) {
    const api = cadenceApi();
    if (!api || typeof api.buildFollowUpDueLane !== 'function') return [];
    return api.buildFollowUpDueLane(scopeEvents || events, { now: new Date(), allEvents: events }) || [];
  }
  function followUpDueCard(item) {
    const title = item.ruleName || 'Follow-up';
    const company = item.company || item.eventId || 'Event';
    const actions = item.eventId && masterApi() ? masterApi().followUpActionsHtml(item.eventId) : '';
    return `<article class="followup-item" data-follow-up-rule="${escapeHtml(item.ruleId || '')}" data-event-id="${escapeHtml(item.eventId || '')}"><div class="followup-icon">!</div><div><h3>${escapeHtml(title)}</h3><p><strong>${escapeHtml(company)}</strong> · ${escapeHtml(item.reasonForContact || '')}</p><p class="muted">${escapeHtml(item.suggestedAngle || '')}</p>${actions}</div><div class="followup-item-meta"><strong>Follow-Up Due</strong>${item.dueDate ? dateLabel(item.dueDate) : 'Review'}${item.eventId ? `<div class="review-actions"><button type="button" class="btn small" data-open-event="${escapeHtml(item.eventId)}">Open Record</button></div>` : ''}</div></article>`;
  }
  function followUpDueSection(items) {
    if (!items.length) return '';
    return `<section class="followup-due-lane" data-follow-up-due><h3>Follow-Up Due</h3><p class="muted">Cadence suggestions with Mark Contacted / Snooze. No send controls.</p><div class="followup-grid">${items.map(followUpDueCard).join('')}</div></section>`;
  }
  function followUpDuePipelineColumn(items) {
    const cards = items.map((item) => {
      const title = item.ruleName || 'Follow-up';
      const next = item.suggestedAngle || item.reasonForContact || 'Review cadence';
      const actions = item.eventId && masterApi() ? masterApi().followUpActionsHtml(item.eventId) : '';
      const openAttr = item.eventId
        ? ` data-event-id="${escapeHtml(item.eventId)}"`
        : '';
      return `<div class="pipeline-card pipeline-card--static"${openAttr} data-follow-up-rule="${escapeHtml(item.ruleId || '')}" data-pipeline-lane="follow_up_due"><strong>${escapeHtml(title)}</strong><p>${escapeHtml(item.reasonForContact || 'Follow-up due')}</p><p class="muted">${escapeHtml(item.company || item.eventId || '')}</p><div class="pipeline-card-meta"><span>${item.dueDate ? escapeHtml(dateLabel(item.dueDate)) : 'Review'}</span>${item.eventId ? `<button type="button" class="btn small" data-open-event="${escapeHtml(item.eventId)}">Open</button>` : ''}</div><p class="pipeline-card-next">Angle: ${escapeHtml(next)}</p>${actions}</div>`;
    }).join('');
    return `<section class="pipeline-column" data-pipeline-lane="follow_up_due" data-follow-up-due-column><div class="pipeline-column-head"><h3>Follow-Up Due</h3><span class="pipeline-column-count">${items.length}</span></div><div class="pipeline-cards" data-pipeline-dropzone="follow_up_due">${cards || '<div class="command-empty">None</div>'}</div></section>`;
  }
  function renderPipeline(view) {
    if (snapshotBlocks(view, 'Sales Pipeline', 'Present & Future Opportunities')) return;
    const items = events.filter((event) => isPipeline(event) || laneOf(event).lane === 'review');
    const groups = [
      { key: 'new_discovery', label: 'New & Discovery', match: (event) => laneOf(event).stage === 'open' && /^(new lead|needs discovery)$/i.test(laneOf(event).normalized || laneOf(event).raw) },
      { key: 'quote_proposal', label: 'Quote & Proposal', match: (event) => laneOf(event).stage === 'open' && /^(quote needed|proposal sent)$/i.test(laneOf(event).normalized || laneOf(event).raw) },
      { key: 'invoiced_not_booked', label: 'Invoiced / Not Booked', match: (event) => laneOf(event).stage === 'invoice_sent' || laneOf(event).stage === 'invoice_awaiting_deposit' },
      { key: 'needs_review', label: 'Needs Review', match: (event) => laneOf(event).lane === 'review' }
    ];
    const columns = groups.map((group) => {
      const matches = items.filter(group.match);
      return `<section class="pipeline-column" data-pipeline-lane="${escapeHtml(group.key)}"><div class="pipeline-column-head"><h3>${escapeHtml(group.label)}</h3><span class="pipeline-column-count">${matches.length}</span></div><div class="pipeline-cards" data-pipeline-dropzone="${escapeHtml(group.key)}">${matches.map(pipelineCard).join('') || '<div class="command-empty">None</div>'}</div><label class="pipeline-mobile-move muted">Move selected<select class="input" data-pipeline-move-select data-lane="${escapeHtml(group.key)}"><option value="">Move card…</option>${items.map((event) => `<option value="${escapeHtml(event.id)}">${escapeHtml(event.eventName || event.id)}</option>`).join('')}</select></label></section>`;
    }).join('');
    const dueItems = followUpDueItems(items);
    const attribution = crmApi()
      ? crmApi().formatAttributionPanel(crmApi().summarizeEventAcquisition(events), escapeHtml)
      : '<p class="muted">CRM attribution model unavailable.</p>';
    const attributionDrawer = `<details class="crm-attribution-drawer" data-crm-attribution-drawer><summary>CRM attribution</summary><div class="workspace-accordion-body">${attribution}</div></details>`;
    view.innerHTML = `<div class="command-view-shell">${viewHeader('Sales Pipeline','Present & Future Opportunities','Drag cards across lanes or use the Move select on mobile. Booked events stay in Active.')}<div class="command-view-body">${summarizeQuotes(items)}<p><a class="btn small" href="#" data-command-jump="active">Open Active events</a></p>${followUpDueSection(dueItems)}<div class="pipeline-board top-gap">${columns}${followUpDuePipelineColumn(dueItems)}</div>${attributionDrawer}</div></div>`;
    view.querySelector('[data-command-jump="active"]')?.addEventListener('click', (clickEvent) => { clickEvent.preventDefault(); setCommandView('active'); });
    bindEventOpeners(view);
    bindPipelineInteractions(view);
    bindFollowUpActions(view);
  }

  function pipelineCard(event) {
    const sheetLinked = Boolean(explicitProposalUrl(event));
    const quote = statusApi().quoteCoverage(event);
    const value = quote.priced ? (quote.linePartial ? `Partial lines ${moneyCents(quote.pricedCents)}` : moneyCents(quote.pricedCents)) : quote.recordedZero ? 'Recorded zero' : quote.targetState === 'recorded' ? `Recorded target ${moneyCents(quote.recordedTargetCents)}` : 'Unpriced';
    const title = String(event.eventName || event.contactName || 'Untitled event').trim();
    const next = String(event.nextAction || '').trim().slice(0, 90) || 'No next action recorded';
    const acquired = crmApi() ? crmApi().acquisitionChannelLines(event) : { kind: 'unknown', acquisitionText: 'Acquisition: Unknown (not recorded)' };
    return `<div class="pipeline-card" draggable="true" tabindex="0" data-pipeline-card data-event-id="${escapeHtml(event.id)}" data-stage="${escapeHtml(laneOf(event).stage)}" data-acquisition-kind="${escapeHtml(acquired.kind)}"><strong>${escapeHtml(title)}</strong><p>${escapeHtml(laneOf(event).raw || 'Status not recorded')} · ${dateLabel(event.eventDate, event)}</p><p class="muted" data-crm-acquisition>${escapeHtml(acquired.acquisitionText)}</p><div class="pipeline-card-meta"><span>${moneyAwareHtml(value)}</span><button type="button" class="btn small" data-open-event="${escapeHtml(event.id)}">Open</button></div><p class="pipeline-card-next">Next: ${escapeHtml(next)}${sheetLinked ? ' · Proposal linked' : ''}</p></div>`;
  }

  async function refreshAfterOverride() {
    if (typeof window.lvptReloadSheetSnapshot === 'function') {
      await window.lvptReloadSheetSnapshot(true);
    } else if (typeof pullCloudEvents === 'function') {
      await pullCloudEvents(false);
    }
    renderCommandView();
  }

  async function commitOverride(eventId, field, value) {
    const api = masterApi();
    if (!api) {
      toast('Master Controls unavailable.');
      return false;
    }
    const event = eventById(eventId);
    if (!event) {
      toast('Event is not in the signed-in snapshot.');
      return false;
    }
    const oldValue = api.currentValue(event, field);
    if (String(oldValue) === String(value)) return false;
    try {
      const outcome = await api.confirmAndSaveOverride({
        eventId,
        field,
        value,
        oldValue,
        actor: localStorage.getItem('lvptCurrentActor') || 'Owner'
      });
      if (outcome.cancelled) return false;
      api.applyLocalOverride(event, field, value, outcome.result && outcome.result.note, outcome.result);
      toast(outcome.result && outcome.result.diff ? outcome.result.diff : 'Override saved');
      await refreshAfterOverride();
      return true;
    } catch (error) {
      toast(error && error.message ? error.message : 'Override failed');
      return false;
    }
  }

  function bindMasterControls(scope, eventId) {
    const root = Array.from(scope.querySelectorAll('[data-master-controls]')).find((node) => node.getAttribute('data-event-id') === eventId);
    if (!root || !masterApi()) return;
    root.querySelectorAll('[data-master-field]').forEach((input) => {
      const field = input.getAttribute('data-master-field');
      const handler = async () => {
        const value = input.value;
        const ok = await commitOverride(eventId, field, value);
        if (!ok) {
          const event = eventById(eventId);
          if (event) input.value = masterApi().currentValue(event, field);
        }
      };
      input.addEventListener('change', handler);
    });
  }

  function bindPipelineInteractions(scope) {
    scope.querySelectorAll('[data-pipeline-card]').forEach((card) => {
      card.addEventListener('dragstart', (event) => {
        event.dataTransfer.setData('text/plain', card.getAttribute('data-event-id') || '');
        event.dataTransfer.effectAllowed = 'move';
        card.classList.add('is-dragging');
      });
      card.addEventListener('dragend', () => card.classList.remove('is-dragging'));
    });
    scope.querySelectorAll('[data-pipeline-dropzone]').forEach((zone) => {
      zone.addEventListener('dragover', (event) => {
        event.preventDefault();
        zone.classList.add('is-drop-target');
      });
      zone.addEventListener('dragleave', () => zone.classList.remove('is-drop-target'));
      zone.addEventListener('drop', async (event) => {
        event.preventDefault();
        zone.classList.remove('is-drop-target');
        const eventId = event.dataTransfer.getData('text/plain');
        const lane = zone.getAttribute('data-pipeline-dropzone');
        if (!eventId || !lane) return;
        await commitOverride(eventId, 'pipelineStage', lane);
      });
    });
    scope.querySelectorAll('[data-pipeline-move-select]').forEach((select) => {
      select.addEventListener('change', async () => {
        const eventId = select.value;
        const lane = select.getAttribute('data-lane');
        select.value = '';
        if (!eventId || !lane) return;
        await commitOverride(eventId, 'pipelineStage', lane);
      });
    });
  }

  function bindFollowUpActions(scope) {
    scope.querySelectorAll('[data-followup-action]').forEach((button) => {
      button.addEventListener('click', async (clickEvent) => {
        clickEvent.preventDefault();
        clickEvent.stopPropagation();
        const wrap = button.closest('[data-followup-actions]');
        const eventId = wrap && wrap.getAttribute('data-event-id');
        if (!eventId || !masterApi()) return;
        const action = button.getAttribute('data-followup-action');
        if (action === 'mark-contacted') {
          await commitOverride(eventId, 'followUpSnoozeUntil', masterApi().snoozeDate(1));
          return;
        }
        if (action === 'snooze') {
          const days = Number(button.getAttribute('data-days') || 7);
          await commitOverride(eventId, 'followUpSnoozeUntil', masterApi().snoozeDate(days));
        }
      });
    });
  }

  function renderPortfolio(view, mode) {
    if (snapshotBlocks(view, mode === 'active' ? 'Present & Future' : 'Past', mode === 'active' ? 'Booked & Active Events' : 'Past Event Archive')) return;
    const items = events.filter(mode === 'active' ? isActive : isArchive).sort((a,b)=>String(b.eventDate||'').localeCompare(String(a.eventDate||'')));
    const title = mode === 'active' ? 'Booked & Active Events' : 'Past Event Archive';
    const copy = mode === 'active' ? 'Confirmed experiences moving through planning, production and event day.' : 'Completed, lost and historical opportunities with their financials, documents, proposals and follow-up history intact.';
    view.innerHTML = `<div class="command-view-shell">${viewHeader(mode === 'active' ? 'Present & Future' : 'Past',''+title,copy)}<div class="command-view-body">${summarizeQuotes(items)}<div class="portfolio-grid top-gap">${items.map(portfolioCard).join('') || '<div class="command-empty">No records in this section.</div>'}</div></div></div>`;
    bindEventOpeners(view);
  }

  function portfolioPaymentLabel(event) {
    const api = financeApi();
    const picture = overviewPictureState();
    const report = picture.ready && picture.data && picture.data.report ? picture.data.report : null;
    const payments = report && Array.isArray(report.payments) ? report.payments : null;
    const byEvent = report && Array.isArray(report.byEvent) ? report.byEvent : null;
    const rollupRow = byEvent ? byEvent.find((row) => row && String(row.eventId) === String(event.id)) : null;
    if (api && typeof api.plainEnglishPaymentLabel === 'function' && payments) {
      const result = api.plainEnglishPaymentLabel({
        payments,
        eventId: event.id,
        rollup: rollupRow
          ? { collectedCents: rollupRow.collectedCents, outstandingCents: rollupRow.outstandingCents }
          : null
      });
      return {
        label: result && result.label ? result.label : 'Not recorded',
        footnote: result && result.footnote ? result.footnote : 'Ledger only · not bank-verified',
        kind: result && result.kind ? result.kind : 'none'
      };
    }
    if (event.paymentRecorded) {
      return {
        label: money(event.payment && event.payment.amountPaid),
        footnote: 'Ledger only · not bank-verified',
        kind: 'ledger_fallback'
      };
    }
    return { label: 'Not recorded', footnote: 'Ledger only · not bank-verified', kind: 'none' };
  }
  function portfolioCard(event) {
    const historical = historicalProposalForEvent(event);
    const lane = laneOf(event);
    const linkState = proposalUrlState(event);
    const proposalLabel = linkState === 'Not linked' ? 'Not linked' : linkState;
    const historicalNote = historical
      ? `<p class="muted" data-historical-proposal="${escapeHtml(historical.id)}">Historical design reference on file (${escapeHtml(historical.title)}). Not a current proposal link.</p>`
      : '';
    const paymentNote = lane.stage === 'payment_processing'
      ? '<p data-payment-processing-note>Booked — payment processing. This status does not establish that payment was received.</p>'
      : (lane.stage === 'booked' && !event.paymentRecorded
        ? '<p data-booked-payment-note>Booked. No owner-confirmed receipt is recorded on this event.</p>'
        : '');
    const pastNote = `${lane.past && !lane.completed ? '<p>Past date. The recorded status was not changed to completed.</p>' : ''}${lane.needsOutcomeReview ? '<p>Outcome needs review.</p>' : ''}${paymentNote}`;
    const quote = statusApi().quoteCoverage(event);
    const value = quote.priced ? (quote.linePartial ? `Partial lines ${moneyCents(quote.pricedCents)}` : moneyCents(quote.pricedCents)) : quote.recordedZero ? 'Recorded zero' : quote.targetState === 'recorded' ? `Recorded target ${moneyCents(quote.recordedTargetCents)}` : 'Unpriced';
    const paymentInfo = portfolioPaymentLabel(event);
    const title = String(event.eventName || event.contactName || 'Untitled event').trim();
    const sheetUrl = explicitProposalUrl(event);
    const previewId = sheetUrl ? `event-${event.id}` : (historical ? historical.id : '');
    return `<article class="portfolio-card" data-event-id="${escapeHtml(event.id)}" data-stage="${escapeHtml(lane.stage)}" data-lane="${escapeHtml(lane.lane)}" data-proposal-state="${escapeHtml(linkState)}"${historical ? ` data-historical-proposal-id="${escapeHtml(historical.id)}"` : ''}><div class="portfolio-card-body"><p class="eyebrow small">${escapeHtml(lane.raw || event.status || 'Status not recorded')}</p><h3>${escapeHtml(title)}</h3><p>${dateLabel(event.eventDate, event)}<br>${escapeHtml(event.venue || 'Venue TBD')}</p>${pastNote}${historicalNote}<div class="portfolio-card-grid"><div><span>Priced quote</span>${kpiValueHtml(value)}</div><div><span>Open Items</span><strong>${openTaskCount(event)}</strong></div><div><span>Proposal</span><strong data-proposal-label>${escapeHtml(proposalLabel)}</strong></div><div class="portfolio-payment" data-span="full" data-payment-label-kind="${escapeHtml(paymentInfo.kind)}"><span>Payment</span>${paymentLabelHtml(paymentInfo.label)}<p class="muted">${escapeHtml(paymentInfo.footnote)}</p></div></div></div><div class="actions portfolio-card-actions"><button class="btn small primary" data-open-event="${escapeHtml(event.id)}">Open Record</button>${previewId ? `<button class="btn small" data-preview-proposal="${escapeHtml(previewId)}">Preview Proposal</button>` : ''}</div></article>`;
  }

  function renderProposals(view) {
    if (snapshotBlocks(view, 'Design & Sales Library', 'Proposal Library')) return;
    const linked = events.filter((event) => explicitProposalUrl(event)).map((event) => ({
      id: `event-${event.id}`,
      client: event.company || 'Recorded client',
      title: event.eventName || event.id,
      project: 'Authoritative event link',
      url: explicitProposalUrl(event),
      status: 'Recorded on the event',
      updated: '',
      eventId: event.id,
      tags: ['Sheet'],
      notes: 'This link is the proposal URL stored on the event. It was not inferred from the company name.',
      kind: 'sheet'
    }));
    const invalid = events.filter((event) => proposalUrlState(event) === 'Invalid link').map((event) => ({
      id: `invalid-${event.id}`,
      client: event.company || 'Recorded client',
      title: event.eventName || event.id,
      project: 'Invalid proposal URL',
      url: '',
      status: 'Invalid link',
      updated: '',
      eventId: event.id,
      tags: ['Sheet'],
      notes: 'A proposal URL is recorded on this event but it is not a valid https link without credentials. The URL is not shown here and was not invented from the company name.',
      kind: 'invalid'
    }));
    const missingCount = events.filter((event) => proposalUrlState(event) === 'Not linked').length;
    const historical = proposals.map((item) => ({ ...item, status: HISTORICAL_PROPOSAL_STATUS, kind: 'historical' }));
    const query = proposalQuery.toLowerCase();
    const filtered = historical.filter((item) => [item.client, item.title, item.project, item.notes].join(' ').toLowerCase().includes(query));
    const missingNote = `<p class="muted" data-proposal-missing-count="${missingCount}">${missingCount} event${missingCount === 1 ? '' : 's'} have no proposal URL on the sheet. Missing links stay missing; no URL was invented.</p>`;
    view.innerHTML = `<div class="command-view-shell">${viewHeader('Design & Sales Library','Proposal Library','Authoritative links come only from a proposal URL stored on the event. The older six cards are a historical reference and are not marked active.')}<div class="command-view-body"><h3>Recorded on the sheet</h3><div class="proposal-grid">${linked.map(proposalCard).join('') || '<div class="command-empty">No event has a validated proposal link.</div>'}</div><h3>Invalid or incomplete links</h3><div class="proposal-grid">${invalid.map(proposalCard).join('') || '<div class="command-empty">No invalid proposal URLs on the current sheet snapshot.</div>'}</div>${missingNote}<h3>Historical reference, not verified</h3><div class="proposal-toolbar"><input class="input" id="proposalSearch" placeholder="Search the historical reference..." value="${escapeHtml(proposalQuery)}"></div><div class="proposal-grid">${filtered.map(proposalCard).join('')}</div></div></div>`;
    $('#proposalSearch')?.addEventListener('input', (event) => { proposalQuery = event.target.value; renderProposals(view); $('#proposalSearch')?.focus(); });
    bindProposalOpeners(view);
    bindEventOpeners(view);
  }

  function proposalCard(item) {
    const associated = item.eventId && eventById(item.eventId) ? item.eventId : '';
    const openLive = item.url
      ? `<a class="btn small" href="${escapeHtml(item.url)}" target="_blank" rel="noopener">Open Live</a>`
      : '<span class="muted">No validated link</span>';
    const preview = item.kind === 'invalid'
      ? ''
      : `<button class="btn small primary" data-preview-proposal="${escapeHtml(item.id)}">Preview</button>`;
    return `<article class="proposal-card" data-proposal-kind="${escapeHtml(item.kind || '')}" data-event-id="${escapeHtml(item.eventId || '')}"><p class="eyebrow small">${escapeHtml(item.status)}</p><h3>${escapeHtml(item.title)}</h3><p><strong>${escapeHtml(item.client)}</strong><br>${escapeHtml(item.notes)}</p><div class="proposal-tags">${(item.tags || []).map((tag) => `<span>${escapeHtml(tag)}</span>`).join('')}</div><div class="proposal-meta"><div><span>Vercel Project</span><strong>${escapeHtml(item.project)}</strong></div><div><span>Last Updated</span><strong>${dateLabel(item.updated)}</strong></div></div><div class="actions">${preview}${openLive}${associated ? `<button class="btn small" data-open-event="${escapeHtml(associated)}">Event Record</button>` : ''}</div></article>`;
  }

  function ensureProposalModal() {
    if ($('#proposalPreviewDialog')) return;
    const dialog=document.createElement('dialog');
    dialog.id='proposalPreviewDialog'; dialog.className='modal proposal-modal';
    dialog.innerHTML='<div class="modal-card"><div class="modal-head"><div><p class="eyebrow small">Live Proposal Preview</p><h2 id="proposalPreviewTitle">Proposal</h2><p class="muted compact" id="proposalPreviewMeta"></p></div><div class="proposal-modal-actions"><a class="btn small primary" id="proposalPreviewOpen" target="_blank" rel="noopener">Open Full Proposal</a><button class="icon-btn" type="button" id="proposalPreviewClose" aria-label="Close">×</button></div></div><iframe class="proposal-preview-frame" id="proposalPreviewFrame" title="Proposal preview" loading="lazy" sandbox="allow-scripts allow-same-origin allow-forms allow-popups"></iframe></div>';
    document.body.appendChild(dialog);
    $('#proposalPreviewClose').addEventListener('click',()=>{ dialog.close(); $('#proposalPreviewFrame').src='about:blank'; });
    dialog.addEventListener('click',event=>{ if(event.target===dialog){ dialog.close(); $('#proposalPreviewFrame').src='about:blank'; } });
  }

  function previewProposal(id) {
    const key = String(id || '');
    if (key.startsWith('event-')) {
      const event = eventById(key.slice('event-'.length));
      const url = explicitProposalUrl(event);
      if (!event || !url) return;
      $('#proposalPreviewTitle').textContent = event.eventName || event.id;
      $('#proposalPreviewMeta').textContent = `${event.company || 'Recorded client'} · Authoritative event link · Recorded on the event`;
      $('#proposalPreviewOpen').href = url;
      $('#proposalPreviewFrame').src = url;
      $('#proposalPreviewDialog').showModal();
      return;
    }
    const item = proposals.find((proposal) => proposal.id === key);
    if (!item) return;
    $('#proposalPreviewTitle').textContent = item.title;
    $('#proposalPreviewMeta').textContent = `${item.client} · ${item.project} · ${HISTORICAL_PROPOSAL_STATUS}`;
    $('#proposalPreviewOpen').href = item.url;
    $('#proposalPreviewFrame').src = item.url;
    $('#proposalPreviewDialog').showModal();
  }

  function taskStillOpen(task) {
    const status = String(task && task.status || '').trim().toLowerCase();
    if (!status) return true;
    return !['complete','completed','resolved','done','cancelled','canceled','closed','closed won','closed lost','declined'].includes(status);
  }
  function deriveFollowUps() {
    const items=[];
    events.forEach(event=>{
      (event.tasks||[]).filter(taskStillOpen).forEach(task=>{
        const days=daysFromToday(task.dueDate);
        if(days<=7) items.push({id:task.id,eventId:event.id,eventName:event.eventName,title:task.title,detail:`${task.owner||'Unassigned'} · recorded status ${task.status||'Open'}`,due:task.dueDate||'',days,kind:'Task'});
      });
    });
    return items.sort((a,b)=>(a.days??0)-(b.days??0));
  }

  function renderFollowUp(view) {
    if (snapshotBlocks(view, 'Email Intelligence', 'Client Follow-Up')) return;
    const items=deriveFollowUps();
    const dueItems = followUpDueItems(events);
    const action='';
    view.innerHTML=`<div class="command-view-shell">${viewHeader('Email Intelligence','Client Follow-Up','Open tasks recorded on the sheet. A past event date does not complete a task. Schedule review is off in this preview.',action)}<div class="command-view-body">${followUpDueSection(dueItems)}<p class="muted">Needs attention: ${items.length}. These are recorded tasks, not a generated follow-up list.</p><div class="followup-grid">${items.map(followUpCard).join('')||'<div class="command-empty">No open sheet task is due within seven days.</div>'}</div></div></div>`;
    bindEventOpeners(view);
    bindFollowUpActions(view);
    all('[data-review-item]').forEach(button=>button.addEventListener('click',()=>reviewAutomationItem(button.dataset.reviewItem,button.dataset.reviewStatus)));
  }

  function followUpCard(item) {
    const urgency=item.days<0?'urgent':'';
    return `<article class="followup-item ${urgency}"><div class="followup-icon">${item.kind==='Email'?'@':item.kind==='Post-Event'?'✓':'!'}</div><div><h3>${escapeHtml(item.title)}</h3><p><strong>${escapeHtml(item.eventName)}</strong> · ${escapeHtml(item.detail)}</p></div><div class="followup-item-meta"><strong>${escapeHtml(item.kind)}</strong>${item.due?dateLabel(String(item.due).slice(0,10)):item.days<0?`${Math.abs(item.days)} day(s) waiting`:'Review'}${item.review?`<div class="review-actions"><button class="btn small" data-review-item="${escapeHtml(item.id)}" data-review-status="Reviewed">Reviewed</button><button class="btn small" data-review-item="${escapeHtml(item.id)}" data-review-status="Dismissed">Dismiss</button></div>`:item.eventId?`<div class="review-actions"><button class="btn small" data-open-event="${escapeHtml(item.eventId)}">Open Record</button></div>`:''}</div></article>`;
  }

  async function automationRequest(method='GET', body) {
    const key=localStorage.getItem(APP_KEY)||'';
    if(!key) throw new Error('Enter the LVPT App Sync Key in the System tab first.');
    const response=await fetch('/api/sync/automation',{method,headers:{'x-lvpt-sync-key':key,...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,cache:'no-store'});
    const data=await response.json().catch(()=>({message:'Invalid automation response.'}));
    if(!response.ok||data.ok===false) throw new Error(data.message||`Automation request failed (${response.status}).`);
    return data;
  }

  async function loadAutomationStatus(showToast=false) {
    automationState.loading=true; if(commandView==='followup') renderCommandView();
    try {
      const data=await automationRequest();
      automationState={...automationState,...data,loading:false,loaded:true,configured:true,items:Array.isArray(data.items)?data.items:[],stats:data.stats||{}};
      if(showToast) toast('Client follow-up queue refreshed');
    } catch(error) {
      automationState={...automationState,loading:false,loaded:true,configured:false,error:error.message};
      if(showToast) toast(error.message);
    }
    if(commandView==='followup') renderCommandView();
  }

  async function runAutomation(command) {
    automationState.loading=true; renderCommandView();
    try {
      const data=await automationRequest('POST',{command});
      toast(command==='install'?'Morning and evening email reviews scheduled':'Email review complete');
      if(command==='scan' && typeof pullCloudEvents==='function') await pullCloudEvents(false);
      await loadAutomationStatus(false);
    } catch(error) { automationState.loading=false; toast(error.message); renderCommandView(); }
  }

  async function reviewAutomationItem(reviewId,status) {
    try { await automationRequest('POST',{command:'review',reviewId,status}); toast(`Item marked ${status.toLowerCase()}`); await loadAutomationStatus(false); }
    catch(error){ toast(error.message); }
  }

  function openTask(eventId, taskId) {
    if (!suppressHistory && !detail) rememberList();
    const event = eventById(eventId);
    const task = event && (event.tasks || []).find((item) => item.id === taskId);
    selectedId = '';
    recordOpen = false;
    clearRecordSurfaces();
    commandView = 'overview';
    detail = event && task
      ? { mode: 'task', eventId: event.id, taskId: task.id, origin: 'overview' }
      : { mode: 'missing', eventId: eventId || '', taskId: taskId || '', origin: 'overview' };
    localStorage.setItem(VIEW_KEY, commandView);
    renderCommandView();
    pushHistory();
    if (suppressHistory) restoreListScroll();
  }
  function openRecord(eventId) {
    if (!suppressHistory && !detail) rememberList();
    const event = eventById(eventId);
    detail = { mode: 'record', eventId: event ? event.id : (eventId || ''), origin: commandView };
    recordOpen = false;
    renderCommandView();
    pushHistory();
  }
  function backToList() {
    if (!suppressHistory && history.state && history.state.lvptNav && (history.state.lvptNav.eventId || history.state.lvptNav.taskId)) {
      history.back();
      return;
    }
    detail = null;
    selectedId = '';
    recordOpen = false;
    clearRecordSurfaces();
    renderCommandView();
    restoreListScroll();
  }
  function applyNav(state) {
    const nav = state && state.lvptNav ? state.lvptNav : { view: commandView || 'overview', eventId: '', taskId: '' };
    suppressHistory = true;
    commandView = nav.view || 'overview';
    if (nav.taskId) openTask(nav.eventId, nav.taskId);
    else if (nav.eventId) openRecord(nav.eventId);
    else {
      detail = null;
      selectedId = '';
      recordOpen = false;
      clearRecordSurfaces();
      localStorage.setItem(VIEW_KEY, commandView);
      renderCommandView();
      restoreListScroll();
    }
    suppressHistory = false;
  }
  function bindEventOpeners(scope=document) {
    scope.querySelectorAll('[data-open-task]').forEach((button) => button.addEventListener('click', () => openTask(button.dataset.taskEvent, button.dataset.openTask)));
    scope.querySelectorAll('[data-view-event]').forEach((button) => button.addEventListener('click', () => openRecord(button.dataset.viewEvent)));
    scope.querySelectorAll('[data-open-event]').forEach((button) => button.addEventListener('click', () => openRecord(button.dataset.openEvent)));
    scope.querySelectorAll('[data-close-task], [data-back-list]').forEach((button) => button.addEventListener('click', () => backToList()));
    bindProposalOpeners(scope);
  }
  function bindProposalOpeners(scope=document) { scope.querySelectorAll('[data-preview-proposal]').forEach(button=>button.addEventListener('click',()=>previewProposal(button.dataset.previewProposal))); }

  const baseRender=render;
  render=function(){ baseRender(); renderCommandView(); };
  ensureShell();
  renderCommandView();
  window.lvptOpenRecord = openRecord;
  window.lvptOpenTask = openTask;
  window.addEventListener('popstate', (event) => applyNav(event.state));
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  history.replaceState({ lvptNav: { view: commandView, eventId: '', taskId: '' } }, '');
})();
