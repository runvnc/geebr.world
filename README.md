# geebr.world v14 — Turn-Based LLM Toybox

Based on v13.2 stackfix.

## New in v14

- Turn-based command loop for LLM control.
- One command runs, physics resolves for a short window, then the world settles/freezes.
- Characters no longer use physics impulse walking by default; they step tile-by-tile with deterministic tween motion.
- Character colliders are animated bodies, reducing sliding/momentum drift.
- Props still use physics impulses during a turn, but velocities are zeroed at turn end.
- New UI: turn mode checkbox, turn status, manual settle button.
- Public API kept and extended:

```js
window.runCommand("walk n")
window.executeCommand({ kind: "spell", spell: "fireball" })
window.stepTurn({ kind: "push" })
window.endTurn()
window.getAgentPerception()
```

## Run

```bash
cd geebr_v14_turn_based
python3 -m http.server 8080
```

Open http://localhost:8080


## v14.1 fix

- Fixed turn-based walking snapping back to the original position.
- Character position is now committed to an authoritative `logicalPos` at the end of each tile step.
- The invisible Havok character collider is treated as a follower of the logical tile position instead of the source of truth.
- Public API unchanged: `window.runCommand`, `window.executeCommand`, `window.stepTurn`, `window.endTurn`, `window.getAgentPerception`.

## v14.2 fix

- Characters now rotate to face the direction they are walking.
- Facing is updated for both KayKit rigged characters and fallback procedural Geebrs.
- Perception grid now uses simple line-of-sight occlusion.
- Walls, stone blocks, rubble/rocks, and large solid building pieces block sight.
- The wall/blocking cell itself remains visible, but tiles/objects behind it become `?` / unknown.

Run command remains:

```bash
cd geebr_v14_turn_based
python3 -m http.server 8080
```


## v14.3 patch
- Facing-aware perception cone added
- 1-tile awareness bubble added
- LOS still blocks vision through walls


## v14.4 patch
- Hidden/unseen cells render as blank spaces
- Perception text grid rotates with facing so the top is always forward
- Rows behind the agent stay mostly blank instead of filled with unknown markers


## v14.5 patch
- Perception panel is fixed north-up again
- Hidden cells remain blank spaces
- Facing still controls what is visible, but the text UI no longer rotates with the agent


## Current dev server

Use the custom geebr server on port 8000 so WebLLM model assets can be proxied same-origin:

```bash
cd /files/geebr.world
python3 geebr_server.py 8000
```

Open:

```txt
http://localhost:8000
```

## v14.6 (current)

- Speaking animation now driven by TTS events: `speechstart`/`speechend` from Pocket-TTS set `g.speaking`, play the `talk` rig animation for the real audio duration, and oscillate the head bone Y-scale (~14Hz) as a mouth flapping effect.
- `say()` calls `geebrTTS.speak()` when TTS is loaded; falls back to a 900ms talk pose otherwise.
- Speech bubbles now use a fixed 42px screen-space offset above the projected head (was fixed world-space 1.7 units that drifted with ortho zoom). APNG recorder unaffected.
- All 8 KayKit animation packs are loaded (General, MovementBasic, MovementAdvanced, CombatRanged, CombatMelee, Tools, Simulation, Special).
- New `emote(name)` command: dance, laugh, sit, wave, clap, cheer, sleep, bow. Mapped to real KayKit clips (Cheering, Sit_Floor_*, Lie_*, Waving, Interact, Push_Ups, Sit_Ups, Use_Item).
- LLM agents see `emote(name)` in their command examples and can use it like any other command.
- Dead root-level duplicates removed (`app.js`, `style.css`, `recorder.js` at repo root; live copies under `app/`).

