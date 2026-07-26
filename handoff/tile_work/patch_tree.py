"""Replace the procedural cone-stack pine() with the master's flared, notched,
dark-undersided tier tree. Measured spec in CLIFF_EDGE_HANDOFF section 8.3 as
corrected by session 5d (4 tiers, about 1.4:1, not 5-6 tiers at 2.5:1).

Run from /files/geebr.world/handoff/tile_work against a clean tree at 64cca41.
"""
import pathlib

P = pathlib.Path('/files/geebr.world/app/terrain-hd.js')
s = P.read_text()

# ---------------------------------------------------------------- leaf albedo
# The two-row tone spread multiplies the albedo by about .72 on average, so the
# base colour has to come up or the whole canopy goes muddy.
old = """    const leafA=new BABYLON.PBRMaterial('hd_leaf_a',scene);
    leafA.albedoColor=C3(.085,.120,.052); leafA.metallic=0; leafA.roughness=.94;"""
new = """    const leafA=new BABYLON.PBRMaterial('hd_leaf_a',scene);
    // Raised from .085/.120/.052: tier faces are now vertex-toned and the mean
    // multiplier is about .72, so the old albedo left the canopy muddy.
    leafA.albedoColor=C3(.118,.165,.072); leafA.metallic=0; leafA.roughness=.94;"""
assert s.count(old) == 1
s = s.replace(old, new)

# ---------------------------------------------------------------- pine + bush
old_pine_start = "    function pine(x,z,s,seed){"
old_bush_end = """    function bush(x,z,s,seed){
      for(let i=0;i<3;i++){
        const b=BABYLON.MeshBuilder.CreateSphere('bush_lobe',{ diameter:(.20+noise(seed,i)*.16)*s, segments:5 },scene);
        b.position.set(x+(noise(seed,i*7)-.5)*.20*s, .09*s+noise(seed,i*11)*.06, z+(noise(seed,i*13)-.5)*.20*s);
        b.scaling.y=.72;
        (i%2?leavesB:leavesA).push(b);
      }
    }"""
assert s.count(old_pine_start) == 1
assert s.count(old_bush_end) == 1
i0 = s.index(old_pine_start)
i1 = s.index(old_bush_end) + len(old_bush_end)

replacement = r"""    // Sun direction flattened to the ground plane, pointing FROM a surface
    // TOWARDS the light, so dot(faceNormalXZ, SUN) > 0 means a lit facet. The
    // key light in look.js aims (-.48,-.86,.62), hence (+.48,-.62) normalised.
    const SUNX=.611, SUNZ=-.792;

    // Darker leaf faces pick up sky fill rather than simply scaling down:
    // measured lit 65/74/25 against shade 30/47/25 in the master, i.e. red
    // falls away faster than green. Mild, because the hemi light does part of
    // this already.
    function leafTone(k){
      const w=Math.min(1,k);
      return [k*(.80+.20*w), k, k*(.86+.14*w)];
    }

    // merge() turns on useVertexColors, and a colour buffer present on only
    // SOME of the merged meshes is undefined, so anything sharing a merge group
    // with a toned tier has to carry one too.
    function paintUniform(mesh,t){
      const n=mesh.getTotalVertices(), c=new Float32Array(n*4);
      for(let i=0;i<n;i++){ c[i*4]=c[i*4+1]=c[i*4+2]=t; c[i*4+3]=1; }
      mesh.setVerticesData(BABYLON.VertexBuffer.ColorKind,c);
    }

    // A tier tree, built to the measured master (CLIFF_EDGE_HANDOFF 8.3, with
    // the session 5d correction). FOUR tiers, not five or six; roughly 1.4:1
    // tall, not 2.5:1. The read comes almost entirely from the near-black band
    // on the UPPER slope of each skirt, which is the shadow of the skirt above
    // it. That band is faked with vertex colour on a COPLANAR face row - the
    // same per-face tone trick that fixed the cliff cubes - because no shadow
    // map resolves a .05-unit overhang at diorama scale.
    const TIER_N = 8;         // facets per tier; the master reads octagonal
    const TIERS = 4;          // apex cone plus three skirts
    const UPPER = .42;        // fraction of each slope sitting in shadow
    function pine(x,z,s,seed){
      const P=[],C=[],I=[];
      const tri=(a,b,c,t)=>{
        const o=P.length/3;
        P.push(a[0],a[1],a[2], b[0],b[1],b[2], c[0],c[1],c[2]);
        for(let k=0;k<3;k++) C.push(t[0],t[1],t[2],1);
        I.push(o,o+1,o+2);
      };
      const lerp=(a,b,t)=>[a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t, a[2]+(b[2]-a[2])*t];

      const R=.46*s;                                  // lowest rim radius
      const PITCH=.52*R;                              // vertical rim spacing
      const trunkH=(.26+noise(seed,1)*.10)*s;
      const rimY=k=>trunkH*.55+(TIERS-1-k)*PITCH;     // k=0 is the apex tier
      const rimR=k=>R*(.44+.56*k/(TIERS-1));
      const lean=noise(seed,31)*Math.PI*2;            // whole-tree yaw
      const vary=.92+noise(seed,33)*.16;              // per-tree brightness

      for(let k=0;k<TIERS;k++){
        const yb=rimY(k), rb=rimR(k);
        const apex=k===0;
        // The top ring sits slightly BELOW the rim above it at .86 of its
        // radius: that is the pinch measured between every pair of tiers.
        const yt=apex ? yb+1.55*PITCH : rimY(k-1)-.12*PITCH;
        const rt=apex ? 0 : rimR(k-1)*.86;
        const yaw=lean+k*.38;                         // slight twist per tier
        for(let i=0;i<TIER_N;i++){
          const a0=yaw+i*Math.PI*2/TIER_N, a1=a0+Math.PI*2/TIER_N;
          const am=(a0+a1)*.5;
          // Per-facet rim wobble so the skirt is not a clean circle. Derived
          // from the ring index only, so it is a pure function of position and
          // shared corners stay shared (see handoff 8.1).
          const w0=1+(noise(seed,k*17+i)-.5)*.13, w1=1+(noise(seed,k*17+i+1)-.5)*.13;
          const t0=[Math.cos(a0)*rt*w0, yt, Math.sin(a0)*rt*w0];
          const t1=[Math.cos(a1)*rt*w1, yt, Math.sin(a1)*rt*w1];
          const b0=[Math.cos(a0)*rb*w0, yb, Math.sin(a0)*rb*w0];
          const b1=[Math.cos(a1)*rb*w1, yb, Math.sin(a1)*rb*w1];
          const face=Math.max(0,Math.cos(am)*SUNX+Math.sin(am)*SUNZ);
          const litK=(.72+.63*face)*vary;
          const lit=leafTone(litK);
          // The apex has nothing above it, so it gets no shadow band.
          const dark=leafTone((apex ? litK*.86 : .34*(.88+.34*face))*vary);
          const m0=lerp(t0,b0,UPPER), m1=lerp(t1,b1,UPPER);
          if(rt>0){ tri(t0,t1,m1,dark); tri(t0,m1,m0,dark); }
          else { tri(t0,t1,m1,dark); }   // apex: t0 and t1 coincide
          // Notched lower edge: the midpoint of the bottom edge is pulled back
          // UP the slope, staying inside the facet plane, so the facet remains
          // flat while the silhouette edge zigzags.
          const notch=.70+noise(seed,k*23+i)*.22;
          const bm=lerp(lerp(m0,m1,.5), lerp(b0,b1,.5), notch);
          tri(m0,m1,b1,lit); tri(m0,b1,bm,lit); tri(m0,bm,b0,lit);
          // Underside of the lowest skirt only: closes the solid and is what
          // the shadow map casts from.
          if(k===TIERS-1){
            const c=[0,yb,0], u=leafTone(.16*vary);
            tri(c,b0,bm,u); tri(c,bm,b1,u);
          }
        }
      }

      const vd=new BABYLON.VertexData();
      vd.positions=P; vd.indices=I; vd.colors=C;
      const mesh=new BABYLON.Mesh('pine_tiers',scene);
      vd.applyToMesh(mesh);
      // Winding is not guessed: test the first side facet's normal against its
      // own radial direction and reverse every triangle if it faces inward.
      let nrm=[]; BABYLON.VertexData.ComputeNormals(P,I,nrm);
      if(P[0]*nrm[0]+P[2]*nrm[2] < 0){
        for(let i=0;i<I.length;i+=3){ const t=I[i+1]; I[i+1]=I[i+2]; I[i+2]=t; }
        mesh.setIndices(I); nrm=[]; BABYLON.VertexData.ComputeNormals(P,I,nrm);
        mesh.setVerticesData(BABYLON.VertexBuffer.NormalKind,nrm);
      }
      mesh.position.set(x,0,z);
      leavesA.push(mesh);

      // Short octagonal warm-brown trunk, mostly hidden by the lowest skirt.
      const tr=BABYLON.MeshBuilder.CreateCylinder('pine_trunk',
        { height:trunkH, diameterTop:.11*s, diameterBottom:.16*s, tessellation:8 },scene);
      tr.position.set(x,trunkH*.5,z);
      paintUniform(tr,1);
      trunks.push(tr);
    }

    function bush(x,z,s,seed){
      for(let i=0;i<3;i++){
        const b=BABYLON.MeshBuilder.CreateSphere('bush_lobe',{ diameter:(.20+noise(seed,i)*.16)*s, segments:5 },scene);
        b.position.set(x+(noise(seed,i*7)-.5)*.20*s, .09*s+noise(seed,i*11)*.06, z+(noise(seed,i*13)-.5)*.20*s);
        b.scaling.y=.72;
        paintUniform(b,i%2?1:1.12);
        (i%2?leavesB:leavesA).push(b);
      }
    }"""

s = s[:i0] + replacement + s[i1:]
P.write_text(s)
print('patched pine()')
