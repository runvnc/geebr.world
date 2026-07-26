"""Fix the shattered boulders.

My bug from patch_cliff8. `boulder()` jittered every vertex independently, but
`CreateIcoSphere({flat:true})` DUPLICATES vertices per face - that duplication is
how it gets flat shading, so each corner of the icosphere exists five or six
times, once per adjoining face. Jittering them independently moved each copy of
the same corner to a different place, which tore the faces apart from one
another: splayed shards, visible gaps through the hull, and inconsistent shading
where torn faces caught the light at angles no closed solid would produce.

The normals were never reversed. The mesh was simply not a solid any more.

Fix: derive the displacement from the ORIGINAL position through a quantized key,
so every duplicate of a given corner receives the identical displacement and the
hull stays watertight while still deforming. This is the general rule for
deforming any flat-shaded mesh - never jitter its vertex array directly.
"""
import pathlib

P = pathlib.Path('/files/geebr.world/app/terrain-hd.js')
src = P.read_text()
orig = src

old = """  function boulder(scene,name,r,x,y,z,mat,tone,rnd){
    const m=BABYLON.MeshBuilder.CreateIcoSphere(name,{ radius:r, subdivisions:2, flat:true },scene);
    const p=m.getVerticesData(BABYLON.VertexBuffer.PositionKind);
    for(let i=0;i<p.length;i+=3){
      const k=.80+rnd()*.34;
      p[i]*=k; p[i+1]*=k*(.62+rnd()*.30); p[i+2]*=k;
    }
    m.updateVerticesData(BABYLON.VertexBuffer.PositionKind,p);"""

new = """  function boulder(scene,name,r,x,y,z,mat,tone,rnd){
    const m=BABYLON.MeshBuilder.CreateIcoSphere(name,{ radius:r, subdivisions:2, flat:true },scene);
    const p=m.getVerticesData(BABYLON.VertexBuffer.PositionKind);
    // flat:true DUPLICATES vertices per face, so each corner appears five or six
    // times. The displacement must therefore be a function of the ORIGINAL
    // position, not of the array index: jittering the array directly moves each
    // copy of a corner somewhere different and tears the solid into shards.
    const seen=new Map();
    const disp=(vx,vy,vz)=>{
      const key=Math.round(vx*1e4)+'|'+Math.round(vy*1e4)+'|'+Math.round(vz*1e4);
      let d=seen.get(key);
      if(!d){ d=[.82+rnd()*.30, .60+rnd()*.30]; seen.set(key,d); }
      return d;
    };
    for(let i=0;i<p.length;i+=3){
      const d=disp(p[i],p[i+1],p[i+2]);
      p[i]*=d[0]; p[i+1]*=d[0]*d[1]; p[i+2]*=d[0];
    }
    m.updateVerticesData(BABYLON.VertexBuffer.PositionKind,p);"""

assert src.count(old) == 1
src = src.replace(old, new)
assert src != orig
P.write_text(src)
print('ok')
