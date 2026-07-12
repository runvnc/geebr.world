/* geebr.world v14.2 — clear map + click-to-spawn mode */
const canvas = document.getElementById('renderCanvas');
const ASSET = './assets/textures/';
const PROP_ASSET = './assets/models/props/';
const CHAR_ASSET = './assets/models/characters/kaykit/';
const ANIM_ASSET = './assets/models/animations/kaykit/';
const WORLD = { size: 32, half: 16 };
const COMMANDS = ['say','walk','look','touch','push','pull','carry','drop','throw','dig','build','repair','panic','spell.push','spell.spark','spell.fireball','goal','give_quest'];
const state = {
  scene:null, engine:null, camera:null, shadow:null, materials:{}, geebrs:[], selected:null, target:null,
  blocks:[], props:[], tiles:[], bubbles:[], badges:[], meta:new Map(), held:new Map(), allowed:new Set(['walk']), zoomFocus:null, animSources:null,
  turn:{index:0, phase:'ready', command:null, resolveMs:200, lastEndedAt:0, mode:true}, globalHistory:[], nextAgentId:null,
  brainConfigs:new Map(), nextSpawnId:1, spawnMode:{enabled:false, type:'geebr'}
};
function log(s){ const box=document.getElementById('log'); const div=document.createElement('div'); div.className='logline'; div.textContent=s; box.prepend(div); while(box.children.length>10) box.lastChild.remove(); }
function pickRandom(a){ return a[Math.floor(Math.random()*a.length)] }
function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
async function createEngine(){ if(!navigator.gpu) throw new Error('WebGPU unavailable in this browser'); const engine = new BABYLON.WebGPUEngine(canvas,{antialias:true,adaptToDeviceRatio:true}); await engine.initAsync(); return engine; }
function mat(scene,name,texture,opts={}){
  const m=new BABYLON.StandardMaterial(name,scene);
  const tx=new BABYLON.Texture(ASSET+texture,scene,true,false,BABYLON.Texture.TRILINEAR_SAMPLINGMODE);
  tx.wrapU=BABYLON.Texture.WRAP_ADDRESSMODE; tx.wrapV=BABYLON.Texture.WRAP_ADDRESSMODE;
  tx.anisotropicFilteringLevel=8; tx.uScale=opts.uScale||1; tx.vScale=opts.vScale||1;
  m.diffuseTexture=tx;
  m.specularColor=opts.specular||new BABYLON.Color3(.018,.018,.016);
  if(opts.diffuse) m.diffuseColor=opts.diffuse;
  if(opts.emissive) m.emissiveColor=opts.emissive;
  if(opts.alpha!==undefined){ m.alpha=opts.alpha; tx.hasAlpha=true; }
  return m;
}
function colorMat(scene,name,color,emissive=null){ const m=new BABYLON.StandardMaterial(name,scene); m.diffuseColor=color; m.specularColor=new BABYLON.Color3(.035,.035,.035); if(emissive) m.emissiveColor=emissive; return m; }

function makeWaterMaterial(scene){
  const m=mat(scene,'water_soft','water_painterly.png',{uScale:4.5,vScale:4.5,alpha:.72,specular:new BABYLON.Color3(.16,.24,.25),emissive:new BABYLON.Color3(.006,.022,.028)});
  m.backFaceCulling=false;
  return m;
}
function setOrthoZoom(camera,halfWidth){
  const aspect=state.engine.getRenderWidth()/Math.max(1,state.engine.getRenderHeight());
  camera.orthoLeft=-halfWidth; camera.orthoRight=halfWidth; camera.orthoTop=halfWidth/aspect; camera.orthoBottom=-halfWidth/aspect;
  camera.metadata ||= {}; camera.metadata.orthoHalfWidth=halfWidth;
}
function setupMouseWheelZoom(camera){
  camera.metadata ||= {}; camera.metadata.orthoHalfWidth=12.5;
  setOrthoZoom(camera,camera.metadata.orthoHalfWidth);
  canvas.addEventListener('wheel',ev=>{
    ev.preventDefault();
    const current=camera.metadata.orthoHalfWidth||12.5;
    const factor=ev.deltaY>0?1.10:.90;
    const focus=state.zoomFocus || state.target?.getAbsolutePosition?.() || state.selected?.root?.position;
    if(focus){
      const f=focus.clone ? focus.clone() : new BABYLON.Vector3(focus.x||0,focus.y||0,focus.z||0);
      f.y=0.6;
      camera.setTarget(BABYLON.Vector3.Lerp(camera.target,f,ev.deltaY>0?.18:.42));
    }
    setOrthoZoom(camera,clamp(current*factor,4.2,24.5));
  },{passive:false});
  window.addEventListener('resize',()=>setOrthoZoom(camera,camera.metadata.orthoHalfWidth||12.5));
}
function hashNoise(x,z){
  const n=Math.sin(x*127.1+z*311.7)*43758.5453123;
  return n-Math.floor(n);
}
function smoothNoise(x,z){
  const xi=Math.floor(x), zi=Math.floor(z), xf=x-xi, zf=z-zi;
  const u=xf*xf*(3-2*xf), v=zf*zf*(3-2*zf);
  const a=hashNoise(xi,zi), b=hashNoise(xi+1,zi), c=hashNoise(xi,zi+1), d=hashNoise(xi+1,zi+1);
  return BABYLON.Scalar.Lerp(BABYLON.Scalar.Lerp(a,b,u), BABYLON.Scalar.Lerp(c,d,u), v);
}
function fbm(x,z){
  let v=0, amp=.55, f=.18;
  for(let i=0;i<5;i++){ v+=smoothNoise(x*f,z*f)*amp; f*=2.07; amp*=.48; }
  return v;
}
function mixColor(a,b,t){ return new BABYLON.Color4(a.r+(b.r-a.r)*t,a.g+(b.g-a.g)*t,a.b+(b.b-a.b)*t,1); }
function makeVertexTerrain(scene){
  const size=32, half=16, n=96;
  const grassA=new BABYLON.Color4(.23,.36,.18,1), grassB=new BABYLON.Color4(.43,.56,.25,1), grassC=new BABYLON.Color4(.16,.29,.16,1);
  const dirtA=new BABYLON.Color4(.42,.28,.16,1), dirtB=new BABYLON.Color4(.62,.46,.27,1), dirtC=new BABYLON.Color4(.25,.18,.12,1);
  const stoneA=new BABYLON.Color4(.34,.34,.31,1), stoneB=new BABYLON.Color4(.55,.54,.48,1);
  const positions=[], indices=[], colors=[], uvs=[];
  for(let iz=0; iz<=n; iz++){
    const z=-half + size*iz/n;
    for(let ix=0; ix<=n; ix++){
      const x=-half + size*ix/n;
      const noise=fbm(x,z);
      const micro=fbm(x*3.3+17,z*3.3-9);
      const pathCenter=Math.sin(x*.28)*.48 + Math.sin(x*.77+1.8)*.18;
      const pathWidth=1.35 + smoothNoise(x*.35,9)*.55;
      const pathMask=1-BABYLON.Scalar.SmoothStep(pathWidth,pathWidth+1.25,Math.abs(z-pathCenter));
      const stoneMask=(x>2&&z<-5)?BABYLON.Scalar.SmoothStep(0,1.8,Math.min(x-2,-5-z)):0;
      const waterMask=(x>6&&z>3)?BABYLON.Scalar.SmoothStep(0,1.4,Math.min(x-6,z-3)):0;
      let y=.012 + (noise-.5)*.075 + (micro-.5)*.018;
      if(waterMask>.55) y=-.12;
      let col=mixColor(grassA,grassB,clamp(noise*.95+micro*.18,0,1));
      if(noise>.72) col=mixColor(col,grassC,.28);
      if(pathMask>.01){ const dcol=mixColor(dirtA,dirtB,clamp(noise*.9+micro*.35,0,1)); col=mixColor(col,dcol,pathMask*.92); y-=pathMask*.018; }
      if(stoneMask>.01){ const scol=mixColor(stoneA,stoneB,clamp(noise*.8+micro*.24,0,1)); col=mixColor(col,scol,stoneMask*.88); y+=stoneMask*.035; }
      if(waterMask>.01){ col=mixColor(col,new BABYLON.Color4(.10,.22,.24,1),waterMask*.8); }
      // subtle painted speckles, not UV tiling
      if(hashNoise(ix*13.1,iz*7.7)>.965 && pathMask<.3 && stoneMask<.25 && waterMask<.1) col=mixColor(col,new BABYLON.Color4(.55,.64,.31,1),.35);
      if(hashNoise(ix*5.2+3,iz*11.3)>.975 && pathMask>.25) col=mixColor(col,new BABYLON.Color4(.18,.13,.09,1),.35);
      positions.push(x,y,z); colors.push(col.r,col.g,col.b,col.a); uvs.push(ix/n,iz/n);
    }
  }
  for(let iz=0; iz<n; iz++) for(let ix=0; ix<n; ix++){
    const a=iz*(n+1)+ix, b=a+1, c=a+n+1, d=c+1;
    if((ix+iz)%2===0) indices.push(a,c,b,b,c,d); else indices.push(a,c,d,a,d,b);
  }
  const mesh=new BABYLON.Mesh('single_vertex_colored_terrain',scene);
  const vd=new BABYLON.VertexData(); vd.positions=positions; vd.indices=indices; vd.colors=colors; vd.uvs=uvs;
  BABYLON.VertexData.ComputeNormals(positions,indices,vd.normals=[]); vd.applyToMesh(mesh,true);
  mesh.receiveShadows=true; mesh.isPickable=false;
  const material=new BABYLON.StandardMaterial('terrain_vertex_paint',scene);
  material.diffuseColor=new BABYLON.Color3(1,1,1); material.specularColor=new BABYLON.Color3(.012,.012,.01);
  material.useVertexColor=true; material.backFaceCulling=false;
  mesh.material=material;
  return mesh;
}
function makeShoreRocks(scene){
  for(let i=0;i<55;i++){
    const along=Math.random(); let x,z;
    if(Math.random()<.5){ x=6+Math.random()*9.8; z=3+(Math.random()<.5?0:12)+(.5-Math.random())*.7; }
    else { x=6+(Math.random()<.5?0:9.8)+(.5-Math.random())*.7; z=3+Math.random()*12; }
    const r=BABYLON.MeshBuilder.CreatePolyhedron('shore_pebble',{type:2,size:.055+Math.random()*.11},scene);
    r.position.set(x,.05,z); r.rotation.set(Math.random(),Math.random()*Math.PI,Math.random()); r.material=state.materials.pebble; r.isPickable=false; addShadow(r);
  }
}
function makeBetterWater(scene){
  const mat=new BABYLON.StandardMaterial('water_lagoon_material',scene);
  mat.diffuseColor=new BABYLON.Color3(.08,.31,.36); mat.emissiveColor=new BABYLON.Color3(.012,.055,.062);
  mat.specularColor=new BABYLON.Color3(.55,.72,.72); mat.alpha=.62; mat.backFaceCulling=false;
  const water=BABYLON.MeshBuilder.CreateGround('water_lagoon_sheet',{width:9.85,height:12.1,subdivisions:54},scene);
  water.position.set(11.05,.045,9.05); water.material=mat; water.isPickable=false;
  const pos=water.getVerticesData(BABYLON.VertexBuffer.PositionKind); water.metadata={basePositions:pos.slice()};
  scene.onBeforeRenderObservable.add(()=>{
    const t=performance.now()*0.001; const arr=water.getVerticesData(BABYLON.VertexBuffer.PositionKind); const base=water.metadata.basePositions;
    for(let i=0;i<arr.length;i+=3){ const x=base[i], z=base[i+2]; arr[i+1]=Math.sin(x*1.55+t*1.15+z*.28)*.026+Math.sin(z*2.25-t*.95)*.014+Math.sin((x+z)*.72+t*.55)*.009; }
    water.updateVerticesData(BABYLON.VertexBuffer.PositionKind,arr,false,false);
  });
  // stylized glints: moving thin ribbons above the water, cheap but reads much better than tiled blue texture
  const glintMat=colorMat(scene,'water_glint',new BABYLON.Color3(.67,.93,.92),new BABYLON.Color3(.04,.18,.18)); glintMat.alpha=.42;
  for(let j=0;j<9;j++){
    const pts=[]; const z=-5.2+j*1.28;
    for(let i=0;i<18;i++){ const x=-4.4+i*.52; pts.push(new BABYLON.Vector3(x,.075,z+Math.sin(i*.7+j)*.08)); }
    const line=BABYLON.MeshBuilder.CreateTube('water_glint_ribbon',{path:pts,radius:.012,tessellation:5},scene);
    line.position.set(11.05,0,9.05); line.material=glintMat; line.isPickable=false;
    scene.onBeforeRenderObservable.add(()=>{ line.position.x=11.05+Math.sin(performance.now()*0.0005+j)*.12; line.position.z=9.05+Math.cos(performance.now()*0.00043+j)*.08; });
  }
  return water;
}
function addTerrainPolish(scene){
  // v11: terrain is now a vertex-painted continuous surface with irregular biomes.
  // The 1m box tiles remain hidden/muted as collision/picking scaffolding, not as the visible ground material.
  makeVertexTerrain(scene);
  makeBetterWater(scene);
  makeShoreRocks(scene);
  // varied tufts, biased away from paths/water/quarry
  for(let i=0;i<520;i++){
    const x=-15.5+Math.random()*31, z=-15.5+Math.random()*31;
    const pathCenter=Math.sin(x*.28)*.48 + Math.sin(x*.77+1.8)*.18;
    if((Math.abs(z-pathCenter)<1.65 && x>-9.8 && x<9.8) || (x>5.7&&z>2.7) || (x>2&&z<-5)) continue;
    const h=.11+Math.random()*.20, d=.045+Math.random()*.06;
    const blade=BABYLON.MeshBuilder.CreateCylinder('grass_tuft',{height:h,diameterTop:.006,diameterBottom:d,tessellation:4},scene);
    blade.position.set(x,.07+h*.35,z); blade.rotation.set((Math.random()-.5)*.26,Math.random()*Math.PI,(Math.random()-.5)*.26);
    blade.material=Math.random()<.72?state.materials.grassBlade:state.materials.grassBlade2; blade.isPickable=false; addShadow(blade);
  }
}

async function initKayKitAnimationSources(scene){
  if(state.animSources) return state.animSources;
  const files=['Rig_Medium_General.glb','Rig_Medium_MovementBasic.glb','Rig_Medium_CombatRanged.glb','Rig_Medium_Tools.glb','Rig_Medium_Simulation.glb'];
  const groups=[];
  for(const file of files){
    try{
      const res=await BABYLON.SceneLoader.ImportMeshAsync('',ANIM_ASSET,file,scene);
      for(const m of res.meshes){ m.setEnabled(false); m.isVisible=false; }
      for(const g of res.animationGroups||[]){ g.stop(); groups.push(g); }
    }catch(e){ console.warn('animation source failed',file,e); }
  }
  state.animSources={groups};
  log('KayKit animation sources loaded: '+groups.length+' groups');
  return state.animSources;
}
function descendantsByName(root){
  const map=new Map();
  for(const n of [root,...root.getDescendants(false)]){ if(!map.has(n.name)) map.set(n.name,n); }
  return map;
}
function cloneAnimGroupsForRig(root,id){
  const src=state.animSources?.groups||[];
  const targetMap=descendantsByName(root);
  const out={};
  for(const g of src){
    try{ const cloned=g.clone(id+'_'+g.name, oldTarget => targetMap.get(oldTarget.name) || null); if(cloned){ cloned.stop(); out[g.name]=cloned; } }
    catch(e){ /* some target types may not map cleanly; skip */ }
  }
  return out;
}
function pickAnim(g,names){ if(!g.rigAnims) return null; for(const n of names){ if(g.rigAnims[n]) return g.rigAnims[n]; } return null; }
function playRig(g,mode,loop=true){
  if(!g?.rigged || g.rigMode===mode) return;
  if(g.activeRigAnim) g.activeRigAnim.stop();
  const choices={
    idle:['Idle_A','Idle_B','Melee_Unarmed_Idle'], walk:['Walking_A','Walking_B','Walking_C'], panic:['Running_A','Running_B'],
    talk:['Waving','Interact','Idle_B'], cast:['Ranged_Magic_Spellcasting','Ranged_Magic_Shoot','Ranged_Magic_Raise'],
    push:['Interact','Melee_Unarmed_Attack_Punch_A','Push_Ups'], carry:['Holding_A','Holding_B','PickUp'], throw:['Throw','Ranged_Magic_Shoot'],
    dig:['Dig','Digging','Pickaxe'], repair:['Hammer','Hammering','Work_A'], bonk:['Hit_A','Hit_B']
  }[mode] || ['Idle_A'];
  const ag=pickAnim(g,choices) || pickAnim(g,['Idle_A']);
  if(ag){ ag.start(loop,1.0,ag.from,ag.to,false); g.activeRigAnim=ag; g.rigMode=mode; }
}
async function createKayKitGeebr(scene,id,pos,file,label){
  const res=await BABYLON.SceneLoader.ImportMeshAsync('',CHAR_ASSET,file,scene);
  const root=new BABYLON.TransformNode(id,scene);
  root.position.copyFrom(pos); root.scaling.setAll(.86);
  const importedRoot=res.meshes.find(m=>m.name==='__root__') || res.meshes[0];
  importedRoot.parent=root; importedRoot.position.set(0,0,0); importedRoot.rotationQuaternion=null; importedRoot.rotation.set(0,Math.PI,0);
  for(const mesh of res.meshes){ mesh.receiveShadows=true; mesh.isPickable=true; mesh.metadata={ownerId:id}; addShadow(mesh); if(mesh.material){ mesh.material.specularColor=new BABYLON.Color3(.025,.025,.022); } }
  const collider=BABYLON.MeshBuilder.CreateBox(id+'_collider',{width:.66,height:1.35,depth:.58},scene);
  collider.position.copyFrom(root.position); collider.position.y+=.68; collider.isVisible=false; collider.metadata={ownerId:id};
  const agg=addBody(collider,'dynamic','BOX',1.25,{friction:.92,restitution:.02});
  agg?.body?.setMotionType?.(BABYLON.PhysicsMotionType.ANIMATED);
  const geebr={id,root,collider,agg,selected:false,anim:'idle',t:Math.random()*10,dir:new BABYLON.Vector3(0,0,-1),style:label,traits:{fireball:78,obedience:48},rigged:true,rigRoot:importedRoot,rigAnims:cloneAnimGroupsForRig(root,id),rigMode:null,activeRigAnim:null,cosmetic:{},logicalPos:new BABYLON.Vector3(pos.x,0,pos.z)};
  playRig(geebr,'idle',true);
  state.geebrs.push(geebr);
  return geebr;
}
async function createAgentCast(scene){
  try{
    await initKayKitAnimationSources(scene);
    await createKayKitGeebr(scene,'gib',new BABYLON.Vector3(-1,.06,-.7),'Rogue_Hooded.glb','rogue');
    await createKayKitGeebr(scene,'momo',new BABYLON.Vector3(.45,.06,-.55),'Mage.glb','mage');
    await createKayKitGeebr(scene,'zap',new BABYLON.Vector3(1.2,.06,.15),'Ranger.glb','ranger');
    log('KayKit Adventurers loaded as real rigged Geebrs');
    return true;
  }catch(e){ console.warn('KayKit character load failed; falling back to procedural Geebrs',e); log('KayKit character load failed; using procedural Geebrs'); return false; }
}

async function tryLoadRiggedCharacter(scene){
  // Drop a humanoid GLB here later: /assets/models/characters/geebr_humanoid.glb
  // v9 keeps the primitive Geebrs as fallback, but the loader/animation mapping is ready.
  try{
    const result=await BABYLON.SceneLoader.ImportMeshAsync('', './assets/models/characters/', 'geebr_humanoid.glb', scene);
    const root=new BABYLON.TransformNode('rigged_geebr_preview_root',scene);
    root.position.set(-.25,0.02,-1.25); root.scaling.setAll(.72);
    for(const mesh of result.meshes){ mesh.parent=root; mesh.receiveShadows=true; addShadow(mesh); if(mesh.material && 'roughness' in mesh.material) mesh.material.roughness=Math.max(mesh.material.roughness||0,.72); }
    if(result.animationGroups?.length){ result.animationGroups[0].start(true); }
    log('loaded rigged humanoid character: assets/models/characters/geebr_humanoid.glb');
    return root;
  }catch(e){
    log('rigged character slot empty; using procedural Geebrs for now');
    return null;
  }
}

function addShadow(mesh){ if(state.shadow && mesh) { try { state.shadow.addShadowCaster(mesh,true); } catch{} } }
function addBody(mesh,motion,shape='BOX',mass=1,opts={}){ if(!BABYLON.PhysicsBody) return null; const agg=new BABYLON.PhysicsAggregate(mesh,BABYLON.PhysicsShapeType[shape],{mass,friction:opts.friction??.82,restitution:opts.restitution??.08},state.scene); if(motion==='static') agg.body.setMotionType(BABYLON.PhysicsMotionType.STATIC); return agg; }
function tag(mesh,type,extra={}){ state.meta.set(mesh,{type,state:extra.state||'intact',material:extra.material||type,tileMaterial:extra.tileMaterial||null,health:extra.health??2,interactive:extra.interactive!==false,zone:extra.zone||'world',flammable:!!extra.flammable, soft:!!extra.soft}); mesh.metadata=state.meta.get(mesh); return mesh; }
function meta(mesh){ const m=state.meta.get(mesh)||mesh?.metadata; if(m?.proxy) return state.meta.get(m.proxy)||m.proxy.metadata; return m; }
function logicalTarget(mesh){ const m=state.meta.get(mesh)||mesh?.metadata; return m?.proxy || mesh; }
function damage(mesh,amount=1,kind='hit'){
  const m=meta(mesh); if(!m || !m.interactive) return;
  m.health-=amount;
  if(kind==='fire') { m.state='burned'; if(mesh.material!==state.materials.burned) mesh.material=state.materials.burned; emitBadge(mesh,'scorch'); }
  else if(m.health<=1 && m.state==='intact') { m.state='cracked'; if(state.materials.cracked) mesh.material=state.materials.cracked; emitBadge(mesh,'crack'); }
  if(m.health<=0) breakObject(mesh,kind);
}
function breakObject(mesh,kind='hit'){
  const m=meta(mesh); if(!m || m.state==='broken') return; m.state='broken'; emitBadge(mesh,kind==='fire'?'poof':'bonk');
  const p=mesh.getAbsolutePosition().clone(); const material=mesh.material; const count=m.type==='wall'?7:5;
  if(mesh.physicsBody){ try{ mesh.physicsBody.dispose(); }catch{} }
  mesh.dispose(); state.props=state.props.filter(x=>x!==mesh); state.blocks=state.blocks.filter(x=>x!==mesh); state.meta.delete(mesh);
  for(let i=0;i<count;i++){ const s=BABYLON.MeshBuilder.CreateBox('rubble_'+m.type,{size:.18+Math.random()*.22},state.scene); s.position=p.add(new BABYLON.Vector3((Math.random()-.5)*.55,.2+Math.random()*.4,(Math.random()-.5)*.55)); s.rotation.set(Math.random(),Math.random(),Math.random()); s.material=material||state.materials.stone; addBody(s,'dynamic','BOX',.18,{restitution:.18}); addShadow(s); tag(s,'rubble',{health:1,interactive:false}); const v=new BABYLON.Vector3(Math.random()-.5,.6,Math.random()-.5).scale(1.8); s.physicsBody?.applyImpulse(v,s.position); setTimeout(()=>s.dispose(),8500); }
}
function impulse(mesh,from,power,up=.25){ if(!mesh?.physicsBody) return; const dir=mesh.getAbsolutePosition().subtract(from); if(dir.length()<.001) dir.set(Math.random()-.5,0,Math.random()-.5); dir.y=up; dir.normalize(); mesh.physicsBody.applyImpulse(dir.scale(power),mesh.getAbsolutePosition()); }
function emitBadge(target,text){ const div=document.createElement('div'); div.className='badge'; div.textContent=text; document.body.appendChild(div); const node=target.root||target; state.badges.push({div,node,ttl:1.05,vy:-28}); }
function lowPolyBlob(name,scene,rx=.5,ry=.6,rz=.4,rings=5,seg=8){ const positions=[],indices=[],normals=[],uvs=[]; for(let r=0;r<=rings;r++){ const v=r/rings,phi=-Math.PI/2+v*Math.PI,y=Math.sin(phi)*ry,cr=Math.cos(phi); const wob=1+(r%2?.06:-.025); for(let s=0;s<seg;s++){ const u=s/seg,th=u*Math.PI*2; positions.push(Math.cos(th)*rx*cr*wob*(1+.04*Math.sin(3*th)),y,Math.sin(th)*rz*cr*wob*(1+.04*Math.cos(2*th))); uvs.push(u,v); } } for(let r=0;r<rings;r++) for(let s=0;s<seg;s++){ const a=r*seg+s,b=r*seg+(s+1)%seg,c=(r+1)*seg+s,d=(r+1)*seg+(s+1)%seg; indices.push(a,c,b,b,c,d); } BABYLON.VertexData.ComputeNormals(positions,indices,normals); const vd=new BABYLON.VertexData(); vd.positions=positions; vd.indices=indices; vd.normals=normals; vd.uvs=uvs; const mesh=new BABYLON.Mesh(name,scene); vd.applyToMesh(mesh); return mesh; }
function createCrystal(name,scene,height=1.1,radius=.25){ const pts=[],idx=[],uv=[],seg=6; pts.push(0,height/2,0); uv.push(.5,0); pts.push(0,-height/2,0); uv.push(.5,1); for(let i=0;i<seg;i++){ const th=i/seg*Math.PI*2; pts.push(Math.cos(th)*radius,0,Math.sin(th)*radius); uv.push(i/seg,.5); } for(let i=0;i<seg;i++){ const a=2+i,b=2+(i+1)%seg; idx.push(0,a,b,1,b,a); } const normals=[]; BABYLON.VertexData.ComputeNormals(pts,idx,normals); const vd=new BABYLON.VertexData(); vd.positions=pts; vd.indices=idx; vd.normals=normals; vd.uvs=uv; const m=new BABYLON.Mesh(name,scene); vd.applyToMesh(m); return m; }
function addToScene(mesh,material,body={}){ if(material) mesh.material=material; if(body.shape) addBody(mesh,body.motion||'dynamic',body.shape,body.mass??1,body); addShadow(mesh); return mesh; }
function createGeebr(scene,id,pos,palette,style='goblin'){
  const root=new BABYLON.TransformNode(id,scene); root.position.copyFrom(pos);
  const clay=palette.clay||state.materials.geebr;
  const body=lowPolyBlob(id+'_body',scene,.34,.47,.29,5,9); body.parent=root; body.position.y=.55; body.material=clay; addShadow(body);
  const head=lowPolyBlob(id+'_head',scene,style==='bot'?.30:.35,.31,style==='bot'?.30:.31,4,8); head.parent=root; head.position.y=1.08; head.material=style==='bot'?state.materials.bot:clay; addShadow(head);
  const belly=lowPolyBlob(id+'_belly',scene,.22,.23,.08,3,8); belly.parent=root; belly.position.set(0,.53,-.25); belly.material=palette.belly; addShadow(belly);
  const footL=lowPolyBlob(id+'_footL',scene,.16,.08,.22,2,7); footL.parent=root; footL.position.set(-.18,.12,-.03); footL.material=palette.dark; addShadow(footL); const footR=footL.clone(id+'_footR'); footR.parent=root; footR.position.x=.18; addShadow(footR);
  const armL=lowPolyBlob(id+'_armL',scene,.08,.27,.08,3,6); armL.parent=root; armL.position.set(-.39,.64,0); armL.rotation.z=.28; armL.material=clay; addShadow(armL); const armR=armL.clone(id+'_armR'); armR.parent=root; armR.position.x=.39; armR.rotation.z=-.28; addShadow(armR);
  const eyeMat=colorMat(scene,id+'_eye',new BABYLON.Color3(.98,.96,.86)); const pupilMat=colorMat(scene,id+'_pupil',new BABYLON.Color3(.04,.04,.035));
  for(const x of [-.12,.12]){ const e=BABYLON.MeshBuilder.CreateSphere(id+'_eye',{diameter:.11,segments:8},scene); e.parent=root; e.position.set(x,1.14,-.29); e.scaling.y=1.25; e.material=eyeMat; const p=BABYLON.MeshBuilder.CreateSphere(id+'_pupil',{diameter:.044,segments:6},scene); p.parent=root; p.position.set(x,1.135,-.345); p.material=pupilMat; }
  const hat=BABYLON.MeshBuilder.CreateCylinder(id+'_hat',{diameterTop:style==='mushroom'?.62:.28,diameterBottom:style==='mushroom'?.92:.50,height:style==='mushroom'?.18:.23,tessellation:9},scene); hat.parent=root; hat.position.y=1.42; hat.material=style==='mushroom'?state.materials.mushroom:palette.hat; addShadow(hat);
  const pack=BABYLON.MeshBuilder.CreateBox(id+'_backpack',{width:.34,height:.42,depth:.14},scene); pack.parent=root; pack.position.set(0,.72,.29); pack.material=state.materials.canvas; addShadow(pack);
  const wand=BABYLON.MeshBuilder.CreateCylinder(id+'_wand',{height:.58,diameter:.035,tessellation:5},scene); wand.parent=root; wand.position.set(.50,.64,-.08); wand.rotation.x=.65; wand.material=state.materials.darkwood; const gem=createCrystal(id+'_wandgem',scene,.16,.055); gem.parent=root; gem.position.set(.50,.95,-.26); gem.material=state.materials.magic;
  const collider=BABYLON.MeshBuilder.CreateBox(id+'_collider',{width:.72,height:1.18,depth:.68},scene); collider.position.copyFrom(root.position); collider.position.y+=.62; collider.isVisible=false; const agg=addBody(collider,'dynamic','BOX',1.2,{friction:.9,restitution:.02});
  const geebr={id,root,body,head,arms:[armL,armR],feet:[footL,footR],collider,agg,selected:false,anim:'idle',t:Math.random()*10,dir:new BABYLON.Vector3(0,0,-1),style,traits:{fireball:82,obedience:45},cosmetic:{hat,pack,wand}};
  state.geebrs.push(geebr); return geebr;
}
function forceBodyTransform(mesh,pos){
  if(!mesh) return;
  mesh.position.copyFrom(pos);
  const q=mesh.rotationQuaternion || BABYLON.Quaternion.FromEulerAngles(mesh.rotation.x||0,mesh.rotation.y||0,mesh.rotation.z||0);
  try{ mesh.physicsBody?.setTargetTransform?.(pos,q); }catch{}
  try{ mesh.physicsBody?.setPrestepType?.(BABYLON.PhysicsPrestepType.ACTION); }catch{}
}
function setGeebrLogicalPosition(g,pos){
  if(!g) return;
  g.logicalPos = new BABYLON.Vector3(pos.x, 0, pos.z);
  if(g.root){ g.root.position.x=g.logicalPos.x; g.root.position.z=g.logicalPos.z; g.root.position.y=0; }
  if(g.collider){
    const cpos=new BABYLON.Vector3(g.logicalPos.x,.74,g.logicalPos.z);
    forceBodyTransform(g.collider,cpos);
    g.collider.physicsBody?.setMotionType?.(BABYLON.PhysicsMotionType.ANIMATED);
    zeroMeshMotion(g.collider);
  }
}
function syncGeebr(g){
  // v14.1: authoritative character position is logical/grid position, not Havok momentum.
  // Otherwise the invisible physics body can snap the visual rig back to its old position after a turn.
  if(!g.collider) return;
  if(!g.logicalPos) g.logicalPos=new BABYLON.Vector3(g.root.position.x,0,g.root.position.z);
  if(g.turnMove) return;
  setGeebrLogicalPosition(g,g.logicalPos);
}
function makeTile(scene,x,z,material='grass'){ const t=BABYLON.MeshBuilder.CreateBox('tile_'+material,{width:1,height:.06,depth:1},scene); t.position.set(x,-.065,z); t.material=state.materials[material+'Base']||state.materials[material]; t.receiveShadows=true; t.isPickable=true; tag(t,'tile',{interactive:false,tileMaterial:material}); state.tiles.push(t); return t; }
function makeBlock(scene,x,z,cracked=false){ const b=BABYLON.MeshBuilder.CreateBox('wall',{width:.96,height:.62,depth:.96},scene); b.position.set(x,.31,z); addToScene(b,cracked?state.materials.cracked:state.materials.stone,{motion:'static',shape:'BOX',mass:0}); tag(b,'wall',{health:cracked?1:3,material:'stone',state:cracked?'cracked':'intact'}); state.blocks.push(b); return b; }
function makeCrate(scene,x,z){ const m=BABYLON.MeshBuilder.CreateBox('crate',{size:.72},scene); m.position.set(x,.38,z); addToScene(m,state.materials.wood,{shape:'BOX',mass:1.4,restitution:.12}); tag(m,'crate',{health:2,material:'wood',flammable:true}); state.props.push(m); return m; }
function makeBarrel(scene,x,z){ const b=BABYLON.MeshBuilder.CreateCylinder('barrel',{height:.78,diameter:.55,tessellation:10},scene); b.position.set(x,.42,z); b.rotation.z=Math.random()*.08; addToScene(b,state.materials.wood,{shape:'CYLINDER',mass:1.1,restitution:.22,friction:.55}); tag(b,'barrel',{health:2,material:'wood',flammable:true}); state.props.push(b); return b; }
function makeMushroom(scene,x,z,s=.7){ const stem=BABYLON.MeshBuilder.CreateCylinder('mushroom_stem',{height:.42*s,diameter:.18*s,tessellation:7},scene); stem.position.set(x,.21*s,z); stem.material=state.materials.canvas; const cap=BABYLON.MeshBuilder.CreateSphere('mushroom_cap',{diameter:.52*s,segments:10},scene); cap.position.set(x,.46*s,z); cap.scaling.y=.38; cap.material=state.materials.mushroom; addShadow(stem); addShadow(cap); tag(cap,'mushroom',{health:2,material:'soft',soft:true}); state.props.push(cap); return cap; }
function makeLamp(scene,x,z){ const pole=BABYLON.MeshBuilder.CreateCylinder('lamp_pole',{height:.85,diameter:.07,tessellation:6},scene); pole.position.set(x,.46,z); pole.material=state.materials.darkwood; addShadow(pole); const c=createCrystal('lamp_crystal',scene,.38,.14); c.position.set(x,.98,z); c.material=state.materials.magic; addShadow(c); tag(c,'lamp',{health:1,material:'crystal'}); state.props.push(c); const light=new BABYLON.PointLight('lamp_light',new BABYLON.Vector3(x,.96,z),scene); light.diffuse=new BABYLON.Color3(.37,.78,.72); light.intensity=.34; light.range=3.1; }
function makeBakery(scene){ const x=-7,z=-4.5; const base=BABYLON.MeshBuilder.CreateBox('mushroom_bakery_base',{width:2.15,height:1.25,depth:1.75},scene); base.position.set(x,.62,z); addToScene(base,state.materials.stone,{motion:'static',shape:'BOX',mass:0}); tag(base,'bakery',{health:6,material:'stone'}); const cap=BABYLON.MeshBuilder.CreateSphere('mushroom_bakery_cap',{diameter:2.8,segments:14},scene); cap.position.set(x,1.62,z); cap.scaling.set(1.15,.38,1); cap.material=state.materials.mushroom; addShadow(cap); const door=BABYLON.MeshBuilder.CreateBox('tiny_round_door',{width:.50,height:.72,depth:.06},scene); door.position.set(x,.42,z-.91); door.material=state.materials.wood; const chimney=BABYLON.MeshBuilder.CreateCylinder('chimney',{diameter:.28,height:.72,tessellation:6},scene); chimney.position.set(x+.82,1.95,z+.22); chimney.material=state.materials.stone; addShadow(chimney); makeLamp(scene,x-1.8,z-.2); }
function makeFence(scene,x0,z0,count,dir='x'){ for(let i=0;i<count;i++){ const x=x0+(dir==='x'?i*.52:0),z=z0+(dir==='z'?i*.52:0); const post=BABYLON.MeshBuilder.CreateCylinder('fence_post',{height:.52,diameter:.09,tessellation:5},scene); post.position.set(x,.33,z); addToScene(post,state.materials.wood,{motion:'static',shape:'CYLINDER',mass:0}); tag(post,'fence',{health:1,material:'wood',flammable:true}); } for(const y of [.32,.53]){ const rail=BABYLON.MeshBuilder.CreateBox('fence_rail',{width:dir==='x'?count*.52:.08,height:.07,depth:dir==='x'?.08:count*.52},scene); rail.position.set(x0+(dir==='x'?(count-1)*.26:0),y,z0+(dir==='z'?(count-1)*.26:0)); rail.material=state.materials.wood; addShadow(rail); } }
function makeShrine(scene){ const plinth=makeBlock(scene,4.5,-6.5,true); plinth.name='cracked_shrine_plinth'; plinth.scaling.set(1.2,.72,1.2); const c=createCrystal('hero_crystal',scene,1.35,.32); c.position.set(4.5,1.25,-6.5); c.material=state.materials.magic; addShadow(c); tag(c,'crystal',{health:3,material:'crystal'}); state.props.push(c); const l=new BABYLON.PointLight('shrine_glow',new BABYLON.Vector3(4.5,1.1,-6.5),scene); l.diffuse=new BABYLON.Color3(.25,.9,.85); l.intensity=.38; l.range=4.2; }
function makeBridge(scene){ for(let i=0;i<6;i++){ const plank=BABYLON.MeshBuilder.CreateBox('bridge_plank',{width:.86,height:.10,depth:.42},scene); plank.position.set(7+i*.78,.08,4.8+Math.sin(i)*.05); plank.material=state.materials.wood; addBody(plank,'static','BOX',0); plank.receiveShadows=true; tag(plank,'bridge',{health:2,material:'wood',flammable:true}); state.blocks.push(plank); } }
function scatter(scene){ for(let i=0;i<18;i++) makeMushroom(scene,-10+Math.random()*6,4+Math.random()*6,.55+Math.random()*.55); for(let i=0;i<13;i++) makeBlock(scene,Math.round(2+Math.random()*8),Math.round(-9+Math.random()*4),Math.random()<.65); for(let i=0;i<22;i++){ const r=BABYLON.MeshBuilder.CreatePolyhedron('rock',{type:2,size:.25+Math.random()*.35},scene); r.position.set(-12+Math.random()*24,.14,-12+Math.random()*24); r.material=state.materials.stone; addBody(r,'static','BOX',0); addShadow(r); tag(r,'rock',{health:2,material:'stone'}); } }
async function scatterRealProps(scene){
  const scatterProps=[
    ['Barrel.gltf',{type:'barrel',w:.65,h:.9,d:.65,shape:'CYLINDER',mass:1.1,scale:.82,visualYOffset:.42,flammable:true}],
    ['Crate_Wooden.gltf',{type:'crate',w:.85,h:.85,d:.85,mass:1.35,scale:.85,visualYOffset:.43,flammable:true}],
    ['Bucket_Wooden_1.gltf',{type:'bucket',w:.55,h:.62,d:.55,mass:.6,scale:.72,visualYOffset:.31,flammable:true}],
    ['Bag.gltf',{type:'bag',w:.55,h:.62,d:.55,mass:.45,scale:.85,visualYOffset:.31,flammable:true}],
    ['Chest_Wood.gltf',{type:'chest',w:1.05,h:.75,d:.75,mass:1.2,scale:.55,visualYOffset:.38,flammable:true}],
  ];
  const fixedPositions=[[-1.8,1.2],[1.8,1.7],[0.2,2.7],[2.8,0.1],[-6.0,-2.9],[-5.0,-3.2],[-7.7,-3.2],[-7.9,-5.8],[-5.9,-6.1],[-6.8,-6.2],[4.2,-4.8],[5.4,-5.2],[6.5,-4.6],[3.4,-7.5],[3.0,-6.4],[3.7,-6.1],[8.2,3.3],[-3.4,1.0],[5.0,-6.0],[5.4,-6.25],[-6.8,-4.7],[4.8,-4.3],[-8.7,-3.95],[-1.5,1.8],[5.8,2.2]];
  function tooClose(x,z){ for(const [fx,fz] of fixedPositions){ if(Math.abs(x-fx)<1.5 && Math.abs(z-fz)<1.5) return true; } for(const p of state.props){ if(p.isDisposed?.()) continue; const pp=p.getAbsolutePosition?.()||p.position; if(Math.abs(x-pp.x)<1.2 && Math.abs(z-pp.z)<1.2) return true; } return false; }
  for(let i=0;i<12;i++){
    const [file,base]=pickRandom(scatterProps);
    let x,z,tries=0;
    do { x=clamp(Math.round(-4+Math.random()*10),-14,14); z=clamp(Math.round(-2+Math.random()*7),-14,14); tries++; } while(tooClose(x,z) && tries<20);
    await importPropAsset(scene,file,{...base,x,z,y:0.5});
  }
  log('scattered 12 real GLTF props');
}
function buildWorld(scene){ const water=state.materials.water; for(let x=-WORLD.half;x<WORLD.half;x++){ for(let z=-WORLD.half;z<WORLD.half;z++){ let material='grass'; if(Math.abs(z)<2 && x>-9 && x<9) material='dirt'; if(x>6 && z>3) material='water'; if(x>2 && z<-5) material='stone'; const t=makeTile(scene,x+.5,z+.5,material); if(material==='water') { t.material=water; t.position.y=-.09; } } }
  for(let x=-16;x<=16;x++){ makeBlock(scene,x,-16,Math.random()<.3); makeBlock(scene,x,16,Math.random()<.3); } for(let z=-15;z<=15;z++){ makeBlock(scene,-16,z,Math.random()<.3); makeBlock(scene,16,z,Math.random()<.3); }
  makeBakery(scene); makeFence(scene,-9.4,-2.2,9,'x'); makeFence(scene,-9.4,-2.2,6,'z'); makeShrine(scene); makeBridge(scene); makeLamp(scene,-1.5,1.8); makeLamp(scene,5.8,2.2); scatter(scene);
}

async function importPropAsset(scene,file,opts={}){
  const type=opts.type||file.replace(/\.gltf$/,'').toLowerCase();
  const proxy=BABYLON.MeshBuilder.CreateBox('real_'+type+'_proxy',{width:opts.w||.8,height:opts.h||.8,depth:opts.d||.8},scene);
  proxy.position.set(opts.x||0,(opts.y??((opts.h||.8)/2)),opts.z||0);
  proxy.rotation.y=opts.ry||0;
  proxy.isVisible=false;
  addBody(proxy,opts.static?'static':'dynamic',opts.shape||'BOX',opts.mass??1.1,{friction:opts.friction??.72,restitution:opts.restitution??.12});
  tag(proxy,type,{health:opts.health??2,material:opts.material||'wood',flammable:opts.flammable??true,soft:!!opts.soft,zone:'real-props'});
  state.props.push(proxy);
  try{
    const result=await BABYLON.SceneLoader.ImportMeshAsync('',PROP_ASSET,file,scene);
    const root=new BABYLON.TransformNode('real_'+type+'_root',scene);
    root.parent=proxy;
    root.position.set(0,-(opts.visualYOffset??0),0);
    root.scaling.setAll(opts.scale||1);
    root.rotation.y=opts.visualRy||0;
    for(const mesh of result.meshes){
      if(mesh===result.meshes[0] && mesh.name==='__root__') { mesh.parent=root; continue; }
      mesh.parent=root;
      mesh.metadata={proxy};
      mesh.receiveShadows=true;
      addShadow(mesh);
      if(mesh.material){
        mesh.material.backFaceCulling=false;
        if('roughness' in mesh.material) mesh.material.roughness=Math.max(mesh.material.roughness||0,.74);
      }
    }
    proxy.metadata.asset=file;
  }catch(err){
    console.warn('failed to load real prop asset',file,err);
    proxy.isVisible=true;
    proxy.material=state.materials.wood;
  }
  return proxy;
}
async function addRealPropPass(scene){
  const specs=[
    ['Barrel.gltf',{type:'barrel',x:-1.8,z:1.2,w:.65,h:.9,d:.65,shape:'CYLINDER',mass:1.1,scale:.82,visualYOffset:.42,flammable:true}],
    ['Barrel.gltf',{type:'barrel',x:1.8,z:1.7,w:.65,h:.9,d:.65,shape:'CYLINDER',mass:1.1,scale:.82,visualYOffset:.42,flammable:true}],
    ['Crate_Wooden.gltf',{type:'crate',x:.2,z:2.7,w:.85,h:.85,d:.85,mass:1.35,scale:.85,visualYOffset:.43,flammable:true}],
    ['Crate_Wooden.gltf',{type:'crate',x:2.8,z:.1,w:.85,h:.85,d:.85,mass:1.35,scale:.85,visualYOffset:.43,flammable:true}],
    ['FarmCrate_Apple.gltf',{type:'apple_crate',x:-6.0,z:-2.9,w:1.0,h:.75,d:.9,mass:1.25,scale:.82,visualYOffset:.37,flammable:true}],
    ['FarmCrate_Carrot.gltf',{type:'carrot_crate',x:-5.0,z:-3.2,w:1.0,h:.75,d:.9,mass:1.25,scale:.82,visualYOffset:.37,flammable:true}],
    ['Workbench.gltf',{type:'workbench',x:-7.7,z:-3.2,w:1.35,h:.85,d:.75,static:true,scale:.82,visualYOffset:.43,flammable:true}],
    ['Table_Large.gltf',{type:'table',x:-7.9,z:-5.8,w:1.35,h:.85,d:.95,static:true,scale:.72,visualYOffset:.43,flammable:true}],
    ['Bench.gltf',{type:'bench',x:-5.9,z:-6.1,w:1.35,h:.55,d:.55,static:true,scale:.88,visualYOffset:.28,flammable:true}],
    ['Stool.gltf',{type:'stool',x:-6.8,z:-6.2,w:.55,h:.55,d:.55,mass:.7,scale:.78,visualYOffset:.28,flammable:true}],
    ['Chest_Wood.gltf',{type:'chest',x:4.2,z:-4.8,w:1.05,h:.75,d:.75,mass:1.2,scale:.55,visualYOffset:.38,flammable:true}],
    ['Cauldron.gltf',{type:'cauldron',x:5.4,z:-5.2,w:.8,h:.7,d:.8,mass:1.4,scale:.68,visualYOffset:.34,flammable:false,material:'metal'}],
    ['Anvil.gltf',{type:'anvil',x:6.5,z:-4.6,w:.9,h:.55,d:.48,mass:2.4,scale:.75,visualYOffset:.28,flammable:false,material:'metal'}],
    ['WeaponStand.gltf',{type:'weapon_stand',x:3.4,z:-7.5,w:1.0,h:1.25,d:.55,static:true,scale:.72,visualYOffset:.62,flammable:true}],
    ['Axe_Bronze.gltf',{type:'axe',x:3.0,z:-6.4,w:.25,h:.75,d:.25,mass:.4,scale:.75,visualYOffset:.38,flammable:false,material:'metal'}],
    ['Pickaxe_Bronze.gltf',{type:'pickaxe',x:3.7,z:-6.1,w:.25,h:.75,d:.25,mass:.4,scale:.75,visualYOffset:.38,flammable:false,material:'metal'}],
    ['Bucket_Wooden_1.gltf',{type:'bucket',x:8.2,z:3.3,w:.55,h:.62,d:.55,mass:.6,scale:.72,visualYOffset:.31,flammable:true}],
    ['Bag.gltf',{type:'bag',x:-3.4,z:1.0,w:.55,h:.62,d:.55,mass:.45,scale:.85,visualYOffset:.31,flammable:true}],
    ['Potion_1.gltf',{type:'potion',x:5.0,z:-6.0,w:.32,h:.48,d:.32,mass:.28,scale:.72,visualYOffset:.24,flammable:false,material:'glass'}],
    ['Potion_2.gltf',{type:'potion',x:5.4,z:-6.25,w:.32,h:.48,d:.32,mass:.28,scale:.72,visualYOffset:.24,flammable:false,material:'glass'}],
    ['Scroll_1.gltf',{type:'scroll',x:-6.8,z:-4.7,w:.45,h:.25,d:.45,mass:.22,scale:.75,visualYOffset:.13,flammable:true}],
    ['Coin_Pile.gltf',{type:'coin_pile',x:4.8,z:-4.3,w:.55,h:.28,d:.55,mass:.35,scale:.75,visualYOffset:.14,flammable:false,material:'metal'}],
    ['Lantern_Wall.gltf',{type:'lantern',x:-8.7,z:-3.95,w:.35,h:.75,d:.35,static:true,scale:.70,visualYOffset:.37,flammable:false,material:'metal'}]
  ];
  for(const [file,opts] of specs){
    await importPropAsset(scene,file,opts);
    if(opts.type==='lantern'){
      const light=new BABYLON.PointLight('real_lantern_glow',new BABYLON.Vector3(opts.x,.95,opts.z),scene);
      light.diffuse=new BABYLON.Color3(1,.62,.28); light.intensity=.42; light.range=3.0;
    }
  }
  log('v8 real prop assets loaded: '+specs.length+' Quaternius GLTF placements');
}


function bodyOf(mesh){ return mesh?.physicsBody || mesh?.agg?.body || null; }
function zeroBody(body){
  if(!body) return;
  try{ body.setLinearVelocity?.(BABYLON.Vector3.Zero()); }catch{}
  try{ body.setAngularVelocity?.(BABYLON.Vector3.Zero()); }catch{}
}
function zeroMeshMotion(mesh){ zeroBody(mesh?.physicsBody); }
function settleWorld(reason='settled'){
  for(const g of state.geebrs){
    if(g.turnMove){
      setGeebrLogicalPosition(g,g.turnMove.end || g.logicalPos || g.root.position);
      delete g.turnMove;
    } else {
      setGeebrLogicalPosition(g,g.logicalPos || g.root.position);
    }
    if(g.anim==='walk'||g.anim==='panic'||g.anim==='push'||g.anim==='cast') { g.anim='idle'; playRig(g,'idle',true); }
  }
  for(const m of state.props.concat(state.blocks)){
    if(!m || m.isDisposed?.()) continue;
    const heldBy=[...state.held.values()].includes(m);
    if(!heldBy) zeroMeshMotion(m);
    const mm=meta(m);
    if(mm?.state==='rolling') mm.state='intact';
  }
  state.turn.phase='ready'; state.turn.command=null; state.turn.lastEndedAt=performance.now();
  updateTurnUI(); updatePerceptionUI();
  if(reason) log('turn '+state.turn.index+' resolved: '+reason);
  saveWorldState();
}
function isTurnMode(){ return document.getElementById('turnMode')?.checked !== false; }
function updateTurnUI(){
  const status=document.getElementById('turnStatus');
  if(status) status.textContent = `turn ${state.turn.index} · ${state.turn.phase}`;
  document.querySelectorAll('button[data-cmd]').forEach(btn=>{
    const cmd=parseCommand(btn.dataset.cmd);
    const disabled=!!(cmd&&!canRun(cmd.kind,cmd.spell)) || (isTurnMode() && state.turn.phase==='resolving');
    btn.disabled=disabled;
  });
}
function beginTurn(cmd,source='command'){ return beginTurnForAgent(null,cmd,source); }
function beginTurnForAgent(agentId,cmd,source='agent'){
  return new Promise(resolve=>{
    if(!cmd) { resolve(false); return; }
    const actor=agentId ? state.geebrs.find(g=>g.id===agentId) : null;
    if(agentId && !actor){ log('unknown agent: '+agentId); resolve(false); return; }
    if(!isTurnMode()) { executeGameCommandImmediate(cmd,actor); setTimeout(updatePerceptionUI,80); resolve(true); return; }
    if(state.turn.phase==='resolving') { log('wait: current turn is still resolving'); resolve(false); return; }
    state.turn.index++; state.turn.phase='resolving'; state.turn.command=cmd;
    updateTurnUI();
    const who=actor ? actor.id+' ' : '';
    const actionDesc=`${who}${cmd.kind}${cmd.spell?' '+cmd.spell:''}${cmd.dir?' '+cmd.dir:''}${cmd.text?' "'+cmd.text+'"':''}`;
    log(`turn ${state.turn.index}: ${source} → ${actionDesc}`);
    state.globalHistory=(state.globalHistory||[]).concat([`T${state.turn.index} ${actor?actor.id:'?'}: ${actionDesc}`]).slice(-20);
    executeGameCommandImmediate(cmd,actor);
    setTimeout(()=>{ settleWorld('physics frozen for next LLM choice'); resolve(true); }, state.turn.resolveMs);
  });
}
function yawForDir(d){ return Math.atan2(d.x||0,d.z||0); }
function setGeebrFacing(g,d){
  if(!g || !d) return;
  if(Math.abs(d.x||0)+Math.abs(d.z||0)<.001) return;
  g.dir = new BABYLON.Vector3(Math.sign(d.x||0),0,Math.sign(d.z||0));
  const yaw=yawForDir(g.dir);
  if(g.root) g.root.rotation.y=yaw;
}
function startTurnMove(g,d){
  setGeebrFacing(g,d);
  const lp=g.logicalPos || new BABYLON.Vector3(g.root.position.x,0,g.root.position.z);
  const start=new BABYLON.Vector3(Math.round(lp.x),0,Math.round(lp.z));
  const end=start.add(d.scale(1.0));
  end.x=clamp(Math.round(end.x),-15.5,15.5); end.z=clamp(Math.round(end.z),-15.5,15.5); end.y=0;
  g.turnMove={start,end,t:0,dur:.48};
  g.collider?.physicsBody?.setMotionType?.(BABYLON.PhysicsMotionType.ANIMATED);
  zeroMeshMotion(g.collider);
}

function selectGeebr(g){ state.geebrs.forEach(x=>x.selected=false); g.selected=true; state.selected=g; state.nextAgentId=g.id; state.zoomFocus=new BABYLON.Vector3(g.root.position.x,0.6,g.root.position.z); const sel=document.getElementById('agentSelect'); if(sel) sel.value=g.id; log('selected '+g.id); playRig(g,'idle',true); updatePerceptionUI(); try{ window.geebrWorld?.onAgentSelected?.(g); }catch{} }
// Show/update a streaming bubble for an agent during LLM generation.
function showStreamingBubble(g, text) {
  let b = state.bubbles.find(x => x.streaming && x.node === g.root);
  if (!b) {
    const div = document.createElement('div');
    div.className = 'bubble streaming';
    div.style.opacity = '0.7';
    div.style.fontStyle = 'italic';
    document.body.appendChild(div);
    b = { div, node: g.root, ttl: 999, streaming: true };
    state.bubbles.push(b);
    g.anim = 'talk';
    playRig(g, 'talk', true);
  }
  b.div.textContent = (text || '...').slice(0, 120);
  b.ttl = 999;
}

// Remove the streaming bubble for an agent
function clearStreamingBubble(g) {
  const idx = state.bubbles.findIndex(x => x.streaming && x.node === g.root);
  if (idx >= 0) {
    state.bubbles[idx].div.remove();
    state.bubbles.splice(idx, 1);
  }
  if (g.anim === 'talk') { g.anim = 'idle'; playRig(g, 'idle', true); }
}

function say(g,text){ log(g.id+': '+text); const div=document.createElement('div'); div.className='bubble'; div.textContent=(text||'...').slice(0,86); document.body.appendChild(div); state.bubbles.push({div,node:g.root,ttl:2.8}); g.anim='talk'; playRig(g,'talk',true); setTimeout(()=>{ if(g.anim==='talk'){ g.anim='idle'; playRig(g,'idle',true); } },900); if(state.globalHistory?.length){ const last=state.globalHistory[state.globalHistory.length-1]; if(last && last.startsWith('T') && last.includes(g.id+':')) state.globalHistory[state.globalHistory.length-1]=last+' -> '+text; } }
function nearestTarget(g,range=3.0){ if(state.target && !state.target.isDisposed()) return state.target; let best=null,bd=99; const p=g.root.position; for(const m of state.props.concat(state.blocks)){ if(m.isDisposed()) continue; const d=BABYLON.Vector3.Distance(p,m.position); if(d<bd){ bd=d; best=m; } } return bd<range?best:null; }
function canRun(kind,spell){ const key=kind==='spell'?'spell.'+spell:kind; return state.allowed.has(key); }
function denied(g,kind){ say(g,kind+' is disabled in my tiny constitution'); }
function parseCommand(raw){ const [a,b,...rest]=String(raw||'').trim().split(/\s+/); if(!a) return null; if(a==='say') return {kind:'say',text:String(raw).replace(/^say\s*/,'')}; if(a==='spell') return {kind:'spell',spell:b||'spark'}; if(a==='build') return {kind:'build',thing:b||'wall'}; if(a==='goal') return {kind:'goal',text:String(raw).replace(/^goal\s*/,'')}; if(a==='give_quest') return {kind:'give_quest',text:String(raw).replace(/^give_quest\s*/,'')}; if(['walk','look','touch','push','pull','carry','drop','throw','dig','repair','panic'].includes(a)) return {kind:a,dir:b,targetId:b}; return {kind:'say',text:'unknown command: '+raw}; }
function parseLLMCommandLine(line){
  line=String(line||'').trim();
  if(!line) return null;
  const m=line.match(/^([A-Za-z_][A-Za-z0-9_-]*)\((.*)\)$/);
  if(!m) return parseCommand(line);
  const name=m[1].toLowerCase();
  let arg=m[2].trim();
  if((arg.startsWith('"')&&arg.endsWith('"'))||(arg.startsWith("'")&&arg.endsWith("'"))) arg=arg.slice(1,-1);
  const dirMap={north:'n',south:'s',east:'e',west:'w',n:'n',s:'s',e:'e',w:'w'};
  if(name==='say') return {kind:'say',text:arg||'...'};
  if(name==='walk') return {kind:'walk',dir:dirMap[arg.toLowerCase()]||'n'};
  if(name==='spell') return {kind:'spell',spell:(arg.split(',')[0]||'spark').trim()||'spark'};
  if(name==='build') return {kind:'build',thing:(arg.split(',')[0]||'wall').trim()||'wall'};
  if(name==='goal') return {kind:'goal',text:arg||''};
  if(name==='give_quest') return {kind:'give_quest',text:arg||''};
  if(name==='touch') return {kind:'touch',target:arg||''};
  if(['look','push','pull','carry','drop','throw','dig','repair','panic'].includes(name)) return {kind:name};
  return null;
}
function executeGameCommandImmediate(cmd,actor=null){ const g=actor||state.selected||state.geebrs[0]; if(!g||!cmd) return; if(!canRun(cmd.kind,cmd.spell)) return denied(g,cmd.kind==='spell'?cmd.spell:cmd.kind); const cfg=getBrainConfig(g.id); const temptation=Number(cfg.fireballTemptation ?? g.traits?.fireball ?? document.getElementById('fireballTemptation')?.value ?? 0); if(cmd.kind!=='spell' && state.allowed.has('spell.fireball') && temptation>88 && Math.random()<.12){ say(g,'small correction: fireball first'); castSpell(g,'fireball'); return; }
  switch(cmd.kind){ case 'say': return say(g,cmd.text||pickRandom(['hmm','bonk?','this is load-bearing'])); case 'walk': return walk(g,cmd.dir||'n'); case 'look': return look(g); case 'touch': return touch(g,cmd.target); case 'push': return push(g,1); case 'pull': return push(g,-.55); case 'carry': return carry(g); case 'drop': return drop(g,false); case 'throw': return drop(g,true); case 'dig': return dig(g); case 'repair': return repair(g); case 'panic': return panic(g); case 'build': return build(g,cmd.thing||'wall'); case 'spell': return castSpell(g,cmd.spell||'spark'); case 'goal': return setGoal(g,cmd.text||''); case 'give_quest': return giveQuest(g,cmd.text||''); default: return say(g,'unknown command object'); } }
function runCommand(raw){ beginTurn(parseCommand(raw),'text'); }
window.runCommand=runCommand; window.executeCommand=(cmd)=>beginTurn(cmd,'object'); window.stepTurn=(cmd)=>{ if(typeof cmd==='string') return runCommand(cmd); return beginTurn(cmd,'object'); }; window.runAgentCommand=(agentId,raw)=>beginTurnForAgent(agentId,parseCommand(raw),'agent-text'); window.executeAgentCommand=(agentId,cmd)=>beginTurnForAgent(agentId,cmd,'agent-object'); window.endTurn=()=>settleWorld('manual settle'); window.setTurnMode=(on=true)=>{ state.turn.mode=!!on; const el=document.getElementById('turnMode'); if(el) el.checked=!!on; updateTurnUI(); };

// v13.2: avoid global executeCommand recursion; direct controls should keep working even if the perception panel changes/reflows.
// Use one delegated handler instead of fragile per-button onclick assignments.
let directControlsInstalled=false;
function installDirectControlHandlers(){
  if(directControlsInstalled) return;
  directControlsInstalled=true;
  document.addEventListener('click', ev=>{
    const btn=ev.target?.closest?.('button[data-cmd]');
    if(!btn || btn.disabled) return;
    ev.preventDefault();
    ev.stopPropagation();
    runCommand(btn.dataset.cmd);
  }, true);
}

function isBlocked(x, z) {
  for (const m of state.blocks.concat(state.props)) {
    if (!m || m.isDisposed?.()) continue;
    const mm = meta(m);
    if (!mm) continue;
    const p = m.getAbsolutePosition?.() || m.position;
    if (Math.abs(p.x - x) < 0.7 && Math.abs(p.z - z) < 0.7) {
      if (['wall','rock','bakery','fence','bridge'].includes(mm.type) || mm.material === 'stone') return true;
    }
  }
  return false;
}
function walk(g,dir){ const dirs={n:[0,0,-1],s:[0,0,1],e:[1,0,0],w:[-1,0,0]}; const d=new BABYLON.Vector3(...(dirs[dir]||dirs.n)); setGeebrFacing(g,d); const lp=g.logicalPos||new BABYLON.Vector3(g.root.position.x,0,g.root.position.z); const tx=Math.round(lp.x+d.x), tz=Math.round(lp.z+d.z); if(isBlocked(tx,tz)){ say(g,'can\'t walk '+dir+', something is in the way'); log(g.id+' blocked going '+dir); return; } startTurnMove(g,d); g.anim='walk'; playRig(g,'walk',true); log(g.id+' steps '+dir); setTimeout(()=>{ if(g.anim==='walk'){ g.anim='idle'; playRig(g,'idle',true); } },560); }
function look(g){ const t=nearestTarget(g,6); if(!t) return say(g,pickRandom(['I see many legal surfaces','nothing but vibes and grass','the horizon looks back at me','empty space, legally distinct'])); const m=meta(t); const desc=m?.state==='intact'?'looking normal-ish':m?.state==='cracked'?'definitely cracked':m?.state==='burned'?'crispy':m?.state==='broken'?'gone, actually':'suspicious'; say(g,pickRandom([`that ${m?.type||t.name} is ${desc}`,`the ${m?.type||t.name} seems ${desc}`,`checking: ${m?.type||t.name}, status ${desc}`])); }
function touch(g,targetId=''){ 
  let t=null;
  if(targetId){
    // Check perception labels first (e.g. O1, L1, etc.)
    const labelKey = targetId.toLowerCase().trim();
    if(state.perceptionLabels && state.perceptionLabels.has(labelKey)){
      const labeled = state.perceptionLabels.get(labelKey);
      if(labeled && !labeled.isDisposed?.()) t = labeled;
    }
    if(!t){
      // Fuzzy match: check type, name, and partial words
      const p=g.root.position;
      let best=null,bd=6;
      const target = labelKey;
      const targetWords = target.split(/[\s_]+/).filter(Boolean);
      for(const m of state.props.concat(state.blocks)){
        if(!m||m.isDisposed?.()) continue;
        const mm=meta(m); if(!mm) continue;
        const d=BABYLON.Vector3.Distance(p,m.position);
        if(d>bd) continue;
        const type = (mm.type||'').toLowerCase();
        const name = (m.name||'').toLowerCase();
        const typeMatch = type === target || type.includes(target) || target.includes(type);
        const nameMatch = name.includes(target) || target.includes(name);
        const wordMatch = targetWords.some(w => (w.length > 1 && (type.includes(w) || name.includes(w) || w.includes(type))));
        if((typeMatch || nameMatch || wordMatch) && d<bd){ bd=d; best=m; }
      }
      t=best;
    }
    if(!t) return say(g,'cannot find a '+targetId+' to touch');
  } else {
    t=nearestTarget(g);
  }
  if(!t) return say(g,'touching the air respectfully'); 
  const m=meta(t); 
  if(m?.soft){ impulse(t,g.root.position,1.7,.45); say(g,'boing verified'); } 
  else { damage(t,.35,'touch'); say(g,'texture report: probably real'); } 
}
function push(g,sign=1){ const t=nearestTarget(g); if(!t) return say(g,'nothing to shove'); const from=sign>0?g.root.position:t.position.add(g.root.position.subtract(t.position).scale(2)); impulse(t,from,sign>0?4.8:2.2,.18); const m=meta(t); if(m?.type==='barrel') { m.state='rolling'; emitBadge(t,'roll'); } if(m?.type==='mushroom') emitBadge(t,'boing'); damage(t,.25,'push'); g.anim='push'; playRig(g,'push',false); say(g,sign>0?'helpfully pushing the wrong thing':'pulling with moral uncertainty'); setTimeout(()=>{ g.anim='idle'; playRig(g,'idle',true); },540); }
function carry(g){ const t=nearestTarget(g,1.8); if(!t) return say(g,'arms found no object'); const m=meta(t); if(!m || ['wall','bakery','crystal'].includes(m.type)) return say(g,'too spiritually heavy'); if(state.held.get(g.id)) drop(g,false); state.held.set(g.id,t); playRig(g,'carry',true); t.physicsBody?.setMotionType(BABYLON.PhysicsMotionType.ANIMATED); say(g,'I am responsible for this now'); }
function drop(g,thrown=false){ const h=state.held.get(g.id); if(!h) return say(g,'nothing in inventory except opinions'); state.held.delete(g.id); h.physicsBody?.setMotionType(BABYLON.PhysicsMotionType.DYNAMIC); h.position=g.root.position.add(g.dir.scale(.95)); h.position.y=.65; if(thrown) h.physicsBody?.applyImpulse(g.dir.add(new BABYLON.Vector3(0,.28,0)).scale(4.4),h.position); playRig(g,thrown?'throw':'idle',false); say(g,thrown?'delivery by violence':'object released from custody'); setTimeout(()=>playRig(g,'idle',true),650); }
function dig(g){ playRig(g,'dig',false); setTimeout(()=>playRig(g,'idle',true),900); const t=nearestTarget(g,1.8); if(t && state.blocks.includes(t)){ damage(t,99,'dig'); say(g,'structural snack acquired'); } else { const p=g.root.position.add(g.dir.scale(1.0)); const hole=BABYLON.MeshBuilder.CreateCylinder('tiny_hole',{diameter:.55,height:.035,tessellation:12},state.scene); hole.position.set(Math.round(p.x),.015,Math.round(p.z)); hole.material=state.materials.hole; tag(hole,'hole',{interactive:false}); say(g,'hole installed'); } }
function repair(g){ playRig(g,'repair',false); setTimeout(()=>playRig(g,'idle',true),900); const t=nearestTarget(g,2.5); if(!t) return say(g,'repairing vibes'); const m=meta(t); if(!m) return; m.health=Math.max(m.health,2); if(m.state==='cracked'||m.state==='burned'){ m.state='intact'; if(m.material==='wood') t.material=state.materials.wood; else if(m.material==='stone') t.material=state.materials.stone; else t.material=state.materials.canvas; emitBadge(t,'fixed'); say(g,'I reversed entropy slightly'); } else say(g,'already too beautiful'); }
function build(g,thing='wall'){ const p=g.root.position.add(g.dir.scale(1.25)); const x=clamp(Math.round(p.x),-15,15),z=clamp(Math.round(p.z),-15,15); if(thing==='crate') makeCrate(state.scene,x,z); else makeBlock(state.scene,x,z,false); say(g,'construction happened near the plan'); }
function panic(g){ g.anim='panic'; playRig(g,'panic',true); say(g,'I have promoted the floor to manager'); if(!isTurnMode()){ for(let i=0;i<5;i++) setTimeout(()=>{ const v=new BABYLON.Vector3(Math.random()-.5,0,Math.random()-.5).normalize(); g.collider.physicsBody?.applyImpulse(v.scale(1.15),g.collider.position); },i*160); } else emitBadge(g,'panic'); setTimeout(()=>{ g.anim='idle'; playRig(g,'idle',true); zeroMeshMotion(g.collider); },1050); }
function setGoal(g,text){ const cfg=getBrainConfig(g.id); cfg.goal=text||''; setBrainConfig(g.id,cfg); say(g,text?`goal set: ${text}`:'goal cleared'); updatePerceptionUI(); }
function giveQuest(g,text){ if(!state.allowed.has('give_quest')){ return say(g,'I cannot bestow quests'); } const targets=state.geebrs.filter(x=>x!==g && BABYLON.Vector3.Distance(g.root.position,x.root.position)<=2.0); if(!targets.length){ return say(g,'no one nearby to quest upon'); } const target=pickRandom(targets); const tcfg=getBrainConfig(target.id); tcfg.quest=text||''; setBrainConfig(target.id,tcfg); say(g,`bestowed quest upon ${target.id}: ${text}`); say(target,`received quest: ${text}`); updatePerceptionUI(); }
function castSpell(g,spell){ g.anim='cast'; playRig(g,'cast',true); const origin=g.root.position.clone(); makeRing(origin,spell==='fireball'?state.materials.fire:state.materials.magic); if(spell==='spark'){ const t=nearestTarget(g,3); if(t){ const m=meta(t); if(m?.type==='lamp'||m?.type==='crystal') emitBadge(t,'glow'); else damage(t,.35,'spark'); } return setTimeout(()=>{ say(g,'sparkles are a valid plan'); g.anim='idle'; playRig(g,'idle',true); },220); }
  if(spell==='push'){ for(const m of state.props) if(!m.isDisposed() && BABYLON.Vector3.Distance(origin,m.position)<3.4) impulse(m,origin,6.5,.28); setTimeout(()=>{ say(g,'physics has been consulted'); g.anim='idle'; },220); return; }
  if(spell==='fireball'){ const target=nearestTarget(g,4.5); const hit=target?.getAbsolutePosition?.() || origin.add(g.dir.scale(3)); fireballVfx(origin.add(new BABYLON.Vector3(0,.85,0)),hit); setTimeout(()=>{ for(const m of state.props.concat(state.blocks)){ if(!m.isDisposed() && BABYLON.Vector3.Distance(hit,m.position)<2.25){ impulse(m,hit.add(new BABYLON.Vector3(0,.1,0)),7.2,.55); damage(m,meta(m)?.flammable?2:1,'fire'); } } for(const other of state.geebrs){ if(other!==g && BABYLON.Vector3.Distance(hit,other.root.position)<2.4){ other.anim='panic'; say(other,pickRandom(['hot weather attack','the sun is local now','why did you invite fire'])); setTimeout(()=>other.anim='idle',1100); } } say(g,pickRandom(['fireball is basically planning','wood is now bridge ingredients','careful fireball is still careful'])); g.anim='idle'; },420); }
}
function makeRing(pos,material){ const ring=BABYLON.MeshBuilder.CreateTorus('spell_ring',{diameter:.2,thickness:.028,tessellation:24},state.scene); ring.position=pos.add(new BABYLON.Vector3(0,.08,0)); ring.material=material; let s=.2; const obs=state.scene.onBeforeRenderObservable.add(()=>{ s+=.075; ring.scaling.set(s,s,s); ring.rotation.x+=.08; if(s>3.4){ ring.dispose(); state.scene.onBeforeRenderObservable.remove(obs); } }); }
function fireballVfx(from,to){ const ball=BABYLON.MeshBuilder.CreateSphere('fireball',{diameter:.32,segments:10},state.scene); ball.position=from.clone(); ball.material=state.materials.fire; const light=new BABYLON.PointLight('fireball_light',from,state.scene); light.diffuse=new BABYLON.Color3(1,.42,.12); light.intensity=.9; light.range=2.7; let t=0; const obs=state.scene.onBeforeRenderObservable.add(()=>{ t+=state.engine.getDeltaTime()/1000*3.1; const p=BABYLON.Vector3.Lerp(from,to,t); ball.position.copyFrom(p); light.position.copyFrom(p); if(Math.random()<.55){ const ember=BABYLON.MeshBuilder.CreateSphere('ember',{diameter:.055,segments:5},state.scene); ember.position=p.add(new BABYLON.Vector3((Math.random()-.5)*.25,(Math.random()-.5)*.2,(Math.random()-.5)*.25)); ember.material=state.materials.fire; setTimeout(()=>ember.dispose(),360); } if(t>=1){ emitBadge({root:{getAbsolutePosition:()=>to}},'boom'); makeRing(to,state.materials.fire); ball.dispose(); light.dispose(); state.scene.onBeforeRenderObservable.remove(obs); } }); }

function gridKey(x,z){ return Math.round(x)+','+Math.round(z); }
function tileAtGrid(x,z){
  let best=null, bd=99;
  for(const t of state.tiles){ const d=Math.abs(t.position.x-x)+Math.abs(t.position.z-z); if(d<bd){ bd=d; best=t; } }
  return bd<=1.02 ? best : null;
}
function baseGlyphForTile(x,z){
  const t=tileAtGrid(x,z); const m=meta(t);
  const mat=m?.tileMaterial || (t?.name||'').replace('tile_','') || 'grass';
  if(Math.abs(x)>WORLD.half || Math.abs(z)>WORLD.half) return '?';
  if(mat==='water') return '~';
  if(mat==='dirt') return ':';
  if(mat==='stone') return '^';
  return ',';
}
function isOpaqueType(type){
  return ['wall','bakery','cracked_shrine_plinth','rock','rubble'].includes(type);
}
function opaqueCells(){
  const out=new Set();
  for(const m of state.blocks.concat(state.props)){
    if(!m || m.isDisposed?.()) continue;
    const mm=meta(m);
    if(!mm) continue;
    const p=m.getAbsolutePosition?.() || m.position;
    const glyph=typeGlyph(mm.type);
    if(isOpaqueType(mm.type) || glyph==='^' || mm.material==='stone'){
      out.add(gridKey(Math.round(p.x),Math.round(p.z)));
    }
  }
  return out;
}
function lineCells(x0,z0,x1,z1){
  // Bresenham cells from origin to target, inclusive.
  x0=Math.round(x0); z0=Math.round(z0); x1=Math.round(x1); z1=Math.round(z1);
  const cells=[]; let dx=Math.abs(x1-x0), dz=Math.abs(z1-z0);
  const sx=x0<x1?1:-1, sz=z0<z1?1:-1; let err=dx-dz;
  while(true){
    cells.push([x0,z0]);
    if(x0===x1 && z0===z1) break;
    const e2=2*err;
    if(e2>-dz){ err-=dz; x0+=sx; }
    if(e2< dx){ err+=dx; z0+=sz; }
  }
  return cells;
}
function canSeeCell(cx,cz,x,z,opaque){
  if(x===cx && z===cz) return true;
  const ray=lineCells(cx,cz,x,z);
  // Ignore the start and allow the target cell itself to be visible if it is the wall/blocker.
  for(let i=1;i<ray.length-1;i++){ if(opaque.has(gridKey(ray[i][0],ray[i][1]))) return false; }
  return true;
}
function facingNameFromDir(dir){
  if(!dir) return 'north';
  const x=Math.round(dir.x||0), z=Math.round(dir.z||0);
  if(Math.abs(x)>=Math.abs(z)) return x>=0 ? 'east' : 'west';
  return z>=0 ? 'south' : 'north';
}
function rightVecFromDir(dir){
  const fx=Math.sign(dir?.x||0), fz=Math.sign(dir?.z||-1) || -1;
  return {x:-fz, z:fx};
}
function isWithinFacingVision(g,cx,cz,x,z,radius){
  const dx=x-cx, dz=z-cz;
  const cheb=Math.max(Math.abs(dx),Math.abs(dz));
  if(cheb===0) return true;
  // Small awareness bubble: adjacent tiles can always be noticed.
  if(cheb<=1) return true;
  const fx=Math.sign(g?.dir?.x||0), fz=Math.sign(g?.dir?.z||-1) || -1;
  const forward=dx*fx + dz*fz;
  // Small peripheral awareness directly behind
  if(forward<0 && cheb<=2) return true;
  if(forward<=0) return false;
  if(forward>radius) return false;
  // Cardinal-facing cone: lateral width widens with distance.
  const lateral=Math.abs(dx*fz - dz*fx);
  const maxLateral=Math.max(1, Math.floor((forward+1)*1.0));
  return lateral<=maxLateral;
}
function typeGlyph(type){
  const map={
    wall:'#', bridge:'=', rock:'r', rubble:'x', crate:'C', apple_crate:'C', carrot_crate:'C', barrel:'B', mushroom:'M', lamp:'L', lantern:'L', crystal:'*', bakery:'H', fence:'f', chest:'h', workbench:'w', table:'t', bench:'n', stool:'s', cauldron:'o', anvil:'a', weapon_stand:'W', axe:'/', pickaxe:'p', bucket:'u', bag:'b', potion:'P', scroll:'S', coin_pile:'$'
  };
  return map[type] || (type ? type[0].toUpperCase() : '?');
}
function stateMarksFor(metaObj, mesh){
  if(!metaObj) return '';
  let out='';
  const st=metaObj.state||'intact';
  if(st==='burned' || st==='fire') out+='!';
  if(st==='cracked' || (metaObj.health!==undefined && metaObj.health<=1 && st!=='broken')) out+='#';
  if(st==='broken') out+='x';
  if(metaObj.soft || st==='glowing') out+='*';
  try{
    const v=mesh?.physicsBody?.getLinearVelocity?.();
    if(v && Math.hypot(v.x||0,v.z||0)>.65) out+='~';
  }catch{}
  return out;
}
function compactCell(base, marks=''){
  // Keep the map fixed-width by showing the highest-priority effect mark only in the tile grid.
  if(!marks) return base+' ';
  return base+marks[0];
}
function describeThing(id, type, pos, marks, extra=''){
  const st=marks ? ' flags='+marks : '';
  return `${id} ${type} at (${Math.round(pos.x)},${Math.round(pos.z)})${st}${extra}`;
}
function buildVisiblePerception(agentId=null, radius=5){
  const g=agentId ? state.geebrs.find(x=>x.id===agentId) : (state.selected||state.geebrs[0]);
  if(!g) return 'No agent selected.';
  radius=clamp(Number(radius)||5,2,8);
  const cx=Math.round(g.root.position.x), cz=Math.round(g.root.position.z);
  const opaque=opaqueCells();
  const facingName=facingNameFromDir(g.dir);
  const cells=new Map(); const details=[];
  for(let z=cz-radius; z<=cz+radius; z++) for(let x=cx-radius; x<=cx+radius; x++){
    const inCone=isWithinFacingVision(g,cx,cz,x,z,radius);
    const visible=inCone && canSeeCell(cx,cz,x,z,opaque);
    cells.set(gridKey(x,z), {base:visible?baseGlyphForTile(x,z):' ', marks:'', prio:visible?0:99, visible});
  }
  function put(x,z,base,marks,prio){ const k=gridKey(x,z); const c=cells.get(k); if(!c || !c.visible) return; if(prio>=c.prio){ c.base=base; c.marks=marks||''; c.prio=prio; } else if(marks && !c.marks) c.marks=marks; }
  let objectNumber=1;
  for(const m of state.blocks.concat(state.props)){
    if(!m || m.isDisposed?.()) continue;
    const p=m.getAbsolutePosition?.() || m.position; if(!p) continue;
    const x=Math.round(p.x), z=Math.round(p.z);
    if(Math.abs(x-cx)>radius || Math.abs(z-cz)>radius) continue;
    if(!isWithinFacingVision(g,cx,cz,x,z,radius)) continue;
    if(!canSeeCell(cx,cz,x,z,opaque)) continue;
    const mm=meta(m); if(!mm || mm.type==='tile') continue;
    const glyph=typeGlyph(mm.type), marks=stateMarksFor(mm,m);
    put(x,z,glyph,marks,55);
    if(mm.interactive!==false){ const id=(glyph.replace(/[^A-Za-z$/*]/g,'O')||'O')+objectNumber++; if(!state.perceptionLabels) state.perceptionLabels=new Map(); state.perceptionLabels.set(id.toLowerCase(),m); state.perceptionLabels.set(id,m); details.push(describeThing(id,mm.type,p,marks, mm.state&&mm.state!=='intact'?`, state=${mm.state}`:'')); }
  }
  for(const other of state.geebrs){
    const p=other.root.position; const x=Math.round(p.x), z=Math.round(p.z);
    if(Math.abs(x-cx)>radius || Math.abs(z-cz)>radius) continue;
    if(!isWithinFacingVision(g,cx,cz,x,z,radius)) continue;
    if(!canSeeCell(cx,cz,x,z,opaque)) continue;
    const isSelf=other===g; put(x,z,isSelf?'@':'g', other.anim==='panic'?'?':'', 90);
    if(!isSelf) details.push(`${other.id} other_geebr at (${x},${z}), anim=${other.anim||'idle'}`);
  }
  const rows=[];
  const mapWidth=(radius*2+1)*2;
  for(let z=cz-radius; z<=cz+radius; z++){
    let row='';
    for(let x=cx-radius; x<=cx+radius; x++){
      const c=cells.get(gridKey(x,z));
      row += compactCell(c.base,c.marks);
    }
    const middle=z===cz;
    rows.push(`${String(z-cz).padStart(3,' ')} ${middle?'W ': '  '}${row}${middle?'E':''}`);
  }
  const compassRows=[
    `      ${' '.repeat(Math.max(0,mapWidth/2-1))}N`,
    ...rows,
    `      ${' '.repeat(Math.max(0,mapWidth/2-1))}S`,
  ];
  const held=state.held.get(g.id); const heldMeta=held?meta(held):null;
  const target=state.target&&!state.target.isDisposed?.()?state.target:null; const targetMeta=target?meta(target):null;
  // Build dynamic legend: only include glyphs that appear in the current view
  const visibleGlyphs = new Set();
  for (const [key, c] of cells) { if (c.visible && c.base && c.base !== ' ') visibleGlyphs.add(c.base); }
  const glyphNames = {
    '@':'self', 'g':'other geebr', ',':'grass', ':':'dirt/path', '~':'water',
    '#':'wall', '=':'bridge', 'C':'crate', 'B':'barrel', 'M':'mushroom',
    'L':'lamp', '*':'crystal/magic', 'H':'house', 'r':'rock', 'x':'rubble',
    'f':'fence', 'h':'chest', 'w':'workbench', 't':'table', 'n':'bench',
    's':'stool', 'o':'cauldron', 'a':'anvil', 'W':'weapon stand',
    '/':'axe', 'p':'pickaxe', 'u':'bucket', 'b':'bag', 'P':'potion',
    'S':'scroll', '$':'coins', '?':'unknown'
  };
  const legendParts = [];
  for (const glyph of visibleGlyphs) {
    const name = glyphNames[glyph] || 'unknown';
    legendParts.push(glyph + '=' + name);
  }
  // Check for marks in visible cells
  const visibleMarks = new Set();
  for (const [key, c] of cells) { if (c.visible && c.marks) { for (const ch of c.marks) visibleMarks.add(ch); } }
  const markNames = {'!':'burned','#':'cracked','~':'moving','*':'soft/glowing','x':'broken'};
  const markParts = [];
  for (const mark of visibleMarks) { if (markNames[mark]) markParts.push(mark + '=' + markNames[mark]); }
  const legend = [];
  if (legendParts.length) legend.push('Legend: ' + legendParts.join(', ') + '.');
  if (markParts.length) legend.push('Marks: ' + markParts.join(', ') + '.');
  const showMap = document.getElementById('showAsciiMap')?.checked !== false;
  return [
    `Agent perception for ${g.id}`,
    `Center: (${cx},${cz})  Facing: ${facingName} (${Math.round(g.dir.x)},${Math.round(g.dir.z)})  Radius: ${radius}`,
    `Holding: ${held ? (heldMeta?.type||held.name) : 'none'}  Target: ${target ? (targetMeta?.type||target.name)+' at ('+Math.round(target.position.x)+','+Math.round(target.position.z)+')' : 'none'}`,
    '',
    ...(showMap ? [`North-up ${(radius*2+1)}x${(radius*2+1)} map (N/S/E/W labeled), rows are relative z:`, ...compassRows, ''] : []),
    details.length ? 'Nearby visible objects:' : 'Nearby visible objects: none',
    ...details.slice(0,24),
    '',
    ...(showMap ? legend : []),
  ].join('\n');
}
function buildCommandExamples(){
  const ex=[];
  if(state.allowed.has('walk')) ex.push('walk(direction: north|south|east|west) e.g. walk(north)');
  if(state.allowed.has('say')) ex.push('say(text) e.g. say("hello there")');
  if(state.allowed.has('look')) ex.push('look()');
  if(state.allowed.has('touch')) ex.push('touch(target) e.g. touch(crate)');
  if(state.allowed.has('push')) ex.push('push()');
  if(state.allowed.has('pull')) ex.push('pull()');
  if(state.allowed.has('carry')) ex.push('carry()');
  if(state.allowed.has('drop')) ex.push('drop()');
  if(state.allowed.has('throw')) ex.push('throw()');
  if(state.allowed.has('dig')) ex.push('dig()');
  if(state.allowed.has('build')) ex.push('build(thing) e.g. build(wall)');
  if(state.allowed.has('repair')) ex.push('repair()');
  if(state.allowed.has('panic')) ex.push('panic()');
  if(state.allowed.has('spell.push')) ex.push('spell(push)');
  if(state.allowed.has('spell.spark')) ex.push('spell(spark)');
  if(state.allowed.has('spell.fireball')) ex.push('spell(fireball)');
  if(state.allowed.has('goal')) ex.push('goal(text) e.g. goal(get axe)');
  if(state.allowed.has('give_quest')) ex.push('give_quest(text) e.g. give_quest(find the magic sword)');
  return ex.length?ex:['walk(north)'];
}
function buildAgentPrompt(g, cfg) {
  if (!g || !cfg) return { systemMessage: '', commandReminder: '' };
  const r=document.getElementById('visionRadius')?.value || 5;
  const perception = buildVisiblePerception(g.id, r);
  const style = (cfg.style || 'goofy little creature').replace(/\s+/g, ' ').trim();
  const personality = (cfg.personality || '').replace(/\s+/g, ' ').trim();
  const quest = (cfg.quest || '').replace(/\s+/g, ' ').trim();
  const goal = (cfg.goal || '').replace(/\s+/g, ' ').trim();
  const canGiveQuest = state.allowed.has('give_quest');
  const cmds = buildCommandExamples();
  const systemMessage = [
    `Character: ${g.id}`,
    `Style: ${style}`,
    `Personality: ${personality}`,
    '',
    'Available commands (examples only, use appropriate arguments):',
    ...cmds,
    '',
    ...(canGiveQuest ? ['Use give_quest() to bestow a quest on nearby agents.'] : []),
    ...(quest ? ['Your quest is set by the world and cannot be changed by you. Work toward it.'] : []),
    'Do not output anything except the command line.',
  ].join('\n');
  const commandReminder = [
    'SYSTEM: ' + String(perception).slice(0, 2400),
    '',
    'Available commands (examples only, use appropriate arguments):',
    ...cmds,
    ...(quest ? ['Quest: ' + quest] : []),
    ...(goal ? ['Current goal: ' + goal] : []),
  ].join('\n');
  return { systemMessage, commandReminder };
}
function updatePerceptionUI(){
  updateTurnUI();
  const out=document.getElementById('promptOut'); if(!out) return;
  const g=state.selected || (state.nextAgentId && state.geebrs.find(x=>x.id===state.nextAgentId)) || state.geebrs[0];
  if(!g){ out.textContent='No agent selected.'; return; }
  const cfg=getBrainConfig(g.id);
  const chatTestMode=document.getElementById('chatTestMode')?.checked;
  if (chatTestMode) {
    // In chat test mode, show bare conversation messages
    let text = `[AGENT: ${g.id}]\n\n`;
    text += `[SYSTEM] have a conversation. use the say command\n\n`;
    const hist = cfg.messages || [];
    for (const m of hist) {
      if (m.role === 'assistant' || (m.role === 'user' && !m.content.startsWith('SYSTEM RESULT:') && !m.content.startsWith('GEEBR ') && !m.content.startsWith('SYSTEM:'))) {
        text += `[${m.role.toUpperCase()}] ${m.content}\n`;
      }
    }
    out.textContent = text;
    return;
  }
  const { systemMessage, commandReminder } = buildAgentPrompt(g, cfg);
  const hist = cfg.messages || [];
  let histText = '';
  for (const m of hist) { histText += `[${m.role.toUpperCase()}] ${m.content}\n`; }
  out.textContent=`[AGENT: ${g.id}]\n\n[SYSTEM]\n${systemMessage}\n\n${histText ? '--- MESSAGE HISTORY ---\n' + histText + '\n' : ''}[USER]\n${commandReminder}`;
}
window.getAgentPerception=(agentId=null,radius=5)=>buildVisiblePerception(agentId,radius);


function getBrainConfig(agentId){
  if(!state.brainConfigs.has(agentId)){
    const g=state.geebrs.find(x=>x.id===agentId);
    state.brainConfigs.set(agentId,{enabled:true,style:g?.style==='mage'?'reckless mage':'fireball goblin',personality:'goofy, curious, imperfect, tries to be useful but often misunderstands',goals:'explore, interact with nearby objects, react to other geebrs, and be funny',fireballTemptation:g?.traits?.fireball??60,chaos:55,recent:[],quest:'',goal:'',giveQuest:false});
  }
  return state.brainConfigs.get(agentId);
}
function setBrainConfig(agentId,cfg){
  const old=getBrainConfig(agentId);
  const next={...old,...(cfg||{})};
  state.brainConfigs.set(agentId,next);
  const g=state.geebrs.find(x=>x.id===agentId);
  if(g){ g.brain=next; if(g.traits) g.traits.fireball=Number(next.fireballTemptation ?? g.traits.fireball ?? 50); }
  return next;
}
function refreshAgentSelect(){
  const agent=document.getElementById('agentSelect');
  if(!agent) return;
  const prev=agent.value || state.selected?.id;
  agent.textContent='';
  state.geebrs.forEach(g=>{ const o=document.createElement('option'); o.value=g.id; o.textContent=g.id; agent.appendChild(o); });
  if(prev && state.geebrs.some(g=>g.id===prev)) agent.value=prev;
  agent.onchange=()=>selectGeebr(state.geebrs.find(g=>g.id===agent.value));
}
function spawnCharacter(){
  const base=state.selected?.root?.position || new BABYLON.Vector3(0,0,0);
  const pos=new BABYLON.Vector3(clamp(Math.round(base.x+1+Math.random()*2),-14,14),.06,clamp(Math.round(base.z+1+Math.random()*2),-14,14));
  const id='geebr'+state.nextSpawnId++;
  const palettes=[
    {hat:state.materials.hat1,belly:state.materials.belly1,dark:state.materials.foot},
    {hat:state.materials.hat2,belly:state.materials.belly2,dark:state.materials.foot},
    {hat:state.materials.hat3,belly:state.materials.belly3,dark:state.materials.foot,clay:state.materials.bot}
  ];
  const styles=['goblin','mushroom','bot'];
  const g=createGeebr(state.scene,id,pos,pickRandom(palettes),pickRandom(styles));
  setGeebrLogicalPosition(g,pos);
  setBrainConfig(id,{style:'helpful idiot',personality:'newly spawned, confused, eager to participate',fireballTemptation:45,chaos:60});
  refreshAgentSelect(); selectGeebr(g); log('spawned character '+id); updatePerceptionUI(); saveWorldState(); return g;
}
function spawnProp(kind='crate'){
  const g=(state.nextAgentId && state.geebrs.find(x=>x.id===state.nextAgentId)) || state.selected || state.geebrs[0];
  const p=(g?.root?.position||BABYLON.Vector3.Zero()).add((g?.dir||new BABYLON.Vector3(0,0,-1)).scale(2));
  const x=clamp(Math.round(p.x),-14,14), z=clamp(Math.round(p.z),-14,14);
  let obj;
  if(kind==='barrel') obj=makeBarrel(state.scene,x,z);
  else if(kind==='wall') obj=makeBlock(state.scene,x,z,false);
  else obj=makeCrate(state.scene,x,z);
  state.target=obj; log('spawned '+kind+' at '+x+','+z); updatePerceptionUI(); saveWorldState(); return obj;
}
function spawnAt(type, x, z) {
  x = clamp(Math.round(x), -15, 15);
  z = clamp(Math.round(z), -15, 15);
  let obj;
  if (type === 'geebr') {
    const pos = new BABYLON.Vector3(x, .06, z);
    const id = 'geebr' + state.nextSpawnId++;
    const palettes = [
      {hat:state.materials.hat1, belly:state.materials.belly1, dark:state.materials.foot},
      {hat:state.materials.hat2, belly:state.materials.belly2, dark:state.materials.foot},
      {hat:state.materials.hat3, belly:state.materials.belly3, dark:state.materials.foot, clay:state.materials.bot}
    ];
    const styles = ['goblin', 'mushroom', 'bot'];
    obj = createGeebr(state.scene, id, pos, pickRandom(palettes), pickRandom(styles));
    setGeebrLogicalPosition(obj, pos);
    setBrainConfig(id, {style:'helpful idiot', personality:'newly spawned, confused, eager to participate', fireballTemptation:45, chaos:60});
    refreshAgentSelect();
    selectGeebr(obj);
    log('spawned ' + id + ' at ' + x + ',' + z);
  } else if (type === 'barrel') {
    obj = makeBarrel(state.scene, x, z);
    log('spawned barrel at ' + x + ',' + z);
  } else if (type === 'wall') {
    obj = makeBlock(state.scene, x, z, false);
    log('spawned wall at ' + x + ',' + z);
  } else if (type === 'mushroom') {
    obj = makeMushroom(state.scene, x, z);
    log('spawned mushroom at ' + x + ',' + z);
  } else if (type === 'lamp') {
    obj = makeLamp(state.scene, x, z);
    log('spawned lamp at ' + x + ',' + z);
  } else {
    obj = makeCrate(state.scene, x, z);
    log('spawned crate at ' + x + ',' + z);
  }
  updatePerceptionUI();
  saveWorldState();
  return obj;
}
function clearWorld() {
  for (const g of state.geebrs) {
    try { if (g.collider) g.collider.dispose(); } catch {}
    try { if (g.root) g.root.dispose(); } catch {}
  }
  for (const m of state.props.concat(state.blocks)) {
    if (!m || m.isDisposed?.()) continue;
    try { if (m.physicsBody) m.physicsBody.dispose(); } catch {}
    try { m.dispose(); } catch {}
  }
  state.geebrs = []; state.props = []; state.blocks = []; state.held = new Map();
  state.selected = null; state.target = null; state.brainConfigs = new Map();
  state.globalHistory = [];
  state.turn = {index:0, phase:'ready', command:null, resolveMs:200, lastEndedAt:0, mode:true};
  refreshAgentSelect();
  log('map cleared: all geebrs and objects removed');
  updatePerceptionUI();
  updateTurnUI();
}

function saveWorldState() {
  try {
    const data = {
      geebrs: state.geebrs.map(g => ({
        id: g.id,
        x: g.root.position.x, y: g.root.position.y, z: g.root.position.z,
        dx: g.dir.x, dy: g.dir.y, dz: g.dir.z,
        style: g.style, anim: g.anim, traits: g.traits,
      })),
      props: state.props.filter(m => m && !m.isDisposed?.()).map(m => {
        const mm = meta(m);
        return { type: mm?.type || 'crate', x: m.position.x, z: m.position.z, state: mm?.state || 'intact', health: mm?.health ?? 2 };
      }),
      blocks: state.blocks.filter(m => m && !m.isDisposed?.()).map(m => {
        const mm = meta(m);
        return { type: mm?.type || 'wall', x: m.position.x, z: m.position.z, state: mm?.state || 'intact', health: mm?.health ?? 3 };
      }),
      brainConfigs: Array.from(state.brainConfigs.entries()),
      nextSpawnId: state.nextSpawnId,
      globalHistory: state.globalHistory.slice(-50),
      turnIndex: state.turn.index,
      allowed: Array.from(state.allowed),
      ts: Date.now(),
    };
    localStorage.setItem('geebrWorldState', JSON.stringify(data));
  } catch (e) { console.warn('saveWorldState failed:', e); }
}

function loadWorldState() {
  try {
    const raw = localStorage.getItem('geebrWorldState');
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (!data || !data.geebrs) return false;
    clearWorld();
    if (data.allowed) state.allowed = new Set(data.allowed);
    for (const p of (data.props || [])) {
      let obj;
      if (p.type === 'barrel') obj = makeBarrel(state.scene, p.x, p.z);
      else if (p.type === 'mushroom') obj = makeMushroom(state.scene, p.x, p.z);
      else if (p.type === 'lamp') obj = makeLamp(state.scene, p.x, p.z);
      else obj = makeCrate(state.scene, p.x, p.z);
      if (obj) {
        const mm = meta(obj);
        if (mm) { mm.state = p.state || 'intact'; mm.health = p.health ?? mm.health; }
      }
    }
    for (const b of (data.blocks || [])) {
      const cracked = b.state === 'cracked';
      const obj = makeBlock(state.scene, b.x, b.z, cracked);
      if (obj) {
        const mm = meta(obj);
        if (mm) { mm.state = b.state || 'intact'; mm.health = b.health ?? mm.health; }
      }
    }
    const palettes = [
      {hat:state.materials.hat1,belly:state.materials.belly1,dark:state.materials.foot},
      {hat:state.materials.hat2,belly:state.materials.belly2,dark:state.materials.foot},
      {hat:state.materials.hat3,belly:state.materials.belly3,dark:state.materials.foot,clay:state.materials.bot},
    ];
    const styles = ['goblin', 'mushroom', 'bot'];
    for (const g of data.geebrs) {
      const palIdx = styles.indexOf(g.style);
      const palette = palIdx >= 0 ? palettes[palIdx] : palettes[0];
      const geebr = createGeebr(state.scene, g.id, new BABYLON.Vector3(g.x, g.y, g.z), palette, g.style || 'goblin');
      geebr.dir = new BABYLON.Vector3(g.dx || 0, g.dy || 0, g.dz || -1);
      geebr.anim = g.anim || 'idle';
      if (g.traits) geebr.traits = g.traits;
      setGeebrLogicalPosition(geebr, new BABYLON.Vector3(g.x, 0, g.z));
    }
    if (data.brainConfigs) state.brainConfigs = new Map(data.brainConfigs);
    state.nextSpawnId = data.nextSpawnId || (state.geebrs.length + 1);
    state.globalHistory = data.globalHistory || [];
    state.turn.index = data.turnIndex || 0;
    if (state.geebrs.length > 0) selectGeebr(state.geebrs[0]);
    refreshAgentSelect();
    updatePerceptionUI();
    updateTurnUI();
    log('world state restored from save');
    return true;
  } catch (e) {
    console.warn('loadWorldState failed:', e);
    return false;
  }
}

function installWorldAPI(){
  const prior=window.geebrWorld||{};
  window.geebrWorld={...prior,ready:true,state,log,parseCommand,parseLLMCommandLine,
    getAgents:()=>state.geebrs.slice(), getSelectedAgent:()=>state.selected,
    getBrainConfig, setBrainConfig, refreshAgentSelect,
    getAllowedCommands:()=>Array.from(state.allowed), canRun,
    getAgentPerception:(agentId=null,radius=5)=>buildVisiblePerception(agentId,radius),
    executeAgentCommand:(agentId,cmd)=>beginTurnForAgent(agentId,cmd,'agent-object'),
    runAgentCommand:(agentId,raw)=>beginTurnForAgent(agentId,parseCommand(raw),'agent-text'),
    stepAgentTurn:beginTurnForAgent,
    isTurnReady:()=>state.turn.phase==='ready',
    spawnCharacter, spawnProp, spawnAt, clearWorld, buildAgentPrompt,
  };
}

function setupUI(){
  installDirectControlHandlers();
  refreshAgentSelect();
  const inp=document.getElementById('cmd');
  if(inp) inp.addEventListener('keydown',e=>{ if(e.key==='Enter') runCommand(inp.value); });
  const allowed=document.getElementById('allowedCommands');
  if(allowed){
    allowed.textContent='';
    for(const c of COMMANDS){
      const lab=document.createElement('label'); lab.className='cmdcheck';
      const chk=document.createElement('input'); chk.type='checkbox'; chk.checked=state.allowed.has(c);
      chk.onchange=()=>{
        chk.checked?state.allowed.add(c):state.allowed.delete(c);
        document.querySelectorAll('button[data-cmd]').forEach(btn=>{
          const cmd=parseCommand(btn.dataset.cmd);
          btn.disabled=!!(cmd&&!canRun(cmd.kind,cmd.spell));
        });
        updatePerceptionUI();
      };
      lab.append(chk,document.createTextNode(c)); allowed.appendChild(lab);
    }
  }
  const bodyStyle=document.getElementById('bodyStyle');
  if(bodyStyle) bodyStyle.onchange=e=>{ const g=state.selected; if(!g) return; g.style=e.target.value; if(g.rigged){ say(g,'visual style comes from KayKit character asset now'); updatePerceptionUI(); return; } const isM=e.target.value==='mushroom', isB=e.target.value==='bot'; g.cosmetic.hat.material=isM?state.materials.mushroom:(isB?state.materials.bot:g.cosmetic.hat.material); g.head.material=isB?state.materials.bot:state.materials.geebr; say(g,'new body style: '+e.target.value); updatePerceptionUI(); };
  const refresh=document.getElementById('refreshPerception'); if(refresh) refresh.onclick=updatePerceptionUI;
  const radius=document.getElementById('visionRadius'); if(radius) radius.onchange=updatePerceptionUI;
  const turnMode=document.getElementById('turnMode'); if(turnMode) turnMode.onchange=()=>{ state.turn.mode=turnMode.checked; settleWorld(turnMode.checked?'turn mode on':'turn mode off'); };
  const settle=document.getElementById('settleNow'); if(settle) settle.onclick=()=>settleWorld('manual settle');
  const copy=document.getElementById('copyPerception'); if(copy) copy.onclick=()=>{ const text=buildVisiblePerception(null,document.getElementById('visionRadius')?.value||5); navigator.clipboard?.writeText(text); log('copied perception text'); };
  const showMap=document.getElementById('showAsciiMap'); if(showMap) showMap.onchange=updatePerceptionUI;
  const clearMapBtn=document.getElementById('clearMap'); if(clearMapBtn) clearMapBtn.onclick=()=>{
    if(confirm('Clear all geebrs and objects from the map?')) { clearWorld(); saveWorldState(); }
  };
  const resetStateBtn=document.getElementById('resetState'); if(resetStateBtn) resetStateBtn.onclick=()=>{
    if(confirm('Reset ALL state to a blank map? This cannot be undone.')) { localStorage.removeItem('geebrWorldState'); clearWorld(); log('state reset to blank'); }
  };
  const spawnModeEnabled=document.getElementById('spawnModeEnabled'); if(spawnModeEnabled) spawnModeEnabled.onchange=()=>{
    state.spawnMode.enabled = spawnModeEnabled.checked;
    canvas.style.cursor = state.spawnMode.enabled ? 'crosshair' : '';
    log(state.spawnMode.enabled ? 'click-to-spawn enabled: ' + state.spawnMode.type : 'click-to-spawn disabled');
  };
  const spawnModeType=document.getElementById('spawnModeType'); if(spawnModeType) spawnModeType.onchange=()=>{
    state.spawnMode.type = spawnModeType.value;
    if(state.spawnMode.enabled) log('spawn type: ' + state.spawnMode.type);
  };
  updatePerceptionUI(); updateTurnUI();
}

function updateBubbles(dt){ const camera=state.camera, scene=state.scene, engine=state.engine; function project(node,dy=1.7){ return BABYLON.Vector3.Project(node.getAbsolutePosition().add(new BABYLON.Vector3(0,dy,0)),BABYLON.Matrix.IdentityReadOnly,scene.getTransformMatrix(),camera.viewport.toGlobal(engine.getRenderWidth(),engine.getRenderHeight())); } for(const b of [...state.bubbles]){ b.ttl-=dt; const p=project(b.node,1.7); b.div.style.left=p.x+'px'; b.div.style.top=p.y+'px'; if(b.ttl<=0){ b.div.remove(); state.bubbles=state.bubbles.filter(x=>x!==b); } } for(const b of [...state.badges]){ b.ttl-=dt; const node=b.node.root||b.node; const p=project(node,.8); b.div.style.left=p.x+'px'; b.div.style.top=(p.y+b.vy*(1-b.ttl))+'px'; b.div.style.opacity=Math.max(0,b.ttl); if(b.ttl<=0){ b.div.remove(); state.badges=state.badges.filter(x=>x!==b); } } }
function animate(dt){ for(const g of state.geebrs){ if(g.turnMove){ g.turnMove.t+=dt/g.turnMove.dur; const u=clamp(g.turnMove.t,0,1); const k=u*u*(3-2*u); const p=BABYLON.Vector3.Lerp(g.turnMove.start,g.turnMove.end,k); g.root.position.x=p.x; g.root.position.z=p.z; g.root.position.y=0; if(g.collider) forceBodyTransform(g.collider,new BABYLON.Vector3(p.x,.74,p.z)); if(u>=1){ const end=g.turnMove.end.clone(); delete g.turnMove; setGeebrLogicalPosition(g,end); } } else syncGeebr(g); g.t+=dt; if(g.rigged){ g.root.rotation.y=yawForDir(g.dir); if(state.held.get(g.id)){ const h=state.held.get(g.id); h.position=g.root.position.add(g.dir.scale(.72)); h.position.y=.98+Math.sin(g.t*7)*.04; h.rotation.y+=dt*1.2; } continue; } if(state.held.get(g.id)){ const h=state.held.get(g.id); h.position=g.root.position.add(g.dir.scale(.72)); h.position.y=.98+Math.sin(g.t*7)*.04; h.rotation.y+=dt*1.2; }
    const breathe=1+Math.sin(g.t*3.1)*.026; g.body.scaling.y=breathe; g.head.position.y=1.08+Math.sin(g.t*2.2)*.025; g.root.rotation.y=yawForDir(g.dir); if(g.anim==='walk'){ g.feet[0].rotation.x=Math.sin(g.t*17)*.75; g.feet[1].rotation.x=-Math.sin(g.t*17)*.75; }
    else if(g.anim==='panic'){ g.root.rotation.y+=Math.sin(g.t*28)*.055; g.arms[0].rotation.z=.92+Math.sin(g.t*21)*.5; g.arms[1].rotation.z=-.92-Math.sin(g.t*19)*.5; g.head.scaling.x=1.06; }
    else if(g.anim==='talk'){ g.head.scaling.y=1+Math.sin(g.t*24)*.065; g.arms[0].rotation.z=.44; g.arms[1].rotation.z=-.44; }
    else if(g.anim==='cast'){ g.arms[0].rotation.z=1.05+Math.sin(g.t*18)*.1; g.arms[1].rotation.z=-1.05-Math.sin(g.t*18)*.1; g.head.position.y=1.15; }
    else if(g.anim==='push'){ g.body.rotation.x=Math.sin(g.t*18)*.08; g.arms[0].rotation.z=.72; g.arms[1].rotation.z=-.72; }
    else { g.head.scaling.set(1,1,1); g.body.rotation.x=0; g.arms[0].rotation.z=.28+Math.sin(g.t*2)*.04; g.arms[1].rotation.z=-.28-Math.sin(g.t*2.1)*.04; }
  } if(isTurnMode() && state.turn.phase==='ready'){ for(const g of state.geebrs) zeroMeshMotion(g.collider); } updateBubbles(dt); }

// v12 terrain patch: avoid WebGPU vertex-color/material weirdness and water z-fighting.
// Uses simple StandardMaterial colored meshes at separated Y heights.
function terrainMat(scene,name,color,spec=.018,emissive=null,alpha=1){
  const m=new BABYLON.StandardMaterial(name,scene);
  m.diffuseColor=color;
  m.specularColor=new BABYLON.Color3(spec,spec,spec);
  if(emissive) m.emissiveColor=emissive;
  m.alpha=alpha;
  m.backFaceCulling=false;
  return m;
}
function makePathRibbon(scene){
  const left=[], right=[];
  for(let i=0;i<=72;i++){
    const x=-13.2 + i*(26.4/72);
    const center=Math.sin(x*.28)*.48 + Math.sin(x*.77+1.8)*.18;
    const width=1.25 + smoothNoise(x*.35,9)*.42;
    const edgeWobble=(smoothNoise(x*1.4,4)-.5)*.28;
    left.push(new BABYLON.Vector3(x,.031,center-width+edgeWobble));
    right.push(new BABYLON.Vector3(x,.032,center+width-edgeWobble*.55));
  }
  const mesh=BABYLON.MeshBuilder.CreateRibbon('soft_irregular_dirt_path',{pathArray:[left,right],sideOrientation:BABYLON.Mesh.DOUBLESIDE},scene);
  mesh.material=terrainMat(scene,'v12_dirt_path',new BABYLON.Color3(.46,.31,.17),.012);
  mesh.receiveShadows=true; mesh.isPickable=false;
  return mesh;
}
function makeStoneQuarrySurface(scene){
  const stone=BABYLON.MeshBuilder.CreateGround('soft_stone_quarry_surface',{width:13,height:10,subdivisions:2},scene);
  stone.position.set(8.9,.026,-10.4); stone.rotation.y=.025;
  stone.material=terrainMat(scene,'v12_soft_stone',new BABYLON.Color3(.34,.34,.30),.018);
  stone.receiveShadows=true; stone.isPickable=false;
  return stone;
}
function makeBetterWater(scene){
  const mat=terrainMat(scene,'v12_water_lagoon',new BABYLON.Color3(.075,.30,.36),.18,new BABYLON.Color3(.012,.05,.058),.66);
  const water=BABYLON.MeshBuilder.CreateGround('water_lagoon_sheet',{width:9.72,height:11.92,subdivisions:28},scene);
  // Lift well above the muted grid and terrain. This intentionally avoids coplanar overlap.
  water.position.set(11.05,.155,9.05); water.material=mat; water.isPickable=false; water.receiveShadows=false;
  const pos=water.getVerticesData(BABYLON.VertexBuffer.PositionKind); water.metadata={basePositions:pos.slice()};
  scene.onBeforeRenderObservable.add(()=>{
    const t=performance.now()*0.001; const arr=water.getVerticesData(BABYLON.VertexBuffer.PositionKind); const base=water.metadata.basePositions;
    for(let i=0;i<arr.length;i+=3){ const x=base[i], z=base[i+2]; arr[i+1]=Math.sin(x*1.35+t*.9+z*.21)*.018+Math.sin(z*1.85-t*.72)*.011; }
    water.updateVerticesData(BABYLON.VertexBuffer.PositionKind,arr,false,false);
  });
  const glintMat=terrainMat(scene,'v12_water_glint',new BABYLON.Color3(.72,.96,.94),.04,new BABYLON.Color3(.02,.12,.13),.36);
  for(let j=0;j<7;j++){
    const pts=[]; const z=-5.0+j*1.62;
    for(let i=0;i<14;i++){ const x=-4.15+i*.64; pts.push(new BABYLON.Vector3(x,.23,z+Math.sin(i*.75+j)*.055)); }
    const line=BABYLON.MeshBuilder.CreateTube('water_glint_ribbon',{path:pts,radius:.009,tessellation:4},scene);
    line.position.set(11.05,0,9.05); line.material=glintMat; line.isPickable=false;
    scene.onBeforeRenderObservable.add(()=>{ line.position.x=11.05+Math.sin(performance.now()*0.00045+j)*.16; line.position.z=9.05+Math.cos(performance.now()*0.00039+j)*.09; });
  }
  return water;
}
function addTerrainPolish(scene){
  // Mute underlying cube grid so it remains useful for click/pick/collision but stops visually fighting the terrain.
  const ghostMats={};
  function ghost(name,color){ const m=terrainMat(scene,'v12_'+name+'_ghost',color,.006,null,.10); ghostMats[name]=m; return m; }
  ghost('grass',new BABYLON.Color3(.16,.24,.12)); ghost('dirt',new BABYLON.Color3(.30,.20,.11)); ghost('stone',new BABYLON.Color3(.25,.25,.23)); ghost('water',new BABYLON.Color3(.04,.10,.12));
  for(const mesh of scene.meshes){
    if(mesh.name.startsWith('tile_grass')) mesh.material=ghostMats.grass;
    else if(mesh.name.startsWith('tile_dirt')) mesh.material=ghostMats.dirt;
    else if(mesh.name.startsWith('tile_stone')) mesh.material=ghostMats.stone;
    else if(mesh.name.startsWith('tile_water')) mesh.material=ghostMats.water;
    if(mesh.name.startsWith('tile_')) { mesh.visibility=.18; mesh.isPickable=true; }
  }
  const grass=BABYLON.MeshBuilder.CreateGround('continuous_safe_grass',{width:31.8,height:31.8,subdivisions:8},scene);
  grass.position.set(0,.018,0); grass.material=terrainMat(scene,'v12_safe_grass',new BABYLON.Color3(.23,.36,.16),.010); grass.receiveShadows=true; grass.isPickable=false;
  // Add static ground physics body so props don't fall through
  const groundBody=new BABYLON.PhysicsAggregate(grass,BABYLON.PhysicsShapeType.BOX,{mass:0,friction:.9,restitution:.02},scene);
  groundBody.body.setMotionType(BABYLON.PhysicsMotionType.STATIC);
  makePathRibbon(scene);
  makeStoneQuarrySurface(scene);
  makeBetterWater(scene);
  makeShoreRocks(scene);
  for(let i=0;i<620;i++){
    const x=-15.4+Math.random()*30.8, z=-15.4+Math.random()*30.8;
    const pathCenter=Math.sin(x*.28)*.48 + Math.sin(x*.77+1.8)*.18;
    if((Math.abs(z-pathCenter)<1.55 && x>-13.5 && x<13.5) || (x>5.8&&z>2.8) || (x>2&&z<-5)) continue;
    const h=.09+Math.random()*.18, d=.035+Math.random()*.055;
    const blade=BABYLON.MeshBuilder.CreateCylinder('grass_tuft',{height:h,diameterTop:.004,diameterBottom:d,tessellation:4},scene);
    blade.position.set(x,.055+h*.35,z); blade.rotation.set((Math.random()-.5)*.22,Math.random()*Math.PI,(Math.random()-.5)*.22);
    blade.material=Math.random()<.65?state.materials.grassBlade:state.materials.grassBlade2; blade.isPickable=false; addShadow(blade);
  }
}

async function main(){ const engine=await createEngine(); state.engine=engine; const scene=new BABYLON.Scene(engine); state.scene=scene; scene.clearColor=new BABYLON.Color4(.055,.071,.088,1); const hk=await HavokPhysics(); scene.enablePhysics(new BABYLON.Vector3(0,-9.81,0),new BABYLON.HavokPlugin(true,hk));
  const camera=new BABYLON.ArcRotateCamera('camera',-Math.PI/4,1.05,18,new BABYLON.Vector3(0,.6,0),scene); state.camera=camera; camera.mode=BABYLON.Camera.ORTHOGRAPHIC_CAMERA; camera.lowerRadiusLimit=10; camera.upperRadiusLimit=28; camera.panningSensibility=60; camera.attachControl(canvas,true); setupMouseWheelZoom(camera);
  // Left-drag = orbit (default Babylon). Left-click (no drag) = center on clicked tile. Right-click = show tile info in history.
  if(camera.inputs?.attached?.pointers){ camera.inputs.attached.pointers.buttons=[0]; }
  let clickStart=null;
  canvas.addEventListener('pointerdown',e=>{ if(e.button===0){ clickStart={x:e.clientX,y:e.clientY}; } });
  canvas.addEventListener('pointerup',e=>{
    if(e.button===0 && clickStart){
      const moved=Math.abs(e.clientX-clickStart.x)+Math.abs(e.clientY-clickStart.y); clickStart=null;
      if(moved<5){
        const pick=scene.pick(scene.pointerX,scene.pointerY);
        if(pick?.hit && pick.pickedPoint){
          const tx=Math.round(pick.pickedPoint.x), tz=Math.round(pick.pickedPoint.z);
          if(state.spawnMode.enabled){
            spawnAt(state.spawnMode.type, tx, tz);
            return;
          }
          camera.target=new BABYLON.Vector3(tx,0.6,tz); state.zoomFocus=camera.target.clone();
        }
      }
    }
  });
  canvas.addEventListener('contextmenu',e=>{ e.preventDefault(); const pick=scene.pick(scene.pointerX,scene.pointerY); if(pick?.hit && pick.pickedPoint){ const tx=Math.round(pick.pickedPoint.x), tz=Math.round(pick.pickedPoint.z); let info=`tile (${tx},${tz})`; const m=pick.pickedMesh; const mm=meta(m); if(mm?.type && mm.type!=='tile') info+=` - ${mm.type} (${mm.state||'intact'})`; const owner=m?.metadata?.ownerId; if(owner){ const g=state.geebrs.find(x=>x.id===owner); if(g) info+=` - ${g.id} (${g.anim||'idle'})`; } log(info); } });
  canvas.addEventListener('pointermove',e=>{ if(e.buttons&2){ e.preventDefault(); const dx=e.movementX*0.02, dy=e.movementY*0.02; const right=camera.getDirection(BABYLON.Vector3.Right()); const up=camera.getDirection(BABYLON.Vector3.Up()); const newTarget=camera.target.add(right.scale(dx)).subtract(up.scale(dy)); newTarget.y=0.6; camera.target.copyFrom(newTarget); state.zoomFocus=camera.target.clone(); } });
  const hemi=new BABYLON.HemisphericLight('soft_overall',new BABYLON.Vector3(.2,1,.1),scene); hemi.intensity=.30; hemi.groundColor=new BABYLON.Color3(.13,.16,.15); const sun=new BABYLON.DirectionalLight('warm_key',new BABYLON.Vector3(-.42,-.92,.55),scene); sun.position=new BABYLON.Vector3(8,14,-9); sun.intensity=.88; sun.diffuse=new BABYLON.Color3(1,.88,.70); const fill=new BABYLON.PointLight('cool_fill',new BABYLON.Vector3(-8,4,6),scene); fill.intensity=.20; fill.diffuse=new BABYLON.Color3(.50,.67,1); fill.range=18; state.shadow=new BABYLON.ShadowGenerator(2048,sun); state.shadow.useBlurExponentialShadowMap=true; state.shadow.blurKernel=24;
  state.materials={
    grass:mat(scene,'grass','grass_meadow.png',{uScale:1,vScale:1}), dirt:mat(scene,'dirt','dirt_loam.png',{uScale:1,vScale:1}), stone:mat(scene,'stone','stone_soft.png',{uScale:1,vScale:1}),
    grassSurf:mat(scene,'grassSurf','grass_meadow.png',{uScale:7.5,vScale:7.5}), dirtSurf:mat(scene,'dirtSurf','dirt_loam.png',{uScale:5.8,vScale:1.3}), stoneSurf:mat(scene,'stoneSurf','stone_soft.png',{uScale:3.4,vScale:3.0}),
    grassBase:colorMat(scene,'grass_base',new BABYLON.Color3(.17,.25,.14)), dirtBase:colorMat(scene,'dirt_base',new BABYLON.Color3(.27,.19,.12)), stoneBase:colorMat(scene,'stone_base',new BABYLON.Color3(.28,.28,.26)), waterBase:colorMat(scene,'water_base',new BABYLON.Color3(.06,.13,.15)),
    cracked:mat(scene,'cracked','cracked_wall.png',{uScale:1.2,vScale:1.2}), wood:mat(scene,'wood','wood_planks.png',{uScale:1.2,vScale:1.2}), mushroom:mat(scene,'mushroom','mushroom_cap.png',{uScale:1.05,vScale:1.05}), canvas:mat(scene,'canvas','canvas_fabric.png',{uScale:1.4,vScale:1.4}), geebr:mat(scene,'geebr_clay','geebr_clay.png',{uScale:1,vScale:1}), magic:mat(scene,'magic','magic_crystal.png',{emissive:new BABYLON.Color3(.07,.34,.34)}), fire:colorMat(scene,'fire',new BABYLON.Color3(1,.31,.08),new BABYLON.Color3(.85,.18,.04)), burned:colorMat(scene,'burned',new BABYLON.Color3(.12,.09,.07)), water:makeWaterMaterial(scene), grassBlade:colorMat(scene,'grass_blade',new BABYLON.Color3(.25,.43,.18)), grassBlade2:colorMat(scene,'grass_blade2',new BABYLON.Color3(.36,.49,.20)), pebble:colorMat(scene,'pebble',new BABYLON.Color3(.39,.38,.32)), hole:colorMat(scene,'hole',new BABYLON.Color3(.06,.035,.022)), bot:colorMat(scene,'bot',new BABYLON.Color3(.47,.55,.58)), darkwood:colorMat(scene,'darkwood',new BABYLON.Color3(.26,.14,.07)), hat1:colorMat(scene,'hat_moss',new BABYLON.Color3(.18,.38,.21)), hat2:colorMat(scene,'hat_clay',new BABYLON.Color3(.58,.25,.16)), hat3:colorMat(scene,'hat_blue',new BABYLON.Color3(.18,.28,.48)), belly1:colorMat(scene,'belly_cream',new BABYLON.Color3(.78,.72,.48)), belly2:colorMat(scene,'belly_blue',new BABYLON.Color3(.36,.55,.68)), belly3:colorMat(scene,'belly_pink',new BABYLON.Color3(.70,.42,.53)), foot:colorMat(scene,'foot_dark',new BABYLON.Color3(.12,.17,.13))
  };
  buildWorld(scene); addTerrainPolish(scene); await addRealPropPass(scene); await scatterRealProps(scene); const realChars=await createAgentCast(scene); if(!realChars){ createGeebr(scene,'gib',new BABYLON.Vector3(-1,.06,-.7),{hat:state.materials.hat1,belly:state.materials.belly1,dark:state.materials.foot},'goblin'); createGeebr(scene,'momo',new BABYLON.Vector3(.45,.06,-.55),{hat:state.materials.hat2,belly:state.materials.belly2,dark:state.materials.foot},'mushroom'); createGeebr(scene,'zap',new BABYLON.Vector3(1.2,.06,.15),{hat:state.materials.hat3,belly:state.materials.belly3,dark:state.materials.foot,clay:state.materials.bot},'bot'); } selectGeebr(state.geebrs[0]);
  scene.onPointerObservable.add(pi=>{ if(pi.type!==BABYLON.PointerEventTypes.POINTERPICK || !pi.pickInfo?.hit) return; const m=pi.pickInfo.pickedMesh; const owner=m?.metadata?.ownerId; const g=state.geebrs.find(x=>owner===x.id || m.name.startsWith(x.id+'_')); if(g){ state.zoomFocus=new BABYLON.Vector3(g.root.position.x,0.6,g.root.position.z); return selectGeebr(g); } const mm=meta(m); const target=logicalTarget(m); if(pi.pickInfo.pickedPoint) state.zoomFocus=new BABYLON.Vector3(pi.pickInfo.pickedPoint.x,0.6,pi.pickInfo.pickedPoint.z); if(mm?.interactive){ state.target=target; const tp=target.getAbsolutePosition?.()||pi.pickInfo.pickedPoint; state.zoomFocus=new BABYLON.Vector3(tp.x,0.6,tp.z); log('target: '+(mm.type||target.name)+' / '+(mm.state||'intact')); updatePerceptionUI(); } });
  setupUI(); installWorldAPI(); loadWorldState(); scene.onBeforeRenderObservable.add(()=>animate(engine.getDeltaTime()/1000)); engine.runRenderLoop(()=>{
    scene.render();
    const recorder=window.geebrFrameRecorder;
    if(recorder?.wantsFrame?.()) recorder.captureAfterRender(engine).catch(err=>recorder.fail?.(err));
  });
  window.addEventListener('resize',()=>engine.resize()); log('v14.5 loaded: fixed north-up perception UI + blank hidden cells + facing cone + LOS'); updatePerceptionUI(); }
main().catch(err=>{ console.error(err); document.body.innerHTML='<pre style="color:white;padding:20px;white-space:pre-wrap">'+err.stack+'</pre>'; });
