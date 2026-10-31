const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9347;
const UD = path.join(process.env.TEMP || '/tmp', 'naiwa-cdp-123shot');
const OUT = 'C:/Users/MECHREVO/AppData/Local/Temp/naiwa-block123';
const URL = 'http://127.0.0.1:8124/?debug=1&story&chal';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  fs.rmSync(UD, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const chrome = spawn(CHROME, [
    '--headless=new', '--remote-debugging-port=' + PORT, '--num-raster-threads=2',
    '--renderer-process-limit=1', '--enable-unsafe-swiftshader', '--no-first-run',
    '--no-default-browser-check', '--disable-dev-shm-usage', '--disable-background-timer-throttling',
    '--user-data-dir=' + UD, '--window-size=420,900', 'about:blank',
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
    const send = (method, params) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
    const ev = async (expr) => {
      const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      return r.result && r.result.result ? r.result.result.value : null;
    };
    const shot = async (name) => {
      const r = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(OUT, name), Buffer.from(r.result.data, 'base64'));
      console.log('  shot ' + name);
    };
    const waitFor = async (expr, ms) => {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) { if (await ev(expr)) return true; await sleep(200); }
      return false;
    };

    await send('Runtime.enable');
    await send('Page.enable');
    await send('Page.navigate', { url: URL });
    await waitFor('!!window.__game', 90000);
    await sleep(1500);
    await ev('if (__game.notice.open()) __game.notice.hide(); 1');
    await sleep(400);
    await ev('if (__game.sign.open()) __game.sign.hide(); 1');
    await sleep(400);
    await ev('if (__game.promo.open()) __game.promo.hide(); 1');
    await sleep(300);
    await ev('__game.setPendingLevel(13)');
    await ev('(async () => { await __game.beginGame({ tutorial: false }); return 1; })()');
    await sleep(2500);

    // 第 1 回合：把主角挪到跑道外，看清整圈
    await ev('__game.setWaves(false); 1');
    await waitFor('__game.level.phase === "spawning"', 20000);
    await sleep(1200);
    await ev('__game.warp(0, 0); 1');
    await sleep(900);
    await shot('a1-track.png');

    // 刷两只新怪到面前
    await ev('__game.enemies.all().forEach(e => e.hp = 0); 1');
    await ev('__game.enemies.spawn("standee", { x: 2.2, z: 2.2 }); 1');
    await ev('__game.enemies.spawn("camera", { x: -2.6, z: 2.0 }); 1');
    await ev('__game.warp(0, -1.5); 1');
    await sleep(1400);
    await shot('a2-newmobs.png');

    // 站在跑道上（半径 7.5）比较视野
    await ev('__game.warp(0, -7.6); 1');
    await sleep(900);
    console.log('  track@(0,-7.6) = ' + await ev('JSON.stringify(__game.track.at(0, -7.6))'));
    await shot('a3-ontrack.png');

    // 纸立牌：立起来看看跟怪物、跑道站在一起是什么样子
    await ev('__game.warp(0, 0); 1');
    await sleep(3000);   // 等成就浮层淡掉，别糊在截图上
    await ev('__game.block114.grantBoard(3); 1');
    await sleep(400);
    await ev('__game.enemies.all().forEach(e => e.hp = 0); 1');   // 清干净，只看牌
    await ev('__game.pressSkill("board"); 1');
    await sleep(1600);
    console.log('  board count = ' + await ev('__game.block114.board.count()'));
    console.log('  board list  = ' + await ev('JSON.stringify(__game.block114.board.list())'));
    await shot('a4-board.png');
    // 再换个角度：站到牌的侧面，看它是不是真的「立着的一块板」
    await ev('__game.warp(-2.6, -0.6); 1');
    await sleep(1000);
    await shot('a5-board-side.png');
  } catch (e) {
    console.log('ERR ' + e.message);
  } finally {
    try { ws && ws.close(); } catch (_) {}
    try { chrome.kill(); } catch (_) {}
  }
})();
