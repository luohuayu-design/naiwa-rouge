// 第 51 块：图鉴怪物缩略图（离线渲染 → assets/codex/*.webp）
// 跑法：先起 `python -m http.server 8124`（cwd = naiwa-rouge），再 `node .tmp-codex-shots.js`
// 换怪物模型 / 换皮肤后重跑一次即可；图鉴只读这些 webp，运行时不加载任何模型。
// 第 52 块：9 只怪换了模型（Quaternius），13 张图全部重出过。
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9356;
const PAGE = 'http://127.0.0.1:8124/?debug=1&title';
const UD = path.join(os.tmpdir(), 'naiwa-cdp-51shot');
const OUT = path.join(__dirname, 'assets', 'codex');
const V = '63';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  fs.rmSync(UD, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const chrome = spawn(CHROME, [
    '--headless=new', '--remote-debugging-port=' + PORT, '--num-raster-threads=2',
    '--enable-unsafe-swiftshader', '--no-first-run', '--no-default-browser-check',
    '--disable-dev-shm-usage', '--user-data-dir=' + UD, '--window-size=520,720', 'about:blank',
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

    // 一次性搭好离屏渲染器（后面每只怪复用，别开 13 个 WebGL 上下文）
    const setup = await ev(`(async () => {
      const THREE = await import('/lib/three.module.js?v=${V}');
      const E = await import('/js/enemy.js?v=${V}');
      const W = 240, H = 288;
      const cv = document.createElement('canvas');
      cv.width = W; cv.height = H;
      const rd = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true, preserveDrawingBuffer: true });
      rd.setPixelRatio(1);
      rd.setSize(W, H, false);
      const scene = new THREE.Scene();
      scene.add(new THREE.HemisphereLight(0xbfe8ff, 0x1c2a20, 1.15));
      const key = new THREE.DirectionalLight(0xfff2d0, 1.75); key.position.set(2.2, 4.2, 3.2); scene.add(key);
      const rim = new THREE.DirectionalLight(0x7eebc4, 1.25); rim.position.set(-2.4, 2.4, -3.2); scene.add(rim);
      const cam = new THREE.PerspectiveCamera(28, W / H, 0.1, 60);
      // 脚下软影：一张径向渐变贴图的圆片
      const sc = document.createElement('canvas'); sc.width = sc.height = 128;
      const sg = sc.getContext('2d');
      const grad = sg.createRadialGradient(64, 64, 4, 64, 64, 62);
      grad.addColorStop(0, 'rgba(2,16,12,0.72)');
      grad.addColorStop(0.55, 'rgba(2,16,12,0.34)');
      grad.addColorStop(1, 'rgba(2,16,12,0)');
      sg.fillStyle = grad; sg.fillRect(0, 0, 128, 128);
      const shadowMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, depthWrite: false });
      window.__cxShot = { THREE, E, rd, scene, cam, cv, W, H, shadowMat };
      return Object.keys(E.ENEMY_TYPES).filter((k) => !E.ENEMY_TYPES[k].planned);
    })()`);
    console.log('怪物条目：', setup.join(', '));

    for (const type of setup) {
      const url = await ev(`(async () => {
        const S = window.__cxShot;
        const { THREE, E, rd, scene, cam, shadowMat } = S;
        const pv = await E.buildPreviewModel(${JSON.stringify(type)});
        if (!pv) throw new Error('构建失败');
        const h = pv.height;
        const g = new THREE.Group();
        pv.model.rotation.y = -0.62;              // 3/4 侧脸，比正面有立体感
        g.add(pv.model);
        scene.add(g);
        // 影子要跟着自动取景走，先建好、每轮重摆
        const disc = new THREE.Mesh(new THREE.CircleGeometry(h * 0.5, 40), shadowMat);
        disc.rotation.x = -Math.PI / 2;
        g.add(disc);

        // ---- 自动取景 ----
        // cfg.height 是游戏里「归一后该有多高」，但模型真实渲染高度（Idle 姿势、
        // 绑骨缩放）并不完全等于它 —— 直接按 cfg.height 算距离会把帽子/头顶裁掉。
        // 所以渲染一遍、量透明通道的包围盒，按实测像素反推距离和中心，再渲染。
        const px = new Uint8Array(S.W * S.H * 4);   // 必须 Uint8Array（UNSIGNED_BYTE）
        const gl = rd.getContext();
        const measure = () => {
          gl.readPixels(0, 0, S.W, S.H, gl.RGBA, gl.UNSIGNED_BYTE, px);
          let minX = S.W, maxX = -1, minY = S.H, maxY = -1;
          for (let y = 0; y < S.H; y++) {
            for (let x = 0; x < S.W; x++) {
              if (px[(y * S.W + x) * 4 + 3] > 10) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
              }
            }
          }
          if (maxY < 0) return null;
          // readPixels 的原点在左下角，翻成「从上往下」的屏幕坐标
          return { minX, maxX, minY: S.H - 1 - maxY, maxY: S.H - 1 - minY };
        };
        const dbg = [];
        let dist = 12 * h;      // 先站远一点，保证第一轮不被裁切
        let aimY = h * 0.5;
        let aimX = 0;
        let done = false;
        for (let pass = 0; pass < 9 && !done; pass++) {
          cam.position.set(aimX, aimY + dist * 0.10, dist);
          cam.lookAt(aimX, aimY, 0);
          cam.updateProjectionMatrix();
          rd.render(scene, cam);
          const b = measure();
          dbg.push({ pass, b: b && [b.minX, b.maxX, b.minY, b.maxY], dist: +dist.toFixed(3), aimY: +aimY.toFixed(3) });
          if (!b) break;
          const bh = b.maxY - b.minY + 1;
          const bw = b.maxX - b.minX + 1;
          const clipped = b.minY <= 1 || b.maxY >= S.H - 2 || b.minX <= 1 || b.maxX >= S.W - 2;
          if (clipped) { dist *= 1.55; continue; }   // 还在画面外 → 继续退
          const worldPerPx = (2 * dist * Math.tan((cam.fov * Math.PI) / 360)) / S.H;
          const bcY = (b.minY + b.maxY) / 2;
          const bcX = (b.minX + b.maxX) / 2;
          aimY -= (bcY - S.H / 2) * worldPerPx;           // 把包围盒中心挪到画面中心
          aimX += (bcX - S.W / 2) * worldPerPx;           // ⚠️ 第 52 块修正：原写成「-=」，非对称模型（翅膀/尾巴）会越修越偏出画面
          const fitY = bh / (S.H * 0.84);
          const fitX = bw / (S.W * 0.90);
          const fit = Math.max(fitY, fitX);
          if (Math.abs(fit - 1) < 0.03) { done = true; break; }   // 收敛
          dist *= fit;
        }
        const url = S.cv.toDataURL('image/webp', 0.92);
        scene.remove(g);
        window.__cxDbg = dbg;
        return url;
      })()`);
      const buf = Buffer.from(url.split(',')[1], 'base64');
      fs.writeFileSync(path.join(OUT, type + '.webp'), buf);
      console.log('写出', type + '.webp', (buf.length / 1024).toFixed(1) + 'KB');
      if (type === setup[0]) console.log('  取景诊断:', JSON.stringify(await ev('window.__cxDbg')));
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
