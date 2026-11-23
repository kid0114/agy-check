'use strict';

// Model pricing per 1,000,000 tokens (USD), standard paid tier / global region.
// agy serves every model through Google Antigravity, so rates come from Google's list prices
// (verified 2026-11-23): Gemini models from https://ai.google.dev/gemini-api/docs/pricing,
// third-party models such as Opus/Sonnet from https://cloud.google.com/model-garden/partner-models/pricing.
// `schedule` entries switch rates at `from` (epoch ms); Google bills in Pacific time, so
// "through November 30, 2026" ends at 2026-12-01T00:00 PST = 08:00 UTC.
const PT_2026_12_01 = Date.UTC(2026, 11, 1, 8);
const PT_2027_01_01 = Date.UTC(2027, 0, 1, 8);

const MODEL_PRICING = [
  { pattern: /gemini[-_ ]?4[-_ ]?neon/i, input: 3.00, output: 15.00, cacheRead: 0.15 },
  { pattern: /gemini[-_ ]?4[-_ ]?hydrogen/i, input: 1.50, output: 7.50, cacheRead: 0.075 },
  {
    pattern: /gemini[-_ ]?4[-_ ]?(carbon|argon)/i,
    input: 2.00,
    output: 10.00,
    cacheRead: 0.10,
    schedule: [{ from: PT_2026_12_01, input: 4.00, output: 20.00, cacheRead: 0.20 }],
  },
  {
    pattern: /gemini[-_ ]?3\.8[-_ ]?flash/i,
    input: 0.75,
    output: 3.75,
    cacheRead: 0.075,
    schedule: [{ from: PT_2027_01_01, input: 1.50, output: 7.50, cacheRead: 0.15 }],
  },
  { pattern: /opus[-_ ]?5[-_.]5/i, input: 4.00, output: 20.00, cacheRead: 0.20, cacheWrite: 5.00 },
  { pattern: /sonnet[-_ ]?5[-_.]5/i, input: 2.00, output: 10.00, cacheRead: 0.10, cacheWrite: 2.50 },
  // Older model families (legacy list prices).
  { pattern: /opus/i, input: 15.00, output: 75.00, cacheRead: 1.50 },
  { pattern: /sonnet/i, input: 3.00, output: 15.00, cacheRead: 0.30 },
  { pattern: /haiku/i, input: 0.80, output: 4.00, cacheRead: 0.08 },
  { pattern: /pro/i, input: 1.25, output: 5.00, cacheRead: 0.3125 },
  { pattern: /flash/i, input: 0.075, output: 0.30, cacheRead: 0.01875 },
  { pattern: /gpt-?4/i, input: 2.50, output: 10.00, cacheRead: 1.25 },
];

/**
 * Returns the per-1M-token rates in effect for a model at a point in time,
 * or null when the model has no known price (callers must treat that as unknown, not free).
 *
 * @param {string} modelNameOrId
 * @param {number} [atMs]
 * @returns {{input:number, output:number, cacheRead:number, cacheWrite?:number}|null}
 */
function resolveModelPricing(modelNameOrId, atMs = Date.now()) {
  const row = MODEL_PRICING.find(p => p.pattern.test(String(modelNameOrId || '')));
  if (!row) return null;
  let rates = row;
  for (const step of row.schedule || []) {
    if (atMs >= step.from) rates = { ...row, ...step };
  }
  return rates;
}

function isBedrockModelId(id) {
  return typeof id === 'string' && (id.startsWith('anthropic.') || id.startsWith('us.anthropic.') || id.startsWith('eu.anthropic.'));
}

function isVertexModelId(id) {
  return typeof id === 'string' && (id.startsWith('claude-') && id.includes('@'));
}

/**
 * Native session cost reported directly by agy/Claude CLI.
 *
 * @param {Object} agyData
 * @param {Object} [options]
 * @returns {number|null}
 */
function getNativeCostUsd(agyData, options = {}) {
  const cost = agyData?.cost?.total_cost_usd ?? agyData?.cost?.total_usd ?? agyData?.total_usd;
  if (typeof cost !== 'number' || !Number.isFinite(cost) || cost < 0) {
    return null;
  }
  const modelId = agyData?.model?.id || '';
  const routed = isBedrockModelId(modelId) || isVertexModelId(modelId);
  if (routed && (!options?.allowRoutedCost || cost === 0)) {
    return null;
  }
  return cost;
}

/**
 * Calculates estimated cost from token counts and model pricing.
 *
 * @param {string} modelNameOrId
 * @param {Object} tokens
 * @param {number} [atMs] when the tokens were used; selects scheduled price changes
 * @returns {number|null} null when tokens are missing or the model has no known price
 */
function calculateTokenCost(modelNameOrId, tokens, atMs = Date.now()) {
  if (!tokens || typeof tokens !== 'object') return null;

  const pricing = resolveModelPricing(modelNameOrId, atMs);
  if (!pricing) return null;

  const inTokens = Number(tokens.input_tokens || tokens.total_input_tokens || 0);
  const outTokens = Number(tokens.output_tokens || tokens.total_output_tokens || 0);
  const cacheTokens = Number(tokens.cache_read_input_tokens || tokens.cache_read_tokens || 0);
  const cacheWriteTokens = Number(tokens.cache_creation_input_tokens || tokens.cache_write_tokens || 0);

  const cost = (
    (inTokens / 1_000_000) * pricing.input +
    (outTokens / 1_000_000) * pricing.output +
    (cacheTokens / 1_000_000) * pricing.cacheRead +
    (cacheWriteTokens / 1_000_000) * (pricing.cacheWrite ?? pricing.input)
  );

  return Number.isFinite(cost) && cost >= 0 ? cost : null;
}

/**
 * Returns session cost: native cost when available, or calculates from token usage.
 *
 * @param {Object} agyData
 * @param {Object} [state]
 * @param {Object} [options]
 * @returns {number|null}
 */
function getSessionCostUsd(agyData, state = null, options = {}) {
  const native = getNativeCostUsd(agyData, options);
  if (native !== null) {
    return native;
  }

  const modelName = agyData?.model?.display_name || agyData?.model?.id || '';
  const usage = agyData?.context_window || state?.usage;
  if (!usage) return null;

  return calculateTokenCost(modelName, usage);
}

/**
 * Formats a USD amount according to standard tiered decimal rules.
 *
 * @param {number} amount
 * @returns {string}
 */
function formatUsd(amount) {
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) return '$0.00';
  if (amount >= 1) return `$${amount.toFixed(2)}`;
  if (amount >= 0.1) return `$${amount.toFixed(3)}`;
  return `$${amount.toFixed(4)}`;
}

module.exports = {
  getNativeCostUsd,
  calculateTokenCost,
  resolveModelPricing,
  getSessionCostUsd,
  formatUsd,
  isBedrockModelId,
  isVertexModelId,
};
