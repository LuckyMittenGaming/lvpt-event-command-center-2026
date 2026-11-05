(function () {
  'use strict';
  const engine = window.LVPTSMSReview;
  const caseEngine = window.LVPTSMSCases;
  const reconciliation = window.LVPTSMSReconciliation;
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
  let sessionToken = '';
  let sessionBypass = '';
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
  function summary() {
    $('results').hidden = !report;
    $('exportDecisions').disabled = !report;
    $('exportCaseDecisions').disabled = !report;
    $('saveCaseDecisions').disabled = !report || report.source !== 'staging' || !sessionToken;
    if (!report) { caseBundles = []; $('caseList').replaceChildren(); $('caseExplain').textContent = 'Load staging findings to see consolidated cases.'; return; }
    caseBundles = caseEngine.createBundles(report.findings);
    if (!report) return;
    const reviewed = Object.values(decisions).filter(x => x.status !== 'Unreviewed').length;
    $('summary').replaceChildren();
    [
      ['SMS records scanned', report.count.toLocaleString()],
      ['SMS since ' + report.after, report.afterDateCount.toLocaleString()],
      ['Business candidates', report.findings.length.toLocaleString()],
      ['Reviewed', reviewed.toLocaleString()],
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
  function renderCaseBundles() {
    const all = caseBundles;
    const search = $('caseSearch').value.trim().toLowerCase();
    const eventFilter = $('caseEventFilter').value;
    const statusFilter = $('caseStatusFilter').value;
    const reviewed = caseBundles.filter(b=>caseDecisions[b.key]?.status && caseDecisions[b.key].status !== 'Unreviewed').length;
    $('caseExplain').textContent = all.length + ' event/issue review bundles from ' +
      (report?.findings.length || 0) + ' business SMS candidates. ' +
      reviewed + ' bundles reviewed. Grouping is heuristic; no payments or event records have been verified.';
    const shown = all.filter(bundle => {
      const decision = caseDecisions[bundle.key] || {status:'Unreviewed'};
      if (eventFilter === 'matched' && !bundle.explicitReference) return false;
      if (eventFilter === 'unmatched' && bundle.explicitReference) return false;
      if (statusFilter !== 'all' && decision.status !== statusFilter) return false;
      if (search && ![bundle.eventLabel,bundle.topic,...bundle.categories].join(' ').toLowerCase().includes(search))
        return false;
      return true;
    });
    const parent = $('caseList');
    parent.replaceChildren();
    if (!shown.length) parent.append(makeText('p','empty','No review bundles match this filter.'));
    shown.slice(0,bundleLimit).forEach(bundle => {
      const review = caseDecisions[bundle.key] || {status:'Unreviewed',note:''};
      const box = makeText('article','case-card','');
      const heading = makeText('div','finding-top','');
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
      if (recordsAvailable) {
        const result = reconciliation.checkCase(bundle, connectedRecords);
        const reconciliationLine = makeText('div','reconciliation-detail','');
        reconciliationLine.append(
          makeText('strong','',result.label),
          makeText('p','',result.detail)
        );
        box.append(reconciliationLine);
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
  async function getProtected(path, token, bypass, opts={}) {
    const headers={'x-lvpt-sms-sync-token':token, ...(opts.body ? {'content-type':'application/json'} : {})};
    if (bypass) headers['x-vercel-protection-bypass']=bypass;
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
      throw new Error(reason+' (HTTP '+response.status+')');
    }
    return payload;
  }

  async function loadReferenceData() {
    if (!sessionToken) return;
    $('reconciliationStatus').textContent='Checking current Command Center event and payment records (read-only)…';
    try {
      const data=await getProtected('/api/sms/staging/reconcile',sessionToken,sessionBypass);
      if (!Array.isArray(data.events)) throw new Error('Invalid reconciliation response');
      connectedRecords=data.events;
      recordsAvailable=true;
      $('reconciliationStatus').textContent=
        'Read-only Command Center comparison connected: '+data.recordCount+
        ' event records. Financial and task data remain unchanged.';
    }catch(error) {
      connectedRecords=[];
      recordsAvailable=false;
      const reason=error instanceof Error ? error.message : 'unknown error';
      $('reconciliationStatus').textContent=
        reason.includes('command_center_source_unconfigured') ?
          'Command Center read-only sync is not configured for this preview. SMS grouping still works, but payment and task cross-checks are unavailable.' :
          'Command Center comparison unavailable ('+reason+'). No financial conclusions will be inferred.';
    }
    renderCaseBundles();
  }
  async function loadSavedDecisions() {
    if (!sessionToken) return;
    try {
      const data=await getProtected('/api/sms/staging/decisions',sessionToken,sessionBypass);
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
        const data=await getProtected('/api/sms/staging/decisions',sessionToken,sessionBypass,{
          body:{decisions:toSave.slice(i,i+40)}
        });
        saved+=data.saved;
      }
      for(const item of toSave) savedSourceCounts[item.key]=item.sourceCount;
      renderCaseBundles();
      setStatus('Saved '+saved+' encrypted case review decisions to staging. Nothing in live Google Sheets, Gmail or accounting was changed.');
    }catch(error){
      setStatus('Unable to save review decisions: '+(error instanceof Error?error.message:'unknown error'),true);
    }finally{btn.disabled=false;}
  }

  async function loadStaging() {
    const token = $('stagingToken').value.trim();
    const bypass = $('stagingBypass').value.trim();
    if (token.length < 32) {
      setStatus('Enter the 32+ character staging token configured on the server.', true);
      return;
    }
    const btn = $('connectStaging');
    btn.disabled = true;
    const after = $('afterDate').value || '2026-01-01';
    try {
      let offset = 0;
      let scanned = 0;
      let findings = [];
      const headers = { 'x-lvpt-sms-sync-token': token };
      if (bypass) headers['x-vercel-protection-bypass'] = bypass;
      for (let i = 0; i < 50; i++) {
        setStatus('Loading protected staging results: ' + scanned + ' SMS screened…');
        const url = '/api/sms/staging/review?after=' +
          encodeURIComponent(after) + '&offset=' + offset;
        const response = await fetch(url, { headers, cache:'no-store', credentials:'same-origin' });
        if (!response.ok) {
          const status = response.status === 503 ? 'Storage is not configured yet (503).'
            : response.status === 401 ? 'Staging token or deployment access was rejected (401).'
            : 'Staging request failed (HTTP ' + response.status + ').';
          throw new Error(status);
        }
        const payload = await response.json();
        if (!payload.ok || !payload.staging || !Array.isArray(payload.findings))
          throw new Error('Staging response was not valid.');
        scanned += payload.scanned;
        findings.push(...payload.findings);
        if (payload.nextOffset === null) break;
        offset = payload.nextOffset;
      }
      raw = null;
      sessionToken=token;
      sessionBypass=bypass;
      recordsAvailable=false;
      connectedRecords=[];
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
      // Input fields cleared; the protected token remains only in this tab's memory for saving decisions.
      $('stagingToken').value = '';
      $('stagingBypass').value = '';
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
      sessionToken=''; sessionBypass='';
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
      sessionToken=''; sessionBypass=''; connectedRecords=[]; recordsAvailable=false;
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
    $('stagingBypass').value = '';
    raw = null; report = null; decisions = Object.create(null);
    caseDecisions = Object.create(null); activeCaseKey = ''; bundleLimit = 12;
    visibleLimit = 25;
    $('findQuery').value = '';
    $('caseSearch').value = '';
    $('caseEventFilter').value = 'all';
    $('caseStatusFilter').value = 'all';
    $('afterDate').value = '2026-01-01';
    summary(); render();
    setStatus('Session cleared. The raw SMS archive was not saved in the browser or sent to a server.');
  }
  $('saveCaseDecisions').addEventListener('click',saveDecisions);
  $('caseSearch').addEventListener('input',()=>{bundleLimit=12;renderCaseBundles();});
  $('caseEventFilter').addEventListener('change',()=>{bundleLimit=12;renderCaseBundles();});
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
  $('connectStaging').addEventListener('click',loadStaging);
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
})();
