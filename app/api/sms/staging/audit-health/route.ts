import { jsonNoStore, ready, supabaseEndpoint, supabaseHeaders } from '../_lib';
import { authorizedReviewer } from '../_review-auth';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=20;

/**
 * Authenticated empty-batch RPC smoke test. The stored function enforces
 * service_role and executes ZERO database writes when p_rows=[].
 * This verifies the real PostgREST route and privilege setup before the UI
 * enables any reviewer decisions to be saved.
 */
export async function GET(request:Request) {
  if(!ready()) return jsonNoStore({ok:false,reason:'staging_unconfigured'},503);
  if(!authorizedReviewer(request)) return jsonNoStore({ok:false,reason:'unauthorized'},401);
  try {
    const response=await fetch(supabaseEndpoint('rpc/lvpt_save_sms_decisions_with_audit'),{
      method:'POST',headers:supabaseHeaders(),
      body:JSON.stringify({p_rows:[]}),cache:'no-store',signal:AbortSignal.timeout(12000)
    });
    if(!response.ok) return jsonNoStore({ok:false,reason:'audit_rpc_unavailable'},502);
    const returned=await response.json().catch(()=>null);
    if(returned!==0) return jsonNoStore({ok:false,reason:'audit_rpc_unexpected_response'},502);
    return jsonNoStore({ok:true,auditReady:true,checkedWithEmptyBatch:true,noRecordsWritten:true},200);
  }catch{return jsonNoStore({ok:false,reason:'audit_check_failed'},502);}
}
