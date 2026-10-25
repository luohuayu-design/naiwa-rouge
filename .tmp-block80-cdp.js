// 第 80 块 CDP：并联体「不像两个实体」的重做 + 载入优化
//   A 模型原点补偿：视觉包围盒中心 ≈ e.pos（以前偏 6 格，砍的是空气）
//   B 不再整圈自转：pivot 的 yaw 一直待在 ±sway 以内
//   C 电弧是 InstancedMesh（段 + 流光），一条线一个 draw call
//   D 两两最小间距：摆成一坨 → 自动推开到 minGap 以上
//   E 3 只 = 3 条线（不必成对）
//   F glb 请求带 ?v（SW 才能缓存优先，不再每次重下 7MB）
// 跑法：先起 `python -m http.server 8124`（cwd=naiwa-rouge），再 `node .tmp-block80-cdp.js`
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9380;
const UD = path.join(os.tmpdir(), 'naiwa-cdp-80');
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
    console.log('\n— A/F 进第六关：模型加载 + 请求带版本号 —');
    // ============================================================
    await ev('__game.beginGame({tutorial:false})');
    await sleep(800);
    await ev('__game.setAdmin(true)');
    await ev('__game.setLevel(6)');
    await ev('__game.ensureLevelAssets(6)');
    await sleep(600);

    const reqs = await ev(`JSON.stringify(
      performance.getEntriesByType('resource')
        .filter((r) => /\\.glb/.test(r.name))
        .map((r) => { const u = new URL(r.name); return { p: u.pathname, v: u.searchParams.get('v') }; })
    )`);
    const glbs = JSON.parse(reqs || '[]');
    const vglb = glbs.filter((g) => g.v);
    ok(glbs.length > 0, `本关确实下载了 ${glbs.length} 个 glb`, reqs);
    ok(vglb.length === glbs.length,
      `所有 glb 都带 ?v=（SW 才能缓存优先）`, JSON.stringify(glbs.filter((g) => !g.v)));
    const V = await ev(`(document.querySelector('script[type=module]')||{src:''}).src.match(/v=(\\d+)/)[1]`);
    ok(vglb.every((g) => g.v === V), `版本号和页面一致（v=${V}）`, JSON.stringify(vglb.slice(0, 3)));

    // ============================================================
    console.log('\n— A 模型原点补偿：视觉中心 ≈ e.pos —');
    // ============================================================
    await ev('__game.enemies.killAll()');
    await sleep(300);
    await ev(`(() => {
      const e = __game.enemies.spawn('arc', { x: 5, z: 5 }, {});
      if (e) { e.hp = 999; e.maxHp = 999; e.speed = 0; }
    })()`);
    await sleep(1200);   // 等 spawnTime(0.8)

    const diag = JSON.parse(await ev(`(async () => {
      const THREE = await import('/lib/three.module.js?v=${V}');
      const e = __game.enemies.list.find((o) => o.type === 'arc' && o.state !== 'dead');
      if (!e) return JSON.stringify({ none: true });
      e.model.updateWorldMatrix(true, true);
      const b = new THREE.Box3().setFromObject(e.model);
      const c = b.getCenter(new THREE.Vector3());
      return JSON.stringify({
        pos: { x: +e.pos.x.toFixed(2), z: +e.pos.z.toFixed(2) },
        center: { x: +c.x.toFixed(2), z: +c.z.toFixed(2) },
        dx: +Math.hypot(c.x - e.pos.x, c.z - e.pos.z).toFixed(2),
        hasPivot: !!e.modelPivot,
        modelOffX: +e.model.position.x.toFixed(2),
        yaw: +((e.modelPivot || e.model).rotation.y).toFixed(3),
        sway: e.cfg.sway,
      });
    })()`));
    console.log('    [诊断] ' + JSON.stringify(diag));
    ok(!diag.none, '场上有一只并联体');
    ok(diag.hasPivot === true, '原点偏移的模型套了 pivot（旋转才不会绕远点）');
    ok(Math.abs(diag.modelOffX) > 0.5, `模型位置补偿生效（model.x = ${diag.modelOffX}）`);
    ok(diag.dx <= 0.45,
      `视觉包围盒中心贴在 e.pos 上（偏差 ${diag.dx} 格，以前是 6 格多）`);

    // ============================================================
    console.log('\n— B 不再整圈自转 —');
    // ============================================================
    const yaws = [];
    for (let i = 0; i < 4; i++) {
      yaws.push(await ev(`(() => {
        const e = __game.enemies.list.find((o) => o.type === 'arc' && o.state !== 'dead');
        return e ? +((e.modelPivot || e.model).rotation.y).toFixed(3) : 99;
      })()`));
      await sleep(400);
    }
    console.log('    [诊断] yaw 序列 ' + JSON.stringify(yaws));
    const swayMax = Math.abs(diag.sway || 0.16) + 0.02;
    ok(yaws.every((y) => Math.abs(y) <= swayMax),
      `yaw 一直待在 ±${swayMax.toFixed(2)} 以内（不再是 0.8 rad/s 的整圈转）`, JSON.stringify(yaws));

    // ============================================================
    console.log('\n— C 电弧是 InstancedMesh（段 + 流光） —');
    // ============================================================
    await ev('__game.enemies.killAll()');
    await sleep(300);
    // 摆两只成一条线，看那条线的结构
    await ev(`(() => {
      for (const x of [-4, 4]) {
        const e = __game.enemies.spawn('arc', { x, z: 0 }, {});
        if (e) { e.hp = 999; e.maxHp = 999; e.speed = 0; }
      }
    })()`);
    await sleep(1200);
    const lines = JSON.parse(await ev(`(() => {
      const out = [];
      __game.scene.traverse((o) => {
        if (o.isInstancedMesh && o.visible && o.material && o.material.blending === 2) {
          out.push({ count: o.count, segs: __game.enemyTypes.arc.arc.segs, dots: __game.enemyTypes.arc.arc.dots });
        }
      });
      return JSON.stringify(out);
    })()`));
    console.log('    [诊断] ' + JSON.stringify(lines));
    ok(lines.length >= 1, `场上有 ${lines.length} 条电弧实例网格`);
    const cfgArc = JSON.parse(await ev('JSON.stringify(__game.enemyTypes.arc.arc)'));
    ok(lines.every((l) => l.count === cfgArc.segs + cfgArc.dots),
      `每条线 ${cfgArc.segs} 段 + ${cfgArc.dots} 个流光（一个 draw call）`, JSON.stringify(lines));

    // ============================================================
    console.log('\n— E 3 只 = 3 条线（不必成对） —');
    // ============================================================
    await ev('__game.enemies.killAll()');
    await sleep(300);
    await ev(`(() => {
      for (const [x, z] of [[-5, -5], [5, -5], [0, 5]]) {
        const e = __game.enemies.spawn('arc', { x, z }, {});
        if (e) { e.hp = 999; e.maxHp = 999; e.speed = 0; }
      }
    })()`);
    await sleep(1300);
    const n3 = await ev('__game.enemies.arcNodes()');
    const l3 = await ev('__game.enemies.arcLines()');
    ok(n3 === 3, `场上 3 只并联体（实际 ${n3}）`);
    ok(l3 === 3, `3 只 → 3 条电弧（C(3,2)，奇数也行）`, String(l3));

    // ============================================================
    console.log('\n— D 两两最小间距：挤成一坨会被推开 —');
    // ============================================================
    await ev('__game.enemies.killAll()');
    await sleep(300);
    // 故意摆成 0.6 格一个，几乎重叠
    await ev(`(() => {
      for (const [x, z] of [[0, 0], [0.6, 0], [0.3, 0.5]]) {
        const e = __game.enemies.spawn('arc', { x, z }, {});
        if (e) { e.hp = 999; e.maxHp = 999; e.speed = 0; }   // 钉死不动，只测分离
      }
    })()`);
    // 出生保护期（spawnTime 0.8s）里不参与分离 —— 这时候读到的还是我摆的原始位置
    await sleep(350);
    const before = JSON.parse(await ev(`JSON.stringify(__game.enemies.list
      .filter((e) => e.type === 'arc')
      .map((e) => [+e.pos.x.toFixed(2), +e.pos.z.toFixed(2)]))`));
    await sleep(2200);   // 让分离力收住
    const after = JSON.parse(await ev(`JSON.stringify(__game.enemies.list
      .filter((e) => e.type === 'arc' && e.state !== 'dead')
      .map((e) => [+e.pos.x.toFixed(2), +e.pos.z.toFixed(2)]))`));
    const gapOf = (pts) => {
      let m = 99;
      for (let i = 0; i < pts.length; i++)
        for (let j = i + 1; j < pts.length; j++)
          m = Math.min(m, Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]));
      return m;
    };
    const g0 = gapOf(before), g1 = gapOf(after);
    console.log(`    [诊断] 最近间距 ${g0.toFixed(2)} → ${g1.toFixed(2)}（目标 ≥ ${cfgArc.minGap}）`);
    ok(g1 > g0 + 0.5, `确实被推开了（${g0.toFixed(2)} → ${g1.toFixed(2)}）`);
    ok(g1 >= cfgArc.minGap - 0.35,
      `收在 ${cfgArc.minGap} 格附近（实际 ${g1.toFixed(2)}，留一点浮点余量）`);

    // ============================================================
    console.log('\n— 收尾：无 JS 报错 —');
    // ============================================================
    const realErrors = jsErrors.filter((e) => !/favicon|404|Failed to load resource/i.test(e));
    ok(realErrors.length === 0, '页面没有 JS 报错', realErrors.slice(0, 3).join(' | '));

    console.log('\n' + '─'.repeat(56));
    if (fail) {
      console.log(`第 80 块 CDP：${pass} 通过 / ${fail} 失败`);
      console.log('失败项：\n  ' + fails.join('\n  '));
    } else {
      console.log(`第 80 块 CDP 全绿 ${pass}`);
    }
  } catch (err) {
    console.error('ERR', err.message);
    process.exitCode = 1;
  } finally {
    try { ws && ws.close(); } catch (_) {}
    try { chrome.kill(); } catch (_) {}
    setTimeout(() => process.exit(process.exitCode || (fail ? 1 : 0)), 500);
  }
})();
