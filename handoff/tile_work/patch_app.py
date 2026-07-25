import io

P = '/files/geebr.world/app/app.js'
s = io.open(P, encoding='utf-8').read()
orig = s
n = 0


def rep(old, new, count=1):
    global s, n
    c = s.count(old)
    assert c == count, 'expected %d occurrences, found %d for: %.90r' % (count, c, old)
    s = s.replace(old, new)
    n += 1


# ---------------------------------------------------------------- 1. constants
rep("const ANIM_ASSET = './assets/models/animations/kaykit/';",
    "const ANIM_ASSET = './assets/models/animations/kaykit/';\n"
    "const TILE_ASSET = './assets/models/tiles/';\n"
    "const DETAIL_NORMAL = './assets/textures/detail_clay_n.png';")

# ------------------------------------------------- 2. clay-look material helper
CLAY_HELPER = '''// ---------------------------------------------------------------------------
// Shared "painted clay" look.
//
// Image-to-3D output (Tripo) comes back with an essentially blank normal map
// (std ~2/255) and a semi-gloss roughness around 0.49, which reads as plastic.
// The concept art is matte clay/felt: roughness ~0.88, metallic 0, and the
// micro-surface tooth comes from ONE shared tiling detail normal applied at a
// high UV scale rather than per-asset authoring.
let _detailTex = null;
function detailNormal(scene){
  if(!_detailTex){
    _detailTex = new BABYLON.Texture(DETAIL_NORMAL, scene, false, false);
    _detailTex.wrapU = _detailTex.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE;
  }
  return _detailTex;
}
const CLAY = { rough:.88, detail:.15, detailScale:5, envIntensity:.55 };
function applyClayLook(m, scene, opts={}){
  if(!m) return m;
  const o = Object.assign({}, CLAY, opts);
  if(m instanceof BABYLON.PBRMaterial){
    // Tripo writes metallicFactor 1 and leans on the ORM blue channel, which
    // has stray non-zero pixels. Force dielectric.
    m.metallic = 0;
    m.useMetallnessFromMetallicTextureBlue = false;
    if(o.rough >= 0 && !m.metallicTexture) m.roughness = o.rough;
    m.environmentIntensity = o.envIntensity;
    if(o.detail > 0){
      const t = detailNormal(scene);
      m.detailMap.texture = t;
      m.detailMap.texture.uScale = o.detailScale;
      m.detailMap.texture.vScale = o.detailScale;
      m.detailMap.isEnabled = true;
      m.detailMap.bumpLevel = o.detail;
      m.detailMap.diffuseBlendLevel = 0;
      m.detailMap.roughnessBlendLevel = o.detail * .35;
    }
  } else if(m instanceof BABYLON.StandardMaterial){
    m.specularColor = new BABYLON.Color3(.02,.02,.018);
    m.specularPower = 8;
  }
  return m;
}
function applyClayLookToMeshes(meshes, scene, opts){
  const seen = new Set();
  for(const mesh of meshes){
    const m = mesh && mesh.material;
    if(!m || seen.has(m.uniqueId)) continue;
    seen.add(m.uniqueId);
    applyClayLook(m, scene, opts);
  }
}

function colorMat(scene,name,color,emissive=null){'''
rep("function colorMat(scene,name,color,emissive=null){", CLAY_HELPER)

# ---------------------------------------------------------- 3. camera far plane
# maxZ 4000 wrecks depth precision for SSAO/DOF; the sky dome uses
# infiniteDistance so it re-centres on the camera and 600 is plenty.
rep('camera.minZ=.1; camera.maxZ=4000;', 'camera.minZ=.5; camera.maxZ=600;')

# --------------------------------------------------------------- 4. shadow depth
rep('state.shadow.darkness=.06;', 'state.shadow.darkness=.30;')

# ---------------------------------------------------------------- 5. tone/grade
OLD_TONE = """  scene.imageProcessingConfiguration.contrast=1.34;
  scene.imageProcessingConfiguration.exposure=1.34;
  scene.imageProcessingConfiguration.toneMappingEnabled=true;
  scene.imageProcessingConfiguration.toneMappingType=BABYLON.ImageProcessingConfiguration.TONEMAPPING_ACES;"""
NEW_TONE = """  // The reference art is comparatively flat and low-contrast; ACES at contrast
  // 1.34 was crushing the shadows and desaturating the olive greens.
  scene.imageProcessingConfiguration.contrast=1.12;
  scene.imageProcessingConfiguration.exposure=1.18;
  scene.imageProcessingConfiguration.toneMappingEnabled=true;
  scene.imageProcessingConfiguration.toneMappingType=
    (BABYLON.ImageProcessingConfiguration.TONEMAPPING_KHR_PBR_NEUTRAL!==undefined)
      ? BABYLON.ImageProcessingConfiguration.TONEMAPPING_KHR_PBR_NEUTRAL
      : BABYLON.ImageProcessingConfiguration.TONEMAPPING_ACES;
  // Diorama grade: teal-lifted shadows, warm highlights, matching the concept
  // render's cool-shadow / warm-key separation.
  try{
    const cc=new BABYLON.ColorCurves();
    cc.shadowsHue=195; cc.shadowsDensity=26; cc.shadowsSaturation=-6; cc.shadowsExposure=5;
    cc.midtonesSaturation=4;
    cc.highlightsHue=40; cc.highlightsDensity=16; cc.highlightsSaturation=-4;
    cc.globalSaturation=6;
    scene.imageProcessingConfiguration.colorCurves=cc;
    scene.imageProcessingConfiguration.colorCurvesEnabled=true;
  }catch(e){ console.warn('color curves unavailable',e); }"""
rep(OLD_TONE, NEW_TONE)

# ------------------------------------------------------------ 6. SSAO2 + real DOF
OLD_PIPE = """    state.renderPipeline=rp;
    const gl=new BABYLON.GlowLayer('hd_glow',scene,{ mainTextureFixedSize:512, blurKernelSize:44 });"""
NEW_PIPE = """    // Tilt-shift depth of field. The old comment promised this but it was never
    // enabled. Focus tracks the camera target so the island centre stays sharp.
    rp.depthOfFieldEnabled=true;
    rp.depthOfFieldBlurLevel=BABYLON.DepthOfFieldEffectBlurLevel.Low;
    rp.depthOfField.focalLength=42;
    rp.depthOfField.fStop=2.4;
    scene.onBeforeRenderObservable.add(()=>{
      // focusDistance is in millimetres
      rp.depthOfField.focusDistance=BABYLON.Vector3.Distance(camera.position,camera.target)*1000;
    });
    state.renderPipeline=rp;
    // Ambient occlusion is what makes the reference read as sculpted clay
    // rather than flat colour. Neither the imported GLBs (Tripo bakes a pure
    // white AO channel) nor the procedural terrain carried any before this.
    try{
      if(BABYLON.SSAO2RenderingPipeline.IsSupported){
        const ssao=new BABYLON.SSAO2RenderingPipeline('ssao',scene,{ssaoRatio:1,blurRatio:1},[camera]);
        ssao.radius=.55; ssao.totalStrength=1.05; ssao.base=0; ssao.samples=16;
        ssao.maxZ=60; ssao.minZAspect=.2; ssao.expensiveBlur=true;
        state.ssao=ssao;
      } else console.warn('SSAO2 unsupported on this device');
    }catch(e){ console.warn('ssao unavailable',e); }
    const gl=new BABYLON.GlowLayer('hd_glow',scene,{ mainTextureFixedSize:512, blurKernelSize:44 });"""
rep(OLD_PIPE, NEW_PIPE)

# ------------------------------------- 7. apply the clay look to imported GLBs
rep("  for(const mesh of res.meshes){ mesh.receiveShadows=true; mesh.isPickable=true; mesh.metadata={ownerId:id}; addShadow(mesh); if(mesh.material){ mesh.material.specularColor=new BABYLON.Color3(.025,.025,.022); } }",
    "  for(const mesh of res.meshes){ mesh.receiveShadows=true; mesh.isPickable=true; mesh.metadata={ownerId:id}; addShadow(mesh); }\n"
    "  applyClayLookToMeshes(res.meshes,scene);")

rep("    mesh.receiveShadows=true; mesh.isPickable=true; mesh.metadata={ownerId:id}; addShadow(mesh);",
    "    mesh.receiveShadows=true; mesh.isPickable=true; mesh.metadata={ownerId:id}; addShadow(mesh); applyClayLook(mesh.material,scene);")

rep("    for(const mesh of result.meshes){ mesh.parent=root; mesh.receiveShadows=true; addShadow(mesh); if(mesh.material && 'roughness' in mesh.material) mesh.material.roughness=Math.max(mesh.material.roughness||0,.72); }",
    "    for(const mesh of result.meshes){ mesh.parent=root; mesh.receiveShadows=true; addShadow(mesh); }\n"
    "    applyClayLookToMeshes(result.meshes,scene);")

io.open(P, 'w', encoding='utf-8').write(s)
print('applied %d edits, %d -> %d bytes' % (n, len(orig), len(s)))
