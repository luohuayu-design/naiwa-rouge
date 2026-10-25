// 第 79 块截图：加载页新的提示态（慢 / 很久 / 真失败）
// 跑法：先起 python -m http.server 8124（cwd=naiwa-rouge），再 node .tmp-block79-shot.js
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9496;
const UD = path.join(os.tmpdir(), 'naiwa-shot79-' + process.pid);
const OUT = path.join(os.tmpdir(), 'naiwa-shot79');
const BASE = 'http://127.0.0.1:8124';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT,
    '--num-raster-threads=2', '--enable-unsafe-swiftshader', '--no-first-run',
    '--no-default-browser-check', '--disable-dev-shm-usage', '--user-data-dir=' + UD,
    '--window-size=430,900', '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
    'about:blank'], { stdio: 'ignore' });
  let ws;
  try {
    for (let i = 0; i < 60; i++) { try { await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); break; } catch (_) { await sleep(500); } }
    const t = await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent('about:blank')}`, { method: 'PUT' })).json();
    ws = new WebSocket(t.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    let id = 0; const pend = new Map();
    ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
    const send = (m, p) => new Promise((res, rej) => { const mid = ++id;
      pend.set(mid, (x) => (x.error ? rej(new Error(x.error.message)) : res(x.result)));
      ws.send(JSON.stringify({ id: mid, method: m, params: p })); });
    const ev = async (ex) => {
      const r = await send('Runtime.evaluate', { expression: ex, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error('js: ' + ex.slice(0, 60));
      return r.result.value;
    };
    const waitFor = async (ex, ms, label) => {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) { try { if (await ev(ex)) return true; } catch (_) {} await sleep(200); }
      throw new Error('等待超时: ' + label);
    };
    const shot = async (name) => {
      const r = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(OUT, name), Buffer.from(r.data, 'base64'));
      console.log('  截了 ' + name);
    };
    const slow = (kbps) => send('Network.emulateNetworkConditions',
      { offline: false, latency: 300, downloadThroughput: kbps * 1024, uploadThroughput: kbps * 1024 });

    await send('Page.enable', {}); await send('Runtime.enable', {}); await send('Network.enable', {});
    await send('Emulation.setDeviceMetricsOverride', { width: 430, height: 900, deviceScaleFactor: 2, mobile: true });

    // ---- 慢：9 秒后的黄字 ----
    await slow(20);
    await send('Page.navigate', { url: BASE + '/index.html?debug=1&title&nosw=1' });
    await waitFor('window.__ldT && window.__ldT.slow > 0', 60000, '9 秒慢提示');
    // 等 CSS 也到，不然截出来是无样式的一坨
    await waitFor(`(() => { const e = document.getElementById('ldTxt');
      return e && getComputedStyle(e).fontSize === '11px'; })()`, 60000, 'style.css 到位');
    await sleep(400);
    await shot('slow.png');

    // ---- 很久：25 秒后的重试按钮 ----
    await waitFor('window.__ldT && window.__ldT.long > 0', 60000, '25 秒提示');
    await sleep(400);
    await shot('long.png');

    // ---- 真失败：拦截 main.js ----
    await send('Network.emulateNetworkConditions',
      { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    // 用 setBlockedURLs 比 Fetch.failRequest 省事：直接让请求 fail，
    // script 元素的 error 事件照常派发。前面得先绕过缓存，否则 main.js
    // 躺在内存缓存里根本不发请求，拦不到。
    await send('Network.setCacheDisabled', { cacheDisabled: true });
    await send('Network.setBlockedURLs', { urls: ['*js/main.js*'] });
    await send('Page.navigate', { url: BASE + '/index.html?debug=1&title&nosw=1&fail=1' });
    await waitFor('window.__ldT && window.__ldT.fail > 0', 60000, '失败提示');
    await sleep(500);
    await shot('fail.png');

    console.log('截图目录：' + OUT);
  } catch (e) {
    console.error('FAIL ' + e.message);
  } finally {
    try { ws && ws.close(); } catch (_) {}
    try { chrome.kill(); } catch (_) {}
    setTimeout(() => process.exit(0), 300);
  }
})();
