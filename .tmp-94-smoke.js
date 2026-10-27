// 第 94 块 · 冒烟（真浏览器）
//   ① 版本同步、加载无 JS 异常
//   ② 底部三个 tab 切换：面板跟着切、收起的那个不吃点击（visibility:hidden）
//   ③ 每日任务面板：5 条（简 3 + 中 1 + 难 1）、常驻那条在、进度条、倒计时在走
//   ④ 领奖：领到骨币、按钮变「已领」、tab 红点熄灭
//   ⑤ 成就面板：八组手风琴、展开的那一组真的建出了条目、进度条与骨币徽章
//   ⑥ 盲盒奖池手风琴：三个匣子、三色、每个匣子概率合计 100%
//   ⑦ 盲盒价目表在页面上真的是 +3%
// 跑法：先起 `python -m http.server 8124`（cwd=naiwa-rouge），再 `node .tmp-94-smoke.js`
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9494;
const UD = path.join(os.tmpdir(), 'naiwa-cdp-94smoke');
const SHOT_QUEST = path.join(os.tmpdir(), 'naiwa-94-quest.png');
const SHOT_ACH = path.join(os.tmpdir(), 'naiwa-94-ach.png');
const SHOT_POOL = path.join(os.tmpdir(), 'naiwa-94-pool.png');
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
    '--window-size=430,932',
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
        try { if (await ev(expr)) return true; } catch (_) { /* 未就绪 */ }
        await sleep(150);
      }
      throw new Error('等超时：' + why);
    }
    async function shot(file) {
      const r = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(file, Buffer.from(r.result.data, 'base64'));
    }
    // 标题页上会弹公告 / 签到 / 宣传，逐个关掉，别挡着面板
    // 公告 → 签到 → 宣传有礼是一条 350ms 一环的定时器链（closeNotice → afterNoticeChain
    // → showSignin(auto) → closeSignin(wasAuto) → showPromo）。逐环拆，拆完用
    // 「今日内不再弹出」把公告和宣传都记进 localStorage，后面就不会再冒出来。
    let overlaysDone = false;
    async function clearOverlays() {
      // 第二次起：第一次已经把「今日不再弹」写进 localStorage，全关着就直接走
      if (overlaysDone) {
        const any0 = await ev(`(() => {
          const ovs = ['noticeOv', 'signOv', 'promoOv'].map((k) => document.getElementById(k)).filter(Boolean);
          return ovs.some((o) => o.classList.contains('on'));
        })()`);
        if (!any0) return true;
      }
      // 进主界面 700ms 后才弹公告 —— 先等它真的出现，不然点了也是空点
      console.log('   [clear] 浮层状态：', await ev(`(() => {
        const g = (k) => { const o = document.getElementById(k); return o ? o.classList.contains('on') : '缺'; };
        return 'notice=' + g('noticeOv') + ' sign=' + g('signOv') + ' promo=' + g('promoOv')
          + ' state=' + __game.state + ' idle=' + (typeof titleIdle);
      })()`));
      await waitFor(`document.getElementById('noticeOv').classList.contains('on')`, 8000, '等公告弹出来');
      await ev(`(() => { const c = document.getElementById('noticeHideToday'); if (c) c.checked = true; return 1; })()`);
      await ev(`document.getElementById('noticeX').click()`);
      await waitFor(`document.getElementById('signOv').classList.contains('on')`, 4000, '等签到跟着弹出来');
      await ev(`document.getElementById('signX').click()`);
      await waitFor(`document.getElementById('promoOv').classList.contains('on')`, 4000, '等宣传有礼跟着弹出来');
      await ev(`(() => { const c = document.getElementById('promoHideToday'); if (c) c.checked = true; return 1; })()`);
      await ev(`document.getElementById('promoX').click()`);
      await sleep(600);
      overlaysDone = true;
      // 兜底：万一哪一环没拆干净，再机械点几轮
      for (let i = 0; i < 6; i++) {
        const any = await ev(`(() => {
          const ovs = ['noticeOv', 'signOv', 'promoOv'].map((k) => document.getElementById(k)).filter(Boolean);
          return ovs.some((o) => o.classList.contains('on'));
        })()`);
        if (!any) return true;
        await ev(`(() => {
          const c = document.getElementById('promoHideToday'); if (c) c.checked = true;
          ['noticeX', 'signX', 'signClose', 'promoX', 'promoOk'].forEach((k) => {
            const b = document.getElementById(k); if (b) b.click();
          });
          return 1;
        })()`);
        await sleep(500);
      }
      return false;
    }

    await send('Page.navigate', { url: URL });
    await waitFor('!!window.__game', 90000, '等到 __game 就绪');
    await sleep(800);
    await clearOverlays();

    // ------------------------------------------------------------ 1
    console.log('\n[1] 版本与启动');
    const idxSrc = await ev(`fetch('index.html').then(r => r.text())`);
    const ver = (idxSrc.match(/v=(\d+)/) || [])[1] || '';
    ok(ver === '105', `index.html 版本 v=105（实读 ${ver}）`, ver);
    ok(jsErrors.length === 0, '加载阶段无 JS 异常', jsErrors.slice(0, 3).join(' | '));
    ok(await ev('!!document.getElementById("ttTabs")'), '底部三个 tab 在页面上');

    // ------------------------------------------------------------ 2
    console.log('\n[2] 三面板切换');
    await clearOverlays();
    const paneState = async () => ev(`(() => {
      const g = (k) => {
        const el = document.getElementById(k);
        const cs = getComputedStyle(el);
        return { on: el.classList.contains('on'), vis: cs.visibility, op: +cs.opacity, pe: cs.pointerEvents };
      };
      return { main: g('ttPaneMain'), quest: g('ttPaneQuest'), ach: g('ttPaneAch'), tab: __game.tab() };
    })()`);
    let p = await paneState();
    ok(p.main.on && !p.quest.on && !p.ach.on, '进来默认落在主页面', JSON.stringify(p));
    ok(p.tab === 'main', '__game.tab() = main', p.tab);
    ok(p.quest.vis === 'hidden' && p.ach.vis === 'hidden',
      '另两个面板是 visibility:hidden（第 65/66 块：光淡出还会吃点击）', `${p.quest.vis}/${p.ach.vis}`);
    ok(p.quest.pe === 'none' && p.ach.pe === 'none', '另两个面板也不吃 pointer-events');

    await ev(`document.getElementById('ttTabQuest').click()`);
    await sleep(450);
    p = await paneState();
    ok(p.quest.on && !p.main.on, '点「每日任务」切到那一格', JSON.stringify(p));
    ok(p.tab === 'quest', '__game.tab() = quest', p.tab);
    ok(p.main.vis === 'hidden', '主页面收起（visibility:hidden）', p.main.vis);
    ok(p.quest.op > 0.9, '每日任务面板已经淡入完成（opacity 接近 1）', String(p.quest.op));
    ok(await ev(`document.getElementById('ttTabQuest').classList.contains('on')`), 'tab 本身亮了');
    ok(await ev(`!document.getElementById('ttTabMain').classList.contains('on')`), '主页面 tab 灭了');

    await ev(`document.getElementById('ttTabAch').click()`);
    await sleep(450);
    p = await paneState();
    ok(p.ach.on && !p.quest.on, '点「成就」切到那一格', JSON.stringify(p));
    ok(p.quest.vis === 'hidden', '每日任务面板收起', p.quest.vis);

    await ev(`document.getElementById('ttTabMain').click()`);
    await sleep(450);
    p = await paneState();
    ok(p.main.on && p.tab === 'main', '点回「主页面」能回去', JSON.stringify(p.tab));
    ok(await ev(`(() => {
      const b = document.getElementById('btnStart').getBoundingClientRect();
      return b.width > 40 && b.height > 20;
    })()`), '回主页面后「开始游戏」按钮还在原位（没被面板位移带跑）');
    // 平滑：切换是有 transition 的（用户要「平滑」）
    ok(await ev(`(() => {
      const cs = getComputedStyle(document.getElementById('ttPaneAch'));
      return /opacity/.test(cs.transition) && /transform/.test(cs.transition);
    })()`), '面板切换带 opacity + transform 过渡（用户要的「平滑」）');
    await shot(SHOT_QUEST.replace('.png', '-main.png'));

    // ------------------------------------------------------------ 3
    console.log('\n[3] 每日任务面板');
    await ev(`__game.tab('quest')`);
    await sleep(500);
    const q = await ev(`(() => {
      const rows = [...document.querySelectorAll('#qpList .qp-item')];
      return {
        n: rows.length,
        tiers: rows.map((r) => r.classList.contains('t-hard') ? 'hard' : (r.classList.contains('t-mid') ? 'mid' : 'easy')),
        names: rows.map((r) => (r.querySelector('.qp-i-n span') || {}).textContent || ''),
        tags: rows.map((r) => (r.querySelector('.qp-i-tag') || {}).textContent || ''),
        hasClear: rows.some((r) => (r.dataset.q === 'dq_clear_any')),
        bars: rows.filter((r) => r.querySelector('.qp-i-bar i')).length,
        descs: rows.filter((r) => ((r.querySelector('.qp-i-d') || {}).textContent || '').length > 2).length,
        boneIcon: !!document.querySelector('#qpList .qp-i-b i'),
        date: document.getElementById('qpDate').textContent,
        left: document.getElementById('qpLeft').textContent,
        allDisabled: document.getElementById('qpAll').disabled,
        allText: document.getElementById('qpAll').textContent,
      };
    })()`);
    ok(q.n === 5, `面板上正好 5 条（实得 ${q.n}）`);
    ok(q.tiers.filter((x) => x === 'easy').length === 3, '简单 3 条', q.tiers.join(','));
    ok(q.tiers.filter((x) => x === 'mid').length === 1, '中等 1 条', q.tiers.join(','));
    ok(q.tiers.filter((x) => x === 'hard').length === 1, '困难 1 条', q.tiers.join(','));
    ok(q.hasClear, '常驻那条「完整通过任一关卡」在面板上');
    ok(q.bars === 5, '每条都有进度条', String(q.bars));
    ok(q.descs === 5, '每条都有描述文字');
    ok(q.boneIcon, '每条都画了骨币图标');
    ok(q.tags.filter((x) => x === '简单').length === 3 && q.tags.includes('中等') && q.tags.includes('困难'),
      '难度标签文字正确（简单 / 中等 / 困难）', q.tags.join(','));
    ok(/月/.test(q.date) && /日/.test(q.date), `头部显示日期（${q.date}）`, q.date);
    ok(/^\d\d:\d\d:\d\d$/.test(q.left), `倒计时在走（${q.left}）`, q.left);
    ok(q.allDisabled, '一条都没达成时「一键领取」是灰的', q.allText);
    // 三档颜色确实不同（用户点名要的）
    const colors = await ev(`(() => {
      const pick = (cls) => {
        const r = [...document.querySelectorAll('#qpList .qp-item')].find((x) => x.classList.contains(cls));
        if (!r) return '';
        return getComputedStyle(r.querySelector('.qp-i-tag')).color;
      };
      return { easy: pick('t-easy'), mid: pick('t-mid'), hard: pick('t-hard') };
    })()`);
    // 图标是 mask + currentColor，验一下图标真的被着色了（不是外链 img 的黑）
    const icCol = await ev(`(() => {
      const r = [...document.querySelectorAll('#qpList .qp-item')].find((x) => x.classList.contains('t-hard'));
      if (!r) return '';
      const ic = r.querySelector('.qp-i-ic');
      if (!ic) return '';
      const cs = getComputedStyle(ic);
      return (cs.webkitMaskImage || cs.maskImage || '')+ ' / bg=' + cs.backgroundColor;
    })()`);
    ok(/quest-hard/.test(icCol) && /255|ff/i.test(icCol), `图标用了 mask 且有颜色（${icCol}）`, icCol);
    ok(colors.easy && colors.mid && colors.hard
      && new Set([colors.easy, colors.mid, colors.hard]).size === 3,
      '三档用三种颜色区分', JSON.stringify(colors));
    // 倒计时每秒在动
    const l1 = await ev(`document.getElementById('qpLeft').textContent`);
    await sleep(1600);
    const l2 = await ev(`document.getElementById('qpLeft').textContent`);
    ok(l1 !== l2, `倒计时一秒后变了（${l1} → ${l2}）`, `${l1}/${l2}`);
    await shot(SHOT_QUEST);

    // ------------------------------------------------------------ 4
    console.log('\n[4] 领奖（骨币真的到账）');
    const before = await ev('__game.ui.bones()');
    // 直接把「完整通过任一关卡」灌满，模拟玩家真去通了一关
    await ev(`__game.dq.pump({ wins: 1 })`);
    await ev(`__game.tab('main'); __game.tab('quest')`);
    await sleep(400);
    const q2 = await ev(`(() => {
      const row = [...document.querySelectorAll('#qpList .qp-item')].find((r) => r.dataset.q === 'dq_clear_any');
      const btn = row.querySelector('.qp-btn');
      return {
        done: row.classList.contains('done'),
        btnText: btn.textContent, disabled: btn.disabled,
        cls: btn.className,
        progress: row.querySelector('.qp-i-p').textContent,
        barW: row.querySelector('.qp-i-bar i').style.width,
        dot: !document.getElementById('tabDotQuest').hidden,
        allText: document.getElementById('qpAll').textContent,
        allDisabled: document.getElementById('qpAll').disabled,
      };
    })()`);
    ok(q2.done, '这条标记成已达成');
    ok(q2.btnText === '领取' && !q2.disabled, '按钮变成「领取」且可点', q2.btnText);
    ok(/done-ok/.test(q2.cls), '按钮用金色可领样式', q2.cls);
    ok(q2.progress === '1 / 1', '进度显示 1 / 1', q2.progress);
    ok(q2.barW === '100%', '进度条满格', q2.barW);
    ok(q2.dot, 'tab 上亮起了红点');
    ok(!q2.allDisabled && /一键领取/.test(q2.allText), '「一键领取」也亮了', q2.allText);

    await ev(`(() => { document.querySelector('#qpList .qp-item[data-q="dq_clear_any"] .qp-btn').click(); return 1; })()`);
    await sleep(400);
    const after = await ev('__game.ui.bones()');
    ok(after === before + 30, `骨币 +30（${before} → ${after}）`, `${before}->${after}`);
    const q3 = await ev(`(() => {
      const row = [...document.querySelectorAll('#qpList .qp-item')].find((r) => r.dataset.q === 'dq_clear_any');
      return {
        got: row.classList.contains('got'),
        btnText: row.querySelector('.qp-btn').textContent,
        disabled: row.querySelector('.qp-btn').disabled,
        dot: !document.getElementById('tabDotQuest').hidden,
        foot: document.getElementById('qpFoot').textContent,
      };
    })()`);
    ok(q3.got, '这条变成已领样式（半透明）');
    ok(q3.btnText === '已领' && q3.disabled, '按钮变「已领」且不可再点', q3.btnText);
    ok(!q3.dot, '领完红点熄灭');
    ok(/今天已领 30/.test(q3.foot), `页脚写着今天已领 30（${q3.foot}）`, q3.foot);

    // ------------------------------------------------------------ 5
    console.log('\n[5] 成就面板');
    await ev(`__game.tab('ach')`);
    await sleep(500);
    const a = await ev(`(() => {
      const secs = [...document.querySelectorAll('#acRoot .ac-sec')];
      const open = secs.find((s) => s.classList.contains('open'));
      return {
        n: secs.length,
        titles: secs.map((s) => (s.querySelector('.ac-hd-t') || {}).textContent || ''),
        counts: secs.map((s) => (s.querySelector('.ac-hd-c') || {}).textContent || ''),
        icons: secs.filter((s) => s.querySelector('.ac-hd-ic')).length,
        openId: open ? open.dataset.sec : '',
        openItems: open ? open.querySelectorAll('.ac-it').length : 0,
        othersBuilt: secs.filter((s) => s !== open).filter((s) => s.querySelector('.ac-items')).length,
        prog: document.getElementById('acProg').textContent,
        fillW: document.getElementById('acFill').style.width,
        bones: document.getElementById('acBones').textContent,
      };
    })()`);
    ok(a.n === 8, `八组（实得 ${a.n}）`);
    ok(a.icons === 8, '每组都有类别图标');
    ok(a.titles.join('') === '战斗生存构筑关卡挑战剧情局外隐藏', '八组顺序 = ACH_CATS', a.titles.join('/'));
    ok(a.counts.every((c) => /^\d+\/\d+$/.test(c)), '每组都显示「n/m」', a.counts.join(' '));
    ok(!!a.openId, '进来默认展开一组', a.openId);
    ok(a.openItems > 0, `展开的那组真的建出了条目（${a.openItems} 条）`);
    ok(a.othersBuilt === 0, '没展开的七组还没建 DOM（懒构建生效，老手机不卡）', String(a.othersBuilt));
    ok(/^\d+ \/ 67$/.test(a.prog), `头部进度 ${a.prog}`, a.prog);
    ok(/^\d+%$/.test(a.fillW), '总进度条有宽度', a.fillW);

    // 展开另一组
    await ev(`(() => { const s = [...document.querySelectorAll('#acRoot .ac-sec')].find((x) => x.dataset.sec === 'secret'); s.querySelector('.ac-hd').click(); return 1; })()`);
    await sleep(500);
    const a2 = await ev(`(() => {
      const secs = [...document.querySelectorAll('#acRoot .ac-sec')];
      const open = secs.filter((s) => s.classList.contains('open'));
      return {
        openN: open.length,
        openId: open.map((s) => s.dataset.sec).join(','),
        items: open.length ? open[0].querySelectorAll('.ac-it').length : 0,
        names: [...open[0].querySelectorAll('.ac-it-n b')].map((x) => x.textContent),
        tiers: [...open[0].querySelectorAll('.ac-it-tg')].map((x) => x.textContent),
        hasBone: !!open[0].querySelector('.ac-it-b i'),
        bars: open[0].querySelectorAll('.ac-it-bar').length,
        arrows: [...document.querySelectorAll('#acRoot .ac-hd-ar')].map((x) => getComputedStyle(x).transform).filter((t) => t !== 'none').length,
      };
    })()`);
    ok(a2.openN === 1, '手风琴语义：同时只开一组（开新的收旧的）', String(a2.openN));
    ok(a2.openId === 'secret', '开的是「隐藏」那组', a2.openId);
    ok(a2.items === 3, `隐藏组 3 条（实得 ${a2.items}）`);
    ok(a2.tiers.length === 3, '每条都有档位标签', a2.tiers.join(','));
    ok(a2.hasBone, '每条都画了骨币图标');
    ok(a2.bars === 3, '隐藏组三条都有进度条（都是收集型）', String(a2.bars));
    ok(a2.arrows >= 1, '展开的那一组箭头转了 90°');
    await shot(SHOT_ACH);

    // 解锁一条 → 骨币到账 + tab 徽章跟着涨
    const b0 = await ev('__game.ui.bones()');
    const n0 = await ev("__game.ach.unlocked()");
    await ev(`__game.ach.try('first_blood')`);
    await sleep(300);
    const b1 = await ev('__game.ui.bones()');
    const n1 = await ev("__game.ach.unlocked()");
    ok(n1 === n0 + 1, '成就解锁计数 +1', `${n0}->${n1}`);
    ok(b1 === b0 + 30, `解锁「第一根骨头」发 30 骨币（${b0} → ${b1}）`, `${b0}->${b1}`);
    ok(await ev(`document.getElementById('tabAchN').textContent`) === `${n1}/67`,
      'tab 上的徽章当场跟着涨', await ev(`document.getElementById('tabAchN').textContent`));
    await ev(`__game.tab('main'); __game.tab('ach')`);
    await sleep(400);
    // 面板每次进去都整体重建，只有展开的那一组会建 DOM —— 所以先展开「战斗」
    await ev(`(() => { document.querySelector('#acRoot .ac-sec[data-sec="battle"] .ac-hd').click(); return 1; })()`);
    await sleep(500);
    const lit = await ev(`(() => {
      const it = document.querySelector('#acRoot .ac-sec[data-sec="battle"] .ac-it[data-ach="first_blood"]');
      if (!it) return { found: false };
      return {
        found: true, on: it.classList.contains('on'),
        label: (it.querySelector('.ac-it-p') || {}).textContent || '',
        barW: it.querySelector('.ac-it-bar i') ? it.querySelector('.ac-it-bar i').style.width : '',
        icOpacity: +getComputedStyle(it.querySelector('.ac-it-ic')).opacity,
      };
    })()`);
    ok(lit.found && lit.on, '重新进面板时这条显示为已解锁（.on）', JSON.stringify(lit));
    ok(lit.label === '已解锁', '右侧写着「已解锁」而不是进度数字', lit.label);
    ok(lit.barW === '100%', '进度条满格', lit.barW);
    ok(lit.icOpacity > 0.9, '图标不再是灰的（解锁后点亮）', String(lit.icOpacity));
    // 同一组里没解锁的那条该是灰的
    const dim = await ev(`(() => {
      const it = document.querySelector('#acRoot .ac-sec[data-sec="battle"] .ac-it:not(.on)');
      return it ? +getComputedStyle(it.querySelector('.ac-it-ic')).opacity : -1;
    })()`);
    ok(dim >= 0 && dim < 0.6, '没解锁的条目图标是灰的（对比明显）', String(dim));

    // ------------------------------------------------------------ 6
    console.log('\n[6] 盲盒奖池手风琴');
    await ev(`__game.tab('main')`);
    await ev(`document.getElementById('btnShop').click()`);
    await sleep(400);
    await ev(`(() => { document.getElementById('shopTabBox').click(); return 1; })()`);
    await sleep(500);
    // 第一次进商店会弹「夜行商店是永久投资」的告知卡（每个存档一次）——点掉再截图
    await ev(`(() => { const b = document.getElementById('caOk'); if (b) b.click(); return 1; })()`);
    await sleep(400);
    const bp = await ev(`(() => {
      const secs = [...document.querySelectorAll('#boxPoolRoot .ac-sec')];
      return {
        n: secs.length,
        ids: secs.map((s) => s.dataset.sec),
        titles: secs.map((s) => (s.querySelector('.ac-hd-t') || {}).textContent || ''),
        hasIcon: secs.filter((s) => s.querySelector('.ac-hd-ic')).length,
      };
    })()`);
    ok(bp.n === 3, `三个匣子各一组（实得 ${bp.n}）`);
    ok(bp.ids.join(',') === 'box-wood,box-silver,box-gold', '三组 id 正确', bp.ids.join(','));
    ok(/木匣 · 30 骨币/.test(bp.titles[0]), `标题带首价（${bp.titles[0]}）`, bp.titles.join(' | '));
    ok(bp.hasIcon === 3, '三组都有匣子图标');
    // 价目表 +3%
    const purse = await ev(`(() => {
      const el = document.querySelector('#shopBodyBox .ms-purse i');
      return el ? el.textContent : '';
    })()`);
    ok(/\+3% 首价/.test(purse), `页面上明写着「+3% 首价」（${purse.slice(0, 60)}…）`, purse.slice(0, 90));
    ok(!/\+5% 首价/.test(purse), '页面上没有残留的 +5% 首价', purse.slice(0, 90));

    await ev(`(() => { document.querySelector('#boxPoolRoot .ac-sec[data-sec="box-gold"] .ac-hd').click(); return 1; })()`);
    await sleep(600);
    const rows = await ev(`(() => {
      const sec = document.querySelector('#boxPoolRoot .ac-sec[data-sec="box-gold"]');
      const rs = [...sec.querySelectorAll('.ac-pl')];
      return {
        n: rs.length,
        kinds: rs.map((r) => r.classList.contains('rare') ? 'rare' : (r.classList.contains('neg') ? 'neg' : 'pos')),
        pcts: rs.map((r) => parseFloat((r.querySelector('.ac-pl-p') || {}).textContent || '0')),
        sub: [...sec.querySelectorAll('.ac-sub')].map((x) => x.textContent).join(''),
        colors: {
          pos: (() => { const r = rs.find((x) => x.classList.contains('pos')); return r ? getComputedStyle(r.querySelector('.ac-pl-k')).color : ''; })(),
          neg: (() => { const r = rs.find((x) => x.classList.contains('neg')); return r ? getComputedStyle(r.querySelector('.ac-pl-k')).color : ''; })(),
          rare: (() => { const r = rs.find((x) => x.classList.contains('rare')); return r ? getComputedStyle(r.querySelector('.ac-pl-k')).color : ''; })(),
        },
        tags: rs.slice(0, 3).map((r) => (r.querySelector('.ac-pl-k') || {}).textContent || ''),
      };
    })()`);
    ok(rows.n >= 10, `金匣展开出了 ${rows.n} 行`);
    ok(rows.kinds.includes('rare') && rows.kinds.includes('neg') && rows.kinds.includes('pos'),
      '三种类型都有（正面 / 诅咒 / 稀有）', [...new Set(rows.kinds)].join(','));
    const sum = rows.pcts.reduce((x, y) => x + y, 0);
    ok(Math.abs(sum - 100) < 0.6, `金匣概率合计 ${sum.toFixed(2)}% ≈ 100%`, String(sum));
    ok(new Set([rows.colors.pos, rows.colors.neg, rows.colors.rare]).size === 3,
      '三种类型三种颜色（用户点名要的）', JSON.stringify(rows.colors));
    ok(rows.tags.includes('稀有'), '稀有行有「稀有」标签', rows.tags.join(','));
    ok(/诅咒率 7%/.test(rows.sub), `分组副标题写着诅咒率（${rows.sub}）`, rows.sub);
    // 展开行有三行不重样的颜色，截图前把金匣滚到视口里
    await ev(`(() => { document.querySelector('#boxPoolRoot .ac-sec[data-sec="box-gold"]').scrollIntoView({ block: 'start' }); return 1; })()`);
    await sleep(500);
    await shot(SHOT_POOL);

    // 切到木匣 → 金银那组收起
    await ev(`(() => { document.querySelector('#boxPoolRoot .ac-sec[data-sec="box-wood"] .ac-hd').click(); return 1; })()`);
    await sleep(600);
    const w = await ev(`(() => {
      const secs = [...document.querySelectorAll('#boxPoolRoot .ac-sec')];
      const open = secs.filter((s) => s.classList.contains('open'));
      const wood = document.querySelector('#boxPoolRoot .ac-sec[data-sec="box-wood"]');
      return {
        openN: open.length,
        woodRows: wood.querySelectorAll('.ac-pl').length,
        woodRare: wood.querySelectorAll('.ac-pl.rare').length,
      };
    })()`);
    ok(w.openN === 1, '手风琴语义：切到木匣时金匣收起', String(w.openN));
    ok(w.woodRows >= 8, `木匣展开 ${w.woodRows} 行`);
    ok(w.woodRare === 0, '木匣没有稀有行（不出法器）', String(w.woodRare));

    // ------------------------------------------------------------ 7
    console.log('\n[7] 收尾');
    ok(await ev(`document.getElementById('ttTabs').getBoundingClientRect().bottom <= 932 + 1`),
      '底部 tab 条在视口内（没被顶出去）');
    ok(await ev(`(() => {
      const t = document.getElementById('ttTabs').getBoundingClientRect();
      const bs = [...document.querySelectorAll('#ttPaneMain .tt-menu-btn, #ttPaneMain .tt-start, #ttPaneMain .tt-camp, #ttPaneMain .tt-daily')];
      return bs.every((b) => b.getBoundingClientRect().bottom <= t.top + 2);
    })()`), '主页面所有按钮都在 tab 条上方（不重叠）');
    ok(jsErrors.length === 0, '整轮跑下来没有 JS 异常', jsErrors.slice(0, 4).join(' | '));

    console.log('\n  截图：');
    console.log('   ' + SHOT_QUEST.replace('.png', '-main.png'));
    console.log('   ' + SHOT_QUEST);
    console.log('   ' + SHOT_ACH);
    console.log('   ' + SHOT_POOL);
  } catch (e) {
    console.log('\n  冒烟脚本自己炸了：' + (e && e.message));
    fails.push('脚本异常: ' + (e && e.message));
    fail++;
  } finally {
    try { if (ws) ws.close(); } catch (_) { /* noop */ }
    try { chrome.kill(); } catch (_) { /* noop */ }
  }

  console.log(`\n${'='.repeat(52)}`);
  console.log(`  通过 ${pass} / 失败 ${fail}`);
  if (fails.length) { console.log('\n  失败清单：'); for (const f of fails) console.log('   - ' + f); }
  process.exit(fail ? 1 : 0);
})();
