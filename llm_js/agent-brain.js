import { loadModel, getCapabilityInfo } from './model-loader.js';
import { generate } from './gpt-runner.js';
import { getBuiltInResponseFormat, getGrammarInstruction, buildDynamicGrammar } from './grammar.js';

const FIXED_MODEL_KEY = 'qwen3.5-0.8b';

function oneLine(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

function firstCommandLine(text) {
  return String(text || '')
    .split('\n')
    .map(x => x.trim())
    .filter(Boolean)[0] || '';
}

export function createAgentBrainManager(config = {}) {
  let engine = null;
  let loaded = false;
  const onStatus = config.onStatus || (() => {});
  const onDebug = config.onDebug || (() => {});

  async function load() {
    if (loaded && engine) return engine;
    onStatus('checking WebGPU...');
    const cap = await getCapabilityInfo();
    if (!cap.webgpu) throw new Error('WebGPU unavailable; use Chrome/Edge with WebGPU enabled.');
    engine = await loadModel(FIXED_MODEL_KEY, msg => onStatus(msg));
    loaded = true;
    onStatus('Qwen3.5-0.8B ready');
    return engine;
  }

  async function decide(agent) {
    if (!engine) await load();
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
    console.log('---------------------------------- messages fed to LLM ------------------------------')
    console.log(agent.messages)
    const text = await generate(engine, '', {
      maxTokens: agent.maxTokens || 48,
      temperature: agent.temperature ?? 0,
      frequencyPenalty: agent.frequencyPenalty ?? 0.15,
      responseFormat,
      constraintInstruction,
      messages: agent.messages || [],
      enableThinking: false,
      debugLog: (msg, data) => onDebug(msg, data),
    });
    const line = firstCommandLine(text);
    onDebug('decision', { agentId: agent.agentId, text, line });
    return line;
  }

  return { modelKey: FIXED_MODEL_KEY, load, decide, isLoaded: () => loaded };
}
