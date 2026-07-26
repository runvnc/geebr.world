# geebr.world — Rendering / Art Pipeline Handoff

> **CLIFF / ISLAND EDGE WORK LIVES IN**
> [`handoff/CLIFF_EDGE_HANDOFF.md`](CLIFF_EDGE_HANDOFF.md). Start there: it also
> documents the render-harness GPU fix (do not regress it, it nearly froze the
> machine), still mode, and the Tripo green-albedo discovery.
>
> This file remains authoritative for art direction, the asset pipeline, the
> `look.js` render settings, terrain/vegetation state and the tool list.

**Updated:** 2026-07-25
**Repo:** `/files/geebr.world` · branch `main`
**Master visual target:** `/xfiles/localmr/static/imgs/gpt_image_7fRofQ_FKB_m9w_0.png`

## 1. Current state

Grass tiles, terrain elevation and vegetation are integrated and committed. The
island edge / cliff is in progress — see `CLIFF_EDGE_HANDOFF.md` for its exact
state and the remaining steps.

Validation (there is no `node` on this machine):

```bash
/files/home/runvnc/.deno/bin/deno check --no-lock app/terrain-hd.js app/app.js app/preflight.js app/look.js
git diff --check
```

## 2. Locked art direction and pipeline

All visible assets originate from the master reference:

```text
master/reference crop
→ gpt-image-1 edit via edit2.py, input_fidelity=high
→ Tripo
→ bake.py
→ mandatory orm.py
→ integration
```

Do not replace reference-derived art with hand-authored procedural substitutes.

Visual rules:

- Smooth matte clay/resin, not photoreal or fuzzy.
- Desaturated olive/moss grass with broad, subtle height/color variation.
- Flat tops, tight bevels, crisp edges, thin dark seams.
- Roughness about `.88`, metallic `0`, strong AO.
- Grassiness comes from separate blade/daisy props.
- No per-instance color jitter.
- Do not create more ordinary grass slab variants.
- Batch related edits before rendering.

## 3. Completed and working

### Rendering

- `app/look.js` is the shared look source.
- Neutral tonemap: exposure `1.28`, contrast `1.10`.
- SSAO2: strength `2.2`, radius `.9`, samples `16`, maxZ `60`.
- Real DOF enabled.
- Shared clay detail level `.11`.
- Main material factories use PBR.
- Camera depth range and shadow darkness corrected.
- `?art=1&webgl=1` is the fast review path.

### Terrain

- Default terrain uses `assets/models/tiles/grass_v7_orm.glb`.
- `?procedural=1` is rollback/A/B only.
- Grass tiles use square-safe D4 transforms and no tint jitter.
- Dirt trenches and old procedural rim rocks were removed.
- Measured terrain top is `state.terrainTopY=.445`.
- Geebrs, physics, selection ring, scenery, vegetation, and dig holes were lifted to this height.
- Duplicate `roundedTile()` definitions were already removed.

### Vegetation

Final assets:

- `assets/models/props/gen/blade_cluster.glb`
- `assets/models/props/gen/daisy_clump.glb`

They use deterministic varied density. Blade clusters remain upright with yaw and gentle lean; daisies use broader orientation variation. No color jitter.

## 4-6. Cliff / island edge — MOVED

Superseded in full by [`CLIFF_EDGE_HANDOFF.md`](CLIFF_EDGE_HANDOFF.md).

The previous text here has been deleted rather than kept, because it was not
merely out of date, it was wrong in a way that would waste a session: it
prescribed using `cliff_straight_a/b.glb` as sunk accents with their green tops
buried. Their 4096 albedo measured **95% green across the entire texture**, so no
placement or trim can hide it. See CLIFF_EDGE_HANDOFF section 4.2 and
`tile_work/restone.py`.

## 7. Next asset replacements after cliff lock

Convert and replace procedural counterparts rather than layering duplicates:

1. tree
2. `rock_boulder3`
3. crate
4. additional rock clusters/slabs as needed
5. house/barrel later

Existing concepts are in `handoff/tile_work/`; `asset_rock_boulder3.png` is the approved boulder concept.

## 8. Useful commands and files

Renders — use `shot_views.py`, NOT the older `shot_fast.py`/`shot_app.py`. Those
launch Chromium with `--use-angle=swiftshader`, which rasterises on all 12 CPU
cores and previously froze the machine; `shot_views.py` binds the real GPU and
kills orphaned browser processes. Details in `CLIFF_EDGE_HANDOFF.md` section 0.

```bash
cd /files/geebr.world/handoff/tile_work
timeout 100 python3 -u shot_views.py /tmp/g 640 440 edge,corner,iso
timeout 90  python3 -u measure.py all      # geometry facts, no screenshots
```

Server:

```bash
python3 -m http.server 8791 --directory /files/geebr.world/app
```

Asset tools:

- `edit2.py` — GPT Image 1 high-fidelity edit
- `tripo_one.py IMAGE OUTPUT FACE_LIMIT`
- `bake.py`
- `orm.py`
- `glb.py` — full glTF rebuild (resize/replace textures); also how albedo hue
  distribution gets measured
- `restone.py` — recolour a green Tripo albedo to desaturated stone
- `shot_views.py` — the render harness (GPU, self-cleaning)
- `measure.py` — world-space bounds per mesh-name prefix, no screenshots
- `shot_tile.py`
- `mk.py` — build a <45KB composite before inspecting an image
- superseded: `shot_fast.py`, `shot_app.py`, `ab_app.py`, `probe.py`

Important constraints:

- Do not use `tint.py`.
- **Measure every new Tripo asset's albedo hue distribution immediately** — the
  cliff assets came back 95% green over the whole 4096 texture and that was not
  noticed until after two integration attempts.
- Tripo normal maps are effectively blank; do not rely on them.
- glTF multiplies roughness texture by roughness factor, so matte correction belongs in ORM.
- Avoid full-resolution image inspection unless fine detail requires it; use useful crops/composites.
- `apply_udiff` is unreliable on long `app.js` lines; use Python replacements with assertion counts.
