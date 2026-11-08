(function(root,factory) {
  const api=factory();
  if(typeof module==='object'&&module.exports) module.exports=api;
  if(root) root.LVPTActionQueue=api;
})(typeof window==='undefined'?null:window,function(){
  'use strict';

  // Only exact, previously verified Command Center event IDs may be joined to
  // bounded Gmail-domain metadata. Matching on subjects, venues or company
  // keywords can falsely attribute one client's messages to another event.
  const CLIENT_EVENT_IDS=Object.freeze({
    lithic:'evt-lithic-fintech-2027',
    'quinn-emanuel':'evt-quinn-emanuel-20270106',
    kirkland:'evt-kirkland-ellis-20270313',
    'ows-aws':'evt-ows-20261130',
    imperativex:'evt-imperativex-20261104'
  });
  const CLIENT_LABELS=Object.freeze({
    lithic:'Lithic',
    'quinn-emanuel':'Quinn Emanuel',
    kirkland:'Kirkland & Ellis',
    'ows-aws':'OWS',
    imperativex:'ImperativeX'
  });

  function text(value,max=160) {
    return String(value==null?'':value).replace(/\s+/g,' ').trim().slice(0,max);
  }
  function money(value) {
    return typeof value==='number' && Number.isFinite(value) && value>=0 ?
      value.toLocaleString('en-US',{style:'currency',currency:'USD'}) : 'amount not recorded';
  }
  // Lightweight source-revision marker for stale-approval invalidation.
  // This is NOT used for authentication; the server separately authorizes
  // requests. No email bodies or payment details are stored in the audit table.
  function sourceFingerprint(item) {
    const payload=JSON.stringify([
      item?.id||'',item?.type||'',item?.eventId||'',item?.title||'',
      item?.sourceRevision||[item?.source||'',item?.evidence||'',item?.action||'']
    ]);
    let a=2166136261,b=2779096485;
    for(let i=0;i<payload.length;i++){
      const code=payload.charCodeAt(i);
      a=Math.imul(a^code,16777619)>>>0;
      b=Math.imul(b^code,2246822519)>>>0;
    }
    return a.toString(16).padStart(8,'0')+b.toString(16).padStart(8,'0');
  }
  function decisionApplies(item,record) {
    return Boolean(item&&record&&record.sourceFingerprint===sourceFingerprint(item));
  }
  function eventMap(events) {
    return new Map((Array.isArray(events)?events:[])
      .filter(e=>e && typeof e.id==='string' && e.id)
      .map(e=>[e.id,e]));
  }
  function buildQueue(data,nowMs=Date.now()) {
    const events=eventMap(data?.events);
    const paymentsConnected=data?.paymentsConnected===true;
    const payoutsConnected=data?.payoutsConnected===true;
    const items=[];
    const seen=new Set();
    function add(item) {
      if(!item || seen.has(item.id))return;
      seen.add(item.id);items.push(item);
    }

    if(paymentsConnected) {
      (Array.isArray(data.payments)?data.payments:[]).slice(0,500).forEach(p=>{
        const id=text(p?.paymentId,120);
        const eventId=text(p?.eventId,120);
        if(!id || !events.has(eventId))return;
        const status=text(p.paymentStatus||'Unknown',80);
        const settled=/^paid[\s-]*in[\s-]*full$/i.test(status);
        const initiated=/(?:payment\s+initiated|processing|in\s+progress)/i.test(status);
        const sent=/(?:invoice\s+sent|awaiting\s+(?:deposit|payment))/i.test(status);
        const uninvoiced=/^not invoiced$/i.test(status);
        const positiveBalance=typeof p.balanceDue==='number' && p.balanceDue>0;
        const recordedPaid=typeof p.amountPaid==='number' && p.amountPaid>0;
        const contradiction=(settled && positiveBalance) ||
          (initiated && recordedPaid && typeof p.invoiceTotal==='number' &&
            p.amountPaid>=p.invoiceTotal && p.invoiceTotal>0);
        if(!initiated && !sent && !contradiction && (settled || uninvoiced || !positiveBalance))return;
        const event=events.get(eventId);
        const amount=money(p.invoiceTotal);
        const detail='Invoice '+(text(p.invoiceNumber,100)||'number not recorded')+
          ' · '+amount+' · recorded paid '+money(p.amountPaid)+
          ' · balance '+money(p.balanceDue)+'.';
        const title=contradiction?'Resolve payment ledger inconsistency':
          initiated?'Verify initiated payment settlement':
          sent?'Check invoice receipt and next step':'Review payment status and balance';
        add({
          id:'payment:'+id,type:'payment',group:'review',rank:contradiction?0:initiated?1:2,
          title,eventId,eventName:text(event.eventName||event.company||eventId),
          sourceRevision:[eventId,id,status,p.invoiceNumber,p.invoiceTotal,p.amountPaid,p.balanceDue],
          source:'Payments ledger · '+id,
          evidence:detail+' Recorded status: '+status+'.',
          action:contradiction?
            'Compare processor/bank receipt to this exact invoice; correct the ledger only after confirmation.':
            'Review this exact invoice and settlement evidence. Do not treat initiation or a sent invoice as cleared funds.',
          target:'paymentAuditTitle'
        });
      });
    }
    if(payoutsConnected) {
      (Array.isArray(data.payouts)?data.payouts:[]).slice(0,500).forEach(p=>{
        const id=text(p?.payoutId,120);
        const eventId=text(p?.eventId,120);
        const status=text(p?.status||'Unknown',60);
        if(!id || !events.has(eventId) || /^paid$/i.test(status))return;
        const event=events.get(eventId);
        add({
          id:'payout:'+id,type:'payout',group:'review',rank:3,
          title:/^planned$/i.test(status)?'Review planned payout':'Review payout ledger status',
          eventId,eventName:text(event.eventName||event.company||eventId),
          sourceRevision:[eventId,id,status,p.payee,p.amount],
          source:'Event Payouts ledger · '+id,
          evidence:text(p.payee||'Payee not recorded',120)+' · '+money(p.amount)+
            ' · status '+status+'.',
          action:'Confirm the obligation and independent payment evidence. Planned does not mean due or unpaid; Paid is not bank verification.',
          target:'payoutAuditTitle'
        });
      });
    }

    for(const key of Object.keys(CLIENT_EVENT_IDS)) {
      const event=events.get(CLIENT_EVENT_IDS[key]);
      if(!event)continue; // Never claim identity from a domain alone.
      const record=(Array.isArray(data?.gmail)?data.gmail:[])
        .find(r=>r && r.eventKey===key && r.connected===true);
      if(!record)continue;
      const threads=Array.isArray(record.threads)?record.threads:[];
      if(!threads.length)continue;
      const latest=threads.slice().filter(t=>t && t.lastMessageAt)
        .sort((a,b)=>String(b.lastMessageAt).localeCompare(String(a.lastMessageAt)))[0];
      if(!latest)continue;
      const lastMs=Date.parse(latest.lastMessageAt);
      if(!Number.isFinite(lastMs)||lastMs<=0||lastMs>nowMs)continue;
      const days=Math.floor((nowMs-lastMs)/86400000);
      const direction=text(latest.lastDirection,20);
      // OWS currently has a second Cabo Wabo event. A single domain-level
      // thread is organization evidence, never proof about either event.
      const ambiguousOrganization=key==='ows-aws' &&
        events.has('evt-ows-20261202-cabo-wabo');
      const stage=ambiguousOrganization?'multiple OWS events':
        text(event.eventStatus,80);
      const proposal=/proposal\s+sent/i.test(stage);
      const newLead=/new\s+lead/i.test(stage);
      const completed=/completed|cancelled|declined|lost|closed/i.test(stage);
      // This is a list of REVIEW suggestions, never a determination of
      // reply status. Metadata excludes message bodies, calls and CRM notes.
      const reviewInbound=direction==='inbound';
      const reviewTiming=direction==='outbound' && !completed &&
        !ambiguousOrganization &&
        ((proposal && days>=10) || (newLead && days>=7));
      const group=reviewInbound||reviewTiming?'review':'monitor';
      // Metadata-only outbound timing reviews are NOT permission to draft.
      // OWS has multiple events; do not infer which event an inbound reply concerns.
      const draftCandidate=reviewInbound && !ambiguousOrganization && !completed;
      add({
        id:'gmail:'+key,type:'gmail',group,draftCandidate,
        rank:reviewInbound?0:reviewTiming?4:9,
        title:reviewInbound?'Read most recent client message':
          reviewTiming?'Review proposal/lead follow-up timing':
            'Monitor recent correspondence',
        eventId:ambiguousOrganization?'':event.id,
        eventName:ambiguousOrganization?'OWS (multiple events)':CLIENT_LABELS[key],
        sourceRevision:[key,latest.threadId,latest.lastMessageAt,direction,stage,record.partial===true],
        source:'Bounded Gmail thread headers · '+threads.length+' checked thread(s)',
        evidence:'Last indexed '+(direction==='inbound'?'client message':direction==='outbound'?'LVPT message':'message of unknown direction')+
          ' '+days+' day(s) ago · event stage: '+(stage||'not recorded')+
          (ambiguousOrganization?' · specific event not established':'')+
          (record.partial?' · Gmail search incomplete':'')+'.',
        action:reviewInbound?
          'Read the full conversation, including attachments and CRM notes, before preparing a reply for approval.':
          reviewTiming?
          'Check the full thread, client timing, travel/availability and CRM before proposing an optional follow-up. Do not send automatically.':
          'No outbound action inferred from the limited metadata. Review again when new correspondence arrives.',
        target:'gmailBriefTitle'
      });
    }

    // New Step 43 business-wide inbox evidence. These entries are review
    // candidates ONLY. They are never directly authorized to draft or send.
    const inbox=data?.inbox;
    if(inbox?.connected===true && Array.isArray(inbox.threads)) {
      const alreadyShown=new Set((Array.isArray(data.gmail)?data.gmail:[])
        .flatMap(r=>Array.isArray(r?.threads)?r.threads:[])
        .map(t=>String(t?.threadId||'')));
      inbox.threads.slice(0,25).forEach(t=>{
        const id=text(t?.threadId,40);
        if(!/^[0-9a-f]{8,32}$/i.test(id)||alreadyShown.has(id))return;
        const at=String(t?.lastMessageAt||'');
        const millis=Date.parse(at);
        if(!Number.isFinite(millis)||millis<=0||millis>nowMs)return;
        const direction=t?.lastDirection;
        if(direction!=='inbound'&&direction!=='outbound')return;
        const inbound=direction==='inbound' && t.needsHumanReview===true;
        const domain=text(t.senderDomain,120);
        const subject=text(t.subject||'(no subject)',130);
        const days=Math.floor((nowMs-millis)/86400000);
        add({
          id:'inbox:'+id,type:'inbox',
          draftCandidate:false,group:inbound?'review':'monitor',
          rank:inbound?0:9,
          eventId:'',eventName:domain||'Unmatched business contact',
          title:inbound?'Review recent incoming business email':'Already answered — monitor',
          sourceRevision:[id,at,direction,subject,t.reviewType],
          source:'Read-only business Gmail thread headers · last '+days+' day(s) ago',
          evidence:'Subject: '+subject+'. Latest direction: '+direction+
            '. '+(inbox.partial?'Limited mailbox coverage. ':'')+
            'Original message body has not been reviewed.',
          action:inbound?
            'Open the original thread in the business mailbox. Confirm the request, all replies, and whether action is still needed. Do not draft from headers alone.':
            'Last verified message was from LVPT. Do not propose another message based only on this thread.',
          target:'inboxReviewTitle',threadId:id
        });
      });
    }

    items.sort((a,b)=>a.rank-b.rank ||
      a.eventName.localeCompare(b.eventName) || a.id.localeCompare(b.id));
    const reviewCount=items.filter(x=>x.group==='review').length;
    return {
      items,
      reviewCount,
      monitorCount:items.length-reviewCount,
      coverage:{
        payments:paymentsConnected,
        payouts:payoutsConnected,
        gmailConnected:(Array.isArray(data?.gmail)?data.gmail:[]).filter(r=>
          r && r.connected===true && Object.prototype.hasOwnProperty.call(CLIENT_EVENT_IDS,r.eventKey)).length,
        gmailTotal:Object.keys(CLIENT_EVENT_IDS).length,
        businessInboxConnected:data?.inbox?.connected===true,
        businessInboxPartial:data?.inbox?.partial===true
      }
    };
  }
  return {CLIENT_EVENT_IDS,buildQueue,sourceFingerprint,decisionApplies};
});
