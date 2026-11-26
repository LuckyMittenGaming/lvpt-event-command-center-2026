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

  // Owner vocabulary maps onto the existing one-at-a-time audit decisions.
  // Never create a competing state machine; DENY / EDIT MYSELF never send.
  const DIGEST=/^[a-f0-9]{64}$/;
  const OWNER_DECISIONS=Object.freeze({
    APPROVE:{kind:'APPROVE',auditDecision:'approved_for_manual_copy',
      allowsSend:false,requiresRenewedReview:false},
    MAKE_CHANGES:{kind:'MAKE_CHANGES',auditDecision:'draft_prepared',
      allowsSend:false,requiresRenewedReview:true},
    DENY:{kind:'DENY',auditDecision:'denied',
      allowsSend:false,requiresRenewedReview:false},
    EDIT_MYSELF:{kind:'EDIT_MYSELF',auditDecision:null,
      allowsSend:false,requiresRenewedReview:false}
  });

  function ownerDecisionPolicy(kind) {
    return OWNER_DECISIONS[kind]||null;
  }

  function sameEvidenceInstant(a,b) {
    if(typeof a!=='string'||typeof b!=='string')return false;
    if(a===b)return true;
    const left=Date.parse(a),right=Date.parse(b);
    return Number.isFinite(left)&&Number.isFinite(right)&&left===right;
  }

  const PROVIDER_MESSAGE_ID=/^[a-f0-9]{8,32}$/i;
  const INBOUND_EVIDENCE_DIGEST=/^[a-f0-9]{16}$/;

  // Compact deterministic digest of existing inbound evidence fields.
  // Used when a stable provider message ID is absent. Not cryptographic auth.
  function hashEvidence(parts) {
    const payload=JSON.stringify(parts);
    let a=2166136261,b=2779096485;
    for(let i=0;i<payload.length;i++){
      const code=payload.charCodeAt(i);
      a=Math.imul(a^code,16777619)>>>0;
      b=Math.imul(b^code,2246822519)>>>0;
    }
    return a.toString(16).padStart(8,'0')+b.toString(16).padStart(8,'0');
  }

  function stableProviderMessageId(message) {
    const candidates=[
      message?.providerMessageId,message?.messageId,
      message?.gmailMessageId,message?.id
    ];
    for(const value of candidates) {
      const id=String(value==null?'':value).toLowerCase().trim();
      if(PROVIDER_MESSAGE_ID.test(id))return id;
    }
    return null;
  }

  function deterministicInboundDigest(message) {
    if(!message||typeof message!=='object')return null;
    const excerpt=String(message.excerpt==null?'':message.excerpt);
    const at=String(message.at||'');
    const direction=String(message.direction||'');
    if(!excerpt.trim()||!at||direction!=='inbound')return null;
    return hashEvidence([
      'inbound_v1',
      direction,
      at,
      excerpt,
      String(message.senderDomain||''),
      String(message.relationshipHint||''),
      message.truncated===true,
      message.hasAttachments===true,
      stableProviderMessageId(message)||''
    ]);
  }

  // Prefer a stable provider message ID; always require a deterministic
  // evidence digest from existing inbound fields. Fail closed otherwise.
  function resolveLatestInboundIdentity(context) {
    const preview=previewApi();
    const inbound=preview&&typeof preview.retainLatestInbound==='function'?
      preview.retainLatestInbound(context):null;
    if(!inbound?.present||inbound.matchesContextRevision!==true)
      return null;
    const messages=Array.isArray(context?.messages)?context.messages:[];
    const message=inbound.index>=0?messages[inbound.index]:null;
    if(!message)return null;
    const providerMessageId=stableProviderMessageId(message);
    const inboundEvidenceDigest=deterministicInboundDigest(message);
    if(!inboundEvidenceDigest)return null;
    return {
      providerMessageId,
      inboundEvidenceDigest,
      at:inbound.at||String(message.at||'')
    };
  }

  function sameInboundIdentity(bound,current) {
    if(!bound||!current)return false;
    const boundDigest=String(bound.inboundEvidenceDigest||'');
    const currentDigest=String(current.inboundEvidenceDigest||'');
    if(!INBOUND_EVIDENCE_DIGEST.test(boundDigest)||
       !INBOUND_EVIDENCE_DIGEST.test(currentDigest)||
       boundDigest!==currentDigest)
      return false;
    const boundId=bound.inboundProviderMessageId?
      String(bound.inboundProviderMessageId).toLowerCase():'';
    const currentId=current.inboundProviderMessageId?
      String(current.inboundProviderMessageId).toLowerCase():'';
    // When either side carries a provider message ID, both must match.
    // Timestamp alone never establishes inbound identity.
    if(boundId||currentId) {
      if(!PROVIDER_MESSAGE_ID.test(boundId)||!PROVIDER_MESSAGE_ID.test(currentId))
        return false;
      if(boundId!==currentId)return false;
    }
    return true;
  }

  // Approval is bound to exact recipient, thread, draft digest, and the
  // latest relevant inbound's provider message ID and/or evidence digest.
  function buildApprovalBinding({
    threadId,lastMessageAt,recipientEmail,draftDigest,
    inboundProviderMessageId,inboundEvidenceDigest,inboundIdentity
  }) {
    const recipient=verifiedRecipient(recipientEmail);
    const digest=String(draftDigest||'');
    const id=String(threadId||'');
    const at=String(lastMessageAt||'');
    const inboundDigest=String(
      inboundEvidenceDigest||inboundIdentity?.inboundEvidenceDigest||'');
    const inboundIdRaw=inboundProviderMessageId||
      inboundIdentity?.providerMessageId||null;
    const inboundId=inboundIdRaw?
      String(inboundIdRaw).toLowerCase().trim():null;
    if(!id||!at||!recipient||!DIGEST.test(digest))return null;
    // Fail closed: inbound identity is required beyond a shared timestamp.
    if(!INBOUND_EVIDENCE_DIGEST.test(inboundDigest))return null;
    if(inboundId&&!PROVIDER_MESSAGE_ID.test(inboundId))return null;
    return {
      threadId:id,
      lastMessageAt:at,
      recipientEmail:recipient,
      draftDigest:digest,
      inboundProviderMessageId:inboundId,
      inboundEvidenceDigest:inboundDigest
    };
  }

  function approvalBindingValid(binding,current) {
    if(!binding||!current)return false;
    const recipient=verifiedRecipient(current.recipientEmail);
    const digest=String(current.draftDigest||'');
    return binding.threadId===String(current.threadId||'') &&
      sameEvidenceInstant(binding.lastMessageAt,current.lastMessageAt) &&
      Boolean(recipient) && binding.recipientEmail===recipient &&
      DIGEST.test(digest) && binding.draftDigest===digest &&
      sameInboundIdentity(binding,current);
  }

  function staleApprovalReason(binding,current) {
    if(!binding)return 'No exact approval binding is present.';
    if(!current)return 'Current review evidence is missing.';
    if(binding.threadId!==String(current.threadId||''))
      return 'Provider thread identity changed; prior approval is invalid.';
    if(!sameEvidenceInstant(binding.lastMessageAt,current.lastMessageAt))
      return 'Latest relevant inbound changed; prior approval is invalid.';
    if(!sameInboundIdentity(binding,current))
      return 'Latest relevant inbound identity changed; prior approval is invalid.';
    const recipient=verifiedRecipient(current.recipientEmail);
    if(!recipient||binding.recipientEmail!==recipient)
      return 'Verified recipient changed; prior approval is invalid.';
    const digest=String(current.draftDigest||'');
    if(!DIGEST.test(digest)||binding.draftDigest!==digest)
      return 'Draft revision/digest changed; prior approval is invalid.';
    return '';
  }

  // Exactly-once send-intent classification for approval delivery safety.
  // Clipboard copy is never SENT. Provider-confirmed message identity is
  // required for SENT. Reserved/uncertain outcomes reconcile with doNotRetry
  // and never authorize automatic resend. Protected routes stay authoritative.
  function classifySendIntentOutcome(input) {
    const kind=String(input?.kind||input?.sessionKind||'');
    if(kind==='clipboard_copy'||kind==='copied_not_sent')
      return {
        deliveryState:'copied_not_sent',sent:false,doNotRetry:false,
        allowsAutomaticResend:false,mayAttemptSend:false,
        reason:'Clipboard copy is not a provider send.'
      };
    if(kind==='denied'||kind==='edit_myself'||kind==='edit_myself_not_sent'||
       kind==='make_changes'||kind==='draft_prepared')
      return {
        deliveryState:'not_sent',sent:false,doNotRetry:false,
        allowsAutomaticResend:false,mayAttemptSend:false,
        reason:'Owner decision does not authorize a provider send.'
      };

    const status=String(input?.status||'').toLowerCase();
    const gmailMessageId=String(input?.gmailMessageId||'').toLowerCase().trim();
    const explicitApproval=input?.explicitApproval===true&&
      input?.confirmation==='SEND THIS EMAIL'&&
      input?.ownerReviewed===true&&
      input?.approvalBindingValid===true;
    const providerConfirmed=input?.sent===true||status==='sent';

    if(providerConfirmed) {
      if(!PROVIDER_MESSAGE_ID.test(gmailMessageId))
        return {
          deliveryState:'uncertain',sent:false,doNotRetry:true,
          allowsAutomaticResend:false,mayAttemptSend:false,
          reason:'SENT requires provider-confirmed message identity.'
        };
      return {
        deliveryState:'sent',sent:true,doNotRetry:true,
        allowsAutomaticResend:false,mayAttemptSend:false,
        gmailMessageId,
        reason:'Provider-confirmed send; duplicate send is blocked.'
      };
    }
    if(status==='reserved'||status==='uncertain'||input?.doNotRetry===true)
      return {
        deliveryState:status==='reserved'?'reserved':'uncertain',
        sent:false,doNotRetry:true,
        allowsAutomaticResend:false,mayAttemptSend:false,
        reason:'Unknown or reserved delivery must reconcile; never automatic resend.'
      };
    // Only an authoritative explicit not_attempted status may arm a send.
    // Missing, empty, or "none" ledger evidence must reconcile fail-closed.
    if(status==='not_attempted')
      return {
        deliveryState:'not_attempted',sent:false,doNotRetry:false,
        allowsAutomaticResend:false,mayAttemptSend:explicitApproval,
        reason:explicitApproval?
          'Exact explicit approval present; one send attempt may proceed.':
          'No send without exact explicit approval.'
      };
    if(status===''||status==='none')
      return {
        deliveryState:'uncertain',sent:false,doNotRetry:true,
        allowsAutomaticResend:false,mayAttemptSend:false,
        reason:'Send ledger status missing; reconcile before any send attempt.'
      };
    return {
      deliveryState:'uncertain',sent:false,doNotRetry:true,
      allowsAutomaticResend:false,mayAttemptSend:false,
      reason:'Unrecognized send status; fail closed without resend.'
    };
  }

  // Client/UI gate: one attempt only when approval binding is still exact and
  // the durable send ledger explicitly reports not_attempted without doNotRetry.
  // Absent records or missing/empty/unrecognized status never authorize send.
  function sendAttemptAllowed({
    phase,statusRecord,confirmation,ownerReviewed,approvalBinding,currentEvidence
  }) {
    if(phase!=='approved_for_manual_copy')return false;
    if(ownerReviewed!==true||confirmation!=='SEND THIS EMAIL')return false;
    if(!approvalBindingValid(approvalBinding,currentEvidence))return false;
    if(!statusRecord||typeof statusRecord!=='object')return false;
    if(statusRecord.doNotRetry===true)return false;
    if(!Object.prototype.hasOwnProperty.call(statusRecord,'status'))return false;
    const status=String(statusRecord.status==null?'':statusRecord.status)
      .toLowerCase().trim();
    if(status!=='not_attempted')return false;
    return classifySendIntentOutcome({
      status,explicitApproval:true,confirmation,ownerReviewed,
      approvalBindingValid:true
    }).mayAttemptSend===true;
  }

  return {
    canPrepare,approvalReady,draftStarter,validation,
    OWNER_DECISIONS,ownerDecisionPolicy,
    buildApprovalBinding,approvalBindingValid,staleApprovalReason,
    sameEvidenceInstant,resolveLatestInboundIdentity,
    sameInboundIdentity,deterministicInboundDigest,stableProviderMessageId,
    classifySendIntentOutcome,sendAttemptAllowed
  };
});
