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
        const collected = report.verifiedClientReceiptGaps ? null : report.verifiedClientReceiptsCents;
        const named = ['evt-nium-2026', 'evt-neo-reunion-2026', 'evt-lineaje-2026'].map((id) => {
          const row = (picture.report.byEvent || []).find((item) => item.eventId === id);
          const label = id === 'evt-nium-2026' ? 'NIUM' : id === 'evt-neo-reunion-2026' ? 'NEO' : 'Lineaje';
          if (!row) return card(label, 'No sheet invoice', 'No Payments row for this event.');
          const unresolved = (picture.exceptions || []).filter((item) => item.eventId === id && item.includedInTotals === false).map((item) => item.detail).join(' ');
          return card(label, money(row.collectedCents), `Outstanding ${money(row.outstandingCents)}. Invoice ${money(row.invoiceTotalCents)}. ${unresolved}`);
        });
        grid.innerHTML = [
          card('Client invoices', money(report.clientInvoiceTotalCents), 'Every client Payments row on the sheet.'),
          card('Ledger collected', money(collected), 'Paid in full on the sheet. Not bank-verified.'),
          card('Outstanding', money(report.openClientExposureCents), 'Open balances only. A received final is not outstanding.'),
          ...named,
          card('Owner paid', money(report.ownerPaidCents), 'Distributions marked Paid.'),
          card('Owner planned', money(report.ownerPlannedCents), 'Planned draws are not expenses already paid.'),
          card('Profit', money(report.forecastMarginCents), report.profitReason === 'vendor_ledger_incomplete' ? 'Unavailable until vendor bills are a complete ledger.' : 'From the same sheet ledger.')
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
      if (!button || !slot) return;
      if (!picture || !picture.report) {
        slot.textContent = 'Sheet unavailable';
        return;
      }
      const row = (picture.report.byEvent || []).find((item) => item.eventId === button.getAttribute('data-open-event'));
      slot.textContent = row ? money(row.collectedCents) : 'No sheet invoice';
    });

    const reportGrid = document.querySelector('#generatedReportOutput .generated-report-metrics');
    if (reportGrid && picture && picture.report) {
      const report = picture.report.money;
      const values = [
        ['Client invoices', money(report.clientInvoiceTotalCents)],
        ['Ledger collected', money(report.verifiedClientReceiptGaps ? null : report.verifiedClientReceiptsCents)],
        ['Outstanding', money(report.openClientExposureCents)],
        ['Profit', money(report.forecastMarginCents)]
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

  function applySheetSurfaces() {
    const selected = typeof current === 'function' ? current() : null;
    const selectedId = selected && selected.id;
    const rollup = selectedId ? rollupFor(selectedId) : null;
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
    if (tab && selectedId) {
      let banner = tab.querySelector('[data-sheet-ledger]');
      if (!banner) {
        banner = document.createElement('div');
        banner.dataset.sheetLedger = '1';
        banner.className = 'hub-warning';
        tab.prepend(banner);
      }
      const rows = picture && picture.report ? picture.report.payments.filter((row) => row.eventId === selectedId && row.role === 'client_receivable') : [];
      const lines = rows.map((row) => `${row.paymentId}: ${money(row.invoiceTotalCents)} ${row.paymentStatus}, balance ${money(row.balanceDueCents)}`).join(' · ');
      const nextBanner = picture && rollup
        ? `Sheet ledger. Collected ${money(rollup.collectedCents)}. Outstanding ${money(rollup.outstandingCents)}. ${lines}`
        : 'Sheet ledger unavailable. Browser amounts in this editor are not current actuals.';
      if (banner.textContent !== nextBanner) banner.textContent = nextBanner;
    }

    const panel = document.getElementById('selectedEventTasksPanel');
    if (panel && selectedId && picture && picture.eventRead === 'read') {
      const tasks = (picture.tasks || []).filter((task) => task.eventId === selectedId);
      const sheetEvent = (picture.events || []).find((event) => event.id === selectedId) || {};
      const staff = Array.isArray(sheetEvent.staff) ? sheetEvent.staff : [];
      const deadlines = (picture.report.payments || []).filter((row) => row.eventId === selectedId && row.role === 'client_receivable' && row.balanceDueCents > 0);
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

  window.lvptLoadOperatingPicture = function () {
    if (window.lvptOperatingPicturePromise) return window.lvptOperatingPicturePromise;
    window.lvptOperatingPicturePromise = fetch('/api/sync/operating-picture', { cache: 'no-store' })
      .then((response) => response.json().then((data) => ({ ok: response.ok, data })).catch(() => ({ ok: false, data: {} })))
      .then((result) => {
        loading = false;
        if (result.ok && result.data && result.data.ok) {
          picture = result.data;
          pictureError = '';
        } else {
          picture = null;
          pictureError = (result.data && result.data.message) || 'The sheet ledger is unavailable.';
        }
        paint();
        return picture;
      })
      .catch(() => {
        loading = false;
        picture = null;
        pictureError = 'The sheet ledger did not respond.';
        paint();
        return null;
      });
    return window.lvptOperatingPicturePromise;
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
