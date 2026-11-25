import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { classifyGmailHeaderRead, classifyStoredCollection } from '../lib/source-reliability.mjs';

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

console.log('source reliability tests passed');
