// 第 97 块 · CDP 冒烟
//   A. hittable()：躺尸 / 出生中的怪不再吃伤害（用户第 6 条）
//   B. 盖章人：进射程就起手钉方印
//   C. 方印钉的是「你此刻的位置」—— 站着不动被封印（移速 50%），提前走开就不吃
//   D. 盖章人很脆（2.6 血，一下就没）
// 跑法：先起 `python -m http.server 8124`（cwd=naiwa-rouge），再
//       `node .tmp-97-cdp.js`
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9397;
const UD = path.join(os.tmpdir(), 'naiwa-cdp-97');
const URL = 'http://127.0.0.1:8124/index.html?debug=1&title&keepsave=1';

let pass = 0, fail = 0;
const fails = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; fails.push(name + (extra ? ' → ' + extra : '')); console.log('  ✗ ' + name + (extra ? ' → ' + extra : '')); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  fs.rmSync(UD, { recursive: true, force: true });
  const chrome = spawn(CHROME, [
    '--headless=new', '--remote-debugging-port=' + PORT, '--num-raster-threads=2',
    '--enable-unsafe-swiftshader', '--no-first-run', '--no-default-browser-check',
    '--disable-dev-shm-usage', '--disable-background-timer-throttling',
    '--window-size=430,932', '--user-data-dir=' + UD, 'about:blank',
  ], { stdio: 'ignore' });

  const jsErrors = [];
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
    ws.onmessage = (m) => {
      const d = JSON.parse(m.data);
      if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
      else if (d.method === 'Runtime.exceptionThrown') {
        jsErrors.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text);
      }
    };
    const send = (method, params = {}) => new Promise((res) => {
      const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params }));
    });
    await send('Runtime.enable'); await send('Page.enable');
    async function ev(expr) {
      const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
      return r.result?.result?.value;
    }
    async function waitFor(expr, ms, why) {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) {
        try { if (await ev(expr)) return true; } catch (_) { /* 未就绪 */ }
        await sleep(120);
      }
      throw new Error('等超时：' + why);
    }
    async function settle(max = 60) {
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
      return (await ev('__game.state')) === 'playing';
    }

    await send('Page.navigate', { url: URL });
    await waitFor('!!window.__game', 90000, '__game 就绪');
    await sleep(600);
    await ev(`(() => { const x = document.getElementById('noticeX'); if (x) x.click(); return 1; })()`);
    // 第 94 块那条 350ms 定时器链：公告 → 签到 → 宣传有礼
    for (const sel of ['#noticeX', '#signX', '#promoX']) {
      await ev(`(() => { const x = document.querySelector('${sel}'); if (x) x.click(); return 1; })()`);
      await sleep(450);
    }

    console.log('—— 开一局第九关 ——');
    await ev('__game.setPendingLevel(9)');
    await ev('(async () => { await __game.beginGame({ tutorial: false }); return 1; })()');
    await sleep(1500);
    await settle();
    ok(await ev('__game.state') === 'playing', '进入 playing');
    ok(await ev('__game.levelId') === 9, '当前是第九关', String(await ev('__game.levelId')));
    // 冻住波次：只测我们自己造的靶子，但它不会结束回合（不能 kill 清场，清空即回合结束 → 世界冻结）
    await ev('__game.setWaves(true)');
    await sleep(300);

    // ---------------------------------------------------------- A. hittable
    // 用重启体：① 它是用户第 6 条报的那只 ② 只有它进 'down'（会读 e.cfg.reboot，
    // 拿战士硬设 down 会每帧抛 TypeError —— 这是测试姿势问题，不是产品 bug）
    console.log('\n—— A. 躺尸的怪不再吃伤害 ——');
    await ev(`__game.warp(0, 0)`);
    await sleep(200);
    ok(await ev(`__game.block63.enemies.spawn('reboot', 6, 6)`) === 'reboot', '造了一只重启体');
    await sleep(300);
    // 钉血到 2，避免一击致死干扰读数；同时把它按进躺尸态
    await ev(`(() => { const e = __game.block63.enemies.live('reboot'); if (e) { e.hp = 2; e.maxHp = 2; e.state = 'down'; e.t = 0; } return 1; })()`);
    await sleep(150);
    const hpDown0 = await ev(`(__game.block63.enemies.live('reboot') || {}).hp`);
    await ev(`__game.block63.enemies.kill('reboot')`);
    await sleep(250);
    const hpDown1 = await ev(`(__game.block63.enemies.live('reboot') || {}).hp`);
    ok(hpDown0 === 2 && hpDown1 === 2, `state='down' 时打不动（${hpDown0} → ${hpDown1}）`);

    // 对照：同一只改回 chase 就打得动
    await ev(`(() => { const e = __game.block63.enemies.live('reboot'); if (e) { e.state = 'chase'; e.t = 0; } return 1; })()`);
    await sleep(150);
    await ev(`__game.block63.enemies.kill('reboot')`);
    await sleep(400);
    const chaser = await ev(`(() => {
      const e = __game.block63.enemies.live('reboot');
      return e ? { hp: +e.hp.toFixed(2), state: e.state } : null;
    })()`);
    ok(chaser === null || chaser.hp <= 0 || chaser.state === 'down',
      `state='chase' 时正常吃伤害 → 血被清空（${JSON.stringify(chaser)}）`);

    // spawn 态同样免疫
    ok(await ev(`__game.block63.enemies.spawn('reboot', -6, -6)`) === 'reboot', '再造一只重启体');
    await sleep(250);
    await ev(`(() => { const e = __game.block63.enemies.live('reboot'); if (e) { e.hp = 3; e.maxHp = 3; e.state = 'spawn'; } return 1; })()`);
    await sleep(120);
    const hpSp0 = await ev(`(__game.block63.enemies.live('reboot') || {}).hp`);
    await ev(`__game.block63.enemies.kill('reboot')`);
    await sleep(250);
    const hpSp1 = await ev(`(__game.block63.enemies.live('reboot') || {}).hp`);
    ok(hpSp0 === 3 && hpSp1 === 3, `state='spawn' 时也打不动（${hpSp0} → ${hpSp1}）`);
    // 改回 chase 让它死掉，别留脏
    await ev(`(() => { const e = __game.block63.enemies.live('reboot'); if (e) { e.state = 'chase'; e.t = 0; } return 1; })()`);
    await sleep(150);
    await ev(`__game.block63.enemies.kill('reboot')`);
    await sleep(300);

    // ---------------------------------------------------------- B/C. 盖章人
    console.log('\n—— B. 盖章人：起手就钉方印 ——');
    await ev(`(() => {
      window.__S = () => __game.block63.enemies.live('stamper');
      window.__armStamp = () => {
        const e = window.__S();
        if (!e) return false;
        e.speed = 0; e.state = 'chase'; e.t = 0; e.attackCd = 0;
        return true;
      };
      return true;
    })()`);
    await ev(`__game.warp(0, 0)`);
    await sleep(200);
    ok(await ev(`__game.block63.enemies.spawn('stamper', 0, -5.5)`) === 'stamper', '盖章人出生在主角正前方 5.5 格');
    await waitFor('!!window.__S()', 8000, '盖章人活体可读');
    // spawn 状态不行动，先推到 chase
    await ev(`__game.block63.enemies.set('stamper', { state: 'chase', speed: 0, t: 0, attackCd: 0 })`);
    await sleep(200);
    ok(await ev(`(__game.curse() || {}).factor`) === 1, '起手前主角没被封印');

    console.log('\n—— C. 方印钉的是「你此刻的位置」 ——');
    // 先测「走开就不吃」：起手后立刻跑开
    await ev(`window.__armStamp()`);
    await sleep(420);                       // 起手 1.15 秒后才落印，这时候跑还来得及
    await ev(`__game.warp(9, 9)`);          // 切比雪夫距离远大于 1.55
    await sleep(1500);
    const far = await ev(`__game.curse()`);
    ok(far && far.t <= 0 && far.factor === 1, '落印前跑出方框 → 不被封印', JSON.stringify(far));

    // 再测「站着不动就吃」：回到原位，等它冷却完再起手
    await ev(`__game.warp(0, 0)`);
    await sleep(300);
    await ev(`__game.block63.enemies.place('stamper', 0, -5.5)`);
    await ev(`__game.block63.enemies.set('stamper', { state: 'chase', speed: 0, t: 0, attackCd: 0 })`);
    await sleep(200);
    let hit = null;
    for (let i = 0; i < 40; i++) {
      await ev(`window.__armStamp()`);
      await sleep(150);
      const c = await ev(`__game.curse()`);
      if (c && c.t > 0) { hit = c; break; }
    }
    ok(!!hit, '站着不动 → 方印落下时被封印', hit ? JSON.stringify(hit) : '4 秒内没吃到');
    ok(!!hit && hit.factor === 0.5, `封步系数是 0.5（实际 ${hit && hit.factor}）`);
    ok(!!hit && hit.t > 1.5 && hit.t <= 3.0, `封印时长 3 秒（读到 ${hit && hit.t}）`);

    // ---------------------------------------------------------- D. 脆
    console.log('\n—— D. 盖章人很脆 ——');
    await ev(`__game.block63.enemies.set('stamper', { state: 'chase' })`);
    await sleep(150);
    const spHp = await ev(`(__game.block63.enemies.live('stamper') || {}).hp`);
    ok(spHp != null && spHp <= 3, `身上只有 ${spHp} 血（两下就没）`);
    await ev(`__game.block63.enemies.kill('stamper')`);
    await sleep(500);
    ok(await ev(`(__game.block63.enemies.live('stamper') || null) === null`), '打死之后不再是活体');

    // ---------------------------------------------------------- 收尾
    console.log('\n—— 收尾 ——');
    ok(jsErrors.length === 0, '全程没有 JS 异常', jsErrors.slice(0, 3).join(' | '));
    ok(await ev('__game.state') === 'playing' || (await ev('__game.state')) === 'clear',
      `跑完仍在局内（${await ev('__game.state')}）`);

    console.log('\n------------------------------');
    if (fail === 0) console.log(`第 97 块 CDP：全绿 ${pass}/${pass + fail}`);
    else {
      console.log(`第 97 块 CDP：${pass} 通过 / ${fail} 失败`);
      for (const f of fails) console.log('  - ' + f);
    }
  } catch (e) {
    console.log('\n✗ 脚本异常：' + (e && e.message ? e.message : e));
    fail++;
  } finally {
    try { if (ws) ws.close(); } catch (_) { /* 忽略 */ }
    try { chrome.kill(); } catch (_) { /* 忽略 */ }
  }
  process.exit(fail === 0 ? 0 : 1);
})();
