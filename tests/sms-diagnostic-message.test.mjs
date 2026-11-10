import assert from 'node:assert/strict';
import fs from 'node:fs';
import {authoredText,qualifyDiagnosticPreview} from '../lib/lvpt-diagnostic-message.mjs';

const at='2026-11-10T15:01:02.000Z';
const msg=(excerpt,override={})=>({
  at,direction:'inbound',relationshipHint:'unclassified',
  excerpt,truncated:false,hasAttachments:false,...override
});
const base=(message,extra={})=>({
  lastMessageAt:at,totalMessages:1,partial:false,
  messages:[message],...extra
});
const outcome=(preview,kind)=>qualifyDiagnosticPreview(preview,kind).outcome;
const reason=(preview,kind)=>qualifyDiagnosticPreview(preview,kind).reasonCode;

const kelly=msg([
  'Thank you. This has been submitted.','','From: Las Vegas Poker Training <[email]>',
  'Sent: Tuesday, November 10, 2026',
  'Could you send the PDF invoice?'
].join('\n'));
const longClosed=base(kelly,{totalMessages:32,partial:true});
assert.equal(authoredText(kelly.excerpt),'Thank you. This has been submitted.');
assert.equal(outcome(longClosed),'no_reply_suggested');
assert.equal(reason(longClosed),'acknowledgement');
assert.equal(outcome(base(msg('That works. Thanks!'))),'no_reply_suggested');
assert.equal(outcome(base(msg('We will get back to you after internal review.'))),'no_reply_suggested');
assert.equal(reason(base(msg('We need to share this with leadership and will get back to you.'))),
  'client_reviewing','Internal team timing is not a client request');
assert.equal(outcome(base(msg("We won't be moving forward with the event."))),'no_reply_suggested');
assert.equal(outcome(base(msg("We won't be moving forward today, but can you provide options for March?"))),
  'possible_request');
assert.equal(outcome(base(msg('Could you send pricing for 30 guests?'))),'possible_request');
assert.equal(outcome(base(msg('Please confirm the exact training schedule.'))),'possible_request');
assert.equal(outcome(base(msg('Can you please send an updated invoice?'))),'possible_request');
assert.equal(outcome(base(msg('Could you send pricing?', {hasAttachments:true}))),'needs_review');
assert.equal(reason(base(msg('Could you send pricing?', {truncated:true}))),'latest_message_incomplete');
assert.equal(outcome(base(msg('Could you send pricing?'),{totalMessages:32,partial:true})),
  'needs_review','Long client requests remain manual until full history is verified');
assert.equal(reason(base(msg('Could you send pricing?'),{totalMessages:32,partial:true})),
  'history_incomplete');
assert.equal(outcome(base(msg('That works. Thanks!',{truncated:true}))),
  'needs_review','An excerpt missing its tail cannot safely prove there is no question');
assert.equal(outcome(base(msg('Can you confirm?',{direction:'outbound'}))),
  'no_reply_suggested');
assert.equal(outcome(base(msg('Can you confirm?',{relationshipHint:'vendor'}))),
  'vendor_only');
assert.equal(outcome(base(msg('Can you confirm?')),'vendor'),'vendor_only');
assert.equal(outcome(base(msg('Can you confirm?',{relationshipHint:'internal'}))),
  'no_reply_suggested');
assert.equal(outcome(base(msg('Can you confirm?',{direction:'form_lead'}))),
  'needs_review');
assert.equal(outcome(base(msg(''))),'needs_review');
assert.equal(outcome(base(msg('Hello, just checking in.'))),'needs_review');
assert.equal(outcome(base(msg('Can you send pricing?',{at:'2026-11-09T12:00:00.000Z'}))),
  'needs_review');
const info=qualifyDiagnosticPreview(base(msg('Can you help with an event?')));
assert.equal(info.maySend,false);
assert.equal(info.mayDraft,false);
assert.equal(info.requiresHumanReview,true);

const api=fs.readFileSync('app/api/sms/staging/inbox-diagnostics/route.ts','utf8');
const ddl=fs.readFileSync('docs/staging-migrations/2026-11-10-staging-diagnostic-qualification.sql','utf8');
const app=fs.readFileSync('public/sms-review/app.js','utf8');
const gas=fs.readFileSync('apps-script/release/LVPT_Event_Command_Center_v1_2_COMPLETE_Code.gs','utf8');
assert.match(api,/qualifyDiagnosticPreview/);
assert.match(api,/qualification_outcome:qualificationOutcome/);
assert.match(api,/qualification_reason_code:qualificationReasonCode/);
assert.match(api,/if\(outcome==='possible_request'\)/);
assert.match(api,/recipientStatus='not_selected'/);
assert.match(ddl,/qualification_outcome in/);
assert.match(ddl,/qualification_reason_code in/);
assert.match(app,/Latest message appears to be an acknowledgement/);
assert.match(gas,/all\.slice\(-10\)\.reverse\(\)\.forEach/);
assert.match(gas,/messages\.reverse\(\)/);
assert.match(gas,/the NEWEST message first/);
console.log('Read-only diagnostic outcome tests passed; long thread latest message prioritized.');
