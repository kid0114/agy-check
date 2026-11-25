/**
 * quota.js — Real account-level quota fetcher (orchestrator).
 *
 * Calls the same `fetchAvailableModels` endpoint that agy uses for /usage.
 * Token is auto-discovered from known agy app-data locations across platforms.
 * Results are cached to os.tmpdir()/agy-hud-quota-cache.json. The cache key is
 * the stable credential source when available, so access-token rotation does
 * not hide a still-fresh quota cache from the statusline.
 *
 * Submodules:
 *   ./quota/token.js  — OAuth file + Windows Credential Manager + temp mirror
 *   ./quota/cache.js  — atomic cache read/write, token-keyed match
 *   ./quota/cloud.js  — fetchAvailableModels + loadCodeAssist HTTP calls
 *   ./quota/models.js — model-id discovery, deprecation map, quota normalize
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { getAntigravityRoots } = require('./paths.js');

const tokenMod = require('./quota/token.js');
const cacheMod = require('./quota/cache.js');
const cloudMod = require('./quota/cloud.js');
const modelsMod = require('./quota/models.js');

const {
  readToken,
  readWindowsCredentialTokens,
  isTokenExpired,
  anyTokenFileExists,
} = tokenMod;
const {
  CACHE_PATH,
  isCachePayloadFresh,
  readCachePayload,
  readCacheLastRefreshed,
  readCacheFallback,
  readCacheAccountEmail,
  didAccessTokenRotate,
  writeCache,
} = cacheMod;
const { fetchQuotaFromCloud, fetchTierFromCloud, fetchAccountEmail } = cloudMod;
const { createUnavailableQuotaResult } = modelsMod;

function isDifferentAccount(tok, cachedEmail) {
  return Boolean(tok && tok.email && cachedEmail && tok.email !== cachedEmail);
}

const WINDOWS_CREDENTIAL_REFRESH_DEBOUNCE_MS = 30 * 1000;
let lastWindowsCredentialRefreshAt = 0;

function triggerBackgroundRefresh() {
  try {
    const subprocess = spawn(process.execPath, [
      path.join(__dirname, 'quota.js'),
      '--refresh',
    ], {
      detached: true,
      stdio: 'ignore',
    });
    subprocess.unref();
  } catch { /* ignore spawning issues */ }
}

function triggerWindowsCredentialRefresh(backgroundRefresh, now, debounceMs) {
  if (now - lastWindowsCredentialRefreshAt < debounceMs) return;
  lastWindowsCredentialRefreshAt = now;
  backgroundRefresh();
}

/**
 * Get quota data using a non-blocking Stale-While-Revalidate pattern.
 * @returns {Promise<ModelQuota[]>}
 */
async function getQuota(options = {}) {
  const {
    fast = false,
    platform = process.platform,
    tokenReader = readToken,
    backgroundRefresh = triggerBackgroundRefresh,
    credentialReader = readWindowsCredentialTokens,
    roots = getAntigravityRoots(),
    windowsCredentialRefreshDebounceMs = WINDOWS_CREDENTIAL_REFRESH_DEBOUNCE_MS,
  } = options;
  const shouldRefreshWindowsCredential = fast && platform === 'win32';
  const refreshWindowsCredential = () => {
    if (!shouldRefreshWindowsCredential) return;
    triggerWindowsCredentialRefresh(backgroundRefresh, Date.now(), windowsCredentialRefreshDebounceMs);
  };
  const tok = tokenReader({
    platform,
    roots,
    credentialReader,
    skipWindowsCredential: fast && platform === 'win32',
  });
  if (!tok) {
    // Token file exists but failed to parse → transient (OAuth mid-refresh).
    // Return fresh cache rather than flashing "not logged in".
    // Token file absent → genuine logout, skip fallback.
    if (anyTokenFileExists(roots)) {
      const fallback = readCacheFallback();
      if (fallback && isCachePayloadFresh(fallback)) {
        return fallback.data;
      }
    }
    refreshWindowsCredential();
    return createUnavailableQuotaResult('not_logged_in');
  }

  // For multi-account (Windows Credential Manager), use the primary token for
  // cache keying but fall back to alternates if the primary has no cache.
  const payload = readCachePayload(tok) ||
    (tok.all && tok.all.slice(1).reduce((acc, t) => acc || readCachePayload(t), null));
  const isFresh = payload && isCachePayloadFresh(payload);
  const tokenExpired = isTokenExpired(tok);
  const needsRefresh = !tokenExpired && (!isFresh || didAccessTokenRotate(payload, tok));

  const cachedEmail = payload ? payload.accountEmail : readCacheAccountEmail();
  const accountSwitched = isDifferentAccount(tok, cachedEmail);

  if (needsRefresh) {
    // Read lastRefreshed from cache even when payload doesn't match our token,
    // to prevent a storm of concurrent background refresh processes.
    const lastRefreshed = payload
      ? payload.lastRefreshed || 0
      : readCacheLastRefreshed();
    // Debounce stale/no-cache refreshes, but refresh immediately on token rotation
    // or an explicit account email change.
    if (accountSwitched || didAccessTokenRotate(payload, tok) || Date.now() - lastRefreshed > 30 * 1000) {
      backgroundRefresh();
    }
  }

  if (payload) {
    return payload.data;
  }

  if (tokenExpired) {
    refreshWindowsCredential();
    return createUnavailableQuotaResult('expired_token');
  }

  // Fallback to any readable cache payload on disk to prevent "Quota loading" flicker
  // while we perform a background refresh for the current token — unless it clearly
  // belongs to a different account email.
  const fallback = readCacheFallback();
  if (fallback && !isDifferentAccount(tok, fallback.accountEmail)) {
    return fallback.data;
  }

  // If no cache exists at all, return empty. Non-fast callers trigger the
  // refresh above; statusline fast path stays bounded and never waits on it.
  return [];
}

/**
 * Proactively refresh quota, tier, and account email for the current live token.
 * Used by both `--refresh` background jobs and the multi-session panel.
 * Supports captured credential snapshots and atomic pre-commit fencing so a
 * superseded refresh can never overwrite a newly switched account's cache.
 */
async function refreshQuotaNow(options = {}) {
  const {
    platform = process.platform,
    roots = getAntigravityRoots(),
    tokenReader = readToken,
    quotaFetcher = fetchQuotaFromCloud,
    tierFetcher = fetchTierFromCloud,
    emailFetcher = fetchAccountEmail,
    cacheWriter = writeCache,
    tokenSnapshot = null,
    expectedEmail = null,
    expectedTokenHash = null,
    commitFence = null,
  } = options;

  const normEmail = (v) => (typeof v === 'string' && v.trim() ? v.trim().toLowerCase() : null);
  const wantEmail = normEmail(expectedEmail);
  const readVaultActivationGen = () => {
    const primaryRoot = Array.isArray(roots) && roots[0] ? roots[0] : null;
    if (!primaryRoot) return null;
    try {
      const meta = JSON.parse(fs.readFileSync(path.join(primaryRoot, 'agy-check-vault-meta.json'), 'utf8'));
      return Number.isInteger(meta?.activationGen) && meta.activationGen >= 0 ? meta.activationGen : 0;
    } catch {
      return null;
    }
  };

  try {
    const initialVaultGen = readVaultActivationGen();
    const tok = tokenSnapshot || tokenReader({ platform, roots });
    if (!tok) {
      return { ok: false, reason: 'not_logged_in', email: null, tier: null, data: [] };
    }
    const tokEmail = normEmail(tok.email);
    const tokHash = cacheMod.getTokenHash(tok);
    if (wantEmail && tokEmail && tokEmail !== wantEmail) {
      return { ok: false, reason: 'superseded', email: tok.email || null, tier: null, data: [] };
    }
    if (expectedTokenHash && tokHash && tokHash !== expectedTokenHash) {
      return { ok: false, reason: 'superseded', email: tok.email || null, tier: null, data: [] };
    }
    if (isTokenExpired(tok)) {
      return { ok: false, reason: 'expired_token', email: tok.email || null, tier: null, data: [] };
    }

    const initialEmail = wantEmail || tokEmail || null;
    const initialTokenHash = expectedTokenHash || tokHash || null;
    const shouldReverifyToken = Boolean(!tokenSnapshot || options.tokenReader || typeof commitFence !== 'function');

    const verifyStillCurrent = () => {
      if (typeof commitFence === 'function') {
        try {
          if (commitFence() === false) return false;
        } catch {
          return false;
        }
      } else {
        // Default ABA guard even when caller didn't supply a custom commitFence:
        // reject commit if vault activationGen changed (including A -> B -> A).
        const curVaultGen = readVaultActivationGen();
        if (initialVaultGen !== null && curVaultGen !== null && curVaultGen !== initialVaultGen) {
          return false;
        }
        if (initialVaultGen === null && curVaultGen !== null && curVaultGen > 0) {
          return false;
        }
      }
      if (shouldReverifyToken) {
        try {
          const liveTok = tokenReader({ platform, roots });
          if (!liveTok) return false;
          const liveEmail = normEmail(liveTok.email);
          const liveHash = cacheMod.getTokenHash(liveTok);
          if (wantEmail && liveEmail && liveEmail !== wantEmail) return false;
          if (initialEmail && liveEmail && liveEmail !== initialEmail) return false;
          if (expectedTokenHash && !wantEmail && liveHash && liveHash !== expectedTokenHash) return false;
          if (!initialEmail && initialTokenHash && liveHash && liveHash !== initialTokenHash) return false;
        } catch {
          return false;
        }
      }
      return true;
    };

    if (typeof commitFence === 'function' && commitFence() === false) {
      return { ok: false, reason: 'superseded', email: tok.email || null, tier: null, data: [] };
    }

    const [fresh, tier, fetchedEmail] = await Promise.all([
      quotaFetcher(tok.accessToken),
      tierFetcher(tok.accessToken).catch(() => null),
      emailFetcher(tok.accessToken).catch(() => null),
    ]);
    const accountEmail = fetchedEmail || tok.email || null;
    if (wantEmail && accountEmail && normEmail(accountEmail) !== wantEmail) {
      return { ok: false, reason: 'superseded', email: accountEmail, tier: tier || null, data: [] };
    }

    if (fresh && fresh.unavailableReason === 'auth_failed') {
      if (!verifyStillCurrent()) {
        return { ok: false, reason: 'superseded', email: accountEmail, tier: tier || null, data: [] };
      }
      tokenMod.clearTokenTemp(roots);
      return { ok: false, reason: 'auth_failed', email: accountEmail, tier: tier || null, data: [] };
    }

    if ((Array.isArray(fresh) && fresh.length > 0) || accountEmail) {
      const normalizedFresh = Array.isArray(fresh) ? fresh : [];
      if (cacheWriter === writeCache) {
        const committed = cacheWriter(normalizedFresh, tok, tier, accountEmail, normalizedFresh.providerQuota, {
          beforeCommit: verifyStillCurrent,
        });
        if (!committed) {
          return { ok: false, reason: 'superseded', email: accountEmail, tier: tier || null, data: [] };
        }
      } else {
        if (!verifyStillCurrent()) {
          return { ok: false, reason: 'superseded', email: accountEmail, tier: tier || null, data: [] };
        }
        cacheWriter(normalizedFresh, tok, tier, accountEmail, normalizedFresh.providerQuota);
      }
      return {
        ok: true,
        reason: null,
        email: accountEmail,
        tier: tier || null,
        data: normalizedFresh,
        providerQuota: normalizedFresh.providerQuota || null,
        lastRefreshed: Date.now(),
      };
    }

    return {
      ok: false,
      reason: (fresh && fresh.unavailableReason) || 'empty_quota',
      email: accountEmail,
      tier: tier || null,
      data: [],
    };
  } catch (err) {
    return {
      ok: false,
      reason: err && err.message ? err.message : 'refresh_failed',
      email: null,
      tier: null,
      data: [],
    };
  }
}

// ─── CLI Execution for background refreshes ──────────────────────────────────
if (process.argv.includes('--refresh')) {
  (async () => {
    const argv = process.argv.slice(2);
    const getArg = (flag) => {
      const idx = argv.indexOf(flag);
      return idx !== -1 && idx + 1 < argv.length ? argv[idx + 1] : null;
    };
    const expectedEmail = getArg('--expected-email') || null;
    const expectedGenRaw = getArg('--expected-gen');
    const expectedGen = expectedGenRaw !== null && /^\d+$/.test(expectedGenRaw)
      ? Number.parseInt(expectedGenRaw, 10)
      : null;
    const printStatus = argv.includes('--print-status');
    let commitFence = null;
    if (expectedGen !== null) {
      const { readVaultMeta } = require('./account-vault.js');
      commitFence = () => readVaultMeta().activationGen === expectedGen;
    }
    try {
      const res = await refreshQuotaNow({
        expectedEmail,
        commitFence,
      });
      if (printStatus) {
        process.stdout.write(`${JSON.stringify({ ok: Boolean(res?.ok), reason: res?.reason || null })}\n`);
        process.exit(res?.ok ? 0 : (res?.reason === 'superseded' ? 2 : 1));
      }
    } catch (err) {
      if (printStatus) {
        process.stdout.write(`${JSON.stringify({ ok: false, reason: err?.message || 'refresh_failed' })}\n`);
        process.exit(1);
      }
    }
    process.exit(0);
  })();
}

module.exports = {
  // orchestrator
  getQuota,
  refreshQuotaNow,
  // cache module
  CACHE_PATH,
  ACCOUNT_QUOTA_STORE_PATH: cacheMod.ACCOUNT_QUOTA_STORE_PATH,
  getAccountQuotaStorePath: cacheMod.getAccountQuotaStorePath,
  readAccountQuotaStore: cacheMod.readAccountQuotaStore,
  writeAccountQuotaSnapshot: cacheMod.writeAccountQuotaSnapshot,
  getAccountQuota: cacheMod.getAccountQuota,
  isCachePayloadFresh,
  readCache: cacheMod.readCache,
  writeCache,
  readCachePayload,
  readCacheLastRefreshed,
  readCacheFallback,
  readCacheAccountEmail: cacheMod.readCacheAccountEmail,
  getCachedTier: cacheMod.getCachedTier,
  getCachedAccountEmail: cacheMod.getCachedAccountEmail,
  // token module
  readToken,
  clearTokenTemp: tokenMod.clearTokenTemp,
  readWindowsCredentialTokens,
  readLinuxKeyringTokens: tokenMod.readLinuxKeyringTokens,
  probeLinuxKeyringAvailability: tokenMod.probeLinuxKeyringAvailability,
  readMacosKeychainTokens: tokenMod.readMacosKeychainTokens,
  probeMacosKeychainAvailability: tokenMod.probeMacosKeychainAvailability,
  isTokenExpired,
  getTokenCandidates: tokenMod.getTokenCandidates,
  parseTokenPayload: tokenMod.parseTokenPayload,
  selectUsableTokens: tokenMod.selectUsableTokens,
  anyTokenFileExists,
  // cloud module
  DEFAULT_CLI_VERSION: cloudMod.DEFAULT_CLI_VERSION,
  getAgyCliVersion: cloudMod.getAgyCliVersion,
  buildHeaders: cloudMod.buildHeaders,
  fetchQuotaFromCloud,
  fetchTierFromCloud,
  fetchAccountEmail,
  extractTierName: cloudMod.extractTierName,
  parseQuotaSummary: cloudMod.parseQuotaSummary,
  enrichModelsWithQuotaSummary: cloudMod.enrichModelsWithQuotaSummary,
  fetchUserQuotaSummaryFromCloud: cloudMod.fetchUserQuotaSummaryFromCloud,
  // models module
  normalizeQuotaModels: modelsMod.normalizeQuotaModels,
  discoverAgentModelIds: modelsMod.discoverAgentModelIds,
  resolveDeprecatedIds: modelsMod.resolveDeprecatedIds,
  classifyQuotaWindow: modelsMod.classifyQuotaWindow,
  isObservationExpired: modelsMod.isObservationExpired,
  pruneExpiredWindows: modelsMod.pruneExpiredWindows,
  mergeQuotaWindows: modelsMod.mergeQuotaWindows,
  pickCriticalWindow: modelsMod.pickCriticalWindow,
  FIVE_HOUR_WINDOW_THRESHOLD_MS: modelsMod.FIVE_HOUR_WINDOW_THRESHOLD_MS,
  createUnavailableQuotaResult,
};
