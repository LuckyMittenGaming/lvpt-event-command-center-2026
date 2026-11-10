import assert from 'node:assert/strict';
import fs from 'node:fs';
import {selectDiagnosticNegativeControl,selectDiagnosticThreads} from '../lib/lvpt-diagnostic-selection.mjs';
import {qualifyDiagnosticPreview} from '../lib/lvpt-diagnostic-message.mjs';

const at='2026-11-10T16:00:00.000Z';
const now=Date.parse('2026-11-10T17:00:00.000Z');
const outbound={
  threadId:'aabbccddeeff0011',lastMessageAt:at,
  relationshipHint:'outbound',lastDirection:'outbound',
  needsHumanReview:false,sourceType:'email_thread'
};
const inbound={
  ...outbound,threadId:'1122334455667788',
  relationshipHint:'unclassified',lastDirection:'inbound',
  needsHumanReview:true
};
assert.deepEqual(selectDiagnosticNegativeControl([outbound],now),{
  threadId:outbound.threadId,lastMessageAt:at,selectionMode:'negative_outbound'
});
assert.equal(selectDiagnosticNegativeControl([inbound],now),null,
  'Never mistake an inbound inquiry for a negative control');
assert.equal(selectDiagnosticNegativeControl([{...outbound,sourceType:'form_lead'}],now),null);
assert.equal(selectDiagnosticNegativeControl([{...outbound,lastDirection:'unknown'}],now),null);
assert.equal(selectDiagnosticNegativeControl([{...outbound,relationshipHint:'internal'}],now),null);
assert.equal(selectDiagnosticNegativeControl([{...outbound,threadId:'bad'}],now),null);
assert.equal(selectDiagnosticNegativeControl([{...outbound,lastMessageAt:'2020-01-01T00:00:00.000Z'}],now),null);
assert.equal(selectDiagnosticNegativeControl(null,now),null);
assert.equal(selectDiagnosticThreads([outbound],now).length,0,
  'The negative-control email must never enter the client reply candidate list');
const q=qualifyDiagnosticPreview({
  lastMessageAt:at,totalMessages:1,partial:false,
  messages:[{
    at,direction:'outbound',relationshipHint:'outbound',
    excerpt:'Thanks, we will send details shortly.',
    truncated:false,hasAttachments:false
  }]
});
assert.equal(q.outcome,'no_reply_suggested');
assert.equal(q.reasonCode,'lvpt_replied_last');
assert.equal(q.maySend,false);
assert.equal(q.mayDraft,false);

const route=fs.readFileSync('app/api/sms/staging/inbox-diagnostics/route.ts','utf8');
const ddl=fs.readFileSync('docs/staging-migrations/2026-11-10-staging-negative-recipient-canary.sql','utf8');
const app=fs.readFileSync('public/sms-review/app.js','utf8');
assert.match(route,/candidates.length===0/);
assert.match(route,/selectDiagnosticNegativeControl\(inbox.threads\)/);
assert.match(route,/selected.selectionMode==='negative_outbound'/);
assert.match(route,/outcome==='no_reply_suggested'&&reason==='lvpt_replied_last'/);
assert.match(route,/error==='Not a complete verified external client request'/);
assert.match(route,/negative_control_status:negativeControlStatus/);
assert.match(route,/negativeControlStatus/);
assert.match(route,/sendingInvoked:false,gmailWrites:false/);
assert.doesNotMatch(route,/sendOwnerApprovedGmailReply|messages\/send|GmailApp\.sendEmail/i);
assert.match(ddl,/negative_control_status in \('not_checked','passed','failed'\)/);
assert.match(ddl,/negative_outbound/);
assert.doesNotMatch(ddl,/recipient\s+text|subject\s+text|email_body\s+text/i);
assert.match(app,/Already-answered conversation chosen as a negative-control safety test/);
assert.match(app,/Negative-control safety test:/);
console.log('Read-only negative-control canary never produces a reply or sends email; regression checks passed.');
