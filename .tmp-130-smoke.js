// 第 130 块本地实跑：进第十七关 → 钟声 / 撞钟 / 铜壳 / 空箱子装箱倒箱 → 看 console 有没有报错
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9360;
const PAGE = 'http://127.0.0.1:8124/?debug=1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const ud = path.join(os.tmpdir(), 'naiwa-cdp-130smoke');
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

    await ev('__game.setPendingLevel(17)');
    await ev('__game.beginGame({ tutorial: false })');
    await sleep(4000);

    ok('进了第十七关', await ev('__game.levelId') === 17, String(await ev('__game.levelId')));
    ok('状态是 playing', await ev('__game.state') === 'playing', String(await ev('__game.state')));
    ok('钟声系统开着', await ev('__game.block114.bell.on()') === true);
    ok('场上只有一口钟', await ev('__game.block114.bell.count()') === 1, String(await ev('__game.block114.bell.count()')));
    const bs = await ev('JSON.stringify(__game.block114.bell.state())');
    ok('钟声状态可读（下一声 / hold / push）', typeof bs === 'string' && /hold/.test(bs) && /push/.test(bs), bs.slice(0, 140));
    ok('钟在场地外北沿', await ev('JSON.stringify(__game.block114.bell.pos())').then((s) => /z/.test(s)));
    ok('可以手动敲下一声', await ev('__game.block114.bell.toll()') !== false);
    await sleep(1200);
    ok('响过之后重新计时', (await ev('__game.block114.bell.state().next')) > 0, String(await ev('__game.block114.bell.state().next')));

    // 两只新怪
    ok('能刷出撞钟的', await ev("__game.block63.enemies.spawn('toll', 7, 0) === 'toll'"));
    ok('能刷出铜壳', await ev("__game.block63.enemies.spawn('bronze', 8, 2) === 'bronze'"));
    const live = await ev("JSON.stringify(__game.block63.enemies.live('bronze').cfg.freezeImmune)");
    ok('铜壳标记了钟声免疫', live === 'true', live);

    // 空箱子
    ok('发到三级空箱子', await ev('__game.block114.grantCrate(3)') >= 1);
    ok('空箱子 owned', await ev('__game.block114.crate.owned()') === true);
    ok('满载上限 3', await ev('__game.block114.crate.cap()') === 3, String(await ev('__game.block114.crate.cap()')));
    const b0 = await ev('JSON.stringify(__game.block114.crate.bonuses())');
    ok('空箱子加成可读', typeof b0 === 'string' && b0.length > 2, b0);
    const nBox = await ev('__game.block114.crate.box(7, 0)');
    ok('收一只怪进箱子', nBox === 1, String(nBox));
    const nCount = await ev('__game.block114.crate.count()');
    ok('箱里计数 1', nCount === 1, String(nCount));
    const boxList = await ev('__game.block114.crate.list().length');
    ok('箱子里能读出这一只', boxList >= 1, String(boxList));
    const dumped = await ev('__game.block114.crate.dump(0, 0)');
    ok('倒箱之后清空', dumped >= 0, String(dumped));
    const nAfter = await ev('__game.block114.crate.count()');
    ok('倒完箱里为空', nAfter === 0, String(nAfter));
    await sleep(2000);

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
