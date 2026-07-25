"""Fast, fail-fast real-app screenshot harness.
Usage: python3 shot_fast.py PREFIX [W H]
Uses ?art=1&webgl=1, waits for app.js's explicit scene-ready signal, then takes
all variants from one page load. Captures the WebGL canvas directly instead of
Playwright's compositor screenshot path, which is very slow under SwiftShader.
"""
import asyncio, base64, json, sys, time
from pathlib import Path
from playwright.async_api import async_playwright
PREFIX=sys.argv[1]; W=int(sys.argv[2]) if len(sys.argv)>2 else 800; H=int(sys.argv[3]) if len(sys.argv)>3 else 550
URL='http://localhost:8791/index.html?webgl=1&art=1'
VARIANTS=[('final',"P('ssao').totalStrength=2.2;P('ssao').radius=.9")]  # edit for A/B sweeps
PROBE="""(()=>{const e=BABYLON.Engine.Instances[0],s=e.scenes[0],p=s.postProcessRenderPipelineManager._renderPipelines,ssao=p.ssao,drp=p.drp;return {ready:!!window.GEEBR_SCENE_READY,meshes:s.meshes.length,materials:s.materials.length,pipelines:Object.keys(p),fps:+e.getFps().toFixed(1),ssao:ssao?{strength:ssao.totalStrength,radius:ssao.radius}:null,dof:!!drp?.depthOfFieldEnabled,art:!!window.GEEBR_ART_MODE,tts:document.querySelector('#ttsStatus')?.textContent||null}})()"""
CAPTURE="""()=>{S().render();return document.querySelector('#renderCanvas').toDataURL('image/jpeg',.90)}"""
async def main():
 start=time.perf_counter()
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True,args=['--use-angle=swiftshader','--use-gl=angle','--ignore-gpu-blocklist'])
  page=await browser.new_page(viewport={'width':W,'height':H}); errors=[]
  page.on('pageerror',lambda e:errors.append('page: '+str(e)))
  page.on('console',lambda m:errors.append(m.type+': '+m.text) if m.type=='error' else None)
  try:
   await page.goto(URL,wait_until='domcontentloaded',timeout=8000)
   await page.wait_for_function('window.GEEBR_SCENE_READY===true',timeout=20000); ready=time.perf_counter()
   await page.evaluate("""window.S=()=>BABYLON.Engine.Instances[0].scenes[0];window.P=n=>S().postProcessRenderPipelineManager._renderPipelines[n];(()=>{const c=S().activeCamera;c.alpha=-Math.PI/4;c.beta=.95;c.radius=16;c.setTarget(new BABYLON.Vector3(0,.3,0))})()""")
   for label,js in VARIANTS:
    t=time.perf_counter(); await page.evaluate('()=>{'+js+'}'); await page.wait_for_timeout(100)
    data=await asyncio.wait_for(page.evaluate(CAPTURE),timeout=10)
    Path(f'{PREFIX}_{label}.jpg').write_bytes(base64.b64decode(data.split(',',1)[1]))
    print(f'shot {label}: {time.perf_counter()-t:.2f}s',flush=True)
   print('probe',json.dumps(await page.evaluate(PROBE)),flush=True)
   print(f'timing ready={ready-start:.2f}s total={time.perf_counter()-start:.2f}s',flush=True)
   if errors: print('errors',json.dumps(errors[:8]),flush=True)
  finally: await browser.close()
asyncio.run(main())
