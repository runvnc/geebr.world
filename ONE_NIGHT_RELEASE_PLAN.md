# Geebr.world Morning Release Handoff — July 12, 2026

## Current objective

The demo is recorded. Stop modifying the platform unless a defect prevents publication.

The remaining job is:

> Verify the APNG, preserve its evidence, publish Incident 01 this morning, and ask people what task the Geebr should attempt next.

## Current status

### Demo artifact

- A working APNG demo has been recorded.
- The recorder captures the Babylon/WebGPU world canvas at 6 FPS, up to 960px wide, for up to 45 seconds.
- Visible Geebr speech bubbles are now composited into the APNG frames.
- Bubble text is explicitly rendered white for readability.
- The APNG embeds its initial setup in a PNG `tEXt` chunk named `geebr.world.initial-state`.
- The embedded data includes:
  - Geebrs, positions, and facing;
  - brain configuration;
  - props and blocks;
  - enabled commands;
  - history and turn state;
  - camera orientation and zoom;
  - coordinate/terrain convention;
  - exact initial perception/ASCII map;
  - recording dimensions, frame count, FPS, and duration.

### APNG state restoration

- **World setup** now has a **Load incident state** drop area.
- A visitor can drag in or select a Geebr `.png`/`.apng`.
- The loader extracts `geebr.world.initial-state` and restores:
  - Geebrs and facing;
  - object placement and state;
  - brain settings;
  - available commands;
  - history and turn index;
  - camera framing and zoom.
- It restores the initial setup, not animation playback.
- Invalid files and PNGs without Geebr metadata show an inline error.
- The APNG state-loader workflow has been successfully tested.

### Compass, movement, map, and terrain

The validated display convention is:

- North = `-Z`
- South = `+Z`
- East = `-X`
- West = `+X`

Current behavior:

- The circular compass uses the conventional layout:
  - N top
  - E right
  - S bottom
  - W left
- The HUD reports camera and selected-Geebr facing, for example:
  - `camera N · geebr E · N=-Z E=-X`
- The ASCII map uses W on the left and E on the right.
- The positions of lamps and terrain in the ASCII map have been visually checked against the 3D presentation.
- `walk(east)` now moves toward displayed/map east.
- `walk(west)` now moves toward displayed/map west.
- Geebr-facing labels use the same convention.
- The ASCII map now shows the procedural terrain:
  - `:` dirt/path
  - `~` water
  - `^` stone/quarry
  - `,` grass
- The available-command checkboxes resynchronize after APNG/local-state restoration and match the commands shown in the prompt.

### Demo world

- Fresh/reset state is a clean terrain canvas with one generated Geebr.
- The old generic RPG cast, buildings, border walls, and random props are not spawned by default.
- Generated Geebr assets live under `assets/models/characters/generated/`.
- The live model is `geebr_rigged.glb`.
- Walking animation comes from `geebr_walking.glb`.
- Walking, facing, settlement, shadows, and collisions are working.
- The model UI supports only the intended Gemma 4 E2B LiteRT-LM configuration.
- Human chat echoing was corrected.
- Perception has a widened field of view and only large structures occlude line of sight.

## Version control

Latest pushed commit:

- `427e3a9 finish incident demo compass and APNG state workflow`
- Branch: `main`
- Remote: `origin` (`runvnc/geebr.world`)

Uncommitted work after that commit:

- `recorder.js`: composite visible speech bubbles into recorded APNG frames and force white bubble text.

Before committing, run:

```bash
cd /files/geebr.world
git status --short
git diff --check
git diff -- recorder.js
```

If the recorded APNG confirms readable white speech text, commit and push this focused recorder change.

Suggested commit:

```bash
git add recorder.js
git commit -m "include speech bubbles in APNG recordings"
git push origin main
```

## Immediate next steps

### 1. Verify the final APNG — maximum 5 minutes

Open the recorded artifact and confirm:

- it animates;
- the intended incident is understandable without narration;
- speech bubbles appear when expected;
- speech text is white and readable;
- no important action is hidden by the crop;
- the clip is not unnecessarily long;
- the file uploads successfully to the intended destination.

Then test its embedded setup once:

1. Change or reset the current world.
2. Drop the APNG into **Load incident state**.
3. Confirm the original Geebr, lamps/objects, commands, and camera framing return.

Do not rerecord merely for cosmetic perfection. Rerecord only if the incident is confusing, unreadable, or technically broken.

### 2. Preserve the evidence

Save a short text or Markdown file beside the APNG containing:

- **Title:** Incident 01: Follow the Lamps to the Water
- **Goal:** the exact goal used in the run
- **Model:** Gemma 4 E2B LiteRT-LM
- Thinking mode: on or off
- Enabled commands
- Vision radius
- Whether the ASCII map was enabled
- Exact initial perception/map
- Exact command sequence from History
- Result or failure type
- A one-sentence interpretation

The APNG metadata preserves provenance and enables restoration, but the public post still needs visible text because most viewers will not inspect PNG metadata.

### 3. Prepare the public incident

Recommended title:

> Incident 01: Follow the Lamps to the Water

Use this compact structure:

1. **Goal**
2. **Available actions**
3. **What it saw**
4. **What it decided**
5. **What happened**
6. **Result/failure type**
7. **One- or two-sentence interpretation**
8. **APNG**

Suggested post copy:

> I built a small 3D world where a Gemma-powered character sees a compass-labeled ASCII map and can issue only constrained actions. Rather than wait until the whole platform is finished, I’m publishing individual incidents.
>
> For Incident 01, its goal was to follow a trail of lamps to the water. It could only use the enabled commands shown below.
>
> [APNG]
>
> It chose: `[exact command sequence]`
>
> `[One-sentence result or interpretation.]`
>
> What simple task should I give the agent next—especially one you expect it to fail?

Keep the explanation short. Do not lead with architecture, project history, or a broad platform pitch.

### 4. Publish this morning

Recommended distribution sequence:

1. Publish a stable Incident 01 page or project post first.
2. Upload the APNG natively to one social account where possible.
3. Share it in two or three genuinely relevant communities:
   - creative coding;
   - generative games;
   - AI agents;
   - browser/local ML;
   - Babylon.js/WebGPU;
   - indie game experiments.
4. Send it directly to 5–10 carefully chosen people who have recently discussed agents, simulations, generative games, embodied AI, or small models.
5. Ask the same concrete question everywhere:
   - **What simple task should I give the agent next—especially one you expect it to fail?**

A new Mastodon account alone will probably have little discovery. If Mastodon is used:

- upload the APNG directly;
- add accurate alt text;
- use only a few relevant hashtags;
- share the post URL through targeted communities and direct outreach.

Do not depend exclusively on Reddit or Hacker News. Targeted Discords/forums and direct messages are more likely to produce useful early responses.

### 5. Measure useful response

Strong signals:

- someone suggests another task;
- someone asks to try the system;
- someone downloads/reloads the incident;
- someone requests another run;
- someone discusses why the Geebr behaved that way;
- someone shares the artifact.

Weak signal:

- “cool” without a request, question, or proposed experiment.

Reply to every substantive response. If someone suggests an easy task, use it for Incident 02 instead of adding another general feature.

## Scope guard

Do not add before publication:

- more models;
- more generated characters or assets;
- pathfinding;
- navigation memory;
- accounts;
- generalized scenario editing;
- recorder timelines or video editing;
- animation replay from APNG;
- platform architecture;
- major UI redesign;
- benchmarking;
- unrelated polish.

Allowed before publication:

- committing the already-tested speech-bubble recorder change;
- correcting the public caption;
- trimming or replacing a genuinely broken recording;
- adding alt text;
- making the artifact upload successfully.

## Key files

- `/files/geebr.world/ONE_NIGHT_RELEASE_PLAN.md`
  - This handoff and release checklist.
- `/files/geebr.world/app.js`
  - World state, generated Geebr, movement, facing, perception, ASCII map, terrain mapping, compass HUD, state restoration, command controls.
- `/files/geebr.world/recorder.js`
  - APNG frame capture, metadata embedding/extraction, incident-state import, speech-bubble compositing.
- `/files/geebr.world/index.html`
  - Main UI, recording controls, World setup, APNG drop area.
- `/files/geebr.world/style.css`
  - Main UI, compass, recorder, and APNG drop-area styling.
- `/files/geebr.world/llm_js/agent-brain.js`
  - Gemma brain and prompt integration.
- `/files/geebr.world/llm_js/world-integration.js`
  - Agent loop, stepping, and human-chat envelope.
- `/files/geebr.world/llm_js/grammar.js`
  - Constrained command grammar.
- `/files/geebr.world/assets/models/characters/generated/`
  - Generated Geebr model, rig, and animation assets.

## Final rule

The technical demo is ready and an APNG has been recorded.

Do not turn this morning into another development session.

> Verify the artifact, commit the final recorder patch, publish Incident 01, ask for the next task, and let real responses choose what happens next.
