"""Value / hue / rhythm pass on the new island edge.

Measured against the reference crop rather than eyeballed:

  region              ref     after patch_cliff4    target
  stone mean lum      .259    .387                  ~.31
  stone saturation    .177    .056                  ~.13
  stone rgb           64/67/65 (warm-neutral)  91/95/92 (cold, washed)

So the previous pass OVERSHOT the value lift (the old wall was .15, the fix
went to .39) and over-desaturated. The reference stone is only slightly lighter
than its grass, not 30% lighter, and it carries a warm olive cast.
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


# ------------------------------------------------- stone value and hue
sub("      gradeOpts:{ sat:.34, bright:1.34, contrast:1.04, tintR:1.00, tintG:1.00, tintB:1.04 },\n"
    "      paint:cv=>HD.paintStoneDetail(cv,71), normalStrength:2.6, rough:.90, roughVar:.10, ao:.40 });\n"
    "    stone.environmentIntensity=.95;",
    "      gradeOpts:{ sat:.58, bright:1.10, contrast:1.06, tintR:1.05, tintG:1.01, tintB:.93 },\n"
    "      paint:cv=>HD.paintStoneDetail(cv,71), normalStrength:2.6, rough:.90, roughVar:.10, ao:.46 });\n"
    "    stone.environmentIntensity=.78;")

sub("    stone.emissiveColor=new BABYLON.Color3(.155,.160,.170);",
    "    stone.emissiveColor=new BABYLON.Color3(.088,.086,.080);")

# Fewer, larger stones per cube face. At 1.6 a 0.9-unit face showed most of a
# brick course and read as masonry wall; the reference cubes read as single
# quarried blocks with a seam or two.
sub("  const STONE_UV = 1.6;", "  const STONE_UV = 2.3;")

# ------------------------------------------------- ragged tread rhythm
# Neighbouring treads at nearly the same height and depth still line up into a
# ledge. Widen both so cube tops stagger.
sub("          c.ledges.push({ top: CAP_BOTTOM+.14+(rnd()-.5)*.24,\n"
    "                          out: (corner?.06:.10)+rnd()*(corner?.14:.38) });",
    "          c.ledges.push({ top: CAP_BOTTOM+.16+(rnd()-.5)*.52,\n"
    "                          out: (corner?.06:.06)+rnd()*(corner?.14:.52) });")

# ------------------------------------------------- sea glare
# Glancing views were bouncing the bright sky straight into the camera and the
# near water went pale grey.
sub("    m.environmentIntensity=.75;", "    m.environmentIntensity=.42;")

assert src != orig
P.write_text(src)
print('ok', len(orig), '->', len(src))
