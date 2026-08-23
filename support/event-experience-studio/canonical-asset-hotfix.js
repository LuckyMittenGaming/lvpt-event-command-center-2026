(()=>{'use strict';
const DB='lvpt-proof-assets-v1',STORE='assets';
let dbp=null;
const toast=m=>{const t=document.getElementById('toast');if(!t)return;t.textContent=m;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2400)};
const currentId=()=>document.querySelector('.proofBtn.active')?.dataset.id||null;
const assetKey=(id,type,i)=>`${id}|${type}|${i?'B':'A'}`;
function openDB(){if(dbp)return dbp;dbp=new Promise((resolve,reject)=>{if(!('indexedDB'in window))return reject(new Error('IndexedDB unavailable'));const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>{const d=r.result;if(!d.objectStoreNames.contains(STORE))d.createObjectStore(STORE)};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error||new Error('Could not open image storage'))});return dbp}
async function putAsset(key,blob){const d=await openDB();return new Promise((resolve,reject)=>{const tx=d.transaction(STORE,'readwrite');tx.objectStore(STORE).put(blob,key);tx.oncomplete=()=>resolve(true);tx.onerror=()=>reject(tx.error||new Error('Could not save image'))})}
async function getAsset(key){try{const d=await openDB();return await new Promise((resolve,reject)=>{const tx=d.transaction(STORE,'readonly'),r=tx.objectStore(STORE).get(key);r.onsuccess=()=>resolve(r.result||null);r.onerror=()=>reject(r.error)})}catch{return null}}
async function paint(type,i){const root=document.getElementById(type==='cul'?'foods':'drinks');if(!root)return;const card=root.querySelectorAll('.culinaryAdminCard')[i];const hero=card?.querySelector('.hero');if(!hero)return;const blob=await getAsset(assetKey(currentId(),type,i));if(!blob)return;const old=hero.dataset.obj;if(old)URL.revokeObjectURL(old);const u=URL.createObjectURL(blob);hero.dataset.obj=u;hero.innerHTML=`<img src="${u}" alt="Option ${i?'B':'A'}" style="display:block;width:100%;height:auto;object-fit:contain">`}
document.addEventListener('change',async e=>{const input=e.target.closest?.('[data-canon-img]');if(!input)return;
  e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
  input.onchange=null;
  const f=input.files?.[0];if(!f)return;
  if(!/^image\/(png|jpeg|webp)$/i.test(f.type)){toast('Please use a PNG, JPG or WEBP image.');return}
  if(f.size>25*1024*1024){toast('Please use an image under 25 MB.');return}
  const [type,n]=input.dataset.canonImg.split(':'),i=+n,id=currentId();if(!id)return;
  try{await putAsset(assetKey(id,type,i),f);await paint(type,i);toast(`${type==='cul'?'Culinary':'Bar'} Option ${i?'B':'A'} image saved`)}catch(err){console.error('LVPT canonical asset save failed',err);toast('Could not save this image. Please try the file again.')}
},true);
})();
