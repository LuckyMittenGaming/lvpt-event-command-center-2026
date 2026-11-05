import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {classifyBusinessSms, matchEvent, redactSmsExcerpt} from '../lib/sms-intelligence.mjs';
const require = createRequire(import.meta.url);
const cases = require('../public/sms-review/case-engine.js');

assert.equal(matchEvent('Our NIUM planning meeting is tomorrow.').eventKey,'nium');
assert.equal(matchEvent('Mosaic NEO event this fall.').eventKey,'mosaic-neo');
assert.equal(matchEvent('Kirkland & Ellis poker training').eventKey,'kirkland');
assert.equal(matchEvent('Venetian Poker Room, confirmed tables').eventKey,'unmatched',
  'Venue does not identify a client');
assert.equal(matchEvent('Palms Place penthouse').eventKey,'unmatched',
  'Venue alone cannot identify NIUM');
assert.equal(matchEvent('NIUM and Mosaic both need decks').eventKey,'unmatched',
  'Ambiguous multiple client mentions are not automatically matched');

const money = classifyBusinessSms('NIUM invoice payment $3,200 is due; confirm ACH.');
assert.equal(money.category,'Finance');
assert.equal(money.eventKey,'nium');
assert.equal(money.topic,'Payments / receivables — verify');
assert.deepEqual(money.amounts,['$3,200']);
assert.equal(money.matchConfidence,'explicit_reference_unverified');

const distributions=classifyBusinessSms('Mosaic: partner draws of $3,000 each are proposed.');
assert.equal(distributions.topic,'Owner draws / distributions');
assert.equal(distributions.eventKey,'mosaic-neo');

const unmatched=classifyBusinessSms('Venetian poker staff are ready at 2pm.');
assert.equal(unmatched.eventKey,'unmatched');
assert.equal(unmatched.category,'Event operations');

assert.equal(classifyBusinessSms('My wife is recovering from surgery.'),null);
const redacted=redactSmsExcerpt('Email business@example.com, call 616-745-7148, account 1234567890; http://example.com');
for (const sensitive of ['business@example.com','616-745-7148','1234567890','http://example.com'])
  assert(!redacted.includes(sensitive), 'Sensitive contact information omitted');

const findings=[
  {id:'sms-dev-1', smsId:1, deviceId:'device-test', date:'2026-08-02T15:00:00Z', category:'Finance',
   eventKey:'nium',eventHint:'NIUM',matchConfidence:'explicit_reference_unverified',
   topic:'Payments / receivables — verify',excerpt:'NIUM paid?'},
  {id:'sms-dev-2', smsId:2, deviceId:'device-test',date:'2026-08-04T15:00:00Z',category:'Finance',
   eventKey:'nium',eventHint:'NIUM',matchConfidence:'explicit_reference_unverified',
   topic:'Payments / receivables — verify',excerpt:'Need receipt'},
  {id:'sms-dev-3',smsId:3,deviceId:'device-test',date:'2026-08-05T15:00:00Z',category:'Event operations',
   eventKey:'unmatched',eventHint:'Venetian',matchConfidence:'unverified',
   topic:'Event logistics / decisions',excerpt:'Venetian setup'},
  {id:'sms-dev-4',smsId:4,deviceId:'device-test',date:'2026-08-05T15:00:00Z',category:'Finance',
   eventKey:'mosaic-neo',eventHint:'Mosaic / NEO',matchConfidence:'explicit_reference_unverified',
   topic:'Owner draws / distributions',excerpt:'Proposed draw'}
];
const bundles=cases.createBundles(findings);
assert.equal(bundles.length,3);
const nium=bundles.find(c=>c.eventKey==='nium');
assert.equal(nium.count,2);
assert.equal(nium.sample.length,2);
assert.equal(nium.financial,true);
assert.equal(bundles.find(c=>c.eventKey==='unmatched').explicitReference,false);

const decisions=cases.exportBundleDecisions(bundles,{
  [nium.key]:{status:'Needs verification', note:'Cross-check invoice and bank receipt'}
},{after:'2026-01-01',source:'staging'});
assert.equal(decisions.decisions.length,1);
assert.equal(decisions.decisions[0].source_messages.length,2);
assert.equal(decisions.decisions[0].event_key_unverified,'nium');
assert(!JSON.stringify(decisions).includes('NIUM paid?'), 'No raw SMS excerpts in case export');
assert(!JSON.stringify(decisions).includes('Need receipt'), 'No excerpts in review export');
console.log('SMS event matching, redaction and grouped-case tests passed.');
