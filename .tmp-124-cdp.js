// 第 124 块 · 第十四关「钟楼打样间」+ 裁纸刀 —— 无头 Chrome 行为测试
//   ① 进第十四关、裁切刀启用、参数/切位对得上
//   ② 裁切刀：站安全位不吃刀；站到带心上真的掉 12% 最大血
//   ③ 裁切刀：怪也吃这一刀（不是只打人）
//   ④ 错版：死时分裂两只 45% 血的小错版，且只分一代
//   ⑤ 校对：读条完给「血最厚的那只」挂批注，受伤 ×1.35
//   ⑥ 裁纸刀：技能栏多一格 / 按下真切到人 / 30% 最大生命 / 立刻进冷却
//   ⑦ 全程零 JS 报错
// 前置：python -m http.server 8124（cwd = naiwa-rouge）
// 运行：node .tmp-124-cdp.js
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9351;
const UD = path.join(process.env.TEMP || '/tmp', 'naiwa-cdp-124bd');
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
    // 轮询：等某个表达式变真（按毫秒 sleep 等游戏事件不可靠，dt 被夹 0.05）
    const waitFor = async (expr, ms = 8000, step = 60) => {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) {
        if (await ev(expr)) return true;
        await sleep(step);
      }
      return false;
    };

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Page.navigate', { url: URL });
    for (let i = 0; i < 90; i++) {
      if (await ev('!!window.__game')) break;
      await sleep(400);
    }
    ok(await ev('!!window.__game'), '页面起来了');

    // ---------------- ① 进第十四关 ----------------
    await ev('__game.setPendingLevel(14)');
    await ev('(async () => { await __game.beginGame({ tutorial: false }); return 1; })()');
    await sleep(1800);
    ok(await ev('__game.state === "playing"'), '进了战斗态', await ev('__game.state'));
    ok((await ev('__game.level.level.name')).includes('钟楼打样间'), '当前关卡 = 钟楼打样间', await ev('__game.level.level.name'));
    ok(await ev('__game.block114.cutter.on()') === true, '裁切刀已启用');
    const spec = await ev('JSON.stringify(__game.block114.cutter.spec())');
    const sp = spec ? JSON.parse(spec) : {};
    console.log('     裁切刀参数: ' + JSON.stringify({ width: sp.width, warn: sp.warn, gap: sp.gap, slots: sp.slots, pct: sp.playerPct }));
    ok(sp.width === 1.30, '刀带宽度 1.30（判定与画面同源）', sp.width);
    ok(sp.playerPct === 0.12, '玩家吃最大生命 12%', sp.playerPct);
    ok(sp.warn === 1.25, '预警 1.25 秒', sp.warn);
    ok(Array.isArray(sp.slots) && sp.slots.length === 4, '四个切位轮换', sp.slots && sp.slots.length);
    ok(sp.enemyPct > 0, '怪也有份（enemyPct > 0）', sp.enemyPct);

    // 冻波次 + 清场：后面的数值断言都不希望被路过的小怪干扰
    // ⚠️ **别把场上清空**（第 124 块自己踩到的坑）：清空会触发回合结算链
    // （随机事件 → 三选一 → 商店），gameState 一离开 'playing'，
    // takeDamage 和 pressSkill 就全部静默失效 —— 断言会以「没掉血 / 按不动」的形式假红，
    // 现场看起来像技能坏了，其实是面板正开着。留一只场外角落的看门狗，回合永远清不掉。
    await ev('__game.setWaves(false)');
    await ev(`(() => {
      const k = __game.enemies.spawn('warrior', { x: -30, z: -30 });
      if (k) { k.state = 'chase'; k.maxHp = 30; k.hp = 30; k.attackCd = 1e9; k.hasSpawned = true; }
      window.__keeper = k;
      return !!k;
    })()`);
    const parkKeeper = () => ev('(() => { const k = window.__keeper; if (k) { k.pos.x = -30; k.pos.z = -30; } return 1; })()');
    const clearField = async (ms = 1400) => {
      await ev('__game.enemies.all().forEach(e => { if (e !== window.__keeper) __game.enemies.takeDamage(e, 9999); }); 1');
      await sleep(ms);
      await parkKeeper();
    };
    await clearField();
    ok(await ev('__game.state === "playing"') === true, '清场后仍是 playing（看门狗留着，没进结算链）', await ev('__game.state'));
    await ev('__game.block114.cutter.reset()');

    // ---------------- ② 安全位 / 带心 ----------------
    await ev('__game.warp(0, 0)');
    await ev('__game.heal.fill()');
    // (0,0) 离四个切位最近也有 2.3 格 > 带半宽 0.65 + 身位 → 永远安全
    await ev('__game.block114.cutter.trigger()');
    ok(await waitFor('__game.block114.cutter.state().phase === "warn"', 3000), 'trigger 之后进预警');
    const s1 = await ev('JSON.stringify(__game.block114.cutter.state())');
    console.log('     预警态: ' + s1);
    await waitFor('__game.block114.cutter.state().phase === "idle"', 6000);
    const safeHits = await ev('JSON.stringify(__game.block114.cutter.hits())');
    ok(JSON.parse(safeHits).player === 0, '站在 (0,0) 没被切到', safeHits);
    const hpSafe = await ev('__game.heal.hp()');
    ok(hpSafe.cur === hpSafe.max, '血还是满的（安全位真的安全）', `${hpSafe.cur}/${hpSafe.max}`);

    // 站到带心上：下一刀的切位在预警开始那一刻才定，所以先 trigger、进 warn 再挪过去。
    // ⚠️ 跑两轮取「最干净」的那一轮：波次会从场地边上继续冒怪（debugNoWaves 只挡住新一波，
    // 已经开打的那一波照刷），一只自爆小兵撞上来就会让「掉血」多出两三倍 —— 断言会假红。
    let band = null, hp0 = null, hp1 = null, cutHits = null, lost = 0, best = Infinity;
    for (let attempt = 0; attempt < 2; attempt++) {
      await clearField(700);
      await ev('__game.warp(0, 0)');
      await ev('__game.block114.cutter.reset()');
      await ev('__game.block114.cutter.trigger()');
      await waitFor('__game.block114.cutter.state().phase === "warn"', 3000);
      band = await ev(`(() => {
        const st = __game.block114.cutter.state();
        const a = (st.active && st.active[0]) || { axis: 0, slot: 0 };
        return { axis: a.axis, slot: a.slot };
      })()`);
      await ev(`__game.warp(${band.axis === 0 ? 0 : band.slot}, ${band.axis === 0 ? band.slot : 0})`);
      await ev('__game.heal.fill()');
      hp0 = (await ev('__game.heal.hp()'));
      await waitFor('__game.block114.cutter.state().phase !== "warn"', 6000);
      await sleep(260);
      hp1 = (await ev('__game.heal.hp()'));
      cutHits = JSON.parse(await ev('JSON.stringify(__game.block114.cutter.hits())'));
      const d = +(hp0.cur - hp1.cur).toFixed(2);
      if (d > 0 && d < best) best = d;
      lost = d;
      if (Math.abs(d - hp0.max * 0.12) < hp0.max * 0.04) break;
    }
    console.log('     这一刀: ' + JSON.stringify(band));
    console.log(`     血 ${hp0.cur}/${hp0.max} → ${hp1.cur}/${hp1.max}`);
    const nearList = await ev(`(() => { const p = __game.pos(); return __game.enemies.all().map((e) => ({ t: e.type, st: e.state, d: +Math.hypot(e.pos.x - p.x, e.pos.z - p.z).toFixed(1) })); })()`);
    console.log('     现场活跃怪: ' + JSON.stringify(nearList));
    ok(cutHits.player === 1, '站在带心上被切中一次', cutHits.player);
    ok(lost > 0, '真的掉血了', lost);
    ok(Math.abs(lost - hp0.max * 0.12) < hp0.max * 0.04,
      `掉的是「最大生命的 12%」（应 ${(hp0.max * 0.12).toFixed(2)}，实 ${lost}）`);

    // ---------------- ③ 怪也吃这一刀 ----------------
    await ev('__game.block114.cutter.reset()');
    await ev('__game.warp(0, 0)');
    await ev('__game.heal.fill()');
    await ev(`(() => {
      const e = __game.enemies.spawn('warrior', { x: 0, z: 0 });
      e.state = 'chase'; e.maxHp = 500; e.hp = 500; e.attackCd = 99;
      window.__cutterTgt = e;
      return !!e;
    })()`);
    await ev('__game.block114.cutter.trigger()');
    await waitFor('__game.block114.cutter.state().phase === "warn"', 3000);
    const band2 = await ev(`(() => {
      const a = __game.block114.cutter.state().active[0];
      return { axis: a.axis, slot: a.slot };
    })()`);
    // ⚠️ 怪在 chase 态会一直往玩家走 —— 预警刚起就摆上去，1.25 秒后它已经走出带子了。
    // 等预警快结束（t > 0.95）再摆，落刀那一瞬它还在带心上。
    await waitFor('(__game.block114.cutter.state().t > 0.95)', 4000, 40);
    await ev(`(() => { const e = window.__cutterTgt; e.pos.x = ${band2.axis === 0 ? 0 : band2.slot}; e.pos.z = ${band2.axis === 0 ? band2.slot : 0}; return 1; })()`);
    await waitFor('__game.block114.cutter.state().phase !== "warn"', 6000);
    await sleep(260);
    const ehp = await ev('+window.__cutterTgt.hp.toFixed(1)');
    const hits2 = JSON.parse(await ev('JSON.stringify(__game.block114.cutter.hits())'));
    ok(hits2.enemy >= 1, '怪也被切到了（onEnemyHit 计数 +1）', hits2.enemy);
    ok(ehp < 500, '那只怪真的掉血了', `500 → ${ehp}`);
    ok(await ev('__game.state === "playing"'), '切完游戏仍在进行');

    // ---------------- ④ 错版分裂 ----------------
    await clearField();
    const split = await ev(`(() => {
      const parent = __game.enemies.spawn('misprint', { x: 0, z: 6 });
      if (!parent) return null;
      parent.state = 'chase'; parent.maxHp = 100; parent.hp = 100;
      const before = __game.enemies.all().length;
      __game.enemies.takeDamage(parent, 9999);
      const kids = __game.enemies.all().filter((x) => x.splitDone === true);
      return {
        before,
        after: __game.enemies.all().length,
        kids: kids.length,
        kidMax: kids.map((k) => +k.maxHp.toFixed(1)),
        kidHeight: kids.map((k) => +k.height.toFixed(2)),
        parentMax: 100,
        kidNext: kids.map((k) => !!(k.cfg && k.cfg.split)),
      };
    })()`);
    console.log('     分裂结果: ' + JSON.stringify(split));
    ok(split && split.kids === 2, '错版死后裂成两只', split && split.kids);
    ok(split && split.kidMax.every((v) => Math.abs(v - 45) < 1.5),
      '小错版各 45% 血（100 → 45）', split && split.kidMax.join('/'));
    ok(split && split.kidHeight.every((v) => v < 1.35), '小错版体型更小', split && split.kidHeight.join('/'));
    // 只分一代：把小错版也打死，场上不再增加。
    // ⚠️ 「还活着」按 hp > 0 判，别按 state —— 尸体在 dying / dead 之间会挂一会儿，
    // 按 state 数会把刚裂出来的和刚死的混在一起（第 124 块自己踩过）。
    const gen2 = await ev(`(async () => {
      const alive = () => __game.enemies.all().filter((x) => x.type === 'misprint' && x.hp > 0);
      const n0 = alive().length;
      // ⚠️ 刚裂出来的小错版还在 'spawn' 态（spawnTime 0.7），那个状态免疫伤害 ——
      // 立刻 takeDamage 会被整下忽略，断言就会误判成「又分裂了一次」。
      for (const k of alive()) { k.state = 'chase'; }
      await new Promise((r) => setTimeout(r, 120));
      for (const k of alive()) __game.enemies.takeDamage(k, 9999);
      const n1 = alive().length;
      return { n0, n1 };
    })()`);
    console.log('     第二代: ' + JSON.stringify(gen2));
    ok(gen2 && gen2.n0 === 2 && gen2.n1 === 0, '小错版再死不再分裂（只分一代）', JSON.stringify(gen2));

    // ---------------- ⑤ 校对批注 ----------------
    await clearField();
    await ev('__game.warp(0, 0)');
    const proofSetup = await ev(`(() => {
      const p = __game.pos();
      const r = __game.enemies.spawn('proofreader', { x: p.x, z: p.z + 6 });
      const fat = __game.enemies.spawn('warrior', { x: p.x, z: p.z + 3 });
      const thin = __game.enemies.spawn('warrior', { x: p.x + 1.2, z: p.z + 3.2 });
      for (const e of [r, fat, thin]) {
        if (!e) continue;
        e.state = 'chase'; e.attackCd = 0;
      }
      fat.maxHp = 400; fat.hp = 400;
      thin.maxHp = 90; thin.hp = 90;
      // 两只战士只是「靶子」，不许真打人 —— attackCd 拉到 99，
      // 否则等读条的十几秒里主角会被它们砍死，一死 hurtPlayer 就整体 return，断言全假红。
      fat.attackCd = 99; thin.attackCd = 99;
      window.__proofR = r; window.__proofFat = fat; window.__proofThin = thin;
      return { r: !!r, fat: !!fat, thin: !!thin, types: __game.enemies.all().map((e) => e.type) };
    })()`);
    await ev('__game.heal.fill()');
    console.log('     造靶: ' + JSON.stringify(proofSetup));
    const gotProof = await waitFor('!!(window.__proofFat && window.__proofFat.proofed)', 12000, 120);
    if (!gotProof) {
      const trace = await ev(`(() => {
        const r = __game.enemies.all().find((e) => e.type === 'proofreader');
        const f = window.__proofFat;
        return {
          r: r ? { st: r.state, hp: +r.hp.toFixed(1), cd: +r.attackCd.toFixed(2), t: +r.t.toFixed(2),
            x: +r.pos.x.toFixed(1), z: +r.pos.z.toFixed(1) } : null,
          fat: f ? { st: f.state, hp: +f.hp.toFixed(1), max: +f.maxHp.toFixed(1) } : null,
          state: __game.state,
        };
      })()`);
      console.log('     批注失败现场: ' + JSON.stringify(trace));
    }
    const proofed = await ev(`(() => {
      const f = window.__proofFat, t = window.__proofThin;
      return {
        fat: f && f.proofed ? { t: +f.proofed.t.toFixed(1), dmg: f.proofed.dmgMul, spd: f.proofed.speedMul } : null,
        thin: !!(t && t.proofed),
        ring: !!(f && f.proofRing),
      };
    })()`);
    console.log('     批注: ' + JSON.stringify(proofed));
    ok(gotProof === true, '校对的读条完真的批注了');
    ok(proofed && proofed.fat && proofed.fat.dmg === 1.35, '批注是 ×1.35 伤害', proofed && proofed.fat && proofed.fat.dmg);
    ok(proofed && proofed.fat && proofed.fat.spd === 1.20, '同时 ×1.20 移速', proofed && proofed.fat && proofed.fat.spd);
    ok(proofed && proofed.ring === true, '被批注的怪头上多了红圈');
    ok(proofed && proofed.thin === false, '只挑血最厚的那只（瘦的没被批注）');

    // 伤害真的乘上去了：同类型两只，各吃 10 点
    const dmgCmp = await ev(`(() => {
      const f = window.__proofFat, t = window.__proofThin;
      f.hp = 400; t.hp = 90;
      const b1 = f.hp, b2 = t.hp;
      __game.enemies.takeDamage(f, 10, false, { quiet: true, noText: true });
      __game.enemies.takeDamage(t, 10, false, { quiet: true, noText: true });
      return { proofed: +(b1 - f.hp).toFixed(3), plain: +(b2 - t.hp).toFixed(3) };
    })()`);
    console.log('     同伤害对比: ' + JSON.stringify(dmgCmp));
    ok(dmgCmp && dmgCmp.proofed > 0 && dmgCmp.plain > 0, '两刀都掉血');
    ok(dmgCmp && Math.abs(dmgCmp.proofed / dmgCmp.plain - 1.35) < 0.08,
      '批注后伤害 / 平常 ≈ 1.35', dmgCmp && (dmgCmp.proofed / dmgCmp.plain).toFixed(3));

    // ---------------- ⑥ 裁纸刀 ----------------
    await clearField();
    ok(await ev('__game.visibleSkills().includes("guillotine")') === false, '一开始技能栏没有裁纸刀');
    ok(await ev('__game.pressSkill("guillotine")') === false, '没买之前按下无效');

    const lv = await ev('__game.block114.grantGuillotine(1)');
    ok(lv === 1, `买到 1 级（${lv}）`);
    await sleep(260);
    ok(await ev('__game.block114.guillotine.owned()') === true, 'owned 变 true');
    ok(await ev('__game.visibleSkills().includes("guillotine")') === true, '技能栏多出裁纸刀这一格');
    const visCount = (await ev('__game.visibleSkills()'));
    console.log('     技能栏: ' + JSON.stringify(visCount) + ' / state=' + await ev('__game.state'));
    ok(visCount.length <= 10, `技能栏格子数没超 10（${visCount.length}）`);
    ok(await ev('__game.block114.guillotine.cutPct()') === 30, '1 级切 30% 最大生命', await ev('__game.block114.guillotine.cutPct()'));
    ok(await ev('__game.block114.guillotine.cdMax()') === 30, '1 级冷却 30 秒');
    ok(await ev('__game.block114.guillotine.range()') === 6, '1 级够得着 6 格');

    // 主角正前方 3 格放一只厚血靶子
    const g = await ev(`(() => {
      const p = __game.pos();
      const yaw = __game.getYaw();
      const e = __game.enemies.spawn('warrior', { x: p.x + Math.sin(yaw) * 3, z: p.z + Math.cos(yaw) * 3 });
      e.state = 'chase'; e.maxHp = 200; e.hp = 200; e.attackCd = 99;
      window.__gTgt = e;
      return { yaw: +yaw.toFixed(2), x: +e.pos.x.toFixed(2), z: +e.pos.z.toFixed(2) };
    })()`);
    console.log('     靶子: ' + JSON.stringify(g));
    const gbefore = await ev('+window.__gTgt.hp.toFixed(1)');
    const pressedG = await ev('__game.pressSkill("guillotine")');
    ok(pressedG === true, '按下技能键挥出这一刀');
    await sleep(160);
    const gafter = await ev('+window.__gTgt.hp.toFixed(1)');
    const ghits = await ev('__game.block114.guillotine.hits()');
    const cuts = await ev('__game.block114.guillotine.totalCuts()');
    console.log(`     靶子 ${gbefore} → ${gafter}，命中 ${ghits}，总挥刀 ${cuts}`);
    ok(ghits >= 1, '真的切到了（hits ≥ 1）', ghits);
    ok(gafter < gbefore, '靶子掉血了');
    ok(gbefore - gafter >= 200 * 0.2, `按最大生命百分比切（掉 ${(gbefore - gafter).toFixed(1)}，至少 40）`);
    const gcd = await ev('JSON.stringify({ left: __game.block114.guillotine.cdLeft(), max: __game.block114.guillotine.cdMax() })');
    ok(JSON.parse(gcd).left > 0 && JSON.parse(gcd).max === 30, '挥完立刻进 30 秒冷却', gcd);
    ok(await ev('__game.pressSkill("guillotine")') === false, '冷却中再按无效');
    ok(await ev('__game.block114.guillotine.progress()') < 0.1, '冷却进度条从 0 开始', await ev('__game.block114.guillotine.progress()'));

    // ---------------- ⑦ 零报错 ----------------
    ok(errs.length === 0, `没有 JS 报错（${errs.length}）`);
    if (errs.length) errs.slice(0, 6).forEach((e) => console.log('     ! ' + e));
  } catch (e) {
    console.log('  XX  异常: ' + e.message);
    fail++;
  } finally {
    try { ws && ws.close(); } catch (_) {}
    try { chrome.kill(); } catch (_) {}
  }
  console.log(`\n===== block124-cdp: ${pass} ✓ / ${fail} ✗ =====`);
  process.exit(fail ? 1 : 0);
})();
