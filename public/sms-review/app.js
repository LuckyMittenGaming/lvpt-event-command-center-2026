(function () {
  'use strict';
  const engine = window.LVPTSMSReview;
  const caseEngine = window.LVPTSMSCases;
  const reconciliation = window.LVPTSMSReconciliation;
  const evidence = window.LVPTSMSEvidence;
  const gmailEngine = window.LVPTGmailIntelligence;
  const actionQueueEngine = window.LVPTActionQueue;
  const replyQualifier = window.LVPTReplyQualification;
  const draftHelper = window.LVPTDraftHelper;
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
  let paymentLedgerConnected = false;
  let paymentRecords = [];
  let gmailEvidenceRecords = [];
  let gmailEvidenceLoading = false;
  let businessInboxReview = null;
  let businessInboxLoading = false;
  let businessInboxError = '';
  let businessInboxThreadContext = new Map();
  let businessInboxThreadLoading = '';
  let businessInboxThreadError = new Map();
  let inboxQueueBusy = false;
  function showInboxQueueStatus(message) {
    const element=$('businessInboxQueueStatus');
    if(!element)return;
    element.textContent=String(message||'');
    element.hidden=!message;
  }
  let showActionMonitoring = false;
  let actionDecisions = new Map();
  let actionAuditReady = false;
  let savingActionId = '';
  let draftState = null;
  let draftLoadingId = '';
  let personalizedLoadingId = '';
  let draftFeedback = '';
  let auditServiceReady = false;
  let sessionToken = ''; // Non-secret session flag; credentials are HttpOnly and server-side.

  let savedSourceCounts = Object.create(null);
  let savedDecisionSignatures = Object.create(null);
  let savingInProgress = false;
  function decisionSignature(status,note,sourceCount) {
    return JSON.stringify([String(status||'Unreviewed'),String(note||''),sourceCount]);
  }
  function unsavedCaseBundles() {
    return caseBundles.filter(bundle=>{
      const item=caseDecisions[bundle.key];
      return item && item.status && item.status!=='Unreviewed' &&
        savedDecisionSignatures[bundle.key] !==
          decisionSignature(item.status,item.note,bundle.count);
    });
  }
  function showSaveFeedback(message,type='neutral') {
    const el=$('caseSaveFeedback');
    el.textContent=message;
    el.dataset.state=type;
  }
  function updateSaveControls() {
    const btn=$('saveCaseDecisions');
    const pending=unsavedCaseBundles().length;
    const ready=Boolean(report && report.source==='staging' &&
      sessionToken && auditServiceReady);
    btn.disabled=!ready || savingInProgress || pending===0;
    btn.textContent=savingInProgress ? 'Saving reviewed cases…' :
      pending ? 'Save '+pending+' changed review'+(pending===1?'':'s') :
      'All reviews saved';
    if(ready && pending===0 &&
       $('caseSaveFeedback').dataset.state==='neutral') {
      showSaveFeedback('All saved reviews are up to date. No new changes to write.');
    }
  }
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
  const replyWorkflow=window.LVPTReplyWorkflow;
  const replyController=window.LVPTReplyReviewControls.createController({
    getProtected,makeText,qualification:replyQualifier,workflow:replyWorkflow,
    onUpdate:()=>renderBusinessInboxReview(),
    onNext:threadId=>advanceToNextInboxThread(threadId)
  });

  async function runSyntheticAiTest() {
    const button=$('runSyntheticAiTest');
    const status=$('syntheticAiStatus');
    const result=$('syntheticAiResult');
    if(!sessionToken)return;
    button.disabled=true;
    button.textContent='Testing AI model connection…';
    result.hidden=true;result.replaceChildren();
    status.textContent='Sending fictional test details to Vercel AI Gateway. No live client messages are accessed.';
    try {
      // Preserve the diagnostic details intentionally whitelisted by the
      // synthetic test endpoint. Other protected endpoints remain unchanged.
      const response=await fetch('/api/sms/staging/ai-smoke-test',{
        method:'POST',cache:'no-store',credentials:'same-origin',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({mode:'synthetic_only'})
      });
      const data=await response.json().catch(()=>({ok:false,reason:'invalid_response'}));
      if(!response.ok||data.ok!==true) {
        if(response.status===401)showSession(false);
        const method=data.authentication==='vercel_oidc'?'Vercel OIDC':
          data.authentication==='api_key'?'AI Gateway API key':'unknown';
        const code=String(data.gatewayCode||'unknown').slice(0,75);
        const codeInfo=data.gatewayStatus?
          ' · upstream HTTP '+data.gatewayStatus+' · code '+code+
          ' · authentication '+method:'';
        const guidance=data.reason==='ai_gateway_account_verification_required'?
          ' Check Vercel team account/payment-method verification.':
          data.gatewayCode==='access_denied'?
          ' The gateway refused team access. Check AI Gateway billing/verification or contact Vercel Support.':
          data.gatewayStatus===401?
          ' The gateway rejected the credential.':
          data.gatewayStatus===403?
          ' The gateway denied access. Check team-level eligibility and billing verification.':'';
        const supportRef=typeof data.supportRequestId==='string'?
          ' · Vercel request ID '+data.supportRequestId:'';
        throw new Error((data.reason||'request_failed')+
          ' (HTTP '+response.status+')'+codeInfo+supportRef+'.'+guidance);
      }
      if(data.source!=='fictional_ai_gateway_smoke_test' ||
         data.noEmailSent!==true || data.noGmailRead!==true ||
         typeof data.body!=='string'||typeof data.subject!=='string')
        throw new Error('The test response did not satisfy the synthetic-only checks.');
      status.textContent='AI Gateway responded successfully using fictional data · '+
        data.model+' · Authentication: '+data.authentication+
        '. No emails sent and no records changed.';
      result.append(makeText('strong','',data.subject));
      result.append(makeText('p','action-draft-status',
        'Fictional client demo only — not addressed to anyone.'));
      const body=makeText('p','',data.body);
      body.style.whiteSpace='pre-wrap';
      result.append(body);
      result.hidden=false;
    }catch(error) {
      status.textContent='AI connection test not verified: '+
        (error instanceof Error?error.message:'Unknown diagnostic error')+
        '. No client action was attempted.';
    }finally {
      button.disabled=!sessionToken;
      button.textContent='Run AI connection test (fictional client)';
    }
  }

  async function loadActionDecisions() {
    actionAuditReady=false;
    actionDecisions=new Map();
    $('actionDecisionStatus').textContent='Checking the separate owner approval audit…';
    try {
      const data=await getProtected('/api/sms/staging/action-decisions');
      if(!Array.isArray(data.decisions)||data.source!=='separate_staging_action_audit')
        throw new Error('Invalid action audit response');
      for(const d of data.decisions){
        if(!d || typeof d.actionKey!=='string' || typeof d.sourceFingerprint!=='string')continue;
        actionDecisions.set(d.actionKey,d);
      }
      actionAuditReady=true;
      $('actionDecisionStatus').textContent='Separate approval audit connected. '+
        data.decisions.length+' latest decision(s) restored. No external actions triggered.';
    }catch {
      actionAuditReady=false;
      $('actionDecisionStatus').textContent='Separate owner audit unavailable. Approval controls are disabled.';
    }
    renderActionQueue();
    return actionAuditReady;
  }

  async function saveOwnerActionDecision(item,decision) {
    if(!actionAuditReady || !sessionToken || savingActionId || !report ||
       report.source!=='staging' || !recordsAvailable ||
       (decision==='draft_requested' && !item.draftCandidate))return;
    savingActionId=item.id;
    renderActionQueue();
    const sourceFingerprint=actionQueueEngine.sourceFingerprint(item);
    $('actionDecisionStatus').textContent='Recording '+item.eventName+
      ' decision in protected staging audit…';
    try {
      const data=await getProtected('/api/sms/staging/action-decisions',{
        body:{actionKey:item.id,decision,sourceFingerprint,requestId:crypto.randomUUID()}
      });
      if(data.audited!==true || data.saved!==1)
        throw new Error('Approval change was not confirmed by the audit service.');
      if(item.id===draftState?.itemId && decision!=='draft_requested')draftState=null;
      actionDecisions.set(item.id,{
        actionKey:item.id,decision,sourceFingerprint,
        recordedAt:data.recordedAt||new Date().toISOString()
      });
      $('actionDecisionStatus').textContent='Decision recorded with separate audit history. '+
        'No email, accounting, CRM or task records changed.';
    }catch(error) {
      $('actionDecisionStatus').textContent='Decision not confirmed. Existing approvals remain unchanged. '+
        (error instanceof Error?error.message:'Audit service error.');
    }finally {
      savingActionId='';
      renderActionQueue();
    }
  }


  function verifiedLatestThread(item) {
    if(!item||item.type!=='gmail'||!item.id.startsWith('gmail:'))return null;
    const key=item.id.slice(6);
    const record=gmailEvidenceRecords.find(r=>r.eventKey===key&&r.connected===true);
    const threads=record&&Array.isArray(record.threads)?record.threads:[];
    const latest=threads.slice().filter(t=>t&&t.lastMessageAt)
      .sort((a,b)=>String(b.lastMessageAt).localeCompare(String(a.lastMessageAt)))[0];
    return latest&&latest.threadId?{key,latest}:null;
  }

  async function openApprovedDraftPreview(item) {
    const approval=actionDecisions.get(item.id);
    const live=verifiedLatestThread(item);
    if(!sessionToken||!actionAuditReady||!live||item.type!=='gmail'||
       !item.draftCandidate||
       !actionQueueEngine.decisionApplies(item,approval)||
       approval.decision!=='draft_requested'||draftLoadingId)return;
    draftLoadingId=item.id;
    draftState=null;draftFeedback='';
    renderActionQueue();
    try {
      const params=new URLSearchParams({
        eventKey:live.key,
        sourceFingerprint:actionQueueEngine.sourceFingerprint(item),
        lastMessageAt:live.latest.lastMessageAt
      });
      const context=await getProtected('/api/sms/staging/draft-context?'+params.toString());
      if(context.source!=='approved_read_only_gmail_draft_context'||
         context.eventKey!==live.key||context.lastMessageAt!==live.latest.lastMessageAt)
        throw new Error('Gmail draft preview could not verify the reviewed thread.');
      const event=connectedRecords.find(e=>e.id===item.eventId);
      const starter=draftHelper.buildStarter(context,event,Date.now());
      if(!starter.ready)throw new Error(starter.warning||'Draft source is incomplete.');
      draftState={
        itemId:item.id,fingerprint:actionQueueEngine.sourceFingerprint(item),
        to:starter.to,subject:starter.subject,body:starter.body,
        context,warning:starter.warning,generatedBy:'starter',needsReview:[],rationale:''
      };
      draftFeedback='Read-only conversation loaded. Review the client message, timing, and any attachments before copying.';
    }catch(error) {
      draftFeedback=error instanceof Error?error.message:'Draft preview unavailable.';
    }finally {
      draftLoadingId='';
      renderActionQueue();
    }
  }


  async function generatePersonalizedDraft(item) {
    const live=verifiedLatestThread(item);
    const approval=actionDecisions.get(item.id);
    const state=draftState;
    if(!live||!sessionToken||!actionAuditReady||!state||
       !item.draftCandidate||
       state.itemId!==item.id||personalizedLoadingId||
       state.fingerprint!==actionQueueEngine.sourceFingerprint(item)||
       !actionQueueEngine.decisionApplies(item,approval)||
       approval.decision!=='draft_requested')return;
    const permitted=state.context.lastDirection==='inbound' ||
      (state.context.lastDirection==='outbound' && Boolean(state.body.trim()));
    if(!permitted || live.key==='ows-aws')return;
    personalizedLoadingId=item.id;draftFeedback='';
    renderActionQueue();
    try {
      const response=await getProtected('/api/sms/staging/personalized-draft',{
        body:{
          eventKey:live.key,
          sourceFingerprint:state.fingerprint,
          lastMessageAt:live.latest.lastMessageAt
        }
      });
      if(response.source!=='ai_gateway_personalized_preview'||
         response.eventKey!==live.key||response.lastMessageAt!==live.latest.lastMessageAt||
         typeof response.body!=='string'||response.body.length<35||
         typeof response.subject!=='string')
        throw new Error('The personalized draft response was not verified.');
      if(draftState!==state)throw new Error('The preview was refreshed before the draft finished.');
      draftState={
        ...state,
        subject:response.subject.slice(0,180),
        body:response.body.slice(0,5000),
        rationale:String(response.rationale||'').slice(0,700),
        needsReview:Array.isArray(response.needsReview)?
          response.needsReview.filter(x=>typeof x==='string').slice(0,5):[],
        generatedBy:'ai'
      };
      draftFeedback='Personalized draft prepared for review. Nothing was sent or saved to Gmail.';
    }catch(error) {
      const reason=error instanceof Error?error.message:'AI generation unavailable';
      draftFeedback='Personalized drafting did not complete: '+reason+
        '. The original editable starter remains available.';
    }finally {
      personalizedLoadingId='';
      renderActionQueue();
    }
  }

  function renderApprovedDraftPreview(card,item) {
    const stored=actionDecisions.get(item.id);
    const valid=actionQueueEngine.decisionApplies(item,stored);
    const canPreview=item.type==='gmail' && item.draftCandidate===true &&
      valid && stored.decision==='draft_requested';
    if(!canPreview)return;
    const btn=document.createElement('button');
    btn.type='button';btn.className='neutral';
    btn.textContent=draftLoadingId===item.id?'Loading verified Gmail conversation…':
      'Preview conversation & starter draft';
    btn.disabled=Boolean(draftLoadingId)||!actionAuditReady;
    btn.addEventListener('click',()=>openApprovedDraftPreview(item));
    card.append(btn);
    if(draftLoadingId===item.id)
      card.append(makeText('p','action-draft-status','Loading read-only conversation; no emails are sent or stored.'));
    if((!draftState || draftState.itemId!==item.id) && draftFeedback)
      card.append(makeText('p','action-draft-status',draftFeedback));
    if(!draftState||draftState.itemId!==item.id ||
       draftState.fingerprint!==actionQueueEngine.sourceFingerprint(item))return;
    const panel=makeText('section','action-draft-panel','');
    panel.append(makeText('strong','',draftState.generatedBy==='ai'?
      'Personalized AI draft — editable, not sent':
      'Editable starter draft — not sent'));
    panel.append(makeText('p','action-draft-status',
      'Verified recipient: '+draftState.to+' · '+draftState.context.observedMessages+
      ' messages in Gmail thread'+(draftState.context.partial?' (limited/truncated)':'')));
    if(draftState.warning && draftState.generatedBy!=='ai')
      panel.append(makeText('p','case-alert',draftState.warning));
    if(draftState.generatedBy==='ai' && draftState.rationale)
      panel.append(makeText('p','action-draft-status','Draft rationale: '+draftState.rationale));
    if(draftState.generatedBy==='ai' && draftState.needsReview?.length)
      panel.append(makeText('p','case-alert',
        'Before sending, verify: '+draftState.needsReview.join(' · ')));
    const recent=makeText('details','action-draft-thread','');
    recent.append(makeText('summary','', 'Inspect the most recent verified messages'));
    draftState.context.messages.slice(-4).forEach(msg=>{
      const block=makeText('div','action-draft-message','');
      block.append(makeText('strong','',
        (msg.direction==='inbound'?'Client':'LVPT')+' · '+dateFmt(msg.at)));
      const excerpt=draftHelper.previewBody(msg.body,1250);
      block.append(makeText('p','',
        excerpt?excerpt+(msg.truncated?' [excerpt shortened]':''):
        '[Message body unavailable — inspect this conversation in Gmail before writing]'));
      recent.append(block);
    });
    panel.append(recent);
    const canPersonalize=draftState.context.lastDirection==='inbound'||
      (draftState.context.lastDirection==='outbound'&&Boolean(draftState.body.trim()));
    const aiButton=document.createElement('button');
    aiButton.type='button';
    aiButton.className='neutral';
    aiButton.textContent=personalizedLoadingId===item.id?
      'Generating personalized reply…':
      draftState.generatedBy==='ai'?'Regenerate personalized draft (AI)':
      'Generate personalized draft (AI)';
    aiButton.disabled=Boolean(personalizedLoadingId)||!canPersonalize||
      item.id==='gmail:ows-aws';
    aiButton.addEventListener('click',()=>generatePersonalizedDraft(item));
    panel.append(makeText('p','action-draft-status',
      'Optional AI drafting sends a limited, redacted conversation excerpt and event facts to Vercel AI Gateway and the selected model provider only when you click Generate. No email is sent.'));
    panel.append(aiButton);
    if(!canPersonalize)
      panel.append(makeText('p','case-alert',
        'AI generation is blocked by the current correspondence hold or missing source text.'));
    if(draftFeedback)
      panel.append(makeText('p','action-draft-status',draftFeedback));
    const to=makeText('p','action-draft-meta','To: '+draftState.to);
    panel.append(to);
    const subject=document.createElement('input');
    subject.type='text';subject.maxLength=180;
    subject.setAttribute('aria-label','Review email subject for '+item.eventName);
    subject.value=draftState.subject;
    subject.addEventListener('input',()=>{draftState.subject=subject.value;});
    panel.append(subject);
    const body=document.createElement('textarea');
    body.rows=8;body.maxLength=5000;
    body.setAttribute('aria-label','Editable email draft for '+item.eventName);
    body.placeholder='Review the latest client message and write a specific reply here. Nothing is sent.';
    body.value=draftState.body;
    body.addEventListener('input',()=>{draftState.body=body.value;});
    panel.append(body);
    const actions=makeText('div','action-queue-controls','');
    const copy=document.createElement('button');
    copy.type='button';copy.className='primary';
    copy.textContent='Copy reviewed draft';
    copy.disabled=!draftState.body.trim();
    body.addEventListener('input',()=>{copy.disabled=!draftState.body.trim();});
    copy.addEventListener('click',async()=>{
      const draft=draftState;
      if(!draft||!draft.body.trim())return;
      try {
        await navigator.clipboard.writeText('To: '+draft.to+'\nSubject: '+
          draft.subject+'\n\n'+draft.body);
        draftFeedback='Draft copied for manual review. No email has been sent or saved.';
        panel.append(makeText('p','action-draft-status',draftFeedback));
      }catch {
        panel.append(makeText('p','case-alert','Clipboard unavailable. Select and copy the draft manually.'));
      }
    });
    actions.append(copy);
    const close=document.createElement('button');
    close.type='button';close.className='neutral';close.textContent='Close and clear preview';
    close.addEventListener('click',()=>{
      draftState=null;draftFeedback='';renderActionQueue();
    });
    actions.append(close);panel.append(actions);
    card.append(panel);
  }

  function renderActionQueue() {
    const holder=$('actionQueueItems');
    const status=$('actionQueueStatus');
    const toggle=$('toggleActionMonitoring');
    holder.replaceChildren();
    toggle.hidden=true;
    if(!report || report.source!=='staging') {
      status.textContent='Load the authenticated staging inbox for cross-source recommendations.';
      return;
    }
    if(!recordsAvailable) {
      status.textContent='Command Center event records unavailable. No financial or outreach priorities inferred.';
      return;
    }
    const brief=actionQueueEngine.buildQueue({
      events:connectedRecords,
      payments:paymentRecords,paymentsConnected:paymentLedgerConnected,
      payouts:payoutRecords,payoutsConnected:payoutLedgerConnected,
      gmail:gmailEvidenceRecords,
      inbox:businessInboxReview
    },Date.now());
    if(draftState) {
      const active=brief.items.find(i=>i.id===draftState.itemId);
      if(!active||!active.draftCandidate||
         actionQueueEngine.sourceFingerprint(active)!==draftState.fingerprint ||
         !actionQueueEngine.decisionApplies(active,actionDecisions.get(active.id)) ||
         actionDecisions.get(active.id)?.decision!=='draft_requested') draftState=null;
    }
    const gaps=[];
    if(!brief.coverage.payments)gaps.push('Payments');
    if(!brief.coverage.payouts)gaps.push('Event Payouts');
    if(brief.coverage.gmailConnected<brief.coverage.gmailTotal)
      gaps.push('Gmail '+brief.coverage.gmailConnected+'/'+brief.coverage.gmailTotal);
    if(!brief.coverage.businessInboxConnected)gaps.push('business inbox scan');
    else if(brief.coverage.businessInboxPartial)gaps.push('business inbox scan is limited');
    const isPaused=item=>{
      const record=actionDecisions.get(item.id);
      return actionQueueEngine.decisionApplies(item,record) &&
        (record.decision==='hold'||record.decision==='dismissed');
    };
    const activeItems=brief.items.filter(item=>item.group==='review'&&!isPaused(item));
    const backgroundItems=brief.items.filter(item=>item.group!=='review'||isPaused(item));
    const pausedCount=brief.items.filter(isPaused).length;
    status.textContent=activeItems.length+' items for owner review · '+
      backgroundItems.length+' monitoring/held ('+pausedCount+' held or dismissed) · '+
      (gaps.length ?
        'Limited source coverage: '+gaps.join(', ')+'. No missing-source conclusions.' :
        'Sources connected (Gmail is bounded metadata only).')+
      ' No client emails sent and no financial records changed.';
    const activeCorrespondence=activeItems.filter(item=>item.type==='gmail'||
      (item.type==='inbox'&&item.category!=='vendor_ops'));
    const activeOperations=activeItems.filter(item=>item.type==='inbox'&&item.category==='vendor_ops');
    const activeFinancial=activeItems.filter(item=>item.type!=='gmail'&&item.type!=='inbox');
    const visible=activeCorrespondence.concat(activeOperations,activeFinancial,
      showActionMonitoring?backgroundItems:[]);
    let currentSection='';
    // Keep sales/correspondence up front even if there is no safe draft candidate.
    // These five domain searches are not a complete business inbox audit.
    if(!activeCorrespondence.some(item=>item.draftCandidate)) {
      currentSection='Client correspondence & sales opportunities';
      holder.append(makeText('h3','action-queue-section-title',currentSection));
      holder.append(makeText('p','hint',
        'No currently verified drafting candidate in the five allowlisted client searches. Incoming messages in the broader inbox still need a full thread and CRM review before drafting.'));
    }
    if(!visible.length)
      holder.append(makeText('p','hint',
        'No review candidates in the connected sources under these rules. Other email, bank and CRM work may still exist.'));
    visible.forEach(item=>{
      const section=(item.group!=='review'||isPaused(item))?
        'Monitoring / held':item.type==='inbox'&&item.category==='vendor_ops'?
          'Vendor & venue operations':(item.type==='gmail'||item.type==='inbox')?
          'Client correspondence & sales opportunities':'Financial verification & reconciliation';
      if(section!==currentSection){
        currentSection=section;
        holder.append(makeText('h3','action-queue-section-title',section));
      }
      const card=makeText('article','action-queue-card','');
      const head=makeText('div','action-queue-head','');
      head.append(makeText('span','action-queue-kind',
        isPaused(item)?'Held / dismissed':item.group==='monitor'?'Monitor':
          item.type==='gmail'?'Correspondence':
          item.type==='inbox'?(item.category==='vendor_ops'?'Vendor / venue':
            item.category==='internal'?'Internal':'Inquiry review'):
          item.type==='payment'?'Payment verification':'Payout verification'));
      head.append(makeText('span','secondary',item.eventName));
      card.append(head);
      card.append(makeText('h3','',item.title));
      card.append(makeText('p','action-queue-source','Source: '+item.source));
      card.append(makeText('p','',item.evidence));
      card.append(makeText('p','',item.action));
      const stored=actionDecisions.get(item.id);
      const valid=actionQueueEngine.decisionApplies(item,stored);
      const names={
        draft_requested:'Approved for drafting (no draft created)',
        verify_requested:'Flagged for verification',
        hold:'On hold',dismissed:'Dismissed from active review'
      };
      // Keep the immutable audit history visible, but do not present an older
      // approval as active when current inbox evidence no longer permits drafting.
      const historicalDraftBlocked=valid && item.type==='gmail' &&
        stored?.decision==='draft_requested' && item.draftCandidate!==true;
      card.append(makeText('p','action-queue-decision',
        item.type==='inbox'?
          'Use Step 47 in Recent business Gmail review for this thread. Reply decisions have a separate, protected audit.':
        stored && !valid?'Source evidence changed since the saved decision. Review again.':
        historicalDraftBlocked?
          'Historical drafting approval — currently blocked by correspondence safeguards'+
            ' · recorded '+(stored.recordedAt?dateFmt(stored.recordedAt):'in audit'):
        valid?(names[stored.decision]||'Previously reviewed')+
          ' · recorded '+(stored.recordedAt?dateFmt(stored.recordedAt):'in audit'):
          'Not yet reviewed'));
      const controls=makeText('div','action-queue-controls','');
      const actionButtons=item.type==='gmail'?
        (item.draftCandidate===true&&!isPaused(item)?
          [['draft_requested','Approve for Drafting'],['hold','Hold'],['dismissed','Dismiss']]:
          [['hold','Hold'],['dismissed','Dismiss']]):
        item.type==='inbox'?
          []:
          [['verify_requested','Flag for Verification'],['hold','Hold'],['dismissed','Dismiss']];
      for(const [decision,label] of actionButtons){
        const btn=document.createElement('button');
        btn.type='button';
        btn.className=decision==='hold'||decision==='dismissed'?'neutral':'primary';
        btn.textContent=label;
        btn.disabled=!actionAuditReady||Boolean(savingActionId)||
          (valid && stored.decision===decision);
        btn.setAttribute('aria-label',label+' — '+item.eventName+' — '+item.title);
        btn.addEventListener('click',()=>saveOwnerActionDecision(item,decision));
        controls.append(btn);
      }
      card.append(controls);
      if(item.type==='inbox')
        card.append(makeText('p','action-draft-status',
          'Open this thread in Recent business Gmail review. Inspect the excerpts, verify the original Gmail and CRM, and use Step 47 one-at-a-time controls if the conversation qualifies. No automatic sending.'));
      if(item.type==='gmail' && (!item.draftCandidate||isPaused(item)))
        card.append(makeText('p','action-draft-status',
          item.group==='review' && !isPaused(item)?
            'Follow-up timing review only — inspect the full thread and client timing; drafting approval is not automatic.':
            'Monitoring only — drafting approval unavailable until this conversation needs a fresh review.'));
      const open=document.createElement('button');
      open.type='button';
      open.className='neutral';
      open.textContent='View source section';
      open.addEventListener('click',()=>{
        const target=$(item.target);
        if(target)target.scrollIntoView({behavior:'smooth',block:'start'});
      });
      card.append(open);
      if(item.type==='inbox' && /^[a-f0-9]{8,32}$/i.test(item.threadId||'')) {
        const link=document.createElement('a');
        link.href='https://mail.google.com/mail/?authuser=book%40pokertraininglasvegas.com#all/'+item.threadId;
        link.target='_blank';link.rel='noopener noreferrer';
        link.textContent='Open in LVPT Gmail (verify mailbox)';
        card.append(link);
      }
      renderApprovedDraftPreview(card,item);
      holder.append(card);
    });
    toggle.hidden=backgroundItems.length===0;
    toggle.textContent=showActionMonitoring ?
      'Hide '+backgroundItems.length+' monitoring/held item(s)' :
      'Show '+backgroundItems.length+' monitoring/held item(s)';
  }


  function renderBusinessInboxReview() {
    const status=$('businessInboxStatus');
    const items=$('businessInboxItems');
    const more=$('loadMoreBusinessInbox');
    items.replaceChildren();
    $('refreshBusinessInbox').disabled=!sessionToken || businessInboxLoading;
    $('continueBusinessInboxQueue').disabled=!sessionToken||businessInboxLoading||
      inboxQueueBusy||!businessInboxReview?.connected||Boolean(replyController.getActive());
    $('runInboxDiagnostics').disabled=!sessionToken || businessInboxLoading;
    more.hidden=true;
    if(!sessionToken || !report || report.source!=='staging') {
      status.textContent='Unlock and load the protected staging inbox to check read-only Gmail headers.';
      return;
    }
    if(businessInboxLoading && !businessInboxReview?.connected) {
      status.textContent='Checking recent business Gmail thread headers; no message bodies are read during the scan.';
      return;
    }
    if(!businessInboxReview?.connected) {
      status.textContent=businessInboxError?
        'Business inbox scan unavailable. '+businessInboxError+
        ' No conclusions about unanswered inquiries can be drawn.':
        'Step 45 paginated Apps Script backend has not yet been verified. Do not infer that the business inbox is clear.';
      return;
    }
    const rows=businessInboxReview.threads||[];
    const inbound=rows.filter(x=>x.needsHumanReview===true);
    const vendor=inbound.filter(x=>x.relationshipHint==='vendor').length;
    const internal=rows.filter(x=>x.relationshipHint==='internal').length;
    const formLeads=inbound.filter(x=>x.sourceType==='form_lead').length;
    const possible=inbound.length-vendor;
    const reviewed=rows.map(t=>{
      const context=businessInboxThreadContext.get(t.threadId);
      return context?replyQualifier.qualifyThread(t,context):null;
    }).filter(Boolean);
    const candidates=reviewed.filter(q=>q.outcome==='reply_candidate').length;
    status.textContent='Read-only business Gmail: '+businessInboxReview.examinedThreads+
      ' message threads checked across '+businessInboxReview.pagesLoaded+' bounded page(s); '+
      possible+' potential inquiries ('+formLeads+' form notifications), '+
      vendor+' vendor/venue reviews, '+internal+' internal thread(s), '+
      businessInboxReview.excludedAutomatedCount+' automated notifications excluded.'+
      (businessInboxReview.upgradePending?
        ' Step 45 backend upgrade pending: only the previous first-page scan is available.':
        businessInboxReview.nextPage!==null?
          ' More recent-mail pages available.':
          ' No further pages available within this 30-day query.')+
      ' '+reviewed.length+' selected thread(s) qualified locally; '+candidates+
      ' potential reply candidate(s) among them. These are NOT authorized drafts.'+
      ' Coverage remains limited; bodies are only fetched for a selected thread. No messages sent or records changed.';
    const priority=t=>t.sourceType==='form_lead'?0:
      t.needsHumanReview&&t.relationshipHint==='vendor'?2:
      t.needsHumanReview?1:t.relationshipHint==='internal'?4:3;
    const sorted=rows.slice().sort((a,b)=>priority(a)-priority(b) ||
      String(b.lastMessageAt).localeCompare(String(a.lastMessageAt)));
    if(!sorted.length)
      items.append(makeText('p','hint',
        'No eligible entries in these bounded pages. This does not prove the entire business inbox is clear.'));
    sorted.forEach(t=>{
      const card=makeText('div','gmail-evidence-card','');
      card.append(makeText('strong','',t.subject||'(no subject)'));
      const role=t.sourceType==='form_lead'?'Website form — verify original client and prior replies':
        t.relationshipHint==='internal'?'Internal correspondence — no sales outreach':
        t.relationshipHint==='vendor'?'Vendor / venue operations':
        t.needsHumanReview?'Potential inquiry — inspect full thread':
          'LVPT last responded — monitor';
      card.append(makeText('p','gmail-evidence-label',role));
      card.append(makeText('p','gmail-evidence-meta',
        (t.senderDomain?'Sender domain: '+t.senderDomain+' · ':'')+
        'Most recent: '+dateFmt(t.lastMessageAt)+' · '+
        t.observedMessages+' observed messages'));
      const needs=t.needsHumanReview;
      card.append(makeText('p','gmail-evidence-explain',
        t.relationshipHint==='internal'?
          'Internal owner correspondence. Not a customer lead.':
        t.relationshipHint==='vendor'?
          'Vendor logistics require operational review, not sales outreach.':
        needs?
          'A recent incoming message requires context, not an automatic reply. Read the conversation before drafting.':
          'LVPT sent the last message. Do not generate a duplicate follow-up from metadata.'));
      const open=document.createElement('button');
      open.type='button';open.className='neutral';
      open.disabled=businessInboxThreadLoading===t.threadId;
      open.textContent=businessInboxThreadLoading===t.threadId?
        'Reviewing conversation…':
        businessInboxThreadContext.has(t.threadId)?'Hide / show conversation preview':
          'Inspect recent conversation (read-only)';
      open.addEventListener('click',()=>loadBusinessInboxThread(t));
      card.append(open);
      const link=document.createElement('a');
      link.href='https://mail.google.com/mail/?authuser=book%40pokertraininglasvegas.com#all/'+t.threadId;
      link.target='_blank';link.rel='noopener noreferrer';
      link.textContent='Open original thread in LVPT Gmail';
      card.append(link);
      if(businessInboxThreadError.has(t.threadId))
        card.append(makeText('p','source-status',
          'Thread preview unavailable: '+businessInboxThreadError.get(t.threadId)));
      const context=businessInboxThreadContext.get(t.threadId);
      if(context?.visible) {
        const detail=makeText('div','action-draft-panel','');
        const qualification=replyQualifier.qualifyThread(t,context);
        const qualificationCard=makeText('div','reply-qualification','');
        qualificationCard.append(makeText('p','reply-qualification-title',
          'Step 46 · '+qualification.label));
        qualificationCard.append(makeText('p','',qualification.reason));
        qualificationCard.append(makeText('p','reply-qualification-next',
          'Next: '+qualification.nextStep));
        qualificationCard.append(makeText('p','hint',
          'Rule-based interpretation of the selected excerpts only. No AI call, no approved Gmail draft, and no automatic sending.'));
        // Step 47 UX: surface only the latest email by default. Prior
        // correspondence remains available on demand for context and to
        // avoid duplicate outreach; it is never a separate approval.
        const messages=Array.isArray(context.messages)?context.messages:[];
        const latest=messages[messages.length-1];
        const earlier=messages.slice(0,-1);
        const showMessage=(m,title)=>{
          const item=makeText('div','gmail-evidence-card','');
          item.append(makeText('p','gmail-evidence-label',
            title+' · '+m.direction+' · '+dateFmt(m.at)));
          if(m.excerpt) {
            const preview=window.LVPTMessagePreview.focus(m.excerpt);
            item.append(makeText('p','gmail-message-excerpt',preview.body));
            if(preview.shortened) {
              const hidden=document.createElement('details');
              hidden.className='reply-message-extras';
              hidden.append(makeText('summary','',
                preview.reason==='quoted_history'?
                  'Show quoted email history':'Show signature and additional text'));
              hidden.append(makeText('p','gmail-message-excerpt',preview.hidden));
              item.append(hidden);
            }
          }else
            item.append(makeText('p','hint','Body unavailable — open Gmail to inspect it.'));
          if(m.hasAttachments)
            item.append(makeText('p','hint',
              'Attachment detected — inspect it directly in Gmail.'));
          return item;
        };
        if(latest) {
          detail.append(makeText('strong','','Latest email — current review focus'));
          detail.append(showMessage(latest,'Latest message'));
        }
        detail.append(qualificationCard);
        replyController.render(detail,t,context,qualification);
        if(earlier.length) {
          const history=document.createElement('details');
          history.className='reply-thread-history';
          const label=makeText('summary','',
            'View '+earlier.length+' previous email'+
            (earlier.length===1?'':'s')+' for context');
          history.append(label);
          earlier.forEach(m=>history.append(showMessage(m,'Earlier correspondence')));
          detail.append(history);
        }
        if(context.partial)
          detail.append(makeText('p','hint',
            'Older messages or attachments may be omitted. Review the full Gmail thread before deciding.'));
        detail.append(makeText('p','hint',
          'Only the latest message is the current review target. No email draft is created automatically.'));
        card.append(detail);
      }
      items.append(card);
    });
    more.hidden=businessInboxReview.nextPage===null;
    more.disabled=businessInboxLoading;
    more.textContent=businessInboxLoading?'Loading more…':
      'Load more business Gmail (page '+(businessInboxReview.nextPage??0)+')';
  }

  function diagnosticReasonLabel(code) {
    const labels={
      acknowledgement:'Acknowledged or submitted',
      client_declined:'Opportunity declined',
      client_reviewing:'Client-controlled timing',
      explicit_request:'Potential new request',
      history_incomplete:'Older messages omitted',
      latest_message_incomplete:'Latest email incomplete',
      vendor_operations:'Vendor or venue correspondence',
      internal:'Internal correspondence',
      lvpt_replied_last:'LVPT replied last',
      unknown_sender:'Sender unverified',
      empty_latest_body:'No readable latest message',
      chronology_unverified:'Conversation changed or unverified',
      ambiguous_latest_message:'Manual interpretation needed',
      not_checked:'No classification made'
    };
    return labels[String(code||'')]||'Review needed';
  }

  async function loadInboxDiagnosticHistory() {
    const root=$('inboxDiagnosticHistory');
    if(!root || !sessionToken || !report || report.source!=='staging')return;
    try {
      const data=await getProtected('/api/sms/staging/inbox-diagnostics');
      if(!data?.ok||data.source!=='lvpt_no_client_data_diagnostic_history'||
         data.clientDataIncluded!==false||!Array.isArray(data.entries))
        throw Error('Invalid read-only history');
      root.replaceChildren();
      const entries=data.entries.slice(0,3);
      if(entries.length)root.append(makeText('strong','',
        'Recent diagnostic checks (no client content)'));
      for(const entry of entries) {
        const category=entry.qualificationOutcome==='no_reply_suggested'?
          'No sales reply suggested':
          entry.qualificationOutcome==='possible_request'?
          'Possible request; owner review needed':
          entry.qualificationOutcome==='needs_review'?
          'Incomplete/ambiguous; manual review':
          entry.qualificationOutcome==='vendor_only'?
          'Vendor operations':
          'Not qualified';
        root.append(makeText('p','hint',
          dateFmt(entry.at)+' · Inbox '+entry.inboxStatus+
          ' · '+category+' · '+diagnosticReasonLabel(entry.qualificationReasonCode)+
          ' · '+(entry.sampledThreads||0)+' thread(s) checked'+
          ' · '+(entry.possibleRequests||0)+' potential requests'+
          ' · '+(entry.noReplySuggestedCount||0)+' no-reply suggestions'+
          ' · Recipient '+entry.recipientStatus+
          ' · Negative-control '+(entry.negativeControlStatus||'not_checked')+
          ' · '+(entry.sendSwitchEnabled?'Send switch ON':'Send switch OFF')));
      }
    }catch {
      // Fail closed. Do not display cached private diagnostic state.
      root.replaceChildren();
      root.append(makeText('p','hint',
        'Past diagnostic history is temporarily unavailable.'));
    }
  }

  async function runInboxDiagnostics() {
    if(!sessionToken||!report||report.source!=='staging')return;
    const button=$('runInboxDiagnostics');
    const status=$('inboxDiagnosticStatus');
    if(button.disabled)return;
    button.disabled=true;
    status.textContent='Running read-only Gmail checks; recording no client content…';
    try {
      const selection=(businessInboxReview?.threads||[]).find(t=>
        businessInboxThreadContext.get(t.threadId)?.visible);
      const body=selection?
        {threadId:selection.threadId,lastMessageAt:selection.lastMessageAt}:{};
      const d=await getProtected('/api/sms/staging/inbox-diagnostics',{body});
      if(d.source!=='lvpt_read_only_staging_diagnostic'||!d.runId||
         d.gmailWrites!==false||d.sendingInvoked!==false)
        throw Error('Invalid diagnostic response');
      const mode=d.selectionMode==='manual'?
        'Your expanded conversation':
        d.selectionMode==='automatic_client'?
        'Auto-selected incoming correspondence (read-only)':
        d.selectionMode==='automatic_vendor'?
        'Auto-selected venue/vendor correspondence (read-only)':
        d.selectionMode==='negative_outbound'?
        'Already-answered conversation chosen as a negative-control safety test':
        'No eligible incoming conversation found';
      const qualification=d.qualificationOutcome==='no_reply_suggested'?
        'Latest message appears to be an acknowledgement, hold, or closing; no sales reply recommended':
        d.qualificationOutcome==='possible_request'?
        'Possible new client request — human verification required':
        d.qualificationOutcome==='vendor_only'?
        'Venue/vendor operations, not sales outreach':
        d.qualificationOutcome==='needs_review'?
        'Manual review required (incomplete or ambiguous evidence)':
        'No reply qualification performed';
      const recipient=d.recipientStatus==='verified'?
        'Gmail recipient verification passed':
        d.recipientStatus==='blocked'?
        'Recipient verification blocked by safeguards':
        d.recipientStatus==='not_selected'?
        'Recipient check not needed for this classification':
        'Recipient check unavailable';
      status.textContent='Diagnostic saved. Inbox: '+d.inboxStatus+
        ' ('+d.pageZeroThreads+' scanned entries). '+mode+
        '. Examined '+(d.sampledThreads||0)+
        ' recent incoming conversation(s); '+(d.possibleRequests||0)+
        ' potential requests, '+(d.noReplySuggestedCount||0)+
        ' no-reply suggestions. Priority result: '+qualification+
        ' ('+diagnosticReasonLabel(d.qualificationReasonCode)+'). '+
        recipient+'. Negative-control safety test: '+
        (d.negativeControlStatus||'not_checked')+
        '. No emails sent; no client content stored. Report ID: '+d.runId;
      void loadInboxDiagnosticHistory();
    }catch {
      status.textContent='Diagnostic unavailable or not saved. No client emails were sent. Use the normal inbox controls and retry later.';
    }finally{
      button.disabled=!sessionToken||businessInboxLoading;
    }
  }

  async function loadBusinessInboxReview(append=false) {
    if(!sessionToken || !report || report.source!=='staging') {
      renderBusinessInboxReview();return;
    }
    if(businessInboxLoading)return;
    if(append && (!businessInboxReview?.connected||businessInboxReview.nextPage===null))return;
    const requestedPage=append?businessInboxReview.nextPage:0;
    businessInboxLoading=true;
    businessInboxError='';
    if(!append) {
      businessInboxReview=null;
      businessInboxThreadContext=new Map();
      businessInboxThreadError=new Map();
      showInboxQueueStatus('');
      replyController.reset();
    }
    renderBusinessInboxReview();
    try {
      const data=await getProtected('/api/sms/staging/inbox-review?page='+requestedPage);
      if(!data?.ok||data.source!=='lvpt_read_only_business_inbox_review'||
         !Array.isArray(data.threads)||data.page!==requestedPage)
        throw new Error('Invalid paginated inbox metadata');
      if(append) {
        const old=businessInboxReview;
        const merged=new Map(old.threads.map(t=>[t.threadId,t]));
        data.threads.forEach(t=>merged.set(t.threadId,t));
        businessInboxReview={
          ...data,threads:Array.from(merged.values()),
          pagesLoaded:old.pagesLoaded+1,
          examinedThreads:old.examinedThreads+data.examinedThreads,
          excludedAutomatedCount:old.excludedAutomatedCount+data.excludedAutomatedCount,
          metadataFailures:old.metadataFailures+data.metadataFailures,
          partial:true
        };
      }else {
        businessInboxReview={...data,pagesLoaded:1};
      }
    }catch {
      businessInboxError='The Step 45 backend may require redeployment or be temporarily unavailable.';
    }finally {
      businessInboxLoading=false;
      renderBusinessInboxReview();
      renderActionQueue();
      if(!append)void loadInboxDiagnosticHistory();
    }
  }

  // The active thread may be the last (or only) item in date order.
  // Continue through the rest and wrap once; never revisit the just-denied email.
  function orderedInboxCandidates(rows,previousThreadId) {
    const candidates=(Array.isArray(rows)?rows:[])
      .filter(t=>t.needsHumanReview===true &&
        t.lastDirection==='inbound' &&
        t.sourceType==='email_thread' &&
        t.relationshipHint==='unclassified')
      .sort((a,b)=>String(b.lastMessageAt).localeCompare(String(a.lastMessageAt)));
    const previous=candidates.findIndex(t=>t.threadId===previousThreadId);
    if(previous<0)return candidates;
    return [...candidates.slice(previous+1),...candidates.slice(0,previous)];
  }

  async function advanceToNextInboxThread(previousThreadId) {
    if(inboxQueueBusy||!sessionToken || !businessInboxReview?.connected)return;
    inboxQueueBusy=true;
    // Clear the dismissed email from the visible review, even when the
    // current scan contains no other eligible conversations.
    const previous=businessInboxThreadContext.get(previousThreadId);
    if(previous)businessInboxThreadContext.set(previousThreadId,
      {...previous,visible:false});
    if(!previousThreadId)businessInboxThreadContext.forEach((value,key)=>
      businessInboxThreadContext.set(key,{...value,visible:false}));
    renderBusinessInboxReview();
    showInboxQueueStatus('Denial saved. Checking the next eligible LVPT conversation (read-only)…');
    const examined=new Set();
    try {
      // Load a bounded number of additional metadata pages on demand.
      // This never reads message bodies until a selected thread is opened.
      for(let page=0;page<4;page++) {
        const candidates=orderedInboxCandidates(
          businessInboxReview?.threads||[],previousThreadId);
        for(const next of candidates) {
          const key=next.threadId+'|'+next.lastMessageAt;
          if(examined.has(key))continue;
          examined.add(key);
          try {
            const audit=await getProtected(
              '/api/sms/staging/reply-decisions?threadId='+
              encodeURIComponent(next.threadId));
            if(!audit.ok||audit.source!=='append_only_owner_reply_audit')
              throw Error('Decision audit unavailable');
            if(audit.lastMessageAt===next.lastMessageAt&&
               audit.decision==='denied')continue;
          }catch {
            showInboxQueueStatus('Review paused: the next conversation could not be checked against owner decisions. No email was opened or sent.');
            return;
          }
          await loadBusinessInboxThread(next);
          if(!businessInboxThreadContext.get(next.threadId)?.visible) {
            showInboxQueueStatus('Next email could not be opened for review. Refresh the inbox and retry. No email sent.');
            return;
          }
          showInboxQueueStatus('Next eligible incoming email opened for owner review. Nothing was approved or sent automatically.');
          const heading=$('inboxReviewTitle');
          if(heading)heading.scrollIntoView({behavior:'smooth',block:'start'});
          return;
        }
        if(businessInboxReview?.nextPage===null)break;
        const beforePage=businessInboxReview?.nextPage;
        showInboxQueueStatus('No other eligible email on this page. Checking additional recent-mail headers…');
        await loadBusinessInboxReview(true);
        if(businessInboxError||!businessInboxReview?.connected) {
          showInboxQueueStatus('Could not complete the next-page scan. No email was sent. Refresh the business inbox to retry.');
          return;
        }
        if(businessInboxReview.nextPage===beforePage)break;
      }
      const more=businessInboxReview?.nextPage!==null;
      showInboxQueueStatus(more?
        'No further eligible inquiry found in the pages checked. More pages may be available; use Load more business Gmail to continue.':
        'Review queue complete for the scanned recent-mail window. No other eligible incoming email found. This does not mean the entire mailbox is clear.');
    }finally {
      inboxQueueBusy=false;
    }
  }

  async function loadBusinessInboxThread(t) {
    if(!sessionToken||!t?.threadId || businessInboxThreadLoading)return;
    // A review in progress cannot silently jump to a different recipient.
    const pending=replyController.getActive();
    if(pending && pending.threadId!==t.threadId) {
      businessInboxThreadError.set(t.threadId,
        'Finish or close the active reply review before opening another conversation.');
      renderBusinessInboxReview();return;
    }
    const old=businessInboxThreadContext.get(t.threadId);
    // Keep exactly one selected conversation visible at a time, while
    // retaining earlier previews in memory without Gmail writes.
    businessInboxThreadContext.forEach((value,key)=>{
      if(key!==t.threadId)businessInboxThreadContext.set(key,{...value,visible:false});
    });
    if(old) {
      businessInboxThreadContext.set(t.threadId,{...old,visible:!old.visible});
      renderBusinessInboxReview();return;
    }
    businessInboxThreadLoading=t.threadId;
    businessInboxThreadError.delete(t.threadId);
    renderBusinessInboxReview();
    try {
      const q=new URLSearchParams({
        threadId:t.threadId,lastMessageAt:t.lastMessageAt
      });
      const context=await getProtected('/api/sms/staging/inbox-thread?'+q);
      if(!context?.ok||context.source!=='owner_selected_read_only_thread_review'||
         context.threadId!==t.threadId||!Array.isArray(context.messages))
        throw new Error('Selected thread source did not match');
      // In-memory only; no browser storage or write action.
      businessInboxThreadContext.set(t.threadId,{...context,visible:true});
      await replyController.loadAudit(t);
    }catch {
      businessInboxThreadError.set(t.threadId,
        'Unable to verify current thread context. Open the original in Gmail and refresh the scan.');
    }finally {
      businessInboxThreadLoading='';
      renderBusinessInboxReview();
    }
  }

  function renderGmailEvidence() {
    const container=$('gmailEvidenceItems');
    const status=$('gmailEvidenceStatus');
    container.replaceChildren();
    const checked=gmailEvidenceRecords.filter(x=>x.connected===true).length;
    const clients=Object.keys(gmailEngine.CLIENTS);
    const list=gmailEngine.buildBrief(
      clients.map(key=>gmailEvidenceRecords.find(x=>x.eventKey===key) ||
        {eventKey:key,connected:false}),Date.now()
    );
    $('refreshGmailEvidence').disabled=!sessionToken || gmailEvidenceLoading;
    if(!report || report.source!=='staging') {
      status.textContent='Load the authenticated staging inbox to check limited Gmail metadata.';
      return;
    }
    if(gmailEvidenceLoading)
      status.textContent='Checking client Gmail thread headers, without reading message bodies…';
    else if(!checked)
      status.textContent='Direct Gmail metadata source not activated or temporarily unavailable. No outreach conclusions can be drawn.';
    else
      status.textContent='Limited verified Gmail metadata for '+checked+'/'+clients.length+
        ' client accounts. This is not a complete inbox, calendar, CRM, or phone-call audit.';
    list.forEach(item=>{
      const card=makeText('div','gmail-evidence-card','');
      card.append(makeText('strong','',item.clientLabel));
      card.append(makeText('p','gmail-evidence-label',item.label));
      card.append(makeText('p','gmail-evidence-explain',item.explanation));
      if(item.lastMessageAt) {
        const dt=new Date(item.lastMessageAt);
        if(!Number.isNaN(dt.getTime()))
          card.append(makeText('p','gmail-evidence-meta','Most recent indexed message: '+dateFmt(item.lastMessageAt)+
            ' · '+item.threadCount+' checked thread'+(item.threadCount===1?'':'s')));
      }
      if(item.olderInboundThreads>0)
        card.append(makeText('p','gmail-evidence-meta',
          item.olderInboundThreads+' older thread(s) end with client messages. Check separately before deciding.'));
      if(item.partial)
        card.append(makeText('p','gmail-evidence-meta',
          'Search reached its safety limit; additional threads may exist.'));
      // Show limited verified subject only. Thread bodies and sender emails
      // are never requested by this UI and aren't saved to the staging DB.
      const recent=item.threads?.slice().sort((a,b)=>
        String(b.lastMessageAt||'').localeCompare(String(a.lastMessageAt||'')))[0];
      if(recent && recent.subject)card.append(makeText('p','gmail-evidence-meta','Latest subject: '+recent.subject));
      container.append(card);
    });
    renderActionQueue();
  }

  async function loadGmailEvidence() {
    if(!sessionToken || !report || report.source!=='staging') {
      renderGmailEvidence();
      return;
    }
    if(gmailEvidenceLoading) return;
    gmailEvidenceLoading=true;
    gmailEvidenceRecords=[];
    renderGmailEvidence();
    const keys=Object.keys(gmailEngine.CLIENTS);
    try {
      // Probe a single known client first: if backend isn't deployed, avoid
      // five redundant failing Apps Script requests on every refresh.
      const first=await getProtected('/api/sms/staging/gmail-evidence?eventKey='+keys[0]);
      if(!first.connected || first.eventKey!==keys[0])
        throw new Error('gmail_source_unavailable');
      gmailEvidenceRecords.push(first);
      renderGmailEvidence();
      const rest=await Promise.allSettled(keys.slice(1).map(key=>
        getProtected('/api/sms/staging/gmail-evidence?eventKey='+encodeURIComponent(key))
      ));
      rest.forEach((r,i)=>{
        const key=keys[i+1];
        if(r.status==='fulfilled' && r.value?.connected && r.value.eventKey===key)
          gmailEvidenceRecords.push(r.value);
      });
    }catch {
      // Never fall back to the incomplete Command Center Gmail Activity sheet
      // to assert that a client has (or has not) replied.
    }finally {
      gmailEvidenceLoading=false;
      renderGmailEvidence();
    }
  }

  function renderPaymentAudit() {
    const status=$('paymentAuditStatus');
    const rows=$('paymentAuditItems');
    rows.replaceChildren();
    if(!report || report.source!=='staging') {
      status.textContent='Load authenticated staging data to check each recorded invoice.';
      return;
    }
    if(!recordsAvailable) {
      status.textContent='Command Center connection unavailable. No payment conclusions inferred.';
      return;
    }
    const brief=evidence.paymentBrief(paymentRecords,paymentLedgerConnected,connectedRecords);
    if(!brief.connected) {
      status.textContent='Full Payments ledger is not yet connected. Existing event summaries show only the first payment per event; do not treat them as complete invoice reconciliation.';
      return;
    }
    status.textContent='Full Payments ledger connected: '+brief.total+' entries. '+
      brief.settled+' recorded Paid In Full; '+brief.initiated+
      ' Payment Initiated / Processing; '+brief.invoiceSent+
      ' Invoice Sent; '+brief.unknown+
      ' other status. No bank receipt independently checked.';
    brief.exceptions.slice(0,25).forEach(p=>{
      const row=makeText('div','payout-exception','');
      row.append(makeText('strong','',p.eventName+' · '+p.invoiceNumber));
      const amount=p.invoiceTotal===null?'total unavailable':p.invoiceTotal.toLocaleString('en-US',{style:'currency',currency:'USD'});
      row.append(makeText('p','','Recorded '+p.paymentStatus+' · '+amount+
        ' · paid in ledger: '+(p.amountPaid===null?'not recorded':
         p.amountPaid.toLocaleString('en-US',{style:'currency',currency:'USD'}))));
      if(p.kind==='initiated')
        row.append(makeText('p','',
          'Payment initiation is not receipt. Verify settlement before marking Paid In Full.'));
      else if(p.kind==='invoiceSent')
        row.append(makeText('p','',
          'Invoice was sent; receipt is not evidenced by this status. Check client and payment history.'));
      rows.append(row);
    });
    if(brief.exceptions.length>25)
      rows.append(makeText('p','hint','Showing the first 25 exceptions; additional records require a broader reconciliation view.'));
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
    updateSaveControls();
    if (!report) { caseBundles = []; $('caseList').replaceChildren(); $('caseExplain').textContent = 'Load staging findings to see consolidated cases.'; renderPayoutAudit(); renderPaymentAudit(); renderAttentionBrief(); renderActionQueue(); return; }
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
    updateSaveControls();
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
        showSaveFeedback('Review status changed. Save to preserve the update.','pending');
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
        showSaveFeedback('Review note changed. Save to preserve the update.','pending');
        updateSaveControls();
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
      paymentLedgerConnected=data.paymentSourceStatus==='command_center_all_payments';
      paymentRecords=paymentLedgerConnected && Array.isArray(data.paymentRecords)?data.paymentRecords:[];
      $('reconciliationStatus').textContent=
        'Read-only Command Center comparison connected: '+data.recordCount+
        ' event records. '+(payoutLedgerConnected ? 'Event Payouts ledger connected ('+payoutRecords.length+' entries).' : 'Payout ledger comparison pending Apps Script deployment.')+' Gmail Activity is incomplete; this is not a full inbox search. No records changed.';
    }catch(error) {
      connectedRecords=[];
      recordsAvailable=false;
      payoutLedgerConnected=false;
      payoutRecords=[];
      paymentLedgerConnected=false;
      paymentRecords=[];
      const reason=error instanceof Error ? error.message : 'unknown error';
      $('reconciliationStatus').textContent=
        reason.includes('command_center_source_unconfigured') ?
          'Command Center read-only sync is not configured for this preview. SMS grouping still works, but payment and task cross-checks are unavailable.' :
          'Command Center comparison unavailable ('+reason+'). No financial conclusions will be inferred.';
    }
    renderCaseBundles();
    renderPayoutAudit();
    renderPaymentAudit();
    renderActionQueue();
  }
  async function loadAuditHealth() {
    auditServiceReady=false;
    $('auditHealthStatus').textContent='Verifying protected audit service (zero-write test)…';
    try {
      const data=await getProtected('/api/sms/staging/audit-health');
      auditServiceReady=data.auditReady===true &&
        data.checkedWithEmptyBatch===true && data.noRecordsWritten===true;
      $('auditHealthStatus').textContent=auditServiceReady
        ? 'Encrypted review audit service verified. Decisions can be safely saved with audit history.'
        : 'Audit service is not verified. Review saving is disabled.';
    }catch {
      auditServiceReady=false;
      $('auditHealthStatus').textContent='Audit service unavailable. Review saving is disabled until connectivity is restored.';
    }
    if(report) summary();
    return auditServiceReady;
  }
  async function loadSavedDecisions() {
    if (!sessionToken) return;
    try {
      const data=await getProtected('/api/sms/staging/decisions');
      caseDecisions=Object.create(null);
      savedSourceCounts=Object.create(null);
      savedDecisionSignatures=Object.create(null);
      for (const d of data.decisions || []) {
        if (!d || typeof d.key!=='string') continue;
        caseDecisions[d.key]={status:d.status,note:d.note};
        savedSourceCounts[d.key]=d.sourceCount;
        savedDecisionSignatures[d.key]=decisionSignature(d.status,d.note,d.sourceCount);
      }
      renderCaseBundles();
      showSaveFeedback('Previous saved reviews restored. Nothing new needs saving.','success');
      return (data.decisions || []).length;
    }catch {
      setStatus('SMS loaded; saved case decisions could not be retrieved. Do not re-review previously completed cases until this is resolved.',true);
      showSaveFeedback('Could not restore saved reviews. Do not save new decisions until this is resolved.','error');
      return null;
    }
  }
  async function saveDecisions() {
    if(!report || report.source!=='staging' || !sessionToken || !auditServiceReady) {
      showSaveFeedback('Audited saving is unavailable. Your existing decisions are unchanged.','error');
      return;
    }
    if(savingInProgress) return;
    const toSave=unsavedCaseBundles().map(b=>({
      key:b.key,status:caseDecisions[b.key].status,
      note:String(caseDecisions[b.key].note||'').slice(0,500),
      sourceCount:b.count
    }));
    if(!toSave.length) {
      showSaveFeedback('Everything is already saved. No duplicate audit entry was created.','success');
      updateSaveControls();
      return;
    }
    savingInProgress=true;
    updateSaveControls();
    showSaveFeedback('Saving '+toSave.length+' changed review'+
      (toSave.length===1?'':'s')+' with protected audit history…','pending');
    try {
      let saved=0;
      for(let i=0;i<toSave.length;i+=40) {
        const batch=toSave.slice(i,i+40);
        const data=await getProtected('/api/sms/staging/decisions',{
          body:{decisions:batch}
        });
        if(data.audited!==true || !Number.isInteger(data.saved) ||
           data.saved!==batch.length)
          throw new Error('Review was not acknowledged by the append-only audit service.');
        saved+=data.saved;
        // Mark only acknowledged batches saved, including partial batch failures.
        batch.forEach(item=>{
          savedSourceCounts[item.key]=item.sourceCount;
          savedDecisionSignatures[item.key]=decisionSignature(
            item.status,item.note,item.sourceCount);
        });
      }
      renderCaseBundles();
      const message='Saved '+saved+' changed review'+(saved===1?'':'s')+
        ' securely with audit history. No live business records changed.';
      showSaveFeedback(message,'success');
      setStatus(message);
    }catch(error) {
      const message='Save failed: '+(error instanceof Error?error.message:'unknown error')+
        '. Your previous saved reviews are preserved.';
      showSaveFeedback(message,'error');
      setStatus(message,true);
    }finally {
      savingInProgress=false;
      updateSaveControls();
    }
  }

  function showSession(active) {
    sessionToken=active ? 'review-cookie-active' : '';
    $('runSyntheticAiTest').disabled=!active;
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
      auditServiceReady=false;
      payoutLedgerConnected=false;
      payoutRecords=[];
      paymentLedgerConnected=false;
      paymentRecords=[];
      gmailEvidenceRecords=[];
      businessInboxReview=null;businessInboxError='';
      businessInboxThreadContext=new Map();businessInboxThreadError=new Map();
      replyController.reset();
      draftState=null; draftFeedback=''; draftLoadingId=''; personalizedLoadingId='';
      actionDecisions=new Map();actionAuditReady=false;
      savedSourceCounts=Object.create(null);
      savedDecisionSignatures=Object.create(null);
      showSaveFeedback('Loading saved reviews…','neutral');
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
      const [decisionResult, , auditReady] = await Promise.all([
        loadSavedDecisions(),loadReferenceData(),loadAuditHealth(),loadActionDecisions()
      ]);
      void loadGmailEvidence();
      void loadBusinessInboxReview();
      if(decisionResult!==null && auditReady)
        setStatus('Staging ready: '+findings.length+' SMS findings, '+caseBundles.length+
          ' event/issue bundles; '+decisionResult+' saved reviews restored. Audited saving verified; no live records changed.');
      else if(!auditReady)
        setStatus('Staging findings loaded. Review saving disabled: protected audit service is unavailable.',true);
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
    payoutRecords=[]; payoutLedgerConnected=false; paymentLedgerConnected=false; paymentRecords=[]; auditServiceReady=false;
    connectedRecords=[]; recordsAvailable=false;
    gmailEvidenceRecords=[];businessInboxReview=null;businessInboxError='';showActionMonitoring=false;
    businessInboxThreadContext=new Map();businessInboxThreadError=new Map();
    replyController.reset();
    actionDecisions=new Map(); actionAuditReady=false; savingActionId='';
    draftState=null;draftFeedback='';draftLoadingId='';personalizedLoadingId='';
    savedDecisionSignatures=Object.create(null);
    showSaveFeedback('Results cleared. Saved reviews remain securely stored.','neutral');
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
  $('runSyntheticAiTest').addEventListener('click',runSyntheticAiTest);
  $('refreshGmailEvidence').addEventListener('click',loadGmailEvidence);
  $('refreshBusinessInbox').addEventListener('click',()=>loadBusinessInboxReview(false));
  $('continueBusinessInboxQueue').addEventListener('click',()=>{
    if(replyController.getActive()){
      showInboxQueueStatus('Finish or close the current draft before continuing the queue.');
      return;
    }
    void advanceToNextInboxThread(null);
  });
  $('runInboxDiagnostics').addEventListener('click',()=>void runInboxDiagnostics());
  $('loadMoreBusinessInbox').addEventListener('click',()=>loadBusinessInboxReview(true));
  $('toggleActionMonitoring').addEventListener('click',()=>{
    showActionMonitoring=!showActionMonitoring;
    renderActionQueue();
  });
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
  summary();render();renderGmailEvidence();renderBusinessInboxReview();
  checkSession();
})();
