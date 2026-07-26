"""Last pass: more green over the edge, deeper shadow, wider face tone spread.

Measured on the matched crops:

                 ref     ours
  green fraction .409    .271
  overall lum    .192    .247
  10th pct lum   .049    .122     <- ours has no real darks anywhere
  90th pct lum   .351    .331

So the contrast RANGE is the remaining difference: the reference has genuine
black in its seams and under its overhangs while ours bottoms out at mid grey,
which is what still makes the terrace look like poured concrete. And the
reference is half again as green because grass and plants keep going over the
rim.
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


# ------------------------------------------------------------- real darks
# The emissive lift was flooring the whole surface: nothing could go dark, so
# every seam and recess sat at mid grey. Cut it right back and recover the mean
# from ambient instead, which still falls off in the crevices.
sub("    stone.emissiveColor=new BABYLON.Color3(.074,.078,.078);",
    "    stone.emissiveColor=new BABYLON.Color3(.026,.028,.030);")
sub("    stone.environmentIntensity=.78;", "    stone.environmentIntensity=1.05;")
# Stronger baked AO in the crevices of the albedo itself.
sub("      paint:cv=>HD.paintStoneChips(cv,71), normalStrength:1.9, rough:.90, roughVar:.10, ao:.46 });",
    "      paint:cv=>HD.paintStoneChips(cv,71), normalStrength:1.9, rough:.90, roughVar:.10, ao:.72 });")
# Widen the face tone spread so a cube's shaded side genuinely reads as shadow.
sub("    const top=g(1.24), bot=g(.62), lit=g(1.0), shade=g(.86);",
    "    const top=g(1.30), bot=g(.42), lit=g(1.0), shade=g(.72);")
sub("    const tone=()=>{ const r=rnd(); return r<.22?.72+rnd()*.08 : r<.74?.83+rnd()*.09 : .94+rnd()*.06; };",
    "    const tone=()=>{ const r=rnd(); return r<.26?.62+rnd()*.12 : r<.74?.80+rnd()*.11 : .96+rnd()*.08; };")

# ------------------------------------------------------------- more green
# More of the perimeter cascades, and it cascades further.
sub("        const step = corner ? 0 : (rnd()<.36 ? (rnd()<.17?2:1) : 0);",
    "        const step = corner ? 0 : (rnd()<.58 ? (rnd()<.34?2:1) : 0);")
sub("      if(!c.corner && c.rC<.80) spots.push([-.16-c.rB*.22,(API.state.terrainTopY??TOP_Y)+.018,2]);",
    "      if(!c.corner && c.rC<.95) spots.push([-.14-c.rB*.26,(API.state.terrainTopY??TOP_Y)+.018,3]);")

assert src != orig
P.write_text(src)
print('ok')
