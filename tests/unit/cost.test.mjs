import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getNativeCostUsd,
  calculateTokenCost,
  getSessionCostUsd,
  formatUsd,
} from '../../runtime/cost.js';

const NOV_2026 = Date.UTC(2026, 10, 23, 12);

test('getNativeCostUsd extracts native cost from agyData', () => {
  assert.equal(getNativeCostUsd({ cost: { total_cost_usd: 1.5 } }), 1.5);
  assert.equal(getNativeCostUsd({ cost: { total_usd: 2.25 } }), 2.25);
  assert.equal(getNativeCostUsd({ total_usd: 0.75 }), 0.75);
  assert.equal(getNativeCostUsd({ cost: { total_cost_usd: -1 } }), null);
  assert.equal(getNativeCostUsd({ cost: null }), null);
  assert.equal(getNativeCostUsd({}), null);
});

test('getNativeCostUsd respects routed models unless allowRoutedCost is set', () => {
  const stdin = {
    model: { id: 'us.anthropic.claude-sonnet-4-20250514-v1:0' },
    cost: { total_cost_usd: 2.0 },
  };
  assert.equal(getNativeCostUsd(stdin), null);
  assert.equal(getNativeCostUsd(stdin, { allowRoutedCost: true }), 2.0);
});

test('calculateTokenCost prices agy models at their list rates', () => {
  const tokens = {
    input_tokens: 1_000_000,
    output_tokens: 1_000_000,
    cache_read_input_tokens: 1_000_000,
  };
  // Gemini 4 Neon: $3 input, $15 output, $0.15 cache read; display names and ids both match.
  assert.equal(calculateTokenCost('Gemini 4 Neon (XHigh)', tokens, NOV_2026)?.toFixed(4), (3 + 15 + 0.15).toFixed(4));
  assert.equal(calculateTokenCost('gemini-4-neon-xhigh', tokens, NOV_2026)?.toFixed(4), (3 + 15 + 0.15).toFixed(4));
  // Gemini 3.8 Flash promotional rates through 2026: $0.75 / $3.75 / $0.075.
  assert.equal(calculateTokenCost('Gemini 3.8 Flash (Medium)', tokens, NOV_2026)?.toFixed(4), (0.75 + 3.75 + 0.075).toFixed(4));

  // Claude Opus 5.5 charges cache writes at its own rate ($5), not the input rate ($4).
  const opusCost = calculateTokenCost('claude-opus-5-5-medium', {
    input_tokens: 100_000,
    output_tokens: 10_000,
    cache_read_input_tokens: 50_000,
    cache_creation_input_tokens: 20_000,
  }, NOV_2026);
  // 0.1*4 + 0.01*20 + 0.05*0.2 + 0.02*5 = 0.4 + 0.2 + 0.01 + 0.1 = 0.71
  assert.equal(opusCost?.toFixed(4), (0.71).toFixed(4));
});

test('calculateTokenCost switches scheduled prices at the Pacific-time boundary', () => {
  const tokens = { input_tokens: 1_000_000 };
  const lastIntroMs = Date.UTC(2026, 11, 1, 7, 59); // Nov 30 23:59 PST
  const firstNewMs = Date.UTC(2026, 11, 1, 8, 0); // Dec 1 00:00 PST
  assert.equal(calculateTokenCost('gemini-4-carbon-medium', tokens, lastIntroMs), 2);
  assert.equal(calculateTokenCost('gemini-4-carbon-medium', tokens, firstNewMs), 4);
  assert.equal(calculateTokenCost('gemini-4-argon-medium', tokens, firstNewMs), 4);
});

test('calculateTokenCost returns null for models without a known price', () => {
  assert.equal(calculateTokenCost('unknown', { input_tokens: 1_000_000 }, NOV_2026), null);
  assert.equal(calculateTokenCost('some-new-model', { input_tokens: 1_000_000 }, NOV_2026), null);
});

test('getSessionCostUsd prefers native cost, falls back to calculated token cost', () => {
  // When native cost is present:
  const withNative = {
    cost: { total_cost_usd: 0.42 },
    model: { id: 'gemini-3.8-flash' },
    context_window: { total_input_tokens: 1000, total_output_tokens: 500 },
  };
  assert.equal(getSessionCostUsd(withNative), 0.42);

  // When native cost is absent, computes from context_window tokens:
  const withoutNative = {
    model: { id: 'gemini-4-hydrogen-high' },
    context_window: {
      total_input_tokens: 100_000,
      total_output_tokens: 10_000,
    },
  };
  const computed = getSessionCostUsd(withoutNative);
  // Hydrogen: (100k/1M * 1.50) + (10k/1M * 7.50) = 0.15 + 0.075 = 0.225
  assert.equal(computed?.toFixed(4), (0.225).toFixed(4));
});

test('formatUsd formats currencies across thresholds', () => {
  assert.equal(formatUsd(1.2345), '$1.23');
  assert.equal(formatUsd(0.4567), '$0.457');
  assert.equal(formatUsd(0.01234), '$0.0123');
  assert.equal(formatUsd(0), '$0.00');
});
