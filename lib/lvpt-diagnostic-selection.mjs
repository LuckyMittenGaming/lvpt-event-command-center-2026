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
function selectDiagnosticThread(rows,nowMs=Date.now()) {
  if(!Array.isArray(rows))return null;
  const safe=rows.filter(row=>
    row&&typeof row==='object' &&
    THREAD.test(String(row.threadId||'')) &&
    recentDate(row.lastMessageAt,nowMs) &&
    row.sourceType==='email_thread' &&
    row.lastDirection==='inbound' &&
    row.needsHumanReview===true
  );
  // Prefer a possible *direct* client inquiry, but still never treat this
  // as authorization to draft or reply. Venue operations are fallback only.
  const selected=safe.find(x=>x.relationshipHint==='unclassified')||
    safe.find(x=>x.relationshipHint==='vendor');
  if(!selected)return null;
  return {
    threadId:String(selected.threadId).toLowerCase(),
    lastMessageAt:recentDate(selected.lastMessageAt,nowMs),
    selectionMode:selected.relationshipHint==='vendor'?
      'automatic_vendor':'automatic_client'
  };
}
export {selectDiagnosticThread};
