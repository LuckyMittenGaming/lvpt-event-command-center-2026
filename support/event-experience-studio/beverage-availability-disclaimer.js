(()=>{'use strict';
const previousClientHTML=window.clientHTML;
window.clientHTML=function(p,e,f,o){
  let html=previousClientHTML(p,e,f,o);
  try{
    const doc=new DOMParser().parseFromString(html,'text/html');
    const prefs=doc.querySelector('.bevPrefs');
    if(prefs&&!prefs.querySelector('.availabilityNote')){
      const note=doc.createElement('div');
      note.className='availabilityNote';
      note.innerHTML='<strong>Availability Note:</strong> Beer, wine and spirit selections are requests and subject to availability. If a selected item is unavailable, we may substitute a comparable premium option.';
      prefs.appendChild(note);
    }
    const style=doc.createElement('style');
    style.textContent='.availabilityNote{margin-top:14px;padding-top:12px;border-top:1px solid rgba(255,255,255,.08);color:#817d75;font-size:9px;line-height:1.55}.availabilityNote strong{color:#b8b2a6;font-weight:800}@media(max-width:390px){.availabilityNote{font-size:8.5px}}';
    doc.head.appendChild(style);
    html='<!doctype html>'+doc.documentElement.outerHTML;
  }catch(err){console.error('LVPT beverage availability disclaimer failed',err)}
  return html;
};
})();
