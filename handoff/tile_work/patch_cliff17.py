"""Widen the value range instead of shifting it.

patch_cliff16 moved the WHOLE surface down rather than widening it:

              ref    before16   after16
  stone lum   .259   .263       .231     <- now too dark
  p10 lum     .049   .094       .082     <- barely moved
  p90 lum     .351   .318       .318     <- highlights never recovered

That pattern means the darks are being limited by something other than vertex
tone, and the shadow work was paid for out of the midtones. Two changes:

  * recover the mean and the highlights (brighter albedo, brighter top faces),
    so the range opens upward as well as downward;
  * make the SEAMS WIDER. They were only 0.04 to 0.08 units, which at the
    review distance is thinner than the SSAO sample radius can resolve, so
    raising SSAO strength from 2.2 to 3.1 bought almost nothing. Geometry that
    is too fine to occlude cannot be darkened by an occlusion pass.
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


# ------------------------------------------------- recover mean + highlights
sub("      gradeOpts:{ sat:.86, bright:1.00, contrast:1.20, tintR:.97, tintG:1.02, tintB:.99 },",
    "      gradeOpts:{ sat:.86, bright:1.16, contrast:1.26, tintR:.97, tintG:1.02, tintB:.99 },")
sub("    const top=g(1.30), bot=g(.22), lit=g(1.0), shade=g(.66);",
    "    const top=g(1.42), bot=g(.20), lit=g(1.04), shade=g(.60);")
# Cap was clipping the new brighter tops back to a flat plateau.
sub("    const g=v=>{ const t=Math.min(1.25,tone*v); return new BABYLON.Color4(t,t,t,1); };",
    "    const g=v=>{ const t=Math.min(1.55,tone*v); return new BABYLON.Color4(t,t,t,1); };")

# ------------------------------------------------------------ wider seams
sub("          // Cube is narrower than its 0.5 slot, leaving a seam for SSAO.\n"
    "          const w=(col.wide?.90:.42)+rnd()*.05;",
    "          // Seam must be wide enough for SSAO to resolve at review distance;\n"
    "          // at 0.04 it was finer than the sample radius and contributed nothing.\n"
    "          const w=(col.wide?.84:.37)+rnd()*.04;")

assert src != orig
P.write_text(src)
print('ok')
