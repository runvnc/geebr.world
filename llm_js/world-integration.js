import { createAgentBrainManager } from './agent-brain.js';

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function waitForWorld() {
  for (let i = 0; i < 300; i++) {
    if (window.geebrWorld?.ready) return window.geebrWorld;
    await sleep(100);
  }
  throw new Error('geebrWorld API did not appear');
}

function el(id) { return document.getElementById(id); }

function setStatus(text) {
  const node = el('brainStatus');
  if (node) node.textContent = text;
}

function appendLog(text) {
  window.geebrWorld?.log?.(text);
}

function showPrompt(agentId, prompt, systemMessage) {
  const out = document.getElementById('promptOut');
  if (!out) return;
  out.textContent = `[AGENT: ${agentId}]\n\n[SYSTEM]\n${systemMessage}\n\n[USER]\n${prompt}`;
}

function syncSelectedBrainUI(world) {
  const g = world.getSelectedAgent?.();
  if (!g) return;
  const cfg = world.getBrainConfig(g.id);
  if (el('brainEnabled')) el('brainEnabled').checked = cfg.enabled !== false;
  if (el('brainStyle')) el('brainStyle').value = cfg.style || 'fireball goblin';
  if (el('agentPersonality')) el('agentPersonality').value = cfg.personality || '';
  if (el('fireballTemptation')) el('fireballTemptation').value = cfg.fireballTemptation ?? g.traits?.fireball ?? 50;
  if (el('chaosLevel')) el('chaosLevel').value = cfg.chaos ?? 55;
  if (el('agentQuest')) el('agentQuest').value = cfg.quest || '';
  if (el('agentGoal')) el('agentGoal').value = cfg.goal || '';
}

function saveSelectedBrainUI(world) {
  const g = world.getSelectedAgent?.();
  if (!g) return;
  world.setBrainConfig(g.id, {
    enabled: el('brainEnabled')?.checked !== false,
    style: el('brainStyle')?.value || 'helpful idiot',
    personality: el('agentPersonality')?.value || 'goofy, curious, imperfect',
    fireballTemptation: Number(el('fireballTemptation')?.value || 50),
    chaos: Number(el('chaosLevel')?.value || 50),
    quest: el('agentQuest')?.value || '',
  });
}

async function main() {
  const world = await waitForWorld();
  const manager = createAgentBrainManager({
    onStatus: setStatus,
    onDebug: () => {},
  });
  let running = false;
  let stepIndex = 0;
  // Auto-load the brain on startup
  try {
    setStatus('auto-loading Qwen3.5-0.8B...');
    await manager.load();
    el('startBrains').disabled = false;
    el('stepBrains').disabled = false;
    el('loadBrains').disabled = true;
    world.state.nextAgentId = world.getAgents()[0]?.id || null;
    appendLog('local Qwen brain auto-loaded');
  } catch (err) {
    setStatus('auto-load failed: ' + err.message + ' (click load manually)');
    el('loadBrains').disabled = false;
    appendLog('auto-load failed: ' + err.message);
  }

  world.onAgentSelected = () => syncSelectedBrainUI(world);
  syncSelectedBrainUI(world);

  for (const id of ['brainEnabled', 'brainStyle', 'agentPersonality', 'fireballTemptation', 'chaosLevel', 'agentQuest']) {
    const node = el(id);
    if (node) node.addEventListener('change', () => saveSelectedBrainUI(world));
    if (node && node.type === 'range') node.addEventListener('input', () => saveSelectedBrainUI(world));
  }

  el('loadBrains')?.addEventListener('click', async () => {
    try {
      el('loadBrains').disabled = true;
      await manager.load();
      el('startBrains').disabled = false;
      el('stepBrains').disabled = false;
     world.state.nextAgentId = world.getAgents()[0]?.id || null;
      appendLog('local Qwen brain loaded');
    } catch (err) {
      el('loadBrains').disabled = false;
      setStatus('brain load error: ' + err.message);
      el('stepBrains').disabled = true;
      appendLog('brain load error: ' + err.message);
    }
  });

  async function runOneAgentTurn(g) {
    const cfg = world.getBrainConfig(g.id);
    if (cfg.enabled === false) return false;
    if (!world.isTurnReady()) { return false; }
    try {
      const perception = world.getAgentPerception(g.id, cfg.radius || 5);
      const style = (cfg.style || 'goofy little creature').replace(/\s+/g, ' ').trim();
      const personality = (cfg.personality || 'curious, imperfect, funny, not very smart').replace(/\s+/g, ' ').trim();
      const goals = (cfg.goals || 'explore, interact with nearby things, react believably, and be amusing').replace(/\s+/g, ' ').trim();
      const quest = (cfg.quest || '').replace(/\s+/g, ' ').trim();
      const goal = (cfg.goal || '').replace(/\s+/g, ' ').trim();
      const recent = (world.state?.globalHistory || []).slice(-5).map(x => '- ' + x.replace(/\s+/g, ' ').trim()).join('\n') || '- none';
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
      const displayPrompt = `Character: ${g.id}\nStyle: ${style}\nPersonality: ${personality}\nGoals: ${goals}\n${quest?'Quest: '+quest+'\n':''}${goal?'Current goal: '+goal+'\n':''}Recent events:\n${recent}\n\nCurrent perception:\n${String(perception).slice(0, 2400)}\n\nPick one next action.`;
      showPrompt(g.id, displayPrompt, systemMessage);
      const line = await manager.decide({
        agentId: g.id,
        brainStyle: cfg.style,
        personality: cfg.personality,
        goals: cfg.goals,
        recent: (world.state?.globalHistory || []).slice(-5),
        perception,
        temperature: cfg.chaos > 70 ? 0.8 : (cfg.chaos > 40 ? 0.5 : 0.3),
      });
      const cmd = world.parseLLMCommandLine(line) || { kind: 'look' };
      cfg.recent = (cfg.recent || []).concat(`chose ${line || 'nothing'}`).slice(-6);
      world.setBrainConfig(g.id, cfg);
      appendLog(`${g.id} brain -> ${line || 'look()'}`);
      await world.stepAgentTurn(g.id, cmd, 'llm');
      return true;
    } catch (err) {
      appendLog(`${g.id} brain error: ${err.message}`);
      return false;
    }
  }

  el('startBrains')?.addEventListener('click', async () => {
    if (running) return;
    if (!manager.isLoaded()) await manager.load();
    running = true;
    el('startBrains').disabled = true;
    el('stepBrains').disabled = true;
    el('stopBrains').disabled = false;
    setStatus('agents thinking round-robin...');
    appendLog('agent brains started');
    while (running) {
      const agents = world.getAgents();
      for (const g of agents) {
        if (!running) break;
        if (!world.isTurnReady()) { await sleep(150); continue; }
       world.state.nextAgentId = g.id;
        await runOneAgentTurn(g);
        await sleep(250);
      }
      await sleep(150);
    }
  });

  el('stepBrains')?.addEventListener('click', async () => {
    if (running) return;
    if (!manager.isLoaded()) await manager.load();
    el('stepBrains').disabled = true;
    setStatus('stepping one agent turn...');
    const agents = world.getAgents();
    const g = agents[stepIndex % agents.length];
    world.state.nextAgentId = g.id;
    await runOneAgentTurn(g);
    stepIndex++;
    const nextG = agents[stepIndex % agents.length];
    world.state.nextAgentId = nextG ? nextG.id : g.id;
    el('stepBrains').disabled = false;
    setStatus(manager.isLoaded() ? 'Qwen3.5-0.8B ready' : 'local brain not loaded');
  });

  el('stopBrains')?.addEventListener('click', () => {
    running = false;
    el('startBrains').disabled = !manager.isLoaded();
    el('stepBrains').disabled = !manager.isLoaded();
    el('stopBrains').disabled = true;
    setStatus(manager.isLoaded() ? 'Qwen3.5-0.8B ready; agents stopped' : 'local brain not loaded');
    appendLog('agent brains stopped');
  });

  el('spawnCharacter')?.addEventListener('click', () => world.spawnCharacter());
  el('spawnCrate')?.addEventListener('click', () => world.spawnProp('crate'));
  el('spawnBarrel')?.addEventListener('click', () => world.spawnProp('barrel'));
  el('spawnWall')?.addEventListener('click', () => world.spawnProp('wall'));
}

main().catch(err => {
  setStatus('integration error: ' + err.message);
  console.error(err);
});
