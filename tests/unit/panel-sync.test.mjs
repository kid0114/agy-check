import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

const { createPanelServer } = require('../../runtime/panel-server.js');
const { renderPanelHtml } = require('../../runtime/panel-ui.js');

describe('panel auto-sync and heartbeat', () => {
  test('SSE streams ready with uiHash, emits periodic ping heartbeats, and auto-refreshes stale quota while clients are open', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-check-sync-'));
    fs.mkdirSync(path.join(tmp, 'presence'), { recursive: true });
    let quotaCalls = 0;
    const panel = createPanelServer({
      rootDir: tmp,
      port: 0,
      endpointsProvider: () => [],
      heartbeatIntervalMs: 80,
      pollIntervalMs: 80,
      quotaAutoRefreshMs: 120,
      quotaRefresher: async () => {
        quotaCalls += 1;
        return { ok: true };
      },
      dataOptions: {
        authOptions: { tokenReader: () => ({ accessToken: 'tok', email: 'u@example.com', sourceFormat: 'macos-keychain' }) },
        runningSessions: [],
        quotaFetcher: async () => [],
      },
      authOptions: { tokenReader: () => ({ accessToken: 'tok', email: 'u@example.com', sourceFormat: 'macos-keychain' }) },
    });
    const { url, port } = await panel.listen();
    try {
      const health = await (await fetch(`${url}/api/health`)).json();
      const ov = await (await fetch(`${url}/api/overview`)).json();
      assert.match(health.uiHash, /^[a-f0-9]{12}$/);
      assert.equal(ov.uiHash, health.uiHash);

      const events = [];
      await new Promise((resolve, reject) => {
        const req = http.get({ host: '127.0.0.1', port, path: '/api/events' }, (res) => {
          let buf = '';
          res.setEncoding('utf8');
          res.on('data', (chunk) => {
            buf += chunk;
            const frames = buf.split('\n\n');
            buf = frames.pop() || '';
            for (const f of frames) {
              const ev = /event:\s*(\S+)/.exec(f)?.[1];
              const dataRaw = /data:\s*(.+)/.exec(f)?.[1];
              if (ev) events.push({ event: ev, data: dataRaw ? JSON.parse(dataRaw) : null });
            }
            const hasReady = events.some(e => e.event === 'ready');
            const hasPing = events.some(e => e.event === 'ping');
            const hasChanged = events.some(e => e.event === 'changed');
            if (hasReady && hasPing && hasChanged && quotaCalls >= 1) {
              req.destroy();
              resolve();
            }
          });
        });
        req.on('error', (err) => {
          if (err.code === 'ECONNRESET') resolve();
          else reject(err);
        });
        setTimeout(() => { req.destroy(); resolve(); }, 1500);
      });

      const ready = events.find(e => e.event === 'ready');
      assert.ok(ready, 'SSE ready event received');
      assert.equal(ready.data.uiHash, health.uiHash);
      assert.ok(events.some(e => e.event === 'ping'), 'SSE ping heartbeat received');
      assert.ok(events.some(e => e.event === 'changed'), 'SSE changed event received');
      assert.ok(quotaCalls >= 1, 'stale cloud quota auto-refreshed while SSE client was connected');
    } finally {
      await panel.close();
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('frontend wires visibilitychange, online, heartbeat watchdog, uiHash reload, and clickable sync pill', () => {
    const html = renderPanelHtml();
    assert.ok(html.includes('<button id="connState"'), 'connection status pill is clickable');
    assert.ok(html.includes("addEventListener('ping'"), 'SSE ping listener wired');
    assert.ok(html.includes("addEventListener('ready'"), 'SSE ready listener wired');
    assert.ok(html.includes("addEventListener('visibilitychange'"), 'tab wake sync wired');
    assert.ok(html.includes("addEventListener('online'"), 'network online recovery wired');
    assert.ok(html.includes('handleUiHash'), 'UI build hash check wired');
    assert.ok(html.includes('startFallbackPoll'), 'fallback polling during reconnect wired');
  });
});
