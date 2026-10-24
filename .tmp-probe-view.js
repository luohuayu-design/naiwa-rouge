// 临时探针：量出屏幕四向各自能看到多少格（判定「视线范围内」到底该多近）
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9392;
const UD = path.join(os.tmpdir(), 'naiwa-probe-view-' + process.pid);
const URL = 'http://127.0.0.1:8124/index.html?debug=1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  fs.rmSync(UD, { recursive: true, force: true });
  const chrome = spawn(CHROME, [
    '--headless=new', '--remote-debugging-port=' + PORT, '--num-raster-threads=2',
    '--enable-unsafe-swiftshader', '--no-first-run', '--no-default-browser-check',
    '--disable-dev-shm-usage', '--user-data-dir=' + UD, '--window-size=420,900', 'about:blank',
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
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws fail')); });
    let id = 0;
    const pending = new Map();
    ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
    const send = (method, params) => new Promise((res, rej) => {
      const mid = ++id;
      pending.set(mid, (m) => (m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result)));
      ws.send(JSON.stringify({ id: mid, method, params }));
    });
    const ev = async (expr) => {
      const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error('JS: ' + (r.exceptionDetails.exception?.description || '').split('\n')[0]);
      return r.result.value;
    };
    const waitFor = async (expr, ms = 90000) => {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) { try { if (await ev(expr)) return true; } catch (_) {} await sleep(200); }
      throw new Error('超时: ' + expr);
    };
    await send('Runtime.enable');
    await send('Page.enable');
    await send('Page.navigate', { url: URL });
    await waitFor('!!window.__game');
    await sleep(1600);
    await ev(`['noticeOv','promoOv','signOv','packGet','tutCard','hintCard'].forEach((id) => {
      const el = document.getElementById(id); if (el) { el.classList.remove('on'); el.setAttribute('aria-hidden','true'); }
    }); 1`);
    await waitFor("__game.state === 'playing'");
    await sleep(800);

    const out = await ev(`(() => {
      const cam = __game.camera; cam.updateMatrixWorld(true);
      const p = __game.pos;
      const e1 = cam.matrixWorldInverse.elements, e2 = cam.projectionMatrix.elements;
      const ndc = (x, y, z) => {
        const vx = e1[0]*x + e1[4]*y + e1[8]*z + e1[12];
        const vy = e1[1]*x + e1[5]*y + e1[9]*z + e1[13];
        const vz = e1[2]*x + e1[6]*y + e1[10]*z + e1[14];
        const vw = e1[3]*x + e1[7]*y + e1[11]*z + e1[15];
        const cx = e2[0]*vx + e2[4]*vy + e2[8]*vz + e2[12]*vw;
        const cy = e2[1]*vx + e2[5]*vy + e2[9]*vz + e2[13]*vw;
        const cw = e2[3]*vx + e2[7]*vy + e2[11]*vz + e2[15]*vw;
        return [cx / cw, cy / cw];
      };
      const dirs = { 右: [1,0], 左: [-1,0], 下: [0,1], 上: [0,-1], 斜右下: [0.707,0.707], 斜右上: [0.707,-0.707] };
      const res = { innerW: innerWidth, innerH: innerHeight, fov: +cam.fov.toFixed(1) };
      for (const k in dirs) {
        const [dx, dz] = dirs[k];
        let last = 0;
        for (let d = 0.5; d <= 22; d += 0.5) {
          const [nx, ny] = ndc(p.x + dx*d, 0, p.z + dz*d);
          if (Math.abs(nx) > 0.95 || Math.abs(ny) > 0.95) break;
          last = d;
        }
        res[k] = last;
      }
      return JSON.stringify(res);
    })()`);
    console.log('视野实测：', out);
    // 玩家靠死区偏移时再看一次（相机焦点不总在玩家身上）
    await ev('__game.input && 0, 1');
  } catch (e) {
    console.error('探针失败：' + e.message);
  } finally {
    try { if (ws) ws.close(); } catch (_) {}
    try { chrome.kill(); } catch (_) {}
    await sleep(200);
    process.exit();
  }
})();
