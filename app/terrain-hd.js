/* geebr.world — HD terrain / diorama renderer (hd1)
 *
 * Replaces the old flat "grey micro-noise + vertex colour" island with a
 * proper textured diorama:
 *   - real 1k albedo textures, colour graded in-canvas for the storybook look
 *   - generated normal maps (Sobel on luminance) so tiles catch the key light
 *   - generated roughness/AO packed maps for PBR
 *   - continuous world-space UVs so grass reads as one meadow, not 168 stamps
 *   - alpha-tested grass tufts, clover, daisies, bushes, bevelled rim rocks
 *
 * Loaded before app.js; app.js calls window.GeebrHD.buildIsland(scene, api).
 */
(() => {
  'use strict';

  const TEX = './assets/textures/';
  const cache = new Map();

  function loadImage(url){
    return new Promise((resolve,reject)=>{
      const img=new Image();
      img.crossOrigin='anonymous';
      img.onload=()=>resolve(img);
      img.onerror=()=>reject(new Error('texture load failed: '+url));
      img.src=url;
    });
  }

  function canvasOf(w,h){ const c=document.createElement('canvas'); c.width=w; c.height=h; return c; }

  /* ---------- colour grading ---------------------------------------- */
  // opts: { sat, bright, contrast, tintR/G/B (multiply), gamma }
  function grade(img, opts={}){
    const S=opts.size||1024;
    const cv=canvasOf(S,S), ctx=cv.getContext('2d');
    ctx.drawImage(img,0,0,S,S);
    const data=ctx.getImageData(0,0,S,S), p=data.data;
    const sat=opts.sat??1, bright=opts.bright??1, contrast=opts.contrast??1;
    const tr=opts.tintR??1, tg=opts.tintG??1, tb=opts.tintB??1, gamma=opts.gamma??1;
    for(let i=0;i<p.length;i+=4){
      let r=p[i]/255, g=p[i+1]/255, b=p[i+2]/255;
      const l=r*.299+g*.587+b*.114;
      r=l+(r-l)*sat; g=l+(g-l)*sat; b=l+(b-l)*sat;
      r=(r-.5)*contrast+.5; g=(g-.5)*contrast+.5; b=(b-.5)*contrast+.5;
      r*=bright*tr; g*=bright*tg; b*=bright*tb;
      if(gamma!==1){ r=Math.pow(Math.max(0,r),gamma); g=Math.pow(Math.max(0,g),gamma); b=Math.pow(Math.max(0,b),gamma); }
      p[i]=Math.max(0,Math.min(255,r*255));
      p[i+1]=Math.max(0,Math.min(255,g*255));
      p[i+2]=Math.max(0,Math.min(255,b*255));
    }
    ctx.putImageData(data,0,0);
    return cv;
  }

  /* ---------- painted detail passes --------------------------------- */
  function paintGrassDetail(cv, seed=1){
    const ctx=cv.getContext('2d'), S=cv.width;
    let s=seed; const rnd=()=>{ s=(s*16807)%2147483647; return s/2147483647; };
    // broad clumps / mown patches (olive graded toward the mockup)
    for(let i=0;i<44;i++){
      const x=rnd()*S, y=rnd()*S, r=S*(.04+rnd()*.10);
      const g=ctx.createRadialGradient(x,y,1,x,y,r);
      const dark=rnd()<.5;
      g.addColorStop(0, dark?'rgba(42,48,20,0.28)':'rgba(150,158,84,0.18)');
      g.addColorStop(1,'rgba(0,0,0,0)');
      ctx.fillStyle=g; ctx.beginPath(); ctx.arc(x,y,r,0,7); ctx.fill();
    }
    // blade strokes
    ctx.lineCap='round';
    for(let i=0;i<9000;i++){
      const x=rnd()*S, y=rnd()*S, len=2.5+rnd()*7, a=-Math.PI/2+(rnd()-.5)*1.1;
      const bright=rnd();
      ctx.strokeStyle = bright<.42 ? 'rgba(48,56,24,0.32)'
                      : bright<.86 ? 'rgba(136,142,72,0.28)'
                                   : 'rgba(190,192,126,0.24)';
      ctx.lineWidth=.7+rnd()*1.2;
      ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x+Math.cos(a)*len,y+Math.sin(a)*len); ctx.stroke();
    }
    // clover dots + tiny blossoms baked at low contrast
    for(let i=0;i<420;i++){
      const x=rnd()*S, y=rnd()*S, r=1+rnd()*2.4;
      ctx.fillStyle=rnd()<.72?'rgba(100,116,52,0.32)':'rgba(226,230,200,0.28)';
      ctx.beginPath(); ctx.arc(x,y,r,0,7); ctx.fill();
    }
    return cv;
  }

  function paintDirtDetail(cv, seed=7){
    const ctx=cv.getContext('2d'), S=cv.width;
    let s=seed; const rnd=()=>{ s=(s*48271)%2147483647; return s/2147483647; };
    for(let i=0;i<52;i++){
      const x=rnd()*S, y=rnd()*S, r=S*(.03+rnd()*.08);
      const g=ctx.createRadialGradient(x,y,1,x,y,r);
      g.addColorStop(0, rnd()<.5?'rgba(58,38,20,0.28)':'rgba(176,142,92,0.20)');
      g.addColorStop(1,'rgba(0,0,0,0)');
      ctx.fillStyle=g; ctx.beginPath(); ctx.arc(x,y,r,0,7); ctx.fill();
    }
    // pebbles
    for(let i=0;i<1500;i++){
      const x=rnd()*S, y=rnd()*S, r=1+rnd()*3.4;
      const v=rnd();
      ctx.fillStyle = v<.5?'rgba(120,104,84,0.42)':'rgba(48,34,22,0.42)';
      ctx.beginPath(); ctx.ellipse(x,y,r,r*(.6+rnd()*.5),rnd()*3,0,7); ctx.fill();
      if(v>=.5){ ctx.fillStyle='rgba(210,196,168,0.20)'; ctx.beginPath(); ctx.arc(x-r*.25,y-r*.3,r*.45,0,7); ctx.fill(); }
    }
    // dried cracks
    ctx.strokeStyle='rgba(40,26,14,0.26)';
    for(let i=0;i<58;i++){
      let x=rnd()*S, y=rnd()*S; ctx.lineWidth=.6+rnd()*1.1; ctx.beginPath(); ctx.moveTo(x,y);
      for(let k=0;k<4;k++){ x+=(rnd()-.5)*26; y+=(rnd()-.5)*26; ctx.lineTo(x,y); }
      ctx.stroke();
    }
    return cv;
  }

  function paintStoneDetail(cv, seed=13){
    const ctx=cv.getContext('2d'), S=cv.width;
    let s=seed; const rnd=()=>{ s=(s*69621)%2147483647; return s/2147483647; };
    for(let i=0;i<220;i++){
      const x=rnd()*S, y=rnd()*S, r=6+rnd()*30;
      ctx.fillStyle=rnd()<.5?'rgba(180,186,196,0.13)':'rgba(46,50,58,0.16)';
      ctx.beginPath();
      for(let k=0;k<6;k++){ const a=k/6*Math.PI*2+rnd()*.4; const px=x+Math.cos(a)*r*(.72+rnd()*.4), py=y+Math.sin(a)*r*(.72+rnd()*.4); k?ctx.lineTo(px,py):ctx.moveTo(px,py); }
      ctx.closePath(); ctx.fill();
    }
    ctx.strokeStyle='rgba(28,32,38,0.32)';
    for(let i=0;i<220;i++){
      let x=rnd()*S, y=rnd()*S; ctx.lineWidth=.7+rnd()*1.4; ctx.beginPath(); ctx.moveTo(x,y);
      for(let k=0;k<3;k++){ x+=(rnd()-.5)*40; y+=(rnd()-.5)*40; ctx.lineTo(x,y); }
      ctx.stroke();
    }
    // moss creeping in from the grass side
    for(let i=0;i<180;i++){
      const x=rnd()*S, y=rnd()*S, r=3+rnd()*11;
      ctx.fillStyle='rgba(74,116,52,0.16)';
      ctx.beginPath(); ctx.arc(x,y,r,0,7); ctx.fill();
    }
    return cv;
  }

  // Chipped-rock detail for the edge cubes: broad tonal patches plus a few
  // sharp light chips and dark pits. Deliberately has no repeating structure,
  // unlike paintStoneDetail() which draws mortar courses.
  function paintStoneChips(cv, seed=71){
    const ctx=cv.getContext('2d'), S=cv.width;
    let s=seed; const rnd=()=>{ s=(s*16807)%2147483647; return s/2147483647; };
    for(let i=0;i<70;i++){
      const x=rnd()*S, y=rnd()*S, r=S*(.05+rnd()*.16);
      const g=ctx.createRadialGradient(x,y,1,x,y,r);
      const up=rnd()<.5;
      g.addColorStop(0,'rgba('+(up?'236,232,222':'52,52,48')+','+(.05+rnd()*.09).toFixed(3)+')');
      g.addColorStop(1,'rgba(0,0,0,0)');
      ctx.fillStyle=g; ctx.beginPath(); ctx.arc(x,y,r,0,7); ctx.fill();
    }
    for(let i=0;i<130;i++){
      const x=rnd()*S, y=rnd()*S, w=2+rnd()*9, h=2+rnd()*7;
      ctx.fillStyle=rnd()<.55
        ? 'rgba(226,222,210,'+(.05+rnd()*.13).toFixed(3)+')'
        : 'rgba(38,38,34,'+(.05+rnd()*.15).toFixed(3)+')';
      ctx.save(); ctx.translate(x,y); ctx.rotate(rnd()*3.14);
      ctx.fillRect(-w*.5,-h*.5,w,h); ctx.restore();
    }
    return cv;
  }

  function paintStrataDetail(cv, seed=29){
    const ctx=cv.getContext('2d'), S=cv.width;
    let s=seed; const rnd=()=>{ s=(s*40692)%2147483647; return s/2147483647; };
    // horizontal sediment bands (v is vertical on the cliff faces)
    for(let y=0;y<S;){
      const h=3+rnd()*26;
      const shade=rnd();
      ctx.fillStyle = shade<.34 ? 'rgba(52,36,22,0.34)'
                    : shade<.7  ? 'rgba(104,84,62,0.24)'
                                : 'rgba(150,132,108,0.18)';
      ctx.fillRect(0,y,S,h);
      y+=h;
    }
    for(let i=0;i<2600;i++){
      const x=rnd()*S, y=rnd()*S, r=1+rnd()*3.6;
      ctx.fillStyle=rnd()<.5?'rgba(30,20,12,0.34)':'rgba(178,160,134,0.24)';
      ctx.beginPath(); ctx.arc(x,y,r,0,7); ctx.fill();
    }
    // vertical chisel marks
    ctx.strokeStyle='rgba(24,16,10,0.22)';
    for(let i=0;i<160;i++){
      const x=rnd()*S, y=rnd()*S, l=8+rnd()*40;
      ctx.lineWidth=.6+rnd()*1.3;
      ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x+(rnd()-.5)*6,y+l); ctx.stroke();
    }
    return cv;
  }

  /* ---------- macro height field (for geometry-only variation) ------ */
  function macroHeightCanvas(size=1024, seed=5, patches=44, contrast=0.5){
    const cv=canvasOf(size,size), ctx=cv.getContext('2d');
    ctx.fillStyle='#808080'; ctx.fillRect(0,0,size,size);
    let s=seed; const rnd=()=>{ s=(s*16807)%2147483647; return s/2147483647; };
    for(let i=0;i<patches;i++){
      const x=rnd()*size, y=rnd()*size, r=size*(.06+rnd()*.14);
      const up=rnd()<.5;
      const a=(.10+rnd()*.16)*contrast;
      const g=ctx.createRadialGradient(x,y,1,x,y,r);
      g.addColorStop(0, up?`rgba(255,255,255,${a.toFixed(3)})`:`rgba(0,0,0,${a.toFixed(3)})`);
      g.addColorStop(1,'rgba(128,128,128,0)');
      ctx.fillStyle=g; ctx.beginPath(); ctx.arc(x,y,r,0,7); ctx.fill();
    }
    return cv;
  }

  /* ---------- stone-floor height field: irregular rectangular tiles --
     Jittered wobbly-edged rectangles (periodic grid), hairline grooves,
     tiny per-cell level offsets + micro bump. No straight machine lines. */
  function stoneFloorHeight(size=512, seed=5, cells=5, groovePx=3){
    let s=seed; const rnd=()=>{ s=(s*16807)%2147483647; return s/2147483647; };
    const cs=size/cells;
    // per-cell rect insets + level offset + bump phase
    const ins=new Float32Array(cells*cells*4), lvl=new Float32Array(cells*cells), ph=new Float32Array(cells*cells);
    for(let i=0;i<cells*cells;i++){
      ins[i*4]=cs*(.03+rnd()*.05); ins[i*4+1]=cs*(.03+rnd()*.05);
      ins[i*4+2]=cs*(.03+rnd()*.05); ins[i*4+3]=cs*(.03+rnd()*.05);
      lvl[i]=(rnd()-.5)*.05;            // tiny height offset per cell
      ph[i]=rnd()*6.28;
    }
    function wob(x,y,f,p){ return Math.sin(x*f+p)*.55+Math.sin(y*f*1.37+p*1.9)*.45; }
    const H=new Float32Array(size*size);
    for(let y=0;y<size;y++){
      for(let x=0;x<size;x++){
        const gx=Math.floor(x/cs), gy=Math.floor(y/cs);
        const i=((gy%cells+cells)%cells)*cells+((gx%cells+cells)%cells);
        const lx=x-gx*cs, ly=y-gy*cs;
        // wobbled edges: perturb distance-to-edge with low-freq noise
        const w1=wob(x,y,.11,ph[i])*1.6, w2=wob(y,x,.097,ph[i]*2.3)*1.6;
        const dL=lx-ins[i*4]+w1, dR=(cs-ins[i*4+1])-lx+w1;
        const dT=ly-ins[i*4+2]+w2, dB=(cs-ins[i*4+3])-ly+w2;
        const b=Math.min(dL,dR,dT,dB);          // >0 inside the rect, 0 at edge
        // hairline groove: ramp only groovePx wide
        let h=Math.min(1,Math.max(0,b)/groovePx);
        h=h*h*(3-2*h);
        // micro bump inside the cell (very subtle)
        const bump=Math.sin(x*.55+ph[i]*3)*Math.sin(y*.49+ph[i])*0.012;
        H[y*size+x]=.82+.18*h+lvl[i]+bump;
      }
    }
    const cv=canvasOf(size,size), ctx=cv.getContext('2d');
    const img=ctx.createImageData(size,size), q=img.data;
    for(let i=0;i<H.length;i++){
      const v=Math.max(0,Math.min(255,H[i]*255));
      q[i*4]=v; q[i*4+1]=v; q[i*4+2]=v; q[i*4+3]=255;
    }
    ctx.putImageData(img,0,0);
    return cv;
  }

  /* ---------- normal map (Sobel on luminance) ----------------------- */
  function normalFromCanvas(src, strength=2.2){
    const S=src.width, H=src.height;
    const sctx=src.getContext('2d');
    const p=sctx.getImageData(0,0,S,H).data;
    const lum=new Float32Array(S*H);
    for(let i=0,j=0;i<p.length;i+=4,j++) lum[j]=(p[i]*.299+p[i+1]*.587+p[i+2]*.114)/255;
    const out=canvasOf(S,H), octx=out.getContext('2d');
    const img=octx.createImageData(S,H), q=img.data;
    const at=(x,y)=>lum[((y+H)%H)*S+((x+S)%S)];
    for(let y=0;y<H;y++){
      for(let x=0;x<S;x++){
        const tl=at(x-1,y-1), t=at(x,y-1), tr=at(x+1,y-1);
        const l=at(x-1,y),               r=at(x+1,y);
        const bl=at(x-1,y+1), b=at(x,y+1), br=at(x+1,y+1);
        const dx=(tr+2*r+br)-(tl+2*l+bl);
        const dy=(bl+2*b+br)-(tl+2*t+tr);
        let nx=-dx*strength, ny=-dy*strength, nz=1;
        const len=Math.hypot(nx,ny,nz)||1;
        nx/=len; ny/=len; nz/=len;
        const o=(y*S+x)*4;
        q[o]  =(nx*.5+.5)*255;
        q[o+1]=(ny*.5+.5)*255;
        q[o+2]=(nz*.5+.5)*255;
        q[o+3]=255;
      }
    }
    octx.putImageData(img,0,0);
    return out;
  }

  /* ---------- metallic/roughness/AO pack (B=metal, G=rough, R=AO) --- */
  function ormFromCanvas(src, roughBase=.86, roughVar=.22, aoStrength=.55){
    const S=src.width, H=src.height;
    const p=src.getContext('2d').getImageData(0,0,S,H).data;
    const out=canvasOf(S,H), octx=out.getContext('2d');
    const img=octx.createImageData(S,H), q=img.data;
    for(let i=0;i<p.length;i+=4){
      const l=(p[i]*.299+p[i+1]*.587+p[i+2]*.114)/255;
      const ao=1-(1-l)*aoStrength;                 // dark pixels read as crevices
      const rough=roughBase+(1-l)*roughVar;
      q[i]  =Math.max(0,Math.min(255,ao*255));
      q[i+1]=Math.max(0,Math.min(255,rough*255));
      q[i+2]=0;                                    // fully dielectric
      q[i+3]=255;
    }
    octx.putImageData(img,0,0);
    return out;
  }

  function dyn(scene,name,cv,{wrap=true,aniso=8,invertY=false}={}){
    const t=new BABYLON.DynamicTexture(name,cv,scene,true);
    t.update(invertY);
    const mode = wrap ? BABYLON.Texture.WRAP_ADDRESSMODE : BABYLON.Texture.CLAMP_ADDRESSMODE;
    t.wrapU=mode; t.wrapV=mode;
    t.anisotropicFilteringLevel=aniso;
    return t;
  }

  /* ---------- PBR surface built from one source png ----------------- */
  async function surface(scene,{name,file,gradeOpts,paint,normalStrength,rough,roughVar,ao,normalSrc,flatColor}){
    const key='surf:'+name;
    if(cache.has(key)) return cache.get(key);
    let albedoCv;
    if(flatColor){ albedoCv=canvasOf(64,64); const fc=albedoCv.getContext('2d'); fc.fillStyle=flatColor; fc.fillRect(0,0,64,64); }
    else { const img=await loadImage(TEX+file); albedoCv=grade(img,gradeOpts); }
    if(paint) paint(albedoCv);
    const m=new BABYLON.PBRMaterial('hd_'+name,scene);
    m.albedoTexture=dyn(scene,'hd_'+name+'_alb',albedoCv);
    m.bumpTexture=dyn(scene,'hd_'+name+'_nrm',normalFromCanvas(normalSrc||albedoCv,normalStrength??2.2));
    m.bumpTexture.level=1.0;
    m.invertNormalMapY=true;
    m.metallicTexture=dyn(scene,'hd_'+name+'_orm',ormFromCanvas(albedoCv,rough??.86,roughVar??.2,ao??.55));
    m.useMetallnessFromMetallicTextureBlue=true;
    m.useRoughnessFromMetallicTextureGreen=true;
    m.useRoughnessFromMetallicTextureAlpha=false;
    m.useAmbientOcclusionFromMetallicTextureRed=true;
    m.metallic=0; m.roughness=1;
    m.environmentIntensity=.55;
    m.specularIntensity=.35;
    cache.set(key,m);
    return m;
  }

  function roundedTile(name, width, depth, height, radius, scene, topColor, sideColor){
    const w=width*.5, d=depth*.5, r=Math.min(radius,w*.45,d*.45), bevel=.045;
    const m=new BABYLON.Mesh(name,scene);
    const positions=[], indices=[], colors=[];
    const outer=[[-w+r,-d],[w-r,-d],[w,-d+r],[w,d-r],[w-r,d],[-w+r,d],[-w,d-r],[-w,-d+r]];
    const iw=w-bevel, id=d-bevel, ir=Math.max(.02,r-bevel*.35);
    const inner=[[-iw+ir,-id],[iw-ir,-id],[iw,-id+ir],[iw,id-ir],[iw-ir,id],[-iw+ir,id],[-iw,id-ir],[-iw,-id+ir]];
    const push=(x,y,z,c)=>{ positions.push(x,y,z); colors.push(c.r,c.g,c.b,1); return positions.length/3-1; };
    const topCenter=push(0,0,0,topColor), bottomCenter=push(0,-height,0,sideColor);
    const top=[], lip=[], bottom=[];
    const bevelColor=new BABYLON.Color4(topColor.r*.78,topColor.g*.82,topColor.b*.68,1);
    for(let i=0;i<outer.length;i++){
      top.push(push(inner[i][0],0,inner[i][1],topColor));
      lip.push(push(outer[i][0],-bevel,outer[i][1],bevelColor));
      bottom.push(push(outer[i][0],-height,outer[i][1],sideColor));
    }
    for(let i=0;i<outer.length;i++){
      const j=(i+1)%outer.length;
      indices.push(topCenter,top[i],top[j]);
      indices.push(top[i],lip[i],lip[j], top[i],lip[j],top[j]);
      indices.push(lip[i],bottom[i],bottom[j], lip[i],bottom[j],lip[j]);
      indices.push(bottomCenter,bottom[j],bottom[i]);
    }
    const vd=new BABYLON.VertexData();
    vd.positions=positions; vd.indices=indices; vd.colors=colors;
    const normals=[]; BABYLON.VertexData.ComputeNormals(positions,indices,normals); vd.normals=normals;
    vd.applyToMesh(m,true);
    return m;
  }

  window.GeebrHD = { version:'hd1', surface, normalFromCanvas, ormFromCanvas, grade, dyn, loadImage, macroHeightCanvas, stoneFloorHeight,
                     paintGrassDetail, paintDirtDetail, paintStoneDetail, paintStoneChips, paintStrataDetail, canvasOf, roundedTile };
})();

/* ==================================================================
 * Part 2 — diorama geometry: island, bedrock, vegetation, water, sky
 * ================================================================== */
(() => {
  'use strict';
  const HD = window.GeebrHD;
  const V3 = (x,y,z) => new BABYLON.Vector3(x,y,z);
  const C3 = (r,g,b) => new BABYLON.Color3(r,g,b);
  const rect = (u0,v0,u1,v1) => new BABYLON.Vector4(u0,v0,u1,v1);

  let API = null; // { WORLD, hashNoise, smoothNoise, proceduralTerrainAt, addShadow, state }

  function noise(x,z){ return API.hashNoise(x,z); }
  function merge(list,name,material,{shadows=true,pickable=false}={}){
    if(!list.length) return null;
    const m = list.length===1 ? list[0] : BABYLON.Mesh.MergeMeshes(list,true,true,undefined,false,false);
    if(!m) return null;
    m.name=name; if(material) m.material=material;
    m.isPickable=pickable; m.receiveShadows=shadows; m.useVertexColors=true;
    return m;
  }


  /* ---------- shared island edge profile ------------------------------
   * ONE deterministic description of the perimeter, consumed by the grass
   * cascade in buildIslandTop(), the stone hem in buildBedrock() and the
   * scatter in buildVegetation(). Interleaving grass, stone and plants is the
   * whole point of the reference edge, and that is only possible if all three
   * builders agree on which cells step down.
   * -------------------------------------------------------------------- */
  const TOP_Y      = .445;          // measured grass slab top
  const CAP_BOTTOM = TOP_Y - .87;   // measured grass slab underside
  // Raised from -3.05. The camera never sees below the waterline (beta .22 to
  // 1.42), so a deep wall was pure cost; a high sea is what makes the edge read
  // as a shallow hem rather than a cliff.
  const SEA_LEVEL  = -1.42;
  // Visible green on the plateau's vertical face before the stone hem starts.
  // The grass slab is 0.87 tall and only its top is green, so without this the
  // edge is dominated by a 0.87-unit dark-green wall rather than by stone.
  const GRASS_LIP  = .26;

  let EDGE_CACHE=null;
  function edgeProfile(){
    if(EDGE_CACHE) return EDGE_CACHE;
    const { WORLD }=API;
    let seed=0x1c3ff5;
    const rnd=()=>{ seed=(seed*1664525+1013904223)>>>0; return seed/4294967296; };
    const cells=[];
    for(const axis of ['x','z']) for(const side of [-1,1]){
      const half = axis==='x' ? WORLD.halfW : WORLD.halfH;
      const n=Math.round(half*2);
      for(let i=0;i<n;i++){
        const corner = i===0 || i===n-1;
        // 36% of the perimeter steps the plateau down and out one tile; a
        // sixth of those step again, so the green cascades instead of stopping.
        const step = corner ? 0 : (rnd()<.58 ? (rnd()<.34?2:1) : 0);
        const stepOut = .30+rnd()*.16;
        const c={
          axis, side, corner, step,
          along: -half+.5+i,
          stepOut, stepDrop: .54,
          stepOut2: stepOut+.66, stepDrop2: 1.10,
          stepShift: (rnd()-.5)*.30,
          perch: !corner && rnd()<.26,
          scatter: !corner && rnd()<.16,
          rA: rnd(), rB: rnd(), rC: rnd(), rD: rnd()
        };
        // Sub-columns: TWO stone cubes per grass tile across, which is the
        // proportion in the reference. One tile-wide block per cell always
        // reads as a wall panel however it is toned or staggered.
        c.cols=[];
        const wide=!corner && !step && rnd()<.26;   // one full-tile cube here
        for(let k=0;k<(wide?1:2);k++){
          const along=c.along+(wide?0:(k?.25:-.25));
          if(step){
            // Sit directly under the grass tile that stepped out here, so the
            // cascade has something to stand on.
            const s2 = step===2 && k===1;
            const off  = s2?c.stepOut2:c.stepOut;
            const drop = s2?c.stepDrop2:c.stepDrop;
            c.cols.push({ along, top: TOP_Y-drop-GRASS_LIP-rnd()*.10, out: off+.26+rnd()*.12,
                          r:rnd(), r2:rnd(), wide });
          } else {
            // Vertical jitter on the tread is what stops neighbouring cubes
            // from being coplanar and hiding each other's top faces.
            // Only a shallow vertical jitter: a deep one exposes the core
            // under the plateau. Depth variety comes from `out`.
            c.cols.push({ along, top: TOP_Y-GRASS_LIP-rnd()*.09,
                          out: (corner?.04:.03)+rnd()*(corner?.10:.20),
                          r:rnd(), r2:rnd(), wide });
          }
        }
        // Kept for the vegetation pass, which seeds plants on the treads.
        c.ledges=c.cols.map(q=>({ top:q.top, out:q.out }));
        cells.push(c);
      }
    }
    EDGE_CACHE={ cells };
    return EDGE_CACHE;
  }

  /* ---------- 1. island top surface ---------------------------------- */
  async function buildIslandTop(scene){
    const { WORLD } = API;
    const REPEAT = 3.6;
    const GAP = .014;

    const mats = {
      dirt: await HD.surface(scene,{ name:'dirt', file:'dirt_path.png',
        gradeOpts:{ sat:.72, bright:1.10, contrast:1.02, tintR:1.05, tintG:.98, tintB:.86 },
        paint:cv=>HD.paintDirtDetail(cv,31), normalStrength:3.0, rough:.94, roughVar:.08, ao:.62 }),
      stone: await HD.surface(scene,{ name:'stone', file:'stone_blocks.png',
        gradeOpts:{ sat:.66, bright:.74, contrast:1.24, tintR:.98, tintG:1.00, tintB:1.08 },
        paint:cv=>HD.paintStoneDetail(cv,53), normalStrength:3.4, rough:.82, roughVar:.14, ao:.68 })
    };

    // The corrected Tripo grass tile has real baked AO and roughness 0.88.
    // Import it once, clone it for grass cells, and merge the clones. This is
    // intentionally behind ?procedural=1 so the old generated slab remains an
    // immediate A/B/rollback path while the asset is being locked down.
    const useGrassGLB=!new URLSearchParams(location.search).has('procedural');
    let grassProto=null, grassRoot=null;
    if(useGrassGLB){
      try{
        const result=await BABYLON.SceneLoader.ImportMeshAsync('', './assets/models/tiles/', 'grass_v7_orm.glb', scene);
        grassRoot=result.meshes.find(m=>m.getTotalVertices?.()>0) || result.meshes[0];
        if(grassRoot){
          grassProto=grassRoot;
          grassProto.name='hd_grass_proto'; grassProto.isVisible=false; grassProto.setEnabled(false);
          window.GEEBR_LOOK?.applyClayLookToMeshes(result.meshes,scene,{detail:.11,detailScale:5});
        }
      }catch(err){ console.warn('grass GLB unavailable; using procedural slab',err); }
    }
    if(!grassProto){
      mats.grass=await HD.surface(scene,{ name:'grass', flatColor:'#71883a',
        normalSrc:HD.macroHeightCanvas(512,17,34,.52), normalStrength:.72, rough:.94, roughVar:.04, ao:.12 });
    }

    const groups = { grass:[], dirt:[], stone:[] };
    let yawSeed=0x5eed1234;
    const yawRnd=()=>{ yawSeed=(yawSeed*1664525+1013904223)>>>0; return yawSeed/4294967296; };
    for(let tx=-WORLD.halfW; tx<WORLD.halfW; tx++){
      for(let tz=-WORLD.halfH; tz<WORLD.halfH; tz++){
        const cx=tx+.5, cz=tz+.5;
        const kind = API.proceduralTerrainAt(cx,cz);
        const key = groups[kind] ? kind : 'grass';
        const n=noise(tx*3.1+5,tz*2.7-3);
        const h=.42+n*.025;
        const lift=(noise(tx*7.7,tz*5.3)-.5)*.018;
        let box;
        if(key==='grass' && grassProto){
          box=grassProto.clone('hd_grass_tile');
          box.setEnabled(true); box.isVisible=true; box.isPickable=false;
          box.rotation.y=Math.floor(yawRnd()*4)*Math.PI/2;
          box.scaling.x=(yawRnd()<.5?-1:1)*1.006;
          box.scaling.z=(yawRnd()<.5?-1:1)*1.006;
          // The source footprint is 0.996 x 1.000. A tiny uniform expansion
          // closes sub-pixel gaps without returning to the old inset-tile hack.
          box.scaling.y=1.006;
          box.position.set(cx,lift+.010,cz);
        } else {
          const u0=(tx+WORLD.halfW)/REPEAT, u1=(tx+1+WORLD.halfW)/REPEAT;
          const v0=(tz+WORLD.halfH)/REPEAT, v1=(tz+1+WORLD.halfH)/REPEAT;
          const top=rect(u0,v0,u1,v1), side=rect(u0,0,u1,.55);
          const t=.94+noise(tx*11.3+1,tz*13.7+9)*.13;
          const warm=.97+noise(tx*5.9,tz*3.3)*.07;
          const topC=new BABYLON.Color4(t*warm,t,t*(2-warm),1);
          const sideC=key==='grass' ? new BABYLON.Color4(.27*t,.30*t,.12*t,1) : new BABYLON.Color4(topC.r*.40,topC.g*.37,topC.b*.33,1);
          box=key==='grass'
            ? HD.roundedTile('hd_tile',1-GAP,1-GAP,h,.075,scene,topC,sideC)
            : BABYLON.MeshBuilder.CreateBox('hd_tile',{ width:1-GAP,height:h,depth:1-GAP,
                faceUV:[side,side,side,side,top,side],faceColors:[sideC,sideC,sideC,sideC,topC,new BABYLON.Color4(.10,.09,.07,1)],wrap:true },scene);
          box.position.set(cx,-h/2+lift,cz);
        }
        groups[key].push(box);
      }
    }
    // Grass cascade. The reference plateau does not stop at a line: part of
    // the perimeter steps down and outward one or two tiles before the stone
    // takes over. These are real grass_v7 clones, not boxes, so they carry the
    // same baked AO and material as the plateau and merge into the same mesh.
    if(grassProto){
      for(const c of edgeProfile().cells){
        if(!c.step) continue;
        const outHalf=c.axis==='x'?WORLD.halfH:WORLD.halfW;
        for(let s=0;s<c.step;s++){
          const off =s?c.stepOut2:c.stepOut;
          const drop=s?c.stepDrop2:c.stepDrop;
          const along=c.along+(s?c.stepShift:0);
          const outward=outHalf+off;
          const x=c.axis==='x'?along:c.side*outward;
          const z=c.axis==='x'?c.side*outward:along;
          const box=grassProto.clone('hd_grass_step');
          box.setEnabled(true); box.isVisible=true; box.isPickable=false;
          box.rotation.y=Math.floor(yawRnd()*4)*Math.PI/2;
          box.scaling.x=(yawRnd()<.5?-1:1)*1.006;
          box.scaling.z=(yawRnd()<.5?-1:1)*1.006;
          box.scaling.y=1.006;
          box.position.set(x,.010-drop,z);
          groups.grass.push(box);
        }
      }
    }

    const out={};
    for(const k of Object.keys(groups)){
      if(!groups[k].length) continue;
      // GLB clones already carry the corrected material; other groups receive
      // their generated PBR surface during merge.
      out[k]=merge(groups[k],'hd_island_'+k,k==='grass'&&grassProto?null:mats[k]);
      if(out[k] && k==='grass' && grassProto) out[k].material=grassProto.material;
    }
    const usedGrassGLB=!!grassProto;
    grassProto?.dispose();
    API.state.hdMaterials=Object.assign(API.state.hdMaterials||{},mats);
    API.state.usingGrassGLB=usedGrassGLB;
    if(out.grass?.material) API.state.hdMaterials.grassGLB=out.grass.material;
    API.state.terrainTopY=TOP_Y;
    return out;
  }

  /* ---------- 2. coherent carved cliff perimeter ---------------------- */
  // Discard every triangle above a local-space height so an accent contributes
  // only its rock buttress. The alternative (sinking the piece) can never work:
  // the cap is the TOP of the asset and the piece projects PAST the wall, so any
  // visible green reads as a second grass ledge.
  // side>0 keeps geometry BELOW limitY, side<0 keeps geometry ABOVE it.
  // Measured: the Tripo cliff assets carry their grass cap at the BOTTOM of
  // local space, not the top, so cutting the top left the green behind.
  function trimSlab(mesh,limitY,side){
    const pos=mesh.getVerticesData(BABYLON.VertexBuffer.PositionKind);
    const idx=mesh.getIndices();
    if(!pos||!idx) return 0;
    const keep=[];
    for(let i=0;i<idx.length;i+=3){
      const a=idx[i],b=idx[i+1],c=idx[i+2];
      const ya=pos[a*3+1],yb=pos[b*3+1],yc=pos[c*3+1];
      const ok = side>0 ? Math.max(ya,yb,yc)<=limitY : Math.min(ya,yb,yc)>=limitY;
      if(ok) keep.push(a,b,c);
    }
    const dropped=(idx.length-keep.length)/3;
    mesh.setIndices(keep);
    mesh.refreshBoundingInfo();
    return dropped;
  }

  async function importCliffAsset(scene,file,name,trimFraction=0,trimSide=1){
    const r=await BABYLON.SceneLoader.ImportMeshAsync('', './assets/models/tiles/', file, scene);
    const mesh=r.meshes.find(m=>m.getTotalVertices?.()>0);
    if(!mesh) throw new Error('no renderable mesh in '+file);
    mesh.name=name; mesh.parent=null; mesh.setEnabled(true); mesh.isVisible=false; mesh.isPickable=false;
    const b=mesh.getHierarchyBoundingVectors(true), ext=b.max.subtract(b.min);
    // Centre the footprint in x/z but keep the base at y=0, so rotation.y spins
    // about the piece rather than a corner and placement maths stays readable.
    mesh.position.set(-(b.min.x+b.max.x)*.5,-b.min.y,-(b.min.z+b.max.z)*.5);
    const scale=1/Math.max(ext.x,ext.z);
    mesh.scaling.setAll(scale); mesh.bakeCurrentTransformIntoVertices(); mesh.position.set(0,0,0);
    const assetHeight=ext.y*scale;
    mesh.metadata=Object.assign(mesh.metadata||{},{assetHeight});
    if(trimFraction>0){
      // Cut the grass end off and drop the remainder back to y=0 so callers can
      // place the piece by its base like any other block.
      const limit=trimSide>0 ? assetHeight*(1-trimFraction) : assetHeight*trimFraction;
      trimSlab(mesh,limit,trimSide);
      const bb=mesh.getBoundingInfo().boundingBox;
      mesh.position.y=-bb.minimum.y;
      mesh.bakeCurrentTransformIntoVertices();
      mesh.position.set(0,0,0);
      mesh.refreshBoundingInfo();
      mesh.metadata.trimmedHeight=mesh.getBoundingInfo().boundingBox.maximum.y;
    }
    window.GEEBR_LOOK?.applyClayLookToMeshes(r.meshes,scene,{detail:.11,detailScale:5});
    return mesh;
  }

  // World units per masonry texture repeat. Boxes carry real face UVs so the
  // graded stone albedo / generated normal / ORM maps actually resolve; the old
  // roundedTile() path emitted no UVs at all and read as flat brown slabs.
  const STONE_UV = 3.4;

  // Faces are toned separately. A single tone per block made every plane in
  // the terrace equal, so the blocks fused into a wall; the reference reads as
  // cubes precisely because each one's top face is the brightest thing on it.
  function stoneBox(scene,name,w,h,d,x,y,z,mat,tone,ry=0){
    const uw=w/STONE_UV, uh=h/STONE_UV, ud=d/STONE_UV;
    const fz=rect(0,0,uw,uh), fx=rect(0,0,ud,uh), fy=rect(0,0,uw,ud);
    const g=v=>{ const t=Math.min(1.55,tone*v); return new BABYLON.Color4(t,t,t,1); };
    const top=g(1.42), bot=g(.20), lit=g(1.04), shade=g(.60);
    const m=BABYLON.MeshBuilder.CreateBox(name,{ width:w, height:h, depth:d,
      faceUV:[fz,fz,fx,fx,fy,fy],
      faceColors:[lit,shade,lit,shade,top,bot], wrap:true },scene);
    m.position.set(x,y,z);
    if(ry) m.rotation.y=ry;
    m.material=mat; m.isPickable=false; m.receiveShadows=true;
    return m;
  }

  // Faceted rock. An icosphere with jittered vertices and flat shading reads
  // as a quarried boulder under the clay look, and unlike a box it never lines
  // up with the cube grid behind it.
  function boulder(scene,name,r,x,y,z,mat,tone,rnd){
    const m=BABYLON.MeshBuilder.CreateIcoSphere(name,{ radius:r, subdivisions:2, flat:true },scene);
    const p=m.getVerticesData(BABYLON.VertexBuffer.PositionKind);
    // flat:true DUPLICATES vertices per face, so each corner appears five or six
    // times. The displacement must therefore be a function of the ORIGINAL
    // position, not of the array index: jittering the array directly moves each
    // copy of a corner somewhere different and tears the solid into shards.
    const seen=new Map();
    const disp=(vx,vy,vz)=>{
      const key=Math.round(vx*1e4)+'|'+Math.round(vy*1e4)+'|'+Math.round(vz*1e4);
      let d=seen.get(key);
      if(!d){ d=[.82+rnd()*.30, .60+rnd()*.30]; seen.set(key,d); }
      return d;
    };
    for(let i=0;i<p.length;i+=3){
      const d=disp(p[i],p[i+1],p[i+2]);
      p[i]*=d[0]; p[i+1]*=d[0]*d[1]; p[i+2]*=d[0];
    }
    m.updateVerticesData(BABYLON.VertexBuffer.PositionKind,p);
    const cols=new Float32Array((p.length/3)*4);
    for(let i=0;i<cols.length;i+=4){ cols[i]=cols[i+1]=cols[i+2]=tone; cols[i+3]=1; }
    m.setVerticesData(BABYLON.VertexBuffer.ColorKind,cols);
    const nrm=[]; BABYLON.VertexData.ComputeNormals(p,m.getIndices(),nrm);
    m.setVerticesData(BABYLON.VertexBuffer.NormalKind,nrm);
    m.position.set(x,y,z); m.rotation.y=rnd()*Math.PI*2;
    m.material=mat; m.isPickable=false; m.receiveShadows=true;
    return m;
  }

  async function buildBedrock(scene){
    const { WORLD }=API;
    // Plain quarried stone. NOT stone_blocks.png: that texture is a printed
    // grid of small square tiles, so every cube face wore brickwork and a row
    // of them fused into a retaining wall however the geometry was staggered.
    // The reference cubes are unpatterned mottled rock; stone_soft.png has the
    // blotch without the grid.
    const stone=await HD.surface(scene,{ name:'cliff_masonry', file:'stone_soft.png',
      gradeOpts:{ sat:1.02, bright:1.24, contrast:1.26, tintR:1.00, tintG:1.00, tintB:1.01 },
      paint:cv=>HD.paintStoneChips(cv,71), normalStrength:1.9, rough:.90, roughVar:.10, ao:.72 });
    stone.environmentIntensity=1.05;
    // Every cliff face is vertical while the key light points down (-.48,-.86,
    // .62), so lights barely reach them: a large hemi lift measured only about
    // +5 levels. A low emissive copy of the albedo lifts the value into the
    // reference's mid blue-grey while keeping the masonry detail, which a flat
    // ambient term would wash out.
    stone.emissiveTexture=stone.albedoTexture;
    stone.emissiveColor=new BABYLON.Color3(.026,.028,.030);

    const E=edgeProfile();
    const TERRACE_TOP=CAP_BOTTOM+.30;
    const BOT=SEA_LEVEL-.80;

    const blocks=[], shore=[], perches=[];
    let seed=0xbed40c;
    const rnd=()=>{ seed=(seed*1664525+1013904223)>>>0; return seed/4294967296; };
    // Mid values, separated block to block. The reference distinguishes cubes
    // by value, not by hue, and nothing in it is close to black.
    const tone=()=>{ const r=rnd(); return r<.26?.62+rnd()*.12 : r<.74?.80+rnd()*.11 : .96+rnd()*.08; };
    // Depth grading. A uniformly random tone spreads the darks evenly over the
    // whole hem, but the reference concentrates them low down and in recesses,
    // which is where its near-black comes from. y is the block top.
    const depthTone=(y,recess=0)=>{
      const f=Math.min(1,Math.max(0,(TOP_Y-GRASS_LIP-y)/1.5));
      return tone()*(1-f*.46)*(1-recess*.22);
    };

    // Deepest inner face reached by any cube, so the core can be pulled back
    // behind them: a core flush with the plateau edge reads as a continuous
    // back wall through the seams.
    let coreX=0, coreZ=0;

    const put=(list,name,c,along,face,w,h,d,cyTop,t)=>{
      const outward=face-d*.5;
      const inner=face-d;
      if(c.axis==='x') coreZ=Math.max(coreZ,inner); else coreX=Math.max(coreX,inner);
      const x=c.axis==='x'?along:c.side*outward;
      const z=c.axis==='x'?c.side*outward:along;
      const m=stoneBox(scene,name,c.axis==='x'?w:d,h,c.axis==='x'?d:w,
        x,cyTop-h*.5,z,stone,t);
      list.push(m); return m;
    };

    const COURSE=.46;    // cubes read wider than tall, as in the reference
    for(const c of E.cells){
      const outHalf = c.axis==='x' ? WORLD.halfH : WORLD.halfW;
      for(const col of c.cols){
        let top=col.top, ci=0;
        while(top>BOT+.10){
          const last=(top-COURSE)<=BOT+.10;
          const h=last?top-BOT:COURSE*(.92+col.r*.16);
          // Batter: each course steps back slightly, with jitter, and the odd
          // one juts proud so the waterline is not a straight extrusion.
          const jut=(ci>0 && ((ci*7+col.r2*11)%3)<1)?.20:0;
          const out=Math.max(.01, col.out-ci*.05+jut+(rnd()-.5)*.30);
          // Depth derived from the outward offset, so the inner face always
          // lands the same distance inside the plateau edge: that is what makes
          // the terrace void-proof however far a cube steps out.
          const d=out+1.06+rnd()*.16;
          // Seam must be wide enough for SSAO to resolve at review distance;
          // at 0.04 it was finer than the sample radius and contributed nothing.
          const w=(col.wide?.84:.37)+rnd()*.04;
          // Recessed courses take an extra tone cut: a block set back behind
          // its neighbours is in their shadow and the render should say so.
          const recess=Math.max(0,Math.min(1,(col.out-out)*2.2));
          put(blocks,'hd_cliff_block',c,col.along+(rnd()-.5)*.03,
            outHalf+out,w,h,d,top,depthTone(top,recess));
          top-=h; ci++;
        }
      }

      // A loose cube perched on the tread, as in the reference.
      if(c.perch){
        const L=c.cols[0];
        const s=.26+rnd()*.14;
        put(perches,'hd_edge_stone',c,c.along+(rnd()-.5)*.34,
          outHalf+L.out-.06,s,s*(.82+rnd()*.28),s,L.top+s*(.82+rnd()*.10),tone());
      }
    }

    // Rounded boulders scattered ON the plateau. The reference has these well
    // inside the boundary, and they are rocks, not cubes: a cube here just
    // looks like a piece of the wall that escaped.
    for(let i=0;i<26;i++){
      const s=.20+rnd()*.26;
      const edge=rnd()<.45;
      const x=edge?(rnd()<.5?-1:1)*(WORLD.halfW-.3-rnd()*1.6):(rnd()*2-1)*(WORLD.halfW-1.2);
      const z=edge?(rnd()*2-1)*(WORLD.halfH-1.0):(rnd()<.5?-1:1)*(WORLD.halfH-.3-rnd()*1.6);
      if(Math.abs(x)<2.2&&Math.abs(z)<2.2) continue;
      perches.push(boulder(scene,'hd_edge_stone',s,x,TOP_Y+s*.42,z,stone,tone(),rnd));
    }

    // Corner stacks turned 45 degrees so the two runs meet on a cut corner
    // rather than a square tower.
    // Corner stacks. Built from the same half-tile cube grammar as the runs -
    // two cubes per corner across the diagonal, coursed at COURSE - because the
    // previous version was two big 45-degree blocks from the tall-wall era and
    // read as a bastion pasted onto a fine grid.
    for(const sx of [-1,1]) for(const sz of [-1,1]){
      for(let q=0;q<3;q++){
        // q walks the corner: 0 along x, 2 along z, 1 the diagonal cap.
        const diag=q===1;
        const baseOut=.06+rnd()*.16;
        let top=TOP_Y-GRASS_LIP-rnd()*.10, ci=0;
        while(top>BOT+.10){
          const last=(top-COURSE)<=BOT+.10;
          const h=last?top-BOT:COURSE*(.92+rnd()*.16);
          const out=Math.max(.01,baseOut-ci*.05+(rnd()-.5)*.22);
          const s=(diag?.62:.48)+rnd()*.06;
          const d=out+.92+rnd()*.16;
          const ox=diag?out*.72:out, oz=diag?out*.72:out;
          const x=sx*(WORLD.halfW+(q===0?ox:(diag?ox:-.24-rnd()*.10)));
          const z=sz*(WORLD.halfH+(q===2?oz:(diag?oz:-.24-rnd()*.10)));
          const m=stoneBox(scene,'hd_cliff_corner_block',
            q===2?d:s,h,q===2?s:(diag?s:d),
            x,top-h*.5,z,stone,depthTone(top),diag?Math.PI/4:0);
          blocks.push(m);
          top-=h; ci++;
        }
      }
    }

    // Two compact stepped outcrops break the flat lid. Keep every block seated
    // on the plateau or on the block below: the former vertical random walk
    // created a floating Jenga column of separated cubes.
    for(const site of [[-1,'x',-1.6],[1,'z',2.4]]){
      const [side,axis,along]=site;
      const outHalf=axis==='x'?WORLD.halfH:WORLD.halfW;
      const place=(da,off,w,h,d,base,rot=0)=>{
        const outward=outHalf+off;
        const x=axis==='x'?along+da:side*outward;
        const z=axis==='x'?side*outward:along+da;
        blocks.push(stoneBox(scene,'hd_cliff_stack',w,h,d,x,base+h*.5,z,
          stone,tone(),rot));
      };
      const h0=COURSE*.72;
      // Broad two-block footing straddles the lip and reads as an outcrop.
      place(-.18,-.34,.43,h0,.42,TOP_Y,.05);
      place( .20,-.28,.39,h0*.91,.40,TOP_Y,-.08);
      // One smaller cap bridges the footing, with no air gap or tall pillar.
      place(.01,-.31,.34,h0*.78,.34,TOP_Y+h0*.91,.12);
    }

    // Solid core. Set well back from the shallowest cube: flush with them it
    // reads as a continuous wall behind the seams, whereas at this depth the
    // seams go dark and the cubes separate. Toned down for the same reason.
    const coreInX=Math.min(coreX,WORLD.halfW-.95), coreInZ=Math.min(coreZ,WORLD.halfH-.95);
    blocks.push(stoneBox(scene,'hd_cliff_core',coreInX*2,TERRACE_TOP-BOT,coreInZ*2,
      0,(TERRACE_TOP+BOT)*.5,0,stone,.30));

    // Shallow-water stones so the shoreline is not a clean rectangle meeting a
    // flat plane.
    for(let i=0;i<22;i++){
      const axis=i%2?'x':'z';
      const side=(i>>1)%2?1:-1;
      const half   = axis==='x' ? WORLD.halfW : WORLD.halfH;
      const outHalf= axis==='x' ? WORLD.halfH : WORLD.halfW;
      const along=(rnd()*2-1)*(half-.4);
      const outward=outHalf+.55+rnd()*.75;
      const s=.24+rnd()*.40;
      const x=axis==='x'?along:side*outward, z=axis==='x'?side*outward:along;
      shore.push(boulder(scene,'hd_shore_rock',s*.7,x,SEA_LEVEL-.06+rnd()*.22,z,
        stone,tone(),rnd));
    }

    // The imported cliff_rock_*.glb accents were removed here. They were sized
    // for the old tall wall and dwarfed the half-tile cubes; the reference edge
    // has no such feature. importCliffAsset()/restone.py remain available.
    API.state.generatedCliffSegments=0;

    const wall=merge(blocks,'hd_cliff_wall',stone);
    const rocks=merge(shore,'hd_shore_rocks',stone);
    const loose=merge(perches,'hd_edge_stones',stone);
    API.state.hdMaterials=Object.assign(API.state.hdMaterials||{},{cliff:stone});
    API.state.cliffFaceParts=blocks.length+shore.length+perches.length;
    API.state.cliffBottomY=BOT;
    return { wall, rocks, loose };
  }

  /* ---------- 3. vegetation ------------------------------------------ */
  function tuftTexture(scene){
    const S=256, cv=HD.canvasOf(S,S), ctx=cv.getContext('2d');
    ctx.clearRect(0,0,S,S);
    let s=991; const rnd=()=>{ s=(s*16807)%2147483647; return s/2147483647; };
    for(let i=0;i<26;i++){
      const bx=S*.5+(rnd()-.5)*S*.78;
      const topY=S*(.06+rnd()*.34);
      const w=4+rnd()*7;
      const lean=(rnd()-.5)*S*.34;
      const g=ctx.createLinearGradient(0,S,0,topY);
      const dark=rnd()<.5;
      g.addColorStop(0, dark?'#3c4220':'#4a5226');
      g.addColorStop(.6, dark?'#5e6a33':'#6f7a3c');
      g.addColorStop(1, dark?'#8a9450':'#aab268');
      ctx.fillStyle=g;
      ctx.beginPath();
      ctx.moveTo(bx-w,S);
      ctx.quadraticCurveTo(bx-w*.4+lean*.5,(S+topY)/2, bx+lean, topY);
      ctx.quadraticCurveTo(bx+w*.4+lean*.5,(S+topY)/2, bx+w,S);
      ctx.closePath(); ctx.fill();
    }
    const t=HD.dyn(scene,'hd_tuft_tex',cv,{wrap:false,aniso:4});
    t.hasAlpha=true;
    return t;
  }
  function daisyTexture(scene){
    const S=128, cv=HD.canvasOf(S,S), ctx=cv.getContext('2d');
    ctx.clearRect(0,0,S,S);
    const draw=(cx,cy,r,petal,core)=>{
      for(let k=0;k<6;k++){
        const a=k/6*Math.PI*2;
        ctx.fillStyle=petal;
        ctx.beginPath(); ctx.ellipse(cx+Math.cos(a)*r*.62, cy+Math.sin(a)*r*.62, r*.42, r*.24, a, 0, 7); ctx.fill();
      }
      ctx.fillStyle=core; ctx.beginPath(); ctx.arc(cx,cy,r*.28,0,7); ctx.fill();
    };
    draw(S*.5,S*.42,S*.34,'#f3f7ea','#f2c94c');
    ctx.strokeStyle='#3f7a2a'; ctx.lineWidth=4; ctx.beginPath(); ctx.moveTo(S*.5,S*.6); ctx.lineTo(S*.5,S); ctx.stroke();
    const t=HD.dyn(scene,'hd_daisy_tex',cv,{wrap:false,aniso:4});
    t.hasAlpha=true;
    return t;
  }
  function alphaMat(scene,name,tex,{emissive=0}={}){
    const m=new BABYLON.StandardMaterial(name,scene);
    m.diffuseTexture=tex; m.opacityTexture=tex;
    m.useAlphaFromDiffuseTexture=true;
    m.diffuseTexture.hasAlpha=true;
    m.specularColor=C3(.02,.02,.02);
    m.backFaceCulling=false;
    m.transparencyMode=BABYLON.Material.MATERIAL_ALPHATESTANDBLEND;
    m.alphaCutOff=.34;
    if(emissive) m.emissiveColor=C3(emissive,emissive,emissive);
    return m;
  }


  function crossedQuads(scene,name,w,h,y){
    const a=BABYLON.MeshBuilder.CreatePlane(name,{width:w,height:h,sideOrientation:BABYLON.Mesh.DOUBLESIDE},scene);
    const b=BABYLON.MeshBuilder.CreatePlane(name,{width:w,height:h,sideOrientation:BABYLON.Mesh.DOUBLESIDE},scene);
    a.position.y=y; b.position.y=y; b.rotation.y=Math.PI/2;
    const m=BABYLON.Mesh.MergeMeshes([a,b],true,true,undefined,false,false);
    m.name=name;
    return m;
  }


  async function importScatterAsset(scene,file,name){
    const r=await BABYLON.SceneLoader.ImportMeshAsync('', './assets/models/props/gen/', file, scene);
    const mesh=r.meshes.find(m=>m.getTotalVertices?.()>0);
    if(!mesh) throw new Error('no renderable mesh in '+file);
    mesh.name=name; mesh.parent=null; mesh.setEnabled(true); mesh.isVisible=true; mesh.isPickable=false;
    const bounds=mesh.getHierarchyBoundingVectors(true);
    mesh.position.y-=bounds.min.y;
    mesh.bakeCurrentTransformIntoVertices(); mesh.position.set(0,0,0);
    window.GEEBR_LOOK?.applyClayLookToMeshes(r.meshes,scene,{detail:.11,detailScale:5});
    return mesh;
  }

  // Scenery is registered in a later closure, so expose the shared generated-
  // asset importer on the HD namespace rather than relying on closure scope.
  HD.importScatterAsset=importScatterAsset;

  async function buildVegetation(scene){
    const { WORLD } = API;
    let tuftProto,daisyProto;
    try{
      [tuftProto,daisyProto]=await Promise.all([
        importScatterAsset(scene,'blade_cluster.glb','hd_blade_cluster_proto'),
        importScatterAsset(scene,'daisy_clump.glb','hd_daisy_clump_proto')
      ]);
    }catch(e){ console.warn('generated vegetation unavailable',e); return; }
    const tufts=[],daisies=[];
    let seed=0x67a55eed;
    const rnd=()=>{ seed=(seed*1664525+1013904223)>>>0; return seed/4294967296; };
    for(let tx=-WORLD.halfW;tx<WORLD.halfW;tx++) for(let tz=-WORLD.halfH;tz<WORLD.halfH;tz++){
      const cx=tx+.5,cz=tz+.5;
      if(API.proceduralTerrainAt(cx,cz)!=='grass') continue;
      const density=noise(tx*2.17+31,tz*1.73-19);
      let count=density<.34?0:density<.70?1:density<.90?2:3+Math.floor(rnd()*2);
      if(Math.abs(cx)<1.25&&Math.abs(cz)<1.25) count=Math.min(count,1);
      for(let j=0;j<count;j++){
        const c=tuftProto.clone('hd_blade_cluster');
        const scale=.50*(.90+rnd()*.20);
        // Keep blade clusters upright: sideways/inverted modes read as
        // trampled grass. Vary heading plus a gentle one-direction lean only.
        const lean=(rnd()-.5)*.18;
        c.scaling.setAll(scale);
        c.rotationQuaternion=BABYLON.Quaternion.FromEulerAngles(lean,rnd()*Math.PI*2,0);
        c.position.set(cx+(rnd()-.5)*.72,(API.state.terrainTopY??0)+.018,cz+(rnd()-.5)*.72); c.isPickable=false;
        tufts.push(c);
      }
      if(density>.72&&rnd()<.48){
        const c=daisyProto.clone('hd_daisy_clump');
        const scale=.42*(.90+rnd()*.20);
        const mode=Math.floor(rnd()*6);
        const pitch=[0,Math.PI/2,-Math.PI/2,Math.PI,.36,-.36][mode];
        const roll =[0,0,0,0,.45,-.45][mode];
        c.scaling.setAll(scale);
        c.rotationQuaternion=BABYLON.Quaternion.FromEulerAngles(pitch,rnd()*Math.PI*2,roll);
        c.position.set(cx+(rnd()-.5)*.62,(API.state.terrainTopY??0)+.018,cz+(rnd()-.5)*.62); c.isPickable=false;
        daisies.push(c);
      }
    }
    // Vegetation does not stop at the plateau boundary in the reference: it
    // grows on the stepped-down grass caps and out of the seams between the
    // top course of cubes.
    for(const c of edgeProfile().cells){
      const outHalf=c.axis==='x'?WORLD.halfH:WORLD.halfW;
      const spots=[];
      if(c.step){
        spots.push([c.stepOut,(API.state.terrainTopY??TOP_Y)-c.stepDrop+.018,2]);
        if(c.step===2) spots.push([c.stepOut2,(API.state.terrainTopY??TOP_Y)-c.stepDrop2+.018,1]);
      }
      if(!c.corner && c.rD<.72) spots.push([c.ledges[0].out-.24,c.ledges[0].top+.02,2]);
      // Right on the plateau lip, spilling outward over the drop.
      if(!c.corner && c.rC<.95) spots.push([-.14-c.rB*.26,(API.state.terrainTopY??TOP_Y)+.018,3]);
      for(const [off,y,count] of spots){
        for(let j=0;j<count;j++){
          const outward=outHalf+off+(rnd()-.5)*.34;
          const along=c.along+(rnd()-.5)*.62;
          const x=c.axis==='x'?along:c.side*outward;
          const z=c.axis==='x'?c.side*outward:along;
          const t=tuftProto.clone('hd_blade_cluster');
          t.scaling.setAll(.46*(.85+rnd()*.28));
          t.rotationQuaternion=BABYLON.Quaternion.FromEulerAngles((rnd()-.5)*.22,rnd()*Math.PI*2,0);
          t.position.set(x,y,z); t.isPickable=false; tufts.push(t);
        }
        if(rnd()<.09){
          const outward=outHalf+off+(rnd()-.5)*.3;
          const along=c.along+(rnd()-.5)*.5;
          const d=daisyProto.clone('hd_daisy_clump');
          d.scaling.setAll(.38*(.9+rnd()*.2));
          d.rotationQuaternion=BABYLON.Quaternion.FromEulerAngles(0,rnd()*Math.PI*2,0);
          d.position.set(c.axis==='x'?along:c.side*outward,y,c.axis==='x'?c.side*outward:along);
          d.isPickable=false; daisies.push(d);
        }
      }
    }

    tuftProto.dispose(); daisyProto.dispose();
    // Keep transformed clones separate. Mesh.MergeMeshes was flattening the
    // imported GLB clones without preserving their authored rotations, making
    // every flower and blade cluster visibly identical.
    for(const c of tufts){ c.receiveShadows=true; c.name='hd_generated_blade_cluster'; }
    for(const c of daisies){ c.receiveShadows=true; c.name='hd_generated_daisy_clump'; }
    API.state.generatedVegetation={tufts:tufts.length,daisies:daisies.length};
  }

  /* ---------- 4. trees, bushes, boulders ----------------------------- */
  async function buildFlora(scene){
    const { WORLD } = API;
    const leafA=new BABYLON.PBRMaterial('hd_leaf_a',scene);
    leafA.albedoColor=C3(.175,.235,.098); leafA.metallic=0; leafA.roughness=.94;
    const leafB=new BABYLON.PBRMaterial('hd_leaf_b',scene);
    leafB.albedoColor=C3(.115,.155,.068); leafB.metallic=0; leafB.roughness=.92;
    const rockM=new BABYLON.PBRMaterial('hd_boulder',scene);
    rockM.albedoColor=C3(.22,.215,.205); rockM.metallic=0; rockM.roughness=.88;

    const leavesA=[], leavesB=[], rocks=[], trees=[];

    // Art-directed image-to-3D asset derived from the master concept. Keeping
    // trees in the same GLB pipeline as other props makes flora reusable by the
    // sandbox and avoids the winding/open-shell failures of bespoke tier meshes.
    let pineProto=null;
    try{
      pineProto=await importScatterAsset(scene,'tree.glb','hd_tree_proto');
      const b=pineProto.getHierarchyBoundingVectors(true);
      const h=Math.max(1e-6,b.max.y-b.min.y);
      // Tripo normalises this asset to about one unit tall; preserve the old
      // pine(x,z,s) call sites, whose nominal tree height was roughly 1.5*s.
      pineProto.scaling.setAll(1.50/h);
      pineProto.bakeCurrentTransformIntoVertices();
      pineProto.scaling.setAll(1); pineProto.position.set(0,0,0);
      pineProto.setEnabled(false);
    }catch(e){ console.warn('generated tree unavailable',e); }

    function pine(x,z,s,seed){
      if(!pineProto) return;
      const t=pineProto.clone('hd_tree');
      t.setEnabled(true); t.isVisible=true; t.isPickable=false;
      t.position.set(x,0,z);
      t.rotation.y=noise(seed,31)*Math.PI*2;
      // Geometric size variation only; no per-instance colour tint jitter.
      t.scaling.setAll(s*(.88+noise(seed,33)*.24));
      t.receiveShadows=true; API.addShadow(t); trees.push(t);
    }

    function paintUniform(mesh,t){
      const n=mesh.getTotalVertices(), c=new Float32Array(n*4);
      for(let i=0;i<n;i++){ c[i*4]=c[i*4+1]=c[i*4+2]=t; c[i*4+3]=1; }
      mesh.setVerticesData(BABYLON.VertexBuffer.ColorKind,c);
    }

    function bush(x,z,s,seed){
      for(let i=0;i<3;i++){
        const b=BABYLON.MeshBuilder.CreateSphere('bush_lobe',{ diameter:(.20+noise(seed,i)*.16)*s, segments:5 },scene);
        b.position.set(x+(noise(seed,i*7)-.5)*.20*s, .09*s+noise(seed,i*11)*.06, z+(noise(seed,i*13)-.5)*.20*s);
        b.scaling.y=.72;
        paintUniform(b,i%2?1:1.12);
        (i%2?leavesB:leavesA).push(b);
      }
    }

    // perimeter forest: dense at the far edges so the island reads as a wooded plateau
    let seed=0;
    for(let i=0;i<58;i++){
      seed++;
      const side=i%4;
      const t=noise(i*1.61,i*.83);
      let x,z;
      if(side===0){ x=-WORLD.halfW+t*WORLD.w; z=-WORLD.halfH+noise(i,3)*1.9; }
      else if(side===1){ x=-WORLD.halfW+t*WORLD.w; z=WORLD.halfH-noise(i,5)*1.9; }
      else if(side===2){ x=-WORLD.halfW+noise(i,7)*1.9; z=-WORLD.halfH+t*WORLD.h; }
      else { x=WORLD.halfW-noise(i,9)*1.9; z=-WORLD.halfH+t*WORLD.h; }
      if(API.proceduralTerrainAt(x,z)!=='grass') continue;
      if(Math.abs(x)<3.0 && Math.abs(z)<3.0) continue;
      if(noise(i*4.7,i*2.9)<.42) continue;
      pine(x,z,.85+noise(i,11)*.95,seed);
    }
    // scattered inner bushes and boulders
    for(let i=0;i<44;i++){
      const x=-WORLD.halfW+noise(i*2.37+21,i*1.11)*WORLD.w;
      const z=-WORLD.halfH+noise(i*1.83+5,i*2.71)*WORLD.h;
      const kind=API.proceduralTerrainAt(x,z);
      if(Math.abs(x)<1.6 && Math.abs(z)<1.6) continue;
      if(kind==='grass' && i%3===0){ bush(x,z,.55+noise(i,17)*.5,100+i); continue; }
      if(kind==='water') continue;
      if(noise(i*3.7+2,i*5.1)<.45) continue;
      const r=BABYLON.MeshBuilder.CreatePolyhedron('hd_boulder',{ type:i%4===0?2:1, size:.075+noise(i,19)*.13 },scene);
      r.position.set(x,.06+noise(i,21)*.05,z);
      r.rotation.set(i*.83,i*1.41,i*.29);
      r.scaling.set(1+noise(i,23)*.5,.72+noise(i,25)*.5,1+noise(i,27)*.5);
      rocks.push(r);
    }

    pineProto?.dispose();
    const l1=merge(leavesA,'hd_leaves_a',leafA);
    const l2=merge(leavesB,'hd_leaves_b',leafB);
    const r1=merge(rocks,'hd_boulders',rockM);
    for(const m of [l1,l2,r1]) if(m) API.addShadow(m);
  }

  /* ---------- 5. water + foam ---------------------------------------- */
  function buildWater(scene){
    const { WORLD } = API;
    const sea=BABYLON.MeshBuilder.CreateGround('hd_sea',{ width:180, height:180, subdivisions:64 },scene);
    const SEA_Y=SEA_LEVEL;
    sea.position.y=SEA_Y; sea.isPickable=false;
    const m=new BABYLON.PBRMaterial('hd_sea_mat',scene);
    m.albedoColor=C3(.012,.042,.072);
    // Was metallic .16 / roughness .14: a mirror that blew out to pure white
    // wherever the key light glanced off it.
    m.metallic=.06; m.roughness=.34;
    m.emissiveColor=C3(.005,.018,.032);
    m.environmentIntensity=.42;
    m.alpha=.985;
    sea.material=m;
    const pos=sea.getVerticesData(BABYLON.VertexBuffer.PositionKind), base=pos.slice();
    const nrm=sea.getVerticesData(BABYLON.VertexBuffer.NormalKind);
    // 4,225 CPU vertex writes plus a full normal recompute per frame. Fine when
    // a human is watching the waves, pure waste for a screenshot, so still mode
    // evaluates it once and unhooks.
    const waveStep=(t)=>{
      for(let i=0;i<pos.length;i+=3){
        const x=base[i], z=base[i+2];
        pos[i+1]=Math.sin(x*.55+t*.75)*.045+Math.sin(z*.83-t*.58)*.032+Math.sin((x+z)*1.4+t*1.2)*.012;
      }
      sea.updateVerticesData(BABYLON.VertexBuffer.PositionKind,pos,false,false);
      BABYLON.VertexData.ComputeNormals(pos,sea.getIndices(),nrm);
      sea.updateVerticesData(BABYLON.VertexBuffer.NormalKind,nrm,false,false);
    };
    if(window.GEEBR_STILL_MODE) waveStep(0);
    else scene.onBeforeRenderObservable.add(()=>waveStep(performance.now()*.001));

    // foam collar hugging the island so the silhouette pops off the dark water
    const S=512, cv=HD.canvasOf(S,S), ctx=cv.getContext('2d');
    ctx.clearRect(0,0,S,S);
    let s=1337; const rnd=()=>{ s=(s*16807)%2147483647; return s/2147483647; };
    for(let i=0;i<520;i++){
      const x=rnd()*S, y=S*.5+(rnd()-.5)*S*.55, r=4+rnd()*22;
      const g=ctx.createRadialGradient(x,y,1,x,y,r);
      g.addColorStop(0,'rgba(226,246,255,'+(.28+rnd()*.5).toFixed(2)+')');
      g.addColorStop(1,'rgba(226,246,255,0)');
      ctx.fillStyle=g; ctx.beginPath(); ctx.arc(x,y,r,0,7); ctx.fill();
    }
    const foamTx=HD.dyn(scene,'hd_foam_tex',cv,{wrap:true,aniso:4});
    foamTx.hasAlpha=true;
    const foamM=new BABYLON.StandardMaterial('hd_foam_mat',scene);
    foamM.diffuseTexture=foamTx; foamM.opacityTexture=foamTx;
    foamM.emissiveColor=C3(.40,.56,.62); foamM.diffuseColor=C3(0,0,0);
    foamM.disableLighting=true; foamM.backFaceCulling=false; foamM.alpha=.9;
    const bw=.62;
    const strips=[];
    const mk=(w,h,x,z,ry)=>{ const f=BABYLON.MeshBuilder.CreateGround('foam',{ width:w, height:h },scene); f.position.set(x,SEA_Y+.055,z); if(ry) f.rotation.y=ry; strips.push(f); };
    // Hug the actual waterline. These used to sit at halfH-2.3, which was well
    // inside the island and therefore buried under it.
    const fo=.62;
    mk(WORLD.w+1.3,bw,0,-(WORLD.halfH+fo));
    mk(WORLD.w+1.3,bw,0, (WORLD.halfH+fo));
    mk(WORLD.h+1.3,bw,-(WORLD.halfW+fo),0,Math.PI/2);
    mk(WORLD.h+1.3,bw, (WORLD.halfW+fo),0,Math.PI/2);
    const foam=merge(strips,'hd_foam_collar',foamM,{shadows:false});
    if(foam) foam.alphaIndex=6;
    if(window.GEEBR_STILL_MODE){ foamM.alpha=.46; }
    else scene.onBeforeRenderObservable.add(()=>{
      const t=performance.now()*.001;
      foamTx.uOffset=(t*.05)%1; foamTx.vOffset=Math.sin(t*.4)*.04;
      foamM.alpha=.42+Math.sin(t*1.1)*.10;
    });

    // expanding ripple rings for life on the open water
    for(let i=0;i<7;i++){
      const rm=new BABYLON.StandardMaterial('hd_ripple_'+i,scene);
      rm.emissiveColor=C3(.26,.50,.62); rm.diffuseColor=C3(0,0,0); rm.disableLighting=true; rm.alpha=.3;
      const ring=BABYLON.MeshBuilder.CreateTorus('hd_ripple',{ diameter:1, thickness:.028, tessellation:44 },scene);
      ring.rotation.x=Math.PI/2; ring.material=rm; ring.isPickable=false;
      const a=i*1.21+.4, r=10+((i*2.3)%6);
      ring.position.set(Math.cos(a)*r,SEA_Y+.03,Math.sin(a)*r*.85);
      let sc=.4+i*.5; const sp=.10+i*.015;
      ring.scaling.set(sc,sc,1); rm.alpha=.30*(1-sc/3.8);
      if(!window.GEEBR_STILL_MODE)
        scene.onBeforeRenderObservable.add(()=>{ sc+=sp*.016; if(sc>3.6) sc=.4; ring.scaling.set(sc,sc,1); rm.alpha=.30*(1-sc/3.8); });
    }
    return sea;
  }

  /* ---------- 6. sky ------------------------------------------------- */
  function buildSky(scene){
    const W=1024, H=1024, cv=HD.canvasOf(W,H), ctx=cv.getContext('2d');
    const g=ctx.createLinearGradient(0,0,0,H);
    g.addColorStop(0,'#0a1c2c');
    g.addColorStop(.30,'#10293c');
    g.addColorStop(.52,'#143a4a');
    g.addColorStop(.68,'#0d2231');
    g.addColorStop(1,'#04070d');
    ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
    let s=4242; const rnd=()=>{ s=(s*16807)%2147483647; return s/2147483647; };
    // soft haze band near the horizon
    for(let i=0;i<40;i++){
      const y=H*.44+rnd()*H*.2, h=6+rnd()*26;
      ctx.fillStyle='rgba(70,150,170,'+(0.02+rnd()*.05).toFixed(3)+')';
      ctx.fillRect(0,y,W,h);
    }
    for(let i=0;i<220;i++){
      const x=rnd()*W, y=rnd()*H*.62, a=.12+rnd()*.4, r=rnd()<.08?2.4:1.4;
      ctx.fillStyle='rgba(240,248,255,'+a.toFixed(2)+')';
      ctx.beginPath(); ctx.arc(x,y,r,0,7); ctx.fill();
    }
    const tex=HD.dyn(scene,'hd_sky_tex',cv,{wrap:false,aniso:2});
    const m=new BABYLON.StandardMaterial('hd_sky_mat',scene);
    m.emissiveTexture=tex; m.diffuseColor=C3(0,0,0); m.disableLighting=true; m.backFaceCulling=false;
    const dome=BABYLON.MeshBuilder.CreateSphere('hd_sky',{ diameter:320, segments:18, sideOrientation:BABYLON.Mesh.BACKSIDE },scene);
    dome.material=m; dome.isPickable=false; dome.infiniteDistance=true;
    return dome;
  }

  /* ---------- entry -------------------------------------------------- */
  async function buildIsland(scene, api){
    API=api;
    buildSky(scene);
    await buildIslandTop(scene);
    await buildBedrock(scene);
    await buildVegetation(scene);
    await buildFlora(scene);
    buildWater(scene);
    // Part 3 registers after this closure has run, but before buildIsland() is
    // called. `window.GeebrHD` was captured as HD in Part 1; use that stable
    // object rather than looking the property up through an optional global.
    // The old lookup silently skipped the entire scenery pass in some harnesses.
    if(HD.buildScenery){
      try{ await HD.buildScenery(scene,API); }catch(e){ console.warn('scenery failed',e); }
    }
    console.log('[geebr] HD diorama built (hd2)');
  }

  window.GeebrHD.buildIsland=buildIsland;
  window.GeebrHD.buildSky=buildSky;
  window.GeebrHD.buildWater=buildWater;
})();

/* ==================================================================
 * Part 3 — scenery dressing: fence, signpost, tent, lantern, crates
 * ================================================================== */
(() => {
  'use strict';
  const HD=window.GeebrHD;
  const C3=(r,g,b)=>new BABYLON.Color3(r,g,b);
  const rect=(a,b,c,d)=>new BABYLON.Vector4(a,b,c,d);

  function pbr(scene,name,color,rough,{emissive=null,metallic=0}={}){
    const m=new BABYLON.PBRMaterial(name,scene);
    m.albedoColor=color; m.metallic=metallic; m.roughness=rough;
    if(emissive) m.emissiveColor=emissive;
    m.environmentIntensity=.45;
    return m;
  }


  async function buildScenery(scene, api){
    const { WORLD } = api;
    const noise=api.hashNoise;
    const wood = await HD.surface(scene,{ name:'plank', file:'wood_planks.png',
      gradeOpts:{ sat:.72, bright:1.02, contrast:1.10, tintR:1.02, tintG:.90, tintB:.72 },
      normalStrength:2.8, rough:.90, roughVar:.10, ao:.60 });
    const cloth = await HD.surface(scene,{ name:'tentcloth', file:'canvas_fabric.png',
      gradeOpts:{ sat:.55, bright:1.05, contrast:1.06 },
      normalStrength:2.2, rough:.86, roughVar:.10, ao:.50 });
    const darkWood=pbr(scene,'hd_darkwood',C3(.115,.072,.042),.92);
    const metal=pbr(scene,'hd_lantern_metal',C3(.14,.13,.12),.42,{metallic:.55});
    const glow=pbr(scene,'hd_lantern_glow',C3(.06,.05,.02),.30,{emissive:C3(1.9,1.15,.42)});

    const posts=[], rails=[], planks=[];

    /* --- picket fence hugging the south-west grass edge --- */
    function fenceRun(x0,z0,x1,z1,segs){
      for(let i=0;i<=segs;i++){
        const t=i/segs;
        const x=x0+(x1-x0)*t, z=z0+(z1-z0)*t;
        const h=.62+noise(i*3.1,i*1.7)*.14;
        const p=BABYLON.MeshBuilder.CreateBox('fence_post',{ width:.10, height:h, depth:.10 },scene);
        p.position.set(x,h/2,z); p.rotation.y=(noise(i,5)-.5)*.22; posts.push(p);
      }
      const len=Math.hypot(x1-x0,z1-z0);
      const ang=Math.atan2(x1-x0,z1-z0);
      for(const y of [.24,.46]){
        const r=BABYLON.MeshBuilder.CreateBox('fence_rail',{ width:.055, height:.085, depth:len,
          faceUV:[rect(0,0,len*1.4,.5),rect(0,0,len*1.4,.5),rect(0,0,len*1.4,.5),rect(0,0,len*1.4,.5),rect(0,0,1,1),rect(0,0,1,1)] },scene);
        r.position.set((x0+x1)/2,y,(z0+z1)/2); r.rotation.y=ang; rails.push(r);
      }
    }
    fenceRun(-WORLD.halfW+.55, WORLD.halfH-1.15, -1.9, WORLD.halfH-1.15, 9);
    fenceRun(-WORLD.halfW+.55, WORLD.halfH-1.15, -WORLD.halfW+.55, 1.6, 6);

    /* --- signpost by the path --- */
    const sp=BABYLON.MeshBuilder.CreateBox('signpost',{ width:.11, height:1.0, depth:.11 },scene);
    sp.position.set(-3.42,.5,.22); sp.rotation.y=.24; posts.push(sp);
    for(const [y,dir] of [[.80,1],[.56,-1]]){
      const arm=BABYLON.MeshBuilder.CreateBox('sign_arm',{ width:.62, height:.20, depth:.045,
        faceUV:[rect(0,0,1.6,.6),rect(0,0,1.6,.6),rect(0,0,.3,.6),rect(0,0,.3,.6),rect(0,0,1.6,.4),rect(0,0,1.6,.4)] },scene);
      arm.position.set(-3.42+dir*.30,y,.22+dir*.05); arm.rotation.y=.24+dir*.16; planks.push(arm);
    }

    /* --- reference-derived crate stack (decor, non-interactive) --- */
    // One reusable GLB replaces the old textured boxes. Its source is the
    // master's square-framed, diagonally braced crate; the 5k conversion keeps
    // the broad braces and clean corners from every azimuth better than 3k.
    const crateSpots=[[-1.05,-3.35,.52,0],[-.55,-3.05,.44,.6],[-1.02,-3.30,.40,.3],[3.05,1.85,.50,-.4]];
    try{
      const crateProto=await HD.importScatterAsset(scene,'crate.glb','hd_crate_proto');
      const cb=crateProto.getHierarchyBoundingVectors(true);
      const ce=cb.max.subtract(cb.min);
      const base=Math.max(ce.x,ce.z,1e-6);
      crateProto.scaling.setAll(1/base); crateProto.bakeCurrentTransformIntoVertices();
      crateProto.scaling.setAll(1); crateProto.position.set(0,0,0); crateProto.setEnabled(false);
      crateSpots.forEach((c,i)=>{
        const [x,z,sz,ry]=c;
        const y=(api.state.terrainTopY??0)+(i===2 ? .52 : 0);
        const b=crateProto.clone('hd_decor_crate');
        b.setEnabled(true); b.isVisible=true; b.isPickable=false;
        b.scaling.setAll(sz); b.rotation.y=ry; b.position.set(x,y,z);
        b.receiveShadows=true; api.addShadow(b);
      });
      crateProto.dispose();
    }catch(e){ console.warn('generated crate unavailable',e); }

    /* --- reference-derived house on the north-east grass --- */
    const tentX=4.15, tentZ=-1.35;
    let house=null;
    try{
      const houseProto=await HD.importScatterAsset(scene,'house.glb','hd_house_proto');
      const hb=houseProto.getHierarchyBoundingVectors(true), he=hb.max.subtract(hb.min);
      // The master house occupies about 2.4 x 2.2 cells and remains a compact
      // back-right landmark, leaving the central play area unobstructed.
      const scale=2.35/Math.max(he.x,he.z,1e-6);
      houseProto.scaling.setAll(scale); houseProto.bakeCurrentTransformIntoVertices();
      houseProto.scaling.setAll(1); houseProto.position.set(tentX,api.state.terrainTopY??0,tentZ);
      houseProto.rotation.y=-Math.PI/2; houseProto.name='hd_house'; houseProto.isPickable=false;
      houseProto.receiveShadows=true; api.addShadow(houseProto); house=houseProto;
    }catch(e){ console.warn('generated house unavailable',e); }

    /* --- hanging lantern beside the tent --- */
    const hook=BABYLON.MeshBuilder.CreateBox('lantern_hook',{ width:.055, height:1.30, depth:.055 },scene);
    hook.position.set(tentX+1.28,.65,tentZ+.75); posts.push(hook);
    const arm=BABYLON.MeshBuilder.CreateBox('lantern_arm',{ width:.40, height:.05, depth:.05 },scene);
    arm.position.set(tentX+1.10,1.26,tentZ+.75); posts.push(arm);
    const cage=BABYLON.MeshBuilder.CreateCylinder('lantern_cage',{ height:.26, diameterTop:.12, diameterBottom:.16, tessellation:6 },scene);
    cage.position.set(tentX+.92,1.10,tentZ+.75); cage.material=metal; cage.isPickable=false;
    const bulb=BABYLON.MeshBuilder.CreateSphere('lantern_bulb',{ diameter:.11, segments:7 },scene);
    bulb.position.set(tentX+.92,1.10,tentZ+.75); bulb.material=glow; bulb.isPickable=false;
    const lamp=new BABYLON.PointLight('hd_lantern_light',new BABYLON.Vector3(tentX+.92,1.10,tentZ+.75),scene);
    lamp.diffuse=C3(1,.72,.34); lamp.intensity=1.35; lamp.range=6.2;
    if(!window.GEEBR_STILL_MODE) scene.onBeforeRenderObservable.add(()=>{
      const t=performance.now()*.0022;
      lamp.intensity=1.28+Math.sin(t*2.3)*.10+Math.sin(t*5.7)*.05;
    });

    const postM=darkWood;
    // This scenery was authored against the old y=0 plateau. The imported GLB
    // grass surface is higher, so lift the complete scenery pass by the measured
    // terrain top. Previously these meshes were excluded by the generic
    // `hd_` ownership rule and remained buried.
    const topY=api.state.terrainTopY??0;
    const lift=m=>{ if(m) m.position.y+=topY; return m; };
    const p1=lift(posts.length===1?posts[0]:BABYLON.Mesh.MergeMeshes(posts,true,true,undefined,false,false));
    if(p1){ p1.name='hd_posts'; p1.material=postM; p1.isPickable=false; p1.receiveShadows=true; api.addShadow(p1); }
    const r1=lift(rails.length===1?rails[0]:BABYLON.Mesh.MergeMeshes(rails,true,true,undefined,false,false));
    if(r1){ r1.name='hd_rails'; r1.material=wood; r1.isPickable=false; r1.receiveShadows=true; api.addShadow(r1); }
    const k1=lift(planks.length===1?planks[0]:BABYLON.Mesh.MergeMeshes(planks,true,true,undefined,false,false));
    if(k1){ k1.name='hd_planks'; k1.material=wood; k1.isPickable=false; k1.receiveShadows=true; api.addShadow(k1); }
    for(const m of [cage,bulb]) m.position.y+=topY;
    lamp.position.y+=topY;
  }

  window.GeebrHD.buildScenery=buildScenery;
})();
