// WebLLM generation runner - uses OpenAI-compatible chat completions API
import { getCurrentModel } from './model-loader.js';

function isQwenThinkingModel() {
  const key = (getCurrentModel() || '').toLowerCase();
  return key.includes('qwen3') || key.includes('qwen3.5');
}

function stripThinkBlocks(text) {
  return text
    // Normal complete think blocks.
    .replace(/<think>[\s\S]*?<\/think>\s*/gi, '')
    // If the model still starts a think block and never closes it, hide it.
    .replace(/^\s*<think>[\s\S]*$/i, '')
    // Defensive cleanup for empty/prefilled markers.
    .replace(/<\/?think>/gi, '')
    .trimStart();
}

export async function generate(engine, prompt, opts = {}) {
  const maxTokens = opts.maxTokens ?? 100;
  const temperature = opts.temperature ?? 0.7;
  const topK = opts.topK ?? 40;
  const grammar = opts.grammar ?? ''; // Back-compat only; prefer responseFormat.
  const responseFormat = opts.responseFormat ?? null;
  const constraintInstruction = opts.constraintInstruction ?? '';
  const onToken = opts.onToken ?? null;
  const systemMessage = opts.systemMessage ?? '';
  const enableThinking = opts.enableThinking ?? false;
  const frequencyPenalty = opts.frequencyPenalty ?? 0;
  const debugLog = opts.debugLog ?? null;
  const dryRun = opts.dryRun ?? false;

  const messages = [];
  const sysParts = [];
  if (systemMessage.trim()) {
    sysParts.push(systemMessage.trim());
  }
  if (!enableThinking) {
    sysParts.push('Do not use <think> tags. Provide your answer directly, without any internal reasoning.');
  }
  if (constraintInstruction.trim()) {
    sysParts.push(constraintInstruction.trim());
  }
  if (sysParts.length) {
    messages.push({ role: 'system', content: sysParts.join('\n\n') });
  }
  let userPrompt = prompt;
  if (!enableThinking && isQwenThinkingModel()) {
    // Qwen3/Qwen3.5 honor /no_think only when it is part of the user turn.
    userPrompt = `${prompt}\n\n/no_think`;
  }
  messages.push({ role: 'user', content: userPrompt });

  const genConfig = {
    messages,
    max_tokens: maxTokens,
    temperature: temperature,
    top_p: 0.95,
    frequency_penalty: frequencyPenalty,
  };

  if (!enableThinking && isQwenThinkingModel()) {
    // WebLLM's Qwen3 handling expects this exact shape. It internally
    // prepends "<think>\n\n</think>\n\n" to the assistant response, which is
    // how Qwen disables reasoning in non-thinking mode.
    genConfig.extra_body = { enable_thinking: false };
  }

  if (responseFormat) {
    genConfig.response_format = responseFormat;
  } else if (grammar) {
    // Legacy path for callers still passing only a grammar string.
    genConfig.response_format = { type: 'grammar', grammar };
  }

  const rf = genConfig.response_format;
  debugLog?.('request config', {
    model: getCurrentModel(),
    max_tokens: genConfig.max_tokens,
    temperature: genConfig.temperature,
    response_format_type: rf?.type || 'none',
    grammar_chars: rf?.grammar?.length || 0,
    grammar_lines: rf?.grammar ? rf.grammar.split('\n').length : 0,
    grammar_preview: rf?.grammar ? rf.grammar.slice(0, 1200) : '',
    system_message: messages.find(m => m.role === 'system')?.content || '',
    user_message: userPrompt,
  });

  if (dryRun) {
    debugLog?.('dry run: generation skipped before engine.chat.completions.create');
    return '';
  }

  if (onToken) {
    genConfig.stream = true;
    const startedAt = performance.now();
    debugLog?.('calling engine.chat.completions.create');
    const asyncChunks = await engine.chat.completions.create(genConfig);
    debugLog?.('stream opened', { ms: Math.round(performance.now() - startedAt) });
    let fullText = '';
    let displayedText = '';
    let chunkCount = 0;
    let firstTokenAt = null;
    for await (const chunk of asyncChunks) {
      chunkCount += 1;
      if (firstTokenAt === null) {
        firstTokenAt = performance.now();
        debugLog?.('first stream chunk', { ms: Math.round(firstTokenAt - startedAt) });
      }
      const text = chunk.choices[0]?.delta?.content ?? '';
      if (text) {
        fullText += text;
        if (!enableThinking && isQwenThinkingModel()) {
          // Replacement-mode update lets the UI retract any accidental partial
          // <think> text if the browser/model still emits it despite no-think.
          displayedText = stripThinkBlocks(fullText);
          onToken(displayedText, true);
        } else {
          const delta = fullText.slice(displayedText.length);
          displayedText = fullText;
          if (delta) onToken(delta, false);
        }
      }
    }
    debugLog?.('stream finished', { chunks: chunkCount, chars: fullText.length, ms: Math.round(performance.now() - startedAt) });
    return (!enableThinking && isQwenThinkingModel()) ? stripThinkBlocks(fullText) : fullText;
  }

  const startedAt = performance.now();
  debugLog?.('calling engine.chat.completions.create non-stream');
  const result = await engine.chat.completions.create(genConfig);
  debugLog?.('non-stream finished', { ms: Math.round(performance.now() - startedAt) });
  const text = result.choices[0]?.message?.content || '';
  return (!enableThinking && isQwenThinkingModel()) ? stripThinkBlocks(text) : text;
}
