"""Trim the edge daisies.

Raising the rim vegetation to 3 clusters per spot with a .34 daisy chance turned
the whole perimeter yellow-speckled. The reference has a handful of WHITE daisies
well inside the plateau and none on the edge cubes; the flowers there are green
blade clusters. Keep the blades, cut the flowers back to occasional.

(Verified while here: hd_cliff_stack and hd_cliff_corner_block merge into
hd_cliff_wall, which now reaches y 1.785 against a plateau top of 0.445 - so the
raised cluster from patch_cliff16 is present and is breaking the flat lid.)
"""
import pathlib

P = pathlib.Path('/files/geebr.world/app/terrain-hd.js')
src = P.read_text()
orig = src

old = "        if(rnd()<.34){"
new = "        if(rnd()<.09){"
assert src.count(old) == 1
src = src.replace(old, new)

assert src != orig
P.write_text(src)
print('ok')
