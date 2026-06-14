/* geebr.world v6 — Babylon WebGPU + Havok + authored PNG textures + low-poly custom mesh models */
const canvas = document.getElementById('renderCanvas');
const ASSET = './assets/textures/';
const state = { scene:null, camera:null, geebrs:[], selected:null, target:null, blocks:[], props:[], bubbles:[] };

function log(s){
  const box=document.getElementById('log');
  const div=document.createElement('div'); div.className='logline'; div.textContent=s;
  box.prepend(div); while(box.children.length>8) box.lastChild.remove();
}
function pickRandom(a){ return a[Math.floor(Math.random()*a.length)] }

async function createEngine(){
  if(!navigator.gpu) throw new Error('WebGPU unavailable in this browser');
  const engine = new BABYLON.WebGPUEngine(canvas, { antialias:true, adaptToDeviceRatio:true });
  await engine.initAsync();
  return engine;
}

function mat(scene, name, texture, opts={}){
  const m=new BABYLON.StandardMaterial(name, scene);
  m.diffuseTexture = new BABYLON.Texture(ASSET+texture, scene, true, false, BABYLON.Texture.NEAREST_SAMPLINGMODE);
  m.diffuseTexture.uScale=opts.uScale||1; m.diffuseTexture.vScale=opts.vScale||1;
  m.specularColor = new BABYLON.Color3(0.06,0.055,0.045);
  m.roughness = 0.9;
  if(opts.emissive) m.emissiveColor = opts.emissive;
  return m;
}
function colorMat(scene, name, color, emissive=null){
  const m=new BABYLON.StandardMaterial(name,scene);
  m.diffuseColor=color; m.specularColor=new BABYLON.Color3(.04,.04,.04);
  if(emissive) m.emissiveColor=emissive;
  return m;
}
function addBody(mesh, motion, shape='BOX', mass=1){
  if(!BABYLON.PhysicsBody) return null;
  const agg = new BABYLON.PhysicsAggregate(mesh, BABYLON.PhysicsShapeType[shape], { mass, friction:0.85, restitution:0.08 }, state.scene);
  if(motion==='static') agg.body.setMotionType(BABYLON.PhysicsMotionType.STATIC);
  return agg;
}

function lowPolyBlob(name, scene, rx=0.5, ry=0.6, rz=0.4, rings=5, seg=8){
  const positions=[], indices=[], normals=[], uvs=[];
  for(let r=0;r<=rings;r++){
    const v=r/rings, phi=-Math.PI/2 + v*Math.PI;
    const y=Math.sin(phi)*ry;
    const cr=Math.cos(phi);
    const wob=1 + (r%2? .06:-.03);
    for(let s=0;s<seg;s++){
      const u=s/seg, th=u*Math.PI*2;
      const x=Math.cos(th)*rx*cr*wob*(1+.05*Math.sin(3*th));
      const z=Math.sin(th)*rz*cr*wob*(1+.04*Math.cos(2*th));
      positions.push(x,y,z); uvs.push(u,v);
    }
  }
  for(let r=0;r<rings;r++) for(let s=0;s<seg;s++){
    const a=r*seg+s, b=r*seg+(s+1)%seg, c=(r+1)*seg+s, d=(r+1)*seg+(s+1)%seg;
    indices.push(a,c,b,b,c,d);
  }
  BABYLON.VertexData.ComputeNormals(positions, indices, normals);
  const vd=new BABYLON.VertexData(); vd.positions=positions; vd.indices=indices; vd.normals=normals; vd.uvs=uvs;
  const mesh=new BABYLON.Mesh(name,scene); vd.applyToMesh(mesh); return mesh;
}
function createCrystal(name, scene, height=1.1, radius=.25){
  const pts=[], idx=[], uv=[]; const seg=6;
  pts.push(0,height/2,0); uv.push(.5,0);
  pts.push(0,-height/2,0); uv.push(.5,1);
  for(let i=0;i<seg;i++){ const th=i/seg*Math.PI*2; pts.push(Math.cos(th)*radius,0,Math.sin(th)*radius); uv.push(i/seg,.5); }
  for(let i=0;i<seg;i++){ const a=2+i,b=2+(i+1)%seg; idx.push(0,a,b,1,b,a); }
  const normals=[]; BABYLON.VertexData.ComputeNormals(pts,idx,normals);
  const vd=new BABYLON.VertexData(); vd.positions=pts; vd.indices=idx; vd.normals=normals; vd.uvs=uv;
  const m=new BABYLON.Mesh(name,scene); vd.applyToMesh(m); return m;
}

function createGeebr(scene, id, pos, palette){
  const root=new BABYLON.TransformNode(id,scene); root.position.copyFrom(pos);
  const clay=state.materials.geebr;
  const body=lowPolyBlob(id+'_body',scene,.34,.46,.29,5,9); body.parent=root; body.position.y=.55; body.material=clay;
  const head=lowPolyBlob(id+'_head',scene,.34,.31,.30,4,8); head.parent=root; head.position.y=1.08; head.material=clay;
  const belly=lowPolyBlob(id+'_belly',scene,.22,.24,.08,3,8); belly.parent=root; belly.position.set(0,.53,-.25); belly.material=palette.belly;
  const footL=lowPolyBlob(id+'_footL',scene,.16,.08,.22,2,7); footL.parent=root; footL.position.set(-.18,.12,-.03); footL.material=palette.dark;
  const footR=footL.clone(id+'_footR'); footR.parent=root; footR.position.x=.18;
  const armL=lowPolyBlob(id+'_armL',scene,.08,.26,.08,3,6); armL.parent=root; armL.position.set(-.38,.64,0); armL.rotation.z=.28; armL.material=clay;
  const armR=armL.clone(id+'_armR'); armR.parent=root; armR.position.x=.38; armR.rotation.z=-.28;
  const eyeMat=colorMat(scene,id+'_eye',new BABYLON.Color3(.98,.96,.86));
  const pupilMat=colorMat(scene,id+'_pupil',new BABYLON.Color3(.05,.05,.04));
  for(const x of [-.12,.12]){
    const e=BABYLON.MeshBuilder.CreateSphere(id+'_eye',{diameter:.105,segments:8},scene); e.parent=root; e.position.set(x,1.13,-.285); e.scaling.y=1.25; e.material=eyeMat;
    const p=BABYLON.MeshBuilder.CreateSphere(id+'_pupil',{diameter:.042,segments:6},scene); p.parent=root; p.position.set(x,1.125,-.337); p.material=pupilMat;
  }
  const hat=BABYLON.MeshBuilder.CreateCylinder(id+'_hat',{diameterTop:.28,diameterBottom:.48,height:.22,tessellation:7},scene); hat.parent=root; hat.position.y=1.41; hat.material=palette.hat;
  const pack=BABYLON.MeshBuilder.CreateBox(id+'_backpack',{width:.34,height:.42,depth:.14},scene); pack.parent=root; pack.position.set(0,.72,.29); pack.material=state.materials.canvas;
  const bodyCollider=BABYLON.MeshBuilder.CreateBox(id+'_collider',{width:.72,height:1.18,depth:.68},scene); bodyCollider.position.copyFrom(root.position); bodyCollider.position.y+=.62; bodyCollider.isVisible=false;
  const agg=addBody(bodyCollider,'dynamic','BOX',1.2); if(agg) agg.body.setMassProperties({mass:1.2});
  const geebr={id,root,body,head,arms:[armL,armR],feet:[footL,footR],collider:bodyCollider,agg,selected:false,anim:'idle',t:Math.random()*10,dir:new BABYLON.Vector3(0,0,-1)};
  state.geebrs.push(geebr); return geebr;
}

function makeCrate(scene,x,z){
  const m=BABYLON.MeshBuilder.CreateBox('crate',{size:.72},scene); m.position.set(x,.38,z); m.material=state.materials.wood; addBody(m,'dynamic','BOX',1.5); state.props.push(m); return m;
}
function makeBarrel(scene,x,z){
  const b=BABYLON.MeshBuilder.CreateCylinder('barrel',{height:.78,diameter:.55,tessellation:10},scene); b.position.set(x,.42,z); b.rotation.z=Math.random()*.05; b.material=state.materials.wood; addBody(b,'dynamic','CYLINDER',1.1); state.props.push(b); return b;
}
function makeBlock(scene,x,z,cracked=false){
  const b=BABYLON.MeshBuilder.CreateBox('block',{width:.96,height:.55,depth:.96},scene); b.position.set(x,.28,z); b.material=cracked?state.materials.cracked:state.materials.stone; addBody(b,'static','BOX',0); state.blocks.push(b); return b;
}
function makeBakery(scene){
  const base=BABYLON.MeshBuilder.CreateBox('mushroom_bakery_base',{width:1.65,height:1.05,depth:1.45},scene); base.position.set(-2.7,.58,-1.9); base.material=state.materials.stone; addBody(base,'static','BOX',0);
  const cap=BABYLON.MeshBuilder.CreateSphere('mushroom_bakery_cap',{diameter:2.25,segments:12},scene); cap.position.set(-2.7,1.42,-1.9); cap.scaling.set(1.15,.36,1); cap.material=state.materials.mushroom;
  const door=BABYLON.MeshBuilder.CreateBox('tiny_round_door',{width:.42,height:.62,depth:.055},scene); door.position.set(-2.7,.38,-2.635); door.material=state.materials.wood;
  const chimney=BABYLON.MeshBuilder.CreateCylinder('chimney',{diameter:.24,height:.64,tessellation:6},scene); chimney.position.set(-1.92,1.75,-1.62); chimney.material=state.materials.stone;
}
function makeFence(scene){
  for(let i=0;i<8;i++){
    const post=BABYLON.MeshBuilder.CreateCylinder('fence_post',{height:.52,diameter:.09,tessellation:5},scene); post.position.set(-3.6+i*.52,.33,2.95); post.material=state.materials.wood; addBody(post,'static','CYLINDER',0);
  }
  for(const y of [.32,.53]){ const rail=BABYLON.MeshBuilder.CreateBox('fence_rail',{width:4.1,height:.07,depth:.08},scene); rail.position.set(-1.8,y,2.95); rail.material=state.materials.wood; }
}
function makeLamp(scene,x,z){
  const pole=BABYLON.MeshBuilder.CreateCylinder('lamp_pole',{height:.85,diameter:.07,tessellation:6},scene); pole.position.set(x,.46,z); pole.material=state.materials.darkwood;
  const c=createCrystal('lamp_crystal',scene,.38,.14); c.position.set(x,.98,z); c.material=state.materials.magic; 
  const light=new BABYLON.PointLight('small_lamp',new BABYLON.Vector3(x,.96,z),scene); light.diffuse=new BABYLON.Color3(.32,.75,.75); light.intensity=.25; light.range=2.4;
}
function makeShrine(scene){
  const plinth=makeBlock(scene,2.45,-2.1,true); plinth.name='cracked_shrine_plinth'; plinth.scaling.set(1.05,.7,1.05);
  const c=createCrystal('hero_crystal',scene,1.15,.28); c.position.set(2.45,1.05,-2.1); c.material=state.materials.magic; state.props.push(c);
}

function syncGeebr(g){
  if(g.collider){ g.root.position.x=g.collider.position.x; g.root.position.z=g.collider.position.z; }
}
function selectGeebr(g){ state.geebrs.forEach(x=>x.selected=false); g.selected=true; state.selected=g; log('selected '+g.id); }
function say(g,text){
  log(g.id+': '+text);
  const div=document.createElement('div'); div.className='bubble'; div.textContent=text.slice(0,70); document.body.appendChild(div);
  state.bubbles.push({div,node:g.root,ttl:2.7}); g.anim='talk'; setTimeout(()=>{ if(g.anim==='talk') g.anim='idle'; },900);
}
function impulseToward(mesh, from, power){
  if(mesh.physicsBody){
    const dir=mesh.getAbsolutePosition().subtract(from); dir.y=.2; dir.normalize();
    mesh.physicsBody.applyImpulse(dir.scale(power), mesh.getAbsolutePosition());
  }
}
function nearestTarget(g){
  if(state.target) return state.target;
  let best=null,bd=99; const p=g.root.position;
  for(const m of state.props.concat(state.blocks)){ const d=BABYLON.Vector3.Distance(p,m.position); if(d<bd){bd=d; best=m;} }
  return bd<2.8?best:null;
}
function runCommand(raw){
  const g=state.selected||state.geebrs[0]; if(!g) return;
  const [a,b,...rest]=raw.trim().split(/\s+/); const text=raw.replace(/^say\s*/,'');
  if(a==='say') return say(g,text||pickRandom(['hmm','bonk?','this is load-bearing']));
  if(a==='walk'){
    const dirs={n:[0,0,-1],s:[0,0,1],e:[1,0,0],w:[-1,0,0]}; const d=dirs[b]||dirs.n; const v=new BABYLON.Vector3(...d); g.dir=v;
    if(g.physicsBody || g.collider.physicsBody) g.collider.physicsBody.applyImpulse(v.scale(1.65), g.collider.getAbsolutePosition());
    else g.root.position.addInPlace(v.scale(.55));
    g.anim='walk'; setTimeout(()=>{ if(g.anim==='walk') g.anim='idle'; },520); log(g.id+' walks '+(b||'n')); return;
  }
  if(a==='push'){
    const t=nearestTarget(g); if(t){ impulseToward(t,g.root.position,4.2); say(g,'helpfully pushing the wrong thing'); } else say(g,'nothing to shove');
    g.anim='push'; setTimeout(()=>g.anim='idle',520); return;
  }
  if(a==='spell'){
    const origin=g.root.position.clone(); g.anim='cast';
    const ring=BABYLON.MeshBuilder.CreateTorus('spell_ring',{diameter:.15,thickness:.025,tessellation:16},state.scene); ring.position=origin.add(new BABYLON.Vector3(0,.08,0)); ring.material=state.materials.magic; let s=.1;
    const obs=state.scene.onBeforeRenderObservable.add(()=>{ s+=.06; ring.scaling.set(s,s,s); ring.rotation.x+=.08; if(s>3.1){ ring.dispose(); state.scene.onBeforeRenderObservable.remove(obs);} });
    if(b==='push') for(const m of state.props) if(BABYLON.Vector3.Distance(origin,m.position)<3.0) impulseToward(m,origin,5.8);
    say(g,b==='spark'?'sparkles are a valid plan':'physics has been consulted'); setTimeout(()=>g.anim='idle',750); return;
  }
  if(a==='panic'){
    g.anim='panic'; say(g,'I have promoted the floor to manager');
    for(let i=0;i<4;i++) setTimeout(()=>{ const v=new BABYLON.Vector3(Math.random()-.5,0,Math.random()-.5).normalize(); g.collider.physicsBody?.applyImpulse(v.scale(1.0),g.collider.position); },i*180);
    setTimeout(()=>g.anim='idle',1300); return;
  }
  if(a==='build'){
    const p=g.root.position.add(g.dir.scale(1.05)); makeBlock(state.scene,Math.round(p.x),Math.round(p.z),false); say(g,'wall installed questionably'); return;
  }
  if(a==='dig'){
    const t=nearestTarget(g); if(t && state.blocks.includes(t)){ t.dispose(); state.blocks=state.blocks.filter(x=>x!==t); say(g,'structural snack acquired'); } else say(g,'dig failed artistically'); return;
  }
  say(g,'unknown command: '+raw);
}
window.runCommand=runCommand;

async function main(){
  const engine=await createEngine(); const scene=new BABYLON.Scene(engine); state.scene=scene;
  scene.clearColor=new BABYLON.Color4(.075,.09,.11,1);
  const hk=await HavokPhysics(); const plugin=new BABYLON.HavokPlugin(true,hk); scene.enablePhysics(new BABYLON.Vector3(0,-9.81,0),plugin);
  const camera=new BABYLON.ArcRotateCamera('camera',-Math.PI/4,1.06,10.5,new BABYLON.Vector3(0,.3,0),scene); state.camera=camera;
  camera.mode=BABYLON.Camera.ORTHOGRAPHIC_CAMERA; camera.orthoLeft=-5.8; camera.orthoRight=5.8; camera.orthoTop=3.7; camera.orthoBottom=-3.7; camera.attachControl(canvas,true);

  // Dimmer, moodier lighting than v5: less blown-out, more diorama depth.
  const hemi=new BABYLON.HemisphericLight('soft_overall',new BABYLON.Vector3(0.2,1,0.1),scene); hemi.intensity=.38; hemi.groundColor=new BABYLON.Color3(.17,.20,.18);
  const sun=new BABYLON.DirectionalLight('warm_key',new BABYLON.Vector3(-.45,-.9,.55),scene); sun.position=new BABYLON.Vector3(4,8,-5); sun.intensity=.72; sun.diffuse=new BABYLON.Color3(1,.91,.78);
  const fill=new BABYLON.PointLight('cool_fill',new BABYLON.Vector3(-3,2.2,3),scene); fill.intensity=.18; fill.diffuse=new BABYLON.Color3(.55,.72,1); fill.range=7;
  scene.environmentIntensity=.35;

  state.materials={
    grass:mat(scene,'grass_tex','grass_speckle.png',{uScale:5,vScale:5}), dirt:mat(scene,'dirt_tex','dirt_path.png',{uScale:2,vScale:2}),
    stone:mat(scene,'stone_tex','stone_blocks.png',{uScale:1.2,vScale:1.2}), cracked:mat(scene,'cracked_tex','cracked_wall.png',{uScale:1.2,vScale:1.2}),
    wood:mat(scene,'wood_tex','wood_planks.png',{uScale:1.3,vScale:1.3}), mushroom:mat(scene,'mushroom_tex','mushroom_cap.png',{uScale:1.1,vScale:1.1}),
    canvas:mat(scene,'canvas_tex','canvas_fabric.png',{uScale:1.5,vScale:1.5}), geebr:mat(scene,'geebr_clay_tex','geebr_clay.png',{uScale:1,vScale:1}),
    magic:mat(scene,'magic_tex','magic_crystal.png',{uScale:1,vScale:1,emissive:new BABYLON.Color3(.08,.33,.34)}),
    darkwood:colorMat(scene,'darkwood',new BABYLON.Color3(.28,.16,.08)),
    hat1:colorMat(scene,'hat_moss',new BABYLON.Color3(.18,.38,.21)), hat2:colorMat(scene,'hat_clay',new BABYLON.Color3(.57,.27,.18)),
    belly1:colorMat(scene,'belly_cream',new BABYLON.Color3(.78,.72,.48)), belly2:colorMat(scene,'belly_blue',new BABYLON.Color3(.36,.55,.68)),
    foot:colorMat(scene,'foot_dark',new BABYLON.Color3(.12,.17,.13))
  };
  const ground=BABYLON.MeshBuilder.CreateBox('terrain_slab',{width:9.6,height:.35,depth:7.2},scene); ground.position.y=-.18; ground.material=state.materials.grass; addBody(ground,'static','BOX',0);
  const path=BABYLON.MeshBuilder.CreateBox('dirt_path',{width:6.4,height:.025,depth:1.15},scene); path.position.set(.55,.012,.45); path.rotation.y=-.16; path.material=state.materials.dirt;

  for(let x=-4;x<=4;x++) { makeBlock(scene,x,-3.2,Math.random()<.35); makeBlock(scene,x,3.35,Math.random()<.22); }
  for(let z=-2;z<=2;z++) { makeBlock(scene,-4.65,z,Math.random()<.22); makeBlock(scene,4.65,z,Math.random()<.32); }
  makeBakery(scene); makeFence(scene); makeShrine(scene); makeLamp(scene,-.6,2.25); makeLamp(scene,3.1,.9);
  [[.2,.8],[.95,1.05],[1.5,.65],[2.2,1.25],[-1.2,.25],[3.0,-.35]].forEach(([x,z],i)=> i%2?makeBarrel(scene,x,z):makeCrate(scene,x,z));
  createGeebr(scene,'gib',new BABYLON.Vector3(-.8,.06,-.65),{hat:state.materials.hat1,belly:state.materials.belly1,dark:state.materials.foot});
  createGeebr(scene,'momo',new BABYLON.Vector3(.55,.06,-.75),{hat:state.materials.hat2,belly:state.materials.belly2,dark:state.materials.foot}); selectGeebr(state.geebrs[0]);

  scene.onPointerObservable.add(pi=>{
    if(pi.type!==BABYLON.PointerEventTypes.POINTERPICK || !pi.pickInfo?.hit) return;
    const m=pi.pickInfo.pickedMesh; let g=state.geebrs.find(x=>m.name.startsWith(x.id+'_'));
    if(g) return selectGeebr(g);
    if(state.props.includes(m)||state.blocks.includes(m)){ state.target=m; log('target: '+m.name); }
  });
  document.querySelectorAll('button[data-cmd]').forEach(b=>b.onclick=()=>runCommand(b.dataset.cmd));
  const inp=document.getElementById('cmd'); inp.addEventListener('keydown',e=>{ if(e.key==='Enter') runCommand(inp.value); });

  scene.onBeforeRenderObservable.add(()=>{
    const dt=engine.getDeltaTime()/1000;
    for(const g of state.geebrs){ syncGeebr(g); g.t+=dt; const breathe=1+Math.sin(g.t*3.2)*.025; g.body.scaling.y=breathe; g.head.position.y=1.08+Math.sin(g.t*2.4)*.025;
      if(g.anim==='walk'){ g.feet[0].rotation.x=Math.sin(g.t*16)*.7; g.feet[1].rotation.x=-Math.sin(g.t*16)*.7; g.root.rotation.y=Math.atan2(g.dir.x,g.dir.z); }
      else if(g.anim==='panic'){ g.root.rotation.y+=Math.sin(g.t*26)*.045; g.arms[0].rotation.z=.9+Math.sin(g.t*20)*.45; g.arms[1].rotation.z=-.9-Math.sin(g.t*18)*.45; }
      else if(g.anim==='talk'){ g.head.scaling.y=1+Math.sin(g.t*22)*.06; }
      else if(g.anim==='cast'){ g.arms[0].rotation.z=.95; g.arms[1].rotation.z=-.95; }
      else { g.arms[0].rotation.z=.28+Math.sin(g.t*2)*.04; g.arms[1].rotation.z=-.28-Math.sin(g.t*2.1)*.04; }
    }
    for(const b of [...state.bubbles]){ b.ttl-=dt; const p=BABYLON.Vector3.Project(b.node.getAbsolutePosition().add(new BABYLON.Vector3(0,1.7,0)), BABYLON.Matrix.IdentityReadOnly, scene.getTransformMatrix(), camera.viewport.toGlobal(engine.getRenderWidth(),engine.getRenderHeight())); b.div.style.left=p.x+'px'; b.div.style.top=p.y+'px'; if(b.ttl<=0){ b.div.remove(); state.bubbles=state.bubbles.filter(x=>x!==b); } }
  });
  engine.runRenderLoop(()=>scene.render()); window.addEventListener('resize',()=>engine.resize());
  log('v6 loaded: dimmer light, real PNG textures, low-poly mesh Geebrs/props');
}
main().catch(err=>{ console.error(err); document.body.innerHTML='<pre style="color:white;padding:20px">'+err.stack+'</pre>'; });
