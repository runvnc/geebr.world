"""Stop the cliff cubes from reading as brickwork.

`stone_blocks.png` is literally a 512px grid of small square tiles. Every cube
face therefore carried a printed brick grid, and a row of cubes with a printed
grid reads as one masonry wall no matter how the geometry is staggered. That is
why the last two passes improved value and silhouette but the edge still looked
like a retaining wall.

The reference cubes are plain quarried stone: subtle mottling, a slightly
lighter chipped top edge, and NO repeating brick pattern. `stone_soft.png` is a
soft blotchy grey with no grid, which is the right base.
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


# ---------------------------------------------- plain stone, not brick
sub("""    // Cut-stone blocks, not sediment banding. One texture repeat per ~1.6 units
    // so a single cube face shows two or three stones plus mortar.
    const stone=await HD.surface(scene,{ name:'cliff_masonry', file:'stone_blocks.png',
      gradeOpts:{ sat:.58, bright:1.10, contrast:1.06, tintR:1.05, tintG:1.01, tintB:.93 },
      paint:cv=>HD.paintStoneDetail(cv,71), normalStrength:2.6, rough:.90, roughVar:.10, ao:.46 });""",
    """    // Plain quarried stone. NOT stone_blocks.png: that texture is a printed
    // grid of small square tiles, so every cube face wore brickwork and a row
    // of them fused into a retaining wall however the geometry was staggered.
    // The reference cubes are unpatterned mottled rock; stone_soft.png has the
    // blotch without the grid.
    const stone=await HD.surface(scene,{ name:'cliff_masonry', file:'stone_soft.png',
      gradeOpts:{ sat:.62, bright:1.06, contrast:1.14, tintR:1.06, tintG:1.01, tintB:.92 },
      paint:cv=>HD.paintStoneChips(cv,71), normalStrength:1.9, rough:.90, roughVar:.10, ao:.46 });""")

# The blotch is large in source; a big repeat keeps it from tiling visibly on
# adjacent cubes, which would reintroduce exactly the pattern just removed.
sub("  const STONE_UV = 2.3;", "  const STONE_UV = 3.4;")

# ----------------------------------------------------- chip detail pass
sub("  function paintStrataDetail(cv, seed=29){",
    """  // Chipped-rock detail for the edge cubes: broad tonal patches plus a few
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

  function paintStrataDetail(cv, seed=29){""")

sub("paintDirtDetail, paintStoneDetail, paintStrataDetail,",
    "paintDirtDetail, paintStoneDetail, paintStoneChips, paintStrataDetail,")

assert src != orig
P.write_text(src)
print('ok', len(orig), '->', len(src))
