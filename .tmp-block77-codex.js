// 第 77 块：图鉴里两只新模型的样子（验 hover 抬高后不再半截埋地）
// 跑法：先起 8124，再 `node .tmp-block77-codex.js`
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9478;
const UD = path.join(os.tmpdir(), 'naiwa-cdp-77cx-' + process.pid);
const OUT = path.join(os.tmpdir(), 'naiwa-block77');
const URL = 'http://127.0.0.1:8124/index.html?debug=1&title';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  fs.rmSync(UD, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const chrome = spawn(CHROME, [
    '--headless=new', '--remote-debugging-port=' + PORT, '--num-raster-threads=2',
    '--enable-unsafe-swiftshader', '--no-first-run', '--no-default-browser-check',
    '--disable-dev-shm-usage', '--user-data-dir=' + UD, '--window-size=430,900', 'about:blank',
  ], { stdio: 'ignore' });
  let ws = null;
  try {
    for (let i = 0; i < 60; i++) {
      try { await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); break; }
      catch (_) { await sleep(500); }
    }
    const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent('about:blank')}`, { method: 'PUT' })).json();
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws 失败')); });
    let id = 0;
    const pending = new Map();
    ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
    const send = (method, params) => new Promise((res, rej) => {
      const mid = ++id;
      pending.set(mid, (m) => (m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result)));
      ws.send(JSON.stringify({ id: mid, method, params }));
    });
    const ev = async (ex) => {
      const r = await send('Runtime.evaluate', { expression: ex, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error('JS: ' + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || '').split('\n')[0]);
      return r.result.value;
    };
    const shot = async (n) => {
      const r = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(OUT, n), Buffer.from(r.data, 'base64'));
      console.log('shot', n);
    };
    await send('Runtime.enable');
    await send('Page.enable');
    await send('Page.navigate', { url: URL });
    const t0 = Date.now();
    while (Date.now() - t0 < 90000) { try { if (await ev('!!window.__game')) break; } catch (_) {} await sleep(200); }
    await sleep(900);

    for (let i = 0; i < 10; i++) {
      await ev(`(function(){
        try { const b = document.getElementById('noticeOk'); if (b && document.getElementById('noticeOv').classList.contains('on')) b.click(); } catch(_){}
        try { __game.promo && __game.promo.hide(); } catch(_){}
        try { __game.sign && __game.sign.hide(); } catch(_){}
        return 1;
      })()`);
      await sleep(150);
    }
    await ev('__game.codex.show()');
    await sleep(1200);
    // 切到怪物页签
    const tabs = await ev("JSON.stringify([...document.querySelectorAll('#cxTabs button, .cx-tab')].map(b => b.id + ':' + b.textContent.trim()))");
    console.log('图鉴页签:', tabs);
    await ev("(() => { const b = [...document.querySelectorAll('#cxTabs button, .cx-tab')].find(x => x.textContent.trim().startsWith('怪物')); if (b) b.click(); return b ? b.textContent.trim() : 'none'; })()");
    await sleep(900);
    await shot('codex-monsters.png');
    // 滚到第七关那两只
    await ev(`(() => {
      const cards = [...document.querySelectorAll('.cx-card')];
      const hit = cards.find(c => /井蛙|木鱼灵/.test(c.textContent));
      if (hit) hit.scrollIntoView({ block: 'center' });
      return cards.length;
    })()`);
    await sleep(900);
    await shot('codex-lvl7.png');
  } catch (err) {
    console.error('FAIL', err.message);
    process.exitCode = 1;
  } finally {
    try { ws && ws.close(); } catch (_) {}
    try { chrome.kill(); } catch (_) {}
    setTimeout(() => process.exit(process.exitCode || 0), 400);
  }
})();
