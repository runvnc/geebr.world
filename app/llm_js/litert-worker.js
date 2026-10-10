// Dedicated Worker hosting the LiteRT-LM (Gemma 4 E2B) engine.
// Everything that used to run on the main thread in model-loader-litert.js /
// gpt-runner-litert.js now lives here: WASM instantiation, the engine's own
// WebGPU device, OPFS model caching, and conversation/KV-cache state. The
// library (@litert-lm/core) never used a Worker itself - it was profiled
// running single-threaded (engine.setSingleThreadedExecution(true)) directly
// on the main thread, sharing the same thread and GPU queue as Babylon's
// renderer.
//
// This is deliberately a CLASSIC worker (model-loader-litert.js constructs it
// without {type:'module'}), not a module worker, and the library is loaded
// via dynamic import() below rather than a static top-level import. The
// library's own WASM glue loader branches on `typeof importScripts ===
// 'function'` to decide how to fetch its Emscripten-generated glue script -
// that property exists but throws ("Module scripts don't support
// importScripts()") inside a module worker, so a module worker breaks it. A
// classic worker's importScripts really does work, which is what the library
// expects; dynamic import() is valid in classic scripts too, so we don't lose
// anything by not being a module worker.
let Engine;
const engineLibReady = (async () => {
  ({ Engine } = await import("https://cdn.jsdelivr.net/npm/@litert-lm/core@0.14.0/+esm"));
})();

const MODEL_CONFIG = {
  'gemma4-e2b-litert': {
    label: 'Gemma 4 E2B (LiteRT-LM)',
    // Mirrored on our R2 bucket (byte-identical to litert-community/gemma-4-E2B-it-litert-lm
    // on Hugging Face, sha256 3a08e8d9...); HF's download speeds were too slow.
    modelUrl: 'https://geebr-models.mindroot.io/gemma-4-E2B-it-web.litertlm',
    vram: '~0.8GB in-memory (PLE memory-mapped)',
  },
};

let engine = null;
let currentModel = null;
let loading = false;

// ---- OPFS cache helpers (identical to the old main-thread versions; OPFS
// and fetch() both work the same way, and access handles are actually
// faster, from inside a Worker). ----
async function getCachedModelFile(modelKey) {
  try {
    const root = await navigator.storage.getDirectory();
    const fileHandle = await root.getFileHandle(`litert-${modelKey}.litertlm`);
    const file = await fileHandle.getFile();
    if (!file.size) {
      await root.removeEntry(`litert-${modelKey}.litertlm`);
      return null;
    }
    return file;
  } catch {
    return null;
  }
}

function formatBytes(bytes) {
  const gib = bytes / (1024 ** 3);
  if (gib >= 1) return `${gib.toFixed(2)} GB`;
  return `${(bytes / (1024 ** 2)).toFixed(0)} MB`;
}

function makeProgressReporter(onProgress) {
  let lastReport = 0;
  return (received, total, startedAt, force = false) => {
    const now = performance.now();
    if (!force && now - lastReport < 150) return;
    lastReport = now;
    const elapsed = Math.max((now - startedAt) / 1000, 0.001);
    const speed = received / elapsed;
    if (total > 0) {
      const percent = Math.min(100, (received / total) * 100);
      const remaining = Math.max(0, total - received);
      const eta = speed > 0 ? Math.ceil(remaining / speed) : null;
      onProgress?.({
        phase: 'download',
        percent,
        receivedBytes: received,
        totalBytes: total,
        text: `Downloading model: ${percent.toFixed(1)}% · ${formatBytes(received)} / ${formatBytes(total)}${eta !== null ? ` · about ${eta}s left` : ''}`,
      });
    } else {
      onProgress?.({ phase: 'download', receivedBytes: received, totalBytes: null, text: `Downloading model: ${formatBytes(received)} received` });
    }
  };
}

async function downloadModelToOPFS(modelKey, modelUrl, onProgress) {
  let root = null;
  let writable = null;
  try {
    const response = await fetch(modelUrl);
    if (!response.ok) throw new Error(`Download failed: ${response.status}`);
    if (!response.body) throw new Error('Download response has no readable body');

    root = await navigator.storage.getDirectory();
    const fileHandle = await root.getFileHandle(`litert-${modelKey}.litertlm`, { create: true });
    writable = await fileHandle.createWritable();
    const reader = response.body.getReader();
    const contentLength = Number(response.headers.get('Content-Length') || 0);
    let received = 0;
    const startedAt = performance.now();
    const report = makeProgressReporter(onProgress);
    report(0, contentLength, startedAt, true);

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      await writable.write(value);
      received += value.byteLength;
      report(received, contentLength, startedAt);
    }
    await writable.close();
    writable = null;
    report(received, contentLength || received, startedAt, true);
    onProgress?.({ phase: 'download', percent: 100, text: `Download complete · ${formatBytes(received)} cached on this device` });
    return await fileHandle.getFile();
  } catch (e) {
    try { await writable?.abort(); } catch {}
    try { await root?.removeEntry(`litert-${modelKey}.litertlm`); } catch {}
    throw e;
  }
}

// ---- conversation cache (moved from gpt-runner-litert.js; the conversation
// objects hold WASM/KV-cache state that only exists inside this worker) ----
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
      console.warn('[litert-worker] conversation disposal failed', error);
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

function clearConversations(agentId = null) {
  for (const [key, entry] of [...conversationCache]) {
    if (agentId === null || entry.agentId === String(agentId)) evictConversation(key);
  }
}

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
    const conv = await engine.createConversation(conversationConfig);
    entry = { conv, agentId: owner, turns: 0, lastUsed: performance.now() };
    conversationCache.set(key, entry);
    while (conversationCache.size > MAX_CONVERSATIONS) evictConversation(conversationCache.keys().next().value);
  } else {
    conversationCache.delete(key);
    conversationCache.set(key, entry);
  }
  entry.turns += 1;
  entry.lastUsed = performance.now();
  return entry.conv;
}

function stripThinkBlocks(text) {
  return text
    .replace(/<\|channel\|>thought[\s\S]*?<\|channel\|>/gi, '')
    .replace(/<\|think\|>[\s\S]*?<\/think>/gi, '')
    .replace(/^\s*<\|think\|>[\s\S]*$/i, '')
    .replace(/<\/?think>/gi, '')
    .replace(/<\/?\|think\|>/gi, '')
    .trimStart();
}

async function generateText(messages, opts, onToken) {
  const systemMessages = messages.filter(m => m.role === 'system');
  let systemContent = systemMessages.map(m => m.content).join('\n\n');
  if (opts.extra_body?.enable_thinking) systemContent = '<|think|>' + (systemContent || '');

  const chatMessages = messages.filter(m => m.role !== 'system');
  const conversation = await getOrCreateConversation(systemContent, opts.agentId);
  const lastMessage = chatMessages[chatMessages.length - 1];
  const promptText = lastMessage?.content || '';

  let fullText = '';
  console.log('[litert-worker] SENDING PROMPT TO LiteRT conversation', {
    agentId: opts.agentId || 'default', streaming: !!onToken, promptText, systemContent,
  });

  try {
    if (onToken) {
      const stream = conversation.sendMessageStreaming(promptText);
      for await (const chunk of stream) {
        const text = chunk?.content?.[0]?.text || chunk?.content?.[0]?.content || '';
        if (text) { fullText += text; onToken(fullText); }
      }
    } else {
      const response = await conversation.sendMessage(promptText);
      fullText = response?.content?.[0]?.text || response?.content?.[0]?.content || '';
    }
  } catch (err) {
    console.error('[litert-worker] ERROR FROM LiteRT conversation:', err);
    throw err;
  }

  console.log('[litert-worker] RAW LiteRT OUTPUT:', fullText);
  return stripThinkBlocks(fullText);
}

// ---- message protocol ----
// In:  {id, type:'load'|'unload'|'clearCache'|'hasCached'|'capabilityInfo'|'generate'|'clearConversations', ...payload}
// Out: {id, type:'progress'|'token', ...}  (0+ times)
//      {id, type:'result', data}            (exactly once, success)
//      {id, type:'error', message}          (exactly once, failure)
self.onmessage = async (e) => {
  const { id, type } = e.data;
  const reply = (msg) => self.postMessage({ id, ...msg });
  try {
    await engineLibReady;
    if (type === 'load') {
      const { modelKey } = e.data;
      const cfg = MODEL_CONFIG[modelKey];
      if (!cfg) throw new Error(`Unknown model: ${modelKey}`);
      if (engine && currentModel === modelKey) { reply({ type: 'result', data: { alreadyLoaded: true } }); return; }
      if (loading) { reply({ type: 'result', data: { busy: true } }); return; }
      if (engine) { try { engine.delete(); } catch {} engine = null; }
      currentModel = null;
      loading = true;
      const onProgress = (p) => reply({ type: 'progress', data: p });
      try {
        onProgress('Loading LiteRT-LM...');
        onProgress(`Model: ${cfg.label}`);
        onProgress('Checking OPFS cache...');
        let modelFile = await getCachedModelFile(modelKey);
        if (modelFile) {
          onProgress({ phase: 'initialize', text: `Loading ${formatBytes(modelFile.size)} from device cache...` });
        } else {
          onProgress({ phase: 'download', percent: 0, text: 'Starting first-time model download...' });
          modelFile = await downloadModelToOPFS(modelKey, cfg.modelUrl, onProgress);
        }
        onProgress({ phase: 'initialize', percent: 100, text: 'Download complete · initializing local brain...' });
        // The Emscripten glue that Engine.create() loads underneath tries to
        // auto-detect its own directory (to find its companion .wasm file)
        // via self.location.href when running in a worker. Loaded here via
        // importScripts() from inside litert-worker.js, that resolves to
        // OUR worker's own URL, not the CDN path the glue actually came
        // from - it then 404s on our dev server (an HTML error page, which
        // is why the error looks like "magic word ... found 3c 21 44 4f",
        // i.e. the bytes for "<!DO..."). @litert-lm/core never exposes a way
        // to pass Module.locateFile through its public API, but the loader
        // (@litertjs/wasm-utils' createWasmLib) checks for a pre-existing
        // self.Module and honors self.Module.locateFile when set - so we
        // seed it ourselves, matching the CDN version pinned above.
        self.Module = { locateFile: (path) => 'https://cdn.jsdelivr.net/npm/@litert-lm/core@0.14.0/wasm/' + path };
        engine = await Engine.create({ model: modelFile.stream(), mainExecutorSettings: { maxNumTokens: 8192 } });
        currentModel = modelKey;
        onProgress('Gemma 4 E2B ready (LiteRT-LM)');
        reply({ type: 'result', data: { loaded: true, modelKey } });
      } finally {
        loading = false;
      }
    } else if (type === 'unload') {
      clearConversations();
      if (engine) { try { engine.delete(); } catch {} }
      engine = null;
      currentModel = null;
      reply({ type: 'result', data: {} });
    } else if (type === 'clearCache') {
      const key = e.data.modelKey || 'gemma4-e2b-litert';
      try {
        const root = await navigator.storage.getDirectory();
        await root.removeEntry(`litert-${key}.litertlm`);
      } catch (err) {
        console.warn('[litert-worker] cache clear failed', err);
      }
      reply({ type: 'result', data: {} });
    } else if (type === 'hasCached') {
      const key = e.data.modelKey || 'gemma4-e2b-litert';
      let has = false;
      try {
        const root = await navigator.storage.getDirectory();
        const fileHandle = await root.getFileHandle(`litert-${key}.litertlm`);
        const file = await fileHandle.getFile();
        has = file.size > 0;
      } catch {}
      reply({ type: 'result', data: has });
    } else if (type === 'capabilityInfo') {
      const webgpu = !!self.navigator.gpu;
      let shaderF16 = false;
      if (webgpu) {
        try {
          const adapter = await navigator.gpu.requestAdapter();
          shaderF16 = !!adapter?.features?.has('shader-f16');
        } catch {}
      }
      reply({ type: 'result', data: { webgpu, shaderF16 } });
    } else if (type === 'generate') {
      if (!engine) throw new Error('LiteRT-LM engine not loaded');
      const { messages, opts, streaming } = e.data;
      const onToken = streaming ? (fullText) => reply({ type: 'token', text: fullText }) : null;
      const text = await generateText(messages, opts || {}, onToken);
      reply({ type: 'result', data: { text } });
    } else if (type === 'clearConversations') {
      clearConversations(e.data.agentId ?? null);
      reply({ type: 'result', data: {} });
    } else if (type === 'currentModel') {
      reply({ type: 'result', data: currentModel });
    } else if (type === 'isLoaded') {
      reply({ type: 'result', data: engine !== null });
    } else {
      throw new Error('Unknown message type: ' + type);
    }
  } catch (err) {
    reply({ type: 'error', message: err?.message || String(err) });
  }
};
