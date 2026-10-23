// 极短 smoke：只确认页面初始化无报错、__game 能就绪（不测功能）
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const PORT = 9371;
const UD = path.join(os.tmpdir(), 'naiwa-smoke-59-live');
const URL = 'https://luohuayu-design.github.io/naiwa-rouge/index.html?debug=1&title';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  require('fs').rmSync(UD, { recursive: true, force: true });
  const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
    '--headless=new', '--remote-debugging-port=' + PORT, '--num-raster-threads=2',
    '--enable-unsafe-swiftshader', '--no-first-run', '--no-default-browser-check',
    '--disable-dev-shm-usage', '--user-data-dir=' + UD, '--window-size=420,900', 'about:blank',
  ], { stdio: 'ignore' });
  const errs = [];
  let ws = null;
  try {
    let list = null;
    for (let i = 0; i < 60; i++) { try { list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); break; } catch (_) { await sleep(500); } }
    const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent('about:blank')}`, { method: 'PUT' })).json();
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws fail')); });
    let id = 0; const pending = new Map();
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errs.push((m.params.args || []).map((a) => a.value || a.description || '').join(' '));
      if (m.method === 'Runtime.exceptionThrown') errs.push((m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text || '').split('\n')[0]);
      if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    };
    const send = (method, params) => { const mid = ++id; return new Promise((res, rej) => { pending.set(mid, (m) => (m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result))); ws.send(JSON.stringify({ id: mid, method, params })); }); };
    const ev = async (ex) => { const r = await send('Runtime.evaluate', { expression: ex, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error('JS: ' + (r.exceptionDetails.exception?.description || '').split('\n')[0]); return r.result.value; };
    await send('Runtime.enable');
    await send('Page.enable');
    await send('Page.navigate', { url: URL });
    let ready = false;
    for (let i = 0; i < 80; i++) { try { if (await ev('!!window.__game')) { ready = true; break; } } catch (_) {} await sleep(500); }
    const hasShop = ready ? await ev("!!document.getElementById('btnShop') && !!document.getElementById('msScr') && !!document.getElementById('boxReveal')") : false;
    const metaApi = ready ? await ev("!!(window.__game && window.__game.meta && window.__game.meta.buy)") : false;
    console.log('__game ready:', ready);
    console.log('shop DOM + meta API present:', hasShop, metaApi);
    console.log('JS errors (' + errs.length + '):', errs.slice(0, 5).join(' | '));
  } catch (e) { console.log('SMOKE ERROR:', e.message); }
  finally { if (ws) ws.close(); chrome.kill(); }
  process.exit(0);
})();
