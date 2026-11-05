(function () {
  'use strict';
  const engine = window.LVPTSMSReview;
  const caseEngine = window.LVPTSMSCases;
  const reconciliation = window.LVPTSMSReconciliation;
  const evidence = window.LVPTSMSEvidence;
  const $ = id => document.getElementById(id);
  let raw = null;
  let report = null;
  let decisions = Object.create(null);
  let visibleLimit = 25;
  let bundleLimit = 12;
  let caseBundles = [];
  let caseDecisions = Object.create(null);
  let activeCaseKey = '';
  let connectedRecords = [];
  let recordsAvailable = false;
  let payoutLedgerConnected = false;
  let payoutRecords = [];
  let sessionToken = ''; // Non-secret session flag; credentials are HttpOnly and server-side.

  let savedSourceCounts = Object.create(null);
  const STATUS = ['Unreviewed', 'Needs verification', 'Approved for export', 'Dismissed'];
  const CATEGORY = ['All categories', 'Finance', 'Follow-up', 'Lead / sales', 'Event operations', 'Business context'];
  const dateFmt = value => new Date(value).toLocaleString('en-US', { year:'numeric', month:'short', day:'numeric', hour:'numeric', minute:'2-digit' });
  function setStatus(message, error = false) {
    $('notice').textContent = message;
    $('notice').classList.toggle('error', !!error);
  }
  function makeText(tag, className, value) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    el.textContent = value;
    return el;
  }
  function renderPayoutAudit() {
    const status=$('payoutAuditStatus');
    const rows=$('payoutAuditItems');
    rows.replaceChildren();
    if(!report || report.source!=='staging') {
      status.textContent='Load authenticated staging findings to compare current payouts.';
      return;
    }
    if(!recordsAvailable) {
      status.textContent='Command Center source unavailable. No payout conclusions can be made.';
      return;
    }
    const brief=evidence.payoutBrief(payoutRecords,payoutLedgerConnected,connectedRecords);
    if(!brief.connected) {
      status.textContent='Event Payouts ledger not connected. No status or balance assumptions will be made.';
      return;
    }
    const plannedAmount=brief.plannedTotalCents===null?' (total unavailable)' :
      ' ('+(brief.plannedTotalCents/100).toLocaleString('en-US',{style:'currency',currency:'USD'})+
      ' recorded planned, not necessarily due)';
    status.textContent='Current Event Payouts ledger: '+brief.total+' entries — '+
      brief.paid+' recorded Paid, '+brief.planned+' Planned'+plannedAmount+
      ', '+brief.other+' Other. '+brief.paidMissingDate+
      ' Paid entry/entries lack a recorded paid date. Bank settlement not independently verified.';
    if(!brief.exceptions.length) {
      rows.append(makeText('p','hint',
        'No Planned or Other payout entries recorded. This does not establish that all outside vendor bills have been paid.'));
      return;
    }
    brief.exceptions.forEach(p=>{
      const row=makeText('div','payout-exception','');
      row.append(makeText('strong','',p.eventName+' · '+p.payee));
      const label=p.amount===null?'amount not recorded':p.amount.toLocaleString('en-US',{style:'currency',currency:'USD'});
      row.append(makeText('p','',p.payoutType+' · '+label+' · ledger status: '+p.status));
      rows.append(row);
    });
  }

  function summary() {
    $('results').hidden = !report;
    $('exportDecisions').disabled = !report;
    $('exportCaseDecisions').disabled = !report;
    $('saveCaseDecisions').disabled = !report || report.source !== 'staging' || !sessionToken;
    if (!report) { caseBundles = []; $('caseList').replaceChildren(); $('caseExplain').textContent = 'Load staging findings to see consolidated cases.'; renderPayoutAudit(); renderAttentionBrief(); return; }
    caseBundles = caseEngine.createBundles(report.findings);
    if (!report) return;
    const reviewed = caseBundles.filter(b=>caseDecisions[b.key]?.status && caseDecisions[b.key].status !== 'Unreviewed').length;
    $('summary').replaceChildren();
    [
      ['SMS records scanned', report.count.toLocaleString()],
      ['SMS since ' + report.after, report.afterDateCount.toLocaleString()],
      ['Business candidates', report.findings.length.toLocaleString()],
      ['Reviewed cases', reviewed.toLocaleString()],
    ].forEach(([label, number]) => {
      const card = makeText('div', 'metric', '');
      card.append(makeText('span', 'metric-label', label), makeText('strong', 'metric-number', number));
      $('summary').append(card);
    });
    $('explainResults').textContent = report.findings.length + ' candidates were flagged for human review. ' +
      report.excludedCount + ' SMS records since the cutoff had no strong LVPT business match. ' +
      report.duplicateCount + ' duplicate IDs were ignored. Flags are suggestions, not verified facts.';
    renderCaseBundles();
  }
  function filtered() {
    if (!report) return [];
    const q = $('findQuery').value.toLowerCase().trim();
    const category = $('findCategory').value;
    const status = $('findStatus').value;
    return report.findings.filter(item => {
      const review = decisions[item.id] || {status:'Unreviewed'};
      if (category !== 'All categories' && item.category !== category) return false;
      if (status !== 'All statuses' && review.status !== status) return false;
      if (activeCaseKey) {
        const active = caseBundles.find(c => c.key === activeCaseKey);
        if (!active || !active.findings.some(f => f.id === item.id)) return false;
      }
      if (q && ![item.category, item.eventHint, item.excerpt, String(item.smsId)].join(' ').toLowerCase().includes(q)) return false;
      return true;
    });
  }
  function priorityOf(bundle,decision) {
    const savedCount=savedSourceCounts[bundle.key];
    const changed=savedCount!==undefined && savedCount!==bundle.count;
    return reconciliation.prioritizeCase(bundle,connectedRecords,decision,recordsAvailable,changed);
  }
  function renderAttentionBrief() {
    const section=$('attentionBrief');
    section.replaceChildren();
    if(!report) {
      section.append(makeText('p','hint','Load the staging inbox to see suggested review priorities.'));
      return;
    }
    const first=caseBundles.map(bundle=>{
      const review=caseDecisions[bundle.key]||{status:'Unreviewed'};
      return {bundle,review,priority:priorityOf(bundle,review)};
    }).filter(x=>x.priority.rank<=1).sort((a,b)=>
      a.priority.rank-b.priority.rank || b.bundle.latest.localeCompare(a.bundle.latest)
    ).slice(0,5);
    if(!first.length) {
      section.append(makeText('p','hint',
        recordsAvailable ?
          'No urgent SMS review bundles detected under the current rules. This is not a statement that all work or financial obligations are complete.' :
          'Current Command Center snapshot unavailable. Reconnect it before prioritizing unresolved work.'));
      return;
    }
    first.forEach((item,i)=>{
      const line=makeText('div','attention-brief-item','');
      const title=makeText('div','attention-brief-copy','');
      title.append(makeText('strong','',String(i+1)+'. '+item.bundle.eventLabel+' — '+item.bundle.topic));
      title.append(makeText('p','',item.priority.label+' · '+item.bundle.count+
        ' SMS source'+(item.bundle.count===1?'':'s')));
      title.append(makeText('p','',item.priority.explanation));
      const btn=document.createElement('button');
      btn.type='button';
      btn.className='neutral';
      btn.textContent='Review issue';
      btn.addEventListener('click',()=>{
        $('caseSearch').value=item.bundle.eventLabel;
        $('caseEventFilter').value='all';
        $('caseAttentionFilter').value='all';
        $('caseStatusFilter').value='all';
        bundleLimit=Math.max(12,caseBundles.length);
        renderCaseBundles();
        const card=[...document.querySelectorAll('#caseList .case-card')]
          .find(node=>node.dataset.caseKey===item.bundle.key);
        if(card) card.scrollIntoView({behavior:'smooth',block:'start'});
      });
      line.append(title,btn);
      section.append(line);
    });
  }

  function renderCaseBundles() {
    const all = caseBundles;
    const search = $('caseSearch').value.trim().toLowerCase();
    const eventFilter = $('caseEventFilter').value;
    const attentionFilter = $('caseAttentionFilter').value;
    const statusFilter = $('caseStatusFilter').value;
    const reviewed = caseBundles.filter(b=>caseDecisions[b.key]?.status && caseDecisions[b.key].status !== 'Unreviewed').length;
    const reviewMetric=document.querySelector('#summary .metric:nth-child(4) .metric-number');
    if(reviewMetric) reviewMetric.textContent=reviewed.toLocaleString();
    $('caseExplain').textContent = all.length + ' event/issue review bundles from ' +
      (report?.findings.length || 0) + ' business SMS candidates. ' +
      reviewed + ' bundles reviewed. Grouping is heuristic; no payments or event records have been verified.';
    const shown = all.filter(bundle => {
      const decision = caseDecisions[bundle.key] || {status:'Unreviewed'};
      if (eventFilter === 'matched' && !bundle.explicitReference) return false;
      if (eventFilter === 'unmatched' && bundle.explicitReference) return false;
      const priority = priorityOf(bundle,decision);
      if (attentionFilter !== 'all' && priority.group !== attentionFilter) return false;
      if (statusFilter !== 'all' && decision.status !== statusFilter) return false;
      if (search && ![bundle.eventLabel,bundle.topic,...bundle.categories].join(' ').toLowerCase().includes(search))
        return false;
      return true;
    }).sort((a,b)=>{
      const da=caseDecisions[a.key]||{status:'Unreviewed'};
      const db=caseDecisions[b.key]||{status:'Unreviewed'};
      const pa=priorityOf(a,da);
      const pb=priorityOf(b,db);
      return pa.rank-pb.rank || b.latest.localeCompare(a.latest);
    });
    renderAttentionBrief();
    const parent = $('caseList');
    parent.replaceChildren();
    if (!shown.length) parent.append(makeText('p','empty','No review bundles match this filter.'));
    shown.slice(0,bundleLimit).forEach(bundle => {
      const review = caseDecisions[bundle.key] || {status:'Unreviewed',note:''};
      const box = makeText('article','case-card','');
      box.dataset.caseKey=bundle.key;
      const heading = makeText('div','finding-top','');
      const priority=priorityOf(bundle,review);
      heading.append(makeText('span','attention-label',priority.label));
      heading.append(
        makeText('span','tag',bundle.explicitReference ? 'Explicit name mentioned' : 'Event not identified'),
        makeText('span','secondary',bundle.count+' SMS source'+(bundle.count===1?'':'s')),
        makeText('span','secondary',bundle.financial ? 'Finance verification' : 'Business review')
      );
      box.append(heading);
      box.append(makeText('h3','',bundle.eventLabel));
      box.append(makeText('h4','',bundle.topic));
      box.append(makeText('p','guidance',bundle.explicitReference ?
        'Client name mentioned in a message; event year and official record are not confirmed.' :
        'No unique client/event identifier. These messages may concern different events.'));
      box.append(makeText('p','case-recommendation','Suggested next check: '+bundle.suggestedCheck));
      box.append(makeText('p','guidance',priority.explanation));
      if (recordsAvailable) {
        const result = reconciliation.checkCase(bundle, connectedRecords);
        const reconciliationLine = makeText('div','reconciliation-detail','');
        reconciliationLine.append(
          makeText('strong','',result.label),
          makeText('p','',result.detail)
        );
        box.append(reconciliationLine);
      }
      if(recordsAvailable && evidence) {
        const related=reconciliation.checkCase(bundle,connectedRecords);
        const record=related.record||null;
        const comparisons=evidence.inspectBundle(bundle,connectedRecords,payoutRecords,
          payoutLedgerConnected,record);
        if(comparisons.linked) {
          if(comparisons.taskMatches.length) {
            const section=makeText('div','evidence-detail','');
            section.append(makeText('strong','','Possible existing task overlap (not confirmation of completion)'));
            comparisons.taskMatches.forEach(t=>section.append(
              makeText('p','',t.title+' — status in Command Center: '+(t.status||'Unknown'))
            ));
            box.append(section);
          }
          if(comparisons.emailMatches.length) {
            const section=makeText('div','evidence-detail','');
            section.append(makeText('strong','','Possible logged Gmail thread overlap (partial Activity log; not proof of a reply)'));
            comparisons.emailMatches.forEach(mail=>section.append(
              makeText('p','',mail.subject+' — '+(mail.date||'date unavailable'))
            ));
            box.append(section);
          }
          if(comparisons.payoutEvidence) {
            const p=comparisons.payoutEvidence;
            const section=makeText('div','evidence-detail','');
            section.append(makeText('strong','','Event Payouts ledger — recorded statuses, not bank verification'));
            section.append(makeText('p','','Paid: '+p.statuses.Paid+
              ' · Planned: '+p.statuses.Planned+' · Other: '+p.statuses.Other));
            p.matching.forEach(item=>section.append(makeText('p','',
              'Possible payee + amount match: '+item.payee+' · '+
              Number(item.amount).toLocaleString('en-US',{style:'currency',currency:'USD'})+
              ' · recorded '+item.ledgerStatus)));
            box.append(section);
          }
        }
      }
      if (savedSourceCounts[bundle.key]!==undefined && savedSourceCounts[bundle.key]!==bundle.count) {
        box.append(makeText('p','case-alert','New or changed SMS source count since last saved review ('+
          savedSourceCounts[bundle.key]+' → '+bundle.count+'). Recheck the case.'));
      }
      const samples = makeText('div','case-samples','');
      bundle.sample.forEach(f => {
        const sample = makeText('div','case-sample','');
        sample.append(
          makeText('span','secondary','SMS #'+f.smsId+' · '+dateFmt(f.date)),
          makeText('p','excerpt',f.excerpt || '[No excerpt]')
        );
        samples.append(sample);
      });
      box.append(samples);
      const controls = makeText('div','review-controls','');
      const select = document.createElement('select');
      select.setAttribute('aria-label','Review status for '+bundle.eventLabel+' '+bundle.topic);
      ['Unreviewed','Needs verification','Investigating','Reviewed — no action','Candidate for reconciliation']
        .forEach(s => select.add(new Option(s,s)));
      select.value=review.status;
      select.addEventListener('change',()=> {
        caseDecisions[bundle.key] = {
          ...(caseDecisions[bundle.key]||{note:''}),
          status:select.value
        };
        renderCaseBundles();
      });
      const note = document.createElement('input');
      note.className='note';
      note.type='text';
      note.maxLength=500;
      note.placeholder='Reviewer note — no account numbers or sensitive details';
      note.setAttribute('aria-label','Case note for '+bundle.eventLabel+' '+bundle.topic);
      note.value=review.note||'';
      note.addEventListener('input',()=>{
        caseDecisions[bundle.key] = {
          ...(caseDecisions[bundle.key]||{status:'Unreviewed'}),
          note:note.value
        };
      });
      controls.append(select,note);
      box.append(controls);
      const drill = document.createElement('button');
      drill.type='button';
      drill.className='neutral case-open';
      drill.textContent='Inspect all '+bundle.count+' source SMS';
      drill.addEventListener('click',()=>{
        activeCaseKey=bundle.key;
        $('findQuery').value='';
        $('findCategory').value='All categories';
        $('findStatus').value='All statuses';
        visibleLimit=25;
        $('clearCaseFilter').hidden=false;
        render();
        $('queue').scrollIntoView({behavior:'smooth',block:'start'});
      });
      box.append(drill);
      parent.append(box);
    });
    $('showMoreCases').hidden = shown.length <= bundleLimit;
  }

  function setDecision(item, status) {
    const prev = decisions[item.id] || {status:'Unreviewed', note:''};
    decisions[item.id] = {...prev, status};
    summary();
    render();
  }
  function render() {
    const list = $('queue');
    list.replaceChildren();
    if (!report) return;
    const items = filtered();
    $('clearCaseFilter').hidden = !activeCaseKey;
    const extra = activeCaseKey ? ' (filtered to selected review bundle)' : '';
    $('shownCount').textContent = items.length.toLocaleString() + ' matching findings'+extra;
    if (!items.length) list.append(makeText('p','empty','No findings match these filters.'));
    items.slice(0, visibleLimit).forEach(item => {
      const decision = decisions[item.id] || {status:'Unreviewed',note:''};
      const row = makeText('article','finding','');
      const top = makeText('div','finding-top','');
      top.append(makeText('span','tag',item.category), makeText('span','secondary',dateFmt(item.date)),
        makeText('span','secondary',item.direction === 'incoming' ? 'Incoming':'Outgoing'));
      row.append(top);
      row.append(makeText('h3','',item.eventHint + ' · SMS #' + item.smsId));
      row.append(makeText('p','excerpt',item.excerpt || '[No preview]'));
      row.append(makeText('p','guidance',item.reviewAction));
      if (item.amounts.length) row.append(makeText('p','amounts','Mentioned amounts (unverified): ' + item.amounts.join(', ')));
      const controls = makeText('div','review-controls','');
      const select = document.createElement('select');
      select.setAttribute('aria-label','Review status for SMS ' + item.smsId);
      STATUS.forEach(s => select.add(new Option(s,s)));
      select.value = decision.status;
      select.addEventListener('change',() => setDecision(item,select.value));
      const note = document.createElement('input');
      note.type = 'text';
      note.maxLength = 500;
      note.className = 'note';
      note.placeholder = 'Optional reviewer note (avoid sensitive details)';
      note.setAttribute('aria-label','Note for SMS ' + item.smsId);
      note.value = decision.note || '';
      note.addEventListener('input',() => {
        const prev = decisions[item.id] || {status:'Unreviewed',note:''};
        decisions[item.id] = {...prev,note:note.value};
      });
      controls.append(select,note);
      row.append(controls);
      list.append(row);
    });
    $('more').hidden = items.length <= visibleLimit;
  }
  async function getProtected(path, opts={}) {
    const headers=opts.body ? {'content-type':'application/json'} : {};
    const response=await fetch(path,{
      method:opts.body?'POST':'GET',
      headers,
      ...(opts.body?{body:JSON.stringify(opts.body)}:{}),
      cache:'no-store',
      credentials:'same-origin'
    });
    const payload=await response.json().catch(()=>({ok:false}));
    if(!response.ok || !payload.ok) {
      const reason=payload.reason || 'request_failed';
      if(response.status===401) showSession(false);
      throw new Error(reason+' (HTTP '+response.status+')');
    }
    return payload;
  }

  async function loadReferenceData() {
    if (!sessionToken) return;
    $('reconciliationStatus').textContent='Checking current Command Center event and payment records (read-only)…';
    try {
      const data=await getProtected('/api/sms/staging/reconcile');
      if (!Array.isArray(data.events)) throw new Error('Invalid reconciliation response');
      connectedRecords=data.events;
      recordsAvailable=true;
      payoutLedgerConnected=data.payoutSourceStatus==='command_center_ledger';
      payoutRecords=payoutLedgerConnected && Array.isArray(data.payouts)?data.payouts:[];
      $('reconciliationStatus').textContent=
        'Read-only Command Center comparison connected: '+data.recordCount+
        ' event records. '+(payoutLedgerConnected ? 'Event Payouts ledger connected ('+payoutRecords.length+' entries).' : 'Payout ledger comparison pending Apps Script deployment.')+' Gmail Activity is incomplete; this is not a full inbox search. No records changed.';
    }catch(error) {
      connectedRecords=[];
      recordsAvailable=false;
      payoutLedgerConnected=false;
      payoutRecords=[];
      const reason=error instanceof Error ? error.message : 'unknown error';
      $('reconciliationStatus').textContent=
        reason.includes('command_center_source_unconfigured') ?
          'Command Center read-only sync is not configured for this preview. SMS grouping still works, but payment and task cross-checks are unavailable.' :
          'Command Center comparison unavailable ('+reason+'). No financial conclusions will be inferred.';
    }
    renderCaseBundles();
    renderPayoutAudit();
  }
  async function loadSavedDecisions() {
    if (!sessionToken) return;
    try {
      const data=await getProtected('/api/sms/staging/decisions');
      caseDecisions=Object.create(null);
      savedSourceCounts=Object.create(null);
      for (const d of data.decisions || []) {
        if (!d || typeof d.key!=='string') continue;
        caseDecisions[d.key]={status:d.status,note:d.note};
        savedSourceCounts[d.key]=d.sourceCount;
      }
      renderCaseBundles();
      return (data.decisions || []).length;
    }catch {
      setStatus('SMS loaded; saved case decisions could not be retrieved. Do not re-review previously completed cases until this is resolved.',true);
      return null;
    }
  }
  async function saveDecisions() {
    if(!report || report.source!=='staging' || !sessionToken) {
      setStatus('Load the authenticated staging inbox before saving decisions.',true);
      return;
    }
    const toSave=caseBundles.filter(b=>caseDecisions[b.key]?.status &&
      caseDecisions[b.key].status!=='Unreviewed').map(b=>({
        key:b.key,status:caseDecisions[b.key].status,
        note:String(caseDecisions[b.key].note || '').slice(0,500),
        sourceCount:b.count
      }));
    if(!toSave.length) {
      setStatus('Mark at least one review bundle as Needs verification, Investigating, Reviewed — no action or Candidate for reconciliation.',true);
      return;
    }
    const btn=$('saveCaseDecisions');
    btn.disabled=true;
    try {
      let saved=0;
      for(let i=0;i<toSave.length;i+=40) {
        const data=await getProtected('/api/sms/staging/decisions',{
          body:{decisions:toSave.slice(i,i+40)}
        });
        if(data.audited!==true || !Number.isInteger(data.saved)) throw new Error('Review was not acknowledged by the append-only audit service.');
        saved+=data.saved;
      }
      for(const item of toSave) savedSourceCounts[item.key]=item.sourceCount;
      renderCaseBundles();
      setStatus('Saved '+saved+' encrypted review decisions with append-only audit history. Nothing in live Google Sheets, Gmail or accounting was changed.');
    }catch(error){
      setStatus('Unable to save review decisions: '+(error instanceof Error?error.message:'unknown error'),true);
    }finally{btn.disabled=false;}
  }

  function showSession(active) {
    sessionToken=active ? 'review-cookie-active' : '';
    $('sessionLogin').hidden=Boolean(active);
    $('sessionReady').hidden=!active;
    $('sessionStatus').textContent=active
      ? 'Signed in securely. This browser can reload the staging inbox for up to seven days.'
      : 'Sign in once with your Device Token. It is not saved in browser storage.';
    if(report) summary();
  }
  async function checkSession() {
    try {
      const response=await fetch('/api/sms/staging/session',{
        credentials:'same-origin',cache:'no-store'
      });
      if(!response.ok) throw new Error('Review session check failed (HTTP '+response.status+').');
      const data=await response.json();
      showSession(Boolean(data.authenticated));
      if(data.authenticated) await loadStaging();
    }catch(e){
      showSession(false);
      $('sessionStatus').textContent=e instanceof Error ? e.message : 'Unable to verify browser session.';
    }
  }
  async function unlockSession() {
    const token=$('stagingToken').value.trim();
    if(token.length<32 || token.length>256) {
      $('sessionStatus').textContent='Enter your Device Token, not its SHA256 hash.';
      return;
    }
    const btn=$('connectStaging');
    btn.disabled=true;
    try {
      const response=await fetch('/api/sms/staging/session',{
        method:'POST',credentials:'same-origin',cache:'no-store',
        headers:{'Content-Type':'application/json'},body:JSON.stringify({token})
      });
      const data=await response.json().catch(()=>({ok:false}));
      if(!response.ok || !data.authenticated)
        throw new Error(response.status===401 ?
          'Device Token was rejected. Check your password manager.' :
          'Could not create review session (HTTP '+response.status+').');
      showSession(true);
      await loadStaging();
    }catch(e){
      showSession(false);
      $('sessionStatus').textContent=e instanceof Error?e.message:'Unable to unlock review.';
    }finally{$('stagingToken').value='';btn.disabled=false;}
  }
  async function signOut() {
    try {
      const response=await fetch('/api/sms/staging/session',{
        method:'DELETE',credentials:'same-origin',cache:'no-store'
      });
      if(!response.ok) throw new Error('Could not clear saved browser login.');
      showSession(false);
      clear();
      $('sessionStatus').textContent='Signed out. Android SMS synchronization was not affected.';
    }catch(e){
      $('sessionStatus').textContent=e instanceof Error?e.message:'Sign-out failed.';
    }
  }

  async function loadStaging() {
    if (!sessionToken) { showSession(false); return; }
    const btn = $('refreshStaging');
    btn.disabled = true;
    const after = $('afterDate').value || '2026-01-01';
    try {
      let offset = 0;
      let scanned = 0;
      let findings = [];
      for (let i = 0; i < 50; i++) {
        setStatus('Loading protected staging results: ' + scanned + ' SMS screened…');
        const url = '/api/sms/staging/review?after=' +
          encodeURIComponent(after) + '&offset=' + offset;
        const payload = await getProtected(url);
        if (!payload.ok || !payload.staging || !Array.isArray(payload.findings))
          throw new Error('Staging response was not valid.');
        scanned += payload.scanned;
        findings.push(...payload.findings);
        if (payload.nextOffset === null) break;
        offset = payload.nextOffset;
      }
      raw = null;
      recordsAvailable=false;
      connectedRecords=[];
      payoutLedgerConnected=false;
      payoutRecords=[];
      savedSourceCounts=Object.create(null);
      decisions = Object.create(null);
      caseDecisions = Object.create(null);
      activeCaseKey = '';
      bundleLimit = 12;
      visibleLimit = 25;
      report = {
        source:'staging',
        contact:'LVPT Staging',
        count:scanned,
        afterDateCount:scanned,
        excludedCount:Math.max(0,scanned-findings.length),
        duplicateCount:0,
        findings:findings.sort((a,b)=>b.date.localeCompare(a.date)),
        after
      };
      summary(); render();
      setStatus('Staging inbox loaded: '+scanned+' SMS screened; '+
        findings.length+' findings available for review. Checking saved decisions and current Command Center…');
      const [decisionResult] = await Promise.all([loadSavedDecisions(), loadReferenceData()]);
      if (decisionResult !== null)
        setStatus('Staging ready: '+findings.length+' SMS findings, '+caseBundles.length+
          ' event/issue bundles; '+decisionResult+' saved reviews restored. No live records changed.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Staging fetch failed.', true);
    } finally {
      // Credentials are not retained in JavaScript; review access uses a secure cookie.
      btn.disabled = false;
    }
  }

  async function loadFile(file) {
    if (!file) return;
    if (file.size > 25*1024*1024) {setStatus('File exceeds the 25 MB safety limit.',true);return;}
    try {
      setStatus('Reading SMS history locally. Nothing is sent to a server.');
      const content = await file.text();
      raw = engine.asRecord(content);
      recordsAvailable=false; connectedRecords=[];
      savedSourceCounts=Object.create(null);
      $('reconciliationStatus').textContent='Local file review: live Command Center comparison not connected.';
      decisions = Object.create(null);
      caseDecisions = Object.create(null);
      activeCaseKey = '';
      bundleLimit = 12;
      visibleLimit = 25;
      scan();
      setStatus('Loaded ' + report.count.toLocaleString() + ' SMS records. This session stays in memory; nothing was uploaded.');
    } catch (error) {
      connectedRecords=[]; recordsAvailable=false;
    savedSourceCounts=Object.create(null);
    $('reconciliationStatus').textContent='Command Center comparison not loaded.';
    raw = null; report = null; decisions = Object.create(null);
      summary(); render();
      setStatus(error instanceof Error ? error.message : 'Could not open this export.',true);
    } finally { $('smsFile').value = ''; }
  }
  function scan() {
    if (!raw) return;
    try {
      report = engine.analyze(raw,{after:$('afterDate').value || '2026-01-01'});
      visibleLimit = 25;
      summary(); render();
    } catch (error) {setStatus(error.message || 'Analysis failed.',true);}
  }
  function download(data,name) {
    const blob = new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url),3000);
  }
  function clear() {
    $('stagingToken').value = '';
    payoutRecords=[]; payoutLedgerConnected=false;
    raw = null; report = null; decisions = Object.create(null);
    caseDecisions = Object.create(null); activeCaseKey = ''; bundleLimit = 12;
    visibleLimit = 25;
    $('findQuery').value = '';
    $('caseSearch').value = '';
    $('caseEventFilter').value = 'all';
    $('caseAttentionFilter').value = 'all';
    $('caseStatusFilter').value = 'all';
    $('afterDate').value = '2026-01-01';
    summary(); render();
    setStatus('Results cleared; secure review login remains active until you sign out.');
  }
  $('saveCaseDecisions').addEventListener('click',saveDecisions);
  $('caseSearch').addEventListener('input',()=>{bundleLimit=12;renderCaseBundles();});
  $('caseEventFilter').addEventListener('change',()=>{bundleLimit=12;renderCaseBundles();});
  $('caseAttentionFilter').addEventListener('change',()=>{bundleLimit=12;renderCaseBundles();});
  $('caseStatusFilter').addEventListener('change',()=>{bundleLimit=12;renderCaseBundles();});
  $('showMoreCases').addEventListener('click',()=>{bundleLimit+=12;renderCaseBundles();});
  $('clearCaseFilter').addEventListener('click',()=>{
    activeCaseKey='';
    $('clearCaseFilter').hidden=true;
    render();
  });
  $('exportCaseDecisions').addEventListener('click',()=>{
    if (!report) return;
    const reviewed = caseEngine.exportBundleDecisions(caseBundles,caseDecisions,report);
    if (!reviewed.decisions.length) {
      setStatus('Select a review status for at least one case before exporting.',true);
      return;
    }
    download(reviewed,'lvpt-sms-case-decisions.json');
    setStatus('Exported '+reviewed.decisions.length+' review bundle decisions. No live event or accounting records changed.');
  });
  $('connectStaging').addEventListener('click',unlockSession);
  $('refreshStaging').addEventListener('click',loadStaging);
  $('signOutReview').addEventListener('click',signOut);
  $('smsFile').addEventListener('change',event => loadFile(event.target.files?.[0]));
  $('afterDate').addEventListener('change',() => {
    if (report) {
      decisions = Object.create(null);
      caseDecisions = Object.create(null);
      activeCaseKey = '';
      if (raw) {
        scan();
      } else {
        report = null;
        summary(); render();
      }
      setStatus('Date changed. Reload the inbox or file to review the new range.');
    }
  });
  $('findQuery').addEventListener('input',() => {visibleLimit = 25;render();});
  $('findCategory').addEventListener('change',() => {visibleLimit = 25;render();});
  $('findStatus').addEventListener('change',() => {visibleLimit = 25;render();});
  $('more').addEventListener('click',() => {visibleLimit += 25;render();});
  $('clearSession').addEventListener('click',clear);
  $('exportDecisions').addEventListener('click',() => {
    if (!report) return;
    const result = engine.exportDecisions(report,decisions);
    if (!result.decisions.length) {setStatus('Mark at least one finding as reviewed before exporting.',true);return;}
    download(result,'lvpt-sms-reviewed-decisions.json');
    setStatus('Downloaded ' + result.decisions.length + ' review decisions. Live records were not changed.');
  });
  CATEGORY.forEach(v => $('findCategory').add(new Option(v,v)));
  ['All statuses',...STATUS].forEach(v => $('findStatus').add(new Option(v,v)));
  summary();render();
  checkSession();
})();
