(() => {
  const finance = window.LVPTEventFinance;
  const KEY = 'lvptAppSyncKey';
  const HUB_VIEWS = ['finance', 'communications', 'health', 'action'];
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

  function smsScanBlock(sms, probe) {
    const source = probe && typeof probe === 'object' ? probe : { connected: false, detail: 'SMS scan status was not reported. No message count is shown.' };
    const status = finance.sourceStatus(source);
    const coverage = sms && sms.coverage === 'read-complete' ? 'Read complete' : sms && sms.coverage === 'partial' ? 'Partial' : 'Unavailable';
    const connected = sms && sms.connected === true ? 'Connected' : 'Not connected';
    const counted = !sms
      ? 'Rows were not counted'
      : sms.countComplete
        ? `${sms.storedMessages} stored metadata rows, and that count is complete`
        : sms.storedMessages == null
          ? 'Rows were not counted'
          : `${sms.storedMessages} metadata rows were read. That is not a complete count`;
    const message = sms && sms.newestMessageAt ? sms.newestMessageAt : 'No valid message time';
    const ingest = sms && sms.newestIngestAt ? sms.newestIngestAt : 'No valid import time';
    const among = sms && sms.coverage === 'partial'
      ? `<p>Newest message among rows read: ${esc(sms.newestMessageAmongRead || 'none')}. Newest import among rows read: ${esc(sms.newestIngestAmongRead || 'none')}. Those times are not the latest successful import.</p>`
      : '';
    return `<div class="hub-callout"><strong>SMS metadata scan</strong><p>${badge(status)} Coverage: ${esc(coverage)}. ${esc(connected)}.</p><p>${esc((sms && sms.detail) || source.detail || '')}</p><p>Latest successful import: ${esc(ingest)}. Newest message: ${esc(message)}. ${esc(counted)}.</p>${among}</div>`;
  }

  function gmailScanBlock(header) {
    const source = header && header.probe ? header.probe : header;
    const known = header && header.coverage;
    const status = finance.sourceStatus(known ? {
      connected: header.connected === true,
      partial: header.partial === true,
      lastSuccess: '',
      now: header.checkedAt
    } : { connected: false });
    const coverage = header && header.coverage === 'read-complete' ? 'Read complete' : header && header.coverage === 'partial' ? 'Partial' : 'Unavailable';
    const counted = !known
      ? 'Header threads were not counted'
      : header.countComplete
        ? `${header.headerThreads} header threads, and that count is complete for the requested domains`
        : header.headerThreads == null
          ? 'Header threads were not counted'
          : `${header.headerThreads} header threads were read. That is not a complete count`;
    return `<div class="hub-callout"><strong>Gmail header read</strong><p>${badge(status)} Coverage: ${esc(coverage)}. Metadata only. Full threads were not opened.</p><p>${esc((header && header.detail) || (source && source.detail) || 'The header read did not report coverage. An empty queue is not proof the mailbox is empty.')}</p><p>Newest header: ${esc((header && header.newestHeaderAt) || 'No valid header time')}. Stored sheet date: ${esc((header && header.storedNewestAt) || 'not a valid stored date')}. ${esc(counted)}.</p></div>`;
  }

  function smsScanJob(inbox) {
    if (inbox.ok && inbox.data && inbox.data.ok === true && inbox.data.smsProbe) return inbox.data.smsProbe;
    return {
      name: 'SMS metadata scan',
      connected: false,
      partial: false,
      lastAttempt: '',
      lastSuccess: '',
      recordsExamined: null,
      recordsCreated: 0,
      duplicates: null,
      unmatched: null,
      detail: (inbox.data && (inbox.data.reason || inbox.data.message)) || 'The SMS metadata scan did not load. No count was taken.'
    };
  }

  function syncKey() {
    return localStorage.getItem(KEY) || '';
  }

  async function readJson(url, withKey, timeoutMs = 12000) {
    const headers = {};
    if (withKey && syncKey()) headers['x-lvpt-sync-key'] = syncKey();
    try {
      const response = await fetch(url, { headers, credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) });
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
    const result = await readJson('/api/sync/operating-picture', false, 50000);
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
    const incomplete = new Set(report.money.incompleteFields || []);
    const shown = (field, cents) => incomplete.has(field) ? 'Incomplete' : dollars(cents);
    const cards = [
      ['Payment rows read', report.counts.payments],
      ['Client invoices', report.counts.clientInvoices],
      ['Vendor bills', report.counts.vendorBills],
      ['Unclassified, excluded', report.counts.unclassified],
      ['Verified client receipts', shown('verifiedClientReceipts', report.money.verifiedClientReceiptsCents)],
      ['Initiated, not settled', shown('initiatedNotSettled', report.money.initiatedNotSettledCents)],
      ['Vendor committed', shown('vendorCommitted', report.money.vendorCommittedCents)],
      ['Owner paid', shown('ownerPaid', report.money.ownerPaidCents)],
      ['Owner planned', shown('ownerPlanned', report.money.ownerPlannedCents)],
      ['Ledger contribution', report.money.verifiedContributionCents == null ? 'Unavailable' : dollars(report.money.verifiedContributionCents)],
      ['Forecast margin', report.money.forecastMarginCents == null ? 'Unavailable' : dollars(report.money.forecastMarginCents)],
      ['Drawable cash', 'Unavailable']
    ].map(([label, value]) => `<div><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join('');
    const rows = report.payments.map((row) => {
      const meaning = row.duplicateTreatment === 'duplicate_copy' ? 'Identical copy, counted once' : row.duplicateTreatment === 'conflict_excluded' ? 'Conflicting id, excluded from totals' : row.duplicateTreatment === 'missing_id_excluded' ? 'No stable id, excluded from totals' : row.settlement.replaceAll('_', ' ');
      return `<tr><td>${esc(eventName(row.eventId))}</td><td>${esc(row.invoiceNumber || row.paymentId)}</td><td>${esc(row.role.replaceAll('_', ' '))}</td><td>${esc(row.paymentStatus)}</td><td>${esc(meaning)}</td><td>${esc(dollars(row.invoiceTotalCents))}</td><td>${esc(dollars(row.amountPaidCents))}</td><td>${esc(dollars(row.balanceDueCents))}</td></tr>`;
    }).join('');
    const payoutRows = report.payouts.map((row) => {
      const treatment = row.duplicateTreatment === 'conflict_excluded' ? 'Conflicting payout id, excluded' : row.duplicateTreatment === 'missing_id_excluded' ? 'No stable id, excluded from totals' : row.duplicateTreatment === 'duplicate_copy' ? 'Identical copy, counted once' : row.duplicatesPayment ? 'Excluded — same-event included vendor bill' : row.linkUnresolved ? 'Link does not match an included vendor bill, so the cost stays' : row.amountOverlap ? 'Same amount, kept as its own record' : row.role === 'owner_distribution' ? (/^paid\b/i.test(row.status) ? 'Paid distribution' : 'Planned, not paid') : 'Separate obligation';
      return `<tr><td>${esc(eventName(row.eventId))}</td><td>${esc(row.payee)}</td><td>${esc(row.payoutType)}</td><td>${esc(row.status)}</td><td>${esc(dollars(row.amountCents))}</td><td>${esc(treatment)}</td></tr>`;
    }).join('');
    const duplicateNote = ` Identical payment ids counted once: ${(report.duplicatePaymentIds || []).length}. Conflicting payment ids excluded: ${(report.conflictPaymentIds || []).length}. Identical payout ids counted once: ${(report.duplicatePayoutIds || []).length}. Conflicting payout ids excluded: ${(report.conflictPayoutIds || []).length}. A missing amount stays unavailable.`;
    const incompleteNote = report.money.coverage === 'incomplete' ? ` ${report.money.incompleteReason}` : '';
    const marginNote = report.money.profitReason ? ` ${report.money.profitReason}` : '';
    return `<div class="hub-warning">Read-only Google Sheets ledger. Paid In Full here is not a bank confirmation. Payment Initiated is not money received. Unclassified rows stay out of both revenue and expenses. Client receipts, vendor bills, and owner draws stay in separate totals. Forecast margin does not subtract owner draws. Ledger contribution is not bank-verified and is not drawable cash. ${esc(report.money.drawableCashReason || 'Drawable cash is unavailable.')}${esc(incompleteNote)}${esc(marginNote)}</div><div class="lifecycle-summary hub-metrics">${cards}</div><div class="hub-table-wrap"><table class="hub-table"><thead><tr><th>Event</th><th>Invoice</th><th>Role</th><th>Ledger status</th><th>Meaning</th><th>Invoice</th><th>Ledger paid</th><th>Balance</th></tr></thead><tbody>${rows || '<tr><td colspan="8">No payment rows returned.</td></tr>'}</tbody></table></div><h3>Event payouts, kept separate</h3><div class="hub-table-wrap"><table class="hub-table"><thead><tr><th>Event</th><th>Payee</th><th>Type</th><th>Status</th><th>Amount</th><th>Treatment</th></tr></thead><tbody>${payoutRows || '<tr><td colspan="6">No payout rows returned.</td></tr>'}</tbody></table></div><p class="muted">Payout source: ${esc(data.payoutSourceStatus)}. ${report.counts.payoutsExcludedAsDuplicateExpense} payout row(s) share a payment id and were not counted twice. ${report.counts.amountOverlapsNotMerged} same-amount row(s) stayed separate.${duplicateNote} Server time ${esc(data.serverTime || 'not provided')}.</p>`;
  }

  function communicationsBody(session) {
    const sessionLabel = session.status === 401 || session.status === 503 ? 'NOT CONNECTED' : session.data && session.data.authenticated === true ? 'NOT VERIFIED' : 'NOT CONNECTED';
    return `<div class="hub-split"><section><h3>Approval queue</h3><p>Approve, Make Changes, Deny, and Edit Myself are recorded only in the protected review workspace. That workspace checks the exact recipient. This page does not send and does not record those decisions.</p><div class="actions"><a class="btn primary" href="/sms-review/index.html#inboxReviewTitle">Open the protected approval workspace</a><a class="btn" href="/sms-review/index.html#paymentAuditTitle">Open invoice exceptions</a></div><p class="muted">Exactly-once delivery is enforced on the send route, which stays disabled until a separate owner test. A button on this page is not that proof. The four-times-daily email approval automation stays disabled.</p></section><section><h3>Session</h3><p>SMS review keeps its seven-day HttpOnly session. This page does not ask for the device token again and does not store message bodies.</p>${badge(sessionLabel)}<p class="muted">${esc(session.data.reason || (session.status === 401 ? 'The owner review session is missing or expired. Open the approval workspace to sign in.' : 'An audit response does not mean SMS is synchronized.'))}</p></section></div>`;
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
    const [session, picture, conversations, rcs] = await Promise.all([
      readJson('/api/sms/staging/audit-health', false, 8000),
      readJson('/api/sync/operating-picture', false, 12000),
      readJson('/api/sms/staging/conversations', false, 12000),
      readJson('/api/sms/staging/rcs-collector', false, 8000)
    ]);
    const jobs = picture.ok && picture.data && Array.isArray(picture.data.jobs) ? picture.data.jobs : [];
    const evidence = jobs.filter((job) => /gmail|sms/i.test(job.name)).map((job) => `<tr><td>${esc(job.name)}</td><td>${badge(finance.sourceStatus(job))}</td><td>${esc(job.detail || '')}</td></tr>`).join('');
    const queue = picture.ok && picture.data && Array.isArray(picture.data.gmailQueue) ? picture.data.gmailQueue : [];
    const gmailJob = jobs.find((job) => job.id === 'gmail-production') || null;
    const gmailCoverage = gmailJob && gmailJob.coverage;
    const queueRows = queue.map((item) => `<tr><td>${esc(item.domainKey)}</td><td>${esc(item.lastMessageAt || '')}</td><td>${esc(item.lastDirection || '')}</td><td>Needs review</td><td>${esc(item.subject || '')}</td></tr>`).join('');
    const queueEmpty = !picture.ok
      ? 'Gmail header status did not load. This is not an empty mailbox.'
      : gmailCoverage === 'partial'
        ? 'The header read is partial. A missing row is not an empty mailbox, and this is not a full mailbox scan.'
        : gmailCoverage === 'read-complete'
          ? 'The bounded domain header read finished with no new threads. This is not a full mailbox scan.'
          : 'The header read is unavailable. No header count was taken. This is not an empty mailbox.';
    const stored = picture.ok && picture.data ? `${picture.data.gmailActivityCount || 0} Gmail Activity rows are already stored. Threads already on the sheet are skipped. A thread is not assigned to an event from this page.` : 'The sheet did not load, so stored mail counts are hidden.';
    const threads = conversations.ok && conversations.data && Array.isArray(conversations.data.threads) ? conversations.data.threads : [];
    const rcsData = rcs.ok && rcs.data ? rcs.data : null;
    const rcsRecords = rcsData && Array.isArray(rcsData.records) ? rcsData.records : [];
    const collectorLabel = rcsData && rcsData.collectorLabel ? rcsData.collectorLabel : 'Not paired';
    const collectorBadge = rcsData && rcsData.live === true ? badge('LIVE') : badge(collectorLabel);
    const smsDirection = (item) => item.incoming && item.outgoing ? 'Incoming and outgoing' : item.outgoing ? 'Outgoing' : 'Incoming';
    const smsRows = threads.slice(0, 12).map((item) => `<tr><td>SMS</td><td>${esc(smsDirection(item))}</td><td>${esc(item.newestAt || '')}</td><td>Not reported</td><td>${esc(item.match || 'unmatched')}</td><td>Android bridge</td><td>Not a Google pairing</td><td>Encrypted</td><td>${esc(item.threadKey)}</td></tr>`).join('');
    const rcsTimeline = rcsRecords.map((item) => `<tr><td>RCS</td><td>${esc(item.direction === 'outgoing' ? 'Outgoing' : 'Incoming')}</td><td>${esc(item.messageAt || '')}</td><td>${esc(item.ingestedAt || '')}</td><td>${esc(item.match || 'unmatched')}${item.label === 'TEST' ? ' · TEST' : ''}</td><td>${esc(collectorLabel)}</td><td>${esc(collectorLabel)}</td><td>Read only</td><td>${esc(item.providerId || item.googleMessageId || '')}</td></tr>`).join('');
    const rcsNote = rcsData
      ? `${collectorBadge} Last stored RCS ingestion ${esc(rcsData.lastIngestionAt || 'none')}. Newest RCS message ${esc(rcsData.newestMessageAt || 'none')}. Read only. Sending is off. Mark-read is off. A stored row is not a live collector. ${esc(rcsData.verificationPrerequisite || 'Collector heartbeat was not verified.')} ${rcsRecords.length} Google Messages rows were returned. Existing SMS rows were not rewritten. The staging server validates AES-GCM ciphertext with its storage key. That is not end-to-end encryption.`
      : `Google Messages collector status did not load (${esc((rcs.data && rcs.data.reason) || 'unavailable')}).`;
    const smsNote = conversations.ok
      ? `${conversations.data.storedMessages || 0} stored SMS metadata rows. Message text stays encrypted. Exact matches use the event contact phone. Ambiguous and unmatched threads stay in review. Outgoing SMS is disabled.`
      : `SMS conversations did not load (${esc((conversations.data && conversations.data.reason) || 'unavailable')}). Ciphertext was not shown.`;
    const heartbeatJob = jobs.find((job) => job.id === 'sms-heartbeat') || null;
    const heartbeatStatus = heartbeatJob ? finance.sourceStatus(heartbeatJob) : 'NOT VERIFIED';
    view.innerHTML = shell('Communications', 'Gmail and approved SMS', 'Approve, Make Changes, Deny, and Edit Myself stay in the review workspace. This page does not send.', `${communicationsBody(session)}<div class="hub-table-wrap"><table class="hub-table"><thead><tr><th>Source</th><th>Status</th><th>Evidence</th></tr></thead><tbody>${evidence || '<tr><td colspan="3">Connection evidence did not load.</td></tr>'}</tbody></table></div><h3>Gmail review queue</h3><div class="hub-table-wrap"><table class="hub-table"><thead><tr><th>Domain</th><th>Newest header</th><th>Direction</th><th>Match</th><th>Subject</th></tr></thead><tbody>${queueRows || `<tr><td colspan="5">${esc(queueEmpty)}</td></tr>`}</tbody></table></div><p class="muted">${gmailJob ? badge(finance.sourceStatus(gmailJob)) : badge('NOT CONNECTED')} Bounded header coverage: ${esc(gmailCoverage || 'unavailable')}. Metadata only. Full threads were not opened.</p><p class="muted">${esc(stored)}</p><h3>SMS and RCS timeline</h3><div class="hub-table-wrap" style="max-width:100%;overflow-x:auto"><table class="hub-table"><thead><tr><th>Source</th><th>Direction</th><th>Message time</th><th>Ingested</th><th>Match</th><th>Sync</th><th>Pairing</th><th>Access</th><th>Provider ID</th></tr></thead><tbody>${rcsTimeline}${smsRows}${(smsRows || rcsTimeline) ? '' : '<tr><td colspan="9">No SMS or RCS conversation metadata was returned.</td></tr>'}</tbody></table></div><p class="muted">${smsNote}</p><h3>Google Messages collector</h3><p class="muted">${rcsNote}</p><h3>Android heartbeat</h3><p>${badge(heartbeatStatus)} ${esc((heartbeatJob && heartbeatJob.detail) || 'No phone heartbeat is stored. A stored SMS row cannot certify that the approved handset is collecting. Local verification requires the owner to run the LVPT SMS bridge on the approved handset and confirm a bridge status whose last_success_at is current. This server does not read that report.')}</p><p class="muted">Sending stays off.</p>`);
  }

  async function renderHealth(view) {
    view.innerHTML = shell('Source health', 'What ran, and what is only claimed', 'A finished job and a fresh source are different. Missing timestamps stay unmarked.', '<p class="muted">Checking sources…</p>');
    const [picture, inbox] = await Promise.all([
      loadLedger(),
      readJson('/api/sync/action-inbox', false, 55000)
    ]);
    const jobs = picture.ok && picture.data && Array.isArray(picture.data.jobs) ? picture.data.jobs : [];
    const namedJobs = jobs.length ? jobs : [
      { name: 'Financial source sync', schedule: 'This page read', owner: 'Command Center sheet', connected: false, detail: (picture.data && picture.data.message) || 'The sheet ledger did not load.' },
      { name: 'Gmail ingestion', schedule: 'Not scheduled here', owner: 'No ingestion cursor', connected: false, detail: 'No mailbox read was recorded.' },
      { name: 'SMS ingestion', schedule: 'Android staging import', owner: 'Encrypted store', connected: false, detail: 'An audit response is not a message sync.' }
    ];
    const scan = smsScanJob(inbox);
    const gmailHeader = inbox.ok && inbox.data && inbox.data.sources ? inbox.data.sources.gmailHeader : null;
    const gmailJob = inbox.ok && inbox.data && inbox.data.gmailProbe
      ? inbox.data.gmailProbe
      : { name: 'Gmail header metadata', connected: false, lastSuccess: '', recordsExamined: null, recordsCreated: 0, detail: 'The Gmail header read did not load. No header count was taken.' };
    const listed = namedJobs.concat([scan, gmailJob]);
    const sms = inbox.ok && inbox.data && inbox.data.sources ? inbox.data.sources.sms : null;
    const body = `${smsScanBlock(sms, scan)}${gmailScanBlock(gmailHeader)}<div class="hub-table-wrap"><table class="hub-table"><thead><tr><th>Job</th><th>Status</th><th>Last attempt</th><th>Last success</th><th>Examined</th><th>Created</th><th>Duplicates</th><th>Review</th><th>Evidence</th></tr></thead><tbody>${listed.map((job) => `<tr><td>${esc(job.name)}</td><td>${badge(finance.sourceStatus(job))}</td><td>${esc(job.lastAttempt || '—')}</td><td>${esc(job.lastSuccess || '—')}</td><td>${esc(job.recordsExamined ?? '—')}</td><td>${esc(job.recordsCreated ?? '—')}</td><td>${esc(job.duplicates ?? '—')}</td><td>${esc(job.unmatched ?? '—')}</td><td>${esc(job.detail || '')}</td></tr>`).join('')}</tbody></table></div><p class="muted">A historical import is not a current ingestion. A database response is not a phone upload. A stored row is not a device heartbeat. A partial metadata scan is not a complete import. A Gmail header is not a full thread. A job with no readable history stays Not observable. No customer message was sent by this check.</p>`;
    view.innerHTML = shell('Source health', 'What ran, and what is only claimed', 'A finished job and a fresh source are different. Missing timestamps stay unmarked.', body);
  }

  const ACTION_LABELS = {
    new_inquiry: 'New inquiry',
    awaiting_response: 'Awaiting response',
    new_activity: 'New activity',
    follow_up_due: 'Follow-up due',
    unassigned: 'Unassigned',
    booked: 'Booked',
    invoice_sent: 'Invoice sent, not booked',
    declined: 'Declined',
    cancelled: 'Cancelled',
    unknown_closure: 'Closure unknown',
    resolved: 'Completed',
    unknown: 'Stage unknown',
    vendor: 'Vendor, not a sales lead'
  };

  function moneyCents(cents) {
    if (cents == null || !Number.isFinite(cents)) return 'Not recorded';
    return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  }

  function field(value) {
    return value == null || value === '' ? 'Not recorded' : value;
  }

  function renderAction(view) {
    view.innerHTML = shell('New leads and action required', 'One inbox', 'Gmail, approved SMS, events, and follow-ups. A draft is not a sent message.', '<p class="muted">Reading the sheet, mailbox headers, and SMS metadata…</p>');
    readJson('/api/sync/action-inbox', false, 55000).then((result) => {
      if (!result.ok || !result.data || result.data.ok !== true) {
        view.innerHTML = shell('New leads and action required', 'One inbox', 'Gmail, approved SMS, events, and follow-ups.', `<p class="hub-callout">${esc((result.data && result.data.reason) || 'The inbox did not load.')}</p>`);
        return;
      }
      const data = result.data;
      const sources = data.sources || {};
      const gmail = data.gmail || {};
      const records = Array.isArray(data.records) ? data.records : [];
      const counts = data.counts || {};
      const filters = [
        ['action', 'Action required'],
        ['review', 'Needs review'],
        ['resolved', 'Resolved'],
        ['vendor', 'Vendor'],
        ['all', 'All']
      ];
      const pipe = data.pipeline || {};
      const stages = pipe.stages || {};
      const acquired = pipe.sources || {};
      const excluded = pipe.excluded || {};
      const conversion = pipe.conversion;
      const proposalLinks = Array.isArray(pipe.proposalLinks) ? pipe.proposalLinks : [];
      const eventConflicts = Array.isArray(excluded.eventConflicts) ? excluded.eventConflicts.length : 0;
      const countedOnce = Array.isArray(pipe.duplicateEventsCountedOnce) ? pipe.duplicateEventsCountedOnce.length : 0;
      const taskConflicts = Array.isArray(pipe.taskConflicts) ? pipe.taskConflicts.length : 0;
      const pipeline = `<section class="hub-callout"><h3>Lead pipeline</h3><p>Denominator: ${esc(pipe.denominator == null ? 'not counted' : pipe.denominator)} events with one stable id. Unknown stages stay in the list and are not booked. Conflicting event ids are left out of the denominator.</p><p>Stages: open ${esc(stages.open || 0)}, booked ${esc(stages.booked || 0)}, invoice sent ${esc(stages.invoiceSent || 0)}, declined ${esc(stages.declined || 0)}, cancelled ${esc(stages.cancelled || 0)}, completed ${esc(stages.completed || 0)}, closed won ${esc(stages.closedWon || 0)}, closure unknown ${esc(stages.unknownClosure || 0)}, unknown ${esc(stages.unknown || 0)}.</p><p>Acquisition: organic ${esc(acquired.organic || 0)}, referral ${esc(acquired.referral || 0)}, form ${esc(acquired.form || 0)}, UTM ${esc(acquired.utm || 0)}, other recorded ${esc(acquired.recorded || 0)}, unknown ${esc(acquired.unknown || 0)}. A Gmail or SMS row is a channel, not an acquisition source.</p><p>Outside the prospect list: vendor ${esc(excluded.vendor || 0)}, unassigned ${esc(excluded.unassigned || 0)}, ambiguous links ${esc(excluded.ambiguous || 0)}. Conflicting event ids excluded: ${esc(eventConflicts)}. Identical event ids counted once: ${esc(countedOnce)}.</p><p>Qualification gaps: ${esc(pipe.qualificationGaps || 0)}. Due today: ${esc(pipe.dueFollowUps || 0)}. Overdue: ${esc(pipe.overdueFollowUps || 0)}. A due date of today is not overdue. Conflicting task ids excluded: ${esc(taskConflicts)}.</p><p>${conversion ? esc(`${conversion.numerator} explicit booked / ${conversion.denominator} events. ${conversion.label}`) : 'No conversion rate. There is no event denominator.'}</p>${proposalLinks.length ? `<ul>${proposalLinks.map((link) => `<li><a href="${esc(link.url)}">${esc(link.eventId)}</a></li>`).join('')}</ul>` : '<p>No validated proposal link was supplied.</p>'}</section>`;
      const summary = `<div class="lifecycle-summary hub-metrics"><div><span>Action required</span><strong>${esc(counts.actionRequired || 0)}</strong></div><div><span>Needs review</span><strong>${esc(counts.review || 0)}</strong></div><div><span>Recorded email, not verified</span><strong>${esc(counts.recordedRecipientUnverified || 0)}</strong></div><div><span>Vendor, excluded from leads</span><strong>${esc(counts.vendorExcluded || 0)}</strong></div></div>${pipeline}`;
      const freshness = `<p><a class="btn primary" href="/sms-review/index.html#inboxReviewTitle">Open the protected approval workspace</a></p><p class="muted">Approve, Make Changes, Deny, and Edit Myself there. Buttons on this page do not record a decision, do not prove the recipient, and do not send exactly once.</p><p class="muted">Sheet events ${esc(sources.events ?? 'not counted')}. RCS metadata rows returned ${esc(sources.rcsMessages ?? 'not counted')}, newest RCS message ${esc(sources.newestRcs || 'none')}. RCS is not merged into SMS. A stored RCS message time is not a collector heartbeat. Message text was not included in this list.</p>${smsScanBlock(sources.sms, data.smsProbe)}${gmailScanBlock(sources.gmailHeader)}<div class="hub-callout"><strong>Gmail production writes are off.</strong><p>${esc(gmail.blocker || '')}</p><p>Historical Gmail rows in this read: ${esc(gmail.historicalRowsPreserved ?? 'not counted')}. Unattended staging execution: ${esc(gmail.stagingUnattended || 'not observable')}.</p></div>`;
      const cards = records.map((record, index) => {
        const info = record.qualification || {};
        const timeline = (record.timeline || []).map((item) => `<li><span>${esc(item.at || 'Time not recorded')}</span> ${esc(item.source)} ${esc(item.direction || '')} ${item.contentAvailable ? esc(item.summary) : 'Message text is not in this list. Open the authorized review only when a session can decrypt or read it.'}</li>`).join('');
        const draft = record.draft || {};
        return `<article class="action-card" data-bucket="${esc(record.bucket)}" data-review="${record.review ? 'yes' : 'no'}" data-vendor="${record.vendor ? 'yes' : 'no'}"><header><span class="badge warn">${esc(ACTION_LABELS[record.bucket] || record.bucket)}</span><span>${esc(record.source)}</span></header><h3>${esc(field(record.contact))}${record.company ? ` · ${esc(record.company)}` : ''}</h3><p>${esc(record.eventName || 'No event assigned')} · Last activity ${esc(field(record.lastActivity))}</p><p><strong>Next action:</strong> ${esc(field(record.nextAction))}</p><dl class="action-fields"><div><dt>Email</dt><dd>${esc(field(info.email))}</dd></div><div><dt>Phone</dt><dd>${esc(field(info.phone))}</dd></div><div><dt>Date</dt><dd>${esc(field(info.eventDate))}</dd></div><div><dt>Guests</dt><dd>${esc(field(info.guestCount))}</dd></div><div><dt>Type</dt><dd>${esc(field(info.eventType))}</dd></div><div><dt>Budget</dt><dd>${esc(field(info.budget))}</dd></div><div><dt>Venue</dt><dd>${esc(field(info.venue))}</dd></div><div><dt>Acquisition</dt><dd>${esc(record.acquisitionLabel || 'Unknown')}</dd></div><div><dt>Channel</dt><dd>${esc(record.channel || 'unknown')}</dd></div><div><dt>Value</dt><dd>${esc(moneyCents(info.estimatedValueCents))}</dd></div><div><dt>Stage</dt><dd>${esc(field(info.stage))}</dd></div></dl><p class="muted">${info.missing && info.missing.length ? `Not recorded: ${esc(info.missing.join(', '))}.` : 'The recorded qualification fields are present.'}</p><details><summary>Conversation timeline</summary><ul class="action-timeline">${timeline || '<li>No message metadata is stored on this record.</li>'}</ul></details><details><summary>Draft preview, not an approval</summary><p>Recorded recipient: ${esc(draft.recipient || 'None')}. Not verified. Not ready to approve or send.</p><textarea readonly rows="8">${esc(draft.body || '')}</textarea><p><a class="btn primary" href="/sms-review/index.html#inboxReviewTitle">Open the protected approval workspace</a></p></details></article>`;
      }).join('');
      const empty = sources.sms && sources.sms.coverage === 'read-complete'
        ? 'No lead or follow-up records were returned.'
        : 'No records are listed. This is not proof that the inbox is empty.';
      view.innerHTML = shell('New leads and action required', 'One inbox', 'Gmail, approved SMS, events, and follow-ups. A draft is not a sent message.', `${summary}<div class="review-actions action-filters">${filters.map(([id, label]) => `<button type="button" data-action-filter="${id}">${label}</button>`).join('')}</div>${freshness}<div class="action-list">${cards || `<p>${empty}</p>`}</div>`);
      const applyFilter = (name) => {
        view.querySelectorAll('.action-card').forEach((card) => {
          const bucket = card.getAttribute('data-bucket');
          const show = name === 'all'
            || (name === 'review' && card.getAttribute('data-review') === 'yes')
            || (name === 'vendor' && card.getAttribute('data-vendor') === 'yes')
            || (name === 'resolved' && bucket === 'resolved')
            || (name === 'action' && !['resolved', 'declined', 'cancelled', 'unknown_closure'].includes(bucket) && card.getAttribute('data-vendor') !== 'yes');
          card.hidden = !show;
        });
      };
      applyFilter('action');
      view.querySelectorAll('[data-action-filter]').forEach((button) => {
        button.addEventListener('click', () => applyFilter(button.getAttribute('data-action-filter')));
      });
    });
  }

  window.lvptRenderUnifiedView = function (view, name) {
    if (name === 'finance') renderFinance(view);
    else if (name === 'communications') renderCommunications(view);
    else if (name === 'action') renderAction(view);
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
    strip.innerHTML = `<div><span>Operations hub</span><strong>Finance, communications, and source health use the same status labels. A stored row is not a heartbeat.</strong></div><div><span>Sends</span><strong>Off until you approve a specific message in the review workspace.</strong></div><a class="btn small" href="/sms-review/index.html#inboxReviewTitle">Open approvals</a><a class="btn small" href="#" data-command-jump="health">Check source health</a>`;
    strip.querySelector('[data-command-jump]').addEventListener('click', (event) => {
      event.preventDefault();
      const button = document.querySelector('[data-command-view="health"]');
      if (button) button.click();
    });
  };

  if (HUB_VIEWS.includes(localStorage.getItem('lvptCommandCenterView')) && typeof render === 'function') render();
  else window.lvptPaintOverviewHealth();
})();
