'use strict';

const fs = require('fs');
const path = require('path');
const { createHash } = require('crypto');
const { resolveAntigravityPath } = require('./paths.js');

// Below 500ms API time a rate is mostly noise
const MIN_API_DELTA_MS = 500;

function isCount(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function resolveCacheDir(rootDir) {
  const baseDir = rootDir || resolveAntigravityPath('speed-cache');
  return path.basename(baseDir) === 'speed-cache' ? baseDir : path.join(baseDir, 'speed-cache');
}

function getSpeedCachePath(rootDir, transcriptPath) {
  const cacheDir = resolveCacheDir(rootDir);
  const str = String(transcriptPath || '');
  const target = (path.isAbsolute(str) || str.includes('/') || str.includes('\\'))
    ? path.resolve(str)
    : str;
  const key = createHash('sha256').update(target).digest('hex');
  return path.join(cacheDir, `${key}.json`);
}

function readHookTiming(agyData, rootDir, transcriptPath) {
  const rawId = String(agyData?.conversation_id || agyData?.session_id || '').trim();
  let convKey = rawId ? rawId.replace(/[^a-zA-Z0-9._-]/g, '_') : '';
  if (!convKey) {
    const match = String(transcriptPath || '').match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
    if (match) convKey = match[1];
  }
  if (!convKey) return null;

  try {
    const file = path.join(resolveCacheDir(rootDir), `hook-timing-${convKey}.json`);
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!isCount(raw?.totalApiDurationMs)) return null;
    return {
      totalApiDurationMs: raw.totalApiDurationMs,
      totalToolDurationMs: isCount(raw?.totalToolDurationMs) ? raw.totalToolDurationMs : 0,
      lastToolDurationMs: isCount(raw?.lastToolDurationMs) ? raw.lastToolDurationMs : null,
      fromStart: raw.fromStart === true,
    };
  } catch {
    return null;
  }
}

function estimateTokens(text) {
  if (!text || typeof text !== 'string') return 0;
  const cjkMatches = text.match(/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/g);
  const cjkCount = cjkMatches ? cjkMatches.length : 0;
  return cjkCount * 0.9 + (text.length - cjkCount) * 0.26;
}

function extractConversationId(agyData, transcriptPath) {
  const rawId = String(agyData?.conversation_id || agyData?.session_id || '').trim();
  if (rawId) return rawId;
  const match = String(transcriptPath || '').match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
  return match ? match[1] : '';
}

function resolveTranscriptReadPath(agyData, transcriptPath, state) {
  const candidates = [];
  const addCandidate = (p) => {
    if (!p || typeof p !== 'string') return;
    if (!path.isAbsolute(p) && !p.includes('/') && !p.includes('\\')) return;
    if (p.endsWith('transcript.jsonl')) {
      candidates.push(path.join(path.dirname(p), 'transcript_full.jsonl'));
    }
    candidates.push(p);
  };

  addCandidate(state?.transcriptPath);
  addCandidate(transcriptPath);

  const convId = extractConversationId(agyData, transcriptPath);
  if (convId) {
    candidates.push(resolveAntigravityPath(path.join('brain', convId, '.system_generated', 'logs', 'transcript_full.jsonl')));
    candidates.push(resolveAntigravityPath(path.join('brain', convId, '.system_generated', 'logs', 'transcript.jsonl')));
  }

  for (const candidate of candidates) {
    try {
      if (fs.statSync(candidate).isFile()) return candidate;
    } catch {}
  }
  return null;
}

function getTranscriptVisibleTokens(transcriptPath, agyData = null, state = null) {
  const targetPath = resolveTranscriptReadPath(agyData, transcriptPath, state);
  if (!targetPath) return null;

  try {
    const raw = fs.readFileSync(targetPath, 'utf8');
    let totalVisible = 0;
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue;
      let entry;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }
      if (entry?.type !== 'PLANNER_RESPONSE') continue;
      const contentTok = estimateTokens(entry.content || '');
      const toolsTok = Array.isArray(entry.tool_calls) && entry.tool_calls.length > 0
        ? estimateTokens(JSON.stringify(entry.tool_calls))
        : 0;
      let stepVisible = Math.round(contentTok + toolsTok);
      if (isCount(entry.output_tokens)) {
        stepVisible = Math.min(entry.output_tokens, stepVisible);
      }
      totalVisible += stepVisible;
    }
    return totalVisible;
  } catch {
    return null;
  }
}

function readState(file) {
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    const speed = raw.speed ?? null;
    const visibleSpeed = raw.visibleSpeed ?? null;
    return isCount(raw.apiDurationMs) && typeof raw.usageKey === 'string' && (speed === null || isCount(speed))
      ? {
          apiDurationMs: raw.apiDurationMs,
          usageKey: raw.usageKey,
          speed,
          visibleSpeed: (visibleSpeed === null || isCount(visibleSpeed)) ? visibleSpeed : null,
          totalOutputTokens: isCount(raw.totalOutputTokens) ? raw.totalOutputTokens : null,
          visibleOutputTokens: isCount(raw.visibleOutputTokens) ? raw.visibleOutputTokens : null,
          source: typeof raw.source === 'string' ? raw.source : 'fallback',
        }
      : null;
  } catch {
    return null;
  }
}

function writeState(file, state) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state), { mode: 0o600 });
    fs.renameSync(tmp, file);
  } catch {
    // Speed is cosmetic; safe fallback on permission/filesystem issues
  }
}

/**
 * Calculates total (with thinking) and visible-only (without thinking) output speeds.
 *
 * @param {Object} agyData
 * @param {string} [rootDir]
 * @param {Object} [state]
 * @returns {{ totalSpeed: number, visibleSpeed: number|null }|null}
 */
function getOutputSpeedDetails(agyData, rootDir = null, state = null) {
  const transcriptPath = (agyData?.transcript_path || state?.transcriptPath || agyData?.session_id || '')?.trim();
  const usage = agyData?.context_window?.current_usage || agyData?.context_window || state?.usage?.current_usage || state?.usage;
  const output = usage?.output_tokens ?? agyData?.context_window?.total_output_tokens;
  const totalOutputTokens = isCount(agyData?.context_window?.total_output_tokens)
    ? agyData.context_window.total_output_tokens
    : null;
  const visibleOutputTokens = getTranscriptVisibleTokens(transcriptPath, agyData, state);
  const hookTiming = readHookTiming(agyData, rootDir, transcriptPath);
  const source = hookTiming !== null ? 'hook' : 'fallback';
  const apiDurationMs = hookTiming !== null
    ? hookTiming.totalApiDurationMs
    : (
        agyData?.cost?.total_api_duration_ms ??
        agyData?.cost?.total_duration_ms ??
        agyData?.total_api_duration_ms ??
        state?.totalApiDurationMs
      );

  if (!transcriptPath || !usage || !isCount(output) || !isCount(apiDurationMs)) {
    return null;
  }

  const file = getSpeedCachePath(rootDir, transcriptPath);
  const usageKey = [
    usage.input_tokens ?? 0,
    output,
    usage.cache_creation_input_tokens ?? 0,
    usage.cache_read_input_tokens ?? 0,
  ].join(':');

  const previous = readState(file);
  if (
    !previous ||
    previous.source !== source ||
    apiDurationMs < previous.apiDurationMs ||
    (totalOutputTokens !== null && previous.totalOutputTokens !== null && totalOutputTokens < previous.totalOutputTokens) ||
    (visibleOutputTokens !== null && previous.visibleOutputTokens !== null && visibleOutputTokens < previous.visibleOutputTokens)
  ) {
    const initialOutput = totalOutputTokens ?? output;
    const canComputeFirst = (
      hookTiming?.fromStart &&
      initialOutput > 0 &&
      apiDurationMs >= MIN_API_DELTA_MS
    );
    const firstTurnSpeed = canComputeFirst ? initialOutput / (apiDurationMs / 1000) : null;
    const firstVisibleSpeed = (canComputeFirst && visibleOutputTokens !== null)
      ? Math.min(initialOutput, visibleOutputTokens) / (apiDurationMs / 1000)
      : null;
    writeState(file, {
      apiDurationMs,
      totalOutputTokens,
      visibleOutputTokens,
      usageKey,
      speed: firstTurnSpeed,
      visibleSpeed: firstVisibleSpeed,
      source,
    });
    return firstTurnSpeed !== null ? { totalSpeed: firstTurnSpeed, visibleSpeed: firstVisibleSpeed } : null;
  }

  if (apiDurationMs === previous.apiDurationMs) {
    return previous.speed !== null
      ? { totalSpeed: previous.speed, visibleSpeed: previous.visibleSpeed ?? null }
      : null;
  }

  // API time from requests that leave the main usage untouched (e.g. subagents)
  // folds into the baseline instead of being charged to the next response.
  const deltaMs = apiDurationMs - previous.apiDurationMs;
  const deltaOutput = (totalOutputTokens !== null && previous.totalOutputTokens !== null)
    ? totalOutputTokens - previous.totalOutputTokens
    : (usageKey !== previous.usageKey ? output : 0);
  const isNewResponse = deltaOutput > 0;
  const speed = isNewResponse && deltaMs >= MIN_API_DELTA_MS
    ? deltaOutput / (deltaMs / 1000)
    : previous.speed;

  let visibleSpeed = previous.visibleSpeed ?? null;
  if (isNewResponse && deltaMs >= MIN_API_DELTA_MS) {
    if (visibleOutputTokens !== null && previous.visibleOutputTokens !== null) {
      const deltaVisible = Math.min(deltaOutput, Math.max(0, visibleOutputTokens - previous.visibleOutputTokens));
      visibleSpeed = deltaVisible / (deltaMs / 1000);
    } else {
      visibleSpeed = null;
    }
  }

  writeState(file, {
    apiDurationMs,
    totalOutputTokens,
    visibleOutputTokens: visibleOutputTokens ?? previous.visibleOutputTokens,
    usageKey,
    speed,
    visibleSpeed,
    source,
  });
  return speed !== null ? { totalSpeed: speed, visibleSpeed } : null;
}

/**
 * Calculates output token speed (tokens / second) for the finished response.
 * Follows claude-hud contract and holds the reading until the next response.
 *
 * @param {Object} agyData
 * @param {string} [rootDir]
 * @param {Object} [state]
 * @returns {number|null}
 */
function getOutputSpeed(agyData, rootDir = null, state = null) {
  const details = getOutputSpeedDetails(agyData, rootDir, state);
  return details ? details.totalSpeed : null;
}

/**
 * Formats token output speed string according to locale.
 *
 * @param {number|null} speed
 * @param {string} [lang='en']
 * @returns {string|null}
 */
function formatSpeed(speed, lang = 'en') {
  if (speed === null || speed === undefined || !Number.isFinite(speed)) {
    return null;
  }
  return `out: ${speed.toFixed(1)} tok/s`;
}

/**
 * Returns accumulated and latest tool execution durations recorded by hooks.
 *
 * @param {Object} agyData
 * @param {string} [rootDir]
 * @param {Object} [state]
 * @returns {{ totalMs: number, lastMs: number|null }|null}
 */
function getToolTimeDetails(agyData, rootDir = null, state = null) {
  const transcriptPath = (agyData?.transcript_path || state?.transcriptPath || agyData?.session_id || '')?.trim();
  const hookTiming = readHookTiming(agyData, rootDir, transcriptPath);
  if (!hookTiming) return null;
  return {
    totalMs: hookTiming.totalToolDurationMs,
    lastMs: hookTiming.lastToolDurationMs,
  };
}

/**
 * Formats tool execution duration in milliseconds for compact HUD display.
 *
 * @param {number|null} durationMs
 * @returns {string|null}
 */
function formatToolDuration(durationMs) {
  if (durationMs === null || durationMs === undefined || !Number.isFinite(durationMs) || durationMs < 0) {
    return null;
  }
  if (durationMs < 60000) {
    return `${(durationMs / 1000).toFixed(1)}s`;
  }
  const totalSec = Math.floor(durationMs / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h${m}m`;
  return `${m}m${s}s`;
}

module.exports = {
  getOutputSpeed,
  getOutputSpeedDetails,
  getToolTimeDetails,
  formatToolDuration,
  formatSpeed,
  getSpeedCachePath,
  estimateTokens,
  getTranscriptVisibleTokens,
};
