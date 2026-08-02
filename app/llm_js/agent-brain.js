import { loadModel as loadModelWebLLM, getCapabilityInfo as getCapWebLLM } from './model-loader.js?v=20260802a';
import { generate as generateWebLLM } from './gpt-runner.js?v=20260802a';
import { loadModel as loadModelTJS, getCapabilityInfo as getCapTJS } from './model-loader-tjs-v2.js?v=20260802a';
import { generate as generateTJS, createTJSEngine } from './gpt-runner-tjs.js?v=20260802a';
import { loadModel as loadModelLiteRT, getCapabilityInfo as getCapLiteRT } from './model-loader-litert.js?v=20260802a';
import { generate as generateLiteRT, createLiteRTEngine, clearLiteRTConversations } from './gpt-runner-litert.js?v=20260802a';
import { getBuiltInResponseFormat, getGrammarInstruction, buildDynamicGrammar } from './grammar.js?v=20260802a';

const SUPPORTED_MODELS = {
  'lfm2.5-230m': { label: 'LFM2.5-230M (Transformers.js)', engine: 'transformers.js' },
  'gemma4-e2b-litert': { label: 'Gemma 4 E2B (LiteRT-LM)', engine: 'litert-lm' },
};

// Default model is LFM2.5-230M. Toggle back to Gemma 4 E2B (LiteRT) with
// ?model=gemma4-e2b-litert URL param or localStorage geebr_model flag.
function resolveDefaultModel() {
  try {
    const qs = new URLSearchParams(window.location.search);
    const fromQs = qs.get('model');
    if (fromQs && SUPPORTED_MODELS[fromQs]) return fromQs;
    const stored = localStorage.getItem('geebr_model');
    if (stored && SUPPORTED_MODELS[stored]) return stored;
  } catch {}
  return 'lfm2.5-230m';
}

function persistModelChoice(key) {
  try { localStorage.setItem('geebr_model', key); } catch {}
}

function oneLine(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

function commandLines(text) {
  // Keep every plausible command line (multi-command plans); the downstream
  // parser (parseLLMCommandLine) decides what is actually a command.
  return String(text || '')
    // Strip markdown code fences
    .replace(/```[a-z]*\n?/gi, '\n')
    .replace(/```/g, '\n')
    .split('\n')
    .map(x => x.trim())
    // Filter out empty lines and pure markdown artifacts
    .filter(x => x && x !== '```' && !x.match(/^[`*#]+$/))
    .filter(Boolean)
    .join('\n');
}

export function createAgentBrainManager(config = {}) {
  let engine = null;
  let loaded = false;
  let currentModelKey = config.modelKey || resolveDefaultModel();
  const onStatus = config.onStatus || (() => {});
  const onDebug = config.onDebug || (() => {});

  function getEngineType() {
    return SUPPORTED_MODELS[currentModelKey]?.engine || 'webllm';
  }

  async function load() {
    if (loaded && engine) return engine;
    onStatus('checking WebGPU...');
    console.log('[geebr-brain] load() starting, model:', currentModelKey, 'engine type:', getEngineType());
    const getCap = getEngineType() === 'transformers.js' ? getCapTJS
      : getEngineType() === 'litert-lm' ? getCapLiteRT
      : getCapWebLLM;
    const cap = await getCap();
    if (!cap.webgpu) throw new Error('WebGPU unavailable; use Chrome/Edge with WebGPU enabled.');

    const loadFn = getEngineType() === 'transformers.js' ? loadModelTJS
      : getEngineType() === 'litert-lm' ? loadModelLiteRT
      : loadModelWebLLM;
    console.log('[geebr-brain] calling loadFn...');
    const result = await loadFn(currentModelKey, status => onStatus(status));
    console.log('[geebr-brain] loadFn returned:', typeof result);

    // Wrap the model into a chat-compatible engine
    if (getEngineType() === 'transformers.js' && result.model && result.processor) {
      engine = createTJSEngine(result.model, result.processor);
    } else if (getEngineType() === 'litert-lm') {
      console.log('[geebr-brain] creating LiteRT engine wrapper...');
      engine = createLiteRTEngine(result);
      console.log('[geebr-brain] LiteRT engine wrapper created');
    } else {
      engine = result;
    }

    loaded = true;
    console.log('[geebr-brain] load() complete, loaded=true');
    onStatus(`${SUPPORTED_MODELS[currentModelKey]?.label || currentModelKey} ready`);
    return engine;
  }

  async function decide(agent) {
    if (!engine) await load();
    const onToken = agent.onToken ?? null;
    const useGrammar = agent.useGrammar !== false;
    let responseFormat = null;
    let constraintInstruction = '';
    if (useGrammar) {
      const allowed = agent.allowedCommands || [];
      const allowedSet = new Set(Array.isArray(allowed) ? allowed : []);
      const dyn = buildDynamicGrammar(allowedSet);
      responseFormat = dyn.responseFormat;
      constraintInstruction = dyn.instruction;
    }

    const generateFn = getEngineType() === 'transformers.js' ? generateTJS
      : getEngineType() === 'litert-lm' ? generateLiteRT
      : generateWebLLM;

    console.log('[geebr-brain] SENDING REQUEST TO LLM', {
      agentId: agent.agentId || 'default',
      engineType: getEngineType(),
      messageCount: (agent.messages || []).length,
      messages: agent.messages || [],
      maxTokens: agent.maxTokens || 256,
      temperature: agent.temperature ?? 0,
      enableThinking: agent.enableThinking ?? false,
      useGrammar,
      constraintInstruction,
    });
    let text;
    try {
      text = await generateFn(engine, '', {
        maxTokens: agent.maxTokens || 256, // room for long multi-line plans/poems
        temperature: agent.temperature ?? 0,
        frequencyPenalty: agent.frequencyPenalty ?? 0.15,
        repetitionPenalty: agent.repetitionPenalty ?? 1.05,
        responseFormat,
        constraintInstruction,
        messages: agent.messages || [],
        enableThinking: agent.enableThinking ?? false,
        onToken: onToken,
        debugLog: (msg, data) => onDebug(msg, data),
        agentId: agent.agentId || 'default',
      });
    } catch (err) {
      console.error('[geebr-brain] ERROR AFTER SENDING REQUEST TO LLM:', err);
      console.error('[geebr-brain] STACK TRACE:', err && err.stack);
      throw err;
    }
    console.log('[geebr-brain] RAW LLM OUTPUT:', text);
    const line = commandLines(text);
    onDebug('decision', { agentId: agent.agentId, text, line });
    return line;
  }

  function setModel(modelKey) {
    if (!SUPPORTED_MODELS[modelKey]) return false;
    if (currentModelKey === modelKey && loaded) return true;
    // Unload current engine if switching
    if (loaded && engine) {
      try { engine.unload?.(); } catch {}
      engine = null;
      loaded = false;
    }
    currentModelKey = modelKey;
    persistModelChoice(modelKey);
    return true;
  }

  function getModelKey() {
    return currentModelKey;
  }

  return {
    modelKey: currentModelKey,
    load,
    decide,
    isLoaded: () => loaded,
    setModel,
    getModelKey,
    getSupportedModels: () => Object.entries(SUPPORTED_MODELS).map(([key, cfg]) => ({ key, label: cfg.label })),
    clearConversations: (agentId = null) => clearLiteRTConversations(agentId),
  };
}
