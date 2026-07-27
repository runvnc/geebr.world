# geebr.world — Current Work Handoff

**Updated:** 2026-07-26  
**Repository:** `/files/geebr.world`  
**Branch:** `main`  
**Master target:** `/xfiles/localmr/static/imgs/gpt_image_7fRofQ_FKB_m9w_0.png`  
**Durable references:** [`MASTER_MATCH_PLAN.md`](MASTER_MATCH_PLAN.md), [`RENDERING_HANDOFF.md`](RENDERING_HANDOFF.md)

This is the short operational handoff for the next session. The two durable
documents above remain authoritative for the asset pipeline, art direction,
edge construction, runtime look, and phase ordering.

## 1. Repository state

Committed HEAD before the two pending visual tests:

```text
f2501fb composition: open quiet space and strengthen firelight
```

The branch is four commits ahead of `origin/main`.

Committed work in this session:

```text
5473669 props: integrate reference-derived crate GLB
7224ce4 props: integrate reference-derived barrel GLB
67a2933 props: replace tent with reference-derived house
f2501fb composition: open quiet space and strengthen firelight
```

There are currently **two intentionally uncommitted changes**:

1. `app/terrain-hd.js`: the house rotation changed from `-Math.PI/2` to
   `Math.PI/2`, intended to make its door face the island centre.
2. `app/app.js`: an extreme low-ambient lighting experiment plus a brighter
   campfire.

Do not accidentally bundle these into unrelated rock work. Decide whether to
keep or revert them first.

## 2. New generated assets now integrated

### Crate

```text
source: handoff/tile_work/asset_crate.png
Tripo comparison: 3k vs 5k
selected: 4,994 faces / 3,936 vertices
bake gain: .60
ORM: --rough .88 --roughvar .035 --ao .85 --cavity .5
runtime: assets/models/props/gen/crate.glb
```

The same GLB is used by decorative scenery and interactive crates. Interactive
crates retain an invisible `.72` box physics/picking proxy. The 5k output had
cleaner broad braces, corner blocks, and rear faces.

### Barrel

```text
source: handoff/tile_work/asset_barrel.png
Tripo comparison: 3k vs 5k
selected: 5,000 faces / 3,203 vertices
bake gain: .60
ORM: --rough .88 --roughvar .035 --ao .85 --cavity .5
runtime: assets/models/props/gen/barrel.glb
```

Interactive barrels retain their invisible `.78 x .55` cylinder proxy. The 5k
output had cleaner stave seams, segmented rim, and circular bands.

### House

```text
source: handoff/tile_work/asset_house.png
Tripo comparison: 10k vs 15k
selected: 14,992 faces / 10,394 vertices
bake gain: .60
ORM: --rough .88 --roughvar .035 --ao .85 --cavity .5
runtime: assets/models/props/gen/house.glb
```

The house replaces the procedural tent at `(4.15, -1.35)`, scaled to about 2.35
grid cells. It preserves the central play area. The committed orientation is
`-Math.PI/2`; the uncommitted test uses `Math.PI/2` to turn the doorway inward.

`shot_views.py` now includes `crate`, `barrel`, and `house` framing modes.

## 3. Composition changes already committed

The first composition pass is in `f2501fb`:

- Plateau vegetation reduced from about 419 to about 325 blade-cluster instances.
- Larger quiet zones were created around the centre, house, and campfire.
- Perimeter tree attempts were reduced from 58 to 44 while retaining a back line.
- Campfire moved from `(1.8, 2.6)` to `(1.0, .45)`.
- Campfire light increased from `.55` to `2.15`, range tightened to `4.2`.
- Cool lighting was reduced from hemi/rim/fill `.72/.62/.30` to `.50/.42/.18`.
- Environment intensity remained `.38` in the committed state.
- Warm directional key remains intensity `3.1`.

The island footprint was deliberately not rewritten yet. The shared
`edgeProfile()` already creates stepped/cascaded irregularity. Cutting core
plateau cells would affect walkability, collision, vegetation, and all edge
builders. Revisit coordinated side/corner notches only after rocks and final
prop composition are placed.

## 4. Important unresolved lighting issue

The user reports **no noticeable change in their normal browser render** after
very large ambient-light reductions, even though the headless `shot_views.py`
captures show a small difference.

The current uncommitted experiment is intentionally extreme:

```text
hemi intensity:        .50  -> .125
rim intensity:         .42  -> .105
cool fill intensity:   .18  -> .045
environment intensity: .38  -> .095

campfire intensity:    2.15 -> 3.4
campfire range:        4.2  -> 4.6
campfire flicker base: 2.05 -> 3.25
```

Despite a 75% ambient reduction, the resulting headless comparison is only
subtly darker, and the user sees no meaningful change in their browser.

### Do not keep turning the same four knobs blindly

The likely reasons are:

1. The warm directional key at `3.1` dominates the visibly lit plateau.
2. Neutral tonemap exposure `1.28` and post-processing compress the apparent
   difference.
3. SSAO and baked material AO dominate contact-dark appearance.
4. The sky dome is emissive/unlit, so its bright cyan/blue background does not
   respond to scene lights.
5. Some PBR material settings and baked albedos may dominate over weak ambient.
6. The browser may be serving stale resources or preserving an old tab/session.
7. The user's normal browser path may differ from `?webgl=1&art=1`, including
   WebGPU/WebGL differences, post-pipeline behavior, cache, viewport, and state.
8. The target's dark perimeter is partly composition/background/vignette/DOF,
   not merely ambient illumination.

### Next diagnostic must prove which path is active

Before any further aesthetic tuning:

1. Add a visible temporary build/revision marker or expose current light values
   through `window.GEEBR_STATE` and verify them in the user's browser console.
2. Hard-refresh with cache disabled and confirm `app.js` response content.
3. Compare normal WebGPU and `?webgl=1&art=1` from the same camera.
4. Make an unmistakable diagnostic test:
   - set warm key intensity to `0`, or
   - set hemi/rim/fill/environment all to `0`,
   - disable tonemapping/post temporarily,
   - render once.
   If the browser still barely changes, the edited runtime is not the one being
   viewed or the output is dominated by an unlit/emissive path.
5. Inspect effective lights and materials at runtime rather than trusting source:
   `scene.lights`, `scene.environmentIntensity`, material emissive colors, and
   active rendering pipelines.
6. Only after diagnosis, choose a physically clearer hierarchy:
   dark ambient/environment, moderate warm key, local fire/lantern pools, and a
   darker sky/background around the silhouette.

The uncommitted low-ambient experiment should be treated as diagnostic, not as a
finished look.

## 5. Current visual differences from the master

The full master target has:

- much darker navy/black negative space around the island;
- stronger local warm pools from fire and lantern;
- a clear central play area populated by several characters and hero props;
- grouped rock landmarks rather than many tiny scattered stones;
- denser, deliberate tree mass at the rear but quieter middle distance;
- fewer uniformly distributed grass clumps;
- an irregular stepped island silhouette;
- house at back-right with doorway oriented toward the playable centre;
- crates/barrel/fire placed as readable composition anchors.

Current project improvements:

- hero crate, barrel, house, and tree are authored GLBs;
- vegetation carpet is reduced and quiet areas exist;
- campfire is nearer the centre;
- house and island edge are strong;
- the scene is still missing the approved grouped rock assets;
- a blank demo starts with one Geebr, unlike the four-character master;
- prop placement does not yet fully reproduce the master's composition;
- perimeter/interior tree and fence intersections still need cleanup.

## 6. What to do next

After resolving whether to keep the house flip and diagnosing the lighting path:

1. Convert and integrate `rock_boulder3` first.
2. Convert `rock_cluster`.
3. Convert `rock_slab`.
4. Replace procedural plateau boulders and establish grouped rock landmarks.
5. Arrange crate, barrel, rocks, fire, flowers, sign, house, and trees against the
   master composition.
6. Resolve tree/fence and vegetation/prop intersections.
7. Reassess island silhouette. Add only a few coordinated side/corner notches if
   it still reads too rectangular.
8. Perform final lighting/material pass only after composition locks.

Approved rock source images:

```text
handoff/tile_work/asset_rock_boulder3.png
handoff/tile_work/asset_rock_cluster.png
handoff/tile_work/asset_rock_slab.png
```

Required pipeline remains:

```text
source -> tripo_one.py -> albedo hue/value check -> bake.py -> orm.py
-> integrate with shared clay look -> close + iso + far + opposite-corner review
```

## 7. Tool and safety reminders

Safe validation:

```bash
/files/home/runvnc/.deno/bin/deno check --no-lock \
  app/terrain-hd.js app/app.js app/preflight.js app/look.js
git diff --check
```

Safe render:

```bash
python3 -m http.server 8791 --directory /files/geebr.world/app
cd /files/geebr.world/handoff/tile_work
timeout 100 python3 -u shot_views.py /tmp/g 640 440 iso,far,corner
```

`shot_views.py` must report the NVIDIA renderer. Never restore SwiftShader.
Only kill Chrome processes whose command line contains `use-angle=gl-egl`; the
user's desktop Chrome processes are normal and must not be killed.

Do not use high-level `find` under `/files`. No Node; use Deno. `apply_udiff` is
unreliable on long `app.js` lines; use Python replacements with asserted counts.

`handoff/tile_work/work/` was removed after each completed asset. Regenerate raw
comparison files if needed; final GLBs are in `assets/models/props/gen/`.

## 8. Immediate git decision

Current working-tree diff is small and explicit:

```text
app/terrain-hd.js:
  house rotation -Math.PI/2 -> Math.PI/2

app/app.js:
  campfire 2.15/range 4.2 -> 3.4/range 4.6
  ambient/environment reduced to 25% of committed composition values
```

Recommended next session action:

- keep the inward house orientation unless visual inspection proves it is wrong;
- do not commit the lighting test until the user's browser/runtime discrepancy is
  diagnosed;
- either revert only the lighting hunks or commit house and lighting separately.
