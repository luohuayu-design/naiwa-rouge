// ============================================================
// 第 77 块 CDP：井蛙 / 木鱼灵 换成真模型（Quaternius，CC0）
//   A 模型真的加载了，且用的不是占位文件
//   B 动画真的在播（mixer 有 action、time 在走）—— clip 名写错不会报错，只会站着不动
//   C 身形：井蛙踩地、木鱼灵浮空；缩放按各自 sourceHeight 算对
//   D 死亡下沉相对 hover（浮空怪不会突然掉到地底）
//   E 图鉴缩略图已重出（webp 能取到）
//   F 跑一个回合 0 JS 报错
//
// 跑法：先 `python -m http.server 8124`（cwd=naiwa-rouge），再 `node .tmp-block77-cdp.js`
// ⚠️ 一次只跑一套；套间跑 node .tmp-cdp-clean.js
// ============================================================
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9477;
const UD = path.join(os.tmpdir(), 'naiwa-cdp-77-' + process.pid);
const OUT = path.join(os.tmpdir(), 'naiwa-block77');
const BASE = 'http://127.0.0.1:8124';
const URL = BASE + '/index.html?debug=1&title';

let pass = 0, fail = 0;
const fails = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ok ' + name); }
  else { fail++; fails.push(name + (extra ? ' -> ' + extra : '')); console.log('  XX ' + name + (extra ? ' -> ' + extra : '')); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const chrome = spawn(CHROME, [
    '--headless=new', '--remote-debugging-port=' + PORT, '--num-raster-threads=2',
    '--enable-unsafe-swiftshader', '--no-first-run', '--no-default-browser-check',
    '--disable-dev-shm-usage', '--user-data-dir=' + UD, '--window-size=430,900', 'about:blank',
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
        const d = m.params.exceptionDetails;
        jsErrors.push((d.exception && d.exception.description) || d.text || '');
      }
      if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    };
    const send = (method, params) => new Promise((res, rej) => {
      const mid = ++id;
      pending.set(mid, (m) => (m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result)));
      ws.send(JSON.stringify({ id: mid, method, params }));
    });
    const ev = async (ex) => {
      const r = await send('Runtime.evaluate', { expression: ex, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error('JS: ' + (((r.exceptionDetails.exception || {}).description) || '').split('\n')[0]);
      return r.result.value;
    };
    const waitFor = async (ex, ms, label) => {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) { try { if (await ev(ex)) return true; } catch (_) {} await sleep(150); }
      throw new Error('等待超时: ' + (label || ex));
    };

    await send('Page.enable', {});
    await send('Runtime.enable', {});
    await send('Page.navigate', { url: URL });
    await waitFor('!!window.__game', 90000, '__game 就绪');
    await sleep(800);

    // ============================================================
    console.log('\n— A 模型加载：用的是自己的 glb，不是占位 —');
    // ============================================================
    await ev('__game.beginGame({tutorial:false})');
    await sleep(900);
    await ev('__game.setAdmin(true)');
    await ev('__game.setLevel(7)');
    await ev('__game.ensureLevelAssets(7)');
    await sleep(500);

    const loaded = await ev('JSON.stringify(__game.enemies.loaded())');
    ok(loaded.includes('"wellfrog"'), '第七关按需加载了 wellfrog（井蛙）', loaded);
    ok(loaded.includes('"woodfish"'), '第七关按需加载了 woodfish（木鱼灵）');

    const cfg = JSON.parse(await ev(`JSON.stringify({
      wf: { file: __game.enemyTypes.wellfrog.file, h: __game.enemyTypes.wellfrog.height, sh: __game.enemyTypes.wellfrog.sourceHeight, fam: __game.enemyTypes.wellfrog.animFamily, tint: __game.enemyTypes.wellfrog.tint, footY: __game.enemyTypes.wellfrog.footY },
      wd: { file: __game.enemyTypes.woodfish.file, h: __game.enemyTypes.woodfish.height, sh: __game.enemyTypes.woodfish.sourceHeight, fam: __game.enemyTypes.woodfish.animFamily, tint: __game.enemyTypes.woodfish.tint, hover: __game.enemyTypes.woodfish.hover, footY: __game.enemyTypes.woodfish.footY },
    })`));
    ok(/frog\.glb$/.test(cfg.wf.file), `井蛙模型是 ${cfg.wf.file}`);
    ok(!/wolf\.glb$/.test(cfg.wf.file), '井蛙不再借 wolf.glb');
    ok(cfg.wf.tint === undefined, '井蛙没有占位 tint（用模型本色）');
    ok(cfg.wf.fam === 'humanoid', `井蛙动画族 ${cfg.wf.fam}`);
    ok(/puffer-fish\.glb$/.test(cfg.wd.file), `木鱼灵模型是 ${cfg.wd.file}`);
    ok(!/tribal\.glb$/.test(cfg.wd.file), '木鱼灵不再借 tribal.glb');
    ok(cfg.wd.tint === undefined, '木鱼灵没有占位 tint');
    ok(cfg.wd.fam === 'fish', `木鱼灵动画族 ${cfg.wd.fam}`);
    ok(cfg.wd.footY === undefined, '木鱼灵不按脚落地');

    // ============================================================
    console.log('\n— B 动画真的在播（不是站着不动）—');
    // ============================================================
    await ev(`(() => { __game.enemies.killAll(); return 1; })()`);
    await sleep(200);
    await ev(`(() => {
      const a = __game.enemies.spawn('wellfrog', { x: -2.6, z: -4.6 }, {});
      const b = __game.enemies.spawn('woodfish', { x: 2.6, z: -4.6 }, {});
      for (const e of [a, b]) if (e) { e.hp = 9999; e.maxHp = 9999; e.speed = 0; }
      return 1;
    })()`);
    await sleep(1800);   // 过掉 spawnTime

    const anim = JSON.parse(await ev(`JSON.stringify(__game.enemies.list
      .filter(e => e.type === 'wellfrog' || e.type === 'woodfish')
      .map(e => ({
        type: e.type,
        mixerTime: +e.mixer.time.toFixed(3),
        actions: e.mixer._actions ? e.mixer._actions.length : -1,
        running: e.mixer._actions ? e.mixer._actions.filter(a => a.isRunning()).length : -1,
        anim: e.currentAnim,
      })))`));
    for (const a of anim) {
      const label = a.type === 'wellfrog' ? '井蛙' : '木鱼灵';
      ok(a.actions >= 1, `${label}的 mixer 里至少有 1 个 action（实际 ${a.actions}）`);
      ok(a.mixerTime > 0.05, `${label}的动画时间在往前走（${a.mixerTime}s）`);
      ok(a.running >= 1, `${label}有正在播放的 action（${a.running}）`);
    }

    // ============================================================
    console.log('\n— C 身形：井蛙踩地 / 木鱼灵浮空 —');
    // ============================================================
    const body = JSON.parse(await ev(`JSON.stringify(__game.enemies.list
      .filter(e => e.type === 'wellfrog' || e.type === 'woodfish')
      .map(e => ({
        type: e.type,
        rootY: +e.root.position.y.toFixed(3),
        modelY: +e.model.position.y.toFixed(3),
        scale: +e.model.scale.x.toFixed(4),
      })))`));
    const bf = body.find((b) => b.type === 'wellfrog');
    const bd = body.find((b) => b.type === 'woodfish');
    const expWfScale = +(cfg.wf.h / cfg.wf.sh).toFixed(3);
    const expWdScale = +(cfg.wd.h / cfg.wd.sh).toFixed(3);
    ok(Math.abs(bf.scale - expWfScale) < 0.01, `井蛙缩放 ${bf.scale}（= ${cfg.wf.h}/${cfg.wf.sh} = ${expWfScale}）`);
    ok(Math.abs(bd.scale - expWdScale) < 0.01, `木鱼灵缩放 ${bd.scale}（= ${cfg.wd.h}/${cfg.wd.sh} = ${expWdScale}）`);
    ok(bf.rootY === 0, '井蛙的 root 没被抬高（靠 footY 贴地）', String(bf.rootY));
    ok(bf.modelY > 0, `井蛙模型上抬了 ${bf.modelY}（脚底在原点以下，抬回来才踩地）`);
    ok(bd.modelY === 0, '木鱼灵模型本体没偏移（偏移交给 hover）', String(bd.modelY));
    ok(Math.abs(bd.rootY - cfg.wd.hover) < 0.12, `木鱼灵浮在 ${bd.rootY}（hover ${cfg.wd.hover} ± 呼吸 0.10）`);
    ok(bd.rootY > 0.5, '木鱼灵确实离地（不是半截埋在地里）');

    // ============================================================
    console.log('\n— D 死亡下沉相对 hover —');
    // ============================================================
    await ev(`(() => {
      const b = __game.enemies.list.find(e => e.type === 'woodfish');
      if (b) { b.hp = 0; b.state = 'dead'; b.deathT = 1.20; }
      return 1;
    })()`);
    // ⚠️ deathTime 是 1.6，超过就被移出 list —— 所以要边下沉边采样，别等太久
    const ys = [];
    for (let i = 0; i < 9; i++) {
      const y = await ev(`(() => {
        const b = __game.enemies.list.find(e => e.type === 'woodfish');
        return b ? +b.root.position.y.toFixed(3) : null;
      })()`);
      if (y !== null) ys.push(y);
      await sleep(70);
    }
    ok(ys.length > 0, `采到 ${ys.length} 个死亡过程的高度样本`, JSON.stringify(ys));
    ok(ys.length > 0 && Math.min(...ys) > 0.3, `木鱼灵下沉后仍在半空（最低 ${ys.length ? Math.min(...ys) : '?'}），没掉到地底`);

    // ============================================================
    console.log('\n— E 图鉴缩略图已重出 —');
    // ============================================================
    for (const t of ['wellfrog', 'woodfish']) {
      const r = await ev(`fetch('assets/codex/${t}.webp').then(r => r.status)`);
      ok(r === 200, `assets/codex/${t}.webp 能取到（${r}）`);
    }

    // ============================================================
    console.log('\n— F 跑一个回合，0 JS 报错 —');
    // ============================================================
    await ev('__game.enemies.killAll()');
    await ev('__game.setLevel(7)');
    await sleep(3500);
    ok(await ev("__game.state === 'playing'"), '还在正常游玩状态');
    ok(jsErrors.length === 0, `没有 JS 报错（${jsErrors.length} 条）`, jsErrors.slice(0, 2).join(' | '));

    console.log('\n' + (fail === 0 ? `全绿 ${pass}/${pass}` : `失败 ${fail} 项 / 共 ${pass + fail} 项`));
  } catch (err) {
    console.error('\nFAIL', err.message);
    process.exitCode = 1;
  } finally {
    try { ws && ws.close(); } catch (_) {}
    try { chrome.kill(); } catch (_) {}
    setTimeout(() => process.exit(process.exitCode || 0), 400);
  }
})();
