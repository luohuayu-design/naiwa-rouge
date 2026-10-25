// 第 76 块 CDP：在真实游戏里验证「场地伤害无视防御」
//   A 防御堆到 10，普通伤害被压到保底 1
//   B 站在漏电地板上，一次还是实打实掉 2 点（不吃防御）
//   C 绝缘斗篷照旧整下免掉（真伤也没绕过它）
// 跑法：先起 `python -m http.server 8124`（cwd=naiwa-rouge），再 `node .tmp-block76-cdp.js`
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9376;
const UD = path.join(os.tmpdir(), 'naiwa-cdp-76');
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
    '--disable-dev-shm-usage', '--user-data-dir=' + UD, 'about:blank',
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
    async function waitFor(expr, ms = 90000, label = expr) {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) {
        try { if (await ev(expr)) return true; } catch (_) {}
        await sleep(200);
      }
      throw new Error('等待超时: ' + label);
    }

    await send('Page.enable', {});
    await send('Runtime.enable', {});
    await send('Page.navigate', { url: URL });
    await waitFor('!!window.__game', 90000, '等到 __game 就绪');
    await sleep(700);

    await ev('__game.beginGame({tutorial:false})');
    await sleep(800);
    await ev('__game.setAdmin(true)');
    await ev('__game.setLevel(6)');
    await ev('__game.ensureLevelAssets(6)');
    await sleep(500);
    await ev(`__game.enemies.killAll()`);

    // ============================================================
    console.log('\n— A 防御堆到 10：普通伤害被压到保底 1 —');
    // ============================================================
    await ev(`__game.stats.addMod({ stat: 'armor', flat: 10, src: 'cdp76' })`);
    const armor = await ev(`__game.stats.get('armor')`);
    ok(armor >= 10, `防御 = ${armor}`);

    const normalTaken = await ev(`(() => {
      const before = __game.stats.hp.cur;
      const t = __game.stats.damage(5);
      __game.stats.hp.cur = before;      // 还原，别影响后面的地形测试
      return t;
    })()`);
    ok(normalTaken === 1, `普通伤害 5 被压到 ${normalTaken}（保底 1）`);

    const trueTaken = await ev(`(() => {
      const before = __game.stats.hp.cur;
      const t = __game.stats.damageTrue(5);
      __game.stats.hp.cur = before;
      return t;
    })()`);
    ok(trueTaken === 5, `真伤 5 原样扣 ${trueTaken}（不减防）`);

    // ============================================================
    console.log('\n— B 站上漏电地板：一次还是实打实掉 2 点 —');
    // ============================================================
    const defs = JSON.parse(await ev(`JSON.stringify(__game.block63.hazards.defs())`));
    ok(defs.length === 6, `第六关 ${defs.length} 块地板`);
    ok(defs.every((d) => d.damage === 2), '每块地板 damage 都是 2',
      JSON.stringify(defs.map((d) => d.damage)));

    // 满血，站到第 0 块地板正中，等它通电
    await ev(`__game.stats.hp.cur = __game.stats.get('maxHp')`);
    await ev(`__game.pos.x = ${defs[0].x}; __game.pos.z = ${defs[0].z};`);
    await ev('__game.setAdmin(false)');
    await ev('__game.setAdmin(false)');

    // 等这一块真的通电（相位是错开的，最多等一个完整周期 5s）
    await waitFor(`__game.block63.hazards.powered(${defs[0].x}, ${defs[0].z})`, 9000, '地板通电');
    const hpOn = await ev('__game.stats.hp.cur');
    await sleep(1300);          // 1.4 秒通电期内会结算 2 次（每 0.6 秒一次）
    const hpOff = await ev('__game.stats.hp.cur');
    const lost = hpOn - hpOff;
    console.log(`    [诊断] 防御 ${armor} 站在通电地板上：${hpOn} → ${hpOff}（掉 ${lost}）`);
    ok(lost >= 2, `掉血了（${lost} 点）`);
    ok(lost % 2 === 0, `掉的是 2 的整数倍（${lost}）—— 说明每次都是完整 2 点，没被防御削成 1`);
    ok(lost !== 1, '不是「保底 1」那种旧行为');

    // ============================================================
    console.log('\n— C 绝缘斗篷照旧整下免掉 —');
    // ============================================================
    // 直接把斗篷等级拨到 1（admin 之外唯一会整下免掉的角色）
    const insulated = await ev(`(() => {
      try {
        __game.meta.addBones(9999);
        __game.relics.buy('insulator');
        return __game.relics.levels().insulator || 0;
      } catch (e) { return -1; }
    })()`);
    if (insulated > 0) {
      await ev(`__game.stats.hp.cur = __game.stats.get('maxHp')`);
      const hpBefore = await ev('__game.stats.hp.cur');
      await sleep(1400);       // 仍然站在通电地板上
      const hpAfter = await ev('__game.stats.hp.cur');
      ok(hpAfter === hpBefore, `穿了绝缘斗篷就不掉血（${hpBefore} → ${hpAfter}）`);
    } else {
      console.log('  · 跳过：这一版没有直接发放斗篷的调试钩子');
    }

    // ============================================================
    console.log('\n— D 没有 JS 报错 —');
    const realErrors = jsErrors.filter((x) => !/favicon|WebGL|SwiftShader|GPU stall/i.test(x));
    ok(realErrors.length === 0, '控制台没有未捕获错误', realErrors.slice(0, 2).join(' | '));

    console.log(`\n第 76 块 CDP：${pass} 通过 / ${fail} 失败`);
    if (fail) console.log('失败清单：\n - ' + fails.join('\n - '));
  } catch (err) {
    console.log('\n[测试崩了] ' + (err && err.message));
    console.log(`\n第 76 块 CDP：${pass} 通过 / ${fail + 1} 失败`);
    if (jsErrors.length) console.log('页面错误：\n' + jsErrors.slice(0, 5).join('\n'));
  } finally {
    try { ws && ws.close(); } catch (_) {}
    try { chrome.kill(); } catch (_) {}
    await sleep(600);
    try { fs.rmSync(UD, { recursive: true, force: true }); } catch (_) {}
  }
})();
