// 第 81 块截图：第八关「骨塔寄存层」—— 不追人的骷髅队列 + 场外寄存柜
// 跑法：先起 `python -m http.server 8124`，再 `node .tmp-block81-shot.js`
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9382;
const UD = path.join(os.tmpdir(), 'naiwa-cdp-81shot');
const OUT = path.join(__dirname, '.tmp-block81-squad.png');
const URL = 'http://127.0.0.1:8124/index.html?debug=1&title&keepsave=1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  fs.rmSync(UD, { recursive: true, force: true });
  const chrome = spawn(CHROME, [
    '--headless=new', '--remote-debugging-port=' + PORT, '--num-raster-threads=2',
    '--enable-unsafe-swiftshader', '--no-first-run', '--no-default-browser-check',
    '--disable-dev-shm-usage', '--disable-background-timer-throttling',
    '--user-data-dir=' + UD, '--window-size=600,1000', 'about:blank',
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
    let id = 0;
    const pending = new Map();
    ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
    const send = (method, params) => new Promise((res, rej) => {
      const mid = ++id;
      pending.set(mid, (m) => (m.error ? rej(new Error(m.error.message)) : res(m.result)));
      ws.send(JSON.stringify({ id: mid, method, params }));
    });
    const ev = async (expr) => {
      const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error('JS: ' + (r.exceptionDetails.exception?.description || '').split('\n')[0]);
      return r.result.value;
    };
    await send('Page.enable', {});
    await send('Runtime.enable', {});
    await send('Emulation.setDeviceMetricsOverride', { width: 600, height: 1000, deviceScaleFactor: 2, mobile: true });
    await send('Page.navigate', { url: URL });

    const t0 = Date.now();
    while (Date.now() - t0 < 90000) {
      try { if (await ev('!!window.__game')) break; } catch (_) {}
      await sleep(250);
    }
    await sleep(900);
    // 公告 / 签到 / 宣传有礼这一串先收掉，不然截图全是它们
    await ev(`(() => {
      for (const id of ['noticeOk', 'signClose', 'sgClose', 'prClose']) {
        const b = document.getElementById(id);
        if (b) b.click();
      }
      for (const el of document.querySelectorAll('.modal.on, #noticeOv.on')) {
        el.classList.remove('on');
        el.setAttribute('aria-hidden', 'true');
      }
    })()`);
    await sleep(600);
    await ev('__game.beginGame({tutorial:false})');
    await sleep(800);
    await ev('__game.setAdmin(true)');
    await ev('__game.setLevel(8)');
    await ev('__game.ensureLevelAssets(8)');
    await sleep(800);
    await ev('__game.enemies.killAll()');
    await sleep(300);
    // 玩家蹲在柜子前面（柜子在 z=-19.2，竖屏上方能看 15 格），这样画面里同时有：
    // 场外那座寄存柜（攒了 5 块木牌）+ 场上一支横穿视线的队列。
    await ev(`(() => { __game.pos.x = 0; __game.pos.z = -6.0; })()`);
    await sleep(200);
    // 一支队：1 旗手 + 5 无名者，spawn 会自动编队；把血钉住免得被自动近战打死
    await ev(`(() => {
      const spawnAt = [[-2.5, -11.0], [-1.5, -11.0], [-0.5, -11.0], [0.5, -11.0], [1.5, -11.0], [2.5, -11.0]];
      spawnAt.forEach(([x, z], i) => {
        const e = __game.enemies.spawn(i === 0 ? 'bearer' : 'ranker', { x, z }, {});
        if (e) { e.hp = 999; e.maxHp = 999; }
      });
      // 让队伍**横着**从画面里走过去（俯视下能看清法线队形 + 旗手举牌），
      // 不然它们朝镜头走过来，最后全糊在屏幕下方。
    })()`);
    await sleep(300);
    await ev(`(() => {
      const s = __game.enemies.squadState();
      if (s && s.length) __game.enemies.squadDir(0, 1, 0);
    })()`);
    await sleep(1400);
    // 柜子里放 5 块牌子（满 8 会开门放人，截图先不要那个）
    await ev('__game.block63.deposit.add(5)');
    await sleep(2200);
    // 弹窗链 350ms 一串，截图前再扫一遍
    await ev(`(() => {
      for (const el of document.querySelectorAll('#noticeOv, #signOv, #promoOv, .modal, #meetCard')) {
        el.classList.remove('on');
        el.setAttribute('aria-hidden', 'true');
      }
    })()`);
    await sleep(350);
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(OUT, Buffer.from(shot.data, 'base64'));
    const info = await ev(`JSON.stringify({
      squads: __game.enemies.squadCount(),
      alive: __game.enemies.squadAlive(),
      tags: __game.block63.deposit.count(),
      deposit: __game.block63.deposit.state(),
    })`);
    console.log('状态', info);
    console.log('写出', OUT, (fs.statSync(OUT).size / 1024).toFixed(0) + 'KB');
  } catch (err) {
    console.error('ERR', err.message);
    process.exitCode = 1;
  } finally {
    try { ws && ws.close(); } catch (_) {}
    try { chrome.kill(); } catch (_) {}
    setTimeout(() => process.exit(process.exitCode || 0), 400);
  }
})();
