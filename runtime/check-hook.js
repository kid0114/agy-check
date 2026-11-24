#!/usr/bin/env node
'use strict';

/**
 * Zero-token PreInvocation hook for the `/check` slash command inside agy CLI.
 *
 * When the user submits `/check` (or `/check [panel|ls|session|sync|refresh|stop]`),
 * this hook intercepts the turn BEFORE any model call, launches/reuses the local
 * WebUI panel and opens it automatically (for `/check` / `/check panel`),
 * and renders a concise English Markdown summary inline via `metadata.user_markdown`
 * with `terminationBehavior: "terminate"`.
 */

const fs = require('fs');
const path = require('path');
const { resolveAntigravityPath } = require('./paths.js');
const { buildPanelOverview, getSessionDetail, formatGapShort } = require('./panel-data.js');
const { ensurePanelRunning, stopPanelDaemon, setLanNetworks, DEFAULT_PORT } = require('./panel-server.js');
const { openBrowserUrl } = require('./panel-cli.js');
const { refreshQuotaNow } = require('./quota.js');
const { previewAccountSync, executeAccountSync } = require('./account-sync.js');
const { formatTokens } = require('./renderer/format.js');
const { formatToolDuration } = require('./speed.js');

/**
 * Parses `lastUserInput` from a PreInvocation hook payload.
 * Returns null if the user message is not a `/check` invocation.
 */
function parseCheckInput(rawInput) {
  if (!rawInput || typeof rawInput !== 'string') return null;
  const trimmed = rawInput.trim();
  if (!trimmed) return null;

  // Match direct slash command `/check ...` or skill-wrapped `<USER_REQUEST>\n/check ...`
  let line = trimmed;
  const unwrapped = trimmed.match(/<USER_REQUEST>\s*([\s\S]*?)\s*<\/USER_REQUEST>/i);
  if (unwrapped) {
    line = unwrapped[1].trim();
  }

  // Handle agy's slash-skill expansion if it prepends a skill directive containing `/check`
  const directMatch = line.match(/^\/check(?:\s+([\s\S]*))?$/i);
  let rest = null;
  if (directMatch) {
    rest = (directMatch[1] || '').trim();
  } else {
    // Check first line if agy expanded skill instructions below `/check`
    const firstLine = line.split('\n')[0].trim();
    const firstMatch = firstLine.match(/^\/check(?:\s+(.*))?$/i);
    if (firstMatch) {
      rest = (firstMatch[1] || '').trim();
    } else if (/^Use the [`'"]?check[`'"]? skill/i.test(firstLine) || /<skill[^>]*name=["']check["']/i.test(line)) {
      const argMatch = line.match(/(?:arguments?|user input|args?)\s*:\s*(.+)/i);
      rest = argMatch ? argMatch[1].trim() : '';
    }
  }

  if (rest === null) return null;

  const tokens = rest ? rest.split(/\s+/).filter(Boolean) : [];
  const sub = (tokens[0] || 'panel').toLowerCase();
  const restArgs = tokens.slice(1);
  return { subcommand: sub, args: restArgs, rawArgs: rest };
}

function escapeMdCell(value) {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function formatAgeShort(ms, now = Date.now()) {
  if (!ms) return '--';
  const sec = Math.max(0, Math.floor((now - ms) / 1000));
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h`;
  return `${Math.floor(sec / 86400)}d`;
}

function formatOverviewMarkdown(overview, options = {}) {
  const { panelInfo = null, limit = 10, now = Date.now() } = options;
  const auth = overview.auth || {};
  const quota = overview.quota || {};
  const summary = overview.summary || {};
  const lines = [];

  if (panelInfo) {
    if (panelInfo.ok) {
      const stateText = panelInfo.alreadyRunning ? 'already running' : `started (PID ${panelInfo.pid || '?'})`;
      lines.push(`### agy-check Panel — Opened [\`${panelInfo.url}\`](${panelInfo.url})`);
      lines.push(`- **Panel**: ${stateText}`);
      if (panelInfo.lanUrls && panelInfo.lanUrls[0]) {
        lines.push(`- **Phone** (same Wi-Fi): [\`${panelInfo.lanUrls[0]}\`](${panelInfo.lanUrls[0]}) · all networks: \`/check lan\``);
      }
    } else {
      lines.push(`### agy-check Panel — Failed to start (\`${panelInfo.error || 'unknown error'}\`)`);
    }
  } else {
    lines.push('### agy-check Multi-Session Summary');
  }

  const acct = auth.activeEmail || (auth.loggedIn ? 'Signed in' : 'Not logged in');
  const tier = quota.tier ? ` (${quota.tier})` : '';
  lines.push(`- **Account**: \`${acct}\`${tier}${auth.expired ? ' — **token expired**' : ''}`);

  const quotaParts = [];
  for (const p of quota.providers || []) {
    const segs = [];
    if (p.fiveHour) segs.push(`5h **${p.fiveHour.percent}%**${p.fiveHour.resetIn ? ` (~${p.fiveHour.resetIn})` : ''}`);
    if (p.weekly) segs.push(`wk **${p.weekly.percent}%**${p.weekly.resetIn ? ` (~${p.weekly.resetIn})` : ''}`);
    if (segs.length > 0) quotaParts.push(`${p.label}: ${segs.join(', ')}`);
  }
  if (quotaParts.length > 0) {
    lines.push(`- **Quota**: ${quotaParts.join(' | ')}`);
  } else if (quota.unavailableReason) {
    lines.push(`- **Quota**: unavailable (\`${quota.unavailableReason}\`)`);
  }

  const wHit = summary.weightedHitRate === null || summary.weightedHitRate === undefined
    ? '--'
    : `**${summary.weightedHitRate.toFixed(1)}%**`;
  const speedPart = (typeof summary.avgOutSpeed === 'number' || typeof summary.avgNetSpeed === 'number')
    ? ` · avg speed \`out ${typeof summary.avgOutSpeed === 'number' ? summary.avgOutSpeed.toFixed(1) : '--'} / net ${typeof summary.avgNetSpeed === 'number' ? summary.avgNetSpeed.toFixed(1) : '--'} t/s\``
    : '';
  lines.push(
    `- **Cache (${overview.range})**: weighted hit ${wHit}${speedPart} · ` +
    `cache \`${formatTokens(summary.totalCacheRead)}\` / uncached \`${formatTokens(summary.totalUncachedInput)}\` / out \`${formatTokens(summary.totalOutput)}\` · ` +
    `sessions \`${summary.sessionCount}/${summary.totalSessionsAll}\` (running \`${summary.runningCount}\`, unsynced \`${summary.unsyncedCount}\`)`
  );

  if (summary.unsyncedCount > 0) {
    lines.push('');
    lines.push(`> **Warning:** ${summary.unsyncedCount} running \`agy\` session(s) still hold an older account. Run \`/check sync\` to preview or use the WebUI panel to sync safely.`);
  }

  const rows = (overview.sessions || []).slice(0, limit);
  if (rows.length > 0) {
    lines.push('');
    lines.push('| State | ID | Model | Turns | Last Hit | Avg Hit | Out/Net (t/s) | Cache / Unc / Out | Age | Title |');
    lines.push('| --- | --- | --- | ---: | ---: | ---: | ---: | --- | ---: | --- |');
    for (const s of rows) {
      const st = s.syncStatus === 'unsynced' ? `${s.status} (unsynced)` : s.status;
      const lh = s.lastTurnHitRate === null ? '--' : `${s.lastTurnHitRate.toFixed(1)}%`;
      const ah = s.sessionHitRate === null ? '--' : `${s.sessionHitRate.toFixed(1)}%`;
      const outS = typeof s.speed?.totalSpeed === 'number' ? s.speed.totalSpeed.toFixed(1) : null;
      const netS = typeof s.speed?.visibleSpeed === 'number' ? s.speed.visibleSpeed.toFixed(1) : null;
      const spd = (outS !== null || netS !== null) ? `${outS ?? '--'} / ${netS ?? '--'}` : '--';
      const tok = `${formatTokens(s.totalCacheRead)} / ${formatTokens(s.totalUncachedInput)} / ${formatTokens(s.totalOutput)}`;
      const title = s.title.length > 42 ? `${s.title.slice(0, 41)}…` : s.title;
      lines.push(
        `| ${escapeMdCell(st)} | \`${escapeMdCell(s.shortId)}\` | ${escapeMdCell(s.modelLabel)} | ${s.turnsCount} | ${lh} | ${ah} | ${spd} | ${tok} | ${formatAgeShort(s.lastActivityMs, now)} | ${escapeMdCell(title)} |`
      );
    }
  }

  lines.push('');
  lines.push('_Shortcuts: `/check` (open panel) · `/check lan` (phone link) · `/check ls [active|24h|today|7d|30d|all]` · `/check session [id]` · `/check refresh` · `/check sync [--apply]` · `/check stop`_');
  return lines.join('\n');
}

function formatSessionMarkdown(detail) {
  const lines = [];
  lines.push(`### agy-check Session — ${escapeMdCell(detail.title)}`);
  lines.push(
    `- **ID**: \`${detail.conversationId}\` · **Status**: \`${detail.status}\` · **Sync**: \`${detail.syncStatus}\`` +
    (detail.pid ? ` · **PID**: \`${detail.pid}\`` : '')
  );
  const avg = detail.sessionHitRate === null ? '--' : `**${detail.sessionHitRate.toFixed(1)}%**`;
  const last = detail.lastTurnHitRate === null ? '--' : `**${detail.lastTurnHitRate.toFixed(1)}%**`;
  const spdOut = typeof detail.speed?.totalSpeed === 'number' ? `${detail.speed.totalSpeed.toFixed(1)} t/s` : '--';
  const spdNet = typeof detail.speed?.visibleSpeed === 'number' ? `${detail.speed.visibleSpeed.toFixed(1)} t/s` : '--';
  lines.push(
    `- **Cache**: session ${avg} · last ${last} · turns \`${detail.turnsCount}\` · ` +
    `cache \`${formatTokens(detail.totalCacheRead)}\` / uncached \`${formatTokens(detail.totalUncachedInput)}\` / out \`${formatTokens(detail.totalOutput)}\` · ` +
    `speed \`out ${spdOut} / net ${spdNet}\` · tool \`${formatToolDuration(detail.toolDurationMs) || '--'}\``
  );

  const turns = (detail.turns || []).slice(-20);
  if (turns.length > 0) {
    lines.push('');
    if (detail.turns.length > turns.length) {
      lines.push(`_Showing latest ${turns.length} of ${detail.turns.length} turns (open \`/check\` WebUI for full history & chart)._`);
      lines.push('');
    }
    lines.push('| Turn | Step | Gap | Model | Uncached | Cache Read | Out | Hit % | Miss Diagnosis |');
    lines.push('| ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: | --- |');
    for (const t of turns) {
      const diag = (t.missReasons || []).map(r => `${r.label}: ${r.detail}`).join('; ') || '--';
      lines.push(
        `| #${t.turnIndex} | ${t.stepIndex ?? '--'} | ${formatGapShort(t.gapMs) || '--'} | ${escapeMdCell(t.modelLabel)} | ${formatTokens(t.inputTokens)} | ${formatTokens(t.cacheReadTokens)} | ${formatTokens(t.outputTokens)} | ${t.hitRate.toFixed(1)}% | ${escapeMdCell(diag)} |`
      );
    }
  } else {
    lines.push('\nNo `PLANNER_RESPONSE` turns recorded yet.');
  }
  return lines.join('\n');
}

function buildTerminateResponse(markdown) {
  return {
    injectSteps: [
      {
        systemMessage: {
          systemMessage: markdown,
        },
      },
    ],
    terminationBehavior: 'terminate',
  };
}

function clearPendingInvocationTimer(conversationId, rootDir = null) {
  const key = String(conversationId || '').trim().replace(/[^a-zA-Z0-9._-]/g, '_');
  if (!key) return;
  const speedDir = rootDir ? path.join(rootDir, 'speed-cache') : resolveAntigravityPath('speed-cache');
  const timingFile = path.join(speedDir, `hook-timing-${key}.json`);
  try {
    if (!fs.existsSync(timingFile)) return;
    const raw = JSON.parse(fs.readFileSync(timingFile, 'utf8'));
    if (raw && raw.pendingStartMs !== null) {
      raw.pendingStartMs = null;
      raw.pendingInvocationNum = null;
      raw.pendingInitialNumSteps = null;
      fs.writeFileSync(timingFile, JSON.stringify(raw), { mode: 0o600 });
    }
  } catch {
    // Non-blocking cleanup
  }
}

async function handleCheckHook(payload, deps = {}) {
  const parsed = parseCheckInput(payload?.lastUserInput);
  if (!parsed) return {};

  const {
    rootDir = null,
    port = DEFAULT_PORT,
    ensurePanel = ensurePanelRunning,
    stopPanel = stopPanelDaemon,
    openBrowser = openBrowserUrl,
    overviewBuilder = buildPanelOverview,
    detailBuilder = getSessionDetail,
    quotaRefresher = refreshQuotaNow,
    syncPreviewer = previewAccountSync,
    syncExecutor = executeAccountSync,
  } = deps;

  // Since we terminate before the model runs, PostInvocation will not fire;
  // clear pendingStartMs written by invocation-timer so the panel does not
  // display this session as stuck in "generating".
  clearPendingInvocationTimer(payload?.conversationId, rootDir);

  const { subcommand, args } = parsed;

  if (subcommand === 'stop') {
    const res = await stopPanel({ rootDir });
    const md = res.stopped
      ? `### agy-check Panel Stopped\nStopped background panel server (PID \`${res.pid}\`).`
      : `### agy-check Panel\nNo running background panel server found (\`${res.reason}\`).`;
    return buildTerminateResponse(md);
  }

  if (subcommand === 'session' || subcommand === 'inspect') {
    const targetId = args[0] || payload?.conversationId || '';
    if (!targetId) {
      return buildTerminateResponse('### agy-check Session\nProvide a conversation ID or prefix: `/check session <id-prefix>`.');
    }
    const detail = await detailBuilder(targetId, { rootDir });
    if (!detail) {
      return buildTerminateResponse(`### agy-check Session\nSession not found: \`${targetId}\`.`);
    }
    return buildTerminateResponse(formatSessionMarkdown(detail));
  }

  if (subcommand === 'sync') {
    const apply = args.includes('--apply');
    if (apply) {
      const res = await syncExecutor({ confirm: true, rootDir });
      const body = [
        res.ok ? '### agy-check Account Sync Completed' : '### agy-check Account Sync Failed',
        res.error ? `Error: \`${res.error}\`` : '',
        res.output ? `\n\`\`\`text\n${res.output}\n\`\`\`` : '',
      ].filter(Boolean).join('\n');
      return buildTerminateResponse(body);
    }
    const preview = syncPreviewer();
    const body = [
      '### agy-check Account Sync Preview (Dry-Run)',
      preview.error ? `Error: \`${preview.error}\`` : '',
      preview.rawOutput ? `\n\`\`\`text\n${preview.rawOutput}\n\`\`\`` : '',
      '\nRun `/check sync --apply` (or confirm inside the `/check` WebUI panel) to execute.',
    ].filter(Boolean).join('\n');
    return buildTerminateResponse(body);
  }

  if (subcommand === 'refresh') {
    await quotaRefresher({ ...(rootDir ? { roots: [rootDir] } : {}) }).catch(() => null);
    const overview = await overviewBuilder({ rootDir, range: '24h' });
    return buildTerminateResponse(formatOverviewMarkdown(overview, { limit: 10 }));
  }

  if (subcommand === 'ls' || subcommand === 'list' || subcommand === 'status') {
    const range = ['active', '24h', 'today', '7d', '30d', 'all'].includes((args[0] || '').toLowerCase())
      ? args[0].toLowerCase()
      : '24h';
    const overview = await overviewBuilder({ rootDir, range });
    return buildTerminateResponse(formatOverviewMarkdown(overview, { limit: 15 }));
  }

  if (subcommand === 'lan' || subcommand === 'phone') {
    const netIdx = args.indexOf('--networks');
    let networksChanged = false;
    if (netIdx !== -1) {
      const value = args[netIdx + 1] || '';
      try {
        setLanNetworks(rootDir, value === 'none' ? [] : value.split(','));
        networksChanged = true;
      } catch (err) {
        return buildTerminateResponse(`### agy-check Phone Access\n${err.message}.`);
      }
    }
    const info = await ensurePanel({
      port,
      rootDir,
      lan: true,
      rotateToken: args.includes('--new-token'),
      restart: networksChanged,
    });
    if (!info.ok) {
      return buildTerminateResponse(`### agy-check Phone Access\nFailed to start the panel in LAN mode (\`${info.error || 'unknown error'}\`).`);
    }
    const [primary, ...others] = info.lanUrls || [];
    const body = [
      '### agy-check Phone Access',
      primary
        ? `Open this on a phone on the same network:\n\n[\`${primary}\`](${primary})`
        : 'LAN mode is on, but no Wi-Fi/Ethernet or saved network address is up right now.',
      others.length > 0 ? `\nAlso reachable at:\n${others.map(u => `- \`${u}\``).join('\n')}` : '',
      '',
      'Only Wi-Fi/Ethernet and networks saved with `--networks` are served; VM bridges and other tunnels are ignored. Anyone who can reach these addresses and has the link can view the panel and refresh quota. Account sync stays on this machine.',
      'Add a network: `/check lan --networks 10.0.0.0/24` (`none` clears) · New link: `/check lan --new-token` · Turn off: `/check stop`',
    ].join('\n');
    return buildTerminateResponse(body);
  }

  // Default: `/check` or `/check panel` -> ensure background server is up,
  // pop open browser automatically, and print live English summary inline.
  const customPortIdx = args.indexOf('--port');
  const resolvedPort = (customPortIdx !== -1 && args[customPortIdx + 1])
    ? (Number.parseInt(args[customPortIdx + 1], 10) || port)
    : port;
  const noOpen = args.includes('--no-open');

  const [panelInfo, overview] = await Promise.all([
    ensurePanel({ port: resolvedPort, rootDir }),
    overviewBuilder({ rootDir, range: '24h' }),
  ]);

  if (panelInfo.ok && !noOpen) {
    openBrowser(panelInfo.url);
  }

  return buildTerminateResponse(formatOverviewMarkdown(overview, { panelInfo, limit: 8 }));
}

function main() {
  const chunks = [];
  let finished = false;

  const finish = async () => {
    if (finished) return;
    finished = true;
    const raw = Buffer.concat(chunks).toString('utf8').trim();
    let result = {};
    if (raw) {
      try {
        const payload = JSON.parse(raw);
        result = await handleCheckHook(payload);
      } catch {
        result = {};
      }
    }
    process.stdout.write(`${JSON.stringify(result)}\n`);
    process.exit(0);
  };

  const timer = setTimeout(() => { finish(); }, 500);
  process.stdin.on('data', chunk => chunks.push(chunk));
  process.stdin.on('end', () => {
    clearTimeout(timer);
    finish();
  });
  process.stdin.on('error', () => {
    clearTimeout(timer);
    finish();
  });
}

if (require.main === module) {
  main();
}

module.exports = {
  parseCheckInput,
  formatOverviewMarkdown,
  formatSessionMarkdown,
  buildTerminateResponse,
  handleCheckHook,
};
