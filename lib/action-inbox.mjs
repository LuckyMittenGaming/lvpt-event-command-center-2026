const CLOSED = /^(completed|complete|resolved|done|closed|closed won|closed lost|cancelled|canceled)$/i;
const BOOKED = /^(deposit paid|booked|pre-production|event day|invoice sent|paid in full)$/i;
const NEW_STAGE = /^(new lead|needs discovery|quote needed|proposal sent)$/i;
const VENDOR = /\b(venetian|palazzo|elevated billing|elevated|dealer team)\b/i;
const PRIVATE_TYPE = /private lesson|private coaching|private poker|executive workshop|coaching/i;
const CORPORATE_TYPE = /corporate|casino night|enterprise|company event/i;
const EMAIL = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;

function text(value, max = 180) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function recorded(value) {
  const clean = text(value, 180);
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
    stage: recorded(event && event.status)
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
    contentAvailable: Boolean(summary) && entry.contentAvailable === true
  };
}

function openTasks(tasks) {
  const seen = new Set();
  const rows = [];
  for (const task of tasks || []) {
    const id = recorded(task && task.id);
    if (!id || seen.has(id)) continue;
    if (CLOSED.test(recorded(task.status))) continue;
    seen.add(id);
    rows.push({
      id,
      eventId: recorded(task.eventId),
      title: recorded(task.title),
      dueDate: recorded(task.dueDate),
      status: recorded(task.status) || 'Open'
    });
  }
  return rows;
}

function due(task, today) {
  return Boolean(task.dueDate) && task.dueDate <= today;
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
    body: lines.join('\n'),
    sent: false,
    sendEnabled: false,
    actions: ['approve', 'make_changes', 'deny', 'edit_myself']
  };
}

export function buildActionInbox(input) {
  const today = text(input && input.today, 10) || new Date().toISOString().slice(0, 10);
  const tasks = openTasks(input && input.tasks);
  const tasksByEvent = new Map();
  for (const task of tasks) {
    if (!task.eventId) continue;
    const list = tasksByEvent.get(task.eventId) || [];
    list.push(task);
    tasksByEvent.set(task.eventId, list);
  }
  const records = [];
  const seenThreads = new Set();

  for (const event of input && input.events || []) {
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
    const nextTask = eventTasks.find((task) => due(task, today)) || eventTasks[0];
    const nextAction = recorded(event.nextAction) || (nextTask && nextTask.title) || '';
    let bucket = 'new_inquiry';
    if (CLOSED.test(info.stage)) bucket = 'resolved';
    else if (last && last.direction === 'inbound') bucket = 'awaiting_response';
    else if (nextTask && due(nextTask, today)) bucket = 'follow_up_due';
    else if (BOOKED.test(info.stage)) bucket = 'booked';
    else if (last && last.at && last.at.slice(0, 10) >= shiftDate(today, -14)) bucket = 'new_activity';
    else if (!NEW_STAGE.test(info.stage) && info.stage) bucket = 'booked';
    const record = {
      id: `event:${id}`,
      eventId: id,
      eventName: recorded(event.eventName),
      bucket,
      source: last ? 'Gmail' : 'Sheet',
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
      source: 'Gmail',
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
    if (!providerId || !conversation) continue;
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
        source: 'RCS',
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
    record.timeline.push(item);
    if (!record.providerIds.includes(providerId)) record.providerIds.push(providerId);
    if (at && (!record.lastActivity || at > record.lastActivity)) record.lastActivity = at;
  }

  for (const thread of input && input.smsThreads || []) {
    const key = recorded(thread.threadKey);
    if (!key) continue;
    if (thread.match === 'exact' && recorded(thread.eventId)) {
      const event = records.find((row) => row.eventId === thread.eventId);
      if (event) {
        event.timeline.unshift(timelineItem({
          at: thread.newestAt,
          source: 'SMS',
          direction: Number(thread.incoming) >= Number(thread.outgoing) ? 'inbound' : 'outbound',
          summary: '',
          contentAvailable: false
        }));
        if (thread.newestAt && (!event.lastActivity || thread.newestAt > event.lastActivity)) {
          event.lastActivity = thread.newestAt;
          event.source = 'SMS';
        }
        continue;
      }
    }
    const ambiguous = thread.match === 'ambiguous';
    records.push({
      id: `sms:${key}`,
      eventId: '',
      eventName: '',
      bucket: 'unassigned',
      source: 'SMS',
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
        direction: Number(thread.incoming) >= Number(thread.outgoing) ? 'inbound' : 'outbound',
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
      bucket: due(task, today) ? 'follow_up_due' : 'booked',
      source: 'Sheet',
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
  const counts = {
    actionRequired: withDrafts.filter((row) => !['resolved', 'vendor'].includes(row.bucket)).length,
    review: withDrafts.filter((row) => row.review).length,
    readyForApproval: withDrafts.filter((row) => row.draft.recipientRecorded && row.bucket !== 'vendor' && row.bucket !== 'resolved').length,
    resolved: withDrafts.filter((row) => row.bucket === 'resolved').length,
    vendorExcluded: withDrafts.filter((row) => row.vendor).length
  };
  return { sendEnabled: false, writesPerformed: false, today, counts, records: withDrafts };
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
