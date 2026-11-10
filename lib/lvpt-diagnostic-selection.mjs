// Privacy-safe diagnostic candidate selection from already-bounded, read-only
// Apps Script metadata. The selected thread id NEVER enters the audit table.
// No scheduling, drafting, sending, or batch message-body reads.
const THREAD=/^[a-f0-9]{8,32}$/i;
function recentDate(value,nowMs=Date.now()) {
  if(typeof value!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/.test(value))
    return '';
  const ms=Date.parse(value);
  if(!Number.isFinite(ms)||ms<nowMs-32*86400000||ms>nowMs+86400000)
    return '';
  return new Date(ms).toISOString();
}
function selectDiagnosticThreads(rows,nowMs=Date.now(),max=3) {
  if(!Array.isArray(rows))return [];
  const limit=Number.isInteger(max)?Math.max(0,Math.min(3,max)):3;
  const seen=new Set();
  const safe=rows.filter(row=>{
    if(!row||typeof row!=='object')return false;
    const id=String(row.threadId||'').toLowerCase();
    if(!THREAD.test(id)||seen.has(id)||!recentDate(row.lastMessageAt,nowMs)||
       row.sourceType!=='email_thread'||row.lastDirection!=='inbound'||
       row.needsHumanReview!==true||
       !['unclassified','vendor'].includes(String(row.relationshipHint)))
      return false;
    seen.add(id);return true;
  });
  // Check likely client questions first, venue operations only after them.
  // Never infer a client email recipient from metadata alone.
  const ordered=[
    ...safe.filter(row=>row.relationshipHint==='unclassified'),
    ...safe.filter(row=>row.relationshipHint==='vendor')
  ];
  return ordered.slice(0,limit).map(row=>({
    threadId:String(row.threadId).toLowerCase(),
    lastMessageAt:recentDate(row.lastMessageAt,nowMs),
    selectionMode:row.relationshipHint==='vendor'?
      'automatic_vendor':'automatic_client'
  }));
}
function selectDiagnosticThread(rows,nowMs=Date.now()) {
  return selectDiagnosticThreads(rows,nowMs,1)[0]||null;
}
// Negative control: an already-answered LVPT business conversation. Only
// an owner-clicked diagnostic may inspect it, and only to assert that the
// read-only recipient checker refuses it. This is never a reply candidate.
function selectDiagnosticNegativeControl(rows,nowMs=Date.now()) {
  if(!Array.isArray(rows))return null;
  const match=rows.find(row=>
    row&&typeof row==='object'&&THREAD.test(String(row.threadId||''))&&
    recentDate(row.lastMessageAt,nowMs)&&row.sourceType==='email_thread'&&
    row.lastDirection==='outbound'&&row.relationshipHint==='outbound'&&
    row.needsHumanReview===false
  );
  if(!match)return null;
  return {threadId:String(match.threadId).toLowerCase(),
    lastMessageAt:recentDate(match.lastMessageAt,nowMs),
    selectionMode:'negative_outbound'};
}
export {selectDiagnosticThread,selectDiagnosticThreads,selectDiagnosticNegativeControl};
