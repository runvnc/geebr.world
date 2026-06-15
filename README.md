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
