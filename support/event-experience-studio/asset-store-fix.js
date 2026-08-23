(()=>{'use strict';
const KEY='lvpt-proof-studio-v2';
const DB='lvpt-proof-assets-v1';
const STORE='assets';
let dbp=null, syncTimer=null, lastFrameUrl='', painting=false;
const $=s=>document.querySelector(s);
const esc=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=d=>{if(!d)return'';const a=String(d).split('-').map(Number);return a.length===3?new Intl.DateTimeFormat('en-US',{month:'long',day:'numeric',year:'numeric'}).format(new Date(a[0],a[1]-1,a[2])):d};
const safe=(s,f='portal')=>(s||f).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60)||f;
const toast=m=>{const t=$('#toast');if(!t)return;t.textContent=m;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2600)};
function read(){try{const a=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(a)?a:[]}catch{return[]}}
function currentId(){return $('.proofBtn.active')?.dataset.id||read()[0]?.id||null}
function current(){const id=currentId();return read().find(x=>x.id===id)||null}
function ensure(p){if(!p)return p;p.culinaryOptions=Array.isArray(p.culinaryOptions)&&p.culinaryOptions.length===2?p.culinaryOptions:[{key:'A',label:'Option A',image:'',vendor:'Art of Cooking'},{key:'B',label:'Option B',image:'',vendor:'Cut & Taste'}];p.beverageOptions=Array.isArray(p.beverageOptions)&&p.beverageOptions.length===2?p.beverageOptions:[{key:'A',label:'Option A',image:'',internal:'Premium Drink Concept A'},{key:'B',label:'Option B',image:'',internal:'Premium Drink Concept B'}];return p}
function liveField(el,name,fallback=''){const n=el?.querySelector(`[data-f="${name}"]`);return n?n.value:(fallback||'')}
function liveImage(el,field,fallback=''){const input=el?.querySelector(`input[data-img$=":${field}"]`),img=input?.closest('.upload')?.querySelector('img');return img?.getAttribute('src')||fallback||''}
function overlayLiveEditor(p){
  if(!p)return p;
  const cardEls=[...document.querySelectorAll('#cards .opt[data-kind="card"]')];
  if(cardEls.length){
    const prior=new Map((p.cards||[]).map(x=>[x.id,x]));
    p.cards=cardEls.map((el,i)=>{const id=el.dataset.id||`live-card-${i+1}`,old=prior.get(id)||{};return{id,title:liveField(el,'title',old.title||`Card Option ${i+1}`),stock:liveField(el,'stock',old.stock),desc:liveField(el,'desc',old.desc),finish:liveField(el,'finish',old.finish),ref:liveField(el,'ref',old.ref),front:liveImage(el,'front',old.front),back:liveImage(el,'back',old.back)}});
  }
  const chipEls=[...document.querySelectorAll('#chips .opt[data-kind="chip"]')];
  if(chipEls.length){
    const prior=new Map((p.chips||[]).map(x=>[x.id,x]));
    p.chips=chipEls.map((el,i)=>{const id=el.dataset.id||`live-chip-${i+1}`,old=prior.get(id)||{};return{id,title:liveField(el,'title',old.title||`Chip Option ${i+1}`),denom:liveField(el,'denom',old.denom),desc:liveField(el,'desc',old.desc),finish:liveField(el,'finish',old.finish),ref:liveField(el,'ref',old.ref),image:liveImage(el,'image',old.image)}});
  }
  ['client','event','date','location','label','note'].forEach(k=>{const n=document.getElementById(k);if(n&&'value'in n)p[k]=n.value});
  const notify=document.getElementById('notify');if(notify)p.notificationEmail=notify.value;
  return p;
}
function liveCurrent(){const base=current();return base?overlayLiveEditor(JSON.parse(JSON.stringify(base))):null}
function assetKey(id,type,i){return `${id}|${type}|${i?'B':'A'}`}
function openDB(){if(dbp)return dbp;dbp=new Promise((resolve,reject)=>{if(!('indexedDB'in window))return reject(new Error('IndexedDB unavailable'));const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>{const d=r.result;if(!d.objectStoreNames.contains(STORE))d.createObjectStore(STORE)};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error||new Error('Could not open image storage'))});return dbp}
async function putAsset(key,blob){const d=await openDB();return new Promise((resolve,reject)=>{const tx=d.transaction(STORE,'readwrite');tx.objectStore(STORE).put(blob,key);tx.oncomplete=()=>resolve(true);tx.onerror=()=>reject(tx.error||new Error('Could not save image'))})}
async function getAsset(key){try{const d=await openDB();return await new Promise((resolve,reject)=>{const tx=d.transaction(STORE,'readonly'),r=tx.objectStore(STORE).get(key);r.onsuccess=()=>resolve(r.result||null);r.onerror=()=>reject(r.error)})}catch{return null}}
function dataUrlToBlob(s){try{const [h,b]=s.split(','),m=(h.match(/data:([^;]+)/)||[])[1]||'image/webp',bin=atob(b),u=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);return new Blob([u],{type:m})}catch{return null}}
function blobToDataURL(blob){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(blob)})}
async function migrateEmbedded(){const a=read();let dirty=false;for(const p0 of a){const p=ensure(p0);for(const [type,arr] of [['cul',p.culinaryOptions],['bev',p.beverageOptions]])for(let i=0;i<2;i++){const o=arr[i];if(o?.image&&String(o.image).startsWith('data:')){const b=dataUrlToBlob(o.image);if(b){try{await putAsset(assetKey(p.id,type,i),b);o.image='';dirty=true}catch{}}}}p.foods=[];p.drinks=[]}
if(dirty){try{localStorage.setItem(KEY,JSON.stringify(a))}catch{}}
}
async function paintAdmin(){if(painting)return;painting=true;try{const p=ensure(current());if(!p)return;for(const [type,sel] of [['cul','#foods'],['bev','#drinks']]){const root=$(sel);if(!root)continue;const cards=[...root.querySelectorAll('.culinaryAdminCard')];for(let i=0;i<Math.min(2,cards.length);i++){const hero=cards[i].querySelector('.hero');if(!hero)continue;const key=assetKey(p.id,type,i),blob=await getAsset(key);if(!blob)continue;if(hero.dataset.assetPainted===key&&hero.querySelector('img'))continue;const old=hero.dataset.obj,u=URL.createObjectURL(blob);hero.dataset.assetPainted=key;hero.dataset.obj=u;hero.innerHTML=`<img src="${u}" alt="Option ${i?'B':'A'}">`;if(old&&old!==u)setTimeout(()=>URL.revokeObjectURL(old),0)}}}finally{painting=false}}
function schedulePaint(){clearTimeout(syncTimer);syncTimer=setTimeout(()=>paintAdmin(),80)}
document.addEventListener('change',async e=>{const input=e.target.closest?.('[data-cul-img],[data-bev-img]');if(!input)return;e.preventDefault();e.stopImmediatePropagation();const f=input.files?.[0];if(!f)return;if(!/^image\/(png|jpeg|webp)$/i.test(f.type)){toast('Please use a PNG, JPG or WEBP image.');return}if(f.size>25*1024*1024){toast('Please use an image under 25 MB.');return}const type=input.hasAttribute('data-cul-img')?'cul':'bev',i=+(input.dataset[type+'Img']||0),id=currentId();if(!id)return;try{await putAsset(assetKey(id,type,i),f);const root=$(type==='cul'?'#foods':'#drinks'),hero=root?.querySelectorAll('.culinaryAdminCard')?.[i]?.querySelector('.hero');if(hero)delete hero.dataset.assetPainted;toast(`${type==='cul'?'Culinary':'Bar'} Option ${i?'B':'A'} image saved`);schedulePaint()}catch(err){console.error(err);toast('Your browser could not save this image. Image storage may be disabled or unavailable.')}},true);
const obs=new MutationObserver(muts=>{for(const m of muts){const t=m.target;if(t?.classList?.contains('hero')||t?.closest?.('.culinaryAdminCard .hero'))continue;if(t?.id==='foods'||t?.id==='drinks'||t?.closest?.('#foods,#drinks')){schedulePaint();break}}});
if(document.body)obs.observe(document.body,{childList:true,subtree:true});
async function hydratedProof(){const p=ensure(liveCurrent());if(!p?.id)return null;for(const [type,arr] of [['cul',p.culinaryOptions],['bev',p.beverageOptions]])for(let i=0;i<2;i++){const b=await getAsset(assetKey(p.id,type,i));if(b)arr[i].image=await blobToDataURL(b)}p.foods=[];p.drinks=[];p.__assetHydrated=true;return p}
async function renderHTML(mode){const p=await hydratedProof();if(!p)return'';const all=read(),idx=all.findIndex(x=>x.id===p.id),synthetic=[...all];if(idx>=0)synthetic[idx]=p;else synthetic.unshift(p);const proto=Storage.prototype,orig=proto.getItem;proto.getItem=function(k){if(this===localStorage&&k===KEY)return JSON.stringify(synthetic);return orig.call(this,k)};try{return window.clientHTML(p,esc,fmt,{mode})}finally{proto.getItem=orig}}
async function preview(){const html=await renderHTML('interactive');if(!html)return;const b=new Blob([html],{type:'text/html'}),u=URL.createObjectURL(b),frame=$('#frame'),modal=$('#modal');if(lastFrameUrl)URL.revokeObjectURL(lastFrameUrl);lastFrameUrl=u;frame.src=u;modal.classList.remove('hidden');document.body.style.overflow='hidden'}
async function download(){const p=liveCurrent();if(!p)return;const html=await renderHTML('interactive'),u=URL.createObjectURL(new Blob([html],{type:'text/html'})),a=document.createElement('a');a.href=u;a.download=`${safe(p.client||p.event,'client')}-event-experience.html`;a.click();setTimeout(()=>URL.revokeObjectURL(u),1500);toast('Client portal HTML created')}
async function generate(){const html=await renderHTML('print');if(!html)return;const w=window.open('about:blank','_blank');if(!w){toast('Please allow pop-ups to create the PDF');return}w.document.open();w.document.write(html);w.document.close();let done=false,go=()=>{if(done)return;done=true;w.focus();w.print();toast('Choose Save to PDF in the print dialog')};const imgs=[...w.document.images];if(!imgs.length||imgs.every(i=>i.complete))setTimeout(go,500);else{let left=imgs.length,one=()=>{if(--left<=0)setTimeout(go,300)};imgs.forEach(i=>i.complete?one():(i.addEventListener('load',one,{once:true}),i.addEventListener('error',one,{once:true})));setTimeout(go,3500)}}
function bindDelivery(){const p=$('#preview'),d=$('#downloadPortal'),g=$('#generate');if(p)p.onclick=preview;if(d)d.onclick=download;if(g)g.onclick=generate}
setInterval(bindDelivery,600);
(async()=>{await migrateEmbedded();bindDelivery();schedulePaint()})();
})();