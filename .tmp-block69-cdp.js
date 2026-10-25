// ============================================================
// 第 69 块 CDP：擦名者的三处改动（运行时行为）
//   A 起手距离：放在 8.2 格不会立刻读条，走到 7 格内才起手
//   B 读条速度：从进入 attack 到偷到剑 ≈ 4.5 秒
//   C 偷完僵住：得手后 1.4 秒内基本不动，之后才开跑
//   D 逃跑速度：跑起来约 2.15 格/秒（和原来相当，仍追得上）
//   E 全程 0 JS 报错 + 截图
//
// 跑法：先 `python -m http.server 8124`（cwd=naiwa-rouge），再 `node .tmp-block69-cdp.js`
//
// ⚠️ 玩家不动是关键：环剑判定圈 ~2.3 格，只有把它放在 7 格外才不会被打死。
// ⚠️ 需要先 grantRing（第一关开局不一定有剑，没剑它偷不到东西）。
// ============================================================
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9384;
const UD = path.join(os.tmpdir(), 'naiwa-cdp-69-' + process.pid);
const OUT = path.join(os.tmpdir(), 'naiwa-block69');
const URL = 'http://127.0.0.1:8124/index.html?debug=1';

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
    async function waitFor(expr, ms = 30000, label = expr, step = 100) {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) {
        try { if (await ev(expr)) return true; } catch (_) {}
        await sleep(step);
      }
      throw new Error('等待超时: ' + label);
    }
    async function shot(name) {
      const r = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(OUT, name), Buffer.from(r.data, 'base64'));
    }
    const where = () => ev(`JSON.stringify((() => {
      const e = window.__er, p = __game.pos;
      return e ? { state: e.state, dist: +Math.hypot(e.pos.x - p.x, e.pos.z - p.z).toFixed(2) } : null;
    })())`).then(JSON.parse);

    await send('Runtime.enable');
    await send('Page.enable');
    await send('Page.navigate', { url: URL });
    await waitFor('!!window.__game', 120000, '__game 就绪');
    await sleep(1200);
    await ev(`['noticeOv','promoOv','signOv','packGet','tutCard','hintCard','upgOv','shopOv','eventOv'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) { el.classList.remove('on'); el.setAttribute('aria-hidden', 'true'); }
    }); 1`);
    await waitFor("__game.state === 'playing'", 30000, '进入对局');
    // 停刷怪 + 清场；环上先塞两把剑（不然它偷不到东西）
    await ev('__game.setWaves(true), 1');
    await ev('__game.enemies.killAll(), 1');
    await ev('__game.block64.grantRing(), 1');
    await ev('__game.block64.grantRing(), 1');
    await sleep(500);
    const ringN = await ev('__game.weapon.owned.length');
    ok(ringN >= 2, '环上至少有 2 把剑（有东西可偷）', String(ringN));

    // ============================================================
    console.log('\n[A] 只在玩家看得见的地方起手');
    // ============================================================
    // 实测（.tmp-probe-view.js）：竖屏横向只有约 4 格在画面里，纵向上面能看到 15 格。
    // 所以「横向 8 格」= 屏幕外（不该起手，要一直走到画面里），
    // 「纵向上方 8 格」= 看得见（走到 7 格起手距离就该起手）。
    const put = `(() => {
      const p = __game.pos;
      const e = __game.block63.put('eraser', p.x + 8.2, p.z);
      if (!e) return null;
      e.attackCd = 0;
      window.__er = e;
      return { range: e.cfg.attackRange, keep: e.cfg.keepDistance, speed: e.cfg.speed };
    })()`;
    const putInfo = await ev(put);
    ok(!!putInfo, '擦名者已放到右侧 8.2 格', JSON.stringify(putInfo));
    ok(await ev("window.__er.state !== 'attack'"), '刚放下时没有立刻读条');
    const live0 = JSON.parse(await ev('JSON.stringify(__game.block69.live()[0])'));
    ok(live0 && live0.onScreen === false, '右侧 8.2 格确实在画面外（onScreen=false）', JSON.stringify(live0));

    // 等它自己走进「画面里 + 7 格内」
    let onset = null;
    const tA = Date.now();
    while (Date.now() - tA < 30000) {
      const w = JSON.parse(await ev('JSON.stringify(__game.block69.live()[0] || null)'));
      if (w && w.state === 'attack') { onset = w; break; }
      await sleep(100);
    }
    ok(!!onset, '它走到了「看得见」的位置并开始读条');
    if (onset) {
      ok(onset.onScreen === true, '起手那一刻它确实在画面里（onScreen=true）', JSON.stringify(onset));
      ok(onset.dist <= 7.15, `起手距离 ${onset.dist} 格，在 7 格上限之内`, String(onset.dist));
      ok(onset.dist < 5.0, `横向是走近到画面内才起手（${onset.dist} 格 < 5），不是站在 7 格偷偷读`, String(onset.dist));
    }
    await sleep(700);
    // 第一次看到它读条会弹「讲解卡」（第 65 块），世界是暂停的 ——
    // 不关掉的话 e.t 永远停在 0，后面等偷剑一定超时。
    const hintShown = await ev('__game.block65.hint.open()');
    if (hintShown) {
      const htxt = await ev('JSON.stringify(__game.block65.hint.text())');
      ok(/4\.5/.test(htxt), '首次读条讲解卡写的是 4.5 秒', htxt.slice(0, 80));
      await shot('hint.png');
      await ev('__game.block65.hint.close(), 1');
      await sleep(200);
    } else {
      ok(true, '讲解卡已经看过（不重复弹）');
    }
    await sleep(400);
    await shot('cast.png');

    // ============================================================
    console.log('\n[B] 读条速度：进入 attack 到偷到剑 ≈ 4.5 秒');
    // ============================================================
    const t0 = Date.now();
    try {
      await waitFor('__game.block63.stolen() >= 1', 12000, '偷到剑');
    } catch (err) {
      const diag = await ev(`JSON.stringify({
        state: window.__er && window.__er.state,
        t: window.__er && +window.__er.t.toFixed(2),
        windup: window.__er && window.__er.cfg.windup,
        dur: window.__er && window.__er.cfg.attackDuration,
        cd: window.__er && +window.__er.attackCd.toFixed(2),
        stolen: __game.block63.stolen(),
        owned: __game.weapon.owned.length,
        granted: __game.weapon.granted,
        gs: __game.state,
        round: __game.block63 && __game.stats && 'n/a',
      })`);
      throw new Error('偷到剑超时：' + diag);
    }
    const castMs = Date.now() - t0;
    ok(castMs > 3500 && castMs < 5400,
      `读条耗时 ${(castMs / 1000).toFixed(2)} 秒（原 2.6，现在约 4.5）`, String(castMs));
    ok(await ev("window.__er.state") === 'flee', '得手后进入 flee', await ev("window.__er.state"));

    // ============================================================
    console.log('\n[C] 偷完先愣 1.4 秒才开跑');
    // ============================================================
    const p0 = JSON.parse(await ev("JSON.stringify({x: window.__er.pos.x, z: window.__er.pos.z})"));
    await sleep(700);
    const p1 = JSON.parse(await ev("JSON.stringify({x: window.__er.pos.x, z: window.__er.pos.z})"));
    const d1 = Math.hypot(p1.x - p0.x, p1.z - p0.z);
    ok(d1 < 0.2, `得手后 0.7 秒内几乎没动（位移 ${d1.toFixed(2)} 格）`, d1.toFixed(3));
    await shot('stunned.png');
    // ⚠️ 上面那只在 hold 结束前就跑出界被回收了（第一关场地不大），
    // 所以「愣完会开跑」改用一只干净的：放身边 4 格、手动进 flee、fleeT=0，
    // 前 0.6 秒应该纹丝不动，之后才跑起来。
    await ev('__game.enemies.killAll(), 1');
    await sleep(400);
    await ev(`(() => {
      const p = __game.pos;
      const e = __game.block63.put('eraser', p.x + 4.0, p.z);
      if (e) { e.state = 'flee'; e.fleeT = 0; e.stolen = 'iron'; window.__eh = e; }
      return 1;
    })()`);
    await sleep(250);   // 等它出生（spawnTime 1s 里第一帧先摆好位置）
    const h0 = JSON.parse(await ev("JSON.stringify({x: window.__eh.pos.x, z: window.__eh.pos.z})"));
    await sleep(600);
    const h1 = JSON.parse(await ev("JSON.stringify({x: window.__eh.pos.x, z: window.__eh.pos.z})"));
    const dh1 = Math.hypot(h1.x - h0.x, h1.z - h0.z);
    ok(dh1 < 0.2, `僵住期（前 0.85 秒）它没挪窝（位移 ${dh1.toFixed(2)} 格）`, dh1.toFixed(3));
    await sleep(1300);   // 累计 ~2.15 秒 > hold 1.4
    const h2 = JSON.parse(await ev("JSON.stringify({x: window.__eh.pos.x, z: window.__eh.pos.z})"));
    const dh2 = Math.hypot(h2.x - h1.x, h2.z - h1.z);
    ok(dh2 > 0.5, `愣完之后跑起来了（之后 1.3 秒位移 ${dh2.toFixed(2)} 格）`, dh2.toFixed(3));

    // ============================================================
    console.log('\n[D] 逃跑速度 ≈ 2.15 格/秒（和原来一样快）');
    // ============================================================
    // ⚠️ 第一关场地不大，第一只偷完跑出去就消失了（量到 0 位移）——
    // 所以重新造一只、手动进 flee 并跳过僵住，在场地中间量 0.6 秒。
    await ev('__game.enemies.killAll(), 1');
    await sleep(400);
    await ev(`(() => {
      const p = __game.pos;
      const e = __game.block63.put('eraser', p.x + 3.5, p.z);
      if (e) { e.state = 'flee'; e.fleeT = 5; e.stolen = 'iron'; window.__er3 = e; }
      return 1;
    })()`);
    await sleep(300);
    const v0 = JSON.parse(await ev("JSON.stringify({x: window.__er3.pos.x, z: window.__er3.pos.z, t: performance.now()})"));
    await sleep(600);
    const v1 = JSON.parse(await ev("JSON.stringify({x: window.__er3.pos.x, z: window.__er3.pos.z, t: performance.now()})"));
    const sp = Math.hypot(v1.x - v0.x, v1.z - v0.z) / ((v1.t - v0.t) / 1000);
    ok(sp > 1.6 && sp < 2.8, `逃跑实测 ${sp.toFixed(2)} 格/秒（1.6~2.8 之间）`, sp.toFixed(2));
    ok(sp < 4.4, '仍慢于玩家 4.4，追得上');
    await ev('__game.enemies.killAll(), 1');
    await sleep(300);

    // 平时移速：新放一只（不进读条）量它走 1 秒的距离
    await ev('__game.enemies.killAll(), 1');
    await sleep(400);
    await ev(`(() => {
      const p = __game.pos;
      const e = __game.block63.put('eraser', p.x + 12.0, p.z);
      if (e) { e.attackCd = 99; window.__er2 = e; }
      return 1;
    })()`);
    await sleep(600);
    const w0 = JSON.parse(await ev("JSON.stringify({x: window.__er2.pos.x, z: window.__er2.pos.z, t: performance.now()})"));
    await sleep(1200);
    const w1 = JSON.parse(await ev("JSON.stringify({x: window.__er2.pos.x, z: window.__er2.pos.z, t: performance.now()})"));
    const walkSp = Math.hypot(w1.x - w0.x, w1.z - w0.z) / ((w1.t - w0.t) / 1000);
    // 第 75 块把 speed 从 0.55 提到 1.35（用户：「它该主动靠近」）——
    // 实测会略低于配置值（走走停停、进出死区），所以只卡「动得起来、但没瞬移」这段区间。
    ok(walkSp > 0.5 && walkSp < 1.6, `平时移速实测 ${walkSp.toFixed(2)} 格/秒（配置 1.35）`, walkSp.toFixed(2));

    // ============================================================
    console.log('\n[E] 纵向 8 格：看得见就一路走到主角身边 ~4 格才起手');
    // ⚠️ 第 75 块用户定案改了行为：靠近阈值从 attackRange(7) 改成 keepDistance(4.2)，
    // 「站在 7 格外读条」已经是有意去掉的 —— 现在它会贴身缠上来，走到 4 格左右才起手。
    // ============================================================
    await ev('__game.enemies.killAll(), 1');
    await sleep(300);
    await ev(`(() => {
      const p = __game.pos;
      const e = __game.block63.put('eraser', p.x, p.z - 8.2);
      if (e) { e.attackCd = 0; window.__er4 = e; }
      return 1;
    })()`);
    await sleep(500);
    const up0 = JSON.parse(await ev('JSON.stringify(__game.block69.live()[0] || null)'));
    ok(up0 && up0.onScreen === true, '正上方 8.2 格在画面里（纵向视野比横向宽得多）', JSON.stringify(up0));
    let upOnset = null;
    const tE = Date.now();
    while (Date.now() - tE < 25000) {
      const w = JSON.parse(await ev('JSON.stringify(__game.block69.live()[0] || null)'));
      if (w && w.state === 'attack') { upOnset = w; break; }
      await sleep(100);
    }
    ok(!!upOnset && upOnset.dist <= 5.0,
      `纵向走到 keep 附近才起手（${upOnset && upOnset.dist} 格 ≤ 5.0，从 8.2 格一路贴上来）`, JSON.stringify(upOnset));
    ok(!!upOnset && upOnset.dist > 1.5, `但没贴到脸上（${upOnset && upOnset.dist} 格 > 1.5）`, JSON.stringify(upOnset));

    // ============================================================
    console.log('\n[F] JS 报错');
    // ============================================================
    ok(jsErrors.length === 0, `全程 0 条 JS 报错（实际 ${jsErrors.length}）`, jsErrors.slice(0, 3).join(' | '));

    console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
    if (fails.length) console.log('失败项：\n  - ' + fails.join('\n  - '));
    if (fail) process.exitCode = 1;
    console.log('截图目录：' + OUT);
  } catch (e) {
    console.error('失败：' + e.message);
    process.exitCode = 1;
  } finally {
    try { if (ws) ws.close(); } catch (_) {}
    try { chrome.kill(); } catch (_) {}
    await sleep(200);
    process.exit();
  }
})();
