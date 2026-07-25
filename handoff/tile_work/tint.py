import json, struct, sys, io
# usage: tint.py in.glb out.glb FACTOR
src, dst, f = sys.argv[1], sys.argv[2], float(sys.argv[3])
d = open(src,'rb').read()
magic, ver, total = struct.unpack('<III', d[:12])
off = 12
clen, ctype = struct.unpack('<II', d[off:off+8])
jraw = d[off+8:off+8+clen]; jend = off+8+clen
j = json.loads(jraw)
for m in j.get('materials', []):
    p = m.setdefault('pbrMetallicRoughness', {})
    bcf = p.get('baseColorFactor', [1,1,1,1])
    p['baseColorFactor'] = [bcf[0]*f, bcf[1]*f, bcf[2]*f, bcf[3]]
new = json.dumps(j, separators=(',',':')).encode()
new += b' ' * ((4 - len(new) % 4) % 4)
rest = d[jend:]
out = struct.pack('<III', magic, ver, 12 + 8 + len(new) + len(rest)) + struct.pack('<II', len(new), ctype) + new + rest
open(dst,'wb').write(out)
print('wrote', dst, len(out), 'factor', f)
