import { buildOpenAiRequest } from './prompt.mjs';

function extractOutputText(data) {
  if (data && typeof data.output_text === 'string') return data.output_text;
  const parts = [];
  for (const item of data?.output || []) {
    for (const content of item.content || []) {
      if (content && content.type === 'output_text' && typeof content.text === 'string') parts.push(content.text);
    }
  }
  return parts.join('');
}

export async function openAiReview({ config, evidence, untrusted, fetchImpl }) {
  if (!config.openaiApiKey) throw new Error('OpenAI review failed (not_configured)');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await fetchImpl(config.openaiUrl, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${config.openaiApiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(buildOpenAiRequest(config, evidence, untrusted)),
    });
    if (!response.ok) throw new Error(`OpenAI review failed (${response.status})`);
    const data = await response.json();
    const text = extractOutputText(data);
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error('OpenAI review failed (invalid_json)');
    }
    const inputTokens = Number.isFinite(data?.usage?.input_tokens) ? data.usage.input_tokens : null;
    const outputTokens = Number.isFinite(data?.usage?.output_tokens) ? data.usage.output_tokens : null;
    return {
      decision: parsed,
      usage: {
        inputTokens: inputTokens == null ? null : inputTokens,
        outputTokens: outputTokens == null ? null : outputTokens,
      },
    };
  } catch (error) {
    if (error && error.name === 'AbortError') throw new Error('OpenAI review failed (timeout)');
    if (error instanceof Error && error.message.startsWith('OpenAI review failed')) throw error;
    throw new Error('OpenAI review failed (network)');
  } finally {
    clearTimeout(timer);
  }
}
