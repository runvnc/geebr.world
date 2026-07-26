"""Kill the flat backdrop that was showing through the cube terrace.

A close crop showed the edge as a large smooth plane with a few small cubes in
front of it. That plane was `hd_cliff_core`, exposed two ways:

  * the top course started up to 0.46 below the grass underside, so a wide bare
    band of core ran right under the plateau. In the reference the top course
    touches the grass and ALL the variety comes from cubes stepping out, never
    from vertical gaps.
  * the core sat only ~0.46 behind the outer face, so wherever it did show it
    read as a near wall instead of a dark recess between blocks.
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


# ------------------------------------- top course hugs the grass underside
sub("""            c.cols.push({ along, top: CAP_BOTTOM+.10-rnd()*.46,
                          out: (corner?.04:.02)+rnd()*(corner?.12:.44),
                          r:rnd(), r2:rnd() });""",
    """            // Only a shallow vertical jitter: a deep one exposes the core
            // under the plateau. Depth variety comes from `out`.
            c.cols.push({ along, top: CAP_BOTTOM+.08-rnd()*.13,
                          out: (corner?.04:.02)+rnd()*(corner?.12:.50),
                          r:rnd(), r2:rnd() });""")

# Same for the cascade columns, which were pinned exactly under their grass
# step and so had no tolerance at all.
sub("            c.cols.push({ along, top: TOP_Y-drop-.87+.02, out: off+.28+rnd()*.10,\n"
    "                          r:rnd(), r2:rnd() });",
    "            c.cols.push({ along, top: TOP_Y-drop-.87+.05-rnd()*.08, out: off+.26+rnd()*.12,\n"
    "                          r:rnd(), r2:rnd() });")

# ------------------------------------------------- deeper, darker core
sub("""    // Solid core, pulled back to just behind the shallowest cube so the
    // terrace can never be seen through but the core itself stays in shadow.
    blocks.push(stoneBox(scene,'hd_cliff_core',(coreX+.04)*2,TERRACE_TOP-BOT,(coreZ+.04)*2,
      0,(TERRACE_TOP+BOT)*.5,0,stone,.70));""",
    """    // Solid core. Set well back from the shallowest cube: flush with them it
    // reads as a continuous wall behind the seams, whereas at this depth the
    // seams go dark and the cubes separate. Toned down for the same reason.
    const coreInX=Math.min(coreX,WORLD.halfW-.95), coreInZ=Math.min(coreZ,WORLD.halfH-.95);
    blocks.push(stoneBox(scene,'hd_cliff_core',coreInX*2,TERRACE_TOP-BOT,coreInZ*2,
      0,(TERRACE_TOP+BOT)*.5,0,stone,.46));""")

# Cubes must now reach back past the core wherever they are.
sub("          const d=out+.46+rnd()*.16;", "          const d=out+1.06+rnd()*.16;")

assert src != orig
P.write_text(src)
print('ok', len(orig), '->', len(src))
