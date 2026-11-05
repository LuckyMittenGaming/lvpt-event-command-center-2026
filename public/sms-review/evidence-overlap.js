(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.LVPTSMSEvidence=api;
})(typeof window==='undefined'?null:window,function(){
  'use strict';
  const STOP=new Set(
    'poker training event events client clients corporate team vegas the for from and with your our their will have has that this they them were was there just about into after before please need needs done send sent email follow update updated meeting next now one two day time same new old year nium mosaic neo venetian lineaje ows aws invoice invoices'
    .split(' ')
  );
  const PAYOUT_CONTEXT=/\b(?:payout|paid|paying|pay|payment|payee|owner|partner|draws?|distribution|split|transferred|transfer|owe|owed|reimburs|expense)\b/i;
  function tokens(v){
    return [...new Set(String(v||'').toLowerCase()
      .replace(/[^a-z0-9 ]+/g,' ').split(/\s+/)
      .filter(t=>t.length>=4&&!STOP.has(t)&&!/^\d{4,}$/.test(t)))];
  }
  function similarity(a,b){
    const x=tokens(a),y=tokens(b);
    if(x.length<2||y.length<2)return 0;
    const set=new Set(y),shared=x.filter(t=>set.has(t)).length;
    return shared>=2 ? shared/Math.max(2,Math.min(x.length,y.length)) : 0;
  }
  function overlaps(entries,findings,key,max=2){
    const items=[];
    for(const e of (entries||[]).slice(0,150)){
      if(!e||!e[key])continue;
      let score=0;
      for(const f of (findings||[]).slice(0,75))
        score=Math.max(score,similarity(f.excerpt,e[key]));
      if(score>=0.62)items.push({...e,score});
    }
    return items.sort((a,b)=>b.score-a.score).slice(0,max);
  }
  function toCents(v){
    const n=Number(String(v??'').replace(/[$,\s]/g,''));
    return Number.isFinite(n)&&n>0?Math.round(n*100):null;
  }
  function namedPayeeInSms(payee,excerpt){
    const surname=String(payee||'').trim().split(/\s+/).at(-1)||'';
    if(surname.length<5||!/^[a-z-]+$/i.test(surname))return false;
    return new RegExp('\\b'+surname.replace(/[-]/g,'\\-')+'\\b','i').test(excerpt||'');
  }
  function sameMessagePaymentReference(p,findings){
    const payoutAmount=toCents(p.amount);
    if(payoutAmount===null)return null;
    // A surname, identical dollar amount and payout-related wording must ALL
    // appear in the SAME message. Never join fields from unrelated SMS.
    for(const f of (findings||[])){
      const excerpt=String(f.excerpt||'');
      if(!PAYOUT_CONTEXT.test(excerpt)||!namedPayeeInSms(p.payee,excerpt))continue;
      const values=(f.amounts||[]).map(toCents);
      if(values.includes(payoutAmount))return {smsId:f.smsId||null};
    }
    return null;
  }
  function payoutCrossCheck(bundle,record,payouts,connected){
    if(!connected||!record||!bundle?.explicitReference)return null;
    const list=(payouts||[]).filter(p=>p.eventId===record.id);
    const statuses={Paid:0,Planned:0,Other:0};
    for(const p of list){
      if(/^paid$/i.test(p.status||''))statuses.Paid++;
      else if(/^planned$/i.test(p.status||''))statuses.Planned++;
      else statuses.Other++;
    }
    const matching=list.flatMap(p=>{
      const source=sameMessagePaymentReference(p,bundle.findings);
      if(!source)return [];
      return [{
        payee:p.payee,payoutType:p.payoutType,amount:p.amount,
        ledgerStatus:p.status,paidDate:p.paidDate,
        smsId:source.smsId,
        verification:'possible_same_message_reference_not_bank_verified'
      }];
    }).slice(0,5);
    return {count:list.length,statuses,matching};
  }
  function inspectBundle(bundle,events,payouts,connected,record){
    if(!bundle||!bundle.explicitReference||!record)
      return {linked:false,taskMatches:[],emailMatches:[],payoutEvidence:null};
    return {
      linked:true,
      taskMatches:overlaps(record.taskEvidence,bundle.findings,'title'),
      emailMatches:overlaps(record.emailTopics,bundle.findings,'subject'),
      payoutEvidence:payoutCrossCheck(bundle,record,payouts,connected)
    };
  }
  function payoutBrief(payouts,connected,events) {
    if(!connected)return {connected:false,total:0,paid:0,planned:0,other:0,exceptions:[]};
    const rows=Array.isArray(payouts)?payouts:[];
    const eventNames=new Map((events||[]).map(e=>[e.id,e.eventName||e.company||e.id]));
    const exceptions=rows.filter(p=>!/^paid$/i.test(String(p.status||'')))
      .slice(0,30).map(p=>({
        eventName:eventNames.get(p.eventId)||'Event record not identified',
        payee:String(p.payee||'Payee not recorded').slice(0,120),
        payoutType:String(p.payoutType||'Payout').slice(0,80),
        status:String(p.status||'Unknown').slice(0,50),
        amount:typeof p.amount==='number'&&Number.isFinite(p.amount)?p.amount:null
      }));
    return {
      connected:true,total:rows.length,
      paid:rows.filter(p=>/^paid$/i.test(String(p.status||''))).length,
      planned:rows.filter(p=>/^planned$/i.test(String(p.status||''))).length,
      other:rows.filter(p=>!/^(?:paid|planned)$/i.test(String(p.status||''))).length,
      exceptions
    };
  }
  return {inspectBundle,similarity,tokens,payoutCrossCheck,sameMessagePaymentReference,payoutBrief};
});