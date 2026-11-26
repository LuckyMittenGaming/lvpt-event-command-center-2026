import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import {
  classifyFailureReason,
  classifyGmailHeaderRead,
  classifyStoredCollection,
  evidenceFromBridgeHeartbeat,
  evidenceFromGmailHeader,
  evidenceFromSmsScan,
  evidenceFromStoredCollection,
  normalizeLocalReadiness,
  normalizeSourceHealth,
  SOURCE_EXPLICIT_STATES,
  SOURCE_FAILURE_KINDS
} from '../lib/source-reliability.mjs';
import {
  classifyBridgeHeartbeat,
  classifySmsScan,
  SMS_SCAN_FAILURE_KINDS
} from '../lib/sms-scan-health.mjs';

const require = createRequire(import.meta.url);
const { sourceStatus } = require('../public/v2/js/event-finance.js');

const now = Date.parse('2026-06-15T18:00:00.000Z');
const recentImport = new Date(now - 60 * 60 * 1000).toISOString();
const olderMessage = new Date(now - 5 * 86400000).toISOString();
const oldImport = new Date(now - 10 * 86400000).toISOString();
const recentHeartbeat = new Date(now - 10 * 60 * 1000).toISOString();

const stored = classifyStoredCollection({
  storeReached: true,
  newestIngestAt: recentImport,
  newestMessageAt: olderMessage,
  rowCount: 12,
  recentImportCount: 1,
  heartbeat: null,
  now
});
assert.equal(stored.storeAvailable, true);
assert.equal(stored.queryCoverage, 'newest_row_only');
assert.equal(stored.importRecent, true);
assert.equal(stored.newestMessageAt, olderMessage);
assert.notEqual(stored.newestIngestAt, stored.newestMessageAt);
assert.equal(stored.heartbeatVerified, false);
assert.equal(stored.collectionLive, false);
assert.equal(stored.uploadStatus, 'UNVERIFIED');
assert.equal(sourceStatus(stored.upload), 'UNVERIFIED');
assert.notEqual(stored.uploadStatus, 'LIVE');
assert.equal(stored.heartbeatStatus, 'NOT VERIFIED');
assert.match(stored.upload.detail, /not a device heartbeat/);
assert.match(stored.heartbeat.detail, /last_success_at/);
assert.doesNotMatch(stored.upload.detail, /November 5/);
assert.equal(JSON.stringify(stored).includes('4769'), false);

const missing = classifyStoredCollection({
  storeReached: true,
  newestIngestAt: '',
  newestMessageAt: null,
  rowCount: 4,
  recentImportCount: 0,
  heartbeat: null,
  now
});
assert.equal(missing.newestIngestAt, '');
assert.equal(missing.newestMessageAt, '');
assert.equal(missing.collectionLive, false);
assert.match(missing.upload.detail, /No valid stored import time/);
assert.match(missing.upload.detail, /No valid stored message time/);

const future = classifyStoredCollection({
  storeReached: true,
  newestIngestAt: new Date(now + 3 * 86400000).toISOString(),
  newestMessageAt: now + 3 * 86400000,
  rowCount: null,
  recentImportCount: null,
  heartbeat: null,
  now
});
assert.equal(future.queryCoverage, 'partial');
assert.equal(future.newestIngestAt, '');
assert.equal(future.newestMessageAt, '');
assert.equal(future.collectionLive, false);
assert.equal(future.rowCount, null);

const staleImport = classifyStoredCollection({
  storeReached: true,
  newestIngestAt: oldImport,
  newestMessageAt: recentImport,
  rowCount: 3,
  recentImportCount: 0,
  heartbeat: null,
  now
});
assert.equal(staleImport.importRecent, false);
assert.equal(staleImport.collectionLive, false);
assert.match(staleImport.upload.detail, /older than 48 hours/);
assert.match(staleImport.upload.detail, /not a device heartbeat/);

const healthyCollection = classifyStoredCollection({
  storeReached: true,
  newestIngestAt: recentImport,
  newestMessageAt: olderMessage,
  rowCount: 2,
  recentImportCount: 1,
  heartbeat: { read: true, lastSuccessAt: recentHeartbeat },
  now
});
assert.equal(healthyCollection.heartbeatVerified, true);
assert.equal(healthyCollection.collectionLive, true);
assert.equal(healthyCollection.uploadStatus, 'LIVE');
assert.equal(healthyCollection.heartbeat.lastSuccess, recentHeartbeat);
assert.notEqual(healthyCollection.heartbeat.lastSuccess, healthyCollection.newestMessageAt);

const offline = classifyStoredCollection({ storeReached: false, heartbeat: null, now });
assert.equal(offline.storeAvailable, false);
assert.equal(offline.queryCoverage, 'unavailable');
assert.equal(offline.collectionLive, false);
assert.equal(offline.rowCount, null);

const failedGmail = classifyGmailHeaderRead({
  requested: 3,
  reads: [
    { domain: 'alpha', ok: false, reason: 'read_failed' },
    { domain: 'beta', ok: false, reason: 'invalid_body' }
  ],
  storedNewest: recentImport,
  now
});
assert.equal(failedGmail.coverage, 'unavailable');
assert.equal(failedGmail.fresh, false);
assert.equal(failedGmail.headerThreads, null);
assert.equal(failedGmail.fullThreadAccess, false);
assert.equal(failedGmail.metadataOnly, true);
assert.equal(failedGmail.status, 'NOT CONNECTED');
assert.match(failedGmail.detail, /not proof the mailbox is empty/);
assert.equal(failedGmail.storedNewestAt, recentImport);

const cappedGmail = classifyGmailHeaderRead({
  requested: 4,
  capped: true,
  reads: [{ domain: 'alpha', ok: true, threads: [{ lastMessageAt: recentImport, subject: 'Synthetic header only' }] }],
  storedNewest: recentImport,
  now
});
assert.equal(cappedGmail.coverage, 'partial');
assert.equal(cappedGmail.fresh, false);
assert.equal(cappedGmail.status, 'PARTIAL');
assert.equal(cappedGmail.countComplete, false);
assert.equal(cappedGmail.newestHeaderAt, '');
assert.equal(cappedGmail.headerThreads, 1);
assert.match(cappedGmail.detail, /time cap/);

const partialGmail = classifyGmailHeaderRead({
  requested: 2,
  reads: [
    { domain: 'alpha', ok: true, threads: [{ lastMessageAt: recentImport }] },
    { domain: 'beta', ok: false, reason: 'read_failed' }
  ],
  now
});
assert.equal(partialGmail.coverage, 'partial');
assert.equal(partialGmail.fresh, false);
assert.equal(partialGmail.status, 'PARTIAL');
assert.equal(partialGmail.fullThreadAccess, false);

const truncatedGmail = classifyGmailHeaderRead({
  requested: 1,
  reads: [{ domain: 'alpha', ok: true, providerPartial: true, threads: [{ lastMessageAt: recentImport }] }],
  now
});
assert.equal(truncatedGmail.coverage, 'partial');
assert.equal(truncatedGmail.fresh, false);
assert.match(truncatedGmail.detail, /not a full mailbox/);
assert.match(truncatedGmail.detail, /truncated/);

const healthyGmail = classifyGmailHeaderRead({
  requested: 2,
  reads: [
    { domain: 'alpha', ok: true, threads: [{ lastMessageAt: olderMessage, subject: 'Synthetic availability question' }] },
    { domain: 'beta', ok: true, threads: [] }
  ],
  storedNewest: recentImport,
  now
});
assert.equal(healthyGmail.coverage, 'read-complete');
assert.equal(healthyGmail.readComplete, true);
assert.equal(healthyGmail.metadataOnly, true);
assert.equal(healthyGmail.fullThreadAccess, false);
assert.equal(healthyGmail.fresh, false);
assert.equal(healthyGmail.status, 'NOT VERIFIED');
assert.equal(healthyGmail.newestHeaderAt, olderMessage);
assert.equal(healthyGmail.storedNewestAt, recentImport);
assert.notEqual(healthyGmail.newestHeaderAt, healthyGmail.storedNewestAt);
assert.equal(healthyGmail.countComplete, true);
assert.match(healthyGmail.detail, /not a Gmail ingestion/);

const invalidHeader = classifyGmailHeaderRead({
  requested: 1,
  reads: [{ domain: 'alpha', ok: true, threads: [{ lastMessageAt: '' }, { lastMessageAt: new Date(now + 9 * 86400000).toISOString() }] }],
  storedNewest: 'not-a-date',
  now
});
assert.equal(invalidHeader.coverage, 'read-complete');
assert.equal(invalidHeader.newestHeaderAt, '');
assert.equal(invalidHeader.invalidTimestamps, 2);
assert.equal(invalidHeader.storedNewestAt, '');
assert.equal(invalidHeader.fresh, false);
assert.match(invalidHeader.detail, /missing or future header time/);

const picture = readFileSync(new URL('../app/api/sync/operating-picture/route.ts', import.meta.url), 'utf8');
const inbox = readFileSync(new URL('../app/api/sync/action-inbox/route.ts', import.meta.url), 'utf8');
const rcs = readFileSync(new URL('../app/api/sms/staging/rcs-collector/route.ts', import.meta.url), 'utf8');
assert.equal(picture.includes('November 5'), false);
assert.match(picture, /classifyStoredCollection/);
assert.match(picture, /normalizeSourceHealth/);
assert.match(picture, /normalizeLocalReadiness/);
assert.match(picture, /sourceHealth/);
assert.match(picture, /heartbeat: null/);
assert.match(inbox, /classifyGmailHeaderRead/);
assert.match(inbox, /gmailFresh: false/);
assert.match(inbox, /fullThreadAccess: false/);
assert.match(inbox, /metadataOnly: true/);
assert.match(inbox, /preview_only/);
assert.match(inbox, /productionWrites: false/);
assert.doesNotMatch(inbox, /A missed header read stays out of the inbox/);
assert.match(rcs, /heartbeat: 'unverified'/);
assert.match(rcs, /verificationPrerequisite/);
assert.equal(rcs.includes('lvpt_sms_staging'), false);
assert.match(rcs, /lastSuccess: ''/);

// --- R17 / T28: normalized honest source-health evidence ---
assert.equal(classifyFailureReason('401 unauthorized'), SOURCE_FAILURE_KINDS.AUTHORIZATION);
assert.equal(classifyFailureReason('ETIMEDOUT'), SOURCE_FAILURE_KINDS.TIMEOUT);
assert.equal(classifyFailureReason('http_502'), SOURCE_FAILURE_KINDS.PROVIDER);
assert.equal(classifyFailureReason('page_cap'), SOURCE_FAILURE_KINDS.PARTIAL);
assert.notEqual(classifyFailureReason('401 unauthorized'), classifyFailureReason('ETIMEDOUT'));
assert.notEqual(classifyFailureReason('ETIMEDOUT'), classifyFailureReason('http_502'));

const authGmail = classifyGmailHeaderRead({
  requested: 1,
  reads: [{ domain: 'alpha', ok: false, reason: '401 unauthorized' }],
  now
});
assert.equal(authGmail.failureKind, SOURCE_FAILURE_KINDS.AUTHORIZATION);
assert.equal(authGmail.authorized, false);
assert.equal(authGmail.headerThreads, null);
assert.equal(authGmail.evidence.recordsExamined, null);
assert.equal(authGmail.evidence.explicitState, SOURCE_EXPLICIT_STATES.AUTHORIZATION_REQUIRED);
assert.equal(authGmail.evidence.retry.supported, false);
assert.equal(authGmail.evidence.retry.automatic, false);
assert.match(authGmail.evidence.ownerAction, /owner review session/i);
assert.match(authGmail.detail, /not a provider outage/);
assert.notEqual(authGmail.evidence.failureKind, SOURCE_FAILURE_KINDS.PROVIDER);
assert.notEqual(authGmail.evidence.failureKind, SOURCE_FAILURE_KINDS.TIMEOUT);

const timeoutGmail = classifyGmailHeaderRead({
  requested: 1,
  reads: [{ domain: 'alpha', ok: false, reason: 'ETIMEDOUT', timedOut: true }],
  now
});
assert.equal(timeoutGmail.failureKind, SOURCE_FAILURE_KINDS.TIMEOUT);
assert.equal(timeoutGmail.timedOut, true);
assert.equal(timeoutGmail.headerThreads, null);
assert.equal(timeoutGmail.evidence.recordsExamined, null);
assert.equal(timeoutGmail.evidence.explicitState, SOURCE_EXPLICIT_STATES.TIMED_OUT);
assert.equal(timeoutGmail.evidence.retry.supported, true);
assert.equal(timeoutGmail.evidence.retry.automatic, false);
assert.match(timeoutGmail.evidence.retry.guidance, /timeout/i);
assert.notEqual(timeoutGmail.evidence.failureKind, SOURCE_FAILURE_KINDS.AUTHORIZATION);
assert.notEqual(timeoutGmail.evidence.failureKind, SOURCE_FAILURE_KINDS.UNAVAILABLE);

assert.equal(failedGmail.failureKind, SOURCE_FAILURE_KINDS.PROVIDER);
assert.equal(failedGmail.headerThreads, null);
assert.equal(failedGmail.evidence.recordsExamined, null);
assert.equal(failedGmail.evidence.error.providerFailed, true);
assert.match(failedGmail.evidence.retry.guidance, /zero totals/i);

assert.equal(cappedGmail.failureKind, SOURCE_FAILURE_KINDS.PARTIAL);
assert.equal(cappedGmail.evidence.failureKind, SOURCE_FAILURE_KINDS.PARTIAL);
assert.equal(cappedGmail.evidence.recordsExamined, 1);
assert.equal(cappedGmail.evidence.retry.supported, true);
assert.match(cappedGmail.evidence.ownerAction, /partial/i);

const authSms = classifySmsScan({
  configured: true,
  now,
  pages: [{ ok: false, reason: '403 forbidden', authorization: true }]
});
assert.equal(authSms.failureKind, SMS_SCAN_FAILURE_KINDS.AUTHORIZATION);
assert.equal(authSms.authorized, false);
assert.equal(authSms.storedMessages, null);
assert.equal(authSms.retry.supported, false);
assert.match(authSms.ownerAction, /owner review session/i);
assert.equal(authSms.scheduleVersusExecution.storedRowSubstitutesForHeartbeat, false);
const authSmsEvidence = evidenceFromSmsScan(authSms, { now });
assert.equal(authSmsEvidence.explicitState, SOURCE_EXPLICIT_STATES.AUTHORIZATION_REQUIRED);
assert.equal(authSmsEvidence.recordsExamined, null);
assert.notEqual(authSmsEvidence.failureKind, SOURCE_FAILURE_KINDS.TIMEOUT);

const timeoutSms = classifySmsScan({
  configured: true,
  now,
  pages: [{ ok: false, reason: 'timeout', timedOut: true }]
});
assert.equal(timeoutSms.failureKind, SMS_SCAN_FAILURE_KINDS.TIMEOUT);
assert.equal(timeoutSms.timedOut, true);
assert.equal(timeoutSms.storedMessages, null);
assert.equal(timeoutSms.retry.supported, true);
assert.equal(timeoutSms.retry.automatic, false);
const timeoutSmsEvidence = evidenceFromSmsScan(timeoutSms, { now });
assert.equal(timeoutSmsEvidence.explicitState, SOURCE_EXPLICIT_STATES.TIMED_OUT);
assert.equal(timeoutSmsEvidence.recordsExamined, null);
assert.notEqual(timeoutSmsEvidence.failureKind, SOURCE_FAILURE_KINDS.AUTHORIZATION);
assert.notEqual(timeoutSmsEvidence.failureKind, SOURCE_FAILURE_KINDS.PARTIAL);

const providerSms = classifySmsScan({
  configured: true,
  now,
  pages: [{ ok: false, reason: 'http_502' }]
});
assert.equal(providerSms.failureKind, SMS_SCAN_FAILURE_KINDS.PROVIDER);
assert.equal(providerSms.storedMessages, null);
assert.equal(evidenceFromSmsScan(providerSms, { now }).recordsExamined, null);

const staleSms = classifySmsScan({
  configured: true,
  now,
  pages: [{ ok: true, rows: [{ timestamp_ms: olderMessage, received_at: oldImport }] }]
});
assert.equal(staleSms.failureKind, SMS_SCAN_FAILURE_KINDS.STALE);
assert.equal(staleSms.status, 'STALE');
assert.equal(evidenceFromSmsScan(staleSms, { now }).failureKind, SOURCE_FAILURE_KINDS.STALE);
assert.equal(evidenceFromSmsScan(staleSms, { now }).explicitState, SOURCE_EXPLICIT_STATES.STALE);

const partialSms = classifySmsScan({
  configured: true,
  now,
  pages: [
    { ok: true, full: true, rows: [{ timestamp_ms: olderMessage, received_at: recentImport }] },
    { ok: false, reason: 'http' }
  ]
});
assert.equal(partialSms.coverage, 'partial');
assert.equal(partialSms.failureKind, SMS_SCAN_FAILURE_KINDS.PROVIDER);
assert.notEqual(partialSms.failureKind, SMS_SCAN_FAILURE_KINDS.PARTIAL);
assert.equal(partialSms.storedMessages, 1);
assert.equal(partialSms.countComplete, false);
assert.equal(evidenceFromSmsScan(partialSms, { now }).recordsExamined, 1);
assert.equal(evidenceFromSmsScan(partialSms, { now }).failureKind, SOURCE_FAILURE_KINDS.PROVIDER);
assert.match(evidenceFromSmsScan(partialSms, { now }).retry.guidance, /provider/i);

assert.ok(stored.evidence);
assert.equal(stored.evidence.heartbeatVerified, false);
assert.equal(stored.evidence.scheduleVersusExecution.storedRowSubstitutesForHeartbeat, false);
assert.equal(stored.evidence.failureKind, SOURCE_FAILURE_KINDS.NOT_VERIFIED);
assert.match(stored.evidence.retry.guidance, /heartbeat|execution evidence/i);
assert.equal(evidenceFromStoredCollection(stored).executedAt, '');

assert.equal(healthyCollection.evidence.heartbeatVerified, true);
assert.equal(healthyCollection.evidence.executedAt, recentHeartbeat);
assert.notEqual(healthyCollection.evidence.executedAt, healthyCollection.newestMessageAt);
assert.notEqual(healthyCollection.evidence.executedAt, healthyCollection.newestIngestAt);

const scheduleOnly = normalizeSourceHealth({
  source: 'calendar',
  name: 'Safe TaskSync',
  schedule: 'Hourly',
  auditSucceeded: true,
  connected: true,
  lastSuccess: recentImport,
  acceptLastSuccess: false,
  executionEvidence: false,
  now
});
assert.equal(scheduleOnly.executedAt, '');
assert.equal(scheduleOnly.scheduleVersusExecution.scheduleIsNotExecution, true);
assert.equal(scheduleOnly.scheduleVersusExecution.successfulAuditSubstitutesForExecution, false);
assert.equal(scheduleOnly.scheduleVersusExecution.auditIsNotExecution, true);
assert.equal(scheduleOnly.failureKind, SOURCE_FAILURE_KINDS.NOT_VERIFIED);
assert.match(scheduleOnly.ownerAction, /Safe TaskSync|execution/i);

const missingHb = classifyBridgeHeartbeat({ status: null, historicalRowCount: 12, now });
const hbEvidence = evidenceFromBridgeHeartbeat(missingHb, { now });
assert.equal(hbEvidence.heartbeatVerified, false);
assert.equal(hbEvidence.executedAt, '');
assert.equal(missingHb.scheduleVersusExecution.historicalImpliesSync, false);
assert.equal(missingHb.scheduleVersusExecution.storedRowSubstitutesForHeartbeat, false);
assert.match(hbEvidence.retry.guidance, /heartbeat|execution evidence/i);

const readiness = normalizeLocalReadiness({
  now,
  gmail: authGmail,
  sms: authSms,
  smsHeartbeat: missingHb,
  rcs: {
    connected: false,
    heartbeatVerified: false,
    lastIngestionAt: recentImport,
    newestMessageAt: olderMessage,
    reason: 'Collector unpaired. Stored RCS rows are not a live heartbeat.'
  },
  calendar: {
    schedule: 'Hourly',
    auditSucceeded: true,
    executionEvidence: false,
    lastSuccess: recentImport
  }
});
assert.equal(readiness.liveVerified, false);
assert.equal(readiness.gmail.failureKind, SOURCE_FAILURE_KINDS.AUTHORIZATION);
assert.equal(readiness.sms.failureKind, SOURCE_FAILURE_KINDS.AUTHORIZATION);
assert.equal(readiness.smsHeartbeat.heartbeatVerified, false);
assert.equal(readiness.rcs.scheduleVersusExecution.storedRowSubstitutesForHeartbeat, false);
assert.equal(readiness.rcs.executedAt, '');
assert.equal(readiness.calendar.executedAt, '');
assert.equal(readiness.calendar.scheduleVersusExecution.auditIsNotExecution, true);
assert.equal(readiness.calendar.scheduleVersusExecution.successfulAuditSubstitutesForExecution, false);
assert.match(readiness.calendar.detail, /schedule|audit/i);

const gmailEvidenceMirror = evidenceFromGmailHeader(timeoutGmail);
assert.equal(gmailEvidenceMirror.failureKind, SOURCE_FAILURE_KINDS.TIMEOUT);
assert.equal(gmailEvidenceMirror.recordsExamined, null);

console.log('source reliability tests passed');
