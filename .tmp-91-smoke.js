// 第 91 块 · 冒烟：关内难度梯度（攻速 / 移速 / 后期加速）
//   ① roundScale 的曲线：R1 = 1.00，R10 ≈ 1.13，R20 ≈ 1.45，且逐回合递增
//   ② 真实刷怪：跳 R1 读一只 warrior 的 haste / speed；跳 R20 再读一次 ——
//      必须真的变快（不是只有表变了）
//   ③ 冷却真的落地：把 warrior 推到收招，读它的 attackCd，R20 明显小于 R1
//   ④ 前摇没被连累：R1 和 R20 的 e.cfg.windup 一模一样（更快 ≠ 更没法躲）
//   ⑤ 页面加载干净（版本号与 index.html 一致、无 JS 报错）
// 跑法：先起 `python -m http.server 8124`（cwd=naiwa-rouge），再 `node .tmp-91-smoke.js`
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9391;
const UD = path.join(os.tmpdir(), 'naiwa-cdp-91smoke');
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

    // ---------- 2. 成长曲线（调试口读的是一关） ----------
    console.log('\n[2] roundScale 的关内曲线（第一关）');
    const sc = await ev(`(() => {
      const out = {};
      for (const r of [1, 5, 10, 13, 15, 18, 20]) {
        const s = __game.diff.scale(r);
        out[r] = { hp: +s.hp.toFixed(3), dmg: +s.damage.toFixed(3), spd: +s.speed.toFixed(3), haste: +s.haste.toFixed(3) };
      }
      return out;
    })()`);
    console.log('     ' + JSON.stringify(sc));
    ok(Math.abs(sc[1].haste - 1) < 1e-6, 'R1 攻速 = 1.00（第一回合不加码）', String(sc[1].haste));
    ok(Math.abs(sc[20].haste - 1.45) < 0.03, 'R20 攻速 ≈ 1.45（出手间隔缩到 69%）', String(sc[20].haste));
    ok(Math.abs(sc[20].spd - 1.855) < 0.01, 'R20 移速 ×1.855（第 90 块是 ×1.665）', String(sc[20].spd));
    const seq = [1, 5, 10, 13, 15, 18, 20].map((r) => sc[r].haste);
    ok(seq.every((v, k) => k === 0 || v > seq[k - 1]), '攻速逐回合递增', seq.join(' < '));
    ok(sc[5].haste - sc[1].haste < 0.06, '前五回合几乎不变（给玩家留适应期）', (sc[5].haste - sc[1].haste).toFixed(3));
    ok(sc[20].haste - sc[15].haste > (sc[10].haste - sc[5].haste) * 2,
      '最后五回合的涨幅 > 中段五回合的 2 倍（后期加速）',
      `${(sc[10].haste - sc[5].haste).toFixed(3)} vs ${(sc[20].haste - sc[15].haste).toFixed(3)}`);
    ok(sc[20].hp > 4 && sc[20].dmg > 2.8, '血量和伤害仍是原来的线性成长（没被曲线波及）',
      `hp ×${sc[20].hp} dmg ×${sc[20].dmg}`);

    // ---------- 3. 真实刷怪：R1 vs R20 ----------
    console.log('\n[3] 真实刷怪的 haste / speed');
    await ev('__game.setAdmin(true)');
    async function grabAt(round, type, ms = 9000) {
      await ev(`__game.jumpRound(${round})`);
      const t0 = Date.now();
      while (Date.now() - t0 < ms) {
        const got = await ev(`(() => {
          const e = __game.enemies.all().find((o) => o.type === '${type}' && o.state !== 'dead' && o.state !== 'spawn');
          if (!e) return null;
          // speed 里含每只怪生成时 ±15% 的随机浮动（speedMul），会比出假差距 ——
          // 一律用 speed / speedMul 还原成「这一回合的基准速度」再比较。
          const mul = +e.speedMul || 1;
          return { haste: +(+e.haste || 0).toFixed(4), speed: +(+e.speed || 0).toFixed(3),
                   speedMul: +mul.toFixed(3), baseSpeed: +((e.speed || 0) / mul).toFixed(3),
                   windup: e.cfg.windup, interval: e.cfg.attackInterval, duration: e.cfg.attackDuration,
                   round: __game.level.roundNo };
        })()`);
        if (got) return got;
        await sleep(250);
      }
      return null;
    }

    // 战士第 3 回合才登场（R1 只有 3 只小兵）—— 拿 R3 当「早期」基准
    const w1 = await grabAt(3, 'warrior');
    ok(!!w1, 'R3 刷出了战士', JSON.stringify(w1));
    const w20 = await grabAt(20, 'warrior');
    ok(!!w20, 'R20 刷出了战士', JSON.stringify(w20));
    if (w1 && w20) {
      ok(Math.abs(w1.haste - 1.017) < 0.01, `R3 战士 haste ≈ 1.017（几乎没加码）`, String(w1.haste));
      ok(Math.abs(w20.haste - 1.45) < 0.04, `R20 战士 haste ≈ 1.45`, String(w20.haste));
      ok(w20.haste > w1.haste * 1.35, 'R20 的战士出手频率比 R3 快 35% 以上', String((w20.haste / w1.haste).toFixed(2)));
      ok(w20.baseSpeed > w1.baseSpeed * 1.6,
        `R20 的战士基准移速也更快（${w1.baseSpeed} → ${w20.baseSpeed}；已除掉 ±15% 随机浮动）`,
        `x${w1.speedMul} / x${w20.speedMul}`);
      // 前摇必须一模一样
      ok(Math.abs(w20.windup - w1.windup) < 1e-9,
        `前摇没被连累（都是 ${w1.windup} 秒）—— 更快不等于更没法躲`, `${w1.windup} vs ${w20.windup}`);
      ok(Math.abs(w20.interval - w1.interval) < 1e-9, 'cfg.attackInterval 没被改写（倍率只在实例上）',
        `${w1.interval} vs ${w20.interval}`);
    }

    // ---------- 4. 冷却真的落地 ----------
    console.log('\n[4] 收招后的 attackCd（真实写进去的值）');
    // 把战士推到收招尾声，并在**写入后的第一帧**立刻读 —— attackCd 在 chase 里
    // 每帧都在递减，晚读 200ms 就会低 0.2 秒（第一次跑就是这么误判的）。
    async function cdAt(round) {
      await ev(`__game.jumpRound(${round})`);
      const t0 = Date.now();
      while (Date.now() - t0 < 9000) {
        const got = await ev(`new Promise((res) => {
          const e = __game.enemies.all().find((o) => o.type === 'warrior' && o.state !== 'dead' && o.state !== 'spawn');
          if (!e) { res(null); return; }
          e.state = 'attack'; e.t = 999; e.hitDone = true;   // 下一帧走收招分支
          const picked = { cd0: null, haste: +(+e.haste).toFixed(4) };
          const t0 = performance.now();
          const tick = () => {
            if (e.state === 'chase' && e.attackCd != null && !Number.isNaN(e.attackCd)) {
              const ms = performance.now() - t0;
              // 读到的值已经被递减了 (ms/1000)：把它加回去，还原「刚写入」的数
              res({ cd: +(e.attackCd + Math.min(0.1, ms / 1000)).toFixed(4),
                    ms: +ms.toFixed(0), haste: picked.haste, state: e.state });
              return;
            }
            if (performance.now() - t0 > 4000) { res(null); return; }
            setTimeout(tick, 16);
          };
          setTimeout(tick, 16);
        })`);
        if (got) return got;
        await sleep(300);
      }
      return null;
    }
    // 基线用第 7 回合（前几回合清得太快，会当场弹升级/商店把世界冻住 —— R3 第一次跑就 null 在这）
    const cd7 = await cdAt(7);
    const cd20 = await cdAt(20);
    console.log('     R7 ' + JSON.stringify(cd7) + '   R20 ' + JSON.stringify(cd20));
    ok(cd7 && Math.abs(cd7.cd - 0.747) < 0.06, 'R7 战士的冷却 ≈ (1.7 − 0.9) / 1.071 ≈ 0.747 秒',
      String(cd7 && cd7.cd));
    ok(cd20 && Math.abs(cd20.cd - 0.552) < 0.06, 'R20 冷却 ≈ 0.8 / 1.45 ≈ 0.55 秒（真的变密了）',
      String(cd20 && cd20.cd));
    ok(cd7 && cd20 && cd20.cd < cd7.cd * 0.82, 'R20 的冷却明显短于 R7',
      `${cd7 && cd7.cd} → ${cd20 && cd20.cd}`);

    // 同回合对照（隔离「别的回合变量」）：同一只战士，只改 e.haste
    console.log('\n[4b] 同一只战士，只改 haste：1.00 vs 1.45');
    await ev('__game.jumpRound(7)');
    const pair = await (async () => {
      const t0 = Date.now();
      while (Date.now() - t0 < 12000) {
        const got = await ev(`new Promise((res) => {
          const e = __game.enemies.all().find((o) => o.type === 'warrior' && o.state !== 'dead' && o.state !== 'spawn');
          if (!e) { res(null); return; }
          const stage = (hv, done) => {
            e.haste = hv; e.state = 'attack'; e.t = 999; e.hitDone = true;
            const t0 = performance.now();
            const tick = () => {
              if (e.state === 'chase' && e.attackCd != null && !Number.isNaN(e.attackCd)) {
                done(+(e.attackCd + Math.min(0.1, (performance.now() - t0) / 1000)).toFixed(4));
              } else if (performance.now() - t0 > 3000) done(null);
              else setTimeout(tick, 16);
            };
            setTimeout(tick, 16);
          };
          stage(1, (a) => {
            if (a == null) { res(null); return; }
            stage(1.45, (b) => res({ base: a, fast: b }));
          });
        })`);
        if (got) return got;
        await sleep(300);
      }
      return null;
    })();
    console.log('     ' + JSON.stringify(pair));
    ok(pair && Math.abs(pair.base - 0.8) < 0.05, 'haste=1.00 时冷却 = 1.7 − 0.9 = 0.80 秒',
      String(pair && pair.base));
    ok(pair && Math.abs(pair.fast - 0.552) < 0.05, 'haste=1.45 时冷却 = 0.80 / 1.45 = 0.552 秒',
      String(pair && pair.fast));
    ok(pair && Math.abs(pair.base / pair.fast - 1.45) < 0.08, '两个冷却的比值就是 haste 本身（1.45）',
      pair ? (pair.base / pair.fast).toFixed(3) : 'null');

    // ---------- 5. 收尾 ----------
    console.log('\n[5] 页面干净度');
    ok(jsErrors.length === 0, '没有 JS 报错', jsErrors.slice(0, 3).join(' | '));

    console.log(`\n===== ${pass} 通过 / ${fail} 失败 =====`);
    if (fail) { console.log('失败项：'); for (const f of fails) console.log(' · ' + f); }
  } catch (err) {
    console.error('\n冒烟异常：', err && err.message);
    fail++;
  } finally {
    try { ws && ws.close(); } catch (_) { /* ignore */ }
    try { chrome.kill(); } catch (_) { /* ignore */ }
    await sleep(400);
    try { fs.rmSync(UD, { recursive: true, force: true }); } catch (_) { /* Chrome 还没退干净，忽略 */ }
    process.exit(fail ? 1 : 0);
  }
})();
