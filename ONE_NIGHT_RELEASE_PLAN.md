# Geebr.world Night-of Handoff — July 12, 2026

## Objective

Publish one short, understandable visual incident tonight. Do not finish or broadly launch the platform.

The artifact is a 10–25 second APNG showing one Gemma E2B-powered Geebr attempting a simple task in the 3D world, accompanied by its exact goal, perception, and command sequence.

Success means several strangers engage substantively, suggest another task, request another incident, or ask to try it.

## Current product state

### Character

- A new original teal/ochre Geebr was generated using fal:
  1. FLUX.2 Pro concept image.
  2. Meshy v6 image-to-3D.
  3. Meshy auto-rigging.
  4. Walking/running exports.
- Generated assets are under `assets/models/characters/generated/`.
- The live model is `geebr_rigged.glb`; `geebr_walking.glb` supplies walking animation.
- Generated Geebrs have working facing, walking, collisions, shadows, local portrait lights, and a reduced 0.72-unit step.
- Walk settlement was corrected from 200 ms to 520 ms, eliminating mid-step teleporting.

### Clean demo startup

- Fresh/reset state is a clean terrain canvas with exactly one generated Geebr.
- The generic KayKit RPG cast, buildings, border walls, and random props are no longer spawned at startup.
- Existing saved worlds still restore; click Reset state to obtain the clean default.
- Reset state creates one Geebr at the center.
- Spawn dropdown defaults to Geebr.
- Click-to-spawn works via an invisible pick plane because visible terrain is intentionally non-pickable.

### Model/UI

- Only the default Gemma 4 E2B LiteRT-LM option remains.
- The model selector was removed.
- Human chat echoing was fixed: `Tom says: ...` is explicitly treated as speech addressed to the agent, and prompts instruct the model to answer meaning rather than copy the utterance into `say()`.

### Perception

- Default radius is 7 tiles, producing a 15×15 map; UI alternatives are 11×11 and 17×17.
- Peripheral vision was widened roughly 35%.
- Small props no longer cast unrealistic blind wedges.
- Only large structures (wall, bakery, shrine plinth) occlude line of sight.
- Lamps, barrels, crates, rocks, and rubble remain visible but do not block water or other scenery behind them.
- World convention is explicit:
  - North = -Z
  - South = +Z
  - East = +X
  - West = -X
- The compass-labeled ASCII map uses the same convention.

### Camera/presentation

- Close zoom is supported down to orthographic half-width 0.82.
- Lighting includes stronger directional modeling, restrained local warm key/cool rim lights, studio environment reflections, and modest contrast/exposure.
- A live upper-right compass HUD has just been implemented locally:
  - rotating N/E/S/W rose aligned to world axes;
  - north highlighted red;
  - nearest camera-facing cardinal direction;
  - explicit `N=-Z E=+X` label.
- The compass change passes source checks but is NOT committed at the time of this handoff and needs a browser visual test.

### Recorder

- The APNG incident recorder captures only the Babylon canvas at 6 FPS, up to 960px wide, max 45 seconds.
- It embeds initial state JSON in PNG metadata (`geebr.world.initial-state`).
- Recording is synchronized to Babylon rendering/WebGPU readback.

## Version control

Latest pushed commit:

- `339fc01 add generated Geebr and simplify demo world`
- Branch: `main`
- Remote: `origin` (`runvnc/geebr.world`)

Uncommitted work after that commit:

- `app.js`: compass convention comments, full-name direction aliases, rotating compass HUD.
- `style.css`: compass HUD styling.

Before continuing, run:

```bash
cd /files/geebr.world
git status --short
git diff --check
git diff
```

Do not commit `.env`; it is ignored. The fal API key appeared in chat/tool history and should eventually be rotated.

## Immediate next steps

### 1. Verify compass — maximum 10 minutes

Hard-refresh and orbit the camera.

Confirm:

- the HUD is visible and does not overlap important controls;
- N/E/S/W rotate correctly as the camera orbits;
- `walk(north)` moves toward world -Z and toward the map's N side;
- `walk(east)` moves toward +X and the map's E side;
- the character faces its direction of travel.

In the new session, add the selected Geebr's facing to the HUD, for example:

> camera E · geebr N · N=-Z E=+X

Optionally add a small ground arrow at its feet. Then issue one controlled
`walk(east)` and verify:

- the HUD says `Geebr E`;
- it moves toward +X;
- from a camera facing E, you see its back.

If correct, commit and push only the compass change. If the rose rotates backward, fix its angle sign; do not redesign it.

### 2. Smoke-test clean demo state — maximum 10 minutes

Click Reset state and verify:

- one Geebr;
- no RPG cast/random objects;
- click-to-spawn works;
- walking works without snapping;
- human questions are answered rather than echoed;
- perception sees through lamps/barrels;
- recorder downloads a working APNG.

Fix only launch blockers.

### 3. Capture Incident 01

Preferred experiment:

> Goal: Follow the lamps to the water.

Suggested setup:

- one Geebr;
- spawn a short sequence of lamps leading toward the water;
- enable only `walk` initially (optionally `say` if verbal commentary improves the artifact);
- give a concrete goal;
- frame Geebr, lamps, and eventual water in a legible camera view;
- start recording before the first model turn;
- step manually to keep the sequence understandable;
- stop once success, circling, reversal, fixation, or another clear pattern appears;
- target 10–25 seconds.

The recent perception changes were specifically made so lamps serve as landmarks without blocking the water behind them.

### 4. Preserve evidence

Save alongside the APNG:

- exact goal;
- exact initial perception/map;
- exact command sequence;
- model: Gemma 4 E2B LiteRT-LM;
- thinking setting;
- enabled commands;
- compass/radius settings;
- one-sentence failure or success interpretation.

### 5. Publish one incident

Possible title:

> Incident 01: Follow the Lamps to the Water

Use this structure:

- Goal
- Available actions
- What it saw
- What it decided
- What happened
- Failure type or result
- One or two sentence explanation
- APNG

Close with:

> What simple task should I give the agent next—especially one you expect it to fail?

One incident is enough. Do not wait for three.

## Scope guard

Do not add tonight:

- more models;
- accounts or persistence systems;
- generalized scenario editing;
- another character redesign;
- more generated assets;
- pathfinding;
- navigation memory;
- recorder editing/replay tooling;
- major UI redesign;
- platform architecture.

Allowed changes are limited to truthful capture blockers, camera framing, captions, reset/setup simplification, and a tiny compass correction if required.

## Key files

- `/files/geebr.world/app.js` — world, character import, movement, perception, compass.
- `/files/geebr.world/index.html` — UI and perception radius choices.
- `/files/geebr.world/style.css` — UI and compass styling.
- `/files/geebr.world/recorder.js` — APNG recorder.
- `/files/geebr.world/llm_js/agent-brain.js` — single supported model.
- `/files/geebr.world/llm_js/world-integration.js` — agent turns and human chat envelope.
- `/files/geebr.world/llm_js/grammar.js` — constrained command grammar and anti-echo instruction.
- `/files/geebr.world/assets/models/characters/generated/` — generated Geebr source/model/rig/animations.

## Final rule

The platform is now good enough to produce evidence. Verify the compass, commit it, capture the lamp-to-water run, and publish the first incident before making anything else.
