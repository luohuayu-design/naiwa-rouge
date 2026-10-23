// 第 59 块：局内截图 —— 盾斧兽人 / 孢生菇 放大后的观感（和战士并排比）
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');
const PORT = 9374;
const UD = path.join(os.tmpdir(), 'naiwa-shot-61');
const OUT = path.join(os.tmpdir(), 'naiwa-block61');
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
    // 造三份存档：分别 3 天前 / 26 小时前 / 5 分钟前
    await send('Page.addScriptToEvaluateOnNewDocument', { source: `
      try {
        if (!localStorage.getItem('naiwa_rouge_runs_v1_seeded')) {
          const now = Date.now();
          const mk = (uid, at, round) => ({ v: 1, uid: uid, at: at, round: round, rounds: 20, level: 1, diff: 'normal', coins: 12 });
          localStorage.setItem('naiwa_rouge_runs_v1', JSON.stringify([
            mk('a', now - 3 * 86400000, 4),
            mk('b', now - 26 * 3600000, 9),
            mk('c', now - 5 * 60000, 17)
          ]));
          localStorage.setItem('naiwa_rouge_runs_v1_seeded', '1');
        }
      } catch (_) {}` });
    await send('Page.navigate', { url: URL });
    await waitFor('!!window.__game', 90000);
    await sleep(1500);
    await sleep(2200);
    await ev("__game.notice.hide && __game.notice.hide(); 1");
    await sleep(500);
    if (await ev("__game.sign.open()")) await ev("document.getElementById('signClose').click(), 1");
    await sleep(600);
    await ev("__game.promo.hide && __game.promo.hide(); 1");
    await sleep(500);
    console.log('列表顺序 =', await ev("JSON.stringify([...document.querySelectorAll('#saveListBox .save-item')].map(e => e.querySelector('.save-round').textContent + ' | ' + e.querySelector('.save-time').textContent))"));
    await ev("document.getElementById('btnResume').click(), 1");
    await sleep(700);
    await shot('save_list.png');
  } catch (e) {
    console.error('FAIL', e.message);
    process.exitCode = 1;
  } finally {
    try { ws && ws.close(); } catch (_) {}
    try { chrome.kill(); } catch (_) {}
  }
})();
