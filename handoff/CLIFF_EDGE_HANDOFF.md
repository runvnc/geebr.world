# geebr.world — Island Edge / Cliff Handoff

**Updated:** 2026-07-25 (session 5)
**Repo:** `/files/geebr.world` · branch `main` · HEAD `12585b6`
**Master visual target:** `/xfiles/localmr/static/imgs/gpt_image_7fRofQ_FKB_m9w_0.png`
**Best edge reference crop:** `handoff/tile_work/ref_cliff_perimeter.png`, right half
**Side by side (ref | current):** `handoff/tile_work/goal_vs_current.jpg`

This document supersedes sections 4 to 6 of `RENDERING_HANDOFF.md` for the cliff
work specifically. Everything else there (art direction, asset pipeline,
`look.js`, vegetation) still stands.

---

## 0. Environment facts that matter more than the art

### 0.1 CPU meltdown — fixed, do not regress it

An older harness launched Chromium with `--use-angle=swiftshader`, which
rasterises on all 12 CPU cores, and when it timed out it orphaned 46 chrome
processes that kept burning CPU for minutes. This forced two hard reboots.

Both causes are fixed in `handoff/tile_work/shot_views.py`:

- `--use-angle=gl-egl --use-gl=angle --enable-gpu` binds the real RTX 2060 even
  headless (DISPLAY=:0 is present). The probe line must say NVIDIA.
- `sweep()` runs `pkill -9 -f use-angle=gl-egl` before the run and in a
  `finally`, plus `browser.close()` under a timeout.

A three-view render is about 7 s total, 0.15 s per shot. Never put swiftshader
back. `shot_fast.py`, `shot_app.py`, `ab_app.py` and `probe.py` still contain it
and are superseded.

### 0.2 Still mode

`window.GEEBR_STILL_MODE` in `app/preflight.js`, implied by `?art=1`, also
`?still=1`: physics step 0, the sea's 4,225-vertex CPU rewrite runs once instead
of per frame, foam/ripple/lantern observables not registered. `?art=1` also
skips the 3 GB LiteRT model and Pocket-TTS. Always review with
`?art=1&webgl=1`.

### 0.3 Commands

```bash
python3 -m http.server 8791 --directory /files/geebr.world/app   # leave running

cd /files/geebr.world/handoff/tile_work
timeout 100 python3 -u shot_views.py /tmp/g 640 440 edge,corner,iso
# views: iso edge corner water top close profile far; trailing 'ids' = flat ID pass
timeout 90  python3 -u measure.py all          # bounds only, no screenshots
python3 mk.py /tmp/sheet.jpg 400 275 - a.jpg b.jpg   # <45KB composite
```

---

## 1. THE METHOD THAT ACTUALLY WORKED — read this before touching the art

Four previous shapes were built and rejected by eye, each taking a whole pass.
What finally converged was **measuring the render against the reference crop
with numpy and fixing whichever number was furthest off.** Two lines of code:

```python
a = np.asarray(Image.open(shot).convert('RGB')).astype(float)/255
lum = a @ [.299,.587,.114]
mx, mn = a.max(2), a.min(2); sat = (mx-mn)/(mx+1e-6)
stone = (sat < .20) & (lum > .15)
green = (a[:,:,1] > a[:,:,0]+.02) & (a[:,:,1] > a[:,:,2]+.02)
print(lum[stone].mean(), a[stone].mean(0)*255, sat[stone].mean(),
      green.mean(), np.percentile(lum,10), np.percentile(lum,90))
```

Run it on `/tmp/x_edge.jpg` and on `ref_cliff_perimeter.png` cropped to
`(w//2, 0, w, .62h)`, and compare. Every real fix this session came from a
number, and two of them were things the eye had misattributed for two sessions.

Current standing (reference | ours):

| metric | ref | ours |
|---|---|---|
| stone mean luminance | .259 | .263 |
| stone rgb | 64/67/65 | 63/70/62 |
| stone saturation | .177 | .116 |
| green fraction of frame | .409 | .365 |
| 10th percentile luminance | .049 | .094 |
| 90th percentile luminance | .351 | .318 |

Value and hue are matched. The remaining gap is **contrast range**: our darks
bottom out around .09 where the reference reaches .05, which is what still
makes the stone read slightly like poured concrete rather than quarried rock.

## 2. WHAT THE EDGE IS NOW

`buildBedrock()` in `app/terrain-hd.js`, driven by a new shared `edgeProfile()`.

- **`edgeProfile()`** is one deterministic description of the perimeter,
  consumed by `buildIslandTop()` (grass cascade), `buildBedrock()` (stone) and
  `buildVegetation()` (plants). Interleaving the three was impossible while each
  builder invented its own perimeter, which is why earlier attempts had strict
  grass/stone separation.
- **Two stone cubes per grass tile across**, occasionally merged into one
  full-tile cube. Three courses of about 0.46, cubes wider than tall.
- **Grass cascade:** 58% of perimeter cells drop a real `grass_v7_orm.glb`
  clone one step down and out, a third of those a second step. They merge into
  `hd_island_grass` and share its material.
- **Vegetation** follows onto those steps, onto the stone treads, and spills
  over the plateau lip.
- **Rounded boulders** (`boulder()`, jittered flat-shaded icosphere) on the
  plateau and in the shallows. Cubes were tried here and just looked like wall
  fragments.
- **Sea raised to −1.42** (was −3.05). The camera can never see below the
  waterline (`beta` .22 to 1.42), so hem depth is free; raising the sea is the
  cheapest way to control how much stone shows.
- The imported `cliff_rock_*.glb` accents were **removed from the runtime** —
  sized for the old tall wall, they dwarfed the half-tile cubes.

Key constants, all near the top of part 2 of `terrain-hd.js`:

```
TOP_Y      .445    grass slab top (also state.terrainTopY)
CAP_BOTTOM -.425   grass slab underside
SEA_LEVEL  -1.42
GRASS_LIP   .26    visible green on the vertical face before stone starts
STONE_UV    3.4    world units per stone texture repeat
COURSE      .46    stone course height
```

## 3. THE FIVE ROOT CAUSES FOUND SO FAR — do not rediscover these

### 3.1 `HD.roundedTile()` emits NO UVs

Positions, indices, colors, normals only. Every pre-session-4 cliff box used it,
so all masonry maps collapsed to one texel. That, not the geometry, was the
original "giant smooth rectangular cake". `stoneBox()` uses `CreateBox` with
real `faceUV`.

### 3.2 The Tripo cliff GLBs were 95% GREEN across the whole 4096 albedo

Tripo textured the entire asset as moss, so no trim or placement could ever hide
it; three trim attempts failed for this reason. `restone.py` rebuilt the albedo
from luminance into desaturated blue-grey (0.0% green, mean 119/128/131).
**Measure albedo hue distribution immediately after Tripo for every asset.**

### 3.3 `stone_blocks.png` is a printed brick grid

It is a 512px grid of small square tiles. Every cube face therefore wore
brickwork, and a row of cubes wearing brickwork reads as one masonry wall no
matter how the geometry is staggered. This is why sessions 4 and 5 kept
improving silhouette without fixing the "retaining wall" look. The edge now uses
`stone_soft.png` (blotchy, no grid) plus a new `paintStoneChips()` detail pass.
**`stone_blocks.png` is fine for a floor and wrong for a cube.**

### 3.4 The dominant surface at the edge was the GRASS TILE's own side

The `grass_v7` slab is 0.87 units tall and only its top is green, so the plateau
presents a 0.87-unit dark green brick wall and the stone used to start
*underneath* it. Measured: that band was 58/66/56 while our stone was 79/77/61 —
two different rocks in the same frame. Fixed by raising the top course to
`TOP_Y - GRASS_LIP`, so stone stands in front of the slab side and only a thin
green lip shows, as in the reference. Rescaling the tile asset instead would
break the terrain grid, physics heights and every prop placement.

### 3.5 A big emissive lift kills the darks

Every cliff face is vertical while the key light points down (−.48,−.86,.62), so
lights barely reach them; raising hemi .42→.72 moved the mean by about 5 levels.
An emissive copy of the albedo does lift the mean, but it is a **floor**: at
.155 nothing in the frame could go below .12 and every seam sat at mid grey. The
working combination is a small emissive (.026) plus `environmentIntensity` 1.05
plus strong baked AO (.72) plus a wide per-face tone spread.

### 3.6 Column spread versus course spread

Outward variation **between columns** makes pillars and canyons. Outward
variation **between courses within a column** makes a grid. Earlier the first
was ±.25 and the second ±.05, which is exactly the recipe for pillars; they are
now .10 and ±.15.

### 3.7 glTF roughness trap (unchanged)

glTF multiplies `roughnessFactor` by the ORM green channel, so once a
metallicRoughness texture exists a material can only be made smoother. Matte
correction belongs in `orm.py`.

## 4. WHAT IS LEFT

In priority order. All small.

1. **Deepen the darks** to reach the reference's .05 floor: SSAO strength on the
   cliff, or a dark vertex tone on the bottom face and on the recessed courses.
   This is the single remaining measured gap.
2. **Stone saturation .116 → ~.16.** Raise `sat` in the `cliff_masonry` grade
   slightly; the reference rock keeps a visible olive cast.
3. **Corner stacks** are still two big 45-degree cubes and now look coarse next
   to the half-tile grid. Rebuild them from the same `cols` machinery.
4. **A raised cluster.** The reference has one spot where stone cubes stack
   *above* the plateau. Nothing does that yet.
5. **Thin instances** for the roughly 400 cliff parts. They merge into one mesh
   so this is performance housekeeping, not urgent.
6. `hd_sea_mat` was fixed (roughness .14→.34, metallic .16→.06, env .75→.42) but
   the foam collar, now moved out to the real waterline, could use another look.

## 5. Misc

- `app.js` `const state` is a top-level classic script, not `window.state`;
  `window.GEEBR_STATE=state` is set at the top of `main()` for the harness.
- `apply_udiff` is unreliable on long `app.js` lines. Use Python string replace
  with `assert count==1`. This session's patches are `patch_cliff4.py` through
  `patch_cliff15.py`, applied in order against `a73b7a5`.
- No `node`; use `/files/home/runvnc/.deno/bin/deno check --no-lock`.
- Missing tools: blender, manifold3d, mapbox_earcut, pygltflib, pyembree, node.
- Validation: `deno check --no-lock app/terrain-hd.js app/app.js app/preflight.js
  app/look.js` and `git diff --check`.

## 6. Still 2D-only, after the edge locks

`tree`, `rock_boulder3` (v3 is the good one), `crate`, `rock_cluster`,
`rock_slab`, `house`, `barrel`. Concepts in `handoff/tile_work/` and
`sheet_final.png`. Conversion is mechanical: `tripo_one.py`, `bake.py 0.60`,
`orm.py`, **check albedo hue (3.2)**, integrate.

Explicitly rejected by the user: per-instance colour tint jitter, extra ordinary
grass slab variants, regenerating the tile source image.

---

## 7. Session 5b addendum — edge finished at `332221f`

Items 1 to 4 of section 4 are **done**. Patches `patch_cliff16.py` through
`patch_cliff19.py`.

### 7.1 The p10 luminance target was a MEASUREMENT ARTIFACT — do not chase it

Section 1 lists "deepen the darks to .05" as the one remaining measured gap.
**That was wrong.** Breaking the darkest 10% of pixels down by image band from
top to bottom:

```
band      1      2      3      4      5      6
ref      .219   .035   .053   .104   .094   .099
ours     .093   .129   .127   .117   .141   .000
```

Band 1 in the reference crop is shadowed island interior and dark water BEHIND
the edge, not cliff. Across the actual cliff (bands 2 to 5) our stone already
carries MORE dark pixels than the reference does, and our band 6 is open water
with none. The two crops simply frame different amounts of dark background.

A first attempt at closing the gap dropped stone luminance to .231, *below* the
reference's .259, while p10 moved only .094 to .082 — i.e. the whole surface
shifted down instead of the range widening, paying for shadow out of the
midtones. **When comparing whole-frame percentiles against a reference crop,
verify the dark pixels are in the same PART of the image first.** Per-region
means (stone mask, green mask) are trustworthy; whole-frame percentiles are not.

Final stone, and this is close enough that further tuning is noise:

| | ref | ours |
|---|---|---|
| luminance | .259 | .248 |
| rgb | 64/67/65 | 60/66/58 |
| saturation | .177 | .131 |

### 7.2 What shipped

- **Corner stacks** rebuilt from the same half-tile cube grammar as the runs
  (three sub-stacks per corner, one on the diagonal at 45 degrees, coursed at
  `COURSE`). The old two-big-blocks version was tall-wall-era and read as a
  bastion pasted onto a fine grid.
- **`hd_cliff_stack`**: cubes stacking ABOVE the plateau at two sites.
  `hd_cliff_wall` now reaches y `1.785` against a plateau top of `0.445`. This is
  what breaks the flat-lid silhouette in wide shots.
- **`depthTone(y, recess)`** replaces flat random tone on the run blocks: darkens
  by depth down the hem and by how far a course is set back behind its
  neighbours. Face tones widened to top `1.42`, lit `1.04`, shade `.60`, bottom
  `.20`, and the `g()` clamp raised `1.25` to `1.55` because it was clipping the
  brighter tops back into a flat plateau.
- **Seam width matters more than SSAO strength.** Cube width `.42` to `.37`
  (`.90` to `.84` for the wide variant). The old `0.04` gaps were finer than the
  SSAO sample radius at review distance, so geometry that fine cannot be
  darkened by an occlusion pass however hard it is driven — raising strength
  `2.2` to `3.1` alone bought almost nothing. SSAO is now `radius .62,
  strength 3.1, samples 20` in `app.js`.
- Stone grade `sat 1.02, bright 1.24, contrast 1.26`, neutral tint.
- **Edge daisies cut `.34` to `.09`.** Three clusters per spot at `.34` turned
  the whole rim yellow-speckled; the reference has a few WHITE daisies well
  inside the plateau and only green blades on the edge cubes.

### 7.3 Only remaining edge item

Thin instances for the ~400 cliff parts. They merge into one mesh, so this is
housekeeping, not a cost. **The edge is otherwise closed** — next work is the
props in section 6, starting with the tree.

---

## 8. Session 5c — boulder fix + START HERE FOR THE TREE

**HEAD `71fe6b1`, pushed, tree clean.** The island EDGE IS DONE. The next piece
of work is the TREE, and it has already been scoped — read 8.2 and 8.3 and start
writing code, no investigation needed.

### 8.1 Shattered boulders — FIXED, and the general rule behind it

The user spotted the plateau rocks rendering as splayed shards with visible gaps
and nonsensical shading, and asked whether the vertices had been reversed.

They had not. `boulder()` (added in `patch_cliff8`) jittered **every vertex of
the position array independently**, but `CreateIcoSphere({flat:true})`
**DUPLICATES vertices per face** — that duplication is exactly how it produces
flat shading, so each corner of the icosphere exists five or six times, once per
adjoining face. Jittering them independently moved each copy of the same corner
somewhere different and tore the faces apart from one another. The mesh simply
stopped being a closed solid.

Fixed in `patch_boulder.py`: the displacement is now derived from the ORIGINAL
position through a quantized `Map` key, so every duplicate of a given corner
gets the identical displacement and the hull stays watertight while still
deforming.

> **General rule, worth remembering for the tree:** never jitter the vertex array
> of a flat-shaded mesh directly. Any deformation must be a pure function of the
> original position so shared corners stay shared. This will apply the moment
> anyone adds vertex noise to the tree tiers.

**NOT VISUALLY CONFIRMED.** The code is correct and committed, but Playwright
kept dropping its driver connection at the end of the session and the close-up
never rendered. `/tmp/rockshot.py` is a small harness that finds the nearest
plateau `hd_edge_stone` and frames it at radius 1.7 — **run that first thing** to
confirm, then delete it or fold it into `shot_views.py` as a `rock` view.

If Playwright is still flaky: `pkill -9 -f use-angle=gl-egl`, wait a second, and
re-run. Note that `pgrep -c chrome` returns ~40 on this machine from the user's
OWN desktop Chrome — **that is normal, do not kill it.** Only ever match on
`use-angle=gl-egl`, which is unique to our harness.

### 8.2 THE TREE — decision already made: build it PROCEDURALLY

The user reviewed the options and chose to **hand-author the tree in code**,
explicitly waiving the "do not replace reference-derived art with procedural
substitutes" rule in `RENDERING_HANDOFF.md` **for this asset only**. Rationale:
a tree at diorama scale is pure silhouette plus shading with essentially no
surface texture, so the thing Tripo is good at buys nothing, while thin flared
skirts are the topology Tripo handles worst.

**That rule still stands for `crate`, `house`, `barrel` and the rocks**, where
baked wood grain and stone surface genuinely matter. Do not generalise this.

Do **NOT** use `handoff/tile_work/asset_tree.png`. It is a 3-tier smooth
low-poly pine with flat single-tone green, and it does not match the master — it
is barely distinguishable from the procedural cone stack already in
`buildFlora()`.

### 8.3 What the master tree ACTUALLY looks like — build to THIS

Measured from a 1.7x crop of the master image, tree cluster at
`crop(w*0.36, h*0.10, w*0.72, h*0.42)` of
`/xfiles/localmr/static/imgs/gpt_image_7fRofQ_FKB_m9w_0.png`. **Re-crop it and
look before writing code** — the user's note this session was that these
subtleties were being missed:

1. **5 to 6 tiers**, not three. The current procedural `pine()` uses 3 to 5 and
   reads far too blobby.
2. Tiers are **thin flared skirts**, wide and shallow, NOT smooth tall cones.
   Each skirt's lower edge is **notched / scalloped**, not a clean circle.
3. **Strong dark undersides.** The near-black gap beneath each skirt is most of
   what makes the form read. This is the single most important property and the
   current version has none of it.
4. **Two-tone green:** light yellow-green on the upper surface of each tier,
   dropping to near-black in the gaps. Not one flat green.
5. **Slight twist between consecutive tiers** (yaw offset per tier).
6. Short **octagonal dark warm-brown trunk**, mostly hidden by the lowest skirt.
7. Tall narrow silhouette, roughly **2.5:1 height to base width**. Several
   distinct sizes are present in the master, not one scale.

Implementation notes: this is a stack of flared octagonal frustums, so
`CreateCylinder` with `tessellation:8` per tier and a per-tier `faceColors` /
vertex tone is the natural approach — the same per-face tone trick that fixed
the cliff cubes (see 7.2) applies directly, and it is what will give the dark
undersides. Replace `pine()` in `buildFlora()` in `app/terrain-hd.js` around
line 1057; keep the existing `trunks` / `leavesA` / `leavesB` merge groups so
the draw-call structure is unchanged.

### 8.4 Verify like the edge was verified

The measurement discipline in section 1 is what made the edge converge; use it
here too. Crop a tree from the master and from a render, compare mean green rgb,
saturation, and the **luminance spread between tier tops and undersides** — that
spread is the whole game for this asset. But remember 7.1: compare LIKE REGIONS,
not whole-frame percentiles.

Useful views: `iso` and `far` show the tree line, `close` for one tree.
