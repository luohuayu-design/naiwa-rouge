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
import * as THREE from '../lib/three.module.js?v=128';
import { mitigate } from './stats.js?v=128';
import audio from './audio.js?v=128';

const AIM_TIME = 0.85;      // 警告圈亮起到第一支箭落地（给怪走位、给玩家预判）
const SPREAD_TIME = 1.0;    // 全部箭落完的时间窗（每支箭在这个窗内错开）
const FALL_TIME = 0.42;     // 单支箭从出现到落地
const ZONE_R = 2.3;         // 箭雨覆盖半径（世界单位）
const SEARCH_R = 14;        // 找「最近的怪」的最大搜索半径
const ARROWS = 14;          // 每次施放的总箭数
const ARROW_DMG_MUL = 0.55; // 每支箭伤害 = 剑伤害 × 这个（再吃暴击与目标护甲）
const ARROW_HIT_R = 0.85;   // 单支箭的溅射半径（加怪的碰撞半径）
const CD_MAX = 8.0;         // 冷却（秒）—— 技能框上要有倒计时
const CD_MIN = 3.0;         // 冷却下限（冷却卡叠多了兜底）
const ARROW_LEN = 0.95;     // 箭的长度
const DROP_Y = 8.5;         // 箭出现的高度

export function createArrowRainSystem({ scene, fx, enemies, wstats }) {
  let unlocked = false;
  let cd = 0;                  // 剩余冷却
  let cdMul = 1;               // 局外商店「技能CD缩短」倍率（第 58 块，默认 1）
  let t = 0;
  // 第 108 块：三选一箭雨卡 + 商店「强化箭袋」的加成入口（applyCard / applyQuiver）
  const mods = { arrows: 0, dmgPct: 0, zone: 0, cdCut: 0, quiver: false };
  const zoneR = () => ZONE_R + mods.zone;                                  // 覆盖半径
  const arrowsN = () => ARROWS + mods.arrows;                              // 每次总箭数
  const dmgMul = () => ARROW_DMG_MUL * (1 + mods.dmgPct);                  // 每箭伤害倍率
  const cdMaxV = () => Math.max(CD_MIN, (CD_MAX - mods.cdCut) * cdMul);    // 冷却（下限 CD_MIN）
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
  let lastFail = '';           // 'lock' | 'cd' | 'notarget'（第 66 块：给玩家一句提示用）
  function fire(playerPos) {
    if (!unlocked) { lastFail = 'lock'; return false; }
    if (cd > 0) { lastFail = 'cd'; return false; }

    // 找最近的活怪（不含正在生成 / 已死 / 躺尸重启中 / 隐身的雾鬼 —— 别对着空气放箭）
    const list = enemies.list.filter((e) => enemies.hittable(e) && !e.ghostHidden);
    const p = playerPos || { x: 0, z: 0 };
    let best = null, bestD = SEARCH_R * SEARCH_R;
    for (const e of list) {
      const d = (e.pos.x - p.x) ** 2 + (e.pos.z - p.z) ** 2;
      if (d < bestD) { bestD = d; best = e; }
    }
    if (!best) { lastFail = 'notarget'; return false; }
    lastFail = '';

    // 以怪当前位置为中心设界（预判就交给 AIM_TIME 的延迟让玩家自己挪）
    const x = best.pos.x, z = best.pos.z;
    const mat = warnMatBase.clone();
    const ring = new THREE.Mesh(warnGeo, mat);
    // 第 108 块：范围卡让覆盖变大 —— 警告环等比缩放（RingGeometry 是共享的，别重建）
    ring.scale.setScalar(zoneR() / ZONE_R);
    ring.position.set(x, 0.07, z);
    ring.frustumCulled = false;
    scene.add(ring);

    // 预生成每支箭的落点与时刻（错开 SPREAD_TIME）
    const arrows = [];
    for (let i = 0; i < arrowsN(); i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * zoneR() * 0.94;
      arrows.push({
        dx: Math.cos(a) * r, dz: Math.sin(a) * r,
        at: AIM_TIME + Math.random() * SPREAD_TIME,
        mesh: null, state: 'wait',   // wait → fall → done
      });
    }
    strikes.push({ x, z, ring, mat, arrows, age: 0 });

    cd = cdMaxV();
    audio.sfx('swordFire', { vol: 0.6 });
    if (fx) fx.ring({ x, z }, { from: zoneR() * 0.4, to: zoneR() + 0.3, color: 0xffc46a, life: 0.4, opacity: 0.7, y: 0.06 });
    return true;
  }

  // 一支箭落地：对落点小范围内的怪造成伤害
  function land(s, a) {
    const dmgBase = wstats.get('swordDamage') * dmgMul();
    const crit = Math.random() < wstats.get('swordCrit');
    const raw = dmgBase * (crit ? wstats.get('swordCritMul') : 1);
    let hitAny = false;
    for (const e of enemies.list) {
      if (!enemies.hittable(e) || e.ghostHidden) continue;
      const dx = e.pos.x - (s.x + a.dx), dz = e.pos.z - (s.z + a.dz);
      const r = ARROW_HIT_R + e.cfg.radius;
      if (dx * dx + dz * dz <= r * r) {
        enemies.takeDamage(e, mitigate(raw, e.cfg.armor), crit, { cls: 'phys' });
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
    // 第 108 块：三选一卡 / 商店强化是**局内**加成，新局清零（和傀儡卡同口径）
    mods.arrows = 0; mods.dmgPct = 0; mods.zone = 0; mods.cdCut = 0; mods.quiver = false;
  }

  function restore(saved) {
    reset();
    if (saved && saved.unlocked) unlocked = true;
  }

  // 第 66 块：只清冷却、不动解锁状态。beginGame 里用 ——
  // 箭雨是模块级单例，原来只有读档那条路会 reset()，直接「重开一局」会把上一局
  // 没走完的 8 秒冷却带进新局（玩家：刚开局箭雨就是灰的，像坏了）。
  // 不能直接 reset()：它会把 unlocked 也清掉，而 prefillRing() 见 weapon.granted
  // 已为 true 会提前 return，箭雨就再也解锁不回来了。
  function resetCd() { cd = 0; }

  function snapshot() {
    return { unlocked };
  }

  return {
    unlock, reset, resetCd, restore, snapshot, update, fire,
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
    get cdMax() { return cdMaxV(); },
    get progress() { return unlocked ? 1 - cd / cdMaxV() : 0; },   // 技能键竖条
    // 第 58 块：局外商店技能CD缩短 —— 直接乘倍率（下限 0.1）
    setCdMul(m) {
      cdMul = Math.max(0.1, Number(m) || 1);
      if (cd > 0) cd = Math.min(cd, cdMaxV());
    },
    // ---- 第 108 块：三选一箭雨卡 / 商店强化入口 ----
    // card: { stat:'arrows'|'dmg'|'zone'|'cd', flat:N }
    applyCard(card) {
      if (card.stat === 'arrows') mods.arrows += card.flat;
      else if (card.stat === 'dmg') mods.dmgPct += card.flat;
      else if (card.stat === 'zone') mods.zone += card.flat;
      else if (card.stat === 'cd') mods.cdCut += card.flat;
    },
    // 商店「强化箭袋」（买断，一次）：+5 箭 +15% 伤害 —— 和卡是同一个 mods，不冲突
    applyQuiver() {
      if (mods.quiver) return false;
      mods.quiver = true;
      mods.arrows += 5;
      mods.dmgPct += 0.15;
      return true;
    },
    hasQuiver: () => mods.quiver,
    bonuses: () => ({ ...mods, arrowsN: arrowsN(), zoneR: +zoneR().toFixed(2), dmgMul: +dmgMul().toFixed(3), cdMax: +cdMaxV().toFixed(2) }),
    get strikeCount() { return strikes.length; },
    // 第 66 块：上一次 fire() 为什么没放出去（'' = 成功了）
    get lastFail() { return lastFail; },
    // 第 66 块：射程内有没有可落箭的活怪（技能键的灰/亮已经用不上它，
    // 教程「补靶子」和玩家提示要问这个）
    hasTarget(p) {
      const q = p || { x: 0, z: 0 };
      return enemies.list.some((e) => enemies.hittable(e) && !e.ghostHidden
        && ((e.pos.x - q.x) ** 2 + (e.pos.z - q.z) ** 2) < SEARCH_R * SEARCH_R);
    },
  };
}
