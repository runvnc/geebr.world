// GPU engine: Transformers.js + ONNX Runtime Web with WebGPU backend.
// Weights: Mike0021/MiniCPM5-1B-ONNX-Web (q4 MatMulNBits, ~902 MB).
// Falls back to WASM device automatically if WebGPU init fails.
import {
  pipeline,
  TextStreamer,
  StoppingCriteria,
  StoppingCriteriaList,
  env,
} from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0";

env.allowLocalModels = false;

// skjortan export: q4 weights + FP32 activations (model_q4.onnx) -> runs on
// WebGPU WITHOUT the shader-f16 feature (RTX 20-series browsers included).
// Chat template is inlined in its tokenizer_config.json.
const MODEL_ID = "skjortan/MiniCPM5-1B-ONNX";

export const id = "tjs";
export const label = "GPU · WebGPU (transformers.js / ONNX)";

let generator = null;
let activeDevice = null;

export function describe() {
  if (!generator) return null;
  const dev = activeDevice === "webgpu" ? "GPU · WebGPU" : "CPU · WASM (transformers.js)";
  return `${dev} · ONNX q4`;
}

export async function isAvailable() {
  return !!navigator.gpu;
}

async function tryPipeline(device, onProgress) {
  return await pipeline("text-generation", MODEL_ID, {
    dtype: "q4",
    device,
    progress_callback: (p) => {
      if (p.status === "progress" && p.total) {
        onProgress?.({ loaded: p.loaded, total: p.total, text: `Downloading ${p.file}` });
      } else if (p.status === "ready") {
        onProgress?.({ loaded: 1, total: 1, text: "Model ready" });
      } else if (p.text) {
        onProgress?.({ loaded: 0, total: 0, text: p.text });
      } else if (p.file) {
        onProgress?.({ loaded: 0, total: 0, text: `${p.status}: ${p.file}` });
      }
    },
  });
}

async function ensureChatTemplate() {
  if (generator.tokenizer.chat_template) return;
  // The repo ships chat_template.jinja as a separate file; transformers.js
  // only reads tokenizer_config.json, so fetch and assign it manually.
  const url = "https://huggingface.co/" + MODEL_ID + "/raw/main/chat_template.jinja";
  const resp = await fetch(url);
  if (!resp.ok) throw new Error("failed to fetch chat template: " + resp.status);
  generator.tokenizer.chat_template = await resp.text();
}

export async function load({ onProgress } = {}) {
  try {
    generator = await tryPipeline("webgpu", onProgress);
    activeDevice = "webgpu";
  } catch (e) {
    console.warn("WebGPU pipeline failed, falling back to WASM:", e);
    onProgress?.({ loaded: 0, total: 0, text: "WebGPU failed, trying WASM fallback..." });
    generator = await tryPipeline("wasm", onProgress);
    activeDevice = "wasm";
  }
  await ensureChatTemplate();
}

export async function unload() {
  try { await generator?.dispose?.(); } catch {}
  generator = null;
  activeDevice = null;
}

class AbortCriteria extends StoppingCriteria {
  constructor(shouldAbort) {
    super();
    this.shouldAbort = shouldAbort;
  }
  _call() {
    return [!!this.shouldAbort?.()];
  }
}

export async function generate({ messages, think, temp, maxTokens, shouldAbort, onToken }) {
  const tokenizer = generator.tokenizer;
  // Apply the repo's chat_template.jinja ourselves so enable_thinking works
  // exactly like the HF reference (think: '<think>\n', no-think: empty think block).
  const prompt = tokenizer.apply_chat_template(messages, {
    add_generation_prompt: true,
    enable_thinking: think,
    tokenize: false,
  });

  const streamer = new TextStreamer(tokenizer, {
    skip_prompt: true,
    skip_special_tokens: true,
    callback_function: () => onToken?.(streamer.output ?? ""),
  });

  const stopping_criteria = new StoppingCriteriaList([new AbortCriteria(shouldAbort)]);

  const out = await generator(prompt, {
    max_new_tokens: maxTokens,
    do_sample: temp > 0,
    temperature: temp > 0 ? temp : undefined,
    top_p: 0.95,
    top_k: 40,
    repetition_penalty: 1.1,
    streamer,
    stopping_criteria,
  });

  let text = Array.isArray(out) ? String(out[0]?.generated_text ?? "") : String(out);
  // String prompt -> generated_text may include the prompt; strip it.
  if (text.startsWith(prompt)) text = text.slice(prompt.length);
  return text.split(" ٌ")[0].trim();
}
