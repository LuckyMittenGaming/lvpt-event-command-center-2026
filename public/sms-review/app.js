(function () {
  'use strict';
  const engine = window.LVPTSMSReview;
  const $ = id => document.getElementById(id);
  let raw = null;
  let report = null;
  let decisions = Object.create(null);
  let visibleLimit = 25;
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
      if (q && ![item.category, item.eventHint, item.excerpt, String(item.smsId)].join(' ').toLowerCase().includes(q)) return false;
      return true;
    });
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
    $('shownCount').textContent = items.length.toLocaleString() + ' matching findings';
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
        const response = await fetch(url, { headers, cache:'no-store', credentials:'omit' });
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
      decisions = Object.create(null);
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
        findings.length+' findings available for review. No accounting records changed.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Staging fetch failed.', true);
    } finally {
      // The browser never retains or persists the staging token.
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
      decisions = Object.create(null);
      visibleLimit = 25;
      scan();
      setStatus('Loaded ' + report.count.toLocaleString() + ' SMS records. This session stays in memory; nothing was uploaded.');
    } catch (error) {
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
    raw = null; report = null; decisions = Object.create(null);visibleLimit = 25;
    $('findQuery').value = '';
    $('afterDate').value = '2026-01-01';
    summary(); render();
    setStatus('Session cleared. The raw SMS archive was not saved in the browser or sent to a server.');
  }
  $('connectStaging').addEventListener('click',loadStaging);
  $('smsFile').addEventListener('change',event => loadFile(event.target.files?.[0]));
  $('afterDate').addEventListener('change',() => {
    if (report) {
      decisions = Object.create(null);
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
