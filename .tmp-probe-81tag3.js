// 探针 3：木牌 plane 的运行时状态 + 强制染成亮红再截一张
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9385;
const UD = path.join(os.tmpdir(), 'naiwa-cdp-81tag3');
const OUT1 = path.join(__dirname, '.tmp-81tag-normal.png');
const OUT2 = path.join(__dirname, '.tmp-81tag-red.png');
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

    const info = await ev(`(() => {
      const b = __game.enemies.spawn('bearer', { x: -1.6, z: -3 }, { newSquad: true });
      b.hp = 999; b.maxHp = 999;
      if (b.squad) b.squad.dir = { x: 0, z: 0 };
      const planes = [];
      b.model.traverse((o) => { if (o.isMesh && o.geometry.type === 'PlaneGeometry') planes.push(o); });
      const p = planes[0];
      const wp = p.getWorldPosition(new p.position.constructor());
      // 投影到屏幕
      const cam = __game.scene.__cam || null;
      const three = p.matrixWorld;
      return JSON.stringify({
        n: planes.length,
        visible: p.visible,
        parentVisible: p.parent.visible,
        matType: p.material.type,
        side: p.material.side,
        transparent: p.material.transparent,
        opacity: p.material.opacity,
        hasMap: !!p.material.map,
        mapImg: p.material.map && p.material.map.image ? [p.material.map.image.width, p.material.map.image.height] : null,
        color: p.material.color ? p.material.color.getHexString() : null,
        emissive: p.material.emissive ? p.material.emissive.getHexString() : null,
        worldPos: [+wp.x.toFixed(2), +wp.y.toFixed(2), +wp.z.toFixed(2)],
        worldScale: (() => { const v = new wp.constructor(); p.getWorldScale(v); return [+v.x.toFixed(3), +v.y.toFixed(3)]; })(),
        renderOrder: p.renderOrder,
        frustumCulled: p.frustumCulled,
        geoParams: p.geometry.parameters,
      }, null, 1);
    })()`);
    console.log(info);
    // 正常状态截一张
    await sleep(900);
    await ev(`(() => { for (const el of document.querySelectorAll('#noticeOv, #signOv, #promoOv, .modal, #meetCard')) { el.classList.remove('on'); el.setAttribute('aria-hidden', 'true'); } })()`);
    await sleep(200);
    let shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(OUT1, Buffer.from(shot.data, 'base64'));
    console.log('写出', OUT1);
    // 强制染亮红 + 关掉光照影响，确认它到底在不在画面上
    await ev(`(() => {
      const b = __game.enemies.all().find((e) => e.type === 'bearer');
      b.model.traverse((o) => {
        if (o.isMesh && o.geometry.type === 'PlaneGeometry') {
          o.material.map = null;
          o.material.color.setHex(0xff0000);
          o.material.emissive = o.material.emissive || o.material.color.clone();
          if (o.material.emissive) o.material.emissive.setHex(0xff0000);
          o.material.needsUpdate = true;
        }
      });
    })()`);
    await sleep(800);
    shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(OUT2, Buffer.from(shot.data, 'base64'));
    console.log('写出', OUT2);
  } catch (err) {
    console.error('ERR', err.message);
    process.exitCode = 1;
  } finally {
    try { ws && ws.close(); } catch (_) {}
    try { chrome.kill(); } catch (_) {}
    setTimeout(() => process.exit(process.exitCode || 0), 400);
  }
})();
