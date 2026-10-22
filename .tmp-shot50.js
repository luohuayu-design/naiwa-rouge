// 第 50 块：属性页视觉核对（390×844 手机尺寸）
// 跑法：`node .tmp-shot50.js`（先起 http.server 8124）；输出 %TEMP%/naiwa-shot-50/
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9354;
const PAGE = 'http://127.0.0.1:8124/?debug=1&title';
const UD = path.join(os.tmpdir(), 'naiwa-cdp-50shot');
const OUT = path.join(os.tmpdir(), 'naiwa-shot-50');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  fs.rmSync(UD, { recursive: true, force: true });
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const chrome = spawn(CHROME, [
    '--headless=new', '--remote-debugging-port=' + PORT, '--num-raster-threads=2',
    '--enable-unsafe-swiftshader', '--no-first-run', '--no-default-browser-check',
    '--disable-dev-shm-usage', '--user-data-dir=' + UD, '--window-size=390,844', 'about:blank',
  ], { stdio: 'ignore' });
  let ws = null;
  try {
    let list = null;
    for (let i = 0; i < 60; i++) {
      try { list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); break; }
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
      if (r.exceptionDetails) throw new Error('JS 异常: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
      return r.result.value;
    };
    const shot = async (name) => {
      const r = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(r.data, 'base64'));
      console.log('截图:', name);
    };
    await send('Runtime.enable');
    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    async function waitFor(expr, ms = 90000, label = expr) {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) {
        try { if (await ev(expr)) return true; } catch (_) {}
        await sleep(200);
      }
      throw new Error('等待超时: ' + label);
    }
    await waitFor('!!window.__game', 90000, '__game 就绪');
    // 公告是 loading 淡完再 +700ms 才弹（见 main.js boot 末尾），所以要等它真弹出来再关，
    // 否则 hide() 抢在前面白关一次，截图还是被盖住。
    await sleep(2600);
    await ev('window.__game.notice && window.__game.notice.hide && window.__game.notice.hide()');
    await sleep(600);
    await ev('window.__game.notice && window.__game.notice.open && window.__game.notice.open() ? window.__game.notice.hide() : false');
    await sleep(400);
    await shot('menu');
    // 属性页
    await ev('window.__game.statPage.show()');
    await waitFor('window.__game.statPage.ready()', 60000, '模型就绪');
    await sleep(800);
    await shot('stat');
    // 拖一下再拍
    await ev(`(function(){
      const c = document.getElementById('statCanvas');
      const r = c.getBoundingClientRect();
      const y = r.top + r.height / 2, x0 = r.left + 30;
      c.dispatchEvent(new PointerEvent('pointerdown', { clientX: x0, clientY: y, pointerId: 7, bubbles: true }));
      for (let i = 1; i <= 12; i++) c.dispatchEvent(new PointerEvent('pointermove', { clientX: x0 + i * 11, clientY: y, pointerId: 7, bubbles: true }));
      c.dispatchEvent(new PointerEvent('pointerup', { clientX: x0 + 132, clientY: y, pointerId: 7, bubbles: true }));
    })()`);
    await sleep(600);
    await shot('stat-rotated');
    console.log('done →', OUT);
  } catch (err) {
    console.error('ERR', err.message);
    process.exitCode = 1;
  } finally {
    try { ws && ws.close(); } catch (_) {}
    try { chrome.kill(); } catch (_) {}
    setTimeout(() => process.exit(process.exitCode || 0), 400);
  }
})();
