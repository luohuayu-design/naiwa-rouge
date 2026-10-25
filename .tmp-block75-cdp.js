// 第 75 块 CDP：擦名者会走过来 + 第六关并联体的电弧网真的在咬人
//   A 第六关能加载并联体的模型（不是占位）
//   B 4 只并联体 = 6 条电弧（组合数），少一只就少线
//   C 主角站到电弧上会掉血，而且有节流（不会一瞬间掉光）
//   D 擦名者出生在更近的圈上，并且会主动往主角身边走
// 跑法：先起 `python -m http.server 8124`（cwd=naiwa-rouge），再 `node .tmp-block75-cdp.js`
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9375;
const UD = path.join(os.tmpdir(), 'naiwa-cdp-75');
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
        await sleep(250);
      }
      throw new Error('等待超时: ' + label);
    }

    await send('Page.enable', {});
    await send('Runtime.enable', {});
    await send('Page.navigate', { url: URL });
    await waitFor('!!window.__game', 90000, '等到 __game 就绪');
    await sleep(700);

    // ============================================================
    console.log('\n— A 第六关：并联体的模型能加载 —');
    // ============================================================
    await ev('__game.beginGame({tutorial:false})');
    await sleep(800);
    await ev('__game.setAdmin(true)');          // 全程无敌，先把「网」看清楚
    await ev('__game.setLevel(6)');
    await ev('__game.ensureLevelAssets(6)');
    await sleep(400);

    const loaded = await ev('JSON.stringify(__game.enemies.loaded())');
    ok(loaded.includes('"arc"'), '第六关按需加载了 arc（并联体）', loaded);
    ok(loaded.includes('"reboot"'), '第六关也加载了 reboot（重启体）');

    const cfg = JSON.parse(await ev(`JSON.stringify({
      name: __game.enemyTypes.arc ? __game.enemyTypes.arc.name : null,
      file: __game.enemyTypes.arc ? __game.enemyTypes.arc.file : null,
      hp: __game.enemyTypes.arc ? __game.enemyTypes.arc.hp : null,
    })`));
    ok(cfg.name === '并联体', `图鉴名是「${cfg.name}」`);
    ok(/parallel-cell\.glb$/.test(cfg.file || ''), '用的是自己的 glb（不是复用别的怪）', cfg.file);

    // ============================================================
    console.log('\n— B 4 只并联体 = 6 条电弧 —');
    // ============================================================
    await ev(`(() => { __game.enemies.killAll(); })()`);
    await sleep(200);
    await ev(`(() => {
      const P = [[-4,-4],[4,-4],[-4,4],[4,4]];
      for (const [x, z] of P) {
        const e = __game.enemies.spawn('arc', { x, z }, {});
        if (e) { e.hp = 999; e.maxHp = 999; e.speed = 0; }   // 钉死：不移动、不被玩家打死
      }
    })()`);
    await sleep(1400);   // 等 spawnTime(0.8) 过去

    // ⚠️ 波次本身也会刷并联体（第 6 回合起），所以这里断言「线数 = C(节点数,2)」，
    //    而不是写死 6 条 —— 写死的话会因为多刷一只而误判。
    const n4 = await ev('__game.enemies.arcNodes()');
    const l4 = await ev('__game.enemies.arcLines()');
    ok(n4 >= 3, `场上至少 3 只并联体（实际 ${n4}）`, String(n4));
    ok(l4 === (n4 * (n4 - 1)) / 2, `${n4} 只 → ${(n4 * (n4 - 1)) / 2} 条电弧（C(n,2) 组合数）`,
      `实际 ${l4} 条`);
    ok(l4 >= 3, `确实连成了一张网（${l4} 条）`, String(l4));

    // ============================================================
    console.log('\n— C 站在电弧上会掉血（而且有节流） —');
    // ============================================================
    // 重新铺三只，摆成三角形，取一条边的中点站上去（不依赖上一段剩下的怪）
    await ev(`(() => { __game.enemies.killAll(); })()`);
    await sleep(300);
    await ev(`(() => {
      const P = [[-5,-5],[5,-5],[0,5]];
      for (const [x, z] of P) {
        const e = __game.enemies.spawn('arc', { x, z }, {});
        if (e) { e.hp = 999; e.maxHp = 999; e.speed = 0; }
      }
    })()`);
    await sleep(1300);   // 等 spawnTime(0.8)
    await ev('__game.setAdmin(false)');         // 关掉无敌，真吃伤害
    await ev('__game.setAdmin(false)');
    await sleep(200);

    const mid = await ev(`(() => {
      const es = __game.enemies.list.filter((e) => e.type === 'arc' && e.state !== 'dead' && e.state !== 'spawn');
      if (es.length < 2) return null;
      return { x: (es[0].pos.x + es[1].pos.x) / 2, z: (es[0].pos.z + es[1].pos.z) / 2, n: es.length };
    })()`);
    ok(!!mid, '至少两只并联体撑起一条线', JSON.stringify(mid));
    // 站到线上
    await ev(`__game.pos.x = ${mid.x}; __game.pos.z = ${mid.z};`);
    await sleep(300);
    const diag = JSON.parse(await ev(`JSON.stringify({
      px: +__game.pos.x.toFixed(2), pz: +__game.pos.z.toFixed(2),
      hp: __game.stats.hp.cur, admin: __game.admin,
      nodes: __game.enemies.arcNodes(), lines: __game.enemies.arcLines(),
      arcs: __game.enemies.list.filter(e=>e.type==='arc').map(e=>({s:e.state,x:+e.pos.x.toFixed(1),z:+e.pos.z.toFixed(1)})),
    })`));
    console.log('    [诊断] ' + JSON.stringify(diag));
    // 清空已有伤害，量一次干净的
    const hp0 = await ev('__game.stats.hp.cur');
    await sleep(1600);
    const hp1 = await ev('__game.stats.hp.cur');
    console.log('    [诊断] hp ' + hp0 + ' → ' + hp1);
    ok(hp1 < hp0, `站到电弧上掉血了（${hp0} → ${hp1}）`);
    const lost = hp0 - hp1;
    ok(lost >= 1, `至少掉 1 点（实际 ${lost}）`);
    // 节流：1 秒最多吃 2 下（cd 0.7s），绝不该是「每帧都掉」
    ok(lost <= 4, `1 秒内的伤害有上限（只掉 ${lost} 点，不是每帧都扣）`);

    // ============================================================
    console.log('\n— D 擦名者：出生更近 + 会主动走过来 —');
    // ============================================================
    await ev('__game.setAdmin(true)');
    await ev('__game.setLevel(5)');
    await ev('__game.ensureLevelAssets(5)');
    await sleep(400);
    await ev(`(() => { __game.enemies.killAll(); })()`);
    await sleep(400);

    // 放到离主角 9 格的地方（正好是新的出生半径附近）
    await ev(`__game.pos.x = 0; __game.pos.z = 0;`);
    const erasing = await ev(`(() => {
      const e = __game.enemies.spawn('eraser', { x: 9, z: 0 }, {});
      if (!e) return null;
      e.speed = e.cfg.speed;      // 用真速度（别被随机浮动影响判读）
      return { sp: e.cfg.speed, keep: e.cfg.keepDistance, range: e.cfg.attackRange };
    })()`);
    ok(!!erasing, '擦名者能生成');
    ok(erasing.sp >= 1.2, `移速 ${erasing.sp}（够快，看得见它在走）`);
    ok(erasing.keep === 4.2, `保持距离 ${erasing.keep}`);

    const d0 = await ev(`(() => {
      const e = __game.enemies.list.find((x) => x.type === 'eraser');
      return e ? Math.hypot(e.pos.x - __game.pos.x, e.pos.z - __game.pos.z) : -1;
    })()`);
    await sleep(2600);
    const d1 = await ev(`(() => {
      const e = __game.enemies.list.find((x) => x.type === 'eraser');
      return e ? Math.hypot(e.pos.x - __game.pos.x, e.pos.z - __game.pos.z) : -1;
    })()`);
    ok(d1 >= 0 && d1 < d0 - 1.0, `它主动往主角身边走了（${d0.toFixed(1)} → ${d1.toFixed(1)} 格）`);
    ok(d1 > 1.0, `但没贴到脸上（${d1.toFixed(1)} 格，它还留着距离读条）`);

    // ============================================================
    console.log('\n— E 没有 JS 报错 —');
    const realErrors = jsErrors.filter((x) => !/favicon|WebGL|SwiftShader|GPU stall/i.test(x));
    ok(realErrors.length === 0, '控制台没有未捕获错误', realErrors.slice(0, 2).join(' | '));

    console.log(`\n第 75 块 CDP：${pass} 通过 / ${fail} 失败`);
    if (fail) console.log('失败清单：\n - ' + fails.join('\n - '));
  } catch (err) {
    console.log('\n[测试崩了] ' + (err && err.message));
    console.log(`\n第 75 块 CDP：${pass} 通过 / ${fail + 1} 失败`);
    if (jsErrors.length) console.log('页面错误：\n' + jsErrors.slice(0, 5).join('\n'));
  } finally {
    try { ws && ws.close(); } catch (_) {}
    try { chrome.kill(); } catch (_) {}
    await sleep(600);
    try { fs.rmSync(UD, { recursive: true, force: true }); } catch (_) {}
  }
})();
