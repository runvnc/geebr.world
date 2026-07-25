import io

# ---------------------------------------------------------------------------
# Add a dev-only ?webgl=1 escape hatch so the real app can be rendered headless
# for screenshot review. Headless swiftshader advertises WebGPU but then loses
# the device and fails SSAO buffer creation, so WebGPU-only gating makes the
# app impossible to verify in CI / from an agent shell.
# ---------------------------------------------------------------------------
P = '/files/geebr.world/app/app.js'
s = io.open(P, encoding='utf-8').read()

OLD = ("async function createEngine(){ if(!navigator.gpu) throw new Error('WebGPU unavailable in this browser');"
       " const engine = new BABYLON.WebGPUEngine(canvas,{antialias:true,adaptToDeviceRatio:true});"
       " await engine.initAsync(); return engine; }")
assert s.count(OLD) == 1, 'createEngine not found verbatim'
NEW = '''// Dev escape hatch: ?webgl=1 forces the WebGL2 engine. Needed because headless
// swiftshader advertises WebGPU but then loses the device, which makes the real
// app impossible to screenshot for art review. Not a supported user path.
async function createEngine(){
  if(new URLSearchParams(location.search).has('webgl')){
    console.warn('createEngine: ?webgl=1 - using WebGL2 fallback (dev only)');
    return new BABYLON.Engine(canvas,true,{preserveDrawingBuffer:true,stencil:true},true);
  }
  if(!navigator.gpu) throw new Error('WebGPU unavailable in this browser');
  const engine = new BABYLON.WebGPUEngine(canvas,{antialias:true,adaptToDeviceRatio:true});
  await engine.initAsync(); return engine;
}'''
s = s.replace(OLD, NEW)
io.open(P, 'w', encoding='utf-8').write(s)
print('app.js createEngine patched')

Q = '/files/geebr.world/app/preflight.js'
t = io.open(Q, encoding='utf-8').read()
OLD2 = "    if (!('gpu' in navigator) || !navigator.gpu) {"
assert t.count(OLD2) == 1, 'preflight gpu check not found'
NEW2 = ("    const devWebGL = new URLSearchParams(location.search).has('webgl');\n"
        "    if (!devWebGL && (!('gpu' in navigator) || !navigator.gpu)) {")
t = t.replace(OLD2, NEW2)
io.open(Q, 'w', encoding='utf-8').write(t)
print('preflight.js gpu gate patched')
