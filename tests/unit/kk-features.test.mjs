import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { getSessionState } = require('../../runtime/parser.js');
const { configureTimerHooks } = require('../../runtime/statusline-installer.js');
const { clearTimerHooks } = require('../../runtime/uninstall.js');
const { resolveToolWindowMs } = require('../../runtime/invocation-timer.js');

describe('agy-hud-kk enhancements', () => {
  test('parser reads native agy PLANNER_RESPONSE token fields and aggregates sessionCache', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-hud-kk-parser-'));
    try {
      const tp = path.join(tmp, 'transcript.jsonl');
      fs.writeFileSync(tp, [
        JSON.stringify({ step_index: 1, type: 'PLANNER_RESPONSE', input_tokens: 10000, cache_read_tokens: 0, output_tokens: 500, created_at: '2026-11-20T00:00:01Z' }),
        JSON.stringify({ step_index: 3, type: 'PLANNER_RESPONSE', input_tokens: 2000, cache_read_tokens: 10000, output_tokens: 400, created_at: '2026-11-20T00:00:05Z' }),
        JSON.stringify({ step_index: 5, type: 'PLANNER_RESPONSE', input_tokens: 8000, cache_read_tokens: 6000, output_tokens: 300, created_at: '2026-11-20T00:00:10Z' }),
      ].join('\n') + '\n', 'utf8');

      const state = await getSessionState(tp, tmp);
      assert.equal(state.steps, 5);
      assert.equal(state.maxHistoricalCache, 10000);
      assert.deepEqual(state.usage.current_usage, {
        input_tokens: 8000,
        cache_read_input_tokens: 6000,
        cache_creation_input_tokens: 0,
        output_tokens: 300,
      });
      assert.equal(state.sessionCache.available, true);
      assert.equal(state.sessionCache.turns, 3);
      assert.equal(state.sessionCache.uncachedInput, 20000);
      assert.equal(state.sessionCache.cacheRead, 16000);
      assert.equal(state.sessionCache.totalPrompt, 36000);
      assert.equal(state.sessionCache.hitRate.toFixed(1), '44.4');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('configureTimerHooks and clearTimerHooks preserve unrelated user hooks', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-hud-kk-hooks-'));
    try {
      const hooksPath = path.join(tmp, 'hooks.json');
      fs.writeFileSync(hooksPath, JSON.stringify({
        'my-other-hook': { PreInvocation: [{ type: 'command', command: 'echo hi' }] },
      }, null, 2));

      const res = configureTimerHooks(path.join(tmp, 'runtime'), {
        hooksPath,
        nodePath: '/usr/local/bin/node',
      });
      assert.equal(res.changed, true);

      const written = JSON.parse(fs.readFileSync(hooksPath, 'utf8'));
      assert.ok(written['my-other-hook']);
      assert.ok(written['agy-hud-invocation-timer']);
      assert.match(written['agy-hud-invocation-timer'].PreInvocation[0].command, /invocation-timer\.js" pre$/);
      assert.match(written['agy-hud-invocation-timer'].PostToolUse[0].hooks[0].command, /invocation-timer\.js" post-tool$/);
      assert.match(written['agy-hud-invocation-timer'].PostInvocation[0].command, /invocation-timer\.js" post$/);

      // Idempotent second call
      const res2 = configureTimerHooks(path.join(tmp, 'runtime'), {
        hooksPath,
        nodePath: '/usr/local/bin/node',
      });
      assert.equal(res2.changed, false);

      // Clean uninstall removes only our entry
      const cleared = clearTimerHooks(hooksPath);
      assert.equal(cleared.changed, true);
      const after = JSON.parse(fs.readFileSync(hooksPath, 'utf8'));
      assert.ok(after['my-other-hook']);
      assert.equal(after['agy-hud-invocation-timer'], undefined);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('resolveToolWindowMs computes tool duration from transcript start midpoint and PostToolUse end', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-hud-kk-timer-'));
    try {
      const tp = path.join(tmp, 'transcript.jsonl');
      const startIso = '2026-11-20T00:00:10Z';
      const startMs = Date.parse(startIso);
      fs.writeFileSync(tp, JSON.stringify({
        step_index: 4,
        type: 'RUN_COMMAND',
        created_at: startIso,
      }) + '\n', 'utf8');

      const toolMs = resolveToolWindowMs(
        [{ id: 'call_1', stepIdx: 4, endMs: startMs + 3500 }],
        tp,
        startMs - 2000,
        startMs + 5000,
        3
      );
      // Midpoint compensation adds +500ms to floor-second created_at => 3500 - 500 = 3000ms
      assert.equal(toolMs, 3000);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
