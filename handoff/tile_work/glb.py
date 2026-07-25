"""glb.py - minimal glTF-binary reader/writer that supports FULL rebuild.

Unlike bake.py (which patches a texture in place and is constrained by the
original bufferView length) this rebuilds the binary chunk from scratch, so
textures can be resized, added or removed freely.

    import glb
    g = glb.load('in.glb')
    g.json                      # the glTF json dict
    g.image(i) -> PIL.Image     # decode image i
    g.set_image(i, pil, fmt)    # replace image i (any size)
    g.buffer_data(bufferView)   # raw bytes of a bufferView
    g.add_bufferview(bytes)     # -> new bufferView index
    g.save('out.glb')
"""
import io
import json
import struct

from PIL import Image

_JSON = 0x4E4F534A
_BIN = 0x004E4942


class GLB:
    def __init__(self, j, bin_):
        self.json = j
        self.bin = bytearray(bin_)
        # decoded / replacement images, keyed by image index
        self._img_override = {}

    # ---------------------------------------------------------------- read
    def buffer_data(self, bv_index):
        bv = self.json['bufferViews'][bv_index]
        o = bv.get('byteOffset', 0)
        return bytes(self.bin[o:o + bv['byteLength']])

    def image(self, i):
        if i in self._img_override:
            return self._img_override[i][0]
        meta = self.json['images'][i]
        return Image.open(io.BytesIO(self.buffer_data(meta['bufferView'])))

    def set_image(self, i, pil, fmt='JPEG', quality=92):
        self._img_override[i] = (pil, fmt, quality)

    def image_index_for_texture(self, tex_index):
        return self.json['textures'][tex_index].get('source', tex_index)

    # --------------------------------------------------------------- write
    def add_bufferview(self, data):
        """Append raw bytes, return the new bufferView index."""
        while len(self.bin) % 4:
            self.bin.append(0)
        off = len(self.bin)
        self.bin.extend(data)
        self.json.setdefault('bufferViews', []).append(
            {'buffer': 0, 'byteOffset': off, 'byteLength': len(data)})
        return len(self.json['bufferViews']) - 1

    def add_image(self, pil, fmt='JPEG', quality=92, name=None):
        buf = io.BytesIO()
        pil.save(buf, fmt, quality=quality) if fmt == 'JPEG' else pil.save(buf, fmt)
        bvi = self.add_bufferview(buf.getvalue())
        mime = 'image/jpeg' if fmt == 'JPEG' else 'image/png'
        self.json.setdefault('images', []).append(
            {'bufferView': bvi, 'mimeType': mime, **({'name': name} if name else {})})
        return len(self.json['images']) - 1

    def add_texture(self, image_index):
        self.json.setdefault('textures', []).append({'source': image_index})
        return len(self.json['textures']) - 1

    def save(self, path):
        j = self.json
        old_bin = bytes(self.bin)
        new_bin = bytearray()
        remap = {}

        def emit(data):
            while len(new_bin) % 4:
                new_bin.append(0)
            o = len(new_bin)
            new_bin.extend(data)
            return o

        # re-encode overridden images first so their byteLength is known
        img_bytes = {}
        for i, (pil, fmt, q) in self._img_override.items():
            buf = io.BytesIO()
            if fmt == 'JPEG':
                pil.convert('RGB').save(buf, 'JPEG', quality=q)
            else:
                pil.save(buf, fmt)
            img_bytes[i] = buf.getvalue()
            j['images'][i]['mimeType'] = 'image/jpeg' if fmt == 'JPEG' else 'image/png'

        img_bv = {j['images'][i]['bufferView']: i for i in range(len(j.get('images', [])))
                  if 'bufferView' in j['images'][i]}

        for bi, bv in enumerate(j['bufferViews']):
            i = img_bv.get(bi)
            if i is not None and i in img_bytes:
                data = img_bytes[i]
            else:
                o = bv.get('byteOffset', 0)
                data = old_bin[o:o + bv['byteLength']]
            remap[bi] = (emit(data), len(data))

        for bi, bv in enumerate(j['bufferViews']):
            bv['byteOffset'], bv['byteLength'] = remap[bi]

        while len(new_bin) % 4:
            new_bin.append(0)
        j['buffers'] = [{'byteLength': len(new_bin)}]

        jb = json.dumps(j, separators=(',', ':')).encode()
        jb += b' ' * ((4 - len(jb) % 4) % 4)
        total = 12 + 8 + len(jb) + 8 + len(new_bin)
        out = struct.pack('<III', 0x46546C67, 2, total)
        out += struct.pack('<II', len(jb), _JSON) + jb
        out += struct.pack('<II', len(new_bin), _BIN) + bytes(new_bin)
        with open(path, 'wb') as f:
            f.write(out)
        return total


def load(path):
    d = open(path, 'rb').read()
    magic, ver, total = struct.unpack('<III', d[:12])
    assert magic == 0x46546C67, 'not a glb'
    off = 12
    j = None
    bin_ = b''
    while off < total:
        clen, ctype = struct.unpack('<II', d[off:off + 8])
        chunk = d[off + 8:off + 8 + clen]
        if ctype == _JSON:
            j = json.loads(chunk)
        elif ctype == _BIN:
            bin_ = chunk
        off += 8 + clen
    return GLB(j, bin_)
