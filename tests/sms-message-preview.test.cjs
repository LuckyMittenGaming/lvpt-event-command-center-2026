'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const preview=require('../public/sms-review/message-preview.js');
const {qualifyThread}=require('../public/sms-review/reply-qualification.js');

const venue=[
  'Matt','','That works.','','Thanks','','TOMMY LAROSA',
  'Director of Operations, Poker','D [phone] C [phone]',
  'E [email]<mailto:[email]>','','The Venetian Resort Las Vegas',
  'YouTube<[link]> Facebook<[link]> Instagram<[link]>'
].join('\n');
const result=preview.focus(venue);
assert.equal(result.body,'Matt\n\nThat works.\n\nThanks');
assert.equal(result.reason,'signature');
assert(result.shortened);
assert(result.hidden.startsWith('TOMMY LAROSA'));
assert.equal(result.original,venue);
const client=[
  'Hi Matt,','','Could you send an estimate for 35 guests?',
  '','Best regards,','','Colleen Feigenwinter','Events Coordinator',
  'Cell: [phone]','Email: [email]'
].join('\n');
const clientResult=preview.focus(client);
assert.match(clientResult.body,/Could you send an estimate/);
assert.doesNotMatch(clientResult.body,/Cell:/);
assert.match(clientResult.hidden,/Events Coordinator/);
const quote=[
  'Hi Matt,','','That works. Thank you!','',
  'On Tuesday, November 10, 2026 at 9:45 AM, LVPT wrote:',
  'Can you confirm event dates and pricing?'
].join('\n');
const quoteResult=preview.focus(quote);
assert.equal(quoteResult.reason,'quoted_history');
assert.doesNotMatch(quoteResult.body,/Can you confirm/);
assert.match(quoteResult.hidden,/Can you confirm/);
const noSig='The Poker Room is available.\n\nPlease confirm which guests require special seating.';
assert.equal(preview.focus(noSig).shortened,false);
assert.equal(preview.focus(noSig).body,noSig);
const short='Thanks\n\nTOMMY LAROSA';
assert.equal(preview.focus(short).shortened,false,'An unverified signature must not be hidden');
const at='2026-11-10T14:00:00.000Z';
const meta={threadId:'aabbccdd00112233',lastMessageAt:at,
  relationshipHint:'unclassified',sourceType:'email_thread'};
const context={
  threadId:meta.threadId,lastMessageAt:at,totalMessages:1,partial:false,
  messages:[{at,direction:'inbound',relationshipHint:'unclassified',
    excerpt:quote,truncated:false,hasAttachments:false}]
};
const q=qualifyThread(meta,context,Date.parse('2026-11-10T15:00:00.000Z'));
assert.notEqual(q.outcome,'reply_candidate',
  'Quoted question must never trigger a new sales reply');
context.messages[0].excerpt=client;
const q2=qualifyThread(meta,context,Date.parse('2026-11-10T15:00:00.000Z'));
assert.equal(q2.outcome,'reply_candidate','Real client request remains actionable');

const app=fs.readFileSync(path.join(__dirname,'../public/sms-review/app.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'../public/sms-review/index.html'),'utf8');
assert.match(app,/window\.LVPTMessagePreview\.focus\(m\.excerpt\)/);
assert.match(app,/Show signature and additional text/);
assert.match(app,/Show quoted email history/);
assert.match(app,/preview\.hidden/);
assert(html.indexOf('src="./message-preview.js"')>
  0 && html.indexOf('src="./message-preview.js"')<
  html.indexOf('src="./reply-qualification.js"'));
console.log('Email signature hiding and quoted-question safety checks passed.');
