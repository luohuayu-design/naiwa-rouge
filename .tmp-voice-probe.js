// 奶蛙音效包素材探测：时长 / 采样率 / 峰值 / 首尾静音位置
// 跑法：先 `python -m http.server 8124`（cwd=naiwa-rouge），再 `node .tmp-voice-probe.js`
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9338;
const PAGE = 'http://127.0.0.1:8124/.tmp-view.html';
const UD = path.join(os.tmpdir(), 'naiwa-cdp-voiceprobe');
const FILES = ['voice-1.mp3', 'voice-2.mp3', 'voice-3.mp3', 'voice-end.mp3'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  fs.rmSync(UD, { recursive: true, force: true });
  const chrome = spawn(CHROME, [
    '--headless=new', '--remote-debugging-port=' + PORT, '--num-raster-threads=2',
    '--enable-unsafe-swiftshader', '--no-first-run', '--no-default-browser-check',
    '--disable-dev-shm-usage', '--user-data-dir=' + UD, 'about:blank',
  ], { stdio: 'ignore' });
  let ws = null;
  try {
    let list = null;
    for (let i = 0; i < 60; i++) {
      try { list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); break; }
      catch (_) { await sleep(400); }
    }
    const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(PAGE)}`, { method: 'PUT' })).json();
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    let id = 0;
    const pending = new Map();
    ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
    const send = (method, params) => new Promise((res, rej) => {
      const mid = ++id;
      pending.set(mid, (m) => m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result));
      ws.send(JSON.stringify({ id: mid, method, params }));
    });
    const ev = async (expr) => {
      const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error('JS 异常: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
      return r.result.value;
    };
    await send('Runtime.enable');
    for (let i = 0; i < 100; i++) { if (await ev("location.href.indexOf('naiwa-rouge') >= 0").catch(() => false)) break; await sleep(150); }

    const expr = `(async () => {
      const AC = window.AudioContext || window.webkitAudioContext;
      const ctx = new AC();
      const out = [];
      for (const f of ${JSON.stringify(FILES)}) {
        try {
          const ab = await (await fetch('assets/audio/voice/' + f)).arrayBuffer();
          const buf = await new Promise((res, rej) => ctx.decodeAudioData(ab, res, rej));
          const ch = buf.getChannelData(0);
          let peak = 0, sum = 0;
          for (let i = 0; i < ch.length; i++) { const v = Math.abs(ch[i]); if (v > peak) peak = v; sum += v * v; }
          const rms = Math.sqrt(sum / ch.length);
          const TH = 0.01;   // -40dBFS 以下当静音
          let first = 0, last = ch.length - 1;
          while (first < ch.length && Math.abs(ch[first]) < TH) first++;
          while (last > first && Math.abs(ch[last]) < TH) last--;
          out.push({
            file: f,
            sec: +buf.duration.toFixed(3),
            rate: buf.sampleRate,
            channels: buf.numberOfChannels,
            peak: +peak.toFixed(3),
            rms: +rms.toFixed(4),
            headSil: +(first / buf.sampleRate).toFixed(3),
            tailSil: +((ch.length - 1 - last) / buf.sampleRate).toFixed(3),
            voiceSec: +((last - first + 1) / buf.sampleRate).toFixed(3),
          });
        } catch (e) {
          out.push({ file: f, error: String(e) });
        }
      }
      ctx.close();
      return out;
    })()`;
    const res = await ev(expr);
    console.log(JSON.stringify(res, null, 2));
  } catch (e) {
    console.error('探测失败:', e.message);
    process.exitCode = 2;
  } finally {
    try { ws && ws.close(); } catch (_) {}
    try { chrome.kill('SIGKILL'); } catch (_) {}
    await sleep(500);
    try { fs.rmSync(UD, { recursive: true, force: true }); } catch (_) {}
  }
})();
