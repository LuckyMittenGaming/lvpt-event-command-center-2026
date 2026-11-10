import { jsonNoStore, ready } from '../_lib';
import { authorizedReviewer } from '../_review-auth';
import { appsScriptRequest, syncConfigured } from '../../../sync/_lib';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=45;
const THREAD=/^[a-f0-9]{8,32}$/i;
const ISO=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/;
type RawMessage={
  at?:unknown;direction?:unknown;relationshipHint?:unknown;
  senderDomain?:unknown;excerpt?:unknown;truncated?:unknown;
  hasAttachments?:unknown
};
type RawContext={
  ok?:boolean;connected?:boolean;source?:unknown;
  mailboxIdentityVerified?:unknown;threadId?:unknown;
  lastMessageAt?:unknown;checkedAt?:unknown;
  totalMessages?:unknown;partial?:unknown;messages?:RawMessage[]
};
function safeDate(value:unknown):string|null {
  const raw=String(value||'');
  const num=Date.parse(raw);
  if(!ISO.test(raw)||!Number.isFinite(num)||num>Date.now()+86400000||
     num<Date.now()-32*86400000)return null;
  return new Date(num).toISOString();
}
function cleanText(value:unknown,length:number):string {
  return String(value||'').slice(0,length)
    .replace(/https?:\/\/\S+/gi,'[link]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,'[email]')
    .replace(/(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g,'[phone]')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'');
}
export async function GET(request:Request) {
  if(!ready())return jsonNoStore({ok:false,reason:'staging_unconfigured'},503);
  if(!authorizedReviewer(request))return jsonNoStore({ok:false,reason:'unauthorized'},401);
  if(!syncConfigured())return jsonNoStore({ok:false,reason:'command_center_source_unconfigured'},503);
  const params=new URL(request.url).searchParams;
  const threadId=params.get('threadId')||'';
  const expected=safeDate(params.get('lastMessageAt'));
  if(!THREAD.test(threadId)||!expected)
    return jsonNoStore({ok:false,reason:'invalid_thread_review_request'},400);
  try {
    const data=await appsScriptRequest<RawContext>('readBusinessInboxThread',{
      threadId,expectedLastMessageAt:expected
    });
    if(data.ok!==true||data.connected!==true||
       data.source!=='read_only_business_thread_preview'||
       data.mailboxIdentityVerified!==true||
       data.threadId!==threadId||safeDate(data.lastMessageAt)!==expected||
       !Array.isArray(data.messages)||data.messages.length>10)
      return jsonNoStore({ok:false,reason:'thread_review_backend_not_deployed_or_stale'},503);
    const messages=[];
    for(const m of data.messages) {
      if(!m||typeof m!=='object')return jsonNoStore({ok:false,reason:'unsafe_thread_context'},502);
      const at=safeDate(m.at);
      if(!at||!['inbound','outbound','form_lead','other'].includes(String(m.direction))||
         !['internal','vendor','form_lead','outbound','unclassified'].includes(String(m.relationshipHint))||
         typeof m.excerpt!=='string'||m.excerpt.length>1200)
        return jsonNoStore({ok:false,reason:'unsafe_thread_context'},502);
      const domain=String(m.senderDomain||'').toLowerCase();
      if(domain && !/^[a-z0-9.-]{3,120}$/.test(domain))
        return jsonNoStore({ok:false,reason:'unsafe_thread_context'},502);
      messages.push({
        at,direction:m.direction,relationshipHint:m.relationshipHint,
        senderDomain:domain,excerpt:cleanText(m.excerpt,1100),
        truncated:m.truncated===true,hasAttachments:m.hasAttachments===true
      });
    }
    if(!messages.length||messages[messages.length-1].at!==expected)
      return jsonNoStore({ok:false,reason:'conversation_changed_refresh_inbox'},409);
    const total=Number(data.totalMessages);
    return jsonNoStore({
      ok:true,source:'owner_selected_read_only_thread_review',
      threadId,lastMessageAt:expected,
      checkedAt:safeDate(data.checkedAt),partial:data.partial===true,
      totalMessages:Number.isInteger(total)&&total>=1?Math.min(total,9999):messages.length,
      messages,
      noAiCalls:true,noGmailWrites:true,noMessageSent:true,
      advisory:'Read-only excerpts for human review; verify omitted history, attachments and the event record before acting.'
    },200);
  }catch {
    return jsonNoStore({ok:false,reason:'thread_review_backend_not_deployed_or_unavailable'},503);
  }
}
