import sys, os
from PIL import Image

# mk.py out.jpg W H CROP(l,t,r,b) img1 img2 ...
out = sys.argv[1]
W = int(sys.argv[2]); H = int(sys.argv[3])
crop = [int(x) for x in sys.argv[4].split(',')] if sys.argv[4] != '-' else None
imgs = sys.argv[5:]
tiles = []
for p in imgs:
    im = Image.open(p).convert('RGB')
    if crop:
        im = im.crop(tuple(crop))
    tiles.append(im.resize((W, H), Image.LANCZOS))
sheet = Image.new('RGB', (W * len(tiles) + 10 * (len(tiles) - 1), H), (0, 0, 0))
for i, t in enumerate(tiles):
    sheet.paste(t, (i * (W + 10), 0))
q = 70
while q > 25:
    sheet.save(out, quality=q)
    if os.path.getsize(out) < 45000:
        break
    q -= 8
print(out, os.path.getsize(out), sheet.size)
