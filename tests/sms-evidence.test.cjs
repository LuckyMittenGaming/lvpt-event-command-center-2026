const assert=require('node:assert/strict');
const {inspectBundle,similarity,payoutCrossCheck,payoutBrief}=require('../public/sms-review/evidence-overlap.js');
const event={id:'evt-neo-reunion-2026',taskEvidence:[{title:'Confirm custom decks and printed cards',status:'Complete'}],emailTopics:[{subject:'Updated floor plan and load-in packet',date:'2026-08-14'}]};
const payouts=[{eventId:event.id,payee:'Mark Streeter',payoutType:'Owner Distribution',amount:6233.28,status:'Planned'},{eventId:event.id,payee:'Mark Streeter',payoutType:'Owner Distribution',amount:3000,status:'Paid'},{eventId:'evt-nium-2026',payee:'Mark Streeter',amount:6233.28,status:'Paid'}];
assert.equal(similarity('poker training event today','client poker training'),0);
assert(similarity('Please confirm custom decks and printed cards',event.taskEvidence[0].title)>=0.62);
const bundle={explicitReference:true,findings:[{excerpt:'Mosaic updated floor plan and load-in packet arrived',amounts:[]},{excerpt:'Streeter $6,233.28 owner distribution planned for later',amounts:['$6,233.28']}]};
const evidence=inspectBundle(bundle,[event],payouts,true,event);
assert.equal(evidence.emailMatches[0].subject,'Updated floor plan and load-in packet');
assert.equal(evidence.payoutEvidence.count,2);
assert.equal(evidence.payoutEvidence.statuses.Planned,1);
assert.equal(evidence.payoutEvidence.matching[0].ledgerStatus,'Planned');
assert.equal(evidence.payoutEvidence.matching.length,1);
const noPayee=payoutCrossCheck({explicitReference:true,findings:[{excerpt:'$6,233.28 proposed',amounts:['$6,233.28']}]},event,payouts,true);
assert.equal(noPayee.matching.length,0);
assert.equal(payoutCrossCheck(bundle,event,payouts,false),null);
assert.equal(inspectBundle({...bundle,explicitReference:false},[event],payouts,true,event).linked,false);

const splitAcrossMessages=payoutCrossCheck({
  explicitReference:true,
  findings:[
    {smsId:50,excerpt:'Streeter is checking the owner distribution today',amounts:[]},
    {smsId:51,excerpt:'A $6,233.28 distribution may happen next month',amounts:['$6,233.28']}
  ]
},event,payouts,true);
assert.equal(splitAcrossMessages.matching.length,0,'Do not join payee and amount across unrelated SMS');
const wrongStatus=payoutCrossCheck({
  explicitReference:true,findings:[{smsId:52,excerpt:'Streeter owner draw $6,233.28 is being discussed',amounts:['$6,233.28']}]
},event,payouts,true);
assert.equal(wrongStatus.matching[0].ledgerStatus,'Planned','Planned payout must never be described as Paid');
assert.equal(wrongStatus.matching[0].smsId,52);
assert.equal(payoutCrossCheck({...bundle,explicitReference:false},event,payouts,true),null,'Unlinked events must not receive payout matches');


const brief=payoutBrief(payouts,true,[
  {id:event.id,eventName:'Mosaic / NEO'},
  {id:'evt-nium-2026',eventName:'NIUM'}
]);
assert.equal(brief.connected,true);
assert.equal(brief.total,3);
assert.equal(brief.paid,2);
assert.equal(brief.planned,1);
assert.equal(brief.other,0);
assert.equal(brief.exceptions.length,1);
assert.equal(brief.exceptions[0].amount,6233.28);
assert.equal(brief.exceptions[0].eventName,'Mosaic / NEO');
assert.equal(payoutBrief(payouts,false,[event]).connected,false,'No ledger brief when disconnected');

console.log('SMS read-only evidence matching tests passed.');
