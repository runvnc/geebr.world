import sys, os
from PIL import Image
src = sys.argv[1]
w = int(sys.argv[2]) if len(sys.argv) > 2 else 448
name = os.path.splitext(os.path.basename(src))[0] + '_v.jpg'
out = '/tmp/fal3d/view/' + name
im = Image.open(src).convert('RGB')
im.thumbnail((w, w))
im.save(out, 'JPEG', quality=72)
print(out, os.path.getsize(out), im.size)
