import { jsonNoStore, ready } from '../_lib';
import { getAiGatewayCredential } from '../../../../../lib/lvpt-ai-gateway-auth';
import { allowedReviewMutation, hasReviewSession } from '../_review-auth';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=45;

// Authenticated, explicit-click diagnostic only. This uses an entirely
// synthetic scenario; never loads, sends, or alters real client data.
export async function POST(request:Request) {
  if(!allowedReviewMutation(request))return jsonNoStore({ok:false,reason:'same_origin_required'},403);
  if(!ready())return jsonNoStore({ok:false,reason:'staging_unconfigured'},503);
  if(!hasReviewSession(request))return jsonNoStore({ok:false,reason:'unauthorized'},401);
  if(!/^application\/json(?:;|$)/i.test(request.headers.get('content-type')||''))
    return jsonNoStore({ok:false,reason:'json_required'},415);
  let input:unknown;
  try {
    const payload=await request.text();
    if(Buffer.byteLength(payload,'utf8')>300)return jsonNoStore({ok:false,reason:'payload_too_large'},413);
    input=JSON.parse(payload);
  }catch{return jsonNoStore({ok:false,reason:'invalid_json'},400);}
  if(!input||typeof input!=='object'||Array.isArray(input)||
     Object.keys(input).length!==1||
     (input as Record<string,unknown>).mode!=='synthetic_only')
    return jsonNoStore({ok:false,reason:'synthetic_test_only'},400);

  const auth=getAiGatewayCredential(request);
  if(!auth)return jsonNoStore({ok:false,reason:'ai_gateway_not_configured',
    detail:'No configured API key or runtime Vercel OIDC token available.'},503);
  const token=auth.token;
  const model=process.env.LVPT_EMAIL_DRAFT_MODEL||'openai/gpt-5.6-sol';
  if(!/^[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9.-]*$/i.test(model))
    return jsonNoStore({ok:false,reason:'ai_model_not_configured'},503);

  try {
    const response=await fetch('https://ai-gateway.vercel.sh/v1/chat/completions',{
      method:'POST',
      headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
      body:JSON.stringify({
        model,
        messages:[
          {role:'system',content:'You write fictional business email drafts for a test environment. Return ONLY a JSON object with a subject string and body string. Never claim a reservation, venue approval, or payment is confirmed. Do not send email.'},
          {role:'user',content:'TEST DATA ONLY. A fictional company, SampleWorks, asks LVPT about a training event for 12 fictional people next spring without a specific date. Draft a short, friendly reply asking for the preferred date. Do not use real contact information. All information in this request is fabricated.'}
        ],
        response_format:{type:'json_object'},
        max_completion_tokens:1200
      }),
      cache:'no-store',
      signal:AbortSignal.timeout(30000)
    });
    if(!response.ok) {
      const status=response.status;
      // Expose only a small allowlist of diagnostic codes. The gateway's
      // message, response headers, request data and any auth tokens stay
      // exclusively server-side and are never returned to the browser.
      let gatewayCode='unknown';
      try {
        const error=await response.json() as {
          error?:{code?:unknown;type?:unknown};code?:unknown
        };
        const codes=[error?.error?.code,error?.error?.type,error?.code];
        const allow=new Set([
          'customer_verification_required','insufficient_funds',
          'quota_for_entity_exceeded','authentication_error',
          'unauthorized','invalid_api_key','invalid_token',
          'model_not_found','invalid_model','invalid_request_error'
        ]);
        for(const code of codes) {
          if(typeof code==='string' && allow.has(code)) {
            gatewayCode=code;break;
          }
        }
      }catch {/* Non-JSON error: report HTTP status only. */}
      const reason=gatewayCode==='customer_verification_required'?
        'ai_gateway_account_verification_required':
        status===402?'ai_gateway_billing_or_credits':
        status===401||status===403?'ai_gateway_authorization_failed':
        status===429?'ai_gateway_rate_limited':
        status===400||status===404?'ai_gateway_model_or_request_invalid':
        'ai_gateway_provider_unavailable';
      return jsonNoStore({
        ok:false,reason,gatewayStatus:status,gatewayCode,
        authentication:auth.method
      },503);
    }
    const data=await response.json() as {choices?:Array<{message?:{content?:unknown}}>} ;
    const raw=data.choices?.[0]?.message?.content;
    if(typeof raw!=='string'||raw.length>10000)
      return jsonNoStore({ok:false,reason:'ai_gateway_invalid_model_output'},502);
    let parsed:unknown;
    try{parsed=JSON.parse(raw);}catch {
      return jsonNoStore({ok:false,reason:'ai_gateway_non_json_output'},502);
    }
    if(!parsed||typeof parsed!=='object')
      return jsonNoStore({ok:false,reason:'ai_gateway_invalid_model_output'},502);
    const obj=parsed as {subject?:unknown;body?:unknown};
    const subject=typeof obj.subject==='string'?obj.subject.trim().slice(0,180):'';
    const body=typeof obj.body==='string'?obj.body.trim().slice(0,1800):'';
    if(subject.length<5||body.length<40)
      return jsonNoStore({ok:false,reason:'ai_gateway_incomplete_model_output'},502);
    return jsonNoStore({
      ok:true,source:'fictional_ai_gateway_smoke_test',model,
      authentication:auth.method,
      subject,body,
      verified:'AI model responded to fictional data through the deployed staging server',
      noGmailRead:true,noEmailSent:true,noGmailDraftCreated:true,noSheetChanged:true
    },200);
  }catch {
    return jsonNoStore({ok:false,reason:'ai_gateway_request_timeout_or_failure'},503);
  }
}
