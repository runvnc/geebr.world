/* Launch-only APNG evidence recorder. Captures the Babylon canvas and embeds
   the pre-recording world snapshot in PNG tEXt metadata. */
(() => {
  'use strict';

  const FPS = 6;
  const MAX_SECONDS = 45;
  const MAX_WIDTH = 960;
  const PNG_SIGNATURE_BYTES = 8;
  let session = null;

  const $ = id => document.getElementById(id);
  const status = text => { const n = $('recordingStatus'); if (n) n.textContent = text; };

  function snapshotWorld() {
    const world = window.geebrWorld;
    const state = world?.state;
    if (!state) throw new Error('world is not ready');
    const meshRecord = mesh => {
      const m = mesh?.metadata || {};
      const p = mesh?.getAbsolutePosition?.() || mesh?.position || {};
      return { type:m.type || mesh?.name || 'object', x:+(p.x || 0).toFixed(3), y:+(p.y || 0).toFixed(3), z:+(p.z || 0).toFixed(3), state:m.state || 'intact', health:m.health };
    };
    return {
      format:'geebr.world-recording-state', version:1, capturedAt:new Date().toISOString(),
      turn:{ index:state.turn?.index || 0, phase:state.turn?.phase || 'ready' },
      allowed:[...(state.allowed || [])],
      agents:(state.geebrs || []).map(g => ({
        id:g.id, style:g.style, anim:g.anim,
        position:{ x:+g.root.position.x.toFixed(3), y:+g.root.position.y.toFixed(3), z:+g.root.position.z.toFixed(3) },
        facing:{ x:+g.dir.x.toFixed(3), y:+g.dir.y.toFixed(3), z:+g.dir.z.toFixed(3) },
        brainConfig:state.brainConfigs?.get(g.id) || null
      })),
      props:(state.props || []).filter(m => !m?.isDisposed?.()).map(meshRecord),
      blocks:(state.blocks || []).filter(m => !m?.isDisposed?.()).map(meshRecord),
      globalHistory:[...(state.globalHistory || [])],
      camera:state.camera ? {
        alpha:state.camera.alpha, beta:state.camera.beta, radius:state.camera.radius,
        target:{x:state.camera.target.x,y:state.camera.target.y,z:state.camera.target.z},
        orthoHalfWidth:state.camera.metadata?.orthoHalfWidth
      } : null
    };
  }

  function makeCaptureSurface(source) {
    const scale = Math.min(1, MAX_WIDTH / source.width);
    const c = document.createElement('canvas');
    c.width = Math.max(2, Math.round(source.width * scale));
    c.height = Math.max(2, Math.round(source.height * scale));
    return c;
  }

  async function captureFrame(s, engine) {
    if (!s || s.stopping) return;
    const ctx = s.surface.getContext('2d', { alpha:false, willReadFrequently:true });
    if (!engine?.readPixels) throw new Error('GPU frame capture unavailable');
    const pixels = await engine.readPixels(0, 0, s.source.width, s.source.height);
    const raw = new ImageData(new Uint8ClampedArray(pixels.buffer, pixels.byteOffset, pixels.byteLength), s.source.width, s.source.height);
    s.rawSurface.getContext('2d').putImageData(raw, 0, 0);
    ctx.drawImage(s.rawSurface, 0, 0, s.surface.width, s.surface.height);
    s.frames.push(ctx.getImageData(0, 0, s.surface.width, s.surface.height).data.buffer.slice(0));
    status(`recording ${s.frames.length} frames · ${((performance.now()-s.started)/1000).toFixed(1)}s`);
    if ((performance.now() - s.started) >= MAX_SECONDS * 1000) stopRecording();
  }

  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i=0; i<bytes.length; i++) {
      c ^= bytes[i];
      for (let k=0; k<8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
    return (c ^ 0xffffffff) >>> 0;
  }

  function pngChunk(type, data) {
    const out = new Uint8Array(12 + data.length);
    const typeBytes = new TextEncoder().encode(type);
    new DataView(out.buffer).setUint32(0, data.length);
    out.set(typeBytes, 4); out.set(data, 8);
    new DataView(out.buffer).setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
    return out;
  }

  function concat(parts) {
    const size = parts.reduce((n,p) => n + p.length, 0);
    const out = new Uint8Array(size); let at = 0;
    for (const p of parts) { out.set(p, at); at += p.length; }
    return out;
  }

  function embedState(apng, metadata) {
    const png = new Uint8Array(apng);
    const keyword = new TextEncoder().encode('geebr.world.initial-state');
    const json = new TextEncoder().encode(JSON.stringify(metadata));
    const payload = concat([keyword, new Uint8Array([0]), json]);
    const textChunk = pngChunk('tEXt', payload);
    let offset = PNG_SIGNATURE_BYTES;
    while (offset + 12 <= png.length) {
      const len = new DataView(png.buffer, png.byteOffset + offset, 4).getUint32(0);
      const type = String.fromCharCode(...png.subarray(offset + 4, offset + 8));
      if (type === 'IEND') return concat([png.subarray(0, offset), textChunk, png.subarray(offset)]).buffer;
      offset += 12 + len;
    }
    throw new Error('invalid encoded PNG');
  }

  function download(buffer) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const url = URL.createObjectURL(new Blob([buffer], {type:'image/apng'}));
    const a = document.createElement('a');
    a.href = url; a.download = `geebr-incident-${stamp}.png`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  function startRecording() {
    if (session) return;
    if (!window.UPNG) { status('recorder library unavailable'); return; }
    if (!window.pako?.deflate) { status('APNG compressor unavailable; reload the page'); return; }
    try {
      // UPNG expects pako under its historical global name even when both are
      // loaded as standalone browser scripts.
      window.UPNG.pako = window.pako;
      const source = $('renderCanvas');
      const rawSurface = document.createElement('canvas'); rawSurface.width=source.width; rawSurface.height=source.height;
      session = { source, rawSurface, surface:makeCaptureSurface(source), frames:[], initialState:snapshotWorld(), started:performance.now(), nextFrameAt:performance.now(), stopping:false, capturing:false };
      $('startRecording').disabled = true;
      $('startRecording').classList.add('recording');
      $('stopRecording').disabled = false;
    } catch (e) { status(`record error: ${e.message}`); session = null; }
  }

  async function stopRecording() {
    const s = session;
    if (!s || s.stopping) return;
    s.stopping = true;
    $('stopRecording').disabled = true;
    status(`encoding ${s.frames.length} frames…`);
    await new Promise(resolve => setTimeout(resolve, 30));
    try {
      if (!s.frames.length) throw new Error('no frames captured');
      const delays = new Array(s.frames.length).fill(Math.round(1000 / FPS));
      const encoded = UPNG.encode(s.frames, s.surface.width, s.surface.height, 0, delays);
      const metadata = {
        ...s.initialState,
        recording:{ fps:FPS, frames:s.frames.length, durationMs:Math.round(performance.now()-s.started), width:s.surface.width, height:s.surface.height }
      };
      download(embedState(encoded, metadata));
      status(`downloaded ${s.frames.length} frames · initial state embedded`);
    } catch (e) {
      console.error('APNG export failed', e); status(`export failed: ${e.message}`);
    } finally {
      session = null;
      $('startRecording').disabled = false;
      $('startRecording').classList.remove('recording');
    }
  }

  window.geebrFrameRecorder = {
    wantsFrame() {
      return !!session && !session.stopping && !session.capturing && performance.now() >= session.nextFrameAt;
    },
    async captureAfterRender(engine) {
      const s=session;
      if(!s || s.stopping || s.capturing) return;
      s.capturing=true;
      s.nextFrameAt=performance.now()+(1000/FPS);
      try { await captureFrame(s,engine); }
      finally { if(session===s) s.capturing=false; }
    },
    fail(error) {
      console.error('APNG frame capture failed',error);
      status(`capture failed: ${error.message}`);
    }
  };

  window.addEventListener('DOMContentLoaded', () => {
    $('startRecording')?.addEventListener('click', startRecording);
    $('stopRecording')?.addEventListener('click', stopRecording);
  });
})();
