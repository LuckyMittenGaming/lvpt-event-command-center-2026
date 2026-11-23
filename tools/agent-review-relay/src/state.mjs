// File state is not valid for the Vercel relay. Live mode uses the Redis store.
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { buildAuditEntry } from './audit.mjs';
import { STATE_VERSION } from './constants.mjs';

function blank() {
  return {
    stateVersion: STATE_VERSION,
    deliveries: [],
    reviewed: [],
    iterations: {},
    stopped: {},
    firstSeen: {},
    spendUsd: 0,
    audits: [],
    inFlight: {},
  };
}

function assertLoaded(parsed) {
  if (!parsed || parsed.stateVersion !== STATE_VERSION) {
    throw new Error('relay state rejected');
  }
  if (!Array.isArray(parsed.deliveries) || !Array.isArray(parsed.reviewed) || !Array.isArray(parsed.audits)) {
    throw new Error('relay state rejected');
  }
  if (!parsed.iterations || typeof parsed.iterations !== 'object' || Array.isArray(parsed.iterations)) {
    throw new Error('relay state rejected');
  }
  if (!Number.isFinite(parsed.spendUsd) || parsed.spendUsd < 0) throw new Error('relay state rejected');
  for (const id of parsed.deliveries) {
    if (typeof id !== 'string') throw new Error('relay state rejected');
  }
  for (const key of parsed.reviewed) {
    if (!/^\d+:[0-9a-f]{40}$/.test(key)) throw new Error('relay state rejected');
  }
  for (const [pr, count] of Object.entries(parsed.iterations)) {
    if (!/^\d+$/.test(pr) || !Number.isInteger(count) || count < 0 || count > 3) throw new Error('relay state rejected');
  }
  return {
    stateVersion: STATE_VERSION,
    deliveries: parsed.deliveries.slice(-5000),
    reviewed: parsed.reviewed.slice(-5000),
    iterations: { ...parsed.iterations },
    stopped: parsed.stopped && typeof parsed.stopped === 'object' ? { ...parsed.stopped } : {},
    firstSeen: parsed.firstSeen && typeof parsed.firstSeen === 'object' ? { ...parsed.firstSeen } : {},
    spendUsd: parsed.spendUsd,
    audits: parsed.audits.slice(-500),
    inFlight: {},
  };
}

function readState(file) {
  if (!existsSync(file)) return blank();
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    throw new Error('relay state rejected');
  }
  return assertLoaded(parsed);
}

function serialize(data) {
  return {
    stateVersion: STATE_VERSION,
    deliveries: data.deliveries,
    reviewed: data.reviewed,
    iterations: data.iterations,
    stopped: data.stopped,
    firstSeen: data.firstSeen,
    spendUsd: data.spendUsd,
    audits: data.audits,
  };
}

export function createState({ file = '' } = {}) {
  const data = file ? readState(file) : blank();
  return {
    data,
    file,
    claim(id) {
      if (data.deliveries.includes(id)) return false;
      data.deliveries.push(id);
      if (data.deliveries.length > 5000) data.deliveries.splice(0, data.deliveries.length - 5000);
      return true;
    },
    record(entry) {
      data.audits.push(buildAuditEntry(entry));
      if (data.audits.length > 500) data.audits.splice(0, data.audits.length - 500);
    },
    persist() {
      if (!file) return true;
      mkdirSync(dirname(file), { recursive: true });
      const tmp = `${file}.${randomBytes(4).toString('hex')}.tmp`;
      writeFileSync(tmp, JSON.stringify(serialize(data)), { mode: 0o600 });
      renameSync(tmp, file);
      return true;
    },
  };
}
