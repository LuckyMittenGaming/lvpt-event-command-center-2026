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
  var boundary=/\n\s*(?:On\s+[^\n]{5,180}\s+wrote:|-----Original Message-----|From:\s+[^\n]{3,150}\n\s*Sent:)/i;
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
