(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.LVPTMessagePreview=api;
})(typeof window==='undefined'?null:window,function(){
  'use strict';

  // Presentation-only: returned original is always intact. The view removes
  // clear signatures/quoted replies to make the CURRENT message easier to
  // read and avoids treating questions in quoted history as new client asks.
  // This is conservative; uncertainty keeps the original visible.
  const signoff=/^(?:thanks(?: again| so much)?|thank you(?: again)?|best(?: regards)?|kind regards|warm regards|regards|sincerely|cheers|respectfully)[.!,-]*$/i;
  const fullName=/^[A-Z][a-zA-Z.'’-]+(?:\s+[A-Z][a-zA-Z.'’-]+){1,3}$/;
  const allCapsName=/^[A-Z][A-Z.'’-]+(?:\s+[A-Z][A-Z.'’-]+){1,3}$/;
  const roleOrContact=/(?:\b(?:director|manager|president|vice president|founder|operations|marketing|sales|coordinator|assistant|partner|poker room|events|event manager)\b|^\s*(?:D|M|P|C|E)\s+\[?(?:phone|email)\]?\b|(?:\b(?:phone|mobile|cell|email)\b|@\S+\.\w+)|(?:\b(?:the venetian|resort|corporate)\b)|(?:LinkedIn|Instagram|YouTube|Facebook)\b)/i;
  const forwarded=/(?:^On .{5,170} wrote:\s*$|^[-]{2,}\s*Original Message\s*[-]{2,}$|^From:\s+\S.+$|^Sent:\s+(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun|.{3,50}\b20\d\d))/i;
  const socialContact=/(?:\b[\w.-]+\.com\b|\[(?:link|email|phone)\]|\b(?:Instagram|Facebook|LinkedIn|X\s*@|Twitter)\b)/i;
  function quotedStart(lines,i) {
    if(i<1)return false;
    const line=String(lines[i]||'').trim();
    if(forwarded.test(line))return true;
    // Gmail sometimes wraps "On Wed ... <sender> wrote:" across two lines,
    // particularly after redacting the sender email. A visible quote boundary
    // proves the current authored message ends before the clipped quote.
    if(!/^On\s+(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/i.test(line))return false;
    const block=lines.slice(i,i+4).join(' ').replace(/\s+/g,' ').slice(0,500);
    return /\bwrote:\s*(?:>|$)/i.test(block) &&
      /(?:\b20\d\d\b|\[email\]|@)/i.test(block);
  }
  function focus(value){
    const original=String(value==null?'':value).replace(/\r\n?/g,'\n');
    const lines=original.split('\n');
    let cut=lines.length,reason='';
    const quotedHistorySeen=lines.some((_,i)=>quotedStart(lines,i));
    for(let i=1;i<lines.length;i++){
      const line=lines[i].trim();
      if(quotedStart(lines,i)){
        cut=i;reason='quoted_history';break;
      }
      if(/^--\s*$/.test(lines[i])||/^Sent from my (?:iPhone|Android|Galaxy|mobile device)/i.test(line)){
        if(i>1){cut=i;reason='signature';break;}
      }
      if(!line||!(fullName.test(line)||allCapsName.test(line)))continue;
      const prior=lines.slice(Math.max(0,i-6),i).map(x=>x.trim());
      const hasSignoff=prior.some(x=>signoff.test(x));
      const next=lines.slice(i+1,Math.min(lines.length,i+7)).join('\n');
      // Signature blocks often follow a thank-you sentence without a
      // standalone "Thanks," sign-off (e.g., an assistant's name, role,
      // separator and contact block). Require all structural cues so
      // substantive authored content is not mistakenly removed.
      const bareSignature=i>=2&&lines[i-1].trim()===''&&
        roleOrContact.test(String(lines[i+1]||''))&&
        /^[-]{5,}\s*$/m.test(
          lines.slice(i+2,Math.min(lines.length,i+8)).join('\n'));
      const earlierInitials=lines.slice(Math.max(1,i-3),i)
        .findIndex(x=>/^[A-Z]{1,3}$/.test(String(x).trim()));
      const initialsAt=earlierInitials>=0?Math.max(1,i-3)+earlierInitials:-1;
      const initialsSignature=i>=2 && initialsAt>=1 &&
        lines.slice(initialsAt+1,i).every(x=>!String(x).trim()) &&
        socialContact.test(lines.slice(i+1,i+6).join('\n'));
      if((hasSignoff&&roleOrContact.test(next))||bareSignature||
         initialsSignature) {
        cut=initialsSignature?initialsAt:i;reason='signature';break;
      }
    }
    const body=lines.slice(0,cut).join('\n').trim();
    const hidden=lines.slice(cut).join('\n').trim();
    return {
      body:body||original.trim(),
      hidden:hidden||'',
      original,
      shortened:Boolean(hidden&&body),
      // Never use the field to authorize sending; it only permits a strict
      // courtesy-only classifier to ignore a truncated *quoted* old email.
      quotedHistorySeen,
      reason:hidden?reason:''
    };
  }
  return {focus};
});
