// Pure safety checks for owner-requested, unsent personalized email previews.
// Emails are untrusted source material; never permit a stale or premature
// follow-up to progress to the language model when the client asked for time.
export function shouldHoldPersonalizedDraft(context, nowMs=Date.now()) {
  const messages=Array.isArray(context?.messages)?context.messages:[];
  if(!messages.length || messages.length>12)return 'conversation_missing';
  if(context.eventKey==='ows-aws')return 'multiple_ows_events_unresolved';
  const last=messages[messages.length-1];
  if(!last || !['inbound','outbound'].includes(last.direction))
    return 'latest_message_direction_unverified';
  if(!String(last.body||'').trim())return 'latest_message_body_missing';
  const client=messages.slice().reverse().find(m=>m?.direction==='inbound');
  if(!client || !String(client.body||'').trim())return 'client_message_body_missing';
  if(context.lastDirection==='outbound') {
    const past=Date.parse(context.lastMessageAt||'');
    if(!Number.isFinite(past)||past>nowMs)return 'latest_message_date_unverified';
    const days=Math.floor((nowMs-past)/86400000);
    if(days<7)return 'recent_outbound_followup_too_early';
    const clientText=String(client.body||'').slice(0,1600);
    if(/\b(?:out of town|out of (?:the )?office|on vacation|on holiday|away for (?:a few|several|two|three) weeks|once i.m back|when i.m back|back in (?:the )?office|you.ll likely hear from me|hear from me once|share with leadership|in front of leadership|run it by (?:our )?(?:ceo|leadership)|awaiting (?:leadership|internal) (?:approval|review|decision))\b/i.test(clientText))
      return 'client_travel_or_internal_review_hold';
  }
  return '';
}
