"""Multi-view real-app screenshot harness. GPU-accelerated, self-cleaning.

Usage: python3 shot_views.py PREFIX [W H] [views] [ids]
  views = comma list from: iso, edge, corner, water, top, close, profile, far, rock, tree, crate, barrel
              ('rock' auto-frames the nearest plateau boulder at radius 1.7)

CPU SAFETY (read this before changing the launch args):
  * SwiftShader renders on all 12 CPU cores and previously pinned the box.
    --use-angle=gl-egl binds the real RTX 2060 even headless (DISPLAY must be
    set). Verify with the reported `renderer` line: it must say NVIDIA.
  * The browser is launched in its own process group and the WHOLE GROUP is
    killed in a finally block, because a hung page previously orphaned 46
    chrome processes that kept burning CPU for minutes.
  * ?art=1 disables the ~3GB LLM download and TTS; it also implies still mode
    (physics time step 0, no per-frame CPU vertex animation).
"""
import asyncio, base64, json, os, signal, subprocess, sys, time
from pathlib import Path
from playwright.async_api import async_playwright

PREFIX = sys.argv[1]
W = int(sys.argv[2]) if len(sys.argv) > 2 else 700
H = int(sys.argv[3]) if len(sys.argv) > 3 else 480
WANT = (sys.argv[4].split(',') if len(sys.argv) > 4 else ['iso', 'edge', 'corner'])
URL = 'http://localhost:8791/index.html?webgl=1&art=1'

# Real GPU via ANGLE/EGL. Do NOT put swiftshader back here.
GPU_ARGS = [
    '--use-angle=gl-egl', '--use-gl=angle',
    '--ignore-gpu-blocklist', '--enable-gpu', '--enable-unsafe-webgl',
    '--disable-dev-shm-usage', '--no-sandbox',
    '--renderer-process-limit=2', '--disable-background-networking',
    '--disable-extensions', '--mute-audio',
]

# alpha, beta, radius, target(x,y,z)
VIEWS = {
    'iso':     (-0.785, 0.95, 16.0, (0, 0.3, 0)),
    'edge':    (-1.571, 1.28, 7.0, (0, -0.6, -7.2)),
    'corner':  (-0.785, 1.22, 9.0, (-5.4, -0.6, -5.4)),
    'water':   (-1.571, 1.48, 9.0, (0, -1.4, -7.6)),
    'top':     (-0.785, 0.35, 18.0, (0, 0.3, 0)),
    'close':   (-1.100, 1.15, 4.2, (-2.0, -0.3, -7.0)),
    'profile': (-1.571, 1.45, 22.0, (0, -1.2, 0)),
    'far':     (-0.785, 1.10, 24.0, (0, -0.8, 0)),
}

PROBE = """(()=>{const e=BABYLON.Engine.Instances[0],s=e.scenes[0],
p=s.postProcessRenderPipelineManager._renderPipelines;
const n=x=>s.meshes.filter(m=>m.name.indexOf(x)===0).length;
const gl=e._gl,d=gl&&gl.getExtension('WEBGL_debug_renderer_info');
return {meshes:s.meshes.length,fps:+e.getFps().toFixed(1),
pipelines:Object.keys(p),art:!!window.GEEBR_ART_MODE,still:!!window.GEEBR_STILL_MODE,
obs:s.onBeforeRenderObservable.observers.length,
renderer:d?gl.getParameter(d.UNMASKED_RENDERER_WEBGL):'?',
counts:{wall:n('hd_cliff_wall'),shore:n('hd_shore_rocks'),accent:n('hd_cliff_buttress'),
grass:n('hd_island_grass'),blades:n('hd_generated_blade')}}})()"""
CAPTURE = "()=>{S().render();return document.querySelector('#renderCanvas').toDataURL('image/jpeg',.90)}"
SETUP = ("window.S=()=>BABYLON.Engine.Instances[0].scenes[0];"
         "window.P=n=>S().postProcessRenderPipelineManager._renderPipelines[n];")
AIM = ("([a,b,r,t])=>{const c=S().activeCamera;"
       "c.setTarget(new BABYLON.Vector3(t[0],t[1],t[2]));"
       "c.lowerRadiusLimit=1;c.lowerBetaLimit=.05;c.upperBetaLimit=3.0;"
       "c.alpha=a;c.beta=b;c.radius=r;}")

# Flat unlit colour per mesh-name prefix so composition is legible.
IDPASS = """()=>{const s=S();const g=[['hd_cliff_wall',[1,.2,.15]],['hd_shore_rocks',[1,.2,.9]],
['hd_cliff_buttress',[.15,1,.3]],['hd_island_grass',[1,1,1]],['hd_sea',[0,.05,.14]],
['hd_generated',[.5,.75,.2]]];
for(const[pre,c]of g){for(const m of s.meshes){if(m.name.indexOf(pre)!==0)continue;
const mt=new BABYLON.StandardMaterial('id_'+pre,s);mt.disableLighting=true;
mt.emissiveColor=new BABYLON.Color3(c[0],c[1],c[2]);mt.diffuseColor=new BABYLON.Color3(0,0,0);
m.material=mt;}}
return s.meshes.length}"""


# 'rock' view: locate the plateau boulder nearest the island centre and frame it.
FINDROCK = '''()=>{const s=S();
const m=s.meshes.find(x=>x.name==='hd_edge_stones');
if(!m) return null;
m.computeWorldMatrix(true);
const w=m.getWorldMatrix();
const p=m.getVerticesData(BABYLON.VertexBuffer.PositionKind);
// The plateau boulders are the only edge-stone geometry ABOVE the grass top
// (they sit at TOP_Y + r*0.42); every coursed cube and tread perch is below it.
// The merge collapsed them into one mesh, so pick a vertex instead of a mesh.
let best=null,bd=1e9;
for(let i=0;i<p.length;i+=3){
  const v=BABYLON.Vector3.TransformCoordinates(new BABYLON.Vector3(p[i],p[i+1],p[i+2]),w);
  if(v.y<0.55) continue;
  const d=Math.abs(v.x)+Math.abs(v.z);
  if(d<bd){bd=d;best=v;}
}
if(!best) return null;
return {verts:p.length/3,pos:[+best.x.toFixed(2),+(best.y-0.12).toFixed(2),+best.z.toFixed(2)]}}'''


# 'barrel' view: frame the first interactive barrel visual when one is present.
FINDBARREL = '''()=>{const s=S();
const ms=s.meshes.filter(x=>x.name==='barrel'&&x.isEnabled());
if(!ms.length) return null;
const p=ms[0].getAbsolutePosition();
return {count:ms.length,pos:[+p.x.toFixed(2),+p.y.toFixed(2),+p.z.toFixed(2)]}}'''


# 'crate' view: frame the isolated decorative crate on the east side. The south-west
# crates are a stack, so the east crate is the unambiguous close-review target.
FINDCRATE = '''()=>{const s=S();
const ms=s.meshes.filter(x=>x.name==='hd_decor_crate'&&x.isEnabled()&&x.getTotalVertices?.()>0);
if(!ms.length) return null;
let best=ms[0],bx=-1e9;
for(const m of ms){const p=m.getAbsolutePosition();if(p.x>bx){bx=p.x;best=m;}}
const p=best.getAbsolutePosition();
return {count:ms.length,pos:[+p.x.toFixed(2),+(p.y+.24).toFixed(2),+p.z.toFixed(2)]}}'''


# 'tree' view: frame the tallest canopy vertex, i.e. one whole tree in profile.
FINDTREE = '''()=>{const s=S();
const ms=s.meshes.filter(x=>x.name==='hd_tree'&&x.isEnabled()&&x.getTotalVertices?.()>0);
let chosen=null,bestY=-1e9;
for(const m of ms){
  const b=m.getHierarchyBoundingVectors(true);
  if(b.max.y>bestY){bestY=b.max.y;chosen={m,b};}
}
if(!chosen) return null;
const {m,b}=chosen;
return {verts:m.getTotalVertices(),apex:+b.max.y.toFixed(2),
        pos:[+((b.min.x+b.max.x)/2).toFixed(2),
             +((b.min.y+b.max.y)/2).toFixed(2),
             +((b.min.z+b.max.z)/2).toFixed(2)]}}'''


def sweep():
    """Kill any chrome left over from an earlier aborted run."""
    subprocess.run(['pkill', '-9', '-f', 'use-angle=gl-egl'],
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


async def main():
    start = time.perf_counter()
    sweep()
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True, args=GPU_ARGS)
        page = await browser.new_page(viewport={'width': W, 'height': H})
        errors = []
        page.on('pageerror', lambda e: errors.append('page: ' + str(e)[:200]))
        page.on('console', lambda m: errors.append('con: ' + m.text[:200]) if m.type == 'error' else None)
        try:
            await page.goto(URL, wait_until='domcontentloaded', timeout=10000)
            await page.wait_for_function('window.GEEBR_SCENE_READY===true', timeout=30000)
            ready = time.perf_counter()
            await page.evaluate(SETUP)

            async def sweep_views(suffix=''):
                for name in WANT:
                    if name == 'barrel':
                        info = await page.evaluate(FINDBARREL)
                        print('barrel target', json.dumps(info), flush=True)
                        if not info: continue
                        a, b, r, t = -1.05, 1.08, 1.75, info['pos']
                    elif name == 'crate':
                        info = await page.evaluate(FINDCRATE)
                        print('crate target', json.dumps(info), flush=True)
                        if not info: continue
                        a, b, r, t = -1.15, 1.12, 1.75, info['pos']
                    elif name == 'tree':
                        info = await page.evaluate(FINDTREE)
                        print('tree target', json.dumps(info), flush=True)
                        if not info:
                            continue
                        a, b, r, t = -0.95, 1.02, 3.5, info['pos']
                    elif name == 'rock':
                        info = await page.evaluate(FINDROCK)
                        print('rock target', json.dumps(info), flush=True)
                        if not info:
                            continue
                        a, b, r, t = -0.9, 1.02, 1.15, info['pos']
                    else:
                        a, b, r, t = VIEWS[name]
                    t0 = time.perf_counter()
                    await page.evaluate(AIM, [a, b, r, list(t)])
                    await page.wait_for_timeout(120)
                    data = await asyncio.wait_for(page.evaluate(CAPTURE), timeout=15)
                    Path(f'{PREFIX}_{name}{suffix}.jpg').write_bytes(
                        base64.b64decode(data.split(',', 1)[1]))
                    print(f'shot {name}{suffix}: {time.perf_counter()-t0:.2f}s', flush=True)

            await sweep_views()
            print('probe', json.dumps(await page.evaluate(PROBE)), flush=True)
            if 'ids' in sys.argv[5:]:
                await page.evaluate(IDPASS)
                await sweep_views('_id')
            print(f'timing ready={ready-start:.1f}s total={time.perf_counter()-start:.1f}s', flush=True)
            if errors:
                print('errors', json.dumps(errors[:6]), flush=True)
        finally:
            try:
                await asyncio.wait_for(browser.close(), timeout=10)
            except Exception:
                pass
            sweep()

try:
    asyncio.run(main())
finally:
    sweep()
