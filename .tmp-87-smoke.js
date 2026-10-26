// 第 87 块 · 冒烟：三条平衡性改动在真浏览器里真的生效
//   ① 事件回血 → 生命上限 +N 且补 N（含「回满」也抬上限）
//   ② 药水不售罄（同店可连买）+ 新价格
//   ③ 再生 / 吸血的新数值（读三选一卡池，不靠抽运气）
// 跑法：先起 `python -m http.server 8124`（cwd=naiwa-rouge），再 `node .tmp-87-smoke.js`
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9387;
const UD = path.join(os.tmpdir(), 'naiwa-cdp-87smoke');
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
    await sleep(600);

    // ---------- 1. 进第一关 ----------
    console.log('\n[1] 进第一关');
    await ev('__game.setPendingLevel(1)');
    await ev('(async () => { await __game.beginGame({ tutorial: false }); return 1; })()');
    await sleep(900);
    const settled = await settle();
    ok(settled, '世界进入 playing', await ev('__game.state'));

    // ---------- 2. 回血 = 上限 +N 且补 N ----------
    console.log('\n[2] evt({hp:2})：上限 +2、同时补 2');
    const h0 = await ev('__game.heal.hp()');
    const r1 = await ev('__game.evt({ hp: 2 })');
    ok(Math.abs(r1.after.max - r1.before.max - 2) < 0.01,
      `上限 ${r1.before.max} → ${r1.after.max}（+2）`, JSON.stringify(r1));
    ok(Math.abs(r1.after.cur - r1.before.cur - 2) < 0.01,
      `当前血 ${r1.before.cur} → ${r1.after.cur}（补 2）`, JSON.stringify(r1));
    ok(h0.max > 0, `初始上限读数正常（${h0.max}）`, JSON.stringify(h0));

    // 残血时：补血不该超过新上限
    console.log('\n[3] 残血时 evt({hp:2})：先扣 3 点再补');
    await ev('__game.heal.hurt(3)');
    const h2 = await ev('__game.heal.hp()');
    const r2 = await ev('__game.evt({ hp: 2 })');
    ok(Math.abs(r2.after.max - h2.max - 2) < 0.01, `上限又 +2（${h2.max} → ${r2.after.max}）`, JSON.stringify(r2));
    ok(Math.abs(r2.after.cur - h2.cur - 2) < 0.01, `残血补 2（${h2.cur} → ${r2.after.cur}）`, JSON.stringify(r2));
    ok(r2.after.cur <= r2.after.max + 0.01, '补血没有超过上限', `${r2.after.cur} / ${r2.after.max}`);

    // 连续叠：上限应该一直涨（不会因为满血就白给）
    console.log('\n[4] 满血时连点三次：每次都涨上限');
    await ev('__game.heal.fill()');
    const r3 = await ev(`(() => {
      const a = __game.evt({ hp: 1 });
      const b = __game.evt({ hp: 1 });
      const c = __game.evt({ hp: 1 });
      return { max0: a.before.max, max3: c.after.max, cur3: c.after.cur };
    })()`);
    ok(Math.abs(r3.max3 - r3.max0 - 3) < 0.01, `三次共 +3 上限（${r3.max0} → ${r3.max3}）`, JSON.stringify(r3));
    ok(Math.abs(r3.cur3 - r3.max3) < 0.01, '每次都补满，血一直是满的', JSON.stringify(r3));

    // ---------- 5. 「回满」也抬上限 ----------
    console.log('\n[5] evt({healFull:true})：上限 +2 且回满');
    await ev('__game.heal.hurt(2)');
    const h5 = await ev('__game.heal.hp()');
    const r5 = await ev('__game.evt({ healFull: true })');
    ok(Math.abs(r5.after.max - h5.max - 2) < 0.01, `上限 +2（${h5.max} → ${r5.after.max}）`, JSON.stringify(r5));
    ok(Math.abs(r5.after.cur - r5.after.max) < 0.01, '血回满到新上限', JSON.stringify(r5));

    // ---------- 6. 扣血不改上限 ----------
    console.log('\n[6] evt({hp:-1})：只掉血，不动上限');
    const h6 = await ev('__game.heal.hp()');
    const r6 = await ev('__game.evt({ hp: -1 })');
    ok(Math.abs(r6.after.max - h6.max) < 0.01, '上限不变', JSON.stringify(r6));
    ok(Math.abs(r6.after.cur - h6.cur + 1) < 0.01, `血 -1（${h6.cur} → ${r6.after.cur}）`, JSON.stringify(r6));

    // ---------- 7. 三选一卡池：再生 / 吸血的新数值 ----------
    console.log('\n[7] 三选一卡池的再生 / 吸血');
    const pool = await ev(`(() => {
      const all = __game.upgrade.list;
      return all.filter(u => u.family === 'regen' || u.family === 'vamp').map(u => ({ f: u.family, t: u.tier, v: u.flat, title: u.title }));
    })()`);
    if (!pool) {
      console.log('  （没暴露卡池，改读卡面按钮）');
    } else {
      const rg = pool.filter((u) => u.f === 'regen').map((u) => u.v).sort((a, b) => a - b);
      const vm = pool.filter((u) => u.f === 'vamp').map((u) => u.v).sort((a, b) => a - b);
      ok(JSON.stringify(rg) === JSON.stringify([0.05, 0.09, 0.16]), `再生三档 ${rg.join('/')}`, JSON.stringify(rg));
      ok(JSON.stringify(vm) === JSON.stringify([0.03, 0.06, 0.11]), `吸血三档 ${vm.join('/')}`, JSON.stringify(vm));
    }

    // ---------- 8. 商店：药水可连着买 ----------
    console.log('\n[8] 商店买两瓶小药');
    await ev('__game.evt({ gold: 100 })');
    const gold0 = await ev('__game.coins');
    await ev('__game.shop.open(9)');
    await sleep(300);
    const price = await ev('(__game.shop.items.find(i => i.id === "potion") || {}).price');
    ok(price === 5, `架上小药 ${price} 骨币`, String(price));
    const bag0 = await ev('+(document.getElementById("bagNum").textContent.replace(/[^0-9]/g, "") || 0)');
    await ev('__game.shop.buy("potion")');
    await sleep(200);
    const bag1 = await ev('+(document.getElementById("bagNum").textContent.replace(/[^0-9]/g, "") || 0)');
    await ev('__game.shop.buy("potion")');
    await sleep(200);
    const bag2 = await ev('+(document.getElementById("bagNum").textContent.replace(/[^0-9]/g, "") || 0)');
    ok(bag1 === bag0 + 1, `买第一瓶进背包（${bag0} → ${bag1}）`);
    ok(bag2 === bag1 + 1, `同一家店还能买第二瓶（${bag1} → ${bag2}）`);
    const gold1 = await ev('__game.coins');
    ok(Math.abs(gold0 - gold1 - 2 * 5) < 1, `两瓶共扣 ${(gold0 - gold1).toFixed(0)} 骨币`, `${gold0} → ${gold1}`);
    const soldTxt = await ev('__game.shop.isOpen()');
    ok(soldTxt === true, '商店还开着（可以继续买）');

    // 大药也验一下价格
    const bigPrice = await ev('(__game.shop.items.find(i => i.id === "bigPotion") || {}).price');
    ok(bigPrice === 12, `大药价格 ${bigPrice}`, String(bigPrice));

    await ev('__game.shop.close()');

    // ---------- 9. 没有 JS 报错 ----------
    console.log('\n[9] 控制台');
    const realErr = jsErrors.filter((e) => !/favicon|Failed to load resource/i.test(e));
    ok(realErr.length === 0, '没有 JS 报错', realErr.slice(0, 2).join(' | '));
  } catch (e) {
    fail++;
    fails.push(String(e && e.message || e));
    console.log('  ✗ 异常：' + (e && e.message || e));
  } finally {
    try { if (ws) ws.close(); } catch (_) { /* ignore */ }
    try { chrome.kill(); } catch (_) { /* ignore */ }
  }

  console.log('\n' + '─'.repeat(52));
  console.log(`通过 ${pass} · 失败 ${fail}`);
  if (fail) { console.log('失败项：'); fails.forEach((f) => console.log('  - ' + f)); }
  process.exit(fail ? 1 : 0);
})();
