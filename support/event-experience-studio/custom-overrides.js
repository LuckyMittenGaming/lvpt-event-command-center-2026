(()=>{'use strict';
const KEY='lvpt-proof-studio-v2';
const BEER=['Modelo Especial','Corona Extra','Stella Artois','Heineken','Coors Light','Miller Lite','Michelob Ultra','Bud Light','Pacifico','Blue Moon Belgian White','Samuel Adams Boston Lager','Sierra Nevada Pale Ale','Lagunitas IPA','Dogfish Head 60 Minute IPA','Guinness Draught','Yuengling Traditional Lager','New Belgium Fat Tire','Ballast Point Sculpin IPA','Peroni Nastro Azzurro','Athletic Brewing Run Wild IPA (NA)'];
const RED=['Austin Hope Cabernet Sauvignon','Quilt Cabernet Sauvignon','The Prisoner Red Blend','Orin Swift Abstract Red Blend','Stag’s Leap Wine Cellars Hands of Time','Decoy Limited Cabernet Sauvignon','Belle Glos Clark & Telephone Pinot Noir','Flowers Pinot Noir','Ridge Three Valleys Zinfandel','Seghesio Sonoma Zinfandel','Ruffino Riserva Ducale Chianti Classico','Banfi Chianti Classico Riserva','Masi Campofiorin Rosso','Marqués de Riscal Rioja Reserva','Catena Alta Malbec','Achaval-Ferrer Malbec','Daou Reserve Cabernet Sauvignon','Justin Isosceles','Penfolds Bin 28 Shiraz','E. Guigal Côtes du Rhône Rouge'];
const WHITE=['Rombauer Chardonnay','Sonoma-Cutrer Russian River Chardonnay','Jordan Chardonnay','Flowers Chardonnay','Cakebread Sauvignon Blanc','Duckhorn Sauvignon Blanc','Cloudy Bay Sauvignon Blanc','Chateau Ste. Michelle Eroica Riesling','Trimbach Riesling','Santa Margherita Pinot Grigio','Jermann Pinot Grigio','Whispering Angel Rosé','Miraval Rosé','Kim Crawford Illuminate Sauvignon Blanc','Louis Jadot Pouilly-Fuissé','La Crema Chardonnay','Pine Ridge Chenin Blanc + Viognier','Dr. Loosen Blue Slate Riesling','Ferrari-Carano Fumé Blanc','Mumm Napa Brut Prestige'];
const LIQUOR=['Casamigos Blanco Tequila','Casamigos Reposado Tequila','Don Julio Blanco Tequila','Patrón Silver Tequila','Grey Goose Vodka','Belvedere Vodka','Hendrick’s Gin','The Botanist Gin','Woodford Reserve Bourbon','Maker’s Mark 46 Bourbon','Knob Creek 9 Year Bourbon','Elijah Craig Small Batch Bourbon','Four Roses Single Barrel Bourbon','Crown Royal Canadian Whisky','Rémy Martin VSOP Cognac','Hennessy VS Cognac','Glenmorangie The Original 12 Year','Monkey Shoulder Scotch','Appleton Estate 12 Year Rum','Mount Gay XO Rum'];
const rd=()=>{try{const x=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(x)?x:[]}catch{return[]}};
const wr=x=>localStorage.setItem(KEY,JSON.stringify(x));
const aid=()=>document.querySelector('.proofBtn.active')?.dataset.id||null;
const esc=s=>String(s||'').replace(/"/g,'&quot;');
function ensure(p){
  if(!p)return;
  p.culinaryOptions=Array.isArray(p.culinaryOptions)&&p.culinaryOptions.length===2?p.culinaryOptions:[{key:'A',label:'Option A',image:'',vendor:'Art of Cooking'},{key:'B',label:'Option B',image:'',vendor:'Cut & Taste'}];
  p.beverageOptions=Array.isArray(p.beverageOptions)&&p.beverageOptions.length===2?p.beverageOptions:[{key:'A',label:'Option A',image:'',internal:'Premium Drink Concept A'},{key:'B',label:'Option B',image:'',internal:'Premium Drink Concept B'}];
  [p.culinaryOptions,p.beverageOptions].forEach(arr=>arr.forEach((o,i)=>{o.key=i?'B':'A';o.label='Option '+o.key;}));
}
function save(p){
  const a=rd(),i=a.findIndex(x=>x.id===p.id);
  if(i<0)return false;
  a[i]=p;
  try{wr(a);return true}catch(err){console.error('LVPT storage save failed',err);return false}
}
function imageData(file,max=1200){
  return new Promise((res,rej)=>{
    if(!file)return rej(new Error('No image selected'));
    const r=new FileReader();
    r.onerror=rej;
    r.onload=()=>{
      const im=new Image();
      im.onerror=rej;
      im.onload=()=>{
        const scale=Math.min(1,max/Math.max(im.naturalWidth||im.width,im.naturalHeight||im.height));
        const c=document.createElement('canvas');
        c.width=Math.max(1,Math.round((im.naturalWidth||im.width)*scale));
        c.height=Math.max(1,Math.round((im.naturalHeight||im.height)*scale));
        const x=c.getContext('2d',{alpha:false});
        x.fillStyle='#ffffff';x.fillRect(0,0,c.width,c.height);x.drawImage(im,0,0,c.width,c.height);
        try{res(c.toDataURL('image/webp',.80))}catch{res(r.result)}
      };
      im.src=r.result;
    };
    r.readAsDataURL(file);
  });
}
const adminStyle=document.createElement('style');
adminStyle.textContent=`
body{background:radial-gradient(circle at 18% -10%,rgba(242,209,141,.12),transparent 32rem),radial-gradient(circle at 90% 15%,rgba(77,108,155,.08),transparent 34rem),#080808}
.panel,.opt,.culinaryAdminCard{background:linear-gradient(155deg,rgba(34,34,31,.97),rgba(13,13,12,.98) 48%,rgba(19,17,13,.98));border-color:rgba(255,255,255,.10);box-shadow:inset 0 1px 0 rgba(255,255,255,.055),0 22px 70px rgba(0,0,0,.34)}
.btn,.plus,.search,.mini,.field input,.field textarea,.field select{box-shadow:inset 0 1px 0 rgba(255,255,255,.045),0 7px 24px rgba(0,0,0,.16)}
.culinaryAB{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px}
.culinaryAdminCard{border:1px solid rgba(255,255,255,.10);border-radius:17px;overflow:hidden}
.culinaryAdminCard .hero{background:linear-gradient(145deg,#151515,#090909);display:flex;align-items:center;justify-content:center;overflow:hidden;min-height:0;aspect-ratio:auto!important}
.culinaryAdminCard .hero img{display:block;width:100%;height:auto;max-height:none;object-fit:contain;background:#fff}
.culinaryAdminCard .body{padding:14px}.culinaryAdminCard h3{margin:0 0 5px}.culinaryAdminCard p{color:#98938a;font-size:10px;line-height:1.55}.culinaryAdminCard input[type=file]{width:100%;max-width:100%;font-size:10px}.culinaryAdminCard *{min-width:0}
@media(max-width:840px){.culinaryAB{grid-template-columns:1fr}}
@media(max-width:390px){.top{padding:10px 8px;flex-wrap:wrap}.top .actions{width:100%}.top .actions .btn{flex:1}.shell{padding:8px}.panel{border-radius:14px}.section,.head,.publish{padding:12px}.culinaryAdminCard .body{padding:11px}}
@media(max-width:300px){.brand strong{font-size:12px}.mark{width:34px;height:34px}.btn{padding:9px 8px;font-size:10px}.side{padding:9px}.section h2{font-size:19px}}
`;
document.head.appendChild(adminStyle);
function cardsHtml(arr,type){
  return '<div class="culinaryAB">'+arr.map((o,i)=>`<article class="culinaryAdminCard"><div class="hero">${o.image?`<img src="${o.image}" alt="${o.label}">`:'<div class="assetEmpty" style="width:100%;display:grid;place-items:center">Upload hero image</div>'}</div><div class="body"><h3>${o.label}</h3><p>${type==='cul'?'One complete culinary experience.':'One complete premium bar experience.'} No pricing is shown to the client.</p><label class="lab">Replace Hero Image</label><input type="file" accept="image/png,image/jpeg,image/webp" data-${type}-img="${i}"><label class="lab vendor" style="display:block;margin-top:10px">Internal ${type==='cul'?'Vendor':'Label'} <em>hidden</em></label><input class="mini" data-${type}-txt="${i}" value="${esc(type==='cul'?o.vendor:o.internal)}"></div></article>`).join('')+'</div>';
}
let lock=false;
function renderAdmin(){
  if(lock)return;lock=true;
  const a=rd(),p=a.find(x=>x.id===aid());
  if(!p){lock=false;return}
  ensure(p);save(p);
  const fs=document.getElementById('foods')?.closest('section');
  if(fs){
    fs.querySelector('.secHead').innerHTML='<div><div class="ey">CULINARY EXPERIENCE</div><h2>Culinary Options A / B</h2><p>Client chooses one complete culinary experience. Vendor identities stay internal.</p></div>';
    const f=document.getElementById('foods');f.innerHTML=cardsHtml(p.culinaryOptions,'cul');document.getElementById('foodEmpty')?.classList.add('hidden');fs.querySelectorAll('#addFood,#niumFood').forEach(x=>x.style.display='none');
    f.querySelectorAll('[data-cul-txt]').forEach(x=>x.oninput=()=>{const a=rd(),q=a.find(z=>z.id===aid());ensure(q);q.culinaryOptions[+x.dataset.culTxt].vendor=x.value;save(q)});
    f.querySelectorAll('[data-cul-img]').forEach(x=>x.onchange=async()=>{try{const a=rd(),q=a.find(z=>z.id===aid());ensure(q);q.culinaryOptions[+x.dataset.culImg].image=await imageData(x.files?.[0],1200);if(!save(q))alert('That image could not be saved because browser storage is full. Try a smaller file or remove unused proof artwork.');renderAdmin()}catch(err){console.error(err)}});
  }
  const bs=document.getElementById('drinks')?.closest('section');
  if(bs){
    bs.querySelector('.secHead').innerHTML='<div><div class="ey">PREMIUM DRINK EXPERIENCE</div><h2>Bar Experience Options A / B</h2><p>Client chooses one complete bar experience, then selects the included beer, wine and optional premium liquor preferences.</p></div>';
    const b=document.getElementById('drinks');b.innerHTML=cardsHtml(p.beverageOptions,'bev');document.getElementById('drinkEmpty')?.classList.add('hidden');bs.querySelectorAll('#addDrink').forEach(x=>x.style.display='none');
    b.querySelectorAll('[data-bev-txt]').forEach(x=>x.oninput=()=>{const a=rd(),q=a.find(z=>z.id===aid());ensure(q);q.beverageOptions[+x.dataset.bevTxt].internal=x.value;save(q)});
    b.querySelectorAll('[data-bev-img]').forEach(x=>x.onchange=async()=>{try{const a=rd(),q=a.find(z=>z.id===aid());ensure(q);q.beverageOptions[+x.dataset.bevImg].image=await imageData(x.files?.[0],1200);if(!save(q))alert('That image could not be saved because browser storage is full. Try a smaller file or remove unused proof artwork.');renderAdmin()}catch(err){console.error(err)}});
  }
  lock=false;
}
const original=window.clientHTML;
const options=(arr,label)=>'<option value="">'+label+'</option>'+arr.map(x=>'<option>'+x+'</option>').join('');
window.clientHTML=function(p,e,f,o){
  const c=JSON.parse(JSON.stringify(p||{})),s=rd().find(x=>x.id===c.id);
  if(s){ensure(s);c.culinaryOptions=s.culinaryOptions;c.beverageOptions=s.beverageOptions}
  ensure(c);
  c.foods=c.culinaryOptions.map(x=>({id:'cul-'+x.key,title:x.label,category:'CULINARY EXPERIENCE',desc:'A curated culinary experience for your event.',image:x.image,featured:false,price:'',priceVisible:false}));
  c.drinks=c.beverageOptions.map(x=>({id:'bev-'+x.key,title:x.label,category:'PREMIUM DRINK EXPERIENCE',desc:'Select the bar experience you prefer.',image:x.image,featured:false,price:'',priceVisible:false}));
  let h=original(c,e,f,o)
    .replace('Build the Menu','Choose Your Culinary Experience')
    .replace('Mark each item Include, Maybe or Pass. Your choices help us build the final event menu around your group.','Review Option A and Option B, then choose the culinary experience you prefer.')
    .replace('Choose the Bar Experience','Choose Your Bar Experience')
    .replace('Review the beverage and bar options, then mark each as Include, Maybe or Pass.','Review both premium drink experiences, choose one, then customize the included beer, wine and premium liquor preferences.')
    .replace('Nothing is ordered or produced until Las Vegas Poker Training confirms final availability, quantities and pricing with you.','Your selections help us finalize the event experience and production details.')
    .replace('I understand final availability and pricing will be confirmed separately.','I’m submitting these as my current preferred event selections.');
  h=h.replace('</style>',`
*{min-width:0}.choiceCard,.review,.bevPrefs{background:linear-gradient(155deg,rgba(29,29,27,.98),rgba(13,13,12,.985) 48%,rgba(24,19,12,.98));border-color:rgba(255,255,255,.11);box-shadow:inset 0 1px 0 rgba(255,255,255,.065),0 22px 70px rgba(0,0,0,.34)}
.choiceCard:before{content:'';position:absolute;left:4%;right:4%;top:0;height:1px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.26),transparent);pointer-events:none}
.pick,.submit{position:relative;overflow:hidden;box-shadow:inset 0 1px 0 rgba(255,255,255,.22),0 10px 28px rgba(201,149,61,.12)}.pick:after,.submit:after{content:'';position:absolute;inset:0;background:linear-gradient(115deg,transparent 20%,rgba(255,255,255,.13) 45%,transparent 65%);transform:translateX(-120%);transition:.45s;pointer-events:none}.pick:hover:after,.submit:hover:after{transform:translateX(120%)}
.copy h3,.copy p,.secHead h2,.secHead p,.summaryBox strong,.summaryBox small{overflow-wrap:anywhere;white-space:normal}
.fbChoice[data-type="food"] .tri,.fbChoice[data-type="drink"] .tri{grid-template-columns:1fr}.fbChoice[data-type="food"] .tri button[data-state="maybe"],.fbChoice[data-type="food"] .tri button[data-state="pass"],.fbChoice[data-type="drink"] .tri button[data-state="maybe"],.fbChoice[data-type="drink"] .tri button[data-state="pass"]{display:none!important}
.fbChoice[data-type="food"] .fbImage,.fbChoice[data-type="drink"] .fbImage{height:auto!important;aspect-ratio:auto!important;min-height:0;background:linear-gradient(145deg,#111,#070707);display:block;padding:0;overflow:hidden}
.fbChoice[data-type="food"] .fbImage img,.fbChoice[data-type="drink"] .fbImage img{display:block!important;position:static!important;width:100%!important;height:auto!important;max-height:none!important;object-fit:contain!important;background:#080808}
.fbChoice[data-type="food"] .missing,.fbChoice[data-type="drink"] .missing{min-height:220px;display:grid;place-items:center}
.bevPrefs{margin-top:18px;border:1px solid rgba(215,173,88,.22);border-radius:18px;padding:20px}.bevPrefs h3{margin:4px 0 6px;font-size:23px}.bevPrefs p{color:#aaa69f;font-size:10px;line-height:1.65}.bevGrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-top:14px}.bevCol{display:grid;gap:8px}.bevCol label{font-size:8px;letter-spacing:.12em;color:#d7ad58;font-weight:900;line-height:1.4}.bevCol select{width:100%;max-width:100%;background:linear-gradient(180deg,#10100f,#070707);color:#f5f1e8;border:1px solid rgba(255,255,255,.13);border-radius:10px;padding:10px;font-size:10px;box-shadow:inset 0 1px 0 rgba(255,255,255,.04)}
@media(hover:hover){.choiceCard:hover{transform:translateY(-2px);border-color:rgba(215,173,88,.25)}}
@media(max-width:900px){.bevGrid{grid-template-columns:1fr 1fr}.g{grid-template-columns:1fr}}
@media(max-width:620px){.bevGrid{grid-template-columns:1fr}.w{padding-left:12px;padding-right:12px}.sec{padding-top:34px}.secHead h2{font-size:28px}.choiceCard{border-radius:15px}.review{padding:18px}.top{flex-wrap:wrap}.brand{min-width:0}.brand strong{overflow-wrap:anywhere}}
@media(max-width:390px){.w{padding-left:8px;padding-right:8px}.portalNav .navInner{padding-left:8px;padding-right:8px}.hero{padding-top:30px}.hero h1{font-size:34px}.event{font-size:16px}.secHead h2{font-size:25px}.copy{padding:15px}.copy h3{font-size:18px}.cardPair{grid-template-columns:1fr 1fr;padding-left:7px;padding-right:7px}.review{padding:14px}.review h2{font-size:29px}.bevPrefs{padding:14px}.bevPrefs h3{font-size:20px}.foot{overflow-wrap:anywhere}}
@media(max-width:300px){.w{padding-left:6px;padding-right:6px}.portalNav .navInner{padding-left:6px;padding-right:6px}.hero h1{font-size:30px}.secHead h2{font-size:22px}.copy{padding:12px}.cardPair{grid-template-columns:1fr;gap:12px}.cardArt{max-width:180px}.pick,.submit{padding-left:8px;padding-right:8px}.round{display:none}.review h2{font-size:25px}}
</style>`);
  const prefs=`<div class="bevPrefs"><div class="k">EXPERIENCE INCLUDES</div><h3>Customize Your Included Selections</h3><p>Top Shelf Liquor (Casa Amigos, Grey Goose, Blanton’s, Eagle Rare, Crown, etc.). 2 Types of Beer, 2 Types of Red Wine and 2 Types of White Wine.</p><div class="bevGrid"><div class="bevCol"><label>BEER CHOICES — SELECT 2</label><select id="beer1">${options(BEER,'Select Beer 1')}</select><select id="beer2">${options(BEER,'Select Beer 2')}</select></div><div class="bevCol"><label>RED WINE CHOICES — SELECT 2</label><select id="red1">${options(RED,'Select Red Wine 1')}</select><select id="red2">${options(RED,'Select Red Wine 2')}</select></div><div class="bevCol"><label>WHITE WINE CHOICES — SELECT 2</label><select id="white1">${options(WHITE,'Select White Wine 1')}</select><select id="white2">${options(WHITE,'Select White Wine 2')}</select></div><div class="bevCol"><label>PREMIUM LIQUOR REQUESTS — UP TO 3</label><select id="liq1">${options(LIQUOR,'Optional Liquor 1')}</select><select id="liq2">${options(LIQUOR,'Optional Liquor 2')}</select><select id="liq3">${options(LIQUOR,'Optional Liquor 3')}</select></div></div></div>`;
  h=h.replace(/(<section class="sec" id="drinks"[\s\S]*?)(<\/section>)/,'$1'+prefs+'$2');
  h=h.replace('</body>',`<script>setTimeout(function(){['food','drink'].forEach(function(type){var cards=[...document.querySelectorAll('.fbChoice[data-type="'+type+'"]')];cards.forEach(function(card){var inc=card.querySelector('button[data-state="include"]');if(inc){inc.textContent=type==='drink'?'Choose this Bar Experience':'Choose this Culinary Experience';inc.addEventListener('click',function(){setTimeout(function(){cards.forEach(function(other){if(other!==card){var p=other.querySelector('button[data-state="pass"]');if(p)p.click();other.classList.remove('selected')}});card.classList.add('selected');var s=document.getElementById(type==='drink'?'sumDrink':'sumFood');if(s)s.textContent=card.dataset.value},0)})}})});var submit=document.getElementById('submit');if(submit)submit.addEventListener('click',function(){var g=id=>document.getElementById(id)?.value||'',extra='BEVERAGE SELECTIONS\\nBeer: '+[g('beer1'),g('beer2')].filter(Boolean).join(', ')+'\\nRed Wine: '+[g('red1'),g('red2')].filter(Boolean).join(', ')+'\\nWhite Wine: '+[g('white1'),g('white2')].filter(Boolean).join(', ')+'\\nPremium Liquor Requests: '+[g('liq1'),g('liq2'),g('liq3')].filter(Boolean).join(', ');var c=document.getElementById('comments');if(c&&!c.value.includes('BEVERAGE SELECTIONS'))c.value=(c.value?c.value+'\\n\\n':'')+extra},true)},0);<\/script></body>`);
  return h;
};
document.addEventListener('click',e=>{if(e.target.closest('.proofBtn,#newTop,#newSide,#first'))setTimeout(renderAdmin,100)});
setTimeout(renderAdmin,250);
})();
