// 雾的取景：进第十一关，起一团雾，站进去截一张；再站到雾外截一张
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9399;
const UD = path.join(os.tmpdir(), 'naiwa-fogshot');
const OUT = path.join(os.tmpdir(), 'naiwa-block114');
const URL = 'http://127.0.0.1:8124/index.html?debug=1&title';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  fs.rmSync(UD, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
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
    const shot = async (name) => {
      const r = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(OUT, name), Buffer.from(r.data, 'base64'));
      console.log('写出', name);
    };
    await send('Runtime.enable');
    await send('Page.enable');
    await send('Page.navigate', { url: URL });
    for (let i = 0; i < 400 && !(await ev('!!window.__game').catch(() => false)); i++) await sleep(200);
    await sleep(2500);
    for (const k of ['notice', 'sign', 'promo']) {
      await ev(`if (__game.${k}.open()) __game.${k}.hide(); 1`);
      await sleep(400);
    }
    await ev('__game.setPendingLevel(11)');
    await ev('(async () => { await __game.beginGame({ tutorial: false }); return 1; })()');
    await sleep(1600);
    for (let i = 0; i < 40; i++) {
      const st = await ev('__game.state');
      if (st === 'playing') break;
      if (st === 'hint') await ev('document.getElementById("hiOk").click()');
      else if (st === 'meet') await ev('document.getElementById("mtOk").click()');
      else if (st === 'weapon') await ev('document.getElementById("wcOk").click()');
      else if (st === 'tutorial') await ev('__game.tutorial.skip()');
      else break;
      await sleep(160);
    }
    await ev('__game.setWaves(true)');
    await ev('__game.block114.fog.clear()');  // clear = clearPatches（不关系统）
    await ev('__game.warp(0, 0)');
    await sleep(600);
    await shot('f1-no-fog.png');
    // 起一团并站进去
    await ev('__game.block114.fog.spawn(true)');
    await ev('__game.block114.fog.heat(0)');
    await sleep(400);
    const p = (await ev('__game.block114.fog.list()'))[0];
    await ev(`__game.warp(${p.x}, ${p.z})`);
    await sleep(700);
    await shot('f2-in-fog.png');
    // 放两只怪在雾里：验证「怪也被盖住」
    await ev(`__game.block63.enemies.spawn('warrior', ${p.x + 1.2}, ${p.z})`);
    await ev(`(() => { const w = __game.block63.enemies.live('warrior'); if (w) { w.state = 'chase'; } })()`);
    await sleep(900);
    await shot('f3-enemy-in-fog.png');
    // 诊断：把主角藏起来再拍一张 —— 如果画面里「蛙」的形状消失了，
    // 说明蛙是被画在雾上面的（雾没盖住它），不是错觉。
    await ev('__game.frog.root.visible = false; __game.playerRing.setVisible(false); 1');
    await sleep(500);
    await shot('f3b-no-frog.png');
    await ev('__game.frog.root.visible = true; __game.playerRing.setVisible(true); 1');
    // 诊断 2：把雾强制置顶（depthTest:false + renderOrder 950）
    await ev(`(() => {
      let n = 0;
      __game.scene.traverse((o) => {
        if (o.renderOrder === 400 && o.material) { o.material.depthTest = false; o.renderOrder = 950; n++; }
      });
      return n;
    })()`.replace('\n', ' ')).then((n) => console.log('置顶雾层数:', n));
    await sleep(500);
    await shot('f3c-fog-on-top.png');
    // 预警圈：起一团不加热（还在预警期）
    await ev('__game.block114.fog.clear()');  // clear = clearPatches（不关系统）
    await ev('__game.block114.fog.spawn(false)');
    await sleep(700);
    await shot('f4-warn.png');
  } catch (e) {
    console.log('ERR', e.message);
  } finally {
    try { ws && ws.close(); } catch (_) {}
    try { chrome.kill(); } catch (_) {}
    setTimeout(() => process.exit(0), 300);
  }
})();
