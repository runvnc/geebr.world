# geebr.world v8 — Real Props Pass

This build keeps the v7 Babylon WebGPU/Havok sandbox, but adds a real imported asset pass using selected glTF props from the uploaded **Fantasy Props MegaKit[Standard]** pack.

## What's new vs v7

- Keeps the 32×32 toybox/grid.
- Adds 20+ actual imported glTF prop placements.
- Adds real Quaternius prop materials/textures from the pack.
- Uses invisible physics proxies around imported models so existing interactions still work:
  - push
  - carry/drop/throw
  - repair
  - spell fireball
  - burn/crack/break states
- Keeps the primitive Geebr mascot for now. Character direction still needs custom/curated model work; the cute monster pack was intentionally not used.

## Included prop examples

- Barrel
- Wooden crate
- Apple/carrot farm crates
- Workbench
- Table
- Bench/stool
- Chest
- Cauldron
- Anvil
- Weapon stand
- Axe/pickaxe
- Bucket
- Bag
- Potions
- Scroll
- Coin pile
- Lantern

## Running

Use a local server because the demo loads texture/model files:

```bash
cd geebr_v8_real_props
python3 -m http.server 8080
```

Then open:

```text
http://localhost:8080
```

## Notes

The imported meshes are parented to invisible physics proxy boxes/cylinders. This is deliberate: the visible glTF mesh can be beautiful, while the physics object stays simple and stable.

Future WebLLM integration should call the same command layer:

```js
window.executeCommand({ kind: "spell", spell: "fireball" })
window.executeCommand({ kind: "carry" })
window.runCommand("throw")
```

## Asset license

Selected files from the uploaded Fantasy Props MegaKit are included under the pack's included `License_Standard.txt` in `assets/models/props/`.
