# MiniCPM5-1B — Browser-Only Local Demo

Run [OpenBMB's MiniCPM5-1B](https://huggingface.co/openbmb/MiniCPM5-1B) entirely in the
browser. No server-side inference, no API keys — the model is downloaded once from
Hugging Face, cached by the browser, and executed locally with
[wllama](https://github.com/ngxson/wllama) (llama.cpp compiled to WebAssembly).

## Quick start

```bash
cd /files/minicpm5
python3 serve.py          # http://localhost:8177/
```

Any static file server works, but `serve.py` adds the COOP/COEP headers needed for
`crossOriginIsolated`, which enables **multi-threaded WASM** (much faster). Without
those headers the demo still works, just single-threaded.

Then click **Load model**. First load downloads ~688 MB (Q4_K_M); it is cached in the
browser afterwards.

## Engines (CPU + GPU)

The demo has two selectable backends (Settings → Engine, default Auto = GPU when WebGPU exists):

| Engine | Tech | Weights | Notes |
| --- | --- | --- | --- |
| **GPU · WebGPU** | transformers.js 4 + ONNX Runtime Web | `skjortan/MiniCPM5-1B-ONNX` `model_q4.onnx` (1.35 GB) | q4 weights + **fp32 activations**, so it works on GPUs/browsers **without** the `shader-f16` WebGPU feature (e.g. RTX 20-series). Falls back to WASM device automatically if WebGPU init fails. |
| **CPU · WASM** | wllama 2.3.7 (llama.cpp → WASM) | `openbmb/MiniCPM5-1B-GGUF` Q4_K_M (688 MB) / Q8_0 | Multi-threaded when cross-origin isolated. |

The active engine is shown as a badge next to the model status and in the stats line
after each reply. The Mike0021 ONNX export was tried first but its fp16 Gather requires
`shader-f16`; the skjortan export keeps activations fp32 and works without it.

## Features

- **Think / No-Think toggle** — MiniCPM5's hybrid reasoning modes from a single
  checkpoint (think mode streams the `<think>` block in a styled panel).
- **Streaming output** with live token rendering and tok/s stats.
- **Quant selector** — Q4_K_M (688 MB, default) or Q8_0 (1.15 GB).
- Adjustable context size (1k–16k), temperature, max tokens, system prompt.
- Stop button to abort generation mid-stream.
- Multi-turn chat with the official ChatML-style template
  (`<|im_start|>` / `<|im_end|>`), matching `chat_template.jinja`.

## How it works

| Piece | Choice | Why |
| --- | --- | --- |
| GPU runtime | transformers.js 4 + onnxruntime-web WebGPU | Official-style ONNX export with fp32 activations; no shader-f16 needed |
| CPU runtime | wllama 2.3.7 (llama.cpp → WASM, via jsDelivr) | MiniCPM5 is standard `LlamaForCausalLM`, so stock llama.cpp runs it; no custom kernels |
| Weights | `skjortan/MiniCPM5-1B-ONNX` (GPU) / `openbmb/MiniCPM5-1B-GGUF` (CPU) | Both fetchable cross-origin from Hugging Face |
| Chat format | Hand-rolled template (wllama) / repo `chat_template.jinja` (transformers.js) | `enable_thinking` toggles the generation-prompt suffix |

WebLLM/MLC and Transformers.js/ONNX were considered (cf. geebr.world) but there is no
prebuilt MLC or ONNX export of MiniCPM5-1B, while official GGUF quants exist — so the
llama.cpp WASM route is the only zero-build browser path today.

## Notes & limits

- Best in Chrome/Edge (WASM SIMD + threads). Firefox works; Safari is single-thread.
- Speed is CPU-bound: expect roughly 5–20 tok/s depending on hardware and threads.
- Context is capped at 16k in the UI (model supports 131k, but WASM memory is finite).
- Everything stays on your machine; the only network traffic is the one-time model
  download from huggingface.co and the wllama runtime from jsDelivr.

## Files

- `index.html` — UI shell
- `style.css` — dark theme
- `main.js` — engine selection, streaming, UI wiring
- `engine-tjs.js` — GPU backend (transformers.js + WebGPU, ONNX q4, WASM fallback)
- `engine-wllama.js` — CPU backend (wllama + GGUF)
- `serve.py` — static server with COOP/COEP headers
