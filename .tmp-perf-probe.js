// 性能探针：宣传有礼打开耗时 / 夜行记忆滚动帧率（第 59 块排查用）
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const PORT = 9377;
const UD = path.join(os.tmpdir(), 'naiwa-perf-59');
const URL = 'http://127.0.0.1:8124/index.html?debug=1&title';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  require('fs').rmSync(UD, { recursive: true, force: true });
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
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    };
    const send = (method, params) => { const mid = ++id; return new Promise((res, rej) => { pending.set(mid, (m) => (m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result))); ws.send(JSON.stringify({ id: mid, method, params })); }); };
    const ev = async (ex) => { const r = await send('Runtime.evaluate', { expression: ex, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error('JS: ' + (r.exceptionDetails.exception?.description || '').split('\n')[0]); return r.result.value; };
    await send('Runtime.enable');
    await send('Page.enable');
    await send('Performance.enable');
    await send('Page.navigate', { url: URL });
    for (let i = 0; i < 100; i++) { try { if (await ev('!!window.__game')) break; } catch (_) {} await sleep(500); }
    await sleep(2600);

    // ---- 1) 宣传有礼：打开到真正画出来的时间 ----
    await ev('__game.notice.hide(); __game.promo.hide(); true');
    await sleep(300);
    const promo = await ev(`(async () => {
      const t0 = performance.now();
      __game.promo.show(true, true);
      // 连续等 3 帧，量「第一帧真的画出来」用了多久
      const frame = () => new Promise(r => requestAnimationFrame(() => r(performance.now())));
      const f1 = await frame(); const f2 = await frame(); const f3 = await frame();
      return { open: +(f1 - t0).toFixed(1), f2: +(f2 - t0).toFixed(1), f3: +(f3 - t0).toFixed(1) };
    })()`);
    console.log('promo 首三帧耗时(ms):', JSON.stringify(promo));

    // 量 promo 打开后的布局/合成成本
    const m1 = await send('Performance.getMetrics');
    const pick = (arr, n) => (arr.find((x) => x.name === n) || {}).value;
    await sleep(2000);
    const m2 = await send('Performance.getMetrics');
    const diff = (n) => +( (pick(m2.metrics, n) || 0) - (pick(m1.metrics, n) || 0) ).toFixed(3);
    console.log('promo 静置2秒: Layout', diff('LayoutDuration'), 'RecalcStyle', diff('RecalcStyleDuration'), 'Task', diff('TaskDuration'), 'Script', diff('ScriptDuration'));
    const layers = await ev(`(() => {
      const el = document.getElementById('promoOv');
      const cs = getComputedStyle(el);
      return { backdrop: cs.backdropFilter || cs.webkitBackdropFilter, h: el.getBoundingClientRect().height, scrollH: el.scrollHeight, boxScroll: (()=>{const b=document.querySelector('.promo-box');return b?b.scrollHeight:0})() };
    })()`);
    console.log('promo 计算样式:', JSON.stringify(layers));
    await ev('__game.promo.hide(); true');
    await sleep(500);

    // ---- 2) 夜行记忆：打开一章 + 滚动帧率 ----
    const story = await ev(`(async () => {
      document.getElementById('btnStory').click();
      await new Promise(r => setTimeout(r, 400));
      const box = document.getElementById('srBody');
      const t0 = performance.now();
      document.querySelector('.st-item').click();
      const frame = () => new Promise(r => requestAnimationFrame(() => r(performance.now())));
      await frame(); await frame();
      const openMs = performance.now() - t0;
      // 逐帧滚到底，量每帧间隔
      const el = document.getElementById('srBody');
      const gaps = [];
      let last = performance.now();
      for (let i = 0; i < 40; i++) {
        el.scrollTop += 160;
        await new Promise(r => requestAnimationFrame(r));
        const now = performance.now();
        gaps.push(+(now - last).toFixed(1)); last = now;
      }
      const sr = document.getElementById('storyRead');
      const cs = getComputedStyle(sr);
      const sub = document.querySelector('.tt-sub-scr.on');
      return { openMs: +openMs.toFixed(1), gaps, scrollH: el.scrollHeight, clientH: el.clientHeight,
        srBg: cs.background.slice(0,40), subBackdrop: sub ? (getComputedStyle(sub).backdropFilter || getComputedStyle(sub).webkitBackdropFilter) : 'n/a',
        bodyLen: el.textContent.length, nodes: el.querySelectorAll('*').length };
    })()`);
    console.log('夜行记忆:', JSON.stringify(story));
  } catch (e) { console.log('PROBE ERROR:', e.message); }
  finally { if (ws) ws.close(); chrome.kill(); }
  process.exit(0);
})();
