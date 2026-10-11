# geebr.world notes for Claude

- **Commit and push after every set of edits** (untested is fine; the user wants
  everything saved incrementally).
- Dev server: `python3 geebr_server.py 8000` → `http://localhost:8000/app/`.
- Cache busting: modules and assets load with `?v=` strings (see
  `app/preflight.js` and the `import ... ?v=` lines in `app/llm_js/`). Bump the
  version of every changed file, and of every importer up the chain, so all
  importers share one module instance.
- **Testing in a real browser:** `tools/browser-test/README.md`, a dedicated
  Chrome profile driven over the DevTools protocol with the real WebGPU model
  (`launch-chrome.sh`, `wait-ready.sh`, `eval.mjs`, `runtests.mjs`).
  Headless/snap Chromium does not work in Claude's sandbox; Google Chrome does.
- Scenario system (format, map language, layout, goals, links, tactic tester):
  `docs/SCENARIOS.md`.
- LiteRT-LM's web engine has a single KV cache: only one conversation may be
  live at a time (`app/llm_js/litert-worker.js` rebuilds others from history).
