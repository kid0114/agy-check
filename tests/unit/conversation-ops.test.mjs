import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { execFileSync } = require('node:child_process');

const {
  setTextProtoBoolField,
  readTextProtoBoolField,
  setTextProtoStringField,
  loadArchivedConversationIds,
  getSpeedCacheCandidatePaths,
  collectAllSessions,
} = require('../../runtime/panel-data.js');
const ops = require('../../runtime/conversation-ops.js');
const { detectRunningAgySessions } = require('../../runtime/account-sync.js');
const { createPanelServer } = require('../../runtime/panel-server.js');

const sqliteBin = fs.existsSync('/usr/bin/sqlite3') ? '/usr/bin/sqlite3' : 'sqlite3';
const ID_A = 'aaaaaaaa-1111-4111-8111-111111111111';
const ID_B = 'bbbbbbbb-2222-4222-8222-222222222222';

function makeRoot(ids = [ID_A, ID_B]) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-check-ops-'));
  for (const d of ['annotations', 'brain', 'conversations', 'speed-cache', 'sessions']) fs.mkdirSync(path.join(root, d));
  const dbPath = path.join(root, 'conversation_summaries.db');
  const rows = ids.map(id => `INSERT INTO conversation_summaries VALUES ('${id}', 'Title ${id.slice(0, 4)}', '', 3, '2026-11-24T12:00:00Z', '[]', NULL);`);
  execFileSync(sqliteBin, [dbPath], {
    input: [
      'PRAGMA journal_mode=WAL;',
      'CREATE TABLE conversation_summaries (conversation_id text PRIMARY KEY, title text NOT NULL DEFAULT "", preview text NOT NULL DEFAULT "", step_count integer NOT NULL DEFAULT 0, last_modified_time datetime NOT NULL, workspace_uris text NOT NULL, raw_summary BLOB);',
      ...rows,
    ].join('\n') + '\n',
    encoding: 'utf8',
  });
  for (const id of ids) {
    fs.writeFileSync(path.join(root, 'annotations', `${id}.pbtxt`), `title:"Title ${id.slice(0, 4)}"  starred:true`);
    fs.mkdirSync(path.join(root, 'brain', id));
    fs.writeFileSync(path.join(root, 'conversations', `${id}.db`), '');
    fs.writeFileSync(path.join(root, 'speed-cache', `hook-timing-${id}.json`), '{}');
    fs.writeFileSync(path.join(root, 'sessions', `${id}.json`), '{}');
  }
  return root;
}

function dbCount(root, id) {
  return Number(execFileSync(sqliteBin, ['-cmd', 'PRAGMA query_only = ON;', path.join(root, 'conversation_summaries.db'),
    `SELECT count(*) FROM conversation_summaries WHERE conversation_id='${id}';`], { encoding: 'utf8' }).trim());
}

/** Fake agy language server that mimics UpdateConversation / DeleteConversation on a tmp root. */
async function startFakeLs(root, { confirmArchive = true, csrf = 'csrf-secret' } = {}) {
  const calls = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
      const method = req.url.split('/').pop();
      calls.push({ method, body, csrf: req.headers['x-antigravity-csrf-token'] });
      if (req.headers['x-antigravity-csrf-token'] !== csrf) {
        res.writeHead(403); res.end('{}'); return;
      }
      const id = body.conversationId;
      if (method === 'UpdateConversation') {
        const ann = path.join(root, 'annotations', `${id}.pbtxt`);
        const prev = fs.existsSync(ann) ? fs.readFileSync(ann, 'utf8') : '';
        if (confirmArchive) fs.writeFileSync(ann, setTextProtoBoolField(prev, 'archived', body.annotations.archived));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ id, annotations: confirmArchive && body.annotations.archived ? { archived: true } : {} }));
        return;
      }
      if (method === 'DeleteConversation') {
        fs.rmSync(path.join(root, 'annotations', `${id}.pbtxt`), { force: true });
        fs.rmSync(path.join(root, 'brain', id), { recursive: true, force: true });
        fs.rmSync(path.join(root, 'conversations', `${id}.db`), { force: true });
        execFileSync(sqliteBin, [path.join(root, 'conversation_summaries.db')], { input: `DELETE FROM conversation_summaries WHERE conversation_id='${id}';\n`, encoding: 'utf8' });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{}');
        return;
      }
      res.writeHead(404); res.end('{}');
    });
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  return {
    calls,
    endpoint: { host: '127.0.0.1', port, csrfToken: csrf, agyPid: 4242 },
    close: () => new Promise(r => server.close(r)),
  };
}

const fastDeps = (overrides = {}) => ({ termWaitMs: 300, killWaitMs: 200, pollMs: 20, goneWaitMs: 300, ...overrides });

describe('conversation ops', () => {
  test('text-format bool helpers and archived scan', () => {
    assert.equal(setTextProtoBoolField('title:"x"', 'archived', true), 'archived:true  title:"x"');
    assert.equal(setTextProtoBoolField('archived:true  title:"x"', 'archived', false), 'archived:false  title:"x"');
    assert.equal(readTextProtoBoolField('title:"archived:true"', 'archived'), false);
    assert.equal(readTextProtoBoolField('sub { archived:true }', 'archived'), false);
    assert.equal(readTextProtoBoolField('pinned:true archived: true', 'archived'), true);
    // replacing a string field also works when the old value was a scalar
    assert.equal(setTextProtoStringField('title:x starred:true', 'title', 'Y'), 'title:"Y" starred:true');

    const root = makeRoot();
    try {
      const cache = {};
      assert.equal(loadArchivedConversationIds(root, cache).size, 0);
      fs.writeFileSync(path.join(root, 'annotations', `${ID_A}.pbtxt`), 'title:"a"  archived:true');
      fs.writeFileSync(path.join(root, 'annotations', '.agy-check-x.tmp'), 'archived:true');
      const set = loadArchivedConversationIds(root, cache);
      assert.deepEqual([...set], [ID_A]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('handoff stores a 0600 endpoint pool and live endpoints reject dead or reused ports', () => {
    const root = makeRoot([]);
    try {
      const env = { ANTIGRAVITY_LS_ADDRESS: 'localhost:50001', ANTIGRAVITY_CSRF_TOKEN: 'tok-1', ANTIGRAVITY_CONVERSATION_ID: ID_A };
      assert.equal(ops.handoffEndpoint({ rootDir: root, env: {} }).ok, false);
      assert.equal(ops.handoffEndpoint({ rootDir: root, env, deps: { listenerPid: () => null } }).ok, false);

      const listeners = new Map([[50001, 111], [50002, 222]]);
      const deps = { listenerPid: (p) => listeners.get(p) || null, isPidAlive: () => true, processCommand: () => 'agy' };
      const r1 = ops.handoffEndpoint({ rootDir: root, env, deps });
      assert.equal(r1.ok, true);
      assert.equal(r1.agyPid, 111);
      ops.handoffEndpoint({ rootDir: root, env: { ANTIGRAVITY_LS_ADDRESS: '127.0.0.1:50002', ANTIGRAVITY_CSRF_TOKEN: 'tok-2' }, deps });
      const file = ops.getEndpointsPath(root);
      assert.equal(fs.statSync(file).mode & 0o777, 0o600);
      assert.equal(ops.readEndpointPool(root).length, 2);

      let live = ops.getLiveEndpoints({ rootDir: root, env: {}, deps });
      assert.deepEqual(live.map(e => e.agyPid).sort(), [111, 222]);
      assert.deepEqual(ops.describeOps(live), { archiveAvailable: true, deleteAvailable: true, endpointCount: 2, handoffCommand: 'agy-check panel handoff' });
      assert.equal(JSON.stringify(ops.describeOps(live)).includes('tok-'), false);

      // Port 50002 now served by a different process: entry is dropped and pruned from disk.
      listeners.set(50002, 999);
      live = ops.getLiveEndpoints({ rootDir: root, env: {}, deps });
      assert.deepEqual(live.map(e => e.port), [50001]);
      assert.equal(ops.readEndpointPool(root).length, 1);

      // Env endpoint is only trusted when its listener is an agy process.
      const envOnly = { ANTIGRAVITY_LS_ADDRESS: 'localhost:50003', ANTIGRAVITY_CSRF_TOKEN: 'tok-3' };
      listeners.set(50003, 333);
      assert.equal(ops.getLiveEndpoints({ rootDir: root, env: envOnly, deps: { ...deps, processCommand: () => '/usr/bin/python3 x' } }).some(e => e.port === 50003), false);
      assert.equal(ops.getLiveEndpoints({ rootDir: root, env: envOnly, deps }).find(e => e.port === 50003)?.agyPid, 333);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('archive prefers the agy API and falls back to the annotations file', async () => {
    const root = makeRoot();
    const ls = await startFakeLs(root, { confirmArchive: false });
    try {
      // API does not confirm -> annotations file fallback, other fields preserved
      const r1 = await ops.setConversationsArchived([ID_A], true, { rootDir: root, endpoints: [ls.endpoint] });
      assert.equal(r1.ok, true);
      assert.equal(r1.results[0].via, 'annotations-file');
      assert.ok(r1.results[0].apiError);
      assert.equal(fs.readFileSync(path.join(root, 'annotations', `${ID_A}.pbtxt`), 'utf8'), 'archived:true  title:"Title aaaa"  starred:true');

      const r2 = await ops.setConversationsArchived([ID_A, 'missing-0000'], false, { rootDir: root, endpoints: [] });
      assert.equal(r2.ok, false);
      assert.equal(r2.results[0].via, 'annotations-file');
      assert.match(fs.readFileSync(path.join(root, 'annotations', `${ID_A}.pbtxt`), 'utf8'), /^archived:false/);
      assert.equal(r2.results[1].error, 'Conversation not found');

      assert.equal((await ops.setConversationsArchived([], true, { rootDir: root })).status, 400);
      assert.equal((await ops.setConversationsArchived(['pid-123'], true, { rootDir: root })).status, 400);
    } finally {
      await ls.close();
      fs.rmSync(root, { recursive: true, force: true });
    }

    const root2 = makeRoot();
    const ls2 = await startFakeLs(root2, { confirmArchive: true });
    try {
      const r = await ops.setConversationsArchived([ID_B], true, { rootDir: root2, endpoints: [ls2.endpoint] });
      assert.equal(r.results[0].via, 'agy-api');
      assert.equal(ls2.calls[0].method, 'UpdateConversation');
      assert.deepEqual(ls2.calls[0].body, { conversationId: ID_B, annotations: { archived: true } });
    } finally {
      await ls2.close();
      fs.rmSync(root2, { recursive: true, force: true });
    }
  });

  test('closeAgyProcess refuses recycled PIDs and escalates to SIGKILL', async () => {
    const signals = [];
    let alive = true;
    const recycled = await ops.closeAgyProcess(5555, fastDeps({ isPidAlive: () => true, processCommand: () => '/usr/bin/vim notes.txt', kill: (p, s) => signals.push(s) }));
    assert.equal(recycled.ok, false);
    assert.equal(signals.length, 0);

    const graceful = await ops.closeAgyProcess(5556, fastDeps({ isPidAlive: () => alive, processCommand: () => 'agy', kill: (p, s) => { signals.push(s); alive = false; } }));
    assert.deepEqual([graceful.ok, graceful.signal], [true, 'SIGTERM']);

    alive = true;
    signals.length = 0;
    const stubborn = await ops.closeAgyProcess(5557, fastDeps({ isPidAlive: () => alive, processCommand: () => 'agy --conversation x', kill: (p, s) => { signals.push(s); if (s === 'SIGKILL') alive = false; } }));
    assert.deepEqual([stubborn.ok, stubborn.signal], [true, 'SIGKILL']);
    assert.deepEqual(signals, ['SIGTERM', 'SIGKILL']);

    assert.equal((await ops.closeAgyProcess(5558, fastDeps({ isPidAlive: () => false }))).alreadyExited, true);
    assert.equal((await ops.closeAgyProcess(process.pid, fastDeps())).ok, false);
  });

  test('delete guards: confirm, endpoint, running sessions, and the endpoint provider', async () => {
    const root = makeRoot();
    try {
      const base = { rootDir: root, deps: fastDeps() };
      assert.equal((await ops.deleteConversations([ID_A], { ...base })).code, 'confirm_required');
      const noEp = await ops.deleteConversations([ID_A], { ...base, confirm: 'DELETE', endpoints: [] });
      assert.equal(noEp.status, 409);
      assert.equal(noEp.code, 'no_endpoint');
      assert.equal(noEp.handoffCommand, 'agy-check panel handoff');

      const running = [{ pid: 777, startedAtMs: 1, cwd: '/tmp/w', conversationId: 'other-conv-1', openConversationIds: [ID_A] }];
      const endpoint = { host: '127.0.0.1', port: 1, csrfToken: 't', agyPid: 4242 };
      const r = await ops.deleteConversations([ID_A, ID_B], {
        ...base, confirm: 'DELETE', endpoints: [endpoint], runningSessions: running,
        sessionInfo: new Map([[ID_A, { title: 'Alpha', isGenerating: true }]]),
      });
      assert.equal(r.code, 'running');
      assert.deepEqual(r.running, [{ conversationId: ID_A, pid: 777, startedAtMs: 1, cwd: '/tmp/w', title: 'Alpha', isGenerating: true }]);

      const providerHolds = await ops.deleteConversations([ID_A], {
        ...base, confirm: 'DELETE', closeRunning: true,
        endpoints: [{ ...endpoint, agyPid: 777 }], runningSessions: running,
      });
      assert.equal(providerHolds.code, 'endpoint_would_close');
      assert.ok(fs.existsSync(path.join(root, 'brain', ID_A)), 'nothing deleted on guard failures');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('delete closes holding windows, deletes via the API, verifies, and cleans own caches', async () => {
    const root = makeRoot();
    const ls = await startFakeLs(root);
    try {
      let alive = true;
      const killed = [];
      const res = await ops.deleteConversations([ID_A, ID_B], {
        rootDir: root,
        confirm: 'DELETE',
        closeRunning: true,
        endpoints: [ls.endpoint],
        runningSessions: [{ pid: 888, conversationId: ID_B, openConversationIds: [ID_B] }],
        deps: fastDeps({ isPidAlive: () => alive, processCommand: () => 'agy', kill: (p, s) => { killed.push([p, s]); alive = false; } }),
      });
      assert.equal(res.ok, true, JSON.stringify(res));
      assert.deepEqual(res.closedPids, [888]);
      assert.deepEqual(killed, [[888, 'SIGTERM']]);
      assert.deepEqual(ls.calls.map(c => c.method), ['DeleteConversation', 'DeleteConversation']);
      assert.ok(ls.calls.every(c => c.csrf === 'csrf-secret'));
      assert.equal(JSON.stringify(res).includes('csrf-secret'), false);
      for (const id of [ID_A, ID_B]) {
        assert.equal(dbCount(root, id), 0);
        assert.equal(fs.existsSync(path.join(root, 'speed-cache', `hook-timing-${id}.json`)), false);
        assert.equal(fs.existsSync(path.join(root, 'sessions', `${id}.json`)), false);
      }
    } finally {
      await ls.close();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('delete reports items agy claims to delete but leaves behind', async () => {
    const root = makeRoot([ID_A]);
    const server = http.createServer((req, res) => { req.resume(); req.on('end', () => { res.writeHead(200); res.end('{}'); }); });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    try {
      const res = await ops.deleteConversations([ID_A], {
        rootDir: root, confirm: 'DELETE',
        endpoints: [{ host: '127.0.0.1', port: server.address().port, csrfToken: 't', agyPid: 1 }],
        runningSessions: [], deps: fastDeps(),
      });
      assert.equal(res.ok, false);
      assert.match(res.results[0].error, /still exist: conversation database, brain directory, annotations/);
    } finally {
      await new Promise(r => server.close(r));
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('collectAllSessions hides deleted ghost rows in conversation_summaries.db and delete cleans hashed speed caches', async () => {
    const root = makeRoot([ID_A, ID_B]);
    const speedFile = getSpeedCacheCandidatePaths(ID_A, root, null).find(p => p.startsWith(root));
    fs.writeFileSync(speedFile, JSON.stringify({ speed: 12.3, source: 'hook' }));
    // Fake LS that deletes the real stores (db, brain, annotations) but leaves a stale row in conversation_summaries.db
    // (mirrors what happens when concurrent agy processes retain or re-write an old summary index row).
    const server = http.createServer((req, res) => {
      const chunks = [];
      req.on('data', c => chunks.push(c));
      req.on('end', () => {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
        const id = body.conversationId;
        fs.rmSync(path.join(root, 'annotations', `${id}.pbtxt`), { force: true });
        fs.rmSync(path.join(root, 'brain', id), { recursive: true, force: true });
        fs.rmSync(path.join(root, 'conversations', `${id}.db`), { force: true });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{}');
      });
    });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    try {
      const res = await ops.deleteConversations([ID_A], {
        rootDir: root,
        confirm: 'DELETE',
        endpoints: [{ host: '127.0.0.1', port: server.address().port, csrfToken: 't', agyPid: 1 }],
        runningSessions: [],
        deps: fastDeps(),
      });
      assert.equal(res.ok, true, JSON.stringify(res));
      assert.equal(fs.existsSync(speedFile), false, 'hashed speed-cache file should be removed on delete');
      assert.equal(dbCount(root, ID_A), 1, 'stale summary index row still exists in sqlite');

      // Orphan snapshot without backing store should also be skipped.
      fs.writeFileSync(path.join(root, 'sessions', `${ID_A}.json`), JSON.stringify({ conversationId: ID_A, updatedAt: Date.now() }));
      const { sessions } = collectAllSessions({ rootDir: root, runningSessions: [] });
      assert.equal(sessions.some(s => s.conversationId === ID_A), false, 'deleted ghost session must not appear in overview');
      assert.equal(sessions.some(s => s.conversationId === ID_B), true, 'live session must still appear');
    } finally {
      await new Promise(r => server.close(r));
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('panel server exposes ops, archived filtering, archive and delete routes', async () => {
    const root = makeRoot();
    fs.mkdirSync(path.join(root, 'brain', ID_A, '.system_generated', 'logs'), { recursive: true });
    const ls = await startFakeLs(root);
    let endpoints = [];
    const panel = createPanelServer({
      rootDir: root,
      port: 0,
      endpointsProvider: () => endpoints,
      opsDeps: fastDeps(),
      dataOptions: {
        authOptions: { tokenReader: () => null },
        runningSessions: [],
        quotaFetcher: async () => [],
      },
    });
    const { url } = await panel.listen();
    const post = (p, body) => fetch(`${url}${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    try {
      let ov = await (await fetch(`${url}/api/overview?range=all&empty=1`)).json();
      assert.deepEqual(ov.ops, { archiveAvailable: true, deleteAvailable: false, endpointCount: 0, handoffCommand: 'agy-check panel handoff' });
      const sA = ov.sessions.find(s => s.conversationId === ID_A);
      assert.deepEqual([sA.archived, sA.canArchive, sA.canDelete], [false, true, true]);

      const arch = await (await post('/api/sessions/archive', { ids: [ID_A], archived: true })).json();
      assert.equal(arch.ok, true);
      assert.equal(arch.results[0].via, 'annotations-file');
      ov = await (await fetch(`${url}/api/overview?range=all&empty=1`)).json();
      assert.equal(ov.sessions.some(s => s.conversationId === ID_A), false);
      assert.equal(ov.summary.archivedCount, 1);
      ov = await (await fetch(`${url}/api/overview?range=all&empty=1&archived=1`)).json();
      assert.equal(ov.sessions.find(s => s.conversationId === ID_A)?.archived, true);

      const noEp = await post('/api/sessions/delete', { ids: [ID_B], confirm: 'DELETE' });
      assert.equal(noEp.status, 409);
      assert.equal((await noEp.json()).code, 'no_endpoint');
      assert.equal((await post('/api/sessions/delete', { ids: [ID_B] })).status, 400);
      const bad = await fetch(`${url}/api/sessions/delete`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' }, body: '{"ids":[],"confirm":"DELETE"}' });
      assert.equal(bad.status, 403);

      endpoints = [ls.endpoint];
      // ops summary is cached for a few seconds; the delete itself always uses fresh endpoints
      const del = await (await post('/api/sessions/delete', { ids: [ID_B], confirm: 'DELETE' })).json();
      assert.equal(del.ok, true, JSON.stringify(del));
      assert.deepEqual(del.closedPids, []);
      assert.equal(dbCount(root, ID_B), 0);
    } finally {
      await panel.close();
      await ls.close();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('detectRunningAgySessions prefers presence locks over transient conversation DB handles', () => {
    const psOut = '48576 Wed Nov 25 00:03:40 2026 agy\n88571 Tue Nov 24 06:26:12 2026 agy\n';
    const lsofOut = [
      `agy 48576 u cwd DIR 1,1 0 1 /tmp/work`,
      `agy 48576 u 26u REG 1,1 1 2 /tmp/.gemini/antigravity-cli/conversations/${ID_A}.db`,
      `agy 48576 u 27u REG 1,1 1 3 /tmp/.gemini/antigravity-cli/conversations/${ID_B}.db`,
      `agy 48576 u 99u REG 1,1 0 4 /tmp/.gemini/antigravity-cli/presence/${ID_A}.lock`,
      `agy 88571 u cwd DIR 1,1 0 5 /tmp/other`,
      `agy 88571 u 88u REG 1,1 0 6 /tmp/.gemini/antigravity-cli/presence/${ID_B}.lock`,
    ].join('\n');
    const procs = detectRunningAgySessions({
      platform: 'darwin',
      psRunner: () => psOut,
      lsofRunner: () => lsofOut,
      summaries: new Map([[ID_A, { stepCount: 5 }], [ID_B, { stepCount: 3 }]]),
    });
    const p1 = procs.find(p => p.pid === 48576);
    const p2 = procs.find(p => p.pid === 88571);
    assert.equal(p1.conversationId, ID_A);
    assert.deepEqual(p1.openConversationIds, [ID_A], 'transient DB handle for ID_B must not mark ID_B as open in 48576');
    assert.equal(p2.conversationId, ID_B);
    assert.deepEqual(p2.openConversationIds, [ID_B], 'idle window with only a presence lock is still tracked as holding ID_B');
  });
});
