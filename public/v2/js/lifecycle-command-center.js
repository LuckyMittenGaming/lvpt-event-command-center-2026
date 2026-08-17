(() => {
  const VIEW_KEY = 'lvptCommandCenterView';
  const APP_KEY = 'lvptAppSyncKey';
  const pipelineStatuses = ['New Lead','Needs Discovery','Quote Needed','Proposal Sent','Invoice Sent'];
  const activeStatuses = ['Deposit Paid','Booked','Pre-Production','Event Day'];
  const archiveStatuses = ['Completed','Post-Event Follow-Up','Closed Won','Closed Lost'];
  const pipelineGroups = [
    { label:'New & Discovery', statuses:['New Lead','Needs Discovery'] },
    { label:'Quote & Proposal', statuses:['Quote Needed','Proposal Sent'] },
    { label:'Approval & Payment', statuses:['Invoice Sent'] },
    { label:'Booked Handoff', statuses:['Deposit Paid','Booked'] },
  ];
  const proposals = [
    { id:'proposal-nium', client:'NIUM', title:'NIUM VIP Casino Lounge', project:'lvpt-nium-proposal', url:'https://lvpt-nium-proposal.vercel.app/', status:'Accepted / Booked', updated:'2026-07-16', eventId:'evt-nium-2026', tags:['Palms Place','Casino Night','Custom Assets','Transportation'], notes:'Enterprise proposal with venue comparisons, custom chips/cards/felts, premium catering, open bar and transportation.' },
    { id:'proposal-neo-2026', client:'Mosaic Events / NEO', title:'NEO Reunion 2026', project:'mosaic-neo-2026-proposal', url:'https://mosaic-neo-2026-proposal.vercel.app/', status:'Updated Proposal', updated:'2026-08-13', eventId:'evt-neo-reunion-2026', tags:['Training','Tournament','Ritz-Carlton','Repeat Client'], notes:'Year-two training and tournament proposal with premium instructor positioning and event improvements.' },
    { id:'proposal-workato', client:'Workato', title:'Workato Poker Experience', project:'workato-poker-experience', url:'https://workato-poker-experience.vercel.app/', status:'Proposal Active', updated:'2026-08-12', eventId:'', tags:['Venue Options','Transportation','Catering','Image Gallery'], notes:'Multi-route Las Vegas proposal featuring Palms Place, Venetian poker room, Mob Museum and Allegiant Stadium.' },
    { id:'proposal-safelease', client:'SafeLease', title:'SafeLease Poker Experience', project:'safelease-poker-experience', url:'https://safelease-poker-experience.vercel.app/', status:'Proposal Active', updated:'2026-08-05', eventId:'', tags:['Trade Show','Lead Generation','ARIA','Booth Activation'], notes:'Trade-show poker activation proposal with booth engagement and future tournament opportunity.' },
    { id:'proposal-ownwell', client:'Ownwell', title:'Ownwell Poker Proposal', project:'ownwell-poker-proposal', url:'https://ownwell-poker-proposal.vercel.app/', status:'Past Reference', updated:'2026-08-05', eventId:'', tags:['Gallery','Visual Reference','Poker Experience'], notes:'Past proposal retained as a visual and image-gallery reference for future builds.' },
    { id:'proposal-defending-education', client:'Defending Education', title:'Defending Education Poker Proposal', project:'defending-education-poker-proposal', url:'https://defending-education-poker-proposal.vercel.app/', status:'Past Reference', updated:'2026-07-24', eventId:'', tags:['Corporate','Training','Proposal Reference'], notes:'Past corporate poker proposal retained for layouts, copy modules and reusable presentation patterns.' },
  ];

  let commandView = localStorage.getItem(VIEW_KEY) || 'overview';
  let proposalQuery = '';
  let automationState = { loading:false, loaded:false, configured:false, lastScanAt:'', nextMorning:'', nextEvening:'', items:[], stats:{} };

  const baseEnsureEventShape = ensureEventShape;
  ensureEventShape = function(event) {
    const shaped = baseEnsureEventShape(event);
    shaped.proposalUrl = shaped.proposalUrl || '';
    shaped.proposalId = shaped.proposalId || '';
    shaped.proposalStatus = shaped.proposalStatus || '';
    shaped.automationReview = Array.isArray(shaped.automationReview) ? shaped.automationReview : [];
    shaped.automationMeta = shaped.automationMeta || {};
    return shaped;
  };
  events = events.map(ensureEventShape);

  function todayString() { return new Date().toISOString().slice(0,10); }
  function isPastDate(event) { return Boolean(event.eventDate && event.eventDate < todayString()); }
  function isPipeline(event) { return pipelineStatuses.includes(event.status) && !isPastDate(event); }
  function isActive(event) { return activeStatuses.includes(event.status) && !isPastDate(event); }
  function isArchive(event) { return archiveStatuses.includes(event.status) || isPastDate(event); }
  function eventValue(event) { return quoteTotal(event) || num(event.setup?.targetQuote); }
  function openTaskCount(event) { return (event.tasks || []).filter(task => !taskIsComplete(task)).length; }
  function dateLabel(value) { if(!value) return 'Date TBD'; const date=new Date(`${value}T12:00:00`); return Number.isNaN(date.getTime())?value:date.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}); }
  function ageInDays(value) { if(!value) return Infinity; return Math.floor((Date.now()-new Date(value).getTime())/86400000); }
  function proposalForEvent(event) { return proposals.find(item => item.eventId === event.id || item.url === event.proposalUrl || item.client.toLowerCase() === String(event.company||'').toLowerCase()); }

  function ensureShell() {
    if ($('#commandNav')) return;
    const nav = document.createElement('nav');
    nav.id = 'commandNav';
    nav.className = 'command-nav';
    nav.setAttribute('aria-label','Command Center sections');
    nav.innerHTML = [
      ['overview','Overview'],['pipeline','Pipeline'],['active','Active Events'],['archive','Past Events'],['proposals','Proposals'],['followup','Client Follow-Up']
    ].map(([view,label]) => `<button type="button" data-command-view="${view}">${label}</button>`).join('');
    $('.hero-card').after(nav);
    const view = document.createElement('section');
    view.id = 'commandView';
    view.className = 'command-view';
    nav.after(view);
    nav.addEventListener('click', event => {
      const button = event.target.closest('[data-command-view]');
      if (button) setCommandView(button.dataset.commandView);
    });
    ensureProposalModal();
  }

  function setCommandView(view) {
    commandView = view || 'overview';
    localStorage.setItem(VIEW_KEY, commandView);
    renderCommandView();
    window.scrollTo({ top:0, behavior:'smooth' });
  }

  function toggleStandardWorkspace(show) {
    ['#attentionBar','#metricsGrid','.layout-grid','#reportCenter'].forEach(selector => {
      const element = document.querySelector(selector);
      if (element) element.hidden = !show;
    });
  }

  function renderCommandView() {
    ensureShell();
    all('[data-command-view]').forEach(button => button.classList.toggle('active', button.dataset.commandView === commandView));
    const view = $('#commandView');
    const overview = commandView === 'overview';
    toggleStandardWorkspace(overview);
    view.hidden = overview;
    if (overview) return;
    if (commandView === 'pipeline') renderPipeline(view);
    else if (commandView === 'active') renderPortfolio(view, 'active');
    else if (commandView === 'archive') renderPortfolio(view, 'archive');
    else if (commandView === 'proposals') renderProposals(view);
    else renderFollowUp(view);
  }

  function viewHeader(eyebrow, title, copy, action='') {
    return `<div class="command-view-head"><div><p class="eyebrow">${escapeHtml(eyebrow)}</p><h2>${escapeHtml(title)}</h2><p>${escapeHtml(copy)}</p></div>${action}</div>`;
  }

  function summaryCards(items) {
    const value = items.reduce((sum,event)=>sum+eventValue(event),0);
    const profit = items.reduce((sum,event)=>sum+Math.max(eventValue(event)-quoteCost(event),0),0);
    const tasks = items.reduce((sum,event)=>sum+openTaskCount(event),0);
    return `<div class="lifecycle-summary"><div><span>Records</span><strong>${items.length}</strong></div><div><span>Pipeline Value</span><strong>${money(value)}</strong></div><div><span>Projected Profit</span><strong>${money(profit)}</strong></div><div><span>Open Actions</span><strong>${tasks}</strong></div></div>`;
  }

  function renderPipeline(view) {
    const items = events.filter(isPipeline);
    const columns = pipelineGroups.map(group => {
      const matches = items.filter(event => group.statuses.includes(event.status));
      return `<section class="pipeline-column"><div class="pipeline-column-head"><h3>${escapeHtml(group.label)}</h3><span class="pipeline-column-count">${matches.length}</span></div><div class="pipeline-cards">${matches.map(pipelineCard).join('') || '<div class="command-empty">No deals</div>'}</div></section>`;
    }).join('');
    view.innerHTML = `<div class="command-view-shell">${viewHeader('Sales Pipeline','Present & Future Opportunities','Every active conversation, proposal, approval and deposit handoff in one place.')}<div class="command-view-body">${summaryCards(items)}<div class="pipeline-board top-gap">${columns}</div></div></div>`;
    bindEventOpeners(view);
  }

  function pipelineCard(event) {
    const proposal = proposalForEvent(event);
    return `<button type="button" class="pipeline-card" data-open-event="${escapeHtml(event.id)}"><strong>${escapeHtml(event.company || event.eventName)}</strong><p>${escapeHtml(event.eventName)} · ${dateLabel(event.eventDate)}</p><div class="pipeline-card-meta"><span>${money(eventValue(event))}</span><span>${num(event.probabilityToClose)}% likely</span></div><p class="pipeline-card-next">Next: ${escapeHtml(event.nextAction || 'Add next action')}${event.nextActionDue ? ` · ${dateLabel(event.nextActionDue)}` : ''}${proposal ? ' · Proposal linked' : ''}</p></button>`;
  }

  function renderPortfolio(view, mode) {
    const items = events.filter(mode === 'active' ? isActive : isArchive).sort((a,b)=>String(b.eventDate||'').localeCompare(String(a.eventDate||'')));
    const title = mode === 'active' ? 'Booked & Active Events' : 'Past Event Archive';
    const copy = mode === 'active' ? 'Confirmed experiences moving through planning, production and event day.' : 'Completed, lost and historical opportunities with their financials, documents, proposals and follow-up history intact.';
    view.innerHTML = `<div class="command-view-shell">${viewHeader(mode === 'active' ? 'Present & Future' : 'Past',''+title,copy)}<div class="command-view-body">${summaryCards(items)}<div class="portfolio-grid top-gap">${items.map(portfolioCard).join('') || '<div class="command-empty">No records in this section.</div>'}</div></div></div>`;
    bindEventOpeners(view);
  }

  function portfolioCard(event) {
    const proposal = proposalForEvent(event);
    return `<article class="portfolio-card"><p class="eyebrow small">${escapeHtml(event.status)}</p><h3>${escapeHtml(event.eventName)}</h3><p>${escapeHtml(event.company)} · ${dateLabel(event.eventDate)}<br>${escapeHtml(event.venue || 'Venue TBD')}</p><div class="portfolio-card-grid"><div><span>Value</span><strong>${money(eventValue(event))}</strong></div><div><span>Collected</span><strong>${money(event.payment?.amountPaid)}</strong></div><div><span>Open Items</span><strong>${openTaskCount(event)}</strong></div><div><span>Proposal</span><strong>${proposal ? proposal.status : event.proposalUrl ? 'Linked' : 'Not linked'}</strong></div></div><div class="actions"><button class="btn small primary" data-open-event="${escapeHtml(event.id)}">Open Record</button>${proposal ? `<button class="btn small" data-preview-proposal="${proposal.id}">Preview Proposal</button>` : ''}</div></article>`;
  }

  function renderProposals(view) {
    const query = proposalQuery.toLowerCase();
    const filtered = proposals.filter(item => [item.client,item.title,item.project,item.status,item.tags.join(' '),item.notes].join(' ').toLowerCase().includes(query));
    view.innerHTML = `<div class="command-view-shell">${viewHeader('Design & Sales Library','Proposal Library','Live proposals pulled from the LVPT Vercel portfolio, organized for fast comparison, reuse and event lookup.')}<div class="command-view-body"><div class="proposal-toolbar"><input class="input" id="proposalSearch" placeholder="Search clients, venues, layouts, assets..." value="${escapeHtml(proposalQuery)}"><span class="badge hot">${filtered.length} proposal${filtered.length===1?'':'s'}</span></div><div class="proposal-grid">${filtered.map(proposalCard).join('') || '<div class="command-empty">No matching proposals.</div>'}</div></div></div>`;
    $('#proposalSearch')?.addEventListener('input', event => { proposalQuery = event.target.value; renderProposals(view); $('#proposalSearch')?.focus(); });
    bindProposalOpeners(view);
    bindEventOpeners(view);
  }

  function proposalCard(item) {
    return `<article class="proposal-card"><p class="eyebrow small">${escapeHtml(item.status)}</p><h3>${escapeHtml(item.title)}</h3><p><strong>${escapeHtml(item.client)}</strong><br>${escapeHtml(item.notes)}</p><div class="proposal-tags">${item.tags.map(tag=>`<span>${escapeHtml(tag)}</span>`).join('')}</div><div class="proposal-meta"><div><span>Vercel Project</span><strong>${escapeHtml(item.project)}</strong></div><div><span>Last Updated</span><strong>${dateLabel(item.updated)}</strong></div></div><div class="actions"><button class="btn small primary" data-preview-proposal="${item.id}">Preview</button><a class="btn small" href="${escapeHtml(item.url)}" target="_blank" rel="noopener">Open Live</a>${item.eventId ? `<button class="btn small" data-open-event="${item.eventId}">Event Record</button>` : ''}</div></article>`;
  }

  function ensureProposalModal() {
    if ($('#proposalPreviewDialog')) return;
    const dialog=document.createElement('dialog');
    dialog.id='proposalPreviewDialog'; dialog.className='modal proposal-modal';
    dialog.innerHTML='<div class="modal-card"><div class="modal-head"><div><p class="eyebrow small">Live Proposal Preview</p><h2 id="proposalPreviewTitle">Proposal</h2><p class="muted compact" id="proposalPreviewMeta"></p></div><div class="proposal-modal-actions"><a class="btn small primary" id="proposalPreviewOpen" target="_blank" rel="noopener">Open Full Proposal</a><button class="icon-btn" type="button" id="proposalPreviewClose" aria-label="Close">×</button></div></div><iframe class="proposal-preview-frame" id="proposalPreviewFrame" title="Proposal preview" loading="lazy" sandbox="allow-scripts allow-same-origin allow-forms allow-popups"></iframe></div>';
    document.body.appendChild(dialog);
    $('#proposalPreviewClose').addEventListener('click',()=>{ dialog.close(); $('#proposalPreviewFrame').src='about:blank'; });
    dialog.addEventListener('click',event=>{ if(event.target===dialog){ dialog.close(); $('#proposalPreviewFrame').src='about:blank'; } });
  }

  function previewProposal(id) {
    const item=proposals.find(proposal=>proposal.id===id); if(!item) return;
    $('#proposalPreviewTitle').textContent=item.title;
    $('#proposalPreviewMeta').textContent=`${item.client} · ${item.project} · ${item.status}`;
    $('#proposalPreviewOpen').href=item.url;
    $('#proposalPreviewFrame').src=item.url;
    $('#proposalPreviewDialog').showModal();
  }

  function deriveFollowUps() {
    const items=[];
    events.forEach(event=>{
      (event.tasks||[]).filter(task=>!taskIsComplete(task)).forEach(task=>{
        const days=daysFromToday(task.dueDate);
        if(days<=7) items.push({id:task.id,eventId:event.id,eventName:event.eventName,title:task.title,detail:`${task.owner||'Unassigned'} · ${task.priority||'Medium'} priority`,due:task.dueDate||'',days,kind:'Task'});
      });
      const activity=(event.emailActivity||[]).slice().sort((a,b)=>String(a.date||'').localeCompare(String(b.date||'')));
      const last=activity[activity.length-1];
      if(last && last.direction==='received' && ageInDays(last.date)>=1) items.push({id:`reply-${last.id}`,eventId:event.id,eventName:event.eventName,title:`Client reply may be waiting: ${last.subject||'No subject'}`,detail:last.snippet||`From ${last.from||'client'}`,due:'',days:-ageInDays(last.date),kind:'Email'});
      if(isArchive(event)) {
        if(!event.postEvent?.thankYouSent) items.push({id:`thank-${event.id}`,eventId:event.id,eventName:event.eventName,title:'Post-event thank-you not recorded',detail:'Confirm the client and venue thank-you has been sent.',due:event.eventDate||'',days:-1,kind:'Post-Event'});
        if(!event.postEvent?.reviewRequested) items.push({id:`review-${event.id}`,eventId:event.id,eventName:event.eventName,title:'Client review request not recorded',detail:'Request feedback or mark this follow-up as not needed.',due:event.postEvent?.followUpDate||'',days:0,kind:'Post-Event'});
      }
    });
    (automationState.items||[]).filter(item=>item.status==='Open'||!item.status).forEach(item=>items.push({id:item.reviewId||item.id,eventId:item.eventId||'',eventName:item.eventName||item.suggestedCompany||'Unmatched client email',title:item.action||item.subject||'Review client email',detail:item.snippet||item.from||'',due:item.messageDate||'',days:0,kind:item.category||'Automation',review:true}));
    return items.sort((a,b)=>(a.days??0)-(b.days??0));
  }

  function renderFollowUp(view) {
    const items=deriveFollowUps();
    const action=`<div class="actions"><button class="btn" id="refreshAutomationBtn">Refresh</button><button class="btn primary" id="runAutomationBtn">Run Email Review</button><button class="btn" id="installAutomationBtn">Schedule 2× Daily</button></div>`;
    const stats=automationState.stats||{};
    view.innerHTML=`<div class="command-view-shell">${viewHeader('Email Intelligence','Client Follow-Up','Unhandled client items across leads, future events and past-event relationships. Ambiguous email findings stay in review until a person confirms them.',action)}<div class="command-view-body"><div class="automation-status"><div><span>Connection</span><strong>${automationState.loading?'Working…':automationState.configured?'Ready':'Check setup'}</strong></div><div><span>Last Scan</span><strong>${automationState.lastScanAt?new Date(automationState.lastScanAt).toLocaleString():'Not yet run'}</strong></div><div><span>Matched Messages</span><strong>${stats.matchedMessages||0}</strong></div><div><span>Needs Attention</span><strong>${items.length}</strong></div></div><div class="followup-grid">${items.map(followUpCard).join('')||'<div class="command-empty">No currently identified client follow-ups.</div>'}</div></div></div>`;
    $('#refreshAutomationBtn')?.addEventListener('click',()=>loadAutomationStatus(true));
    $('#runAutomationBtn')?.addEventListener('click',()=>runAutomation('scan'));
    $('#installAutomationBtn')?.addEventListener('click',()=>runAutomation('install'));
    bindEventOpeners(view);
    all('[data-review-item]').forEach(button=>button.addEventListener('click',()=>reviewAutomationItem(button.dataset.reviewItem,button.dataset.reviewStatus)));
  }

  function followUpCard(item) {
    const urgency=item.days<0?'urgent':'';
    return `<article class="followup-item ${urgency}"><div class="followup-icon">${item.kind==='Email'?'@':item.kind==='Post-Event'?'✓':'!'}</div><div><h3>${escapeHtml(item.title)}</h3><p><strong>${escapeHtml(item.eventName)}</strong> · ${escapeHtml(item.detail)}</p></div><div class="followup-item-meta"><strong>${escapeHtml(item.kind)}</strong>${item.due?dateLabel(String(item.due).slice(0,10)):item.days<0?`${Math.abs(item.days)} day(s) waiting`:'Review'}${item.review?`<div class="review-actions"><button class="btn small" data-review-item="${escapeHtml(item.id)}" data-review-status="Reviewed">Reviewed</button><button class="btn small" data-review-item="${escapeHtml(item.id)}" data-review-status="Dismissed">Dismiss</button></div>`:item.eventId?`<div class="review-actions"><button class="btn small" data-open-event="${escapeHtml(item.eventId)}">Open Record</button></div>`:''}</div></article>`;
  }

  async function automationRequest(method='GET', body) {
    const key=localStorage.getItem(APP_KEY)||'';
    if(!key) throw new Error('Enter the LVPT App Sync Key in the System tab first.');
    const response=await fetch('/api/sync/automation',{method,headers:{'x-lvpt-sync-key':key,...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,cache:'no-store'});
    const data=await response.json().catch(()=>({message:'Invalid automation response.'}));
    if(!response.ok||data.ok===false) throw new Error(data.message||`Automation request failed (${response.status}).`);
    return data;
  }

  async function loadAutomationStatus(showToast=false) {
    automationState.loading=true; if(commandView==='followup') renderCommandView();
    try {
      const data=await automationRequest();
      automationState={...automationState,...data,loading:false,loaded:true,configured:true,items:Array.isArray(data.items)?data.items:[],stats:data.stats||{}};
      if(showToast) toast('Client follow-up queue refreshed');
    } catch(error) {
      automationState={...automationState,loading:false,loaded:true,configured:false,error:error.message};
      if(showToast) toast(error.message);
    }
    if(commandView==='followup') renderCommandView();
  }

  async function runAutomation(command) {
    automationState.loading=true; renderCommandView();
    try {
      const data=await automationRequest('POST',{command});
      toast(command==='install'?'Morning and evening email reviews scheduled':'Email review complete');
      if(command==='scan' && typeof pullCloudEvents==='function') await pullCloudEvents(false);
      await loadAutomationStatus(false);
    } catch(error) { automationState.loading=false; toast(error.message); renderCommandView(); }
  }

  async function reviewAutomationItem(reviewId,status) {
    try { await automationRequest('POST',{command:'review',reviewId,status}); toast(`Item marked ${status.toLowerCase()}`); await loadAutomationStatus(false); }
    catch(error){ toast(error.message); }
  }

  function bindEventOpeners(scope=document) {
    scope.querySelectorAll('[data-open-event]').forEach(button=>button.addEventListener('click',()=>{
      selectedId=button.dataset.openEvent; activeTab='setup'; setCommandView('overview'); render();
    }));
    bindProposalOpeners(scope);
  }
  function bindProposalOpeners(scope=document) { scope.querySelectorAll('[data-preview-proposal]').forEach(button=>button.addEventListener('click',()=>previewProposal(button.dataset.previewProposal))); }

  const baseRender=render;
  render=function(){ baseRender(); renderCommandView(); };
  ensureShell();
  renderCommandView();
  loadAutomationStatus(false);
})();
