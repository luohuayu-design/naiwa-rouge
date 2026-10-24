// 临时探针：查「进第五关卡住」到底卡在哪一步（不参与回归）
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9378;
const UD = path.join(os.tmpdir(), 'naiwa-probe63');
const URL = 'http://127.0.0.1:8124/index.html?debug=1&title';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  fs.rmSync(UD, { recursive: true, force: true });
  const chrome = spawn(CHROME, [
    '--headless=new', '--remote-debugging-port=' + PORT, '--num-raster-threads=2',
    '--enable-unsafe-swiftshader', '--no-first-run', '--no-default-browser-check',
    '--disable-dev-shm-usage', '--user-data-dir=' + UD, '--window-size=420,900', 'about:blank',
  ], { stdio: 'ignore' });
  const errs = [];
  let ws = null;
  try {
    let list = null;
    for (let i = 0; i < 60; i++) {
      try { list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); break; }
      catch (_) { await sleep(500); }
    }
    const t = await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent('about:blank')}`, { method: 'PUT' })).json();
    ws = new WebSocket(t.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    let id = 0; const pending = new Map();
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.method === 'Runtime.exceptionThrown') errs.push((m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text || '').split('\n').slice(0, 3).join(' | '));
      if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errs.push('console: ' + (m.params.args || []).map((a) => a.value || a.description).join(' '));
      if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    };
    const send = (method, params) => new Promise((res, rej) => {
      const mid = ++id; pending.set(mid, (m) => (m.error ? rej(new Error(m.error.message)) : res(m.result)));
      ws.send(JSON.stringify({ id: mid, method, params }));
    });
    const ev = async (expr) => {
      const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) return 'ERR: ' + (r.exceptionDetails.exception?.description || '').split('\n')[0];
      return r.result.value;
    };
    await send('Runtime.enable'); await send('Page.enable');
    await send('Page.navigate', { url: URL });
    for (let i = 0; i < 300; i++) { if (await ev('!!window.__game') === true) break; await sleep(200); }
    await sleep(800);
    await ev(`(() => {
      const rec = {};
      for (const id of [1,2,3,4,5]) rec[id] = { wins: 1, bestTime: 120, bestKills: 200, bestRound: 20 };
      localStorage.setItem('naiwa_rouge_records_v1', JSON.stringify(rec));
      const p = JSON.parse(localStorage.getItem('naiwa_rouge_profile_v1') || '{}');
      p.ringGot = true; p.heal = { unlocked: true };
      localStorage.setItem('naiwa_rouge_profile_v1', JSON.stringify(p));
      return 1;
    })()`);
    await send('Page.reload', { ignoreCache: true });
    for (let i = 0; i < 300; i++) { if (await ev('!!window.__game') === true) break; await sleep(200); }
    await sleep(1200);

    const dump = async (tag) => {
      const d = await ev(`JSON.stringify({
        state: __game.state, levelId: __game.levelId,
        open: ['noticeOv','promoOv','signOv','tutAsk','lvSel','diffScr','curseScr','upPanel','shop','mtOv','evOv','guideOv','packGet','dailyOv']
          .filter((id) => { const el = document.getElementById(id); return el && el.classList.contains('on'); }),
      })`);
      console.log(tag, d, errs.length ? 'ERR ' + errs.slice(-2).join(' /// ') : '');
    };
    await dump('boot:');
    await ev("document.getElementById('btnStart').click(), 1"); await sleep(500);
    await dump('after btnStart:');
    await ev("document.querySelector('.lv-item[data-level=\"5\"]').click(), 1"); await sleep(500);
    await dump('after pick lv5:');
    await ev("document.getElementById('diffNext')?.click(), 1"); await sleep(500);
    await dump('after diffNext:');
    await ev("document.getElementById('curseStart')?.click(), 1"); await sleep(800);
    await dump('after curseStart:');
    await sleep(3000);
    await dump('3s later:');
    await ev("document.getElementById('tutNo')?.click(), 1"); await sleep(1000);
    await dump('after tutNo:');
    await sleep(2000);
    await dump('2s later:');
  } catch (e) {
    console.error('probe err', e.message);
  } finally {
    try { ws && ws.close(); } catch (_) {}
    try { chrome.kill(); } catch (_) {}
  }
})();
