// 第 82 块 CDP：并联体实时间距/加血 + 电弧无视无敌帧 + 井蛙数值 + 木鱼灵追踪泡 + 第九关称量官
//   A 并联体 hp = 12（原 3.2）
//   B 三只几乎重叠 → 实时两两间距收敛到 ≥ minGap（8 格）
//   C 电弧命中：普通伤害吃无敌帧、电弧不吃（iframe 不重置、照样掉血）
//   D 井蛙 hp = 8、舌头拖拽 pull = 4.5（用户定「改到 8，4.5」）
//   E 木鱼灵吐泡：泡会追人、能被砍爆、命中把人定住
//   F 第九关称量官：上称 → 全场叠层 → 砍掉当场清零
// 跑法：先起 `python -m http.server 8124`（cwd=naiwa-rouge），再 `node .tmp-block82-cdp.js`
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9382;
const UD = path.join(os.tmpdir(), 'naiwa-cdp-82');
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
      }
      else if (d.method === 'Log.entryAdded' && d.params.entry.level === 'error') {
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
    await sleep(700);

    await ev('__game.beginGame({tutorial:false})');
    await sleep(800);
    // ⚠️ 不能开管理员：hurtPlayer 在 adminOn 时直接 return，电弧掉不了血
    await ev('__game.setAdmin(false)');
    await ev('__game.setLevel(6)');
    await ev('__game.ensureLevelAssets(6)');
    await sleep(500);
    await ev('__game.enemies.killAll()');
    await ev('__game.stats.hp.cur = __game.stats.get("maxHp")');

    // ============================================================
    console.log('\n— A 并联体 hp = 12 —');
    // ============================================================
    const arcCfg = JSON.parse(await ev('JSON.stringify({ hp: __game.enemyTypes.arc.hp, minGap: __game.enemyTypes.arc.arc.minGap })'));
    ok(arcCfg.hp === 12, `并联体 hp = 12（原 3.2，实际 ${arcCfg.hp}）`);
    ok(arcCfg.minGap === 8, `minGap = 8（原 3.0，实际 ${arcCfg.minGap}）`);

    // ============================================================
    console.log('\n— B 三只几乎重叠 → 实时间距收敛到 ≥ 8 格 —');
    // ============================================================
    await ev('__game.enemies.killAll()');
    await sleep(300);
    await ev(`(() => {
      for (const [x, z] of [[0, 0], [0.6, 0], [0.3, 0.5]]) {
        const e = __game.enemies.spawn('arc', { x, z }, {});
        if (e) { e.hp = 999; e.maxHp = 999; e.speed = 0; }   // 钉死不动，只测分离
      }
    })()`);
    await sleep(2600);   // 让分离力收住（硬约束收敛快）
    const gaps = JSON.parse(await ev('JSON.stringify(__game.enemies.arcGaps())'));
    const minGap = Math.min(...gaps);
    console.log(`    [诊断] 实时两两间距 = [${gaps.join(', ')}]，最小 ${minGap}`);
    ok(gaps.length === 3, `3 只 → 3 个两两间距（实际 ${gaps.length}）`);
    ok(minGap >= 8 - 0.3, `实时最小间距 ≥ 8 格（实际 ${minGap}，留浮点余量）`);

    // ============================================================
    console.log('\n— C 电弧无视无敌帧 —');
    // ============================================================
    await ev('__game.enemies.killAll()');
    await sleep(300);
    // 摆两只并联体在玩家两侧，让一条电弧横跨玩家站立点；玩家站到线上
    await ev(`(() => {
      __game.pos.x = 0; __game.pos.z = 0;
      const a = __game.enemies.spawn('arc', { x: -5, z: 0 }, {});
      const b = __game.enemies.spawn('arc', { x: 5, z: 0 }, {});
      if (a) { a.hp = 999; a.maxHp = 999; a.speed = 0; }
      if (b) { b.hp = 999; b.maxHp = 999; b.speed = 0; }
    })()`);
    // 并联体的 spawn 状态被电弧网排除（不画线），必须等它升起来
    await waitFor('__game.enemies.arcNodes() >= 2', 15000, '等两只并联体从地下升起来');
    await waitFor('__game.enemies.arcLines() >= 1', 15000, '等电弧网连上（至少一条线）');
    // ⚠️ 电弧每 0.7s 一下，等线连上的这几秒已经把 6 点血打得只剩 1 点 —— 测掉血前先把血池垫高
    const beefUp = `__game.stats.addMod({ stat: 'maxHp', flat: 60, src: 'cdp82' }); __game.stats.hp.cur = __game.stats.get('maxHp');`;
    await ev(beefUp);
    // 诊断：确认运行时状态
    const diagC = JSON.parse(await ev(`JSON.stringify({
      state: __game.state,
      pos: { x: +__game.pos.x.toFixed(2), z: +__game.pos.z.toFixed(2) },
      nodes: __game.enemies.arcNodes(),
      lines: __game.enemies.arcLines(),
      gaps: __game.enemies.arcGaps(),
      hp: __game.stats.hp.cur,
    })`));
    console.log('    [C 诊断]', JSON.stringify(diagC));
    const hp0 = await ev('__game.stats.hp.cur');
    const iframe0 = await ev('__game.iframe()');
    await sleep(1300);   // 电弧节流 0.7s，命中若干次
    const hp1 = await ev('__game.stats.hp.cur');
    const iframe1 = await ev('__game.iframe()');
    console.log(`    [诊断] hp ${hp0} → ${hp1}，iframe ${iframe0} → ${iframe1}`);
    ok(hp1 < hp0, `电弧命中扣了血（${hp0} → ${hp1}）`);
    // 电弧不该触发/重置无敌帧：普通伤害会设 iframe>0，电弧命中后 iframe 应仍 ≈ 0
    ok(iframe1 <= 0.05, `电弧没有触发无敌帧（iframe 仍为 ${iframe1}）`);

    // 关键：iframe > 0 期间电弧仍应掉血（普通伤害会被 iframe 挡掉，电弧不行）
    await ev(beefUp);                    // 重新回满，别让上一段把血打空
    await ev(`__game.setIframe(1.5)`);   // 手动把无敌帧顶到 1.5 秒
    const hpa = await ev('__game.stats.hp.cur');
    const ifa = await ev('__game.iframe()');
    await sleep(900);                    // 电弧节流 0.7s，至少命中一次
    const hpb = await ev('__game.stats.hp.cur');
    console.log(`    [诊断] iframe ${ifa} 期间 hp ${hpa} → ${hpb}`);
    ok(hpb < hpa, `无敌帧生效期间电弧照样扣血（${hpa} → ${hpb}）`);

    // ============================================================
    console.log('\n— D 井蛙 hp=12 / 拖拽 pull=6 —');
    // ============================================================
    const wf = JSON.parse(await ev('JSON.stringify({ hp: __game.enemyTypes.wellfrog.hp, pull: __game.enemyTypes.wellfrog.tongue.pull })'));
    ok(wf.hp === 8, `井蛙 hp = 8（原 5，实际 ${wf.hp}）`);
    ok(wf.pull === 4.5, `井蛙舌头拖拽 pull = 4.5 格/秒（原 3，实际 ${wf.pull}）`);

    // ============================================================
    console.log('\n— E 木鱼灵：吐追踪泡（会追 / 能爆 / 命中定住）—');
    // ============================================================
    await ev('__game.enemies.killAll()');
    await ev(beefUp);
    await sleep(300);
    await ev(`(() => {
      __game.pos.x = 0; __game.pos.z = 0;
      const e = __game.enemies.spawn('woodfish', { x: 6, z: 0 }, {});
      if (e) { e.hp = 999; e.maxHp = 999; e.speed = 0; }   // 钉在原地，只测泡
    })()`);
    await waitFor('__game.enemies.bubbleCount() > 0', 15000, '等到木鱼灵吐出第一颗泡');
    const bub0 = JSON.parse(await ev('JSON.stringify(__game.enemies.bubbles())'));
    ok(bub0.length >= 1, `场上有了泡（${bub0.length} 颗）`);
    ok(bub0[0].hp > 0, `泡有血（${bub0[0].hp}）—— 能打爆`);

    // 泡会追人：玩家挪远，泡到玩家的直线距离应当变小
    await ev('__game.pos.x = -8; __game.pos.z = -8;');
    const bp0 = JSON.parse(await ev('JSON.stringify(__game.enemies.bubbles())'))[0];
    const d0 = Math.hypot(bp0.x + 8, bp0.z + 8);
    await sleep(900);
    const bp1 = JSON.parse(await ev('JSON.stringify(__game.enemies.bubbles())'))[0];
    const d1 = bp1 ? Math.hypot(bp1.x + 8, bp1.z + 8) : 0;
    console.log(`    [诊] 泡到玩家的距离 ${d0.toFixed(2)} → ${d1.toFixed(2)}`);
    ok(bp1 ? d1 < d0 : true, `泡在朝玩家追（${d0.toFixed(2)} → ${d1.toFixed(2)}）`);

    // 泡能被砍爆
    const popped = await ev(`(() => {
      const b = __game.enemies.bubbles()[0];
      if (!b) return -1;
      const before = __game.enemies.bubbleCount();
      __game.enemies.hitBubbles(b.x, b.z, 0.8, 999);
      return before - __game.enemies.bubbleCount();
    })()`);
    ok(popped === 1, `一记重击就能打爆泡（打爆 ${popped} 颗）`);

    // 命中把人定住
    await ev('__game.setIframe(0)');
    await ev(`(() => {
      __game.pos.x = 0; __game.pos.z = 0;
      const e = __game.enemies.spawn('woodfish', { x: 3, z: 0 }, {});
      if (e) { e.hp = 999; e.maxHp = 999; e.speed = 0; e.attackCd = 0; }
    })()`);
    await waitFor('__game.enemies.bubbleCount() > 0', 15000, '等到第二颗泡吐出来');
    await waitFor('__game.rootT() > 0', 18000, '等泡追上并定住主角');
    const rootState = JSON.parse(await ev('JSON.stringify({ rootT: __game.rootT(), speed: __game.stats.get("moveSpeed") })'));
    console.log('    [诊] 定住状态', JSON.stringify(rootState));
    ok(rootState.rootT > 0, `被定住了（rootT ${rootState.rootT}）`);
    await waitFor('__game.rootT() === 0', 12000, '等定住自己解除');
    ok(await ev('__game.rootT() === 0'), '定住会自己解除（不会永远走不动）');

    // ============================================================
    console.log('\n— F 第九关称量官：上称 → 全场叠层 → 砍掉清零 —');
    // ============================================================
    await ev('__game.enemies.killAll()');
    await sleep(300);
    await ev('__game.setLevel(9)');
    await ev('__game.ensureLevelAssets(9)');
    await sleep(800);
    await ev('__game.enemies.killAll()');
    await ev(beefUp);
    await sleep(200);
    const lv9 = JSON.parse(await ev(`JSON.stringify({
      level: __game.levelId,
      theme: __game.levelDef(9).theme,
      arena: __game.levelDef(9).arena,
      rounds: __game.levelDef(9).rounds.length,
      types: __game.levelTypes(9),
    })`));
    console.log('    [诊] 第九关', JSON.stringify(lv9));
    ok(String(lv9.level) === '9', `切到了第九关（levelId ${lv9.level}）`);
    ok(lv9.rounds === 20, `第九关 20 回合（实际 ${lv9.rounds}）`);
    ok(lv9.theme === 'registry', `主题是 registry（实际 ${lv9.theme}）`);
    ok(lv9.types.includes('weigher'), '第九关的怪种表里有称量官');

    await ev(`(() => {
      __game.pos.x = 0; __game.pos.z = 0;
      const w = __game.enemies.spawn('weigher', { x: 9, z: 0 }, {});
      if (w) { w.hp = 999; w.maxHp = 999; }
      for (const [x, z] of [[-4, 0], [-3, 2], [-5, -2]]) {
        const e = __game.enemies.spawn('minion', { x, z }, {});
        if (e) { e.hp = 999; e.maxHp = 999; e.speed = 0; }
      }
    })()`);
    await waitFor('__game.enemies.weighTier() > 0', 22000, '等第一次上称');
    const t1 = JSON.parse(await ev(`JSON.stringify({
      tier: __game.enemies.weighTier(),
      named: __game.enemies.namedCount(),
      rings: __game.enemies.namedRingCount(),
      dmg: __game.enemies.list.filter((e) => e.named).map((e) => ({ n: e.named, d: +e.damage.toFixed(2), d0: e.dmg0 }))[0],
    })`));
    console.log('    [诊] 第一次上称', JSON.stringify(t1));
    ok(t1.tier === 1, `层数 = 1（实际 ${t1.tier}）`);
    ok(t1.named >= 3, `全场都被记名了（${t1.named} 只，含称量官自己）`);
    ok(t1.rings >= 3, `被记名的怪脚下有金环（${t1.rings} 只）`);
    ok(!!(t1.dmg && t1.dmg.d > t1.dmg.d0), `伤害被抬上去了（${t1.dmg && t1.dmg.d0} → ${t1.dmg && t1.dmg.d}）`);

    await waitFor('__game.enemies.weighTier() >= 2', 22000, '等第二次上称');
    ok(await ev('__game.enemies.weighTier() >= 2'), '层数是累加的（第二次上称 → 2 层）');

    await ev(`(() => {
      const w = __game.enemies.list.find((e) => e.cfg.weigh);
      if (w) __game.enemies.takeDamage(w, 99999, false, { quiet: true });
    })()`);
    await sleep(700);
    const after = JSON.parse(await ev(`JSON.stringify({
      tier: __game.enemies.weighTier(),
      named: __game.enemies.namedCount(),
      rings: __game.enemies.namedRingCount(),
    })`));
    console.log('    [诊] 称量官倒下后', JSON.stringify(after));
    ok(after.tier === 0, `层数当场清零（${after.tier}）`);
    ok(after.named === 0 && after.rings === 0, `金环也一起碎了（named ${after.named} / rings ${after.rings}）`);

    // ============================================================
    console.log('\n— 收尾：无 JS 报错 —');
    // ============================================================
    const realErrors = jsErrors.filter((e) => !/favicon|404|Failed to load resource/i.test(e));
    ok(realErrors.length === 0, '页面没有 JS 报错', realErrors.slice(0, 3).join(' | '));

    console.log('\n' + '─'.repeat(56));
    if (fail) {
      console.log(`第 82 块 CDP：${pass} 通过 / ${fail} 失败`);
      console.log('失败项：\n  ' + fails.join('\n  '));
    } else {
      console.log(`第 82 块 CDP：${pass} 通过 / 0 失败 · 全绿`);
    }
  } catch (e) {
    console.error('✗ 测试脚本异常：', e.message);
    if (jsErrors.length) console.error('JS 报错：', jsErrors.slice(0, 5));
    fail++;
  } finally {
    try { ws && ws.close(); } catch (_) {}
    chrome.kill();
    process.exit(fail ? 1 : 0);
  }
})();
