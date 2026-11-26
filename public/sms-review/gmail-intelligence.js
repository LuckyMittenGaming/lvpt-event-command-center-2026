(function(root,factory) {
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.LVPTGmailIntelligence=api;
})(typeof window==='undefined'?null:window,function(){
  'use strict';

  const CLIENTS=Object.freeze({
    'lithic':'Lithic',
    'quinn-emanuel':'Quinn Emanuel',
    'kirkland':'Kirkland & Ellis',
    'ows-aws':'OWS',
    'imperativex':'ImperativeX'
  });

  function loadTriage() {
    if(typeof window!=='undefined'&&window.LVPTGmailTriage)
      return window.LVPTGmailTriage;
    if(typeof require==='function') {
      try {return require('./gmail-thread-triage.js');}
      catch(ignore) {return null;}
    }
    return null;
  }

  function resolveEvidenceScope(recordOrThread) {
    const raw=String(
      recordOrThread?.evidenceKind||
      recordOrThread?.gmailEvidenceScope||
      recordOrThread?.scope||
      recordOrThread?.source||
      ''
    ).toLowerCase();
    if(raw.includes('full_thread')||raw==='full'||
       raw==='owner_approved_bounded_full_thread_preview'||
       raw==='approved_read_only_gmail_draft_context')
      return 'full_thread';
    if(raw.includes('header')||raw.includes('headers_only')||
       raw==='bounded_live_gmail_header_metadata'||
       raw==='limited_business_domain_and_headers_only'||
       raw==='bounded_domain_matched_message_headers_only')
      return 'header';
    if(raw.includes('stored')||raw.includes('activity')||
       raw==='command_center_logged_activity_only')
      return 'stored';
    // Metadata-only thread rows from the bounded evidence reader carry
    // direction flags without message bodies — treat as header scope.
    if(recordOrThread && typeof recordOrThread==='object' &&
       Object.prototype.hasOwnProperty.call(recordOrThread,'lastDirection') &&
       !Array.isArray(recordOrThread.messages))
      return 'header';
    return 'unverified';
  }

  function contractAssessment(thread) {
    const triage=loadTriage();
    if(!triage||typeof triage.assessThreadContext!=='function') {
      return {
        ok:false,
        mailboxIdentityVerified:false,
        providerThreadIdentityVerified:false,
        evidenceKind:'unverified',
        fullThreadReady:false,
        completeClientContext:false,
        correspondence:'unverified',
        latestRelevantInboundAt:null,
        recipientEmail:null,
        mutatesGmail:false,
        reason:'Triage contract assessor unavailable; full-thread readiness denied.'
      };
    }
    return triage.assessThreadContext({
      threadId:thread?.threadId,
      expectedThreadId:thread?.expectedThreadId,
      mailbox:thread?.mailbox,
      expectedMailbox:thread?.expectedMailbox||triage.BUSINESS_MAILBOX,
      evidenceKind:thread?.evidenceKind||thread?.gmailEvidenceScope||
        thread?.scope||thread?.source,
      gmailEvidenceScope:thread?.gmailEvidenceScope,
      scope:thread?.scope,
      source:thread?.source,
      relationshipHint:thread?.relationshipHint,
      partial:thread?.partial===true,
      truncated:thread?.truncated===true,
      fullThreadEnumerated:thread?.fullThreadEnumerated,
      messages:thread?.messages,
      recipientEmail:thread?.recipientEmail
    });
  }

  function classifyThread(thread, nowMs=Date.now()) {
    if(!thread || typeof thread!=='object') return {
      kind:'unverified',label:'Mailbox check unavailable',rank:3,
      evidenceScope:'unverified',fullThreadReady:false,completeClientContext:false,
      mailboxIdentityVerified:false,providerThreadIdentityVerified:false
    };
    const assessment=contractAssessment(thread);
    const evidenceScope=assessment.evidenceKind||resolveEvidenceScope(thread);
    const direction=String(thread.lastDirection||'unknown');
    const lastDate=Date.parse(thread.lastMessageAt||'');
    const validDate=Number.isFinite(lastDate) && lastDate<=nowMs && lastDate>0;
    const days=validDate?Math.floor((nowMs-lastDate)/86400000):null;
    const context=thread.hasOutboundMessage===true && thread.hasInboundMessage===true;
    const relationship=String(thread.relationshipHint||'unclassified').toLowerCase();
    const partial=thread.partial===true||thread.truncated===true||
      thread.fullThreadEnumerated===false||assessment.evidenceKind==='header'||
      assessment.evidenceKind==='stored';
    const readiness={
      evidenceScope,
      fullThreadReady:assessment.fullThreadReady===true,
      completeClientContext:assessment.completeClientContext===true,
      mailboxIdentityVerified:assessment.mailboxIdentityVerified===true,
      providerThreadIdentityVerified:assessment.providerThreadIdentityVerified===true,
      correspondence:assessment.correspondence||'unverified',
      latestRelevantInboundAt:assessment.latestRelevantInboundAt||null,
      recipientEmail:assessment.recipientEmail||null,
      mutatesGmail:false,
      partial:Boolean(partial),
      contractReason:assessment.reason||''
    };
    if(relationship==='internal'||assessment.correspondence==='internal_forward')
      return {
        kind:'internal',rank:4,label:'Internal or forwarded correspondence',
        explanation:'Internal or forwarded mail is not complete client context. Do not treat header or forward wrappers as a client inquiry.',
        daysSinceLastMessage:days,hasTwoWayHistory:context,...readiness
      };
    if(relationship==='vendor'||assessment.correspondence==='vendor')
      return {
        kind:'vendor',rank:4,label:'Vendor or venue correspondence',
        explanation:'Vendor or venue mail is operational, not client sales context. Full-thread readiness still requires the authorized reader.',
        daysSinceLastMessage:days,hasTwoWayHistory:context,...readiness
      };
    if(evidenceScope==='stored'||evidenceScope==='header'||evidenceScope==='unverified'||
       readiness.fullThreadReady!==true) {
      // Header/stored/incomplete rows may cue review, but never certify readiness.
      if(!validDate) return {
        kind:'unverified',rank:3,label:'Thread chronology unavailable',
        explanation:'A reliable message timestamp was not available. Open Gmail to check the conversation before suggesting outreach.',
        daysSinceLastMessage:null,hasTwoWayHistory:context,...readiness
      };
      if(direction==='inbound') return {
        kind:'inbox-review',rank:0,label:'Review latest client message',
        explanation:'Latest verified thread message came from the client. Read the full thread and CRM before deciding whether a reply is needed. Header or stored scans are not full-thread readiness.',
        daysSinceLastMessage:days,hasTwoWayHistory:context,...readiness
      };
      if(direction==='outbound') return {
        kind:'waiting',rank:2,label:'Last message sent by LVPT',
        explanation:'You sent the most recent message in this thread. Monitor for a reply; do not send a duplicate follow-up based only on old SMS. Header or stored scans are not full-thread readiness.',
        daysSinceLastMessage:days,hasTwoWayHistory:context,...readiness
      };
      return {
        kind:'unverified',rank:3,label:'Thread direction unverified',
        explanation:'The latest sender cannot be determined safely from non-full-thread evidence.',
        daysSinceLastMessage:days,hasTwoWayHistory:context,...readiness
      };
    }
    if(!validDate) return {
      kind:'unverified',rank:3,label:'Thread chronology unavailable',
      explanation:'A reliable message timestamp was not available. Open Gmail to check the conversation before suggesting outreach.',
      daysSinceLastMessage:null,hasTwoWayHistory:context,...readiness
    };
    // A last inbound message is a reason to read the thread, not proof that
    // the client is awaiting a response; they may have spoken offline.
    if(direction==='inbound') return {
      kind:'inbox-review',rank:0,label:'Review latest client message',
      explanation:'Latest verified thread message came from the client. Read the full thread and CRM before deciding whether a reply is needed.',
      daysSinceLastMessage:days,hasTwoWayHistory:context,...readiness
    };
    if(direction==='outbound') return {
      kind:'waiting',rank:2,label:'Last message sent by LVPT',
      explanation:'You sent the most recent message in this thread. Monitor for a reply; do not send a duplicate follow-up based only on old SMS.',
      daysSinceLastMessage:days,hasTwoWayHistory:context,...readiness
    };
    return {
      kind:'unverified',rank:3,label:'Thread direction unverified',
      explanation:'The latest sender cannot be determined safely. Check the business Gmail thread before outreach.',
      daysSinceLastMessage:days,hasTwoWayHistory:context,...readiness
    };
  }

  function evaluateClient(record,nowMs=Date.now()) {
    const eventKey=String(record?.eventKey||'');
    if(!Object.prototype.hasOwnProperty.call(CLIENTS,eventKey))
      return null;
    const recordScope=resolveEvidenceScope(record);
    const triage=loadTriage();
    // Expected mailbox may default to the known business address. Observed
    // mailbox must come only from explicit thread/record evidence — never
    // invent BUSINESS_MAILBOX as the observed identity.
    const expectedMailbox=record?.expectedMailbox||triage?.BUSINESS_MAILBOX||'';
    if(!record || record.connected!==true)
      return {eventKey,clientLabel:CLIENTS[eventKey],status:'not-connected',
        label:'Direct Gmail evidence not connected',
        explanation:'The Command Center Gmail Activity log is not a complete mailbox search. Do not infer response status.',
        rank:4,threads:[],evidenceScope:recordScope||'stored',
        fullThreadReady:false,completeClientContext:false};
    const rows=(Array.isArray(record.threads)?record.threads:[]).slice(0,10);
    if(rows.length===0)
      return {eventKey,clientLabel:CLIENTS[eventKey],
        status:record.partial?'incomplete':'no-match',
        label:record.partial?'Gmail thread evidence incomplete':'No verified Gmail threads in limited search',
        explanation:'This is a bounded metadata search, not a complete mailbox check. Earlier threads, alternate addresses and calls may exist.',
        rank:3,threads:[],evidenceScope:recordScope||'header',
        fullThreadReady:false,completeClientContext:false};
    const threads=rows.map(t=>{
      const identity={
        ...t,
        mailbox:t.mailbox||record.mailbox,
        expectedMailbox:t.expectedMailbox||record.expectedMailbox||expectedMailbox,
        // Propagate expected thread identity only when explicitly supplied;
        // never invent a match from the observed id alone.
        expectedThreadId:t.expectedThreadId||record.expectedThreadId,
        evidenceKind:t.evidenceKind||record.evidenceKind||record.gmailEvidenceScope||recordScope,
        gmailEvidenceScope:t.gmailEvidenceScope||record.gmailEvidenceScope,
        partial:t.partial===true||record.partial===true,
        truncated:t.truncated===true||record.truncated===true,
        fullThreadEnumerated:t.fullThreadEnumerated,
        relationshipHint:t.relationshipHint||record.relationshipHint,
        messages:t.messages||record.messages,
        recipientEmail:t.recipientEmail||record.recipientEmail
      };
      return {...identity,...classifyThread(identity,nowMs)};
    });
    // Never elevate an older, potentially resolved inbound thread over a
    // newer outbound message in another thread for the same customer.
    const mostRecent=threads.slice().sort((a,b)=>String(b.lastMessageAt).localeCompare(String(a.lastMessageAt)))[0];
    const chosen=mostRecent;
    const olderInboundThreads=threads.filter(t=>t!==chosen && t.kind==='inbox-review').length;
    return {
      eventKey,clientLabel:CLIENTS[eventKey],status:chosen.kind,rank:chosen.rank,
      label:chosen.label,explanation:chosen.explanation,
      lastMessageAt:chosen.lastMessageAt||null,
      lastDirection:chosen.lastDirection||'unknown',
      threadCount:rows.length,
      olderInboundThreads,
      partial:Boolean(record.partial)||Boolean(record.truncated),
      evidenceScope:chosen.evidenceScope||recordScope||'header',
      fullThreadReady:chosen.fullThreadReady===true,
      completeClientContext:chosen.completeClientContext===true,
      mailboxIdentityVerified:chosen.mailboxIdentityVerified===true,
      providerThreadIdentityVerified:chosen.providerThreadIdentityVerified===true,
      threads
    };
  }

  function buildBrief(records, nowMs=Date.now()) {
    const entries=(Array.isArray(records)?records:[]).map(r=>evaluateClient(r,nowMs)).filter(Boolean);
    return entries.sort((a,b)=>a.rank-b.rank ||
      String(b.lastMessageAt||'').localeCompare(String(a.lastMessageAt||'')) ||
      a.clientLabel.localeCompare(b.clientLabel));
  }
  return {CLIENTS,classifyThread,evaluateClient,buildBrief,resolveEvidenceScope};
});
