// ============================================================
// mark.js —— 第 14 件法器「落款」（第 118 块）
//
// 用户 2026-10-29 定案：「完善第十一关，设计多样法器配套技能」。
// 第十一关的主题是「谁记得谁」：空白在划掉别人的名字，你手里能做的
// 唯一一件事，就是**把名字写回去**。按下技能键，给最近的怪盖上一枚
// 「落款」：它会持续掉血，死的时候名字炸开（范围伤害）。
//
// 和墨丸（等人踩）、守夜烛（点灯改视野）互为三种打法：
//   墨丸 = 布场；守夜烛 = 改视野；落款 = 点杀 + 收割。
//
// 数值骨架同 mine.js：伤害 = 武器攻击 × 倍率，吃暴击与护甲；
// 目标数 / 持续伤害 / 爆炸范围 / 冷却各有独立通道，reset() 清零。
// ============================================================
import * as THREE from '../lib/three.module.js?v=135';
import { mitigate } from './stats.js?v=135';
import audio from './audio.js?v=135';

const CD_MAX = 14.0;        // 基础冷却
const CD_MIN = 5.0;         // 冷却下限
const TARGETS = 1;          // 一次落几个款
const DURATION = 5.0;       // 印记持续
const DPS_MUL = 0.9;        // 每秒伤害 = 武器攻击 × 0.9
const TICK = 0.5;
const BOOM_R = 1.8;         // 死亡时墨爆半径
const BOOM_MUL = 1.5;       // 墨爆伤害 = 武器攻击 × 1.5
const RANGE = 9.0;          // 索敌半径

const LV_TARGETS = [1, 2, 3];
const LV_DPS = [1, 1.2, 1.4];
const LV_BOOM = [1, 1.15, 1.3];

export function createMarkSystem({ scene, fx, enemies, wstats, onCast }) {
  const mods = { targets: 0, dpsPct: 0, boomR: 0, boomPct: 0, cdCut: 0 };
  const shop = { cinnabar: false, paper: false };
  let relicLv = 0;
  let cd = 0;
  let cdMul = 1;
  let amp = { dmg: 1, radius: 0, cd: 1, dur: 0 };
  let lastFail = '';
  const marks = [];   // { e, t, tickT, group, ring, x, z }

  const lvIdx = () => Math.min(2, Math.max(0, relicLv - 1));
  const targetsV = () => (relicLv > 0 ? LV_TARGETS[lvIdx()] : 1) + mods.targets;
  const durationV = () => DURATION + amp.dur;
  const dpsMulV = () => DPS_MUL * (relicLv > 0 ? LV_DPS[lvIdx()] : 1)
    * (1 + mods.dpsPct + (shop.cinnabar ? 0.25 : 0)) * amp.dmg;
  const boomRV = () => BOOM_R + mods.boomR + amp.radius;
  const boomMulV = () => BOOM_MUL * (relicLv > 0 ? LV_BOOM[lvIdx()] : 1)
    * (1 + mods.boomPct + (shop.paper ? 0.4 : 0)) * amp.dmg;
  const cdMaxV = () => Math.max(CD_MIN, (CD_MAX - mods.cdCut) * cdMul * amp.cd);

  // ---------------- 视觉 ----------------
  const ringGeo = new THREE.RingGeometry(0.42, 0.56, 26);
  function makeMark(e) {
    const group = new THREE.Group();
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
      color: 0xff6b5a, transparent: true, opacity: 0.85, depthTest: false,
      depthWrite: false, side: THREE.DoubleSide,
    }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.05;
    ring.renderOrder = 860;   // 雾里也看得见（HANDOFF §0.3 第 19 条）
    group.add(ring);
    const tick = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.26, 18), new THREE.MeshBasicMaterial({
      color: 0xffd0a8, transparent: true, opacity: 0.7, depthTest: false,
      depthWrite: false, side: THREE.DoubleSide,
    }));
    tick.rotation.x = -Math.PI / 2;
    tick.position.y = 0.06;
    tick.renderOrder = 861;
    group.add(tick);
    group.position.set(e.pos.x, 0, e.pos.z);
    scene.add(group);
    return group;
  }
  function dropVisual(m) {
    scene.remove(m.group);
    m.group.traverse((o) => { if (o.material) o.material.dispose(); });
  }

  // ---------------- 主逻辑 ----------------
  function press(playerPos) {
    if (!relicLv) { lastFail = 'lock'; return false; }
    if (cd > 0) { lastFail = 'cd'; return false; }
    const p = playerPos || { x: 0, z: 0 };
    const marked = new Set(marks.map((m) => m.e));
    const pool = enemies.list()
      .filter((e) => enemies.hittable(e) && !marked.has(e))
      .map((e) => ({ e, d: Math.hypot(e.pos.x - p.x, e.pos.z - p.z) }))
      .filter((o) => o.d <= RANGE)
      .sort((a, b) => a.d - b.d);
    if (!pool.length) { lastFail = 'none'; return false; }
    const n = Math.min(targetsV(), pool.length);
    for (let i = 0; i < n; i++) {
      const e = pool[i].e;
      marks.push({ e, t: durationV(), tickT: TICK, group: makeMark(e), x: e.pos.x, z: e.pos.z });
      if (fx && fx.ring) fx.ring({ x: e.pos.x, z: e.pos.z }, { from: 0.2, to: 0.9, color: 0xff6b5a, life: 0.3, opacity: 0.7, y: 0.1 });
    }
    cd = cdMaxV();
    if (audio && audio.sfx) audio.sfx('swordFire', { vol: 0.3 });
    if (onCast) onCast(n);
    return true;
  }

  function boomAt(x, z) {
    const R = boomRV();
    const base = wstats.get('swordDamage') * boomMulV();
    const crit = Math.random() < wstats.get('swordCrit');
    const raw = base * (crit ? wstats.get('swordCritMul') : 1);
    for (const e of enemies.list()) {
      if (!enemies.hittable(e)) continue;
      if (Math.hypot(e.pos.x - x, e.pos.z - z) > R + e.cfg.radius) continue;
      enemies.takeDamage(e, mitigate(raw, e.cfg.armor), crit, { cls: 'elem' });
    }
    if (fx && fx.ring) fx.ring({ x, z }, { from: 0.2, to: R, color: 0xff8a6a, life: 0.34, opacity: 0.8, y: 0.08 });
    if (fx && fx.burst) fx.burst({ x, z }, { color: 0xc0453a, count: 14, speed: 3.0, life: 0.4, size: 0.11, y: 0.3, up: 1.6, gravity: 5 });
  }

  function update(dt) {
    if (cd > 0) cd = Math.max(0, cd - dt);
    for (let i = marks.length - 1; i >= 0; i--) {
      const m = marks[i];
      m.t -= dt;
      m.tickT -= dt;
      const e = m.e;
      const alive = e && e.state !== 'dead' && e.hp > 0 && e.pos;
      if (alive) {
        m.x = e.pos.x; m.z = e.pos.z;
        m.group.position.set(m.x, 0, m.z);
        const k = 1 + Math.sin(m.t * 12) * 0.08;
        m.group.scale.setScalar(k);
      }
      // 死亡（或被清场）→ 名字炸开
      if (!alive) {
        boomAt(m.x, m.z);
        dropVisual(m);
        marks.splice(i, 1);
        continue;
      }
      if (m.tickT <= 0) {
        m.tickT += TICK;
        const raw = wstats.get('swordDamage') * dpsMulV() * TICK;
        const crit = Math.random() < wstats.get('swordCrit');
        enemies.takeDamage(e, mitigate(raw * (crit ? wstats.get('swordCritMul') : 1), e.cfg.armor), crit, { cls: 'elem' });
      }
      if (m.t <= 0) { dropVisual(m); marks.splice(i, 1); }
    }
  }

  function clearField() {
    for (const m of marks) dropVisual(m);
    marks.length = 0;
  }
  function reset() {
    clearField();
    mods.targets = 0; mods.dpsPct = 0; mods.boomR = 0; mods.boomPct = 0; mods.cdCut = 0;
    shop.cinnabar = false; shop.paper = false;
    relicLv = 0; cd = 0; lastFail = '';
  }

  function setRelicLevel(lv) { relicLv = Math.max(0, Math.min(3, lv | 0)); }
  function applyCard(card) {
    if (!card) return;
    if (card.targets) mods.targets += card.targets;
    if (card.dps) mods.dpsPct += card.dps;
    if (card.boomR) mods.boomR += card.boomR;
    if (card.boom) mods.boomPct += card.boom;
    if (card.cd) mods.cdCut += card.cd;
  }
  function buyCinnabar() { if (shop.cinnabar) return false; shop.cinnabar = true; return true; }
  function buyPaper() { if (shop.paper) return false; shop.paper = true; return true; }

  return {
    owned: () => relicLv > 0,
    level: () => relicLv,
    setRelicLevel,
    applyCard,
    buyCinnabar, buyPaper,
    hasCinnabar: () => shop.cinnabar,
    hasPaper: () => shop.paper,
    press,
    update,
    clearField,
    reset,
    count: () => marks.length,
    list: () => marks.map((m) => ({ x: m.x, z: m.z, t: m.t })),
    targets: () => targetsV(),
    ready: () => relicLv > 0 && cd <= 0,
    cdLeft: () => +cd.toFixed(3),
    cdMax: () => +cdMaxV().toFixed(3),
    progress: () => (cdMaxV() > 0 ? Math.max(0, Math.min(1, 1 - cd / cdMaxV())) : 1),
    range: () => RANGE,
    boomRadius: () => +boomRV().toFixed(3),
    dps: () => +(wstats.get('swordDamage') * dpsMulV()).toFixed(2),
    lastFail: () => lastFail,
    setCdMul: (m) => { cdMul = Math.max(0.2, m || 1); },
    setRelicAmp: (a) => { amp = { ...amp, ...(a || {}) }; },
    bonuses: () => ({
      ...mods, targets: targetsV(), duration: +durationV().toFixed(2),
      dpsMul: +dpsMulV().toFixed(3), boomR: +boomRV().toFixed(2),
      boomMul: +boomMulV().toFixed(3), cdMax: +cdMaxV().toFixed(2),
      cinnabar: shop.cinnabar, paper: shop.paper, level: relicLv,
    }),
    snapshot: () => ({ mods: { ...mods }, shop: { ...shop } }),
    restore: (s) => {
      if (!s) return;
      Object.assign(mods, s.mods || {});
      Object.assign(shop, s.shop || {});
    },
  };
}
