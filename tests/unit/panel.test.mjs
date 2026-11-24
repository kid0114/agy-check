import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  writeAccountQuotaSnapshot,
  readAccountQuotaStore,
  getAccountQuota,
} = require('../../runtime/quota/cache.js');
const {
  writeSessionSnapshot,
  readSessionSnapshot,
  evaluateAccountDrift,
} = require('../../runtime/session-snapshot.js');
const {
  inspectLiveAuth,
  parsePsInteractiveAgy,
  extractConversationIdsFromLogFile,
  classifyProcessSync,
  parseSyncDryRunOutput,
  executeAccountSync,
} = require('../../runtime/account-sync.js');
const {
  parseTranscriptMetrics,
  diagnoseTurnCacheMiss,
  readSpeedCacheForConversation,
  resolveSessionSpeed,
  buildPanelOverview,
  getSessionDetail,
} = require('../../runtime/panel-data.js');
const { getSpeedCachePath } = require('../../runtime/speed.js');
const {
  createPanelServer,
  readOrCreatePanelToken,
  getPanelLanSettingsPath,
  setLanNetworks,
  getLanAddresses,
} = require('../../runtime/panel-server.js');
const { renderPanelHtml } = require('../../runtime/panel-ui.js');
const { formatOverviewTable, formatSessionDetailText, parseCliArgs } = require('../../runtime/panel-cli.js');
const { parseCheckInput, handleCheckHook } = require('../../runtime/check-hook.js');
const { configureCheckHook, installCheckSkill, removeCheckSkills } = require('../../runtime/statusline-installer.js');
const { clearTimerHooks } = require('../../runtime/uninstall.js');
const { renderHUD } = require('../../runtime/renderer.js');

const CJK_RE = /[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/;

describe('multi-session panel & account-sync', () => {
  test('per-account quota store retains multiple switched accounts independently', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-check-acct-store-'));
    try {
      const storePath = path.join(tmp, 'agy-hud-accounts-quota.json');
      const reset = new Date(Date.now() + 3600_000).toISOString();

      writeAccountQuotaSnapshot('alice@gmail.com', {
        tier: 'Google AI Pro',
        providerQuota: { google: { fiveHour: { remainingFraction: 0.9, resetTime: reset } } },
        data: [{ id: 'gemini-4-flash', remainingFraction: 0.9, resetTime: reset }],
      }, storePath);

      writeAccountQuotaSnapshot('bob@gmail.com', {
        tier: 'Google AI Ultra',
        providerQuota: { google: { fiveHour: { remainingFraction: 0.4, resetTime: reset } } },
        data: [{ id: 'gemini-4-flash', remainingFraction: 0.4, resetTime: reset }],
      }, storePath);

      const store = readAccountQuotaStore(storePath);
      assert.equal(store.activeEmail, 'bob@gmail.com');
      assert.equal(Object.keys(store.accounts).length, 2);
      assert.equal(getAccountQuota('alice@gmail.com', storePath).providerQuota.google.fiveHour.remainingFraction, 0.9);
      assert.equal(getAccountQuota('bob@gmail.com', storePath).providerQuota.google.fiveHour.remainingFraction, 0.4);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('session snapshot sticks to old account for same agyPid and detects drift after switch', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-check-snap-'));
    try {
      const t0 = Date.now() - 60_000;
      const first = writeSessionSnapshot({
        conversationId: '11111111-2222-3333-4444-555555555555',
        cwd: '/tmp/proj',
        currentDir: 'proj',
        branch: 'main',
        activeAccountEmail: 'old@gmail.com',
        agyProcess: { pid: 12345, startedAtMs: t0 },
      }, { rootDir: tmp, now: t0 });

      assert.equal(first.sessionAccountEmail, 'old@gmail.com');
      assert.equal(first.accountDrift, null);

      // Same agy PID renders after Keychain switched to new@gmail.com
      const second = writeSessionSnapshot({
        conversationId: '11111111-2222-3333-4444-555555555555',
        activeAccountEmail: 'new@gmail.com',
        agyProcess: { pid: 12345, startedAtMs: t0 },
      }, { rootDir: tmp, now: Date.now(), accountSwitchedAt: Date.now() - 5000 });

      assert.equal(second.sessionAccountEmail, 'old@gmail.com');
      assert.equal(second.accountDrift.activeEmail, 'new@gmail.com');
      assert.equal(second.accountDrift.sessionEmail, 'old@gmail.com');

      // New agy PID after restart clears drift
      const third = writeSessionSnapshot({
        conversationId: '11111111-2222-3333-4444-555555555555',
        activeAccountEmail: 'new@gmail.com',
        agyProcess: { pid: 67890, startedAtMs: Date.now() },
      }, { rootDir: tmp, now: Date.now(), accountSwitchedAt: Date.now() - 5000 });

      assert.equal(third.sessionAccountEmail, 'new@gmail.com');
      assert.equal(third.accountDrift, null);
      assert.equal(readSessionSnapshot('11111111-2222-3333-4444-555555555555', tmp).agyPid, 67890);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('renderHUD surfaces English drift warning only when accountDrift is set', () => {
    const baseState = { steps: 3, branch: 'main', currentDir: 'proj', username: 'new@gmail.com' };
    const cfg = { display: { unicode: true, showUsername: true }, language: 'en' };
    const clean = renderHUD(baseState, { model: { display_name: 'Gemini 4 Neon' } }, cfg, [], 'Pro', null);
    assert.doesNotMatch(clean, /acct unsynced/);

    const drifted = renderHUD(
      { ...baseState, accountDrift: { activeEmail: 'new@gmail.com', sessionEmail: 'old@gmail.com' } },
      { model: { display_name: 'Gemini 4 Neon' } },
      cfg,
      [],
      'Pro',
      null
    );
    assert.match(drifted, /acct unsynced \(keychain: new@gmail\.com\)/);
  });

  test('parseTranscriptMetrics diagnoses model_switch, ttl_gap, context_drop and uses incremental cache', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-check-transcript-'));
    try {
      const tp = path.join(tmp, 'transcript.jsonl');
      const entries = [
        { step_index: 0, type: 'USER_INPUT', created_at: '2026-11-23T10:00:00Z', content: '<USER_REQUEST>\nFix cache hit rate\n</USER_REQUEST>' },
        { step_index: 1, type: 'PLANNER_RESPONSE', created_at: '2026-11-23T10:00:05Z', model: 'gemini-4-pro', input_tokens: 20000, cache_read_tokens: 0, output_tokens: 500 },
        { step_index: 2, type: 'PLANNER_RESPONSE', created_at: '2026-11-23T10:00:15Z', model: 'gemini-4-pro', input_tokens: 1000, cache_read_tokens: 20000, output_tokens: 400 },
        // 10-minute gap + model switch + low hit rate
        { step_index: 3, type: 'PLANNER_RESPONSE', created_at: '2026-11-23T10:10:20Z', model: 'claude-opus-4', input_tokens: 22000, cache_read_tokens: 0, output_tokens: 300 },
        // Context drop (prompt shrank from 22000 -> 8000)
        { step_index: 4, type: 'PLANNER_RESPONSE', created_at: '2026-11-23T10:10:30Z', model: 'claude-opus-4', input_tokens: 8000, cache_read_tokens: 0, output_tokens: 200 },
      ];
      fs.writeFileSync(tp, entries.map(e => JSON.stringify(e)).join('\n') + '\n');

      const cache = new Map();
      const first = parseTranscriptMetrics(tp, cache);
      assert.equal(first.firstUserPrompt, 'Fix cache hit rate');
      assert.equal(first.turnsCount, 4);
      assert.equal(first.turns[1].hitRate > 90, true);
      assert.equal(first.turns[1].missReasons.length, 0);

      const t3Codes = first.turns[2].missReasons.map(r => r.code);
      assert.ok(t3Codes.includes('model_switch'));
      assert.ok(t3Codes.includes('ttl_gap'));

      const t4Codes = first.turns[3].missReasons.map(r => r.code);
      assert.ok(t4Codes.includes('context_drop'));

      // Cache hit returns identical object reference when mtime/size unchanged
      const second = parseTranscriptMetrics(tp, cache);
      assert.equal(second, first);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('account-sync tracks switches, parses ps & dry-run output, and requires confirm:true', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-check-sync-'));
    try {
      const a1 = inspectLiveAuth({
        rootDir: tmp,
        now: 1000,
        tokenReader: () => ({ accessToken: 'tok-1', email: 'a@gmail.com', sourceFormat: 'macos-keychain' }),
      });
      assert.equal(a1.activeEmail, 'a@gmail.com');
      assert.equal(a1.accountSwitched, false);

      const a2 = inspectLiveAuth({
        rootDir: tmp,
        now: 5000,
        tokenReader: () => ({ accessToken: 'tok-2', email: 'b@gmail.com', sourceFormat: 'macos-keychain' }),
      });
      assert.equal(a2.activeEmail, 'b@gmail.com');
      assert.equal(a2.accountSwitched, true);
      assert.equal(a2.switchedAt, 5000);

      const sync = classifyProcessSync({
        pid: 100,
        startedAtMs: 1000,
        activeEmail: 'b@gmail.com',
        switchedAt: 5000,
      });
      assert.equal(sync.syncStatus, 'unsynced');

      const procs = parsePsInteractiveAgy([
        '15065 Mon Nov 23 07:04:30 2026 agy',
        '17021 Mon Nov 23 07:12:00 2026 /Users/dev/.local/bin/agy -p /usage --output-format json',
        '37245 Wed Nov 18 18:00:00 2026 agy --conversation=22222222-2222-4222-8222-222222222222',
      ].join('\n'));
      assert.equal(procs.length, 2);
      assert.deepEqual(procs.map(p => p.pid), [15065, 37245]);

      const dry = parseSyncDryRunOutput([
        'Keychain: present=True email=b@gmail.com expiry=2026-11-23T18:00:00Z expired=False',
        'Other interactive agy PIDs (2): [101, 102]',
        "  [reopen] pid=101 conv=11111111-1111-1111-1111-111111111111 steps=12 title='Fix bug' cwd=/Users/dev",
        '  [skip]   pid=102 conv=None (no conversation)',
      ].join('\n'));
      assert.equal(dry.keychain.email, 'b@gmail.com');
      assert.equal(dry.reopen.length, 1);
      assert.equal(dry.skipped.length, 1);

      const refused = await executeAccountSync({ confirm: false });
      assert.equal(refused.ok, false);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('WebUI server serves English HTML, overview/detail JSON, SSE, and guards POST endpoints', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-check-server-'));
    const convId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    try {
      const logDir = path.join(tmp, 'brain', convId, '.system_generated', 'logs');
      fs.mkdirSync(logDir, { recursive: true });
      fs.writeFileSync(path.join(logDir, 'transcript.jsonl'), [
        JSON.stringify({ step_index: 0, type: 'USER_INPUT', created_at: new Date().toISOString(), content: 'Inspect multi-session cache' }),
        JSON.stringify({ step_index: 1, type: 'PLANNER_RESPONSE', created_at: new Date().toISOString(), model: 'gemini-4-neon', input_tokens: 10000, cache_read_tokens: 0, output_tokens: 300 }),
        JSON.stringify({ step_index: 2, type: 'PLANNER_RESPONSE', created_at: new Date().toISOString(), model: 'gemini-4-neon', input_tokens: 1000, cache_read_tokens: 10000, output_tokens: 400 }),
      ].join('\n') + '\n');

      const reset = new Date(Date.now() + 7200_000).toISOString();
      const accountStorePath = path.join(tmp, 'agy-hud-accounts-quota.json');
      writeAccountQuotaSnapshot('tester@gmail.com', {
        tier: 'Google AI Pro',
        providerQuota: {
          google: { fiveHour: { remainingFraction: 0.82, resetTime: reset } },
          claude: { weekly: { remainingFraction: 0.65, resetTime: reset } },
        },
        data: [],
      }, accountStorePath);

      const panel = createPanelServer({
        rootDir: tmp,
        port: 0,
        dataOptions: {
          accountStorePath,
          authOptions: {
            tokenReader: () => ({ accessToken: 'tok', email: 'tester@gmail.com', sourceFormat: 'macos-keychain' }),
          },
          runningSessions: [
            { pid: 9999, startedAtMs: Date.now() - 1000, cwd: tmp, conversationId: convId, syncStatus: 'synced', sessionAccountEmail: 'tester@gmail.com', syncReason: 'matched' },
          ],
          quotaFetcher: async () => [],
        },
        syncExecutor: async () => ({ ok: true, output: 'synced ok' }),
      });

      const { url } = await panel.listen();
      try {
        // 1. HTML is strictly English (no CJK characters)
        const htmlRes = await fetch(url);
        assert.equal(htmlRes.status, 200);
        const html = await htmlRes.text();
        assert.equal(CJK_RE.test(html), false, 'Panel HTML must be strictly English');
        assert.equal(CJK_RE.test(renderPanelHtml()), false);

        // 2. Overview JSON
        const ovRes = await fetch(`${url}/api/overview?range=all`);
        assert.equal(ovRes.status, 200);
        const ov = await ovRes.json();
        assert.equal(ov.summary.sessionCount, 1);
        assert.equal(ov.sessions[0].conversationId, convId);
        assert.equal(ov.quota.providers[0].fiveHour.percent, 82);

        // 3. Detail JSON (by prefix)
        const detRes = await fetch(`${url}/api/session/aaaaaaaa`);
        assert.equal(detRes.status, 200);
        const det = await detRes.json();
        assert.equal(det.turns.length, 2);
        assert.ok(det.turns[1].hitRate > 90);

        // 4. POST /api/sync/execute rejects missing confirm and foreign origin
        const badConfirm = await fetch(`${url}/api/sync/execute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ confirm: false }),
        });
        assert.equal(badConfirm.status, 400);

        const badOrigin = await fetch(`${url}/api/sync/execute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' },
          body: JSON.stringify({ confirm: true }),
        });
        assert.equal(badOrigin.status, 403);

        const okSync = await fetch(`${url}/api/sync/execute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ confirm: true }),
        });
        assert.equal(okSync.status, 200);
        const okBody = await okSync.json();
        assert.equal(okBody.ok, true);

        // 5. CLI formatters are strictly English
        const tableText = formatOverviewTable(ov, { noColor: true });
        assert.equal(CJK_RE.test(tableText), false);
        assert.match(tableText, /agy-check/);
        assert.match(tableText, /weighted-hit=/);

        const detailText = formatSessionDetailText(det, { noColor: true });
        assert.equal(CJK_RE.test(detailText), false);
        assert.match(detailText, /DIAGNOSIS/);

        assert.deepEqual(parseCliArgs(['ls', '--range', '7d', '--json']), {
          command: 'ls',
          args: [],
          flags: { range: '7d', json: true },
        });
      } finally {
        await panel.close();
      }
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('LAN mode serves other devices only with the token link and keeps account sync on the Mac', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-check-lan-'));
    const http = require('node:http');
    // Requests reach 127.0.0.1 but name another host, which the server treats as a LAN device.
    const send = (port, reqPath, { method = 'GET', headers = {}, body = null } = {}) => new Promise((resolve, reject) => {
      const req = http.request({ host: '127.0.0.1', port, path: reqPath, method, headers }, (res) => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text: Buffer.concat(chunks).toString('utf8') }));
      });
      req.on('error', reject);
      if (body) req.write(body);
      req.end();
    });
    try {
      const token = readOrCreatePanelToken(tmp);
      assert.match(token, /^[a-z2-9]{12}$/);
      assert.equal(readOrCreatePanelToken(tmp), token, 'token survives restarts');
      assert.equal(fs.statSync(getPanelLanSettingsPath(tmp)).mode & 0o777, 0o600);

      // Only Wi-Fi/Ethernet plus saved networks are served; VM bridges and other tunnels are not.
      const ifaces = {
        lo0: [{ family: 'IPv4', address: '127.0.0.1', internal: true }],
        en0: [{ family: 'IPv4', address: '192.168.1.20', internal: false }],
        bridge100: [{ family: 'IPv4', address: '192.168.64.1', internal: false }],
        utun4: [{ family: 'IPv4', address: '10.20.0.3', internal: false }],
        utun5: [{ family: 'IPv4', address: '10.99.0.7', internal: false }],
      };
      assert.deepEqual(getLanAddresses([], ifaces), ['192.168.1.20']);
      assert.deepEqual(getLanAddresses(['10.20.0.0/24'], ifaces), ['192.168.1.20', '10.20.0.3']);
      assert.throws(() => setLanNetworks(tmp, ['10.20.0.0/33']), /Invalid network/);
      assert.deepEqual(setLanNetworks(tmp, ['10.20.0.0/24']), ['10.20.0.0/24']);
      assert.equal(readOrCreatePanelToken(tmp), token, 'saving networks keeps the token');

      let refreshed = 0;
      const panel = createPanelServer({
        rootDir: tmp,
        port: 0,
        lan: true,
        quotaRefresher: async () => { refreshed += 1; return { ok: true }; },
        syncExecutor: async () => ({ ok: true }),
        dataOptions: {
          authOptions: { tokenReader: () => ({ accessToken: 'tok', email: 'u@example.com', sourceFormat: 'macos-keychain' }) },
          runningSessions: [],
          quotaFetcher: async () => [],
        },
      });
      const { port } = await panel.listen();
      try {
        const lanHost = { Host: `lan.test:${port}` };
        assert.equal((await send(port, '/', { headers: lanHost })).status, 401);
        assert.equal((await send(port, '/?t=wrongtoken12', { headers: lanHost })).status, 401);
        assert.equal((await send(port, '/api/overview', { headers: lanHost })).status, 401);

        const page = await send(port, `/?t=${token}`, { headers: lanHost });
        assert.equal(page.status, 200);
        const cookie = String(page.headers['set-cookie']).split(';')[0];
        assert.match(cookie, new RegExp(`^agy_check_token=${token}$`));

        const remote = { ...lanHost, Cookie: cookie };
        const ov = JSON.parse((await send(port, '/api/overview?range=all', { headers: remote })).text);
        assert.equal(ov.viewer.local, false);
        assert.equal(ov.auth.syncBridgeAvailable, false);
        assert.equal(ov.lan, undefined, 'phones never receive the token list');

        const sameOrigin = { ...remote, Origin: `http://lan.test:${port}`, 'Content-Type': 'application/json' };
        assert.equal((await send(port, '/api/quota/refresh', { method: 'POST', headers: remote })).status, 403);
        assert.equal((await send(port, '/api/quota/refresh', { method: 'POST', headers: sameOrigin })).status, 200);
        assert.equal(refreshed, 1);
        assert.equal((await send(port, '/api/sync/preview', { headers: remote })).status, 403);
        assert.equal((await send(port, '/api/sync/execute', { method: 'POST', headers: sameOrigin, body: '{"confirm":true}' })).status, 403);

        const localOv = JSON.parse((await send(port, '/api/overview?range=all')).text);
        assert.equal(localOv.viewer.local, true);
        assert.ok(Array.isArray(localOv.lan.urls));
        for (const u of localOv.lan.urls) assert.ok(u.endsWith(`:${port}/?t=${token}`));
      } finally {
        await panel.close();
      }
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('/check PreInvocation hook intercepts slash commands with zero LLM call and English markdown', async () => {
    assert.equal(parseCheckInput('hello world'), null);
    assert.deepEqual(parseCheckInput('/check'), { subcommand: 'panel', args: [], rawArgs: '' });
    assert.deepEqual(parseCheckInput('/check ls 7d'), { subcommand: 'ls', args: ['7d'], rawArgs: 'ls 7d' });
    // Other commands that merely start with "check" must pass through to agy.
    assert.equal(parseCheckInput('/checkout main'), null);
    assert.equal(parseCheckInput('/checkagy'), null);
    assert.deepEqual(parseCheckInput('<USER_REQUEST>\n/check stop\n</USER_REQUEST>'), {
      subcommand: 'stop',
      args: [],
      rawArgs: 'stop',
    });

    // Non-matching prompt passes through cleanly
    const passthrough = await handleCheckHook({ lastUserInput: 'explain quicksort' });
    assert.deepEqual(passthrough, {});

    // `/check` launches panel, opens browser, and terminates before model call
    let openedUrl = null;
    const res = await handleCheckHook(
      { lastUserInput: '/check', conversationId: 'conv-1' },
      {
        ensurePanel: async () => ({ ok: true, alreadyRunning: false, pid: 4242, port: 18721, url: 'http://127.0.0.1:18721' }),
        openBrowser: (u) => { openedUrl = u; },
        overviewBuilder: async () => ({
          range: '24h',
          auth: { loggedIn: true, activeEmail: 'demo@gmail.com', expired: false },
          quota: { tier: 'Google AI Pro', providers: [{ label: 'Google / Gemini', fiveHour: { percent: 88, resetIn: '2h' } }] },
          summary: { sessionCount: 1, totalSessionsAll: 3, runningCount: 1, unsyncedCount: 0, weightedHitRate: 91.2, totalCacheRead: 100000, totalUncachedInput: 10000, totalOutput: 2000 },
          sessions: [{ shortId: 'conv-1', title: 'Test Session', status: 'running', syncStatus: 'synced', modelLabel: 'Gemini 4 Neon(XH)', turnsCount: 5, lastTurnHitRate: 95, sessionHitRate: 91.2, totalCacheRead: 100000, totalUncachedInput: 10000, totalOutput: 2000, lastActivityMs: Date.now() }],
        }),
      }
    );

    assert.equal(openedUrl, 'http://127.0.0.1:18721');
    assert.equal(res.terminationBehavior, 'terminate');
    const md = res.injectSteps[0].systemMessage.systemMessage;
    assert.match(md, /http:\/\/127\.0\.0\.1:18721/);
    assert.match(md, /demo@gmail\.com/);
    assert.equal(CJK_RE.test(md), false, '/check inline markdown must be strictly English');

    // Hook installer + uninstaller preserve unrelated hooks
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-check-hook-cfg-'));
    try {
      const hooksPath = path.join(tmp, 'hooks.json');
      fs.writeFileSync(hooksPath, JSON.stringify({ keep: { Stop: [] } }));
      const installed = configureCheckHook(path.join(tmp, 'runtime'), { hooksPath, nodePath: '/usr/bin/node' });
      assert.equal(installed.changed, true);
      const afterInstall = JSON.parse(fs.readFileSync(hooksPath, 'utf8'));
      assert.ok(afterInstall.keep);
      assert.ok(afterInstall['agy-check-slash-command']);
      clearTimerHooks(hooksPath);
      const afterClear = JSON.parse(fs.readFileSync(hooksPath, 'utf8'));
      assert.ok(afterClear.keep);
      assert.equal(afterClear['agy-check-slash-command'], undefined);

      // Skill install retires our old /checkagy skill but never overwrites a user's own `check` skill.
      const skillsDir = path.join(tmp, '.gemini', 'config', 'skills');
      const ours = '---\nname: check\n---\nHandled by the `agy-check-slash-command` hook.\n';
      fs.mkdirSync(path.join(skillsDir, 'checkagy'), { recursive: true });
      fs.writeFileSync(path.join(skillsDir, 'checkagy', 'SKILL.md'), ours.replace('name: check', 'name: checkagy'));
      const first = installCheckSkill(ours, { homeDir: tmp });
      assert.equal(first.skillPath, path.join(skillsDir, 'check', 'SKILL.md'));
      assert.equal(fs.existsSync(path.join(skillsDir, 'checkagy')), false);
      assert.deepEqual(removeCheckSkills({ homeDir: tmp }), [path.join(skillsDir, 'check')]);

      fs.mkdirSync(path.join(skillsDir, 'check'), { recursive: true });
      fs.writeFileSync(path.join(skillsDir, 'check', 'SKILL.md'), '---\nname: check\n---\nMy own lint checklist.\n');
      const blocked = installCheckSkill(ours, { homeDir: tmp });
      assert.equal(blocked.skillPath, null);
      assert.equal(blocked.conflict, path.join(skillsDir, 'check', 'SKILL.md'));
      assert.deepEqual(removeCheckSkills({ homeDir: tmp }), []);
      assert.match(fs.readFileSync(path.join(skillsDir, 'check', 'SKILL.md'), 'utf8'), /My own lint checklist/);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('dual speed (out + net) resolves from legacy speed-cache key, full >512KB logs, orphan PIDs, and empty filtering', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-check-dual-speed-'));
    const convId = '12345678-aaaa-bbbb-cccc-111111111111';
    const emptyId = '22222222-aaaa-bbbb-cccc-222222222222';
    try {
      // 1. Simulate ~/.gemini/antigravity-cli root with legacy antigravity/brain/<id> speed-cache hash
      const cliRoot = path.join(tmp, 'antigravity-cli');
      const logDir = path.join(cliRoot, 'brain', convId, '.system_generated', 'logs');
      fs.mkdirSync(logDir, { recursive: true });
      const nowIso = new Date().toISOString();
      fs.writeFileSync(path.join(logDir, 'transcript.jsonl'), [
        JSON.stringify({ step_index: 0, type: 'USER_INPUT', created_at: nowIso, content: 'Measure out and net speed' }),
        JSON.stringify({ step_index: 1, type: 'PLANNER_RESPONSE', created_at: nowIso, model: 'gemini-4-neon', input_tokens: 5000, cache_read_tokens: 20000, output_tokens: 1200, content: 'Visible reply text here.' }),
      ].join('\n') + '\n');

      // Empty non-running transcript (e.g. terminated /check hook with 0 PLANNER_RESPONSE turns)
      const emptyLogDir = path.join(cliRoot, 'brain', emptyId, '.system_generated', 'logs');
      fs.mkdirSync(emptyLogDir, { recursive: true });
      fs.writeFileSync(path.join(emptyLogDir, 'transcript.jsonl'), [
        JSON.stringify({ step_index: 0, type: 'USER_INPUT', created_at: nowIso, content: '/check --no-open' }),
      ].join('\n') + '\n');

      // Write speed-cache keyed on legacy sibling path `<tmp>/antigravity/brain/<id>/...`
      const legacyTranscriptKey = path.join(tmp, 'antigravity', 'brain', convId, '.system_generated', 'logs', 'transcript.jsonl');
      const scPath = getSpeedCachePath(cliRoot, legacyTranscriptKey);
      fs.mkdirSync(path.dirname(scPath), { recursive: true });
      fs.writeFileSync(scPath, JSON.stringify({
        apiDurationMs: 20_000,
        totalOutputTokens: 1600,
        visibleOutputTokens: 640,
        usageKey: '5000:1200:0:20000',
        speed: 92.4,
        visibleSpeed: 38.6,
        source: 'hook',
      }));

      const rawSc = readSpeedCacheForConversation(convId, cliRoot, null);
      assert.equal(rawSc.speed, 92.4);
      assert.equal(rawSc.visibleSpeed, 38.6);

      const resolved = resolveSessionSpeed(convId, cliRoot, null, null, null);
      assert.equal(resolved.totalSpeed, 92.4);
      assert.equal(resolved.visibleSpeed, 38.6);
      assert.equal(resolved.avgTotalSpeed, 80);
      assert.equal(resolved.avgVisibleSpeed, 32);
      assert.equal(resolved.source, 'hook');

      // Fallback session-average when no speed-cache exists
      const fallback = resolveSessionSpeed('99999999-0000-0000-0000-000000000000', cliRoot, null, {
        totalOutput: 600,
        totalVisibleOutput: 240,
        totalApiDurationMs: 10_000,
      }, null);
      assert.equal(fallback.totalSpeed, 60);
      assert.equal(fallback.visibleSpeed, 24);
      assert.equal(fallback.source, 'session-avg');

      // 2. Large >512KB log file where Created conversation appears near the start
      const bigLog = path.join(tmp, 'cli-big.log');
      const padding = 'INFO heartbeat line\n'.repeat(35_000); // ~700 KB
      fs.writeFileSync(bigLog, `INFO Created conversation ${convId}\n${padding}INFO trailing line\n`);
      assert.ok(fs.statSync(bigLog).size > 512 * 1024);
      assert.deepEqual(extractConversationIdsFromLogFile(bigLog), [convId]);

      // 3. Overview surfaces dual speed, orphan running PID, and hides empty non-running by default
      const ov = await buildPanelOverview({
        rootDir: cliRoot,
        range: '24h',
        authOptions: {
          tokenReader: () => ({ accessToken: 'tok', email: 'u@example.com', sourceFormat: 'macos-keychain' }),
        },
        quotaFetcher: async () => [],
        runningSessions: [
          { pid: 44444, startedAtMs: Date.now() - 5000, cwd: tmp, conversationId: null, syncStatus: 'synced', sessionAccountEmail: 'u@example.com', syncReason: 'no_drift_detected' },
        ],
      });

      assert.equal(ov.summary.hiddenEmptyCount, 1);
      assert.equal(ov.sessions.length, 2); // convId + pid-44444 (emptyId hidden)
      assert.equal(ov.sessions[0].conversationId, 'pid-44444'); // running boosted above non-running
      const convRec = ov.sessions.find(s => s.conversationId === convId);
      assert.equal(convRec.speed.totalSpeed, 92.4);
      assert.equal(convRec.speed.visibleSpeed, 38.6);
      assert.equal(ov.summary.avgOutSpeed, 92.4);
      assert.equal(ov.summary.avgNetSpeed, 38.6);

      // Including empty brings back emptyId
      const ovWithEmpty = await buildPanelOverview({
        rootDir: cliRoot,
        range: '24h',
        includeEmpty: true,
        authOptions: {
          tokenReader: () => ({ accessToken: 'tok', email: 'u@example.com', sourceFormat: 'macos-keychain' }),
        },
        quotaFetcher: async () => [],
        runningSessions: [],
      });
      assert.ok(ovWithEmpty.sessions.some(s => s.conversationId === emptyId));

      // CLI table includes OUT/NET column and strictly English text
      const cliTable = formatOverviewTable(ov, { noColor: true });
      assert.match(cliTable, /OUT\/NET/);
      assert.match(cliTable, /92\.4\/38\.6/);
      assert.equal(CJK_RE.test(cliTable), false);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('cost overview prices each turn by its own timestamp and keeps unknown models unpriced', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-check-cost-'));
    const convId = 'cccccccc-0000-0000-0000-000000000001';
    const now = Date.UTC(2026, 10, 23, 12);
    const at = (ms) => new Date(ms).toISOString();
    try {
      const logDir = path.join(tmp, 'brain', convId, '.system_generated', 'logs');
      fs.mkdirSync(logDir, { recursive: true });
      fs.writeFileSync(path.join(logDir, 'transcript.jsonl'), [
        // 20 days ago: inside 30d only. 1M uncached Hydrogen input = $1.50
        { step_index: 1, type: 'PLANNER_RESPONSE', created_at: at(now - 20 * 86_400_000), model: 'gemini-4-hydrogen-high', input_tokens: 1_000_000, cache_read_tokens: 0, output_tokens: 0 },
        // 3 days ago: inside 7d, outside 24h. 1M uncached Neon input = $3.00
        { step_index: 2, type: 'PLANNER_RESPONSE', created_at: at(now - 3 * 86_400_000), model: 'gemini-4-neon-xhigh', input_tokens: 1_000_000, cache_read_tokens: 0, output_tokens: 0 },
        // 1 hour ago: 1M cached Neon input ($0.15) + 100k output ($1.50) = $1.65
        { step_index: 3, type: 'PLANNER_RESPONSE', created_at: at(now - 3_600_000), model: 'gemini-4-neon-xhigh', input_tokens: 0, cache_read_tokens: 1_000_000, output_tokens: 100_000 },
        // 45 minutes ago: Opus served by Antigravity counts in the same total; 100k uncached input = $0.40
        { step_index: 4, type: 'PLANNER_RESPONSE', created_at: at(now - 2_700_000), model: 'claude-opus-5-5-medium', input_tokens: 100_000, cache_read_tokens: 0, output_tokens: 0 },
        // 30 minutes ago on a model without a known price
        { step_index: 5, type: 'PLANNER_RESPONSE', created_at: at(now - 1_800_000), model: 'mystery-model', input_tokens: 5_000, cache_read_tokens: 0, output_tokens: 100 },
      ].map(e => JSON.stringify(e)).join('\n') + '\n');

      const overview = (range) => buildPanelOverview({
        rootDir: tmp,
        range,
        now,
        authOptions: {
          tokenReader: () => ({ accessToken: 'tok', email: 'u@example.com', sourceFormat: 'macos-keychain' }),
        },
        quotaFetcher: async () => [],
        runningSessions: [],
      });

      const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
      const ov = await overview('24h');
      near(ov.summary.cost.range, 2.05);
      near(ov.summary.cost.byModel['gemini-4-neon-xhigh'], 1.65);
      near(ov.summary.cost.last7d, 5.05);
      near(ov.summary.cost.last30d, 6.55);
      near(ov.summary.cost.allTime, 6.55);
      near(ov.sessions[0].estimatedCostUsd, 6.55);
      assert.equal(ov.summary.cost.unpricedTurns, 1);
      assert.equal(ov.sessions[0].unpricedTurnCount, 1);

      near((await overview('7d')).summary.cost.range, 5.05);
      const ov30 = await overview('30d');
      near(ov30.summary.cost.range, 6.55);
      near(ov30.summary.cost.byModel['gemini-4-hydrogen-high'], 1.5);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
