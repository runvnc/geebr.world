import asyncio, json, sys
from playwright.async_api import async_playwright

OUT = sys.argv[1]
WAIT = int(sys.argv[2]) if len(sys.argv) > 2 else 30
EXTRA = sys.argv[3] if len(sys.argv) > 3 else ''

# NOTE: app.js declares `const state` at classic-script top level, which is NOT
# reachable as window.state, so probe the scene / pipeline manager instead.
PROBE = """(()=>{ const e=BABYLON.Engine.Instances[0]; if(!e) return {no_engine:true};
 const s=e.scenes[0];
 const pm=s.postProcessRenderPipelineManager;
 const pipes=(pm && pm._renderPipelines)?Object.keys(pm._renderPipelines):[];
 const drp=(pm && pm._renderPipelines)?pm._renderPipelines['drp']:null;
 return { meshes:s.meshes.length, mats:s.materials.length, pipelines:pipes,
  dof: drp?drp.depthOfFieldEnabled:null,
  focus: (drp&&drp.depthOfField)?Math.round(drp.depthOfField.focusDistance):null,
  curves:s.imageProcessingConfiguration.colorCurvesEnabled,
  tonemap:s.imageProcessingConfiguration.toneMappingType,
  exposure:s.imageProcessingConfiguration.exposure,
  contrast:s.imageProcessingConfiguration.contrast,
  detailMats:s.materials.filter(m=>m.detailMap&&m.detailMap.isEnabled).length,
  pbr:s.materials.filter(m=>m.getClassName()==='PBRMaterial').length,
  std:s.materials.filter(m=>m.getClassName()==='StandardMaterial').length,
  fps:e.getFps().toFixed(1) }; })()"""


async def safe(pg, expr, default=None):
    try:
        return await pg.evaluate(expr)
    except Exception as ex:
        return {'eval_error': str(ex)[:160]} if default is None else default


async def m():
    async with async_playwright() as p:
        b = await p.chromium.launch(headless=True, args=[
            '--use-angle=swiftshader', '--use-gl=angle', '--ignore-gpu-blocklist'])
        pg = await b.new_page(viewport={'width': 1280, 'height': 860})
        errs = []
        pg.on('pageerror', lambda e: errs.append('PE:' + str(e)[:220]))
        pg.on('console', lambda c: errs.append(c.type[:4].upper() + ':' + c.text[:170])
              if c.type in ('error', 'warning') else None)
        await pg.goto('http://localhost:8791/index.html?webgl=1&art=1' + EXTRA,
                      wait_until='load', timeout=90000)
        last = -1
        stable = 0
        for _ in range(WAIT):
            await pg.wait_for_timeout(2000)
            cnt = await safe(pg, "(()=>{ if(typeof BABYLON==='undefined') return 0;"
                                 "const e=BABYLON.Engine.Instances[0];"
                                 "return (e&&e.scenes[0])?e.scenes[0].meshes.length:0;})()", 0)
            if not isinstance(cnt, int):
                cnt = 0
            if cnt and cnt == last:
                stable += 1
                if stable >= 3:
                    break
            else:
                stable = 0
            last = cnt
        print('meshcount:', last)
        print(json.dumps(await safe(pg, PROBE)))
        await pg.wait_for_timeout(2500)
        await pg.screenshot(path=OUT, timeout=120000)
        seen = []
        for e in errs:
            if e not in seen:
                seen.append(e)
        print('errors:')
        for e in seen[:14]:
            print('  ', e)
        await b.close()

asyncio.run(m())
