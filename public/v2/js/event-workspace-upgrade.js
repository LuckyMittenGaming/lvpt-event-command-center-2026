(() => {
  const UPGRADE_VERSION = '2026-08-16-active-booked-filter-v3';
  const METRIC_SCOPE_KEY = 'lvptMetricScope';
  const METRIC_MIGRATION_KEY = 'lvptBookedFinancialMetricMigration';

  if (!localStorage.getItem(METRIC_MIGRATION_KEY)) {
    localStorage.setItem(METRIC_SCOPE_KEY, 'all');
    localStorage.setItem(METRIC_MIGRATION_KEY, UPGRADE_VERSION);
  }

  const styleLink = document.createElement('link');
  styleLink.rel = 'stylesheet';
  styleLink.href = new URL('../event-workspace-upgrade.css?v=' + UPGRADE_VERSION, document.currentScript.src).href;
  document.head.appendChild(styleLink);

  function normalized(value) {
    return String(value || '').trim().toLowerCase().replace(/[\/_-]+/g, ' ').replace(/\s+/g, ' ');
  }

  function financialValue(event) {
    return quoteTotal(event) || num(event.setup?.targetQuote);
  }

  function paymentConfirmsBooking(event) {
    const paymentStatus = normalized(event.payment?.status);
    const amountPaid = num(event.payment?.amountPaid);
    return amountPaid > 0 && (
      paymentStatus.includes('deposit paid') ||
      paymentStatus.includes('paid in full') ||
      paymentStatus.includes('paid by ach') ||
      paymentStatus === 'paid'
    );
  }

  function isBookedRecord(event) {
    const status = normalized(event.status);
    if (status.includes('closed lost')) return false;
    return paymentConfirmsBooking(event) || [
      'deposit paid',
      'booked',
      'pre production',
      'event day',
      'completed',
      'post event follow up',
      'closed won',
    ].some(bookedStatus => status === bookedStatus || status.includes(bookedStatus));
  }

  function isFinishedRecord(event) {
    const status = normalized(event.status);
    const finishedStatus = ['completed', 'post event follow up', 'closed won', 'closed lost']
      .some(value => status === value || status.includes(value));
    const today = new Date().toISOString().slice(0, 10);
    return finishedStatus || Boolean(event.eventDate && event.eventDate < today);
  }

  function normalizeBookedStatuses() {
    events.forEach(event => {
      const status = normalized(event.status);
      if (status.includes('closed lost')) return;
      if (paymentConfirmsBooking(event) && ['new lead', 'needs discovery', 'quote needed', 'proposal sent', 'invoice sent'].includes(status)) {
        event.status = 'Deposit Paid';
      } else if (status.includes('deposit paid') && event.status !== 'Deposit Paid') {
        event.status = 'Deposit Paid';
      } else if (status.includes('pre production') && event.status !== 'Pre-Production') {
        event.status = 'Pre-Production';
      }
    });
  }

  function bookedEvents() {
    return events.filter(isBookedRecord);
  }

  filteredEvents = function() {
    const query = ($('#searchInput')?.value || '').trim().toLowerCase();
    const status = $('#statusFilter')?.value || 'All';
    return events.filter(event => {
      const haystack = [
        event.eventName,
        event.company,
        event.city,
        event.state,
        event.venue,
        event.leadSource,
        event.status,
        event.contactName,
        event.contactEmail,
      ].join(' ').toLowerCase();
      const matchesStatus = status === 'All'
        || (status === 'Booked' ? isBookedRecord(event) && !isFinishedRecord(event) : normalized(event.status) === normalized(status));
      return (!query || haystack.includes(query)) && matchesStatus;
    });
  };

  function syncMetricScopeUi() {
    const mode = localStorage.getItem(METRIC_SCOPE_KEY) || 'all';
    document.querySelectorAll('[data-metric-scope]').forEach(button => {
      button.classList.toggle('active', button.dataset.metricScope === mode);
    });
    const label = document.querySelector('#metricScopeLabel');
    if (label) label.textContent = mode === 'all' ? 'All booked revenue + full active pipeline' : (current()?.eventName || 'No event selected');
  }

  function openTasksFor(event) {
    return (event?.tasks || [])
      .filter(task => normalized(task.status) !== 'complete')
      .sort((a, b) => {
        if (!a.dueDate && !b.dueDate) return String(a.title).localeCompare(String(b.title));
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return a.dueDate.localeCompare(b.dueDate);
      });
  }

  function metricCard(label, value, sub) {
    return `<div class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><div class="sub">${escapeHtml(sub)}</div></div>`;
  }

  renderMetrics = function() {
    normalizeBookedStatuses();
    const scopeMode = localStorage.getItem(METRIC_SCOPE_KEY) || 'all';
    const selected = current();
    const isAll = scopeMode === 'all';
    const booked = bookedEvents();
    const scope = isAll ? booked : (selected ? [selected] : []);
    const revenue = scope.reduce((sum, event) => sum + financialValue(event), 0);
    const collected = scope.reduce((sum, event) => sum + num(event.payment?.amountPaid), 0);
    const costs = scope.reduce((sum, event) => sum + quoteCost(event), 0);
    const outstanding = Math.max(revenue - collected, 0);
    const allTaskScope = isAll ? events : scope;
    const openTasks = allTaskScope.reduce((sum, event) => sum + openTasksFor(event).length, 0);
    const documents = allTaskScope.reduce((sum, event) => sum + (event.documents || []).length, 0);
    const averageSetup = allTaskScope.length
      ? Math.round(allTaskScope.reduce((sum, event) => sum + setupCompleteness(event).percent, 0) / allTaskScope.length)
      : 0;
    const pipelineValue = events
      .filter(event => !isBookedRecord(event) && !['completed', 'closed won', 'closed lost'].includes(normalized(event.status)))
      .reduce((sum, event) => sum + financialValue(event), 0);

    const metrics = isAll ? [
      ['Booked Revenue', money(revenue), 'Won, deposited and completed events'],
      ['Collected Revenue', money(collected), 'Payments actually received'],
      ['Booked Outstanding', money(outstanding), 'Booked revenue less collected'],
      ['Est. Booked Profit', money(revenue - costs), 'Booked revenue less entered costs'],
      ['Active Pipeline', money(pipelineValue), 'Unbooked opportunity value'],
      ['Open Tasks', String(openTasks), 'Across every active record'],
      ['Setup Complete', `${averageSetup}%`, 'Average across all records'],
      ['Booked Events', String(booked.length), 'Includes NIUM and completed wins'],
    ] : [
      ['Event Revenue', money(revenue), selected?.eventName || 'Selected event'],
      ['Collected', money(collected), 'Payments recorded for this event'],
      ['Outstanding', money(outstanding), 'Event revenue less collected'],
      ['Est. Profit', money(revenue - costs), 'Before unentered costs'],
      ['Open Tasks', String(openTasks), 'For the selected event'],
      ['Setup Complete', `${averageSetup}%`, 'Selected event intake'],
      ['Documents', String(documents), 'Invoices, receipts and files'],
      ['Booked', selected && isBookedRecord(selected) ? 'Yes' : 'No', selected?.status || 'No event selected'],
    ];

    $('#metricsGrid').innerHTML = metrics.map(metric => metricCard(...metric)).join('');
  };

  function dueBadge(item) {
    if (!item.dueDate) return '<span class="badge">No due date</span>';
    const days = daysFromToday(item.dueDate);
    const state = days < 0 ? 'red' : days <= 7 ? 'warn' : '';
    const label = days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? 'Due today' : days === 1 ? 'Due tomorrow' : item.dueDate;
    return `<span class="badge ${state}">${escapeHtml(label)}</span>`;
  }

  function taskItem(task) {
    return `<article class="quick-task ${daysFromToday(task.dueDate) < 0 ? 'overdue' : ''}">
      <button type="button" class="quick-task-check" data-complete-task="${escapeHtml(task.id)}" aria-label="Mark ${escapeHtml(task.title)} complete">✓</button>
      <div class="quick-task-copy"><h3>${escapeHtml(task.title)}</h3><p>${escapeHtml(task.owner || 'Unassigned')} · ${escapeHtml(task.priority || 'Medium')} priority · ${escapeHtml(task.status || 'Open')}</p></div>
      ${dueBadge(task)}
    </article>`;
  }

  function complianceItem(item) {
    return `<article class="quick-task compliance-task ${daysFromToday(item.dueDate) < 0 ? 'overdue' : ''}">
      <button type="button" class="quick-task-check" data-complete-compliance="${escapeHtml(item.id)}" aria-label="Mark ${escapeHtml(item.name)} complete">✓</button>
      <div class="quick-task-copy"><h3>${escapeHtml(item.name)}</h3><p>Compliance · ${escapeHtml(item.status || 'Needed')}</p></div>
      ${dueBadge(item)}
    </article>`;
  }

  function ensureWorkspaceLayout() {
    const layout = document.querySelector('.layout-grid');
    const workspace = document.querySelector('.workspace');
    if (!layout || !workspace) return;
    layout.classList.add('event-command-layout');
    workspace.classList.add('event-command-workspace');

    let taskPanel = document.querySelector('#selectedEventTasksPanel');
    if (!taskPanel) {
      taskPanel = document.createElement('section');
      taskPanel.id = 'selectedEventTasksPanel';
      taskPanel.className = 'panel selected-event-tasks';
      workspace.prepend(taskPanel);
    }

    const reportCenter = document.querySelector('#reportCenter');
    const editor = document.querySelector('#eventEditorPanel');
    const tabs = document.querySelector('.tab-panel');
    if (reportCenter) {
      reportCenter.classList.add('workspace-report-center');
      layout.after(reportCenter);
    }
    if (editor) {
      editor.classList.add('workspace-event-editor');
      (reportCenter || layout).after(editor);
      editor.hidden = layout.hidden;
    }
    if (tabs) {
      tabs.id = 'fullEventEditorTabs';
      tabs.classList.add('workspace-editor-tabs');
      (editor || reportCenter || layout).after(tabs);
      tabs.hidden = layout.hidden;
    }
  }

  function renderSelectedTasks() {
    const panel = document.querySelector('#selectedEventTasksPanel');
    const event = current();
    if (!panel) return;
    if (!event) {
      panel.innerHTML = '<div class="empty-state">Select an event to see its action plan.</div>';
      return;
    }

    const tasks = openTasksFor(event);
    const compliance = (event.compliance || [])
      .filter(item => !['complete', 'not needed'].includes(normalized(item.status)))
      .sort((a, b) => String(a.dueDate || '9999').localeCompare(String(b.dueDate || '9999')));
    const total = tasks.length + compliance.length;
    const nextAction = event.nextAction
      ? `<div class="selected-next-action"><span>Current next action</span><strong>${escapeHtml(event.nextAction)}</strong>${event.nextActionDue ? `<small>Due ${escapeHtml(event.nextActionDue)}</small>` : ''}</div>`
      : '';

    panel.innerHTML = `<div class="panel-head selected-task-head"><div><p class="eyebrow small">Selected Event Action Plan</p><h2>To-Do List</h2><p class="muted compact">${escapeHtml(event.eventName)} · ${total} open item${total === 1 ? '' : 's'}</p></div><div class="actions"><button type="button" class="btn small" id="manageTasksBtn">Full Task Editor</button><button type="button" class="btn small primary" id="quickAddTaskBtn">+ Add Task</button></div></div>${nextAction}<div class="quick-task-list">${tasks.map(taskItem).join('')}${compliance.map(complianceItem).join('') || (!tasks.length ? '<div class="empty-state">Everything currently recorded for this event is complete.</div>' : '')}</div>`;

    panel.querySelectorAll('[data-complete-task]').forEach(button => button.addEventListener('click', () => {
      const task = (event.tasks || []).find(item => item.id === button.dataset.completeTask);
      if (!task) return;
      task.status = 'Complete';
      saveEvents('Task marked complete');
      render();
    }));
    panel.querySelectorAll('[data-complete-compliance]').forEach(button => button.addEventListener('click', () => {
      const item = (event.compliance || []).find(record => record.id === button.dataset.completeCompliance);
      if (!item) return;
      item.status = 'Complete';
      saveEvents('Compliance item marked complete');
      render();
    }));
    $('#quickAddTaskBtn')?.addEventListener('click', () => {
      event.tasks.push({ id:id(), title:'New task', owner:event.setup?.internalOwner || 'Matt', dueDate:'', priority:'Medium', status:'Open' });
      activeTab = 'tasks';
      saveEvents('Task added');
      render();
      document.querySelector('#fullEventEditorTabs')?.scrollIntoView({ behavior:'smooth', block:'start' });
    });
    $('#manageTasksBtn')?.addEventListener('click', () => {
      activeTab = 'tasks';
      render();
      document.querySelector('#fullEventEditorTabs')?.scrollIntoView({ behavior:'smooth', block:'start' });
    });
  }

  function correctOverallReport() {
    const context = document.querySelector('#reportContext');
    const output = document.querySelector('#generatedReportOutput');
    if (!context || !output || !/all 2026 events/i.test(context.textContent || '')) return;
    const metricGrid = output.querySelector('.generated-report-metrics');
    if (!metricGrid || metricGrid.dataset.financialVersion === UPGRADE_VERSION) return;
    metricGrid.dataset.financialVersion = UPGRADE_VERSION;
    const booked = bookedEvents();
    const revenue = booked.reduce((sum, event) => sum + financialValue(event), 0);
    const collected = booked.reduce((sum, event) => sum + num(event.payment?.amountPaid), 0);
    const costs = booked.reduce((sum, event) => sum + quoteCost(event), 0);
    const cards = metricGrid.querySelectorAll(':scope > div');
    const corrected = [
      ['Booked Revenue', money(revenue)],
      ['Collected Revenue', money(collected)],
      ['Booked Outstanding', money(Math.max(revenue - collected, 0))],
      ['Est. Booked Profit', money(revenue - costs)],
    ];
    corrected.forEach(([label, value], index) => {
      if (cards[index]) cards[index].innerHTML = `<span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong>`;
    });
    const badge = output.querySelector('.generated-report-badge');
    if (badge) badge.textContent = `${booked.length} Booked Event${booked.length === 1 ? '' : 's'}`;
  }

  if (typeof generateReport === 'function') {
    const baseGenerateReport = generateReport;
    generateReport = function(event, type) {
      const report = baseGenerateReport(event, type);
      if (type !== 'year') return report;
      const booked = bookedEvents();
      const revenue = booked.reduce((sum, record) => sum + financialValue(record), 0);
      const collected = booked.reduce((sum, record) => sum + num(record.payment?.amountPaid), 0);
      const costs = booked.reduce((sum, record) => sum + quoteCost(record), 0);
      return report
        .replace(/Total Event Records:.*\n/, `Booked Event Records: ${booked.length}\n`)
        .replace(/Quoted Revenue:.*\n/, `Booked Revenue: ${money(revenue)}\n`)
        .replace(/Collected Revenue:.*\n/, `Collected Revenue: ${money(collected)}\n`)
        .replace(/Outstanding Balance:.*\n/, `Booked Outstanding: ${money(Math.max(revenue - collected, 0))}\n`)
        .replace(/Estimated Profit:.*\n/, `Estimated Booked Profit: ${money(revenue - costs)}\n`)
        .replace(/Average Event Value:.*\n/, `Average Booked Event Value: ${money(booked.length ? revenue / booked.length : 0)}\n`);
    };
  }

  const baseRender = render;
  render = function() {
    normalizeBookedStatuses();
    baseRender();
    syncMetricScopeUi();
    ensureWorkspaceLayout();
    renderSelectedTasks();
    correctOverallReport();
  };

  const reportObserver = new MutationObserver(() => correctOverallReport());
  const observeReports = () => {
    const output = document.querySelector('#generatedReportOutput');
    if (output) reportObserver.observe(output, { childList:true, subtree:true });
  };

  render();
  observeReports();
})();
