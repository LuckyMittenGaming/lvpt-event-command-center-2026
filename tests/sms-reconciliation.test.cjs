const assert=require('node:assert/strict');
const {checkCase,prioritizeCase}=require('../public/sms-review/reconciliation.js');
const records=[
  {id:'evt-nium-2026',eventStatus:'Completed',paymentStatus:'Paid In Full',
   ledgerPaidInFull:true,recordedAmountPaid:50578.38,completedTaskCount:9,openTaskCount:1,
   recordedGmailActivityCount:7},
  {id:'evt-neo-reunion-2026',eventStatus:'Completed',paymentStatus:'Paid In Full',
   ledgerPaidInFull:true,recordedAmountPaid:42610.95,completedTaskCount:8,openTaskCount:0,
   recordedGmailActivityCount:12},
  {id:'evt-lineaje-2026',eventStatus:'Completed',paymentStatus:'Paid In Full',
   ledgerPaidInFull:true,recordedAmountPaid:10491.25,completedTaskCount:3,openTaskCount:0,
   recordedGmailActivityCount:4}
];
const payment={eventKey:'nium',explicitReference:true,topic:'Payments / receivables — verify',financial:true};
const result=checkCase(payment,records);
assert.equal(result.state,'ledger-settled');
assert.equal(result.record.id,'evt-nium-2026');
assert.match(result.detail,/separate invoice/i);

const neo=checkCase({...payment,eventKey:'mosaic-neo'},records);
assert.equal(neo.state,'ledger-settled');
assert.match(neo.detail,/42,610/);

const draws=checkCase({...payment,topic:'Owner draws / distributions'},records);
assert.equal(draws.state,'verify-finance');
assert.match(draws.detail,/payouts/i);

const todo=checkCase({eventKey:'nium',explicitReference:true,financial:false,topic:'Possible follow-ups — check current status'},records);
assert.equal(todo.state,'check-duplicate');
assert.match(todo.detail,/do not prove/i);

const venue=checkCase({...payment,eventKey:'unmatched',explicitReference:false},records);
assert.equal(venue.state,'unmatched');

const other=checkCase({...payment,eventKey:'ows-aws'},records);
assert.equal(other.state,'unlinked');

const absent=checkCase({...payment,eventKey:'nium'},[]);
assert.equal(absent.state,'unlinked');


const settled=prioritizeCase(payment,records,{status:'Unreviewed'},true);
assert.equal(settled.group,'likely-resolved');
assert.equal(settled.rank,3);
const existingReview=prioritizeCase(payment,records,{status:'Needs verification'},true);
assert.equal(existingReview.group,'review-first');
assert.equal(existingReview.rank,0,'Manually flagged cases remain prominent');
const unverified=prioritizeCase(payment,[],{status:'Unreviewed'},false);
assert.equal(unverified.group,'unverified','No stale fallback when ledger unavailable');
const unidentified=prioritizeCase(venue,records,{status:'Unreviewed'},true);
assert.equal(unidentified.group,'unverified','Venue-only SMS never auto matches');
const ownerDraw=prioritizeCase({...payment,topic:'Owner draws / distributions'},records,{status:'Unreviewed'},true);
assert.equal(ownerDraw.group,'review-first','Paid-in-full client payment does not settle owner draws');
const manuallyClosed=prioritizeCase(payment,records,{status:'Reviewed — no action'},true);
assert.equal(manuallyClosed.group,'reviewed','Manual closure preserved');

console.log('SMS read-only reconciliation tests passed.');
