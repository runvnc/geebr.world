// wllama (llama.cpp -> WASM) generation runner for MiniCPM5-1B.
// Wraps the wllama instance into a WebLLM-compatible chat.completions.create()
// interface. Uses the MiniCPM5 ChatML-style template from openbmb.
import { getCurrentModel } from './model-loader-wllama.js';

// MiniCPM5 chat template (ChatML-style, from openbmb/MiniCPM5-1B chat_template.jinja)
function buildPrompt(messages, think) {
  // BOS is required: this GGUF has add_bos_token=false, and without an explicit
  // <s> the model immediately emits the end-of-turn token (empty replies).
  let p = "<s>";
  for (const msg of messages) {
    p += `<|im_start|>${msg.role}\n${msg.content}\n`;
  }
  p += "<|im_start|>assistant\n";
  p += think ? " thinking\n" : " thinking\n\n response\n\n";
  return p;
}

// Build a fake engine object with chat.completions.create() that internally
// calls wllama.createCompletion().
export function createWllamaEngine(wllamaInstance) {
  const engine = {
    chat: {
      completions: {
        create: async (config) => {
          const messages = config.messages || [];
          const maxTokens = config.max_tokens ?? 100;
          const temperature = config.temperature ?? 0.7;
          const enableThinking = config.extra_body?.enable_thinking ?? false;
          const onToken = config.onToken ?? null;
          const shouldAbort = config.shouldAbort ?? null;

          const prompt = buildPrompt(messages, enableThinking);
          const aborter = new AbortController();
          let full = "";
          const poll = setInterval(() => { if (shouldAbort?.()) aborter.abort(); }, 150);
          try {
            full = await wllamaInstance.createCompletion(prompt, {
              nPredict: maxTokens,
              abortSignal: aborter.signal,
              sampling: { temp: temperature, top_p: 0.95, top_k: 40, penalty_repeat: 1.1 },
              onNewToken: (token, piece, currentText, { abortSignal }) => {
                full = currentText;
                if (shouldAbort?.()) { abortSignal(); return; }
                onToken?.(full, true);
              },
            });
          } finally {
            clearInterval(poll);
          }
          const text = full.trim();
          return { choices: [{ message: { content: text } }] };
        },
      },
    },
    unload: () => {
      try { wllamaInstance.exit(); } catch {}
    },
  };
  return engine;
}

// Main generate function - matches gpt-runner.js generate() signature
export async function generate(engine, prompt, opts = {}) {
  const maxTokens = opts.maxTokens ?? 100;
  const temperature = opts.temperature ?? 0.7;
  const enableThinking = opts.enableThinking ?? false;
  const debugLog = opts.debugLog ?? null;
  const dryRun = opts.dryRun ?? false;
  const onToken = opts.onToken ?? null;

  // If messages array provided, use it directly
  if (opts.messages && Array.isArray(opts.messages) && opts.messages.length > 0) {
    const genConfig = {
      messages: opts.messages,
      max_tokens: maxTokens,
      temperature,
      top_p: 0.95,
      onToken: onToken,
      extra_body: { enable_thinking: enableThinking },
      shouldAbort: opts.shouldAbort ?? null,
    };

    debugLog?.('wllama request config', { model: getCurrentModel(), max_tokens: maxTokens, temperature, message_count: opts.messages.length, streaming: !!onToken });

    if (dryRun) { debugLog?.('wllama dry run: generation skipped'); return ''; }

    const startedAt = performance.now();
    const result = await engine.chat.completions.create(genConfig);
    debugLog?.('wllama finished', { ms: Math.round(performance.now() - startedAt) });
    const text = result.choices[0]?.message?.content || '';
    return text;
  }

  // Build messages from prompt + system message
  const messages = [];
  const sysParts = [];
  if (opts.systemMessage?.trim()) sysParts.push(opts.systemMessage.trim());
  if (!enableThinking) sysParts.push('Do not use thinking tags. Provide your answer directly.');
  if (opts.constraintInstruction?.trim()) sysParts.push(opts.constraintInstruction.trim());
  if (sysParts.length) messages.push({ role: 'system', content: sysParts.join('\n\n') });
  messages.push({ role: 'user', content: prompt });

  const genConfig = {
    messages,
    max_tokens: maxTokens,
    temperature,
    top_p: 0.95,
    onToken: onToken,
    extra_body: { enable_thinking: enableThinking },
    shouldAbort: opts.shouldAbort ?? null,
  };

  debugLog?.('wllama request config', {
    model: getCurrentModel(),
    max_tokens: genConfig.max_tokens,
    temperature: genConfig.temperature,
    system_message: messages.find(m => m.role === 'system')?.content || '',
    user_message: prompt,
    streaming: !!onToken,
  });

  if (dryRun) {
    debugLog?.('wllama dry run: generation skipped');
    return '';
  }

  const startedAt = performance.now();
  const result = await engine.chat.completions.create(genConfig);
  debugLog?.('wllama finished', { ms: Math.round(performance.now() - startedAt) });
  return result.choices[0]?.message?.content || '';
}
