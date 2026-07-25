"""mkdetail.py - generate a small tiling 'clay tooth' detail normal map.

The Tripo normal maps come back essentially blank (std ~2/255), so per-asset
microsurface has to come from a single shared detail map applied at high tiling
via PBRMaterial.detailMap. This produces the faint hand-pressed clay / felt
tooth visible up close in the reference art, without any per-asset authoring.

Babylon's detailMap expects RG = normal XY (B unused for the normal part,
A = roughness delta), so we emit an RGBA PNG:
    R,G  = tangent-space normal X,Y  (0.5 = flat)
    B    = 0.5 (neutral diffuse-blend, Babylon reads only RG + A by default)
    A    = roughness delta, 0.5 = no change

usage: mkdetail.py out.png [size] [strength]
"""
import sys

import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter

OUT = sys.argv[1]
SIZE = int(sys.argv[2]) if len(sys.argv) > 2 else 512
STRENGTH = float(sys.argv[3]) if len(sys.argv) > 3 else 1.0

rng = np.random.default_rng(11)


def tiling_noise(size, sigma, seed):
    """Seamless blurred noise via wrap-around gaussian."""
    r = np.random.default_rng(seed)
    n = r.random((size, size)).astype(np.float32)
    return gaussian_filter(n, sigma, mode='wrap')


def norm01(x):
    return (x - x.min()) / max(x.max() - x.min(), 1e-9)


# Layered height: broad clay pressing + fine felt tooth + a few tool nicks.
h = np.zeros((SIZE, SIZE), np.float32)
h += 1.00 * norm01(tiling_noise(SIZE, SIZE / 28.0, 1))    # broad dimpling
h += 0.55 * norm01(tiling_noise(SIZE, SIZE / 90.0, 2))    # medium tooth
h += 0.28 * norm01(tiling_noise(SIZE, SIZE / 260.0, 3))   # fine grain

# sparse pressed divots so it does not read as pure noise
div = np.zeros((SIZE, SIZE), np.float32)
for _ in range(26):
    cy, cx = rng.integers(0, SIZE, 2)
    rad = rng.integers(SIZE // 40, SIZE // 16)
    yy, xx = np.ogrid[:SIZE, :SIZE]
    dy = np.minimum(np.abs(yy - cy), SIZE - np.abs(yy - cy))
    dx = np.minimum(np.abs(xx - cx), SIZE - np.abs(xx - cx))
    d = np.sqrt(dy ** 2 + dx ** 2)
    div -= np.clip(1.0 - d / rad, 0, 1) ** 2
h += 0.30 * norm01(div)
h = norm01(h)

# Sobel -> tangent normal, wrapping so the tile is seamless
gy, gx = np.gradient(h)
gx = np.roll(h, -1, 1) - np.roll(h, 1, 1)
gy = np.roll(h, -1, 0) - np.roll(h, 1, 0)
scale = STRENGTH * SIZE / 12.0
nx = -gx * scale
ny = -gy * scale
nz = np.ones_like(nx)
l = np.sqrt(nx ** 2 + ny ** 2 + nz ** 2)
nx, ny, nz = nx / l, ny / l, nz / l

# roughness delta: raised areas slightly smoother, divots slightly rougher
rough_delta = 0.5 + (0.5 - h) * 0.16

rgba = np.stack([
    (nx * 0.5 + 0.5) * 255,
    (ny * 0.5 + 0.5) * 255,
    np.full_like(nx, 0.5) * 255,
    rough_delta * 255,
], 2)
img = Image.fromarray(np.clip(rgba, 0, 255).astype(np.uint8), 'RGBA')
img.save(OUT)
print('wrote %s %dx%d  normal std R %.1f G %.1f' % (
    OUT, SIZE, SIZE, rgba[:, :, 0].std(), rgba[:, :, 1].std()))
