// 第 59 块 CDP：签到系统 / 帧率自适应 / 怪物放大 / 闪烁修复 / 滚动与浮层
//   A 主菜单签到入口：红点 + 本周进度
//   B 公告 → 签到 链路（公告关掉 350ms 后自动弹签到，宣传有礼不抢先）
//   C 面板结构：7 格、今天标记、两条里程碑
//   D 签到落账：+20 骨币、按钮禁用、格子打勾、红点消失
//   E 重复签到不重复发
//   F 关掉签到 → 宣传有礼接上
//   G 帧率自适应：fps<40 连压两秒降一档，fps>52 连稳五秒升回（不写存档）
//   H 盾斧兽人 / 孢生菇 尺寸：身高 1.90 / 1.90，半径 0.62 / 0.55（第 62 块再调）
//   I 夜行记忆：一章能读完、世界渲染闸门停住
//   J 火种面板：传说卡只有一次性入场动画（不再是无限呼吸）
// 跑法：先 `python -m http.server 8124`（cwd=naiwa-rouge），再 `node .tmp-block59-cdp.js`
// 注意：URL 带 autoperf —— debug 下帧率自适应默认关，测它要显式开
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9372;
const UD = path.join(os.tmpdir(), 'naiwa-cdp-59');
const OUT = path.join(os.tmpdir(), 'naiwa-block59');
const URL = 'http://127.0.0.1:8124/index.html?debug=1&title&autoperf';

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
    async function shot(name) {
      const r = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(OUT, name), Buffer.from(r.data, 'base64'));
    }
    await send('Runtime.enable');
    await send('Page.enable');

    await send('Page.navigate', { url: URL });
    await waitFor('!!window.__game', 90000, '__game 就绪');
    // 清掉公告/宣传的「今天已看」，让链路能走完整
    await ev('window.__game.promo.clear(); window.__game.notice.seenReset && window.__game.notice.seenReset(); 1');
    await waitFor("document.getElementById('titleScr') && !document.getElementById('titleScr').classList.contains('off')", 15000, '标题页淡入');

    // ============================================================
    console.log('\n[A] 主菜单签到入口');
    // ============================================================
    const btnA = await ev('JSON.stringify(__game.sign.btn())');
    const bA = JSON.parse(btnA);
    ok(bA.dot === true, '今天没签 → 红点亮着', btnA);
    ok(/本周 0 \/ 7 天/.test(bA.sub), '副标题显示本周 0 / 7 天', bA.sub);
    ok(await ev("!!document.getElementById('btnSign')"), '签到按钮在主菜单里');

    // ============================================================
    console.log('\n[B] 公告 → 签到 链路');
    // ============================================================
    await ev("__game.notice.show(true), 1");
    await waitFor('__game.notice.open()', 5000, '公告打开');
    await ev("document.getElementById('noticeOk').click(), 1");
    await waitFor('__game.sign.open()', 8000, '公告关掉后签到自动弹出');
    ok(await ev('__game.sign.open()') === true, '公告关掉 350ms 后签到接上');
    ok(await ev('__game.promo.open()') === false, '宣传有礼没有抢先（排在签到后面）');

    // ============================================================
    console.log('\n[C] 面板结构');
    // ============================================================
    const cells = JSON.parse(await ev('JSON.stringify(__game.sign.cells())'));
    ok(cells.length === 7, '七格', String(cells.length));
    ok(cells[0].name === '周一' && cells[6].name === '周日', '周一到周日', cells.map((c) => c.name).join('/'));
    ok(cells.filter((c) => c.today).length === 1, '只有一格是今天');
    ok(await ev("document.querySelectorAll('#signWeek .sign-day').length") === 7, 'DOM 里画了 7 格');
    ok(await ev("document.querySelectorAll('#signWeek .sign-day.today').length") === 1, '今天那格带 today 类');
    const tiers = await ev("document.querySelectorAll('#signTiers .sign-tier').length");
    ok(tiers === 3, '三条里程碑条（3 / 5 / 7 天 —— 第 105 块）', String(tiers));
    const tierTxt = await ev("document.getElementById('signTiers').textContent");
    ok(/累计 3 天/.test(tierTxt) && /\+100 骨币/.test(tierTxt) && /累计 5 天/.test(tierTxt) && /\+150 骨币/.test(tierTxt),
      '里程碑文案 3 天 100 / 5 天 150', tierTxt);
    ok(/累计 7 天/.test(tierTxt) && /永夜火种 ×1/.test(tierTxt), '第 7 天那档写的是永夜火种 ×1', tierTxt);
    ok(!/\+200 骨币/.test(tierTxt), '旧的「6 天 +200 骨币」已经不在面板上');
    ok(await ev("document.querySelectorAll('#signTiers .sign-tier.boon').length") === 1, '火种那档单独一个样式类');
    ok(/0~100/.test(await ev("document.getElementById('signSub').textContent")), '副标题写明每天随机 0~100',
      await ev("document.getElementById('signSub').textContent"));
    ok(/随机 0~100/.test(await ev("document.getElementById('signBtn').textContent")), '按钮文案写明随机区间',
      await ev("document.getElementById('signBtn').textContent"));
    ok(/还差 3 天/.test(tierTxt), '未达标显示还差几天', tierTxt);
    await shot('sign_panel.png');

    // ============================================================
    console.log('\n[D] 签到落账');
    // ============================================================
    const b0 = await ev('__game.bones ? __game.bones() : (JSON.parse(localStorage.getItem("naiwa_rouge_profile_v1")).bones)');
    await ev("document.getElementById('signBtn').click(), 1");
    await sleep(400);
    const b1 = await ev('JSON.parse(localStorage.getItem("naiwa_rouge_profile_v1")).bones');
    // 第 105 块：每天随机 0~100，落账金额必须和面板上写的那一行对得上
    const gainedRoll = Number((await ev("document.getElementById('signGain').textContent")).match(/(\d+) 骨币/)[1]);
    ok(b1 === b0 + gainedRoll && gainedRoll >= 0 && gainedRoll <= 100,
      '骨币按这次随机到的值落账（0~100）', `${b0} → ${b1}（随机 ${gainedRoll}）`);
    ok(await ev('__game.sign.signed()') === true, '今天记为已签');
    const s1 = JSON.parse(await ev('JSON.stringify(__game.sign.state())'));
    ok(s1.days === 1, '本周 1 天', String(s1.days));
    ok(await ev("document.querySelectorAll('#signWeek .sign-day.signed').length") === 1, '一格打勾');
    ok(await ev("document.getElementById('signBtn').disabled") === true, '签到按钮变灰');
    ok(/今天已签到/.test(await ev("document.getElementById('signBtn').textContent")), '按钮文案换成「今天已签到」');
    const gainTxt = await ev("document.getElementById('signGain').textContent");
    ok(/今日签到：(\+\d+ 骨币|0 骨币（这次空手）)/.test(gainTxt), '即时反馈写了拿到什么', gainTxt);
    const bBtn = JSON.parse(await ev('JSON.stringify(__game.sign.btn())'));
    ok(bBtn.dot === false && bBtn.done === true, '主菜单红点消失、按钮变绿', JSON.stringify(bBtn));
    // 第 60 块 hotfix：只翻 hidden 属性不算数，要确认元素真的不渲染
    // （.tt-dot 自己写了 display:inline-block，会压过 [hidden] 这条 UA 样式）
    ok(await ev("getComputedStyle(document.getElementById('signDot')).display") === 'none',
      '红点元素真的不渲染（computed display: none）');
    ok(await ev("document.getElementById('signDot').getClientRects().length") === 0, '红点没有实际盒子');
    // 副标题不许换行 —— 换行会把「今日挑战 / 种子挑战 / 每日签到」这一排撑得错位
    ok(await ev("document.getElementById('btnSignSub').getClientRects().length") === 1,
      '副标题仍是单行（按钮没被撑高）', String(await ev("document.getElementById('btnSignSub').textContent")));
    const rowH = JSON.parse(await ev("JSON.stringify([...document.querySelectorAll('.tt-row-chal .tt-daily')].map(e => Math.round(e.getBoundingClientRect().height)))"));
    ok(new Set(rowH).size === 1, '「今日挑战」那一排按钮等高', JSON.stringify(rowH));

    // ============================================================
    console.log('\n[E] 重复签到');
    // ============================================================
    await ev('__game.sign.do(), 1');
    await sleep(200);
    const b2 = await ev('JSON.parse(localStorage.getItem("naiwa_rouge_profile_v1")).bones');
    ok(b2 === b1, '再签一次骨币不变', `${b1} → ${b2}`);

    // ============================================================
    console.log('\n[F] 关掉签到 → 宣传有礼接上');
    // ============================================================
    await ev("document.getElementById('signOk') ? 0 : (document.getElementById('signClose').click(), 1)");
    await waitFor('__game.promo.open()', 8000, '宣传有礼接上');
    ok(await ev('__game.promo.open()') === true, '签到关掉后宣传有礼上场');
    ok(await ev('__game.sign.open()') === false, '签到已经收掉');
    await ev('__game.promo.hide(), 1');
    await sleep(300);

    // ============================================================
    console.log('\n[G] 帧率自适应（需要正在打）');
    // ============================================================
    await ev("document.getElementById('btnStart').click(), 1");
    await sleep(400);
    await ev("document.querySelector('.lv-item[data-level=\"1\"]').click(), 1");
    await sleep(400);
    await ev("document.getElementById('diffNext')?.click(), 1");
    await sleep(400);
    await ev("document.getElementById('curseStart')?.click(), 1");
    await sleep(600);
    // 新手教程询问框会挡在前面（block56 的老经验）
    if (await ev("document.getElementById('tutAsk')?.classList.contains('on')")) {
      await ev("document.getElementById('tutNo').click(), 1");
    }
    await waitFor("__game.getState() === 'playing'", 20000, '进入战斗');
    await sleep(1200);
    // 无头 SwiftShader 帧率本来就低，先把自动降档归零再开始断言
    await ev('__game.ui.perf.reset(), __game.ui.perf.setFps(60), 1');
    await sleep(100);
    const perf0 = JSON.parse(await ev('JSON.stringify(__game.ui.perf.state())'));
    ok(await ev('__game.ui.perf.auto()') === true, 'autoperf 下自适应是开着的');
    ok(perf0.drop === 0 && perf0.base === 'high' && perf0.shadow === true, '开局是玩家选的基准档（含阴影）', JSON.stringify(perf0));
    const dprBase = await ev('Math.min(window.devicePixelRatio || 1, 2)');
    ok(perf0.dpr === dprBase, '基准档像素比 = min(dpr, 2)', `${perf0.dpr} vs ${dprBase}`);
    // 伪造低帧：30fps 连续 2 秒
    await ev('__game.ui.perf.setFps(30), __game.ui.perf.tick(1), __game.ui.perf.tick(1), 1');
    const perf1 = JSON.parse(await ev('JSON.stringify(__game.ui.perf.state())'));
    ok(perf1.drop === 1, '连续 2 秒低于 40 → 降一层', JSON.stringify(perf1));
    const dprMid = await ev('Math.min(window.devicePixelRatio || 1, 1.25)');
    ok(perf1.dpr === dprMid, '降到 1.25x 像素比', `${perf1.dpr} vs ${dprMid}`);
    ok(perf1.told === true, '第一次降档给了提示');
    // 继续低帧：再降一层 → 关阴影
    await ev('__game.ui.perf.tick(1), __game.ui.perf.tick(1), 1');
    const perf2 = JSON.parse(await ev('JSON.stringify(__game.ui.perf.state())'));
    ok(perf2.drop === 2 && perf2.shadow === false, '再压一层 → 关阴影', JSON.stringify(perf2));
    // 帧率回来了：稳 5 秒 → 升一层
    await ev('__game.ui.perf.setFps(60), __game.ui.perf.tick(1), __game.ui.perf.tick(1), __game.ui.perf.tick(1), __game.ui.perf.tick(1), __game.ui.perf.tick(1), 1');
    const perf3 = JSON.parse(await ev('JSON.stringify(__game.ui.perf.state())'));
    ok(perf3.drop === 1, '稳 5 秒 60fps → 升回一层', JSON.stringify(perf3));
    ok(perf3.shadow === true, '阴影回来了', String(perf3.shadow));
    // 不写存档
    const qSaved = await ev('JSON.parse(localStorage.getItem("naiwa_rouge_profile_v1")).settings.quality');
    ok(qSaved === 'high', '自动降档没写进存档设置', qSaved);
    ok(await ev('__game.ui.quality()') === 'high', 'ui.quality() 仍报玩家选的 high');

    // ============================================================
    console.log('\n[H] 盾斧兽人 / 孢生菇 尺寸');
    // ============================================================
    const sizes = JSON.parse(await ev(`(() => {
      const a = __game.enemies.spawn('shielder', { x: 4, z: 0 }, {});
      const b = __game.enemies.spawn('brood', { x: -4, z: 0 }, {});
      return JSON.stringify({
        sh: a ? { h: +a.height.toFixed(2), r: +a.cfg.radius.toFixed(2) } : null,
        br: b ? { h: +b.height.toFixed(2), r: +b.cfg.radius.toFixed(2) } : null,
      });
    })()`));
    // 第 62 块（用户再调）：3.80 / 3.28 被判定「太大」，收敛到战士的 1.4 倍 = 1.90
    ok(sizes.sh && Math.abs(sizes.sh.h - 1.90) < 0.02, '盾斧兽人身高 1.90', JSON.stringify(sizes.sh));
    ok(sizes.sh && Math.abs(sizes.sh.r - 0.62) < 0.02, '盾斧兽人半径 0.62', JSON.stringify(sizes.sh));
    ok(sizes.br && Math.abs(sizes.br.h - 1.90) < 0.02, '孢生菇身高 1.90', JSON.stringify(sizes.br));
    ok(sizes.br && Math.abs(sizes.br.r - 0.55) < 0.02, '孢生菇半径 0.55', JSON.stringify(sizes.br));

    // ============================================================
    console.log('\n[H2] 局外商店诅咒：负向真的扣属性 + 注入合并');
    // ============================================================
    const curseFix = JSON.parse(await ev(`(() => {
      const M = window.__game.meta;
      for (let i = 0; i < 120; i++) M.buy('wood', true);   // admin 不扣钱
      const s = M.state();
      let neg = 0, pos = 0;
      for (const m of s.mods) { if ((m.flat || 0) < 0 || (m.pct || 0) < 0) neg++; else pos++; }
      const injected = M.apply();
      return JSON.stringify({ total: s.mods.length, neg, pos, injected, maxHp: +window.__game.stats.get('maxHp').toFixed(2) });
    })()`));
    ok(curseFix.neg > 0, '诅咒开出的负面项在存档里是**负数**（旧版记成正数 = 白送属性）', JSON.stringify(curseFix));
    ok(curseFix.injected < curseFix.total, '注入时按属性合并（开 100+ 次也不会让每帧遍历几百条）', JSON.stringify(curseFix));
    ok(curseFix.injected <= 40, '合并后注入条数很少', String(curseFix.injected));
    ok(curseFix.maxHp > 0, '生命上限没被诅咒扣穿（兜底留 1 点以上）', String(curseFix.maxHp));

    // ============================================================
    console.log('\n[I] 夜行记忆：能读、渲染闸门停住');
    // ============================================================
    await ev("document.getElementById('exitBtn').click(), 1");
    await sleep(500);
    // 「存档并退出」会先弹确认框
    if (await ev("document.getElementById('confirmAsk')?.classList.contains('on')")) {
      await ev("document.getElementById('caOk').click(), 1");
    }
    await sleep(600);
    await waitFor("__game.getState() === 'title'", 20000, '回到标题页');
    // 把可能排队上场的公告/签到/宣传直接摘掉（走函数会触发 350ms 链，截图就脏了）
    await ev(`['noticeOv','promoOv','signOv'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) { el.classList.remove('on','art'); el.setAttribute('aria-hidden','true'); }
    }), 1`);
    await sleep(300);
    await ev("document.getElementById('btnStory').click(), 1");
    await waitFor("document.getElementById('storyScr')?.classList.contains('on')", 8000, '夜行记忆打开');
    await sleep(300);
    const framesA = await ev('__game.render.frames()');
    await sleep(700);
    const framesB = await ev('__game.render.frames()');
    ok(framesB === framesA, '菜单期间世界不再重绘（渲染闸门生效）', `${framesA} → ${framesB}`);
    const scrolled = await ev(`(() => {
      document.querySelector('#stList .st-item').click();
      return 1;
    })()`);
    await sleep(500);
    ok(scrolled === 1, '点开第一夜');
    ok(await ev("document.getElementById('storyRead')?.classList.contains('on')") === true, '阅读器打开');
    const bodyLen = await ev("document.getElementById('srBody').textContent.length");
    ok(bodyLen > 500, '正文有内容', String(bodyLen));
    // 滚到底再滚回来，量滚动条是否稳定（不崩、不跳）
    const scrollRes = JSON.parse(await ev(`(() => {
      const el = document.getElementById('srBody');
      const h0 = el.scrollHeight;
      el.scrollTop = h0;
      const a = el.scrollTop;
      el.scrollTop = 0;
      return JSON.stringify({ h0, a, back: el.scrollTop, willChange: getComputedStyle(el).willChange });
    })()`));
    ok(scrollRes.a > 100, '能滚到底', JSON.stringify(scrollRes));
    ok(scrollRes.back === 0, '能滚回顶部（内容没有被卸载）', JSON.stringify(scrollRes));
    ok(/scroll-position/.test(scrollRes.willChange), '滚动容器保留了滚动图层', scrollRes.willChange);
    await shot('story_reader.png');
    await ev("document.getElementById('srClose').click(), 1");
    await sleep(300);

    // ============================================================
    console.log('\n[J] 火种面板：传说卡不再无限呼吸');
    // ============================================================
    const anim = JSON.parse(await ev(`(() => {
      const el = document.createElement('div');
      el.className = 'up-item';
      el.setAttribute('data-rarity', 'legend');
      el.style.display = 'none';
      document.body.appendChild(el);
      const cs = getComputedStyle(el);
      const out = { name: cs.animationName, iter: cs.animationIterationCount, dur: cs.animationDuration };
      el.remove();
      return JSON.stringify(out);
    })()`));
    ok(/legendIn/.test(anim.name), '传说卡用的是入场动画 legendIn', JSON.stringify(anim));
    ok(anim.iter === '1', '只播一次，不是 infinite', String(anim.iter));
    // 无模糊：全屏浮层上不许再有 backdrop-filter
    const blurs = await ev(`(() => {
      const names = ['signOv','promoOv','noticeOv','storyRead','upgrade','result','modal','ttSub'];
      let n = 0;
      document.querySelectorAll('*').forEach((el) => {
        const cs = getComputedStyle(el);
        const v = cs.backdropFilter || cs.webkitBackdropFilter || '';
        if (v && v !== 'none') n++;
      });
      return n;
    })()`);
    ok(blurs === 0, '页面上没有任何 backdrop-filter（手机卡顿主因已拆）', String(blurs));

    // ============================================================
    console.log('\n[K] JS 报错');
    // ============================================================
    ok(jsErrors.length === 0, '0 个 JS 错误', jsErrors.slice(0, 3).join(' | '));
  } catch (e) {
    fail++;
    fails.push('脚本异常: ' + e.message);
    console.log('\n[脚本异常] ' + e.message);
  } finally {
    console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
    if (fail) console.log('失败项：\n - ' + fails.join('\n - '));
    console.log('截图目录：' + OUT);
    if (ws) ws.close();
    chrome.kill();
  }
  process.exit(fail ? 1 : 0);
})();
