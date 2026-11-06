const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const drafts=require('../public/sms-review/draft-helper.js');
const now=Date.parse('2026-11-05T23:00:00Z');
const conversation={
  ok:true,recipientEmail:'travis@lithic.com',
  eventKey:'lithic',subject:'Re: New Corporate Poker Builder Lead | Lithic',
  lastMessageAt:'2026-10-20T23:00:00Z',lastDirection:'outbound',partial:false,
  messages:[
    {direction:'inbound',at:'2026-10-17T23:00:00Z',body:'Thanks, please share the proposal when it is ready.'},
    {direction:'outbound',at:'2026-10-20T23:00:00Z',body:'Please take a look at the proposal.'}
  ]
};
const event={eventName:'Lithic Fintech Poker Championship',eventStatus:'Proposal Sent'};
const starter=drafts.buildStarter(conversation,event,now);
assert.equal(starter.ready,true);
assert.equal(starter.to,'travis@lithic.com');
assert.match(starter.subject,/^Re:/);
assert.match(starter.body,/Lithic Fintech Poker Championship/);
assert(!/sent|sendEmail|draft_created/i.test(starter.warning));
const inbound=drafts.buildStarter({...conversation,messages:[
  ...conversation.messages,{direction:'inbound',at:'2026-11-05T21:00:00Z',
    body:'Please confirm what is included in the price?'}
],lastMessageAt:'2026-11-05T21:00:00Z'},event,now);
assert.equal(inbound.body,'','Do not invent answers to inbound client questions');
assert.match(inbound.warning,/specific request/);
const missing=drafts.buildStarter({...conversation,messages:[
 {direction:'inbound',at:'2026-10-19T23:00:00Z',body:''},
 {direction:'outbound',at:'2026-10-20T23:00:00Z',body:''}
]},event,now);
assert.equal(missing.body,'','Blank excerpts must never generate a follow-up');
assert.match(missing.warning,/excerpts are missing/);
const waitingOnLeadership=drafts.buildStarter({...conversation,messages:[
 {direction:'inbound',at:'2026-10-19T23:00:00Z',
  body:'I will get this in front of leadership today and let you know after a decision.'},
 {direction:'outbound',at:'2026-10-20T23:00:00Z',body:'Sounds good, thanks.'}
]},event,now);
assert.equal(waitingOnLeadership.body,'','Leadership review commitment must pause follow-up drafting');
const traveler=drafts.buildStarter({...conversation,messages:[
 {direction:'inbound',at:'2026-10-19T23:00:00Z',
  body:'I am out of town for a few weeks, so you will likely hear back from me when I am back.'},
 {direction:'outbound',at:'2026-10-20T23:00:00Z',body:'Sounds good, thanks.'}
]},event,now);
assert.equal(traveler.body,'','Client travel timing must prevent premature automated follow-up');
const recent=drafts.buildStarter({...conversation,lastMessageAt:'2026-11-04T23:00:00Z',
 messages:[{direction:'outbound',at:'2026-11-04T23:00:00Z',body:'Here is our proposal.'}]},event,now);
assert.equal(recent.body,'','Recent outbound does not justify follow-up');
const ows=drafts.buildStarter({...conversation,eventKey:'ows-aws'},event,now);
assert.equal(ows.body,'','Do not attribute OWS mail to an event when there are two');
assert.match(drafts.previewBody('Recent answer.\n\nOn Fri, Oct 23, 2026 wrote:\nLong quote'),/^Recent answer/);
assert(!drafts.previewBody('Recent answer.\n\nOn Fri, Oct 23, 2026 wrote:\nLong quote').includes('Long quote'));
const repoFile=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const route=repoFile('app/api/sms/staging/draft-context/route.ts');
const app=repoFile('public/sms-review/app.js');
const script=repoFile('apps-script/GmailDraftContext.gs');
const vm=require('node:vm');
const scriptCtx={};vm.runInNewContext(script,scriptCtx);
const extracted=scriptCtx.lvptGmailDraftVisibleBody_(
  'Thanks for the update.\\n\\nOn Fri, Oct 23, 2026, 11:36 AM Travis wrote:\\n'+
    'Old quoted conversation '.repeat(1300));
assert.equal(extracted.body,'Thanks for the update.',
  'Long reply quotes must not consume the authored-message budget');
assert.equal(extracted.truncated,false);
const veryLong=scriptCtx.lvptGmailDraftVisibleBody_('A'.repeat(8500));
assert.equal(veryLong.body.length,1600);
assert.equal(veryLong.truncated,true);
const twelve=Array.from({length:12},(_,i)=>
  scriptCtx.lvptGmailDraftVisibleBody_('Recent message '+i+'\\n\\nOn Oct 12, 2026 wrote:\\n'+'x'.repeat(16000))
);
assert(twelve.every(m=>m.body.startsWith('Recent message')),
  'The most recent of 12 messages must remain available with very long quoted history');
assert(twelve.reduce((sum,m)=>sum+m.body.length,0)<=22000,
  'Twelve authored excerpts must respect bounded source limits');
const code=repoFile('apps-script/Code.gs');
const html=repoFile('public/sms-review/index.html');
assert.match(route,/hasReviewSession\(request\)/);
assert.match(route,/rows\[0\]\.decision!=='draft_requested'/);
assert.match(route,/readGmailDraftContext/);
assert.match(route,/conversation_updated_refresh_approval/);
assert.match(route,/recipientEmail/);
assert.match(script,/users\/me\/profile/,'Verify exact LVPT business mailbox, not personal mailbox');
assert.match(script,/all\.slice\(-12\)/,'Bounded conversation context');
assert.match(script,/gmail\.googleapis\.com/);
assert.match(code,/action === 'readGmailDraftContext'/);
assert.match(code,/function checkLvptFinancialLedgerProtectionNow\(/,
  'The staged Apps Script must retain v0.9 unique financial ID protection');
assert.match(code,/lvptVerifyFinancialLedgerIds_\(\)/,
  'Bulk event save must verify both ledgers before writing');
assert.match(code,/Bulk rewrite blocked for protected financial ledger/,
  'The generic sheet writer must reject Payments and Event Payouts');
const saveSection=code.slice(code.indexOf('function lvptSaveAllEvents_('),
  code.indexOf('function lvptVerifyFinancialLedgerIds_('));
assert(!/lvptWritePaymentsSheet_\(/.test(saveSection),
  'Bulk Save All Events must never rewrite an invoice row');
assert.match(html,/draft-helper\.js/);
assert.match(app,/openApprovedDraftPreview/);
assert.match(app,/navigator\.clipboard\.writeText/);
assert(!/GmailApp\.sendEmail|gmail\.send|sendMail\(|createDraft\(/.test(route+'\n'+script),
  'Draft preview must not send email or create a Gmail draft');
console.log('Approval-gated, no-send draft preview regression tests passed.');
