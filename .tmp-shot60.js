// 第 59 块：局内截图 —— 盾斧兽人 / 孢生菇 放大后的观感（和战士并排比）
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');
const PORT = 9374;
const UD = path.join(os.tmpdir(), 'naiwa-shot-60');
const OUT = path.join(os.tmpdir(), 'naiwa-block60');
const URL = 'http://127.0.0.1:8124/index.html?debug=1&title';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  fs.rmSync(UD, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
    '--headless=new', '--remote-debugging-port=' + PORT, '--num-raster-threads=2',
    '--enable-unsafe-swiftshader', '--no-first-run', '--no-default-browser-check',
    '--disable-dev-shm-usage', '--user-data-dir=' + UD, '--window-size=420,900', 'about:blank',
  ], { stdio: 'ignore' });
  let ws = null;
  try {
    let list = null;
    for (let i = 0; i < 60; i++) { try { list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); break; } catch (_) { await sleep(500); } }
    const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent('about:blank')}`, { method: 'PUT' })).json();
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws fail')); });
    let id = 0; const pending = new Map();
    ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
    const send = (method, params) => { const mid = ++id; return new Promise((res, rej) => { pending.set(mid, (m) => (m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result))); ws.send(JSON.stringify({ id: mid, method, params })); }); };
    const ev = async (ex) => { const r = await send('Runtime.evaluate', { expression: ex, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error('JS: ' + (r.exceptionDetails.exception?.description || '').split('\n')[0]); return r.result.value; };
    const waitFor = async (ex, ms = 60000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await ev(ex)) return true; } catch (_) {} await sleep(150); } throw new Error('timeout: ' + ex); };
    const shot = async (n) => { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(OUT, n), Buffer.from(r.data, 'base64')); console.log('shot', n); };
    await send('Runtime.enable'); await send('Page.enable');
    await send('Page.navigate', { url: URL });
    await waitFor('!!window.__game', 90000);
    await sleep(1200);
    // 让「公告 → 签到 → 宣传」这条链自己走完，再逐个收掉（别用 hide 触发链路）
    await sleep(2200);
    await ev("__game.notice.hide && __game.notice.hide(); 1");
    await sleep(700);
    if (await ev("__game.sign.open()")) await ev("document.getElementById('signClose').click(), 1");
    await sleep(700);
    await ev("__game.promo.hide && __game.promo.hide(); 1");
    await sleep(500);
    // 收掉浮层，停在主菜单
    await ev("__game.notice.hide && __game.notice.hide(); 1");
    await sleep(400);
    if (await ev("__game.sign.open()")) await ev("document.getElementById('signClose').click(), 1");
    await sleep(600);
    await ev("__game.promo.hide && __game.promo.hide(); 1");
    await sleep(600);

    // 把红点行放大截一张（未签到 = 有红点）
    await ev("window.__dotProbe = () => { const b = document.getElementById('btnSign'); b.scrollIntoView({block:'center'}); const r = b.getBoundingClientRect(); return JSON.stringify({x:r.x,y:r.y,w:r.width,h:r.height}); }, 1");
    console.log('未签 red dot =', await ev("JSON.stringify(__game.sign.btn())"));
    const r1 = JSON.parse(await ev('__dotProbe()'));
    let s1 = await send('Page.captureScreenshot', { format: 'png', clip: { x: Math.max(0, r1.x - 8), y: Math.max(0, r1.y - 8), width: Math.min(420, r1.w + 16), height: r1.h + 16, scale: 3 } });
    fs.writeFileSync(path.join(OUT, 'dot_before.png'), Buffer.from(s1.data, 'base64'));
    console.log('shot dot_before.png');
    await shot('menu_before.png');

    // 签一次
    await ev("document.getElementById('btnSign').click(), 1");
    await sleep(600);
    await ev("document.getElementById('signBtn').click(), 1");
    await sleep(900);
    console.log('已签 red dot =', await ev("JSON.stringify(__game.sign.btn())"));
    await shot('sign_after.png');
    await ev("document.getElementById('signClose').click(), 1");
    await sleep(900);
    const r2 = JSON.parse(await ev('__dotProbe()'));
    let s2 = await send('Page.captureScreenshot', { format: 'png', clip: { x: Math.max(0, r2.x - 8), y: Math.max(0, r2.y - 8), width: Math.min(420, r2.w + 16), height: r2.h + 16, scale: 3 } });
    fs.writeFileSync(path.join(OUT, 'dot_after.png'), Buffer.from(s2.data, 'base64'));
    console.log('shot dot_after.png');
    await shot('menu_after.png');
  } catch (e) {
    console.error('FAIL', e.message);
    process.exitCode = 1;
  } finally {
    try { ws && ws.close(); } catch (_) {}
    try { chrome.kill(); } catch (_) {}
  }
})();
