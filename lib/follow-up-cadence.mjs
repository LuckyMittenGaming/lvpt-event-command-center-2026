/**
 * LVPT follow-up cadence — pure read-only rules.
 * Browser mirror: public/v2/js/follow-up-cadence.js (keep in sync).
 * Tests import from this module.
 */

function text(value) {
  return String(value == null ? '' : value).trim();
}

function parseDateOnly(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, '0');
    const d = String(value.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const raw = text(value);
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function toUtcDate(isoDate) {
  const iso = parseDateOnly(isoDate);
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function formatIsoDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addCalendarDays(isoDate, days) {
  const date = toUtcDate(isoDate);
  if (!date) return '';
  date.setUTCDate(date.getUTCDate() + Number(days));
  return formatIsoDate(date);
}

/**
 * Add N business days (skip Sat/Sun). days may be negative.
 */
export function addBusinessDays(isoDate, days) {
  const date = toUtcDate(isoDate);
  if (!date) return '';
  const step = days >= 0 ? 1 : -1;
  let remaining = Math.abs(Number(days) || 0);
  while (remaining > 0) {
    date.setUTCDate(date.getUTCDate() + step);
    const dow = date.getUTCDay();
    if (dow !== 0 && dow !== 6) remaining -= 1;
  }
  return formatIsoDate(date);
}

function daysBetween(aIso, bIso) {
  const a = toUtcDate(aIso);
  const b = toUtcDate(bIso);
  if (!a || !b) return null;
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

function sameCalendarMonth(aIso, bIso) {
  const a = parseDateOnly(aIso);
  const b = parseDateOnly(bIso);
  if (!a || !b) return false;
  return a.slice(0, 7) === b.slice(0, 7);
}

function normalizeNow(now) {
  if (now instanceof Date && !Number.isNaN(now.getTime())) return now;
  if (typeof now === 'string' && text(now)) {
    const parsed = new Date(now);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

function nowIsoDate(now) {
  return formatIsoDate(normalizeNow(now));
}

function statusLower(input) {
  return text(input && (input.status || input.stage || input.lifecycleStatus)).toLowerCase();
}

function isDeclinedOrLost(input) {
  const s = statusLower(input);
  return /\bdeclined\b|\blost\b|\bcancelled\b|\bcanceled\b|\bdo not contact\b/.test(s) ||
    input?.doNotContact === true;
}

function isBooked(input) {
  const s = statusLower(input);
  if (input?.booked === true) return true;
  return /\bbooked\b|\bdeposit\s+paid\b|\bpayment\s+processing\b|\bactive\b/.test(s) &&
    !/\bunbooked\b|\bpipeline\b|\bproposal\b|\binquiry\b/.test(s);
}

function isCompleted(input, eventDate, today) {
  const s = statusLower(input);
  if (/\bcompleted\b|\bpast\b|\bwrote\b|\bwrapped\b/.test(s)) return true;
  if (eventDate && today && eventDate < today && (isBooked(input) || /\bcompleted\b/.test(s))) {
    return true;
  }
  return false;
}

function depositPaid(input) {
  if (input?.depositPaid === true) return true;
  const s = statusLower(input);
  return /\bdeposit\s+paid\b|\bbooked\b|\bpaid\s+in\s+full\b/.test(s);
}

function item(partial) {
  return {
    ruleId: partial.ruleId,
    ruleName: partial.ruleName,
    reasonForContact: partial.reasonForContact || '',
    suggestedAngle: partial.suggestedAngle || '',
    dueDate: partial.dueDate || '',
    pinToday: partial.pinToday === true,
    suppressed: partial.suppressed === true,
    suppressReason: partial.suppressReason || ''
  };
}

function localYmdInZone(date, timeZone) {
  const tz = timeZone || 'America/Los_Angeles';
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(date);
    const get = (type) => parts.find((p) => p.type === type)?.value || '';
    return `${get('year')}-${get('month')}-${get('day')}`;
  } catch {
    return formatIsoDate(date);
  }
}

function hasFuturePipelineEvent(input, allEvents, today) {
  const company = text(input?.company).toLowerCase();
  const email = text(input?.contactEmail || input?.email).toLowerCase();
  if (!company && !email) return false;
  const selfId = text(input?.eventId || input?.id);
  const list = Array.isArray(allEvents) ? allEvents : [];
  for (const other of list) {
    if (!other) continue;
    const otherId = text(other.eventId || other.id);
    if (selfId && otherId && selfId === otherId) continue;
    const otherCompany = text(other.company).toLowerCase();
    const otherEmail = text(other.contactEmail || other.email).toLowerCase();
    const match =
      (company && otherCompany && company === otherCompany) ||
      (email && otherEmail && email === otherEmail);
    if (!match) continue;
    const otherDate = parseDateOnly(other.eventDate || other.date);
    if (!otherDate || otherDate <= today) continue;
    const lane = text(other.lane || other.pipelineLane || other.status).toLowerCase();
    if (
      /\bpipeline\b|\bactive\b|\bbooked\b|\bproposal\b|\bhold\b|\binquiry\b|\bopen\b/.test(lane) ||
      other.pipeline === true ||
      other.active === true
    ) {
      return true;
    }
    // Status-based active/pipeline
    const os = text(other.status).toLowerCase();
    if (
      /\bpipeline\b|\bactive\b|\bbooked\b|\bproposal\b|\bhold\b|\bnew lead\b|\bquote\b|\binvoice\b/.test(os) &&
      !/\bdeclined\b|\blost\b|\bcancelled\b|\bcompleted\b/.test(os)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Evaluate all 10 follow-up cadence rules for one opportunity/event.
 * @returns {Array<object>}
 */
export function evaluateFollowUpCadence(input, options = {}) {
  const now = normalizeNow(options.now);
  const today = nowIsoDate(now);
  const allEvents = options.allEvents || [];
  const results = [];

  const inquiryDate = parseDateOnly(input?.inquiryDate || input?.createdAt || input?.leadDate);
  const quoteSentAt = parseDateOnly(input?.quoteSentAt || input?.proposalSentAt);
  const proposalSentAt = parseDateOnly(input?.proposalSentAt || input?.quoteSentAt);
  const outboundReplyAt = parseDateOnly(input?.outboundReplyAt || input?.firstOutboundAt);
  const replyAt = parseDateOnly(input?.replyAt || input?.clientReplyAt || input?.lastReplyAt);
  const followedUpAt = parseDateOnly(input?.followedUpAt || input?.lastFollowUpAt);
  const eventDate = parseDateOnly(input?.eventDate || input?.date);
  const lastContactAt = parseDateOnly(input?.lastContactAt || input?.lastTouchAt);
  const invoiceSentAt = parseDateOnly(input?.invoiceSentAt);
  const lastCorrespondenceAt = parseDateOnly(
    input?.lastCorrespondenceAt || input?.lastContactAt || input?.lastTouchAt
  );
  const lastYearEventDate = parseDateOnly(
    input?.lastYearEventDate || input?.priorEventDate || input?.anniversarySourceDate
  );
  const timeZone = text(input?.timeZone || input?.timezone) || 'America/Los_Angeles';
  const balanceRemainingCents = Number(input?.balanceRemainingCents);
  const unbooked = !isBooked(input) && !isCompleted(input, eventDate, today);

  // --- 1. new_inquiry_unquoted ---
  {
    const ruleId = 'new_inquiry_unquoted';
    if (inquiryDate && !quoteSentAt && !outboundReplyAt) {
      const due = addCalendarDays(inquiryDate, 1);
      const windowEnd = addCalendarDays(inquiryDate, 2);
      const overdueUnquoted = today > windowEnd;
      const inWindow = today >= due && today <= windowEnd;
      if (inWindow || overdueUnquoted) {
        results.push(
          item({
            ruleId,
            ruleName: 'New Inquiry — Unquoted',
            reasonForContact: 'Inquiry has no quote or outbound reply yet',
            suggestedAngle: 'Send a tailored quote or discovery follow-up',
            dueDate: due,
            pinToday: false
          })
        );
      }
    }
  }

  // --- 2. quote_proposal_sent ---
  {
    const ruleId = 'quote_proposal_sent';
    if (proposalSentAt && !replyAt) {
      const firstDue = addBusinessDays(proposalSentAt, 3);
      const secondDue = addBusinessDays(proposalSentAt, 10);
      if (today >= secondDue) {
        results.push(
          item({
            ruleId,
            ruleName: 'Proposal Follow-Up (2nd touch)',
            reasonForContact: 'No reply 10 business days after proposal',
            suggestedAngle: 'Second touch — check interest or offer options',
            dueDate: secondDue,
            pinToday: false
          })
        );
      } else if (today >= firstDue) {
        results.push(
          item({
            ruleId,
            ruleName: 'Proposal Follow-Up',
            reasonForContact: 'No reply 3 business days after proposal',
            suggestedAngle: 'Light check-in on the proposal',
            dueDate: firstDue,
            pinToday: false
          })
        );
      }
    }
  }

  // --- 3. stalled_potential ---
  {
    const ruleId = 'stalled_potential';
    if (followedUpAt && !replyAt) {
      if (isDeclinedOrLost(input)) {
        results.push(
          item({
            ruleId,
            ruleName: 'Stalled Potential',
            reasonForContact: 'Followed up with no reply',
            suggestedAngle: 'Re-engage before the event window',
            dueDate: eventDate ? addCalendarDays(eventDate, -60) : '',
            suppressed: true,
            suppressReason: 'declined_or_lost'
          })
        );
      } else if (!eventDate) {
        results.push(
          item({
            ruleId,
            ruleName: 'Stalled Potential',
            reasonForContact: 'Followed up with no reply',
            suggestedAngle: 'Re-engage before the event window',
            dueDate: '',
            suppressed: true,
            suppressReason: 'no_event_date'
          })
        );
      } else {
        results.push(
          item({
            ruleId,
            ruleName: 'Stalled Potential',
            reasonForContact: 'Followed up with no reply — event approaching',
            suggestedAngle: 'Re-engage 60 days before the event',
            dueDate: addCalendarDays(eventDate, -60),
            pinToday: false
          })
        );
      }
    }
  }

  // --- 4. short_fuse ---
  {
    const ruleId = 'short_fuse';
    if (inquiryDate && eventDate && unbooked) {
      const daysToEvent = daysBetween(inquiryDate, eventDate);
      const short =
        sameCalendarMonth(inquiryDate, eventDate) ||
        (daysToEvent != null && daysToEvent < 30 && daysToEvent >= 0);
      if (short) {
        const due = addCalendarDays(eventDate, -14);
        let suppressed = false;
        let suppressReason = '';
        if (lastContactAt) {
          const daysSinceContact = daysBetween(lastContactAt, today);
          if (daysSinceContact != null && daysSinceContact < 4) {
            suppressed = true;
            suppressReason = 'contacted_within_4_days';
          }
        }
        results.push(
          item({
            ruleId,
            ruleName: 'Short-Fuse Opportunity',
            reasonForContact: 'Inquiry close to event date and still unbooked',
            suggestedAngle: 'Urgent booking / deposit nudge',
            dueDate: due,
            suppressed,
            suppressReason
          })
        );
      }
    }
  }

  // --- 5. invoiced_awaiting_deposit ---
  {
    const ruleId = 'invoiced_awaiting_deposit';
    if (invoiceSentAt && !depositPaid(input)) {
      const s = statusLower(input);
      const alreadyBookedPaid = /\bdeposit\s+paid\b|\bbooked\b/.test(s);
      if (!alreadyBookedPaid) {
        results.push(
          item({
            ruleId,
            ruleName: 'Invoiced — Awaiting Deposit',
            reasonForContact: 'Invoice sent; deposit still unpaid',
            suggestedAngle: 'Polite deposit reminder',
            dueDate: addBusinessDays(invoiceSentAt, 5),
            pinToday: false
          })
        );
      }
    }
  }

  // --- 6. booked_pre_event ---
  {
    const ruleId = 'booked_pre_event';
    if (isBooked(input) && eventDate) {
      const due = addCalendarDays(eventDate, -7);
      const cutoff = addCalendarDays(eventDate, -14);
      // Zero correspondence in prior 14 days: lastCorrespondence older than eventDate-14 or missing.
      const lacksRecent14 = !lastCorrespondenceAt || lastCorrespondenceAt < cutoff;
      if (lacksRecent14) {
        results.push(
          item({
            ruleId,
            ruleName: 'Booked Pre-Event Check-In',
            reasonForContact: 'Booked with no correspondence in the 14 days before week-of',
            suggestedAngle: 'Confirm logistics and guest count',
            dueDate: due,
            pinToday: false
          })
        );
      }
    }
  }

  // --- 7. booked_final_balance ---
  {
    const ruleId = 'booked_final_balance';
    if (isBooked(input) && eventDate && Number.isFinite(balanceRemainingCents) && balanceRemainingCents > 0) {
      results.push(
        item({
          ruleId,
          ruleName: 'Final Balance Reminder',
          reasonForContact: 'Booked with remaining balance',
          suggestedAngle: 'Request final balance before the event',
          dueDate: addCalendarDays(eventDate, -14),
          pinToday: false
        })
      );
    }
  }

  // --- 8. booked_day_of ---
  {
    const ruleId = 'booked_day_of';
    if (isBooked(input) && eventDate) {
      const localToday = localYmdInZone(now, timeZone);
      if (localToday === eventDate) {
        results.push(
          item({
            ruleId,
            ruleName: "Today's Check-In",
            reasonForContact: 'Event is today',
            suggestedAngle: 'Day-of logistics and on-site confirmation',
            dueDate: eventDate,
            pinToday: true
          })
        );
      }
    }
  }

  // --- 9. post_event_wrap ---
  {
    const ruleId = 'post_event_wrap';
    if (eventDate && isCompleted(input, eventDate, today)) {
      results.push(
        item({
          ruleId,
          ruleName: 'Post-Event Wrap',
          reasonForContact: 'Event completed — wrap-up and thank-you',
          suggestedAngle: 'Thank-you, testimonial, and next-year interest',
          dueDate: addBusinessDays(eventDate, 2),
          pinToday: false
        })
      );
    }
  }

  // --- 10. past_client_anniversary ---
  {
    const ruleId = 'past_client_anniversary';
    if (lastYearEventDate) {
      // Due = anniversary of lastYearEventDate (one year later) minus 90 days.
      const sourceYear = Number(lastYearEventDate.slice(0, 4));
      const md = lastYearEventDate.slice(5);
      const nextAnniversary = `${sourceYear + 1}-${md}`;
      const due = addCalendarDays(nextAnniversary, -90);

      let suppressed = false;
      let suppressReason = '';
      if (input?.doNotContact === true) {
        suppressed = true;
        suppressReason = 'do_not_contact';
      } else if (hasFuturePipelineEvent(input, allEvents, today)) {
        suppressed = true;
        suppressReason = 'future_pipeline_or_active_event';
      }

      results.push(
        item({
          ruleId,
          ruleName: 'Past Client Anniversary',
          reasonForContact: 'Approaching anniversary of prior event',
          suggestedAngle: 'Seasonal rebooking outreach',
          dueDate: due,
          suppressed,
          suppressReason
        })
      );
    }
  }

  return results;
}

/**
 * Flatten non-suppressed cadence items due on or before now, or within the next 7 days.
 */
export function buildFollowUpDueLane(events, options = {}) {
  const now = normalizeNow(options.now);
  const today = nowIsoDate(now);
  const horizon = addCalendarDays(today, 7);
  const list = Array.isArray(events) ? events : [];
  const allEvents = options.allEvents || list;
  const items = [];

  for (const event of list) {
    const evaluated = evaluateFollowUpCadence(event, { ...options, now, allEvents });
    for (const row of evaluated) {
      if (row.suppressed) continue;
      if (!row.dueDate) continue;
      if (row.dueDate <= horizon) {
        items.push({
          ...row,
          eventId: text(event?.eventId || event?.id),
          company: text(event?.company),
          contactEmail: text(event?.contactEmail || event?.email)
        });
      }
    }
  }

  items.sort((a, b) => {
    if (a.dueDate < b.dueDate) return -1;
    if (a.dueDate > b.dueDate) return 1;
    return String(a.ruleId).localeCompare(String(b.ruleId));
  });
  return items;
}

export default {
  addBusinessDays,
  evaluateFollowUpCadence,
  buildFollowUpDueLane
};
