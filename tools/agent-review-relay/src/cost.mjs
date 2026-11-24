import { requestOverheadChars } from './prompt.mjs';

export function round6(value) {
  return Math.round(value * 1e6) / 1e6;
}

export function estimateCostUsd(config, usage) {
  const inputTokens = Number.isFinite(usage?.inputTokens) ? usage.inputTokens : 0;
  const outputTokens = Number.isFinite(usage?.outputTokens) ? usage.outputTokens : 0;
  const cost = (inputTokens / 1e6) * config.inputUsdPerMillion + (outputTokens / 1e6) * config.outputUsdPerMillion;
  return round6(Math.max(0, cost));
}

export function maxCallCostUsd(config) {
  // Estimate, not an invoice. It covers the system prompt, the JSON schema, the request envelope, the full user budget, and the full output budget.
  const inputTokens = Math.ceil((requestOverheadChars() + config.maxInputChars) / 4);
  return estimateCostUsd(config, { inputTokens, outputTokens: config.maxOutputTokens });
}

export function spendOverageUsd(config, usage) {
  const actual = estimateCostUsd(config, usage);
  const reserved = maxCallCostUsd(config);
  return { actual, reserved, overage: round6(Math.max(0, actual - reserved)) };
}
