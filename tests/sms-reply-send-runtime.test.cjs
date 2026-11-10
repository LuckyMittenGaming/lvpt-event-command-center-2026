'use strict';
// Step 50 isolated POST-route simulation. All Gmail, Supabase, session and
// network calls are synthetic in memory; NEVER hit a real email service.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const {createHash}=require('node:crypto');
const file=fs.readFileSync('app/api/sms/staging/reply-send/route.ts','utf8');
const js=ts.transpileModule(file,{compilerOptions:{
  module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022
}}).outputText;
const at=new Date(Date.now()-3600_000).toISOString();
const threadId='aabbccddeeff0011';
const intentId='014162c7-5ebc-49ba-a314-e43932e0c185';
const recipient='client@example.com';
const subject='Re: Your Las Vegas poker event';
const body='Hi, thanks for your inquiry. Please confirm your date and group size so I can send a tailored plan. Thanks again, Matt.';
const digest=createHash('sha256').update(JSON.stringify([subject,body])).digest('hex');
const baseline={
  intentId,threadId,lastMessageAt:at,recipient,subject,body,
  confirmation:'SEND THIS EMAIL',ownerReviewed:true
};
const record={
  decision:'approved_for_manual_copy',
  last_message_at:at,
  draft_digest:digest,
  owner_reviewed_full_thread:true,
  recorded_at:new Date(Date.now()-60000).toISOString()
};
function json(value,status=200){
  return new Response(JSON.stringify(value),{
    status,headers:{'content-type':'application/json'}
  });
}
function harness(options={}){
  const seen={requests:[],apps:[],reservations:[],patches:[],gated:false};
  const mod={exports:{}};
  const env={LVPT_ENABLE_OWNER_APPROVED_GMAIL_SEND:
    options.off?'false':'true',VERCEL_ENV:options.production?'production':'preview'};
  const verified={
    ok:true,source:'verified_lvpt_gmail_reply_recipient',
    mailboxIdentityVerified:true,sendingEnabled:true,
    threadId,lastMessageAt:at,recipient,subject
  };
  const appsScriptRequest=async(action,args)=>{
    seen.apps.push({action,args});
    if(action==='verifyBusinessReplyRecipient')
      return {...verified,...options.verified};
    if(action==='sendOwnerApprovedGmailReply') {
      if(options.sendThrows)throw Error('Synthetic uncertain Gmail response');
      return {
        ok:true,source:'lvpt_owner_approved_gmail_send',
        mailboxIdentityVerified:true,threadId,
        gmailMessageId:'aabbccdd11223344',
        ...options.sendResponse
      };
    }
    throw Error('Unexpected source action: '+action);
  };
  const fetchMock=async(url,init={})=>{
    const name=String(url);
    const method=String(init.method||'GET');
    seen.requests.push({name,method});
    if(name.includes('lvpt_reply_review_audit?'))
      return json(options.noApproval?[]:[{...record,...options.approval}]);
    if(name.includes('lvpt_reply_send_intents')) {
      if(method==='POST'){
        seen.reservations.push(JSON.parse(init.body));
        if(options.duplicate)return json({code:'23505'},409);
        return json([JSON.parse(init.body)]);
      }
      if(method==='PATCH') {
        const data=JSON.parse(init.body);
        seen.patches.push(data);
        if(options.unconfirmedAudit)return json([]);
        return json([{
          intent_id:intentId,thread_id:threadId,status:data.status,
          gmail_message_id:data.gmail_message_id
        }]);
      }
      return json([]);
    }
    throw Error('Unexpected mock URL: '+name);
  };
  const source={
    '../_lib':{
      jsonNoStore:json,ready:()=>true,
      supabaseEndpoint:p=>'https://mocked.invalid/'+p,
      supabaseHeaders:()=>({})
    },
    '../_review-auth':{
      allowedReviewMutation:()=>!options.badOrigin,
      hasReviewSession:()=>!options.unauthorized
    },
    '../../../sync/_lib':{
      appsScriptRequest,syncConfigured:()=>true
    }
  };
  const sandbox={
    module:mod,exports:mod.exports,
    require:p=>p==='node:crypto'?require('node:crypto'):
      Object.hasOwn(source,p)?source[p]:(()=>{throw Error('Unexpected import '+p)})(),
    process:{env},fetch:fetchMock,
    Request,Response,Buffer,URL,URLSearchParams,AbortSignal,Date,console
  };
  vm.runInNewContext(js,sandbox,{filename:'reply-send.mock.cjs',timeout:1000});
  const post=async(payload=baseline)=>{
    const request=new Request('https://staging.invalid/api/sms/staging/reply-send',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify(payload)
    });
    const response=await mod.exports.POST(request);
    return {status:response.status,json:await response.json()};
  };
  return {seen,post};
}
(async()=>{
  let h=harness({production:true});
  let x=await h.post();
  assert.equal(x.status,403);
  assert.equal(x.json.reason,'staging_only_no_production_send');
  assert.equal(h.seen.apps.length,0);
  assert.equal(h.seen.requests.length,0);
  h=harness({off:true});
  x=await h.post();
  assert.equal(x.status,403);
  assert.equal(x.json.reason,'live_gmail_sending_disabled');
  assert.equal(h.seen.apps.length,0);
  assert.equal(h.seen.requests.length,0);
  h=harness({unauthorized:true});
  x=await h.post();
  assert.equal(x.status,401);
  assert.equal(h.seen.apps.length,0);
  h=harness({badOrigin:true});
  x=await h.post();
  assert.equal(x.status,403);
  assert.equal(h.seen.apps.length,0);
  h=harness();
  x=await h.post({...baseline,confirmation:'maybe'});
  assert.equal(x.status,400,'Explicit owner confirmation is mandatory');
  assert.equal(h.seen.apps.length,0);
  h=harness({noApproval:true});
  x=await h.post();
  assert.equal(x.status,409,'Missing approval blocks Gmail');
  assert.equal(h.seen.apps.length,0);
  h=harness({approval:{owner_reviewed_full_thread:false}});
  x=await h.post();
  assert.equal(x.status,409,'Complete original thread attestation mandatory');
  assert.equal(h.seen.apps.length,0);
  h=harness();
  x=await h.post({...baseline,body:body+' An extra paragraph.'});
  assert.equal(x.status,409,'An altered draft must be reapproved');
  assert.equal(h.seen.apps.length,0);
  h=harness({verified:{recipient:'different@example.com'}});
  x=await h.post();
  assert.equal(x.status,409,'Recipient mismatch cannot be sent');
  assert(!h.seen.apps.some(v=>v.action==='sendOwnerApprovedGmailReply'));
  h=harness({verified:{sendingEnabled:false}});
  x=await h.post();
  assert.equal(x.status,409,'GAS sending gate must be enabled separately');
  h=harness({duplicate:true});
  x=await h.post();
  assert.equal(x.status,409);
  assert.equal(x.json.reason,'duplicate_send_intent_exists');
  assert.equal(x.json.doNotRetry,true);
  assert(!h.seen.apps.some(v=>v.action==='sendOwnerApprovedGmailReply'));
  h=harness();
  x=await h.post();
  assert.equal(x.status,200,'Single explicitly approved mock send');
  assert.equal(x.json.sent,true);
  assert.equal(x.json.auditConfirmed,true);
  assert.equal(h.seen.reservations.length,1);
  assert.equal(h.seen.patches.length,1);
  assert.equal(h.seen.patches[0].status,'sent');
  assert.equal(h.seen.apps.filter(v=>v.action==='sendOwnerApprovedGmailReply').length,1);
  const reserve=h.seen.reservations[0];
  assert(!Object.hasOwn(reserve,'recipient'));
  assert(!Object.hasOwn(reserve,'body'));
  assert(!Object.hasOwn(reserve,'subject'));
  assert.match(reserve.recipient_hash,/^[a-f0-9]{64}$/);
  h=harness({unconfirmedAudit:true});
  x=await h.post();
  assert.equal(x.status,502,'Cannot claim complete success when audit update fails');
  assert.equal(x.json.sent,true,'Warn that Gmail may have accepted the email');
  assert.equal(x.json.auditConfirmed,false);
  assert.equal(x.json.doNotRetry,true);
  assert.equal(h.seen.apps.filter(v=>v.action==='sendOwnerApprovedGmailReply').length,1);
  h=harness({sendThrows:true});
  x=await h.post();
  assert.equal(x.status,502);
  assert.equal(x.json.reason,'send_outcome_uncertain_check_gmail_sent');
  assert.equal(x.json.doNotRetry,true);
  assert.equal(h.seen.patches.length,1);
  assert.equal(h.seen.patches[0].status,'uncertain');
  console.log('Step 50: 13 synthetic auth, opt-in, digest, recipient, duplicate, send-ack and audit-reconciliation scenarios passed. No external requests.');
})().catch(error=>{console.error(error);process.exitCode=1;});
