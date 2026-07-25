# geebr.world — Rendering / Material Quality — HANDOFF

---

## LATEST SESSION UPDATE — 2026-07-25 ~17:15 UTC

**This section supersedes all stale status, priorities, and terrain-height notes below. Read this section first; use the rest only for durable pipeline background.**

### Current git / working-tree state

- Committed HEAD remains `60d489f` (`update rendering handoff after grass integration`).
- **Everything in this update is on disk but UNCOMMITTED.**
- Modified: `app/app.js`, `app/look.js`, `app/terrain-hd.js`.
- New: `app/prop-review.html`.
- New final runtime assets: `assets/models/props/gen/blade_cluster.glb`, `daisy_clump.glb`.
- New source/pipeline files: `handoff/tile_work/asset_blade_cluster.png`, `asset_daisy_clump.png`, `p_blade_cluster.txt`, `p_daisy_clump.txt`, `tripo_one.py`, and `handoff/tile_work/generated/` with raw/baked intermediate GLBs.
- `deno check --no-lock app/app.js app/terrain-hd.js app/look.js` passes.

### User art-workflow decision — LOCKED

All visible assets, including tiny vegetation props, must originate from the **master reference through image editing**, not hand-authored substitute geometry/textures:

`master/reference crops -> gpt-image-1 edit2.py -> Tripo -> bake.py -> mandatory orm.py -> integration`

The built-in `edit_image` currently routes to `gpt-image-2` and rejects `input_fidelity`. Use `handoff/tile_work/edit2.py`, which explicitly calls `gpt-image-1` with `input_fidelity='high'`.

### Approved reference-derived vegetation

Generated from the master plus `ref_grass_a.png` / `ref_grass_b.png`:

- `asset_blade_cluster.png`: chunky low-poly olive/moss blade cluster.
- `asset_daisy_clump.png`: two chunky ivory daisies with yellow centers.

Processed outputs:

- `assets/models/props/gen/blade_cluster.glb`
  - Tripo limit 2200; 2213 vertices / 2159 faces.
  - ~2.17 MB; real AO; roughness .88; metallic 0.
- `assets/models/props/gen/daisy_clump.glb`
  - Tripo limit 2500; 1866 vertices / 2500 faces.
  - ~1.59 MB; real AO; roughness .88; metallic 0.

`tripo_one.py IMAGE OUTPUT FACE_LIMIT` was added because `cmp.py` hardcodes 6000 faces.

`app/prop-review.html` is a WebGPU review page for both props. The user's laptop supports WebGPU but desktop Chrome reports WebGL unsupported:

`http://localhost:8791/prop-review.html?webgpu=1`

### Vegetation integration

`terrain-hd.js::buildVegetation()` now imports the generated GLBs, normalizes them from bounds, scatters deterministic patch-density clones, and merges by type:

- many cells bare,
- normal cells 1–2 blade clusters,
- a few dense cells 3–4,
- daisies only in selected patches,
- deterministic six-mode 3D orientation (upright, sideways, inverted, and two strong leans), random yaw, and ±10% scale,
- **no color jitter**.

Current scales: blade `.50`, daisy `.42`. Output meshes: `hd_generated_blade_clusters`, `hd_generated_daisy_clumps`.

**Late correction:** the generated vegetation was initially placed at absolute `y=.026`, so it was buried under the imported grass top (`y=.442`). It now uses `(API.state.terrainTopY??0)+.018`. Verified in `/tmp/geebr_veg_height_final.jpg`: blade clusters and daisies are clearly visible across the island. A later orientation investigation found two real Babylon issues: imported clones retained an identity `rotationQuaternion`, so Euler `rotation.set(...)` was ignored; and merging complicated transform verification. Final fix keeps the clones separate and assigns `rotationQuaternion=BABYLON.Quaternion.FromEulerAngles(...)` across six distinct 3D modes. Verified at a close ~6x6-tile view in `/tmp/geebr_vegpatch.jpg`: sideways, inverted, upright, and leaning forms are visibly different. **Final art correction:** six-mode orientation remains for daisies, but blade clusters are upright-only with random yaw and a gentle single-axis lean; sideways/inverted grass looked trampled.

Thin instances were attempted but imported-GLB root/prototype visibility and transform behavior was unreliable. Clone+merge is the proven temporary path. Optimize only after appearance is locked, using normalized prototype containers.

### Terrain changes

1. **Dirt trenches removed.** `proceduralTerrainAt()` now returns grass for every in-island cell. Future paths must be surface dressing over grass, never removed/lower foundation cells.
2. **Tile variation is square-safe.** Arbitrary yaw caused overlaps/corner voids. Current deterministic D4 transforms use quarter-turn yaw plus independent X/Z mirrors at scale magnitude `1.006`, giving eight stable orientations.
3. **Edge junk removed.** Deleted the 96 procedural `hd_rim_rock` chunks. Edge remains plain pending the proper reference-derived cliff.
4. **Measured terrain top:** mesh maximum `y=0.442002...`; authoritative `state.terrainTopY=.445`.

### Burial fixes

#### Geebrs / gameplay

`setGeebrLogicalPosition()` and `animate()` were resetting root Y to zero every frame. They now use `state.terrainTopY` for:

- logical placement,
- walking interpolation,
- collider target (`terrainTopY + .74`),
- preview/generated character placement,
- dig-hole placement.

The invisible Havok ground is at `terrainTopY - .005`.

#### HD fences / crates / sign / tent / lantern

These were authored in `terrain-hd.js::buildScenery()` at old ground zero. Their `hd_` names caused the generic lift to skip them. `buildScenery()` now explicitly lifts:

- `hd_posts`,
- `hd_rails`,
- `hd_planks` (sign + decorative crates),
- `hd_tent_cloth`,
- lantern cage, bulb, and light.

Runtime bounds now show posts/planks beginning at `.445`; tent bottom moved from `.294` to `.739`. User confirmed this is fixed.

### Selection-ring fix

Babylon's torus is horizontal by default; old `rotation.x=Math.PI/2` stood it upright. It now has rotation `[0,0,0]`.

- ring Y: `terrainTopY + .035`
- glow disc Y: `terrainTopY + .018`

Runtime: Geebr root `.445`, ring `.480`, disc `.463`. User confirmed.

### Shared-look cleanup

`app/look.js` defaults now match live locked values:

- detail `.11`
- exposure `1.28`
- contrast `1.10`

SSAO remains strength `2.2`, radius `.9`, samples 16, maxZ 60.

### Latest verification

Latest broad render: `/tmp/geebr_scenery_lift_final.jpg` (ephemeral). It confirms continuous grass, clean edge, raised scenery/Geebr, horizontal ring, and generated vegetation.

Last `shot_fast.py` run at 800×550:

- ready ~12.1 s; total ~21 s,
- 50 meshes / 67 materials,
- pipelines `[drp, ssao]`,
- SSAO 2.2/.9,
- DOF active,
- art mode active; TTS skipped.

Server may need restarting:

`python3 -m http.server 8791 --directory /files/geebr.world/app`

### Immediate next session

1. **Inspect and commit this completed batch.** Suggested commits:
   - vegetation source images + final GLBs + helper/review page,
   - terrain/vegetation/height/ring/scenery code fixes,
   - handoff.
   Decide whether to retain raw/baked `handoff/tile_work/generated/` intermediates; final GLBs/source PNGs definitely stay.
2. Build the **reference-derived cliff/edge asset**:
   - use `ref_edge.png` and `asset_tile7.png`,
   - matching thin olive cap,
   - two chunky masonry courses, narrow dark seams,
   - square/corner-compatible footprint,
   - Tripo ~8000 faces,
   - measure stone bake gain rather than assuming .60,
   - mandatory `orm.py`,
   - integrate behind a flag before replacing bedrock.
3. Then convert **tree, boulder3, crate**, replacing procedural counterparts rather than layering duplicates.
4. Add path transitions later as separate surface props.
5. Convert grass/vegetation to production thin instances only after visual lock and real-GPU measurement.

### Constraints still locked

- Grass is smooth matte clay/felt, not photoreal/fuzzy.
- No per-instance color tint jitter.
- No extra grass slab variants.
- Never return to procedural grass as final.
- Batch related changes before rendering.
- Use the master-reference edit workflow for every visible new asset.


**Last updated:** 2026-07-25 ~14:30 UTC
**Supersedes:** `ASSET_PIPELINE_HANDOFF.md` (delete it; everything still relevant is folded in below)

Read §0 and §1 first. §2–§6 are the new rendering work. §7 onward is the
unchanged asset pipeline, preserved verbatim in substance.

---

## LATEST SESSION UPDATE — 2026-07-25 ~15:35 UTC

This section supersedes stale status/priority/git statements later in the file.
The deeper diagnosis and pipeline documentation remain valid.

### Current committed state

Two commits were created on `main`:

- `cd7e8c2` — **upgrade clay rendering pipeline and integrate corrected grass tile**
- `baba153` — **tune integrated terrain and deduplicate tile builder**

Working tree was clean immediately after `baba153`. Previous statements saying
“nothing committed” or HEAD `2280484` are obsolete.

### What is now visibly integrated in the REAL app

- `grass_v7_orm.glb` is now the default grass terrain, not merely an isolated
  preview asset. `?procedural=1` restores the old procedural grass for A/B and
  rollback.
- The central `mat()` and `colorMat()` factories now create matte PBR materials
  rather than StandardMaterials. Clay detail is applied at **0.11**.
- Water is explicitly exempt from the generic clay treatment: low roughness,
  stronger environment/specular response, and no clay detail normal.
- SSAO is locked at strength **2.2**, radius **0.9**, samples **16**, maxZ **60**.
- Neutral tonemap is currently exposure **1.28**, contrast **1.10**, with grade.
- GLB grass tiles use deterministic random 90-degree yaw, no colour jitter,
  scale `1.006` to close tiny seams, and a `+0.010` vertical lift.
- `terrain-hd.js` duplicate cleanup is DONE: five `roundedTile()` definitions
  were reduced to one canonical builder exported as `GeebrHD.roundedTile`; the
  duplicate `let dp=0` was removed. Procedural fallback was tested after cleanup.

### Visual verdict

A proper 800x550 GLB-vs-`?procedural=1` comparison was completed. The GLB path is
clearly the right direction: flatter, continuous, matte, desaturated olive, and
closer to the reference. The procedural path is brighter but lime, pillowed, and
visibly tiled. Current GLB render: `/tmp/fal3d/tuned_final.jpg` (ephemeral).
Comparison: `/tmp/fal3d/glb_proc_cmp.jpg` (ephemeral).

The current render is appreciably improved, but still somewhat uniformly olive
and sparse. The next gain is scene-level colour hierarchy/richness, not returning
to procedural grass.

### Fast screenshot pipeline — use this, not old harness timing

`handoff/tile_work/shot_fast.py` is the preferred harness. It uses
`?art=1&webgl=1`, waits for explicit `window.GEEBR_SCENE_READY`, loads the app
once, and captures the WebGL canvas directly. No mesh polling or minute-scale
timeouts. Default normal-review size is **800x550**, JPEG quality 90.

Measured 800x550 one-shot passes: approximately **18–24 seconds wall time**. The
first 3-way 560x385 sweep completed in **26.8 seconds total**. `?art=1` was
verified: meshes 49/50, pipelines `[drp,ssao]`, DOF true, and TTS status
`Pocket-TTS disabled (art review mode)`. The LLM and TTS model loads are skipped.

Current `shot_fast.py` intentionally has one `final` variant. Edit `VARIANTS`
for A/B sweeps. Keep normal judgment shots at 800x550 or larger; use 640x440 only
for rough parameter sweeps, then validate high-resolution. Full images are fine
when needed—optimize context without making visual review unreliable.

### Performance caveat

Headless SwiftShader reports only ~0.3–0.5 fps with post-processing, though an
800x550 review shot still completes in ~20 seconds. The grass integration imports
one GLB, clones all grass cells, then merges them into one rendered mesh. This is
a temporary functional integration, not the final production thin-instance
implementation. Convert repeated grass tiles to thin instances or another
efficient production path after visual placement/scale is locked. Do not judge
real GPU runtime from SwiftShader fps alone.

### Immediate next work, in order

1. Add scene richness and colour hierarchy against the now-correct base:
   separate chunky grass-blade clusters and daisies, with varying density and
   thin instances. No per-instance colour jitter.
2. Improve path/grass transitions and create the cliff/edge tile.
3. Convert the completed 2D concepts for rocks/tree/house/barrel/crate through
   Tripo -> `bake.py` -> mandatory `orm.py`.
4. Replace the temporary merged grass-clone implementation with thin instances.
5. Consider baked vertex AO only if SSAO + ORM AO still leave specific cavities
   weak. It is no longer the immediate priority.
6. Continue using `shot_fast.py` and batch related changes before rendering.

### Important visual constraints still locked

- Grass is smooth matte painted clay/felt, not fuzzy or photoreal.
- Tops are flat with tight bevels and crisp edges; seams are thin and dark.
- Grassiness comes from separate props on top.
- Never return to procedural grass as the final direction.
- No per-instance colour tint jitter and no more grass slab variants.

---

## 0. STOP — read this before doing anything

### 0.1 Context budget kills sessions

Three sessions have now died with Anthropic `413 request_too_large`. Cause:
`examine_image` on full-res PNGs (1.5–3 MB base64 each). Chatlogs of 16–36 MB
exist in `/xfiles/localmr/data/chat/admin/Assistant/`.

**Rules (updated by user):**
- Use judgment rather than a blanket ban on full-resolution images. Inspect a full
  image whenever fine material detail, artifacts, or readability require it.
- For routine comparisons, preserve enough per-panel resolution to judge the
  actual change: normally render at **800×550 or larger**, and avoid shrinking a
  whole scene to a tiny strip merely to hit an arbitrary byte target.
- Use `handoff/tile_work/mk.py` for useful crops/composites, but crop to the
  region under review and retain detail. Compare 2–4 related variants together.
- Prefer JPEG for broad scene comparisons; use PNG/full resolution when subtle
  texture, edge, or post-process artifacts genuinely need it. Optimize context,
  but never so aggressively that visual review becomes unreliable.

### 0.2 Batch your work

User instruction (explicit, this session): do **not** do one tiny step then
render. Renders and image inspection are the expensive part. Make several
related code changes, then do one render/inspect pass. Only isolate a change
when you genuinely cannot attribute a visual result otherwise.

### 0.3 A headless render of the real app takes ~40–90 s

swiftshader is slow. Use the `?art=1` flag (§3.1) and the one-load-many-shots
harness `ab_app.py` (§3.3) rather than reloading the page per variant.

---

## 1. Where we are RIGHT NOW

### Done this session (all on disk, **nothing committed**)

| # | Item | Status |
|---|---|---|
| 1 | Diagnosed the render gap vs the concept art (§2) | ✅ |
| 2 | `orm.py` — ray-traced AO + matte roughness rewrite for Tripo GLBs | ✅ built + run |
| 3 | `glb.py` — full GLB rebuild lib (bake.py could only patch in place) | ✅ |
| 4 | `mkdetail.py` — shared tiling clay-tooth detail normal | ✅ generated |
| 5 | `look.js` — single source of truth for materials + post | ✅ |
| 6 | app.js: SSAO2, real DOF, KHR-neutral tonemap, ColorCurves grade, camera far plane, shadow darkness, clay look on all GLB imports | ✅ |
| 7 | `?webgl=1` dev flag so the app can be screenshotted headless | ✅ |
| 8 | `?art=1` art-review mode — skips LLM + TTS model loads | ✅ **written, NOT yet verified** |

### ▶ IMMEDIATE NEXT ACTION

**Verify `?art=1` actually works and time it.** This was written but the
verification run was cut off.

```bash
cd /files/geebr.world/handoff/tile_work
cp mk.py shot_app.py ab_app.py /tmp/fal3d/ 2>/dev/null
cd /tmp/fal3d
time timeout 400 python3 -u shot_app.py /tmp/fal3d/art_test.png 20
```

Expect: `meshes 49`, `pipelines ["drp","ssao"]`, `dof true`, and **no**
`waiting for model download permission` banner in the screenshot. If the load
is still slow, check whether `waitForDownloadConsent` is still being awaited —
the gate is in `app/llm_js/world-integration.js` around line 257.

Then continue with §6.

---

## 2. The diagnosis — what the reference look actually needs

The master concept render:
`/xfiles/localmr/static/imgs/gpt_image_7fRofQ_FKB_m9w_0.png`

Small viewable copies: `handoff/tile_work/shots/gpt_image_*_v.jpg`,
`shots/zoom_terrain.jpg` (close-up of bare ground + crate + signpost).

| Visual cue in the reference | What produces it |
|---|---|
| Everything reads as matte painted resin | roughness 0.85–0.95, metallic 0, near-zero specular |
| Form readable without harsh light | **strong ambient occlusion** — contact darkening, dark thin seams |
| Soft warm key from upper-left | one directional + broad soft fill, soft shadow |
| Faint clay/felt tooth up close | **subtle detail normal at high tiling** |
| Background softens | mild tilt-shift DOF |
| Teal shadows / warm highlights | a colour **grade**, not raw ACES |
| Crisp tile bevels | geometry, not shading |

The ground in the reference has **essentially no specular highlight**. It is
near-Lambertian with AO doing all the shape work.

### 2.1 MEASURED FACTS about the Tripo GLB (do not re-derive these)

Decoded from `assets/models/tiles/grass_tripo_v7_g60.glb`:

```
Color     4096²  mean RGB [ 90.0, 100.6,  83.6]  std [4.7,  3.9, 17.9]
ORM       4096²  mean RGB [254.8, 124.4,   2.7]  std [0.6, 16.0,  4.7]
NormalGL  4096²  mean RGB [127.6, 126.9, 254.6]  std [2.3,  2.3,  0.9]
```

- **AO (ORM red) = 254.8/255, std 0.6** → Tripo bakes **NO occlusion**. And
  the glTF material did not even declare an `occlusionTexture`, so that
  channel was never read anyway.
- **Normal map std 2.3** → effectively **blank**. All the tile's crispness is
  geometric. *Stop requesting normal maps from Tripo; they're dead weight.*
- **Roughness (ORM green) = 124/255 = 0.49** → semi-gloss. Wrong for matte
  clay. This is why the preview read as linoleum.
- `metallicFactor` was **1.0** with stray non-zero blue-channel pixels.
- Mesh: 4,368 v / 5,994 f, extents 0.996 × 0.841 × 1.000, face-adjacency angle
  mean 9.3°, only 5.2% of edges >30° — a fairly smooth mesh.

### 2.2 What the renderer was missing (before this session)

1. **No AO of any kind.** `grep SSAO` → zero hits. Biggest single gap.
2. **DOF was claimed in a comment but never enabled** (`app.js` ~2205).
3. **Mixed material models** — 50 `StandardMaterial` vs 17 `PBRMaterial` in the
   live scene. StandardMaterial ignores `scene.environmentTexture` for diffuse,
   so those objects sit in a different lighting model than GLB imports.
4. **Tonemap too aggressive** — ACES + contrast 1.34 + exposure 1.34 crushed
   shadows and desaturated the olive greens. No colour grade at all.
5. **Shadow `darkness = 0.06`** — in Babylon 0 is fully black, so shadows were
   nearly opaque, fighting the soft AO-driven look.
6. **`camera.maxZ = 4000`** — destroys depth-buffer precision, which SSAO and
   DOF both depend on. (The sky dome uses `infiniteDistance` so it re-centres
   on the camera; 600 is plenty.)

---

## 3. NEW: dev flags

Both are defined at the top of `app/preflight.js` and exposed as
`window.GEEBR_FORCE_WEBGL` / `window.GEEBR_ART_MODE`.

### 3.1 `?art=1` — ART REVIEW MODE

Skips everything that delays getting pixels on screen:
- **LLM**: `app/llm_js/world-integration.js` — `shouldLoad` forced false, so the
  ~3 GB LiteRT model is neither downloaded nor loaded, and the consent dialog
  is skipped. Logs `art review mode: LLM load skipped`.
- **TTS**: `app/tts/tts-ui.js` — the `wasLoaded() || geebrTtsEnabled` auto-load
  branch is bypassed; status reads `Pocket-TTS disabled (art review mode)`.

**Use `?art=1` for every art/render iteration.**

### 3.2 `?webgl=1` — force WebGL2

Headless swiftshader *advertises* WebGPU, then loses the device
(`Could not retrieve a WebGPU adapter`, `createBuffer size 65536 too large`),
so the app was impossible to screenshot. This flag bypasses both the preflight
adapter gate **and** `createEngine()`.

Not a supported user path — production is still WebGPU-only.

### 3.3 Harnesses (in `handoff/tile_work/`, copy to `/tmp/fal3d/` to run)

| script | purpose |
|---|---|
| `shot_app.py OUT [waits] [extra]` | one screenshot of the **real app** + a JSON probe (mesh/material counts, which pipelines exist, dof, tonemap, exposure, detailMats, pbr/std split, fps) |
| `ab_app.py PREFIX [w] [h]` | **loads the app ONCE** and screenshots several variants by mutating the live scene. Edit the `VARIANTS` list. Use this for tuning — a cold load is ~40–90 s |
| `shot_tile.py FILE.glb OUT N RADIUS '&params'` | the isolated tile preview harness |
| `probe.py URL` | quick capability probe (SSAO supported? babylon version? errors?) |
| `mk.py out.jpg W H CROP img...` | build a small composite for `examine_image` |
| `v.py img.png 640` | downscale one image |

`ab_app.py` exposes `window.P('ssao')`, `window.P('drp')`, `window.S()` in the
page for poking at the live pipeline.

**Gotcha:** `app.js` declares `const state` at classic-script top level, so it
is **not** `window.state`. Probe the scene / `postProcessRenderPipelineManager`
instead.

---

## 4. NEW: `app/look.js` — the shared look

Single source of truth for materials + post-processing, loaded by
`preflight.js` immediately before `terrain-hd.js`. Exposes `window.GEEBR_LOOK`.

This exists specifically so `app.js` and `app/tilepreview.html` cannot drift.
(This codebase already got burned by five duplicate `roundedTile()` definitions
— see §9.)

```js
GEEBR_LOOK.DEFAULTS = {
  detailNormalUrl: './assets/textures/detail_clay_n.png',
  rough: 0.88,      // matte clay; only applied when there is NO ORM texture
  detail: 0.15,     // detail-normal bump level
  detailScale: 5,   // detail UV tiling per unit tile
  envIntensity: 0.55
};
GEEBR_LOOK.applyClayLook(material, scene, opts)
GEEBR_LOOK.applyClayLookToMeshes(meshes, scene, opts)
GEEBR_LOOK.applyTonemap(scene, {exposure, contrast, tonemap:'neutral'|'aces'|'none', grade:bool})
GEEBR_LOOK.setupSSAO(scene, camera, {radius, strength, samples, maxZ})
```

`app.js` now just delegates:

```js
const LOOK = () => window.GEEBR_LOOK;
function applyClayLook(m,scene,opts){ return LOOK()?.applyClayLook(m,scene,opts) ?? m; }
// ...
LOOK()?.applyTonemap(scene);
state.ssao = LOOK()?.setupSSAO(scene,camera);
```

### ⚠️ glTF roughness gotcha — important

glTF **multiplies** `roughnessFactor` by the ORM green channel. So once a
`metallicRoughnessTexture` exists you can only ever make a material *smoother*
from the material side, never rougher. That is why `applyClayLook` only sets
`m.roughness` when there is no ORM texture, and why the real fix has to rewrite
the texture itself (§5).

This is the same class of trap as the earlier `baseColorFactor` finding: it
plateaus because the environment IBL ambient floor doesn't scale with albedo,
which is why `bake.py` rewrites the JPEG rather than using a factor. **Don't
use `tint.py`.**

---

## 5. NEW: `orm.py` — the mandatory ORM fix

```bash
cd /files/geebr.world/handoff/tile_work
python3 orm.py IN.glb OUT.glb [--rough 0.88] [--roughvar 0.035] [--ao 0.85] \
                              [--cavity 0.5] [--rays 48] [--res 1024]
```

What it does:
1. Ray-traces **per-vertex AO** with `trimesh` (cosine-weighted hemisphere,
   48–64 rays), rasterises it into UV space per-triangle, gaussian-blurs it.
   ~14 s for the 4.4 k-vert tile. (No `pyembree`, so it's the pure-python
   intersector — budget ~50 s at 64 rays for a 4 k mesh.)
2. Adds a **cavity** term from albedo luminance divided by a blurred copy, so
   *painted* seams that aren't geometric also darken.
3. Writes the combined AO into **ORM red** and **declares `occlusionTexture`**
   (Tripo doesn't).
4. Flattens **roughness** to 0.88 with the original variation renormalised to
   std 0.035 — keeps the pattern, kills the gloss.
5. Zeroes metallic and pins `metallicFactor = 0`.

Measured result on the grass tile:
```
vertex AO: min 0.000 mean 0.882 max 1.000  (14.0s)
rasterised AO: min 0.192 mean 0.966
cavity: min 0.502 mean 0.997
final AO: min 0.314 mean 0.969 p5 0.788
roughness: mean 0.880 std 0.035
wrote grass_v7_orm.glb  1.55 MB
```

**Output on disk: `assets/models/tiles/grass_v7_orm.glb`** — this is now the
tile to use, superseding `grass_tripo_v7_g60.glb`.

### `glb.py`

`bake.py` can only patch a texture *in place* (new JPEG must fit the original
bufferView). `glb.py` is a proper minimal GLB reader/writer that **rebuilds the
binary chunk**, so textures can be resized, added or removed. `orm.py` uses it.
API: `load()`, `.image(i)`, `.set_image(i,pil)`, `.add_image()`,
`.add_texture()`, `.add_bufferview()`, `.save()`.

---

## 6. NEW: detail normal + what's tuned so far

`mkdetail.py` generates `assets/textures/detail_clay_n.png` (512², RGBA;
RG = tangent normal, A = roughness delta). Layered seamless noise (broad clay
pressing + medium tooth + fine grain + ~26 sparse pressed divots), wrap-around
blurred so it tiles.

```bash
python3 mkdetail.py /files/geebr.world/assets/textures/detail_clay_n.png 512 1.0
```

Applied via `PBRMaterial.detailMap` at `uScale = vScale = detailScale`.

### Tuning done (see `shots/det3.jpg`, `shots/close3.jpg`)

| detail level @ dscale 4 | verdict |
|---|---|
| 0.12 | subtle, close to right |
| 0.25 | visible, borderline |
| 0.45 | **too crusty** — reads as sand, not clay |
| 1.0 @ dscale 6 | way too much |

**Current default: `detail 0.15`, `detailScale 5`.** Probably still slightly
hot — the reference ground is very smooth. Consider 0.10–0.12.

### ▶ NOT YET TUNED — this is the main open work

SSAO strength/radius has **not** been A/B'd in the real app. The `ab_app.py`
`VARIANTS` list is already set up for exactly this:

```python
VARIANTS = [
    ('off',  "P('ssao').totalStrength=0;"),
    ('s105', "P('ssao').totalStrength=1.05; P('ssao').radius=0.55;"),
    ('s220', "P('ssao').totalStrength=2.2;  P('ssao').radius=0.9;"),
]
```

A first run produced only `ab_off.png` before being cut short — the later
screenshots timed out at the default viewport (swiftshader + SSAO + DOF at
1280×860 is ~3.5 fps). Use the fast harness at its default **800×550** for normal review. Drop to
640×440 only for quick parameter sweeps, then validate the chosen result at higher
resolution.

Current app defaults: `radius 0.55`, `totalStrength 1.05`, `samples 16`,
`maxZ 60`, `expensiveBlur true`, `ssaoRatio 1`, `blurRatio 1`.

My read of the A/B I did get (`shots/app_ab.jpg`, old vs new full app): the
change is real but **subtle** — the grade and softer tonemap read clearly, the
AO less so. Suspect `totalStrength` wants to go up (1.8–2.5) and/or `radius`
up to ~0.9 given tiles are 1 unit. Verify before deciding.

---

## 7. Verified state of the app after the changes

Probe output from `shot_app.py` (WebGL2 fallback, headless):

```
BEFORE: {"meshes":49,"mats":67,"pipelines":["drp"],        "dof":false,"curves":false,
         "tonemap":1,"exposure":1.34,"contrast":1.34,"detailMats":0,"pbr":17,"std":50}
AFTER:  {"meshes":49,"mats":67,"pipelines":["drp","ssao"],"dof":true, "curves":true,
         "tonemap":2,"exposure":1.18,"contrast":1.12,"detailMats":1, "pbr":17,"std":50}
```

`tonemap 2` = `TONEMAPPING_KHR_PBR_NEUTRAL`. SSAO2 `IsSupported` returns true
on Babylon **9.18.0** (CDN latest).

Note `detailMats: 1` — only one material currently gets the detail map, because
the scene is still 50 StandardMaterials to 17 PBR. See §8 item 3.

### Exact app.js changes

| Location | Change |
|---|---|
| top consts | added `TILE_ASSET`, `DETAIL_NORMAL` |
| `createEngine()` | `?webgl=1` WebGL2 fallback |
| after `clamp()` | `LOOK()` delegation shims |
| camera | `minZ .1→.5`, `maxZ 4000→600` |
| `state.shadow.darkness` | `.06 → .30` |
| tonemap block | replaced with `LOOK()?.applyTonemap(scene)` |
| render pipeline | added real DOF (`Low` blur, focalLength 42, fStop 2.4, focusDistance tracks camera→target each frame, in **mm**) |
| render pipeline | added `state.ssao = LOOK()?.setupSSAO(scene,camera)` |
| 3 GLB import sites | now call `applyClayLook`/`applyClayLookToMeshes` |

All patches were applied by scripts kept in `handoff/tile_work/`:
`patch_app.py`, `patch2.py`, `patch3.py`, `patch_artmode.py`. They all use
`assert count == 1` before replacing — **keep doing it that way**, `apply_udiff`
is unreliable on `app.js` because of very long lines.

Validation: `deno check --no-lock app/app.js app/look.js app/preflight.js`
(there is no `node` on this box, but `deno` is at
`/files/home/runvnc/.deno/bin/deno`).

---

## 8. Remaining rendering work, in priority order

1. **Verify `?art=1`** (see §1) — 5 min.
2. **A/B and lock SSAO strength/radius** via `ab_app.py` at 640×440 — this is
   the highest-value remaining item.
3. **Migrate `app.js`'s 15 `StandardMaterial` call sites to PBR.** Currently
   50 Standard vs 17 PBR in the live scene. StandardMaterial can't participate
   in the IBL diffuse, so props will never quite match imported GLBs, and the
   detail map only reaches PBR materials. Boring but necessary; `mat()` and
   `colorMat()` at `app.js:21–33` are the two factories to convert.
4. **Baked per-vertex AO as `COLOR_0`** — complements SSAO, which can't see
   occlusion outside the frustum. `orm.py` already computes vertex AO; it just
   needs a path that writes it as a vertex attribute instead of into UV space.
5. **Re-tune `detail` down to ~0.10–0.12** once SSAO is settled (they interact —
   both add small-scale darkening).
6. **Drop Tripo's normal-map request** for future assets (`texture: 'HD'` still
   wanted for colour). Saves ~5 MB/asset of blank texture. Verify Tripo lets
   you opt out of just the normal.
7. **Run `orm.py` on every future Tripo asset.** It should be a mandatory step
   right after `bake.py` in the pipeline (§10).

---

## 9. ⚠️ `app/terrain-hd.js` — still an integration blocker

Unchanged from the previous handoff and still true:

`terrain-hd.js` (~49 KB) contains **FIVE duplicate definitions of
`function roundedTile(...)`** at roughly lines 314, 370, 564, 603, 887. Later
ones silently shadow earlier ones. This is almost certainly why a previous
agent's edits "went sideways".

**Do not blindly edit that file.** Dedupe first, or at minimum determine which
definition is actually in effect. Add the GLB tile path behind a flag so you can
A/B against the procedural version, and only then remove the procedural
grass/cliff builders.

It *does* already have a decent PBR authoring path worth reading:
`surface()` at line ~290, `normalFromCanvas()` (Sobel-from-luminance) at ~231,
`ormFromCanvas()` (packs AO in R, roughness in G, metal 0 in B) at ~262. Note
that `ormFromCanvas` **does** write AO — so the procedural terrain was better
equipped than the Tripo assets were.

Relevant builders: `paintGrassDetail`, `paintDirtDetail`, `paintStoneDetail`,
`paintStrataDetail`, `tuftTexture`, `daisyTexture`, `crossedQuads`,
`buildVegetation`, `buildFlora`, `merge`, `dyn`.

Load order (`app/preflight.js`): CDN libs → `look.js` → `terrain-hd.js` →
`app.js` → `llm_js/world-integration.js` (module).

Use **thin instances** for repeated tiles and scatter props.

---

## 10. The asset pipeline (unchanged, plus the new step)

```
MASTER REFERENCE  /xfiles/localmr/static/imgs/gpt_image_7fRofQ_FKB_m9w_0.png
      |  manual crop
      v
  ref_*.png
      |  OpenAI gpt-image-1 images.edit, input_fidelity='high'   <-- edit2.py
      v
  asset_*.png          single object, grey bg, 1024x1024
      |  fal image-to-3d (Tripo)                                 <-- cmp.py / gen.py
      v
  *.glb
      |  albedo brightness fix, gain 0.60                        <-- bake.py   REQUIRED
      v
      |  ORM fix: real AO + matte roughness                      <-- orm.py    REQUIRED  *** NEW ***
      v
  assets/models/tiles/*.glb
      |  preview                                                 <-- app/tilepreview.html + shot_tile.py
      v
  small composite                                                <-- mk.py, then examine_image
```

### Environment

- `FAL_KEY`, `OPENAI_API_KEY` already in the shell env and `~/.bashrc`.
- Available: `fal-client`, `trimesh` 4.11.2, `numpy`, `scipy` 1.18, `PIL`,
  `rtree`, `playwright`, `deno` 1.43.1.
- **Missing:** `blender`, `manifold3d`, `mapbox_earcut`, `pygltflib`,
  `pyembree`, `node`. So no boolean ops and no local decimation — control poly
  count at generation time via Tripo's `face_limit`.
- Static server: `python3 -m http.server 8791 --directory app`, pid was 14859.
  **It serves `app/` as the web root**, so the app is
  `http://localhost:8791/index.html`, *not* `/app/index.html`. `assets` is a
  symlink inside `app/`.

### fal endpoints — measured on `asset_tile7.png`

| model | verts | faces | file | time | extents | verdict |
|---|---|---|---|---|---|---|
| **tripo3d/tripo/v2.5/image-to-3d** | **4,368** | 5,994 | **1.3 MB** | 99 s | 0.996 × 0.841 × 1.000 | **WINNER** |
| fal-ai/trellis | 46,056 | 79,326 | 2.6 MB | 110 s | 0.944 × 0.763 × 0.959 | 10× the polys |
| fal-ai/hyper3d/rodin | 22,239 | 38,820 | 10.1 MB | 92 s | 1.900 × 1.582 × 1.900 | wrong scale, fat |
| fal-ai/hunyuan3d-v21 | — | — | 8.4 MB | 229 s | — | returns a **ZIP** |

Argument gotchas (each endpoint names the image differently):

```python
'tripo':   ('tripo3d/tripo/v2.5/image-to-3d',
            {'image_url': url, 'texture': 'HD', 'pbr': True, 'face_limit': 6000})
'trellis': ('fal-ai/trellis', {'image_url': url, 'texture_size': 1024, 'mesh_simplify': 0.95})
'rodin':   ('fal-ai/hyper3d/rodin',
            {'input_image_urls': [url], 'geometry_file_format': 'glb',
             'material': 'PBR', 'quality': 'medium', 'tier': 'Regular'})
'hunyuan': ('fal-ai/hunyuan3d-v21', {'input_image_url': url})
```

- Tripo: `texture` must be `'no'|'standard'|'HD'`, **not** `True`;
  `texture_quality` is now rejected (422). Mesh comes back under **`pbr_model`**
  (`model_mesh` is null).
- Trellis: `texture_size` must be an **int**.
- Hunyuan: `model_glb` points at a ZIP; trimesh then fails
  `incorrect header on GLB file`. Just skip hunyuan.
- No Meshy on fal.

### Input image requirements

Single object, centred, generous margin, plain flat uniform light-grey
background, even neutral studio lighting, no cast shadow, no gradient/vignette,
no text. Deviating measurably degrades the mesh.

### Albedo brightness — `bake.py`, gain 0.60

Tripo **de-lights and overshoots brightness ~2.4×**. Verified two ways:

```
source concept asset_tile7.png            green [ 58,  74,  44]   <- target
tripo baked colour atlas (read from GLB)        [147, 164, 100]
unlit render, ALL lighting disabled             [147, 159,  91]   <- matches atlas
```

Hue/sat preserved (0.413 → 0.392) — pure value lift, so one gain fixes it.
**Do not use `baseColorFactor`/`tint.py`** — it plateaus because the env IBL
ambient floor doesn't scale with albedo (1.00→[143,154,99], 0.45→[88,100,68],
0.30→[81,101,71]). `bake.py` rewrites the JPEG inside the GLB binary chunk.

Chosen gain **0.60** (assumes the asset is lit in the real scene). `0.50` is on
disk too. Note the concept image is itself a *lit* render, so using it as an
albedo target double-counts light slightly — normal for stylised work, and why
0.60 rather than the numerically-implied ~0.45.

Re-measure per asset; the grey stone ratio differed from the green (0.63 vs
0.45).

---

## 11. Assets — current state

### `assets/models/tiles/`

| file | notes |
|---|---|
| **`grass_v7_orm.glb`** | **NEWEST — use this.** g60 + `orm.py` (real AO, roughness 0.88, metallic 0, occlusionTexture declared). 1.55 MB |
| `grass_tripo_v7_g60.glb` | previous best; albedo gain 0.60, but blank AO + 0.49 roughness |
| `grass_tripo_v7_g50.glb` | same, gain 0.50 (deeper) |
| `grass_tripo_v7_raw.glb` | untouched Tripo output, pale. Keep for re-baking |
| `grass_trellis_v7.glb` | trellis, 46 k verts. Reference only |

### `assets/textures/`

`detail_clay_n.png` — the new shared 512² detail normal.

### Concept images done, 3D NOT started

`handoff/tile_work/sheet_final.png` is a contact sheet of all 8.

| asset | concept | 3D |
|---|---|---|
| grass tile | `asset_tile7.png` | ✅ |
| rock boulder | `asset_rock_boulder3.png` ← **v3 is the good one** | ❌ |
| rock cluster | `asset_rock_cluster.png` | ❌ |
| rock slab | `asset_rock_slab.png` | ❌ |
| tree | `asset_tree.png` | ❌ |
| house | `asset_house.png` | ❌ |
| barrel | `asset_barrel.png` | ❌ |
| crate | `asset_crate.png` | ❌ |

Converting these is mechanical, ~100 s each:

```bash
cd /tmp/fal3d
for A in rock_boulder3 rock_cluster rock_slab tree house barrel crate; do
  python3 cmp.py /tmp/fal3d/asset_$A.png /tmp/fal3d/out_$A tripo
  python3 bake.py /tmp/fal3d/out_$A/tripo.glb /tmp/fal3d/$A.baked.glb 0.60
  python3 orm.py  /tmp/fal3d/$A.baked.glb \
    /files/geebr.world/assets/models/props/gen/$A.glb --rays 48
done
```

Suggested `face_limit`: rocks 3000, barrel/crate 2500, tree 5000, house 10000.

---

## 12. Deferred art tasks (from the previous handoff, still valid)

### Grass-blade + daisy scatter props

The reference gets its grassiness from **separate chunky blade-cluster and
daisy props scattered on a plain slab**, not from the tile surface.

*Caveat added this session:* part of what read as "repetitive wallpaper" was
actually the missing AO and wrong roughness, not missing geometry. **Finish the
rendering work first** so the props are tuned against a correct renderer.

Plan: crop blades/daisies from `ref_grass_a.png` / `ref_grass_b.png` /
`ref_scene.png` → `edit2.py` → Tripo with low `face_limit` (1500–3000) →
`bake.py` → `orm.py` → scatter with **thin instances**, random position in cell,
full 360° yaw, ±10% scale, **varying density** (some tiles bare). Do not place
one per tile at a fixed offset.

**⚠️ User explicitly rejected per-instance colour tint jitter** — it makes tiles
read as distinct objects rather than one continuous grass area.

### Cliff / edge tile

Starting material: `ref_edge.png` (crop of master), `p_cliff.txt` (old prompt),
`tile_cliff_ref.png` (old-style, silhouette only — the grass on it is the
discarded fuzzy style, regenerate).

Use `asset_tile7.png` as the primary style anchor in `edit2.py` so stone blocks
and green cap match exactly. Tripo `face_limit` ~8000. Must tile seamlessly
against the grass tile — same cap colour, same stone palette, same block scale.

**⚠️ User decision: no more grass slab variants.** Cliff first.

---

## 13. The art-direction insight — do not lose this

Two earlier attempts failed by chasing a *fuzzy photoreal saturated lawn*. That
is wrong.

- The "grass" is **NOT grass**. It is smooth **matte clay/felt**, like a
  hand-painted resin miniature. Desaturated olive/moss.
- Tile tops are **FLAT** with a **tiny tight bevel** and **crisp hard edges**.
  No doming, no pillowing, no fuzz.
- Seams are **thin and dark**, not gaps.
- Grassiness comes from **separate props on top**.

~3 hrs were burned on procedural grass in `terrain-hd.js` before switching to
image-to-3D. **Do not go back to procedural.**

### Prompting lessons

1. The edit chain **degrades after ~3 hops** (pass 5 came back a halftone print,
   pass 8 covered in grainy felt — both edits-of-edits-of-edits). Beyond ~3
   iterations, restart from a crop of the master reference.
2. **Negative phrasing backfires** — "no grain", "not fuzzy" reliably produced
   exactly the forbidden thing. Describe what you *want*. Enumerating forbidden
   **objects** ("no flowers, no daisies") does work.
3. **Change one thing per prompt.**
4. Pass the previous good render as the **first** image + 1–2 style refs after
   it. `input_fidelity='high'` is essential.

Tile history: t3/t4 good stone variation, cap too thick · t5 halftone disaster ·
t6 crisp but lost variation, pillowy top · **t7 KEEPER** · t8 grainy regression.

---

## 14. Seams and yaw (settled)

Tiles butt cleanly with **no visible gaps at scale 1.0** with the Tripo mesh —
the old 1.03 oversizing hack is **not needed** (that was for the inset trellis
mesh).

Tripo made the tile **0.841 high, not 1.0** — squat, harmless for grid tiling.

Random 90° yaw is implemented with a `TransformNode` pivot at the **grid-cell
centre** so yaw spins in place rather than orbiting the tile out of its cell.
User confirms it helps. Carry this into the real terrain code.

```js
let _seed = SEED >>> 0;
const rnd = () => { _seed = (_seed*1664525 + 1013904223) >>> 0; return _seed/4294967296; };
pivot.position = new BABYLON.Vector3(i-(N-1)/2, 0, j-(N-1)/2);
if (YAW) pivot.rotation.y = Math.floor(rnd()*4) * Math.PI/2;
```

### `app/tilepreview.html` params (expanded this session)

`f` `n` `r` `a` `b` `yaw` `seed` `envi` `hemi` `diri` `unlit` `exp`
**+ new:** `ssao` `ssaostr` `ssaorad` `detail` `dscale` `rough` `shadow`
`tonemap` (`aces|neutral|none`) `contrast` `grade` `bg`

Defaults now match the good preview lighting (`envi=0.3 hemi=0.4 diri=1.1`);
the old defaults blew out the albedo and misled earlier sessions. The HUD now
also reports material class, whether an AO texture is present, roughness and
metallic.

```bash
cd /tmp/fal3d
timeout 300 python3 shot_tile.py grass_v7_orm.glb /tmp/fal3d/shot.png 6 9 '&yaw=1&seed=7'
python3 mk.py /tmp/fal3d/view/x.jpg 420 340 150,90,1060,830 /tmp/fal3d/shot.png
```

`shot_tile.py` needs `screenshot(timeout=120000)` — slow under swiftshader.

---

## 15. Git status

Repo `/files/geebr.world`, GitHub `runvnc/geebr.world`, branch `main`.
HEAD = **`2280484`** "image-to-3D tile pipeline: grass tile GLB, albedo bake
fix, preview harness, handoff".

**Nothing from this session is committed.**

```
 M app/app.js
 M app/llm_js/world-integration.js
 M app/preflight.js
 M app/tilepreview.html
 M app/tts/tts-ui.js
 M handoff/tile_work/tilepreview.html
?? app/look.js
?? assets/models/tiles/grass_v7_orm.glb
?? assets/textures/detail_clay_n.png
?? handoff/tile_work/glb.py
?? handoff/tile_work/mkdetail.py
?? handoff/tile_work/orm.py
?? handoff/tile_work/{mk,shot_app,ab_app,probe}.py
?? handoff/tile_work/patch*.py
?? handoff/tile_work/shots/
```

Backup of the pre-session `app.js` is at `/tmp/fal3d/app.js.bak` (ephemeral —
git HEAD has the same content).

Suggest committing after §1's verification, in two commits: one for the
rendering/material work, one for the dev flags.

---

## 16. File inventory — `handoff/tile_work/`

**Pipeline scripts:** `edit2.py`, `edit.py`, `cmp.py`, `gen.py`, `bake.py`,
**`orm.py`**, **`glb.py`**, **`mkdetail.py`**, `tint.py` (don't use)

**Harnesses:** `shot_tile.py`, **`shot_app.py`**, **`ab_app.py`**,
**`probe.py`**, **`mk.py`**, `v.py`, `tilepreview.html`

**Patch scripts (record of how app.js was edited):** `patch_app.py`,
`patch2.py`, `patch3.py`, `patch_artmode.py`

**Prompts:** `p_tile7.txt` (winner), `p_cliff.txt`, `p_grass.txt`, `p_grass2.txt`

**Reference crops:** `ref_cube.png`, `ref_edge.png`, `ref_rocks.png`,
`ref_trees.png`, `ref_house.png`, `ref_barrel.png`, `ref_grass_a.png`,
`ref_grass_b.png`, `ref_scene.png`

**Concept images:** `asset_tile7.png`, `asset_rock_boulder3.png`,
`asset_rock_cluster.png`, `asset_rock_slab.png`, `asset_tree.png`,
`asset_house.png`, `asset_barrel.png`, `asset_crate.png`, `sheet_final.png`

**Old-style refs (silhouette only):** `tile_grass_ref.png`,
`tile_grass_ref2.png`, `tile_cliff_ref.png`

**`shots/` — small viewable JPEGs from this and prior sessions.** Notable:
`zoom_terrain.jpg` (reference ground close-up), `atlas_sheet.jpg` (the three
Tripo textures side by side — the blank normal map is obvious), `cmp_orm.jpg`
(before/after ORM fix), `close3.jpg` (ssao off / on / on+detail),
`det3.jpg` (detail 0.12 / 0.25 / 0.45), `app_ab.jpg` (full app before/after).
`app_old.png` / `app_new.png` are the full-res originals — **do not
`examine_image` those directly.**
