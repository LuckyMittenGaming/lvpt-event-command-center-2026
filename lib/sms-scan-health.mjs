import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { sourceStatus } = require('../public/v2/js/event-finance.js');

export const SMS_PAGE_CAP = 8;
export const SMS_PAGE_SIZE = 1000;
export const SMS_INGEST_STALE_HOURS = 48;

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
