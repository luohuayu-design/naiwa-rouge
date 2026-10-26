// 第 83 块 · 冒烟测试：第八关新机制（掉牌 / 封柜 / 召唤看守 / 四位数字取牌 / 教程）
// 跑法：先起 `python -m http.server 8124`（cwd=naiwa-rouge），再 `node .tmp-83-smoke.js`
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9383;
const UD = path.join(os.tmpdir(), 'naiwa-cdp-83smoke');
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
    ws.onmessage = (m) => {
      const d = JSON.parse(m.data);
      if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
      else if (d.method === 'Runtime.exceptionThrown') {
        jsErrors.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text);
      } else if (d.method === 'Log.entryAdded' && d.params.entry.level === 'error') {
        jsErrors.push(d.params.entry.text);
      }
    };
    const send = (method, params = {}) => new Promise((res) => {
      const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params }));
    });
    await send('Runtime.enable');
    await send('Log.enable');
    await send('Page.enable');

    async function ev(expr) {
      const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
      return r.result?.result?.value;
    }
    async function waitFor(expr, ms, why) {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) {
        try { if (await ev(expr)) return true; } catch (_) {}
        await sleep(120);
      }
      throw new Error('等超时：' + why);
    }

    await send('Page.navigate', { url: URL });
    await waitFor('!!window.__game', 90000, '等到 __game 就绪');
    await sleep(600);

    // ---------- 0. 数据结构 ----------
    console.log('\n[0] 数据 / 代码结构');
    ok(await ev('__game.levelDef(8).order.every(([t]) => t !== "ranker" && t !== "bearer")'), '第八关 order 里没有 ranker/bearer');
    ok(await ev('!!__game.enemyTypes.warden'), 'enemyTypes 里有 warden');
    ok(await ev('!__game.enemyTypes.ranker && !__game.enemyTypes.bearer'), 'enemyTypes 里已无 ranker/bearer');
    ok(await ev('__game.levelDef(8).order.every(([t]) => __game.levelDef(8).rounds.every(r => r[t] === undefined || typeof r[t] === "number"))'), '回合表键名合法');
    const lt = await ev('__game.levelTypes(8)');
    ok(Array.isArray(lt) && lt.includes('warden'), 'levelTypes(8) 含 warden（召唤物也要预载）', JSON.stringify(lt));
    ok(await ev('__game.levelDef(8).deposit.summon === "warden"'), 'deposit.summon = warden');
    ok(await ev('__game.enemyTypes.warden.animFamily === "brute"'), 'warden 用 brute 动画族');

    // ---------- 1. 开局 + 第八关 ----------
    console.log('\n[1] 进第八关');
    await ev('__game.beginGame({tutorial:false})');
    await sleep(900);
    await ev('__game.setLevel(8)');
    await sleep(600);
    // 老 CDP 的过渡态处理：wtut / hint / meet 都要点掉
    for (let i = 0; i < 30; i++) {
      const st = await ev('__game.state');
      if (st === 'playing') break;
      if (st === 'wtut') await ev('document.getElementById("wtSkip").click()');
      else if (st === 'hint') await ev('document.getElementById("hiOk").click()');
      else if (st === 'meet') await ev('document.getElementById("mtOk").click()');
      await sleep(250);
    }
    ok(await ev('__game.state === "playing"'), '进入 playing', await ev('__game.state'));
    ok(await ev('!!__game.block63.deposit'), '调试口 block63.deposit 在');
    const st0 = await ev('__game.block63.deposit.state()');
    ok(st0.cap === 8, '柜子容量 8', JSON.stringify(st0));
    ok(st0.count === 0, '开局柜子是空的');

    // ---------- 2. 任何怪死都掉牌 ----------
    console.log('\n[2] 掉牌');
    await ev('__game.block63.deposit.clear()');
    await ev('(() => { const p = __game.pos(); __game.block63.enemies.spawn("warrior", p.x + 1.4, p.z); return true; })()');
    await sleep(1600);
    // 小兵自爆撞人；用 takeDamage 直接打更稳
    const before = await ev('__game.block63.deposit.count()');
    const killed = await ev('__game.block63.enemies.kill("warrior")');
    console.log('    打死', killed, '只战士');
    await sleep(500);
    const after = await ev('__game.block63.deposit.count()');
    ok(after > before, '普通怪（战士）死了也掉牌', `${before} → ${after}`);

    // ---------- 3. 满 8 封柜 → 5 秒后召唤看守 ----------
    console.log('\n[3] 封柜 / 召唤');
    await ev('__game.block63.deposit.clear()');
    await ev('__game.block63.deposit.add(7)');
    ok(await ev('__game.block63.deposit.state().locked') === false, '7 块还没封柜');
    await ev('__game.block63.deposit.add(1)');
    const stLock = await ev('__game.block63.deposit.state()');
    ok(stLock.locked === true, '第 8 块 → 立刻封柜', JSON.stringify(stLock));
    ok(stLock.lock > 4.0 && stLock.lock <= 5.01, '封柜倒计时约 5 秒', String(stLock.lock));
    // 按钮文案由主循环每帧刷新，addTag 之后要等一帧才读得到（别在同一帧里断言）
    await sleep(200);
    ok(await ev('document.getElementById("depositBtn").textContent.includes("封柜")'), '按钮变成「封柜 x.x」');
    const stillAdd = await ev('__game.block63.deposit.add(1)');
    ok(stillAdd === 8, '封柜后不再收牌', String(stillAdd));
    await waitFor('__game.block63.deposit.state().locked === false', 9000, '等封柜结束');
    await sleep(400);
    const ws1 = await ev('__game.block63.enemies.warden()');
    ok(Array.isArray(ws1) && ws1.length >= 1, '看守被召唤出来了', JSON.stringify(ws1));
    ok(ws1[0] && ws1[0].maxHp > 20, '看守吃回合倍率（血量 > 基础 20）', ws1[0] && String(ws1[0].maxHp));
    ok(await ev('__game.block63.deposit.count() === 0'), '召唤后柜子归零');

    // ---------- 4. 三套攻击（按距离带） ----------
    console.log('\n[4] 三套攻击');
    // 把场上的看守拉住，玩家站到它身边 2 格 → 应该走横扫
    await ev('(() => { const p = __game.pos(); __game.block63.enemies.place("warden", p.x + 2.0, p.z); __game.block63.enemies.set("warden", { speed: 0, wdGap: 0 }); return true; })()');
    await sleep(2600);
    const nearMoves = await ev('__game.block63.enemies.warden().map(w => w.move)');
    ok(nearMoves.includes('sweep'), '贴脸 → 横扫', JSON.stringify(nearMoves));
    // 拉到 6 格 → 砸地（会钉出 3 个金圈）
    await ev('(() => { const p = __game.pos(); __game.block63.enemies.place("warden", p.x + 6.0, p.z); __game.block63.enemies.set("warden", { wdGap: 0, state: "chase" }); return true; })()');
    await waitFor('__game.block63.enemies.strikes().length > 0', 6000, '等砸地钉圈');
    const strikes = await ev('__game.block63.enemies.strikes()');
    ok(strikes.length >= 3, '砸地一次钉三个圈', String(strikes.length));
    // 拉到 12 格 → 投牌
    await ev('(() => { const p = __game.pos(); __game.block63.enemies.place("warden", p.x + 12.0, p.z); __game.block63.enemies.set("warden", { wdGap: 0, state: "chase" }); return true; })()');
    await sleep(1400);
    const farMoves = await ev('__game.block63.enemies.warden().map(w => w.move)');
    ok(farMoves.includes('tag') || (await ev('__game.block63.enemies.tags()')) > 0, '远距 → 投木牌', JSON.stringify(farMoves));

    // ---------- 5. 半血狂暴只触发一次 ----------
    // 半血狂暴只触发一次
    console.log('\n[5] 半血暴怒');
    // 第 4 步为了固定距离把 speed 设成了 0，这里先给回一个可见的速度，
    // 才能验证「暴怒 ×1.4」真的落到了 e.speed 上。阈值是 45%，所以打 40%。
    await ev('(() => { const e = __game.block63.enemies.live("warden"); e.speed = 2.0; e.hp = e.maxHp * 0.40; return true; })()');
    await sleep(700);
    const ws2 = await ev('__game.block63.enemies.warden()');
    ok(ws2[0] && ws2[0].raged === true, '血低于 45% → raged', JSON.stringify(ws2[0]));
    ok(ws2[0] && Math.abs(ws2[0].speed - 2.8) < 0.001, '暴怒把移速抬到 1.4 倍', String(ws2[0] && ws2[0].speed));
    await ev('(() => { const e = __game.block63.enemies.live("warden"); e.hp = e.maxHp * 0.2; return true; })()');
    await sleep(500);
    const ws3 = await ev('__game.block63.enemies.warden()');
    ok(ws3[0] && Math.abs(ws3[0].speed - 2.8) < 0.001, '再掉血不会再叠一次加速', `${ws3[0] && ws3[0].speed} vs 2.8`);

    // ---------- 6. 取牌：按钮 / 面板 / 输错 / 输对 ----------
    console.log('\n[6] 四位数字取牌');
    await ev('__game.block63.enemies.kill()');
    await sleep(300);
    await ev('__game.block63.deposit.clear()');
    await ev('__game.block63.deposit.add(5)');
    // 站到柜边
    await ev('(() => { const p = __game.block63.deposit.pos(); __game.warp(p.x, p.z + 2.4); return true; })()');
    await sleep(600);
    ok(await ev('__game.block63.deposit.state().near === true'), '站到柜边 → near');
    const btnOn = await ev('document.getElementById("depositBtn").classList.contains("on")');
    ok(btnOn, '取牌按钮出现');
    ok(await ev('!document.getElementById("depositBtn").disabled'), '取牌按钮可点');
    await ev('document.getElementById("depositBtn").click()');
    await sleep(400);
    ok(await ev('document.getElementById("codePanel").classList.contains("on")'), '面板打开');
    ok(await ev('__game.state === "playing"'), '面板不冻结世界（还是 playing）');
    const code = await ev('__game.block63.deposit.code()');
    ok(/^[1-9]\d{3}$/.test(String(code)), '给了四位数字', String(code));
    ok(await ev('document.getElementById("cpWant").textContent') === String(code), '面板上显示的就是这串数字');
    // 点键盘 4 下
    for (const d of String(code).slice(0, 3)) {
      await ev(`document.querySelector('#cpKeys button[data-k="${d}"]').click()`);
      await sleep(80);
    }
    ok(await ev('__game.block63.deposit.typed().length') === 3, '敲了三位');
    ok(await ev('__game.block63.deposit.count()') === 5, '没输满四位不判定、柜子不动');
    // 输错
    await ev('__game.block63.deposit.wrong()');
    await sleep(900);
    ok(await ev('document.getElementById("codePanel").classList.contains("on")') === false, '输错 → 面板关掉');
    ok(await ev('__game.block63.deposit.count()') === 5, '输错不清柜');
    ok(await ev('__game.block63.deposit.cd()') > 0, '输错后有冷却');
    // 冷却完再来，输对
    await sleep(3300);
    await ev('__game.block63.deposit.open()');
    await sleep(300);
    await ev('__game.block63.deposit.solve()');
    await sleep(1200);
    ok(await ev('__game.block63.deposit.count()') === 0, '输对 → 柜里牌子全清', String(await ev('__game.block63.deposit.count()')));
    ok(await ev('__game.state === "playing"'), '取完还在 playing');

    // ---------- 7. 超时 ----------
    console.log('\n[7] 超时');
    await ev('__game.block63.enemies.kill()');      // 清场：这 12 秒别被怪打断
    await sleep(200);
    await ev('__game.block63.deposit.add(3)');
    await ev('__game.warp(__game.block63.deposit.pos().x, __game.block63.deposit.pos().z + 2.4)');
    await sleep(200);
    const opened7 = await ev('__game.block63.deposit.open()');
    ok(opened7 === true, '面板能打开');
    await sleep(500);
    ok(await ev('__game.block63.deposit.left()') <= 12, '倒计时在走');
    await sleep(12500);
    console.log('    超时后：state=' + (await ev('__game.state'))
      + ' left=' + (await ev('__game.block63.deposit.left()'))
      + ' panelOn=' + (await ev('document.getElementById("codePanel").classList.contains("on")')));
    ok(await ev('document.getElementById("codePanel").classList.contains("on")') === false, '超时 → 面板关掉');
    ok(await ev('__game.block63.deposit.count()') === 3, '超时不清柜');

    // ---------- 8. 教程（&hints） ----------
    console.log('\n[8] 第八关教程');
    ok(jsErrors.length === 0, '全程无 JS 报错', jsErrors.slice(0, 3).join(' | '));
  } catch (err) {
    console.log('\n!! 异常：' + err.message);
    fail++;
  } finally {
    console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
    if (fails.length) console.log(fails.map((f) => '  - ' + f).join('\n'));
    try { ws && ws.close(); } catch (_) {}
    try { chrome.kill(); } catch (_) {}
    setTimeout(() => process.exit(fail ? 1 : 0), 400);
  }
})();
