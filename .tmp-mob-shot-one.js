// 第 52 块：逐只 spawn + 截图（排查与验收：盾斧兽人的盾 / 雾鬼 / 缝补小巫）
// 跑法：先起 8124，再 `node .tmp-mob-shot-one.js` → %TEMP%/naiwa-mob-shots/step-*.png
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9361;
const PAGE = 'http://127.0.0.1:8124/?debug=1';
const UD = path.join(os.tmpdir(), 'naiwa-cdp-shotone');
const OUT = path.join(os.tmpdir(), 'naiwa-mob-shots');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  fs.rmSync(UD, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT,
    '--num-raster-threads=2', '--enable-unsafe-swiftshader', '--no-first-run',
    '--no-default-browser-check', '--disable-dev-shm-usage', '--user-data-dir=' + UD,
    '--window-size=460,900', 'about:blank'], { stdio: 'ignore' });
  let ws = null;
  try {
    for (let i = 0; i < 60; i++) {
      try { await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); break; } catch (_) { await sleep(500); }
    }
    const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(PAGE)}`, { method: 'PUT' })).json();
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    let id = 0; const pending = new Map();
    ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
    const send = (method, params) => new Promise((res, rej) => {
      const mid = ++id; pending.set(mid, (m) => m.error ? rej(new Error(m.error.message)) : res(m.result));
      ws.send(JSON.stringify({ id: mid, method, params }));
    });
    const ev = async (expr) => {
      const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error('JS: ' + (r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text));
      return r.result.value;
    };
    const shotTo = async (name) => {
      const sh = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(OUT, name), Buffer.from(sh.data, 'base64'));
      console.log('截图', name);
    };
    await send('Runtime.enable');
    const t0 = Date.now();
    while (Date.now() - t0 < 90000) { try { if (await ev('!!window.__game')) break; } catch (_) {} await sleep(200); }
    await sleep(1300);
    await ev(`(() => { const b = document.getElementById('tutNo'); if (b) b.click(); return true; })()`);
    await sleep(400);
    await ev(`__game.setAdmin(true)`);
    await shotTo('step-0-before.png');

    const plan = [['shielder', -1.8], ['wraith', 0], ['mender', 1.8]];
    for (const [t, dx] of plan) {
      const r = await ev(`(() => {
        const p = __game.pos;
        const e = __game.enemies.spawn(${JSON.stringify(t)}, { x: p.x + ${dx}, z: p.z - 2.6 }, {});
        if (!e) return { ok: false };
        e.speed = 0; e.attackCd = 99; e.restCd = 99;
        return { ok: true, id: e.id, scale: +e.model.scale.x.toFixed(3), my: +e.model.position.y.toFixed(3) };
      })()`);
      await sleep(1800);
      console.log('step', t, JSON.stringify(r));
      await shotTo('step-' + t + '.png');
    }
  } catch (err) {
    console.error('ERR', err.message);
  } finally {
    try { ws && ws.close(); } catch (_) {}
    try { chrome.kill(); } catch (_) {}
    setTimeout(() => process.exit(0), 300);
  }
})();
