(() => {
  'use strict';

  const scripts = [
    ['https://cdn.jsdelivr.net/npm/pako@1.0.11/dist/pako_deflate.min.js'],
    ['https://cdn.jsdelivr.net/npm/upng-js@2.1.0/UPNG.js'],
    ['https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js'],
    ['note-svg.js'],
    ['recorder.js'],
    ['confirm-dialog.js'],
    ['toast.js'],
    ['ui-polish.js'],
    ['tabs.js'],
    ['library.js'],
    ['https://cdn.babylonjs.com/babylon.js'],
    ['https://cdn.babylonjs.com/loaders/babylonjs.loaders.min.js'],
    ['https://cdn.babylonjs.com/havok/HavokPhysics_umd.js'],
    ['tts/pocket-tts-manager.js'],
    ['tts/tts-ui.js'],
    ['app.js'],
    ['llm_js/world-integration.js', 'module'],
  ];

  function browserSummary() {
    const ua = navigator.userAgent;
    const safari = ua.match(/Version\/(\d+(?:\.\d+)?).*Safari\//);
    const firefox = ua.match(/Firefox\/(\d+(?:\.\d+)?)/);
    const chromium = ua.match(/(?:Chrome|Chromium|Edg)\/(\d+(?:\.\d+)?)/);
    if (safari && !/Chrome|Chromium|Edg/.test(ua)) return `Safari ${safari[1]}`;
    if (firefox) return `Firefox ${firefox[1]}`;
    if (chromium) return `Chromium ${chromium[1]}`;
    return navigator.userAgentData?.brands?.map(x => `${x.brand} ${x.version}`).join(', ') || 'This browser';
  }

  function showCompatibility(reason, detail) {
    document.body.classList.remove('geebr-preflight-pending');
    document.body.classList.add('geebr-incompatible');
    const screen = document.getElementById('compatibilityScreen');
    const reasonNode = document.getElementById('compatibilityReason');
    const detailNode = document.getElementById('compatibilityDetail');
    if (reasonNode) reasonNode.textContent = reason;
    if (detailNode) detailNode.textContent = `${browserSummary()} · ${detail}`;
    if (screen) screen.hidden = false;
  }

  function loadScript(src, type) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      if (type) script.type = type;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Could not load ${src}`));
      document.body.appendChild(script);
    });
  }

  async function start() {
    if (!('gpu' in navigator) || !navigator.gpu) {
      showCompatibility(
        'WebGPU is not available in this browser.',
        'The WebGPU browser API was not found. No model or world files were loaded.'
      );
      return;
    }

    let adapter;
    try {
      adapter = await navigator.gpu.requestAdapter();
    } catch (error) {
      showCompatibility(
        'WebGPU could not start on this device.',
        `The browser rejected the graphics adapter check: ${error?.message || 'unknown error'}`
      );
      return;
    }
    if (!adapter) {
      showCompatibility(
        'WebGPU is present, but no compatible graphics adapter is available.',
        'WebGPU may be disabled, blocked, or unsupported by this browser/device combination.'
      );
      return;
    }

    document.body.classList.remove('geebr-preflight-pending');
    document.body.classList.add('geebr-compatible');
    try {
      for (const [src, type] of scripts) await loadScript(src, type);
    } catch (error) {
      console.error('[geebr preflight] startup resource failed', error);
      document.body.classList.remove('geebr-compatible');
      showCompatibility(
        'Geebr World passed the WebGPU check, but a required file did not load.',
        `${error?.message || 'Startup resource error'}. Reload the page or check the network connection.`
      );
    }
  }

  document.getElementById('compatibilityRetry')?.addEventListener('click', () => location.reload());
  start();
})();
