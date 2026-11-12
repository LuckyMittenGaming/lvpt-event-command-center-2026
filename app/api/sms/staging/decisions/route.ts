import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
import {
  jsonNoStore, ready, supabaseEndpoint, supabaseHeaders
} from '../_lib';
import { allowedReviewMutation, authorizedReviewer } from '../_review-auth';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=20;
const TENANT='lvpt-owner-pilot';
const STATUSES=new Set([
  'Needs verification','Investigating','Reviewed — no action','Candidate for reconciliation'
]);

type Decision={key:string;status:string;note:string;sourceCount:number};
type DecisionRow={
  case_key:string;case_status:string;source_count:number;note_nonce:string;note_ciphertext:string;
  updated_at:string
};

function checkInput(value:unknown): Decision[] | null {
  if (!value || typeof value !== 'object') return null;
  const raw=(value as {decisions?:unknown}).decisions;
  if (!Array.isArray(raw) || raw.length>40) return null;
  const result:Decision[]=[];
  const keys=new Set<string>();
  for (const item of raw) {
    if (!item || typeof item!=='object') return null;
    const d=item as Record<string,unknown>;
    if (typeof d.key!=='string' || d.key.length<1 || d.key.length>160 ||
      /[\r\n\t<>]/.test(d.key) || keys.has(d.key) ||
      typeof d.status!=='string' || !STATUSES.has(d.status) ||
      typeof d.note!=='string' || d.note.length>500 ||
      typeof d.sourceCount!=='number' || !Number.isInteger(d.sourceCount) ||
      d.sourceCount<0 || d.sourceCount>100000) return null;
    keys.add(d.key);
    result.push({key:d.key,status:d.status,note:d.note,sourceCount:d.sourceCount});
  }
  return result;
}
function key() {
  const b=Buffer.from(process.env.LVPT_SMS_STAGING_DATA_KEY_BASE64||'','base64');
  if(b.length!==32) throw new Error('Invalid data encryption key');
  return b;
}
function encrypt(keyValue:string,note:string) {
  const nonce=randomBytes(12);
  const cipher=createCipheriv('aes-256-gcm',key(),nonce);
  cipher.setAAD(Buffer.from(TENANT+':'+keyValue,'utf8'));
  const encrypted=Buffer.concat([cipher.update(note,'utf8'),cipher.final()]);
  return {
    note_nonce:nonce.toString('base64'),
    note_ciphertext:Buffer.concat([encrypted,cipher.getAuthTag()]).toString('base64')
  };
}
function auditNoteMac(caseKey:string,note:string):string {
  // Keyed digest avoids exposing short reviewer notes via ordinary SHA256 guessing.
  return createHmac('sha256',key())
    .update('lvpt-review-note-v1\\0'+TENANT+'\\0'+caseKey+'\\0'+note,'utf8')
    .digest('hex');
}
function decrypt(row:DecisionRow):string {
  const nonce=Buffer.from(row.note_nonce,'base64');
  const combined=Buffer.from(row.note_ciphertext,'base64');
  if(nonce.length!==12 || combined.length<16) throw new Error('Invalid encrypted note');
  const dec=createDecipheriv('aes-256-gcm',key(),nonce);
  dec.setAAD(Buffer.from(TENANT+':'+row.case_key,'utf8'));
  dec.setAuthTag(combined.subarray(combined.length-16));
  return Buffer.concat([dec.update(combined.subarray(0,combined.length-16)),dec.final()]).toString('utf8');
}

export async function GET(request:Request) {
  if(!ready()) return jsonNoStore({ok:false,reason:'staging_unconfigured'},503);
  if(!authorizedReviewer(request)) return jsonNoStore({ok:false,reason:'unauthorized'},401);
  try {
    const params=new URLSearchParams({
      select:'case_key,case_status,source_count,note_nonce,note_ciphertext,updated_at',
      tenant_id:'eq.'+TENANT,
      order:'updated_at.desc',
      limit:'1000'
    });
    const response=await fetch(supabaseEndpoint('lvpt_sms_case_decisions?'+params),{
      headers:supabaseHeaders(),cache:'no-store',signal:AbortSignal.timeout(15000)
    });
    if(!response.ok) return jsonNoStore({ok:false,reason:'review_read_failed'},502);
    const rows=await response.json() as DecisionRow[];
    const decisions=[];
    for(const row of rows) {
      try {
        decisions.push({key:row.case_key,status:row.case_status,note:decrypt(row),
          sourceCount:row.source_count,updatedAt:row.updated_at});
      }catch { return jsonNoStore({ok:false,reason:'review_note_decryption_failed'},502); }
    }
    return jsonNoStore({ok:true,decisions},200);
  }catch {return jsonNoStore({ok:false,reason:'review_read_failed'},502);}
}

export async function POST(request:Request) {
  if(!allowedReviewMutation(request)) return jsonNoStore({ok:false,reason:'same_origin_required'},403);
  if(!ready()) return jsonNoStore({ok:false,reason:'staging_unconfigured'},503);
  if(!authorizedReviewer(request)) return jsonNoStore({ok:false,reason:'unauthorized'},401);
  const length=Number(request.headers.get('content-length')||'0');
  if(length>50000) return jsonNoStore({ok:false,reason:'payload_too_large'},413);
  if(!/^application\/json(?:;|$)/i.test(request.headers.get('content-type')||''))
    return jsonNoStore({ok:false,reason:'json_required'},415);
  try {
    const raw=await request.text();
    if(Buffer.byteLength(raw,'utf8')>50000) return jsonNoStore({ok:false,reason:'payload_too_large'},413);
    const validated=checkInput(JSON.parse(raw));
    if(!validated) return jsonNoStore({ok:false,reason:'invalid_review_decisions'},400);
    if(!validated.length) return jsonNoStore({ok:true,saved:0},200);
    const timestamp=new Date().toISOString();
    const rows=validated.map(v=>({
      tenant_id:TENANT,case_key:v.key,case_status:v.status,source_count:v.sourceCount,
      ...encrypt(v.key,v.note),note_mac:auditNoteMac(v.key,v.note),updated_at:timestamp
    }));
    // DB function atomically updates latest decision AND appends an audit record.
    // A failed audit also rolls back the decision update, preventing silent gaps.
    const resp=await fetch(supabaseEndpoint('rpc/lvpt_save_sms_decisions_with_audit'),{
      method:'POST',headers:supabaseHeaders(),
      body:JSON.stringify({p_rows:rows}),cache:'no-store',signal:AbortSignal.timeout(15000)
    });
    if(!resp.ok) return jsonNoStore({ok:false,reason:'review_atomic_write_failed'},502);
    const saved=await resp.json().catch(()=>null);
    if(saved!==rows.length) return jsonNoStore({ok:false,reason:'review_audit_count_mismatch'},502);
    return jsonNoStore({ok:true,saved,staging:true,audited:true},200);
  }catch {return jsonNoStore({ok:false,reason:'review_write_failed'},500);}
}
