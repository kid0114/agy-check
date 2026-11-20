import { describe, test } from 'node:test';
import assert from 'node:assert';
import { renderHUD } from '../../runtime/renderer.js';
import {
  calculateTurnCacheMetrics,
  formatTurnCacheBadge,
} from '../../runtime/renderer/format.js';

const ANSI_RE = /\x1b\[[0-?]*[ -/]*[@-~]/g;

function render(currentUsage, display = {}, options = {}) {
  const state = {
    steps: 1,
    branch: 'main',
    ...(options.state || {}),
  };
  const contextWindow = {
    total_input_tokens: options.totalInput ?? 9000,
    total_output_tokens: options.totalOutput ?? 500000,
    context_window_size: 1000000,
    used_percentage: 1,
    ...(options.contextWindow || {}),
  };
  if (currentUsage !== undefined) contextWindow.current_usage = currentUsage;
  const agyData = {
    context_window: contextWindow,
    model: options.model || {
      id: 'claude-sonnet-4-6',
      display_name: 'Claude Sonnet 4.6 (Thinking)',
    },
  };

  return renderHUD(state, agyData, {
    display: {
      showTurnCacheHitRate: true,
      ...display,
    },
    language: options.language,
  }).replace(ANSI_RE, '');
}

describe('renderer / per-turn and session cache hit rate', () => {
  test('table mode calculates incremental input + cache as total prompt', () => {
    const output = render({
      input_tokens: 1000,
      output_tokens: 500000,
      cache_creation_input_tokens: 1000,
      cache_read_input_tokens: 3000,
    }, { quotaStyle: 'table', unicode: false });

    assert.match(output, /in: 1k, out: 500k, cache: 4k/);
    assert.match(output, /\| cache 60\.0% \(3k\/5k\) \|/);
    assert.equal(output.trim().split('\n').length, 2);
  });

  test('table mode appends session average when state.sessionCache has >= 2 turns', () => {
    const output = render({
      input_tokens: 2500,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 220100,
    }, { quotaStyle: 'table', unicode: false }, {
      state: {
        sessionCache: {
          cacheRead: 926000,
          totalPrompt: 1000000,
          hitRate: 92.6,
          turns: 12,
          available: true,
        },
      },
    });

    assert.match(output, /\| cache 98\.9% \(220\.1k\/222\.6k, avg 92\.6%\) \|/);
  });

  test('compact mode omits absolute counts and keeps session avg compact', () => {
    const output = render({
      input_tokens: 1000,
      cache_creation_input_tokens: 1000,
      cache_read_input_tokens: 3000,
    }, { quotaStyle: 'compact', unicode: false }, {
      state: {
        sessionCache: {
          cacheRead: 4000,
          totalPrompt: 5000,
          hitRate: 80.0,
          turns: 3,
          available: true,
        },
      },
    });

    assert.match(output, /Tokens 505k \| cache 60\.0% \(avg 80\.0%\) \|/);
    assert.doesNotMatch(output, /in: 1k/);
    const lines = output.trim().split('\n');
    assert.equal(lines.length, 2);
    assert.ok(lines[1].length <= 80, `compact resource line is ${lines[1].length} columns`);
  });

  test('accurately handles boundary turns where incremental input >= cache_read > 0', () => {
    // Regression: real agy turns (Gemini & Claude) report uncached incremental input_tokens.
    for (const [displayName, input, read, expectedPct, expectedDenom] of [
      ['Gemini 4 Hydrogen (XHigh)', 9244, 6928, '42.8%', '16.2k'],
      ['Claude Opus 5.5 (Medium)', 84713, 7346, '8.0%', '92.1k'],
    ]) {
      const output = render({
        input_tokens: input,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: read,
      }, { quotaStyle: 'table', unicode: false }, {
        model: { id: displayName.toLowerCase(), display_name: displayName },
      });

      assert.match(output, new RegExp(`cache ${expectedPct.replace('.', '\\.')} \\([^/]+/${expectedDenom.replace('.', '\\.')}\\)`));
    }
  });

  test('shows real 0.0% on cold-cache turns even when cache_read is 0 or omitted', () => {
    const explicitZero = render({
      input_tokens: 2000,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    }, { quotaStyle: 'table', unicode: false });
    assert.match(explicitZero, /\| cache 0\.0% \(0\/2k\) \|/);

    // Go omitzero may omit cache_read_input_tokens on 0-hit turns
    const omittedZero = render({
      input_tokens: 150657,
    }, { quotaStyle: 'table', unicode: false }, {
      state: { maxHistoricalCache: 145736 },
    });
    assert.match(omittedZero, /\| cache 0\.0% \(0\/150\.7k\) \|/);
    assert.doesNotMatch(omittedZero, /cache: 145\.7k\*/);
  });

  test('marks invalid telemetry or opt-in smoothing as unavailable', () => {
    const missingInput = render({
      cache_creation_input_tokens: 1000,
      cache_read_input_tokens: 3000,
    }, { unicode: false, cacheHitThresholds: null });
    assert.match(missingInput, /\| cache -- \|/);

    const smoothed = render({
      input_tokens: 258000,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    }, { unicode: false, cacheSmoothing: true }, {
      totalInput: 258000,
      state: { maxHistoricalCache: 250000 },
    });
    assert.match(smoothed, /cache: 250k\*/);
    assert.match(smoothed, /\| cache -- \|/);
  });

  test('can be disabled without hiding the existing cache token count', () => {
    const output = render({
      input_tokens: 1000,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 3000,
    }, { showTurnCacheHitRate: false, unicode: false });

    assert.match(output, /cache: 3k/);
    assert.doesNotMatch(output, /\| cache 75\.0%/);
  });

  test('omits duplicate session avg on single-turn sessions and when showSessionCacheHitRate is false', () => {
    const singleTurn = render({
      input_tokens: 1000,
      cache_read_input_tokens: 3000,
    }, { unicode: false }, {
      state: {
        sessionCache: { cacheRead: 3000, totalPrompt: 4000, hitRate: 75.0, turns: 1, available: true },
      },
    });
    assert.match(singleTurn, /\| cache 75\.0% \(3k\/4k\) \|/);
    assert.doesNotMatch(singleTurn, /avg /);

    const disabledSes = render({
      input_tokens: 1000,
      cache_read_input_tokens: 3000,
    }, { unicode: false, showSessionCacheHitRate: false }, {
      state: {
        sessionCache: { cacheRead: 9000, totalPrompt: 10000, hitRate: 90.0, turns: 5, available: true },
      },
    });
    assert.doesNotMatch(disabledSes, /avg /);
  });

  test('uses plain-text English label in zh locale', () => {
    const output = render({
      input_tokens: 1480,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 8520,
    }, { quotaStyle: 'compact', unicode: false }, { language: 'zh' });

    assert.match(output, /\| cache 85\.2% \|/);
  });

  test('falls back to complete transcript usage when agy current_usage is incomplete', () => {
    const output = render({
      cache_creation_input_tokens: 0,
    }, { unicode: false }, {
      state: {
        usage: {
          current_usage: {
            input_tokens: 1000,
            cache_read_input_tokens: 9000,
            cache_creation_input_tokens: 0,
          },
        },
      },
    });

    assert.match(output, /\| cache 90\.0% \(9k\/10k\) \|/);
  });

  test('prefers live agy group over conflicting transcript telemetry', () => {
    const output = render({
      input_tokens: 10000,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    }, { unicode: false }, {
      state: {
        usage: {
          current_usage: {
            input_tokens: 1000,
            cache_read_input_tokens: 9000,
            cache_creation_input_tokens: 0,
          },
        },
      },
    });

    assert.match(output, /\| cache 0\.0% \(0\/10k\) \|/);
  });
});

describe('renderer / cache badge temperature scale', () => {
  const colors = {
    green: '<green>',
    cyan: '<cyan>',
    yellow: '<yellow>',
    gray: '<gray>',
    bold: '<bold>',
    dim: '<dim>',
    reset: '</>',
  };

  function badge(uncachedInput, read) {
    const metrics = calculateTurnCacheMetrics({
      input_tokens: uncachedInput,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: read,
    });
    return formatTurnCacheBadge(metrics, 'cache', colors, true);
  }

  test('renders 0%, 25%, 50%, 85.2%, and 100% with four glanceable styles', () => {
    assert.equal(badge(1000, 0), '<gray><dim>cache 0.0%</>');
    assert.equal(badge(750, 250), '<yellow><dim>cache 25.0%</>');
    assert.equal(badge(500, 500), '<yellow>cache 50.0%</>');
    assert.equal(badge(1480, 8520), '<green><bold>cache 85.2%</>');
    assert.equal(badge(0, 1000), '<green><bold>cache 100.0%</>');
  });

  test('marks invalid cache measurements unavailable', () => {
    for (const usage of [
      { input_tokens: -1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
      { input_tokens: 1000, cache_creation_input_tokens: 0, cache_read_input_tokens: Number.NaN },
      { input_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    ]) {
      assert.equal(calculateTurnCacheMetrics(usage).available, false);
    }
  });
});
