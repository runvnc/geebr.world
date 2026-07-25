"""ab_app.py - load the real app ONCE and screenshot several look variants by
mutating the live scene. Much cheaper than one page load per variant (a cold
load under swiftshader is ~40s).

usage: ab_app.py outprefix [w] [h]
"""
import asyncio, sys
from playwright.async_api import async_playwright

PREFIX = sys.argv[1]
W = int(sys.argv[2]) if len(sys.argv) > 2 else 900
H = int(sys.argv[3]) if len(sys.argv) > 3 else 620

VARIANTS = [
    ('off', "P('ssao').totalStrength=0;"),
    ('s105', "P('ssao').totalStrength=1.05; P('ssao').radius=0.55;"),
    ('s220', "P('ssao').totalStrength=2.2; P('ssao').radius=0.9;"),
]

HELPER = """window.P=(n)=>BABYLON.Engine.Instances[0].scenes[0]
  .postProcessRenderPipelineManager._renderPipelines[n];
window.S=()=>BABYLON.Engine.Instances[0].scenes[0];"""


async def m():
    async with async_playwright() as p:
        b = await p.chromium.launch(headless=True, args=[
            '--use-angle=swiftshader', '--use-gl=angle', '--ignore-gpu-blocklist'])
        pg = await b.new_page(viewport={'width': W, 'height': H})
        pg.set_default_timeout(180000)
        await pg.goto('http://localhost:8791/index.html?webgl=1&art=1', wait_until='load',
                      timeout=120000)
        last, stable = -1, 0
        for _ in range(25):
            await pg.wait_for_timeout(2000)
            try:
                c = await pg.evaluate(
                    "(()=>{ if(typeof BABYLON==='undefined') return 0;"
                    "const e=BABYLON.Engine.Instances[0];"
                    "return (e&&e.scenes[0])?e.scenes[0].meshes.length:0;})()")
            except Exception:
                c = 0
            if c and c == last:
                stable += 1
                if stable >= 2:
                    break
            else:
                stable = 0
            last = c
        print('meshes', last, flush=True)
        await pg.evaluate(HELPER)
        try:
            await pg.evaluate("(()=>{const c=S().activeCamera;c.alpha=-Math.PI/4;"
                              "c.beta=0.95;c.radius=16;"
                              "c.setTarget(new BABYLON.Vector3(0,0.3,0));})()")
        except Exception as ex:
            print('cam fail', str(ex)[:100], flush=True)
        for label, js in VARIANTS:
            try:
                await pg.evaluate('(()=>{' + js + '})()')
                await pg.wait_for_timeout(2000)
                await pg.screenshot(path='%s_%s.png' % (PREFIX, label), timeout=150000)
                print('shot', label, flush=True)
            except Exception as ex:
                print('FAIL', label, str(ex)[:140], flush=True)
        await b.close()

asyncio.run(m())
