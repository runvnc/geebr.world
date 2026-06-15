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

function syncSelectedBrainUI(world) {
  const g = world.getSelectedAgent?.();
  if (!g) return;
  const cfg = world.getBrainConfig(g.id);
  if (el('brainEnabled')) el('brainEnabled').checked = cfg.enabled !== false;
  if (el('brainStyle')) el('brainStyle').value = cfg.style || 'fireball goblin';
  if (el('agentPersonality')) el('agentPersonality').value = cfg.personality || '';
  if (el('fireballTemptation')) el('fireballTemptation').value = cfg.fireballTemptation ?? g.traits?.fireball ?? 50;
  if (el('chaosLevel')) el('chaosLevel').value = cfg.chaos ?? 55;
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
  });
}

async function main() {
  const world = await waitForWorld();
  const manager = createAgentBrainManager({
    onStatus: setStatus,
    onDebug: () => {},
  });
  let running = false;

  world.onAgentSelected = () => syncSelectedBrainUI(world);
  syncSelectedBrainUI(world);

  for (const id of ['brainEnabled', 'brainStyle', 'agentPersonality', 'fireballTemptation', 'chaosLevel']) {
    const node = el(id);
    if (node) node.addEventListener('change', () => saveSelectedBrainUI(world));
    if (node && node.type === 'range') node.addEventListener('input', () => saveSelectedBrainUI(world));
  }

  el('loadBrains')?.addEventListener('click', async () => {
    try {
      el('loadBrains').disabled = true;
      await manager.load();
      el('startBrains').disabled = false;
      appendLog('local Qwen brain loaded');
    } catch (err) {
      el('loadBrains').disabled = false;
      setStatus('brain load error: ' + err.message);
      appendLog('brain load error: ' + err.message);
    }
  });

  el('startBrains')?.addEventListener('click', async () => {
    if (running) return;
    if (!manager.isLoaded()) await manager.load();
    running = true;
    el('startBrains').disabled = true;
    el('stopBrains').disabled = false;
    setStatus('agents thinking round-robin...');
    appendLog('agent brains started');
    while (running) {
      const agents = world.getAgents();
      for (const g of agents) {
        if (!running) break;
        const cfg = world.getBrainConfig(g.id);
        if (cfg.enabled === false) continue;
        if (!world.isTurnReady()) { await sleep(150); continue; }
        try {
          const perception = world.getAgentPerception(g.id, cfg.radius || 5);
          const line = await manager.decide({
            agentId: g.id,
            brainStyle: cfg.style,
            personality: cfg.personality,
            goals: cfg.goals,
            recent: cfg.recent,
            perception,
            temperature: cfg.chaos > 70 ? 0.35 : 0,
          });
          const cmd = world.parseLLMCommandLine(line) || { kind: 'look' };
          cfg.recent = (cfg.recent || []).concat(`chose ${line || 'nothing'}`).slice(-6);
          world.setBrainConfig(g.id, cfg);
          appendLog(`${g.id} brain -> ${line || 'look()'}`);
          await world.stepAgentTurn(g.id, cmd, 'llm');
          await sleep(250);
        } catch (err) {
          appendLog(`${g.id} brain error: ${err.message}`);
          await sleep(800);
        }
      }
      await sleep(150);
    }
  });

  el('stopBrains')?.addEventListener('click', () => {
    running = false;
    el('startBrains').disabled = !manager.isLoaded();
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
