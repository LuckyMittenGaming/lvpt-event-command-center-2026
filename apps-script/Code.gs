var LVPT_DEFAULT_SPREADSHEET_ID = '1oHoVdD5CDcEreyRnB7cEvYfp6wWEgAmf04BwrktkMYs';
var LVPT_DEFAULT_DOCUMENTS_FOLDER_ID = '1VXJzvC1gxWtVVL8f8oI64G9uDH1yrp8g';
var LVPT_DEFAULT_BACKUP_FOLDER_ID = '1bUqZcKaTj1wPXMelHoMllk_LXf9ZYz8S';
var LVPT_BOOKING_EMAIL = 'book@pokertraininglasvegas.com';
var LVPT_MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

function doGet(e) {
  return lvptJson_({ ok: true, service: 'LVPT Event Command Center Apps Script Backend', message: 'Use the protected Vercel API bridge.' });
}

function doPost(e) {
  try {
    var payload = lvptParsePayload_(e);
    lvptAuthorize_(payload.secret);
    var action = String(payload.action || '').trim();
    if (action === 'status') return lvptJson_(lvptStatus_());
    if (action === 'listEvents') return lvptJson_({ ok: true, events: lvptListEvents_(), serverTime: new Date().toISOString() });
    if (action === 'saveAllEvents') return lvptJson_(lvptSaveAllEvents_(payload));
    if (action === 'uploadDocument') return lvptJson_(lvptUploadDocument_(payload));
    if (action === 'deleteDocument') return lvptJson_(lvptDeleteDocument_(payload));
    if (action === 'createBackup') return lvptJson_(lvptCreateBackup_());
    throw new Error('Unknown action: ' + action);
  } catch (error) {
    return lvptJson_({ ok: false, message: error && error.message ? error.message : String(error) });
  }
}

function lvptParsePayload_(e) {
  if (!e || !e.postData || !e.postData.contents) return {};
  try { return JSON.parse(e.postData.contents); }
  catch (error) { throw new Error('Request body must be valid JSON.'); }
}

function lvptJson_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}

function lvptProperties_() { return PropertiesService.getScriptProperties(); }

function lvptAuthorize_(supplied) {
  var expected = lvptProperties_().getProperty('LVPT_SHARED_SECRET') || '';
  if (!expected) throw new Error('LVPT_SHARED_SECRET is not configured in Apps Script Properties.');
  if (!supplied || String(supplied) !== expected) throw new Error('Unauthorized request.');
}

function lvptSpreadsheet_() {
  var spreadsheetId = lvptProperties_().getProperty('LVPT_SPREADSHEET_ID') || LVPT_DEFAULT_SPREADSHEET_ID;
  return SpreadsheetApp.openById(spreadsheetId);
}

function lvptDocumentsRoot_() {
  var folderId = lvptProperties_().getProperty('LVPT_DOCUMENTS_FOLDER_ID') || LVPT_DEFAULT_DOCUMENTS_FOLDER_ID;
  return DriveApp.getFolderById(folderId);
}

function lvptBackupRoot_() {
  var folderId = lvptProperties_().getProperty('LVPT_BACKUP_FOLDER_ID') || LVPT_DEFAULT_BACKUP_FOLDER_ID;
  return DriveApp.getFolderById(folderId);
}

function lvptStatus_() {
  var ss = lvptSpreadsheet_();
  var root = lvptDocumentsRoot_();
  return { ok: true, configured: true, spreadsheetId: ss.getId(), spreadsheetName: ss.getName(), documentsFolderId: root.getId(), documentsFolderName: root.getName(), email: LVPT_BOOKING_EMAIL, serverTime: new Date().toISOString() };
}

function lvptSheetObjects_(sheetName) {
  var sheet = lvptSpreadsheet_().getSheetByName(sheetName);
  if (!sheet) throw new Error('Missing sheet: ' + sheetName);
  var values = sheet.getDataRange().getValues();
  if (!values.length) return [];
  var headers = values[0].map(function (header) { return String(header || '').trim(); });
  var rows = [];
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var hasValue = row.some(function (value) { return value !== '' && value !== null; });
    if (!hasValue) continue;
    var object = {};
    headers.forEach(function (header, index) { if (header) object[header] = row[index]; });
    rows.push(object);
  }
  return rows;
}

function lvptIndexByEvent_(rows) {
  var index = {};
  rows.forEach(function (row) {
    var eventId = String(row.event_id || '').trim();
    if (!eventId) return;
    if (!index[eventId]) index[eventId] = [];
    index[eventId].push(row);
  });
  return index;
}

function lvptDateString_(value) {
  if (!value) return '';
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) return Utilities.formatDate(value, Session.getScriptTimeZone() || 'America/New_York', 'yyyy-MM-dd');
  var text = String(value);
  var match = text.match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : text;
}

function lvptBool_(value) {
  if (value === true || value === false) return value;
  var text = String(value || '').toLowerCase();
  return text === 'true' || text === 'yes';
}

function lvptNumber_(value) { var number = Number(value); return isNaN(number) ? 0 : number; }

function lvptListEvents_() {
  var eventRows = lvptSheetObjects_('Events');
  var quoteByEvent = lvptIndexByEvent_(lvptSheetObjects_('Quote Items'));
  var paymentByEvent = lvptIndexByEvent_(lvptSheetObjects_('Payments'));
  var taskByEvent = lvptIndexByEvent_(lvptSheetObjects_('Tasks'));
  var staffByEvent = lvptIndexByEvent_(lvptSheetObjects_('Staff'));
  var complianceByEvent = lvptIndexByEvent_(lvptSheetObjects_('Compliance'));
  var documentsByEvent = lvptIndexByEvent_(lvptSheetObjects_('Documents'));
  var gmailByEvent = lvptIndexByEvent_(lvptSheetObjects_('Gmail Activity'));
  var postByEvent = lvptIndexByEvent_(lvptSheetObjects_('Post Event'));

  return eventRows.map(function (row) {
    var eventId = String(row.event_id || '').trim();
    var quotes = quoteByEvent[eventId] || [];
    var payment = (paymentByEvent[eventId] || [])[0] || {};
    var tasks = taskByEvent[eventId] || [];
    var staff = staffByEvent[eventId] || [];
    var compliance = complianceByEvent[eventId] || [];
    var documents = documentsByEvent[eventId] || [];
    var gmail = gmailByEvent[eventId] || [];
    var post = (postByEvent[eventId] || [])[0] || {};
    return {
      id: eventId, eventName: row.event_name || '', company: row.company || '', contactName: row.contact_name || '', contactEmail: row.contact_email || '', contactPhone: row.contact_phone || '', eventType: row.event_type || '', status: row.status || 'New Lead', eventDate: lvptDateString_(row.event_date), startTime: row.start_time || '', endTime: row.end_time || '', city: row.city || '', state: row.state || '', venue: row.venue || '', guestCount: lvptNumber_(row.guest_count), studentCount: lvptNumber_(row.training_participants), skillLevel: row.skill_level || '', leadSource: row.lead_source || '', probabilityToClose: lvptNumber_(row.close_probability), eventGoal: row.event_goal || '', eventFormat: row.event_format || '', clientExpectations: row.client_expectations || '', knownRisks: row.known_risks || '', nextAction: row.next_action || '', nextActionDue: lvptDateString_(row.next_action_due), proposalUrl: row.proposal_url || '',
      setup: { invoiceEmail: row.invoice_email || '', planningStage: row.planning_stage || '', budgetRange: row.budget_range || '', poRequired: row.po_required || 'unknown', poNumber: row.po_number || '', stakeholders: row.stakeholders || '', timeZone: row.time_zone || 'America/Los_Angeles', venueStatus: row.venue_status || 'TBD', venueContact: row.venue_contact || '', venueEmail: row.venue_email || '', setupTime: row.setup_access_time || '', strikeTime: row.strike_time || '', parkingInstructions: row.parking_instructions || '', travelNeeds: row.travel_lodging || '', primaryGoal: row.primary_goal || '', experienceDuration: row.experience_duration || '', trainingFormat: row.training_format || '', gameFormat: row.game_format || '', competitionLevel: row.competition_level || '', foodPlan: row.food_plan || '', addOns: row.add_ons || '', tableCount: lvptNumber_(row.table_count), dealerCount: lvptNumber_(row.dealer_count), proCount: lvptNumber_(row.pro_count), leadProNeeded: row.lead_pro_needed || 'unknown', tdNeeded: row.td_needed || 'unknown', avNeeded: row.av_needed || 'unknown', equipmentSource: row.equipment_source || 'TBD', brandingRequired: row.branding_required || 'unknown', shippingRequired: row.shipping_required || 'unknown', powerInternet: row.power_internet || '', dressCode: row.dress_code || '', accessibilityNeeds: row.accessibility_needs || '', layoutNotes: row.layout_notes || '', productionNotes: row.production_notes || '', targetQuote: lvptNumber_(row.target_quote), depositPercent: lvptNumber_(row.deposit_percent), finalPaymentTiming: row.final_payment_timing || '', taxStatus: row.tax_status || '', coiRequired: row.coi_required || 'unknown', w9Required: row.w9_required || 'unknown', vendorRegistration: row.vendor_registration || 'unknown', licenseRequired: row.license_required || 'unknown', contractRequired: row.contract_required || 'unknown', paymentNotes: row.payment_notes || '', complianceNotes: row.compliance_notes || '', internalOwner: row.internal_owner || 'Matt', reminderCadence: row.reminder_cadence || 'Daily for overdue tasks', gmailKeywords: row.gmail_keywords || '', autoEmailMatch: row.auto_email_match || 'yes', communicationNotes: row.communication_notes || '', miscNotes: row.misc_notes || '' },
      quote: quotes.map(function (item) { return { id: item.quote_item_id || Utilities.getUuid(), category: item.category || '', name: item.line_item || '', quantity: lvptNumber_(item.quantity), unitPrice: lvptNumber_(item.unit_price), internalCost: lvptNumber_(item.internal_unit_cost) }; }),
      payment: { amountPaid: lvptNumber_(payment.amount_paid), depositRequired: lvptNumber_(payment.deposit_required), status: payment.payment_status || 'Not Invoiced', balanceDueDate: lvptDateString_(payment.due_date) },
      tasks: tasks.map(function (item) { return { id: item.task_id || Utilities.getUuid(), title: item.task || '', owner: item.owner || 'Matt', dueDate: lvptDateString_(item.due_date), priority: item.priority || 'Medium', status: item.status || 'Open' }; }),
      staff: staff.map(function (item) { return { id: item.staff_id || Utilities.getUuid(), name: item.name || '', role: item.role || '', confirmed: lvptBool_(item.confirmed), arrivalTime: item.arrival_time || '', rate: lvptNumber_(item.rate) }; }),
      compliance: compliance.map(function (item) { return { id: item.compliance_id || Utilities.getUuid(), name: item.requirement || '', status: item.status || 'Pending', dueDate: lvptDateString_(item.due_date) }; }),
      documents: documents.map(function (item) { return { id: item.document_id || Utilities.getUuid(), name: item.file_name || '', type: item.mime_type || 'application/octet-stream', size: lvptNumber_(item.file_size), category: item.category || 'Miscellaneous', vendor: item.vendor || '', amount: lvptNumber_(item.amount), documentDate: lvptDateString_(item.document_date), uploadedAt: item.uploaded_at ? new Date(item.uploaded_at).toISOString() : '', uploadedBy: item.uploaded_by || '', storage: item.drive_file_id ? 'drive' : 'browser', driveFileId: item.drive_file_id || '', driveUrl: item.drive_url || '', downloadUrl: item.download_url || '' }; }),
      emailActivity: gmail.map(function (item) { return { id: item.message_id || item.gmail_activity_id || Utilities.getUuid(), threadId: item.thread_id || '', subject: item.subject || '', from: item.from_email || '', to: item.to_email || '', cc: item.cc_email || '', date: item.message_date ? new Date(item.message_date).toISOString() : '', snippet: item.snippet || '', gmailUrl: item.gmail_url || '', direction: item.direction || 'received' }; }),
      postEvent: { clientFeedback: post.client_feedback || '', whatWentWell: post.what_went_well || '', painPoints: post.pain_points || '', changesForNextTime: post.changes_for_next_time || '', reviewRequested: lvptBool_(post.review_requested), reviewReceived: lvptBool_(post.review_received), rebookingLikelihood: post.rebooking_likelihood || 'Medium' },
      _serverVersion: lvptNumber_(row.record_version), _lastActor: row.last_actor || ''
    };
  });
}

function lvptSaveAllEvents_(payload) {
  var events = Array.isArray(payload.events) ? payload.events : [];
  var actor = String(payload.actor || 'Unknown').slice(0, 60);
  if (!events.length) throw new Error('No event records were supplied.');
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    lvptWriteEventsSheet_(events, actor); lvptWriteQuoteSheet_(events); lvptWritePaymentsSheet_(events); lvptWriteTasksSheet_(events); lvptWriteStaffSheet_(events); lvptWriteComplianceSheet_(events); lvptWriteDocumentsSheet_(events); lvptWriteGmailSheet_(events); lvptWritePostEventSheet_(events); lvptAppendChangeLog_(events, actor, payload.reason || 'App synchronization');
    SpreadsheetApp.flush();
    return { ok: true, saved: events.length, serverTime: new Date().toISOString() };
  } finally { lock.releaseLock(); }
}

function lvptHeaders_(sheet) { return sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0].map(function (header) { return String(header || '').trim(); }); }

function lvptRewriteSheet_(sheetName, objects) {
  var sheet = lvptSpreadsheet_().getSheetByName(sheetName);
  if (!sheet) throw new Error('Missing sheet: ' + sheetName);
  var headers = lvptHeaders_(sheet);
  var rows = objects.map(function (object) { return headers.map(function (header) { var value = Object.prototype.hasOwnProperty.call(object, header) ? object[header] : ''; return value === undefined || value === null ? '' : value; }); });
  var oldRows = Math.max(sheet.getLastRow() - 1, 0);
  if (oldRows) sheet.getRange(2, 1, oldRows, headers.length).clearContent();
  if (rows.length) sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
}

function lvptEventRow_(event, actor) {
  var setup = event.setup || {};
  return { event_id: event.id, event_name: event.eventName, company: event.company, contact_name: event.contactName, contact_email: event.contactEmail, contact_phone: event.contactPhone, invoice_email: setup.invoiceEmail, lead_source: event.leadSource, planning_stage: setup.planningStage, status: event.status, close_probability: lvptNumber_(event.probabilityToClose), event_date: event.eventDate, start_time: event.startTime, end_time: event.endTime, time_zone: setup.timeZone, city: event.city, state: event.state, venue: event.venue, venue_status: setup.venueStatus, venue_contact: setup.venueContact, venue_email: setup.venueEmail, setup_access_time: setup.setupTime, strike_time: setup.strikeTime, parking_instructions: setup.parkingInstructions, travel_lodging: setup.travelNeeds, event_type: event.eventType, primary_goal: setup.primaryGoal, guest_count: lvptNumber_(event.guestCount), training_participants: lvptNumber_(event.studentCount), skill_level: event.skillLevel, experience_duration: setup.experienceDuration, training_format: setup.trainingFormat, game_format: setup.gameFormat, competition_level: setup.competitionLevel, food_plan: setup.foodPlan, event_goal: event.eventGoal, event_format: event.eventFormat, client_expectations: event.clientExpectations, add_ons: setup.addOns, known_risks: event.knownRisks, table_count: lvptNumber_(setup.tableCount), dealer_count: lvptNumber_(setup.dealerCount), pro_count: lvptNumber_(setup.proCount), lead_pro_needed: setup.leadProNeeded, td_needed: setup.tdNeeded, av_needed: setup.avNeeded, equipment_source: setup.equipmentSource, branding_required: setup.brandingRequired, shipping_required: setup.shippingRequired, power_internet: setup.powerInternet, dress_code: setup.dressCode, accessibility_needs: setup.accessibilityNeeds, layout_notes: setup.layoutNotes, production_notes: setup.productionNotes, target_quote: lvptNumber_(setup.targetQuote), budget_range: setup.budgetRange, deposit_percent: lvptNumber_(setup.depositPercent), final_payment_timing: setup.finalPaymentTiming, tax_status: setup.taxStatus, po_required: setup.poRequired, po_number: setup.poNumber, coi_required: setup.coiRequired, w9_required: setup.w9Required, vendor_registration: setup.vendorRegistration, license_required: setup.licenseRequired, contract_required: setup.contractRequired, payment_notes: setup.paymentNotes, compliance_notes: setup.complianceNotes, internal_owner: setup.internalOwner, reminder_cadence: setup.reminderCadence, gmail_keywords: setup.gmailKeywords, auto_email_match: setup.autoEmailMatch, communication_notes: setup.communicationNotes, misc_notes: setup.miscNotes, next_action: event.nextAction, next_action_due: event.nextActionDue, proposal_url: event.proposalUrl || '', created_at: event.createdAt || new Date(), updated_at: new Date(), record_version: lvptNumber_(event._serverVersion) + 1, setup_complete_percent: '', event_json: JSON.stringify(event), last_actor: actor, stakeholders: setup.stakeholders || '' };
}

function lvptWriteEventsSheet_(events, actor) { lvptRewriteSheet_('Events', events.map(function (event) { return lvptEventRow_(event, actor); })); }
function lvptWriteQuoteSheet_(events) { var rows = []; events.forEach(function (event) { (event.quote || []).forEach(function (item) { var q = lvptNumber_(item.quantity), p = lvptNumber_(item.unitPrice), c = lvptNumber_(item.internalCost); rows.push({ quote_item_id: item.id || Utilities.getUuid(), event_id: event.id, category: item.category || '', line_item: item.name || '', quantity: q, unit_price: p, client_total: q * p, internal_unit_cost: c, internal_total: q * c, estimated_profit: q * (p - c), notes: item.notes || '' }); }); }); lvptRewriteSheet_('Quote Items', rows); }
function lvptWritePaymentsSheet_(events) { var rows = events.map(function (event) { var p = event.payment || {}, s = event.setup || {}, total = (event.quote || []).reduce(function (sum, item) { return sum + lvptNumber_(item.quantity) * lvptNumber_(item.unitPrice); }, 0); return { payment_id: 'PAY-' + event.id, event_id: event.id, invoice_number: p.invoiceNumber || '', invoice_total: total, deposit_required: lvptNumber_(p.depositRequired), amount_paid: lvptNumber_(p.amountPaid), payment_status: p.status || 'Not Invoiced', balance_due: Math.max(total - lvptNumber_(p.amountPaid), 0), due_date: p.balanceDueDate || '', payment_date: p.paymentDate || '', po_required: s.poRequired || 'unknown', po_number: s.poNumber || '', ap_email: s.invoiceEmail || '', notes: s.paymentNotes || '' }; }); lvptRewriteSheet_('Payments', rows); }
function lvptWriteTasksSheet_(events) { var rows = []; events.forEach(function (event) { (event.tasks || []).forEach(function (item) { rows.push({ task_id: item.id || Utilities.getUuid(), event_id: event.id, task: item.title || '', owner: item.owner || '', due_date: item.dueDate || '', priority: item.priority || 'Medium', status: item.status || 'Open', source: item.source || 'Command Center', notes: item.notes || '', completed_at: item.completedAt || '' }); }); }); lvptRewriteSheet_('Tasks', rows); }
function lvptWriteStaffSheet_(events) { var rows = []; events.forEach(function (event) { (event.staff || []).forEach(function (item) { rows.push({ staff_id: item.id || Utilities.getUuid(), event_id: event.id, name: item.name || '', role: item.role || '', confirmed: Boolean(item.confirmed), arrival_time: item.arrivalTime || '', departure_time: item.departureTime || '', rate: lvptNumber_(item.rate), travel_required: Boolean(item.travelRequired), hotel_required: Boolean(item.hotelRequired), notes: item.notes || '' }); }); }); lvptRewriteSheet_('Staff', rows); }
function lvptWriteComplianceSheet_(events) { var rows = []; events.forEach(function (event) { (event.compliance || []).forEach(function (item) { rows.push({ compliance_id: item.id || Utilities.getUuid(), event_id: event.id, requirement: item.name || '', status: item.status || 'Pending', due_date: item.dueDate || '', owner: item.owner || (event.setup || {}).internalOwner || 'Matt', document_url: item.documentUrl || '', notes: item.notes || '' }); }); }); lvptRewriteSheet_('Compliance', rows); }
function lvptWriteDocumentsSheet_(events) { var rows = []; events.forEach(function (event) { (event.documents || []).forEach(function (item) { rows.push({ document_id: item.id || Utilities.getUuid(), event_id: event.id, category: item.category || 'Miscellaneous', file_name: item.name || '', drive_file_id: item.driveFileId || '', drive_url: item.driveUrl || '', download_url: item.downloadUrl || '', mime_type: item.type || '', file_size: lvptNumber_(item.size), vendor: item.vendor || '', document_date: item.documentDate || '', amount: lvptNumber_(item.amount), uploaded_by: item.uploadedBy || '', uploaded_at: item.uploadedAt || '', notes: item.notes || '' }); }); }); lvptRewriteSheet_('Documents', rows); }
function lvptWriteGmailSheet_(events) { var rows = []; events.forEach(function (event) { (event.emailActivity || []).forEach(function (item) { rows.push({ gmail_activity_id: item.activityId || item.id || Utilities.getUuid(), event_id: event.id, thread_id: item.threadId || '', message_id: item.id || '', direction: item.direction || 'received', message_date: item.date || '', from_email: item.from || '', to_email: item.to || '', cc_email: item.cc || '', subject: item.subject || '', snippet: item.snippet || '', gmail_url: item.gmailUrl || '', matched_terms: item.matchedTerms || '', task_created: Boolean(item.taskCreated), last_synced_at: new Date() }); }); }); lvptRewriteSheet_('Gmail Activity', rows); }
function lvptWritePostEventSheet_(events) { var rows = events.map(function (event) { var p = event.postEvent || {}; return { event_id: event.id, client_feedback: p.clientFeedback || '', what_went_well: p.whatWentWell || '', pain_points: p.painPoints || '', changes_for_next_time: p.changesForNextTime || '', review_requested: Boolean(p.reviewRequested), review_received: Boolean(p.reviewReceived), review_url: p.reviewUrl || '', rebooking_likelihood: p.rebookingLikelihood || 'Medium', thank_you_sent: Boolean(p.thankYouSent), follow_up_date: p.followUpDate || '', notes: p.notes || '' }; }); lvptRewriteSheet_('Post Event', rows); }

function lvptAppendChangeLog_(events, actor, reason) { var sheet = lvptSpreadsheet_().getSheetByName('Change Log'); if (!sheet) return; var timestamp = new Date(); var rows = events.map(function (event) { return [Utilities.getUuid(), timestamp, event.id, actor, reason, 'All', event.id, '', '', '', 'Vercel Command Center']; }); if (rows.length) sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows); }

function lvptSafeFolderName_(eventName, eventDate) { var name = String(eventName || 'Event').replace(/[\\/:*?"<>|#%]/g, '-').trim(); var date = String(eventDate || '').trim(); return (name + (date ? ' — ' + date : '')).slice(0, 180); }
function lvptEventFolder_(eventName, eventDate) { var root = lvptDocumentsRoot_(), folderName = lvptSafeFolderName_(eventName, eventDate), matches = root.getFoldersByName(folderName); if (matches.hasNext()) return matches.next(); var all = root.getFolders(), normalized = String(eventName || '').toLowerCase(); while (all.hasNext()) { var candidate = all.next(); if (candidate.getName().toLowerCase().indexOf(normalized) !== -1) return candidate; } return root.createFolder(folderName); }

function lvptUploadDocument_(payload) {
  var bytes = Utilities.base64Decode(payload.dataBase64 || '');
  if (!bytes.length) throw new Error('The uploaded file was empty.');
  if (bytes.length > LVPT_MAX_UPLOAD_BYTES) throw new Error('Cloud uploads are limited to 8 MB per file.');
  var fileName = String(payload.fileName || 'document').slice(0, 220), mimeType = String(payload.mimeType || 'application/octet-stream'), folder = lvptEventFolder_(payload.eventName, payload.eventDate), file = folder.createFile(Utilities.newBlob(bytes, mimeType, fileName));
  file.setDescription('LVPT Event Command Center upload for ' + String(payload.eventId || 'unknown event'));
  return { ok: true, document: { id: payload.documentId || Utilities.getUuid(), name: file.getName(), type: mimeType, size: file.getSize(), category: payload.category || 'Miscellaneous', vendor: payload.vendor || '', amount: lvptNumber_(payload.amount), documentDate: payload.documentDate || '', uploadedAt: new Date().toISOString(), uploadedBy: payload.actor || 'Unknown', storage: 'drive', driveFileId: file.getId(), driveUrl: file.getUrl(), downloadUrl: 'https://drive.google.com/uc?export=download&id=' + encodeURIComponent(file.getId()) } };
}

function lvptDeleteDocument_(payload) { var fileId = String(payload.driveFileId || '').trim(); if (!fileId) throw new Error('driveFileId is required.'); DriveApp.getFileById(fileId).setTrashed(true); return { ok: true, deleted: fileId }; }
function lvptCreateBackup_() { var events = lvptListEvents_(), stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'America/New_York', 'yyyy-MM-dd_HH-mm-ss'), file = lvptBackupRoot_().createFile('LVPT-Event-Backup-' + stamp + '.json', JSON.stringify(events, null, 2), MimeType.PLAIN_TEXT); return { ok: true, fileId: file.getId(), fileUrl: file.getUrl(), eventCount: events.length }; }

function sendLvptDailyReminderSummary() {
  var events = lvptListEvents_(), today = new Date(), due = [];
  today.setHours(0, 0, 0, 0);
  events.forEach(function (event) { (event.tasks || []).forEach(function (task) { if (!task.dueDate || task.status === 'Complete') return; var date = new Date(task.dueDate + 'T00:00:00'), days = Math.round((date.getTime() - today.getTime()) / 86400000); if (days <= 3) due.push({ eventName: event.eventName, title: task.title, owner: task.owner, dueDate: task.dueDate, days: days }); }); });
  if (!due.length) return;
  due.sort(function (a, b) { return a.dueDate.localeCompare(b.dueDate); });
  var lines = due.map(function (item) { var timing = item.days < 0 ? Math.abs(item.days) + ' day(s) overdue' : item.days === 0 ? 'due today' : 'due in ' + item.days + ' day(s)'; return '- ' + item.eventName + ': ' + item.title + ' — ' + timing + ' — Owner: ' + item.owner; });
  GmailApp.sendEmail(LVPT_BOOKING_EMAIL, 'LVPT Command Center: ' + due.length + ' due or overdue item(s)', 'LVPT Event Command Center\n\n' + lines.join('\n') + '\n\nOpen the Command Center to update these records.');
}

function installLvptDailyReminderTrigger() { ScriptApp.getProjectTriggers().forEach(function (trigger) { if (trigger.getHandlerFunction() === 'sendLvptDailyReminderSummary') ScriptApp.deleteTrigger(trigger); }); ScriptApp.newTrigger('sendLvptDailyReminderSummary').timeBased().everyDays(1).atHour(8).create(); }
function createLvptBackupNow() { return lvptCreateBackup_(); }
