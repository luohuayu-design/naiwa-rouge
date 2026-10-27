// 第 106 块 CDP：主页面瘦身 + 新「据点」页 + 成就 106（删一线生机）
//   A 四个 tab：都在、不溢出（375 与 320 两档都试）、默认落在主页面
//   B 主页面：原来那三行按钮没了、属性横卡显示四项数值、点一下还是 3D 属性页
//   C 据点：八个入口都在、每个点得开、骨币胶囊跟主页面同一个数
//   D 成就：面板写 106、「一线生机」不在列表里、tab 徽章 0/106
// 跑法：先 `python -m http.server 8124`（cwd=naiwa-rouge，run_in_background），再 `node .tmp-106-cdp.js`
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9391;
const UD = path.join(os.tmpdir(), 'naiwa-cdp-106');
const OUT = path.join(os.tmpdir(), 'naiwa-block106');
// 420×900：手机竖屏的常见宽度，tab 挤不挤就靠它验
const URL = 'http://127.0.0.1:8124/index.html?debug=1&title';

let pass = 0, fail = 0;
const fails = [];
// ⚠️ 签名是 ok(条件, 名字, 附注) —— 别写成 ok(名字, 条件)：非空字符串恒真，会整片假绿
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
    async function shot(name) {
      const r = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(OUT, name), Buffer.from(r.data, 'base64'));
    }
    // 可见性：读计算样式 + getClientRects，别读 .hidden / classList
    const VIS = `(() => { const cs = getComputedStyle(el);
      return cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) > 0.01
        && el.getClientRects().length > 0; })()`;
    // ⚠️ 中间那个 IIFE 必须 `return` —— 漏了 return 会让函数返回 undefined，
    //    于是「可见」永远判成 false（第一版就是这么全红的）。
    const visible = (sel) => ev(`(() => { const el = document.querySelector('${sel}'); if (!el) return false; return ${VIS} })()`);
    const visibleId = (i) => ev(`(() => { const el = document.getElementById('${i}'); if (!el) return false; return ${VIS} })()`);

    await send('Runtime.enable');
    await send('Page.enable');
    await send('Page.navigate', { url: URL });
    await waitFor('!!window.__game', 90000, '__game 就绪');
    await waitFor("document.getElementById('titleScr') && !document.getElementById('titleScr').classList.contains('off')", 15000, '标题页淡入');
    // 「公告 → 签到 → 宣传有礼」是一条 350ms 一环的定时器链，逐环关掉（截图才不被盖）
    try { await waitFor('__game.notice.open()', 8000, '公告自动弹出'); } catch (_) { /* 看过了就不弹 */ }
    await ev('if (__game.notice.open()) __game.notice.hide(); 1');
    await sleep(600);
    await ev('if (__game.sign.open()) __game.sign.hide(); 1');
    await sleep(600);
    await ev('if (__game.promo.open()) __game.promo.hide(); 1');
    await sleep(300);

    // ============================================================
    console.log('\n[A] 四个 tab');
    // ============================================================
    {
      const tabs = await ev(`JSON.stringify([...document.querySelectorAll('.tt-tabs .tt-tab')].map(b => b.id))`);
      ok(JSON.parse(tabs).join(',') === 'ttTabMain,ttTabQuest,ttTabAch,ttTabBase',
        '底部四个 tab：主页面 / 每日任务 / 成就 / 据点', tabs);
      ok(await ev("__game.tab()") === 'main', '默认落在主页面');
      ok(await visibleId('ttPaneMain'), '主页面可见');
      ok(!(await visibleId('ttPaneBase')), '据点默认是收起的');
      // 四个 tab 必须装得下：条本身不能溢出视口
      const geo = await ev(`(() => {
        const bar = document.getElementById('ttTabs').getBoundingClientRect();
        return { l: Math.round(bar.left), r: Math.round(bar.right), w: Math.round(bar.width), vw: window.innerWidth };
      })()`);
      ok(geo.l >= 0 && geo.r <= geo.vw, `tab 条完整落在视口里（${geo.w}px / 视口 ${geo.vw}px）`, JSON.stringify(geo));
      // 每个 tab 的文字都没被截断（scrollWidth 不大于 clientWidth）
      const clipped = await ev(`JSON.stringify([...document.querySelectorAll('.tt-tabs .tt-tab')]
        .filter(b => b.scrollWidth > b.clientWidth + 1).map(b => b.id))`);
      ok(JSON.parse(clipped).length === 0, '四个 tab 的文字都没被挤断行', clipped);
      await shot('a-tabs.png');
      // 320 级窄屏
      await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 720, deviceScaleFactor: 1, mobile: true });
      await sleep(400);
      const g320 = await ev(`(() => {
        const bar = document.getElementById('ttTabs').getBoundingClientRect();
        const clipped = [...document.querySelectorAll('.tt-tabs .tt-tab')].filter(b => b.scrollWidth > b.clientWidth + 1).length;
        return { l: Math.round(bar.left), r: Math.round(bar.right), vw: window.innerWidth, clipped };
      })()`);
      ok(g320.l >= 0 && g320.r <= g320.vw && g320.clipped === 0,
        `320 窄屏四个 tab 也不溢出（${g320.r} / ${g320.vw}）`, JSON.stringify(g320));
      await shot('a-tabs-320.png');
      await send('Emulation.clearDeviceMetricsOverride');
      await sleep(300);
    }

    // ============================================================
    console.log('\n[B] 主页面：瘦身后 + 属性横卡');
    // ============================================================
    {
      const menuIds = await ev(`JSON.stringify([...document.querySelectorAll('#ttPaneMain button')].map(b => b.id))`);
      const ids = JSON.parse(menuIds);
      // btnResume 是「有存档才显示」那颗，DOM 常驻（hidden 属性控制），所以也在列表里
      ok(ids.join(',') === 'btnStart,btnResume,btnDaily,btnSeed,btnSign,btnShop,btnStats',
        '主页面只剩「开打 + 三件日常 + 商店 + 属性」七颗键（含常驻但隐藏的读取存档）', menuIds);
      for (const gone of ['btnCodex', 'btnStory', 'btnRecords', 'btnBoons', 'btnGift', 'btnSettings', 'btnNotice', 'btnPromo']) {
        ok(!ids.includes(gone), `主页面里已经没有 ${gone}`);
      }
      ok(await visibleId('ttStatVals'), '属性横卡可见');
      const bar = await ev("document.getElementById('ttStatVals').textContent");
      ok(/生命 [\d.]+/.test(bar) && /攻击 [\d.]+/.test(bar) && /防御 [\d.]+/.test(bar) && /暴击 \d+%/.test(bar),
        '横卡摆出四项：生命 / 攻击 / 防御 / 暴击', bar);
      const barGeo = await ev(`(() => { const b = document.getElementById('btnStats').getBoundingClientRect();
        return { w: Math.round(b.width), l: Math.round(b.left), r: Math.round(b.right), vw: window.innerWidth }; })()`);
      ok(barGeo.l >= 0 && barGeo.r <= barGeo.vw, '横卡不横向溢出', JSON.stringify(barGeo));
      await shot('b-main.png');

      // 点一下还是原来那个 3D 属性页，且**数值和横卡一致**（口径统一）
      await ev("document.getElementById('btnStats').click()");
      await waitFor("document.getElementById('statScr').classList.contains('on')", 8000, '属性页打开');
      // ⚠️ 属性行的类名是 .st-name / .st-val（不是 .st-n / .st-v），名字才是「生命上限 / 攻击力 / 防御」
      const rows = await ev(`(() => {
        const out = {};
        document.querySelectorAll('#statRows .st-row').forEach((r) => {
          const k = r.querySelector('.st-name') ? r.querySelector('.st-name').textContent.trim() : '';
          const v = r.querySelector('.st-val') ? r.querySelector('.st-val').textContent.trim() : '';
          if (k) out[k] = v;
        });
        return JSON.stringify(out);
      })()`);
      const R = JSON.parse(rows);
      const barNums = (bar.match(/[\d.]+/g) || []);
      ok(R['生命上限'] && Math.abs(parseFloat(R['生命上限']) - parseFloat(barNums[0])) < 0.06,
        `生命上限一致（横卡 ${barNums[0]} / 属性页 ${R['生命上限']}）`, `${barNums[0]} vs ${R['生命上限']}`);
      ok(R['攻击力'] && Math.abs(parseFloat(R['攻击力']) - parseFloat(barNums[1])) < 0.06,
        `攻击力一致（横卡 ${barNums[1]} / 属性页 ${R['攻击力']}）`, `${barNums[1]} vs ${R['攻击力']}`);
      ok(R['防御'] && Math.abs(parseFloat(R['防御']) - parseFloat(barNums[2])) < 0.06,
        `防御一致（横卡 ${barNums[2]} / 属性页 ${R['防御']}）`, `${barNums[2]} vs ${R['防御']}`);
      await shot('b-statpage.png');
      // ⚠️ 属性页的返回按钮是 #statBack（「夜行记忆」那个是 #stBack，两个重名过）
      await ev("document.getElementById('statBack').click()");
      await sleep(400);
      ok(await ev("__game.tab()") === 'main', '退出属性页回到主页面');
    }

    // ============================================================
    console.log('\n[C] 据点：八个入口');
    // ============================================================
    {
      await ev("document.getElementById('ttTabBase').click()");
      await sleep(500);
      ok(await ev("__game.tab()") === 'base', '切到了据点');
      ok(await visibleId('ttPaneBase'), '据点面板可见');
      ok(!(await visibleId('ttPaneMain')), '主页面收起来了');
      const items = await ev(`JSON.stringify([...document.querySelectorAll('#ttPaneBase .bp-it')].map(b => ({
        id: b.id, name: b.querySelector('.bp-n') ? b.querySelector('.bp-n').textContent.trim() : '',
        sub: b.querySelector('.bp-s') ? b.querySelector('.bp-s').textContent.trim() : '',
        ic: !!b.querySelector('.bp-ic'),
      })))`);
      const it = JSON.parse(items);
      ok(it.length === 8, '八个入口', String(it.length));
      const want = ['图鉴', '夜行记忆', '我的记录', '永夜火种', '礼包兑换', '设置', '公告', '宣传有礼'];
      ok(it.map((x) => x.name).join(',') === want.join(','), '八个名字与顺序', it.map((x) => x.name).join(','));
      ok(it.every((x) => x.sub.length > 0), '每条都有副标题（一眼知道点进去是什么）');
      ok(it.every((x) => x.ic), '每条都有图标');
      // 图标真的画出来了（mask 生效 → 有尺寸，不是 0×0）
      const icGeo = await ev(`JSON.stringify([...document.querySelectorAll('#ttPaneBase .bp-ic')].map(e => Math.round(e.getBoundingClientRect().width)))`);
      ok(JSON.parse(icGeo).every((w) => w >= 12), '图标有实际尺寸（mask 没把图吃掉）', icGeo);
      // 2×2 网格：同一组里两个同高，且不横向溢出
      const gridGeo = await ev(`(() => {
        const bs = [...document.querySelectorAll('#ttPaneBase .bp-it')].map(b => b.getBoundingClientRect());
        return { same: new Set(bs.map(b => Math.round(b.height))).size <= 2,
          over: bs.some(b => b.left < 0 || b.right > window.innerWidth) };
      })()`);
      ok(gridGeo.same && !gridGeo.over, '2×2 网格整齐且不溢出', JSON.stringify(gridGeo));
      const bpBones = await ev("document.getElementById('bpBones').textContent");
      const msBones = await ev("__game.ui.bones()");
      ok(bpBones === String(msBones), `骨币胶囊和主页面同一个数（${bpBones}）`, `${bpBones} vs ${msBones}`);
      await shot('c-base.png');

      // 八个都能点开（各自对应的面板 / 浮层真的亮起来）
      const openers = [
        ['btnCodex', "document.getElementById('codexScr').classList.contains('on')", "document.getElementById('cxBack').click()"],
        ['btnStory', "document.getElementById('storyScr').classList.contains('on')", "document.getElementById('stBack').click()"],
        ['btnRecords', "document.getElementById('recordsScr').classList.contains('on')", "document.getElementById('rcBack').click()"],
        ['btnBoons', "document.getElementById('boonScr').classList.contains('on')", "document.getElementById('bnBack').click()"],
        ['btnGift', "document.getElementById('giftScr').classList.contains('on')", "document.getElementById('giftBack').click()"],
        ['btnSettings', "document.getElementById('setScr').classList.contains('on')", "document.getElementById('setBack').click()"],
        ['btnNotice', "__game.notice.open()", "__game.notice.hide()"],
        ['btnPromo', "__game.promo.open()", "__game.promo.hide()"],
      ];
      for (const [btn, cond, back] of openers) {
        // 每次都先切回据点（上一个子面板退回去会回到标题页，tab 会被重置成 main）
        await ev("__game.tab('base'), 1");
        await sleep(220);
        await ev(`document.getElementById('${btn}').click()`);
        let opened = true;
        try { await waitFor(cond, 6000, `${btn} 打开`); } catch (_) { opened = false; }
        ok(opened, `点「${btn}」打得开`);
        if (opened) { await ev(back); await sleep(350); }
      }
      await ev("__game.tab('base'), 1");
      await sleep(300);
      await shot('c-base-back.png');
    }

    // ============================================================
    console.log('\n[D] 成就 106');
    // ============================================================
    {
      await ev("__game.tab('ach'), 1");
      await sleep(500);
      const prog = await ev("document.getElementById('acProg').textContent");
      ok(/^\d+ \/ 106$/.test(prog), `面板头部写 0 / 106（实得 ${prog}）`, prog);
      const badge = await ev("document.getElementById('tabAchN').textContent");
      ok(/\/106$/.test(badge), `tab 徽章也是 /106（实得 ${badge}）`, badge);
      ok(await ev("__game.ach.total()") === 106, 'ach.total() = 106');
      const list = await ev("JSON.stringify(__game.ach.list())");
      ok(!JSON.parse(list).includes('low_hp_win'), '列表里没有「一线生机」的 id');
      ok(JSON.parse(list).length === 106, '列了 106 条', String(JSON.parse(list).length));
      // 八类的条数（面板分组标题旁边那个数）
      const cats = await ev("JSON.stringify(__game.ach.cats())");
      const c = JSON.parse(cats);
      ok(c.map((x) => `${x.name}${x.n}`).join(' ') === '战斗21 生存11 构筑15 关卡24 挑战15 剧情5 局外10 隐藏5',
        '八类条数', c.map((x) => `${x.name}${x.n}`).join(' '));
      // 展开「隐藏」组，确认没有「一线生机」这条，且组里 5 条都在
      await ev(`(() => { const s = [...document.querySelectorAll('#acRoot .ac-sec')].find(x => x.dataset.sec === 'secret'); s.querySelector('.ac-hd').click(); return 1; })()`);
      await sleep(600);
      const secretTxt = await ev(`document.querySelector('#acRoot .ac-sec[data-sec="secret"]').textContent`);
      ok(!/一线生机/.test(secretTxt), '隐藏组里看不到「一线生机」');
      ok(await ev(`document.querySelectorAll('#acRoot .ac-sec[data-sec="secret"] .ac-it').length`) === 5, '隐藏组 5 条');
      await shot('d-ach.png');
      // 解锁一条 → 待领 → 领取，走一遍（面板每次重建，展开状态要重来）
      const b0 = await ev('__game.ui.bones()');
      await ev("__game.ach.try('first_blood')");
      await sleep(300);
      ok((await ev('__game.ach.pending()')).includes('first_blood'), '解锁后进了待领');
      ok(await ev('__game.ui.bones()') === b0, '解锁那一刻不发骨币（手动领）');
      await ev("__game.tab('main'), __game.tab('ach'), 1");
      await sleep(400);
      await ev(`(() => { document.querySelector('#acRoot .ac-sec[data-sec="battle"] .ac-hd').click(); return 1; })()`);
      await sleep(500);
      // ⚠️ 行上的标识是 data-ach（不是 data-id），按钮在 .ac-it-r 里带 .ac-it-btn
      await ev(`(() => { const it = document.querySelector('#acRoot .ac-it[data-ach="first_blood"]');
        const b = it && it.querySelector('.ac-it-btn'); if (b) b.click(); return !!(it && b); })()`);
      await sleep(400);
      ok(await ev('__game.ui.bones()') === b0 + 30, '点领取拿到 30 骨币', String(await ev('__game.ui.bones()')));
      await shot('d-ach-claim.png');
    }

    ok(jsErrors.length === 0, '整个过程没有 JS 异常', jsErrors.slice(0, 3).join(' | '));
  } catch (e) {
    fail++;
    fails.push('崩溃: ' + e.message);
    console.log('\n✗ 崩溃: ' + e.message);
  } finally {
    try { ws && ws.close(); } catch (_) {}
    try { chrome.kill(); } catch (_) {}
  }

  console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
  if (fails.length) console.log('失败项：\n - ' + fails.join('\n - '));
  console.log('截图目录：' + OUT);
  process.exit(fail ? 1 : 0);
})();
