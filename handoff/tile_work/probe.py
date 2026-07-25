import asyncio, json, sys
from playwright.async_api import async_playwright

URL = sys.argv[1]

async def m():
    async with async_playwright() as p:
        b = await p.chromium.launch(headless=True, args=[
            '--use-angle=swiftshader', '--use-gl=angle', '--ignore-gpu-blocklist',
            '--enable-unsafe-webgpu'])
        pg = await b.new_page(viewport={'width': 800, 'height': 600})
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)[:200]))
        pg.on('console', lambda m: errs.append('C:' + m.text[:160]) if m.type == 'error' else None)
        await pg.goto(URL, wait_until='load', timeout=60000)
        for _ in range(40):
            if await pg.evaluate('window.__ready===true'):
                break
            await pg.wait_for_timeout(1000)
        print('ssao:', json.dumps(await pg.evaluate('window.__ssao || null')))
        print('supported:', await pg.evaluate('BABYLON.SSAO2RenderingPipeline.IsSupported'))
        print('babylon:', await pg.evaluate('BABYLON.Engine.Version'))
        print('webgpu:', await pg.evaluate("'gpu' in navigator"))
        print('errs:', errs[:4])
        await b.close()

asyncio.run(m())
