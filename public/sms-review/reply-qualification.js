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
    client_decined:'Client declined — no sales follow-up',
    hold:'Client reviewing / unavailable — hold',
    vendor_operations:'Vendor / venue operations — review',
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
  const request=/(?:\?|\b(?:can|could|would|will|do|does|is|are|have|has)\s+(?:you|we|your team|the team)\b|\b(?:what|when|where|which|how much|how many|how soon)\b|\bplease\s+(?:send|confirm|provide|share|let me know|advise|clarify|explain|update|quote|review|check|schedule|call)\b|\b(?:we|i)\s+(?:need|would like|want)\s+(?:a|an|the|to|you|your)\b)/i;

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
    const formLead=direction==='form_lead'||metadata.sourceType==='form_lead';
    const vendor=relationship==='vendor'||verifiedRole==='vendor';
    const body=norm(latest?.excerpt);
    const hasQuestion=request.test(body);
    const isDecline=decline.test(body);
    const isHolding=holding.test(body);
    const isCourtesy=courtesy.test(body);
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
    if(isDecline && !hasQuestion)
      return result('client_decined','The client appears to have declined or stopped the opportunity.',
        ['Decline language found'],
        'Record or verify the decline in the CRM. Do not create a sales follow-up.');
    if(isHolding && !hasQuestion)
      return result('hold','The client indicates a review, absence, or intention to respond later.',
        ['Client-controlled timing'],
        'Respect their timing; consult the full thread before considering a later follow-up.');
    if(isCourtesy && !hasQuestion)
      return result('monitor','The latest response appears to be an acknowledgement or courtesy closing.',
        ['No actionable question detected'],
        'No reply suggested. Reopen only if another message or obligation requires attention.');
    if(incomplete)
      return result('manual_review',
        'Conversation excerpts are incomplete, truncated, or include an attachment.',
        [hasQuestion?'Possible request in partial context':'Limited source context'],
        'Read the original Gmail thread and any attachments. Do not infer that a reply is required from partial excerpts.');
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
