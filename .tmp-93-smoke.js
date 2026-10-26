// 第 93 块 · 冒烟：防御上限 70%（每一下至少吃 30%）
//   ① 版本号同步、无 JS 异常
//   ② 属性页「防御」行下面真的能看到那条上限小字（不是只改了个没人读的字段）
//   ③ 实战：防御 6 挨第九关 R20 的 7 点伤害 → 扣 2.1（改造前是 1，等于无敌）
//   ④ 打怪那一侧不传保底：rollDamage(targetArmor 6) 依旧是 1（怪物减伤没被打穿）
//   ⑤ 裸防 / 早期小伤害完全无感
// 跑法：先起 `python -m http.server 8124`（cwd=naiwa-rouge），再 `node .tmp-93-smoke.js`
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9393;
const UD = path.join(os.tmpdir(), 'naiwa-cdp-93smoke');
const SHOT = path.join(os.tmpdir(), 'naiwa-93-statpage.png');
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
        await sleep(120);
      }
      throw new Error('等超时：' + why);
    }
    async function settle(max = 60) {
      for (let i = 0; i < max; i++) {
        const st = await ev('__game.state');
        if (st === 'playing') return true;
        if (st === 'hint') await ev('document.getElementById("hiOk").click()');
        else if (st === 'wtut') await ev('document.getElementById("wtSkip").click()');
        else if (st === 'meet') await ev('document.getElementById("mtOk").click()');
        else if (st === 'weapon') await ev('document.getElementById("wcOk").click()');
        else if (st === 'tutorial') await ev('__game.tutorial.skip()');
        else break;
        await sleep(160);
      }
      return (await ev('__game.state')) === 'playing';
    }

    await send('Page.navigate', { url: URL });
    await waitFor('!!window.__game', 90000, '等到 __game 就绪');
    await sleep(700);

    // ------------------------------------------------------------ 1
    console.log('\n[1] 版本与启动');
    const mainSrc = await ev(`(() => { const s = document.querySelector('script[src*="main.js"]'); return s ? s.src : ''; })()`);
    const idxSrc = await ev(`fetch('index.html').then(r => r.text())`);
    const ver = (idxSrc.match(/v=(\d+)/) || [])[1] || '';
    ok(ver === '104', `index.html 版本 v=104（实读 ${ver}）`, ver);
    ok(new RegExp('v=' + ver).test(mainSrc), `main.js 也带同一个版本（v=${ver}）`, mainSrc);
    ok(jsErrors.length === 0, '加载阶段无 JS 异常', jsErrors.slice(0, 3).join(' | '));

    // ------------------------------------------------------------ 2 属性页小字
    console.log('\n[2] 属性页：防御行下面的上限小字');
    await ev(`(() => { const x = document.getElementById('noticeX'); if (x) x.click(); return 1; })()`);
    await ev('__game.statPage.show()');
    await sleep(500);
    ok((await ev('__game.statPage.rows()')) > 0, '属性页渲染出行（rows > 0）', String(await ev('__game.statPage.rows()')));
    const noteInfo = await ev(`(() => {
      const rows = [...document.querySelectorAll('#statRows .st-row')];
      const row = rows.find((r) => (r.querySelector('.st-name') || {}).textContent === '防御');
      if (!row) return { found: false };
      const n = row.querySelector('.st-note');
      const val = (row.querySelector('.st-val') || {}).textContent || '';
      const cs = n ? getComputedStyle(n) : null;
      return {
        found: true, val,
        hasNote: !!n,
        text: n ? n.textContent : '',
        visible: n ? (cs.display !== 'none' && cs.visibility !== 'hidden' && +cs.opacity > 0.05) : false,
        rect: n ? n.getBoundingClientRect().width : 0,
        fs: n ? cs.fontSize : '',
      };
    })()`);
    ok(noteInfo.found, '属性页里找得到「防御」这一行');
    ok(noteInfo.hasNote, '防御行有 .st-note 小字（不是只改了数据字段）');
    ok(/30%/.test(String(noteInfo.text)), `小字里写着「至少吃 30%」（实际：${noteInfo.text}）`, noteInfo.text);
    ok(noteInfo.visible && noteInfo.rect > 40, '小字真的渲染出来了（可见、有宽度）', JSON.stringify(noteInfo));
    // 面板必须能滚到它（防御在「生存」组，靠前，正常情况下不用滚）
    ok(await ev(`(() => { const el = [...document.querySelectorAll('#statRows .st-row')]
        .find(r => (r.querySelector('.st-name')||{}).textContent === '防御');
      if (!el) return false;
      const b = el.getBoundingClientRect(), box = document.getElementById('statRows').getBoundingClientRect();
      return b.top >= box.top - 1 && b.bottom <= box.bottom + 1; })()`), '防御行在可视区域内（不用滚动就看得见）');

    // 截图留证（先把首次进入的公告卡收掉，否则它盖在属性页上）
    await ev(`(() => { try { __game.notice.hide(); } catch (_) {} return 1; })()`);
    await sleep(350);
    const snap = await send('Page.captureScreenshot', { format: 'png' });
    if (snap.result?.data) {
      fs.writeFileSync(SHOT, Buffer.from(snap.result.data, 'base64'));
      console.log('  · 截图：' + SHOT);
    }

    await ev('document.getElementById("statBack").click()');
    await sleep(300);

    // ------------------------------------------------------------ 3 开局
    console.log('\n[3] 实战：防御 6 挨 7 点');
    await ev('__game.setPendingLevel(9)');
    await ev('(async () => { await __game.beginGame({ tutorial: false }); return 1; })()');
    await sleep(1000);
    ok(await settle(), '世界进入 playing', await ev('__game.state'));

    // 站桩：把波次关掉，免得测伤害时被别的怪插一脚
    await ev('__game.setPaused(true)');
    await sleep(200);

    const armorBefore = await ev('__game.stats.get("armor")');
    await ev('__game.buff("armor", 6)');
    const armorNow = await ev('__game.stats.get("armor")');
    ok(Math.abs(armorNow - (armorBefore + 6)) < 1e-6, `防御成功 +6（${armorBefore} → ${armorNow}）`, `${armorBefore} → ${armorNow}`);

    const hit = await ev(`(() => {
      __game.setIframe(0);
      const before = __game.stats.hp.cur;
      __game.hurt(7);                       // 第九关 R20 的怪物伤害
      return { before, after: __game.stats.hp.cur, taken: +(before - __game.stats.hp.cur).toFixed(3) };
    })()`);
    ok(Math.abs(hit.taken - 2.1) < 1e-3, `挨 7 点伤害实际扣 2.1（实扣 ${hit.taken}）`, JSON.stringify(hit));
    ok(hit.taken > 1.05, '不再是「固定 1 点」的无敌区', String(hit.taken));

    // 再堆到 20 点防御也一样是 2.1 —— 上限硬约束
    await ev('__game.buff("armor", 14)');
    const hit2 = await ev(`(() => {
      __game.setIframe(0);
      const before = __game.stats.hp.cur;
      __game.hurt(7);
      return +(before - __game.stats.hp.cur).toFixed(3);
    })()`);
    ok(Math.abs(hit2 - 2.1) < 1e-3, `防御堆到 20 仍然只降 2.1（实扣 ${hit2}），不会免疫`, String(hit2));

    // ------------------------------------------------------------ 4 打怪侧不变
    console.log('\n[4] 打怪侧不受影响');
    const rd = await ev('__game.stats.rollDamage({ targetArmor: 6 }).damage');
    ok(Math.abs(rd - 1) < 1e-6 || rd === 1, `rollDamage(targetArmor 6) 仍是「减法到 1」（实际 ${rd}）`, String(rd));
    const rdHigh = await ev('__game.stats.rollDamage({ targetArmor: 99 }).damage');
    ok(Math.abs(rdHigh - 1) < 1e-6, `怪物防御堆到 99 也保底 1 点（实际 ${rdHigh}）`, String(rdHigh));

    // ------------------------------------------------------------ 5 小伤害
    console.log('\n[5] 小伤害仍走减法（保底 1 点兜着，不会被 30% 抬成 0.6）');
    const small = await ev(`(() => {
      __game.setIframe(0);
      const before = __game.stats.hp.cur;
      __game.hurt(2);              // 第一关的小兵伤害
      return { taken: +(before - __game.stats.hp.cur).toFixed(3), armor: __game.stats.get('armor') };
    })()`);
    ok(small.taken > 0 && small.taken <= 2,
      `2 点小伤害按 max(1, 2-防御) 扣，实扣 ${small.taken}（防御 ${small.armor}）`, JSON.stringify(small));
    ok(Math.abs(small.taken - 1) < 1e-6, '防御远超伤害时仍保底 1 点（不是 0.6、更不是 0）', String(small.taken));

    ok(jsErrors.length === 0, '整场无 JS 异常', jsErrors.slice(0, 3).join(' | '));

    // ------------------------------------------------------------ 汇总
    console.log('\n' + '='.repeat(52));
    console.log(`  通过 ${pass} / 失败 ${fail}`);
    if (fail) { console.log('  失败项：'); fails.forEach((f) => console.log('   - ' + f)); }
    console.log('='.repeat(52));
  } catch (e) {
    console.log('\n!! 冒烟脚本异常：' + (e && e.message));
    console.log('   JS 错误：' + jsErrors.slice(0, 5).join(' | '));
    fail++;
  } finally {
    try { if (ws) ws.close(); } catch (_) { /* 忽略 */ }
    try { chrome.kill(); } catch (_) { /* 忽略 */ }
    await sleep(400);
    process.exit(fail ? 1 : 0);
  }
})();
