// ============================================================
// weapon.js —— 武器系统（第 1 件：环剑「三连剑阵」）
//
// 玩法（用户定案）：
//   · 第 5 回合打完自动获得。三把剑环绕主角旋转，各有自己的判定。
//   · 剑碰到怪物 → 造成伤害并消失（少一把）；
//   · 被消耗的剑每 swordRegen 秒恢复一把，上限 swordMax（初始 3）。
//   · 技能「万剑齐发」：把环上所有剑沿各自朝向四周射出，
//     命中怪物造成伤害后消失；没有冷却，有剑就能放。
//
// 数值全部走 stats（swordPower / swordMax / swordOrbit / swordRegen），
// 升级改属性立刻生效；伤害 = 主角 rollDamage × swordPower（可暴击、吃防御减伤）。
//
// 模型：Kenney《Mini Dungeon》weapon-sword.glb（CC0），刃口朝 +Y，
//       9KB；贴图 Textures/colormap.png 与 glb 的相对引用保持原目录结构。
//       加载失败时用双盒拼一把占位剑，玩法不受影响。
// ============================================================
import * as THREE from '../lib/three.module.js';
import { GLTFLoader } from '../lib/jsm/loaders/GLTFLoader.js';

// 轨道半径（世界单位）：贴着主角攻击范围环内侧转，视觉上「护体剑气」
const ORBIT_R = 1.7;
const SWORD_LEN = 1.25;        // 剑的世界长度（模型原始 ~0.45）
const SWORD_TILT = 0.62;       // 剑刃上翘角（弧度，≈35°）：顶视角下平躺的剑只剩一条线，翘起来才看得见
const SWORD_HIT_R = 0.55;      // 剑刃判定半径（再加怪的碰撞半径）
const FLY_SPEED = 15;          // 射出的飞行速度
const FLY_MAX_DIST = 30;       // 飞行最大距离（出场地就散掉）
const FLY_Y = 0.85;            // 飞行/环绕高度
const HIT_Y = 0.8;             // 判定高度基准（怪都是贴地的，只算水平面）

export function createWeaponSystem({ scene, stats, fx, enemies }) {
  let granted = false;         // 是否已获得（第 5 回合 grant）
  let count = 0;               // 环上的剑数
  let regenT = 0;              // 恢复计时器（攒够 swordRegen 秒长一把）
  let orbitAngle = Math.random() * Math.PI * 2;
  let t = 0;                   // 总时间（浮动动画用）

  const pool = [];             // 空闲剑（holder Group，含模型）
  const orbiting = [];         // 环上的剑：{ holder, spawnT }
  const flyers = [];           // 射出去的剑：{ holder, a, dist, spin }
  let template = null;         // 克隆源（THREE.Group）
  const disposables = [];      // 兜底几何/材质，reset 时释放

  // ---------------- 兜底剑（加载失败时） ----------------
  function buildFallbackSword() {
    const g = new THREE.Group();
    const bladeMat = new THREE.MeshLambertMaterial({ color: 0xdfe9ef });
    const hiltMat = new THREE.MeshLambertMaterial({ color: 0x8a6a3f });
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.8, 0.03), bladeMat);
    blade.position.y = 0.5;
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.07, 0.08), hiltMat);
    guard.position.y = 0.1;
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.22, 0.07), hiltMat);
    grip.position.y = -0.05;
    g.add(blade, guard, grip);
    disposables.push(bladeMat, hiltMat, blade.geometry, guard.geometry, grip.geometry);
    return g;
  }

  // ---------------- 加载 ----------------
  async function preload() {
    try {
      const gltf = await new GLTFLoader().loadAsync('assets/weapons/weapon-sword.glb');
      template = gltf.scene;
      // 统一材质：加一点自发光，深夜场景里剑刃能看清
      template.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = false;
        o.frustumCulled = false;
        const m = o.material;
        if (m && 'emissive' in m) { m.emissive = new THREE.Color(0x6fe8d0); m.emissiveIntensity = 0.85; }
      });
    } catch (err) {
      console.warn('[武器] 剑模型加载失败，用几何体占位：', err);
      template = buildFallbackSword();
    }
    // 归一化：模型长度 → SWORD_LEN；模型刃口朝 +Y，几何中心不在原点，摆正到握把处
    const box = new THREE.Box3().setFromObject(template);
    const len = Math.max(0.01, box.max.y - box.min.y);
    const s = SWORD_LEN / len;
    template.scale.setScalar(s);
    template.position.y = -box.min.y * s;   // 握把底端贴着 holder 原点
  }

  function acquire() {
    if (pool.length) {
      const h = pool.pop();
      h.visible = true;
      return h;
    }
    const holder = new THREE.Group();
    const model = template.clone(true);
    // 刃口 +Y → 转到 +X 再上翘 SWORD_TILT（顶视角下平躺的剑只有一条线）
    model.rotation.z = -Math.PI / 2 + SWORD_TILT;
    holder.add(model);
    scene.add(holder);
    return holder;
  }

  function release(holder) {
    holder.visible = false;
    holder.scale.setScalar(1);
    pool.push(holder);
  }

  // ---------------- 获得（第 5 回合） ----------------
  function grant() {
    if (granted) return;
    granted = true;
    count = Math.min(Math.round(stats.get('swordMax')), 3);
    regenT = 0;
    for (let i = 0; i < count; i++) orbiting.push({ holder: acquire(), spawnT: t });
    if (fx) fx.ring({ x: 0, z: 0 }, { from: 0.4, to: ORBIT_R + 0.6, color: 0x9fe8ff, life: 0.6, opacity: 0.8, y: 0.06 });
  }

  // ---------------- 技能：万剑齐发 ----------------
  // 剑沿各自当前的外侧方向射出（环上均匀分布 → 天然散开一圈）。
  // 没有冷却：有剑就能放，放完 count = 0 等恢复。
  function fire(getPlayerPos) {
    if (!granted || count === 0) return false;
    const p = getPlayerPos();
    // 剑沿各自当前的外侧方向射出：环上均匀分布 → 天然散开一圈。
    // 原点记发射瞬间的位置，之后与主角移动无关。
    const n = orbiting.length;
    for (let i = 0; i < n; i++) {
      const a = orbitAngle + (i * Math.PI * 2) / Math.max(1, n);
      flyers.push({ holder: orbiting[i].holder, a, ox: p.x, oz: p.z, dist: 0, spin: -a });
    }
    orbiting.length = 0;
    count = 0;
    regenT = 0;
    if (fx) {
      fx.ring(p, { from: 0.3, to: ORBIT_R + 1.2, color: 0x9fe8ff, life: 0.4, opacity: 0.9, y: 0.07 });
      fx.burst(p, { color: 0xbff2ff, count: 18, speed: 5.5, life: 0.5, size: 0.14, y: FLY_Y, up: 1.2, gravity: 3 });
    }
    return true;
  }

  // ---------------- 命中判定与伤害 ----------------
  const _tmp = new THREE.Vector3();

  function aliveEnemies() {
    return enemies.list.filter((e) => e.state !== 'dead' && e.state !== 'spawn');
  }

  function hitEnemy(e, at) {
    const roll = stats.rollDamage({ targetArmor: e.cfg.armor });
    const dmg = roll.damage * stats.get('swordPower');
    enemies.takeDamage(e, dmg, roll.crit);
    // 吸血与近战同规则
    const ls = stats.get('lifesteal');
    if (ls > 0 && dmg > 0) stats.heal(dmg * ls);
    if (fx) fx.hit(at, roll.crit ? 0xffe9a8 : 0xbff2ff);
    return dmg;
  }

  // 水平面剑-怪判定（剑在半空，怪贴地，Y 不参与）
  function findHit(x, z, list) {
    for (const e of list) {
      const dx = e.pos.x - x, dz = e.pos.z - z;
      const r = SWORD_HIT_R + e.cfg.radius;
      if (dx * dx + dz * dz <= r * r) return e;
    }
    return null;
  }

  // ---------------- 每帧 ----------------
  function update(dt, { playerPos, onHudChange } = {}) {
    if (!granted) return;
    t += dt;

    const max = Math.round(stats.get('swordMax'));
    const list = aliveEnemies();
    const p = playerPos || { x: 0, z: 0 };

    // 1) 恢复：每 swordRegen 秒长一把（一次只长一把，攒着的从下一轮继续）
    if (count < max) {
      regenT += dt;
      const need = Math.max(0.2, stats.get('swordRegen'));
      while (regenT >= need && count < max) {
        regenT -= need;
        count++;
        orbiting.push({ holder: acquire(), spawnT: t });
        if (fx) fx.ring({ x: p.x, z: p.z }, { from: ORBIT_R * 0.4, to: ORBIT_R, color: 0x9fe8ff, life: 0.45, opacity: 0.7, y: 0.06 });
      }
      if (count >= max) regenT = 0;
      onHudChange?.();
    }

    // 2) 环上的剑：绕主角旋转 + 轻微上下浮动 + 碰怪即消耗
    orbitAngle += Math.PI * 2 * Math.max(0.05, stats.get('swordOrbit')) * dt;
    for (let i = orbiting.length - 1; i >= 0; i--) {
      const s = orbiting[i];
      const a = orbitAngle + (i * Math.PI * 2) / Math.max(1, orbiting.length);
      const x = p.x + Math.cos(a) * ORBIT_R;
      const z = p.z + Math.sin(a) * ORBIT_R;
      const h = s.holder;
      h.position.set(x, FLY_Y + Math.sin(t * 3 + i * 2.1) * 0.07, z);
      h.rotation.y = -a;
      // 刚长出来的剑 0.25 秒放大登场
      const age = t - s.spawnT;
      h.scale.setScalar(age < 0.25 ? 0.25 + 0.75 * (age / 0.25) : 1);

      const hit = findHit(x, z, list);
      if (hit) {
        hitEnemy(hit, _tmp.set(x, HIT_Y, z));
        release(h);
        orbiting.splice(i, 1);
        count = Math.max(0, count - 1);
        regenT = 0;                 // 被消耗后重新计时
        onHudChange?.();
      }
    }

    // 3) 飞出去的剑：从发射点直线飞行 + 自转，命中怪物造成伤害后消失，出界直接散掉
    for (let i = flyers.length - 1; i >= 0; i--) {
      const f = flyers[i];
      f.dist += FLY_SPEED * dt;
      f.spin += dt * 14;
      const x = f.ox + Math.cos(f.a) * f.dist;
      const z = f.oz + Math.sin(f.a) * f.dist;
      f.holder.position.set(x, FLY_Y, z);
      f.holder.rotation.y = f.spin;
      f.holder.scale.setScalar(1);

      const hit = findHit(x, z, list);
      const out = f.dist > FLY_MAX_DIST
        || Math.hypot(x, z) > 17.5;   // 场地半径 15 + 石圈，出界就没
      if (hit) {
        hitEnemy(hit, _tmp.set(x, HIT_Y, z));
        release(f.holder);
        flyers.splice(i, 1);
      } else if (out) {
        if (fx) fx.burst({ x, z }, { color: 0x9fd8e8, count: 6, speed: 1.6, life: 0.3, size: 0.09, y: FLY_Y, up: 0.8, gravity: 4 });
        release(f.holder);
        flyers.splice(i, 1);
      }
    }
  }

  // ---------------- 显示开关（结算后隐藏） ----------------
  function setVisible(v) {
    for (const s of orbiting) s.holder.visible = v;
    for (const f of flyers) f.holder.visible = v;
  }

  function reset() {
    for (const s of orbiting) release(s.holder);
    for (const f of flyers) release(f.holder);
    orbiting.length = 0;
    flyers.length = 0;
    count = 0;
    regenT = 0;
    granted = false;
  }

  return {
    preload, grant, fire, update, reset, setVisible,
    get granted() { return granted; },
    get count() { return count; },
    get max() { return Math.round(stats.get('swordMax')); },
    get orbitingCount() { return orbiting.length; },
    get flyingCount() { return flyers.length; },
    get orbitAngle() { return orbitAngle; },   // 调试/测试用
    // 技能栏恢复进度条：0（刚消耗）→ 1（下一把剑就绪）；满剑时恒为 0
    get regenProgress() {
      if (count >= Math.round(stats.get('swordMax'))) return 0;
      const need = Math.max(0.2, stats.get('swordRegen'));
      return Math.max(0, Math.min(1, regenT / need));
    },
  };
}
