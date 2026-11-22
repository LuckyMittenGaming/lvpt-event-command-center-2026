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
const namedThanks=[
  'Thank you Alex for the intro and Thank you Sam for the email.',
  '',
  'Taylor Smith',
  'Travel, Meetings and Events Manager',
  '-------------------------------------------------------',
  'EXAMPLE COMPANY LLP',
  'T [phone] M [phone]'
].join('\n');
assert.equal(authoredText(namedThanks),
  'Thank you Alex for the intro and Thank you Sam for the email.');
assert.equal(outcome(base(msg(namedThanks))),'no_reply_suggested',
  'A complete named thank-you and business signature are not a new prospect request');
assert.equal(reason(base(msg(namedThanks))),'acknowledgement');
assert.equal(outcome(base(msg(namedThanks.replace('for the email.',
  'for the email. Could you share possible dates?')))),'possible_request');
assert.equal(outcome(base(msg(namedThanks,{hasAttachments:true}))),'needs_review');
const kennaQuoted=[
  'Awesome! Thanks for this and Llook forward to connecting this weekend.',
  '',
  'KJ',
  '',
  'Kenna James',
  'KennaJames.com <[link]>',
  'X @Kenna_James <[link]>',
  'Instagram <[link]>',
  '',
  'On Wed, Oct 21, 2026 at 12:40 PM Las Vegas Poker Training <',
  '[email]> wrote:',
  '> Could you provide a quote?'
].join('\n');
assert.equal(authoredText(kennaQuoted),
  'Awesome! Thanks for this and Llook forward to connecting this weekend.');
assert.equal(outcome(base(msg(kennaQuoted,{truncated:true}))),'no_reply_suggested',
  'Clipped old forwarded quote must not turn Kenna courtesy into a new client inquiry');
assert.equal(reason(base(msg(kennaQuoted,{truncated:true}))),'acknowledgement');
assert.equal(outcome(base(msg(kennaQuoted,{hasAttachments:true,truncated:true}))),'needs_review');
assert.equal(outcome(base(msg(kennaQuoted.split('On Wed,')[0],{truncated:true}))),'needs_review',
  'Without a clear quoted-history boundary, a clipped message must stay in review');
const actualAsk=kennaQuoted.replace(
  'Awesome! Thanks for this and Llook forward to connecting this weekend.',
  'Thanks for this. Could you send the final contract today?');
assert.equal(outcome(base(msg(actualAsk,{truncated:true}))),'needs_review',
  'A direct question before forwarded history cannot be silently skipped');
assert.equal(outcome(base(msg(actualAsk))),'possible_request');


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
assert.equal(outcome(base(msg('Can you confirm?',{relationshipHint:'talent'}))),
  'vendor_only');
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
assert.match(api,/recipientCheck:RecipientStatus='not_selected'/);
assert.match(api,/if\(outcome==='possible_request'\)/);
assert.match(ddl,/qualification_outcome in/);
assert.match(ddl,/qualification_reason_code in/);
assert.match(app,/Latest message appears to be an acknowledgement/);
assert.match(gas,/all\.slice\(-10\)\.reverse\(\)\.forEach/);
assert.match(gas,/messages\.reverse\(\)/);
assert.match(gas,/the NEWEST message first/);
console.log('Read-only diagnostic outcome tests passed; long thread latest message prioritized.');
