import io

# ---------------------------------------------------------------- app.js
P = '/files/geebr.world/app/app.js'
s = io.open(P, encoding='utf-8').read()
n = 0


def rep(old, new, count=1):
    global s, n
    c = s.count(old)
    assert c == count, 'expected %d, found %d for %.80r' % (count, c, old)
    s = s.replace(old, new)
    n += 1


# Replace the inline helper block (added in the previous patch) with a thin
# delegation to look.js, so there is exactly one definition of the look.
start = s.index('// ---------------------------------------------------------------------------\n// Shared "painted clay" look.')
end = s.index('function colorMat(scene,name,color,emissive=null){')
DELEGATE = '''// The shared "painted clay diorama" look lives in look.js (window.GEEBR_LOOK)
// so app.js and app/tilepreview.html cannot drift. See that file for the
// measured reasons behind each value.
const LOOK = () => window.GEEBR_LOOK;
function applyClayLook(m,scene,opts){ return LOOK()?.applyClayLook(m,scene,opts) ?? m; }
function applyClayLookToMeshes(meshes,scene,opts){ LOOK()?.applyClayLookToMeshes(meshes,scene,opts); }

'''
s = s[:start] + DELEGATE + s[end:]
n += 1

# Route the tonemap/grade block through look.js too.
old_tone_start = s.index('  // The reference art is comparatively flat and low-contrast; ACES at contrast')
old_tone_end = s.index("  }catch(e){ console.warn('color curves unavailable',e); }")
old_tone_end += len("  }catch(e){ console.warn('color curves unavailable',e); }")
NEW_TONE = ('  // Tonemap + diorama grade (teal-lifted shadows, warm highlights). The old\n'
            '  // ACES at contrast/exposure 1.34 was crushing shadows and desaturating the\n'
            '  // olive greens relative to the concept art.\n'
            '  LOOK()?.applyTonemap(scene);')
s = s[:old_tone_start] + NEW_TONE + s[old_tone_end:]
n += 1

# Route SSAO through look.js.
old_ssao_start = s.index('    // Ambient occlusion is what makes the reference read as sculpted clay')
old_ssao_end = s.index("    }catch(e){ console.warn('ssao unavailable',e); }")
old_ssao_end += len("    }catch(e){ console.warn('ssao unavailable',e); }")
NEW_SSAO = ('    // Ambient occlusion is what makes the reference read as sculpted clay\n'
            '    // rather than flat colour. Neither the imported GLBs (Tripo bakes a pure\n'
            '    // white AO channel) nor the procedural terrain carried any before this.\n'
            '    state.ssao=LOOK()?.setupSSAO(scene,camera);')
s = s[:old_ssao_start] + NEW_SSAO + s[old_ssao_end:]
n += 1

io.open(P, 'w', encoding='utf-8').write(s)
print('app.js: %d edits, %d bytes' % (n, len(s)))

# ------------------------------------------------------------ preflight.js
Q = '/files/geebr.world/app/preflight.js'
t = io.open(Q, encoding='utf-8').read()
assert t.count("    ['terrain-hd.js'],") == 1
t = t.replace("    ['terrain-hd.js'],", "    ['look.js'],\n    ['terrain-hd.js'],")
io.open(Q, 'w', encoding='utf-8').write(t)
print('preflight.js: look.js inserted before terrain-hd.js')
