// WebLLM model loader with WebGPU capability detection and fallback
import * as webllm from "https://esm.run/@mlc-ai/web-llm";

// Each model size has both f16 and f32 variants
// f16 requires WebGPU 'shader-f16' feature on some models, f32 works everywhere
const MODEL_VARIANTS = {
  'qwen3-0.6b': {
    label: 'Qwen3-0.6B',
    f16: { modelId: 'Qwen3-0.6B-q4f16_1-MLC', vram: '1.4GB' },
    f32: { modelId: 'Qwen3-0.6B-q4f32_1-MLC', vram: '1.9GB' },
  },
  'qwen3.5-0.8b': {
    label: 'Qwen3.5-0.8B',
    f16: { modelId: 'Qwen3.5-0.8B-q4f16_1-MLC', vram: '1.6GB' },
    f32: { modelId: 'Qwen3.5-0.8B-q4f32_1-MLC', vram: '1.9GB' },
  },
  'smollm2-360m': {
    label: 'SmolLM2-360M',
    f16: { modelId: 'SmolLM2-360M-Instruct-q4f16_1-MLC', vram: '376MB' },
    f32: { modelId: 'SmolLM2-360M-Instruct-q4f32_1-MLC', vram: '580MB' },
  },
  'smollm2-1.7b': {
    label: 'SmolLM2-1.7B',
    f16: { modelId: 'SmolLM2-1.7B-Instruct-q4f16_1-MLC', vram: '1.7GB' },
    f32: { modelId: 'SmolLM2-1.7B-Instruct-q4f32_1-MLC', vram: '2.7GB' },
  },
  'qwen2.5-0.5b': {
    label: 'Qwen2.5-0.5B',
    f16: { modelId: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC', vram: '944MB' },
    f32: { modelId: 'Qwen2.5-0.5B-Instruct-q4f32_1-MLC', vram: '1.1GB' },
  },
  'tinyllama-1.1b': {
    label: 'TinyLlama-1.1B',
    f16: { modelId: 'TinyLlama-1.1B-Chat-v1.0-q4f16_1-MLC', vram: '697MB' },
    f32: { modelId: 'TinyLlama-1.1B-Chat-v1.0-q4f32_1-MLC', vram: '840MB' },
  },
  'llama3.2-1b': {
    label: 'Llama-3.2-1B',
    f16: { modelId: 'Llama-3.2-1B-Instruct-q4f16_1-MLC', vram: '879MB' },
    f32: { modelId: 'Llama-3.2-1B-Instruct-q4f32_1-MLC', vram: '1.1GB' },
  },
};

let engine = null;
let currentModel = null;
let loading = false;
let hasShaderF16 = null; // null = not checked yet

// Detect WebGPU shader-f16 support
async function detectShaderF16() {
  if (hasShaderF16 !== null) return hasShaderF16;
  
  if (!navigator.gpu) {
    hasShaderF16 = false;
    return false;
  }
  
  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      hasShaderF16 = false;
      return false;
    }
    hasShaderF16 = adapter.features.has('shader-f16');
    return hasShaderF16;
  } catch (e) {
    hasShaderF16 = false;
    return false;
  }
}

// Get the best variant for a model key based on GPU capabilities
function getBestVariant(modelKey) {
  const model = MODEL_VARIANTS[modelKey];
  if (!model) return null;
  
  if (hasShaderF16 === true) {
    return { ...model.f16, variant: 'f16' };
  }
  return { ...model.f32, variant: 'f32' };
}

// Get the fallback variant (opposite of current best)
function getFallbackVariant(modelKey) {
  const model = MODEL_VARIANTS[modelKey];
  if (!model) return null;
  
  if (hasShaderF16 === true) {
    return { ...model.f32, variant: 'f32' };
  }
  return { ...model.f16, variant: 'f16' };
}

export function getAvailableModels() {
  return Object.entries(MODEL_VARIANTS).map(([key, val]) => ({
    key,
    label: val.label,
  }));
}

export function getCurrentModel() {
  return currentModel;
}

export async function loadModel(modelKey, onProgress) {
  const model = MODEL_VARIANTS[modelKey];
  if (!model) throw new Error(`Unknown model: ${modelKey}`);

  if (engine && currentModel === modelKey) return engine;
  if (loading) return;

  // Unload previous model if any
  if (engine) {
    try { engine.unload(); } catch(e) {}
    engine = null;
  }
  currentModel = null;
  loading = true;

  // Detect shader-f16 support
  await detectShaderF16();
  
  // Get the best variant for this GPU
  let variant = getBestVariant(modelKey);
  
  try {
    engine = await tryLoadVariant(variant, onProgress);
    currentModel = modelKey;
    onProgress?.('Ready');
    return engine;
  } catch (e) {
    // Try fallback variant
    const fallback = getFallbackVariant(modelKey);
    if (fallback && fallback.modelId !== variant.modelId) {
      onProgress?.(`${variant.variant.toUpperCase()} failed: ${e.message}. Trying ${fallback.variant.toUpperCase()}...`);
      try {
        engine = await tryLoadVariant(fallback, onProgress);
        currentModel = modelKey;
        onProgress?.('Ready (fallback)');
        return engine;
      } catch (e2) {
        onProgress?.(`Error: ${e2.message}`);
        throw e2;
      }
    }
    onProgress?.(`Error: ${e.message}`);
    throw e;
  } finally {
    loading = false;
  }
}

async function tryLoadVariant(variant, onProgress) {
  onProgress?.(`Initializing WebLLM (${variant.variant})...`);
  const eng = await webllm.CreateMLCEngine(
    variant.modelId,
    {
      initProgressCallback: (progress) => {
        if (progress.text) {
          onProgress?.(progress.text);
        }
      },
    }
  );
  return eng;
}

export function isLoaded() {
  return engine !== null;
}

export function unloadModel() {
  if (engine) {
    try { engine.unload(); } catch(e) {}
  }
  engine = null;
  currentModel = null;
}

export function getEngine() {
  return engine;
}

export async function getCapabilityInfo() {
  await detectShaderF16();
  return {
    webgpu: !!navigator.gpu,
    shaderF16: hasShaderF16,
  };
}
