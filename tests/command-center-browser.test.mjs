import assert from 'node:assert/strict';
import { accessSync, constants, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { homedir, platform } from 'node:os';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

function windowsChromeCandidates() {
  const localAppData = process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local');
  return [
    join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe')
  ];
}

function linuxChromeCandidates() {
  return [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium'
  ];
}

function chromeCandidatesForPlatform() {
  if (platform() === 'win32') return windowsChromeCandidates();
  return linuxChromeCandidates();
}

function assertExecutableFile(path, label) {
  if (!existsSync(path)) {
    throw new Error(`${label} "${path}" does not exist. Install Google Chrome or set LVPT_CHROME_PATH to an installed Chrome/Chromium executable.`);
  }
  let stats;
  try {
    stats = statSync(path);
  } catch (error) {
    throw new Error(`${label} "${path}" could not be read (${error.message}).`);
  }
  if (!stats.isFile()) {
    throw new Error(`${label} "${path}" is not a file.`);
  }
  try {
    accessSync(path, constants.R_OK);
  } catch (error) {
    throw new Error(`${label} "${path}" is not readable (${error.message}).`);
  }
}

function resolveChromeExecutable() {
  const override = typeof process.env.LVPT_CHROME_PATH === 'string' ? process.env.LVPT_CHROME_PATH.trim() : '';
  if (override) {
    assertExecutableFile(override, 'LVPT_CHROME_PATH');
    return override;
  }

  const candidates = chromeCandidatesForPlatform();
  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }

  throw new Error(
    `No Chrome executable found for browser regression on ${platform()}. ` +
    `Checked: ${candidates.join(', ')}. ` +
    `Install Google Chrome or set LVPT_CHROME_PATH. Do not skip this test.`
  );
}

async function loadPlaywrightChromium() {
  try {
    const mod = await import('playwright-core');
    if (!mod?.chromium) {
      throw new Error('playwright-core loaded without a chromium export');
    }
    return mod.chromium;
  } catch (error) {
    throw new Error(
      `playwright-core is required for command-center browser regression but is not available (${error.message}). ` +
      `Do not skip this test and do not use a paid browser service. ` +
      `Install the pinned playwright-core development dependency with npm.cmd ci (declared in package.json).`
    );
  }
}

const executablePath = resolveChromeExecutable();
const chromium = await loadPlaywrightChromium();

const root = fileURLToPath(new URL('../public/', import.meta.url));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
const fixture = {
  events: [
    { id: 'evt-lead', eventName: 'Synthetic Lead', company: 'Lead Client Co', contactName: 'Synthetic Guest', status: 'New Lead', eventDate: '12/20/2026', venue: 'Synthetic Room', city: 'Las Vegas', state: 'NV', proposalUrl: 'https://example.test/lead', nextAction: 'Send the recorded proposal', setup: { targetQuote: 2500, budgetRange: '$5,000–$10,000' }, staff: [{ id: 'staff-lead', name: 'Lead Host', role: 'Host' }], tasks: [{ id: 'task-1', title: 'Send proposal', owner: 'Synthetic Owner', dueDate: '2026-11-21', status: 'Open', priority: 'High' }], documents: [{ id: 'doc-lead-1', name: 'Lead-Only Proposal Packet', category: 'Proposal' }] },
    { id: 'evt-partial', eventName: 'Synthetic Partial', status: 'Quote Needed', eventDate: '2026-12-18', quote: [{ quantity: 1, unitPrice: 100 }, { quantity: 1 }], tasks: [] },
    { id: 'evt-budget', eventName: 'Synthetic Budget', status: 'Needs Discovery', eventDate: '2026-12-16', setup: { budgetRange: '$10,000–$20,000', targetQuote: 0 }, tasks: [{ id: 'task-undated', title: 'Capture undated discovery', owner: 'Synthetic Owner', status: 'Open', priority: 'Low' }] },
    { id: 'evt-awaiting', eventName: 'Synthetic Awaiting', company: 'Private Client', status: 'Invoice Sent / Awaiting Deposit', eventDate: '2026-12-15', tasks: [] },
    { id: 'evt-processing', eventName: 'Synthetic Processing', company: 'Private Client', status: 'Booked — Payment Processing', eventDate: '2026-12-10', tasks: [] },
    { id: 'evt-active', eventName: 'Synthetic Booked', company: 'Synthetic Active', status: 'Booked', eventDate: '2026-12-01', venue: 'Synthetic Hall', city: 'Las Vegas', state: 'NV', staff: [{ id: 'staff-floor', name: 'Floor Lead', role: 'Floor' }], tasks: [{ id: 'task-floor', title: 'Confirm the floor', owner: 'Synthetic Owner', dueDate: '2026-12-02', status: 'Open', priority: 'High' }], documents: [{ id: 'doc-active-1', name: 'Active-Only Floor Diagram', category: 'Floor Plan' }, { id: 'doc-active-2', name: 'Active-Only Invoice Scan', category: 'Invoice' }] },
    { id: 'evt-declined', eventName: 'Synthetic Declined', status: 'Client Declined', eventDate: '2026-12-18', tasks: [] },
    { id: 'evt-unknown', eventName: 'Synthetic Unverified', status: 'Outcome Unverified', eventDate: '2026-12-19', tasks: [] },
    { id: 'evt-closed', eventName: 'Synthetic Closed', status: 'Closed', eventDate: '2026-12-05', tasks: [] },
    { id: 'evt-past', eventName: 'Synthetic Past', company: 'Synthetic Past Co', status: 'Booked', eventDate: '1/2/2026', venue: 'Synthetic Archive', city: 'Las Vegas', state: 'NV', tasks: [{ id: 'task-old', title: 'Archive note', owner: 'Synthetic Owner', dueDate: '2026-01-01', status: 'Open' }] }
  ]
};
const ledger = {
  ok: true,
  readOnly: true,
  paymentSourceStatus: 'command_center_all_payments',
  payoutSourceStatus: 'command_center_ledger',
  eventRead: 'read',
  tasks: [
    { id: 'task-1', eventId: 'evt-lead', title: 'Send proposal', owner: 'Synthetic Owner', dueDate: '2026-11-21', status: 'Open' },
    { id: 'task-floor', eventId: 'evt-active', title: 'Confirm the floor', owner: 'Synthetic Owner', dueDate: '2026-12-02', status: 'Open' }
  ],
  taskConflicts: [],
  events: fixture.events.map((event) => ({ id: event.id, eventName: event.eventName, company: event.company, status: event.status, staff: event.staff || [] })),
  exceptions: [
    { id: 'synthetic-exception', eventId: 'evt-lead', amountCents: 100, includedInTotals: false, detail: 'Synthetic exception stays out of totals.' }
  ],
  report: {
    money: {
      verifiedClientReceiptsCents: 0,
      clientInvoiceTotalCents: 150000,
      openClientExposureCents: 50000,
      initiatedNotSettledCents: 0,
      vendorCommittedCents: 20000,
      ownerPaidCents: 0,
      ownerPlannedCents: 30000,
      verifiedContributionCents: null,
      forecastMarginCents: null,
      drawableCashCents: null,
      incompleteFields: [],
      coverage: 'complete',
      profitReason: 'Tax treatment is not established. No tax rate was applied.',
      drawableCashReason: 'Drawable cash is unavailable.'
    },
    counts: { payments: 3, clientInvoices: 2, vendorBills: 1, unclassified: 0, payouts: 2, payoutsExcludedAsDuplicateExpense: 0, amountOverlapsNotMerged: 0 },
    payments: [
      { eventId: 'evt-lead', paymentId: 'pay-lead', role: 'client_receivable', invoiceTotalCents: 11100, amountPaidCents: 1000, balanceDueCents: 10100, paymentStatus: 'Invoice Sent', settlement: 'issued', duplicateTreatment: '' },
      { eventId: 'evt-active', paymentId: 'pay-booked', role: 'client_receivable', invoiceTotalCents: 22200, amountPaidCents: 2000, balanceDueCents: 20200, paymentStatus: 'Paid In Full', settlement: 'paid', duplicateTreatment: '' },
      { eventId: 'evt-active', paymentId: 'bill-vendor', role: 'vendor_expense', invoiceTotalCents: 20000, amountPaidCents: 0, balanceDueCents: 20000, paymentStatus: 'Invoice Received', settlement: 'issued', duplicateTreatment: '' }
    ],
    payouts: []
  },
  gmailActivityCount: 4,
  gmailThreadCount: 2,
  gmailQueue: [{ domainKey: 'example.test', lastMessageAt: '2026-11-20T18:00:00.000Z', lastDirection: 'inbound', subject: 'Synthetic header' }],
  jobs: [
    { id: 'gmail-production', name: 'Gmail production ingestion', coverage: 'read-complete', connected: true, detail: 'Bounded header read.' },
    { id: 'financial-sync', name: 'Financial source sync', lastSuccess: '2026-11-25T12:00:00.000Z', connected: true, detail: 'Synthetic sheet read.' },
    { id: 'sms-heartbeat', name: 'Android SMS collector heartbeat', status: 'NOT VERIFIED', connected: false, detail: 'No heartbeat on this fixture.' }
  ]
};
const leadInboxRecord = {
  id: 'event:evt-lead',
  eventId: 'evt-lead',
  bucket: 'follow_up_due',
  classification: {
    kind: 'follow_up_due',
    reason: 'An open task is overdue relative to today; due-today is not overdue.',
    evidence: { eventId: 'evt-lead', dueDate: '2026-11-21', taskIds: ['task-1'], timelineSources: ['Gmail'] }
  },
  priority: 'High',
  dueDate: '2026-11-21',
  source: 'Referral',
  contact: 'Synthetic Guest',
  company: 'Synthetic Co',
  eventName: 'Synthetic Lead',
  channel: 'Gmail',
  nextAction: 'Send the recorded proposal',
  lastActivity: '2026-11-20T18:00:00.000Z',
  review: false,
  vendor: false,
  qualification: { missing: ['phone'], email: 'stored.lead@example.test', stage: 'New Lead' },
  draft: {
    body: 'Draft preview',
    recipient: 'stored.lead@example.test',
    recipientRecorded: true,
    recipientVerified: false,
    readyToApprove: false,
    readyToSend: false,
    sendEnabled: false
  },
  timeline: [{
    at: '2026-11-20T18:00:00.000Z',
    source: 'Gmail',
    direction: 'outbound',
    summary: 'PRIVATE_FIXTURE_BODY_MUST_STAY_COLLAPSED',
    contentAvailable: true
  }]
};

const inbox = {
  ok: true,
  today: '2026-11-25',
  counts: { actionRequired: 6, review: 2, recordedRecipientUnverified: 1, vendorExcluded: 1, resolved: 1 },
  pipeline: {
    denominator: 3,
    stages: { open: 2, booked: 1 },
    sources: { referral: 1 },
    excluded: { vendor: 1 },
    qualificationGaps: 1,
    dueFollowUps: 1,
    overdueFollowUps: 1,
    conversion: { rate: null, reason: 'Booked divided by all events is not a conversion rate.' },
    proposalLinks: [{ eventId: 'evt-lead', url: 'https://example.test/lead' }]
  },
  records: [
    leadInboxRecord,
    {
      ...leadInboxRecord,
      timeline: leadInboxRecord.timeline.slice()
    },
    {
      id: 'event:evt-reply',
      eventId: 'evt-reply',
      bucket: 'awaiting_response',
      classification: {
        kind: 'reply_required',
        reason: 'Newest dated activity is inbound, so a reply is required before any older follow-up.',
        evidence: { eventId: 'evt-reply', activityDirection: 'inbound', timelineSources: ['Gmail'] }
      },
      priority: 'Critical',
      dueDate: '2026-11-26',
      contact: 'Reply Guest',
      company: 'Reply Co',
      eventName: 'Synthetic Reply Needed',
      channel: 'Gmail',
      nextAction: 'Reply to the newest inbound message',
      lastActivity: '2026-11-24T16:00:00.000Z',
      review: false,
      vendor: false,
      qualification: { missing: [], stage: 'Needs Discovery' },
      draft: { recipient: '', recipientRecorded: false, recipientVerified: false, readyToApprove: false, readyToSend: false, sendEnabled: false },
      timeline: [{ at: '2026-11-24T16:00:00.000Z', source: 'Gmail', direction: 'inbound', summary: '', contentAvailable: false }]
    },
    {
      id: 'event:evt-today',
      eventId: 'evt-today',
      bucket: 'new_inquiry',
      classification: {
        kind: 'new_inquiry',
        reason: 'Open pipeline status with recent or new inquiry evidence.',
        evidence: { eventId: 'evt-today', dueDate: '2026-11-25', pipelineStage: 'open' }
      },
      priority: 'Medium',
      dueDate: '2026-11-25',
      contact: 'Today Guest',
      company: 'Today Co',
      eventName: 'Synthetic Due Today',
      channel: 'unknown',
      nextAction: 'Call while the follow-up is due today',
      lastActivity: '2026-11-25',
      review: false,
      vendor: false,
      qualification: { stage: 'New Lead' },
      draft: { recipient: '', recipientVerified: false },
      timeline: []
    },
    {
      id: 'event:evt-missing-due',
      eventId: 'evt-missing-due',
      bucket: 'follow_up_due',
      classification: {
        kind: 'follow_up_due',
        reason: 'Classification can say follow-up due, but a missing calendar due date stays undated.',
        evidence: { eventId: 'evt-missing-due', dueDate: null }
      },
      priority: 'Low',
      dueDate: '',
      contact: 'Missing Due Guest',
      company: 'Missing Due Co',
      eventName: 'Synthetic Missing Due',
      channel: 'unknown',
      nextAction: 'Capture a valid due date before treating this as overdue',
      lastActivity: '2026-11-20',
      review: false,
      vendor: false,
      qualification: { stage: 'Needs Discovery' },
      draft: { recipient: '', recipientVerified: false },
      timeline: []
    },
    {
      id: 'event:evt-bad-date',
      eventId: 'evt-bad-date',
      bucket: 'follow_up_due',
      classification: {
        kind: 'follow_up_due',
        reason: 'An invalid calendar due date cannot establish overdue.',
        evidence: { eventId: 'evt-bad-date', dueDate: '2026-02-30' }
      },
      priority: 'Low',
      dueDate: '2026-02-30',
      contact: 'Bad Date Guest',
      company: 'Bad Date Co',
      eventName: 'Synthetic Invalid Due',
      channel: 'unknown',
      nextAction: 'Replace the invalid due date',
      lastActivity: '2026-11-19',
      review: false,
      vendor: false,
      qualification: { stage: 'Needs Discovery' },
      draft: { recipient: '', recipientVerified: false },
      timeline: []
    },
    {
      id: 'sms:sms-amb',
      eventId: '',
      bucket: 'unassigned',
      classification: {
        kind: 'needs_review',
        reason: 'More than one event id matches, or no stable event id is present.',
        evidence: { uncertainMatch: true, missingEventId: true, candidateEventIds: ['evt-a', 'evt-b'] }
      },
      priority: 'Medium',
      dueDate: '',
      contact: 'Ambiguous Contact',
      company: '',
      eventName: 'Ambiguous SMS Match',
      channel: 'SMS',
      nextAction: 'Review ambiguous SMS association before assigning an event.',
      lastActivity: '2026-11-23T12:00:00.000Z',
      review: true,
      vendor: false,
      qualification: { missing: ['email'] },
      draft: { recipient: '', recipientRecorded: false, recipientVerified: false, readyToApprove: false, readyToSend: false, sendEnabled: false },
      timeline: []
    },
    {
      id: 'event:evt-done',
      eventId: 'evt-done',
      bucket: 'resolved',
      classification: {
        kind: 'resolved',
        reason: 'Closed-won or completed status excludes this row from the active queue.',
        evidence: { eventId: 'evt-done', pipelineStage: 'closed_won' }
      },
      priority: 'Low',
      dueDate: '2026-10-01',
      contact: 'Resolved Guest',
      company: 'Resolved Co',
      eventName: 'Synthetic Resolved',
      channel: 'unknown',
      nextAction: 'No active follow-up',
      lastActivity: '2026-10-01',
      review: false,
      vendor: false,
      qualification: { stage: 'Completed' },
      draft: { recipient: '', recipientVerified: false },
      timeline: []
    },
    {
      id: 'gmail:thread-vendor-1',
      eventId: '',
      bucket: 'vendor',
      classification: {
        kind: 'vendor_obligation',
        reason: 'Vendor keywords in the mailbox subject or domain keep this out of sales prospects.',
        evidence: { vendor: true, timelineSources: ['Gmail'] }
      },
      priority: '',
      dueDate: '',
      contact: 'Elevated Billing',
      company: 'Elevated',
      eventName: '',
      channel: 'Gmail',
      nextAction: 'Keep with vendor operations. This is not a sales lead.',
      lastActivity: '2026-11-22T09:00:00.000Z',
      review: false,
      vendor: true,
      qualification: {},
      draft: { recipient: 'vendor.billing@example.test', recipientRecorded: true, recipientVerified: false },
      timeline: []
    },
    {
      id: 'event:evt-clash',
      eventId: 'evt-clash',
      bucket: 'new_inquiry',
      classification: { kind: 'new_inquiry', reason: 'First conflicting copy.', evidence: { eventId: 'evt-clash' } },
      priority: 'High',
      dueDate: '2026-11-28',
      contact: 'Clash Guest A',
      company: 'Clash Co',
      eventName: 'Synthetic Clash A',
      channel: 'unknown',
      nextAction: 'First conflicting next action',
      lastActivity: '2026-11-21',
      review: false,
      vendor: false,
      draft: { recipient: '', recipientVerified: false },
      timeline: []
    },
    {
      id: 'event:evt-clash',
      eventId: 'evt-clash',
      bucket: 'awaiting_response',
      classification: { kind: 'reply_required', reason: 'Second conflicting copy.', evidence: { eventId: 'evt-clash' } },
      priority: 'Low',
      dueDate: '2026-11-29',
      contact: 'Clash Guest B',
      company: 'Clash Co',
      eventName: 'Synthetic Clash B',
      channel: 'Gmail',
      nextAction: 'Second conflicting next action',
      lastActivity: '2026-11-22',
      review: true,
      vendor: false,
      draft: { recipient: '', recipientVerified: false },
      timeline: []
    },
    {
      id: 'event:evt-twin-recipient',
      eventId: 'evt-twin-recipient',
      bucket: 'new_inquiry',
      classification: {
        kind: 'new_inquiry',
        reason: 'Shared id with differing recorded recipient.',
        evidence: { eventId: 'evt-twin-recipient', pipelineStage: 'open' }
      },
      priority: 'Medium',
      dueDate: '2026-11-27',
      contact: 'Twin Recipient Guest',
      company: 'Twin Recipient Co',
      eventName: 'Synthetic Twin Recipient',
      channel: 'Gmail',
      nextAction: 'Confirm the recorded recipient before review',
      lastActivity: '2026-11-24',
      review: false,
      vendor: false,
      draft: { recipient: 'first.twin@example.test', recipientRecorded: true, recipientVerified: false },
      timeline: []
    },
    {
      id: 'event:evt-twin-recipient',
      eventId: 'evt-twin-recipient',
      bucket: 'new_inquiry',
      classification: {
        kind: 'new_inquiry',
        reason: 'Shared id with differing recorded recipient.',
        evidence: { eventId: 'evt-twin-recipient', pipelineStage: 'open' }
      },
      priority: 'Medium',
      dueDate: '2026-11-27',
      contact: 'Twin Recipient Guest',
      company: 'Twin Recipient Co',
      eventName: 'Synthetic Twin Recipient',
      channel: 'Gmail',
      nextAction: 'Confirm the recorded recipient before review',
      lastActivity: '2026-11-24',
      review: false,
      vendor: false,
      draft: { recipient: 'second.twin@example.test', recipientRecorded: true, recipientVerified: false },
      timeline: []
    },
    {
      id: 'event:evt-twin-evidence',
      eventId: 'evt-twin-evidence',
      bucket: 'event_task',
      classification: {
        kind: 'event_task',
        reason: 'Shared id with differing classification evidence.',
        evidence: { eventId: 'evt-twin-evidence', taskIds: ['task-evidence-a'] }
      },
      priority: 'Medium',
      dueDate: '2026-11-28',
      contact: 'Twin Evidence Guest',
      company: 'Twin Evidence Co',
      eventName: 'Synthetic Twin Evidence',
      channel: 'unknown',
      nextAction: 'Reconcile task evidence before treating as one row',
      lastActivity: '2026-11-24',
      review: false,
      vendor: false,
      draft: { recipient: '', recipientVerified: false },
      timeline: []
    },
    {
      id: 'event:evt-twin-evidence',
      eventId: 'evt-twin-evidence',
      bucket: 'event_task',
      classification: {
        kind: 'event_task',
        reason: 'Shared id with differing classification evidence.',
        evidence: { eventId: 'evt-twin-evidence', taskIds: ['task-evidence-b'] }
      },
      priority: 'Medium',
      dueDate: '2026-11-28',
      contact: 'Twin Evidence Guest',
      company: 'Twin Evidence Co',
      eventName: 'Synthetic Twin Evidence',
      channel: 'unknown',
      nextAction: 'Reconcile task evidence before treating as one row',
      lastActivity: '2026-11-24',
      review: false,
      vendor: false,
      draft: { recipient: '', recipientVerified: false },
      timeline: []
    },
    {
      id: '',
      eventId: 'evt-noid',
      bucket: 'needs_review',
      classification: {
        kind: 'needs_review',
        reason: 'Missing stable action id cannot enter the active queue.',
        evidence: { missingEventId: false, eventId: 'evt-noid' }
      },
      priority: 'Low',
      dueDate: '2026-11-30',
      contact: 'Missing Id Guest',
      company: 'Missing Id Co',
      eventName: 'Synthetic Missing Id',
      channel: 'SMS',
      nextAction: 'Assign a stable action id before listing this row',
      lastActivity: '2026-11-24',
      review: true,
      vendor: false,
      draft: { recipient: '', recipientVerified: false },
      timeline: []
    },
    {
      id: 'event:evt-ws-evidence',
      eventId: 'evt-ws-evidence',
      bucket: 'new_inquiry',
      classification: {
        kind: 'new_inquiry',
        reason: 'Whitespace-only evidence disagreement must conflict.',
        evidence: { eventId: 'evt-ws-evidence', note: 'exact match note' }
      },
      priority: 'Medium',
      dueDate: '2026-11-27',
      contact: 'Whitespace Evidence Guest',
      company: 'Whitespace Evidence Co',
      eventName: 'Synthetic Whitespace Evidence',
      channel: 'Gmail',
      nextAction: 'Reconcile evidence whitespace before collapsing',
      lastActivity: '2026-11-24',
      review: false,
      vendor: false,
      draft: { recipient: 'ws.evidence@example.test', recipientRecorded: true, recipientVerified: false, body: 'Shared draft body' },
      timeline: []
    },
    {
      id: 'event:evt-ws-evidence',
      eventId: 'evt-ws-evidence',
      bucket: 'new_inquiry',
      classification: {
        kind: 'new_inquiry',
        reason: 'Whitespace-only evidence disagreement must conflict.',
        evidence: { eventId: 'evt-ws-evidence', note: 'exact match note ' }
      },
      priority: 'Medium',
      dueDate: '2026-11-27',
      contact: 'Whitespace Evidence Guest',
      company: 'Whitespace Evidence Co',
      eventName: 'Synthetic Whitespace Evidence',
      channel: 'Gmail',
      nextAction: 'Reconcile evidence whitespace before collapsing',
      lastActivity: '2026-11-24',
      review: false,
      vendor: false,
      draft: { recipient: 'ws.evidence@example.test', recipientRecorded: true, recipientVerified: false, body: 'Shared draft body' },
      timeline: []
    },
    {
      id: 'event:evt-draft-body',
      eventId: 'evt-draft-body',
      bucket: 'new_inquiry',
      classification: {
        kind: 'new_inquiry',
        reason: 'Draft body disagreement must conflict.',
        evidence: { eventId: 'evt-draft-body', pipelineStage: 'open' }
      },
      priority: 'Medium',
      dueDate: '2026-11-27',
      contact: 'Draft Body Guest',
      company: 'Draft Body Co',
      eventName: 'Synthetic Draft Body',
      channel: 'Gmail',
      nextAction: 'Reconcile draft content before collapsing',
      lastActivity: '2026-11-24',
      review: false,
      vendor: false,
      draft: { recipient: 'draft.body@example.test', recipientRecorded: true, recipientVerified: false, body: 'Draft revision A' },
      timeline: []
    },
    {
      id: 'event:evt-draft-body',
      eventId: 'evt-draft-body',
      bucket: 'new_inquiry',
      classification: {
        kind: 'new_inquiry',
        reason: 'Draft body disagreement must conflict.',
        evidence: { eventId: 'evt-draft-body', pipelineStage: 'open' }
      },
      priority: 'Medium',
      dueDate: '2026-11-27',
      contact: 'Draft Body Guest',
      company: 'Draft Body Co',
      eventName: 'Synthetic Draft Body',
      channel: 'Gmail',
      nextAction: 'Reconcile draft content before collapsing',
      lastActivity: '2026-11-24',
      review: false,
      vendor: false,
      draft: { recipient: 'draft.body@example.test', recipientRecorded: true, recipientVerified: false, body: 'Draft revision B' },
      timeline: []
    },
    {
      id: 'event:evt-reorder',
      eventId: 'evt-reorder',
      bucket: 'new_inquiry',
      classification: {
        kind: 'new_inquiry',
        reason: 'Reordered keys with identical values still collapse.',
        evidence: { eventId: 'evt-reorder', pipelineStage: 'open' }
      },
      priority: 'Low',
      dueDate: '2026-12-01',
      contact: 'Reorder Guest',
      company: 'Reorder Co',
      eventName: 'Synthetic Reorder Keys',
      channel: 'unknown',
      nextAction: 'Keep one row when only object key order differs',
      lastActivity: '2026-11-24',
      review: false,
      vendor: false,
      draft: { body: 'Identical draft', recipient: '', recipientVerified: false },
      timeline: []
    },
    {
      draft: { recipientVerified: false, recipient: '', body: 'Identical draft' },
      vendor: false,
      review: false,
      timeline: [],
      lastActivity: '2026-11-24',
      nextAction: 'Keep one row when only object key order differs',
      channel: 'unknown',
      eventName: 'Synthetic Reorder Keys',
      company: 'Reorder Co',
      contact: 'Reorder Guest',
      dueDate: '2026-12-01',
      priority: 'Low',
      classification: {
        evidence: { pipelineStage: 'open', eventId: 'evt-reorder' },
        reason: 'Reordered keys with identical values still collapse.',
        kind: 'new_inquiry'
      },
      bucket: 'new_inquiry',
      eventId: 'evt-reorder',
      id: 'event:evt-reorder'
    }
  ],
  sources: { events: 3 },
  gmail: { blocker: 'Production writes are off.' }
};

const ledgerMissingCollections = {
  ...ledger,
  exceptions: undefined,
  report: {
    money: { ...ledger.report.money },
    counts: { ...ledger.report.counts }
  }
};
delete ledgerMissingCollections.exceptions;
delete ledgerMissingCollections.report.payments;

const ledgerIncompleteEmpty = {
  ...ledger,
  exceptions: [],
  report: {
    money: {
      ...ledger.report.money,
      coverage: 'incomplete',
      incompleteFields: ['verifiedClientReceipts', 'openClientExposure', 'vendorCommitted'],
      verifiedClientReceiptGaps: true,
      incompleteReason: 'Conflicting or unidentified rows were excluded, so the marked totals are incomplete.'
    },
    counts: { ...ledger.report.counts, payments: 0, vendorBills: 0 },
    payments: [],
    payouts: []
  }
};

const ledgerIncompleteZerosNoFields = {
  ...ledger,
  exceptions: [],
  report: {
    money: {
      verifiedClientReceiptsCents: 0,
      clientInvoiceTotalCents: 0,
      openClientExposureCents: 0,
      initiatedNotSettledCents: 0,
      vendorCommittedCents: 0,
      ownerPaidCents: 0,
      ownerPlannedCents: 0,
      verifiedContributionCents: null,
      forecastMarginCents: null,
      drawableCashCents: null,
      coverage: 'incomplete',
      incompleteFields: [],
      verifiedClientReceiptGaps: false,
      profitReason: 'Tax treatment is not established. No tax rate was applied.',
      drawableCashReason: 'Drawable cash is unavailable.',
      incompleteReason: 'Coverage is incomplete and no field-level completeness list was supplied.'
    },
    counts: { ...ledger.report.counts, payments: 0, vendorBills: 0 },
    payments: [],
    payouts: []
  }
};
const ledgerIncompleteZerosAbsentFields = {
  ...ledgerIncompleteZerosNoFields,
  report: {
    ...ledgerIncompleteZerosNoFields.report,
    money: {
      ...ledgerIncompleteZerosNoFields.report.money,
      incompleteReason: 'Coverage is incomplete and incompleteFields was omitted.'
    }
  }
};
delete ledgerIncompleteZerosAbsentFields.report.money.incompleteFields;

let mode = 'unauthorized';
let pictureGets = 0;
let releaseLedger = null;
const posts = [];
const server = createServer((request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1');
  if (request.method === 'POST') posts.push(url.pathname);
  const path = decodeURIComponent(url.pathname);
  if (path === '/sms-review/index.html') {
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end('<!doctype html><title>Review sign-in</title><p>Owner review sign-in handoff</p>');
    return;
  }
  const filePath = normalize(join(root, path.replace(/^\/+/, '')));
  if (!filePath.startsWith(root)) {
    response.writeHead(403);
    response.end('no');
    return;
  }
  try {
    const body = readFileSync(filePath);
    response.writeHead(200, { 'content-type': types[extname(filePath)] || 'application/octet-stream' });
    response.end(body);
  } catch {
    response.writeHead(404);
    response.end('missing');
  }
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.route('**/api/**', async (route) => {
  const request = route.request();
  if (request.method() === 'POST') posts.push(new URL(request.url()).pathname);
  if (mode === 'unauthorized') {
    await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ ok: false, reason: 'unauthorized', readOnly: true }) });
    return;
  }
  if (mode === 'unavailable') {
    await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ ok: false, reason: 'unavailable' }) });
    return;
  }
  const pathname = new URL(request.url()).pathname;
  if (mode === 'malformed' && pathname === '/api/sync/events') {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, readOnly: true }) });
    return;
  }
  if (mode === 'empty' && pathname === '/api/sync/events') {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, readOnly: true, events: [], eventCount: 0 }) });
    return;
  }
  if (pathname === '/api/sync/events') {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, readOnly: true, writesPerformed: false, events: fixture.events, eventCount: fixture.events.length }) });
    return;
  }
  if (pathname === '/api/sync/operating-picture') {
    pictureGets += 1;
    if (mode === 'delay-ledger') await new Promise((resolve) => { releaseLedger = resolve; });
    if (mode === 'picture-fail') {
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ ok: false, reason: 'picture_unavailable', readOnly: true }) });
      return;
    }
    if (mode === 'picture-missing-collections') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ledgerMissingCollections) });
      return;
    }
    if (mode === 'picture-incomplete-empty') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ledgerIncompleteEmpty) });
      return;
    }
    if (mode === 'picture-incomplete-zeros') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ledgerIncompleteZerosNoFields) });
      return;
    }
    if (mode === 'picture-incomplete-zeros-absent-fields') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ledgerIncompleteZerosAbsentFields) });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ledger) });
    return;
  }
  if (pathname === '/api/sync/action-inbox') {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(inbox) });
    return;
  }
  if (pathname === '/api/sms/staging/conversations') {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, storedMessages: 0, threads: [], sendEnabled: false, messageTextIncluded: false }) });
    return;
  }
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, authenticated: true }) });
});

page.on('console', (msg) => console.log('BROWSER', msg.type(), msg.text()));
page.on('pageerror', (error) => console.log('PAGEERROR', error.message));
page.on('request', (request) => {
  if (request.url().includes('/api/')) console.log('REQ', request.method(), request.url());
});
async function openHub(width, height) {
  await page.setViewportSize({ width, height });
  await page.goto(`http://127.0.0.1:${port}/v2/index.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.lvptSheetSnapshot && window.lvptSheetSnapshot.state && window.lvptSheetSnapshot.state !== 'loading', null, { timeout: 15000 });
}

function overflow() {
  return page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
}

async function assertCompactPresentation({ expectCurrency = true } = {}) {
  const report = await page.evaluate(() => {
    const styleHidden = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return true;
      const style = getComputedStyle(el);
      return el.hidden || style.display === 'none' || style.visibility === 'hidden' || el.getBoundingClientRect().height < 1;
    };
    const money = [...document.querySelectorAll('#overviewLedger strong')].map((el) => {
      const style = getComputedStyle(el);
      return {
        text: (el.textContent || '').trim(),
        fontSize: parseFloat(style.fontSize) || 0,
        tabular: String(style.fontVariantNumeric || '').includes('tabular'),
        wrap: style.overflowWrap,
        color: style.color
      };
    });
    const emptyGiants = [...document.querySelectorAll('#commandView .command-view-body > *')].filter((el) => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.display !== 'none' && rect.height > 160 && !(el.textContent || '').trim();
    }).length;
    const active = document.querySelector('#commandNav [data-command-view].active');
    const activeStyle = active ? getComputedStyle(active) : null;
    return {
      editorHidden: styleHidden('#eventEditorPanel'),
      layoutHidden: styleHidden('.layout-grid'),
      tabsHidden: styleHidden('.tab-panel'),
      metricsHidden: styleHidden('#metricsGrid'),
      stripHidden: styleHidden('#hubOverviewStrip'),
      fullEditorVisible: /Full Event Editor/i.test(document.body.innerText || ''),
      emptyGiants,
      money,
      activeSelected: !!(active && active.classList.contains('active')),
      activeColor: activeStyle ? activeStyle.color : '',
      overflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
    };
  });
  assert.equal(report.editorHidden, true);
  assert.equal(report.layoutHidden, true);
  assert.equal(report.tabsHidden, true);
  assert.equal(report.metricsHidden, true);
  assert.equal(report.stripHidden, true);
  assert.equal(report.fullEditorVisible, false);
  assert.equal(report.emptyGiants, 0);
  assert.equal(report.activeSelected, true);
  assert.equal(report.overflow, true);
  assert.notEqual(report.activeColor, 'rgba(0, 0, 0, 0)');
  if (expectCurrency) {
    assert.ok(report.money.length > 0, 'overview ledger currency nodes missing');
    for (const node of report.money) {
      assert.ok(node.fontSize >= 14, `currency/date figure too small: ${node.text} @ ${node.fontSize}`);
      assert.equal(node.tabular, true, `currency figure missing tabular nums: ${node.text}`);
      assert.match(node.wrap, /anywhere|break-word/);
    }
  }
}

async function assertCommandNavKeyboardFocus() {
  await page.locator('#commandNav [data-command-view]').first().focus();
  await page.keyboard.press('Tab');
  const focus = await page.evaluate(() => {
    const el = document.activeElement;
    if (!el) return null;
    const style = getComputedStyle(el);
    return {
      inNav: !!(el.closest && el.closest('#commandNav')),
      focusVisible: el.matches(':focus-visible'),
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth
    };
  });
  assert.ok(focus && focus.inNav, 'keyboard focus left command nav');
  assert.equal(focus.focusVisible, true);
  assert.notEqual(focus.outlineStyle, 'none');
  assert.notEqual(focus.outlineWidth, '0px');
}

const selectedEventReportTypes = ['pre', 'post'];

async function assertSelectedEventReportIsolation(expected) {
  const {
    eventName,
    company,
    documentName,
    staffName,
    taskTitle,
    forbidden = []
  } = expected;
  for (const reportType of selectedEventReportTypes) {
    await page.evaluate((type) => {
      const center = document.getElementById('reportCenter');
      if (center) center.hidden = false;
      const button = document.querySelector(`[data-generate-report="${type}"]`);
      if (button) button.click();
    }, reportType);
    await page.waitForFunction((name) => {
      const output = document.getElementById('generatedReportOutput');
      return output && !output.hidden && (output.innerText || '').includes(name);
    }, eventName);
    const reportText = await page.locator('#generatedReportOutput').innerText();
    const title = reportType === 'post' ? /Post-Event & After-Action Report/ : /Pre-Event Command Report/;
    assert.match(reportText, title);
    assert.match(reportText, new RegExp(eventName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(reportText, new RegExp(company.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(reportText, new RegExp(documentName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(reportText, new RegExp(staffName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(reportText, new RegExp(taskTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    for (const phrase of forbidden) {
      assert.equal(reportText.includes(phrase), false, `${reportType} report leaked "${phrase}"`);
    }
    assert.match(await page.locator('#reportContext').innerText(), new RegExp(`Selected event: ${eventName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  }
}

try {
  mode = 'unauthorized';
  await openHub(1280, 800);
  await page.waitForFunction(() => window.lvptSheetSnapshot && window.lvptSheetSnapshot.state === 'auth-required');
  const unauthText = await page.locator('body').innerText();
  assert.match(unauthText, /Owner sign-in required/);
  assert.equal(unauthText.includes('NIUM'), false);
  assert.equal(unauthText.includes('Synthetic Lead'), false);
  await page.locator('[data-command-view="pipeline"]').click();
  await page.waitForTimeout(200);
  const pipeline = await page.locator('#commandView').innerText();
  assert.match(pipeline, /Owner sign-in required/);
  assert.equal(pipeline.includes('No deals'), false);
  await page.locator('[data-command-view="communications"]').click();
  await page.waitForTimeout(400);
  const communications = await page.locator('#commandView').innerText();
  assert.match(communications, /SMS metadata was not read|AUTH REQUIRED/);
  assert.equal(/\d+ stored SMS metadata rows/.test(communications), false);
  await page.locator('#ownerSignInLink').click();
  await page.waitForURL(/sms-review/);
  assert.match(await page.locator('body').innerText(), /Owner review sign-in handoff/);

  mode = 'ready';
  await openHub(1280, 800);
  await page.waitForFunction(() => window.lvptSheetSnapshot && window.lvptSheetSnapshot.state === 'ready');
  let afterReady = pictureGets;
  await page.locator('[data-command-view="overview"]').click();
  await page.waitForFunction(() => {
    const text = document.querySelector('#commandView')?.innerText || '';
    return /Ledger-recorded receipts/i.test(text) && /Open vendor obligations/i.test(text) && /\$500\.00/.test(text);
  });
  const overview = await page.locator('#commandView').innerText();
  assert.match(overview, /Confirmed upcoming/);
  assert.match(overview, /Dated inquiries and proposals/);
  assert.match(overview, /ledger-recorded receipts/i);
  assert.match(overview, /Scope: Payments sheet via shared operating picture/i);
  assert.match(overview, /Open vendor obligations/i);
  assert.match(overview, /\$200\.00/);
  assert.match(overview, /\$500\.00/);
  assert.match(overview, /\$0\.00/);
  assert.match(overview, /Drawable cash[\s\S]*Unavailable/i);
  assert.match(overview, /Recorded targets/i);
  assert.match(overview, /Not added to priced line items/i);
  assert.match(overview, /\$2,500\.00/);
  assert.match(overview, /Priced line items/i);
  assert.match(overview, /Cost coverage/i);
  assert.match(overview, /Missing cost is not zero/i);
  assert.match(overview, /Overdue tasks/i);
  assert.match(overview, /Due today/i);
  assert.match(overview, /Undated open tasks/i);
  assert.match(overview, /Capture undated discovery|Undated open tasks[\s\S]*1/i);
  assert.match(overview, /Approvals waiting: Unavailable on Overview/i);
  assert.match(overview, /Synthetic exception stays out of totals/i);
  assert.match(overview, /Excluded from totals/i);
  assert.match(overview, /pay-lead/);
  assert.match(overview, /bill-vendor/);
  assert.match(overview, /Sheet ledger last success/i);
  assert.match(overview, /SMS heartbeat/i);
  assert.equal(overview.includes('Quote profit'), false);
  assert.equal(await page.locator('#eventEditorPanel').isVisible(), false);
  assert.equal(await page.locator('#reportCenter').isVisible(), false);
  assert.equal(await page.locator('#ownerSignInLink').count(), 1);
  await assertCompactPresentation({ expectCurrency: true });
  await assertCommandNavKeyboardFocus();
  for (const width of [1280, 375, 320, 280]) {
    await page.setViewportSize({ width, height: 800 });
    await page.waitForTimeout(150);
    assert.equal(await overflow(), true, `horizontal overflow at ${width}px`);
    assert.equal(await page.locator('#commandNav').isVisible(), true);
    assert.equal(await page.locator('#eventEditorPanel').isVisible(), false);
    assert.equal(await page.locator('[data-command-view="overview"].active').count(), 1);
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.evaluate(() => {
    const result = window.lvptOperatingPictureResult;
    if (!result || !result.data || !result.data.report || !result.data.report.money) throw new Error('operating picture missing');
    result.data.report.money.incompleteFields = ['verifiedClientReceipts', 'openClientExposure', 'vendorCommitted'];
    result.data.report.money.verifiedClientReceiptGaps = true;
    result.data.report.money.coverage = 'incomplete';
    result.data.report.money.incompleteReason = 'Conflicting or unidentified rows were excluded, so the marked totals are incomplete.';
    window.lvptPaintOverviewLedger();
  });
  const incompleteOverview = await page.locator('#overviewLedger').innerText();
  assert.match(incompleteOverview, /Incomplete/);
  assert.equal(/\$500\.00/.test(incompleteOverview), false);
  assert.equal(/\$200\.00/.test(incompleteOverview), false);
  assert.equal(/\$0\.00/.test(incompleteOverview), false);
  const incompleteOperating = await page.locator('#overviewOperating').innerText();
  assert.match(incompleteOperating, /Unavailable[\s\S]*coverage is incomplete/i);
  assert.equal(/No open client balance was returned on the complete ledger read/i.test(incompleteOperating), false);
  assert.equal(/No open vendor bill was returned on the complete ledger read/i.test(incompleteOperating), false);
  assert.equal(/pay-lead/.test(incompleteOperating), false);
  await page.evaluate(() => {
    const result = window.lvptOperatingPictureResult;
    result.data.report.money.incompleteFields = [];
    result.data.report.money.verifiedClientReceiptGaps = false;
    result.data.report.money.coverage = 'complete';
    result.data.report.money.incompleteReason = '';
    window.lvptPaintOverviewLedger();
  });

  mode = 'picture-fail';
  await openHub(1280, 800);
  await page.waitForFunction(() => window.lvptSheetSnapshot && window.lvptSheetSnapshot.state === 'ready');
  await page.locator('[data-command-view="overview"]').click();
  await page.waitForFunction(() => document.querySelectorAll('[data-retry-operating-picture]').length === 2);
  assert.equal(await page.locator('#overviewLedger [data-retry-operating-picture]').count(), 1);
  assert.equal(await page.locator('#overviewOperating [data-retry-operating-picture]').count(), 1);
  assert.equal(await page.locator('#retryOverviewLedger').count(), 0);
  const failedPicture = await page.locator('#commandView').innerText();
  assert.match(failedPicture, /did not load|did not succeed/i);
  assert.equal(failedPicture.includes('$500.00'), false);
  assert.equal(/No open client balance was returned/i.test(failedPicture), false);
  let retryGets = pictureGets;
  mode = 'ready';
  await page.locator('#overviewLedger [data-retry-operating-picture]').click();
  await page.waitForFunction(() => /\$500\.00/.test(document.querySelector('#overviewLedger')?.innerText || ''));
  assert.ok(pictureGets > retryGets);
  assert.match(await page.locator('#overviewOperating').innerText(), /pay-lead/);

  mode = 'picture-fail';
  await openHub(1280, 800);
  await page.waitForFunction(() => window.lvptSheetSnapshot && window.lvptSheetSnapshot.state === 'ready');
  await page.locator('[data-command-view="overview"]').click();
  await page.waitForFunction(() => document.querySelectorAll('[data-retry-operating-picture]').length === 2);
  retryGets = pictureGets;
  mode = 'ready';
  await page.locator('#overviewOperating [data-retry-operating-picture]').click();
  await page.waitForFunction(() => /\$500\.00/.test(document.querySelector('#overviewLedger')?.innerText || ''));
  assert.ok(pictureGets > retryGets);
  assert.match(await page.locator('#overviewOperating').innerText(), /bill-vendor/);

  mode = 'picture-missing-collections';
  await openHub(1280, 800);
  await page.waitForFunction(() => window.lvptSheetSnapshot && window.lvptSheetSnapshot.state === 'ready');
  await page.locator('[data-command-view="overview"]').click();
  await page.waitForFunction(() => /payments collection was not returned/i.test(document.querySelector('#overviewOperating')?.innerText || ''));
  const missingCollections = await page.locator('#overviewOperating').innerText();
  assert.match(missingCollections, /payments collection was not returned/i);
  assert.match(missingCollections, /exceptions collection was not returned/i);
  assert.equal(/No open client balance was returned on the complete ledger read/i.test(missingCollections), false);
  assert.equal(/No unresolved finance exceptions were returned on the complete operating-picture read/i.test(missingCollections), false);
  assert.equal(missingCollections.includes('pay-lead'), false);
  assert.equal(missingCollections.includes('Synthetic exception'), false);

  mode = 'picture-incomplete-empty';
  await openHub(1280, 800);
  await page.waitForFunction(() => window.lvptSheetSnapshot && window.lvptSheetSnapshot.state === 'ready');
  await page.locator('[data-command-view="overview"]').click();
  await page.waitForFunction(() => /coverage is incomplete/i.test(document.querySelector('#overviewOperating')?.innerText || ''));
  const incompleteEmpty = await page.locator('#commandView').innerText();
  assert.match(incompleteEmpty, /Incomplete/i);
  assert.match(incompleteEmpty, /coverage is incomplete/i);
  assert.equal(/No open client balance was returned on the complete ledger read/i.test(incompleteEmpty), false);
  assert.equal(/No open vendor bill was returned on the complete ledger read/i.test(incompleteEmpty), false);
  assert.match(incompleteEmpty, /No unresolved finance exceptions were returned on the complete operating-picture read/i);

  mode = 'picture-incomplete-zeros';
  await openHub(1280, 800);
  await page.waitForFunction(() => window.lvptSheetSnapshot && window.lvptSheetSnapshot.state === 'ready');
  await page.locator('[data-command-view="overview"]').click();
  await page.waitForFunction(() => /no field-level completeness list was supplied/i.test(document.querySelector('#overviewLedger')?.innerText || ''));
  const incompleteZeros = await page.locator('#overviewLedger').innerText();
  assert.match(incompleteZeros, /Ledger-recorded receipts[\s\S]*Incomplete/i);
  assert.match(incompleteZeros, /Ledger outstanding[\s\S]*Incomplete/i);
  assert.match(incompleteZeros, /Open vendor obligations[\s\S]*Incomplete/i);
  assert.match(incompleteZeros, /no field-level completeness list was supplied/i);
  assert.equal(incompleteZeros.includes('$0.00'), false);
  assert.equal(/\$0(\.00)?/.test(incompleteZeros), false);
  assert.equal(/No open client balance was returned on the complete ledger read/i.test(await page.locator('#overviewOperating').innerText()), false);

  mode = 'picture-incomplete-zeros-absent-fields';
  await openHub(1280, 800);
  await page.waitForFunction(() => window.lvptSheetSnapshot && window.lvptSheetSnapshot.state === 'ready');
  await page.locator('[data-command-view="overview"]').click();
  await page.waitForFunction(() => /incompleteFields was omitted/i.test(document.querySelector('#overviewLedger')?.innerText || ''));
  const incompleteZerosAbsent = await page.locator('#overviewLedger').innerText();
  assert.match(incompleteZerosAbsent, /Incomplete|Unavailable/i);
  assert.match(incompleteZerosAbsent, /incompleteFields was omitted/i);
  assert.equal(incompleteZerosAbsent.includes('$0.00'), false);
  assert.equal(/\$0(\.00)?/.test(incompleteZerosAbsent), false);

  mode = 'ready';
  await openHub(1280, 800);
  await page.waitForFunction(() => window.lvptSheetSnapshot && window.lvptSheetSnapshot.state === 'ready');
  afterReady = pictureGets;
  await page.locator('[data-command-view="overview"]').click();
  await page.waitForFunction(() => /\$500\.00/.test(document.querySelector('#overviewLedger')?.innerText || ''));
  await page.evaluate(() => { document.body.style.minHeight = '2400px'; });
  await page.waitForFunction(() => document.body.scrollHeight > 2000);
  await page.evaluate(() => window.scrollTo(0, 640));
  await page.waitForFunction(() => window.scrollY === 640);
  const listScroll = await page.evaluate(() => window.scrollY);
  await page.evaluate(() => document.querySelector('[data-open-task="task-1"]').click());
  const taskView = await page.locator('#commandView').innerText();
  assert.match(taskView, /Priority open tasks/);
  assert.match(taskView, /Send proposal/);
  assert.match(taskView, /Synthetic Lead/);
  assert.equal(await page.locator('[data-open-task-panel="task-1"]').count(), 1);
  assert.match(await page.locator('[data-view-event="evt-lead"]').innerText(), /View associated event/i);
  assert.equal(await page.locator('[data-close-task]').count(), 1);
  assert.equal(taskView.includes('Floor Lead'), false);
  assert.equal(taskView.includes('$222'), false);
  assert.equal(await page.locator('#eventEditorPanel').isVisible(), false);
  assert.equal(await page.locator('#reportCenter').isVisible(), false);
  assert.equal(page.url().includes('Synthetic'), false);
  assert.equal(page.url().includes('sms-review'), false);
  await page.goBack();
  await page.waitForFunction(() => !document.querySelector('[data-open-task-panel="task-1"]'));
  assert.match(await page.locator('#commandView').innerText(), /Priority open tasks/);
  assert.equal(page.url().includes('sms-review'), false);
  await page.goForward();
  await page.waitForFunction(() => document.querySelector('[data-open-task-panel="task-1"]'));
  await page.evaluate(() => document.querySelector('[data-view-event="evt-lead"]').click());
  await page.waitForFunction(() => {
    const record = document.querySelector('[data-record-event="evt-lead"]');
    return record && record.innerText.includes('$111.00');
  });
  assert.equal(await page.locator('[data-record-event="evt-lead"]').getAttribute('data-record-event'), 'evt-lead');
  assert.equal(page.url().includes('sms-review'), false);
  const record = await page.locator('[data-record-event="evt-lead"]').innerText();
  assert.match(record, /Synthetic Lead/);
  assert.match(record, /Lead Host/);
  assert.match(record, /Send proposal/);
  assert.match(record, /\$111\.00/);
  assert.match(record, /1 document rows on this event/);
  assert.equal(await page.locator('[data-record-event="evt-lead"] [data-task-id="task-1"]').count(), 1);
  assert.equal(await page.locator('[data-record-event="evt-lead"] [data-task-id="task-floor"]').count(), 0);
  assert.equal(record.includes('Floor Lead'), false);
  assert.equal(record.includes('$222'), false);
  assert.equal(record.includes('Synthetic Booked'), false);
  assert.equal(record.includes('Confirm the floor'), false);
  assert.equal(record.includes('Active-Only Floor Diagram'), false);
  assert.equal(record.includes('2 document rows'), false);
  const editorText = await page.locator('#eventEditorPanel').textContent();
  assert.match(editorText, /Synthetic Lead/);
  assert.equal(await page.locator('#eventEditorPanel [data-field="company"]').inputValue(), 'Lead Client Co');
  assert.equal(await page.locator('#eventEditorPanel [data-field="contactName"]').inputValue(), 'Synthetic Guest');
  assert.equal(await page.locator('#eventEditorPanel [data-field="eventName"]').inputValue(), 'Synthetic Lead');
  assert.equal(editorText.includes('Floor Lead'), false);
  assert.equal(editorText.includes('$222'), false);
  assert.equal(editorText.includes('Synthetic Booked'), false);
  assert.equal(await page.locator('#eventEditorPanel [data-field="company"]').inputValue().then((value) => value.includes('Synthetic Active')), false);
  assert.equal(page.url().includes('Synthetic'), false);
  await assertSelectedEventReportIsolation({
    eventName: 'Synthetic Lead',
    company: 'Lead Client Co',
    documentName: 'Lead-Only Proposal Packet',
    staffName: 'Lead Host',
    taskTitle: 'Send proposal',
    forbidden: ['Synthetic Booked', 'Synthetic Active', 'Floor Lead', 'Active-Only Floor Diagram', 'Confirm the floor', 'Active-Only Invoice Scan']
  });
  await page.evaluate(() => document.querySelector('[data-back-list]').click());
  await page.waitForFunction(() => document.querySelector('[data-open-task-panel="task-1"]'));
  assert.match(await page.locator('#commandView').innerText(), /Priority open tasks/);
  assert.equal(page.url().includes('sms-review'), false);
  assert.match(page.url(), /\/v2\//);
  await page.evaluate(() => document.querySelector('[data-close-task]').click());
  await page.waitForFunction(() => !document.querySelector('[data-open-task-panel]') && /Priority open tasks/.test(document.querySelector('#commandView').innerText));
  assert.equal(page.url().includes('sms-review'), false);
  assert.match(page.url(), /\/v2\//);
  assert.equal(await page.locator('#ownerSignInLink').count(), 1);
  const restored = await page.evaluate(() => window.scrollY);
  assert.ok(Math.abs(restored - listScroll) < 80, `scroll ${restored} vs ${listScroll}`);
  await page.evaluate(() => { document.body.style.minHeight = ''; window.lvptOpenRecord('evt-active'); window.lvptOpenRecord('evt-lead'); });
  await page.waitForFunction(() => {
    const node = document.querySelector('[data-record-event]');
    return node && node.getAttribute('data-record-event') === 'evt-lead' && node.innerText.includes('$111.00') && !node.innerText.includes('$222');
  });
  const rapid = await page.locator('#commandView').innerText();
  assert.equal(rapid.includes('Floor Lead'), false);
  assert.equal(rapid.includes('Synthetic Booked'), false);
  await page.evaluate(() => window.lvptOpenRecord('not-a-real-event'));
  const missing = await page.locator('#commandView').innerText();
  assert.match(missing, /Unavailable/);
  assert.match(missing, /not in the signed-in/);
  assert.equal(missing.includes('Synthetic Lead'), false);
  assert.equal(missing.includes('Synthetic Booked'), false);
  assert.equal(missing.includes('Lead Client Co'), false);
  assert.equal(missing.includes('$111'), false);
  assert.equal(missing.includes('$222'), false);
  assert.equal(await page.locator('[data-record-event]').count(), 0);
  assert.match(await page.locator('#eventEditorPanel').innerText(), /No event selected/);
  await page.evaluate(() => window.lvptOpenTask('evt-lead', 'not-a-real-task'));
  const missingTask = await page.locator('#commandView').innerText();
  assert.match(missingTask, /That task is not in the signed-in snapshot/);
  assert.match(missingTask, /Another event was not opened/);
  assert.equal(await page.locator('[data-open-task-panel="not-a-real-task"]').count(), 0);
  assert.equal(await page.locator('[data-open-task-panel]').count(), 0);
  assert.equal(await page.locator('[data-record-event]').count(), 0);
  assert.equal(await page.locator('#eventEditorPanel [data-field="company"]').count(), 0);
  await page.locator('[data-command-view="overview"]').click();
  await page.locator('[data-command-view="pipeline"]').click();
  await page.waitForTimeout(200);
  const pipelineText = await page.locator('#commandView').innerText();
  assert.match(pipelineText, /Synthetic Lead/);
  assert.match(pipelineText, /Synthetic Awaiting/);
  assert.match(pipelineText, /Synthetic Unverified/);
  assert.match(pipelineText, /Cost not recorded/);
  assert.match(pipelineText, /Recorded target/);
  assert.match(pipelineText, /Unpriced/);
  assert.equal(pipelineText.includes('Synthetic Processing'), false);
  await page.locator('[data-command-view="active"]').click();
  await page.waitForTimeout(200);
  const activeText = await page.locator('#commandView').innerText();
  assert.match(activeText, /Synthetic Booked/);
  assert.match(activeText, /Synthetic Processing/);
  assert.equal(activeText.includes('Synthetic Awaiting'), false);
  await page.locator('[data-command-view="archive"]').click();
  await page.waitForTimeout(200);
  const past = await page.locator('#commandView').innerText();
  assert.match(past, /Synthetic Past/);
  assert.match(past, /Synthetic Declined/);
  assert.match(past, /Synthetic Closed/);
  assert.match(past, /Outcome needs review/);
  assert.match(past, /Past date/);
  await page.locator('[data-command-view="proposals"]').click();
  await page.waitForTimeout(200);
  const proposals = await page.locator('#commandView').innerText();
  assert.match(proposals, /Recorded on the sheet/);
  assert.match(proposals, /Historical reference, not verified/);
  assert.equal(proposals.includes('Proposal Active'), false);
  await page.locator('#proposalSearch').fill('zzz-filter');
  await page.locator('[data-open-event="evt-lead"]').click();
  await page.locator('[data-back-list]').click();
  await page.waitForFunction(() => document.querySelector('#proposalSearch'));
  assert.equal(await page.locator('#proposalSearch').inputValue(), 'zzz-filter');
  assert.match(await page.locator('#commandView').innerText(), /Recorded on the sheet/);
  await page.locator('[data-command-view="followup"]').click();
  await page.waitForTimeout(200);
  assert.match(await page.locator('#commandView').innerText(), /Send proposal/);
  await page.locator('[data-command-view="finance"]').click();
  await page.waitForTimeout(300);
  await page.waitForFunction(() => /Invoice by invoice|Event finance/i.test(document.querySelector('#commandView')?.innerText || ''));
  await page.evaluate(() => document.querySelector('#commandView [data-view-record="evt-lead"]').click());
  await page.waitForFunction(() => document.querySelector('[data-record-event="evt-lead"]'));
  const fromFinance = await page.locator('[data-record-event="evt-lead"]').innerText();
  assert.match(fromFinance, /Discovery and setup/);
  assert.match(fromFinance, /\$111\.00/);
  assert.equal(fromFinance.includes('$222'), false);
  assert.match(fromFinance, /No save control/);
  assert.equal(page.url().includes('sms-review'), false);
  await page.goBack();
  await page.waitForFunction(() => !document.querySelector('[data-record-event]') && /Invoice by invoice|Event finance/i.test(document.querySelector('#commandView')?.innerText || ''));
  assert.equal(page.url().includes('sms-review'), false);
  assert.equal(await page.locator('[data-command-view="finance"].active').count(), 1);
  await page.goForward();
  await page.waitForFunction(() => document.querySelector('[data-record-event="evt-lead"]'));
  await page.evaluate(() => document.querySelector('[data-back-list]').click());
  await page.waitForFunction(() => !document.querySelector('[data-record-event]') && /Invoice by invoice|Event finance/i.test(document.querySelector('#commandView')?.innerText || ''));
  assert.equal(page.url().includes('sms-review'), false);
  assert.match(page.url(), /\/v2\//);
  await page.locator('[data-command-view="communications"]').click();
  await page.waitForTimeout(300);
  assert.equal(pictureGets, afterReady);
  const communicationsReady = await page.locator('#commandView').innerText();
  assert.match(communicationsReady, /Owner session/);
  assert.match(communicationsReady, /4 stored Gmail Activity rows/);
  assert.match(communicationsReady, /2 unique thread ids/);
  assert.match(communicationsReady, /Synthetic header/);
  assert.equal(communicationsReady.includes('no new threads'), false);
  await page.locator('[data-command-view="action"]').click();
  await page.waitForTimeout(400);
  await page.waitForFunction(() => document.querySelectorAll('.action-card').length > 0);
  assert.match(await page.locator('#commandView').innerText(), /Synthetic Lead/);
  assert.match(await page.locator('#commandView').innerText(), /Due /);
  assert.match(await page.locator('#commandView').innerText(), /not a conversion rate/);
  assert.match(await page.locator('#commandView').innerText(), /does not approve, send, or confirm receipt/i);
  assert.equal(await page.locator('#commandView [data-decision="approve"]').count(), 0);
  assert.equal(await page.locator('#commandView button:text-is("Approve"), #commandView button:text-is("Send"), #commandView button:text-is("Confirm receipt")').count(), 0);
  const defaultVisible = await page.evaluate(() => [...document.querySelectorAll('.action-card')].filter((card) => !card.hidden).map((card) => ({
    id: card.getAttribute('data-record-id'),
    name: card.querySelector('strong')?.textContent || '',
    classification: card.getAttribute('data-classification'),
    priority: card.getAttribute('data-priority'),
    dueState: card.getAttribute('data-due-state'),
    overdue: card.getAttribute('data-overdue')
  })));
  assert.deepEqual(defaultVisible.map((row) => row.id), [
    'event:evt-reply',
    'event:evt-lead',
    'event:evt-today',
    'sms:sms-amb',
    'event:evt-bad-date',
    'event:evt-reorder',
    'event:evt-missing-due'
  ]);
  assert.equal(defaultVisible.some((row) => row.classification === 'resolved'), false);
  assert.equal(defaultVisible.some((row) => row.classification === 'vendor_obligation'), false);
  assert.equal(await page.locator('.action-card[data-record-id="event:evt-lead"]').count(), 1);
  assert.equal(await page.locator('.action-card[data-record-id="event:evt-reorder"]').count(), 1);
  assert.equal(await page.locator('.action-card[data-record-id="event:evt-clash"]').count(), 0);
  assert.equal(await page.locator('.action-card[data-record-id="event:evt-twin-recipient"]').count(), 0);
  assert.equal(await page.locator('.action-card[data-record-id="event:evt-twin-evidence"]').count(), 0);
  assert.equal(await page.locator('.action-card[data-record-id="event:evt-ws-evidence"]').count(), 0);
  assert.equal(await page.locator('.action-card[data-record-id="event:evt-draft-body"]').count(), 0);
  assert.equal(await page.locator('.action-card:has-text("Synthetic Missing Id")').count(), 0);
  assert.equal(await page.locator('[data-action-integrity="conflict"]').count(), 1);
  assert.equal(await page.locator('[data-conflict-id="event:evt-clash"]').count(), 1);
  assert.equal(await page.locator('[data-conflict-id="event:evt-twin-recipient"]').count(), 1);
  assert.equal(await page.locator('[data-conflict-id="event:evt-twin-evidence"]').count(), 1);
  assert.equal(await page.locator('[data-conflict-id="event:evt-ws-evidence"]').count(), 1);
  assert.equal(await page.locator('[data-conflict-id="event:evt-draft-body"]').count(), 1);
  assert.match(await page.locator('[data-action-integrity="conflict"]').innerText(), /Integrity review required/i);
  assert.match(await page.locator('[data-action-integrity="conflict"]').innerText(), /5 conflicting action ids/i);
  assert.equal(await page.locator('[data-action-integrity="missing-id"]').count(), 1);
  assert.equal(await page.locator('[data-missing-id="(missing:1)"]').count(), 1);
  assert.match(await page.locator('[data-action-integrity="missing-id"]').innerText(), /Synthetic Missing Id/);
  assert.match(await page.locator('[data-action-integrity="missing-id"]').innerText(), /missing a stable id/i);
  assert.equal(await page.locator('.action-card[data-record-id="event:evt-lead"]').getAttribute('data-due-state'), 'overdue');
  assert.equal(await page.locator('.action-card[data-record-id="event:evt-lead"]').getAttribute('data-overdue'), 'yes');
  assert.equal(await page.locator('.action-card[data-record-id="event:evt-today"]').getAttribute('data-due-state'), 'due');
  assert.equal(await page.locator('.action-card[data-record-id="event:evt-today"]').getAttribute('data-overdue'), 'no');
  assert.equal(await page.locator('.action-card[data-record-id="event:evt-missing-due"]').getAttribute('data-due-state'), 'undated');
  assert.equal(await page.locator('.action-card[data-record-id="event:evt-missing-due"]').getAttribute('data-overdue'), 'no');
  assert.equal(await page.locator('.action-card[data-record-id="event:evt-bad-date"]').getAttribute('data-due-state'), 'unknown');
  assert.equal(await page.locator('.action-card[data-record-id="event:evt-bad-date"]').getAttribute('data-overdue'), 'no');
  assert.match(await page.locator('.action-card[data-record-id="event:evt-bad-date"]').innerText(), /Due date invalid or unavailable/);
  const orderedNames = await page.evaluate(() => [...document.querySelectorAll('.action-card')].map((card) => card.querySelector('strong')?.textContent || ''));
  assert.ok(orderedNames.indexOf('Synthetic Reply Needed') < orderedNames.indexOf('Synthetic Lead'));
  assert.ok(orderedNames.indexOf('Synthetic Lead') < orderedNames.indexOf('Ambiguous SMS Match'));
  assert.equal(await page.locator('[data-action-filter="action"][aria-pressed="true"]').count(), 1);
  assert.equal(await page.locator('#actionSearch').getAttribute('aria-label'), 'Search Action Required');
  const leadReviewHref = await page.locator('.action-card[data-record-id="event:evt-lead"] [data-review-link]').getAttribute('href');
  assert.match(leadReviewHref || '', /record=event%3Aevt-lead/);
  assert.match(leadReviewHref || '', /#inboxReviewTitle$/);
  assert.match(await page.locator('.action-card[data-record-id="event:evt-lead"] [data-review-link]').getAttribute('aria-label') || '', /Does not approve or send/i);
  assert.equal(await page.locator('#commandView').innerText().then((text) => text.includes('PRIVATE_FIXTURE_BODY_MUST_STAY_COLLAPSED')), false);
  await page.locator('.action-card[data-record-id="event:evt-lead"] .action-evidence summary').click();
  await page.waitForFunction(() => {
    const details = document.querySelector('.action-card[data-record-id="event:evt-lead"] .action-evidence');
    return details && details.open === true;
  });
  const evidenceText = await page.locator('.action-card[data-record-id="event:evt-lead"] .action-evidence').innerText();
  assert.match(evidenceText, /open task is overdue/i);
  assert.match(evidenceText, /task-1/);
  assert.match(evidenceText, /Stored addresses are not verified recipients/i);
  assert.match(evidenceText, /stored\.lead@example\.test/);
  assert.equal(evidenceText.includes('PRIVATE_FIXTURE_BODY_MUST_STAY_COLLAPSED'), false);
  assert.match(evidenceText, /Message text stays collapsed here/);
  assert.equal(/verified recipient/i.test(evidenceText) && !/not verified recipients/i.test(evidenceText), false);
  await page.locator('[data-action-filter="resolved"]').click();
  await page.waitForFunction(() => {
    const visible = [...document.querySelectorAll('.action-card')].filter((card) => !card.hidden);
    return visible.length === 1 && visible[0].getAttribute('data-classification') === 'resolved';
  });
  assert.match(await page.locator('.action-card:not([hidden])').innerText(), /Synthetic Resolved/);
  await page.locator('[data-action-filter="reply_required"]').click();
  await page.waitForFunction(() => {
    const visible = [...document.querySelectorAll('.action-card')].filter((card) => !card.hidden);
    return visible.length === 1 && /Synthetic Reply Needed/i.test(visible[0].textContent || '');
  });
  await page.locator('[data-action-filter="due"]').click();
  await page.waitForFunction(() => {
    const visible = [...document.querySelectorAll('.action-card')].filter((card) => !card.hidden);
    return visible.length === 2
      && visible.every((card) => card.getAttribute('data-due-state') === 'due' || card.getAttribute('data-due-state') === 'overdue')
      && visible.some((card) => card.getAttribute('data-record-id') === 'event:evt-lead')
      && visible.some((card) => card.getAttribute('data-record-id') === 'event:evt-today');
  });
  assert.equal(await page.locator('.action-card[data-record-id="event:evt-missing-due"]:not([hidden])').count(), 0);
  assert.equal(await page.locator('.action-card[data-record-id="event:evt-bad-date"]:not([hidden])').count(), 0);
  const sortedBefore = await page.evaluate(() => [...document.querySelectorAll('.action-card')].map((card) => card.querySelector('strong')?.textContent || ''));
  await page.locator('[data-action-filter="all"]').click();
  await page.locator('#actionSearch').fill('Synthetic Lead');
  await page.waitForFunction(() => {
    const visible = [...document.querySelectorAll('.action-card')].filter((card) => !card.hidden);
    return visible.length > 0 && visible.every((card) => /Synthetic Lead/i.test(card.textContent || ''));
  });
  await page.evaluate(() => { document.body.style.minHeight = '2400px'; window.scrollTo(0, 420); });
  await page.waitForFunction(() => window.scrollY >= 400);
  const actionScroll = await page.evaluate(() => window.scrollY);
  await page.evaluate(() => document.querySelector('#commandView [data-view-record="evt-lead"]').click());
  await page.waitForFunction(() => document.querySelector('[data-record-event="evt-lead"]'));
  assert.match(await page.locator('[data-record-event="evt-lead"]').innerText(), /Send proposal/);
  assert.equal(page.url().includes('sms-review'), false);
  const rememberedActionScroll = await page.evaluate(() => window.lvptActionUi ? window.lvptActionUi.scroll : 0);
  assert.ok(Math.abs(rememberedActionScroll - actionScroll) < 80, `remembered scroll ${rememberedActionScroll} vs ${actionScroll}`);
  await page.evaluate(() => document.querySelector('[data-back-list]').click());
  await page.waitForFunction(() => document.querySelector('#actionSearch') && document.querySelectorAll('.action-card').length > 0);
  assert.equal(await page.locator('#actionSearch').inputValue(), 'Synthetic Lead');
  assert.equal(await page.locator('[data-action-filter="all"].active').count(), 1);
  const sortedAfter = await page.evaluate(() => [...document.querySelectorAll('.action-card')].map((card) => card.querySelector('strong')?.textContent || ''));
  assert.deepEqual(sortedAfter, sortedBefore);
  await page.waitForFunction((y) => Math.abs(window.scrollY - y) < 80, rememberedActionScroll);
  assert.equal(page.url().includes('sms-review'), false);
  assert.match(page.url(), /\/v2\//);
  await page.locator('#actionSearch').fill('zzzz-no-match');
  await page.waitForFunction(() => document.querySelectorAll('.action-card:not([hidden])').length === 0);
  const searchScroll = await page.evaluate(() => window.scrollY);
  await page.evaluate(() => document.querySelector('#actionFilterClear').click());
  assert.equal(await page.locator('#actionSearch').inputValue(), '');
  assert.match(await page.locator('#commandView').innerText(), /Synthetic Lead/);
  assert.ok(Math.abs(await page.evaluate(() => window.scrollY) - searchScroll) < 80);
  await page.locator('[data-command-view="health"]').click();
  await page.waitForTimeout(400);
  const health = await page.locator('#commandView').innerText();
  assert.equal(health.includes('AUTH REQUIRED'), false);
  assert.equal(await overflow(), true);

  const tenViews = [
    ['overview', /Confirmed upcoming|Priority open tasks/],
    ['action', /One inbox|Synthetic Lead|Action required/i],
    ['pipeline', /Synthetic Lead|Pipeline/i],
    ['active', /Synthetic Booked|Active/i],
    ['archive', /Synthetic Past|Past/i],
    ['proposals', /Proposal Library|Recorded on the sheet/i],
    ['followup', /Send proposal|Follow-Up|follow/i],
    ['finance', /Invoice by invoice|Event finance/i],
    ['communications', /Gmail|Owner session|Communications/i],
    ['health', /Source health|What ran/i]
  ];
  await page.setViewportSize({ width: 375, height: 800 });
  for (const [viewId, marker] of tenViews) {
    await page.locator(`[data-command-view="${viewId}"]`).click();
    await page.waitForTimeout(250);
    assert.equal(await page.locator(`[data-command-view="${viewId}"].active`).count(), 1);
    assert.match(await page.locator('#commandView').innerText(), marker);
    assert.equal(page.url().includes('sms-review'), false);
    assert.equal(await overflow(), true);
    assert.equal(await page.locator('#commandNav').isVisible(), true);
  }
  await page.locator('[data-command-view="overview"]').click();
  await page.locator('[data-open-task="task-1"]').click();
  assert.match(await page.locator('#commandView').innerText(), /Priority open tasks/);
  assert.equal(await page.locator('[data-open-task-panel="task-1"]').count(), 1);
  assert.match(await page.locator('[data-view-event="evt-lead"]').innerText(), /View associated event/i);
  assert.equal(await page.locator('#eventEditorPanel').isVisible(), false);
  assert.equal(page.url().includes('sms-review'), false);
  await page.waitForTimeout(200);
  assert.equal(await overflow(), true);
  assert.equal(await page.locator('#commandNav').isVisible(), true);
  await page.locator('[data-view-event="evt-lead"]').click();
  await page.waitForFunction(() => document.querySelector('[data-record-event="evt-lead"]'));
  await page.locator('[data-back-list]').click();
  await page.waitForFunction(() => document.querySelector('[data-open-task-panel="task-1"]') || /Priority open tasks/.test(document.querySelector('#commandView')?.innerText || ''));
  assert.equal(page.url().includes('sms-review'), false);

  mode = 'delay-ledger';
  releaseLedger = null;
  await openHub(1280, 800);
  await page.waitForFunction(() => window.lvptSheetSnapshot && window.lvptSheetSnapshot.state === 'ready');
  await page.locator('[data-command-view="overview"]').click();
  await page.waitForFunction(() => {
    const ledger = document.querySelector('#overviewLedger')?.innerText || '';
    const operating = document.querySelector('#overviewOperating')?.innerText || '';
    return /still loading/i.test(ledger) && /waiting on the shared operating-picture/i.test(operating);
  });
  const delayedOverview = await page.locator('#commandView').innerText();
  assert.match(delayedOverview, /still loading/i);
  assert.match(delayedOverview, /not zero/i);
  assert.equal(delayedOverview.includes('$500.00'), false);
  assert.equal(delayedOverview.includes('$200.00'), false);
  assert.equal(/No open client balance was returned on the complete ledger read/i.test(delayedOverview), false);
  assert.equal(/No open vendor bill was returned on the complete ledger read/i.test(delayedOverview), false);
  assert.match(delayedOverview, /Recorded targets/i);
  assert.match(delayedOverview, /Not added to priced line items/i);
  assert.match(delayedOverview, /Confirmed upcoming/);
  await page.evaluate(() => window.lvptOpenRecord('evt-lead'));
  await page.waitForFunction(() => {
    const node = document.querySelector('[data-record-event="evt-lead"] [data-record-ledger]');
    return node && /still loading/i.test(node.textContent || '');
  });
  const waitingLead = await page.locator('[data-record-event="evt-lead"] [data-record-ledger]').innerText();
  assert.equal(waitingLead.includes('222'), false);
  assert.equal(waitingLead.includes('111'), false);
  assert.equal(waitingLead.includes('Floor Lead'), false);
  await page.evaluate(() => window.lvptOpenRecord('evt-active'));
  await page.waitForFunction(() => {
    const node = document.querySelector('[data-record-event="evt-active"] [data-record-ledger]');
    return node && /still loading/i.test(node.textContent || '');
  });
  assert.equal(await page.locator('[data-record-event="evt-lead"]').count(), 0);
  const waiting = await page.locator('[data-record-event="evt-active"] [data-record-ledger]').innerText();
  assert.equal(waiting.includes('222'), false);
  assert.equal(waiting.includes('111'), false);
  assert.equal(waiting.includes('Lead Host'), false);
  for (let attempt = 0; attempt < 50 && !releaseLedger; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 20));
  releaseLedger();
  releaseLedger = null;
  await page.waitForFunction(() => (document.querySelector('[data-record-event="evt-active"] [data-record-ledger]')?.innerText || '').includes('$222.00'));
  const delayed = await page.locator('[data-record-event="evt-active"]').innerText();
  assert.match(delayed, /Synthetic Booked/);
  assert.match(delayed, /Floor Lead/);
  assert.match(delayed, /\$222\.00/);
  assert.match(delayed, /2 document rows on this event/);
  assert.equal(await page.locator('[data-record-event="evt-active"] [data-task-id="task-floor"]').count(), 1);
  assert.equal(await page.locator('[data-record-event="evt-active"] [data-task-id="task-1"]').count(), 0);
  assert.equal(delayed.includes('$111'), false);
  assert.equal(delayed.includes('Lead Host'), false);
  assert.equal(delayed.includes('Send proposal'), false);
  assert.equal(delayed.includes('Lead Client Co'), false);
  assert.equal(delayed.includes('Lead-Only Proposal Packet'), false);
  assert.equal(delayed.includes('1 document rows'), false);
  assert.equal(await page.locator('#eventEditorPanel [data-field="company"]').inputValue(), 'Synthetic Active');
  assert.equal(await page.locator('#eventEditorPanel [data-field="eventName"]').inputValue(), 'Synthetic Booked');
  assert.equal(await page.locator('#eventEditorPanel [data-field="company"]').inputValue().then((value) => value.includes('Lead Client')), false);
  await assertSelectedEventReportIsolation({
    eventName: 'Synthetic Booked',
    company: 'Synthetic Active',
    documentName: 'Active-Only Floor Diagram',
    staffName: 'Floor Lead',
    taskTitle: 'Confirm the floor',
    forbidden: ['Synthetic Lead', 'Lead Client Co', 'Lead-Only Proposal Packet', 'Lead Host', 'Send proposal']
  });

  mode = 'unavailable';
  await page.locator('#refreshSheetBtn').click();
  await page.waitForFunction(() => window.lvptSheetSnapshot && window.lvptSheetSnapshot.state === 'unavailable');
  await page.locator('[data-command-view="pipeline"]').click();
  await page.waitForTimeout(200);
  const failed = await page.locator('#commandView').innerText();
  assert.match(failed, /unavailable/);
  assert.equal(failed.includes('No deals'), false);
  assert.equal(failed.includes('Synthetic Lead'), false);

  mode = 'empty';
  await page.locator('#commandView #retrySnapshotBtn').click();
  await page.waitForFunction(() => window.lvptSheetSnapshot && window.lvptSheetSnapshot.state === 'empty');
  await page.locator('[data-command-view="active"]').click();
  await page.waitForTimeout(200);
  assert.match(await page.locator('#commandView').innerText(), /returned no events/);

  mode = 'malformed';
  await page.locator('#refreshSheetBtn').click();
  await page.waitForFunction(() => window.lvptSheetSnapshot && window.lvptSheetSnapshot.state === 'unavailable');
  assert.match(await page.locator('#snapshotBanner').innerText(), /unavailable/);
  const asset = await page.request.get(`http://127.0.0.1:${port}/v2/js/roster-nium.js`);
  assert.equal(asset.status(), 404);
  mode = 'ready';
  await openHub(1280, 800);
  await page.waitForFunction(() => window.lvptSheetSnapshot && window.lvptSheetSnapshot.state === 'ready');
  await page.evaluate(() => window.lvptOpenRecord('evt-lead'));
  await page.waitForFunction(() => document.querySelector('[data-record-event="evt-lead"]'));
  assert.match(await page.locator('[data-record-event="evt-lead"]').innerText(), /Send proposal/);
  assert.equal(await page.locator('#eventEditorPanel [data-field="company"]').inputValue(), 'Lead Client Co');
  await page.evaluate(() => {
    const center = document.getElementById('reportCenter');
    if (center) center.hidden = false;
    const button = document.querySelector('[data-generate-report="post"]');
    if (button) button.click();
  });
  await page.waitForFunction(() => {
    const output = document.getElementById('generatedReportOutput');
    return output && !output.hidden
      && /Post-Event & After-Action Report/.test(output.innerText || '')
      && /Lead-Only Proposal Packet/.test(output.innerText || '')
      && /Lead Client Co/.test(output.innerText || '');
  });
  const privateReportBeforeAuthLoss = await page.locator('#generatedReportOutput').innerText();
  assert.match(privateReportBeforeAuthLoss, /Synthetic Lead/);
  assert.match(privateReportBeforeAuthLoss, /Lead Client Co/);
  assert.match(privateReportBeforeAuthLoss, /Lead-Only Proposal Packet/);
  assert.match(privateReportBeforeAuthLoss, /Lead Host/);
  assert.match(privateReportBeforeAuthLoss, /Send proposal/);
  assert.equal(privateReportBeforeAuthLoss.includes('Synthetic Booked'), false);
  assert.equal(privateReportBeforeAuthLoss.includes('Active-Only Floor Diagram'), false);
  mode = 'unauthorized';
  await page.locator('#refreshSheetBtn').click();
  await page.waitForFunction(() => window.lvptSheetSnapshot && window.lvptSheetSnapshot.state === 'auth-required');
  assert.match(await page.locator('#snapshotBanner').innerText(), /Owner sign-in required/);
  const cleared = await page.locator('body').innerText();
  assert.equal(cleared.includes('Synthetic Lead'), false);
  assert.equal(cleared.includes('Lead Client Co'), false);
  assert.equal(cleared.includes('Floor Lead'), false);
  assert.equal(cleared.includes('Lead-Only Proposal Packet'), false);
  assert.equal(cleared.includes('$111'), false);
  assert.equal(cleared.includes('$222'), false);
  assert.equal(await page.locator('[data-record-event]').count(), 0);
  assert.equal(await page.locator('#eventEditorPanel [data-field="company"]').count(), 0);
  if (await page.locator('#generatedReportOutput').count()) {
    assert.equal(await page.locator('#generatedReportOutput').innerText(), '');
  }
  assert.equal(cleared.includes('Post-Event & After-Action Report'), false);
  assert.match(await page.locator('#eventEditorPanel').innerText(), /No event selected/);
  assert.equal(posts.some((path) => path === '/api/sync/events' && false), false);
  assert.equal(posts.includes('/api/sync/events'), false);
  assert.equal(posts.includes('/api/gmail/send'), false);
  console.log('Command Center browser regression passed.');
} finally {
  await browser.close();
  server.close();
}
