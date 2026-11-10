(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.LVPTReplyReviewControls=api;
})(typeof window==='undefined'?null:window,function(){
  'use strict';
  // All email prose remains only in this browser's memory. The separate
  // audit contains statuses and an opaque digest, never recipients or bodies.
  function createController({getProtected,makeText,qualification,workflow,onUpdate}) {
    const audits=new Map(),verified=new Map();
    const status=new Map();
    let active=null,working='';
    function reset() {
      audits.clear();verified.clear();status.clear();active=null;working='';
    }
    const fingerprint=(text)=>window.crypto.subtle.digest('SHA-256',
      new TextEncoder().encode(text)).then(buffer=>
      [...new Uint8Array(buffer)].map(v=>v.toString(16).padStart(2,'0')).join(''));
    function eligible(t,context,q) {
      return workflow.canPrepare(t,context,q);
    }
    async function loadAudit(t) {
      if(!t||!t.threadId)return;
      audits.set(t.threadId,{loading:true});
      onUpdate();
      try {
        const d=await getProtected('/api/sms/staging/reply-decisions?threadId='+
          encodeURIComponent(t.threadId));
        if(!d.ok||d.source!=='append_only_owner_reply_audit')
          throw new Error('Independent approval log unavailable');
        audits.set(t.threadId,{ready:true,...d});
      }catch {
        audits.set(t.threadId,{error:'Owner reply audit is unavailable. Approval actions remain disabled.'});
      }finally {onUpdate();}
    }
    async function save(t,context,q,decision,draftDigest='') {
      if(working||!eligible(t,context,q)||!audits.get(t.threadId)?.ready)return false;
      if(active&&active.threadId!==t.threadId)return false;
      if(decision==='draft_prepared'&&verified.get(t.threadId)!==t.lastMessageAt)return false;
      if(decision==='approved_for_manual_copy'&&
         (!active||active.phase!=='prepared'||active.threadId!==t.threadId))return false;
      working=t.threadId;onUpdate();
      try {
        const data=await getProtected('/api/sms/staging/reply-decisions',{
          body:{
            threadId:t.threadId,lastMessageAt:t.lastMessageAt,
            decision,draftDigest,requestId:window.crypto.randomUUID()
          }
        });
        if(!data.ok||data.saved!==1||data.audited!==true||
           data.source!=='append_only_owner_reply_audit'||data.decision!==decision)
          throw new Error('Owner decision could not be confirmed');
        audits.set(t.threadId,{
          ready:true,decision,lastMessageAt:t.lastMessageAt,
          draftDigest,recordedAt:data.recordedAt
        });
        status.set(t.threadId,'Decision recorded in separate append-only review audit. No email sent.');
        if(decision==='draft_prepared') {
          const draft=active&&active.threadId===t.threadId?
            active:workflow.draftStarter(t);
          active={
            ...draft,threadId:t.threadId,lastMessageAt:t.lastMessageAt,
            phase:'prepared',draftDigest:'',verified:true
          };
        }else if(decision==='approved_for_manual_copy') {
          active={...active,phase:'approved_for_manual_copy',draftDigest};
        }else if(decision==='denied') {
          active=null;
        }
        return true;
      }catch(error) {
        status.set(t.threadId,'Decision NOT saved: '+
          (error instanceof Error?error.message:'Protected audit error')+
          '. No email was sent.');
        return false;
      }finally {working='';onUpdate();}
    }
    const button=(label,click,disabled=false,variant='neutral')=>{
      const el=makeText('button',variant,label);
      el.type='button';el.disabled=disabled;el.addEventListener('click',click);
      return el;
    };
    function render(container,t,context,q) {
      if(!eligible(t,context,q))return;
      const wrap=makeText('section','reply-review-workflow','');
      wrap.append(makeText('strong','',
        'Step 47 · One-email-at-a-time approval (non-sending)'));
      const audit=audits.get(t.threadId);
      if(!audit?.ready) {
        wrap.append(makeText('p','case-alert',
          audit?.error||'Checking separate owner reply-approval audit…'));
        container.append(wrap);return;
      }
      if(audit.lastMessageAt===t.lastMessageAt&&audit.decision) {
        wrap.append(makeText('p','action-draft-status',
          'Last recorded decision: '+audit.decision.replace(/_/g,' ')+
          '. The text of any prior draft is intentionally not stored.'));
      }
      if(status.has(t.threadId))
        wrap.append(makeText('p','action-draft-status',status.get(t.threadId)));
      if(active&&active.threadId!==t.threadId) {
        wrap.append(makeText('p','hint',
          'Another email is under review. Finish or close that draft before opening a new one.'));
        container.append(wrap);return;
      }
      if(working) {
        wrap.append(makeText('p','hint','Verifying current Gmail thread and recording the owner decision…'));
        container.append(wrap);return;
      }
      if(!active) {
        const check=document.createElement('input');
        check.type='checkbox';check.id='verify-reply-'+t.threadId;
        check.checked=verified.get(t.threadId)===t.lastMessageAt;
        const label=makeText('label','reply-verification','');
        label.setAttribute('for',check.id);
        label.append(check,document.createTextNode(
          ' I checked the original Gmail conversation and CRM/event notes. This question still needs an answer.'));
        check.addEventListener('change',()=>{
          if(check.checked)verified.set(t.threadId,t.lastMessageAt);
          else verified.delete(t.threadId);
          prepare.disabled=!check.checked;
        });
        wrap.append(label);
        const actions=makeText('div','action-queue-controls','');
        const prepare=button('Prepare editable reply',()=>void save(t,context,q,'draft_prepared'),
          !check.checked,'primary');
        actions.append(prepare);
        actions.append(button('Deny — no reply needed',
          ()=>void save(t,context,q,'denied')));
        wrap.append(actions);
        wrap.append(makeText('p','hint',
          'Recipient is deliberately unavailable in this preview. Verify the real recipient in Gmail. No draft is sent, saved to Gmail or shared with an AI model.'));
        container.append(wrap);return;
      }
      if(active.lastMessageAt!==t.lastMessageAt) {
        wrap.append(makeText('p','case-alert',
          'Gmail evidence changed. Refresh the inbox and start a new review.'));
        container.append(wrap);return;
      }
      wrap.append(makeText('p','action-draft-status',
        'To: VERIFY in the original LVPT Gmail thread (not provided or inferred here).'));
      const subject=document.createElement('input');
      subject.type='text';subject.maxLength=180;
      subject.setAttribute('aria-label','Step 47 draft subject');
      subject.value=active.subject;
      subject.disabled=active.phase!=='prepared';
      wrap.append(subject);
      const body=document.createElement('textarea');
      body.rows=9;body.maxLength=5000;
      body.setAttribute('aria-label','Step 47 editable draft response');
      body.value=active.body;
      body.disabled=active.phase!=='prepared';
      wrap.append(body);
      const validationNote=makeText('p','hint','');
      const controls=makeText('div','action-queue-controls','');
      const approve=button('Approve for manual copy',()=>void approveDraft(),true,'primary');
      const note=()=>{
        const v=workflow.validation(active.subject,active.body);
        validationNote.textContent=active.phase==='prepared'?
          (v.ok?'Text complete. Confirm facts and recipient in Gmail before any manual send.':v.reason):
          'Approved copy is locked. No Gmail send action exists in staging.';
        approve.disabled=!v.ok||active.phase!=='prepared';
      };
      subject.addEventListener('input',()=>{active.subject=subject.value;note();});
      body.addEventListener('input',()=>{active.body=body.value;note();});
      async function approveDraft() {
        const v=workflow.validation(active.subject,active.body);
        if(!v.ok){validationNote.textContent=v.reason;return;}
        const digest=await fingerprint(JSON.stringify([active.subject,active.body]));
        await save(t,context,q,'approved_for_manual_copy',digest);
      }
      note();
      wrap.append(validationNote);
      if(active.phase==='prepared') {
        controls.append(approve);
        controls.append(button('Edit text above',()=>body.focus()));
        controls.append(button('Deny — no reply needed',
          ()=>void save(t,context,q,'denied')));
      }else {
        wrap.append(makeText('p','action-draft-status',
          'Approved for manual copying only. The draft was NOT sent and no Gmail draft was created.'));
        controls.append(button('Copy approved subject and text',()=>void copyApproved()));
        controls.append(button('Reopen for editing',
          ()=>void save(t,context,q,'draft_prepared')));
      }
      async function copyApproved() {
        if(!active||active.phase!=='approved_for_manual_copy')return;
        const digest=await fingerprint(JSON.stringify([active.subject,active.body]));
        if(digest!==active.draftDigest){
          status.set(t.threadId,'Draft changed since approval. Reopen editing and approve again.');
          onUpdate();return;
        }
        try {
          // Confirm the thread has not changed SINCE approval, right before
          // placing the approved text in the clipboard.
          const query=new URLSearchParams({threadId:t.threadId,lastMessageAt:t.lastMessageAt});
          const current=await getProtected('/api/sms/staging/inbox-thread?'+query);
          if(!current.ok||current.threadId!==t.threadId||
             current.lastMessageAt!==t.lastMessageAt)
            throw new Error('Conversation changed; refresh and re-review.');
          await navigator.clipboard.writeText('Subject: '+active.subject+'\n\n'+active.body);
          status.set(t.threadId,
            'Approved text copied. No email sent. Open the original Gmail thread, verify To/CC and send manually only after your final review.');
        }catch {
          status.set(t.threadId,
            'Copy blocked: clipboard permission or current Gmail verification failed. No email sent.');
        }
        onUpdate();
      }
      controls.append(button('Close review; choose next email',()=>{
        active=null;verified.delete(t.threadId);onUpdate();
      }));
      wrap.append(controls);
      const disabledSend=button('Send email — disabled in staging',()=>{},true);
      disabledSend.setAttribute('aria-label','Sending disabled in Step 47');
      wrap.append(disabledSend);
      wrap.append(makeText('p','hint',
        'This app has no sending endpoint. Approval records only a SHA-256 fingerprint and status, never subject, body or recipient. The original Gmail thread must be checked again for final manual sending.'));
      container.append(wrap);
    }
    return {render,loadAudit,reset,getActive:()=>active};
  }
  return {createController};
});
