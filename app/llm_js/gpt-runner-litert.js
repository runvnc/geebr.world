// LiteRT-LM generation runner - wraps LiteRT-LM Engine/Conversation
// to provide a WebLLM-compatible chat.completions.create() interface.
// Uses correct LiteRT-LM JS API: Engine.create(), engine.createConversation(),
// conversation.sendMessage() / conversation.sendMessageStreaming().
// Reuses conversations to leverage preface prefill caching.
import { getCurrentModel } from './model-loader-litert.js';

function stripThinkBlocks(text) {
  return text
    .replace(/<\|channel\|>thought[\s\S]*?<\|channel\|>/gi, '')
    .replace(/<\|think\|>[\s\S]*?<\/think>/gi, '')
    .replace(/^\s*<\|think\|>[\s\S]*$/i, '')
    .replace(/<\/?think>/gi, '')
    .replace(/<\/?\|think\|>/gi, '')
    .trimStart();
}

// LiteRT conversations retain KV/history state, so they must be explicitly
// bounded and disposed. Keep one conversation per agent/configuration, rotate
// it periodically, and cap the total number retained by the page.
const conversationCache = new Map();
const MAX_CONVERSATIONS = 8;
const MAX_TURNS_PER_CONVERSATION = 12;

function hashSystemPrompt(text) {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = ((h << 5) - h + text.charCodeAt(i)) | 0;
  return String(h);
}

function disposeConversation(conv) {
  if (!conv) return;
  for (const method of ['delete', 'dispose', 'close']) {
    try {
      if (typeof conv[method] === 'function') { conv[method](); return; }
    } catch (error) {
      console.warn('[geebr-brain] conversation disposal failed', error);
      return;
    }
  }
}

function evictConversation(key) {
  const entry = conversationCache.get(key);
  if (!entry) return;
  conversationCache.delete(key);
  disposeConversation(entry.conv);
}

export function clearLiteRTConversations(agentId = null) {
  for (const [key, entry] of [...conversationCache]) {
    if (agentId === null || entry.agentId === String(agentId)) evictConversation(key);
  }
}

// Build a fake engine object with chat.completions.create() that internally
// calls LiteRT-LM engine.createConversation() + conversation.sendMessage().
export function createLiteRTEngine(litertEngine) {
  async function getOrCreateConversation(systemContent, agentId) {
    const owner = String(agentId || 'default');
    const key = owner + ':' + hashSystemPrompt(systemContent || '');
    let entry = conversationCache.get(key);
    if (entry && entry.turns >= MAX_TURNS_PER_CONVERSATION) {
      evictConversation(key);
      entry = null;
    }
    if (!entry) {
      const conversationConfig = {};
      if (systemContent) conversationConfig.preface = { messages: [{ role: 'system', content: systemContent }] };
      const conv = await litertEngine.createConversation(conversationConfig);
      entry = { conv, agentId: owner, turns: 0, lastUsed: performance.now() };
      conversationCache.set(key, entry);
      while (conversationCache.size > MAX_CONVERSATIONS) evictConversation(conversationCache.keys().next().value);
    } else {
      // Refresh insertion order so the map also acts as a small LRU.
      conversationCache.delete(key);
      conversationCache.set(key, entry);
    }
    entry.turns += 1;
    entry.lastUsed = performance.now();
    return entry.conv;
  }

  async function generateText(messages, opts = {}) {
    const maxNewTokens = opts.max_tokens ?? 100;
    const temperature = opts.temperature ?? 0.7;
    const onToken = opts.onToken ?? null;

    // Extract system message for preface
    const systemMessages = messages.filter(m => m.role === 'system');
    let systemContent = systemMessages.map(m => m.content).join('\n\n');
    // Add <|think|> token to enable thinking mode for Gemma 4 E2B/E4B
    if (opts.extra_body?.enable_thinking) {
      systemContent = '<|think|>' + (systemContent || '');
    }

    // Extract non-system messages (user/assistant history + current user message)
    const chatMessages = messages.filter(m => m.role !== 'system');

    // Get or create cached conversation (reuses prefill for same system prompt)
    const conversation = await getOrCreateConversation(systemContent, opts.agentId);

    // Only send the LAST user message - the conversation maintains history
    // The agent-brain.js passes full history, but we only need the latest turn
    const lastMessage = chatMessages[chatMessages.length - 1];
    const promptText = lastMessage?.content || '';

    let fullText = '';

    if (onToken) {
      // Use streaming API
      const stream = conversation.sendMessageStreaming(promptText);
      for await (const chunk of stream) {
        const text = chunk?.content?.[0]?.text || chunk?.content?.[0]?.content || '';
        if (text) {
          fullText += text;
          onToken(fullText, true);
        }
      }
    } else {
      // Non-streaming
      const response = await conversation.sendMessage(promptText);
      fullText = response?.content?.[0]?.text || response?.content?.[0]?.content || '';
    }

    let text = stripThinkBlocks(fullText);
    return text;
  }

  // Fake engine object matching WebLLM's interface
  const engine = {
    chat: {
      completions: {
        create: async (config) => {
          const text = await generateText(config.messages, config);
          return {
            choices: [{ message: { content: text } }],
          };
        },
      },
    },
    unload: () => {
      clearLiteRTConversations();
      try { litertEngine.delete(); } catch {}
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
      agentId: opts.agentId || 'default',
    };

    debugLog?.('LiteRT request config', { model: getCurrentModel(), max_tokens: maxTokens, temperature, message_count: opts.messages.length, streaming: !!onToken });

    if (dryRun) { debugLog?.('LiteRT dry run: generation skipped'); return ''; }

    const startedAt = performance.now();
    const result = await engine.chat.completions.create(genConfig);
    debugLog?.('LiteRT finished', { ms: Math.round(performance.now() - startedAt) });
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
    agentId: opts.agentId || 'default',
  };

  debugLog?.('LiteRT request config', {
    model: getCurrentModel(),
    max_tokens: genConfig.max_tokens,
    temperature: genConfig.temperature,
    system_message: messages.find(m => m.role === 'system')?.content || '',
    user_message: prompt,
    streaming: !!onToken,
  });

  if (dryRun) {
    debugLog?.('LiteRT dry run: generation skipped');
    return '';
  }

  const startedAt = performance.now();
  const result = await engine.chat.completions.create(genConfig);
  debugLog?.('LiteRT finished', { ms: Math.round(performance.now() - startedAt) });
  return result.choices[0]?.message?.content || '';
}
