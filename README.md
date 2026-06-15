# geebr.world v13.2 — Stack overflow action-button fix

This patch fixes the v13.1 regression where clicking an action button could throw `RangeError: Maximum call stack size exceeded`.

Cause: the global `window.executeCommand` wrapper shadowed the original global `executeCommand` function in-browser, so calls recursively invoked the wrapper.

Fix: the internal executor is now named `executeGameCommand`; public APIs remain unchanged:

```js
window.runCommand("spell fireball")
window.executeCommand({ kind: "spell", spell: "fireball" })
window.getAgentPerception()
```

Run with:

```bash
python3 -m http.server 8080
```

Open `http://localhost:8080`.
