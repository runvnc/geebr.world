"""Raise the stone hem so it covers the grass tile's own side wall.

A tight crop finally identified what dominates every edge view: it is not our
stone at all, it is the SIDE FACE of the grass tile. The grass_v7 slab is 0.87
units tall with only its top surface green, so the plateau presents a 0.87-unit
dark-green brick-patterned wall, and the stone started underneath it.

In the reference the green lip is thin - roughly a quarter of a tile - and
stone begins immediately below it. Rather than rescale the tile asset (which
would break the terrain grid, physics heights and every prop placement), the
top course is raised so it stands in front of that side wall, leaving only a
narrow green lip exactly as in the reference.

GRASS_LIP is the one number to tune here: how much green is visible on the
vertical face before stone takes over.
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


sub("  const SEA_LEVEL  = -1.90;",
    """  const SEA_LEVEL  = -1.90;
  // Visible green on the plateau's vertical face before the stone hem starts.
  // The grass slab is 0.87 tall and only its top is green, so without this the
  // edge is dominated by a 0.87-unit dark-green wall rather than by stone.
  const GRASS_LIP  = .26;""")

sub("""            c.cols.push({ along, top: CAP_BOTTOM+.08-rnd()*.13,
                          out: (corner?.04:.02)+rnd()*(corner?.12:.50),
                          r:rnd(), r2:rnd() });""",
    """            c.cols.push({ along, top: TOP_Y-GRASS_LIP-rnd()*.16,
                          out: (corner?.04:.02)+rnd()*(corner?.12:.50),
                          r:rnd(), r2:rnd() });""")

sub("            c.cols.push({ along, top: TOP_Y-drop-.87+.05-rnd()*.08, out: off+.26+rnd()*.12,\n"
    "                          r:rnd(), r2:rnd() });",
    "            c.cols.push({ along, top: TOP_Y-drop-GRASS_LIP-rnd()*.10, out: off+.26+rnd()*.12,\n"
    "                          r:rnd(), r2:rnd() });")

# Corner stacks follow the same line, otherwise the corners keep the old lip.
sub("      let top=CAP_BOTTOM+.12+rnd()*.10;", "      let top=TOP_Y-GRASS_LIP-rnd()*.10;")

# The core must reach the new top or a gap opens behind the raised course.
sub("    const TERRACE_TOP=CAP_BOTTOM+.10;", "    const TERRACE_TOP=CAP_BOTTOM+.30;")

assert src != orig
P.write_text(src)
print('ok', len(orig), '->', len(src))
