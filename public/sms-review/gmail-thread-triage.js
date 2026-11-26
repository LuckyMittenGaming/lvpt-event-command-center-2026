(function(root,factory) {
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.LVPTGmailTriage=api;
})(typeof window==='undefined'?null:window,function(){
  'use strict';
  // Read-only, conservative decision support. Only use complete thread data.
  // Never treat the presence of an email or a SENT label as proof of a business outcome.
  const BUSINESS_MAILBOX='book@pokertraininglasvegas.com';
  const THREAD_ID=/^[a-f0-9]{8,32}$/i;
  const EMAIL=/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;
  const FORWARD_ONLY=/^\s*(?:(?:fw|fwd)\s*:|begin forwarded message:|[-]{2,}\s*forwarded message\s*[-]{2,})/i;
  const QUOTE_BOUNDARY=/\n(?:On .{5,180}wrote:|From:\s|-----Original Message-----|Begin forwarded message:)/i;
  const DECLINED=/\b(?:not (?:going to|able to|moving|proceeding) (?:move )?forward|decided not to (?:move |go )?forward|won'?t be moving forward|unable to proceed|will not proceed|unfortunately (?:we |we've )?(?:decided|cannot)|we have decided not|we've decided not|pass(?:ing)? on this|declin(?:e|ed|ing) (?:the|your|this) (?:proposal|quote|event))\b/i;
  const AGREEMENT=/\b(?:agreement (?:has been |is )?signed|signed (?:the|our) agreement|contract (?:has been |is )?signed|signed (?:the |our )?contract|fully executed|docusign (?:is |has been )?completed)\b/i;
  const INVOICE=/\b(?:invoice (?:has been |was |is )?sent|sent (?:the |your |our )?invoice|invoice (?:is |was )?paid|payment (?:has been |was )?received)\b/i;
  const PROPOSAL=/\b(?:here (?:is|are) (?:the|your|our) proposal|proposal (?:is |was |has been )?sent|sent (?:the |your |our )?proposal|take a look at (?:the |our |your )?proposal|please (?:review|see) (?:the |our |your )?proposal)\b/i;

  function primaryText(text) {
    const str=String(text||'');
    return str.split(QUOTE_BOUNDARY)[0]
      .replace(/https?:\/\/\S+/g,'[link]').trim().slice(0,5000);
  }
  function senderMatches(message,businessAddresses) {
    // Gmail connector serializes the provider's From header as from_.
    const from=String(message.from_||message.from||'').toLowerCase();
    return (businessAddresses||[]).some(address=>{
      const email=String(address).toLowerCase().trim();
      return email && (from===email||from.includes('<'+email+'>'));
    });
  }
  function parseTime(value) {
    const n=Date.parse(String(value||''));
    return Number.isFinite(n)?n:null;
  }
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
       raw==='approved_read_only_gmail_draft_context')
      return 'full_thread';
    return '';
  }
  function verifiedRecipient(value) {
    const address=String(value==null?'':value).toLowerCase().trim();
    if(!address||address.length>180||!EMAIL.test(address))return null;
    return address;
  }
  function isInternalForward(message,relationship) {
    if(relationship==='internal')return true;
    const raw=String(message?.body||message?.text||message?.excerpt||'');
    const authored=primaryText(raw);
    if(FORWARD_ONLY.test(raw)||FORWARD_ONLY.test(authored))return true;
    // Forward wrapper with no authored content beyond the boundary marker.
    if(!authored && QUOTE_BOUNDARY.test('\n'+raw))return true;
    return false;
  }
  function correspondenceRole(relationship,latest) {
    const role=String(relationship||'unclassified').toLowerCase();
    if(role==='internal'||isInternalForward(latest,role))return 'internal_forward';
    if(role==='vendor')return 'vendor';
    // Unknown / unclassified relationships never qualify as verified client context.
    if(role==='client')return 'client';
    return 'unverified';
  }
  function latestRelevantInbound(messages,businessAddresses) {
    const list=Array.isArray(messages)?messages:[];
    let latest=null;
    for(let i=0;i<list.length;i++) {
      const m=list[i];
      if(senderMatches(m,businessAddresses))continue;
      if(isInternalForward(m,'unclassified'))continue;
      const ts=parseTime(m.email_ts||m.date||m.timestamp||m.at);
      if(ts===null)continue;
      if(!latest||ts>=latest.ts)latest={message:m,ts,index:i};
    }
    return latest;
  }

  function relationshipCorrespondence(relationship) {
    const role=String(relationship||'unclassified').toLowerCase();
    if(role==='vendor')return 'vendor';
    if(role==='internal')return 'internal_forward';
    if(role==='client')return 'client';
    return 'unverified';
  }

  // Contract gate for R11: identities + evidence scope before any outcome claim.
  // Never fabricates a recipient and never implies Gmail mutation.
  function assessThreadContext(input) {
    const threadId=String(input?.threadId||'');
    const expectedThreadId=String(input?.expectedThreadId||'');
    const mailbox=String(input?.mailbox||'').toLowerCase().trim();
    const expectedMailbox=String(input?.expectedMailbox||BUSINESS_MAILBOX)
      .toLowerCase().trim();
    const evidenceKind=normalizeEvidenceKind(
      input?.evidenceKind||input?.gmailEvidenceScope||input?.scope||input?.source);
    const relationship=String(input?.relationshipHint||'unclassified').toLowerCase();
    const partial=input?.partial===true||input?.truncated===true||
      input?.fullThreadEnumerated===false;
    const messages=Array.isArray(input?.messages)?input.messages:[];
    const business=[expectedMailbox];
    const base={
      threadId:THREAD_ID.test(threadId)?threadId:'',
      expectedThreadId:THREAD_ID.test(expectedThreadId)?expectedThreadId:'',
      mailboxIdentityVerified:false,
      providerThreadIdentityVerified:false,
      evidenceKind:evidenceKind||'unverified',
      fullThreadReady:false,
      completeClientContext:false,
      correspondence:'unverified',
      latestRelevantInboundAt:null,
      recipientEmail:null,
      mutatesGmail:false,
      reason:''
    };
    if(!THREAD_ID.test(threadId))
      return {...base,ok:false,reason:'Exact provider thread identity is required.'};
    if(!mailbox||mailbox!==expectedMailbox)
      return {...base,ok:false,reason:'Exact business mailbox identity is required.'};
    base.mailboxIdentityVerified=true;
    base.ok=true;
    // Exact expected provider-thread identity is required for readiness; never
    // treat a lone threadId as sufficient without the expected match.
    const threadIdentityExact=THREAD_ID.test(expectedThreadId)&&expectedThreadId===threadId;
    base.providerThreadIdentityVerified=threadIdentityExact;
    if(expectedThreadId && !threadIdentityExact)
      return {...base,ok:false,reason:'Exact expected provider thread identity is required.'};

    if(evidenceKind==='stored'||evidenceKind==='header') {
      return {
        ...base,
        evidenceKind,
        correspondence:relationshipCorrespondence(relationship),
        reason:evidenceKind==='stored'
          ?'Stored Gmail activity is not a full-thread read.'
          :'Header scan metadata is not full-thread readiness.'
      };
    }
    if(evidenceKind!=='full_thread')
      return {...base,ok:false,reason:'Evidence kind is unverified; full-thread readiness cannot be assumed.'};

    const recipient=verifiedRecipient(input?.recipientEmail);
    // Never invent a recipient when the reader did not supply a verified one.
    base.recipientEmail=recipient;
    base.correspondence=relationshipCorrespondence(relationship);

    if(!threadIdentityExact||partial||!messages.length)
      return {
        ...base,
        evidenceKind:'full_thread',
        reason:!threadIdentityExact
          ?'Exact expected provider thread identity is required for full-thread readiness.'
          :partial
          ?'Partial or truncated thread context is not complete client context.'
          :'Full-thread messages were not supplied.'
      };

    const mapped=messages.map((m,i)=>({
      i,m,ts:parseTime(m.email_ts||m.date||m.timestamp||m.at),
      outbound:senderMatches(m,business)
    })).filter(x=>x.ts!==null).sort((a,b)=>a.ts-b.ts||a.i-b.i);
    if(!mapped.length)
      return {...base,evidenceKind:'full_thread',
        reason:'Message timestamps unavailable; cannot establish reply order.'};
    const final=mapped[mapped.length-1].m;
    const role=correspondenceRole(relationship,final);
    const inbound=latestRelevantInbound(messages,business);
    base.latestRelevantInboundAt=inbound
      ?new Date(inbound.ts).toISOString()
      :null;
    base.correspondence=role;
    // Identities + explicit complete full-thread evidence unlock readiness.
    // Complete client context additionally needs verified client role + inbound.
    if(role==='internal_forward')
      return {
        ...base,evidenceKind:'full_thread',fullThreadReady:true,
        reason:'Internal or forwarded correspondence is not complete client context.'
      };
    if(role==='vendor')
      return {
        ...base,evidenceKind:'full_thread',fullThreadReady:true,
        reason:'Vendor or venue correspondence is not client sales context.'
      };
    if(role!=='client'||!inbound)
      return {
        ...base,evidenceKind:'full_thread',fullThreadReady:true,
        reason:!inbound
          ?'Latest relevant inbound evidence is required for complete client context.'
          :'Unknown or unverified relationships are not complete client context.'
      };
    return {
      ...base,
      evidenceKind:'full_thread',
      fullThreadReady:true,
      completeClientContext:true,
      correspondence:'client',
      reason:'Exact mailbox and provider thread identities verified with complete client thread context.'
    };
  }

  function summarizeThread(thread,businessAddresses) {
    const messages=Array.isArray(thread?.messages)?thread.messages:[];
    const total=Number.isSafeInteger(thread?.total_messages)?thread.total_messages:messages.length;
    if(!messages.length || thread?.truncated===true || total>messages.length)
      return {state:'insufficient_evidence',reason:'Thread messages missing or truncated; cannot infer outcome.'};
    const mapped=messages.map((m,i)=>({
      i,m,ts:parseTime(m.email_ts||m.date||m.timestamp),
      outbound:senderMatches(m,businessAddresses),
      body:primaryText(m.body||m.text||'')
    }));
    if(mapped.some(x=>x.ts===null))
      return {state:'insufficient_evidence',reason:'Message timestamps unavailable; cannot establish reply order.'};
    mapped.sort((a,b)=>a.ts-b.ts||a.i-b.i);
    const final=mapped[mapped.length-1];
    const inbound=mapped.filter(x=>!x.outbound);
    const outbound=mapped.filter(x=>x.outbound);
    if(!inbound.length)
      return {state:'outbound_only',reason:'No external reply was observed in this complete thread; check for a different thread before following up.'};
    // A genuine explicit decline from an external message is definitive for this
    // event opportunity, even if an appreciative seller acknowledgement followed.
    const declined=inbound.find(x=>DECLINED.test(x.body));
    if(declined)
      return {state:'declined',reason:'Client explicitly declined in this thread. Do not reopen the same event proposal automatically.',lastMessageDirection:final.outbound?'outbound':'inbound'};
    // Only state confirmed contracts from real sent messages, not assumptions.
    if(outbound.some(x=>AGREEMENT.test(x.body)&&INVOICE.test(x.body)))
      return {state:'fulfillment_check',reason:'Owner states agreement signed and invoice sent. Verify payments and current execution tasks separately.',lastMessageDirection:final.outbound?'outbound':'inbound'};
    if(final.outbound && outbound.some(x=>PROPOSAL.test(x.body)))
      return {state:'proposal_sent_awaiting',reason:'A proposal was sent and no later reply appears in this complete thread. Check other conversations and CRM before contacting again.',lastMessageDirection:'outbound'};
    if(final.outbound)
      return {state:'answered_or_awaiting',reason:'Latest message was outgoing; do not treat earlier inbound inquiries as unanswered.',lastMessageDirection:'outbound'};
    return {state:'inbound_last_review',reason:'Latest message came from an external correspondent. Review its content, other threads and CRM before drafting a response.',lastMessageDirection:'inbound'};
  }
  return {summarizeThread,primaryText,assessThreadContext,BUSINESS_MAILBOX};
});
