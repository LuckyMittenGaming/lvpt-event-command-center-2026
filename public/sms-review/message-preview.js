(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.LVPTMessagePreview=api;
})(typeof window==='undefined'?null:window,function(){
  'use strict';

  // Presentation-only: returned original is always intact. The view removes
  // clear signatures/quoted replies to make the CURRENT message easier to
  // read and avoids treating questions in quoted history as new client asks.
  // This is conservative; uncertainty keeps the original visible.
  const signoff=/^(?:thanks(?: again| so much)?|thank you(?: again)?|best(?: regards)?|kind regards|warm regards|regards|sincerely|cheers|respectfully)[.!,-]*$/i;
  const fullName=/^[A-Z][a-zA-Z.'’-]+(?:\s+[A-Z][a-zA-Z.'’-]+){1,3}$/;
  const allCapsName=/^[A-Z][A-Z.'’-]+(?:\s+[A-Z][A-Z.'’-]+){1,3}$/;
  const roleOrContact=/(?:\b(?:director|manager|president|vice president|founder|operations|marketing|sales|coordinator|assistant|partner|poker room|events|event manager)\b|^\s*(?:D|M|P|C|E)\s+\[?(?:phone|email)\]?\b|(?:\b(?:phone|mobile|cell|email)\b|@\S+\.\w+)|(?:\b(?:the venetian|resort|corporate)\b)|(?:LinkedIn|Instagram|YouTube|Facebook)\b)/i;
  const forwarded=/(?:^On .{5,170} wrote:\s*$|^[-]{2,}\s*Original Message\s*[-]{2,}$|^From:\s+\S.+$|^Sent:\s+(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun|.{3,50}\b20\d\d))/i;
  const socialContact=/(?:\b[\w.-]+\.com\b|\[(?:link|email|phone)\]|\b(?:Instagram|Facebook|LinkedIn|X\s*@|Twitter)\b)/i;
  const BUSINESS_MAILBOX='book@pokertraininglasvegas.com';
  const THREAD_ID=/^[a-f0-9]{8,32}$/i;
  const EMAIL=/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;
  const EVIDENCE_LABELS=Object.freeze({
    stored:'Stored Gmail activity — not a full-thread read',
    header:'Header-only scan — not full-thread readiness',
    full_thread:'Full-thread read via protected reader',
    truncated:'Truncated / partial thread context',
    unverified:'Evidence kind unverified — full-thread readiness cannot be assumed'
  });

  // Align with the protected-reader contract (triage normalizeEvidenceKind).
  // Presentation only — never invents recipients or implies Gmail mutation.
  function normalizeEvidenceKind(value) {
    const raw=String(value||'').toLowerCase().trim();
    if(raw==='stored'||raw==='stored_evidence'||raw==='sheet'||raw==='activity'||
       raw==='command_center_logged_activity_only')
      return 'stored';
    if(raw==='header'||raw==='header_only'||raw==='headers'||
       raw==='bounded_domain_matched_message_headers_only'||
       raw==='limited_business_domain_and_headers_only'||
       raw==='bounded_live_gmail_header_metadata')
      return 'header';
    if(raw==='full_thread'||raw==='full'||
       raw==='owner_approved_bounded_full_thread_preview'||
       raw==='approved_read_only_gmail_draft_context'||
       raw==='owner_selected_read_only_thread_review'||
       raw==='read_only_business_thread_preview')
      return 'full_thread';
    if(raw==='truncated'||raw==='partial'||raw==='incomplete')
      return 'truncated';
    return '';
  }

  function anyMessageTruncated(messages) {
    return Array.isArray(messages)&&messages.some(m=>m?.truncated===true);
  }

  function resolveEvidenceKind(meta,context) {
    const explicit=normalizeEvidenceKind(
      context?.evidenceKind||meta?.evidenceKind||
      context?.gmailEvidenceScope||meta?.gmailEvidenceScope||
      context?.scope||meta?.scope||context?.source||meta?.source);
    const messages=Array.isArray(context?.messages)?context.messages:[];
    // Any truncated message in the returned thread keeps the context
    // incomplete — including earlier messages when the latest is complete
    // and every message was enumerated.
    const truncated=context?.partial===true||anyMessageTruncated(messages)||
      context?.fullThreadEnumerated===false||
      (Number(context?.totalMessages||0)>messages.length && messages.length>0);
    if(explicit==='stored'||explicit==='header')return explicit;
    if(truncated)return 'truncated';
    if(explicit==='full_thread')return 'full_thread';
    return explicit||'unverified';
  }

  function verifiedRecipient(value) {
    const address=String(value==null?'':value).toLowerCase().trim();
    if(!address||address.length>180||!EMAIL.test(address))return null;
    return address;
  }

  // Conflict-aware mailbox identity: an explicit true flag never overrides an
  // observed mailbox that differs from the expected business mailbox, or a
  // disagreement between meta and context mailbox identities.
  function resolveMailboxIdentityVerified(meta,context,verification) {
    const expected=String(
      meta?.expectedMailbox||context?.expectedMailbox||
      verification?.expectedMailbox||BUSINESS_MAILBOX)
      .toLowerCase().trim();
    const metaMailbox=String(meta?.mailbox||'').toLowerCase().trim();
    const contextMailbox=String(context?.mailbox||'').toLowerCase().trim();
    const verifiedMailbox=String(verification?.mailbox||'').toLowerCase().trim();
    if(metaMailbox&&contextMailbox&&metaMailbox!==contextMailbox)return false;
    if(metaMailbox&&verifiedMailbox&&metaMailbox!==verifiedMailbox)return false;
    if(contextMailbox&&verifiedMailbox&&contextMailbox!==verifiedMailbox)return false;
    const observed=metaMailbox||contextMailbox||verifiedMailbox;
    if(observed&&observed!==expected)return false;
    const flag=meta?.mailboxIdentityVerified===true||
      context?.mailboxIdentityVerified===true||
      verification?.mailboxIdentityVerified===true;
    return flag||(Boolean(observed)&&observed===expected);
  }

  // Keep the latest relevant inbound through preview: original excerpt intact,
  // focused body for display only. Never drops identity or timestamps.
  function retainLatestInbound(context) {
    const messages=Array.isArray(context?.messages)?context.messages:[];
    let latest=null;
    for(let i=0;i<messages.length;i++) {
      const m=messages[i];
      if(String(m?.direction||'')!=='inbound')continue;
      const at=String(m?.at||'');
      const ts=Date.parse(at);
      if(!Number.isFinite(ts))continue;
      if(!latest||ts>=latest.ts)latest={message:m,ts,index:i,at};
    }
    if(!latest) {
      return {
        present:false,at:null,index:-1,direction:null,
        original:'',preview:focus(''),
        matchesContextRevision:false
      };
    }
    const excerpt=String(latest.message.excerpt==null?'':latest.message.excerpt);
    const preview=focus(excerpt);
    const expected=String(context?.lastMessageAt||'');
    return {
      present:true,
      at:latest.at,
      index:latest.index,
      direction:'inbound',
      relationshipHint:String(latest.message.relationshipHint||'unclassified'),
      truncated:latest.message.truncated===true,
      hasAttachments:latest.message.hasAttachments===true,
      original:preview.original,
      preview,
      matchesContextRevision:Boolean(expected)&&latest.at===expected
    };
  }

  // Display exact thread / mailbox / recipient verification and incomplete
  // context. Distinguishable stored, header-only, full-thread, and truncated.
  function describeContext(meta,context,verification) {
    const evidenceKind=resolveEvidenceKind(meta,context)||'unverified';
    const threadId=String(meta?.threadId||context?.threadId||'');
    const expectedThreadId=String(
      meta?.expectedThreadId||context?.expectedThreadId||
      verification?.expectedThreadId||'');
    const expectedMailbox=String(
      meta?.expectedMailbox||context?.expectedMailbox||
      verification?.expectedMailbox||BUSINESS_MAILBOX)
      .toLowerCase().trim();
    const metaThread=String(meta?.threadId||'');
    const contextThread=String(context?.threadId||'');
    const mailboxIdentityVerified=
      resolveMailboxIdentityVerified(meta,context,verification);
    // Exact expected provider-thread identity when supplied; meta and context
    // thread ids must agree when both are present.
    const threadsAgree=(!metaThread||!contextThread||metaThread===contextThread)&&
      (!threadId||threadId===metaThread||threadId===contextThread||
        (metaThread&&metaThread===contextThread));
    const expectedMatches=!expectedThreadId||expectedThreadId===threadId;
    const providerThreadIdentityVerified=THREAD_ID.test(threadId)&&
      threadsAgree&&expectedMatches;
    const recipient=verifiedRecipient(
      verification?.recipientEmail||verification?.recipient||
      context?.recipientEmail||meta?.recipientEmail);
    // Never treat a bare address as verified without an explicit flag from
    // the protected reader / recipient verification step.
    const recipientVerified=
      (verification?.recipientVerified===true||
       meta?.recipientVerified===true||context?.recipientVerified===true||
       meta?.isRealClientRecipientVerified===true||
       context?.isRealClientRecipientVerified===true||
       verification?.isRealClientRecipientVerified===true)&&Boolean(recipient);
    const inbound=retainLatestInbound(context);
    const messages=Array.isArray(context?.messages)?context.messages:[];
    const incompleteContext=evidenceKind!=='full_thread'||
      context?.partial===true||anyMessageTruncated(messages)||
      context?.fullThreadEnumerated===false||
      !inbound.present||!inbound.matchesContextRevision||
      !mailboxIdentityVerified||!providerThreadIdentityVerified||
      !recipientVerified;
    const displayLines=[
      'Evidence: '+evidenceKind+' — '+(EVIDENCE_LABELS[evidenceKind]||EVIDENCE_LABELS.unverified),
      'Mailbox: '+(mailboxIdentityVerified?
        'verified '+expectedMailbox:'not verified'),
      'Thread: '+(providerThreadIdentityVerified&&THREAD_ID.test(threadId)?
        'verified '+threadId:'not verified'),
      'Recipient: '+(recipientVerified?
        'verified '+recipient:
        'unverified — do not invent a recipient'),
      'Latest inbound: '+(inbound.present?
        'retained at '+inbound.at+(inbound.matchesContextRevision?
          '':' (revision mismatch)'):
        'missing'),
      'Context: '+(incompleteContext?'incomplete':'complete'),
      'Approval-ready: '+(incompleteContext?'no':'yes')
    ];
    return {
      evidenceKind,
      evidenceLabel:EVIDENCE_LABELS[evidenceKind]||EVIDENCE_LABELS.unverified,
      mailboxIdentityVerified,
      providerThreadIdentityVerified,
      recipientVerified,
      recipientEmail:recipientVerified?recipient:null,
      incompleteContext,
      latestRelevantInboundAt:inbound.present?inbound.at:null,
      latestInbound:inbound,
      mutatesGmail:false,
      displayLines
    };
  }

  function quotedStart(lines,i) {
    if(i<1)return false;
    const line=String(lines[i]||'').trim();
    if(forwarded.test(line))return true;
    // Gmail sometimes wraps "On Wed ... <sender> wrote:" across two lines,
    // particularly after redacting the sender email. A visible quote boundary
    // proves the current authored message ends before the clipped quote.
    if(!/^On\s+(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/i.test(line))return false;
    const block=lines.slice(i,i+4).join(' ').replace(/\s+/g,' ').slice(0,500);
    return /\bwrote:\s*(?:>|$)/i.test(block) &&
      /(?:\b20\d\d\b|\[email\]|@)/i.test(block);
  }
  function focus(value){
    const original=String(value==null?'':value).replace(/\r\n?/g,'\n');
    const lines=original.split('\n');
    let cut=lines.length,reason='';
    const quotedHistorySeen=lines.some((_,i)=>quotedStart(lines,i));
    for(let i=1;i<lines.length;i++){
      const line=lines[i].trim();
      if(quotedStart(lines,i)){
        cut=i;reason='quoted_history';break;
      }
      if(/^--\s*$/.test(lines[i])||/^Sent from my (?:iPhone|Android|Galaxy|mobile device)/i.test(line)){
        if(i>1){cut=i;reason='signature';break;}
      }
      if(!line||!(fullName.test(line)||allCapsName.test(line)))continue;
      const prior=lines.slice(Math.max(0,i-6),i).map(x=>x.trim());
      const hasSignoff=prior.some(x=>signoff.test(x));
      const next=lines.slice(i+1,Math.min(lines.length,i+7)).join('\n');
      // Signature blocks often follow a thank-you sentence without a
      // standalone "Thanks," sign-off (e.g., an assistant's name, role,
      // separator and contact block). Require all structural cues so
      // substantive authored content is not mistakenly removed.
      const bareSignature=i>=2&&lines[i-1].trim()===''&&
        roleOrContact.test(String(lines[i+1]||''))&&
        /^[-]{5,}\s*$/m.test(
          lines.slice(i+2,Math.min(lines.length,i+8)).join('\n'));
      const earlierInitials=lines.slice(Math.max(1,i-3),i)
        .findIndex(x=>/^[A-Z]{1,3}$/.test(String(x).trim()));
      const initialsAt=earlierInitials>=0?Math.max(1,i-3)+earlierInitials:-1;
      const initialsSignature=i>=2 && initialsAt>=1 &&
        lines.slice(initialsAt+1,i).every(x=>!String(x).trim()) &&
        socialContact.test(lines.slice(i+1,i+6).join('\n'));
      if((hasSignoff&&roleOrContact.test(next))||bareSignature||
         initialsSignature) {
        cut=initialsSignature?initialsAt:i;reason='signature';break;
      }
    }
    const body=lines.slice(0,cut).join('\n').trim();
    const hidden=lines.slice(cut).join('\n').trim();
    return {
      body:body||original.trim(),
      hidden:hidden||'',
      original,
      shortened:Boolean(hidden&&body),
      // Never use the field to authorize sending; it only permits a strict
      // courtesy-only classifier to ignore a truncated *quoted* old email.
      quotedHistorySeen,
      reason:hidden?reason:''
    };
  }
  return {
    focus,normalizeEvidenceKind,resolveEvidenceKind,describeContext,
    retainLatestInbound,resolveMailboxIdentityVerified,
    EVIDENCE_LABELS,BUSINESS_MAILBOX
  };
});
