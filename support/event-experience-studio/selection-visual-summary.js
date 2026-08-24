(()=>{'use strict';
const prior=window.clientHTML;
const js=v=>JSON.stringify(String(v??''));
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
    style.textContent=`.visualSelections{margin:4px 0 20px;border:1px solid rgba(215,173,88,.20);border-radius:17px;padding:16px;background:linear-gradient(145deg,rgba(215,173,88,.055),rgba(12,12,11,.96) 38%);box-shadow:inset 0 1px 0 rgba(255,255,255,.04)}.visualSelectionsHead{display:flex;align-items:end;justify-content:space-between;gap:14px;margin-bottom:12px}.visualSelectionsHead h3{font-size:21px;margin:4px 0 0}.visualSelectionsHead p{margin:0;max-width:440px;color:#8f8b84;font-size:9px;line-height:1.55;text-align:right}.visualSelectionGrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px}.visualPick{border:1px solid rgba(255,255,255,.08);border-radius:13px;overflow:hidden;background:#0b0b0a}.visualPickMedia{height:116px;background:#111;display:flex;align-items:center;justify-content:center;gap:6px;padding:8px}.visualPickMedia img{display:block;max-width:100%;max-height:100%;object-fit:contain;border-radius:6px}.visualPickMedia.cardPairMini img{width:calc(50% - 3px);height:100%}.visualPickCopy{padding:10px}.visualPickCopy span{display:block;color:#77736c;font-size:7px;letter-spacing:.13em;font-weight:900}.visualPickCopy strong{display:block;margin-top:4px;font-size:10px;line-height:1.35;overflow-wrap:anywhere}.visualEmpty{grid-column:1/-1;color:#77736c;border:1px dashed rgba(255,255,255,.09);border-radius:12px;padding:16px;text-align:center;font-size:9px}@media(max-width:900px){.visualSelectionGrid{grid-template-columns:1fr 1fr}}@media(max-width:520px){.visualSelectionsHead{display:block}.visualSelectionsHead p{text-align:left;margin-top:7px}.visualSelectionGrid{grid-template-columns:1fr 1fr}.visualPickMedia{height:96px}}@media(max-width:330px){.visualSelectionGrid{grid-template-columns:1fr}.visualPickMedia{height:120px}}`;
    doc.head.appendChild(style);

    const client=js((p&&p.client)||'Client');
    const event=js((p&&p.event)||'Event');
    const date=js((p&&p.date)||'');
    const time=js((p&&(p.eventTime||p.time))||'');
    const guests=js((p&&(p.expectedGuests||p.guests))||'');
    const notify=js((p&&p.notificationEmail)||'book@pokertraininglasvegas.com');
    const script=doc.createElement('script');
    script.textContent=`(()=>{
const API='https://lvpt-poker-proof-studio.vercel.app/api/submit-selection';
const client=${client},eventName=${event},eventDate=${date},eventTime=${time},expectedGuests=${guests},notify=${notify};
const q=s=>document.querySelector(s),qa=s=>[...document.querySelectorAll(s)];
function primary(type){return q('.choiceCard[data-type="'+type+'"].selected')}
function included(type){const b=q('.choiceCard[data-type="'+type+'"] .tri button.active[data-state="include"]');return b?b.closest('.choiceCard'):null}
function title(c,fb){return c?.dataset?.value||c?.querySelector('h3')?.textContent?.trim()||fb}
function cardEls(c){return c?[...c.querySelectorAll('.cardArt img')]:[]}
function oneEl(c,sel){return c?.querySelector(sel)||null}
function picks(){const chip=primary('chip'),card=primary('card'),food=included('food'),drink=included('drink');return[
 {key:'chip',label:'CHIP DESIGN',name:title(chip,'Chip'),els:chip?[oneEl(chip,'.chipStage img')].filter(Boolean):[]},
 {key:'card',label:'CARD DESIGN',name:title(card,'Card'),els:cardEls(card)},
 {key:'food',label:'CULINARY EXPERIENCE',name:title(food,'Culinary'),els:food?[oneEl(food,'.fbImage img')].filter(Boolean):[]},
 {key:'drink',label:'BAR EXPERIENCE',name:title(drink,'Bar'),els:drink?[oneEl(drink,'.fbImage img')].filter(Boolean):[]}
].filter(x=>x.els.length)}
function syncVisual(){const g=q('#visualSelectionGrid');if(!g)return;const a=picks();g.innerHTML=a.length?a.map(x=>'<article class="visualPick"><div class="visualPickMedia '+(x.key==='card'?'cardPairMini':'')+'">'+x.els.slice(0,2).map(im=>'<img src="'+im.src+'" alt="">').join('')+'</div><div class="visualPickCopy"><span>'+x.label+'</span><strong>'+x.name+'</strong></div></article>').join(''):'<div class="visualEmpty">Choose options above to see them here.</div>'}
document.addEventListener('click',()=>setTimeout(syncVisual,0));
document.addEventListener('change',()=>setTimeout(syncVisual,0));
setTimeout(syncVisual,0);
function val(id){return q('#'+id)?.value?.trim()||''}
async function encodeImage(im,max=620,quality=.70){if(!im||!im.src)return'';try{if(!im.complete||!im.naturalWidth)await new Promise((res,rej)=>{im.addEventListener('load',res,{once:true});im.addEventListener('error',rej,{once:true})});const w=im.naturalWidth||im.width||1,h=im.naturalHeight||im.height||1,r=Math.min(1,max/Math.max(w,h)),c=document.createElement('canvas');c.width=Math.max(1,Math.round(w*r));c.height=Math.max(1,Math.round(h*r));const x=c.getContext('2d');x.fillStyle='#0b0b0b';x.fillRect(0,0,c.width,c.height);x.drawImage(im,0,0,c.width,c.height);return c.toDataURL('image/jpeg',quality)}catch(err){console.warn('Image compression failed',err);return im.src.startsWith('data:image/')&&im.src.length<1200000?im.src:''}}
async function imagePayload(){const out=[];for(const p of picks()){for(let i=0;i<p.els.length&&i<2;i++){const dataUrl=await encodeImage(p.els[i]);if(!dataUrl)continue;let name=p.key==='card'?(i?'selected-card-back.jpg':'selected-card-front.jpg'):'selected-'+p.key+'.jpg';out.push({name,dataUrl})}}return out.slice(0,5)}
function selectionName(type){const c=(type==='food'||type==='drink')?included(type):primary(type);return c?title(c,'Not selected'):'Not selected'}
function payload(name,email){return{client,event:eventName,eventDate,eventTime,guests:expectedGuests,submittedBy:name,email,selections:{chip:selectionName('chip'),card:selectionName('card'),culinary:selectionName('food'),bar:selectionName('drink')},beverage:{beer1:val('beer1'),beer2:val('beer2'),red1:val('red1'),red2:val('red2'),white1:val('white1'),white2:val('white2'),liq1:val('liq1'),liq2:val('liq2'),liq3:val('liq3')},comments:val('comments')||'None',portalUrl:location.href}}
async function fallback(data){const s=data.selections,b=data.beverage,body={_subject:client+' submitted LVPT event selections',_template:'table',_captcha:'false',_cc:data.email,_replyto:data.email,Client:client,Event:eventName,Event_Date:eventDate||'Not provided',Event_Time:eventTime||'Not provided',Expected_Guests:expectedGuests||'Not provided',Submitted_By:data.submittedBy,email:data.email,Chip_Selection:s.chip,Card_Selection:s.card,Culinary_Selection:s.culinary,Bar_Experience:s.bar,Beer_Choice_1:b.beer1||'None',Beer_Choice_2:b.beer2||'None',Red_Wine_1:b.red1||'None',Red_Wine_2:b.red2||'None',White_Wine_1:b.white1||'None',White_Wine_2:b.white2||'None',Premium_Liquor_1:b.liq1||'None',Premium_Liquor_2:b.liq2||'None',Premium_Liquor_3:b.liq3||'None',Comments:data.comments,Submitted_At:new Date().toLocaleString(),Portal_URL:location.href};const r=await fetch('https://formsubmit.co/ajax/'+notify,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify(body)});const d=await r.json().catch(()=>({}));if(!r.ok||d.success===false)throw new Error(d.message||'Fallback email failed')}
async function richSubmit(ev){const btn=ev.target.closest?.('#submit');if(!btn)return;ev.preventDefault();ev.stopImmediatePropagation();const status=q('#status'),name=val('who'),email=val('whoEmail');if(!name||!email){status.textContent='Please add your name and email.';return}if(!q('#confirm')?.checked){status.textContent='Please check the confirmation box before submitting.';return}btn.disabled=true;status.textContent='Preparing your selected designs…';const data=payload(name,email);try{data.images=await imagePayload();status.textContent='Sending selections, images and confirmation copy…';const r=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify(data)});const d=await r.json().catch(()=>({}));if(!r.ok||!d.ok)throw new Error(d.error||'Rich submission failed');status.innerHTML='<div class="success"><strong>Selections received.</strong><br>Your choices and '+(d.attached||0)+' selected image'+((d.attached||0)===1?'':'s')+' were sent to Las Vegas Poker Training. A confirmation copy was sent to <strong>'+email.replace(/[<>&]/g,'')+'</strong>.</div>';btn.textContent='Selections Submitted'}catch(err){console.error('Rich submission failed; using fallback',err);try{status.textContent='Sending your selections…';await fallback(data);status.innerHTML='<div class="success"><strong>Selections received.</strong><br>Your event choices were delivered successfully. The image service did not complete, so the submission was sent without image attachments.</div>';btn.textContent='Selections Submitted'}catch(err2){console.error(err2);status.textContent='We could not send automatically. Please try again or contact Las Vegas Poker Training directly.';btn.disabled=false}}}
document.addEventListener('click',richSubmit,true);
})();`;
    doc.body.appendChild(script);
    html='<!doctype html>'+doc.documentElement.outerHTML;
  }catch(err){console.error('LVPT visual selection enhancement failed',err)}
  return html;
};
})();
