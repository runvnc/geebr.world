// CPU engine: wllama (llama.cpp -> WebAssembly), GGUF weights from Hugging Face.
import { Wllama } from "https://cdn.jsdelivr.net/npm/@wllama/wllama@2.3.7/esm/index.js";

const WLLAMA_BASE = "https://cdn.jsdelivr.net/npm/@wllama/wllama@2.3.7/";
const CONFIG_PATHS = {
  "single-thread/wllama.wasm": WLLAMA_BASE + "esm/single-thread/wllama.wasm",
  "multi-thread/wllama.wasm": WLLAMA_BASE + "esm/multi-thread/wllama.wasm",
};

const HF_BASE = "https://huggingface.co/openbmb/MiniCPM5-1B-GGUF/resolve/main/";
const MODELS = {
  Q4_K_M: { file: "MiniCPM5-1B-Q4_K_M.gguf", size: 688 * 1024 * 1024 },
  Q8_0:   { file: "MiniCPM5-1B-Q8_0.gguf",   size: 1150 * 1024 * 1024 },
};

export const id = "wllama";
export const label = "CPU · WASM (wllama / llama.cpp)";

let wllama = null;
let loadedQuant = null;
let loadedCtx = 0;

export function describe() {
  if (!wllama) return null;
  const threads = crossOriginIsolated ? "multi-thread" : "single-thread";
  return `CPU · WASM ${threads} · GGUF ${loadedQuant} · ctx ${loadedCtx}`;
}

export async function isAvailable() { return true; }

export async function load({ quant = "Q4_K_M", nCtx = 4096, onProgress } = {}) {
  const m = MODELS[quant] || MODELS.Q4_K_M;
  wllama = new Wllama(CONFIG_PATHS, { allowOffline: false });
  await wllama.loadModelFromUrl(HF_BASE + m.file, {
    n_ctx: nCtx,
    n_threads: Math.min(8, navigator.hardwareConcurrency || 4),
    progressCallback: ({ loaded, total }) => {
      onProgress?.({ loaded, total: total || m.size, text: "Downloading GGUF" });
    },
  });
  loadedQuant = quant;
  loadedCtx = nCtx;
}

export async function unload() {
  try { await wllama?.exit(); } catch {}
  wllama = null;
}

// MiniCPM5 chat template (ChatML-style, from openbmb/MiniCPM5-1B chat_template.jinja)
function buildPrompt(messages, think) {
  // BOS is required: this GGUF has add_bos_token=false, and without an explicit
  // <s> the model immediately emits the end-of-turn token (empty replies).
  let p = "<s>";
  for (const msg of messages) {
    p += `<|im_start|>${msg.role}\n${msg.content}ٌ\n`;
  }
  p += "<|im_start|>assistant\n";
  p += think ? "<think>\n" : "<think>\n\n</think>\n\n";
  return p;
}

export async function generate({ messages, think, temp, maxTokens, shouldAbort, onToken }) {
  const prompt = buildPrompt(messages, think);
  const aborter = new AbortController();
  let full = "";
  const poll = setInterval(() => { if (shouldAbort?.()) aborter.abort(); }, 150);
  try {
    full = await wllama.createCompletion(prompt, {
      nPredict: maxTokens,
      abortSignal: aborter.signal,
      sampling: { temp, top_p: 0.95, top_k: 40, penalty_repeat: 1.1 },
      onNewToken: (token, piece, currentText, { abortSignal }) => {
        full = currentText;
        if (full.includes("ٌ") || shouldAbort?.()) { abortSignal(); return; }
        onToken?.(full);
      },
    });
  } finally {
    clearInterval(poll);
  }
  return full.split("ٌ")[0].trim();
}
