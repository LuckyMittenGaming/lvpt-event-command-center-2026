(() => {
  try { localStorage.removeItem('lvptAppSyncKey'); } catch (error) { /* storage may be blocked */ }
  try { sessionStorage.removeItem('lvptGmailSyncKey'); } catch (error) { /* storage may be blocked */ }

  let picture = null;
  let pictureError = '';
  let loading = true;

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }

  function money(cents) {
    if (cents === 'Incomplete') return 'Incomplete';
    if (cents === null || cents === undefined || !Number.isFinite(Number(cents))) return 'Unavailable';
    return (Number(cents) / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  }

  function card(label, value, note) {
    return `<div class="metric"><span>${esc(label)}</span><strong>${esc(value)}</strong><div class="sub">${esc(note)}</div></div>`;
  }

  function paint() {
    const grid = document.getElementById('metricsGrid');
    if (grid) {
      if (loading && !picture) {
        grid.innerHTML = card('Sheet ledger', 'Reading…', 'Browser payment totals stay hidden until the sheet answers.');
      } else if (!picture || !picture.report) {
        grid.innerHTML = card('Sheet ledger', 'Unavailable', pictureError || 'The last read failed. Browser estimates are not shown as actuals.');
      } else {
        const report = picture.report.money || {};
        const incomplete = new Set(report.incompleteFields || []);
        const shown = (field, cents) => incomplete.has(field) ? 'Incomplete' : (cents == null ? null : cents);
        const collected = shown('verifiedClientReceipts', report.verifiedClientReceiptGaps ? null : report.verifiedClientReceiptsCents);
        const counts = picture.report.counts || {};
        grid.innerHTML = [
          card('Issued invoices', counts.issuedInvoices ?? '—', `Client payment rows ${counts.clientPaymentRows ?? counts.clientInvoices ?? '—'}. Not invoiced ${counts.notInvoicedRows ?? '—'}. Unknown status ${counts.unknownInvoiceRows ?? '—'}.`),
          card('Ledger-recorded receipts', money(collected), 'Paid in full on the sheet. Not a verified bank receipt. Refunds and Payment Initiated stay out. Any refund leaves profit and contribution unavailable until refund accounting is supported. Incomplete means a conflicting, unidentified, or refund-blocked total.'),
          card('Outstanding', money(shown('openClientExposure', report.openClientExposureCents)), 'Open balances only. A received final is not outstanding.'),
          card('Owner paid', money(shown('ownerPaid', report.ownerPaidCents)), 'Distributions marked Paid. Draws are not operating expenses.'),
          card('Owner planned', money(shown('ownerPlanned', report.ownerPlannedCents)), 'Planned draws are not expenses already paid.'),
          card('Ledger contribution', money(report.verifiedContributionCents), 'Recorded receipts minus recorded paid costs and recorded paid draws. Not bank-verified. Not drawable cash. Unavailable while a planned or unpaid obligation remains.'),
          card('Forecast margin', money(report.forecastMarginCents), report.profitReason || 'Client invoices minus vendor bills, fee/tax ledger rows, and unlinked vendor payouts. Owner draws are not subtracted. Negative margin is preserved.'),
          card('Drawable cash', 'Unavailable', report.drawableCashReason || 'Drawable cash is unavailable from the ledger. Ledger receipt never implies independent bank settlement.')
        ].join('');
      }
    }

    const bar = document.getElementById('attentionBar');
    if (bar) {
      if (!picture || picture.eventRead !== 'read') {
        bar.className = 'attention-bar show';
        bar.innerHTML = '<div><strong>Task list unavailable</strong><p>Browser reminders stay hidden.</p></div>';
      } else {
        const tasks = Array.isArray(picture.tasks) ? picture.tasks : [];
        const conflicts = Array.isArray(picture.taskConflicts) ? picture.taskConflicts : [];
        const first = tasks[0];
        const conflictNote = conflicts.length ? `${conflicts.length} task id${conflicts.length === 1 ? '' : 's'} disagreed and ${conflicts.length === 1 ? 'is' : 'are'} excluded from this count.` : '';
        bar.className = tasks.length || conflicts.length ? 'attention-bar show' : 'attention-bar';
        bar.innerHTML = tasks.length || conflicts.length
          ? `<div><strong>${tasks.length} open sheet task${tasks.length === 1 ? '' : 's'}</strong><p>${tasks.length ? `${esc(first.title)} · ${esc(first.dueDate || 'No due date')}` : 'No open task survived reconciliation.'}${conflictNote ? ` ${esc(conflictNote)}` : ''}</p></div>`
          : '';
      }
    }

    document.querySelectorAll('.portfolio-card').forEach((cardEl) => {
      const button = cardEl.querySelector('[data-open-event]');
      const slot = cardEl.querySelector('.portfolio-card-grid div:nth-child(2) strong');
      const labelEl = cardEl.querySelector('.portfolio-card-grid div:nth-child(2) span');
      if (!button || !slot) return;
      if (!picture || !picture.report) {
        slot.textContent = 'Sheet unavailable';
        return;
      }
      const eventId = button.getAttribute('data-open-event');
      const row = (picture.report.byEvent || []).find((item) => item.eventId === eventId);
      const api = window.LVPTEventFinance;
      if (api && typeof api.plainEnglishPaymentLabel === 'function') {
        const labeled = api.plainEnglishPaymentLabel({
          eventId,
          payments: picture.report.payments || [],
          rollup: row || null
        });
        if (labelEl) labelEl.textContent = 'Payment';
        slot.textContent = labeled.label || (row ? money(row.collectedCents) : 'No sheet invoice');
        return;
      }
      if (labelEl) labelEl.textContent = 'Collected (ledger)';
      slot.textContent = row ? money(row.collectedCents) : 'No sheet invoice';
    });

    const reportGrid = document.querySelector('#generatedReportOutput .generated-report-metrics');
    if (reportGrid && picture && picture.report) {
      const report = picture.report.money;
      const incomplete = new Set(report.incompleteFields || []);
      const labelMoney = (field, cents) => incomplete.has(field) ? 'Incomplete' : money(cents);
      const values = [
        ['Client invoices', labelMoney('clientInvoiceTotal', report.clientInvoiceTotalCents)],
        ['Collected (ledger)', labelMoney('verifiedClientReceipts', report.verifiedClientReceiptGaps ? null : report.verifiedClientReceiptsCents)],
        ['Outstanding', labelMoney('openClientExposure', report.openClientExposureCents)],
        ['Forecast margin', money(report.forecastMarginCents)]
      ];
      const cards = reportGrid.querySelectorAll(':scope > div');
      values.forEach(([label, value], index) => {
        if (cards[index]) cards[index].innerHTML = `<span>${esc(label)}</span><strong>${esc(value)}</strong>`;
      });
    }
    applySheetSurfaces();
  }

  function rollupFor(id) {
    if (!picture || !picture.report) return null;
    return (picture.report.byEvent || []).find((row) => row.eventId === id) || null;
  }

  function explicitEventId() {
    if (!selectedId) return '';
    return events.some((event) => event.id === selectedId) ? selectedId : '';
  }

  function clearEventSurfaces() {
    const panel = document.getElementById('selectedEventTasksPanel');
    if (panel) panel.innerHTML = '';
    const paid = document.querySelector('[data-payment-field="amountPaid"]');
    if (paid) paid.value = '';
    const banner = document.querySelector('[data-sheet-ledger]');
    if (banner) banner.remove();
  }

  function applySheetSurfaces() {
    const generation = window.lvptRecordGeneration || 0;
    const selectedEventId = explicitEventId();
    const visible = document.querySelector('[data-record-event]');
    if (!selectedEventId || (visible && visible.getAttribute('data-record-event') !== selectedEventId) || Number(visible && visible.getAttribute('data-record-generation')) && Number(visible.getAttribute('data-record-generation')) !== generation) {
      if (!selectedEventId || (visible && visible.getAttribute('data-record-event') !== selectedEventId)) clearEventSurfaces();
      return;
    }
    const still = () => explicitEventId() === selectedEventId && (window.lvptRecordGeneration || 0) === generation;
    if (!still()) return;
    const rollup = rollupFor(selectedEventId);
    document.querySelectorAll('[data-payment-field]').forEach((field) => {
      field.readOnly = true;
      field.disabled = true;
    });
    const paid = document.querySelector('[data-payment-field="amountPaid"]');
    const status = document.querySelector('[data-payment-field="status"]');
    if (paid) {
      const nextPaid = !picture || !picture.report ? '' : rollup && rollup.collectedCents != null ? (rollup.collectedCents / 100).toFixed(2) : '';
      if (paid.value !== nextPaid) paid.value = nextPaid;
      paid.placeholder = picture ? 'No sheet invoice' : 'Unavailable';
    }
    if (status && rollup && rollup.outstandingCents === 0 && rollup.collectedCents > 0) status.value = 'Paid In Full';

    document.querySelectorAll('[data-select-event]').forEach((button) => {
      const slot = button.querySelector('.mini-grid span:nth-child(3)');
      const row = rollupFor(button.getAttribute('data-select-event'));
      if (!slot) return;
      const next = !picture || !picture.report ? 'Unavailable' : row ? money(row.collectedCents) : 'No sheet invoice';
      if (slot.textContent !== next) slot.textContent = next;
    });

    const tab = document.getElementById('tabContent');
    if (tab && still()) {
      let banner = tab.querySelector('[data-sheet-ledger]');
      if (!banner) {
        banner = document.createElement('div');
        banner.dataset.sheetLedger = '1';
        banner.className = 'hub-warning';
        tab.prepend(banner);
      }
      const rows = picture && picture.report ? picture.report.payments.filter((row) => row.eventId === selectedEventId && row.role === 'client_receivable') : [];
      const lines = rows.map((row) => `${row.paymentId}: ${money(row.invoiceTotalCents)} ${row.paymentStatus}, balance ${money(row.balanceDueCents)}`).join(' · ');
      const nextBanner = picture && rollup
        ? `Sheet ledger. Collected ${money(rollup.collectedCents)}. Outstanding ${money(rollup.outstandingCents)}. ${lines}`
        : 'Sheet ledger unavailable. Browser amounts in this editor are not current actuals.';
      if (banner.textContent !== nextBanner) banner.textContent = nextBanner;
    }

    const panel = document.getElementById('selectedEventTasksPanel');
    if (panel && still() && picture && picture.eventRead === 'read') {
      const tasks = (picture.tasks || []).filter((task) => task.eventId === selectedEventId);
      const sheetEvent = (picture.events || []).find((event) => event.id === selectedEventId) || {};
      const staff = Array.isArray(sheetEvent.staff) ? sheetEvent.staff : [];
      const deadlines = (picture.report.payments || []).filter((row) => row.eventId === selectedEventId && row.role === 'client_receivable' && row.balanceDueCents > 0);
      const taskHtml = tasks.map((task) => `<article class="quick-task"><div class="quick-task-copy"><h3>${esc(task.title)}</h3><p>${esc(task.owner || 'Unassigned')} · ${esc(task.status || 'Open')} · ${esc(task.dueDate || 'No due date')}</p></div></article>`).join('') || '<div class="empty-state">No open sheet tasks for this event.</div>';
      const staffHtml = staff.length ? staff.map((person) => `${esc(person.role || 'Staff')} ${esc(person.name || '')} ${person.confirmed ? 'confirmed' : 'unconfirmed'}`).join(' · ') : 'No staffing rows on the sheet.';
      const dueHtml = deadlines.length ? deadlines.map((row) => `${esc(row.paymentId)} balance ${money(row.balanceDueCents)} due ${esc(row.dueDate || 'no date')}`).join(' · ') : 'No open client balance on the sheet.';
      const nextPanel = `<div class="panel-head"><div><p class="eyebrow small">Sheet tasks</p><h2>To-Do List</h2><p class="muted compact">${tasks.length} open sheet task${tasks.length === 1 ? '' : 's'}. Completed and cancelled tasks stay off this list.</p></div></div><div class="quick-task-list">${taskHtml}</div><p class="muted">Staffing: ${staffHtml}</p><p class="muted">Payment deadlines: ${dueHtml}</p><p class="muted">Stored Gmail rows for this event: ${Number(sheetEvent.gmailCount) || 0}. A stored row already carries this event id. Unmatched mail is not assigned from this page.</p>`;
      if (panel.innerHTML !== nextPanel) panel.innerHTML = nextPanel;
    }

    let note = document.getElementById('ledgerExceptionNote');
    if (!note && document.getElementById('metricsGrid')) {
      note = document.createElement('section');
      note.id = 'ledgerExceptionNote';
      note.className = 'hub-warning';
      document.getElementById('metricsGrid').after(note);
    }
    if (note) {
      const nextNote = picture && Array.isArray(picture.exceptions)
        ? picture.exceptions.map((row) => `<p><strong>Unresolved exception.</strong> ${esc(row.detail)}</p>`).join('')
        : '';
      const activeView = document.querySelector('#commandNav [data-command-view].active');
      const showExceptions = activeView && activeView.getAttribute('data-command-view') === 'finance';
      note.hidden = !showExceptions;
      if (note.innerHTML !== nextNote) note.innerHTML = nextNote;
    }
  }

  window.updatePaymentField = function () {
    if (typeof toast === 'function') toast('The sheet ledger is the current amount. This browser field is not saved.');
    paint();
  };

  const previous = window.renderMetrics;
  window.renderMetrics = function () {
    if (typeof previous === 'function') previous();
    paint();
  };
  const previousRender = window.render;
  window.render = function () {
    if (typeof previousRender === 'function') previousRender();
    paint();
  };

  let pictureGeneration = 0;
  window.lvptLoadOperatingPicture = function (force) {
    if (force) {
      pictureGeneration += 1;
      window.lvptOperatingPicturePromise = null;
      window.lvptOperatingPictureResult = null;
    }
    const generation = pictureGeneration;
    if (!force && window.lvptOperatingPictureResult && window.lvptOperatingPictureResult.generation === generation) {
      return Promise.resolve(window.lvptOperatingPictureResult);
    }
    if (!force && window.lvptOperatingPicturePromise) return window.lvptOperatingPicturePromise;
    const request = fetch('/api/sync/operating-picture', { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(50000) })
      .then((response) => response.json().then((data) => ({ ok: response.ok, status: response.status, data })).catch(() => ({ ok: false, status: response.status, data: {} })))
      .then((result) => {
        if (generation !== pictureGeneration) return result;
        loading = false;
        if (result.ok && result.data && result.data.ok) {
          picture = result.data;
          pictureError = '';
          window.lvptOperatingPictureResult = { ok: true, status: result.status, data: result.data, generation };
        } else {
          picture = null;
          window.lvptOperatingPicturePromise = null;
          window.lvptOperatingPictureResult = null;
          pictureError = result.status === 401
            ? 'Owner sign-in required. The ledger was not read.'
            : result.status === 0
              ? 'The ledger read timed out. It was not marked disconnected.'
              : ((result.data && (result.data.message || result.data.reason)) || 'The sheet ledger is unavailable.');
        }
        paint();
        if (typeof window.lvptPaintOverviewLedger === 'function') window.lvptPaintOverviewLedger();
        if (typeof window.lvptPaintRecordLedger === 'function') window.lvptPaintRecordLedger();
        return window.lvptOperatingPictureResult || { ok: false, status: result.status, data: result.data, generation };
      })
      .catch(() => {
        if (generation !== pictureGeneration) return { ok: false, status: 0, data: { reason: 'timeout' } };
        loading = false;
        picture = null;
        window.lvptOperatingPicturePromise = null;
        window.lvptOperatingPictureResult = null;
        pictureError = 'The ledger read timed out. It was not marked disconnected.';
        paint();
        if (typeof window.lvptPaintOverviewLedger === 'function') window.lvptPaintOverviewLedger();
        if (typeof window.lvptPaintRecordLedger === 'function') window.lvptPaintRecordLedger();
        return { ok: false, status: 0, data: { reason: 'timeout' }, generation };
      });
    window.lvptOperatingPicturePromise = request;
    return request;
  };
  window.lvptReloadOperatingPicture = function () {
    loading = true;
    return window.lvptLoadOperatingPicture(true);
  };

  const observer = new MutationObserver((records) => {
    const external = records.some((record) => {
      const node = record.target;
      if (!(node instanceof Element)) return true;
      if (node.id === 'metricsGrid' || node.id === 'attentionBar' || node.id === 'selectedEventTasksPanel' || node.id === 'ledgerExceptionNote') return false;
      if (node.closest('#metricsGrid, #attentionBar, #selectedEventTasksPanel, #ledgerExceptionNote, .portfolio-card-grid, .generated-report-metrics')) return false;
      return true;
    });
    if (external) paint();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => window.lvptLoadOperatingPicture());
  else window.lvptLoadOperatingPicture();
})();
