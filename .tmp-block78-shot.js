// 临时截图：设置页新增「存档备份」区的实际排版（430×900，贴近手机竖屏）
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9491;
const UD = path.join(os.tmpdir(), 'naiwa-shot78-' + process.pid);
const OUT = path.join(os.tmpdir(), 'naiwa-shot78');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT,
    '--num-raster-threads=2', '--enable-unsafe-swiftshader', '--no-first-run',
    '--no-default-browser-check', '--disable-dev-shm-usage', '--user-data-dir=' + UD,
    '--window-size=430,900', 'about:blank'], { stdio: 'ignore' });
  let ws;
  try {
    let list = null;
    for (let i = 0; i < 60; i++) {
      try { list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); break; }
      catch (_) { await sleep(500); }
    }
    const t = await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent('about:blank')}`, { method: 'PUT' })).json();
    ws = new WebSocket(t.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    let id = 0; const pend = new Map();
    ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
    const send = (method, params) => new Promise((res, rej) => { const mid = ++id;
      pend.set(mid, (m) => (m.error ? rej(new Error(m.error.message)) : res(m.result)));
      ws.send(JSON.stringify({ id: mid, method, params })); });
    const ev = async (ex) => { const r = await send('Runtime.evaluate', { expression: ex, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) {
        const d = r.exceptionDetails;
        throw new Error('js: ' + ((d.exception && d.exception.description) || d.text || '') .split(String.fromCharCode(10))[0] + ' << ' + ex.slice(0, 80));
      }
      return r.result.value; };
    const waitFor = async (ex, ms) => { const t0 = Date.now();
      while (Date.now() - t0 < ms) { try { if (await ev(ex)) return true; } catch (_) {} await sleep(150); } return false; };

    const shot = async (name) => {
      const r = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(OUT, name), Buffer.from(r.data, 'base64'));
    };

    await send('Page.enable', {}); await send('Runtime.enable', {});
    await send('Emulation.setDeviceMetricsOverride', { width: 430, height: 900, deviceScaleFactor: 2, mobile: true });
    await send('Page.navigate', { url: 'http://127.0.0.1:8124/index.html?debug=1&title' });
    await waitFor('!!window.__game', 90000);
    await sleep(700);
    // 公告 → 签到 → 宣传有礼 是延时链（每段隔 350ms 起动画），多点几轮
    for (let round = 0; round < 4; round++) {
      for (const idName of ['noticeX', 'signX', 'promoX']) {
        await ev(`(() => { const b = document.getElementById('${idName}');
          if (b) { const r = b.getBoundingClientRect(); if (r.width > 0) b.click(); } return 1; })()`);
      }
      await sleep(900);
    }

    await ev('__game.ui.showSettings()');
    await sleep(500);
    await shot('set-top.png');

    // 卡片是否被撑出视口 / 能不能滚
    const info = await ev(`(() => {
      const card = document.querySelector('#setScr .lv-card');
      const r = card.getBoundingClientRect();
      const io = document.querySelector('.set-io').getBoundingClientRect();
      const foot = document.querySelector('.set-foot').getBoundingClientRect();
      return JSON.stringify({
        vh: innerHeight, cardTop: Math.round(r.top), cardBottom: Math.round(r.bottom),
        cardH: Math.round(r.height), scrollH: card.scrollHeight, clientH: card.clientHeight,
        ioTop: Math.round(io.top), ioH: Math.round(io.height),
        footBottom: Math.round(foot.bottom),
        cardOverflow: getComputedStyle(card).overflowY,
      });
    })()`);
    console.log('布局：', info);
    // 滚到底再看一眼
    await ev(`(() => { const c = document.querySelector('#setScr .lv-card'); c.scrollTop = c.scrollHeight; return 1; })()`);
    await sleep(300);
    await shot('set-bottom.png');

    // 粘贴存档码弹窗（多行输入框的样式这轮新调过）
    await ev('document.getElementById("setScr").scrollTop = 0');
    await ev('document.getElementById("ioImportCode").click()');
    await sleep(400);
    // 故意给一段解不出来的码，顺便截报错态
    const SAMPLE = 'NWSAVE1:eyJhcHAiOiJuYWl3YS1yb3VnZSIsImtpbmQiOiJzYXZlIiwidmVyIjoxfQ==';
    await ev(`document.getElementById('saveCodeInput').value = ${JSON.stringify(SAMPLE)}`);
    await sleep(200);
    await shot('code-ask.png');
    // 报错态
    await ev('document.getElementById("saveCodeYes").click()');
    await sleep(400);
    await shot('code-err.png');
    console.log('截图目录：' + OUT);
  } catch (e) {
    console.error('FAIL', e.message);
  } finally {
    try { ws && ws.close(); } catch (_) {}
    try { chrome.kill(); } catch (_) {}
    setTimeout(() => process.exit(0), 300);
  }
})();
