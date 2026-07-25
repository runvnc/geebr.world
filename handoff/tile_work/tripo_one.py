import sys, os, time, json, urllib.request
import fal_client

# usage: tripo_one.py image.png output.glb face_limit
img, out, face_limit = sys.argv[1], sys.argv[2], int(sys.argv[3])
os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
url = fal_client.upload_file(img)
print('uploaded', img, flush=True)
t0=time.time()
res=fal_client.subscribe('tripo3d/tripo/v2.5/image-to-3d', arguments={
    'image_url':url, 'texture':'HD', 'pbr':True, 'face_limit':face_limit
}, with_logs=False)
print('tripo ok %.1fs' % (time.time()-t0), json.dumps(res)[:500], flush=True)
for key in ('pbr_model','model_mesh','model_glb','base_model'):
    value=res.get(key)
    if isinstance(value,dict) and value.get('url'):
        urllib.request.urlretrieve(value['url'],out)
        print('saved',out,os.path.getsize(out),flush=True)
        break
else:
    raise RuntimeError('No downloadable GLB in response')
