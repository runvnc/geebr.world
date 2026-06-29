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
    if (node && (node.type === 'range' || node.type === 'text' || node.tagName === 'TEXTAREA')) node.addEventListener('input', () => saveSelectedBrainUI(world));
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
      const chatTestMode = el('chatTestMode')?.checked;
      let messages;
      if (chatTestMode) {
        // Bare conversation mode: minimal system message, only user/assistant messages
        messages = [{ role: 'system', content: 'have a conversation. use the say command' }];
        const hist = cfg.messages || [];
        for (const m of hist) {
          // Only include user and assistant messages, skip SYSTEM RESULT and GEEBR ACTION
          if (m.role === 'assistant' || (m.role === 'user' && !m.content.startsWith('SYSTEM RESULT:') && !m.content.startsWith('GEEBR ') && !m.content.startsWith('SYSTEM:'))) {
            const last = messages[messages.length - 1];
            if (last && last.role === m.role) {
              last.content += '\n' + m.content;
            } else {
              messages.push({ role: m.role, content: m.content });
            }
          }
        }
        // Add a simple prompt if last message is not user
        const lastM = messages[messages.length - 1];
        if (!lastM || lastM.role !== 'user') {
          messages.push({ role: 'user', content: 'respond' });
        }
      } else {
        const { systemMessage, commandReminder } = world.buildAgentPrompt(g, cfg);
        // Build messages array: system + history + current command reminder
        // Merge consecutive same-role messages to help the small model
        messages = [{ role: 'system', content: systemMessage }];
        const hist = cfg.messages || [];
        for (const m of hist) {
          const last = messages[messages.length - 1];
          if (last && last.role === m.role) {
            last.content += '\n' + m.content;
          } else {
            messages.push({ role: m.role, content: m.content });
          }
        }
        // Merge command reminder with last user message if it's also user role
        const lastMsg = messages[messages.length - 1];
        if (lastMsg && lastMsg.role === 'user') {
          lastMsg.content += '\n\n' + commandReminder;
        } else {
          messages.push({ role: 'user', content: commandReminder });
        }
      }
      // Show in prompt panel
      let displayText = `[AGENT: ${g.id}]

`;
      for (const m of messages) displayText += `[${m.role.toUpperCase()}] ${m.content.slice(0,200)}${m.content.length > 200 ? '...' : ''}

`;
      showPrompt(g.id, displayText, messages[0]?.content || '');
      appendLog(g.id + ' sending ' + messages.length + ' messages to LLM (' + (cfg.messages||[]).length + ' history)' + (chatTestMode ? ' [CHAT TEST]' : ''));
      const line = await manager.decide({
        agentId: g.id,
        messages,
        useGrammar: !chatTestMode,
        allowedCommands: world.getAllowedCommands(),
        temperature: cfg.chaos > 70 ? 0.8 : (cfg.chaos > 40 ? 0.5 : 0.3),
      });
      const cmd = world.parseLLMCommandLine(line) || { kind: 'look' };
      // Add agent's action as assistant message
      cfg.messages = (cfg.messages || []).concat([{ role: 'assistant', content: line || 'look()' }]);
      cfg.recent = (cfg.recent || []).concat(`chose ${line || 'nothing'}`).slice(-6);
      world.setBrainConfig(g.id, cfg);
      appendLog(`${g.id} brain -> ${line || 'look()'}`);
      await world.stepAgentTurn(g.id, cmd, 'llm');
      // After turn resolves, add system result as user message
      const resultDesc = world.state?.globalHistory?.slice(-1)?.[0] || 'turn resolved';
      cfg.messages = cfg.messages.concat([{ role: 'user', content: 'SYSTEM RESULT: ' + resultDesc }]);
      // Keep only last 20 messages
      if (cfg.messages.length > 20) cfg.messages = cfg.messages.slice(-20);
      world.setBrainConfig(g.id, cfg);
      // Add this agent's action and result to ALL OTHER agents' message histories
      const actionMsg = `GEEBR ${g.id} ACTION: ${line || 'look()'}`;
      const resultMsg = `SYSTEM RESULT: ${resultDesc}`;
      for (const other of world.getAgents()) {
        if (other.id === g.id) continue;
        const ocfg = world.getBrainConfig(other.id);
        ocfg.messages = (ocfg.messages || []).concat([
          { role: 'user', content: actionMsg },
          { role: 'user', content: resultMsg },
        ]);
        if (ocfg.messages.length > 20) ocfg.messages = ocfg.messages.slice(-20);
        world.setBrainConfig(other.id, ocfg);
      }
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
      }
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

  function sendChatToAgent() {
    const input = el('chatInput');
    const name = el('chatName')?.value || 'God';
    const text = input?.value?.trim();
    if (!text) return;
    const g = world.getSelectedAgent?.();
    if (!g) { appendLog('no agent selected'); return; }
    const cfg = world.getBrainConfig(g.id);
    cfg.messages = (cfg.messages || []).concat([{ role: 'user', content: name + ': ' + text }]);
    if (cfg.messages.length > 20) cfg.messages = cfg.messages.slice(-20);
    world.setBrainConfig(g.id, cfg);
    appendLog(name + ' -> ' + g.id + ': ' + text);
    input.value = '';
    // Auto-step the agent so it responds immediately
    const stepBtn = el('stepBrains');
    if (stepBtn && !stepBtn.disabled) stepBtn.click();
  }
  el('chatSend')?.addEventListener('click', sendChatToAgent);
  el('chatInput')?.addEventListener('keydown', e => { if (e.key === 'Enter') sendChatToAgent(); });
}

main().catch(err => {
  setStatus('integration error: ' + err.message);
  console.error(err);
});
