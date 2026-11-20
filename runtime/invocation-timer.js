'use strict';

const fs = require('fs');
const path = require('path');
const { resolveAntigravityPath } = require('./paths.js');

// transcript created_at has 1s floor precision; midpoint (+500ms) avoids systematic +0.5s tool overcounting.
const CREATED_AT_MIDPOINT_MS = 500;
const TRANSCRIPT_TAIL_BYTES = 65536;

/**
 * Extracts a safe conversation key from hook stdin metadata.
 */
function getConversationKey(payload) {
  const raw = String(payload?.conversationId || '').trim();
  if (raw) {
    return raw.replace(/[^a-zA-Z0-9._-]/g, '_');
  }
  const tp = String(payload?.transcriptPath || '');
  const match = tp.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
  return match ? match[1] : null;
}

function getTimingPath(convKey) {
  return path.join(resolveAntigravityPath('speed-cache'), `hook-timing-${convKey}.json`);
}

function getToolDirPath(convKey) {
  return path.join(resolveAntigravityPath('speed-cache'), `tools-${convKey}`);
}

function readTiming(file) {
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

function writeTiming(file, state) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state), { mode: 0o600 });
    fs.renameSync(tmp, file);
  } catch {
    // Timing hook must never fail or block agent invocation.
  }
}

function writeToolMarker(convKey, payload, nowMs) {
  const dir = getToolDirPath(convKey);
  const rawId = String(payload?.toolCall?.id || `${payload?.stepIdx ?? 'step'}-${process.pid}-${nowMs}`);
  const safeId = rawId.replace(/[^a-zA-Z0-9._-]/g, '_');
  const markerFile = path.join(dir, `${safeId}.json`);
  try {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const tmp = `${markerFile}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({
      id: rawId,
      stepIdx: typeof payload?.stepIdx === 'number' ? payload.stepIdx : null,
      endMs: nowMs,
    }), { mode: 0o600 });
    fs.renameSync(tmp, markerFile);
  } catch {
    // Non-blocking
  }
}

function consumeToolMarkers(convKey) {
  const dir = getToolDirPath(convKey);
  const markers = [];
  let entries;
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return markers;
  }
  for (const name of entries) {
    if (!name.endsWith('.json')) continue;
    const fullPath = path.join(dir, name);
    try {
      const parsed = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
      if (parsed && typeof parsed.endMs === 'number' && Number.isFinite(parsed.endMs)) {
        markers.push(parsed);
      }
    } catch {
      // Ignore malformed marker
    }
    try {
      fs.unlinkSync(fullPath);
    } catch {
      // Ignore cleanup race
    }
  }
  return markers;
}

function clearToolMarkers(convKey) {
  const dir = getToolDirPath(convKey);
  try {
    for (const name of fs.readdirSync(dir)) {
      try {
        fs.unlinkSync(path.join(dir, name));
      } catch {}
    }
  } catch {
    // Directory may not exist yet
  }
}

function resolveCompactTranscriptPath(transcriptPath) {
  if (!transcriptPath || typeof transcriptPath !== 'string') return null;
  if (transcriptPath.endsWith('transcript_full.jsonl')) {
    const compact = path.join(path.dirname(transcriptPath), 'transcript.jsonl');
    try {
      if (fs.statSync(compact).isFile()) return compact;
    } catch {}
  }
  try {
    if (fs.statSync(transcriptPath).isFile()) return transcriptPath;
  } catch {}
  return null;
}

function readTranscriptTailEntries(transcriptPath) {
  const target = resolveCompactTranscriptPath(transcriptPath);
  if (!target) return [];
  let fd;
  try {
    const stat = fs.statSync(target);
    const readSize = Math.min(stat.size, TRANSCRIPT_TAIL_BYTES);
    const offset = Math.max(0, stat.size - readSize);
    const buf = Buffer.allocUnsafe(readSize);
    fd = fs.openSync(target, 'r');
    fs.readSync(fd, buf, 0, readSize, offset);
    let text = buf.toString('utf8');
    if (offset > 0) {
      const firstNewline = text.indexOf('\n');
      if (firstNewline !== -1) text = text.slice(firstNewline + 1);
    }
    const entries = [];
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      try {
        entries.push(JSON.parse(line));
      } catch {}
    }
    return entries;
  } catch {
    return [];
  } finally {
    if (fd !== undefined) {
      try { fs.closeSync(fd); } catch {}
    }
  }
}

/**
 * Computes tool execution duration inside an invocation using tool step start
 * timestamps from transcript.jsonl and exact completion timestamps from PostToolUse.
 */
function resolveToolWindowMs(markers, transcriptPath, invocationStartMs, invocationEndMs, initialNumSteps) {
  if (!Array.isArray(markers) || markers.length === 0) return 0;

  let maxToolEndMs = 0;
  const stepIndices = new Set();
  for (const marker of markers) {
    if (marker.endMs > maxToolEndMs) maxToolEndMs = marker.endMs;
    if (typeof marker.stepIdx === 'number') stepIndices.add(marker.stepIdx);
  }
  if (maxToolEndMs <= invocationStartMs) return 0;
  const clampedEndMs = Math.min(invocationEndMs, maxToolEndMs);

  const entries = readTranscriptTailEntries(transcriptPath);
  let earliestStepStartMs = null;
  for (const entry of entries) {
    if (!entry || typeof entry.created_at !== 'string') continue;
    const isTrackedStep = stepIndices.size > 0
      ? stepIndices.has(entry.step_index)
      : (typeof initialNumSteps === 'number' &&
         typeof entry.step_index === 'number' &&
         entry.step_index >= initialNumSteps &&
         entry.type !== 'PLANNER_RESPONSE' &&
         entry.type !== 'USER_INPUT' &&
         entry.type !== 'CHECKPOINT');
    if (!isTrackedStep) continue;
    const parsedMs = Date.parse(entry.created_at);
    if (!Number.isFinite(parsedMs)) continue;
    const estimatedStartMs = parsedMs + CREATED_AT_MIDPOINT_MS;
    if (earliestStepStartMs === null || estimatedStartMs < earliestStepStartMs) {
      earliestStepStartMs = estimatedStartMs;
    }
  }

  if (earliestStepStartMs === null) return 0;
  const clampedStartMs = Math.max(invocationStartMs, Math.min(clampedEndMs, earliestStepStartMs));
  return Math.max(0, clampedEndMs - clampedStartMs);
}

function nonNegativeNum(value, fallback = 0) {
  return (typeof value === 'number' && Number.isFinite(value) && value >= 0) ? value : fallback;
}

function recordPhase(phase, payload, nowMs = Date.now()) {
  const convKey = getConversationKey(payload);
  if (!convKey) return;

  if (phase === 'post-tool') {
    writeToolMarker(convKey, payload, nowMs);
    return;
  }

  const file = getTimingPath(convKey);
  const state = readTiming(file);
  const totalApiDurationMs = nonNegativeNum(state.totalApiDurationMs, 0);
  const totalToolDurationMs = nonNegativeNum(state.totalToolDurationMs, 0);
  const fromStart = typeof state.fromStart === 'boolean'
    ? state.fromStart
    : (payload?.invocationNum === 0);

  if (phase === 'pre') {
    clearToolMarkers(convKey);
    writeTiming(file, {
      totalApiDurationMs,
      totalToolDurationMs,
      fromStart,
      pendingStartMs: nowMs,
      pendingInvocationNum: typeof payload?.invocationNum === 'number' ? payload.invocationNum : null,
      pendingInitialNumSteps: typeof payload?.initialNumSteps === 'number' ? payload.initialNumSteps : null,
      lastInvocationMs: state.lastInvocationMs ?? null,
      lastToolDurationMs: state.lastToolDurationMs ?? null,
    });
    return;
  }

  if (phase === 'post') {
    const markers = consumeToolMarkers(convKey);
    const hasStart = typeof state.pendingStartMs === 'number' && Number.isFinite(state.pendingStartMs);
    const sameInvocation = (
      state.pendingInvocationNum === null ||
      state.pendingInvocationNum === undefined ||
      typeof payload?.invocationNum !== 'number' ||
      state.pendingInvocationNum === payload.invocationNum
    );
    const invocationElapsedMs = (hasStart && sameInvocation) ? Math.max(0, nowMs - state.pendingStartMs) : 0;
    const toolElapsedMs = (hasStart && sameInvocation && invocationElapsedMs > 0)
      ? resolveToolWindowMs(
          markers,
          payload?.transcriptPath,
          state.pendingStartMs,
          nowMs,
          state.pendingInitialNumSteps ?? payload?.initialNumSteps ?? null
        )
      : 0;
    const modelElapsedMs = Math.max(0, invocationElapsedMs - toolElapsedMs);

    writeTiming(file, {
      totalApiDurationMs: totalApiDurationMs + modelElapsedMs,
      totalToolDurationMs: totalToolDurationMs + toolElapsedMs,
      fromStart,
      pendingStartMs: null,
      pendingInvocationNum: null,
      pendingInitialNumSteps: null,
      lastInvocationMs: modelElapsedMs > 0 ? modelElapsedMs : (state.lastInvocationMs ?? null),
      lastToolDurationMs: toolElapsedMs > 0 ? toolElapsedMs : (state.lastToolDurationMs ?? null),
      updatedAtMs: nowMs,
    });
  }
}

function main() {
  const phase = process.argv[2];
  const chunks = [];
  let finished = false;

  const finish = () => {
    if (finished) return;
    finished = true;
    const raw = Buffer.concat(chunks).toString('utf8').trim();
    if (raw) {
      try {
        recordPhase(phase, JSON.parse(raw), Date.now());
      } catch {
        // Ignore malformed stdin to keep hook non-blocking.
      }
    }
    process.stdout.write('{}\n');
    process.exit(0);
  };

  const timer = setTimeout(finish, 500);
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
  recordPhase,
  getConversationKey,
  getTimingPath,
  getToolDirPath,
  resolveToolWindowMs,
};
