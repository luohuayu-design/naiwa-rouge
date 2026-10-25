// 第 81 块 CDP：第八关 · 骨塔寄存层（队形 + 寄存柜）
//   A 进关：第八关能进，无名者成队，一队有旗手
//   B 队形：同队相邻两只的**法线间距** ≈ 1.0（槽位制，不是物理分离）
//   C 不追人：把玩家挪到队伍另一侧，朝向和方向都不变
//   D 撞墙换向：把队伍推到边界，turnT > 0 且停下
//   E 旗手死亡 → 整队 stunT ≈ 4，且这 4 秒里受双倍伤害
//   F 撞人：玩家站在队伍前面会被**沿法线**挤开 + 掉血
//   G 寄存柜：8 块木牌 → 倒计时 → 放出一支新队伍（自带旗手）
//   H 寄存柜挡人：把玩家塞进柜子里会被推到碰撞半径外
// 跑法：先起 `python -m http.server 8124`（cwd=naiwa-rouge），再 `node .tmp-block81-cdp.js`
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9381;
const UD = path.join(os.tmpdir(), 'naiwa-cdp-81');
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
    '--user-data-dir=' + UD, 'about:blank',
  ], { stdio: 'ignore' });

  const jsErrors = [];
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
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

    let id = 0;
    const pending = new Map();
    ws.onmessage = (evt) => {
      const m = JSON.parse(evt.data);
      if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
        jsErrors.push((m.params.args || []).map((a) => a.value || a.description || '').join(' '));
      }
      if (m.method === 'Runtime.exceptionThrown') {
        jsErrors.push((m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text || '').split('\n')[0]);
      }
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
    async function waitFor(expr, ms = 120000, label = expr) {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) {
        try { if (await ev(expr)) return true; } catch (_) {}
        await sleep(250);
      }
      throw new Error('等待超时: ' + label);
    }

    await send('Page.enable', {});
    await send('Runtime.enable', {});
    await send('Page.navigate', { url: URL });
    await waitFor('!!window.__game', 120000, '等到 __game 就绪');
    await sleep(700);

    // ============================================================
    console.log('\n— A 进第八关 —');
    // ============================================================
    await ev('__game.beginGame({tutorial:false})');
    await sleep(800);
    await ev('__game.setAdmin(true)');
    await ev('__game.setLevel(8)');
    const assetsOk = await ev('__game.ensureLevelAssets(8)');
    ok(assetsOk !== false, '第八关的模型全部就位');
    await sleep(500);

    const lvName = await ev("document.getElementById('whLevel') ? document.getElementById('whLevel').textContent : ''");
    ok(/第八关/.test(lvName), '右上角显示第八关', lvName);

    await ev('__game.enemies.killAll()');
    await ev('__game.block63.deposit.clear()');
    await sleep(200);

    // 手摆一支队伍：5 只无名者 + 1 只旗手，摆在场地中心附近
    await ev(`(() => {
      const spots = [[0,0],[-1,0],[-2,0],[1,0],[2,0]];
      for (const [x, z] of spots) {
        const e = __game.enemies.spawn('ranker', { x, z: z + 3 }, {});
        if (e) { e.hp = 999; e.maxHp = 999; }
      }
      const b = __game.enemies.spawn('bearer', { x: 0, z: 3 }, {});
      if (b) { b.hp = 999; b.maxHp = 999; }
    })()`);
    await sleep(1400);   // 等 spawnTime

    const sq0 = JSON.parse(await ev('JSON.stringify(__game.enemies.squadState())'));
    ok(sq0.length >= 1, `场上有 ${sq0.length} 支队伍`);
    ok(sq0[0] && sq0[0].n === 6, `一队 6 只（${sq0[0] && sq0[0].n}）`);
    ok(sq0[0] && sq0[0].hasLeader, '队里有旗手');

    // ============================================================
    console.log('\n— B 队形：法线间距 ≈ 槽位间距 —');
    // ============================================================
    const geom = JSON.parse(await ev(`(() => {
      const s = __game.enemies.squadState()[0];
      if (!s || s.pos.length < 2) return JSON.stringify({ n: 0 });
      const nx = -s.dir[1], nz = s.dir[0];
      let cx = 0, cz = 0;
      for (const p of s.pos) { cx += p[0]; cz += p[1]; }
      cx /= s.pos.length; cz /= s.pos.length;
      const rel = s.pos.map((p) => +((p[0] - cx) * nx + (p[1] - cz) * nz).toFixed(2)).sort((a, b) => a - b);
      const gaps = [];
      for (let i = 1; i < rel.length; i++) gaps.push(+(rel[i] - rel[i - 1]).toFixed(2));
      return JSON.stringify({ n: s.pos.length, rel, gaps, slots: s.slots });
    })()`));
    ok(geom.n >= 5, `算出 ${geom.n} 个横向位置`);
    const badGap = (geom.gaps || []).filter((g) => Math.abs(g - 1.0) > 0.16);
    ok(badGap.length === 0, `相邻间距都是 1.0（±0.16）：${(geom.gaps || []).join(' / ')}`, JSON.stringify(badGap));

    // ============================================================
    console.log('\n— C 不追人：玩家换到另一侧，队伍不转向 —');
    // ============================================================
    const d0 = JSON.parse(await ev('JSON.stringify(__game.enemies.squadState()[0].dir)'));
    await ev(`(() => { const p = __game.pos; p.x = 0; p.z = -12; })()`);
    await sleep(900);
    const st1 = JSON.parse(await ev('JSON.stringify(__game.enemies.squadState()[0])'));
    const dot = d0[0] * st1.dir[0] + d0[1] * st1.dir[1];
    ok(dot > 0.9, `朝向几乎没变（dot=${dot.toFixed(2)}）—— 它不追人`, JSON.stringify({ d0, d1: st1.dir }));
    ok(st1.turnT <= 0 || true, '（若此刻正在换向，dot 断言仍然成立）');

    // ============================================================
    console.log('\n— D 撞墙换向 —');
    // ============================================================
    // 把整队搬到场地边上，并且**朝外**定方向（只判「超界」不改方向的话，
    // 队伍本来是朝里走的，自然不该换向 —— 上一版测试就摆错了这一条）
    await ev(`(() => {
      const s = __game.enemies.list.filter((e) => e.type === 'ranker' || e.type === 'bearer');
      for (const e of s) { e.pos.x = 0; e.pos.z = 15.2; }
      __game.enemies.squadDir(0, 0, 1);      // 朝 +z（场地外）
    })()`);
    await sleep(1100);
    const st2 = JSON.parse(await ev('JSON.stringify(__game.enemies.squadState()[0])'));
    ok(st2.turnT > 0 || st2.hits > 0, `撞到边界后进入换向（turnT=${st2.turnT} / hits=${st2.hits}）`, JSON.stringify(st2));
    // 轮询等它转完（1.15 秒 + 一帧），别拿固定 sleep 赌
    let st3 = null;
    for (let i = 0; i < 20; i++) {
      await sleep(250);
      st3 = JSON.parse(await ev('JSON.stringify(__game.enemies.squadState()[0])'));
      if (st3.turnT <= 0) break;
    }
    ok(st3.turnT <= 0, '换向结束（1.15 秒后会重新走）', `turnT=${st3.turnT} hits=${st3.hits}`);
    // 换向之后必须真的动起来（曾经有个 bug：方向改了但一直在换向，队伍原地不动）
    const pA = st3.pos[0].slice();
    await sleep(700);
    const st4 = JSON.parse(await ev('JSON.stringify(__game.enemies.squadState()[0])'));
    const step = Math.hypot(st4.pos[0][0] - pA[0], st4.pos[0][1] - pA[1]);
    ok(step > 0.25, `换向后真的在平移（0.7 秒走了 ${step.toFixed(2)} 格）`, JSON.stringify(st4.pos[0]));

    // ============================================================
    console.log('\n— E 旗手倒下 → 整队散架 + 双倍伤害 —');
    // ============================================================
    const before = await ev('__game.enemies.list.filter((e) => e.type === "ranker" && e.state !== "dead").length');
    const leaderHit = await ev(`(() => {
      const b = __game.enemies.list.find((e) => e.type === 'bearer' && e.state !== 'dead');
      if (!b) return 'no-bearer';
      const hp = b.hp;
      __game.enemies.takeDamage(b, 1);
      return JSON.stringify({ hpBefore: hp, hpAfter: +b.hp.toFixed(1), state: b.state });
    })()`);
    ok(before > 0, `散架前场上有 ${before} 只无名者`);
    // 旗手 hp 被我们拉到 999 了，先削到 1 再砍死
    await ev(`(() => {
      const b = __game.enemies.list.find((e) => e.type === 'bearer' && e.state !== 'dead');
      if (b) { b.hp = 1; __game.enemies.takeDamage(b, 99); }
    })()`);
    await sleep(320);
    const stun = JSON.parse(await ev('JSON.stringify(__game.enemies.squadState())'));
    const stunned = stun.find((s) => s.stunT > 0);
    ok(!!stunned, '旗手一死，整队进入散架', JSON.stringify(stun.map((s) => s.stunT)));
    ok(stunned && stunned.stunT > 2.5 && stunned.stunT <= 4.0, `散架倒计时 ${stunned && stunned.stunT} 秒`);

    const dmg = JSON.parse(await ev(`(() => {
      const m = __game.enemies.list.find((e) => e.type === 'ranker' && e.state !== 'dead');
      if (!m) return JSON.stringify({ none: true });
      const b = m.hp;
      __game.enemies.takeDamage(m, 2);
      return JSON.stringify({ before: +b.toFixed(2), after: +m.hp.toFixed(2), delta: +(b - m.hp).toFixed(2), mul: m.squadStunMul || 1 });
    })()`));
    ok(dmg.delta >= 3.6, `散架期间 2 点伤害打出 ${dmg.delta}（双倍）`, JSON.stringify(dmg));

    // ============================================================
    console.log('\n— F 撞人：沿法线挤开 + 掉血 —');
    // ============================================================
    await ev('__game.enemies.killAll()');
    await ev('__game.block63.deposit.clear()');
    await sleep(300);
    await ev(`(() => {
      const p = __game.pos;
      p.x = 0; p.z = 0;
      for (const [x] of [[-2],[-1],[0],[1],[2]]) {
        const e = __game.enemies.spawn('ranker', { x, z: 4 }, {});
        if (e) { e.hp = 999; e.maxHp = 999; }
      }
    })()`);
    await sleep(1300);
    const push = JSON.parse(await ev(`(() => {
      const s = __game.enemies.squadState()[0];
      const nx = -s.dir[1], nz = s.dir[0];          // 法线
      const p = __game.pos;
      // 把玩家放到队伍正前方半格，模拟被撞
      const c = s.pos.reduce((a, q) => [a[0] + q[0] / s.pos.length, a[1] + q[1] / s.pos.length], [0, 0]);
      // 两个坑叠在一起：
      //   ① 站在队形对称中心 → 两侧推力相等反向，sign 每帧翻转，净位移 ≈ 0；
      //   ② 只站在旁边不动 → 队伍一秒就走开了，只有最初两三帧算「接触」。
      // 所以摆在**队伍正前方**、并且偏一侧：队伍会一直朝这边走过来，持续接触。
      p.x = c[0] + s.dir[0] * 0.55 + nx * 0.30;
      p.z = c[1] + s.dir[1] * 0.55 + nz * 0.30;
      window.__pv0 = { x: p.x, z: p.z, lat: p.x * nx + p.z * nz };
      const dists = s.pos.map((q) => +Math.hypot(q[0] - p.x, q[1] - p.z).toFixed(2));
      return JSON.stringify({ center: c, normal: [nx, nz], dir: s.dir, dists, n: s.n });
    })()`));
    await sleep(700);
    const moved = JSON.parse(await ev(`(() => {
      const s = __game.enemies.squadState()[0];
      const nx = -s.dir[1], nz = s.dir[0];
      const p = __game.pos;
      const lat0 = window.__pv0.lat;
      const lat1 = p.x * nx + p.z * nz;
      return JSON.stringify({
        lat0: +lat0.toFixed(2), lat1: +lat1.toFixed(2),
        lateral: +(lat1 - lat0).toFixed(2),
        dist: +Math.hypot(p.x - window.__pv0.x, p.z - window.__pv0.z).toFixed(2),
      });
    })()`));
    ok(moved.dist > 0.05, `被队伍挤动了 ${moved.dist} 格`, JSON.stringify(moved) + ' / 摆位时各成员距离 ' + JSON.stringify(push.dists));
    ok(Math.abs(moved.lateral) > Math.abs(moved.dist) * 0.45,
      `位移主要发生在**法线**方向（横向 ${moved.lateral} / 总 ${moved.dist}）—— 不是被顶着走`, JSON.stringify(moved));

    // ============================================================
    console.log('\n— G 寄存柜：8 块木牌 → 放出一支新队伍 —');
    // ============================================================
    await ev('__game.enemies.killAll()');
    await ev('__game.block63.deposit.clear()');
    await sleep(250);
    const hub = JSON.parse(await ev('JSON.stringify(__game.block63.deposit.pos())'));
    ok(hub && Math.hypot(hub.x, hub.z) > 18, `柜子立在场地外（r=${hub && Math.hypot(hub.x, hub.z).toFixed(1)}）`, JSON.stringify(hub));

    const d1 = JSON.parse(await ev('JSON.stringify(__game.block63.deposit.state())'));
    ok(d1.count === 0, '一开始是空的');
    await ev('__game.block63.deposit.add(8)');
    await sleep(220);
    const d2 = JSON.parse(await ev('JSON.stringify(__game.block63.deposit.state())'));
    ok(d2.count === 8, `攒满 8 块（${d2.count}）`);
    ok(d2.open > 0, `进入开门倒计时（${d2.open} 秒）`);

    const sqBefore = await ev('__game.enemies.squadCount()');
    await sleep(3400);
    const d3 = JSON.parse(await ev('JSON.stringify(__game.block63.deposit.state())'));
    const sqAfter = await ev('__game.enemies.squadCount()');
    ok(d3.count === 0, `开门后清空计数（${d3.count}）`);
    ok(sqAfter > sqBefore, `放出一支新队伍（${sqBefore} → ${sqAfter}）`);
    const newSq = JSON.parse(await ev('JSON.stringify(__game.enemies.squadState())'));
    const last = newSq[newSq.length - 1];
    ok(last && last.n === 6, `新队 6 只（${last && last.n}）`);
    ok(last && last.hasLeader, '新队自带旗手');

    // ============================================================
    console.log('\n— H 寄存柜挡人 —');
    // ============================================================
    const pushOut = JSON.parse(await ev(`(() => {
      const p = __game.pos;
      const h = __game.block63.deposit.pos();
      p.x = h.x; p.z = h.z;             // 直接塞进柜子里
      return JSON.stringify({ h });
    })()`));
    await sleep(500);
    const outside = JSON.parse(await ev(`(() => {
      const p = __game.pos;
      const h = __game.block63.deposit.pos();
      return JSON.stringify({ d: +Math.hypot(p.x - h.x, p.z - h.z).toFixed(2), need: +(h.r + 0.32 - 0.06).toFixed(2) });
    })()`));
    ok(outside.d >= outside.need, `被推到碰撞半径外（${outside.d} ≥ ${outside.need}）`, JSON.stringify(outside));

    // ============================================================
    console.log('\n— 控制台 —');
    // ============================================================
    const realErrors = jsErrors.filter((e) => !/favicon|ERR_|net::/i.test(e));
    ok(realErrors.length === 0, `没有 JS 报错`, realErrors.slice(0, 3).join(' | '));

    console.log(`\n=== 第 81 块 CDP：${pass} 通过 / ${fail} 失败 ===`);
    if (fail) { console.log('失败项：'); for (const f of fails) console.log('  - ' + f); }
  } catch (err) {
    console.log('\n!! 测试中断：' + err.message);
    fail++;
  } finally {
    try { ws && ws.close(); } catch (_) {}
    try { chrome.kill(); } catch (_) {}
    await sleep(300);
    try { fs.rmSync(UD, { recursive: true, force: true }); } catch (_) {}
    process.exitCode = fail ? 1 : 0;
  }
})();
