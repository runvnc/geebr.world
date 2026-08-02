// Transformers.js v4 model loader for Gemma 4 E2B (multimodal: text + image + audio).
// Alternative engine alongside WebLLM (model-loader.js).
// Uses @huggingface/transformers with WebGPU acceleration.
// Defaults to q4 (4-bit weights, 32-bit activations) to avoid shader-f16 issues
// on older GPUs like RTX 2060. Falls back to CPU if WebGPU fails.
import * as transformers from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0";

const MODEL_CONFIG = {
  'lfm2.5-230m': {
    label: 'LFM2.5-230M (Transformers.js)',
    modelId: 'LiquidAI/LFM2.5-230M-ONNX',
    // q4 uses GatherBlockQuantized for the token embedding, which Transformers.js
    // does not implement (fails on both WebGPU and WASM). q8 keeps the embedding
    // as FP32 Gather and works on WebGPU (verified).
    dtype: 'q8',
    vram: '~470MB',
    device: 'webgpu',
  },
  'gemma4-e2b': {
    label: 'Gemma 4 E2B (Transformers.js)',
    modelId: 'onnx-community/gemma-4-E2B-it-ONNX',
    dtype: 'q4',       // 4-bit weights, 32-bit activations - safe for GPUs without shader-f16
    vram: '~2GB',
    device: 'webgpu',
  },
};

let processor = null;
let model = null;
let currentModel = null;
let loading = false;
let hasShaderF16 = null;

async function detectShaderF16() {
  if (hasShaderF16 !== null) return hasShaderF16;
  if (!navigator.gpu) return (hasShaderF16 = false);
  try {
    const adapter = await navigator.gpu.requestAdapter();
    hasShaderF16 = !!adapter?.features?.has('shader-f16');
    return hasShaderF16;
  } catch {
    hasShaderF16 = false;
    return false;
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
  return model !== null && processor !== null;
}

export function getEngine() {
  return 'transformers.js';
}

// LFM2.5's chat_template uses {% generation %} / {% endgeneration %} block tags,
// which Transformers.js 4.2.0's template parser does not recognize (throws
// 'Unknown statement type: generation'). The generation block merely marks where
// assistant generation begins; stripping the tags leaves the template functional.
function sanitizeChatTemplate(template) {
  if (typeof template !== 'string') return template;
  return template
    .replace(/{%-?\s*generation\s*-?%}/g, '')
    .replace(/{%-?\s*endgeneration\s*-?%}/g, '');
}

export async function getCapabilityInfo() {
  await detectShaderF16();
  return { webgpu: !!navigator.gpu, shaderF16: hasShaderF16 };
}

export async function loadModel(modelKey, onProgress) {
  const cfg = MODEL_CONFIG[modelKey];
  if (!cfg) throw new Error(`Unknown model: ${modelKey}`);
  if (model && processor && currentModel === modelKey) return { model, processor };
  if (loading) return;

  // Unload previous if any
  if (model) {
    try { model.dispose?.(); } catch {}
    model = null;
    processor = null;
  }
  currentModel = null;
  loading = true;

  await detectShaderF16();
  // Use cfg.dtype if specified (e.g. LFM2.5 needs q8 to avoid GatherBlockQuantized),
  // otherwise q4f16 if shader-f16 is available, else q4 (32-bit activations).
  const dtype = cfg.dtype || (hasShaderF16 ? 'q4f16' : 'q4');

  onProgress?.('Loading Transformers.js v4...');
  onProgress?.(`Model: ${cfg.label} (dtype: ${dtype}${!hasShaderF16 ? ' [no shader-f16]' : ''})`);

  const isGemma = modelKey === 'gemma4-e2b';
  const modelClass = isGemma ? transformers.Gemma4ForConditionalGeneration : transformers.AutoModelForCausalLM;
  try {
    onProgress?.('Downloading processor/tokenizer...');
    processor = await (isGemma ? transformers.AutoProcessor : transformers.AutoTokenizer).from_pretrained(cfg.modelId, {
      progress_callback: (info) => {
        if (info.status === 'progress') {
          onProgress?.(`Tokenizer: ${Math.round(info.progress || 0)}%`);
        } else if (info.status === 'ready') {
          onProgress?.('Tokenizer ready');
        }
      },
    });

    // Strip unsupported {% generation %} / {% endgeneration %} block tags from
    // the model's chat_template (LFM2.5 uses them; Transformers.js 4.2.0 does not
    // support the 'generation' statement type and throws a SyntaxError).
    // NOTE: For AutoTokenizer (LFM2.5), `processor` IS the tokenizer, so the
    // template lives at processor.chat_template. For AutoProcessor (Gemma),
    // it lives at processor.tokenizer.chat_template. Handle both.
    const tplHolder = processor?.chat_template ? processor
      : (processor?.tokenizer?.chat_template ? processor.tokenizer : null);
    if (tplHolder) {
      const original = tplHolder.chat_template;
      const cleaned = sanitizeChatTemplate(original);
      if (cleaned !== original) {
        tplHolder.chat_template = cleaned;
        console.log('[geebr-tjs] sanitized chat_template: removed generation block tags');
      } else {
        console.log('[geebr-tjs] chat_template had no generation block tags to strip');
      }
    } else {
      console.warn('[geebr-tjs] could not locate chat_template for sanitization');
    }

    // Try a sequence of dtype/device combos, same as the working test demo:
    // q4 WebGPU first, then q8 WebGPU, then q8 WASM. q4 uses GatherBlockQuantized
    // which Transformers.js doesn't implement; q8 keeps FP32 embedding and works.
    // Same attempt loop as the working demo chat: q4 WebGPU first, then q8 WebGPU,
    // then q8 WASM. On a fresh download q4 fails at load (GatherBlockQuantized not
    // implemented) and falls through to q8 WebGPU which works. If q4 is cached it
    // may load but fail at generation - clear the model cache to force a fresh
    // download so it falls through to q8.
    const attempts = [
      { dtype: 'q4', device: 'webgpu', label: 'q4 WebGPU' },
      { dtype: 'q8', device: 'webgpu', label: 'q8 WebGPU' },
      { dtype: 'q8', device: 'wasm', label: 'q8 WASM' },
    ];
    let lastErr = null;
    for (const attempt of attempts) {
      onProgress?.(`Downloading model weights (${attempt.label})...`);
      try {
        model = await modelClass.from_pretrained(cfg.modelId, {
          dtype: attempt.dtype,
          device: attempt.device,
          progress_callback: (info) => {
            if (info.status === 'progress') {
              onProgress?.(`Model (${attempt.label}): ${Math.round(info.progress || 0)}%`);
            } else if (info.status === 'ready') {
              onProgress?.(`Model (${attempt.label}) ready`);
            } else if (info.status === 'initiate') {
              onProgress?.(`Downloading: ${info.file || ''}`);
            }
          },
        });
        currentModel = modelKey;
        onProgress?.(`${cfg.label} ready (${attempt.label})`);
        return { model, processor };
      } catch (e) {
        lastErr = e;
        console.warn(`[geebr-tjs] ${attempt.label} failed:`, e);
        onProgress?.(`${attempt.label} failed: ${e.message}. Trying next...`);
      }
    }
    throw new Error(`Failed to load model: ${lastErr?.message || 'all attempts failed'}`);
  } finally {
    loading = false;
  }
}

export function unloadModel() {
  if (model) {
    try { model.dispose?.(); } catch {}
  }
  model = null;
  processor = null;
  currentModel = null;
}

export async function clearModelCache() {
  // Transformers.js uses browser cache automatically; no explicit cache clear API
  // Could use caches.delete() but that's browser-specific
  console.log('Transformers.js cache clear not implemented - browser manages cache');
}

export async function hasModelCached() {
  // Transformers.js doesn't expose a simple cache check
  return false;
}

export function getCacheBackend() {
  return 'browser';
}

export function setCacheBackend() {
  return false;
}
