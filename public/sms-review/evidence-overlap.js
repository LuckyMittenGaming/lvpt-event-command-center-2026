(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.LVPTSMSEvidence=api;})(typeof window==='undefined'?null:window,function(){
'use strict';
// Words common to virtually every poker event are not duplicate evidence.
const STOP=new Set('poker training event events client clients corporate team vegas the for from and with your our their will have has that this they them were was there just about into after before please need needs done send sent email follow update updated meeting next now one two day time same new old year nium mosaic neo venetian lineaje ows aws invoice invoices'.split(' '));
function tokens(v){return [...new Set(String(v||'').toLowerCase().replace(/[^a-z0-9 ]+/g,' ').split(/\s+/).filter(t=>t.length>=4&&!STOP.has(t)&&!/^\d{4,}$/.test(t)))];}
function similarity(a,b){const x=tokens(a),y=tokens(b);if(x.length<2||y.length<2)return 0;const set=new Set(y),shared=x.filter(t=>set.has(t)).length;return shared>=2?shared/Math.max(2,Math.min(x.length,y.length)):0;}
function overlaps(entries,findings,key,max=2){
 const items=[];
 for(const e of (entries||[]).slice(0,150)){
  if(!e||!e[key])continue;let score=0;
  for(const f of (findings||[]).slice(0,75)) score=Math.max(score,similarity(f.excerpt,e[key]));
  if(score>=0.62)items.push({...e,score});
 }
 return items.sort((a,b)=>b.score-a.score).slice(0,max);
}
function toCents(v){const n=Number(String(v??'').replace(/[$,\s]/g,''));return Number.isFinite(n)&&n>0?Math.round(n*100):null;}
function payoutCrossCheck(bundle,record,payouts,connected){
 if(!connected||!record)return null;
 const list=(payouts||[]).filter(p=>p.eventId===record.id);
 const statuses={Paid:0,Planned:0,Other:0};
 for(const p of list){if(/^paid$/i.test(p.status||''))statuses.Paid++;else if(/^planned$/i.test(p.status||''))statuses.Planned++;else statuses.Other++;}
 const amounts=new Set((bundle.findings||[]).flatMap(f=>f.amounts||[]).map(toCents).filter(v=>v!==null));
 const text=(bundle.findings||[]).map(f=>String(f.excerpt||'')).join(' ').toLowerCase();
 const matching=list.filter(p=>{
  const amount=toCents(p.amount);
  if(amount===null||!amounts.has(amount))return false;
  // A matching dollar amount alone is NEVER sufficient. Require a named payee.
  const payee=tokens(p.payee||'');
  return payee.some(t=>t.length>=5&&new RegExp('\\b'+t+'\\b','i').test(text));
 }).slice(0,5).map(p=>({payee:p.payee,payoutType:p.payoutType,amount:p.amount,ledgerStatus:p.status,paidDate:p.paidDate}));
 return {count:list.length,statuses,matching};
}
function inspectBundle(bundle,events,payouts,connected,record){
 if(!bundle||!bundle.explicitReference||!record)return {linked:false,taskMatches:[],emailMatches:[],payoutEvidence:null};
 return {linked:true,taskMatches:overlaps(record.taskEvidence,bundle.findings,'title'),
 emailMatches:overlaps(record.emailTopics,bundle.findings,'subject'),
 payoutEvidence:payoutCrossCheck(bundle,record,payouts,connected)};
}
return {inspectBundle,similarity,tokens,payoutCrossCheck};
});