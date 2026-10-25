// 探针：第八关旗手到底有没有挂上木牌 / 尺寸与位置对不对
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9383;
const UD = path.join(os.tmpdir(), 'naiwa-cdp-81probe');
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

    // 单独造一只旗手 + 一只无名者，摆开看
    const info = await ev(`(() => {
      const out = [];
      const b = __game.enemies.spawn('bearer', { x: 0, z: -6 }, { newSquad: true });
      const r = __game.enemies.spawn('ranker', { x: 3, z: -6 }, {});
      for (const [k, e] of [['bearer', b], ['ranker', r]]) {
        if (!e) { out.push({ k, fail: true }); continue; }
        e.hp = 999; e.maxHp = 999;
        const root = e.root || e.model;
        const kids = [];
        const walk = (o, d) => {
          if (d > 3) return;
          for (const c of o.children) {
            kids.push({ n: c.name || c.type, y: +c.position.y.toFixed(2), z: +c.position.z.toFixed(2), sx: +c.scale.x.toFixed(3), vis: c.visible, hasCanvas: !!(c.material && c.material.map) });
            walk(c, d + 1);
          }
        };
        walk(root, 0);
        out.push({
          k,
          pos: [+e.pos.x.toFixed(2), +e.pos.z.toFixed(2)],
          scale: +root.scale.x.toFixed(3),
          y: +root.position.y.toFixed(2),
          height: e.cfg.height,
          tag: e.cfg.tag || null,
          kids: kids.slice(0, 14),
        });
      }
      return JSON.stringify(out, null, 1);
    })()`);
    console.log(info);
    await sleep(1200);
    console.log('--- 1.2 秒后再读一次（位置会走动）---');
    console.log(await ev(`JSON.stringify(__game.enemies.all().map(e => [e.type, +e.pos.x.toFixed(2), +e.pos.z.toFixed(2), e.squad ? +e.squad.dir.x.toFixed(2) + ',' + +e.squad.dir.z.toFixed(2) : null]))`));
  } catch (err) {
    console.error('ERR', err.message);
    process.exitCode = 1;
  } finally {
    try { ws && ws.close(); } catch (_) {}
    try { chrome.kill(); } catch (_) {}
    setTimeout(() => process.exit(process.exitCode || 0), 400);
  }
})();
