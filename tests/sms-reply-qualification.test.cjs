'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {qualifyThread,OUTCOMES}=require('../public/sms-review/reply-qualification.js');
const at='2026-11-09T19:12:00.000Z';
const now=Date.parse('2026-11-10T05:00:00.000Z');
const thread={
  threadId:'1a1234567890abcd',lastMessageAt:at,sourceType:'email_thread',
  relationshipHint:'unclassified',needsHumanReview:true,
  lastDirection:'inbound',senderDomain:'sampleclient.com'
};
const incoming={at,direction:'inbound',relationshipHint:'unclassified',
  senderDomain:'sampleclient.com',excerpt:'Could you send us available dates and pricing?',
  truncated:false,hasAttachments:false};
const context={
  threadId:thread.threadId,lastMessageAt:at,messages:[incoming],
  totalMessages:1,partial:false
};
const run=(metadata={},ctx={},message={},nowMs=now)=>qualifyThread(
  {...thread,...metadata},
  {...context,...ctx,messages:(ctx.messages||[
    {...incoming,...message}
  ])},nowMs
);
function expectOutcome(label,expected,params={}) {
  const q=run(params.metadata,params.context,params.message);
  assert.equal(q.outcome,expected,label+' should receive '+expected);
  assert.equal(q.safeToAutoSend,false,label+' must never authorize sending');
  assert.equal(q.authorizesDraft,false,label+' must never authorize drafting');
  assert.equal(q.requiresHumanDecision,true,label+' requires an owner review');
  assert.equal(typeof q.reason,'string');
  return q;
}
expectOutcome('clear incoming question','reply_candidate');
expectOutcome('request to confirm','reply_candidate',{
  message:{excerpt:'Please confirm the details for our group.'}
});
expectOutcome('courtesy acknowledgement','monitor',{
  message:{excerpt:'Thanks again.'}
});
const namedIntroReply=[
  'Thank you Alex for the intro and Thank you Sam for the email.',
  '',
  'Taylor Smith',
  'Travel, Meetings and Events Manager',
  '-------------------------------------------------------',
  'THE EXAMPLE COMPANY LLP',
  'T [phone]   M [phone]',
  '[email]<mailto:[email]>'
].join('\n');
const preview=require('../public/sms-review/message-preview.js');
const focusedAck=preview.focus(namedIntroReply);
assert.equal(focusedAck.body,
  'Thank you Alex for the intro and Thank you Sam for the email.');
assert.equal(focusedAck.shortened,true);
assert.equal(focusedAck.reason,'signature');
assert.equal(focusedAck.original,namedIntroReply,
  'Full original message must remain available for human inspection');
expectOutcome('two-person introduction thanks with company signature','monitor',{
  message:{excerpt:namedIntroReply}
});
expectOutcome('same acknowledgement but with a genuine request','reply_candidate',{
  message:{excerpt:namedIntroReply.replace(
    'Thank you Alex for the intro and Thank you Sam for the email.',
    'Thank you Alex for the intro and Thank you Sam for the email. Could you send the proposed dates?')}
});
expectOutcome('incomplete thank-you message','manual_review',{
  message:{excerpt:namedIntroReply,truncated:true}
});
const kennaExcerpt=[
  'Awesome! Thanks for this and Llook forward to connecting this weekend.',
  '',
  'KJ',
  '',
  'Kenna James',
  'KennaJames.com <[link]>',
  'X @Kenna_James <[link]>',
  'Instagram <[link]>',
  'Facebook <[link]>',
  '',
  'On Wed, Oct 21, 2026 at 12:40 PM Las Vegas Poker Training <',
  '[email]> wrote:',
  '',
  '> Hey Kenna -',
  '> This one is 90% booked, just waiting on their contract and payment.',
  '> Could you send a brief proposal?'
].join('\n');
const kPreview=preview.focus(kennaExcerpt);
assert.equal(kPreview.body,
  'Awesome! Thanks for this and Llook forward to connecting this weekend.');
assert.equal(kPreview.quotedHistorySeen,true);
assert.equal(kPreview.shortened,true);
assert.equal(kPreview.original,kennaExcerpt);
expectOutcome('talent courtesy with clipped quoted old request','monitor',{
  message:{excerpt:kennaExcerpt,truncated:true}
});
expectOutcome('talent courtesy with no quoted boundary and truncated body','manual_review',{
  message:{excerpt:kennaExcerpt.split('On Wed,')[0],truncated:true}
});
expectOutcome('talent courtesy with real attached document','manual_review',{
  message:{excerpt:kennaExcerpt,truncated:true,hasAttachments:true}
});
expectOutcome('substantive latest request before quoted history and clipped body',
  'manual_review',{
  message:{excerpt:kennaExcerpt.replace(
    'Awesome! Thanks for this and Llook forward to connecting this weekend.',
    'Awesome! Thanks for this. Can you send the final contract today?'),
    truncated:true}
});
expectOutcome('substantive latest request before quoted history not truncated',
  'reply_candidate',{
  message:{excerpt:kennaExcerpt.replace(
    'Awesome! Thanks for this and Llook forward to connecting this weekend.',
    'Awesome! Thanks for this. Can you send the final contract today?'),
    truncated:false}
});

expectOutcome('attachment on thank-you message','manual_review',{
  message:{excerpt:namedIntroReply,hasAttachments:true}
});
expectOutcome('polite acknowledgement','monitor',{
  message:{excerpt:'Sounds good!'}
});
expectOutcome('client declined','client_declined',{
  message:{excerpt:"We won't be moving forward with this event. Thanks."}
});
expectOutcome('client absent','hold',{
  message:{excerpt:"I'm out of town for a few weeks. I'll get back to you."}
});
expectOutcome('internal review','hold',{
  message:{excerpt:'We need to share this with leadership and will get back to you.'}
});
expectOutcome('talent coordinator request','talent_operations',{
  metadata:{relationshipHint:'talent'},
  message:{relationshipHint:'talent',excerpt:'Could you send the seminar outline?'}
});
expectOutcome('vendor operations','vendor_operations',{
  metadata:{relationshipHint:'vendor'},
  message:{relationshipHint:'vendor',excerpt:'Can you confirm the load-in time?'}
});
expectOutcome('vendor courtesy','vendor_operations',{
  metadata:{relationshipHint:'vendor'},
  message:{relationshipHint:'vendor',excerpt:'Thanks again.'}
});
expectOutcome('owner personal account','internal',{
  metadata:{relationshipHint:'internal'},
  message:{relationshipHint:'internal',excerpt:'Could you help with the venue?'}
});
expectOutcome('website notification','manual_review',{
  metadata:{sourceType:'form_lead',relationshipHint:'form_lead'},
  message:{direction:'form_lead',relationshipHint:'form_lead',
    excerpt:'New corporate lead: interested in training.'}
});
expectOutcome('truncated request','manual_review',{
  message:{truncated:true}
});
expectOutcome('partial thread','reply_candidate',{
  context:{partial:true}
});
expectOutcome('missing prior history','reply_candidate',{
  context:{totalMessages:4}
});
expectOutcome('attachment not inspected','manual_review',{
  message:{hasAttachments:true}
});
expectOutcome('empty latest excerpt','manual_review',{
  message:{excerpt:' '}
});
expectOutcome('non-request message','manual_review',{
  message:{excerpt:'We met at the conference last month.'}
});
expectOutcome('unverified last direction','manual_review',{
  message:{direction:'other'}
});
expectOutcome('last mail sent by LVPT','monitor',{
  metadata:{lastDirection:'outbound'},
  context:{messages:[
    {...incoming,at:'2026-11-06T20:00:00.000Z'},
    {...incoming,direction:'outbound',relationshipHint:'outbound',
      excerpt:'Thanks, I have sent the proposal.'}
  ],totalMessages:2}
});
expectOutcome('stale selected thread','manual_review',{
  context:{lastMessageAt:'2026-11-08T19:12:00.000Z'}
});
expectOutcome('changed latest timestamp','manual_review',{
  message:{at:'2026-11-08T19:12:00.000Z'}
});
expectOutcome('decline with follow-up question','reply_candidate',{
  message:{excerpt:"We won't be moving forward this week, but can you send options for March?"}
});
assert(OUTCOMES.reply_candidate.includes('Potential'));
const html=fs.readFileSync(path.join(__dirname,'../public/sms-review/index.html'),'utf8');
const app=fs.readFileSync(path.join(__dirname,'../public/sms-review/app.js'),'utf8');
const qualifier=fs.readFileSync(path.join(__dirname,'../public/sms-review/reply-qualification.js'),'utf8');
assert(html.indexOf('src="./reply-qualification.js"')>0);
assert(html.indexOf('src="./reply-qualification.js"')<
  html.indexOf('src="./app.js"'),'qualifier must load before app');
assert.match(app,/const replyQualifier = window.LVPTReplyQualification/);
assert.match(app,/replyQualifier.qualifyThread\(t,context\)/);
assert.match(app,/No AI call, no approved Gmail draft, and no automatic sending/);
assert.doesNotMatch(qualifier,/fetch\(|XMLHttpRequest|localStorage|sessionStorage|sendEmail|createDraft/,
  'Classifier must be local, deterministic, and non-sending');
console.log('Step 46 selected-thread reply qualification tests passed.');
