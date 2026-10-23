// 第 58 块 CDP：局外商店 · 宝箱 真浏览器验证
//   A 商店 UI：主菜单按钮 → 子界面 → 3 档宝箱渲染、骨币显示
//   B 开箱分布：木匣诅咒率 ~35% / 金匣 ~7%，稀有项（法器/技能CD）只出在银·金
//   C 骨币扣费：钱不够不能开；钱够才开，且扣对应骨币
//   D 开箱揭示：真实购买 → 浮层弹出 → 宝箱开 → 结果卡 → 收下关掉 → 记入开箱记录
//   E 永久效果落地：买技能CD缩短 / 永久法器（admin 批量）→ 开局后 weapon/arrowRain CD 变短、法器生效
//   F 属性页把局外商店加成算进去（不崩）
// 跑法：先 `python -m http.server 8124 --bind 127.0.0.1`（cwd=naiwa-rouge），再 `node .tmp-block58-cdp.js`
// 注意：?debug=1&title = 调试模式但停在标题页
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9368;
const UD = path.join(os.tmpdir(), 'naiwa-cdp-58');
const OUT = path.join(os.tmpdir(), 'naiwa-block58');
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
    '--disable-dev-shm-usage', '--user-data-dir=' + UD,
    '--window-size=420,900', 'about:blank',
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
    await send('Runtime.enable');
    await send('Page.enable');

    await send('Page.navigate', { url: URL });
    await waitFor('!!window.__game', 90000, '__game 就绪');
    await ev('window.__game.promo.clear(); window.__game.notice.clear()');
    await waitFor("document.getElementById('titleScr').style.display !== 'none' && !document.getElementById('titleScr').classList.contains('off')", 15000, '标题页淡入完成');

    // ============================================================
    console.log('\n[A] 商店 UI：主菜单 → 局外商店子界面');
    // ============================================================
    await ev("document.getElementById('btnShop').click()");
    await waitFor("document.getElementById('msScr').classList.contains('on')", 8000, '局外商店打开');
    const msItems = await ev("document.querySelectorAll('#msList .ms-item').length");
    ok(msItems === 3, '3 档宝箱渲染（木/银/金）', String(msItems));
    const msBonesTxt = await ev("document.getElementById('msBones').textContent");
    ok(/^\d+$/.test(msBonesTxt), '骨币数显示正常', msBonesTxt);
    const names = await ev("Array.from(document.querySelectorAll('#msList .ms-name')).map(e=>e.textContent).join(',')");
    ok(/木匣/.test(names) && /银匣/.test(names) && /金匣/.test(names), '三档名字正确', names);
    const info = await ev("document.getElementById('msList').textContent");
    ok(/诅咒率/.test(info) && /强度/.test(info), '每项显示诅咒率与强度');
    await ev("document.getElementById('msBack').click()");
    await sleep(150);
    ok(await ev("document.getElementById('msScr').classList.contains('on')") === false, '返回能关掉');

    // ============================================================
    console.log('\n[B] 开箱分布（纯随机，大样本）');
    // ============================================================
    const wood = await ev(`(() => {
      let cursed = 0, pos = 0;
      for (let i = 0; i < 600; i++) { const r = window.__game.meta.roll('wood'); if (r.cursed) cursed++; else pos++; }
      return { cursed, pos };
    })()`);
    ok(wood.cursed >= 150 && wood.cursed <= 270, `木匣诅咒率落在 35% 附近（${wood.cursed}/600）`, JSON.stringify(wood));
    const gold = await ev(`(() => {
      let cursed = 0, skillcd = 0, relic = 0, stat = 0, special = 0;
      for (let i = 0; i < 800; i++) {
        const r = window.__game.meta.roll('gold');
        if (r.cursed) cursed++;
        else if (r.kind === 'skillcd') { skillcd++; special++; }
        else if (r.kind === 'relic') { relic++; special++; }
        else stat++;
      }
      return { cursed, skillcd, relic, stat, special };
    })()`);
    ok(gold.cursed >= 20 && gold.cursed <= 100, `金匣诅咒率落在 7% 附近（${gold.cursed}/800）`, JSON.stringify(gold));
    ok(gold.special > 120, `金匣稀有项（法器/技能CD）占比 ~28%（实测 ${gold.special}/800）`, JSON.stringify(gold));
    ok(gold.skillcd > 0 && gold.relic > 0, '金匣两种稀有项都出过（技能CD + 永久法器）', JSON.stringify(gold));
    // 木匣绝不出稀有项
    const woodSpecial = await ev(`(() => {
      let s = 0; for (let i = 0; i < 400; i++) { const r = window.__game.meta.roll('wood'); if (r.kind !== 'stat') s++; }
      return s;
    })()`);
    ok(woodSpecial === 0, '木匣不出稀有项（只给普通属性）', String(woodSpecial));

    // ============================================================
    console.log('\n[C] 骨币扣费：钱不够不能开，钱够才开且扣费');
    // ============================================================
    await ev('window.__game.meta.addBones(50)');
    await ev("document.getElementById('btnShop').click()");
    await waitFor("document.getElementById('msScr').classList.contains('on')", 8000, '重开商店');
    await ev("document.querySelectorAll('#msList .ms-buy')[2].click()");  // 金匣（280 > 50）
    await sleep(200);
    ok(await ev('window.__game.meta.state().opened') === 0, '钱不够买金匣 → 不开箱（opened=0）');
    const bonesBefore = await ev('window.__game.meta.bones()');
    ok(bonesBefore === 50, '骨币没被扣', String(bonesBefore));
    // 补到够，再买金匣
    await ev('window.__game.meta.addBones(950)');
    await ev("document.getElementById('msBack').click()");
    await sleep(120);
    await ev("document.getElementById('btnShop').click()");
    await waitFor("document.getElementById('msScr').classList.contains('on')", 8000, '重开商店（钱够了）');
    const openedBefore = await ev('window.__game.meta.state().opened');
    await ev("document.querySelectorAll('#msList .ms-buy')[2].click()");  // 金匣：开启·280
    await waitFor("document.getElementById('boxReveal').classList.contains('on')", 5000, '真实购买 → 揭示浮层弹出');
    ok(true, '买得起 → 宝箱自动开启 + 揭示浮层弹出');

    // ============================================================
    console.log('\n[D] 开箱揭示动画 + 记入开箱记录');
    // ============================================================
    await waitFor("document.getElementById('brResult').classList.contains('show')", 4000, '结果卡浮现（宝箱开完）');
    ok(true, '宝箱抖动→打开→结果卡浮现（动画链路通）');
    const brCls = await ev("document.getElementById('brResult').firstChild.className");
    ok(/br-card/.test(brCls), '结果卡有样式类（good/rare/curse）', brCls);
    await ev("document.getElementById('brOk').click()");
    await sleep(200);
    ok(await ev("document.getElementById('boxReveal').classList.contains('on')") === false, '「收下」能关掉浮层');
    const openedAfter = await ev('window.__game.meta.state().opened');
    ok(openedAfter === openedBefore + 1, `opened +1（${openedBefore} → ${openedAfter}）`);
    const bonesAfter = await ev('window.__game.meta.bones()');
    ok(bonesAfter === bonesBefore + 950 - 280, `骨币扣掉 280（${bonesBefore + 950} → ${bonesAfter}）`, String(bonesAfter));
    const logLen = await ev('window.__game.meta.state().log.length');
    ok(logLen >= 1, '开箱记录写入', String(logLen));
    const logTxt = await ev("document.getElementById('msLog').textContent");
    ok(/开箱记录|木匣|银匣|金匣/.test(logTxt), '商店内开箱记录区有内容');
    await ev("document.getElementById('msBack').click()");
    await sleep(150);

    // ============================================================
    console.log('\n[E] 永久效果落地：admin 批量买 → 开局生效');
    // ============================================================
    // admin 批量买：木匣 200（验证正负都出、不出稀有），金匣 300（验证技能CD + 永久法器）
    const batch = await ev(`(() => {
      const M = window.__game.meta;
      for (let i = 0; i < 200; i++) M.buy('wood', true);
      for (let i = 0; i < 300; i++) M.buy('gold', true);
      const s = M.state();
      let pos = 0, neg = 0;
      for (const m of s.mods) { if (m.flat < 0 || m.pct < 0) neg++; else pos++; }
      const relicVals = Object.values(s.relics);
      const relicMax = relicVals.length ? Math.max(...relicVals) : 0;
      return { opened: s.opened, mods: s.mods.length, pos, neg, relics: s.relics, relicMax, skillCdMul: s.skillCdMul };
    })()`);
    ok(batch.opened >= 500, '批量开箱 opened 累计', String(batch.opened));
    ok(batch.mods > 400, '属性加成条数随开箱累积', String(batch.mods));
    ok(batch.pos > 0 && batch.neg > 0, `木匣诅咒令负面项也进了存档（正 ${batch.pos} / 负 ${batch.neg}）`, JSON.stringify(batch).slice(0, 120));
    ok(batch.relicMax <= 3, `永久法器单种封顶 3 级（实测最高 ${batch.relicMax}）`, JSON.stringify(batch.relics));
    ok(batch.skillCdMul <= 0.3 + 1e-9, `技能CD倍率被刷到下限 0.3（实测 ${batch.skillCdMul}）`);
    // 开局后验证 weapon/arrowRain CD 真的变短、法器真的带进去
    await ev('window.__game.beginGame({tutorial:false})');
    await waitFor('window.__game.render.live() === true', 25000, '进游戏后闸门打开');
    const fireCd = await ev('window.__game.fireCdTotal()');
    ok(fireCd < 6 - 1e-6, `万剑齐发冷却被缩短（实测 ${fireCd}s < 6s）`, String(fireCd));
    const relicLv = await ev('window.__game.relics.levels()');
    const relicTotal = Object.values(relicLv).reduce((a, n) => a + n, 0);
    ok(relicTotal > 0, '永久法器随开局带进战斗', JSON.stringify(relicLv));

    // ============================================================
    console.log('\n[F] 属性页把局外商店加成算进去（不崩）');
    // ============================================================
    // 回到标题再开属性页
    await ev('window.__game.toTitle ? window.__game.toTitle() : null');
    await sleep(300);
    await ev("document.getElementById('btnStats').click()");
    await waitFor("document.getElementById('statScr').classList.contains('on')", 8000, '属性页打开');
    const stRows = await ev("document.querySelectorAll('#statRows .st-row').length");
    ok(stRows >= 10, '属性页渲染出属性行（含局外商店加成）', String(stRows));
    await ev("document.getElementById('statBack').click()");
    await sleep(150);

    const realErrors = jsErrors.filter((e) => !/autoplay|AudioContext|play\(\) failed|favicon/i.test(e));
    ok(realErrors.length === 0, `全程无 JS 报错（${realErrors.length}）`, realErrors.slice(0, 3).join(' | '));
    console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
    if (fails.length) { console.log('失败清单：'); fails.forEach((f) => console.log('  · ' + f)); }
  } finally {
    if (ws) ws.close();
    chrome.kill();
  }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('CDP 套件失败:', e.message); process.exit(1); });
