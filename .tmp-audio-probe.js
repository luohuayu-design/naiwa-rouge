// 第 59 块：局内截图 —— 盾斧兽人 / 孢生菇 放大后的观感（和战士并排比）
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');
const PORT = 9374;
const UD = path.join(os.tmpdir(), 'naiwa-audio-probe');
const OUT = path.join(os.tmpdir(), 'naiwa-audioprobe');
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
    const out = await ev(`(async () => {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const grab = async (url, off, dur) => {
        const ab = await (await fetch(url)).arrayBuffer();
        const buf = await ctx.decodeAudioData(ab);
        const ch = buf.getChannelData(0);
        const s = Math.floor((off || 0) * buf.sampleRate);
        const e = dur ? Math.min(ch.length, s + Math.floor(dur * buf.sampleRate)) : ch.length;
        let sum = 0, peak = 0;
        for (let i = s; i < e; i++) { const v = ch[i]; sum += v * v; if (Math.abs(v) > peak) peak = Math.abs(v); }
        return { rms: Math.sqrt(sum / Math.max(1, e - s)), peak: +peak.toFixed(3) };
      };
      const V = 'assets/audio/voice/', S = 'assets/audio/sfx/';
      const res = {};
      res['voice-1@0.334'] = await grab(V + 'voice-1.mp3', 0.334, 0.9);
      res['voice-2@0.177'] = await grab(V + 'voice-2.mp3', 0.177, 0.85);
      res['voice-3@0.745'] = await grab(V + 'voice-3.mp3', 0.745, 0.45);
      res['voice-end@0'] = await grab(V + 'voice-end.mp3', 0, 3.4);
      res['hit'] = await grab(S + 'hit.mp3');
      res['crit'] = await grab(S + 'crit.mp3');
      res['hurt'] = await grab(S + 'hurt.mp3');
      res['swordHit'] = await grab(S + 'swordHit.mp3');
      return JSON.stringify(res, null, 1);
    })()`);
    console.log(out);
  } catch (e) {
    console.error('FAIL', e.message);
    process.exitCode = 1;
  } finally {
    try { ws && ws.close(); } catch (_) {}
    try { chrome.kill(); } catch (_) {}
  }
})();
