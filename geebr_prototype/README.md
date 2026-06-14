# geebr.world Destructible Environment Prototype

Open `index.html` in a browser. No build step and no backend.

This prototype intentionally leaves out WebLLM. Your parser/LLM can call:

```js
window.runCommand('say gravity is illegal')
window.runCommand('walk n')
window.runCommand('spell push')
window.runCommand('spell spark')
window.runCommand('build wall')
```

## What it demonstrates

- Isometric destructible tile environment
- Simple Geebr entities
- Grammar-shaped command API
- Push/dig/build/spell/panic commands
- Fire propagation
- Crumbling unsupported blocks
- Event log and speech bubbles

## Intended migration

Keep command execution and world state shape, then move hot simulation code to Rust/WASM and rendering to WebGPU instanced sprites/meshes.
