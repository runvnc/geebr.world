#!/usr/bin/env python3
"""Third cliff pass: terraced block stack, per the master reference.

WHY THE PREVIOUS TWO PASSES WERE WRONG (structural, not a tuning problem):
both built one continuous swept wall. Close reading of ref_cliff_perimeter.png
shows the reference edge is a TERRACE OF INDIVIDUAL CUBIC BLOCKS, roughly
tile-sized, axis aligned, three or four irregular courses down to the water,
with a dark mortar seam around every block and occasional grass-topped blocks
stepping down and outward from the plateau. No amount of tone tuning turns a
swept wall into that.

Structure here:
  * one column of 3-4 jittered cubes per perimeter cell, each with its own
    outward offset and tone, overlapping vertically so no seam can open
  * a solid inner core so nothing can be seen through the jitter
  * occasional grass-capped step blocks just below the plateau
  * shore rocks in the surf, GLB accents perched sparsely on the terrace
"""
import pathlib

p = pathlib.Path('/files/geebr.world/app/terrain-hd.js')
src = p.read_text()

start = src.index('  async function buildBedrock(scene){')
end = src.index('  /* ---------- 3. vegetation ---')
assert start < end

NEW = r"""  async function buildBedrock(scene){
    const { WORLD }=API;
    // Cut-stone blocks, not sediment banding. One texture repeat per ~0.8 units
    // so a single block face shows two or three stones plus mortar.
    const stone=await HD.surface(scene,{ name:'cliff_masonry', file:'stone_blocks.png',
      gradeOpts:{ sat:.36, bright:1.04, contrast:1.20, tintR:.96, tintG:1.00, tintB:1.05 },
      paint:cv=>HD.paintStoneDetail(cv,71), normalStrength:3.2, rough:.90, roughVar:.10, ao:.72 });
    stone.environmentIntensity=.62;
    // Grass caps on the step-down blocks reuse the island grass look rather than
    // introducing a second green.
    const capMat=API.state.hdMaterials?.grassGLB||null;

    const top=API.state.terrainTopY??.445;
    const capBottom=top-.87;      // measured grass slab underside
    const SEA=-3.05;
    const TERRACE_TOP=capBottom+.10;
    const BOT=SEA-.55;

    const blocks=[], shore=[], caps=[];
    let seed=0xbed40c;
    const rnd=()=>{ seed=(seed*1664525+1013904223)>>>0; return seed/4294967296; };

    // Blocks read light on top, mid on the lit faces, dark where they recess.
    const tone=()=>{ const r=rnd(); return r<.20?.52+rnd()*.10 : r<.72?.70+rnd()*.12 : .86+rnd()*.10; };

    const COURSES=[
      // top, height, base outward offset relative to the plateau edge
      { y0:TERRACE_TOP,      h:.78, off:-.10 },
      { y0:TERRACE_TOP-.70,  h:.86, off:-.30 },
      { y0:TERRACE_TOP-1.48, h:.94, off:-.16 },
      { y0:TERRACE_TOP-2.34, h:BOT===null?1:0, off:-.34 }   // h filled below
    ];
    COURSES[3].h=COURSES[3].y0-BOT;

    const addRun=(axis,side)=>{
      const half   = axis==='x' ? WORLD.halfW : WORLD.halfH;
      const outHalf= axis==='x' ? WORLD.halfH : WORLD.halfW;
      // place() hides the axis swap: everything below is (along, outward, ...).
      const place=(list,name,along,outward,w,h,d,cy,t,mat)=>{
        const x=axis==='x'?along:side*outward, z=axis==='x'?side*outward:along;
        const m=stoneBox(scene,name,axis==='x'?w:d,h,axis==='x'?d:w,x,cy,z,mat||stone,t);
        list.push(m);
        return m;
      };

      // One block column per unit cell along the side.
      const n=Math.round(half*2);
      for(let i=0;i<n;i++){
        const along=-half+.5+i;
        // Skip the last half cell at each end; corners are built separately.
        const nearCorner = i===0 || i===n-1;

        COURSES.forEach((c,ci)=>{
          // Split some courses into two narrower blocks so the seam pattern is
          // not one block per cell everywhere.
          const split = !nearCorner && ci>0 && rnd()<.34;
          const parts = split ? 2 : 1;
          for(let k=0;k<parts;k++){
            const w=(1.0/parts)*(.90+rnd()*.14);
            const d=.62+rnd()*.30;
            const jitter=(rnd()-.5)*.26;
            const outward=outHalf+c.off+jitter-d*.5;
            const a=along+(parts===2?(k?.26:-.26):0)+(rnd()-.5)*.06;
            // Overlap each course into the one above so no gap can open.
            const h=c.h+.10;
            place(blocks,'hd_cliff_block',a,outward,w,h,d,c.y0-h*.5+.10,tone());
          }
        });

        // Occasional grass-capped step block: the reference steps the plateau
        // down at the edge rather than dropping straight to bare stone.
        if(!nearCorner && rnd()<.20){
          const d=.72+rnd()*.16, w=.88+rnd()*.10;
          const outward=outHalf+.16-d*.5;
          const h=.42;
          const y=capBottom+.30;
          const b=place(caps,'hd_cliff_step_cap',along+(rnd()-.5)*.12,outward,w,h,d,y-h*.5,.88,capMat);
          if(!capMat) b.material=stone;
        }

        // Sparse boulder perched on the terrace shoulder.
        if(!nearCorner && rnd()<.18){
          const s=.30+rnd()*.22;
          const outward=outHalf+.24-s*.5;
          place(shore,'hd_shore_rock',along+(rnd()-.5)*.3,outward,s,s*(.7+rnd()*.5),s,
            TERRACE_TOP-1.40+rnd()*.5,tone(),null);
        }
      }
    };
    addRun('x',-1); addRun('x',1); addRun('z',-1); addRun('z',1);

    // Corner stacks: blocks turned 45 degrees so the two runs meet on a cut
    // corner instead of forming a square tower.
    for(const sx of [-1,1]) for(const sz of [-1,1]){
      COURSES.forEach((c,ci)=>{
        const s=1.15-ci*.06+rnd()*.14;
        const inset=.42+ci*.06+rnd()*.12;
        const h=c.h+.10;
        blocks.push(stoneBox(scene,'hd_cliff_corner_block',s,h,s,
          sx*(WORLD.halfW-inset),c.y0-h*.5+.10,sz*(WORLD.halfH-inset),stone,tone(),Math.PI/4));
      });
    }

    // Solid inner core. Reaches under the innermost possible block face so the
    // jittered terrace can never be seen through.
    blocks.push(stoneBox(scene,'hd_cliff_core',WORLD.w-.55,TERRACE_TOP-BOT,WORLD.h-.55,
      0,(TERRACE_TOP+BOT)*.5,0,stone,.58));

    // Shallow-water stones so the shoreline is not a clean rectangle meeting a
    // flat plane.
    for(let i=0;i<22;i++){
      const axis=i%2?'x':'z';
      const side=(i>>1)%2?1:-1;
      const half   = axis==='x' ? WORLD.halfW : WORLD.halfH;
      const outHalf= axis==='x' ? WORLD.halfH : WORLD.halfW;
      const along=(rnd()*2-1)*(half-.4);
      const outward=outHalf+.05+rnd()*.70;
      const s=.22+rnd()*.42;
      const x=axis==='x'?along:side*outward, z=axis==='x'?side*outward:along;
      shore.push(stoneBox(scene,'hd_shore_rock',s,s*(.7+rnd()*.7),s*(.7+rnd()*.5),
        x,SEA+.02+rnd()*.20,z,stone,tone(),rnd()*Math.PI));
    }

    let a,b;
    try{
      // The generated grass cap is trimmed away entirely; only the rock body of
      // the asset is wanted, otherwise it reads as a second grass ledge.
      [a,b]=await Promise.all([
        importCliffAsset(scene,'cliff_straight_a.glb','hd_cliff_variant_a_proto',.45),
        importCliffAsset(scene,'cliff_straight_b.glb','hd_cliff_variant_b_proto',.45)
      ]);
      const accents=[];
      // Six accents on a 52-cell perimeter: irregular silhouette breaks without
      // tiling an ornament per cell.
      const sites=[
        ['x',-1,-2.9], ['x',-1, 1.7], ['x', 1,-0.6],
        ['z',-1, 2.2], ['z', 1,-1.4], ['x', 1, 3.6]
      ];
      sites.forEach((site,i)=>{
        const [axis,side,along]=site;
        const proto=i%2?a:b, c=proto.clone('hd_cliff_buttress_accent');
        c.setEnabled(true); c.isVisible=true; c.isPickable=false;
        const h=proto.metadata?.trimmedHeight??.5;
        const sxz=1.0+rnd()*.28, sy=(1.25+rnd()*.45)/Math.max(.2,h);
        c.scaling.set((i%3===0?-1:1)*sxz,sy,sxz);
        c.rotation.y=axis==='x' ? (side<0?0:Math.PI) : (side<0?-Math.PI/2:Math.PI/2);
        const outHalf=axis==='x'?WORLD.halfH:WORLD.halfW;
        const outward=outHalf+.30-sxz*.5;
        const x=axis==='x'?along:side*outward, z=axis==='x'?side*outward:along;
        c.position.set(x,TERRACE_TOP-2.30,z);
        c.receiveShadows=true; accents.push(c);
      });
      a.dispose(); b.dispose();
      API.state.generatedCliffSegments=accents.length;
    }catch(e){ console.warn('generated cliff accents unavailable',e); a?.dispose(); b?.dispose(); }

    const wall=merge(blocks,'hd_cliff_wall',stone);
    const rocks=merge(shore,'hd_shore_rocks',stone);
    const stepCaps=caps.length?merge(caps,'hd_cliff_step_caps',caps[0].material):null;
    API.state.hdMaterials=Object.assign(API.state.hdMaterials||{},{cliff:stone});
    API.state.cliffFaceParts=blocks.length+shore.length+caps.length;
    API.state.cliffBottomY=BOT;
    return { wall, rocks, stepCaps };
  }

"""

p.write_text(src[:start] + NEW + src[end:])
print('replaced', end - start, '->', len(NEW))
