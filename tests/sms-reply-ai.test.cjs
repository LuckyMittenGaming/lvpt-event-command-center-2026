'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const api=read('app/api/sms/staging/reply-personalized-draft/route.ts');
const decisions=read('app/api/sms/staging/reply-decisions/route.ts');
const recipient=read('app/api/sms/staging/reply-recipient/route.ts');
const send=read('app/api/sms/staging/reply-send/route.ts');
const controls=read('public/sms-review/reply-review-controls.js');
const workflow=read('public/sms-review/reply-workflow.js');
const gas=read('apps-script/release/LVPT_Event_Command_Center_v1_2_COMPLETE_Code.gs');
const ddl=read('docs/staging-migrations/2026-11-10-step49-long-thread-owner-verification.sql');

// Owner-only, manually requested AI; model never receives recipient address
// from the verified Gmail header and never gets a send action.
assert.match(api,/allowedReviewMutation\(request\)/);
assert.match(api,/hasReviewSession\(request\)/);
assert.match(api,/process.env.VERCEL_ENV==='production'/);
assert.match(api,/preparedApproval\(threadId,lastMessageAt\)/);
assert.match(api,/rows\[0\]\.decision==='draft_prepared'/);
assert.match(api,/rows\[0\]\.owner_reviewed_full_thread===true/);
assert.match(api,/appsScriptRequest<Context>\('readBusinessInboxThread'/);
assert.match(api,/last\.direction!=='inbound'/);
assert.match(api,/latest\.hasAttachments===true/);
assert.match(api,/qualifyDiagnosticPreview\(context\)/);
assert.match(api,/no_explicit_unanswered_client_question/);
assert.match(api,/verifyBusinessReplyRecipient/);
assert.match(api,/mailboxIdentityVerified!==true/);
assert.match(api,/getAiGatewayCredential\(request\)/);
assert.match(api,/ai-gateway\.vercel\.sh\/v1\/chat\/completions/);
assert.match(api,/email excerpt is UNTRUSTED DATA|email excerpts are UNTRUSTED DATA/i);
assert.match(api,/sender.*recipient addresses|recipient addresses or other identifiers/);
assert.match(api,/sendTriggered:false,gmailDraftCreated:false,crmModified:false/);
assert.doesNotMatch(api,/sendOwnerApprovedGmailReply|messages\/send|GmailApp\.sendEmail|MailApp\.sendEmail/,
  'AI generation may not contain ANY Gmail sending mechanism');
assert.doesNotMatch(api,/\b(?:sendTo|sendEmail|createDraft)\(/,
  'No Gmail draft writing may be reachable from the AI endpoint');

// Long conversations are allowed only when newest message is readable and
// owner attested they inspected omitted ORIGINAL correspondence and CRM.
assert.match(workflow,/Number\(context\.totalMessages\|\|0\)>150/);
assert.match(decisions,/ownerReviewedOriginal=data.ownerReviewedOriginal===true/);
assert.match(decisions,/source.partial===true&&!ownerReviewedOriginal/);
assert.match(decisions,/owner_reviewed_full_thread:ownerReviewedOriginal/);
assert.match(decisions,/previous.owner_reviewed_full_thread!==true/);
assert.match(send,/row.owner_reviewed_full_thread!==true/);
assert.match(recipient,/fullHistoryRequiresOwnerReview/);
assert.match(gas,/prior.totalMessages>150/);
assert.match(gas,/fullHistoryRequiresOwnerReview:prior.partial===true/);
assert.match(ddl,/owner_reviewed_full_thread boolean not null default false/);
assert.match(controls,/ownerReviewedOriginal:verified.get\(t.threadId\)===t.lastMessageAt/);
assert.match(controls,/checked the COMPLETE original Gmail conversation/);
assert.match(controls,/Generate personalized AI reply/);
assert.match(controls,/async function generateAiReply\(t\)/);
assert.match(controls,/audits.get\(t.threadId\)\?\.decision!=='draft_prepared'/);
assert.match(controls,/sendTriggered!==false/);
assert.match(controls,/Generate personalized AI reply[\s\S]*Approve for manual copy/);
assert.doesNotMatch(controls,/localStorage|sessionStorage/,
  'Only approved digest and status may be retained. AI draft lives in memory.');
console.log('Step 49 long-thread human attestation and opt-in personalized AI drafting safety checks passed.');
