// Prepared append-only Gmail ingestion. It is not registered in doPost, so the
// current web app cannot run it. The live web app is shared with production.
// Do not clasp push this file until the owner reviews it and deploys a staging
// web app. It never sends mail and it never rewrites existing Gmail Activity rows.

function lvptIngestGmailIncremental_() {
  var properties = lvptProperties_();
  var cursor = properties.getProperty('LVPT_GMAIL_INGEST_CURSOR') || '2026/01/01';
  var query = 'after:' + cursor + ' -in:spam -in:trash';
  var listing = lvptGmailMetaGet_('https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=25&q=' + encodeURIComponent(query));
  var messages = listing.messages || [];
  var sheet = lvptSpreadsheet_().getSheetByName('Gmail Activity');
  if (!sheet) throw new Error('Missing sheet: Gmail Activity');
  var existing = {};
  lvptSheetObjects_('Gmail Activity').forEach(function(row) {
    var messageId = String(row.message_id || '').trim();
    if (messageId) existing[messageId] = true;
  });
  var eventsByEmail = {};
  lvptSheetObjects_('Events').forEach(function(row) {
    var email = String(row.contact_email || '').trim().toLowerCase();
    var eventId = String(row.event_id || '').trim();
    if (!email || !eventId) return;
    eventsByEmail[email] = eventsByEmail[email] || [];
    eventsByEmail[email].push(eventId);
  });
  var created = 0;
  var duplicates = 0;
  var ambiguous = 0;
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function(header) {
    return String(header || '').trim();
  });
  messages.forEach(function(item) {
    var messageId = String(item.id || '');
    if (!messageId || existing[messageId]) {
      duplicates++;
      return;
    }
    var message = lvptGmailMetaGet_('https://gmail.googleapis.com/gmail/v1/users/me/messages/' + encodeURIComponent(messageId) + '?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date');
    var headerRows = (message.payload && message.payload.headers) || [];
    function header(name) {
      var found = headerRows.filter(function(row) { return String(row.name || '').toLowerCase() === name; })[0];
      return String(found && found.value || '');
    }
    var from = header('from');
    var match = from.toLowerCase().match(/[a-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
    var email = match ? match[0] : '';
    var eventIds = eventsByEmail[email] || [];
    var eventId = eventIds.length === 1 ? eventIds[0] : '';
    if (eventIds.length > 1) ambiguous++;
    var record = {
      gmail_activity_id: 'ingest-' + messageId.slice(0, 40),
      event_id: eventId,
      thread_id: String(message.threadId || ''),
      message_id: messageId,
      direction: /book@pokertraininglasvegas\.com/i.test(from) ? 'sent' : 'received',
      message_date: message.internalDate ? new Date(Number(message.internalDate)).toISOString() : '',
      from_email: from.slice(0, 200),
      to_email: header('to').slice(0, 200),
      cc_email: '',
      subject: header('subject').slice(0, 180),
      snippet: '',
      gmail_url: '',
      matched_terms: eventIds.length === 1 ? 'exact-contact-email' : eventIds.length > 1 ? 'ambiguous-contact-email' : 'unmatched',
      task_created: false,
      last_synced_at: new Date().toISOString()
    };
    sheet.appendRow(headers.map(function(name) { return Object.prototype.hasOwnProperty.call(record, name) ? record[name] : ''; }));
    existing[messageId] = true;
    created++;
  });
  var completedAt = new Date().toISOString();
  properties.setProperty('LVPT_GMAIL_INGEST_LAST_ATTEMPT', completedAt);
  properties.setProperty('LVPT_GMAIL_INGEST_LAST_SUCCESS', completedAt);
  return {
    ok: true,
    writesPerformed: created > 0,
    examined: messages.length,
    created: created,
    duplicates: duplicates,
    ambiguous: ambiguous,
    lastAttempt: completedAt,
    lastSuccess: completedAt
  };
}
