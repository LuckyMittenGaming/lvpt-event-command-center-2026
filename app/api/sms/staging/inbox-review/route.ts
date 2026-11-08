import { jsonNoStore, ready } from '../_lib';
import { authorizedReviewer } from '../_review-auth';
import { appsScriptRequest, syncConfigured } from '../../../sync/_lib';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=45;

type InboxRawThread={
  threadId?:unknown;subject?:unknown;senderDomain?:unknown;
  lastMessageAt?:unknown;lastDirection?:unknown;reviewType?:unknown;
  sourceType?:unknown;
  needsHumanReview?:unknown;observedMessages?:unknown;
  fullThreadEnumerated?:unknown;
};
type InboxRaw={
  ok?:boolean;connected?:boolean;source?:unknown;mailboxIdentityVerified?:unknown;
  rangeDays?:unknown;checkedAt?:unknown;threads?:InboxRawThread[];
  examinedThreads?:unknown;excludedAutomatedCount?:unknown;
  metadataFailures?:unknown;partial?:unknown;
};
const HEX=/^[0-9a-f]{8,32}$/i;
function date(value:unknown):string|null {
  const raw=String(value||'');
  const ms=Date.parse(raw);
  return typeof value==='string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/.test(raw) &&
    Number.isFinite(ms) && ms>0 && ms<=Date.now()+86_400_000 ?
      new Date(ms).toISOString():null;
}
function safeLabel(value:unknown,max=130):string {
  return String(value||'')
    .replace(/https?:\/\/\S+/gi,'[link]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,'[email]')
    .replace(/(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g,'[phone]')
    .replace(/[\u0000-\u001f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
}
function count(value:unknown,max=100):number {
  const n=Number(value);
  return Number.isInteger(n) && n>=0 ? Math.min(n,max):0;
}
// Secondary safeguard against notification headers that lack dependable
// Auto-Submitted/List-Unsubscribe markers. These are not client replies.
function systemNotification(subject:string,senderDomain:string):boolean {
  return /^LVPT Command Center:\s/i.test(subject) ||
    (senderDomain==='google.com' && /^Folder shared with you:/i.test(subject)) ||
    (/^(?:Payment initiated:|Payment should have arrived:)/i.test(subject) &&
      /^(?:ziphq\.com|zip\.com|gmail\.com)$/.test(senderDomain));
}
function cleanThread(row:InboxRawThread) {
  if(!row || typeof row!=='object')return null;
  const id=String(row.threadId||'');
  const at=date(row.lastMessageAt);
  if(!HEX.test(id) || !at)return null;
  const direction=row.lastDirection;
  if(direction!=='inbound' && direction!=='outbound')return null;
  const sourceType=row.sourceType==='form_lead'?'form_lead':'email_thread';
  const expectedType=sourceType==='form_lead'?'form_lead_review':
    direction==='inbound'?'inbound_review':'already_answered';
  if(sourceType==='form_lead'&&direction!=='inbound')return null;
  if(row.reviewType!==expectedType)return null;
  const domain=String(row.senderDomain||'').toLowerCase();
  if(domain && !/^[a-z0-9.-]{3,120}$/.test(domain))return null;
  return {
    threadId:id,subject:safeLabel(row.subject)||'(no subject)',
    senderDomain:direction==='inbound'?domain:'',
    lastMessageAt:at,lastDirection:direction,
    reviewType:row.reviewType,sourceType,
    needsHumanReview:direction==='inbound' && row.needsHumanReview===true,
    observedMessages:count(row.observedMessages,150),
    fullThreadEnumerated:row.fullThreadEnumerated===true
  };
}

// Stage 43: bounded business-wide read-only headers. This endpoint does not
// use the five-client allowlist and has no ability to create Gmail drafts or
// send messages. It is protected by the existing owner review session.
export async function GET(request:Request) {
  if(!ready())return jsonNoStore({ok:false,reason:'staging_unconfigured'},503);
  if(!authorizedReviewer(request))return jsonNoStore({ok:false,reason:'unauthorized'},401);
  if(!syncConfigured())return jsonNoStore({ok:false,reason:'command_center_source_unconfigured'},503);
  try {
    const data=await appsScriptRequest<InboxRaw>('listBusinessInboxReview');
    if(data?.ok!==true || data.connected!==true ||
       data.source!=='read_only_business_inbox_metadata' ||
       data.mailboxIdentityVerified!==true ||
       !Array.isArray(data.threads) || data.threads.length>25)
      return jsonNoStore({ok:false,reason:'inbox_review_backend_not_deployed'},503);
    const seen=new Set<string>();
    let filteredSystemCount=0;
    const threads=data.threads.map(cleanThread).filter((entry):entry is NonNullable<typeof entry>=>{
      if(!entry||seen.has(entry.threadId))return false;
      seen.add(entry.threadId);
      if(systemNotification(entry.subject,entry.senderDomain)) {
        filteredSystemCount++;
        return false;
      }
      return true;
    }).sort((a,b)=>b.lastMessageAt.localeCompare(a.lastMessageAt));
    // Do not falsely claim exhaustive coverage: the Apps Script source caps
    // the recent messages and threads; older/other mail may still exist.
    return jsonNoStore({
      ok:true,connected:true,source:'lvpt_read_only_business_inbox_review',
      checkedAt:date(data.checkedAt),rangeDays:30,partial:data.partial===true,
      fullMailboxChecked:false,examinedThreads:count(data.examinedThreads,28),
      excludedAutomatedCount:count(data.excludedAutomatedCount,28)+filteredSystemCount,
      filteredSystemCount,
      metadataFailures:count(data.metadataFailures,28),threads,
      noEmailBodies:true,noGmailWrites:true,
      advisory:'Thread-header review only. Inbound does not prove a reply is due.'
    },200);
  }catch {
    return jsonNoStore({ok:false,reason:'inbox_review_backend_not_deployed_or_unavailable'},503);
  }
}
