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
      add({
        id:'gmail:'+key,type:'gmail',group,
        rank:reviewInbound?0:reviewTiming?4:9,
        title:reviewInbound?'Read most recent client message':
          reviewTiming?'Review proposal/lead follow-up timing':
            'Monitor recent correspondence',
        eventId:ambiguousOrganization?'':event.id,
        eventName:ambiguousOrganization?'OWS (multiple events)':CLIENT_LABELS[key],
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
        gmailTotal:Object.keys(CLIENT_EVENT_IDS).length
      }
    };
  }
  return {CLIENT_EVENT_IDS,buildQueue};
});
