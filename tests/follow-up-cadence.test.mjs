import assert from 'node:assert/strict';
import {
  addBusinessDays,
  evaluateFollowUpCadence,
  buildFollowUpDueLane
} from '../lib/follow-up-cadence.mjs';

function byRule(rows, ruleId) {
  return rows.filter((r) => r.ruleId === ruleId);
}

function one(rows, ruleId) {
  const hits = byRule(rows, ruleId);
  assert.equal(hits.length, 1, `expected exactly one ${ruleId}, got ${hits.length}`);
  return hits[0];
}

// addBusinessDays skips weekends
assert.equal(addBusinessDays('2025-11-21', 1), '2025-11-24'); // Fri + 1bd = Mon
assert.equal(addBusinessDays('2025-11-20', 3), '2025-11-25'); // Thu + 3bd = Tue

const NOW = '2025-11-27T15:00:00.000Z'; // Thursday

// 1. new_inquiry_unquoted — due inquiry+1 within 24–48hr window
{
  const rows = evaluateFollowUpCadence(
    { eventId: 'e1', inquiryDate: '2025-11-26', status: 'New Lead' },
    { now: NOW }
  );
  const row = one(rows, 'new_inquiry_unquoted');
  assert.equal(row.dueDate, '2025-11-27');
  assert.equal(row.suppressed, false);
}

// overdue unquoted still emits with due = inquiry+1
{
  const rows = evaluateFollowUpCadence(
    { eventId: 'e1b', inquiryDate: '2025-11-20', status: 'New Lead' },
    { now: NOW }
  );
  assert.equal(one(rows, 'new_inquiry_unquoted').dueDate, '2025-11-21');
}

// quoted suppresses rule 1
{
  const rows = evaluateFollowUpCadence(
    { inquiryDate: '2025-11-26', quoteSentAt: '2025-11-26', status: 'Proposal Sent' },
    { now: NOW }
  );
  assert.equal(byRule(rows, 'new_inquiry_unquoted').length, 0);
}

// 2. quote_proposal_sent — 3bd then 10bd
{
  // proposal Mon 2025-11-17; +3bd = Thu 2025-11-20; now is later → first stage at least
  const first = evaluateFollowUpCadence(
    { proposalSentAt: '2025-11-24', status: 'Proposal Sent' }, // Mon; +3bd = Thu 11/27
    { now: '2025-11-27T18:00:00.000Z' }
  );
  const r1 = one(first, 'quote_proposal_sent');
  assert.equal(r1.dueDate, '2025-11-27');
  assert.match(r1.ruleName, /Proposal Follow-Up/);
  assert.ok(!/2nd/.test(r1.ruleName));

  const second = evaluateFollowUpCadence(
    { proposalSentAt: '2025-11-10', status: 'Proposal Sent' }, // +10bd overdue
    { now: NOW }
  );
  const r2 = one(second, 'quote_proposal_sent');
  assert.match(r2.ruleName, /2nd touch/);
  assert.equal(r2.dueDate, addBusinessDays('2025-11-10', 10));
}

// 3. stalled_potential
{
  const active = evaluateFollowUpCadence(
    {
      followedUpAt: '2025-09-01',
      eventDate: '2026-01-15',
      status: 'Proposal Sent'
    },
    { now: NOW }
  );
  assert.equal(one(active, 'stalled_potential').dueDate, '2025-11-16'); // event - 60d

  const declined = evaluateFollowUpCadence(
    {
      followedUpAt: '2025-09-01',
      eventDate: '2026-01-15',
      status: 'Client Declined'
    },
    { now: NOW }
  );
  const d = one(declined, 'stalled_potential');
  assert.equal(d.suppressed, true);
  assert.equal(d.suppressReason, 'declined_or_lost');

  const noDate = evaluateFollowUpCadence(
    { followedUpAt: '2025-09-01', status: 'Open' },
    { now: NOW }
  );
  const n = one(noDate, 'stalled_potential');
  assert.equal(n.suppressed, true);
  assert.equal(n.suppressReason, 'no_event_date');
}

// 4. short_fuse
{
  const fuse = evaluateFollowUpCadence(
    {
      inquiryDate: '2025-11-10',
      eventDate: '2025-11-28',
      status: 'New Lead'
    },
    { now: NOW }
  );
  assert.equal(one(fuse, 'short_fuse').dueDate, '2025-11-14'); // event - 14
  assert.equal(one(fuse, 'short_fuse').suppressed, false);

  const recent = evaluateFollowUpCadence(
    {
      inquiryDate: '2025-11-10',
      eventDate: '2025-11-28',
      status: 'New Lead',
      lastContactAt: '2025-11-25'
    },
    { now: NOW }
  );
  const suppressed = one(recent, 'short_fuse');
  assert.equal(suppressed.suppressed, true);
  assert.equal(suppressed.suppressReason, 'contacted_within_4_days');
}

// 5. invoiced_awaiting_deposit
{
  const rows = evaluateFollowUpCadence(
    {
      invoiceSentAt: '2025-11-20', // Thu; +5bd = Thu 11/27
      status: 'Invoice Sent / Awaiting Deposit',
      depositPaid: false
    },
    { now: NOW }
  );
  assert.equal(one(rows, 'invoiced_awaiting_deposit').dueDate, '2025-11-27');

  const paid = evaluateFollowUpCadence(
    {
      invoiceSentAt: '2025-11-20',
      status: 'Deposit Paid',
      depositPaid: true
    },
    { now: NOW }
  );
  assert.equal(byRule(paid, 'invoiced_awaiting_deposit').length, 0);
}

// 6. booked_pre_event
{
  const rows = evaluateFollowUpCadence(
    {
      status: 'Booked',
      eventDate: '2025-12-10',
      lastCorrespondenceAt: '2025-11-01'
    },
    { now: NOW }
  );
  assert.equal(one(rows, 'booked_pre_event').dueDate, '2025-12-03'); // event - 7

  const recentCorr = evaluateFollowUpCadence(
    {
      status: 'Booked',
      eventDate: '2025-12-10',
      lastCorrespondenceAt: '2025-11-28' // within 14 days of event (cutoff 11/26)
    },
    { now: NOW }
  );
  assert.equal(byRule(recentCorr, 'booked_pre_event').length, 0);
}

// 7. booked_final_balance
{
  const rows = evaluateFollowUpCadence(
    {
      status: 'Booked',
      eventDate: '2025-12-20',
      balanceRemainingCents: 150000,
      lastCorrespondenceAt: '2025-12-10' // avoid pre-event noise where possible
    },
    { now: NOW }
  );
  assert.equal(one(rows, 'booked_final_balance').dueDate, '2025-12-06');
}

// 8. booked_day_of — pinToday
{
  const rows = evaluateFollowUpCadence(
    {
      status: 'Booked',
      eventDate: '2025-11-27',
      timeZone: 'America/Los_Angeles',
      balanceRemainingCents: 0,
      lastCorrespondenceAt: '2025-11-20'
    },
    { now: '2025-11-27T18:00:00.000Z' } // still Nov 27 in PT
  );
  const dayOf = one(rows, 'booked_day_of');
  assert.equal(dayOf.pinToday, true);
  assert.equal(dayOf.ruleName, "Today's Check-In");
  assert.equal(dayOf.dueDate, '2025-11-27');
}

// 9. post_event_wrap
{
  const rows = evaluateFollowUpCadence(
    {
      status: 'Completed',
      eventDate: '2025-11-24' // Mon; +2bd = Wed 11/26
    },
    { now: NOW }
  );
  assert.equal(one(rows, 'post_event_wrap').dueDate, '2025-11-26');

  const pastBooked = evaluateFollowUpCadence(
    {
      status: 'Booked',
      eventDate: '2025-11-20'
    },
    { now: NOW }
  );
  assert.ok(byRule(pastBooked, 'post_event_wrap').length === 1);
}

// 10. past_client_anniversary + suppressions
{
  const base = {
    eventId: 'past-1',
    company: 'Acme Corp',
    contactEmail: 'buyer@acme.test',
    lastYearEventDate: '2025-06-01', // anniversary 2026-06-01; due = 2026-03-03
    status: 'Completed'
  };
  const open = evaluateFollowUpCadence(base, { now: NOW, allEvents: [base] });
  const ann = one(open, 'past_client_anniversary');
  assert.equal(ann.dueDate, '2026-03-03');
  assert.equal(ann.suppressed, false);

  const future = {
    eventId: 'future-1',
    company: 'Acme Corp',
    contactEmail: 'buyer@acme.test',
    eventDate: '2026-09-01',
    status: 'Proposal Sent',
    lane: 'pipeline'
  };
  const blocked = evaluateFollowUpCadence(base, { now: NOW, allEvents: [base, future] });
  const b = one(blocked, 'past_client_anniversary');
  assert.equal(b.suppressed, true);
  assert.equal(b.suppressReason, 'future_pipeline_or_active_event');

  const dnc = evaluateFollowUpCadence(
    { ...base, doNotContact: true },
    { now: NOW, allEvents: [base] }
  );
  const d = one(dnc, 'past_client_anniversary');
  assert.equal(d.suppressed, true);
  assert.equal(d.suppressReason, 'do_not_contact');
}

// buildFollowUpDueLane flattens non-suppressed due within horizon
{
  const events = [
    { eventId: 'a', inquiryDate: '2025-11-26', status: 'New Lead', company: 'A' },
    {
      eventId: 'b',
      followedUpAt: '2025-01-01',
      eventDate: '2026-01-15',
      status: 'Client Declined',
      company: 'B'
    },
    {
      eventId: 'c',
      status: 'Booked',
      eventDate: '2025-12-01',
      balanceRemainingCents: 50000,
      lastCorrespondenceAt: '2025-10-01'
    }
  ];
  const lane = buildFollowUpDueLane(events, { now: NOW });
  assert.ok(lane.every((row) => row.suppressed !== true));
  assert.ok(lane.every((row) => row.dueDate <= '2025-12-04')); // today + 7
  assert.ok(lane.some((row) => row.ruleId === 'new_inquiry_unquoted' && row.eventId === 'a'));
  assert.ok(!lane.some((row) => row.eventId === 'b' && row.ruleId === 'stalled_potential'));
  // Ensure sorted by dueDate
  for (let i = 1; i < lane.length; i += 1) {
    assert.ok(lane[i - 1].dueDate <= lane[i].dueDate);
  }
}

console.log('follow-up-cadence.test.mjs: ok');
