import { jsonNoStore, ready, supabaseEndpoint, supabaseHeaders } from '../_lib';
import { hasReviewSession } from '../_review-auth';
import { appsScriptRequest, syncConfigured } from '../../../sync/_lib';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=30;
const TENANT='lvpt-owner-pilot';
const CLIENT_DOMAINS:Record<string,string>={
  'lithic':'lithic.com',
  'quinn-emanuel':'quinnemanuel.com',
  'kirkland':'kirkland.com',
  'ows-aws':'ows.com.co',
  'imperativex':'imperativex.com'
};
const HEX=/^[a-f0-9]{16}$/;
const THREAD=/^[a-f0-9]{8,32}$/i;
type AuditRecord={decision?:unknown;source_fingerprint?:unknown};
type ThreadHeader={threadId?:unknown;lastMessageAt?:unknown;lastDirection?:unknown};
type Metadata={ok?:boolean;connected?:boolean;eventKey?:unknown;threads?:ThreadHeader[]};
type Message={
  direction?:unknown;at?:unknown;from?:unknown;to?:unknown;
  body?:unknown;truncated?:unknown
};
type Context={
  ok?:boolean;connected?:boolean;eventKey?:unknown;threadId?:unknown;
  lastMessageAt?:unknown;lastDirection?:unknown;mailboxIdentityVerified?:unknown;
  recipientEmail?:unknown;subject?:unknown;
  messages?:Message[];partial?:unknown;observedMessages?:unknown
};
function isIso(value:string):boolean {
  const d=Date.parse(value);
  return /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/.test(value)&&
    Number.isFinite(d)&&d>0&&d<=Date.now()+86400000;
}
function safeString(value:unknown,max:number):string {
  return String(value==null?'':value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'')
    .slice(0,max);
}
function cleanAddress(value:unknown,domain:string):string|null {
  const address=String(value||'').toLowerCase().trim();
  if(address.length>180 || !/^[a-z0-9._%+-]+@[a-z0-9.-]+$/.test(address))return null;
  if(!address.endsWith('@'+domain) && address!=='book@pokertraininglasvegas.com')return null;
  return address;
}
function cleanMessages(messages:Message[],domain:string) {
  if(!Array.isArray(messages)||messages.length>12)return null;
  const result=[];
  for(const m of messages) {
    if(!m||typeof m!=='object')return null;
    const direction=m.direction;
    const at=String(m.at||'');
    if(direction!=='inbound' && direction!=='outbound')return null;
    if(!isIso(at)||typeof m.body!=='string'||m.body.length>4000)return null;
    const from=cleanAddress(m.from,domain);
    if(!from)return null;
    if(direction==='inbound' && !from.endsWith('@'+domain))return null;
    if(direction==='outbound' && from!=='book@pokertraininglasvegas.com')return null;
    const to=cleanAddress(m.to,domain);
    // Multi-recipient threads may have display addresses other than
    // the client. Never use the raw To header to choose a reply recipient.
    result.push({direction,at,from,to:to||null,body:safeString(m.body,3500),
      truncated:m.truncated===true});
  }
  return result;
}
export async function GET(request:Request) {
  if(!ready())return jsonNoStore({ok:false,reason:'staging_unconfigured'},503);
  if(!hasReviewSession(request))return jsonNoStore({ok:false,reason:'unauthorized'},401);
  if(!syncConfigured())return jsonNoStore({ok:false,reason:'command_center_source_unconfigured'},503);
  const q=new URL(request.url).searchParams;
  const eventKey=q.get('eventKey')||'';
  const revision=q.get('sourceFingerprint')||'';
  const expectedLastMessageAt=q.get('lastMessageAt')||'';
  if(!Object.prototype.hasOwnProperty.call(CLIENT_DOMAINS,eventKey)||
    !HEX.test(revision)||!isIso(expectedLastMessageAt))
    return jsonNoStore({ok:false,reason:'invalid_draft_request'},400);
  try {
    const decisionQuery=new URLSearchParams({
      select:'decision,source_fingerprint',tenant_id:'eq.'+TENANT,
      action_key:'eq.gmail:'+eventKey,
      order:'recorded_at.desc,request_id.desc',limit:'1'
    });
    const approved=await fetch(supabaseEndpoint('lvpt_owner_action_review_audit?'+decisionQuery),{
      headers:supabaseHeaders(),cache:'no-store',signal:AbortSignal.timeout(12000)
    });
    if(!approved.ok)return jsonNoStore({ok:false,reason:'approval_audit_unavailable'},502);
    const rows=await approved.json() as AuditRecord[];
    if(!Array.isArray(rows)||rows.length!==1||rows[0].decision!=='draft_requested'||
      rows[0].source_fingerprint!==revision)
      return jsonNoStore({ok:false,reason:'current_owner_drafting_approval_required'},403);

    // Re-query the source rather than trusting a client-provided thread ID.
    const evidence=await appsScriptRequest<Metadata>('listGmailThreadEvidence',{eventKey});
    if(evidence?.ok!==true||evidence.connected!==true||evidence.eventKey!==eventKey||
      !Array.isArray(evidence.threads)||!evidence.threads.length)
      return jsonNoStore({ok:false,reason:'gmail_headers_unavailable'},503);
    const latest=evidence.threads.slice().filter(t=>isIso(String(t.lastMessageAt||'')))
      .sort((a,b)=>String(b.lastMessageAt).localeCompare(String(a.lastMessageAt)))[0];
    const id=String(latest?.threadId||'');
    if(!THREAD.test(id)||latest?.lastMessageAt!==expectedLastMessageAt)
      return jsonNoStore({ok:false,reason:'conversation_updated_refresh_approval'},409);
    const context=await appsScriptRequest<Context>('readGmailDraftContext',{
      eventKey,threadId:id,expectedLastMessageAt
    });
    if(context?.ok!==true||context.connected!==true||
       context.eventKey!==eventKey||context.threadId!==id||
       context.lastMessageAt!==expectedLastMessageAt||
       context.mailboxIdentityVerified!==true||!Array.isArray(context.messages))
      return jsonNoStore({ok:false,reason:'bounded_gmail_context_not_deployed_or_unverified'},503);
    const domain=CLIENT_DOMAINS[eventKey];
    const recipient=cleanAddress(context.recipientEmail,domain);
    if(!recipient||!recipient.endsWith('@'+domain))
      return jsonNoStore({ok:false,reason:'client_recipient_unverified'},502);
    const messages=cleanMessages(context.messages,domain);
    if(!messages||!messages.length)
      return jsonNoStore({ok:false,reason:'verified_conversation_messages_missing'},502);
    if(messages[messages.length-1].at!==expectedLastMessageAt)
      return jsonNoStore({ok:false,reason:'conversation_updated_refresh_approval'},409);
    return jsonNoStore({
      ok:true,source:'approved_read_only_gmail_draft_context',
      eventKey,threadId:id,recipientEmail:recipient,
      subject:safeString(context.subject,180),
      lastMessageAt:expectedLastMessageAt,
      lastDirection:context.lastDirection==='inbound'?'inbound':
        context.lastDirection==='outbound'?'outbound':'unknown',
      partial:context.partial===true,
      observedMessages:Math.min(500,Number(context.observedMessages)||0),
      messages,
      advisory:'Context for manual drafting review only. No emails or Gmail drafts created.'
    },200);
  }catch {
    return jsonNoStore({ok:false,reason:'gmail_draft_context_unavailable'},503);
  }
}
