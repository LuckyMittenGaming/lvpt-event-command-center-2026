import { jsonNoStore, ready, supabaseEndpoint, supabaseHeaders } from '../_lib';
import { allowedReviewMutation, hasReviewSession } from '../_review-auth';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=20;

const TENANT='lvpt-owner-pilot';
type Decision='draft_requested'|'verify_requested'|'hold'|'dismissed';
type SavedRow={
  action_key:string;
  decision:Decision;
  source_fingerprint:string;
  recorded_at:string;
  request_id:string;
};
const ACTION_KEY=/^(gmail|payment|payout):[A-Za-z0-9_.:-]{1,140}$/;
const SOURCE_FINGERPRINT=/^[a-f0-9]{16}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validDecision(actionKey:string,decision:string):decision is Decision {
  const type=actionKey.split(':',1)[0];
  return decision==='hold'||decision==='dismissed'||
    (decision==='draft_requested' && type==='gmail')||
    (decision==='verify_requested' && (type==='payment'||type==='payout'));
}

function validate(value:unknown) {
  if(!value || typeof value!=='object')return null;
  const v=value as Record<string,unknown>;
  if(typeof v.actionKey!=='string'||!ACTION_KEY.test(v.actionKey)||
    typeof v.decision!=='string'||!validDecision(v.actionKey,v.decision)||
    typeof v.sourceFingerprint!=='string'||!SOURCE_FINGERPRINT.test(v.sourceFingerprint)||
    typeof v.requestId!=='string'||!UUID.test(v.requestId))return null;
  return {
    request_id:v.requestId.toLowerCase(),
    tenant_id:TENANT,
    action_key:v.actionKey,
    decision:v.decision,
    source_fingerprint:v.sourceFingerprint
  };
}

export async function GET(request:Request) {
  if(!ready())return jsonNoStore({ok:false,reason:'staging_unconfigured'},503);
  if(!hasReviewSession(request))return jsonNoStore({ok:false,reason:'unauthorized'},401);
  try {
    const params=new URLSearchParams({
      select:'action_key,decision,source_fingerprint,recorded_at,request_id',
      tenant_id:'eq.'+TENANT,
      order:'recorded_at.desc,request_id.desc',
      limit:'1000'
    });
    const response=await fetch(supabaseEndpoint('lvpt_owner_action_review_audit?'+params),{
      headers:supabaseHeaders(),cache:'no-store',signal:AbortSignal.timeout(12000)
    });
    if(!response.ok)return jsonNoStore({ok:false,reason:'action_review_read_unavailable'},502);
    const rows=await response.json() as SavedRow[];
    if(!Array.isArray(rows))return jsonNoStore({ok:false,reason:'action_review_invalid_response'},502);
    const latest=new Map<string,SavedRow>();
    for(const row of rows) {
      if(!row||!ACTION_KEY.test(String(row.action_key||''))||latest.has(row.action_key))continue;
      latest.set(row.action_key,row);
    }
    return jsonNoStore({
      ok:true,
      decisions:[...latest.values()].map(r=>({
        actionKey:r.action_key,decision:r.decision,
        sourceFingerprint:r.source_fingerprint,recordedAt:r.recorded_at
      })),
      limitedToMostRecent:1000,
      source:'separate_staging_action_audit'
    },200);
  }catch {return jsonNoStore({ok:false,reason:'action_review_read_failed'},502);}
}

export async function POST(request:Request) {
  if(!allowedReviewMutation(request))return jsonNoStore({ok:false,reason:'same_origin_required'},403);
  if(!ready())return jsonNoStore({ok:false,reason:'staging_unconfigured'},503);
  if(!hasReviewSession(request))return jsonNoStore({ok:false,reason:'unauthorized'},401);
  if(!/^application\/json(?:;|$)/i.test(request.headers.get('content-type')||''))
    return jsonNoStore({ok:false,reason:'json_required'},415);
  const size=Number(request.headers.get('content-length')||0);
  if(!Number.isFinite(size)||size>5000)return jsonNoStore({ok:false,reason:'payload_too_large'},413);
  try {
    const raw=await request.text();
    if(Buffer.byteLength(raw,'utf8')>5000)return jsonNoStore({ok:false,reason:'payload_too_large'},413);
    const input=validate(JSON.parse(raw));
    if(!input)return jsonNoStore({ok:false,reason:'invalid_action_review'},400);
    // Single append-only audit insert. No email, CRM, accounting or task tools
    // are called from this endpoint. Retry with request_id is idempotent.
    const response=await fetch(supabaseEndpoint('lvpt_owner_action_review_audit?on_conflict=request_id'),{
      method:'POST',
      headers:{...supabaseHeaders(),'Prefer':'resolution=ignore-duplicates,return=representation'},
      body:JSON.stringify(input),cache:'no-store',signal:AbortSignal.timeout(12000)
    });
    if(!response.ok)return jsonNoStore({ok:false,reason:'action_review_audit_write_failed'},502);
    const rows=await response.json().catch(()=>null) as SavedRow[]|null;
    if(!Array.isArray(rows)||rows.length>1)
      return jsonNoStore({ok:false,reason:'action_review_audit_confirmation_failed'},502);
    if(rows.length===0)
      return jsonNoStore({ok:true,audited:true,duplicate:true,saved:0},200);
    const row=rows[0];
    if(row.request_id!==input.request_id||row.action_key!==input.action_key||
       row.decision!==input.decision||row.source_fingerprint!==input.source_fingerprint)
      return jsonNoStore({ok:false,reason:'action_review_audit_mismatch'},502);
    return jsonNoStore({ok:true,audited:true,saved:1,recordedAt:row.recorded_at},200);
  }catch{return jsonNoStore({ok:false,reason:'action_review_write_failed'},500);}
}
