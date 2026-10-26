// 第 85 块 · 冒烟测试：木鱼灵的泡（体积 / 一次两颗 / 命中停环剑）
// 跑法：先起 `python -m http.server 8124`（cwd=naiwa-rouge），再 `node .tmp-85-smoke.js`
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9385;
const UD = path.join(os.tmpdir(), 'naiwa-cdp-85smoke');
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
        try { if (await ev(expr)) return true; } catch (_) {}
        await sleep(100);
      }
      throw new Error('等超时：' + why);
    }

    await send('Page.navigate', { url: URL });
    await waitFor('!!window.__game', 90000, '等到 __game 就绪');
    await sleep(600);

    // ---------- 0. 配置 ----------
    console.log('\n[0] 配置');
    const cfgR = await ev('__game.enemyTypes.woodfish.bubble.r');
    const cfgC = await ev('__game.enemyTypes.woodfish.bubble.count');
    const cfgI = await ev('__game.enemyTypes.woodfish.attackInterval');
    ok(cfgR >= 0.55, `泡半径 ${cfgR}（原来 0.42）`);
    ok(cfgC === 2, `一次吐 ${cfgC} 颗`);
    ok(cfgI <= 2.8, `吐泡间隔 ${cfgI} 秒（原来 3.4）`);
    ok(await ev('typeof __game.weapon.holdOrbit === "function"'), 'weapon 暴露 holdOrbit');

    // ---------- 1. 进第七关 ----------
    console.log('\n[1] 进第七关');
    await ev('__game.beginGame({tutorial:false})');
    await sleep(900);
    await ev('__game.setLevel(7)');
    await sleep(700);
    for (let i = 0; i < 30; i++) {
      const st = await ev('__game.state');
      if (st === 'playing') break;
      if (st === 'wtut') await ev('document.getElementById("wtSkip").click()');
      else if (st === 'hint') await ev('document.getElementById("hiOk").click()');
      else if (st === 'meet') await ev('document.getElementById("mtOk").click()');
      else if (st === 'weapon') await ev('document.getElementById("wcOk") && document.getElementById("wcOk").click()');
      await sleep(250);
    }
    ok(await ev('__game.state === "playing"'), '进入 playing', await ev('__game.state'));
    ok(await ev('__game.levelId === 7'), '当前是第七关', String(await ev('__game.levelId')));

    // 清场 + 给剑 + 玩家归位
    // 别 kill 清场：第 1 回合就这么一个回合，清空 → 直接进升级界面，世界冻结，
    // 后面的泡全都不动了（本轮踩过：木鱼灵"凭空消失"）。回满血就够了。
    await ev('__game.heal.fill()');
    await ev('__game.weapon.grant()');
    await ev('__game.warp(0, 0)');
    await sleep(200);
    ok(await ev('__game.weapon.count > 0'), '环上已经有剑', String(await ev('__game.weapon.count')));

    // ---------- 2. 环剑平时在转 ----------
    console.log('\n[2] 环剑基线：平时在转');
    const a0 = await ev('__game.weapon.orbitAngle');
    await sleep(320);
    const a1 = await ev('__game.weapon.orbitAngle');
    ok(Math.abs(a1 - a0) > 0.1, `0.32 秒里角度推进了 ${(a1 - a0).toFixed(3)} 弧度`);

    // ---------- 3. 吐泡：一次两颗、泡更大 ----------
    console.log('\n[3] 吐泡：个数 / 体积');
    await ev(`(() => {
      const H = __game;
      H.enemies.all().forEach(() => {});
      H.block63.enemies.spawn("woodfish", 0, 7.2);
      H.block63.enemies.set("woodfish", { state: "chase", t: 0, attackCd: 0.2 });
      return true;
    })()`);
    // 采样 bubbleCount，记录「从 0/空 直接跳到 2」的那一刻
    let seq = [];
    let jump2 = false;
    for (let i = 0; i < 40; i++) {
      const n = await ev('__game.enemies.bubbleCount()');
      seq.push(n);
      if (i > 0 && n === 2 && seq[i - 1] === 0) jump2 = true;
      if (jump2) break;
      await sleep(110);
    }
    ok(jump2, '一次吐泡直接从 0 变成 2（两颗同时出来）', seq.join(','));
    const b0 = await ev('__game.enemies.bubbles()');
    ok(Array.isArray(b0) && b0.length === 2, '场上正好两颗泡', JSON.stringify(b0 && b0.length));
    ok(b0[0].r >= 0.55, `泡的半径 ${b0[0].r}（视觉与判定同一个数）`);
    ok(b0[0].orbitStop === 1.2, `每颗泡带着停环剑时长 ${b0[0].orbitStop}`);
    // 两颗真的分开了（不是叠在一起）
    const gap = Math.hypot(b0[0].x - b0[1].x, b0[0].z - b0[1].z);
    ok(gap > 1.0, `两颗泡分开了 ${gap.toFixed(2)} 格（球心距 ≈ 两半径之和，不叠在一起）`, String(gap));

    // ---------- 4. 命中：定住 + 环剑停转 ----------
    console.log('\n[4] 命中：定住 + 环剑停转');
    await ev('__game.heal.fill()');   // 泡一颗 1 点伤害，别测着测着把主角打死
    await ev('__game.setIframe(0)');
    // 直接把主角挪到泡身上（泡会自己飞，等它太慢）
    const hit = await ev(`(() => {
      const b = __game.enemies.bubbles()[0];
      if (!b) return null;
      __game.warp(b.x, b.z);
      return b;
    })()`);
    ok(!!hit, '取到一颗泡并贴上去', JSON.stringify(hit));
    await waitFor('__game.rootT() > 0', 3000, '等被泡定住');
    ok(await ev('__game.rootT() > 0'), '主角被定住', String(await ev('__game.rootT()')));
    ok(await ev('__game.weapon.orbitHold > 0'), '环剑进入停转', String(await ev('__game.weapon.orbitHold')));

    // 停转期间角度一个数都不动
    const f1 = await ev('__game.weapon.orbitAngle');
    await sleep(120);
    const f2 = await ev('__game.weapon.orbitAngle');
    await sleep(120);
    const f3 = await ev('__game.weapon.orbitAngle');
    ok(f1 === f2 && f2 === f3, `停转期间角度完全冻住（${f1} / ${f2} / ${f3}）`);

    // 停转结束后自己恢复
    await waitFor('__game.weapon.orbitHold === 0', 4000, '等停转结束');
    const r1 = await ev('__game.weapon.orbitAngle');
    await sleep(320);
    const r2 = await ev('__game.weapon.orbitAngle');
    ok(Math.abs(r2 - r1) > 0.1, `停转结束后角度恢复推进（${(r2 - r1).toFixed(3)} 弧度）`);

    // ---------- 5. 无敌帧里擦过去：不停环剑 ----------
    console.log('\n[5] 无敌帧擦过去不算');
    ok(await ev('__game.state === "playing"'), '世界还在跑（没被回合结束 / 主角阵亡冻住）', await ev('__game.state'));
    await ev('__game.heal.fill()');
    // 木鱼灵这会儿可能已经退到攻击带外（玩家被 warp 到它嘴边了）——
    // 把它按回「朝场地中心 7 格」的攻击带上，并把冷却清掉，别干等 8 秒。
    await ev(`(() => {
      const p = __game.pos();
      const d = Math.hypot(p.x, p.z);
      const ux = d > 1 ? -p.x / d : 0;
      const uz = d > 1 ? -p.z / d : 1;
      // 上一段那只多半已经被环剑顺手砍掉了（玩家 warp 到泡身上时离木鱼灵只有 2 格多，
      // 3 把剑绕一圈就没了）—— 这里干脆补一只新的，别指望它活着。
      if (!__game.block63.enemies.list().some((e) => e.type === "woodfish" && e.state !== "dead")) {
        __game.block63.enemies.spawn("woodfish", p.x + ux * 7, p.z + uz * 7);
      }
      __game.block63.enemies.place("woodfish", p.x + ux * 7, p.z + uz * 7);
      __game.block63.enemies.set("woodfish", { state: "chase", t: 0, attackCd: 0.05 });
      return true;
    })()`);
    const aliveWf = await ev('__game.block63.enemies.list().filter(e => e.type === "woodfish" && e.state !== "dead").length');
    ok(aliveWf >= 1, `木鱼灵还在场上（${aliveWf} 只，没被打死）`);
    await waitFor('__game.enemies.bubbleCount() > 0', 12000, '等下一波泡');
    // 等上一轮停转彻底走完（这里要验的是「没被触发」，不是「被压住」）
    await waitFor('__game.weapon.orbitHold === 0', 4000, '等上一轮停转彻底结束');
    const b4 = await ev('__game.weapon.holdOrbit(0)');
    ok(b4 === 0, 'holdOrbit(0) 什么都不设');
    await ev('__game.setIframe(3)');
    const beforeHold = await ev('__game.weapon.orbitHold');
    await ev(`(() => { const b = __game.enemies.bubbles()[0]; if (b) __game.warp(b.x, b.z); return true; })()`);
    await sleep(600);
    const afterHold = await ev('__game.weapon.orbitHold');
    ok(beforeHold === 0 && afterHold === 0, `无敌帧里被泡擦过去不会停环剑（${beforeHold} → ${afterHold}）`);
    ok(await ev('__game.rootT() === 0'), '无敌帧里也不会被定住', String(await ev('__game.rootT()')));
    await ev('__game.setIframe(0)');

    // ---------- 6. 同场上限 ----------
    console.log('\n[6] 泡的同场上限');
    const cap = await ev('__game.enemyTypes.woodfish.bubble.max');
    ok(cap >= 6 && cap <= 12, `上限 ${cap} 颗`, String(cap));
    // 五只木鱼灵一起吐，泡不该无限堆
    await ev(`(() => {
      for (let i = 0; i < 5; i++) {
        const a = i * 1.2;
        __game.block63.enemies.spawn("woodfish", Math.sin(a) * 7, Math.cos(a) * 7);
      }
      for (let i = 0; i < 6; i++) __game.block63.enemies.set("woodfish", { state: "chase", t: 0, attackCd: 0.2 });
      return true;
    })()`);
    let peak = 0;
    // 瞬移点绕圈子（半径 2）—— 木鱼灵 spawn 在半径 7 的圈上，这样它们一直待在
    // 「keepDistance 5 ~ attackRange 8」这条攻击带里；太远会变成「挪进来」不吐泡
    // （attackRange 8），太近又会后退，都一样堆不上去。
    const spots = [[2, 0], [0, 2], [-2, 0], [0, -2]];
    for (let i = 0; i < 70; i++) {
      const s = spots[i % spots.length];
      await ev(`__game.warp(${s[0]}, ${s[1]})`);
      if (i % 6 === 0) await ev('__game.heal.fill()');   // 别让主角被泡打死（死了世界就冻住）
      const n = await ev('__game.enemies.bubbleCount()');
      peak = Math.max(peak, n || 0);
      if (peak >= cap) break;
      await sleep(160);
    }
    ok(peak <= cap, `峰值 ${peak} 颗 ≤ 上限 ${cap}`, String(peak));
    ok(peak >= cap, `确实堆到了上限（峰值 ${peak}），不是没在吐`, String(peak));
    // 收尾：别让这些泡把页面拖到下一段
    await ev('__game.block63.enemies.kill()');
    await sleep(300);

    // ---------- 7. 无 JS 报错 ----------
    console.log('\n[7] 控制台');
    const realErr = jsErrors.filter((e) => !/favicon|404|Failed to load resource/i.test(e));
    ok(realErr.length === 0, '没有 JS 运行时错误', realErr.slice(0, 3).join(' | '));

  } catch (e) {
    fail++;
    fails.push('脚本异常：' + e.message);
    console.log('\n脚本异常：' + e.message);
  } finally {
    try { if (ws) ws.close(); } catch (_) {}
    try { chrome.kill(); } catch (_) {}
  }

  console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
  if (fail) { console.log('\n失败项：'); for (const f of fails) console.log('  - ' + f); process.exit(1); }
})();
