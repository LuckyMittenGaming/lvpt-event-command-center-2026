import { buildAuditEntry } from './audit.mjs';

const LAUNCH_STATES = new Set(['claiming', 'active', 'terminal', 'ambiguous', 'failed']);
const HOLD_PHASES = new Set(['calling', 'ready', 'stale']);
const HOLD_DECISIONS = new Set(['PASS', 'REQUEST_CHANGES', 'HUMAN_APPROVAL_REQUIRED']);
export const PENDING_LIMIT = 50;

export function normalizeLaunch(value) {
  if (!value || typeof value !== 'object' || !LAUNCH_STATES.has(value.state)) return null;
  const agentId = typeof value.agentId === 'string' && /^bc-[A-Za-z0-9-]{8,80}$/.test(value.agentId) ? value.agentId : '';
  const runId = typeof value.runId === 'string' && /^run-[A-Za-z0-9-]{8,80}$/.test(value.runId) ? value.runId : '';
  const sha = typeof value.sha === 'string' && /^[0-9a-f]{40}$/.test(value.sha) ? value.sha : '';
  const launchedAt = typeof value.launchedAt === 'string' && Number.isFinite(Date.parse(value.launchedAt)) ? value.launchedAt : '';
  const claimUntil = typeof value.claimUntil === 'string' && Number.isFinite(Date.parse(value.claimUntil)) ? value.claimUntil : '';
  const attempts = Number.isInteger(value.attempts) && value.attempts >= 0 && value.attempts <= 20 ? value.attempts : 0;
  return {
    state: value.state,
    agentId,
    runId,
    sha,
    launchedAt,
    claimUntil,
    attempts,
    notified: value.notified === true,
    notifyState: value.notifyState === 'claiming' || value.notifyState === 'sent' ? value.notifyState : '',
    notifyUntil: typeof value.notifyUntil === 'string' && Number.isFinite(Date.parse(value.notifyUntil)) ? value.notifyUntil : '',
    notice: typeof value.notice === 'string' && /^[a-z_]{1,60}$/.test(value.notice) ? value.notice : '',
    noticeDecision: value.noticeDecision === 'PASS' || value.noticeDecision === 'REQUEST_CHANGES' || value.noticeDecision === 'HUMAN_APPROVAL_REQUIRED' ? value.noticeDecision : '',
    noticeRationale: typeof value.noticeRationale === 'string' ? value.noticeRationale.slice(0, 500) : '',
    noticeSha: typeof value.noticeSha === 'string' && /^[0-9a-f]{40}$/.test(value.noticeSha) ? value.noticeSha : '',
  };
}

export function normalizeHold(value) {
  if (!value || typeof value !== 'object') return null;
  const sha = typeof value.sha === 'string' && /^[0-9a-f]{40}$/.test(value.sha) ? value.sha : '';
  const phase = HOLD_PHASES.has(value.phase) ? value.phase : '';
  if (!sha || !phase) return null;
  const startedAt = typeof value.startedAt === 'string' && Number.isFinite(Date.parse(value.startedAt)) ? value.startedAt : '';
  return {
    sha,
    phase,
    startedAt,
    decision: HOLD_DECISIONS.has(value.decision) ? value.decision : '',
    rationale: typeof value.rationale === 'string' ? value.rationale.slice(0, 500) : '',
    reason: typeof value.reason === 'string' && /^[a-z_]{1,60}$/.test(value.reason) ? value.reason : '',
    tokens: Number.isFinite(value.tokens) ? Math.max(0, Math.round(value.tokens)) : 0,
    costUsd: Number.isFinite(value.costUsd) ? Math.max(0, value.costUsd) : 0,
  };
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
    reviewHold: null,
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
    reviewHold: normalizeHold(state.reviewHold),
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
    reviewHold: normalizeHold(next.reviewHold),
  };
}

function reject(code) {
  const error = new Error(code === 'spend_cap' ? 'spend cap' : 'pending full');
  error.code = code;
  throw error;
}

export function takePending(ids, cursor, limit) {
  const ordered = [...ids].map((item) => Number(item)).filter((item) => Number.isInteger(item) && item > 0);
  ordered.sort((left, right) => left - right);
  const cap = Math.max(1, Math.min(10, Number(limit) || 10));
  if (ordered.length === 0) return { ids: [], cursor: 0 };
  const start = ((Number(cursor) || 0) % ordered.length + ordered.length) % ordered.length;
  const count = Math.min(cap, ordered.length);
  const chosen = [];
  for (let index = 0; index < count; index += 1) chosen.push(ordered[(start + index) % ordered.length]);
  return { ids: chosen, cursor: (start + count) % ordered.length };
}

export function createMemoryStore() {
  const deliveries = new Set();
  const pending = new Set();
  const prs = new Map();
  const floors = new Map();
  const audits = [];
  let spendMicro = 0;
  let pendingCursor = 0;
  let available = true;

  return {
    kind: 'memory',
    audits,
    async markPending(pr) {
      if (!available) throw new Error('relay store failed (unavailable)');
      const id = Number(pr);
      if (!Number.isInteger(id) || id < 1) return false;
      if (!pending.has(id) && pending.size >= PENDING_LIMIT) return false;
      pending.add(id);
      return true;
    },
    async clearPending(pr) {
      if (!available) throw new Error('relay store failed (unavailable)');
      pending.delete(Number(pr));
      return true;
    },
    async listPending(limit = 10) {
      if (!available) throw new Error('relay store failed (unavailable)');
      const page = takePending(pending, pendingCursor, limit);
      pendingCursor = page.cursor;
      return page.ids;
    },
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
    async commitPr(pr, expectedVersion, next, options = {}) {
      if (!available) throw new Error('relay store failed (unavailable)');
      const current = prs.get(pr);
      const version = current?.version || 0;
      if (version !== expectedVersion) return false;
      const floor = floors.get(pr) || 0;
      if (!Number.isInteger(next.iterations) || next.iterations < floor || next.iterations > 3) return false;
      if (current && next.iterations < current.iterations) return false;
      const reserve = Number.isInteger(options.reserveMicro) ? options.reserveMicro : 0;
      const cap = Number.isInteger(options.capMicro) ? options.capMicro : 0;
      if (reserve < 0) throw new Error('relay state rejected');
      if (reserve > 0 && spendMicro + reserve > cap) reject('spend_cap');
      const action = options.pending === 'add' || options.pending === 'remove' ? options.pending : 'keep';
      const id = Number(pr);
      if (action === 'add' && !pending.has(id) && pending.size >= PENDING_LIMIT) reject('pending_full');
      const stored = storedPr(version + 1, next);
      prs.set(pr, stored);
      if (stored.iterations > floor) floors.set(pr, stored.iterations);
      if (reserve > 0) spendMicro += reserve;
      if (action === 'add') pending.add(id);
      if (action === 'remove') pending.delete(id);
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
local action = ARGV[3] or "keep"
local reserve = tonumber(ARGV[4]) or 0
local cap = tonumber(ARGV[5]) or 0
local member = ARGV[6]
if reserve > 0 then
  local spend = tonumber(redis.call("GET", KEYS[4]) or "0")
  if spend + reserve > cap then return -3 end
end
if action == "add" then
  if redis.call("SISMEMBER", KEYS[3], member) == 0 and redis.call("SCARD", KEYS[3]) >= 50 then
    return -2
  end
end
if nextIterations > floor then redis.call("SET", KEYS[2], tostring(nextIterations)) end
if reserve > 0 then redis.call("INCRBY", KEYS[4], reserve) end
if action == "add" then redis.call("SADD", KEYS[3], member) end
if action == "remove" then redis.call("SREM", KEYS[3], member) end
redis.call("SET", KEYS[1], ARGV[2])
return 1`;

export const RELAY_LIST_SCRIPT = `-- relay:pending-list
local cursor = tonumber(redis.call("GET", KEYS[1]) or "0") or 0
local members = redis.call("SMEMBERS", KEYS[2])
table.sort(members)
local n = #members
local cap = tonumber(ARGV[1]) or 10
if cap < 1 then cap = 1 end
if cap > 10 then cap = 10 end
if n == 0 then
  redis.call("SET", KEYS[1], "0")
  return {}
end
if cursor >= n or cursor < 0 then cursor = 0 end
local count = math.min(cap, n)
local out = {}
for i = 0, count - 1 do
  out[#out + 1] = members[((cursor + i) % n) + 1]
end
redis.call("SET", KEYS[1], tostring((cursor + count) % n))
return out`;

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
    async markPending(pr) {
      const stored = await this.loadPr(pr);
      return this.commitPr(pr, stored.version, stored, { pending: 'add' });
    },
    async clearPending(pr) {
      const stored = await this.loadPr(pr);
      return this.commitPr(pr, stored.version, stored, { pending: 'remove' });
    },
    async listPending(limit = 10) {
      const cap = Math.max(1, Math.min(10, Number(limit) || 10));
      const members = await command(['EVAL', RELAY_LIST_SCRIPT, 2, 'relay:pending:cursor', 'relay:pending', String(cap)]);
      const list = Array.isArray(members) ? members : [];
      return list.map((item) => Number(item)).filter((item) => Number.isInteger(item) && item > 0);
    },
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
    async commitPr(pr, expectedVersion, next, options = {}) {
      const stored = storedPr(expectedVersion + 1, next);
      const action = options.pending === 'add' || options.pending === 'remove' ? options.pending : 'keep';
      const reserve = Number.isInteger(options.reserveMicro) ? options.reserveMicro : 0;
      const cap = Number.isInteger(options.capMicro) ? options.capMicro : 0;
      const result = await command([
        'EVAL',
        RELAY_COMMIT_SCRIPT,
        4,
        `relay:pr:${pr}`,
        `relay:floor:${pr}`,
        'relay:pending',
        'relay:spend',
        String(expectedVersion),
        JSON.stringify(stored),
        action,
        String(reserve),
        String(cap),
        String(Number(pr)),
      ]);
      if (result === -2) reject('pending_full');
      if (result === -3) reject('spend_cap');
      if (result === -1) return false;
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
