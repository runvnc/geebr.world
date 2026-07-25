# geebr.world Mockup-Match Handoff (2026-07-24)

Goal: make the live 3D scene at `/files/geebr.world/app/` match the AI-generated
reference mockup as closely as possible (mesh quality, textures/bump, lighting).
The CHARACTER (goblin) is explicitly OUT OF SCOPE for now.

## !!! URGENT: syntax error to fix first !!!

`app/terrain-hd.js` currently has a PARSE ERROR (deno check fails at line ~131,
"Expected ',', got 'for'"). A botched apply_udiff deleted two `for` loop header
lines inside `paintStoneDetail`. Until fixed the whole file fails to parse and
the HD diorama will not build. Fix = re-insert the two missing lines:

1. After the line:
       let s=seed; const rnd=()=>{ s=(s*69621)%2147483647; return s/2147483647; };
   insert:
       for(let i=0;i<220;i++){
   (immediately before `const x=rnd()*S, y=rnd()*S, r=6+rnd()*30;`)

2. After the line:
       ctx.strokeStyle='rgba(28,32,38,0.32)';
   insert:
       for(let i=0;i<220;i++){
   (immediately before `let x=rnd()*S, y=rnd()*S; ctx.lineWidth=.7+rnd()*1.4; ...`)

Verify with: `cd /files/geebr.world/app && deno check terrain-hd.js && deno check app.js`
(app.js currently parses clean). NOTE: apply_udiff has proven unreliable on these
files -- prefer small python replace-with-assert scripts and always re-check.

## Files

- Target reference: `handoff/target_mockup.png` (orig: /xfiles/localmr/static/imgs/gpt_image_7fRofQ_FKB_m9w_0.png)
- Latest renders: `handoff/render_close_latest.png` (radius 6), `handoff/render_wide_latest.png` (radius 16)
- Screenshot tool: `handoff/shot2.py` (also /tmp/shot2.py). Usage:
      python3 shot2.py OUT.png [RADIUS] [BETA] [ALPHA]
  e.g. `python3 shot2.py /tmp/shot.png 6 0.9` close-up, `python3 shot2.py /tmp/w.png 16 1.05` wide.
  Headless playwright + WebGPU(swiftshader) against http://localhost:8000/app/,
  hides UI, waits 15s, sets camera target (1.2,0.4,0.6).
- Main source: `app/terrain-hd.js` (diorama: surfaces, vegetation, flora, water, sky, scenery), `app/app.js` (lights, post fx, campfire, selection ring, materials).
- Zoom crops of the target used for detail comparison: /tmp/cmp_target_fire.png, /tmp/cmp_target_grass.png, /tmp/cmp_target_crate.png (regenerate with PIL if gone).

## Changes already applied this session (all in the two files above)

terrain-hd.js:
- paintGrassDetail: all greens re-graded to olive (clumps rgba(42,48,20)/(150,158,84); blades (48,56,24)/(136,142,72)/(190,192,126); clover (100,116,52)).
- Grass surface grade: sat .72, bright .93, contrast 1.06, tintR 1.00, tintG .96, tintB .62 (was sat 1.18 etc).
- Dirt path grade: sat .72, bright 1.10, contrast 1.02, tint 1.05/.98/.86 (lighter warm brown).
- Tile GAP .026 -> .012 (hairline seams).
- Per-tile vertex tint variation reduced: t=.88+n*.22 (was .80+n*.42), warm=.96+n*.09.
- Tufts: texture colors olive (#3c4220/#4a5226 base, #5e6a33/#6f7a3c mid, #8a9450/#aab268 tip);
  proto .30w x .16h (was .34x.22); count 520->300; scale .45-.83 (was .62-1.17).
- Bushes: smaller lobes (.20+n*.16 dia, y-scale .72), only every 3rd slot (was every 2nd), size .55+n*.5.
- Leaf materials lightened: leafA (.085,.120,.052), leafB (.115,.155,.068).
- Boulder material: (.22,.215,.205) gray (was dark blue-gray).
- buildSky: canvas 128x512 -> 1024x1024 (the giant WHITE LIGHT COLUMN artifact in wide shots
  was a single star texel stretched by the tiny texture); stars dimmer (alpha .12+rnd*.4, r 1.4/2.4).
  (Sky gradient/haze restored after the botched diff; see syntax fix above.)

app.js:
- makeCampfire: ring stones size .055 x8 at radius .30, color (.20,.17,.14); logs .42x.075;
  flame smaller (.20 base, .38 h), emissive (.85,.30,.05); point light intensity .55 base
  (.52+sin*.08 flicker), range 5 (was 1.1/range 7).
- Selection ring: emissive (.22,1.05,.92) (was .30,1.65,1.45), thickness .038 (was .055),
  alpha .85; glow disc alphas .26/.10 (was .42/.16).
- Lighting: hemi .58->.42 (diffuse .38,.52,.74), sun 3.95->3.1 (diffuse 1,.82,.58).
- Post: bloomThreshold .72->.82, bloomWeight .34->.26; GlowLayer .55->.38.

## Current state vs target (see render_close_latest.png vs target crops)

Much closer: moody darker grass, tight seams, sparse short tufts, softer ring.
Remaining gaps (next steps, priority order):
1. FIX SYNTAX ERROR (top of doc) then re-screenshot; confirm white beam is gone (sky fix).
2. Campfire still reads a bit hot/orange; target stones are gray-brown and dimmer.
   Consider stoneM -> (.16,.14,.12) and/or light intensity .45.
3. Grass hue still slightly greener than target olive; nudge tintG .96->.93 if needed.
4. Dirt path still fairly red/contrasty up close; could reduce contrast to 1.0.
5. Tile top value variation still noticeable; target is subtler.
6. Big remaining scene work (not started): cottage, barrels, more crates w/ plank-frame
   bevels, signpost already exists, water visible at island edge + dirt cliff sides
   (bedrock exists but edges read flat from top-down angles), lily pads.
7. Camera: mockup is a wider isometric framing; decide on default camera to match.

## Process notes

- Screenshot loop: edit -> `python3 /tmp/shot2.py /tmp/x.png 6 0.9` -> examine_image -> compare
  to target crops.
- deno check both files after EVERY edit (apply_udiff mangled terrain-hd.js twice:
  once deleted buildSky body, once deleted for-loop headers in paintStoneDetail).
- The white vertical beam artifact was NOT a mesh/light -- it was the sky dome's 128px
  texture smearing one star into a column. Fixed via 1024px canvas (unverified visually
  until the syntax error is repaired and a new wide shot is taken).
