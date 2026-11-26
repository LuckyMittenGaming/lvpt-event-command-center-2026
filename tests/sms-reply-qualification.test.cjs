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

// --- R11 / T21: expose Gmail context limitations; block approval readiness ---
const workflow=require('../public/sms-review/reply-workflow.js');
const previewSrc=fs.readFileSync(path.join(__dirname,'../public/sms-review/message-preview.js'),'utf8');
const workflowSrc=fs.readFileSync(path.join(__dirname,'../public/sms-review/reply-workflow.js'),'utf8');
assert.doesNotMatch(previewSrc,/localStorage|sessionStorage/,
  'Message preview must never persist private content to browser storage');
assert.doesNotMatch(workflowSrc,/localStorage|sessionStorage/,
  'Reply workflow must never persist private content to browser storage');

const storedDesc=preview.describeContext(thread,{
  ...context,evidenceKind:'stored',mailboxIdentityVerified:true
});
assert.equal(storedDesc.evidenceKind,'stored');
assert.match(storedDesc.evidenceLabel,/stored/i);
assert.equal(storedDesc.incompleteContext,true);

const headerDesc=preview.describeContext(thread,{
  ...context,evidenceKind:'header',mailboxIdentityVerified:true
});
assert.equal(headerDesc.evidenceKind,'header');
assert.match(headerDesc.evidenceLabel,/header/i);
assert.equal(headerDesc.incompleteContext,true);

const truncatedDesc=preview.describeContext(thread,{
  ...context,source:'owner_selected_read_only_thread_review',partial:true,
  mailboxIdentityVerified:true
});
assert.equal(truncatedDesc.evidenceKind,'truncated',
  'Partial full-thread reads must be distinguishable as truncated');
assert.equal(truncatedDesc.incompleteContext,true);

const fullDesc=preview.describeContext({
  ...thread,expectedThreadId:thread.threadId,mailboxIdentityVerified:true,
  recipientVerified:true,recipientEmail:'client@sampleclient.com'
},{
  ...context,source:'owner_selected_read_only_thread_review',
  mailboxIdentityVerified:true,recipientVerified:true,
  recipientEmail:'client@sampleclient.com',
  expectedThreadId:thread.threadId
});
assert.equal(fullDesc.evidenceKind,'full_thread');
assert.match(fullDesc.evidenceLabel,/full-thread/i);
assert.equal(fullDesc.incompleteContext,false);
assert.equal(fullDesc.recipientEmail,'client@sampleclient.com');
assert.equal(fullDesc.mailboxIdentityVerified,true);
assert.equal(fullDesc.providerThreadIdentityVerified,true);
assert.deepEqual(fullDesc.displayLines.slice(0,4).map(l=>l.split(':')[0]),
  ['Evidence','Mailbox','Thread','Recipient']);

const kinds=new Set([
  storedDesc.evidenceKind,headerDesc.evidenceKind,
  truncatedDesc.evidenceKind,fullDesc.evidenceKind
]);
assert.equal(kinds.size,4,
  'Stored, header-only, full-thread, and truncated must be distinguishable');

const inboundKept=preview.retainLatestInbound(context);
assert.equal(inboundKept.present,true);
assert.equal(inboundKept.at,at);
assert.equal(inboundKept.original,incoming.excerpt);
assert.equal(inboundKept.preview.original,incoming.excerpt,
  'Latest inbound original must survive preview focus');
assert.equal(inboundKept.matchesContextRevision,true);

const candidate=expectOutcome('full-thread candidate for approval gate','reply_candidate',{
  context:{source:'owner_selected_read_only_thread_review',partial:false}
});
assert.equal(workflow.canPrepare(thread,{
  ...context,source:'owner_selected_read_only_thread_review'
},candidate),true,'Eligible threads may still enter manual draft preparation');

assert.equal(workflow.approvalReady(thread,{
  ...context,source:'owner_selected_read_only_thread_review'
},candidate).ready,false,
  'Missing mailbox/recipient verification cannot appear approval-ready');

assert.equal(workflow.approvalReady(thread,{
  ...context,source:'command_center_logged_activity_only',
  mailboxIdentityVerified:true,recipientVerified:true,
  recipientEmail:'client@sampleclient.com'
},candidate,{
  mailboxIdentityVerified:true,recipientVerified:true,
  recipientEmail:'client@sampleclient.com'
}).ready,false,'Stored evidence cannot appear approval-ready');

assert.equal(workflow.approvalReady(thread,{
  ...context,evidenceKind:'header',mailboxIdentityVerified:true,
  recipientVerified:true,recipientEmail:'client@sampleclient.com'
},candidate,{
  mailboxIdentityVerified:true,recipientVerified:true,
  recipientEmail:'client@sampleclient.com'
}).ready,false,'Header-only evidence cannot appear approval-ready');

assert.equal(workflow.approvalReady(thread,{
  ...context,source:'owner_selected_read_only_thread_review',partial:true,
  mailboxIdentityVerified:true,recipientVerified:true,
  recipientEmail:'client@sampleclient.com'
},candidate,{
  mailboxIdentityVerified:true,recipientVerified:true,
  recipientEmail:'client@sampleclient.com'
}).ready,false,'Incomplete/truncated context cannot appear approval-ready');

assert.equal(workflow.approvalReady(thread,{
  ...context,source:'owner_selected_read_only_thread_review',
  mailboxIdentityVerified:true,recipientEmail:'client@sampleclient.com'
},candidate,{
  mailboxIdentityVerified:true,recipientEmail:'client@sampleclient.com'
}).ready,false,'Unverified recipients cannot appear approval-ready');

const ready=workflow.approvalReady({
  ...thread,expectedThreadId:thread.threadId,mailboxIdentityVerified:true
},{
  ...context,source:'owner_selected_read_only_thread_review',
  mailboxIdentityVerified:true,expectedThreadId:thread.threadId
},candidate,{
  mailboxIdentityVerified:true,recipientVerified:true,
  recipientEmail:'client@sampleclient.com',expectedThreadId:thread.threadId
});
assert.equal(ready.ready,true,
  'Complete full-thread evidence with verified identities may be approval-ready');
assert.equal(ready.recipientEmail,'client@sampleclient.com');
assert.equal(ready.latestRelevantInboundAt,at);
assert.equal(ready.mutatesGmail,false);
assert.equal(workflow.draftStarter(thread).isRealClientRecipientVerified,false,
  'Draft starter must never fabricate a verified recipient');

// Earlier truncated message + complete latest must stay truncated/incomplete.
const earlierAt='2026-11-09T18:00:00.000Z';
const earlierTruncated={
  at:earlierAt,direction:'inbound',relationshipHint:'unclassified',
  excerpt:'Prior availability notes were cut off…',truncated:true,
  hasAttachments:false
};
const earlierTruncatedContext={
  ...context,source:'owner_selected_read_only_thread_review',partial:false,
  fullThreadEnumerated:true,totalMessages:2,
  messages:[earlierTruncated,incoming],
  mailboxIdentityVerified:true,recipientVerified:true,
  recipientEmail:'client@sampleclient.com',expectedThreadId:thread.threadId
};
const earlierTruncatedDesc=preview.describeContext({
  ...thread,expectedThreadId:thread.threadId,mailboxIdentityVerified:true,
  recipientVerified:true,recipientEmail:'client@sampleclient.com'
},earlierTruncatedContext);
assert.equal(earlierTruncatedDesc.evidenceKind,'truncated',
  'Earlier truncated message must keep evidence kind truncated even when latest is complete');
assert.equal(earlierTruncatedDesc.incompleteContext,true);
assert.match(earlierTruncatedDesc.displayLines.join('\n'),/Approval-ready: no/);
const earlierTruncatedQ=qualifyThread({
  ...thread,mailboxIdentityVerified:true
},earlierTruncatedContext);
assert.equal(earlierTruncatedQ.gmailContext?.evidenceKind,'truncated');
assert.equal(earlierTruncatedQ.latestInboundRetained?.original,incoming.excerpt,
  'Latest complete inbound original survives qualification with earlier truncation');
assert.equal(workflow.canPrepare({
  ...thread,mailboxIdentityVerified:true
},earlierTruncatedContext,earlierTruncatedQ),true,
  'Manual draft preparation may still open when the latest message is complete');
assert.equal(workflow.approvalReady({
  ...thread,expectedThreadId:thread.threadId,mailboxIdentityVerified:true
},earlierTruncatedContext,earlierTruncatedQ,{
  mailboxIdentityVerified:true,recipientVerified:true,
  recipientEmail:'client@sampleclient.com',expectedThreadId:thread.threadId
}).ready,false,
  'Earlier truncated message must block approvalReady');

// Conflict-aware mailbox: explicit true cannot override mismatched observations.
const wrongMailbox='wsopamatt@gmail.com';
const conflictDesc=preview.describeContext({
  ...thread,mailboxIdentityVerified:true,mailbox:wrongMailbox
},{
  ...context,source:'owner_selected_read_only_thread_review',
  mailboxIdentityVerified:true,mailbox:wrongMailbox,
  recipientVerified:true,recipientEmail:'client@sampleclient.com'
});
assert.equal(conflictDesc.mailboxIdentityVerified,false,
  'Explicit true must not verify a non-business observed mailbox');
assert.equal(conflictDesc.incompleteContext,true);
assert.equal(workflow.approvalReady({
  ...thread,mailboxIdentityVerified:true,mailbox:wrongMailbox,
  expectedThreadId:thread.threadId
},{
  ...context,source:'owner_selected_read_only_thread_review',
  mailboxIdentityVerified:true,mailbox:wrongMailbox,
  expectedThreadId:thread.threadId
},candidate,{
  mailboxIdentityVerified:true,recipientVerified:true,
  recipientEmail:'client@sampleclient.com',mailbox:wrongMailbox
}).ready,false,
  'Mismatched mailbox with true flags cannot appear approval-ready');

const metaContextConflict=preview.describeContext({
  ...thread,mailboxIdentityVerified:true,
  mailbox:'book@pokertraininglasvegas.com'
},{
  ...context,source:'owner_selected_read_only_thread_review',
  mailboxIdentityVerified:true,mailbox:wrongMailbox,
  recipientVerified:true,recipientEmail:'client@sampleclient.com'
});
assert.equal(metaContextConflict.mailboxIdentityVerified,false,
  'Meta/context mailbox disagreement cannot verify identity');

// Integration: qualification retains inbound + exposes non-ready contexts.
const wiredCandidate=qualifyThread(thread,{
  ...context,source:'owner_selected_read_only_thread_review'
});
assert.equal(wiredCandidate.outcome,'reply_candidate');
assert.equal(wiredCandidate.latestInboundRetained?.present,true);
assert.equal(wiredCandidate.latestInboundRetained?.original,incoming.excerpt);
assert.equal(wiredCandidate.latestInboundRetained?.at,at);
assert.equal(wiredCandidate.gmailContext?.evidenceKind,'full_thread');
assert.equal(wiredCandidate.gmailContext?.incompleteContext,true,
  'Unverified recipient keeps qualification context incomplete / non-ready');

for(const kind of ['stored','header']) {
  const blocked=qualifyThread(thread,{...context,evidenceKind:kind});
  assert.equal(blocked.gmailContext?.evidenceKind,kind);
  assert.equal(blocked.gmailContext?.incompleteContext,true);
  assert.match(blocked.gmailContext.displayLines.join('\n'),/Approval-ready: no/);
  assert.equal(workflow.approvalReady(thread,{
    ...context,evidenceKind:kind,mailboxIdentityVerified:true,
    recipientVerified:true,recipientEmail:'client@sampleclient.com'
  },wiredCandidate,{
    mailboxIdentityVerified:true,recipientVerified:true,
    recipientEmail:'client@sampleclient.com'
  }).ready,false,kind+' context must remain non-ready after qualification');
}
const truncatedWired=qualifyThread(thread,{
  ...context,source:'owner_selected_read_only_thread_review',partial:true
});
assert.equal(truncatedWired.gmailContext?.evidenceKind,'truncated');
assert.match(truncatedWired.gmailContext.displayLines.join('\n'),/Approval-ready: no/);
assert.equal(truncatedWired.latestInboundRetained?.original,incoming.excerpt,
  'Latest inbound evidence survives qualification under truncated context');

assert.match(app,/describeContext\(/,
  'Review UI must render describeContext verification lines');
assert.match(app,/gmail-context-limitations/,
  'Review UI must surface Gmail context limitations visibly');
assert.match(app,/retainLatestInbound|latestInboundRetained/,
  'Review UI must retain latest inbound through preview rendering');
assert.match(fs.readFileSync(path.join(__dirname,
  '../public/sms-review/reply-review-controls.js'),'utf8'),
  /approvalReady/,
  'Approval controls must gate on workflow.approvalReady');

console.log('Step 46 selected-thread reply qualification tests passed.');
