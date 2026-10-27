// 第 104 块 · 视觉检查：设置页存档区（四颗键 + 兜底行）
// 跑法：先起 8124 静态服务（run_in_background），再 `node .tmp-104-shot.js`
// 图片写到系统临时目录（路径不能含中文）
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9346;
const PAGE = 'http://127.0.0.1:8124/?debug=1&keepsave';
const UD = path.join(os.tmpdir(), 'naiwa-cdp-104s');
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
    const shot = async (name, clip) => {
      const r = await send('Page.captureScreenshot', clip ? { format: 'png', clip } : { format: 'png' });
      const p = path.join(OUT, name);
      fs.writeFileSync(p, Buffer.from(r.data, 'base64'));
      console.log('saved', p);
    };
    const boxOf = async (sel) => await ev(`(() => {
      const el = document.querySelector(${JSON.stringify(sel)});
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { x: Math.max(0, b.x - 8), y: Math.max(0, b.y - 8), w: b.width + 16, h: b.height + 16 };
    })()`);

    await send('Runtime.enable');
    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
    await waitFor('!!window.__game', 90000);

    // 把自动弹的三个层拆掉（公告 → 签到 → 宣传有礼 是 350ms 定时器链）
    for (const [ov, btn] of [['noticeOv', 'noticeOk'], ['signOv', 'signClose'], ['promoOv', 'promoClose']]) {
      await sleep(600);
      if (await ev(`document.getElementById('${ov}') && document.getElementById('${ov}').classList.contains('on')`)) {
        await ev(`(() => { const b = document.getElementById('${btn}'); if (b) b.click(); return 1; })()`);
      }
    }
    await sleep(500);

    await ev('window.__game.ui.showSettings()');
    await waitFor(`document.getElementById('setScr').classList.contains('on')`, 15000);
    await sleep(500);

    // 存档区整块
    await ev(`document.querySelector('.set-io').scrollIntoView({ block: 'center' })`);
    await sleep(400);
    const b1 = await boxOf('.set-io');
    if (b1) await shot('naiwa-104-io-row.png', { x: b1.x, y: b1.y, width: b1.w, height: b1.h, scale: 2 });

    // 点导出 → 兜底行出现
    await ev(`document.getElementById('ioExportFile').click()`);
    await sleep(600);
    const b2 = await boxOf('.set-io');
    if (b2) await shot('naiwa-104-io-after-export.png', { x: b2.x, y: b2.y, width: b2.w, height: b2.h, scale: 2 });
    console.log('fallback row visible =', await ev(`!document.getElementById('ioSaveRow').hidden`));
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
