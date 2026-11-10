'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const api=read('app/api/sms/staging/inbox-diagnostics/route.ts');
const ddl=read('docs/staging-migrations/2026-11-10-staging-readonly-diagnostics.sql');
const app=read('public/sms-review/app.js');
const html=read('public/sms-review/index.html');

assert.match(api,/hasReviewSession\(request\)/);
assert.match(api,/export async function GET\(request:Request\)/);
assert.match(api,/lvpt_no_client_data_diagnostic_history/);
assert.match(api,/clientDataIncluded:false/);
assert.match(api,/order:'created_at.desc',limit:'5'/);
assert.match(api,/allowedReviewMutation\(request\)/);
assert.match(api,/process.env.VERCEL_ENV==='production'/);
assert.match(api,/Object.keys\(body\)\.some\(key=>!\['threadId','lastMessageAt'\]\.includes\(key\)\)/);
assert.match(api,/appsScriptRequest<InboxResponse>\('listBusinessInboxReview'/);
assert.match(api,/appsScriptRequest<ThreadResponse>\(\s*'readBusinessInboxThread'/);
assert.match(api,/verifyBusinessReplyRecipient'/);
assert.match(api,/source==='verified_lvpt_gmail_reply_recipient'/);
assert.match(api,/report=\{/);
assert.match(api,/run_id:runId,tenant_id:'lvpt-owner-pilot'/);
assert.match(api,/thread_preview_status:threadPreviewStatus,recipient_status:recipientStatus/);
assert.match(api,/clientDetailsStored:false/);
assert.match(api,/sendingInvoked:false,gmailWrites:false/);
assert.doesNotMatch(api,/\b(?:sendOwnerApprovedGmailReply|messages\/send|GmailApp\.sendEmail|createDraft)\b/,
  'Read-only diagnostics must never invoke a Gmail write action');
assert(!/JSON\.stringify\((?:body|preview|recipient|inbox)\)/.test(api),
  'Raw selected thread or address must not be logged or stored');
assert.match(ddl,/enable row level security/);
assert.match(ddl,/revoke all.*anon,authenticated/);
assert.doesNotMatch(ddl,/\b(?:recipient|thread_id|email_body|subject|message_id)\s+(?:text|varchar)/i,
  'Report table must not contain fields that can store client identity or text');
assert.match(html,/id="runInboxDiagnostics"/);
assert.match(html,/id="inboxDiagnosticStatus"/);
assert.match(html,/id="inboxDiagnosticHistory"/);
assert.match(app,/async function loadInboxDiagnosticHistory\(\)/);
assert.match(app,/void loadInboxDiagnosticHistory\(\)/);
assert.match(app,/async function runInboxDiagnostics\(\)/);
assert.match(app,/const selection=\(businessInboxReview\?\.threads\|\|\[\]\)\.find/);
assert.match(app,/getProtected\('\/api\/sms\/staging\/inbox-diagnostics',\{body\}\)/);
assert.match(app,/runInboxDiagnostics\(\)/);
console.log('Read-only diagnostic API and zero-PII report regression checks passed.');
