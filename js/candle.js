// ============================================================
// candle.js —— 第 13 件法器「守夜烛」（第 118 块）
//
// 用户 2026-10-29 定案：「完善第十一关，设计多样法器配套技能」：
// 第十一关（钟楼雾原）里，墨丸是「你写、怪来踩」，守夜烛是「你点、雾退开」。
// 按下技能键在脚下放一盏烛：持续几秒，圈里的怪被灼烧并减速；而且
// **把圈内的雾照散**（走 onReveal 回调，由 main 接到 fog.cut）。
// 这让它成为第十一关独有的「反雾」手段 —— 不是加伤害，是换视野。
//
// 数值骨架和 mine.js / latte.js 同一套：
//   灼烧 = 武器攻击 × DPS_MUL × 等级系数 × (1 + 卡/货) × 局外增幅
//   持续时间 / 半径 / 冷却 各有独立通道，reset() 清零（局内成长，不跨局）。
// ============================================================
import * as THREE from '../lib/three.module.js?v=140';
import { mitigate } from './stats.js?v=140';
import audio from './audio.js?v=140';

const CD_MAX = 22.0;        // 基础冷却
const CD_MIN = 8.0;         // 冷却下限
const RADIUS = 3.2;         // 照亮 / 灼烧半径
const DURATION = 6.0;       // 持续秒数
const DPS_MUL = 0.55;       // 每秒伤害 = 武器攻击 × 0.55
const TICK = 0.5;           // 结算间隔
const SLOW = 0.18;          // 圈内减速
const CAP = 1;              // 同屏最多几盏

// 法器等级 1~3 的成长（0 = 没买）
const LV_RADIUS = [3.2, 3.5, 3.8];
const LV_DURATION = [6.0, 7.2, 8.4];
const LV_DPS = [1, 1.2, 1.4];

export function createCandleSystem({ scene, fx, enemies, wstats, onCast, onReveal }) {
  const mods = { duration: 0, radius: 0, dpsPct: 0, cdCut: 0, slowPct: 0 };
  const shop = { wax: false, shade: false };   // 两件商店货（一局一次）
  let relicLv = 0;
  let cd = 0;
  let cdMul = 1;                                // 局外技能 CD 缩短
  let amp = { dmg: 1, radius: 0, cd: 1, dur: 0 };  // 火种 / 盲盒的法器增幅
  let lastFail = '';
  const zones = [];                             // { x, z, group, flame, light, halo, t, life, tickT, revealT }

  const radiusV = () => LV_RADIUS[Math.min(2, Math.max(0, relicLv - 1))] + mods.radius + amp.radius + (shop.shade ? 0.6 : 0);
  const durationV = () => (Math.min(2, Math.max(0, relicLv - 1)) >= 0
    ? LV_DURATION[Math.min(2, Math.max(0, relicLv - 1))] : LV_DURATION[0]) + mods.duration + amp.dur + (shop.wax ? 1.5 : 0);
  const dpsMulV = () => DPS_MUL * (relicLv > 0 ? LV_DPS[Math.min(2, Math.max(0, relicLv - 1))] : 1)
    * (1 + mods.dpsPct + (shop.wax ? 0.08 : 0)) * amp.dmg;
  const slowV = () => Math.min(0.45, SLOW + mods.slowPct + (shop.shade ? 0.06 : 0));
  const cdMaxV = () => Math.max(CD_MIN, (CD_MAX - mods.cdCut) * cdMul * amp.cd);

  // ---------------- 视觉 ----------------
  const candMat = new THREE.MeshStandardMaterial({ color: 0xf5e7c6, roughness: 0.9, metalness: 0.02 });
  const holdMat = new THREE.MeshStandardMaterial({ color: 0x7c5a3a, roughness: 0.85, metalness: 0.06 });
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xffb85c, transparent: true, opacity: 0.95 });

  function makeZone(x, z, life) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    // 烛身
    const wax = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.5, 10), candMat);
    wax.position.y = 0.25;
    group.add(wax);
    // 烛台
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.05, 12), holdMat);
    cup.position.y = 0.025;
    group.add(cup);
    // 火苗
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.24, 8), flameMat);
    flame.position.y = 0.62;
    group.add(flame);
    // 脚下光晕（正的圆面 + 一圈亮边，雾里也看得见）
    const halo = new THREE.Mesh(
      new THREE.CircleGeometry(radiusV(), 40),
      new THREE.MeshBasicMaterial({ color: 0xffcf8a, transparent: true, opacity: 0.09, depthWrite: false, side: THREE.DoubleSide }),
    );
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = 0.02;
    halo.renderOrder = 720;
    group.add(halo);
    const rim = new THREE.Mesh(
      new THREE.RingGeometry(radiusV() * 0.94, radiusV(), 44),
      new THREE.MeshBasicMaterial({ color: 0xffd79b, transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide }),
    );
    rim.rotation.x = -Math.PI / 2;
    rim.position.y = 0.025;
    rim.renderOrder = 721;
    group.add(rim);
    scene.add(group);
    return { x, z, group, flame, halo, rim, t: 0, life, tickT: 0, revealT: 0 };
  }

  function dispose(zone) {
    scene.remove(zone.group);
    zone.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
    zone.halo.material.dispose();
    zone.rim.material.dispose();
  }

  // ---------------- 主逻辑 ----------------
  function drop(playerPos) {
    if (!relicLv) { lastFail = 'lock'; return false; }
    if (cd > 0) { lastFail = 'cd'; return false; }
    if (zones.length >= CAP) { lastFail = 'full'; return false; }
    const p = playerPos || { x: 0, z: 0 };
    const z = makeZone(p.x, p.z, durationV());
    zones.push(z);
    cd = cdMaxV();
    if (fx && fx.ring) fx.ring({ x: p.x, z: p.z }, { from: 0.2, to: radiusV(), color: 0xffc879, life: 0.4, opacity: 0.6, y: 0.05 });
    if (audio && audio.sfx) audio.sfx('swordFire', { vol: 0.35 });
    if (onCast) onCast(z);
    return true;
  }

  function tickZone(z, dt) {
    z.t += dt;
    const R = radiusV();
    // 火苗抖动（纯视觉）
    if (z.flame) {
      const f = 1 + Math.sin(z.t * 17) * 0.12;
      z.flame.scale.set(f, 1 / f, f);
      z.flame.position.y = 0.62 + Math.sin(z.t * 11) * 0.015;
    }
    // 快熄灭时淡出
    const left = z.life - z.t;
    if (left < 0.8) {
      const k = Math.max(0, left / 0.8);
      z.halo.material.opacity = 0.09 * k;
      z.rim.material.opacity = 0.4 * k;
    }
    // 每 0.5 秒：灼烧 + 减速 + 照散雾
    z.tickT -= dt;
    z.revealT -= dt;
    if (z.revealT <= 0) {
      z.revealT = 0.25;
      if (onReveal) onReveal(z.x, z.z, R);
    }
    if (z.tickT > 0) return;
    z.tickT += TICK;
    const base = wstats.get('swordDamage') * dpsMulV() * TICK;
    const crit = Math.random() < wstats.get('swordCrit');
    const raw = base * (crit ? wstats.get('swordCritMul') : 1);
    for (const e of enemies.list()) {
      if (!enemies.hittable(e)) continue;
      if (Math.hypot(e.pos.x - z.x, e.pos.z - z.z) > R + e.cfg.radius) continue;
      enemies.takeDamage(e, mitigate(raw, e.cfg.armor), crit, { cls: 'elem' });
      if (enemies.applySlow) enemies.applySlow(e, { factor: slowV(), time: 0.6 });
    }
  }

  function update(dt, ctx = {}) {
    if (cd > 0) cd = Math.max(0, cd - dt);
    for (let i = zones.length - 1; i >= 0; i--) {
      const z = zones[i];
      tickZone(z, dt);
      if (z.t >= z.life) { dispose(z); zones.splice(i, 1); }
    }
  }

  function clearField() {
    for (const z of zones) dispose(z);
    zones.length = 0;
  }

  function reset() {
    clearField();
    mods.duration = 0; mods.radius = 0; mods.dpsPct = 0; mods.cdCut = 0; mods.slowPct = 0;
    shop.wax = false; shop.shade = false;
    relicLv = 0; cd = 0; lastFail = '';
  }

  function setRelicLevel(lv) { relicLv = Math.max(0, Math.min(3, lv | 0)); }
  function applyCard(card) {
    if (!card) return;
    if (card.duration) mods.duration += card.duration;
    if (card.radius) mods.radius += card.radius;
    if (card.dps) mods.dpsPct += card.dps;
    if (card.cd) mods.cdCut += card.cd;
    if (card.slow) mods.slowPct += card.slow;
  }
  function buyWax() { if (shop.wax) return false; shop.wax = true; return true; }
  function buyShade() { if (shop.shade) return false; shop.shade = true; return true; }

  return {
    owned: () => relicLv > 0,
    level: () => relicLv,
    setRelicLevel,
    applyCard,
    buyWax, buyShade,
    hasWax: () => shop.wax,
    hasShade: () => shop.shade,
    drop,
    update,
    clearField,
    reset,
    list: () => zones.map((z) => ({ x: z.x, z: z.z, t: z.t, life: z.life, radius: radiusV() })),
    count: () => zones.length,
    cap: () => CAP,
    ready: () => relicLv > 0 && cd <= 0 && zones.length < CAP,
    cdLeft: () => +cd.toFixed(3),
    cdMax: () => +cdMaxV().toFixed(3),
    progress: () => (cdMaxV() > 0 ? Math.max(0, Math.min(1, 1 - cd / cdMaxV())) : 1),
    radius: () => +radiusV().toFixed(3),
    duration: () => +durationV().toFixed(3),
    dps: () => +(wstats.get('swordDamage') * dpsMulV()).toFixed(2),
    lastFail: () => lastFail,
    setCdMul: (m) => { cdMul = Math.max(0.2, m || 1); },
    setRelicAmp: (a) => { amp = { ...amp, ...(a || {}) }; },
    bonuses: () => ({
      ...mods, cap: CAP, radius: +radiusV().toFixed(2),
      duration: +durationV().toFixed(2), dpsMul: +dpsMulV().toFixed(3),
      slow: +slowV().toFixed(3), cdMax: +cdMaxV().toFixed(2),
      wax: shop.wax, shade: shop.shade, level: relicLv,
    }),
    snapshot: () => ({ mods: { ...mods }, shop: { ...shop } }),
    restore: (s) => {
      if (!s) return;
      Object.assign(mods, s.mods || {});
      Object.assign(shop, s.shop || {});
    },
  };
}
