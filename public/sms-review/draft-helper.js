(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.LVPTDraftHelper=api;
})(typeof window==='undefined'?null:window,function(){
  'use strict';
  function previewBody(raw,max=700) {
    const body=String(raw||'');
    // Keep the recent authored text, not long repeatedly quoted histories.
    const top=body.split(/\n\s*(?:On .{6,110} wrote:|-----Original Message-----|From: .{3,140}\nSent:)/i)[0];
    return top.trim().replace(/\n{3,}/g,'\n\n').slice(0,max);
  }
  function safeSubject(raw) {
    const s=String(raw||'').replace(/[\r\n]+/g,' ').slice(0,180).trim();
    if(!s)return 'Re: Your Las Vegas Poker Training inquiry';
    return /^re:/i.test(s)?s:'Re: '+s;
  }
  function buildStarter(context,event,nowMs=Date.now()) {
    if(!context||context.ok!==true || !Array.isArray(context.messages) ||
       !context.messages.length || !context.recipientEmail)
      return {ready:false,body:'',warning:'Verified conversation content is required.'};
    const last=context.messages.at(-1);
    const lastDate=Date.parse(context.lastMessageAt||'');
    if(!Number.isFinite(lastDate)||lastDate>nowMs)
      return {ready:false,body:'',warning:'Conversation timestamp unavailable.'};
    const days=Math.floor((nowMs-lastDate)/86400000);
    const name=String(event?.eventName||'the event').slice(0,90);
    const stage=String(event?.eventStatus||'');
    const latestInbound=context.messages.slice().reverse().find(m=>m.direction==='inbound');
    const latestClientText=previewBody(latestInbound?.body||'',1500);
    const outOfOffice=/\b(?:out of (?:town|the office)|on vacation|away for (?:a few|several|two|three) weeks|when i.m back|once i.m back)\b/i.test(latestClientText);
    const isOWS=context.eventKey==='ows-aws';
    const offer= /proposal/i.test(stage) ? 'proposal' : 'corporate poker experience inquiry';
    const header={
      ready:true,to:context.recipientEmail,subject:safeSubject(context.subject),
      lastMessage:previewBody(last.body),
      partial:context.partial===true,
      body:'',warning:''
    };
    if(isOWS) {
      header.warning='OWS has more than one event. Resolve the correct event and current question before drafting.';
      return header;
    }
    if(last.direction==='inbound') {
      header.warning='The client wrote last. Review the full message and answer their specific request; no generic response was generated.';
      return header;
    }
    if(outOfOffice && days<21) {
      header.warning='Client indicated time away from the office. Avoid an immediate follow-up; verify their return timing.';
      return header;
    }
    const minDays=/proposal/i.test(stage)?10:7;
    if(days<minDays) {
      header.warning='The most recent LVPT message is only '+days+' day(s) old. Review timing before contacting them again.';
      return header;
    }
    if(context.partial) {
      header.warning='Thread is incomplete or truncated. Review the full Gmail conversation before using this starter.';
    }
    header.body='Hi,\n\nI wanted to follow up on the '+name+' '+offer+
      ' we discussed. If you have any questions or would like adjustments, I would be happy to help.\n\n'+
      'When you have a moment, let me know where things stand and whether there is anything you need from us for the next steps.\n\n'+
      'Thanks,\nMatt\nLas Vegas Poker Training';
    return header;
  }
  return {buildStarter,previewBody,safeSubject};
});
