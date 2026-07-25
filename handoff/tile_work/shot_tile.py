import asyncio, sys, json
from playwright.async_api import async_playwright

FILE = sys.argv[1]
OUT = sys.argv[2]
N = sys.argv[3] if len(sys.argv) > 3 else '4'
RAD = sys.argv[4] if len(sys.argv) > 4 else '7'
EXTRA = sys.argv[5] if len(sys.argv) > 5 else ''
URL = 'http://localhost:8791/tilepreview.html?f=' + FILE + '&n=' + N + EXTRA

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(headless=True, args=['--use-angle=swiftshader','--use-gl=angle','--ignore-gpu-blocklist'])
        pg = await b.new_page(viewport={'width':1200,'height':900})
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)[:300]))
        pg.on('console', lambda m: errs.append('console:'+m.text[:200]) if m.type=='error' else None)
        await pg.goto(URL, wait_until='load', timeout=60000)
        for _ in range(60):
            r = await pg.evaluate('window.__ready === true')
            if r: break
            await pg.wait_for_timeout(1000)
        info = await pg.evaluate('window.__bounds')
        print(json.dumps(info))
        await pg.evaluate('(r)=>{const s=BABYLON.Engine.Instances[0].scenes[0];s.activeCamera.radius=parseFloat(r);}', RAD)
        await pg.wait_for_timeout(1500)
        await pg.screenshot(path=OUT, timeout=120000)
        print('errors:', errs[:5])
        await b.close()

asyncio.run(main())
