// 第 129 块本地实跑：起第十六关 → 线稿圈 / 囚笼 / 铅笔 / 描红 → 看 console 有没有报错
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9358;
const PAGE = 'http://127.0.0.1:8124/?debug=1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const ud = path.join(os.tmpdir(), 'naiwa-cdp-129smoke');
  fs.rmSync(ud, { recursive: true, force: true });
  const chrome = spawn(CHROME, [
    '--headless=new', '--remote-debugging-port=' + PORT, '--no-proxy-server',
    '--enable-unsafe-swiftshader', '--no-first-run', '--no-default-browser-check',
    '--disable-dev-shm-usage', '--user-data-dir=' + ud, '--window-size=900,700', 'about:blank',
  ], { stdio: 'ignore' });
  let ws = null;
  const errors = [];
  let fail = 0;
  const ok = (name, cond, extra = '') => {
    if (cond) console.log('  ok  ' + name + (extra ? `  [${extra}]` : ''));
    else { fail++; console.log('  XX  ' + name + (extra ? `  [${extra}]` : '')); }
  };
  try {
    for (let i = 0; i < 60; i++) {
      try { await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); break; }
      catch (_) { await sleep(500); }
    }
    const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(PAGE)}`, { method: 'PUT' })).json();
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    let id = 0; const pending = new Map();
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
      if (m.method === 'Runtime.exceptionThrown') {
        errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
      }
      if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
        errors.push(m.params.args.map((a) => a.value || a.description).join(' '));
      }
    };
    const send = (method, params) => new Promise((res, rej) => {
      const mid = ++id; pending.set(mid, (m) => m.error ? rej(new Error(m.error.message)) : res(m.result));
      ws.send(JSON.stringify({ id: mid, method, params }));
    });
    const ev = async (expr) => {
      const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error('JS 异常: ' + (r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text));
      return r.result.value;
    };
    await send('Runtime.enable');
    await send('Page.enable');
    const t0 = Date.now();
    while (Date.now() - t0 < 90000) {
      try { if (await ev('!!window.__game')) break; } catch (_) {}
      await sleep(200);
    }
    ok('页面加载出 __game', await ev('!!window.__game'));

    await ev('__game.setPendingLevel(16)');
    await ev('__game.beginGame({ tutorial: false })');
    await sleep(4000);

    ok('进了第十六关', await ev('__game.levelId') === 16, String(await ev('__game.levelId')));
    ok('状态是 playing', await ev('__game.state') === 'playing', String(await ev('__game.state')));
    ok('线稿圈系统开着', await ev('__game.block114.sketch.on()') === true);
    ok('线稿圈数量 ≥ 1', await ev('__game.block114.sketch.count()') >= 1, String(await ev('__game.block114.sketch.count()')));
    const st = await ev('JSON.stringify(__game.block114.sketch.state())');
    ok('线稿圈状态可读', typeof st === 'string' && st.length > 2, st.slice(0, 120));
    ok('可直接推成定稿', await ev('__game.block114.sketch.inkNow()') !== false);
    await sleep(1500);

    // 囚笼
    ok('扣一个囚笼', await ev('__game.block114.sketch.frame(0,0,1.8,3.2)') !== false);
    ok('帧数 1', await ev('__game.block114.sketch.frames()') === 1, String(await ev('__game.block114.sketch.frames()')));
    const c = await ev('JSON.stringify(__game.block114.sketch.clamp(3, 3))');
    ok('囚笼把点钳回去', /x/.test(c), c);
    ok('第二个框也扣得上', await ev('__game.block114.sketch.frame(0,0,1.8,3.2)') !== false);
    // 注：debug 的 frame() 直连 sketch.trapFrame，不走 combatCtx 的两个上限
    // （那条上限在契约测试里按源码断言）；这里只验清场。
    await ev('__game.block114.sketch.clearFrames()');
    ok('clearFrames 清场', await ev('__game.block114.sketch.frames()') === 0, String(await ev('__game.block114.sketch.frames()')));

    // 铅笔 + 描红
    ok('发一把铅笔', await ev('__game.block114.grantPencil(1)') >= 1);
    ok('铅笔 owned', await ev('__game.block114.pencil.owned()') === true);
    const b = await ev('JSON.stringify(__game.block114.pencil.bonuses())');
    ok('铅笔加成可读', typeof b === 'string' && b.length > 2, b);
    ok('手动划一条线', await ev('__game.block114.pencil.line(0,0,0)') !== false);
    ok('线在场上', await ev('__game.block114.pencil.list().lines.length') >= 1, String(await ev('__game.block114.pencil.list().lines.length')));
    ok('描红打出去', await ev('__game.block114.pencil.mark(0,0,0)') === true);
    // debugMark 会还原冷却（不污染真实技能），所以这里验扫痕，不验 cd
    ok('描红留下扫痕', await ev('__game.block114.pencil.list().bands.length') >= 1, String(await ev('__game.block114.pencil.list().bands.length')));
    await sleep(2500);

    ok('全程没有 console 报错', errors.length === 0, errors.slice(0, 3).join(' | '));
  } catch (err) {
    console.error('ERR', err.message);
    fail++;
  } finally {
    try { ws && ws.close(); } catch (_) {}
    try { chrome.kill(); } catch (_) {}
    console.log(fail ? `\n===== smoke FAIL ${fail} =====` : '\n===== smoke PASS =====');
    setTimeout(() => process.exit(fail ? 1 : 0), 300);
  }
})();
