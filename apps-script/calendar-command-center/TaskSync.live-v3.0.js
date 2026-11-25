/**
 * LVPT Task -> Google Calendar synchronizer (v3.0, 2026-11-11).
 *
 * REPLACE ONLY TaskSync.gs in the "LVPT Calendar Command Center" project.
 * Preserve Code.gs, other project files, script properties, and the existing
 * runLVPTTaskSync trigger. The updated trigger executes this code automatically.
 *
 * Root cause fixed: v2 set RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR for
 * every overdue task. V3 NEVER CREATES RECURRING TASK REMINDERS.
 *
 * Safety:
 * - Tasks tab is the authoritative status list, NOT a Gmail/SMS message.
 * - Search all three business task calendars for both script-managed and
 *   already-created manual/internal one-time reminders before creating anything.
 * - Preserve calendar meetings, client invitations and non-task events.
 * - Never touch a reminder without an exact Task ID and internal marker.
 * - Convert any legacy, script-owned recurring reminder to one-time.
 * - Do not create a duplicate when a manual one-time reminder already exists.
 * - Remove task-only reminders for completed or no-longer-active tasks.
 * - Preview makes NO WRITES. The live function uses a script lock.
 * - No Gmail/SMS reading, no email sending, no client invitations.
 *
 * Apps Script Advanced Google Calendar service (Calendar API) must stay enabled.
 * Run previewLVPTTaskSync() in the editor to see planned actions first.
 */

const LVPT_SYNC_CONFIG = {
  spreadsheetId: '1oHoVdD5CDcEreyRnB7cEvYfp6wWEgAmf04BwrktkMYs',
  ownerEmail: 'book@pokertraininglasvegas.com',
  reminderTimeZone: 'America/New_York',
  calendarNames: {
    sales: 'LVPT | Sales & Follow-Ups',
    proposals: 'LVPT | Proposals & Holds',
    operations: 'LVPT | Operations & Payments'
  },
  managedTag: 'taskSyncV1', // Keep original tag to find/remove v2 reminders.
  scanMaxPages: 12,
  scanPageSize: 250
};

function previewLVPTTaskSync() {
  return lvptSyncTasks_(true);
}

function runLVPTTaskSync() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('Another LVPT task sync is running.');
  try { return lvptSyncTasks_(false); }
  finally { lock.releaseLock(); }
}

function lvptSyncTasks_(preview) {
  const cfg = LVPT_SYNC_CONFIG;
  const account = String(CalendarApp.getDefaultCalendar().getId()).toLowerCase();
  if (account !== cfg.ownerEmail) {
    throw new Error('Wrong account: ' + account + '. Expected ' + cfg.ownerEmail);
  }
  const calendars = {};
  for (const [category, name] of Object.entries(cfg.calendarNames)) {
    const owned = CalendarApp.getOwnedCalendarsByName(name);
    if (owned.length !== 1) throw new Error('Expected one owned calendar: ' + name);
    calendars[category] = owned[0].getId();
  }
  const allowedCalendarIds = Object.values(calendars);

  const ss = SpreadsheetApp.openById(cfg.spreadsheetId);
  const tasksSheet = ss.getSheetByName('Tasks');
  const eventsSheet = ss.getSheetByName('Events');
  if (!tasksSheet || !eventsSheet || tasksSheet.getLastRow() < 2) {
    throw new Error('Tasks or Events spreadsheet data is unavailable.');
  }
  const values = tasksSheet.getRange(1, 1, tasksSheet.getLastRow(), 10).getDisplayValues();
  const headers = values.shift().map(x => String(x).trim());
  const columns = {};
  ['task_id', 'event_id', 'task', 'due_date', 'priority', 'status', 'notes']
    .forEach(key => {
      const index = headers.indexOf(key);
      if (index < 0) throw new Error('Missing Tasks column: ' + key);
      columns[key] = index;
    });
  const companies = {};
  const events = eventsSheet.getRange(
    1, 1, Math.max(eventsSheet.getLastRow(), 1), 3).getDisplayValues();
  for (const row of events.slice(1)) {
    if (row[0]) companies[row[0]] = row[2] || row[1] || row[0];
  }

  const now = new Date();
  const today = Utilities.formatDate(now, cfg.reminderTimeZone, 'yyyy-MM-dd');
  const tasks = new Map();
  const wanted = new Map();
  let undated = 0, invalidDates = 0;
  const issues = [];

  for (const row of values) {
    const id = String(row[columns.task_id] || '').trim();
    if (!id) continue;
    if (!/^[\w.:-]{6,180}$/.test(id)) {
      throw new Error('Unsafe Tasks task_id: ' + id.slice(0, 70));
    }
    if (tasks.has(id)) throw new Error('Duplicate Tasks task_id: ' + id);
    const status = String(row[columns.status] || '').trim().toLowerCase();
    const task = {id, status, notes: String(row[columns.notes] || '')};
    tasks.set(id, task);
    const knownActive = ['open','in progress','waiting','blocked','pending','on hold'];
    const knownComplete = ['complete','completed','resolved','done'];
    if (knownComplete.indexOf(status) >= 0) continue;
    if (knownActive.indexOf(status) < 0) {
      issues.push('Unknown status, preserving Calendar reminder: ' + id + ' (' + status + ')');
      continue;
    }

    const rawDue = String(row[columns.due_date] || '').trim();
    if (!rawDue) { undated++; issues.push('Undated task, preserve current reminder: ' + id); continue; }
    const due = lvptParseTaskDate_(rawDue);
    if (!due) {
      invalidDates++;
      issues.push('Invalid task date, preserve current reminder: ' + id + ' (' + rawDue + ')');
      console.log('SKIP INVALID TASK DATE: ' + id + ' (' + rawDue + ')');
      continue;
    }
    const action = String(row[columns.task] || '').trim();
    if (!action) throw new Error('Open task has no title: ' + id);
    const eventId = String(row[columns.event_id] || '').trim();
    const company = companies[eventId] || eventId || 'LVPT';
    const category = lvptTaskCategory_(action);
    const dueAtNine = lvptAtNine_(due);
    const overdue = due < today || dueAtNine.getTime() <= now.getTime();
    const firstDay = overdue ? lvptNextReminderDay_(now) : due;
    const start = lvptAtNine_(firstDay);
    const end = new Date(start.getTime() + 15 * 60000);
    const notes = task.notes;
    const gmail = (notes.match(/https:\/\/mail\.google\.com\/mail\/[^\s|]+/) || [])[0] || '';
    const description = [
      'LVPT INTERNAL ACTION REMINDER',
      'Action: ' + action,
      'Original due date: ' + due,
      'Priority: ' + (row[columns.priority] || 'Not specified'),
      'Task ID: ' + id,
      'Client/Event ID: ' + eventId,
      'Tracker: https://docs.google.com/spreadsheets/d/' + cfg.spreadsheetId + '/edit',
      gmail ? 'Gmail thread: ' + gmail : '',
      'Set Status to Complete in the LVPT Tasks tab when the specific task is done.'
    ].filter(Boolean).join('\n');
    const body = {
      summary: ((overdue ? 'OVERDUE' : 'ACTION') + ' — ' + company + ' — ' + action).slice(0, 220),
      description,
      start: {dateTime: start.toISOString(), timeZone: cfg.reminderTimeZone},
      end: {dateTime: end.toISOString(), timeZone: cfg.reminderTimeZone},
      reminders: {
        useDefault: false,
        overrides: overdue ? [{method:'popup',minutes:30}] :
          [{method:'popup',minutes:1440},{method:'popup',minutes:30}]
      },
      extendedProperties: {private: {
        lvptManaged: cfg.managedTag,
        lvptTaskId: id,
        lvptDueDate: due
      }}
      // IMPORTANT: No recurrence, regardless of overdue status.
    };
    wanted.set(id, {id, due, overdue, calendarId: calendars[category], body});
  }

  // Preflight ALL calendars before modifying any events. The query finds
  // manually created owner reminders too, which v2's tag-only search missed.
  const entriesByKey = new Map();
  for (const calendarId of allowedCalendarIds) {
    for (const ev of lvptListCalendarEvents_(calendarId,
      {privateExtendedProperty: 'lvptManaged=' + cfg.managedTag})) {
      lvptCollectTaskReminder_(entriesByKey, calendarId, ev, true, cfg);
    }
    for (const ev of lvptListCalendarEvents_(calendarId, {q: 'LVPT INTERNAL'})) {
      lvptCollectTaskReminder_(entriesByKey, calendarId, ev, false, cfg);
    }
  }
  // A canonical event stored in Tasks notes may not appear in a Calendar
  // text search. Verify the event by exact ID before trusting the reference.
  for (const task of tasks.values()) {
    const references = lvptCanonicalReferences_(task.notes, allowedCalendarIds);
    for (const ref of references) {
      const key = ref.calendarId + '::' + ref.eventId;
      if (entriesByKey.has(key)) continue;
      let ev;
      try { ev = Calendar.Events.get(ref.calendarId, ref.eventId); }
      catch (error) {
        if (/\b(?:404|not found)\b/i.test(String(error))) continue;
        throw new Error('Calendar lookup failed for ' + task.id + ': ' + error);
      }
      if (ev && ev.status !== 'cancelled') {
        lvptCollectTaskReminder_(entriesByKey, ref.calendarId, ev, false, cfg);
      }
    }
  }

  const byTask = new Map();
  for (const reminder of entriesByKey.values()) {
    if (!byTask.has(reminder.taskId)) byTask.set(reminder.taskId, []);
    byTask.get(reminder.taskId).push(reminder);
  }
  const changes = [];
  let unchanged = 0;

  // Exact task-level reconciliation, not event/deal closure.
  for (const [id, task] of tasks) {
    const reminders = (byTask.get(id) || []).slice().sort(lvptReminderPriority_);
    const target = wanted.get(id);
    if (!target) {
      // Delete ONLY when the authoritative task status proves completion.
      // Missing/invalid due dates and unrecognized active statuses must not
      // make an otherwise legitimate reminder disappear.
      if (['complete','completed','resolved','done'].indexOf(task.status)>=0) {
        for (const reminder of reminders) changes.push({kind:'remove', id, reminder});
      } else {
        unchanged += reminders.length;
      }
      continue;
    }
    if (!reminders.length) {
      changes.push({kind:'create', id, target});
      continue;
    }
    const preferred = reminders[0];
    for (const duplicate of reminders.slice(1)) {
      changes.push({kind:'remove_duplicate', id, reminder: duplicate});
    }
    if (preferred.recurring) {
      changes.push({kind:'replace_recurring', id, prior: preferred, target});
    } else if (preferred.managed) {
      const previousDue = ((preferred.event.extendedProperties || {}).private || {}).lvptDueDate ||
        ((preferred.event.description || '').match(/Original due date: (\d{4}-\d{2}-\d{2})/) || [])[1] || '';
      const move = preferred.calendarId !== target.calendarId;
      const changedDue = previousDue !== target.due;
      if (move || changedDue) {
        changes.push({kind:'replace_managed', id, prior:preferred, target});
      } else if (preferred.event.summary !== target.body.summary ||
        preferred.event.description !== target.body.description ||
        !lvptSameReminders_(preferred.event.reminders, target.body.reminders)) {
        changes.push({kind:'patch_managed', id, prior:preferred, target});
      } else {
        unchanged++;
      }
    } else {
      // Existing manually created one-time owner reminder is already enough.
      // Do not overwrite its time, description, or status.
      unchanged++;
    }
  }
  // If an old script-created event outlived a deleted Tasks row, remove only
  // the exact authenticated task reminder. Never infer that client event ended.
  for (const [id, reminders] of byTask) {
    if (!tasks.has(id)) {
      for (const reminder of reminders) {
        if (reminder.managed) changes.push({kind:'remove_orphan_managed', id, reminder});
        else issues.push('Unmatched manual task reminder; preserved: ' + id);
      }
    }
  }

  const counts = {create:0, replaceRecurring:0, replaceManaged:0,
    patchManaged:0, remove:0, removeDuplicate:0, removeOrphanManaged:0};
  for (const c of changes) {
    const name = c.kind.replace(/_([a-z])/g, (_,v)=>v.toUpperCase());
    counts[name] = (counts[name] || 0) + 1;
    console.log((preview ? 'WOULD ' : '') + c.kind.toUpperCase() + ' — ' + c.id);
  }
  if (!preview) {
    for (const c of changes) {
      if (c.kind === 'create') {
        Calendar.Events.insert(c.target.body, c.target.calendarId, {sendUpdates:'none'});
      } else if (c.kind === 'replace_recurring' || c.kind === 'replace_managed') {
        // Insert FIRST, then remove existing task reminder. A failure leaves
        // a duplicate to reconcile next time instead of losing the reminder.
        Calendar.Events.insert(c.target.body, c.target.calendarId, {sendUpdates:'none'});
        Calendar.Events.remove(c.prior.calendarId, c.prior.event.id, {sendUpdates:'none'});
      } else if (c.kind === 'patch_managed') {
        Calendar.Events.patch({
          summary: c.target.body.summary,
          description: c.target.body.description,
          reminders: c.target.body.reminders,
          extendedProperties: c.target.body.extendedProperties,
          recurrence: []
        }, c.prior.calendarId, c.prior.event.id, {sendUpdates:'none'});
      } else if (c.kind === 'remove' || c.kind === 'remove_duplicate' ||
                 c.kind === 'remove_orphan_managed') {
        Calendar.Events.remove(c.reminder.calendarId, c.reminder.event.id,
          {sendUpdates:'none'});
      }
    }
  }
  const report = {
    preview:Boolean(preview), totalTaskRows:tasks.size, datedActiveTasks:wanted.size,
    noDueDate:undated, invalidDates, unchanged, counts,
    issues:issues.slice(0, 40),
    note:'Only verified internal task reminders. No recurrence or external attendees.'
  };
  console.log(JSON.stringify(report));
  if (preview) console.log('PREVIEW ONLY: zero Calendar writes.');
  return report;
}

/** Read all master events matching the selector, with finite pagination. */
function lvptListCalendarEvents_(calendarId, selector) {
  const result = [];
  const seenTokens = new Set();
  let pageToken = '';
  for (let page = 0; page < LVPT_SYNC_CONFIG.scanMaxPages; page++) {
    const args = Object.assign({singleEvents:false,showDeleted:false,
      maxResults:LVPT_SYNC_CONFIG.scanPageSize}, selector);
    if (pageToken) args.pageToken = pageToken;
    const batch = Calendar.Events.list(calendarId, args);
    if (!batch || !Array.isArray(batch.items || [])) {
      throw new Error('Calendar listing returned unusable data for ' + calendarId);
    }
    result.push(...(batch.items || []));
    const next = String(batch.nextPageToken || '');
    if (!next) return result;
    if (seenTokens.has(next)) throw new Error('Repeated Calendar pagination token.');
    seenTokens.add(next);
    pageToken = next;
  }
  throw new Error('Calendar page limit reached: ' + calendarId + '. No writes made.');
}

/** Only accept unmistakable owner-only task reminders in known calendars. */
function lvptCollectTaskReminder_(index, calendarId, ev, fromManagedQuery, cfg) {
  if (!ev || !ev.id || ev.status === 'cancelled' || ev.recurringEventId) return;
  // Some Calendar clients visually wrap / flatten the description, even
  // splitting the label into 'Task\nID'. Normalize whitespace for matching.
  const description = String(ev.description || '');
  const normalizedDescription = description.replace(/\s+/g, ' ').trim();
  const ownMarker = /^LVPT INTERNAL (?:ACTION REMINDER|ONE-TIME OWNER REMINDER)/i.test(normalizedDescription);
  const taskMatch = normalizedDescription.match(/\bTask\s+ID:\s*([A-Za-z0-9_.:-]{6,180})/i);
  const taskId = taskMatch && taskMatch[1].replace(/\.$/, '');
  const ownerOnly = !ev.attendees || ev.attendees.length === 0;
  const props = ((ev.extendedProperties || {}).private || {});
  const managed = props.lvptManaged === cfg.managedTag;
  if (fromManagedQuery && (!managed || !ownMarker || !taskMatch ||
      props.lvptTaskId !== taskId || !ownerOnly)) {
    throw new Error('Managed reminder is inconsistent/has attendees: ' + ev.id);
  }
  if (!ownMarker || !taskMatch || !ownerOnly) return;
  if (!/^(?:ACTION|OVERDUE)\s+—\s+/.test(String(ev.summary || ''))) return;
  const id = taskId;
  if (managed && props.lvptTaskId !== id) {
    throw new Error('Managed Task ID mismatch on Calendar event ' + ev.id);
  }
  index.set(calendarId + '::' + ev.id, {
    taskId:id, calendarId, event:ev,
    managed, recurring:Array.isArray(ev.recurrence)&&ev.recurrence.length>0
  });
}

/** Prefer an existing human-created one-time reminder to script-managed ones. */
function lvptReminderPriority_(a,b) {
  const rank = x => (x.recurring ? 4:0) + (x.managed ? 2:0);
  const delta = rank(a) - rank(b);
  return delta || String(a.event.id).localeCompare(String(b.event.id));
}

/** Read canonical IDs from Tasks notes; never trust them without API lookup. */
function lvptCanonicalReferences_(notes, allowedCalendarIds) {
  const refs=[];
  const text=String(notes||'');
  const re=/canonical_calendar_id=([^\s;,]+)\s*;\s*canonical_event_id=([A-Za-z0-9_-]+)/g;
  let m;
  while ((m=re.exec(text))) {
    const calId=m[1],eventId=m[2];
    if (allowedCalendarIds.indexOf(calId)>=0) {
      refs.push({calendarId:calId,eventId});
    }
  }
  // Keep at most three recent references per task: older ones may be stale.
  return refs.slice(-3);
}

function lvptTaskCategory_(text) {
  if (/invoice|payment|deposit|balance|vendor|ship|print|production|venue|staff|equipment|receipt|travel|reconcil|felt|room|\bav\b|documents?|upload|contract/i.test(text)) return 'operations';
  if (/proposal|quote|hold|scope selection/i.test(text)) return 'proposals';
  return 'sales';
}

function lvptParseTaskDate_(input) {
  const us = input.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const iso = us ? us[3]+'-'+us[1].padStart(2,'0')+'-'+us[2].padStart(2,'0') :
    /^\d{4}-\d{2}-\d{2}$/.test(input) ? input : '';
  if (!iso) return '';
  const date = new Date(iso+'T12:00:00Z');
  return !isNaN(date.getTime()) && date.toISOString().slice(0,10)===iso ? iso : '';
}

function lvptAtNine_(day) {
  return Utilities.parseDate(day+' 09:00', LVPT_SYNC_CONFIG.reminderTimeZone,
    'yyyy-MM-dd HH:mm');
}

function lvptNextReminderDay_(now) {
  const zone=LVPT_SYNC_CONFIG.reminderTimeZone;
  const today=Utilities.formatDate(now,zone,'yyyy-MM-dd');
  const earliest=lvptAtNine_(today).getTime()-40*60000;
  let d=new Date(today+'T12:00:00Z');
  if (d.getUTCDay()!==0 && d.getUTCDay()!==6 && now.getTime()<earliest) return today;
  do { d=new Date(d.getTime()+86400000); }
  while (d.getUTCDay()===0||d.getUTCDay()===6);
  return d.toISOString().slice(0,10);
}

function lvptSameReminders_(a,b) {
  function norm(r) {
    if (!r) return '';
    const overrides=(r.overrides||[]).map(x=>x.method+':'+x.minutes).sort();
    return String(r.useDefault)+'|'+overrides.join(',');
  }
  return norm(a)===norm(b);
}
