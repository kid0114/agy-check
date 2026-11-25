import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const vault = require('../../runtime/account-vault.js');
const { createPanelServer } = require('../../runtime/panel-server.js');
const { KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT, ANTIGRAVITY_TOKEN_FILENAME } = require('../../runtime/quota/token.js');

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'agy-vault-test-'));
}

function makeBlob({
  email,
  accessToken = 'ya29.test-token-' + email,
  refreshToken = '1//test-refresh-' + email,
  expiry = new Date(Date.now() + 3600_000).toISOString(),
  extraField = 'keep-me',
  base64Wrap = true,
}) {
  const payload = {
    token: {
      access_token: accessToken,
      token_type: 'Bearer',
      ...(refreshToken !== null ? { refresh_token: refreshToken } : {}),
      expiry,
      expires_in: 3599,
    },
    auth_method: 'consumer',
    id_token_email: email,
    extra_preserved_field: extraField,
  };
  const rawJson = JSON.stringify(payload);
  return base64Wrap
    ? 'go-keyring-base64:' + Buffer.from(rawJson, 'utf8').toString('base64')
    : rawJson;
}

function makeMemoryStore(initial = {}) {
  const map = new Map(Object.entries(initial));
  const writes = [];
  let failWriteFor = null;
  let readErrorFor = null;

  return {
    platform: 'darwin',
    supported: true,
    reason: null,
    map,
    writes,
    setFailWriteFor(key) { failWriteFor = key; },
    setReadErrorFor(key) { readErrorFor = key; },
    readRaw(service, account) {
      const k = `${service}:${account}`;
      if (readErrorFor === k) return { status: 'error', error: 'Keychain locked' };
      if (!map.has(k)) return { status: 'missing' };
      return { status: 'ok', raw: map.get(k) };
    },
    writeRaw(service, account, raw, meta = {}) {
      const k = `${service}:${account}`;
      writes.push({ service, account, isLiveSlot: Boolean(meta.isLiveSlot), len: raw.length });
      if (failWriteFor === k) return { ok: false, error: 'Simulated write failure' };
      map.set(k, raw);
      return { ok: true };
    },
    deleteRaw(service, account) {
      const k = `${service}:${account}`;
      const existed = map.delete(k);
      return { ok: true, alreadyMissing: !existed };
    },
  };
}

function httpRequest(port, method, pathname, { headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body !== null ? (typeof body === 'string' ? body : JSON.stringify(body)) : null;
    const req = http.request({
      host: '127.0.0.1',
      port,
      method,
      path: pathname,
      headers: {
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
        ...headers,
      },
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = JSON.parse(text); } catch {}
        resolve({ status: res.statusCode, headers: res.headers, text, json });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

test('parseCredentialBlob preserves raw blob and extracts metadata cleanly', () => {
  const now = Date.parse('2026-11-25T12:00:00Z');
  const fresh = makeBlob({ email: 'Alice@Example.com', expiry: '2026-11-25T13:00:00Z' });
  const p = vault.parseCredentialBlob(fresh, now);
  assert.equal(p.ok, true);
  assert.equal(p.raw, fresh);
  assert.equal(p.email, 'alice@example.com');
  assert.equal(p.expired, false);
  assert.equal(p.hasRefreshToken, true);
  assert.ok(p.refreshTokenHash);

  const stale = makeBlob({ email: 'bob@example.com', expiry: '2026-11-25T11:55:00Z' });
  const p2 = vault.parseCredentialBlob(stale, now);
  assert.equal(p2.ok, true);
  assert.equal(p2.expired, true);

  assert.equal(vault.parseCredentialBlob('not-json', now).ok, false);
  assert.equal(vault.parseCredentialBlob('line1\nline2', now).ok, false);
});

test('scrubSecretText redacts keyring blobs, access tokens, refresh tokens and JWTs', () => {
  const sample = 'err go-keyring-base64:YWJjMTIz ya29.abc_DEF-123 1//refresh_XYZ eyJhbGciOi.eyJlbWFpbCI6.sig123';
  const cleaned = vault.scrubSecretText(sample);
  assert.equal(cleaned.includes('YWJjMTIz'), false);
  assert.equal(cleaned.includes('ya29.'), false);
  assert.equal(cleaned.includes('1//'), false);
  assert.equal(cleaned.includes('eyJhbGci'), false);
});

test('createMacosKeychainStore uses -U without -A on existing live item and -A only on new live item', () => {
  const calls = [];
  const backing = new Map();

  const mockExec = (bin, args, opts) => {
    calls.push({ bin, args, input: opts?.input || null });
    if (args[0] === 'find-generic-password') {
      const s = args[args.indexOf('-s') + 1];
      const a = args[args.indexOf('-a') + 1];
      const k = `${s}:${a}`;
      if (!backing.has(k)) {
        const err = new Error('not found');
        err.status = 44;
        throw err;
      }
      return args.includes('-w') ? backing.get(k) : 'attributes';
    }
    if (args[0] === '-i') {
      const line = String(opts.input || '').trim();
      const s = line.match(/-s "([^"]+)"/)[1];
      const a = line.match(/-a "([^"]+)"/)[1];
      const w = line.match(/-w "([^"]+)"/)[1];
      backing.set(`${s}:${a}`, w);
      return '';
    }
    if (args[0] === 'delete-generic-password') {
      const s = args[args.indexOf('-s') + 1];
      const a = args[args.indexOf('-a') + 1];
      backing.delete(`${s}:${a}`);
      return '';
    }
    throw new Error(`unexpected args: ${args.join(' ')}`);
  };

  const store = vault.createMacosKeychainStore({ securityPath: '/usr/bin/security', execFileSync: mockExec });
  const blob1 = makeBlob({ email: 'a@example.com' });
  const blob2 = makeBlob({ email: 'b@example.com' });

  // 1. Live item does NOT exist yet -> create with -A, never passing secret in argv
  const r1 = store.writeRaw(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT, blob1, { isLiveSlot: true });
  assert.equal(r1.ok, true);
  const write1 = calls.find(c => c.args[0] === '-i');
  assert.ok(write1.input.includes(' -A'));
  assert.equal(write1.args.includes(blob1), false);

  // 2. Live item NOW exists -> update with -U and WITHOUT -A (preserves ACL, zero macOS prompt)
  calls.length = 0;
  const r2 = store.writeRaw(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT, blob2, { isLiveSlot: true });
  assert.equal(r2.ok, true);
  const write2 = calls.find(c => c.args[0] === '-i');
  assert.ok(write2.input.includes(' -U '));
  assert.equal(write2.input.includes(' -A'), false);
  assert.equal(write2.args.includes(blob2), false);
});

test('saveCurrentAccount, switchSavedAccount and removeSavedAccount enforce backup, monotonicity, and byte-exactness', async () => {
  const rootDir = makeTempRoot();
  const now = Date.parse('2026-11-25T12:00:00Z');
  const blobA1 = makeBlob({ email: 'a@example.com', accessToken: 'ya29.a1', expiry: '2026-11-25T13:00:00Z' });
  const blobA2 = makeBlob({ email: 'a@example.com', accessToken: 'ya29.a2-newer', expiry: '2026-11-25T14:00:00Z' });
  const blobAOld = makeBlob({ email: 'a@example.com', accessToken: 'ya29.a0-stale', expiry: '2026-11-25T12:30:00Z' });
  const blobBExpired = makeBlob({ email: 'b@example.com', accessToken: 'ya29.b-exp', expiry: '2026-11-25T10:00:00Z' });

  const store = makeMemoryStore({
    [`${KEYCHAIN_SERVICE}:${KEYCHAIN_ACCOUNT}`]: blobA1,
  });

  try {
    // Save A1
    const sA = await vault.saveCurrentAccount({ rootDir, store, now, label: 'Main' });
    assert.equal(sA.ok, true);
    assert.equal(sA.email, 'a@example.com');
    assert.equal(sA.isNew, true);
    assert.equal(store.map.get(`${vault.VAULT_SERVICE}:a@example.com`), blobA1);

    // Log into B (expired access_token) and save B
    store.map.set(`${KEYCHAIN_SERVICE}:${KEYCHAIN_ACCOUNT}`, blobBExpired);
    const sB = await vault.saveCurrentAccount({ rootDir, store, now });
    assert.equal(sB.ok, true);
    assert.equal(sB.email, 'b@example.com');
    assert.equal(sB.expired, true);

    // Simulate switching back to A (valid token) with stale disk files present
    fs.writeFileSync(path.join(rootDir, ANTIGRAVITY_TOKEN_FILENAME), '{}');
    fs.writeFileSync(path.join(rootDir, 'agy-hud-quota-cache.json'), '{}');
    let refreshedCount = 0;
    const swToA = await vault.switchSavedAccount('a@example.com', {
      rootDir,
      store,
      now,
      quotaRefresher: async () => { refreshedCount += 1; return { ok: true }; },
    });
    assert.equal(swToA.ok, true);
    assert.equal(swToA.alreadyActive, false);
    assert.equal(swToA.previousEmail, 'b@example.com');
    assert.equal(swToA.canUndo, true);
    assert.equal(swToA.quotaRefreshed, true);
    assert.equal(refreshedCount, 1);
    assert.equal(store.map.get(`${KEYCHAIN_SERVICE}:${KEYCHAIN_ACCOUNT}`), blobA1);
    assert.equal(fs.existsSync(path.join(rootDir, ANTIGRAVITY_TOKEN_FILENAME)), false);
    assert.equal(fs.existsSync(path.join(rootDir, 'agy-hud-quota-cache.json')), false);

    // While on A, agy refreshes live Keychain to newer A2; switching to B must auto-backup A2 to A's slot
    store.map.set(`${KEYCHAIN_SERVICE}:${KEYCHAIN_ACCOUNT}`, blobA2);
    const swToB = await vault.switchSavedAccount('b@example.com', {
      rootDir,
      store,
      now,
      quotaRefresher: async () => { refreshedCount += 1; return { ok: true }; },
    });
    assert.equal(swToB.ok, true);
    assert.equal(swToB.backedUpPrevious, true);
    assert.equal(swToB.refreshNeeded, true);
    assert.equal(swToB.quotaRefreshed, false); // Path A: skip quota refresh on expired access_token
    assert.equal(refreshedCount, 1);
    assert.equal(store.map.get(`${vault.VAULT_SERVICE}:a@example.com`), blobA2);
    assert.equal(store.map.get(`${KEYCHAIN_SERVICE}:${KEYCHAIN_ACCOUNT}`), blobBExpired);

    // Stale agy window silently overwrites live Keychain back to old A0!
    // Switching back to B must decode email from live blob (a@example.com, NOT b@example.com)
    // AND refuse to downgrade A2 -> A0 in A's vault slot!
    store.map.set(`${KEYCHAIN_SERVICE}:${KEYCHAIN_ACCOUNT}`, blobAOld);
    const swMonotonic = await vault.switchSavedAccount('b@example.com', { rootDir, store, now, refreshQuota: false });
    assert.equal(swMonotonic.ok, true);
    assert.equal(swMonotonic.previousEmail, 'a@example.com');
    assert.equal(swMonotonic.backedUpPrevious, false);
    assert.equal(swMonotonic.backupSkippedReason, 'older_expiry_downgrade');
    assert.equal(store.map.get(`${vault.VAULT_SERVICE}:a@example.com`), blobA2);

    // Remove B from vault -> active agy Keychain slot MUST remain untouched
    const rmB = await vault.removeSavedAccount('b@example.com', { rootDir, store });
    assert.equal(rmB.ok, true);
    assert.equal(rmB.removed, true);
    assert.equal(store.map.has(`${vault.VAULT_SERVICE}:b@example.com`), false);
    assert.equal(store.map.get(`${KEYCHAIN_SERVICE}:${KEYCHAIN_ACCOUNT}`), blobBExpired);

    // Prepare sign-in for a new account: backs up current active B first, clears live slot, triggers launcher
    let launched = 0;
    const prep = await vault.prepareSignInNewAccount({
      rootDir,
      store,
      now,
      terminalLauncher: () => { launched += 1; return { launched: true, helper: 'mock' }; },
    });
    assert.equal(prep.ok, true);
    assert.equal(prep.backedUpEmail, 'b@example.com');
    assert.equal(prep.launchedTerminal, true);
    assert.equal(launched, 1);
    assert.equal(store.map.get(`${vault.VAULT_SERVICE}:b@example.com`), blobBExpired);
    assert.equal(store.map.has(`${KEYCHAIN_SERVICE}:${KEYCHAIN_ACCOUNT}`), false);

    // Fail-closed: if backing up active account fails, live slot MUST NOT be deleted
    store.map.set(`${KEYCHAIN_SERVICE}:${KEYCHAIN_ACCOUNT}`, blobA2);
    store.setFailWriteFor(`${vault.VAULT_SERVICE}:a@example.com`);
    const prepFail = await vault.prepareSignInNewAccount({
      rootDir,
      store,
      now,
      terminalLauncher: () => { launched += 1; return { launched: true }; },
    });
    assert.equal(prepFail.ok, false);
    assert.equal(store.map.get(`${KEYCHAIN_SERVICE}:${KEYCHAIN_ACCOUNT}`), blobA2);
    store.setFailWriteFor(null);

    // Status reflects A & B saved, active slot holds A2
    const st = vault.getVaultStatus({ rootDir, store, now });
    assert.equal(st.activeEmail, 'a@example.com');
    assert.equal(st.activeSaved, true);
    assert.equal(st.accounts.length, 2);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('panel server enforces strict local capability token, rejects forwarded proxies and paired phones on vault routes', async () => {
  const rootDir = makeTempRoot();
  const blobA = makeBlob({ email: 'demo@example.com' });
  const blobB = makeBlob({ email: 'backup@example.com' });
  const store = makeMemoryStore({
    [`${KEYCHAIN_SERVICE}:${KEYCHAIN_ACCOUNT}`]: blobA,
  });

  let signInLaunches = 0;
  const panel = createPanelServer({
    rootDir,
    port: 0,
    lan: false,
    lsEndpoint: false,
    vaultOptions: {
      store,
      terminalLauncher: () => { signInLaunches += 1; return { launched: true, helper: 'mock' }; },
    },
    quotaRefresher: async () => ({ ok: true }),
    dataOptions: {
      authOptions: {
        tokenReader: () => {
          const r = store.readRaw(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT);
          if (r.status !== 'ok') return null;
          const p = vault.parseCredentialBlob(r.raw);
          return p.ok ? { accessToken: 'tok', expiry: p.expiry, email: p.email, sourceFormat: 'macos-keychain' } : null;
        },
        cachedEmailReader: () => null,
      },
      quotaFetcher: async () => [],
      runningSessions: [],
    },
  });

  const info = await panel.listen();
  try {
    // 1. Local GET / includes agy-local-token meta tag
    const homeLocal = await httpRequest(info.port, 'GET', '/', { headers: { Host: `127.0.0.1:${info.port}` } });
    assert.equal(homeLocal.status, 200);
    const tokMatch = homeLocal.text.match(/<meta name="agy-local-token" content="([^"]+)">/);
    assert.ok(tokMatch, 'local HTML should embed agy-local-token');
    const localToken = tokMatch[1];

    // 2. Proxied loopback request (X-Forwarded-For) must NOT receive agy-local-token meta tag or overview.vault
    const homeProxied = await httpRequest(info.port, 'GET', '/', {
      headers: { Host: `127.0.0.1:${info.port}`, 'X-Forwarded-For': '203.0.113.9' },
    });
    assert.equal(homeProxied.text.includes('<meta name="agy-local-token"'), false);
    assert.equal(homeProxied.text.includes(localToken), false);

    const ovProxied = await httpRequest(info.port, 'GET', '/api/overview', {
      headers: { Host: `127.0.0.1:${info.port}`, 'X-Forwarded-For': '203.0.113.9' },
    });
    assert.equal(ovProxied.status, 200);
    assert.equal(ovProxied.json.vault, undefined);

    // 3. Vault POST without token, with wrong origin, with X-Forwarded-For, or with phone cookie -> 403
    const badNoTok = await httpRequest(info.port, 'POST', '/api/accounts/save', {
      headers: { Host: `127.0.0.1:${info.port}`, Origin: `http://127.0.0.1:${info.port}` },
      body: {},
    });
    assert.equal(badNoTok.status, 403);

    const badProxied = await httpRequest(info.port, 'POST', '/api/accounts/save', {
      headers: {
        Host: `127.0.0.1:${info.port}`,
        Origin: `http://127.0.0.1:${info.port}`,
        'X-Agy-Local-Token': localToken,
        'X-Forwarded-For': '10.0.0.5',
      },
      body: {},
    });
    assert.equal(badProxied.status, 403);

    const badCookie = await httpRequest(info.port, 'POST', '/api/accounts/save', {
      headers: {
        Host: `127.0.0.1:${info.port}`,
        Origin: `http://127.0.0.1:${info.port}`,
        'X-Agy-Local-Token': localToken,
        Cookie: 'agy_check_session=some-phone-cookie',
      },
      body: {},
    });
    assert.equal(badCookie.status, 403);

    // 4. Genuine local desktop request succeeds and never leaks secrets
    const saveA = await httpRequest(info.port, 'POST', '/api/accounts/save', {
      headers: {
        Host: `127.0.0.1:${info.port}`,
        Origin: `http://127.0.0.1:${info.port}`,
        'X-Agy-Local-Token': localToken,
      },
      body: { label: 'Primary' },
    });
    assert.equal(saveA.status, 200);
    assert.equal(saveA.json.ok, true);
    assert.equal(saveA.json.email, 'demo@example.com');
    assert.equal(saveA.text.includes('ya29.'), false);
    assert.equal(saveA.text.includes('1//'), false);

    // Save B and switch back to A through HTTP
    store.map.set(`${KEYCHAIN_SERVICE}:${KEYCHAIN_ACCOUNT}`, blobB);
    const saveB = await httpRequest(info.port, 'POST', '/api/accounts/save', {
      headers: {
        Host: `127.0.0.1:${info.port}`,
        Origin: `http://127.0.0.1:${info.port}`,
        'X-Agy-Local-Token': localToken,
      },
      body: {},
    });
    assert.equal(saveB.status, 200);

    const sw = await httpRequest(info.port, 'POST', '/api/accounts/switch', {
      headers: {
        Host: `127.0.0.1:${info.port}`,
        Origin: `http://127.0.0.1:${info.port}`,
        'X-Agy-Local-Token': localToken,
      },
      body: { email: 'demo@example.com' },
    });
    assert.equal(sw.status, 200);
    assert.equal(sw.json.ok, true);
    assert.equal(sw.json.email, 'demo@example.com');
    assert.equal(sw.json.canUndo, true);
    assert.equal(sw.text.includes('ya29.'), false);

    const ovLocal = await httpRequest(info.port, 'GET', '/api/overview', {
      headers: { Host: `127.0.0.1:${info.port}` },
    });
    assert.equal(ovLocal.status, 200);
    assert.equal(ovLocal.json.vault.supported, true);
    assert.equal(ovLocal.json.vault.activeEmail, 'demo@example.com');
    assert.equal(ovLocal.json.vault.accounts.length, 2);
    assert.equal(ovLocal.text.includes('ya29.'), false);

    // 5. /api/accounts/sign-in rejects proxied/missing-token requests and works locally
    const badSignIn = await httpRequest(info.port, 'POST', '/api/accounts/sign-in', {
      headers: {
        Host: `127.0.0.1:${info.port}`,
        Origin: `http://127.0.0.1:${info.port}`,
        'X-Agy-Local-Token': localToken,
        'X-Forwarded-For': '10.0.0.5',
      },
      body: { launchTerminal: true },
    });
    assert.equal(badSignIn.status, 403);

    const signInRes = await httpRequest(info.port, 'POST', '/api/accounts/sign-in', {
      headers: {
        Host: `127.0.0.1:${info.port}`,
        Origin: `http://127.0.0.1:${info.port}`,
        'X-Agy-Local-Token': localToken,
      },
      body: { launchTerminal: true },
    });
    assert.equal(signInRes.status, 200);
    assert.equal(signInRes.json.ok, true);
    assert.equal(signInRes.json.backedUpEmail, 'demo@example.com');
    assert.equal(signInRes.json.launchedTerminal, true);
    assert.equal(signInLaunches, 1);
    assert.equal(store.map.has(`${KEYCHAIN_SERVICE}:${KEYCHAIN_ACCOUNT}`), false);
    assert.equal(signInRes.text.includes('ya29.'), false);
    assert.equal(signInRes.text.includes('1//'), false);
  } finally {
    await panel.close();
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});
