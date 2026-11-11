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
  sourceType:'email_thread',relationshipHint:'unclassified'
};
const reply={
  at,direction:'inbound',relationshipHint:'unclassified',
  excerpt:'Could you send a quote for a corporate poker event?',
  senderDomain:'example.com',truncated:false,hasAttachments:false
};
const context={threadId:thread.threadId,lastMessageAt:at,partial:false,
  totalMessages:1,messages:[reply]};
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
const posted=[],aiRequests=[],advanced=[];
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
    to:'customer@example.com',from:'book@pokertraininglasvegas.com',
    sendEnabled:false
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
async function settle(){await new Promise(resolve=>setImmediate(resolve));}
async function waitForCount(n) {
  for(let attempt=0;attempt<30 && posted.length<n;attempt++)
    await new Promise(resolve=>setTimeout(resolve,10));
  assert(posted.length>=n,'Expected '+n+' audited decisions; got '+posted.length);
}
async function sequence() {
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
  assert(button(root,'Approve for manual copy').disabled===false,
    'Human review is still mandatory; AI suggestion may be further edited');
  const editor=read(root,x=>x.tag==='textarea');
  assert(editor);
  editor.value=written;
  editor.trigger('input');
  assert(!button(root,'Approve for manual copy').disabled);
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
  assert(button(root,'Copy approved subject and text'));
  assert(button(root,'Reopen for editing'));
  assert(button(root,'Send email — disabled in staging').disabled);
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
  button(root,'Reopen for editing').trigger('click');
  await settle();
  assert.equal(posted[2].decision,'draft_prepared');
  root=new Node('div');c.render(root,thread,context,q);
  button(root,'Deny — no reply needed').trigger('click');
  await settle();
  assert.equal(posted[3].decision,'denied');
  assert.equal(c.getActive(),null);
  assert.deepEqual(advanced,[thread.threadId],
    'An audited denial must advance the one-email queue exactly once');
  root=new Node('div');c.render(root,thread,context,q);
  assert(!button(root,'Prepare editable reply'),
    'A denied email revision must not reopen until a new incoming message');
  assert(updates>0);
  c.reset();
}
sequence().then(()=>{
  const api=fs.readFileSync(path.join(__dirname,
    '../app/api/sms/staging/reply-decisions/route.ts'),'utf8');
  const ui=fs.readFileSync(path.join(__dirname,
    '../public/sms-review/reply-review-controls.js'),'utf8');
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
  assert.match(ddl,/enable row level security/i);
  assert.match(ddl,/revoke all.*anon,authenticated/i);
  assert.match(ddl,/Stores no client email bodies/i);
  assert.match(app,/const replyController=window.LVPTReplyReviewControls.createController/);
  assert.match(app,/replyController.render\(detail,t,context,qualification\)/);
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
