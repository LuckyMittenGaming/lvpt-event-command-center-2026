import { jsonNoStore, ready } from '../_lib';
import { authorizedReviewer } from '../_review-auth';
import { appsScriptRequest, syncConfigured } from '../../../sync/_lib';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=30;

const CLIENTS:Record<string,string>={
  'lithic':'Lithic',
  'quinn-emanuel':'Quinn Emanuel',
  'kirkland':'Kirkland & Ellis',
  'ows-aws':'OWS',
  'imperativex':'ImperativeX'
};
type RawThread={
  threadId?:unknown; subject?:unknown; lastMessageAt?:unknown;
  lastDirection?:unknown; hasOutboundMessage?:unknown; hasInboundMessage?:unknown;
  observedMessages?:unknown; fullThreadEnumerated?:unknown;
};
type RawResult={
  ok?:boolean; connected?:boolean; eventKey?:string; threads?:RawThread[];
  partial?:boolean; checkedAt?:string;
};

function safeSubject(value:unknown):string {
  return String(value||'')
    .replace(/https?:\/\/\S+/gi,'[link]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,'[email]')
    .replace(/(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g,'[phone]')
    .replace(/\s+/g,' ').trim().slice(0,140);
}
function verifiedDate(raw:unknown):string|null {
  const value=String(raw||'');
  const timestamp=Date.parse(value);
  return typeof raw==='string' && /^\d{4}-\d\d-\d\dT/.test(value) &&
    Number.isFinite(timestamp) && timestamp>0 &&
    timestamp<Date.now()+86400000 ? new Date(timestamp).toISOString():null;
}
function cleanThread(raw:RawThread) {
  if(!raw||typeof raw!=='object')return null;
  const id=String(raw.threadId||'');
  if(!/^[a-f0-9]{8,32}$/i.test(id))return null;
  return {
    threadId:id,
    subject:safeSubject(raw.subject),
    lastMessageAt:verifiedDate(raw.lastMessageAt),
    lastDirection:['inbound','outbound','unknown'].includes(String(raw.lastDirection))
      ?String(raw.lastDirection):'unknown',
    hasOutboundMessage:raw.hasOutboundMessage===true,
    hasInboundMessage:raw.hasInboundMessage===true,
    observedMessages:Math.min(Math.max(0,Number(raw.observedMessages)||0),150),
    fullThreadEnumerated:raw.fullThreadEnumerated===true
  };
}

/** Read-only bounded Gmail thread metadata, available only after owner deploys
 * the additive Apps Script action; no mailbox secrets or message bodies returned.
 */
export async function GET(request:Request) {
  if(!ready())return jsonNoStore({ok:false,reason:'staging_unconfigured'},503);
  if(!authorizedReviewer(request))return jsonNoStore({ok:false,reason:'unauthorized'},401);
  if(!syncConfigured())return jsonNoStore({ok:false,reason:'command_center_source_unconfigured'},503);

  const eventKey=new URL(request.url).searchParams.get('eventKey')||'';
  if(!Object.prototype.hasOwnProperty.call(CLIENTS,eventKey))
    return jsonNoStore({ok:false,reason:'unsupported_client_key'},400);
  try{
    const data=await appsScriptRequest<RawResult>('listGmailThreadEvidence',{eventKey});
    if(!data || data.ok!==true || data.connected!==true || data.eventKey!==eventKey ||
      !Array.isArray(data.threads))
      return jsonNoStore({ok:false,reason:'gmail_evidence_source_not_deployed'},503);
    const seen=new Set<string>();
    const threads=data.threads.slice(0,8).map(cleanThread).filter((t):t is NonNullable<typeof t>=>{
      if(!t || seen.has(t.threadId))return false;
      seen.add(t.threadId);
      return true;
    });
    return jsonNoStore({
      ok:true,connected:true,eventKey,clientLabel:CLIENTS[eventKey],
      source:'bounded_live_gmail_header_metadata',
      gmailEvidenceScope:'limited_business_domain_and_headers_only',
      fullMailboxChecked:false,partial:data.partial===true,
      checkedAt:verifiedDate(data.checkedAt)||new Date().toISOString(),
      threads
    },200);
  }catch{
    return jsonNoStore({ok:false,reason:'gmail_evidence_source_not_deployed_or_unavailable'},503);
  }
}
