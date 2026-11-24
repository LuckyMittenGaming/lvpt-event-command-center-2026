(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.LVPTEventStatus = api;
})(typeof window === 'undefined' ? null : window, function () {
  'use strict';

  const TIME_ZONE = 'America/Los_Angeles';

  function normalizeStatus(value) {
    return String(value ?? '').replace(/[\u2012\u2013\u2014\u2015]/g, '-').replace(/\s+/g, ' ').trim();
  }

  function classifyStatus(value) {
    const raw = normalizeStatus(value);
    const key = raw.toLowerCase();
    let stage = 'unknown';
    if (!key || /^(unknown|n\/a|not provided|tbd)$/.test(key)) stage = 'unknown';
    else if (/^(declined|lost|closed lost|not moving forward|client declined)$/.test(key)) stage = 'declined';
    else if (/^(cancelled|canceled)$/.test(key)) stage = 'cancelled';
    else if (key === 'closed won') stage = 'closed_won';
    else if (key === 'outcome unverified') stage = 'unknown';
    else if (key === 'closed') stage = 'unknown_closure';
    else if (/^(completed|complete|resolved|done)$/.test(key)) stage = 'completed';
    else if (/^booked\s*-\s*payment processing$/.test(key)) stage = 'payment_processing';
    else if (/invoice sent\s*\/\s*awaiting deposit/.test(key)) stage = 'invoice_awaiting_deposit';
    else if (/^(deposit paid|booked|pre-production|event day|paid in full)$/.test(key)) stage = 'booked';
    else if (key === 'invoice sent') stage = 'invoice_sent';
    else if (/^(new lead|needs discovery|quote needed|proposal sent)$/.test(key)) stage = 'open';
    return { raw, stage, timeZone: TIME_ZONE };
  }

  function todayIso(now) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now || new Date());
  }

  function normalizeEventDate(value) {
    const raw = String(value ?? '').trim();
    if (!raw) return { iso: '', raw: '', timeZone: TIME_ZONE, recognized: false };
    let match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) {
      const us = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (us) match = [raw, us[3], us[1].padStart(2, '0'), us[2].padStart(2, '0')];
    }
    if (!match) return { iso: '', raw, timeZone: TIME_ZONE, recognized: false };
    const iso = `${match[1]}-${match[2]}-${match[3]}`;
    const parsed = new Date(`${iso}T12:00:00-08:00`);
    if (Number.isNaN(parsed.getTime())) return { iso: '', raw, timeZone: TIME_ZONE, recognized: false };
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(parsed);
    if (parts !== iso) return { iso: '', raw, timeZone: TIME_ZONE, recognized: false };
    return { iso, raw, timeZone: TIME_ZONE, recognized: true };
  }

  function eventLane(event, today) {
    const classified = classifyStatus(event && event.status);
    const date = normalizeEventDate(event && (event.eventDateRaw || event.eventDate));
    const day = today || todayIso();
    const past = Boolean(date.recognized && date.iso < day);
    const closed = ['declined', 'cancelled', 'completed', 'closed_won', 'unknown_closure'].includes(classified.stage);
    let lane = 'review';
    if (closed || past) lane = 'past';
    else if (classified.stage === 'booked' || classified.stage === 'payment_processing') lane = 'active';
    else if (classified.stage === 'open' || classified.stage === 'invoice_sent' || classified.stage === 'invoice_awaiting_deposit') lane = 'pipeline';
    return { raw: classified.raw, stage: classified.stage, lane, past, completed: classified.stage === 'completed', date, timeZone: TIME_ZONE };
  }

  function quoteCoverage(event) {
    const lines = event && Array.isArray(event.quote) ? event.quote : null;
    if (!lines) return { pricedCents: null, costCents: null, costKnown: false, priced: false, recordedZero: false };
    let pricedCents = 0;
    let costCents = 0;
    let priced = false;
    let recordedZero = false;
    let costKnown = true;
    lines.forEach((line) => {
      const quantity = Number(line && line.quantity);
      const price = Number(line && line.unitPrice);
      if (!Number.isFinite(quantity) || !Number.isFinite(price)) {
        costKnown = false;
        return;
      }
      if (quantity === 0 || price === 0) {
        recordedZero = true;
        return;
      }
      if (quantity < 0 || price < 0) {
        costKnown = false;
        return;
      }
      priced = true;
      pricedCents += Math.round(quantity * price * 100);
      const cost = line ? line.internalCost : undefined;
      if (cost === undefined || cost === null || cost === '' || !Number.isFinite(Number(cost))) costKnown = false;
      else costCents += Math.round(quantity * Number(cost) * 100);
    });
    if (!priced) return { pricedCents: recordedZero ? 0 : null, costCents: null, costKnown: false, priced: false, recordedZero };
    return { pricedCents, costCents: costKnown ? costCents : null, costKnown, priced: true, recordedZero: false };
  }

  return { TIME_ZONE, normalizeStatus, classifyStatus, todayIso, normalizeEventDate, eventLane, quoteCoverage };
});
