"""orm.py - fix the ORM (occlusion/roughness/metallic) channels of a Tripo GLB.

Tripo emits an ORM texture where:
  R (AO)        = flat white (254.8 mean, std 0.6)  -> NO occlusion baked at all
  G (roughness) = patchy, mean 0.49                  -> semi-gloss, wrong for matte clay
  B (metallic)  = mostly 0 but spikes to 128         -> stray half-metallic pixels
and the glTF material does not even declare an `occlusionTexture`, so the R
channel is never read by the renderer.

This script:
  1. ray-traces per-vertex ambient occlusion and rasterises it into UV space
  2. adds a cavity term derived from albedo luminance (catches painted seams
     that are not geometric)
  3. writes the combined AO into R and declares `occlusionTexture`
  4. flattens roughness to a matte target with a small controlled variation
  5. zeroes metallic and pins metallicFactor to 0

usage:
  orm.py in.glb out.glb [--rough 0.88] [--roughvar 0.06] [--ao 0.85]
         [--cavity 0.5] [--rays 64] [--res 1024]

  --rough     target roughness (1.0 = fully matte)
  --roughvar  how much of the original roughness variation to retain
  --ao        strength of the geometric AO term (0 = none, 1 = full)
  --cavity    strength of the albedo-luminance cavity term
"""
import argparse
import sys
import time

import numpy as np
import trimesh
from PIL import Image, ImageDraw, ImageFilter
from scipy.ndimage import gaussian_filter

sys.path.insert(0, __file__.rsplit('/', 1)[0])
import glb  # noqa: E402


def hemisphere_dirs(n, rng):
    """Cosine-weighted directions in the +Z hemisphere."""
    u1 = rng.random(n)
    u2 = rng.random(n)
    r = np.sqrt(u1)
    th = 2 * np.pi * u2
    return np.stack([r * np.cos(th), r * np.sin(th), np.sqrt(np.maximum(0, 1 - u1))], 1)


def basis_from_normal(n):
    """Build an orthonormal basis per normal (N x 3 -> N x 3 x 3)."""
    up = np.tile(np.array([0.0, 0.0, 1.0]), (len(n), 1))
    degen = np.abs(n[:, 2]) > 0.9
    up[degen] = np.array([1.0, 0.0, 0.0])
    t = np.cross(up, n)
    t /= np.maximum(np.linalg.norm(t, axis=1, keepdims=True), 1e-9)
    b = np.cross(n, t)
    return np.stack([t, b, n], 1)  # rows are the basis vectors


def vertex_ao(mesh, rays=64, seed=7, max_dist=None):
    """Per-vertex ambient occlusion in [0,1], 1 = fully open."""
    rng = np.random.default_rng(seed)
    v = np.asarray(mesh.vertices)
    n = np.asarray(mesh.vertex_normals)
    if max_dist is None:
        max_dist = float(np.max(mesh.extents)) * 0.75
    eps = float(np.max(mesh.extents)) * 1e-4
    tbn = basis_from_normal(n)
    open_frac = np.zeros(len(v))
    # chunk so peak memory stays sane
    chunk = 400
    for s in range(0, len(v), chunk):
        e = min(s + chunk, len(v))
        m = e - s
        d_local = hemisphere_dirs(m * rays, rng).reshape(m, rays, 3)
        # local -> world using the per-vertex basis
        d = np.einsum('vrk,vkj->vrj', d_local, tbn[s:e])
        orig = np.repeat(v[s:e] + n[s:e] * eps, rays, axis=0)
        d = d.reshape(-1, 3)
        loc, ray_idx, _ = mesh.ray.intersects_location(orig, d, multiple_hits=False)
        blocked = np.zeros(len(orig), dtype=bool)
        if len(ray_idx):
            dist = np.linalg.norm(loc - orig[ray_idx], axis=1)
            blocked[ray_idx[dist < max_dist]] = True
        open_frac[s:e] = 1.0 - blocked.reshape(m, rays).mean(1)
    return open_frac


def rasterize_uv(uv, faces, vals, res):
    """Flat-fill each triangle in UV space with the mean of its vertex values."""
    img = Image.new('F', (res, res), 1.0)
    dr = ImageDraw.Draw(img)
    # glTF UV origin is top-left, matching PIL, so V is NOT flipped
    px = np.stack([uv[:, 0] * (res - 1), uv[:, 1] * (res - 1)], 1)
    tri_val = vals[faces].mean(1)
    order = np.argsort(tri_val)[::-1]  # draw dark last so crevices win
    for f in order:
        a, b, c = faces[f]
        poly = [tuple(px[a]), tuple(px[b]), tuple(px[c])]
        v = float(tri_val[f])
        dr.polygon(poly, fill=v, outline=v)
    return np.asarray(img, dtype=np.float32)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src')
    ap.add_argument('dst')
    ap.add_argument('--rough', type=float, default=0.88)
    ap.add_argument('--roughvar', type=float, default=0.035)
    ap.add_argument('--ao', type=float, default=0.85)
    ap.add_argument('--cavity', type=float, default=0.5)
    ap.add_argument('--rays', type=int, default=64)
    ap.add_argument('--res', type=int, default=1024)
    ap.add_argument('--no-geo-ao', action='store_true')
    a = ap.parse_args()

    g = glb.load(a.src)
    mat = g.json['materials'][0]
    pbr = mat['pbrMetallicRoughness']

    alb_i = g.image_index_for_texture(pbr['baseColorTexture']['index'])
    orm_tex = pbr.get('metallicRoughnessTexture', {}).get('index')
    orm_i = g.image_index_for_texture(orm_tex) if orm_tex is not None else None

    albedo = g.image(alb_i).convert('RGB')
    W, H = albedo.size
    print('albedo %dx%d' % (W, H))

    # ---------------------------------------------------------- geometric AO
    if a.no_geo_ao:
        ao_geo = np.ones((a.res, a.res), np.float32)
    else:
        t0 = time.time()
        scene = trimesh.load(a.src)
        mesh = trimesh.util.concatenate(list(scene.geometry.values())) \
            if hasattr(scene, 'geometry') else scene
        print('mesh %d verts %d faces' % (len(mesh.vertices), len(mesh.faces)))
        vao = vertex_ao(mesh, rays=a.rays)
        print('vertex AO: min %.3f mean %.3f max %.3f  (%.1fs)'
              % (vao.min(), vao.mean(), vao.max(), time.time() - t0))
        uv = np.asarray(mesh.visual.uv)
        ao_geo = rasterize_uv(uv, np.asarray(mesh.faces), vao, a.res)
        ao_geo = gaussian_filter(ao_geo, a.res / 512.0).astype(np.float32)
        print('rasterised AO: min %.3f mean %.3f' % (ao_geo.min(), ao_geo.mean()))

    ao_geo_full = np.asarray(Image.fromarray(ao_geo).resize((W, H), Image.BILINEAR),
                             np.float32)
    ao_geo_full = 1.0 - (1.0 - ao_geo_full) * a.ao

    # ------------------------------------------------------- cavity from albedo
    al = np.asarray(albedo, np.float32) / 255.0
    lum = al[:, :, 0] * .299 + al[:, :, 1] * .587 + al[:, :, 2] * .114
    # normalise against a blurred copy so only *local* darkening counts as cavity
    base = gaussian_filter(lum, W / 128.0).astype(np.float32)
    rel = np.clip(lum / np.maximum(base, 1e-4), 0.0, 1.5)
    cavity = 1.0 - np.clip(1.0 - rel, 0.0, 1.0) * a.cavity
    print('cavity: min %.3f mean %.3f' % (cavity.min(), cavity.mean()))

    ao = np.clip(ao_geo_full * cavity, 0.0, 1.0)
    print('final AO: min %.3f mean %.3f p5 %.3f' % (ao.min(), ao.mean(),
                                                     np.percentile(ao, 5)))

    # ------------------------------------------------------------- roughness
    if orm_i is not None:
        orm = np.asarray(g.image(orm_i).convert('RGB').resize((W, H), Image.BILINEAR),
                         np.float32) / 255.0
        r_old = orm[:, :, 1]
        # renormalise the original variation to exactly `roughvar` std around
        # the matte target, so we keep the *pattern* but not Tripo's gloss level
        rough = a.rough + (r_old - r_old.mean()) * (a.roughvar / max(r_old.std(), 1e-4))
    else:
        rough = np.full((H, W), a.rough, np.float32)
    rough = np.clip(rough, 0.0, 1.0)
    print('roughness: mean %.3f std %.3f' % (rough.mean(), rough.std()))

    out = np.stack([ao, rough, np.zeros_like(ao)], 2)
    out_img = Image.fromarray(np.clip(out * 255, 0, 255).astype(np.uint8))

    if orm_i is None:
        orm_i = g.add_image(out_img, name='ORM_fixed')
        orm_tex = g.add_texture(orm_i)
        pbr['metallicRoughnessTexture'] = {'index': orm_tex}
    else:
        g.set_image(orm_i, out_img, 'JPEG', 92)

    pbr['metallicFactor'] = 0.0
    pbr['roughnessFactor'] = 1.0
    mat['occlusionTexture'] = {'index': orm_tex, 'strength': 1.0}

    total = g.save(a.dst)
    print('wrote %s  %.2f MB' % (a.dst, total / 1e6))


if __name__ == '__main__':
    main()
