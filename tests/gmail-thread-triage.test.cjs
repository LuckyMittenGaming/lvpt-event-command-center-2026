const assert=require('node:assert/strict');
const {
  summarizeThread,primaryText,assessThreadContext,BUSINESS_MAILBOX
}=require('../public/sms-review/gmail-thread-triage.js');
const gmail=require('../public/sms-review/gmail-intelligence.js');
const BUSINESS=['book@example.test'];
const msg=(date,from,body)=>({email_ts:date,from,body});
const test=(items,expected)=>assert.equal(
 summarizeThread({messages:items,total_messages:items.length},BUSINESS).state,expected);
test([
 msg('2026-10-01T00:00:00Z','book@example.test','Here is the proposal'),
 msg('2026-10-02T00:00:00Z','client@test.test','Unfortunately we have decided not to move forward at this time.'),
 msg('2026-10-03T00:00:00Z','book@example.test','Thank you; we hope to work again')
],'declined');
test([
 msg('2026-10-01T00:00:00Z','client@test.test','Would you send the event plan?'),
 msg('2026-10-02T00:00:00Z','book@example.test','Here is your proposal. Please review.')
],'proposal_sent_awaiting');
test([
 msg('2026-10-01T00:00:00Z','client@test.test','Can you quote the event?'),
 msg('2026-10-02T00:00:00Z','book@example.test','The agreement has been signed and your invoice was sent.')
],'fulfillment_check');
test([
 msg('2026-10-01T00:00:00Z','client@test.test','Please send a quote.'),
 msg('2026-10-02T00:00:00Z','book@example.test','Thanks, we will reply.')
],'answered_or_awaiting');
test([
 msg('2026-10-01T00:00:00Z','book@example.test','Here is a proposal'),
 msg('2026-10-02T00:00:00Z','client@test.test','Can you adjust to 10 guests?')
],'inbound_last_review');
test([msg('2026-10-02T00:00:00Z','book@example.test','Here is a quote')],'outbound_only');
assert.equal(summarizeThread({messages:[msg('2026-10-02T00:00:00Z','client@test.test','Yes')],total_messages:2},BUSINESS).state,'insufficient_evidence');
assert.equal(summarizeThread({messages:[msg('2026-10-02T00:00:00Z','client@test.test','Yes')],total_messages:1,truncated:true},BUSINESS).state,'insufficient_evidence');
assert.equal(summarizeThread({messages:[{from:'client@test.test',body:'Yes'}],total_messages:1},BUSINESS).state,'insufficient_evidence');
const quoted='Thanks for the proposal.\nOn Thu, Oct 29, 2026 at 7:42 PM Client wrote:\nWe won\'t be moving forward.';
assert.equal(primaryText(quoted),'Thanks for the proposal.');
test([
 msg('2026-10-01T00:00:00Z','client@test.test','Would you provide pricing?'),
 msg('2026-10-02T00:00:00Z','book@example.test',quoted)
],'answered_or_awaiting');
assert.equal(summarizeThread({messages:[msg('2026-10-01T00:00:00Z','client@test.test','We are not moving forward')],total_messages:1},BUSINESS).state,'declined');
// Real connected Gmail serializes the sender header as from_, not from.
assert.equal(summarizeThread({messages:[
 {email_ts:'2026-10-01T12:00:00Z',from_:'Client <client@test.test>',body:'Please quote the event.'},
 {email_ts:'2026-10-02T12:00:00Z',from_:'LVPT <book@example.test>',body:'Here is your proposal.'}
],total_messages:2},BUSINESS).state,'proposal_sent_awaiting',
  'Gmail provider from_ metadata must distinguish outgoing replies');

// --- R11 thread-context contracts (synthetic only; no real bodies) ---
const THREAD='aabbccddeeff0011';
const mailbox=BUSINESS_MAILBOX;
assert.equal(assessThreadContext({
  threadId:'not-a-thread',mailbox,evidenceKind:'full_thread',
  messages:[msg('2026-11-01T00:00:00Z','client@example.test','Dates?')]
}).ok,false,'Exact provider thread identity is required');
assert.equal(assessThreadContext({
  threadId:THREAD,mailbox:'wsopamatt@gmail.com',evidenceKind:'full_thread',
  messages:[msg('2026-11-01T00:00:00Z','client@example.test','Dates?')]
}).ok,false,'Exact business mailbox identity is required');
assert.equal(assessThreadContext({
  threadId:THREAD,mailbox,evidenceKind:'header'
}).fullThreadReady,false,'Header scans are not full-thread readiness');
assert.equal(assessThreadContext({
  threadId:THREAD,mailbox,evidenceKind:'stored'
}).completeClientContext,false,'Stored activity is not complete client context');
assert.equal(assessThreadContext({
  threadId:THREAD,mailbox,evidenceKind:'full_thread',partial:true,
  messages:[msg('2026-11-01T00:00:00Z','client@example.test','Can we confirm headcount?')]
}).completeClientContext,false,'Partial context cannot masquerade as complete');

const forwardOnly=assessThreadContext({
  threadId:THREAD,mailbox,evidenceKind:'full_thread',
  relationshipHint:'internal',
  messages:[msg('2026-11-01T00:00:00Z',mailbox,
    'Begin forwarded message:\nFrom: client@example.test\nCan you send a proposal?')]
});
assert.equal(forwardOnly.completeClientContext,false,
  'Internal forwards cannot masquerade as complete client context');
assert.equal(forwardOnly.correspondence,'internal_forward');
assert.equal(forwardOnly.mutatesGmail,false);
assert.equal(forwardOnly.recipientEmail,null,'Never fabricate a recipient');

const vendor=assessThreadContext({
  threadId:THREAD,mailbox,evidenceKind:'full_thread',
  relationshipHint:'vendor',
  recipientEmail:'vendor@venue.example',
  messages:[msg('2026-11-01T00:00:00Z','vendor@venue.example','Dock access opens at 9.')]
});
assert.equal(vendor.completeClientContext,false,'Vendor mail is not client context');
assert.equal(vendor.correspondence,'vendor');
assert.equal(vendor.recipientEmail,'vendor@venue.example',
  'Only pass through a supplied verified address; never invent one');

const ready=assessThreadContext({
  threadId:THREAD,expectedThreadId:THREAD,mailbox,evidenceKind:'full_thread',
  relationshipHint:'client',recipientEmail:'client@example.test',
  messages:[
    msg('2026-11-01T00:00:00Z','client@example.test','Can you hold Saturday?'),
    msg('2026-11-01T01:00:00Z',mailbox,'Checking availability now.')
  ]
});
assert.equal(ready.ok,true);
assert.equal(ready.mailboxIdentityVerified,true);
assert.equal(ready.providerThreadIdentityVerified,true);
assert.equal(ready.fullThreadReady,true);
assert.equal(ready.completeClientContext,true);
assert.equal(ready.correspondence,'client');
assert.equal(ready.latestRelevantInboundAt,'2026-11-01T00:00:00.000Z');
assert.equal(ready.mutatesGmail,false);
assert.equal(assessThreadContext({
  threadId:THREAD,expectedThreadId:THREAD,mailbox,evidenceKind:'full_thread',
  relationshipHint:'client',
  messages:[msg('2026-11-01T00:00:00Z','client@example.test','Hello')]
}).recipientEmail,null,'Missing recipient stays null; never fabricate');
assert.equal(assessThreadContext({
  threadId:THREAD,expectedThreadId:THREAD,mailbox,evidenceKind:'full_thread',
  relationshipHint:'unclassified',
  messages:[msg('2026-11-01T00:00:00Z','client@example.test','Can you hold Saturday?')]
}).completeClientContext,false,'Unknown relationships must not qualify');
assert.equal(assessThreadContext({
  threadId:THREAD,mailbox,evidenceKind:'full_thread',
  relationshipHint:'client',
  messages:[msg('2026-11-01T00:00:00Z','client@example.test','Can you hold Saturday?')]
}).fullThreadReady,false,'Expected provider thread identity is required');

// Intelligence: header/stored evidence never claims full-thread readiness.
const headerCue=gmail.classifyThread({
  threadId:THREAD,subject:'Re: synthetic hold',
  lastMessageAt:'2026-11-04T12:00:00Z',lastDirection:'inbound',
  hasInboundMessage:true,hasOutboundMessage:true,
  gmailEvidenceScope:'bounded_domain_matched_message_headers_only'
},Date.parse('2026-11-05T19:00:00Z'));
assert.equal(headerCue.fullThreadReady,false);
assert.equal(headerCue.evidenceScope,'header');
assert.equal(headerCue.completeClientContext,false);
assert.match(headerCue.explanation,/full thread/i);

const storedClient=gmail.evaluateClient({
  eventKey:'kirkland',connected:true,partial:true,
  gmailEvidenceScope:'command_center_logged_activity_only',
  threads:[{threadId:THREAD,lastMessageAt:'2026-11-04T12:00:00Z',
    lastDirection:'inbound',hasInboundMessage:true,hasOutboundMessage:true}]
},Date.parse('2026-11-05T19:00:00Z'));
assert.equal(storedClient.fullThreadReady,false);
assert.equal(storedClient.completeClientContext,false);
assert.equal(storedClient.partial,true);

const internalIntel=gmail.classifyThread({
  threadId:THREAD,lastMessageAt:'2026-11-04T12:00:00Z',
  lastDirection:'inbound',relationshipHint:'internal',
  evidenceKind:'full_thread'
},Date.parse('2026-11-05T19:00:00Z'));
assert.equal(internalIntel.kind,'internal');
assert.equal(internalIntel.completeClientContext,false);

console.log('Full-thread Gmail triage tests passed.');
