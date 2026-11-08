const assert=require('node:assert/strict');
const fs=require('node:fs');
const {buildQueue,CLIENT_EVENT_IDS,sourceFingerprint,decisionApplies}=require('../public/sms-review/action-queue.js');
const now=Date.parse('2026-11-05T20:00:00Z');
const events=[
  {id:'evt-nium-2026',eventName:'NIUM',eventStatus:'Completed'},
  {id:'evt-neo-reunion-2026',eventName:'NEO Reunion',eventStatus:'Completed'},
  {id:'evt-ows-20261130',eventName:'OWS Poker',eventStatus:'Booked — Payment Processing'},
  {id:'evt-ows-20261202-cabo-wabo',eventName:'OWS Cabo Wabo',eventStatus:'Proposal Sent'},
  {id:'evt-certapro-painters-20270224',eventName:'CertaPro',eventStatus:'Invoice Sent / Awaiting Deposit'},
  {id:'evt-lithic-fintech-2027',eventName:'Lithic',eventStatus:'Proposal Sent'},
  {id:'evt-quinn-emanuel-20270106',eventName:'Quinn Emanuel',eventStatus:'Proposal Sent'},
  {id:'evt-kirkland-ellis-20270313',eventName:'Kirkland & Ellis',eventStatus:'Proposal Sent'},
  {id:'evt-imperativex-20261104',eventName:'ImperativeX',eventStatus:'New Lead'}
];
const payments=[
  {paymentId:'main',eventId:'evt-nium-2026',invoiceNumber:'MAIN',invoiceTotal:50578.38,amountPaid:50578.38,balanceDue:0,paymentStatus:'Paid In Full'},
  {paymentId:'decks',eventId:'evt-nium-2026',invoiceNumber:'DECKS',invoiceTotal:1353.39,amountPaid:0,balanceDue:1353.39,paymentStatus:'Payment Initiated'},
  {paymentId:'elevated',eventId:'evt-nium-2026',invoiceNumber:'#167',invoiceTotal:4120.20,amountPaid:4120.20,balanceDue:0,paymentStatus:'Payment Initiated'},
  {paymentId:'ows',eventId:'evt-ows-20261130',invoiceNumber:'OWS',invoiceTotal:21183.50,amountPaid:0,balanceDue:21183.50,paymentStatus:'Payment Initiated'},
  {paymentId:'certapro',eventId:'evt-certapro-painters-20270224',invoiceNumber:'',invoiceTotal:11281.50,amountPaid:0,balanceDue:11281.50,paymentStatus:'Invoice Sent'},
  {paymentId:'zero',eventId:'evt-imperativex-20261104',invoiceTotal:0,amountPaid:0,balanceDue:0,paymentStatus:'Not Invoiced'}
];
const payouts=[
  {payoutId:'paid',eventId:'evt-neo-reunion-2026',payee:'Owner A',amount:3000,status:'Paid'},
  {payoutId:'planned',eventId:'evt-neo-reunion-2026',payee:'Owner B',amount:6233.28,status:'Planned'}
];
function gmail(eventKey,when,direction='outbound',partial=false) {
  return {eventKey,connected:true,partial,threads:[{
    threadId:'a1b2c3d4',lastMessageAt:when,lastDirection:direction,
    hasInboundMessage:true,hasOutboundMessage:true
  }]};
}
const gmailEvidence=[
  gmail('lithic','2026-10-23T18:20:05Z'),
  gmail('quinn-emanuel','2026-11-02T04:47:00Z'),
  gmail('kirkland','2026-10-31T08:53:06Z'),
  gmail('ows-aws','2026-11-05T00:34:39Z'),
  gmail('imperativex','2026-11-04T15:53:50Z')
];
const data={events,payments,paymentsConnected:true,payouts,payoutsConnected:true,gmail:gmailEvidence};
const queue=buildQueue(data,now);
const byId=id=>queue.items.find(x=>x.id===id);
assert.equal(queue.coverage.gmailConnected,5);
assert.equal(queue.coverage.payments,true);
assert.equal(queue.coverage.payouts,true);
assert.equal(byId('payment:main'),undefined,'Paid main invoice cannot settle decks');
assert.equal(byId('payment:zero'),undefined,'Not Invoiced 0 does not imply collection urgency');
assert.equal(byId('payment:decks').group,'review');
assert.match(byId('payment:decks').evidence,/DECKS/);
assert.equal(byId('payment:elevated').rank,0,'Amount/status conflict gets highest review rank');
assert.match(byId('payment:elevated').action,/bank receipt/i);
assert.equal(byId('payment:ows').type,'payment');
assert.equal(byId('payment:certapro').type,'payment');
assert.equal(byId('payout:paid'),undefined,'Paid payout does not imply an unpaid obligation');
assert.equal(byId('payout:planned').type,'payout');
assert.match(byId('payout:planned').action,/Planned does not mean due or unpaid/);
assert.equal(byId('gmail:lithic').group,'review','Older proposal merits timing review, not an automatic email');
assert.equal(byId('gmail:lithic').draftCandidate,false,'An old outgoing proposal is never automatically a draft candidate');
assert.equal(byId('gmail:quinn-emanuel').group,'monitor','Recent sent proposal must not trigger a follow-up');
assert.equal(byId('gmail:quinn-emanuel').draftCandidate,false,'Recent outbound email cannot be approved for drafting');
assert.equal(byId('gmail:imperativex').group,'monitor','Newly sent lead greeting must not trigger duplicate outreach');
assert.equal(byId('gmail:ows-aws').group,'monitor');
assert.equal(byId('gmail:ows-aws').eventId,'','OWS mail is not attributable to either separate event');
assert.equal(byId('gmail:ows-aws').draftCandidate,false,'Ambiguous OWS thread must not be approved for drafting');
assert.match(byId('gmail:ows-aws').evidence,/specific event not established/);
assert.equal(queue.items.filter(x=>x.type==='payment').length,4);
assert.equal(queue.items.filter(x=>x.type==='payout').length,1);
assert.equal(queue.items.filter(x=>x.type==='gmail').length,5);
assert(queue.reviewCount>=6);
assert.equal(queue.reviewCount+queue.monitorCount,queue.items.length);
const inbound=buildQueue({...data,gmail:[gmail('kirkland','2026-11-05T15:30:00Z','inbound',true)]},now);
assert.equal(inbound.items.find(x=>x.id==='gmail:kirkland').group,'review');
assert.equal(inbound.items.find(x=>x.id==='gmail:kirkland').draftCandidate,true,'Verified last-inbound message offers a reviewed draft path');
assert.match(inbound.items.find(x=>x.id==='gmail:kirkland').action,/full conversation/i);
const missing=buildQueue({...data,paymentsConnected:false,payoutsConnected:false,gmail:[]},now);
assert.equal(missing.items.length,0,'No source means no invented statuses, reminders or payment claims');
const falseClient=buildQueue({...data,gmail:[gmail('random','2026-11-01T00:00:00Z')]},now);
assert.equal(falseClient.items.some(x=>x.id==='gmail:random'),false);
const future=buildQueue({...data,gmail:[gmail('lithic','2030-01-01T00:00:00Z','inbound')]},now);
assert.equal(future.items.some(x=>x.id==='gmail:lithic'),false);
assert.equal(CLIENT_EVENT_IDS.lithic,'evt-lithic-fintech-2027');
const html=fs.readFileSync(require('node:path').join(__dirname,'../public/sms-review/index.html'),'utf8');
const app=fs.readFileSync(require('node:path').join(__dirname,'../public/sms-review/app.js'),'utf8');
assert.match(html,/action-queue\.js/);
assert.match(html,/id="actionQueueItems"/);
assert.match(app,/actionQueueEngine\.buildQueue/);
assert.match(app,/renderActionQueue\(\);/);
assert(!/sendEmail|saveAllEvents|createTask/.test(fs.readFileSync(require('node:path').join(__dirname,'../public/sms-review/action-queue.js'),'utf8')),
  'Queue engine must not trigger downstream writes or message sends');
const fixture=byId('payment:decks');
const fingerprint=sourceFingerprint(fixture);
assert.match(fingerprint,/^[a-f0-9]{16}$/,'Fingerprint is a compact opaque source revision marker');
const saved={actionKey:fixture.id,decision:'verify_requested',sourceFingerprint:fingerprint};
assert.equal(decisionApplies(fixture,saved),true,'An identical source may reuse the same owner review');
assert.equal(decisionApplies({...fixture,evidence:fixture.evidence+' aged another day'},saved),true,
  'Relative display text must not invalidate an approval without new source data');
assert.equal(decisionApplies({...fixture,sourceRevision:[...fixture.sourceRevision,'Updated balance']},saved),false,
  'Changed source data must invalidate the old decision without mutating history');
const route=fs.readFileSync(require('node:path').join(
  __dirname,'../app/api/sms/staging/action-decisions/route.ts'),'utf8');
assert.match(route,/hasReviewSession\(request\)/,'Decision changes require an authenticated browser cookie');
assert.match(route,/allowedReviewMutation\(request\)/,'Writes require same-origin HTTPS');
assert.match(route,/return=representation/,'Append-only audit insert must be confirmed');
assert.match(route,/request_id/,'Repeated submissions must be idempotent');
assert.match(route,/decision==='draft_requested' && type==='gmail'/,
  'Draft approval must never apply to a payment or payout');
assert(!/gmail\.send|GmailApp\.send|saveAllEvents\(|sendEmail\(/.test(route),
  'Decision API must not send messages or update business records');
assert.match(app,/loadActionDecisions\(/,'Existing audit decisions must load before approval buttons activate');
assert.match(app,/saveOwnerActionDecision\(item,decision\)/,'Review buttons must use authenticated audit endpoint');
assert.match(html,/id="actionDecisionStatus"/,'Separate audit status must be visible');
// Regression: reconciliation must preserve opaque ledger/event IDs containing date-like
// 8-digit suffixes. Applying prose PII redaction turns them into "[number]":
// such keys are rejected by the approval validator and can collide or break joins.
const reconcileRoute=fs.readFileSync(require('node:path').join(
  __dirname,'../app/api/sms/staging/reconcile/route.ts'),'utf8');
assert.match(reconcileRoute,/function safeLedgerId\(input:unknown,maxLength=120\):string/);
assert.match(reconcileRoute,/id:safeLedgerId\(event\.id,100\)/);
assert.match(reconcileRoute,/paymentId:safeLedgerId\(record\.paymentId,120\)/);
assert.match(reconcileRoute,/eventId:safeLedgerId\(record\.eventId,120\)/);
assert.match(reconcileRoute,/payoutId:safeLedgerId\(raw\.payoutId,120\)/);
assert.match(reconcileRoute,/eventId:safeLedgerId\(raw\.eventId,120\)/);
const actionKeyRule=/^(gmail|payment|payout):[A-Za-z0-9_.:-]{1,140}$/;
const datedInvoice='PAY-evt-nium-2026-elevated-final-20261016';
assert.match('payment:'+datedInvoice,actionKeyRule);
assert.doesNotMatch('payment:PAY-evt-nium-2026-elevated-final-[number]',actionKeyRule);
const datedEvent='evt-ows-20261130';
const datedQueue=buildQueue({
  events:[{id:datedEvent,eventName:'OWS'}],paymentsConnected:true,
  payments:[
    {paymentId:'PAY-evt-ows-20261130',eventId:datedEvent,invoiceTotal:1200,
      amountPaid:0,balanceDue:1200,paymentStatus:'Payment Initiated'},
    {paymentId:'PAY-evt-ows-20261130-addon-20261107',eventId:datedEvent,invoiceTotal:500,
      amountPaid:0,balanceDue:500,paymentStatus:'Invoice Sent'}],
  payoutsConnected:false,gmail:[]
},now);
const datedIds=datedQueue.items.map(x=>x.id);
assert.equal(datedIds.length,2,'Distinct invoices must remain independently actionable');
assert(datedIds.every(id=>actionKeyRule.test(id)),
  'Staging audit must accept canonical IDs with numeric date suffixes');

// Monitor-only email cards must not offer drafting approval. A recent LVPT
// outbound message is not a reason to launch a duplicate follow-up.
assert.match(app,/item\.draftCandidate===true&&!isPaused\(item\)/,
  'Only verified inbound reply candidates expose Approve for Drafting');
assert.match(app,/decision==='draft_requested' && !item\.draftCandidate/,
  'Saving a draft approval for monitoring or outbound timing is blocked');
assert.match(app,/item\.type==='gmail' && item\.draftCandidate===true/,
  'Existing approvals cannot open previews for non-inbound candidates');
assert.match(app,/Monitoring only — drafting approval unavailable/,
  'Monitoring cards should explain why draft approval is unavailable');
const monitoringMail=byId('gmail:quinn-emanuel');
assert.equal(monitoringMail.group,'monitor',
  'Recent outgoing correspondence must remain monitoring-only');

assert.match(app,/Client correspondence & sales opportunities/);
assert.match(app,/Financial verification & reconciliation/);
assert.match(app,/Follow-up timing review only/);
assert.match(app,/No verified inbound reply candidate in the five bounded client searches/);
// A prior audit approval must remain visible without implying that monitoring
// or outbound-only timing review currently grants permission to draft.
assert.match(app,/const historicalDraftBlocked=valid && item\.type==='gmail'/);
assert.match(app,/stored\?\.decision==='draft_requested' && item\.draftCandidate!==true/);
assert.match(app,/Historical drafting approval — currently blocked by correspondence safeguards/);
console.log('Action Required queue and non-sending, append-only approval controls tests passed.');
