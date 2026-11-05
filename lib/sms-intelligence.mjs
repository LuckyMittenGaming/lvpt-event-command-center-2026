/*
 * SMS business signals — deterministic owner-only staging pilot.
 * Never treat SMS mentions as proof of settlement or an instruction to update an event.
 * Patterns are intentionally conservative. A generic venue or vendor cannot identify a client.
 */
const EVENT_RULES = [
  { key: 'nium', label: 'NIUM', rosterId: 'evt-nium-2026',
    pattern: /\bnium\b/i },
  { key: 'mosaic-neo', label: 'Mosaic / NEO — verify year', rosterId: 'evt-neo-reunion-2026',
    pattern: /\bmosaic(?:\s+events?)?\b|\bneo(?:\s*(?:reunion|2025|2026))\b/i },
  { key: 'ows-aws', label: 'OWS / AWS re:Invent', rosterId: null,
    pattern: /\bows\b|\baws\s*(?:re\s*[:\-]?\s*invent|reinvent)\b/i },
  { key: 'certapro', label: 'CertaPro Painters', rosterId: null,
    pattern: /\bcertapro\b|\bcertainty\s+(?:double\s+session|edge)\b/i },
  { key: 'lineaje', label: 'Lineaje', rosterId: 'evt-lineaje-2026',
    pattern: /\blineaje\b/i },
  { key: 'blackedge', label: 'BlackEdge Capital', rosterId: null,
    pattern: /\bblackedge\b/i },
  { key: 'kirkland', label: 'Kirkland & Ellis', rosterId: null,
    pattern: /\bkirkland(?:\s*(?:&|and)\s*ellis)?\b/i },
  { key: 'quinn-emanuel', label: 'Quinn Emanuel', rosterId: null,
    pattern: /\bquinn\s+emanuel\b/i },
  { key: 'lithic', label: 'Lithic', rosterId: null,
    pattern: /\blithic\b/i },
  { key: 'odysseys', label: 'Odysseys Unlimited', rosterId: null,
    pattern: /\bodysseys?\s+unlimited\b/i },
  { key: 'zynga', label: 'Zynga', rosterId: null,
    pattern: /\bzynga\b/i },
  { key: 'doberman', label: 'Doberman', rosterId: null,
    pattern: /\bdoberman\b/i },
  { key: 'cowbell', label: 'Cowbell', rosterId: null,
    pattern: /\bcowbell\b/i }
];

const BUSINESS = /\b(?:poker|lvpt|training|tournament|lesson|venetian|palms|nium|mosaic|neo\b|ows|aws|allegiant|certapro|ritz|bellagio|wsop|kenna|madsen|jeff|pro(?:s|fessional)?|dealers?|cards?|decks?|chips?|banquet|tables?|invoic(?:e|ed|ing)|quote|quoted|proposal|corporate|client|customer|booking|vendor|staff|transportation|rides?|shuttle|blackjack|event|21\s*fun|21fun|troph(?:y|ies))\b/i;
const PERSONAL = /\b(?:wife|girlfriend|dating|stock market|share price|doctor|surgery|my kids?|personal lawsuit)\b/i;
const FINANCE = /\b(?:paid|paying|pay|payment|invoice|deposit|balance|owed|owe|expense|receipt|reimburs|refund|draws?|distribution|transfer|vendor|profit|cost|pricing|split|payout|fee|ach|venmo|zelle)\b|\$\s?[\d,]+/i;
// A figure in a website/valuation conversation is NOT evidence of an LVPT payment.
const HARD_FINANCE = /\b(?:invoice|deposit|payment|paid|paying|owed|owe|outstanding|balance|ach|venmo|zelle|transfer|payout|draws?|distribution|reimburs|refund|receipt|expense)\b/i;
const OWNER_DRAWS = /\b(?:draws?|owner\s*(?:distribution|split)|partner\s*(?:distribution|draw|split)|distributions?|payout|profit\s*split|split\s*(?:it|that)|take\s*(?:out|a\s*draw))\b/i;
const DIGITAL_DISCUSSION = /\b(?:websites?|web\s+sites?|web\s+development|app\s+development|software|domain|url|seo|github|vercel|coding|developer|programmer|digital\s+asset)\b/i;
const SOFT_PRICING = /\b(?:worth|valuation|value|pricing|quote|quoted|proposal|estimate|budget|rates?)\b/i;
const VENDOR_ROLE = /\b(?:vendor|contractor|subcontractor|supplier|printer|developer|bartender|instructor|pro\s*fee|dealer\s*fee|travel\s*reimbursement|hotel\s*reimbursement)\b/i;
const FOLLOW_UP = /\b(?:follow.up|waiting|remind|haven.t heard|no response|tomorrow|please (?:call|send)|still need|check email|asap)\b/i;
const LEAD = /\b(?:client|lead|inquiry|request|prospect|quote|proposal|rebooking|referral|potential)\b/i;
const OPERATIONS = /\b(?:event|tournament|staff|booking|training|pro|dealers?|venue|transportation|tables?|equipment|confirmed|run.of.show)\b/i;

export function matchEvent(text) {
  const matches = EVENT_RULES.filter(rule => rule.pattern.test(text));
  if (matches.length !== 1) {
    return {
      eventKey: 'unmatched',
      eventHint: matches.length ? 'Multiple event references — verify' : 'Unmatched — verify event',
      matchConfidence: 'unverified',
      eventId: null,
      matchReason: matches.length ? 'More than one client/event mentioned' : 'No unique client/event name detected'
    };
  }
  const only = matches[0];
  return {
    eventKey: only.key,
    eventHint: only.label,
    matchConfidence: 'explicit_reference_unverified',
    eventId: only.rosterId,
    matchReason: 'Client/event name appears in SMS; year and current record must be confirmed'
  };
}

export function classifyBusinessSms(input) {
  const body = String(input || '');
  if (body.length < 10) return null;
  const event = matchEvent(body);
  // A unique client name can identify business context even without poker keywords.
  if (!BUSINESS.test(body) && event.eventKey === 'unmatched') return null;
  if (PERSONAL.test(body) && !/\b(?:invoice|poker|client|event|payment|vendor)\b/i.test(body)) return null;

  const strongFinancialClaim = HARD_FINANCE.test(body) || OWNER_DRAWS.test(body);
  const digitalContextOnly = DIGITAL_DISCUSSION.test(body) && !strongFinancialClaim;
  const marketingOrQuote = SOFT_PRICING.test(body) && !strongFinancialClaim;
  // Financial discussions without an invoice/transfer/payout are not receivables.
  // These conservative overrides may increase false negatives (manual review still available).
  const category = digitalContextOnly ? (LEAD.test(body) && /\b(?:proposal|quote|client|prospect)\b/i.test(body)
      ? 'Lead / sales' : 'Business context')
    : marketingOrQuote ? 'Lead / sales'
    : FINANCE.test(body) ? 'Finance'
    : FOLLOW_UP.test(body) ? 'Follow-up'
    : LEAD.test(body) ? 'Lead / sales'
    : OPERATIONS.test(body) ? 'Event operations'
    : 'Business context';

  let topic = 'General business context';
  if (category === 'Finance') {
    if (OWNER_DRAWS.test(body)) topic = 'Owner draws / distributions';
    else if (VENDOR_ROLE.test(body)) topic = 'Costs / vendors — verify';
    else if (/\b(?:invoice|deposit|payment|paid|ach|received|balance|due|outstanding|owed|owe)\b/i.test(body)) topic = 'Payments / receivables — verify';
    else if (/\b(?:vendor|cost|expense|receipt|fee|flights?|hotel|transportation|bartender|dealer|cards?|decks?|reimburs)\b/i.test(body)) topic = 'Costs / vendors — verify';
    else topic = 'Other financial notes — verify';
  } else if (digitalContextOnly && category === 'Business context') {
    topic = 'Digital assets / website strategy — context only';
  } else if (category === 'Follow-up') topic = 'Possible follow-ups — check current status';
  else if (category === 'Lead / sales') topic = 'Lead / proposal activity';
  else if (category === 'Event operations') {
    if (/\b(?:vendor|dealer|staff|pro|kenna|madsen|travel|flight|rides?|transportation)\b/i.test(body)) topic = 'Staff / vendor logistics';
    else topic = 'Event logistics / decisions';
  }
  const amounts = [...new Set((body.match(/\$\s?[\d,]+(?:\.\d{1,2})?/g) || []).slice(0, 6))];
  const financialSignal = category !== 'Finance' ? 'not_an_obligation'
    : strongFinancialClaim ? 'historical_claim_unverified' : 'cost_or_amount_discussion';
  return { ...event, category, topic, financialSignal, amounts, excerpt: redactSmsExcerpt(body) };
}

export function redactSmsExcerpt(body) {
  return String(body || '')
    .replace(/https?:\/\/\S+/gi, '[link omitted]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email omitted]')
    .replace(/(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g, '[phone omitted]')
    .replace(/\b\d{8,17}\b/g, '[number omitted]')
    .replace(/\s+/g, ' ').trim().slice(0, 180);
}
