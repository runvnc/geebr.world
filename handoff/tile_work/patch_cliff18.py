"""Close out the value work. The p10 target was a measurement artifact.

Spatial breakdown of where the dark pixels actually are, as a fraction of each
sixth of the frame from top to bottom:

  band      1      2      3      4      5      6
  ref      .219   .035   .053   .104   .094   .099
  ours     .093   .129   .127   .117   .141   .000

The reference's dark pixels are concentrated in band 1, which in that crop is
the shadowed island interior and dark water BEHIND the edge - not the cliff at
all. Across the actual cliff (bands 2 to 5) OUR stone already carries MORE dark
pixels than the reference does. Our band 6 is open water, which has none.

So the p10 gap (.049 vs .090) was never a cliff defect, it was the two crops
framing different amounts of dark background. Chasing it further would only
crush the stone. The meaningful stone metrics are now:

            ref              ours
  lum       .259             .245
  rgb       64/67/65         58/66/57
  sat       .177             .141

This patch closes the small remaining mean and saturation deficit and stops.
"""
import pathlib

P = pathlib.Path('/files/geebr.world/app/terrain-hd.js')
src = P.read_text()
orig = src

old = "      gradeOpts:{ sat:.86, bright:1.16, contrast:1.26, tintR:.97, tintG:1.02, tintB:.99 },"
new = "      gradeOpts:{ sat:1.02, bright:1.24, contrast:1.26, tintR:1.00, tintG:1.00, tintB:1.01 },"
assert src.count(old) == 1
src = src.replace(old, new)

assert src != orig
P.write_text(src)
print('ok')
