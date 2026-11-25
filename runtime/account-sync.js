'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { resolveAntigravityPath } = require('./paths.js');
const { readToken, isTokenExpired } = require('./quota/token.js');
const { getCachedAccountEmail, getTokenHash } = require('./quota/cache.js');
const { refreshQuotaNow } = require('./quota.js');

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const UUID_GLOBAL_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/ig;
const SKIP_FLAGS = new Set(['-p', '--print', '--acp']);
const SKIP_SUBCOMMANDS = new Set([
  'acp', 'agent', 'agents', 'changelog', 'help', 'install', 'mcp',
  'mic-serve', 'models', 'plugin', 'plugins', 'remote-control', 'update',
]);

function getAccountStatePath(rootDir = null) {
  if (rootDir) return path.join(rootDir, 'agy-hud-account-state.json');
  return resolveAntigravityPath('agy-hud-account-state.json');
}

function readAccountState(rootDir = null) {
  const filePath = getAccountStatePath(rootDir);
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!raw || typeof raw !== 'object') return null;
    return raw;
  } catch {
    return null;
  }
}

function writeAccountState(state, rootDir = null) {
  const filePath = getAccountStatePath(rootDir);
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
    fs.writeFileSync(tmpPath, JSON.stringify(state, null, 2), { mode: 0o600 });
    fs.renameSync(tmpPath, filePath);
    return true;
  } catch {
    try { fs.unlinkSync(tmpPath); } catch {}
    return false;
  }
}

/**
 * Inspects live Keychain / OAuth auth state and tracks account switches.
 */
function inspectLiveAuth(options = {}) {
  const {
    rootDir = null,
    now = Date.now(),
    platform = process.platform,
    tokenReader = readToken,
    cachedEmailReader = getCachedAccountEmail,
    persistState = true,
  } = options;

  const roots = rootDir ? [rootDir] : undefined;
  const tok = tokenReader({ platform, ...(roots ? { roots } : {}) });
  const prevState = readAccountState(rootDir);

  if (!tok) {
    return {
      loggedIn: false,
      activeEmail: null,
      expiry: null,
      expired: false,
      sourceFormat: null,
      tokenHash: null,
      accountSwitched: false,
      previousEmail: prevState?.activeEmail || null,
      switchedAt: prevState?.switchedAt || null,
      history: Array.isArray(prevState?.history) ? prevState.history : [],
    };
  }

  const activeEmail = tok.email || cachedEmailReader(tok) || null;
  const tokenHash = getTokenHash(tok);
  const expired = isTokenExpired(tok, now);
  const prevEmail = prevState?.activeEmail || null;
  const accountSwitched = Boolean(activeEmail && prevEmail && activeEmail !== prevEmail);

  let switchedAt = prevState?.switchedAt || null;
  let history = Array.isArray(prevState?.history) ? [...prevState.history] : [];

  if (persistState && activeEmail) {
    if (accountSwitched || !prevState || prevState.activeEmail !== activeEmail) {
      switchedAt = accountSwitched ? now : (prevState?.switchedAt || null);
      history.unshift({
        email: activeEmail,
        previousEmail: accountSwitched ? prevEmail : null,
        observedAt: now,
        switched: accountSwitched,
      });
      history = history.slice(0, 20);
      writeAccountState({
        version: 1,
        activeEmail,
        tokenHash,
        switchedAt,
        updatedAt: now,
        history,
      }, rootDir);
    }
  }

  return {
    loggedIn: true,
    activeEmail,
    expiry: tok.expiry || null,
    expired,
    sourceFormat: tok.sourceFormat || null,
    tokenHash,
    accountSwitched,
    previousEmail: accountSwitched ? prevEmail : (prevState?.activeEmail || null),
    switchedAt,
    history,
  };
}

function isInteractiveAgyCommand(cmd) {
  const parts = String(cmd || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return false;
  const exe = path.basename(parts[0]);
  if (exe !== 'agy' && !exe.startsWith('agy.')) return false;
  for (let i = 1; i < parts.length; i += 1) {
    if (SKIP_FLAGS.has(parts[i])) return false;
  }
  if (parts.length > 1 && SKIP_SUBCOMMANDS.has(parts[1])) return false;
  return true;
}

function parsePsInteractiveAgy(psOutput) {
  const procs = [];
  for (const rawLine of String(psOutput || '').split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    const m = line.match(/^(\d+)\s+([A-Z][a-z]{2}\s+[A-Z][a-z]{2}\s+\d+\s+\d{2}:\d{2}:\d{2}\s+\d{4})\s+(.+)$/);
    if (!m) continue;
    const pid = Number.parseInt(m[1], 10);
    const startedAtMs = Date.parse(m[2]);
    const cmd = m[3].trim();
    if (!Number.isFinite(pid) || !isInteractiveAgyCommand(cmd)) continue;
    procs.push({
      pid,
      startedAtMs: Number.isFinite(startedAtMs) ? startedAtMs : null,
      cmd,
    });
  }
  return procs;
}

function extractConversationIdsFromLogFile(logPath) {
  const ids = [];
  const scanText = (text) => {
    for (const line of text.split('\n')) {
      if (
        line.includes('Created conversation ') ||
        line.includes('found conversation ') ||
        line.includes('cascade_id:') ||
        line.includes('conversation_id:')
      ) {
        const matches = line.match(UUID_GLOBAL_RE);
        if (matches) {
          for (const cid of matches) {
            const idx = ids.indexOf(cid);
            if (idx !== -1) ids.splice(idx, 1);
            ids.push(cid);
          }
        }
      }
    }
  };
  try {
    const stat = fs.statSync(logPath);
    const FULL_READ_LIMIT = 4 * 1024 * 1024;
    if (stat.size <= FULL_READ_LIMIT) {
      scanText(fs.readFileSync(logPath, 'utf8'));
    } else {
      // Read both head (where initial Created/found conversation lives) and tail
      const chunk = 512 * 1024;
      const fd = fs.openSync(logPath, 'r');
      try {
        const headBuf = Buffer.allocUnsafe(chunk);
        fs.readSync(fd, headBuf, 0, chunk, 0);
        scanText(headBuf.toString('utf8'));
        const tailBuf = Buffer.allocUnsafe(chunk);
        fs.readSync(fd, tailBuf, 0, chunk, Math.max(0, stat.size - chunk));
        scanText(tailBuf.toString('utf8'));
      } finally {
        fs.closeSync(fd);
      }
    }
  } catch {
    // Ignore unreadable logs
  }
  return ids;
}

/**
 * Classifies whether a running interactive agy process is synced with the live
 * Keychain account or still holding a pre-switch in-memory token.
 */
function classifyProcessSync({
  pid,
  startedAtMs,
  snapshot = null,
  activeEmail = null,
  switchedAt = null,
}) {
  if (!activeEmail) {
    return { syncStatus: 'unknown', sessionAccountEmail: snapshot?.sessionAccountEmail || null, reason: 'no_active_account' };
  }

  if (snapshot && snapshot.agyPid === pid && snapshot.sessionAccountEmail) {
    if (snapshot.sessionAccountEmail !== activeEmail) {
      return {
        syncStatus: 'unsynced',
        sessionAccountEmail: snapshot.sessionAccountEmail,
        reason: 'snapshot_account_mismatch',
      };
    }
    if (typeof switchedAt === 'number' && typeof startedAtMs === 'number' && startedAtMs < switchedAt - 2000) {
      return {
        syncStatus: 'unsynced',
        sessionAccountEmail: snapshot.sessionAccountEmail,
        reason: 'started_before_account_switch',
      };
    }
    return {
      syncStatus: 'synced',
      sessionAccountEmail: snapshot.sessionAccountEmail,
      reason: 'matched_active_account',
    };
  }

  if (typeof switchedAt === 'number' && typeof startedAtMs === 'number' && startedAtMs < switchedAt - 2000) {
    return {
      syncStatus: 'unsynced',
      sessionAccountEmail: snapshot?.sessionAccountEmail || null,
      reason: 'started_before_account_switch',
    };
  }

  if (snapshot?.sessionAccountEmail && snapshot.sessionAccountEmail !== activeEmail) {
    return {
      syncStatus: 'unsynced',
      sessionAccountEmail: snapshot.sessionAccountEmail,
      reason: 'snapshot_account_mismatch',
    };
  }

  return {
    syncStatus: 'synced',
    sessionAccountEmail: snapshot?.sessionAccountEmail || activeEmail,
    reason: 'no_drift_detected',
  };
}

/**
 * Discovers running interactive agy processes and maps them to conversation IDs
 * and CWDs via a single batched `lsof` call on Unix.
 */
function detectRunningAgySessions(options = {}) {
  const {
    platform = process.platform,
    rootDir = null,
    snapshots = new Map(),
    summaries = new Map(),
    activeEmail = null,
    switchedAt = null,
    psRunner = null,
    lsofRunner = null,
  } = options;

  if (platform === 'win32') return [];

  const agyDir = rootDir || resolveAntigravityPath('');
  let psOut = '';
  try {
    psOut = psRunner
      ? psRunner()
      : execFileSync('/bin/ps', ['-axo', 'pid=,lstart=,command='], {
          encoding: 'utf8',
          timeout: 3000,
          env: { ...process.env, LC_ALL: 'C', LANG: 'C' },
          stdio: ['ignore', 'pipe', 'ignore'],
        });
  } catch {
    return [];
  }

  const procs = parsePsInteractiveAgy(psOut);
  if (procs.length === 0) return [];

  const byPidMeta = new Map();
  for (const p of procs) {
    byPidMeta.set(p.pid, { cwd: null, presenceLocks: [], openDbs: [], openLogs: [] });
  }

  try {
    const pidArg = procs.map(p => String(p.pid)).join(',');
    const lsofOut = lsofRunner
      ? lsofRunner(pidArg)
      : execFileSync('/usr/sbin/lsof', ['-nP', '-p', pidArg], {
          encoding: 'utf8',
          timeout: 4000,
          env: { ...process.env, LC_ALL: 'C', LANG: 'C' },
          stdio: ['ignore', 'pipe', 'ignore'],
        });

    for (const line of String(lsofOut || '').split('\n')) {
      const m = line.match(/^\S+\s+(\d+)\s+\S+\s+(\S+)\s+\S+\s+\S+\s+\S+\s+\S+\s+(.+)$/);
      if (!m) continue;
      const pid = Number.parseInt(m[1], 10);
      const fd = m[2];
      const name = m[3].trim();
      const meta = byPidMeta.get(pid);
      if (!meta) continue;

      if (fd === 'cwd' && name.startsWith('/')) {
        meta.cwd = name;
      } else if (name.includes('/presence/') && name.endsWith('.lock')) {
        const um = name.match(UUID_RE);
        if (um && !meta.presenceLocks.includes(um[0])) meta.presenceLocks.push(um[0]);
      } else if (name.includes('/conversations/') && name.endsWith('.db')) {
        const um = name.match(UUID_RE);
        if (um && !meta.openDbs.includes(um[0])) meta.openDbs.push(um[0]);
      } else if (name.includes('/log/cli-') && name.endsWith('.log')) {
        if (!meta.openLogs.includes(name)) meta.openLogs.push(name);
      }
    }
  } catch {
    // Proceed with cmdline-only mapping when lsof fails
  }

  return procs.map(proc => {
    const meta = byPidMeta.get(proc.pid) || { cwd: null, presenceLocks: [], openDbs: [], openLogs: [] };
    const candidates = [];
    for (const lockCid of meta.presenceLocks) {
      if (!candidates.includes(lockCid)) candidates.push(lockCid);
    }
    const mCmd = proc.cmd.match(new RegExp(`--conversation(?:=|\\s+)(${UUID_RE.source})`, 'i'));
    if (mCmd && !candidates.includes(mCmd[1])) candidates.push(mCmd[1]);
    for (const dbCid of meta.openDbs) {
      if (!candidates.includes(dbCid)) candidates.push(dbCid);
    }
    const logIds = [];
    for (const lp of meta.openLogs) {
      for (const cid of extractConversationIdsFromLogFile(lp)) {
        const idx = logIds.indexOf(cid);
        if (idx !== -1) logIds.splice(idx, 1);
        logIds.push(cid);
      }
    }
    for (let i = logIds.length - 1; i >= 0; i -= 1) {
      if (!candidates.includes(logIds[i])) candidates.push(logIds[i]);
    }

    let conversationId = null;
    for (const cid of candidates) {
      const info = summaries instanceof Map ? summaries.get(cid) : null;
      if (info && info.stepCount > 0) {
        conversationId = cid;
        break;
      }
    }
    if (!conversationId && candidates.length > 0) {
      conversationId = candidates[0];
    }

    const snapshot = conversationId && snapshots instanceof Map ? (snapshots.get(conversationId) || null) : null;
    const syncInfo = classifyProcessSync({
      pid: proc.pid,
      startedAtMs: proc.startedAtMs,
      snapshot,
      activeEmail,
      switchedAt,
    });

    // Presence locks identify the conversation(s) actively open in this window.
    // Only fall back to open .db FDs when no presence lock is held, because an
    // agy LS serving UpdateConversation/CreateConversation briefly opens other
    // conversations' .db files without attaching a window to them.
    const activeHeld = meta.presenceLocks.length > 0
      ? [...meta.presenceLocks, ...(mCmd ? [mCmd[1]] : [])]
      : [...(mCmd ? [mCmd[1]] : []), ...meta.openDbs];

    return {
      pid: proc.pid,
      startedAtMs: proc.startedAtMs,
      cmd: proc.cmd,
      cwd: meta.cwd || snapshot?.cwd || null,
      conversationId,
      openConversationIds: [...new Set(activeHeld)],
      syncStatus: syncInfo.syncStatus,
      sessionAccountEmail: syncInfo.sessionAccountEmail,
      syncReason: syncInfo.reason,
    };
  });
}

function resolveSyncScriptPath(options = {}) {
  const candidate = options.scriptPath || process.env.AGY_SYNC_SCRIPT || path.join(os.homedir(), 'tool-scripts', 'agy', 'agy-sync-keychain.sh');
  return candidate;
}

function parseSyncDryRunOutput(rawOutput) {
  const lines = String(rawOutput || '').split('\n');
  const result = {
    keychain: null,
    reopen: [],
    replace: [],
    close: [],
    skipped: [],
    self: null,
    otherPidCount: 0,
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('Keychain:')) {
      const m = trimmed.match(/present=(\S+)\s+email=(\S+)\s+expiry=(\S+)\s+expired=(\S+)/);
      if (m) {
        result.keychain = {
          present: m[1] === 'True' || m[1] === 'true',
          email: m[2] === 'unknown' ? null : m[2],
          expiry: m[3] === 'unknown' ? null : m[3],
          expired: m[4] === 'True' || m[4] === 'true',
        };
      }
    } else if (trimmed.startsWith('Other interactive agy PIDs')) {
      const m = trimmed.match(/\((\d+)\)/);
      if (m) result.otherPidCount = Number.parseInt(m[1], 10);
    } else if (trimmed.startsWith('[replace]')) {
      const m = trimmed.match(/pid=(\d+)\s+session=(\S+)\s+conv=(\S+)\s+steps=(\d+)\s+title=(.*?)\s+cwd=(.+)$/);
      if (m) {
        result.replace.push({
          pid: Number.parseInt(m[1], 10),
          sessionId: m[2],
          conversationId: m[3],
          steps: Number.parseInt(m[4], 10),
          title: m[5].replace(/^['"]|['"]$/g, ''),
          cwd: m[6],
        });
      }
    } else if (trimmed.startsWith('[close]')) {
      const m = trimmed.match(/pid=(\d+)\s+session=(\S+)\s+conv=(\S+)\s+\((.+)\)$/);
      if (m) {
        result.close.push({
          pid: Number.parseInt(m[1], 10),
          sessionId: m[2],
          conversationId: m[3] === 'None' ? null : m[3],
          reason: m[4],
        });
      }
    } else if (trimmed.startsWith('[reopen]')) {
      const m = trimmed.match(/pid=(\d+)\s+conv=(\S+)\s+steps=(\d+)\s+title=(.*?)\s+cwd=(.+)$/);
      if (m) {
        result.reopen.push({
          pid: Number.parseInt(m[1], 10),
          conversationId: m[2],
          steps: Number.parseInt(m[3], 10),
          title: m[4].replace(/^['"]|['"]$/g, ''),
          cwd: m[5],
        });
      }
    } else if (trimmed.startsWith('[skip]')) {
      const m = trimmed.match(/pid=(\d+)\s+conv=(\S+)\s+\((.+)\)$/);
      if (m) {
        result.skipped.push({
          pid: Number.parseInt(m[1], 10),
          conversationId: m[2] === 'None' ? null : m[2],
          reason: m[3],
        });
      }
    } else if (trimmed.startsWith('[self]')) {
      const m = trimmed.match(/pid=(\d+)\s+conv=(\S+)\s+title=(.*?)\s+\(/);
      if (m) {
        result.self = {
          pid: Number.parseInt(m[1], 10),
          conversationId: m[2] === 'None' ? null : m[2],
          title: m[3].replace(/^['"]|['"]$/g, ''),
        };
      }
    }
  }
  return result;
}

function previewAccountSync(options = {}) {
  const scriptPath = resolveSyncScriptPath(options);
  if (!fs.existsSync(scriptPath)) {
    return {
      available: false,
      scriptPath,
      error: `Sync helper script not found: ${scriptPath}`,
      plan: null,
      rawOutput: '',
    };
  }
  try {
    const stdout = execFileSync('/bin/zsh', [scriptPath, '--dry-run'], {
      encoding: 'utf8',
      timeout: 15_000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return {
      available: true,
      scriptPath,
      error: null,
      plan: parseSyncDryRunOutput(stdout),
      rawOutput: stdout.trim(),
    };
  } catch (err) {
    const combined = `${err.stdout || ''}\n${err.stderr || ''}`.trim();
    return {
      available: true,
      scriptPath,
      error: (err.stderr || err.message || 'Dry-run failed').toString().trim(),
      plan: parseSyncDryRunOutput(combined),
      rawOutput: combined,
    };
  }
}

function parseSyncQuotaReceipt(rawOutput) {
  const m = String(rawOutput || '').match(/^Quota sync:\s*([a-z_]+)(?:\s*\(([^)]*)\))?/m);
  if (!m) return null;
  return {
    status: m[1],
    detail: m[2] ? m[2].trim() : null,
  };
}

async function executeAccountSync(options = {}) {
  if (options.confirm !== true) {
    return {
      ok: false,
      error: 'Explicit confirmation (confirm: true) is required before restarting agy sessions.',
      output: '',
    };
  }

  const scriptPath = resolveSyncScriptPath(options);
  if (!fs.existsSync(scriptPath)) {
    return {
      ok: false,
      error: `Sync helper script not found: ${scriptPath}`,
      output: '',
    };
  }

  try {
    const stdout = execFileSync('/bin/zsh', [scriptPath], {
      encoding: 'utf8',
      timeout: 35_000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    // Single post-Sync refresh invariant: if agy-sync-keychain.sh emitted an explicit
    // `Quota sync: <status>` receipt (other than `skipped`), it already executed or
    // intentionally fenced the single refresh attempt — never double-fire another one.
    const quotaReceipt = parseSyncQuotaReceipt(stdout);
    let refreshed = null;
    if (!quotaReceipt || quotaReceipt.status === 'skipped') {
      try {
        const liveAuth = inspectLiveAuth({ rootDir: options.rootDir, persistState: false });
        if (liveAuth.loggedIn && !liveAuth.expired) {
          const runRefresh = options.quotaRefresher || ((opts) => refreshQuotaNow(opts));
          refreshed = await runRefresh({
            roots: options.rootDir ? [options.rootDir] : undefined,
            expectedEmail: liveAuth.activeEmail || null,
          }).catch(() => null);
        }
      } catch {
        refreshed = null;
      }
    }
    return {
      ok: true,
      error: null,
      output: stdout.trim(),
      quotaSyncStatus: quotaReceipt ? quotaReceipt.status : (refreshed?.ok ? 'refreshed' : 'fallback_attempted'),
      quotaSyncDetail: quotaReceipt?.detail || null,
      refreshedQuota: refreshed,
    };
  } catch (err) {
    const combined = `${err.stdout || ''}\n${err.stderr || ''}`.trim();
    return {
      ok: false,
      error: (err.stderr || err.message || 'Account sync execution failed').toString().trim(),
      output: combined,
    };
  }
}

module.exports = {
  getAccountStatePath,
  readAccountState,
  writeAccountState,
  inspectLiveAuth,
  isInteractiveAgyCommand,
  parsePsInteractiveAgy,
  extractConversationIdsFromLogFile,
  classifyProcessSync,
  detectRunningAgySessions,
  resolveSyncScriptPath,
  parseSyncDryRunOutput,
  parseSyncQuotaReceipt,
  previewAccountSync,
  executeAccountSync,
};
