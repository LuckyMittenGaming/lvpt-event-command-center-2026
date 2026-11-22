import { createHash } from 'node:crypto';
import { jsonNoStore, ready, supabaseEndpoint, supabaseHeaders } from '../_lib';
import { allowedReviewMutation, hasReviewSession } from '../_review-auth';
import { appsScriptRequest, syncConfigured } from '../../../sync/_lib';
import { isDocumentWorkflowNotice, isBizlyMailServiceDomain } from '../_inbox-routing';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=45;

// Separate from the earlier action-review audit, whose database constraints
// deliberately do NOT accept business-wide inbox actions. Contains no PII,
// message bodies, draft text, recipient addresses, or automatic Gmail actions.
const TENANT='lvpt-owner-pilot';
const TABLE='lvpt_reply_review_audit';
const THREAD=/^[a-f0-9]{8,32}$/i;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DIGEST=/^[a-f0-9]{64}$/;
type Decision='draft_prepared'|'approved_for_manual_copy'|'denied';
type Stored={
  request_id:string;tenant_id:string;thread_id:string;
  last_message_at:string;decision:Decision;draft_digest:string|null;
  recorded_at:string;owner_reviewed_full_thread:boolean
};
type Context={
  ok?:boolean;connected?:boolean;source?:unknown;
  mailboxIdentityVerified?:boolean;threadId?:unknown;
  lastMessageAt?:unknown;partial?:boolean;totalMessages?:unknown;
  messages?:Array<{
    at?:unknown;direction?:unknown;relationshipHint?:unknown;
    excerpt?:unknown;senderDomain?:unknown;truncated?:boolean;hasAttachments?:boolean
  }>
};

function timestamp(value:unknown) {
  if(typeof value!=='string'|| !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/.test(value))return '';
  const ms=Date.parse(value);
  if(!Number.isFinite(ms)||ms<Date.now()-32*86400000||ms>Date.now()+86400000)return '';
  return new Date(ms).toISOString();
}
function evidenceFingerprint(id:string,at:string) {
  return createHash('sha256').update(id+'|'+at).digest('hex').slice(0,16);
}
function queryFor(threadId:string) {
  const p=new URLSearchParams({
    select:'request_id,thread_id,last_message_at,decision,draft_digest,recorded_at,owner_reviewed_full_thread',
    tenant_id:'eq.'+TENANT,thread_id:'eq.'+threadId,
    order:'recorded_at.desc,request_id.desc',limit:'1'
  });
  return TABLE+'?'+p;
}
async function latest(threadId:string):Promise<Stored|null> {
  const r=await fetch(supabaseEndpoint(queryFor(threadId)),{
    headers:supabaseHeaders(),cache:'no-store',signal:AbortSignal.timeout(12000)
  });
  if(!r.ok)throw new Error('audit_read_unavailable');
  const list=await r.json() as Stored[];
  if(!Array.isArray(list)||list.length>1)throw new Error('audit_read_invalid');
  return list[0]||null;
}

export async function GET(request:Request) {
  if(!ready())return jsonNoStore({ok:false,reason:'staging_unconfigured'},503);
  if(!hasReviewSession(request))return jsonNoStore({ok:false,reason:'unauthorized'},401);
  const threadId=new URL(request.url).searchParams.get('threadId')||'';
  if(!THREAD.test(threadId))return jsonNoStore({ok:false,reason:'invalid_thread_id'},400);
  try {
    const row=await latest(threadId.toLowerCase());
    return jsonNoStore({
      ok:true,source:'append_only_owner_reply_audit',
      decision:row?.decision||null,
      // PostgreSQL timestamptz can serialize as +00:00 while Apps Script
      // returns .000Z. Always emit a canonical instant for revision matching.
      lastMessageAt:row?.last_message_at?
        new Date(row.last_message_at).toISOString():null,
      // Digest is only for detecting changed local draft text; no body stored.
      draftDigest:row?.draft_digest||null,
      ownerReviewedOriginal:row?.owner_reviewed_full_thread===true,
      recordedAt:row?.recorded_at||null,
      noGmailWrites:true,noAutomaticSend:true
    },200);
  }catch {
    return jsonNoStore({ok:false,reason:'reply_audit_unavailable'},503);
  }
}

export async function POST(request:Request) {
  if(!allowedReviewMutation(request))return jsonNoStore({ok:false,reason:'same_origin_required'},403);
  if(!ready())return jsonNoStore({ok:false,reason:'staging_unconfigured'},503);
  if(!hasReviewSession(request))return jsonNoStore({ok:false,reason:'unauthorized'},401);
  if(!syncConfigured())return jsonNoStore({ok:false,reason:'business_mail_source_unavailable'},503);
  if(!/^application\/json(?:;|$)/i.test(request.headers.get('content-type')||''))
    return jsonNoStore({ok:false,reason:'json_required'},415);
  if(Number(request.headers.get('content-length')||0)>2500)
    return jsonNoStore({ok:false,reason:'payload_too_large'},413);
  try {
    const raw=await request.text();
    if(Buffer.byteLength(raw,'utf8')>2500)
      return jsonNoStore({ok:false,reason:'payload_too_large'},413);
    const data=JSON.parse(raw) as Record<string,unknown>;
    const threadId=String(data.threadId||'').toLowerCase();
    const lastMessageAt=timestamp(data.lastMessageAt);
    const decision=String(data.decision||'');
    const digest=String(data.draftDigest||'');
    const requestId=String(data.requestId||'').toLowerCase();
    const ownerReviewedOriginal=data.ownerReviewedOriginal===true;
    if(!THREAD.test(threadId)||!lastMessageAt||
       !['draft_prepared','approved_for_manual_copy','denied'].includes(decision)||
       !UUID.test(requestId)||
       (decision==='approved_for_manual_copy'?!DIGEST.test(digest):digest!=='')||
       (decision!=='denied'&&!ownerReviewedOriginal))
      return jsonNoStore({ok:false,reason:'invalid_reply_review'},400);

    // Re-read exactly the current Gmail conversation. The browser's
    // classification and date are never sufficient to authorize an audit.
    const source=await appsScriptRequest<Context>('readBusinessInboxThread',{
      threadId,expectedLastMessageAt:lastMessageAt
    });
    const messages=source?.messages;
    const last=Array.isArray(messages)?messages[messages.length-1]:null;
    if(source?.ok!==true||source.connected!==true||
       source.source!=='read_only_business_thread_preview'||
       source.mailboxIdentityVerified!==true||source.threadId!==threadId||
       timestamp(source.lastMessageAt)!==lastMessageAt||!last||
       timestamp(last.at)!==lastMessageAt||
       last.direction!=='inbound'||last.relationshipHint!=='unclassified'||
       isDocumentWorkflowNotice(last.senderDomain,'')||
       isBizlyMailServiceDomain(last.senderDomain)||
       typeof last.excerpt!=='string'||!last.excerpt.trim()||
       (source.partial===true&&!ownerReviewedOriginal)||
       !Number.isInteger(source.totalMessages)||
       Number(source.totalMessages)>150||
       last.truncated===true||last.hasAttachments===true)
      return jsonNoStore({ok:false,reason:'reply_source_stale_incomplete_or_not_client'},409);
    if(decision==='approved_for_manual_copy'){
      const previous=await latest(threadId);
      if(!previous||previous.decision!=='draft_prepared'||
         previous.owner_reviewed_full_thread!==true||
         timestamp(previous.last_message_at)!==lastMessageAt)
        return jsonNoStore({ok:false,reason:'prepare_draft_before_approval'},409);
    }
    const insert={
      request_id:requestId,tenant_id:TENANT,
      thread_id:threadId,last_message_at:lastMessageAt,
      decision,draft_digest:decision==='approved_for_manual_copy'?digest:null,
      owner_reviewed_full_thread:ownerReviewedOriginal
    };
    const r=await fetch(supabaseEndpoint(TABLE+'?on_conflict=request_id'),{
      method:'POST',cache:'no-store',
      headers:{...supabaseHeaders(),'Prefer':'resolution=ignore-duplicates,return=representation'},
      body:JSON.stringify(insert),signal:AbortSignal.timeout(12000)
    });
    if(!r.ok)return jsonNoStore({ok:false,reason:'reply_audit_write_unavailable'},502);
    const rows=await r.json() as Stored[];
    if(!Array.isArray(rows)||rows.length!==1)
      return jsonNoStore({ok:false,reason:'reply_audit_not_confirmed'},409);
    const stored=rows[0];
    if(stored.request_id!==requestId||stored.thread_id!==threadId||
       stored.decision!==decision)
      return jsonNoStore({ok:false,reason:'reply_audit_mismatch'},502);
    return jsonNoStore({
      ok:true,saved:1,audited:true,
      source:'append_only_owner_reply_audit',
      decision,lastMessageAt,recordedAt:stored.recorded_at,
      sourceFingerprint:evidenceFingerprint(threadId,lastMessageAt),
      noGmailWrites:true,noAutomaticSend:true
    },200);
  }catch {
    return jsonNoStore({ok:false,reason:'reply_review_unavailable'},503);
  }
}
