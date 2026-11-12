const assert = require('node:assert/strict');
const engine = require('../public/sms-review/review-engine.js');

const input = {
  format:'lvpt_sms_history_v1',
  contact_name:'Partner',
  messages:[
    {sms_id:1,direction:'incoming',timestamp_ms:Date.parse('2026-07-30T13:00:00Z'),body:'NIUM invoice payment $3,200 due, check receipt.'},
    {sms_id:2,direction:'outgoing',timestamp_ms:Date.parse('2026-07-31T13:00:00Z'),body:'I will follow up about the Venetian poker training event tomorrow.'},
    {sms_id:3,direction:'incoming',timestamp_ms:Date.parse('2026-08-01T13:00:00Z'),body:'My wife is recovering from surgery.'},
    {sms_id:4,direction:'outgoing',timestamp_ms:Date.parse('2025-12-01T13:00:00Z'),body:'Old poker lesson quote.'},
    {sms_id:2,direction:'outgoing',timestamp_ms:Date.parse('2026-07-31T13:00:00Z'),body:'Duplicate SMS ID; ignored.'},
    {sms_id:5,direction:'incoming',timestamp_ms:Date.parse('2026-08-02T13:00:00Z'),body:'Jeff Madsen confirmed for the corporate poker training experience.'},
  ],
};

const report = engine.analyze(input,{after:'2026-01-01'});
assert.equal(report.count,6);
assert.equal(report.duplicateCount,1);
assert.equal(report.afterDateCount,4);
assert.equal(report.findings.length,3);
assert.deepEqual(report.findings.map(i=>i.category).sort(),['Event operations','Finance','Follow-up'].sort());
assert.equal(report.findings.find(i=>i.smsId===1).eventHint,'NIUM');
assert.equal(report.findings.find(i=>i.smsId===1).amounts[0],'$3,200');

const redacted=engine.redacted('Email test@example.com or 616-745-7148; see https://example.com');
assert(!redacted.includes('test@example.com'));
assert(!redacted.includes('616-745-7148'));
assert(!redacted.includes('https://example.com'));

const decisions=engine.exportDecisions(report,{
  'sms-1':{status:'Needs verification',note:'Check payment receipt'},
  'sms-2':{status:'Approved for export',note:'Research current status'}
});
assert.equal(decisions.decisions.length,2);
assert(!JSON.stringify(decisions).includes('invoice payment'));
assert.equal(decisions.decisions[0].source_system,'lvpt_android_sms');

assert.throws(()=>engine.asRecord('{}'),/supported/);
assert.throws(()=>engine.asRecord({format:'lvpt_sms_history_v1',messages:[{sms_id:1,body:'x'}]}),/unsupported/);

console.log('SMS review engine tests passed.');
