(function(root,factory) {
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.LVPTReplyQualification=api;
})(typeof window==='undefined'?null:window,function(){
  'use strict';

  // Step 46: rule-first qualification of one explicitly opened, read-only
  // conversation. Input is ONLY the pre-redacted message excerpts already
  // loaded in the owner's browser tab. Never sends client data to an AI model,
  // stores it, authorizes a draft, or contacts a client.
  const OUTCOMES=Object.freeze({
    manual_review:'Human review needed',
    reply_candidate:'Potential reply needed — verify status',
    monitor:'Monitor — no reply suggested',
    client_declined:'Client declined — no sales follow-up',
    hold:'Client reviewing / unavailable — hold',
    vendor_operations:'Vendor / venue operations — review',
    operational_notice:'Contract / document notification — operations review',
    talent_operations:'Professional talent / instructor — operations review',
    form_notification:'Website contact-form lead — verify real customer', 
    internal:'Internal correspondence — no sales outreach'
  });

  function result(outcome,reason,signals=[],nextStep='Review the complete original Gmail thread and CRM before taking action.') {
    return {
      outcome,label:OUTCOMES[outcome]||OUTCOMES.manual_review,
      reason,signals,confidence:'rule-based',
      safeToAutoSend:false,authorizesDraft:false,
      requiresHumanDecision:true,nextStep
    };
  }
  function norm(v) {
    return String(v==null?'':v).replace(/\s+/g,' ').trim().slice(0,2400);
  }
  const decline=/(?:\b(?:not|no longer|won['’]?t|will not|aren['’]?t|are not|have decided not to|decided not to)\s+(?:be\s+)?(?:moving forward|proceed(?:ing)?|interested|need(?:ing)?)\b|\b(?:went|going|move|moving)\s+(?:with|in)\s+(?:another|a different)\s+(?:direction|provider|option)\b|\b(?:cancel(?:led|ed)?|declin(?:e|ed)|not this time)\b)/i;
  const holding=/(?:\b(?:out of town|out of (?:the )?office|on vacation|on holiday|on leave)\b|\b(?:when (?:i|we)['’]?(?:m|re)? back|once (?:i|we)['’]?(?:m|re)? back|back in (?:a few|several|two|three)\s+weeks?)\b|\b(?:still reviewing|internal review|internal approval|review with (?:my|our|the)|share (?:it|this) with (?:the )?(?:team|leadership)|get back to you|be in touch|follow up (?:when|after))\b)/i;
  const courtesy=/^(?:(?:hi|hello|hey|dear)\b[^,.!?\n]{0,30}[,.!]\s*)?(?:(?:thanks?(?:\s+so much)?|thank you(?:\s+(?:very much|again))?|perfect|great|awesome|sounds good|got it|received|all set|understood|appreciated|much appreciated|will do|that works|absolutely|no problem|you['’]?re welcome|glad to hear it)(?:[\s.!,-]*(?:you|again|matt|team|for (?:the|your|all)|very much|so much|everyone|guys))?[\s.!,-]*){1,5}$/i;
  const completedAcknowledgement=/^(?:(?:thanks?(?:\s+again)?|thank you(?:\s+again)?)[.!,-]?\s*)?(?:this|it|the invoice|the document|the payment|the agreement)\s+(?:has\s+been|was|is)\s+(?:submitted|sent|received|processed|paid)(?:\s+(?:to|by)\s+(?:accounting|our team))?[.!]*$/i;
  // Friendly acknowledgement with a non-actionable plan to connect later.
  // Anchored: any additional question, ask or request fails this pattern.
  const cordialAcknowledgement=/^(?:(?:awesome|great|perfect|excellent)[!.]\s*)?(?:thanks?(?:\s+you)?(?:\s+for\s+(?:this|that|the\s+(?:update|info(?:rmation)?|details|email|message|introduction|intro|referral)))?)(?:[!.]\s*|\s+and\s+)?(?:(?:i\s+)?l?look(?:ing)?\s+forward\s+to\s+(?:connecting|speaking|talking|catching up|seeing you)(?:\s+with\s+you)?(?:\s+(?:(?:this|next)\s+)?(?:weekend|week|month)|\s+soon)?[!.]*)?$/i;
  // Two named thank-yous in an introduction thread are an acknowledgement,
  // not a fresh sales request, provided the COMPLETE authored message
  // contains nothing beyond these thanks.
  const namedThankYou=/^(?:thank\s+you\s+(?:[a-z][a-z.'’-]*\s+){1,3}for\s+(?:the|your)\s+(?:intro(?:duction)?|email|message|note|update|connection|referral)(?:\s+and\s+|[.!]\s*|$)){1,3}[.!\s]*$/i;
  const request=/(?:\?|\b(?:can|could|would|will|do|does|is|are|have|has)\s+(?:you|we|your team|the team)\b|\b(?:what|when|where|which)\s+(?:is|are|would|can|do|does|will|time|date|options|pricing)\b|\bhow\s+(?:much|many|soon|long)\b|\bplease\s+(?:send|confirm|provide|share|advise|clarify|explain|update|quote|review|check|schedule|call)\b|\b(?:we|i)\s+(?:need|would like|want)\s+(?:a|an|the|to|you|your)\b)/i;

  function qualifyThread(metadata,context,nowMs=Date.now()) {
    const messages=Array.isArray(context?.messages)?context.messages:[];
    if(!metadata||!context||metadata.threadId!==context.threadId||
       String(metadata.lastMessageAt||'')!==String(context.lastMessageAt||'')||
       !messages.length||messages.length>10)
      return result('manual_review','The selected thread or its timestamp could not be verified.',
        ['Thread revision unverified']);
    const latest=messages[messages.length-1];
    const expected=Date.parse(String(context.lastMessageAt||''));
    const latestAt=Date.parse(String(latest?.at||''));
    if(!Number.isFinite(expected)||expected>nowMs+86400000||
       !Number.isFinite(latestAt)||latestAt!==expected)
      return result('manual_review','Conversation chronology could not be verified.',
        ['Latest-message mismatch']);
    const direction=String(latest?.direction||'');
    const relationship=String(metadata.relationshipHint||'unclassified');
    const verifiedRole=String(latest?.relationshipHint||'unclassified');
    if(relationship==='internal'||verifiedRole==='internal')
      return result('internal','This thread belongs to internal owner correspondence.',
        ['Internal relationship verified'],'Review only for operational follow-through. Do not generate a client sales email.');
    if(direction==='outbound')
      return result('monitor','The latest message was sent by LVPT.',
        ['LVPT replied last'],'Check other communications before any later follow-up; do not send a duplicate response.');
    if(!['inbound','form_lead'].includes(direction))
      return result('manual_review','The latest message is not verified as an external inquiry.',
        ['Ambiguous message direction']);
    if(relationship==='talent'||verifiedRole==='talent')
      return result('talent_operations',
        'Verified professional poker talent correspondence, not a customer inquiry.',
        ['LVPT training professional'],
        'Review teaching, speaker and event commitments separately. Do not draft a sales reply.');
    // Verified DocuSign platform correspondence may require signing or
    // document tracking, but never a prospect-reply draft.
    if(relationship==='operational_notice')
      return result('operational_notice',
        'Electronic signature or contract service notice, not an incoming sales inquiry.',
        ['Operational document workflow'],
        'Review the document or signing status in Gmail and the client event record. Do not draft a customer sales reply.');
    if(relationship==='form_notification')
      return result('form_notification',
        'This inquiry was delivered by a form platform, not directly by the customer.',
        ['Third-party form submission'],
        'Verify the actual requester, any prior replies, and CRM status before drafting. Never reply to the form service sender.');
    const formLead=direction==='form_lead'||metadata.sourceType==='form_lead';
    const vendor=relationship==='vendor'||verifiedRole==='vendor';
    // Use the current author's visible message, never quoted older questions
    // or long signatures. The original excerpt remains intact in the browser.
    const preview=typeof window!=='undefined'&&window.LVPTMessagePreview?
      window.LVPTMessagePreview:typeof require==='function'?
      require('./message-preview.js'):null;
    const focusedPreview=preview?preview.focus(latest?.excerpt):null;
    const focused=String(focusedPreview?.body||latest?.excerpt||'');
    // Clients often begin with a standalone "Matt" before a short closing.
    // Ignore only a narrow, recognized greeting for classification.
    const withoutGreeting=focused.replace(
      /^(?:(?:hi|hello|hey|dear)\s+)?(?:matt|matthew|team|everyone)[,!:]?[ \t]*\n(?:[ \t]*\n)+/i,'');
    const body=norm(withoutGreeting);
    const hasQuestion=request.test(body);
    // "We need to share this with leadership" is a timing hold, not a
    // request for LVPT. A clear question/direct imperative may override it.
    const directAsk=/\?|\b(?:can|could|would|do|does|is|are|have|has)\s+(?:you|we|your team|the team)\b|\bplease\s+(?:send|confirm|provide|share|advise|clarify|update|quote|schedule|call)\b/i.test(body);
    const isDecline=decline.test(body);
    const isHolding=holding.test(body);
    const isCourtesy=courtesy.test(body)||namedThankYou.test(body)||
      cordialAcknowledgement.test(body);
    const incomplete=context.partial===true||
      latest?.truncated===true||latest?.hasAttachments===true||
      messages.length<Number(context.totalMessages||0);

    if(vendor) {
      return result('vendor_operations',
        hasQuestion?'The vendor may be requesting an operational response.':
          'This is vendor or venue correspondence, not a client prospect.',
        [hasQuestion?'Vendor request detected':'Vendor relationship verified'],
        'Review venue/vendor obligations and supporting documents; do not classify as sales outreach.');
    }
    if(formLead) {
      return result('manual_review',
        'This is a website form notification, not an email directly from the prospective client.',
        ['Form lead: recipient not verified'],
        'Identify the real requester, check CRM and all prior replies, then explicitly approve any client draft.');
    }
    if(!body)
      return result('manual_review','The last message has no readable excerpt.',
        ['Missing message text']);
    // Short, COMPLETE acknowledgements can close a long conversation even
    // when earlier history was intentionally omitted. Truncation/attachments
    // still demand full human review, and an actual request always wins.
    const quoteOnlyTruncation=latest.truncated===true&&
      focusedPreview?.quotedHistorySeen===true;
    if((isCourtesy||completedAcknowledgement.test(body))&&!hasQuestion&&
       (latest.truncated!==true||quoteOnlyTruncation)&&
       latest.hasAttachments!==true)
      return result('monitor',
        'The latest complete message appears to acknowledge prior correspondence, without requesting a new response.',
        ['Client acknowledgement or submission confirmation'],
        'Monitor the associated event or payment separately. Do not send a duplicate email.');
    if(latest?.truncated===true||latest?.hasAttachments===true)
      return result('manual_review',
        'The newest message itself is truncated or contains an unread attachment.',
        ['Latest message incomplete'],
        'Inspect the entire email and any attachments. Automatic drafting and sending are blocked.');
    if(isDecline && !directAsk)
      return result('client_declined','The client appears to have declined or stopped the opportunity.',
        ['Decline language found'],
        'Record or verify the decline in the CRM. Do not create a sales follow-up.');
    if(isHolding && !directAsk)
      return result('hold','The client indicates a review, absence, or intention to respond later.',
        ['Client-controlled timing'],
        'Respect their timing; consult the full thread before considering a later follow-up.');
    // Older omitted messages are NOT proof a client doesn't need a reply.
    // For a clear NEW request, allow human review only after the owner checks
    // the complete original Gmail conversation and CRM status.
    if(incomplete&&hasQuestion&&directAsk&&Number(context.totalMessages||0)<=150)
      return result('reply_candidate',
        'The newest message contains an explicit request, but older email history is omitted.',
        ['Full original thread review required','Possible new request'],
        'Read the COMPLETE original Gmail conversation, other replies and event notes before preparing a response. No automatic sending.');
    if(incomplete)
      return result('manual_review',
        'Conversation history is omitted, truncated, or contains an unread attachment.',
        [hasQuestion?'Possible request with limited history':'Limited context'],
        'Read the full original Gmail thread. An ambiguous message cannot authorize drafting.');
    if(hasQuestion)
      return result('reply_candidate',
        'The most recent incoming message contains a possible question or action request.',
        ['Possible explicit request in latest inbound message'],
        'Verify that the request remains unanswered in Gmail, CRM, SMS and event notes before approving a draft.');
    return result('manual_review',
      'The message is not clearly a request, courtesy closing, or decline.',
      ['Insufficient evidence for reply decision'],
      'Read the original thread and check the CRM. Decide manually whether a response is necessary.');
  }
  return {qualifyThread,OUTCOMES};
});
