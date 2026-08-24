(()=>{'use strict';
const prior=window.clientHTML;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
window.clientHTML=function(p,e,f,o){
  let html=prior(p,e,f,o);
  try{
    const doc=new DOMParser().parseFromString(html,'text/html');
    const review=doc.querySelector('#review');
    if(!review)return html;
    const summary=review.querySelector('.summary');
    const visual=doc.createElement('section');
    visual.className='visualSelections';
    visual.innerHTML='<div class="visualSelectionsHead"><div><div class="k">YOUR CHOSEN DESIGNS</div><h3>Selection Preview</h3></div><p>Your current choices are shown here for a quick final check.</p></div><div id="visualSelectionGrid" class="visualSelectionGrid"><div class="visualEmpty">Choose options above to see them here.</div></div>';
    if(summary)summary.insertAdjacentElement('afterend',visual);else review.insertBefore(visual,review.firstChild);
    const style=doc.createElement('style');
    style.textContent=`.visualSelections{margin:4px 0 20px;border:1px solid rgba(215,173,88,.20);border-radius:17px;padding:16px;background:linear-gradient(145deg,rgba(215,173,88,.055),rgba(12,12,11,.96) 38%);box-shadow:inset 0 1px 0 rgba(255,255,255,.04)}.visualSelectionsHead{display:flex;align-items:end;justify-content:space-between;gap:14px;margin-bottom:12px}.visualSelectionsHead h3{font-size:21px;margin:4px 0 0}.visualSelectionsHead p{margin:0;max-width:440px;color:#8f8b84;font-size:9px;line-height:1.55;text-align:right}.visualSelectionGrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px}.visualPick{border:1px solid rgba(255,255,255,.08);border-radius:13px;overflow:hidden;background:#0b0b0a}.visualPickMedia{height:116px;background:#111;display:flex;align-items:center;justify-content:center;gap:6px;padding:8px}.visualPickMedia img{display:block;max-width:100%;max-height:100%;object-fit:contain;border-radius:6px}.visualPickMedia.cardPairMini img{width:calc(50% - 3px);height:100%}.visualPickCopy{padding:10px}.visualPickCopy span{display:block;color:#77736c;font-size:7px;letter-spacing:.13em;font-weight:900}.visualPickCopy strong{display:block;margin-top:4px;font-size:10px;line-height:1.35;overflow-wrap:anywhere}.visualEmpty{grid-column:1/-1;color:#77736c;border:1px dashed rgba(255,255,255,.09);border-radius:12px;padding:16px;text-align:center;font-size:9px}.emailVisualNote{margin-top:8px;color:#77736c;font-size:8px;line-height:1.45}@media(max-width:900px){.visualSelectionGrid{grid-template-columns:1fr 1fr}}@media(max-width:520px){.visualSelectionsHead{display:block}.visualSelectionsHead p{text-align:left;margin-top:7px}.visualSelectionGrid{grid-template-columns:1fr 1fr}.visualPickMedia{height:96px}}@media(max-width:330px){.visualSelectionGrid{grid-template-columns:1fr}.visualPickMedia{height:120px}}`;
    doc.head.appendChild(style);
    const notify=esc((p&&p.notificationEmail)||'book@pokertraininglasvegas.com');
    const client=esc((p&&p.client)||'Client');
    const event=esc((p&&p.event)||'Event');
    const date=esc((p&&p.date)||'');
    const script=doc.createElement('script');
    script.textContent=`(()=>{
const notify='${notify}',client='${client}',eventName='${event}',eventDate='${date}';
const q=s=>document.querySelector(s),qa=s=>[...document.querySelectorAll(s)];
function primary(type){return q('.choiceCard[data-type="'+type+'"].selected')}
function included(type){const b=q('.choiceCard[data-type="'+type+'"] .tri button.active[data-state="include"]');return b?b.closest('.choiceCard'):null}
function title(c,fb){return c?.dataset?.value||c?.querySelector('h3')?.textContent?.trim()||fb}
function imgs(c,type){if(!c)return[];if(type==='chip')return qa.call?[]:[];return[]}
function cardImgs(c){return c?[...c.querySelectorAll('.cardArt img')].map(x=>x.src).filter(Boolean):[]}
function oneImg(c,sel){return c?.querySelector(sel)?.src||''}
function picks(){const chip=primary('chip'),card=primary('card'),food=included('food'),drink=included('drink');return[
 {key:'chip',label:'CHIP DESIGN',name:title(chip,'Chip'),images:chip?[oneImg(chip,'.chipStage img')].filter(Boolean):[]},
 {key:'card',label:'CARD DESIGN',name:title(card,'Card'),images:cardImgs(card)},
 {key:'food',label:'CULINARY EXPERIENCE',name:title(food,'Culinary'),images:food?[oneImg(food,'.fbImage img')].filter(Boolean):[]},
 {key:'drink',label:'BAR EXPERIENCE',name:title(drink,'Bar'),images:drink?[oneImg(drink,'.fbImage img')].filter(Boolean):[]}
].filter(x=>x.images.length)}
function syncVisual(){const g=q('#visualSelectionGrid');if(!g)return;const a=picks();g.innerHTML=a.length?a.map(x=>'<article class="visualPick"><div class="visualPickMedia '+(x.key==='card'?'cardPairMini':'')+'">'+x.images.slice(0,2).map(src=>'<img src="'+src+'" alt="">').join('')+'</div><div class="visualPickCopy"><span>'+x.label+'</span><strong>'+x.name+'</strong></div></article>').join(''):'<div class="visualEmpty">Choose options above to see them here.</div>'}
document.addEventListener('click',()=>setTimeout(syncVisual,0));document.addEventListener('change',()=>setTimeout(syncVisual,0));setTimeout(syncVisual,0);
function val(id){return q('#'+id)?.value||''}
function choice(type){const c=type==='food'||type==='drink'?included(type):primary(type);return c?title(c,'Not selected'):'Not selected'}
function add(fd,k,v){fd.append(k,v||'None')}
async function loaded(src){return await new Promise((res,rej)=>{const im=new Image();im.onload=()=>res(im);im.onerror=rej;im.src=src})}
async function jpeg(src,max=900,q=.82){const im=await loaded(src),r=Math.min(1,max/Math.max(im.naturalWidth||1,im.naturalHeight||1)),c=document.createElement('canvas');c.width=Math.max(1,Math.round(im.naturalWidth*r));c.height=Math.max(1,Math.round(im.naturalHeight*r));const x=c.getContext('2d');x.fillStyle='#0b0b0b';x.fillRect(0,0,c.width,c.height);x.drawImage(im,0,0,c.width,c.height);return await new Promise(res=>c.toBlob(res,'image/jpeg',q))}
async function attachments(){const out=[],a=picks();for(const p of a){for(let i=0;i<p.images.length;i++){try{const b=await jpeg(p.images[i]);if(b)out.push({name:(p.key==='card'?(i?'card-back':'card-front'):p.key)+'-selected.jpg',blob:b})}catch{}}}return out}
async function submitRich(ev){const btn=ev.target.closest?.('#submit');if(!btn)return;ev.preventDefault();ev.stopImmediatePropagation();const status=q('#status'),name=val('who').trim(),email=val('whoEmail').trim();if(!name||!email){status.textContent='Please add your name and email.';return}if(!q('#confirm')?.checked){status.textContent='Please check the confirmation box before submitting.';return}btn.disabled=true;status.textContent='Preparing your selections and images…';const fd=new FormData();fd.append('_subject',client+' submitted LVPT event selections');fd.append('_template','table');fd.append('_captcha','false');fd.append('Client',client);fd.append('Event',eventName);fd.append('Event_Date',eventDate);fd.append('Submitted_By',name);fd.append('email',email);fd.append('Chip_Selection',choice('chip'));fd.append('Card_Selection',choice('card'));fd.append('Culinary_Selection',choice('food'));fd.append('Bar_Experience',choice('drink'));add(fd,'Beer_Choice_1',val('beer1'));add(fd,'Beer_Choice_2',val('beer2'));add(fd,'Red_Wine_1',val('red1'));add(fd,'Red_Wine_2',val('red2'));add(fd,'White_Wine_1',val('white1'));add(fd,'White_Wine_2',val('white2'));add(fd,'Premium_Liquor_1',val('liq1'));add(fd,'Premium_Liquor_2',val('liq2'));add(fd,'Premium_Liquor_3',val('liq3'));add(fd,'Comments',val('comments'));fd.append('Submitted_At',new Date().toLocaleString());fd.append('Portal_URL',location.href);let files=[];try{files=await attachments();for(const f of files)fd.append('attachment',new File([f.blob],f.name,{type:'image/jpeg'}))}catch(err){console.error(err)}fd.append('Selection_Images',files.length?files.map(x=>x.name).join(' | '):'No image attachments available');status.textContent='Sending your selections…';const iframe=document.createElement('iframe');iframe.name='lvptSubmitFrame'+Date.now();iframe.style.display='none';document.body.appendChild(iframe);const form=document.createElement('form');form.method='POST';form.action='https://formsubmit.co/'+notify;form.enctype='multipart/form-data';form.target=iframe.name;form.style.display='none';for(const [k,v] of fd.entries()){if(v instanceof File){const inp=document.createElement('input');inp.type='file';inp.name=k;const dt=new DataTransfer();dt.items.add(v);inp.files=dt.files;form.appendChild(inp)}else{const inp=document.createElement('input');inp.type='hidden';inp.name=k;inp.value=v;form.appendChild(inp)}}document.body.appendChild(form);let submitted=false;iframe.addEventListener('load',()=>{if(!submitted)return;status.innerHTML='<div class="success"><strong>Selections received.</strong><br>Your selected designs and beverage preferences have been sent to Las Vegas Poker Training.</div>';btn.textContent='Selections Submitted';setTimeout(()=>{form.remove();iframe.remove()},1200)},{once:false});submitted=true;form.submit();setTimeout(()=>{if(!status.querySelector('.success')){status.innerHTML='<div class="success"><strong>Selections sent.</strong><br>Your selected designs and beverage preferences have been submitted.</div>';btn.textContent='Selections Submitted'}},4500)}
document.addEventListener('click',submitRich,true);
})();`;
    doc.body.appendChild(script);
    html='<!doctype html>'+doc.documentElement.outerHTML;
  }catch(err){console.error('LVPT visual selection enhancement failed',err)}
  return html;
};
})();
