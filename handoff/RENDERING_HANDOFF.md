# geebr.world — Art / Rendering Pipeline

**Updated:** 2026-07-26
**Master target:** `/xfiles/localmr/static/imgs/gpt_image_7fRofQ_FKB_m9w_0.png`

This is the durable technical reference. For upcoming work and acceptance order,
see [`MASTER_MATCH_PLAN.md`](MASTER_MATCH_PLAN.md).

## Current baseline

- Grass terrain, vegetation, island edge, boulders, water, and scenery are integrated.
- Trees use `assets/models/props/gen/tree.glb`, converted from
  `tile_work/asset_tree.png`; procedural and legacy fallback trees are removed.
- Raised edge rocks are compact supported outcrops, not vertical stacks.
- Crate and barrel GLBs are integrated; next hero GLB is the house, then approved rock concepts.

Validate every change:

```bash
/files/home/runvnc/.deno/bin/deno check --no-lock app/terrain-hd.js app/app.js app/preflight.js app/look.js
git diff --check
```

## Locked art direction

- Smooth matte clay/resin miniature; never fuzzy or photoreal.
- Desaturated olive/moss grass with flat tops, tight bevels, crisp edges, and thin dark seams.
- Roughness about `.88`, metallic `0`, restrained shared clay detail.
- Grassiness comes from separate blade and daisy assets.
- No per-instance color tint jitter and no extra ordinary grass-slab variants.
- Reusable GLBs and shared import/material behavior are preferred over scenario-specific procedural substitutes.

## Image-to-3D pipeline

```text
master crop
→ edit2.py with input_fidelity=high
→ isolated object on uniform light-gray background
→ tripo_one.py IMAGE RAW.glb FACE_LIMIT
→ inspect geometry and albedo hue/value
→ bake.py RAW.glb BAKED.glb GAIN
→ orm.py BAKED.glb FINAL.glb
→ integrate with applyClayLookToMeshes()
→ close + iso + far render review
```

Source-image requirements: one centered object, generous margin, even neutral
studio light, no ground plane, cast shadow, gradient, text, or watermark. Start
from a fresh master crop after at most about three edit hops; repeated edits
introduce felt/halftone artifacts. Describe desired qualities positively and
change one thing per edit.

Tripo facts discovered in production:

- Use `texture:'HD'`, `pbr:true`, and control complexity with `face_limit`.
- Tripo often de-lights and over-brightens albedo; `0.60` is a starting bake gain,
  not a universal answer. Measure each asset immediately.
- Tripo can transfer the wrong hue across an entire asset (cliff output was 95%
  green), so placement cannot rescue a bad atlas.
- Raw ORM has ineffective AO, semi-gloss roughness, and stray metallic values.
  `orm.py` ray-traces AO, adds cavity, targets matte roughness, and zeros metallic.
- Tripo normal maps are nearly blank. Runtime micro-detail comes from the shared
  `assets/textures/detail_clay_n.png` through `app/look.js` at level `.11`.
- glTF multiplies roughnessFactor by ORM green; repair roughness in `orm.py`, not
  by trying to raise the runtime material scalar.

Useful scripts in `handoff/tile_work/`:

- `edit2.py`, `tripo_one.py`, `bake.py`, `orm.py`, `glb.py`
- `shot_views.py`, `shot_tile.py`, `measure.py`, `mk.py`
- `restone.py` is a specialized retained example for recoloring bad stone albedo.
- Do not use `tint.py`.


## Crate asset integration (2026-07-26)

Source `tile_work/asset_crate.png` was converted at 3,000 and 5,000 faces. Both
were inspected through four azimuths; the 5k output retained cleaner broad braces,
corner blocks, and rear faces, so it was selected. Final pipeline:

```text
asset_crate.png -> Tripo 5k -> bake.py gain .60
-> orm.py --rough .88 --roughvar .035 --ao .85 --cavity .5
-> assets/models/props/gen/crate.glb
```

Final mesh: 4,994 faces / 3,936 vertices; near-unit bounds, no backing plane or
open side, AO declared, metallic zero. The imported decorative instances replace
the old boxes. `makeCrate()` retains an invisible `.72` box physics/picking proxy
and parents the same reusable GLB visual to it. Close, `iso`, and `far` passed on
the NVIDIA renderer. `shot_views.py` now has a `crate` framing mode.

## Barrel asset integration (2026-07-26)

Source `tile_work/asset_barrel.png` was converted at 3,000 and 5,000 faces. The
5k result was selected for its cleaner segmented rim, stave seams, and circular
bands. Final pipeline: Tripo 5k; `bake.py` gain `.60`; `orm.py --rough .88
--roughvar .035 --ao .85 --cavity .5`. Final asset is
`assets/models/props/gen/barrel.glb` at 5,000 faces / 3,203 vertices. Interactive
barrels retain their invisible `.78 x .55` cylinder proxy and load this GLB as
the shared visual. Metallic is zero and geometric/cavity AO is declared.

## Runtime look

`app/look.js` is the shared material/post source.

- Neutral tonemap: exposure `1.28`, contrast `1.10`.
- SSAO2: strength `3.1`, radius `.62`, samples `20`, maxZ `60`.
- Shared detail level `.11`; PBR metallic forced to `0`.
- Real DOF; corrected camera depth and shadow darkness.
- Terrain top: `.445`; sea level: `-1.42`.

Current terrain asset: `assets/models/tiles/grass_v7_orm.glb`. Current generated
vegetation assets: `blade_cluster.glb`, `daisy_clump.glb`, and `tree.glb` under
`assets/models/props/gen/`.

## Edge facts worth retaining

The finished edge is generated from one shared `edgeProfile()` consumed by grass,
stone, and vegetation. It uses two cubes per tile across, three courses around
`.46` high, a `.26` grass lip, and stepped grass/vegetation over the rim.

Root causes that must not be rediscovered:

1. `HD.roundedTile()` has no UVs; textured boxes need real UVs.
2. `stone_blocks.png` is a printed brick grid and makes each cube look like a
   miniature wall. Use the ungridded stone surface for individual blocks.
3. The grass GLB slab side is tall; stone must begin at `TOP_Y-GRASS_LIP` rather
   than below the slab.
4. Large emissive lifts erase dark seams because emissive is a floor.
5. Variation between columns creates pillars; variation between courses creates a grid.
6. Whole-frame percentiles are untrustworthy when dark pixels occupy different
   regions. Prefer per-region masked means and visual geometry checks.
7. Aggregate color measurements cannot detect spikes, holes, unsupported blocks,
   or bad silhouette. Always inspect actual renders.

Final edge constants in `app/terrain-hd.js`:

```text
TOP_Y .445   CAP_BOTTOM -.425   SEA_LEVEL -1.42
GRASS_LIP .26   STONE_UV 3.4   COURSE .46
```

## Safe render workflow

```bash
python3 -m http.server 8791 --directory /files/geebr.world/app
cd /files/geebr.world/handoff/tile_work
timeout 100 python3 -u shot_views.py /tmp/g 640 440 iso,far,corner
timeout 90 python3 -u measure.py all
```

`shot_views.py` must report the NVIDIA renderer. Never restore SwiftShader: it
previously saturated all CPU cores and left orphan Chrome processes. `?art=1`
implies still mode and skips the LLM/TTS load. Superseded unsafe harnesses are
`shot_fast.py`, `shot_app.py`, `ab_app.py`, and `probe.py`.

Review every integrated asset close-up and in full-grid `iso`, `far`, and an
opposite corner. Build small composites with `mk.py`; avoid repeatedly loading
full-resolution PNGs into chat context.

## Engineering constraints

- No Node; use `/files/home/runvnc/.deno/bin/deno check --no-lock`.
- Missing locally: Blender, manifold3d, mapbox_earcut, pygltflib, pyembree.
- `apply_udiff` is unreliable on long `app.js` lines; use Python replacement with
  asserted match counts.
- Batch related edits before rendering, but verify after each logical patch.
