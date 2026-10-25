// 探针 2：单独摆一只旗手 + 一只无名者，查整棵节点树 + 截近景
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9384;
const UD = path.join(os.tmpdir(), 'naiwa-cdp-81tag2');
const OUT = path.join(__dirname, '.tmp-block81-bearer.png');
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
    // 冻结波次，免得又刷怪干扰
    await ev('__game.level.pause && __game.level.pause()');
    await sleep(200);
    // 玩家站 (0,0)，两只摆在正前方 z=-3（画面上方）
    await ev(`(() => { __game.pos.x = 0; __game.pos.z = 0; })()`);
    await sleep(200);
    const tree = await ev(`(() => {
      const out = {};
      const b = __game.enemies.spawn('bearer', { x: -1.6, z: -3 }, { newSquad: true });
      const r = __game.enemies.spawn('ranker', { x: 1.6, z: -3 }, {});
      for (const [k, e] of [['bearer', b], ['ranker', r]]) {
        if (!e) { out[k] = 'spawn failed'; continue; }
        e.hp = 999; e.maxHp = 999;
        // 找到真正挂着模型的 Group：root 有几个孩子？
        const nodes = [];
        e.model.traverse((o) => {
          if (o === e.model) return;
          if (o.isMesh) {
            const g = o.geometry;
            nodes.push({
              name: o.name || '(mesh)',
              geo: g.type,
              hasMap: !!(o.material && o.material.map),
              y: +o.position.y.toFixed(2), z: +o.position.z.toFixed(2),
              wy: +o.getWorldPosition(new e.model.position.constructor()).y.toFixed(2),
            });
          }
        });
        out[k] = {
          pos: [+e.pos.x.toFixed(2), +e.pos.z.toFixed(2)],
          modelScale: +e.model.scale.x.toFixed(3),
          cfgScale: +(e.cfg.height / e.cfg.sourceHeight).toFixed(3),
          tag: e.cfg.tag,
          meshes: nodes.filter((n) => n.geo === 'PlaneGeometry' || n.geo === 'CylinderGeometry' || n.hasMap === false).slice(0, 12),
          planeCount: nodes.filter((n) => n.geo === 'PlaneGeometry').length,
          cylCount: nodes.filter((n) => n.geo === 'CylinderGeometry').length,
        };
      }
      return JSON.stringify(out, null, 1);
    })()`);
    console.log(tree);
    // 钉住不动，好截图
    await ev(`(() => {
      for (const e of __game.enemies.all()) { e.hp = 999; e.maxHp = 999; if (e.squad) e.squad.dir = { x: 0, z: 0 }; }
    })()`);
    await sleep(1600);
    await ev(`(() => { for (const el of document.querySelectorAll('#noticeOv, #signOv, #promoOv, .modal, #meetCard')) { el.classList.remove('on'); el.setAttribute('aria-hidden', 'true'); } })()`);
    await sleep(300);
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(OUT, Buffer.from(shot.data, 'base64'));
    console.log('写出', OUT, (fs.statSync(OUT).size / 1024).toFixed(0) + 'KB');
  } catch (err) {
    console.error('ERR', err.message);
    process.exitCode = 1;
  } finally {
    try { ws && ws.close(); } catch (_) {}
    try { chrome.kill(); } catch (_) {}
    setTimeout(() => process.exit(process.exitCode || 0), 400);
  }
})();
