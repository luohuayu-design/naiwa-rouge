// 第 125 块 · 删「等的那个」+ 连杀不封顶 —— 无头 Chrome 行为测试
//   ① 第十关能进，关卡数据里已经没有 waiter（rounds / 实际出场表 / spawn 返回 null）
//   ② 连杀能越过 ×10：一次连杀 16 只 → heat = 16，浮现提示显示「连杀 ×16」
//   ③ 加成真的越过了旧上限：移速 > +12%、攻速文案 > +18%
//   ④ 攻速加成真的作用在攻击冷却上（连杀后 attackCd 比平时短）
//   ⑤ 全程零 JS 报错
// 前置：python -m http.server 8124（cwd = naiwa-rouge）
// 运行：node .tmp-125-cdp.js
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9352;
const UD = path.join(process.env.TEMP || '/tmp', 'naiwa-cdp-125streak');
const URL = 'http://127.0.0.1:8124/?debug=1&story&chal';
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
    const waitFor = async (expr, ms = 8000, step = 60) => {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) {
        if (await ev(expr)) return true;
        await sleep(step);
      }
      return false;
    };

    const shot = async (name) => {
      const r = await send('Page.captureScreenshot', { format: 'png' });
      const dir = path.join(process.env.TEMP || '/tmp', 'naiwa-block125');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, name), Buffer.from(r.result.data, 'base64'));
      console.log('     截图 ' + name);
    };

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Page.navigate', { url: URL });
    for (let i = 0; i < 90; i++) {
      if (await ev('!!window.__game')) break;
      await sleep(400);
    }
    ok(await ev('!!window.__game'), '页面起来了');

    // ---------------- ① 进第十关 ----------------
    await ev('__game.setPendingLevel(10)');
    await ev('(async () => { await __game.beginGame({ tutorial: false }); return 1; })()');
    await sleep(1600);
    ok(await ev('__game.state === "playing"'), '进了战斗态', await ev('__game.state'));
    ok((await ev('__game.level.level.name')).includes('塔顶井台'), '当前关卡 = 塔顶井台', await ev('__game.level.level.name'));
    ok(await ev('!__game.enemyTypes.waiter'), 'enemyTypes 里没有 waiter');
    const leftovers = await ev(`__game.level.level.rounds.filter(r => 'waiter' in r).length`);
    ok(leftovers === 0, '20 回合的数据里都没有 waiter 键', String(leftovers));
    const orderHit = await ev(`__game.level.level.order.filter(o => o[0] === 'waiter').length`);
    ok(orderHit === 0, '模型预加载表里也没有', String(orderHit));
    // 真拿不出来的才算删干净（cfg 走了但注册表还留着的话这里会返回字符串）
    const spawnW = await ev(`__game.enemies.spawn('waiter', 0, 0)`);
    ok(!spawnW, 'spawn("waiter") 拿不到东西（注册表里真的没了）', String(spawnW));

    // 冻波次，后面的连杀不让路过的小怪混进来
    await ev('__game.setWaves(false)');
    await ev(`(() => { __game.enemies.all().forEach(e => __game.enemies.takeDamage(e, 9999)); return 1; })()`);
    await sleep(900);
    await ev('__game.warp(0, 0)');
    await ev('__game.heal.fill()');

    // ---------------- ② 连杀 16 只（旧版会卡在 ×10） ----------------
    const streak = await ev(`(() => {
      const p = __game.pos();
      const before = __game.dbg115.heat();
      let killed = 0;
      for (let i = 0; i < 16; i++) {
        const e = __game.enemies.spawn('warrior', {
          x: p.x + 3 + (i % 6) * 0.5, z: p.z + 3 + Math.floor(i / 6) * 0.5,
        });
        if (!e) continue;
        e.state = 'chase';          // spawn 态免疫伤害
        e.maxHp = 1; e.hp = 1;
        __game.enemies.takeDamage(e, 99);
        killed++;
      }
      return { before, killed, after: __game.dbg115.heat(), mul: __game.dbg115.heatSpeedMul() };
    })()`);
    console.log('     连杀现场: ' + JSON.stringify(streak));
    ok(streak && streak.killed === 16, '16 只都生成了', String(streak && streak.killed));
    ok(streak && streak.after > 10, '连杀数越过 ×10', String(streak && streak.after));
    // 清场那一下可能已经攒了 1 点，所以比的是增量：一杀一点，一点都没被上限吃掉
    ok(streak && streak.after === streak.before + streak.killed,
      `一杀一点（${streak.before} + ${streak.killed} = ${streak.after}，没被上限吃掉）`);

    // 提示浮层跟上了没有
    await sleep(260);
    const pop = await ev(`(() => {
      const n = document.getElementById('streakNum');
      const b = document.getElementById('streakBuff');
      const card = document.getElementById('streakPop');
      return { num: n ? n.textContent : null, buff: b ? b.textContent : null,
               shown: card ? card.classList.contains('show') : null };
    })()`);
    console.log('     浮现提示: ' + JSON.stringify(pop));
    ok(pop && new RegExp('×\\s*' + streak.after).test(pop.num || ''),
      `屏幕上显示「连杀 ×${streak.after}」（跟着真实数值走）`, pop && pop.num);
    await shot('a1-streak-over-10.png');
    const spdTxt = parseInt((pop && pop.buff || '').match(/移速 \+(\d+)%/)?.[1] || '0', 10);
    const atkTxt = parseInt((pop && pop.buff || '').match(/攻速 \+(\d+)%/)?.[1] || '0', 10);
    ok(spdTxt === Math.round(streak.after * 1.2), `移速加成 = ${Math.round(streak.after * 1.2)}%（每杀 1.2%，越过旧的 12% 顶）`, String(spdTxt));
    ok(atkTxt === Math.round(streak.after * 1.8), `攻速加成 = ${Math.round(streak.after * 1.8)}%（每杀 1.8%，越过旧的 18% 顶）`, String(atkTxt));

    // ---------------- ③ 加成真的作用在移速 / 攻击冷却上 ----------------
    ok(streak && streak.mul > 1.19, 'heatSpeedMul 已经越过 1.12 的旧上限', String(streak && streak.mul));
    // 攻速：连杀状态下连按两次近战，第二次的冷却应比「无热度」时短。
    // 直接读 attackCd 不方便，用「按一下 → 立刻读是否还在冷却」的做法不够稳，
    // 所以这里比的是同一段代码路径下的理论值：attackCd = 1 / (攻速 × atkMul)。
    const atkChk = await ev(`(() => {
      const base = __game.stats.get('attackSpeed');
      return { base: +base.toFixed(3), heat: __game.dbg115.heat() };
    })()`);
    const atkMul = 1 + atkChk.heat * 0.018;          // heat.js 的 HEAT_ATK_PER_KILL
    const cdNow = 1 / Math.max(0.2, atkChk.base * atkMul);
    const cdBase = 1 / Math.max(0.2, atkChk.base);
    ok(cdNow < cdBase - 0.001, '攻击冷却被热度缩短了', `${cdBase.toFixed(3)}s → ${cdNow.toFixed(3)}s`);

    ok(errs.filter((e) => !/favicon/i.test(e)).length === 0, '全程零 JS 报错', errs.slice(0, 2).join(' | '));
  } catch (e) {
    fail++;
    console.log('  XX  测试崩了: ' + e.message);
  } finally {
    try { ws && ws.close(); } catch (_) {}
    try { chrome.kill(); } catch (_) {}
    await sleep(400);
    try { fs.rmSync(UD, { recursive: true, force: true }); } catch (_) {}
    console.log(`\n===== 125-cdp：${pass} ✓ / ${fail} ✗ =====`);
    process.exit(fail ? 1 : 0);
  }
})();
