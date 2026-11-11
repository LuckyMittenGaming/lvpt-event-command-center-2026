'use strict';
// Operational document alerts remain accessible but never become sales drafts.
// No Gmail network activity, document opening, writes or sending.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const read=p=>fs.readFileSync(p,'utf8');
const src=read('app/api/sms/staging/_inbox-routing.ts');
const code=ts.transpileModule(src,{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
}).outputText;
const sandbox={module:{exports:{}},exports:{}};
sandbox.exports=sandbox.module.exports;
vm.runInNewContext(code,sandbox,{timeout:1500});
const {isDocumentWorkflowNotice}=sandbox.module.exports;
assert.equal(typeof isDocumentWorkflowNotice,'function');
const subject='Complete with Docusign: Las Vegas Poker Training - CertaPro Painters - Conference Breakout Session';
assert.equal(isDocumentWorkflowNotice('docusign.net',subject),true);
assert.equal(isDocumentWorkflowNotice('email.docusign.net','Please sign your document'),true);
assert.equal(isDocumentWorkflowNotice('docusign.com',subject),true);
assert.equal(isDocumentWorkflowNotice('docusign.com','Can you quote a corporate poker event?'),false);
assert.equal(isDocumentWorkflowNotice('gmail.com',subject),false);
assert.equal(isDocumentWorkflowNotice('prospect.com','Can you send prices and available dates?'),false);
assert.equal(isDocumentWorkflowNotice('fake-docusign.net',subject),false);
assert.equal(isDocumentWorkflowNotice('docusign.net.evil.org',subject),false);
const inbox=read('app/api/sms/staging/inbox-review/route.ts');
assert.match(inbox,/isDocumentWorkflowNotice\(domain,row.subject\)/);
assert.match(inbox,/relationshipHint:routedHint/);
assert.match(inbox,/needsHumanReview:direction==='inbound'/,
  'Document notices remain available for human operational review');
const app=read('public/sms-review/app.js');
assert.match(app,/Document signature notice — operations review, not a sales inquiry/);
assert.match(app,/contract\/document notices/);
assert.match(app,/t.relationshipHint==='unclassified'/,
  'Automated notices must not enter the one-at-a-time prospect reply queue');
assert.match(app,/Continue to next customer inquiry/);
const reply=read('public/sms-review/reply-qualification.js');
const {qualifyThread}=require('../public/sms-review/reply-qualification.js');
const workflow=require('../public/sms-review/reply-workflow.js');
const at=new Date(Date.now()-3600000).toISOString();
const meta={
  threadId:'1a1c6710ad970a28',subject,lastMessageAt:at,
  lastDirection:'inbound',sourceType:'email_thread',
  needsHumanReview:true,relationshipHint:'operational_notice',
  senderDomain:'docusign.net'
};
const context={
  threadId:meta.threadId,lastMessageAt:at,totalMessages:1,partial:false,
  messages:[{at,direction:'inbound',relationshipHint:'unclassified',
    senderDomain:'docusign.net',
    excerpt:'John Bogan has sent you a new Docusign document to view and sign.',
    hasAttachments:true,truncated:true}]
};
const q=qualifyThread(meta,context);
assert.equal(q.outcome,'operational_notice');
assert.equal(q.safeToAutoSend,false);
assert.equal(workflow.canPrepare(meta,context,q),false);
const normalMeta={...meta,relationshipHint:'unclassified',senderDomain:'exampleclient.com'};
const normalCtx={...context,messages:[{...context.messages[0],
  senderDomain:'exampleclient.com',excerpt:'Could you share availability and pricing?',
  hasAttachments:false,truncated:false}]};
const normal=qualifyThread(normalMeta,normalCtx);
assert.equal(normal.outcome,'reply_candidate');
assert.equal(workflow.canPrepare(normalMeta,normalCtx,normal),true);
const decisions=read('app/api/sms/staging/reply-decisions/route.ts');
const ai=read('app/api/sms/staging/reply-personalized-draft/route.ts');
const recipient=read('app/api/sms/staging/reply-recipient/route.ts');
const send=read('app/api/sms/staging/reply-send/route.ts');
for(const [name,file] of Object.entries({decisions,ai,recipient,send})){
  assert.match(file,/isDocumentWorkflowNotice\(/,
    name+' route must reject DocuSign as a sales reply');
}
assert(send.indexOf('isDocumentWorkflowNotice(input.recipient') <
  send.indexOf('claimed=await claimIntent'),
  'Operational sender must be rejected before reserving a Gmail send');
console.log('Step 58 operational DocuSign routing, preserved contract review, sales exclusion and no-send guard tests passed.');
