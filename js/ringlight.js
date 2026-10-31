// ============================================================
// ringlight.js —— 第 17 件法器「环形灯」（第 128 块）
//
// 第十五关 · 钟楼直播间的头号新玩具：一盏跟着你走的补光灯。
// 按一下把它打开，持续几秒 —— 灯圈里的怪被减速，灯圈里打死的东西
// 额外掉「打赏」金币。它和场地上那些**不动**的补光光斑刚好相反：
// 那些是场地给的风险区（站进去挨打更疼、多拿钱），这盏是你自己举着的，
// 走哪儿照哪儿。
//
// 和 latte.js 同一套骨架：等级 / 三选一卡 / 商店两件货各有独立通道，
// 所有临时属性 mod 都带 src，离场 / 到期 / reset 必须撤掉。
// 灯圈**跟着玩家**，所以同屏只有一圈（cap 固定 1，靠卡加不了第二盏）。
// ============================================================
import * as THREE from '../lib/three.module.js?v=147';

export const RING_BASE = {
  cd: 24.0,
  cdMin: 12.0,
  duration: 6.0,
  radius: 3.6,
  slow: 0.30,
  coin: 1,
};

// 等级表（0 位留空：relicLv = 0 表示没买）
const LV = {
  duration: [0, 6.0, 7.0, 8.0],
  radius: [0, 3.6, 4.2, 4.8],
  slow: [0, 0.30, 0.35, 0.40],
  cd: [0, 24.0, 21.0, 18.0],
};

// 悬在头顶的那盏环形灯：一圈粉色灯管 + 灯盘 + 一根短杆。
// 零厚度平面侧身会变一条线（老规矩），灯管用 Torus，灯盘用 DoubleSide 的圆。
function makeLamp() {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.44, 0.075, 8, 30),
    new THREE.MeshBasicMaterial({
      color: 0xff9ad6, transparent: true, opacity: 0.92,
      depthWrite: false, blending: THREE.AdditiveBlending,
    })
  );
  ring.rotation.x = Math.PI / 2;
  ring.renderOrder = 6;
  const glare = new THREE.Mesh(
    new THREE.CircleGeometry(0.38, 26).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({
      color: 0xffe6f4, transparent: true, opacity: 0.34,
      depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    })
  );
  glare.position.y = -0.06;
  glare.renderOrder = 7;
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x3a3f4a, emissive: 0x0a0c10 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.044, 0.72, 8), poleMat);
  pole.position.y = -0.44;
  g.add(ring, glare, pole);
  g.userData.ring = ring;
  g.userData.glare = glare;
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
  return g;
}

export function createRingLightSystem({ scene, fx, enemies, onCast, onSlow }) {
  const mods = { duration: 0, radius: 0, slow: 0, cdCut: 0, coin: 0 };
  const shop = { bulb: false, stand: false };
  let relicLv = 0;
  let cd = 0;
  let cdMul = 1;
  // 第 118 块那套法器增幅（火种 / 盲盒），和 latte 同一个口径
  let amp = { dmg: 1, radius: 0, cd: 1, dur: 0, coin: 0 };
  let serial = 0;
  let lastFail = '';
  let zone = null;

  const lamp = makeLamp();
  lamp.visible = false;
  scene.add(lamp);

  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({
      color: 0xff9ad6, transparent: true, opacity: 0.10,
      depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    })
  );
  const rim = new THREE.Mesh(
    new THREE.RingGeometry(0.94, 1, 64).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({
      color: 0xffc2e8, transparent: true, opacity: 0.46,
      depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    })
  );
  disc.visible = rim.visible = false;
  disc.renderOrder = rim.renderOrder = 6;
  scene.add(disc, rim);

  const radiusV = () => (LV.radius[relicLv] || 0) + mods.radius + amp.radius + (shop.bulb ? 0.6 : 0);
  const durationV = () => (LV.duration[relicLv] || 0) + mods.duration + amp.dur + (shop.stand ? 2 : 0);
  const slowV = () => Math.min(0.60, (LV.slow[relicLv] || 0) + mods.slow + (shop.bulb ? 0.05 : 0));
  const cdMaxV = () => Math.max(
    RING_BASE.cdMin,
    Math.max(0, (LV.cd[relicLv] || 0) - mods.cdCut - (shop.stand ? 4 : 0)) * cdMul * amp.cd,
  );
  const coinV = () => RING_BASE.coin + mods.coin + (amp.coin || 0);

  function showVisuals(on) {
    lamp.visible = disc.visible = rim.visible = on;
  }

  function activate(playerPos) {
    if (!relicLv) { lastFail = 'lock'; return false; }
    if (cd > 0) { lastFail = 'cd'; return false; }
    if (zone) { lastFail = 'full'; return false; }
    const p = playerPos || { x: 0, z: 0 };
    const id = ++serial;
    const r = radiusV();
    zone = { id, x: p.x, z: p.z, t: 0, life: durationV(), src: `ringlight:${id}`, seen: new Set(), tick: 0 };
    disc.scale.setScalar(r);
    rim.scale.setScalar(r);
    cd = cdMaxV();
    lastFail = '';
    showVisuals(true);
    if (onCast) onCast(id);
    if (fx) fx.ring(p, { from: 0.3, to: r, color: 0xff9ad6, life: 0.45, opacity: 0.8, y: 0.07 });
    return true;
  }

  function removeZone() {
    zone = null;
    showVisuals(false);
  }

  function update(dt, { playerPos } = {}) {
    if (cd > 0) cd = Math.max(0, cd - dt);
    if (!zone) return;
    zone.t += dt;
    const left = Math.max(0, zone.life - zone.t);
    if (playerPos) {
      zone.x = playerPos.x;
      zone.z = playerPos.z;
    }
    // 灯悬在头顶：轻微上下呼吸 + 慢慢自转
    const bob = Math.sin(zone.t * 2.4) * 0.05;
    lamp.position.set(zone.x, 1.98 + bob, zone.z);
    lamp.rotation.y += dt * 0.9;
    const lampRing = lamp.userData.ring;
    if (lampRing) lampRing.material.opacity = 0.7 + 0.25 * Math.sin(zone.t * 5);
    const lampGlare = lamp.userData.glare;
    if (lampGlare) lampGlare.material.opacity = 0.24 + 0.10 * Math.sin(zone.t * 5 + 1);

    const r = radiusV();
    disc.position.set(zone.x, 0.052, zone.z);
    rim.position.set(zone.x, 0.066, zone.z);
    disc.scale.setScalar(r);
    rim.scale.setScalar(r * (1 + Math.sin(zone.t * 3.2) * 0.012));
    disc.material.opacity = (0.07 + 0.04 * Math.sin(zone.t * 3.2)) * Math.min(1, left * 2);
    rim.material.opacity = 0.46 * Math.min(1, left * 2);

    zone.tick -= dt;
    if (zone.tick <= 0) {
      zone.tick = 0.35;
      for (const e of enemies.list) {
        if (!enemies.hittable(e)) continue;
        if (Math.hypot(e.pos.x - zone.x, e.pos.z - zone.z) > r + e.cfg.radius) continue;
        enemies.applySlow(e, { factor: slowV(), time: 0.55 });
        if (!zone.seen.has(e.id)) {
          zone.seen.add(e.id);
          if (onSlow) onSlow(e, zone.id);
        }
      }
    }
    if (zone.t >= zone.life) removeZone();
  }

  function clearField() {
    removeZone();
    cd = 0;
  }

  function reset() {
    clearField();
    for (const k of Object.keys(mods)) mods[k] = 0;
    shop.bulb = false;
    shop.stand = false;
    relicLv = 0;
    lastFail = '';
  }

  function inLight(x, z) {
    if (!zone) return false;
    return Math.hypot(x - zone.x, z - zone.z) <= radiusV();
  }

  return {
    activate, drop: activate, update, reset, clearField, inLight,
    // 灯圈里打死一只怪额外给几枚金币（没开灯 / 不在圈里 = 0）
    coinAt: (x, z) => (inLight(x, z) ? coinV() : 0),
    get owned() { return relicLv > 0; },
    get ready() { return relicLv > 0 && cd <= 0 && !zone; },
    get active() { return !!zone; },
    get cdLeft() { return cd; },
    get cdMax() { return cdMaxV(); },
    get progress() { return relicLv ? 1 - cd / cdMaxV() : 0; },
    get count() { return zone ? 1 : 0; },
    get cap() { return 1; },
    get lastFail() { return lastFail; },
    setRelicLevel(n) { relicLv = Math.max(0, Math.min(3, Number(n) || 0)); },
    applyCard(card) {
      const put = (c) => {
        if (!c) return;
        if (c.stat === 'duration') mods.duration += c.flat;
        else if (c.stat === 'radius') mods.radius += c.flat;
        else if (c.stat === 'slow') mods.slow += c.flat;
        else if (c.stat === 'cd') mods.cdCut += c.flat;
        else if (c.stat === 'coin') mods.coin += c.flat;
      };
      put(card);
      for (const ex of (card.extra || [])) put(ex);
    },
    buyBulb() { if (shop.bulb) return false; shop.bulb = true; return true; },
    buyStand() { if (shop.stand) return false; shop.stand = true; return true; },
    hasBulb: () => shop.bulb,
    hasStand: () => shop.stand,
    bonuses: () => ({
      ...mods,
      radius: +radiusV().toFixed(2),
      duration: +durationV().toFixed(2),
      slow: +slowV().toFixed(3),
      coin: coinV(),
      cdMax: +cdMaxV().toFixed(2),
      bulb: shop.bulb,
      stand: shop.stand,
      level: relicLv,
    }),
    snapshot: () => ({ ...mods, bulb: shop.bulb, stand: shop.stand }),
    restore(saved) {
      reset();
      if (!saved) return;
      for (const k of Object.keys(mods)) mods[k] = Number(saved[k]) || 0;
      shop.bulb = !!saved.bulb;
      shop.stand = !!saved.stand;
    },
    setCdMul(m) {
      cdMul = Math.max(0.1, Number(m) || 1);
      if (cd > 0) cd = Math.min(cd, cdMaxV());
    },
    setRelicAmp: (a) => { amp = { ...amp, ...(a || {}) }; },
    list: () => (zone
      ? [{ id: zone.id, x: +zone.x.toFixed(2), z: +zone.z.toFixed(2), t: +zone.t.toFixed(2), life: zone.life, seen: zone.seen.size }]
      : []),
    // 调试：直接开一盏不扣冷却（截图 / 测试用）
    debugForce: (p) => {
      const saved = relicLv;
      if (!saved) relicLv = 1;
      const keepCd = cd;
      cd = 0;
      const ok = activate(p);
      if (!saved) relicLv = saved;
      cd = keepCd;
      return ok;
    },
  };
}
