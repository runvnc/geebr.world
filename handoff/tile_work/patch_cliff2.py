#!/usr/bin/env python3
"""Second cliff pass: continuous ring + additive projections.

The first pass varied the step-back per segment, which opened dark voids where a
deep segment exposed the side of its neighbour and the inner fill did not reach.
Architecture now guarantees no holes:

  base ring  - segments at ONE constant inset and depth, so every join is
               coplanar and backed by the core. Variety comes from vertex tone
               only, never geometry.
  additive   - buttresses, pilasters, shelves and shore rocks project OUTWARD
               from that ring. Adding can never create a void.

Value structure retargeted at the reference: the cliff is a dark mass with a
lighter cut-stone rim under the plateau, not a bright white band.
"""
import pathlib

p = pathlib.Path('/files/geebr.world/app/terrain-hd.js')
src = p.read_text()

start = src.index('  async function buildBedrock(scene){')
end = src.index('  /* ---------- 3. vegetation ---')
assert start < end

NEW = r"""  async function buildBedrock(scene){
    const { WORLD }=API;
    // Blocky masonry, not horizontal sediment banding: the reference cliff is
    // stacked cut stone. Brightness lives in the texture, value separation
    // between courses lives in vertex tone.
    const stone=await HD.surface(scene,{ name:'cliff_masonry', file:'stone_blocks.png',
      gradeOpts:{ sat:.34, bright:1.02, contrast:1.18, tintR:.97, tintG:1.00, tintB:1.03 },
      paint:cv=>HD.paintStoneDetail(cv,71), normalStrength:3.2, rough:.90, roughVar:.10, ao:.72 });
    stone.environmentIntensity=.62;

    const top=API.state.terrainTopY??.445;
    const capBottom=top-.87;      // measured grass slab underside
    const SEA=-3.05;
    const RIM_TOP=capBottom+.08;  // tuck under the plateau lip
    const RIM_BOT=RIM_TOP-.52;    // thin cut-stone rim course
    const BOT=SEA-.62;            // finish below the waterline
    const RING_INSET=.30;         // constant: this is what keeps the ring solid
    const RING_DEPTH=.90;

    const mass=[], shore=[];
    let seed=0xbed40c;
    const rnd=()=>{ seed=(seed*1664525+1013904223)>>>0; return seed/4294967296; };

    // Dark mass, lighter rim. Reference cliffs are near-black teal stone with
    // only the top course and the projecting faces catching light.
    const T_RIM=.78, T_RING=.42, T_RING_DK=.30, T_BUTTRESS=.58, T_SHELF=.52;

    const addRun=(axis,side)=>{
      const half   = axis==='x' ? WORLD.halfW : WORLD.halfH;
      const outHalf= axis==='x' ? WORLD.halfH : WORLD.halfW;
      const cornerCut=.68;
      // place() takes distance-along and distance-inward and handles the axis
      // swap once, so every piece below reads as (along, inset, w, h, d).
      const place=(along,inset,w,h,d,cy,tone,name)=>{
        const outward=outHalf-inset-d*.5;
        const x=axis==='x'?along:side*outward, z=axis==='x'?side*outward:along;
        const m=stoneBox(scene,name,axis==='x'?w:d,h,axis==='x'?d:w,x,cy,z,stone,tone);
        mass.push(m);
        return m;
      };

      // 1. continuous rim course, one piece per side
      const rimLen=half*2-cornerCut*1.2;
      place(0,.04,rimLen,RIM_TOP-RIM_BOT,.62,(RIM_TOP+RIM_BOT)*.5,T_RIM,'hd_cliff_rim');

      // 2. base ring: constant inset/depth, tone varies only
      let at=-half+cornerCut;
      const cells=[];
      while(at<half-cornerCut-.02){
        const span=Math.min(half-cornerCut-at,.95+rnd()*1.35);
        const along=at+span*.5;
        const dark=rnd()<.34;
        place(along,RING_INSET,span+.04,RIM_BOT-BOT,RING_DEPTH,(RIM_BOT+BOT)*.5,
          dark?T_RING_DK:T_RING,'hd_cliff_ring');
        cells.push({along,span,dark});
        at+=span;
      }

      // 3. additive projections. Roughly a third of cells get a buttress, so
      //    long uninterrupted stretches remain between accents.
      cells.forEach((c,i)=>{
        if(c.dark) return;                       // recessed reading stays plain
        const r=rnd();
        if(r<.34 && c.span>1.05){
          // broad stepped buttress rising most of the face
          const bw=c.span*(.42+rnd()*.30), bh=(RIM_BOT-BOT)*(.55+rnd()*.32);
          const bd=RING_DEPTH+.22+rnd()*.14;
          place(c.along+(rnd()-.5)*c.span*.22,RING_INSET-(bd-RING_DEPTH),bw,bh,bd,
            BOT+bh*.5,T_BUTTRESS,'hd_cliff_buttress');
          // a narrower second step on top of it reads as a stone stack
          if(rnd()<.55){
            const sw=bw*(.50+rnd()*.24), sh=bh*(.34+rnd()*.24);
            place(c.along+(rnd()-.5)*c.span*.16,RING_INSET-(bd-RING_DEPTH)+.10,sw,sh,bd-.10,
              BOT+bh+sh*.5-.04,T_BUTTRESS*1.12,'hd_cliff_buttress_step');
          }
        } else if(r<.52){
          // narrow pilaster rib running the full face into the rim
          const pw=.30+rnd()*.20, pd=RING_DEPTH+.16;
          place(c.along+(rnd()-.5)*c.span*.30,RING_INSET-(pd-RING_DEPTH),pw,RIM_BOT-BOT-.10,pd,
            (RIM_BOT+BOT)*.5-.05,T_BUTTRESS*.92,'hd_cliff_pilaster');
        }
        // waterline shelf, independent of the buttress roll
        if(rnd()<.34){
          const sw=c.span*(.34+rnd()*.32), sd=RING_DEPTH+.34+rnd()*.26;
          place(c.along+(rnd()-.5)*c.span*.28,RING_INSET-(sd-RING_DEPTH),sw,.44+rnd()*.20,sd,
            SEA+.14-rnd()*.18,T_SHELF,'hd_waterline_shelf');
        }
      });
    };
    addRun('x',-1); addRun('x',1); addRun('z',-1); addRun('z',1);

    // Corners get their own masses rotated 45 degrees so the two runs never
    // collide into a square pillar.
    for(const sx of [-1,1]) for(const sz of [-1,1]){
      mass.push(stoneBox(scene,'hd_cliff_corner_rim',.92,RIM_TOP-RIM_BOT,.92,
        sx*(WORLD.halfW-.42),(RIM_TOP+RIM_BOT)*.5,sz*(WORLD.halfH-.42),stone,T_RIM,Math.PI/4));
      mass.push(stoneBox(scene,'hd_cliff_corner',1.25,RIM_BOT-BOT,1.25,
        sx*(WORLD.halfW-.72),(RIM_BOT+BOT)*.5,sz*(WORLD.halfH-.72),stone,T_RING,Math.PI/4));
      if(rnd()<.75){
        const h=(RIM_BOT-BOT)*(.42+rnd()*.28);
        mass.push(stoneBox(scene,'hd_cliff_corner_foot',1.05,h,1.05,
          sx*(WORLD.halfW-.50),BOT+h*.5,sz*(WORLD.halfH-.50),stone,T_BUTTRESS,Math.PI/4));
      }
    }

    // Solid fill behind the ring. Sized to reach the ring's inner face so no
    // sliver of daylight can appear between them.
    mass.push(stoneBox(scene,'hd_cliff_core',WORLD.w-.20,RIM_TOP-BOT,WORLD.h-.20,
      0,(RIM_TOP+BOT)*.5,0,stone,T_RING*.92));

    // Shallow-water rocks: irregular stones in the surf so the shoreline is not
    // a clean rectangle meeting a flat plane.
    for(let i=0;i<20;i++){
      const axis=i%2?'x':'z';
      const side=(i>>1)%2?1:-1;
      const half   = axis==='x' ? WORLD.halfW : WORLD.halfH;
      const outHalf= axis==='x' ? WORLD.halfH : WORLD.halfW;
      const along=(rnd()*2-1)*(half-.4);
      const outward=outHalf+.02+rnd()*.62;
      const s=.24+rnd()*.44;
      const x=axis==='x'?along:side*outward, z=axis==='x'?side*outward:along;
      shore.push(stoneBox(scene,'hd_shore_rock',s,s*(.7+rnd()*.7),s*(.7+rnd()*.5),
        x,SEA+.02+rnd()*.18,z,stone,T_SHELF*(rnd()<.4?.74:1.06),rnd()*Math.PI));
    }

    let a,b;
    try{
      // 45% trimmed off the top: the generated grass cap must not survive at
      // all, or the accents read as a second grass ledge outside the plateau.
      [a,b]=await Promise.all([
        importCliffAsset(scene,'cliff_straight_a.glb','hd_cliff_variant_a_proto',.45),
        importCliffAsset(scene,'cliff_straight_b.glb','hd_cliff_variant_b_proto',.45)
      ]);
      const accents=[];
      // Sparse accents only, sitting on the ring face below the rim course so
      // their irregular silhouette breaks the wall without tiling it.
      const sites=[
        ['x',-1,-2.9], ['x',-1, 1.7], ['x', 1,-0.6],
        ['z',-1, 2.2], ['z', 1,-1.4], ['x', 1, 3.6]
      ];
      sites.forEach((site,i)=>{
        const [axis,side,along]=site;
        const proto=i%2?a:b, c=proto.clone('hd_cliff_buttress_accent');
        c.setEnabled(true); c.isVisible=true; c.isPickable=false;
        const h=proto.metadata?.trimmedHeight??.5;
        const sxz=1.05+rnd()*.30, sy=(1.5+rnd()*.55)/Math.max(.2,h);
        c.scaling.set((i%3===0?-1:1)*sxz,sy,sxz);
        c.rotation.y=axis==='x' ? (side<0?0:Math.PI) : (side<0?-Math.PI/2:Math.PI/2);
        const outHalf=axis==='x'?WORLD.halfH:WORLD.halfW;
        const outward=outHalf-.10-sxz*.5;
        const x=axis==='x'?along:side*outward, z=axis==='x'?side*outward:along;
        c.position.set(x,BOT+.20,z);
        c.receiveShadows=true; accents.push(c);
      });
      a.dispose(); b.dispose();
      API.state.generatedCliffSegments=accents.length;
    }catch(e){ console.warn('generated cliff accents unavailable',e); a?.dispose(); b?.dispose(); }

    const wall=merge(mass,'hd_cliff_wall',stone);
    const rocks=merge(shore,'hd_shore_rocks',stone);
    API.state.hdMaterials=Object.assign(API.state.hdMaterials||{},{cliff:stone});
    API.state.cliffFaceParts=mass.length+shore.length;
    API.state.cliffBottomY=BOT;
    return { wall, rocks };
  }

"""

p.write_text(src[:start] + NEW + src[end:])
print('replaced', end - start, '->', len(NEW))
