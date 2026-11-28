(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.LVPTMasterControls = api;
})(typeof window === 'undefined' ? null : window, function () {
  'use strict';

  const STATUS_OPTIONS = [
    'New Lead', 'Needs Discovery', 'Quote Needed', 'Proposal Sent', 'Invoice Sent',
    'Invoice Sent / Awaiting Deposit', 'Deposit Paid', 'Booked', 'Booked - Payment Processing',
    'Pre-Production', 'Event Day', 'Completed', 'Post-Event Follow-Up', 'Closed Won',
    'Closed Lost', 'Outcome Unverified', 'Declined', 'Cancelled'
  ];
  const PAYMENT_OPTIONS = [
    'Not Invoiced', 'Invoice Sent', 'Deposit Paid', 'Payment Initiated',
    'Awaiting owner receipt confirmation', 'Paid In Full', 'Partial', 'Refunded', 'Unknown'
  ];
  const OWNER_OPTIONS = ['Matt', 'Mark', 'Unassigned'];
  const DEAL_STAGE_OPTIONS = [
    { value: 'new_discovery', label: 'New & Discovery' },
    { value: 'quote_proposal', label: 'Quote & Proposal' },
    { value: 'invoiced_not_booked', label: 'Invoiced / Not Booked' },
    { value: 'needs_review', label: 'Needs Review' },
    { value: 'follow_up_due', label: 'Follow-Up Due' }
  ];
  const EXPENSE_CATEGORIES = [
    'Software/SaaS', 'Marketing/Ads', 'Poker Gear/Cards/Chips', 'Travel', 'Legal/Insurance', 'Misc'
  ];
  const FIELD_LABELS = {
    status: 'Status',
    pipelineStage: 'Deal Stage',
    paymentStatus: 'Payment Status',
    owner: 'Owner',
    eventDate: 'Event Date',
    followUpSnoozeUntil: 'Follow-Up Snooze'
  };

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[char]));
  }

  function text(value, max) {
    return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max || 200);
  }

  function formatDiff(field, oldValue, newValue) {
    const label = FIELD_LABELS[field] || field;
    return `${label}: ${text(oldValue) || '(empty)'} → ${text(newValue) || '(empty)'}`;
  }

  function currentValue(event, field) {
    if (!event) return '';
    if (field === 'status') return text(event.status);
    if (field === 'pipelineStage') return text(event.pipelineStage || event.dealStage);
    if (field === 'paymentStatus') return text(event.paymentStatus || (event.payment && event.payment.status));
    if (field === 'owner') return text(event.owner || (event.setup && event.setup.internalOwner) || 'Matt');
    if (field === 'eventDate') return text(event.eventDate, 40);
    if (field === 'followUpSnoozeUntil') return text(event.followUpSnoozeUntil, 40);
    return '';
  }

  function changeHistory(event) {
    const rows = Array.isArray(event && event.changeHistory) ? event.changeHistory : [];
    return rows.slice().reverse();
  }

  function ensureNoteModal() {
    let dialog = document.getElementById('lvptOverrideNoteModal');
    if (dialog) return dialog;
    dialog = document.createElement('dialog');
    dialog.id = 'lvptOverrideNoteModal';
    dialog.className = 'modal lvpt-note-modal';
    dialog.setAttribute('aria-labelledby', 'lvptOverrideNoteTitle');
    dialog.innerHTML = `<form method="dialog" class="modal-card lvpt-note-card">
      <div class="modal-head">
        <div>
          <p class="eyebrow small">Confirm change</p>
          <h2 id="lvptOverrideNoteTitle">Save override</h2>
        </div>
        <button type="submit" class="btn" value="cancel" data-note-cancel>Cancel</button>
      </div>
      <p class="lvpt-note-diff" data-note-diff></p>
      <label class="lvpt-note-label" for="lvptOverrideNoteInput">Add a quick note (optional)</label>
      <input class="input" id="lvptOverrideNoteInput" data-note-input maxlength="500" autocomplete="off" />
      <div class="lvpt-note-actions">
        <button type="submit" class="btn primary" value="save-note" data-note-save>Save with Note</button>
        <button type="submit" class="btn" value="skip-save" data-note-skip>Skip &amp; Save</button>
      </div>
    </form>`;
    document.body.appendChild(dialog);
    return dialog;
  }

  function promptOptionalNote({ diff }) {
    const dialog = ensureNoteModal();
    const diffEl = dialog.querySelector('[data-note-diff]');
    const input = dialog.querySelector('[data-note-input]');
    diffEl.textContent = diff || '';
    input.value = '';
    return new Promise((resolve) => {
      const onClose = () => {
        dialog.removeEventListener('close', onClose);
        const value = dialog.returnValue;
        if (value === 'save-note') resolve({ cancelled: false, note: text(input.value, 500) });
        else if (value === 'skip-save') resolve({ cancelled: false, note: '' });
        else resolve({ cancelled: true, note: '' });
      };
      dialog.addEventListener('close', onClose);
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else {
        dialog.setAttribute('open', '');
      }
      input.focus();
    });
  }

  async function postJson(url, body) {
    const response = await fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await response.json().catch(() => ({ message: 'Invalid server response.' }));
    if (!response.ok) {
      const error = new Error(data.message || `Request failed (${response.status})`);
      error.status = response.status;
      error.body = data;
      throw error;
    }
    return data;
  }

  async function saveEventOverride({ eventId, field, value, note, oldValue, actor }) {
    return postJson('/api/sync/event-override', {
      eventId,
      field,
      value,
      note: note || '',
      oldValue: oldValue || '',
      actor: actor || 'Owner',
      idempotencyKey: `ui-${eventId}-${field}-${value}-${Date.now()}`
    });
  }

  async function saveBusinessExpense(payload) {
    return postJson('/api/sync/business-expense', {
      ...payload,
      idempotencyKey: payload.idempotencyKey || `ui-expense-${Date.now()}`
    });
  }

  async function confirmAndSaveOverride(opts) {
    const diff = formatDiff(opts.field, opts.oldValue, opts.value);
    const decision = await promptOptionalNote({ diff });
    if (decision.cancelled) return { cancelled: true };
    const result = await saveEventOverride({ ...opts, note: decision.note });
    return { cancelled: false, result };
  }

  function applyLocalOverride(event, field, value, note, result) {
    if (!event) return event;
    if (field === 'status') event.status = value;
    if (field === 'pipelineStage') event.pipelineStage = value;
    if (field === 'paymentStatus') {
      event.paymentStatus = value;
      event.payment = event.payment || {};
      event.payment.status = value;
    }
    if (field === 'owner') {
      event.owner = value;
      event.setup = event.setup || {};
      event.setup.internalOwner = value;
    }
    if (field === 'eventDate') event.eventDate = value;
    if (field === 'followUpSnoozeUntil') event.followUpSnoozeUntil = value;
    const history = Array.isArray(event.changeHistory) ? event.changeHistory : [];
    history.push({
      timestamp: (result && result.changeLog && result.changeLog.timestamp) || new Date().toISOString(),
      field,
      old_value: result && result.oldValue,
      new_value: value,
      note: note || '',
      diff: formatDiff(field, result && result.oldValue, value)
    });
    event.changeHistory = history;
    return event;
  }

  function optionsHtml(options, selected) {
    return options.map((option) => {
      const value = typeof option === 'string' ? option : option.value;
      const label = typeof option === 'string' ? option : option.label;
      const isSelected = String(selected) === String(value) ? ' selected' : '';
      return `<option value="${esc(value)}"${isSelected}>${esc(label)}</option>`;
    }).join('');
  }

  function masterControlsBar(event) {
    if (!event || !event.id) return '';
    const status = currentValue(event, 'status');
    const stage = currentValue(event, 'pipelineStage') || 'new_discovery';
    const payment = currentValue(event, 'paymentStatus') || 'Not Invoiced';
    const owner = currentValue(event, 'owner') || 'Matt';
    const eventDate = currentValue(event, 'eventDate');
    const snooze = currentValue(event, 'followUpSnoozeUntil');
    return `<section class="master-controls" data-master-controls data-event-id="${esc(event.id)}">
      <div class="master-controls-head"><strong>Master Controls</strong><span class="muted">Owner override · Change Log audited</span></div>
      <div class="master-controls-grid">
        <label>Event Status<select class="input" data-master-field="status">${optionsHtml(STATUS_OPTIONS, status)}</select></label>
        <label>Deal Stage<select class="input" data-master-field="pipelineStage">${optionsHtml(DEAL_STAGE_OPTIONS, stage)}</select></label>
        <label>Payment Status<select class="input" data-master-field="paymentStatus">${optionsHtml(PAYMENT_OPTIONS, payment)}</select></label>
        <label>Owner<select class="input" data-master-field="owner">${optionsHtml(OWNER_OPTIONS, owner)}</select></label>
        <label>Event Date<input class="input" type="date" data-master-field="eventDate" value="${esc(eventDate)}" /></label>
        <label>Follow-Up Snooze<input class="input" type="date" data-master-field="followUpSnoozeUntil" value="${esc(snooze)}" /></label>
      </div>
      <p class="muted compact">Document uploads, task completion, and bulk sheet writes stay off. No delete control is on this record.</p>
    </section>`;
  }

  function changeHistoryAccordion(event) {
    const rows = changeHistory(event);
    const body = rows.length
      ? `<ul class="change-history-list">${rows.map((row) => {
        const when = esc(row.timestamp || '');
        const diff = esc(row.diff || formatDiff(row.field, row.old_value, row.new_value));
        const note = text(row.note) ? `<span class="muted"> · Note: ${esc(row.note)}</span>` : '';
        return `<li><strong>${when}</strong> — ${diff}${note}</li>`;
      }).join('')}</ul>`
      : '<p class="muted">No Change History rows on this record yet.</p>';
    return `<details class="workspace-accordion" data-workspace-section="change-history" data-event-id="${esc(event && event.id || '')}" open>
      <summary><span class="workspace-summary-title">Change History</span><span class="workspace-count">${rows.length}</span></summary>
      <div class="workspace-accordion-body">${body}</div>
    </details>`;
  }

  function snoozeDate(days) {
    const date = new Date();
    date.setDate(date.getDate() + Number(days || 0));
    return date.toISOString().slice(0, 10);
  }

  function followUpActionsHtml(eventId) {
    return `<div class="followup-quick-actions" data-followup-actions data-event-id="${esc(eventId)}">
      <button type="button" class="btn small" data-followup-action="mark-contacted">Mark Contacted</button>
      <button type="button" class="btn small" data-followup-action="snooze" data-days="7">Snooze 7d</button>
      <button type="button" class="btn small" data-followup-action="snooze" data-days="14">Snooze 14d</button>
      <button type="button" class="btn small" data-followup-action="snooze" data-days="30">Snooze 30d</button>
    </div>`;
  }

  function businessExpenseFormHtml() {
    return `<div class="business-expense-quickadd" data-business-expense-quickadd>
      <button type="button" class="btn small primary" data-open-business-expense>+ Add Business Expense</button>
      <dialog id="lvptBusinessExpenseModal" class="modal lvpt-expense-modal">
        <form method="dialog" class="modal-card" data-business-expense-form>
          <div class="modal-head">
            <div><p class="eyebrow small">Business Overhead</p><h2>Add Business Expense</h2></div>
            <button type="submit" class="btn" value="cancel">Cancel</button>
          </div>
          <div class="master-controls-grid">
            <label>Date<input class="input" type="date" name="date" required /></label>
            <label>Vendor<input class="input" name="vendor" required maxlength="120" /></label>
            <label>Category<select class="input" name="category" required>${optionsHtml(EXPENSE_CATEGORIES, 'Misc')}</select></label>
            <label>Amount<input class="input" name="amount" type="number" min="0" step="0.01" required /></label>
            <label>Payment Method<input class="input" name="paymentMethod" maxlength="80" /></label>
            <label>Receipt URL<input class="input" name="receiptUrl" type="url" maxlength="400" /></label>
            <label data-span="full">Description<input class="input" name="description" maxlength="280" /></label>
            <label data-span="full">Notes<input class="input" name="notes" maxlength="400" /></label>
          </div>
          <div class="lvpt-note-actions">
            <button type="submit" class="btn primary" value="save">Save Expense</button>
          </div>
        </form>
      </dialog>
    </div>`;
  }

  return {
    STATUS_OPTIONS,
    PAYMENT_OPTIONS,
    DEAL_STAGE_OPTIONS,
    EXPENSE_CATEGORIES,
    FIELD_LABELS,
    formatDiff,
    currentValue,
    promptOptionalNote,
    saveEventOverride,
    saveBusinessExpense,
    confirmAndSaveOverride,
    applyLocalOverride,
    masterControlsBar,
    changeHistoryAccordion,
    followUpActionsHtml,
    businessExpenseFormHtml,
    snoozeDate
  };
});
