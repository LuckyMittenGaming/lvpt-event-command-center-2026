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

/** Kept local to avoid an ESM cycle with source-reliability; values stay aligned. */
export const SMS_SCAN_FAILURE_KINDS = Object.freeze({
  NONE: 'none',
  AUTHORIZATION: 'authorization',
  PROVIDER: 'provider',
  TIMEOUT: 'timeout',
  STALE: 'stale',
  PARTIAL: 'partial',
  UNAVAILABLE: 'unavailable',
  NOT_CONFIGURED: 'not_configured',
  NOT_VERIFIED: 'not_verified'
});

const SCAN_RETRY = Object.freeze({
  [SMS_SCAN_FAILURE_KINDS.NONE]: {
    supported: false,
    automatic: false,
    state: 'not_required',
    guidance: 'No retry is required for this evidence.'
  },
  [SMS_SCAN_FAILURE_KINDS.AUTHORIZATION]: {
    supported: false,
    automatic: false,
    state: 'retry_blocked',
    guidance: 'Restore owner authorization before any retry. An authorization failure is not a provider outage and is not an empty successful read.'
  },
  [SMS_SCAN_FAILURE_KINDS.TIMEOUT]: {
    supported: true,
    automatic: false,
    state: 'manual_retry_allowed',
    guidance: 'Retry the same bounded read once after confirming the provider is reachable. A timeout is not disconnection proof of an empty source.'
  },
  [SMS_SCAN_FAILURE_KINDS.PROVIDER]: {
    supported: true,
    automatic: false,
    state: 'manual_retry_allowed',
    guidance: 'Retry the bounded read after the provider recovers. Do not invent zero totals from a failed provider response.'
  },
  [SMS_SCAN_FAILURE_KINDS.STALE]: {
    supported: true,
    automatic: false,
    state: 'manual_retry_allowed',
    guidance: 'Refresh the source or confirm the collector actually ran. A stale last-success is not current execution.'
  },
  [SMS_SCAN_FAILURE_KINDS.PARTIAL]: {
    supported: true,
    automatic: false,
    state: 'manual_retry_allowed',
    guidance: 'Continue or widen the authorized bounded read. Partial coverage is not a complete mailbox or store total.'
  },
  [SMS_SCAN_FAILURE_KINDS.UNAVAILABLE]: {
    supported: true,
    automatic: false,
    state: 'manual_retry_allowed',
    guidance: 'Confirm configuration and connectivity, then retry. Unavailable is not an empty inbox.'
  },
  [SMS_SCAN_FAILURE_KINDS.NOT_CONFIGURED]: {
    supported: false,
    automatic: false,
    state: 'retry_blocked',
    guidance: 'Configure the staging connector before retrying. Missing configuration is not a successful empty read.'
  },
  [SMS_SCAN_FAILURE_KINDS.NOT_VERIFIED]: {
    supported: false,
    automatic: false,
    state: 'retry_blocked',
    guidance: 'Supply actual execution evidence such as a collector heartbeat. Stored rows, schedules, and successful audits are not substitutes.'
  }
});

const SCAN_OWNER_ACTION = Object.freeze({
  [SMS_SCAN_FAILURE_KINDS.NONE]: 'No owner action is required for this evidence.',
  [SMS_SCAN_FAILURE_KINDS.AUTHORIZATION]: 'Sign in with an owner review session and restore provider credentials before reading again.',
  [SMS_SCAN_FAILURE_KINDS.TIMEOUT]: 'Confirm the network path to the provider, then retry the bounded read from the hub.',
  [SMS_SCAN_FAILURE_KINDS.PROVIDER]: 'Inspect provider health, then retry the same bounded read. Do not accept a failed read as zero records.',
  [SMS_SCAN_FAILURE_KINDS.STALE]: 'Confirm the collector or sync job actually executed, then refresh source health.',
  [SMS_SCAN_FAILURE_KINDS.PARTIAL]: 'Authorize a continued bounded read or accept that coverage remains partial.',
  [SMS_SCAN_FAILURE_KINDS.UNAVAILABLE]: 'Restore connectivity or configuration, then retry. Do not display a successful empty total.',
  [SMS_SCAN_FAILURE_KINDS.NOT_CONFIGURED]: 'Configure the approved staging connector for this deployment.',
  [SMS_SCAN_FAILURE_KINDS.NOT_VERIFIED]: 'Provide collector heartbeat or confirmed job execution evidence. Do not infer execution from rows, schedules, or audits.'
});

const EARLIEST_MS = 946684800000;
const FUTURE_SKEW_MS = 5 * 60 * 1000;

function clock(now) {
  const ms = typeof now === 'number' ? now : Date.parse(String(now || ''));
  return Number.isFinite(ms) ? ms : Date.now();
}

/**
 * Map page/provider stop reasons onto distinct failure kinds.
 * Authorization, timeout, and provider remain separate.
 */
export function classifySmsScanFailureReason(reason, hints = {}) {
  if (hints.authorization === true || hints.authorized === false) {
    return SMS_SCAN_FAILURE_KINDS.AUTHORIZATION;
  }
  if (hints.timedOut === true || hints.timeout === true) return SMS_SCAN_FAILURE_KINDS.TIMEOUT;
  if (hints.notConfigured === true) return SMS_SCAN_FAILURE_KINDS.NOT_CONFIGURED;
  if (hints.stale === true) return SMS_SCAN_FAILURE_KINDS.STALE;
  if (hints.partial === true) return SMS_SCAN_FAILURE_KINDS.PARTIAL;
  const text = String(reason || '').trim().toLowerCase();
  if (text) {
    if (/(^|[^a-z])(401|403|unauthorized|authorization|auth[_-]?required|forbidden)([^a-z]|$)/.test(text)) {
      return SMS_SCAN_FAILURE_KINDS.AUTHORIZATION;
    }
    if (/(timed?\s*out|etimedout|timeout|deadline)/.test(text)) return SMS_SCAN_FAILURE_KINDS.TIMEOUT;
    if (/(not[_ ]configured|unconfigured|missing[_ ]config)/.test(text)) {
      return SMS_SCAN_FAILURE_KINDS.NOT_CONFIGURED;
    }
    // Provider markers before generic "unavailable" so http_502 / provider_unavailable stay distinct when possible.
    if (/(^|[^a-z])(provider|http|read_failed|invalid_body|sync_http|gateway)([^a-z]|$)/.test(text)) {
      return SMS_SCAN_FAILURE_KINDS.PROVIDER;
    }
    if (/(unavailable|offline|not[_ ]connected|econnrefused|enotfound)/.test(text)) {
      return SMS_SCAN_FAILURE_KINDS.UNAVAILABLE;
    }
    if (/(partial|truncated|page[_ ]cap|cursor[_ ]stalled|ended_early|capped)/.test(text)) {
      return SMS_SCAN_FAILURE_KINDS.PARTIAL;
    }
    if (/stale/.test(text)) return SMS_SCAN_FAILURE_KINDS.STALE;
    return SMS_SCAN_FAILURE_KINDS.PROVIDER;
  }
  if (hints.unavailable === true) return SMS_SCAN_FAILURE_KINDS.UNAVAILABLE;
  return '';
}

function attachScanActionability(health) {
  const kind = health.failureKind || SMS_SCAN_FAILURE_KINDS.NOT_VERIFIED;
  const retry = SCAN_RETRY[kind] || SCAN_RETRY[SMS_SCAN_FAILURE_KINDS.NOT_VERIFIED];
  health.retry = {
    supported: retry.supported,
    automatic: false,
    state: retry.state,
    guidance: retry.guidance
  };
  health.ownerAction = SCAN_OWNER_ACTION[kind] || SCAN_OWNER_ACTION[SMS_SCAN_FAILURE_KINDS.NOT_VERIFIED];
  health.scheduleVersusExecution = {
    schedule: (health.probe && health.probe.schedule) || 'Bounded metadata read',
    executedAt: '',
    scheduleIsNotExecution: true,
    auditSucceeded: false,
    auditIsNotExecution: true,
    dataRowIsNotExecution: true,
    dataRowIsNotHeartbeat: true,
    successfulAuditSubstitutesForExecution: false,
    scheduleSubstitutesForExecution: false,
    storedRowSubstitutesForHeartbeat: false
  };
  return health;
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
  if (health.partial && health.failureKind === SMS_SCAN_FAILURE_KINDS.TIMEOUT) {
    return `Connected. A later metadata page timed out after ${rows} rows. Coverage is partial. Those rows are not a complete total, and their message time is not the latest successful import. A timeout cause stays distinct from ordinary partial coverage.`;
  }
  if (health.partial && health.failureKind === SMS_SCAN_FAILURE_KINDS.PROVIDER) {
    return `Connected. A later metadata page failed from a provider error after ${rows} rows. Coverage is partial. Those rows are not a complete total, and their message time is not the latest successful import. A provider failure stays distinct from ordinary partial coverage.`;
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

  let authorized = input.authorized !== false;
  // Honor top-level timedOut as a real timeout cause, not only a leftover flag.
  let timedOut = input.timedOut === true;
  let authBlocked = false;
  let timeoutBlocked = input.timedOut === true;
  /** Specific stop cause — kept independent from coverage partial/unavailable. */
  let stopCause = timeoutBlocked ? SMS_SCAN_FAILURE_KINDS.TIMEOUT : '';
  if (configured) {
    for (let index = 0; index < pages.length && pagesRead < pageCap; index += 1) {
      const page = pages[index];
      if (!page || page.ok !== true || !Array.isArray(page.rows)) {
        providerError = true;
        const pageKind = classifySmsScanFailureReason(page && page.reason, {
          authorization: page && (page.authorization === true || page.authorized === false),
          timedOut: page && page.timedOut === true
        });
        if (pageKind === SMS_SCAN_FAILURE_KINDS.AUTHORIZATION) {
          authBlocked = true;
          authorized = false;
          stopCause = SMS_SCAN_FAILURE_KINDS.AUTHORIZATION;
          stoppedReason = String(page && page.reason || 'authorization_required');
        } else if (pageKind === SMS_SCAN_FAILURE_KINDS.TIMEOUT) {
          timeoutBlocked = true;
          timedOut = true;
          stopCause = SMS_SCAN_FAILURE_KINDS.TIMEOUT;
          stoppedReason = String(page && page.reason || 'timeout');
        } else if (pageKind === SMS_SCAN_FAILURE_KINDS.PARTIAL) {
          // Coverage-only stops (cursor_stalled, etc.) — not a provider/timeout cause.
          stopCause = SMS_SCAN_FAILURE_KINDS.PARTIAL;
          stoppedReason = String(page && page.reason || 'provider_page_failed');
        } else if (pageKind === SMS_SCAN_FAILURE_KINDS.UNAVAILABLE && pagesRead === 0) {
          stopCause = SMS_SCAN_FAILURE_KINDS.UNAVAILABLE;
          stoppedReason = String(page && page.reason || 'provider_unavailable');
        } else {
          stopCause = SMS_SCAN_FAILURE_KINDS.PROVIDER;
          stoppedReason = String(
            (page && page.reason)
            || (pagesRead === 0 ? 'provider_unavailable' : 'provider_page_failed')
          );
        }
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
        if (!stopCause) {
          stopCause = timeoutBlocked
            ? SMS_SCAN_FAILURE_KINDS.TIMEOUT
            : SMS_SCAN_FAILURE_KINDS.UNAVAILABLE;
        }
        stoppedReason = timeoutBlocked ? 'timeout' : 'provider_unavailable';
      } else {
        truncated = true;
        stoppedReason = 'ended_early';
      }
    } else if (pagesRead === 0 && timeoutBlocked && !stopCause) {
      stopCause = SMS_SCAN_FAILURE_KINDS.TIMEOUT;
    }
  }

  const unavailable = !configured || pagesRead === 0;
  const readComplete = stoppedReason === 'read_complete';
  const partial = !unavailable && !readComplete;
  const connected = !unavailable && authorized;
  const coverage = !authorized || unavailable
    ? 'unavailable'
    : partial
      ? 'partial'
      : 'read-complete';
  const newestMessageAt = readComplete ? newestMessageAmongRead : '';
  const newestIngestAt = readComplete ? newestIngestAmongRead : '';
  // Failed auth / no-page timeout / unavailable reads must not become successful empty totals.
  // Partial reads may keep examined row counts, which are not complete totals.
  const storedMessages = !authorized || unavailable ? null : stored;
  // Cause wins over coverage: timeout/provider/auth after a successful page stay specific.
  let failureKind = SMS_SCAN_FAILURE_KINDS.NONE;
  if (!configured) failureKind = SMS_SCAN_FAILURE_KINDS.NOT_CONFIGURED;
  else if (authBlocked || !authorized || stopCause === SMS_SCAN_FAILURE_KINDS.AUTHORIZATION) {
    failureKind = SMS_SCAN_FAILURE_KINDS.AUTHORIZATION;
  } else if (timeoutBlocked || stopCause === SMS_SCAN_FAILURE_KINDS.TIMEOUT) {
    failureKind = SMS_SCAN_FAILURE_KINDS.TIMEOUT;
  } else if (stopCause === SMS_SCAN_FAILURE_KINDS.PROVIDER) {
    failureKind = SMS_SCAN_FAILURE_KINDS.PROVIDER;
  } else if (unavailable || stopCause === SMS_SCAN_FAILURE_KINDS.UNAVAILABLE) {
    failureKind = stopCause === SMS_SCAN_FAILURE_KINDS.UNAVAILABLE
      ? SMS_SCAN_FAILURE_KINDS.UNAVAILABLE
      : (classifySmsScanFailureReason(stoppedReason) || SMS_SCAN_FAILURE_KINDS.UNAVAILABLE);
  } else if (partial || stopCause === SMS_SCAN_FAILURE_KINDS.PARTIAL) {
    failureKind = SMS_SCAN_FAILURE_KINDS.PARTIAL;
  } else if (readComplete && newestIngestAt) {
    const age = nowMs - Date.parse(newestIngestAt);
    if (Number.isFinite(age) && age > SMS_INGEST_STALE_HOURS * 3600000) {
      failureKind = SMS_SCAN_FAILURE_KINDS.STALE;
    }
  } else if (readComplete && !newestIngestAt) {
    failureKind = SMS_SCAN_FAILURE_KINDS.NOT_VERIFIED;
  }
  const health = {
    connected,
    coverage,
    readComplete,
    partial,
    unavailable: coverage === 'unavailable',
    pagesRead,
    pageCap,
    pageSize,
    truncated,
    providerError,
    authorized,
    /** True for any timeout cause, including after earlier successful pages or input.timedOut. */
    timedOut: Boolean(timeoutBlocked || failureKind === SMS_SCAN_FAILURE_KINDS.TIMEOUT),
    failureKind,
    /** Explicit cause mirror — independent from coverage partial/unavailable. */
    cause: failureKind,
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
  if (authBlocked || !authorized) {
    health.detail = 'SMS staging authorization is required. The metadata store was not queried as an authorized owner read. No message count was taken. An authorization failure is not a provider outage and is not an empty inbox.';
  } else if (timeoutBlocked && pagesRead === 0) {
    health.detail = 'The SMS metadata read timed out before any page completed. No message count was taken. A timeout is not an empty inbox and not a successful import.';
  }
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
  return attachScanActionability(health);
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
  const failureKind = verified
    ? (status === 'STALE' ? SMS_SCAN_FAILURE_KINDS.STALE : SMS_SCAN_FAILURE_KINDS.NONE)
    : SMS_SCAN_FAILURE_KINDS.NOT_VERIFIED;
  const health = {
    verified,
    status,
    fresh: status === 'LIVE',
    lastSuccessAt,
    priorLastSuccessAt,
    orderingUncertain,
    collectorFailure,
    lastFailure,
    failureKind,
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
  const retry = SCAN_RETRY[failureKind] || SCAN_RETRY[SMS_SCAN_FAILURE_KINDS.NOT_VERIFIED];
  health.retry = {
    supported: retry.supported,
    automatic: false,
    state: retry.state,
    guidance: retry.guidance
  };
  health.ownerAction = SCAN_OWNER_ACTION[failureKind] || SCAN_OWNER_ACTION[SMS_SCAN_FAILURE_KINDS.NOT_VERIFIED];
  health.scheduleVersusExecution = {
    schedule: probe.schedule,
    executedAt: verified ? priorLastSuccessAt : '',
    scheduleIsNotExecution: !verified,
    auditSucceeded: false,
    auditIsNotExecution: true,
    dataRowIsNotExecution: true,
    dataRowIsNotHeartbeat: true,
    successfulAuditSubstitutesForExecution: false,
    scheduleSubstitutesForExecution: false,
    storedRowSubstitutesForHeartbeat: false,
    historicalRowCount,
    historicalImpliesSync: false
  };
  return health;
}
