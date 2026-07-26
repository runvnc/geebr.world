"""Delete the imported cliff accents.

They are a leftover from when the edge was a tall wall: six large rectangular
Tripo slabs standing at the waterline. Against the new half-tile cube grid they
are enormous, they are the wrong colour (their own restoned material, warm tan,
next to our blue-grey), and the reference edge contains nothing like them - it
is cubes and boulders all the way round.

This removes the last consumer of cliff_rock_a/b.glb from the runtime. The
assets and restone.py stay in the tree; they are still the reference-derived
source if a future outcrop wants them.
"""
import pathlib

P = pathlib.Path('/files/geebr.world/app/terrain-hd.js')
src = P.read_text()
orig = src

start = src.index('    let a,b;\n    try{')
end = src.index("    const wall=merge(blocks,'hd_cliff_wall',stone);")
src = src[:start] + """    // The imported cliff_rock_*.glb accents were removed here. They were sized
    // for the old tall wall and dwarfed the half-tile cubes; the reference edge
    // has no such feature. importCliffAsset()/restone.py remain available.
    API.state.generatedCliffSegments=0;

""" + src[end:]

assert src != orig
P.write_text(src)
print('ok', len(orig), '->', len(src))
