function openDocDb(){ return new Promise((resolve,reject)=>{ const request=indexedDB.open(DB_NAME,1); request.onupgradeneeded=()=>{ const db=request.result; if(!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE,{keyPath:'id'}); }; request.onsuccess=()=>resolve(request.result); request.onerror=()=>reject(request.error); }); }
async function saveDocumentBlob(idValue,file){ const db=await openDocDb(); return new Promise((resolve,reject)=>{ const tx=db.transaction(DB_STORE,'readwrite'); tx.objectStore(DB_STORE).put({id:idValue,file}); tx.oncomplete=()=>resolve(); tx.onerror=()=>reject(tx.error); }); }
async function getDocumentBlob(idValue){ const db=await openDocDb(); return new Promise((resolve,reject)=>{ const request=db.transaction(DB_STORE,'readonly').objectStore(DB_STORE).get(idValue); request.onsuccess=()=>resolve(request.result?.file||null); request.onerror=()=>reject(request.error); }); }
async function deleteDocumentBlob(idValue){ const db=await openDocDb(); return new Promise((resolve,reject)=>{ const tx=db.transaction(DB_STORE,'readwrite'); tx.objectStore(DB_STORE).delete(idValue); tx.oncomplete=()=>resolve(); tx.onerror=()=>reject(tx.error); }); }

/** Document writes and private blob/Drive fetches stay off until a granular write is approved. */
function documentMutationsEnabled(){ return false; }

/**
 * Authoritative document source URLs must be https without embedded credentials.
 * Missing stays missing; invalid/unsupported stays invalid. Never invent a URL.
 */
function validateDocumentSourceUrl(value){
  const raw=String(value??'').trim();
  if(!raw) return { ok:false, url:'', reason:'missing', raw:'' };
  if(/\s/.test(raw)) return { ok:false, url:'', reason:'invalid', raw };
  try {
    const url=new URL(raw);
    if(url.protocol!=='https:'||!url.hostname||url.username||url.password){
      return { ok:false, url:'', reason:'invalid', raw };
    }
    return { ok:true, url:url.toString(), reason:'valid', raw };
  } catch {
    return { ok:false, url:'', reason:'invalid', raw };
  }
}

/** Prefer stable sheet fields: url, driveUrl, then downloadUrl. First valid https wins. */
function resolveDocumentSourceUrl(doc){
  if(!doc||typeof doc!=='object') return { ok:false, url:'', reason:'missing', raw:'', field:'' };
  const candidates=[
    ['url', doc.url],
    ['driveUrl', doc.driveUrl],
    ['downloadUrl', doc.downloadUrl]
  ];
  let sawInvalid=false;
  for(const [field,value] of candidates){
    if(value==null||value==='') continue;
    const validated=validateDocumentSourceUrl(value);
    if(validated.ok) return { ...validated, field };
    if(validated.reason==='invalid') sawInvalid=true;
  }
  return { ok:false, url:'', reason:sawInvalid?'invalid':'missing', raw:'', field:'' };
}

function documentAssociationRows(event){
  const docs=Array.isArray(event&&event.documents)?event.documents:[];
  return docs.map((doc)=>{
    const idValue=doc&&doc.id?String(doc.id):'';
    const name=doc&&(doc.name||doc.title)?String(doc.name||doc.title):'Untitled document';
    const category=doc&&doc.category?String(doc.category):'Category unavailable';
    const source=resolveDocumentSourceUrl(doc);
    let linkState='unavailable';
    let linkLabel='Source link unavailable';
    if(source.ok){
      linkState='linked';
      linkLabel='Open source link';
    } else if(source.reason==='invalid'){
      linkState='unsupported';
      linkLabel='Unsupported or invalid source link';
    }
    return { id:idValue, name, category, source, linkState, linkLabel };
  });
}

function formatDocumentAssociationHtml(event){
  const rows=documentAssociationRows(event);
  if(!rows.length){
    return '<p data-document-count="0">0 document rows on this event. File bytes are not opened here. Document writes stay off.</p>';
  }
  const items=rows.map((row)=>{
    const link=row.linkState==='linked'
      ? `<a href="${escapeHtml(row.source.url)}" target="_blank" rel="noopener" data-document-link="linked">Open source link</a>`
      : `<span data-document-link="${escapeHtml(row.linkState)}">${escapeHtml(row.linkLabel)}</span>`;
    return `<li data-document-id="${escapeHtml(row.id)}" data-document-link-state="${escapeHtml(row.linkState)}">${escapeHtml(row.name)} · ${escapeHtml(row.category)} · ${link}</li>`;
  }).join('');
  return `<p data-document-count="${rows.length}">${rows.length} document row${rows.length===1?'':'s'} on this event. File bytes are not opened here. Document writes stay off.</p><ul data-document-associations>${items}</ul>`;
}

function formatDocumentAssociationText(event){
  const rows=documentAssociationRows(event);
  if(!rows.length) return 'No documents indexed.';
  return rows.map((row)=>{
    const idPart=row.id||'missing-id';
    const linkPart=row.linkState==='linked'?'source link available':row.linkLabel.toLowerCase();
    return `- ${idPart}: ${row.category}: ${row.name} | ${linkPart}`;
  }).join('\n');
}

function renderDocumentsTab(event){
  const rows=documentAssociationRows(event);
  const list=rows.length
    ? `<div class="document-list" data-document-associations>${rows.map((row)=>{
        const link=row.linkState==='linked'
          ? `<a class="btn small" href="${escapeHtml(row.source.url)}" target="_blank" rel="noopener" data-document-link="linked">Open source link</a>`
          : `<span class="muted" data-document-link="${escapeHtml(row.linkState)}">${escapeHtml(row.linkLabel)}</span>`;
        return `<div class="document-card" data-document-id="${escapeHtml(row.id)}" data-document-link-state="${escapeHtml(row.linkState)}"><div class="doc-name"><h4>${escapeHtml(row.name)}</h4><p>${escapeHtml(row.category)} · association only</p></div><div><span class="label">Source</span><strong>${link}</strong></div></div>`;
      }).join('')}</div>`
    : '<div class="empty-state">0 document rows on this event.</div>';
  $('#tabContent').innerHTML=`<div class="panel-head"><div><p class="eyebrow small">Event Document Associations</p><h2>Invoices, Receipts & Files</h2></div></div><div class="storage-note">Counts and links use authoritative document rows for this validated event only. Private file bytes are not fetched. Upload, delete, and browser IndexedDB writes stay off until a granular write is approved.</div><h3 class="section-title" data-document-count="${rows.length}">${rows.length} Document Row${rows.length===1?'':'s'}</h3>${list}`;
}
function documentCard(doc){
  const rows=documentAssociationRows({ documents:[doc] });
  const row=rows[0]||{ id:'', name:'Untitled document', category:'Category unavailable', linkState:'unavailable', linkLabel:'Source link unavailable', source:{ ok:false } };
  const link=row.linkState==='linked'
    ? `<a class="btn small" href="${escapeHtml(row.source.url)}" target="_blank" rel="noopener">Open source link</a>`
    : `<span class="muted">${escapeHtml(row.linkLabel)}</span>`;
  return `<div class="document-card" data-document-id="${escapeHtml(row.id)}"><div class="doc-name"><h4>${escapeHtml(row.name)}</h4><p>${escapeHtml(row.category)}</p></div><div class="document-actions">${link}</div></div>`;
}
async function handleDocumentFiles(){
  toast('Document uploads stay off until a granular write is approved.');
}
async function openDocument(){
  toast('Private document bytes are not opened from this workspace.');
}
async function downloadDocument(){
  toast('Private document downloads stay off from this workspace.');
}
async function removeDocument(){
  toast('Document deletes stay off until a granular write is approved.');
}

function buildGmailQuery(event){ const parts=[]; if(event.contactEmail) parts.push(`from:(${event.contactEmail}) OR to:(${event.contactEmail})`); const keywords=event.setup.gmailKeywords||event.company||event.eventName; if(keywords) parts.push(`(${keywords.split(/\s+/).filter(Boolean).slice(0,6).join(' OR ')})`); return parts.join(' ')||'newer_than:1y'; }
async function checkGmailStatus(showToast=true){
  try { const response=await fetch('/api/gmail/status',{cache:'no-store'}); const data=await response.json(); gmailStatus={checked:true,configured:Boolean(data.configured),email:data.email||'book@pokertraininglasvegas.com',message:data.message||''}; if(showToast) toast(data.configured?'Gmail connection is configured':'Gmail environment setup is still required'); }
  catch(error){ gmailStatus={checked:true,configured:false,email:'book@pokertraininglasvegas.com',message:'Status endpoint unavailable'}; if(showToast) toast('Gmail status endpoint is not available yet'); }
  renderSystemStatuses(); if(activeTab==='inbox'||activeTab==='system') renderTab();
}
function gmailKey(){ return sessionStorage.getItem(GMAIL_KEY_SESSION)||''; }
function saveGmailKey(){ sessionStorage.removeItem(GMAIL_KEY_SESSION); const field=$('#gmailSyncKey'); if(field) field.value=''; toast('The sync key is not stored in this browser.'); }
