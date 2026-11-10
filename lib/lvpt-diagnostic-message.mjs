// Step 48.3: conservative, read-only classification of ONE selected Gmail
// message. Results are fixed non-identifying codes, never client text.
// This never authorizes sending, drafting, event-status changes or followups.
const ANSWERED=/^(?:(?:hi|hello|dear|hey)\s+(?:matt|team)\s*[,!:]?\s*)?(?:(?:thanks?(?:\s+again|\s+so much)?|thank you(?:\s+(?:again|so much))?)[.!,-]?\s*)?(?:(?:this|it|the invoice|the document|the payment|the agreement)\s+(?:has\s+been|was|is)\s+(?:submitted|sent|received|processed|paid)(?:\s+(?:to|by)\s+(?:accounting|our team))?)[.!]*$/i;
const COURTESY=/^(?:(?:hi|hello|dear|hey)\s+(?:matt|team)\s*[,!:]?\s*)?(?:(?:thanks?(?:\s+so much|\s+again)?|thank you(?:\s+(?:very much|again))?|great|perfect|awesome|got it|received|all set|that works|sounds good)[\s.!,-]*){1,5}$/i;
const HOLD=/(?:\b(?:out of (?:the )?office|out of town|on vacation|on leave)\b|\b(?:still reviewing|in internal review|share (?:it|this) with (?:our|the) team|will get back to you|be in touch)\b)/i;
const DECLINE=/(?:\b(?:won't|will not|not|no longer)\s+(?:be\s+)?(?:moving forward|proceeding|interested)\b|\b(?:we have decided not to|we've decided not to|we decided not to|decline the offer)\b)/i;
const ACTION=/(?:\?|\b(?:can|could|would|will)\s+(?:you|your team)\b|\bplease\s+(?:send|confirm|share|provide|reply|quote|schedule|advise|clarify|update|explain)\b|\b(?:what|when|where|how much|how many)\s+(?:would|will|can|do|does|is|are|time|date|options|pricing)\b|\b(?:i|we)\s+(?:need|would like)\s+(?:a|an|the|to)\b)/i;
const SIGNOFF=/^(?:thanks?(?: again)?|thank you(?: again)?|best(?: regards)?|kind regards|warm regards|regards|sincerely|cheers)[.!,-]*$/i;
const ROLE=/(?:\b(?:director|manager|operations|events|poker|partner|president|coordinator|sales|marketing|resort)\b|\b(?:email|phone|cell)\s*[:[]|@|instagram|facebook)/i;

function authoredText(excerpt) {
  const lines=String(excerpt==null?'':excerpt).replace(/\r\n?/g,'\n').split('\n');
  let end=lines.length;
  for(let i=1;i<lines.length;i++) {
    const line=lines[i].trim();
    if((/^From:\s+.{4,}$/i.test(line)||
        /^On .{8,160} wrote:/i.test(line)||
        /^[-]{2,}\s*Original Message/i.test(line)||
        /^Sent:\s+(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)/i.test(line)) && i>1) {
      end=i;break;
    }
    if((/^--\s*$/.test(line)||/^Sent from my (?:iPhone|Android)/i.test(line))&&i>1) {
      end=i;break;
    }
    const prev=lines.slice(Math.max(0,i-5),i).map(x=>x.trim());
    const following=lines.slice(i+1,i+6).join('\n');
    if(i>2&&/^[A-Z][a-zA-Z.'’-]+(?:\s+[A-Z][a-zA-Z.'’-]+){1,3}$/.test(line)&&
       prev.some(x=>SIGNOFF.test(x))&&ROLE.test(following)) {
      end=i;break;
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
  if(kind==='vendor'||latest.relationshipHint==='vendor')
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
  const unreadable=latest.hasAttachments===true||
    latest.truncated===true;
  if(unreadable)return result('needs_review','latest_message_incomplete');
  // Acknowledgements and declines are not client questions just because a
  // previous quoted email contained one; even older history may be incomplete.
  if(!explicitAsk&&(ANSWERED.test(body)||COURTESY.test(body)))
    return result('no_reply_suggested','acknowledgement');
  if(!directToLvpt&&DECLINE.test(body))
    return result('no_reply_suggested','client_declined');
  if(!directToLvpt&&HOLD.test(body))
    return result('no_reply_suggested','client_reviewing');
  if(partial)return result('needs_review','history_incomplete');
  if(explicitAsk)return result('possible_request','explicit_request');
  return result('needs_review','ambiguous_latest_message');
}
export {authoredText,qualifyDiagnosticPreview};
