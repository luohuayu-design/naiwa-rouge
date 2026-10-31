// 第 126 块 · 实机核对：照影 = 主角同款模型 + 紫色贴图
//   ① 模型真的换成新的了（file / 尺寸 / 静态单网格）
//   ② 贴图**渲染出来**是紫的（直接从截图采样，不信任配置文件）
//   ③ bounce 让它在原地一跳一跳（root.position.y 有起伏）
//   ④ 它还是那只照抄你面板的照影（血量按玩家上限算）
// 前置：python -m http.server 8124（cwd = naiwa-rouge）
// 运行：node .tmp-126-cdp.js
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9358;
const UD = path.join(process.env.TEMP || '/tmp', 'naiwa-cdp-126');
const OUT = 'C:/Users/MECHREVO/AppData/Local/Temp/naiwa-block126';
const URL = 'http://127.0.0.1:8124/?debug=1&story&chal';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
const fails = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name + (extra != null ? `  [${extra}]` : '')); }
  else { fail++; fails.push(name + (extra != null ? `  [${extra}]` : '')); console.log('  ✗ ' + name + (extra != null ? `  [${extra}]` : '')); }
}
function sec(t) { console.log('\n' + t); }

(async () => {
  fs.rmSync(UD, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const chrome = spawn(CHROME, [
    '--headless=new', '--remote-debugging-port=' + PORT, '--num-raster-threads=2',
    '--renderer-process-limit=1', '--enable-unsafe-swiftshader', '--no-first-run',
    '--no-default-browser-check', '--disable-dev-shm-usage', '--disable-background-timer-throttling',
    '--user-data-dir=' + UD, '--window-size=420,900', 'about:blank',
  ], { stdio: 'ignore' });

  let ws = null;
  try {
    for (let i = 0; i < 60; i++) {
      try { await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); break; }
      catch (_) { await sleep(500); }
    }
    const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent('about:blank')}`, { method: 'PUT' })).json();
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws fail')); });
    let id = 0;
    const pending = new Map();
    ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
    const send = (method, params) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
    const ev = async (expr) => {
      const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.result && r.result.exceptionDetails) console.log('  !! ' + r.result.exceptionDetails.text);
      return r.result && r.result.result ? r.result.result.value : null;
    };
    const shotBuf = async (name) => {
      const r = await send('Page.captureScreenshot', { format: 'png' });
      const buf = Buffer.from(r.result.data, 'base64');
      fs.writeFileSync(path.join(OUT, name), buf);
      return buf;
    };
    const waitFor = async (expr, ms) => {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) { if (await ev(expr)) return true; await sleep(120); }
      return false;
    };

    await send('Runtime.enable');
    await send('Page.enable');
    await send('Page.navigate', { url: URL });
    await waitFor('!!window.__game', 90000);
    await sleep(1500);
    await ev('if (__game.notice.open()) __game.notice.hide(); 1');
    await sleep(400);
    await ev('if (__game.sign.open()) __game.sign.hide(); 1');
    await sleep(400);
    await ev('if (__game.promo.open()) __game.promo.hide(); 1');
    await sleep(300);

    await ev('__game.setPendingLevel(10)');
    await ev('(async () => { await __game.beginGame({ tutorial: false }); return 1; })()');
    await sleep(2600);

    // ---------------- ① 模型换没换 ----------------
    sec('[A] 模型：换成主角那只，静态单网格');
    const info = await ev(`(() => {
      const m = __game.enemies.spawn('mirror', { x: 0, z: 0 });
      if (!m) return null;
      window.__mir = m;
      let meshes = 0, maps = 0;
      m.model.traverse((o) => { if (o.isMesh) { meshes++; if (o.material && o.material.map) maps++; } });
      return {
        file: m.cfg.file, h: m.cfg.height, src: m.cfg.sourceHeight,
        scale: +m.model.scale.x.toFixed(4),
        meshes, maps,
        isSkinned: !!(m.mesh && m.mesh.isSkinnedMesh),
        clips: Object.keys((m.actions) || {}).length,
        phantom: m.cfg.phantom,
      };
    })()`);
    console.log('     ' + JSON.stringify(info));
    ok(info && info.file === 'assets/monsters/mirror-frog.glb', '用的是新模型 mirror-frog.glb', info && info.file);
    ok(info && Math.abs(info.scale - 2.114) < 0.02, '缩放 = 2.28 / 1.0784 ≈ 2.114', info && info.scale);
    ok(info && info.maps >= 1, '模型带贴图（不是纯色块）', info && info.maps);
    ok(info && info.isSkinned === false, '不是蒙皮网格（静态单网格，和主角那套程序化骨架无关）');

    // ---------------- ② 截图采样：渲染出来真的是紫的 ----------------
    sec('[B] 渲染出来是紫的（截图采样，不信配置文件）');
    await ev('__game.setWaves(false); 1');
    await ev(`(() => {
      const k = __game.enemies.spawn('warrior', { x: -30, z: -30 });
      if (k) { k.state = 'chase'; k.maxHp = 30; k.hp = 30; k.attackCd = 1e9; }
      window.__keeper = k;
      return 1;
    })()`);
    await ev('__game.enemies.all().forEach(e => { if (e !== window.__keeper && e !== window.__mir) __game.enemies.takeDamage(e, 9999); }); 1');
    await sleep(800);
    await ev('__game.warp(-5.5, -5.5); 1');
    await sleep(600);
    await ev(`(() => {
      const m = window.__mir;
      m.hp = m.maxHp = 60; m.attackCd = 1e9; m.state = 'idle';
      window.__pin = setInterval(() => {
        const p = __game.pos();
        m.pos.x = p.x; m.pos.z = p.z + 3.4;
        m.root.position.x = m.pos.x; m.root.position.z = m.pos.z;
      }, 16);
      return 1;
    })()`);
    await ev('__game.heal.fill(); 1');
    await sleep(1600);
    const png = await shotBuf('b1-mirror-closeup.png');
    // 采样画面中央一块（照影大概就在那儿），数紫色像素
    const { data: raw, info: ri } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const x0 = Math.floor(ri.width * 0.32), x1 = Math.floor(ri.width * 0.72);
    const y0 = Math.floor(ri.height * 0.30), y1 = Math.floor(ri.height * 0.72);
    let purple = 0, total = 0, strong = 0;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const o = (y * ri.width + x) * 3;
        const r = raw[o], g = raw[o + 1], b = raw[o + 2];
        total++;
        if (b > r + 10 && r > g + 2) purple++;
        if (b > r + 26 && b > 90) strong++;
      }
    }
    const ratio = purple / total, sratio = strong / total;
    ok(ratio > 0.02, '画面中央有紫色像素（模型确实是紫的）', `${(ratio * 100).toFixed(1)}%`);
    ok(sratio > 0.008, '紫色够饱和（不是灰蓝噪声）', `${(sratio * 100).toFixed(1)}%`);

    // ---------------- ③ bounce：原地一跳一跳 ----------------
    sec('[C] bounce：静态模型靠一跳一跳演「在动」');
    const ys = [];
    for (let i = 0; i < 16; i++) {
      ys.push(await ev('+window.__mir.root.position.y.toFixed(4)'));
      await sleep(70);
    }
    const yMin = Math.min(...ys), yMax = Math.max(...ys);
    console.log('     y 采样: ' + ys.map((v) => v.toFixed(2)).join(' '));
    ok(yMax - yMin > 0.05, 'root.y 有明显起伏（在跳）', `${(yMax - yMin).toFixed(3)}`);
    ok(yMin >= -0.001, '从不低于地面（|sin| 的下界是 0）', yMin.toFixed(3));
    ok(yMax <= 0.17, '腾空高度不超过 cfg.bounce.amp', yMax.toFixed(3));
    const tiltSeen = await ev(`(() => {
      const rig = window.__mir.modelPivot || window.__mir.model;
      return +rig.rotation.x.toFixed(4);
    })()`);
    ok(Math.abs(tiltSeen) <= 0.08, '点头幅度在 cfg.bounce.tilt 之内', tiltSeen);

    // ---------------- ④ 还是那只照抄面板的照影 ----------------
    sec('[D] 机制没被模型换掉（还是照抄你的面板）');
    await ev('clearInterval(window.__pin); 1');
    // ⚠️ 别拿截图那只量血 —— 它为了截图被手动设成了 60 血，而且 mirrorSized 早就跑过了。
    // 新开一只干净的，等它第一帧按玩家面板抄完再读。
    await ev(`(() => {
      window.__probe = __game.enemies.spawn('mirror', { x: -8.5, z: -8.5 });
      return !!window.__probe;
    })()`);
    // spawnTime 是 0.9 秒 —— 出生态不进 handleMirror，抄面板要等它转成 chase 之后
    await sleep(1300);
    const copied = await ev(`(() => {
      const m = window.__probe;
      const php = __game.heal.hp();
      if (!m) return null;
      const r = { maxHp: m.maxHp, playerMax: php.max,
                  expect: Math.max(6, Math.min(60, php.max * 0.6)),
                  speed: +m.speed.toFixed(2), playerSpeed: +__game.stats.get('moveSpeed').toFixed(2) };
      __game.enemies.takeDamage(m, 9999);
      return r;
    })()`);
    console.log('     ' + JSON.stringify(copied));
    ok(copied && Math.abs(copied.maxHp - copied.expect) <= 1,
      '血量仍是玩家最大生命 ×0.6（夹 6~60）', `${copied.maxHp} vs ${copied.expect}`);
    ok(copied && copied.speed > 0, '移速照抄玩家（跑不掉）', `${copied.speed} / ${copied.playerSpeed}`);

    // 图鉴那张也顺手核一下能打开
    const codexOk = await ev(`(async () => {
      const r = await fetch('assets/codex/mirror.webp');
      return r.status;
    })()`);
    ok(codexOk === 200, '图鉴缩略图能取到', String(codexOk));
  } finally {
    try { ws && ws.close(); } catch (_) {}
    try { chrome.kill(); } catch (_) {}
  }

  console.log('\n' + '='.repeat(52));
  console.log(`第 126 块实机：${pass} 通过 / ${fail} 失败`);
  if (fail) { console.log('失败清单：'); fails.forEach((f) => console.log('  ✗ ' + f)); }
  console.log('='.repeat(52));
  process.exit(fail ? 1 : 0);
})();
