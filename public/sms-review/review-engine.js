(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.LVPTSMSReview = api;
})(typeof window === 'undefined' ? null : window, function () {
  'use strict';
  const MAX_MESSAGES = 100000;
  const BUSINESS_SIGNAL = /\b(?:poker|lvpt|training|tournament|lesson|venetian|palms|nium|mosaic|neo\s?(?:2025|2026)?|ows|aws|reinvent|certapro|ritz|bellagio|wsop|kenna|madsen|jeff|pro(?:s|fessional)?|dealers?|cards?|decks?|chips?|banquet|tables?|invoic(?:e|ed|ing)|quote|quoted|proposal|corporate|client|customer|booking|vendor|staff|transportation|rides?|shuttle|blackjack|event|21\s*fun|21fun|troph(?:y|ies))\b/i;
  const PERSONAL_ONLY = /\b(?:surgery|hospital|stock market|share price|wife|girlfriend|dating|my kids?|lawsuit|doctor appointment|diagnosis|family problem)\b/i;
  const FINANCE = /\b(?:paid|paying|pay|payment|invoice|invoic(?:ing|ed)|deposit|balance|owed|owe|cost|budget|fee|refund|receipt|transfer|reimburs|settle|split|profit|payout|due|venmo|zelle|ach|card charge|expense|draws?)\b/i;
  const OPERATIONS = /\b(?:confirmed|scheduled|booked|booking|vendor|pro(?:s)?|dealer|venue|table|transport|truck|driver|session|tournament|staff|fly|flight|hotel|banquet|set.?up|equipment|cards|decks|arrival|run.?of.?show|event)\b/i;
  const FOLLOW_UP = /\b(?:follow.?up|remind|waiting|haven.t heard|not heard|checking in|check (?:in|email)|need to|will (?:email|call)|please (?:send|call|check)|asap|tomorrow|deadline|by friday|still need|let me know|send (?:over|out)|call (?:back|me)|pending|no response)\b/i;
  const LEADS = /\b(?:lead|inquir(?:y|ies)|request|prospect|client|customer|repeat|quote|proposal|potential|referral|interested|close|closing|pitch|booking)\b/i;
  const MONEY = /\$\s?[\d,]+(?:\.\d{1,2})?/g;
  const EVENT_PATTERNS = [
    ['NIUM', /\bnium\b/i],
    ['Mosaic / Neo', /\b(?:mosaic|neo\s*2026|neo\s*reunion|ritz.carlton)\b/i],
    ['OWS / AWS', /\b(?:ows|aws\s*re.?invent|allegiant)\b/i],
    ['CertaPro', /\bcertapro\b/i],
    ['Venetian', /\bvenetian\b/i],
    ['Palms', /\bpalms\b/i],
    ['B-Stock', /\bb.stock\b/i],
  ];
  function asRecord(input) {
    let parsed = input;
    if (typeof parsed === 'string') parsed = JSON.parse(parsed);
    if (!parsed || parsed.format !== 'lvpt_sms_history_v1' || !Array.isArray(parsed.messages))
      throw new Error('Not a supported LVPT SMS JSON export.');
    if (parsed.messages.length > MAX_MESSAGES) throw new Error('Export exceeds the 100,000-message safety limit.');
    if (parsed.messages.some(m => !m || !Number.isFinite(m.timestamp_ms) || !['incoming', 'outgoing'].includes(m.direction) || typeof m.body !== 'string' || !Number.isSafeInteger(m.sms_id)))
      throw new Error('Some SMS records have unsupported IDs, dates, directions, or message bodies.');
    return parsed;
  }
  function redacted(source) {
    return String(source || '')
      .replace(/https?:\/\/\S+/gi, '[link omitted]')
      .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email omitted]')
      .replace(/(?:\+?1[\s.\-]?)?\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}\b/g, '[phone omitted]')
      .replace(/\b\d{8,17}\b/g, '[number omitted]')
      .replace(/\s+/g, ' ').trim().slice(0, 230);
  }
  function classify(message) {
    const body = message.body || '';
    if (body.length < 10) return null;
    if (!BUSINESS_SIGNAL.test(body)) return null;
    if (PERSONAL_ONLY.test(body) && !/\b(?:invoice|poker|client|event|payment|pro|vendor|booked)\b/i.test(body)) return null;
    let category = 'Business context';
    if (FINANCE.test(body) || /\$\s?[\d,]+/.test(body)) category = 'Finance';
    else if (FOLLOW_UP.test(body)) category = 'Follow-up';
    else if (LEADS.test(body)) category = 'Lead / sales';
    else if (OPERATIONS.test(body)) category = 'Event operations';
    const label = EVENT_PATTERNS.find(([, pattern]) => pattern.test(body));
    const eventHint = label ? label[0] : 'Unmatched — confirm event';
    const amounts = [...new Set((body.match(MONEY) || []).slice(0, 8))];
    const reviewAction = category === 'Finance'
      ? 'Compare with invoices, receipts and bank records. Do not infer that a payment cleared.'
      : category === 'Follow-up'
        ? 'Check whether this follow-up was completed; historical mentions may be resolved.'
        : category === 'Lead / sales'
          ? 'Match against the current lead pipeline before creating a new lead.'
          : 'Check event details and whether the action was already completed.';
    return { category, eventHint, amounts, reviewAction };
  }
  function analyze(exportData, options = {}) {
    const data = asRecord(exportData);
    const after = options.after || '2026-01-01';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(after) || !Number.isFinite(Date.parse(after + 'T00:00:00Z')))
      throw new Error('Please choose a valid start date.');
    const cutoff = Date.parse(after + 'T00:00:00Z');
    const ids = new Set();
    const findings = [];
    let duplicates = 0;
    let afterDateCount = 0;
    let personalOrUnmatched = 0;
    for (const m of data.messages) {
      if (ids.has(m.sms_id)) { duplicates++; continue; }
      ids.add(m.sms_id);
      if (m.timestamp_ms < cutoff) continue;
      afterDateCount++;
      const label = classify(m);
      if (!label) { personalOrUnmatched++; continue; }
      findings.push({
        id: 'sms-' + m.sms_id,
        smsId: m.sms_id,
        date: new Date(m.timestamp_ms).toISOString(),
        direction: m.direction,
        category: label.category,
        eventHint: label.eventHint,
        amounts: label.amounts,
        excerpt: redacted(m.body),
        reviewAction: label.reviewAction,
      });
    }
    findings.sort((a, b) => b.date.localeCompare(a.date));
    return { contact: String(data.contact_name || 'Approved contact').slice(0, 80),
      count: data.messages.length, afterDateCount, excludedCount: personalOrUnmatched,
      duplicateCount: duplicates, findings, after };
  }
  function exportDecisions(report, statuses) {
    if (!report || !Array.isArray(report.findings)) throw new Error('Load a report first.');
    const decisions = report.findings.flatMap(f => {
      const decision = statuses[f.id];
      if (!decision || decision.status === 'Unreviewed') return [];
      return [{
        source_system: 'lvpt_android_sms', source_sms_id: f.smsId,
        ...(f.deviceId ? {source_device_id: f.deviceId} : {}),
        source_time_utc: f.date, direction: f.direction,
        event_hint_unverified: f.eventHint, category: f.category,
        status: decision.status, reviewer_note: String(decision.note || '').slice(0, 500),
      }];
    });
    return { format: 'lvpt_sms_review_decisions_v1', source_contact: report.contact,
      source_record_count: report.count, created_utc: new Date().toISOString(),
      warning: 'Review decisions only. No accounting entries or event records have been changed.',
      decisions };
  }
  return { asRecord, redacted, classify, analyze, exportDecisions };
});
