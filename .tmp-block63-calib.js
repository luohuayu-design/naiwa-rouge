// 第 63 块：第五/六关两只新怪的身高标定（hooded-scribe / reboot-unit）
// 跑法：先起 `python -m http.server 8124`（cwd = naiwa-rouge），再 `node .tmp-mob-calib.js`
// 作用：① 正交相机量每只模型的「Idle 渲染身高」与「脚底 Y」（sourceHeight 的标定依据）；
//       ② 存 正面/侧面 两张 PNG 到 %TEMP%/naiwa-mob-calib/ 供人眼核对朝向与比例。
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9357;
const PAGE = 'http://127.0.0.1:8124/?debug=1&title';
const UD = path.join(os.tmpdir(), 'naiwa-cdp-mobcalib63');
const OUT = path.join(os.tmpdir(), 'naiwa-mob-calib');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 待标定的模型 + 用哪段动画摆姿势（Idle / Flying_Idle 之类）
const TARGETS = [
  { file: 'assets/monsters/hooded-scribe.glb', pose: 'Idle' },
  { file: 'assets/monsters/reboot-unit.glb', pose: 'Idle' },
  // 对照组：战士与雾鬼（判断新模型该给多大用）
  { file: 'assets/monsters/skeleton-warrior.glb', pose: 'Idle' },
  { file: 'assets/monsters/wizard.glb', pose: 'Idle' },
];

const V = '74';

(async () => {
  fs.rmSync(UD, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const chrome = spawn(CHROME, [
    '--headless=new', '--remote-debugging-port=' + PORT, '--num-raster-threads=2',
    '--enable-unsafe-swiftshader', '--no-first-run', '--no-default-browser-check',
    '--disable-dev-shm-usage', '--user-data-dir=' + UD, '--window-size=560,560', 'about:blank',
  ], { stdio: 'ignore' });
  let ws = null;
  try {
    for (let i = 0; i < 60; i++) {
      try { await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); break; }
      catch (_) { await sleep(500); }
    }
    const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(PAGE)}`, { method: 'PUT' })).json();
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    let id = 0;
    const pending = new Map();
    ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
    const send = (method, params) => new Promise((res, rej) => {
      const mid = ++id;
      pending.set(mid, (m) => m.error ? rej(new Error(m.error.message)) : res(m.result));
      ws.send(JSON.stringify({ id: mid, method, params }));
    });
    const ev = async (expr) => {
      const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error('JS 异常: ' + (r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text));
      return r.result.value;
    };
    await send('Runtime.enable');
    await send('Page.enable');
    const t0 = Date.now();
    while (Date.now() - t0 < 90000) {
      try { if (await ev('!!window.__game')) break; } catch (_) {}
      await sleep(200);
    }

    // 离屏渲染器：正交相机，视窗高度 FIXED_H，像素↔世界单位是线性的
    await ev(`(async () => {
      const THREE = await import('/lib/three.module.js?v=${V}');
      const { GLTFLoader } = await import('/lib/jsm/loaders/GLTFLoader.js?v=${V}');
      const S = 512, FIXED_H = 14.0;         // 画面高 14 个世界单位（Quaternius 模型本体偏大，先框大点）
      const cv = document.createElement('canvas');
      cv.width = S; cv.height = S;
      const rd = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true, preserveDrawingBuffer: true });
      rd.setPixelRatio(1); rd.setSize(S, S, false);
      const scene = new THREE.Scene();
      scene.add(new THREE.HemisphereLight(0xbfe8ff, 0x1c2a20, 1.15));
      const key = new THREE.DirectionalLight(0xfff2d0, 1.9); key.position.set(2.2, 4.2, 3.2); scene.add(key);
      const rim = new THREE.DirectionalLight(0x7eebc4, 1.2); rim.position.set(-2.4, 2.4, -3.2); scene.add(rim);
      const cam = new THREE.OrthographicCamera(-FIXED_H/2, FIXED_H/2, FIXED_H/2, -FIXED_H/2, 0.1, 60);
      window.__cal = { THREE, GLTFLoader, rd, scene, cam, cv, S, FIXED_H };
      return true;
    })()`);

    for (const t of TARGETS) {
      const r = await ev(`(async () => {
        const C = window.__cal;
        const { THREE, GLTFLoader, rd, scene, cam, cv, S, FIXED_H } = C;
        const gltf = await new GLTFLoader().loadAsync(${JSON.stringify(t.file)});
        const model = gltf.scene;
        let mixer = null;
        const clip = gltf.animations.find(c => c.name.split('|').pop() === ${JSON.stringify(t.pose)}) || gltf.animations[0];
        if (clip) { mixer = new THREE.AnimationMixer(model); mixer.clipAction(clip).play(); mixer.update(0.45); }
        model.traverse(o => { if (o.isMesh) { o.castShadow = false; o.frustumCulled = false; } });
        scene.add(model);

        // 正交相机看 +Z→原点：模型若面朝相机 = 面朝 +Z（与 ENEMY_MODEL_YAW=0 一致）
        const px = new Uint8Array(S * S * 4);
        const gl = rd.getContext();
        const shoot = (yaw) => {
          model.rotation.y = yaw;
          model.position.set(0, 0, 0);
          model.updateMatrixWorld(true);
          cam.position.set(0, 0, 12);
          cam.up.set(0, 1, 0);
          cam.lookAt(0, 0, 0);
          cam.updateProjectionMatrix();
          rd.render(scene, cam);
          gl.readPixels(0, 0, S, S, gl.RGBA, gl.UNSIGNED_BYTE, px);
          let minX = S, maxX = -1, minY = S, maxY = -1;
          for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
            if (px[(y * S + x) * 4 + 3] > 10) {
              if (x < minX) minX = x; if (x > maxX) maxX = x;
              if (y < minY) minY = y; if (y > maxY) maxY = y;
            }
          }
          const url = cv.toDataURL('image/png');
          return { minX, maxX, minY, maxY, url };
        };
        const front = shoot(0);
        const side = shoot(Math.PI / 2);
        scene.remove(model);
        if (front.maxY < 0) return { ok: false };

        // 像素 → 世界：画面上边 = +2.0，下边 = -2.0（正交）
        // readPixels 的行号是「从下往上」（第 0 行 = 画面底），所以世界 Y = (row - S/2) * wpp
        const wpp = FIXED_H / S;
        const footWorld = (front.minY - S / 2) * wpp;        // 最低点（行号最小 = 画面最下）
        const topWorld = (front.maxY + 1 - S / 2) * wpp;     // 最高点
        const sideFoot = (side.minY - S / 2) * wpp;
        const sideTop = (side.maxY + 1 - S / 2) * wpp;
        return {
          ok: true,
          height: +(topWorld - footWorld).toFixed(3),
          footY: +footWorld.toFixed(3),
          width: +((front.maxX - front.minX + 1) * wpp).toFixed(3),
          depth: +((side.maxX - side.minX + 1) * wpp).toFixed(3),
          sideHeight: +(sideTop - sideFoot).toFixed(3),
          clips: gltf.animations.map(c => c.name),
          frontUrl: front.url, sideUrl: side.url,
        };
      })()`);
      if (!r.ok) { console.log('!! 空白渲染', t.file); continue; }
      const base = path.basename(t.file, '.glb');
      fs.writeFileSync(path.join(OUT, base + '-front.png'), Buffer.from(r.frontUrl.split(',')[1], 'base64'));
      fs.writeFileSync(path.join(OUT, base + '-side.png'), Buffer.from(r.sideUrl.split(',')[1], 'base64'));
      console.log(`${base.padEnd(18)} 高 ${String(r.height).padStart(6)}  脚 ${String(r.footY).padStart(7)}  宽 ${String(r.width).padStart(5)}  厚 ${String(r.depth).padStart(5)}  侧高 ${r.sideHeight}`);
      if (base === 'mushnub-evolved') console.log('   clips:', r.clips);
    }
    console.log('done →', OUT);
  } catch (err) {
    console.error('ERR', err.message);
    process.exitCode = 1;
  } finally {
    try { ws && ws.close(); } catch (_) {}
    try { chrome.kill(); } catch (_) {}
    setTimeout(() => process.exit(process.exitCode || 0), 400);
  }
})();
