'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {webcrypto}=require('node:crypto');
const {qualifyThread}=require('../public/sms-review/reply-qualification.js');
const workflow=require('../public/sms-review/reply-workflow.js');
const controls=require('../public/sms-review/reply-review-controls.js');

const at=new Date(Date.now()-3600_000).toISOString();
const thread={
  threadId:'aabbccddeeff0011',subject:'Re: Poker event availability',
  lastMessageAt:at,lastDirection:'inbound',needsHumanReview:true,
  sourceType:'email_thread',relationshipHint:'unclassified',
  mailboxIdentityVerified:true,mailbox:'book@pokertraininglasvegas.com'
};
const reply={
  at,direction:'inbound',relationshipHint:'unclassified',
  excerpt:'Could you send a quote for a corporate poker event?',
  senderDomain:'example.com',truncated:false,hasAttachments:false,
  messageId:'aabbccddeeff0011'
};
const context={threadId:thread.threadId,lastMessageAt:at,partial:false,
  totalMessages:1,messages:[reply],
  source:'owner_selected_read_only_thread_review',
  mailboxIdentityVerified:true,mailbox:'book@pokertraininglasvegas.com'};
const q=qualifyThread(thread,context);
assert.equal(q.outcome,'reply_candidate');
assert.equal(workflow.canPrepare(thread,context,q),true);
assert.equal(workflow.canPrepare({...thread,relationshipHint:'vendor'},context,q),false);
assert.equal(workflow.canPrepare({...thread,sourceType:'form_lead'},context,q),false);
assert.equal(workflow.canPrepare(thread,{...context,partial:true},q),true,
  'Long history may enter MANUAL review after full original conversation attestation');
assert.equal(workflow.canPrepare(thread,{...context,lastMessageAt:'2026-01-01'},q),false);
assert.equal(workflow.canPrepare(thread,{...context,messages:[
  {...reply,truncated:true}]},q),false);
assert.equal(workflow.canPrepare(thread,{...context,messages:[
  {...reply,hasAttachments:true}]},q),false);
assert.equal(workflow.canPrepare(thread,context,{...q,outcome:'monitor'}),false);

// Earlier truncated message with a complete latest message: display truncated
// and approval blocked, while manual draft preparation may still open.
const earlierAt=new Date(Date.parse(at)-3600_000).toISOString();
const earlierTruncatedContext={
  ...context,partial:false,fullThreadEnumerated:true,totalMessages:2,
  messages:[
    {...reply,at:earlierAt,excerpt:'Older thread body was truncated…',truncated:true},
    reply
  ]
};
const earlierTruncatedQ=qualifyThread(thread,earlierTruncatedContext);
assert.equal(earlierTruncatedQ.gmailContext?.evidenceKind,'truncated');
assert.equal(earlierTruncatedQ.gmailContext?.incompleteContext,true);
assert.match(earlierTruncatedQ.gmailContext.displayLines.join('\n'),/Approval-ready: no/);
assert.equal(workflow.canPrepare(thread,earlierTruncatedContext,earlierTruncatedQ),true,
  'Complete latest message may still enter manual draft preparation');
assert.equal(workflow.approvalReady(thread,earlierTruncatedContext,earlierTruncatedQ,{
  mailboxIdentityVerified:true,recipientVerified:true,
  recipientEmail:'customer@example.com'
}).ready,false,
  'Live approvalReady must stay blocked when any earlier message is truncated');

const starter=workflow.draftStarter(thread);
assert(starter.subject.startsWith('Re: '));
assert(!starter.subject.startsWith('Re: Re: '));
assert.equal(starter.isRealClientRecipientVerified,false);
assert.equal(workflow.validation(starter.subject,starter.body).ok,false);
const written=starter.body.replace(/\[[^\]]+\]/g,
  'Absolutely. We can offer a customized training session for your group. I can confirm options once I know your preferred date and approximate guest count.');
assert.equal(workflow.validation(starter.subject,written).ok,true);
assert(written.endsWith('Matt Carpenter\nEvent & Talent Manager\nLas Vegas Poker Training\n616-745-7148'));
assert.equal(workflow.validation(starter.subject,written.replace('Event & Talent Manager\n','')).ok,false,
  'Incomplete LVPT signature must never pass owner approval');
assert.equal(workflow.validation(starter.subject,'Thanks.').ok,false);
assert.equal(workflow.validation(starter.subject,
  written+'\n[VERIFY EVENT PRICE]').ok,false);
assert.equal(workflow.validation(starter.subject,
  written+'\nTBD').ok,false);

// R12/T22 — owner decision policy and exact approval binding (synthetic).
assert.equal(workflow.ownerDecisionPolicy('DENY').allowsSend,false);
assert.equal(workflow.ownerDecisionPolicy('EDIT_MYSELF').allowsSend,false);
assert.equal(workflow.ownerDecisionPolicy('MAKE_CHANGES').requiresRenewedReview,true);
assert.equal(workflow.ownerDecisionPolicy('APPROVE').auditDecision,'approved_for_manual_copy');
assert.equal(workflow.ownerDecisionPolicy('MAKE_CHANGES').auditDecision,'draft_prepared');
assert.equal(workflow.ownerDecisionPolicy('DENY').auditDecision,'denied');
assert.equal(workflow.ownerDecisionPolicy('EDIT_MYSELF').auditDecision,null);
const sampleDigest='a'.repeat(64);
const inboundIdentity=workflow.resolveLatestInboundIdentity(context);
assert(inboundIdentity?.inboundEvidenceDigest,
  'Latest inbound must resolve a deterministic evidence digest');
assert.equal(inboundIdentity.providerMessageId,'aabbccddeeff0011');
assert.equal(workflow.buildApprovalBinding({
  threadId:thread.threadId,lastMessageAt:at,
  recipientEmail:'customer@example.com',draftDigest:sampleDigest
}),null,'Approval binding must fail closed without inbound identity');
const binding=workflow.buildApprovalBinding({
  threadId:thread.threadId,lastMessageAt:at,
  recipientEmail:'customer@example.com',draftDigest:sampleDigest,
  inboundIdentity
});
assert.equal(binding.recipientEmail,'customer@example.com');
assert.equal(binding.inboundProviderMessageId,'aabbccddeeff0011');
assert.equal(binding.inboundEvidenceDigest,inboundIdentity.inboundEvidenceDigest);
const currentEvidence={
  threadId:thread.threadId,lastMessageAt:at,
  recipientEmail:'customer@example.com',draftDigest:sampleDigest,
  inboundProviderMessageId:inboundIdentity.providerMessageId,
  inboundEvidenceDigest:inboundIdentity.inboundEvidenceDigest
};
assert.equal(workflow.approvalBindingValid(binding,currentEvidence),true);
assert.equal(workflow.approvalBindingValid(binding,{
  ...currentEvidence,recipientEmail:'other@example.com'
}),false,'Recipient change must invalidate approval');
assert.equal(workflow.approvalBindingValid(binding,{
  ...currentEvidence,
  lastMessageAt:new Date(Date.parse(at)+60000).toISOString()
}),false,'Inbound revision change must invalidate approval');
assert.equal(workflow.approvalBindingValid(binding,{
  ...currentEvidence,draftDigest:'b'.repeat(64)
}),false,'Draft digest change must invalidate approval');
const sameTimeDifferentId=workflow.resolveLatestInboundIdentity({
  ...context,messages:[{...reply,messageId:'bbccddeeff001122',
    excerpt:'Could you send a quote for a corporate poker event? Updated request.'}]
});
assert.notEqual(sameTimeDifferentId.providerMessageId,inboundIdentity.providerMessageId);
assert.notEqual(sameTimeDifferentId.inboundEvidenceDigest,
  inboundIdentity.inboundEvidenceDigest);
assert.equal(workflow.approvalBindingValid(binding,{
  ...currentEvidence,
  inboundProviderMessageId:sameTimeDifferentId.providerMessageId,
  inboundEvidenceDigest:sameTimeDifferentId.inboundEvidenceDigest
}),false,'Same-timestamp inbound identity replacement must invalidate approval');
assert.match(workflow.staleApprovalReason(binding,{
  ...currentEvidence,recipientEmail:'other@example.com'
}),/recipient/i);
assert.match(workflow.staleApprovalReason(binding,{
  ...currentEvidence,
  inboundProviderMessageId:sameTimeDifferentId.providerMessageId,
  inboundEvidenceDigest:sameTimeDifferentId.inboundEvidenceDigest
}),/inbound identity/i);

// Browser-level state machine under a minimal fake DOM. No real network.
global.window={crypto:webcrypto};
class Node {
  constructor(tag='',cls='',value=''){
    this.tag=tag;this.className=cls;this.textContent=value;
    this.children=[];this.handlers={};this.disabled=false;this.checked=false;
    this.value='';this.id='';this.attrs={};this.type='';
  }
  append(...items){this.children.push(...items);}
  addEventListener(name,cb){this.handlers[name]=cb;}
  setAttribute(k,v){this.attrs[k]=v;}
  focus(){}
  trigger(name){if(!this.handlers[name])throw Error('no '+name+' on '+this.tag);
    return this.handlers[name]();}
}
global.document={
  createElement:tag=>new Node(tag),
  createTextNode:t=>new Node('text','',t)
};
const makeText=(tag,cls,txt)=>new Node(tag,cls,txt);
const read=(node,predicate)=>{
  if(predicate(node))return node;
  for(const child of node.children||[]){
    const found=read(child,predicate);if(found)return found;
  }
  return null;
};
const button=(node,label)=>read(node,x=>x.tag==='button'&&x.textContent===label);
const posted=[],aiRequests=[],advanced=[],sendPosts=[],recipientOverrides={to:'customer@example.com'};
const fetchMock=async (url,options={})=>{
  if(url==='/api/sms/staging/reply-personalized-draft'&&options.body){
    aiRequests.push(options.body);
    return {
      ok:true,source:'owner_requested_ai_reply_preview',
      threadId:thread.threadId,lastMessageAt:at,
      subject:'Re: Poker event availability',
      body:'Hi,\n\nThanks for reaching out about poker training! Could you confirm your preferred event date and approximate guest count? I can then put together the right options for your group.\n\nThanks,\n\nMatt Carpenter\nEvent & Talent Manager\nLas Vegas Poker Training\n616-745-7148',
      rationale:'Ask for the two missing facts before quoting.',
      needsReview:['Exact event date','Guest count'],
      sendTriggered:false,gmailDraftCreated:false
    };
  }
  if(typeof url==='string'&&url.includes('/reply-send')&&options.body){
    sendPosts.push(options.body);
    return {ok:false,sent:false,reason:'send_disabled_in_synthetic_adapter'};
  }
  if(options.body){
    const v=options.body;posted.push(v);
    return {ok:true,saved:1,audited:true,
      source:'append_only_owner_reply_audit',
      decision:v.decision,recordedAt:new Date().toISOString()};
  }
  if(url.includes('/reply-decisions?'))return {
    ok:true,source:'append_only_owner_reply_audit',
    decision:null,lastMessageAt:null,draftDigest:null
  };
  if(url.includes('/reply-recipient?'))return {
    ok:true,source:'owner_selected_verified_recipient',
    threadId:thread.threadId,lastMessageAt:at,
    to:recipientOverrides.to,from:'book@pokertraininglasvegas.com',
    mailboxIdentityVerified:true,sendEnabled:false
  };
  if(url.includes('/reply-send?'))return {
    ok:true,source:'lvpt_deduplicated_send_status',
    status:'not_attempted',doNotRetry:false
  };
  if(url.includes('/inbox-thread?'))return {...context,ok:true};
  throw Error('Unexpected endpoint '+url);
};
let updates=0;
const c=controls.createController({
  getProtected:fetchMock,makeText,qualification:{},workflow,
  onUpdate:()=>{updates++;},
  onNext:id=>advanced.push(id)
});
async function settle(){await new Promise(resolve=>setTimeout(resolve,15));}
async function waitForCount(n) {
  for(let attempt=0;attempt<30 && posted.length<n;attempt++)
    await new Promise(resolve=>setTimeout(resolve,10));
  assert(posted.length>=n,'Expected '+n+' audited decisions; got '+posted.length);
}
async function sequence() {
  // Live controls: earlier truncated + complete latest stays not approval-ready.
  const truncatedCtrl=controls.createController({
    getProtected:fetchMock,makeText,qualification:{},workflow,onUpdate:()=>{}
  });
  await truncatedCtrl.loadAudit(thread);
  let truncRoot=new Node('div');
  truncatedCtrl.render(truncRoot,thread,earlierTruncatedContext,earlierTruncatedQ);
  const truncCheck=read(truncRoot,x=>x.tag==='input'&&x.type==='checkbox');
  assert(truncCheck,'Truncated-history thread may still open manual draft prep');
  truncCheck.checked=true;truncCheck.trigger('change');
  button(truncRoot,'Prepare editable reply').trigger('click');
  await settle();
  truncRoot=new Node('div');
  truncatedCtrl.render(truncRoot,thread,earlierTruncatedContext,earlierTruncatedQ);
  const truncBody=read(truncRoot,x=>x.tag==='textarea');
  truncBody.value=written;truncBody.trigger('input');
  button(truncRoot,'Verify recipient and send status (read-only)').trigger('click');
  await settle();await settle();
  truncRoot=new Node('div');
  truncatedCtrl.render(truncRoot,thread,earlierTruncatedContext,earlierTruncatedQ);
  const truncReadyBody=read(truncRoot,x=>x.tag==='textarea');
  truncReadyBody.value=written;truncReadyBody.trigger('input');
  assert(button(truncRoot,'Approve for manual copy').disabled,
    'Live Approve control must stay disabled when an earlier message is truncated');
  assert(read(truncRoot,x=>String(x.textContent||'').includes('Not approval-ready')),
    'Live controls must visibly report non-ready truncated/incomplete context');
  truncatedCtrl.reset();
  posted.length=0; // Isolate subsequent happy-path audit count assertions.

  await c.loadAudit(thread);
  let root=new Node('div');
  c.render(root,thread,context,q);
  assert(button(root,'Prepare editable reply').disabled,
    'Unverified selected conversation cannot start a draft');
  const checkbox=read(root,x=>x.tag==='input'&&x.type==='checkbox');
  assert(checkbox);
  checkbox.checked=true;checkbox.trigger('change');
  assert(!button(root,'Prepare editable reply').disabled);
  button(root,'Prepare editable reply').trigger('click');
  await settle();
  assert.equal(posted[0].decision,'draft_prepared');
  assert.equal(posted[0].ownerReviewedOriginal,true);
  assert.equal(posted[0].draftDigest,'');
  root=new Node('div');c.render(root,thread,context,q);
  assert(button(root,'Approve for manual copy'));
  assert(button(root,'Approve for manual copy').disabled,
    'Placeholder cannot be approved');
  assert(button(root,'Generate personalized AI reply'),
    'An explicitly prepared conversation may request an optional AI suggestion');
  button(root,'Generate personalized AI reply').trigger('click');
  await settle();await settle();
  assert.equal(aiRequests.length,1);
  assert.deepEqual(Object.keys(aiRequests[0]).sort(),['lastMessageAt','threadId']);
  assert.equal(posted.length,1,
    'AI suggestions do not create an approval or send an email');
  root=new Node('div');c.render(root,thread,context,q);
  const aiEditor=read(root,node=>node.tag==='textarea');
  assert.match(aiEditor.value,/preferred event date/);
  assert(button(root,'Approve for manual copy').disabled===true,
    'Unverified recipient cannot appear approval-ready after AI suggestion');
  const editor=read(root,x=>x.tag==='textarea');
  assert(editor);
  editor.value=written;
  editor.trigger('input');
  assert(button(root,'Approve for manual copy').disabled,
    'Valid draft text alone is not approval-ready without recipient verification');
  assert(button(root,'Verify recipient and send status (read-only)'),
    'Prepared review must expose recipient verification before approval');
  button(root,'Verify recipient and send status (read-only)').trigger('click');
  await settle();await settle();
  root=new Node('div');c.render(root,thread,context,q);
  const verifiedEditor=read(root,x=>x.tag==='textarea');
  assert(verifiedEditor);
  verifiedEditor.value=written;verifiedEditor.trigger('input');
  assert(!button(root,'Approve for manual copy').disabled,
    'Verified recipient plus complete full-thread evidence may unlock approval');
  assert(button(root,'Send email — disabled in staging').disabled,
    'Sending must be impossible within the staging interface');
  button(root,'Approve for manual copy').trigger('click');
  await waitForCount(2);
  assert.equal(posted[1].decision,'approved_for_manual_copy');
  assert.match(posted[1].draftDigest,/^[a-f0-9]{64}$/);
  assert(!Object.prototype.hasOwnProperty.call(posted[1],'body'),
    'Draft content must never appear in audit request');
  assert(!Object.prototype.hasOwnProperty.call(posted[1],'subject'));
  assert(!Object.prototype.hasOwnProperty.call(posted[1],'recipientEmail'));
  root=new Node('div');c.render(root,thread,context,q);
  assert(button(root,'Copy approved text and continue'));
  assert(button(root,'Make changes — revise draft'));
  assert(button(root,'Edit myself — close without sending'));
  assert(button(root,'Send email — disabled in staging').disabled);
  assert.equal(c.getActive()?.ownerDecision,'APPROVE');
  assert.equal(c.getActive()?.approvalBinding?.recipientEmail,'customer@example.com');
  button(root,'Verify recipient and send status (read-only)').trigger('click');
  await settle();await settle();
  root=new Node('div');c.render(root,thread,context,q);
  assert(button(root,'Send email — disabled in staging').disabled);
  assert(!button(root,'Send this approved reply'),
    'Verified recipient alone must not enable sending when two opt-ins are off');
  const verifiedLabel=read(root,x=>
    typeof x.textContent==='string' &&
    x.textContent.includes('customer@example.com'));
  assert(verifiedLabel,
    'Verified address should display for review without enabling send');
  // MAKE CHANGES returns a revised draft that requires renewed APPROVE.
  button(root,'Make changes — revise draft').trigger('click');
  await settle();
  assert.equal(posted[2].decision,'draft_prepared');
  root=new Node('div');c.render(root,thread,context,q);
  assert.equal(c.getActive()?.phase,'prepared');
  assert.equal(c.getActive()?.draftDigest,'');
  assert.equal(c.getActive()?.approvalBinding,null);
  assert(button(root,'Approve for manual copy').disabled,
    'MAKE CHANGES must require renewed approval before any send path');
  assert.equal(sendPosts.length,0,'MAKE CHANGES must never call reply-send');
  button(root,'Deny — no reply needed').trigger('click');
  await settle();
  assert.equal(posted[3].decision,'denied');
  assert.equal(c.getActive(),null);
  assert.deepEqual(advanced,[thread.threadId],
    'An audited denial must advance the one-email queue exactly once');
  assert.equal(sendPosts.length,0,'DENY must never call reply-send');
  root=new Node('div');c.render(root,thread,context,q);
  assert(!button(root,'Prepare editable reply'),
    'A denied email revision must not reopen until a new incoming message');
  assert(updates>0);
  c.reset();
  // Reload the audit exactly as PostgREST historically serialized it.
  // It MUST NOT reenable a previously denied email after a page refresh.
  const postgresAt=at.replace(/\.000Z$/,'+00:00');
  const restored=controls.createController({
    getProtected:async()=>({
      ok:true,source:'append_only_owner_reply_audit',
      decision:'denied',lastMessageAt:postgresAt,
      ownerReviewedOriginal:true
    }),
    makeText,qualification:{},workflow,onUpdate:()=>{}
  });
  await restored.loadAudit(thread);
  root=new Node('div');restored.render(root,thread,context,q);
  assert(!button(root,'Prepare editable reply'),
    'Persisted denial in PostgreSQL timestamp format must block the same email revision');
  assert(read(root,x=>String(x.textContent||'').includes('owner already denied')),
    'Previously denied email should explain its closed state');
  // A real NEW inbound message in that thread is a different revision.
  const newAt=new Date(Date.parse(at)+60000).toISOString();
  const newThread={...thread,lastMessageAt:newAt};
  const newContext={...context,lastMessageAt:newAt,messages:[{...reply,at:newAt}]};
  const newQ=qualifyThread(newThread,newContext);
  root=new Node('div');restored.render(root,newThread,newContext,newQ);
  assert(button(root,'Prepare editable reply'),
    'A newer incoming client message must be eligible for separate human review');
  // Explicitly copied owner-approved text should release the single-email
  // lock and advance. A mere approval must NEVER do so; no Gmail send occurs.
  const copiedAdvance=[],copies=[];
  Object.defineProperty(global,'navigator',{configurable:true,value:{clipboard:{
    writeText:async value=>copies.push(value)
  }}});
  const copiedController=controls.createController({
    getProtected:fetchMock,makeText,qualification:{},workflow,
    onUpdate:()=>{},onNext:id=>copiedAdvance.push(id)
  });
  await copiedController.loadAudit(thread);
  root=new Node('div');copiedController.render(root,thread,context,q);
  const copiedCheck=read(root,x=>x.tag==='input'&&x.type==='checkbox');
  copiedCheck.checked=true;copiedCheck.trigger('change');
  button(root,'Prepare editable reply').trigger('click');
  await waitForCount(5);
  root=new Node('div');copiedController.render(root,thread,context,q);
  const copiedBody=read(root,x=>x.tag==='textarea');
  copiedBody.value=written;copiedBody.trigger('input');
  button(root,'Verify recipient and send status (read-only)').trigger('click');
  await settle();await settle();
  root=new Node('div');copiedController.render(root,thread,context,q);
  const copiedBodyReady=read(root,x=>x.tag==='textarea');
  copiedBodyReady.value=written;copiedBodyReady.trigger('input');
  button(root,'Approve for manual copy').trigger('click');
  await waitForCount(6);
  assert.deepEqual(copiedAdvance,[],
    'Recording owner approval alone must not discard unsent text');
  root=new Node('div');copiedController.render(root,thread,context,q);
  const copyButton=button(root,'Copy approved text and continue');
  assert(copyButton,'Approved email has explicit copy-and-continue control');
  copyButton.trigger('click');
  for(let n=0;n<40 && copiedAdvance.length===0;n++)await settle();
  assert.deepEqual(copiedAdvance,[thread.threadId]);
  assert.equal(copies.length,1);
  assert(copies[0].includes('Matt Carpenter'));
  assert.equal(copiedController.getActive(),null);
  assert.equal(copiedController.handledThisSession(thread),'copied_not_sent');
  const countAfterCopy=posted.length;
  assert.equal(countAfterCopy,6,'Clipboard never creates a new audit/send intent');
  // Clipboard failure must preserve locked draft and remain on this thread.
  const failedAdvance=[];
  Object.defineProperty(global,'navigator',{configurable:true,value:{clipboard:{
    writeText:async()=>{throw Error('Denied');}
  }}});
  const failed=controls.createController({
    getProtected:fetchMock,makeText,qualification:{},workflow,
    onUpdate:()=>{},onNext:id=>failedAdvance.push(id)
  });
  await failed.loadAudit(thread);
  root=new Node('div');failed.render(root,thread,context,q);
  const failedCheck=read(root,x=>x.tag==='input'&&x.type==='checkbox');
  failedCheck.checked=true;failedCheck.trigger('change');
  button(root,'Prepare editable reply').trigger('click');await waitForCount(7);
  root=new Node('div');failed.render(root,thread,context,q);
  const failedBody=read(root,x=>x.tag==='textarea');
  failedBody.value=written;failedBody.trigger('input');
  button(root,'Verify recipient and send status (read-only)').trigger('click');
  await settle();await settle();
  root=new Node('div');failed.render(root,thread,context,q);
  const failedBodyReady=read(root,x=>x.tag==='textarea');
  failedBodyReady.value=written;failedBodyReady.trigger('input');
  button(root,'Approve for manual copy').trigger('click');await waitForCount(8);
  root=new Node('div');failed.render(root,thread,context,q);
  button(root,'Copy approved text and continue').trigger('click');
  let copyBlocked=false;
  for(let n=0;n<40 && !copyBlocked;n++){
    await settle();
    const probe=new Node('div');
    failed.render(probe,thread,context,q);
    copyBlocked=Boolean(read(probe,x=>String(x.textContent||'').includes('Copy blocked')));
  }
  assert(copyBlocked,'A failed clipboard copy must finish as blocked');
  assert.deepEqual(failedAdvance,[],
    'Clipboard error may never advance or discard the approved draft');
  assert.equal(failed.getActive()?.phase,'approved_for_manual_copy');
  assert.equal(failed.handledThisSession(thread),null);

  // EDIT MYSELF never sends and never posts a send intent.
  const editAdvance=[];
  const editSendBaseline=sendPosts.length;
  const editCtrl=controls.createController({
    getProtected:fetchMock,makeText,qualification:{},workflow,
    onUpdate:()=>{},onNext:id=>editAdvance.push(id)
  });
  await editCtrl.loadAudit(thread);
  root=new Node('div');editCtrl.render(root,thread,context,q);
  const editCheck=read(root,x=>x.tag==='input'&&x.type==='checkbox');
  editCheck.checked=true;editCheck.trigger('change');
  button(root,'Prepare editable reply').trigger('click');
  await waitForCount(9);
  root=new Node('div');editCtrl.render(root,thread,context,q);
  assert(button(root,'Edit myself — close without sending'));
  button(root,'Edit myself — close without sending').trigger('click');
  await settle();
  assert.equal(editCtrl.getActive(),null);
  assert.equal(editCtrl.handledThisSession(thread),'edit_myself_not_sent');
  assert.deepEqual(editAdvance,[thread.threadId]);
  assert.equal(sendPosts.length,editSendBaseline,
    'EDIT MYSELF must never call reply-send');
  assert.equal(posted.filter(p=>p.decision==='approved_for_manual_copy').length>=1,true);

  // Recipient change after APPROVE invalidates stale approval.
  recipientOverrides.to='customer@example.com';
  const invAdvance=[];
  const inv=controls.createController({
    getProtected:fetchMock,makeText,qualification:{},workflow,
    onUpdate:()=>{},onNext:id=>invAdvance.push(id)
  });
  await inv.loadAudit(thread);
  root=new Node('div');inv.render(root,thread,context,q);
  const invCheck=read(root,x=>x.tag==='input'&&x.type==='checkbox');
  invCheck.checked=true;invCheck.trigger('change');
  button(root,'Prepare editable reply').trigger('click');
  await waitForCount(10);
  root=new Node('div');inv.render(root,thread,context,q);
  const invBody=read(root,x=>x.tag==='textarea');
  invBody.value=written;invBody.trigger('input');
  button(root,'Verify recipient and send status (read-only)').trigger('click');
  await settle();await settle();
  root=new Node('div');inv.render(root,thread,context,q);
  const invBodyReady=read(root,x=>x.tag==='textarea');
  invBodyReady.value=written;invBodyReady.trigger('input');
  button(root,'Approve for manual copy').trigger('click');
  await waitForCount(11);
  assert.equal(inv.getActive()?.phase,'approved_for_manual_copy');
  recipientOverrides.to='other-client@example.com';
  root=new Node('div');inv.render(root,thread,context,q);
  button(root,'Verify recipient and send status (read-only)').trigger('click');
  await settle();await settle();
  root=new Node('div');inv.render(root,thread,context,q);
  assert.equal(inv.getActive()?.phase,'prepared',
    'Changed recipient must invalidate stale APPROVE');
  assert(read(root,x=>String(x.textContent||'').includes('recipient')||
    String(x.textContent||'').includes('Renew review')||
    String(x.textContent||'').includes('Make changes')),
    'UI must explain that renewed review is required');
  assert(!button(root,'Copy approved text and continue'),
    'Stale approval must not keep copy-approved controls');
  assert.equal(sendPosts.length,editSendBaseline,
    'Recipient invalidation must never send');

  // New inbound invalidates an in-memory APPROVE binding.
  recipientOverrides.to='customer@example.com';
  const inboundCtrl=controls.createController({
    getProtected:fetchMock,makeText,qualification:{},workflow,onUpdate:()=>{}
  });
  await inboundCtrl.loadAudit(thread);
  root=new Node('div');inboundCtrl.render(root,thread,context,q);
  const inCheck=read(root,x=>x.tag==='input'&&x.type==='checkbox');
  inCheck.checked=true;inCheck.trigger('change');
  button(root,'Prepare editable reply').trigger('click');
  await waitForCount(12);
  root=new Node('div');inboundCtrl.render(root,thread,context,q);
  const inBody=read(root,x=>x.tag==='textarea');
  inBody.value=written;inBody.trigger('input');
  button(root,'Verify recipient and send status (read-only)').trigger('click');
  await settle();await settle();
  root=new Node('div');inboundCtrl.render(root,thread,context,q);
  const inBodyReady=read(root,x=>x.tag==='textarea');
  inBodyReady.value=written;inBodyReady.trigger('input');
  button(root,'Approve for manual copy').trigger('click');
  await waitForCount(13);
  assert.equal(inboundCtrl.getActive()?.phase,'approved_for_manual_copy');
  const newerAt=new Date(Date.parse(at)+120000).toISOString();
  const newerThread={...thread,lastMessageAt:newerAt};
  const newerContext={...context,lastMessageAt:newerAt,messages:[{...reply,at:newerAt}]};
  const newerQ=qualifyThread(newerThread,newerContext);
  root=new Node('div');inboundCtrl.render(root,newerThread,newerContext,newerQ);
  assert.notEqual(inboundCtrl.getActive()?.phase,'approved_for_manual_copy',
    'Newer inbound must invalidate stale APPROVE');
  assert(read(root,x=>String(x.textContent||'').includes('Gmail evidence changed')||
    String(x.textContent||'').includes('No email was sent')),
    'Inbound invalidation must be visible and non-sending');

  // Same timestamp, different provider message ID/content must invalidate
  // APPROVE and keep copy/send blocked until renewed review.
  recipientOverrides.to='customer@example.com';
  const sameTsSendBaseline=sendPosts.length;
  const sameTs=controls.createController({
    getProtected:fetchMock,makeText,qualification:{},workflow,onUpdate:()=>{}
  });
  await sameTs.loadAudit(thread);
  root=new Node('div');sameTs.render(root,thread,context,q);
  const sameTsCheck=read(root,x=>x.tag==='input'&&x.type==='checkbox');
  sameTsCheck.checked=true;sameTsCheck.trigger('change');
  button(root,'Prepare editable reply').trigger('click');
  await waitForCount(14);
  root=new Node('div');sameTs.render(root,thread,context,q);
  const sameTsBody=read(root,x=>x.tag==='textarea');
  sameTsBody.value=written;sameTsBody.trigger('input');
  button(root,'Verify recipient and send status (read-only)').trigger('click');
  await settle();await settle();
  root=new Node('div');sameTs.render(root,thread,context,q);
  const sameTsBodyReady=read(root,x=>x.tag==='textarea');
  sameTsBodyReady.value=written;sameTsBodyReady.trigger('input');
  button(root,'Approve for manual copy').trigger('click');
  await waitForCount(15);
  assert.equal(sameTs.getActive()?.phase,'approved_for_manual_copy');
  assert(sameTs.getActive()?.approvalBinding?.inboundEvidenceDigest);
  const replacedContext={
    ...context,
    messages:[{
      ...reply,
      messageId:'ccddeeff00112233',
      excerpt:'Could you send a quote for a corporate poker event? Please include AV needs.'
    }]
  };
  const replacedQ=qualifyThread(thread,replacedContext);
  root=new Node('div');sameTs.render(root,thread,replacedContext,replacedQ);
  assert.equal(sameTs.getActive()?.phase,'prepared',
    'Same-timestamp inbound ID/content replacement must invalidate APPROVE');
  assert(!button(root,'Copy approved text and continue'),
    'Copy must stay blocked after inbound identity replacement');
  assert(!button(root,'Send this approved reply'),
    'Send must stay blocked after inbound identity replacement');
  assert(button(root,'Approve for manual copy'),
    'Renewed APPROVE must be required after inbound identity replacement');
  assert(read(root,x=>/inbound identity|Renew review|No email was sent/i
    .test(String(x.textContent||''))),
    'UI must explain inbound identity invalidation without sending');
  assert.equal(sendPosts.length,sameTsSendBaseline,
    'Inbound identity invalidation must never call reply-send');

  // Missing recipient: binding must fail before any approved audit write.
  const approvedBeforeMissingRecipient=posted.filter(
    p=>p.decision==='approved_for_manual_copy').length;
  const missingRecipientWorkflow={
    ...workflow,
    approvalReady:()=>({ready:true,reason:'synthetic gate open',mutatesGmail:false})
  };
  const missingRecipient=controls.createController({
    getProtected:fetchMock,makeText,qualification:{},
    workflow:missingRecipientWorkflow,onUpdate:()=>{}
  });
  await missingRecipient.loadAudit(thread);
  root=new Node('div');missingRecipient.render(root,thread,context,q);
  const missRecCheck=read(root,x=>x.tag==='input'&&x.type==='checkbox');
  missRecCheck.checked=true;missRecCheck.trigger('change');
  button(root,'Prepare editable reply').trigger('click');
  await waitForCount(16);
  root=new Node('div');missingRecipient.render(root,thread,context,q);
  const missRecBody=read(root,x=>x.tag==='textarea');
  missRecBody.value=written;missRecBody.trigger('input');
  // Intentionally skip recipient verification.
  button(root,'Approve for manual copy').trigger('click');
  await settle();await settle();
  assert.equal(
    posted.filter(p=>p.decision==='approved_for_manual_copy').length,
    approvedBeforeMissingRecipient,
    'Missing recipient must produce zero approved audit writes');
  assert.notEqual(missingRecipient.getActive()?.phase,'approved_for_manual_copy');
  assert(!button(root,'Copy approved text and continue'),
    'Missing recipient must not enable copy');
  assert(!button(root,'Send this approved reply'),
    'Missing recipient must not enable send');
  assert.equal(sendPosts.length,sameTsSendBaseline,
    'Missing recipient path must never call reply-send');

  // Missing inbound identity: binding must fail before any approved audit write.
  const approvedBeforeMissingInbound=posted.filter(
    p=>p.decision==='approved_for_manual_copy').length;
  const missingInboundWorkflow={
    ...workflow,
    approvalReady:()=>({ready:true,reason:'synthetic gate open',mutatesGmail:false}),
    resolveLatestInboundIdentity:()=>null
  };
  const missingInbound=controls.createController({
    getProtected:fetchMock,makeText,qualification:{},
    workflow:missingInboundWorkflow,onUpdate:()=>{}
  });
  await missingInbound.loadAudit(thread);
  root=new Node('div');missingInbound.render(root,thread,context,q);
  const missInCheck=read(root,x=>x.tag==='input'&&x.type==='checkbox');
  missInCheck.checked=true;missInCheck.trigger('change');
  button(root,'Prepare editable reply').trigger('click');
  await waitForCount(17);
  root=new Node('div');missingInbound.render(root,thread,context,q);
  const missInBody=read(root,x=>x.tag==='textarea');
  missInBody.value=written;missInBody.trigger('input');
  button(root,'Verify recipient and send status (read-only)').trigger('click');
  await settle();await settle();
  root=new Node('div');missingInbound.render(root,thread,context,q);
  const missInBodyReady=read(root,x=>x.tag==='textarea');
  missInBodyReady.value=written;missInBodyReady.trigger('input');
  button(root,'Approve for manual copy').trigger('click');
  await settle();await settle();
  assert.equal(
    posted.filter(p=>p.decision==='approved_for_manual_copy').length,
    approvedBeforeMissingInbound,
    'Missing inbound evidence must produce zero approved audit writes');
  assert.notEqual(missingInbound.getActive()?.phase,'approved_for_manual_copy');
  root=new Node('div');missingInbound.render(root,thread,context,q);
  assert(!button(root,'Copy approved text and continue'),
    'Missing inbound evidence must not enable copy');
  assert(!button(root,'Send this approved reply'),
    'Missing inbound evidence must not enable send');
  assert(read(root,x=>String(x.textContent||'').includes('Approval NOT recorded')||
    String(x.textContent||'').includes('binding unavailable')||
    button(root,'Approve for manual copy')),
    'Missing inbound must leave review non-approved');
  assert.equal(sendPosts.length,sameTsSendBaseline,
    'Missing inbound path must never call reply-send');
}
sequence().then(()=>{
  const api=fs.readFileSync(path.join(__dirname,
    '../app/api/sms/staging/reply-decisions/route.ts'),'utf8');
  const ui=fs.readFileSync(path.join(__dirname,
    '../public/sms-review/reply-review-controls.js'),'utf8');
  const wf=fs.readFileSync(path.join(__dirname,
    '../public/sms-review/reply-workflow.js'),'utf8');
  const app=fs.readFileSync(path.join(__dirname,'../public/sms-review/app.js'),'utf8');
  const html=fs.readFileSync(path.join(__dirname,'../public/sms-review/index.html'),'utf8');
  const ddl=fs.readFileSync(path.join(__dirname,
    '../docs/staging-migrations/2026-11-10-step47-reply-review-audit.sql'),'utf8');
  assert.match(api,/allowedReviewMutation\(request\)/);
  assert.match(api,/hasReviewSession\(request\)/);
  assert.match(api,/appsScriptRequest<Context>\('readBusinessInboxThread'/);
  assert.match(api,/source.partial===true&&!ownerReviewedOriginal/);
  assert.match(api,/owner_reviewed_full_thread:ownerReviewedOriginal/);
  assert.match(api,/Number\(source.totalMessages\)>150/);
  assert.match(api,/last.direction!=='inbound'\|\|last.relationshipHint!=='unclassified'/);
  assert.match(api,/prepare_draft_before_approval/);
  assert.match(api,/draft_digest:decision==='approved_for_manual_copy'\?digest:null/);
  assert.match(api,/noGmailWrites:true,noAutomaticSend:true/);
  assert.match(api,/type Decision='draft_prepared'\|'approved_for_manual_copy'\|'denied'/);
  assert(!/GmailApp\.sendEmail|MailApp\.sendEmail|createDraft/.test(api),
    'Decision route must remain non-sending (read/audit only)');
  assert.match(ddl,/enable row level security/i);
  assert.match(ddl,/revoke all.*anon,authenticated/i);
  assert.match(ddl,/Stores no client email bodies/i);
  assert.match(app,/const replyController=window.LVPTReplyReviewControls.createController/);
  assert.match(app,/replyController.render\(detail,t,context,qualification\)/);
  assert.match(app,/describeContext\(/);
  assert.match(app,/gmail-context-limitations/);
  assert.match(ui,/approvalReady/);
  assert.match(ui,/Not approval-ready/);
  assert.match(ui,/Make changes — revise draft/);
  assert.match(ui,/Edit myself — close without sending/);
  assert.match(ui,/buildApprovalBinding/);
  assert.match(ui,/invalidateStaleApproval/);
  assert.match(ui,/resolveLatestInboundIdentity/);
  assert.match(ui,/inboundIdentityChanged/);
  assert.match(ui,/let approvedBinding=null/);
  assert.match(ui,/APPROVE: construct and validate the complete binding BEFORE any audit/);
  assert.match(ui,/approvalBinding:approvedBinding/);
  assert.match(wf,/OWNER_DECISIONS/);
  assert.match(wf,/approvalBindingValid/);
  assert.match(wf,/resolveLatestInboundIdentity/);
  assert.match(wf,/inboundEvidenceDigest/);
  assert.match(wf,/Fail closed: inbound identity is required/);
  assert.match(app,/Latest email — current review focus/,
    'Latest message must be prominent as the only default email excerpt');
  assert.match(app,/const earlier=messages.slice\(0,-1\)/);
  assert.match(app,/document.createElement\('details'\)/,
    'Earlier correspondence must be collapsed by default');
  assert.match(app,/View '\+earlier.length\+' previous email'/);
  assert.match(app,/pending.threadId!==t.threadId/,
    'Cannot switch to another thread during an active reply review');
  assert.match(app,/audit.decision==='denied'/,
    'Advancing the queue must skip earlier denied revisions');
  assert.match(app,/visible:false/,
    'Opening a different conversation collapses the previous preview');

  assert.match(app,/await replyController.loadAudit\(t\)/);
  assert.match(app,/item.type==='inbox'\?\s*\[\]:/,
    'Legacy action-review audit must not receive incompatible inbox decisions');
  assert(html.indexOf('src="./reply-review-controls.js"')<
    html.indexOf('src="./app.js"'));
  assert(!/(?:GmailApp|MailApp)\.sendEmail|fetch\(['"][^'"]*gmail.*send|createDraft/.test(ui),
    'Controller may not write Gmail messages or drafts');
  assert(!/localStorage|sessionStorage/.test(ui),
    'Sensitive drafts must stay in memory only');
  console.log('Step 47 single-email approval, no-content audit, and disabled send tests passed.');
}).catch(e=>{console.error(e);process.exitCode=1;});
