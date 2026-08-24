(()=>{'use strict';
const prior=window.clientHTML;
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
    const script=doc.createElement('script');
    script.textContent=`(()=>{
const q=s=>document.querySelector(s),qa=s=>[...document.querySelectorAll(s)];
function primary(type){return q('.choiceCard[data-type="'+type+'"].selected')}
function included(type){const b=q('.choiceCard[data-type="'+type+'"] .tri button.active[data-state="include"]');return b?b.closest('.choiceCard'):null}
function title(c,fb){return c?.dataset?.value||c?.querySelector('h3')?.textContent?.trim()||fb}
function cardImgs(c){return c?[...c.querySelectorAll('.cardArt img')].map(x=>x.src).filter(Boolean):[]}
function oneImg(c,sel){return c?.querySelector(sel)?.src||''}
function picks(){const chip=primary('chip'),card=primary('card'),food=included('food'),drink=included('drink');return[
 {key:'chip',label:'CHIP DESIGN',name:title(chip,'Chip'),images:chip?[oneImg(chip,'.chipStage img')].filter(Boolean):[]},
 {key:'card',label:'CARD DESIGN',name:title(card,'Card'),images:cardImgs(card)},
 {key:'food',label:'CULINARY EXPERIENCE',name:title(food,'Culinary'),images:food?[oneImg(food,'.fbImage img')].filter(Boolean):[]},
 {key:'drink',label:'BAR EXPERIENCE',name:title(drink,'Bar'),images:drink?[oneImg(drink,'.fbImage img')].filter(Boolean):[]}
].filter(x=>x.images.length)}
function syncVisual(){const g=q('#visualSelectionGrid');if(!g)return;const a=picks();g.innerHTML=a.length?a.map(x=>'<article class="visualPick"><div class="visualPickMedia '+(x.key==='card'?'cardPairMini':'')+'">'+x.images.slice(0,2).map(src=>'<img src="'+src+'" alt="">').join('')+'</div><div class="visualPickCopy"><span>'+x.label+'</span><strong>'+x.name+'</strong></div></article>').join(''):'<div class="visualEmpty">Choose options above to see them here.</div>'}
document.addEventListener('click',()=>setTimeout(syncVisual,0));
document.addEventListener('change',()=>setTimeout(syncVisual,0));
setTimeout(syncVisual,0);
})();`;
    doc.body.appendChild(script);
    html='<!doctype html>'+doc.documentElement.outerHTML;
  }catch(err){console.error('LVPT visual selection enhancement failed',err)}
  return html;
};
})();
