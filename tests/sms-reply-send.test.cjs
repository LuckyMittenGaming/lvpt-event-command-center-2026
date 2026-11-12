'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const at=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const gas=at('apps-script/release/LVPT_Event_Command_Center_v1_2_COMPLETE_Code.gs');
const api=at('app/api/sms/staging/reply-send/route.ts');
const recipient=at('app/api/sms/staging/reply-recipient/route.ts');
const controls=at('public/sms-review/reply-review-controls.js');
const ddl=at('docs/staging-migrations/2026-11-10-step48-gmail-send-intents.sql');
assert.doesNotThrow(()=>new Function(gas),'Full Code.gs must parse in Apps Script V8');
assert.match(gas,/action === 'verifyBusinessReplyRecipient'/);
assert.match(gas,/action === 'sendOwnerApprovedGmailReply'/);
assert.match(gas,/function lvptStep48VerifyReplyRecipient_/);
assert.match(gas,/function lvptStep48SendApprovedReply_/);
assert.match(gas,/lvptReadOnlyBusinessInboxThread_\(threadId,expectedLastMessageAt\)/);
assert.match(gas,/profile.emailAddress\|\|''/);
assert.match(gas,/verified.recipient!==recipient/);
assert.match(gas,/last.labelIds\|\|\[\]\)\.indexOf\('SENT'\)/);
assert.match(gas,/lvptInboxAutomated_\(last\)/);
assert.match(gas,/lvptInboxRelationship_\(from,to,false,false\)!=='unclassified'/);
assert.match(gas,/Message-ID: <lvpt-'\+intent\+'/);
assert.match(gas,/In-Reply-To: '\+verified.inReplyTo/);
assert.match(gas,/References: '\+referenceLine/);
assert.match(gas,/threadId:threadId,\s*raw:Utilities.base64EncodeWebSafe/);
assert.match(gas,/gmail\/v1\/users\/me\/messages\/send/);
assert.match(gas,/LVPT_ENABLE_OWNER_APPROVED_GMAIL_SEND'\)!=='true'/);
assert.match(gas,/return \{ok:false,message:'Live Gmail sending has not been enabled by LVPT'\}/);
// Never send in a trigger or scheduled scan.
assert(!/function lvptReadOnlyBusinessInboxReview_[\s\S]*?function lvptReadOnlyBusinessInboxThread_[\s\S]*?messages\/send/.test(
  gas.slice(gas.indexOf('function lvptReadOnlyBusinessInboxReview_('),
            gas.indexOf('// STEP 48'))),
  'Read-only inbox functions must not contain sending operations');
assert.match(recipient,/hasReviewSession\(request\)/);
assert.match(recipient,/appsScriptRequest<Verified>\('verifyBusinessReplyRecipient'/);
assert.match(recipient,/sendingEnabled===true/);
assert.match(recipient,/noMessageSent:true/);
assert.match(api,/allowedReviewMutation\(request\)/);
assert.match(api,/hasReviewSession\(request\)/);
assert.match(api,/process.env.LVPT_ENABLE_OWNER_APPROVED_GMAIL_SEND!=='true'/);
assert.match(api,/live_gmail_sending_disabled/);
assert.match(api,/confirmation!=='SEND THIS EMAIL'/);
assert.match(api,/v.ownerReviewed!==true/);
assert.match(api,/approvedDigest\(input.threadId,input.lastMessageAt\)/);
assert.match(api,/timingSafeDigest\(digest,approved\)/);
assert.match(api,/row\?\.decision!=='approved_for_manual_copy'/);
assert.match(api,/approvedAt<Date.now\(\)-24\*3600000/);
assert.match(api,/claimIntent\(/);
assert.match(api,/duplicate_send_intent_exists/);
assert.match(api,/sendOwnerApprovedGmailReply/);
assert.match(api,/await markIntent\(intentId,'uncertain'\)/);
assert.match(api,/doNotRetry:true/);
assert(!/for\s*\([^)]*\)\s*\{[^}]*sendOwnerApprovedGmailReply/s.test(api),
  'Send endpoint must not batch or retry Gmail sends');
assert.match(ddl,/unique\(tenant_id,thread_id,last_message_at\)/);
assert.match(ddl,/enable row level security/);
assert.match(ddl,/revoke all.*anon,authenticated/);
assert(!/subject text|body text|recipient text/i.test(ddl),
  'Send attempts must never store recipients or email text');
assert.match(controls,/Verify recipient and send status \(read-only\)/);
assert.match(controls,/Send this approved reply/);
assert.match(controls,/SEND THIS EMAIL/);
assert.match(controls,/record\?\.status!=='not_attempted'/);
assert.match(controls,/if\(exact!==active.draftDigest\)/);
assert.match(controls,/Send result uncertain or blocked/);
assert.match(controls,/No CC or BCC is added/);
assert.match(controls,/Send email — disabled in staging/);
assert(!/setInterval|setTimeout|scheduleSend|retrySend/.test(controls));
assert(!/localStorage|sessionStorage/.test(controls),
  'Sensitive recipient and draft text must remain in browser memory');
console.log('Step 48 send readiness, two opt-ins, explicit owner send and dedup static tests passed.');
