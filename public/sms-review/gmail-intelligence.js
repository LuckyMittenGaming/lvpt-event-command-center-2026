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

  function classifyThread(thread, nowMs=Date.now()) {
    if(!thread || typeof thread!=='object') return {kind:'unverified',label:'Mailbox check unavailable',rank:3};
    const direction=String(thread.lastDirection||'unknown');
    const lastDate=Date.parse(thread.lastMessageAt||'');
    const validDate=Number.isFinite(lastDate) && lastDate<=nowMs && lastDate>0;
    const days=validDate?Math.floor((nowMs-lastDate)/86400000):null;
    const context=thread.hasOutboundMessage===true && thread.hasInboundMessage===true;
    // A last inbound message is a reason to read the thread, not proof that
    // the client is awaiting a response; they may have spoken offline.
    if(direction==='inbound') return {
      kind:'inbox-review',rank:0,label:'Review latest client message',
      explanation:'Latest verified thread message came from the client. Read the full thread and CRM before deciding whether a reply is needed.',
      daysSinceLastMessage:days,hasTwoWayHistory:context
    };
    if(direction==='outbound') return {
      kind:'waiting',rank:2,label:'Last message sent by LVPT',
      explanation:'You sent the most recent message in this thread. Monitor for a reply; do not send a duplicate follow-up based only on old SMS.',
      daysSinceLastMessage:days,hasTwoWayHistory:context
    };
    return {
      kind:'unverified',rank:3,label:'Thread direction unverified',
      explanation:'The latest sender cannot be determined safely. Check the business Gmail thread before outreach.',
      daysSinceLastMessage:days,hasTwoWayHistory:context
    };
  }

  function evaluateClient(record,nowMs=Date.now()) {
    const eventKey=String(record?.eventKey||'');
    if(!Object.prototype.hasOwnProperty.call(CLIENTS,eventKey))
      return null;
    if(!record || record.connected!==true)
      return {eventKey,clientLabel:CLIENTS[eventKey],status:'not-connected',
        label:'Direct Gmail evidence not connected',
        explanation:'The Command Center Gmail Activity log is not a complete mailbox search. Do not infer response status.',
        rank:4,threads:[]};
    const rows=(Array.isArray(record.threads)?record.threads:[]).slice(0,10);
    if(rows.length===0)
      return {eventKey,clientLabel:CLIENTS[eventKey],status:'no-match',
        label:'No verified Gmail threads in limited search',
        explanation:'Search coverage is limited and may miss earlier conversations, other email addresses or calls.',
        rank:3,threads:[]};
    const threads=rows.map(t=>({...t,...classifyThread(t,nowMs)}));
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
      partial:Boolean(record.partial),
      threads
    };
  }

  function buildBrief(records, nowMs=Date.now()) {
    const entries=(Array.isArray(records)?records:[]).map(r=>evaluateClient(r,nowMs)).filter(Boolean);
    return entries.sort((a,b)=>a.rank-b.rank ||
      String(b.lastMessageAt||'').localeCompare(String(a.lastMessageAt||'')) ||
      a.clientLabel.localeCompare(b.clientLabel));
  }
  return {CLIENTS,classifyThread,evaluateClient,buildBrief};
});