import { createRequire } from 'node:module';
import { observedTime, SMS_INGEST_STALE_HOURS } from './sms-scan-health.mjs';

const require = createRequire(import.meta.url);
const { sourceStatus } = require('../public/v2/js/event-finance.js');

export const SMS_HEARTBEAT_PREREQUISITE = 'No device heartbeat is stored on this preview. A stored SMS row cannot certify that the approved Android phone is collecting. Local verification requires the owner to run the LVPT SMS bridge on the approved handset and confirm a bridge status whose last_success_at is current. This server does not read that report.';

export const RCS_HEARTBEAT_PREREQUISITE = 'The Google Messages collector is not paired from this deployment. A stored RCS row is not a live collector. Local verification requires the owner to pair the read-only collector on the approved computer and confirm a current collector success time. This route does not invent that time.';

function clock(now) {
  const ms = typeof now === 'number' ? now : Date.parse(String(now || ''));
  return Number.isFinite(ms) ? ms : Date.now();
}

function checkedAt(nowMs) {
  return new Date(nowMs).toISOString();
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
    status: heartbeat ? undefined : 'UNVERIFIED',
    connected: Boolean(heartbeat),
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
  return {
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
}

export function classifyGmailHeaderRead(input = {}) {
  const nowMs = clock(input.now);
  const at = checkedAt(nowMs);
  const requested = Math.max(0, Number(input.requested) || 0);
  const reads = Array.isArray(input.reads) ? input.reads : [];
  let domainsRead = 0;
  let failures = 0;
  let headerThreads = 0;
  let newestHeader = '';
  let invalidTimestamps = 0;
  for (const read of reads) {
    if (!read || read.ok !== true || !Array.isArray(read.threads)) {
      failures += 1;
      continue;
    }
    domainsRead += 1;
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
  const partial = !unavailable && (failures > 0 || stoppedEarly);
  const readComplete = !unavailable && !partial;
  const coverage = unavailable ? 'unavailable' : partial ? 'partial' : 'read-complete';
  const storedNewestAt = observedTime(input.storedNewest, nowMs);
  let detail;
  if (unavailable) {
    detail = 'The Gmail header read did not complete for any requested domain. No header count was taken. An empty list is not proof the mailbox is empty. Full message bodies were not read.';
  } else if (partial) {
    detail = `The Gmail header read is partial. ${domainsRead} of ${requested || reads.length} domain reads returned headers, and ${failures} failed. ${input.capped ? 'The read also hit its time cap. ' : ''}${headerThreads} header threads were examined. That is not a complete count and not a fresh ingestion. Full message bodies were not read.`;
  } else if (headerThreads === 0) {
    detail = 'The bounded Gmail header read finished and returned no header threads. That is an empty metadata result for the requested domains, not a full mailbox scan and not a fresh ingestion. Full message bodies were not read.';
  } else {
    detail = `The bounded Gmail header read finished. ${headerThreads} header threads were read. Newest header time ${newestHeader || 'none'}. Metadata only. Full threads were not opened. This is not a Gmail ingestion.`;
  }
  if (invalidTimestamps > 0) detail += ' A missing or future header time was ignored.';
  detail += storedNewestAt
    ? ` Newest stored sheet date ${storedNewestAt}. A stored sheet row is not this header read.`
    : ' No valid stored sheet date was supplied. A stored sheet row is not this header read.';
  const probe = {
    name: 'Gmail header metadata',
    connected: !unavailable,
    partial,
    lastAttempt: at,
    lastSuccess: '',
    now: at,
    recordsExamined: unavailable ? null : headerThreads,
    recordsCreated: 0,
    duplicates: 0,
    unmatched: null,
    detail
  };
  return {
    coverage,
    connected: !unavailable,
    partial,
    unavailable,
    readComplete,
    metadataOnly: true,
    fullThreadAccess: false,
    domainsRequested: requested,
    domainsRead,
    failures,
    capped: input.capped === true,
    headerThreads: unavailable ? null : headerThreads,
    countComplete: readComplete,
    newestHeaderAt: readComplete ? newestHeader : '',
    newestHeaderAmongRead: unavailable ? '' : newestHeader,
    invalidTimestamps,
    storedNewestAt,
    fresh: false,
    checkedAt: at,
    probe,
    status: sourceStatus(probe),
    detail
  };
}
