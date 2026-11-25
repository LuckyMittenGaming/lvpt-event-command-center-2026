(() => {
  const state = { phase: 'loading', events: [], serverTime: '', message: '' };
  let inflight = null;

  function banner() {
    let node = document.getElementById('snapshotBanner');
    if (!node) {
      node = document.createElement('section');
      node.id = 'snapshotBanner';
      node.className = 'hub-warning';
      const hero = document.querySelector('.hero-card');
      if (hero) hero.after(node);
    }
    return node;
  }

  function paintBanner() {
    const node = banner();
    if (!node) return;
    if (state.phase === 'ready') {
      node.hidden = true;
      return;
    }
    node.hidden = false;
    if (state.phase === 'loading') node.textContent = 'Reading the authoritative sheet…';
    else if (state.phase === 'auth-required') node.innerHTML = 'Owner sign-in required. Events, tasks, and messages stay unread until the review session is present. <a class="btn primary" href="/sms-review/index.html">Owner sign-in</a>';
    else if (state.phase === 'empty') node.textContent = 'The sheet returned no events.';
    else node.innerHTML = 'The sheet is unavailable. This is not an empty list and the browser roster is not being shown. <button type="button" class="btn" id="retrySnapshotBannerBtn">Retry</button>';
    node.querySelector('#retrySnapshotBannerBtn')?.addEventListener('click', () => window.lvptReloadSheetSnapshot());
  }

  function apply() {
    window.lvptSheetSnapshot = { state: state.phase, events: state.events, serverTime: state.serverTime, message: state.message };
    if (state.phase === 'ready') {
      events = state.events.map((event) => {
        const date = window.LVPTEventStatus.normalizeEventDate(event.eventDate);
        const supplied = event.setup && Object.prototype.hasOwnProperty.call(event.setup, 'targetQuote') ? event.setup.targetQuote : undefined;
        const shaped = ensureEventShape({ ...event, eventDate: date.iso || '' });
        shaped.targetQuoteSupplied = supplied;
        shaped.eventDateRaw = event.eventDate || '';
        shaped.eventDateTimeZone = 'America/Los_Angeles';
        shaped.statusRaw = event.status || '';
        return shaped;
      });
      if (selectedId && !events.some((event) => event.id === selectedId)) selectedId = '';
    } else {
      events = [];
      selectedId = '';
    }
    paintBanner();
    paintSessionLink();
    if (typeof render === 'function') render();
  }

  function load() {
    if (inflight) return inflight;
    state.phase = 'loading';
    paintBanner();
    inflight = fetch('/api/sync/events', { credentials: 'same-origin', cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (response.status === 401 || response.status === 403) {
          state.phase = 'auth-required';
          state.message = 'Owner sign-in required.';
          state.events = [];
        } else if (!response.ok || data.ok === false || !Array.isArray(data.events)) {
          state.phase = 'unavailable';
          state.message = 'The sheet did not load.';
          state.events = [];
        } else if (!Array.isArray(data.events) || data.events.length === 0) {
          state.phase = 'empty';
          state.events = [];
          state.serverTime = data.serverTime || '';
        } else {
          state.phase = 'ready';
          state.events = data.events;
          state.serverTime = data.serverTime || '';
          state.message = '';
        }
        apply();
        return state.phase === 'ready' || state.phase === 'empty';
      })
      .catch(() => {
        state.phase = 'unavailable';
        state.message = 'The sheet did not respond.';
        state.events = [];
        apply();
        return false;
      })
      .finally(() => { inflight = null; });
    return inflight;
  }

  window.lvptReloadSheetSnapshot = function () {
    inflight = null;
    if (typeof window.lvptClearOwnerReads === 'function') window.lvptClearOwnerReads();
    else if (typeof window.lvptReloadOperatingPicture === 'function') window.lvptReloadOperatingPicture();
    return load();
  };

  function lockEditor() {
    document.querySelectorAll('#eventEditorPanel input, #eventEditorPanel textarea, #eventEditorPanel select, #tabContent input, #tabContent textarea, #tabContent select').forEach((field) => {
      if (field.id === 'searchInput' || field.id === 'statusFilter' || field.id === 'proposalSearch') return;
      field.readOnly = true;
      if (field.tagName === 'SELECT') field.disabled = true;
    });
    ['newEventTopBtn', 'newEventSideBtn', 'resetDataBtn', 'exportCsvBtn', 'exportJsonBtn', 'saveEditorBtn', 'deleteEventBtn', 'duplicateEventBtn', 'reopenWizardBtn'].forEach((id) => {
      const button = document.getElementById(id);
      if (button) {
        button.disabled = true;
        button.hidden = true;
      }
    });
  }

  const previousRender = window.render;
  window.render = function () {
    if (typeof previousRender === 'function') previousRender();
    lockEditor();
    paintBanner();
  };

  const actions = document.querySelector('.hero-actions');
  if (actions && !document.getElementById('refreshSheetBtn')) {
    const refresh = document.createElement('button');
    refresh.type = 'button';
    refresh.className = 'btn';
    refresh.id = 'refreshSheetBtn';
    refresh.textContent = 'Refresh sheet';
    refresh.addEventListener('click', () => window.lvptReloadSheetSnapshot());
    actions.append(refresh);
  }
  function paintSessionLink() {
    const link = document.getElementById('ownerSignInLink');
    if (!link) return;
    if (state.phase === 'ready') link.textContent = 'Review workspace';
    else link.textContent = 'Owner sign-in';
  }

  let sawShow = false;
  window.addEventListener('pageshow', () => {
    if (!sawShow) {
      sawShow = true;
      return;
    }
    inflight = null;
    load();
  });
  load();
})();
