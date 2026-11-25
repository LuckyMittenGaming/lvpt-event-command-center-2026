// LVPT Event Command Center - bounded read-only Gmail thread metadata.
// Deployed only behind the existing secret-guarded doPost action.
// Never return message bodies, snippets, attachments or email addresses.
// No send, draft, archive, label or delete operations.
function lvptReadOnlyGmailEvidence_(eventKey) {
  var domains = {
    'lithic': 'lithic.com',
    'quinn-emanuel': 'quinnemanuel.com',
    'kirkland': 'kirkland.com',
    'ows-aws': 'ows.com.co',
    'imperativex': 'imperativex.com'
  };
  var labels = {
    'lithic': 'Lithic',
    'quinn-emanuel': 'Quinn Emanuel',
    'kirkland': 'Kirkland & Ellis',
    'ows-aws': 'OWS',
    'imperativex': 'ImperativeX'
  };
  if (!Object.prototype.hasOwnProperty.call(domains, eventKey)) {
    return {ok: false, message: 'Unsupported or unverified Gmail event key'};
  }

  var cache = CacheService.getScriptCache();
  var cacheKey = 'lvpt_gmail_meta_v1_' + eventKey;
  var saved = cache.get(cacheKey);
  if (saved) {
    try { return JSON.parse(saved); } catch (ignored) {}
  }

  // Fail closed if this script would query a different Google mailbox.
  // Gmail API 'me' always means the account executing this Apps Script.
  var profile = lvptGmailMetaGet_('https://gmail.googleapis.com/gmail/v1/users/me/profile');
  if (String(profile.emailAddress || '').trim().toLowerCase() !== 'book@pokertraininglasvegas.com') {
    throw new Error('Gmail metadata source must execute as book@pokertraininglasvegas.com');
  }

  var domain = domains[eventKey];
  // Only approved fixed domains are interpolated into the Gmail query.
  var query = 'after:2026/01/01 {from:' + domain + ' to:' + domain + '} -in:spam -in:trash';
  var url = 'https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=60&q=' + encodeURIComponent(query);
  var listing = lvptGmailMetaGet_(url);
  var ids = [];
  (listing.messages || []).forEach(function(item) {
    if (item && item.threadId && ids.indexOf(item.threadId) < 0 && ids.length < 8) ids.push(item.threadId);
  });

  var threads = [];
  var failedThreads = 0;
  ids.forEach(function(threadId) {
    try {
      var thread = lvptGmailMetaGet_(
        'https://gmail.googleapis.com/gmail/v1/users/me/threads/' + encodeURIComponent(threadId) +
        '?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc'
      );
      var msgs = (thread.messages || []).slice(-150);
      if (!msgs.length) return;

      var outbound = false;
      var inbound = false;
      var hasClient = false;
      var clean = [];
      msgs.forEach(function(message) {
        var headers = (message.payload && message.payload.headers) || [];
        function getHeader(name) {
          var h = headers.filter(function(v) {
            return String(v.name || '').toLowerCase() === name.toLowerCase();
          })[0];
          return String(h && h.value || '');
        }
        var from = getHeader('From');
        var to = getHeader('To');
        var cc = getHeader('Cc');
        if (lvptDomainInAddress_(from, domain) ||
            lvptDomainInAddress_(to, domain) ||
            lvptDomainInAddress_(cc, domain)) hasClient = true;

        var messageLabels = message.labelIds || [];
        var isSent = messageLabels.indexOf('SENT') >= 0 ||
          /(?:^|[<,\s])book@pokertraininglasvegas\.com(?:[>,\s]|$)/i.test(from);
        if (isSent) outbound = true;
        else if (lvptDomainInAddress_(from, domain)) inbound = true;

        clean.push({
          internalDate: Number(message.internalDate || 0),
          direction: isSent ? 'outbound' : lvptDomainInAddress_(from, domain) ? 'inbound' : 'unknown',
          subject: getHeader('Subject')
        });
      });
      if (!hasClient) return;
      clean.sort(function(a, b) { return a.internalDate - b.internalDate; });
      var latest = clean[clean.length - 1];
      var label = String(latest.subject || '(no subject)')
        .replace(/https?:\/\/\S+/gi, '[link]')
        .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email]')
        .replace(/\b(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g, '[phone]')
        .replace(/\s+/g, ' ').trim().slice(0, 140);
      threads.push({
        threadId: String(threadId).slice(0, 60),
        subject: label,
        lastMessageAt: latest.internalDate > 0 ? new Date(latest.internalDate).toISOString() : '',
        lastDirection: latest.direction,
        hasOutboundMessage: outbound,
        hasInboundMessage: inbound,
        observedMessages: clean.length,
        fullThreadEnumerated: (thread.messages || []).length <= 150
      });
    } catch (ignored) {
      // A failure reduces coverage. It must never imply that a client did not reply.
      failedThreads++;
    }
  });

  threads.sort(function(a, b) {
    return String(b.lastMessageAt).localeCompare(String(a.lastMessageAt));
  });
  var result = {
    ok: true,
    connected: true,
    eventKey: eventKey,
    clientLabel: labels[eventKey],
    gmailEvidenceScope: 'bounded_domain_matched_message_headers_only',
    fullMailboxChecked: false,
    partial: Boolean(listing.nextPageToken) || ids.length >= 8 || failedThreads > 0,
    metadataFailures: failedThreads,
    checkedAt: new Date().toISOString(),
    threads: threads
  };
  // Script-private cache: at most ten minutes; sanitized metadata only.
  cache.put(cacheKey, JSON.stringify(result), 600);
  return result;
}

function lvptDomainInAddress_(header, domain) {
  var escaped = String(domain).replace(/\./g, '\\.');
  return new RegExp('(^|[<,\\s])[^<>,\\s]*@' + escaped + '(?=[>,\\s]|$)', 'i')
    .test(String(header || ''));
}

function lvptGmailMetaGet_(url) {
  var response = UrlFetchApp.fetch(url, {
    method: 'get',
    muteHttpExceptions: true,
    followRedirects: false,
    headers: {Authorization: 'Bearer ' + ScriptApp.getOAuthToken()},
    contentType: 'application/json'
  });
  if (response.getResponseCode() !== 200) {
    throw new Error('Read-only Gmail metadata unavailable (HTTP ' + response.getResponseCode() + ')');
  }
  return JSON.parse(response.getContentText());
}

// Optional owner-run check. Only logs counts and coverage flags; it changes nothing.
function checkLvptGmailEvidenceReadOnlyNow() {
  var result = lvptReadOnlyGmailEvidence_('imperativex');
  if (!result.ok || !result.connected) throw new Error('Gmail metadata connection unavailable');
  Logger.log('LVPT Gmail read-only check: connected=%s, threads=%s, partial=%s, failures=%s. No email or sheet records changed.',
    result.connected, result.threads.length, result.partial, result.metadataFailures);
  return {connected: result.connected, threadCount: result.threads.length, partial: result.partial, failures: result.metadataFailures};
}
