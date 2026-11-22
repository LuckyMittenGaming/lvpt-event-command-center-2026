import { jsonNoStore, ready } from '../_lib';
import { hasReviewSession } from '../_review-auth';
import { appsScriptRequest, syncConfigured } from '../../../sync/_lib';
import { isDocumentWorkflowNotice, isBizlyMailServiceDomain, isVerifiedTalentEmail } from '../_inbox-routing';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=45;
type Verified={
  ok?:boolean;source?:string;mailboxIdentityVerified?:boolean;
  threadId?:string;lastMessageAt?:string;recipient?:string;
  subject?:string;lastGmailMessageId?:string;
  sendingEnabled?:boolean;fullHistoryRequiresOwnerReview?:boolean;totalMessages?:number;
};
const THREAD=/^[a-f0-9]{8,32}$/i;
function iso(v:string) {
  const ms=Date.parse(v);
  if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/.test(v)||
    !Number.isFinite(ms)||ms>Date.now()+86400000||
    ms<Date.now()-32*86400000)return '';
  return new Date(ms).toISOString();
}
export async function GET(request:Request) {
  if(!ready())return jsonNoStore({ok:false,reason:'staging_unconfigured'},503);
  if(!hasReviewSession(request))return jsonNoStore({ok:false,reason:'unauthorized'},401);
  if(!syncConfigured())return jsonNoStore({ok:false,reason:'business_mail_source_unavailable'},503);
  const params=new URL(request.url).searchParams;
  const threadId=params.get('threadId')||'';
  const lastMessageAt=iso(params.get('lastMessageAt')||'');
  if(!THREAD.test(threadId)||!lastMessageAt)
    return jsonNoStore({ok:false,reason:'invalid_recipient_lookup'},400);
  try {
    const data=await appsScriptRequest<Verified>('verifyBusinessReplyRecipient',{
      threadId,expectedLastMessageAt:lastMessageAt
    });
    const email=String(data.recipient||'').toLowerCase();
    if(isVerifiedTalentEmail(email))
      return jsonNoStore({ok:false,reason:'verified_talent_not_customer'},409);
    if(isBizlyMailServiceDomain(email.split('@')[1]))
      return jsonNoStore({ok:false,reason:'form_service_sender_not_client'},409);
    if(isDocumentWorkflowNotice(email.split('@')[1],data.subject))
      return jsonNoStore({ok:false,reason:'operational_notice_not_a_client_reply'},409);
    if(data.ok!==true||data.source!=='verified_lvpt_gmail_reply_recipient'||
      data.mailboxIdentityVerified!==true||data.threadId!==threadId||
      data.lastMessageAt!==lastMessageAt||
      !/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(email)||
      email.length>254||email==='book@pokertraininglasvegas.com'||
      typeof data.subject!=='string'||!data.subject.trim()||data.subject.length>160||
      !THREAD.test(String(data.lastGmailMessageId||'')))
      return jsonNoStore({ok:false,reason:'recipient_cannot_be_verified'},409);
    return jsonNoStore({
      ok:true,source:'owner_selected_verified_recipient',
      threadId,lastMessageAt,from:'book@pokertraininglasvegas.com',
      to:email,subject:data.subject,
      fullHistoryRequiresOwnerReview:data.fullHistoryRequiresOwnerReview===true,
      totalMessages:Number.isInteger(data.totalMessages)?
        Math.min(150,Math.max(0,Number(data.totalMessages))):null,
      // Both Apps Script and Vercel require separate explicit opt-ins.
      sendEnabled:process.env.LVPT_ENABLE_OWNER_APPROVED_GMAIL_SEND==='true' &&
        data.sendingEnabled===true,
      noMessageSent:true,requiresExplicitOwnerAuthorization:true,
      advisory:'Recipient read directly from the latest verified LVPT Gmail message; owner must check the actual recipient and approved content.'
    },200);
  }catch {
    return jsonNoStore({ok:false,reason:'recipient_verification_unavailable_or_not_deployed'},503);
  }
}
