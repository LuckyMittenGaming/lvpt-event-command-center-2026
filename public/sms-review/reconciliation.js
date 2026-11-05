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
  // Recommended attention order only. These labels never mutate a task, payment
  // or saved review decision. A paid-in-full client payment says nothing about
  // a separate vendor invoice or an owner's distribution.
  function prioritizeCase(bundle, events, decision, sourceConnected, newSources = false) {
    if(newSources) return {
      group:'review-first',rank:0,label:'New SMS — recheck case',
      explanation:'This review bundle has a different number of source SMS since its saved decision. The existing decision was preserved, but the case needs a fresh look.'
    };
    const reviewedStatus=String(decision && decision.status || 'Unreviewed');
    const isManuallyClosed=reviewedStatus==='Reviewed — no action';
    const check=sourceConnected ? checkCase(bundle,events) : null;
    const hasManualConcern=reviewedStatus==='Needs verification' ||
      reviewedStatus==='Investigating' ||
      reviewedStatus==='Candidate for reconciliation';
    if (isManuallyClosed) return {
      group:'reviewed',rank:4,label:'Reviewed — no action',
      explanation:'A human reviewer previously marked this bundle as no action. Recheck if new SMS sources are added.'
    };
    if (hasManualConcern) return {
      group:'review-first',rank:0,label:'Your open review',
      explanation:'Previously flagged by a reviewer. Keep it visible even when the client invoice is marked paid.'
    };
    if (!sourceConnected) return {
      group:'unverified',rank:2,label:'Comparison unavailable',
      explanation:'Live Command Center records were not connected. Do not assume payment or task status.'
    };
    if (check.state==='ledger-settled') return {
      group:'likely-resolved',rank:3,label:'Historical payment — likely settled',
      explanation:'The linked client invoice is marked Paid In Full. Check whether the SMS mentions a separate invoice before closing.'
    };
    if (check.state==='verify-payment') return {
      group:'review-first',rank:0,label:'Payment discrepancy to verify',
      explanation:'Compare this message with the current invoice and bank evidence; do not assume it is unpaid.'
    };
    if (check.state==='verify-finance') return {
      group:'review-first',rank:0,label:'Financial detail to verify',
      explanation:'A vendor expense or owner distribution needs its own payout/receipt check, separate from client payment status.'
    };
    if (check.state==='check-duplicate') return {
      group:'review-first',rank:1,label:'Check before contacting',
      explanation:'Compare current Gmail and task records to avoid duplicating client follow-up.'
    };
    // Potentially convertible leads and follow-ups should not disappear just
    // because a prior event ID has not yet been mapped in the Command Center.
    const isSales=bundle.explicitReference &&
      /lead|proposal|follow[- ]?up/i.test(bundle.topic||'');
    if(isSales) return {
      group:'review-first',rank:1,label:'Potential client opportunity — check history',
      explanation:'Look for an existing CRM lead and current Gmail thread before contacting anyone. Historical SMS does not prove this opportunity is still active.'
    };
    const hasFinancialClaim=bundle.explicitReference && bundle.financial &&
      (bundle.findings||[]).some(f=>f.financialSignal==='historical_claim_unverified');
    if(check.state==='unlinked' && hasFinancialClaim) return {
      group:'review-first',rank:1,label:'Financial claim — event link missing',
      explanation:'Source SMS contains financial language, but no verified event ID is mapped. Identify the event and current ledger before taking action.'
    };
    if (check.state==='unlinked'||check.state==='unmatched') return {
      group:'unverified',rank:2,label:'Event identity unverified',
      explanation:'No confirmed event record is linked. Identify the client before taking action.'
    };
    return {
      group:'unverified',rank:2,label:'Compare with event plan',
      explanation:'A historical conversation needs review against the current event record.'
    };
  }

  return {checkCase, prioritizeCase};
});
