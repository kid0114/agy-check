#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const { spawn } = require('child_process');
const { getSessionState, parseAgyInput, parseAgyQuota } = require('../parser.js');
const { renderHUD } = require('../renderer.js');
const { loadConfig } = require('../config.js');
const { getQuota, getCachedTier, getCachedAccountEmail, readToken } = require('../quota.js');
const { enrichModelsWithQuotaSummary } = require('../quota/cloud.js');
const { resolveAntigravityPath } = require('../paths.js');
const { calculateTurnCacheMetrics } = require('../renderer/format.js');
const { getSessionCostUsd } = require('../cost.js');
const { getOutputSpeedDetails, getToolTimeDetails } = require('../speed.js');
const {
  readSessionSnapshot,
  findAncestorAgyProcess,
  evaluateAccountDrift,
  canPersistPassiveQuota,
  writeSessionSnapshot,
} = require('../session-snapshot.js');
const { inspectLiveAuth, readAccountState } = require('../account-sync.js');
const { readVaultMeta } = require('../account-vault.js');

async function handleSelfUpdate() {
  console.log('Checking for latest installer...');
  const bootstrapUrl = 'https://raw.githubusercontent.com/kid0114/agy-check/main/scripts/bootstrap.js';
  const tempPath = path.join(os.tmpdir(), `agy-hud-bootstrap-${Date.now()}.js`);

  try {
    await new Promise((resolve, reject) => {
      https.get(bootstrapUrl, response => {
        if (response.statusCode !== 200) {
          return reject(new Error(`Failed to fetch bootstrap: ${response.statusCode}`));
        }
        const fileStream = fs.createWriteStream(tempPath);
        response.pipe(fileStream);
        fileStream.on('finish', () => {
          fileStream.close();
          resolve();
        });
        fileStream.on('error', reject);
      }).on('error', reject);
    });

    console.log('Spawning update process in background...');
    const child = spawn(process.execPath, [tempPath, '--delay-start'], {
      detached: true,
      stdio: 'inherit',
      windowsHide: true,
    });
    child.unref();
    console.log('Update initiated. Exiting current process...');
    process.exit(0);
  } catch (err) {
    console.error(`Update failed: ${err.message}`);
    process.exit(1);
  }
}

function maybeCheckUpdates() {
  const updateStatusPath = resolveAntigravityPath('agy-hud-update-status.json');
  let lastCheck = 0;
  let status = {};
  try {
    if (fs.existsSync(updateStatusPath)) {
      status = JSON.parse(fs.readFileSync(updateStatusPath, 'utf8'));
      lastCheck = status.lastCheck || 0;
    }
  } catch {}

  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  if (Date.now() - lastCheck > ONE_DAY_MS) {
    status.lastCheck = Date.now();
    try {
      fs.writeFileSync(updateStatusPath, JSON.stringify(status, null, 2));
    } catch {}

    const checkerPath = path.join(__dirname, '..', 'update-checker.js');
    if (fs.existsSync(checkerPath)) {
      const checker = spawn(process.execPath, [checkerPath], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      });
      checker.unref();
    }
  }
}

async function main() {
  if (process.argv.includes('--update')) {
    await handleSelfUpdate();
    return;
  }

  if (process.argv.includes('--config')) {
    const { startWizard } = require('../config-wizard.js');
    await startWizard();
    return;
  }

  if (process.argv.includes('--panel') || process.argv.includes('--ls')) {
    const { runPanelCli } = require('../panel-cli.js');
    const args = process.argv.slice(2).map(a => (a === '--panel' ? 'panel' : a === '--ls' ? 'ls' : a));
    await runPanelCli(args);
    return;
  }

  const stdinData = [];
  let hasHandled = false;

  // Hard cap: if neither 'end' nor enough data arrives within 1.5s, give up.
  // 1.5s tolerates slow Windows pipes that occasionally fail to emit 'end'
  // while still keeping the statusLine snappy.
  const timeout = setTimeout(() => handleInputAndRender(), 1500);

  async function handleInputAndRender() {
    if (hasHandled) return;
    hasHandled = true;
    clearTimeout(timeout);

    const inputStr = Buffer.concat(stdinData).toString();
    // agy on Windows can invoke the statusline before it has a payload ready.
    // Render a baseline HUD instead of returning an empty successful result.
    const agyData = inputStr.trim() ? parseAgyInput(inputStr) : null;

    const targetCwd = agyData?.workspace?.current_dir || agyData?.cwd || process.cwd();

    // Fallback transcript path if not provided in stdin or if path does not exist — uses paths.js
    // so we honour XDG_DATA_HOME / APPDATA / LOCALAPPDATA in addition to ~/.gemini.
    // Note: agy may pass a legacy ~/.gemini/antigravity/brain/<id>/... path that does not exist
    // on disk (actual data lives under antigravity-cli/brain/<id>/...), and may send session_id
    // instead of conversation_id, so extract the UUID from any of these sources.
    const uuidMatch = typeof agyData?.transcript_path === 'string'
      ? agyData.transcript_path.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i)
      : null;
    const convId = String(agyData?.conversation_id || agyData?.session_id || (uuidMatch ? uuidMatch[1] : '') || '').trim();

    let transcriptPath = agyData?.transcript_path;
    if (!transcriptPath || !fs.existsSync(transcriptPath)) {
      if (convId) {
        const candidate = resolveAntigravityPath(path.join(
          'brain',
          convId,
          '.system_generated',
          'logs',
          'transcript.jsonl'
        ));
        if (fs.existsSync(candidate) || !transcriptPath) {
          transcriptPath = candidate;
        }
      }
    }

    try {
      const updateStatusPath = resolveAntigravityPath('agy-hud-update-status.json');
      let updateInfo = null;
      try {
        if (fs.existsSync(updateStatusPath)) {
          updateInfo = JSON.parse(fs.readFileSync(updateStatusPath, 'utf8'));
        }
      } catch {}

      const liveToken = readToken({ skipWindowsCredential: process.platform === 'win32' });
      const liveAuth = inspectLiveAuth({
        tokenReader: () => liveToken,
        persistState: Boolean(convId),
      });
      const agyProcess = convId ? findAncestorAgyProcess() : null;
      const existingSnapshot = convId ? readSessionSnapshot(convId) : null;
      const activeEmail = liveAuth.activeEmail || (liveToken ? (liveToken.email || getCachedAccountEmail(liveToken)) : null);
      const { drift: accountDrift } = evaluateAccountDrift({
        existingSnapshot,
        agyProcess,
        activeEmail,
        accountSwitchedAt: liveAuth.switchedAt,
      });

      const [state, config, quotaData, tierName] = await Promise.all([
        getSessionState(transcriptPath, targetCwd),
        loadConfig(),
        getQuota({ fast: true }).catch(() => []),
        Promise.resolve().then(() => getCachedTier(liveToken)),
      ]);

      if (accountDrift) {
        state.accountDrift = accountDrift;
      }

      let effectiveQuotaData = quotaData;
      // Authoritative live quota passed directly in stdin by agy CLI —
      // skip overlaying when this agy process is bound to an older account than
      // macOS Keychain so stale-session quota cannot clobber the active account.
      const stdinProviderQuota = parseAgyQuota(agyData?.quota);
      if (stdinProviderQuota && !accountDrift) {
        if (Array.isArray(effectiveQuotaData)) {
          effectiveQuotaData = enrichModelsWithQuotaSummary(effectiveQuotaData, stdinProviderQuota);
          effectiveQuotaData.providerQuota = { ...(quotaData.providerQuota || {}), ...stdinProviderQuota };
        }
        // Zero-request passive sync: persist official agy stdin quota ONLY when
        // the invoking agy process has positive provenance for activeEmail and
        // live activation state still matches inside the cache lock.
        if (liveToken && activeEmail) {
          try {
            const vaultMeta = readVaultMeta();
            const proven = canPersistPassiveQuota({
              convId,
              activeEmail,
              liveToken,
              accountDrift,
              agyProcess,
              existingSnapshot,
              switchedAt: liveAuth.switchedAt,
              lastActivationAt: vaultMeta.lastActivationAt,
            });
            if (proven) {
              const { persistStdinProviderQuota } = require('../quota/cache.js');
              persistStdinProviderQuota({
                stdinProviderQuota,
                models: Array.isArray(effectiveQuotaData) ? effectiveQuotaData : [],
                token: liveToken,
                tier: tierName || agyData?.plan_tier || null,
                accountEmail: activeEmail,
                beforeCommit: () => {
                  const curMeta = readVaultMeta();
                  if (curMeta.activationGen !== vaultMeta.activationGen) return false;
                  const curState = readAccountState();
                  if (curState?.activeEmail && curState.activeEmail !== activeEmail) return false;
                  if (typeof curState?.switchedAt === 'number' && curState.switchedAt !== liveAuth.switchedAt) return false;
                  return true;
                },
              });
            }
          } catch {}
        }
      }

      const hudOutput = renderHUD(state, agyData, config, effectiveQuotaData, tierName, updateInfo);
      process.stdout.write(hudOutput);

      // Persist lightweight per-session snapshot for the multi-session panel.
      if (convId) {
        try {
          const cw = agyData?.context_window || {};
          const turnUsage = cw.current_usage || state?.usage?.current_usage || null;
          const turnCache = turnUsage ? calculateTurnCacheMetrics(turnUsage) : null;
          const speed = getOutputSpeedDetails(agyData, null, state);
          const toolTime = getToolTimeDetails(agyData, null, state);
          const costUsd = getSessionCostUsd(agyData, state, { allowRoutedCost: config?.display?.showRoutedCost });

          writeSessionSnapshot({
            conversationId: convId,
            transcriptPath: state.transcriptPath || transcriptPath || null,
            cwd: targetCwd,
            currentDir: state.currentDir,
            branch: state.branch,
            modelId: agyData?.model?.id || null,
            modelDisplayName: agyData?.model?.display_name || agyData?.model?.id || null,
            planTier: tierName || agyData?.plan_tier || null,
            activeAccountEmail: activeEmail,
            agyProcess,
            contextWindow: (cw && (cw.used_percentage !== undefined || cw.context_window_size))
              ? {
                  usedPercentage: cw.used_percentage ?? null,
                  contextWindowSize: cw.context_window_size ?? null,
                  totalInputTokens: cw.total_input_tokens ?? null,
                  totalOutputTokens: cw.total_output_tokens ?? null,
                }
              : null,
            turnCache,
            sessionCache: state.sessionCache || null,
            speed,
            toolTime,
            costUsd,
            steps: state.steps,
          }, { accountSwitchedAt: liveAuth.switchedAt });
        } catch {
          // Non-blocking snapshot write
        }
      }

      // Trigger background check for updates after writing output
      maybeCheckUpdates();
    } catch (err) {
      // Write debug error to Antigravity directory
      try {
        const errorLogPath = resolveAntigravityPath('agy-hud-error.log');
        fs.writeFileSync(errorLogPath, err.stack || String(err), { mode: 0o600 });
      } catch {}
    }
    process.exit(0);
  }

  process.stdin.on('data', chunk => stdinData.push(chunk));
  process.stdin.on('end', handleInputAndRender);
}

main();

