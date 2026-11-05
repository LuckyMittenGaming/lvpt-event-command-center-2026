(function(root,factory) {
  const api=factory();
  if(typeof module==='object'&&module.exports) module.exports=api;
  if(root) root.LVPTSMSReconciliation=api;
})(typeof window==='undefined'?null:window,function(){
  'use strict';
  // Matches are explicitly named client references only; venue names are not authoritative IDs.
  const EVENT_IDS={
    'nium':'evt-nium-2026',
    'mosaic-neo':'evt-neo-reunion-2026',
    'lineaje':'evt-lineaje-2026'
  };
  function checkCase(bundle, events){
    const eventId=EVENT_IDS[bundle.eventKey];
    if(!bundle.explicitReference)
      return {state:'unmatched',label:'Identify the client/event',detail:'No unique client identified in the source SMS. Do not link to a venue-based event.'};
    if(!eventId)
      return {state:'unlinked',label:'Named event not yet mapped',detail:'Client was named in SMS, but no verified Command Center ID mapping exists.'};
    const record=(events||[]).find(e=>e.id===eventId);
    if(!record)
      return {state:'unlinked',label:'Event record not found',detail:'This event was not returned by the live Command Center read-only source.'};
    const paymentTopic=bundle.topic.includes('Payments / receivables');
    const finance=bundle.financial;
    if(paymentTopic&&record.ledgerPaidInFull){
      return {state:'ledger-settled',label:'Paid in full in Command Center',
        detail:'Recorded amount paid: '+money(record.recordedAmountPaid)+'. Do not reopen a historical receivable solely from SMS. Verify whether any message concerns a separate invoice.',
        record};
    }
    if(paymentTopic){
      return {state:'verify-payment',label:'Check current payment ledger',
        detail:'Command Center payment status: '+record.paymentStatus+'. Do not infer that an SMS is a cleared payment or outstanding balance.',record};
    }
    if(finance){
      return {state:'verify-finance',label:'Check financial records and payouts',
        detail:'Event payment status: '+record.paymentStatus+'. Owner draws, payouts, vendor costs and reimbursables require a separate ledger/receipt check.',record};
    }
    if(bundle.topic.includes('follow-up')||bundle.topic.includes('Lead')){
      return {state:'check-duplicate',label:'Check CRM and Gmail before creating work',
        detail:'Command Center lists '+record.completedTaskCount+' completed task(s), '+record.openTaskCount+' open task(s) and '+record.recordedGmailActivityCount+' logged email(s). These counts do not prove that this SMS request was resolved.',record};
    }
    return {state:'compare-plan',label:'Compare with current event plan',
      detail:'Current Command Center event status: '+record.eventStatus+'. Check whether the SMS describes an already completed activity.',record};
  }
  function money(value) {
    return typeof value==='number' && Number.isFinite(value)?
      value.toLocaleString('en-US',{style:'currency',currency:'USD'}) : 'unavailable';
  }
  return {checkCase};
});
