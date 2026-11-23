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
  const inputTokens = Math.ceil(config.maxInputChars / 4);
  return estimateCostUsd(config, { inputTokens, outputTokens: config.maxOutputTokens });
}
