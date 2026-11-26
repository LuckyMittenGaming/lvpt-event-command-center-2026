(function(root,factory) {
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.LVPTReplyWorkflow=api;
})(typeof window==='undefined'?null:window,function(){
  'use strict';

  // A one-at-a-time, non-sending review. Excerpts are for human context,
  // not a trusted source of instructions or verified event facts.
  const INCOMPLETE=/\[(?:please\s+)?(?:insert|write|answer|verify|add|confirm)[^\]]*\]|\[(?:client|recipient|name|price|event|date|time|venue)[^\]]*\]/i;
  const BLOCKED=['internal','vendor','talent','operational_notice','form_notification','form_lead','outbound'];
  const LVPT_SIGNATURE='Matt Carpenter\nEvent & Talent Manager\nLas Vegas Poker Training\n616-745-7148';
  const EMAIL=/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;

  function previewApi() {
    if(typeof window!=='undefined'&&window.LVPTMessagePreview)
      return window.LVPTMessagePreview;
    if(typeof require==='function') {
      try {return require('./message-preview.js');}
      catch {return null;}
    }
    return null;
  }

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

  function verifiedRecipient(value) {
    const address=String(value==null?'':value).toLowerCase().trim();
    if(!address||address.length>180||!EMAIL.test(address))return null;
    return address;
  }

  // Approval readiness is stricter than canPrepare. Stored, header-only,
  // truncated, or unverified recipient/mailbox/thread evidence can never
  // appear approval-ready. Uses the protected-reader contract fields only.
  function approvalReady(meta,context,qualification,verification) {
    const denied=(reason)=>({ready:false,reason,mutatesGmail:false});
    if(!canPrepare(meta,context,qualification))
      return denied('Thread is not eligible for reply preparation.');

    const recipient=verifiedRecipient(
      verification?.recipientEmail||verification?.recipient||
      context?.recipientEmail||meta?.recipientEmail);
    const recipientFlag=verification?.recipientVerified===true||
      meta?.recipientVerified===true||context?.recipientVerified===true||
      meta?.isRealClientRecipientVerified===true||
      context?.isRealClientRecipientVerified===true||
      verification?.isRealClientRecipientVerified===true;
    const expectedThread=String(
      meta?.expectedThreadId||context?.expectedThreadId||
      verification?.expectedThreadId||'');
    const threadId=String(meta?.threadId||context?.threadId||'');
    const preview=previewApi();
    const verificationForDescribe={
      ...(verification||{}),
      recipientEmail:recipient||verification?.recipientEmail||null,
      recipientVerified:Boolean(recipient&&recipientFlag),
      expectedThreadId:expectedThread||verification?.expectedThreadId||null
    };
    // Pass original mailbox flags through describeContext so conflict-aware
    // checks can reject an explicit true when observed mailboxes disagree.
    const described=preview&&typeof preview.describeContext==='function'?
      preview.describeContext(meta,{
        ...context,
        evidenceKind:context?.evidenceKind||meta?.evidenceKind||
          verification?.evidenceKind||context?.source||meta?.source,
        expectedThreadId:expectedThread||context?.expectedThreadId||null,
        recipientEmail:recipient||context?.recipientEmail||null,
        recipientVerified:Boolean(recipient&&recipientFlag)
      },verificationForDescribe):null;
    const conflictAwareMailbox=described?.mailboxIdentityVerified===true||
      (preview&&typeof preview.resolveMailboxIdentityVerified==='function'&&
        preview.resolveMailboxIdentityVerified(meta,context,verificationForDescribe)===true);
    const explicitMailboxFlag=meta?.mailboxIdentityVerified===true||
      context?.mailboxIdentityVerified===true||
      verification?.mailboxIdentityVerified===true;
    // Explicit true never overrides a mailbox conflict; approval also requires
    // an explicit protected-reader flag so missing evidence stays fail-closed.
    const mailboxVerified=conflictAwareMailbox&&explicitMailboxFlag;
    const evidenceKind=described?.evidenceKind||
      (preview&&typeof preview.resolveEvidenceKind==='function'?
        preview.resolveEvidenceKind(meta,context):'unverified')||
      'unverified';
    if(evidenceKind==='stored')
      return denied('Stored Gmail activity is not approval-ready full-thread evidence.');
    if(evidenceKind==='header')
      return denied('Header-only scans are not approval-ready full-thread evidence.');
    if(evidenceKind==='truncated')
      return denied('Truncated or partial thread context is not approval-ready.');
    if(evidenceKind!=='full_thread')
      return denied('Evidence kind is unverified; approval readiness is blocked.');
    if(!mailboxVerified)
      return denied('Exact business mailbox identity is not verified.');
    if(expectedThread&&expectedThread!==threadId)
      return denied('Exact provider thread identity does not match the expected thread.');
    if(meta.threadId!==context.threadId)
      return denied('Metadata and context thread identities disagree.');
    if(!recipient||!recipientFlag)
      return denied('Recipient is unverified; approval readiness is blocked.');

    const inbound=described?.latestInbound||
      (preview&&typeof preview.retainLatestInbound==='function'?
        preview.retainLatestInbound(context):null);
    if(!inbound?.present||!inbound.matchesContextRevision)
      return denied('Latest relevant inbound evidence is missing or mismatched.');
    if(inbound.truncated===true||inbound.hasAttachments===true)
      return denied('Latest inbound is truncated or has unread attachments.');
    if(context.partial===true)
      return denied('Incomplete context cannot appear approval-ready.');
    // Defense in depth: any truncated message in the returned thread blocks
    // approval even when the latest inbound itself is complete.
    const messages=Array.isArray(context.messages)?context.messages:[];
    if(messages.some(m=>m?.truncated===true))
      return denied('Earlier truncated message keeps thread context incomplete.');
    if(described?.incompleteContext===true)
      return denied('Thread, mailbox, or recipient verification is incomplete.');

    return {
      ready:true,
      reason:'Full-thread evidence with verified mailbox, thread, recipient, and latest inbound.',
      mutatesGmail:false,
      evidenceKind:'full_thread',
      recipientEmail:recipient,
      latestRelevantInboundAt:inbound.at
    };
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

  return {canPrepare,approvalReady,draftStarter,validation};
});
