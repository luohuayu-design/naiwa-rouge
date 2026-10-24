// ============================================================
// 第 68 块：元素波及范围 3.5 → 7.0 格的现场对比截图
//   before-frost.png  临时把 elementRadius 扣回 3.5 再触发冰剑
//   after-frost.png   默认 7.0 触发冰剑
//   after-poison.png  默认 7.0 触发毒剑
// 怪按 45° 一圈摆开，距离 1.5 ~ 9.0 格：7 格圈边界一眼能看出来。
//
// 跑法：先 `python -m http.server 8124`（cwd=naiwa-rouge），再 `node .tmp-shot-elem-range.js`
// ============================================================
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9381;
const UD = path.join(os.tmpdir(), 'naiwa-shot-rng-' + process.pid);
const OUT = path.join(os.tmpdir(), 'naiwa-elem-range');
const URL = 'http://127.0.0.1:8124/index.html?debug=1';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  fs.rmSync(UD, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
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
    if (!list) throw new Error('Chrome 调试端口没起来');
    const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent('about:blank')}`, { method: 'PUT' })).json();
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('WebSocket 连接失败')); });

    let id = 0;
    const pending = new Map();
    ws.onmessage = (evt) => {
      const m = JSON.parse(evt.data);
      if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    };
    function send(method, params) {
      const mid = ++id;
      return new Promise((res, rej) => {
        pending.set(mid, (m) => (m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result)));
        ws.send(JSON.stringify({ id: mid, method, params }));
      });
    }
    async function ev(expr) {
      const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error('JS 异常: ' + (r.exceptionDetails.exception?.description || '').split('\n')[0]);
      return r.result.value;
    }
    async function waitFor(expr, ms = 90000, label = expr) {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) {
        try { if (await ev(expr)) return true; } catch (_) {}
        await sleep(200);
      }
      throw new Error('等待超时: ' + label);
    }
    async function shot(name) {
      const r = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(OUT, name), Buffer.from(r.data, 'base64'));
      console.log('  · ' + name);
    }

    await send('Runtime.enable');
    await send('Page.enable');
    await send('Page.navigate', { url: URL });
    await waitFor('!!window.__game', 120000, '__game 就绪');
    await sleep(1600);
    await ev(`['noticeOv','promoOv','signOv','packGet','tutCard','hintCard','upgOv','shopOv','eventOv'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) { el.classList.remove('on'); el.setAttribute('aria-hidden', 'true'); }
    }); 1`);
    await waitFor("__game.state === 'playing' || __game.state === 'over'", 30000, '进入对局');
    console.log('  状态：' + (await ev('__game.state')));

    // 停刷怪 / 怪不追人；清场后按 45° 一圈摆 8 只（近的密集、远的踩圈边）
    const setup = `(() => {
      __game.setWaves(true); __game.setEnemies(true);
      __game.enemies.killAll();
      const p = __game.pos;
      const dists = [1.5, 2.6, 3.4, 4.4, 5.4, 6.4, 7.6, 9.0];
      window.__demo = [];
      for (let i = 0; i < dists.length; i++) {
        const a = (i / dists.length) * Math.PI * 2;
        const e = __game.enemies.spawn('shielder', {
          x: p.x + Math.cos(a) * dists[i], z: p.z + Math.sin(a) * dists[i],
        });
        if (e) { e.state = 'chase'; e.hp = 999; e.maxHp = 999; e.speed = 0; window.__demo.push(e); }
      }
      return window.__demo.length;
    })()`;
    console.log('  摆怪：' + (await ev(setup)) + ' 只');
    await sleep(900);

    // 让效果持续冒：每 140ms 打一次，截图时正好有圈
    const pulse = (kind) => `(() => {
      clearInterval(window.__pulse);
      window.__pulse = setInterval(() => {
        const alive = __game.enemies.list.filter((e) => e.state !== 'dead');
        if (alive.length) __game.weapon.applyKind('${kind}', alive[0], 2.0);
      }, 140);
      return 1;
    })()`;

    // ---- before：临时把半径扣回 3.5 ----
    await ev(`__game.wstats.addMod({ stat: 'elementRadius', flat: -3.5, src: 'demo35' }), 1`);
    console.log('  before 半径 = ' + (await ev("__game.wstats.get('elementRadius')")));
    await ev(pulse('frost'));
    await sleep(700);
    await shot('before-frost.png');
    await ev('clearInterval(window.__pulse), 1');
    await ev(`__game.wstats.removeBySource('demo35'), 1`);

    // 复活（被冻住的怪还在，直接重摆一遍保证一致）
    await sleep(300);
    await ev(setup);
    await sleep(600);

    // ---- after：默认 7.0 ----
    console.log('  after 半径 = ' + (await ev("__game.wstats.get('elementRadius')")));
    await ev(pulse('frost'));
    await sleep(700);
    await shot('after-frost.png');
    await ev('clearInterval(window.__pulse), 1');

    await sleep(400);
    await ev(setup);
    await sleep(600);
    await ev(pulse('poison'));
    await sleep(700);
    await shot('after-poison.png');
    await ev('clearInterval(window.__pulse), 1');

    // 圈内/圈外的怪各几只（数字对账，别只看图）
    const tally = await ev(`(() => {
      const p = __game.pos;
      const out = { frozenIn: 0, frozenOut: 0, dotIn: 0, dotOut: 0, R: __game.wstats.get('elementRadius') };
      for (const e of __game.enemies.list) {
        if (e.state === 'dead') continue;
        const d = Math.hypot(e.pos.x - p.x, e.pos.z - p.z);
        const inside = d <= out.R + 0.05;
        if (e.freezeT > 0) { inside ? out.frozenIn++ : out.frozenOut++; }
        if (e.dot && e.dot.t > 0) { inside ? out.dotIn++ : out.dotOut++; }
      }
      return out;
    })()`);
    console.log('  对账：' + JSON.stringify(tally));
    console.log('\n截图目录：' + OUT);
  } catch (e) {
    console.error('失败：' + e.message);
    process.exitCode = 1;
  } finally {
    try { if (ws) ws.close(); } catch (_) {}
    try { chrome.kill(); } catch (_) {}
    await sleep(200);
    process.exit();
  }
})();
