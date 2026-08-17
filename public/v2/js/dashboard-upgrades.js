(() => {
  const METRIC_SCOPE_KEY='lvptMetricScope';
  let metricScope=localStorage.getItem(METRIC_SCOPE_KEY)||'selected';
  let activeGeneratedReport='pre';

  function scopedEvents(){
    if(metricScope==='all') return events;
    const event=current();
    return event?[event]:[];
  }

  function validUrl(value){
    try { const url=new URL(value); return ['http:','https:'].includes(url.protocol); }
    catch { return false; }
  }

  function ensureMetricScopeControl(){
    if($('#metricScopeBar')) return;
    const bar=document.createElement('section');
    bar.id='metricScopeBar';
    bar.className='metric-scope-bar';
    bar.innerHTML=`<div><p class="eyebrow small">Dashboard View</p><strong id="metricScopeLabel"></strong></div><div class="segmented-control" role="group" aria-label="Dashboard metric scope"><button type="button" data-metric-scope="selected">Selected Event</button><button type="button" data-metric-scope="all">All Events</button></div>`;
    $('#metricsGrid').before(bar);
    all('[data-metric-scope]').forEach(button=>button.addEventListener('click',()=>{
      metricScope=button.dataset.metricScope;
      localStorage.setItem(METRIC_SCOPE_KEY,metricScope);
      renderMetrics();
      refreshMetricScopeControl();
    }));
  }

  function refreshMetricScopeControl(){
    ensureMetricScopeControl();
    all('[data-metric-scope]').forEach(button=>button.classList.toggle('active',button.dataset.metricScope===metricScope));
    const event=current();
    $('#metricScopeLabel').textContent=metricScope==='all'?'All 2026 event records':event?event.eventName:'No event selected';
  }

  renderMetrics=function(){
    const scope=scopedEvents();
    const selected=current();
    const quoted=scope.reduce((sum,event)=>sum+quoteTotal(event),0);
    const paid=scope.reduce((sum,event)=>sum+num(event.payment.amountPaid),0);
    const cost=scope.reduce((sum,event)=>sum+quoteCost(event),0);
    const openTasks=scope.flatMap(event=>event.tasks).filter(task=>!taskIsComplete(task)).length;
    const docs=scope.reduce((sum,event)=>sum+event.documents.length,0);
    const avgSetup=scope.length?Math.round(scope.reduce((sum,event)=>sum+setupCompleteness(event).percent,0)/scope.length):0;
    const scopeName=metricScope==='all'?'All event records':selected?.eventName||'Selected event';
    const taskSub=metricScope==='all'?'Across all events':'For selected event';
    const setupSub=metricScope==='all'?'Average event intake':'Selected event intake';
    const metrics=[
      ['Quoted Revenue',money(quoted),scopeName],
      ['Collected',money(paid),'Recorded payments'],
      ['Outstanding',money(Math.max(quoted-paid,0)),'Quoted less collected'],
      ['Est. Profit',money(quoted-cost),'Before unentered costs'],
      ['Open Tasks',openTasks,taskSub],
      ['Setup Complete',`${avgSetup}%`,setupSub],
      ['Documents',docs,'Invoices, receipts and files'],
      ['Booked Events',scope.filter(event=>['Booked','Pre-Production','Event Day','Completed','Closed Won'].includes(event.status)).length,metricScope==='all'?'Operational pipeline':'Selected record']
    ];
    $('#metricsGrid').innerHTML=metrics.map(metric=>`<div class="metric"><span>${escapeHtml(metric[0])}</span><strong>${escapeHtml(metric[1])}</strong><div class="sub">${escapeHtml(metric[2])}</div></div>`).join('');
    refreshMetricScopeControl();
  };

  const baseRenderEditor=renderEditor;
  renderEditor=function(){
    baseRenderEditor();
    const event=current();
    const panel=$('#eventEditorPanel');
    if(!event||!panel) return;
    if(event.proposalUrl===undefined) event.proposalUrl='';
    const grid=panel.querySelector('.form-grid.three-col');
    if(grid&&!panel.querySelector('[data-proposal-url]')){
      const label=document.createElement('label');
      label.innerHTML=`Proposal URL<input class="input" type="url" placeholder="https://..." value="${escapeHtml(event.proposalUrl||'')}" data-proposal-url />`;
      grid.appendChild(label);
      label.querySelector('input').addEventListener('change',input=>{
        event.proposalUrl=input.target.value.trim();
        saveEvents('Proposal URL saved');
        render();
      });
    }
    const actions=panel.querySelector('.panel-head .actions');
    if(actions&&validUrl(event.proposalUrl)&&!panel.querySelector('#openProposalBtn')){
      const link=document.createElement('a');
      link.id='openProposalBtn';
      link.className='btn small';
      link.href=event.proposalUrl;
      link.target='_blank';
      link.rel='noopener';
      link.textContent='Open Proposal';
      actions.prepend(link);
    }
  };

  function reportValue(label,value){
    const display=value!==''&&value!==null&&value!==undefined?value:'Not entered';
    return `<div class="report-kv"><span>${escapeHtml(label)}</span><strong>${escapeHtml(display)}</strong></div>`;
  }

  function reportText(title,value){
    return `<div class="report-text-block"><h4>${escapeHtml(title)}</h4><p>${escapeHtml(value||'Not entered.')}</p></div>`;
  }

  function reportSection(title,subtitle,content){
    return `<section class="generated-report-section"><div class="generated-report-section-head"><div><p class="eyebrow small">${escapeHtml(subtitle||'Event Record')}</p><h3>${escapeHtml(title)}</h3></div></div>${content}</section>`;
  }

  function reportTable(headers,rows,emptyText){
    if(!rows.length) return `<div class="report-empty">${escapeHtml(emptyText)}</div>`;
    return `<div class="report-table"><div class="report-table-row report-table-head">${headers.map(header=>`<span>${escapeHtml(header)}</span>`).join('')}</div>${rows.map(row=>`<div class="report-table-row">${row.map(cell=>`<span>${escapeHtml(cell)}</span>`).join('')}</div>`).join('')}</div>`;
  }

  function selectedEventReport(event,type){
    const completion=setupCompleteness(event);
    const total=quoteTotal(event);
    const cost=quoteCost(event);
    const title=type==='post'?'Post-Event & After-Action Report':'Pre-Event Command Report';
    const subtitle=type==='post'?'Complete event history, results and follow-up':'Complete event briefing and operational record';
    const quoteRows=(event.quote||[]).map(item=>[item.category,item.name,String(item.quantity),money(item.unitPrice),money(num(item.quantity)*num(item.unitPrice)),money(item.internalCost)]);
    const taskRows=(event.tasks||[]).map(item=>[item.title,item.owner,item.dueDate||'Not set',item.priority,taskStatusLabel(item)]);
    const staffRows=(event.staff||[]).map(item=>[item.name,item.role,item.confirmed?'Yes':'No',humanTime(item.arrivalTime),money(item.rate)]);
    const complianceRows=(event.compliance||[]).map(item=>[item.name,item.status,item.dueDate||'Not set']);
    const documentRows=(event.documents||[]).map(item=>[item.category,item.name,item.vendor||'—',item.documentDate||'—',item.amount?money(item.amount):'—']);
    const emailRows=(event.emailActivity||[]).map(item=>[item.subject||'(No subject)',item.from||'Unknown',item.date||'—',item.direction||'received',item.snippet||'']);
    const setup=event.setup||{};
    const header=`<div class="generated-report-hero"><div><p class="eyebrow">Las Vegas Poker Training</p><h2>${escapeHtml(title)}</h2><p>${escapeHtml(subtitle)}</p></div><div class="generated-report-badge">${escapeHtml(event.status)}</div></div><div class="generated-report-title"><div><h1>${escapeHtml(event.eventName)}</h1><p>${escapeHtml(event.company)} · ${escapeHtml(event.eventDate||'Date TBD')} · ${escapeHtml(event.venue||'Venue TBD')}, ${escapeHtml(event.city||'')}${event.state?`, ${escapeHtml(event.state)}`:''}</p></div>${validUrl(event.proposalUrl)?`<a class="btn primary" href="${escapeHtml(event.proposalUrl)}" target="_blank" rel="noopener">Open Proposal</a>`:''}</div><div class="generated-report-metrics">${[
      ['Quote',money(total)],['Collected',money(event.payment.amountPaid)],['Outstanding',money(balance(event))],['Estimated Profit',money(total-cost)],['Open Tasks',String((event.tasks||[]).filter(task=>!taskIsComplete(task)).length)],['Setup',`${completion.percent}%`]
    ].map(item=>`<div><span>${escapeHtml(item[0])}</span><strong>${escapeHtml(item[1])}</strong></div>`).join('')}</div>`;

    const overview=reportSection('Current Event Information','Full Event Editor',`<div class="report-kv-grid">${[
      ['Primary Contact',event.contactName],['Contact Email',event.contactEmail],['Contact Phone',event.contactPhone],['Event Type',event.eventType],['Lead Source',event.leadSource],['Close Probability',`${event.probabilityToClose||0}%`],['Start',humanTime(event.startTime)],['End',humanTime(event.endTime)],['Guests',String(event.guestCount||0)],['Training Participants',String(event.studentCount||0)],['Skill Level',event.skillLevel],['Next Action Due',event.nextActionDue],['Payment Status',event.payment.status],['Balance Due Date',event.payment.balanceDueDate],['Proposal URL',event.proposalUrl||'Not entered']
    ].map(([label,value])=>reportValue(label,value)).join('')}</div><div class="report-text-grid">${reportText('Event Goal',event.eventGoal)}${reportText('Event Format',event.eventFormat)}${reportText('Client Expectations',event.clientExpectations)}${reportText('Known Risks / Red Flags',event.knownRisks)}${reportText('Next Action',event.nextAction)}</div>`);

    const setupSection=reportSection('Setup & Production','Guided Event Setup',`<div class="report-kv-grid">${[
      ['Planning Stage',setup.planningStage],['Budget Range',setup.budgetRange],['PO Required',setup.poRequired],['PO Number',setup.poNumber],['Time Zone',setup.timeZone],['Venue Status',setup.venueStatus],['Venue Contact',setup.venueContact],['Venue Email',setup.venueEmail],['Setup Access',humanTime(setup.setupTime)],['Strike Complete',humanTime(setup.strikeTime)],['Primary Goal',setup.primaryGoal],['Experience Duration',setup.experienceDuration],['Training Format',setup.trainingFormat],['Game Format',setup.gameFormat],['Competition Level',setup.competitionLevel],['Food & Beverage',setup.foodPlan],['Tables',String(setup.tableCount||0)],['Dealers',String(setup.dealerCount||0)],['Pros / Instructors',String(setup.proCount||0)],['Lead Pro / MC',setup.leadProNeeded],['Tournament Director',setup.tdNeeded],['AV Needed',setup.avNeeded],['Equipment Source',setup.equipmentSource],['Branding Required',setup.brandingRequired],['Shipping Required',setup.shippingRequired],['Dress Code',setup.dressCode],['Tax Status',setup.taxStatus],['COI Required',setup.coiRequired],['W-9 Required',setup.w9Required],['Vendor Registration',setup.vendorRegistration],['License Review',setup.licenseRequired],['Contract Required',setup.contractRequired],['Internal Owner',setup.internalOwner],['Reminder Cadence',setup.reminderCadence],['Gmail Search Terms',setup.gmailKeywords],['Automatic Email Matching',setup.autoEmailMatch]
    ].map(([label,value])=>reportValue(label,value)).join('')}</div><div class="report-text-grid">${reportText('Stakeholders',setup.stakeholders)}${reportText('Parking / Loading',setup.parkingInstructions)}${reportText('Travel / Lodging',setup.travelNeeds)}${reportText('Desired Add-ons',setup.addOns)}${reportText('Power / Internet',setup.powerInternet)}${reportText('Accessibility / Guest Needs',setup.accessibilityNeeds)}${reportText('Room Layout / Floor Plan',setup.layoutNotes)}${reportText('Production Notes',setup.productionNotes)}${reportText('Payment / Procurement Notes',setup.paymentNotes)}${reportText('Venue / Compliance Notes',setup.complianceNotes)}${reportText('Communication Notes',setup.communicationNotes)}${reportText('Miscellaneous Notes',setup.miscNotes)}</div>`);

    const quoteSection=reportSection('Quote & Financials','Quote',`${reportTable(['Category','Line Item','Qty','Unit Price','Client Total','Internal Cost'],quoteRows,'No quote line items entered.')}<div class="generated-report-totals"><div><span>Quote Total</span><strong>${money(total)}</strong></div><div><span>Internal Cost</span><strong>${money(cost)}</strong></div><div><span>Estimated Profit</span><strong>${money(total-cost)}</strong></div><div><span>Deposit Required</span><strong>${money(event.payment.depositRequired)}</strong></div><div><span>Collected</span><strong>${money(event.payment.amountPaid)}</strong></div><div><span>Outstanding</span><strong>${money(balance(event))}</strong></div></div>`);
    const tasksSection=reportSection('Tasks & Reminders','Action Plan',reportTable(['Task','Owner','Due','Priority','Status'],taskRows,'No tasks entered.'));
    const staffSection=reportSection('Staff','Pros, Dealers, MCs & TDs',reportTable(['Name','Role','Confirmed','Arrival','Rate'],staffRows,'No staff assigned.'));
    const complianceSection=reportSection('Compliance','Venue, Vendor & Legal',reportTable(['Requirement','Status','Due'],complianceRows,'No compliance items entered.'));
    const documentsSection=reportSection('Documents','Invoices, Proposals, Receipts & Files',reportTable(['Category','Document','Vendor','Date','Amount'],documentRows,'No documents indexed.'));
    const inboxSection=reportSection('Inbox & Reminders','Gmail-Assisted Event Management',`${reportTable(['Subject','From','Date','Direction','Summary'],emailRows,'No matched Gmail activity yet.')}<div class="report-text-grid top-gap">${reportText('Gmail Matching Terms',setup.gmailKeywords)}${reportText('Communication Notes',setup.communicationNotes)}</div>`);
    const postSection=reportSection('Post-Event','After-Action Review',`<div class="report-text-grid">${reportText('Client Feedback',event.postEvent.clientFeedback)}${reportText('What Went Well',event.postEvent.whatWentWell)}${reportText('Pain Points',event.postEvent.painPoints)}${reportText('Changes Next Time',event.postEvent.changesForNextTime)}</div><div class="report-kv-grid top-gap">${reportValue('Review Requested',event.postEvent.reviewRequested?'Yes':'No')}${reportValue('Review Received',event.postEvent.reviewReceived?'Yes':'No')}${reportValue('Rebooking Likelihood',event.postEvent.rebookingLikelihood)}</div>`);
    return `<article class="generated-report">${header}${overview}${setupSection}${quoteSection}${tasksSection}${staffSection}${complianceSection}${documentsSection}${inboxSection}${postSection}</article>`;
  }

  function overallReport(){
    const quoted=events.reduce((sum,event)=>sum+quoteTotal(event),0);
    const paid=events.reduce((sum,event)=>sum+num(event.payment.amountPaid),0);
    const costs=events.reduce((sum,event)=>sum+quoteCost(event),0);
    const open=events.flatMap(event=>event.tasks).filter(task=>!taskIsComplete(task)).length;
    const avg=events.length?Math.round(events.reduce((sum,event)=>sum+setupCompleteness(event).percent,0)/events.length):0;
    const cards=events.map(event=>`<section class="overall-event-card"><div><p class="eyebrow small">${escapeHtml(event.status)}</p><h3>${escapeHtml(event.eventName)}</h3><p>${escapeHtml(event.company)} · ${escapeHtml(event.eventDate||'Date TBD')} · ${escapeHtml(event.venue||'Venue TBD')}</p></div><div class="overall-event-grid">${reportValue('Quote',money(quoteTotal(event)))}${reportValue('Collected',money(event.payment.amountPaid))}${reportValue('Outstanding',money(balance(event)))}${reportValue('Open Tasks',String(event.tasks.filter(task=>!taskIsComplete(task)).length))}${reportValue('Setup',`${setupCompleteness(event).percent}%`)}${reportValue('Next Action',event.nextAction)}</div>${validUrl(event.proposalUrl)?`<a class="btn small" href="${escapeHtml(event.proposalUrl)}" target="_blank" rel="noopener">Open Proposal</a>`:''}</section>`).join('');
    return `<article class="generated-report"><div class="generated-report-hero"><div><p class="eyebrow">Las Vegas Poker Training</p><h2>Overall 2026 Event Report</h2><p>Portfolio-level financial, operational and conversion snapshot.</p></div><div class="generated-report-badge">${events.length} Events</div></div><div class="generated-report-metrics">${[
      ['Quoted Revenue',money(quoted)],['Collected',money(paid)],['Outstanding',money(Math.max(quoted-paid,0))],['Estimated Profit',money(quoted-costs)],['Open Tasks',String(open)],['Average Setup',`${avg}%`]
    ].map(item=>`<div><span>${escapeHtml(item[0])}</span><strong>${escapeHtml(item[1])}</strong></div>`).join('')}</div>${reportSection('Event Portfolio','All Events',`<div class="overall-event-list">${cards||'<div class="report-empty">No event records.</div>'}</div>`)}</article>`;
  }

  function ensureReportCenter(){
    if($('#reportCenter')) return;
    const section=document.createElement('section');
    section.id='reportCenter';
    section.className='report-center panel';
    section.innerHTML=`<div class="report-center-head"><button type="button" class="report-title-button" id="reportsTitleBtn">REPORTS</button><p>Generate a clean, read-only briefing from every part of the event record.</p><div class="report-type-buttons"><button type="button" class="btn primary" data-generate-report="pre">Pre-Event</button><button type="button" class="btn" data-generate-report="post">Post-Event</button><button type="button" class="btn" data-generate-report="overall">Overall</button></div><div class="report-context" id="reportContext"></div></div><div class="generated-report-actions"><button type="button" class="btn" id="printGeneratedReportBtn">Print / Save PDF</button><button type="button" class="btn" id="copyGeneratedReportBtn">Copy Report Text</button></div><div id="generatedReportOutput"></div>`;
    $('.layout-grid').after(section);
    all('[data-generate-report]').forEach(button=>button.addEventListener('click',()=>generateVisualReport(button.dataset.generateReport)));
    $('#reportsTitleBtn').addEventListener('click',()=>generateVisualReport(activeGeneratedReport));
    $('#printGeneratedReportBtn').addEventListener('click',()=>window.print());
    $('#copyGeneratedReportBtn').addEventListener('click',()=>navigator.clipboard.writeText($('#generatedReportOutput').innerText).then(()=>toast('Report copied')));
    refreshReportContext();
    generateVisualReport('pre');
  }

  function refreshReportContext(){
    if(!$('#reportContext')) return;
    const event=current();
    $('#reportContext').textContent=activeGeneratedReport==='overall'?'All 2026 events':event?`Selected event: ${event.eventName}`:'No event selected';
    all('[data-generate-report]').forEach(button=>button.classList.toggle('primary',button.dataset.generateReport===activeGeneratedReport));
  }

  function generateVisualReport(type){
    activeGeneratedReport=type;
    ensureReportCenter();
    const event=current();
    $('#generatedReportOutput').innerHTML=type==='overall'?overallReport():event?selectedEventReport(event,type):'<div class="report-empty">Select an event to generate this report.</div>';
    refreshReportContext();
    $('#reportCenter').scrollIntoView({behavior:'smooth',block:'start'});
  }

  renderReportsTab=function(event){
    $('#tabContent').innerHTML=`<div class="report-tab-launch"><p class="eyebrow small">Partner Reports</p><h2>Complete Visual Reports</h2><p class="muted">The full report generator now lives below the event workspace and combines the editor, setup, quote, tasks, staff, compliance, documents, Gmail activity, reminders and post-event information into one clean read-only report.</p><button class="btn primary" id="openReportCenterBtn">Open Report Center</button></div>`;
    $('#openReportCenterBtn').addEventListener('click',()=>generateVisualReport('pre'));
  };

  const baseRender=render;
  render=function(){
    baseRender();
    ensureMetricScopeControl();
    ensureReportCenter();
    refreshMetricScopeControl();
    refreshReportContext();
    if($('#generatedReportOutput')) $('#generatedReportOutput').innerHTML=activeGeneratedReport==='overall'?overallReport():(current()?selectedEventReport(current(),activeGeneratedReport):'<div class="report-empty">Select an event to generate this report.</div>');
  };

  const style=document.createElement('style');
  style.textContent=`
    .metric-scope-bar{display:flex;align-items:center;justify-content:space-between;gap:14px;margin:18px 0 0;padding:12px 14px;border:1px solid var(--line);border-radius:20px;background:rgba(0,0,0,.3)}
    .metric-scope-bar strong{font-size:14px}.segmented-control{display:flex;gap:6px;padding:5px;border:1px solid var(--line);border-radius:999px;background:#09090b}.segmented-control button{border:0;background:transparent;color:var(--muted);border-radius:999px;padding:8px 12px;font-weight:900}.segmented-control button.active{background:var(--gold);color:#18181b}
    .report-center{margin-top:22px;padding:clamp(18px,3vw,32px)}.report-center-head{text-align:center;max-width:880px;margin:0 auto}.report-title-button{border:1px solid rgba(250,204,21,.38);background:linear-gradient(135deg,rgba(250,204,21,.16),rgba(250,204,21,.04));color:var(--gold-soft);border-radius:999px;padding:14px 28px;font-size:clamp(24px,4vw,44px);font-weight:950;letter-spacing:.18em}.report-center-head>p{color:var(--muted);line-height:1.6}.report-type-buttons{display:flex;justify-content:center;gap:10px;flex-wrap:wrap;margin-top:14px}.report-context{margin-top:12px;color:#d4d4d8;font-weight:850}.generated-report-actions{display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap;margin:22px 0 12px}
    .generated-report{border:1px solid rgba(250,204,21,.2);border-radius:28px;overflow:hidden;background:linear-gradient(180deg,rgba(255,255,255,.045),rgba(0,0,0,.24))}.generated-report-hero{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;padding:clamp(20px,3vw,34px);background:linear-gradient(135deg,rgba(127,29,29,.45),rgba(0,0,0,.45));border-bottom:1px solid var(--line)}.generated-report-hero h2{margin:0;font-size:clamp(26px,4vw,46px)}.generated-report-hero p{margin:9px 0 0;color:#d4d4d8}.generated-report-badge{border:1px solid rgba(250,204,21,.34);background:rgba(250,204,21,.1);color:var(--gold-soft);border-radius:999px;padding:9px 13px;font-weight:950;white-space:nowrap}.generated-report-title{display:flex;justify-content:space-between;gap:14px;align-items:center;padding:24px 28px;border-bottom:1px solid var(--line)}.generated-report-title h1{margin:0;font-size:clamp(28px,4vw,48px);letter-spacing:-.04em}.generated-report-title p{margin:8px 0 0;color:var(--muted)}.generated-report-metrics{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:1px;background:var(--line);border-bottom:1px solid var(--line)}.generated-report-metrics>div{background:#111113;padding:16px}.generated-report-metrics span,.generated-report-totals span{display:block;color:#71717a;font-size:10px;font-weight:950;letter-spacing:.13em;text-transform:uppercase}.generated-report-metrics strong,.generated-report-totals strong{display:block;margin-top:7px;font-size:20px}.generated-report-section{padding:24px 28px;border-bottom:1px solid var(--line)}.generated-report-section:last-child{border-bottom:0}.generated-report-section-head{margin-bottom:14px}.generated-report-section h3{font-size:22px}.report-kv-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.report-kv{border:1px solid var(--line);background:rgba(0,0,0,.2);border-radius:15px;padding:12px}.report-kv span{display:block;color:#71717a;font-size:10px;font-weight:950;letter-spacing:.12em;text-transform:uppercase}.report-kv strong{display:block;margin-top:6px;font-size:13px;overflow-wrap:anywhere}.report-text-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:10px}.report-text-block{border:1px solid var(--line);background:rgba(0,0,0,.18);border-radius:16px;padding:14px}.report-text-block h4{margin:0;font-size:13px}.report-text-block p{margin:7px 0 0;color:#d4d4d8;line-height:1.55;white-space:pre-wrap}.report-table{display:grid;gap:7px;overflow-x:auto}.report-table-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(125px,1fr));gap:8px;border:1px solid var(--line);border-radius:14px;padding:11px;background:rgba(0,0,0,.18);min-width:760px}.report-table-row span{font-size:12px;line-height:1.45;overflow-wrap:anywhere}.report-table-head{background:rgba(250,204,21,.08);color:var(--gold-soft);font-weight:950}.report-empty{border:1px dashed rgba(255,255,255,.18);border-radius:16px;padding:24px;text-align:center;color:var(--muted)}.generated-report-totals{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px;margin-top:12px}.generated-report-totals>div{border:1px solid var(--line);border-radius:14px;padding:12px;background:rgba(0,0,0,.22)}.overall-event-list{display:grid;gap:12px}.overall-event-card{border:1px solid var(--line);border-radius:18px;padding:16px;background:rgba(0,0,0,.2)}.overall-event-card h3{font-size:20px}.overall-event-card p{color:var(--muted)}.overall-event-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:12px 0}.report-tab-launch{text-align:center;padding:42px 20px}.report-tab-launch p{max-width:760px;margin:12px auto 20px;line-height:1.65}
    @media(max-width:1100px){.generated-report-metrics,.generated-report-totals{grid-template-columns:repeat(3,1fr)}.report-kv-grid{grid-template-columns:repeat(2,1fr)}}
    @media(max-width:720px){.metric-scope-bar,.generated-report-hero,.generated-report-title{align-items:flex-start;flex-direction:column}.segmented-control{width:100%}.segmented-control button{flex:1}.generated-report-metrics,.generated-report-totals,.report-kv-grid,.report-text-grid,.overall-event-grid{grid-template-columns:1fr}.generated-report-section,.generated-report-title{padding:18px}.generated-report-actions{justify-content:stretch}.generated-report-actions .btn{width:100%}}
    @media print{body{background:white;color:#111}.hero-card,.attention-bar,.metric-scope-bar,.metrics-grid,.layout-grid,.report-center-head,.generated-report-actions,.toast{display:none!important}.app-shell{width:100%;padding:0}.report-center{border:0;box-shadow:none;background:white;padding:0}.generated-report{border:0;background:white}.generated-report *{color:#111!important}.generated-report-section,.generated-report-hero,.generated-report-title{break-inside:avoid;background:white}.report-kv,.report-text-block,.report-table-row,.overall-event-card{background:white;border-color:#bbb}}
  `;
  document.head.appendChild(style);

  events.forEach(event=>{ if(event.proposalUrl===undefined) event.proposalUrl=''; });
  render();
})();
