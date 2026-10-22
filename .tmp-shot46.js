// 第 46 块：音效包解锁卡 + 设置行的视觉核对（手机尺寸截图）
// 跑法：先 `python -m http.server 8124`（cwd=naiwa-rouge），再 `node .tmp-shot46.js`
// 输出：%TEMP%/naiwa-shot-46/*.png（路径不含中文）
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9340;
const PAGE = 'http://127.0.0.1:8124/?debug=1&keepsave';
const UD = path.join(os.tmpdir(), 'naiwa-cdp-46shot');
const OUT = path.join(os.tmpdir(), 'naiwa-shot-46');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  fs.rmSync(UD, { recursive: true, force: true });
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const chrome = spawn(CHROME, [
    '--headless=new', '--remote-debugging-port=' + PORT, '--num-raster-threads=2',
    '--enable-unsafe-swiftshader', '--no-first-run', '--no-default-browser-check',
    '--disable-dev-shm-usage', '--user-data-dir=' + UD, 'about:blank',
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
      pending.set(mid, (m) => m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result));
      ws.send(JSON.stringify({ id: mid, method, params }));
    });
    const ev = async (expr) => {
      const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error('JS 异常: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
      return r.result.value;
    };
    await send('Runtime.enable');
    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    for (let i = 0; i < 700; i++) { if (await ev('!!window.__game').catch(() => false)) break; await sleep(200); }
    await sleep(3500);

    async function shot(name) {
      const r = await send('Page.captureScreenshot', { format: 'png' });
      const p = path.join(OUT, name + '.png');
      fs.writeFileSync(p, Buffer.from(r.data, 'base64'));
      console.log('截图 → ' + p);
    }

    await ev('window.__game.pack.reset()');
    await ev('window.__game.ui.showSettings()');
    await sleep(700);
    await shot('settings-locked');
    await ev("document.getElementById('setBack').click()");
    await sleep(400);

    // 解锁卡（垫在结算面板上也是这个观感，这里直接开卡看排版）
    await ev('window.__game.pack.show()');
    await sleep(700);
    await shot('pack-get');

    await ev("document.getElementById('pgYes').click()");
    await sleep(500);
    await ev('window.__game.ui.showSettings()');
    await sleep(700);
    await shot('settings-unlocked');
    await ev("document.getElementById('setBack').click()");
    await sleep(400);

    // 结算面板上的实际观感：假结算 + 卡 + 选完之后的 toast
    // （先等 2.5 秒，让游戏里可能正在跑的成就 toast 自己散掉，别叠在截图上）
    await sleep(2500);
    await ev("document.getElementById('result').classList.add('on')");
    await ev('window.__game.pack.reset(); window.__game.pack.show()');
    await sleep(700);
    await shot('over-pack');
    await ev("document.getElementById('pgYes').click()");
    await sleep(450);
    await shot('over-toast');
  } finally {
    try { ws && ws.close(); } catch (_) {}
    try { chrome.kill('SIGKILL'); } catch (_) {}
    await sleep(500);
    try { fs.rmSync(UD, { recursive: true, force: true }); } catch (_) {}
  }
})();
