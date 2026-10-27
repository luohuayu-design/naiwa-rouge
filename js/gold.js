// ============================================================
// gold.js —— 金币系统
//
// 规则（用户定案）：
//   · 打死怪物**有一定概率**掉金币（不是必然），概率是属性 goldRate；
//   · **落入攻击范围内立刻吸走**（第 23 块按用户要求：脚下那圈就是拾取范围，
//     不用专门走过去踩）—— 金币先弹一下，进圈后 0.15 秒飞向奶蛙再入账；
//   · 圈外的金币**停 3 秒**后自动消失并计入数据 —— 留得久是为了让
//     「打怪掉钱」看得见，也保证远处漏掉的钱不会白白消失；
//   · 金币是本局货币，商店（见 shop.js）里花。
//
// 视觉：一枚金色小圆片从怪死掉的位置弹起 → 自转 → 进圈被吸走 / 落地缩没；
//       入账瞬间记入金币数（金币计数在 main.js，通过 onGold 回调）。
// ============================================================
import * as THREE from '../lib/three.module.js?v=106';

const LIFE = 3.0;            // 圈外金币从掉落到计入数据的时长（第 12 块：0.5 → 3 秒）
const POP_V = 2.6;           // 弹起的初速度
const GRAVITY = 9.8;
const PULL_TIME = 0.15;      // 进圈后飞向奶蛙的时间（再短就看不清，再长会拖节奏）

export function createGoldSystem({ scene, fx, stats, onGold }) {
  const coins = [];          // 场上正在「等待消失」的金币：{ mesh, x, z, t, pull }
  let geo = null, mat = null;

  function assets() {
    if (geo) return;
    geo = new THREE.CylinderGeometry(0.17, 0.17, 0.05, 14);
    mat = new THREE.MeshStandardMaterial({
      color: 0xffd166, emissive: 0xffa726, emissiveIntensity: 0.85,
      roughness: 0.3, metalness: 0.6,
    });
  }

  // 怪死掉时调用：按 goldRate 掷骰，中了就掉一枚。
  // 第 22 块：rng 可注入（种子局用它保证「同一颗种子掉钱的位置也一样」）；
  // 不传就是 Math.random，老调用完全不变。
  function maybeDrop(pos, rng = Math.random) {
    const rate = Math.min(1, Math.max(0, stats.get('goldRate')));
    if (rng() >= rate) return false;
    spawn(pos);
    return true;
  }

  function spawn(pos) {
    assets();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(pos.x, 0.35, pos.z);
    mesh.rotation.set(Math.random() * 0.6, Math.random() * Math.PI * 2, Math.random() * 0.6);
    scene.add(mesh);
    coins.push({ mesh, x: pos.x, z: pos.z, t: 0, pull: -1 });
    return true;
  }

  // 入账：金币数 +1，再给一点金色碎屑反馈
  function collect(c, i) {
    scene.remove(c.mesh);
    coins.splice(i, 1);
    if (onGold) onGold(1);
    if (fx) {
      fx.burst({ x: c.mesh.position.x, z: c.mesh.position.z },
        { color: 0xffd166, count: 7, speed: 2.2, life: 0.35, size: 0.1, y: 0.4, up: 2.2, gravity: 5 });
      fx.ring({ x: c.mesh.position.x, z: c.mesh.position.z },
        { from: 0.1, to: 0.55, color: 0xffd166, life: 0.3, opacity: 0.6, y: 0.05 });
    }
  }

  // player / range 由主循环每帧传进来（攻击范围环的半径就是拾取半径）。
  // 不传就是老行为：只能等 3 秒自动入账。
  function update(dt, player = null, range = 0) {
    for (let i = coins.length - 1; i >= 0; i--) {
      const c = coins[i];
      c.t += dt;

      // ---- 已被吸住：飞向奶蛙，到了就入账（不看 LIFE，免得飞一半消失）----
      if (c.pull >= 0) {
        c.pull += dt;
        const k = 1 - Math.exp(-18 * dt);
        if (player) {
          c.mesh.position.x += (player.x - c.mesh.position.x) * k;
          c.mesh.position.z += (player.z - c.mesh.position.z) * k;
        }
        c.mesh.position.y += (0.62 - c.mesh.position.y) * k;
        c.mesh.rotation.y += dt * 12;
        const s = Math.max(0.35, 1 - c.pull / PULL_TIME * 0.65);
        c.mesh.scale.setScalar(s);
        if (c.pull >= PULL_TIME) collect(c, i);
        continue;
      }

      // ---- 进圈：起吸 ----
      if (player && range > 0
        && Math.hypot(player.x - c.mesh.position.x, player.z - c.mesh.position.z) <= range) {
        c.pull = 0;
        continue;
      }

      if (c.t >= LIFE) {
        collect(c, i);
        continue;
      }
      // 弹跳：初速向上 + 重力，落地之后原地轻轻浮动（3 秒太长，静止会让人以为卡住）
      const y = 0.35 + POP_V * c.t - 0.5 * GRAVITY * c.t * c.t;
      c.mesh.position.y = y > 0.09 ? y : 0.09 + Math.sin(c.t * 5.5) * 0.045;
      c.mesh.rotation.y += dt * (y > 0.09 ? 7 : 3.4);
      // 最后 0.25 秒缩小消失
      const k = c.t / LIFE;
      if (k > (LIFE - 0.25) / LIFE) {
        c.mesh.scale.setScalar(Math.max(0.05, (LIFE - c.t) / 0.25));
      }
    }
  }

  // 结算前把地上的钱全部入账 —— 「没用完的金币」不该包括还躺在地上的那些
  function flush() {
    const n = coins.length;
    for (const c of coins) scene.remove(c.mesh);
    coins.length = 0;
    if (n > 0 && onGold) onGold(n);
    return n;
  }

  function setVisible(v) {
    for (const c of coins) c.mesh.visible = v;
  }

  function reset() {
    for (const c of coins) scene.remove(c.mesh);
    coins.length = 0;
  }

  return { maybeDrop, spawn, update, flush, setVisible, reset, count: () => coins.length };
}
