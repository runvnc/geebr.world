"""Finish the edge: darks, saturation, corner stacks, raised cluster.

Items 1 to 4 of CLIFF_EDGE_HANDOFF section 4, batched.

1. DARKS. Measured p10 luminance is .094 against the reference's .049, so no
   part of our frame is genuinely dark and the stone reads as poured concrete.
   Attacked from three sides: a depth-graded vertex tone (blocks get darker the
   further down the hem they sit, which is where the reference is nearly black),
   a much darker bottom face, and stronger SSAO now that the terrace has real
   seams for it to work in.
2. SATURATION .116 -> ~.16.
3. CORNER STACKS rebuilt from the same per-column machinery as the runs. They
   were two big 45-degree cubes left over from the tall-wall era and looked
   coarse beside the half-tile grid.
4. RAISED CLUSTER. The reference stacks cubes ABOVE the plateau in one place,
   which is what breaks its flat-lid silhouette. We had nothing doing that.
"""
import pathlib

P = pathlib.Path('/files/geebr.world/app/terrain-hd.js')
A = pathlib.Path('/files/geebr.world/app/app.js')
src = P.read_text()
app = A.read_text()
orig, oapp = src, app


def sub(old, new, n=1):
    global src
    c = src.count(old)
    assert c == n, f'expected {n}, found {c} of: {old[:90]!r}'
    src = src.replace(old, new)


# ============================================================ 1 + 2. value
sub("      gradeOpts:{ sat:.62, bright:1.00, contrast:1.14, tintR:.97, tintG:1.01, tintB:1.00 },",
    "      gradeOpts:{ sat:.86, bright:1.00, contrast:1.20, tintR:.97, tintG:1.02, tintB:.99 },")

# Bottom faces go properly dark; they are the underside of every overhang.
sub("    const top=g(1.30), bot=g(.42), lit=g(1.0), shade=g(.72);",
    "    const top=g(1.30), bot=g(.22), lit=g(1.0), shade=g(.66);")

# Depth-graded tone. A flat random tone per block spreads the darks evenly
# over the whole hem; the reference CONCENTRATES them at the bottom and in the
# recesses, which is what gives it a p10 of .049.
sub("    const tone=()=>{ const r=rnd(); return r<.26?.62+rnd()*.12 : r<.74?.80+rnd()*.11 : .96+rnd()*.08; };",
    """    const tone=()=>{ const r=rnd(); return r<.26?.62+rnd()*.12 : r<.74?.80+rnd()*.11 : .96+rnd()*.08; };
    // Depth grading. A uniformly random tone spreads the darks evenly over the
    // whole hem, but the reference concentrates them low down and in recesses,
    // which is where its near-black comes from. y is the block top.
    const depthTone=(y,recess=0)=>{
      const f=Math.min(1,Math.max(0,(TOP_Y-GRASS_LIP-y)/1.5));
      return tone()*(1-f*.46)*(1-recess*.22);
    };""")

sub("          put(blocks,'hd_cliff_block',c,col.along+(rnd()-.5)*.03,\n"
    "            outHalf+out,w,h,d,top,tone());",
    "          // Recessed courses take an extra tone cut: a block set back behind\n"
    "          // its neighbours is in their shadow and the render should say so.\n"
    "          const recess=Math.max(0,Math.min(1,(col.out-out)*2.2));\n"
    "          put(blocks,'hd_cliff_block',c,col.along+(rnd()-.5)*.03,\n"
    "            outHalf+out,w,h,d,top,depthTone(top,recess));")

sub("      0,(TERRACE_TOP+BOT)*.5,0,stone,.46));", "      0,(TERRACE_TOP+BOT)*.5,0,stone,.30));")

# ==================================================== 3. corner stacks
sub("""    for(const sx of [-1,1]) for(const sz of [-1,1]){
      let top=TOP_Y-GRASS_LIP-rnd()*.10;
      for(let ci=0;ci<2;ci++){
        const s=1.12-ci*.10+rnd()*.14;
        const inset=.46+ci*.16+rnd()*.10;
        const h=ci?top-BOT:.80+rnd()*.16;
        blocks.push(stoneBox(scene,'hd_cliff_corner_block',s,h,s,
          sx*(WORLD.halfW-inset),top-h*.5,sz*(WORLD.halfH-inset),stone,tone(),Math.PI/4));
        top=top-h+.12;
      }
    }""",
    """    // Corner stacks. Built from the same half-tile cube grammar as the runs -
    // two cubes per corner across the diagonal, coursed at COURSE - because the
    // previous version was two big 45-degree blocks from the tall-wall era and
    // read as a bastion pasted onto a fine grid.
    for(const sx of [-1,1]) for(const sz of [-1,1]){
      for(let q=0;q<3;q++){
        // q walks the corner: 0 along x, 2 along z, 1 the diagonal cap.
        const diag=q===1;
        const baseOut=.06+rnd()*.16;
        let top=TOP_Y-GRASS_LIP-rnd()*.10, ci=0;
        while(top>BOT+.10){
          const last=(top-COURSE)<=BOT+.10;
          const h=last?top-BOT:COURSE*(.92+rnd()*.16);
          const out=Math.max(.01,baseOut-ci*.05+(rnd()-.5)*.22);
          const s=(diag?.62:.48)+rnd()*.06;
          const d=out+.92+rnd()*.16;
          const ox=diag?out*.72:out, oz=diag?out*.72:out;
          const x=sx*(WORLD.halfW+(q===0?ox:(diag?ox:-.24-rnd()*.10)));
          const z=sz*(WORLD.halfH+(q===2?oz:(diag?oz:-.24-rnd()*.10)));
          const m=stoneBox(scene,'hd_cliff_corner_block',
            q===2?d:s,h,q===2?s:(diag?s:d),
            x,top-h*.5,z,stone,depthTone(top),diag?Math.PI/4:0);
          blocks.push(m);
          top-=h; ci++;
        }
      }
    }

    // A cluster of cubes stacking ABOVE the plateau. The reference does this in
    // one or two places and it is what stops the island reading as a flat lid.
    for(const site of [[-1,'x',-1.6],[1,'z',2.4]]){
      const [side,axis,along]=site;
      const outHalf=axis==='x'?WORLD.halfH:WORLD.halfW;
      let y=TOP_Y, n=3+Math.floor(rnd()*2);
      for(let i=0;i<n;i++){
        const s=.46-i*.04+rnd()*.06;
        const h=COURSE*(.86+rnd()*.20);
        const off=-.30+i*.10+(rnd()-.5)*.22;
        const a=along+(rnd()-.5)*.5*i;
        const outward=outHalf+off;
        const x=axis==='x'?a:side*outward, z=axis==='x'?side*outward:a;
        blocks.push(stoneBox(scene,'hd_cliff_stack',s,h,s,x,y+h*.5,z,
          stone,tone()*(1.02-i*.03),rnd()*.5));
        y+=h;
      }
    }""")

assert src != orig
P.write_text(src)

# ================================================================ SSAO
assert app.count("{radius:.9,strength:2.2,samples:16,maxZ:60}") == 1
app = app.replace("{radius:.9,strength:2.2,samples:16,maxZ:60}",
                  "{radius:.62,strength:3.1,samples:20,maxZ:60}")
assert app != oapp
A.write_text(app)
print('ok', len(orig), '->', len(src))
