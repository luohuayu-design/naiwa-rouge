// 第 88 块 · 截图：基础上限 10 的 HUD + 叠了几张上限后的血条
// 跑法：`python -m http.server 8124` 已起 → `node .tmp-85-shot.js`
// 图存到系统临时目录（路径不能含中文）
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9389;
const UD = path.join(os.tmpdir(), 'naiwa-cdp-88shot');
const OUT = path.join(os.tmpdir(), 'naiwa-88-hp.png');
const URL = 'http://127.0.0.1:8124/index.html?debug=1&title&keepsave=1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  fs.rmSync(UD, { recursive: true, force: true });
  const chrome = spawn(CHROME, [
    '--headless=new', '--remote-debugging-port=' + PORT, '--num-raster-threads=2',
    '--enable-unsafe-swiftshader', '--no-first-run', '--no-default-browser-check',
    '--disable-dev-shm-usage', '--disable-background-timer-throttling',
    '--window-size=430,932',
    '--user-data-dir=' + UD, 'about:blank',
  ], { stdio: 'ignore' });

  let ws = null;
  try {
    let list = null;
    for (let i = 0; i < 60; i++) {
      try { list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); break; }
      catch (_) { await sleep(500); }
    }
    const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent('about:blank')}`, { method: 'PUT' })).json();
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

    let id = 0;
    const pending = new Map();
    ws.onmessage = (m) => {
      const d = JSON.parse(m.data);
      if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
    };
    const send = (method, params = {}) => new Promise((res) => {
      const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params }));
    });
    await send('Runtime.enable');
    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 430, height: 932, deviceScaleFactor: 2, mobile: true });

    async function ev(expr) {
      const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
      return r.result?.result?.value;
    }
    async function waitFor(expr, ms, why) {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) {
        try { if (await ev(expr)) return true; } catch (_) {}
        await sleep(150);
      }
      throw new Error('等超时：' + why);
    }

    await send('Page.navigate', { url: URL });
    await waitFor('!!window.__game', 90000, '等 __game');
    await sleep(700);

    await ev('__game.beginGame({tutorial:false})');
    await sleep(900);
    // 关掉公告 / 宣传卡，别挡住画面
    await ev('(() => { const a = document.getElementById("noticeOk"); if (a) a.click(); const b = document.getElementById("promoOk"); if (b) b.click(); return true; })()');
    await sleep(400);
    await ev('__game.setLevel(1)');
    await sleep(800);
    for (let i = 0; i < 30; i++) {
      const st = await ev('__game.state');
      if (st === 'playing') break;
      if (st === 'wtut') await ev('document.getElementById("wtSkip").click()');
      else if (st === 'hint') await ev('document.getElementById("hiOk").click()');
      else if (st === 'meet') await ev('document.getElementById("mtOk").click()');
      await sleep(250);
    }
    await ev('__game.heal.fill()');
    await ev('__game.weapon.grant()');
    await ev('__game.warp(0, 2)');
    await sleep(300);

    // 开局就是 10 / 10；再叠两张「生命上限 +4」，看血条和数字都还正常
    console.log('开局：', JSON.stringify(await ev('__game.heal.hp()')));
    await ev('__game.evt({ hp: 4 }); __game.evt({ hp: 4 })');
    await ev('__game.heal.fill()');
    await sleep(500);
    console.log('叠完：', JSON.stringify(await ev('__game.heal.hp()')));

    const shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(OUT, Buffer.from(shot.result.data, 'base64'));
    console.log('已保存：' + OUT);
  } catch (e) {
    console.log('异常：' + e.message);
  } finally {
    try { if (ws) ws.close(); } catch (_) {}
    try { chrome.kill(); } catch (_) {}
  }
})();
