# geebr.world — Master Match Plan

**Target:** `/xfiles/localmr/static/imgs/gpt_image_7fRofQ_FKB_m9w_0.png`
**Technical reference:** [`RENDERING_HANDOFF.md`](RENDERING_HANDOFF.md)
**Current baseline:** image-to-3D tree integrated; island edge complete; legacy
fallback trees removed; raised stone stacks rebuilt as supported outcrops.

## Working rule

Use the master crop as the art source, produce isolated high-fidelity concept
images, convert through Tripo, then run the complete material pipeline:

```
master crop -> edit2.py (input_fidelity=high) -> tripo_one.py
-> measure albedo -> bake.py -> orm.py -> integrate -> full-grid render
```

Every asset must be reviewed both close-up and in `iso`/`far`; aggregate colour
statistics never override visible silhouette, topology, support, or composition.
Keep the sandbox generic: reusable GLBs and a shared importer/material path,
not scene-specific procedural substitutes.

## Phase 1 — Hero props already concepted

1. **Crate — complete** — `tile_work/asset_crate.png`; 3k and 5k Tripo outputs compared.
   The 5k asset is integrated as `assets/models/props/gen/crate.glb` for both
   decorative scenery and interactive crates, with invisible physics proxies retained.
2. **Barrel — complete** — `tile_work/asset_barrel.png`; 3k and 5k Tripo outputs compared.
   The 5k GLB is the reusable pickup visual, attached to the retained cylinder physics proxy.
3. **House — complete** — `tile_work/asset_house.png`; 10k and 15k outputs compared.
   The 15k GLB replaces the placeholder tent at back-right, scaled to about 2.35
   grid cells while preserving the central playable area.
4. For every conversion: inspect all azimuths for fused parts, holes, accidental
   backing planes, shadows baked into geometry, and wrong albedo hue. Run
   `orm.py`; use shared `applyClayLookToMeshes()`; cast and receive shadows.

## Phase 2 — Remaining reference-derived prop set

- `rock_boulder3` (approved concept) replacing procedural plateau boulders.
- `rock_cluster` and `rock_slab` for the master’s grouped stone landmarks.
- Review signpost, fence, lantern, campfire, and flowers against corresponding
  master crops; retain procedural primitives only where they already match and
  are genuinely generic.

## Phase 3 — Composition pass (started 2026-07-26)

Initial pass reduced the uniform vegetation carpet, opened quiet zones around the
centre/house/fire, shifted the campfire toward the centre, darkened cool ambient
fill, and strengthened the warm fire pool. The island-footprint rewrite is
deliberately deferred until after the three rock GLBs: the current stepped edge
already supplies irregular silhouette, while removing core grid cells would alter
walkability and all shared edge-profile assumptions.


- Match the master’s denser back tree line without crowding the playable centre.
- Establish the house at back-right, tree cluster at back-left/centre, and clear
  central play space with crates, barrel, fire, rocks, flowers, and signposts.
- Reduce the current uniform grass-clump carpet; the master uses clustered
  vegetation and larger quiet areas so hero props remain readable.
- Resolve tree/fence intersections and all unsupported/interpenetrating props.
- Compare object counts, occupied grid cells, negative space, and silhouette
  distribution in one full-grid master/current composite.

## Phase 4 — Lighting and finish

Only after geometry/composition lock:

- Measure masked material regions against the master: grass, leaves, wood,
  stone, water, and warm emissives.
- Tune asset albedos before global exposure. Keep shared neutral tonemap and
  matte-clay material behavior.
- Check SSAO at contact points without using it to fake missing geometry.
- Review DOF, fog, key/fill direction, warm lantern/fire pools, and cyan selection
  glow in the actual gameplay camera.

## Acceptance gate per phase

- Deno check and `git diff --check` pass.
- No HD fallback in console.
- Close view confirms watertight/readable asset geometry.
- `iso`, `far`, and at least one opposite corner view confirm the whole grid.
- Side-by-side composite with the master is reviewed before moving on.
- Handoffs updated with exact source image, face count, bake/ORM parameters,
  integration path, measured material values, and known residual differences.
