import { createRequire } from 'node:module';
import { validateBridgeStatus } from './sms-bridge.mjs';

const require = createRequire(import.meta.url);
const { sourceStatus } = require('../public/v2/js/event-finance.js');

export const SMS_PAGE_CAP = 8;
export const SMS_PAGE_SIZE = 1000;
export const SMS_INGEST_STALE_HOURS = 48;

/** Package id reported by operating-picture for the Android collector owner. */
export const ANDROID_BRIDGE_PACKAGE = 'com.lvpt.smsbridge';

/**
 * Isolated heartbeat contract for offline readiness.
 * A validated bridge status with last_success_at is required.
 * Stored SMS row counts never satisfy this probe.
 */
export const SMS_BRIDGE_HEARTBEAT_UNVERIFIED =
  'No device heartbeat was supplied. A stored SMS row count is not current synchronization. Current collection requires a validated bridge status whose last_success_at is present and current. This classifier does not invent that timestamp and does not start collection.';

const EARLIEST_MS = 946684800000;
const FUTURE_SKEW_MS = 5 * 60 * 1000;

function clock(now) {
  const ms = typeof now === 'number' ? now : Date.parse(String(now || ''));
  return Number.isFinite(ms) ? ms : Date.now();
}

export function observedTime(value, now) {
  const nowMs = clock(now);
  let ms = NaN;
  if (typeof value === 'number') ms = value;
  else if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return '';
    ms = /^-?\d+$/.test(trimmed) ? Number(trimmed) : Date.parse(trimmed);
  } else return '';
  if (!Number.isFinite(ms) || !Number.isSafeInteger(ms)) return '';
  if (ms < EARLIEST_MS || ms > nowMs + FUTURE_SKEW_MS) return '';
  try {
    return new Date(ms).toISOString();
  } catch {
    return '';
  }
}

function later(current, next) {
  return next && (!current || next > current) ? next : current;
}

function sentence(health) {
  const rows = health.storedMessages;
  if (health.stoppedReason === 'not_configured') {
    return 'SMS staging is not configured on this deployment. The store was not queried, and no message count was taken.';
  }
  if (health.unavailable) {
    return 'The SMS store did not answer. No message count was taken. A missing response is not an empty inbox.';
  }
  if (health.truncated && health.stoppedReason === 'page_cap') {
    return `Connected. The metadata read reached its ${health.pageCap}-page cap while the last page was full. Coverage is partial. ${rows} rows were examined, which is not the full store. A message time from those rows is not the latest successful import.`;
  }
  if (health.partial && health.stoppedReason === 'cursor_stalled') {
    return `Connected. The page cursor stopped advancing after ${rows} rows. Coverage is partial. No complete count was taken, and those rows are not the latest successful import.`;
  }
  if (health.partial) {
    return `Connected. A later metadata page failed after ${rows} rows. Coverage is partial. Those rows are not the full store, and their message time is not the latest successful import.`;
  }
  if (rows === 0) {
    return 'Connected. The metadata read finished. No stored rows were returned. That is not a successful import.';
  }
  const ignored = health.invalidMessageTimestamps || health.invalidIngestTimestamps
    ? ' A missing or future timestamp was ignored.'
    : '';
  const message = health.newestMessageAt || 'none';
  const ingest = health.newestIngestAt || 'none';
  return `Connected. The metadata read finished. Newest message time ${message}. Latest successful import ${ingest}. Import time decides whether this source is current.${ignored}`;
}

export function classifySmsScan(input = {}) {
  const nowMs = clock(input.now);
  const checkedAt = new Date(nowMs).toISOString();
  const pageCap = Math.min(SMS_PAGE_CAP, Math.max(1, Number(input.pageCap) || SMS_PAGE_CAP));
  const pageSize = Math.min(SMS_PAGE_SIZE, Math.max(1, Number(input.pageSize) || SMS_PAGE_SIZE));
  const configured = input.configured === true;
  const pages = Array.isArray(input.pages) ? input.pages : [];
  let pagesRead = 0;
  let stored = 0;
  let invalidMessageTimestamps = 0;
  let invalidIngestTimestamps = 0;
  let newestMessageAmongRead = '';
  let newestIngestAmongRead = '';
  let stoppedReason = configured ? '' : 'not_configured';
  let providerError = false;
  let truncated = false;

  if (configured) {
    for (let index = 0; index < pages.length && pagesRead < pageCap; index += 1) {
      const page = pages[index];
      if (!page || page.ok !== true || !Array.isArray(page.rows)) {
        providerError = true;
        stoppedReason = pagesRead === 0 ? 'provider_unavailable' : String(page && page.reason || 'provider_page_failed');
        break;
      }
      pagesRead += 1;
      for (const row of page.rows) {
        stored += 1;
        const messageAt = observedTime(row && row.timestamp_ms, nowMs);
        const ingestAt = observedTime(row && row.received_at, nowMs);
        if (messageAt) newestMessageAmongRead = later(newestMessageAmongRead, messageAt);
        else invalidMessageTimestamps += 1;
        if (ingestAt) newestIngestAmongRead = later(newestIngestAmongRead, ingestAt);
        else invalidIngestTimestamps += 1;
      }
      const full = page.full === true || page.rows.length >= pageSize;
      if (!full) {
        stoppedReason = 'read_complete';
        break;
      }
      if (pagesRead >= pageCap) {
        truncated = true;
        stoppedReason = 'page_cap';
        break;
      }
    }
    if (!stoppedReason) {
      if (pagesRead === 0) {
        providerError = true;
        stoppedReason = 'provider_unavailable';
      } else {
        truncated = true;
        stoppedReason = 'ended_early';
      }
    }
  }

  const unavailable = !configured || pagesRead === 0;
  const readComplete = stoppedReason === 'read_complete';
  const partial = !unavailable && !readComplete;
  const connected = !unavailable;
  const coverage = unavailable ? 'unavailable' : partial ? 'partial' : 'read-complete';
  const newestMessageAt = readComplete ? newestMessageAmongRead : '';
  const newestIngestAt = readComplete ? newestIngestAmongRead : '';
  const storedMessages = unavailable ? null : stored;
  const health = {
    connected,
    coverage,
    readComplete,
    partial,
    unavailable,
    pagesRead,
    pageCap,
    pageSize,
    truncated,
    providerError,
    storedMessages,
    countComplete: readComplete,
    newestMessageAt,
    newestIngestAt,
    newestMessageAmongRead: connected ? newestMessageAmongRead : '',
    newestIngestAmongRead: connected ? newestIngestAmongRead : '',
    invalidMessageTimestamps: connected ? invalidMessageTimestamps : 0,
    invalidIngestTimestamps: connected ? invalidIngestTimestamps : 0,
    stoppedReason,
    checkedAt,
    staleAfterHours: SMS_INGEST_STALE_HOURS
  };
  health.detail = sentence(health);
  const probe = {
    name: 'SMS metadata scan',
    schedule: 'Bounded metadata read',
    owner: 'LVPT SMS Staging',
    connected,
    partial,
    lastAttempt: checkedAt,
    lastSuccess: newestIngestAt,
    staleAfterHours: SMS_INGEST_STALE_HOURS,
    now: checkedAt,
    recordsExamined: storedMessages,
    recordsCreated: 0,
    duplicates: 0,
    unmatched: null,
    detail: health.detail
  };
  health.probe = probe;
  health.status = sourceStatus(probe);
  health.fresh = health.status === 'LIVE';
  return health;
}

/**
 * Classify an Android bridge status payload for heartbeat semantics.
 * Historical ingest metadata must be omitted from input.status; only
 * validateBridgeStatus fields are accepted. Missing or empty
 * last_success_at remains explicitly unverified.
 *
 * Bridge status exposes last_failure as a string with no failure timestamp.
 * When last_failure is nonempty beside a prior last_success_at, ordering is
 * unknown — do not assume recovery or report LIVE/fresh.
 */
export function classifyBridgeHeartbeat(input = {}) {
  const nowMs = clock(input.now);
  const checkedAt = new Date(nowMs).toISOString();
  const historicalRowCount = Number.isInteger(input.historicalRowCount) && input.historicalRowCount >= 0
    ? input.historicalRowCount
    : null;
  const validated = validateBridgeStatus(input.status);
  const priorLastSuccessAt = validated ? observedTime(validated.last_success_at, nowMs) : '';
  const lastFailure = validated && validated.last_failure ? String(validated.last_failure) : '';
  const collectorFailure = Boolean(lastFailure);
  // Contract has no last_failure_at; coexistence of failure + success is unordered.
  const orderingUncertain = collectorFailure && Boolean(priorLastSuccessAt);
  const verified = Boolean(priorLastSuccessAt) && !collectorFailure;
  const lastSuccessAt = priorLastSuccessAt;
  let detail;
  if (!validated) {
    detail = SMS_BRIDGE_HEARTBEAT_UNVERIFIED;
  } else if (!priorLastSuccessAt) {
    detail = collectorFailure
      ? `Bridge status was readable but last_success_at is missing. Last reported failure: ${lastFailure}. Missing heartbeat stays unverified. Historical rows are not substituted.`
      : 'Bridge status was readable but last_success_at is missing. Missing heartbeat stays unverified. Historical rows are not substituted.';
  } else if (orderingUncertain) {
    detail = `Prior bridge execution evidence last_success_at ${priorLastSuccessAt} is preserved separately. Unresolved last_failure ${lastFailure} is also present. The bridge status contract has no failure timestamp, so failure/success ordering cannot be established. The collector is not treated as healthy or current; recovery is not assumed.`;
  } else {
    detail = `Bridge heartbeat last_success_at ${priorLastSuccessAt}. This is collector execution evidence, separate from stored message time and stored import time.`;
  }
  if (historicalRowCount !== null) {
    detail += ` Historical stored rows observed separately: ${historicalRowCount}. That count is not this heartbeat.`;
  }
  const probe = {
    name: 'Android SMS collector heartbeat',
    schedule: 'Handset bridge status',
    owner: ANDROID_BRIDGE_PACKAGE,
    connected: verified,
    partial: false,
    lastAttempt: checkedAt,
    // Only feed lastSuccess into sourceStatus when the collector is clear of unresolved failure.
    lastSuccess: verified ? priorLastSuccessAt : '',
    staleAfterHours: SMS_INGEST_STALE_HOURS,
    now: checkedAt,
    recordsExamined: priorLastSuccessAt ? 1 : 0,
    recordsCreated: 0,
    duplicates: null,
    unmatched: null,
    detail
  };
  if (orderingUncertain) {
    probe.connected = true;
    probe.partial = true;
    probe.status = 'NOT VERIFIED';
  }
  const status = verified ? sourceStatus(probe) : 'NOT VERIFIED';
  return {
    verified,
    status,
    fresh: status === 'LIVE',
    lastSuccessAt,
    priorLastSuccessAt,
    orderingUncertain,
    collectorFailure,
    lastFailure,
    monitoring: validated ? validated.monitoring : null,
    autoSync: validated ? validated.auto_sync : null,
    cursorSmsId: validated ? validated.cursor_sms_id : null,
    acceptedLastBatch: validated ? validated.accepted_last_batch : null,
    historicalRowCount,
    historicalImpliesSync: false,
    /** Shape accepted by classifyStoredCollection.heartbeat — only when currently healthy. */
    heartbeat: verified ? { read: true, lastSuccessAt: priorLastSuccessAt } : null,
    checkedAt,
    detail,
    probe
  };
}
