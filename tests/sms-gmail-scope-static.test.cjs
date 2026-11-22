const assert=require('node:assert/strict');
const fs=require('node:fs');

const script=fs.readFileSync('apps-script/Code.gs','utf8');
const manifest=JSON.parse(fs.readFileSync('apps-script/appsscript.json','utf8'));
const route=fs.readFileSync('app/api/sms/staging/gmail-evidence/route.ts','utf8');
const ui=fs.readFileSync('public/sms-review/app.js','utf8');
const gmail=fs.readFileSync('apps-script/GmailEvidence.gs','utf8');
assert(gmail.includes('function lvptReadOnlyGmailEvidence_('),
  'Standalone read-only Gmail helper must exist');
assert(!script.includes('function lvptReadOnlyGmailEvidence_('),
  'Gmail function must not be duplicated across Apps Script files');

assert(manifest.oauthScopes.includes('https://www.googleapis.com/auth/gmail.readonly'));
assert.match(script,/if \(action === 'listGmailThreadEvidence'\)/);
assert.match(gmail,/Object\.prototype\.hasOwnProperty\.call\(domains,eventKey\)/);
assert.match(gmail,/maxResults=60/,'Search must be bounded');
assert.match(gmail,/ids\.length<8/,'Thread detail requests must be bounded');
assert.match(gmail,/format=metadata&metadataHeaders=/,'Read only Gmail message headers');
assert.match(gmail,/ScriptApp\.getOAuthToken\(\)/);
assert.match(gmail,/fullMailboxChecked:false/);
assert.match(gmail,/metadataFailures:failedThreads/);
assert.doesNotMatch(gmail,/getPlainBody|getBody\(|format=full|format=raw|messages\.send|drafts\.send|GmailApp\.sendEmail/);
assert.doesNotMatch(gmail,/result\s*=\s*.*body|snippet:/,'No message bodies/snippets in evidence response');
assert.match(route,/authorizedReviewer\(request\)/,'User-only review token or valid HttpOnly session');
assert.match(route,/Object\.prototype\.hasOwnProperty\.call\(CLIENTS,eventKey\)/);
assert.match(route,/appsScriptRequest<RawResult>\('listGmailThreadEvidence'/);
assert.match(route,/fullMailboxChecked:false/);
assert.match(ui,/loadGmailEvidence\(\)/);
assert.match(ui,/Gmail Activity is incomplete/);
console.log('Gmail scope and bounded metadata-only evidence security checks passed.');
