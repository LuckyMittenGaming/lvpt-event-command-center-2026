import { buildAuditEntry } from './audit.mjs';

const LAUNCH_STATES = new Set(['claiming', 'active', 'terminal', 'ambiguous', 'failed']);

export function normalizeLaunch(value) {
  if (!value || typeof value !== 'object' || !LAUNCH_STATES.has(value.state)) return null;
  const agentId = typeof value.agentId === 'string' && /^bc-[A-Za-z0-9-]{8,80}$/.test(value.agentId) ? value.agentId : '';
  const runId = typeof value.runId === 'string' && /^run-[A-Za-z0-9-]{8,80}$/.test(value.runId) ? value.runId : '';
  const sha = typeof value.sha === 'string' && /^[0-9a-f]{40}$/.test(value.sha) ? value.sha : '';
  return { state: value.state, agentId, runId, sha };
}

function blankPr() {
  return {
    version: 0,
    iterations: 0,
    stopped: '',
    reviewed: [],
    firstSeen: '',
    cursorLaunch: null,
    capReviewed: false,
  };
}

function clonePr(state) {
  return {
    version: state.version,
    iterations: state.iterations,
    stopped: state.stopped || '',
    reviewed: [...state.reviewed],
    firstSeen: state.firstSeen || '',
    cursorLaunch: normalizeLaunch(state.cursorLaunch),
    capReviewed: state.capReviewed === true,
  };
}

function storedPr(version, next) {
  return {
    version,
    iterations: next.iterations,
    stopped: typeof next.stopped === 'string' ? next.stopped : '',
    reviewed: Array.isArray(next.reviewed) ? [...new Set(next.reviewed)].slice(-100) : [],
    firstSeen: typeof next.firstSeen === 'string' ? next.firstSeen : '',
    cursorLaunch: normalizeLaunch(next.cursorLaunch),
    capReviewed: next.capReviewed === true,
  };
}

export function createMemoryStore() {
  const deliveries = new Set();
  const prs = new Map();
  const floors = new Map();
  const audits = [];
  let spendMicro = 0;
  let available = true;

  return {
    kind: 'memory',
    audits,
    async ping() {
      if (!available) throw new Error('relay store failed (unavailable)');
      return true;
    },
    async claimDelivery(id) {
      if (!available) throw new Error('relay store failed (unavailable)');
      if (deliveries.has(id)) return false;
      deliveries.add(id);
      return true;
    },
    async loadPr(pr) {
      if (!available) throw new Error('relay store failed (unavailable)');
      const floor = floors.get(pr) || 0;
      const state = prs.get(pr);
      if (!state) {
        if (floor > 0) throw new Error('relay state rejected');
        return blankPr();
      }
      if (state.iterations < floor) throw new Error('relay state rejected');
      return clonePr(state);
    },
    async commitPr(pr, expectedVersion, next) {
      if (!available) throw new Error('relay store failed (unavailable)');
      const current = prs.get(pr);
      const version = current?.version || 0;
      if (version !== expectedVersion) return false;
      const floor = floors.get(pr) || 0;
      if (!Number.isInteger(next.iterations) || next.iterations < floor || next.iterations > 3) return false;
      if (current && next.iterations < current.iterations) return false;
      const stored = storedPr(version + 1, next);
      prs.set(pr, stored);
      if (stored.iterations > floor) floors.set(pr, stored.iterations);
      return true;
    },
    async readSpendMicro() {
      if (!available) throw new Error('relay store failed (unavailable)');
      return spendMicro;
    },
    async addSpendMicro(amount) {
      if (!available) throw new Error('relay store failed (unavailable)');
      if (!Number.isInteger(amount) || amount < 0) throw new Error('relay state rejected');
      spendMicro += amount;
      return spendMicro;
    },
    async appendAudit(entry) {
      if (!available) throw new Error('relay store failed (unavailable)');
      audits.push(buildAuditEntry(entry));
      if (audits.length > 500) audits.splice(0, audits.length - 500);
    },
    failNext() {
      available = false;
    },
  };
}

export const RELAY_CLAIM_SCRIPT = '-- relay:claim\nlocal ok = redis.call("SET", KEYS[1], "1", "NX")\nif not ok then return 0 end\nreturn 1';

export const RELAY_COMMIT_SCRIPT = `-- relay:commit
local raw = redis.call("GET", KEYS[1])
local version = 0
local currentIterations = 0
if raw and raw ~= "" then
  local decoded = cjson.decode(raw)
  version = tonumber(decoded.version) or 0
  currentIterations = tonumber(decoded.iterations) or 0
end
local floor = tonumber(redis.call("GET", KEYS[2]) or "0")
if currentIterations < floor then return -1 end
if version ~= tonumber(ARGV[1]) then return 0 end
local nxt = cjson.decode(ARGV[2])
local nextIterations = tonumber(nxt.iterations) or 0
if nextIterations < floor or nextIterations < currentIterations or nextIterations > 3 then return -1 end
if nextIterations > floor then redis.call("SET", KEYS[2], tostring(nextIterations)) end
redis.call("SET", KEYS[1], ARGV[2])
return 1`;

function upstashCommand(fetchImpl, url, token, args) {
  return fetchImpl(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(args),
  }).then(async (response) => {
    if (!response.ok) throw new Error(`relay store failed (${response.status})`);
    const data = await response.json();
    if (!data || data.error) throw new Error('relay store failed (result)');
    return data.result;
  });
}

export function createRedisStore({ url, token, fetchImpl }) {
  const audits = [];
  const command = (args) => upstashCommand(fetchImpl, url, token, args);
  return {
    kind: 'redis',
    audits,
    async ping() {
      const result = await command(['PING']);
      if (result !== 'PONG') throw new Error('relay store failed (ping)');
      return true;
    },
    async claimDelivery(id) {
      const result = await command(['EVAL', RELAY_CLAIM_SCRIPT, 1, `relay:delivery:${id}`]);
      return result === 1;
    },
    async loadPr(pr) {
      const raw = await command(['GET', `relay:pr:${pr}`]);
      const floorRaw = await command(['GET', `relay:floor:${pr}`]);
      const floor = Number(floorRaw || 0);
      if (!raw) {
        if (floor > 0) throw new Error('relay state rejected');
        return blankPr();
      }
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.iterations < floor) throw new Error('relay state rejected');
      return clonePr(parsed);
    },
    async commitPr(pr, expectedVersion, next) {
      const stored = storedPr(expectedVersion + 1, next);
      const result = await command([
        'EVAL',
        RELAY_COMMIT_SCRIPT,
        2,
        `relay:pr:${pr}`,
        `relay:floor:${pr}`,
        String(expectedVersion),
        JSON.stringify(stored),
      ]);
      return result === 1;
    },
    async readSpendMicro() {
      const raw = await command(['GET', 'relay:spend']);
      return Number(raw || 0);
    },
    async addSpendMicro(amount) {
      if (!Number.isInteger(amount) || amount < 0) throw new Error('relay state rejected');
      const result = await command(['INCRBY', 'relay:spend', amount]);
      return Number(result);
    },
    async appendAudit(entry) {
      const clean = buildAuditEntry(entry);
      audits.push(clean);
      await command(['LPUSH', 'relay:audit', JSON.stringify(clean)]);
      await command(['LTRIM', 'relay:audit', 0, 499]);
    },
  };
}
