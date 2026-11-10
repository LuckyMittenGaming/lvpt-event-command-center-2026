import assert from 'node:assert/strict';
import fs from 'node:fs';
import {selectDiagnosticThread} from '../lib/lvpt-diagnostic-selection.mjs';
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
const api=fs.readFileSync('app/api/sms/staging/inbox-diagnostics/route.ts','utf8');
const ddl=fs.readFileSync('docs/staging-migrations/2026-11-10-staging-diagnostics-autoselection.sql','utf8');
const app=fs.readFileSync('public/sms-review/app.js','utf8');
assert.match(api,/import \{ selectDiagnosticThread \}/);
assert.match(api,/if\(!selectedThreadId\)/);
assert.match(api,/selectedThreadId=picked.threadId/);
assert.match(api,/selection_mode:selectionMode/);
assert.match(api,/threadId:selectedThreadId/);
assert.match(api,/selectionMode,/);
assert.match(api,/process.env.VERCEL_ENV==='production'/);
assert.match(api,/sendingInvoked:false,gmailWrites:false/);
assert.doesNotMatch(api,/sendOwnerApprovedGmailReply/);
assert.match(ddl,/check\(selection_mode in/);
assert.doesNotMatch(ddl,/recipient(?:_email)? text|thread_id text|email_body text/);
assert.match(app,/Auto-selected incoming correspondence \(read-only\)/);
assert.match(app,/Auto-selected venue\/vendor correspondence \(read-only\)/);
console.log('Read-only diagnostic automatic selection regression tests passed.');
