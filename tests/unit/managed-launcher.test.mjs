import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ml = require('../../runtime/managed-launcher.js');

const UUID_1 = '11111111-1111-4111-8111-111111111111';
const UUID_2 = '22222222-2222-4222-8222-222222222222';

function makeTempDirs() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-ml-root-'));
  const socketDir = fs.mkdtempSync(path.join('/tmp', 'agy-ml-sock-'));
  return { rootDir, socketDir };
}

function writeFakeAgyFixture(dir) {
  const scriptPath = path.join(dir, 'fake-agy.js');
  const logPath = path.join(dir, 'launches.jsonl');
  fs.writeFileSync(scriptPath, `
const fs = require('node:fs');
const logPath = process.env.FAKE_AGY_LOG;
const record = {
  pid: process.pid,
  argv: process.argv.slice(2),
  cwd: process.cwd(),
  lsAddress: process.env.ANTIGRAVITY_LS_ADDRESS || null,
  csrfToken: process.env.ANTIGRAVITY_CSRF_TOKEN || null,
  convEnv: process.env.ANTIGRAVITY_CONVERSATION_ID || null,
  keptCustom: process.env.FAKE_AGY_KEEP || null,
};
if (logPath) fs.appendFileSync(logPath, JSON.stringify(record) + '\\n');
if (process.argv.includes('--exit-fast')) {
  setTimeout(() => process.exit(7), 60);
} else {
  const timer = setInterval(() => {}, 1000);
  process.on('SIGTERM', () => {
    clearInterval(timer);
    process.exit(0);
  });
}
`, { mode: 0o755 });
  return { scriptPath, logPath };
}

function rawSocketRequest(socketPath, payload) {
  return new Promise((resolve, reject) => {
    const sock = net.createConnection(socketPath);
    let buf = '';
    sock.setEncoding('utf8');
    sock.on('error', reject);
    sock.on('connect', () => sock.write(JSON.stringify(payload) + '\n'));
    sock.on('data', chunk => {
      buf += chunk;
      const idx = buf.indexOf('\n');
      if (idx !== -1) {
        sock.destroy();
        resolve(JSON.parse(buf.slice(0, idx)));
      }
    });
  });
}

test('buildChildEnv, extractConversationIdFromArgs, and replaceManagedArgs handle edge cases cleanly', () => {
  const env = ml.buildChildEnv({
    PATH: '/usr/bin',
    KEEP_ME: '1',
    ANTIGRAVITY_LS_ADDRESS: 'localhost:55555',
    ANTIGRAVITY_CSRF_TOKEN: 'secret-token',
    ANTIGRAVITY_CONVERSATION_ID: UUID_1,
    ANTIGRAVITY_TRAJECTORY_ID: 'traj-1',
    ANTIGRAVITY_SOURCE_METADATA: 'meta',
  });
  assert.equal(env.PATH, '/usr/bin');
  assert.equal(env.KEEP_ME, '1');
  assert.equal(env.ANTIGRAVITY_LS_ADDRESS, undefined);
  assert.equal(env.ANTIGRAVITY_CSRF_TOKEN, undefined);
  assert.equal(env.ANTIGRAVITY_CONVERSATION_ID, undefined);
  assert.equal(env.ANTIGRAVITY_TRAJECTORY_ID, undefined);
  assert.equal(env.ANTIGRAVITY_SOURCE_METADATA, undefined);

  assert.equal(ml.extractConversationIdFromArgs(['--conversation=' + UUID_1]), UUID_1);
  assert.equal(ml.extractConversationIdFromArgs(['-r', UUID_2]), UUID_2);
  assert.equal(ml.extractConversationIdFromArgs(['--resume=' + UUID_1]), UUID_1);
  assert.equal(ml.extractConversationIdFromArgs(['--model', 'pro']), null);

  assert.deepEqual(
    ml.replaceManagedArgs(['--model', 'pro', '--conversation', UUID_1, '--effort=high'], { conversationId: UUID_2 }),
    ['--model', 'pro', '--effort=high', '--conversation=' + UUID_2],
  );
  // Boolean -c / --continue must NOT eat following positional arguments
  assert.deepEqual(
    ml.replaceManagedArgs(['--continue', 'keep-arg', '-c', '--model', 'flash'], { conversationId: UUID_2 }),
    ['keep-arg', '--model', 'flash', '--conversation=' + UUID_2],
  );
  assert.deepEqual(
    ml.replaceManagedArgs(['--model', 'pro'], {}),
    ['--model', 'pro'],
  );
});

test('runManagedSession supports discovery, auth guard, in-place replace, fail-closed close, and stop', async () => {
  const { rootDir, socketDir } = makeTempDirs();
  const { scriptPath, logPath } = writeFakeAgyFixture(rootDir);
  let readySession = null;
  try {
    let resolveReady;
    const readyPromise = new Promise(r => { resolveReady = r; });

    const runPromise = ml.runManagedSession({
      agyBin: process.execPath,
      agyArgs: [scriptPath, '--conversation=' + UUID_1],
      cwd: rootDir,
      ownedSurface: false,
      rootDir,
      socketDir,
      stdio: 'pipe',
      env: {
        ...process.env,
        FAKE_AGY_LOG: logPath,
        FAKE_AGY_KEEP: 'preserved',
        ANTIGRAVITY_LS_ADDRESS: 'localhost:59999',
        ANTIGRAVITY_CSRF_TOKEN: 'stale-csrf',
        ANTIGRAVITY_CONVERSATION_ID: UUID_1,
      },
      onReady(summary) {
        readySession = summary;
        resolveReady(summary);
      },
    });

    await readyPromise;
    assert.ok(readySession);
    assert.equal(readySession.controlToken, undefined);
    assert.equal(readySession.conversationId, UUID_1);
    assert.equal(readySession.ownedSurface, false);

    // Verify 0o700 dir and 0o600 metadata + socket permissions on Unix
    const sessionsDir = ml.getManagedSessionsDir(rootDir);
    const metaFile = path.join(sessionsDir, `${readySession.sessionId}.json`);
    if (process.platform !== 'win32') {
      assert.equal(fs.statSync(sessionsDir).mode & 0o777, 0o700);
      assert.equal(fs.statSync(metaFile).mode & 0o777, 0o600);
      assert.equal(fs.statSync(readySession.socketPath).mode & 0o777, 0o600);
      assert.equal(fs.statSync(path.dirname(readySession.socketPath)).mode & 0o777, 0o700);
    }

    // Discovery returns live session without controlToken
    const listed = await ml.listManagedSessions({ rootDir });
    assert.equal(listed.length, 1);
    assert.equal(listed[0].sessionId, readySession.sessionId);
    assert.equal(listed[0].controlToken, undefined);
    const byPid = await ml.findManagedSessionByChildPid(readySession.childPid, { rootDir });
    assert.equal(byPid?.sessionId, readySession.sessionId);

    // Unauthorized token rejected on raw socket
    const unauth = await rawSocketRequest(readySession.socketPath, { token: '0'.repeat(64), action: 'status' });
    assert.equal(unauth.ok, false);
    assert.equal(unauth.code, 'unauthorized');

    // 'close' MUST fail closed when ownedSurface is false, keeping child alive
    const deniedClose = await ml.sendManagedCommand(readySession.sessionId, 'close', {}, { rootDir });
    assert.equal(deniedClose.ok, false);
    assert.equal(deniedClose.code, 'not_owned_surface');
    const stillAlive = await ml.sendManagedCommand(readySession.sessionId, 'status', {}, { rootDir });
    assert.equal(stillAlive.ok, true);
    assert.equal(stillAlive.session.childPid, readySession.childPid);

    // Wait until the first fake child has booted and written its launch record
    for (let i = 0; i < 60; i += 1) {
      if (fs.existsSync(logPath) && fs.readFileSync(logPath, 'utf8').trim().length > 0) break;
      await new Promise(r => setTimeout(r, 25));
    }

    // In-place 'replace' swaps child PID, updates conversation arg, strips stale env, keeps sessionId
    const rep = await ml.sendManagedCommand(readySession.childPid, 'replace', {
      args: [scriptPath, '--conversation=' + UUID_2],
    }, { rootDir });
    assert.equal(rep.ok, true);
    assert.equal(rep.sessionId, readySession.sessionId);
    assert.equal(rep.previousChildPid, readySession.childPid);
    assert.notEqual(rep.childPid, readySession.childPid);
    assert.equal(rep.conversationId, UUID_2);

    // Verify fixture logs show sanitized env and updated conversation arg on both launches
    let launches = [];
    for (let i = 0; i < 60; i += 1) {
      if (fs.existsSync(logPath)) {
        const raw = fs.readFileSync(logPath, 'utf8').trim();
        launches = raw ? raw.split('\n').map(l => JSON.parse(l)) : [];
        if (launches.length >= 2) break;
      }
      await new Promise(r => setTimeout(r, 25));
    }
    assert.equal(launches.length, 2);
    assert.equal(launches[0].lsAddress, null);
    assert.equal(launches[0].csrfToken, null);
    assert.equal(launches[0].keptCustom, 'preserved');
    assert.equal(launches[1].pid, rep.childPid);
    assert.deepEqual(launches[1].argv, ['--conversation=' + UUID_2]);
    assert.equal(launches[1].lsAddress, null);
    assert.equal(launches[1].csrfToken, null);

    // 'stop' cleanly stops child and removes socket + metadata with exitCode 0
    const stopped = await ml.sendManagedCommand(readySession.sessionId, 'stop', {}, { rootDir });
    assert.equal(stopped.ok, true);
    assert.equal(stopped.stoppedChildPid, rep.childPid);

    const finalResult = await runPromise;
    assert.equal(finalResult.exitCode, 0);
    assert.equal(finalResult.reason, 'stopped');
    assert.equal(fs.existsSync(metaFile), false);
    assert.equal(fs.existsSync(readySession.socketPath), false);
  } finally {
    if (readySession) {
      await ml.sendManagedCommand(readySession.sessionId, 'stop', {}, { rootDir }).catch(() => {});
    }
    fs.rmSync(rootDir, { recursive: true, force: true });
    fs.rmSync(socketDir, { recursive: true, force: true });
  }
});

test('ownedSurface close exits cleanly with code 0, normal exit cleans up, and dead stale records are pruned', async () => {
  const { rootDir, socketDir } = makeTempDirs();
  const { scriptPath, logPath } = writeFakeAgyFixture(rootDir);
  try {
    // 1. Owned surface allows 'close' and resolves exitCode 0
    let resolveReady;
    const readyPromise = new Promise(r => { resolveReady = r; });
    const runOwned = ml.runManagedSession({
      agyBin: process.execPath,
      agyArgs: [scriptPath],
      cwd: rootDir,
      ownedSurface: true,
      rootDir,
      socketDir,
      stdio: 'pipe',
      env: { ...process.env, FAKE_AGY_LOG: logPath },
      onReady(summary) { resolveReady(summary); },
    });
    const owned = await readyPromise;
    const closed = await ml.sendManagedCommand(owned.sessionId, 'close', {}, { rootDir });
    assert.equal(closed.ok, true);
    assert.equal(closed.closing, true);
    assert.equal(closed.exitCode, 0);
    const ownedRes = await runOwned;
    assert.equal(ownedRes.exitCode, 0);
    assert.equal(ownedRes.reason, 'closed');

    // 2. Normal child exit propagates exit code and cleans up files
    const fastRes = await ml.runManagedSession({
      agyBin: process.execPath,
      agyArgs: [scriptPath, '--exit-fast'],
      cwd: rootDir,
      ownedSurface: true,
      rootDir,
      socketDir,
      stdio: 'pipe',
      env: { ...process.env, FAKE_AGY_LOG: logPath },
    });
    assert.equal(fastRes.exitCode, 7);
    assert.equal(fastRes.reason, 'child_exit');
    assert.equal(fs.readdirSync(ml.getManagedSessionsDir(rootDir)).length, 0);

    // 3. Stale dead metadata file is pruned by listManagedSessions
    const staleId = 'deadbeef01234567';
    const staleFile = path.join(ml.getManagedSessionsDir(rootDir), `${staleId}.json`);
    fs.writeFileSync(staleFile, JSON.stringify({
      version: 1,
      sessionId: staleId,
      launcherPid: 999999,
      childPid: 999998,
      ownedSurface: true,
      cwd: rootDir,
      command: 'agy',
      args: [],
      conversationId: null,
      socketPath: path.join(socketDir, `agy-ms-${process.getuid?.() ?? 0}`, `s-${staleId}.sock`),
      controlToken: 'a'.repeat(64),
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      state: 'running',
    }), { mode: 0o600 });
    const afterPrune = await ml.listManagedSessions({ rootDir });
    assert.equal(afterPrune.length, 0);
    assert.equal(fs.existsSync(staleFile), false);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
    fs.rmSync(socketDir, { recursive: true, force: true });
  }
});
