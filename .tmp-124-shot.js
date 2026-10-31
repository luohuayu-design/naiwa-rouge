// 第 124 块 · 第十四关「钟楼打样间」截图核对
//   ① 打样间地面（press 主题）+ 裁切刀预警带 / 落刀刀光
//   ② 两只新怪：错版（+ 它裂出来的小错版）/ 校对的
//   ③ 裁纸刀的刀光
// 前置：python -m http.server 8124（cwd = naiwa-rouge）
// 运行：node .tmp-124-shot.js   → C:/Users/MECHREVO/AppData/Local/Temp/naiwa-block124
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9352;
const UD = path.join(process.env.TEMP || '/tmp', 'naiwa-cdp-124shot');
const OUT = 'C:/Users/MECHREVO/AppData/Local/Temp/naiwa-block124';
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
      while (Date.now() - t0 < ms) { if (await ev(expr)) return true; await sleep(120); }
      return false;
    };

    await send('Runtime.enable');
    await send('Page.enable');
    await send('Page.navigate', { url: URL });
    await waitFor('!!window.__game', 90000);
    await sleep(1500);
    // 三个浮层按 350ms 链逐个关（公告 → 签到 → 宣传）
    await ev('if (__game.notice.open()) __game.notice.hide(); 1');
    await sleep(400);
    await ev('if (__game.sign.open()) __game.sign.hide(); 1');
    await sleep(400);
    await ev('if (__game.promo.open()) __game.promo.hide(); 1');
    await sleep(300);
    await ev('__game.setPendingLevel(14)');
    await ev('(async () => { await __game.beginGame({ tutorial: false }); return 1; })()');
    await sleep(2500);

    await ev('__game.setWaves(false); 1');
    // 留一只场外看门狗：把场上清空会直接触发回合结算链（随机事件卡会盖住整个画面）
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
    await ev('__game.warp(0, 0); 1');
    await sleep(900);
    await shot('a1-press.png');

    // 裁切刀预警：站到带子前面（第一刀切位是 z = -7），预中段亮、落刀那一瞬拍刀光
    await ev('__game.block114.cutter.reset(); __game.block114.cutter.trigger(); 1');
    await waitFor('__game.block114.cutter.state().phase === "warn"', 3000);
    const band0 = await ev('JSON.stringify(__game.block114.cutter.state().active[0])');
    console.log('  第一刀 = ' + band0);
    const b0 = JSON.parse(band0);
    // 站在带子「靠近镜头这一侧」1.6 格处，带子正好横在视野中段
    await ev(`__game.warp(${b0.axis === 0 ? 0 : b0.slot + 1.6}, ${b0.axis === 0 ? b0.slot + 1.6 : 0}); 1`);
    await waitFor('__game.block114.cutter.state().t > 0.95', 4000);
    console.log('  warn = ' + await ev('JSON.stringify(__game.block114.cutter.state())'));
    await shot('a2-cutter-warn.png');
    await waitFor('__game.block114.cutter.state().phase === "slice" || __game.block114.cutter.state().phase === "recover"', 4000);
    await shot('a3-cutter-slice.png');
    await sleep(900);

    // 两只新怪摆到面前
    await clearField();
    await ev('__game.warp(0, 0); 1');
    await ev('__game.enemies.spawn("misprint", { x: 2.4, z: 1.9 }); 1');
    await ev('__game.enemies.spawn("proofreader", { x: -2.6, z: 1.7 }); 1');
    await ev(`__game.enemies.all().forEach(e => { if (e !== window.__keeper && e.type !== 'proofreader') e.state = 'idle'; }); 1`);
    await sleep(1600);
    await shot('a4-newmobs.png');

    // 错版分裂现场：打死它，两张半成品
    await ev(`(() => {
      const m = __game.enemies.all().find((e) => e.type === 'misprint');
      if (m) { m.state = 'chase'; m.hp = m.maxHp = 100; __game.enemies.takeDamage(m, 9999); }
      return 1;
    })()`);
    await sleep(500);
    await shot('a5-split.png');

    // 裁纸刀刀光：买 3 级，面前站一只厚血靶子，按下技能那一瞬截图
    await clearField();
    await ev('__game.warp(0, 0); 1');
    await ev(`(() => {
      const p = __game.pos(), yaw = __game.getYaw();
      const t = __game.enemies.spawn('warrior', { x: p.x + Math.sin(yaw) * 3, z: p.z + Math.cos(yaw) * 3 });
      if (t) { t.state = 'chase'; t.maxHp = 200; t.hp = 200; t.attackCd = 1e9; t.root.rotation.y = yaw + Math.PI; }
      return 1;
    })()`);
    await ev('__game.block114.grantGuillotine(3); 1');
    await sleep(600);
    console.log('  press = ' + await ev('__game.pressSkill("guillotine")'));
    await sleep(90);
    await shot('a6-guillotine.png');
    console.log('  cuts = ' + await ev('__game.block114.guillotine.totalCuts()'));
  } catch (e) {
    console.log('ERR ' + e.message);
  } finally {
    try { ws && ws.close(); } catch (_) {}
    try { chrome.kill(); } catch (_) {}
  }
})();
