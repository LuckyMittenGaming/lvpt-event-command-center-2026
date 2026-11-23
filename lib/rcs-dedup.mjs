import { createHash } from 'node:crypto';
import { contactHash, normalizePhone } from './sms-bridge.mjs';

const WINDOW_MS = 5000;

export function bodyFingerprint(body) {
  return createHash('sha256').update(String(body ?? ''), 'utf8').digest('hex');
}

function identity(message) {
  if (message.source === 'sms') {
    const smsId = Number(message.smsId);
    return Number.isSafeInteger(smsId) && smsId > 0 ? `sms:${message.deviceId}:${smsId}` : '';
  }
  const googleId = String(message.googleMessageId || '').trim();
  return googleId ? `rcs:${googleId}` : '';
}

function comparable(message, key) {
  const phone = normalizePhone(message.phone);
  const timestamp = Number(message.timestampMs);
  const direction = message.direction === 'incoming' || message.direction === 'outgoing' ? message.direction : '';
  if (!phone || !direction || !Number.isFinite(timestamp)) return null;
  return {
    contactHash: contactHash(key, phone),
    direction,
    timestamp,
    fingerprint: bodyFingerprint(message.body)
  };
}

export function reconcileMessages(messages, key, windowMs = WINDOW_MS) {
  const kept = [];
  const duplicates = [];
  const links = [];
  const review = [];
  const bySourceId = new Map();
  for (const message of messages || []) {
    const id = identity(message);
    const fields = comparable(message, key);
    if (!id || !fields) {
      review.push({ reason: 'missing_identity_or_phone', source: message && message.source || '' });
      continue;
    }
    const existingId = bySourceId.get(id);
    if (existingId) {
      duplicates.push({ id, matches: existingId, reason: 'same_source_id' });
      continue;
    }
    const cross = kept.find((row) => {
      return row.fields.contactHash === fields.contactHash
        && row.fields.direction === fields.direction
        && row.fields.fingerprint === fields.fingerprint
        && Math.abs(row.fields.timestamp - fields.timestamp) <= windowMs
        && row.message.source !== message.source;
    });
    bySourceId.set(id, id);
    kept.push({ id, message, fields });
    if (cross) {
      links.push({
        status: 'possible_duplicate',
        left: cross.id,
        right: id,
        reason: 'contact_direction_fingerprint_timestamp'
      });
    }
  }
  return {
    kept: kept.map((row) => ({ id: row.id, source: row.message.source })),
    duplicates,
    links,
    review
  };
}
