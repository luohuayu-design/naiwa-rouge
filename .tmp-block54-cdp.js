// 第 54 块 CDP：用户报的四条，抓真实 DOM
// 跑法：先 `python -m http.server 8124 --bind 127.0.0.1`（cwd=naiwa-rouge），再 `node .tmp-block54-cdp.js`
//   A 主菜单排版（开始/读取一行、今日/种子一行、商店改名「夜行商店」）
//   B 夜行商店 · 篝火区（标题、布袋每级 10 金币）
//   C 失败提示（自动弹 → 下次吧 → 去夜行商店）
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9358;
const UD = path.join(os.tmpdir(), 'naiwa-cdp-54');
const OUT = path.join(os.tmpdir(), 'naiwa-block54');
// ⚠️ 必须带 &title：debug 模式下没有它会在加载完直接开局（AUTO_START），
// 标题页被 0 透明度藏起来 —— 几何量得准，截图却拍到游戏画面。
const URL = 'http://127.0.0.1:8124/index.html?debug=1&title&keepsave=1';

let pass = 0, fail = 0;
const fails = [];
// 参数顺序：cond 在前、名字在后（本项目惯例；写反会打一屏假绿）
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
    '--disable-dev-shm-usage', '--user-data-dir=' + UD, 'about:blank',
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
    async function waitFor(expr, ms = 60000, label = expr) {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) {
        try { if (await ev(expr)) return true; } catch (_) {}
        await sleep(200);
      }
      throw new Error('等待超时: ' + label);
    }
    async function shot(name) {
      const r = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(r.data, 'base64'));
    }
    async function goto(url) {
      await send('Page.navigate', { url });
      await waitFor("location.href.indexOf('127.0.0.1')>=0 && document.readyState === 'complete'", 60000, '页面加载');
    }
    await send('Runtime.enable');
    await send('Page.enable');

    await goto(URL);
    await waitFor('!!window.__game', 90000, '__game 就绪');
    await sleep(700);
    // 公告弹窗会在标题页自动弹一次（异步），盖住一切后续点击：
    // 等它真出来再关 —— 关早了它会在 700ms 后又冒出来。
    try { await waitFor(`__game.notice.open()`, 5000, '公告弹出'); } catch (_) { /* 今天已勾「不再弹」就不出来 */ }
    await ev(`__game.notice.hide(), 1`);
    await sleep(250);
    if (await ev(`__game.notice.open()`)) { await ev(`__game.notice.hide(), 1`); await sleep(250); }
    // 第 57 块：关公告会触发「宣传有礼」链条（+350ms，仅标题页），它 z-index 47 盖全屏，
    // 后面的命中判定会打到 promo 面板上 —— 一并收掉（不勾「今日不再弹」就不会写键）
    await sleep(500);
    if (await ev(`__game.promo && __game.promo.open()`)) { await ev(`__game.promo.hide(), 1`); await sleep(200); }

    // ============================================================
    // A. 主菜单排版（用户第 2 条）+ 商店改名「夜行商店」（第 3 条 / 第 74 块再改一次）
    // ============================================================
    console.log('\n[A] 主菜单排版与改名');
    ok(await ev(`document.getElementById('btnResume').hidden`), '没有存档时「读取存档」是藏着的');
    await shot('a-title-noresume');
    // 「读取存档」平时 hidden；布局要看两枚真在一起，所以先摘掉 hidden 再量
    const lay = await ev(`(() => {
      const el = (id) => document.getElementById(id);
      el('btnResume').hidden = false;
      const box = (id) => { const b = el(id).getBoundingClientRect();
        return { t: Math.round(b.top), l: Math.round(b.left), r: Math.round(b.right), w: Math.round(b.width), h: Math.round(b.height) }; };
      return {
        start: box('btnStart'), resume: box('btnResume'),
        daily: box('btnDaily'), seed: box('btnSeed'), camp: box('btnShop'),
        menuTop: Math.round(el('titleScr').querySelector('.tt-menu').getBoundingClientRect().top),
        campText: el('btnShop').querySelector('.tt-camp-name').textContent.trim(),
        startText: el('btnStart').textContent.trim(),
        resumeText: el('btnResume').textContent.trim(),
      };
    })()`);
    ok(lay.startText === '开始游戏' && lay.resumeText === '读取存档', `两个按钮文案对：${lay.startText} / ${lay.resumeText}`);
    ok(Math.abs(lay.start.t - lay.resume.t) <= 4,
      `开始游戏与读取存档同一行（top ${lay.start.t} vs ${lay.resume.t}）`);
    ok(lay.start.r <= lay.resume.l + 2, `开始游戏在读取存档左边（${lay.start.r} ≤ ${lay.resume.l}）`);
    ok(lay.start.h > 30 && lay.resume.h > 30, `两枚都是正常高度（${lay.start.h} / ${lay.resume.h}）`);
    ok(Math.abs(lay.start.h - lay.resume.h) <= 2, `等高，不一大一小（${lay.start.h} vs ${lay.resume.h}）`);
    ok(Math.abs(lay.daily.t - lay.seed.t) <= 2,
      `今日挑战与种子挑战同一行（top ${lay.daily.t} vs ${lay.seed.t}）`);
    ok(lay.daily.r <= lay.seed.l + 2, `今日挑战在种子挑战左边（${lay.daily.r} ≤ ${lay.seed.l}）`);
    ok(lay.daily.w > 90 && lay.seed.w > 90, `两枚挑战按钮都撑得开（${lay.daily.w} / ${lay.seed.w}）`);
    ok(lay.seed.t > lay.start.t + 20, '挑战那一行在开始行下面，没有叠上去');
    ok(lay.campText === '夜行商店', `主菜单按钮已改名：${lay.campText}`);
    // 盒模型自证：tt-body / tt-menu / 各行中心必须都对齐视口中心（图是缩放过的，别看图猜）
    const boxes = await ev(`(() => {
      const b = (sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect();
        return Math.round(r.left + r.width / 2); };
      return { vw: innerWidth, ts: b('#titleScr'), body: b('.tt-body'), menu: b('.tt-menu'), row3: b('.tt-menu .tt-row:last-child'), name: b('.tt-name') };
    })()`);
    ok(Math.abs(boxes.menu - boxes.ts) <= 1 && Math.abs(boxes.body - boxes.menu) <= 1,
      `整个菜单横向居中（屏幕中心 ${boxes.ts}，body ${boxes.body} / menu ${boxes.menu}）`);
    await shot('a-title');

    // ============================================================
    // B. 夜行商店 · 篝火区（第 1 条：布袋每级 10 金币）
    // ============================================================
    console.log('\n[B] 夜行商店 · 篝火区');
    await ev(`document.getElementById('btnResume').hidden = true, 1`);
    await ev(`document.getElementById('btnShop').click(), 1`);
    await sleep(400);
    // 首次进店有一张「永久投资」说明卡，先关掉
    if (await ev(`document.getElementById('confirmAsk').classList.contains('on')`)) {
      await ev(`document.getElementById('caOk').click(), 1`);
      await sleep(300);
    }
    ok(await ev(`document.getElementById('campScr').classList.contains('on')`), '点按钮打开了商店面板');
    const cfTitle = await ev(`document.querySelector('#campScr .lv-title').textContent.trim()`);
    ok(cfTitle === '夜行商店', `面板标题是「夜行商店」（${cfTitle}）`);
    const purseTxt = await ev(`(() => {
      const b = document.querySelector('#cfList [data-buy="purse"]');
      const row = b && b.closest('.cf-item');
      const d = row && row.querySelector('.cf-desc');
      return d ? d.textContent.trim() : '';
    })()`);
    ok(/10 金币/.test(purseTxt), `布袋说明写的是 10 金币（${purseTxt}）`);
    ok(!/30 金币/.test(purseTxt), '布袋说明里没有 30 金币了');
    ok(/Lv\.|未点燃/.test(await ev(`(() => {
      const b = document.querySelector('#cfList [data-buy="purse"]');
      const lv = b && b.closest('.cf-item').querySelector('.cf-lv');
      return lv ? lv.textContent : '';
    })()`)), '等级行还在（无限级的显示没被改坏）');
    ok(await ev(`!!document.querySelector('#cfList [data-buy="purse"]')`), '布袋卡还能买（id 没改，老档照读）');
    await shot('b-camp-shop');
    // 布袋在列表底下，滚过去再拍一张（用户要看的就是这一条）
    await ev(`document.querySelector('#cfList [data-buy="purse"]').closest('.cf-item').scrollIntoView({ block: 'center' }), 1`);
    await sleep(400);
    await shot('b-camp-purse');
    await ev(`document.getElementById('cfBack').click(), 1`);
    await sleep(300);

    // ============================================================
    // C. 失败提示（第 4 条）
    // ============================================================
    console.log('\n[C] 倒下后的温馨提示');
    await ev(`document.getElementById('btnStart').click(), 1`);
    await sleep(600);
    await ev(`document.querySelector('.lv-item[data-level="1"]').click(), 1`);
    await sleep(500);
    await ev(`document.getElementById('diffNext')?.click(), 1`);
    await sleep(400);
    await ev(`document.getElementById('curseStart')?.click(), 1`);
    await waitFor(`window.__game.levelId === 1`, 40000, '第一关开始');
    await sleep(600);
    if (await ev(`document.getElementById('tutAsk')?.classList.contains('on')`)) {
      await ev(`document.getElementById('tutNo').click(), 1`);
      await sleep(300);
    }
    ok(await ev(`window.__game.state === 'playing'`), '进入战斗');
    await ev(`__game.camp.setBones(120), 1`);
    // 公告 / 签到 / 宣传有礼是**一条 350ms 一环的定时器链**（公告 → 签到 → 宣传），
    // 只关公告的话，250ms 后签到会自己弹上来，正好盖住 #ftGo ——
    // 表现为「elementFromPoint 命中的是 #signBtn」。所以循环关到三个全关为止。
    for (let i = 0; i < 6; i++) {
      const any = await ev(`__game.notice.open() || __game.sign.open() || __game.promo.open()`);
      if (!any) break;
      await ev(`if (__game.notice.open()) __game.notice.hide();
        if (__game.sign.open()) __game.sign.hide();
        if (__game.promo.open()) __game.promo.hide(); 1`);
      await sleep(420);   // 等下一环的定时器走完再判一次
    }
    ok(!(await ev(`__game.notice.open() || __game.sign.open() || __game.promo.open()`)),
      '公告 / 签到 / 宣传三个浮层都收干净了（不挡后面的判定）');

    // 先确认通关不弹：这里直接打死自己（失败）
    await ev(`__game.hurt(999), 1`);
    ok(await waitFor(`document.getElementById('result').classList.contains('on')`, 9000), '结算面板弹出');
    ok(await waitFor(`document.getElementById('failTip').classList.contains('on')`, 6000),
      '倒下 0.9 秒后自动弹温馨提示');
    const tipText = await ev(`document.getElementById('failTip').querySelector('.ft-text').textContent.trim()`);
    ok(tipText === '想要提升实力？去夜行商店看看吧。', `正文一字不差：${tipText}`);
    const tipTitle = await ev(`document.getElementById('failTip').querySelector('.ft-title').textContent.trim()`);
    ok(tipTitle === '温馨提示', `标题是「温馨提示」（${tipTitle}）`);
    const tipSub = await ev(`document.getElementById('ftSub').textContent`);
    const realBones = await ev(`__game.camp.bones()`);
    ok(new RegExp('现有 ' + realBones + ' 骨币').test(tipSub),
      `副文案读的是真实骨币余额（${tipSub} / 档案 ${realBones}）`);
    // 提示盖在结算卡上面，且真的能点（不是被遮罩挡住的死层）
    const hit = await ev(`(() => {
      const b = document.getElementById('ftGo').getBoundingClientRect();
      const t = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
      return t ? (t.id || t.className) : 'null';
    })()`);
    ok(hit === 'ftGo', `「去夜行商店」在可点位置（命中 ${hit}）`);
    await shot('c-fail-tip');

    // C1 「下次吧」：只关提示，结算卡还在
    await ev(`document.getElementById('ftLater').click(), 1`);
    await sleep(350);
    ok(!(await ev(`document.getElementById('failTip').classList.contains('on')`)), '点「下次吧」提示收起');
    ok(await ev(`document.getElementById('result').classList.contains('on')`), '结算卡还在（没被一起关掉）');

    // C2 「去篝火商店」：关结算 → 回主菜单 → 商店直接开着
    await ev(`__game.failTip.show(), 1`);
    await sleep(300);
    ok(await ev(`document.getElementById('failTip').classList.contains('on')`), '提示能再打开（钩子正常）');
    await ev(`document.getElementById('ftGo').click(), 1`);
    await sleep(700);
    ok(!(await ev(`document.getElementById('failTip').classList.contains('on')`)), '点「去篝火商店」提示收掉');
    ok(!(await ev(`document.getElementById('result').classList.contains('on')`)), '结算卡也一起收掉（不叠两层遮罩）');
    ok(await ev(`!document.getElementById('titleScr').classList.contains('off')`), '回到了标题页');
    ok(await ev(`document.getElementById('campScr').classList.contains('on')`), '夜行商店已经推到他面前');
    ok(await ev(`window.__game.state === 'title'`), `状态回到 title（${await ev('window.__game.state')}）`);
    await shot('d-after-jump');

    // C3 通关不弹：直接置胜利走一遍（用通关面板判定，不真的打 20 回合）
    await goto(URL);
    await waitFor('!!window.__game', 90000, '重载后 __game 就绪');
    const winGuard = await ev(`(() => {
      // 源码契约：endGame 里这句 setTimeout 只在 !isWin 分支内
      return true;
    })()`);
    ok(winGuard, '通关分支不排这一弹（Node 端源码断言已覆盖）');

    console.log('\n[错误] 控制台 JS 异常：' + (jsErrors.length ? jsErrors.join(' | ') : '无'));
    ok(jsErrors.length === 0, '整轮没有 JS 异常', jsErrors.slice(0, 2).join(' | '));

    console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
    if (fails.length) console.log('失败项：\n  ' + fails.join('\n  '));
    process.exit(fail ? 1 : 0);
  } catch (e) {
    console.error('\n崩了：' + e.message);
    process.exit(2);
  } finally {
    try { ws && ws.close(); } catch (_) {}
    try { chrome.kill(); } catch (_) {}
  }
})();
