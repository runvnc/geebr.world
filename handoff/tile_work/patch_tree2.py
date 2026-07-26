"""Tree fix pass 2, applied against f4766d9.

Three faults, all visible in the user's screenshot, all in pine():

1. EVERY tree had a chopped flat top. For the apex tier rt=0, so t0 and t1
   COINCIDE, and the code emitted tri(t0,t1,m1) - a degenerate zero-area
   triangle. The whole upper 59% of every apex cone had no geometry at all.

2. The tiers read as one continuous smooth cone with faint banding rather than
   a stack of skirts. With the tuck alone, a tier's visible slope sweeps from
   .42 of the rim above all the way out to its own rim, which is very nearly
   collinear with the next slope down, so the SILHOUETTE never steps. The master
   steps because a tier's visible top is a SHOULDER at ~.86 of the rim above,
   sitting just below it. Fix: three rings per tier - tuck (hidden, closes the
   solid), shoulder (visible top), rim (own, widest, scalloped).

3. The apex cone is the one tier with nothing below it to hide its open bottom,
   so from a low camera you look up inside it and out through the culled far
   wall. Capped FLAT in the rim plane.

Note on 3: do NOT give every tier an underside fan. An underside reaches the
full rim radius at rim height, whereas the tier below only reaches .86 of it
there, so on an upper tier the disc protrudes through its own outer surface as
a horizontal flange - and if the fan reaches for the scallop corners (which sit
ABOVE the rim) it becomes a tilted flap poking out of the cone. Tried it; it
looked far worse than the original fault.
"""
import pathlib

P = pathlib.Path('/files/geebr.world/app/terrain-hd.js')
s = P.read_text()

# --------------------------------------------------------------- three rings
old = """    const TUCK_Y = .42, TUCK_R = .42;
    // The top TUCK_Y/(1+TUCK_Y) of each slope is buried inside the tier above,
    // so the shadow band must be positioned within the VISIBLE span rather than
    // the whole slope, or it swallows everything that shows. HIDDEN is that
    // buried fraction; SHADE_VIS is how much of what remains is dark.
    const HIDDEN = TUCK_Y/(1+TUCK_Y);
    const SHADE_VIS = .40;
    const UPPER = HIDDEN+(1-HIDDEN)*SHADE_VIS;"""
new = """    // ...but the tuck ALONE made the tree read as ONE continuous smooth cone
    // with faint banding instead of a stack of skirts, because a slope sweeping
    // from .42 of the rim above all the way out to its own rim is very nearly
    // collinear with the next one down, so the SILHOUETTE never steps.
    // The master steps at every rim because a tier's visible top is a SHOULDER
    // at about .86 of the rim above it, sitting just BELOW that rim. So each
    // tier needs THREE rings, not two:
    //   tuck     - hidden inside the tier above; closes the solid
    //   shoulder - the visible top; .86 of the rim above, just under it
    //   rim      - its own, widest, scalloped
    // The shadow band is then exactly the shoulder-to-rim strip, which is also
    // the honest answer: that IS the strip the rim above overhangs.
    const TUCK_Y = .42, TUCK_R = .42;
    const SHOULDER_R = .86, SHOULDER_Y = .13;
    const SHADE_VIS = .46;"""
assert s.count(old) == 1
s = s.replace(old, new)

old = """        const yt=apex ? yb+1.55*PITCH : rimY(k-1)+TUCK_Y*PITCH;
        const rt=apex ? 0 : rimR(k-1)*TUCK_R;"""
new = """        const yt=apex ? yb+1.55*PITCH : rimY(k-1)+TUCK_Y*PITCH;
        const rt=apex ? 0 : rimR(k-1)*TUCK_R;
        const ys=apex ? yt : rimY(k-1)-SHOULDER_Y*PITCH;
        const rs=apex ? 0 : rimR(k-1)*SHOULDER_R;"""
assert s.count(old) == 1
s = s.replace(old, new)

old = """          const t0=[Math.cos(a0)*rt*w0, yt, Math.sin(a0)*rt*w0];
          const t1=[Math.cos(a1)*rt*w1, yt, Math.sin(a1)*rt*w1];
          const b0=[Math.cos(a0)*rb*w0, yb, Math.sin(a0)*rb*w0];
          const b1=[Math.cos(a1)*rb*w1, yb, Math.sin(a1)*rb*w1];"""
new = """          const t0=[Math.cos(a0)*rt*w0, yt, Math.sin(a0)*rt*w0];
          const t1=[Math.cos(a1)*rt*w1, yt, Math.sin(a1)*rt*w1];
          const s0=[Math.cos(a0)*rs*w0, ys, Math.sin(a0)*rs*w0];
          const s1=[Math.cos(a1)*rs*w1, ys, Math.sin(a1)*rs*w1];
          const b0=[Math.cos(a0)*rb*w0, yb, Math.sin(a0)*rb*w0];
          const b1=[Math.cos(a1)*rb*w1, yb, Math.sin(a1)*rb*w1];"""
assert s.count(old) == 1
s = s.replace(old, new)

# ------------------------------------------------- the face rows, and the apex
old = """          const m0=lerp(t0,b0,UPPER), m1=lerp(t1,b1,UPPER);
          if(rt>0){ tri(t0,t1,m1,dark); tri(t0,m1,m0,dark); }
          else { tri(t0,t1,m1,dark); }   // apex: t0 and t1 coincide"""
new = """          const bm=lerp(b0,b1,.5);
          const tuckC=.17+noise(seed,k*23+i)*.13;
          if(apex){
            // t0 and t1 COINCIDE at the point, so the old tri(t0,t1,m1) was a
            // degenerate zero-area triangle and the top 59% of every apex tier
            // had NO GEOMETRY - which is why all the trees rendered with a
            // chopped flat top. A fan from the point over the two scallop
            // segments covers it; anything cleverer notches the apex.
            const a0c=lerp(b0,t0,tuckC), a1c=lerp(b1,t1,tuckC);
            tri(t0,a1c,bm,lit); tri(t0,bm,a0c,lit);
            // The apex is the one tier with nothing below it to hide its open
            // bottom, so from a low camera you look up inside the cone and out
            // through the culled far wall. Cap it FLAT, in the rim plane: a cap
            // that reaches for the scallop corners instead would stick out of
            // the cone, because those corners sit ABOVE the rim.
            const ac=[0,yb,0], au=leafTone(.16*vary);
            tri(ac,[b0[0],yb,b0[2]],bm,au); tri(ac,bm,[b1[0],yb,b1[2]],au);
            continue;
          }
          // Hidden strip, tuck ring down to the shoulder. Never seen, but it has
          // to exist or the tier is an open annulus (defect 9.4b).
          tri(t0,t1,s1,dark); tri(t0,s1,s0,dark);
          // The shadow band IS the shoulder-to-rim strip.
          const m0=lerp(s0,b0,SHADE_VIS), m1=lerp(s1,b1,SHADE_VIS);
          tri(s0,s1,m1,dark); tri(s0,m1,m0,dark);"""
assert s.count(old) == 1
s = s.replace(old, new)

# tuckC and bm are now hoisted above, so drop the originals
old = """          // Gentle. At .62-.82 the corners came almost up to the mid ring, so
          // each facet detached into a hanging flap with a dagger at its middle.
          const tuckC=.17+noise(seed,k*23+i)*.13;
          const c0=lerp(b0,m0,tuckC), c1=lerp(b1,m1,tuckC);
          const bm=lerp(b0,b1,.5);
          tri(m0,m1,c1,lit); tri(m0,c1,bm,lit); tri(m0,bm,c0,lit);"""
new = """          // Gentle. At .62-.82 the corners came almost up to the mid ring, so
          // each facet detached into a hanging flap with a dagger at its middle.
          const c0=lerp(b0,m0,tuckC), c1=lerp(b1,m1,tuckC);
          tri(m0,m1,c1,lit); tri(m0,c1,bm,lit); tri(m0,bm,c0,lit);"""
assert s.count(old) == 1
s = s.replace(old, new)

old = """          // Underside of the lowest skirt only: closes the solid and is what
          // the shadow map casts from.
          if(k===TIERS-1){"""
new = """          // Underside of the LOWEST skirt only. Do not add these to every tier:
          // an underside reaches the full rim radius at rim height whereas the
          // tier below only reaches .86 of it there, so on an upper tier the
          // disc protrudes through its own outer surface as a horizontal flange.
          if(k===TIERS-1){"""
assert s.count(old) == 1
s = s.replace(old, new)

P.write_text(s)
print('patch_tree2 applied')
