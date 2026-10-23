// ============================================================
// arrowRain.js —— 新武器「箭雨」（第 47 块）
//
// 用户定案：
//   · 没有像剑阵那样的普通攻击（不上环、不常驻），只有一个技能；
//   · 技能框显示 CD 冷却倒计时（合理时长）；
//   · 效果：自动在距离最近的怪物处设一个范围，一段时间后落下一次群箭，
//     对范围内怪物造成伤害。
//
// 解锁原则（用户定案）：第一关只允许出现剑；第二关起，拿到环剑的同时
//   一并解锁箭雨（main.js 的 grantRingThen 里调 unlock）。
//
// 数值：伤害吃武器属性表 wstats（swordDamage / 暴击），× ARROW_DMG_MUL ——
//   商店的剑油 / 磨剑石同样强化箭雨，升级卡不白买。
// ============================================================
import * as THREE from '../lib/three.module.js?v=63';
import { mitigate } from './stats.js?v=63';
import audio from './audio.js?v=63';

const AIM_TIME = 0.85;      // 警告圈亮起到第一支箭落地（给怪走位、给玩家预判）
const SPREAD_TIME = 1.0;    // 全部箭落完的时间窗（每支箭在这个窗内错开）
const FALL_TIME = 0.42;     // 单支箭从出现到落地
const ZONE_R = 2.3;         // 箭雨覆盖半径（世界单位）
const SEARCH_R = 14;        // 找「最近的怪」的最大搜索半径
const ARROWS = 14;          // 每次施放的总箭数
const ARROW_DMG_MUL = 0.55; // 每支箭伤害 = 剑伤害 × 这个（再吃暴击与目标护甲）
const ARROW_HIT_R = 0.85;   // 单支箭的溅射半径（加怪的碰撞半径）
const CD_MAX = 8.0;         // 冷却（秒）—— 技能框上要有倒计时
const ARROW_LEN = 0.95;     // 箭的长度
const DROP_Y = 8.5;         // 箭出现的高度

export function createArrowRainSystem({ scene, fx, enemies, wstats }) {
  let unlocked = false;
  let cd = 0;                  // 剩余冷却
  let t = 0;
  const strikes = [];          // 进行中的箭雨：{ x, z, ring, mat, arrows: [{dx,dz,at,mesh,state}] }
  const arrowPool = [];        // 箭 mesh 对象池

  // ---------------- 视觉资源 ----------------
  const arrowGeo = new THREE.CylinderGeometry(0.025, 0.025, ARROW_LEN, 5);
  arrowGeo.rotateX(Math.PI / 2);              // 沿 +Y → 沿 -Z 落（头朝下）
  const arrowMat = new THREE.MeshLambertMaterial({ color: 0xe8d9a8, emissive: 0x8a6a20 });
  const warnGeo = new THREE.RingGeometry(ZONE_R - 0.16, ZONE_R, 40);
  warnGeo.rotateX(-Math.PI / 2);
  const warnMatBase = new THREE.MeshBasicMaterial({
    color: 0xffc46a, transparent: true, opacity: 0.0,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });

  function takeArrow() {
    if (arrowPool.length) {
      const m = arrowPool.pop();
      m.visible = true;
      return m;
    }
    const m = new THREE.Mesh(arrowGeo, arrowMat);
    m.frustumCulled = false;
    scene.add(m);
    return m;
  }

  function releaseArrow(m) {
    m.visible = false;
    arrowPool.push(m);
  }

  // ---------------- 施放 ----------------
  // 返回 true = 真的放出去了（进冷却）；false = 没放出去（没解锁 / 冷却中 / 视野内没有怪）
  function fire(playerPos) {
    if (!unlocked || cd > 0) return false;

    // 找最近的活怪（不含正在生成 / 已死 / 隐身的雾鬼 —— 别对着空气放箭）
    const list = enemies.list.filter((e) => e.state !== 'dead' && e.state !== 'spawn' && !e.ghostHidden);
    const p = playerPos || { x: 0, z: 0 };
    let best = null, bestD = SEARCH_R * SEARCH_R;
    for (const e of list) {
      const d = (e.pos.x - p.x) ** 2 + (e.pos.z - p.z) ** 2;
      if (d < bestD) { bestD = d; best = e; }
    }
    if (!best) return false;

    // 以怪当前位置为中心设界（预判就交给 AIM_TIME 的延迟让玩家自己挪）
    const x = best.pos.x, z = best.pos.z;
    const mat = warnMatBase.clone();
    const ring = new THREE.Mesh(warnGeo, mat);
    ring.position.set(x, 0.07, z);
    ring.frustumCulled = false;
    scene.add(ring);

    // 预生成每支箭的落点与时刻（错开 SPREAD_TIME）
    const arrows = [];
    for (let i = 0; i < ARROWS; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * ZONE_R * 0.94;
      arrows.push({
        dx: Math.cos(a) * r, dz: Math.sin(a) * r,
        at: AIM_TIME + Math.random() * SPREAD_TIME,
        mesh: null, state: 'wait',   // wait → fall → done
      });
    }
    strikes.push({ x, z, ring, mat, arrows, age: 0 });

    cd = CD_MAX;
    audio.sfx('swordFire', { vol: 0.6 });
    if (fx) fx.ring({ x, z }, { from: ZONE_R * 0.4, to: ZONE_R + 0.3, color: 0xffc46a, life: 0.4, opacity: 0.7, y: 0.06 });
    return true;
  }

  // 一支箭落地：对落点小范围内的怪造成伤害
  function land(s, a) {
    const dmgBase = wstats.get('swordDamage') * ARROW_DMG_MUL;
    const crit = Math.random() < wstats.get('swordCrit');
    const raw = dmgBase * (crit ? wstats.get('swordCritMul') : 1);
    let hitAny = false;
    for (const e of enemies.list) {
      if (e.state === 'dead' || e.state === 'spawn' || e.ghostHidden) continue;
      const dx = e.pos.x - (s.x + a.dx), dz = e.pos.z - (s.z + a.dz);
      const r = ARROW_HIT_R + e.cfg.radius;
      if (dx * dx + dz * dz <= r * r) {
        enemies.takeDamage(e, mitigate(raw, e.cfg.armor), crit);
        hitAny = true;
      }
    }
    if (fx) fx.burst({ x: s.x + a.dx, z: s.z + a.dz },
      { color: crit ? 0xffe9a8 : 0xd9c48a, count: 5, speed: 2.2, life: 0.3, size: 0.09, y: 0.25, up: 1.4, gravity: 6 });
    if (hitAny) audio.sfx('swordHit', { vol: 0.45 });
  }

  // ---------------- 每帧 ----------------
  function update(dt) {
    t += dt;
    if (cd > 0) cd = Math.max(0, cd - dt);

    for (let si = strikes.length - 1; si >= 0; si--) {
      const s = strikes[si];
      s.age += dt;

      // 警告圈：前 AIM_TIME 呼吸闪烁，之后淡出
      if (s.age <= AIM_TIME + 0.3) {
        s.mat.opacity = 0.25 + 0.3 * (0.5 + 0.5 * Math.sin(t * 9));
      } else {
        s.mat.opacity = Math.max(0, s.mat.opacity - dt * 2.5);
        if (s.mat.opacity <= 0) {
          scene.remove(s.ring);
          s.mat.dispose();
          s.ring = null;
        }
      }

      let allDone = true;
      for (const a of s.arrows) {
        if (a.state === 'done') continue;
        allDone = false;
        if (s.age < a.at) continue;
        if (a.state === 'wait') {
          a.state = 'fall';
          a.mesh = takeArrow();
        }
        // 下落：从 DROP_Y 落到 0.1（地面）
        const k = Math.min(1, (s.age - a.at) / FALL_TIME);
        const y = DROP_Y * (1 - k) + 0.1;
        a.mesh.position.set(s.x + a.dx, y, s.z + a.dz);
        a.mesh.rotation.x = 0.12;                       // 微微斜插
        a.mesh.rotation.y = Math.random() * 0;          // 方向一致更像箭雨
        if (k >= 1) {
          a.state = 'done';
          land(s, a);
          releaseArrow(a.mesh);
          a.mesh = null;
        }
      }

      // 全部箭落完 + 警告圈淡完 → 收掉这场雨
      if (allDone && !s.ring) strikes.splice(si, 1);
    }
  }

  // ---------------- 生命周期 ----------------
  function unlock() {
    if (unlocked) return;
    unlocked = true;
  }

  function reset() {
    for (const s of strikes) {
      if (s.ring) { scene.remove(s.ring); s.mat.dispose(); }
      for (const a of s.arrows) if (a.mesh) releaseArrow(a.mesh);
    }
    strikes.length = 0;
    cd = 0;
    unlocked = false;
  }

  function restore(saved) {
    reset();
    if (saved && saved.unlocked) unlocked = true;
  }

  function snapshot() {
    return { unlocked };
  }

  return {
    unlock, reset, restore, snapshot, update, fire,
    // 结算后隐藏 / 回合开始显示（与 weapon.setVisible 同款）
    setVisible(v) {
      for (const s of strikes) {
        if (s.ring) s.ring.visible = v;
        for (const a of s.arrows) if (a.mesh) a.mesh.visible = v;
      }
    },
    get unlocked() { return unlocked; },
    get ready() { return unlocked && cd <= 0; },
    get cdLeft() { return cd; },
    get cdMax() { return CD_MAX; },
    get progress() { return unlocked ? 1 - cd / CD_MAX : 0; },   // 技能键竖条
    get strikeCount() { return strikes.length; },
  };
}
