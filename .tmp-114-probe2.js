// 探针 2：抓「墨线 x/dx 变 NaN」的现场
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9398;
const UD = path.join(os.tmpdir(), 'naiwa-probe-114b');
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
    for (const k of ['notice', 'sign', 'promo']) {
      await ev(`if (__game.${k}.open()) __game.${k}.hide(); 1`);
      await sleep(400);
    }
    await ev('__game.setPendingLevel(11)');
    await ev('(async () => { await __game.beginGame({ tutorial: false }); return 1; })()');
    await sleep(1600);
    for (let i = 0; i < 40; i++) {
      const st = await ev('__game.state');
      if (st === 'playing') break;
      if (st === 'hint') await ev('document.getElementById("hiOk").click()');
      else if (st === 'meet') await ev('document.getElementById("mtOk").click()');
      else if (st === 'weapon') await ev('document.getElementById("wcOk").click()');
      else if (st === 'tutorial') await ev('__game.tutorial.skip()');
      else break;
      await sleep(160);
    }
    await ev('__game.setWaves(true)');
    await ev('__game.block114.fog.clear()');   // 排除雾的干扰
    await ev('__game.warp(0, 8)');
    await sleep(300);
    log('spawn 前 pos', await ev('__game.pos()'));
    await ev("(() => { __game.enemies.spawn('clerk', 0, -2); return 1; })()");
    await ev("(() => { const c = __game.block63.enemies.live('clerk'); if (c) { c.hp = c.maxHp = 999; c.state = 'chase'; } })()");
    for (let i = 0; i < 120; i++) {
      const snap = await ev(`(() => {
        const c = __game.block63.enemies.live('clerk');
        const p = __game.pos();
        const casts = __game.enemies.inkCasts();
        return {
          p, cpos: c ? { x: c.pos.x, z: c.pos.z, st: c.state, t: c.t } : null,
          n: __game.enemies.inkCount(), cast: casts[0] || null,
        };
      })()`);
      if (snap.cast || snap.n > 0) { log('HIT#', i); log('  snap', snap); break; }
      if (i % 10 === 0) log('  poll' + i, snap);
      await sleep(200);
    }
    log('最后 inks', await ev('__game.enemies.inks()'));
    log('最后 pos', await ev('__game.pos()'));
  } catch (e) {
    console.log('ERR', e.message);
  } finally {
    try { ws && ws.close(); } catch (_) {}
    try { chrome.kill(); } catch (_) {}
    setTimeout(() => process.exit(0), 300);
  }
})();
