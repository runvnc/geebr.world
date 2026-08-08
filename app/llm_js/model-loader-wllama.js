// wllama (llama.cpp -> WASM) model loader for MiniCPM5-1B.
// CPU engine using GGUF weights from Hugging Face (openbmb/MiniCPM5-1B-GGUF).
// This is the normal CPU version that works on GPUs without shader-f16.
import { Wllama } from "https://cdn.jsdelivr.net/npm/@wllama/wllama@2.3.7/esm/index.js";

const WLLAMA_BASE = "https://cdn.jsdelivr.net/npm/@wllama/wllama@2.3.7/";
const CONFIG_PATHS = {
  "single-thread/wllama.wasm": WLLAMA_BASE + "esm/single-thread/wllama.wasm",
  "multi-thread/wllama.wasm": WLLAMA_BASE + "esm/multi-thread/wllama.wasm",
};

const HF_BASE = "https://huggingface.co/openbmb/MiniCPM5-1B-GGUF/resolve/main/";

const MODEL_CONFIG = {
  'minicpm5-1b': {
    label: 'MiniCPM5-1B (CPU)',
    file: 'MiniCPM5-1B-Q4_K_M.gguf',
    size: 688 * 1024 * 1024,
    vram: 'CPU · WASM',
  },
};

let wllama = null;
let currentModel = null;
let loading = false;
let loadedQuant = null;
let loadedCtx = 0;

export function getAvailableModels() {
  return Object.entries(MODEL_CONFIG).map(([key, cfg]) => ({ key, label: cfg.label }));
}

export function getCurrentModel() {
  return currentModel;
}

export function isLoaded() {
  return wllama !== null;
}

export function getEngine() {
  return 'wllama';
}

export async function getCapabilityInfo() {
  // wllama runs on CPU/WASM - no WebGPU required.
  return { webgpu: true, shaderF16: false, cpu: true };
}

export async function loadModel(modelKey, onProgress) {
  const cfg = MODEL_CONFIG[modelKey];
  if (!cfg) throw new Error(`Unknown model: ${modelKey}`);
  if (wllama && currentModel === modelKey) return wllama;
  if (loading) return;

  if (wllama) {
    try { await wllama.exit(); } catch {}
    wllama = null;
  }
  currentModel = null;
  loading = true;

  onProgress?.('Loading MiniCPM5-1B (CPU / wllama)...');
  onProgress?.(`Model: ${cfg.label}`);

  try {
    wllama = new Wllama(CONFIG_PATHS, { allowOffline: false });
    await wllama.loadModelFromUrl(HF_BASE + cfg.file, {
      n_ctx: 4096,
      n_threads: Math.min(8, navigator.hardwareConcurrency || 4),
      progressCallback: ({ loaded, total }) => {
        const totalBytes = total || cfg.size;
        const percent = totalBytes ? Math.min(100, (loaded / totalBytes) * 100) : null;
        onProgress?.({
          phase: 'download',
          percent,
          text: percent !== null ? `Downloading GGUF: ${percent.toFixed(1)}%` : 'Downloading GGUF...',
        });
      },
    });
    currentModel = modelKey;
    loadedQuant = 'Q4_K_M';
    loadedCtx = 4096;
    onProgress?.('MiniCPM5-1B ready (CPU / wllama)');
    return wllama;
  } catch (e) {
    throw new Error(`Failed to load wllama model: ${e.message}`);
  } finally {
    loading = false;
  }
}

export function unloadModel() {
  if (wllama) {
    try { wllama.exit(); } catch {}
  }
  wllama = null;
  currentModel = null;
}

export async function clearModelCache(modelKey) {
  // wllama uses browser HTTP cache; nothing to clear explicitly.
  console.log('wllama cache clear: no-op (uses browser HTTP cache)');
}

export async function hasModelCached(modelKey) {
  // wllama uses browser HTTP cache; we can't easily check. Return false so
  // the download consent flow runs (it will be fast if cached by the browser).
  return false;
}

export function getCacheBackend() {
  return 'browser-http';
}

export function setCacheBackend() {
  return false;
}
