'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawn } = require('child_process');
const { resolveAntigravityPath, resolveSafeExecutable } = require('./paths.js');
const {
  KEYCHAIN_SERVICE,
  KEYCHAIN_ACCOUNT,
  ANTIGRAVITY_TOKEN_FILENAME,
  WINDOWS_TOKEN_EXPIRY_SKEW_MS,
  decodeKeyringRaw,
  extractEmailFromIdToken,
  normalizeExpiryDate,
  clearTokenTemp,
} = require('./quota/token.js');
const { getTokenHash, withCacheLock } = require('./quota/cache.js');
const { readAccountState, writeAccountState } = require('./account-sync.js');
const { refreshQuotaNow } = require('./quota.js');

const VAULT_SERVICE = 'agy-check-vault';
const VAULT_META_FILENAME = 'agy-check-vault-meta.json';
const VAULT_LOCK_FILENAME = 'agy-check-vault.lock';
const LOCK_STALE_MS = 20_000;
const LOCK_WAIT_MS = 4_000;
const EMAIL_RE = /^[^\s@"'\\]+@[^\s@"'\\]+\.[^\s@"'\\]+$/;

let _inProcessTail = Promise.resolve();

function normalizeEmail(email) {
  const s = String(email || '').trim().toLowerCase();
  if (!s || s.length > 254 || !EMAIL_RE.test(s)) return null;
  return s;
}

function getVaultMetaPath(rootDir = null) {
  if (rootDir) return path.join(rootDir, VAULT_META_FILENAME);
  return resolveAntigravityPath(VAULT_META_FILENAME);
}

function getVaultLockPath(rootDir = null) {
  if (rootDir) return path.join(rootDir, VAULT_LOCK_FILENAME);
  return resolveAntigravityPath(VAULT_LOCK_FILENAME);
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function scrubSecretText(text) {
  if (!text) return '';
  return String(text)
    .replace(/go-keyring-base64:[A-Za-z0-9+/=_-]+/g, '[redacted-keyring-blob]')
    .replace(/ya29\.[A-Za-z0-9._-]+/g, '[redacted-access-token]')
    .replace(/1\/\/[A-Za-z0-9._-]+/g, '[redacted-refresh-token]')
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[redacted-jwt]')
    .trim();
}

function parseCredentialBlob(raw, now = Date.now()) {
  if (typeof raw !== 'string') return { ok: false, error: 'Credential blob must be a string' };
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, error: 'Credential blob is empty' };
  if (/[\r\n\0]/.test(trimmed)) return { ok: false, error: 'Credential blob contains unsupported control characters' };

  const decoded = decodeKeyringRaw(trimmed);
  if (!decoded || typeof decoded !== 'object') {
    return { ok: false, error: 'Credential payload is not valid JSON' };
  }

  const inner = (decoded.token && typeof decoded.token === 'object') ? decoded.token : decoded;
  const accessToken = typeof inner.access_token === 'string' && inner.access_token.trim()
    ? inner.access_token.trim()
    : null;
  if (!accessToken) {
    return { ok: false, error: 'Credential payload is missing access_token' };
  }

  const refreshToken = typeof inner.refresh_token === 'string' && inner.refresh_token.trim()
    ? inner.refresh_token.trim()
    : null;

  const rawEmail = (typeof decoded.id_token_email === 'string' && decoded.id_token_email.includes('@'))
    ? decoded.id_token_email
    : ((typeof decoded.email === 'string' && decoded.email.includes('@'))
      ? decoded.email
      : extractEmailFromIdToken(decoded.id_token || inner.id_token));
  const email = normalizeEmail(rawEmail);

  const expiry = normalizeExpiryDate(inner.expiry || inner.expiry_date || decoded.expiry || decoded.expiry_date) || null;
  const expiryMsRaw = expiry ? Date.parse(expiry) : NaN;
  const expiryMs = Number.isFinite(expiryMsRaw) ? expiryMsRaw : null;
  const expired = expiryMs !== null ? (expiryMs - WINDOWS_TOKEN_EXPIRY_SKEW_MS <= now) : false;

  return {
    ok: true,
    raw: trimmed,
    email,
    expiry,
    expiryMs,
    expired,
    hasRefreshToken: Boolean(refreshToken),
    refreshTokenHash: refreshToken ? sha256Hex(refreshToken).slice(0, 24) : null,
    tokenHash: getTokenHash({ accessToken }),
    authMethod: typeof decoded.auth_method === 'string' ? decoded.auth_method : null,
  };
}

function escapeSecurityArg(str) {
  return `"${String(str).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function createMacosKeychainStore(options = {}) {
  const securityPath = options.securityPath || resolveSafeExecutable('security') || '/usr/bin/security';
  const execFn = options.execFileSync || execFileSync;

  const isAvailable = () => {
    try {
      return Boolean(securityPath) && fs.existsSync(securityPath);
    } catch {
      return false;
    }
  };

  const exists = (service, account) => {
    try {
      execFn(securityPath, ['find-generic-password', '-s', service, '-a', account], {
        encoding: 'utf8',
        timeout: 5000,
        stdio: ['ignore', 'ignore', 'ignore'],
      });
      return true;
    } catch {
      return false;
    }
  };

  const readRaw = (service, account) => {
    try {
      const out = execFn(securityPath, ['find-generic-password', '-s', service, '-a', account, '-w'], {
        encoding: 'utf8',
        timeout: 5000,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const raw = String(out || '').trim();
      if (!raw) return { status: 'missing' };
      return { status: 'ok', raw };
    } catch (err) {
      if (err && err.status === 44) return { status: 'missing' };
      const msg = scrubSecretText(err?.stderr || err?.message || 'Keychain read failed');
      if (/could not be found|SecKeychainSearchCopyNext/i.test(msg)) {
        return { status: 'missing' };
      }
      return { status: 'error', error: msg || 'Keychain read failed' };
    }
  };

  const writeRaw = (service, account, raw, { isLiveSlot = false } = {}) => {
    if (typeof raw !== 'string' || !raw.trim() || /[\r\n\0]/.test(raw)) {
      return { ok: false, error: 'Invalid credential format for Keychain write' };
    }
    const trimmed = raw.trim();
    const alreadyExists = exists(service, account);
    // For the live agy slot: update in place with -U (NO -A) when it already exists so
    // macOS preserves the existing ACL/partition list without prompting for a password.
    // Only pass -A when creating a brand-new live slot so agy can read it.
    const parts = [
      'add-generic-password',
      ...(alreadyExists || !isLiveSlot ? ['-U'] : []),
      '-s', escapeSecurityArg(service),
      '-a', escapeSecurityArg(account),
      '-w', escapeSecurityArg(trimmed),
      ...(!alreadyExists && isLiveSlot ? ['-A'] : []),
    ];
    const cmdLine = `${parts.join(' ')}\n`;
    try {
      execFn(securityPath, ['-i'], {
        input: cmdLine,
        encoding: 'utf8',
        timeout: 8000,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (err) {
      const msg = scrubSecretText(err?.stderr || err?.message || 'Keychain write failed');
      return { ok: false, error: msg || 'Keychain write failed' };
    }

    // Mandatory post-write byte-exact read-back verification (security -i can swallow errors).
    const verify = readRaw(service, account);
    if (verify.status !== 'ok' || verify.raw !== trimmed) {
      return {
        ok: false,
        error: verify.status === 'error'
          ? `Keychain verification failed: ${verify.error}`
          : 'Keychain post-write verification mismatch',
      };
    }
    return { ok: true };
  };

  const deleteRaw = (service, account) => {
    try {
      execFn(securityPath, ['delete-generic-password', '-s', service, '-a', account], {
        encoding: 'utf8',
        timeout: 5000,
        stdio: ['ignore', 'ignore', 'pipe'],
      });
      return { ok: true };
    } catch (err) {
      if (err && err.status === 44) return { ok: true, alreadyMissing: true };
      const msg = scrubSecretText(err?.stderr || err?.message || 'Keychain delete failed');
      if (/could not be found|SecKeychainSearchCopyNext/i.test(msg)) {
        return { ok: true, alreadyMissing: true };
      }
      return { ok: false, error: msg || 'Keychain delete failed' };
    }
  };

  return {
    platform: 'darwin',
    supported: isAvailable(),
    reason: isAvailable() ? null : '/usr/bin/security is unavailable',
    readRaw,
    writeRaw,
    deleteRaw,
  };
}

function createLinuxSecretStore(options = {}) {
  const execFn = options.execFileSync || execFileSync;
  const env = options.env || process.env;
  const secretTool = options.secretToolPath || resolveSafeExecutable('secret-tool');
  const hasDbus = Boolean(String(env.DBUS_SESSION_BUS_ADDRESS || '').trim());
  const available = Boolean(secretTool && hasDbus);

  const readRaw = (service, account) => {
    if (!available) return { status: 'error', error: 'Linux Secret Service (secret-tool + D-Bus) is unavailable' };
    try {
      const out = execFn(secretTool, ['lookup', 'service', service, 'username', account], {
        encoding: 'utf8',
        timeout: 5000,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const raw = String(out || '').trim();
      if (!raw) return { status: 'missing' };
      return { status: 'ok', raw };
    } catch (err) {
      if (err && err.status === 1 && !String(err.stderr || '').trim()) {
        return { status: 'missing' };
      }
      return { status: 'error', error: scrubSecretText(err?.stderr || err?.message || 'secret-tool lookup failed') };
    }
  };

  const writeRaw = (service, account, raw) => {
    if (!available) return { ok: false, error: 'Linux Secret Service (secret-tool + D-Bus) is unavailable' };
    const trimmed = String(raw || '').trim();
    if (!trimmed) return { ok: false, error: 'Empty credential payload' };
    try {
      execFn(secretTool, [
        'store',
        `--label=Password for '${account}' on '${service}'`,
        'service', service,
        'username', account,
      ], {
        input: trimmed,
        encoding: 'utf8',
        timeout: 8000,
        stdio: ['pipe', 'ignore', 'pipe'],
      });
    } catch (err) {
      return { ok: false, error: scrubSecretText(err?.stderr || err?.message || 'secret-tool store failed') };
    }
    const verify = readRaw(service, account);
    if (verify.status !== 'ok' || verify.raw !== trimmed) {
      return { ok: false, error: 'Secret Service post-write verification mismatch' };
    }
    return { ok: true };
  };

  const deleteRaw = (service, account) => {
    if (!available) return { ok: false, error: 'Linux Secret Service (secret-tool + D-Bus) is unavailable' };
    try {
      execFn(secretTool, ['clear', 'service', service, 'username', account], {
        encoding: 'utf8',
        timeout: 5000,
        stdio: ['ignore', 'ignore', 'pipe'],
      });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: scrubSecretText(err?.stderr || err?.message || 'secret-tool clear failed') };
    }
  };

  return {
    platform: 'linux',
    supported: available,
    reason: available ? null : 'Linux credential switching requires secret-tool and an active D-Bus session',
    readRaw,
    writeRaw,
    deleteRaw,
  };
}

function getPlatformStore(options = {}) {
  if (options.store) return options.store;
  const platform = options.platform || process.platform;
  if (platform === 'darwin') return createMacosKeychainStore(options);
  if (platform === 'linux') return createLinuxSecretStore(options);
  return {
    platform,
    supported: false,
    reason: 'Saved account switching is currently supported on macOS Keychain (and Linux Secret Service with secret-tool).',
    readRaw: () => ({ status: 'error', error: 'Unsupported platform' }),
    writeRaw: () => ({ ok: false, error: 'Unsupported platform' }),
    deleteRaw: () => ({ ok: false, error: 'Unsupported platform' }),
  };
}

function readVaultMeta(rootDir = null) {
  const metaPath = getVaultMetaPath(rootDir);
  try {
    const raw = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    if (raw && typeof raw === 'object' && raw.accounts && typeof raw.accounts === 'object') {
      const cleaned = {};
      for (const [k, v] of Object.entries(raw.accounts)) {
        const email = normalizeEmail(v?.email || k);
        if (!email || !v || typeof v !== 'object') continue;
        cleaned[email] = {
          email,
          label: typeof v.label === 'string' && v.label.trim() ? v.label.trim().slice(0, 60) : null,
          savedAt: typeof v.savedAt === 'number' ? v.savedAt : null,
          updatedAt: typeof v.updatedAt === 'number' ? v.updatedAt : null,
          lastSwitchedAt: typeof v.lastSwitchedAt === 'number' ? v.lastSwitchedAt : null,
          expiry: typeof v.expiry === 'string' ? v.expiry : null,
          expiryMs: typeof v.expiryMs === 'number' ? v.expiryMs : (typeof v.expiry === 'string' && Number.isFinite(Date.parse(v.expiry)) ? Date.parse(v.expiry) : null),
          hasRefreshToken: Boolean(v.hasRefreshToken),
          refreshTokenHash: typeof v.refreshTokenHash === 'string' ? v.refreshTokenHash : null,
          tokenHash: typeof v.tokenHash === 'string' ? v.tokenHash : null,
          authMethod: typeof v.authMethod === 'string' ? v.authMethod : null,
        };
      }
      return {
        version: 1,
        activationGen: Number.isInteger(raw.activationGen) && raw.activationGen >= 0 ? raw.activationGen : 0,
        lastActivationAt: typeof raw.lastActivationAt === 'number' && Number.isFinite(raw.lastActivationAt) ? raw.lastActivationAt : null,
        accounts: cleaned,
      };
    }
  } catch {
    // No metadata file yet
  }
  return { version: 1, activationGen: 0, lastActivationAt: null, accounts: {} };
}

function writeVaultMeta(meta, rootDir = null) {
  const metaPath = getVaultMetaPath(rootDir);
  const dir = path.dirname(metaPath);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  try { fs.chmodSync(dir, 0o700); } catch {}
  const tmpPath = `${metaPath}.${process.pid}.${Date.now()}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  const payload = JSON.stringify({
    version: 1,
    updatedAt: Date.now(),
    activationGen: Number.isInteger(meta.activationGen) && meta.activationGen >= 0 ? meta.activationGen : 0,
    lastActivationAt: typeof meta.lastActivationAt === 'number' && Number.isFinite(meta.lastActivationAt) ? meta.lastActivationAt : null,
    accounts: meta.accounts || {},
  }, null, 2);
  try {
    fs.writeFileSync(tmpPath, payload, { mode: 0o600 });
    fs.chmodSync(tmpPath, 0o600);
    fs.renameSync(tmpPath, metaPath);
    return true;
  } catch (err) {
    try { fs.unlinkSync(tmpPath); } catch {}
    throw err;
  }
}

/**
 * Extracts a private in-memory token snapshot from a verified raw credential blob
 * for binding a fenced quota request. Never return this object in HTTP/CLI payloads.
 */
function extractTokenSnapshot(raw) {
  const decoded = decodeKeyringRaw(String(raw || '').trim());
  if (!decoded || typeof decoded !== 'object') return null;
  const inner = (decoded.token && typeof decoded.token === 'object') ? decoded.token : decoded;
  const accessToken = typeof inner.access_token === 'string' && inner.access_token.trim()
    ? inner.access_token.trim()
    : null;
  if (!accessToken) return null;
  const rawEmail = (typeof decoded.id_token_email === 'string' && decoded.id_token_email.includes('@'))
    ? decoded.id_token_email
    : ((typeof decoded.email === 'string' && decoded.email.includes('@'))
      ? decoded.email
      : extractEmailFromIdToken(decoded.id_token || inner.id_token));
  const email = normalizeEmail(rawEmail);
  const expiry = normalizeExpiryDate(inner.expiry || inner.expiry_date || decoded.expiry || decoded.expiry_date) || null;
  return {
    accessToken,
    email,
    expiry,
    sourceFormat: 'vault-switch',
  };
}

function isActivationCurrent({ rootDir = null, store, expectedEmail, expectedGen = null, nowFn = () => Date.now() }) {
  if (Number.isInteger(expectedGen)) {
    const meta = readVaultMeta(rootDir);
    if (meta.activationGen !== expectedGen) return false;
  }
  const liveRes = store.readRaw(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT);
  if (liveRes.status !== 'ok') return false;
  const liveParsed = parseCredentialBlob(liveRes.raw, nowFn());
  if (!liveParsed.ok || liveParsed.expired) return false;
  if (expectedEmail && liveParsed.email !== expectedEmail) return false;
  return true;
}

function isPidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err && err.code === 'EPERM';
  }
}

async function acquireFileLock(lockPath, waitMs = LOCK_WAIT_MS) {
  fs.mkdirSync(path.dirname(lockPath), { recursive: true, mode: 0o700 });
  const deadline = Date.now() + waitMs;
  while (true) {
    try {
      const fd = fs.openSync(lockPath, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY, 0o600);
      try {
        fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, at: Date.now() }));
      } finally {
        fs.closeSync(fd);
      }
      return () => {
        try { fs.unlinkSync(lockPath); } catch {}
      };
    } catch (err) {
      if (!err || err.code !== 'EEXIST') throw err;
      // Check if lock is stale or owner PID is dead
      try {
        const stat = fs.statSync(lockPath);
        let stale = Date.now() - stat.mtimeMs > LOCK_STALE_MS;
        if (!stale) {
          try {
            const info = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
            if (info && Number.isInteger(info.pid) && !isPidAlive(info.pid)) {
              stale = true;
            }
          } catch {}
        }
        if (stale) {
          try { fs.unlinkSync(lockPath); } catch {}
          continue;
        }
      } catch {
        continue;
      }
      if (Date.now() >= deadline) {
        throw new Error('Another account vault operation is currently in progress. Please retry.');
      }
      await new Promise(r => setTimeout(r, 60));
    }
  }
}

async function withVaultLock(rootDir, fn) {
  let releaseInProcess;
  const prev = _inProcessTail;
  _inProcessTail = new Promise(resolve => { releaseInProcess = resolve; });
  await prev;
  let releaseFile = null;
  try {
    releaseFile = await acquireFileLock(getVaultLockPath(rootDir));
    return await fn();
  } finally {
    if (releaseFile) releaseFile();
    releaseInProcess();
  }
}

/**
 * Monotonic guard: prevents an older token (e.g. written back by a stale agy window)
 * from downgrading a fresher saved slot unless refresh_token changed or force is set.
 */
function shouldUpdateVaultSlot(existingMeta, incomingParsed, { force = false } = {}) {
  if (force || !existingMeta) return { allow: true, reason: 'new_or_forced' };
  if (incomingParsed.refreshTokenHash && existingMeta.refreshTokenHash &&
      incomingParsed.refreshTokenHash !== existingMeta.refreshTokenHash) {
    return { allow: true, reason: 'refresh_token_changed' };
  }
  if (incomingParsed.refreshTokenHash && !existingMeta.refreshTokenHash) {
    return { allow: true, reason: 'gained_refresh_token' };
  }
  if (existingMeta.hasRefreshToken && !incomingParsed.hasRefreshToken) {
    return { allow: false, reason: 'missing_refresh_token_downgrade' };
  }
  if (typeof incomingParsed.expiryMs === 'number' && typeof existingMeta.expiryMs === 'number') {
    if (incomingParsed.expiryMs < existingMeta.expiryMs) {
      return { allow: false, reason: 'older_expiry_downgrade' };
    }
  }
  return { allow: true, reason: 'newer_or_equal' };
}

function clearLocalTokenCaches(rootDir = null) {
  const baseDir = rootDir || resolveAntigravityPath('');
  const tokenFile = path.join(baseDir, ANTIGRAVITY_TOKEN_FILENAME);
  const cacheFile = path.join(baseDir, 'agy-hud-quota-cache.json');
  const cacheLockPath = `${cacheFile}.lock`;
  try {
    if (fs.existsSync(tokenFile)) fs.unlinkSync(tokenFile);
  } catch {}
  // Strict lock hierarchy: Vault Lock -> Cache Lock. Removing the shared quota
  // cache under Cache Lock (after activationGen has already been committed) makes
  // concurrent cache commits either finish before deletion or abort at beforeCommit().
  withCacheLock(() => {
    try {
      if (fs.existsSync(cacheFile)) fs.unlinkSync(cacheFile);
    } catch {}
  }, { blocking: true, waitMs: 500, lockPath: cacheLockPath });
  clearTokenTemp([baseDir]);
}

function getVaultStatus(options = {}) {
  const { rootDir = null, now = Date.now(), liveEmailHint = null } = options;
  const store = getPlatformStore(options);
  const meta = readVaultMeta(rootDir);

  let liveParsed = null;
  let liveReadError = null;
  if (store.supported) {
    const liveRes = store.readRaw(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT);
    if (liveRes.status === 'ok') {
      const parsed = parseCredentialBlob(liveRes.raw, now);
      if (parsed.ok) liveParsed = parsed;
      else liveReadError = parsed.error;
    } else if (liveRes.status === 'error') {
      liveReadError = liveRes.error;
    }
  }

  const activeEmail = liveParsed?.email || normalizeEmail(liveEmailHint) || null;
  const accounts = Object.values(meta.accounts)
    .map(entry => {
      const isActive = Boolean(activeEmail && entry.email === activeEmail);
      const effExpiry = isActive && liveParsed?.expiry ? liveParsed.expiry : entry.expiry;
      const effExpiryMs = isActive && typeof liveParsed?.expiryMs === 'number' ? liveParsed.expiryMs : entry.expiryMs;
      const expired = typeof effExpiryMs === 'number' ? (effExpiryMs - WINDOWS_TOKEN_EXPIRY_SKEW_MS <= now) : false;
      const hasRefresh = isActive && liveParsed ? liveParsed.hasRefreshToken : entry.hasRefreshToken;
      let status = 'ready';
      if (isActive) status = 'active';
      else if (expired) status = 'refresh_needed';
      return {
        email: entry.email,
        label: entry.label || null,
        savedAt: entry.savedAt,
        updatedAt: entry.updatedAt,
        lastSwitchedAt: entry.lastSwitchedAt,
        expiry: effExpiry,
        expired,
        hasRefreshToken: hasRefresh,
        isActive,
        status,
      };
    })
    .sort((a, b) => {
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
      const tA = a.lastSwitchedAt || a.updatedAt || a.savedAt || 0;
      const tB = b.lastSwitchedAt || b.updatedAt || b.savedAt || 0;
      if (tB !== tA) return tB - tA;
      return a.email.localeCompare(b.email);
    });

  return {
    supported: store.supported,
    platform: store.platform,
    reason: store.reason || null,
    activeEmail,
    activeSaved: Boolean(activeEmail && meta.accounts[activeEmail]),
    activeExpired: liveParsed ? liveParsed.expired : false,
    activeHasRefreshToken: liveParsed ? liveParsed.hasRefreshToken : false,
    liveReadError,
    accounts,
  };
}

async function saveCurrentAccount(options = {}) {
  const { rootDir = null, label = null, force = false } = options;
  const nowProvided = typeof options.now === 'number';
  const store = getPlatformStore(options);
  if (!store.supported) {
    return { ok: false, status: 501, error: store.reason || 'Credential vault is not supported on this platform' };
  }

  return withVaultLock(rootDir, async () => {
    const now = nowProvided ? options.now : Date.now();
    const liveRes = store.readRaw(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT);
    if (liveRes.status === 'missing') {
      return { ok: false, status: 404, error: 'No active agy login found in system keyring. Sign in via agy first.' };
    }
    if (liveRes.status === 'error') {
      return { ok: false, status: 500, error: liveRes.error || 'Could not read active agy login from system keyring.' };
    }

    const parsed = parseCredentialBlob(liveRes.raw, now);
    if (!parsed.ok) {
      return { ok: false, status: 422, error: parsed.error };
    }
    if (!parsed.email) {
      return {
        ok: false,
        status: 422,
        error: 'Active agy credential does not contain an account email; cannot safely index it in the vault.',
      };
    }

    const meta = readVaultMeta(rootDir);
    const existing = meta.accounts[parsed.email] || null;
    const mono = shouldUpdateVaultSlot(existing, parsed, { force });
    let keptNewer = false;

    if (mono.allow) {
      const writeRes = store.writeRaw(VAULT_SERVICE, parsed.email, parsed.raw, { isLiveSlot: false });
      if (!writeRes.ok) {
        return { ok: false, status: 500, error: writeRes.error || 'Failed to save credential to vault.' };
      }
      meta.accounts[parsed.email] = {
        email: parsed.email,
        label: typeof label === 'string' && label.trim() ? label.trim().slice(0, 60) : (existing?.label || null),
        savedAt: existing?.savedAt || now,
        updatedAt: now,
        lastSwitchedAt: existing?.lastSwitchedAt || null,
        expiry: parsed.expiry,
        expiryMs: parsed.expiryMs,
        hasRefreshToken: parsed.hasRefreshToken,
        refreshTokenHash: parsed.refreshTokenHash,
        tokenHash: parsed.tokenHash,
        authMethod: parsed.authMethod,
      };
      writeVaultMeta(meta, rootDir);
    } else {
      keptNewer = true;
      if (typeof label === 'string' && label.trim()) {
        existing.label = label.trim().slice(0, 60);
        writeVaultMeta(meta, rootDir);
      }
    }

    return {
      ok: true,
      email: parsed.email,
      isNew: !existing,
      keptNewer,
      keptReason: keptNewer ? mono.reason : null,
      expiry: meta.accounts[parsed.email].expiry,
      expired: parsed.expired,
      hasRefreshToken: meta.accounts[parsed.email].hasRefreshToken,
    };
  });
}

async function switchSavedAccount(targetEmailRaw, options = {}) {
  const {
    rootDir = null,
    refreshQuota = true,
    quotaRefresher = null,
    clearCaches = true,
  } = options;
  const nowProvided = typeof options.now === 'number';
  const store = getPlatformStore(options);
  if (!store.supported) {
    return { ok: false, status: 501, error: store.reason || 'Credential vault is not supported on this platform' };
  }

  const targetEmail = normalizeEmail(targetEmailRaw);
  if (!targetEmail) {
    return { ok: false, status: 400, error: 'Valid target email is required.' };
  }

  let capturedSnapshot = null;
  let capturedTokenHash = null;
  const switchResult = await withVaultLock(rootDir, async () => {
    const now = nowProvided ? options.now : Date.now();
    const meta = readVaultMeta(rootDir);
    const targetMeta = meta.accounts[targetEmail];
    if (!targetMeta) {
      return { ok: false, status: 404, error: `Account "${targetEmail}" is not saved in the vault.` };
    }

    const targetRes = store.readRaw(VAULT_SERVICE, targetEmail);
    if (targetRes.status === 'missing') {
      return { ok: false, status: 404, error: `Saved credential for "${targetEmail}" is missing from the system keyring. Sign in via agy and save it again.` };
    }
    if (targetRes.status === 'error') {
      return { ok: false, status: 500, error: targetRes.error || 'Could not read saved credential from system keyring.' };
    }
    const targetParsed = parseCredentialBlob(targetRes.raw, now);
    if (!targetParsed.ok) {
      return { ok: false, status: 422, error: `Saved credential for "${targetEmail}" is malformed: ${targetParsed.error}` };
    }
    if (targetParsed.email && targetParsed.email !== targetEmail) {
      return { ok: false, status: 409, error: `Saved credential mismatch: vault slot "${targetEmail}" holds credentials for "${targetParsed.email}".` };
    }

    // 1. Read live agy slot and auto-backup keyed strictly by the email decoded from the live blob.
    const liveRes = store.readRaw(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT);
    if (liveRes.status === 'error') {
      return { ok: false, status: 500, error: `Could not read current active agy login before switching: ${liveRes.error}` };
    }

    let previousEmail = null;
    let backedUpPrevious = false;
    let backupSkippedReason = null;

    if (liveRes.status === 'ok') {
      const liveParsed = parseCredentialBlob(liveRes.raw, now);
      if (liveParsed.ok && liveParsed.email) {
        previousEmail = liveParsed.email;
        if (liveParsed.email === targetEmail) {
          return {
            ok: true,
            alreadyActive: true,
            email: targetEmail,
            previousEmail,
            canUndo: false,
            expired: liveParsed.expired,
            hasRefreshToken: liveParsed.hasRefreshToken,
            refreshNeeded: liveParsed.expired,
            quotaRefreshed: false,
            activationGen: meta.activationGen || 0,
          };
        }
        const prevSlot = meta.accounts[liveParsed.email];
        if (prevSlot) {
          const mono = shouldUpdateVaultSlot(prevSlot, liveParsed);
          if (mono.allow) {
            const bkRes = store.writeRaw(VAULT_SERVICE, liveParsed.email, liveParsed.raw, { isLiveSlot: false });
            if (!bkRes.ok) {
              return {
                ok: false,
                status: 500,
                error: `Refused to switch: failed to back up current active account "${liveParsed.email}" first (${bkRes.error}).`,
              };
            }
            meta.accounts[liveParsed.email] = {
              ...prevSlot,
              updatedAt: now,
              expiry: liveParsed.expiry,
              expiryMs: liveParsed.expiryMs,
              hasRefreshToken: liveParsed.hasRefreshToken,
              refreshTokenHash: liveParsed.refreshTokenHash,
              tokenHash: liveParsed.tokenHash,
              authMethod: liveParsed.authMethod,
            };
            backedUpPrevious = true;
          } else {
            backupSkippedReason = mono.reason;
          }
        }
      }
    }

    // 2. Commit the active agy slot LAST, with mandatory byte-exact read-back verification.
    const commitRes = store.writeRaw(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT, targetParsed.raw, { isLiveSlot: true });
    if (!commitRes.ok) {
      return {
        ok: false,
        status: 500,
        error: `Failed to write "${targetEmail}" to active agy keyring: ${commitRes.error}`,
      };
    }

    // 3. Advance monotonic activation generation & persist metadata/account-state under lock
    //    BEFORE clearing the quota cache under Cache Lock so concurrent cache writers either
    //    finish before deletion or observe the new activationGen inside beforeCommit().
    const commitNow = nowProvided ? options.now : Date.now();
    meta.activationGen = (Number.isInteger(meta.activationGen) ? meta.activationGen : 0) + 1;
    meta.lastActivationAt = commitNow;
    meta.accounts[targetEmail] = {
      ...targetMeta,
      lastSwitchedAt: commitNow,
      expiry: targetParsed.expiry,
      expiryMs: targetParsed.expiryMs,
      hasRefreshToken: targetParsed.hasRefreshToken,
      refreshTokenHash: targetParsed.refreshTokenHash,
      tokenHash: targetParsed.tokenHash,
      authMethod: targetParsed.authMethod,
    };
    writeVaultMeta(meta, rootDir);

    const prevState = readAccountState(rootDir);
    const history = Array.isArray(prevState?.history) ? [...prevState.history] : [];
    history.unshift({
      email: targetEmail,
      previousEmail,
      observedAt: commitNow,
      switched: Boolean(previousEmail && previousEmail !== targetEmail),
      via: 'panel-vault',
    });
    writeAccountState({
      version: 1,
      activeEmail: targetEmail,
      tokenHash: targetParsed.tokenHash,
      switchedAt: commitNow,
      updatedAt: commitNow,
      history: history.slice(0, 20),
    }, rootDir);

    // 4. Clear stale disk token & single-account quota caches under Cache Lock.
    if (clearCaches) {
      clearLocalTokenCaches(rootDir);
    }

    capturedSnapshot = extractTokenSnapshot(targetParsed.raw);
    capturedTokenHash = targetParsed.tokenHash;

    return {
      ok: true,
      alreadyActive: false,
      email: targetEmail,
      previousEmail,
      canUndo: Boolean(previousEmail && meta.accounts[previousEmail]),
      backedUpPrevious,
      backupSkippedReason,
      expiry: targetParsed.expiry,
      expired: targetParsed.expired,
      hasRefreshToken: targetParsed.hasRefreshToken,
      refreshNeeded: targetParsed.expired,
      quotaRefreshed: false,
      activationGen: meta.activationGen,
    };
  });

  if (!switchResult.ok || switchResult.alreadyActive) {
    return switchResult;
  }

  // 5. Refresh live quota outside the vault lock when target access_token is fresh (Path A),
  //    bound to the captured credential snapshot and fenced against activationGen/live slot.
  if (refreshQuota && !switchResult.expired) {
    const commitFence = () => isActivationCurrent({
      rootDir,
      store,
      expectedEmail: targetEmail,
      expectedGen: switchResult.activationGen,
      nowFn: () => (nowProvided ? options.now : Date.now()),
    });
    if (commitFence()) {
      try {
        const refreshCtx = {
          roots: rootDir ? [rootDir] : undefined,
          tokenSnapshot: capturedSnapshot,
          expectedEmail: targetEmail,
          expectedTokenHash: capturedTokenHash,
          activationGen: switchResult.activationGen,
          commitFence,
        };
        const runRefresh = quotaRefresher
          ? () => quotaRefresher(refreshCtx)
          : () => refreshQuotaNow(refreshCtx);
        const qRes = await runRefresh();
        switchResult.quotaRefreshed = Boolean(qRes && qRes.ok !== false && !qRes.error && commitFence());
      } catch {
        switchResult.quotaRefreshed = false;
      }
    }
  }

  return switchResult;
}

function runAgyModelsRefresh(options = {}) {
  const agyBin = options.agyBin || process.env.AGY_BIN || 'agy';
  const timeoutMs = Number.isFinite(options.timeoutMs) && options.timeoutMs > 0 ? options.timeoutMs : 8000;
  const childEnv = { ...process.env };
  delete childEnv.ANTIGRAVITY_LS_ADDRESS;
  delete childEnv.ANTIGRAVITY_CSRF_TOKEN;
  delete childEnv.ANTIGRAVITY_CONVERSATION_ID;
  delete childEnv.ANTIGRAVITY_TRAJECTORY_ID;

  return new Promise((resolve) => {
    let settled = false;
    let spawned = false;
    let timedOut = false;
    let lastError = null;
    let killTimer = null;
    let child;
    const useProcessGroup = process.platform !== 'win32';
    try {
      child = spawn(agyBin, ['models'], {
        stdio: 'ignore',
        env: childEnv,
        detached: useProcessGroup,
        windowsHide: true,
      });
    } catch (err) {
      resolve({ ok: false, exitCode: null, timedOut: false, error: err?.message || 'spawn_failed' });
      return;
    }

    const done = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      resolve(result);
    };

    const signalTree = (sig) => {
      if (useProcessGroup && Number.isInteger(child.pid) && child.pid > 0) {
        try {
          process.kill(-child.pid, sig);
          return;
        } catch {}
      }
      try { child.kill(sig); } catch {}
    };

    const isGroupAlive = () => {
      if (!useProcessGroup || !Number.isInteger(child.pid) || child.pid <= 0) return false;
      try {
        process.kill(-child.pid, 0);
        return true;
      } catch (err) {
        return Boolean(err && err.code === 'EPERM');
      }
    };

    const waitForGroupDrain = (onDrained) => {
      if (!isGroupAlive()) {
        onDrained();
        return;
      }
      const killDeadline = Date.now() + 500;
      let escalated = false;
      const poll = () => {
        if (!isGroupAlive()) {
          onDrained();
          return;
        }
        if (!escalated && Date.now() >= killDeadline) {
          escalated = true;
          signalTree('SIGKILL');
          setTimeout(onDrained, 100);
          return;
        }
        setTimeout(poll, 40);
      };
      setTimeout(poll, 40);
    };

    const timer = setTimeout(() => {
      timedOut = true;
      signalTree('SIGTERM');
      killTimer = setTimeout(() => {
        signalTree('SIGKILL');
      }, 500);
    }, timeoutMs);

    child.once('spawn', () => {
      spawned = true;
    });
    child.on('error', (err) => {
      lastError = err?.message || 'child_error';
      // Once spawned, wait strictly for 'close' so withVaultLock is NEVER released
      // while the child process could still be alive and writing to Keychain.
      if (!spawned && !child.pid) {
        done({ ok: false, exitCode: null, timedOut, error: lastError });
      }
    });
    // Always await child exit/reaping (and on timeout, full process-group teardown)
    // BEFORE returning so withVaultLock is never released while any descendant could
    // still write to the live keyring slot.
    child.once('close', (code) => {
      const finish = () => done({
        ok: code === 0 && !timedOut,
        exitCode: code,
        timedOut,
        error: timedOut ? 'timeout' : (code === 0 ? null : lastError),
      });
      if (timedOut && isGroupAlive()) {
        waitForGroupDrain(finish);
      } else {
        finish();
      }
    });
  });
}

/**
 * Serialized post-switch refresh for an expired saved account (Switch-only path).
 * Holds withVaultLock across the single 0-token `agy models` call and waits for
 * full child exit before releasing the lock, preventing live Keychain clobbering
 * against a subsequent Undo or Switch. Enforces `expectedGen` against ABA switches,
 * persists verified-fresh blobs monotonically back to vault (including when already
 * refreshed externally), and runs a single snapshot-bound, fenced quota refresh
 * outside the lock.
 */
async function refreshExpiredActiveAccount(expectedEmailRaw, options = {}) {
  const {
    rootDir = null,
    expectedGen = null,
    refreshQuota = true,
    quotaRefresher = null,
    modelsRunner = runAgyModelsRefresh,
    timeoutMs = 8000,
    nowFn = () => Date.now(),
  } = options;
  const expectedEmail = normalizeEmail(expectedEmailRaw);
  if (!expectedEmail) return { ok: false, skipped: 'invalid_email', quotaRefreshed: false };

  const store = getPlatformStore(options);
  if (!store.supported) return { ok: false, skipped: 'unsupported', quotaRefreshed: false };

  let capturedSnapshot = null;
  const lockOutcome = await withVaultLock(rootDir, async () => {
    const t0 = nowFn();
    let meta = readVaultMeta(rootDir);
    if (Number.isInteger(expectedGen) && meta.activationGen !== expectedGen) {
      return { ok: true, skipped: 'superseded_generation', refreshed: false, vaultUpdated: false, email: expectedEmail };
    }

    const beforeRes = store.readRaw(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT);
    if (beforeRes.status !== 'ok') return { ok: true, skipped: 'no_live_slot', refreshed: false, vaultUpdated: false };
    const beforeParsed = parseCredentialBlob(beforeRes.raw, t0);
    if (!beforeParsed.ok || beforeParsed.email !== expectedEmail) {
      return { ok: true, skipped: 'superseded', refreshed: false, vaultUpdated: false };
    }

    let alreadyFresh = false;
    let afterParsed = beforeParsed;
    let t1 = t0;

    if (beforeParsed.expired) {
      if (!beforeParsed.hasRefreshToken) {
        return { ok: false, skipped: 'no_refresh_token', refreshed: false, vaultUpdated: false, email: expectedEmail };
      }
      await modelsRunner({ agyBin: options.agyBin, timeoutMs });

      // Re-read vault generation and live Keychain regardless of exit code.
      t1 = nowFn();
      meta = readVaultMeta(rootDir);
      if (Number.isInteger(expectedGen) && meta.activationGen !== expectedGen) {
        return { ok: true, refreshed: false, vaultUpdated: false, skipped: 'superseded_generation', email: expectedEmail };
      }
      const afterRes = store.readRaw(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT);
      if (afterRes.status !== 'ok') {
        return { ok: true, refreshed: false, vaultUpdated: false, email: expectedEmail, reason: 'live_slot_missing' };
      }
      afterParsed = parseCredentialBlob(afterRes.raw, t1);
      if (!afterParsed.ok || afterParsed.email !== expectedEmail) {
        return { ok: true, refreshed: false, vaultUpdated: false, skipped: 'superseded_after_run' };
      }
      if (afterParsed.expired) {
        return { ok: true, refreshed: false, vaultUpdated: false, email: expectedEmail, reason: 'still_expired' };
      }
    } else {
      alreadyFresh = true;
    }

    // Shared verified-fresh persistence path (runs for both refreshed AND alreadyFresh
    // so an externally refreshed token is monotonically persisted back into the vault).
    const existing = meta.accounts[expectedEmail] || {
      email: expectedEmail,
      label: null,
      savedAt: t1,
      updatedAt: t1,
      lastSwitchedAt: t1,
    };
    const mono = shouldUpdateVaultSlot(existing, afterParsed);
    let vaultUpdated = false;
    if (mono.allow) {
      const existingVaultRes = store.readRaw(VAULT_SERVICE, expectedEmail);
      const needsVaultWrite = existingVaultRes.status !== 'ok' || existingVaultRes.raw !== afterParsed.raw;
      if (needsVaultWrite) {
        const wRes = store.writeRaw(VAULT_SERVICE, expectedEmail, afterParsed.raw, { isLiveSlot: false });
        if (wRes.ok) {
          vaultUpdated = true;
        }
      }
      // Only update vault-meta when the vault keyring entry actually matches afterParsed
      // (never record unsaved credentials if store.writeRaw failed).
      const vaultSynced = !needsVaultWrite || vaultUpdated;
      if (vaultSynced && (vaultUpdated || existing.tokenHash !== afterParsed.tokenHash || existing.expiry !== afterParsed.expiry)) {
        meta.accounts[expectedEmail] = {
          ...existing,
          updatedAt: t1,
          expiry: afterParsed.expiry,
          expiryMs: afterParsed.expiryMs,
          hasRefreshToken: afterParsed.hasRefreshToken,
          refreshTokenHash: afterParsed.refreshTokenHash,
          tokenHash: afterParsed.tokenHash,
          authMethod: afterParsed.authMethod,
        };
        writeVaultMeta(meta, rootDir);
      }
    }

    const prevState = readAccountState(rootDir);
    writeAccountState({
      version: 1,
      activeEmail: expectedEmail,
      tokenHash: afterParsed.tokenHash,
      switchedAt: prevState?.switchedAt || t1,
      updatedAt: t1,
      history: Array.isArray(prevState?.history) ? prevState.history.slice(0, 20) : [],
    }, rootDir);

    capturedSnapshot = extractTokenSnapshot(afterParsed.raw);

    return {
      ok: true,
      refreshed: !alreadyFresh,
      alreadyFresh,
      vaultUpdated,
      email: expectedEmail,
      expiry: afterParsed.expiry,
      tokenHash: afterParsed.tokenHash,
      activationGen: meta.activationGen,
    };
  });

  if (!lockOutcome.ok || (!lockOutcome.refreshed && !lockOutcome.alreadyFresh)) {
    return { ...lockOutcome, quotaRefreshed: false };
  }

  let quotaRefreshed = false;
  if (refreshQuota) {
    const effectiveGen = Number.isInteger(expectedGen) ? expectedGen : lockOutcome.activationGen;
    const commitFence = () => isActivationCurrent({
      rootDir,
      store,
      expectedEmail,
      expectedGen: effectiveGen,
      nowFn,
    });
    if (commitFence()) {
      try {
        const refreshCtx = {
          roots: rootDir ? [rootDir] : undefined,
          tokenSnapshot: capturedSnapshot,
          expectedEmail,
          expectedTokenHash: lockOutcome.tokenHash,
          activationGen: effectiveGen,
          commitFence,
        };
        const runRefresh = quotaRefresher
          ? () => quotaRefresher(refreshCtx)
          : () => refreshQuotaNow(refreshCtx);
        const qRes = await runRefresh();
        quotaRefreshed = Boolean(qRes && qRes.ok !== false && !qRes.error && commitFence());
      } catch {
        quotaRefreshed = false;
      }
    }
  }

  return { ...lockOutcome, quotaRefreshed };
}

async function removeSavedAccount(targetEmailRaw, options = {}) {
  const { rootDir = null } = options;
  const store = getPlatformStore(options);
  if (!store.supported) {
    return { ok: false, status: 501, error: store.reason || 'Credential vault is not supported on this platform' };
  }

  const targetEmail = normalizeEmail(targetEmailRaw);
  if (!targetEmail) {
    return { ok: false, status: 400, error: 'Valid email is required.' };
  }

  return withVaultLock(rootDir, async () => {
    const meta = readVaultMeta(rootDir);
    const existedInMeta = Boolean(meta.accounts[targetEmail]);
    const delRes = store.deleteRaw(VAULT_SERVICE, targetEmail);
    if (!delRes.ok) {
      return { ok: false, status: 500, error: delRes.error || 'Failed to delete saved credential from system keyring.' };
    }
    if (existedInMeta) {
      delete meta.accounts[targetEmail];
      writeVaultMeta(meta, rootDir);
    }
    return {
      ok: true,
      email: targetEmail,
      removed: existedInMeta || !delRes.alreadyMissing,
    };
  });
}

function resolveOpenTerminalScript(options = {}) {
  return options.openTerminalScript
    || process.env.AGY_OPEN_TERMINAL_SCRIPT
    || path.join(os.homedir(), '.grok', 'skills', 'prefer-iterm2', 'scripts', 'open-iterm.sh');
}

function launchAgySignInTerminal(options = {}) {
  if (typeof options.terminalLauncher === 'function') {
    return options.terminalLauncher(options);
  }
  const scriptPath = resolveOpenTerminalScript(options);
  if (!scriptPath || !fs.existsSync(scriptPath)) {
    return { launched: false, helper: null, reason: 'terminal_helper_missing' };
  }
  try {
    const cwd = options.cwd || os.homedir();
    const child = spawn(scriptPath, [cwd, 'agy'], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
    return { launched: true, helper: scriptPath, reason: null };
  } catch (err) {
    return { launched: false, helper: scriptPath, reason: err?.message || 'spawn_failed' };
  }
}

/**
 * Safely prepares for signing into a new Google account via official `agy`:
 * 1. Backs up the currently active login to `agy-check-vault` first (fail-closed).
 * 2. Clears only the live `gemini / antigravity` slot and stale local caches.
 * 3. Optionally opens a new iTerm2 tab running `agy` to start Google OAuth sign-in.
 */
async function prepareSignInNewAccount(options = {}) {
  const {
    rootDir = null,
    launchTerminal = true,
  } = options;
  const nowProvided = typeof options.now === 'number';
  const store = getPlatformStore(options);
  if (!store.supported) {
    return { ok: false, status: 501, error: store.reason || 'Credential vault is not supported on this platform' };
  }

  return withVaultLock(rootDir, async () => {
    const now = nowProvided ? options.now : Date.now();
    const liveRes = store.readRaw(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT);
    if (liveRes.status === 'error') {
      return { ok: false, status: 500, error: `Could not read active agy login before sign-in: ${liveRes.error}` };
    }

    const meta = readVaultMeta(rootDir);
    let backedUpEmail = null;
    if (liveRes.status === 'ok') {
      const parsed = parseCredentialBlob(liveRes.raw, now);
      if (!parsed.ok) {
        return { ok: false, status: 422, error: `Active agy login could not be parsed for safe backup: ${parsed.error}` };
      }
      if (!parsed.email) {
        return { ok: false, status: 422, error: 'Active agy login has no email; save or sign out manually first to avoid losing it.' };
      }
      const existing = meta.accounts[parsed.email] || null;
      const mono = shouldUpdateVaultSlot(existing, parsed);
      if (mono.allow) {
        const bkRes = store.writeRaw(VAULT_SERVICE, parsed.email, parsed.raw, { isLiveSlot: false });
        if (!bkRes.ok) {
          return { ok: false, status: 500, error: `Refused to clear active login: backup for "${parsed.email}" failed (${bkRes.error}).` };
        }
        meta.accounts[parsed.email] = {
          email: parsed.email,
          label: existing?.label || null,
          savedAt: existing?.savedAt || now,
          updatedAt: now,
          lastSwitchedAt: existing?.lastSwitchedAt || null,
          expiry: parsed.expiry,
          expiryMs: parsed.expiryMs,
          hasRefreshToken: parsed.hasRefreshToken,
          refreshTokenHash: parsed.refreshTokenHash,
          tokenHash: parsed.tokenHash,
          authMethod: parsed.authMethod,
        };
      }
      backedUpEmail = parsed.email;

      const delLive = store.deleteRaw(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT);
      if (!delLive.ok) {
        return { ok: false, status: 500, error: `Failed to clear active agy slot: ${delLive.error}` };
      }
    }

    meta.activationGen = (Number.isInteger(meta.activationGen) ? meta.activationGen : 0) + 1;
    meta.lastActivationAt = now;
    writeVaultMeta(meta, rootDir);
    clearLocalTokenCaches(rootDir);

    const launchRes = launchTerminal ? launchAgySignInTerminal(options) : { launched: false, helper: null };
    return {
      ok: true,
      backedUpEmail,
      launchedTerminal: Boolean(launchRes.launched),
      nextCommand: 'agy',
      activationGen: meta.activationGen,
    };
  });
}

module.exports = {
  VAULT_SERVICE,
  VAULT_META_FILENAME,
  VAULT_LOCK_FILENAME,
  normalizeEmail,
  getVaultMetaPath,
  getVaultLockPath,
  scrubSecretText,
  parseCredentialBlob,
  escapeSecurityArg,
  createMacosKeychainStore,
  createLinuxSecretStore,
  getPlatformStore,
  readVaultMeta,
  writeVaultMeta,
  shouldUpdateVaultSlot,
  clearLocalTokenCaches,
  getVaultStatus,
  saveCurrentAccount,
  switchSavedAccount,
  refreshExpiredActiveAccount,
  runAgyModelsRefresh,
  removeSavedAccount,
  resolveOpenTerminalScript,
  prepareSignInNewAccount,
};
