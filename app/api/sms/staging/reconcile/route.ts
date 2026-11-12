import { jsonNoStore, ready } from '../_lib';
import { authorizedReviewer } from '../_review-auth';
import { appsScriptRequest, syncConfigured } from '../../../sync/_lib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

type TaskRecord = { id?:string; title?:string; status?:string; dueDate?:string };
type EmailRecord = { threadId?:string; subject?:string; date?:string };
type EventRecord = {
  id?:string; eventName?:string; company?:string; eventDate?:string; status?:string;
  payment?: {amountPaid?:number; status?:string; depositRequired?:number; balanceDueDate?:string};
  quote?:Array<{quantity?:number;unitPrice?:number}>;
  tasks?:TaskRecord[];
  emailActivity?:EmailRecord[];
};
type PayoutRecord = {
  payoutId?:string; eventId?:string; payee?:string; payoutType?:string;
  amount?:number|null; status?:string; paidDate?:string;
};
type PaymentRecord = {
  paymentId?:string; eventId?:string; invoiceNumber?:string;
  invoiceTotal?:number|null; amountPaid?:number|null; balanceDue?:number|null;
  paymentStatus?:string; dueDate?:string; paymentDate?:string;
};

function safeText(input:unknown, maxLength=160):string {
  return String(input ?? '')
    .replace(/https?:\/\/\S+/gi,'[link]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,'[email]')
    .replace(/(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g,'[phone]')
    .replace(/\b\d{8,17}\b/g,'[number]')
    .replace(/\s+/g,' ').trim().slice(0,maxLength);
}

// These are opaque Command Center record identifiers, not prose or contact details.
// Redacting a date-like numeric suffix to "[number]" breaks audit keys, silently
// collapses distinct invoices, and prevents exact event/Gmail joins. Reject IDs
// containing whitespace, email addresses, links or unsafe punctuation instead.
function safeLedgerId(input:unknown,maxLength=120):string {
  const value=String(input??'').trim();
  return value.length>0 && value.length<=maxLength &&
    /^[A-Za-z0-9_.:-]+$/.test(value) ? value : '';
}

function sanitize(event:EventRecord) {
  const taskList=(Array.isArray(event.tasks)?event.tasks:[])
    .filter(t=>t && typeof t.title==='string').slice(0,200);
  const completed=taskList.filter(t=>/^(complete|completed|done|closed)$/i.test(String(t.status||'')));
  const open=taskList.filter(t=>!/^(complete|completed|done|closed)$/i.test(String(t.status||'')));
  const paymentStatus=safeText(event.payment?.status||'Not recorded',80);
  const quoteTotal=(Array.isArray(event.quote)?event.quote:[]).reduce((sum,item)=>(
    sum+(Number(item.quantity)||0)*(Number(item.unitPrice)||0)
  ),0);
  const paid=Number(event.payment?.amountPaid ?? NaN);
  const emailRecords=Array.isArray(event.emailActivity)?event.emailActivity:[];
  const seenThreadTopics=new Set<string>();
  const emailTopics=emailRecords.slice(-100).reverse().flatMap(e=>{
    const title=safeText(e?.subject,160);
    const key=(safeText(e?.threadId,120)||title).toLowerCase();
    if(!title || !key || seenThreadTopics.has(key)) return [];
    seenThreadTopics.add(key);
    return [{subject:title, date:safeText(e?.date,30)}];
  }).slice(0,40);
  return {
    id:safeLedgerId(event.id,100),
    eventName:safeText(event.eventName,150),
    company:safeText(event.company,150),
    eventDate:safeText(event.eventDate,20),
    eventStatus:safeText(event.status,75),
    paymentStatus,
    ledgerPaidInFull:/^paid[\s-]*in[\s-]*full$/i.test(paymentStatus),
    recordedAmountPaid:Number.isFinite(paid)?paid:null,
    recordedQuoteTotal:Number.isFinite(quoteTotal)?quoteTotal:null,
    completedTaskCount:completed.length,
    openTaskCount:open.length,
    recentCompletedTasks:completed.slice(-5).map(t=>safeText(t.title,145)),
    recentOpenTasks:open.slice(0,5).map(t=>safeText(t.title,145)),
    taskEvidence:taskList.slice(0,100).map(t=>({
      title:safeText(t.title,150),
      status:safeText(t.status,40),
      dueDate:safeText(t.dueDate,30)
    })),
    recordedGmailActivityCount:emailRecords.length,
    emailTopics
  };
}

function sanitizePayout(raw:PayoutRecord) {
  const amount=raw.amount===null?null:Number(raw.amount);
  return {
    payoutId:safeLedgerId(raw.payoutId,120),
    eventId:safeLedgerId(raw.eventId,120),
    payee:safeText(raw.payee,120),
    payoutType:safeText(raw.payoutType,80),
    amount:amount!==null && Number.isFinite(amount)?amount:null,
    status:safeText(raw.status,50),
    paidDate:safeText(raw.paidDate,20)
  };
}

function sanitizePayment(record:PaymentRecord) {
  const amount=(value:unknown):number|null => {
    if(value===null || value===undefined || value==='') return null;
    const n=Number(value);
    return Number.isFinite(n) && n>=0 && n<1e9 ? n : null;
  };
  return {
    paymentId:safeLedgerId(record.paymentId,120),
    eventId:safeLedgerId(record.eventId,120),
    invoiceNumber:safeText(record.invoiceNumber,100),
    invoiceTotal:amount(record.invoiceTotal),
    amountPaid:amount(record.amountPaid),
    balanceDue:amount(record.balanceDue),
    paymentStatus:safeText(record.paymentStatus||'Unknown',80),
    dueDate:safeText(record.dueDate,25),
    paymentDate:safeText(record.paymentDate,25)
  };
}

/** Read-only comparison. Payouts are optional until the Apps Script backend is redeployed. */
export async function GET(request:Request) {
  if(!ready()) return jsonNoStore({ok:false,reason:'staging_unconfigured'},503);
  if(!authorizedReviewer(request)) return jsonNoStore({ok:false,reason:'unauthorized'},401);
  if(!syncConfigured()) return jsonNoStore({ok:false,reason:'command_center_source_unconfigured'},503);

  try {
    const [eventResult,payoutResult]=await Promise.allSettled([
      appsScriptRequest<{events?:EventRecord[];serverTime?:string}>('listEvents'),
      appsScriptRequest<{payouts?:PayoutRecord[];paymentRecords?:PaymentRecord[];payoutCount?:number;source?:string}>('listReconciliationEvidence')
    ]);
    if(eventResult.status!=='fulfilled'||!Array.isArray(eventResult.value.events))
      return jsonNoStore({ok:false,reason:'command_center_read_failed'},502);

    const events=eventResult.value.events.filter(e=>e && e.id).map(sanitize);
    let payoutSourceStatus='not_connected';
    let payouts:ReturnType<typeof sanitizePayout>[]=[];
    if(payoutResult.status==='fulfilled' && Array.isArray(payoutResult.value.payouts)) {
      payoutSourceStatus='command_center_ledger';
      const eventIds=new Set(events.map(e=>e.id));
      payouts=payoutResult.value.payouts.slice(0,500)
        .map(sanitizePayout).filter(p=>p.payoutId && eventIds.has(p.eventId));
    }
    let paymentSourceStatus='not_connected';
    let paymentRecords:ReturnType<typeof sanitizePayment>[]=[];
    if(payoutResult.status==='fulfilled' && Array.isArray(payoutResult.value.paymentRecords)) {
      paymentSourceStatus='command_center_all_payments';
      const eventIds=new Set(events.map(e=>e.id));
      paymentRecords=payoutResult.value.paymentRecords.slice(0,500)
        .map(sanitizePayment).filter(p=>p.paymentId && eventIds.has(p.eventId));
    }
    return jsonNoStore({
      ok:true,source:'official_google_sheets_read_only',recordCount:events.length,
      fetchedAt:new Date().toISOString(),events,payoutSourceStatus,payouts,
      paymentSourceStatus,paymentRecords,
      gmailEvidenceScope:'command_center_logged_activity_only',
      fullGmailMailboxChecked:false
    },200);
  }catch {
    return jsonNoStore({ok:false,reason:'command_center_read_failed'},502);
  }
}
