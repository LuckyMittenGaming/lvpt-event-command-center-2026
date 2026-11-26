const assert=require('node:assert/strict');
const gmail=require('../public/sms-review/gmail-intelligence.js');
const {BUSINESS_MAILBOX}=require('../public/sms-review/gmail-thread-triage.js');
const time=Date.parse('2026-11-05T19:00:00Z');
const THREAD='aabbccddeeff0011';
const OTHER='bbccddeeff001122';
const msg=(date,from,body)=>({email_ts:date,from,body});
const outgoing={threadId:'1a0cf87a864b8482',subject:'Re: Proposal',lastMessageAt:'2026-11-02T04:47:00Z',
  lastDirection:'outbound',hasInboundMessage:true,hasOutboundMessage:true};
const inbound={threadId:'1a1895672a1d0424',subject:'Question about the poker event',
  lastMessageAt:'2026-11-04T12:00:00Z',lastDirection:'inbound',
  hasInboundMessage:true,hasOutboundMessage:true};
assert.equal(gmail.classifyThread(outgoing,time).kind,'waiting');
assert.match(gmail.classifyThread(outgoing,time).explanation,/do not send a duplicate/i);
assert.equal(gmail.classifyThread(inbound,time).kind,'inbox-review');
assert.match(gmail.classifyThread(inbound,time).explanation,/full thread and CRM/i);
assert.equal(gmail.classifyThread({lastDirection:'unknown'},time).kind,'unverified');
assert.equal(gmail.evaluateClient({eventKey:'kirkland',connected:false},time).status,'not-connected');
assert.equal(gmail.evaluateClient({eventKey:'kirkland',connected:true,threads:[]},time).status,'no-match');
assert.equal(gmail.evaluateClient({eventKey:'random',connected:true,threads:[inbound]},time),null,
  'Only verified allowlisted event keys can influence client conversation suggestions');
const latestInbound=gmail.evaluateClient({eventKey:'kirkland',connected:true,
 threads:[outgoing,inbound],partial:true},time);
assert.equal(latestInbound.status,'inbox-review');
assert.equal(latestInbound.partial,true);
const newerOutbound={...outgoing,lastMessageAt:'2026-11-05T14:30:00Z'};
const olderInbound={...inbound,lastMessageAt:'2026-11-01T12:00:00Z'};
const answered=gmail.evaluateClient({eventKey:'kirkland',connected:true,
 threads:[olderInbound,newerOutbound]},time);
assert.equal(answered.status,'waiting','Older inbound across threads cannot imply unanswered email if newer outgoing exists');
assert.equal(answered.olderInboundThreads,1);
const labels=gmail.buildBrief([
 {eventKey:'lithic',connected:true,threads:[outgoing]},
 {eventKey:'ows-aws',connected:true,threads:[inbound]},
 {eventKey:'quinn-emanuel',connected:false}
],time);
assert.equal(labels[0].eventKey,'ows-aws');
assert.equal(labels[1].status,'waiting');
assert.equal(labels[2].status,'not-connected');
assert.equal(gmail.classifyThread({...outgoing,lastMessageAt:'2031-01-01T00:00:00Z'},time).daysSinceLastMessage,null,
  'Future timestamp cannot become an overdue follow-up');

// --- R11 readiness contract regressions (synthetic only) ---
// Counterexample: evidenceKind full_thread + valid threadId alone must NOT
// unlock readiness without mailbox, expected thread id, and complete messages.
const counterexample=gmail.classifyThread({
  threadId:THREAD,lastMessageAt:'2026-11-04T12:00:00Z',lastDirection:'inbound',
  evidenceKind:'full_thread',hasInboundMessage:true,hasOutboundMessage:true
},time);
assert.equal(counterexample.fullThreadReady,false,
  'fullThreadReady requires mailbox + expected thread + complete full-thread evidence');
assert.equal(counterexample.completeClientContext,false);

assert.equal(gmail.classifyThread({
  threadId:THREAD,expectedThreadId:THREAD,evidenceKind:'full_thread',
  relationshipHint:'client',lastMessageAt:'2026-11-04T12:00:00Z',lastDirection:'inbound',
  messages:[msg('2026-11-04T12:00:00Z','client@example.test','Can you hold Saturday?')]
},time).fullThreadReady,false,'Missing mailbox blocks readiness');

assert.equal(gmail.classifyThread({
  threadId:THREAD,expectedThreadId:THREAD,mailbox:'wsopamatt@gmail.com',
  evidenceKind:'full_thread',relationshipHint:'client',
  lastMessageAt:'2026-11-04T12:00:00Z',lastDirection:'inbound',
  messages:[msg('2026-11-04T12:00:00Z','client@example.test','Can you hold Saturday?')]
},time).fullThreadReady,false,'Wrong mailbox blocks readiness');

assert.equal(gmail.classifyThread({
  threadId:THREAD,expectedThreadId:OTHER,mailbox:BUSINESS_MAILBOX,
  evidenceKind:'full_thread',relationshipHint:'client',
  lastMessageAt:'2026-11-04T12:00:00Z',lastDirection:'inbound',
  messages:[msg('2026-11-04T12:00:00Z','client@example.test','Can you hold Saturday?')]
},time).fullThreadReady,false,'Mismatched expected thread identity blocks readiness');

assert.equal(gmail.classifyThread({
  threadId:THREAD,expectedThreadId:THREAD,mailbox:BUSINESS_MAILBOX,
  gmailEvidenceScope:'bounded_domain_matched_message_headers_only',
  lastMessageAt:'2026-11-04T12:00:00Z',lastDirection:'inbound',
  hasInboundMessage:true,hasOutboundMessage:true
},time).fullThreadReady,false,'Header-only evidence is not full-thread readiness');

assert.equal(gmail.classifyThread({
  threadId:THREAD,expectedThreadId:THREAD,mailbox:BUSINESS_MAILBOX,
  evidenceKind:'full_thread',relationshipHint:'client',partial:true,
  lastMessageAt:'2026-11-04T12:00:00Z',lastDirection:'inbound',
  messages:[msg('2026-11-04T12:00:00Z','client@example.test','Can you hold Saturday?')]
},time).fullThreadReady,false,'Partial context cannot claim full-thread readiness');

assert.equal(gmail.classifyThread({
  threadId:THREAD,expectedThreadId:THREAD,mailbox:BUSINESS_MAILBOX,
  evidenceKind:'full_thread',truncated:true,relationshipHint:'client',
  lastMessageAt:'2026-11-04T12:00:00Z',lastDirection:'inbound',
  messages:[msg('2026-11-04T12:00:00Z','client@example.test','Can you hold Saturday?')]
},time).completeClientContext,false,'Truncated context cannot masquerade as complete');

const unknown=gmail.classifyThread({
  threadId:THREAD,expectedThreadId:THREAD,mailbox:BUSINESS_MAILBOX,
  evidenceKind:'full_thread',relationshipHint:'unclassified',
  lastMessageAt:'2026-11-04T12:00:00Z',lastDirection:'inbound',
  messages:[msg('2026-11-04T12:00:00Z','client@example.test','Can you hold Saturday?')]
},time);
assert.equal(unknown.fullThreadReady,true,
  'Complete full-thread evidence with identities may be ready as evidence');
assert.equal(unknown.completeClientContext,false,
  'Unknown relationships must not qualify as complete client context');

const internal=gmail.classifyThread({
  threadId:THREAD,expectedThreadId:THREAD,mailbox:BUSINESS_MAILBOX,
  evidenceKind:'full_thread',relationshipHint:'internal',
  lastMessageAt:'2026-11-04T12:00:00Z',lastDirection:'inbound',
  messages:[msg('2026-11-04T12:00:00Z',BUSINESS_MAILBOX,
    'Begin forwarded message:\nFrom: client@example.test\nCan you send a proposal?')]
},time);
assert.equal(internal.kind,'internal');
assert.equal(internal.completeClientContext,false,
  'Internal forwards cannot masquerade as complete client context');

const verified=gmail.classifyThread({
  threadId:THREAD,expectedThreadId:THREAD,mailbox:BUSINESS_MAILBOX,
  evidenceKind:'full_thread',relationshipHint:'client',
  lastMessageAt:'2026-11-04T12:00:00Z',lastDirection:'inbound',
  messages:[msg('2026-11-04T12:00:00Z','client@example.test','Can you hold Saturday?')]
},time);
assert.equal(verified.fullThreadReady,true);
assert.equal(verified.completeClientContext,true);
assert.equal(verified.mailboxIdentityVerified,true);
assert.equal(verified.providerThreadIdentityVerified,true);
assert.equal(verified.mutatesGmail,false);
assert.equal(verified.recipientEmail,null,'Never fabricate a recipient');

const propagated=gmail.evaluateClient({
  eventKey:'kirkland',connected:true,mailbox:BUSINESS_MAILBOX,
  expectedThreadId:THREAD,evidenceKind:'full_thread',relationshipHint:'client',
  truncated:true,
  threads:[{
    threadId:THREAD,lastMessageAt:'2026-11-04T12:00:00Z',lastDirection:'inbound',
    messages:[msg('2026-11-04T12:00:00Z','client@example.test','Can you hold Saturday?')]
  }]
},time);
assert.equal(propagated.fullThreadReady,false,
  'evaluateClient must propagate truncated metadata into the triage assessor');
assert.equal(propagated.completeClientContext,false);
assert.equal(propagated.threads[0].providerThreadIdentityVerified,true);

const missingMailbox=gmail.evaluateClient({
  eventKey:'kirkland',connected:true,
  expectedThreadId:THREAD,evidenceKind:'full_thread',relationshipHint:'client',
  threads:[{
    threadId:THREAD,lastMessageAt:'2026-11-04T12:00:00Z',lastDirection:'inbound',
    messages:[msg('2026-11-04T12:00:00Z','client@example.test','Can you hold Saturday?')]
  }]
},time);
assert.equal(missingMailbox.mailboxIdentityVerified,false,
  'evaluateClient must not invent BUSINESS_MAILBOX as the observed mailbox');
assert.equal(missingMailbox.fullThreadReady,false);
assert.equal(missingMailbox.completeClientContext,false);

const explicitMailbox=gmail.evaluateClient({
  eventKey:'kirkland',connected:true,mailbox:BUSINESS_MAILBOX,
  expectedThreadId:THREAD,evidenceKind:'full_thread',relationshipHint:'client',
  threads:[{
    threadId:THREAD,lastMessageAt:'2026-11-04T12:00:00Z',lastDirection:'inbound',
    messages:[msg('2026-11-04T12:00:00Z','client@example.test','Can you hold Saturday?')]
  }]
},time);
assert.equal(explicitMailbox.mailboxIdentityVerified,true,
  'Explicit business mailbox evidence may verify identity');
assert.equal(explicitMailbox.fullThreadReady,true);
assert.equal(explicitMailbox.completeClientContext,true);

console.log('Conservative Gmail conversation direction and false-outreach regression tests passed.');
