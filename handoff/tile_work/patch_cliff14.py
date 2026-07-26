"""Break the terrace into courses instead of pillars.

The side-by-side after the sea rise shows the height is finally right (~1.6
visible units) but the edge now reads as a row of tall vertical pillars with
deep canyons between them, where the reference is a rough GRID: cubes wider
than tall, horizontal seams as strong as vertical ones.

Cause: the per-column outward spread was 0.02 to 0.52 while the per-course
variation within a column was only +-0.05. So neighbouring columns differed
enormously and the courses inside a column stayed flush, which is exactly the
recipe for pillars. This inverts the two.
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


# columns close together...
sub("                          out: (corner?.04:.02)+rnd()*(corner?.12:.50),",
    "                          out: (corner?.04:.03)+rnd()*(corner?.10:.20),")
sub("            c.cols.push({ along, top: TOP_Y-GRASS_LIP-rnd()*.16,",
    "            c.cols.push({ along, top: TOP_Y-GRASS_LIP-rnd()*.09,")

# ...courses far apart.
sub("          const out=Math.max(.01, col.out-ci*.07+jut+(rnd()-.5)*.10);",
    "          const out=Math.max(.01, col.out-ci*.05+jut+(rnd()-.5)*.30);")
sub("          const jut=(ci>0 && ((ci*7+col.r2*11)%3)<1)?.10:0;",
    "          const jut=(ci>0 && ((ci*7+col.r2*11)%3)<1)?.20:0;")

# Cubes wider than tall, as in the reference.
sub("    const COURSE=.53;    // three courses fill the ~1.58 unit hem",
    "    const COURSE=.46;    // cubes read wider than tall, as in the reference")

assert src != orig
P.write_text(src)
print('ok')
""""""
