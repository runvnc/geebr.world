(() => {
  const BUILTINS=['alba','azelma','cosette','eponine','fantine','javert','jean','marius'];
  const DB='geebr-pocket-tts', STORE='voices';
  const CACHE_MARKER='geebrTtsModelCached';
  const settings=()=>({enabled:localStorage.getItem('geebrTtsEnabled')==='1',language:localStorage.getItem('geebrTtsLanguage')||'english_2026-04',volume:Number(localStorage.getItem('geebrTtsVolume')||.85)});
  class PocketTTSManager extends EventTarget {
    constructor(){ super(); this.worker=null; this.ready=false; this.loading=false; this.queue=[]; this.running=false; this.audioCtx=null; this.gain=null; this.pcmNode=null; this.directPort=false; this.sampleRate=24000; this.receivedSamples=0; this.pendingAudio=[]; this.pendingStreamEnd=false; this.custom=new Map(); this.pending=new Map(); this.telemetry={backend:'WASM CPU',isolated:false,threads:1,hardwareConcurrency:navigator.hardwareConcurrency||0,bufferedMs:0,underruns:0,minBufferedMs:null,chunks:0,lastChunkRtfx:0,rtfx:0,firstAudioMs:null,audioArrivalMs:null,playbackStartMs:null}; this.loadCustomIndex(); }
    status(text,state='idle'){ this.dispatchEvent(new CustomEvent('status',{detail:{text,state}})); }
    wasLoaded(){return localStorage.getItem(CACHE_MARKER)==='1';}
    async loadCustomIndex(){ for(const v of await this.dbAll().catch(()=>[])) this.custom.set(v.id,v); this.dispatchEvent(new Event('voiceschanged')); }
    voices(){ return BUILTINS.map(id=>({id:`builtin:${id}`,name:id})).concat([...this.custom.values()].map(v=>({id:`custom:${v.id}`,name:`custom: ${v.name}`}))); }
    async ensureAudio(){ if(!this.audioCtx){
      this.audioCtx=new (AudioContext||webkitAudioContext)({sampleRate:24000,latencyHint:'interactive'});
      await this.audioCtx.audioWorklet.addModule('./tts/pcm-worklet.js');
      this.pcmNode=new AudioWorkletNode(this.audioCtx,'pocket-pcm-processor',{processorOptions:{minBufferSamples:Math.floor(this.audioCtx.sampleRate*.35),targetBufferSamples:Math.floor(this.audioCtx.sampleRate*.60),bufferSize:this.audioCtx.sampleRate*60}});
      this.gain=this.audioCtx.createGain();
      this.pcmNode.connect(this.gain).connect(this.audioCtx.destination);
      // Create a direct MessageChannel: worker port1 -> worklet port2.
      // Audio chunks flow worker->worklet without touching the main thread.
      if(this.worker){
        const ch=new MessageChannel();
        this.worker.postMessage({type:'set_audio_port'},[ch.port1]);
        this.pcmNode.port.postMessage({type:'set_audio_port'},[ch.port2]);
        this.directPort=true;
      }
      this.pcmNode.port.onmessage=e=>{const m=e.data||{};
        if(m.type==='playback-started'&&this.current)this.telemetry.playbackStartMs=performance.now()-this.current.speakAt;
        if(m.type==='stats'){this.telemetry.bufferedMs=m.bufferedMs;this.telemetry.underruns=m.underruns;this.telemetry.minBufferedMs=this.telemetry.minBufferedMs==null?m.bufferedMs:Math.min(this.telemetry.minBufferedMs,m.bufferedMs);}
        if(m.type==='drained'&&this.running)this.finishCurrent(true);
        // Fallback capacity messages for legacy path (no direct port)
        if(m.type==='capacity'&&!this.directPort){this.telemetry.bufferedMs=Math.round((m.buffered||0)/this.audioCtx.sampleRate*1000);this.flushAudio();}
      };
      this.audioCtx.onstatechange=()=>{if(this.audioCtx.state==='suspended')this.status('Click anywhere once to enable speech','error');};
    } if(this.audioCtx.state==='suspended') await this.audioCtx.resume(); this.gain.gain.value=settings().volume; }
    async load(){ if(this.ready)return; if(this.loading)return this.pendingLoad; this.loading=true; this.status(this.wasLoaded()?'Auto-loading cached Pocket-TTS…':'Downloading Pocket-TTS model…','loading'); if(this.worker){try{this.worker.terminate();}catch{}this.worker=null;} this.pendingLoad=new Promise((resolve,reject)=>{ const worker=new Worker('./tts/inference-worker.js',{type:'module'}); this.worker=worker; worker.onmessage=e=>this.onMessage(e.data,resolve,reject); worker.onerror=e=>{if(this.worker===worker){try{worker.terminate();}catch{}this.worker=null;}this.loading=false;this.pendingLoad=null;reject(e);this.status('Pocket-TTS failed: '+e.message,'error');}; worker.postMessage({type:'load',data:{language:settings().language}}); }); return this.pendingLoad; }
    async onMessage(m,resolve,reject){ if(m.type==='runtime_info')Object.assign(this.telemetry,m.data||{}); if(m.type==='bundle_loaded')this.sampleRate=m.sampleRate||24000; if(m.type==='voices_loaded'||m.type==='loaded'){ if(!this.ready){this.ready=true;this.loading=false;localStorage.setItem(CACHE_MARKER,'1');this.status('Pocket-TTS ready (WASM CPU)','ready');resolve?.(); await this.restoreCustomVoices();} }
      if(m.type==='generation_started'){this.receivedSamples=0;this.pendingAudio=[];this.pendingStreamEnd=false;this.telemetry={...this.telemetry,bufferedMs:0,underruns:0,minBufferedMs:null,chunks:0,lastChunkRtfx:0,rtfx:0,firstAudioMs:null,audioArrivalMs:null,playbackStartMs:null};if(!this.directPort)this.pcmNode?.port.postMessage({type:'reset'});}
      // Direct-port path: worker sends audio_chunk_meta (no audio data) for telemetry
      if(m.type==='audio_chunk_meta'){this.receivedSamples++;this.telemetry.chunks++;this.telemetry.lastChunkRtfx=Number(m.metrics?.chunkRtfx)||0;if(!this.telemetry.audioArrivalMs&&this.current)this.telemetry.audioArrivalMs=performance.now()-this.current.speakAt;}
      // Legacy fallback path: worker sends audio_chunk with actual audio data
      if(m.type==='audio_chunk')this.streamChunk(new Float32Array(m.data),m.metrics);
      if(m.type==='generation_metrics')Object.assign(this.telemetry,m.metrics||{});
      if(m.type==='stream_ended'){if(this.directPort){ if(!this.receivedSamples)this.finishCurrent(false); /* else: worker already told the worklet stream-ended; the worklet 'drained' event finishes this item only after every buffered sample has actually played */ }else if(this.receivedSamples){this.pendingStreamEnd=true;this.flushAudio();}else this.finishCurrent(false);}
      if(m.type==='voice_encoded'){ const p=this.pending.get('encode'); if(p){this.pending.delete('encode');p.resolve();} }
      if(m.type==='error'){this.status(m.error,'error'); const p=this.pending.get('encode');if(p){this.pending.delete('encode');p.reject(new Error(m.error));} if(this.running)this.finishCurrent(false); if(!this.ready){try{this.worker?.terminate();}catch{}this.worker=null;this.loading=false;this.pendingLoad=null;} reject?.(new Error(m.error));} }
    speak(agent,text,voiceId){ const s=settings(); if(!s.enabled||!text?.trim())return; const cfg=window.geebrWorld?.getBrainConfig?.(agent.id)||{}; if(cfg.ttsEnabled===false)return; this.queue.push({agent,text:String(text).slice(0,500),voice:voiceId||cfg.ttsVoiceId||'builtin:alba',at:Date.now(),speakAt:performance.now()}); this.pump(); }
    async pump(){ if(this.running||!this.queue.length)return; this.running=true; try{await this.load();await this.ensureAudio(); if(this.audioCtx.state!=='running')throw new Error('Audio is blocked; click the page once, then try again.'); const item=this.queue.shift(); if(!item)return this.finishCurrent(false); this.current=item; this.dispatchEvent(new CustomEvent('speechstart',{detail:item})); const voice=item.voice.startsWith('custom:')?item.voice:item.voice.replace('builtin:',''); this.worker.postMessage({type:'generate',data:{text:item.text,voice}}); }catch(e){this.status(e.message,'error');this.finishCurrent(false);} }
    // Legacy path only: relay audio chunks from main thread to worklet.
    // With the direct MessagePort, audio flows worker->worklet and this is unused.
    streamChunk(data,metrics={}){if(!this.pcmNode||!data.length)return;if(!this.receivedSamples&&this.current)this.telemetry.audioArrivalMs=performance.now()-this.current.speakAt;this.receivedSamples+=data.length;this.telemetry.chunks++;this.telemetry.lastChunkRtfx=Number(metrics?.chunkRtfx)||0;this.pendingAudio.push(data);this.flushAudio();}
    flushAudio(){if(!this.pcmNode)return;while(this.pendingAudio.length){const chunk=this.pendingAudio.shift();this.pcmNode.port.postMessage({type:'audio',data:chunk},[chunk.buffer]);}if(!this.pendingAudio.length&&this.pendingStreamEnd){this.pendingStreamEnd=false;this.pcmNode.port.postMessage({type:'stream-ended'});}}
    emitTelemetry(){this.dispatchEvent(new CustomEvent('telemetry',{detail:{...this.telemetry}}));}
    finishCurrent(ok){const item=this.current;if(item)this.dispatchEvent(new CustomEvent('speechend',{detail:{...item,ok}}));this.current=null;this.running=false;this.receivedSamples=0;queueMicrotask(()=>this.pump());}
    stop(){this.queue=[];try{this.worker?.postMessage({type:'stop'});this.pcmNode?.port.postMessage({type:'reset'});}catch{}this.finishCurrent(false);}
    unload(){this.stop();try{this.worker?.terminate();}catch{}this.worker=null;this.ready=false;this.loading=false;this.pendingLoad=null;this.pendingAudio=[];this.pending.clear();try{this.pcmNode?.disconnect();}catch{}try{this.gain?.disconnect();}catch{}try{this.audioCtx?.close();}catch{}this.pcmNode=null;this.gain=null;this.audioCtx=null;this.directPort=false;}
    async setLanguage(language){localStorage.setItem('geebrTtsLanguage',language);if(!this.worker)return;this.ready=false;this.status('Loading language…','loading');this.worker.postMessage({type:'set_language',data:{language}});}
    setEnabled(v){localStorage.setItem('geebrTtsEnabled',v?'1':'0');if(!v)this.stop();}
    setVolume(v){localStorage.setItem('geebrTtsVolume',String(v));if(this.gain)this.gain.gain.value=Number(v);}
    async addVoice(name,file){await this.ensureAudio();const ab=await file.arrayBuffer(), decoded=await this.audioCtx.decodeAudioData(ab), mono=this.toMono(decoded), audio=this.resample(mono,decoded.sampleRate,24000);let peak=0;for(const x of audio)peak=Math.max(peak,Math.abs(x));if(peak>.001){const k=Math.min(1.8,.9/peak);for(let i=0;i<audio.length;i++)audio[i]*=k;}const id=crypto.randomUUID();const rec={id,name:name||file.name.replace(/\\.[^.]+$/,''),audio:Array.from(audio),created:Date.now()};await this.dbPut(rec);this.custom.set(id,rec);this.dispatchEvent(new Event('voiceschanged'));if(this.ready)await this.encode(rec);return id;}
    toMono(b){const out=new Float32Array(b.length);for(let c=0;c<b.numberOfChannels;c++){const d=b.getChannelData(c);for(let i=0;i<out.length;i++)out[i]+=d[i]/b.numberOfChannels;}return out;}
    resample(a,ir,or){if(ir===or)return a.slice();const n=Math.round(a.length*or/ir),o=new Float32Array(n),r=ir/or;for(let i=0;i<n;i++){const p=i*r,j=Math.floor(p),f=p-j;o[i]=(a[j]||0)*(1-f)+(a[Math.min(j+1,a.length-1)]||0)*f;}return o;}
    async encode(rec){return new Promise((resolve,reject)=>{this.pending.set('encode',{resolve,reject});const audio=Float32Array.from(rec.audio);this.worker.postMessage({type:'encode_voice',data:{voiceId:rec.id,audio}},[audio.buffer]);});}
    async restoreCustomVoices(){for(const rec of this.custom.values())await this.encode(rec).catch(e=>console.warn('custom voice restore',e));this.dispatchEvent(new Event('voiceschanged'));}
    async deleteVoice(id){this.custom.delete(id);await this.dbDelete(id);this.worker?.postMessage({type:'delete_voice',data:{voiceId:id}});this.dispatchEvent(new Event('voiceschanged'));}
    db(){return new Promise((res,rej)=>{const q=indexedDB.open(DB,1);q.onupgradeneeded=()=>q.result.createObjectStore(STORE,{keyPath:'id'});q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error);});}
    async dbAll(){const d=await this.db();return new Promise((r,j)=>{const q=d.transaction(STORE).objectStore(STORE).getAll();q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error);});}
    async dbPut(v){const d=await this.db();return new Promise((r,j)=>{const q=d.transaction(STORE,'readwrite').objectStore(STORE).put(v);q.onsuccess=()=>r();q.onerror=()=>j(q.error);});}
    async dbDelete(id){const d=await this.db();return new Promise((r,j)=>{const q=d.transaction(STORE,'readwrite').objectStore(STORE).delete(id);q.onsuccess=()=>r();q.onerror=()=>j(q.error);});}
  }
  window.geebrTTS=new PocketTTSManager(); window.addEventListener('pagehide',()=>window.geebrTTS.unload(),{once:true}); window.GEEBR_TTS_BUILTINS=BUILTINS;
})();
