// ============================================================
// statView.js —— 主菜单「属性」页的 3D 奶蛙展示（第 50 块）
//
// 一个独立的小渲染器，与游戏场景完全隔离：
//   · 复用 frog.js 的 loadFrog（同一个 rigged.glb，浏览器缓存只下一次）；
//   · 拖动可以旋转（松手慢慢转回正面附近）；
//   · 待机呼吸 + 每隔几秒原地蹦一下（update(dt, 1) 走路步态），偶尔拍一下手（playAttack）。
// 只在属性页开着时被 main.js 每帧驱动，关页即停，不占主循环。
// ============================================================
import * as THREE from '../lib/three.module.js?v=116';
import { loadFrog } from './frog.js?v=116';
import { withV } from './assetUrl.js?v=116';   // 第 80 块：和 main.js 用同一个带版本的 URL，浏览器只下一次

export function createStatView(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 50);
  camera.position.set(0, 2.35, 5.1);
  camera.lookAt(0, 1.02, 0);

  // 灯光：冷月光 + 一盏暖补光（和主菜单夜色一个味）
  scene.add(new THREE.HemisphereLight(0xbfe8ff, 0x1c2a20, 0.9));
  const moon = new THREE.DirectionalLight(0xcfe8ff, 1.5);
  moon.position.set(2.5, 5, 3);
  scene.add(moon);
  const warm = new THREE.DirectionalLight(0xffd98a, 0.5);
  warm.position.set(-3, 1.6, -2.5);
  scene.add(warm);

  // 一块圆形展示台
  const disc = new THREE.Mesh(
    new THREE.CylinderGeometry(1.55, 1.62, 0.14, 40),
    new THREE.MeshStandardMaterial({ color: 0x14271f, roughness: 0.9 }),
  );
  disc.position.y = -0.07;
  scene.add(disc);
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(1.55, 0.025, 8, 48),
    new THREE.MeshBasicMaterial({ color: 0x7eebc4, transparent: true, opacity: 0.5 }),
  );
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.012;
  scene.add(rim);

  let frog = null;
  let loadErr = false;
  let targetYaw = 0;      // 拖拽目标朝向
  let hopT = 0;           // >0 = 原地蹦跶中（走步态）
  let nextHop = 2.5;      // 距离下一次蹦跶
  let nextAtk = 9;        // 偶尔拍一下手
  let t = 0;

  async function load() {
    if (frog || loadErr) return;
    try {
      frog = await loadFrog(withV('assets/rigged.glb'));
    } catch (err) {
      console.warn('[属性页] 奶蛙模型加载失败，用占位：', err);
      import('./frog.js?v=116').then((m) => { frog = m.buildFallbackFrog(); }).catch(() => { loadErr = true; });
      loadErr = true;   // 先标记，兜底异步到了再覆盖 frog
      return;
    }
    frog.root.position.set(0, 0, 0);
    scene.add(frog.root);
  }

  // 拖动旋转：pointer 拖多少转多少，松手后慢慢回正
  let dragging = false;
  let lastX = 0;
  canvas.addEventListener('pointerdown', (e) => {
    dragging = true; lastX = e.clientX;
    try { canvas.setPointerCapture?.(e.pointerId); } catch (_) { /* 合成事件没有真实 pointerId，忽略 */ }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    targetYaw += (e.clientX - lastX) * 0.012;
    lastX = e.clientX;
  });
  const stop = () => { dragging = false; };
  canvas.addEventListener('pointerup', stop);
  canvas.addEventListener('pointercancel', stop);
  canvas.addEventListener('pointerleave', stop);

  function resize() {
    const w = canvas.clientWidth || canvas.parentElement?.clientWidth || 300;
    const h = canvas.clientHeight || 260;
    const s = Math.min(2, window.devicePixelRatio || 1);
    const need = `${Math.round(w * s)}x${Math.round(h * s)}`;
    if (renderer.domElement.width !== Math.round(w * s)) {
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
  }

  function update(dt) {
    t += dt;
    if (!frog) return;
    // 待机 → 每隔几秒蹦跶 0.9 秒 / 拍一下手
    if (hopT > 0) {
      hopT -= dt;
    } else {
      nextHop -= dt;
      if (nextHop <= 0) { hopT = 0.9; nextHop = 3.2 + Math.random() * 3; }
    }
    nextAtk -= dt;
    if (nextAtk <= 0) { frog.playAttack?.(); nextAtk = 8 + Math.random() * 6; }
    // 松手后朝向慢慢滑回正面
    if (!dragging) targetYaw *= Math.pow(0.25, dt);
    frog.yaw.rotation.y = targetYaw;
    frog.update(dt, hopT > 0 ? 1 : 0);
    // 展示台微微发亮呼吸
    rim.material.opacity = 0.4 + 0.15 * (0.5 + 0.5 * Math.sin(t * 2));
    renderer.render(scene, camera);
  }

  function dispose() {
    renderer.dispose();
  }

  return { load, update, resize, dispose, get ready() { return !!frog; }, get yawAngle() { return frog ? frog.yaw.rotation.y : 0; } };
}
