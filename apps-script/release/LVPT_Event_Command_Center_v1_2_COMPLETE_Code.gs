// LVPT Event Command Center Backend v1.2 — COMPLETE Code.gs replacement
// Includes protected financial ledgers and revised bounded Gmail draft context.
// Preserve the separate existing GmailEvidence.gs file unchanged.
// Do not additionally create GmailDraftContext.gs in Apps Script; it is embedded
// below to allow a single complete Code.gs paste/redeployment.
//
// Nothing in this file automatically sends approved drafts.
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
    if (action === 'listReconciliationEvidence') return lvptJson_(lvptListReconciliationEvidence_());
    if (action === 'listGmailThreadEvidence') return lvptJson_(lvptReadOnlyGmailEvidence_(String(payload.eventKey || '')));
    if (action === 'listBusinessInboxReview') return lvptJson_(lvptReadOnlyBusinessInboxReview_(Number(payload.page || 0)));
    if (action === 'readBusinessInboxThread') return lvptJson_(lvptReadOnlyBusinessInboxThread_(String(payload.threadId || ''), String(payload.expectedLastMessageAt || '')));
    if (action === 'verifyBusinessReplyRecipient') return lvptJson_(lvptStep48VerifyReplyRecipient_(String(payload.threadId || ''), String(payload.expectedLastMessageAt || '')));
    if (action === 'sendOwnerApprovedGmailReply') return lvptJson_(lvptStep48SendApprovedReply_(payload));
    if (action === 'readGmailDraftContext') return lvptJson_(lvptReadOnlyGmailDraftContext_(String(payload.eventKey || ''), String(payload.threadId || ''), String(payload.expectedLastMessageAt || '')));
    if (action === 'saveAllEvents') return lvptJson_(lvptSaveAllEvents_(payload));
    if (action === 'uploadDocument') return lvptJson_(lvptUploadDocument_(payload));
    if (action === 'deleteDocument') return lvptJson_(lvptDeleteDocument_(payload));
    if (action === 'createBackup') return lvptJson_(lvptCreateBackup_());
    if (action === 'automationStatus') return lvptJson_(lvptAutomationStatus_());
    if (action === 'scanClientLifecycle') return lvptJson_(lvptRunClientLifecycleScan_({ notify: true, source: 'Command Center' }));
    if (action === 'installClientLifecycleTriggers') return lvptJson_(lvptInstallClientLifecycleTriggers_());
    if (action === 'reviewAutomationItem') return lvptJson_(lvptReviewAutomationItem_(payload));
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


// Read-only evidence for LVPT SMS reconciliation.
// Do not infer that a planned payout cleared; the sheet's recorded status is authoritative
// about what the Command Center says, but bank confirmation is still independent.
function lvptListReconciliationEvidence_() {
  var raw = lvptSheetObjects_('Event Payouts');
  var rows = raw.map(function(row) {
    var value = String(row.amount || '').replace(/[^0-9.-]/g, '');
    var numericAmount = value === '' ? null : Number(value);
    return {
      payoutId: String(row.payout_id || '').slice(0, 120),
      eventId: String(row.event_id || '').slice(0, 120),
      payee: String(row.payee || '').slice(0, 120),
      payoutType: String(row.payout_type || '').slice(0, 80),
      amount: numericAmount !== null && isFinite(numericAmount) ? numericAmount : null,
      status: String(row.status || 'Unknown').slice(0, 50),
      paidDate: lvptDateString_(row.paid_date)
    };
  }).filter(function(row) {
    return row.eventId && row.payoutId;
  });
  // Each invoice/payment entry is returned separately. listEvents() currently
  // exposes only the first Payments row for an event and cannot be used to
  // conclude whether add-on invoices were settled.
  var paymentRecords = lvptSheetObjects_('Payments').map(function(item) {
    function numberOrNull(value) {
      var text = String(value == null ? '' : value).replace(/[^0-9.-]/g, '');
      if (!text) return null;
      var amount = Number(text);
      return isFinite(amount) ? amount : null;
    }
    return {
      paymentId: String(item.payment_id || '').slice(0, 120),
      eventId: String(item.event_id || '').slice(0, 120),
      invoiceNumber: String(item.invoice_number || '').slice(0, 100),
      invoiceTotal: numberOrNull(item.invoice_total),
      amountPaid: numberOrNull(item.amount_paid),
      balanceDue: numberOrNull(item.balance_due),
      paymentStatus: String(item.payment_status || 'Unknown').slice(0, 80),
      dueDate: lvptDateString_(item.due_date),
      paymentDate: lvptDateString_(item.payment_date)
    };
  }).filter(function(item) {
    return item.eventId && item.paymentId;
  });
  return {
    ok: true,
    source: 'Event Payouts + Payments',
    sourceVerifiedAs: 'Command Center ledger only — not bank settlement evidence',
    payoutCount: rows.length,
    payouts: rows,
    paymentCount: paymentRecords.length,
    paymentRecords: paymentRecords,
    serverTime: new Date().toISOString()
  };
}


// Gmail metadata helpers live in GmailEvidence.gs; Apps Script loads all .gs files in this project.

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
    var stored = {};
    try { stored = row.event_json ? JSON.parse(String(row.event_json)) : {}; } catch (ignored) {}
    var event = {
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
    event.proposalId = stored.proposalId || '';
    event.proposalStatus = stored.proposalStatus || '';
    event.automationReview = Array.isArray(stored.automationReview) ? stored.automationReview : [];
    event.automationMeta = stored.automationMeta || {};
    event.createdAt = stored.createdAt || row.created_at || '';
    event.postEvent.thankYouSent = lvptBool_(post.thank_you_sent) || Boolean(stored.postEvent && stored.postEvent.thankYouSent);
    event.postEvent.followUpDate = lvptDateString_(post.follow_up_date) || (stored.postEvent && stored.postEvent.followUpDate) || '';
    event.postEvent.reviewUrl = post.review_url || (stored.postEvent && stored.postEvent.reviewUrl) || '';
    event.postEvent.notes = post.notes || (stored.postEvent && stored.postEvent.notes) || '';
    return event;
  });
}

function lvptSaveAllEvents_(payload) {
  var events = Array.isArray(payload.events) ? payload.events : [];
  var actor = String(payload.actor || 'Unknown').slice(0, 60);
  if (!events.length) throw new Error('No event records were supplied.');
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var checked = lvptVerifyFinancialLedgerIds_();
    lvptWriteEventsSheet_(events, actor);
    lvptWriteQuoteSheet_(events);
    // Financial ledgers must be managed independently by unique payment/payout ID.
    // Bulk event synchronization may NEVER reconstruct an invoice or payout.
    lvptWriteTasksSheet_(events);
    lvptWriteStaffSheet_(events);
    lvptWriteComplianceSheet_(events);
    lvptWriteDocumentsSheet_(events);
    lvptWriteGmailSheet_(events);
    lvptWritePostEventSheet_(events);
    lvptAppendChangeLog_(events, actor, payload.reason || 'App synchronization');
    SpreadsheetApp.flush();
    return {
      ok:true,saved:events.length,financialLedgersProtected:true,
      paymentChangesApplied:false,paymentsPreserved:checked.paymentCount,
      payoutsPreserved:checked.payoutCount,
      warning:'Payments and Event Payouts were not changed; use the separate approved financial workflow.',
      serverTime:new Date().toISOString()
    };
  } finally { lock.releaseLock(); }
}
// Verify both ledgers before any event save; reject missing and duplicate IDs.
function lvptVerifyFinancialLedgerIds_() {
  function count(sheetName,idField) {
    var seen=Object.create(null);
    var rows=lvptSheetObjects_(sheetName);
    rows.forEach(function(row,index) {
      var id=String(row[idField]||'').trim();
      if(!id || seen[id])throw new Error('Financial ledger '+sheetName+' row '+(index+2)+
        ' has a missing or duplicate ID. Bulk save stopped without modifications.');
      seen[id]=true;
    });
    return rows.length;
  }
  return {paymentCount:count('Payments','payment_id'),
    payoutCount:count('Event Payouts','payout_id')};
}
function checkLvptFinancialLedgerProtectionNow() {
  var checked=lvptVerifyFinancialLedgerIds_();
  Logger.log('Financial ledgers validated (read-only): Payments=%s, Event Payouts=%s. No rows changed.',
    checked.paymentCount,checked.payoutCount);
  return checked;
}

function lvptHeaders_(sheet) { return sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0].map(function (header) { return String(header || '').trim(); }); }

function lvptRewriteSheet_(sheetName, objects) {
  if(sheetName==='Payments'||sheetName==='Event Payouts')
    throw new Error('Bulk rewrite blocked for protected financial ledger: '+sheetName);
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
function lvptWritePaymentsSheet_() {
  throw new Error('Bulk payment modifications disabled; use separate approved financial workflow.');
}
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
  events.forEach(function (event) { (event.tasks || []).forEach(function (task) { if (!task.dueDate || ['Complete','Completed','Resolved','Done'].indexOf(String(task.status || '').trim()) !== -1) return; var date = new Date(task.dueDate + 'T00:00:00'), days = Math.round((date.getTime() - today.getTime()) / 86400000); if (days <= 3) due.push({ eventName: event.eventName, title: task.title, owner: task.owner, dueDate: task.dueDate, days: days }); }); });
  if (!due.length) return;
  due.sort(function (a, b) { return a.dueDate.localeCompare(b.dueDate); });
  var lines = due.map(function (item) { var timing = item.days < 0 ? Math.abs(item.days) + ' day(s) overdue' : item.days === 0 ? 'due today' : 'due in ' + item.days + ' day(s)'; return '- ' + item.eventName + ': ' + item.title + ' — ' + timing + ' — Owner: ' + item.owner; });
  GmailApp.sendEmail(LVPT_BOOKING_EMAIL, 'LVPT Command Center: ' + due.length + ' due or overdue item(s)', 'LVPT Event Command Center\n\n' + lines.join('\n') + '\n\nOpen the Command Center to update these records.');
}

function installLvptDailyReminderTrigger() { ScriptApp.getProjectTriggers().forEach(function (trigger) { if (trigger.getHandlerFunction() === 'sendLvptDailyReminderSummary') ScriptApp.deleteTrigger(trigger); }); ScriptApp.newTrigger('sendLvptDailyReminderSummary').timeBased().everyDays(1).atHour(8).create(); }
function createLvptBackupNow() { return lvptCreateBackup_(); }

var LVPT_AUTOMATION_SHEET = 'Automation Inbox';
var LVPT_AUTOMATION_HEADERS = ['review_id','status','message_id','thread_id','message_date','from_email','subject','snippet','suggested_company','event_id','event_name','category','suggested_action','detected_at','reviewed_at','reviewed_by'];

function lvptAutomationSheet_() {
  var spreadsheet = lvptSpreadsheet_();
  var sheet = spreadsheet.getSheetByName(LVPT_AUTOMATION_SHEET);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(LVPT_AUTOMATION_SHEET);
    sheet.getRange(1, 1, 1, LVPT_AUTOMATION_HEADERS.length).setValues([LVPT_AUTOMATION_HEADERS]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function lvptAutomationRows_() {
  var sheet = lvptAutomationSheet_();
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  var headers = values[0].map(function (value) { return String(value || ''); });
  return values.slice(1).filter(function (row) { return row.some(function (value) { return value !== ''; }); }).map(function (row) {
    var item = {};
    headers.forEach(function (header, index) { item[header] = row[index]; });
    return item;
  });
}

function lvptAutomationStatus_() {
  var properties = lvptProperties_();
  var stats = {};
  try { stats = JSON.parse(properties.getProperty('LVPT_LAST_AUTOMATION_STATS') || '{}'); } catch (ignored) {}
  var items = lvptAutomationRows_().filter(function (item) { return String(item.status || 'Open') === 'Open'; }).slice(-250).reverse().map(function (item) {
    return {
      reviewId: String(item.review_id || ''), status: String(item.status || 'Open'), messageId: String(item.message_id || ''), threadId: String(item.thread_id || ''),
      messageDate: item.message_date ? new Date(item.message_date).toISOString() : '', from: String(item.from_email || ''), subject: String(item.subject || ''),
      snippet: String(item.snippet || ''), suggestedCompany: String(item.suggested_company || ''), eventId: String(item.event_id || ''), eventName: String(item.event_name || ''),
      category: String(item.category || 'Client Email'), action: String(item.suggested_action || 'Review client email')
    };
  });
  return {
    ok: true, configured: true, lastScanAt: properties.getProperty('LVPT_LAST_CLIENT_SCAN_AT') || '',
    nextMorning: 'Daily around 8:00 AM', nextEvening: 'Daily around 7:00 PM', items: items, stats: stats
  };
}

function lvptEmailAddress_(value) {
  var match = String(value || '').toLowerCase().match(/[a-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  return match ? match[0] : '';
}

function lvptMessageSummary_(message) {
  var from = message.getFrom() || '';
  var body = String(message.getPlainBody() || '').replace(/\s+/g, ' ').trim();
  var subject = String(message.getSubject() || '').trim();
  var sender = lvptEmailAddress_(from);
  var booking = LVPT_BOOKING_EMAIL.toLowerCase();
  return {
    id: message.getId(), threadId: message.getThread().getId(), subject: subject, from: from,
    to: message.getTo() || '', cc: message.getCc() || '', date: message.getDate().toISOString(),
    snippet: body.slice(0, 420), gmailUrl: 'https://mail.google.com/mail/u/0/#all/' + message.getThread().getId(),
    direction: sender === booking ? 'sent' : 'received', hasAttachments: message.getAttachments().length > 0
  };
}

function lvptQuoteGmailTerm_(value) { return '"' + String(value || '').replace(/["{}]/g, ' ').trim().slice(0, 100) + '"'; }

function lvptEventGmailQuery_(event) {
  var email = lvptEmailAddress_(event.contactEmail || '');
  if (email) return 'newer_than:18m in:anywhere -in:spam -in:trash {from:' + email + ' to:' + email + '}';
  var terms = [event.company, event.eventName].concat(String((event.setup || {}).gmailKeywords || '').split(/[,;]+/)).filter(function (term) { return String(term || '').trim().length >= 4; }).slice(0, 4);
  return 'newer_than:18m in:anywhere -in:spam -in:trash {' + terms.map(lvptQuoteGmailTerm_).join(' ') + '}';
}

function lvptClientCategory_(message) {
  var text = (message.subject + ' ' + message.snippet).toLowerCase();
  if (/cancel|cancellation|postpone|reschedul|cannot make|can.t make/.test(text)) return 'Schedule Risk';
  if (/invoice|payment|deposit|ach|wire|purchase order|\bpo\b|accounts payable/.test(text)) return 'Payment / Procurement';
  if (/contract|agreement|signature|signing|w-9|\bw9\b|coi|insurance|vendor registration/.test(text)) return 'Contract / Compliance';
  if (/proposal|quote|pricing|estimate|budget|cost/.test(text)) return 'Proposal / Pricing';
  if (/venue|hotel|room|floor plan|load-in|parking|setup|catering|menu|bar|transport/.test(text)) return 'Venue / Logistics';
  if (/guest|headcount|attendee|participant|table|dealer|instructor|poker pro/.test(text)) return 'Scope / Headcount';
  if (/photo|video|gallery|asset|logo|artwork|brand/.test(text)) return 'Media / Assets';
  return 'Client Email';
}

function lvptSuggestedAction_(category, message, event) {
  var contact = event && event.contactName ? event.contactName : 'client';
  if (category === 'Schedule Risk') return 'Review schedule change or attendance risk from ' + contact;
  if (category === 'Payment / Procurement') return 'Review payment, PO or procurement item from ' + contact;
  if (category === 'Contract / Compliance') return 'Review contract or compliance request from ' + contact;
  if (category === 'Proposal / Pricing') return 'Review and respond to proposal or pricing request from ' + contact;
  if (category === 'Venue / Logistics') return 'Review venue or logistics details from ' + contact;
  if (category === 'Scope / Headcount') return 'Review scope or headcount update from ' + contact;
  if (category === 'Media / Assets') return 'Review requested media or brand assets from ' + contact;
  return 'Review and respond to client message: ' + (message.subject || 'No subject');
}

function lvptEnsureAutomationTask_(event, title, dueDate, priority, sourceId) {
  event.tasks = event.tasks || [];
  var normalized = String(title || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  var existing = event.tasks.some(function (task) {
    return task.sourceId === sourceId || String(task.title || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() === normalized;
  });
  if (existing) return false;
  event.tasks.push({ id: Utilities.getUuid(), title: title, owner: (event.setup || {}).internalOwner || 'Matt', dueDate: dueDate, priority: priority || 'High', status: 'Open', source: 'Email Intelligence', sourceId: sourceId || '' });
  return true;
}

function lvptQueueAutomationItem_(sheet, index, item) {
  if (!item.messageId || index[item.messageId]) return false;
  var reviewId = Utilities.getUuid();
  sheet.appendRow([reviewId,'Open',item.messageId,item.threadId,item.messageDate,item.from,item.subject,item.snippet,item.suggestedCompany,item.eventId,item.eventName,item.category,item.action,new Date(),'','']);
  index[item.messageId] = reviewId;
  return true;
}

function lvptLooksLikeClientInquiry_(message) {
  var sender = lvptEmailAddress_(message.from);
  if (!sender || sender === LVPT_BOOKING_EMAIL.toLowerCase() || /no-?reply|notifications?|mailer-daemon|calendar-notification/.test(sender)) return false;
  var text = (message.subject + ' ' + message.snippet).toLowerCase();
  return /poker|casino|event|training|tournament|corporate|team build|client entertainment|quote|proposal|pricing|availability|las vegas|venetian|palazzo|aria|resorts world|mandalay/.test(text);
}

function lvptRunClientLifecycleScan_(options) {
  options = options || {};
    var events = lvptListEvents_();
    var sheet = lvptAutomationSheet_();
    var existingQueue = lvptAutomationRows_();
    var queueIndex = {};
    existingQueue.forEach(function (item) { if (item.message_id) queueIndex[String(item.message_id)] = String(item.review_id || 'existing'); });
    var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'America/New_York', 'yyyy-MM-dd');
    var knownMessageIds = {};
    var stats = { eventsReviewed: events.length, matchedMessages: 0, newMessages: 0, tasksCreated: 0, reviewItemsCreated: 0, unmatchedLeads: 0, scanSource: options.source || 'Scheduled automation' };

    events.forEach(function (event) {
      event.emailActivity = event.emailActivity || [];
      event.tasks = event.tasks || [];
      event.automationMeta = event.automationMeta || {};
      var activityIndex = {};
      event.emailActivity.forEach(function (activity) { if (activity.id) { activityIndex[String(activity.id)] = true; knownMessageIds[String(activity.id)] = true; } });
      if ((event.setup || {}).autoEmailMatch !== 'no') {
        var query = lvptEventGmailQuery_(event);
        var threads = [];
        try { threads = GmailApp.search(query, 0, 30); } catch (ignored) {}
        var messages = [];
        threads.forEach(function (thread) { thread.getMessages().forEach(function (message) { messages.push(lvptMessageSummary_(message)); }); });
        messages.sort(function (a,b) { return a.date.localeCompare(b.date); });
        stats.matchedMessages += messages.length;
        messages.forEach(function (message) {
          knownMessageIds[message.id] = true;
          if (activityIndex[message.id]) return;
          event.emailActivity.push(message); activityIndex[message.id] = true; stats.newMessages++;
        });
        event.emailActivity = event.emailActivity.slice(-300);
        var latestInbound = null, latestOutbound = null;
        event.emailActivity.forEach(function (message) {
          if (message.direction === 'received' && (!latestInbound || message.date > latestInbound.date)) latestInbound = message;
          if (message.direction === 'sent' && (!latestOutbound || message.date > latestOutbound.date)) latestOutbound = message;
        });
        if (latestInbound && (!latestOutbound || latestInbound.date > latestOutbound.date)) {
          var hoursWaiting = Math.floor((new Date().getTime() - new Date(latestInbound.date).getTime()) / 3600000);
          if (hoursWaiting >= 6) {
            var category = lvptClientCategory_(latestInbound);
            var action = lvptSuggestedAction_(category, latestInbound, event);
            if (lvptEnsureAutomationTask_(event, action, today, hoursWaiting >= 48 ? 'Critical' : 'High', latestInbound.id)) stats.tasksCreated++;
            if (lvptQueueAutomationItem_(sheet, queueIndex, { messageId:latestInbound.id,threadId:latestInbound.threadId,messageDate:latestInbound.date,from:latestInbound.from,subject:latestInbound.subject,snippet:latestInbound.snippet,suggestedCompany:event.company,eventId:event.id,eventName:event.eventName,category:category,action:action })) stats.reviewItemsCreated++;
          }
        }
      }

      var eventPast = event.eventDate && event.eventDate < today;
      var closed = ['Completed','Post-Event Follow-Up','Closed Won'].indexOf(event.status) !== -1 || eventPast;
      var daysSinceEvent = event.eventDate ? Math.floor((new Date().getTime() - new Date(event.eventDate + 'T12:00:00').getTime()) / 86400000) : -1;
      if (closed && daysSinceEvent >= 0 && daysSinceEvent <= 60) {
        if (!(event.postEvent || {}).thankYouSent && lvptEnsureAutomationTask_(event, 'Send or confirm post-event client thank-you', today, 'High', 'post-thank-' + event.id)) stats.tasksCreated++;
        if (!(event.postEvent || {}).reviewRequested && lvptEnsureAutomationTask_(event, 'Request client feedback / testimonial or mark not needed', today, 'Medium', 'post-review-' + event.id)) stats.tasksCreated++;
      }
      if (closed && daysSinceEvent >= 180 && String((event.postEvent || {}).rebookingLikelihood || 'Medium') !== 'Low') {
        if (lvptEnsureAutomationTask_(event, 'Reconnect about a future or anniversary poker experience', today, 'Medium', 'rebook-' + event.id + '-' + new Date().getFullYear())) stats.tasksCreated++;
      }
      if (event.status === 'Proposal Sent') {
        var latestActivity = (event.emailActivity || []).slice().sort(function(a,b){ return String(b.date||'').localeCompare(String(a.date||'')); })[0];
        var quietDays = latestActivity ? Math.floor((new Date().getTime() - new Date(latestActivity.date).getTime()) / 86400000) : 999;
        if (quietDays >= 3 && lvptEnsureAutomationTask_(event, 'Follow up on outstanding proposal', today, quietDays >= 7 ? 'High' : 'Medium', 'proposal-followup-' + event.id)) stats.tasksCreated++;
      }
      event.automationMeta.lastReviewedAt = new Date().toISOString();
    });

    var recentThreads = [];
    try { recentThreads = GmailApp.search('newer_than:21d to:' + LVPT_BOOKING_EMAIL + ' -in:spam -in:trash -category:promotions -category:social', 0, 80); } catch (ignored) {}
    recentThreads.forEach(function (thread) {
      thread.getMessages().forEach(function (gmailMessage) {
        var message = lvptMessageSummary_(gmailMessage);
        if (message.direction !== 'received' || knownMessageIds[message.id] || queueIndex[message.id] || !lvptLooksLikeClientInquiry_(message)) return;
        var company = lvptEmailAddress_(message.from).split('@')[1] || lvptEmailAddress_(message.from) || 'New client inquiry';
        var category = lvptClientCategory_(message);
        if (lvptQueueAutomationItem_(sheet, queueIndex, { messageId:message.id,threadId:message.threadId,messageDate:message.date,from:message.from,subject:message.subject,snippet:message.snippet,suggestedCompany:company,eventId:'',eventName:'',category:'Potential New Lead — ' + category,action:'Review unmatched client inquiry and create a pipeline record if qualified' })) { stats.reviewItemsCreated++; stats.unmatchedLeads++; }
      });
    });

    lvptSaveAllEvents_({ events: events, actor: 'Email Intelligence', reason: 'Twice-daily client lifecycle review' });
    var completedAt = new Date().toISOString();
    stats.completedAt = completedAt;
    lvptProperties_().setProperty('LVPT_LAST_CLIENT_SCAN_AT', completedAt);
    lvptProperties_().setProperty('LVPT_LAST_AUTOMATION_STATS', JSON.stringify(stats));
    if (options.notify && (stats.tasksCreated || stats.reviewItemsCreated)) lvptSendAutomationSummary_(stats);
    return { ok:true, message:'Client lifecycle scan complete.', lastScanAt:completedAt, stats:stats, items:lvptAutomationStatus_().items };
}

function lvptSendAutomationSummary_(stats) {
  var subject = 'LVPT Command Center: ' + (stats.tasksCreated + stats.reviewItemsCreated) + ' client item(s) need attention';
  var body = [
    'LVPT twice-daily client lifecycle review is complete.','',
    'Events reviewed: ' + stats.eventsReviewed,
    'New matched emails: ' + stats.newMessages,
    'Tasks created: ' + stats.tasksCreated,
    'Review items created: ' + stats.reviewItemsCreated,
    'Potential new leads: ' + stats.unmatchedLeads,'',
    'Open the Client Follow-Up section in the LVPT Command Center to review and resolve these items.'
  ].join('\n');
  GmailApp.sendEmail(LVPT_BOOKING_EMAIL, subject, body);
}

function lvptReviewAutomationItem_(payload) {
  var reviewId = String(payload.reviewId || '').trim();
  var status = String(payload.status || 'Reviewed').trim();
  if (!reviewId) throw new Error('reviewId is required.');
  if (['Reviewed','Dismissed'].indexOf(status) === -1) throw new Error('Status must be Reviewed or Dismissed.');
  var sheet = lvptAutomationSheet_();
  var values = sheet.getDataRange().getValues();
  var headers = values[0].map(function(value){ return String(value || ''); });
  var idColumn = headers.indexOf('review_id'), statusColumn = headers.indexOf('status'), reviewedAtColumn = headers.indexOf('reviewed_at'), reviewedByColumn = headers.indexOf('reviewed_by');
  for (var row = 1; row < values.length; row++) {
    if (String(values[row][idColumn]) !== reviewId) continue;
    sheet.getRange(row + 1, statusColumn + 1).setValue(status);
    sheet.getRange(row + 1, reviewedAtColumn + 1).setValue(new Date());
    sheet.getRange(row + 1, reviewedByColumn + 1).setValue(String(payload.actor || 'Command Center'));
    return { ok:true, reviewId:reviewId, status:status };
  }
  throw new Error('Automation review item was not found.');
}

function runLvptMorningClientLifecycleReview() { return lvptRunClientLifecycleScan_({ notify:true, source:'Morning schedule' }); }
function runLvptEveningClientLifecycleReview() { return lvptRunClientLifecycleScan_({ notify:true, source:'Evening schedule' }); }

function lvptInstallClientLifecycleTriggers_() {
  var handlers = ['runLvptMorningClientLifecycleReview','runLvptEveningClientLifecycleReview','sendLvptDailyReminderSummary'];
  ScriptApp.getProjectTriggers().forEach(function (trigger) { if (handlers.indexOf(trigger.getHandlerFunction()) !== -1) ScriptApp.deleteTrigger(trigger); });
  ScriptApp.newTrigger('runLvptMorningClientLifecycleReview').timeBased().everyDays(1).atHour(8).create();
  ScriptApp.newTrigger('runLvptEveningClientLifecycleReview').timeBased().everyDays(1).atHour(19).create();
  return { ok:true, message:'Client lifecycle reviews scheduled for morning and evening.', timeZone:Session.getScriptTimeZone() || 'America/New_York', morningHour:8, eveningHour:19 };
}

function installLvptTwiceDailyClientLifecycleTriggers() { return lvptInstallClientLifecycleTriggers_(); }


// Read-only, owner-approved Gmail draft context (no sending, mutation or caching).
// Deploy alongside Code.gs and GmailEvidence.gs. This function only returns the
// currently newest known thread from a hard-coded LVPT business-client domain.
function lvptReadOnlyGmailDraftContext_(eventKey, threadId, expectedLastMessageAt) {
  var domains={
    'lithic':'lithic.com',
    'quinn-emanuel':'quinnemanuel.com',
    'kirkland':'kirkland.com',
    'ows-aws':'ows.com.co',
    'imperativex':'imperativex.com'
  };
  if(!Object.prototype.hasOwnProperty.call(domains,eventKey))
    return {ok:false,message:'Unsupported Gmail client key'};
  if(!/^[a-f0-9]{8,32}$/i.test(String(threadId||'')))
    return {ok:false,message:'Invalid Gmail thread identifier'};
  if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/.test(String(expectedLastMessageAt||'')))
    return {ok:false,message:'A verified last-message date is required'};
  var domain=domains[eventKey], booking='book@pokertraininglasvegas.com';
  var profile=lvptGmailMetaGet_('https://gmail.googleapis.com/gmail/v1/users/me/profile');
  if(String(profile.emailAddress||'').toLowerCase()!==booking)
    return {ok:false,message:'Executing mailbox does not match the LVPT business mailbox'};
  var meta=lvptReadOnlyGmailEvidence_(eventKey);
  if(!meta||meta.connected!==true||!meta.threads||!meta.threads.length)
    return {ok:false,message:'Current bounded Gmail evidence is unavailable'};
  var latest=meta.threads.slice().sort(function(a,b){
    return String(b.lastMessageAt||'').localeCompare(String(a.lastMessageAt||''));
  })[0];
  if(!latest || latest.threadId!==threadId || latest.lastMessageAt!==expectedLastMessageAt)
    return {ok:false,message:'Thread changed since review. Refresh Gmail evidence and obtain approval again'};
  var thread=lvptGmailMetaGet_(
    'https://gmail.googleapis.com/gmail/v1/users/me/threads/'+encodeURIComponent(threadId)+'?format=full'
  );
  var all=thread.messages||[];
  if(!Array.isArray(all)||!all.length)
    return {ok:false,message:'Gmail conversation is empty or unavailable'};
  var items=all.slice(-12), recipient='', transcript=[], totalChars=0;
  var mostRecent=all[all.length-1];
  var latestDate=Number(mostRecent.internalDate||0);
  if(!latestDate||new Date(latestDate).toISOString()!==expectedLastMessageAt)
    return {ok:false,message:'Gmail conversation changed after the owner review'};
  function head(message,name) {
    var headers=(message.payload&&message.payload.headers)||[];
    var found=headers.filter(function(h){return String(h.name||'').toLowerCase()===name.toLowerCase();})[0];
    return String(found&&found.value||'').slice(0,300);
  }
  function address(header) {
    var match=String(header||'').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    return match?match[0].toLowerCase():'';
  }
  function fromClient(header) {
    return lvptDomainInAddress_(header,domain);
  }
  function decodePart(part,depth) {
    if(!part||depth>5)return '';
    if(part.mimeType==='text/plain'&&part.body&&part.body.data) {
      try {
        var raw=Utilities.base64DecodeWebSafe(part.body.data);
        return Utilities.newBlob(raw).getDataAsString('UTF-8');
      }catch(ignore) {return '';}
    }
    var children=part.parts||[];
    for(var k=0;k<children.length;k++){
      var candidate=decodePart(children[k],depth+1);
      if(candidate)return candidate;
    }
    if(part.mimeType==='text/html'&&part.body&&part.body.data) {
      try {
        var bytes=Utilities.base64DecodeWebSafe(part.body.data);
        return Utilities.newBlob(bytes).getDataAsString('UTF-8')
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi,' ')
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi,' ')
          .replace(/<\/(?:p|div|li|tr|h[1-6])>/gi,'\n')
          .replace(/<br\s*\/?\s*>/gi,'\n')
          .replace(/<[^>]*>/g,' ')
          .replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&')
          .replace(/&lt;/gi,'<').replace(/&gt;/gi,'>');
      }catch(ignore2) {return '';}
    }
    return '';
  }
  items.forEach(function(message) {
    var from=head(message,'From'),to=head(message,'To'),cc=head(message,'Cc');
    var sent=(message.labelIds||[]).indexOf('SENT')>=0 || address(from)===booking;
    var clientSender=fromClient(from);
    // Only mailbox-client messages may enter the drafting context.
    // Other participants and internal-only messages are not copied.
    if(!(clientSender||(sent&&(fromClient(to)||fromClient(cc)))))return;
    var direction=clientSender?'inbound':sent?'outbound':'unknown';
    if(direction==='unknown')return;
    if(clientSender)recipient=address(from);
    // Gmail replies often contain the entire prior conversation after the
    // sender's newly authored text. Limit the authored portion FIRST so older
    // quoted histories cannot exhaust the budget before recent messages.
    var visible=lvptGmailDraftVisibleBody_(decodePart(message.payload||{},0));
    var body=visible.body;
    var remaining=Math.max(0,22000-totalChars);
    var max=Math.min(1600,remaining);
    var truncated=visible.truncated||body.length>max;
    body=body.slice(0,max);
    totalChars+=body.length;
    transcript.push({
      direction:direction,
      at:new Date(Number(message.internalDate||0)).toISOString(),
      from:direction==='inbound'?address(from):booking,
      to:direction==='outbound'?address(to):booking,
      body:body,
      truncated:truncated||max<3200
    });
  });
  if(!transcript.length||!recipient||!lvptDomainInAddress_('<'+recipient+'>',domain))
    return {ok:false,message:'Verified client recipient or message context not available'};
  var latestDirection=transcript[transcript.length-1].direction;
  if(latestDirection!==latest.lastDirection)
    return {ok:false,message:'Message direction changed. Recheck the client correspondence'};
  return {
    ok:true,connected:true,eventKey:eventKey,threadId:threadId,
    mailboxIdentityVerified:true,scope:'owner_approved_bounded_full_thread_preview',
    lastMessageAt:expectedLastMessageAt,lastDirection:latestDirection,
    subject:head(mostRecent,'Subject').slice(0,180),
    recipientEmail:recipient,clientDomain:domain,
    messages:transcript,
    partial:all.length>items.length||meta.partial===true||totalChars>=22000,
    observedMessages:all.length,
    checkedAt:new Date().toISOString(),
    advisory:'Read-only source material. Verify context and attachments; no draft was emailed or saved.'
  };
}

// Testable, standalone extractor. Keep only text authored above standard
// quoted-reply boundaries; never truncate latest messages merely because
// older email history contains thousands of quoted characters.
function lvptGmailDraftVisibleBody_(raw) {
  var input=String(raw||'').replace(/\r\n/g,'\n').replace(/\u0000/g,'').trim();
  // Quoted Gmail headers can wrap "On Wed ... <sender> wrote:" across
  // two or three lines. Ignore old quoted requests when reading the current
  // author's message, without removing a real new question.
  var boundary=/\n\s*(?:On\s+(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[^\n]{5,200}(?:\n[^\n]{0,180}){0,2}\s*wrote:|-----Original Message-----|From:\s+[^\n]{3,150}\n\s*Sent:)/i;
  var authored=input.split(boundary)[0].trim();
  var max=1600;
  return {body:authored.slice(0,max),truncated:authored.length>max,
    fullAuthorLength:authored.length};
}

// Read-only test that logs counts, never mail bodies or addresses.
function checkLvptGmailDraftContextReadOnlyNow() {
  var result=lvptReadOnlyGmailEvidence_('lithic');
  if(!result||!result.threads||!result.threads.length)
    throw new Error('No approved metadata thread found for bounded context test');
  var newest=result.threads.slice().sort(function(a,b){
    return String(b.lastMessageAt||'').localeCompare(String(a.lastMessageAt||''));
  })[0];
  var context=lvptReadOnlyGmailDraftContext_('lithic',newest.threadId,newest.lastMessageAt);
  if(!context.ok)throw new Error(context.message||'Draft context test failed');
  Logger.log('LVPT bounded Gmail draft context verified (read-only): messages='+context.messages.length+
    ', partial='+context.partial+', verified mailbox='+context.mailboxIdentityVerified+
    '. No bodies logged, messages sent, or sheets changed.');
  return {ok:true,observedMessages:context.observedMessages,
    includedMessages:context.messages.length,partial:context.partial};
}
// STEP 43 — Read-only, bounded BUSINESS INBOX review.
// This intentionally does not write to Gmail, Sheets, tasks, or CRM.
// Gmail API calls inherit the already-granted gmail.readonly Apps Script scope.
// Returned data includes no message bodies, recipient addresses, or sender emails.
function lvptInboxSafeText_(value,maxLength) {
  return String(value||'').replace(/https?:\/\/\S+/gi,'[link]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,'[email]')
    .replace(/(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g,'[phone]')
    .replace(/\s+/g,' ').trim().slice(0,maxLength);
}
function lvptInboxHeader_(message,name) {
  var headers=message && message.payload && message.payload.headers || [];
  for(var i=0;i<headers.length;i++) {
    if(String(headers[i].name||'').toLowerCase()===name.toLowerCase())
      return String(headers[i].value||'').slice(0,320);
  }
  return '';
}
function lvptInboxEmail_(header) {
  var m=String(header||'').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return m?m[0].toLowerCase():'';
}
function lvptInboxAutomated_(message) {
  var from=lvptInboxEmail_(lvptInboxHeader_(message,'From'));
  var local=from.split('@')[0]||'';
  var subject=lvptInboxHeader_(message,'Subject');
  var auto=lvptInboxHeader_(message,'Auto-Submitted').toLowerCase();
  var precedence=lvptInboxHeader_(message,'Precedence').toLowerCase();
  // Form-system notifications have List-Unsubscribe even when they contain
  // REAL prospective customer inquiries. Admit only this exact known sender
  // and form-submission subject for OWNER REVIEW, not for direct replying.
  // Vercel separately categorizes these as form_notification.
  var trustedFormSubmission=from==='team@b.bizlyapp.com'&&
    /^New Contact Form Submission from\s+.{2,80}$/i.test(subject);
  if(trustedFormSubmission)return false;
  if(auto && auto!=='no')return true;
  if(/^(?:bulk|list|junk)$/.test(precedence))return true;
  if(lvptInboxHeader_(message,'List-Unsubscribe'))return true;
  if(/^(?:no-?reply|do-?not-?reply|notifications?|alerts?|bounce|mailer-daemon|postmaster|billing|receipts?|support-noreply)(?:[+._-]|$)/i.test(local))
    return true;
  if(/(?:google\.com|googleworkspace\.com|stripe\.com|docusign\.net|bizlyapp\.com|mailchimp\.com|constantcontact\.com)$/i.test(from.split('@')[1]||'') &&
     /(?:receipt|report|payment|invoice|alert|security|completed|performance|review|notification)/i.test(subject))
    return true;
  if(/^(?:payment (?:initiated|should have arrived)|you(?:'ve| have) received (?:a )?payment|your (?:monthly )?(?:invoice|performance report)|delivery status notification|undeliverable:|out of office|automatic reply)/i.test(subject))
    return true;
  return false;
}
// A narrow, source-verified relationship hint. No person's email address is
// returned to Vercel. "Unclassified" is not proof the message is a client lead.
function lvptInboxRelationship_(sender,recipient,isFormLead,isSent) {
  var from=String(sender||'').toLowerCase();
  var to=String(recipient||'').toLowerCase();
  if(isFormLead)return 'form_lead';
  // Owner's known personal mailbox is internal, whether sender or recipient.
  if(from==='wsopamatt@gmail.com' || to==='wsopamatt@gmail.com')
    return 'internal';
  // Verified LVPT vendors/venues; classify as operational, never as sales leads.
  if(/@(elevatedbarservices\.com|venetianlasvegas\.com|pokergo\.com)$/i.test(from))
    return 'vendor';
  if(isSent)return 'outbound';
  return 'unclassified';
}
function lvptReadOnlyBusinessInboxReview_(page) {
  page=Number(page);
  if(!Number.isInteger(page)||page<0||page>14)
    return {ok:false,message:'Invalid bounded business inbox page'};
  var mailbox='book@pokertraininglasvegas.com';
  // Verify the executing account: do not scan a connected personal Gmail.
  var profile=lvptGmailMetaGet_('https://gmail.googleapis.com/gmail/v1/users/me/profile');
  if(String(profile.emailAddress||'').toLowerCase()!==mailbox)
    return {ok:false,message:'Business Gmail identity verification failed'};
  var cache=CacheService.getScriptCache();
  var cacheKey='lvpt_business_inbox_review_2026_v4_form_leads_p'+page;
  var cached=cache.get(cacheKey);
  if(cached) {
    try {return JSON.parse(cached);}catch(ignore) {}
  }
  var days=30, cut=new Date(Date.now()-days*86400000);
  var after=Utilities.formatDate(cut,'Etc/UTC','yyyy/MM/dd');
  var query='after:'+after+' to:'+mailbox+
    ' -in:spam -in:trash -category:promotions -category:social';
  // Each request inspects <=20 message slots. Pages 0..14 cover as many as
  // 300 recent messages, without making one Apps Script execution do 300 reads.
  // Gmail can return several messages for one thread: de-duplicate per page
  // and again in the dashboard. No page claims complete mailbox coverage.
  var listGroup=Math.floor(page/5), slotStart=(page%5)*20;
  var pageToken='', listing=null;
  for(var pi=0;pi<=listGroup;pi++) {
    if(pi>0&&!pageToken)
      return {ok:true,connected:true,source:'read_only_business_inbox_metadata',
        mailboxIdentityVerified:true,page:page,nextPage:null,
        checkedAt:new Date().toISOString(),rangeDays:days,
        threads:[],examinedThreads:0,excludedAutomatedCount:0,
        metadataFailures:0,partial:true,fullMailboxChecked:false};
    listing=lvptGmailMetaGet_(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=100&q='+
      encodeURIComponent(query)+(pageToken?'&pageToken='+encodeURIComponent(pageToken):''));
    pageToken=String(listing.nextPageToken||'');
  }
  var messageSlots=(listing.messages||[]).slice(slotStart,slotStart+20);
  var unique=[],found={};
  messageSlots.forEach(function(m) {
    var id=String(m && m.threadId || '');
    if(/^[a-f0-9]{8,32}$/i.test(id)&&!found[id]) {
      found[id]=true;unique.push(id);
    }
  });
  var hasRemaining=slotStart+20<(listing.messages||[]).length;
  var nextPage=hasRemaining?page+1:(pageToken?(listGroup+1)*5:null);
  if(nextPage!==null&&nextPage>14)nextPage=null;
  var maxThreads=20, rows=[],failures=0,excluded=0;
  unique.forEach(function(id) {
    try {
      var thread=lvptGmailMetaGet_(
        'https://gmail.googleapis.com/gmail/v1/users/me/threads/'+
        encodeURIComponent(id)+
        '?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject'+
        '&metadataHeaders=Auto-Submitted&metadataHeaders=Precedence'+
        '&metadataHeaders=List-Unsubscribe');
      var all=thread.messages||[];
      if(!Array.isArray(all)||!all.length)return;
      var latest=all[all.length-1], labels=latest.labelIds||[];
      var from=lvptInboxEmail_(lvptInboxHeader_(latest,'From'));
      var subjectLine=lvptInboxHeader_(latest,'Subject');
      var to=lvptInboxHeader_(latest,'To');
      // GHL builder notifications are often FROM book@ TO book@ and can be
      // labeled SENT by Gmail. Identify these self-addressed form leads
      // by their narrowly matched subject, not by INBOX/SENT labels.
      var formLead=from===mailbox && lvptInboxEmail_(to)===mailbox &&
        /(?:new corporate poker builder lead|poker coaching quiz|survey submission|new .{0,40} lead|website inquiry)/i.test(subjectLine);
      var sent=!formLead && (labels.indexOf('SENT')>=0 || from===mailbox);
      var direction=sent?'outbound':(formLead ||
        (from && lvptInboxEmail_(to)===mailbox)?'inbound':'unknown');
      var stamp=Number(latest.internalDate||0);
      if(!Number.isFinite(stamp)||stamp<=0||stamp>Date.now()+86400000 || direction==='unknown') {
        failures++;return;
      }
      if(direction==='inbound' && !formLead && lvptInboxAutomated_(latest)) {excluded++;return;}
      // If the last message was sent by LVPT, preserve the waiting status even
      // though an older inbound message matched the Gmail search.
      var subject=lvptInboxSafeText_(subjectLine,130);
      var relationship=lvptInboxRelationship_(
        from,lvptInboxEmail_(to),formLead,sent);
      var domain=from.split('@')[1]||'';
      if(!/^[a-z0-9.-]{3,120}$/.test(domain))domain='';
      rows.push({
        threadId:id,subject:subject||'(no subject)',
        senderDomain:sent||formLead?'':domain,
        sourceType:formLead?'form_lead':'email_thread',
        relationshipHint:relationship,
        lastMessageAt:new Date(stamp).toISOString(),lastDirection:direction,
        observedMessages:Math.min(all.length,150),
        fullThreadEnumerated:all.length<=150,
        reviewType:formLead?'form_lead_review':
          direction==='inbound'?'inbound_review':'already_answered',
        needsHumanReview:direction==='inbound'
      });
    }catch(ignore) {
      failures++;
    }
  });
  rows.sort(function(a,b){return b.lastMessageAt.localeCompare(a.lastMessageAt);});
  var result={
    ok:true,connected:true,source:'read_only_business_inbox_metadata',
    mailboxIdentityVerified:true,rangeDays:days,checkedAt:new Date().toISOString(),
    page:page,nextPage:nextPage,pageSize:20,
    threads:rows.slice(0,20),
    examinedThreads:unique.length,
    excludedAutomatedCount:excluded,metadataFailures:failures,
    partial:nextPage!==null||failures>0,
    fullMailboxChecked:false,
    notice:'Review candidates only. No bodies read, no messages sent and no records modified.'
  };
  cache.put(cacheKey,JSON.stringify(result),120);
  return result;
}


// STEP 45 — Explicit, read-only full conversation preview, not AI drafting.
// Retrieve only for a thread the owner selects; never collect full bodies in
// routine inbox scans. No automatic replies, drafts, or writes.
function lvptReadOnlyBusinessInboxThread_(threadId, expectedLastMessageAt) {
  var mailbox='book@pokertraininglasvegas.com';
  if(!/^[a-f0-9]{8,32}$/i.test(threadId))
    return {ok:false,message:'Invalid business Gmail thread identifier'};
  var expected=Date.parse(expectedLastMessageAt);
  if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/.test(expectedLastMessageAt)||
     !Number.isFinite(expected)||expected>Date.now()+86400000 ||
     expected<Date.now()-32*86400000)
    return {ok:false,message:'Recent verified thread timestamp required'};
  var profile=lvptGmailMetaGet_('https://gmail.googleapis.com/gmail/v1/users/me/profile');
  if(String(profile.emailAddress||'').toLowerCase()!==mailbox)
    return {ok:false,message:'Business mailbox identity verification failed'};
  var thread=lvptGmailMetaGet_('https://gmail.googleapis.com/gmail/v1/users/me/threads/'+
    encodeURIComponent(threadId)+'?format=full');
  var all=thread.messages||[];
  if(!Array.isArray(all)||!all.length)
    return {ok:false,message:'Conversation not found'};
  var last=all[all.length-1],lastStamp=Number(last.internalDate||0);
  if(!Number.isFinite(lastStamp)||new Date(lastStamp).toISOString()!==
     new Date(expected).toISOString())
    return {ok:false,message:'Conversation changed. Refresh inbox before review'};
  var involved=all.some(function(m) {
    return lvptInboxEmail_(lvptInboxHeader_(m,'From'))===mailbox ||
      String(lvptInboxHeader_(m,'To')||'').toLowerCase().indexOf(mailbox)>=0 ||
      String(lvptInboxHeader_(m,'Cc')||'').toLowerCase().indexOf(mailbox)>=0;
  });
  if(!involved)return {ok:false,message:'Thread is not associated with LVPT business Gmail'};
  function readText(part,depth) {
    if(!part||depth>5)return '';
    var children=part.parts||[];
    if(part.mimeType==='text/plain'&&part.body&&part.body.data) {
      try {return Utilities.newBlob(Utilities.base64DecodeWebSafe(part.body.data))
        .getDataAsString('UTF-8');}catch(ignore) {}
    }
    for(var p=0;p<children.length;p++){
      var value=readText(children[p],depth+1);
      if(value)return value;
    }
    if(part.mimeType==='text/html'&&part.body&&part.body.data) {
      try {
        return Utilities.newBlob(Utilities.base64DecodeWebSafe(part.body.data))
          .getDataAsString('UTF-8')
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi,' ')
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi,' ')
          .replace(/<\/(?:p|div|li|tr|h[1-6])>/gi,'\n')
          .replace(/<br\s*\/?\s*>/gi,'\n').replace(/<[^>]*>/g,' ')
          .replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&')
          .replace(/&lt;/gi,'<').replace(/&gt;/gi,'>');
      }catch(ignore2) {}
    }
    return '';
  }
  var messages=[],used=0,partial=all.length>10;
  // Reserve bounded excerpt budget for the NEWEST message first. A lengthy
  // historical conversation must never crowd out the current client email.
  // Restore chronological order only after all excerpts are allocated.
  all.slice(-10).reverse().forEach(function(m) {
    var from=lvptInboxEmail_(lvptInboxHeader_(m,'From'));
    var to=lvptInboxEmail_(lvptInboxHeader_(m,'To'));
    var subject=lvptInboxHeader_(m,'Subject');
    var form=from===mailbox&&to===mailbox&&
      /(?:new corporate poker builder lead|poker coaching quiz|survey submission|new .{0,40} lead|website inquiry)/i.test(subject);
    var sent=!form && ((m.labelIds||[]).indexOf('SENT')>=0||from===mailbox);
    var at=Number(m.internalDate||0);
    if(!Number.isFinite(at)||at<=0)return;
    var authored=lvptGmailDraftVisibleBody_(readText(m.payload||{},0));
    var maximum=Math.max(0,Math.min(1100,9500-used));
    var body=String(authored.body||'').slice(0,maximum)
      .replace(/https?:\/\/\S+/gi,'[link]')
      .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,'[email]')
      .replace(/(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g,'[phone]');
    used+=body.length;
    var relationship=lvptInboxRelationship_(from,to,form,sent);
    messages.push({
      at:new Date(at).toISOString(),
      direction:form?'form_lead':sent?'outbound':to===mailbox?'inbound':'other',
      relationshipHint:relationship,
      senderDomain:sent||form?'':String(from.split('@')[1]||'').slice(0,120),
      excerpt:body,
      truncated:authored.truncated||String(authored.body||'').length>maximum||
        maximum===0,
      hasAttachments:(m.payload&&m.payload.parts||[]).some(function(part){
        return Boolean(part.filename);
      })
    });
  });
  messages.reverse();
  return {
    ok:true,connected:true,source:'read_only_business_thread_preview',
    mailboxIdentityVerified:true,threadId:threadId,
    lastMessageAt:new Date(lastStamp).toISOString(),
    checkedAt:new Date().toISOString(),
    totalMessages:all.length,partial:partial||used>=9500,
    messages:messages,
    advisory:'Selected thread only. Redacted excerpts, not attachments. No Gmail drafts, email sends, AI calls, or CRM writes.'
  };
}


// STEP 48 — Verified sender and owner-only gated send.
// No automatic emails, schedules or batch sends. These functions are invoked
// exclusively through the authenticated Vercel bridge after a recorded owner
// approval. The write action is OFF until LVPT explicitly opts in by setting
// LVPT_ENABLE_OWNER_APPROVED_GMAIL_SEND=true in Script Properties. Never
// expose the shared secret or enable the write property for an untested release.
function lvptStep48VerifyReplyRecipient_(threadId,expectedLastMessageAt) {
  var mailbox='book@pokertraininglasvegas.com';
  if(!/^[a-f0-9]{8,32}$/i.test(threadId))
    return {ok:false,message:'Invalid Gmail thread ID'};
  var expected=Date.parse(expectedLastMessageAt);
  if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/.test(expectedLastMessageAt)||
    !isFinite(expected)||expected>Date.now()+86400000||
    expected<Date.now()-32*86400000)
    return {ok:false,message:'Recent verified last-message timestamp required'};
  var profile=lvptGmailMetaGet_('https://gmail.googleapis.com/gmail/v1/users/me/profile');
  if(String(profile.emailAddress||'').toLowerCase()!==mailbox)
    return {ok:false,message:'Authenticated sender is not LVPT business Gmail'};
  var prior=lvptReadOnlyBusinessInboxThread_(threadId,expectedLastMessageAt);
  // A long conversation can exceed the ten-message *display* window.
  // That alone cannot make the verified latest incoming email invalid.
  // Human review of ALL original history is separately required by the
  // Vercel owner-approval audit. Never allow a truncated latest message.
  if(prior.ok!==true||prior.mailboxIdentityVerified!==true ||
    !prior.messages.length||!Number.isInteger(prior.totalMessages)||
    prior.totalMessages>150 ||
    (prior.partial!==true&&prior.messages.length!==prior.totalMessages))
    return {ok:false,message:'Business conversation cannot be verified within the bounded review limit'};
  var priorLast=prior.messages[prior.messages.length-1];
  if(priorLast.direction!=='inbound'||priorLast.relationshipHint!=='unclassified'||
    priorLast.hasAttachments||priorLast.truncated||!priorLast.excerpt.trim())
    return {ok:false,message:'Not a complete verified external client request'};
  var thread=lvptGmailMetaGet_('https://gmail.googleapis.com/gmail/v1/users/me/threads/'+
    encodeURIComponent(threadId)+'?format=metadata&metadataHeaders=From'+
    '&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Reply-To'+
    '&metadataHeaders=Message-ID&metadataHeaders=References'+
    '&metadataHeaders=Auto-Submitted&metadataHeaders=List-Unsubscribe'+
    '&metadataHeaders=Precedence');
  var all=thread.messages||[];
  if(!Array.isArray(all)||!all.length)return {ok:false,message:'Conversation not found'};
  var last=all[all.length-1];
  if(new Date(Number(last.internalDate||0)).toISOString()!==
    new Date(expected).toISOString())
    return {ok:false,message:'Conversation changed since owner review'};
  var from=lvptInboxEmail_(lvptInboxHeader_(last,'From'));
  var replyTo=lvptInboxEmail_(lvptInboxHeader_(last,'Reply-To'));
  var to=lvptInboxEmail_(lvptInboxHeader_(last,'To'));
  if(to!==mailbox||!from||from===mailbox ||
    /@(?:[a-z0-9-]+\.)*bizlyapp\.com$/i.test(from) ||
    (replyTo&&replyTo!==from)||lvptInboxAutomated_(last) ||
    (last.labelIds||[]).indexOf('SENT')>=0 ||
    lvptInboxRelationship_(from,to,false,false)!=='unclassified')
    return {ok:false,message:'Recipient or source relationship cannot be verified'};
  if(!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(from)||
    from.length>254||/[,\r\n<>]/.test(from))
    return {ok:false,message:'Single external sender address cannot be verified'};
  // Cross-thread duplicate guard. A client may have already been answered
  // through a DIFFERENT subject or conversation. Never rely solely on the
  // selected Gmail thread's last inbound/outbound direction.
  //
  // This search is bounded (25 messages) and uses only verified LVPT Sent
  // metadata. Any paging or unexpected source data fails CLOSED. Results
  // are not logged, stored in a CRM, or exposed in the public inbox list.
  var cutoff=Utilities.formatDate(new Date(expected-86400000),
    'Etc/UTC','yyyy/MM/dd');
  var sentQuery='in:sent to:'+from+' after:'+cutoff+' -in:trash';
  var sentListing=lvptGmailMetaGet_(
    'https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=25&q='+
    encodeURIComponent(sentQuery));
  if(!sentListing||typeof sentListing!=='object'||
    (sentListing.messages!==undefined&&!Array.isArray(sentListing.messages))||
    sentListing.nextPageToken)
    return {ok:false,message:'Sent-mail duplicate check is incomplete; manually review this client'};
  // Gmail omits the "messages" array entirely when there are zero matches.
  var foundSent=sentListing.messages||[];
  for(var si=0;si<foundSent.length;si++) {
    var candidate=foundSent[si];
    if(!candidate||!(/^[a-f0-9]{8,32}$/i.test(String(candidate.id||''))))
      return {ok:false,message:'Sent-mail search yielded an invalid message'};
    var sentMeta=lvptGmailMetaGet_(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages/'+
      encodeURIComponent(candidate.id)+
      '?format=metadata&metadataHeaders=To&metadataHeaders=From');
    var sentAt=Number(sentMeta.internalDate||0);
    var sentFrom=lvptInboxEmail_(lvptInboxHeader_(sentMeta,'From'));
    var sentTo=String(lvptInboxHeader_(sentMeta,'To')||'').toLowerCase();
    if(!Number.isFinite(sentAt)||sentAt<=0||
      sentFrom!==mailbox||!Array.isArray(sentMeta.labelIds)||
      sentMeta.labelIds.indexOf('SENT')<0)
      return {ok:false,message:'Sent-mail metadata was not verifiable'};
    // Inspect exact address tokens rather than substring matches, so
    // client@example.com cannot match other-client@example.com.
    var outgoingRecipients=sentTo.match(
      /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/ig)||[];
    if(sentAt>expected&&outgoingRecipients.indexOf(from)>=0)
      return {ok:false,message:'LVPT has sent this contact a newer email; verify full history to avoid duplicate outreach'};
  }
  var subject=lvptInboxHeader_(last,'Subject').replace(/\s+/g,' ').trim();
  var msgId=lvptInboxHeader_(last,'Message-ID').trim();
  var refs=lvptInboxHeader_(last,'References').trim();
  if(!subject||subject.length>160||/[\r\n]/.test(subject)||
    !/^<[^<>\r\n ]{3,180}>$/.test(msgId)||
    (refs && /[\r\n]/.test(refs)))
    return {ok:false,message:'Threading headers are missing or unsafe'};
  return {
    ok:true,source:'verified_lvpt_gmail_reply_recipient',
    mailboxIdentityVerified:true,threadId:threadId,
    lastMessageAt:new Date(expected).toISOString(),
    recipient:from,subject:subject,lastGmailMessageId:String(last.id||''),
    inReplyTo:msgId,references:refs,
    fullHistoryRequiresOwnerReview:prior.partial===true,
    totalMessages:prior.totalMessages,
    // The ability to SEND is separately gated on both systems.
    sendingEnabled:lvptProperties_().getProperty(
      'LVPT_ENABLE_OWNER_APPROVED_GMAIL_SEND')==='true'
  };
}
function lvptStep48SendApprovedReply_(payload) {
  if(lvptProperties_().getProperty('LVPT_ENABLE_OWNER_APPROVED_GMAIL_SEND')!=='true')
    return {ok:false,message:'Live Gmail sending has not been enabled by LVPT'};
  var intent=String(payload.intentId||'').toLowerCase();
  var threadId=String(payload.threadId||'');
  var lastAt=String(payload.expectedLastMessageAt||'');
  var recipient=String(payload.recipient||'').trim().toLowerCase();
  var subject=String(payload.subject||'').trim();
  var body=String(payload.body||'');
  if(!/^[0-9a-f]{8}-[0-9a-f-]{27,36}$/.test(intent)||
    !/^[a-f0-9]{8,32}$/i.test(threadId)||body.length<45||body.length>5000||
    subject.length<5||subject.length>180||/[\r\n]/.test(subject)||
    /[\r\n,<>]/.test(recipient))
    return {ok:false,message:'Invalid owner-approved reply content'};
  var verified=lvptStep48VerifyReplyRecipient_(threadId,lastAt);
  if(verified.ok!==true)return verified;
  if(verified.recipient!==recipient)
    return {ok:false,message:'Recipient changed; sender verification must restart'};
  function canonical(value) {
    return String(value||'').replace(/^(?:(?:re|fw|fwd):\s*)+/ig,'')
      .replace(/\s+/g,' ').trim().toLowerCase();
  }
  if(canonical(subject)!==canonical(verified.subject))
    return {ok:false,message:'Edited subject no longer matches the verified Gmail thread'};
  var referenceLine=(verified.references?
    verified.references+' '+verified.inReplyTo:verified.inReplyTo).trim();
  if(referenceLine.length>420)
    return {ok:false,message:'Thread references exceed safe header length'};
  var mailSubject='=?UTF-8?B?'+Utilities.base64Encode(
    Utilities.newBlob('Re: '+canonicalSubject_(verified.subject)).getBytes())+'?=';
  var bodyB64=Utilities.base64Encode(Utilities.newBlob(
    body.replace(/\r?\n/g,'\r\n')).getBytes()).replace(/.{1,76}/g,'$&\r\n').trim();
  var raw=[
    'From: Las Vegas Poker Training <book@pokertraininglasvegas.com>',
    'To: '+recipient,
    'Subject: '+mailSubject,
    'In-Reply-To: '+verified.inReplyTo,
    'References: '+referenceLine,
    'Message-ID: <lvpt-'+intent+'@pokertraininglasvegas.com>',
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    bodyB64
  ].join('\r\n');
  // One direct call only; never retry if Gmail's response is uncertain.
  var response=UrlFetchApp.fetch(
    'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',{
      method:'post',contentType:'application/json',
      headers:{Authorization:'Bearer '+ScriptApp.getOAuthToken()},
      payload:JSON.stringify({
        threadId:threadId,
        raw:Utilities.base64EncodeWebSafe(Utilities.newBlob(raw).getBytes())
          .replace(/=+$/,'')
      }),
      muteHttpExceptions:true
    });
  var status=response.getResponseCode();
  if(status<200||status>=300)
    return {ok:false,message:'Gmail send result was not successful; inspect Sent before retrying'};
  var sent=JSON.parse(response.getContentText()||'{}');
  if(!/^[a-f0-9]{8,32}$/i.test(String(sent.id||'')) ||
    String(sent.threadId||'')!==threadId)
    return {ok:false,message:'Gmail response could not be confirmed. Inspect Sent; do not retry'};
  return {ok:true,source:'lvpt_owner_approved_gmail_send',
    gmailMessageId:String(sent.id),threadId:threadId,
    mailboxIdentityVerified:true};
}
function canonicalSubject_(subject) {
  return String(subject||'').replace(/^(?:(?:re|fw|fwd):\s*)+/ig,'')
    .replace(/\s+/g,' ').trim();
}
