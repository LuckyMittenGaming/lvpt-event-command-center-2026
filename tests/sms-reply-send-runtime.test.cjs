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
const body='Hi, thanks for your inquiry. Please confirm your date and group size so I can send a tailored plan.\n\nThanks,\n\nMatt Carpenter\nEvent & Talent Manager\nLas Vegas Poker Training\n616-745-7148';
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
  // Durable uniqueness by thread + inbound revision (mirrors SQL unique key).
  const intentLedger=options.sharedLedger||new Map();
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
      if(typeof options.sendDelayMs==='number'&&options.sendDelayMs>0)
        await new Promise(resolve=>setTimeout(resolve,options.sendDelayMs));
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
        const body=JSON.parse(init.body);
        seen.reservations.push(body);
        const key=String(body.thread_id)+'|'+String(body.last_message_at);
        if(options.duplicate||intentLedger.has(key))
          return json({code:'23505'},409);
        const row={
          ...body,status:'reserved',reserved_at:new Date().toISOString(),
          gmail_message_id:null,completed_at:null
        };
        intentLedger.set(key,row);
        return json([row]);
      }
      if(method==='PATCH') {
        const data=JSON.parse(init.body);
        seen.patches.push(data);
        if(options.unconfirmedAudit)return json([]);
        const lookup=new URL(name.includes('://')?name:'https://mocked.invalid/'+name);
        const patchIntent=String(lookup.searchParams.get('intent_id')||'')
          .replace(/^eq\./,'')||intentId;
        const intentKey=[...intentLedger.entries()]
          .find(([,row])=>row.intent_id===patchIntent);
        const key=intentKey?intentKey[0]:(threadId+'|'+at);
        const prior=intentLedger.get(key)||{intent_id:patchIntent,thread_id:threadId};
        const row={
          ...prior,intent_id:patchIntent,status:data.status,
          gmail_message_id:data.gmail_message_id||null,
          completed_at:new Date().toISOString()
        };
        intentLedger.set(key,row);
        return json([{
          intent_id:row.intent_id,thread_id:row.thread_id,status:row.status,
          gmail_message_id:row.gmail_message_id
        }]);
      }
      // GET status lookup by thread + revision.
      const lookup=new URL(name.includes('://')?name:'https://mocked.invalid/'+name);
      const threadEq=String(lookup.searchParams.get('thread_id')||'')
        .replace(/^eq\./,'');
      const atEq=String(lookup.searchParams.get('last_message_at')||'')
        .replace(/^eq\./,'');
      const key=threadEq+'|'+atEq;
      const row=intentLedger.get(key);
      return json(row?[row]:[]);
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
    },
    '../_inbox-routing':{
      isDocumentWorkflowNotice:(domain,subject)=>
        /(?:^|\.)docusign\.net$/i.test(String(domain||'')),
      isBizlyMailServiceDomain:domain=>
        /(?:^|\.)bizlyapp\.com$/i.test(String(domain||'')),
      isVerifiedTalentEmail:address=>
        String(address||'').toLowerCase()==='kennajamespoker@gmail.com'
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
  const get=async(query={threadId,lastMessageAt:at})=>{
    const params=new URLSearchParams(query);
    const request=new Request(
      'https://staging.invalid/api/sms/staging/reply-send?'+params,{method:'GET'});
    const response=await mod.exports.GET(request);
    return {status:response.status,json:await response.json()};
  };
  return {seen,post,get,intentLedger};
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
  h=harness();
  x=await h.post({...baseline,body:'Hi, thanks for your inquiry. Please confirm your date and group size so I can send a tailored plan.'});
  assert.equal(x.status,400,'Missing full LVPT business signature must block any send');
  assert.equal(h.seen.apps.length,0);
  assert.equal(h.seen.reservations.length,0);
  h=harness({noApproval:true});
  x=await h.post();
  assert.equal(x.status,409,'Missing approval blocks Gmail');
  assert.equal(h.seen.apps.length,0);
  h=harness({approval:{owner_reviewed_full_thread:false}});
  x=await h.post();
  assert.equal(x.status,409,'Complete original thread attestation mandatory');
  assert.equal(h.seen.apps.length,0);
  h=harness();
  x=await h.post({...baseline,body:body.replace('Please confirm','Kindly confirm')});
  assert.equal(x.status,409,'An altered draft must be reapproved');
  assert.equal(h.seen.apps.length,0);
  h=harness({verified:{recipient:'different@example.com'}});
  x=await h.post();
  assert.equal(x.status,409,'Recipient mismatch cannot be sent');
  assert(!h.seen.apps.some(v=>v.action==='sendOwnerApprovedGmailReply'));
  h=harness({verified:{recipient:'kennajamespoker@gmail.com',
    subject:'Re: Talent schedule for upcoming seminar'}});
  x=await h.post({...baseline,recipient:'kennajamespoker@gmail.com'});
  assert.equal(x.status,409,'Verified talent sender must never receive a customer sales reply');
  assert.equal(x.json.reason,'verified_talent_not_customer');
  assert.equal(h.seen.reservations.length,0);
  assert(!h.seen.apps.some(v=>v.action==='sendOwnerApprovedGmailReply'));
  h=harness({verified:{recipient:'team@b.bizlyapp.com',
    subject:'New Contact Form Submission from Customer'}});
  x=await h.post({...baseline,recipient:'team@b.bizlyapp.com'});
  assert.equal(x.status,409,'Bizly form-service sender must never receive customer reply');
  assert.equal(x.json.reason,'form_service_sender_not_client');
  assert.equal(h.seen.reservations.length,0);
  assert(!h.seen.apps.some(v=>v.action==='sendOwnerApprovedGmailReply'));
  h=harness({verified:{recipient:'notice@docusign.net',
    subject:'Complete with Docusign: Please sign your document'}});
  x=await h.post({...baseline,recipient:'notice@docusign.net'});
  assert.equal(x.status,409,'DocuSign notification must never reach Gmail send');
  assert.equal(x.json.reason,'operational_notice_not_a_client_reply');
  assert.equal(h.seen.reservations.length,0);
  assert(!h.seen.apps.some(v=>v.action==='sendOwnerApprovedGmailReply'));
  h=harness({verified:{sendingEnabled:false}});
  x=await h.post();
  assert.equal(x.status,409,'GAS sending gate must be enabled separately');
  h=harness({verified:{subject:'Re: A completely different Gmail thread'}});
  x=await h.post();
  assert.equal(x.status,409,'Edited subject must be rejected before creating any send intent');
  assert.equal(x.json.reason,'subject_must_match_verified_gmail_thread');
  assert.equal(h.seen.reservations.length,0,
    'A mismatched subject must not consume the permanent one-time send reservation');
  assert(!h.seen.apps.some(v=>v.action==='sendOwnerApprovedGmailReply'));
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

  // Provider failure without throw: ok:false → uncertain, never automatic resend.
  h=harness({sendResponse:{ok:false}});
  x=await h.post();
  assert.equal(x.status,502);
  assert.equal(x.json.reason,'send_outcome_uncertain_check_gmail_sent');
  assert.equal(x.json.doNotRetry,true);
  assert.equal(h.seen.patches[0].status,'uncertain');
  assert.equal(h.seen.apps.filter(v=>v.action==='sendOwnerApprovedGmailReply').length,1);

  // Missing provider message identity cannot be treated as SENT.
  h=harness({sendResponse:{gmailMessageId:''}});
  x=await h.post();
  assert.equal(x.status,502);
  assert.equal(x.json.doNotRetry,true);
  assert.equal(h.seen.patches[0].status,'uncertain');

  // Concurrent duplicate intents: durable uniqueness allows exactly one send.
  const sharedLedger=new Map();
  const first=harness({sharedLedger,sendDelayMs:25});
  const second=harness({sharedLedger});
  const [a,b]=await Promise.all([
    first.post(),
    second.post({...baseline,intentId:'124162c7-5ebc-49ba-a314-e43932e0c185'})
  ]);
  const outcomes=[a,b].sort((l,r)=>l.status-r.status);
  assert.equal(outcomes[0].status,200,'One concurrent attempt may confirm send');
  assert.equal(outcomes[0].json.sent,true);
  assert.equal(outcomes[0].json.gmailMessageId,'aabbccdd11223344');
  assert.equal(outcomes[1].status,409,'Peer concurrent attempt is rejected');
  assert.equal(outcomes[1].json.reason,'duplicate_send_intent_exists');
  assert.equal(outcomes[1].json.doNotRetry,true);
  const sendCalls=first.seen.apps.filter(v=>v.action==='sendOwnerApprovedGmailReply')
    .concat(second.seen.apps.filter(v=>v.action==='sendOwnerApprovedGmailReply'));
  assert.equal(sendCalls.length,1,'Exactly one provider send under concurrency');

  // After uncertain/timeout reservation, status lookup forbids retry.
  h=harness({sendThrows:true});
  x=await h.post();
  assert.equal(x.status,502);
  assert.equal(x.json.doNotRetry,true);
  const status=await h.get();
  assert.equal(status.status,200);
  assert.equal(status.json.status,'uncertain');
  assert.equal(status.json.doNotRetry,true);
  assert.equal(status.json.noAutomaticSend,true);
  const retry=await h.post({...baseline,intentId:'134162c7-5ebc-49ba-a314-e43932e0c185'});
  assert.equal(retry.status,409,'Retry after uncertain outcome stays blocked');
  assert.equal(retry.json.reason,'duplicate_send_intent_exists');
  assert.equal(retry.json.doNotRetry,true);
  assert.equal(h.seen.apps.filter(v=>v.action==='sendOwnerApprovedGmailReply').length,1,
    'Uncertain outcome must never trigger a second provider send');

  // Refresh-safe GET for a confirmed send keeps doNotRetry and message ID.
  h=harness();
  x=await h.post();
  assert.equal(x.status,200);
  const refreshed=await h.get();
  assert.equal(refreshed.json.status,'sent');
  assert.equal(refreshed.json.gmailMessageId,'aabbccdd11223344');
  assert.equal(refreshed.json.doNotRetry,true);

  console.log('Step 54 / R13: synthetic auth, opt-in, digest, recipient, duplicate, concurrent, uncertain, timeout-retry, send-ack and audit-reconciliation scenarios passed. No external requests.');
})().catch(error=>{console.error(error);process.exitCode=1;});
