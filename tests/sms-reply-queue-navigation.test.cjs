'use strict';
// Isolated dashboard navigation simulation. Zero real Gmail/Supabase network calls.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {sameRevision}=require('../public/sms-review/reply-review-controls.js');
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
const code=app.slice(start,end)+'\nthis.queue={orderedInboxCandidates,advanceToNextInboxThread};';
const now=new Date().toISOString();
const mk=(id,minutesAgo)=>({
  threadId:id,lastMessageAt:new Date(Date.now()-minutesAgo*60000).toISOString(),
  needsHumanReview:true,lastDirection:'inbound',
  sourceType:'email_thread',relationshipHint:'unclassified'
});
function harness(rows,options={}) {
  const seen={opened:[],status:[],audits:[],remembered:[],pages:0,render:0,scroll:0};
  const contexts=new Map(rows.map(x=>[x.threadId,{visible:x.threadId===options.current}]));
  const data={connected:true,threads:rows,nextPage:options.nextPage??null};
  const sandbox={
    sessionToken:'owner-session',businessInboxReview:data,
    window:{LVPTReplyReviewControls:{sameRevision}},
    replyController:{rememberAudit:(t,d)=>{seen.remembered.push({id:t.threadId,decision:d.decision});}},
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
      const original=data.threads.find(x=>x.threadId===id);
      return {
        ok:true,source:'append_only_owner_reply_audit',
        lastMessageAt:options.databaseTimestampFormat==='postgres' && original?
          new Date(original.lastMessageAt).toISOString().replace('.000Z','+00:00'):
          original?.lastMessageAt,
        decision:options.denied?.includes(id)?'denied':null
      };
    },
    loadBusinessInboxThread:async t=>{
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
  new vm.Script(code,{filename:'lvpt-inbox-queue.js'}).runInContext(ctx,{timeout:1000});
  return {queue:ctx.queue,seen,contexts,data};
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
  // Audit failure is fail-closed: do not open or send anything.
  h=harness([a,b],{current:a.threadId,failAudit:b.threadId});
  await h.queue.advanceToNextInboxThread(a.threadId);
  assert.deepEqual(h.seen.opened,[]);
  assert.match(h.seen.status.at(-1),/Review paused/);
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
  assert.doesNotMatch(code,/GmailApp.sendEmail|sendOwnerApprovedGmailReply|messages\/send/);
  console.log('Step 56 queue navigation: wrap-around, collapse, complete, skip-denied, next-page, fail-closed and eligibility checks passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
