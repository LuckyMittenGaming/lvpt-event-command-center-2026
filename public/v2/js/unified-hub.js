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
      const response = await fetch(url, { headers, cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) });
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
    const [session, picture, conversations, bridge, rcs] = await Promise.all([
      readJson('/api/sms/staging/audit-health', false, 8000),
      readJson('/api/sync/operating-picture', false, 12000),
      readJson('/api/sms/staging/conversations', false, 12000),
      readJson('/api/sms/staging/bridge-status', false, 8000),
      readJson('/api/sms/staging/rcs-collector', false, 8000)
    ]);
    const jobs = picture.ok && picture.data && Array.isArray(picture.data.jobs) ? picture.data.jobs : [];
    const evidence = jobs.filter((job) => /gmail|sms/i.test(job.name)).map((job) => `<tr><td>${esc(job.name)}</td><td>${badge(finance.sourceStatus(job))}</td><td>${esc(job.detail || '')}</td></tr>`).join('');
    const queue = picture.ok && picture.data && Array.isArray(picture.data.gmailQueue) ? picture.data.gmailQueue : [];
    const queueRows = queue.map((item) => `<tr><td>${esc(item.domainKey)}</td><td>${esc(item.lastMessageAt || '')}</td><td>${esc(item.lastDirection || '')}</td><td>Needs review</td><td>${esc(item.subject || '')}</td></tr>`).join('');
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
      ? `${collectorBadge} Last RCS ingestion ${esc(rcsData.lastIngestionAt || 'none')}. Newest RCS message ${esc(rcsData.newestMessageAt || 'none')}. Read only. Sending is off. Mark-read is off. A stored row is not a live collector. ${rcsRecords.length} Google Messages rows were returned. Existing SMS rows were not rewritten. The staging server validates AES-GCM ciphertext with its storage key. That is not end-to-end encryption.`
      : `Google Messages collector status did not load (${esc((rcs.data && rcs.data.reason) || 'unavailable')}).`;
    const smsNote = conversations.ok
      ? `${conversations.data.storedMessages || 0} stored SMS metadata rows. Message text stays encrypted. Exact matches use the event contact phone. Ambiguous and unmatched threads stay in review. Outgoing SMS is disabled.`
      : `SMS conversations did not load (${esc((conversations.data && conversations.data.reason) || 'unavailable')}). Ciphertext was not shown.`;
    const devices = bridge.ok && bridge.data && Array.isArray(bridge.data.devices) ? bridge.data.devices : [];
    const deviceRows = devices.map((item) => `<tr><td>${esc(item.device)}</td><td>${esc(item.lastSuccessAt || 'none')}</td><td>${esc(item.reportedAt || '')}</td><td>${item.readSms ? 'granted' : 'missing'}</td><td>${item.monitoring ? 'on' : 'off'}</td><td>${item.batteryUnrestricted === true ? 'unrestricted' : item.batteryUnrestricted === false ? 'restricted' : 'unknown'}</td><td>${esc(item.lastFailure || 'none')}</td></tr>`).join('');
    const deviceNote = devices.length ? 'The phone reported this health. A database row count is not a fresh upload.' : `No phone health report is stored (${esc((bridge.data && bridge.data.reason) || 'none')}).`;
    view.innerHTML = shell('Communications', 'Gmail and approved SMS', 'Approve, Make Changes, Deny, and Edit Myself stay in the review workspace. This page does not send.', `${communicationsBody(session)}<div class="hub-table-wrap"><table class="hub-table"><thead><tr><th>Source</th><th>Status</th><th>Evidence</th></tr></thead><tbody>${evidence || '<tr><td colspan="3">Connection evidence did not load.</td></tr>'}</tbody></table></div><h3>Gmail review queue</h3><div class="hub-table-wrap"><table class="hub-table"><thead><tr><th>Domain</th><th>Newest header</th><th>Direction</th><th>Match</th><th>Subject</th></tr></thead><tbody>${queueRows || '<tr><td colspan="5">No new header thread was waiting. Stored threads were left on the sheet.</td></tr>'}</tbody></table></div><p class="muted">${esc(stored)}</p><h3>SMS and RCS timeline</h3><div class="hub-table-wrap" style="max-width:100%;overflow-x:auto"><table class="hub-table"><thead><tr><th>Source</th><th>Direction</th><th>Message time</th><th>Ingested</th><th>Match</th><th>Sync</th><th>Pairing</th><th>Access</th><th>Provider ID</th></tr></thead><tbody>${rcsTimeline}${smsRows}${(smsRows || rcsTimeline) ? '' : '<tr><td colspan="9">No SMS or RCS conversation metadata was returned.</td></tr>'}</tbody></table></div><p class="muted">${smsNote}</p><h3>Google Messages collector</h3><p class="muted">${rcsNote}</p><h3>Android bridge</h3><div class="hub-table-wrap"><table class="hub-table"><thead><tr><th>Device</th><th>Last upload</th><th>Last report</th><th>Read SMS</th><th>Monitoring</th><th>Battery</th><th>Failure</th></tr></thead><tbody>${deviceRows || '<tr><td colspan="7">The phone has not reported health to this staging host.</td></tr>'}</tbody></table></div><p class="muted">${deviceNote} Sending stays off.</p>`);
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
    const listed = namedJobs.concat([scan]);
    const sms = inbox.ok && inbox.data && inbox.data.sources ? inbox.data.sources.sms : null;
    const body = `${smsScanBlock(sms, scan)}<div class="hub-table-wrap"><table class="hub-table"><thead><tr><th>Job</th><th>Status</th><th>Last attempt</th><th>Last success</th><th>Examined</th><th>Created</th><th>Duplicates</th><th>Review</th><th>Evidence</th></tr></thead><tbody>${listed.map((job) => `<tr><td>${esc(job.name)}</td><td>${badge(finance.sourceStatus(job))}</td><td>${esc(job.lastAttempt || '—')}</td><td>${esc(job.lastSuccess || '—')}</td><td>${esc(job.recordsExamined ?? '—')}</td><td>${esc(job.recordsCreated ?? '—')}</td><td>${esc(job.duplicates ?? '—')}</td><td>${esc(job.unmatched ?? '—')}</td><td>${esc(job.detail || '')}</td></tr>`).join('')}</tbody></table></div><p class="muted">A historical import is not a current ingestion. A database response is not a phone upload. A partial metadata scan is not a complete import. A job with no readable history stays Not observable. No customer message was sent by this check.</p>`;
    view.innerHTML = shell('Source health', 'What ran, and what is only claimed', 'A finished job and a fresh source are different. Missing timestamps stay unmarked.', body);
  }

  const ACTION_LABELS = {
    new_inquiry: 'New inquiry',
    awaiting_response: 'Awaiting response',
    new_activity: 'New activity',
    follow_up_due: 'Follow-up due',
    unassigned: 'Unassigned',
    booked: 'Booked event',
    resolved: 'Resolved',
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
      const summary = `<div class="lifecycle-summary hub-metrics"><div><span>Action required</span><strong>${esc(counts.actionRequired || 0)}</strong></div><div><span>Needs review</span><strong>${esc(counts.review || 0)}</strong></div><div><span>Drafts with a recipient</span><strong>${esc(counts.readyForApproval || 0)}</strong></div><div><span>Vendor, excluded from leads</span><strong>${esc(counts.vendorExcluded || 0)}</strong></div></div>`;
      const freshness = `<p class="muted">Sheet events ${esc(sources.events ?? 'not counted')}. Stored Gmail rows ${esc(sources.gmailRows ?? 'not counted')}, newest stored row ${esc(sources.newestGmail || 'none')}. ${sources.gmailFresh ? 'That stored date is within 14 days.' : 'That stored date is missing or older than 14 days.'} A stored Gmail row is not a current mailbox ingestion. RCS metadata rows returned ${esc(sources.rcsMessages ?? 'not counted')}, newest RCS message ${esc(sources.newestRcs || 'none')}. RCS is not merged into SMS, and that message time is not an ingestion result. Message text was not included in this list.</p>${smsScanBlock(sources.sms, data.smsProbe)}<div class="hub-callout"><strong>Gmail production writes are off.</strong><p>${esc(gmail.blocker || '')}</p><p>Historical Gmail rows in this read: ${esc(gmail.historicalRowsPreserved ?? 'not counted')}. Unattended staging execution: ${esc(gmail.stagingUnattended || 'not observable')}.</p></div>`;
      const cards = records.map((record, index) => {
        const info = record.qualification || {};
        const timeline = (record.timeline || []).map((item) => `<li><span>${esc(item.at || 'Time not recorded')}</span> ${esc(item.source)} ${esc(item.direction || '')} ${item.contentAvailable ? esc(item.summary) : 'Message text is not in this list. Open the authorized review only when a session can decrypt or read it.'}</li>`).join('');
        const draft = record.draft || {};
        return `<article class="action-card" data-bucket="${esc(record.bucket)}" data-review="${record.review ? 'yes' : 'no'}" data-vendor="${record.vendor ? 'yes' : 'no'}"><header><span class="badge warn">${esc(ACTION_LABELS[record.bucket] || record.bucket)}</span><span>${esc(record.source)}</span></header><h3>${esc(field(record.contact))}${record.company ? ` · ${esc(record.company)}` : ''}</h3><p>${esc(record.eventName || 'No event assigned')} · Last activity ${esc(field(record.lastActivity))}</p><p><strong>Next action:</strong> ${esc(field(record.nextAction))}</p><dl class="action-fields"><div><dt>Email</dt><dd>${esc(field(info.email))}</dd></div><div><dt>Phone</dt><dd>${esc(field(info.phone))}</dd></div><div><dt>Date</dt><dd>${esc(field(info.eventDate))}</dd></div><div><dt>Guests</dt><dd>${esc(field(info.guestCount))}</dd></div><div><dt>Type</dt><dd>${esc(field(info.eventType))}</dd></div><div><dt>Budget</dt><dd>${esc(field(info.budget))}</dd></div><div><dt>Venue</dt><dd>${esc(field(info.venue))}</dd></div><div><dt>Source</dt><dd>${esc(field(info.leadSource || record.source))}</dd></div><div><dt>Value</dt><dd>${esc(moneyCents(info.estimatedValueCents))}</dd></div><div><dt>Stage</dt><dd>${esc(field(info.stage))}</dd></div></dl><p class="muted">${info.missing && info.missing.length ? `Not recorded: ${esc(info.missing.join(', '))}.` : 'The recorded qualification fields are present.'}</p><details><summary>Conversation timeline</summary><ul class="action-timeline">${timeline || '<li>No message metadata is stored on this record.</li>'}</ul></details><details><summary>Draft reply</summary><form class="action-draft" data-draft="${index}"><label>Recipient<input readonly value="${esc(draft.recipient || '')}" data-recipient></label><textarea readonly rows="8" data-body>${esc(draft.body || '')}</textarea><div class="review-actions"><button type="button" data-decision="approve">Approve</button><button type="button" data-decision="make_changes">Make Changes</button><button type="button" data-decision="deny">Deny</button><button type="button" data-decision="edit_myself">Edit Myself</button></div><p class="action-result" data-result>Sending is disabled. A draft is not a sent message.</p></form></details></article>`;
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
            || (name === 'action' && bucket !== 'resolved' && card.getAttribute('data-vendor') !== 'yes');
          card.hidden = !show;
        });
      };
      applyFilter('action');
      view.querySelectorAll('[data-action-filter]').forEach((button) => {
        button.addEventListener('click', () => applyFilter(button.getAttribute('data-action-filter')));
      });
      view.querySelectorAll('.action-draft').forEach((form) => {
        const result = form.querySelector('[data-result]');
        const body = form.querySelector('[data-body]');
        const recipient = form.querySelector('[data-recipient]');
        form.querySelectorAll('[data-decision]').forEach((button) => {
          button.addEventListener('click', () => {
            const decision = button.getAttribute('data-decision');
            if (decision === 'edit_myself' || decision === 'make_changes') {
              body.removeAttribute('readonly');
              body.focus();
              result.textContent = 'The draft is editable in this browser. Nothing was sent.';
              return;
            }
            if (decision === 'deny') {
              result.textContent = 'Denied for now. Nothing was sent, and no task was created.';
              return;
            }
            if (!recipient.value.trim() || !body.value.trim()) {
              result.textContent = 'The exact recipient and the final message both have to be recorded before approval. Nothing was sent.';
              return;
            }
            result.textContent = `Approved for ${recipient.value.trim()}. Sending is still disabled, so this was not delivered.`;
          });
        });
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
