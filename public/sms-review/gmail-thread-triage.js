(function(root,factory) {
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.LVPTGmailTriage=api;
})(typeof window==='undefined'?null:window,function(){
  'use strict';
  // Read-only, conservative decision support. Only use complete thread data.
  // Never treat the presence of an email or a SENT label as proof of a business outcome.
  const DECLINED=/\b(?:not (?:going to|able to|moving|proceeding) (?:move )?forward|decided not to (?:move |go )?forward|won'?t be moving forward|unable to proceed|will not proceed|unfortunately (?:we |we've )?(?:decided|cannot)|we have decided not|we've decided not|pass(?:ing)? on this|declin(?:e|ed|ing) (?:the|your|this) (?:proposal|quote|event))\b/i;
  const AGREEMENT=/\b(?:agreement (?:has been |is )?signed|signed (?:the|our) agreement|contract (?:has been |is )?signed|signed (?:the |our )?contract|fully executed|docusign (?:is |has been )?completed)\b/i;
  const INVOICE=/\b(?:invoice (?:has been |was |is )?sent|sent (?:the |your |our )?invoice|invoice (?:is |was )?paid|payment (?:has been |was )?received)\b/i;
  const PROPOSAL=/\b(?:here (?:is|are) (?:the|your|our) proposal|proposal (?:is |was |has been )?sent|sent (?:the |your |our )?proposal|take a look at (?:the |our |your )?proposal|please (?:review|see) (?:the |our |your )?proposal)\b/i;
  function primaryText(text) {
    const str=String(text||'');
    return str.split(/\n(?:On .{5,180}wrote:|From:\s|-----Original Message-----|Begin forwarded message:)/i)[0]
      .replace(/https?:\/\/\S+/g,'[link]').trim().slice(0,5000);
  }
  function senderMatches(message,businessAddresses) {
    const from=String(message.from||'').toLowerCase();
    return (businessAddresses||[]).some(address=>{
      const email=String(address).toLowerCase().trim();
      return email && (from===email||from.includes('<'+email+'>'));
    });
  }
  function parseTime(value) {
    const n=Date.parse(String(value||''));
    return Number.isFinite(n)?n:null;
  }
  function summarizeThread(thread,businessAddresses) {
    const messages=Array.isArray(thread?.messages)?thread.messages:[];
    const total=Number.isSafeInteger(thread?.total_messages)?thread.total_messages:messages.length;
    if(!messages.length || thread?.truncated===true || total>messages.length)
      return {state:'insufficient_evidence',reason:'Thread messages missing or truncated; cannot infer outcome.'};
    const mapped=messages.map((m,i)=>({
      i,m,ts:parseTime(m.email_ts||m.date||m.timestamp),
      outbound:senderMatches(m,businessAddresses),
      body:primaryText(m.body||m.text||'')
    }));
    if(mapped.some(x=>x.ts===null))
      return {state:'insufficient_evidence',reason:'Message timestamps unavailable; cannot establish reply order.'};
    mapped.sort((a,b)=>a.ts-b.ts||a.i-b.i);
    const final=mapped[mapped.length-1];
    const inbound=mapped.filter(x=>!x.outbound);
    const outbound=mapped.filter(x=>x.outbound);
    if(!inbound.length)
      return {state:'outbound_only',reason:'No external reply was observed in this complete thread; check for a different thread before following up.'};
    // A genuine explicit decline from an external message is definitive for this
    // event opportunity, even if an appreciative seller acknowledgement followed.
    const declined=inbound.find(x=>DECLINED.test(x.body));
    if(declined)
      return {state:'declined',reason:'Client explicitly declined in this thread. Do not reopen the same event proposal automatically.',lastMessageDirection:final.outbound?'outbound':'inbound'};
    // Only state confirmed contracts from real sent messages, not assumptions.
    if(outbound.some(x=>AGREEMENT.test(x.body)&&INVOICE.test(x.body)))
      return {state:'fulfillment_check',reason:'Owner states agreement signed and invoice sent. Verify payments and current execution tasks separately.',lastMessageDirection:final.outbound?'outbound':'inbound'};
    if(final.outbound && outbound.some(x=>PROPOSAL.test(x.body)))
      return {state:'proposal_sent_awaiting',reason:'A proposal was sent and no later reply appears in this complete thread. Check other conversations and CRM before contacting again.',lastMessageDirection:'outbound'};
    if(final.outbound)
      return {state:'answered_or_awaiting',reason:'Latest message was outgoing; do not treat earlier inbound inquiries as unanswered.',lastMessageDirection:'outbound'};
    return {state:'inbound_last_review',reason:'Latest message came from an external correspondent. Review its content, other threads and CRM before drafting a response.',lastMessageDirection:'inbound'};
  }
  return {summarizeThread,primaryText};
});