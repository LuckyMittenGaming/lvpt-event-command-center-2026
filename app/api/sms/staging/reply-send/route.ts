import { createHash, timingSafeEqual } from 'node:crypto';
import { jsonNoStore, ready, supabaseEndpoint, supabaseHeaders } from '../_lib';
import { allowedReviewMutation, hasReviewSession } from '../_review-auth';
import { appsScriptRequest, syncConfigured } from '../../../sync/_lib';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=45;

const TENANT='lvpt-owner-pilot';
const THREAD=/^[a-f0-9]{8,32}$/i;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA=/^[a-f0-9]{64}$/;
const EMAIL=/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;
const TABLE='lvpt_reply_send_intents';
type Approved={decision?:string;last_message_at?:string;draft_digest?:string;recorded_at?:string;owner_reviewed_full_thread?:boolean};
type Verified={ok?:boolean;source?:string;mailboxIdentityVerified?:boolean;
  threadId?:string;lastMessageAt?:string;recipient?:string;subject?:string;
  sendingEnabled?:boolean};
type Intent={intent_id:string;thread_id:string;status:string;gmail_message_id?:string|null};
type SendResult={ok?:boolean;source?:string;mailboxIdentityVerified?:boolean;
  gmailMessageId?:string;threadId?:string};
function normalizeTimestamp(value:unknown) {
  if(typeof value!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/.test(value))return '';
  const n=Date.parse(value);
  if(!Number.isFinite(n)||n>Date.now()+86400000||n<Date.now()-32*86400000)return '';
  return new Date(n).toISOString();
}
function timingSafeDigest(a:string,b:string) {
  if(!SHA.test(a)||!SHA.test(b))return false;
  return timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex'));
}
// Match the Gmail/Apps Script subject rule BEFORE claiming the one-time
// send reservation. Rejecting afterward could permanently lock an unsent reply.
function canonicalSubject(v:unknown) {
  return String(v||'').replace(/^(?:(?:re|fw|fwd):\s*)+/ig,'')
    .replace(/\s+/g,' ').trim().toLowerCase();
}
function inputValidation(v:Record<string,unknown>) {
  const threadId=String(v.threadId||'').toLowerCase();
  const lastMessageAt=normalizeTimestamp(v.lastMessageAt);
  const intentId=String(v.intentId||'').toLowerCase();
  const recipient=String(v.recipient||'').toLowerCase();
  // Preserve byte-for-byte approval digest. Do not trim after the owner
  // signed off on the exact subject and body (including trailing newlines).
  const subject=String(v.subject||'');
  const body=String(v.body||'');
  if(!THREAD.test(threadId)||!lastMessageAt||!UUID.test(intentId)||
    !EMAIL.test(recipient)||recipient.length>254||
    recipient==='book@pokertraininglasvegas.com'||
    subject.trim().length<5||subject.length>180||/[\r\n]/.test(subject)||
    body.trim().length<45||body.length>5000||
    /\[(?:write|insert|verify|confirm|add|recipient|date|price|time|venue)[^\]]*\]/i.test(body)||
    /\b(?:TODO|TBD|PLACEHOLDER)\b/i.test(body)||
    v.confirmation!=='SEND THIS EMAIL'||v.ownerReviewed!==true)
    return null;
  return {threadId,lastMessageAt,intentId,recipient,subject,body};
}
async function approvedDigest(threadId:string,lastAt:string) {
  const p=new URLSearchParams({
    select:'decision,last_message_at,draft_digest,recorded_at,owner_reviewed_full_thread',
    tenant_id:'eq.'+TENANT,thread_id:'eq.'+threadId,
    order:'recorded_at.desc,request_id.desc',limit:'1'
  });
  const r=await fetch(supabaseEndpoint('lvpt_reply_review_audit?'+p),{
    headers:supabaseHeaders(),cache:'no-store',signal:AbortSignal.timeout(12000)
  });
  if(!r.ok)throw Error('Owner approval audit unavailable');
  const rows=await r.json() as Approved[];
  if(!Array.isArray(rows)||rows.length>1)return '';
  const row=rows[0];
  const approvedAt=Date.parse(String(row?.recorded_at||''));
  if(row?.decision!=='approved_for_manual_copy'||
    row.owner_reviewed_full_thread!==true||
    normalizeTimestamp(row.last_message_at)!==lastAt||
    !Number.isFinite(approvedAt)||approvedAt>Date.now()+60000||
    approvedAt<Date.now()-24*3600000)return '';
  return SHA.test(row.draft_digest||'')?String(row.draft_digest):'';
}
async function claimIntent(p:{
  intentId:string;threadId:string;lastMessageAt:string;
  recipientHash:string;draftDigest:string
}) {
  // Permanent uniqueness by business thread + incoming-message revision.
  // A timed-out attempt stays reserved; we never retry automatically.
  const insert={
    intent_id:p.intentId,tenant_id:TENANT,thread_id:p.threadId,
    last_message_at:p.lastMessageAt,
    approved_digest:p.draftDigest,recipient_hash:p.recipientHash,
    status:'reserved'
  };
  const r=await fetch(supabaseEndpoint(TABLE),{
    method:'POST',
    headers:{...supabaseHeaders(),'Prefer':'return=representation'},
    body:JSON.stringify(insert),cache:'no-store',signal:AbortSignal.timeout(12000)
  });
  if(r.status===409)return false;
  if(!r.ok)throw Error('Send reservation unavailable');
  const rows=await r.json() as Intent[];
  if(!Array.isArray(rows)||rows.length!==1||
    rows[0].intent_id!==p.intentId)return false;
  return true;
}
async function markIntent(intentId:string,status:'sent'|'uncertain',messageId?:string) {
  const p=new URLSearchParams({intent_id:'eq.'+intentId,status:'eq.reserved'});
  const r=await fetch(supabaseEndpoint(TABLE+'?'+p),{
    method:'PATCH',
    headers:{...supabaseHeaders(),'Prefer':'return=representation'},
    body:JSON.stringify({
      status,gmail_message_id:status==='sent'?messageId||null:null,
      completed_at:new Date().toISOString()
    }),cache:'no-store',signal:AbortSignal.timeout(12000)
  });
  if(!r.ok)return false;
  const rows=await r.json().catch(()=>null) as Intent[]|null;
  return Array.isArray(rows)&&rows.length===1&&
    rows[0].intent_id===intentId&&rows[0].status===status;
}
export async function GET(request:Request) {
  if(!ready())return jsonNoStore({ok:false,reason:'staging_unconfigured'},503);
  if(!hasReviewSession(request))return jsonNoStore({ok:false,reason:'unauthorized'},401);
  const params=new URL(request.url).searchParams;
  const threadId=String(params.get('threadId')||'').toLowerCase();
  const lastMessageAt=normalizeTimestamp(params.get('lastMessageAt'));
  if(!THREAD.test(threadId)||!lastMessageAt)
    return jsonNoStore({ok:false,reason:'invalid_send_status_lookup'},400);
  try {
    const q=new URLSearchParams({
      select:'status,reserved_at,completed_at,gmail_message_id',
      tenant_id:'eq.'+TENANT,thread_id:'eq.'+threadId,
      last_message_at:'eq.'+lastMessageAt,limit:'1'
    });
    const r=await fetch(supabaseEndpoint(TABLE+'?'+q),{
      headers:supabaseHeaders(),cache:'no-store',signal:AbortSignal.timeout(12000)
    });
    if(!r.ok)throw Error('Not available');
    const rows=await r.json() as Array<{status:string;reserved_at?:string;completed_at?:string;gmail_message_id?:string}>;
    if(!Array.isArray(rows)||rows.length>1)throw Error('Unexpected audit result');
    const row=rows[0];
    return jsonNoStore({
      ok:true,source:'lvpt_deduplicated_send_status',
      status:row?.status||'not_attempted',
      reservedAt:row?.reserved_at||null,completedAt:row?.completed_at||null,
      gmailMessageId:row?.gmail_message_id||null,
      sendEnabled:process.env.LVPT_ENABLE_OWNER_APPROVED_GMAIL_SEND==='true',
      // Reserved or uncertain means STOP; never retry by clicking again.
      doNotRetry:Boolean(row),noAutomaticSend:true
    },200);
  }catch {
    return jsonNoStore({ok:false,reason:'send_status_unavailable'},503);
  }
}
export async function POST(request:Request) {
  // This is an experimental owner-pilot flow. Even a mistaken production
  // environment configuration cannot activate sending in the live app.
  if(process.env.VERCEL_ENV==='production')
    return jsonNoStore({ok:false,reason:'staging_only_no_production_send'},403);
  if(!allowedReviewMutation(request))return jsonNoStore({ok:false,reason:'same_origin_required'},403);
  if(!ready())return jsonNoStore({ok:false,reason:'staging_unconfigured'},503);
  if(!hasReviewSession(request))return jsonNoStore({ok:false,reason:'unauthorized'},401);
  // Safe opt-in: this is absent/false in existing Vercel environments.
  if(process.env.LVPT_ENABLE_OWNER_APPROVED_GMAIL_SEND!=='true')
    return jsonNoStore({ok:false,reason:'live_gmail_sending_disabled'},403);
  if(!syncConfigured())return jsonNoStore({ok:false,reason:'business_mail_source_unavailable'},503);
  if(!/^application\/json(?:;|$)/i.test(request.headers.get('content-type')||''))
    return jsonNoStore({ok:false,reason:'json_required'},415);
  if(Number(request.headers.get('content-length')||0)>12500)
    return jsonNoStore({ok:false,reason:'payload_too_large'},413);
  let claimed=false;
  let intentId='';
  try {
    const raw=await request.text();
    if(Buffer.byteLength(raw,'utf8')>12500)
      return jsonNoStore({ok:false,reason:'payload_too_large'},413);
    const payload=JSON.parse(raw) as Record<string,unknown>;
    const input=inputValidation(payload);
    if(!input)return jsonNoStore({ok:false,reason:'invalid_owner_send_request'},400);
    intentId=input.intentId;
    const digest=createHash('sha256').update(JSON.stringify([
      input.subject,input.body
    ])).digest('hex');
    const approved=await approvedDigest(input.threadId,input.lastMessageAt);
    if(!timingSafeDigest(digest,approved))
      return jsonNoStore({ok:false,reason:'draft_changed_or_owner_approval_expired'},409);
    const verified=await appsScriptRequest<Verified>('verifyBusinessReplyRecipient',{
      threadId:input.threadId,expectedLastMessageAt:input.lastMessageAt
    });
    if(verified?.ok!==true||verified.source!=='verified_lvpt_gmail_reply_recipient'||
      verified.mailboxIdentityVerified!==true||verified.sendingEnabled!==true||
      verified.threadId!==input.threadId||verified.lastMessageAt!==input.lastMessageAt||
      String(verified.recipient||'').toLowerCase()!==input.recipient)
      return jsonNoStore({ok:false,reason:'recipient_unverified_or_gas_send_disabled'},409);
    if(typeof verified.subject!=='string'||
       canonicalSubject(verified.subject)!==canonicalSubject(input.subject))
      return jsonNoStore({ok:false,reason:'subject_must_match_verified_gmail_thread'},409);
    // Never include client recipient or subject/body in the send ledger.
    const recipientHash=createHash('sha256').update(
      input.recipient+'|'+input.threadId).digest('hex');
    claimed=await claimIntent({
      intentId,threadId:input.threadId,lastMessageAt:input.lastMessageAt,
      recipientHash,draftDigest:digest
    });
    if(!claimed)
      return jsonNoStore({
        ok:false,reason:'duplicate_send_intent_exists',doNotRetry:true
      },409);
    // Exactly ONE Gmail send attempt. No retry even on transient failures.
    const response=await appsScriptRequest<SendResult>('sendOwnerApprovedGmailReply',{
      intentId,threadId:input.threadId,
      expectedLastMessageAt:input.lastMessageAt,recipient:input.recipient,
      subject:input.subject,body:input.body
    });
    if(response.ok!==true||response.source!=='lvpt_owner_approved_gmail_send'||
      response.mailboxIdentityVerified!==true||
      response.threadId!==input.threadId||!THREAD.test(String(response.gmailMessageId||'')))
      throw Error('Gmail send response uncertain');
    const logged=await markIntent(intentId,'sent',response.gmailMessageId);
    if(!logged) {
      // Gmail may already have accepted this message. Never imply that a
      // failed ledger reconciliation is a safely repeatable send.
      return jsonNoStore({
        ok:false,sent:true,auditConfirmed:false,
        reason:'gmail_accepted_audit_unconfirmed_check_sent',
        gmailMessageId:response.gmailMessageId,threadId:input.threadId,
        doNotRetry:true
      },502);
    }
    return jsonNoStore({
      ok:true,source:'lvpt_explicit_owner_send',
      sent:true,auditConfirmed:true,
      gmailMessageId:response.gmailMessageId,threadId:input.threadId,
      doNotRetry:true
    },200);
  }catch {
    if(claimed && intentId) {
      await markIntent(intentId,'uncertain').catch(()=>false);
      return jsonNoStore({
        ok:false,reason:'send_outcome_uncertain_check_gmail_sent',
        doNotRetry:true
      },502);
    }
    return jsonNoStore({ok:false,reason:'send_preflight_failed_no_send_attempt'},503);
  }
}
