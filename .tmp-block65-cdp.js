// ============================================================
// 第 65 块 CDP：运行时行为（八条用户需求的现场验证）
//   A 进第五关（自动带环剑 + 箭雨，因为技能与关卡脱钩）
//   B 回血提示卡：开局自动弹、内容对、**世界真冻住**、只弹一次
//   C 技能键：绿色十字 + 外圈环；真触摸点得动（静止 / 边推摇杆边点）
//   D 读条 HUD：百分比跟着擦名者走、65% 变 warn、首次弹讲解卡且进度冻住
//   E 缝补小巫：绿加号连串往上浮（不是一闪就没）
//   F 雾鬼：隐身 0.05 / 显形 1.0 + 自发光 0.3→2.2
//   G 五六关难度乘数（关卡表里真的写着 1.35 / 1.15）
//   H 关底民心事件不再被吞（需要 &story，否则叙述被 debug 跳过）
//   I 重打第一关：开局自带环剑 + 箭雨
//   J 全程 0 JS 报错 + 截图
//
// 跑法：先 `python -m http.server 8124`（cwd=naiwa-rouge），再 `node .tmp-block65-cdp.js`
//
// ⚠️ 老经验（别重复踩）：
//   · 「不出新怪」用 setWaves(true)；setEnemies(true) 会**连 AI 一起停**，
//     怪停在 spawn 态 → 箭雨 fire() 找不到目标、小巫也读不了条。
//   · getter 不能加括号（__game.arrowRain.ready 是 getter）。
//   · 写档案后必须 Page.reload（profile 启动时读进内存）。
//   · 数技能格必须 filter(b.style.display !== 'none')（技能键常驻 DOM）。
// ============================================================
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9390;
const UD = path.join(os.tmpdir(), 'naiwa-cdp-65');
const OUT = path.join(os.tmpdir(), 'naiwa-block65');
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
      let st = '';
      try { st = '（当前 state=' + (await ev('__game.state')) + '）'; } catch (_) {}
      throw new Error('等待超时: ' + label + st);
    }
    async function shot(name) {
      await ev(`['packGet','noticeOv','promoOv','signOv'].forEach((i) => {
        const el = document.getElementById(i);
        if (el) { el.classList.remove('on'); el.setAttribute('aria-hidden', 'true'); }
      }); 1`);
      const r = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(OUT, name), Buffer.from(r.data, 'base64'));
    }
    // 关掉所有可能挡路的浮层（公告 / 宣传 / 签到 / 礼包）
    async function clearOverlays() {
      await ev(`['noticeOv','promoOv','signOv','packGet'].forEach((i) => {
        const el = document.getElementById(i);
        if (el) { el.classList.remove('on'); el.setAttribute('aria-hidden', 'true'); el.style.display = 'none'; }
      }); 1`);
    }
    // 真触摸（pointerdown 的事件源）：摇杆一直按住时第二指落点
    async function tap(x, y, idp = 71) {
      await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: idp, radiusX: 8, radiusY: 8, force: 1 }] });
      await sleep(90);
      await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await sleep(420);
    }
    // 按住摇杆往右推，同时第二指在 (x,y) 点一下
    async function tapWhileMoving(x, y, idp = 81) {
      await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 100, y: 640, id: idp, radiusX: 10, radiusY: 10, force: 1 }] });
      await sleep(160);
      for (const d of [14, 28, 42]) {
        await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 100 + d, y: 632, id: idp }] });
        await sleep(70);
      }
      await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 100 + 42, y: 632, id: idp }, { x, y, id: idp + 1 }] });
      await sleep(150);
      await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await sleep(500);
    }
    // 等某个「游戏内 CD」转好。headless + SwiftShader 帧率很低，游戏内 1 秒往往
    // 要 2~4 秒真实时间，所以不能按真实时间掐表，得老老实实轮询 + 打印进度。
    async function waitCd(expr, label, ms = 200000) {
      const t0 = Date.now();
      let last = 0;
      while (Date.now() - t0 < ms) {
        try { if (await ev(expr)) { console.log('     ' + label + '：等了 ' + ((Date.now() - t0) / 1000).toFixed(1) + 's'); return true; } } catch (_) {}
        if (Date.now() - last > 15000) { last = Date.now(); console.log('     …还在等 ' + label + '（' + ((Date.now() - t0) / 1000).toFixed(0) + 's）'); }
        await sleep(200);
      }
      return false;
    }
    async function skillRects() {
      return JSON.parse(await ev(`(() => {
        const o = {};
        document.querySelectorAll('.sk').forEach((b) => {
          if (b.style.display === 'none') return;
          const r = b.getBoundingClientRect();
          o[b.dataset.skill] = { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
        });
        return JSON.stringify(o);
      })()`));
    }

    await send('Runtime.enable');
    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 420, height: 900, deviceScaleFactor: 2, mobile: true });
    await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await send('Emulation.setFocusEmulationEnabled', { enabled: true });

    await send('Page.navigate', { url: URL });
    await waitFor('!!window.__game', 90000, '__game 就绪');
    await sleep(1200);

    // ---- 造档案：1~5 关都通过（第五关解锁）、环剑已得、回血已解锁、提示卡全没看过 ----
    await ev(`(() => {
      const rec = {};
      for (const id of [1, 2, 3, 4, 5]) rec[id] = { wins: 1, bestTime: 120, bestKills: 200, bestRound: 20 };
      localStorage.setItem('naiwa_rouge_records_v1', JSON.stringify(rec));
      const p = JSON.parse(localStorage.getItem('naiwa_rouge_profile_v1') || '{}');
      p.ringGot = true;
      p.heal = { unlocked: true };
      p.voicePack = { unlocked: true, id: 'normal' };
      p.tut = { heal: false, cast: false };   // 两个提示卡都当第一次
      localStorage.setItem('naiwa_rouge_profile_v1', JSON.stringify(p));
      return 1;
    })()`);
    await send('Page.reload', { ignoreCache: true });
    await waitFor('!!window.__game', 90000, '__game 就绪（reload 后）');
    await sleep(1500);
    await clearOverlays();
    await sleep(300);

    // ============================================================
    console.log('\n[A] 进第五关：技能与关卡脱钩，开局就带环剑 + 箭雨');
    // ============================================================
    ok(await ev('!!__game.block65'), 'block65 调试口就绪');
    await ev("document.getElementById('btnStart').click(), 1");
    await sleep(500);
    await clearOverlays();
    ok(await ev("!document.querySelector('.lv-item[data-level=\"5\"]')?.classList.contains('locked')"), '第五关解锁');
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
    // 开局会连排武器教程（环剑 / 箭雨），跳过它们
    for (let i = 0; i < 10; i++) {
      const st = await ev('__game.state');
      if (st === 'playing' || st === 'hint') break;
      if (st === 'wtut') await ev("document.getElementById('wtSkip')?.click(), 1");
      else if (st === 'meet') await ev("document.getElementById('mtOk')?.click(), 1");
      else if (st === 'tutorial') await ev("document.getElementById('tcSkip')?.click(), 1");
      await sleep(700);
    }
    await sleep(400);
    ok(await ev('__game.levelId') === 5, '真的进了第五关', String(await ev('__game.levelId')));
    ok(await ev('__game.weapon.granted') === true, '第五关开局就有环剑');
    ok(await ev('__game.block65.rainUnlocked()') === true, '开局连箭雨也带着（不再看是第几关）');

    // ============================================================
    console.log('\n[B] 回血提示卡：开局自动弹、内容对、世界真冻住、只弹一次');
    // ============================================================
    let hintUp = await ev("__game.state === 'hint'");
    if (!hintUp) {
      // 万一被别的状态顶掉，手动催一下队列
      await ev('__game.block65.hint.pump(), 1');
      await sleep(500);
      hintUp = await ev("__game.state === 'hint'");
    }
    ok(hintUp, '进关后自动弹出提示卡（状态 hint）', await ev('__game.state'));
    ok(await ev('__game.block65.hint.visible()') === true, '卡片真的看得见（computed 不再读 hidden）');
    const ht = await ev('__game.block65.hint.text()');
    ok((ht.title || '').includes('绿十字'), '标题讲的是绿十字', ht.title);
    ok((ht.kicker || '').includes('回血'), '眉题写着「新技能 · 回血」', ht.kicker);
    ok((ht.body || '').includes('5 点生命'), '正文写了回 5 点生命');
    ok((ht.body || '').includes('25'), '正文写了 25 秒冷却');
    ok(await ev('__game.block65.hint.seen("heal")') === true, '弹过就记进档案（一辈子一次）');
    // 世界真的停：记一次 pos，等 900ms 再记
    const frozen = JSON.parse(await ev(`(async () => {
      const p0 = { x: __game.pos.x, z: __game.pos.z };
      const e0 = __game.enemies.list.length;
      await new Promise((r) => setTimeout(r, 900));
      return JSON.stringify({ moved: Math.hypot(__game.pos.x - p0.x, __game.pos.z - p0.z), grew: __game.enemies.list.length - e0 });
    })()`));
    ok(frozen.moved < 0.01, '卡片亮着时奶蛙不动（世界冻结）', String(frozen.moved));
    ok(frozen.grew === 0, '卡片亮着时也不刷新怪', String(frozen.grew));
    await shot('b-heal-hint.png');
    // 点「知道了」
    const okBtn = await ev(`(() => { const r = document.getElementById('hiOk').getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; })()`);
    await tap(okBtn.x, okBtn.y, 91);
    ok(await ev("__game.state === 'playing'"), '点「知道了」回到 playing', await ev('__game.state'));
    ok(await ev('__game.block65.hint.visible()') === false, '卡片收起来了');

    // ============================================================
    console.log('\n[C] 技能键：绿色十字 + 外圈环；边推摇杆边点也点得动（第 6 条真 bug）');
    // ============================================================
    // 不再出新怪（AI 保持活着 —— 箭雨要找活靶子、小巫要读条），但清掉场上已有的，
    // 顺便把奶蛙血上限堆高：这一段要连点两次技能、中间还要等 25 秒 CD，
    // 让第五关的小怪在耳边啃一分钟很容易把主角啃死（死了状态变 over，CD 就不再走）。
    await ev('__game.setWaves(true), 1');
    await ev('__game.enemies.killAll(), 1');
    await ev('__game.buff("maxHp", 200), 1');
    console.log('     （headless 帧率：' + (await ev('__game.ui.perf.state().eff')) + ' 档 / ' + (await ev('__game.ui.perf.state().fps')) + ' fps）');
    await ev('__game.heal.fill(), 1');
    const btns = await ev('__game.block65.buttons()');
    const healBtn = (btns || []).find((b) => b.id === 'heal');
    const rainBtn = (btns || []).find((b) => b.id === 'arrowRain');
    ok(!!healBtn, '技能栏里有回血');
    ok(healBtn && healBtn.shown === true, '回血这一格是显示的');
    ok(healBtn && healBtn.art === true, '回血图标换成了内联 SVG（绿十字）');
    ok(healBtn && healBtn.img === false, '不再用那张灰扑扑的 png');
    ok(healBtn && healBtn.ring === true, '回血键带外圈冷却环');
    ok(healBtn && typeof healBtn.offset === 'number' && healBtn.offset >= 0 && healBtn.offset <= 164,
      '外圈环的 dashoffset 在 0~163.36 之间', String(healBtn && healBtn.offset));
    ok(!!rainBtn && rainBtn.shown === true, '箭雨也在（第二关起开局自带）');

    const rects = await skillRects();
    ok(!!rects.heal && !!rects.arrowRain, '两个键都量到了坐标', JSON.stringify(rects));
    // 隐形遮挡的回归：落点上最上层元素必须是技能键自己
    const topAt = await ev(`(() => {
      const b = document.querySelector('.sk[data-skill="heal"]');
      const r = b.getBoundingClientRect();
      const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      const sk = el && el.closest ? el.closest('.sk') : null;
      return JSON.stringify({ tag: el ? el.id || el.className : null, skill: sk ? sk.dataset.skill : null });
    })()`);
    const top = JSON.parse(topAt);
    ok(top.skill === 'heal', '回血键上方没有隐形元素挡着', topAt);
    await ev('__game.heal.hurt(4), 1');
    const hp0 = await ev('__game.heal.hp().cur');
    ok(await ev('__game.heal.state().ready') === true, '回血是就绪的');
    await tap(rects.heal.x, rects.heal.y, 71);
    const afterStill = JSON.parse(await ev('JSON.stringify(__game.heal.state())'));
    ok(afterStill.used >= 1, '静止点回血：真的用掉了', JSON.stringify(afterStill));
    const hp1 = await ev('__game.heal.hp().cur');
    ok(hp1 > hp0 + 3, '生命真的回了', hp0 + ' → ' + hp1);
    ok(afterStill.cd > 0, '冷却开始走', String(afterStill.cd));

    // 等回血转好，一边推摇杆一边点（用户报的 bug 现场）
    await ev('__game.heal.fill(), 1');
    ok(await ev("__game.state === 'playing'"), '等 CD 之前世界还在 playing（没被怪啃死）', await ev('__game.state'));
    ok(await waitCd('__game.heal.state().cd <= 0.05', '回血 CD'), '回血 CD 转好了');
    await ev('__game.heal.fill(), __game.heal.hurt(4), 1');
    const hp2 = await ev('__game.heal.hp().cur');
    await tapWhileMoving(rects.heal.x, rects.heal.y, 81);
    const afterMove = JSON.parse(await ev('JSON.stringify(__game.heal.state())'));
    const hp3 = await ev('__game.heal.hp().cur');
    ok(hp3 > hp2 + 3, '边推摇杆边点回血：也回了', hp2 + ' → ' + hp3);
    ok(afterMove.cd > 0, '边推摇杆边点：冷却真的转起来了', String(afterMove.cd));

    // 箭雨需要「射程内的活靶子」，否则 fire() 直接 return false，看起来像「点了没反应」。
    // 两条坑（探针 v8 实测）：
    //   ① 别用小兵 minion —— 它是 selfDestruct 自爆怪，追到脸上就炸了，8 秒后 probe().n 直接归零；
    //   ② 血要钉高 —— 否则被自动近战一秒拍掉，点下去那一刻刚好没目标。
    async function makeTarget() {
      await ev(`(() => {
        const p = __game.pos;
        const m = __game.enemies.spawn('warrior', { x: p.x + 3.6, z: p.z + 0.6 });
        if (m) { m.hp = 9999; m.maxHp = 9999; }
        return 1;
      })()`);
      await sleep(1600);   // 等它离开 spawn 态（spawn 的怪不算索敌目标）
    }
    await makeTarget();
    ok(await waitCd('__game.arrowRain.state().ready === true', '箭雨就绪'), '箭雨就绪了（第一轮）');
    const tg1 = JSON.parse(await ev('JSON.stringify(__game.arrowRain.probe())'));
    ok(tg1.n > 0, '射程内有活靶子（不然点了不算 bug）', JSON.stringify(tg1));
    await tapWhileMoving(rects.arrowRain.x, rects.arrowRain.y, 85);
    ok((await ev('__game.arrowRain.state()')).ready === false, '边推摇杆边点箭雨：放出去了（CD 转起来）');
    // 再等一轮，静止点一次做对照
    await ev('__game.heal.fill(), 1');
    ok(await waitCd('__game.arrowRain.state().ready === true', '箭雨 CD'), '箭雨 CD 转好了（第二轮）');
    await makeTarget();
    const tg2 = JSON.parse(await ev('JSON.stringify(__game.arrowRain.probe())'));
    ok(tg2.n > 0, '第二轮射程内也有活靶子', JSON.stringify(tg2));
    await tap(rects.arrowRain.x, rects.arrowRain.y, 75);
    ok((await ev('__game.arrowRain.state()')).ready === false, '静止点箭雨：同样放得出去');

    // ============================================================
    console.log('\n[D] 读条 HUD：百分比跟着擦名者走、65% 变 warn、首次弹讲解卡');
    // ============================================================
    await ev('__game.block65.hint.forget("cast"), 1');
    const castStart = await ev('JSON.stringify(__game.block65.cast.start(0.4))');
    ok(castStart !== 'null', '成功让一只擦名者进入读条', castStart);
    await sleep(600);
    ok(await ev("__game.state === 'hint'"), '第一次读条会暂停并弹讲解卡', await ev('__game.state'));
    const ct = await ev('__game.block65.hint.text()');
    ok((ct.title || '').includes('百分比'), '讲解卡讲的是头顶那条百分比', ct.title);
    ok((ct.body || '').includes('擦名者') && (ct.body || '').includes('65%'), '正文提到擦名者与 65% 变粉');
    await shot('d-cast-hint.png');
    // 进度在冻结期间不该自己往前跑
    const pA = await ev('(c => c ? c.progress : null)(__game.block65.cast.info())');
    await sleep(900);
    const pB = await ev('(c => c ? c.progress : null)(__game.block65.cast.info())');
    ok(pA != null && Math.abs(pB - pA) < 0.02, '讲解期间进度冻住不动', pA + ' → ' + pB);
    await ev('__game.block65.hint.close(), 1');
    await sleep(500);
    ok(await ev("__game.state === 'playing'"), '关掉讲解卡回到 playing');
    const hud1 = JSON.parse(await ev('JSON.stringify(__game.block65.cast.hud())'));
    ok(hud1.visible === true, '头顶进度条出现在屏幕上', JSON.stringify(hud1));
    ok(/^\d+%$/.test(hud1.pct), '进度条上有百分比数字', hud1.pct);
    ok(/px$/.test(hud1.left) && /px$/.test(hud1.top), '位置跟着奶蛙投影算出来了', hud1.left + ',' + hud1.top);
    ok(hud1.warn === false, '没过 65% 不报警', String(hud1.pct));
    // 拉到 70%：应该变 warn，数字也跟着走。
    // 注意取样窗口：前摇一共 2.6 秒，0.7 只剩 0.78 秒，读慢了它就擦完收工、HUD 直接消失。
    await ev('__game.block65.cast.start(0.7), 1');
    await sleep(120);
    const hud2 = JSON.parse(await ev('JSON.stringify(__game.block65.cast.hud())'));
    ok(parseInt(hud2.pct, 10) >= 65, '进度条数字在涨', hud2.pct);
    ok(hud2.warn === true, '过 65% 变成告警（变粉 + 脉动）', String(parseInt(hud2.pct, 10)));
    ok(hud2.visible === true, '告警时 HUD 还亮着', JSON.stringify(hud2));
    await shot('d-cast-hud.png');
    // 只讲一次
    ok(await ev('__game.block65.hint.seen("cast")') === true, '讲解过就记进档案');
    // 杀掉擦名者，HUD 应该消失
    await ev(`(() => {
      for (const e of __game.enemies.list) if (e.cfg.erase && e.state !== 'dead') e.state = 'dead';
      return 1;
    })()`);
    await sleep(700);
    ok(await ev('__game.block65.cast.hud().visible') === false, '没有擦名者读条了，HUD 自动收起');
    ok(await ev('__game.block65.cast.info() === null'), 'eraseCast 返回 null');

    // ============================================================
    console.log('\n[E] 缝补小巫：绿加号一串串往上浮（第 4 条）');
    // ============================================================
    const plusFx = JSON.parse(await ev(`(async () => {
      const p = __game.pos;
      __game.enemies.spawn('mender', { x: p.x + 2.4, z: p.z + 0.6 });
      const wounded = [];
      for (let i = 0; i < 2; i++) {
        // warrior 而不是 minion：minion 是自爆怪，等在 spawn 态的时候就没了
        const m = __game.enemies.spawn('warrior', { x: p.x + 3.0 + i * 0.7, z: p.z + 0.2 });
        if (m) { m.hp = 40; m.maxHp = 40; wounded.push(m); }
      }
      await new Promise((r) => setTimeout(r, 1200));   // 等它们离开 spawn 态
      for (const e of __game.enemies.list) {
        if (e.state === 'dead') continue;
        if (e.cfg.spell) continue;
        e.hp = e.maxHp * 0.4;
      }
      const mend = __game.enemies.list.find((e) => e.cfg.spell && e.cfg.spell.kind === 'mend' && e.state !== 'dead');
      if (!mend) return JSON.stringify({ err: '没有小巫' });
      // 直接推进到读条末：下一帧就会结算 mendWounds
      mend.state = 'attack';
      mend.t = mend.cfg.windup - 0.01;
      mend.hitDone = false;
      let peak = 0;
      const t0 = Date.now();
      while (Date.now() - t0 < 1500) {
        await new Promise((r) => setTimeout(r, 100));
        const c = __game.fx.counts ? __game.fx.counts() : { plus: -1 };
        if (c.plus > peak) peak = c.plus;
      }
      return JSON.stringify({ peak, hasCounts: !!__game.fx.counts });
    })()`));
    ok(plusFx.hasCounts === true, 'fx 暴露了 counts()（能数绿加号）');
    ok(plusFx.peak >= 3, '治疗时同时有好几个绿加号在飘（不是一闪就没）', String(plusFx.peak));
    await shot('e-plus.png');

    // ============================================================
    console.log('\n[F] 雾鬼：隐身几乎看不见 / 显形亮起来（第 5 条）');
    // ============================================================
    const ghost = JSON.parse(await ev(`(async () => {
      const p = __game.pos;
      const g = __game.enemies.spawn('wraith', { x: p.x + 7.5, z: p.z - 1.2 });
      if (!g) return JSON.stringify({ err: '生不出雾鬼' });
      // 雾鬼只有 2 点血：放远了也怕被自动近战顺手拍死，死了材质会淡出，
      // 读出来就是「显形 0.72」这种中间值（假红）。血钉高，纯粹看材质。
      g.hp = 9999; g.maxHp = 9999;
      await new Promise((r) => setTimeout(r, 1200));
      const readMat = () => {
        let op = 0, em = 0, n = 0;
        for (const m of g.mats) {
          if (m.transparent) { op = Math.max(op, m.opacity); n++; }
          if (m.emissive) em = Math.max(em, m.emissiveIntensity);
        }
        return { opacity: +op.toFixed(3), emissive: +em.toFixed(2), mats: n };
      };
      g.ghostHidden = true; g.ghostT = 99;
      await new Promise((r) => setTimeout(r, 1100));
      const hidden = readMat();
      g.ghostHidden = false; g.ghostT = 99;
      await new Promise((r) => setTimeout(r, 1100));
      const shown = readMat();
      return JSON.stringify({ hidden, shown });
    })()`));
    ok(!ghost.err, '生成了雾鬼', ghost.err);
    ok(ghost.hidden && ghost.hidden.opacity <= 0.1, '隐身时透明度压到 0.05 一带', String(ghost.hidden && ghost.hidden.opacity));
    ok(ghost.shown && ghost.shown.opacity >= 0.85, '显形时基本不透明', String(ghost.shown && ghost.shown.opacity));
    const diff = ghost.hidden && ghost.shown ? ghost.shown.opacity - ghost.hidden.opacity : 0;
    ok(diff >= 0.8, '显隐差别足够大（原来只差 0.84→0.16 = 0.68 那种看不太出来）', diff.toFixed(3));
    ok(ghost.hidden && ghost.hidden.emissive <= 0.5, '隐身时自发光压到 0.3', String(ghost.hidden && ghost.hidden.emissive));
    ok(ghost.shown && ghost.shown.emissive >= 1.8, '显形时自发光拉到 2.2（雾里一眼能认出）', String(ghost.shown && ghost.shown.emissive));

    // ============================================================
    console.log('\n[G] 五六关难度：伤害 ×1.35 / 血量 ×1.15（第四关不动）');
    // ============================================================
    const scales = JSON.parse(await ev(`JSON.stringify({
      l4: __game.levels[4].scale, l5: __game.levels[5].scale, l6: __game.levels[6].scale,
    })`));
    ok(scales.l5 && Math.abs(scales.l5.dmgMul - 1.35) < 1e-6, '第五关伤害 ×1.35', String(scales.l5 && scales.l5.dmgMul));
    ok(scales.l5 && Math.abs(scales.l5.hpMul - 1.15) < 1e-6, '第五关血量 ×1.15', String(scales.l5 && scales.l5.hpMul));
    ok(scales.l6 && Math.abs(scales.l6.dmgMul - 1.35) < 1e-6, '第六关伤害 ×1.35', String(scales.l6 && scales.l6.dmgMul));
    ok(scales.l6 && Math.abs(scales.l6.hpMul - 1.15) < 1e-6, '第六关血量 ×1.15', String(scales.l6 && scales.l6.hpMul));
    ok(!scales.l4.dmgMul && !scales.l4.hpMul, '第四关没被顺手抬起来（回归）', JSON.stringify(scales.l4));

    // ============================================================
    console.log('\n[I] 重打第一关：开头就自带环剑 + 箭雨（第 8 条）');
    // ============================================================
    ok(await ev('__game.block65.rainObtained()') === true, '档案里已经记下「箭雨获得过」');
    const re1 = JSON.parse(await ev(`(() => {
      __game.setLevel(1);
      return JSON.stringify(__game.block65.prefill());
    })()`));
    ok(re1.ring === true, '切回第一关：环剑照样在', JSON.stringify(re1));
    ok(re1.rain === true, '切回第一关：箭雨照样在', JSON.stringify(re1));
    ok(await ev('__game.levelId') === 1, '确实切到了第一关');

    // ============================================================
    console.log('\n[H] 关底民心事件不再被吞（第 7 条，需要 &story）');
    // ============================================================
    await send('Page.navigate', { url: 'http://127.0.0.1:8124/index.html?debug=1&story&title' });
    await waitFor('!!window.__game', 90000, '__game 就绪（story 版）');
    await sleep(1500);
    await clearOverlays();
    await ev("document.getElementById('btnStart').click(), 1");
    await sleep(500);
    await clearOverlays();
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
    for (let i = 0; i < 10; i++) {
      const st = await ev('__game.state');
      if (st === 'playing' || st === 'hint') break;
      if (st === 'wtut') await ev("document.getElementById('wtSkip')?.click(), 1");
      else if (st === 'meet') await ev("document.getElementById('mtOk')?.click(), 1");
      else if (st === 'tutorial') await ev("document.getElementById('tcSkip')?.click(), 1");
      await sleep(700);
    }
    if (await ev("__game.state === 'hint'")) { await ev('__game.block65.hint.close(), 1'); await sleep(300); }
    await ev('__game.setAdmin(true), 1');
    await sleep(300);
    const gold = JSON.parse(await ev(`JSON.stringify(__game.repEv.pools().good.slice(0, 3))`));
    ok(gold.length > 0, '民心专属事件池里有货', JSON.stringify(gold));
    const pickId = gold[0].id;
    ok(await ev(`__game.repEv.clear(), __game.repEv.push(${JSON.stringify(pickId)}), 1`) === 1, '往队列里塞一条民心事件');
    await ev('__game.jumpRound(20), 1');
    await sleep(900);
    await ev('__game.enemies.killAll(), __game.skipRound(), 1');
    await sleep(1500);
    const stH = await ev('__game.state');
    ok(stH === 'event', '关底清完回合后弹出的是民心事件（原来直接被吞）', stH);
    const evTitle = await ev("(document.getElementById('evTitle') || {}).textContent || ''");
    const evStory = await ev("(document.getElementById('evStory') || {}).textContent || ''");
    console.log('     事件卡：' + evTitle + ' / ' + evStory.slice(0, 40));
    ok(!!evTitle, '事件卡有标题', evTitle);
    const poolTitle = gold[0].title;
    ok(evTitle.includes(poolTitle), '弹出的正是队列里那条（' + poolTitle + '）', evTitle);
    ok((await ev('__game.repEv.queue()')).length === 0, '队列已经消费掉，不会再重复播');
    await shot('h-end-repevent.png');

    // ============================================================
    console.log('\n[J] 全程 0 JS 报错');
    // ============================================================
    const realErrors = jsErrors.filter((s) => s && !/favicon|net::ERR|404/i.test(s));
    ok(realErrors.length === 0, '没有 JS 报错', realErrors.slice(0, 3).join(' | '));
  } catch (e) {
    fail++;
    fails.push('运行异常：' + (e && e.message));
    console.log('\n✗ 运行异常：' + (e && e.message));
  } finally {
    try { ws && ws.close(); } catch (_) {}
    try { chrome.kill(); } catch (_) {}
    await sleep(300);
    try { fs.rmSync(UD, { recursive: true, force: true }); } catch (_) {}
  }

  console.log('\n结果：' + pass + ' 通过 / ' + fail + ' 失败');
  if (fails.length) console.log('失败项：\n - ' + fails.join('\n - '));
  console.log('截图：' + OUT);
  process.exit(fail ? 1 : 0);
})();
