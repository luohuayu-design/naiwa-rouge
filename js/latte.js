// ============================================================
// latte.js —— 第 12 件法器「苔藓拿铁」（第 116 块）
//
// 主动放下一杯咖啡：玩家在圈里加攻速 / 移速，怪在圈里减速。
// 等级、三选一、商店分别走独立 mods；所有临时属性 mod 都有 src，
// 离场 / 到期 / reset 必须撤掉，不能把一杯咖啡带进下一局。
// ============================================================
import * as THREE from '../lib/three.module.js?v=136';

export const LATTE_BASE = {
  cd: 30.0,
  cdMin: 14.0,
  radius: 3.2,
  duration: 5.0,
  haste: 0.20,
  move: 0.15,
  slow: 0.28,
  cap: 1,
  capMax: 3,
};

function makeCup() {
  const g = new THREE.Group();
  const cupMat = new THREE.MeshLambertMaterial({ color: 0xe8dcc2, emissive: 0x342812 });
  const coffeeMat = new THREE.MeshBasicMaterial({ color: 0x6d4424 });
  const mossMat = new THREE.MeshBasicMaterial({ color: 0x9fc36a });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.16, 0.34, 16), cupMat);
  body.position.y = 0.19;
  const top = new THREE.Mesh(new THREE.CircleGeometry(0.18, 18).rotateX(-Math.PI / 2), coffeeMat);
  top.position.y = 0.365;
  const moss = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), mossMat);
  moss.scale.set(1.6, 0.35, 0.8);
  moss.position.set(0.035, 0.377, 0);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.026, 6, 14, Math.PI * 1.65), cupMat);
  handle.position.set(0.19, 0.22, 0);
  handle.rotation.y = Math.PI / 2;
  g.add(body, top, moss, handle);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
  return g;
}

export function createLatteSystem({ scene, fx, enemies, stats, onCast, onSlow, onPickup }) {
  const mods = { duration: 0, radius: 0, haste: 0, slow: 0, cdCut: 0, cap: 0 };
  const shop = { foam: false, thermos: false };
  let relicLv = 0;
  let cd = 0;
  let cdMul = 1;
  // 第 118 块：火种（拿铁那一簇）/ 盲盒的法器增幅
  let amp = { dmg: 1, radius: 0, cd: 1, dur: 0 };
  let serial = 0;
  let lastFail = '';
  const zones = [];
  const pickups = [];
  const timedMods = [];
  const discGeo = new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2);
  const rimGeo = new THREE.RingGeometry(0.95, 1, 56).rotateX(-Math.PI / 2);

  const radiusV = () => LATTE_BASE.radius + mods.radius + amp.radius;
  const durationV = () => LATTE_BASE.duration + mods.duration + Math.max(0, relicLv - 1) + amp.dur + (shop.foam ? 2 : 0);
  const hasteV = () => (LATTE_BASE.haste + mods.haste) * (relicLv > 0 ? [1, 1, 1.2, 1.4][relicLv] : 1);
  const moveV = () => LATTE_BASE.move * (relicLv > 0 ? [1, 1, 1.15, 1.3][relicLv] : 1);
  const slowV = () => Math.min(0.65, LATTE_BASE.slow + mods.slow + (shop.foam ? 0.08 : 0));
  const capV = () => Math.min(LATTE_BASE.capMax, LATTE_BASE.cap + mods.cap + (shop.thermos ? 1 : 0));
  const cdMaxV = () => Math.max(LATTE_BASE.cdMin, (LATTE_BASE.cd - mods.cdCut - (shop.thermos ? 4 : 0)) * cdMul * amp.cd);

  function removeZone(i) {
    const z = zones[i];
    if (!z) return;
    stats.removeBySource(z.src);
    scene.remove(z.group, z.disc, z.rim);
    z.disc.material.dispose();
    z.rim.material.dispose();
    zones.splice(i, 1);
  }

  function drop(playerPos) {
    if (!relicLv) { lastFail = 'lock'; return false; }
    if (cd > 0) { lastFail = 'cd'; return false; }
    if (zones.length >= capV()) { lastFail = 'full'; return false; }
    const p = playerPos || { x: 0, z: 0 };
    const id = ++serial;
    const group = makeCup();
    group.position.set(p.x, 0.03, p.z);
    const disc = new THREE.Mesh(discGeo, new THREE.MeshBasicMaterial({
      color: 0x9fc36a, transparent: true, opacity: 0.10,
      depthWrite: false, side: THREE.DoubleSide,
    }));
    const rim = new THREE.Mesh(rimGeo, new THREE.MeshBasicMaterial({
      color: 0xe6c66d, transparent: true, opacity: 0.48,
      depthWrite: false, side: THREE.DoubleSide,
    }));
    const r = radiusV();
    disc.position.set(p.x, 0.052, p.z);
    rim.position.set(p.x, 0.065, p.z);
    disc.scale.setScalar(r);
    rim.scale.setScalar(r);
    disc.renderOrder = rim.renderOrder = 6;
    scene.add(group, disc, rim);
    zones.push({ id, x: p.x, z: p.z, group, disc, rim, t: 0, life: durationV(), src: `latte:zone:${id}`, inside: false, tick: 0, seen: new Set() });
    cd = cdMaxV();
    lastFail = '';
    if (onCast) onCast(id);
    if (fx) fx.ring(p, { from: 0.2, to: r, color: 0xd9bd69, life: 0.4, opacity: 0.7, y: 0.07 });
    return true;
  }

  function dropPickup(at) {
    if (!at) return;
    const id = ++serial;
    const group = makeCup();
    group.scale.setScalar(0.8);
    group.position.set(at.x, 0.05, at.z);
    const rim = new THREE.Mesh(rimGeo, new THREE.MeshBasicMaterial({
      color: 0xf2c14e, transparent: true, opacity: 0.55, depthWrite: false,
    }));
    rim.scale.setScalar(0.65);
    rim.position.set(at.x, 0.06, at.z);
    scene.add(group, rim);
    pickups.push({ id, x: at.x, z: at.z, group, rim, t: 8 });
  }

  function removePickup(i) {
    const p = pickups[i];
    if (!p) return;
    scene.remove(p.group, p.rim);
    p.rim.material.dispose();
    pickups.splice(i, 1);
  }

  function update(dt, { playerPos } = {}) {
    if (cd > 0) cd = Math.max(0, cd - dt);
    for (let i = timedMods.length - 1; i >= 0; i--) {
      const m = timedMods[i];
      m.t -= dt;
      if (m.t <= 0) {
        stats.removeBySource(m.src);
        timedMods.splice(i, 1);
      }
    }
    if (!playerPos) return;
    for (let i = zones.length - 1; i >= 0; i--) {
      const z = zones[i];
      z.t += dt;
      z.tick -= dt;
      const left = Math.max(0, z.life - z.t);
      const inside = Math.hypot(playerPos.x - z.x, playerPos.z - z.z) <= radiusV();
      if (inside && !z.inside) {
        stats.addMod({ stat: 'attackSpeed', pct: hasteV(), src: z.src });
        stats.addMod({ stat: 'moveSpeed', pct: moveV(), src: z.src });
      } else if (!inside && z.inside) {
        stats.removeBySource(z.src);
      }
      z.inside = inside;
      if (z.tick <= 0) {
        z.tick = 0.35;
        for (const e of enemies.list) {
          if (!enemies.hittable(e)) continue;
          if (Math.hypot(e.pos.x - z.x, e.pos.z - z.z) > radiusV() + e.cfg.radius) continue;
          enemies.applySlow(e, { factor: slowV(), time: 0.55 });
          if (!z.seen.has(e.id)) {
            z.seen.add(e.id);
            if (onSlow) onSlow(e, z.id);
          }
        }
      }
      z.group.rotation.y += dt * 0.8;
      z.rim.rotation.z += dt * 0.35;
      z.disc.material.opacity = (0.07 + 0.035 * Math.sin(z.t * 4)) * Math.min(1, left * 2);
      z.rim.material.opacity = 0.48 * Math.min(1, left * 2);
      if (z.t >= z.life) removeZone(i);
    }
    for (let i = pickups.length - 1; i >= 0; i--) {
      const p = pickups[i];
      p.t -= dt;
      p.group.rotation.y += dt * 1.2;
      p.group.position.y = 0.08 + Math.sin(p.t * 4) * 0.04;
      if (Math.hypot(playerPos.x - p.x, playerPos.z - p.z) <= 0.9) {
        const src = `latte:pickup:${p.id}`;
        stats.addMod({ stat: 'moveSpeed', pct: 0.12, src });
        timedMods.push({ src, t: 4 });
        if (fx) fx.text(playerPos, '加急咖啡', { color: '#f2c14e', y: 1.5, size: 0.5 });
        if (onPickup) onPickup(p.id);
        removePickup(i);
      } else if (p.t <= 0) removePickup(i);
    }
  }

  function clearField() {
    for (let i = zones.length - 1; i >= 0; i--) removeZone(i);
    for (let i = pickups.length - 1; i >= 0; i--) removePickup(i);
    for (const m of timedMods) stats.removeBySource(m.src);
    timedMods.length = 0;
    cd = 0;
  }

  function reset() {
    clearField();
    for (const k of Object.keys(mods)) mods[k] = 0;
    shop.foam = false;
    shop.thermos = false;
    relicLv = 0;
    lastFail = '';
  }

  return {
    drop, dropPickup, update, reset, clearField,
    get owned() { return relicLv > 0; },
    get ready() { return relicLv > 0 && cd <= 0 && zones.length < capV(); },
    get cdLeft() { return cd; },
    get cdMax() { return cdMaxV(); },
    get progress() { return relicLv ? 1 - cd / cdMaxV() : 0; },
    get count() { return zones.length; },
    get cap() { return capV(); },
    get lastFail() { return lastFail; },
    setRelicLevel(n) { relicLv = Math.max(0, Math.min(3, Number(n) || 0)); },
    applyCard(card) {
      const put = (c) => {
        if (!c) return;
        if (c.stat === 'duration') mods.duration += c.flat;
        else if (c.stat === 'radius') mods.radius += c.flat;
        else if (c.stat === 'haste') mods.haste += c.flat;
        else if (c.stat === 'slow') mods.slow += c.flat;
        else if (c.stat === 'cd') mods.cdCut += c.flat;
        else if (c.stat === 'cap') mods.cap += c.flat;
      };
      put(card);
      for (const ex of (card.extra || [])) put(ex);
    },
    buyFoam() { if (shop.foam) return false; shop.foam = true; return true; },
    buyThermos() { if (shop.thermos) return false; shop.thermos = true; return true; },
    hasFoam: () => shop.foam,
    hasThermos: () => shop.thermos,
    bonuses: () => ({
      ...mods, cap: capV(), radius: +radiusV().toFixed(2), duration: +durationV().toFixed(2),
      haste: +hasteV().toFixed(3), move: +moveV().toFixed(3), slow: +slowV().toFixed(3),
      cdMax: +cdMaxV().toFixed(2), foam: shop.foam, thermos: shop.thermos, level: relicLv,
    }),
    snapshot: () => ({ ...mods, foam: shop.foam, thermos: shop.thermos }),
    restore(saved) {
      reset();
      if (!saved) return;
      for (const k of Object.keys(mods)) mods[k] = Number(saved[k]) || 0;
      shop.foam = !!saved.foam;
      shop.thermos = !!saved.thermos;
    },
    setCdMul(m) {
      cdMul = Math.max(0.1, Number(m) || 1);
      if (cd > 0) cd = Math.min(cd, cdMaxV());
    },
    // 第 118 块：法器增幅（火种 / 盲盒）
    setRelicAmp: (a) => { amp = { ...amp, ...(a || {}) }; },
    list: () => zones.map((z) => ({ id: z.id, x: +z.x.toFixed(2), z: +z.z.toFixed(2), t: +z.t.toFixed(2), life: z.life, inside: z.inside, seen: z.seen.size })),
    pickupCount: () => pickups.length,
    timedCount: () => timedMods.length,
  };
}
