// 第 89 块 · 冒烟：暴击率提升幅度整体削 1/3（局内全部）
//   ① 卡池：锐目 10/18/32、致命附带 4/7/12、福星 +3%、剑锋 11/19/34
//   ② 真取卡之后 stats / wstats 的累计值对得上（不是只有数据改了）
//   ③ 商店磨剑石 +3% / 18 金币，买完剑暴击从 10% 变 13%
//   ④ 页面加载干净（v=100）
// 跑法：先起 `python -m http.server 8124`（cwd=naiwa-rouge），再 `node .tmp-89-smoke.js`
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9389;
const UD = path.join(os.tmpdir(), 'naiwa-cdp-89smoke');
const URL = 'http://127.0.0.1:8124/index.html?debug=1&title&keepsave=1';

let pass = 0, fail = 0;
const fails = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; fails.push(name + (extra ? ' → ' + extra : '')); console.log('  ✗ ' + name + (extra ? ' → ' + extra : '')); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

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
        else if (st === 'upgrade') await ev('__game.upgrade.choose(__game.upgrade.roll(0)[0])');
        else break;
        await sleep(160);
      }
      return (await ev('__game.state')) === 'playing';
    }
    // 取一张卡：没开面板就先开，选完等回 playing
    async function takeCard(pred) {
      await ev(`(() => {
        const u = __game.upgrade.list.find(${pred});
        if (!u) throw new Error('卡池里找不到这张卡');
        __game.upgrade.show();
        __game.upgrade.choose(u);
        return u.id;
      })()`);
      await sleep(260);
      await settle();
    }

    await send('Page.navigate', { url: URL });
    await waitFor('!!window.__game', 90000, '等到 __game 就绪');
    await sleep(600);

    // ---------- 1. 加载干净 ----------
    console.log('\n[1] 页面与版本');
    const mainSrc = await ev(`(() => { const s = document.querySelector('script[src*="main.js"]'); return s ? s.src : ''; })()`);
    ok(/v=100/.test(mainSrc), `main.js 走 v=100（${mainSrc.split('/').pop()}）`, mainSrc);
    ok(await ev('typeof __game.upgrade.list.length === "number"'), '卡池可读');

    await ev('__game.setPendingLevel(1)');
    await ev('(async () => { await __game.beginGame({ tutorial: false }); return 1; })()');
    await sleep(900);
    ok(await settle(), '世界进入 playing', await ev('__game.state'));

    // ---------- 2. 卡池数值 ----------
    console.log('\n[2] 卡池：三张主角卡 + 剑锋');
    const eye = await ev(`__game.upgrade.list.filter(u => u.family === 'eye')
      .sort((a,b) => ({s:0,m:1,l:2})[a.tier] - ({s:0,m:1,l:2})[b.tier])
      .map(u => ({ v: u.flat, title: u.title }))`);
    ok(JSON.stringify(eye.map((x) => x.v.map ? x.v : x.v)) === JSON.stringify([0.1, 0.18, 0.32]),
      `锐目 ${eye.map((x) => Math.round(x.v * 100)).join(' / ')}%（旧 15 / 27 / 48）`, JSON.stringify(eye.map((x) => x.v)));
    ok(eye.map((x) => x.title).join('|') === '暴击率 +10%|暴击率 +18%|暴击率 +32%', '卡面数字同步', JSON.stringify(eye.map((x) => x.title)));

    const fang = await ev(`__game.upgrade.list.filter(u => u.family === 'fang')
      .sort((a,b) => ({s:0,m:1,l:2})[a.tier] - ({s:0,m:1,l:2})[b.tier])
      .map(u => ({ crit: (u.extra || u.extras[0]).flat, title: u.title }))`);
    ok(JSON.stringify(fang.map((x) => x.crit)) === JSON.stringify([0.04, 0.07, 0.12]),
      `致命附带暴击 ${fang.map((x) => Math.round(x.crit * 100)).join(' / ')}%（旧 6 / 10 / 18）`, JSON.stringify(fang.map((x) => x.crit)));
    ok(/暴击率 \+4%/.test(fang[0].title), '致命卡面写 +4%', fang[0].title);

    const star = await ev(`(() => { const u = __game.upgrade.list.find(x => x.id === 'luckStar');
      return { crit: u.extras.find(e => e.stat === 'critRate').flat, title: u.title }; })()`);
    ok(near(star.crit, 0.03), `福星暴击 +${Math.round(star.crit * 100)}%（旧 +5%）`, JSON.stringify(star));
    ok(/暴击 \+3%/.test(star.title), '福星卡面写 +3%', star.title);

    const sc = await ev(`__game.upgrade.list.filter(u => u.family === 'swordCrit')
      .sort((a,b) => ({s:0,m:1,l:2})[a.tier] - ({s:0,m:1,l:2})[b.tier])
      .map(u => ({ v: u.flat, title: u.title }))`);
    ok(JSON.stringify(sc.map((x) => x.v)) === JSON.stringify([0.11, 0.19, 0.34]),
      `剑锋 ${sc.map((x) => Math.round(x.v * 100)).join(' / ')}%（旧 16 / 28 / 50）`, JSON.stringify(sc.map((x) => x.v)));
    ok(sc.every((x) => /剑暴击率 \+/.test(x.title)), '剑锋卡面仍写「剑暴击率」', JSON.stringify(sc.map((x) => x.title)));

    // ---------- 3. 真取卡，累计值对得上 ----------
    console.log('\n[3] 取卡后 stats 真的涨这么多');
    const c0 = await ev('+__game.stats.get("critRate").toFixed(4)');
    ok(near(c0, 0), `开局主角暴击率 ${c0}（基础 0）`, String(c0));

    await takeCard("x => x.family === 'eye' && x.tier === 's'");
    const c1 = await ev('+__game.stats.get("critRate").toFixed(4)');
    ok(near(c1, c0 + 0.10), `拿一张锐目 → ${Math.round(c1 * 100)}%（+10）`, String(c1));

    await takeCard("x => x.family === 'eye' && x.tier === 'l'");
    const c2 = await ev('+__game.stats.get("critRate").toFixed(4)');
    ok(near(c2, c1 + 0.32), `再拿传说锐目 → ${Math.round(c2 * 100)}%（+32）`, String(c2));

    await takeCard("x => x.family === 'fang' && x.tier === 's'");
    const c3 = await ev('+__game.stats.get("critRate").toFixed(4)');
    ok(near(c3, c2 + 0.04), `致命附带的 +4% 也落账（${Math.round(c3 * 100)}%）`, String(c3));

    await takeCard("x => x.id === 'luckStar'");
    const c4 = await ev('+__game.stats.get("critRate").toFixed(4)');
    ok(near(c4, c3 + 0.03), `福星 +3% 也落账（${Math.round(c4 * 100)}%）`, String(c4));

    // 暴击率超过 60% 之后，实际暴击率也不能自己夹断（保持原逻辑）
    ok(c4 > 0.4, `四张卡堆到 ${Math.round(c4 * 100)}%（仍是「可堆、但要堆更多张」）`, String(c4));

    // ---------- 4. 商店磨剑石 ----------
    console.log('\n[4] 商店磨剑石 +3% / 18 金币');
    const item = await ev(`(() => { const i = __game.shop.items.find(x => x.id === 'grindstone');
      return { flat: i.flat, price: i.price, desc: i.desc }; })()`);
    ok(near(item.flat, 0.03), `架上 flat = ${item.flat}（旧 0.05）`, JSON.stringify(item));
    ok(item.price === 18, `价格 ${item.price}（旧 22）`, String(item.price));
    ok(/\+3%/.test(item.desc), '描述写 +3%', item.desc);

    await ev('__game.weapon.grant()');
    await sleep(300);
    const w0 = await ev('+__game.wstats.get("swordCrit").toFixed(4)');
    await ev('__game.evt({ gold: 100 })');
    await ev('__game.shop.open(9)');
    await sleep(300);
    await ev('__game.shop.buy("grindstone")');
    await sleep(300);
    const w1 = await ev('+__game.wstats.get("swordCrit").toFixed(4)');
    ok(near(w1, w0 + 0.03), `买完剑暴击 ${Math.round(w0 * 100)}% → ${Math.round(w1 * 100)}%（+3）`, JSON.stringify({ w0, w1 }));
    await ev('__game.shop.close()');
    await sleep(200);

    // ---------- 5. 面板显示 ----------
    console.log('\n[5] 属性面板上「暴击率」不再是 15% 时代的样子');
    await ev('__game.statPage.show()');
    await sleep(500);
    const panelTxt = await ev('document.getElementById("statRows").innerText');
    ok(/暴击率/.test(panelTxt), '面板里有暴击率这一行', panelTxt.replace(/\s+/g, ' ').slice(0, 120));
    // 属性页是「局外口径」的干净表（renderStatRows 用 createStats(STAT_DEFS) + camp/boon/meta），
    // 升级卡的暴击**不进这一页** —— 这里验的是「不再显示 15% 时代的值」，也就是 0%（局外没暴击加成）。
    const idx = panelTxt.indexOf('暴击率');
    const seg = panelTxt.slice(idx, idx + 36).replace(/\s+/g, ' ');
    ok(/0(\.0)?%/.test(seg), '面板暴击率是局外口径 0%（升级卡不进属性页）', seg);

    // ---------- 6. 没有 JS 报错 ----------
    console.log('\n[6] 控制台');
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
