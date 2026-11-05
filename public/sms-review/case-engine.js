(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.LVPTSMSCases = api;
})(typeof window === 'undefined' ? null : window, function () {
  'use strict';

  const UNKNOWN = 'unmatched';
  const POSSIBLE_VENUE = /^(venetian|palms|bellagio|allegiant|ritz)/i;
  function cleanText(value, limit = 120) {
    return String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);
  }
  function resolve(item) {
    if (item.matchConfidence === 'explicit_reference_unverified' &&
        item.eventKey && item.eventKey !== UNKNOWN) {
      return { key:cleanText(item.eventKey, 80), label:cleanText(item.eventHint, 90), explicit:true };
    }
    // Older JSON exports have only a "hint". A VENUE by itself is never an event match.
    if (POSSIBLE_VENUE.test(item.eventHint || '') ||
        !item.eventKey || item.eventKey === UNKNOWN)
      return {key:UNKNOWN, label:'Unmatched / needs event identification', explicit:false};
    return {key:UNKNOWN, label:'Unmatched / needs event identification', explicit:false};
  }
  function topicOf(item) {
    const existing = cleanText(item.topic, 110);
    if (existing) return existing;
    if (item.category === 'Finance') return 'Financial messages — verify';
    if (item.category === 'Follow-up') return 'Possible follow-ups — verify';
    if (item.category === 'Lead / sales') return 'Lead / proposal activity';
    if (item.category === 'Event operations') return 'Event operations';
    return 'Other business context';
  }
  function createBundles(findings) {
    if (!Array.isArray(findings)) return [];
    const bundles = new Map();
    const seen = new Set();
    for (const item of findings) {
      if (!item || !item.id || seen.has(item.id)) continue;
      seen.add(item.id);
      const match = resolve(item);
      const topic = topicOf(item);
      const key = match.key + '|' + topic;
      if (!bundles.has(key)) {
        bundles.set(key, {
          key, eventKey:match.key, eventLabel:match.label,
          explicitReference:match.explicit,
          topic, findings:[], financial:topic.toLowerCase().includes('financial') ||
            item.category === 'Finance' || topic.toLowerCase().includes('payment') ||
            topic.toLowerCase().includes('draw') || topic.toLowerCase().includes('cost'),
          latest:'', categories:new Set()
        });
      }
      const b = bundles.get(key);
      b.findings.push(item);
      b.categories.add(item.category);
      if (!b.latest || item.date > b.latest) b.latest = item.date;
      if (item.category === 'Finance') b.financial = true;
    }
    return [...bundles.values()].map(b => ({
      ...b,
      categories:[...b.categories],
      count:b.findings.length,
      sourceCount:b.findings.length,
      sample:b.findings.slice().sort((a,z) => z.date.localeCompare(a.date)).slice(0,3)
    })).sort((a,b) => {
      // Explicit client references first, then money-related verification, then latest activity.
      if (a.explicitReference !== b.explicitReference) return a.explicitReference ? -1 : 1;
      if (a.financial !== b.financial) return a.financial ? -1 : 1;
      return b.latest.localeCompare(a.latest) || a.key.localeCompare(b.key);
    });
  }
  function exportBundleDecisions(bundles, reviews, report) {
    if (!Array.isArray(bundles) || !report) throw new Error('Load a review queue first.');
    const decisions = bundles.flatMap(bundle => {
      const v = reviews[bundle.key];
      if (!v || !v.status || v.status === 'Unreviewed') return [];
      return [{
        event_key_unverified: bundle.eventKey,
        event_label_unverified:bundle.eventLabel,
        topic:bundle.topic,
        status:v.status,
        note:cleanText(v.note,500),
        source_messages:bundle.findings.map(item => ({
          sms_id:item.smsId,
          ...(item.deviceId ? {device_id:item.deviceId} : {}),
          timestamp_utc:item.date
        }))
      }];
    });
    return {
      format:'lvpt_sms_case_review_v1',
      generated_utc:new Date().toISOString(),
      source_scope:report.source || 'local_export',
      since:report.after,
      warning:'Review instructions only. Event associations unverified; no SMS text or accounting updates included.',
      decisions
    };
  }
  return {createBundles, exportBundleDecisions};
});
