"""Final proportion pass against the side-by-side.

With the hem raised to the grass lip the visible stone became 2.08 units, which
is four courses - back to a wall. The reference shows about three courses and
roughly 1.6 units, which was the number in the handoff all along. Raising the
sea is the cheap way to get it: nothing below the waterline is ever visible.

The side-by-side also shows the reference edge is much greener than ours -
vegetation spills over the rim in quantity - and that its cube widths vary
between a half tile and a full tile, where ours are all half.
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


# ---------------------------------------------------- three courses, not four
sub("  const SEA_LEVEL  = -1.90;", "  const SEA_LEVEL  = -1.42;")

# ------------------------------------------------------- varied cube widths
# All-half-tile cubes tile as visibly as all-full-tile ones did. Merging a
# column pair occasionally gives the reference's mix of sizes.
sub("""        c.cols=[];
        for(let k=0;k<2;k++){
          const along=c.along+(k?.25:-.25);""",
    """        c.cols=[];
        const wide=!corner && !step && rnd()<.26;   // one full-tile cube here
        for(let k=0;k<(wide?1:2);k++){
          const along=c.along+(wide?0:(k?.25:-.25));""")
sub("                          r:rnd(), r2:rnd() });\n          } else {",
    "                          r:rnd(), r2:rnd(), wide });\n          } else {")
sub("                          out: (corner?.04:.02)+rnd()*(corner?.12:.50),\n"
    "                          r:rnd(), r2:rnd() });",
    "                          out: (corner?.04:.02)+rnd()*(corner?.12:.50),\n"
    "                          r:rnd(), r2:rnd(), wide });")
sub("          const w=.42+rnd()*.05;",
    "          const w=(col.wide?.90:.42)+rnd()*.05;")

# --------------------------------------------------------- greener rim
sub("      if(!c.corner && c.rD<.42) spots.push([c.ledges[0].out-.26,c.ledges[0].top+.02,1]);",
    "      if(!c.corner && c.rD<.72) spots.push([c.ledges[0].out-.24,c.ledges[0].top+.02,2]);\n"
    "      // Right on the plateau lip, spilling outward over the drop.\n"
    "      if(!c.corner && c.rC<.80) spots.push([-.16-c.rB*.22,(API.state.terrainTopY??TOP_Y)+.018,2]);")
sub("        if(rnd()<.22){", "        if(rnd()<.34){")

assert src != orig
P.write_text(src)
print('ok', len(orig), '->', len(src))
