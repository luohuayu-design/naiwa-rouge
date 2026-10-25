// 探针 4：把木牌到场景根的整条祖先链（含各自 local scale / world scale）打出来
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9386;
const UD = path.join(os.tmpdir(), 'naiwa-cdp-81tag4');
const URL = 'http://127.0.0.1:8124/index.html?debug=1&title&keepsave=1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  fs.rmSync(UD, { recursive: true, force: true });
  const chrome = spawn(CHROME, [
    '--headless=new', '--remote-debugging-port=' + PORT, '--num-raster-threads=2',
    '--enable-unsafe-swiftshader', '--no-first-run', '--no-default-browser-check',
    '--disable-dev-shm-usage', '--disable-background-timer-throttling',
    '--user-data-dir=' + UD, '--window-size=600,1000', 'about:blank',
  ], { stdio: 'ignore' });
  let ws = null;
  try {
    for (let i = 0; i < 60; i++) {
      try { await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); break; }
      catch (_) { await sleep(500); }
    }
    const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent('about:blank')}`, { method: 'PUT' })).json();
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    let id = 0;
    const pending = new Map();
    ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
    const send = (method, params) => new Promise((res, rej) => {
      const mid = ++id;
      pending.set(mid, (m) => (m.error ? rej(new Error(m.error.message)) : res(m.result)));
      ws.send(JSON.stringify({ id: mid, method, params }));
    });
    const ev = async (expr) => {
      const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error('JS: ' + (r.exceptionDetails.exception?.description || '').split('\n')[0]);
      return r.result.value;
    };
    await send('Page.enable', {});
    await send('Runtime.enable', {});
    await send('Emulation.setDeviceMetricsOverride', { width: 600, height: 1000, deviceScaleFactor: 1, mobile: true });
    await send('Page.navigate', { url: URL });
    const t0 = Date.now();
    while (Date.now() - t0 < 90000) {
      try { if (await ev('!!window.__game')) break; } catch (_) {}
      await sleep(250);
    }
    await sleep(700);
    await ev(`(() => { for (const i of ['noticeOk','signClose','sgClose','prCover','prClose']) { const b = document.getElementById(i); if (b) b.click(); } })()`);
    await sleep(400);
    await ev('__game.beginGame({tutorial:false})');
    await sleep(700);
    await ev('__game.setAdmin(true)');
    await ev('__game.setLevel(8)');
    await ev('__game.ensureLevelAssets(8)');
    await sleep(700);
    await ev('__game.enemies.killAll()');
    await sleep(250);
    const info = await ev(`(() => {
      const b = __game.enemies.spawn('bearer', { x: -1.6, z: -3 }, { newSquad: true });
      let plane = null;
      b.model.traverse((o) => { if (o.isMesh && o.geometry.type === 'PlaneGeometry') plane = o; });
      const chain = [];
      let n = plane;
      const V = plane.position.constructor;
      while (n) {
        const ws = new V(); n.getWorldScale(ws);
        chain.push({
          name: n.name || n.type,
          localScale: +n.scale.x.toFixed(4),
          worldScale: +ws.x.toFixed(4),
          isRoot: n === __game.scene ? true : undefined,
        });
        n = n.parent;
      }
      // 相机 → 木牌 法线点积（判「是不是侧面朝我」）
      const nrm = new V(0, 0, 1);
      plane.getWorldDirection ? null : null;
      const m3 = plane.matrixWorld.clone();
      const three = plane.matrixWorld.elements;
      const nw = new V(three[8], three[9], three[10]).normalize();
      const cam = __game.renderer ? null : null;
      return JSON.stringify({ chain, normalWorld: [+nw.x.toFixed(2), +nw.y.toFixed(2), +nw.z.toFixed(2)], modelIsGroup: b.model.type, hasRoot: !!b.root, rootScale: b.root ? +b.root.scale.x.toFixed(3) : null }, null, 1);
    })()`);
    console.log(info);
  } catch (err) {
    console.error('ERR', err.message);
    process.exitCode = 1;
  } finally {
    try { ws && ws.close(); } catch (_) {}
    try { chrome.kill(); } catch (_) {}
    setTimeout(() => process.exit(process.exitCode || 0), 400);
  }
})();
