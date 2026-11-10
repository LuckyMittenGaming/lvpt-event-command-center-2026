(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.LVPTReplyReviewControls=api;
})(typeof window==='undefined'?null:window,function(){
  'use strict';
  // All email prose remains only in this browser's memory. The separate
  // audit contains statuses and an opaque digest, never recipients or bodies.
  function createController({getProtected,makeText,qualification,workflow,onUpdate,onNext}) {
    const audits=new Map(),verified=new Map();
    const recipients=new Map(),sendRecords=new Map();
    const status=new Map();
    let active=null,working='';
    function reset() {
      audits.clear();verified.clear();recipients.clear();sendRecords.clear();
      status.clear();active=null;working='';
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
            decision,draftDigest,requestId:window.crypto.randomUUID(),
            ownerReviewedOriginal:verified.get(t.threadId)===t.lastMessageAt
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
          recipients.delete(t.threadId);
          const draft=active&&active.threadId===t.threadId?
            active:workflow.draftStarter(t);
          active={
            ...draft,threadId:t.threadId,lastMessageAt:t.lastMessageAt,
            phase:'prepared',draftDigest:'',verified:true
          };
        }else if(decision==='approved_for_manual_copy') {
          active={...active,phase:'approved_for_manual_copy',draftDigest};
        }else if(decision==='denied') {
          recipients.delete(t.threadId);active=null;
        }
        return true;
      }catch(error) {
        status.set(t.threadId,'Decision NOT saved: '+
          (error instanceof Error?error.message:'Protected audit error')+
          '. No email was sent.');
        return false;
      }finally {working='';onUpdate();}
    }
    async function verifySendReadiness(t) {
      if(working||!active||active.phase!=='approved_for_manual_copy'||
         active.threadId!==t.threadId)return;
      working=t.threadId;onUpdate();
      try {
        const p=new URLSearchParams({
          threadId:t.threadId,lastMessageAt:t.lastMessageAt
        });
        const recipient=await getProtected('/api/sms/staging/reply-recipient?'+p);
        if(!recipient.ok||recipient.source!=='owner_selected_verified_recipient'||
           recipient.threadId!==t.threadId||
           recipient.lastMessageAt!==t.lastMessageAt||
           !recipient.to)throw Error('Gmail recipient could not be verified');
        const record=await getProtected('/api/sms/staging/reply-send?'+p);
        if(!record.ok||record.source!=='lvpt_deduplicated_send_status')
          throw Error('Send history was unavailable');
        recipients.set(t.threadId,recipient);
        sendRecords.set(t.threadId,record);
        status.set(t.threadId,record.doNotRetry?
          'This Gmail message has a recorded send attempt ('+
          record.status+'). Do not retry. Inspect Sent mail.':
          recipient.sendEnabled?
            'Verified business Gmail recipient. Review the address below and explicitly confirm before sending.':
            'Verified recipient. Live sending remains disabled until both owner-controlled switches are enabled.');
      }catch {
        recipients.delete(t.threadId);
        status.set(t.threadId,
          'Recipient or send-status verification unavailable. No send is possible. Ensure the new GAS is deployed.');
      }finally {working='';onUpdate();}
    }

    async function sendApproved(t,ownerReviewed,confirmation) {
      if(working||!active||active.threadId!==t.threadId||
         active.phase!=='approved_for_manual_copy')return;
      const recipient=recipients.get(t.threadId);
      const record=sendRecords.get(t.threadId);
      if(!recipient?.sendEnabled||record?.doNotRetry||
         record?.status!=='not_attempted'||ownerReviewed!==true||
         confirmation!=='SEND THIS EMAIL')return;
      const exact=await fingerprint(JSON.stringify([active.subject,active.body]));
      if(exact!==active.draftDigest) {
        status.set(t.threadId,'Content changed since owner approval. Reapprove before sending.');
        onUpdate();return;
      }
      working=t.threadId;onUpdate();
      try {
        const sent=await getProtected('/api/sms/staging/reply-send',{
          body:{
            intentId:window.crypto.randomUUID(),threadId:t.threadId,
            lastMessageAt:t.lastMessageAt,recipient:recipient.to,
            subject:active.subject,body:active.body,
            confirmation:'SEND THIS EMAIL',ownerReviewed:true
          }
        });
        if(!sent.ok||sent.sent!==true||!sent.gmailMessageId)
          throw Error('Gmail did not confirm the send');
        active={...active,phase:'sent'};
        sendRecords.set(t.threadId,{
          status:'sent',doNotRetry:true,gmailMessageId:sent.gmailMessageId
        });
        status.set(t.threadId,'Gmail confirmed this email was sent. Message ID: '+
          sent.gmailMessageId+'. No duplicate send is permitted.');
      }catch {
        // A network failure may occur AFTER Gmail sends. Never offer an
        // automatic retry; the persistent send reservation also blocks it.
        sendRecords.set(t.threadId,{
          status:'uncertain',doNotRetry:true
        });
        status.set(t.threadId,
          'Send result uncertain or blocked. STOP: inspect Gmail Sent and the send audit before any further action. Never retry automatically.');
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
        if(context.partial===true||
           context.messages.length<Number(context.totalMessages||0))
          wrap.append(makeText('p','case-alert',
            'Older emails are omitted from this preview. You MUST review the complete original thread in Gmail before authorizing any draft.'));
        const check=document.createElement('input');
        check.type='checkbox';check.id='verify-reply-'+t.threadId;
        check.checked=verified.get(t.threadId)===t.lastMessageAt;
        const label=makeText('label','reply-verification','');
        label.setAttribute('for',check.id);
        label.append(check,document.createTextNode(
          ' I checked the COMPLETE original Gmail conversation (including any omitted older emails), CRM and event notes. The latest client question remains unanswered.'));
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
          'Approved copy is locked. Recipient verification and a second explicit send authorization are required.';
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
      }else if(active.phase==='approved_for_manual_copy') {
        wrap.append(makeText('p','action-draft-status',
          'Approved text is locked. No email has been sent by this review step.'));
        controls.append(button('Copy approved subject and text',()=>void copyApproved()));
        controls.append(button('Reopen for editing',
          ()=>void save(t,context,q,'draft_prepared')));
        const read=recipients.get(t.threadId);
        const record=sendRecords.get(t.threadId);
        controls.append(button('Verify recipient and send status (read-only)',
          ()=>void verifySendReadiness(t)));
        if(read) {
          wrap.append(makeText('p','action-draft-meta',
            'Gmail verified sender: '+read.from+' · Recipient: '+read.to));
          if(read.subject)
            wrap.append(makeText('p','action-draft-meta',
              'Verified Gmail thread subject: '+read.subject));
          if(read.fullHistoryRequiresOwnerReview===true)
            wrap.append(makeText('p','case-alert',
              'LONG THREAD: Earlier emails are omitted from the preview. This recipient verification does not replace your attested complete Gmail and CRM review.'));
          wrap.append(makeText('p','hint',
            'Check recipient and content in the original Gmail conversation. No CC or BCC is added.'));
        }
        if(record?.doNotRetry) {
          wrap.append(makeText('p','case-alert',
            'Send intent '+record.status+'. Check Gmail Sent. Duplicate sending is blocked.'));
        }else if(read?.sendEnabled && record?.status==='not_attempted') {
          const reviewBox=document.createElement('input');
          reviewBox.type='checkbox';
          reviewBox.id='step48-send-confirm-'+t.threadId;
          const label=makeText('label','reply-verification','');
          label.setAttribute('for',reviewBox.id);
          label.append(reviewBox,document.createTextNode(
            ' I verified the actual recipient, full reply text, and event facts. I authorize sending THIS email now.'));
          wrap.append(label);
          const phrase=document.createElement('input');
          phrase.type='text';phrase.maxLength=40;
          phrase.placeholder='Type SEND THIS EMAIL';
          phrase.setAttribute('aria-label','Step 48 explicit send confirmation');
          wrap.append(phrase);
          const send=button('Send this approved reply',
            ()=>void sendApproved(t,reviewBox.checked,phrase.value),true,'primary');
          const update=()=>{
            send.disabled=!reviewBox.checked||phrase.value!=='SEND THIS EMAIL';
          };
          reviewBox.addEventListener('change',update);
          phrase.addEventListener('input',update);
          wrap.append(send);
        }else {
          wrap.append(makeText('p','hint',
            'Verified Gmail sending is OFF until both Vercel and Apps Script opt-in switches are enabled. Manual copying is still available.'));
        }
      }else if(active.phase==='sent') {
        wrap.append(makeText('p','action-draft-status',
          'Sent — Gmail message confirmed. Close this review to move on to the next conversation.'));
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
        // This is a user-clicked read-only transition to the next candidate.
        // No email is sent, queued, drafted, or scheduled automatically.
        if(typeof onNext==='function')onNext(t.threadId);
      }));
      wrap.append(controls);
      const read=recipients.get(t.threadId);
      if(!read?.sendEnabled) {
        const disabledSend=button('Send email — disabled in staging',()=>{},true);
        disabledSend.setAttribute('aria-label','Sending requires two disabled-by-default gates');
        wrap.append(disabledSend);
      }
      wrap.append(makeText('p','hint',
        'Step 48: Sending requires a verified Gmail recipient, a matching owner-approved text digest, explicit confirmation, two owner-controlled switches and a unique send reservation. All are OFF by default. Never retry an uncertain send.'));
      container.append(wrap);
    }
    return {render,loadAudit,reset,getActive:()=>active};
  }
  return {createController};
});
