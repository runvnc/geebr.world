"""Rebuild the island edge to match ref_cliff_perimeter.png:

  * shallow hem (~1.6 units of stone above a raised sea) instead of a 2.7-unit wall
  * every cube steps out and up/down from its neighbours so TOP FACES show
  * real grass tiles cascade one or two steps down over the edge
  * vegetation follows onto those steps and into the seams
  * mid blue-grey stone value instead of near black

Idempotent-ish: run once against the committed file. Every replacement asserts
count==1 so a partial application fails loudly.
"""
import re, sys, pathlib

P = pathlib.Path('/files/geebr.world/app/terrain-hd.js')
src = P.read_text()
orig = src


def sub(old, new, n=1):
    global src
    c = src.count(old)
    assert c == n, f'expected {n} occurrence(s), found {c} of: {old[:90]!r}'
    src = src.replace(old, new)


# ---------------------------------------------------------------- 1. profile
ANCHOR = "  /* ---------- 1. island top surface ---------------------------------- */"
PROFILE = r"""  /* ---------- shared island edge profile ------------------------------
   * ONE deterministic description of the perimeter, consumed by the grass
   * cascade in buildIslandTop(), the stone hem in buildBedrock() and the
   * scatter in buildVegetation(). Interleaving grass, stone and plants is the
   * whole point of the reference edge, and that is only possible if all three
   * builders agree on which cells step down.
   * -------------------------------------------------------------------- */
  const TOP_Y      = .445;          // measured grass slab top
  const CAP_BOTTOM = TOP_Y - .87;   // measured grass slab underside
  // Raised from -3.05. The camera never sees below the waterline (beta .22 to
  // 1.42), so a deep wall was pure cost; a high sea is what makes the edge read
  // as a shallow hem rather than a cliff.
  const SEA_LEVEL  = -1.90;

  let EDGE_CACHE=null;
  function edgeProfile(){
    if(EDGE_CACHE) return EDGE_CACHE;
    const { WORLD }=API;
    let seed=0x1c3ff5;
    const rnd=()=>{ seed=(seed*1664525+1013904223)>>>0; return seed/4294967296; };
    const cells=[];
    for(const axis of ['x','z']) for(const side of [-1,1]){
      const half = axis==='x' ? WORLD.halfW : WORLD.halfH;
      const n=Math.round(half*2);
      for(let i=0;i<n;i++){
        const corner = i===0 || i===n-1;
        // 36% of the perimeter steps the plateau down and out one tile; a
        // sixth of those step again, so the green cascades instead of stopping.
        const step = corner ? 0 : (rnd()<.36 ? (rnd()<.17?2:1) : 0);
        const stepOut = .30+rnd()*.16;
        const c={
          axis, side, corner, step,
          along: -half+.5+i,
          stepOut, stepDrop: .54,
          stepOut2: stepOut+.66, stepDrop2: 1.10,
          stepShift: (rnd()-.5)*.30,
          perch: !corner && rnd()<.26,
          scatter: !corner && rnd()<.16,
          rA: rnd(), rB: rnd(), rC: rnd(), rD: rnd()
        };
        // Ledges: the stone tops that actually catch the light. One per grass
        // step so nothing floats, otherwise a single tread just under the slab.
        c.ledges=[];
        if(step){
          c.ledges.push({ top: TOP_Y-c.stepDrop-.87+.02, out: c.stepOut+.30 });
          if(step===2) c.ledges.push({ top: TOP_Y-c.stepDrop2-.87+.02, out: c.stepOut2+.30 });
        } else {
          // Vertical jitter on the tread height is what stops the cubes from
          // being coplanar and hiding each other's top faces.
          c.ledges.push({ top: CAP_BOTTOM+.14+(rnd()-.5)*.24,
                          out: (corner?.06:.10)+rnd()*(corner?.14:.38) });
        }
        cells.push(c);
      }
    }
    EDGE_CACHE={ cells };
    return EDGE_CACHE;
  }

"""
sub(ANCHOR, PROFILE + ANCHOR)

# --------------------------------------------------- 2. grass cascade tiles
sub("""    const out={};
    for(const k of Object.keys(groups)){""",
    """    // Grass cascade. The reference plateau does not stop at a line: part of
    // the perimeter steps down and outward one or two tiles before the stone
    // takes over. These are real grass_v7 clones, not boxes, so they carry the
    // same baked AO and material as the plateau and merge into the same mesh.
    if(grassProto){
      for(const c of edgeProfile().cells){
        if(!c.step) continue;
        const outHalf=c.axis==='x'?WORLD.halfH:WORLD.halfW;
        for(let s=0;s<c.step;s++){
          const off =s?c.stepOut2:c.stepOut;
          const drop=s?c.stepDrop2:c.stepDrop;
          const along=c.along+(s?c.stepShift:0);
          const outward=outHalf+off;
          const x=c.axis==='x'?along:c.side*outward;
          const z=c.axis==='x'?c.side*outward:along;
          const box=grassProto.clone('hd_grass_step');
          box.setEnabled(true); box.isVisible=true; box.isPickable=false;
          box.rotation.y=Math.floor(yawRnd()*4)*Math.PI/2;
          box.scaling.x=(yawRnd()<.5?-1:1)*1.006;
          box.scaling.z=(yawRnd()<.5?-1:1)*1.006;
          box.scaling.y=1.006;
          box.position.set(x,.010-drop,z);
          groups.grass.push(box);
        }
      }
    }

    const out={};
    for(const k of Object.keys(groups)){""")

sub("    API.state.terrainTopY=.445;", "    API.state.terrainTopY=TOP_Y;")

# ------------------------------------------------------------ 3. buildBedrock
start = src.index('  async function buildBedrock(scene){')
end = src.index("  /* ---------- 3. vegetation ------------------------------------------ */")
NEW = r"""  async function buildBedrock(scene){
    const { WORLD }=API;
    // Cut-stone blocks, not sediment banding. One texture repeat per ~1.6 units
    // so a single cube face shows two or three stones plus mortar.
    const stone=await HD.surface(scene,{ name:'cliff_masonry', file:'stone_blocks.png',
      gradeOpts:{ sat:.34, bright:1.34, contrast:1.04, tintR:1.00, tintG:1.00, tintB:1.04 },
      paint:cv=>HD.paintStoneDetail(cv,71), normalStrength:2.6, rough:.90, roughVar:.10, ao:.40 });
    stone.environmentIntensity=.95;
    // Every cliff face is vertical while the key light points down (-.48,-.86,
    // .62), so lights barely reach them: a large hemi lift measured only about
    // +5 levels. A low emissive copy of the albedo lifts the value into the
    // reference's mid blue-grey while keeping the masonry detail, which a flat
    // ambient term would wash out.
    stone.emissiveTexture=stone.albedoTexture;
    stone.emissiveColor=new BABYLON.Color3(.155,.160,.170);

    const E=edgeProfile();
    const TERRACE_TOP=CAP_BOTTOM+.10;
    const BOT=SEA_LEVEL-.80;

    const blocks=[], shore=[], perches=[];
    let seed=0xbed40c;
    const rnd=()=>{ seed=(seed*1664525+1013904223)>>>0; return seed/4294967296; };
    // Mid values, separated block to block. The reference distinguishes cubes
    // by value, not by hue, and nothing in it is close to black.
    const tone=()=>{ const r=rnd(); return r<.22?.72+rnd()*.08 : r<.74?.83+rnd()*.09 : .94+rnd()*.06; };

    // Deepest inner face reached by any cube, so the core can be pulled back
    // behind them: a core flush with the plateau edge reads as a continuous
    // back wall through the seams.
    let coreX=0, coreZ=0;

    const put=(list,name,c,along,face,w,h,d,cyTop,t)=>{
      const outward=face-d*.5;
      const inner=face-d;
      if(c.axis==='x') coreZ=Math.max(coreZ,inner); else coreX=Math.max(coreX,inner);
      const x=c.axis==='x'?along:c.side*outward;
      const z=c.axis==='x'?c.side*outward:along;
      const m=stoneBox(scene,name,c.axis==='x'?w:d,h,c.axis==='x'?d:w,
        x,cyTop-h*.5,z,stone,t);
      list.push(m); return m;
    };

    for(const c of E.cells){
      const outHalf = c.axis==='x' ? WORLD.halfH : WORLD.halfW;
      c.ledges.forEach((L,li)=>{
        const faceA=outHalf+L.out;
        // Depth is derived from the outward offset so the inner face always
        // lands the same distance inside the plateau edge: that is what makes
        // the terrace void-proof no matter how far a cube steps out.
        const dA=L.out+.68+c.rB*.22;
        const hA=.78+c.rA*.20;
        // Split a minority of treads so the seam rhythm is not one cube per
        // cell all the way round.
        const parts=(!c.corner && li===0 && c.rC<.28)?2:1;
        for(let k=0;k<parts;k++){
          const w=(1/parts)*(.88+rnd()*.14);
          const a=c.along+(parts===2?(k?.25:-.25):0)+(rnd()-.5)*.07;
          const f=faceA+(parts===2?(k?.07:-.06):0)+(rnd()-.5)*.06;
          const y=L.top+(parts===2?(k?.06:-.05):0);
          put(blocks,'hd_cliff_block',c,a,f,w,hA,dA,y,tone());
        }
        // Lower course: usually recessed, sometimes proud, so the waterline
        // silhouette is not a straight extrusion of the tread above it.
        const proud=c.rD<.30;
        const outB=Math.max(.02, L.out+(proud?.14:-(.16+c.rD*.22)));
        const faceB=outHalf+outB;
        const topB=L.top-hA+.12;
        put(blocks,'hd_cliff_block_low',c,c.along+(rnd()-.5)*.10,faceB,
          .92+rnd()*.14,topB-BOT,outB+.70+rnd()*.20,topB,tone()*.94);
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
    }

    // Corner stacks turned 45 degrees so the two runs meet on a cut corner
    // rather than a square tower.
    for(const sx of [-1,1]) for(const sz of [-1,1]){
      let top=CAP_BOTTOM+.12+rnd()*.10;
      for(let ci=0;ci<2;ci++){
        const s=1.12-ci*.10+rnd()*.14;
        const inset=.46+ci*.16+rnd()*.10;
        const h=ci?top-BOT:.80+rnd()*.16;
        blocks.push(stoneBox(scene,'hd_cliff_corner_block',s,h,s,
          sx*(WORLD.halfW-inset),top-h*.5,sz*(WORLD.halfH-inset),stone,tone(),Math.PI/4));
        top=top-h+.12;
      }
    }

    // Solid core, pulled back to just behind the shallowest cube so the
    // terrace can never be seen through but the core itself stays in shadow.
    blocks.push(stoneBox(scene,'hd_cliff_core',(coreX+.04)*2,TERRACE_TOP-BOT,(coreZ+.04)*2,
      0,(TERRACE_TOP+BOT)*.5,0,stone,.70));

    // Shallow-water stones so the shoreline is not a clean rectangle meeting a
    // flat plane.
    for(let i=0;i<22;i++){
      const axis=i%2?'x':'z';
      const side=(i>>1)%2?1:-1;
      const half   = axis==='x' ? WORLD.halfW : WORLD.halfH;
      const outHalf= axis==='x' ? WORLD.halfH : WORLD.halfW;
      const along=(rnd()*2-1)*(half-.4);
      const outward=outHalf+.55+rnd()*.75;
      const s=.24+rnd()*.40;
      const x=axis==='x'?along:side*outward, z=axis==='x'?side*outward:along;
      shore.push(stoneBox(scene,'hd_shore_rock',s,s*(.8+rnd()*.7),s*(.7+rnd()*.5),
        x,SEA_LEVEL-.10+rnd()*.26,z,stone,tone(),rnd()*Math.PI));
    }

    let a,b;
    try{
      // cliff_rock_*.glb are the restone.py recolours of cliff_straight_*.glb.
      // The originals could not be used at all: their 4096 albedo measured 95%
      // green over the WHOLE texture (Tripo textured the entire asset as moss),
      // so no geometric trim could remove the green - it was never a rock skin.
      // Geometry is untouched and still reference-derived; only albedo changed.
      // With the hem now shallow they serve as waterline outcrops rather than
      // buttresses; anything taller would rebuild the wall we just removed.
      [a,b]=await Promise.all([
        importCliffAsset(scene,'cliff_rock_a.glb','hd_cliff_variant_a_proto'),
        importCliffAsset(scene,'cliff_rock_b.glb','hd_cliff_variant_b_proto')
      ]);
      const accents=[];
      const sites=[
        ['x',-1,-2.9], ['x',-1, 1.7], ['x', 1,-0.6],
        ['z',-1, 2.2], ['z', 1,-1.4], ['x', 1, 3.6]
      ];
      sites.forEach((site,i)=>{
        const [axis,side,along]=site;
        const proto=i%2?a:b, c=proto.clone('hd_cliff_buttress_accent');
        c.setEnabled(true); c.isVisible=true; c.isPickable=false;
        const h=proto.metadata?.trimmedHeight??proto.metadata?.assetHeight??.75;
        const sxz=.78+rnd()*.30, sy=(.80+rnd()*.34)/Math.max(.2,h);
        c.scaling.set((i%3===0?-1:1)*sxz,sy,sxz);
        c.rotation.y=axis==='x' ? (side<0?0:Math.PI) : (side<0?-Math.PI/2:Math.PI/2);
        const outHalf=axis==='x'?WORLD.halfH:WORLD.halfW;
        const outward=outHalf+.46-sxz*.5;
        const x=axis==='x'?along:side*outward, z=axis==='x'?side*outward:along;
        c.position.set(x,SEA_LEVEL-.34,z);
        c.receiveShadows=true; accents.push(c);
      });
      a.dispose(); b.dispose();
      API.state.generatedCliffSegments=accents.length;
    }catch(e){ console.warn('generated cliff accents unavailable',e); a?.dispose(); b?.dispose(); }

    const wall=merge(blocks,'hd_cliff_wall',stone);
    const rocks=merge(shore,'hd_shore_rocks',stone);
    const loose=merge(perches,'hd_edge_stones',stone);
    API.state.hdMaterials=Object.assign(API.state.hdMaterials||{},{cliff:stone});
    API.state.cliffFaceParts=blocks.length+shore.length+perches.length;
    API.state.cliffBottomY=BOT;
    return { wall, rocks, loose };
  }

"""
src = src[:start] + NEW + src[end:]

# ------------------------------------------------------------- 4. vegetation
sub("""    tuftProto.dispose(); daisyProto.dispose();""",
    """    // Vegetation does not stop at the plateau boundary in the reference: it
    // grows on the stepped-down grass caps and out of the seams between the
    // top course of cubes.
    for(const c of edgeProfile().cells){
      const outHalf=c.axis==='x'?WORLD.halfH:WORLD.halfW;
      const spots=[];
      if(c.step){
        spots.push([c.stepOut,(API.state.terrainTopY??TOP_Y)-c.stepDrop+.018,2]);
        if(c.step===2) spots.push([c.stepOut2,(API.state.terrainTopY??TOP_Y)-c.stepDrop2+.018,1]);
      }
      if(!c.corner && c.rD<.42) spots.push([c.ledges[0].out-.26,c.ledges[0].top+.02,1]);
      for(const [off,y,count] of spots){
        for(let j=0;j<count;j++){
          const outward=outHalf+off+(rnd()-.5)*.34;
          const along=c.along+(rnd()-.5)*.62;
          const x=c.axis==='x'?along:c.side*outward;
          const z=c.axis==='x'?c.side*outward:along;
          const t=tuftProto.clone('hd_blade_cluster');
          t.scaling.setAll(.46*(.85+rnd()*.28));
          t.rotationQuaternion=BABYLON.Quaternion.FromEulerAngles((rnd()-.5)*.22,rnd()*Math.PI*2,0);
          t.position.set(x,y,z); t.isPickable=false; tufts.push(t);
        }
        if(rnd()<.22){
          const outward=outHalf+off+(rnd()-.5)*.3;
          const along=c.along+(rnd()-.5)*.5;
          const d=daisyProto.clone('hd_daisy_clump');
          d.scaling.setAll(.38*(.9+rnd()*.2));
          d.rotationQuaternion=BABYLON.Quaternion.FromEulerAngles(0,rnd()*Math.PI*2,0);
          d.position.set(c.axis==='x'?along:c.side*outward,y,c.axis==='x'?c.side*outward:along);
          d.isPickable=false; daisies.push(d);
        }
      }
    }

    tuftProto.dispose(); daisyProto.dispose();""")

# ------------------------------------------------------------------ 5. water
sub("    const SEA_Y=-3.05;", "    const SEA_Y=SEA_LEVEL;")
sub("""    m.metallic=.16; m.roughness=.14;""",
    """    // Was metallic .16 / roughness .14: a mirror that blew out to pure white
    // wherever the key light glanced off it.
    m.metallic=.06; m.roughness=.34;""")
sub("""    mk(WORLD.w-4.6,bw,0,-(WORLD.halfH-2.3)-bw*.3);
    mk(WORLD.w-4.6,bw,0, (WORLD.halfH-2.3)+bw*.3);
    mk(WORLD.h-4.6,bw,-(WORLD.halfW-2.3)-bw*.3,0,Math.PI/2);
    mk(WORLD.h-4.6,bw, (WORLD.halfW-2.3)+bw*.3,0,Math.PI/2);""",
    """    // Hug the actual waterline. These used to sit at halfH-2.3, which was well
    // inside the island and therefore buried under it.
    const fo=.62;
    mk(WORLD.w+1.3,bw,0,-(WORLD.halfH+fo));
    mk(WORLD.w+1.3,bw,0, (WORLD.halfH+fo));
    mk(WORLD.h+1.3,bw,-(WORLD.halfW+fo),0,Math.PI/2);
    mk(WORLD.h+1.3,bw, (WORLD.halfW+fo),0,Math.PI/2);""")

assert src != orig
P.write_text(src)
print('patched', len(orig), '->', len(src))
