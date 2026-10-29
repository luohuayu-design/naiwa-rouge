// ============================================================
// mine.js —— 第 11 件法器「墨丸」(第 114 块)
//
// 用户原话（2026-10-28）：「我想到一个放地雷，获得之后解锁技能按钮，
// 按下一次就放下一个地雷，被怪物踩到瞬间触发范围伤害」+「有自己独立的
// 升级卡和商店物品，要多样」。
//
// 皮做成「墨丸」：空白用笔把别人的一行划掉，你捡到的是它的墨 ——
// 你在雾里留下属于自己的那一点笔迹。第十一关整关都在讲「谁记得谁」，
// 一颗墨丸是唯一一个「你写的、怪来踩」的东西。
//
// 数值骨架（和 arrowRain / golem 同一套写法）：
//   伤害 = 武器攻击 × DMG_MUL × (1 + dmgPct)    ← 吃暴击与目标护甲
//   同屏上限 / 爆炸半径 / 冷却 各有独立通道，三选一卡和商店货都往这四个
//   通道里灌（mods），reset() 清零 —— 它们是**局内**成长，不跨局。
//
// 为什么不用「踩到才亮」的隐形雷：雾里本来就看不见，雷再隐形就变成
// 玩家自己都不知道自己布了什么。所以地上永远有一圈很淡的墨痕，
// 数量不多、看得见、踩上去才炸。
// ============================================================
import * as THREE from '../lib/three.module.js?v=134';
import { mitigate } from './stats.js?v=134';
import audio from './audio.js?v=134';

const DMG_MUL = 2.5;        // 基础伤害倍率（× 武器攻击）
const MAX_MINE = 3;         // 同屏最多几枚（法器等级 / 卡 / 商店都能加）
const MAX_CAP = 8;          // 硬上限：防止卡叠到把屏幕铺满
const RADIUS = 2.6;         // 爆炸半径
const TRIGGER_R = 0.9;      // 踩上的判定半径（加怪自己的碰撞半径）
const CD_MAX = 8.0;         // 冷却
const CD_MIN = 3.0;         // 冷却下限
const ARM_TIME = 0.30;      // 落地后的起爆延迟（刚放下不会立刻被自己踩到）
const CD_HARD_CAP = 24;     // 同屏最多同时存在多少枚"待炸"（含正在收尾的）

export function createMineSystem({ scene, fx, enemies, wstats }) {
  const mods = { dmgPct: 0, max: 0, radius: 0, cdCut: 0 };
  const shop = { sac: false, thick: false };   // 两件商店货的买断标记（一局一次）
  let relicLv = 0;                   // 法器等级（1~3，0 = 没买）
  let cd = 0;
  let cdMul = 1;                     // 局外商店的技能 CD 缩短
  // 第 118 块：火种（墨丸那一簇）/ 盲盒的法器增幅
  let amp = { dmg: 1, radius: 0, cd: 1 };
  let lastFail = '';
  let t = 0;
  const mines = [];                  // { x, z, ball, halo, age, armed, boomT, ring }
  const blasts = [];                 // 爆炸收尾：{ disc, mat, t }

  const maxV = () => Math.min(MAX_CAP, MAX_MINE + mods.max + (relicLv > 0 ? relicLv - 1 : 0));
  const radiusV = () => RADIUS + mods.radius + amp.radius + (shop.thick ? 0.5 : 0);
  const dmgMulV = () => DMG_MUL * (1 + mods.dmgPct + (shop.sac ? 0.15 : 0)) * (relicLv > 0 ? [1, 1, 1.25, 1.5][relicLv] : 1) * amp.dmg;
  const cdMaxV = () => Math.max(CD_MIN, (CD_MAX - mods.cdCut - (shop.thick ? 1.5 : 0)) * cdMul * amp.cd);

  // ---------------- 视觉 ----------------
  const ballGeo = new THREE.SphereGeometry(0.17, 12, 10);
  const ballMat = new THREE.MeshLambertMaterial({ color: 0x14141c, emissive: 0x3b2a52 });
  const haloGeo = new THREE.RingGeometry(0.42, 0.56, 26).rotateX(-Math.PI / 2);
  const haloMat = new THREE.MeshBasicMaterial({
    color: 0x8f7cf0, transparent: true, opacity: 0.35,
    depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
  });
  const blastGeo = new THREE.CircleGeometry(1, 36).rotateX(-Math.PI / 2);

  function drop(playerPos) {
    if (!relicLv) { lastFail = 'lock'; return false; }
    if (cd > 0) { lastFail = 'cd'; return false; }
    if (mines.length >= maxV()) { lastFail = 'full'; return false; }
    const p = playerPos || { x: 0, z: 0 };
    const ball = new THREE.Mesh(ballGeo, ballMat);
    ball.position.set(p.x, 0.22, p.z);
    ball.scale.setScalar(0.6);
    ball.frustumCulled = false;
    ball.renderOrder = 721;        // 墨丸本体也穿雾（同上）
    const halo = new THREE.Mesh(haloGeo, haloMat.clone());
    halo.position.set(p.x, 0.045, p.z);
    halo.frustumCulled = false;
    // 第 114 块：墨痕**穿雾**（排在雾层 700 之后）。这是玩家自己写下的东西，
    // 第十一关「看不见」的时候，地上这几圈墨是他唯一能记住的地图。
    halo.renderOrder = 720;
    scene.add(ball, halo);
    mines.push({ x: p.x, z: p.z, ball, halo, age: 0, armed: false });
    if (mines.length > CD_HARD_CAP) killMine(0);
    cd = cdMaxV();
    lastFail = '';
    audio.sfx('swordFire', { vol: 0.4 });
    if (fx) fx.ring({ x: p.x, z: p.z }, { from: 0.1, to: 0.9, color: 0x8f7cf0, life: 0.26, opacity: 0.55, y: 0.05 });
    return true;
  }

  function killMine(i) {
    const m = mines[i];
    if (!m) return;
    scene.remove(m.ball, m.halo);
    m.halo.material.dispose();
    mines.splice(i, 1);
  }

  function boom(m, i) {
    const R = radiusV();
    const base = wstats.get('swordDamage') * dmgMulV();
    const crit = Math.random() < wstats.get('swordCrit');
    const raw = base * (crit ? wstats.get('swordCritMul') : 1);
    let hit = 0;
    for (const e of enemies.list) {
      if (!enemies.hittable(e)) continue;
      const d = Math.hypot(e.pos.x - m.x, e.pos.z - m.z);
      if (d <= R + e.cfg.radius) {
        enemies.takeDamage(e, mitigate(raw, e.cfg.armor), crit, { cls: 'phys' });
        hit++;
      }
    }
    // 墨炸开：一圈深墨向外推 + 一块会淡掉的墨渍
    const disc = new THREE.Mesh(blastGeo, new THREE.MeshBasicMaterial({
      color: 0x1b1526, transparent: true, opacity: 0.62, depthWrite: false, side: THREE.DoubleSide,
    }));
    disc.position.set(m.x, 0.06, m.z);
    disc.scale.setScalar(R * 0.35);
    disc.frustumCulled = false;
    scene.add(disc);
    blasts.push({ disc, mat: disc.material, t: 0, R });
    if (fx) {
      fx.ring({ x: m.x, z: m.z }, { from: 0.2, to: R, color: 0x9a86ff, life: 0.34, opacity: 0.8, y: 0.07 });
      fx.burst({ x: m.x, z: m.z }, { color: 0x6a5ac0, count: 16, speed: 3.4, life: 0.45, size: 0.12, y: 0.3, up: 1.8, gravity: 5 });
      if (hit) fx.text({ x: m.x, z: m.z }, `墨 · ${hit}`, { color: '#bda6ff', y: 1.1, size: 0.55 });
    }
    if (hit) audio.sfx('swordHit', { vol: 0.55 });
    else audio.sfx('swordHit', { vol: 0.25 });
    killMine(i);
  }

  function update(dt, extra = {}) {
    t += dt;
    if (cd > 0) cd = Math.max(0, cd - dt);

    for (let i = mines.length - 1; i >= 0; i--) {
      const m = mines[i];
      m.age += dt;
      if (!m.armed && m.age >= ARM_TIME) m.armed = true;
      // 呼吸：墨丸自己轻轻缩一下，地上的墨痕转起来（一眼能看出它是活的）
      const k = 0.55 + 0.12 * Math.sin(m.age * 5.2);
      m.ball.scale.setScalar(k);
      m.ball.position.y = 0.22 + 0.03 * Math.sin(m.age * 3.1);
      m.halo.rotation.y += dt * 0.9;
      m.halo.material.opacity = 0.22 + 0.12 * Math.sin(m.age * 4.4);

      if (!m.armed) continue;
      // 踩雷：任何活怪进圈就炸（含正在出生的？不含 —— hittable 已经排除 spawn）
      for (const e of enemies.list) {
        if (!enemies.hittable(e)) continue;
        const d = Math.hypot(e.pos.x - m.x, e.pos.z - m.z);
        if (d <= TRIGGER_R + e.cfg.radius) { boom(m, i); break; }
      }
    }

    for (let i = blasts.length - 1; i >= 0; i--) {
      const b = blasts[i];
      b.t += dt;
      const k = Math.min(1, b.t / 0.5);
      b.disc.scale.setScalar(b.R * (0.35 + 0.75 * k));
      b.mat.opacity = 0.62 * (1 - k);
      if (k >= 1) {
        scene.remove(b.disc);
        b.mat.dispose();
        blasts.splice(i, 1);
      }
    }
  }

  function reset() {
    for (let i = mines.length - 1; i >= 0; i--) killMine(i);
    for (const b of blasts) { scene.remove(b.disc); b.mat.dispose(); }
    blasts.length = 0;
    cd = 0;
    mods.dmgPct = 0; mods.max = 0; mods.radius = 0; mods.cdCut = 0;
    shop.sac = false; shop.thick = false;
    relicLv = 0;
    lastFail = '';
  }

  // 换关 / 新局：只清场上的雷与冷却，**不动**法器等级与卡片加成
  function clearField() {
    for (let i = mines.length - 1; i >= 0; i--) killMine(i);
    for (const b of blasts) { scene.remove(b.disc); b.mat.dispose(); }
    blasts.length = 0;
    cd = 0;
  }

  return {
    drop, update, reset, clearField,
    get owned() { return relicLv > 0; },
    get ready() { return relicLv > 0 && cd <= 0 && mines.length < maxV(); },
    get cdLeft() { return cd; },
    get cdMax() { return cdMaxV(); },
    get progress() { return relicLv ? 1 - cd / cdMaxV() : 0; },
    get count() { return mines.length; },
    get cap() { return maxV(); },
    get lastFail() { return lastFail; },
    radius: () => radiusV(),
    // 法器等级由 main 每帧对账（relics 会因买 / 读档 / 换关变）
    setRelicLevel(n) { relicLv = Math.max(0, Math.min(3, Number(n) || 0)); },
    get relicLevel() { return relicLv; },
    // ---- 三选一卡入口 ----
    // card: { stat:'dmg'|'max'|'radius'|'cd', flat:N, extra:[{stat,flat}] }
    applyCard(card) {
      if (!card) return;
      const put = (c) => {
        if (!c) return;
        if (c.stat === 'dmg') mods.dmgPct += c.flat;
        else if (c.stat === 'max') mods.max += c.flat;
        else if (c.stat === 'radius') mods.radius += c.flat;
        else if (c.stat === 'cd') mods.cdCut += c.flat;
      };
      put(card);
      for (const ex of (card.extra || [])) put(ex);
    },
    // ---- 商店买断（各一局一次）----
    buySac() { if (shop.sac) return false; shop.sac = true; return true; },
    buyThick() { if (shop.thick) return false; shop.thick = true; return true; },
    hasSac: () => shop.sac,
    hasThick: () => shop.thick,
    bonuses: () => ({
      ...mods, cap: maxV(), radius: +radiusV().toFixed(2),
      dmgMul: +dmgMulV().toFixed(3), cdMax: +cdMaxV().toFixed(2),
      sac: shop.sac, thick: shop.thick, level: relicLv,
    }),
    // 存档：等级来自 relics（不重复存），卡片与商店货是局内的，跟着存档走
    snapshot: () => ({ ...mods, sac: shop.sac, thick: shop.thick }),
    restore(saved) {
      reset();
      if (!saved) return;
      mods.dmgPct = saved.dmgPct || 0;
      mods.max = saved.max || 0;
      mods.radius = saved.radius || 0;
      mods.cdCut = saved.cdCut || 0;
      shop.sac = !!saved.sac;
      shop.thick = !!saved.thick;
    },
    setCdMul(m) {
      cdMul = Math.max(0.1, Number(m) || 1);
      if (cd > 0) cd = Math.min(cd, cdMaxV());
    },
    // 第 118 块：法器增幅（火种 / 盲盒）
    setRelicAmp: (a) => { amp = { ...amp, ...(a || {}) }; },
    // 测试口
    list: () => mines.map((m) => ({
      x: +m.x.toFixed(2), z: +m.z.toFixed(2),
      age: +m.age.toFixed(2), armed: m.armed,
    })),
    blastCount: () => blasts.length,
  };
}
