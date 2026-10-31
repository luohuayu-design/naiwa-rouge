// 第 128 块：第十五关浏览器运行时自检（headless Chrome + CDP）
// 跑法：先起 `python -m http.server 8124`（cwd = naiwa-rouge），再 `node .tmp-128-smoke.js`
// 查四件事：① 启动无缝（无 exception）；② setLevel(15) 后 spotlight 有灯；
//          ③ 环形灯 / 开播 / 禁言三个口能用；④ 截一张实机图到 %TEMP%。
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9373;
const PAGE = 'http://127.0.0.1:8124/?debug=1';
const UD = path.join(os.tmpdir(), 'naiwa-cdp-smoke128');
const OUT = path.join(os.tmpdir(), 'naiwa-smoke128');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  fs.rmSync(UD, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const chrome = spawn(CHROME, [
    '--headless=new', '--remote-debugging-port=' + PORT,
    '--enable-unsafe-swiftshader', '--no-first-run', '--no-default-browser-check',
    '--disable-dev-shm-usage', '--user-data-dir=' + UD, '--window-size=900,700', 'about:blank',
  ], { stdio: 'ignore' });
  let ws = null;
  const errors = [];
  try {
    for (let i = 0; i < 60; i++) {
      try { await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); break; }
      catch (_) { await sleep(500); }
    }
    const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(PAGE)}`, { method: 'PUT' })).json();
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    let id = 0;
    const pending = new Map();
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
      if (m.method === 'Runtime.exceptionThrown') {
        const d = m.params.exceptionDetails;
        errors.push('exception: ' + (d.exception && d.exception.description || d.text));
      }
      if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
        errors.push('console.error: ' + m.params.args.map((a) => a.value || a.description || '').join(' '));
      }
    };
    const send = (method, params) => new Promise((res, rej) => {
      const mid = ++id;
      pending.set(mid, (m) => m.error ? rej(new Error(m.error.message)) : res(m.result));
      ws.send(JSON.stringify({ id: mid, method, params }));
    });
    const ev = async (expr) => {
      const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text);
      return r.result.value;
    };
    await send('Runtime.enable');
    await send('Page.enable');

    const t0 = Date.now();
    while (Date.now() - t0 < 120000) {
      try { if (await ev('!!window.__game && __game.state === "playing"')) break; } catch (_) {}
      await sleep(200);
    }
    console.log('boot ✓', await ev('window.__game.state'));

    // ---- 切到第十五关（先补模型，再切关）----
    console.log('ensureLevelAssets(15) →', await ev('__game.ensureLevelAssets(15)'));
    console.log('setLevel(15) →', await ev('__game.setLevel(15)'));
    console.log('levelName:', await ev('__game.levelDef(15).name'));
    await sleep(1200);

    console.log('spotlight:', JSON.stringify(await ev('({ on: __game.block114.spotlight.on(), count: __game.block114.spotlight.state().count, spec: __game.block114.spotlight.state().spec || null, list: __game.block114.spotlight.list() })')));
    console.log('inLight(0,0):', await ev('__game.block114.spotlight.inLight(0,0)'));
    console.log('lightMul:', await ev('typeof __game.stats !== "undefined" ? 1 : 0'));

    // ---- 环形灯（第 17 件法器）----
    console.log('grantRinglight(2) →', await ev('__game.block114.grantRinglight(2)'));
    console.log('ringlight:', JSON.stringify(await ev('({ owned: __game.block114.ringlight.owned(), count: __game.block114.ringlight.count(), cdMax: __game.block114.ringlight.cdMax(), drop: __game.block114.ringlight.drop() })')));
    await sleep(600);
    console.log('ringlight.inLight(0,0):', await ev('__game.block114.ringlight.inLight(0,0)'));
    console.log('ring bonuses:', JSON.stringify(await ev('__game.block114.ringlight.bonuses()')));

    // ---- 开播 ----
    console.log('broadcast.cast:', await ev('__game.block114.broadcast.cast()'));
    console.log('broadcast:', JSON.stringify(await ev('({ active: __game.block114.broadcast.active(), remain: __game.block114.broadcast.remain(), cdMax: __game.block114.broadcast.cdMax(), bonuses: __game.block114.broadcast.bonuses() })')));

    // ---- 禁言 ----
    console.log('silenceNow(3):', await ev('__game.block114.silenceNow(3)'));
    console.log('silence:', await ev('__game.block114.silence()'));

    // ---- 造两只新怪：看模型是否加载、能不能站在场上 ----
    const spawned = await ev(`(() => {
      const d = __game.enemies.spawn('danmaku', { x: 6, z: 0 });
      const m = __game.enemies.spawn('moderator', { x: -6, z: 0 });
      return {
        danmaku: d ? { hp: d.maxHp, speed: +d.speed.toFixed(2), word: !!(d.cfg.projectile && d.cfg.projectile.word) } : null,
        moderator: m ? { hp: m.maxHp, mute: m.cfg.mute ? m.cfg.mute.duration : 0, interval: m.cfg.attackInterval } : null,
        loaded: __game.loadedTypes().join(','),
      };
    })()`);
    console.log('spawn:', JSON.stringify(spawned));
    console.log('round:', await ev('__game.level.roundNo'));

    // ---- 截图 ----
    await sleep(1500);
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    const file = path.join(OUT, 'level15.png');
    fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
    console.log('shot →', file);

    console.log(errors.length ? '!! 错误:\n' + errors.join('\n') : '✓ 无运行时错误');
  } catch (err) {
    console.error('ERR', err.message);
    process.exitCode = 1;
  } finally {
    try { ws && ws.close(); } catch (_) {}
    try { chrome.kill(); } catch (_) {}
    setTimeout(() => process.exit(process.exitCode || 0), 400);
  }
})();
