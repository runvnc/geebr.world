const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const logEl = document.getElementById('log');
const selectedEl = document.getElementById('selected');
const W = 24, H = 24;
const TILE_W = 56, TILE_H = 30, Z_H = 18;
let DPR = 1, selected = 0, tick = 0;
const dirs = { n:[0,-1], s:[0,1], w:[-1,0], e:[1,0] };
function uid(){
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') return crypto.randomUUID();
  return 'g-' + Math.random().toString(36).slice(2) + '-' + Date.now().toString(36);
}
function failVisible(err){
  console.error(err);
  const msg = (err && err.stack) ? err.stack : String(err);
  document.body.insertAdjacentHTML('beforeend', `<pre style="position:fixed;left:12px;bottom:12px;z-index:9999;max-width:60vw;max-height:30vh;overflow:auto;background:#250b12;color:#ffd9df;border:1px solid #ff6b8a;padding:10px;border-radius:8px;font:12px/1.35 monospace;white-space:pre-wrap">${msg.replace(/[&<>]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}</pre>`);
}
const materials = {
  floor: { solid:false, hp:999, color:'#39404d' },
  wall: { solid:true, hp:4, color:'#83776c' },
  wood: { solid:true, hp:2, color:'#9a6844' },
  glass:{ solid:true, hp:1, color:'#8fc9de' },
  rubble:{ solid:false, hp:1, color:'#5e5a57' },
  support:{ solid:true, hp:3, color:'#bf9d59' },
  fire:{ solid:false, hp:1, color:'#e65b3a' }
};
let world, geebrs, particles;
function rand(n){ return Math.floor(Math.random()*n); }
function resize(){ DPR = Math.max(1, Math.min(2, devicePixelRatio||1)); canvas.width = canvas.clientWidth*DPR; canvas.height=canvas.clientHeight*DPR; ctx.setTransform(DPR,0,0,DPR,0,0); }
addEventListener('resize', resize); resize();
function makeCell(type='floor', z=0){ return { type, z, hp: materials[type].hp, burn:0, unstable:false }; }
function reset(){
  world = Array.from({length:H}, (_,y)=>Array.from({length:W},(_,x)=>makeCell('floor',0)));
  for(let y=3;y<21;y++) for(let x=3;x<21;x++) if(x===3||x===20||y===3||y===20) world[y][x]=makeCell('wall',1);
  for(let i=0;i<30;i++) world[5+rand(14)][5+rand(14)] = makeCell(['wood','glass','support'][rand(3)],1+rand(2));
  for(let x=9;x<15;x++) world[12][x] = makeCell('support',2);
  geebrs = [newGeebr('Brindle',7,8), newGeebr('Mogo',15,14), newGeebr('Pim',10,16)];
  particles=[]; selected=0; logEl.innerHTML=''; say('world', 'new destructible room generated'); updateSelected();
}
function newGeebr(name,x,y){ return { id:uid(), name, x,y, z:1, mood:'confused', hp:3, facing:'s', bubble:'', bubbleT:0, color:`hsl(${rand(360)} 70% 65%)`}; }
function say(who,msg){ const div=document.createElement('div'); div.innerHTML = `<b>${who}:</b> ${msg}`; logEl.prepend(div); }
function cell(x,y){ if(x<0||y<0||x>=W||y>=H) return null; return world[y][x]; }
function isBlocked(x,y){ const c=cell(x,y); if(!c) return true; return materials[c.type].solid; }
function damage(x,y,amt,source='damage'){
  const c=cell(x,y); if(!c || c.type==='floor' || c.type==='rubble') return;
  c.hp -= amt; spawnParticles(x,y,6);
  if(c.hp<=0){ say(source, `${c.type} broke at ${x},${y}`); world[y][x]=makeCell('rubble',0); }
}
function spawnParticles(x,y,n){ for(let i=0;i<n;i++) particles.push({x:x+0.5,y:y+0.5,z:1+Math.random(),vx:(Math.random()-.5)*.08,vy:(Math.random()-.5)*.08,vz:Math.random()*.16,life:30+rand(20)}); }
function runCommand(g, command){
  if(!g) return;
  const raw = typeof command === 'string' ? command.trim() : command.cmd;
  if(!raw) return;
  const [verb,...rest] = raw.split(/\s+/);
  if(verb==='say'){ const msg=rest.join(' ')||'invalid thoughts'; g.bubble=msg; g.bubbleT=180; say(g.name,msg); return; }
  if(verb==='walk') return walk(g, rest[0]||g.facing);
  if(verb==='push') return push(g);
  if(verb==='dig') return dig(g);
  if(verb==='panic') { g.bubble='PANIC PROTOCOL'; g.bubbleT=80; for(let i=0;i<3;i++) walk(g, Object.keys(dirs)[rand(4)]); say(g.name,'panic protocol damaged local planning'); return; }
  if(verb==='spell') { if(rest[0]==='spark') return spark(g); return spellPush(g); }
  if(verb==='build') return build(g, rest[0]||'wall');
  g.bubble='I do not know that verb'; g.bubbleT=90; say(g.name,`failed command: ${raw}`);
}
function front(g){ const d=dirs[g.facing]||dirs.s; return [g.x+d[0],g.y+d[1]]; }
function walk(g,dir){ if(!dirs[dir]) dir='s'; g.facing=dir; const [dx,dy]=dirs[dir], nx=g.x+dx, ny=g.y+dy; if(!isBlocked(nx,ny) && !geebrs.some(o=>o!==g&&o.x===nx&&o.y===ny)){ g.x=nx; g.y=ny; g.bubble='step'; g.bubbleT=25; } else { g.bubble='bonk'; g.bubbleT=60; say(g.name,'bonked into an obstacle'); damage(nx,ny,.25,g.name); } }
function push(g){ const [tx,ty]=front(g), d=dirs[g.facing], nx=tx+d[0], ny=ty+d[1], c=cell(tx,ty); if(c && materials[c.type].solid && !isBlocked(nx,ny)){ world[ny][nx]=c; world[ty][tx]=makeCell('floor',0); say(g.name,`pushed ${c.type}`); } else { damage(tx,ty,1,g.name); say(g.name,'pushed reality unsuccessfully'); } }
function dig(g){ const [tx,ty]=front(g); damage(tx,ty,2,g.name); }
function build(g,type){ const [tx,ty]=front(g); if(cell(tx,ty)&&!isBlocked(tx,ty)){ world[ty][tx]=makeCell(type==='support'?'support':'wall',1); say(g.name,`built questionable ${type}`); } }
function spellPush(g){ const [tx,ty]=front(g); damage(tx,ty,1.5,`${g.name} spell`); for(const o of geebrs){ if(Math.abs(o.x-tx)+Math.abs(o.y-ty)<2) walk(o,g.facing); } say(g.name,'cast push with legal uncertainty'); }
function spark(g){ const [tx,ty]=front(g), c=cell(tx,ty); if(c){ c.burn=5; say(g.name,'introduced fire to problem'); } }
function physicsStep(){
  tick++;
  for(let y=0;y<H;y++) for(let x=0;x<W;x++){
    const c=cell(x,y); if(!c) continue;
    if(c.burn>0){ c.burn--; if(c.type==='wood'||c.type==='support') damage(x,y,.45,'fire'); if(Math.random()<.18) for(const [dx,dy] of Object.values(dirs)){ const n=cell(x+dx,y+dy); if(n&&(n.type==='wood'||n.type==='support')) n.burn=Math.max(n.burn,3); } }
    if(materials[c.type].solid && c.z>1){ const supported = Object.values(dirs).some(([dx,dy])=>{ const n=cell(x+dx,y+dy); return n && n.type==='support' && n.z>=c.z-1; }); if(!supported && Math.random()<.12){ c.z--; c.unstable=true; say('physics', `${c.type} sagged at ${x},${y}`); if(c.z<=0){ world[y][x]=makeCell('rubble',0); spawnParticles(x,y,12); } } }
  }
  for(const p of particles){ p.x+=p.vx; p.y+=p.vy; p.z+=p.vz; p.vz-=.012; p.life--; }
  particles=particles.filter(p=>p.life>0&&p.z>=0);
}
function iso(x,y,z=0){ const ox=canvas.clientWidth/2, oy=70; return { x: ox + (x-y)*TILE_W/2, y: oy + (x+y)*TILE_H/2 - z*Z_H }; }
function drawTile(x,y,c){ const p=iso(x,y,c.z); const col = c.burn>0 ? materials.fire.color : materials[c.type].color; ctx.beginPath(); ctx.moveTo(p.x,p.y); ctx.lineTo(p.x+TILE_W/2,p.y+TILE_H/2); ctx.lineTo(p.x,p.y+TILE_H); ctx.lineTo(p.x-TILE_W/2,p.y+TILE_H/2); ctx.closePath(); ctx.fillStyle=col; ctx.fill(); ctx.strokeStyle=c.unstable?'#ffcf72':'#222638'; ctx.stroke(); if(materials[c.type].solid){ ctx.fillStyle='rgba(0,0,0,.25)'; ctx.fillRect(p.x-20,p.y+18,40,8); } }
function render(){
  ctx.clearRect(0,0,canvas.clientWidth,canvas.clientHeight);
  for(let y=0;y<H;y++) for(let x=0;x<W;x++) drawTile(x,y,world[y][x]);
  for(const g of geebrs){ const p=iso(g.x,g.y,1); ctx.beginPath(); ctx.arc(p.x,p.y+15,11,0,Math.PI*2); ctx.fillStyle=g.color; ctx.fill(); ctx.strokeStyle=geebrs[selected]===g?'#fff':'#222'; ctx.lineWidth=geebrs[selected]===g?3:1; ctx.stroke(); ctx.fillStyle='#fff'; ctx.font='11px sans-serif'; ctx.textAlign='center'; ctx.fillText(g.name,p.x,p.y-4); if(g.bubbleT>0){ ctx.fillStyle='rgba(10,12,18,.88)'; const w=Math.min(170,Math.max(50,g.bubble.length*6)); ctx.fillRect(p.x-w/2,p.y-48,w,24); ctx.fillStyle='#fff'; ctx.fillText(g.bubble.slice(0,28),p.x,p.y-32); g.bubbleT--; } }
  for(const p of particles){ const q=iso(p.x,p.y,p.z); ctx.fillStyle='#d7c197'; ctx.fillRect(q.x,q.y,3,3); }
  requestAnimationFrame(render);
}
function updateSelected(){ const g=geebrs[selected]; selectedEl.innerHTML = g ? `<b>Selected:</b> ${g.name}<br><span class="hint">mood: ${g.mood}; facing: ${g.facing}</span>` : 'none'; }
canvas.addEventListener('click', e=>{ const r=canvas.getBoundingClientRect(); const mx=e.clientX-r.left, my=e.clientY-r.top; let best=-1, bd=9999; geebrs.forEach((g,i)=>{ const p=iso(g.x,g.y,1); const d=Math.hypot(mx-p.x,my-(p.y+15)); if(d<bd){bd=d; best=i;} }); if(bd<30){ selected=best; updateSelected(); }});
document.querySelectorAll('[data-cmd]').forEach(b=>b.onclick=()=>{ const g=geebrs[selected]; const c=b.dataset.cmd; if(c.startsWith('walk:')) runCommand(g,'walk '+c.split(':')[1]); else if(c==='spark') runCommand(g,'spell spark'); else runCommand(g,c); updateSelected(); });
document.getElementById('spawn').onclick=()=>{ geebrs.push(newGeebr(['Nim','Greeb','Sog','Luma'][rand(4)],5+rand(14),5+rand(14))); say('world','a new Geebr has made poor choices'); };
document.getElementById('reset').onclick=reset;
document.getElementById('step').onclick=physicsStep;
document.getElementById('run').onclick=()=>{ runCommand(geebrs[selected], document.getElementById('console').value); updateSelected(); };
try {
  setInterval(physicsStep, 500);
  reset();
  render();
} catch (err) {
  failVisible(err);
}
window.runCommand = (command, geebrIndex=selected)=>runCommand(geebrs[geebrIndex], command);
window.geebrWorld = { world:()=>world, geebrs:()=>geebrs, runCommand };
