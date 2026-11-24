const LEAK_PATTERNS = [
  /sk-[A-Za-z0-9_-]{8,}/,
  /github_pat_[A-Za-z0-9_]{10,}/,
  /ghp_[A-Za-z0-9]{10,}/,
  /ghs_[A-Za-z0-9]{10,}/,
  /gho_[A-Za-z0-9]{10,}/,
  /AKIA[0-9A-Z]{16}/,
  /-----BEGIN [A-Z ]+KEY-----/,
  /xox[baprs]-[A-Za-z0-9-]{10,}/,
  /AIza[0-9A-Za-z_-]{20,}/,
  /Bearer\s+[A-Za-z0-9._-]{8,}/i,
];

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE = /(?:^|[^\d])(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}(?=[^\d]|$)/;
const INJECTION = /ignore (all |any )?(previous|prior) instructions|reveal (the )?(secret|api key|token|system prompt)|you are now /i;

export function containsSensitiveLeak(text) {
  const value = String(text || '');
  return LEAK_PATTERNS.some((pattern) => pattern.test(value)) || EMAIL.test(value) || PHONE.test(value);
}

export function containsInjectionEcho(text) {
  return INJECTION.test(String(text || ''));
}

export function redactSensitive(text) {
  let value = String(text || '');
  value = value.replace(/sk-[A-Za-z0-9_-]{8,}/g, '[redacted]');
  value = value.replace(/github_pat_[A-Za-z0-9_]{10,}/g, '[redacted]');
  value = value.replace(/\bghp_[A-Za-z0-9]{10,}/g, '[redacted]');
  value = value.replace(/\bghs_[A-Za-z0-9]{10,}/g, '[redacted]');
  value = value.replace(/\bgho_[A-Za-z0-9]{10,}/g, '[redacted]');
  value = value.replace(/AKIA[0-9A-Z]{16}/g, '[redacted]');
  value = value.replace(/-----BEGIN [A-Z ]+KEY-----[\s\S]*?-----END [A-Z ]+KEY-----/g, '[redacted]');
  value = value.replace(/xox[baprs]-[A-Za-z0-9-]{10,}/g, '[redacted]');
  value = value.replace(/AIza[0-9A-Za-z_-]{20,}/g, '[redacted]');
  value = value.replace(/Bearer\s+[A-Za-z0-9._-]{8,}/gi, '[redacted]');
  value = value.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]');
  value = value.replace(/(?:^|[^\d])(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}(?=[^\d]|$)/g, (match) => {
    const lead = /^\d/.test(match) ? '' : match[0];
    return `${lead}[redacted-phone]`;
  });
  return value;
}

export function truncate(text, max) {
  const value = String(text || '');
  if (value.length <= max) return value;
  return `${value.slice(0, max)}…`;
}

export function isSafePath(value) {
  if (typeof value !== 'string') return false;
  if (!/^(?!\/)(?!.*\.\.)(?!.*\\)[A-Za-z0-9_./-]{1,180}$/.test(value)) return false;
  if (value.includes('//')) return false;
  return true;
}

const SENSITIVE_RULES = [
  /(^|\/)\.env($|\.)/i,
  /(^|\/)\.github\//i,
  /(^|\/)apps-script\//i,
  /^sql\//i,
  /(^|\/)vercel\.json$/i,
  /^tools\/agent-review-relay\//i,
  /^app\/api\/(gmail|sms|sync)\//i,
  /(secret|credential|private-key|service-account|access-token|api-token)/i,
  /(^|\/)[^/]*token[^/]*\.(json|txt|env|pem)$/i,
  /\.(pem|p12|pfx|key)$/i,
];

export function isSensitivePath(value) {
  return SENSITIVE_RULES.some((pattern) => pattern.test(value));
}

export function classifyFiles(files) {
  if (!Array.isArray(files)) return 'unsafe';
  if (files.length > 100) return 'incomplete';
  for (const file of files) {
    if (!isSafePath(file)) return 'unsafe';
    if (isSensitivePath(file)) return 'sensitive';
  }
  return 'ok';
}

export function extractSafePaths(text) {
  const matches = String(text || '').match(/\b(?:[A-Za-z0-9_.-]+\/)+[A-Za-z0-9_.-]+\b/g) || [];
  const unique = [];
  for (const match of matches) {
    if (!isSafePath(match) || isSensitivePath(match)) continue;
    if (!unique.includes(match)) unique.push(match);
    if (unique.length === 3) break;
  }
  return unique;
}

export function stripMentions(text) {
  return String(text || '').replace(/@[A-Za-z0-9[\]._-]+/g, '').replace(/\s+/g, ' ').trim();
}

export function evidenceKind(evidence) {
  const text = String(evidence?.testSummary || '');
  if (/\bFAIL(?:ED|ING)?\b/i.test(text)) return 'fail';
  if (/\bPASS(?:ED)?\b/i.test(text)) return 'pass';
  return 'unknown';
}
