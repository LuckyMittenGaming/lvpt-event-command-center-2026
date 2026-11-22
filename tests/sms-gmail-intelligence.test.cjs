const assert=require('node:assert/strict');
const gmail=require('../public/sms-review/gmail-intelligence.js');
const time=Date.parse('2026-11-05T19:00:00Z');
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
console.log('Conservative Gmail conversation direction and false-outreach regression tests passed.');
