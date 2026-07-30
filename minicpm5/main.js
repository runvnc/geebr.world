// MiniCPM5-1B browser demo.
// Two backends behind a common interface:
//   - engine-tjs.js    GPU via WebGPU (transformers.js + ONNX q4)
//   - engine-wllama.js CPU via WASM   (wllama / llama.cpp + GGUF)
import * as tjs from "./engine-tjs.js";
import * as wllama from "./engine-wllama.js";

const ENGINES = { tjs, wllama };

const $ = (id) => document.getElementById(id);
const els = {
  status: $("modelStatus"), loadBtn: $("loadBtn"), engineBadge: $("engineBadge"),
  progressWrap: $("progressWrap"), progressBar: $("progressBar"), progressText: $("progressText"),
  chat: $("chatArea"), input: $("userInput"), send: $("sendBtn"), stop: $("stopBtn"),
  think: $("thinkToggle"), settingsBtn: $("settingsBtn"), settingsPanel: $("settingsPanel"),
  engine: $("engineSelect"), quant: $("quantSelect"), quantRow: $("quantRow"),
  ctx: $("ctxSize"), ctxVal: $("ctxVal"),
  temp: $("tempSlider"), tempVal: $("tempVal"),
  maxTok: $("maxTokens"), maxTokVal: $("maxTokVal"),
  sysPrompt: $("sysPrompt"), stats: $("statsLine"),
};

let engine = null;        // active engine module
let modelLoaded = false;
let generating = false;
let abortRequested = false;
const history = []; // {role, content}

function setStatus(text, cls = "status-idle") {
  els.status.textContent = text;
  els.status.className = cls;
}
function setBadge(text) {
  els.engineBadge.textContent = text || "";
  els.engineBadge.classList.toggle("hidden", !text);
}
function setProgress(pct, text) {
  els.progressWrap.classList.remove("hidden");
  els.progressBar.style.setProperty("--pct", `${(pct * 100).toFixed(1)}%`);
  els.progressText.textContent = text;
}
function hideProgress() { els.progressWrap.classList.add("hidden"); }

function fmtBytes(n) {
  if (n > 1e9) return (n / 1e9).toFixed(2) + " GB";
  if (n > 1e6) return (n / 1e6).toFixed(1) + " MB";
  return (n / 1e3).toFixed(0) + " KB";
}

function pickEngine() {
  const sel = els.engine.value;
  if (sel === "tjs") return tjs;
  if (sel === "wllama") return wllama;
  // auto: prefer GPU when WebGPU exists
  return navigator.gpu ? tjs : wllama;
}

async function loadModel() {
  engine = pickEngine();
  els.loadBtn.disabled = true;
  setStatus(`Loading via ${engine.label} ...`);
  try {
    await engine.load({
      quant: els.quant.value,
      nCtx: parseInt(els.ctx.value, 10),
      onProgress: ({ loaded, total, text }) => {
        const pct = total ? loaded / total : 0;
        const sz = total ? ` ${fmtBytes(loaded)} / ${fmtBytes(total)}` : "";
        setProgress(pct, `${text || "Loading"}${sz}`);
      },
    });
    modelLoaded = true;
    setProgress(1, "Model ready.");
    setTimeout(hideProgress, 1500);
    setStatus("Ready: MiniCPM5-1B", "status-ok");
    setBadge(engine.describe());
    els.input.disabled = false;
    els.send.disabled = false;
    els.loadBtn.textContent = "Unload model";
    els.loadBtn.classList.add("unload");
    els.input.focus();
  } catch (e) {
    console.error(e);
    setStatus("Load failed: " + (e.message || e), "status-err");
    setBadge(null);
    try { await engine?.unload(); } catch {}
    engine = null;
    modelLoaded = false;
  } finally {
    els.loadBtn.disabled = false;
  }
}

async function unloadModel() {
  if (generating) requestAbort();
  try { await engine?.unload(); } catch {}
  engine = null;
  modelLoaded = false;
  history.length = 0;
  setStatus("Model not loaded");
  setBadge(null);
  els.input.disabled = true;
  els.send.disabled = true;
  els.loadBtn.textContent = "Load model";
  els.loadBtn.classList.remove("unload");
}

function addMsg(role, content) {
  const div = document.createElement("div");
  div.className = `msg ${role}`;
  const roleEl = document.createElement("div");
  roleEl.className = "role";
  roleEl.textContent = role === "user" ? "You" : "MiniCPM5";
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = content;
  div.append(roleEl, bubble);
  els.chat.appendChild(div);
  els.chat.scrollTop = els.chat.scrollHeight;
  return bubble;
}

// Render assistant text, splitting out <think>...</think> into a styled block
function renderAssistant(bubble, raw, streaming) {
  bubble.innerHTML = "";
  let think = null, answer = raw;
  const open = raw.indexOf("<think>");
  if (open !== -1) {
    const close = raw.indexOf("</think>");
    if (close !== -1) {
      think = raw.slice(open + 7, close).trim();
      answer = (raw.slice(0, open) + raw.slice(close + 9)).trim();
    } else {
      think = raw.slice(open + 7).trim();
      answer = "";
    }
  }
  if (think) {
    const tb = document.createElement("div");
    tb.className = "think-block";
    const lbl = document.createElement("span");
    lbl.className = "think-label";
    lbl.textContent = "thinking";
    tb.appendChild(lbl);
    tb.appendChild(document.createTextNode(think));
    bubble.appendChild(tb);
  }
  const ans = document.createElement("span");
  ans.textContent = answer;
  if (streaming) ans.className = "cursor-blink";
  bubble.appendChild(ans);
  els.chat.scrollTop = els.chat.scrollHeight;
}

function requestAbort() { abortRequested = true; }

async function send() {
  const text = els.input.value.trim();
  if (!text || !modelLoaded || generating) return;
  const welcome = document.getElementById("welcome");
  if (welcome) welcome.remove();

  history.push({ role: "user", content: text });
  addMsg("user", text);
  els.input.value = "";
  els.input.style.height = "auto";

  generating = true;
  abortRequested = false;
  els.send.classList.add("hidden");
  els.stop.classList.remove("hidden");
  els.input.disabled = true;

  const bubble = addMsg("assistant", "");
  const messages = [];
  const sys = els.sysPrompt.value.trim();
  if (sys) messages.push({ role: "system", content: sys });
  messages.push(...history);

  let full = "";
  let t0 = performance.now();
  let firstTokAt = 0;

  try {
    full = await engine.generate({
      messages,
      think: els.think.checked,
      temp: parseFloat(els.temp.value),
      maxTokens: parseInt(els.maxTok.value, 10),
      shouldAbort: () => abortRequested,
      onToken: (partial) => {
        if (!firstTokAt) firstTokAt = performance.now();
        full = partial;
        renderAssistant(bubble, full, true);
      },
    });
  } catch (e) {
    if (!abortRequested) {
      console.error(e);
      full += `\n[error: ${e.message || e}]`;
    }
  }

  full = (full || "").trim();
  renderAssistant(bubble, full, false);
  history.push({ role: "assistant", content: full });

  const dt = (performance.now() - t0) / 1000;
  const genDt = firstTokAt ? (performance.now() - firstTokAt) / 1000 : dt;
  const approxToks = Math.round(full.length / 3.5);
  els.stats.textContent =
    `${engine.describe()} · ~${approxToks} tokens in ${dt.toFixed(1)}s` +
    (genDt > 0.2 ? ` (~${(approxToks / genDt).toFixed(1)} tok/s after first token)` : "");

  generating = false;
  els.send.classList.remove("hidden");
  els.stop.classList.add("hidden");
  els.input.disabled = false;
  els.input.focus();
}

// ---- UI wiring ----
els.loadBtn.addEventListener("click", () => (modelLoaded ? unloadModel() : loadModel()));
els.send.addEventListener("click", send);
els.stop.addEventListener("click", requestAbort);
els.settingsBtn.addEventListener("click", () => els.settingsPanel.classList.toggle("hidden"));
els.input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
});
els.input.addEventListener("input", () => {
  els.input.style.height = "auto";
  els.input.style.height = Math.min(160, els.input.scrollHeight) + "px";
});
const bind = (slider, label) =>
  slider.addEventListener("input", () => (label.textContent = slider.value));
bind(els.ctx, els.ctxVal);
bind(els.temp, els.tempVal);
bind(els.maxTok, els.maxTokVal);

// Quant + ctx only apply to the wllama (GGUF) engine
els.engine.addEventListener("change", () => {
  const isW = pickEngine() === wllama;
  els.quantRow.classList.toggle("hidden", !isW);
});

// Think mode default sampling per model card: think=0.9, no-think=0.7
els.think.addEventListener("change", () => {
  els.temp.value = els.think.checked ? "0.9" : "0.7";
  els.tempVal.textContent = els.temp.value;
});

// Initial UI state
(function init() {
  const hasGPU = !!navigator.gpu;
  els.engine.value = hasGPU ? "tjs" : "wllama";
  els.quantRow.classList.toggle("hidden", hasGPU);
  if (!hasGPU) {
    setStatus("WebGPU not found — will use CPU (WASM). Model not loaded.");
  }
  if (!crossOriginIsolated) {
    setStatus("Note: page is not cross-origin isolated; wllama will run single-threaded. Serve with COOP/COEP headers.", "status-err");
  }
})();
