import { randomUUID } from 'node:crypto';
import { jsonNoStore, ready, supabaseEndpoint, supabaseHeaders } from '../_lib';
import { hasReviewSession, allowedReviewMutation } from '../_review-auth';
import { appsScriptRequest, syncConfigured } from '../../../sync/_lib';
import { selectDiagnosticThread } from '../../../../../lib/lvpt-diagnostic-selection.mjs';
import { qualifyDiagnosticPreview } from '../../../../../lib/lvpt-diagnostic-message.mjs';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=45;

const THREAD=/^[a-f0-9]{8,32}$/i;
type InboxResponse={
  ok?:boolean;connected?:boolean;source?:string;
  mailboxIdentityVerified?:boolean;page?:number;pageSize?:number;
  threads?:unknown[];
};
type ThreadResponse={
  ok?:boolean;connected?:boolean;source?:string;
  mailboxIdentityVerified?:boolean;threadId?:string;lastMessageAt?:string;
  messages?:Array<{at?:unknown;direction?:unknown;relationshipHint?:unknown;excerpt?:unknown;truncated?:unknown;hasAttachments?:unknown}>;
  totalMessages?:unknown;partial?:unknown;
};
type RecipientResponse={
  ok?:boolean;source?:string;mailboxIdentityVerified?:boolean;
  threadId?:string;lastMessageAt?:string;
};
type PreviewStatus='not_selected'|'passed'|'blocked'|'failed';
type RecipientStatus='not_selected'|'verified'|'blocked'|'failed';
type QualificationStatus='not_checked'|'no_reply_suggested'|'possible_request'|'needs_review'|'vendor_only';

function recentTime(value:unknown):string {
  const s=String(value||'');
  const n=Date.parse(s);
  if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/.test(s)||
     !Number.isFinite(n)||n<Date.now()-32*86400000||n>Date.now()+86400000)
    return '';
  return new Date(n).toISOString();
}
// Compact owner-only history. Only fixed status codes/counters are returned;
// never original thread IDs, recipients, subjects, or message text.
export async function GET(request:Request) {
  if(!ready())return jsonNoStore({ok:false,reason:'staging_unconfigured'},503);
  if(!hasReviewSession(request))return jsonNoStore({ok:false,reason:'unauthorized'},401);
  if(process.env.VERCEL_ENV==='production')
    return jsonNoStore({ok:false,reason:'staging_only'},403);
  try {
    const p=new URLSearchParams({
      select:'run_id,created_at,inbox_status,page_zero_threads,thread_preview_status,recipient_status,selection_mode,qualification_outcome,qualification_reason_code,vercel_send_switch_enabled',
      tenant_id:'eq.lvpt-owner-pilot',
      order:'created_at.desc',limit:'5'
    });
    const r=await fetch(supabaseEndpoint('lvpt_staging_diagnostic_runs?'+p),{
      headers:supabaseHeaders(),cache:'no-store',signal:AbortSignal.timeout(12000)
    });
    if(!r.ok)throw Error('diagnostic_history_unavailable');
    const raw=await r.json() as Array<Record<string,unknown>>;
    if(!Array.isArray(raw)||raw.length>5)throw Error('diagnostic_history_invalid');
    const safe=new Set([
      'not_checked','no_reply_suggested','possible_request',
      'needs_review','vendor_only'
    ]);
    const entries=raw.map(item=>({
      runId:typeof item.run_id==='string'&&
        /^[0-9a-f-]{36}$/i.test(item.run_id)?item.run_id:null,
      at:typeof item.created_at==='string'&&
        Number.isFinite(Date.parse(item.created_at))?
        new Date(item.created_at).toISOString():null,
      inboxStatus:item.inbox_status==='passed'?'passed':'failed',
      pageZeroThreads:Number.isInteger(item.page_zero_threads)?
        Math.min(20,Math.max(0,Number(item.page_zero_threads))):0,
      threadPreviewStatus:['not_selected','passed','blocked','failed'].includes(
        String(item.thread_preview_status))?item.thread_preview_status:'failed',
      recipientStatus:['not_selected','verified','blocked','failed'].includes(
        String(item.recipient_status))?item.recipient_status:'failed',
      selectionMode:['none','manual','automatic_client','automatic_vendor'].includes(
        String(item.selection_mode))?item.selection_mode:'none',
      qualificationOutcome:safe.has(String(item.qualification_outcome))?
        item.qualification_outcome:'not_checked',
      qualificationReasonCode:typeof item.qualification_reason_code==='string'&&
        /^[a-z_]{3,40}$/.test(item.qualification_reason_code)?
        item.qualification_reason_code:'not_checked',
      sendSwitchEnabled:item.vercel_send_switch_enabled===true
    }));
    return jsonNoStore({
      ok:true,source:'lvpt_no_client_data_diagnostic_history',
      entries,clientDataIncluded:false,noGmailWrites:true
    },200);
  }catch {
    return jsonNoStore({ok:false,reason:'diagnostic_history_unavailable'},503);
  }
}

export async function POST(request:Request) {
  if(!allowedReviewMutation(request))return jsonNoStore({ok:false,reason:'same_origin_required'},403);
  if(!ready()||!syncConfigured())return jsonNoStore({ok:false,reason:'staging_unconfigured'},503);
  if(!hasReviewSession(request))return jsonNoStore({ok:false,reason:'unauthorized'},401);
  if(process.env.VERCEL_ENV==='production')
    return jsonNoStore({ok:false,reason:'staging_only'},403);
  if(!/^application\/json(?:;|$)/i.test(request.headers.get('content-type')||''))
    return jsonNoStore({ok:false,reason:'json_required'},415);
  if(Number(request.headers.get('content-length')||0)>500)
    return jsonNoStore({ok:false,reason:'payload_too_large'},413);
  try {
    const text=await request.text();
    if(Buffer.byteLength(text,'utf8')>500)
      return jsonNoStore({ok:false,reason:'payload_too_large'},413);
    const body=JSON.parse(text) as Record<string,unknown>;
    const threadId=String(body.threadId||'').toLowerCase();
    const lastMessageAt=recentTime(body.lastMessageAt);
    if(Object.keys(body).some(key=>!['threadId','lastMessageAt'].includes(key))||
       Boolean(threadId)!==Boolean(body.lastMessageAt)||
       (threadId && (!THREAD.test(threadId)||!lastMessageAt)))
      return jsonNoStore({ok:false,reason:'invalid_diagnostic_request'},400);

    let inboxStatus:'passed'|'failed'='failed';
    let pageZeroThreads=0;
    let selectedThreadId=threadId;
    let selectedLastMessageAt=lastMessageAt;
    let selectionMode:'none'|'manual'|'automatic_client'|'automatic_vendor'=
      threadId?'manual':'none';
    let threadPreviewStatus:PreviewStatus=threadId?'failed':'not_selected';
    let recipientStatus:RecipientStatus=threadId?'failed':'not_selected';
    let qualificationOutcome:QualificationStatus='not_checked';
    let qualificationReasonCode='not_checked';
    try {
      const inbox=await appsScriptRequest<InboxResponse>('listBusinessInboxReview',{page:0});
      if(inbox.ok===true&&inbox.connected===true&&
         inbox.source==='read_only_business_inbox_metadata'&&
         inbox.mailboxIdentityVerified===true&&inbox.page===0&&
         inbox.pageSize===20&&Array.isArray(inbox.threads)&&
         inbox.threads.length<=20){
        inboxStatus='passed';
        pageZeroThreads=inbox.threads.length;
        // When the owner did not expand a thread, select a single eligible
        // metadata candidate rather than requiring another manual action.
        // All subsequent actions stay READ ONLY. Never persist its identity.
        if(!selectedThreadId) {
          const picked=selectDiagnosticThread(inbox.threads);
          if(picked) {
            selectedThreadId=picked.threadId;
            selectedLastMessageAt=picked.lastMessageAt;
            if(picked.selectionMode==='automatic_client'||
               picked.selectionMode==='automatic_vendor')
              selectionMode=picked.selectionMode;
            threadPreviewStatus='failed';
            recipientStatus='failed';
          }
        }
      }
    }catch {
      // Only a fixed status code is recorded; no raw source data or errors.
    }
    if(selectedThreadId) {
      try {
        const preview=await appsScriptRequest<ThreadResponse>('readBusinessInboxThread',{
          threadId:selectedThreadId,expectedLastMessageAt:selectedLastMessageAt
        });
        if(preview.ok===true&&preview.connected===true&&
           preview.source==='read_only_business_thread_preview'&&
           preview.mailboxIdentityVerified===true&&
           preview.threadId===selectedThreadId&&
           preview.lastMessageAt===selectedLastMessageAt&&
           Array.isArray(preview.messages)&&preview.messages.length>0&&
           preview.messages.length<=10){
          threadPreviewStatus='passed';
          // Classify only the selected, read-only, redacted latest excerpt.
          // Acknowledgements and truncated/ambiguous messages must not
          // trigger recipient verification or an implied request to reply.
          const classification=qualifyDiagnosticPreview(
            preview,selectionMode==='automatic_vendor'?'vendor':'unclassified'
          );
          qualificationOutcome=classification.outcome as QualificationStatus;
          qualificationReasonCode=classification.reasonCode;
          if(qualificationOutcome==='possible_request') {
          try {
            const recipient=await appsScriptRequest<RecipientResponse>(
              'verifyBusinessReplyRecipient',{
                threadId:selectedThreadId,
                expectedLastMessageAt:selectedLastMessageAt
              }
            );
            recipientStatus=recipient.ok===true&&
              recipient.source==='verified_lvpt_gmail_reply_recipient'&&
              recipient.mailboxIdentityVerified===true&&
              recipient.threadId===selectedThreadId&&
              recipient.lastMessageAt===selectedLastMessageAt?
              'verified':'blocked';
          }catch(error) {
            // An expected rejection cannot be confused with a verified
            // address. Don't store the source error or recipient.
            recipientStatus=/Unknown action/i.test(String(error))?'failed':'blocked';
          }
          }else{
            // No reply recommended; there is no reason to look up the address.
            recipientStatus='not_selected';
          }
        }else{
          threadPreviewStatus='blocked';recipientStatus='blocked';
          qualificationOutcome='needs_review';
          qualificationReasonCode='chronology_unverified';
        }
      }catch {
        threadPreviewStatus='failed';recipientStatus='blocked';
        qualificationOutcome='needs_review';
        qualificationReasonCode='chronology_unverified';
      }
    }
    const runId=randomUUID();
    // The report intentionally stores ZERO client text, recipients, dates,
    // original thread IDs, message IDs, or subject lines.
    const report={
      run_id:runId,tenant_id:'lvpt-owner-pilot',
      inbox_status:inboxStatus,page_zero_threads:pageZeroThreads,
      thread_preview_status:threadPreviewStatus,recipient_status:recipientStatus,
      selection_mode:selectionMode,
      qualification_outcome:qualificationOutcome,
      qualification_reason_code:qualificationReasonCode,
      vercel_send_switch_enabled:
        process.env.LVPT_ENABLE_OWNER_APPROVED_GMAIL_SEND==='true'
    };
    const saved=await fetch(supabaseEndpoint('lvpt_staging_diagnostic_runs'),{
      method:'POST',headers:{...supabaseHeaders(),'Prefer':'return=representation'},
      cache:'no-store',body:JSON.stringify(report),signal:AbortSignal.timeout(12000)
    });
    if(!saved.ok)return jsonNoStore({ok:false,reason:'diagnostic_audit_unavailable'},503);
    const rows=await saved.json() as Array<{run_id:string}>;
    if(!Array.isArray(rows)||rows.length!==1||rows[0].run_id!==runId)
      return jsonNoStore({ok:false,reason:'diagnostic_audit_unconfirmed'},503);
    return jsonNoStore({
      ok:true,source:'lvpt_read_only_staging_diagnostic',
      runId,inboxStatus,pageZeroThreads,threadPreviewStatus,recipientStatus,
      selectionMode,qualificationOutcome,qualificationReasonCode,
      sendingInvoked:false,gmailWrites:false,clientDetailsStored:false
    },200);
  }catch {
    return jsonNoStore({ok:false,reason:'diagnostic_unavailable'},503);
  }
}
