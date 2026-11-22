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
    const sheetEvents = ledgerCache && Array.isArray(ledgerCache.events) ? ledgerCache.events : [];
    const sheet = sheetEvents.find((event) => event.id === eventId);
    if (sheet && (sheet.eventName || sheet.company)) return sheet.eventName || sheet.company;
    const match = (typeof events !== 'undefined' ? events : []).find((event) => event.id === eventId);
    return match ? (match.eventName || match.company || eventId) : eventId || 'Event not on the sheet';
  }

  function shell(eyebrow, title, copy, body) {
    return `<div class="command-view-shell"><div class="command-view-head"><div><p class="eyebrow">${esc(eyebrow)}</p><h2>${esc(title)}</h2><p>${esc(copy)}</p></div></div><div class="command-view-body">${body}</div></div>`;
  }

  async function loadLedger() {
    const result = await readJson('/api/sync/operating-picture', false);
    if (result.ok && result.data && result.data.ok === true) ledgerCache = result.data;
    return result;
  }

  function financeBody(result) {
    if (!result.ok || !result.data || result.data.ok !== true || !result.data.report) {
      return `<div class="hub-callout">${esc((result.data && result.data.message) || 'The sheet ledger is unavailable.')} <p>Status: ${badge('NOT CONNECTED')}</p><p>Browser copies stay off this screen.</p></div>`;
    }
    const data = result.data;
    if (data.paymentSourceStatus !== 'command_center_all_payments') {
      return `<div class="hub-callout"><strong>Every-invoice source is not deployed.</strong><p>The live Apps Script response did not include one row per Payments entry. This screen will not invent totals from the first invoice on an event.</p>${badge('NOT CONNECTED')}</div>`;
    }
    const report = data.report;
    const cards = [
      ['Distinct payment rows', report.counts.payments],
      ['Client invoices', report.counts.clientInvoices],
      ['Vendor bills', report.counts.vendorBills],
      ['Unclassified, excluded', report.counts.unclassified],
      ['Verified client receipts', dollars(report.money.verifiedClientReceiptsCents)],
      ['Initiated, not settled', dollars(report.money.initiatedNotSettledCents)],
      ['Vendor committed', dollars(report.money.vendorCommittedCents)],
      ['Owner paid', dollars(report.money.ownerPaidCents)],
      ['Owner planned', dollars(report.money.ownerPlannedCents)],
      ['Profit', dollars(report.money.forecastMarginCents)]
    ].map(([label, value]) => `<div><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join('');
    const rows = report.payments.map((row) => `<tr><td>${esc(eventName(row.eventId))}</td><td>${esc(row.invoiceNumber || row.paymentId)}</td><td>${esc(row.role.replaceAll('_', ' '))}</td><td>${esc(row.paymentStatus)}</td><td>${esc(row.settlement.replaceAll('_', ' '))}</td><td>${esc(dollars(row.invoiceTotalCents))}</td><td>${esc(dollars(row.amountPaidCents))}</td><td>${esc(dollars(row.balanceDueCents))}</td></tr>`).join('');
    const payoutRows = report.payouts.map((row) => {
      const treatment = row.duplicatesPayment ? 'Excluded — linked to the same payment id' : row.amountOverlap ? 'Same amount, kept as its own record' : row.role === 'owner_distribution' ? (/^paid\b/i.test(row.status) ? 'Paid distribution' : 'Planned, not paid') : 'Separate obligation';
      return `<tr><td>${esc(eventName(row.eventId))}</td><td>${esc(row.payee)}</td><td>${esc(row.payoutType)}</td><td>${esc(row.status)}</td><td>${esc(dollars(row.amountCents))}</td><td>${esc(treatment)}</td></tr>`;
    }).join('');
    return `<div class="hub-warning">Read-only Google Sheets ledger. Paid In Full here is not a bank confirmation. Payment Initiated is not money received. Unclassified rows stay out of both revenue and expenses.</div><div class="lifecycle-summary hub-metrics">${cards}</div><div class="hub-table-wrap"><table class="hub-table"><thead><tr><th>Event</th><th>Invoice</th><th>Role</th><th>Ledger status</th><th>Meaning</th><th>Invoice</th><th>Ledger paid</th><th>Balance</th></tr></thead><tbody>${rows || '<tr><td colspan="8">No payment rows returned.</td></tr>'}</tbody></table></div><h3>Event payouts, kept separate</h3><div class="hub-table-wrap"><table class="hub-table"><thead><tr><th>Event</th><th>Payee</th><th>Type</th><th>Status</th><th>Amount</th><th>Treatment</th></tr></thead><tbody>${payoutRows || '<tr><td colspan="6">No payout rows returned.</td></tr>'}</tbody></table></div><p class="muted">Payout source: ${esc(data.payoutSourceStatus)}. ${report.counts.payoutsExcludedAsDuplicateExpense} payout row(s) share a payment id and were not counted twice. ${report.counts.amountOverlapsNotMerged} same-amount row(s) stayed separate. Server time ${esc(data.serverTime || 'not provided')}.</p>`;
  }

  function communicationsBody(session) {
    const sessionLabel = session.status === 503 ? 'NOT CONNECTED' : 'NOT VERIFIED';
    return `<div class="hub-split"><section><h3>Approval queue</h3><p>The owner queue is Approve, Make Changes, Deny, and Edit Myself. Each send still needs server approval of the exact recipient and the exact message. Automatic sends stay off.</p><div class="actions"><a class="btn primary" href="/sms-review/index.html#inboxReviewTitle">Open communications workspace</a><a class="btn" href="/sms-review/index.html#paymentAuditTitle">Open invoice exceptions</a></div><p class="muted">The four-times-daily email approval automation stays disabled until a separate owner test proves recipient, exactly-once send, and queue movement.</p></section><section><h3>Session</h3><p>SMS review keeps its seven-day HttpOnly session. This page does not ask for the device token again and does not store message bodies.</p>${badge(sessionLabel)}<p class="muted">${esc(session.data.reason || 'An audit response does not mean SMS is synchronized.')}</p></section></div>`;
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
  }

  async function renderCommunications(view) {
    view.innerHTML = shell('Communications', 'Gmail and approved SMS', 'The existing review workspace remains the place where a thread is opened. This hub only shows whether that session is healthy.', '<p class="muted">Checking the review session…</p>');
    const [session, picture] = await Promise.all([
      readJson('/api/sms/staging/audit-health', false),
      loadLedger()
    ]);
    const jobs = picture.ok && picture.data && Array.isArray(picture.data.jobs) ? picture.data.jobs : [];
    const evidence = jobs.filter((job) => /gmail|sms/i.test(job.name)).map((job) => `<tr><td>${esc(job.name)}</td><td>${badge(finance.sourceStatus(job))}</td><td>${esc(job.detail || '')}</td></tr>`).join('');
    const queue = picture.ok && picture.data && Array.isArray(picture.data.gmailQueue) ? picture.data.gmailQueue : [];
    const queueRows = queue.map((item) => `<tr><td>${esc(item.domainKey)}</td><td>${esc(item.lastMessageAt || '')}</td><td>${esc(item.lastDirection || '')}</td><td>Needs review</td><td>${esc(item.subject || '')}</td></tr>`).join('');
    const stored = picture.ok && picture.data ? `${picture.data.gmailActivityCount || 0} Gmail Activity rows are already stored. Threads already on the sheet are skipped. A thread is not assigned to an event from this page.` : 'The sheet did not load, so stored mail counts are hidden.';
    view.innerHTML = shell('Communications', 'Gmail and approved SMS', 'Approve, Make Changes, Deny, and Edit Myself stay in the review workspace. This page does not send.', `${communicationsBody(session)}<div class="hub-table-wrap"><table class="hub-table"><thead><tr><th>Source</th><th>Status</th><th>Evidence</th></tr></thead><tbody>${evidence || '<tr><td colspan="3">Connection evidence did not load.</td></tr>'}</tbody></table></div><h3>Gmail review queue</h3><div class="hub-table-wrap"><table class="hub-table"><thead><tr><th>Domain</th><th>Newest header</th><th>Direction</th><th>Match</th><th>Subject</th></tr></thead><tbody>${queueRows || '<tr><td colspan="5">No new header thread was waiting. Stored threads were left on the sheet.</td></tr>'}</tbody></table></div><p class="muted">${esc(stored)}</p>`);
  }

  async function renderHealth(view) {
    view.innerHTML = shell('Source health', 'What ran, and what is only claimed', 'A finished job and a fresh source are different. Missing timestamps stay unmarked.', '<p class="muted">Checking sources…</p>');
    const picture = await loadLedger();
    const jobs = picture.ok && picture.data && Array.isArray(picture.data.jobs) ? picture.data.jobs : [];
    const namedJobs = jobs.length ? jobs : [
      { name: 'Financial source sync', schedule: 'This page read', owner: 'Command Center sheet', connected: false, detail: (picture.data && picture.data.message) || 'The sheet ledger did not load.' },
      { name: 'Gmail ingestion', schedule: 'Not scheduled here', owner: 'No ingestion cursor', connected: false, detail: 'No mailbox read was recorded.' },
      { name: 'SMS ingestion', schedule: 'Android staging import', owner: 'Encrypted store', connected: false, detail: 'An audit response is not a message sync.' }
    ];
    const body = `<div class="hub-table-wrap"><table class="hub-table"><thead><tr><th>Job</th><th>Status</th><th>Last attempt</th><th>Last success</th><th>Examined</th><th>Created</th><th>Evidence</th></tr></thead><tbody>${namedJobs.map((job) => `<tr><td>${esc(job.name)}</td><td>${badge(finance.sourceStatus(job))}</td><td>${esc(job.lastAttempt || '—')}</td><td>${esc(job.lastSuccess || '—')}</td><td>${esc(job.recordsExamined ?? '—')}</td><td>${esc(job.recordsCreated ?? '—')}</td><td>${esc(job.detail || '')}</td></tr>`).join('')}</tbody></table></div><p class="muted">A job with no readable history stays Not observable. GoHighLevel is not used for SMS. No customer message was sent by this check.</p>`;
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
