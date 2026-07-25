import sys, json, time, os
import fal_client, urllib.request

img = sys.argv[1]
out = sys.argv[2]
os.makedirs(out, exist_ok=True)
url = fal_client.upload_file(img)
print('url', url, flush=True)

JOBS = {
  'tripo':  ('tripo3d/tripo/v2.5/image-to-3d', {'image_url': url, 'texture': 'HD', 'pbr': True, 'face_limit': 6000}),
  'rodin':  ('fal-ai/hyper3d/rodin', {'input_image_urls': [url], 'geometry_file_format': 'glb', 'material': 'PBR', 'quality': 'medium', 'tier': 'Regular'}),
  'trellis':('fal-ai/trellis', {'image_url': url, 'texture_size': 1024, 'mesh_simplify': 0.95}),
  'hunyuan':('fal-ai/hunyuan3d-v21', {'input_image_url': url}),
}
names = sys.argv[3].split(',') if len(sys.argv) > 3 else list(JOBS)
for n in names:
    ep, args = JOBS[n]
    t0 = time.time()
    try:
        res = fal_client.subscribe(ep, arguments=args, with_logs=False)
    except Exception as e:
        print(n, 'FAILED', str(e)[:300], flush=True)
        continue
    print(n, 'ok %.0fs' % (time.time()-t0), json.dumps(res)[:400], flush=True)
    for k in ('model_mesh','model_glb','pbr_model','base_model'):
        v = res.get(k)
        if isinstance(v, dict) and v.get('url'):
            p = os.path.join(out, n + '.glb')
            urllib.request.urlretrieve(v['url'], p)
            print('  saved', p, os.path.getsize(p), flush=True)
            break
