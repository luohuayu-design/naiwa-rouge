// 第 77 块：井蛙 / 木鱼灵 候选对比板
// 关键：蒙皮模型的 Box3 完全不可信（wolf.glb 量出 527，项目实值 2.707），
// 所以身高一律用「正交相机渲染 + 读像素」实测 —— 和项目当年标定同一套办法。
//
// ⚠️ 候选 glb 不进仓库（.gitignore 里的 .tmp-pick/）。要重跑先把它们下回来：
//   青蛙            https://static.poly.pizza/9018566d-c4e9-4f20-9c99-964622a6e674.glb  → .tmp-pick/frog.glb
//   蓝金鱼          https://static.poly.pizza/2da5383d-4fd5-49bd-a7ea-197f654bc34d.glb  → .tmp-pick/fish-bluegold.glb
//   太阳鱼          https://static.poly.pizza/b8176c6b-4ba0-4eaa-9aa0-836bfaa04c56.glb  → .tmp-pick/fish-sun.glb
//   河豚（选中的）  https://static.poly.pizza/2b8ee3e9-9fa3-458a-91a8-3d356dc8e6a5.glb  → .tmp-pick/fish-puffer.glb
//   鮟鱇鱼          https://static.poly.pizza/0c4802f0-32f9-4a2a-90a5-56b94c33e37e.glb  → .tmp-pick/fish-angler.glb
//   鱼骨            https://static.poly.pizza/ed285a5f-7c35-47b0-a12d-60006f5eb74c.glb  → .tmp-pick/fish-bone.glb
//   全部 CC0 1.0 / Quaternius / poly.pizza，代理可用时 curl -x http://127.0.0.1:7897 直接拉
//
// 跑法：先起 8124，再 `node .tmp-block77-pick.js`
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9361;
const PAGE = 'http://127.0.0.1:8124/?debug=1&title';
const UD = path.join(os.tmpdir(), 'naiwa-cdp-pick77');
const OUT = path.join(os.tmpdir(), 'naiwa-pick77');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const V = '87';

const ITEMS = [
  { tag: '井蛙 · 现状', name: 'wolf 换绿（占位）', file: 'assets/monsters/wolf.glb', height: 1.70, clip: 'Idle', view: 'front', now: true },
  { tag: '井蛙 · 候选', name: 'Quaternius Frog', file: '.tmp-pick/frog.glb', height: 1.70, clip: 'Idle', view: 'front' },
  { tag: '木鱼灵 · 现状', name: 'tribal 换青（占位）', file: 'assets/monsters/tribal.glb', height: 2.52, clip: 'Idle', view: 'front', now: true },
  { tag: '木鱼灵 · A', name: '蓝金鱼 Blue Goldfish', file: '.tmp-pick/fish-bluegold.glb', height: 2.52, clip: 'Swimming_Normal', view: 'side' },
  { tag: '木鱼灵 · B', name: '太阳鱼 Sunfish', file: '.tmp-pick/fish-sun.glb', height: 2.52, clip: 'Swimming_Normal', view: 'side' },
  { tag: '木鱼灵 · C', name: '河豚 Puffer', file: '.tmp-pick/fish-puffer.glb', height: 2.52, clip: 'Swimming_Normal', view: 'side' },
  { tag: '木鱼灵 · D', name: '鮟鱇鱼 Anglerfish', file: '.tmp-pick/fish-angler.glb', height: 2.52, clip: 'Swimming_Normal', view: 'side' },
  { tag: '木鱼灵 · E', name: '鱼骨 Fish Bone（静态）', file: '.tmp-pick/fish-bone.glb', height: 2.52, clip: null, view: 'side' },
];

(async () => {
  fs.rmSync(UD, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const chrome = spawn(CHROME, [
    '--headless=new', '--remote-debugging-port=' + PORT, '--num-raster-threads=2',
    '--enable-unsafe-swiftshader', '--no-first-run', '--no-default-browser-check',
    '--disable-dev-shm-usage', '--user-data-dir=' + UD, '--window-size=1520,980', 'about:blank',
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

    const res = await ev(`(async () => {
      const THREE = await import('/lib/three.module.js?v=${V}');
      const { GLTFLoader } = await import('/lib/jsm/loaders/GLTFLoader.js?v=${V}');
      const ITEMS = ${JSON.stringify(ITEMS)};
      const COLS = 4, ROWS = 2;
      const CW = 372, CH = 400, HEAD = 74, PAD = 8;
      const W = COLS * CW + PAD * 2, H = ROWS * CH + HEAD;

      const cv = document.createElement('canvas');
      cv.width = W; cv.height = H;
      const rd = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: false });
      rd.setPixelRatio(1); rd.setSize(W, H, false);
      rd.autoClear = false;
      rd.setScissorTest(true);

      const loader = new GLTFLoader();

      // —— 像素实测：正交相机拍一张，找非背景像素的包围盒（世界单位）——
      const OFF = 10;      // 正交半高 = 10 世界单位
      const MW = 384;      // 测量画布边长
      const mcv = document.createElement('canvas');
      mcv.width = MW; mcv.height = MW;
      const mrd = new THREE.WebGLRenderer({ canvas: mcv, antialias: false, alpha: false });
      mrd.setPixelRatio(1); mrd.setSize(MW, MW, false);
      mrd.setClearColor(0xff00ff, 1);       // 洋红背景，凡是别色就是模型
      const m2d = document.createElement('canvas');
      m2d.width = MW; m2d.height = MW;
      const mctx = m2d.getContext('2d', { willReadFrequently: true });

      function pixelBox(scene, dir) {
        const cam = new THREE.OrthographicCamera(-OFF, OFF, OFF, -OFF, 0.01, 500);
        if (dir === 'side') cam.position.set(200, 0, 0);
        else cam.position.set(90, 40, 150);
        cam.lookAt(0, 0, 0);
        mrd.clear();
        mrd.render(scene, cam);
        mctx.clearRect(0, 0, MW, MW);
        mctx.drawImage(mcv, 0, 0);
        const d = mctx.getImageData(0, 0, MW, MW).data;
        let x0 = MW, x1 = -1, y0 = MW, y1 = -1;
        for (let y = 0; y < MW; y++) {
          for (let x = 0; x < MW; x++) {
            const i = (y * MW + x) * 4;
            // 背景是 (255,0,255)，只要明显偏离就算模型
            if (Math.abs(d[i] - 255) + d[i + 1] + Math.abs(d[i + 2] - 255) > 24) {
              if (x < x0) x0 = x; if (x > x1) x1 = x;
              if (y < y0) y0 = y; if (y > y1) y1 = y;
            }
          }
        }
        if (x1 < 0) return null;
        const k = (OFF * 2) / MW;        // 每像素多少世界单位
        return {
          wWorld: (x1 - x0 + 1) * k, hWorld: (y1 - y0 + 1) * k,
          cx: ((x0 + x1 + 1) / 2 / MW) * OFF * 2 - OFF,
          cy: OFF - ((y0 + y1 + 1) / 2 / MW) * OFF * 2,
        };
      }

      // —— 标定：wolf 应 ≈2.707 / tribal 应 ≈4.238 ——
      const calib = {};
      for (const [k, f] of [['wolf', 'assets/monsters/wolf.glb'], ['tribal', 'assets/monsters/tribal.glb']]) {
        const g = await loader.loadAsync(f);
        const sc = new THREE.Scene();
        sc.add(new THREE.HemisphereLight(0xffffff, 0x222222, 2.2));
        const g2 = g.scene; g2.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
        sc.add(g2);
        const pb = pixelBox(sc, 'front');
        calib[k] = pb ? +pb.hWorld.toFixed(3) : null;
      }

      const report = {};
      const cells = [];
      for (let i = 0; i < ITEMS.length; i++) {
        const it = ITEMS[i];
        const scene = new THREE.Scene();
        scene.add(new THREE.HemisphereLight(0xcfe9ff, 0x1c2a20, 1.5));
        const key = new THREE.DirectionalLight(0xfff2d0, 2.2); key.position.set(4, 9, 8); scene.add(key);
        const rim = new THREE.DirectionalLight(0x7eebc4, 1.4); rim.position.set(-6, 4, -5); scene.add(rim);

        const holder = new THREE.Group();
        scene.add(holder);
        const g = await loader.loadAsync(it.file);
        const model = g.scene;
        holder.add(model);
        const anims = (g.animations || []).map((c) => c.name);
        if (it.clip && g.animations) {
          const clip = g.animations.find((c) => c.name === it.clip || c.name.split('|').pop() === it.clip);
          if (clip) { const mx = new THREE.AnimationMixer(model); mx.clipAction(clip).play(); mx.update(0.55); }
        }
        model.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; if (o.material) o.material = o.material.clone(); } });
        if (it.now) {
          const tint = it.tag.indexOf('井蛙') >= 0 ? 0x3f9a5a : 0x4aa89a;
          const tc = new THREE.Color(tint);
          model.traverse((o) => { if (o.isMesh && o.material && o.material.color) o.material.color.copy(tc); });
        }

        // 1) 量原始身高 → 2) 缩到目标身高 → 3) 重新量 → 4) 居中
        let pb = pixelBox(scene, it.view);
        if (!pb) { report[it.tag] = { 错误: '量不到像素（模型没渲染出来）' }; continue; }
        const srcH = pb.hWorld;
        holder.scale.setScalar(it.height / srcH);
        pb = pixelBox(scene, it.view);
        holder.position.set(-pb.cx, -pb.cy, 0);
        pb = pixelBox(scene, it.view);

        report[it.tag + ' ' + it.name] = {
          sourceHeight: +srcH.toFixed(3),
          渲染高: +pb.hWorld.toFixed(3),
          播放: it.clip || '无',
          动画: anims.length ? anims.map((a) => a.split('|').pop()).join(' / ') : '无',
        };

        // 正交取景：把像素包围盒放大 1.28 倍铺满格子
        const halfH = Math.max(pb.hWorld, pb.wWorld * (CH / CW)) * 0.64;
        const cam = new THREE.PerspectiveCamera();  // 占位，下面换成正交
        const oc = new THREE.OrthographicCamera(-halfH * (CW / CH), halfH * (CW / CH), halfH, -halfH, 0.01, 900);
        if (it.view === 'side') oc.position.set(300, 0, 0);
        else oc.position.set(120, 52, 200);
        oc.lookAt(0, 0, 0);

        // 脚下一条地平线
        const groundY = -pb.cy - pb.hWorld / 2 + (pb.hWorld / 2) + 0;  // = -pb.cy（居中后底边）
        const gl = new THREE.Mesh(
          new THREE.PlaneGeometry(halfH * 6, 0.012 * pb.hWorld),
          new THREE.MeshBasicMaterial({ color: 0x2f5a52 }),
        );
        gl.position.set(0, -pb.hWorld / 2, -0.4);
        scene.add(gl);

        const col = i % COLS, row = Math.floor(i / COLS);
        const vx = PAD + col * CW;
        const vyBottom = HEAD + (ROWS - 1 - row) * CH;
        rd.setViewport(vx, vyBottom, CW, CH);
        rd.setScissor(vx, vyBottom, CW, CH);
        rd.setClearColor(0x0d1614, 1);
        rd.clear();
        rd.render(scene, oc);

        cells.push({
          tag: it.tag, name: it.name, x: vx, top: HEAD + row * CH, now: !!it.now,
          pxPerWorld: CH / (halfH * 2),
        });
      }

      const out = document.createElement('canvas');
      out.width = W; out.height = H;
      const g2 = out.getContext('2d');
      g2.fillStyle = '#0d1614';
      g2.fillRect(0, 0, W, H);
      g2.drawImage(cv, 0, 0);
      for (const sh of cells) {
        g2.strokeStyle = sh.now ? 'rgba(255,160,90,0.6)' : 'rgba(90,200,170,0.38)';
        g2.lineWidth = 1;
        g2.strokeRect(sh.x + 0.5, sh.top + 0.5, CW - 1, CH - 1);
        // 主角身高参照：1.2 的一条黄竖棍（按本格 px/world 换算）
        const bh = 1.2 * sh.pxPerWorld;
        const bx = sh.x + 18, by = sh.top + CH - 62;
        g2.fillStyle = 'rgba(255,233,168,0.85)';
        g2.fillRect(bx, by - bh, 7, bh);
        g2.font = '600 13px ui-sans-serif,"Microsoft YaHei",sans-serif';
        g2.fillStyle = '#ffe9a8';
        g2.textAlign = 'left';
        g2.fillText('1.2', bx + 11, by - bh + 12);
        const cx = sh.x + CW / 2;
        g2.textAlign = 'center';
        g2.font = '700 20px ui-sans-serif,"Microsoft YaHei",sans-serif';
        g2.fillStyle = sh.now ? '#ffb37a' : '#7fe8c4';
        g2.fillText(sh.tag, cx, sh.top + CH - 44);
        g2.font = '600 17px ui-sans-serif,"Microsoft YaHei",sans-serif';
        g2.fillStyle = sh.now ? '#d9bfa8' : '#9adcc4';
        g2.fillText(sh.name, cx, sh.top + CH - 20);
      }
      g2.textAlign = 'left';
      g2.font = '700 21px ui-sans-serif,"Microsoft YaHei",sans-serif';
      g2.fillStyle = '#ffd166';
      g2.fillText('第 77 块 · 井蛙 / 木鱼灵 换真模型 · 候选对比（全部 CC0 1.0，作者 Quaternius，取自 poly.pizza）', 20, 30);
      g2.font = '500 16px ui-sans-serif,"Microsoft YaHei",sans-serif';
      g2.fillStyle = '#8fc9b8';
      g2.fillText('每格都缩放到游戏内目标身高（井蛙 1.70 / 木鱼灵 2.52）并播放待机动作 · 橙框 = 现在用的换色占位 · 黄棍 = 主角身高 1.2', 20, 56);

      return { png: out.toDataURL('image/png'), report, calib };
    })()`);

    const buf = Buffer.from(res.png.split(',')[1], 'base64');
    const f = path.join(OUT, 'pick77.png');
    fs.writeFileSync(f, buf);
    console.log('写出', f, (buf.length / 1024).toFixed(0) + 'KB');
    console.log('标定（wolf 应 2.707 / tribal 应 4.238）:', JSON.stringify(res.calib));
    console.log(JSON.stringify(res.report, null, 2));
  } catch (err) {
    console.error('ERR', err.message);
    process.exitCode = 1;
  } finally {
    try { ws && ws.close(); } catch (_) {}
    try { chrome.kill(); } catch (_) {}
    setTimeout(() => process.exit(process.exitCode || 0), 400);
  }
})();
