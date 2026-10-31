// 第 123 块 · 第十三关「焦土操场」+ 纸立牌 —— 无头 Chrome 行为测试
//   ① 进第十三关、跑道启用
//   ② 跑道的加速倍率（玩家 1.35 / 怪 1.25），场上 / 场外分开
//   ③ 立牌怪：正面挨打只吃 25%，背后挨打吃满
//   ④ 纸立牌：技能栏多一格 / 按下去真立起来 / 判定真的挡 / 冷却真的走
//   ⑤ 取景的能正常开火不报错
//   ⑥ 全程零 JS 报错
// 前置：python -m http.server 8124（cwd = naiwa-rouge）
// 运行：node .tmp-123-cdp.js
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9347;
const UD = path.join(process.env.TEMP || '/tmp', 'naiwa-cdp-123bd');
const URL = 'http://127.0.0.1:8124/?debug=1&story&chal';   // 不带 &meet：首次遇怪的图鉴卡会盖住战场
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, m, extra) => {
  if (c) { pass++; console.log('  ok  ' + m + (extra != null ? `  [${extra}]` : '')); }
  else { fail++; console.log('  XX  ' + m + (extra != null ? `  [${extra}]` : '')); }
};

(async () => {
  fs.rmSync(UD, { recursive: true, force: true });
  const chrome = spawn(CHROME, [
    '--headless=new', '--remote-debugging-port=' + PORT, '--num-raster-threads=2',
    '--renderer-process-limit=1', '--enable-unsafe-swiftshader', '--no-first-run',
    '--no-default-browser-check', '--disable-dev-shm-usage', '--disable-background-timer-throttling',
    '--user-data-dir=' + UD, '--window-size=420,900', 'about:blank',
  ], { stdio: 'ignore' });

  const errs = [];
  let ws = null;
  try {
    let list = null;
    for (let i = 0; i < 60; i++) {
      try { list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); break; }
      catch (_) { await sleep(500); }
    }
    if (!list) throw new Error('no debug port');
    const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent('about:blank')}`, { method: 'PUT' })).json();
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws fail')); });

    let id = 0;
    const pending = new Map();
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
      if (m.method === 'Runtime.exceptionThrown') {
        const d = m.params.exceptionDetails;
        errs.push((d.exception && d.exception.description || d.text || '').split('\n')[0]);
      }
      if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
        errs.push('console: ' + m.params.args.map((a) => a.value || a.description || '').join(' ').slice(0, 160));
      }
    };
    const send = (method, params) => new Promise((res) => {
      const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params }));
    });
    const ev = async (expr) => {
      const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.result && r.result.exceptionDetails) {
        throw new Error((r.result.exceptionDetails.exception || {}).description || 'eval error');
      }
      return r.result && r.result.result ? r.result.result.value : null;
    };

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Page.navigate', { url: URL });
    for (let i = 0; i < 90; i++) {
      if (await ev('!!window.__game')) break;
      await sleep(400);
    }
    ok(await ev('!!window.__game'), '页面起来了');

    // ---------------- ① 进关 ----------------
    await ev('__game.setPendingLevel(13)');
    await ev('(async () => { await __game.beginGame({ tutorial: false }); return 1; })()');
    await sleep(1600);
    ok(await ev('__game.state === "playing"'), '进了战斗态', await ev('__game.state'));
    ok((await ev('__game.level.level.name')).includes('焦土操场'), '当前关卡 = 焦土操场');
    ok(await ev('__game.track.on()'), '跑道已启用');
    ok(await ev('__game.track.spec().playerMul') === 1.35, '跑道玩家倍率 1.35');
    ok(await ev('__game.track.spec().enemyMul') === 1.25, '跑道怪物倍率 1.25');

    // ---------------- ② 加速度分场地 ----------------
    const onBand = await ev('__game.track.at(6.5, 0)');
    const offBand = await ev('__game.track.at(0, 0)');
    ok(onBand && onBand.on === true && Math.abs(onBand.mul - 1.35) < 1e-6,
      '站在跑道上：玩家 ×1.35', JSON.stringify(onBand));
    ok(onBand && Math.abs(onBand.push - 0.42) < 1e-6, '跑道上带切向推力 0.42');
    ok(onBand && (Math.abs(onBand.tx) > 1e-6 || Math.abs(onBand.tz) > 1e-6),
      '推力方向是切向（有分量）', `${onBand && onBand.tx}/${onBand && onBand.tz}`);
    ok(offBand && offBand.on === false && offBand.mul === 1, '场外：不加速', JSON.stringify(offBand));
    ok(await ev('__game.track.enemyMul(6.5, 0)') === 1.25, '怪物站上跑道也 ×1.25（不是白捡）');
    ok(await ev('__game.track.enemyMul(0, 0)') === 1, '怪物在场外不吃加速');

    // ---------------- ③ 立牌怪：正面减伤 ----------------
    // 冻波次 + 把主角钉到原点，好让「正面 / 背后」两个方向算得准
    await ev('__game.setWaves(false)');
    await ev('__game.warp(0, 0)');
    await sleep(350);
    const dmg = await ev(`(() => {
      // ⚠️ __game.pos 是**函数**（返回四舍五入过的 {x,z}），不是对象 —— 第 123 块踩过
      const p = __game.pos();
      let e = __game.enemies.all().find((x) => x.type === 'standee');
      if (e) { e.pos.x = 0; e.pos.z = 4; }
      else { e = __game.enemies.spawn('standee', { x: 0, z: 4 }); }
      if (!e) return null;
      e.state = 'chase';              // spawn 态免疫伤害
      e.maxHp = 100; e.hp = 100;      // 钉血，免得一刀打死
      const face = Math.atan2(p.x - e.pos.x, p.z - e.pos.z);   // 牌面朝玩家（-Z 方向）
      e.root.rotation.y = face;
      let before = e.hp;
      __game.enemies.takeDamage(e, 10, false, { quiet: true, noText: true });
      const front = +(before - e.hp).toFixed(3);
      e.hp = 100;
      e.root.rotation.y = face + Math.PI;                       // 转身背对
      before = e.hp;
      __game.enemies.takeDamage(e, 10, false, { quiet: true, noText: true });
      const back = +(before - e.hp).toFixed(3);
      return { front, back, face: +face.toFixed(2) };
    })()`);
    console.log('     正面 / 背后伤害: ' + JSON.stringify(dmg));
    ok(dmg && dmg.front > 0 && dmg.back > 0, '两刀都真的掉血了');
    ok(dmg && dmg.front < dmg.back * 0.4, '正面只吃约 1/4（faceGuard 75%）', dmg && `${dmg.front} vs ${dmg.back}`);
    ok(dmg && Math.abs(dmg.front / dmg.back - 0.25) < 0.06, '正面 / 背后 ≈ 0.25', dmg && (dmg.front / dmg.back).toFixed(3));

    // ---------------- ④ 纸立牌 ----------------
    ok(await ev('__game.block114.board.owned()') === false, '一开始没有纸立牌');
    ok(await ev('__game.visibleSkills().includes("board")') === false, '技能栏里还没有这一格');
    ok(await ev('__game.pressSkill("board")') === false, '没买之前按下无效');

    const lv = await ev('__game.block114.grantBoard(1)');
    ok(lv === 1, `买到 1 级（${lv}）`);
    await sleep(300);
    ok(await ev('__game.block114.board.owned()') === true, 'owned 变 true');
    ok(await ev('__game.visibleSkills().includes("board")') === true, '技能栏多出纸立牌这一格');
    const st = await ev('JSON.stringify(__game.skillState().find((s) => s.id === "board"))');
    ok(st && JSON.parse(st).shown === true, '那一格是显示的', st);
    ok(st && JSON.parse(st).ready === true, '刚买到时是可用的（ready）');

    const before = await ev('__game.block114.board.count()');
    ok(before === 0, '还没立牌时场上 0 块');

    const pressed = await ev('__game.pressSkill("board")');
    ok(pressed === true, '按下技能键立起来了');
    await sleep(150);
    ok(await ev('__game.block114.board.count()') === 1, '场上 1 块牌');

    const geo = await ev(`(() => {
      const b = __game.block114.board.list()[0];
      const p = __game.pos();
      const yaw = __game.getYaw();
      const ex = p.x + Math.sin(yaw) * 2, ez = p.z + Math.cos(yaw) * 2;
      return {
        atCenter: __game.block114.board.blockShot(ex, ez),
        atPlayer: __game.block114.board.blockShot(p.x, p.z),
        farAway: __game.block114.board.blockShot(ex + 6, ez + 6),
        dist: +Math.hypot(b.x - p.x, b.z - p.z).toFixed(2),
        cdLeft: __game.block114.board.cdLeft(),
        cdMax: __game.block114.board.cdMax(),
      };
    })()`);
    console.log('     牌位判定: ' + JSON.stringify(geo));
    ok(geo && geo.atCenter === true, '牌心处 blockShot = true');
    ok(geo && geo.atPlayer === false, '玩家自己脚下不算撞牌（牌在身前 2 格）');
    ok(geo && geo.farAway === false, '远处不命中（不是「全场都挡」）');
    ok(geo && Math.abs(geo.dist - 2.0) < 0.05, `牌立在身前 2 格（实 ${geo && geo.dist}）`);
    ok(geo && geo.cdLeft > 0 && geo.cdLeft <= geo.cdMax && geo.cdMax === 26,
      '立完立刻进 26 秒冷却', geo && `${geo.cdLeft}/${geo.cdMax}`);
    ok(await ev('__game.pressSkill("board")') === false, '冷却中再按无效');

    // 升级到 3 级：一次两块 + 冷却更短
    await ev('__game.block114.grantBoard(3)');
    await sleep(250);
    ok(await ev('__game.block114.board.cdMax()') === 18, '3 级冷却 18 秒');
    ok(await ev('__game.block114.board.cap()') === 2, '3 级上限 2 块');
    ok(await ev('__game.block114.board.life()') === 10, '3 级持续 10 秒');

    // 清场 → 重新立两块
    await ev('__game.block114.board.reset()');
    await ev('__game.block114.grantBoard(3)');
    await sleep(200);
    await ev('__game.pressSkill("board")');
    await sleep(120);
    ok(await ev('__game.block114.board.count()') === 2, '3 级按下一次立两块');

    // ---------------- ⑤ 取景的 ----------------
    const camOk = await ev(`(() => {
      let c = __game.enemies.all().find((x) => x.type === 'camera');
      if (!c) c = __game.enemies.spawn('camera', { x: -5, z: 5 });
      return !!c;
    })()`);
    ok(camOk === true, '能刷出「取景的」');
    await sleep(4200);   // 让它至少走完一次前摇
    ok(await ev('__game.state === "playing"'), '取景的开完火之后游戏仍在进行（没崩）');
    const camInfo = await ev(`(() => {
      const c = __game.enemies.all().find((x) => x.type === 'camera');
      return c ? { state: c.state, hp: +c.hp.toFixed(1), dist: 1 } : null;
    })()`);
    ok(!!camInfo, '取景的还在场上', JSON.stringify(camInfo));

    // ---------------- ⑥ 零报错 ----------------
    ok(errs.length === 0, `没有 JS 报错（${errs.length}）`);
    if (errs.length) errs.slice(0, 6).forEach((e) => console.log('     ! ' + e));
  } catch (e) {
    console.log('  XX  异常: ' + e.message);
    fail++;
  } finally {
    try { ws && ws.close(); } catch (_) {}
    try { chrome.kill(); } catch (_) {}
  }
  console.log(`\n===== block123-cdp: ${pass} ✓ / ${fail} ✗ =====`);
  process.exit(fail ? 1 : 0);
})();
