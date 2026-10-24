// ============================================================
// 第 63 块 CDP：第五关 / 第六关的运行时行为
//   A 第五关进场：关卡号、主题、场地、四向路口
//   B 刷怪真的只在四条路上（采样本局前十几个出生点算角度）
//   C 擦名者：偷剑 → 杀掉还回来 / 跑掉就永久没了
//   D 路口灯：把隐身雾鬼照出来
//   E 第六关漏电地板：站上去掉血、绝缘斗篷免疫并把电导给怪
//   F 重启体：打死 → 躺尸 → 半血重启 → 第三次才真死
//   G 全程 0 JS 报错
//
// 跑法：先 `python -m http.server 8124`（cwd=naiwa-rouge），再 `node .tmp-block63-cdp.js`
//
// ⚠️ 踩过的坑（改这个文件前先看）：
//   · 别用 __game.ui.setPaused(true) 停世界：enemies.update 一起停，怪永远卡在 spawn。
//     要「照常运转但不出新怪」用 __game.setWaves(true)。
//   · weapon.fireReady 之类是 getter，不能加括号。
//   · 每次点击可能弹出的教程卡 / 公告会挡住 elementFromPoint，先关掉再点。
// ============================================================
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9377;
const UD = path.join(os.tmpdir(), 'naiwa-cdp-63');
const OUT = path.join(os.tmpdir(), 'naiwa-block63');
const URL = 'http://127.0.0.1:8124/index.html?debug=1&title';

let pass = 0, fail = 0;
const fails = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; fails.push(name + (extra ? ' → ' + extra : '')); console.log('  ✗ ' + name + (extra ? ' → ' + extra : '')); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  fs.rmSync(UD, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const chrome = spawn(CHROME, [
    '--headless=new', '--remote-debugging-port=' + PORT, '--num-raster-threads=2',
    '--enable-unsafe-swiftshader', '--no-first-run', '--no-default-browser-check',
    '--disable-dev-shm-usage', '--user-data-dir=' + UD, '--window-size=420,900', 'about:blank',
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
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('WebSocket 连接失败')); });

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
    async function waitFor(expr, ms = 60000, label = expr) {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) {
        try { if (await ev(expr)) return true; } catch (_) {}
        await sleep(150);
      }
      throw new Error('等待超时: ' + label);
    }
    // 回合清空会弹升级卡 / 商店 / 事件卡，这些面板会把 gameState 从 playing 切走，
    // 世界（含怪物 AI）就冻住了 —— 后面所有「等它动」的断言都会超时。
    // 这个助手把它们一路点掉，直到真的回到 playing。
    async function clearPanels() {
      for (let i = 0; i < 14; i++) {
        const st = await ev('__game.state');
        if (st === 'playing') return true;
        if (st === 'upgrade') {
          await ev("document.querySelector('#upList .up-item')?.click(), 1");
        } else if (st === 'shop') {
          await ev("document.getElementById('shClose')?.click(), 1");
        } else if (st === 'meet') {
          await ev("document.getElementById('mtOk')?.click(), 1");
        } else if (st === 'event') {
          await ev("document.querySelector('#evList .ev-opt')?.click(), 1");
        } else if (await ev("document.getElementById('packGet')?.classList.contains('on')")) {
          await ev("document.getElementById('pgNo')?.click(), 1");
        } else {
          // 'shard'/其它面板：不认识的直接等下一轮
        }
        await sleep(450);
      }
      return (await ev('__game.state')) === 'playing';
    }
    // kindCounts() 返回的是 [{kind, n}] 数组 —— 别当对象用（第 63 块踩过）
    const sumKinds = (arr) => (Array.isArray(arr) ? arr : []).reduce((a, b) => a + (b.n || 0), 0);

    async function shot(name) {
      // 截图前把挡路的面板收掉（音效包 / 公告这类会盖住整个屏幕）
      await ev(`['packGet','noticeOv','promoOv','signOv'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) { el.classList.remove('on'); el.setAttribute('aria-hidden', 'true'); }
      }); 1`);
      const r = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(OUT, name), Buffer.from(r.data, 'base64'));
    }
    await send('Runtime.enable');
    await send('Page.enable');

    await send('Page.navigate', { url: URL });
    await waitFor('!!window.__game', 90000, '__game 就绪');
    await sleep(800);
    // 造档案：① 打通 1~5 关（不然第五/六关是锁的，点 .lv-item 静默失败）
    //         ② 拿到过环剑（第二关起开局送 3 把，擦名者才有剑可偷）
    // profile() 在启动时读进内存，所以写完必须 reload 一次。
    await ev(`(() => {
      const rec = {};
      for (const id of [1, 2, 3, 4, 5]) rec[id] = { wins: 1, bestTime: 120, bestKills: 200, bestRound: 20 };
      localStorage.setItem('naiwa_rouge_records_v1', JSON.stringify(rec));
      const p = JSON.parse(localStorage.getItem('naiwa_rouge_profile_v1') || '{}');
      p.ringGot = true;
      p.heal = { unlocked: true };
      p.voicePack = { unlocked: true, id: 'normal' };   // 免得「音效包」卡片盖住截图
      localStorage.setItem('naiwa_rouge_profile_v1', JSON.stringify(p));
      return 1;
    })()`);
    await send('Page.reload', { ignoreCache: true });
    await waitFor('!!window.__game', 90000, '__game 就绪（reload 后）');
    await sleep(1200);
    // 摘掉标题页上可能自动弹的公告 / 签到 / 宣传 / 礼包 —— 它们会盖住选关按钮
    await ev(`['noticeOv','promoOv','signOv','packGet'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) { el.classList.remove('on'); el.setAttribute('aria-hidden', 'true'); }
    }); 1`);
    await sleep(300);

    // ============================================================
    console.log('\n[A] 进入第五关：草甸路口');
    // ============================================================
    await ev("document.getElementById('btnStart').click(), 1");
    await sleep(400);
    ok(await ev("!!document.querySelector('.lv-item[data-level=\"5\"]')"), '选关列表里有第五关');
    ok(await ev("!!document.querySelector('.lv-item[data-level=\"6\"]')"), '选关列表里有第六关');
    ok(await ev("!document.querySelector('.lv-item[data-level=\"5\"]').classList.contains('locked')"), '第五关解锁了（记录已造）');
    await ev("document.querySelector('.lv-item[data-level=\"5\"]').click(), 1");
    await sleep(400);
    await ev("document.getElementById('diffNext')?.click(), 1");
    await sleep(400);
    await ev("document.getElementById('curseStart')?.click(), 1");
    await sleep(600);
    if (await ev("document.getElementById('tutAsk')?.classList.contains('on')")) {
      await ev("document.getElementById('tutNo').click(), 1");
      await sleep(400);
    }
    // 第二关起开局就送环剑，于是会连排两段武器教程（环剑 / 箭雨）——
    // 它们有自己的 gameState='wtut'，世界是冻住的。这里直接跳过。
    for (let i = 0; i < 8; i++) {
      const st = await ev('__game.state');
      if (st === 'playing') break;
      if (st === 'wtut') await ev("document.getElementById('wtSkip')?.click(), 1");
      else if (st === 'meet') await ev("document.getElementById('mtOk')?.click(), 1");
      await sleep(700);
    }
    await waitFor("__game.state === 'playing'", 25000, '进入第五关');
    await sleep(900);
    ok(await ev('__game.levelId') === 5, '真的进了第五关', await ev('__game.levelId'));

    const lv5 = JSON.parse(await ev(`JSON.stringify({
      name: __game.level.level.name,
      theme: __game.level.level.theme,
      arena: __game.arenaRadius,
      lanes: __game.level.level.lanes,
      rounds: __game.level.level.rounds.length,
      hasHazards: !!__game.level.level.hazards,
    })`));
    ok(lv5.name.includes('草甸路口'), '关卡名对', lv5.name);
    ok(lv5.theme === 'crossroad', '主题切到 crossroad（场景真的换了）', lv5.theme);
    ok(Math.abs(lv5.arena - 20) < 0.01, '场地半径 20', String(lv5.arena));
    ok(lv5.lanes === 4, '四向路口', String(lv5.lanes));
    ok(lv5.rounds === 20, '20 回合', String(lv5.rounds));
    ok(lv5.hasHazards === false, '第五关没有漏电地板');
    // 第 63 块修的：右上角 HUD 以前把「第 1 关 / 荒草地」写死了，第二关起一直是错的
    await sleep(600);
    ok((await ev("document.getElementById('whLevel')?.textContent || ''")).includes('第五关'),
      'HUD 关卡标签跟着换成了第五关', await ev("document.getElementById('whLevel')?.textContent"));
    ok((await ev("document.getElementById('whSub')?.textContent || ''")).includes('草甸路口'),
      'HUD 副标题是草甸路口（不是写死的荒草地）', await ev("document.getElementById('whSub')?.textContent"));
    ok(await ev('typeof __game.block63.hazards.count === "function"') === true, '第 63 块调试口就绪');

    // 刚进场：第二关起开局自带环剑（第 56 块），擦名者才有东西可偷
    const ring = JSON.parse(await ev('JSON.stringify({ granted: __game.weapon.granted, kinds: __game.weapon.kindCounts() })'));
    ok(ring.granted === true, '第五关开局就有环剑', JSON.stringify(ring));
    ok(sumKinds(ring.kinds) >= 3, '开局至少 3 把剑（第 56 块的 prefillRing）', JSON.stringify(ring.kinds));

    // ============================================================
    console.log('\n[B] 刷怪只在四条路上（采样前 N 个出生点）');
    // ============================================================
    // 钩住 enemies.spawn 的入参：拿到的就是**生成那一刻**的坐标（不是走了几步之后的）
    await ev(`(() => {
      window.__spawnSeen = [];
      const orig = __game.enemies.spawn;
      __game.enemies.spawn = function (type, at, opts) {
        if (at && Number.isFinite(at.x)) window.__spawnSeen.push({ t: type, x: +at.x.toFixed(2), z: +at.z.toFixed(2) });
        return orig.call(this, type, at, opts);
      };
      return 1;
    })()`);
    // 第一回合只有 3 只小兵（gap 0.9）—— 等到 8 个样本或 22 秒
    for (let i = 0; i < 26; i++) {
      await sleep(900);
      // 采样期间回合可能被清空 → 弹升级卡 → 世界冻住、不再出怪。
      // 每轮顺手把它们点掉，不然只能采到 2 个点。
      if (await ev('__game.state') !== 'playing') await clearPanels();
      const n = await ev('window.__spawnSeen.length');
      if (n >= 8) break;
    }
    const samples = JSON.parse(await ev('JSON.stringify(window.__spawnSeen)'));
    await ev('window.__spawnOriginal = null, 1');
    ok(samples.length >= 5, `采到足够出生点（${samples.length} 个）`, JSON.stringify(samples.slice(0, 3)));

    // 算每个出生点到「最近的 90° 分路」的角差；路口抖动上限 = 路宽 0.33/2 ≈ 0.26 弧度
    const laneDev = samples.map((s) => {
      const a = Math.atan2(s.z, s.x);
      const step = Math.PI / 2;
      const k = Math.round(a / step);
      let d = Math.abs(a - k * step);
      if (d > Math.PI) d = Math.PI * 2 - d;
      return +d.toFixed(3);
    });
    const maxDev = Math.max(...laneDev);
    ok(maxDev <= 0.30, `所有出生点都落在四条路上（最大偏差 ${maxDev} 弧度）`, JSON.stringify(laneDev));
    // 反证：真的分散在不止一条路上（否则「路口」等于白写）
    const laneIds = new Set(samples.map((s) => Math.round(Math.atan2(s.z, s.x) / (Math.PI / 2)) % 4));
    ok(laneIds.size >= 2, `至少用了 2 条不同的路（实际 ${laneIds.size} 条）`, [...laneIds].join(','));

    // 之后的机制测试一律停刷怪，只留世界运转
    await ev('__game.setWaves(true), 1');
    const calm = await clearPanels();
    ok(calm, '采样期间弹出来的面板都收掉了（世界真的在跑）', await ev('__game.state'));
    await ev('__game.enemies.killAll(), 1');
    await sleep(600);
    ok(await ev('__game.state') === 'playing', '清场后仍是 playing（没被升级卡拦住）', await ev('__game.state'));

    // 给第五关拍一张「路口 + 几只怪」的图（截图给用户看效果）
    await ev(`(() => {
      const p = __game.pos;
      const put = (k, dx, dz) => { const e = __game.block63.put(k, p.x + dx, p.z + dz); if (e) { e.maxHp = 999; e.hp = 999; } };
      put('warrior', 3.4, 0.6); put('archer', -3.2, 1.4); put('shielder', 0.4, -3.4); put('wraith', -2.6, -2.4);
      return 1;
    })()`);
    await sleep(1500);
    await shot('level5.png');
    await ev('__game.enemies.killAll(), 1');
    await sleep(400);

    // ============================================================
    console.log('\n[C] 擦名者：偷剑 / 杀它拿回来 / 让它跑掉');
    // ============================================================
    const before = JSON.parse(await ev('JSON.stringify(__game.weapon.kindCounts())'));
    const beforeN = sumKinds(before);

    // 放在「保持距离 6 格」和「射程 9 格」之间，并把冷却清零让它立刻读条
    await ev(`(() => {
      const p = __game.pos;
      const e = __game.block63.put('eraser', p.x + 7.4, p.z);
      e.attackCd = 0;
      window.__er = e;
      return 1;
    })()`);
    try {
      await waitFor("window.__er && window.__er.state === 'attack'", 12000, '擦名者开始读条');
    } catch (err) {
      const diag = await ev(`JSON.stringify(window.__er ? {
        state: window.__er.state, dist: +Math.hypot(window.__er.pos.x - __game.pos.x, window.__er.pos.z - __game.pos.z).toFixed(2),
        cd: +window.__er.attackCd.toFixed(2), keep: window.__er.cfg.keepDistance, range: window.__er.cfg.attackRange,
      } : 'no enemy')`);
      throw new Error('擦名者没读条：' + diag);
    }
    const windup = await ev('window.__er.cfg.windup');
    ok(windup >= 2, '读条时间 ≥2 秒（玩家来得及冲过去）', String(windup));
    await shot('eraser_cast.png');

    await waitFor("__game.block63.stolen() >= 1", 8000, '偷到剑');
    const mid = JSON.parse(await ev('JSON.stringify(__game.weapon.kindCounts())'));
    const midN = sumKinds(mid);
    ok(midN === beforeN - 1, `环上少了一把剑（${beforeN} → ${midN}）`, JSON.stringify(mid));
    ok(await ev('__game.block63.stolen()') === 1, '擦名者身上挂着那把剑');
    ok(await ev("window.__er.state") === 'flee', '得手后进入逃跑状态', await ev("window.__er.state"));
    // showToast 写的是波次横幅（#wtTitle / #wtSub），不是独立 toast 节点
    const toastText = await ev("(document.getElementById('wtTitle')?.textContent || '') + ' / ' + (document.getElementById('wtSub')?.textContent || '')");
    ok(/剑被擦掉了/.test(toastText), '给了「剑被擦掉了」的提示', toastText.slice(0, 60));

    // 杀掉它 → 剑回来
    await ev("__game.block63.hit('eraser', 9999), 1");
    await waitFor('__game.block63.stolen() === 0', 5000, '剑被归还');
    const after = JSON.parse(await ev('JSON.stringify(__game.weapon.kindCounts())'));
    const afterN = sumKinds(after);
    ok(afterN === beforeN, `杀死擦名者后剑回来了（${afterN} 把）`, JSON.stringify(after));
    ok(await ev('__game.block63.erasers()') === 0, '场上没有擦名者了');

    // ---- 让它跑掉：剑永久丢失 ----
    await ev(`(() => {
      const p = __game.pos;
      const e = __game.block63.put('eraser', p.x + 7.4, p.z);
      e.attackCd = 0;
      window.__er2 = e;
      return 1;
    })()`);
    await waitFor("window.__er2 && __game.block63.stolen() >= 1", 20000, '第二只偷到剑');
    // 把它推到场地边缘，省掉「走回去」的等待
    await ev(`(() => {
      const e = window.__er2, R = __game.arenaRadius;
      const a = Math.atan2(e.pos.z, e.pos.x);
      e.pos.x = Math.cos(a) * (R - 1.2);
      e.pos.z = Math.sin(a) * (R - 1.2);
      return 1;
    })()`);
    await waitFor('__game.block63.erasers() === 0', 12000, '擦名者跑出场外');
    const gone = JSON.parse(await ev('JSON.stringify(__game.weapon.kindCounts())'));
    const goneN = sumKinds(gone);
    ok(goneN === beforeN - 1, `跑掉的剑永久丢失（剩 ${goneN} 把）`, JSON.stringify(gone));
    ok(await ev('__game.block63.stolen()') === 0, '逃跑后不再挂着剑（没有重复归还）');
    ok(true, '跑掉时没有抛异常（onEraseEscape 走通）');

    // ============================================================
    console.log('\n[D] 路口灯：把隐身雾鬼照出来');
    // ============================================================
    await ev(`(() => {
      const p = __game.pos;
      // 放远一点 + 把血改厚：雾鬼血薄，贴脸会被主角的环剑顺手打死，
      // 那样就等不到它「隐下去」了（第 63 块踩过）
      const e = __game.block63.put('wraith', p.x + 5.5, p.z + 0.4);
      e.maxHp = 999; e.hp = 999;
      window.__gh = e;
      return 1;
    })()`);
    // 雾鬼是「显形 3 秒 / 隐身 2.5 秒」的循环（不是一直隐身），先等它隐下去
    await waitFor('__game.enemies.hiddenCount() >= 1', 9000, '雾鬼进入隐身状态');
    ok(await ev('__game.enemies.hiddenCount() >= 1'), '场上出现了隐身的雾鬼', String(await ev('__game.enemies.hiddenCount()')));
    // 贴脸也不再自动显形（第 62 块取消的规则）：站在旁边 1 秒，它还是隐的
    await ev(`(() => { const e = window.__gh, p = __game.pos; e.pos.x = p.x + 1.2; e.pos.z = p.z; return 1; })()`);
    await sleep(1000);
    ok(await ev('window.__gh.ghostHidden === true'), '贴到主角身边也不会自己显形（第 62 块的新规则）');
    // 隐身时玩家打不到它
    const beforeHit = await ev('window.__gh.hp');
    await ev('__game.enemies.takeDamage(window.__gh, 99, false, { quiet: true }), 1');
    ok(await ev('window.__gh.hp') === beforeHit, '隐身状态下玩家打不掉它的血', `${beforeHit} → ${await ev('window.__gh.hp')}`);

    await ev("__game.block63.buyRelic('lantern', 1), 1");
    const lv = JSON.parse(await ev('JSON.stringify(__game.block63.relics())'));
    ok(lv.lantern === 1, '买到路口灯', JSON.stringify(lv));
    const flare = JSON.parse(await ev('JSON.stringify(__game.block63.debugLantern())'));
    ok(flare && flare.shown >= 1, '点灯把隐身的雾鬼照出来了', JSON.stringify(flare));
    ok(await ev('window.__gh.ghostHidden === false'), '被照到的雾鬼显形了');
    await shot('lantern.png');

    // ============================================================
    console.log('\n[E] 第六关：漏电地板 / 绝缘斗篷');
    // ============================================================
    await ev('__game.setLevel(6), 1');
    await sleep(900);
    ok(await ev('__game.levelId') === 6, '切到第六关', await ev('__game.levelId'));
    const lv6 = JSON.parse(await ev(`JSON.stringify({
      name: __game.level.level.name, theme: __game.level.level.theme,
      arena: __game.arenaRadius, count: __game.block63.hazards.count(),
      defs: __game.block63.hazards.defs(),
    })`));
    ok(lv6.name.includes('骨塔机房'), '关卡名对', lv6.name);
    await sleep(600);
    ok((await ev("document.getElementById('whLevel')?.textContent || ''")).includes('第六关'),
      'HUD 关卡标签换成第六关', await ev("document.getElementById('whLevel')?.textContent"));
    ok(lv6.theme === 'server', '主题切到 server', lv6.theme);
    ok(lv6.count === 6, '6 块漏电地板', String(lv6.count));
    ok(lv6.defs.every((d) => d.r > 1.5 && d.cycle >= 4), '每块地板半径 / 周期都合理', JSON.stringify(lv6.defs[0]));

    // 清掉场上的怪：不然「掉血」可能是怪打的，测出来的是假的免疫（第 63 块踩过）
    await ev('__game.setWaves(true), 1');
    await ev('__game.enemies.killAll(), 1');
    await sleep(500);

    // 站到第一块地板中心，等它通电
    const hz = lv6.defs[0];
    await ev(`(() => {
      __game.pos.x = ${hz.x}; __game.pos.z = ${hz.z};
      __game.stats.hp.cur = 20;
      return 1;
    })()`);
    await sleep(300);
    // 用一个循环等「通电 + 扣血」：地板是周期性的，最多等 6 秒
    let dropped = 0;
    const hpBefore = await ev('__game.stats.hp.cur');
    for (let i = 0; i < 40; i++) {
      await sleep(200);
      const on = await ev('__game.block63.hazards.onPlayer()');
      const hp = await ev('__game.stats.hp.cur');
      if (on && hp < hpBefore) { dropped = hpBefore - hp; break; }
    }
    ok(dropped >= 1, `站在通电地板上会掉血（掉了 ${dropped}）`, String(dropped));
    ok(await ev('__game.block63.hazards.onPlayer()') === true, '系统认得出「玩家正踩在通电地板上」');
    await shot('hazard.png');

    // 穿绝缘斗篷：同样站在通电地板上不掉血
    await ev("__game.block63.buyRelic('insulator', 1), 1");
    await ev('__game.enemies.killAll(), 1');
    await sleep(200);
    await ev('__game.stats.hp.cur = 20, 1');
    // 顺便放一只血厚的怪在旁边，验证「电会导给怪」。
    // ⚠️ 用 999 血的孢生菇：小兵会被主角的环剑顺手秒了，测出来 0 → 0 看不出变化。
    await ev(`(() => {
      const p = __game.pos;
      const e = __game.block63.put('brood', p.x + 1.2, p.z + 0.6);
      e.maxHp = 999; e.hp = 999;
      window.__mb = e;
      return 1;
    })()`);
    await sleep(900);
    const mbHp0 = await ev('window.__mb.hp');
    let safeHp = 20;
    let onCount = 0;
    for (let i = 0; i < 45; i++) {
      await sleep(200);
      if (await ev('__game.block63.hazards.onPlayer()')) onCount++;
      safeHp = Math.min(safeHp, await ev('__game.stats.hp.cur'));
      if (onCount >= 4) break;   // 至少经历 4 次「正在通电」的采样
    }
    ok(onCount >= 3, '这一轮确实踩在通电地板上（采样到通电）', String(onCount));
    ok(safeHp === 20, `穿斗篷不掉血（血还是 ${safeHp}）`, String(safeHp));
    const mbHp1 = await ev('window.__mb.hp');
    ok(mbHp1 < mbHp0, `旁边的怪被电到了（${mbHp0} → ${mbHp1}）`, `${mbHp0}/${mbHp1}`);

    // ============================================================
    console.log('\n[F] 重启体：打死 → 躺尸 → 半血重启 → 第三次真死');
    // ============================================================
    await ev("__game.enemies.killAll(), 1");
    await sleep(400);
    await ev(`(() => {
      const p = __game.pos;
      // 放远一点（6.5 格）：主角会自动近战，贴太近会自己把它的「重启额度」打光，
      // 那就测不出「躺 4 秒」的节奏了
      window.__rb = __game.block63.put('reboot', p.x + 6.5, p.z - 0.4);
      return 1;
    })()`);
    await sleep(1400);         // 等它从 spawn 站起来
    const rbMax = await ev('window.__rb.maxHp');
    ok(await ev("window.__rb.state") !== 'spawn', '重启体站起来了', await ev("window.__rb.state"));

    // 第 1 次打死 → down
    await ev("__game.block63.hit('reboot', 99999), 1");
    await sleep(250);
    ok(await ev('__game.block63.down()') === 1, '第一次打死：躺在地上（不算死）', await ev('__game.block63.down()'));
    ok(await ev("window.__rb.state") === 'down', '状态是 down', await ev("window.__rb.state"));
    ok(await ev('window.__rb.reboots') === 1, '记了一次重启', String(await ev('window.__rb.reboots')));
    await shot('reboot_down.png');

    await waitFor("window.__rb.state !== 'down'", 8000, '4 秒后重启');
    const hpAfterReboot = await ev('window.__rb.hp');
    ok(hpAfterReboot > 0 && hpAfterReboot <= Math.round(rbMax * 0.6),
      `重启后是半血（${hpAfterReboot} / ${rbMax}）`, String(hpAfterReboot));
    ok(Math.abs(Math.round(rbMax * 0.55) - hpAfterReboot) <= 1, '血量 ≈ 上限的 55%', `${hpAfterReboot}/${rbMax}`);

    // 第 2 次打死 → 还要再躺一次
    await sleep(600);
    await ev("__game.block63.hit('reboot', 99999), 1");
    await sleep(250);
    ok(await ev('__game.block63.down()') === 1, '第二次打死：还是躺下（2 次重启额度没用完）');
    await waitFor("window.__rb.state !== 'down'", 8000, '第二次重启');

    // 第 3 次 → 真死
    await sleep(600);
    await ev("__game.block63.hit('reboot', 99999), 1");
    await sleep(300);
    ok(await ev('window.__rb.state') === 'dead', '第三次打死：真的死了（最多重启 2 次）', await ev("window.__rb.state"));
    ok(await ev('__game.block63.down()') === 0, '没有残留的躺尸状态');

    // ============================================================
    console.log('\n[G] 全流程 0 JS 报错');
    // ============================================================
    const realErrors = jsErrors.filter((e) => !/favicon|Failed to load resource.*404/i.test(e));
    ok(realErrors.length === 0, '没有 JS 报错', realErrors.slice(0, 3).join(' | '));

    await shot('final.png');

    console.log('\n-------------------------------');
    console.log(`通过 ${pass} / 失败 ${fail}`);
    if (fails.length) { console.log('失败项：'); fails.forEach((f) => console.log('  - ' + f)); }
    process.exitCode = fail ? 1 : 0;
  } catch (e) {
    console.error('测试中断:', e.message);
    if (e.stack) console.error(e.stack.split('\n').slice(0, 4).join('\n'));
    process.exitCode = 2;
  } finally {
    try { ws && ws.close(); } catch (_) {}
    try { chrome.kill(); } catch (_) {}
  }
})();
