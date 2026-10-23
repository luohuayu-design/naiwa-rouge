// 第 52 块：9 只新模型的「并排对比图」（验收用）
// 用 buildPreviewModel（和局内同一套打扮代码）把 9 只按同一把尺摆成一排，
// 正交相机拍摄 + 2D 叠字，输出 %TEMP%/naiwa-mob-lineup/lineup.png
// 跑法：先起 8124，再 `node .tmp-mob-lineup.js`
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9359;
const PAGE = 'http://127.0.0.1:8124/?debug=1&title';
const UD = path.join(os.tmpdir(), 'naiwa-cdp-moblineup');
const OUT = path.join(os.tmpdir(), 'naiwa-mob-lineup');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const V = '62';

// [type, 中文名] —— 三行 = 三个关卡
const ROWS = [
  [['hexer', '咒面图腾'], ['pyro', '焚火魔'], ['hierarch', '孢冠菌王']],
  [['charger', '冲锋蛮牛'], ['shielder', '盾斧兽人'], ['brood', '孢生菇']],
  [['wraith', '雾鬼'], ['leaper', '雾猎狼'], ['mender', '缝补小巫']],
];

(async () => {
  fs.rmSync(UD, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const chrome = spawn(CHROME, [
    '--headless=new', '--remote-debugging-port=' + PORT, '--num-raster-threads=2',
    '--enable-unsafe-swiftshader', '--no-first-run', '--no-default-browser-check',
    '--disable-dev-shm-usage', '--user-data-dir=' + UD, '--window-size=1200,780', 'about:blank',
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

    const url = await ev(`(async () => {
      const THREE = await import('/lib/three.module.js?v=${V}');
      const E = await import('/js/enemy.js?v=${V}');
      const W = 1200, H = 760;
      const cv = document.createElement('canvas');
      cv.width = W; cv.height = H;
      const rd = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: false });
      rd.setPixelRatio(1); rd.setSize(W, H, false);
      rd.setClearColor(0x101a18, 1);
      const scene = new THREE.Scene();
      scene.add(new THREE.HemisphereLight(0xcfe9ff, 0x1c2a20, 1.25));
      const key = new THREE.DirectionalLight(0xfff2d0, 1.9); key.position.set(3, 6, 6); scene.add(key);
      const rim = new THREE.DirectionalLight(0x7eebc4, 1.2); rim.position.set(-4, 3, -4); scene.add(rim);

      // 地面：一格 1 个世界单位的网格，方便眼量身高（主角 1.2 高）
      const grid = new THREE.GridHelper(16, 16, 0x2c4a44, 0x1e332e);
      grid.position.y = 0;
      scene.add(grid);

      const ROWS = ${JSON.stringify(ROWS)};
      const spot = (row, col) => ({ x: (col - 1) * 3.6, z: (row - 1) * 4.2 });

      for (let r = 0; r < ROWS.length; r++) {
        for (let c = 0; c < ROWS[r].length; c++) {
          const [type] = ROWS[r][c];
          const pv = await E.buildPreviewModel(type);
          if (!pv) continue;
          const { x, z } = spot(r, c);
          pv.model.position.set(x, pv.model.position.y, z);
          scene.add(pv.model);
          // 主角参照：每一行最左边放一只 1.15 高的方块当尺子
        }
      }
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 1.2, 0.5),
        new THREE.MeshStandardMaterial({ color: 0xffe9a8, roughness: .8 }),
      );
      box.position.set(-6.5, 0.6, 2.0);
      scene.add(box);

      const cam = new THREE.PerspectiveCamera(36, W / H, 0.1, 100);
      cam.position.set(0, 8.6, 15.5);
      cam.lookAt(0, 1.2, 0);
      rd.render(scene, cam);

      // 叠字：把 WebGL 画面画到 2D canvas 上，再按投影坐标写名字
      const out = document.createElement('canvas');
      out.width = W; out.height = H;
      const g = out.getContext('2d');
      g.drawImage(cv, 0, 0);
      g.font = '600 22px ui-sans-serif,"Microsoft YaHei",sans-serif';
      g.textAlign = 'center';
      const v = new THREE.Vector3();
      for (let r = 0; r < ROWS.length; r++) {
        for (let c = 0; c < ROWS[r].length; c++) {
          const [type, name] = ROWS[r][c];
          const { x, z } = spot(r, c);
          v.set(x, 0.02, z);
          v.project(cam);
          const sx = (v.x * 0.5 + 0.5) * W;
          const sy = (-v.y * 0.5 + 0.5) * H;
          g.fillStyle = 'rgba(6,16,14,0.72)';
          const tw = g.measureText(name).width + 20;
          g.fillRect(sx - tw / 2, sy - 6, tw, 34);
          g.fillStyle = '#bff5dd';
          g.fillText(name, sx, sy + 20);
        }
      }
      g.font = '600 20px ui-sans-serif,"Microsoft YaHei",sans-serif';
      g.fillStyle = '#ffd166';
      g.fillText('左侧黄块 = 1.2 高（主角身高）· 地面每格 1 个世界单位', W / 2, H - 24);

      // —— 特写：盾斧兽人（专验盾牌尺寸/朝向）——
      const C2 = 760;
      const cv2 = document.createElement('canvas');
      cv2.width = C2; cv2.height = C2;
      const rd2 = new THREE.WebGLRenderer({ canvas: cv2, antialias: true, alpha: false });
      rd2.setPixelRatio(1); rd2.setSize(C2, C2, false);
      rd2.setClearColor(0x101a18, 1);
      const sc2 = new THREE.Scene();
      sc2.add(new THREE.HemisphereLight(0xcfe9ff, 0x1c2a20, 1.25));
      const key2 = new THREE.DirectionalLight(0xfff2d0, 1.9); key2.position.set(3, 6, 6); sc2.add(key2);
      const rim2 = new THREE.DirectionalLight(0x7eebc4, 1.2); rim2.position.set(-4, 3, -4); sc2.add(rim2);
      sc2.add(new THREE.GridHelper(8, 8, 0x2c4a44, 0x1e332e));
      const pv2 = await E.buildPreviewModel('shielder');
      sc2.add(pv2.model);
      let shieldBox = null;
      pv2.model.traverse((o) => {
        if (o.userData && o.userData.boneMat && !shieldBox) {
          o.updateWorldMatrix(true, true);
          const b = new THREE.Box3().setFromObject(o);
          shieldBox = [+(b.max.x - b.min.x).toFixed(2), +(b.max.y - b.min.y).toFixed(2), +(b.max.z - b.min.z).toFixed(2)];
        }
      });
      const cam2 = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
      cam2.position.set(1.7, 2.0, 3.3);
      cam2.lookAt(0, 1.0, 0);
      rd2.render(sc2, cam2);
      const out2 = document.createElement('canvas');
      out2.width = C2; out2.height = C2;
      const g2x = out2.getContext('2d');
      g2x.drawImage(cv2, 0, 0);
      g2x.font = '600 20px ui-sans-serif,"Microsoft YaHei",sans-serif';
      g2x.textAlign = 'center';
      g2x.fillStyle = '#ffd166';
      g2x.fillText('盾斧兽人 · 盾牌世界包围盒 ' + (shieldBox ? shieldBox.join(' × ') : '未找到盾'), C2 / 2, C2 - 22);

      return { lineup: out.toDataURL('image/png'), orc: out2.toDataURL('image/png'), shieldBox };
    })()`);
    for (const [name, dataUrl] of [['lineup', url.lineup], ['orc-closeup', url.orc]]) {
      const buf = Buffer.from(dataUrl.split(',')[1], 'base64');
      const f = path.join(OUT, name + '.png');
      fs.writeFileSync(f, buf);
      console.log('写出', f, (buf.length / 1024).toFixed(0) + 'KB');
    }
    console.log('盾牌世界包围盒:', url.shieldBox);
  } catch (err) {
    console.error('ERR', err.message);
    process.exitCode = 1;
  } finally {
    try { ws && ws.close(); } catch (_) {}
    try { chrome.kill(); } catch (_) {}
    setTimeout(() => process.exit(process.exitCode || 0), 400);
  }
})();
