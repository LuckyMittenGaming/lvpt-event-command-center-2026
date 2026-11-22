const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const file=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const helper=file('lib/lvpt-ai-gateway-auth.ts');
const smoke=file('app/api/sms/staging/ai-smoke-test/route.ts');
const draft=file('app/api/sms/staging/personalized-draft/route.ts');
assert.match(helper,/x-vercel-oidc-token/,'Runtime OIDC request header must be consumed');
assert.match(helper,/AI_GATEWAY_API_KEY/,'Existing private API key fallback remains supported');
assert.match(helper,/VERCEL_OIDC_TOKEN/,'Existing build or local token fallback remains supported');
assert.match(helper,/jwtShape/,'OIDC token shape is checked before use');
for(const code of [smoke,draft]) {
  assert.match(code,/getAiGatewayCredential\(request\)/,'Both routes must read OIDC from the runtime request');
  assert(!/process\.env\.AI_GATEWAY_API_KEY\|\|process\.env\.VERCEL_OIDC_TOKEN/.test(code),
    'Old environment-only credential lookup must be removed');
  assert.match(code,/hasReviewSession\(request\)/,'Endpoints remain owner-session authenticated');
  assert.match(code,/allowedReviewMutation\(request\)/,'Endpoints remain same-origin only');
  assert.match(code,/fetch\('https:\/\/ai-gateway\.vercel\.sh\/v1\/chat\/completions'/);
}
assert.match(smoke,/synthetic_only/,'Smoke test stays fictional');
assert.match(smoke,/authentication:auth\.method/,'Success response reports auth method without exposing secrets');
assert(!/token:auth\.token|credential:auth\.token/.test(smoke),'Never return credentials to browser');
console.log('AI Gateway OIDC runtime authentication regression tests passed.');
