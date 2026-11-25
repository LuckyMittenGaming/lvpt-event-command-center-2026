(() => {
  const VIEW_KEY = 'lvptCommandCenterView';
  const APP_KEY = 'lvptAppSyncKey';
  let recordOpen = false;
  const statusApi = () => window.LVPTEventStatus;
  const proposals = [
    { id:'proposal-nium', client:'NIUM', title:'NIUM VIP Casino Lounge', project:'lvpt-nium-proposal', url:'https://lvpt-nium-proposal.vercel.app/', status:'Accepted / Booked', updated:'2026-07-16', eventId:'evt-nium-2026', tags:['Palms Place','Casino Night','Custom Assets','Transportation'], notes:'Enterprise proposal with venue comparisons, custom chips/cards/felts, premium catering, open bar and transportation.' },
    { id:'proposal-neo-2026', client:'Mosaic Events / NEO', title:'NEO Reunion 2026', project:'mosaic-neo-2026-proposal', url:'https://mosaic-neo-2026-proposal.vercel.app/', status:'Updated Proposal', updated:'2026-08-13', eventId:'evt-neo-reunion-2026', tags:['Training','Tournament','Ritz-Carlton','Repeat Client'], notes:'Year-two training and tournament proposal with premium instructor positioning and event improvements.' },
    { id:'proposal-workato', client:'Workato', title:'Workato Poker Experience', project:'workato-poker-experience', url:'https://workato-poker-experience.vercel.app/', status:'Proposal Active', updated:'2026-08-12', eventId:'', tags:['Venue Options','Transportation','Catering','Image Gallery'], notes:'Multi-route Las Vegas proposal featuring Palms Place, Venetian poker room, Mob Museum and Allegiant Stadium.' },
    { id:'proposal-safelease', client:'SafeLease', title:'SafeLease Poker Experience', project:'safelease-poker-experience', url:'https://safelease-poker-experience.vercel.app/', status:'Proposal Active', updated:'2026-08-05', eventId:'', tags:['Trade Show','Lead Generation','ARIA','Booth Activation'], notes:'Trade-show poker activation proposal with booth engagement and future tournament opportunity.' },
    { id:'proposal-ownwell', client:'Ownwell', title:'Ownwell Poker Proposal', project:'ownwell-poker-proposal', url:'https://ownwell-poker-proposal.vercel.app/', status:'Past Reference', updated:'2026-08-05', eventId:'', tags:['Gallery','Visual Reference','Poker Experience'], notes:'Past proposal retained as a visual and image-gallery reference for future builds.' },
    { id:'proposal-defending-education', client:'Defending Education', title:'Defending Education Poker Proposal', project:'defending-education-poker-proposal', url:'https://defending-education-poker-proposal.vercel.app/', status:'Past Reference', updated:'2026-07-24', eventId:'', tags:['Corporate','Training','Proposal Reference'], notes:'Past corporate poker proposal retained for layouts, copy modules and reusable presentation patterns.' },
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
  function dateLabel(value) { if(!value) return 'Date TBD'; const date=new Date(`${value}T12:00:00`); return Number.isNaN(date.getTime())?value:date.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}); }
  function ageInDays(value) { if(!value) return Infinity; return Math.floor((Date.now()-new Date(value).getTime())/86400000); }
  function proposalForEvent(event) { return proposals.find(item => item.eventId && item.eventId === event.id); }
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
  function overviewLedgerInner() {
    const result = window.lvptOperatingPictureResult;
    const pending = window.lvptOperatingPicturePromise && !result;
    if (!result || result.ok === false || !result.data || !result.data.report || !result.data.report.money) {
      return pending
        ? '<p class="muted">Ledger-recorded receipts are still loading. A blank figure is not zero and not a bank balance.</p>'
        : '<p class="muted">Ledger-recorded receipts did not load. This is not zero.</p><p><button type="button" class="btn" id="retryOverviewLedger">Retry ledger</button></p>';
    }
    const money = result.data.report.money;
    const receipts = money.verifiedClientReceiptsCents == null ? 'Unavailable' : ledgerAmount(money.verifiedClientReceiptsCents);
    const outstanding = money.openClientExposureCents == null ? 'Unavailable' : ledgerAmount(money.openClientExposureCents);
    return `<div class="lifecycle-summary"><div><span>Ledger-recorded receipts</span><strong>${escapeHtml(receipts)}</strong><p class="muted">Not a bank receipt.</p></div><div><span>Ledger outstanding</span><strong>${escapeHtml(outstanding)}</strong><p class="muted">Open balances on the sheet. Not drawable cash.</p></div></div>`;
  }
  function bindLedgerRetry(scope) {
    scope.querySelector('#retryOverviewLedger')?.addEventListener('click', () => window.lvptReloadOperatingPicture && window.lvptReloadOperatingPicture());
    scope.querySelector('#retryRecordLedger')?.addEventListener('click', () => window.lvptReloadOperatingPicture && window.lvptReloadOperatingPicture());
  }
  window.lvptPaintOverviewLedger = function () {
    const node = document.getElementById('overviewLedger');
    if (!node) return;
    node.innerHTML = overviewLedgerInner();
    bindLedgerRetry(node);
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
    return `<div class="lifecycle-summary"><div><span>Records</span><strong>${items.length}</strong></div><div><span>Recorded targets</span><strong>${targets ? moneyCents(targetCents) : 'None recorded'}</strong><p class="muted">${targets} explicit target quotes. Not added to line items. A budget is not a target.</p></div><div><span>Priced line items</span><strong>${moneyCents(priced ? pricedCents : null)}</strong><p class="muted">${priced} complete · ${partial} partial · ${unpriced} unpriced · ${recordedZero} recorded zero</p></div><div><span>Quote profit</span><strong>${escapeHtml(profit)}</strong><p class="muted">${costKnown} of ${priced} line quotes have a cost on every line. Missing cost is not zero.</p></div><div><span>Open tasks</span><strong>${items.reduce((sum, event) => sum + openTaskCount(event), 0)}</strong></div></div>`;
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
    view.innerHTML = `<div class="command-view-shell">${viewHeader('Overview', 'Current sheet', 'Global sheet snapshot. Dates are calendar dates in America/Los_Angeles. A task opens here. View associated event opens one record.')}<div class="command-view-body"><div id="overviewLedger">${overviewLedgerInner()}</div>${dailyOverview()}${summarizeQuotes(events)}<div class="lifecycle-summary top-gap"><div><span>Pipeline</span><strong>${count('pipeline')}</strong></div><div><span>Active</span><strong>${count('active')}</strong></div><div><span>Past</span><strong>${count('past')}</strong></div><div><span>Needs review</span><strong>${count('review')}</strong></div></div>${missingNote}<h3>Priority open tasks</h3><ul>${taskHtml || '<li>No open dated task on the sheet.</li>'}</ul><h3>Confirmed upcoming</h3><ul>${listHtml(confirmed) || '<li>No confirmed upcoming event.</li>'}</ul><h3>Dated inquiries and proposals</h3><ul>${listHtml(tentative) || '<li>No dated inquiry or proposal.</li>'}</ul><p class="muted">Booked and payment-processing events are confirmed. A past date does not complete an event. Unknown outcomes stay in Needs review.</p></div></div>`;
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
    const picture = window.lvptOperatingPictureResult && window.lvptOperatingPictureResult.ok ? window.lvptOperatingPictureResult.data : null;
    const payments = picture && picture.report && Array.isArray(picture.report.payments) ? picture.report.payments : [];
    const deadlines = payments.filter((row) => row && row.eventId && row.role === 'client_receivable' && Number(row.balanceDueCents) > 0).slice(0, 4);
    const vendorDue = payments.filter((row) => row && row.eventId && row.role === 'vendor_expense' && row.settlement && !['ledger_settled', 'not_invoiced', 'refunded'].includes(row.settlement)).slice(0, 3);
    const deadlineHtml = deadlines.map((row) => `<li><button type="button" class="btn small" data-open-event="${escapeHtml(row.eventId)}">${escapeHtml(row.paymentId || 'Invoice')}</button> <span>${escapeHtml(ledgerAmount(row.balanceDueCents))} open · ${escapeHtml(row.dueDate || 'no due date')}</span></li>`).join('');
    const vendorHtml = vendorDue.map((row) => `<li><button type="button" class="btn small" data-open-event="${escapeHtml(row.eventId)}">${escapeHtml(row.paymentId || 'Vendor bill')}</button> <span>${escapeHtml(String(row.settlement || 'open').replaceAll('_', ' '))}</span></li>`).join('');
    const jobs = picture && Array.isArray(picture.jobs) ? picture.jobs : [];
    const sheetJob = jobs.find((job) => job.id === 'financial-sync');
    const heartbeat = jobs.find((job) => job.id === 'sms-heartbeat');
    const freshness = picture
      ? `Sheet ledger last success ${escapeHtml((sheetJob && sheetJob.lastSuccess) || 'not recorded')}. SMS heartbeat ${escapeHtml((heartbeat && heartbeat.status) || 'not verified')}. A stored row is not a heartbeat.`
      : 'Source freshness is waiting on the ledger read. It is not marked connected.';
    return `<div class="lifecycle-summary"><div><span>New and open leads</span><strong>${newLeads}</strong><p class="muted">Sheet stage only. Unanswered mail is not guessed from the event list.</p></div><div><span>Overdue tasks</span><strong>${overdue}</strong></div><div><span>Due today</span><strong>${dueToday}</strong></div><div><span>Undated open tasks</span><strong>${undated}</strong><p class="muted">Undated tasks stay open. They are not completed.</p></div></div><p class="muted">${freshness} Approvals waiting are opened in the review workspace. This page does not count a draft as an approval.</p><h3>Open client balances</h3><ul>${deadlineHtml || '<li>No open client balance was returned.</li>'}</ul><h3>Open vendor bills</h3><ul>${vendorHtml || '<li>No open vendor bill was returned.</li>'}</ul>`;
  }
  function recordedLine(label, value) {
    const text = value == null || value === '' ? 'Not recorded' : value;
    return `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(text)}</strong></div>`;
  }
  function recordSections(event) {
    const setup = event.setup || {};
    const quoteLines = (event.quote || []).map((line) => `<li>${escapeHtml(line.name || line.category || 'Line')} · qty ${escapeHtml(line.quantity)} · price ${escapeHtml(line.unitPrice)} · cost ${line.internalCost == null || line.internalCost === '' ? 'not recorded' : escapeHtml(line.internalCost)}</li>`).join('') || '<li>No quote lines on this event.</li>';
    const compliance = (event.compliance || []).map((item) => `<li>${escapeHtml(item.name || 'Requirement')} · ${escapeHtml(item.status || 'Not recorded')} · ${escapeHtml(item.dueDate || 'No due date')}</li>`).join('') || '<li>No compliance row on this event.</li>';
    const post = event.postEvent || {};
    return `<h3>Discovery and setup</h3><div class="lifecycle-summary">${recordedLine('Planning', setup.planningStage)}${recordedLine('Budget range', setup.budgetRange)}${recordedLine('Venue status', setup.venueStatus)}${recordedLine('Owner', setup.internalOwner)}</div><h3>Quote lines</h3><ul>${quoteLines}</ul><h3>Compliance</h3><ul>${compliance}</ul><h3>Documents</h3><p>${(event.documents || []).length} document rows on this event. File bytes are not opened here.</p><h3>Inbox</h3><p>${(event.emailActivity || []).length} stored mail rows on this event. A stored row is not a full thread.</p><h3>Venue and logistics</h3><div class="lifecycle-summary">${recordedLine('Venue', event.venue)}${recordedLine('City', event.city)}${recordedLine('Setup', setup.setupTime)}${recordedLine('Strike', setup.strikeTime)}</div><h3>Post-event</h3><div class="lifecycle-summary">${recordedLine('Feedback', post.clientFeedback)}${recordedLine('Rebooking', post.rebookingLikelihood)}</div><p class="muted">Task completion, edits, proposal changes, and document writes stay off until a granular write is approved. No save control is on this record.</p><p><button type="button" class="btn small" data-print-record>Print this record</button></p>`;
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
    const taskItems = (event.tasks || []).map((task) => `<li data-task-id="${escapeHtml(task.id)}">${escapeHtml(task.title || 'Untitled task')} · ${escapeHtml(task.dueDate || 'No due date')} · ${escapeHtml(task.status || 'Open')}</li>`).join('') || '<li>No task on this event.</li>';
    const html = `<div class="command-view-shell">${viewHeader('Read-only record', event.eventName || 'Untitled event', 'One event. The sheet is not changed from this page.', '<button type="button" class="btn" data-back-list>Back to list</button>')}<div class="command-view-body"><article class="record-detail" data-record-event="${escapeHtml(event.id)}" data-record-generation="${generation}"><h2>${escapeHtml(event.eventName || 'Untitled event')}</h2><p>${escapeHtml(event.status || 'Status not recorded')} · ${escapeHtml(event.eventDate || 'Date not recorded')} · ${escapeHtml(event.venue || 'Venue not recorded')}</p><h3>Tasks</h3><ul>${taskItems}</ul><h3>Staff</h3><p data-record-staff>${staff}</p><h3>Invoices</h3><div data-record-ledger>${recordLedgerInner(event.id)}</div>${recordSections(event)}</article></div></div>`;
    if (window.lvptRecordGeneration !== generation) return;
    view.innerHTML = html;
    if (typeof renderEditor === 'function') renderEditor();
    if (typeof renderTab === 'function') renderTab();
    bindEventOpeners(view);
    bindLedgerRetry(view);
    view.querySelector('[data-print-record]')?.addEventListener('click', () => window.print());
  }

  function renderPipeline(view) {
    if (snapshotBlocks(view, 'Sales Pipeline', 'Present & Future Opportunities')) return;
    const items = events.filter((event) => isPipeline(event) || laneOf(event).lane === 'review');
    const groups = [
      { label: 'New & Discovery', match: (event) => laneOf(event).stage === 'open' && /^(new lead|needs discovery)$/i.test(laneOf(event).raw) },
      { label: 'Quote & Proposal', match: (event) => laneOf(event).stage === 'open' && /^(quote needed|proposal sent)$/i.test(laneOf(event).raw) },
      { label: 'Invoice, not booked', match: (event) => laneOf(event).stage === 'invoice_sent' || laneOf(event).stage === 'invoice_awaiting_deposit' },
      { label: 'Needs review', match: (event) => laneOf(event).lane === 'review' }
    ];
    const columns = groups.map((group) => {
      const matches = items.filter(group.match);
      return `<section class="pipeline-column"><div class="pipeline-column-head"><h3>${escapeHtml(group.label)}</h3><span class="pipeline-column-count">${matches.length}</span></div><div class="pipeline-cards">${matches.map(pipelineCard).join('') || '<div class="command-empty">None</div>'}</div></section>`;
    }).join('');
    view.innerHTML = `<div class="command-view-shell">${viewHeader('Sales Pipeline','Present & Future Opportunities','Booked events are listed in Active, not in a handoff column. Dates use America/Los_Angeles.')}<div class="command-view-body">${summarizeQuotes(items)}<p><a class="btn small" href="#" data-command-jump="active">Open Active events</a></p><div class="pipeline-board top-gap">${columns}</div></div></div>`;
    view.querySelector('[data-command-jump="active"]')?.addEventListener('click', (clickEvent) => { clickEvent.preventDefault(); setCommandView('active'); });
    bindEventOpeners(view);
  }

  function pipelineCard(event) {
    const proposal = proposalForEvent(event);
    const quote = statusApi().quoteCoverage(event);
    const value = quote.priced ? (quote.linePartial ? `Partial lines ${moneyCents(quote.pricedCents)}` : moneyCents(quote.pricedCents)) : quote.recordedZero ? 'Recorded zero' : quote.targetState === 'recorded' ? `Recorded target ${moneyCents(quote.recordedTargetCents)}` : 'Unpriced';
    const title = String(event.eventName || event.contactName || 'Untitled event').trim();
    const next = String(event.nextAction || '').trim().slice(0, 90) || 'No next action recorded';
    return `<button type="button" class="pipeline-card" data-open-event="${escapeHtml(event.id)}"><strong>${escapeHtml(title)}</strong><p>${escapeHtml(laneOf(event).raw || 'Status not recorded')} · ${dateLabel(event.eventDate)}</p><div class="pipeline-card-meta"><span>${escapeHtml(value)}</span></div><p class="pipeline-card-next">Next: ${escapeHtml(next)}${proposal ? ' · Proposal linked' : ''}</p></button>`;
  }

  function renderPortfolio(view, mode) {
    if (snapshotBlocks(view, mode === 'active' ? 'Present & Future' : 'Past', mode === 'active' ? 'Booked & Active Events' : 'Past Event Archive')) return;
    const items = events.filter(mode === 'active' ? isActive : isArchive).sort((a,b)=>String(b.eventDate||'').localeCompare(String(a.eventDate||'')));
    const title = mode === 'active' ? 'Booked & Active Events' : 'Past Event Archive';
    const copy = mode === 'active' ? 'Confirmed experiences moving through planning, production and event day.' : 'Completed, lost and historical opportunities with their financials, documents, proposals and follow-up history intact.';
    view.innerHTML = `<div class="command-view-shell">${viewHeader(mode === 'active' ? 'Present & Future' : 'Past',''+title,copy)}<div class="command-view-body">${summarizeQuotes(items)}<div class="portfolio-grid top-gap">${items.map(portfolioCard).join('') || '<div class="command-empty">No records in this section.</div>'}</div></div></div>`;
    bindEventOpeners(view);
  }

  function portfolioCard(event) {
    const proposal = proposalForEvent(event);
    const lane = laneOf(event);
    const pastNote = `${lane.past && !lane.completed ? '<p>Past date. The recorded status was not changed to completed.</p>' : ''}${lane.needsOutcomeReview ? '<p>Outcome needs review.</p>' : ''}`;
    const quote = statusApi().quoteCoverage(event);
    const value = quote.priced ? (quote.linePartial ? `Partial lines ${moneyCents(quote.pricedCents)}` : moneyCents(quote.pricedCents)) : quote.recordedZero ? 'Recorded zero' : quote.targetState === 'recorded' ? `Recorded target ${moneyCents(quote.recordedTargetCents)}` : 'Unpriced';
    const collected = event.paymentRecorded ? money(event.payment.amountPaid) : 'Not recorded';
    const title = String(event.eventName || event.contactName || 'Untitled event').trim();
    return `<article class="portfolio-card"><p class="eyebrow small">${escapeHtml(laneOf(event).raw || event.status || 'Status not recorded')}</p><h3>${escapeHtml(title)}</h3><p>${dateLabel(event.eventDate)}<br>${escapeHtml(event.venue || 'Venue TBD')}</p>${pastNote}<div class="portfolio-card-grid"><div><span>Priced quote</span><strong>${escapeHtml(value)}</strong></div><div><span>Ledger collected</span><strong>${escapeHtml(collected)}</strong></div><div><span>Open Items</span><strong>${openTaskCount(event)}</strong></div><div><span>Proposal</span><strong>${proposal ? 'Historical reference' : event.proposalUrl ? 'Linked' : 'Not linked'}</strong></div></div><div class="actions"><button class="btn small primary" data-open-event="${escapeHtml(event.id)}">Open Record</button>${proposal ? `<button class="btn small" data-preview-proposal="${proposal.id}">Preview Proposal</button>` : ''}</div></article>`;
  }

  function explicitProposalUrl(event) {
    const raw = String(event.proposalUrl || '').trim();
    if (!raw || /\s/.test(raw)) return '';
    try {
      const url = new URL(raw);
      if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) return '';
      return url.toString();
    } catch { return ''; }
  }
  function renderProposals(view) {
    if (snapshotBlocks(view, 'Design & Sales Library', 'Proposal Library')) return;
    const linked = events.filter(event => explicitProposalUrl(event)).map(event => ({ id:`event-${event.id}`, client:event.company || 'Recorded client', title:event.eventName || event.id, project:'Authoritative event link', url:explicitProposalUrl(event), status:'Recorded on the event', updated:'', eventId:event.id, tags:['Sheet'], notes:'This link is the proposal URL stored on the event. It was not inferred from the company name.' }));
    const historical = proposals.map(item => ({ ...item, status:'Historical reference, not verified' }));
    const query = proposalQuery.toLowerCase();
    const filtered = historical.filter(item => [item.client,item.title,item.project,item.notes].join(' ').toLowerCase().includes(query));
    view.innerHTML = `<div class="command-view-shell">${viewHeader('Design & Sales Library','Proposal Library','Authoritative links come only from a proposal URL stored on the event. The older six cards are a historical reference and are not marked active.')}<div class="command-view-body"><h3>Recorded on the sheet</h3><div class="proposal-grid">${linked.map(proposalCard).join('') || '<div class="command-empty">No event has a validated proposal link.</div>'}</div><h3>Historical reference, not verified</h3><div class="proposal-toolbar"><input class="input" id="proposalSearch" placeholder="Search the historical reference..." value="${escapeHtml(proposalQuery)}"></div><div class="proposal-grid">${filtered.map(proposalCard).join('')}</div></div></div>`;
    $('#proposalSearch')?.addEventListener('input', event => { proposalQuery = event.target.value; renderProposals(view); $('#proposalSearch')?.focus(); });
    bindProposalOpeners(view);
    bindEventOpeners(view);
  }

  function proposalCard(item) {
    return `<article class="proposal-card"><p class="eyebrow small">${escapeHtml(item.status)}</p><h3>${escapeHtml(item.title)}</h3><p><strong>${escapeHtml(item.client)}</strong><br>${escapeHtml(item.notes)}</p><div class="proposal-tags">${item.tags.map(tag=>`<span>${escapeHtml(tag)}</span>`).join('')}</div><div class="proposal-meta"><div><span>Vercel Project</span><strong>${escapeHtml(item.project)}</strong></div><div><span>Last Updated</span><strong>${dateLabel(item.updated)}</strong></div></div><div class="actions"><button class="btn small primary" data-preview-proposal="${item.id}">Preview</button><a class="btn small" href="${escapeHtml(item.url)}" target="_blank" rel="noopener">Open Live</a>${item.eventId ? `<button class="btn small" data-open-event="${item.eventId}">Event Record</button>` : ''}</div></article>`;
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
    const item=proposals.find(proposal=>proposal.id===id); if(!item) return;
    $('#proposalPreviewTitle').textContent=item.title;
    $('#proposalPreviewMeta').textContent=`${item.client} · ${item.project} · ${item.status}`;
    $('#proposalPreviewOpen').href=item.url;
    $('#proposalPreviewFrame').src=item.url;
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
    const action='';
    const stats=automationState.stats||{};
    view.innerHTML=`<div class="command-view-shell">${viewHeader('Email Intelligence','Client Follow-Up','Open tasks recorded on the sheet. A past event date does not complete a task. Schedule review is off in this preview.',action)}<div class="command-view-body"><p class="muted">Needs attention: ${items.length}. These are recorded tasks, not a generated follow-up list.</p><div class="followup-grid">${items.map(followUpCard).join('')||'<div class="command-empty">No open sheet task is due within seven days.</div>'}</div></div></div>`;
    bindEventOpeners(view);
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
