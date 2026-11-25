'use strict';

const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { resolveAntigravityPath } = require('./paths.js');
const { refreshQuotaNow } = require('./quota.js');
const { buildPanelOverview, getSessionDetail, renameConversationTitle, collectAllSessions } = require('./panel-data.js');
const { inspectLiveAuth, detectRunningAgySessions, previewAccountSync, executeAccountSync } = require('./account-sync.js');
const {
  getVaultStatus,
  readVaultMeta,
  saveCurrentAccount,
  switchSavedAccount,
  refreshExpiredActiveAccount,
  removeSavedAccount,
  prepareSignInNewAccount,
} = require('./account-vault.js');
const { getLiveEndpoints, describeOps, setConversationsArchived, deleteConversations } = require('./conversation-ops.js');
const { renderPanelHtml, renderPairingHtml } = require('./panel-ui.js');

const DEFAULT_HOST = '127.0.0.1';
const LAN_HOST = '0.0.0.0';
const DEFAULT_PORT = 18721;
const DEBOUNCE_MS = 900;
const MIN_BROADCAST_INTERVAL_MS = 1800;
const AUTH_POLL_INTERVAL_MS = 6000;
const RUNNING_CACHE_TTL_MS = 3000;
const VAULT_CACHE_TTL_MS = 2500;
const OVERVIEW_CACHE_TTL_MS = 2000;
const SSE_HEARTBEAT_MS = 20000;
const QUOTA_AUTO_REFRESH_MS = 3 * 60 * 1000;
const SESSION_COOKIE = 'agy_check_session';
const DEVICE_ACCESS_MS = 30 * 24 * 60 * 60 * 1000;
const PAIRING_CODE_TTL_MS = 10 * 60 * 1000;
const PAIRING_MAX_ATTEMPTS = 5;
const MAX_PAIRED_DEVICES = 20;

function getPanelPidPath(rootDir = null) {
  const baseDir = rootDir || resolveAntigravityPath('');
  return path.join(baseDir, 'agy-hud-panel.pid');
}

function getPanelLanSettingsPath(rootDir = null) {
  return path.join(rootDir || resolveAntigravityPath(''), 'agy-hud-panel-lan.json');
}

function parseIpv4(address) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(String(address || '').replace(/^::ffff:/, ''));
  if (!m) return null;
  const octets = m.slice(1).map(Number);
  if (octets.some(o => o > 255)) return null;
  return ((octets[0] << 24) >>> 0) + (octets[1] << 16) + (octets[2] << 8) + octets[3];
}

function parseCidr(cidr) {
  const [ip, bitsRaw] = String(cidr || '').trim().split('/');
  const base = parseIpv4(ip);
  const bits = bitsRaw === undefined ? 32 : Number(bitsRaw);
  if (base === null || !Number.isInteger(bits) || bits < 0 || bits > 32) return null;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return { base: (base & mask) >>> 0, mask };
}

function hashDeviceToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

// LAN settings: extra networks to serve, and paired devices (sha256 of each 30-day session cookie).
function readLanSettings(rootDir = null, now = Date.now()) {
  try {
    const raw = JSON.parse(fs.readFileSync(getPanelLanSettingsPath(rootDir), 'utf8'));
    return {
      networks: Array.isArray(raw.networks) ? raw.networks.filter(n => parseCidr(n)) : [],
      devices: Array.isArray(raw.devices)
        ? raw.devices.filter(d => d && typeof d.hash === 'string' && typeof d.expiresAt === 'number' && d.expiresAt > now)
        : [],
    };
  } catch {
    return { networks: [], devices: [] };
  }
}

function writeLanSettings(rootDir, settings) {
  const settingsPath = getPanelLanSettingsPath(rootDir);
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true, mode: 0o700 });
  fs.writeFileSync(settingsPath, JSON.stringify(settings), { mode: 0o600 });
  fs.chmodSync(settingsPath, 0o600);
}

/**
 * Saves extra networks (IPv4 CIDRs, e.g. a VPN overlay) that phones may use besides Wi-Fi/Ethernet.
 * Returns the saved list, or throws on an invalid entry. An empty list keeps Wi-Fi/Ethernet only.
 */
function setLanNetworks(rootDir, networks) {
  const list = networks.map(n => String(n).trim()).filter(Boolean);
  const invalid = list.find(n => !parseCidr(n));
  if (invalid) throw new Error(`Invalid network "${invalid}" (expected IPv4 CIDR such as 10.0.0.0/24)`);
  writeLanSettings(rootDir, { ...readLanSettings(rootDir), networks: list });
  return list;
}

// Addresses served to other devices: physical Wi-Fi/Ethernet (en* on macOS, eth/wlan on Linux)
// plus addresses inside the saved networks. VM bridges and other tunnels are neither listed nor answered.
function getLanAddresses(networks = [], interfaces = os.networkInterfaces()) {
  const nets = networks.map(parseCidr).filter(Boolean);
  const entries = [];
  for (const [name, list] of Object.entries(interfaces)) {
    for (const ni of list || []) {
      if (!(ni.family === 'IPv4' || ni.family === 4) || ni.internal) continue;
      const physical = /^(en\d|eth|wlan|wl)/.test(name);
      const ip = parseIpv4(ni.address);
      const listed = ip !== null && nets.some(n => ((ip & n.mask) >>> 0) === n.base);
      if (physical || listed) entries.push({ address: ni.address, rank: physical ? 0 : 1 });
    }
  }
  return entries.sort((a, b) => a.rank - b.rank).map(e => e.address);
}

function getLanUrls(port, networks = []) {
  return getLanAddresses(networks).map(a => `http://${a}:${port}/`);
}

function postLocal(port, pathname) {
  return new Promise((resolve) => {
    const req = http.request({ host: DEFAULT_HOST, port, path: pathname, method: 'POST', timeout: 2000 }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch {
          resolve(null);
        }
      });
    });
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
    req.on('error', () => resolve(null));
    req.end();
  });
}

// Asks the running LAN panel for a one-time pairing code (valid 10 minutes).
function requestPairingCode(port = DEFAULT_PORT) {
  return postLocal(port, '/api/pair/code');
}

// Signs out every paired device.
function revokePairedDevices(port = DEFAULT_PORT) {
  return postLocal(port, '/api/pair/revoke');
}

function readPanelPidRecord(rootDir = null) {
  const pidPath = getPanelPidPath(rootDir);
  try {
    const raw = JSON.parse(fs.readFileSync(pidPath, 'utf8'));
    if (raw && Number.isInteger(raw.pid) && raw.pid > 0) return raw;
  } catch {}
  return null;
}

function writePanelPidRecord(record, rootDir = null) {
  const pidPath = getPanelPidPath(rootDir);
  try {
    fs.mkdirSync(path.dirname(pidPath), { recursive: true, mode: 0o700 });
    fs.writeFileSync(pidPath, JSON.stringify(record), { mode: 0o600 });
  } catch {}
}

function removePanelPidRecord(expectedPid = null, rootDir = null) {
  const pidPath = getPanelPidPath(rootDir);
  try {
    if (expectedPid !== null) {
      const existing = readPanelPidRecord(rootDir);
      if (existing && existing.pid !== expectedPid) return;
    }
    if (fs.existsSync(pidPath)) fs.unlinkSync(pidPath);
  } catch {}
}

function checkPanelHealth(port = DEFAULT_PORT, timeoutMs = 450) {
  return new Promise(resolve => {
    const req = http.get({
      host: DEFAULT_HOST,
      port,
      path: '/api/health',
      timeout: timeoutMs,
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        if (res.statusCode !== 200) return resolve({ healthy: false, data: null });
        try {
          const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          resolve({ healthy: Boolean(parsed && parsed.ok === true), data: parsed });
        } catch {
          resolve({ healthy: false, data: null });
        }
      });
    });
    req.on('timeout', () => {
      req.destroy();
      resolve({ healthy: false, data: null });
    });
    req.on('error', () => resolve({ healthy: false, data: null }));
  });
}

async function ensurePanelRunning(options = {}) {
  const port = Number.isInteger(options.port) ? options.port : DEFAULT_PORT;
  const rootDir = options.rootDir || resolveAntigravityPath('');
  const url = `http://${DEFAULT_HOST}:${port}`;
  const cliScriptPath = options.cliScriptPath || path.join(__dirname, 'bin', 'agy-check.js');
  const wantLan = options.lan === true;
  const withLanUrls = (lan) => (lan ? getLanUrls(port, readLanSettings(rootDir).networks) : []);

  const initial = await checkPanelHealth(port, 400);
  // A running local-only panel, or changed networks, needs a LAN restart.
  const needsRestart = initial.healthy && wantLan && (!initial.data?.lan || options.restart === true);
  if (initial.healthy && !needsRestart) {
    const rec = readPanelPidRecord(rootDir);
    const lan = Boolean(initial.data?.lan);
    return { ok: true, alreadyRunning: true, pid: rec?.pid || null, port, url, lan, lanUrls: withLanUrls(lan) };
  }
  if (needsRestart) {
    await stopPanelDaemon({ rootDir });
  }

  const cliArgs = [cliScriptPath, 'panel', '--port', String(port)];
  if (wantLan) cliArgs.push('--lan');

  let child;
  try {
    child = spawn(process.execPath, cliArgs, {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      env: { ...process.env, ...(options.rootDir ? { AGY_HUD_DATA_DIR: options.rootDir } : {}) },
    });
    child.unref();
  } catch (err) {
    return { ok: false, alreadyRunning: false, pid: null, port, url, lan: false, lanUrls: [], error: err.message };
  }

  const deadline = Date.now() + (options.waitMs || 3000);
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 70));
    const probe = await checkPanelHealth(port, 300);
    if (probe.healthy) {
      const lan = Boolean(probe.data?.lan);
      return { ok: true, alreadyRunning: false, pid: child.pid || null, port, url, lan, lanUrls: withLanUrls(lan) };
    }
  }

  return { ok: false, alreadyRunning: false, pid: child.pid || null, port, url, lan: false, lanUrls: [], error: 'Timed out waiting for panel server to become healthy' };
}

async function stopPanelDaemon(options = {}) {
  const rootDir = options.rootDir || resolveAntigravityPath('');
  const rec = readPanelPidRecord(rootDir);
  if (!rec || !rec.pid) {
    return { stopped: false, pid: null, reason: 'not_running' };
  }
  try {
    process.kill(rec.pid, 'SIGTERM');
  } catch (err) {
    removePanelPidRecord(rec.pid, rootDir);
    return { stopped: false, pid: rec.pid, reason: err.code === 'ESRCH' ? 'stale_pid_cleaned' : err.message };
  }

  const deadline = Date.now() + 1500;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 60));
    try {
      process.kill(rec.pid, 0);
    } catch {
      removePanelPidRecord(rec.pid, rootDir);
      return { stopped: true, pid: rec.pid, port: rec.port || null, reason: 'stopped' };
    }
  }
  removePanelPidRecord(rec.pid, rootDir);
  return { stopped: true, pid: rec.pid, port: rec.port || null, reason: 'signal_sent' };
}

function isLoopbackHost(headerVal) {
  if (!headerVal || typeof headerVal !== 'string') return false;
  const trimmed = headerVal.trim().toLowerCase();
  return (
    trimmed.startsWith('127.0.0.1') ||
    trimmed.startsWith('localhost') ||
    trimmed.startsWith('[::1]')
  );
}

function isLoopbackAddress(addr) {
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
}

function describeDevice(userAgent) {
  const ua = String(userAgent || '');
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Android/.test(ua)) return 'Android';
  return 'Browser';
}

// "Local" means the request really comes from this machine and names a loopback host
// (the Host check also blocks DNS-rebinding pages).
function isLocalClient(req) {
  return isLoopbackAddress(req.socket?.remoteAddress) && isLoopbackHost(req.headers.host);
}

function hasForwardedProxyHeaders(req) {
  const h = req && req.headers ? req.headers : {};
  return Boolean(
    h['x-forwarded-for'] ||
    h['x-forwarded-host'] ||
    h['x-forwarded-proto'] ||
    h['forwarded'] ||
    h['cf-connecting-ip'] ||
    h['x-real-ip']
  );
}

// Strict loopback-only check for sensitive host capabilities (account vault & credential switching):
// excludes proxied/tunneled loopback traffic and paired-phone cookies.
function isTrustedLocalClient(req) {
  return isLocalClient(req) && !hasForwardedProxyHeaders(req) && !readCookie(req, SESSION_COOKIE);
}

function isSameOriginLocalRequest(req) {
  if (!isLocalClient(req)) return false;
  const origin = req.headers.origin;
  if (origin) {
    try {
      const parsed = new URL(origin);
      if (parsed.hostname !== '127.0.0.1' && parsed.hostname !== 'localhost' && parsed.hostname !== '::1') {
        return false;
      }
      if (req.headers.host && parsed.host.toLowerCase() !== String(req.headers.host).trim().toLowerCase()) {
        return false;
      }
    } catch {
      return false;
    }
  }
  return true;
}

// Remote (LAN) writes must come from the panel page itself: browsers always send Origin on POST.
function isSameOriginRemoteRequest(req) {
  const origin = req.headers.origin;
  if (!origin) return false;
  try {
    return new URL(origin).host === String(req.headers.host || '').toLowerCase();
  } catch {
    return false;
  }
}

function readCookie(req, name) {
  for (const part of String(req.headers.cookie || '').split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) {
      try {
        return decodeURIComponent(rest.join('='));
      } catch {
        return null;
      }
    }
  }
  return null;
}

function tokensMatch(candidate, token) {
  if (!candidate || !token) return false;
  const a = Buffer.from(String(candidate));
  const b = Buffer.from(token);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function readJsonBody(req, maxBytes = 64 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', chunk => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new Error('Request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('Invalid JSON payload'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function computeOverviewDigest(overview) {
  const stripped = {
    auth: overview.auth,
    quota: {
      tier: overview.quota?.tier,
      lastRefreshed: overview.quota?.lastRefreshed,
      providers: overview.quota?.providers,
      unavailableReason: overview.quota?.unavailableReason,
    },
    summary: overview.summary,
    sessions: (overview.sessions || []).map(s => ({
      id: s.conversationId,
      title: s.title || '',
      status: s.status,
      sync: s.syncStatus,
      pid: s.pid,
      turns: s.turnsCount,
      steps: s.steps,
      hit: s.sessionHitRate,
      lastHit: s.lastTurnHitRate,
      prompt: s.totalPrompt,
      out: s.totalOutput,
      outSpd: s.speed?.totalSpeed ?? null,
      netSpd: s.speed?.visibleSpeed ?? null,
      toolMs: s.toolDurationMs ?? null,
      upd: s.lastActivityMs,
      arch: Boolean(s.archived),
    })),
    ops: overview.ops ? { del: Boolean(overview.ops.deleteAvailable), n: overview.ops.endpointCount || 0 } : null,
    vault: overview.vault
      ? {
          activeEmail: overview.vault.activeEmail || null,
          activeSaved: Boolean(overview.vault.activeSaved),
          accounts: (overview.vault.accounts || []).map(a => `${a.email}:${a.status}:${a.updatedAt || 0}:${a.lastSwitchedAt || 0}`),
        }
      : null,
  };
  return crypto.createHash('sha1').update(JSON.stringify(stripped)).digest('hex');
}

function createPanelServer(options = {}) {
  const rootDir = options.rootDir || resolveAntigravityPath('');
  const lan = options.lan === true;
  const host = lan ? LAN_HOST : DEFAULT_HOST;
  const port = Number.isInteger(options.port) ? options.port : DEFAULT_PORT;
  const lanNetworks = lan ? readLanSettings(rootDir).networks : [];
  // Paired devices hold a random 30-day session cookie; only its sha256 is kept, on disk, so restarts keep them signed in.
  let devices = lan ? readLanSettings(rootDir).devices : [];
  let pairing = null; // { code, expiresAt, attempts }
  const saveDevices = () => writeLanSettings(rootDir, { ...readLanSettings(rootDir), devices });
  const activeDevices = () => devices.filter(d => d.expiresAt > Date.now());
  const findDevice = (token) => {
    if (!token) return null;
    const hash = Buffer.from(hashDeviceToken(token));
    return activeDevices().find(d => {
      const stored = Buffer.from(d.hash);
      return stored.length === hash.length && crypto.timingSafeEqual(stored, hash);
    }) || null;
  };
  const issuePairingCode = () => {
    pairing = {
      code: String(crypto.randomInt(0, 1_000_000)).padStart(6, '0'),
      expiresAt: Date.now() + PAIRING_CODE_TTL_MS,
      attempts: 0,
    };
    return pairing;
  };
  const redeemPairingCode = (code, agent) => {
    if (!pairing || pairing.expiresAt <= Date.now()) {
      pairing = null;
      return { error: 'No active pairing code. Get one on the Mac with /check lan.' };
    }
    pairing.attempts += 1;
    if (!tokensMatch(String(code || '').trim(), pairing.code)) {
      if (pairing.attempts >= PAIRING_MAX_ATTEMPTS) {
        pairing = null;
        return { error: 'Too many wrong codes. Get a new one on the Mac with /check lan.' };
      }
      return { error: 'Wrong code.' };
    }
    pairing = null;
    const token = crypto.randomBytes(32).toString('base64url');
    const now = Date.now();
    devices = [...activeDevices(), { hash: hashDeviceToken(token), agent, pairedAt: now, expiresAt: now + DEVICE_ACCESS_MS }]
      .slice(-MAX_PAIRED_DEVICES);
    saveDevices();
    return { token, expiresAt: now + DEVICE_ACCESS_MS };
  };
  const listeningPort = () => {
    const addr = server.address();
    return typeof addr === 'object' && addr ? addr.port : port;
  };
  const transcriptCache = new Map();
  const summaryCache = {};
  const annotationsCache = {};
  const sseClients = new Set();
  const watchers = [];
  let debounceTimer = null;
  let throttleTimer = null;
  let lastBroadcastAt = 0;
  let pollTimer = null;
  let heartbeatTimer = null;
  let lastDigest = null;
  let lastSeenAccountKey = null;
  let quotaRefreshing = false;
  let lastQuotaAutoAttemptAt = 0;
  let pendingExpiredRefresh = null;
  let syncInProgress = false;
  const pollIntervalMs = Number.isInteger(options.pollIntervalMs) && options.pollIntervalMs > 0
    ? options.pollIntervalMs
    : AUTH_POLL_INTERVAL_MS;
  const heartbeatMs = Number.isInteger(options.heartbeatIntervalMs) && options.heartbeatIntervalMs > 0
    ? options.heartbeatIntervalMs
    : SSE_HEARTBEAT_MS;
  const quotaAutoRefreshMs = Number.isInteger(options.quotaAutoRefreshMs)
    ? options.quotaAutoRefreshMs
    : QUOTA_AUTO_REFRESH_MS;
  const quotaAutoEnabled = quotaAutoRefreshMs > 0 && (!options.dataOptions?.quotaFetcher || Boolean(options.quotaRefresher));
  const runQuotaRefresh = () => (options.quotaRefresher ? options.quotaRefresher() : refreshQuotaNow({ roots: [rootDir] }));

  // Short-TTL caches to eliminate redundant synchronous `lsof` / `ps` / `security` subprocess
  // stalls across watcher broadcasts and immediate browser `/api/overview` refetches.
  let runningCache = { at: 0, list: null };
  let vaultStatusCache = { at: 0, status: null };
  let overviewResponseCache = new Map();
  const invalidateLiveCaches = ({ running = false, vault = false, endpoints = false } = {}) => {
    overviewResponseCache.clear();
    if (running) runningCache.at = 0;
    if (vault) vaultStatusCache.at = 0;
    if (endpoints) endpointsCache.at = 0;
  };
  const getCachedRunningSessions = (auth) => {
    if (Array.isArray(options.dataOptions?.runningSessions)) {
      return options.dataOptions.runningSessions;
    }
    const now = Date.now();
    if (runningCache.list && now - runningCache.at < RUNNING_CACHE_TTL_MS) {
      return runningCache.list;
    }
    const list = detectRunningAgySessions({
      rootDir,
      activeEmail: auth?.activeEmail || null,
      switchedAt: auth?.switchedAt || null,
    });
    runningCache = { at: now, list };
    return list;
  };
  const getCachedVaultStatus = (liveEmailHint = null) => {
    if (typeof options.vaultStatusProvider === 'function') {
      return options.vaultStatusProvider();
    }
    const now = Date.now();
    if (vaultStatusCache.status && now - vaultStatusCache.at < VAULT_CACHE_TTL_MS) {
      return vaultStatusCache.status;
    }
    const st = getVaultStatus({
      rootDir,
      liveEmailHint,
      ...(options.vaultOptions || {}),
    });
    vaultStatusCache = { at: now, status: st };
    return st;
  };

  const dataOpts = {
    rootDir,
    transcriptCache,
    summaryCache,
    annotationsCache,
    ...(options.dataOptions || {}),
  };

  // agy API endpoints (daemon env + `agy-check panel handoff`). Tokens never leave this process.
  const endpointsProvider = typeof options.endpointsProvider === 'function'
    ? options.endpointsProvider
    : (options.lsEndpoint === false ? () => [] : () => getLiveEndpoints({ rootDir }));
  let endpointsCache = { at: 0, list: [] };
  const liveEndpoints = (maxAgeMs = 0) => {
    if (maxAgeMs > 0 && Date.now() - endpointsCache.at < maxAgeMs) return endpointsCache.list;
    let list = [];
    try { list = endpointsProvider() || []; } catch { list = []; }
    endpointsCache = { at: Date.now(), list };
    return list;
  };

  async function maybeCheckAuthSwitchAndBroadcast(forceBroadcast = false) {
    if (sseClients.size === 0 && !forceBroadcast) return;

    try {
      const auth = inspectLiveAuth({
        rootDir,
        ...(options.authOptions || {}),
      });
      const acctKey = `${auth.activeEmail || ''}:${auth.tokenHash || ''}`;
      if (lastSeenAccountKey !== null && acctKey !== lastSeenAccountKey && auth.loggedIn && !auth.expired && !quotaRefreshing) {
        quotaRefreshing = true;
        lastQuotaAutoAttemptAt = Date.now();
        runQuotaRefresh()
          .catch(() => null)
          .finally(() => {
            quotaRefreshing = false;
            scheduleBroadcast(true);
          });
      }
      lastSeenAccountKey = acctKey;

      const runningNow = getCachedRunningSessions(auth);
      const overview = await buildPanelOverview({ ...dataOpts, runningSessions: runningNow, range: 'all', includeArchived: true });
      overview.ops = describeOps(liveEndpoints(5000));
      try {
        overview.vault = getCachedVaultStatus(overview.auth?.activeEmail || null);
      } catch {}

      // Gently refresh cloud quota in the background while at least one browser is connected.
      if (sseClients.size > 0 && quotaAutoEnabled && auth.loggedIn && !auth.expired && !quotaRefreshing) {
        const now = Date.now();
        const quotaAge = overview.quota?.lastRefreshed ? (now - overview.quota.lastRefreshed) : Infinity;
        if (quotaAge >= quotaAutoRefreshMs && now - lastQuotaAutoAttemptAt >= quotaAutoRefreshMs) {
          quotaRefreshing = true;
          lastQuotaAutoAttemptAt = now;
          runQuotaRefresh()
            .catch(() => null)
            .finally(() => {
              quotaRefreshing = false;
              scheduleBroadcast(true);
            });
        }
      }

      const digest = computeOverviewDigest(overview);
      if (!forceBroadcast && digest === lastDigest) return;
      lastDigest = digest;
      lastBroadcastAt = Date.now();
      overviewResponseCache.clear();

      const payload = `event: changed\ndata: ${JSON.stringify({ digest, ts: Date.now() })}\n\n`;
      for (const client of sseClients) {
        try {
          client.write(payload);
        } catch {
          sseClients.delete(client);
        }
      }
    } catch {
      // Keep watcher loop resilient
    }
  }

  function scheduleBroadcast(force = false) {
    if (force) {
      invalidateLiveCaches({ running: true, vault: true, endpoints: true });
    }
    if (sseClients.size === 0) return;
    if (force) {
      if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }
      if (throttleTimer) { clearTimeout(throttleTimer); throttleTimer = null; }
      maybeCheckAuthSwitchAndBroadcast(true);
      return;
    }
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      const since = Date.now() - lastBroadcastAt;
      if (since < MIN_BROADCAST_INTERVAL_MS) {
        if (!throttleTimer) {
          throttleTimer = setTimeout(() => {
            throttleTimer = null;
            maybeCheckAuthSwitchAndBroadcast(false);
          }, MIN_BROADCAST_INTERVAL_MS - since);
        }
        return;
      }
      maybeCheckAuthSwitchAndBroadcast(false);
    }, DEBOUNCE_MS);
  }

  function startWatchers() {
    if (watchers.length > 0) return;
    const watchTargets = [
      rootDir,
      path.join(rootDir, 'sessions'),
      path.join(rootDir, 'speed-cache'),
      path.join(rootDir, 'annotations'),
      path.join(rootDir, 'conversations'),
      path.join(rootDir, 'presence'),
    ];
    for (const target of watchTargets) {
      try {
        if (!fs.existsSync(target)) continue;
        const w = fs.watch(target, { persistent: false }, (_eventType, filename) => {
          const fname = filename ? String(filename) : '';
          if (fname.includes('.tmp.') || fname.endsWith('.lock') && target === rootDir) return;
          if (fname === 'agy-hud-account-state.json' || fname === 'agy-hud-panel.pid') return;
          overviewResponseCache.clear();
          if (target === rootDir) {
            endpointsCache.at = 0;
            if (fname.includes('vault')) vaultStatusCache.at = 0;
          }
          if (target.endsWith('presence') || target.endsWith('conversations')) {
            runningCache.at = 0;
          }
          scheduleBroadcast(false);
        });
        w.on('error', () => {});
        watchers.push(w);
      } catch {
        // Directory may not exist yet
      }
    }
    if (!pollTimer) {
      pollTimer = setInterval(() => {
        if (sseClients.size > 0) {
          maybeCheckAuthSwitchAndBroadcast(false);
        }
      }, pollIntervalMs);
      if (typeof pollTimer.unref === 'function') pollTimer.unref();
    }
    if (!heartbeatTimer) {
      heartbeatTimer = setInterval(() => {
        if (sseClients.size === 0) return;
        const ping = `event: ping\ndata: ${JSON.stringify({ ts: Date.now() })}\n\n`;
        for (const client of sseClients) {
          try {
            client.write(ping);
          } catch {
            sseClients.delete(client);
          }
        }
      }, heartbeatMs);
      if (typeof heartbeatTimer.unref === 'function') heartbeatTimer.unref();
    }
  }

  function stopWatchers() {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    if (throttleTimer) {
      clearTimeout(throttleTimer);
      throttleTimer = null;
    }
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
    while (watchers.length > 0) {
      const w = watchers.pop();
      try { w.close(); } catch {}
    }
  }

  const html = renderPanelHtml();
  const uiHash = crypto.createHash('sha1').update(html).digest('hex').slice(0, 12);
  const pairingHtml = renderPairingHtml();
  // Per-server-boot capability token injected ONLY into HTML served to trusted local clients.
  // Never sent to LAN/TUN paired devices or reverse-proxied requests.
  const localVaultToken = crypto.randomBytes(24).toString('base64url');
  const localHtml = html.replace('</head>', `  <meta name="agy-local-token" content="${localVaultToken}">\n</head>`);
  const vaultOpts = options.vaultOptions || {};
  const isAuthorizedVaultWrite = (req) => {
    if (!isTrustedLocalClient(req) || !isSameOriginLocalRequest(req)) return false;
    if (!req.headers.origin) return false;
    return tokensMatch(req.headers['x-agy-local-token'], localVaultToken);
  };

  const server = http.createServer(async (req, res) => {
    const reqUrl = new URL(req.url || '/', `http://${DEFAULT_HOST}:${port}`);
    const pathname = reqUrl.pathname;
    const local = isLocalClient(req);

    // Other devices are answered only on Wi-Fi/Ethernet or a saved network, never on VM bridges or other tunnels.
    const localAddress = String(req.socket?.localAddress || '').replace(/^::ffff:/, '');
    if (!local && !isLoopbackAddress(localAddress) && !getLanAddresses(lanNetworks).includes(localAddress)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end('agy-check: not served on this network.\n');
      return;
    }

    // Unpaired devices only get the pairing page and the code exchange.
    const device = local ? null : findDevice(readCookie(req, SESSION_COOKIE));
    if (!local && !device) {
      if (req.method === 'GET' && pathname === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(pairingHtml);
        return;
      }
      if (req.method === 'POST' && pathname === '/api/pair') {
        if (!isSameOriginRemoteRequest(req)) {
          sendJson(res, 403, { error: 'Forbidden origin' });
          return;
        }
        let body = null;
        try {
          body = await readJsonBody(req, 1024);
        } catch {
          body = null;
        }
        const result = redeemPairingCode(body?.code, describeDevice(req.headers['user-agent']));
        if (result.error) {
          sendJson(res, 400, { ok: false, error: result.error });
          return;
        }
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
          'Set-Cookie': `${SESSION_COOKIE}=${result.token}; Path=/; Max-Age=${DEVICE_ACCESS_MS / 1000}; HttpOnly; SameSite=Strict`,
        });
        res.end(JSON.stringify({ ok: true, expiresAt: result.expiresAt }));
        return;
      }
      sendJson(res, 401, { error: 'This device is not paired. Open the panel address and enter the code from /check lan.' });
      return;
    }

    try {
      if (req.method === 'POST' && (pathname === '/api/pair/code' || pathname === '/api/pair/revoke')) {
        if (!local || !isSameOriginLocalRequest(req)) {
          sendJson(res, 403, { error: 'Pairing is managed on the machine running agy' });
          return;
        }
        if (!lan) {
          sendJson(res, 409, { error: 'Phone access is off. Start it with /check lan.' });
          return;
        }
        if (pathname === '/api/pair/code') {
          const p = issuePairingCode();
          sendJson(res, 200, { code: p.code, expiresAt: p.expiresAt, devices: activeDevices().length, urls: getLanUrls(listeningPort(), lanNetworks) });
          return;
        }
        devices = [];
        pairing = null;
        saveDevices();
        for (const client of sseClients) {
          if (client.agyRemote) {
            try { client.end(); } catch {}
          }
        }
        sendJson(res, 200, { ok: true });
        return;
      }

      if (req.method === 'GET' && pathname === '/') {
        const trustedLocal = isTrustedLocalClient(req);
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
        });
        res.end(trustedLocal ? localHtml : html);
        return;
      }

      if (req.method === 'GET' && pathname === '/api/health') {
        sendJson(res, 200, { ok: true, rootDir, clients: sseClients.size, lan, uiHash });
        return;
      }

      if (req.method === 'GET' && pathname === '/api/overview') {
        const range = reqUrl.searchParams.get('range') || '24h';
        const query = reqUrl.searchParams.get('q') || '';
        const sort = reqUrl.searchParams.get('sort') || 'recent';
        const account = reqUrl.searchParams.get('account') || 'all';
        const includeEmpty = reqUrl.searchParams.get('empty') === '1';
        const includeArchived = reqUrl.searchParams.get('archived') === '1';
        const trustedLocal = isTrustedLocalClient(req);
        const cacheKey = `${range}|${query}|${sort}|${account}|${includeEmpty ? 1 : 0}|${includeArchived ? 1 : 0}|${local ? 1 : 0}|${trustedLocal ? 1 : 0}`;
        const cached = overviewResponseCache.get(cacheKey);
        if (cached && Date.now() - cached.at < OVERVIEW_CACHE_TTL_MS) {
          sendJson(res, 200, cached.payload);
          return;
        }
        const liveAuth = inspectLiveAuth({ rootDir, ...(options.authOptions || {}) });
        const runningNow = getCachedRunningSessions(liveAuth);
        const overview = await buildPanelOverview({
          ...dataOpts,
          runningSessions: runningNow,
          range,
          query,
          sort,
          account,
          includeEmpty,
          includeArchived,
        });
        overview.ops = describeOps(liveEndpoints(5000));
        overview.uiHash = uiHash;
        overview.viewer = local ? { local: true } : { local: false, accessExpiresAt: device.expiresAt };
        if (local && lan) {
          overview.lan = { urls: getLanUrls(listeningPort(), lanNetworks), devices: activeDevices().length };
        }
        if (trustedLocal) {
          try {
            overview.vault = getCachedVaultStatus(overview.auth?.activeEmail || null);
          } catch {
            overview.vault = { supported: false, reason: 'Vault status unavailable', accounts: [] };
          }
        }
        if (!local) {
          // Sync stops agy windows on this Mac, so it is never offered to other devices.
          overview.auth = { ...overview.auth, syncBridgeAvailable: false };
        }
        if (overviewResponseCache.size > 24) overviewResponseCache.clear();
        overviewResponseCache.set(cacheKey, { at: Date.now(), payload: overview });
        sendJson(res, 200, overview);
        return;
      }

      const renameMatch = req.method === 'POST' && /^\/api\/session\/([^/]+)\/title$/.exec(pathname);
      if (renameMatch) {
        if (!(local ? isSameOriginLocalRequest(req) : isSameOriginRemoteRequest(req))) {
          sendJson(res, 403, { error: 'Forbidden origin' });
          return;
        }
        let id;
        try {
          id = decodeURIComponent(renameMatch[1]);
        } catch {
          sendJson(res, 400, { ok: false, error: 'Invalid conversation ID encoding' });
          return;
        }
        const body = await readJsonBody(req);
        const renamer = options.sessionRenamer || ((convId, title) => renameConversationTitle(convId, title, {
          rootDir,
          summaryCache,
          lsEndpoint: options.lsEndpoint !== undefined ? options.lsEndpoint : (liveEndpoints()[0] || false),
        }));
        const result = await renamer(id, body?.title);
        if (!result || !result.ok) {
          sendJson(res, result?.status || 400, { ok: false, error: result?.error || 'Rename failed' });
          return;
        }
        scheduleBroadcast(true);
        sendJson(res, 200, result);
        return;
      }

      if (req.method === 'POST' && (pathname === '/api/sessions/archive' || pathname === '/api/sessions/delete')) {
        if (!(local ? isSameOriginLocalRequest(req) : isSameOriginRemoteRequest(req))) {
          sendJson(res, 403, { ok: false, error: 'Forbidden origin' });
          return;
        }
        let body;
        try {
          body = await readJsonBody(req);
        } catch {
          sendJson(res, 400, { ok: false, error: 'Invalid JSON body' });
          return;
        }
        const ids = Array.isArray(body?.ids) ? body.ids : [];
        let result;
        if (pathname === '/api/sessions/archive') {
          result = await setConversationsArchived(ids, body?.archived !== false, {
            rootDir,
            endpoints: liveEndpoints(),
          });
        } else {
          const collected = collectAllSessions({
            rootDir,
            transcriptCache,
            summaryCache,
            annotationsCache,
            includeTurns: false,
            ...(dataOpts.runningSessions ? { runningSessions: dataOpts.runningSessions } : {}),
          });
          const sessionInfo = new Map(collected.sessions.map(s => [s.conversationId, { title: s.title, isGenerating: s.isGenerating }]));
          result = await deleteConversations(ids, {
            rootDir,
            endpoints: liveEndpoints(),
            runningSessions: collected.runningSessions,
            closeRunning: body?.closeRunning === true,
            confirm: body?.confirm,
            sessionInfo,
            ...(options.opsDeps ? { deps: options.opsDeps } : {}),
          });
          delete summaryCache.stamp;
          delete summaryCache.map;
        }
        if (result && Array.isArray(result.results)) scheduleBroadcast(true);
        const { status, ...payload } = result || { ok: false, error: 'Operation failed' };
        sendJson(res, status || 200, payload);
        return;
      }

      if (req.method === 'GET' && pathname.startsWith('/api/session/')) {
        const id = decodeURIComponent(pathname.slice('/api/session/'.length));
        const detail = await getSessionDetail(id, dataOpts);
        if (!detail) {
          sendJson(res, 404, { error: 'Session not found' });
          return;
        }
        sendJson(res, 200, detail);
        return;
      }

      if (req.method === 'GET' && pathname === '/api/events') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          'Connection': 'keep-alive',
        });
        res.write(`event: ready\ndata: ${JSON.stringify({ ts: Date.now(), uiHash })}\n\n`);
        res.agyRemote = !local;
        sseClients.add(res);
        startWatchers();
        req.on('close', () => {
          sseClients.delete(res);
          if (sseClients.size === 0) {
            stopWatchers();
          }
        });
        return;
      }

      if (req.method === 'POST' && pathname === '/api/quota/refresh') {
        if (!(local ? isSameOriginLocalRequest(req) : isSameOriginRemoteRequest(req))) {
          sendJson(res, 403, { error: 'Forbidden origin' });
          return;
        }
        const refresher = options.quotaRefresher || (() => refreshQuotaNow({ roots: [rootDir] }));
        const result = await refresher();
        scheduleBroadcast(true);
        sendJson(res, 200, result);
        return;
      }

      if (pathname === '/api/accounts/save' || pathname === '/api/accounts/switch' || pathname === '/api/accounts/remove' || pathname === '/api/accounts/sign-in') {
        if (req.method !== 'POST') {
          sendJson(res, 405, { ok: false, error: 'Method not allowed' });
          return;
        }
        if (!isAuthorizedVaultWrite(req)) {
          sendJson(res, 403, { ok: false, error: 'Saved account management is only available directly on the local desktop host.' });
          return;
        }
        let body;
        try {
          body = await readJsonBody(req);
        } catch {
          sendJson(res, 400, { ok: false, error: 'Invalid JSON body' });
          return;
        }
        let result;
        if (pathname === '/api/accounts/save') {
          const saver = options.vaultSaver || ((opts) => saveCurrentAccount({ rootDir, ...vaultOpts, ...opts }));
          result = await saver({ label: body?.label, force: body?.force === true });
        } else if (pathname === '/api/accounts/switch') {
          const switcher = options.vaultSwitcher || ((email, opts) => switchSavedAccount(email, {
            rootDir,
            quotaRefresher: options.quotaRefresher,
            ...vaultOpts,
            ...opts,
          }));
          result = await switcher(body?.email, {});
          if (result && result.ok && !result.alreadyActive) {
            const activationGen = Number.isInteger(result.activationGen)
              ? result.activationGen
              : readVaultMeta(rootDir).activationGen;
            const shouldBackgroundRefresh = Boolean(
              result.refreshNeeded &&
              result.hasRefreshToken &&
              body?.skipBackgroundRefresh !== true &&
              !syncInProgress &&
              options.enableExpiredAutoRefresh !== false
            );
            if (shouldBackgroundRefresh) {
              const expiredRefresher = options.vaultExpiredRefresher || ((email, opts) => refreshExpiredActiveAccount(email, {
                rootDir,
                quotaRefresher: options.quotaRefresher,
                ...vaultOpts,
                ...opts,
              }));
              const job = Promise.resolve()
                .then(() => expiredRefresher(result.email, { expectedGen: activationGen }))
                .then((r) => {
                  const curGen = readVaultMeta(rootDir).activationGen;
                  if (Number.isInteger(result.activationGen) && curGen !== activationGen) return;
                  if (r && (r.refreshed || r.vaultUpdated || r.quotaRefreshed)) {
                    invalidateLiveCaches({ vault: true });
                    scheduleBroadcast(true);
                  }
                })
                .catch(() => {})
                .finally(() => {
                  if (pendingExpiredRefresh === job) pendingExpiredRefresh = null;
                });
              pendingExpiredRefresh = job;
            }
          }
        } else if (pathname === '/api/accounts/sign-in') {
          const starter = options.vaultSignInStarter || ((opts) => prepareSignInNewAccount({ rootDir, ...vaultOpts, ...opts }));
          result = await starter({ launchTerminal: body?.launchTerminal !== false });
        } else {
          const remover = options.vaultRemover || ((email, opts) => removeSavedAccount(email, { rootDir, ...vaultOpts, ...opts }));
          result = await remover(body?.email, {});
        }
        if (result && result.ok) {
          invalidateLiveCaches({ running: true, vault: true });
          scheduleBroadcast(true);
        }
        const { status, ...payload } = result || { ok: false, status: 500, error: 'Vault operation failed' };
        sendJson(res, status || (result?.ok ? 200 : 400), payload);
        return;
      }

      if ((pathname === '/api/sync/preview' || pathname === '/api/sync/execute') && !local) {
        sendJson(res, 403, { error: 'Account sync is only available on the machine running agy' });
        return;
      }

      if (req.method === 'GET' && pathname === '/api/sync/preview') {
        const previewer = options.syncPreviewer || (() => previewAccountSync({ scriptPath: options.syncScriptPath }));
        const preview = previewer();
        sendJson(res, 200, preview);
        return;
      }

      if (req.method === 'POST' && pathname === '/api/sync/execute') {
        if (!isSameOriginLocalRequest(req)) {
          sendJson(res, 403, { error: 'Forbidden origin' });
          return;
        }
        const body = await readJsonBody(req);
        if (body?.confirm !== true) {
          sendJson(res, 400, { ok: false, error: 'Explicit confirmation (confirm: true) is required' });
          return;
        }
        if (syncInProgress) {
          sendJson(res, 409, { ok: false, error: 'An account sync is already in progress.' });
          return;
        }
        syncInProgress = true;
        let result;
        try {
          // Drain all in-flight or newly chained background expired-account refreshes
          // before restarting interactive agy sessions.
          while (pendingExpiredRefresh) {
            const inflight = pendingExpiredRefresh;
            await inflight.catch(() => null);
          }
          const executor = options.syncExecutor || ((opts) => executeAccountSync({ ...opts, scriptPath: options.syncScriptPath, rootDir }));
          result = await executor({ confirm: true });
        } finally {
          syncInProgress = false;
        }
        scheduleBroadcast(true);
        sendJson(res, result.ok ? 200 : 500, result);
        return;
      }

      sendJson(res, 404, { error: 'Not found' });
    } catch (err) {
      sendJson(res, 500, { error: err && err.message ? err.message : 'Internal server error' });
    }
  });

  server.on('close', () => {
    for (const client of sseClients) {
      try { client.end(); } catch {}
    }
    sseClients.clear();
    stopWatchers();
    if (port > 0) {
      removePanelPidRecord(process.pid, rootDir);
    }
  });

  return {
    server,
    host,
    port,
    lan,
    lanUrls: () => (lan ? getLanUrls(listeningPort(), lanNetworks) : []),
    issuePairingCode: () => (lan ? issuePairingCode() : null),
    listen: () => new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, host, () => {
        server.removeListener('error', reject);
        const actualPort = listeningPort();
        if (port > 0) {
          writePanelPidRecord({ pid: process.pid, port: actualPort, lan, startedAt: Date.now() }, rootDir);
        }
        resolve({ host, port: actualPort, url: `http://${DEFAULT_HOST}:${actualPort}`, lan });
      });
    }),
    close: () => new Promise(resolve => server.close(() => resolve())),
  };
}

module.exports = {
  DEFAULT_HOST,
  DEFAULT_PORT,
  getPanelPidPath,
  getPanelLanSettingsPath,
  readLanSettings,
  setLanNetworks,
  getLanAddresses,
  getLanUrls,
  requestPairingCode,
  revokePairedDevices,
  readPanelPidRecord,
  checkPanelHealth,
  ensurePanelRunning,
  stopPanelDaemon,
  isSameOriginLocalRequest,
  isTrustedLocalClient,
  computeOverviewDigest,
  createPanelServer,
};
