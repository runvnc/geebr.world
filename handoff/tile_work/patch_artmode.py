"""Add ?art=1 'art review mode' - skips the multi-GB LLM download/load and the
Pocket-TTS worker so the renderer can be screenshotted quickly.

Also adds window.GEEBR_ART_MODE for anything else that wants to opt out.
"""
import io

# ---------------------------------------------------------------- preflight.js
# Define the flag as early as possible so every later script can read it.
Q = '/files/geebr.world/app/preflight.js'
t = io.open(Q, encoding='utf-8').read()
OLD = "(() => {\n  'use strict';\n\n  const scripts = ["
assert t.count(OLD) == 1, 'preflight header not found'
NEW = """(() => {
  'use strict';

  // ---------------------------------------------------------------------
  // DEV FLAGS (query string). Neither is a supported user path.
  //   ?webgl=1  force the WebGL2 engine (headless swiftshader advertises
  //             WebGPU then loses the device, so WebGPU-only gating makes the
  //             app impossible to screenshot for art review)
  //   ?art=1    ART REVIEW MODE: skip the ~3 GB LiteRT model download/load and
  //             the Pocket-TTS worker, so the scene renders in seconds
  // ---------------------------------------------------------------------
  const _q = new URLSearchParams(location.search);
  window.GEEBR_ART_MODE = _q.has('art');
  window.GEEBR_FORCE_WEBGL = _q.has('webgl');
  if (window.GEEBR_ART_MODE) console.warn('GEEBR: art review mode - LLM and TTS disabled');

  const scripts = ["""
t = t.replace(OLD, NEW)
io.open(Q, 'w', encoding='utf-8').write(t)
print('preflight.js: art-mode flag added')

# ------------------------------------------------------------------ tts-ui.js
R = '/files/geebr.world/app/tts/tts-ui.js'
u = io.open(R, encoding='utf-8').read()
OLD2 = "    if(tts.wasLoaded() || localStorage.getItem('geebrTtsEnabled')==='1'){"
assert u.count(OLD2) == 1, 'tts autoload branch not found'
NEW2 = ("    if(window.GEEBR_ART_MODE){\n"
        "      $('ttsStatus').textContent='Pocket-TTS disabled (art review mode)';\n"
        "    } else if(tts.wasLoaded() || localStorage.getItem('geebrTtsEnabled')==='1'){")
u = u.replace(OLD2, NEW2)
io.open(R, 'w', encoding='utf-8').write(u)
print('tts-ui.js: autoload gated')

# ------------------------------------------------------- world-integration.js
S = '/files/geebr.world/app/llm_js/world-integration.js'
v = io.open(S, encoding='utf-8').read()
OLD3 = """  let shouldLoad = cached;
  if (!cached) {"""
assert v.count(OLD3) == 1, 'shouldLoad branch not found'
NEW3 = """  let shouldLoad = cached;
  if (window.GEEBR_ART_MODE) {
    // Art review mode: never touch the multi-GB model, the renderer is what we
    // are looking at. Buttons stay disabled.
    shouldLoad = false;
    setStatus('local brain disabled (art review mode)');
    appendLog('art review mode: LLM load skipped');
  } else if (!cached) {"""
v = v.replace(OLD3, NEW3)
io.open(S, 'w', encoding='utf-8').write(v)
print('world-integration.js: LLM autoload gated')

# ------------------------------------------------------------------- app.js
# Route createEngine through the preflight flag rather than re-parsing the qs.
P = '/files/geebr.world/app/app.js'
s = io.open(P, encoding='utf-8').read()
OLD4 = "  if(new URLSearchParams(location.search).has('webgl')){"
assert s.count(OLD4) == 1
s = s.replace(OLD4, "  if(window.GEEBR_FORCE_WEBGL || new URLSearchParams(location.search).has('webgl')){")
io.open(P, 'w', encoding='utf-8').write(s)
print('app.js: createEngine uses GEEBR_FORCE_WEBGL')
