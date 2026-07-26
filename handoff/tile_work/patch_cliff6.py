"""Make the edge blocks read as discrete CUBES rather than a masonry wall.

Value is now correct (measured stone .281 / grass .294 against reference .259 /
.251), so this pass is purely about separation:

  * per-FACE tone. Previously all six faces of a block shared one vertex tone,
    so a block only differed from its neighbour, never from itself. In the
    reference the top face is clearly the lightest plane in the whole edge and
    that is what makes a cube read as a cube.
  * real seams. Blocks were .88 to 1.02 wide in a 1.0 cell, so neighbours
    touched. Narrowing them opens a gap that SSAO fills with a dark line, and
    the recessed lower course behind still closes the silhouette.
  * more outward stagger so no two neighbours share a plane.
"""
import pathlib

P = pathlib.Path('/files/geebr.world/app/terrain-hd.js')
src = P.read_text()
orig = src


def sub(old, new, n=1):
    global src
    c = src.count(old)
    assert c == n, f'expected {n}, found {c} of: {old[:90]!r}'
    src = src.replace(old, new)


# ------------------------------------------------------- per-face tone
sub("""  function stoneBox(scene,name,w,h,d,x,y,z,mat,tone,ry=0){
    const uw=w/STONE_UV, uh=h/STONE_UV, ud=d/STONE_UV;
    const fz=rect(0,0,uw,uh), fx=rect(0,0,ud,uh), fy=rect(0,0,uw,ud);
    const c=new BABYLON.Color4(tone,tone,tone,1);
    const m=BABYLON.MeshBuilder.CreateBox(name,{ width:w, height:h, depth:d,
      faceUV:[fz,fz,fx,fx,fy,fy], faceColors:[c,c,c,c,c,c], wrap:true },scene);""",
    """  // Faces are toned separately. A single tone per block made every plane in
  // the terrace equal, so the blocks fused into a wall; the reference reads as
  // cubes precisely because each one's top face is the brightest thing on it.
  function stoneBox(scene,name,w,h,d,x,y,z,mat,tone,ry=0){
    const uw=w/STONE_UV, uh=h/STONE_UV, ud=d/STONE_UV;
    const fz=rect(0,0,uw,uh), fx=rect(0,0,ud,uh), fy=rect(0,0,uw,ud);
    const g=v=>{ const t=Math.min(1.25,tone*v); return new BABYLON.Color4(t,t,t,1); };
    const top=g(1.24), bot=g(.62), lit=g(1.0), shade=g(.86);
    const m=BABYLON.MeshBuilder.CreateBox(name,{ width:w, height:h, depth:d,
      faceUV:[fz,fz,fx,fx,fy,fy],
      faceColors:[lit,shade,lit,shade,top,bot], wrap:true },scene);""")

# --------------------------------------------------------------- seams
sub("          const w=(1/parts)*(.88+rnd()*.14);",
    "          const w=(1/parts)*(.74+rnd()*.14);")
sub("        put(blocks,'hd_cliff_block_low',c,c.along+(rnd()-.5)*.10,faceB,\n"
    "          .92+rnd()*.14,topB-BOT,outB+.70+rnd()*.20,topB,tone()*.94);",
    "        put(blocks,'hd_cliff_block_low',c,c.along+(rnd()-.5)*.14,faceB,\n"
    "          .78+rnd()*.16,topB-BOT,outB+.74+rnd()*.20,topB,tone()*.94);")

# ------------------------------------------------------------- stagger
sub("        const dA=L.out+.68+c.rB*.22;",
    "        const dA=L.out+.62+c.rB*.34;")
sub("          const f=faceA+(parts===2?(k?.07:-.06):0)+(rnd()-.5)*.06;",
    "          const f=faceA+(parts===2?(k?.09:-.08):0)+(rnd()-.5)*.16;")
sub("        const proud=c.rD<.30;",
    "        const proud=c.rD<.34;")

assert src != orig
P.write_text(src)
print('ok', len(orig), '->', len(src))
