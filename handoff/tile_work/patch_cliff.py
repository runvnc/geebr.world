#!/usr/bin/env python3
"""Rebuild the cliff perimeter in app/terrain-hd.js as one coherent carved mass.

Why: HD.roundedTile() emits positions/indices/colors/normals but NO UVs, so every
previous cliffBox() sampled a single texel of the masonry albedo/normal/ORM maps
and the whole lower island collapsed into flat brown slabs. The replacement uses
real boxes with world-scaled face UVs plus per-course value tones, two stepped
courses instead of one monolith, sparse GLB accents sunk beneath the plateau, and
a waterline treatment.
"""
import pathlib

p = pathlib.Path('/files/geebr.world/app/terrain-hd.js')
src = p.read_text()

start = src.index('  function cliffBox(scene,')
end = src.index("  /* ---------- 3. vegetation ---")
assert start < end

NEW = r"""  // World units per masonry texture repeat. Boxes carry real face UVs so the
  // graded stone albedo / generated normal / ORM maps actually resolve; the old
  // roundedTile() path emitted no UVs at all and read as flat brown slabs.
  const STONE_UV = 1.6;

  function stoneBox(scene,name,w,h,d,x,y,z,mat,tone,ry=0){
    const uw=w/STONE_UV, uh=h/STONE_UV, ud=d/STONE_UV;
    const fz=rect(0,0,uw,uh), fx=rect(0,0,ud,uh), fy=rect(0,0,uw,ud);
    const c=new BABYLON.Color4(tone,tone,tone,1);
    const m=BABYLON.MeshBuilder.CreateBox(name,{ width:w, height:h, depth:d,
      faceUV:[fz,fz,fx,fx,fy,fy], faceColors:[c,c,c,c,c,c], wrap:true },scene);
    m.position.set(x,y,z);
    if(ry) m.rotation.y=ry;
    m.material=mat; m.isPickable=false; m.receiveShadows=true;
    return m;
  }

  async function buildBedrock(scene){
    const { WORLD }=API;
    // Blocky masonry, not horizontal sediment banding: the reference cliff is
    // stacked cut stone. Brightness lives in the texture, value separation
    // between courses lives in vertex tone.
    const stone=await HD.surface(scene,{ name:'cliff_masonry', file:'stone_blocks.png',
      gradeOpts:{ sat:.30, bright:1.06, contrast:1.16, tintR:.99, tintG:1.01, tintB:1.02 },
      paint:cv=>HD.paintStoneDetail(cv,71), normalStrength:3.2, rough:.90, roughVar:.10, ao:.72 });
    stone.environmentIntensity=.70;

    const top=API.state.terrainTopY??.445;   // grass top
    const capBottom=top-.87;                 // measured grass slab underside
    const SEA=-3.05;
    const U_TOP=capBottom+.08;               // tuck under the plateau lip
    const L_BOT=SEA-.62;                     // finish below the waterline

    const mass=[], shore=[];
    let seed=0xbed40c;
    const rnd=()=>{ seed=(seed*1664525+1013904223)>>>0; return seed/4294967296; };

    // tones: upper course catches light, lower course drops away, recesses read
    // as dark cuts. No hue variation anywhere.
    const T_UPPER=.94, T_LOWER=.62, T_RECESS=.38, T_PILASTER=1.0, T_SHELF=.74;

    const addRun=(axis,side)=>{
      const half   = axis==='x' ? WORLD.halfW : WORLD.halfH;   // along the run
      const outHalf= axis==='x' ? WORLD.halfH : WORLD.halfW;   // outward
      const cornerCut=.70;
      let at=-half+cornerCut;
      const place=(along,outward,w,h,d,tone,name)=>{
        const x=axis==='x'?along:side*outward, z=axis==='x'?side*outward:along;
        mass.push(stoneBox(scene,name,axis==='x'?w:d,h,axis==='x'?d:w,x,0,z,stone,tone));
        return mass[mass.length-1];
      };
      while(at<half-cornerCut-.02){
        const span=Math.min(half-cornerCut-at,.95+rnd()*1.30);
        const along=at+span*.5;

        // upper course: continuous, only 4cm inside the grass edge so the
        // plateau overhangs and casts a hard seam line.
        const uD=.66, uH=(U_TOP)-(-1.48-rnd()*.16);
        const uCy=U_TOP-uH*.5;
        const uOut=outHalf-.04-uD*.5;
        let m=place(along,uOut,span+.03,uH,uD,T_UPPER,'hd_cliff_upper');
        m.position.y=uCy;

        // lower course: stepped back by a varying amount. Deep steps read as
        // recesses, shallow ones as buttress feet, so the silhouette is broken
        // without one ornament per cell.
        const roll=rnd();
        const ins = roll<.22 ? .82+rnd()*.26        // recess
                  : roll<.44 ? .10+rnd()*.08        // near-flush buttress foot
                             : .34+rnd()*.22;
        const tone = roll<.22 ? T_RECESS : T_LOWER;
        const lD=.80, lTop=uCy-uH*.5+.10;
        const lH=lTop-L_BOT;
        const lOut=outHalf-ins-lD*.5;
        m=place(along,lOut,span+.03,lH,lD,tone,'hd_cliff_lower');
        m.position.y=lTop-lH*.5;

        // sparse pilasters: narrow vertical ribs projecting past the upper face.
        if(rnd()<.26 && span>1.15){
          const pw=.34+rnd()*.22, ph=uH+.55+rnd()*.5;
          const pOut=outHalf+.05-.34*.5;
          m=place(along+(rnd()-.5)*span*.34,pOut,pw,ph,.34,T_PILASTER,'hd_cliff_pilaster');
          m.position.y=U_TOP-.06-ph*.5;
        }

        // waterline shelf: flat slab straddling the sea plane, projecting out.
        if(rnd()<.30){
          const sw=span*(.34+rnd()*.34), sd=.52+rnd()*.30;
          const sOut=outHalf-ins+.10-sd*.5;
          m=place(along+(rnd()-.5)*span*.30,sOut,sw,.46+rnd()*.22,sd,T_SHELF,'hd_waterline_shelf');
          m.position.y=SEA+.16-rnd()*.20;
        }
        at+=span;
      }
    };
    addRun('x',-1); addRun('x',1); addRun('z',-1); addRun('z',1);

    // Corners are their own masses rotated 45 degrees so the two runs never
    // collide into a square pillar.
    for(const sx of [-1,1]) for(const sz of [-1,1]){
      const uH=U_TOP-(-1.55);
      const cu=stoneBox(scene,'hd_cliff_corner',.86,uH,.86,
        sx*(WORLD.halfW-.50),U_TOP-uH*.5,sz*(WORLD.halfH-.50),stone,T_UPPER,Math.PI/4);
      const lH=-1.45-L_BOT;
      const cl=stoneBox(scene,'hd_cliff_corner_low',1.05,lH,1.05,
        sx*(WORLD.halfW-.86),-1.45-lH*.5,sz*(WORLD.halfH-.86),stone,T_LOWER,Math.PI/4);
      mass.push(cu,cl);
    }

    // Two inset fills close the underside while letting the outer silhouette
    // taper instead of reading as one rectangular cake.
    mass.push(stoneBox(scene,'hd_cliff_core',WORLD.w-1.3,U_TOP-(-1.60),WORLD.h-1.3,
      0,(U_TOP+(-1.60))*.5,0,stone,T_LOWER*.9));
    mass.push(stoneBox(scene,'hd_cliff_core',WORLD.w-2.6,-1.50-(L_BOT+.30),WORLD.h-2.6,
      0,(-1.50+L_BOT+.30)*.5,0,stone,T_LOWER*.8));

    // Shallow-water rocks: irregular stones sitting in the surf, matching the
    // reference shoreline rather than a clean rectangular base.
    for(let i=0;i<18;i++){
      const axis=i%2?'x':'z';
      const side=(i>>1)%2?1:-1;
      const half   = axis==='x' ? WORLD.halfW : WORLD.halfH;
      const outHalf= axis==='x' ? WORLD.halfH : WORLD.halfW;
      const along=(rnd()*2-1)*(half-.5);
      const outward=outHalf+.10+rnd()*.55;
      const s=.26+rnd()*.42;
      const x=axis==='x'?along:side*outward, z=axis==='x'?side*outward:along;
      shore.push(stoneBox(scene,'hd_shore_rock',s,s*(.7+rnd()*.6),s*(.7+rnd()*.5),
        x,SEA+.02+rnd()*.16,z,stone,T_SHELF*(rnd()<.4?.78:1),rnd()*Math.PI));
    }

    let a,b;
    try{
      [a,b]=await Promise.all([
        importCliffAsset(scene,'cliff_straight_a.glb','hd_cliff_variant_a_proto'),
        importCliffAsset(scene,'cliff_straight_b.glb','hd_cliff_variant_b_proto')
      ]);
      const accents=[];
      // Sparse accents only. Each one is sunk so its generated grass cap stays
      // buried under the plateau and only the irregular rock buttress projects.
      const sites=[
        ['x',-1,-2.9], ['x',-1, 1.7], ['x', 1,-0.6],
        ['z',-1, 2.2], ['z', 1,-1.4], ['x', 1, 3.6]
      ];
      sites.forEach((site,i)=>{
        const [axis,side,along]=site;
        const proto=i%2?a:b, c=proto.clone('hd_cliff_buttress_accent');
        c.setEnabled(true); c.isVisible=true; c.isPickable=false;
        const h=proto.metadata?.assetHeight??.75;
        const sxz=1.15+rnd()*.35, sy=2.2+rnd()*.5;
        c.scaling.set((i%3===0?-1:1)*sxz,sy,sxz);
        c.rotation.y=axis==='x' ? (side<0?0:Math.PI) : (side<0?-Math.PI/2:Math.PI/2);
        const outHalf=axis==='x'?WORLD.halfH:WORLD.halfW;
        // Project ~0.16 past the upper face, cap 0.5 below the plateau underside.
        const outward=outHalf+.16-sxz*.5;
        const capY=capBottom-.10-rnd()*.12;
        const x=axis==='x'?along:side*outward, z=axis==='x'?side*outward:along;
        c.position.set(x,capY-h*sy,z);
        c.receiveShadows=true; accents.push(c);
      });
      a.dispose(); b.dispose();
      API.state.generatedCliffSegments=accents.length;
    }catch(e){ console.warn('generated cliff accents unavailable',e); a?.dispose(); b?.dispose(); }

    const wall=merge(mass,'hd_cliff_wall',stone);
    const rocks=merge(shore,'hd_shore_rocks',stone);
    API.state.hdMaterials=Object.assign(API.state.hdMaterials||{},{cliff:stone});
    API.state.cliffFaceParts=mass.length+shore.length;
    API.state.cliffBottomY=L_BOT;
    return { wall, rocks };
  }

"""

p.write_text(src[:start] + NEW + src[end:])
print('replaced', end - start, 'chars with', len(NEW))
