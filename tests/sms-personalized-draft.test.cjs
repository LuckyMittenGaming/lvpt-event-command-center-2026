const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {shouldHoldPersonalizedDraft}=require('../lib/lvpt-personalized-policy.mjs');
const now=Date.parse('2026-11-06T15:00:00Z');
function t(last, direction, inbound, eventKey='quinn-emanuel') {
  return {eventKey,lastMessageAt:last,lastDirection:direction,
    messages:[
      {direction:'inbound',at:'2026-10-01T12:00:00Z',body:inbound},
      {direction:'outbound',at:last,body:'Thanks for reviewing the proposal.'}
    ]};
}
const safe=t('2026-10-20T15:00:00Z','outbound','Thanks for putting this proposal together. I will review the details.');
assert.equal(shouldHoldPersonalizedDraft(safe,now),'');
assert.equal(shouldHoldPersonalizedDraft(t('2026-11-05T15:00:00Z','outbound','Thanks.'),now),
 'recent_outbound_followup_too_early');
assert.equal(shouldHoldPersonalizedDraft(t('2026-10-23T18:20:05Z','outbound',
 'FYSA: I’m heading out of town for a few weeks, so you’ll likely hear from me once I’m back in the office.','lithic'),now),
 'client_travel_or_internal_review_hold');
assert.equal(shouldHoldPersonalizedDraft(t('2026-10-15T15:00:00Z','outbound','I will get this in front of leadership for approval.','lithic'),now),
 'client_travel_or_internal_review_hold');
assert.equal(shouldHoldPersonalizedDraft({...safe,eventKey:'ows-aws'},now),
 'multiple_ows_events_unresolved');
assert.equal(shouldHoldPersonalizedDraft({...safe,messages:[]},now),'conversation_missing');
assert.equal(shouldHoldPersonalizedDraft({...safe,messages:[{direction:'outbound',body:'Thanks.'}]},now),'client_message_body_missing');
assert.equal(shouldHoldPersonalizedDraft({...safe,messages:[{direction:'inbound',body:'What is included?'}],lastDirection:'inbound'},now),'');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const route=read('app/api/sms/staging/personalized-draft/route.ts');
const app=read('public/sms-review/app.js');
assert.match(route,/allowedReviewMutation\(request\)/);
assert.match(route,/hasReviewSession\(request\)/);
assert.match(route,/readApprovedContext\(internalRequest\)/);
assert.match(route,/shouldHoldPersonalizedDraft\(context\)/);
assert.match(route,/conversation_updated_refresh_approval|draft_held/);
assert.match(route,/event_identity_ambiguous/);
assert.match(route,/source:'ai_gateway_personalized_preview'/);
assert.match(route,/prompt|messages:/);
assert(!/GmailApp\.sendEmail|createDraft\(|sendEmail\(|saveAllEvents\(/.test(route),'AI route must not mutate mailbox or accounting');
assert.match(app,/Generate personalized draft \(AI\)/);
assert.match(app,/personalized-draft/);
assert.match(app,/redacted conversation excerpt/);
assert.match(app,/item\.id==='gmail:ows-aws'/);
assert(!/sendMail\(|GmailApp\.send|createDraft\(/.test(app.slice(app.indexOf('async function generatePersonalizedDraft'),app.indexOf('function renderApprovedDraftPreview'))),'UI generator must not send');
console.log('Personalized draft opt-in, source validation, and correspondence hold tests passed.');
