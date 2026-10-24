// 第 63 块：直接量 Box3（不靠像素），用来交叉验算 .tmp-block63-calib.js 的数字
// 跑法：先起 8124 服务器，再 node .tmp-block63-bbox.js
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9359;
const PAGE = 'http://127.0.0.1:8124/?debug=1&title';
const UD = path.join(os.tmpdir(), 'naiwa-cdp-bbox63');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const V = '74';

const FILES = [
  'assets/monsters/hooded-scribe.glb',
  'assets/monsters/reboot-unit.glb',
  'assets/monsters/skeleton-warrior.glb',
  'assets/monsters/wizard.glb',
];

(async () => {
  fs.rmSync(UD, { recursive: true, force: true });
  const chrome = spawn(CHROME, [
    '--headless=new', '--remote-debugging-port=' + PORT, '--num-raster-threads=2',
    '--enable-unsafe-swiftshader', '--no-first-run', '--no-default-browser-check',
    '--disable-dev-shm-usage', '--user-data-dir=' + UD, '--window-size=520,520', 'about:blank',
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
    const t0 = Date.now();
    while (Date.now() - t0 < 90000) {
      try { if (await ev('!!window.__game')) break; } catch (_) {}
      await sleep(200);
    }
    for (const f of FILES) {
      const r = await ev(`(async () => {
        const THREE = await import('/lib/three.module.js?v=${V}');
        const { GLTFLoader } = await import('/lib/jsm/loaders/GLTFLoader.js?v=${V}');
        const g = await new GLTFLoader().loadAsync(${JSON.stringify(f)});
        const s = g.scene;
        s.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(s);
        const sz = new THREE.Vector3(); box.getSize(sz);
        const rootScale = s.scale.toArray();
        return {
          height: +sz.y.toFixed(3), width: +sz.x.toFixed(3), depth: +sz.z.toFixed(3),
          minY: +box.min.y.toFixed(3), maxY: +box.max.y.toFixed(3),
          rootScale, clips: g.animations.map(c => c.name.length > 22 ? c.name.slice(0, 22) : c.name),
        };
      })()`);
      console.log(f.split('/').pop().padEnd(24), '高', String(r.height).padStart(6),
        '脚', String(r.minY).padStart(7), '宽', String(r.width).padStart(5),
        '缩放', JSON.stringify(r.rootScale), '段数', r.clips.length);
      if (f.includes('hooded') || f.includes('reboot')) console.log('   clips:', r.clips.join(', '));
    }
  } catch (err) {
    console.error('ERR', err.message);
    process.exitCode = 1;
  } finally {
    try { ws && ws.close(); } catch (_) {}
    try { chrome.kill(); } catch (_) {}
    setTimeout(() => process.exit(process.exitCode || 0), 400);
  }
})();
