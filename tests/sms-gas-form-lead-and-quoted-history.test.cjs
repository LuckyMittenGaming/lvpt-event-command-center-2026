'use strict';
// Execute the GAS pure filters locally: no Gmail, Apps Script, CRM or network.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const gas=fs.readFileSync(
  'apps-script/release/LVPT_Event_Command_Center_v1_2_COMPLETE_Code.gs','utf8');
const begin=gas.indexOf('function lvptInboxHeader_(');
const end=gas.indexOf('// A narrow, source-verified relationship hint.',begin);
const quoteBegin=gas.indexOf('function lvptGmailDraftVisibleBody_(');
const quoteEnd=gas.indexOf('// Read-only test that logs counts',quoteBegin);
assert(begin>0&&end>begin&&quoteBegin>0&&quoteEnd>quoteBegin);
const script=[
  gas.slice(begin,end),
  gas.slice(quoteBegin,quoteEnd),
  'this.helpers={lvptInboxAutomated_,lvptGmailDraftVisibleBody_};'
].join('\n');
const sandbox=vm.createContext({});
new vm.Script(script,{filename:'gas-safety-pure.js'}).runInContext(sandbox,{timeout:1500});
const {lvptInboxAutomated_:automated,lvptGmailDraftVisibleBody_:visible}=
  sandbox.helpers;
const msg=(from,subject,extra=[])=>({
  payload:{headers:[
    {name:'From',value:from},
    {name:'Subject',value:subject},
    {name:'List-Unsubscribe',value:'<https://unsubscribe.test/>'},
    {name:'Auto-Submitted',value:'auto-generated'},
    ...extra
  ]}
});
const validSender='BizlyApp.com <team@b.bizlyapp.com>';
assert.equal(automated(msg(validSender,
  'New Contact Form Submission from Prospective Client')),false,
  'A legitimate customer request via Bizly must not be discarded as marketing');
assert.equal(automated(msg(validSender,
  'Your monthly invoice')),true,'Billing notifications stay excluded');
assert.equal(automated(msg('Other Sender <updates@b.bizlyapp.com>',
  'New Contact Form Submission from Prospective Client')),true,
  'The exception must require the exact vetted form sender');
assert.equal(automated(msg('Suspicious <team@fake-bizlyapp.com>',
  'New Contact Form Submission from Prospective Client')),true,
  'Lookalike domains must remain excluded');
assert.equal(automated(msg('Offers <promotions@retailer.example>',
  'New Contact Form Submission from Prospective Client')),true,
  'An arbitrary subscription cannot masquerade as the LVPT form sender');
const quoted=[
  'Awesome! Thanks for the update and look forward to connecting this weekend.',
  '',
  'KJ',
  '',
  'Kenna James',
  '',
  'On Wed, Oct 21, 2026 at 12:40 PM Las Vegas Poker Training <',
  '[email]> wrote:',
  '> Could you please send the earlier proposal?'
].join('\n');
const excerpt=visible(quoted);
assert.equal(excerpt.truncated,false);
assert(!excerpt.body.includes('On Wed,'));
assert(!excerpt.body.includes('earlier proposal'));
assert(excerpt.body.includes('Awesome! Thanks for the update'));
const meaningful=[
  'Thanks for the update. Could you confirm the final event time?',
  '',
  'On Wed, Oct 21, 2026 at 12:40 PM Las Vegas Poker Training <',
  '[email]> wrote:',
  '> An old unrelated quote'
].join('\n');
assert(visible(meaningful).body.includes('Could you confirm the final event time?'),
  'The CURRENT request must never be removed with quoted history');
assert.match(gas,/@(?:[a-z0-9-]+\.)*bizlyapp\\?\.com/,
  'GAS sender verification must refuse direct replies to the form service');
console.log('Step 60 GAS form-intake exception, spoof resistance, sender-block and quoted-authored-text checks passed.');
