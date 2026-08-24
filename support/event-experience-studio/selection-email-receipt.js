(()=>{'use strict';
const prior=window.clientHTML;
const esc=s=>String(s??'').replace(/[`\\${}]/g,m=>m==='`'?'\\`':m==='\\'?'\\\\':m==='$'?'\\$':m);
window.clientHTML=function(p,e,f,o){
  let html=prior(p,e,f,o);
  try{
    const doc=new DOMParser().parseFromString(html,'text/html');
    if(!doc.querySelector('#submit'))return html;
    const client=esc((p&&p.client)||'Client');
    const event=esc((p&&p.event)||'Event');
    const date=esc((p&&p.date)||'');
    const time=esc((p&&(p.eventTime||p.time))||'');
    const guests=esc((p&&(p.expectedGuests||p.guests))||'');
    const notify=esc((p&&p.notificationEmail)||'book@pokertraininglasvegas.com');
    const script=doc.createElement('script');
    script.textContent=`(()=>{
const API='https://lvpt-poker-proof-studio.vercel.app/api/submit-selection';
const notify='${notify}',client='${client}',eventName='${event}',eventDate='${date}',eventTime='${time}',expectedGuests='${guests}';
const q=s=>document.querySelector(s),qa=s=>[...document.querySelectorAll(s)];
function primary(type){return q('.choiceCard[data-type="'+type+'"].selected')}
function included(type){const b=q('.choiceCard[data-type="'+type+'"] .tri button.active[data-state="include"]');return b?b.closest('.choiceCard'):null}
function title(c,fb){return c?.dataset?.value||c?.querySelector('h3')?.textContent?.trim()||fb}
function oneImg(c,sel){return c?.querySelector(sel)?.src||''}
function cardImgs(c){return c?[...c.querySelectorAll('.cardArt img')].map(x=>x.src).filter(Boolean):[]}
function selected(){const chip=primary('chip'),card=primary('card'),food=included('food'),drink=included('drink');return{
 chip:{name:title(chip,'Not selected'),images:chip?[oneImg(chip,'.chipStage img')].filter(Boolean):[]},
 card:{name:title(card,'Not selected'),images:cardImgs(card)},
 culinary:{name:title(food,'Not selected'),images:food?[oneImg(food,'.fbImage img')].filter(Boolean):[]},
 bar:{name:title(drink,'Not selected'),images:drink?[oneImg(drink,'.fbImage img')].filter(Boolean):[]}
}}
function val(id){return q('#'+id)?.value?.trim()||''}
function load(src){return new Promise((res,rej)=>{const im=new Image();im.onload=()=>res(im);im.onerror=rej;im.src=src})}
async function compress(src,max=680,quality=.74){const im=await load(src),w=im.naturalWidth||im.width||1,h=im.naturalHeight||im.height||1,r=Math.min(1,max/Math.max(w,h)),c=document.createElement('canvas');c.width=Math.max(1,Math.round(w*r));c.height=Math.max(1,Math.round(h*r));const x=c.getContext('2d');x.fillStyle='#0b0b0b';x.fillRect(0,0,c.width,c.height);x.drawImage(im,0,0,c.width,c.height);return c.toDataURL('image/jpeg',quality)}
async function imagePayload(sel){const jobs=[];if(sel.chip.images[0])jobs.push(['selected-chip.jpg',sel.chip.images[0]]);sel.card.images.slice(0,2).forEach((src,i)=>jobs.push([i?'selected-card-back.jpg':'selected-card-front.jpg',src]));if(sel.culinary.images[0])jobs.push(['selected-culinary.jpg',sel.culinary.images[0]]);if(sel.bar.images[0])jobs.push(['selected-bar.jpg',sel.bar.images[0]]);const out=[];for(const [name,src] of jobs){try{out.push({name,dataUrl:await compress(src)})}catch(err){console.warn('Could not prepare selection image',name,err)}}return out}
function corePayload(name,email,sel){return{
 client,event:eventName,eventDate,eventTime,guests:expectedGuests,submittedBy:name,email,
 selections:{chip:sel.chip.name,card:sel.card.name,culinary:sel.culinary.name,bar:sel.bar.name},
 beverage:{beer1:val('beer1'),beer2:val('beer2'),red1:val('red1'),red2:val('red2'),white1:val('white1'),white2:val('white2'),liq1:val('liq1'),liq2:val('liq2'),liq3:val('liq3')},
 comments:val('comments')||'None',portalUrl:location.href
}}
async function fallback(payload){const s=payload.selections,b=payload.beverage;const body={_subject:client+' submitted LVPT event selections',_template:'table',_captcha:'false',_cc:payload.email,_replyto:payload.email,Client:client,Event:eventName,Event_Date:eventDate||'Not provided',Event_Time:eventTime||'Not provided',Expected_Guests:expectedGuests||'Not provided',Submitted_By:payload.submittedBy,email:payload.email,Chip_Selection:s.chip,Card_Selection:s.card,Culinary_Selection:s.culinary,Bar_Experience:s.bar,Beer_Choice_1:b.beer1||'None',Beer_Choice_2:b.beer2||'None',Red_Wine_1:b.red1||'None',Red_Wine_2:b.red2||'None',White_Wine_1:b.white1||'None',White_Wine_2:b.white2||'None',Premium_Liquor_1:b.liq1||'None',Premium_Liquor_2:b.liq2||'None',Premium_Liquor_3:b.liq3||'None',Comments:payload.comments,Submitted_At:new Date().toLocaleString(),Portal_URL:location.href};const r=await fetch('https://formsubmit.co/ajax/'+notify,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify(body)});const d=await r.json().catch(()=>({}));if(!r.ok||d.success===false)throw new Error(d.message||'Fallback email failed');return true}
async function send(ev){const btn=ev.target.closest?.('#submit');if(!btn)return;ev.preventDefault();ev.stopImmediatePropagation();const status=q('#status'),name=val('who'),email=val('whoEmail');if(!name||!email){status.textContent='Please add your name and email.';return}if(!q('#confirm')?.checked){status.textContent='Please check the confirmation box before submitting.';return}btn.disabled=true;status.textContent='Preparing your selections and confirmation receipt…';const sel=selected(),payload=corePayload(name,email,sel);try{payload.images=await imagePayload(sel);status.textContent='Sending your selections and selected designs…';const r=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify(payload)});const d=await r.json().catch(()=>({}));if(!r.ok||!d.ok)throw new Error(d.error||'Submission service failed');status.innerHTML='<div class="success"><strong>Selections received.</strong><br>Your choices and selected designs were sent to Las Vegas Poker Training. A confirmation copy has also been sent to <strong>'+email.replace(/[<>&]/g,'')+'</strong>.</div>';btn.textContent='Selections Submitted';return}catch(err){console.error('Rich submission failed; using reliable email fallback.',err);try{status.textContent='Sending your selections…';await fallback(payload);status.innerHTML='<div class="success"><strong>Selections received.</strong><br>Your event choices were sent successfully. The image-attachment service was unavailable, so the submission was delivered without attachments.</div>';btn.textContent='Selections Submitted';return}catch(err2){console.error(err2);status.innerHTML='We could not send automatically. Please try again or contact Las Vegas Poker Training directly.';btn.disabled=false}}
document.addEventListener('click',send,true);
})();`;
    doc.body.appendChild(script);
    html='<!doctype html>'+doc.documentElement.outerHTML;
  }catch(err){console.error('LVPT selection receipt enhancement failed',err)}
  return html;
};
})();
