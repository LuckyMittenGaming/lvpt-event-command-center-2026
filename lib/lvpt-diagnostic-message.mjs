// Step 48.3: conservative, read-only classification of ONE selected Gmail
// message. Results are fixed non-identifying codes, never client text.
// This never authorizes sending, drafting, event-status changes or followups.
const ANSWERED=/^(?:(?:hi|hello|dear|hey)\s+(?:matt|team)\s*[,!:]?\s*)?(?:(?:thanks?(?:\s+again|\s+so much)?|thank you(?:\s+(?:again|so much))?)[.!,-]?\s*)?(?:(?:this|it|the invoice|the document|the payment|the agreement)\s+(?:has\s+been|was|is)\s+(?:submitted|sent|received|processed|paid)(?:\s+(?:to|by)\s+(?:accounting|our team))?)[.!]*$/i;
const COURTESY=/^(?:(?:hi|hello|dear|hey)\s+(?:matt|team)\s*[,!:]?\s*)?(?:(?:thanks?(?:\s+so much|\s+again)?|thank you(?:\s+(?:very much|again))?|great|perfect|awesome|got it|received|all set|that works|sounds good)[\s.!,-]*){1,5}$/i;
const NAMED_THANK_YOU=/^(?:thank\s+you\s+(?:[a-z][a-z.'’-]*\s+){1,3}for\s+(?:the|your)\s+(?:intro(?:duction)?|email|message|note|update|connection|referral)(?:\s+and\s+|[.!]\s*|$)){1,3}[.!\s]*$/i;
const HOLD=/(?:\b(?:out of (?:the )?office|out of town|on vacation|on leave)\b|\b(?:still reviewing|in internal review|share (?:it|this) with (?:our|the) team|will get back to you|be in touch)\b)/i;
const DECLINE=/(?:\b(?:won't|will not|not|no longer)\s+(?:be\s+)?(?:moving forward|proceeding|interested)\b|\b(?:we have decided not to|we've decided not to|we decided not to|decline the offer)\b)/i;
const ACTION=/(?:\?|\b(?:can|could|would|will)\s+(?:you|your team)\b|\bplease\s+(?:send|confirm|share|provide|reply|quote|schedule|advise|clarify|update|explain)\b|\b(?:what|when|where|how much|how many)\s+(?:would|will|can|do|does|is|are|time|date|options|pricing)\b|\b(?:i|we)\s+(?:need|would like)\s+(?:a|an|the|to)\b)/i;
const SIGNOFF=/^(?:thanks?(?: again)?|thank you(?: again)?|best(?: regards)?|kind regards|warm regards|regards|sincerely|cheers)[.!,-]*$/i;
const ROLE=/(?:\b(?:director|manager|operations|events|poker|partner|president|coordinator|sales|marketing|resort)\b|\b(?:email|phone|cell)\s*[:[]|@|instagram|facebook)/i;
const SOCIAL=/(?:\b[\w.-]+\.com\b|\[(?:link|email|phone)\]|\b(?:Instagram|Facebook|LinkedIn|Twitter|X\s*@)\b)/i;
const CORDIAL_ACK=/^(?:(?:awesome|great|perfect|excellent)[!.]\s*)?(?:thanks?(?:\s+you)?(?:\s+for\s+(?:this|that|the\s+(?:update|info(?:rmation)?|details|email|message|introduction|intro|referral)))?)(?:[!.]\s*|\s+and\s+)?(?:(?:i\s+)?l?look(?:ing)?\s+forward\s+to\s+(?:connecting|speaking|talking|catching up|seeing you)(?:\s+with\s+you)?(?:\s+(?:(?:this|next)\s+)?(?:weekend|week|month)|\s+soon)?[!.]*)?$/i;
function forwardedBoundary(lines,i) {
  if(i<1)return false;
  const line=String(lines[i]||'').trim();
  if((/^From:\s+\S.+$|^[-]{2,}\s*Original Message/i.test(line))&&i>=2)return true;
  if(!/^On\s+(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/i.test(line))return false;
  const block=lines.slice(i,i+4).join(' ').replace(/\s+/g,' ').slice(0,500);
  return /\bwrote:\s*(?:>|$)/i.test(block)&&
    /(?:\b20\d\d\b|\[email\]|@)/i.test(block);
}


function authoredText(excerpt) {
  const lines=String(excerpt==null?'':excerpt).replace(/\r\n?/g,'\n').split('\n');
  let end=lines.length;
  for(let i=1;i<lines.length;i++) {
    const line=lines[i].trim();
    if((forwardedBoundary(lines,i)||
        /^Sent:\s+(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)/i.test(line))&&i>1) {
      end=i;break;
    }
    if((/^--\s*$/.test(line)||/^Sent from my (?:iPhone|Android)/i.test(line))&&i>1) {
      end=i;break;
    }
    const prev=lines.slice(Math.max(0,i-5),i).map(x=>x.trim());
    const following=lines.slice(i+1,i+6).join('\n');
    const isName=/^[A-Z][a-zA-Z.'’-]+(?:\s+[A-Z][a-zA-Z.'’-]+){1,3}$/.test(line);
    const isBareSignature=i>=2&&lines[i-1].trim()===''&&
      ROLE.test(String(lines[i+1]||''))&&
      /^[-]{5,}\s*$/m.test(lines.slice(i+2,i+8).join('\n'));
    const previousLines=lines.slice(Math.max(1,i-3),i);
    const initialsPosition=previousLines.findIndex(x=>
      /^[A-Z]{1,3}$/.test(String(x).trim()));
    const initialsAt=initialsPosition>=0?
      Math.max(1,i-3)+initialsPosition:-1;
    const initialsSignature=isName&&i>=2&&initialsAt>=1&&
      lines.slice(initialsAt+1,i).every(x=>!String(x).trim())&&
      SOCIAL.test(lines.slice(i+1,i+6).join('\n'));
    if(isName&&((i>2&&prev.some(x=>SIGNOFF.test(x))&&ROLE.test(following))||
      isBareSignature||initialsSignature)) {
      end=initialsSignature?initialsAt:i;break;
    }
  }
  return lines.slice(0,end).join('\n').trim()
    .replace(/^(?:(?:hi|hello|hey|dear)\s+)?(?:matt|matthew|team)[,!:]?[ \t]*\n(?:[ \t]*\n)+/i,'')
    .replace(/\s+/g,' ').trim().slice(0,1300);
}
function qualifyDiagnosticPreview(preview,kind='unclassified') {
  const m=Array.isArray(preview?.messages)?preview.messages:[],
    latest=m.at(-1);
  const result=(outcome,code)=>({
    outcome,reasonCode:code,
    requiresHumanReview:true,maySend:false,mayDraft:false
  });
  if(!latest||m.length>10||
    String(latest.at||'')!==String(preview?.lastMessageAt||''))
    return result('needs_review','chronology_unverified');
  if(kind==='vendor'||latest.relationshipHint==='vendor'||
     kind==='talent'||latest.relationshipHint==='talent')
    return result('vendor_only','vendor_operations');
  if(kind==='internal'||latest.relationshipHint==='internal')
    return result('no_reply_suggested','internal');
  if(latest.direction==='outbound')
    return result('no_reply_suggested','lvpt_replied_last');
  if(latest.direction!=='inbound'||latest.relationshipHint!=='unclassified')
    return result('needs_review','unknown_sender');
  const body=authoredText(latest.excerpt);
  if(!body)return result('needs_review','empty_latest_body');
  const explicitAsk=ACTION.test(body);
  const directToLvpt=/\?|\b(?:can|could|would|will)\s+(?:you|your team)\b|\bplease\s+(?:send|confirm|share|provide|quote|advise|clarify|update)\b/i.test(body);
  const partial=preview.partial===true ||
    m.length<Number(preview.totalMessages||0);
  const quotedTruncation=latest.truncated===true&&
    String(latest.excerpt||'').replace(/\r\n?/g,'\n').split('\n')
      .some((_,i,lines)=>forwardedBoundary(lines,i));
  const strictCourtesy=ANSWERED.test(body)||COURTESY.test(body)||
    NAMED_THANK_YOU.test(body)||CORDIAL_ACK.test(body);
  if(latest.hasAttachments===true)
    return result('needs_review','latest_message_incomplete');
  // A clipped old quote is not an incomplete NEW message when a clear
  // forwarded boundary and a fully anchored courtesy-only body precede it.
  if(!explicitAsk&&strictCourtesy&&
    (latest.truncated!==true||quotedTruncation))
    return result('no_reply_suggested','acknowledgement');
  if(latest.truncated===true)
    return result('needs_review','latest_message_incomplete');
  if(!directToLvpt&&DECLINE.test(body))
    return result('no_reply_suggested','client_declined');
  if(!directToLvpt&&HOLD.test(body))
    return result('no_reply_suggested','client_reviewing');
  if(partial)return result('needs_review','history_incomplete');
  if(explicitAsk)return result('possible_request','explicit_request');
  return result('needs_review','ambiguous_latest_message');
}
export {authoredText,qualifyDiagnosticPreview};
