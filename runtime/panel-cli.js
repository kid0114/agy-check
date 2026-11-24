'use strict';

const { spawn } = require('child_process');
const { buildPanelOverview, getSessionDetail, formatGapShort } = require('./panel-data.js');
const { createPanelServer, ensurePanelRunning, stopPanelDaemon, setLanNetworks, DEFAULT_PORT } = require('./panel-server.js');
const { refreshQuotaNow } = require('./quota.js');
const { previewAccountSync, executeAccountSync } = require('./account-sync.js');
const { ANSI_COLORS, formatTokens } = require('./renderer/format.js');
const { formatToolDuration } = require('./speed.js');
const { formatUsd } = require('./cost.js');

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  ...ANSI_COLORS,
};

function colorHit(rate, noColor = false) {
  if (rate === null || rate === undefined) return noColor ? '--' : `${C.gray}--${C.reset}`;
  const s = `${rate.toFixed(1)}%`;
  if (noColor) return s;
  if (rate >= 80) return `${C.green}${C.bold}${s}${C.reset}`;
  if (rate >= 50) return `${C.yellow}${s}${C.reset}`;
  return `${C.red}${s}${C.reset}`;
}

function colorQuota(pct, noColor = false) {
  if (pct === null || pct === undefined) return noColor ? '--' : `${C.gray}--${C.reset}`;
  const s = `${pct}%`;
  if (noColor) return s;
  if (pct <= 10) return `${C.red}${C.bold}${s}${C.reset}`;
  if (pct <= 30) return `${C.yellow}${s}${C.reset}`;
  return `${C.green}${s}${C.reset}`;
}

function padRight(str, len) {
  const s = String(str ?? '');
  if (s.length >= len) return s.slice(0, Math.max(1, len - 1)) + (len > 1 ? '…' : '');
  return s.padEnd(len, ' ');
}

function padLeft(str, len) {
  const s = String(str ?? '');
  return s.length >= len ? s : s.padStart(len, ' ');
}

function fmtRelative(ms, now = Date.now()) {
  if (!ms) return '--';
  const diff = Math.max(0, Math.floor((now - ms) / 1000));
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

function parseCliArgs(argv) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const eq = arg.indexOf('=');
      if (eq !== -1) {
        flags[arg.slice(2, eq)] = arg.slice(eq + 1);
      } else {
        const key = arg.slice(2);
        const next = argv[i + 1];
        if (next && !next.startsWith('-')) {
          flags[key] = next;
          i += 1;
        } else {
          flags[key] = true;
        }
      }
    } else if (arg === '-h') {
      flags.help = true;
    } else {
      positional.push(arg);
    }
  }
  return { command: positional[0] || 'ls', args: positional.slice(1), flags };
}

function formatOverviewTable(overview, options = {}) {
  const limit = Number.isFinite(options.limit) ? options.limit : 20;
  const noColor = Boolean(options.noColor || !process.stdout.isTTY);
  const now = options.now || Date.now();
  const lines = [];

  const auth = overview.auth || {};
  const quota = overview.quota || {};
  const summary = overview.summary || {};

  const hdr = (txt) => noColor ? txt : `${C.bold}${txt}${C.reset}`;
  const dim = (txt) => noColor ? txt : `${C.gray}${txt}${C.reset}`;

  // Header: account + quota
  const acctLabel = auth.activeEmail || (auth.loggedIn ? 'signed-in' : 'not-logged-in');
  const tierPart = quota.tier ? ` [${quota.tier}]` : '';
  lines.push(`${hdr('agy-check')}  Account: ${noColor ? acctLabel : `${C.cyan}${acctLabel}${C.reset}`}${tierPart}`);

  const quotaSegments = [];
  for (const p of quota.providers || []) {
    const parts = [];
    if (p.fiveHour) parts.push(`5h ${colorQuota(p.fiveHour.percent, noColor)}${p.fiveHour.resetIn ? dim(` ~${p.fiveHour.resetIn}`) : ''}`);
    if (p.weekly) parts.push(`wk ${colorQuota(p.weekly.percent, noColor)}${p.weekly.resetIn ? dim(` ~${p.weekly.resetIn}`) : ''}`);
    if (parts.length > 0) quotaSegments.push(`${p.label}: ${parts.join(', ')}`);
  }
  if (quotaSegments.length > 0) {
    lines.push(`Quota:     ${quotaSegments.join('  |  ')}`);
  } else if (quota.unavailableReason) {
    lines.push(`Quota:     unavailable (${quota.unavailableReason})`);
  }

  if (summary.unsyncedCount > 0) {
    const warnMsg = `WARNING: ${summary.unsyncedCount} running agy session(s) still hold an older account. Run 'agy-check sync' to preview.`;
    lines.push(noColor ? warnMsg : `${C.yellow}${C.bold}${warnMsg}${C.reset}`);
  }

  const speedSummary = (typeof summary.avgOutSpeed === 'number' || typeof summary.avgNetSpeed === 'number')
    ? `  speed=out ${typeof summary.avgOutSpeed === 'number' ? summary.avgOutSpeed.toFixed(1) : '--'}/net ${typeof summary.avgNetSpeed === 'number' ? summary.avgNetSpeed.toFixed(1) : '--'} t/s`
    : '';
  lines.push(
    `Summary:   range=${overview.range}  sessions=${summary.sessionCount}/${summary.totalSessionsAll} (running=${summary.runningCount}, unsynced=${summary.unsyncedCount})  ` +
    `weighted-hit=${colorHit(summary.weightedHitRate, noColor)}${speedSummary}  ` +
    `tokens=${formatTokens(summary.totalCacheRead)} cache / ${formatTokens(summary.totalUncachedInput)} uncached / ${formatTokens(summary.totalOutput)} out`
  );
  lines.push('');

  const rows = (overview.sessions || []).slice(0, limit);
  if (rows.length === 0) {
    lines.push('No sessions match the current filter.');
    return lines.join('\n') + '\n';
  }

  const headerLine =
    `${padRight('STATE', 12)}  ${padRight('ID', 9)}  ${padRight('MODEL', 20)}  ${padLeft('TRN', 4)}  ` +
    `${padLeft('LAST', 7)}  ${padLeft('AVG', 7)}  ${padLeft('OUT/NET', 12)}  ${padRight('CACHE / UNC / OUT', 23)}  ${padLeft('AGE', 5)}  TITLE`;
  lines.push(dim(headerLine));
  lines.push(dim('─'.repeat(Math.min(148, headerLine.length + 28))));

  for (const s of rows) {
    const rawState = s.syncStatus === 'unsynced' ? `${s.status}!` : s.status;
    const stateCell = noColor
      ? padRight(rawState, 12)
      : (s.syncStatus === 'unsynced'
          ? `${C.yellow}${padRight(rawState, 12)}${C.reset}`
          : s.status === 'generating'
            ? `${C.green}${padRight(rawState, 12)}${C.reset}`
            : s.status === 'running'
              ? `${C.cyan}${padRight(rawState, 12)}${C.reset}`
              : `${C.gray}${padRight(rawState, 12)}${C.reset}`);

    const lastStr = s.lastTurnHitRate === null ? '--' : `${s.lastTurnHitRate.toFixed(1)}%`;
    const avgStr = s.sessionHitRate === null ? '--' : `${s.sessionHitRate.toFixed(1)}%`;
    const lastPad = padLeft(lastStr, 7);
    const avgPad = padLeft(avgStr, 7);
    const lastCell = noColor ? lastPad : lastPad.replace(lastStr, colorHit(s.lastTurnHitRate, false));
    const avgCell = noColor ? avgPad : avgPad.replace(avgStr, colorHit(s.sessionHitRate, false));
    const outSpd = typeof s.speed?.totalSpeed === 'number' ? s.speed.totalSpeed.toFixed(1) : null;
    const netSpd = typeof s.speed?.visibleSpeed === 'number' ? s.speed.visibleSpeed.toFixed(1) : null;
    const spdStr = (outSpd !== null || netSpd !== null) ? `${outSpd ?? '--'}/${netSpd ?? '--'}` : '--';
    const tokStr = `${formatTokens(s.totalCacheRead)} / ${formatTokens(s.totalUncachedInput)} / ${formatTokens(s.totalOutput)}`;
    const titleSuffix = s.currentDir ? ` [${s.currentDir}]` : '';
    const titleStr = padRight(`${s.title}${titleSuffix}`, 44);

    lines.push(
      `${stateCell}  ${padRight(s.shortId, 9)}  ${padRight(s.modelLabel, 20)}  ${padLeft(String(s.turnsCount), 4)}  ` +
      `${lastCell}  ${avgCell}  ${padLeft(spdStr, 12)}  ${padRight(tokStr, 23)}  ${padLeft(fmtRelative(s.lastActivityMs, now), 5)}  ${titleStr}`
    );
  }

  if (overview.sessions.length > rows.length) {
    lines.push(dim(`... and ${overview.sessions.length - rows.length} more session(s). Use --limit or 'agy-check panel' to inspect all.`));
  }
  return lines.join('\n') + '\n';
}

function formatSessionDetailText(detail, options = {}) {
  const noColor = Boolean(options.noColor || !process.stdout.isTTY);
  const lines = [];
  lines.push(`Session:  ${detail.title}`);
  lines.push(`ID:       ${detail.conversationId}`);
  lines.push(`Status:   ${detail.status}  Sync: ${detail.syncStatus}${detail.accountEmail ? ` (${detail.accountEmail})` : ''}${detail.pid ? `  PID: ${detail.pid}` : ''}`);
  if (detail.cwd) lines.push(`CWD:      ${detail.cwd}${detail.branch ? ` (${detail.branch})` : ''}`);
  lines.push(
    `Totals:   turns=${detail.turnsCount}  session-hit=${colorHit(detail.sessionHitRate, noColor)}  last-hit=${colorHit(detail.lastTurnHitRate, noColor)}  ` +
    `cache=${formatTokens(detail.totalCacheRead)}  uncached=${formatTokens(detail.totalUncachedInput)}  out=${formatTokens(detail.totalOutput)}  ` +
    `tool=${formatToolDuration(detail.toolDurationMs) || '--'}  est=${formatUsd(detail.estimatedCostUsd)}`
  );
  if (detail.speed) {
    const outS = typeof detail.speed.totalSpeed === 'number' ? `${detail.speed.totalSpeed.toFixed(1)} t/s` : '--';
    const netS = typeof detail.speed.visibleSpeed === 'number' ? `${detail.speed.visibleSpeed.toFixed(1)} t/s` : '--';
    const avgOut = typeof detail.speed.avgTotalSpeed === 'number' ? `${detail.speed.avgTotalSpeed.toFixed(1)}` : '--';
    const avgNet = typeof detail.speed.avgVisibleSpeed === 'number' ? `${detail.speed.avgVisibleSpeed.toFixed(1)}` : '--';
    lines.push(`Speed:    out=${outS}  net=${netS}  (session avg: out=${avgOut} / net=${avgNet} t/s, source=${detail.speed.source || 'unknown'})`);
  }
  lines.push(`Resume:   ${detail.resumeCommand}`);
  lines.push('');

  if (!detail.turns || detail.turns.length === 0) {
    lines.push(
      detail.hasTranscript === false
        ? 'Historical summary from conversation_summaries.db (transcript.jsonl not present on disk).'
        : 'No PLANNER_RESPONSE turns recorded yet.'
    );
    return lines.join('\n') + '\n';
  }

  lines.push(
    `${padLeft('TRN', 4)}  ${padLeft('STEP', 5)}  ${padLeft('GAP', 8)}  ${padRight('MODEL', 22)}  ` +
    `${padLeft('UNC', 8)}  ${padLeft('CACHE', 8)}  ${padLeft('OUT', 7)}  ${padLeft('HIT%', 7)}  DIAGNOSIS`
  );
  lines.push('─'.repeat(106));
  for (const t of detail.turns) {
    const hitRaw = `${t.hitRate.toFixed(1)}%`;
    const hitPad = padLeft(hitRaw, 7);
    const hitCell = noColor ? hitPad : hitPad.replace(hitRaw, colorHit(t.hitRate, false));
    const diag = (t.missReasons || []).map(r => `${r.label} (${r.detail})`).join('; ') || '--';
    lines.push(
      `${padLeft('#' + t.turnIndex, 4)}  ${padLeft(String(t.stepIndex ?? '--'), 5)}  ${padLeft(formatGapShort(t.gapMs) || '--', 8)}  ` +
      `${padRight(t.modelLabel, 22)}  ${padLeft(formatTokens(t.inputTokens), 8)}  ${padLeft(formatTokens(t.cacheReadTokens), 8)}  ` +
      `${padLeft(formatTokens(t.outputTokens), 7)}  ${hitCell}  ${diag}`
    );
  }
  return lines.join('\n') + '\n';
}

function openBrowserUrl(url) {
  try {
    const cmd = process.platform === 'darwin' ? 'open' : (process.platform === 'win32' ? 'cmd' : 'xdg-open');
    const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
    const child = spawn(cmd, args, { detached: true, stdio: 'ignore' });
    child.unref();
  } catch {
    // Non-fatal if browser cannot be opened automatically
  }
}

function getHelpText() {
  return [
    'Usage: agy-check <command> [options]',
    '',
    'Commands:',
    `  panel [--port ${DEFAULT_PORT}] [--daemon] [--open]  Start the local WebUI dashboard (127.0.0.1)`,
    '     [--lan] [--new-token]                      Also serve phones on Wi-Fi/Ethernet via a token link',
    '     [--networks <cidr,...>|none]               Also serve these extra networks (saved), e.g. a VPN overlay',
    '  panel stop                                    Stop the background WebUI panel daemon',
    '  ls [--range 24h] [--sort recent]              Print a static multi-session summary table',
    '     [--account all|unsynced|email] [--q text] [--limit 20] [--refresh] [--json]',
    '  session <id-prefix> [--json]       Inspect per-turn cache hit rate & miss diagnosis for one session',
    '  sync [--apply]                     Preview (default --dry-run) or execute agy-sync-keychain.sh',
    '  config                             Launch the HUD configuration wizard',
    '  update                             Self-update agy-check runtime',
    '',
  ].join('\n');
}

async function runPanelCli(argv = process.argv.slice(2)) {
  const { command, args, flags } = parseCliArgs(argv);

  if (flags.help || command === 'help') {
    process.stdout.write(getHelpText());
    return 0;
  }

  if (command === 'config') {
    const { startWizard } = require('./config-wizard.js');
    await startWizard();
    return 0;
  }

  if (command === 'update') {
    const path = require('path');
    const hudBin = path.join(__dirname, 'bin', 'agy-hud.js');
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [hudBin, '--update'], { stdio: 'inherit' });
      child.on('exit', () => resolve());
      child.on('error', reject);
    });
    return 0;
  }

  if (command === 'panel' || command === 'web' || command === 'serve') {
    if (args[0] === 'stop') {
      const res = await stopPanelDaemon();
      if (res.stopped) {
        process.stdout.write(`Stopped agy-check panel daemon (PID ${res.pid}).\n`);
      } else {
        process.stdout.write(`agy-check panel daemon is not running (${res.reason}).\n`);
      }
      return 0;
    }

    const port = flags.port ? Number.parseInt(String(flags.port), 10) : DEFAULT_PORT;
    if (!Number.isInteger(port) || port < 0 || port > 65535) {
      process.stderr.write(`Invalid port: ${flags.port}\n`);
      return 1;
    }

    const lan = Boolean(flags.lan);
    const rotateToken = lan && Boolean(flags['new-token']);
    let networksChanged = false;
    if (lan && typeof flags.networks === 'string') {
      try {
        setLanNetworks(null, flags.networks === 'none' ? [] : flags.networks.split(','));
        networksChanged = true;
      } catch (err) {
        process.stderr.write(`${err.message}\n`);
        return 1;
      }
    }
    const printLanUrls = (urls) => {
      if (urls.length === 0) return;
      process.stdout.write('Phone link (anyone on these networks with it can view):\n');
      for (const u of urls) process.stdout.write(`  ${u}\n`);
    };

    if (flags.daemon) {
      const res = await ensurePanelRunning({ port, lan, rotateToken, restart: networksChanged });
      if (!res.ok) {
        process.stderr.write(`Failed to start panel daemon: ${res.error || 'unknown error'}\n`);
        return 1;
      }
      process.stdout.write(
        res.alreadyRunning
          ? `agy-check panel already running at ${res.url}\n`
          : `agy-check panel started in background at ${res.url} (PID ${res.pid})\n`
      );
      printLanUrls(res.lanUrls || []);
      if (flags.open) openBrowserUrl(res.url);
      return 0;
    }

    const panel = createPanelServer({ port, lan, rotateToken });
    const info = await panel.listen();
    process.stdout.write(`agy-check panel listening at ${info.url}\n`);
    printLanUrls(panel.lanUrls());
    process.stdout.write('Press Ctrl+C to stop.\n');
    if (flags.open) {
      openBrowserUrl(info.url);
    }
    await new Promise(resolve => {
      const stop = () => {
        panel.close().then(resolve);
      };
      process.once('SIGINT', stop);
      process.once('SIGTERM', stop);
    });
    return 0;
  }

  if (command === 'ls' || command === 'list' || command === 'status') {
    if (flags.refresh) {
      await refreshQuotaNow().catch(() => null);
    }
    const overview = await buildPanelOverview({
      range: typeof flags.range === 'string' ? flags.range : '24h',
      sort: typeof flags.sort === 'string' ? flags.sort : 'recent',
      query: typeof flags.q === 'string' ? flags.q : '',
      account: typeof flags.account === 'string' ? flags.account : 'all',
      includeEmpty: Boolean(flags.empty),
    });
    if (flags.json) {
      process.stdout.write(`${JSON.stringify(overview, null, 2)}\n`);
    } else {
      const limit = flags.limit ? Number.parseInt(String(flags.limit), 10) : 20;
      process.stdout.write(formatOverviewTable(overview, { limit }));
    }
    return 0;
  }

  if (command === 'session' || command === 'inspect') {
    const target = args[0];
    if (!target) {
      process.stderr.write('Usage: agy-check session <conversation-id-or-prefix> [--json]\n');
      return 1;
    }
    const detail = await getSessionDetail(target);
    if (!detail) {
      process.stderr.write(`Session not found: ${target}\n`);
      return 1;
    }
    if (flags.json) {
      process.stdout.write(`${JSON.stringify(detail, null, 2)}\n`);
    } else {
      process.stdout.write(formatSessionDetailText(detail));
    }
    return 0;
  }

  if (command === 'sync') {
    if (flags.apply) {
      const res = await executeAccountSync({ confirm: true });
      if (res.output) process.stdout.write(`${res.output}\n`);
      if (!res.ok) {
        process.stderr.write(`Sync failed: ${res.error}\n`);
        return 1;
      }
      return 0;
    }
    const preview = previewAccountSync();
    if (preview.rawOutput) process.stdout.write(`${preview.rawOutput}\n`);
    if (preview.error) {
      process.stderr.write(`Error: ${preview.error}\n`);
      return 1;
    }
    process.stdout.write('\nPass --apply to execute the sync above.\n');
    return 0;
  }

  process.stderr.write(`Unknown command: ${command}\n\n${getHelpText()}`);
  return 1;
}

module.exports = {
  parseCliArgs,
  formatOverviewTable,
  formatSessionDetailText,
  openBrowserUrl,
  getHelpText,
  runPanelCli,
};
