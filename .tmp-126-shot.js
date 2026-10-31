// 第 126 块 · 照影换模型截图核对（主角同款模型 + 紫色贴图）
//   ① 主角和照影并排 —— 看是不是同一只蛙、只差配色
//   ② 三只照影围过来 —— 看跳跃表现和紫度
//   ③ 远景 —— 看和主角的大小关系
// 前置：python -m http.server 8124（cwd = naiwa-rouge）
// 运行：node .tmp-126-shot.js   → C:/Users/MECHREVO/AppData/Local/Temp/naiwa-block126
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9354;
const UD = path.join(process.env.TEMP || '/tmp', 'naiwa-cdp-126shot');
const OUT = 'C:/Users/MECHREVO/AppData/Local/Temp/naiwa-block126';
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
      if (r.result && r.result.exceptionDetails) console.log('  !! ' + JSON.stringify(r.result.exceptionDetails.text));
      return r.result && r.result.result ? r.result.result.value : null;
    };
    const shot = async (name) => {
      const r = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(OUT, name), Buffer.from(r.result.data, 'base64'));
      console.log('  shot ' + name);
    };
    const waitFor = async (expr, ms) => {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) { if (await ev(expr)) return true; await sleep(120); }
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

    await ev('__game.setPendingLevel(10)');
    await ev('(async () => { await __game.beginGame({ tutorial: false }); return 1; })()');
    await sleep(2500);
    await ev('__game.setWaves(false); 1');
    // 场外看门狗：清空场上会触发回合结算链，随机事件卡会盖住画面
    await ev(`(() => {
      const k = __game.enemies.spawn('warrior', { x: -30, z: -30 });
      if (k) { k.state = 'chase'; k.maxHp = 30; k.hp = 30; k.attackCd = 1e9; }
      window.__keeper = k;
      return !!k;
    })()`);
    const clearField = async () => {
      await ev('__game.enemies.all().forEach(e => { if (e !== window.__keeper) __game.enemies.takeDamage(e, 9999); }); 1');
      await sleep(700);
      await ev('(() => { const k = window.__keeper; if (k) { k.pos.x = -30; k.pos.z = -30; } return 1; })()');
    };
    await waitFor('__game.level.phase === "spawning"', 20000);
    await sleep(1200);
    await clearField();

    // ---- ① 主角 + 一只照影：并排站在镜头前 ----
    // ⚠️ 照影的移速照抄玩家（4.4 格/秒），spawn 后 1.8 秒能走 8 格直接贴到脸上 ——
    // 必须在**同一帧**把它的 cfg 换成一个 speed 0 的副本（直接改 m.cfg.speed 会
    // 污染 ENEMY_TYPES.mirror，那是全场照影共用的对象）。
    // ⚠️ 第十关的中心是**井口**（hazard）：warp(0,0) 之后主角会被推开到 x≈2.6，
    // 而照影还按「旧坐标 +2.4」摆 —— 两只正好叠在一起，看起来像一只半黄半紫的蛙。
    // 所以先站到空地、等站位稳定，再按**实际**坐标摆照影。
    await ev('__game.warp(-5.5, -5.5); 1');
    await sleep(700);
    const setup1 = await ev(`(() => {
      const p = __game.pos();
      // 横向平排（同深度、右侧 2.6 格）：相机在主角正后方，前后摆会被自己挡住，
      // 左右摆才是「并排站」的构图
      // 放正前方 3.4 格（相机在主角后上方，前方的角色会落在画面上半部，
      // 和下方的主角错开）；state 用 idle —— chase 会一路走过来贴到脸上。
      const m = __game.enemies.spawn('mirror', { x: p.x, z: p.z + 3.4 });
      if (m) {
        m.state = 'idle'; m.attackCd = 1e9; m.hp = m.maxHp = 60;
        // ⚠️ 实例字段 e.speed 是 spawn 时算好的**绝对值**，改 cfg.speed 没用
        // （cfg 只是那一步的输入）；照影的移速照抄玩家 4.4 格/秒，2.6 秒能走 11 格
        // 直接贴到脸上 —— 两张模型叠在一起，看起来就像「一只半黄半紫的蛙」。
        // ⚠️ 还有一层：照影在**第一帧**会按玩家面板重算血量 / 攻击 / 移速
        // （handleMirror 的 mirrorSized），直接设 m.speed = 0 会被那一帧覆盖回去。
        // 先把 mirrorSized 标记成 true，让它别重算。
        m.mirrorSized = true;
        m.speed = 0;
        m.cfg = Object.assign({}, m.cfg, { speed: 0, attackRange: 0 });
      }
      window.__mir = m;
      return m ? { ok: 1, asked: [+p.x.toFixed(2), +(p.z + 3.4).toFixed(2)],
                   root: [+m.root.position.x.toFixed(2), +m.root.position.z.toFixed(2)],
                   pos: [+m.pos.x.toFixed(2), +m.pos.z.toFixed(2)] } : { ok: 0 };
    })()`);
    console.log('  照影: ' + JSON.stringify(setup1));
    await ev('__game.heal.fill(); 1');
    await sleep(400);
    // ⚠️ 设 speed=0 / state='idle' 都拦不住它往玩家身上挤（照影的移速是照抄玩家的，
    // handleMirror 自己会走过去）。测试里不跟它较劲：每帧把位置摁回去就行。
    await ev(`(() => {
      const m = window.__mir;
      if (!m) return 0;
      window.__pin = setInterval(() => {
        const p = __game.pos();
        m.pos.x = p.x; m.pos.z = p.z + 3.4;
        m.root.position.x = m.pos.x; m.root.position.z = m.pos.z;
      }, 16);
      return 1;
    })()`);
    await ev('__game.heal.fill(); 1');
    await sleep(2600);   // 等伤害数字飘走，别糊在模型脸上
    await shot('a1-side-by-side.png');
    await ev('clearInterval(window.__pin); 1');
    const where = await ev(`(() => {
      const p = __game.pos(); const m = window.__mir;
      return { player: [+p.x.toFixed(2), +p.z.toFixed(2)],
               mir: m ? [+m.pos.x.toFixed(2), +m.pos.z.toFixed(2)] : null,
               cam: __game.camera ? [+__game.camera.position.x.toFixed(2), +__game.camera.position.y.toFixed(2), +__game.camera.position.z.toFixed(2)] : null };
    })()`);
    console.log('  站位: ' + JSON.stringify(where));
    const size = await ev(`(() => {
      const m = window.__mir;
      return m ? { height: +m.cfg.height.toFixed(2), scale: +m.model.scale.x.toFixed(3),
                   playerH: +(2.28).toFixed(2), bounce: JSON.stringify(m.cfg.bounce) } : null;
    })()`);
    console.log('  尺寸: ' + JSON.stringify(size));

    // ---- ② 三只照影围过来（跳跃表现）----
    await clearField();
    await ev(`(() => {
      __game.warp(0, 0);
      const p = __game.pos();
      const a = [[-2.2, 1.6], [0.4, 2.6], [2.4, 1.4]];
      window.__mirs = a.map(([dx, dz]) => {
        const m = __game.enemies.spawn('mirror', { x: p.x + dx, z: p.z + dz });
        if (m) { m.state = 'chase'; m.maxHp = 60; m.hp = 60; }
        return m;
      }).filter(Boolean);
      return window.__mirs.length;
    })()`);
    await sleep(1500);
    // 连拍三张，挑一张跳在空中的
    for (let i = 0; i < 3; i++) { await sleep(160); await shot('a2-pack-' + (i + 1) + '.png'); }

    // ---- ③ 远景：主角 + 一只照影 ----
    await clearField();
    await ev('__game.heal.fill(); 1');
    await ev(`(() => {
      __game.warp(0, -3.2);
      const p = __game.pos();
      const m = __game.enemies.spawn('mirror', { x: p.x - 1.4, z: p.z + 4.4 });
      if (m) { m.state = 'chase'; m.attackCd = 1e9; m.maxHp = 60; m.hp = 60; }
      return 1;
    })()`);
    await sleep(1600);
    await shot('a3-wide.png');

    console.log('done → ' + OUT);
  } finally {
    try { ws && ws.close(); } catch (_) {}
    try { chrome.kill(); } catch (_) {}
  }
})();
