import { loadModel, isLoaded, getAvailableModels, getCurrentModel, unloadModel, getCapabilityInfo } from './model-loader.js';
import { generate } from './gpt-runner.js';
import { getGrammarKeys, getGrammar, getGrammarLabel, getGrammarInstruction, getBuiltInResponseFormat, parseCustomConstraint } from './grammar.js';

const statusEl = document.getElementById('status');
const inputEl = document.getElementById('input');
const systemMsgEl = document.getElementById('system-msg');
const outputEl = document.getElementById('output');
const generateBtn = document.getElementById('generate');
const modelSelect = document.getElementById('model-select');
const grammarSelect = document.getElementById('grammar-select');
const customConstraintEl = document.getElementById('custom-constraint');
const tempSlider = document.getElementById('temp');
const tempVal = document.getElementById('temp-val');
const freqPenaltySlider = document.getElementById('freq-penalty');
const freqPenaltyVal = document.getElementById('freq-penalty-val');
const greedyCheck = document.getElementById('greedy');
const maxTokensInput = document.getElementById('max-tokens');
const enableThinkingCheck = document.getElementById('enable-thinking');
const debugGrammarCheck = document.getElementById('debug-grammar');
const dryRunCheck = document.getElementById('dry-run');
const debugOutputEl = document.getElementById('debug-output');

let engine = null;
let fullOutput = '';


function debugLog(message, data = null) {
  if (!debugGrammarCheck?.checked) return;
  debugOutputEl.hidden = false;
  const time = new Date().toLocaleTimeString();
  const suffix = data == null ? '' : `
${typeof data === 'string' ? data : JSON.stringify(data, null, 2)}`;
  debugOutputEl.textContent += `[${time}] ${message}${suffix}
`;
  console.log('[geebr debug]', message, data ?? '');
}

// populate model selector
const models = getAvailableModels();
models.forEach(m => {
  const opt = document.createElement('option');
  opt.value = m.key;
  opt.textContent = m.label;
  modelSelect.appendChild(opt);
});
modelSelect.value = 'qwen3-0.6b';

// populate grammar selector
const grammarKeys = getGrammarKeys();
grammarKeys.forEach(k => {
  const opt = document.createElement('option');
  opt.value = k;
  opt.textContent = getGrammarLabel(k);
  grammarSelect.appendChild(opt);
});

// temp slider
function updateTempDisplay() {
  tempVal.textContent = tempSlider.value;
}
tempSlider.addEventListener('input', updateTempDisplay);
updateTempDisplay();

// freq penalty slider
function updateFreqPenaltyDisplay() {
  freqPenaltyVal.textContent = freqPenaltySlider.value;
}
freqPenaltySlider.addEventListener('input', updateFreqPenaltyDisplay);
updateFreqPenaltyDisplay();

// greedy toggles temp slider
greedyCheck.addEventListener('change', () => {
  tempSlider.disabled = greedyCheck.checked;
});

async function initModel() {
  const modelKey = modelSelect.value;
  statusEl.textContent = 'Detecting GPU capabilities...';
  generateBtn.disabled = true;
  
  // Show GPU info
  try {
    const cap = await getCapabilityInfo();
    if (!cap.webgpu) {
      statusEl.textContent = 'WebGPU not available. Use Chrome/Edge.';
      return;
    }
    console.log('WebGPU shader-f16:', cap.shaderF16 ? 'AVAILABLE' : 'NOT AVAILABLE (using f32 fallback)');
  } catch(e) {}
  
  statusEl.textContent = 'Loading...';
  try {
    engine = await loadModel(modelKey, (msg) => {
      statusEl.textContent = msg;
    });
    generateBtn.disabled = false;
  } catch (e) {
    statusEl.textContent = `Error: ${e.message}`;
  }
}

modelSelect.addEventListener('change', async () => {
  unloadModel();
  engine = null;
  outputEl.textContent = '';
  await initModel();
});

initModel();

generateBtn.addEventListener('click', async () => {
  const prompt = inputEl.value.trim();
  if (!prompt || !engine) return;

  generateBtn.disabled = true;
  statusEl.textContent = 'Generating...';
  outputEl.textContent = '';
  fullOutput = '';
  debugOutputEl.textContent = '';
  debugOutputEl.hidden = !debugGrammarCheck.checked;

  const isGreedy = greedyCheck.checked;
  const grammarKey = grammarSelect.value;
  let grammarStr = getGrammar(grammarKey);
  let responseFormat = getBuiltInResponseFormat(grammarKey);
  let constraintInstruction = getGrammarInstruction(grammarKey);

  try {
    const customConstraint = parseCustomConstraint(customConstraintEl.value);
    if (customConstraint.responseFormat) {
      grammarStr = '';
      responseFormat = customConstraint.responseFormat;
      constraintInstruction = customConstraint.instruction;
    }
  } catch (e) {
    outputEl.textContent = `Constraint error: ${e.message}`;
    generateBtn.disabled = false;
    statusEl.textContent = 'Ready';
    return;
  }

  const opts = {
    maxTokens: parseInt(maxTokensInput.value) || 100,
    temperature: isGreedy ? 0 : parseFloat(tempSlider.value),
    topK: isGreedy ? 1 : 40,
    grammar: grammarStr,
    responseFormat,
    constraintInstruction,
    systemMessage: systemMsgEl.value,
    enableThinking: enableThinkingCheck.checked,
    frequencyPenalty: parseFloat(freqPenaltySlider.value),
    debugLog,
    dryRun: dryRunCheck.checked,
    onToken: (text, replace = false) => {
      fullOutput = replace ? text : fullOutput + text;
      outputEl.textContent = fullOutput;
    },
  };

  try {
    const finalText = await generate(engine, prompt, opts);
    debugLog('generation returned', { finalLength: finalText.length });
    if (dryRunCheck.checked) {
      outputEl.textContent = 'Dry-run complete — generation skipped.';
    } else {
      outputEl.textContent = fullOutput;
    }
  } catch (e) {
    outputEl.textContent = `Error: ${e.message}`;
  } finally {
    generateBtn.disabled = false;
    statusEl.textContent = 'Ready';
  }
});
