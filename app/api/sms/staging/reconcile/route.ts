import { jsonNoStore, ready } from '../_lib';
import { authorizedReviewer } from '../_review-auth';
import { appsScriptRequest, syncConfigured } from '../../../sync/_lib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

type EventRecord = {
  id?: string;
  eventName?: string;
  company?: string;
  eventDate?: string;
  status?: string;
  payment?: { amountPaid?: number; status?: string; depositRequired?: number; balanceDueDate?: string };
  quote?: Array<{ quantity?: number; unitPrice?: number }>;
  tasks?: Array<{ title?: string; status?: string }>;
  emailActivity?: unknown[];
};

function sanitize(event: EventRecord) {
  const tasks = (Array.isArray(event.tasks) ? event.tasks : []).filter(t => t && typeof t.title === 'string');
  const completed = tasks.filter(t => /^(complete|completed|done|closed)$/i.test(String(t.status || '')));
  const open = tasks.filter(t => !/^(complete|completed|done|closed)$/i.test(String(t.status || '')));
  const paymentStatus = String(event.payment?.status || 'Not recorded').slice(0,80);
  const quoteTotal = (Array.isArray(event.quote) ? event.quote : []).reduce((sum,item) => (
    sum + (Number(item.quantity)||0) * (Number(item.unitPrice)||0)
  ),0);
  const paid = Number(event.payment?.amountPaid || 0);
  // A quote can be stale/partial; paid-in-full status is sourced from the payment ledger.
  // Never infer an exact receivable from a quote item calculation.
  return {
    id:String(event.id || '').slice(0,100),
    eventName:String(event.eventName || '').slice(0,150),
    company:String(event.company || '').slice(0,150),
    eventDate:String(event.eventDate || '').slice(0,20),
    eventStatus:String(event.status || '').slice(0,75),
    paymentStatus,
    ledgerPaidInFull:/^paid[\s-]*in[\s-]*full$/i.test(paymentStatus),
    recordedAmountPaid:Number.isFinite(paid) ? paid : null,
    recordedQuoteTotal:Number.isFinite(quoteTotal) ? quoteTotal : null,
    completedTaskCount:completed.length,
    openTaskCount:open.length,
    recentCompletedTasks:completed.slice(-5).map(t => String(t.title||'').slice(0,145)),
    recentOpenTasks:open.slice(0,5).map(t => String(t.title||'').slice(0,145)),
    recordedGmailActivityCount:Array.isArray(event.emailActivity) ? event.emailActivity.length : 0
  };
}

/** Read-only historical cross-check. NEVER writes to Google Sheets or Gmail. */
export async function GET(request: Request) {
  if (!ready()) return jsonNoStore({ok:false, reason:'staging_unconfigured'},503);
  if (!authorizedReviewer(request)) return jsonNoStore({ok:false, reason:'unauthorized'},401);
  if (!syncConfigured())
    return jsonNoStore({ok:false, reason:'command_center_source_unconfigured'},503);
  try {
    const data=await appsScriptRequest<{events?: EventRecord[]; serverTime?:string}>('listEvents');
    if (!Array.isArray(data.events))
      return jsonNoStore({ok:false,reason:'command_center_invalid_response'},502);
    const eventSummaries=data.events.filter(e => e && e.id).map(sanitize);
    return jsonNoStore({
      ok:true,source:'official_google_sheets_read_only',recordCount:eventSummaries.length,
      fetchedAt:new Date().toISOString(),events:eventSummaries
    },200);
  } catch {
    // Do not expose Google Apps Script exceptions, credentials or event record content.
    return jsonNoStore({ok:false,reason:'command_center_read_failed'},502);
  }
}
