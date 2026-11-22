import { authorized, jsonNoStore, ready } from '../_lib';
import {
  allowedReviewMutation, clearedReviewSessionCookie,
  hasReviewSession, makeReviewSessionCookie
} from '../_review-auth';

export const runtime='nodejs';
export const dynamic='force-dynamic';

function sessionResponse(data:unknown,status:number,cookie?:string):Response {
  const r=jsonNoStore(data,status);
  if(cookie) r.headers.set('Set-Cookie',cookie);
  r.headers.set('Vary','Cookie');
  return r;
}

/** Check whether this browser already has a valid owner-only review session. */
export async function GET(request:Request) {
  if(!ready()) return sessionResponse({ok:false,reason:'staging_unconfigured'},503);
  return sessionResponse({ok:true,authenticated:hasReviewSession(request)},200);
}

/** Exchange the manually entered Device Token for a secure browser cookie. */
export async function POST(request:Request) {
  if(!ready()) return sessionResponse({ok:false,reason:'staging_unconfigured'},503);
  if(!allowedReviewMutation(request))
    return sessionResponse({ok:false,reason:'same_origin_required'},403);
  if(!/^application\/json(?:;|$)/i.test(request.headers.get('content-type') || ''))
    return sessionResponse({ok:false,reason:'json_required'},415);
  if(Number(request.headers.get('content-length') || 0)>2048)
    return sessionResponse({ok:false,reason:'payload_too_large'},413);
  try {
    const raw=await request.text();
    if(Buffer.byteLength(raw,'utf8')>2048) return sessionResponse({ok:false,reason:'payload_too_large'},413);
    const payload=JSON.parse(raw) as {token?:unknown};
    const token=payload?.token;
    if(typeof token!=='string' || token.length<32 || token.length>256)
      return sessionResponse({ok:false,reason:'invalid_credentials'},401);

    // No token stored by this endpoint: hash is compared in constant time by authorized().
    const verificationRequest=new Request(request.url,{
      headers:{'x-lvpt-sms-sync-token':token}
    });
    if(!authorized(verificationRequest))
      return sessionResponse({ok:false,reason:'invalid_credentials'},401);
    return sessionResponse({ok:true,authenticated:true,expiresInSeconds:604800},
      200,makeReviewSessionCookie(request));
  } catch {
    return sessionResponse({ok:false,reason:'login_failed'},400);
  }
}

/** Log out. Neither Vercel's SSO login nor the Android sync token is touched. */
export async function DELETE(request:Request) {
  if(!allowedReviewMutation(request))
    return sessionResponse({ok:false,reason:'same_origin_required'},403);
  return sessionResponse({ok:true,authenticated:false},200,clearedReviewSessionCookie());
}
