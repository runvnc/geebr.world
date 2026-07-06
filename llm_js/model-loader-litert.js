// LiteRT-LM model loader for Gemma 4 E2B (.litertlm format with PLE memory mapping).
// Uses @litert-lm/core with WebGPU acceleration.
// PLE (Per-Layer Embeddings) are memory-mapped, keeping in-memory footprint ~0.8GB
// while 1.12GB of embedding parameters stay on disk/OPFS.
// Implements OPFS caching to avoid re-downloading 2GB on each page load.
import { Engine } from "https://cdn.jsdelivr.net/npm/@litert-lm/core@0.14.0/+esm";

const MODEL_CONFIG = {
  'gemma4-e2b-litert': {
    label: 'Gemma 4 E2B (LiteRT-LM)',
    modelUrl: 'https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/main/gemma-4-E2B-it-web.litertlm',
    vram: '~0.8GB in-memory (PLE memory-mapped)',
  },
};

let engine = null;
let currentModel = null;
let loading = false;

// OPFS cache helpers
async function getCachedModelStream(modelKey) {
  try {
    const root = await navigator.storage.getDirectory();
    const fileHandle = await root.getFileHandle(`litert-${modelKey}.litertlm`);
    const file = await fileHandle.getFile();
    return file.stream();
  } catch {
    return null; // not cached
  }
}

async function cacheModelStream(modelKey, response, onProgress) {
  try {
    const root = await navigator.storage.getDirectory();
    const fileHandle = await root.getFileHandle(`litert-${modelKey}.litertlm`, { create: true });
    const writable = await fileHandle.createWritable();
    const reader = response.body.getReader();
    const contentLength = Number(response.headers.get('Content-Length') || 0);
    let received = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      await writable.write(value);
      received += value.length;
      if (contentLength > 0) {
        const pct = Math.round((received / contentLength) * 100);
        onProgress?.(`Caching model: ${pct}%`);
      }
    }
    await writable.close();
    onProgress?.('Model cached to OPFS');
  } catch (e) {
    console.warn('OPFS cache failed:', e);
    onProgress?.('Cache failed (will re-download next time)');
  }
}

export function getAvailableModels() {
  return Object.entries(MODEL_CONFIG).map(([key, cfg]) => ({
    key,
    label: cfg.label,
  }));
}

export function getCurrentModel() {
  return currentModel;
}

export function isLoaded() {
  return engine !== null;
}

export function getEngine() {
  return 'litert-lm';
}

export async function getCapabilityInfo() {
  const webgpu = !!navigator.gpu;
  let shaderF16 = false;
  if (webgpu) {
    try {
      const adapter = await navigator.gpu.requestAdapter();
      shaderF16 = !!adapter?.features?.has('shader-f16');
    } catch {}
  }
  return { webgpu, shaderF16 };
}

export async function loadModel(modelKey, onProgress) {
  const cfg = MODEL_CONFIG[modelKey];
  if (!cfg) throw new Error(`Unknown model: ${modelKey}`);
  if (engine && currentModel === modelKey) return engine;
  if (loading) return;

  // Unload previous if any
  if (engine) {
    try { engine.delete(); } catch {}
    engine = null;
  }
  currentModel = null;
  loading = true;

  onProgress?.('Loading LiteRT-LM...');
  onProgress?.(`Model: ${cfg.label}`);

  try {
    // Try OPFS cache first
    onProgress?.('Checking OPFS cache...');
    const cachedStream = await getCachedModelStream(modelKey);

    let modelSource;
    if (cachedStream) {
      onProgress?.('Loading from OPFS cache...');
      modelSource = cachedStream;
    } else {
      onProgress?.('Downloading model (2GB, will cache to OPFS)...');
      const response = await fetch(cfg.modelUrl);
      if (!response.ok) throw new Error(`Download failed: ${response.status}`);

      // Clone the response so we can both cache and use it
      const cacheResponse = response.clone();
      // Start caching in background (don't await - start loading while caching)
      cacheModelStream(modelKey, cacheResponse, onProgress);

      modelSource = response.body;
    }

    engine = await Engine.create({
      model: modelSource,
      mainExecutorSettings: {
        maxNumTokens: 8192,
      },
    });
    currentModel = modelKey;
    onProgress?.('Gemma 4 E2B ready (LiteRT-LM)');
    return engine;
  } catch (e) {
    throw new Error(`Failed to load LiteRT-LM model: ${e.message}`);
  } finally {
    loading = false;
  }
}

export function unloadModel() {
  if (engine) {
    try { engine.delete(); } catch {}
  }
  engine = null;
  currentModel = null;
}

export async function clearModelCache(modelKey) {
  const key = modelKey || 'gemma4-e2b-litert';
  try {
    const root = await navigator.storage.getDirectory();
    await root.removeEntry(`litert-${key}.litertlm`);
    console.log('OPFS cache cleared for', key);
  } catch (e) {
    console.warn('Cache clear failed:', e);
  }
}

export async function hasModelCached(modelKey) {
  const key = modelKey || 'gemma4-e2b-litert';
  try {
    const root = await navigator.storage.getDirectory();
    await root.getFileHandle(`litert-${key}.litertlm`);
    return true;
  } catch {
    return false;
  }
}

export function getCacheBackend() {
  return 'opfs';
}

export function setCacheBackend() {
  return false;
}
