# geebr.world Sandbox & State Sharing Plan

## 1. Current State Analysis

### 1.1 State Persistence
**Finding: No persistence exists.** All state is in-memory only and lost on page refresh.

- `state` object in `app.js` holds everything: scene, engine, geebrs, blocks, props, tiles, meta, held, allowed, turn, globalHistory, brainConfigs, nextSpawnId, spawnMode
- No `localStorage`, `sessionStorage`, or `IndexedDB` usage anywhere
- `clearWorld()` wipes everything with no backup
- `geebr_server.py` is a static file server + HF proxy — no server-side state

### 1.2 Customization Options

**World/Environment:**
- Hardcoded procedural terrain (grass, dirt, stone, water, path, quarry) via `buildWorld()` + `addTerrainPolish()`
- Hardcoded prop placements via `addRealPropPass()` (23 fixed GLTF props) + `scatterRealProps()` (12 random)
- Hardcoded character cast: gib (Rogue_Hooded), momo (Mage), zap (Ranger) via `createAgentCast()`
- User can spawn objects (geebr, crate, barrel, wall, mushroom, lamp) via buttons or click-to-spawn
- User can clear the map
- **No environment editor, no terrain customization, no saveable layouts**

**Agents/Geebrs:**
- Brain style: 6 presets (helpful idiot, builder, fireball goblin, coward, reckless mage, nervous mushroom)
- Body style: 3 types (goblin, mushroom, bot) — cosmetic only for procedural; KayKit model for rigged
- Fireball temptation slider (0-100)
- Chaos slider (0-100)
- Quest text field (set by world/human)
- Current goal (set by agent via `goal()` command, readonly)
- Personality textarea
- Allowed commands checkboxes (18 commands)
- Brain enabled toggle
- Chat test mode toggle
- **No agent templates, no save/load**

### 1.3 Agent State Handling

- `state.brainConfigs` Map stores per-agent config in-memory:
  - `enabled`, `style`, `personality`, `fireballTemptation`, `chaos`, `quest`, `goal`, `giveQuest`, `messages` (conversation history, capped at 20), `recent` (recent actions, capped at 6)
- `state.globalHistory` stores last 20 turn actions
- `state.held` Map tracks carried objects
- Agent conversation history is shared between agents (actions of one agent are injected into others' message arrays)
- All agent state lost on refresh

---

## 2. Proposed Architecture

### 2.1 State Serialization Layer

A `ScenarioSerializer` module that captures the full world + agent state into a JSON object:

```json
{
  "version": 1,
  "name": "My Experiment",
  "createdAt": "2026-06-29T18:00:00Z",
  "world": {
    "terrainSeed": null,
    "objects": [
      { "type": "crate", "x": 2, "z": 3, "state": "intact", "health": 2, "material": "wood", "flammable": true },
      { "type": "wall", "x": 5, "z": -3, "state": "cracked", "health": 1, "material": "stone" }
    ],
    "camera": { "targetX": 0, "targetZ": 0, "orthoHalfWidth": 12.5 }
  },
  "agents": [
    {
      "id": "gib",
      "modelFile": "Rogue_Hooded.glb",
      "x": -1, "z": -0.7,
      "dirX": 0, "dirZ": -1,
      "style": "rogue",
      "traits": { "fireball": 78, "obedience": 48 },
      "brain": {
        "enabled": true,
        "style": "reckless mage",
        "personality": "goofy, curious...",
        "fireballTemptation": 78,
        "chaos": 55,
        "quest": "",
        "goal": "",
        "messages": [...],
        "recent": [...]
      }
    }
  ],
  "settings": {
    "allowedCommands": ["walk", "say", "look", ...],
    "turnMode": true,
    "resolveMs": 200,
    "visionRadius": 5,
    "spawnMode": { "enabled": false, "type": "geebr" }
  }
}
```

**Serialization approach:** Capture the *result* of world generation + user modifications, not the generation parameters. This is simpler and more flexible. A `terrainSeed` field is reserved for future seeded-generation support.

**Key objects to serialize:**
- `state.props` → objects with type, position, state, health, material, flammable, soft (from `meta` Map)
- `state.blocks` → same as props
- `state.geebrs` → agents with position, direction, style, traits, brainConfig
- `state.allowed` → allowed commands Set
- `state.turn` → turn settings (mode, resolveMs)
- Camera position/zoom

### 2.2 Storage Layer

**Auto-save (localStorage):**
- Debounced auto-save every 5 seconds when state changes (turn resolution, object spawn, config edit)
- Key: `geebr_world_autosave` — single most-recent state
- On page load: check for autosave, prompt user to restore or start fresh

**Named Scenarios (localStorage):**
- Key: `geebr_world_scenarios` — JSON array of saved scenario names + metadata
- Key: `geebr_world_scenario_{name}` — full scenario JSON
- Scenario manager UI: save, load, delete, duplicate, rename
- Default scenario: "Default" (the current hardcoded world)

**Storage budget:**
- localStorage limit ~5-10MB per origin
- A typical scenario with 50 objects + 3 agents + 20 messages each ≈ 15-30KB
- Can store 100+ scenarios comfortably
- If conversation histories grow, consider IndexedDB migration (future)

### 2.3 Export/Import Layer

**Export button** (in World setup panel):
- Serializes current state to JSON
- Two options: **Download** (saves `.geebr` file) and **Copy to Clipboard**
- Checkbox: "Include conversation history" (default: on; off = compact setup-only export)
- File format: `.geebr` (JSON with `version` field for forward compatibility)

**Import button** (in World setup panel):
- Two options: **Upload File** (file picker for `.geebr` files) and **Paste JSON** (textarea)
- Validates JSON structure and version
- Confirms before replacing current state (with auto-save backup)
- Reconstructs world: clears current, deserializes objects, spawns agents, restores configs

**Shareable format:**
- The `.geebr` file is plain JSON — can be shared via email, Discord, GitHub, etc.
- Future: URL-encoded compressed state for instant-share links (e.g., `?scenario=eyJ2ZXJzaW9uIjox...`)

### 2.4 Sandbox Isolation

**Scenario Manager** (new panel section):
- Dropdown of saved scenarios
- Buttons: New, Save, Save As, Load, Delete, Duplicate, Export, Import
- Current scenario name displayed in header
- Unsaved changes indicator (asterisk)
- Auto-save is separate from named scenarios (auto-save = crash recovery)

**Sandbox mode concept:**
- Each scenario is an isolated sandbox with its own world layout, agents, and settings
- Switching scenarios clears and reloads the full state
- Running agents are stopped and restarted on scenario switch
- Conversation histories are preserved per-scenario

### 2.5 Environment Customization (Future Phase)

**Terrain edit mode:**
- Click-to-paint terrain types (grass, dirt, stone, water) on the grid
- Brush size selector
- Terrain changes serialized in scenario

**Object palette:**
- Expanded spawn menu with all available prop types
- Drag-to-move placed objects (in edit mode)
- Object properties panel (health, state, material)

---

## 3. Implementation Plan

### Phase 1: State Serialization & Auto-save
**Files:** New `llm_js/scenario.js` module; modifications to `app.js` and `world-integration.js`

1. Create `ScenarioSerializer` class:
   - `serialize(includeHistory=true)` → returns scenario JSON object
   - `deserialize(json)` → validates and returns state reconstruction plan
   - `serializeObject(mesh)` → helper for individual props/blocks
   - `serializeAgent(geebr)` → helper for individual agents

2. Add auto-save to `app.js`:
   - Debounced `autoSave()` function called after turn resolution, object spawn, clear
   - `loadAutoSave()` on startup with restore prompt

3. Add `installScenarioAPI()` to `app.js`:
   - Expose `geebrWorld.serialize()`, `geebrWorld.deserialize()`, `geebrWorld.loadScenario()`

### Phase 2: Export/Import UI
**Files:** `index.html`, `style.css`, `llm_js/scenario.js`

1. Add export/import buttons to World setup panel in `index.html`:
   ```html
   <div class="row setup-row">
     <button id="exportScenario" type="button">export</button>
     <button id="importScenario" type="button">import</button>
   </div>
   <label><input id="exportIncludeHistory" type="checkbox" checked /> include chat history</label>
   ```

2. Implement export in `scenario.js`:
   - Download: create Blob, trigger download with `geebr-world-{name}.geebr`
   - Clipboard: `navigator.clipboard.writeText(json)`

3. Implement import in `scenario.js`:
   - File upload: hidden `<input type="file">` with `.geebr` accept filter
   - Paste: modal with textarea + load button
   - Validation: check `version`, required fields, object types
   - Reconstruction: `clearWorld()` → deserialize objects → spawn agents → restore configs

### Phase 3: Named Scenarios & Scenario Manager
**Files:** `index.html`, `style.css`, `llm_js/scenario.js`

1. Add scenario manager UI section to `index.html`:
   ```html
   <details class="panel-section">
     <summary>Scenarios</summary>
     <select id="scenarioSelect"></select>
     <div class="row">
       <button id="newScenario">new</button>
       <button id="saveScenario">save</button>
       <button id="loadScenario">load</button>
       <button id="deleteScenario">delete</button>
     </div>
   </details>
   ```

2. Implement scenario CRUD in `scenario.js`:
   - `saveScenario(name)` — serialize + store in localStorage
   - `loadScenario(name)` — read from localStorage + deserialize
   - `deleteScenario(name)` — remove from localStorage
   - `listScenarios()` — return array of saved scenario names
   - Refresh dropdown on save/delete

### Phase 4: Agent Templates (Future)
- Save configured agent as template (without position/history)
- Template library in localStorage
- Spawn from template instead of default config
- Export/import templates separately

### Phase 5: Environment Editor (Future)
- Terrain paint mode
- Expanded object palette
- Drag-to-move in edit mode
- Object property inspector

---

## 4. Technical Considerations

### 4.1 Serialization Challenges

**Physics bodies:** Cannot serialize Babylon.js physics bodies directly. Must serialize logical state (position, type, health) and reconstruct physics on load.

**Mesh references:** `state.held` Map references mesh objects. Serialize as `{ agentId: objectIndex }` and resolve after reconstruction.

**Animation state:** Current animation (idle/walk/panic) is transient — don't serialize. Reset to idle on load.

**KayKit rigged characters:** Serialize the `modelFile` field (e.g., `Rogue_Hooded.glb`) and re-import on load. Animation groups are cloned per-agent on creation.

### 4.2 Deserialization Order

1. Clear current world (`clearWorld()`)
2. Rebuild terrain (currently hardcoded — future: from serialized terrain data)
3. Spawn objects in order: blocks first (walls, rocks), then props (crates, barrels, etc.)
4. Spawn agents (import GLTF models, set positions, restore brain configs)
5. Restore settings (allowed commands, turn mode, camera)
6. Restore held-object relationships
7. Update UI (refresh agent select, perception, turn status)

### 4.3 Backward Compatibility

- `version` field in scenario JSON allows migration
- Unknown fields are ignored on load
- Missing fields fall back to defaults
- Future terrain editor data won't break older scenarios (terrain stays procedural)

### 4.4 Performance

- Serialization: iterate ~50-100 objects + 3-10 agents → <5ms
- Auto-save: debounced 5s, JSON.stringify ~30KB → <1ms
- localStorage write: ~30KB → <1ms
- Deserialization: clear + rebuild ~100 objects + agents → ~2-5s (GLTF loading is the bottleneck)

---

## 5. UI Mockup

```
┌──────────────────────────────────┐
│ geebr.world v15 sandbox          │
├──────────────────────────────────┤
│ ▸ Scenarios                      │
│   [Default ▾] [new] [save] [load]│
│   [export] [import] [☐ history]  │
│                                  │
│ ▸ World setup                    │
│   ...existing controls...        │
│                                  │
│ ▸ Agent customization            │
│   ...existing controls...        │
│                                  │
│ ▸ Agent info & prompt            │
│   ...existing controls...        │
└──────────────────────────────────┘
```

---

## 6. Summary

| Feature | Current | Planned | Phase |
|---------|---------|---------|-------|
| State persistence | None | Auto-save to localStorage | 1 |
| World export | None | `.geebr` file download/clipboard | 2 |
| World import | None | File upload/paste JSON | 2 |
| Named scenarios | None | Multiple saved setups | 3 |
| Agent state export | None | Included in scenario JSON | 2 |
| Agent templates | None | Saveable agent configs | 4 |
| Terrain editor | Hardcoded | Paint terrain types | 5 |
| Object palette | 6 types | All prop types | 5 |
| Shareable links | None | URL-encoded state | Future |