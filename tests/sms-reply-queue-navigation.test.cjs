'use strict';
// Isolated dashboard navigation simulation. Zero real Gmail/Supabase network calls.
// No private message bodies are persisted; decisions are synthetic audit metadata only.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {sameRevision}=require('../public/sms-review/reply-review-controls.js');
const {
  buildQueue,sourceFingerprint,decisionApplies,isPausedByDecision,
  partitionQueueItems,TERMINAL_ACTION_DECISIONS
}=require('../public/sms-review/action-queue.js');
const app=fs.readFileSync('public/sms-review/app.js','utf8');
const html=fs.readFileSync('public/sms-review/index.html','utf8');
const start=app.indexOf('  function orderedInboxCandidates(');
const end=app.indexOf('\n  async function loadBusinessInboxThread(t) {',start);
assert(start>=0&&end>start,'Inbox navigation implementation not found');
assert.match(html,/id="businessInboxQueueStatus"/);
const route=fs.readFileSync('app/api/sms/staging/reply-decisions/route.ts','utf8');
assert.match(route,/new Date\(row.last_message_at\)\.toISOString\(\)/,
  'Server must normalize audit timestamps to canonical UTC');
assert.match(html,/id="continueBusinessInboxQueue"/);
assert.match(app,/Dismissed by owner — no reply needed/,
  'Denied emails should not remain labeled as new potential inquiries');
assert.match(app,/\$\('continueBusinessInboxQueue'\)\.addEventListener\('click'/,
  'Owner can explicitly resume the queue after a browser refresh');
assert.match(app,/Boolean\(replyController\.getActive\(\)\)/,
  'An active owner draft must prevent advancing to another email');
assert.match(app,/if\(replyController\.getActive\(\)\)/,
  'advanceToNextInboxThread itself must refuse while a draft lock is held');
assert.match(app,/partitionQueueItems\(/,
  'Action Required must use durable queue ownership partitioning');
assert.match(app,/isPausedByDecision\(/,
  'Paused Action Required items must use fingerprint-bound terminal decisions');
const code=app.slice(start,end)+'\nthis.queue={orderedInboxCandidates,advanceToNextInboxThread};';
const mk=(id,minutesAgo)=>({
  threadId:id,lastMessageAt:new Date(Date.now()-minutesAgo*60000).toISOString(),
  needsHumanReview:true,lastDirection:'inbound',
  sourceType:'email_thread',relationshipHint:'unclassified'
});
function harness(rows,options={}) {
  const seen={opened:[],status:[],audits:[],remembered:[],pages:0,render:0,scroll:0};
  const contexts=new Map(rows.map(x=>[x.threadId,{visible:x.threadId===options.current}]));
  const data={connected:true,threads:rows,nextPage:options.nextPage??null};
  const durable=options.durableDecisions instanceof Map?options.durableDecisions:
    new Map(Object.entries(options.durableDecisions||{}));
  for(const id of options.denied||[]) {
    if(!durable.has(id))durable.set(id,{decision:'denied'});
  }
  let activeLock=options.activeLock===true?{threadId:options.current||'active-lock'}:null;
  const sandbox={
    sessionToken:'owner-session',businessInboxReview:data,
    window:{LVPTReplyReviewControls:{sameRevision}},
    replyController:{
      getActive:()=>activeLock,
      rememberAudit:(t,d)=>{seen.remembered.push({id:t.threadId,decision:d.decision});},
      handledThisSession:t=>options.handled?.includes(t.threadId)?'copied_not_sent':null
    },
    replyQualifier:{qualifyThread:t=>({
      outcome:options.qualifications?.[t.threadId]||'reply_candidate'
    })},
    businessInboxThreadContext:contexts,businessInboxError:'',
    inboxQueueBusy:false,
    renderBusinessInboxReview:()=>{seen.render++;},
    showInboxQueueStatus:s=>seen.status.push(s),
    getProtected:async url=>{
      const id=decodeURIComponent(url.split('threadId=')[1]||'');
      seen.audits.push(id);
      if(options.failAudit===id)throw Error('Mock audit unavailable');
      if(typeof options.auditDelayMs==='number'&&options.auditDelayMs>0)
        await new Promise(resolve=>setTimeout(resolve,options.auditDelayMs));
      const original=data.threads.find(x=>x.threadId===id);
      const durableRow=durable.get(id);
      const decision=durableRow?.decision??
        (options.denied?.includes(id)?'denied':null);
      return {
        ok:true,source:'append_only_owner_reply_audit',
        lastMessageAt:options.databaseTimestampFormat==='postgres' && original?
          new Date(original.lastMessageAt).toISOString().replace('.000Z','+00:00'):
          (durableRow?.lastMessageAt||original?.lastMessageAt),
        decision
      };
    },
    loadBusinessInboxThread:async t=>{
      if(options.openDelayMs)
        await new Promise(resolve=>setTimeout(resolve,options.openDelayMs));
      seen.opened.push(t.threadId);
      contexts.set(t.threadId,{visible:true});
    },
    loadBusinessInboxReview:async append=>{
      assert.equal(append,true);
      seen.pages++;
      const added=options.additionalRows||[];
      data.threads.push(...added);
      data.nextPage=null;
    },
    $:()=>({scrollIntoView:()=>{seen.scroll++;}}),
  };
  const ctx=vm.createContext(sandbox);
  new vm.Script(code,{filename:'lvpt-inbox-queue.js'}).runInContext(ctx,{timeout:5000});
  return {
    queue:ctx.queue,seen,contexts,data,durable,
    setActive(value){activeLock=value;},
    getBusy:()=>ctx.inboxQueueBusy
  };
}
(async()=>{
  // Older candidate is next after the selected thread in date order.
  const a=mk('aaaaaaaaaaaaaaaa',5),b=mk('bbbbbbbbbbbbbbbb',10),c=mk('cccccccccccccccc',15);
  let h=harness([a,b,c],{current:b.threadId});
  await h.queue.advanceToNextInboxThread(b.threadId);
  assert.deepEqual(h.seen.opened,[c.threadId]);
  assert.equal(h.contexts.get(b.threadId).visible,false,'Dismissed conversation must collapse');
  // When the selected thread was last, wrap to the newest eligible thread.
  h=harness([a,b,c],{current:c.threadId});
  await h.queue.advanceToNextInboxThread(c.threadId);
  assert.deepEqual(h.seen.opened,[a.threadId]);
  // After refresh, resume from the first eligible unreviewed email.
  h=harness([a,b,c],{current:a.threadId,denied:[a.threadId]});
  await h.queue.advanceToNextInboxThread(null);
  assert.deepEqual(h.seen.opened,[b.threadId]);
  assert.equal(h.contexts.get(a.threadId).visible,false,
    'Resuming should collapse an old denied preview');
  // Real PostgreSQL timestamptz uses +00:00; Gmail uses .000Z.
  assert.equal(sameRevision('2026-11-10T17:10:47+00:00',
    '2026-11-10T17:10:47.000Z'),true);
  assert.equal(sameRevision('2026-11-10T17:10:48+00:00',
    '2026-11-10T17:10:47.000Z'),false);
  h=harness([a,b],{current:b.threadId,denied:[a.threadId],databaseTimestampFormat:'postgres'});
  await h.queue.advanceToNextInboxThread(null);
  assert.deepEqual(h.seen.opened,[b.threadId],
    'A previously denied email must remain excluded despite timestamp formatting');
  // When current thread was the only one, do not leave it expanded or imply all Gmail is clear.
  h=harness([a],{current:a.threadId});
  await h.queue.advanceToNextInboxThread(a.threadId);
  assert.deepEqual(h.seen.opened,[]);
  assert.equal(h.contexts.get(a.threadId).visible,false);
  assert.match(h.seen.status.at(-1),/No further potential reply found/);
  assert.match(h.seen.status.at(-1),/entire mailbox/);
  // Skip an earlier denied revision but continue to another unreviewed candidate.
  h=harness([a,b,c],{current:a.threadId,denied:[b.threadId]});
  await h.queue.advanceToNextInboxThread(a.threadId);
  assert.deepEqual(h.seen.opened,[c.threadId]);
  assert.deepEqual(h.seen.audits,[b.threadId,c.threadId]);
  // An additional metadata page is loaded automatically if first page has no options.
  h=harness([a],{current:a.threadId,nextPage:1,additionalRows:[b]});
  await h.queue.advanceToNextInboxThread(a.threadId);
  assert.equal(h.seen.pages,1);
  assert.deepEqual(h.seen.opened,[b.threadId]);
  // A courtesy-only email is not another sales reply action: skip it
  // automatically, but preserve the underlying event opportunity.
  h=harness([a,b,c],{current:c.threadId,
    qualifications:{[a.threadId]:'monitor',[b.threadId]:'reply_candidate'}});
  await h.queue.advanceToNextInboxThread(c.threadId);
  assert.deepEqual(h.seen.opened,[a.threadId,b.threadId]);
  assert.equal(h.contexts.get(a.threadId).visible,false,
    'Courtesy-only email preview must collapse as the queue continues');
  assert.match(h.seen.status.at(-1),/Next potential inquiry opened/);
  h=harness([a],{current:a.threadId,
    qualifications:{[a.threadId]:'monitor'}});
  await h.queue.advanceToNextInboxThread(null);
  assert.deepEqual(h.seen.opened,[a.threadId]);
  assert.equal(h.contexts.get(a.threadId).visible,false);
  assert.match(h.seen.status.at(-1),/non-reply messages skipped/);
  // A Bizly form lead remains visible for CRM intake, but can never
  // silently become a direct reply to the platform mailbox.
  h=harness([a,{...b,relationshipHint:'form_notification'},c],{
    current:a.threadId,qualifications:{[b.threadId]:'form_notification'}
  });
  await h.queue.advanceToNextInboxThread(a.threadId);
  assert.deepEqual(h.seen.opened,[b.threadId],
    'Third-party form inquiries must remain in manual lead intake');
  assert.equal(h.contexts.get(b.threadId).visible,true);
  h=harness([a,b,c],{current:a.threadId,handled:[b.threadId]});
  await h.queue.advanceToNextInboxThread(a.threadId);
  assert.deepEqual(h.seen.opened,[c.threadId],
    'A just-copied (not sent) email must not reappear in this session');
  // Audit failure is fail-closed: do not open or send anything.
  h=harness([a,b],{current:a.threadId,failAudit:b.threadId});
  await h.queue.advanceToNextInboxThread(a.threadId);
  assert.deepEqual(h.seen.opened,[]);
  assert.match(h.seen.status.at(-1),/Review paused/);
  assert.equal(h.contexts.get(b.threadId)?.visible,false,
    'A failed decision read must not mark the unresolved item as reviewed');
  // Verified talent must not enter the prospect reply queue.
  h=harness([a,{...b,relationshipHint:'talent'},c],{current:a.threadId});
  await h.queue.advanceToNextInboxThread(a.threadId);
  assert.deepEqual(h.seen.opened,[c.threadId]);
  // Never select vendor, internal, form, outgoing or no-review metadata.
  h=harness([a,{...b,relationshipHint:'vendor'},{...c,lastDirection:'outbound'}],
    {current:a.threadId});
  await h.queue.advanceToNextInboxThread(a.threadId);
  assert.deepEqual(h.seen.opened,[]);
  assert.match(app,/Checking the next eligible LVPT conversation/);
  assert.doesNotMatch(code,/GmailApp\.sendEmail|sendOwnerApprovedGmailReply|messages\/send/);

  // --- R12/T23 durable one-at-a-time queue advancement ---
  // Active draft lock blocks advancement entirely (one item at a time).
  h=harness([a,b,c],{current:a.threadId,activeLock:true});
  await h.queue.advanceToNextInboxThread(a.threadId);
  assert.deepEqual(h.seen.opened,[],
    'An active draft must block queue advancement to another email');
  assert.match(h.seen.status.at(-1),/Finish or close the current draft/);

  // Concurrent / duplicate advance calls open exactly one next item.
  h=harness([a,b,c],{current:a.threadId,openDelayMs:40});
  const first=h.queue.advanceToNextInboxThread(a.threadId);
  const duplicate=h.queue.advanceToNextInboxThread(a.threadId);
  await Promise.all([first,duplicate]);
  assert.deepEqual(h.seen.opened,[b.threadId],
    'Duplicate/concurrent advance must open the next item exactly once');
  assert.equal(h.getBusy(),false,'Busy lock must clear after exactly-once advancement');

  // Synthetic persistence across refresh/restart: accepted denial stays
  // excluded; unresolved peers remain eligible. No message bodies stored.
  const durableStore=new Map([
    [a.threadId,{decision:'denied',lastMessageAt:a.lastMessageAt}]
  ]);
  const beforeRefresh=harness([a,b,c],{
    current:a.threadId,durableDecisions:durableStore
  });
  await beforeRefresh.queue.advanceToNextInboxThread(a.threadId);
  assert.deepEqual(beforeRefresh.seen.opened,[b.threadId],
    'Terminal durable denial advances once to the next unresolved item');
  // Simulate browser refresh: new in-memory controller, same synthetic audit.
  const afterRefresh=harness([a,b,c],{
    current:null,durableDecisions:durableStore
  });
  await afterRefresh.queue.advanceToNextInboxThread(null);
  assert.deepEqual(afterRefresh.seen.opened,[b.threadId],
    'Refresh must restore the accepted denial and reopen the unresolved item');
  assert.equal(afterRefresh.seen.opened.includes(a.threadId),false,
    'Refresh must not reopen a durably denied revision');
  assert.equal(afterRefresh.seen.opened.includes(c.threadId),false,
    'Exactly one unresolved item is actively reviewed after refresh resume');

  // Duplicate decision for the same denied revision never reopens it.
  const dupDecision=harness([a,b,c],{
    current:b.threadId,
    durableDecisions:new Map([
      [a.threadId,{decision:'denied',lastMessageAt:a.lastMessageAt}],
      [b.threadId,{decision:'denied',lastMessageAt:b.lastMessageAt}]
    ])
  });
  await dupDecision.queue.advanceToNextInboxThread(b.threadId);
  assert.deepEqual(dupDecision.seen.opened,[c.threadId],
    'Duplicate terminal decisions must skip both resolved revisions exactly once');
  await dupDecision.queue.advanceToNextInboxThread(c.threadId);
  assert.deepEqual(dupDecision.seen.opened,[c.threadId],
    'A second advance after the last unresolved item must not reopen resolved ones');

  // Failed decision read cannot falsely resolve or skip remaining unresolved work.
  const failedDecision=harness([a,b,c],{current:a.threadId,failAudit:b.threadId});
  await failedDecision.queue.advanceToNextInboxThread(a.threadId);
  assert.deepEqual(failedDecision.seen.opened,[],
    'Decision failure must pause without opening a later item');
  assert.equal(failedDecision.seen.audits.includes(c.threadId),false,
    'Decision failure must not skip ahead past the failed unresolved item');
  assert.match(failedDecision.seen.status.at(-1),/Review paused/);

  // Action Required durable ownership: terminal decisions pause only matching
  // fingerprints; unresolved and mismatched items stay active after "refresh".
  assert.deepEqual([...TERMINAL_ACTION_DECISIONS].sort(),['dismissed','hold']);
  const actionNow=Date.parse('2026-11-05T20:00:00Z');
  const actionQueue=buildQueue({
    events:[
      {id:'evt-nium-2026',eventName:'NIUM',eventStatus:'Completed'},
      {id:'evt-neo-reunion-2026',eventName:'NEO Reunion',eventStatus:'Completed'}
    ],
    paymentsConnected:true,
    payments:[
      {paymentId:'decks',eventId:'evt-nium-2026',invoiceNumber:'DECKS',
        invoiceTotal:1353.39,amountPaid:0,balanceDue:1353.39,
        paymentStatus:'Payment Initiated'},
      {paymentId:'elevated',eventId:'evt-nium-2026',invoiceNumber:'#167',
        invoiceTotal:4120.20,amountPaid:4120.20,balanceDue:0,
        paymentStatus:'Payment Initiated'}
    ],
    payoutsConnected:true,
    payouts:[
      {payoutId:'planned',eventId:'evt-neo-reunion-2026',payee:'Owner B',
        amount:6233.28,status:'Planned'}
    ],
    gmail:[]
  },actionNow);
  const decks=actionQueue.items.find(x=>x.id==='payment:decks');
  const elevated=actionQueue.items.find(x=>x.id==='payment:elevated');
  const planned=actionQueue.items.find(x=>x.id==='payout:planned');
  assert(decks&&elevated&&planned,'Expected synthetic Action Required fixtures');
  const acceptedHold={
    actionKey:decks.id,decision:'hold',
    sourceFingerprint:sourceFingerprint(decks)
  };
  const staleDismissed={
    actionKey:elevated.id,decision:'dismissed',
    sourceFingerprint:'deadbeefdeadbeef'
  };
  assert.equal(isPausedByDecision(decks,acceptedHold),true);
  assert.equal(decisionApplies(elevated,staleDismissed),false);
  assert.equal(isPausedByDecision(elevated,staleDismissed),false,
    'Failed/mismatched decisions must not falsely resolve an item');
  const restored=partitionQueueItems(actionQueue.items,new Map([
    [decks.id,acceptedHold],
    [elevated.id,staleDismissed]
  ]));
  assert.equal(restored.pausedCount,1);
  assert.equal(restored.active.some(x=>x.id===decks.id),false,
    'Refresh must preserve an accepted isolated hold decision');
  assert.equal(restored.active.some(x=>x.id===elevated.id),true,
    'Unresolved item with a failed decision fingerprint remains active');
  assert.equal(restored.active.some(x=>x.id===planned.id),true,
    'Items without a recorded decision remain unresolved after refresh');
  assert.equal(restored.background.some(x=>x.id===decks.id),true);

  console.log('Step 56 / R12 T23 queue navigation: wrap-around, collapse, complete, skip-denied, next-page, fail-closed, exactly-once, durable refresh and Action Required ownership checks passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
