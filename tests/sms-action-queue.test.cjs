const assert=require('node:assert/strict');
const fs=require('node:fs');
const {buildQueue,CLIENT_EVENT_IDS}=require('../public/sms-review/action-queue.js');
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
assert.equal(byId('gmail:quinn-emanuel').group,'monitor','Recent sent proposal must not trigger a follow-up');
assert.equal(byId('gmail:imperativex').group,'monitor','Newly sent lead greeting must not trigger duplicate outreach');
assert.equal(byId('gmail:ows-aws').group,'monitor');
assert.equal(byId('gmail:ows-aws').eventId,'','OWS mail is not attributable to either separate event');
assert.match(byId('gmail:ows-aws').evidence,/specific event not established/);
assert.equal(queue.items.filter(x=>x.type==='payment').length,4);
assert.equal(queue.items.filter(x=>x.type==='payout').length,1);
assert.equal(queue.items.filter(x=>x.type==='gmail').length,5);
assert(queue.reviewCount>=6);
assert.equal(queue.reviewCount+queue.monitorCount,queue.items.length);
const inbound=buildQueue({...data,gmail:[gmail('kirkland','2026-11-05T15:30:00Z','inbound',true)]},now);
assert.equal(inbound.items.find(x=>x.id==='gmail:kirkland').group,'review');
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
console.log('Read-only Action Required queue regression tests passed.');
