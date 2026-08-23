(()=>{'use strict';
const KEY='lvpt-proof-studio-v2';
const detailCache=new Map();
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function read(){try{const a=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(a)?a:[]}catch{return[]}}
function activeId(){return document.querySelector('.proofBtn.active')?.dataset.id||read()[0]?.id||null}
function normalizeGuests(v){const s=String(v||'').trim();if(!s)return'';return /guest/i.test(s)?s:`${s} Guests`}
function seed(){
  const a=read();let dirty=false;
  a.forEach(p=>{
    let time=p.eventTime||'',guests=p.guestCount||'';
    if(String(p.client||'').trim().toUpperCase()==='NIUM'&&p.date==='2026-10-19'){
      if(!time){time='6PM - 9PM';p.eventTime=time;dirty=true}
      if(!guests){guests='60';p.guestCount=guests;dirty=true}
    }
    detailCache.set(p.id,{eventTime:time,guestCount:guests});
  });
  if(dirty)try{localStorage.setItem(KEY,JSON.stringify(a))}catch{}
}
seed();
const priorSet=Storage.prototype.setItem;
Storage.prototype.setItem=function(k,v){
  if(this===localStorage&&k===KEY){
    try{
      const a=JSON.parse(v||'[]');
      if(Array.isArray(a)){
        a.forEach(p=>{const d=detailCache.get(p.id);if(d){p.eventTime=d.eventTime||'';p.guestCount=d.guestCount||''}});
        v=JSON.stringify(a);
      }
    }catch{}
  }
  return priorSet.call(this,k,v);
};
function saveDetail(id,field,value){
  if(!id)return;
  const d=detailCache.get(id)||{eventTime:'',guestCount:''};d[field]=value;detailCache.set(id,d);
  const a=read(),p=a.find(x=>x.id===id);if(!p)return;p[field]=value;
  try{localStorage.setItem(KEY,JSON.stringify(a))}catch(err){console.error('LVPT event detail save failed',err)}
}
function fieldHtml(id,label,placeholder,type='text'){
  const l=document.createElement('label');l.className='field lvptEventDetail';
  l.innerHTML=`<span>${label}</span><input id="${id}" type="${type}" placeholder="${placeholder}">`;
  return l;
}
function ensureAdminFields(){
  const eventInput=document.getElementById('event');if(!eventInput)return;
  const grid=eventInput.closest('.grid4');if(!grid)return;
  let time=document.getElementById('eventTime');if(!time){const l=fieldHtml('eventTime','Event Time','6PM - 9PM');grid.appendChild(l);time=l.querySelector('input')}
  let guests=document.getElementById('guestCount');if(!guests){const l=fieldHtml('guestCount','Expected Guests','60','number');grid.appendChild(l);guests=l.querySelector('input')}
  const id=activeId(),d=detailCache.get(id)||{};
  if(document.activeElement!==time)time.value=d.eventTime||'';
  if(document.activeElement!==guests)guests.value=d.guestCount||'';
  if(!time.dataset.bound){time.dataset.bound='1';time.addEventListener('input',()=>saveDetail(activeId(),'eventTime',time.value))}
  if(!guests.dataset.bound){guests.dataset.bound='1';guests.addEventListener('input',()=>saveDetail(activeId(),'guestCount',guests.value))}
}
let adminTimer;
const obs=new MutationObserver(()=>{clearTimeout(adminTimer);adminTimer=setTimeout(ensureAdminFields,50)});
if(document.body)obs.observe(document.body,{childList:true,subtree:true});
document.addEventListener('click',e=>{if(e.target.closest('.proofBtn,#newTop,#newSide,#first'))setTimeout(ensureAdminFields,100)});
setTimeout(ensureAdminFields,120);

const previousClientHTML=window.clientHTML;
window.clientHTML=function(p,e,f,o){
  const c=JSON.parse(JSON.stringify(p||{})),d=detailCache.get(c.id)||{};
  c.eventTime=c.eventTime||d.eventTime||'';c.guestCount=c.guestCount||d.guestCount||'';
  let html=previousClientHTML(c,e,f,o);
  try{
    const doc=new DOMParser().parseFromString(html,'text/html');
    const hero=doc.querySelector('.hero');
    if(hero){
      const left=hero.querySelector(':scope > div')||hero.firstElementChild;
      if(left){
        const k=left.querySelector('.k');if(k)k.textContent='CUSTOM EVENT EXPERIENCE';
        const h1=left.querySelector('h1');if(h1)h1.textContent=c.client||'Client';
        const oldEvent=left.querySelector('.event'),oldMeta=left.querySelector('.meta');
        const dateText=c.date?f(c.date):'';
        if(oldEvent){oldEvent.textContent=dateText;oldEvent.classList.add('eventDate')}
        else if(dateText){const x=doc.createElement('p');x.className='event eventDate';x.textContent=dateText;left.appendChild(x)}
        if(oldMeta)oldMeta.remove();
        let facts=left.querySelector('.eventFacts');if(facts)facts.remove();facts=doc.createElement('div');facts.className='eventFacts';
        if(c.eventTime){const x=doc.createElement('div');x.textContent=c.eventTime;facts.appendChild(x)}
        const guestText=normalizeGuests(c.guestCount);if(guestText){const x=doc.createElement('div');x.textContent=guestText;facts.appendChild(x)}
        if(facts.children.length)left.appendChild(facts);
      }
    }
    const style=doc.createElement('style');
    style.textContent=`.eventDate{margin-bottom:7px!important}.eventFacts{display:grid;gap:5px;color:#aaa69f;font-size:12px;line-height:1.35}.eventFacts>div{display:flex;align-items:center;gap:8px}.summaryWide{grid-column:1/-1}.summaryWide strong{font-weight:600;line-height:1.6}.bevSummaryValue{line-height:1.45}@media(max-width:800px){.summaryWide{grid-column:auto}.eventFacts{font-size:11px}}`;
    doc.head.appendChild(style);
    const summary=doc.querySelector('#review .summary');
    if(summary){
      const makeBox=(label,id,value='Not selected')=>{const box=doc.createElement('div');box.className='summaryBox';box.innerHTML=`<span>${esc(label)}</span><strong class="bevSummaryValue" id="${id}">${esc(value)}</strong>`;return box};
      const include=doc.createElement('div');include.className='summaryBox summaryWide';include.innerHTML='<span>EXPERIENCE INCLUDES</span><strong>Top Shelf Liquor (Casa Amigos, Grey Goose, Blanton’s, Eagle Rare, Crown, etc.). 2 Types of Beer, 2 Types of Red Wine and 2 Types of White Wine.</strong>';
      summary.appendChild(include);
      summary.appendChild(makeBox('BEER CHOICES — SELECT 2','sumBeer'));
      summary.appendChild(makeBox('RED WINE CHOICES — SELECT 2','sumRed'));
      summary.appendChild(makeBox('WHITE WINE CHOICES — SELECT 2','sumWhite'));
      summary.appendChild(makeBox('PREMIUM LIQUOR REQUESTS — UP TO 3','sumLiquor','None requested'));
    }
    const script=doc.createElement('script');
    script.textContent=`(()=>{function v(id){return document.getElementById(id)?.value||''}function txt(ids,empty){const a=ids.map(v).filter(Boolean);return a.length?a.join(' · '):empty}function syncIncludedSelections(){const b=document.getElementById('sumBeer'),r=document.getElementById('sumRed'),w=document.getElementById('sumWhite'),l=document.getElementById('sumLiquor');if(b)b.textContent=txt(['beer1','beer2'],'Not selected');if(r)r.textContent=txt(['red1','red2'],'Not selected');if(w)w.textContent=txt(['white1','white2'],'Not selected');if(l)l.textContent=txt(['liq1','liq2','liq3'],'None requested')}['beer1','beer2','red1','red2','white1','white2','liq1','liq2','liq3'].forEach(id=>document.getElementById(id)?.addEventListener('change',syncIncludedSelections));syncIncludedSelections()})();`;
    doc.body.appendChild(script);
    html='<!doctype html>'+doc.documentElement.outerHTML;
  }catch(err){console.error('LVPT header/selection enhancement failed',err)}
  return html;
};
})();
