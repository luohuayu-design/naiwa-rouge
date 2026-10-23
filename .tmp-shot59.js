// 第 59 块：局内截图 —— 盾斧兽人 / 孢生菇 放大后的观感（和战士并排比）
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');
const PORT = 9374;
const UD = path.join(os.tmpdir(), 'naiwa-shot-59');
const OUT = path.join(os.tmpdir(), 'naiwa-block59');
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
    await ev("document.getElementById('btnStart').click(), 1");
    await sleep(400);
    await ev("document.querySelector('.lv-item[data-level=\"1\"]').click(), 1");
    await sleep(400);
    await ev("document.getElementById('diffNext')?.click(), 1");
    await sleep(400);
    await ev("document.getElementById('curseStart')?.click(), 1");
    await sleep(600);
    if (await ev("document.getElementById('tutAsk')?.classList.contains('on')")) await ev("document.getElementById('tutNo').click(), 1");
    await waitFor("__game.getState() === 'playing'", 20000);
    await sleep(1000);
    // 清掉自然生成的怪，摆一排对比：普通战士 / 盾斧兽人 / 孢生菇
    await ev(`(() => {
      __game.enemies.all().forEach((e) => __game.enemies.takeDamage(e, 99999));
      const S = {};
      const put = (t, x, z) => { const e = __game.enemies.spawn(t, { x, z }, S); if (e) { e.hp = 999; e.maxHp = 999; if (e.state === 'spawn') e.state = 'chase'; } };
      put('warrior', -2.4, -2.0);
      put('shielder', 0.4, -3.2);
      put('brood', 3.0, -2.0);
      return 1;
    })()`);
    await sleep(2500);
    await shot('mobs_scale.png');
    // 玩家走到正面看（相机是俯视 45°，把怪摆在玩家前方）
    await ev('__game.render.live && 1');
    await sleep(800);
    await shot('mobs_scale2.png');
  } catch (e) { console.log('ERR', e.message); }
  finally { if (ws) ws.close(); chrome.kill(); }
  process.exit(0);
})();
