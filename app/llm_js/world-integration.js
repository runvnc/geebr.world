import { createAgentBrainManager } from './agent-brain.js';
import { clearModelCache, hasModelCached } from './model-loader-litert.js';

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function waitForWorld() {
  for (let i = 0; i < 300; i++) {
    if (window.geebrWorld?.ready) return window.geebrWorld;
    await sleep(100);
  }
  throw new Error('geebrWorld API did not appear');
}

function el(id) { return document.getElementById(id); }

let modelNoticeDismissTimer = null;

function normalizeProgress(status) {
  if (status && typeof status === 'object') {
    const percent = Number.isFinite(Number(status.percent))
      ? Math.max(0, Math.min(100, Number(status.percent)))
      : null;
    return { text: String(status.text || ''), percent, phase: status.phase || '' };
  }
  const text = String(status || '');
  const source = text;
  const match = source.match(/(?:caching model|download(?:ing)?[^:]*|model)[^%]*?([0-9]{1,3}(?:\.[0-9]+)?)\s*%/i)
    || source.match(/([0-9]{1,3}(?:\.[0-9]+)?)\s*%/);
  return {
    text,
    percent: match ? Math.max(0, Math.min(100, Number(match[1]))) : null,
    phase: /download|caching/i.test(text) ? 'download' : '',
  };
}

function updateModelNotice(status, state = 'loading') {
  const notice = el('modelLoadNotice');
  if (!notice) return;
  const progress = normalizeProgress(status);
  const text = progress.text;
  clearTimeout(modelNoticeDismissTimer);
  notice.classList.remove('hidden', 'ready', 'error', 'determinate', 'consent', 'declined');
  if (state !== 'loading') notice.classList.add(state);
  if (progress.percent !== null && state === 'loading') notice.classList.add('determinate');

  const title = el('modelLoadTitle');
  const detail = el('modelLoadText');
  const bar = el('modelProgressBar');
  const consent = el('modelConsent');
  if (consent) consent.hidden = true;
  if (title) title.textContent = state === 'ready' ? 'Local brain ready'
    : state === 'error' ? 'Local brain could not load'
    : progress.phase === 'download' || /download|caching/i.test(text) ? 'Downloading local brain'
    : 'Preparing local brain';
  if (detail) detail.textContent = text;

  if (bar) {
    bar.style.width = progress.percent === null ? '18%' : `${progress.percent}%`;
    bar.style.animation = progress.percent === null && state === 'loading' ? '' : 'none';
    bar.parentElement?.setAttribute('aria-valuenow', progress.percent === null ? '' : String(Math.round(progress.percent)));
  }
  if (state === 'ready') {
    modelNoticeDismissTimer = setTimeout(() => notice.classList.add('hidden'), 3500);
  }
}

function setStatus(status, noticeState = null) {
  const progress = normalizeProgress(status);
  const text = progress.text;
  const node = el('brainStatus');
  if (node) node.textContent = text;
  if (noticeState) updateModelNotice(status, noticeState);
  else if (/ready/i.test(text)) updateModelNotice(status, 'ready');
  else if (/fail|error|unavailable/i.test(text)) updateModelNotice(status, 'error');
  else if (progress.phase || /load|download|cache|initializ|prepar|checking/i.test(text)) updateModelNotice(status, 'loading');
}

function showDownloadConsent(modelLabel) {
  const notice = el('modelLoadNotice');
  const consent = el('modelConsent');
  if (!notice || !consent) return;
  clearTimeout(modelNoticeDismissTimer);
  notice.classList.remove('hidden', 'ready', 'error', 'determinate', 'declined');
  notice.classList.add('consent');
  consent.hidden = false;
  if (el('modelLoadTitle')) el('modelLoadTitle').textContent = 'Optional local AI';
  if (el('modelLoadText')) el('modelLoadText').textContent = `${modelLabel} is not downloaded yet.`;
  if (el('brainStatus')) el('brainStatus').textContent = 'waiting for model download permission';
}

function showDownloadDeclined() {
  const notice = el('modelLoadNotice');
  if (!notice) return;
  notice.classList.remove('consent', 'ready', 'error', 'determinate');
  notice.classList.add('declined');
  if (el('modelConsent')) el('modelConsent').hidden = true;
  if (el('modelLoadTitle')) el('modelLoadTitle').textContent = 'Model download skipped';
  if (el('modelLoadText')) el('modelLoadText').textContent = 'The world still works. Open Agent brains and click load whenever you want.';
  if (el('brainStatus')) el('brainStatus').textContent = 'local brain not loaded';
}

function waitForDownloadConsent(modelLabel) {
  showDownloadConsent(modelLabel);
  return new Promise(resolve => {
    el('approveModelDownload')?.addEventListener('click', () => resolve(true), { once: true });
    el('declineModelDownload')?.addEventListener('click', () => resolve(false), { once: true });
  });
}

function appendLog(text) {
  window.geebrWorld?.log?.(text);
}

// Transform a globalHistory entry like 'T3 geebr1: geebr1 walk n' into 'geebr1 walks n'
// Also handles say entries like 'T3 geebr1: geebr1 say "hello" -> hello' into 'geebr1 says hello'
function formatActionSummary(historyEntry) {
  if (!historyEntry) return 'turn resolved';
  // Strip the T# prefix: 'T3 geebr1: geebr1 walk n' -> 'geebr1: geebr1 walk n'
  let s = String(historyEntry).replace(/^T\d+\s+/, '');
  // Split into agent and action parts: 'geebr1: geebr1 walk n' -> agent='geebr1', action='geebr1 walk n'
  const colonIdx = s.indexOf(':');
  let agentId, action;
  if (colonIdx >= 0) {
    agentId = s.slice(0, colonIdx).trim();
    action = s.slice(colonIdx + 1).trim();
  } else {
    agentId = '';
    action = s;
  }
  // Remove redundant agent name from action if present: 'geebr1 walk n' -> 'walk n'
  if (agentId && action.startsWith(agentId + ' ')) action = action.slice(agentId.length + 1);
  // Also strip the raw command form like 'geebr1 walk(n)' -> 'walk(n)'
  if (agentId && action.startsWith(agentId)) action = action.slice(agentId.length).trim();
  // Conjugate common verbs: walk->walks, say->says, look->looks, etc.
  const verbMap = { walk: 'walks', say: 'says', look: 'looks', touch: 'touches', push: 'pushes', pull: 'pulls', carry: 'carries', drop: 'drops', throw: 'throws', dig: 'digs', build: 'builds', repair: 'repairs', panic: 'panics', spell: 'casts', goal: 'sets goal', give_quest: 'gives quest' };
  const parts = action.split(/\s+/);
  if (parts.length > 0 && verbMap[parts[0]]) parts[0] = verbMap[parts[0]];
  action = parts.join(' ');
  // Clean up say text: 'says "hello" -> hello' -> 'says hello'
  action = action.replace(/"([^"]*)"\s*->\s*.*/, '$1');
  action = action.replace(/"([^"]*)"/, '$1');
  return agentId ? `${agentId} ${action}` : action;
}

function setCacheStatus(text) {
  const node = el('cacheStatus');
  if (node) node.textContent = text;
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
  if (el('agentTtsEnabled')) el('agentTtsEnabled').checked = cfg.ttsEnabled !== false;
  if (el('agentTtsVoice')) el('agentTtsVoice').value = cfg.ttsVoiceId || 'builtin:alba';
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
    ttsEnabled: el('agentTtsEnabled')?.checked !== false,
    ttsVoiceId: el('agentTtsVoice')?.value || 'builtin:alba',
  });
}

async function main() {
  const world = await waitForWorld();
  el('dismissModelLoad')?.addEventListener('click', () => {
    el('modelLoadNotice')?.classList.add('hidden');
  });
  const manager = createAgentBrainManager({
    onStatus: setStatus,
    onDebug: () => {},
  });
  let running = false;
  let stepIndex = 0;
  window.addEventListener('geebr:clear-conversations', event => manager.clearConversations(event.detail?.agentId ?? null));
  // Auto-load the brain on startup
  // Populate model selector
  const modelSelect = el('modelSelect');
  if (modelSelect) {
    for (const m of manager.getSupportedModels()) {
      const opt = document.createElement('option');
      opt.value = m.key;
      opt.textContent = m.label;
      modelSelect.appendChild(opt);
    }
    modelSelect.value = manager.getModelKey();
    modelSelect.addEventListener('change', async () => {
      const newKey = modelSelect.value;
      appendLog('switching model to ' + newKey);
      // Stop agents if running
      if (running) {
        running = false;
        el('stopBrains').disabled = true;
      }
      manager.setModel(newKey);
      // Update load button text
      const loadBtn = el('loadBrains');
      if (loadBtn) loadBtn.textContent = 'load ' + (manager.getSupportedModels().find(m => m.key === newKey)?.label || newKey);
      // Disable controls until loaded
      el('startBrains').disabled = true;
      el('stepBrains').disabled = true;
      el('stopBrains').disabled = true;
      el('loadBrains').disabled = false;
      setStatus('model switched to ' + newKey + ' - click load');
    });
  }
  // Initialize cache backend selector
  const backendSelect = el('cacheBackend');
  if (backendSelect) {
    backendSelect.value = 'opfs';
    backendSelect.disabled = true;
  }
  el('clearCache')?.addEventListener('click', async () => {
    setCacheStatus('clearing...');
    try {
      await clearModelCache();
      setCacheStatus('cache cleared');
      appendLog('model cache cleared');
      el('loadBrains').disabled = false;
    } catch (e) {
      setCacheStatus('clear failed: ' + e.message);
      appendLog('cache clear error: ' + e.message);
    }
  });
  // Check if model is already cached
  let cached = false;
  try {
    cached = await hasModelCached(manager.getModelKey());
    setCacheStatus(cached ? 'model cached' : 'not cached');
  } catch {}

  const modelLabel = manager.getSupportedModels().find(m => m.key === manager.getModelKey())?.label || manager.getModelKey();
  const loadBtn = el('loadBrains');
  if (loadBtn) loadBtn.textContent = 'load ' + modelLabel;
  let shouldLoad = cached;
  if (!cached) {
    shouldLoad = await waitForDownloadConsent(modelLabel);
    if (!shouldLoad) {
      showDownloadDeclined();
      appendLog('local model download skipped');
    }
  }

  if (shouldLoad) try {
    setStatus('auto-loading ' + modelLabel + '...');
    console.log(cached ? '[geebr] loading cached model...' : '[geebr] starting approved download...');
    await manager.load();
    console.log('[geebr] auto-load completed, enabling buttons...');
    el('startBrains').disabled = false;
    el('stepBrains').disabled = false;
    el('loadBrains').disabled = true;
    world.state.nextAgentId = world.getAgents()[0]?.id || null;
    appendLog('local brain auto-loaded: ' + modelLabel);
    setStatus(modelLabel + ' ready', 'ready');
  } catch (err) {
    console.error('[geebr] auto-load FAILED:', err);
    setStatus('Auto-load failed: ' + err.message + ' Open Agent brains to retry.', 'error');
    el('loadBrains').disabled = false;
    appendLog('auto-load failed: ' + err.message);
  }

  world.onAgentSelected = () => syncSelectedBrainUI(world);
  syncSelectedBrainUI(world);

  for (const id of ['brainEnabled', 'brainStyle', 'agentPersonality', 'fireballTemptation', 'chaosLevel', 'agentQuest', 'agentTtsEnabled', 'agentTtsVoice']) {
    const node = el(id);
    if (node) node.addEventListener('change', () => saveSelectedBrainUI(world));
    if (node && (node.type === 'range' || node.type === 'text' || node.tagName === 'TEXTAREA')) node.addEventListener('input', () => saveSelectedBrainUI(world));
  }

  el('loadBrains')?.addEventListener('click', async () => {
    try {
      const cachedNow = await hasModelCached(manager.getModelKey()).catch(() => false);
      if (!cachedNow) {
        const approved = await waitForDownloadConsent(manager.getSupportedModels().find(m => m.key === manager.getModelKey())?.label || manager.getModelKey());
        if (!approved) { showDownloadDeclined(); return; }
      }
      el('loadBrains').disabled = true;
      console.log('[geebr] manual load starting...');
      setStatus(cachedNow ? 'loading cached local brain...' : 'starting approved model download...');
      await manager.load();
      console.log('[geebr] manual load completed, enabling buttons...');
      el('startBrains').disabled = false;
      el('stepBrains').disabled = false;
     world.state.nextAgentId = world.getAgents()[0]?.id || null;
      const lbl = manager.getSupportedModels().find(m => m.key === manager.getModelKey())?.label || manager.getModelKey();
      appendLog('local brain loaded: ' + lbl);
      setStatus(lbl + ' ready', 'ready');
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
      world.state.nextAgentId = g.id;
      updatePerceptionUI();
      const chatTestMode = el('chatTestMode')?.checked;
      let messages;
     let chatSuffix = '';
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
         if (cfg.pendingChat && cfg.pendingChat.length > 0) {
          chatSuffix = '\n\nNEW SPEECH ADDRESSED TO YOU:\n' + cfg.pendingChat.join('\n') + '\nRespond to its meaning; do not repeat or quote the message.';
          cfg.pendingChat = [];
          world.setBrainConfig(g.id, cfg);
        }
        if (lastMsg && lastMsg.role === 'user') {
          lastMsg.content += '\n\n' + commandReminder + chatSuffix;
        } else {
          messages.push({ role: 'user', content: commandReminder + chatSuffix });
        }
      }
      // Show in prompt panel
      let displayText = `[AGENT: ${g.id}]

`;
      for (const m of messages) displayText += `[${m.role.toUpperCase()}] ${m.content}

`;
      showPrompt(g.id, displayText, messages[0]?.content || '');
      // Save base text for streaming overlay
      const promptOut = document.getElementById('promptOut');
      if (promptOut) promptOut.dataset.baseText = displayText;
      appendLog(g.id + ' sending ' + messages.length + ' messages to LLM (' + (cfg.messages||[]).length + ' history)' + (chatTestMode ? ' [CHAT TEST]' : ''));
      const line = await manager.decide({
        agentId: g.id,
        messages,
        useGrammar: !chatTestMode,
        allowedCommands: world.getAllowedCommands(),
        enableThinking: !!el('enableThinking')?.checked,
        temperature: cfg.chaos > 70 ? 0.8 : (cfg.chaos > 40 ? 0.5 : 0.3),
      });
      const planLines = (typeof window.splitPlanLines==='function' ? window.splitPlanLines(line) : String(line || '').split('\n').map(l => l.trim()).filter(Boolean));
      const planCmds = planLines.map(l => world.parseLLMCommandLine(l)).filter(Boolean);
      // Bare continuation lines (e.g. poem lines without say()) right after a say are treated as more speech.
      for (let i = 0; i < planCmds.length; i++) {
        if (planCmds[i].kind === 'unknown' && planCmds[i].raw && planCmds[i-1]?.kind === 'say') planCmds[i] = { kind: 'say', text: planCmds[i].raw };
      }
      if (!planCmds.length) planCmds.push({ kind: 'look' });
      // Persist chat messages to history so they're remembered in future turns
      if (chatSuffix) {
        const chatLines = chatSuffix.trim().split('\n').filter(l => l.trim() && !l.startsWith('NEW SPEECH') && !l.startsWith('Respond to its meaning'));
        for (const cl of chatLines) {
          cfg.messages = (cfg.messages || []).concat([{ role: 'user', content: cl }]);
        }
      }
      // A new human utterance should not be drowned by old action chatter.
      // Keep it as the latest conversational event after generation as well.
      if(chatSuffix && cfg.messages?.length>30) cfg.messages=cfg.messages.slice(-30);
      // Add agent's action as assistant message
      cfg.messages = (cfg.messages || []).concat([{ role: 'assistant', content: line || 'look()' }]);
      cfg.recent = (cfg.recent || []).concat(`chose ${line || 'nothing'}`).slice(-6);
      world.setBrainConfig(g.id, cfg);
      appendLog(`${g.id} brain -> ${line || 'look()'}`);
      for (const planCmd of planCmds) await world.stepAgentTurn(g.id, planCmd, 'llm');
      // After turn resolves, add system result as user message
      const resultDesc = world.state?.globalHistory?.slice(-1)?.[0] || 'turn resolved';
      const summary = formatActionSummary(resultDesc);
      cfg.messages = cfg.messages.concat([{ role: 'user', content: summary }]);
      // Retain enough ordinary conversation for multi-turn instructions to remain salient.
      if (cfg.messages.length > 40) cfg.messages = cfg.messages.slice(-40);
      world.setBrainConfig(g.id, cfg);
      // Add this agent's action and result to ALL OTHER agents' message histories
      const actionMsg = `${g.id} ${formatActionSummary(g.id + ' ' + (line || 'look()'))}`;
      const resultMsg = summary;
      for (const other of world.getAgents()) {
        if (other.id === g.id) continue;
        const ocfg = world.getBrainConfig(other.id);
        ocfg.messages = (ocfg.messages || []).concat([
          { role: 'user', content: actionMsg },
          { role: 'user', content: resultMsg },
        ]);
        if (ocfg.messages.length > 40) ocfg.messages = ocfg.messages.slice(-40);
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
    const brainNode = el('brainStatus');
    if (brainNode) brainNode.textContent = manager.isLoaded() ? (manager.getSupportedModels().find(m => m.key === manager.getModelKey())?.label || 'model') + ' ready' : 'local brain not loaded';
  });

  el('stopBrains')?.addEventListener('click', () => {
    running = false;
    el('startBrains').disabled = !manager.isLoaded();
    el('stepBrains').disabled = !manager.isLoaded();
    el('stopBrains').disabled = true;
    const brainNode2 = el('brainStatus');
    if (brainNode2) brainNode2.textContent = manager.isLoaded() ? (manager.getSupportedModels().find(m => m.key === manager.getModelKey())?.label || 'model') + ' ready; agents stopped' : 'local brain not loaded';
    appendLog('agent brains stopped');
  });

  el('spawnCharacter')?.addEventListener('click', () => world.spawnCharacter());
  el('spawnCrate')?.addEventListener('click', () => world.spawnProp('crate'));
  el('spawnBarrel')?.addEventListener('click', () => world.spawnProp('barrel'));
  el('spawnWall')?.addEventListener('click', () => world.spawnProp('wall'));
  el('spawnMushroom')?.addEventListener('click', () => world.spawnProp('mushroom'));
  el('spawnLamp')?.addEventListener('click', () => world.spawnProp('lamp'));

  function sendChatToAgent() {
    const input = el('chatInput');
    const name = el('chatName')?.value || 'God';
    const text = input?.value?.trim();
    if (!text) return;
    const g = world.getSelectedAgent?.();
    if (!g) { appendLog('no agent selected'); return; }
    const cfg = world.getBrainConfig(g.id);
    // Store chat separately so it can be appended at the end of the next prompt (after perception)
    cfg.pendingChat = (cfg.pendingChat || []).concat([`${name} says: ${text}`]);
    if (cfg.pendingChat.length > 5) cfg.pendingChat = cfg.pendingChat.slice(-5);
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
