# geebr.world — Island Edge / Cliff Handoff

**Updated:** 2026-07-25 (session 4)
**Repo:** `/files/geebr.world` · branch `main` · **nothing committed this session, git HEAD still `a3cb475`**
**Master visual target:** `/xfiles/localmr/static/imgs/gpt_image_7fRofQ_FKB_m9w_0.png`
**Best edge reference crop:** `handoff/tile_work/ref_cliff_perimeter.png`, right half

This document supersedes sections 5 and 6 of `RENDERING_HANDOFF.md` for the cliff
work specifically. Everything else in `RENDERING_HANDOFF.md` (art direction,
asset pipeline, look.js, vegetation) still stands.

---

## 0. Read this first: two environment fixes that matter more than the art

### 0.1 CPU meltdown — fixed, do not regress it

The previous harness launched Chromium with `--use-angle=swiftshader`, which
rasterises on all 12 CPU cores. Worse, when a harness timed out the browser tree
was **orphaned** — 46 chrome processes were found still burning CPU for minutes
afterwards. This nearly froze the machine and had already forced two hard reboots
in earlier sessions.

Both causes are fixed in `handoff/tile_work/shot_views.py`:

- **Real GPU.** `--use-angle=gl-egl --use-gl=angle --enable-gpu` binds the actual
  RTX 2060 *even headless* (DISPLAY=:0 is present). Verified in the probe output:
  `renderer: ANGLE (NVIDIA Corporation, NVIDIA GeForce RTX 2060/PCIe/SSE2)`.
- **Guaranteed teardown.** `sweep()` runs `pkill -9 -f use-angle=gl-egl` before
  the run and again in a `finally`, plus `browser.close()` under a timeout.

**Result: a full three-view render went from ~90 s to ~7 s total, 0.15 s/shot.**
Never put swiftshader back. If you write a new harness, copy the launch args and
the sweep from `shot_views.py`.

### 0.2 Still mode — new, keeps CPU work out of screenshots

New flag `window.GEEBR_STILL_MODE` in `app/preflight.js`, implied by `?art=1`,
also settable alone with `?still=1`:

- physics time step forced to `0` (Havok stops solving)
- the sea's per-frame **4,225-vertex CPU rewrite plus full normal recompute** now
  runs exactly once instead of every frame — this was the single largest
  per-frame CPU cost in the app
- foam scroll, ripple rings and lantern flicker observables are not registered

Probe confirms `still: true` and `obs: 4`.

`?art=1` still does what it always did: skips the ~3 GB LiteRT LLM download and
the Pocket-TTS autoload. **Always use `?art=1&webgl=1` for review renders.**

### 0.3 Current harness commands

```bash
# server (leave running)
python3 -m http.server 8791 --directory /files/geebr.world/app

cd /files/geebr.world/handoff/tile_work

# renders: PREFIX W H views [ids]
timeout 100 python3 -u shot_views.py /tmp/g 640 440 edge,corner,iso
# views: iso edge corner water top close profile far
# add trailing 'ids' for a flat-colour ID pass (composition legibility)

# geometry facts with NO screenshot cost (~7s, no image tokens)
timeout 90 python3 -u measure.py all
timeout 90 python3 -u measure.py hd_cliff_wall hd_island_grass

# build a <45KB composite before examine_image (context killer otherwise)
python3 mk.py /tmp/sheet.jpg 430 300 - a.jpg b.jpg c.jpg
```

`measure.py` is the important new tool. Prefer measuring numbers over looking at
pictures; it is free and it is how both real bugs below were found.

---

## 1. THE GOAL, described precisely

From the right half of `ref_cliff_perimeter.png` (this is the authority; look at
it before writing any code):

1. **The edge is SHALLOW.** Only roughly **1.5 to 2 tile heights** of stone are
   visible between the grass and the water/shadow. It is not a cliff face, it is
   a thick stone hem.
2. **It is made of DISCRETE CUBES the same size as the grass tiles.** Every one
   shows a **visible top face**, which is what makes them read as cubes rather
   than as a wall. Each is ringed by a thin dark seam.
3. **Grass and stone INTERLEAVE.** The plateau does not stop at a line. Some edge
   cubes are **grass-topped and sit one step lower and further out** than the
   main plateau; others are bare stone. The green cascades *down over* the edge
   in one or two tile steps before the stone takes over.
4. **Vegetation grows out of the joints** between the edge cubes, including on
   the stepped-down grass caps. It does not stop at the plateau boundary either.
5. **Value is mid, not dark.** The stone is a **mid blue-grey with a warm/olive
   cast**, clearly lighter than the water and only moderately darker than the
   grass. Individual blocks are separable by eye.
6. Occasional single boulders sit on the steps and in the shallow water, and the
   waterline is irregular.

## 2. WHERE WE ARE NOW

Rendered state (`/tmp/gc8_*.jpg` from this session):

- The perimeter is a **terrace of individual jittered cubes**, 4 courses, built
  per unit cell, with 45-degree rotated corner stacks and a solid inner core. No
  voids, no one-ornament-per-cell repetition, no double grass ledge.
- Stone material is `stone_blocks.png` graded plus `paintStoneDetail`, with
  **real face UVs** so the masonry actually resolves.

Honest gap against the goal:

| goal | now |
|---|---|
| ~1.6 units of stone visible | **2.7 units, 4 courses, far too tall** |
| cubes with visible top faces | blocks nearly coplanar, almost no top faces |
| grass steps down over the edge | plateau is a flat green lid stopping at a line |
| vegetation on the edge | none past the plateau boundary |
| mid blue-grey stone | **near-black, the lower half of frame is a dead mass** |
| interleaved grass and stone | strict separation |

So the *structure* is now right in kind (cubes, not a swept wall) and wrong in
*proportion, value and interleaving*.

## 3. PATH FROM HERE TO THERE

Do these in order. Batch several before rendering.

### Step 1 — Collapse the height (biggest single win)

In `buildBedrock()` in `app/terrain-hd.js`: reduce `COURSES` from 4 to **2**, and
raise `BOT` so only ~1.6 units of stone sit above the sea. Either raise `SEA_Y`
in `buildWater()` from `-3.05` toward `-1.9`, or lift the whole terrace. Current
`TERRACE_TOP` is `capBottom+.10` which is about `-0.325`; target bottom about
`-1.9`. Everything below the water plane is invisible anyway (camera
`lowerBetaLimit` `.22`, `upperBetaLimit` `1.42`), so geometry down to `-3.6` is
pure waste.

### Step 2 — Make them read as cubes

Give each block a larger **outward jitter (about 0.35)** and a **vertical jitter
(about 0.18)** so top faces are exposed to the camera. Right now jitter is 0.26
horizontal and zero vertical, so each course top is hidden by the block above.
Cube proportions should be near 1:1:1 at about 0.8 units.

### Step 3 — Cascade the grass over the edge (the thing that most sells the ref)

This is a change to `buildIslandTop()`, not just the cliff. Add a ring of
**grass-tile clones one step down and out** from the plateau on a sparse subset
of perimeter cells (about 35 percent), reusing the `grass_v7_orm.glb` clone path
and the existing D4 transform logic. Stone then starts *below those*. The
existing `hd_cliff_step_cap` blocks in `buildBedrock()` were a first stab at this
but they are boxes rather than real grass tiles and only one was generated;
replace them.

### Step 4 — Lift the stone value

Screen value of the wall is currently about 0.15; target 0.55 to 0.65. Three
levers, use all three modestly rather than one hard:

- vertex `tone()` in `buildBedrock()` (currently .52 to .96)
- the `grade()` `bright` / `tintR` on the `cliff_masonry` surface
- hemispheric light, **already raised .42 to .72 this session** along with teal
  rim .42 to .62, because every cliff face is vertical while the key light points
  mostly down (`-.48,-.86,.62`) so the key barely touches them. Measured effect
  was only about +5 mean levels, so the remaining work is in albedo and vertex
  tone, not in lights.

### Step 5 — Vegetation onto the edge

In `buildVegetation()`, allow blade clusters and daisies on the new stepped grass
caps and in the seams between the top course of cubes.

### Step 6 — Waterline

Sparse boulders already exist (`hd_shore_rock`, 22 of them). Once the height is
reduced they will sit correctly relative to the sea. Also fix the blown-out white
specular hotspot visible in the `profile` view on `hd_sea_mat` (roughness `.14`
with `metallic .16` is too sharp).

### Step 7 — Lock, then commit

Render `edge,corner,iso` plus `close`, compare to `ref_cliff_perimeter.png`, then
commit. Only after placement is locked should you consider thin instances for the
~314 cliff parts; they are currently merged into one mesh, so this is not urgent.

---

## 4. HARD-WON FACTS — do not rediscover these

### 4.1 `HD.roundedTile()` emits NO UVs

It writes positions, indices, colors and normals only. Every previous cliff box
used it, so all masonry albedo/normal/ORM maps collapsed to a single texel and
the whole lower island rendered as flat brown slabs. **This was the root cause of
the "giant smooth rectangular cake" complaint**, not the geometry.

New `stoneBox()` uses `MeshBuilder.CreateBox` with `faceUV` scaled by
`STONE_UV = 1.6` world units per repeat, plus `faceColors` for value tone.

### 4.2 The Tripo cliff GLBs were 95 percent GREEN across the entire albedo

Measured with `glb.py`: `cliff_straight_a.glb` image 0 is 4096x4096 and **95
percent of its pixels are green**. Tripo textured the whole asset as moss. That
is why every attempt to sink or trim the piece still produced a green blob on the
wall: **there was never any rock-coloured region to keep.** Two geometric trim
attempts (top 30/45/58 percent, then bottom 42 percent) all failed for this
reason. Do not try trimming again.

Fix shipped: **`handoff/tile_work/restone.py`** rebuilds the albedo from its
luminance (which carries all the sculpted detail) into desaturated blue-grey,
percentile-normalised to avoid crushed blacks, keeping a trace of the original
chroma. Output `assets/models/tiles/cliff_rock_a.glb` and `cliff_rock_b.glb`,
verified **0.0 percent green, mean rgb 119/128/131**. ORM and normal untouched.
`terrain-hd.js` now imports the `cliff_rock_*` files.

**Lesson for every future asset: measure the albedo hue distribution right after
Tripo, before building anything around it.**

### 4.3 glTF roughness trap (still true)

glTF *multiplies* `roughnessFactor` by the ORM green channel, so once a
metallicRoughness texture exists you can only make a material smoother from the
material side, never rougher. Matte correction belongs in `orm.py`.

### 4.4 Measured geometry (for placement maths)

```
grass slab      y -0.422 .. 0.442,  x +-7.001, z +-6.003   (terrainTopY = 0.445)
grass underside y -0.422  -> capBottom = top-0.87 = -0.425
sea plane       y -3.05  (alpha .985, hides everything below)
WORLD           { w:14, h:12, halfW:7, halfH:6 }
camera          beta .22..1.42, radius 7..60 -> underside never visible
```

### 4.5 Misc

- `app.js` `const state` is top-level classic script, not `window.state`. This
  session added `window.GEEBR_STATE=state` at the top of `main()` for the
  harness; `measure.py` reads `terrainTopY` from it.
- `apply_udiff` is unreliable on long `app.js` lines. Use Python string replace
  with `assert count==1`. All patch scripts are saved: `patch_cliff.py`,
  `patch_cliff2.py`, `patch_cliff3.py`, `patch_still.py`, plus the older
  `patch_app.py`, `patch2.py`, `patch3.py`, `patch_artmode.py`.
- No `node`; use `/files/home/runvnc/.deno/bin/deno check --no-lock`.
- Missing tools: blender, manifold3d, mapbox_earcut, pygltflib, pyembree, node.

---

## 5. Uncommitted state (git HEAD is still `a3cb475`)

Modified: `app/terrain-hd.js` (cliff rebuilt three times, still-mode hooks),
`app/app.js` (still mode, `GEEBR_STATE`, hemi/rim light lift),
`app/preflight.js` (`GEEBR_STILL_MODE`).

New assets: `assets/models/tiles/cliff_rock_a.glb`, `cliff_rock_b.glb`, plus the
staged originals `cliff_straight_a.glb`, `cliff_straight_b.glb`.

New tools: `handoff/tile_work/shot_views.py`, `measure.py`, `restone.py`,
`patch_cliff*.py`, `patch_still.py`.

Validation currently passing:

```bash
/files/home/runvnc/.deno/bin/deno check --no-lock app/terrain-hd.js app/app.js app/preflight.js app/look.js
git diff --check
```

## 6. Still 2D-only, after the cliff locks

`tree`, `rock_boulder3` (v3 is the good one), `crate`, `rock_cluster`,
`rock_slab`, `house`, `barrel`. Concepts are in `handoff/tile_work/` and
`sheet_final.png`. Conversion is mechanical: `tripo_one.py`, then `bake.py 0.60`,
then `orm.py`, then **check albedo hue (see 4.2)**, then integrate.

Explicitly rejected by the user: per-instance colour tint jitter, extra ordinary
grass slab variants, regenerating the tile source image.
