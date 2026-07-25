import sys, os, base64, secrets
from openai import OpenAI

prompt_file = sys.argv[1]
out = sys.argv[2]
imgs = sys.argv[3:]
prompt = open(prompt_file).read().strip()
c = OpenAI()
handles = [open(p, 'rb') for p in imgs]
r = c.images.edit(
    model='gpt-image-1',
    image=handles if len(handles) > 1 else handles[0],
    prompt=prompt,
    size='1024x1024',
    quality='high',
    input_fidelity='high',
    n=1,
)
for i, d in enumerate(r.data or []):
    p = out if i == 0 else out.replace('.png', '_%d.png' % i)
    open(p, 'wb').write(base64.b64decode(d.b64_json))
    print('saved', p, os.path.getsize(p))
