// 第 80 块截图：第六关并联体的电弧网（给用户看「线从铁疙瘩身上长出来」）
// 跑法：先起 `python -m http.server 8124`，再 `node .tmp-block80-shot.js`
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9381;
const UD = path.join(os.tmpdir(), 'naiwa-cdp-80shot');
const OUT = path.join(__dirname, '.tmp-block80-arc.png');
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
    await send('Emulation.setDeviceMetricsOverride', { width: 600, height: 1000, deviceScaleFactor: 2, mobile: true });
    await send('Page.navigate', { url: URL });

    const t0 = Date.now();
    while (Date.now() - t0 < 90000) {
      try { if (await ev('!!window.__game')) break; } catch (_) {}
      await sleep(250);
    }
    await sleep(900);
    // 先把公告 / 签到 / 宣传有礼这一串弹窗收掉，不然截图全是它们
    await ev(`(() => {
      for (const id of ['noticeOk', 'signClose', 'sgClose', 'prClose']) {
        const b = document.getElementById(id);
        if (b) b.click();
      }
      for (const el of document.querySelectorAll('.modal.on, #noticeOv.on')) {
        el.classList.remove('on');
        el.setAttribute('aria-hidden', 'true');
      }
    })()`);
    await sleep(600);
    await ev('__game.beginGame({tutorial:false})');
    await sleep(800);
    await ev('__game.setAdmin(true)');
    await ev('__game.setLevel(6)');
    await ev('__game.ensureLevelAssets(6)');
    await sleep(600);
    await ev('__game.enemies.killAll()');
    await sleep(300);
    // 四只摆成边长 3 格的正方形（正好卡在 minGap 上，说明分离已经把它推到极限）：
    // 6 条线 + 中间那块空地，一眼能看出「网」和「缝」。相机是跟玩家的，别手动改。
    await ev(`(() => {
      for (const [x, z] of [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]]) {
        const e = __game.enemies.spawn('arc', { x, z }, {});
        if (e) { e.hp = 999; e.maxHp = 999; e.speed = 0; }
      }
    })()`);
    await sleep(2200);
    // 公告 → 签到 → 宣传有礼是 350ms 一串链，前面点一次清不干净 —— 截图前再扫一遍
    await ev(`(() => {
      for (const el of document.querySelectorAll('#noticeOv, #signOv, #promoOv, .modal, #meetCard')) {
        el.classList.remove('on');
        el.setAttribute('aria-hidden', 'true');
      }
    })()`);
    await sleep(350);
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(OUT, Buffer.from(shot.data, 'base64'));
    console.log('写出', OUT, (fs.statSync(OUT).size / 1024).toFixed(0) + 'KB');
  } catch (err) {
    console.error('ERR', err.message);
    process.exitCode = 1;
  } finally {
    try { ws && ws.close(); } catch (_) {}
    try { chrome.kill(); } catch (_) {}
    setTimeout(() => process.exit(process.exitCode || 0), 400);
  }
})();
