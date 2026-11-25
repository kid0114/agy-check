'use strict';

/**
 * Session management operations for the agy-check panel: archive/unarchive,
 * permanent delete (official agy API only), closing agy windows that still
 * hold a conversation, and the loopback API endpoint pool fed by
 * `agy-check panel handoff`.
 *
 * Why the official API is mandatory for delete: running agy instances keep
 * conversation summaries in memory and in `jetbox_summaries_proto.pb`, so a
 * conversation removed only from disk is re-inserted into
 * `conversation_summaries.db` the next time an agy starts (verified on agy
 * 1.5.17). `ConversationService/DeleteConversation` does not have that problem.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { resolveAntigravityPath } = require('./paths.js');
const {
  resolveLsEndpoint,
  callLsConversationService,
  writeAnnotationsArchived,
  getSpeedCacheCandidatePaths,
} = require('./panel-data.js');
const { isInteractiveAgyCommand } = require('./account-sync.js');
const { getSnapshotPath, readSessionSnapshot } = require('./session-snapshot.js');

const ENDPOINTS_FILE = 'agy-check-ls-endpoints.json';
const HANDOFF_COMMAND = 'agy-check panel handoff';
const MAX_BATCH = 100;
const MAX_POOL = 10;
const ID_RE = /^[a-zA-Z0-9._-]{4,128}$/;
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function baseDirOf(rootDir) {
  return rootDir || resolveAntigravityPath('');
}

function isValidConversationId(id) {
  return typeof id === 'string' && ID_RE.test(id) && !id.startsWith('pid-');
}

function normalizeIds(ids) {
  if (!Array.isArray(ids) || ids.length === 0) {
    return { ok: false, status: 400, error: 'No sessions selected' };
  }
  const unique = [...new Set(ids.map((v) => String(v || '').trim()))];
  if (unique.length > MAX_BATCH) {
    return { ok: false, status: 400, error: `At most ${MAX_BATCH} sessions per request` };
  }
  const bad = unique.filter((id) => !isValidConversationId(id));
  if (bad.length > 0) {
    return { ok: false, status: 400, error: `Invalid conversation ID: ${bad[0].slice(0, 64)}` };
  }
  return { ok: true, ids: unique };
}

// ---------------------------------------------------------------------------
// Process helpers (injectable for tests)
// ---------------------------------------------------------------------------

function defaultIsPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM';
  }
}

function defaultListenerPid(port) {
  try {
    const out = execFileSync('/usr/sbin/lsof', ['-nP', '-t', `-iTCP:${port}`, '-sTCP:LISTEN'], {
      encoding: 'utf8',
      timeout: 2000,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    const pid = Number.parseInt(out.split(/\s+/)[0], 10);
    return Number.isInteger(pid) && pid > 1 ? pid : null;
  } catch {
    return null;
  }
}

function defaultProcessCommand(pid) {
  try {
    const out = execFileSync('/bin/ps', ['-o', 'command=', '-p', String(pid)], {
      encoding: 'utf8',
      timeout: 1500,
      env: { ...process.env, LC_ALL: 'C', LANG: 'C' },
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return out || null;
  } catch {
    return null;
  }
}

function defaultKill(pid, signal) {
  process.kill(pid, signal);
}

function resolveDeps(deps = {}) {
  return {
    isPidAlive: deps.isPidAlive || defaultIsPidAlive,
    listenerPid: deps.listenerPid || defaultListenerPid,
    processCommand: deps.processCommand || defaultProcessCommand,
    kill: deps.kill || defaultKill,
    termWaitMs: deps.termWaitMs ?? 5000,
    killWaitMs: deps.killWaitMs ?? 2000,
    pollMs: deps.pollMs ?? 100,
    goneWaitMs: deps.goneWaitMs ?? 3000,
  };
}

function isAgyProcessCommand(cmd) {
  if (!cmd) return false;
  const exe = path.basename(String(cmd).trim().split(/\s+/)[0] || '');
  return exe === 'agy' || exe.startsWith('agy.');
}

// ---------------------------------------------------------------------------
// Endpoint pool (`agy-check panel handoff`)
// ---------------------------------------------------------------------------

function getEndpointsPath(rootDir = null) {
  return path.join(baseDirOf(rootDir), ENDPOINTS_FILE);
}

function isValidPoolEntry(e) {
  return Boolean(
    e && typeof e === 'object' &&
    LOOPBACK_HOSTS.has(e.host) &&
    Number.isInteger(e.port) && e.port > 0 && e.port <= 65535 &&
    typeof e.csrfToken === 'string' && e.csrfToken.length > 0 &&
    (e.agyPid === null || e.agyPid === undefined || Number.isInteger(e.agyPid))
  );
}

function readEndpointPool(rootDir = null) {
  try {
    const data = JSON.parse(fs.readFileSync(getEndpointsPath(rootDir), 'utf8'));
    return Array.isArray(data?.endpoints) ? data.endpoints.filter(isValidPoolEntry) : [];
  } catch {
    return [];
  }
}

function writeEndpointPool(rootDir, endpoints) {
  const file = getEndpointsPath(rootDir);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ version: 1, endpoints }, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, file);
  try { fs.chmodSync(file, 0o600); } catch {}
}

/**
 * Stores the agy API endpoint of the calling agy window (taken from the
 * environment agy gives to agent shell commands) so the panel daemon can use
 * it later. Token stays in a 0600 file inside agy's data dir.
 */
function handoffEndpoint(options = {}) {
  const { env = process.env, rootDir = null, now = Date.now() } = options;
  const deps = resolveDeps(options.deps);
  const ep = resolveLsEndpoint(env);
  if (!ep) {
    return {
      ok: false,
      error: 'No agy API connection in this environment. Run this from a shell started by an agy agent, e.g. ask the agent in an agy window to run: ' + HANDOFF_COMMAND,
    };
  }
  const agyPid = deps.listenerPid(ep.port);
  if (!agyPid) {
    return { ok: false, error: 'The agy API address in this environment is not listening anymore' };
  }
  const pool = readEndpointPool(rootDir)
    .filter((e) => e.port !== ep.port && e.agyPid !== agyPid)
    .filter((e) => !e.agyPid || deps.isPidAlive(e.agyPid));
  pool.unshift({
    host: ep.host,
    port: ep.port,
    csrfToken: ep.csrfToken,
    agyPid,
    conversationId: typeof env.ANTIGRAVITY_CONVERSATION_ID === 'string' ? env.ANTIGRAVITY_CONVERSATION_ID : null,
    addedAt: now,
  });
  writeEndpointPool(rootDir, pool.slice(0, MAX_POOL));
  return { ok: true, agyPid, endpointCount: Math.min(pool.length, MAX_POOL) };
}

/**
 * Returns usable loopback endpoints: the daemon's own inherited environment
 * (if any) plus handed-off ones, each verified to still be served by the same
 * live agy process (protects against sending a token to a reused port).
 * Dead handed-off entries are pruned from the pool file.
 */
function getLiveEndpoints(options = {}) {
  const { rootDir = null, env = process.env } = options;
  const deps = resolveDeps(options.deps);
  const candidates = [];
  const envEp = resolveLsEndpoint(env);
  if (envEp) {
    candidates.push({
      ...envEp,
      agyPid: null,
      conversationId: typeof env.ANTIGRAVITY_CONVERSATION_ID === 'string' ? env.ANTIGRAVITY_CONVERSATION_ID : null,
      source: 'env',
    });
  }
  const pool = readEndpointPool(rootDir);
  for (const e of pool) candidates.push({ ...e, source: 'handoff' });

  const live = [];
  const keep = [];
  const seenPorts = new Set();
  let pruned = false;
  for (const c of candidates) {
    if (seenPorts.has(c.port)) {
      if (c.source === 'handoff') keep.push(pool.find((p) => p.port === c.port && p.csrfToken === c.csrfToken));
      continue;
    }
    const lp = deps.listenerPid(c.port);
    const valid = Boolean(lp) &&
      (c.agyPid ? lp === c.agyPid : isAgyProcessCommand(deps.processCommand(lp)));
    if (!valid) {
      if (c.source === 'handoff') pruned = true;
      continue;
    }
    seenPorts.add(c.port);
    live.push({ ...c, agyPid: c.agyPid || lp });
    if (c.source === 'handoff') keep.push(pool.find((p) => p.port === c.port && p.csrfToken === c.csrfToken));
  }
  if (pruned) {
    try { writeEndpointPool(rootDir, keep.filter(Boolean)); } catch {}
  }
  return live;
}

/** Public, secret-free summary for the overview payload. */
function describeOps(endpoints) {
  const list = Array.isArray(endpoints) ? endpoints : [];
  return {
    archiveAvailable: true,
    deleteAvailable: list.length > 0,
    endpointCount: list.length,
    handoffCommand: HANDOFF_COMMAND,
  };
}

async function callAnyEndpoint(endpoints, method, payload, timeoutMs = 4000) {
  let last = { ok: false, error: 'No agy API connection' };
  for (const ep of endpoints) {
    const res = await callLsConversationService(ep, method, payload, timeoutMs);
    if (res.ok) return { ...res, agyPid: ep.agyPid };
    last = res;
  }
  return last;
}

// ---------------------------------------------------------------------------
// Archive
// ---------------------------------------------------------------------------

function conversationExistsOnDisk(baseDir, id) {
  return (
    fs.existsSync(path.join(baseDir, 'conversations', `${id}.db`)) ||
    fs.existsSync(path.join(baseDir, 'brain', id)) ||
    fs.existsSync(path.join(baseDir, 'annotations', `${id}.pbtxt`))
  );
}

/**
 * Archives or unarchives conversations. Prefers the official API, verifying
 * its response, and falls back to the `archived` field in
 * `annotations/<id>.pbtxt` (agy re-reads that file).
 */
async function setConversationsArchived(ids, archived, options = {}) {
  const norm = normalizeIds(ids);
  if (!norm.ok) return norm;
  const baseDir = baseDirOf(options.rootDir);
  const endpoints = Array.isArray(options.endpoints) ? options.endpoints : [];
  const want = Boolean(archived);
  const results = [];
  for (const id of norm.ids) {
    if (!conversationExistsOnDisk(baseDir, id)) {
      results.push({ conversationId: id, ok: false, archived: !want, error: 'Conversation not found' });
      continue;
    }
    let via = null;
    let apiError = null;
    if (endpoints.length > 0) {
      const res = await callAnyEndpoint(endpoints, 'UpdateConversation', { conversationId: id, annotations: { archived: want } });
      const conv = res.ok ? (res.data.conversation || res.data) : null;
      const got = Boolean(conv && conv.annotations && conv.annotations.archived);
      if (res.ok && got === want) via = 'agy-api';
      else apiError = res.ok ? 'agy API did not confirm the change' : res.error;
    }
    if (!via) {
      try {
        writeAnnotationsArchived(baseDir, id, want);
        via = 'annotations-file';
      } catch (err) {
        results.push({ conversationId: id, ok: false, archived: !want, error: `Failed to update annotations: ${err.message}` });
        continue;
      }
    }
    const item = { conversationId: id, ok: true, archived: want, via };
    if (apiError) item.apiError = apiError;
    results.push(item);
  }
  return { ok: results.every((r) => r.ok), results };
}

// ---------------------------------------------------------------------------
// Close agy windows
// ---------------------------------------------------------------------------

/**
 * Gracefully stops one interactive agy process: SIGTERM, wait, then SIGKILL.
 * Re-validates that the PID still belongs to an interactive agy right before
 * signalling, so a recycled PID is never killed.
 */
async function closeAgyProcess(pid, depsIn = {}) {
  const deps = resolveDeps(depsIn);
  if (!Number.isInteger(pid) || pid <= 1 || pid === process.pid) {
    return { ok: false, error: 'Invalid PID' };
  }
  if (!deps.isPidAlive(pid)) return { ok: true, pid, alreadyExited: true };
  const cmd = deps.processCommand(pid);
  if (!cmd || !isInteractiveAgyCommand(cmd)) {
    return { ok: false, pid, error: `PID ${pid} is not an interactive agy window anymore` };
  }
  const waitExit = async (ms) => {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
      if (!deps.isPidAlive(pid)) return true;
      await sleep(deps.pollMs);
    }
    return !deps.isPidAlive(pid);
  };
  try {
    deps.kill(pid, 'SIGTERM');
  } catch (err) {
    if (err.code === 'ESRCH') return { ok: true, pid, alreadyExited: true };
    return { ok: false, pid, error: `Failed to stop PID ${pid}: ${err.code || err.message}` };
  }
  if (await waitExit(deps.termWaitMs)) return { ok: true, pid, signal: 'SIGTERM' };
  try {
    deps.kill(pid, 'SIGKILL');
  } catch (err) {
    if (err.code === 'ESRCH') return { ok: true, pid, signal: 'SIGTERM' };
    return { ok: false, pid, error: `Failed to force-stop PID ${pid}: ${err.code || err.message}` };
  }
  if (await waitExit(deps.killWaitMs)) return { ok: true, pid, signal: 'SIGKILL' };
  return { ok: false, pid, error: `PID ${pid} did not exit` };
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

function remainingArtifacts(baseDir, id) {
  const left = [];
  if (fs.existsSync(path.join(baseDir, 'conversations', `${id}.db`))) left.push('conversation database');
  if (fs.existsSync(path.join(baseDir, 'brain', id))) left.push('brain directory');
  if (fs.existsSync(path.join(baseDir, 'annotations', `${id}.pbtxt`))) left.push('annotations');
  return left;
}

function removeOwnArtifacts(baseDir, id) {
  const snapshot = readSessionSnapshot(id, baseDir);
  const files = [
    path.join(baseDir, 'speed-cache', `hook-timing-${id}.json`),
    getSnapshotPath(id, baseDir),
    ...getSpeedCacheCandidatePaths(id, baseDir, snapshot),
  ].filter(Boolean);
  for (const f of new Set(files)) {
    try { fs.unlinkSync(f); } catch {}
  }
}

function findHolders(ids, runningSessions) {
  const holders = [];
  const idSet = new Set(ids);
  for (const proc of Array.isArray(runningSessions) ? runningSessions : []) {
    if (!proc || !Number.isInteger(proc.pid)) continue;
    const held = new Set();
    if (proc.conversationId && idSet.has(proc.conversationId)) held.add(proc.conversationId);
    for (const cid of proc.openConversationIds || []) {
      if (idSet.has(cid)) held.add(cid);
    }
    for (const cid of held) {
      holders.push({ conversationId: cid, pid: proc.pid, startedAtMs: proc.startedAtMs || null, cwd: proc.cwd || null });
    }
  }
  return holders;
}

/**
 * Permanently deletes conversations through agy's official API.
 *
 * Options: rootDir, endpoints (live), runningSessions (from
 * detectRunningAgySessions), closeRunning, confirm ("DELETE"), sessionInfo
 * (Map id -> { title, isGenerating }) for richer 409 payloads, deps.
 */
async function deleteConversations(ids, options = {}) {
  if (options.confirm !== 'DELETE') {
    return { ok: false, status: 400, code: 'confirm_required', error: 'Type DELETE to confirm permanent deletion' };
  }
  const norm = normalizeIds(ids);
  if (!norm.ok) return norm;
  const baseDir = baseDirOf(options.rootDir);
  const deps = resolveDeps(options.deps);
  const endpoints = Array.isArray(options.endpoints) ? options.endpoints : [];
  const info = options.sessionInfo instanceof Map ? options.sessionInfo : new Map();

  if (endpoints.length === 0) {
    return {
      ok: false,
      status: 409,
      code: 'no_endpoint',
      error: 'Permanent delete needs a live agy API connection. In any open agy window, ask the agent to run the handoff command, then try again.',
      handoffCommand: HANDOFF_COMMAND,
    };
  }

  const holders = findHolders(norm.ids, options.runningSessions);
  if (holders.length > 0 && options.closeRunning !== true) {
    return {
      ok: false,
      status: 409,
      code: 'running',
      error: 'Some selected sessions are still open in an agy window',
      running: holders.map((h) => ({
        ...h,
        title: info.get(h.conversationId)?.title || h.conversationId.slice(0, 8),
        isGenerating: Boolean(info.get(h.conversationId)?.isGenerating),
      })),
    };
  }

  const pidsToClose = [...new Set(holders.map((h) => h.pid))];
  const usable = endpoints.filter((e) => !pidsToClose.includes(e.agyPid));
  if (usable.length === 0) {
    return {
      ok: false,
      status: 409,
      code: 'endpoint_would_close',
      error: 'Closing these windows would also close the only agy that provides the API connection. Run the handoff command in a different agy window first.',
      handoffCommand: HANDOFF_COMMAND,
    };
  }

  const closedPids = [];
  for (const pid of pidsToClose) {
    const res = await closeAgyProcess(pid, deps);
    if (!res.ok) {
      return { ok: false, status: 500, error: res.error || `Could not close agy window PID ${pid}`, closedPids };
    }
    closedPids.push(pid);
  }

  const results = [];
  for (const id of norm.ids) {
    const res = await callAnyEndpoint(usable, 'DeleteConversation', { conversationId: id });
    if (!res.ok) {
      results.push({ conversationId: id, ok: false, error: res.error || 'agy API delete failed' });
      continue;
    }
    let left = remainingArtifacts(baseDir, id);
    const deadline = Date.now() + deps.goneWaitMs;
    while (left.length > 0 && Date.now() < deadline) {
      await sleep(150);
      left = remainingArtifacts(baseDir, id);
    }
    removeOwnArtifacts(baseDir, id);
    if (left.length > 0) {
      results.push({ conversationId: id, ok: false, error: `agy reported success but these still exist: ${left.join(', ')}` });
    } else {
      results.push({ conversationId: id, ok: true });
    }
  }
  return { ok: results.every((r) => r.ok), results, closedPids };
}

module.exports = {
  ENDPOINTS_FILE,
  HANDOFF_COMMAND,
  MAX_BATCH,
  getEndpointsPath,
  readEndpointPool,
  writeEndpointPool,
  handoffEndpoint,
  getLiveEndpoints,
  describeOps,
  setConversationsArchived,
  closeAgyProcess,
  findHolders,
  deleteConversations,
};
