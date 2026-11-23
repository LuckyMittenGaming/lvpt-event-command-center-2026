import { createHmac } from 'node:crypto';

export const PRODUCTION_INGEST_HOST = 'lvpt-event-command-center-2026.vercel.app';
const EPHEMERAL_PREVIEW = /^lvpt-event-command-center-2026-[a-z0-9]{7,12}\.vercel\.app$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_FAILURE = /^[a-z0-9_ .:-]{0,120}$/i;

export function stableIngestHost(hostname) {
  const host = String(hostname || '').trim().toLowerCase();
  if (!host || host.includes('/') || host.includes('@') || host.includes(':')) {
    return { ok: false, reason: 'host_invalid' };
  }
  if (host === PRODUCTION_INGEST_HOST) return { ok: false, reason: 'production_ingest_disabled' };
  if (EPHEMERAL_PREVIEW.test(host)) return { ok: false, reason: 'preview_url_not_stable' };
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host)) return { ok: false, reason: 'host_invalid' };
  return { ok: true, host };
}

export function normalizePhone(raw) {
  const digits = String(raw || '').replace(/[^0-9]/g, '');
  const local = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  return /^\d{10}$/.test(local) ? local : '';
}

export function contactHash(key, phone) {
  return createHmac('sha256', key).update(phone, 'utf8').digest('hex');
}

export function matchThreads(messages, events, key) {
  const eventsByHash = new Map();
  for (const event of events || []) {
    const phone = normalizePhone(event && event.contactPhone);
    const id = String((event && (event.id || event.eventId)) || '').trim();
    if (!phone || !id) continue;
    const hash = contactHash(key, phone);
    const ids = eventsByHash.get(hash) || [];
    if (!ids.includes(id)) ids.push(id);
    eventsByHash.set(hash, ids);
  }
  const groups = new Map();
  for (const message of messages || []) {
    const hash = String(message && message.contact_hash || '');
    if (!/^[a-f0-9]{64}$/i.test(hash)) continue;
    let group = groups.get(hash);
    if (!group) {
      group = { incoming: 0, outgoing: 0, newest: 0 };
      groups.set(hash, group);
    }
    if (message.direction === 'incoming') group.incoming += 1;
    else if (message.direction === 'outgoing') group.outgoing += 1;
    const stamp = Number(message.timestamp_ms) || 0;
    if (stamp > group.newest) group.newest = stamp;
  }
  return [...groups.entries()].map(([hash, group]) => {
    const ids = eventsByHash.get(hash) || [];
    const match = ids.length === 1 ? 'exact' : ids.length > 1 ? 'ambiguous' : 'unmatched';
    return {
      threadKey: hash.slice(0, 12),
      match,
      eventId: match === 'exact' ? ids[0] : '',
      candidateEventIds: match === 'ambiguous' ? ids.slice(0, 8) : [],
      incoming: group.incoming,
      outgoing: group.outgoing,
      newestAt: group.newest ? new Date(group.newest).toISOString() : '',
      review: match !== 'exact'
    };
  }).sort((a, b) => (a.newestAt < b.newestAt ? 1 : a.newestAt > b.newestAt ? -1 : 0));
}

export function validateBridgeStatus(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  if ('body' in payload || 'phone' in payload || 'messages' in payload || 'ciphertext' in payload) return null;
  const deviceId = payload.device_id;
  if (typeof deviceId !== 'string' || !UUID.test(deviceId)) return null;
  const flags = ['read_sms', 'receive_sms', 'monitoring', 'auto_sync'];
  for (const flag of flags) {
    if (payload[flag] !== true && payload[flag] !== false) return null;
  }
  if (payload.battery_unrestricted !== true && payload.battery_unrestricted !== false && payload.battery_unrestricted !== null) {
    return null;
  }
  const cursor = payload.cursor_sms_id;
  const accepted = payload.accepted_last_batch;
  if (typeof cursor !== 'number' || !Number.isSafeInteger(cursor) || cursor < 0) return null;
  if (typeof accepted !== 'number' || !Number.isSafeInteger(accepted) || accepted < 0 || accepted > 80) return null;
  const failure = payload.last_failure == null ? '' : String(payload.last_failure);
  if (!SAFE_FAILURE.test(failure)) return null;
  const success = payload.last_success_at == null || payload.last_success_at === '' ? '' : String(payload.last_success_at);
  if (success && !Number.isFinite(Date.parse(success))) return null;
  return {
    device_id: deviceId,
    read_sms: payload.read_sms,
    receive_sms: payload.receive_sms,
    monitoring: payload.monitoring,
    auto_sync: payload.auto_sync,
    battery_unrestricted: payload.battery_unrestricted,
    cursor_sms_id: cursor,
    accepted_last_batch: accepted,
    last_failure: failure,
    last_success_at: success ? new Date(success).toISOString() : null
  };
}
