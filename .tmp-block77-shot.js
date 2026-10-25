// 第 77 块：井蛙 / 木鱼灵 换真模型 —— 局内实拍（站位 / 身高 / 浮空 / 待机动作）
// 跑法：先 `python -m http.server 8124`（cwd=naiwa-rouge），再 `node .tmp-block77-shot.js`
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9477;
const UD = path.join(os.tmpdir(), 'naiwa-cdp-77shot-' + process.pid);
const OUT = path.join(os.tmpdir(), 'naiwa-block77');
const URL = 'http://127.0.0.1:8124/index.html?debug=1&title';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  fs.rmSync(UD, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const chrome = spawn(CHROME, [
    '--headless=new', '--remote-debugging-port=' + PORT, '--num-raster-threads=2',
    '--enable-unsafe-swiftshader', '--no-first-run', '--no-default-browser-check',
    '--disable-dev-shm-usage', '--user-data-dir=' + UD, '--window-size=430,900', 'about:blank',
  ], { stdio: 'ignore' });
  let ws = null;
  try {
    let list = null;
    for (let i = 0; i < 60; i++) {
      try { list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); break; }
      catch (_) { await sleep(500); }
    }
    if (!list) throw new Error('调试端口没起来');
    const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent('about:blank')}`, { method: 'PUT' })).json();
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws 失败')); });
    let id = 0;
    const pending = new Map();
    ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
    const send = (method, params) => new Promise((res, rej) => {
      const mid = ++id;
      pending.set(mid, (m) => (m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result)));
      ws.send(JSON.stringify({ id: mid, method, params }));
    });
    const ev = async (ex) => {
      const r = await send('Runtime.evaluate', { expression: ex, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error('JS: ' + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || '').split('\n')[0]);
      return r.result.value;
    };
    const shot = async (n) => {
      const r = await send('Page.captureScreenshot', { format: 'png' });
      const f = path.join(OUT, n);
      fs.writeFileSync(f, Buffer.from(r.data, 'base64'));
      console.log('shot', n);
    };
    await send('Runtime.enable');
    await send('Page.enable');
    await send('Page.navigate', { url: URL });
    const t0 = Date.now();
    while (Date.now() - t0 < 90000) { try { if (await ev('!!window.__game')) break; } catch (_) {} await sleep(200); }
    await sleep(900);
    // 关掉开局的几个浮层（公告 / 签到 / 宣传）
    await ev("window.__game.notice && __game.notice.hide && __game.notice.hide(); 1");
    await sleep(300);
    await ev("(function(){ const b=document.querySelector('#noticeBox button, #nbOk, #noticeOk'); if (b) b.click(); return 1; })()");
    await sleep(300);
    try { if (await ev("!!(__game.sign && __game.sign.open && __game.sign.open())")) await ev("document.getElementById('signClose').click(), 1"); } catch (_) {}
    await sleep(300);
    await ev("window.__game.promo && __game.promo.hide && __game.promo.hide(); 1");
    await sleep(400);

    await ev('__game.beginGame({tutorial:false})');
    await sleep(900);
    await ev('__game.setAdmin(true)');
    await ev('__game.setLevel(7)');
    await ev('__game.ensureLevelAssets(7)');
    await sleep(600);

    // 反复关浮层：公告 / 宣传 / 签到 会在 beginGame 之后再弹一次
    for (let i = 0; i < 12; i++) {
      await ev(`(function(){
        try { const b = document.getElementById('noticeOk'); if (b && document.getElementById('noticeOv').classList.contains('on')) b.click(); } catch(_){}
        try { __game.promo && __game.promo.hide(); } catch(_){}
        try { __game.sign && __game.sign.hide(); } catch(_){}
        try { const b = document.getElementById('promoX'); if (b) b.click(); } catch(_){}
        const on = [...document.querySelectorAll('.notice-ov.on, #noticeOv.on, #promoOv.on, #signOv.on')].length;
        return on;
      })()`).then((n) => { if (i === 0 || n) console.log('浮层剩余', n); });
      await sleep(200);
    }
    await sleep(400);

    // 清场 + 钉死（不移动、不打死），摆到玩家前方
    await ev(`(() => {
      __game.enemies.killAll();
      const a = __game.enemies.spawn('wellfrog', { x: -2.6, z: -4.6 }, {});
      const b = __game.enemies.spawn('woodfish', { x: 2.6, z: -4.6 }, {});
      for (const e of [a, b]) if (e) { e.hp = 9999; e.maxHp = 9999; e.speed = 0; }
      return 1;
    })()`);
    await sleep(1800);
    await shot('lvl7-both.png');

    const info = await ev(`JSON.stringify(__game.enemies.list.filter(e => e.type === 'wellfrog' || e.type === 'woodfish').map(e => {
      const box = new (window.__THREE_BOX__ || Object)();
      return {
        type: e.type, state: e.state,
        x: +e.pos.x.toFixed(2), z: +e.pos.z.toFixed(2),
        rootY: +e.root.position.y.toFixed(3),
        modelY: +e.model.position.y.toFixed(3),
        scale: +e.model.scale.x.toFixed(4),
        anim: e.currentAnim,
        aliases: e.aliases ? Object.keys(e.aliases).length : (e.clips ? e.clips.length : 'n/a'),
      };
    }))`);
    console.log('怪物状态:', info);

    // 单独给木鱼灵一个特写（验浮空高度）
    await ev(`(() => {
      const b = __game.enemies.list.find(e => e.type === 'woodfish');
      if (b) { __game.pos.x = b.pos.x; __game.pos.z = b.pos.z + 3.2; }
      return 1;
    })()`);
    await sleep(700);
    await shot('lvl7-woodfish.png');

    // 井蛙特写
    await ev(`(() => {
      const a = __game.enemies.list.find(e => e.type === 'wellfrog');
      if (a) { __game.pos.x = a.pos.x; __game.pos.z = a.pos.z + 3.2; }
      return 1;
    })()`);
    await sleep(700);
    await shot('lvl7-wellfrog.png');
  } catch (err) {
    console.error('FAIL', err.message);
    process.exitCode = 1;
  } finally {
    try { ws && ws.close(); } catch (_) {}
    try { chrome.kill(); } catch (_) {}
    setTimeout(() => process.exit(process.exitCode || 0), 400);
  }
})();
