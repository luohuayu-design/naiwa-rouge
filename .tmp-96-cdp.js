// 第 96 块 · 寄存处看守五招 CDP 冒烟
//   ① 五招都能出来：横扫（贴脸）/ 砸地·木牌雨（中距）/ 投牌（远距・会拐弯）/ 砸柜（长冷却）
//   ② 扇形是**真的有方向**：站正面吃伤害，站背后（同距离）完全不吃
//   ③ 扇面朝向锁在出手那一刻：形/角/半角与画面同源
//   ④ 追踪牌：ang 会转、turnLeft 会耗尽、耗尽后不再转（「拐一次就直」）
//   ⑤ 砸柜：真的放出小怪，且 cabCap 挡得住滚雪球
//   ⑥ 出手间隔吃 haste（第 91 块传了没用，这轮补上）
// 跑法：先起 `python -m http.server 8124`（cwd=naiwa-rouge），再 `node .tmp-96-cdp.js`
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9398;
const UD = path.join(os.tmpdir(), 'naiwa-cdp-96');
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
    let list = null;
    for (let i = 0; i < 60; i++) {
      try { list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); break; }
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

    console.log('—— ① 开一局（第一关，关掉波次） ——');
    // ⚠️ 不能开管理员沙盒：它让主角免疫一切伤害（main.js hurtPlayer 里 adminOn 直接 return），
    // 那样「扇形吃不吃伤害」根本测不出来。改成关掉波次生成 + 清场，只留自己造的靶子。
    // 用第八关：① warrior / archer 的模型这一关预载好了（砸柜要真放得出来）
    //           ② 场上有真的寄存柜，砸柜走的是 depositHub 那条正路
    await ev(`__game.setPendingLevel(8)`);
    await ev(`(async () => { await __game.beginGame({ tutorial: false }); return 1; })()`);
    await sleep(1200);
    await settle();
    await ev(`__game.setWaves(true)`);     // 不再生成新的波次怪
    await ev(`__game.block63.enemies.kill()`);   // 清掉开局已有的
    await ev(`__game.block63.deposit.clear()`);  // 杀怪会掉牌，柜子满了会再召一只来捣乱
    await sleep(400);
    ok(await ev('__game.state') === 'playing', '进入 playing，且已冻结波次');
    ok(await ev('__game.isPaused()') === true, 'isPaused 为真（只有波次被冻，怪仍会行动）');

    // 造一只看守 + 工具函数
    await ev(`(() => {
      window.__W = () => __game.block63.enemies.live('warden');
      // 反复把它退回 chase 并让冷却归零，直到它选中想要的招
      window.__force = (want, dist) => {
        const e = window.__W();
        if (!e) return false;
        const p = __game.pos();
        // 放在主角的 −Z 侧：主角就正好在它的「正前方」，扇形角度 = 0，断言好写
        e.pos.x = p.x; e.pos.z = p.z - (dist == null ? 6 : dist);
        e.speed = 0;
        e.state = 'chase'; e.t = 0; e.hitDone = false; e.wdMove = '';
        e.wdGap = 0;
        e.wdCabinetCd = want === 'cabinet' ? 0 : 999;   // 不测砸柜时把它锁死
        return true;
      };
      return true;
    })()`);
    await ev(`__game.warp(0, 0)`);
    await sleep(200);
    ok(await ev(`__game.block63.enemies.spawn('warden', 0, 6)`) === 'warden', '看守生成了');
    await waitFor(`!!window.__W()`, 8000, '看守活体可读');
    // ② 段只是「选招」测试，会挨很多下 —— 先把伤害压到 0.2（一个都打不死人），
    // 到需要看掉血的 ③ 段再拉高。
    await ev(`(() => { const e = window.__W(); e.damage = 0.2; e.hp = e.maxHp; return e.damage; })()`);
    await sleep(300);

    async function pickMove(want, dist, tries = 40) {
      for (let i = 0; i < tries; i++) {
        await ev(`window.__force(${JSON.stringify(want)}, ${dist})`);
        await sleep(70);
        const mv = await ev(`(__game.block63.enemies.warden()[0] || {}).move`);
        if (mv === want) return true;
      }
      return false;
    }

    console.log('—— ② 五招齐备 ——');
    const seen = new Set();
    // 贴脸 2 格 → 横扫
    ok(await pickMove('sweep', 2), '贴脸（2 格）能选中横扫');
    seen.add('sweep');
    // 中距 6 格 → 砸地 / 木牌雨 两种都该出现过
    let sawSlam = false, sawFan = false;
    for (let i = 0; i < 40 && !(sawSlam && sawFan); i++) {
      await ev(`window.__force('slam', 6)`);
      await sleep(70);
      const mv = await ev(`(__game.block63.enemies.warden()[0] || {}).move`);
      if (mv === 'slam') sawSlam = true;
      if (mv === 'fan') sawFan = true;
    }
    ok(sawSlam, '中距（6 格）会出砸地');
    ok(sawFan, '中距（6 格）会出木牌雨（同一距离不再固定一招）');
    if (sawSlam) seen.add('slam');
    if (sawFan) seen.add('fan');
    // 远距 12 格 → 投牌
    ok(await pickMove('tag', 12), '远距（12 格）能选中投牌');
    seen.add('tag');
    // 砸柜
    ok(await pickMove('cabinet', 7), '砸柜能选中（独立冷却）');
    seen.add('cabinet');
    ok(seen.size === 5, `五招都出现过（${[...seen].join(' / ')}）`, [...seen].join(','));

    // ---------------------------------------------------------------- ③ 扇形
    console.log('—— ③ 扇形木牌雨：正面吃伤害，背后不吃 ——');
    // ⚠️ 主角死了世界就冻住，落点圈永远不结算 —— 会表现成「扇形一点伤害都不打」。
    // 所以每段开始都先回满并确认还在 playing。
    await ev(`__game.stats.heal(999)`);
    await ev(`(() => { const e = window.__W(); e.damage = 5; e.hp = 999; return e.damage; })()`);
    ok(await ev('__game.state') === 'playing', `② 段打完世界还在跑（主角 ${await ev('+__game.stats.hp.cur.toFixed(1)')} 血）`);

    async function fanRun(playerZ) {
      // 看守在 (0,0)，主角在 (0,0)+... 先站到正前方 6 格，让它锁方向
      await ev(`__game.warp(0, 6)`);
      await sleep(120);
      // 中距是「砸地 / 木牌雨」各一半，所以要重试到真的抽中扇形为止。
      // 一旦扇面出现就立刻停手 —— 再 __force 会把它打回 chase，扇面就没了。
      let st = null;
      for (let i = 0; i < 60; i++) {
        await ev(`window.__force('fan', 6)`);
        await sleep(70);
        st = await ev(`__game.block63.enemies.strikes().filter((s) => s.fan)[0] || null`);
        if (st) break;
      }
      if (!st) throw new Error('60 次都没抽中扇形');
      // 方向已经锁死，现在把主角挪到想要的位置
      await ev(`__game.setIframe(0)`);
      const hp0 = await ev(`+__game.stats.hp.cur.toFixed(2)`);
      await ev(`__game.warp(0, ${playerZ})`);
      // ⚠️ 不能按墙钟睡：无头渲染帧率低，主循环 dt 被夹在 0.05，
      // 于是「游戏里的 0.95 秒」可能等于墙上 2 秒 —— 睡固定的毫秒会读早。
      // 改成盯 strikes：扇形一被消费掉（splice 出去）就说明真的结算过了。
      let resolved = false;
      const t0 = Date.now();
      while (Date.now() - t0 < 12000) {
        const n = await ev(`__game.block63.enemies.strikes().filter((s) => s.fan).length`);
        if (n === 0) { resolved = true; break; }
        await sleep(80);
      }
      const hp1 = await ev(`+__game.stats.hp.cur.toFixed(2)`);
      return { st, hp0, hp1, resolved, drop: +(hp0 - hp1).toFixed(2) };
    }

    const front = await fanRun(6);
    ok(front.st && front.st.fan === true, '扇面落点带 fan 标记');
    ok(front.st && Math.abs(front.st.r - 8.6) < 1e-6, `扇面半径 ${front.st && front.st.r} = cfg.fanR`);
    ok(front.st && Math.abs(front.st.half - Math.PI / 4) < 1e-3,
      `扇面半角 ${front.st && front.st.half} ≈ π/4（正面 90°）`);
    ok(front.st && Math.abs(front.st.angle) < 1e-3,
      `方向锁在出手那一刻（主角当时在正前方，angle=${front.st && front.st.angle}）`);
    ok(front.resolved, '扇面已经结算（strikes 里那条被消费掉）');
    ok(front.drop > 3, `站在正面 6 格：吃到伤害，掉了 ${front.drop} 点（hp ${front.hp0} → ${front.hp1}）`);

    // 背后同距离：必须一点不掉
    await ev(`__game.stats.heal(999)`);
    await ev(`__game.block63.enemies.set('warden', { hp: 999 })`);   // 别被主角自动攻击打死
    const back = await fanRun(-6);
    ok(back.st && back.st.fan === true, '第二发也是扇形');
    ok(back.resolved, '第二发扇面也真的结算了（不是没打出去）');
    ok(back.drop < 0.01, `站在背后 6 格（同距离、同扇面）：一点没掉（掉 ${back.drop}）—— 这一招真的有方向`);

    // ---------------------------------------------------------------- ④ 追踪牌
    console.log('—— ④ 投牌：会拐一次弯，拐完就直 ——');
    await ev(`__game.stats.heal(999)`);
    await ev(`(() => { const e = window.__W(); e.hp = 999; e.damage = 5; return 1; })()`);
    await ev(`__game.warp(0, 0)`);
    await sleep(150);
    await ev(`window.__force('tag', -13)`);   // 看守放到 (0, 13)，牌子朝 -Z 飞
    await waitFor(`__game.block63.enemies.tags() > 0`, 4000, '木牌飞出来');
    const t0 = await ev(`__game.block63.enemies.tagList()[0]`);
    // 立刻把主角甩到牌子**背后**（(0,20)）：
    //   ① 需要转 ~180°，远超 1.15 的转向预算 → 一定能验「预算会耗尽」
    //   ② 距离越飞越远 → 不会 0.2 秒就引爆，采得到完整曲线
    await ev(`__game.warp(0, 20)`);
    const samples = [];
    for (let i = 0; i < 12; i++) {
      await sleep(110);
      const t = await ev(`__game.block63.enemies.tagList()[0] || null`);
      if (!t) break;
      samples.push(t);
    }
    ok(samples.length >= 4, `采到 ${samples.length} 帧飞行数据`);
    const last = samples[samples.length - 1];
    if (t0 && last) {
      const dAng = Math.abs(last.ang - t0.ang);
      ok(dAng > 0.5, `朝向真的变了（${t0.ang} → ${last.ang}，转了 ${dAng.toFixed(2)} rad）`);
      ok(dAng < 1.4, `但没转成「无限追踪」（只转了 ${dAng.toFixed(2)} rad ≈ ${Math.round(dAng * 180 / Math.PI)}°）`);
      ok(last.turnLeft <= 0.02, `转向预算耗尽（剩 ${last.turnLeft}）`);
      // 耗尽之后角度必须冻住 —— 这就是「拐完就直」
      const frozen = samples.filter((s) => s.turnLeft <= 0.02);
      const angs = frozen.map((s) => s.ang);
      ok(angs.length >= 2 && Math.max(...angs) - Math.min(...angs) < 1e-6,
        `预算用完后朝向不再变化（采到 ${angs.length} 帧，最大波动 ${(Math.max(...angs) - Math.min(...angs)).toExponential(1)}）`);
    } else {
      ok(false, '没采到完整的飞行数据');
    }
    // 等它落地，别污染下一段
    await waitFor(`__game.block63.enemies.tags() === 0`, 6000, '木牌落地');

    // ---------------------------------------------------------------- ⑤ 砸柜
    console.log('—— ⑤ 砸柜：放小怪，且有上限 ——');
    await ev(`__game.stats.heal(999)`);
    ok(await ev('__game.state') === 'playing', '④ 段打完世界还在跑');
    await ev(`__game.block63.enemies.kill()`);   // 清掉刚才放出的一切
    await ev(`__game.block63.deposit.clear()`);
    await sleep(400);
    await ev(`__game.block63.enemies.spawn('warden', 0, 8)`);
    await waitFor(`!!window.__W()`, 6000, '新看守');
    await ev(`(() => { const e = window.__W(); e.hp = 999; e.speed = 0; e.damage = 5; return 1; })()`);
    const countMinions = `__game.block63.enemies.list().filter((e) => (e.type === 'warrior' || e.type === 'archer') && e.state !== 'dead').length`;
    const m0 = await ev(countMinions);
    await ev(`window.__force('cabinet', 8)`);
    await waitFor(`(__game.block63.enemies.warden()[0] || {}).move === 'cabinet'`, 4000, '进入砸柜');
    await sleep(2000);   // 前摇 1.2 + 落地
    const m1 = await ev(countMinions);
    ok(m1 - m0 === 2, `砸柜放出 2 只小怪（${m0} → ${m1}）`, String(m1 - m0));

    // 再砸一次：2 + 2 = 4 会撞上 cap 3，所以只该多 1 只
    await ev(`(() => { const e = window.__W(); e.wdCabinetCd = 0; e.state = 'chase'; e.t = 0; e.hitDone = false; e.wdMove = ''; e.wdGap = 0; return 1; })()`);
    await waitFor(`(__game.block63.enemies.warden()[0] || {}).move === 'cabinet'`, 4000, '第二次砸柜');
    await sleep(2000);
    const m2 = await ev(countMinions);
    ok(m2 === 3, `cabCap=3 挡住了滚雪球（第二次只多 ${m2 - m1} 只，共 ${m2}）`);
    // 第三次：一只都不该多
    await ev(`(() => { const e = window.__W(); e.wdCabinetCd = 0; e.state = 'chase'; e.t = 0; e.hitDone = false; e.wdMove = ''; e.wdGap = 0; return 1; })()`);
    await sleep(2600);
    const m3 = await ev(countMinions);
    ok(m3 === 3, `满额之后砸柜不再产怪（仍是 ${m3} 只）`);

    // ---------------------------------------------------------------- ⑥ haste
    console.log('—— ⑥ 出手间隔吃 haste（第 91 块漏掉的） ——');
    await ev(`__game.stats.heal(999)`);
    ok(await ev('__game.state') === 'playing', '⑤ 段打完世界还在跑');
    await ev(`__game.block63.enemies.kill()`);
    await ev(`__game.block63.deposit.clear()`);
    await sleep(300);
    await ev(`__game.block63.enemies.spawn('warden', 0, 3)`);
    await waitFor(`!!window.__W()`, 6000, '新看守');
    // haste 1.5 → gap 应该从 2.0 掉到 1.33；不这样做的话读到的永远是 2.0
    await ev(`(() => { const e = window.__W(); e.hp = 999; e.speed = 0; e.damage = 0.5; e.haste = 1.5; return e.haste; })()`);
    await ev(`window.__force('sweep', 2)`);
    await waitFor(`(__game.block63.enemies.warden()[0] || {}).move === 'sweep'`, 4000, '进入横扫');
    // 等这一招打完回到 chase，立刻读 wdGap（它每帧都在减，所以只抓刚落地那一瞬）
    await waitFor(`(__game.block63.enemies.warden()[0] || {}).state === 'chase'`, 4000, '横扫结束');
    const g = await ev(`+((__game.block63.enemies.warden()[0] || {}).gap || 0)`);
    ok(g > 0, `读到出手间隔 ${g} 秒`);
    ok(g < 1.75, `间隔被 haste 压到 ${g} 秒（2.0/1.5=1.33；不吃 haste 会是 2.0）`);
    ok(g >= 1.05, `且没跌破 floor 1.1 秒（${g}）`);

    // ---------------------------------------------------------------- 收尾
    ok(jsErrors.length === 0, '全程没有 JS 异常', jsErrors.slice(0, 2).join(' | '));
    console.log(`\n通过 ${pass} / 失败 ${fail}`);
    if (fail) { console.log('失败项：'); for (const f of fails) console.log('  - ' + f); }
  } catch (e) {
    console.log('\n脚本异常：' + e.message);
    console.log(jsErrors.slice(0, 4).join('\n'));
    fail++;
  } finally {
    try { if (ws) ws.close(); } catch (_) { /* 忽略 */ }
    try { chrome.kill(); } catch (_) { /* 忽略 */ }
    process.exit(fail ? 1 : 0);
  }
})();
