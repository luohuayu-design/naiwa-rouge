// 探针 3：C/D 段为什么「墨痕不掉血 / 收账人不读条」
// 事实清单：state / 无敌帧 / 遗物 / 雾 / hurt 直调 / 收账人位置与状态
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9399;
const UD = path.join(os.tmpdir(), 'naiwa-probe-114c');
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
  try {
    for (let i = 0; i < 60; i++) {
      try { await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); break; }
      catch (_) { await sleep(500); }
    }
    const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent('about:blank')}`, { method: 'PUT' })).json();
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    let id = 0; const pending = new Map();
    ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
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

    const base = await ev(`(() => ({
      state: __game.state, admin: __game.adminOn,
      hp: __game.stats.hp.cur, max: __game.stats.hp.max,
      relics: __game.relics.levels(),
      mods: __game.stats.dumpMods().length,
    }))()`);
    console.log('基线', JSON.stringify(base));

    // ① hurt 直调（1 点）
    const h0 = await ev('__game.stats.hp.cur');
    await ev('__game.hurt(1)');
    await sleep(400);
    const h1 = await ev('__game.stats.hp.cur');
    console.log('① hurt(1):', h0, '→', h1, h1 < h0 - 0.01 ? '（能掉血）' : '（掉不了！）');

    // ② 造墨痕
    await ev('__game.warp(0, 6)');
    await sleep(300);
    await ev("__game.block63.enemies.spawn('clerk', 0, -2)");
    await ev(`(() => { const c = __game.block63.enemies.live('clerk'); if (c) { c.hp = c.maxHp = 999; c.state = 'chase'; } })()`);
    const t0 = Date.now();
    let inkOk = false;
    while (Date.now() - t0 < 40000) {
      if (await ev('__game.enemies.inkCount() > 0')) { inkOk = true; break; }
      await sleep(200);
    }
    console.log('② 墨痕落地:', inkOk, '耗时', ((Date.now() - t0) / 1000).toFixed(1) + 's');

    if (inkOk) {
      const info = await ev(`(() => { const k = __game.enemies.inks()[0];
        return { x: k.x, z: k.z, dx: k.dx, dz: k.dz, len: k.len, half: k.half, t: k.t, tick: k.tick,
          mx: k.x + k.dx * k.len / 2, mz: k.z + k.dz * k.len / 2 }; })()`);
      console.log('   墨痕', JSON.stringify(info));
      await ev(`__game.warp(${info.mx}, ${info.mz})`);
      await sleep(300);
      const now = await ev(`(() => ({
        state: __game.state, admin: __game.adminOn,
        pos: __game.pos(), hp: __game.stats.hp.cur,
        dist: __game.enemies.inkHit(${info.mx}, ${info.mz}),
        move: __game.curse().move,
        tick: (__game.enemies.inks()[0] || {}).tick,
        t: (__game.enemies.inks()[0] || {}).t,
      }))()`);
      console.log('   站上去之后', JSON.stringify(now));
      // 再等 2 秒看 tick 和 hp
      await sleep(2000);
      const after = await ev(`(() => ({
        state: __game.state, hp: __game.stats.hp.cur, move: __game.curse().move,
        tick: (__game.enemies.inks()[0] || {}).tick, t: (__game.enemies.inks()[0] || {}).t,
        pos: __game.pos(),
      }))()`);
      console.log('   2 秒后', JSON.stringify(after));
      // 卡在原点？直接看 playerPos 与视觉 pos 是否一致
      const pp = await ev('__game.pos()');
      console.log('   inkHit 用的是传参，真实 ctx.playerPos =', JSON.stringify(pp));
      await ev('__game.block63.enemies.kill()');
      await sleep(300);
    }

    // ③ 收账人
    await ev('__game.warp(0, 0)');
    await ev('__game.block63.enemies.kill()');
    await sleep(300);
    await ev("__game.block63.enemies.spawn('collector', 3.0, 0)");
    await ev(`(() => { const c = __game.block63.enemies.live('collector'); if (c) { c.hp = c.maxHp = 999; c.state = 'chase'; } })()`);
    for (let i = 0; i < 8; i++) {
      await sleep(1000);
      const s = await ev(`(() => { const c = __game.block63.enemies.live('collector');
        const cas = __game.enemies.collectCast();
        return { t: ${i + 1}, state: __game.state, pos: __game.pos(), hp: __game.stats.hp.cur,
          col: c ? { x: +c.pos.x.toFixed(2), z: +c.pos.z.toFixed(2), st: c.state, hp: c.hp } : null,
          cast: cas ? +cas.progress.toFixed(2) : null }; })()`);
      console.log('③', JSON.stringify(s));
    }
  } catch (e) {
    console.log('FATAL', e.message);
  } finally {
    try { ws && ws.close(); } catch (_) {}
    try { chrome.kill(); } catch (_) {}
  }
})();
