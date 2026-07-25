import json, struct, sys, io
import numpy as np
from PIL import Image
# usage: bake.py in.glb out.glb GAIN  -- multiplies the baseColor texture in-place
src, dst, gain = sys.argv[1], sys.argv[2], float(sys.argv[3])
d = open(src,'rb').read()
magic, ver, total = struct.unpack('<III', d[:12])
off = 12
clen, ctype = struct.unpack('<II', d[off:off+8]); j = json.loads(d[off+8:off+8+clen]); off += 8+clen
blen, btype = struct.unpack('<II', d[off:off+8]); bin_ = bytearray(d[off+8:off+8+blen])
# find the baseColorTexture image index
mat = j['materials'][0]['pbrMetallicRoughness']
texi = mat['baseColorTexture']['index']
imgi = j['textures'][texi].get('source', texi)
im_meta = j['images'][imgi]
bvi = im_meta['bufferView']
bv = j['bufferViews'][bvi]
o = bv.get('byteOffset',0); L = bv['byteLength']
img = Image.open(io.BytesIO(bytes(bin_[o:o+L]))).convert('RGB')
a = np.asarray(img).astype(np.float32) * gain
new_img = Image.fromarray(np.clip(a,0,255).astype(np.uint8))
buf = io.BytesIO(); new_img.save(buf, 'JPEG', quality=92); nb = buf.getvalue()
if len(nb) > L:
    for q in (88,84,80,74,68,60):
        buf = io.BytesIO(); new_img.save(buf,'JPEG',quality=q); nb = buf.getvalue()
        if len(nb) <= L: break
assert len(nb) <= L, 'cannot fit %d into %d' % (len(nb), L)
bin_[o:o+len(nb)] = nb
bv['byteLength'] = len(nb)
newj = json.dumps(j, separators=(',',':')).encode()
newj += b' ' * ((4 - len(newj)%4)%4)
binpad = bytes(bin_) + b'\x00' * ((4 - len(bin_)%4)%4)
out = struct.pack('<III', magic, ver, 12+8+len(newj)+8+len(binpad)) + struct.pack('<II', len(newj), ctype) + newj + struct.pack('<II', len(binpad), btype) + binpad
open(dst,'wb').write(out)
print('wrote', dst, 'gain', gain, 'jpeg', len(nb), '<=', L)
