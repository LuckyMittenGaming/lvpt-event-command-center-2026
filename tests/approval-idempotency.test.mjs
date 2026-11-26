import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash,webcrypto} from 'node:crypto';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const workflow=require('../public/sms-review/reply-workflow.js');
const controls=require('../public/sms-review/reply-review-controls.js');

const gmailSend=fs.readFileSync('app/api/gmail/send/route.ts','utf8');
const replySend=fs.readFileSync('app/api/sms/staging/reply-send/route.ts','utf8');
const replyDecisions=fs.readFileSync('app/api/sms/staging/reply-decisions/route.ts','utf8');
const replyRecipient=fs.readFileSync('app/api/sms/staging/reply-recipient/route.ts','utf8');
const ui=fs.readFileSync('public/sms-review/reply-review-controls.js','utf8');
const hub=fs.readFileSync('public/v2/js/unified-hub.js','utf8');

// --- Protected routes inspected read-only: production / automation stay off ---
assert.match(gmailSend,/status:\s*403/);
assert.match(gmailSend,/Sending is disabled/);
assert.match(replySend,/VERCEL_ENV==='production'/);
assert.match(replySend,/staging_only_no_production_send/);
assert.match(replySend,/LVPT_ENABLE_OWNER_APPROVED_GMAIL_SEND!=='true'/);
assert.match(replySend,/live_gmail_sending_disabled/);
assert.match(replySend,/duplicate_send_intent_exists/);
assert.match(replySend,/doNotRetry:true/);
assert.match(replySend,/markIntent\(intentId,'uncertain'\)/);
assert.match(replySend,/THREAD\.test\(String\(response\.gmailMessageId/);
assert.doesNotMatch(replySend,/for\s*\([^)]*\)\s*\{[^}]*sendOwnerApprovedGmailReply/s);
assert.match(replyDecisions,/noAutomaticSend:true/);
assert.match(replyDecisions,/noGmailWrites:true/);
assert.match(replyRecipient,/noMessageSent:true/);
assert.match(hub,/disabled:\s*true/);
assert.match(hub,/Disabled approval automation/);
assert.doesNotMatch(ui,/setInterval|scheduleSend|retrySend/);

// --- Workflow exactly-once classification ---
const digest=createHash('sha256').update('subject|body').digest('hex');
const at='2026-11-25T15:00:00.000Z';
const inboundId='aabbccddeeff0011';
const inboundDigest=workflow.deterministicInboundDigest({
  at,direction:'inbound',excerpt:'Can you quote a private poker training event?',
  senderDomain:'example.com',relationshipHint:'unclassified',
  truncated:false,hasAttachments:false,messageId:inboundId
});
const binding=workflow.buildApprovalBinding({
  threadId:'aabbccddeeff0011',lastMessageAt:at,
  recipientEmail:'client@example.com',draftDigest:digest,
  inboundProviderMessageId:inboundId,inboundEvidenceDigest:inboundDigest
});
assert.ok(binding);

const current={
  threadId:binding.threadId,lastMessageAt:at,
  recipientEmail:'client@example.com',draftDigest:digest,
  inboundProviderMessageId:inboundId,inboundEvidenceDigest:inboundDigest
};

assert.equal(workflow.sendAttemptAllowed({
  phase:'approved_for_manual_copy',
  statusRecord:{status:'not_attempted',doNotRetry:false},
  confirmation:'SEND THIS EMAIL',ownerReviewed:true,
  approvalBinding:binding,currentEvidence:current
}),true,'Exact approval may arm one send attempt');

assert.equal(workflow.sendAttemptAllowed({
  phase:'approved_for_manual_copy',
  statusRecord:{status:'not_attempted',doNotRetry:false},
  confirmation:'please send',ownerReviewed:true,
  approvalBinding:binding,currentEvidence:current
}),false,'No send without exact confirmation phrase');

assert.equal(workflow.sendAttemptAllowed({
  phase:'prepared',
  statusRecord:{status:'not_attempted',doNotRetry:false},
  confirmation:'SEND THIS EMAIL',ownerReviewed:true,
  approvalBinding:binding,currentEvidence:current
}),false,'Prepared draft without APPROVE cannot send');

assert.equal(workflow.classifySendIntentOutcome({
  kind:'clipboard_copy'
}).sent,false,'Clipboard copy is never SENT');
assert.equal(workflow.classifySendIntentOutcome({
  kind:'copied_not_sent'
}).deliveryState,'copied_not_sent');

assert.deepEqual(workflow.classifySendIntentOutcome({
  status:'sent',sent:true,gmailMessageId:'aabbccdd11223344'
}),{
  deliveryState:'sent',sent:true,doNotRetry:true,
  allowsAutomaticResend:false,mayAttemptSend:false,
  gmailMessageId:'aabbccdd11223344',
  reason:'Provider-confirmed send; duplicate send is blocked.'
});

assert.equal(workflow.classifySendIntentOutcome({
  status:'sent',sent:true,gmailMessageId:''
}).deliveryState,'uncertain','SENT without provider message ID is uncertain');

assert.equal(workflow.classifySendIntentOutcome({
  status:'uncertain',doNotRetry:true
}).allowsAutomaticResend,false);
assert.equal(workflow.classifySendIntentOutcome({
  status:'reserved'
}).mayAttemptSend,false,'Reserved intent must never auto-resend');

assert.equal(workflow.classifySendIntentOutcome({
  status:'not_attempted',explicitApproval:false,
  confirmation:'SEND THIS EMAIL',ownerReviewed:true,
  approvalBindingValid:true
}).mayAttemptSend,false);

// Missing/empty/none ledger status must never arm a send, even with approval.
const approvedClassify={
  explicitApproval:true,confirmation:'SEND THIS EMAIL',
  ownerReviewed:true,approvalBindingValid:true
};
assert.equal(workflow.classifySendIntentOutcome({
  ...approvedClassify
}).mayAttemptSend,false,'Absent status cannot authorize send');
assert.equal(workflow.classifySendIntentOutcome({
  ...approvedClassify,status:''
}).mayAttemptSend,false,'Empty status cannot authorize send');
assert.equal(workflow.classifySendIntentOutcome({
  ...approvedClassify,status:'none'
}).mayAttemptSend,false,'none status cannot authorize send');
assert.equal(workflow.classifySendIntentOutcome({
  ...approvedClassify,status:'not_attempted'
}).mayAttemptSend,true,'Explicit not_attempted may authorize one send');

const approvedAttempt={
  phase:'approved_for_manual_copy',
  confirmation:'SEND THIS EMAIL',ownerReviewed:true,
  approvalBinding:binding,currentEvidence:current
};
assert.equal(workflow.sendAttemptAllowed({
  ...approvedAttempt,statusRecord:undefined
}),false,'Absent send ledger record blocks send');
assert.equal(workflow.sendAttemptAllowed({
  ...approvedAttempt,statusRecord:null
}),false,'Null send ledger record blocks send');
assert.equal(workflow.sendAttemptAllowed({
  ...approvedAttempt,statusRecord:{}
}),false,'Record without status field blocks send');
assert.equal(workflow.sendAttemptAllowed({
  ...approvedAttempt,statusRecord:{doNotRetry:false}
}),false,'Missing status property blocks send');
assert.equal(workflow.sendAttemptAllowed({
  ...approvedAttempt,statusRecord:{status:'',doNotRetry:false}
}),false,'Empty status blocks send');
assert.equal(workflow.sendAttemptAllowed({
  ...approvedAttempt,statusRecord:{status:null,doNotRetry:false}
}),false,'Null status blocks send');
assert.equal(workflow.sendAttemptAllowed({
  ...approvedAttempt,statusRecord:{status:'none',doNotRetry:false}
}),false,'none status blocks send');
assert.equal(workflow.sendAttemptAllowed({
  ...approvedAttempt,statusRecord:{status:'unknown',doNotRetry:false}
}),false,'Unrecognized status blocks send');
assert.equal(workflow.sendAttemptAllowed({
  ...approvedAttempt,statusRecord:{status:'not_attempted',doNotRetry:false}
}),true,'Explicit not_attempted with valid approval may send once');

// Changed recipient / revision / inbound invalidate approval and block send.
assert.equal(workflow.approvalBindingValid(binding,{
  ...current,recipientEmail:'other@example.com'
}),false);
assert.match(workflow.staleApprovalReason(binding,{
  ...current,recipientEmail:'other@example.com'
}),/recipient/i);
assert.equal(workflow.sendAttemptAllowed({
  phase:'approved_for_manual_copy',
  statusRecord:{status:'not_attempted',doNotRetry:false},
  confirmation:'SEND THIS EMAIL',ownerReviewed:true,
  approvalBinding:binding,
  currentEvidence:{...current,recipientEmail:'other@example.com'}
}),false,'Changed recipient blocks send');

const revisedDigest=createHash('sha256').update('subject|revised').digest('hex');
assert.equal(workflow.sendAttemptAllowed({
  phase:'approved_for_manual_copy',
  statusRecord:{status:'not_attempted',doNotRetry:false},
  confirmation:'SEND THIS EMAIL',ownerReviewed:true,
  approvalBinding:binding,
  currentEvidence:{...current,draftDigest:revisedDigest}
}),false,'Changed draft revision blocks send');

const newerAt='2026-11-25T16:00:00.000Z';
const newerInbound=workflow.deterministicInboundDigest({
  at:newerAt,direction:'inbound',excerpt:'Also need a second table.',
  senderDomain:'example.com',relationshipHint:'unclassified',
  truncated:false,hasAttachments:false,messageId:'1122334455667788'
});
assert.equal(workflow.sendAttemptAllowed({
  phase:'approved_for_manual_copy',
  statusRecord:{status:'not_attempted',doNotRetry:false},
  confirmation:'SEND THIS EMAIL',ownerReviewed:true,
  approvalBinding:binding,
  currentEvidence:{
    ...current,lastMessageAt:newerAt,
    inboundProviderMessageId:'1122334455667788',
    inboundEvidenceDigest:newerInbound
  }
}),false,'Newer inbound blocks stale approved send');

assert.equal(workflow.sendAttemptAllowed({
  phase:'approved_for_manual_copy',
  statusRecord:{status:'uncertain',doNotRetry:true},
  confirmation:'SEND THIS EMAIL',ownerReviewed:true,
  approvalBinding:binding,currentEvidence:current
}),false,'Uncertain delivery cannot be retried');

assert.equal(workflow.sendAttemptAllowed({
  phase:'approved_for_manual_copy',
  statusRecord:{status:'sent',doNotRetry:true,gmailMessageId:'aabbccdd11223344'},
  confirmation:'SEND THIS EMAIL',ownerReviewed:true,
  approvalBinding:binding,currentEvidence:current
}),false,'Confirmed success cannot be resent');

// Busy lock must be claimed before the first await in sendApproved.
const sendApprovedStart=ui.indexOf('async function sendApproved');
const sendApprovedSlice=ui.slice(sendApprovedStart,sendApprovedStart+1800);
assert.match(sendApprovedSlice,/working=t\.threadId;onUpdate\(\);\s*try \{\s*const exact=await fingerprint/);
assert.ok(
  sendApprovedSlice.search(/working=t\.threadId;onUpdate\(\);\s*try \{\s*const exact=await fingerprint/)<
    sendApprovedSlice.indexOf('await getProtected'),
  'sendApproved sets busy lock synchronously before fingerprint/send awaits');

// --- Client duplicate approval / double-click / clipboard / refresh ---
globalThis.window={crypto:webcrypto};
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
globalThis.document={createElement:tag=>new Node(tag),
  createTextNode:t=>new Node('text','',t)};
const makeText=(tag,cls,text)=>new Node(tag,cls,text);
const find=(node,predicate)=>{
  if(predicate(node))return node;
  for(const child of node.children||[]){
    const hit=find(child,predicate);
    if(hit)return hit;
  }
  return null;
};
const button=(root,label)=>find(root,x=>x.tag==='button'&&x.textContent===label);
const dt=new Date(Date.now()-3600_000).toISOString();
const meta={
  threadId:'aabbccddeeff0011',lastMessageAt:dt,
  lastDirection:'inbound',relationshipHint:'unclassified',
  sourceType:'email_thread',subject:'Poker event pricing',
  mailboxIdentityVerified:true,mailbox:'book@pokertraininglasvegas.com'
};
const context={
  threadId:meta.threadId,lastMessageAt:dt,partial:false,totalMessages:1,
  messages:[{
    at:dt,direction:'inbound',relationshipHint:'unclassified',
    excerpt:'Can you send pricing for our corporate poker event?',
    senderDomain:'example.com',truncated:false,hasAttachments:false,
    messageId:'aabbccddeeff0011'
  }],
  mailboxIdentityVerified:true,mailbox:'book@pokertraininglasvegas.com',
  source:'owner_selected_read_only_thread_review'
};
const {qualifyThread}=require('../public/sms-review/reply-qualification.js');
const q=qualifyThread(meta,context);
assert.equal(q.outcome,'reply_candidate');

const settle=async()=>new Promise(resolve=>setImmediate(resolve));
const wait=async(test,label)=>{
  for(let i=0;i<50&&!test();i++)
    await new Promise(resolve=>setTimeout(resolve,8));
  assert(test(),label);
};

await (async()=>{
  const audits=[];
  const sends=[];
  let sendGate=Promise.resolve();
  let releaseSend=()=>{};
  const holdSend=()=>{
    sendGate=new Promise(resolve=>{releaseSend=resolve;});
  };
  const fetchMock=async(url,opts={})=>{
    if(url.includes('/reply-decisions?'))
      return {ok:true,source:'append_only_owner_reply_audit',
        decision:null,lastMessageAt:null,draftDigest:null};
    if(url==='/api/sms/staging/reply-decisions'&&opts.body){
      audits.push(opts.body);
      return {ok:true,saved:1,audited:true,
        source:'append_only_owner_reply_audit',
        decision:opts.body.decision,recordedAt:new Date().toISOString()};
    }
    if(url.includes('/reply-recipient?'))
      return {ok:true,source:'owner_selected_verified_recipient',
        threadId:meta.threadId,lastMessageAt:dt,
        from:'book@pokertraininglasvegas.com',
        to:'potential.client@example.com',subject:'Poker event pricing',
        sendEnabled:true};
    if(url.includes('/reply-send?'))
      return {ok:true,source:'lvpt_deduplicated_send_status',
        status:sends.some(s=>s.confirmed)?'sent':'not_attempted',
        doNotRetry:sends.some(s=>s.confirmed),
        gmailMessageId:sends.some(s=>s.confirmed)?'aabbccddeeff0123':null};
    if(url==='/api/sms/staging/reply-send'&&opts.body){
      await sendGate;
      // Durable uniqueness: only the first claim confirms a provider send.
      if(sends.some(s=>s.confirmed)){
        sends.push({...opts.body,confirmed:false,duplicate:true});
        return {ok:false,reason:'duplicate_send_intent_exists',doNotRetry:true};
      }
      sends.push({...opts.body,confirmed:true});
      return {ok:true,sent:true,source:'lvpt_explicit_owner_send',
        gmailMessageId:'aabbccddeeff0123',threadId:meta.threadId,doNotRetry:true};
    }
    if(url.includes('/inbox-thread?'))return {...context,ok:true};
    throw Error('Unexpected URL '+url);
  };

  const next=[];
  const c=controls.createController({
    getProtected:fetchMock,makeText,qualification:{},workflow,
    onUpdate:()=>{},onNext:id=>next.push(id)
  });
  const render=()=>{const root=new Node('div');c.render(root,meta,context,q);return root;};
  const written=workflow.draftStarter(meta).body.replace(/\[[^\]]+\]/g,
    'Our two-hour private experience starts with training, followed by live play. I can confirm availability and an exact quote with your event date and group size.');

  await c.loadAudit(meta);
  let root=render();
  const verify=find(root,x=>x.tag==='input'&&x.type==='checkbox');
  verify.checked=true;verify.trigger('change');
  button(root,'Prepare editable reply').trigger('click');
  await wait(()=>audits.length===1,'prepare audit');

  root=render();
  find(root,x=>x.tag==='textarea').value=written;
  find(root,x=>x.tag==='textarea').trigger('input');
  button(root,'Verify recipient and send status (read-only)').trigger('click');
  await settle();await settle();
  root=render();
  find(root,x=>x.tag==='textarea').value=written;
  find(root,x=>x.tag==='textarea').trigger('input');
  const approve=button(root,'Approve for manual copy');
  approve.trigger('click');
  approve.trigger('click');
  await wait(()=>audits.filter(a=>a.decision==='approved_for_manual_copy').length>=1,
    'approval recorded');
  await settle();await settle();
  assert.equal(sends.length,0,'Duplicate APPROVE never sends');
  assert.equal(
    audits.filter(a=>a.decision==='approved_for_manual_copy').length,1,
    'Duplicate approval click records one approved decision');

  root=render();
  button(root,'Verify recipient and send status (read-only)').trigger('click');
  await settle();await settle();
  root=render();
  const review=find(root,x=>x.tag==='input'&&x.type==='checkbox'&&
    x.id.startsWith('step48-send-confirm-'));
  const phrase=find(root,x=>x.tag==='input'&&
    x.attrs['aria-label']==='Step 48 explicit send confirmation');
  const sendButton=button(root,'Send this approved reply');
  assert(sendButton&&review&&phrase);
  review.checked=true;review.trigger('change');
  phrase.value='SEND THIS EMAIL';phrase.trigger('input');
  assert(!sendButton.disabled);

  // Double-click while the provider call is held open. Busy lock claimed
  // before the first await must suppress the second client POST entirely;
  // durable uniqueness remains the server-side backstop.
  holdSend();
  sendButton.trigger('click');
  sendButton.trigger('click');
  await settle();
  releaseSend();
  await wait(()=>sends.some(s=>s.confirmed),'confirmed send');
  await settle();await settle();
  assert.equal(sends.length,1,'Double click must not create a second send POST');
  assert.equal(sends.filter(s=>s.confirmed).length,1,
    'Exactly one confirmed provider send under double click');
  assert.deepEqual(next,[meta.threadId]);
  assert.equal(c.handledThisSession(meta),'sent');

  // After success, another explicit click cannot arm a new send UI.
  root=render();
  assert(!button(root,'Send this approved reply'),
    'Confirmed send removes the send control');

  // Refresh: durable status remains doNotRetry; no new send POST.
  const refreshedSends=[];
  const refreshed=controls.createController({
    getProtected:async(url,opts={})=>{
      if(url.includes('/reply-decisions?'))
        return {ok:true,source:'append_only_owner_reply_audit',
          decision:'approved_for_manual_copy',lastMessageAt:dt,draftDigest:digest};
      if(url.includes('/reply-recipient?'))
        return {ok:true,source:'owner_selected_verified_recipient',
          threadId:meta.threadId,lastMessageAt:dt,
          from:'book@pokertraininglasvegas.com',
          to:'potential.client@example.com',subject:'Poker event pricing',
          sendEnabled:true};
      if(url.includes('/reply-send?'))
        return {ok:true,source:'lvpt_deduplicated_send_status',
          status:'sent',doNotRetry:true,gmailMessageId:'aabbccddeeff0123'};
      if(url==='/api/sms/staging/reply-send'&&opts.body){
        refreshedSends.push(opts.body);
        return {ok:false,reason:'duplicate_send_intent_exists',doNotRetry:true};
      }
      return {ok:true};
    },
    makeText,qualification:{},workflow,onUpdate:()=>{},onNext:()=>{}
  });
  await refreshed.loadAudit(meta);
  const refreshRoot=new Node('div');
  refreshed.render(refreshRoot,meta,context,q);
  assert.equal(refreshedSends.length,0,'Refresh must not POST a new send intent');
  assert.equal(workflow.classifySendIntentOutcome({
    status:'sent',sent:true,gmailMessageId:'aabbccddeeff0123'
  }).mayAttemptSend,false);

  // Clipboard path remains copied_not_sent — never provider SENT.
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{clipboard:{
    writeText:async()=>{}
  }}});
  const copyPosts=[];
  const copyCtrl=controls.createController({
    getProtected:async(url,opts={})=>{
      if(url.includes('/reply-decisions?'))
        return {ok:true,source:'append_only_owner_reply_audit',
          decision:null,lastMessageAt:null,draftDigest:null};
      if(url==='/api/sms/staging/reply-decisions'&&opts.body)
        return {ok:true,saved:1,audited:true,source:'append_only_owner_reply_audit',
          decision:opts.body.decision,recordedAt:new Date().toISOString()};
      if(url.includes('/reply-recipient?'))
        return {ok:true,source:'owner_selected_verified_recipient',
          threadId:meta.threadId,lastMessageAt:dt,
          from:'book@pokertraininglasvegas.com',
          to:'potential.client@example.com',subject:'Poker event pricing',
          sendEnabled:false};
      if(url.includes('/reply-send?'))
        return {ok:true,source:'lvpt_deduplicated_send_status',
          status:'not_attempted',doNotRetry:false};
      if(url==='/api/sms/staging/reply-send'&&opts.body){
        copyPosts.push(opts.body);
        throw Error('send must not run during clipboard copy');
      }
      if(url.includes('/inbox-thread?'))return {...context,ok:true};
      return {ok:true};
    },
    makeText,qualification:{},workflow,onUpdate:()=>{},onNext:()=>{}
  });
  await copyCtrl.loadAudit(meta);
  let copyRoot=new Node('div');copyCtrl.render(copyRoot,meta,context,q);
  find(copyRoot,x=>x.tag==='input'&&x.type==='checkbox').checked=true;
  find(copyRoot,x=>x.tag==='input'&&x.type==='checkbox').trigger('change');
  button(copyRoot,'Prepare editable reply').trigger('click');
  await wait(()=>copyCtrl.getActive()?.phase==='prepared','copy prepare');
  copyRoot=new Node('div');copyCtrl.render(copyRoot,meta,context,q);
  find(copyRoot,x=>x.tag==='textarea').value=written;
  find(copyRoot,x=>x.tag==='textarea').trigger('input');
  button(copyRoot,'Verify recipient and send status (read-only)').trigger('click');
  await settle();await settle();
  copyRoot=new Node('div');copyCtrl.render(copyRoot,meta,context,q);
  find(copyRoot,x=>x.tag==='textarea').value=written;
  find(copyRoot,x=>x.tag==='textarea').trigger('input');
  button(copyRoot,'Approve for manual copy').trigger('click');
  await wait(()=>copyCtrl.getActive()?.phase==='approved_for_manual_copy','copy approve');
  copyRoot=new Node('div');copyCtrl.render(copyRoot,meta,context,q);
  button(copyRoot,'Copy approved text and continue').trigger('click');
  await wait(()=>copyCtrl.handledThisSession(meta)==='copied_not_sent','clipboard finish');
  assert.equal(copyPosts.length,0,'Clipboard path never posts reply-send');
  assert.equal(
    workflow.classifySendIntentOutcome({kind:copyCtrl.handledThisSession(meta)}).sent,
    false);
})();

console.log('R13 / T24 approval idempotency: duplicate approval, double-click, refresh, uncertain/retry gates, provider SENT identity, clipboard-not-sent, recipient/revision/inbound invalidation, and disabled production/automation checks passed.');
