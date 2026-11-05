const assert=require('node:assert/strict');
const fs=require('node:fs');
const route=fs.readFileSync('app/api/sms/staging/decisions/route.ts','utf8');
const migration=fs.readFileSync('docs/staging-migrations/lvpt_sms_review_audit_v1.sql','utf8');
const reviewAuth=fs.readFileSync('app/api/sms/staging/_review-auth.ts','utf8');
const health=fs.readFileSync('app/api/sms/staging/audit-health/route.ts','utf8');
const browser=fs.readFileSync('public/sms-review/app.js','utf8');

assert.match(route,/rpc\/lvpt_save_sms_decisions_with_audit/,
  'Reviewer saves must use transactional audit RPC rather than a direct upsert');
assert.match(route,/auditNoteMac\(v\.key,v\.note\)/,
  'Store only a keyed note digest in the audit trail');
assert.match(route,/data\.audited|audited:true/,
  'Successful reviewer save must acknowledge audit writing');
assert.match(route,/allowedReviewMutation\(request\)/,
  'Decisions require a same-origin mutation');
assert.match(health,/authorizedReviewer\(request\)/,'Audit health is owner authorized');
assert.match(health,/JSON\.stringify\(\{p_rows:\[\]\}\)/,'Health test must submit an empty batch and perform no writes');
assert.match(browser,/!auditServiceReady/,'Browser save button must fail closed when audit health is unavailable');
assert.match(reviewAuth,/hasReviewSession\(request\)/,
  'Browser sessions can authorize review but not ingest');
assert.match(migration,/enable row level security/i);
assert.match(migration,/revoke all on public\.lvpt_sms_review_audit from public,anon,authenticated/i);
assert.match(migration,/auth\.role\(\) is distinct from 'service_role'/i);
assert.match(migration,/security definer set search_path=''/i);
assert.match(migration,/insert into public\.lvpt_sms_case_decisions/i);
assert.match(migration,/insert into public\.lvpt_sms_review_audit/i);
assert(!/body_ciphertext|sms_plaintext|message_body/i.test(migration),
  'Review audit schema must not contain SMS payload fields');
console.log('SMS review audit security regression checks passed.');
