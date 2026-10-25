// 第 77 块：量新模型「原点 → 身体包围盒」的关系（决定 footY 要不要改）
// 跑法：先起 8124，再 `node .tmp-block77-origin.js`
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9362;
const PAGE = 'http://127.0.0.1:8124/?debug=1&title';
const UD = path.join(os.tmpdir(), 'naiwa-cdp-origin77');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const V = '87';

const FILES = [
  ['wellfrog → .tmp-pick/frog.glb', '.tmp-pick/frog.glb', 'Idle', 'front'],
  ['woodfish → .tmp-pick/fish-puffer.glb', '.tmp-pick/fish-puffer.glb', 'Swimming_Normal', 'side'],
];

(async () => {
  fs.rmSync(UD, { recursive: true, force: true });
  const chrome = spawn(CHROME, [
    '--headless=new', '--remote-debugging-port=' + PORT, '--num-raster-threads=2',
    '--enable-unsafe-swiftshader', '--no-first-run', '--no-default-browser-check',
    '--disable-dev-shm-usage', '--user-data-dir=' + UD, '--window-size=800,600', 'about:blank',
  ], { stdio: 'ignore' });
  let ws = null;
  try {
    for (let i = 0; i < 60; i++) {
      try { await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); break; }
      catch (_) { await sleep(500); }
    }
    const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(PAGE)}`, { method: 'PUT' })).json();
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    let id = 0;
    const pending = new Map();
    ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
    const send = (method, params) => new Promise((res, rej) => {
      const mid = ++id;
      pending.set(mid, (m) => m.error ? rej(new Error(m.error.message)) : res(m.result));
      ws.send(JSON.stringify({ id: mid, method, params }));
    });
    const ev = async (expr) => {
      const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error('JS 异常: ' + (r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text));
      return r.result.value;
    };
    await send('Runtime.enable');
    await send('Page.enable');
    const t0 = Date.now();
    while (Date.now() - t0 < 90000) {
      try { if (await ev('!!window.__game')) break; } catch (_) {}
      await sleep(200);
    }

    const out = await ev(`(async () => {
      const THREE = await import('/lib/three.module.js?v=${V}');
      const { GLTFLoader } = await import('/lib/jsm/loaders/GLTFLoader.js?v=${V}');
      const FILES = ${JSON.stringify(FILES)};
      const OFF = 10, MW = 512;
      const cv = document.createElement('canvas'); cv.width = MW; cv.height = MW;
      const rd = new THREE.WebGLRenderer({ canvas: cv, antialias: false, alpha: false });
      rd.setPixelRatio(1); rd.setSize(MW, MW, false);
      rd.setClearColor(0xff00ff, 1);
      const c2 = document.createElement('canvas'); c2.width = MW; c2.height = MW;
      const ctx = c2.getContext('2d', { willReadFrequently: true });
      const loader = new GLTFLoader();
      const res = {};
      for (const [label, file, clip, dir] of FILES) {
        const scene = new THREE.Scene();
        scene.add(new THREE.HemisphereLight(0xffffff, 0x333333, 2.4));
        const g = await loader.loadAsync(file);
        const model = g.scene;
        model.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
        scene.add(model);
        if (clip && g.animations) {
          const c = g.animations.find((x) => x.name === clip || x.name.split('|').pop() === clip);
          if (c) { const mx = new THREE.AnimationMixer(model); mx.clipAction(c).play(); mx.update(0.55); }
        }
        const cam = new THREE.OrthographicCamera(-OFF, OFF, OFF, -OFF, 0.01, 500);
        if (dir === 'side') cam.position.set(200, 0, 0); else cam.position.set(90, 40, 150);
        cam.lookAt(0, 0, 0);
        rd.clear(); rd.render(scene, cam);
        ctx.clearRect(0, 0, MW, MW);
        ctx.drawImage(cv, 0, 0);
        const d = ctx.getImageData(0, 0, MW, MW).data;
        let y0 = MW, y1 = -1;
        for (let y = 0; y < MW; y++) for (let x = 0; x < MW; x++) {
          const i = (y * MW + x) * 4;
          if (Math.abs(d[i] - 255) + d[i + 1] + Math.abs(d[i + 2] - 255) > 24) { if (y < y0) y0 = y; if (y > y1) y1 = y; }
        }
        const k = (OFF * 2) / MW;
        // 画布 y 向下为正；世界 y = OFF - y*k
        const topWorld = OFF - y0 * k;
        const botWorld = OFF - (y1 + 1) * k;
        res[label] = {
          源高: +(topWorld - botWorld).toFixed(3),
          身体最高点: +topWorld.toFixed(3),
          身体最低点: +botWorld.toFixed(3),
          原点在身体: botWorld > 0.02 ? '下方（悬空）' : (topWorld < -0.02 ? '上方' : '包围盒内'),
        };
      }
      return res;
    })()`);
    console.log(JSON.stringify(out, null, 2));
  } catch (err) {
    console.error('ERR', err.message);
    process.exitCode = 1;
  } finally {
    try { ws && ws.close(); } catch (_) {}
    try { chrome.kill(); } catch (_) {}
    setTimeout(() => process.exit(process.exitCode || 0), 400);
  }
})();
