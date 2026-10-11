#!/usr/bin/env bash
# Wait until the page's brain status says the Gemma model is ready, clicking
# "Download & run" if the consent prompt is showing. Prints READY or TIMEOUT.
cd "$(dirname "$0")"
for i in $(seq 1 80); do
  out=$(node eval.mjs 2>/dev/null)
  echo "$out" | grep -q '"brain": "Gemma 4 E2B (LiteRT-LM) ready' && { echo READY; exit 0; }
  echo "$out" | grep -q '"consent": true' && node eval.mjs "(document.getElementById('approveModelDownload')?.click(),1)" >/dev/null
  sleep 3
done
echo TIMEOUT; node eval.mjs
