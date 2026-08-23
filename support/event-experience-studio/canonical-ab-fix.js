(()=>{'use strict';
const KEY='lvpt-proof-studio-v2';
const nativeSetItem=Storage.prototype.setItem;
const rd=()=>{try{const x=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(x)?x:[]}catch{return[]}};
const aid=()=>document.querySelector('.proofBtn.active')?.dataset.id||null;
const esc=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function ensure(p){
  if(!p)return p;
  if(!Array.isArray(p.culinaryOptions)||p.culinaryOptions.length!==2)p.culinaryOptions=[{key:'A',label:'Option A',image:'',vendor:'Art of Cooking'},{key:'B',label:'Option B',image:'',vendor:'Cut & Taste'}];
  if(!Array.isArray(p.beverageOptions)||p.beverageOptions.length!==2)p.beverageOptions=[{key:'A',label:'Option A',image:'',internal:'Premium Drink Concept A'},{key:'B',label:'Option B',image:'',internal:'Premium Drink Concept B'}];
  p.culinaryOptions.forEach((o,i)=>{o.key=i?'B':'A';o.label='Option '+o.key;o.image=o.image||'';o.vendor=o.vendor||(i?'Cut & Taste':'Art of Cooking')});
  p.beverageOptions.forEach((o,i)=>{o.key=i?'B':'A';o.label='Option '+o.key;o.image=o.image||'';o.internal=o.internal||('Premium Drink Concept '+o.key)});
  p.foods=[];
  p.drinks=[];
  return p;
}
function sanitize(raw){
  try{const a=JSON.parse(raw||'[]');if(!Array.isArray(a))return raw;a.forEach(ensure);return JSON.stringify(a)}catch{return raw}
}
Storage.prototype.setItem=function(k,v){
  if(this===localStorage&&k===KEY)v=sanitize(v);
  return nativeSetItem.call(this,k,v);
};
try{const raw=localStorage.getItem(KEY);if(raw){const clean=sanitize(raw);if(clean!==raw)nativeSetItem.call(localStorage,KEY,clean)}}catch{}
function saveProof(p){
  const a=rd(),i=a.findIndex(x=>x.id===p.id);if(i<0)return false;a[i]=ensure(p);
  try{nativeSetItem.call(localStorage,KEY,JSON.stringify(a));return true}catch(err){console.error('LVPT A/B save failed',err);return false}
}
function imageData(file,max=1200){return new Promise((res,rej)=>{if(!file)return rej(new Error('No image selected'));const r=new FileReader();r.onerror=rej;r.onload=()=>{const im=new Image();im.onerror=rej;im.onload=()=>{const s=Math.min(1,max/Math.max(im.naturalWidth||im.width,im.naturalHeight||im.height)),c=document.createElement('canvas');c.width=Math.max(1,Math.round((im.naturalWidth||im.width)*s));c.height=Math.max(1,Math.round((im.naturalHeight||im.height)*s));const x=c.getContext('2d',{alpha:false});x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);x.drawImage(im,0,0,c.width,c.height);try{res(c.toDataURL('image/webp',.8))}catch{res(r.result)}};im.src=r.result};r.readAsDataURL(file)})}
function cards(arr,type){return '<div class="culinaryAB canonicalAB">'+arr.map((o,i)=>`<article class="culinaryAdminCard"><div class="hero">${o.image?`<img src="${o.image}" alt="${esc(o.label)}">`:'<div class="assetEmpty" style="width:100%;min-height:210px;display:grid;place-items:center">Upload hero image</div>'}</div><div class="body"><h3>${esc(o.label)}</h3><p>${type==='cul'?'One complete culinary experience.':'One complete premium bar experience.'} Client sees no pricing or vendor details.</p><label class="lab">Replace Hero Image</label><input type="file" accept="image/png,image/jpeg,image/webp" data-canon-img="${type}:${i}"><label class="lab vendor" style="display:block;margin-top:10px">Internal ${type==='cul'?'Vendor':'Label'} <em>hidden</em></label><input class="mini" data-canon-txt="${type}:${i}" value="${esc(type==='cul'?o.vendor:o.internal)}"></div></article>`).join('')+'</div>'}
let rendering=false;
function renderCanonical(){
  if(rendering)return;rendering=true;
  try{
    const id=aid(),a=rd(),p=a.find(x=>x.id===id);if(!p)return;ensure(p);saveProof(p);
    const f=document.getElementById('foods'),fs=f?.closest('section');
    if(f&&fs){
      fs.querySelector('.secHead').innerHTML='<div><div class="ey">CULINARY EXPERIENCE</div><h2>Culinary Options A / B</h2><p>Client chooses one complete culinary experience. Only two large hero-image options are used in this version.</p></div>';
      f.innerHTML=cards(p.culinaryOptions,'cul');document.getElementById('foodEmpty')?.classList.add('hidden');fs.querySelectorAll('#addFood,#niumFood').forEach(x=>x.style.display='none');
    }
    const b=document.getElementById('drinks'),bs=b?.closest('section');
    if(b&&bs){
      bs.querySelector('.secHead').innerHTML='<div><div class="ey">PREMIUM DRINK EXPERIENCE</div><h2>Bar Experience Options A / B</h2><p>Client chooses one complete bar experience, then selects beer, wine and optional premium liquor preferences.</p></div>';
      b.innerHTML=cards(p.beverageOptions,'bev');document.getElementById('drinkEmpty')?.classList.add('hidden');bs.querySelectorAll('#addDrink').forEach(x=>x.style.display='none');
    }
    const fc=document.getElementById('fc');if(fc)fc.textContent='2 Culinary · 2 Bar';
    document.querySelectorAll('[data-canon-txt]').forEach(inp=>inp.oninput=()=>{const [type,n]=inp.dataset.canonTxt.split(':'),all=rd(),q=all.find(x=>x.id===aid());if(!q)return;ensure(q);if(type==='cul')q.culinaryOptions[+n].vendor=inp.value;else q.beverageOptions[+n].internal=inp.value;saveProof(q)});
    document.querySelectorAll('[data-canon-img]').forEach(inp=>inp.onchange=async()=>{const file=inp.files?.[0];if(!file)return;try{const [type,n]=inp.dataset.canonImg.split(':'),all=rd(),q=all.find(x=>x.id===aid());if(!q)return;ensure(q);const img=await imageData(file,1200);if(type==='cul')q.culinaryOptions[+n].image=img;else q.beverageOptions[+n].image=img;if(!saveProof(q))alert('That image could not be saved because browser storage is full.');renderCanonical()}catch(err){console.error(err)}});
  }finally{rendering=false}
}
let timer;
function schedule(){clearTimeout(timer);timer=setTimeout(()=>{const f=document.getElementById('foods'),b=document.getElementById('drinks');if((f&&!f.querySelector('.canonicalAB'))||(b&&!b.querySelector('.canonicalAB')))renderCanonical()},30)}
const obs=new MutationObserver(muts=>{for(const m of muts){if(m.type!=='childList')continue;const t=m.target;if(t?.id==='foods'||t?.id==='drinks'||t?.closest?.('#foods,#drinks')){schedule();break}}});
if(document.body)obs.observe(document.body,{subtree:true,childList:true});
document.addEventListener('click',e=>{if(e.target.closest('.proofBtn,#newTop,#newSide,#first'))setTimeout(renderCanonical,80)});
document.addEventListener('input',()=>setTimeout(()=>{const fc=document.getElementById('fc');if(fc)fc.textContent='2 Culinary · 2 Bar'},220),true);
setTimeout(renderCanonical,120);
})();
