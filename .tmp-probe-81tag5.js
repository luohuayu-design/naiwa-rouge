// 探针 5：把「木牌中心 / 头顶 / 脚底」投影到屏幕像素坐标，并顺手截一张
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9387;
const UD = path.join(os.tmpdir(), 'naiwa-cdp-81tag5');
const OUT = path.join(__dirname, '.tmp-81tag-proj.png');
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
    await send('Emulation.setDeviceMetricsOverride', { width: 600, height: 1000, deviceScaleFactor: 2, mobile: true });
    await send('Page.navigate', { url: URL });
    const t0 = Date.now();
    while (Date.now() - t0 < 90000) {
      try { if (await ev('!!window.__game')) break; } catch (_) {}
      await sleep(250);
    }
    await sleep(700);
    await ev(`(() => { for (const i of ['noticeOk','signClose','sgClose','prClose']) { const b = document.getElementById(i); if (b) b.click(); } })()`);
    await sleep(400);
    await ev('__game.beginGame({tutorial:false})');
    await sleep(700);
    await ev('__game.setAdmin(true)');
    await ev('__game.setLevel(8)');
    await ev('__game.ensureLevelAssets(8)');
    await sleep(700);
    await ev('__game.enemies.killAll()');
    await sleep(250);
    await ev(`(() => { __game.pos.x = 0; __game.pos.z = 0; })()`);
    await sleep(200);
    const proj = await ev(`(() => {
      
      const b = __game.enemies.spawn('bearer', { x: -1.0, z: -3.5 }, { newSquad: true });
      b.hp = 999; b.maxHp = 999;
      let plane = null;
      b.model.traverse((o) => { if (o.isMesh && o.geometry.type === 'PlaneGeometry') plane = o; });
      const V = plane.position.constructor;
      return JSON.stringify({ spawned: true });
    })()`);
    console.log(proj);
    await sleep(1200);
    // 暂停世界，保证投影与截图是同一帧姿态
    const out = await ev(`(() => {
      const b = __game.enemies.all().find((e) => e.type === 'bearer');
      let plane = null;
      b.model.traverse((o) => { if (o.isMesh && o.geometry.type === 'PlaneGeometry') plane = o; });
      const V = plane.position.constructor;
      const cam = __game.camera;
      const W = window.innerWidth, H = window.innerHeight;
      const toPx = (v) => {
        const p = v.clone().project(cam);
        return [Math.round((p.x * 0.5 + 0.5) * W), Math.round((-p.y * 0.5 + 0.5) * H)];
      };
      const boardW = plane.getWorldPosition(new V());
      const feet = new V(b.pos.x, 0, b.pos.z);
      const head = new V(b.pos.x, b.cfg.height, b.pos.z);
      // 木牌四个角
      const corners = [];
      const geo = plane.geometry.parameters;
      for (const [dx, dy] of [[-1,-1],[1,-1],[1,1],[-1,1]]) {
        const local = new V(dx * geo.width / 2, dy * geo.height / 2, 0);
        plane.localToWorld(local);
        corners.push(toPx(local));
      }
      return JSON.stringify({
        canvas: [W, H],
        boardCenterPx: toPx(boardW),
        cornersPx: corners,
        feetPx: toPx(feet),
        headPx: toPx(head),
        boardWorldY: +boardW.y.toFixed(2),
        pos: [+b.pos.x.toFixed(2), +b.pos.z.toFixed(2)],
      }, null, 1);
    })()`);
    console.log(out);
    await ev(`(() => { for (const el of document.querySelectorAll('#noticeOv, #signOv, #promoOv, #meetCard')) { el.classList.remove('on'); el.setAttribute('aria-hidden', 'true'); } })()`);
    await sleep(200);
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(OUT, Buffer.from(shot.data, 'base64'));
    console.log('写出', OUT);
  } catch (err) {
    console.error('ERR', err.message);
    process.exitCode = 1;
  } finally {
    try { ws && ws.close(); } catch (_) {}
    try { chrome.kill(); } catch (_) {}
    setTimeout(() => process.exit(process.exitCode || 0), 400);
  }
})();
