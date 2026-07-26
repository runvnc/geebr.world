"""Load the real app once (?art=1&webgl=1) and dump world-space bounds for mesh
name prefixes. No screenshots, so it is fast (~35s) and costs no image tokens.

Usage: python3 measure.py [prefix1 prefix2 ...]
"""
import asyncio, json, sys
from playwright.async_api import async_playwright

PREFIXES = sys.argv[1:] or [
    'hd_island_grass', 'hd_island_dirt', 'hd_island_stone', 'hd_cliff_face',
    'hd_cliff_corner', 'hd_cliff_core', 'hd_waterline_shelf',
    'hd_cliff_buttress', 'hd_sea', 'hd_foam_collar']
URL = 'http://localhost:8791/index.html?webgl=1&art=1'

ALLJS = """()=>{const s=BABYLON.Engine.Instances[0].scenes[0];const g={};
for(const m of s.meshes){if(!m.getTotalVertices||!m.getTotalVertices())continue;
m.computeWorldMatrix(true);const b=m.getBoundingInfo().boundingBox,a=b.minimumWorld,c=b.maximumWorld;
const k=m.name.replace(/[0-9]+$/,'');
if(!g[k])g[k]={n:0,y0:1e9,y1:-1e9,x1:-1e9,vis:0};
const e=g[k];e.n++;e.y0=Math.min(e.y0,a.y);e.y1=Math.max(e.y1,c.y);
e.x1=Math.max(e.x1,Math.max(Math.abs(a.x),Math.abs(c.x)));if(m.isVisible&&m.isEnabled())e.vis++;}
const o={};for(const k in g){const e=g[k];o[k]=[e.n,e.vis,+e.y0.toFixed(2),+e.y1.toFixed(2),+e.x1.toFixed(2)];}
return o}"""

JS = """(pre)=>{const s=BABYLON.Engine.Instances[0].scenes[0];const out={};
for(const p of pre){const ms=s.meshes.filter(m=>m.name.indexOf(p)===0&&m.getTotalVertices&&m.getTotalVertices()>0);
if(!ms.length){out[p]=null;continue;}
let mn=null,mx=null;for(const m of ms){m.computeWorldMatrix(true);const b=m.getBoundingInfo().boundingBox;
const a=b.minimumWorld,c=b.maximumWorld;
mn=mn?new BABYLON.Vector3(Math.min(mn.x,a.x),Math.min(mn.y,a.y),Math.min(mn.z,a.z)):a.clone();
mx=mx?new BABYLON.Vector3(Math.max(mx.x,c.x),Math.max(mx.y,c.y),Math.max(mx.z,c.z)):c.clone();}
const r=v=>+v.toFixed(3);
out[p]={n:ms.length,min:[r(mn.x),r(mn.y),r(mn.z)],max:[r(mx.x),r(mx.y),r(mx.z)],
verts:ms.reduce((t,m)=>t+m.getTotalVertices(),0)};}
out._state={terrainTopY:window.GEEBR_STATE?.terrainTopY??null};
out._counts={meshes:s.meshes.length,materials:s.materials.length};
return out}"""


async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(headless=True, args=[
            '--use-angle=swiftshader', '--use-gl=angle', '--ignore-gpu-blocklist'])
        pg = await b.new_page(viewport={'width': 400, 'height': 300})
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)[:180]))
        pg.on('console', lambda m: errs.append('C:' + m.text[:180]) if m.type == 'error' else None)
        try:
            await pg.goto(URL, wait_until='domcontentloaded', timeout=10000)
            await pg.wait_for_function('window.GEEBR_SCENE_READY===true', timeout=40000)
            if PREFIXES and PREFIXES[0] == 'all':
                data = await pg.evaluate(ALLJS)
            else:
                data = await pg.evaluate(JS, PREFIXES)
            for k, v in data.items():
                print(k, json.dumps(v))
            if errs:
                print('errors', json.dumps(errs[:5]))
        finally:
            await b.close()

asyncio.run(main())
