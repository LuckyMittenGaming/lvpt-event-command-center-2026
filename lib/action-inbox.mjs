const DECLINED = /^(declined|lost|closed lost|not moving forward)$/i;
const CANCELLED = /^(cancelled|canceled)$/i;
const CLOSED_WON = /^(closed won)$/i;
const COMPLETED = /^(completed|complete|resolved|done)$/i;
const UNKNOWN_CLOSURE = /^closed$/i;
const BOOKED = /^(deposit paid|booked|pre-production|event day|paid in full)$/i;
const INVOICE = /^invoice sent$/i;
const OPEN_STAGE = /^(new lead|needs discovery|quote needed|proposal sent)$/i;
const VENDOR = /\b(venetian|palazzo|elevated billing|elevated|dealer team)\b/i;
const PRIVATE_TYPE = /private lesson|private coaching|private poker|executive workshop|coaching/i;
const CORPORATE_TYPE = /corporate|casino night|enterprise|company event/i;
const EMAIL = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;

function text(value, max = 180) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function recorded(value, max = 180) {
  const clean = text(value, max);
  if (!clean || clean === '0' || /^(not provided|tbd|unknown|n\/a)$/i.test(clean)) return '';
  return clean;
}

function centsFromQuote(quote) {
  if (!Array.isArray(quote)) return null;
  let cents = 0;
  let priced = false;
  for (const line of quote) {
    const quantity = Number(line && line.quantity);
    const price = Number(line && line.unitPrice);
    if (!Number.isFinite(quantity) || !Number.isFinite(price) || quantity <= 0 || price <= 0) continue;
    cents += Math.round(quantity * price * 100);
    priced = true;
  }
  return priced ? cents : null;
}

function qualification(event) {
  const guest = Number(event && event.guestCount);
  const target = Number(event && event.setup && event.setup.targetQuote);
  const quoteCents = centsFromQuote(event && event.quote);
  const estimatedValueCents = quoteCents != null ? quoteCents : (Number.isFinite(target) && target > 0 ? Math.round(target * 100) : null);
  const fields = {
    contactName: recorded(event && event.contactName),
    company: recorded(event && event.company),
    email: recorded(event && event.contactEmail),
    phone: recorded(event && event.contactPhone),
    eventDate: recorded(event && event.eventDate),
    guestCount: Number.isFinite(guest) && guest > 0 ? guest : null,
    eventType: recorded(event && event.eventType),
    budget: recorded(event && event.setup && event.setup.budgetRange),
    venue: recorded(event && event.venue),
    leadSource: recorded(event && event.leadSource),
    estimatedValueCents,
    stage: recorded(event && event.status),
    pipelineStage: pipelineStage(event && event.status)
  };
  const missing = [];
  if (!fields.contactName) missing.push('contact name');
  if (!fields.company) missing.push('company');
  if (!fields.email) missing.push('email');
  if (!fields.phone) missing.push('phone');
  if (!fields.eventDate) missing.push('event date');
  if (fields.guestCount == null) missing.push('guest count');
  if (!fields.eventType) missing.push('event type');
  if (!fields.budget) missing.push('budget');
  if (!fields.venue) missing.push('venue preference');
  if (!fields.leadSource) missing.push('lead source');
  if (fields.estimatedValueCents == null) missing.push('estimated opportunity value');
  if (!fields.stage) missing.push('pipeline stage');
  let inquiry = '';
  if (PRIVATE_TYPE.test(fields.eventType)) inquiry = 'private';
  else if (CORPORATE_TYPE.test(fields.eventType) || (fields.company && fields.eventType)) inquiry = 'corporate';
  return { ...fields, missing, inquiry };
}

function pipelineStage(status) {
  const raw = recorded(status);
  if (!raw) return 'unknown';
  if (DECLINED.test(raw)) return 'declined';
  if (CANCELLED.test(raw)) return 'cancelled';
  if (CLOSED_WON.test(raw)) return 'closed_won';
  if (UNKNOWN_CLOSURE.test(raw)) return 'unknown_closure';
  if (COMPLETED.test(raw)) return 'completed';
  if (BOOKED.test(raw)) return 'booked';
  if (INVOICE.test(raw)) return 'invoice_sent';
  if (OPEN_STAGE.test(raw)) return 'open';
  return 'unknown';
}

const PRESERVED_STAGES = new Set(['declined', 'cancelled', 'completed', 'closed_won', 'unknown_closure']);

function stageBucket(stage) {
  if (stage === 'declined') return 'declined';
  if (stage === 'cancelled') return 'cancelled';
  if (stage === 'closed_won' || stage === 'completed') return 'resolved';
  if (stage === 'unknown_closure') return 'unknown_closure';
  if (stage === 'booked') return 'booked';
  if (stage === 'invoice_sent') return 'invoice_sent';
  if (stage === 'open') return 'new_inquiry';
  return 'unknown';
}

function acquisitionOf(event) {
  const utm = [recorded(event && (event.utmSource || event.utm_source)), recorded(event && (event.utmCampaign || event.utm_campaign))].filter(Boolean);
  if (utm.length) return { kind: 'utm', label: utm.join(' / ') };
  const raw = recorded(event && event.leadSource);
  if (!raw) return { kind: 'unknown', label: '' };
  if (/^(organic|seo|organic search)$/i.test(raw)) return { kind: 'organic', label: raw };
  if (/referral/i.test(raw)) return { kind: 'referral', label: raw };
  if (/\bform\b/i.test(raw)) return { kind: 'form', label: raw };
  return { kind: 'recorded', label: raw };
}

function proposalLink(event) {
  const raw = text(event && (event.proposalUrl || event.proposalLink), 300);
  if (!raw || /\s/.test(raw)) return '';
  let url;
  try { url = new URL(raw); } catch { return ''; }
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) return '';
  return url.toString();
}

function isoAt(value) {
  const raw = recorded(value, 40);
  if (!raw) return '';
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : '';
}

function refreshActivity(record) {
  record.timeline = record.timeline.slice().sort((left, right) => {
    const a = isoAt(left.at);
    const b = isoAt(right.at);
    if (a && b && a !== b) return a < b ? 1 : -1;
    if (a) return -1;
    if (b) return 1;
    return 0;
  });
  if (PRESERVED_STAGES.has(record.pipelineStage)) return;
  const dated = record.timeline.filter((item) => isoAt(item.at));
  if (!dated.length) return;
  const newest = isoAt(dated[0].at);
  const ties = dated.filter((item) => isoAt(item.at) === newest);
  const directions = new Set(ties.map((item) => item.direction || ''));
  const partial = ties.some((item) => item.partial === true);
  if (partial || directions.size !== 1 || directions.has('')) {
    record.activityDirection = 'unknown';
    if (record.bucket === 'awaiting_response') record.bucket = stageBucket(record.pipelineStage);
    return;
  }
  const item = ties[0];
  record.lastActivity = newest;
  record.activityDirection = item.direction;
  if (item.source === 'SMS' || item.source === 'Gmail') record.channel = item.source;
  if (item.direction === 'inbound') record.bucket = 'awaiting_response';
  else if (record.bucket === 'awaiting_response') record.bucket = stageBucket(record.pipelineStage);
}

function smsDirection(thread) {
  return directionOf(thread && (thread.newestDirection || thread.latestDirection));
}

function vendorText(...parts) {
  return VENDOR.test(parts.map((part) => text(part, 240)).join(' '));
}

function directionOf(value) {
  const raw = text(value, 40).toLowerCase();
  if (raw === 'incoming' || raw === 'inbound' || raw === 'received') return 'inbound';
  if (raw === 'outgoing' || raw === 'outbound' || raw === 'sent') return 'outbound';
  return '';
}

function timelineItem(entry) {
  const summary = recorded(entry.summary) || recorded(entry.subject) || '';
  return {
    at: recorded(entry.at) || recorded(entry.date),
    source: recorded(entry.source) || 'Record',
    direction: directionOf(entry.direction),
    summary,
    partial: entry.partial === true,
    contentAvailable: Boolean(summary) && entry.contentAvailable === true
  };
}

export function collapseDuplicateIds(rows, keys) {
  const identity = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
  const grouped = new Map();
  for (const row of rows || []) {
    const id = row && identity(row.id);
    if (!id) continue;
    const list = grouped.get(id) || [];
    list.push(row);
    grouped.set(id, list);
  }
  const kept = [];
  const conflicts = [];
  for (const [id, list] of grouped) {
    const signature = (row) => keys.map((key) => identity(row[key])).join('|');
    if (new Set(list.map(signature)).size > 1) {
      conflicts.push(id);
      continue;
    }
    kept.push(list[0]);
  }
  return { rows: kept, conflicts };
}

function openTasks(tasks) {
  const grouped = new Map();
  for (const task of tasks || []) {
    const id = recorded(task && task.id);
    if (!id) continue;
    const taskStage = pipelineStage(task.status);
    if (taskStage === 'completed' || taskStage === 'declined' || taskStage === 'cancelled' || taskStage === 'closed_won') continue;
    const row = {
      id,
      eventId: recorded(task.eventId),
      title: recorded(task.title),
      dueDate: recorded(task.dueDate),
      status: recorded(task.status) || 'Open'
    };
    const list = grouped.get(id) || [];
    list.push(row);
    grouped.set(id, list);
  }
  const rows = [];
  const conflicts = [];
  for (const [id, list] of grouped) {
    const signature = (row) => [row.eventId, row.title, row.dueDate, row.status].join('|');
    if (new Set(list.map(signature)).size > 1) {
      conflicts.push(id);
      continue;
    }
    rows.push(list[0]);
  }
  return { rows, conflicts };
}

function taskTiming(task, today) {
  if (!task.dueDate || !/^\d{4}-\d{2}-\d{2}$/.test(task.dueDate) || !/^\d{4}-\d{2}-\d{2}$/.test(today)) return 'undated';
  if (task.dueDate < today) return 'overdue';
  if (task.dueDate === today) return 'due';
  return 'scheduled';
}

export function prepareDraft(record) {
  const fields = record && record.qualification ? record.qualification : {};
  const email = EMAIL.test(fields.email || '') ? fields.email : '';
  const lines = ['Hello,'];
  if (fields.contactName) lines[0] = `Hello ${fields.contactName},`;
  lines.push('', 'Thank you for contacting Las Vegas Poker Training.');
  const known = [];
  if (fields.company) known.push(`Company: ${fields.company}`);
  if (fields.eventType) known.push(`Event type: ${fields.eventType}`);
  if (fields.eventDate) known.push(`Date: ${fields.eventDate}`);
  if (fields.guestCount != null) known.push(`Guests: ${fields.guestCount}`);
  if (fields.venue) known.push(`Venue: ${fields.venue}`);
  if (fields.budget) known.push(`Budget recorded: ${fields.budget}`);
  if (known.length) lines.push('', 'Here is what is already recorded:', ...known);
  if (fields.missing && fields.missing.length) {
    lines.push('', `Still needed before a proposal: ${fields.missing.join(', ')}.`);
  }
  lines.push('', 'Matt Carpenter', 'Las Vegas Poker Training', '3753 Howard Hughes Parkway, UNIT 200, Las Vegas, NV 89119', '616-745-7148');
  return {
    recipient: email,
    recipientRecorded: Boolean(email),
    recipientVerified: false,
    readyToApprove: false,
    readyToSend: false,
    auditRecorded: false,
    body: lines.join('\n'),
    sent: false,
    sendEnabled: false
  };
}

export function buildActionInbox(input) {
  const today = text(input && input.today, 10) || new Date().toISOString().slice(0, 10);
  const taskLedger = openTasks(input && input.tasks);
  const tasks = taskLedger.rows;
  const tasksByEvent = new Map();
  for (const task of tasks) {
    if (!task.eventId) continue;
    const list = tasksByEvent.get(task.eventId) || [];
    list.push(task);
    tasksByEvent.set(task.eventId, list);
  }
  const records = [];
  const seenThreads = new Set();

  const eventGroups = new Map();
  for (const event of input && input.events || []) {
    const id = recorded(event.id);
    if (!id) continue;
    const list = eventGroups.get(id) || [];
    list.push(event);
    eventGroups.set(id, list);
  }
  const eventConflicts = [];
  const acceptedEvents = [];
  for (const [id, list] of eventGroups) {
    const signature = (event) => [pipelineStage(event.status), recorded(event.status), recorded(event.eventName)].join('|');
    if (new Set(list.map(signature)).size > 1) {
      eventConflicts.push(id);
      continue;
    }
    acceptedEvents.push(list[0]);
  }
  for (const event of acceptedEvents) {
    const id = recorded(event.id);
    if (!id) continue;
    const info = qualification(event);
    const mail = Array.isArray(event.emailActivity) ? event.emailActivity : [];
    const timeline = mail.map((item) => {
      const threadId = recorded(item.threadId) || recorded(item.id);
      if (threadId) seenThreads.add(threadId);
      const summary = recorded(item.snippet) || recorded(item.subject);
      return timelineItem({
        at: item.date,
        source: 'Gmail',
        direction: item.direction,
        summary,
        contentAvailable: Boolean(recorded(item.snippet))
      });
    }).filter((item) => item.at || item.summary);
    timeline.sort((a, b) => (a.at < b.at ? 1 : -1));
    const last = timeline[0] || null;
    const eventTasks = (tasksByEvent.get(id) || []).slice().sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    const nextTask = eventTasks.find((task) => taskTiming(task, today) === 'overdue') || eventTasks[0];
    const nextAction = recorded(event.nextAction) || (nextTask && nextTask.title) || '';
    const stage = info.pipelineStage;
    let bucket = stageBucket(stage);
    if (!PRESERVED_STAGES.has(stage)) {
      if (last && last.direction === 'inbound') bucket = 'awaiting_response';
      else if (nextTask && taskTiming(nextTask, today) === 'overdue') bucket = 'follow_up_due';
      else if (last && isoAt(last.at) && isoAt(last.at).slice(0, 10) >= shiftDate(today, -14) && stage === 'open') bucket = 'new_activity';
    }
    const acquired = acquisitionOf(event);
    const record = {
      id: `event:${id}`,
      eventId: id,
      eventName: recorded(event.eventName),
      bucket,
      pipelineStage: stage,
      acquisitionKind: acquired.kind,
      acquisitionLabel: acquired.label,
      channel: last ? 'Gmail' : 'unknown',
      proposalLink: proposalLink(event),
      source: acquired.label || 'Unknown',
      contact: info.contactName,
      company: info.company,
      lastActivity: (last && last.at) || info.eventDate,
      nextAction,
      review: false,
      vendor: false,
      qualification: info,
      timeline,
      taskIds: eventTasks.map((task) => task.id)
    };
    refreshActivity(record);
    records.push(record);
  }

  for (const thread of input && input.gmailThreads || []) {
    const threadId = recorded(thread.threadId) || recorded(thread.id);
    if (!threadId || seenThreads.has(threadId)) continue;
    seenThreads.add(threadId);
    const summary = recorded(thread.subject);
    const vendor = vendorText(thread.subject, thread.from, thread.domainKey);
    records.push({
      id: `gmail:${threadId}`,
      eventId: '',
      eventName: '',
      bucket: vendor ? 'vendor' : 'unassigned',
      pipelineStage: 'unknown',
      acquisitionKind: 'unknown',
      acquisitionLabel: '',
      channel: 'Gmail',
      proposalLink: '',
      source: 'Unknown',
      contact: '',
      company: '',
      lastActivity: recorded(thread.lastMessageAt),
      nextAction: vendor ? 'Keep with vendor operations. This is not a sales lead.' : 'Review this mailbox thread before assigning an event.',
      review: !vendor,
      vendor,
      qualification: emptyQualification(),
      timeline: [timelineItem({
        at: thread.lastMessageAt,
        source: 'Gmail',
        direction: thread.lastDirection,
        summary,
        contentAvailable: false
      })],
      taskIds: []
    });
  }

  for (const message of input && input.rcsMessages || []) {
    const providerId = recorded(message.googleMessageId) || recorded(message.providerId);
    const conversation = recorded(message.conversationId) || providerId;
    if (!providerId || !conversation || seenThreads.has(`rcs-provider:${providerId}`)) continue;
    seenThreads.add(`rcs-provider:${providerId}`);
    const at = recorded(message.messageAt) || (Number(message.timestampMs) ? new Date(Number(message.timestampMs)).toISOString() : '');
    const key = `rcs:${conversation}`;
    let record = records.find((row) => row.id === key);
    const item = timelineItem({
      at,
      source: 'RCS',
      direction: message.direction,
      summary: '',
      contentAvailable: false
    });
    if (!record) {
      const test = message.label === 'TEST';
      record = {
        id: key,
        eventId: '',
        eventName: '',
        bucket: 'unassigned',
        pipelineStage: 'unknown',
        acquisitionKind: 'unknown',
        acquisitionLabel: '',
        channel: 'RCS',
        proposalLink: '',
        source: 'Unknown',
        contact: test ? 'TEST' : '',
        company: '',
        lastActivity: at,
        nextAction: test
          ? 'Synthetic RCS test. Do not reply. It is not a lead and it is not merged with SMS.'
          : 'No phone is stored for this Google Messages conversation, so it is not matched to an event.',
        review: true,
        vendor: false,
        qualification: emptyQualification(),
        timeline: [],
        taskIds: [],
        providerIds: []
      };
      records.push(record);
    }
    if (!record.providerIds.includes(providerId)) {
      record.providerIds.push(providerId);
      record.timeline.push(item);
    }
    if (at && (!record.lastActivity || at > record.lastActivity)) record.lastActivity = at;
  }

  for (const thread of input && input.smsThreads || []) {
    const key = recorded(thread.threadKey);
    if (!key) continue;
    if (thread.match === 'exact' && recorded(thread.eventId)) {
      const event = records.find((row) => row.eventId === thread.eventId);
      if (event) {
        event.timeline.push(timelineItem({
          at: thread.newestAt,
          source: 'SMS',
          direction: smsDirection(thread),
          summary: '',
          partial: thread.partial === true || thread.coverage === 'partial',
          contentAvailable: false
        }));
        refreshActivity(event);
        continue;
      }
    }
    const ambiguous = thread.match === 'ambiguous';
    records.push({
      id: `sms:${key}`,
      eventId: '',
      eventName: '',
      bucket: 'unassigned',
      pipelineStage: 'unknown',
      acquisitionKind: 'unknown',
      acquisitionLabel: '',
      channel: 'SMS',
      proposalLink: '',
      source: 'Unknown',
      contact: '',
      company: '',
      lastActivity: recorded(thread.newestAt),
      nextAction: ambiguous
        ? 'More than one event matches this conversation. Choose the event before a reply.'
        : 'No event contact phone matched this conversation.',
      review: true,
      vendor: false,
      qualification: emptyQualification(),
      timeline: [timelineItem({
        at: thread.newestAt,
        source: 'SMS',
        direction: smsDirection(thread),
        summary: '',
        contentAvailable: false
      })],
      taskIds: [],
      candidateEventIds: Array.isArray(thread.candidateEventIds) ? thread.candidateEventIds.slice(0, 8) : []
    });
  }

  const orphanTasks = tasks.filter((task) => !task.eventId || !records.some((row) => row.eventId === task.eventId));
  for (const task of orphanTasks) {
    records.push({
      id: `task:${task.id}`,
      eventId: task.eventId,
      eventName: '',
      bucket: taskTiming(task, today) === 'overdue' ? 'follow_up_due' : 'unknown',
      pipelineStage: 'unknown',
      acquisitionKind: 'unknown',
      acquisitionLabel: '',
      channel: 'unknown',
      proposalLink: '',
      source: 'Unknown',
      contact: '',
      company: '',
      lastActivity: task.dueDate,
      nextAction: task.title || 'Open the task. No title was recorded.',
      review: !task.eventId,
      vendor: false,
      qualification: emptyQualification(),
      timeline: [],
      taskIds: [task.id]
    });
  }

  const withDrafts = records.map((record) => ({ ...record, draft: prepareDraft(record) }));
  const eventsOnly = withDrafts.filter((row) => String(row.id).startsWith('event:'));
  const denominator = eventsOnly.length;
  const stageCount = (stage) => eventsOnly.filter((row) => row.pipelineStage === stage).length;
  const sourceCount = (kind) => eventsOnly.filter((row) => row.acquisitionKind === kind).length;
  const explicitBooked = stageCount('booked');
  const counts = {
    actionRequired: withDrafts.filter((row) => !['resolved', 'vendor', 'declined', 'cancelled', 'unknown_closure'].includes(row.bucket)).length,
    review: withDrafts.filter((row) => row.review).length,
    readyForApproval: withDrafts.filter((row) => row.draft.auditRecorded === true && row.draft.recipientVerified === true).length,
    recordedRecipientUnverified: withDrafts.filter((row) => row.draft.recipientRecorded && row.draft.recipientVerified !== true).length,
    resolved: withDrafts.filter((row) => row.bucket === 'resolved').length,
    vendorExcluded: withDrafts.filter((row) => row.vendor).length
  };
  const pipeline = {
    denominator,
    stages: {
      open: stageCount('open'),
      booked: explicitBooked,
      invoiceSent: stageCount('invoice_sent'),
      declined: stageCount('declined'),
      cancelled: stageCount('cancelled'),
      completed: stageCount('completed'),
      closedWon: stageCount('closed_won'),
      unknownClosure: stageCount('unknown_closure'),
      unknown: stageCount('unknown')
    },
    sources: {
      organic: sourceCount('organic'),
      referral: sourceCount('referral'),
      form: sourceCount('form'),
      utm: sourceCount('utm'),
      recorded: sourceCount('recorded'),
      unknown: sourceCount('unknown')
    },
    excluded: {
      vendor: counts.vendorExcluded,
      unassigned: withDrafts.filter((row) => row.bucket === 'unassigned').length,
      ambiguous: withDrafts.filter((row) => Array.isArray(row.candidateEventIds) && row.candidateEventIds.length > 1).length,
      eventConflicts
    },
    duplicateEventsCountedOnce: [...eventGroups.entries()].filter(([id, list]) => list.length > 1 && !eventConflicts.includes(id)).map(([id]) => id),
    taskConflicts: taskLedger.conflicts,
    qualificationGaps: eventsOnly.filter((row) => row.qualification.missing.length > 0).length,
    dueFollowUps: tasks.filter((task) => taskTiming(task, today) === 'due').length,
    overdueFollowUps: tasks.filter((task) => taskTiming(task, today) === 'overdue').length,
    proposalLinks: eventsOnly.filter((row) => row.proposalLink).map((row) => ({ eventId: row.eventId, url: row.proposalLink })),
    conversion: denominator > 0 ? {
      numerator: explicitBooked,
      denominator,
      label: 'Explicit booked status divided by events on this list. Invoice sent, declined, cancelled, completed, closed won, unknown closure, and unknown are not booked.'
    } : null
  };
  return { sendEnabled: false, writesPerformed: false, today, counts, pipeline, records: withDrafts };
}

function emptyQualification() {
  return qualification({});
}

function shiftDate(day, delta) {
  const date = new Date(`${day}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return day;
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}
