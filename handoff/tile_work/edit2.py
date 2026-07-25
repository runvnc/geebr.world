import sys, os, base64
from openai import OpenAI

# usage: edit2.py prompt.txt out.png SIZE img1 [img2 ...]
prompt_file = sys.argv[1]
out = sys.argv[2]
size = sys.argv[3]
imgs = sys.argv[4:]
prompt = open(prompt_file).read().strip()
c = OpenAI()
handles = [open(p, 'rb') for p in imgs]
print('imgs:', imgs, 'size:', size, flush=True)
r = c.images.edit(
    model='gpt-image-1',
    image=handles if len(handles) > 1 else handles[0],
    prompt=prompt,
    size=size,
    quality='high',
    input_fidelity='high',
    n=1,
)
for i, d in enumerate(r.data or []):
    p = out if i == 0 else out.replace('.png', '_%d.png' % i)
    open(p, 'wb').write(base64.b64decode(d.b64_json))
    print('saved', p, os.path.getsize(p))
