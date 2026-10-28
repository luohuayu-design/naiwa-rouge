// 临时探针：为什么 haloPos 序列化成 {} / inkHit 返回 null
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9397;
const UD = path.join(os.tmpdir(), 'naiwa-probe-114');
const URL = 'http://127.0.0.1:8124/index.html?debug=1&title';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  fs.rmSync(UD, { recursive: true, force: true });
  const chrome = spawn(CHROME, [
    '--headless=new', '--remote-debugging-port=' + PORT, '--num-raster-threads=2',
    '--no-proxy-server', '--enable-unsafe-swiftshader', '--no-first-run',
    '--no-default-browser-check', '--disable-dev-shm-usage',
    '--user-data-dir=' + UD, '--window-size=420,900', 'about:blank',
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
    let id = 0; const pending = new Map();
    ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
    const send = (method, params) => new Promise((res, rej) => {
      const mid = ++id;
      pending.set(mid, (m) => m.error ? rej(new Error(m.error.message)) : res(m.result));
      ws.send(JSON.stringify({ id: mid, method, params }));
    });
    const ev = async (expr) => {
      const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error('JS: ' + (r.exceptionDetails.exception?.description || '').split('\n')[0]);
      return r.result.value;
    };
    const log = (t, v) => console.log(t, JSON.stringify(v));
    await send('Runtime.enable');
    await send('Page.enable');
    await send('Page.navigate', { url: URL });
    for (let i = 0; i < 400 && !(await ev('!!window.__game').catch(() => false)); i++) await sleep(200);
    await sleep(2500);
    await ev('if (__game.notice.open()) __game.notice.hide(); 1');
    await sleep(400);
    await ev('if (__game.sign.open()) __game.sign.hide(); 1');
    await sleep(400);
    await ev('if (__game.promo.open()) __game.promo.hide(); 1');
    await sleep(300);
    await ev('__game.setPendingLevel(11)');
    await ev('(async () => { await __game.beginGame({ tutorial: false }); return 1; })()');
    await sleep(1600);
    const settle = async () => {
      for (let i = 0; i < 40; i++) {
        const st = await ev('__game.state');
        if (st === 'playing') return;
        if (st === 'hint') await ev('document.getElementById("hiOk").click()');
        else if (st === 'meet') await ev('document.getElementById("mtOk").click()');
        else if (st === 'weapon') await ev('document.getElementById("wcOk").click()');
        else if (st === 'tutorial') await ev('__game.tutorial.skip()');
        else break;
        await sleep(160);
      }
    };
    await settle();
    await ev('__game.setWaves(true)');
    await ev('__game.warp(0, 0)');
    await sleep(400);

    // ---- ① halo ----
    await ev('__game.block114.fog.spawn(true)');
    await ev('__game.block114.fog.heat(0)');
    await sleep(400);
    log('halo 直接:', await ev('(() => { const h = __game.block114.fog.haloPos(); return { keys: Object.keys(h), x: h.x, z: h.z, str: JSON.stringify(h) }; })()'));
    log('pos:', await ev('__game.pos()'));
    log('haloPos 原始:', await ev('(() => { const f = __game.block114.fog; return String(f.haloPos()); })()'));

    // ---- ② ink ----
    await ev('__game.warp(0, 8)');
    await ev("(() => { const r = __game.enemies.spawn('clerk', 0, -2); return !!r; })()");
    await ev("(() => { const c = __game.block63.enemies.live('clerk'); if (c) { c.hp = c.maxHp = 999; c.state = 'chase'; } })()");
    for (let i = 0; i < 200; i++) {
      const n = await ev('__game.enemies.inkCount()');
      if (n > 0) break;
      await sleep(200);
    }
    log('inks:', await ev('__game.enemies.inks()'));
    log('inkHit(0,0):', await ev('__game.enemies.inkHit(0, 0)'));
    const raw = await ev(`(() => {
      const k = __game.enemies.inks()[0];
      if (!k) return 'no ink';
      const mid = { x: k.x + k.dx * k.len / 2, z: k.z + k.dz * k.len / 2 };
      return { k, mid, finite: [k.x, k.z, k.dx, k.dz, k.len, k.half].map((v) => Number.isFinite(v)) };
    })()`);
    log('raw:', raw);
    if (raw && raw.mid) {
      await ev(`__game.warp(${raw.mid.x}, ${raw.mid.z})`);
      await sleep(300);
      log('pos after warp:', await ev('__game.pos()'));
      log('inkHit(mid):', await ev(`__game.enemies.inkHit(${raw.mid.x}, ${raw.mid.z})`));
      log('hp:', await ev('__game.stats.hp.cur'));
      await sleep(2500);
      log('hp 2.5s 后:', await ev('__game.stats.hp.cur'));
      log('curse:', await ev('__game.curse()'));
    }
  } catch (e) {
    console.log('ERR', e.message);
  } finally {
    try { ws && ws.close(); } catch (_) {}
    try { chrome.kill(); } catch (_) {}
    setTimeout(() => process.exit(0), 300);
  }
})();
