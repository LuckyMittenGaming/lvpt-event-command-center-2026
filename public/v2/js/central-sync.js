(() => {
  const APP_SYNC_KEY_STORAGE = 'lvptAppSyncKey';
  const ACTOR_STORAGE = 'lvptCurrentActor';
  const CLOUD_FILE_LIMIT = 8 * 1024 * 1024;
  let saveTimer = null;
  let cloudSaveInFlight = null;
  let suppressCloudSave = false;

  const centralStatus = {
    checked: false,
    configured: false,
    appKeyConfigured: false,
    connected: false,
    saving: false,
    message: 'Not checked',
    lastSyncedAt: localStorage.getItem('lvptLastCloudSync') || '',
  };
  window.lvptCentralSyncStatus = centralStatus;

  function appSyncKey() {
    return localStorage.getItem(APP_SYNC_KEY_STORAGE) || '';
  }

  function currentActor() {
    return localStorage.getItem(ACTOR_STORAGE) || 'Matt';
  }

  async function centralRequest(url, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (url !== '/api/sync/status') {
      const key = appSyncKey();
      if (key) headers['x-lvpt-sync-key'] = key;
    }
    const response = await fetch(url, { ...options, headers, cache: 'no-store' });
    const data = await response.json().catch(() => ({ message: 'Invalid server response.' }));
    if (!response.ok) throw new Error(data.message || `Request failed (${response.status}).`);
    return data;
  }

  async function checkCentralStatus(showToast = true) {
    try {
      const data = await centralRequest('/api/sync/status');
      centralStatus.checked = true;
      centralStatus.configured = Boolean(data.configured);
      centralStatus.appKeyConfigured = Boolean(data.appKeyConfigured);
      centralStatus.message = data.message || (data.configured ? 'Apps Script backend is ready.' : 'Setup required.');
      if (showToast) toast(data.configured ? 'Central Google backend is configured' : centralStatus.message);
    } catch (error) {
      centralStatus.checked = true;
      centralStatus.configured = false;
      centralStatus.connected = false;
      centralStatus.message = error.message;
      if (showToast) toast(error.message);
    }
    renderSystemStatuses();
    if (activeTab === 'system') renderTab();
    return centralStatus;
  }

  async function pullCloudEvents(showToast = true) {
    if (!appSyncKey()) {
      if (showToast) toast('Enter the LVPT app sync key in the System tab first');
      return false;
    }
    try {
      const data = await centralRequest('/api/sync/events');
      const incoming = Array.isArray(data.events) ? data.events.map(ensureEventShape) : [];
      if (!incoming.length) throw new Error('The central Google Sheet returned no event records.');
      const previousSelection = selectedId;
      suppressCloudSave = true;
      events = incoming;
      selectedId = events.some(event => event.id === previousSelection) ? previousSelection : events[0].id;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
      suppressCloudSave = false;
      centralStatus.connected = true;
      centralStatus.message = `Connected to ${events.length} central event record${events.length === 1 ? '' : 's'}.`;
      centralStatus.lastSyncedAt = new Date().toISOString();
      localStorage.setItem('lvptLastCloudSync', centralStatus.lastSyncedAt);
      render();
      if (showToast) toast(`${events.length} event records loaded from Google Sheets`);
      return true;
    } catch (error) {
      centralStatus.connected = false;
      centralStatus.message = error.message;
      renderSystemStatuses();
      if (activeTab === 'system') renderTab();
      if (showToast) toast(error.message);
      return false;
    }
  }

  async function pushCloudEvents(reason = 'Command Center save', showToast = false) {
    if (!centralStatus.configured || !appSyncKey() || suppressCloudSave) return false;
    if (cloudSaveInFlight) await cloudSaveInFlight.catch(() => {});

    centralStatus.saving = true;
    renderSystemStatuses();
    cloudSaveInFlight = centralRequest('/api/sync/events', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ events, actor: currentActor(), reason }),
    });

    try {
      const data = await cloudSaveInFlight;
      centralStatus.connected = true;
      centralStatus.message = `${data.saved || events.length} event record${(data.saved || events.length) === 1 ? '' : 's'} saved to Google Sheets.`;
      centralStatus.lastSyncedAt = data.serverTime || new Date().toISOString();
      localStorage.setItem('lvptLastCloudSync', centralStatus.lastSyncedAt);
      if (showToast) toast('Google Sheets cloud save complete');
      return true;
    } catch (error) {
      centralStatus.connected = false;
      centralStatus.message = error.message;
      if (showToast) toast(error.message);
      return false;
    } finally {
      centralStatus.saving = false;
      cloudSaveInFlight = null;
      renderSystemStatuses();
      if (activeTab === 'system') renderTab();
    }
  }

  function scheduleCloudSave(reason) {
    if (!centralStatus.configured || !appSyncKey() || suppressCloudSave) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => pushCloudEvents(reason, false), 650);
  }

  const browserSaveEvents = saveEvents;
  saveEvents = function(message = 'Saved') {
    browserSaveEvents(message);
    scheduleCloudSave(message || 'Command Center save');
  };

  const baseRenderSystemStatuses = renderSystemStatuses;
  renderSystemStatuses = function() {
    baseRenderSystemStatuses();
    const docs = $('#documentStatus');
    if (docs && centralStatus.checked) {
      const cloudLabel = centralStatus.saving
        ? 'Google cloud saving…'
        : centralStatus.connected
          ? 'Google cloud synced'
          : centralStatus.configured
            ? 'Google cloud ready'
            : 'Google cloud setup required';
      docs.textContent = `${docs.textContent} · ${cloudLabel}`;
      docs.className = `status-pill ${centralStatus.connected ? '' : 'pending'}`;
    }
  };

  const baseRenderSystemTab = renderSystemTab;
  renderSystemTab = function(event) {
    baseRenderSystemTab(event);
    const firstCard = document.querySelector('.system-grid .integration-card');
    if (firstCard) {
      firstCard.innerHTML = `<h3>Current Storage Mode</h3><p><strong>Event data:</strong> ${centralStatus.configured ? 'Central Google Sheets + local cache' : 'Local browser cache'}<br><strong>Documents:</strong> ${centralStatus.configured ? 'Private Google Drive + local fallback' : 'Browser IndexedDB'}<br><strong>Device sharing:</strong> ${centralStatus.connected ? 'Connected' : centralStatus.configured ? 'Key required / not yet connected' : 'Setup required'}</p><p>${escapeHtml(centralStatus.message)}</p>`;
    }

    const systemGrid = document.querySelector('.system-grid');
    if (!systemGrid) return;
    const card = document.createElement('div');
    card.className = 'integration-card central-sync-card';
    card.innerHTML = `<div class="panel-head compact"><div><h3>Google Sheets Central Sync</h3><p>Shared event records for Matt and Mark.</p></div><span class="badge ${centralStatus.connected ? 'green' : centralStatus.configured ? 'warn' : 'red'}">${centralStatus.saving ? 'Saving' : centralStatus.connected ? 'Connected' : centralStatus.configured ? 'Ready' : 'Setup Required'}</span></div><label>Current User<select class="input" id="centralActor"><option ${currentActor() === 'Matt' ? 'selected' : ''}>Matt</option><option ${currentActor() === 'Mark' ? 'selected' : ''}>Mark</option></select></label><label class="top-gap">LVPT App Sync Key<input class="input" type="password" id="centralSyncKey" value="${escapeHtml(appSyncKey())}" placeholder="Enter the Vercel LVPT_APP_SYNC_KEY" /></label><p class="muted compact top-gap">The key stays on this device. Apps Script credentials remain server-side in Vercel.</p><div class="actions top-gap"><button class="btn small" id="saveCentralKeyBtn">Save Key & Connect</button><button class="btn small" id="pullCentralBtn">Pull Google Data</button><button class="btn small" id="pushCentralBtn">Push Browser Data</button></div><p class="muted compact top-gap">Last cloud sync: ${escapeHtml(centralStatus.lastSyncedAt ? new Date(centralStatus.lastSyncedAt).toLocaleString() : 'Never')}</p>`;
    systemGrid.prepend(card);

    $('#centralActor').addEventListener('change', (input) => {
      localStorage.setItem(ACTOR_STORAGE, input.target.value);
      toast(`Updates will be recorded as ${input.target.value}`);
    });
    $('#saveCentralKeyBtn').addEventListener('click', async () => {
      const key = $('#centralSyncKey').value.trim();
      if (!key) {
        localStorage.removeItem(APP_SYNC_KEY_STORAGE);
        centralStatus.connected = false;
        toast('Central sync key cleared');
        renderTab();
        return;
      }
      localStorage.setItem(APP_SYNC_KEY_STORAGE, key);
      await checkCentralStatus(false);
      await pullCloudEvents(true);
    });
    $('#pullCentralBtn').addEventListener('click', () => pullCloudEvents(true));
    $('#pushCentralBtn').addEventListener('click', () => {
      if (!confirm('Overwrite the central Google Sheet with the event records currently stored in this browser?')) return;
      pushCloudEvents('Manual browser-to-cloud overwrite', true);
    });
  };

  const browserRenderDocumentsTab = renderDocumentsTab;
  renderDocumentsTab = function(event) {
    browserRenderDocumentsTab(event);
    const note = document.querySelector('.storage-note');
    if (note) {
      note.textContent = centralStatus.configured
        ? 'Documents upload to the private LVPT Google Drive event folder when the app sync key is connected. Cloud uploads are limited to 8 MB per file; larger files remain browser-local.'
        : 'Files are currently stored in this browser. Complete the Google Apps Script configuration in the System tab to enable shared Drive storage.';
    }
  };

  const browserHandleDocumentFiles = handleDocumentFiles;
  handleDocumentFiles = async function(fileList) {
    const event = current();
    if (!event || !fileList?.length) return;
    if (!centralStatus.configured || !appSyncKey()) {
      return browserHandleDocumentFiles(fileList);
    }

    const category = $('#docCategory')?.value || 'Miscellaneous';
    const vendor = $('#docVendor')?.value || '';
    const amount = num($('#docAmount')?.value);
    const documentDate = $('#docDate')?.value || '';
    let cloudAdded = 0;
    let localAdded = 0;

    for (const file of Array.from(fileList)) {
      const documentId = id();
      if (file.size > CLOUD_FILE_LIMIT) {
        try {
          await saveDocumentBlob(documentId, file);
          event.documents.push({ id: documentId, name: file.name, type: file.type || 'application/octet-stream', size: file.size, category, vendor, amount, documentDate, uploadedAt: new Date().toISOString(), uploadedBy: currentActor(), storage: 'browser' });
          localAdded++;
          continue;
        } catch (error) {
          toast(`Could not store ${file.name}`);
          continue;
        }
      }

      try {
        const form = new FormData();
        form.append('file', file);
        form.append('documentId', documentId);
        form.append('eventId', event.id);
        form.append('eventName', event.eventName);
        form.append('eventDate', event.eventDate || '');
        form.append('actor', currentActor());
        form.append('category', category);
        form.append('vendor', vendor);
        form.append('amount', String(amount));
        form.append('documentDate', documentDate);
        const data = await centralRequest('/api/sync/documents', { method: 'POST', body: form });
        event.documents.push(data.document);
        cloudAdded++;
      } catch (error) {
        try {
          await saveDocumentBlob(documentId, file);
          event.documents.push({ id: documentId, name: file.name, type: file.type || 'application/octet-stream', size: file.size, category, vendor, amount, documentDate, uploadedAt: new Date().toISOString(), uploadedBy: currentActor(), storage: 'browser', cloudUploadError: error.message });
          localAdded++;
        } catch {
          toast(`Could not upload or store ${file.name}`);
        }
      }
    }

    $('#documentFileInput').value = '';
    if (cloudAdded || localAdded) {
      saveEvents(`${cloudAdded} Drive document${cloudAdded === 1 ? '' : 's'} uploaded${localAdded ? `; ${localAdded} stored on this browser` : ''}`);
      render();
    }
  };

  const browserOpenDocument = openDocument;
  openDocument = async function(docId) {
    const doc = current()?.documents.find(item => item.id === docId);
    if (doc?.driveUrl) {
      window.open(doc.driveUrl, '_blank', 'noopener');
      return;
    }
    return browserOpenDocument(docId);
  };

  const browserDownloadDocument = downloadDocument;
  downloadDocument = async function(docId) {
    const doc = current()?.documents.find(item => item.id === docId);
    if (doc?.downloadUrl || doc?.driveUrl) {
      window.open(doc.downloadUrl || doc.driveUrl, '_blank', 'noopener');
      return;
    }
    return browserDownloadDocument(docId);
  };

  const browserRemoveDocument = removeDocument;
  removeDocument = async function(docId) {
    const event = current();
    const doc = event?.documents.find(item => item.id === docId);
    if (!doc?.driveFileId) return browserRemoveDocument(docId);
    if (!confirm(`Move ${doc.name} to the Google Drive trash?`)) return;
    try {
      await centralRequest('/api/sync/documents', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ driveFileId: doc.driveFileId }),
      });
      event.documents = event.documents.filter(item => item.id !== docId);
      saveEvents('Drive document moved to trash');
      render();
    } catch (error) {
      toast(error.message);
    }
  };

  const style = document.createElement('style');
  style.textContent = `.central-sync-card{grid-column:1/-1;border-color:rgba(34,197,94,.35);background:linear-gradient(135deg,rgba(34,197,94,.08),rgba(0,0,0,.24))}.panel-head.compact{margin-bottom:14px}.panel-head.compact p{margin:5px 0 0;color:var(--muted)}`;
  document.head.appendChild(style);

  checkCentralStatus(false).then(() => {
    if (centralStatus.configured && appSyncKey()) pullCloudEvents(false);
  });
})();
