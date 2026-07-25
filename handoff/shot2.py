import asyncio, sys
from playwright.async_api import async_playwright
URL='http://localhost:8000/app/'
OUT=sys.argv[1]
RAD=float(sys.argv[2]) if len(sys.argv)>2 else 12
BETA=float(sys.argv[3]) if len(sys.argv)>3 else 0.95
ALPHA=float(sys.argv[4]) if len(sys.argv)>4 else -0.785
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(headless=True,args=['--enable-unsafe-webgpu','--enable-features=Vulkan,UseSkiaRenderer,WebGPU','--use-angle=swiftshader','--use-gl=angle','--enable-webgpu-developer-features','--ignore-gpu-blocklist','--disable-vulkan-surface'])
        pg=await b.new_page(viewport={'width':1500,'height':950})
        errs=[]
        pg.on('pageerror',lambda e: errs.append(str(e)[:200]))
        await pg.goto(URL,wait_until='load',timeout=60000)
        await pg.wait_for_timeout(15000)
        res=await pg.evaluate(f"""() => {{
            for(const id of ['chatDock','hint','topBar','rail','hud','sidePanel','compassHud']) {{ const e=document.getElementById(id); if(e) e.style.display='none'; }}
            const eng=BABYLON.Engine.Instances&&BABYLON.Engine.Instances[0];
            const sc=eng&&eng.scenes&&eng.scenes[0];
            const c=sc&&sc.activeCamera;
            if(!c) return 'no cam';
            c.setTarget(new BABYLON.Vector3(1.2,0.4,0.6));
            c.alpha={ALPHA}; c.beta={BETA}; c.radius={RAD};
            return 'ok r='+c.radius;
        }}""")
        print(res)
        await pg.wait_for_timeout(2500)
        await pg.screenshot(path=OUT)
        print('errors:',errs[:5])
        await b.close()
asyncio.run(main())
