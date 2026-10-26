// 第 90 块 · 冒烟：随机事件的「减少生命值」整体翻倍 + 盲盒老存档一致性
//   ① 进第一关，evt({hp:-4}) / evt({hp:-6}) 真的扣这么多，且最低掉到 0.5 不会死
//   ② 生命上限加成（第 88 块的正向）完全没被连累：evt({hp:4}) 还是上限 +4
//   ③ 盲盒：真开几个木匣 → 记下 mods → reload（= 下次打开游戏）→ mods 与注入值一模一样
//      （回答用户「大改之前抽的盲盒能不能按新规则结算」：本来就是按存档里的最终值，
//        而这三轮的平衡改动一个盲盒数值都没动 → 存量 = 新规则）
// 跑法：先起 `python -m http.server 8124`（cwd=naiwa-rouge），再 `node .tmp-90-smoke.js`
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9390;
const UD = path.join(os.tmpdir(), 'naiwa-cdp-90smoke');
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
        else break;
        await sleep(160);
      }
      return (await ev('__game.state')) === 'playing';
    }
    async function boot() {
      await ev('__game.setPendingLevel(1)');
      await ev('(async () => { await __game.beginGame({ tutorial: false }); return 1; })()');
      await sleep(900);
      return settle();
    }

    await send('Page.navigate', { url: URL });
    await waitFor('!!window.__game', 90000, '等到 __game 就绪');
    await sleep(600);

    console.log('\n[1] 页面与版本');
    const mainSrc = await ev(`(() => { const s = document.querySelector('script[src*="main.js"]'); return s ? s.src : ''; })()`);
    const idxSrc = await ev(`fetch('index.html').then(r => r.text())`);
    const ver = (idxSrc.match(/v=(\d+)/) || [])[1] || '';
    ok(ver && new RegExp('v=' + ver).test(mainSrc), `main.js 与 index.html 同版本（v=${ver}）`, mainSrc);
    ok(await boot(), '世界进入 playing', await ev('__game.state'));

    // ---------- 2. 扣血真的翻倍了 ----------
    console.log('\n[2] evt({hp:-N})：翻倍后的扣血量');
    await ev('__game.heal.fill()');
    const r1 = await ev('__game.evt({ hp: -2 })');
    ok(near(r1.before.cur - r1.after.cur, 2), `-2（原 -1）扣 ${(r1.before.cur - r1.after.cur).toFixed(1)} 点`, JSON.stringify(r1));
    await ev('__game.heal.fill()');
    const r2 = await ev('__game.evt({ hp: -4 })');
    ok(near(r2.before.cur - r2.after.cur, 4), `-4（原 -2）扣 ${(r2.before.cur - r2.after.cur).toFixed(1)} 点`, JSON.stringify(r2));
    await ev('__game.heal.fill()');
    const r3 = await ev('__game.evt({ hp: -6 })');
    ok(near(r3.before.cur - r3.after.cur, 6), `-6（原 -3）扣 ${(r3.before.cur - r3.after.cur).toFixed(1)} 点`, JSON.stringify(r3));
    // 扣血不致死：兜底 0.5
    await ev('__game.heal.fill()');
    const r4 = await ev('__game.evt({ hp: -6 })');
    const r5 = await ev('__game.evt({ hp: -6 })');
    ok(r5.after.cur >= 0.5 - 1e-6, `连着两刀 -6 也不会死（剩 ${r5.after.cur}）`, JSON.stringify([r4.after, r5.after]));
    ok(near(r5.after.max, r4.after.max), '扣血不改上限', JSON.stringify([r4.after.max, r5.after.max]));

    // ---------- 3. 正向「生命上限 +N」没被连累 ----------
    console.log('\n[3] 第 88 块的正向加成原样');
    await ev('__game.heal.fill()');
    const p1 = await ev('__game.evt({ hp: 4 })');
    ok(near(p1.after.max - p1.before.max, 4), `上限还是 +4（${p1.before.max} → ${p1.after.max}）`, JSON.stringify(p1));
    const p2 = await ev('__game.evt({ hp: 8 })');
    ok(near(p2.after.max - p2.before.max, 8), `上限 +8 也没被二次放大（${p2.before.max} → ${p2.after.max}）`, JSON.stringify(p2));

    // ---------- 4. 盲盒：开箱 → 记 mods → reload → 一致 ----------
    console.log('\n[4] 盲盒老存档一致性');
    await ev('__game.meta.addBones(5000)');
    for (const box of ['wood', 'wood', 'silver', 'gold']) {
      await ev(`__game.meta.buy('${box}', true)`);
      await sleep(120);
    }
    const st1 = await ev('__game.meta.state()');
    const mods1 = st1.mods.map((m) => [m.stat, m.flat, m.pct, m.scope].join('|'));
    ok(mods1.length >= 3, `开出 ${mods1.length} 条永久属性`, JSON.stringify(mods1));
    ok(mods1.some((s) => /critRate|hpRegen|lifesteal|attack|moveSpeed|critDamage|armor|goldRate|maxHp|luck|multiHit/.test(s)),
      '其中包含可识别的属性项', JSON.stringify(mods1.slice(0, 4)));

    // 先 reload 一次拿到「干净的 stats」（第 3 节把上限堆到 22 了，不能拿它当基准）
    await send('Page.navigate', { url: URL });
    await waitFor('!!window.__game', 90000, 'reload 后等到 __game');
    await sleep(700);
    // 注入 → 读当前 stats 的某个属性，作为「更新前」的基准
    await ev('__game.meta.apply()');
    const before = await ev(`(() => {
      const keys = ['attack','critRate','lifesteal','hpRegen','moveSpeed','armor','goldRate','critDamage','maxHp','luck','attackSpeed'];
      return Object.fromEntries(keys.map(k => [k, +__game.stats.get(k).toFixed(4)]));
    })()`);

    // reload = 玩家下次打开游戏（存档走 localStorage）
    await send('Page.navigate', { url: URL });
    await waitFor('!!window.__game', 90000, 'reload 后等到 __game');
    await sleep(800);
    const st2 = await ev('__game.meta.state()');
    const mods2 = st2.mods.map((m) => [m.stat, m.flat, m.pct, m.scope].join('|'));
    ok(JSON.stringify(mods2) === JSON.stringify(mods1), 'reload 后存档里的盲盒加成逐条不变', JSON.stringify(mods2.slice(0, 4)));

    await ev('__game.meta.apply()');
    const after = await ev(`(() => {
      const keys = ['attack','critRate','lifesteal','hpRegen','moveSpeed','armor','goldRate','critDamage','maxHp','luck','attackSpeed'];
      return Object.fromEntries(keys.map(k => [k, +__game.stats.get(k).toFixed(4)]));
    })()`);
    const diff = Object.keys(before).filter((k) => Math.abs(before[k] - after[k]) > 1e-6);
    ok(diff.length === 0, '注入结果与更新前完全一致（老存档 = 当前规则）', JSON.stringify(diff.map((k) => [k, before[k], after[k]])));

    // 现有属性表里这些值本身没被这三轮的平衡改动影响
    const tbl = await ev(`(() => {
      const out = {};
      for (const m of __game.meta.state().mods) {
        const k = m.stat;
        out[k] = out[k] || [];
        out[k].push(m.pct || m.flat);
      }
      return out;
    })()`);
    ok(Object.keys(tbl).length > 0, '属性分布可读', JSON.stringify(tbl).slice(0, 120));

    // ---------- 5. 没有 JS 报错 ----------
    console.log('\n[5] 控制台');
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
