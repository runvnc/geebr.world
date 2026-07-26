"""Resize the edge cubes to match the reference, and round the loose rocks.

A 2x zoom on the reference crop settled two things the wider view hid:

  * the stone cubes are about HALF a grass tile, not one. There are roughly two
    per tile across and three courses in the hem, stacked in a near-regular
    grid with small offsets and a strong dark seam around every cube. Our cubes
    were tile-sized, which is why they still read as wall panels.
  * the loose rocks lying on the grass are ROUNDED boulders, not cubes, and
    they sit well inside the plateau boundary, not only on the rim.
"""
import pathlib

P = pathlib.Path('/files/geebr.world/app/terrain-hd.js')
src = P.read_text()
orig = src


def sub(old, new, n=1):
    global src
    c = src.count(old)
    assert c == n, f'expected {n}, found {c} of: {old[:90]!r}'
    src = src.replace(old, new)


# ------------------------------------------------ profile: sub-columns
sub("""        // Ledges: the stone tops that actually catch the light. One per grass
        // step so nothing floats, otherwise a single tread just under the slab.
        c.ledges=[];
        if(step){
          c.ledges.push({ top: TOP_Y-c.stepDrop-.87+.02, out: c.stepOut+.30 });
          if(step===2) c.ledges.push({ top: TOP_Y-c.stepDrop2-.87+.02, out: c.stepOut2+.30 });
        } else {
          // Vertical jitter on the tread height is what stops the cubes from
          // being coplanar and hiding each other's top faces.
          c.ledges.push({ top: CAP_BOTTOM+.16+(rnd()-.5)*.52,
                          out: (corner?.06:.06)+rnd()*(corner?.14:.52) });
        }
        cells.push(c);""",
    """        // Sub-columns: TWO stone cubes per grass tile across, which is the
        // proportion in the reference. One tile-wide block per cell always
        // reads as a wall panel however it is toned or staggered.
        c.cols=[];
        for(let k=0;k<2;k++){
          const along=c.along+(k?.25:-.25);
          if(step){
            // Sit directly under the grass tile that stepped out here, so the
            // cascade has something to stand on.
            const s2 = step===2 && k===1;
            const off  = s2?c.stepOut2:c.stepOut;
            const drop = s2?c.stepDrop2:c.stepDrop;
            c.cols.push({ along, top: TOP_Y-drop-.87+.02, out: off+.28+rnd()*.10,
                          r:rnd(), r2:rnd() });
          } else {
            // Vertical jitter on the tread is what stops neighbouring cubes
            // from being coplanar and hiding each other's top faces.
            c.cols.push({ along, top: CAP_BOTTOM+.10-rnd()*.46,
                          out: (corner?.04:.02)+rnd()*(corner?.12:.44),
                          r:rnd(), r2:rnd() });
          }
        }
        // Kept for the vegetation pass, which seeds plants on the treads.
        c.ledges=c.cols.map(q=>({ top:q.top, out:q.out }));
        cells.push(c);""")

# ------------------------------------------------- bedrock: cube grid
sub("""    for(const c of E.cells){
      const outHalf = c.axis==='x' ? WORLD.halfH : WORLD.halfW;
      c.ledges.forEach((L,li)=>{
        const faceA=outHalf+L.out;
        // Depth is derived from the outward offset so the inner face always
        // lands the same distance inside the plateau edge: that is what makes
        // the terrace void-proof no matter how far a cube steps out.
        const dA=L.out+.62+c.rB*.34;
        const hA=.78+c.rA*.20;
        // Split a minority of treads so the seam rhythm is not one cube per
        // cell all the way round.
        const parts=(!c.corner && li===0 && c.rC<.28)?2:1;
        for(let k=0;k<parts;k++){
          const w=(1/parts)*(.74+rnd()*.14);
          const a=c.along+(parts===2?(k?.25:-.25):0)+(rnd()-.5)*.07;
          const f=faceA+(parts===2?(k?.09:-.08):0)+(rnd()-.5)*.16;
          const y=L.top+(parts===2?(k?.06:-.05):0);
          put(blocks,'hd_cliff_block',c,a,f,w,hA,dA,y,tone());
        }
        // Lower course: usually recessed, sometimes proud, so the waterline
        // silhouette is not a straight extrusion of the tread above it.
        const proud=c.rD<.34;
        const outB=Math.max(.02, L.out+(proud?.14:-(.16+c.rD*.22)));
        const faceB=outHalf+outB;
        const topB=L.top-hA+.12;
        put(blocks,'hd_cliff_block_low',c,c.along+(rnd()-.5)*.14,faceB,
          .78+rnd()*.16,topB-BOT,outB+.74+rnd()*.20,topB,tone()*.94);
      });

      // A loose cube perched on the tread, as in the reference.
      if(c.perch){
        const L=c.ledges[0];
        const s=.34+rnd()*.18;
        put(perches,'hd_edge_stone',c,c.along+(rnd()-.5)*.34,
          outHalf+L.out-.12,s,s*(.82+rnd()*.28),s,L.top+s*(.82+rnd()*.10),tone());
      }
      // ...and a few sitting on the grass just inside the boundary.
      if(c.scatter){
        const s=.40+rnd()*.20;
        const grassTop=(c.step?TOP_Y-c.stepDrop:TOP_Y);
        const off=c.step?c.stepOut:-(.20+rnd()*.55);
        put(perches,'hd_edge_stone',c,c.along+(rnd()-.5)*.40,
          outHalf+off+s*.5,s,s*(.86+rnd()*.24),s,grassTop+s*.84);
      }
    }""",
    """    const COURSE=.53;    // three courses fill the ~1.58 unit hem
    for(const c of E.cells){
      const outHalf = c.axis==='x' ? WORLD.halfH : WORLD.halfW;
      for(const col of c.cols){
        let top=col.top, ci=0;
        while(top>BOT+.10){
          const last=(top-COURSE)<=BOT+.10;
          const h=last?top-BOT:COURSE*(.92+col.r*.16);
          // Batter: each course steps back slightly, with jitter, and the odd
          // one juts proud so the waterline is not a straight extrusion.
          const jut=(ci>0 && ((ci*7+col.r2*11)%3)<1)?.10:0;
          const out=Math.max(.01, col.out-ci*.07+jut+(rnd()-.5)*.10);
          // Depth derived from the outward offset, so the inner face always
          // lands the same distance inside the plateau edge: that is what makes
          // the terrace void-proof however far a cube steps out.
          const d=out+.46+rnd()*.16;
          // Cube is narrower than its 0.5 slot, leaving a seam for SSAO.
          const w=.42+rnd()*.05;
          put(blocks,'hd_cliff_block',c,col.along+(rnd()-.5)*.03,
            outHalf+out,w,h,d,top,tone());
          top-=h; ci++;
        }
      }

      // A loose cube perched on the tread, as in the reference.
      if(c.perch){
        const L=c.cols[0];
        const s=.26+rnd()*.14;
        put(perches,'hd_edge_stone',c,c.along+(rnd()-.5)*.34,
          outHalf+L.out-.06,s,s*(.82+rnd()*.28),s,L.top+s*(.82+rnd()*.10),tone());
      }
    }

    // Rounded boulders scattered ON the plateau. The reference has these well
    // inside the boundary, and they are rocks, not cubes: a cube here just
    // looks like a piece of the wall that escaped.
    for(let i=0;i<26;i++){
      const s=.20+rnd()*.26;
      const edge=rnd()<.45;
      const x=edge?(rnd()<.5?-1:1)*(WORLD.halfW-.3-rnd()*1.6):(rnd()*2-1)*(WORLD.halfW-1.2);
      const z=edge?(rnd()*2-1)*(WORLD.halfH-1.0):(rnd()<.5?-1:1)*(WORLD.halfH-.3-rnd()*1.6);
      if(Math.abs(x)<2.2&&Math.abs(z)<2.2) continue;
      perches.push(boulder(scene,'hd_edge_stone',s,x,TOP_Y+s*.42,z,stone,tone(),rnd));
    }""")

# ------------------------------------------------------ boulder helper
sub("  async function buildBedrock(scene){",
    """  // Faceted rock. An icosphere with jittered vertices and flat shading reads
  // as a quarried boulder under the clay look, and unlike a box it never lines
  // up with the cube grid behind it.
  function boulder(scene,name,r,x,y,z,mat,tone,rnd){
    const m=BABYLON.MeshBuilder.CreateIcoSphere(name,{ radius:r, subdivisions:2, flat:true },scene);
    const p=m.getVerticesData(BABYLON.VertexBuffer.PositionKind);
    for(let i=0;i<p.length;i+=3){
      const k=.80+rnd()*.34;
      p[i]*=k; p[i+1]*=k*(.62+rnd()*.30); p[i+2]*=k;
    }
    m.updateVerticesData(BABYLON.VertexBuffer.PositionKind,p);
    const cols=new Float32Array((p.length/3)*4);
    for(let i=0;i<cols.length;i+=4){ cols[i]=cols[i+1]=cols[i+2]=tone; cols[i+3]=1; }
    m.setVerticesData(BABYLON.VertexBuffer.ColorKind,cols);
    const nrm=[]; BABYLON.VertexData.ComputeNormals(p,m.getIndices(),nrm);
    m.setVerticesData(BABYLON.VertexBuffer.NormalKind,nrm);
    m.position.set(x,y,z); m.rotation.y=rnd()*Math.PI*2;
    m.material=mat; m.isPickable=false; m.receiveShadows=true;
    return m;
  }

  async function buildBedrock(scene){""")

# Shoreline stones should be rocks too, for the same reason.
sub("""      shore.push(stoneBox(scene,'hd_shore_rock',s,s*(.8+rnd()*.7),s*(.7+rnd()*.5),
        x,SEA_LEVEL-.10+rnd()*.26,z,stone,tone(),rnd()*Math.PI));""",
    """      shore.push(boulder(scene,'hd_shore_rock',s*.7,x,SEA_LEVEL-.06+rnd()*.22,z,
        stone,tone(),rnd));""")

assert src != orig
P.write_text(src)
print('ok', len(orig), '->', len(src))
