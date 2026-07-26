#!/usr/bin/env python3
"""Art-review mode: stop burning CPU on simulation we do not need for stills.

- ?art=1 (or ?still=1) freezes the Havok time step, so the physics solver stops
  stepping every frame.
- The animated sea rebuilt 4,225 vertices plus recomputed normals on the CPU on
  every single frame. In still mode it runs exactly once and then unhooks.
"""
import pathlib

# ---- app.js: freeze physics ------------------------------------------------
p = pathlib.Path('/files/geebr.world/app/app.js')
s = p.read_text()
old = "const hk=await HavokPhysics(); scene.enablePhysics(new BABYLON.Vector3(0,-9.81,0),new BABYLON.HavokPlugin(true,hk));"
new = ("const hk=await HavokPhysics(); scene.enablePhysics(new BABYLON.Vector3(0,-9.81,0),new BABYLON.HavokPlugin(true,hk));"
       " if(window.GEEBR_STILL_MODE){ try{ scene.getPhysicsEngine()?.setTimeStep(0); "
       "console.warn('GEEBR: still mode - physics frozen'); }catch(e){} }")
assert s.count(old) == 1, s.count(old)
s = s.replace(old, new)

# Expose state for the measurement harness (read-only convenience).
old2 = "async function main(){ const engine=await createEngine();"
new2 = "async function main(){ window.GEEBR_STATE=state; const engine=await createEngine();"
assert s.count(old2) == 1
p.write_text(s.replace(old2, new2))
print('app.js patched')

# ---- preflight.js: define the flag ---------------------------------------
p = pathlib.Path('/files/geebr.world/app/preflight.js')
s = p.read_text()
old = "  window.GEEBR_FORCE_WEBGL = _q.has('webgl');"
new = ("  window.GEEBR_FORCE_WEBGL = _q.has('webgl');\n"
       "  // Still mode: no physics stepping, no per-frame CPU vertex animation.\n"
       "  // Implied by art review mode; ?still=1 enables it on its own.\n"
       "  window.GEEBR_STILL_MODE = _q.has('still') || window.GEEBR_ART_MODE;")
assert s.count(old) == 1
p.write_text(s.replace(old, new))
print('preflight.js patched')

# ---- terrain-hd.js: sea animation runs once in still mode ----------------
p = pathlib.Path('/files/geebr.world/app/terrain-hd.js')
s = p.read_text()
old = """    scene.onBeforeRenderObservable.add(()=>{
      const t=performance.now()*.001;
      for(let i=0;i<pos.length;i+=3){
        const x=base[i], z=base[i+2];
        pos[i+1]=Math.sin(x*.55+t*.75)*.045+Math.sin(z*.83-t*.58)*.032+Math.sin((x+z)*1.4+t*1.2)*.012;
      }
      sea.updateVerticesData(BABYLON.VertexBuffer.PositionKind,pos,false,false);
      BABYLON.VertexData.ComputeNormals(pos,sea.getIndices(),nrm);
      sea.updateVerticesData(BABYLON.VertexBuffer.NormalKind,nrm,false,false);
    });"""
new = """    // 4,225 CPU vertex writes plus a full normal recompute per frame. Fine when
    // a human is watching the waves, pure waste for a screenshot, so still mode
    // evaluates it once and unhooks.
    const waveStep=(t)=>{
      for(let i=0;i<pos.length;i+=3){
        const x=base[i], z=base[i+2];
        pos[i+1]=Math.sin(x*.55+t*.75)*.045+Math.sin(z*.83-t*.58)*.032+Math.sin((x+z)*1.4+t*1.2)*.012;
      }
      sea.updateVerticesData(BABYLON.VertexBuffer.PositionKind,pos,false,false);
      BABYLON.VertexData.ComputeNormals(pos,sea.getIndices(),nrm);
      sea.updateVerticesData(BABYLON.VertexBuffer.NormalKind,nrm,false,false);
    };
    if(window.GEEBR_STILL_MODE) waveStep(0);
    else scene.onBeforeRenderObservable.add(()=>waveStep(performance.now()*.001));"""
assert s.count(old) == 1
s = s.replace(old, new)

# Foam scroll / ripple rings / lantern flicker are cheap but pointless for a
# still and each one is an observable callback per frame.
old = """    scene.onBeforeRenderObservable.add(()=>{
      const t=performance.now()*.001;
      foamTx.uOffset=(t*.05)%1; foamTx.vOffset=Math.sin(t*.4)*.04;
      foamM.alpha=.42+Math.sin(t*1.1)*.10;
    });"""
new = """    if(window.GEEBR_STILL_MODE){ foamM.alpha=.46; }
    else scene.onBeforeRenderObservable.add(()=>{
      const t=performance.now()*.001;
      foamTx.uOffset=(t*.05)%1; foamTx.vOffset=Math.sin(t*.4)*.04;
      foamM.alpha=.42+Math.sin(t*1.1)*.10;
    });"""
assert s.count(old) == 1
s = s.replace(old, new)

old = """      scene.onBeforeRenderObservable.add(()=>{ sc+=sp*.016; if(sc>3.6) sc=.4; ring.scaling.set(sc,sc,1); rm.alpha=.30*(1-sc/3.8); });"""
new = """      ring.scaling.set(sc,sc,1); rm.alpha=.30*(1-sc/3.8);
      if(!window.GEEBR_STILL_MODE)
        scene.onBeforeRenderObservable.add(()=>{ sc+=sp*.016; if(sc>3.6) sc=.4; ring.scaling.set(sc,sc,1); rm.alpha=.30*(1-sc/3.8); });"""
assert s.count(old) == 1
s = s.replace(old, new)

old = """    scene.onBeforeRenderObservable.add(()=>{
      const t=performance.now()*.0022;
      lamp.intensity=1.28+Math.sin(t*2.3)*.10+Math.sin(t*5.7)*.05;
    });"""
new = """    if(!window.GEEBR_STILL_MODE) scene.onBeforeRenderObservable.add(()=>{
      const t=performance.now()*.0022;
      lamp.intensity=1.28+Math.sin(t*2.3)*.10+Math.sin(t*5.7)*.05;
    });"""
assert s.count(old) == 1
s = s.replace(old, new)
p.write_text(s)
print('terrain-hd.js patched')
