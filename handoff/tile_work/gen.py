import sys, os, json, time, urllib.request
import fal_client

img = sys.argv[1]
model = sys.argv[2]
outdir = sys.argv[3]
os.makedirs(outdir, exist_ok=True)

print("uploading", img, flush=True)
url = fal_client.upload_file(img)
print("url", url, flush=True)

ARGS = {
 "trellis": ("fal-ai/trellis", {"image_url": url, "texture_size": 2048, "mesh_simplify": 0.9, "ss_sampling_steps": 20}),
 "tripo": ("tripo3d/tripo/v2.5/image-to-3d", {"image_url": url, "texture": True, "pbr": True, "texture_quality": "detailed", "face_limit": 20000}),
 "rodin": ("fal-ai/hyper3d/rodin", {"input_image_urls": [url], "geometry_file_format": "glb", "material": "PBR", "quality": "medium", "tier": "Regular"}),
}
ep, args = ARGS[model]
def onq(u):
    for l in getattr(u, "logs", []) or []:
        print("  log:", l.get("message"), flush=True)
t0 = time.time()
res = fal_client.subscribe(ep, arguments=args, with_logs=True, on_queue_update=onq)
print("elapsed %.1fs" % (time.time()-t0), flush=True)
print(json.dumps(res)[:2000], flush=True)
with open(os.path.join(outdir, model + "_result.json"), "w") as f:
    json.dump(res, f, indent=1)

def grab(u, name):
    p = os.path.join(outdir, name)
    urllib.request.urlretrieve(u, p)
    print("saved", p, os.path.getsize(p), flush=True)

for key in ("model_mesh", "model_glb", "pbr_model", "base_model"):
    v = res.get(key)
    if isinstance(v, dict) and v.get("url"):
        grab(v["url"], model + "_" + key + ".glb")
