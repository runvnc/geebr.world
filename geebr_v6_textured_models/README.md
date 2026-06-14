# geebr.world v6 textured models

Static Babylon.js WebGPU prototype.

Changes from the v5 colorfix baseline:

- Overall scene lighting is dimmer and moodier.
- Added authored PNG texture files instead of runtime `DynamicTexture` / canvas textures.
- Added custom low-poly mesh Geebr models with body/head/feet/arms/eyes/hat/backpack parts.
- Added textured mushroom bakery, fences, lamps, shrine crystal, crates, barrels, cracked blocks, dirt path.
- Kept the same command hook:

```js
window.runCommand("walk n")
window.runCommand("push")
window.runCommand("spell spark")
window.runCommand("say gravity is illegal")
```

## Running

Because this version uses external texture files, run it from a tiny local server:

```bash
python3 -m http.server 8080
```

Then open:

```txt
http://localhost:8080
```

It still loads Babylon.js and Havok from CDN.
