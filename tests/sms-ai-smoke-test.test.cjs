const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const route=fs.readFileSync(path.join(root,'app/api/sms/staging/ai-smoke-test/route.ts'),'utf8');
const app=fs.readFileSync(path.join(root,'public/sms-review/app.js'),'utf8');
const html=fs.readFileSync(path.join(root,'public/sms-review/index.html'),'utf8');
assert.match(route,/hasReviewSession\(request\)/);
assert.match(route,/allowedReviewMutation\(request\)/);
assert.match(route,/mode!=='synthetic_only'/);
assert.match(route,/SampleWorks/);
assert.match(route,/Vercel AI Gateway|ai-gateway\.vercel\.sh/);
assert.match(route,/response_format:\{type:'json_object'\}/);
assert.match(route,/noGmailRead:true,noEmailSent:true,noGmailDraftCreated:true,noSheetChanged:true/);
assert(!/readApprovedContext|listEvents|listGmail|GmailApp|saveAllEvents|createDraft\(/.test(route),
 'Synthetic test must not touch real source records or mutate email');
assert.match(app,/runSyntheticAiTest/);
assert.match(app,/fetch\('\/api\/sms\/staging\/ai-smoke-test'/,
  'Synthetic smoke test should parse safe diagnostic response from fetch');
assert.match(html,/id="runSyntheticAiTest"/);
assert.match(html,/fictional data only/);
assert.match(route,/customer_verification_required/,
  'Billing/account verification must not be mistaken for an invalid OIDC token');
assert.match(route,/gatewayStatus:status,gatewayCode/,
  'Synthetic test must safely report real upstream HTTP status and whitelisted code');
assert.match(route,/authentication:auth\.method/,
  'Synthetic test must report the authentication method, not the secret');
assert.match(route,/const allow=new Set/,
  'Never expose arbitrary provider error payloads to browser');
assert.match(app,/data\.gatewayStatus/,
  'Diagnostic UI must display the upstream HTTP status');
assert.match(app,/data\.gatewayCode/,
  'Diagnostic UI must display a whitelisted upstream error code');
console.log('Signed-in, synthetic-only AI Gateway smoke-test safeguards passed.');
