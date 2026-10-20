// ============================================================
// gold.js —— 金币系统
//
// 规则（用户定案）：
//   · 打死怪物**有一定概率**掉金币（不是必然），概率是属性 goldRate；
//   · **不需要拾取**：金币在地上弹一下，0.5 秒后自动消失并计入数据；
//   · 金币是本局货币，商店（见 shop.js）里花。
//
// 视觉：一枚金色小圆片从怪死掉的位置弹起 → 自转 → 落地缩没；
//       消失瞬间记入金币数（金币计数在 main.js，通过 onGold 回调）。
// ============================================================
import * as THREE from '../lib/three.module.js';

const LIFE = 0.5;            // 金币从掉落到计入数据的时长（用户定案 0.5 秒）
const POP_V = 2.6;           // 弹起的初速度
const GRAVITY = 9.8;

export function createGoldSystem({ scene, fx, stats, onGold }) {
  const coins = [];          // 场上正在「等待消失」的金币：{ mesh, x, z, t }
  let geo = null, mat = null;

  function assets() {
    if (geo) return;
    geo = new THREE.CylinderGeometry(0.17, 0.17, 0.05, 14);
    mat = new THREE.MeshStandardMaterial({
      color: 0xffd166, emissive: 0xffa726, emissiveIntensity: 0.85,
      roughness: 0.3, metalness: 0.6,
    });
  }

  // 怪死掉时调用：按 goldRate 掷骰，中了就掉一枚
  function maybeDrop(pos) {
    const rate = Math.min(1, Math.max(0, stats.get('goldRate')));
    if (Math.random() >= rate) return false;
    spawn(pos);
    return true;
  }

  function spawn(pos) {
    assets();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(pos.x, 0.35, pos.z);
    mesh.rotation.set(Math.random() * 0.6, Math.random() * Math.PI * 2, Math.random() * 0.6);
    scene.add(mesh);
    coins.push({ mesh, x: pos.x, z: pos.z, t: 0 });
    return true;
  }

  function update(dt) {
    for (let i = coins.length - 1; i >= 0; i--) {
      const c = coins[i];
      c.t += dt;
      if (c.t >= LIFE) {
        // 消失 = 计入数据：金币数 +1，再给一点金色碎屑反馈
        scene.remove(c.mesh);
        coins.splice(i, 1);
        if (onGold) onGold(1);
        if (fx) {
          fx.burst({ x: c.x, z: c.z }, { color: 0xffd166, count: 7, speed: 2.2, life: 0.35, size: 0.1, y: 0.4, up: 2.2, gravity: 5 });
          fx.ring({ x: c.x, z: c.z }, { from: 0.1, to: 0.55, color: 0xffd166, life: 0.3, opacity: 0.6, y: 0.05 });
        }
        continue;
      }
      // 弹跳：初速向上 + 重力，落地贴地滑行
      const y = 0.35 + POP_V * c.t - 0.5 * GRAVITY * c.t * c.t;
      c.mesh.position.y = Math.max(0.08, y);
      c.mesh.rotation.y += dt * 7;
      // 最后 0.15 秒缩小消失
      const k = c.t / LIFE;
      if (k > 0.7) c.mesh.scale.setScalar(Math.max(0.05, 1 - (k - 0.7) / 0.3));
    }
  }

  function setVisible(v) {
    for (const c of coins) c.mesh.visible = v;
  }

  function reset() {
    for (const c of coins) scene.remove(c.mesh);
    coins.length = 0;
  }

  return { maybeDrop, spawn, update, setVisible, reset, count: () => coins.length };
}
