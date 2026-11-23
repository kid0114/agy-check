'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { resolveAntigravityPath } = require('./paths.js');

const SNAPSHOT_VERSION = 1;

function sanitizeConversationKey(conversationId) {
  const raw = String(conversationId || '').trim();
  if (!raw) return '';
  return raw.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function getSessionsDir(rootDir = null) {
  if (rootDir) return path.join(rootDir, 'sessions');
  return resolveAntigravityPath('sessions');
}

function getSnapshotPath(conversationId, rootDir = null) {
  const key = sanitizeConversationKey(conversationId);
  if (!key) return null;
  return path.join(getSessionsDir(rootDir), `${key}.json`);
}

function readSessionSnapshot(conversationId, rootDir = null) {
  const filePath = getSnapshotPath(conversationId, rootDir);
  if (!filePath) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!raw || typeof raw !== 'object') return null;
    return raw;
  } catch {
    return null;
  }
}

function readAllSessionSnapshots(rootDir = null) {
  const dir = getSessionsDir(rootDir);
  const map = new Map();
  let entries;
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return map;
  }
  for (const name of entries) {
    if (!name.endsWith('.json')) continue;
    const fullPath = path.join(dir, name);
    try {
      const parsed = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
      if (parsed && typeof parsed === 'object') {
        const id = parsed.conversationId || name.slice(0, -5);
        if (id) map.set(id, parsed);
      }
    } catch {
      // Ignore malformed snapshot files
    }
  }
  return map;
}

/**
 * Walks ancestor processes on Unix (max 6 hops) to identify the invoking `agy`
 * process PID and launch timestamp. Returns null on Windows or lookup failure.
 */
function findAncestorAgyProcess(startPid = process.ppid, platform = process.platform) {
  if (platform === 'win32' || !Number.isInteger(startPid) || startPid <= 1) {
    return null;
  }
  let cur = startPid;
  const visited = new Set();
  for (let hop = 0; hop < 6 && cur > 1 && !visited.has(cur); hop += 1) {
    visited.add(cur);
    try {
      const out = execFileSync('/bin/ps', ['-o', 'ppid=,lstart=,comm=', '-p', String(cur)], {
        encoding: 'utf8',
        timeout: 800,
        env: { ...process.env, LC_ALL: 'C', LANG: 'C' },
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
      if (!out) break;
      // lstart is 5 whitespace-separated fields: e.g. "Mon Nov 23 07:04:30 2026"
      const m = out.match(/^(\d+)\s+([A-Z][a-z]{2}\s+[A-Z][a-z]{2}\s+\d+\s+\d{2}:\d{2}:\d{2}\s+\d{4})\s+(.+)$/);
      if (!m) break;
      const ppid = Number.parseInt(m[1], 10);
      const startedAtMs = Date.parse(m[2]);
      const comm = path.basename(m[3].trim());
      if (comm === 'agy' || comm.startsWith('agy.')) {
        return {
          pid: cur,
          startedAtMs: Number.isFinite(startedAtMs) ? startedAtMs : null,
        };
      }
      cur = ppid;
    } catch {
      break;
    }
  }
  return null;
}

/**
 * Evaluates whether the invoking agy process is bound to an older account than
 * the currently active Keychain/auth account.
 */
function evaluateAccountDrift({
  existingSnapshot = null,
  agyProcess = null,
  activeEmail = null,
  accountSwitchedAt = null,
}) {
  if (!activeEmail) {
    return {
      sessionAccountEmail: existingSnapshot?.sessionAccountEmail || null,
      drift: null,
    };
  }

  const sameProcess = Boolean(
    agyProcess?.pid &&
    existingSnapshot?.agyPid &&
    agyProcess.pid === existingSnapshot.agyPid
  );

  // Sticky account binding for a running process: an interactive agy process
  // keeps its in-memory OAuth token until restarted.
  let sessionAccountEmail = activeEmail;
  if (sameProcess && existingSnapshot?.sessionAccountEmail) {
    sessionAccountEmail = existingSnapshot.sessionAccountEmail;
  } else if (!agyProcess?.pid && existingSnapshot?.sessionAccountEmail && existingSnapshot.sessionAccountEmail !== activeEmail) {
    // Without PID info, only flag if an explicit switch happened after firstSeenAt.
    if (
      typeof accountSwitchedAt === 'number' &&
      typeof existingSnapshot.firstSeenAt === 'number' &&
      existingSnapshot.firstSeenAt < accountSwitchedAt - 2000
    ) {
      sessionAccountEmail = existingSnapshot.sessionAccountEmail;
    }
  }

  if (sessionAccountEmail && sessionAccountEmail !== activeEmail) {
    return {
      sessionAccountEmail,
      drift: {
        activeEmail,
        sessionEmail: sessionAccountEmail,
        reason: 'session_account_mismatch',
      },
    };
  }

  // Fallback drift check: process launched before the latest Keychain switch.
  if (
    agyProcess?.startedAtMs &&
    typeof accountSwitchedAt === 'number' &&
    agyProcess.startedAtMs < accountSwitchedAt - 2000
  ) {
    return {
      sessionAccountEmail: existingSnapshot?.sessionAccountEmail || null,
      drift: {
        activeEmail,
        sessionEmail: existingSnapshot?.sessionAccountEmail || null,
        reason: 'process_older_than_switch',
      },
    };
  }

  return {
    sessionAccountEmail,
    drift: null,
  };
}

/**
 * Atomically persists a lightweight per-session snapshot for panel aggregation.
 * Never throws so statusLine rendering remains non-blocking.
 */
function writeSessionSnapshot(input, options = {}) {
  const { rootDir = null, now = Date.now(), accountSwitchedAt = null } = options;
  const conversationId = String(input?.conversationId || '').trim();
  const filePath = getSnapshotPath(conversationId, rootDir);
  if (!filePath) return null;

  const existing = readSessionSnapshot(conversationId, rootDir);
  const agyProcess = input.agyProcess || null;
  const activeEmail = input.activeAccountEmail || null;

  const { sessionAccountEmail, drift } = evaluateAccountDrift({
    existingSnapshot: existing,
    agyProcess,
    activeEmail,
    accountSwitchedAt,
  });

  const payload = {
    version: SNAPSHOT_VERSION,
    conversationId,
    transcriptPath: input.transcriptPath || existing?.transcriptPath || null,
    cwd: input.cwd || existing?.cwd || null,
    currentDir: input.currentDir || existing?.currentDir || null,
    branch: input.branch || existing?.branch || null,
    modelId: input.modelId || existing?.modelId || null,
    modelDisplayName: input.modelDisplayName || existing?.modelDisplayName || null,
    planTier: input.planTier || existing?.planTier || null,
    accountEmail: activeEmail || existing?.accountEmail || null,
    sessionAccountEmail: sessionAccountEmail || existing?.sessionAccountEmail || null,
    agyPid: agyProcess?.pid || existing?.agyPid || null,
    agyStartedAtMs: agyProcess?.startedAtMs || existing?.agyStartedAtMs || null,
    accountDrift: drift,
    contextWindow: input.contextWindow || existing?.contextWindow || null,
    turnCache: input.turnCache || existing?.turnCache || null,
    sessionCache: input.sessionCache || existing?.sessionCache || null,
    speed: input.speed || existing?.speed || null,
    toolTime: input.toolTime || existing?.toolTime || null,
    costUsd: typeof input.costUsd === 'number' && Number.isFinite(input.costUsd)
      ? input.costUsd
      : (existing?.costUsd ?? null),
    steps: typeof input.steps === 'number' && Number.isFinite(input.steps)
      ? input.steps
      : (existing?.steps ?? 0),
    firstSeenAt: existing?.firstSeenAt || now,
    updatedAt: now,
  };

  const tmpPath = `${filePath}.${process.pid}.${now}.tmp`;
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
    fs.writeFileSync(tmpPath, JSON.stringify(payload, null, 2), { mode: 0o600 });
    fs.renameSync(tmpPath, filePath);
    return payload;
  } catch {
    try { fs.unlinkSync(tmpPath); } catch {}
    return payload;
  }
}

module.exports = {
  SNAPSHOT_VERSION,
  sanitizeConversationKey,
  getSessionsDir,
  getSnapshotPath,
  readSessionSnapshot,
  readAllSessionSnapshots,
  findAncestorAgyProcess,
  evaluateAccountDrift,
  writeSessionSnapshot,
};
