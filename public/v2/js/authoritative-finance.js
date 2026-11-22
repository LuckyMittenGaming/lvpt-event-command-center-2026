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
          return card(label, money(row.collectedCents), `Outstanding ${money(row.outstandingCents)}. Invoice ${money(row.invoiceTotalCents)}.`);
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
        const first = tasks[0];
        bar.className = tasks.length ? 'attention-bar show' : 'attention-bar';
        bar.innerHTML = tasks.length
          ? `<div><strong>${tasks.length} open sheet task${tasks.length === 1 ? '' : 's'}</strong><p>${esc(first.title)} · ${esc(first.dueDate || 'No due date')}</p></div>`
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
  }

  const previous = window.renderMetrics;
  window.renderMetrics = function () {
    if (typeof previous === 'function') previous();
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
      return node.id !== 'metricsGrid' && node.id !== 'attentionBar' && !node.closest('.portfolio-card-grid') && !node.closest('.generated-report-metrics');
    });
    if (external) paint();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => window.lvptLoadOperatingPicture());
  else window.lvptLoadOperatingPicture();
})();
