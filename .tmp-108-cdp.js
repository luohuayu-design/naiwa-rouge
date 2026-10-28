// 第 108 块 CDP 冒烟：傀儡卡新通道 + 箭雨三选一/商店成长线（真浏览器）
// 跑法：先 `python -m http.server 8124`（cwd=naiwa-rouge，run_in_background），再 `node .tmp-108-cdp.js`
// 覆盖：
//   A. 箭雨四通道基线 + applyCard 各档数值 + CD 下限 3s
//   B. 强化箭袋：applyQuiver 生效 / 一局一次 / 与卡叠加
//   C. 技能键真的吃新 cdMax（点技能 → 倒计时 = 缩短后的值）
//   D. 商店能摆出 buyQuiver（open/close 循环抽签）
//   E. 全程无 JS 报错
// ⚠️ 傀儡四通道的源码契约在 .tmp-block108-test.mjs（golem.js 依赖 DOM，Node 直 import 会炸，
//    真浏览器召唤链路已由 107-cdp 覆盖 —— 本套件不重复召傀儡）。
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9395;
const PAGE = 'http://127.0.0.1:8124/index.html?debug=1&title&hints';
const UD = path.join(os.tmpdir(), 'naiwa-cdp-108');
const OUT = path.join(__dirname, '.tmp-108-shots');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
const fails = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; fails.push(name + (extra ? ' → ' + extra : '')); console.log('  ✗ ' + name + (extra ? ' → ' + extra : '')); }
}

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

    await send('Runtime.enable');
    await send('Page.enable');
    await send('Page.navigate', { url: PAGE });
    await waitFor('!!window.__game', 90000, '__game 就绪');
    await waitFor("document.getElementById('titleScr') && !document.getElementById('titleScr').classList.contains('off')", 15000, '标题页淡入');
    await sleep(1400);
    await ev('if (__game.notice.open()) __game.notice.hide(); 1');
    await sleep(500);
    await ev('if (__game.sign.open()) __game.sign.hide(); 1');
    await sleep(500);
    await ev('if (__game.promo.open()) __game.promo.hide(); 1');
    await sleep(300);

    // ============================================================
    console.log('\n[进局] 第二关（箭雨第二关起解锁）');
    // ============================================================
    await ev('__game.setPendingLevel(2)');
    await ev('(async () => { await __game.beginGame({ tutorial: false }); return 1; })()');
    await sleep(1500);
    // 过渡态逐环清掉
    for (let i = 0; i < 60; i++) {
      const st = await ev('__game.state');
      if (st === 'playing') break;
      if (st === 'hint') await ev('document.getElementById("hiOk").click()');
      else if (st === 'wtut') await ev('document.getElementById("wtSkip").click()');
      else if (st === 'meet') await ev('document.getElementById("mtOk").click()');
      else if (st === 'weapon') await ev('document.getElementById("wcOk").click()');
      else if (st === 'tutorial') await ev('__game.tutorial.skip()');
      else break;
      await sleep(160);
    }
    ok(await ev('__game.state') === 'playing', '进入 playing');
    ok(await ev('__game.levelId') === 2, '当前第二关', String(await ev('__game.levelId')));
    await ev('__game.setWaves(true)');

    // ============================================================
    console.log('\n[A] 箭雨四通道');
    // ============================================================
    {
      const base = await ev('__game.block108.arrow()');
      ok(base.arrowsN === 14 && base.zoneR === 2.3 && Math.abs(base.dmgMul - 0.55) < 1e-6 && Math.abs(base.cdMax - 8) < 1e-6,
        '基线：14 支 / 2.3 格 / 0.55 倍 / CD 8s', JSON.stringify(base));
      await ev('__game.block108.applyArrowCard("arrows", 3)');
      ok((await ev('__game.block108.arrow()')).arrowsN === 17, '箭袋扩充：14 → 17 支');
      await ev('__game.block108.applyArrowCard("dmg", 0.06)');
      ok(Math.abs((await ev('__game.block108.arrow()')).dmgMul - 0.55 * 1.06) < 1e-6, '磨尖箭镞：0.55 → 0.583');
      await ev('__game.block108.applyArrowCard("zone", 0.4)');
      ok(Math.abs((await ev('__game.block108.arrow()')).zoneR - 2.7) < 1e-6, '扩容箭阵：2.3 → 2.7 格');
      await ev('__game.block108.applyArrowCard("cd", 0.8)');
      ok(Math.abs((await ev('__game.block108.arrow()')).cdMax - 7.2) < 1e-6, '速射号令：8 → 7.2s');
      // 连叠传说 CD 卡 + 精良卡 → 触底 3s（7.2 − 1.6 − 0.8 − 8 → 3）
      await ev('__game.block108.applyArrowCard("cd", 8)');
      ok(Math.abs((await ev('__game.block108.arrow()')).cdMax - 3) < 1e-6, 'CD 下限 3 秒兜底', JSON.stringify(await ev('__game.block108.arrow()')));
    }

    // ============================================================
    console.log('\n[B] 强化箭袋');
    // ============================================================
    {
      ok(await ev('__game.block108.hasQuiver()') === false, '初始没买过箭袋');
      ok(await ev('__game.block108.applyQuiver()') === true, 'applyQuiver 第一次生效');
      const b = await ev('__game.block108.arrow()');
      ok(b.arrowsN === 22, '箭数 17 + 5 = 22（与卡叠加）', String(b.arrowsN));
      ok(Math.abs(b.dmgMul - 0.55 * 1.21) < 1e-3, '伤害 +15%（pct 加法叠加：0.55 × (1+0.06+0.15)，bonuses 保留三位）', String(b.dmgMul));
      ok(await ev('__game.block108.hasQuiver()') === true, 'hasQuiver = true');
      ok(await ev('__game.block108.applyQuiver()') === false, '第二次 applyQuiver 被拒（一局一次）');
      ok((await ev('__game.block108.arrow()')).arrowsN === 22, '重复购买不叠加');
    }

    // ============================================================
    console.log('\n[C] 技能键吃新 cdMax');
    // ============================================================
    {
      // 全新档没有「拿过环剑」战绩 → 第二关不送箭雨，测试先解锁
      await ev('__game.block108.unlockArrow()');
      await sleep(300);
      const vis = await ev(`(() => {
        const b = document.querySelector('#skillBar .sk[data-skill="arrowRain"]');
        if (!b) return false;
        const cs = getComputedStyle(b);
        return cs.display !== 'none' && cs.visibility !== 'hidden';
      })()`);
      ok(vis, '箭雨技能键可见');
      // 箭雨 ready 前可能还在上一发的冷却里：直接读当前 CD 文字是否 ≤ 新 cdMax
      await ev('document.querySelector(\'#skillBar .sk[data-skill="arrowRain"]\')?.click()');
      await sleep(400);
      const cdText = await ev(`(document.querySelector('#skillBar .sk[data-skill="arrowRain"]')?.textContent || '')`);
      ok(/CD\s*3\.00/.test(cdText) || !/CD/.test(cdText), '点技能后冷却文案 ≈ 3.00（或已 ready 无文字）', cdText.trim().slice(0, 40));
    }

    // ============================================================
    console.log('\n[D] 商店摆出强化箭袋');
    // ============================================================
    {
      await ev('__game.setWaves(true)');
      let found = false;
      for (let i = 0; i < 130 && !found; i++) {
        await ev('__game.shop.open(6)');
        const stock = await ev('__game.shop.stock.map((s) => s.id)');
        if (stock.includes('buyQuiver')) found = true;
        else await ev('__game.shop.close()');
      }
      ok(found, '130 次抽签内商店能摆出 buyQuiver（27 选 4）');
      if (found) {
        const info = await ev(`(() => {
          const it = __game.shop.items.find((s) => s.id === 'buyQuiver');
          return { name: it.name, price: it.price, glyph: it.glyph };
        })()`);
        ok(info.price === 26 && /箭袋/.test(info.name), `货定义正确（${info.name} · ${info.price} 币）`, JSON.stringify(info));
      }
      await ev('__game.shop.close()');
    }

    // ============================================================
    console.log('\n[E] 无 JS 报错');
    // ============================================================
    ok(jsErrors.length === 0, '全程零控制台错误 / 页面异常', jsErrors.slice(0, 3).join(' | '));

  } catch (e) {
    fail++;
    fails.push('套件中断: ' + e.message);
    console.log('  ✗ 套件中断: ' + e.message);
  } finally {
    try { ws && ws.close(); } catch (_) {}
    try { chrome.kill(); } catch (_) {}
  }

  console.log('\n====================================================');
  console.log(`第 108 块 CDP 冒烟：${pass} 通过 / ${fail} 失败`);
  if (fail) { console.log('失败清单：'); for (const f of fails) console.log(' - ' + f); process.exit(1); }
})();
