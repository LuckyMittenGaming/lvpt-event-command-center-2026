const assert=require('node:assert/strict');
const {summarizeThread,primaryText}=require('../public/sms-review/gmail-thread-triage.js');
const BUSINESS=['book@example.test'];
const msg=(date,from,body)=>({email_ts:date,from,body});
const test=(items,expected)=>assert.equal(
 summarizeThread({messages:items,total_messages:items.length},BUSINESS).state,expected);
test([
 msg('2026-10-01T00:00:00Z','book@example.test','Here is the proposal'),
 msg('2026-10-02T00:00:00Z','client@test.test','Unfortunately we have decided not to move forward at this time.'),
 msg('2026-10-03T00:00:00Z','book@example.test','Thank you; we hope to work again')
],'declined');
test([
 msg('2026-10-01T00:00:00Z','client@test.test','Would you send the event plan?'),
 msg('2026-10-02T00:00:00Z','book@example.test','Here is your proposal. Please review.')
],'proposal_sent_awaiting');
test([
 msg('2026-10-01T00:00:00Z','client@test.test','Can you quote the event?'),
 msg('2026-10-02T00:00:00Z','book@example.test','The agreement has been signed and your invoice was sent.')
],'fulfillment_check');
test([
 msg('2026-10-01T00:00:00Z','client@test.test','Please send a quote.'),
 msg('2026-10-02T00:00:00Z','book@example.test','Thanks, we will reply.')
],'answered_or_awaiting');
test([
 msg('2026-10-01T00:00:00Z','book@example.test','Here is a proposal'),
 msg('2026-10-02T00:00:00Z','client@test.test','Can you adjust to 10 guests?')
],'inbound_last_review');
test([msg('2026-10-02T00:00:00Z','book@example.test','Here is a quote')],'outbound_only');
assert.equal(summarizeThread({messages:[msg('2026-10-02T00:00:00Z','client@test.test','Yes')],total_messages:2},BUSINESS).state,'insufficient_evidence');
assert.equal(summarizeThread({messages:[msg('2026-10-02T00:00:00Z','client@test.test','Yes')],total_messages:1,truncated:true},BUSINESS).state,'insufficient_evidence');
assert.equal(summarizeThread({messages:[{from:'client@test.test',body:'Yes'}],total_messages:1},BUSINESS).state,'insufficient_evidence');
const quoted='Thanks for the proposal.\nOn Thu, Oct 29, 2026 at 7:42 PM Client wrote:\nWe won\'t be moving forward.';
assert.equal(primaryText(quoted),'Thanks for the proposal.');
test([
 msg('2026-10-01T00:00:00Z','client@test.test','Would you provide pricing?'),
 msg('2026-10-02T00:00:00Z','book@example.test',quoted)
],'answered_or_awaiting');
assert.equal(summarizeThread({messages:[msg('2026-10-01T00:00:00Z','client@test.test','We are not moving forward')],total_messages:1},BUSINESS).state,'declined');
console.log('Full-thread Gmail triage tests passed.');
