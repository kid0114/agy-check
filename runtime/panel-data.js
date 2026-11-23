'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { resolveAntigravityPath, resolveSafeExecutable } = require('./paths.js');
const { calculateTokenCost } = require('./cost.js');
const { getQuota, readToken, readCachePayload, readAccountQuotaStore } = require('./quota.js');
const { classifyQuotaWindow, isObservationExpired, pickCriticalWindow } = require('./quota/models.js');
const { simplifyModelName, formatQuotaPercent, formatDuration } = require('./renderer/format.js');
const { getSpeedCachePath, estimateTokens } = require('./speed.js');
const { readAllSessionSnapshots } = require('./session-snapshot.js');
const { inspectLiveAuth, detectRunningAgySessions, resolveSyncScriptPath } = require('./account-sync.js');

const DEFAULT_TTL_GAP_MS = 5 * 60 * 1000;
const ACTIVE_WINDOW_MS = 30 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const MONTH_WINDOW_MS = 30 * DAY_MS;
const GENERATING_STALE_MS = 15 * 60 * 1000;

function isFiniteNonNeg(v) {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0;
}

function cleanUserPromptTitle(rawText) {
  if (!rawText || typeof rawText !== 'string') return '';
  let text = rawText
    .replace(/<\/?USER_REQUEST>/gi, ' ')
    .replace(/<ADDITIONAL_METADATA>[\s\S]*?<\/ADDITIONAL_METADATA>/gi, ' ')
    .replace(/<USER_SETTINGS_CHANGE>[\s\S]*?<\/USER_SETTINGS_CHANGE>/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length > 110) {
    text = `${text.slice(0, 109)}…`;
  }
  return text;
}

function formatGapShort(ms) {
  if (!isFiniteNonNeg(ms)) return '';
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const remSec = sec % 60;
  if (min < 60) return remSec > 0 ? `${min}m${remSec}s` : `${min}m`;
  const hr = Math.floor(min / 60);
  const remMin = min % 60;
  if (hr < 24) return remMin > 0 ? `${hr}h${remMin}m` : `${hr}h`;
  const days = Math.floor(hr / 24);
  return `${days}d${hr % 24}h`;
}

/**
 * Classifies likely cache-miss causes for a single turn relative to the prior turn.
 */
function formatModelLabel(raw) {
  if (!raw || typeof raw !== 'string') return 'Unknown';
  const simplified = simplifyModelName(raw);
  if (simplified !== raw) return simplified;
  // Format display names such as "Gemini 4 Neon (XHigh)" or "Gemini 4 Hydrogen (Medium)"
  const mDisp = raw.match(/^Gemini ([\d.]+) ([A-Za-z0-9]+) \((XHigh|High|Medium|Low|Thinking|Lite)\)$/i);
  if (mDisp) {
    const tierMap = { xhigh: 'XH', high: 'H', medium: 'M', low: 'L', thinking: 'Th', lite: 'Lite' };
    return `Gemini ${mDisp[1]} ${mDisp[2]}(${tierMap[mDisp[3].toLowerCase()] || mDisp[3]})`;
  }
  // Format slug IDs such as "gemini-4-neon-xhigh" or "claude-opus-4-6-thinking"
  const mGem = raw.match(/^gemini-([\d.]+)-([a-z0-9]+)(?:-(xhigh|high|medium|low|thinking|lite))?$/i);
  if (mGem) {
    const fam = mGem[2].charAt(0).toUpperCase() + mGem[2].slice(1).toLowerCase();
    const tierMap = { xhigh: 'XH', high: 'H', medium: 'M', low: 'L', thinking: 'Th', lite: 'Lite' };
    const t = mGem[3] ? `(${tierMap[mGem[3].toLowerCase()] || mGem[3]})` : '';
    return `Gemini ${mGem[1]} ${fam}${t}`;
  }
  const mCla = raw.match(/^claude-(opus|sonnet|haiku)-([\d.-]+?)(?:-(thinking|high|medium|low))?$/i);
  if (mCla) {
    const fam = mCla[1].charAt(0).toUpperCase() + mCla[1].slice(1).toLowerCase();
    const ver = mCla[2].replace(/-/g, '.');
    const tierMap = { thinking: 'Th', high: 'H', medium: 'M', low: 'L' };
    const t = mCla[3] ? `(${tierMap[mCla[3].toLowerCase()] || mCla[3]})` : '';
    return `${fam} ${ver}${t}`;
  }
  return simplified;
}

function diagnoseTurnCacheMiss(turn, prevTurn, ttlGapMs = DEFAULT_TTL_GAP_MS) {
  if (!prevTurn) return [];
  const dropFromPrev = prevTurn.hitRate - turn.hitRate;
  const isNotableMiss = turn.hitRate < 50 || (dropFromPrev >= 25 && turn.hitRate < 80);
  if (!isNotableMiss) return [];

  const reasons = [];
  if (prevTurn.model && turn.model && prevTurn.model !== turn.model) {
    reasons.push({
      code: 'model_switch',
      label: 'Model switch',
      detail: `${formatModelLabel(prevTurn.model)} -> ${formatModelLabel(turn.model)}`,
    });
  }

  if (typeof turn.gapMs === 'number' && turn.gapMs >= ttlGapMs) {
    reasons.push({
      code: 'ttl_gap',
      label: 'Idle gap (TTL)',
      detail: `${formatGapShort(turn.gapMs)} between turns`,
    });
  }

  if (prevTurn.totalPrompt > 0 && turn.totalPrompt < prevTurn.totalPrompt * 0.75) {
    const dropPct = Math.round((1 - (turn.totalPrompt / prevTurn.totalPrompt)) * 100);
    reasons.push({
      code: 'context_drop',
      label: 'Context drop',
      detail: `Prompt shrank by ${dropPct}% (possible compaction/reset)`,
    });
  }

  if (reasons.length === 0) {
    reasons.push({
      code: 'prefix_or_eviction',
      label: 'Prefix change / eviction',
      detail: 'No model switch or >5m idle gap detected',
    });
  }

  return reasons;
}

/**
 * Parses a transcript.jsonl file into turn-level cache metrics, session totals,
 * per-model breakdowns, and fallback title. Uses an incremental `(mtimeMs, size)` cache.
 */
function parseTranscriptMetrics(transcriptPath, cache = null, options = {}) {
  const ttlGapMs = options.ttlGapMs || DEFAULT_TTL_GAP_MS;
  let stat;
  try {
    stat = fs.statSync(transcriptPath);
    if (!stat.isFile()) return null;
  } catch {
    return null;
  }

  const cacheKey = transcriptPath;
  if (cache instanceof Map) {
    const cached = cache.get(cacheKey);
    if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
      return cached.parsed;
    }
  }

  let content = '';
  try {
    content = fs.readFileSync(transcriptPath, 'utf8');
  } catch {
    return null;
  }

  const turns = [];
  let maxStepIndex = 0;
  let firstUserPrompt = '';
  let lastModel = null;
  let totalUncachedInput = 0;
  let totalCacheRead = 0;
  let totalCacheWrite = 0;
  let totalOutput = 0;
  let totalVisibleOutput = 0;
  let totalEstimatedCostUsd = 0;
  let unpricedTurnCount = 0;
  let totalApiDurationMs = 0;
  let lastEntryTimeMs = null;
  let firstActivityMs = null;
  let lastActivityMs = stat.mtimeMs;
  const byModelMap = new Map();

  for (const rawLine of content.split('\n')) {
    if (!rawLine.trim()) continue;
    let entry;
    try {
      entry = JSON.parse(rawLine);
    } catch {
      continue;
    }
    if (!entry || typeof entry !== 'object') continue;

    if (typeof entry.step_index === 'number' && entry.step_index > maxStepIndex) {
      maxStepIndex = entry.step_index;
    }

    const entryTimeMs = typeof entry.created_at === 'string' ? Date.parse(entry.created_at) : NaN;
    const validTimeMs = Number.isFinite(entryTimeMs) ? entryTimeMs : null;
    if (validTimeMs !== null) {
      if (firstActivityMs === null || validTimeMs < firstActivityMs) firstActivityMs = validTimeMs;
      if (validTimeMs > lastActivityMs) lastActivityMs = validTimeMs;
    }

    if (entry.type === 'USER_INPUT' && !firstUserPrompt && typeof entry.content === 'string') {
      const cleaned = cleanUserPromptTitle(entry.content);
      if (cleaned) firstUserPrompt = cleaned;
    }

    if (entry.type === 'PLANNER_RESPONSE') {
      if (lastEntryTimeMs !== null && validTimeMs !== null && validTimeMs >= lastEntryTimeMs) {
        totalApiDurationMs += (validTimeMs - lastEntryTimeMs);
      }

      if (isFiniteNonNeg(entry.input_tokens)) {
        const inp = entry.input_tokens;
        const cr = isFiniteNonNeg(entry.cache_read_tokens)
          ? entry.cache_read_tokens
          : (isFiniteNonNeg(entry.cache_read_input_tokens) ? entry.cache_read_input_tokens : 0);
        const cw = isFiniteNonNeg(entry.cache_creation_input_tokens)
          ? entry.cache_creation_input_tokens
          : (isFiniteNonNeg(entry.cache_creation_tokens) ? entry.cache_creation_tokens : 0);
        const out = isFiniteNonNeg(entry.output_tokens) ? entry.output_tokens : 0;
        const contentVis = estimateTokens(entry.content || '');
        const toolsVis = Array.isArray(entry.tool_calls) && entry.tool_calls.length > 0
          ? estimateTokens(JSON.stringify(entry.tool_calls))
          : 0;
        const stepVisible = Math.min(out, Math.round(contentVis + toolsVis));
        const totalPrompt = inp + cr + cw;
        const hitRate = totalPrompt > 0 ? Math.min(100, Math.max(0, (cr / totalPrompt) * 100)) : 0;
        const model = typeof entry.model === 'string' && entry.model.trim() ? entry.model.trim() : (lastModel || 'unknown');
        lastModel = model;

        const prevTurn = turns.length > 0 ? turns[turns.length - 1] : null;
        const gapMs = (prevTurn && prevTurn.createdAtMs !== null && validTimeMs !== null)
          ? Math.max(0, validTimeMs - prevTurn.createdAtMs)
          : null;

        // Price each turn at the rates in effect when it ran; null means the model has no known price.
        const turnCost = calculateTokenCost(model, {
          input_tokens: inp,
          output_tokens: out,
          cache_read_input_tokens: cr,
          cache_creation_input_tokens: cw,
        }, validTimeMs ?? stat.mtimeMs);

        const turnRecord = {
          turnIndex: turns.length + 1,
          stepIndex: typeof entry.step_index === 'number' ? entry.step_index : null,
          createdAt: entry.created_at || null,
          createdAtMs: validTimeMs,
          gapMs,
          model,
          modelLabel: formatModelLabel(model),
          inputTokens: inp,
          cacheReadTokens: cr,
          cacheWriteTokens: cw,
          outputTokens: out,
          totalPrompt,
          hitRate,
          estimatedCostUsd: turnCost,
          missReasons: [],
        };
        turnRecord.missReasons = diagnoseTurnCacheMiss(turnRecord, prevTurn, ttlGapMs);
        turns.push(turnRecord);

        totalUncachedInput += inp;
        totalCacheRead += cr;
        totalCacheWrite += cw;
        totalOutput += out;
        totalVisibleOutput += stepVisible;
        totalEstimatedCostUsd += turnCost || 0;
        if (turnCost === null) unpricedTurnCount += 1;

        if (!byModelMap.has(model)) {
          byModelMap.set(model, {
            model,
            modelLabel: formatModelLabel(model),
            turns: 0,
            uncachedInput: 0,
            cacheRead: 0,
            cacheWrite: 0,
            totalPrompt: 0,
            output: 0,
            estimatedCostUsd: 0,
            unpricedTurns: 0,
          });
        }
        const mStats = byModelMap.get(model);
        mStats.turns += 1;
        mStats.uncachedInput += inp;
        mStats.cacheRead += cr;
        mStats.cacheWrite += cw;
        mStats.totalPrompt += totalPrompt;
        mStats.output += out;
        mStats.estimatedCostUsd += turnCost || 0;
        if (turnCost === null) mStats.unpricedTurns += 1;
      }
    }

    if (validTimeMs !== null) {
      lastEntryTimeMs = validTimeMs;
    }
  }

  const totalPrompt = totalUncachedInput + totalCacheRead + totalCacheWrite;
  const sessionHitRate = totalPrompt > 0
    ? Math.min(100, Math.max(0, (totalCacheRead / totalPrompt) * 100))
    : null;
  const lastTurn = turns.length > 0 ? turns[turns.length - 1] : null;
  const missTurnCount = turns.filter(t => t.missReasons.length > 0).length;

  const byModel = Array.from(byModelMap.values()).map(m => ({
    ...m,
    hitRate: m.totalPrompt > 0 ? Math.min(100, Math.max(0, (m.cacheRead / m.totalPrompt) * 100)) : null,
  }));

  const parsed = {
    transcriptPath,
    mtimeMs: stat.mtimeMs,
    size: stat.size,
    steps: maxStepIndex,
    firstUserPrompt,
    lastModel,
    turnsCount: turns.length,
    totalUncachedInput,
    totalCacheRead,
    totalCacheWrite,
    totalPrompt,
    totalOutput,
    totalVisibleOutput,
    sessionHitRate,
    lastTurnHitRate: lastTurn ? lastTurn.hitRate : null,
    lastTurnPrompt: lastTurn ? lastTurn.totalPrompt : 0,
    lastTurnCacheRead: lastTurn ? lastTurn.cacheReadTokens : 0,
    missTurnCount,
    totalEstimatedCostUsd,
    unpricedTurnCount,
    totalApiDurationMs,
    firstActivityMs: firstActivityMs || stat.birthtimeMs || stat.mtimeMs,
    lastActivityMs,
    byModel,
    turns,
  };

  if (cache instanceof Map) {
    cache.set(cacheKey, { mtimeMs: stat.mtimeMs, size: stat.size, parsed });
  }
  return parsed;
}

/**
 * Loads official conversation titles & step counts from agy's read-only SQLite DB
 * (`conversation_summaries.db`), cached by mtime.
 */
function loadConversationSummaries(rootDir = null, cache = null) {
  const baseDir = rootDir || resolveAntigravityPath('');
  const dbPath = path.join(baseDir, 'conversation_summaries.db');
  const empty = new Map();

  let stat;
  try {
    stat = fs.statSync(dbPath);
    if (!stat.isFile()) return empty;
  } catch {
    return empty;
  }

  if (cache && cache.dbPath === dbPath && cache.mtimeMs === stat.mtimeMs && cache.map instanceof Map) {
    return cache.map;
  }

  const sqliteBin = resolveSafeExecutable('sqlite3') || (fs.existsSync('/usr/bin/sqlite3') ? '/usr/bin/sqlite3' : null);
  if (!sqliteBin) return empty;

  try {
    const out = execFileSync(sqliteBin, [
      '-readonly',
      '-json',
      dbPath,
      'SELECT conversation_id, step_count, title, preview, last_modified_time, workspace_uris FROM conversation_summaries;',
    ], {
      encoding: 'utf8',
      timeout: 2500,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();

    const rows = out ? JSON.parse(out) : [];
    const map = new Map();
    if (Array.isArray(rows)) {
      for (const row of rows) {
        if (row && typeof row.conversation_id === 'string') {
          let cwd = null;
          if (typeof row.workspace_uris === 'string' && row.workspace_uris.trim()) {
            try {
              const uris = JSON.parse(row.workspace_uris);
              if (Array.isArray(uris) && typeof uris[0] === 'string' && uris[0].startsWith('file://')) {
                cwd = decodeURIComponent(uris[0].slice('file://'.length));
              }
            } catch {}
          }
          const lastModMs = typeof row.last_modified_time === 'string' ? Date.parse(row.last_modified_time) : NaN;
          map.set(row.conversation_id, {
            title: typeof row.title === 'string' ? row.title.trim() : '',
            preview: typeof row.preview === 'string' ? row.preview.trim() : '',
            stepCount: typeof row.step_count === 'number' ? row.step_count : 0,
            lastModifiedMs: Number.isFinite(lastModMs) ? lastModMs : null,
            cwd,
          });
        }
      }
    }
    if (cache && typeof cache === 'object') {
      cache.dbPath = dbPath;
      cache.mtimeMs = stat.mtimeMs;
      cache.map = map;
    }
    return map;
  } catch {
    return empty;
  }
}

function readAllHookTimings(rootDir = null) {
  const baseDir = rootDir || resolveAntigravityPath('');
  const speedDir = path.join(baseDir, 'speed-cache');
  const map = new Map();
  let entries;
  try {
    entries = fs.readdirSync(speedDir);
  } catch {
    return map;
  }
  for (const name of entries) {
    if (!name.startsWith('hook-timing-') || !name.endsWith('.json')) continue;
    const convId = name.slice('hook-timing-'.length, -'.json'.length);
    try {
      const parsed = JSON.parse(fs.readFileSync(path.join(speedDir, name), 'utf8'));
      if (parsed && typeof parsed === 'object') {
        map.set(convId, parsed);
      }
    } catch {
      // Ignore malformed timing file
    }
  }
  return map;
}

/**
 * Reads persisted speed-cache entry for a conversation across all candidate path keys
 * (including the legacy ~/.gemini/antigravity/brain/<id>/... path that agy passes in stdin).
 */
function readSpeedCacheForConversation(convId, baseDir, snapshot = null) {
  const candidates = [];
  const addKey = (p) => {
    if (p && typeof p === 'string' && !candidates.includes(p)) candidates.push(p);
  };

  // Legacy path sent by agy stdin (most speed-cache files are keyed on this)
  const parentGemini = path.dirname(baseDir);
  if (path.basename(baseDir) === 'antigravity-cli') {
    addKey(path.join(parentGemini, 'antigravity', 'brain', convId, '.system_generated', 'logs', 'transcript.jsonl'));
  }
  addKey(path.join(os.homedir(), '.gemini', 'antigravity', 'brain', convId, '.system_generated', 'logs', 'transcript.jsonl'));
  addKey(path.join(baseDir, 'brain', convId, '.system_generated', 'logs', 'transcript.jsonl'));
  addKey(snapshot?.transcriptPath);
  addKey(convId);

  let best = null;
  let bestMtime = -1;
  for (const keyTarget of candidates) {
    const cacheFile = getSpeedCachePath(baseDir, keyTarget);
    try {
      const stat = fs.statSync(cacheFile);
      if (!stat.isFile() || stat.mtimeMs <= bestMtime) continue;
      const raw = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      if (raw && typeof raw === 'object') {
        best = raw;
        bestMtime = stat.mtimeMs;
      }
    } catch {
      // Missing or unreadable speed cache entry
    }
  }
  return best;
}

/**
 * Builds unified speed metrics (`out` totalSpeed + `net` visibleSpeed, plus session averages)
 * by merging speed-cache, HUD snapshot, and transcript/hook fallback.
 */
function resolveSessionSpeed(convId, baseDir, snapshot, parsed, timing) {
  const sc = readSpeedCacheForConversation(convId, baseDir, snapshot);
  const snapSpeed = snapshot?.speed || null;

  const totalSpeed = isFiniteNonNeg(sc?.speed)
    ? sc.speed
    : (isFiniteNonNeg(snapSpeed?.totalSpeed) ? snapSpeed.totalSpeed : null);

  const visibleSpeed = isFiniteNonNeg(sc?.visibleSpeed)
    ? sc.visibleSpeed
    : (isFiniteNonNeg(snapSpeed?.visibleSpeed) ? snapSpeed.visibleSpeed : null);

  const apiMs = isFiniteNonNeg(sc?.apiDurationMs) && sc.apiDurationMs >= 500
    ? sc.apiDurationMs
    : (isFiniteNonNeg(timing?.totalApiDurationMs) && timing.totalApiDurationMs >= 500
        ? timing.totalApiDurationMs
        : (isFiniteNonNeg(parsed?.totalApiDurationMs) && parsed.totalApiDurationMs >= 500
            ? parsed.totalApiDurationMs
            : null));

  const outTokens = isFiniteNonNeg(sc?.totalOutputTokens)
    ? sc.totalOutputTokens
    : (isFiniteNonNeg(parsed?.totalOutput) ? parsed.totalOutput : null);
  const visTokens = isFiniteNonNeg(sc?.visibleOutputTokens)
    ? sc.visibleOutputTokens
    : (isFiniteNonNeg(parsed?.totalVisibleOutput) ? parsed.totalVisibleOutput : null);

  const avgTotalSpeed = (apiMs && outTokens && outTokens > 0) ? (outTokens / (apiMs / 1000)) : null;
  const avgVisibleSpeed = (apiMs && visTokens && visTokens > 0)
    ? (Math.min(outTokens ?? visTokens, visTokens) / (apiMs / 1000))
    : null;

  const effectiveOut = totalSpeed !== null ? totalSpeed : avgTotalSpeed;
  const effectiveNet = visibleSpeed !== null ? visibleSpeed : avgVisibleSpeed;

  if (effectiveOut === null && effectiveNet === null) return null;

  return {
    totalSpeed: effectiveOut,
    visibleSpeed: effectiveNet,
    latestTotalSpeed: totalSpeed,
    latestVisibleSpeed: visibleSpeed,
    avgTotalSpeed,
    avgVisibleSpeed,
    source: sc ? (sc.source || 'speed-cache') : (snapSpeed ? 'snapshot' : 'session-avg'),
  };
}

/**
 * Extracts normalized provider-level quota windows matching renderer/quota-render.js.
 */
function buildQuotaOverview(quotaModels, providerQuotaRaw, now = Date.now()) {
  const isImageModel = (q) => Boolean(
    (q?.id && q.id.includes('image')) ||
    (q?.displayName && q.displayName.toLowerCase().includes('image'))
  );

  const providers = {
    google: { key: 'google', label: 'Google / Gemini', fiveHour: null, weekly: null },
    claude: { key: 'claude', label: 'Third-party (3P)', fiveHour: null, weekly: null },
    argon: { key: 'argon', label: 'Argon', fiveHour: null, weekly: null },
  };

  for (const q of Array.isArray(quotaModels) ? quotaModels : []) {
    if (!q || isImageModel(q)) continue;
    const isArgon = /argon/i.test(q.id || q.displayName || '');
    const isGoogle = !isArgon && (q.modelProvider === 'MODEL_PROVIDER_GOOGLE' || /gemini/i.test(q.id || q.displayName || ''));
    const isClaude = q.modelProvider === 'MODEL_PROVIDER_ANTHROPIC' || /claude/i.test(q.id || q.displayName || '') || /gpt/i.test(q.id || q.displayName || '');
    const key = isArgon ? 'argon' : isGoogle ? 'google' : isClaude ? 'claude' : null;
    if (!key) continue;

    if (q.windows?.fiveHour && !isObservationExpired(q.windows.fiveHour, now)) {
      const cur = providers[key].fiveHour;
      const win = q.windows.fiveHour;
      if (!cur || (win.observedAt || 0) > (cur.observedAt || 0) ||
          ((win.observedAt || 0) === (cur.observedAt || 0) && win.remainingFraction < cur.remainingFraction)) {
        providers[key].fiveHour = win;
      }
    }
    if (q.windows?.weekly && !isObservationExpired(q.windows.weekly, now)) {
      const cur = providers[key].weekly;
      const win = q.windows.weekly;
      if (!cur || (win.observedAt || 0) > (cur.observedAt || 0) ||
          ((win.observedAt || 0) === (cur.observedAt || 0) && win.remainingFraction < cur.remainingFraction)) {
        providers[key].weekly = win;
      }
    }

    if (q.resetTime && !q.windows?.fiveHour && !q.windows?.weekly) {
      const winType = classifyQuotaWindow(q.resetTime, now);
      if (winType === 'fiveHour') {
        const cur = providers[key].fiveHour;
        if (!cur || q.remainingFraction < cur.remainingFraction) {
          providers[key].fiveHour = { remainingFraction: q.remainingFraction, resetTime: q.resetTime };
        }
      } else if (winType === 'weekly') {
        const cur = providers[key].weekly;
        if (!cur || q.remainingFraction < cur.remainingFraction) {
          providers[key].weekly = { remainingFraction: q.remainingFraction, resetTime: q.resetTime };
        }
      }
    }
  }

  const pq = providerQuotaRaw || quotaModels?.providerQuota || null;
  if (pq && typeof pq === 'object') {
    for (const key of ['google', 'claude', 'argon']) {
      if (pq[key]?.fiveHour && !isObservationExpired(pq[key].fiveHour, now)) {
        providers[key].fiveHour = pq[key].fiveHour;
      }
      if (pq[key]?.weekly && !isObservationExpired(pq[key].weekly, now)) {
        providers[key].weekly = pq[key].weekly;
      }
    }
  }

  const formatWin = (win) => {
    if (!win) return null;
    const pct = formatQuotaPercent(win.remainingFraction);
    let secsLeft = null;
    let resetIn = '';
    if (win.resetTime) {
      const resetMs = Date.parse(win.resetTime);
      if (Number.isFinite(resetMs)) {
        secsLeft = Math.max(0, Math.round((resetMs - now) / 1000));
        resetIn = formatDuration(secsLeft);
      }
    }
    return {
      remainingFraction: win.remainingFraction,
      percent: pct,
      resetTime: win.resetTime || null,
      secsLeft,
      resetIn,
    };
  };

  const providerList = [providers.google, providers.claude]
    .concat((providers.argon.fiveHour || providers.argon.weekly) ? [providers.argon] : [])
    .map(p => ({
      key: p.key,
      label: p.label,
      fiveHour: formatWin(p.fiveHour),
      weekly: formatWin(p.weekly),
    }));

  const models = (Array.isArray(quotaModels) ? quotaModels : [])
    .filter(q => q && !isImageModel(q))
    .map(q => {
      const crit = pickCriticalWindow(q.windows, now) || q;
      const pct = formatQuotaPercent(crit.remainingFraction);
      const resetTime = crit.resetTime || q.resetTime || null;
      const secsLeft = resetTime && Number.isFinite(Date.parse(resetTime))
        ? Math.max(0, Math.round((Date.parse(resetTime) - now) / 1000))
        : null;
      return {
        id: q.id,
        displayName: simplifyModelName(q.displayName || q.id),
        provider: q.modelProvider || null,
        percent: pct,
        remainingFraction: crit.remainingFraction,
        resetTime,
        resetIn: secsLeft !== null ? formatDuration(secsLeft) : '',
      };
    });

  return {
    unavailableReason: quotaModels?.unavailableReason || null,
    providers: providerList,
    models,
  };
}

function getLocalDayStartMs(now) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function getCostPeriodStarts(now) {
  const today = getLocalDayStartMs(now);
  const month = new Date(today);
  month.setDate(1);
  return {
    today,
    month: month.getTime(),
    last24h: now - DAY_MS,
    last7d: now - WEEK_MS,
    last30d: now - MONTH_WINDOW_MS,
  };
}

const COST_WINDOWS = ['today', 'month', 'last24h', 'last7d', 'last30d'];

function emptyCostWindows() {
  return { today: 0, month: 0, last24h: 0, last7d: 0, last30d: 0 };
}

// Sums priced turns into calendar and rolling windows by each turn's own timestamp,
// so a long-running session is split correctly across days.
function sumCostPeriods(turns, starts) {
  const totals = emptyCostWindows();
  const byModel = {};
  for (const t of turns) {
    if (typeof t.estimatedCostUsd !== 'number' || typeof t.createdAtMs !== 'number') continue;
    const modelTotals = byModel[t.model] || (byModel[t.model] = emptyCostWindows());
    for (const key of COST_WINDOWS) {
      if (t.createdAtMs >= starts[key]) {
        totals[key] += t.estimatedCostUsd;
        modelTotals[key] += t.estimatedCostUsd;
      }
    }
  }
  return { ...totals, byModel };
}

function rangeCostWindow(range) {
  const norm = String(range || '24h').toLowerCase();
  if (norm === 'today') return 'today';
  if (norm === '7d') return 'last7d';
  if (norm === '30d') return 'last30d';
  if (norm === 'all' || norm === 'active') return null; // whole sessions
  return 'last24h';
}

function rangeCostOf(session, windowKey) {
  return (windowKey ? session.costPeriods?.[windowKey] : session.estimatedCostUsd) || 0;
}

function buildCostSummary(rangeSessions, allSessions, range) {
  const windowKey = rangeCostWindow(range);
  const sum = (list, fn) => list.reduce((acc, s) => acc + (fn(s) || 0), 0);
  const byModel = {};
  for (const s of rangeSessions) {
    if (windowKey) {
      for (const [model, w] of Object.entries(s.costPeriods.byModel || {})) {
        byModel[model] = (byModel[model] || 0) + w[windowKey];
      }
    } else {
      for (const m of s.byModel || []) {
        byModel[m.model] = (byModel[m.model] || 0) + (m.estimatedCostUsd || 0);
      }
    }
  }
  return {
    range: sum(rangeSessions, s => rangeCostOf(s, windowKey)),
    today: sum(allSessions, s => s.costPeriods.today),
    last7d: sum(allSessions, s => s.costPeriods.last7d),
    last30d: sum(allSessions, s => s.costPeriods.last30d),
    month: sum(allSessions, s => s.costPeriods.month),
    allTime: sum(allSessions, s => s.estimatedCostUsd),
    unpricedTurns: sum(rangeSessions, s => s.unpricedTurnCount),
    byModel,
  };
}

function matchesTimeRange(session, range, now) {
  const norm = String(range || '24h').toLowerCase();
  if (norm === 'all') return true;
  if (norm === 'active') {
    return session.isRunning || session.isGenerating || (now - session.lastActivityMs <= ACTIVE_WINDOW_MS);
  }
  if (norm === 'today') {
    return session.isRunning || session.lastActivityMs >= getLocalDayStartMs(now);
  }
  if (norm === '7d') {
    return session.isRunning || (now - session.lastActivityMs <= WEEK_MS);
  }
  if (norm === '30d') {
    return session.isRunning || (now - session.lastActivityMs <= MONTH_WINDOW_MS);
  }
  // Default: active + last 24h
  return session.isRunning || (now - session.lastActivityMs <= DAY_MS);
}

function sortSessions(sessions, sortKey, range) {
  const costWindow = rangeCostWindow(range);
  const key = String(sortKey || 'recent').toLowerCase();
  const list = [...sessions];
  list.sort((a, b) => {
    if (key === 'hit_asc') {
      const ha = a.sessionHitRate === null ? 999 : a.sessionHitRate;
      const hb = b.sessionHitRate === null ? 999 : b.sessionHitRate;
      if (ha !== hb) return ha - hb;
      return b.lastActivityMs - a.lastActivityMs;
    }
    if (key === 'hit_desc') {
      const ha = a.sessionHitRate === null ? -1 : a.sessionHitRate;
      const hb = b.sessionHitRate === null ? -1 : b.sessionHitRate;
      if (ha !== hb) return hb - ha;
      return b.lastActivityMs - a.lastActivityMs;
    }
    if (key === 'tokens_desc') {
      const ta = (a.totalPrompt || 0) + (a.totalOutput || 0);
      const tb = (b.totalPrompt || 0) + (b.totalOutput || 0);
      if (ta !== tb) return tb - ta;
      return b.lastActivityMs - a.lastActivityMs;
    }
    if (key === 'turns_desc') {
      if (a.turnsCount !== b.turnsCount) return b.turnsCount - a.turnsCount;
      return b.lastActivityMs - a.lastActivityMs;
    }
    if (key === 'cost_desc') {
      // Sort by the cost that falls inside the selected range, matching the Cost column.
      const ca = rangeCostOf(a, costWindow);
      const cb = rangeCostOf(b, costWindow);
      if (ca !== cb) return cb - ca;
      return b.lastActivityMs - a.lastActivityMs;
    }
    if (key === 'speed_out_desc') {
      const sa = isFiniteNonNeg(a.speed?.totalSpeed) ? a.speed.totalSpeed : -1;
      const sb = isFiniteNonNeg(b.speed?.totalSpeed) ? b.speed.totalSpeed : -1;
      if (sa !== sb) return sb - sa;
      return b.lastActivityMs - a.lastActivityMs;
    }
    if (key === 'speed_net_desc') {
      const sa = isFiniteNonNeg(a.speed?.visibleSpeed) ? a.speed.visibleSpeed : -1;
      const sb = isFiniteNonNeg(b.speed?.visibleSpeed) ? b.speed.visibleSpeed : -1;
      if (sa !== sb) return sb - sa;
      return b.lastActivityMs - a.lastActivityMs;
    }
    // Default: generating > running > recent activity
    if (a.isGenerating !== b.isGenerating) return a.isGenerating ? -1 : 1;
    if (a.isRunning !== b.isRunning) return a.isRunning ? -1 : 1;
    return b.lastActivityMs - a.lastActivityMs;
  });
  return list;
}

/**
 * Discovers all conversation IDs from brain/, sessions/, and running agy processes,
 * then builds merged session records.
 */
function collectAllSessions(options = {}) {
  const {
    rootDir = null,
    now = Date.now(),
    transcriptCache = null,
    summaryCache = null,
    includeTurns = false,
    auth = null,
    runningSessions = null,
  } = options;

  const baseDir = rootDir || resolveAntigravityPath('');
  const brainDir = path.join(baseDir, 'brain');
  const snapshots = readAllSessionSnapshots(baseDir);
  const timings = readAllHookTimings(baseDir);
  const summaries = loadConversationSummaries(baseDir, summaryCache);
  const periodStarts = getCostPeriodStarts(now);

  const liveRunning = Array.isArray(runningSessions)
    ? runningSessions
    : detectRunningAgySessions({
        rootDir: baseDir,
        snapshots,
        summaries,
        activeEmail: auth?.activeEmail || null,
        switchedAt: auth?.switchedAt || null,
      });

  const runningByConv = new Map();
  const orphanRunning = [];
  for (const proc of liveRunning) {
    if (proc.conversationId) {
      runningByConv.set(proc.conversationId, proc);
    } else {
      orphanRunning.push(proc);
    }
  }

  const allIds = new Set();
  try {
    for (const entry of fs.readdirSync(brainDir, { withFileTypes: true })) {
      if (entry.isDirectory()) allIds.add(entry.name);
    }
  } catch {
    // brain dir may not exist yet
  }
  for (const id of snapshots.keys()) allIds.add(id);
  for (const id of runningByConv.keys()) allIds.add(id);
  for (const [id, info] of summaries.entries()) {
    if (info && info.stepCount > 0) allIds.add(id);
  }

  const records = [];
  for (const id of allIds) {
    const transcriptPath = path.join(brainDir, id, '.system_generated', 'logs', 'transcript.jsonl');
    const parsed = parseTranscriptMetrics(transcriptPath, transcriptCache);
    const snap = snapshots.get(id) || null;
    const timing = timings.get(id) || null;
    const summaryInfo = summaries.get(id) || null;
    const running = runningByConv.get(id) || null;

    if (!parsed && !snap && !running && !(summaryInfo && summaryInfo.stepCount > 0)) continue;

    // A non-running session with stale pendingStartMs (e.g. terminated hook / exited -p)
    // should not stay stuck as "generating".
    const isGenerating = Boolean(
      timing &&
      typeof timing.pendingStartMs === 'number' &&
      now - timing.pendingStartMs < (running ? GENERATING_STALE_MS : 60_000) &&
      (running || (parsed && parsed.turnsCount > 0))
    );

    const lastActivityMs = Math.max(
      parsed?.lastActivityMs || 0,
      snap?.updatedAt || 0,
      timing?.updatedAtMs || 0,
      isGenerating && timing?.pendingStartMs ? timing.pendingStartMs : 0,
      summaryInfo?.lastModifiedMs || 0,
      running?.startedAtMs || 0
    ) || now;

    const firstActivityMs = Math.min(
      ...[
        parsed?.firstActivityMs,
        snap?.firstSeenAt,
        summaryInfo?.lastModifiedMs,
        running?.startedAtMs,
      ].filter(v => typeof v === 'number' && v > 0)
    ) || lastActivityMs;

    const title = (summaryInfo?.title)
      || (parsed?.firstUserPrompt)
      || (summaryInfo?.preview)
      || (snap?.currentDir ? `Session in ${snap.currentDir}` : id.slice(0, 8));

    const cwd = running?.cwd || snap?.cwd || summaryInfo?.cwd || null;
    const currentDir = snap?.currentDir || (cwd ? path.basename(cwd) : null);
    const branch = snap?.branch || null;

    const rawModel = snap?.modelDisplayName || snap?.modelId || parsed?.lastModel || 'Unknown';
    const modelLabel = formatModelLabel(rawModel);

    const turnsCount = parsed?.turnsCount || snap?.sessionCache?.turns || 0;
    const steps = Math.max(parsed?.steps || 0, summaryInfo?.stepCount || 0, snap?.steps || 0);
    const totalUncachedInput = parsed ? parsed.totalUncachedInput : (snap?.sessionCache?.uncachedInput || 0);
    const totalCacheRead = parsed ? parsed.totalCacheRead : (snap?.sessionCache?.cacheRead || 0);
    const totalCacheWrite = parsed ? parsed.totalCacheWrite : (snap?.sessionCache?.cacheWrite || 0);
    const totalPrompt = parsed ? parsed.totalPrompt : (snap?.sessionCache?.totalPrompt || 0);
    const totalOutput = parsed ? parsed.totalOutput : (snap?.contextWindow?.totalOutputTokens || 0);
    const sessionHitRate = parsed
      ? parsed.sessionHitRate
      : (typeof snap?.sessionCache?.hitRate === 'number' ? snap.sessionCache.hitRate : null);
    const lastTurnHitRate = parsed
      ? parsed.lastTurnHitRate
      : (typeof snap?.turnCache?.hitRate === 'number' ? snap.turnCache.hitRate : null);

    let status = 'idle';
    if (isGenerating) status = 'generating';
    else if (running) status = 'running';
    else if (now - lastActivityMs <= ACTIVE_WINDOW_MS) status = 'recent';

    let syncStatus = 'historical';
    let sessionAccountEmail = snap?.sessionAccountEmail || snap?.accountEmail || null;
    if (running) {
      syncStatus = running.syncStatus;
      if (running.sessionAccountEmail) sessionAccountEmail = running.sessionAccountEmail;
    } else if (snap?.accountDrift) {
      syncStatus = 'unsynced';
    } else if (sessionAccountEmail && auth?.activeEmail) {
      syncStatus = sessionAccountEmail === auth.activeEmail ? 'synced' : 'other_account';
    }

    const toolDurationMs = timing?.totalToolDurationMs ?? snap?.toolTime?.totalMs ?? null;
    const apiDurationMs = timing?.totalApiDurationMs ?? parsed?.totalApiDurationMs ?? null;
    const speed = resolveSessionSpeed(id, baseDir, snap, parsed, timing);

    const rec = {
      conversationId: id,
      shortId: id.slice(0, 8),
      title,
      status,
      isRunning: Boolean(running),
      isGenerating,
      hasTranscript: Boolean(parsed),
      pid: running?.pid || null,
      processStartedAtMs: running?.startedAtMs || null,
      cwd,
      currentDir,
      branch,
      model: parsed?.lastModel || snap?.modelId || null,
      modelLabel,
      steps,
      turnsCount,
      totalUncachedInput,
      totalCacheRead,
      totalCacheWrite,
      totalPrompt,
      totalOutput,
      sessionHitRate,
      lastTurnHitRate,
      lastTurnPrompt: parsed?.lastTurnPrompt ?? snap?.turnCache?.totalPrompt ?? 0,
      lastTurnCacheRead: parsed?.lastTurnCacheRead ?? snap?.turnCache?.cacheRead ?? 0,
      missTurnCount: parsed?.missTurnCount || 0,
      contextWindow: snap?.contextWindow || null,
      speed,
      toolDurationMs,
      apiDurationMs,
      estimatedCostUsd: parsed?.totalEstimatedCostUsd ?? snap?.costUsd ?? 0,
      unpricedTurnCount: parsed?.unpricedTurnCount || 0,
      costPeriods: sumCostPeriods(parsed?.turns || [], periodStarts),
      accountEmail: sessionAccountEmail,
      syncStatus,
      syncReason: running?.syncReason || snap?.accountDrift?.reason || null,
      byModel: parsed?.byModel || [],
      firstActivityMs,
      lastActivityMs,
      resumeCommand: `agy --conversation=${id}`,
      ...(includeTurns ? { turns: parsed?.turns || [] } : {}),
    };

    records.push(rec);
  }

  // Also surface newly opened interactive agy processes that haven't created a conversation ID yet
  for (const proc of orphanRunning) {
    const syntheticId = `pid-${proc.pid}`;
    records.push({
      conversationId: syntheticId,
      shortId: `pid:${proc.pid}`,
      title: 'New / idle agy window (no conversation yet)',
      status: 'running',
      isRunning: true,
      isGenerating: false,
      hasTranscript: false,
      pid: proc.pid,
      processStartedAtMs: proc.startedAtMs,
      cwd: proc.cwd,
      currentDir: proc.cwd ? path.basename(proc.cwd) : null,
      branch: null,
      model: null,
      modelLabel: 'Idle',
      steps: 0,
      turnsCount: 0,
      totalUncachedInput: 0,
      totalCacheRead: 0,
      totalCacheWrite: 0,
      totalPrompt: 0,
      totalOutput: 0,
      sessionHitRate: null,
      lastTurnHitRate: null,
      lastTurnPrompt: 0,
      lastTurnCacheRead: 0,
      missTurnCount: 0,
      contextWindow: null,
      speed: null,
      toolDurationMs: null,
      apiDurationMs: null,
      estimatedCostUsd: 0,
      unpricedTurnCount: 0,
      costPeriods: sumCostPeriods([], periodStarts),
      accountEmail: proc.sessionAccountEmail || null,
      syncStatus: proc.syncStatus,
      syncReason: proc.syncReason || null,
      byModel: [],
      firstActivityMs: proc.startedAtMs || now,
      lastActivityMs: proc.startedAtMs || now,
      resumeCommand: 'agy',
      ...(includeTurns ? { turns: [] } : {}),
    });
  }

  return { sessions: records, runningSessions: liveRunning, orphanRunning };
}

function aggregateSummary(sessions, totalSessionsAll, runningSessions) {
  let totalTurns = 0;
  let totalCacheRead = 0;
  let totalCacheWrite = 0;
  let totalUncachedInput = 0;
  let totalPrompt = 0;
  let totalOutput = 0;
  let totalEstimatedCostUsd = 0;
  let totalMissTurns = 0;
  const byModelMap = new Map();

  let outSpeedSum = 0;
  let outSpeedCnt = 0;
  let netSpeedSum = 0;
  let netSpeedCnt = 0;

  for (const s of sessions) {
    totalTurns += s.turnsCount || 0;
    totalCacheRead += s.totalCacheRead || 0;
    totalCacheWrite += s.totalCacheWrite || 0;
    totalUncachedInput += s.totalUncachedInput || 0;
    totalPrompt += s.totalPrompt || 0;
    totalOutput += s.totalOutput || 0;
    totalEstimatedCostUsd += s.estimatedCostUsd || 0;
    totalMissTurns += s.missTurnCount || 0;

    if (isFiniteNonNeg(s.speed?.totalSpeed)) {
      outSpeedSum += s.speed.totalSpeed;
      outSpeedCnt += 1;
    }
    if (isFiniteNonNeg(s.speed?.visibleSpeed)) {
      netSpeedSum += s.speed.visibleSpeed;
      netSpeedCnt += 1;
    }

    for (const m of s.byModel || []) {
      if (!byModelMap.has(m.model)) {
        byModelMap.set(m.model, {
          model: m.model,
          modelLabel: m.modelLabel,
          sessions: 0,
          turns: 0,
          cacheRead: 0,
          uncachedInput: 0,
          cacheWrite: 0,
          totalPrompt: 0,
          output: 0,
          estimatedCostUsd: 0,
          unpricedTurns: 0,
        });
      }
      const agg = byModelMap.get(m.model);
      agg.sessions += 1;
      agg.turns += m.turns;
      agg.cacheRead += m.cacheRead;
      agg.uncachedInput += m.uncachedInput;
      agg.cacheWrite += m.cacheWrite;
      agg.totalPrompt += m.totalPrompt;
      agg.output += m.output;
      agg.estimatedCostUsd += m.estimatedCostUsd;
      agg.unpricedTurns += m.unpricedTurns || 0;
    }
  }

  const weightedHitRate = totalPrompt > 0
    ? Math.min(100, Math.max(0, (totalCacheRead / totalPrompt) * 100))
    : null;

  const byModel = Array.from(byModelMap.values())
    .map(m => ({
      ...m,
      hitRate: m.totalPrompt > 0 ? Math.min(100, Math.max(0, (m.cacheRead / m.totalPrompt) * 100)) : null,
    }))
    .sort((a, b) => b.totalPrompt - a.totalPrompt);

  const runningCount = runningSessions.length;
  const unsyncedCount = runningSessions.filter(r => r.syncStatus === 'unsynced').length;
  const generatingCount = sessions.filter(s => s.isGenerating).length;

  return {
    sessionCount: sessions.length,
    totalSessionsAll,
    runningCount,
    generatingCount,
    unsyncedCount,
    totalTurns,
    totalMissTurns,
    totalCacheRead,
    totalCacheWrite,
    totalUncachedInput,
    totalPrompt,
    totalOutput,
    weightedHitRate,
    avgOutSpeed: outSpeedCnt > 0 ? outSpeedSum / outSpeedCnt : null,
    avgNetSpeed: netSpeedCnt > 0 ? netSpeedSum / netSpeedCnt : null,
    totalEstimatedCostUsd,
    byModel,
  };
}

/**
 * Builds the full multi-session overview payload consumed by WebUI, SSE, and CLI.
 */
async function buildPanelOverview(options = {}) {
  const {
    rootDir = null,
    range = '24h',
    query = '',
    sort = 'recent',
    account = '',
    now = Date.now(),
    transcriptCache = null,
    summaryCache = null,
    authOptions = {},
    runningSessions = null,
    quotaFetcher = null,
    accountStorePath = null,
  } = options;

  const baseDir = rootDir || resolveAntigravityPath('');
  const auth = inspectLiveAuth({ rootDir: baseDir, now, ...authOptions });

  let quotaModels = [];
  let cachedPayload = null;
  if (quotaFetcher) {
    quotaModels = await quotaFetcher();
  } else {
    const liveTok = readToken({ roots: [baseDir] });
    quotaModels = await getQuota({ fast: true, roots: [baseDir], tokenReader: () => liveTok }).catch(() => []);
    if (liveTok) {
      cachedPayload = readCachePayload(liveTok) || null;
    } else if (auth.loggedIn && auth.activeEmail) {
      cachedPayload = readCachePayload({ email: auth.activeEmail, accessToken: '' }) || null;
    }
  }

  const resolvedStorePath = accountStorePath || path.join(baseDir, 'agy-hud-accounts-quota.json');
  const accountStore = readAccountQuotaStore(resolvedStorePath);

  // If the single cache wasn't matched by email/token yet, fall back to the
  // per-account quota bucket for the active email so switches stay instant.
  const activeAccountBucket = auth.activeEmail ? accountStore.accounts[auth.activeEmail] : null;
  const effectiveQuotaModels = (Array.isArray(quotaModels) && quotaModels.length > 0)
    ? quotaModels
    : (activeAccountBucket?.data || quotaModels || []);
  const effectiveProviderQuota = quotaModels?.providerQuota
    || cachedPayload?.providerQuota
    || activeAccountBucket?.providerQuota
    || null;

  const quota = buildQuotaOverview(effectiveQuotaModels, effectiveProviderQuota, now);
  quota.tier = cachedPayload?.tier || activeAccountBucket?.tier || null;
  quota.lastRefreshed = cachedPayload?.lastRefreshed || activeAccountBucket?.lastRefreshed || null;

  const accounts = Object.values(accountStore.accounts || {})
    .sort((a, b) => {
      if (a.email === auth.activeEmail) return -1;
      if (b.email === auth.activeEmail) return 1;
      return (b.lastRefreshed || 0) - (a.lastRefreshed || 0);
    })
    .map(acc => ({
      email: acc.email,
      isActive: acc.email === auth.activeEmail,
      tier: acc.tier || null,
      lastRefreshed: acc.lastRefreshed || null,
      quota: buildQuotaOverview(acc.data || [], acc.providerQuota || null, now),
    }));

  const { sessions: allSessions, runningSessions: liveRunning } = collectAllSessions({
    rootDir: baseDir,
    now,
    transcriptCache,
    summaryCache,
    includeTurns: false,
    auth,
    runningSessions,
  });

  const qLower = String(query || '').trim().toLowerCase();
  const acctFilter = String(account || '').trim().toLowerCase();
  const includeEmpty = options.includeEmpty === true;

  const isEmptyNonRunning = (s) => !s.isRunning && s.turnsCount === 0 && (s.hasTranscript || s.steps === 0);
  const hiddenEmptyCount = allSessions.filter(isEmptyNonRunning).length;
  const eligibleSessions = includeEmpty ? allSessions : allSessions.filter(s => !isEmptyNonRunning(s));

  const filtered = eligibleSessions.filter(s => {
    if (!matchesTimeRange(s, range, now)) return false;
    if (acctFilter && acctFilter !== 'all') {
      if (acctFilter === 'unsynced') {
        if (s.syncStatus !== 'unsynced') return false;
      } else if ((s.accountEmail || '').toLowerCase() !== acctFilter) {
        return false;
      }
    }
    if (qLower) {
      const hay = [
        s.title,
        s.conversationId,
        s.cwd,
        s.currentDir,
        s.branch,
        s.modelLabel,
        s.accountEmail,
      ].filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(qLower)) return false;
    }
    return true;
  });

  const sorted = sortSessions(filtered, sort, range);
  const summary = aggregateSummary(sorted, eligibleSessions.length, liveRunning);
  summary.hiddenEmptyCount = hiddenEmptyCount;
  summary.cost = buildCostSummary(sorted, eligibleSessions, range);

  const syncScriptPath = resolveSyncScriptPath();
  const syncBridgeAvailable = fs.existsSync(syncScriptPath);

  return {
    generatedAt: now,
    range,
    sort,
    auth: {
      loggedIn: auth.loggedIn,
      activeEmail: auth.activeEmail,
      expiry: auth.expiry,
      expired: auth.expired,
      sourceFormat: auth.sourceFormat,
      accountSwitched: auth.accountSwitched,
      switchedAt: auth.switchedAt,
      syncBridgeAvailable,
    },
    quota,
    accounts,
    summary,
    sessions: sorted,
  };
}

/**
 * Loads full per-turn detail for one session (supports full UUID or prefix match).
 */
async function getSessionDetail(idOrPrefix, options = {}) {
  const {
    rootDir = null,
    now = Date.now(),
    transcriptCache = null,
    summaryCache = null,
    authOptions = {},
    runningSessions = null,
  } = options;

  const target = String(idOrPrefix || '').trim().toLowerCase();
  if (!target) return null;

  const baseDir = rootDir || resolveAntigravityPath('');
  const auth = inspectLiveAuth({ rootDir: baseDir, now, persistState: false, ...authOptions });
  const { sessions } = collectAllSessions({
    rootDir: baseDir,
    now,
    transcriptCache,
    summaryCache,
    includeTurns: true,
    auth,
    runningSessions,
  });

  const exact = sessions.find(s => s.conversationId.toLowerCase() === target);
  if (exact) return exact;
  const prefixed = sessions.filter(s => s.conversationId.toLowerCase().startsWith(target));
  if (prefixed.length === 1) return prefixed[0];
  if (prefixed.length > 1) {
    prefixed.sort((a, b) => b.lastActivityMs - a.lastActivityMs);
    return prefixed[0];
  }
  return null;
}

module.exports = {
  DEFAULT_TTL_GAP_MS,
  cleanUserPromptTitle,
  formatGapShort,
  diagnoseTurnCacheMiss,
  parseTranscriptMetrics,
  loadConversationSummaries,
  readAllHookTimings,
  readSpeedCacheForConversation,
  resolveSessionSpeed,
  buildQuotaOverview,
  matchesTimeRange,
  sortSessions,
  collectAllSessions,
  aggregateSummary,
  buildPanelOverview,
  getSessionDetail,
};
