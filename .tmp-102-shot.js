// 第 102 块 · 视觉检查：公告 / 宣传有礼两张图（手机尺寸 375×812）
// 跑法：先起 8124 静态服务，再 `node .tmp-102-shot.js`；图片写到系统临时目录（路径不能含中文）
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9343;
const PAGE = 'http://127.0.0.1:8124/?debug=1&keepsave';
const UD = path.join(os.tmpdir(), 'naiwa-cdp-102s');
const OUT = process.env.NAIWA_SHOT_DIR || os.tmpdir();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function httpJson(url, method = 'GET') {
  const r = await fetch(url, { method });
  return r.json();
}

(async () => {
  fs.rmSync(UD, { recursive: true, force: true });
  const chrome = spawn(CHROME, [
    '--headless=new', '--remote-debugging-port=' + PORT, '--num-raster-threads=2',
    '--enable-unsafe-swiftshader', '--no-first-run', '--no-default-browser-check',
    '--disable-dev-shm-usage', '--user-data-dir=' + UD, 'about:blank',
  ], { stdio: 'ignore' });

  let ws = null;
  try {
    let list = null;
    for (let i = 0; i < 60; i++) {
      try { list = await httpJson(`http://127.0.0.1:${PORT}/json/list`); break; }
      catch (_) { await sleep(500); }
    }
    if (!list) throw new Error('调试端口没起来');
    const t = await httpJson(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(PAGE)}`, 'PUT');
    ws = new WebSocket(t.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

    let id = 0;
    const pending = new Map();
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    };
    const send = (method, params) => new Promise((res, rej) => {
      const mid = ++id;
      pending.set(mid, (m) => m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result));
      ws.send(JSON.stringify({ id: mid, method, params }));
    });
    const ev = async (expr) => {
      const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
      return r.result.value;
    };
    const waitFor = async (expr, ms = 90000) => {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) {
        try { if (await ev(expr)) return true; } catch (_) {}
        await sleep(150);
      }
      throw new Error('超时: ' + expr);
    };
    const shot = async (name) => {
      const r = await send('Page.captureScreenshot', { format: 'png' });
      const p = path.join(OUT, name);
      fs.writeFileSync(p, Buffer.from(r.data, 'base64'));
      console.log('saved', p);
    };

    await send('Runtime.enable');
    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
    await waitFor('!!window.__game', 90000);
    await ev('window.__game.notice.show(true)');
    await waitFor("document.getElementById('noticeOv').classList.contains('on')", 15000);
    await sleep(600);
    await shot('naiwa-102-notice.png');
    // 群号那一行再单独放大截一张（看标签会不会挤成两行难看）
    const clip = await ev(`(() => {
      const row = [...document.querySelectorAll('#noticeOv .cp-row')].find((r) => r.textContent.includes('1132440548'));
      const b = row.getBoundingClientRect();
      return { x: Math.max(0, b.x - 6), y: Math.max(0, b.y - 6), w: b.width + 12, h: b.height + 12 };
    })()`);
    const r2 = await send('Page.captureScreenshot', {
      format: 'png',
      clip: { x: clip.x, y: clip.y, width: clip.w, height: clip.h, scale: 3 },
    });
    const p2 = path.join(OUT, 'naiwa-102-group-row.png');
    fs.writeFileSync(p2, Buffer.from(r2.data, 'base64'));
    console.log('saved', p2);

    await ev('window.__game.notice.hide()');
    await sleep(300);
    await ev('window.__game.promo.show(true, false)');
    await waitFor("document.getElementById('promoOv').classList.contains('on')", 15000);
    await sleep(600);
    await shot('naiwa-102-promo.png');
  } catch (e) {
    console.error('截图失败:', e.message);
    process.exitCode = 1;
  } finally {
    try { ws && ws.close(); } catch (_) {}
    try { chrome.kill('SIGKILL'); } catch (_) {}
    await sleep(500);
    try { fs.rmSync(UD, { recursive: true, force: true }); } catch (_) {}
  }
})();
