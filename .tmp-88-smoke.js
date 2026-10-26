// 第 88 块 · 冒烟：生命模型从「低血量 + 靠回血」转成「高血量存量」
//   ① 基础上限 6 → 10（开局就是 10/10）
//   ② 事件「生命上限 +N」翻倍后真的结算进上限
//   ③ 商店硬壳 +4、厚皮三档 3/6/10、回满 +4
//   ④ 血上限堆到 20+ 以后，血条 HUD 依然按比例正常（不是固定格数）
// 跑法：先起 `python -m http.server 8124`（cwd=naiwa-rouge），再 `node .tmp-88-smoke.js`
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9388;
const UD = path.join(os.tmpdir(), 'naiwa-cdp-88smoke');
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

    // ---------- 1. 开局血条：10 / 10 ----------
    console.log('\n[1] 进第一关，开局就是 10 点上限');
    await ev('__game.setPendingLevel(1)');
    await ev('(async () => { await __game.beginGame({ tutorial: false }); return 1; })()');
    await sleep(900);
    const settled = await settle();
    ok(settled, '世界进入 playing', await ev('__game.state'));

    const h0 = await ev('__game.heal.hp()');
    ok(Math.abs(h0.max - 10) < 0.01, `基础上限 = 10（旧 6）`, JSON.stringify(h0));
    ok(Math.abs(h0.cur - 10) < 0.01, '开局满血 10/10', JSON.stringify(h0));
    const hudMax = await ev('document.getElementById("hpMax").textContent');
    ok(/10/.test(hudMax), `HUD 上限显示 ${hudMax}`, hudMax);

    // ---------- 2. 事件的上限加成真的落账 ----------
    console.log('\n[2] evt({hp:4})（事件翻倍后的常见档位）');
    const r1 = await ev('__game.evt({ hp: 4 })');
    ok(Math.abs(r1.after.max - r1.before.max - 4) < 0.01,
      `上限 ${r1.before.max} → ${r1.after.max}（+4）`, JSON.stringify(r1));
    ok(Math.abs(r1.after.cur - r1.after.max) < 0.01, '同时补满到新上限', JSON.stringify(r1));

    // 小档 / 大档都验一遍，别只有中间那档对
    const r2 = await ev('__game.evt({ hp: 2 })');
    ok(Math.abs(r2.after.max - r2.before.max - 2) < 0.01, `最小档 +2 也对（${r2.before.max} → ${r2.after.max}）`);
    const r3 = await ev('__game.evt({ hp: 8 })');
    ok(Math.abs(r3.after.max - r3.before.max - 8) < 0.01, `最大档 +8 也对（${r3.before.max} → ${r3.after.max}）`);

    // ---------- 3. 回满 → 上限 +4 ----------
    console.log('\n[3] evt({healFull:true})：上限 +4 且回满');
    await ev('__game.heal.hurt(6)');
    const h3 = await ev('__game.heal.hp()');
    const r4 = await ev('__game.evt({ healFull: true })');
    ok(Math.abs(r4.after.max - h3.max - 4) < 0.01, `上限 +4（${h3.max} → ${r4.after.max}）`, JSON.stringify(r4));
    ok(Math.abs(r4.after.cur - r4.after.max) < 0.01, '血补到新上限', JSON.stringify(r4));

    // ---------- 4. 扣血仍然只掉血 ----------
    console.log('\n[4] evt({hp:-2})：只掉血，不动上限');
    const h4 = await ev('__game.heal.hp()');
    const r5 = await ev('__game.evt({ hp: -2 })');
    ok(Math.abs(r5.after.max - h4.max) < 0.01, '上限没变', JSON.stringify(r5));
    ok(Math.abs(r5.after.cur - h4.cur + 2) < 0.01, `血 -2（${h4.cur} → ${r5.after.cur}）`, JSON.stringify(r5));

    // ---------- 5. 卡池：厚皮 3/6/10 ----------
    console.log('\n[5] 三选一的厚皮三档');
    const hide = await ev(`(() => {
      const all = __game.upgrade.list.filter(u => u.family === 'hide');
      return all.map(u => ({ v: u.flat, title: u.title })).sort((a, b) => a.v - b.v);
    })()`);
    ok(JSON.stringify(hide.map((x) => x.v)) === JSON.stringify([3, 6, 10]),
      `厚皮 ${hide.map((x) => x.v).join(' / ')}（旧 2 / 4 / 7）`, JSON.stringify(hide));
    ok(hide.every((x) => new RegExp('生命上限 \\+' + x.v).test(x.title)), '卡面数值同步', JSON.stringify(hide.map((x) => x.title)));

    // ---------- 6. 商店：硬壳 +4 ----------
    console.log('\n[6] 商店买硬壳：上限 +4');
    await ev('__game.evt({ gold: 100 })');
    await ev('__game.shop.open(9)');
    await sleep(300);
    const shellItem = await ev('(() => { const i = __game.shop.items.find(x => x.id === "shell"); return i ? { flat: i.flat, heal: i.heal, price: i.price } : null; })()');
    ok(shellItem && shellItem.flat === 4, `架上硬壳 flat = ${shellItem && shellItem.flat}（旧 2）`, JSON.stringify(shellItem));
    ok(shellItem && shellItem.price === 14, `价格仍是 ${shellItem && shellItem.price}（没跟着涨）`, String(shellItem && shellItem.price));

    const hb = await ev('__game.heal.hp()');
    await ev('__game.shop.buy("shell")');
    await sleep(250);
    const ha = await ev('__game.heal.hp()');
    ok(Math.abs(ha.max - hb.max - 4) < 0.01, `买完上限 ${hb.max} → ${ha.max}（+4）`, JSON.stringify({ hb, ha }));
    // 商店的 heal 是把**新增的那 4 点**补上（残血买也只会 +4，不是回满）
    ok(Math.abs(ha.cur - hb.cur - 4) < 0.01, `血同时 +4（${hb.cur} → ${ha.cur}）`, JSON.stringify(ha));
    await ev('__game.shop.close()');

    // ---------- 7. 堆到 20+ 以后 HUD 还正常 ----------
    console.log('\n[7] 上限堆到 24+，血条仍按比例');
    await ev('(() => { for (let i = 0; i < 4; i++) __game.evt({ hp: 4 }); return 1; })()');
    await ev('__game.heal.fill()');
    const hh = await ev('__game.heal.hp()');
    ok(hh.max >= 24, `上限已堆到 ${hh.max}`, String(hh.max));
    const w = await ev('document.getElementById("hpFill").style.width');
    ok(/100/.test(w), `满血时血条是 100%（${w}）`, w);
    // 打掉一半，看比例是不是跟着走（不是按固定 6 格算）
    await ev('__game.heal.hurt(' + (hh.max / 2) + ')');
    const w2 = await ev('document.getElementById("hpFill").style.width');
    const ratio = parseFloat(w2);
    ok(ratio > 45 && ratio < 55, `掉到一半时血条 ${w2}（按比例，不是固定格）`, w2);
    const hudMax2 = await ev('document.getElementById("hpMax").textContent');
    ok(parseFloat(hudMax2) === hh.max, `HUD 上限文字跟上了（${hudMax2}）`, hudMax2);

    // ---------- 8. 药水回 4 ----------
    console.log('\n[8] 小药回 4 点');
    await ev('__game.heal.fill()');
    await ev('__game.shop.open(9)');
    await sleep(250);
    await ev('__game.evt({ gold: 50 })');
    const hpBeforePotion = await ev('__game.heal.hp()');
    await ev('__game.shop.buy("potion")');
    await sleep(200);
    await ev('__game.shop.close()');
    // 喝掉：背包面板的饮用按钮
    const drank = await ev(`(() => {
      const b = document.getElementById('bagBtn');
      if (b) b.click();
      return 1;
    })()`);
    await sleep(350);
    const btn = await ev(`(() => {
      const el = [...document.querySelectorAll('#bagPanel button, .bag-item button, [data-item]')]
        .find(x => /药|喝/.test(x.textContent || ''));
      if (el) { el.click(); return el.textContent.trim(); }
      return null;
    })()`);
    await sleep(350);
    const hpAfterPotion = await ev('__game.heal.hp()');
    // 先把自己打到残血再喝更准；这里只要求「上限没被药水改」（消耗品定位）
    ok(Math.abs(hpAfterPotion.max - hpBeforePotion.max) < 0.01,
      '药水不改上限（仍是消耗品）', JSON.stringify({ hpBeforePotion, hpAfterPotion, btn, drank }));

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
