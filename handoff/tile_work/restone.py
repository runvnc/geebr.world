#!/usr/bin/env python3
"""Recolour a Tripo cliff GLB from moss-green to desaturated blue-grey masonry.

WHY THIS EXISTS: measured on cliff_straight_a.glb, image 0 is 95% green across
the whole 4096x4096 albedo. Tripo textured the entire asset as moss, so there is
no rock-coloured region anywhere - no geometric trim can ever remove the green,
which is why every sink/trim attempt still produced a green blob on the wall.
The geometry is reference-derived and worth keeping, so the fix belongs in the
albedo.

The ORM and any normal map are left alone (orm.py already flattened roughness to
.88 and baked real AO; luminance structure is what carries the rock detail).

Usage: restone.py in.glb out.glb [target_hex] [keep_luma]
"""
import sys

import numpy as np
from PIL import Image

import glb

src, dst = sys.argv[1], sys.argv[2]
target = sys.argv[3] if len(sys.argv) > 3 else '6c7278'
keep = float(sys.argv[4]) if len(sys.argv) > 4 else 0.85

tr, tg, tb = (int(target[i:i + 2], 16) / 255 for i in (0, 2, 4))

g = glb.load(src)
mat = g.json['materials'][0]['pbrMetallicRoughness']
texi = mat['baseColorTexture']['index']
imgi = g.json['textures'][texi].get('source', texi)

im = g.image(imgi).convert('RGB')
a = np.asarray(im).astype(np.float32) / 255.0

# Luminance carries all the sculpted rock detail; hue carries nothing we want.
lum = a[:, :, 0] * .299 + a[:, :, 1] * .587 + a[:, :, 2] * .114
# Normalise so the recoloured stone lands at a predictable mid value instead of
# inheriting the moss texture's overall darkness.
lo, hi = np.percentile(lum, 3), np.percentile(lum, 97)
n = np.clip((lum - lo) / max(1e-5, hi - lo), 0, 1)
n = 0.30 + n * 0.62                       # target range, no crushed blacks

out = np.empty_like(a)
for i, t in enumerate((tr, tg, tb)):
    tinted = n * (t / max(tr, tg, tb))
    out[:, :, i] = tinted
# Retain a trace of the original chroma so it does not look like plastic grey.
out = out * keep + a * (1 - keep) * 0.55

new = Image.fromarray(np.clip(out * 255, 0, 255).astype(np.uint8))
g.set_image(imgi, new, 'JPEG', quality=90)
g.save(dst)

check = np.asarray(new).astype(float)
green = (check[:, :, 1] > check[:, :, 0] * 1.12) & (check[:, :, 1] > check[:, :, 2] * 1.15)
print(f'{dst}: green {green.mean()*100:.1f}%  mean rgb '
      f'{check[:,:,0].mean():.0f}/{check[:,:,1].mean():.0f}/{check[:,:,2].mean():.0f}')
