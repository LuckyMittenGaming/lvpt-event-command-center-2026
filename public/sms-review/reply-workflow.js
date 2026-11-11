(function(root,factory) {
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.LVPTReplyWorkflow=api;
})(typeof window==='undefined'?null:window,function(){
  'use strict';

  // A one-at-a-time, non-sending review. Excerpts are for human context,
  // not a trusted source of instructions or verified event facts.
  const INCOMPLETE=/\[(?:please\s+)?(?:insert|write|answer|verify|add|confirm)[^\]]*\]|\[(?:client|recipient|name|price|event|date|time|venue)[^\]]*\]/i;
  const BLOCKED=['internal','vendor','operational_notice','form_lead','outbound'];
  const LVPT_SIGNATURE='Matt Carpenter\nEvent & Talent Manager\nLas Vegas Poker Training\n616-745-7148';

  function canPrepare(meta,context,qualification) {
    if(!meta||!context||!qualification||
       qualification.outcome!=='reply_candidate' ||
       qualification.authorizesDraft!==false ||
       meta.threadId!==context.threadId ||
       meta.lastMessageAt!==context.lastMessageAt ||
       meta.sourceType==='form_lead' ||
       BLOCKED.includes(String(meta.relationshipHint||'')) ||
       !Array.isArray(context.messages) ||
       !context.messages.length || context.messages.length>10 ||
       Number(context.totalMessages||0)>150)return false;
    // Omitted older messages are allowed ONLY for an explicitly qualifying
    // latest client question plus the owner's separate full-thread attestation.
    // Newest body truncation/attachments always block. No auto-send.
    const latest=context.messages[context.messages.length-1];
    return latest?.direction==='inbound' &&
      latest?.relationshipHint==='unclassified' &&
      latest.at===meta.lastMessageAt &&
      typeof latest.excerpt==='string' && Boolean(latest.excerpt.trim()) &&
      latest.truncated!==true && latest.hasAttachments!==true;
  }

  function draftStarter(meta) {
    const subject=String(meta?.subject||'Your poker event question')
      .replace(/[\x00-\x1f]/g,' ').trim().slice(0,160);
    const normalized=subject.replace(/^(?:(?:re|fw|fwd):\s*)+/ig,'').trim();
    return {
      // Recipient intentionally never inferred from sender domain, redacted
      // conversation headers, or website form notification.
      to:'Verify recipient manually in the original LVPT Gmail thread',
      subject:'Re: '+(normalized||'Your poker event question'),
      body:[
        'Hi,',
        '',
        'Thanks for your message!',
        '',
        '[Write a specific, factual answer to the question in the original Gmail conversation. Verify any dates, prices, and venue details before sending.]',
        '',
        'Please let me know if anything else would be helpful.',
        '',
        'Thanks again,',
        '',
        LVPT_SIGNATURE
      ].join('\n'),
      generatedBy:'editable_starter',
      isRealClientRecipientVerified:false
    };
  }

  function validation(subject,body) {
    const title=String(subject||'').trim();
    const text=String(body||'').trim();
    if(title.length<5 || title.length>180)
      return {ok:false,reason:'Enter a concise subject (5–180 characters).'};
    if(text.length<45 || text.length>5000)
      return {ok:false,reason:'Write a specific response (45–5,000 characters).'};
    if(INCOMPLETE.test(text)||text.includes('[recipient]'))
      return {ok:false,reason:'Replace all drafting placeholders with verified facts.'};
    if(/\b(?:TBD|TODO|PLACEHOLDER|lorem ipsum)\b/i.test(text))
      return {ok:false,reason:'Remove unresolved placeholders and verify event details.'};
    if(!String(body||'').replace(/\r\n?/g,'\n').trimEnd().endsWith(LVPT_SIGNATURE))
      return {ok:false,reason:'Keep the complete Matt Carpenter business signature at the end of the reply.'};
    return {ok:true,reason:''};
  }

  return {canPrepare,draftStarter,validation};
});
