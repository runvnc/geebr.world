# geebr.world — Art Asset Pipeline (image → 3D via fal) — HANDOFF

**Last updated:** 2026-07-25 11:30 UTC
**Supersedes:** `TILES_IMAGE_TO_3D_HANDOFF.md` (deleted; everything still relevant is folded in here)

Read this top to bottom before touching anything. It is written so you do not
have to ask the user to re-explain the project.

---

## 0. TL;DR — where we are

- The **grass tile is DONE**: `assets/models/tiles/grass_tripo_v7_g50.glb`
  (4,368 verts, 1.3 MB, unit-sized, correct colour). Ship it.
- **NEXT TASK: grass-blade + daisy scatter props** (see §8). This is the single
  highest-value remaining item — it is what makes the ground look like the
  reference instead of like tiled linoleum.
- **AFTER THAT: a cliff / edge tile variant** (see §9).
- 7 other large assets (rocks ×3, tree, house, barrel, crate) have **finished
  concept images but no 3D yet** (see §10). Converting them is mechanical.
- **Explicitly NOT doing** (user decision): per-instance colour tint jitter
  (would make tiles read as distinct objects rather than one continuous grass
  area); extra grass slab variants; regenerating the tile source image.

---

## 1. The project

`geebr.world` — browser Babylon.js/WebGPU turn-based LLM toybox.
App is served from `/files/geebr.world/app/`, URL path `/app/`.

We are replacing procedurally-generated terrain with **art-directed 3D assets
produced by image-to-3D**, matched to one master concept render.

### THE MASTER REFERENCE IMAGE — do not lose this

```
/xfiles/localmr/static/imgs/gpt_image_7fRofQ_FKB_m9w_0.png
```

This is the originally-generated concept art for the whole game UI + world. It
is the single source of truth for art direction. Everything else is derived
from crops of it. A copy of the crops lives in `handoff/tile_work/ref_*.png`.

### THE KEY ART-DIRECTION INSIGHT — do not lose this either

Two previous attempts failed by chasing a *fuzzy photoreal saturated lawn*.
That is wrong. Look closely at the reference:

- The "grass" is **NOT grass**. It is smooth **matte clay/felt** — like a
  hand-painted resin miniature. Desaturated olive/moss.
- The top of a tile is **FLAT** with a **tiny tight bevel** and **crisp hard
  edges**. No doming, no pillowing, no fuzz.
- Seams between tiles are **thin and dark**, not gaps.
- The *grassiness* comes from **SEPARATE chunky blade-cluster and daisy props
  scattered on top** — not from the tile surface. This is why §8 matters.

History: ~3 hrs were burned on procedural grass in `app/terrain-hd.js` before
switching to image-to-3D. Do not go back to procedural.

---

## 2. Environment / credentials

Both are already in the shell env (and `~/.bashrc`):

- `FAL_KEY` — fal.ai, used for image→3D
- `OPENAI_API_KEY` — used for gpt-image-1 concept image generation

`fal-client` is pip-installed. `trimesh`, `numpy`, `PIL`, `playwright` available.

**Missing tools:** no `blender`, no `manifold3d`, no `mapbox_earcut`, no
`pygltflib`. So **no boolean ops and no mesh decimation locally** — this is why
we control poly count at generation time via Tripo's `face_limit`.

---

## 3. The pipeline (two stages — fal is only stage 2)

```
MASTER REFERENCE  /xfiles/localmr/static/imgs/gpt_image_7fRofQ_FKB_m9w_0.png
      |  manual crop
      v
  ref_*.png            (ref_cube, ref_rocks, ref_house, ref_trees, ref_barrel, ref_edge, ...)
      |  OpenAI gpt-image-1  images.edit  input_fidelity='high'   <-- edit2.py
      v
  asset_*.png          single object, style-matched, plain grey bg, 1024x1024
      |  fal image-to-3D                                          <-- cmp.py / gen.py
      v
  *.glb
      |  albedo brightness fix                                     <-- bake.py   (SEE §6 — REQUIRED)
      v
  assets/models/tiles/*.glb
      |  Babylon preview                                           <-- app/tilepreview.html + shot_tile.py
      v
  screenshot
```

**Critical technique:** stage 1 is *style transfer from a crop of the reference*,
driven by `images.edit` with `input_fidelity='high'`. It is NOT text-to-image
from a description. Text descriptions of the style consistently fail.

### Working dirs

- `/tmp/fal3d/` — scratch, where everything was actually run. **Ephemeral.**
- `/files/geebr.world/handoff/tile_work/` — durable copy of all scripts,
  prompts, refs and key outputs. **Use this as the source of truth.**

Copy scripts back to `/tmp/fal3d/` to work, since `shot_tile.py` and the
prompts use absolute `/tmp/fal3d/` paths.

---

## 4. Scripts (all in `handoff/tile_work/`)

| script | purpose |
|---|---|
| `edit2.py` | gpt-image-1 `images.edit`. `edit2.py prompt.txt out.png 1024x1024 img1 [img2 ...]` — first image is the primary, the rest are style refs |
| `edit.py` | older version, fixed 1024, no size arg |
| `cmp.py` | run several fal image→3D endpoints on one image. `cmp.py in.png outdir tripo,trellis,hunyuan,rodin` |
| `gen.py` | single endpoint, verbose logs |
| `bake.py` | **REQUIRED post-step.** Multiplies the baseColor texture inside a GLB. `bake.py in.glb out.glb 0.50` |
| `tint.py` | scales `baseColorFactor` instead. Mostly useless, see §6 |
| `shot_tile.py` | Playwright screenshot of the Babylon harness. `shot_tile.py FILE.glb out.png N RADIUS '&extra=params'` |
| `v.py` | **USE THIS.** Downscales an image to a small JPEG for viewing. `v.py img.png 640` → `/tmp/fal3d/view/<name>_v.jpg` |

### ⚠️ CONTEXT BUDGET — this killed the last two sessions

Two prior sessions died with `413 request_too_large` from Anthropic. Cause:
`examine_image` on full-res 1024² / 1200×900 PNGs, repeatedly. Each is 1.5–3 MB
base64. About ten of them and the request exceeds the API limit. Chatlogs of
16–36 MB exist in `/xfiles/localmr/data/chat/admin/Assistant/` as evidence.

**Always** run `v.py` first, or build a small composite sheet with PIL, and
`examine_image` **that**. Target ≤ 40 KB per image viewed. Compare several
things in ONE composite rather than several separate `examine_image` calls.

---

## 5. fal endpoints — measured results

Comparison run on `asset_tile7.png`, 2026-07-25:

| model | verts | faces | file | time | extents | verdict |
|---|---|---|---|---|---|---|
| **tripo3d/tripo/v2.5/image-to-3d** | **4,368** | 5,994 | **1.3 MB** | 99 s | 0.996 × 0.841 × 1.000 | **WINNER — use this** |
| fal-ai/trellis | 46,056 | 79,326 | 2.6 MB | 110 s | 0.944 × 0.763 × 0.959 | 10× the polys |
| fal-ai/hyper3d/rodin | 22,239 | 38,820 | 10.1 MB | 92 s | 1.900 × 1.582 × 1.900 | wrong scale, fat file |
| fal-ai/hunyuan3d-v21 | — | — | 8.4 MB | 229 s | — | returns a **ZIP**, not a GLB |

**Use Tripo.** `face_limit` is honoured, so poly budget is solved at the source
— which matters because we have no local decimation tooling.

### Per-endpoint argument gotchas

Every endpoint uses a **different image argument name**:

```python
'tripo':   ('tripo3d/tripo/v2.5/image-to-3d',
            {'image_url': url, 'texture': 'HD', 'pbr': True, 'face_limit': 6000})
'trellis': ('fal-ai/trellis',
            {'image_url': url, 'texture_size': 1024, 'mesh_simplify': 0.95})
'rodin':   ('fal-ai/hyper3d/rodin',
            {'input_image_urls': [url], 'geometry_file_format': 'glb',
             'material': 'PBR', 'quality': 'medium', 'tier': 'Regular'})
'hunyuan': ('fal-ai/hunyuan3d-v21', {'input_image_url': url})
```

- **Tripo API changed:** `texture` must be `'no' | 'standard' | 'HD'`, NOT
  `True`, and `texture_quality` is now rejected → HTTP 422. Already fixed in
  `cmp.py`; the old handoff had this wrong.
- **Trellis:** `texture_size` must be an **int**, not a string, else 422.
- **Hunyuan:** its `model_glb` key points at a ZIP archive. `cmp.py`'s naive
  key-walk saves it as `.glb` and trimesh then fails with
  `incorrect header on GLB file`. Unzip it, or just drop hunyuan — it was also
  2.5× slower than everything else.
- Tripo returns the mesh under **`pbr_model`** (`model_mesh` is `null`).
- No Meshy endpoint on fal.

### Input image requirements

Single object, centred, generous margin, **plain flat uniform light-grey
background**, even neutral studio lighting, no cast shadow on the ground, no
gradient/vignette, no text or watermark. Deviating from this measurably
degrades the mesh.

---

## 6. ⚠️ ALBEDO IS TOO BRIGHT — mandatory post-step

**Tripo de-lights the input and overshoots brightness by ~2.4×.** This is not a
lighting problem in the viewer — verified two independent ways:

```
                                        green pixels, mean RGB
source concept asset_tile7.png          [ 58,  74,  44]   <- target
tripo baked colour atlas (read from GLB)[147, 164, 100]
unlit render, ALL lighting disabled     [147, 159,  91]   <- matches the atlas
```

Hue and saturation are preserved (sat 0.413 → 0.392). It is a pure **value**
lift, so a single gain fixes it — no regeneration needed.

**Do not try to fix this with `baseColorFactor`.** It plateaus, because the
scene's environment IBL contributes a specular/ambient floor that does not
scale with albedo:

| baseColorFactor | lit green |
|---|---|
| 1.00 | [143, 154, 99] |
| 0.45 | [ 88, 100, 68] |
| 0.35 | [ 83, 100, 69] |
| 0.30 | [ 81, 101, 71] |

**Correct fix:** `bake.py` — decodes the JPEG out of the GLB's binary chunk,
multiplies it, re-encodes at a quality that fits the existing buffer view, and
rewrites in place. The asset then looks correct in any renderer.

```bash
python3 bake.py in.glb out.glb 0.60
```

**Chosen value: gain 0.60**, on the assumption the asset will be lit in the
real scene. 0.50 is noticeably deeper if the final scene lighting turns out
bright; both are on disk. Note the concept image is itself a *lit* studio
render, so its pixel values already contain shading — using it as an albedo
target double-counts light slightly. That is normal and acceptable for
stylised work, but it is why 0.60 rather than the numerically-implied ~0.45.

Apply the same treatment to every asset Tripo produces. Re-measure per asset;
the grey stone ratio differed from the green (0.63 vs 0.45), so a single global
number is an approximation.

---

## 7. Current tile asset + the Babylon harness

### Files in `assets/models/tiles/`

| file | notes |
|---|---|
| **`grass_tripo_v7_g60.glb`** | **THE ONE TO USE.** Tripo, albedo gain 0.60. 4,368 v, 1.3 MB |
| `grass_tripo_v7_g50.glb` | same, gain 0.50 (deeper) |
| `grass_tripo_v7_raw.glb` | untouched Tripo output, pale. Keep for re-baking at other gains |
| `grass_trellis_v7.glb` | trellis version, 46 k verts. Reference only |

Deleted: the old `grass_trellis.glb` / `cliff_trellis.glb` — those came from the
discarded fuzzy-lawn references, wrong style, and the cliff was 139 k verts.

Source concept image: `handoff/tile_work/asset_tile7.png`, prompt
`handoff/tile_work/p_tile7.txt`.

Material is clean: proper ORM (metal 3/255, roughness 124/255) plus a normal
map, 4096² textures. No metallic bug.

### Harness — `app/tilepreview.html` (also copied to `handoff/tile_work/`)

Loads **one** tile GLB, measures its bounds, normalises it to a 1×1 cell with
the top face at `y = 0`, then clones it in an N×N grid. It is NOT a pre-built
grid mesh.

URL params:

| param | default | meaning |
|---|---|---|
| `f` | `grass_trellis.glb` | filename inside `assets/models/tiles/` |
| `n` | 4 | grid is N×N |
| `r` | 6 | camera radius |
| `a` / `b` | -0.785 / 0.95 | camera alpha / beta |
| `yaw` | 1 | random 90° yaw per tile |
| `seed` | 12345 | deterministic LCG, so screenshots reproduce |
| `envi` / `hemi` / `diri` | 1.0 / 0.6 / 2.0 | environment, hemispheric, directional intensity |
| `unlit` | 0 | `1` = disable all lighting, show raw albedo (diagnostic) |
| `exp` | 1.0 | image-processing exposure |

Good preview lighting: `&envi=0.3&hemi=0.4&diri=1.1`. The defaults blow out the
albedo badly and will mislead you.

```bash
cd /tmp/fal3d
timeout 300 python3 shot_tile.py grass_tripo_v7_g60.glb /tmp/fal3d/shot.png 6 9 '&yaw=1&seed=7&envi=0.3&hemi=0.4&diri=1.1'
python3 v.py /tmp/fal3d/shot.png 640      # THEN examine_image the small jpg
```

Static server already runs on **port 8791** serving `/files/geebr.world/`.
`shot_tile.py` needs `screenshot(timeout=120000)` — it is slow under swiftshader.

### Random yaw

Implemented: each tile gets a `TransformNode` pivot **at the grid-cell centre**
so yaw spins it in place rather than orbiting it out of its cell.

```js
let _seed = SEED >>> 0;
const rnd = () => { _seed = (_seed*1664525 + 1013904223) >>> 0; return _seed/4294967296; };
pivot.position = new BABYLON.Vector3(i-(N-1)/2, 0, j-(N-1)/2);
if (YAW) pivot.rotation.y = Math.floor(rnd()*4) * Math.PI/2;
```

User confirms it helps. Carry this into the real terrain code.

### Seams

Tiles butt up cleanly with tight seams and **no visible gaps at scale 1.0**
with the Tripo mesh. The ~1.03 oversizing hack recommended in the old handoff
is **not needed**. (It was needed for the trellis mesh, which is inset.)

Note Tripo made the tile **0.841 high, not 1.0** — slightly squat. Harmless for
grid tiling since only X/Z matter, but worth knowing.

---

## 8. ▶ NEXT TASK: grass-blade + daisy scatter props

**Why:** the tile top is nearly featureless — Tripo smoothed the flagstone
creases down to faint dimples, and all tiles share one albedo, so a field of
them reads as repetitive wallpaper. Random yaw helps but cannot fix it alone.

**The reference solves this by putting separate props on top of a plain slab.**
Do the same. This kills repetition for free and matches the art direction. It
also means the slab underneath being uniform stops mattering.

Plan:

1. Crop blade clusters + daisies from the master reference
   (`handoff/tile_work/ref_grass_a.png` / `ref_grass_b.png` already contain
   good examples; `ref_scene.png` has more).
2. Generate 3–4 concept images via `edit2.py`: a chunky grass blade cluster, a
   daisy clump, a mixed clump, maybe a small weed. Same rules as §5 — single
   object, grey bg, even light. Sit them on a small implied ground disc so the
   mesh has a base.
3. Tripo with a **low `face_limit` (~1500–3000)** — these get instanced
   heavily, so they must be cheap.
4. `bake.py` gain ~0.60.
5. Scatter in Babylon with **thin instances**, random position within the cell,
   random yaw (full 360° here, not just 90°), slight random scale (±10%).
6. Density should vary — some tiles bare, some with 2–3 clumps. Do **not** place
   one per tile at a fixed offset, that just reintroduces the grid.

### ⚠️ Do NOT add per-instance colour tint

The user explicitly rejected this. It makes tiles read as individually distinct
objects instead of one continuous grass area. Keep the albedo uniform.

---

## 9. ▶ THEN: cliff / edge tile variant

The reference clearly has stacked-stone cliff/edge pieces where the terrain
steps down. We need one.

Starting material already exists:

- `handoff/tile_work/ref_edge.png` — crop from the master reference
- `handoff/tile_work/tile_cliff_ref.png` — an *old-style* generated cliff ref.
  Silhouette is right, but the grass on it is the discarded fuzzy style.
  Regenerate in the current style rather than reusing.
- `handoff/tile_work/p_cliff.txt` — the old cliff prompt, useful as a base

Approach: same as the grass tile — use `asset_tile7.png` as the primary style
anchor in `edit2.py` so the stone blocks and green cap match exactly, and
describe the taller multi-course cliff form. Then Tripo, `face_limit` ~8000
(it is a taller object so it needs more), then `bake.py`.

Must tile seamlessly against `grass_tripo_v7_g60.glb` — same cap colour, same
stone palette, same block scale.

### ⚠️ Do NOT generate more grass slab variants

User decision — cliff first, extra grass variants are lower priority.

---

## 10. Other large assets — concepts done, 3D not started

`handoff/tile_work/sheet_final.png` is a contact sheet of all 8 finished
concept images. They are stylistically consistent and approved-looking.

| asset | concept image | 3D |
|---|---|---|
| grass tile | `asset_tile7.png` | ✅ done |
| rock boulder | `asset_rock_boulder3.png` ← **v3 is the good one** | ❌ |
| rock cluster | `asset_rock_cluster.png` | ❌ |
| rock slab / monolith | `asset_rock_slab.png` | ❌ |
| tree | `asset_tree.png` | ❌ |
| house | `asset_house.png` | ❌ |
| barrel | `asset_barrel.png` | ❌ |
| crate | `asset_crate.png` | ❌ |

All 8 concept PNGs are in `handoff/tile_work/`. Also copied to
`/xfiles/localmr/static/imgs/` for browser viewing.

Converting these is **mechanical** and cheap: ~100 s each through Tripo, so the
whole set is ~12 min of wall time.

```bash
cd /tmp/fal3d
for A in rock_boulder3 rock_cluster rock_slab tree house barrel crate; do
  python3 cmp.py /tmp/fal3d/asset_$A.png /tmp/fal3d/out_$A tripo
  python3 bake.py /tmp/fal3d/out_$A/tripo.glb \
    /files/geebr.world/assets/models/props/gen/$A.glb 0.60
done
```

Suggested `face_limit`: rocks 3000, barrel/crate 2500, tree 5000, house 10000.
Edit `cmp.py`'s tripo entry per asset, or parameterise it.

The intermediate crops that produced these are `ref_rocks.png`, `ref_trees.png`,
`ref_house.png`, `ref_barrel.png`, `ref_scene.png` — reuse them if any concept
needs another pass.

---

## 11. Lessons learned — read before generating images

1. **The edit chain degrades after ~3 hops.** Pass 5 came back as a halftone
   print; pass 8 came back covered in grainy felt texture. Both were
   edits-of-edits-of-edits. If you need more than ~3 iterations, go back to a
   crop of the master reference and restart the chain.
2. **Negative phrasing backfires.** "no grain", "not fuzzy" etc. reliably
   produced exactly the thing being forbidden. Describe what you *want*.
   The one exception that does work reliably is enumerating forbidden
   *objects* ("no flowers, no daisies, no props") — that is fine.
3. **Change one thing at a time.** Multi-change prompts regress the things you
   were happy with.
4. Passing the previous good render as the **first** image plus 1–2 style refs
   after it works well. `input_fidelity='high'` is essential.

### Tile iteration history (for context, images in `/tmp/fal3d` if it survives)

- t3/t4 — good stone block colour variation, cap too thick
- t5 — halftone print disaster (negative phrasing)
- t6 — good shape and crisp edges, but lost stone variation, pillowy top,
  visible seam under cap
- **t7 — KEEPER.** Restored stone variation, flat flagstone panels, thinner cap
- t8 — regressed, grainy felt texture

---

## 12. ⚠️ WARNING about `app/terrain-hd.js` — integration blocker

`app/terrain-hd.js` (~49 KB) contains **FIVE separate duplicate definitions of
`function roundedTile(...)`** at roughly lines 314, 370, 564, 603, 887. Later
ones silently shadow earlier ones. This is almost certainly why a previous
agent's edits "went sideways" — it was editing a definition that never runs.

**Do not blindly edit that file.**

1. Dedupe `roundedTile` first, or at minimum determine which definition is
   actually in effect.
2. Add the GLB tile path **behind a flag** so you can A/B against the current
   procedural version.
3. Only then remove the procedural grass/cliff builders.

Relevant builders: `paintGrassDetail`, `paintDirtDetail`, `paintStoneDetail`,
`paintStrataDetail`, `tuftTexture`, `daisyTexture`, `crossedQuads`,
`buildVegetation`, `buildFlora`, `merge`, `dyn`, `normalFromCanvas`,
`ormFromCanvas`.

Babylon loads from CDN via `app/preflight.js` (a script list), which then loads
`terrain-hd.js`, then `app.js`, then `llm_js/world-integration.js` as a module.
Asset path constants are at the top of `app.js` (`ASSET`, `PROP_ASSET`,
`CHAR_ASSET`) — add `TILE_ASSET = './assets/models/tiles/'`.

**`apply_udiff` is unreliable on `app.js`** (very long minified lines). Use a
Python string-replace with `assert count == 1`.

Use **thin instances** for repeated tiles and scatter props.

---

## 13. Git status

Repo: `/files/geebr.world`, GitHub `runvnc/geebr.world`, branch `main`.

HEAD is still **`bbc12bc`** "redesign grass tiles as rounded beveled sod blocks".
**Nothing from the image-to-3D work is committed.** Untracked:

```
app/tilepreview.html
assets/models/tiles/
handoff/
```

`app/tilepreview.html` has been modified this session (yaw, seed, lighting
params, unlit). Commit when convenient.

---

## 14. File inventory — `handoff/tile_work/`

**Scripts:** `edit2.py`, `edit.py`, `cmp.py`, `gen.py`, `bake.py`, `tint.py`,
`shot_tile.py`, `v.py`, `tilepreview.html`

**Prompts:** `p_tile7.txt` (the winning tile prompt), `p_cliff.txt`,
`p_grass.txt`, `p_grass2.txt`

**Reference crops from the master image:** `ref_cube.png`, `ref_edge.png`,
`ref_rocks.png`, `ref_trees.png`, `ref_house.png`, `ref_barrel.png`,
`ref_grass_a.png`, `ref_grass_b.png`, `ref_scene.png`

**Finished concept images:** `asset_tile7.png`, `asset_rock_boulder3.png`,
`asset_rock_cluster.png`, `asset_rock_slab.png`, `asset_tree.png`,
`asset_house.png`, `asset_barrel.png`, `asset_crate.png`, `sheet_final.png`

**Old-style refs (superseded, keep for silhouette only):**
`tile_grass_ref.png`, `tile_grass_ref2.png`, `tile_cliff_ref.png`

**Preview renders:** `preview_g50.png`, `preview_yaw_6x6.png`,
`preview_yaw_close.png`
