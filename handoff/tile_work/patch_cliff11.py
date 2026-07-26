"""Harmonise the cliff stone with the grass tile's own sides.

Measured off the edge render:

  grass tile side band   58 / 66 / 56   (cool, slightly green)
  our cliff cubes        79 / 77 / 61   (warm tan)
  reference stone        64 / 67 / 65   (neutral, faintly cool)

So the hem was reading as a different rock from the one the grass tiles are
already sitting on, and warmer than the reference besides. The earlier warm
tint was a correction for the near-black wall we no longer have.
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


sub("      gradeOpts:{ sat:.62, bright:1.06, contrast:1.14, tintR:1.06, tintG:1.01, tintB:.92 },",
    "      gradeOpts:{ sat:.62, bright:1.00, contrast:1.14, tintR:.97, tintG:1.01, tintB:1.00 },")
sub("    stone.emissiveColor=new BABYLON.Color3(.088,.086,.080);",
    "    stone.emissiveColor=new BABYLON.Color3(.074,.078,.078);")

assert src != orig
P.write_text(src)
print('ok')
""""""
