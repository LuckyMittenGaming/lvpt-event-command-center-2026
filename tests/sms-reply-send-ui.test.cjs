'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {webcrypto}=require('node:crypto');
const {qualifyThread}=require('../public/sms-review/reply-qualification.js');
const workflow=require('../public/sms-review/reply-workflow.js');
const controls=require('../public/sms-review/reply-review-controls.js');

global.window={crypto:webcrypto};
class Node {
  constructor(tag='',className='',textContent=''){
    this.tag=tag;this.className=className;this.textContent=textContent;
    this.children=[];this.handlers={};this.value='';this.checked=false;
    this.disabled=false;this.id='';this.attrs={};this.type='';
  }
  append(...children){this.children.push(...children);}
  addEventListener(key,callback){this.handlers[key]=callback;}
  setAttribute(key,value){this.attrs[key]=value;}
  trigger(key){assert(this.handlers[key],this.tag+' missing '+key);
    return this.handlers[key]();}
  focus(){}
}
global.document={createElement:tag=>new Node(tag),
  createTextNode:t=>new Node('text','',t)};
const makeText=(tag,cls,text)=>new Node(tag,cls,text);
const find=(node,predicate)=>{
  if(predicate(node))return node;
  for(const child of node.children||[]){
    const result=find(child,predicate);
    if(result)return result;
  }
  return null;
};
const button=(r,txt)=>find(r,x=>x.tag==='button'&&x.textContent===txt);
const dt=new Date(Date.now()-3600000).toISOString();
const meta={threadId:'aabbccddeeff0011',lastMessageAt:dt,
  lastDirection:'inbound',relationshipHint:'unclassified',
  sourceType:'email_thread',subject:'Poker event pricing'};
const context={threadId:meta.threadId,lastMessageAt:dt,
  partial:false,totalMessages:1,messages:[{
    at:dt,direction:'inbound',relationshipHint:'unclassified',
    excerpt:'Can you send me pricing and available dates for our group?',
    truncated:false,hasAttachments:false
  }]};
const q=qualifyThread(meta,context);
assert.equal(q.outcome,'reply_candidate');
const audits=[],sends=[],next=[];
const fetchMock=async(url,opts={})=>{
  if(url.includes('/reply-decisions?'))
    return {ok:true,source:'append_only_owner_reply_audit',
      decision:null,lastMessageAt:null,draftDigest:null};
  if(url==='/api/sms/staging/reply-decisions' && opts.body) {
    audits.push(opts.body);
    return {ok:true,saved:1,audited:true,
      source:'append_only_owner_reply_audit',
      decision:opts.body.decision,recordedAt:new Date().toISOString()};
  }
  if(url.includes('/reply-recipient?'))
    return {ok:true,source:'owner_selected_verified_recipient',
      threadId:meta.threadId,lastMessageAt:dt,
      from:'book@pokertraininglasvegas.com',
      to:'potential.client@example.com',subject:'Poker event pricing',sendEnabled:true};
  if(url.includes('/reply-send?'))
    return {ok:true,source:'lvpt_deduplicated_send_status',
      status:'not_attempted',doNotRetry:false};
  if(url==='/api/sms/staging/reply-send'&&opts.body) {
    sends.push(opts.body);
    return {ok:true,sent:true,source:'lvpt_explicit_owner_send',
      gmailMessageId:'aabbccddeeff0123',threadId:meta.threadId,
      doNotRetry:true};
  }
  if(url.includes('/inbox-thread?'))return {...context,ok:true};
  throw Error('Unexpected URL '+url);
};
const uiSource=fs.readFileSync('public/sms-review/reply-review-controls.js','utf8');
assert.match(uiSource,/canonicalSubject\(recipient.subject\)===canonicalSubject\(active.subject\)/);
assert.match(uiSource,/sendEnabled:recipient.sendEnabled===true&&subjectMatches/);
const c=controls.createController({
  getProtected:fetchMock,makeText,qualification:{},workflow,
  onUpdate:()=>{},onNext:id=>next.push(id)
});
const render=()=>{const root=new Node('div');c.render(root,meta,context,q);return root;};
const settle=async()=>new Promise(resolve=>setImmediate(resolve));
const wait=async(test,label)=>{
  for(let i=0;i<40&&!test();i++)
    await new Promise(resolve=>setTimeout(resolve,8));
  assert(test(),label);
};
(async()=>{
  await c.loadAudit(meta);
  let root=render();
  const verify=find(root,x=>x.tag==='input'&&x.type==='checkbox');
  verify.checked=true;verify.trigger('change');
  button(root,'Prepare editable reply').trigger('click');
  await wait(()=>audits.length===1,'prepare audit');
  root=render();
  const body=find(root,x=>x.tag==='textarea');
  body.value=workflow.draftStarter(meta).body.replace(/\[[^\]]+\]/g,
    'Our two-hour private experience starts with training, followed by live play. I can confirm availability and an exact quote with your event date and group size.');
  body.trigger('input');
  button(root,'Approve for manual copy').trigger('click');
  await wait(()=>audits.length===2,'approval audit');
  root=render();
  assert(button(root,'Send email — disabled in staging'),
    'The default state must not permit a send before recipient verification');
  button(root,'Verify recipient and send status (read-only)').trigger('click');
  await settle();await settle();
  root=render();
  const sendButton=button(root,'Send this approved reply');
  assert(sendButton,'Send appears only after both enable flags and verification');
  assert(sendButton.disabled,'Send must not activate without owner confirmations');
  assert.equal(sends.length,0);
  const review=find(root,x=>x.tag==='input'&&x.type==='checkbox'&&
    x.id.startsWith('step48-send-confirm-'));
  const phrase=find(root,x=>x.tag==='input'&&
    x.attrs['aria-label']==='Step 48 explicit send confirmation');
  assert(review&&phrase);
  review.checked=true;review.trigger('change');
  assert(sendButton.disabled,'Checkbox alone is not enough');
  phrase.value='SEND THIS EMAIL';phrase.trigger('input');
  assert(!sendButton.disabled,'Both explicit confirmations must enable send');
  sendButton.trigger('click');
  await wait(()=>sends.length===1,'single send request');
  await settle();
  assert.equal(sends[0].recipient,'potential.client@example.com');
  assert.equal(sends[0].ownerReviewed,true);
  assert.equal(sends[0].confirmation,'SEND THIS EMAIL');
  assert.equal(typeof sends[0].intentId,'string');
  root=render();
  assert(!button(root,'Send this approved reply'),'Confirmed send cannot be repeated');
  assert(!button(root,'Copy approved subject and text'),'Sent response is locked');
  button(root,'Close review; choose next email').trigger('click');
  assert.deepEqual(next,[meta.threadId],'User click advances read-only inbox');
  assert.equal(c.getActive(),null);
  console.log('Step 48 explicit checkbox, phrase, verified recipient and single-send UI tests passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
