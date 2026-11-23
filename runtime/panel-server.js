'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { resolveAntigravityPath } = require('./paths.js');
const { refreshQuotaNow } = require('./quota.js');
const { buildPanelOverview, getSessionDetail } = require('./panel-data.js');
const { inspectLiveAuth, previewAccountSync, executeAccountSync } = require('./account-sync.js');
const { renderPanelHtml } = require('./panel-ui.js');

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 18721;
const DEBOUNCE_MS = 500;
const AUTH_POLL_INTERVAL_MS = 4000;

function getPanelPidPath(rootDir = null) {
  const baseDir = rootDir || resolveAntigravityPath('');
  return path.join(baseDir, 'agy-hud-panel.pid');
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

  const initial = await checkPanelHealth(port, 400);
  if (initial.healthy) {
    const rec = readPanelPidRecord(rootDir);
    return { ok: true, alreadyRunning: true, pid: rec?.pid || null, port, url };
  }

  let child;
  try {
    child = spawn(process.execPath, [cliScriptPath, 'panel', '--port', String(port)], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      env: { ...process.env, ...(options.rootDir ? { AGY_HUD_DATA_DIR: options.rootDir } : {}) },
    });
    child.unref();
  } catch (err) {
    return { ok: false, alreadyRunning: false, pid: null, port, url, error: err.message };
  }

  const deadline = Date.now() + (options.waitMs || 3000);
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 70));
    const probe = await checkPanelHealth(port, 300);
    if (probe.healthy) {
      return { ok: true, alreadyRunning: false, pid: child.pid || null, port, url };
    }
  }

  return { ok: false, alreadyRunning: false, pid: child.pid || null, port, url, error: 'Timed out waiting for panel server to become healthy' };
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

function isSameOriginLocalRequest(req) {
  if (!isLoopbackHost(req.headers.host)) return false;
  const origin = req.headers.origin;
  if (origin) {
    try {
      const parsed = new URL(origin);
      if (parsed.hostname !== '127.0.0.1' && parsed.hostname !== 'localhost' && parsed.hostname !== '::1') {
        return false;
      }
    } catch {
      return false;
    }
  }
  return true;
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
    })),
  };
  return crypto.createHash('sha1').update(JSON.stringify(stripped)).digest('hex');
}

function createPanelServer(options = {}) {
  const rootDir = options.rootDir || resolveAntigravityPath('');
  const host = DEFAULT_HOST;
  const port = Number.isInteger(options.port) ? options.port : DEFAULT_PORT;
  const transcriptCache = new Map();
  const summaryCache = {};
  const sseClients = new Set();
  const watchers = [];
  let debounceTimer = null;
  let pollTimer = null;
  let lastDigest = null;
  let lastSeenAccountKey = null;
  let quotaRefreshing = false;

  const dataOpts = {
    rootDir,
    transcriptCache,
    summaryCache,
    ...(options.dataOptions || {}),
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
        refreshQuotaNow({ roots: [rootDir] })
          .catch(() => null)
          .finally(() => {
            quotaRefreshing = false;
            scheduleBroadcast(true);
          });
      }
      lastSeenAccountKey = acctKey;

      const overview = await buildPanelOverview({ ...dataOpts, range: 'all' });
      const digest = computeOverviewDigest(overview);
      if (!forceBroadcast && digest === lastDigest) return;
      lastDigest = digest;

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
    if (sseClients.size === 0) return;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      maybeCheckAuthSwitchAndBroadcast(force);
    }, DEBOUNCE_MS);
  }

  function startWatchers() {
    if (watchers.length > 0) return;
    const watchTargets = [
      rootDir,
      path.join(rootDir, 'sessions'),
      path.join(rootDir, 'speed-cache'),
    ];
    for (const target of watchTargets) {
      try {
        if (!fs.existsSync(target)) continue;
        const w = fs.watch(target, { persistent: false }, (_eventType, filename) => {
          if (filename && String(filename).includes('.tmp.')) return;
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
      }, AUTH_POLL_INTERVAL_MS);
      if (typeof pollTimer.unref === 'function') pollTimer.unref();
    }
  }

  function stopWatchers() {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    while (watchers.length > 0) {
      const w = watchers.pop();
      try { w.close(); } catch {}
    }
  }

  const html = renderPanelHtml();

  const server = http.createServer(async (req, res) => {
    const reqUrl = new URL(req.url || '/', `http://${host}:${port}`);
    const pathname = reqUrl.pathname;

    try {
      if (req.method === 'GET' && pathname === '/') {
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
        });
        res.end(html);
        return;
      }

      if (req.method === 'GET' && pathname === '/api/health') {
        sendJson(res, 200, { ok: true, rootDir, clients: sseClients.size });
        return;
      }

      if (req.method === 'GET' && pathname === '/api/overview') {
        const range = reqUrl.searchParams.get('range') || '24h';
        const query = reqUrl.searchParams.get('q') || '';
        const sort = reqUrl.searchParams.get('sort') || 'recent';
        const account = reqUrl.searchParams.get('account') || 'all';
        const includeEmpty = reqUrl.searchParams.get('empty') === '1';
        const overview = await buildPanelOverview({
          ...dataOpts,
          range,
          query,
          sort,
          account,
          includeEmpty,
        });
        sendJson(res, 200, overview);
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
        res.write(`event: ready\ndata: ${JSON.stringify({ ts: Date.now() })}\n\n`);
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
        if (!isSameOriginLocalRequest(req)) {
          sendJson(res, 403, { error: 'Forbidden origin' });
          return;
        }
        const refresher = options.quotaRefresher || (() => refreshQuotaNow({ roots: [rootDir] }));
        const result = await refresher();
        scheduleBroadcast(true);
        sendJson(res, 200, result);
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
        const executor = options.syncExecutor || ((opts) => executeAccountSync({ ...opts, scriptPath: options.syncScriptPath, rootDir }));
        const result = await executor({ confirm: true });
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
    listen: () => new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, host, () => {
        server.removeListener('error', reject);
        const addr = server.address();
        const actualPort = typeof addr === 'object' && addr ? addr.port : port;
        if (port > 0) {
          writePanelPidRecord({ pid: process.pid, port: actualPort, startedAt: Date.now() }, rootDir);
        }
        resolve({ host, port: actualPort, url: `http://${host}:${actualPort}` });
      });
    }),
    close: () => new Promise(resolve => server.close(() => resolve())),
  };
}

module.exports = {
  DEFAULT_HOST,
  DEFAULT_PORT,
  getPanelPidPath,
  readPanelPidRecord,
  checkPanelHealth,
  ensurePanelRunning,
  stopPanelDaemon,
  isSameOriginLocalRequest,
  computeOverviewDigest,
  createPanelServer,
};
