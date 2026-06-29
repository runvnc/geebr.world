import { loadModel, getCapabilityInfo } from './model-loader.js';
import { generate } from './gpt-runner.js';
import { getBuiltInResponseFormat, getGrammarInstruction } from './grammar.js';

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
    const responseFormat = getBuiltInResponseFormat('geebrCommands');
    const constraintInstruction = getGrammarInstruction('geebrCommands');
    const style = oneLine(agent.brainStyle || 'goofy little creature');
    const personality = oneLine(agent.personality || 'curious, imperfect, funny, not very smart');
    const goals = oneLine(agent.goals || 'explore, interact with nearby things, react believably, and be amusing');
    const recent = (agent.recent || []).slice(-4).map(x => '- ' + oneLine(x)).join('\n') || '- none';
    const perception = String(agent.perception || '').slice(0, 2400);
    const systemMessage = [
      'You are a tiny browser-local character brain inside geebr.world.',
      'You are intentionally imperfect, goofy, and limited. Do not be a genius planner.',
      'Choose exactly one command for only your own character. Vary your actions - walk around, touch things, push objects, say something funny, or cast spells.',
      'Do not just look at things every turn. Be active and silly.',
      'Use short funny speech when saying things.',
      'Use goal() to set a short-term reminder goal for yourself. Use give_quest() only if you have the give quest ability to bestow a quest on nearby agents.',
      'Your quest is set by the world and cannot be changed by you. Work toward it.',
      'Do not explain. Do not output anything except the command line.',
    ].join('\n');
    const prompt = `Character: ${agent.agentId}\nStyle: ${style}\nPersonality: ${personality}\nGoals: ${goals}\nRecent events:\n${recent}\n\nCurrent perception:\n${perception}\n\nPick one next action.`;
    onDebug('prompt', { agentId: agent.agentId, prompt });
    const text = await generate(engine, prompt, {
      maxTokens: agent.maxTokens || 48,
      temperature: agent.temperature ?? 0,
      frequencyPenalty: agent.frequencyPenalty ?? 0.2,
      responseFormat,
      constraintInstruction,
      systemMessage,
      enableThinking: false,
      debugLog: (msg, data) => onDebug(msg, data),
    });
    const line = firstCommandLine(text);
    onDebug('decision', { agentId: agent.agentId, text, line });
    return line;
  }

  return { modelKey: FIXED_MODEL_KEY, load, decide, isLoaded: () => loaded };
}
