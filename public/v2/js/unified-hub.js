(() => {
  const finance = window.LVPTEventFinance;
  const KEY = 'lvptAppSyncKey';
  const HUB_VIEWS = ['finance', 'communications', 'health'];
  let ledgerCache = null;

  function esc(value) {
    return typeof escapeHtml === 'function' ? escapeHtml(value) : String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }

  function dollars(cents) {
    if (cents === null || cents === undefined || !Number.isFinite(cents)) return 'Unavailable';
    return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  }

  function badge(status) {
    const tone = status === 'LIVE' ? 'green' : status === 'DISABLED' || status === 'NOT CONNECTED' || status === 'STALE' ? 'red' : 'warn';
    return `<span class="badge ${tone}">${esc(status)}</span>`;
  }

  function syncKey() {
    return localStorage.getItem(KEY) || '';
  }

  async function readJson(url, withKey) {
    const headers = {};
    if (withKey && syncKey()) headers['x-lvpt-sync-key'] = syncKey();
    try {
      const response = await fetch(url, { headers, cache: 'no-store', signal: AbortSignal.timeout(12000) });
      const data = await response.json().catch(() => ({}));
      return { ok: response.ok, status: response.status, data };
    } catch (error) {
      return { ok: false, status: 0, data: { message: 'The source did not respond in time.', reason: 'timeout' } };
    }
  }

  function eventName(eventId) {
    const match = (typeof events !== 'undefined' ? events : []).find((event) => event.id === eventId);
    return match ? (match.eventName || match.company || eventId) : eventId || 'Event not on this device';
  }

  function shell(eyebrow, title, copy, body) {
    return `<div class="command-view-shell"><div class="command-view-head"><div><p class="eyebrow">${esc(eyebrow)}</p><h2>${esc(title)}</h2><p>${esc(copy)}</p></div></div><div class="command-view-body">${body}</div></div>`;
  }

  async function loadLedger() {
    if (!syncKey()) return { ok: false, status: 401, data: { message: 'Enter the existing LVPT app sync key. It is the same key already used by Google Sheets sync.' } };
    const result = await readJson('/api/sync/ledger', true);
    if (result.ok) ledgerCache = result.data;
    return result;
  }

  function financeBody(result) {
    if (!result.ok) {
      return `<div class="hub-callout">${esc(result.data.message || 'The full Payments ledger is not connected.')} <p>Status: ${badge('NOT CONNECTED')}</p><label>LVPT app sync key<input class="input" id="hubSyncKey" type="password" autocomplete="off"></label><button class="btn primary" id="hubSaveKey" type="button">Save key and read ledger</button></div>`;
    }
    const data = result.data;
    if (data.paymentSourceStatus !== 'command_center_all_payments') {
      return `<div class="hub-callout"><strong>Every-invoice source is not deployed.</strong><p>The live Apps Script response did not include one row per Payments entry. This screen will not invent totals from the first invoice on an event.</p>${badge('NOT CONNECTED')}</div>`;
    }
    const report = finance.buildLedger({ payments: data.paymentRecords, payouts: data.payouts });
    const cards = [
      ['Distinct payment rows', report.counts.payments],
      ['Client invoices', report.counts.clientInvoices],
      ['Vendor bills', report.counts.vendorBills],
      ['Unclassified, excluded', report.counts.unclassified],
      ['Verified client receipts', dollars(report.money.verifiedClientReceiptsCents)],
      ['Initiated, not settled', dollars(report.money.initiatedNotSettledCents)],
      ['Vendor committed', dollars(report.money.vendorCommittedCents)],
      ['Forecast margin', dollars(report.money.forecastMarginCents)]
    ].map(([label, value]) => `<div><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join('');
    const rows = report.payments.map((row) => `<tr><td>${esc(eventName(row.eventId))}</td><td>${esc(row.invoiceNumber || row.paymentId)}</td><td>${esc(row.role.replaceAll('_', ' '))}</td><td>${esc(row.paymentStatus)}</td><td>${esc(row.settlement.replaceAll('_', ' '))}</td><td>${esc(dollars(row.invoiceTotalCents))}</td><td>${esc(dollars(row.amountPaidCents))}</td><td>${esc(dollars(row.balanceDueCents))}</td></tr>`).join('');
    const payoutRows = report.payouts.map((row) => `<tr><td>${esc(eventName(row.eventId))}</td><td>${esc(row.payee)}</td><td>${esc(row.payoutType)}</td><td>${esc(row.status)}</td><td>${esc(dollars(row.amountCents))}</td><td>${row.duplicatesPayment ? 'Excluded — same amount already in a vendor bill' : 'Separate obligation'}</td></tr>`).join('');
    return `<div class="hub-warning">Read-only Google Sheets ledger. Paid In Full here is not a bank confirmation. Payment Initiated is not money received. Unclassified rows stay out of both revenue and expenses.</div><div class="lifecycle-summary hub-metrics">${cards}</div><div class="hub-table-wrap"><table class="hub-table"><thead><tr><th>Event</th><th>Invoice</th><th>Role</th><th>Ledger status</th><th>Meaning</th><th>Invoice</th><th>Ledger paid</th><th>Balance</th></tr></thead><tbody>${rows || '<tr><td colspan="8">No payment rows returned.</td></tr>'}</tbody></table></div><h3>Event payouts, kept separate</h3><div class="hub-table-wrap"><table class="hub-table"><thead><tr><th>Event</th><th>Payee</th><th>Type</th><th>Status</th><th>Amount</th><th>Treatment</th></tr></thead><tbody>${payoutRows || '<tr><td colspan="6">No payout rows returned.</td></tr>'}</tbody></table></div><p class="muted">Payout source: ${esc(data.payoutSourceStatus)}. ${report.counts.payoutsExcludedAsDuplicateExpense} payout row(s) matched a vendor bill amount and were not added again. Server time ${esc(data.serverTime || 'not provided')}.</p>`;
  }

  function communicationsBody(session) {
    const sessionLabel = session.status === 200 && session.data.auditReady ? 'LIVE' : session.status === 401 ? 'NOT VERIFIED' : session.status === 503 ? 'NOT CONNECTED' : 'PARTIAL';
    return `<div class="hub-split"><section><h3>Approval policy</h3><p>Nothing in this hub sends Gmail or SMS. Owner actions stay Approve, Make Changes, Deny, and Edit Myself inside the existing communications workspace. A copied draft is not a sent message.</p><div class="actions"><a class="btn primary" href="/sms-review/index.html#inboxReviewTitle">Open communications workspace</a><a class="btn" href="/sms-review/index.html#paymentAuditTitle">Open invoice exceptions</a></div><p class="muted">The four-times-daily email approval automation stays disabled until a separate owner test proves recipient, exactly-once send, and queue movement.</p></section><section><h3>Session</h3><p>SMS review keeps its seven-day HttpOnly session. This page does not ask for the device token again and does not store message bodies.</p>${badge(sessionLabel)}<p class="muted">${esc(session.data.reason || (session.data.auditReady ? 'Audit check accepted an empty batch and wrote nothing.' : 'Sign in on the communications workspace to verify today\'s encrypted intake.'))}</p></section></div>`;
  }

  function jobRows(probes) {
    const jobs = [
      { name: 'Safe TaskSync', schedule: 'Hourly', owner: 'LVPT Calendar Command Center · runLVPTSafeTaskSync', ...probes.taskSync },
      { name: 'Morning client review', schedule: '8:00 AM ET', owner: 'Scheduled review · read only for calendar', ...probes.morning },
      { name: 'Evening client review', schedule: '7:00 PM ET', owner: 'Scheduled review · read only for calendar', ...probes.evening },
      { name: 'Morning executive inbox brief', schedule: '8:01 AM ET', owner: 'Scheduled inbox brief', ...probes.brief },
      { name: 'Email approval checks', schedule: '6:00 AM, noon, 7:00 PM, midnight ET', owner: 'Disabled approval automation', disabled: true },
      { name: 'Gmail credentials', schedule: 'On demand from this hub', owner: 'Vercel Gmail routes', ...probes.gmail },
      { name: 'Sheets ledger read', schedule: 'When this page is opened with the sync key', owner: 'Existing Apps Script web app', ...probes.ledger },
      { name: 'SMS staging intake', schedule: 'Android best effort', owner: 'Supabase project LVPT SMS Staging', ...probes.sms }
    ];
    return jobs.map((job) => {
      const status = finance.sourceStatus(job);
      return `<tr><td>${esc(job.name)}</td><td>${esc(job.schedule)}</td><td>${esc(job.owner)}</td><td>${badge(status)}</td><td>${esc(job.detail || '')}</td></tr>`;
    }).join('');
  }

  async function renderFinance(view) {
    view.innerHTML = shell('Event finance', 'Invoice by invoice', 'Each Payments row stays separate. Client receipts, vendor bills, and payouts are not added together.', '<p class="muted">Reading the ledger…</p>');
    const result = await loadLedger();
    view.innerHTML = shell('Event finance', 'Invoice by invoice', 'Each Payments row stays separate. Client receipts, vendor bills, and payouts are not added together.', financeBody(result));
    const button = document.getElementById('hubSaveKey');
    if (button) button.addEventListener('click', () => {
      const value = document.getElementById('hubSyncKey').value.trim();
      if (!value) return;
      localStorage.setItem(KEY, value);
      renderFinance(view);
    });
  }

  async function renderCommunications(view) {
    view.innerHTML = shell('Communications', 'Gmail and approved SMS', 'The existing review workspace remains the place where a thread is opened. This hub only shows whether that session is healthy.', '<p class="muted">Checking the review session…</p>');
    const session = await readJson('/api/sms/staging/audit-health', false);
    view.innerHTML = shell('Communications', 'Gmail and approved SMS', 'The existing review workspace remains the place where a thread is opened. This hub only shows whether that session is healthy.', communicationsBody(session));
  }

  async function renderHealth(view) {
    view.innerHTML = shell('Source health', 'What ran, and what is only claimed', 'A finished job and a fresh source are different. Missing timestamps stay unmarked.', '<p class="muted">Checking sources…</p>');
    const [sync, gmail, sms, automation] = await Promise.all([
      readJson('/api/sync/status', false),
      readJson('/api/gmail/status', false),
      readJson('/api/sms/staging/audit-health', false),
      syncKey() ? readJson('/api/sync/automation', true) : Promise.resolve({ ok: false, data: {} })
    ]);
    const ledger = ledgerCache || (syncKey() ? (await loadLedger()).data : null);
    const lastScan = automation.ok ? automation.data.lastScanAt || '' : '';
    const probes = {
      taskSync: { connected: false, detail: 'Hourly safe writer was baselined on Nov 22. This deployment does not read Calendar triggers and will not replace runLVPTSafeTaskSync.' },
      morning: { connected: Boolean(lastScan), partial: Boolean(automation.ok && !lastScan), lastSuccess: lastScan, staleAfterHours: 36, detail: lastScan ? `Last Apps Script client scan ${lastScan}.` : 'No scan timestamp returned. The 8:00 AM review is not marked successful from this page.' },
      evening: { connected: Boolean(lastScan), partial: Boolean(automation.ok && !lastScan), lastSuccess: lastScan, staleAfterHours: 20, detail: 'Evening review shares the Apps Script scan timestamp when that property exists. ChatGPT evening review last-run is not visible here.' },
      brief: { connected: false, detail: 'Morning executive brief is an external schedule. No last-success timestamp is available in this repository.' },
      gmail: { connected: Boolean(gmail.data && gmail.data.configured), partial: Boolean(gmail.data && gmail.data.configured), detail: gmail.data && gmail.data.configured ? 'Server credentials exist. That is not proof today\'s mailbox was read.' : 'Gmail server credentials are not configured on this deployment.' },
      ledger: { connected: Boolean(ledger && ledger.paymentSourceStatus === 'command_center_all_payments'), partial: Boolean(ledger && ledger.payoutSourceStatus === 'command_center_ledger' && ledger.paymentSourceStatus !== 'command_center_all_payments'), lastSuccess: ledger && ledger.serverTime, staleAfterHours: 6, detail: ledger ? `Payment source ${ledger.paymentSourceStatus}; payout source ${ledger.payoutSourceStatus}.` : 'Ledger not read in this browser session.' },
      sms: { connected: sms.status === 200, partial: sms.status === 401, detail: sms.status === 200 ? 'Empty-batch audit check succeeded and wrote nothing.' : sms.status === 401 ? 'Staging route answered, but this browser has no review session. Today\'s messages are unverified.' : 'SMS staging is not configured or not reachable from this deployment.' }
    };
    const body = `<div class="hub-table-wrap"><table class="hub-table"><thead><tr><th>Job</th><th>Schedule</th><th>Owner</th><th>Status</th><th>Evidence</th></tr></thead><tbody>${jobRows(probes)}</tbody></table></div><p class="muted">Sheets backend: ${esc(sync.data.message || (sync.data.configured ? 'configured' : 'not configured'))}. GoHighLevel is not used to fill SMS gaps. No customer message was sent by this check.</p>`;
    view.innerHTML = shell('Source health', 'What ran, and what is only claimed', 'A finished job and a fresh source are different. Missing timestamps stay unmarked.', body);
  }

  window.lvptRenderUnifiedView = function (view, name) {
    if (name === 'finance') renderFinance(view);
    else if (name === 'communications') renderCommunications(view);
    else renderHealth(view);
  };

  window.lvptPaintOverviewHealth = function () {
    let strip = document.getElementById('hubOverviewStrip');
    if (!strip) {
      strip = document.createElement('section');
      strip.id = 'hubOverviewStrip';
      strip.className = 'hub-overview-strip';
      const anchor = document.getElementById('metricsGrid');
      if (anchor) anchor.before(strip);
    }
    strip.innerHTML = `<div><span>Operations hub</span><strong>Finance, communications, and source health are in the bar above.</strong></div><div><span>Sends</span><strong>Off until you approve a specific message.</strong></div><a class="btn small" href="#" data-command-jump="health">Check source health</a>`;
    strip.querySelector('[data-command-jump]').addEventListener('click', (event) => {
      event.preventDefault();
      const button = document.querySelector('[data-command-view="health"]');
      if (button) button.click();
    });
  };

  if (HUB_VIEWS.includes(localStorage.getItem('lvptCommandCenterView')) && typeof render === 'function') render();
  else window.lvptPaintOverviewHealth();
})();
