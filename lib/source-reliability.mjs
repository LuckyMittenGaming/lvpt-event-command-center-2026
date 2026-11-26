import { createRequire } from 'node:module';
import { observedTime, SMS_INGEST_STALE_HOURS } from './sms-scan-health.mjs';

const require = createRequire(import.meta.url);
const { sourceStatus } = require('../public/v2/js/event-finance.js');

export const SMS_HEARTBEAT_PREREQUISITE = 'No device heartbeat is stored on this preview. A stored SMS row cannot certify that the approved Android phone is collecting. Local verification requires the owner to run the LVPT SMS bridge on the approved handset and confirm a bridge status whose last_success_at is current. This server does not read that report.';

export const RCS_HEARTBEAT_PREREQUISITE = 'The Google Messages collector is not paired from this deployment. A stored RCS row is not a live collector. Local verification requires the owner to pair the read-only collector on the approved computer and confirm a current collector success time. This route does not invent that time.';

/** Distinct failure classes — never collapse auth, timeout, provider, stale, or partial. */
export const SOURCE_FAILURE_KINDS = Object.freeze({
  NONE: 'none',
  AUTHORIZATION: 'authorization',
  PROVIDER: 'provider',
  TIMEOUT: 'timeout',
  STALE: 'stale',
  PARTIAL: 'partial',
  UNAVAILABLE: 'unavailable',
  NOT_CONFIGURED: 'not_configured',
  NOT_VERIFIED: 'not_verified',
  DISABLED: 'disabled'
});

/** Explicit health states from AGENTS.md §15, plus probe statuses already in use. */
export const SOURCE_EXPLICIT_STATES = Object.freeze({
  LIVE_VERIFIED: 'LIVE VERIFIED',
  STAGING: 'STAGING',
  DISABLED: 'DISABLED',
  NOT_VERIFIED: 'NOT VERIFIED',
  AUTHORIZATION_REQUIRED: 'AUTHORIZATION REQUIRED',
  STALE: 'STALE',
  PARTIAL: 'PARTIAL',
  TIMED_OUT: 'TIMED OUT',
  UNAVAILABLE: 'UNAVAILABLE',
  NOT_CONNECTED: 'NOT CONNECTED',
  LIVE: 'LIVE',
  UNVERIFIED: 'UNVERIFIED',
  NOT_OBSERVABLE: 'NOT OBSERVABLE'
});

const RETRY_BY_KIND = Object.freeze({
  [SOURCE_FAILURE_KINDS.NONE]: {
    supported: false,
    automatic: false,
    state: 'not_required',
    guidance: 'No retry is required for this evidence.'
  },
  [SOURCE_FAILURE_KINDS.AUTHORIZATION]: {
    supported: false,
    automatic: false,
    state: 'retry_blocked',
    guidance: 'Restore owner authorization before any retry. An authorization failure is not a provider outage and is not an empty successful read.'
  },
  [SOURCE_FAILURE_KINDS.TIMEOUT]: {
    supported: true,
    automatic: false,
    state: 'manual_retry_allowed',
    guidance: 'Retry the same bounded read once after confirming the provider is reachable. A timeout is not disconnection proof of an empty source.'
  },
  [SOURCE_FAILURE_KINDS.PROVIDER]: {
    supported: true,
    automatic: false,
    state: 'manual_retry_allowed',
    guidance: 'Retry the bounded read after the provider recovers. Do not invent zero totals from a failed provider response.'
  },
  [SOURCE_FAILURE_KINDS.STALE]: {
    supported: true,
    automatic: false,
    state: 'manual_retry_allowed',
    guidance: 'Refresh the source or confirm the collector actually ran. A stale last-success is not current execution.'
  },
  [SOURCE_FAILURE_KINDS.PARTIAL]: {
    supported: true,
    automatic: false,
    state: 'manual_retry_allowed',
    guidance: 'Continue or widen the authorized bounded read. Partial coverage is not a complete mailbox or store total.'
  },
  [SOURCE_FAILURE_KINDS.UNAVAILABLE]: {
    supported: true,
    automatic: false,
    state: 'manual_retry_allowed',
    guidance: 'Confirm configuration and connectivity, then retry. Unavailable is not an empty inbox.'
  },
  [SOURCE_FAILURE_KINDS.NOT_CONFIGURED]: {
    supported: false,
    automatic: false,
    state: 'retry_blocked',
    guidance: 'Configure the staging connector before retrying. Missing configuration is not a successful empty read.'
  },
  [SOURCE_FAILURE_KINDS.NOT_VERIFIED]: {
    supported: false,
    automatic: false,
    state: 'retry_blocked',
    guidance: 'Supply actual execution evidence such as a collector heartbeat or confirmed job run. Stored rows, schedules, and successful audits are not substitutes.'
  },
  [SOURCE_FAILURE_KINDS.DISABLED]: {
    supported: false,
    automatic: false,
    state: 'retry_blocked',
    guidance: 'This automation stays disabled until owner release gates pass. Do not treat the schedule as an executed run.'
  }
});

const OWNER_ACTION_BY_KIND = Object.freeze({
  [SOURCE_FAILURE_KINDS.NONE]: 'No owner action is required for this evidence.',
  [SOURCE_FAILURE_KINDS.AUTHORIZATION]: 'Sign in with an owner review session and restore provider credentials before reading again.',
  [SOURCE_FAILURE_KINDS.TIMEOUT]: 'Confirm the network path to the provider, then retry the bounded read from the hub.',
  [SOURCE_FAILURE_KINDS.PROVIDER]: 'Inspect provider health, then retry the same bounded read. Do not accept a failed read as zero records.',
  [SOURCE_FAILURE_KINDS.STALE]: 'Confirm the collector or sync job actually executed, then refresh source health.',
  [SOURCE_FAILURE_KINDS.PARTIAL]: 'Authorize a continued bounded read or accept that coverage remains partial.',
  [SOURCE_FAILURE_KINDS.UNAVAILABLE]: 'Restore connectivity or configuration, then retry. Do not display a successful empty total.',
  [SOURCE_FAILURE_KINDS.NOT_CONFIGURED]: 'Configure the approved staging connector for this deployment.',
  [SOURCE_FAILURE_KINDS.NOT_VERIFIED]: 'Provide collector heartbeat or confirmed job execution evidence. Do not infer execution from rows, schedules, or audits.',
  [SOURCE_FAILURE_KINDS.DISABLED]: 'Leave the automation disabled until the owner release checklist is satisfied.'
});

function clock(now) {
  const ms = typeof now === 'number' ? now : Date.parse(String(now || ''));
  return Number.isFinite(ms) ? ms : Date.now();
}

function checkedAt(nowMs) {
  return new Date(nowMs).toISOString();
}

function asKind(value) {
  const kind = String(value || '').trim().toLowerCase();
  return Object.values(SOURCE_FAILURE_KINDS).includes(kind) ? kind : '';
}

/**
 * Map free-form provider/page reasons onto distinct failure kinds.
 * Authorization, timeout, and provider stay separate.
 */
export function classifyFailureReason(reason, hints = {}) {
  if (hints.authorization === true || hints.authorized === false) return SOURCE_FAILURE_KINDS.AUTHORIZATION;
  if (hints.timedOut === true || hints.timeout === true) return SOURCE_FAILURE_KINDS.TIMEOUT;
  if (hints.disabled === true) return SOURCE_FAILURE_KINDS.DISABLED;
  if (hints.notConfigured === true) return SOURCE_FAILURE_KINDS.NOT_CONFIGURED;
  if (hints.stale === true) return SOURCE_FAILURE_KINDS.STALE;
  if (hints.partial === true) return SOURCE_FAILURE_KINDS.PARTIAL;
  const text = String(reason || '').trim().toLowerCase();
  if (text) {
    if (/(^|[^a-z])(401|403|unauthorized|authorization|auth[_-]?required|forbidden)([^a-z]|$)/.test(text)) {
      return SOURCE_FAILURE_KINDS.AUTHORIZATION;
    }
    if (/(timed?\s*out|etimedout|timeout|deadline)/.test(text)) return SOURCE_FAILURE_KINDS.TIMEOUT;
    if (/(not[_ ]configured|unconfigured|missing[_ ]config)/.test(text)) return SOURCE_FAILURE_KINDS.NOT_CONFIGURED;
    if (/(disabled|feature[_ ]off)/.test(text)) return SOURCE_FAILURE_KINDS.DISABLED;
    if (/(^|[^a-z])(provider|http|read_failed|invalid_body|sync_http|gateway)([^a-z]|$)/.test(text)) {
      return SOURCE_FAILURE_KINDS.PROVIDER;
    }
    if (/(unavailable|offline|not[_ ]connected|econnrefused|enotfound)/.test(text)) {
      return SOURCE_FAILURE_KINDS.UNAVAILABLE;
    }
    if (/(partial|truncated|page[_ ]cap|cursor[_ ]stalled|capped)/.test(text)) return SOURCE_FAILURE_KINDS.PARTIAL;
    if (/(stale)/.test(text)) return SOURCE_FAILURE_KINDS.STALE;
    return SOURCE_FAILURE_KINDS.PROVIDER;
  }
  if (hints.unavailable === true) return SOURCE_FAILURE_KINDS.UNAVAILABLE;
  return '';
}

function resolveFailureKind(input = {}) {
  const explicit = asKind(input.failureKind || input.errorKind || (input.error && input.error.kind));
  if (explicit) return explicit;
  if (input.disabled === true) return SOURCE_FAILURE_KINDS.DISABLED;
  if (input.authorized === false || input.authorizationRequired === true) {
    return SOURCE_FAILURE_KINDS.AUTHORIZATION;
  }
  if (input.timedOut === true || input.timeout === true) return SOURCE_FAILURE_KINDS.TIMEOUT;
  if (input.notConfigured === true) return SOURCE_FAILURE_KINDS.NOT_CONFIGURED;
  if (input.unavailable === true && input.partial !== true) return SOURCE_FAILURE_KINDS.UNAVAILABLE;
  if (input.partial === true) return SOURCE_FAILURE_KINDS.PARTIAL;
  if (input.stale === true) return SOURCE_FAILURE_KINDS.STALE;
  const fromReason = classifyFailureReason(input.reason || input.stoppedReason || input.lastFailure, input);
  if (fromReason) return fromReason;
  if (input.connected === false) return SOURCE_FAILURE_KINDS.UNAVAILABLE;
  const hasExecution = input.executionEvidence === true || input.executed === true || input.heartbeatVerified === true;
  const scheduleOrAuditOnly = !hasExecution
    && (Boolean(String(input.schedule || '').trim()) || input.auditSucceeded === true)
    && input.acceptLastSuccess !== true;
  if (
    input.notVerified === true
    || scheduleOrAuditOnly
    || (input.connected === true && !input.lastSuccess && !input.heartbeatVerified)
  ) {
    return SOURCE_FAILURE_KINDS.NOT_VERIFIED;
  }
  return SOURCE_FAILURE_KINDS.NONE;
}

function resolveExplicitState(failureKind, probeStatus, input = {}) {
  if (failureKind === SOURCE_FAILURE_KINDS.AUTHORIZATION) return SOURCE_EXPLICIT_STATES.AUTHORIZATION_REQUIRED;
  if (failureKind === SOURCE_FAILURE_KINDS.TIMEOUT) return SOURCE_EXPLICIT_STATES.TIMED_OUT;
  if (failureKind === SOURCE_FAILURE_KINDS.DISABLED) return SOURCE_EXPLICIT_STATES.DISABLED;
  if (failureKind === SOURCE_FAILURE_KINDS.UNAVAILABLE || failureKind === SOURCE_FAILURE_KINDS.NOT_CONFIGURED) {
    return input.connected === false ? SOURCE_EXPLICIT_STATES.NOT_CONNECTED : SOURCE_EXPLICIT_STATES.UNAVAILABLE;
  }
  if (failureKind === SOURCE_FAILURE_KINDS.PARTIAL) return SOURCE_EXPLICIT_STATES.PARTIAL;
  if (failureKind === SOURCE_FAILURE_KINDS.STALE) return SOURCE_EXPLICIT_STATES.STALE;
  if (input.liveVerified === true || probeStatus === 'LIVE') {
    return input.liveVerified === true ? SOURCE_EXPLICIT_STATES.LIVE_VERIFIED : SOURCE_EXPLICIT_STATES.LIVE;
  }
  if (input.staging === true) return SOURCE_EXPLICIT_STATES.STAGING;
  if (probeStatus === 'UNVERIFIED') return SOURCE_EXPLICIT_STATES.UNVERIFIED;
  if (probeStatus === 'NOT OBSERVABLE') return SOURCE_EXPLICIT_STATES.NOT_OBSERVABLE;
  if (probeStatus === 'NOT VERIFIED' || failureKind === SOURCE_FAILURE_KINDS.NOT_VERIFIED) {
    return SOURCE_EXPLICIT_STATES.NOT_VERIFIED;
  }
  if (probeStatus === 'STALE') return SOURCE_EXPLICIT_STATES.STALE;
  if (probeStatus === 'PARTIAL') return SOURCE_EXPLICIT_STATES.PARTIAL;
  if (probeStatus === 'NOT CONNECTED') return SOURCE_EXPLICIT_STATES.NOT_CONNECTED;
  if (probeStatus === 'DISABLED') return SOURCE_EXPLICIT_STATES.DISABLED;
  return probeStatus || SOURCE_EXPLICIT_STATES.NOT_VERIFIED;
}

/**
 * Failed / unavailable / auth / timeout reads must not become successful empty totals.
 * Partial reads may keep the examined count from rows actually seen.
 */
function resolveRecordsExamined(input, failureKind) {
  if (
    failureKind === SOURCE_FAILURE_KINDS.AUTHORIZATION ||
    failureKind === SOURCE_FAILURE_KINDS.TIMEOUT ||
    failureKind === SOURCE_FAILURE_KINDS.UNAVAILABLE ||
    failureKind === SOURCE_FAILURE_KINDS.NOT_CONFIGURED ||
    input.unavailable === true ||
    input.connected === false
  ) {
    if (input.allowExaminedOnFailure === true && Number.isInteger(input.recordsExamined) && input.recordsExamined >= 0) {
      return input.recordsExamined;
    }
    return null;
  }
  if (input.recordsExamined === null || input.recordsExamined === undefined) return null;
  const n = Number(input.recordsExamined);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

/**
 * Normalize honest source-health evidence for Gmail, SMS, RCS, and Calendar.
 * Reuses the existing probe/sourceStatus model — does not invent a competing one.
 *
 * Separates last attempt/success, coverage, latest record/ingest, heartbeat,
 * schedule versus execution, errors, retry state, and owner action.
 * Data rows, schedules, and successful audits never become execution evidence.
 */
export function normalizeSourceHealth(input = {}) {
  const nowMs = clock(input.now);
  const at = checkedAt(nowMs);
  const source = String(input.source || input.name || 'unknown').trim() || 'unknown';
  const lastAttempt = observedTime(input.lastAttempt, nowMs) || at;
  const claimedSuccess = observedTime(input.lastSuccess, nowMs) || '';
  const latestRecordAt = observedTime(input.latestRecordAt ?? input.newestMessageAt ?? input.newestHeaderAt, nowMs) || '';
  const latestIngestAt = observedTime(input.latestIngestAt ?? input.newestIngestAt, nowMs) || '';
  const heartbeatCandidate = observedTime(
    input.heartbeatAt ?? (input.heartbeat && (input.heartbeat.lastSuccessAt || input.heartbeat.lastSuccess)),
    nowMs
  ) || '';
  const heartbeatVerified = input.heartbeatVerified === true
    || Boolean(input.heartbeat && input.heartbeat.read === true && heartbeatCandidate);
  const heartbeatAt = heartbeatVerified ? heartbeatCandidate : '';
  const schedule = String(input.schedule || '').trim();
  const auditSucceeded = input.auditSucceeded === true;
  const executionEvidence = input.executionEvidence === true || input.executed === true;
  const executedAt = executionEvidence ? (observedTime(input.executedAt, nowMs) || claimedSuccess || '') : '';
  const failureKind = resolveFailureKind({
    ...input,
    lastSuccess: claimedSuccess,
    heartbeatVerified
  });
  const staleFromAge = Boolean(
    claimedSuccess
    && Number.isFinite(nowMs - Date.parse(claimedSuccess))
    && (nowMs - Date.parse(claimedSuccess)) > Number(input.staleAfterHours || SMS_INGEST_STALE_HOURS) * 3600000
  );
  const effectiveKind = failureKind === SOURCE_FAILURE_KINDS.NONE && staleFromAge
    ? SOURCE_FAILURE_KINDS.STALE
    : failureKind;
  const coverage = String(input.coverage || '').trim()
    || (input.unavailable === true || effectiveKind === SOURCE_FAILURE_KINDS.UNAVAILABLE || effectiveKind === SOURCE_FAILURE_KINDS.NOT_CONFIGURED
      ? 'unavailable'
      : input.partial === true || effectiveKind === SOURCE_FAILURE_KINDS.PARTIAL
        ? 'partial'
        : input.readComplete === true
          ? 'read-complete'
          : 'unspecified');
  const recordsExamined = resolveRecordsExamined({
    ...input,
    connected: input.connected,
    unavailable: input.unavailable === true || coverage === 'unavailable'
  }, effectiveKind);
  const recordsCreated = Number.isInteger(input.recordsCreated) && input.recordsCreated >= 0
    ? input.recordsCreated
    : 0;
  const lastSuccess = claimedSuccess;
  const connected = input.connected === true
    && effectiveKind !== SOURCE_FAILURE_KINDS.AUTHORIZATION
    && effectiveKind !== SOURCE_FAILURE_KINDS.UNAVAILABLE
    && effectiveKind !== SOURCE_FAILURE_KINDS.NOT_CONFIGURED
    && effectiveKind !== SOURCE_FAILURE_KINDS.TIMEOUT
    && effectiveKind !== SOURCE_FAILURE_KINDS.DISABLED;
  const partial = effectiveKind === SOURCE_FAILURE_KINDS.PARTIAL || input.partial === true;
  const reason = String(input.reason || input.detail || input.stoppedReason || '').trim()
    || (effectiveKind === SOURCE_FAILURE_KINDS.AUTHORIZATION
      ? 'Authorization is required before this source can be read.'
      : effectiveKind === SOURCE_FAILURE_KINDS.TIMEOUT
        ? 'The source read timed out before a complete result was available.'
        : effectiveKind === SOURCE_FAILURE_KINDS.PROVIDER
          ? 'The provider failed before a complete result was available.'
          : effectiveKind === SOURCE_FAILURE_KINDS.STALE
            ? 'The last success is older than the freshness window.'
            : effectiveKind === SOURCE_FAILURE_KINDS.PARTIAL
              ? 'Coverage is partial. Examined rows are not a complete total.'
              : effectiveKind === SOURCE_FAILURE_KINDS.UNAVAILABLE
                ? 'The source was unavailable. No successful count was taken.'
                : effectiveKind === SOURCE_FAILURE_KINDS.NOT_CONFIGURED
                  ? 'The source is not configured on this deployment.'
                  : effectiveKind === SOURCE_FAILURE_KINDS.NOT_VERIFIED
                    ? 'Execution evidence was not verified.'
                    : effectiveKind === SOURCE_FAILURE_KINDS.DISABLED
                      ? 'This automation is disabled.'
                      : 'Source evidence was classified.');
  const retryBase = RETRY_BY_KIND[effectiveKind] || RETRY_BY_KIND[SOURCE_FAILURE_KINDS.NOT_VERIFIED];
  const retry = {
    supported: input.retrySupported === true || (input.retrySupported !== false && retryBase.supported),
    automatic: false,
    state: String(input.retryState || retryBase.state),
    guidance: String(input.retryGuidance || retryBase.guidance)
  };
  const ownerAction = String(input.ownerAction || OWNER_ACTION_BY_KIND[effectiveKind] || OWNER_ACTION_BY_KIND[SOURCE_FAILURE_KINDS.NOT_VERIFIED]);
  const probe = {
    name: String(input.name || source),
    schedule: schedule || undefined,
    owner: input.owner || undefined,
    disabled: effectiveKind === SOURCE_FAILURE_KINDS.DISABLED || input.disabled === true,
    observable: input.observable,
    connected: connected || (partial && input.connected === true),
    partial,
    lastAttempt,
    lastSuccess: effectiveKind === SOURCE_FAILURE_KINDS.AUTHORIZATION || effectiveKind === SOURCE_FAILURE_KINDS.TIMEOUT
      ? ''
      : lastSuccess,
    staleAfterHours: Number(input.staleAfterHours || SMS_INGEST_STALE_HOURS),
    now: at,
    recordsExamined,
    recordsCreated,
    duplicates: input.duplicates ?? null,
    unmatched: input.unmatched ?? null,
    detail: reason
  };
  if (input.status === 'UNVERIFIED') probe.status = 'UNVERIFIED';
  const status = sourceStatus(probe);
  const explicitState = resolveExplicitState(effectiveKind, status, {
    ...input,
    connected: probe.connected
  });
  const scheduleVersusExecution = {
    schedule,
    executedAt,
    scheduleIsNotExecution: Boolean(schedule) && !executedAt,
    auditSucceeded,
    auditIsNotExecution: true,
    dataRowIsNotExecution: true,
    dataRowIsNotHeartbeat: true,
    successfulAuditSubstitutesForExecution: false,
    scheduleSubstitutesForExecution: false,
    storedRowSubstitutesForHeartbeat: false
  };
  return {
    source,
    lastAttempt,
    lastSuccess: probe.lastSuccess,
    coverage,
    latestRecordAt,
    latestIngestAt,
    heartbeatAt,
    heartbeatVerified,
    schedule,
    executedAt,
    scheduleVersusExecution,
    error: effectiveKind === SOURCE_FAILURE_KINDS.NONE
      ? null
      : {
        kind: effectiveKind,
        reason,
        retryable: retry.supported,
        timedOut: effectiveKind === SOURCE_FAILURE_KINDS.TIMEOUT,
        authorizationRequired: effectiveKind === SOURCE_FAILURE_KINDS.AUTHORIZATION,
        providerFailed: effectiveKind === SOURCE_FAILURE_KINDS.PROVIDER,
        stale: effectiveKind === SOURCE_FAILURE_KINDS.STALE,
        partial: effectiveKind === SOURCE_FAILURE_KINDS.PARTIAL,
        unavailable: effectiveKind === SOURCE_FAILURE_KINDS.UNAVAILABLE
          || effectiveKind === SOURCE_FAILURE_KINDS.NOT_CONFIGURED
      },
    failureKind: effectiveKind,
    retry,
    ownerAction,
    status,
    explicitState,
    connected: probe.connected,
    partial,
    unavailable: coverage === 'unavailable' || effectiveKind === SOURCE_FAILURE_KINDS.UNAVAILABLE
      || effectiveKind === SOURCE_FAILURE_KINDS.NOT_CONFIGURED,
    recordsExamined,
    recordsCreated,
    detail: reason,
    checkedAt: at,
    probe,
    /** Convenience mirrors for hub/actionable health. */
    actionable: {
      reason,
      ownerAction,
      retryGuidance: retry.guidance,
      retrySupported: retry.supported,
      automaticRetry: false
    }
  };
}

/** Attach normalized evidence to an existing classifier result without replacing it. */
export function withNormalizedHealth(result, input = {}) {
  const evidence = normalizeSourceHealth({ ...input, detail: input.detail || (result && result.detail) });
  return { ...result, evidence };
}

export function evidenceFromSmsScan(health = {}, extras = {}) {
  const cause = health.cause || health.failureKind;
  return normalizeSourceHealth({
    source: 'sms',
    name: (health.probe && health.probe.name) || 'SMS metadata scan',
    schedule: (health.probe && health.probe.schedule) || 'Bounded metadata read',
    owner: (health.probe && health.probe.owner) || 'LVPT SMS Staging',
    connected: health.connected === true,
    partial: health.partial === true,
    unavailable: health.unavailable === true,
    readComplete: health.readComplete === true,
    coverage: health.coverage,
    lastAttempt: health.checkedAt || (health.probe && health.probe.lastAttempt),
    lastSuccess: health.newestIngestAt || (health.probe && health.probe.lastSuccess) || '',
    acceptLastSuccess: true,
    latestRecordAt: health.newestMessageAt || health.newestMessageAmongRead || '',
    latestIngestAt: health.newestIngestAt || health.newestIngestAmongRead || '',
    recordsExamined: health.storedMessages,
    allowExaminedOnFailure: health.partial === true && health.connected === true,
    recordsCreated: 0,
    staleAfterHours: health.staleAfterHours || SMS_INGEST_STALE_HOURS,
    stoppedReason: health.stoppedReason,
    reason: health.detail,
    // Prefer explicit cause so timeout/provider survive coverage='partial'.
    failureKind: cause || health.failureKind,
    timedOut: health.timedOut === true || cause === SOURCE_FAILURE_KINDS.TIMEOUT,
    authorized: health.authorized,
    notConfigured: health.stoppedReason === 'not_configured',
    providerFailed: health.providerError === true || cause === SOURCE_FAILURE_KINDS.PROVIDER,
    retryGuidance: health.retry && health.retry.guidance,
    retryState: health.retry && health.retry.state,
    ownerAction: health.ownerAction,
    now: health.checkedAt || extras.now,
    ...extras
  });
}

export function evidenceFromBridgeHeartbeat(health = {}, extras = {}) {
  return normalizeSourceHealth({
    source: 'sms-heartbeat',
    name: (health.probe && health.probe.name) || 'Android SMS collector heartbeat',
    schedule: (health.probe && health.probe.schedule) || 'Handset bridge status',
    owner: (health.probe && health.probe.owner) || 'com.lvpt.smsbridge',
    connected: health.verified === true || health.orderingUncertain === true,
    partial: health.orderingUncertain === true,
    heartbeatVerified: health.verified === true,
    heartbeatAt: health.lastSuccessAt || '',
    lastAttempt: health.checkedAt,
    lastSuccess: health.verified ? health.lastSuccessAt : '',
    acceptLastSuccess: health.verified === true,
    executionEvidence: health.verified === true,
    executedAt: health.verified ? health.lastSuccessAt : '',
    recordsExamined: health.priorLastSuccessAt ? 1 : null,
    historicalRowCount: health.historicalRowCount,
    reason: health.detail,
    failureKind: health.verified
      ? (health.status === 'STALE' ? SOURCE_FAILURE_KINDS.STALE : SOURCE_FAILURE_KINDS.NONE)
      : SOURCE_FAILURE_KINDS.NOT_VERIFIED,
    notVerified: health.verified !== true,
    staleAfterHours: SMS_INGEST_STALE_HOURS,
    now: health.checkedAt || extras.now,
    ...extras
  });
}

export function evidenceFromGmailHeader(result = {}, extras = {}) {
  return normalizeSourceHealth({
    source: 'gmail',
    name: (result.probe && result.probe.name) || 'Gmail header metadata',
    schedule: 'Bounded domain header read',
    owner: 'Business Gmail metadata',
    connected: result.connected === true,
    partial: result.partial === true,
    unavailable: result.unavailable === true,
    readComplete: result.readComplete === true,
    coverage: result.coverage,
    lastAttempt: result.checkedAt,
    lastSuccess: '',
    acceptLastSuccess: false,
    latestRecordAt: result.newestHeaderAmongRead || result.newestHeaderAt || '',
    latestIngestAt: result.storedNewestAt || '',
    recordsExamined: result.headerThreads,
    allowExaminedOnFailure: result.partial === true && result.connected === true,
    recordsCreated: 0,
    reason: result.detail,
    failureKind: result.failureKind,
    timedOut: result.timedOut === true,
    authorized: result.authorized,
    capped: result.capped === true,
    now: result.checkedAt || extras.now,
    ...extras
  });
}

export function evidenceFromStoredCollection(result = {}, extras = {}) {
  return normalizeSourceHealth({
    source: 'sms-store',
    name: 'Android SMS upload freshness',
    schedule: 'Newest-row metadata query',
    owner: 'Encrypted SMS staging store',
    connected: result.storeAvailable === true,
    unavailable: result.storeAvailable !== true,
    coverage: result.queryCoverage,
    lastAttempt: result.upload && result.upload.lastAttempt,
    lastSuccess: result.heartbeatVerified ? (result.heartbeat && result.heartbeat.lastSuccess) : '',
    acceptLastSuccess: result.heartbeatVerified === true,
    latestRecordAt: result.newestMessageAt || '',
    latestIngestAt: result.newestIngestAt || '',
    heartbeatVerified: result.heartbeatVerified === true,
    heartbeatAt: result.heartbeatVerified ? (result.heartbeat && result.heartbeat.lastSuccess) : '',
    executionEvidence: result.heartbeatVerified === true,
    executedAt: result.heartbeatVerified ? (result.heartbeat && result.heartbeat.lastSuccess) : '',
    recordsExamined: result.rowCount,
    recordsCreated: 0,
    reason: result.upload && result.upload.detail,
    failureKind: result.storeAvailable
      ? (result.heartbeatVerified ? SOURCE_FAILURE_KINDS.NONE : SOURCE_FAILURE_KINDS.NOT_VERIFIED)
      : SOURCE_FAILURE_KINDS.UNAVAILABLE,
    status: result.upload && result.upload.status,
    staleAfterHours: SMS_INGEST_STALE_HOURS,
    now: result.upload && result.upload.now,
    ...extras
  });
}

/**
 * Local readiness snapshot after R11/R14/R15/R16 — honest, not LIVE_VERIFIED from fixtures.
 * Schedules and audits never count as Calendar execution evidence.
 */
export function normalizeLocalReadiness(input = {}) {
  const now = input.now;
  const gmail = input.gmail
    ? (input.gmail.evidence || evidenceFromGmailHeader(input.gmail, { now }))
    : normalizeSourceHealth({
      source: 'gmail',
      name: 'Gmail header metadata',
      notVerified: true,
      reason: 'Gmail local readiness has not been supplied to this normalizer.',
      now
    });
  const sms = input.sms
    ? (input.sms.evidence || evidenceFromSmsScan(input.sms, { now }))
    : normalizeSourceHealth({
      source: 'sms',
      name: 'SMS metadata scan',
      notVerified: true,
      reason: 'SMS local readiness has not been supplied to this normalizer.',
      now
    });
  const smsHeartbeat = input.smsHeartbeat
    ? (input.smsHeartbeat.evidence || evidenceFromBridgeHeartbeat(input.smsHeartbeat, { now }))
    : normalizeSourceHealth({
      source: 'sms-heartbeat',
      name: 'Android SMS collector heartbeat',
      notVerified: true,
      reason: SMS_HEARTBEAT_PREREQUISITE,
      ownerAction: 'Run the LVPT SMS bridge on the approved handset and confirm a current last_success_at.',
      now
    });
  const rcs = input.rcs
    ? normalizeSourceHealth({
      source: 'rcs',
      name: 'Google Messages RCS collector',
      schedule: String(input.rcs.schedule || 'Approved-computer collector'),
      connected: input.rcs.connected === true,
      heartbeatVerified: input.rcs.heartbeatVerified === true,
      heartbeatAt: input.rcs.heartbeatAt || input.rcs.lastSuccess || '',
      lastAttempt: input.rcs.lastAttempt,
      lastSuccess: input.rcs.heartbeatVerified ? (input.rcs.lastSuccess || '') : '',
      acceptLastSuccess: input.rcs.heartbeatVerified === true,
      executionEvidence: input.rcs.heartbeatVerified === true,
      executedAt: input.rcs.heartbeatVerified ? (input.rcs.lastSuccess || input.rcs.executedAt || '') : '',
      latestRecordAt: input.rcs.newestMessageAt || '',
      latestIngestAt: input.rcs.lastIngestionAt || '',
      coverage: input.rcs.coverage || (input.rcs.connected ? 'partial' : 'unavailable'),
      recordsExamined: input.rcs.recordsExamined,
      reason: input.rcs.reason || input.rcs.detail || RCS_HEARTBEAT_PREREQUISITE,
      failureKind: input.rcs.failureKind
        || (input.rcs.heartbeatVerified ? SOURCE_FAILURE_KINDS.NONE : SOURCE_FAILURE_KINDS.NOT_VERIFIED),
      timedOut: input.rcs.timedOut === true,
      authorized: input.rcs.authorized,
      ownerAction: input.rcs.ownerAction,
      now
    })
    : normalizeSourceHealth({
      source: 'rcs',
      name: 'Google Messages RCS collector',
      notVerified: true,
      reason: RCS_HEARTBEAT_PREREQUISITE,
      ownerAction: 'Pair the read-only collector on the approved computer and confirm a current collector success time.',
      now
    });
  const calendar = input.calendar
    ? normalizeSourceHealth({
      source: 'calendar',
      name: 'Safe TaskSync',
      schedule: String(input.calendar.schedule || 'Hourly'),
      owner: input.calendar.owner || 'LVPT Calendar Command Center · runLVPTSafeTaskSync',
      connected: input.calendar.connected === true,
      lastAttempt: input.calendar.lastAttempt,
      lastSuccess: input.calendar.executionEvidence ? (input.calendar.lastSuccess || '') : '',
      acceptLastSuccess: input.calendar.executionEvidence === true,
      executionEvidence: input.calendar.executionEvidence === true,
      executedAt: input.calendar.executionEvidence ? (input.calendar.executedAt || input.calendar.lastSuccess || '') : '',
      auditSucceeded: input.calendar.auditSucceeded === true,
      coverage: input.calendar.coverage || (input.calendar.executionEvidence ? 'read-complete' : 'unspecified'),
      recordsExamined: input.calendar.recordsExamined,
      reason: input.calendar.reason || input.calendar.detail
        || (input.calendar.executionEvidence
          ? 'Safe TaskSync execution evidence was supplied.'
          : 'A Calendar schedule or successful audit is not proof the hourly Safe TaskSync job executed.'),
      failureKind: input.calendar.failureKind
        || (input.calendar.executionEvidence ? SOURCE_FAILURE_KINDS.NONE : SOURCE_FAILURE_KINDS.NOT_VERIFIED),
      timedOut: input.calendar.timedOut === true,
      authorized: input.calendar.authorized,
      disabled: input.calendar.disabled === true,
      ownerAction: input.calendar.ownerAction
        || 'Confirm an actual runLVPTSafeTaskSync cycle; do not treat the hourly schedule or an audit check as execution.',
      now
    })
    : normalizeSourceHealth({
      source: 'calendar',
      name: 'Safe TaskSync',
      schedule: 'Hourly',
      owner: 'LVPT Calendar Command Center · runLVPTSafeTaskSync',
      notVerified: true,
      reason: 'A Calendar schedule or successful audit is not proof the hourly Safe TaskSync job executed.',
      ownerAction: 'Confirm an actual runLVPTSafeTaskSync cycle on the authorized business calendars.',
      now
    });
  return {
    gmail,
    sms,
    smsHeartbeat,
    rcs,
    calendar,
    /** Fixture/local readiness never implies live-verified operations. */
    liveVerified: false,
    checkedAt: checkedAt(clock(now))
  };
}

export function classifyStoredCollection(input = {}) {
  const nowMs = clock(input.now);
  const at = checkedAt(nowMs);
  const storeReached = input.storeReached === true;
  const newestIngestAt = storeReached ? observedTime(input.newestIngestAt, nowMs) : '';
  const newestMessageAt = storeReached ? observedTime(input.newestMessageAt, nowMs) : '';
  const rowCount = storeReached && Number.isInteger(input.rowCount) && input.rowCount >= 0 ? input.rowCount : null;
  const recentImportCount = storeReached && Number.isInteger(input.recentImportCount) && input.recentImportCount >= 0
    ? input.recentImportCount
    : null;
  const heartbeat = input.heartbeat && input.heartbeat.read === true
    ? observedTime(input.heartbeat.lastSuccessAt, nowMs)
    : '';
  const importAge = newestIngestAt ? nowMs - Date.parse(newestIngestAt) : NaN;
  const importRecent = Number.isFinite(importAge) && importAge <= SMS_INGEST_STALE_HOURS * 3600000;
  const queryCoverage = !storeReached ? 'unavailable' : rowCount === null ? 'partial' : 'newest_row_only';
  const importSentence = !storeReached
    ? 'Stored import freshness was not checked because the SMS store did not answer.'
    : newestIngestAt
      ? `Newest stored import ${newestIngestAt}. ${importRecent ? 'That import is within 48 hours.' : 'That import is older than 48 hours.'} A stored row is not a device heartbeat.`
      : 'No valid stored import time was returned. A missing or future timestamp is not a successful import.';
  const messageSentence = !storeReached
    ? 'Newest message time was not read.'
    : newestMessageAt
      ? `Newest stored message time ${newestMessageAt}. Message time is not an import and is not a heartbeat.`
      : 'No valid stored message time was returned.';
  const countSentence = rowCount === null ? 'Stored row count was not taken.' : `Stored rows ${rowCount}.`;
  const recentSentence = recentImportCount === null
    ? 'Imports inside the freshness window were not counted.'
    : `Imports inside 48 hours: ${recentImportCount}.`;
  const uploadDetail = `${importSentence} ${messageSentence} ${countSentence} ${recentSentence} This was a newest-row query, not a paged scan. Message text was not read.`;
  const upload = heartbeat
    ? {
      connected: true,
      partial: false,
      lastAttempt: at,
      lastSuccess: heartbeat,
      staleAfterHours: SMS_INGEST_STALE_HOURS,
      now: at,
      recordsExamined: rowCount,
      recordsCreated: 0,
      detail: `Device heartbeat ${heartbeat}. ${uploadDetail}`
    }
    : {
      status: 'UNVERIFIED',
      connected: storeReached,
      lastAttempt: at,
      lastSuccess: '',
      staleAfterHours: SMS_INGEST_STALE_HOURS,
      now: at,
      recordsExamined: rowCount,
      recordsCreated: 0,
      detail: uploadDetail
    };
  const heartbeatProbe = {
    name: 'Android SMS collector heartbeat',
    connected: true,
    partial: false,
    lastAttempt: at,
    lastSuccess: heartbeat,
    staleAfterHours: SMS_INGEST_STALE_HOURS,
    now: at,
    recordsExamined: heartbeat ? 1 : 0,
    recordsCreated: 0,
    detail: heartbeat
      ? `A device heartbeat was supplied at ${heartbeat}. This is the collector clock, separate from the newest stored message and the newest stored import.`
      : SMS_HEARTBEAT_PREREQUISITE
  };
  const result = {
    storeAvailable: storeReached,
    queryCoverage,
    newestIngestAt,
    newestMessageAt,
    importRecent: Boolean(newestIngestAt && importRecent),
    rowCount,
    recentImportCount,
    heartbeatVerified: Boolean(heartbeat),
    collectionLive: sourceStatus(upload) === 'LIVE',
    upload,
    heartbeat: heartbeatProbe,
    uploadStatus: sourceStatus(upload),
    heartbeatStatus: sourceStatus(heartbeatProbe)
  };
  result.evidence = evidenceFromStoredCollection(result, { now: at });
  return result;
}

export function classifyGmailHeaderRead(input = {}) {
  const nowMs = clock(input.now);
  const at = checkedAt(nowMs);
  const requested = Math.max(0, Number(input.requested) || 0);
  const reads = Array.isArray(input.reads) ? input.reads : [];
  let domainsRead = 0;
  let failures = 0;
  let headerThreads = 0;
  let providerTruncated = false;
  let newestHeader = '';
  let invalidTimestamps = 0;
  let authFailures = 0;
  let timeoutFailures = 0;
  let providerFailures = 0;
  for (const read of reads) {
    if (!read || read.ok !== true || !Array.isArray(read.threads)) {
      failures += 1;
      const kind = classifyFailureReason(read && read.reason, {
        authorization: read && (read.authorization === true || read.authorized === false),
        timedOut: read && read.timedOut === true
      });
      if (kind === SOURCE_FAILURE_KINDS.AUTHORIZATION) authFailures += 1;
      else if (kind === SOURCE_FAILURE_KINDS.TIMEOUT) timeoutFailures += 1;
      else providerFailures += 1;
      continue;
    }
    domainsRead += 1;
    if (read.providerPartial === true) providerTruncated = true;
    for (const thread of read.threads) {
      headerThreads += 1;
      const when = observedTime(thread && (thread.lastMessageAt || thread.date), nowMs);
      if (when) {
        if (!newestHeader || when > newestHeader) newestHeader = when;
      } else invalidTimestamps += 1;
    }
  }
  const unread = Math.max(0, requested - reads.length);
  const stoppedEarly = input.capped === true || unread > 0;
  const unavailable = domainsRead === 0;
  const partial = !unavailable && (failures > 0 || stoppedEarly || providerTruncated);
  const readComplete = !unavailable && !partial;
  const coverage = unavailable ? 'unavailable' : partial ? 'partial' : 'read-complete';
  const storedNewestAt = observedTime(input.storedNewest, nowMs);
  const authorized = input.authorized !== false && authFailures === 0;
  const timedOut = input.timedOut === true || (unavailable && timeoutFailures > 0 && authFailures === 0);
  let failureKind = SOURCE_FAILURE_KINDS.NONE;
  if (!authorized) failureKind = SOURCE_FAILURE_KINDS.AUTHORIZATION;
  else if (timedOut && unavailable) failureKind = SOURCE_FAILURE_KINDS.TIMEOUT;
  else if (unavailable) failureKind = providerFailures > 0 ? SOURCE_FAILURE_KINDS.PROVIDER : SOURCE_FAILURE_KINDS.UNAVAILABLE;
  else if (partial) failureKind = SOURCE_FAILURE_KINDS.PARTIAL;
  let detail;
  if (!authorized) {
    detail = 'Gmail authorization is required. The header read did not run as an authorized owner request. No header count was taken. An authorization failure is not a provider outage and is not proof the mailbox is empty.';
  } else if (timedOut && unavailable) {
    detail = 'The Gmail header read timed out before any requested domain completed. No header count was taken. A timeout is not an empty mailbox and not a successful audit.';
  } else if (unavailable) {
    detail = 'The Gmail header read did not complete for any requested domain. No header count was taken. An empty list is not proof the mailbox is empty. Full message bodies were not read.';
  } else if (partial) {
    detail = `The Gmail header read is partial. ${domainsRead} of ${requested || reads.length} domain reads returned headers, and ${failures} failed. ${input.capped ? 'The read also hit its time cap. ' : ''}${providerTruncated ? 'The provider marked a domain search truncated. ' : ''}${headerThreads} header threads were examined. That is not a complete count, not a full mailbox, and not a fresh ingestion. Full message bodies were not read.`;
  } else if (headerThreads === 0) {
    detail = 'The bounded Gmail header read finished and returned no header threads. That is an empty metadata result for the requested domains, not a full mailbox scan and not a fresh ingestion. Full message bodies were not read.';
  } else {
    detail = `The bounded Gmail header read finished. ${headerThreads} header threads were read. Newest header time ${newestHeader || 'none'}. Metadata only. Full threads were not opened. This is not a full mailbox and not a Gmail ingestion.`;
  }
  if (invalidTimestamps > 0) detail += ' A missing or future header time was ignored.';
  detail += storedNewestAt
    ? ` Newest stored sheet date ${storedNewestAt}. A stored sheet row is not this header read.`
    : ' No valid stored sheet date was supplied. A stored sheet row is not this header read.';
  const probe = {
    name: 'Gmail header metadata',
    connected: !unavailable && authorized && !timedOut,
    partial,
    lastAttempt: at,
    lastSuccess: '',
    now: at,
    recordsExamined: unavailable || !authorized || timedOut ? null : headerThreads,
    recordsCreated: 0,
    duplicates: 0,
    unmatched: null,
    detail
  };
  const result = {
    coverage,
    connected: !unavailable && authorized && !(timedOut && unavailable),
    partial,
    unavailable,
    readComplete,
    metadataOnly: true,
    fullThreadAccess: false,
    domainsRequested: requested,
    domainsRead,
    failures,
    authFailures,
    timeoutFailures,
    providerFailures,
    authorized,
    timedOut: Boolean(timedOut && unavailable),
    failureKind,
    capped: input.capped === true,
    headerThreads: unavailable || !authorized || (timedOut && unavailable) ? null : headerThreads,
    countComplete: readComplete,
    newestHeaderAt: readComplete ? newestHeader : '',
    newestHeaderAmongRead: unavailable || !authorized ? '' : newestHeader,
    invalidTimestamps,
    storedNewestAt,
    fresh: false,
    checkedAt: at,
    probe,
    status: sourceStatus(probe),
    detail
  };
  result.evidence = evidenceFromGmailHeader(result, {
    now: at,
    failureKind,
    timedOut: result.timedOut,
    authorized
  });
  return result;
}
