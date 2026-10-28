// 探针 4：切关后主循环还在不在？雷为什么不炸？誊录员为什么不画？
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9401;
const UD = path.join(os.tmpdir(), 'naiwa-probe-114d');
const URL = 'http://127.0.0.1:8124/index.html?debug=1&title';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  fs.rmSync(UD, { recursive: true, force: true });
  const chrome = spawn(CHROME, [
    '--headless=new', '--remote-debugging-port=' + PORT, '--num-raster-threads=2',
    '--no-proxy-server', '--enable-unsafe-swiftshader', '--no-first-run',
    '--no-default-browser-check', '--disable-dev-shm-usage',
    '--user-data-dir=' + UD, '--window-size=420,900', 'about:blank',
  ], { stdio: 'ignore' });
  let ws = null;
  const errs = [];
  try {
    for (let i = 0; i < 60; i++) {
      try { await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); break; }
      catch (_) { await sleep(500); }
    }
    const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent('about:blank')}`, { method: 'PUT' })).json();
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    let id = 0; const pending = new Map();
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.method === 'Runtime.exceptionThrown') errs.push((m.params.exceptionDetails?.exception?.description || '').split('\n')[0]);
      if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errs.push((m.params.args || []).map((a) => a.value || a.description || '').join(' '));
      if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    };
    const send = (method, params) => new Promise((res, rej) => {
      const mid = ++id;
      pending.set(mid, (m) => m.error ? rej(new Error(m.error.message)) : res(m.result));
      ws.send(JSON.stringify({ id: mid, method, params }));
    });
    const ev = async (expr) => {
      const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error('JS: ' + (r.exceptionDetails.exception?.description || '').split('\n')[0]);
      return r.result.value;
    };
    const waitFor = async (expr, ms = 40000, label = expr) => {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) {
        try { if (await ev(expr)) return true; } catch (_) {}
        await sleep(150);
      }
      throw new Error('超时: ' + label);
    };
    const settle = async (max = 60) => {
      for (let i = 0; i < max; i++) {
        const st = await ev('__game.state');
        if (st === 'playing') return true;
        if (st === 'hint') await ev('document.getElementById("hiOk").click()');
        else if (st === 'wtut') await ev('document.getElementById("wtSkip").click()');
        else if (st === 'meet') await ev('document.getElementById("mtOk").click()');
        else if (st === 'weapon') await ev('document.getElementById("wcOk").click()');
        else if (st === 'tutorial') await ev('__game.tutorial.skip()');
        else break;
        await sleep(160);
      }
      return false;
    };

    await send('Runtime.enable');
    await send('Page.enable');
    await send('Page.navigate', { url: URL });
    await waitFor('!!window.__game', 90000, '__game');
    await waitFor("document.getElementById('titleScr') && !document.getElementById('titleScr').classList.contains('off')", 15000, '标题');
    await sleep(1400);
    await ev('if (__game.notice.open()) __game.notice.hide(); 1');
    await sleep(400);
    await ev('if (__game.sign.open()) __game.sign.hide(); 1');
    await sleep(400);
    await ev('if (__game.promo.open()) __game.promo.hide(); 1');
    await sleep(300);
    await ev('__game.setPendingLevel(11)');
    await ev('(async () => { await __game.beginGame({ tutorial: false }); return 1; })()');
    await sleep(1600);
    await settle();
    await ev('__game.setWaves(true)');
    await sleep(300);

    const tick = async (tag) => {
      const a = await ev('__game.rootT()');
      await sleep(700);
      const b = await ev('__game.rootT()');
      console.log(`${tag} rootT ${a} → ${b}  ${b > a ? '（在跑）' : '（!! 停了）'}`);
    };

    await tick('开局');
    // 复现 A 段结尾：切关来回
    await ev('__game.setLevel(10)');
    await sleep(400);
    await tick('setLevel(10) 后');
    await ev('__game.setLevel(11)');
    await ev('__game.warp(0, 0)');
    await sleep(400);
    await tick('setLevel(11) 后');
    console.log('state=', await ev('__game.state'), 'levelId=', await ev('__game.levelId'), 'roundNo=', await ev('__game.level.roundNo'));

    // B：买墨丸放雷
    console.log('grantMine →', await ev('__game.block114.grantMine(1)'));
    await sleep(500);
    console.log('pressSkill →', await ev("__game.pressSkill('mine')"));
    await sleep(300);
    const ml = await ev('__game.block114.mines.list()');
    console.log('雷:', JSON.stringify(ml), 'pos=', JSON.stringify(await ev('__game.pos()')));
    console.log('mines 调试口:', JSON.stringify(await ev('Object.keys(__game.block114.mines)')));
    if (ml && ml.length) {
      await ev(`__game.block63.enemies.spawn('warrior', ${ml[0].x + 1.2}, ${ml[0].z})`);
      await ev(`(() => { const w = __game.block63.enemies.live('warrior'); if (w) { w.hp = w.maxHp = 999; w.state = 'chase'; } })()`);
      for (let i = 0; i < 10; i++) {
        await sleep(600);
        const s = await ev(`(() => { const w = __game.block63.enemies.live('warrior');
          return { t: ${i + 1}, w: w ? { x: +w.pos.x.toFixed(2), z: +w.pos.z.toFixed(2), hp: w.hp, st: w.state } : null,
            left: __game.block114.mines.count(), blasts: __game.block114.mines.blastCount && __game.block114.mines.blastCount(),
            map: __game.block114.mines.list().map((m) => [m.x, m.z]) }; })()`);
        console.log('  B', JSON.stringify(s));
        if (s.left === 0) break;
      }
    }
    await ev('__game.block63.enemies.kill()');

    // C：誊录员
    await ev('__game.warp(0, 6)');
    await sleep(300);
    console.log('spawn clerk →', await ev("__game.block63.enemies.spawn('clerk', 0, -2)"));
    await ev(`(() => { const c = __game.block63.enemies.live('clerk'); if (c) { c.hp = c.maxHp = 999; c.state = 'chase'; } })()`);
    for (let i = 0; i < 12; i++) {
      await sleep(1000);
      const s = await ev(`(() => { const c = __game.block63.enemies.live('clerk');
        return { t: ${i + 1}, st: __game.state,
          c: c ? { x: +c.pos.x.toFixed(2), z: +c.pos.z.toFixed(2), st: c.state, hp: c.hp, cd: +(c.cd || 0).toFixed(2), cast: !!c.inkCast } : null,
          pos: __game.pos(), inks: __game.enemies.inkCount(), casts: __game.enemies.inkCasts().length }; })()`);
      console.log('  C', JSON.stringify(s));
      if (s.inks > 0) break;
    }
    console.log('errors:', errs.slice(0, 4));
  } catch (e) {
    console.log('FATAL', e.message);
  } finally {
    try { ws && ws.close(); } catch (_) {}
    try { chrome.kill(); } catch (_) {}
  }
})();
