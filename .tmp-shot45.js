// 第 45 块：公告 + 主菜单第三排的视觉核对（手机尺寸截图）
// 跑法：先 `python -m http.server 8124`（cwd=naiwa-rouge），再 `node .tmp-shot45.js`
// 输出：%TEMP%/naiwa-shot-45-*.png（路径不含中文，Chrome 不认中文路径）
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9336;
const PAGE = 'http://127.0.0.1:8124/?debug=1&title';
const UD = path.join(os.tmpdir(), 'naiwa-cdp-45shot');
const OUT = path.join(os.tmpdir(), 'naiwa-shot-45');
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
    const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result.value;
    await send('Runtime.enable');
    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    for (let i = 0; i < 700; i++) { if (await ev('!!window.__game').catch(() => false)) break; await sleep(200); }
    await sleep(4000);   // 等标题页淡入

    async function shot(name) {
      const r = await send('Page.captureScreenshot', { format: 'png' });
      const p = path.join(OUT, name + '.png');
      fs.writeFileSync(p, Buffer.from(r.data, 'base64'));
      console.log('截图 → ' + p);
      return p;
    }
    // 「?debug=1&title」不起 AUTO_START，所以公告会自己弹出来挡住标题页 —— 先收掉
    await ev("document.getElementById('noticeOv').classList.remove('on')");
    await sleep(300);
    await shot('menu');
    await ev('window.__game.notice.show(true)');
    await sleep(700);
    await shot('notice');
    // 滚到底看两条复制行 + 勾选框
    await ev("document.querySelector('.notice-box').scrollTop = 9999");
    await sleep(500);
    await shot('notice-bottom');
  } finally {
    try { ws && ws.close(); } catch (_) {}
    try { chrome.kill('SIGKILL'); } catch (_) {}
    await sleep(500);
    try { fs.rmSync(UD, { recursive: true, force: true }); } catch (_) {}
  }
})();
