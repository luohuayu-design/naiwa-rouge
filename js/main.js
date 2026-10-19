// ============================================================
// main.js —— 蛙步 · 夜行（肉鸽原型 第 1 块：角色 + 摇杆 + 可行走场景）
//
// 这一版只做「移动手感」：没有敌人、没有攻击、没有升级。
// 目标是把三件事调顺：摇杆输入 → 角色速度/朝向 → 相机跟随。
// 后续叠战斗时，只需要在 tick() 里加敌人更新与自动攻击，不用动输入层。
// ============================================================
import * as THREE from 'three';
import { buildNightScene } from './scene.js';
import { loadFrog, buildFallbackFrog, MODEL_YAW } from './frog.js';
import { createInput } from './input.js';

// ---------------- 可调参数 ----------------
const ARENA_R = 15;          // 可走半径（石头圈在 15.55）
const BODY_R = 0.65;         // 角色自身半径（贴边留一点余量）
const MOVE_SPEED = 4.4;      // 最大移动速度（世界单位/秒）
const ACCEL = 14;            // 速度趋近系数，越大越「跟手」
const TURN_SPEED = 13;       // 转身角速度系数
const CAM_OFFSET = new THREE.Vector3(0, 10.6, 9.2);
const CAM_LERP = 7;

// ---------------- 渲染器 ----------------
const app = document.getElementById('app');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
} catch (err) {
  document.getElementById('ldTxt').textContent = '当前浏览器不支持 WebGL';
  throw err;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.22;
app.appendChild(renderer.domElement);

// ---------------- 场景与相机 ----------------
const { scene, update: updateScene } = buildNightScene({ arenaRadius: ARENA_R });

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 220);
const camOffset = CAM_OFFSET.clone();

function applyViewport() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  // 竖屏时把相机往后拉，否则角色会顶满屏幕
  const k = camera.aspect < 1 ? 1.0 + (1 - camera.aspect) * 0.55 : 1;
  camOffset.copy(CAM_OFFSET).multiplyScalar(k);
  camera.updateProjectionMatrix();
}
applyViewport();
window.addEventListener('resize', applyViewport);
window.addEventListener('orientationchange', () => setTimeout(applyViewport, 120));

camera.position.copy(camOffset);
camera.lookAt(0, 0.95, 0);

// ---------------- 角色 ----------------
const loadingEl = document.getElementById('loading');
const ldBar = document.getElementById('ldBar');
const ldTxt = document.getElementById('ldTxt');

function setProgress(p) {
  const pct = Math.max(0, Math.min(1, p || 0));
  ldBar.style.width = (pct * 100).toFixed(0) + '%';
  ldTxt.textContent = (pct * 100).toFixed(0) + '%';
}

let frog;
let loadFailed = false;
try {
  frog = await loadFrog('assets/rigged.glb', setProgress);
} catch (err) {
  console.warn('[奶蛙] 模型加载失败，改用几何体占位：', err);
  loadFailed = true;
  frog = buildFallbackFrog();
  const warn = document.createElement('div');
  warn.className = 'ld-err on';
  warn.textContent = '模型加载失败，已用简化角色占位（检查 assets/rigged.glb 是否可访问）';
  loadingEl.querySelector('.ld-box').appendChild(warn);
  ldTxt.textContent = '降级运行';
}
scene.add(frog.root);

// 落点：场地中心，面朝相机
const pos = new THREE.Vector3(0, 0, 0);
const vel = new THREE.Vector3(0, 0, 0);
let yaw = 0;
frog.root.position.copy(pos);
frog.yaw.rotation.y = yaw + MODEL_YAW;

// ---------------- 输入 ----------------
const input = createInput(
  document.getElementById('touchLayer'),
  document.getElementById('stick')
);

// ---------------- HUD ----------------
const statsEl = document.getElementById('stats');
const hintEl = document.getElementById('hint');
let hintDone = false;

// ---------------- 主循环 ----------------
const clock = new THREE.Clock();
let fps = 60, frames = 0, acc = 0, hudAcc = 0;

function lerpAngle(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function tick() {
  requestAnimationFrame(tick);

  const dt = Math.min(0.05, clock.getDelta());
  const t = clock.elapsedTime;

  // 1) 输入 → 目标速度（屏幕 y 向下 = 世界 +Z，相机在 +Z 方向看向场景）
  const dir = input.read();
  const targetVX = dir.x * MOVE_SPEED;
  const targetVZ = dir.y * MOVE_SPEED;
  const k = 1 - Math.exp(-ACCEL * dt);
  vel.x += (targetVX - vel.x) * k;
  vel.z += (targetVZ - vel.z) * k;

  // 2) 位移 + 边界约束（圆形场地，撞边只丢掉向外那部分速度）
  pos.x += vel.x * dt;
  pos.z += vel.z * dt;

  const limit = ARENA_R - BODY_R;
  const dist = Math.hypot(pos.x, pos.z);
  if (dist > limit) {
    const nx = pos.x / dist, nz = pos.z / dist;
    pos.x = nx * limit;
    pos.z = nz * limit;
    const outward = vel.x * nx + vel.z * nz;
    if (outward > 0) {
      vel.x -= nx * outward;
      vel.z -= nz * outward;
    }
  }

  // 3) 朝向：只在真的在走的时候转身，停下保持原朝向
  const speed = Math.hypot(vel.x, vel.z);
  const speed01 = Math.min(1, speed / MOVE_SPEED);
  if (speed > 0.35) {
    const targetYaw = Math.atan2(vel.x, vel.z);
    yaw = lerpAngle(yaw, targetYaw, 1 - Math.exp(-TURN_SPEED * dt));
  }

  frog.root.position.copy(pos);
  frog.yaw.rotation.y = yaw + MODEL_YAW;
  frog.update(dt, speed01);

  // 4) 相机：位置缓动跟随，注视点略微超前于角色
  const leadX = pos.x + vel.x * 0.22;
  const leadZ = pos.z + vel.z * 0.22;
  const desiredX = pos.x + camOffset.x;
  const desiredY = camOffset.y;
  const desiredZ = pos.z + camOffset.z;
  const ck = 1 - Math.exp(-CAM_LERP * dt);
  camera.position.x += (desiredX - camera.position.x) * ck;
  camera.position.y += (desiredY - camera.position.y) * ck;
  camera.position.z += (desiredZ - camera.position.z) * ck;
  camera.lookAt(leadX, 0.95, leadZ);

  // 5) 小鸟小虫 + 渲染
  updateScene(dt);
  renderer.render(scene, camera);

  // 6) HUD（每 0.25 秒刷一次，别每帧动 DOM）
  frames++;
  acc += dt;
  hudAcc += dt;
  if (acc >= 0.5) {
    fps = frames / acc;
    frames = 0; acc = 0;
  }
  if (hudAcc >= 0.25) {
    hudAcc = 0;
    statsEl.textContent =
      `FPS ${fps.toFixed(0)}   速度 ${speed.toFixed(2)}\n` +
      `坐标 ${pos.x.toFixed(1)}, ${pos.z.toFixed(1)}   朝向 ${(yaw * 180 / Math.PI).toFixed(0)}°`;
  }

  // 第一次真的走起来就把提示淡掉
  if (!hintDone && speed01 > 0.15) {
    hintDone = true;
    hintEl.classList.add('off');
  }
}

// 加载完成 → 淡出遮罩 → 开跑（降级时多停一会儿，让警告能被看到）
setProgress(1);
clock.start();
tick();
setTimeout(() => {
  loadingEl.classList.add('off');
  setTimeout(() => { loadingEl.style.display = 'none'; }, 500);
}, loadFailed ? 2200 : 60);

// 5 秒后不管有没有动，提示都淡掉，避免挡视线
setTimeout(() => hintEl.classList.add('off'), 5200);
