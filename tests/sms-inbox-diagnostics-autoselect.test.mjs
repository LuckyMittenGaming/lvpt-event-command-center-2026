import assert from 'node:assert/strict';
import fs from 'node:fs';
import {selectDiagnosticThread,selectDiagnosticThreads} from '../lib/lvpt-diagnostic-selection.mjs';
const now=Date.parse('2026-11-10T15:00:00.000Z');
const at='2026-11-10T14:00:00.000Z';
const mk=(id,props={})=>({
  threadId:id,lastMessageAt:at,lastDirection:'inbound',
  relationshipHint:'unclassified',sourceType:'email_thread',
  needsHumanReview:true,...props
});
const vendor=mk('1111222233334444',{relationshipHint:'vendor'});
const client=mk('aaaabbbbccccdddd');
assert.deepEqual(selectDiagnosticThread([vendor,client],now),{
  threadId:client.threadId,lastMessageAt:at,selectionMode:'automatic_client'
},'Prefer external client inquiry over venue/vendor');
assert.deepEqual(selectDiagnosticThread([vendor],now),{
  threadId:vendor.threadId,lastMessageAt:at,selectionMode:'automatic_vendor'
},'Vendor selection may verify read-only routing and should block send eligibility');
assert.equal(selectDiagnosticThread([mk('eeeeffff00001111',{relationshipHint:'form_lead'})],now),null);
assert.equal(selectDiagnosticThread([mk('eeeeffff00001111',{lastDirection:'outbound'})],now),null);
assert.equal(selectDiagnosticThread([mk('eeeeffff00001111',{needsHumanReview:false})],now),null);
assert.equal(selectDiagnosticThread([mk('eeeeffff00001111',{relationshipHint:'internal'})],now),null);
assert.equal(selectDiagnosticThread([mk('eeeeffff00001111',{sourceType:'form_lead'})],now),null);
assert.equal(selectDiagnosticThread([mk('bad-id')],now),null);
assert.equal(selectDiagnosticThread([mk('abcddcba12344321',{lastMessageAt:'2025-01-01T00:00:00.000Z'})],now),null);
assert.equal(selectDiagnosticThread([mk('abcddcba12344321',{lastMessageAt:'junk'})],now),null);
assert.equal(selectDiagnosticThread([],now),null);
assert.equal(selectDiagnosticThread(null,now),null);
const later=mk('1010101010101010',{lastMessageAt:'2026-11-10T14:15:00.000Z'});
const other=mk('2020202020202020');
const third=mk('3030303030303030');
assert.deepEqual(selectDiagnosticThreads([vendor,client,later,other,third],now)
  .map(t=>t.threadId),[client.threadId,later.threadId,other.threadId],
  'Bounded diagnostic must prefer clients and stop after three');
assert.equal(selectDiagnosticThreads([client,client,client],now).length,1,
  'Duplicate metadata rows must not generate duplicate Gmail reads');
assert.equal(selectDiagnosticThreads([client,other],now,0).length,0,
  'Explicit limit of zero must perform no reads');
assert.equal(selectDiagnosticThreads([client,other],now,20).length,2,
  'Upper limit may never exceed three; two unique rows remain two');

const api=fs.readFileSync('app/api/sms/staging/inbox-diagnostics/route.ts','utf8');
const ddl=fs.readFileSync('docs/staging-migrations/2026-11-10-staging-diagnostics-autoselection.sql','utf8');
const app=fs.readFileSync('public/sms-review/app.js','utf8');
assert.match(api,/import \{ selectDiagnosticThreads \}/);
assert.match(api,/if\(!threadId\)/);
assert.match(api,/selectDiagnosticThreads\(inbox.threads,Date.now\(\),3\)/);
assert.match(api,/selection_mode:selectionMode/);
assert.match(api,/sampled_threads:sampledThreads/);
assert.match(api,/possible_requests:possibleRequests/);
assert.match(api,/no_reply_suggested_count:noReplySuggestedCount/);
assert.match(api,/blocked_recipients:blockedRecipients/);
assert.match(api,/for\(const selected of candidates\)/);
assert.match(api,/if\(outcome==='possible_request'\)/);
assert.match(api,/const rank=outcome==='possible_request'/);
assert.match(api,/if\(rank>bestRank\)/);

assert.match(api,/threadId:selected.threadId/);
assert.match(api,/selectionMode,/);
assert.match(api,/process.env.VERCEL_ENV==='production'/);
assert.match(api,/sendingInvoked:false,gmailWrites:false/);
assert.doesNotMatch(api,/sendOwnerApprovedGmailReply/);
assert.match(ddl,/check\(selection_mode in/);
assert.doesNotMatch(ddl,/recipient(?:_email)? text|thread_id text|email_body text/);
assert.match(app,/Auto-selected incoming correspondence \(read-only\)/);
assert.match(app,/Auto-selected venue\/vendor correspondence \(read-only\)/);
console.log('Read-only diagnostic automatic selection regression tests passed.');
