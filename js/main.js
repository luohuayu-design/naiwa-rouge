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
import { createStats, STAT_DEFS } from './stats.js';

// ---------------- 可调参数 ----------------
const ARENA_R = 15;          // 可走半径（石头圈在 15.55）
const BODY_R = 0.65;         // 角色自身半径（贴边留一点余量）
const ACCEL = 14;            // 速度趋近系数，越大越「跟手」
const TURN_SPEED = 13;       // 转身角速度系数
const CAM_OFFSET = new THREE.Vector3(0, 10.6, 9.2);
const CAM_LERP = 7;
// 移动速度不在这里调了 —— 见 stats.js 的 STAT_DEFS 里 moveSpeed（属性面板实时生效）

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
renderer.toneMappingExposure = 1.38;
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

// ---------------- 属性 ----------------
const stats = createStats();

// ---------------- HUD ----------------
const dbgEl = document.getElementById('stats');
const hintEl = document.getElementById('hint');
const hpCard = document.getElementById('hpCard');
const hpCurEl = document.getElementById('hpCur');
const hpMaxEl = document.getElementById('hpMax');
const hpFillEl = document.getElementById('hpFill');
const hpBarEl = hpFillEl.parentElement;
const hudKeyEl = document.getElementById('hudKey');
const apPanel = document.getElementById('attrPanel');
const apList = document.getElementById('apList');
const apSub = document.getElementById('apSub');
let hintDone = false;

// 关键属性（生命走血条，这里放三个最常看的）
const KEY_STATS = ['moveSpeed', 'armor', 'critRate'];

function renderHud() {
  const maxHp = stats.get('maxHp');
  const cur = stats.hp.cur;
  const ratio = maxHp > 0 ? Math.max(0, Math.min(1, cur / maxHp)) : 0;

  hpCurEl.textContent = Math.ceil(cur);
  hpMaxEl.textContent = Math.round(maxHp);
  hpFillEl.style.width = (ratio * 100).toFixed(1) + '%';
  hpBarEl.classList.toggle('low', ratio <= 0.25);
  hpBarEl.classList.toggle('mid', ratio > 0.25 && ratio <= 0.5);

  hudKeyEl.textContent = '';
  for (const key of KEY_STATS) {
    const def = STAT_DEFS.find((d) => d.key === key);
    if (!def) continue;
    const wrap = document.createElement('span');
    const label = document.createElement('i');
    label.textContent = def.name;
    const val = document.createElement('b');
    val.textContent = def.fmt(stats.get(key));
    wrap.append(label, val);
    hudKeyEl.appendChild(wrap);
  }
}

// 属性面板：每次打开时重建，数值永远是最新的
function renderPanel() {
  apSub.textContent = `生命 ${Math.ceil(stats.hp.cur)} / ${Math.round(stats.get('maxHp'))} · 共 ${STAT_DEFS.length} 项`;
  apList.textContent = '';
  for (const def of STAT_DEFS) {
    const row = document.createElement('div');
    row.className = 'ap-row';
    const name = document.createElement('div');
    name.className = 'ap-name';
    name.textContent = def.name;
    const val = document.createElement('div');
    val.className = 'ap-val';
    val.textContent = def.fmt(stats.get(def.key));
    const desc = document.createElement('div');
    desc.className = 'ap-desc';
    desc.textContent = def.desc;
    row.append(name, val, desc);
    apList.appendChild(row);
  }
}

let panelOpen = false;
function setPanel(open) {
  panelOpen = open;
  if (open) {
    input.joystick.release();   // 面板盖住屏幕，别让摇杆一直输出
    renderPanel();
    apPanel.classList.add('on');
    apPanel.setAttribute('aria-hidden', 'false');
  } else {
    apPanel.classList.remove('on');
    apPanel.setAttribute('aria-hidden', 'true');
  }
}

hpCard.addEventListener('click', () => setPanel(!panelOpen));
document.getElementById('apClose').addEventListener('click', () => setPanel(false));
apPanel.addEventListener('click', (e) => {
  // 点卡片外的遮罩区域关闭
  if (e.target === apPanel) setPanel(false);
});
addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && panelOpen) setPanel(false);
});

renderHud();

// 调试钩子：只有 ?debug=1 才挂到 window，方便自动化测试读内部状态（正常游玩不暴露）
if (new URLSearchParams(location.search).has('debug')) {
  window.__game = { stats, pos, vel, input, getYaw: () => yaw };
}

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
  //    移速取属性面板里的实时值：升级加成就立刻跑得更快
  const moveSpeed = stats.get('moveSpeed');
  const dir = input.read();
  const targetVX = dir.x * moveSpeed;
  const targetVZ = dir.y * moveSpeed;
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
  const speed01 = Math.min(1, speed / Math.max(0.01, moveSpeed));
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

  // 5) 生命回复（满血时不溢出；受伤后自动慢慢回）
  if (stats.hp.cur < stats.get('maxHp')) stats.heal(stats.get('hpRegen') * dt);

  // 6) 小鸟小虫 + 渲染
  updateScene(dt);
  renderer.render(scene, camera);

  // 7) HUD（每 0.25 秒刷一次，别每帧动 DOM）
  frames++;
  acc += dt;
  hudAcc += dt;
  if (acc >= 0.5) {
    fps = frames / acc;
    frames = 0; acc = 0;
  }
  if (hudAcc >= 0.25) {
    hudAcc = 0;
    renderHud();
    // yaw 内部是累加值（转身插值会跨 ±180° 继续加减），显示前规范到 0~360
    const deg = ((yaw * 180 / Math.PI) % 360 + 360) % 360;
    dbgEl.textContent =
      `FPS ${fps.toFixed(0)}   速度 ${speed.toFixed(2)}\n` +
      `坐标 ${pos.x.toFixed(1)}, ${pos.z.toFixed(1)}   朝向 ${deg.toFixed(0)}°`;
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
