// ============================================================
// guillotine.js —— 第 16 件法器「裁纸刀」（第 124 块，第十四关起上架）
// ============================================================
// 剧情出处：s14「钟楼里没有钟」—— 那台一直在吐纸的旧机器，
// 它裁纸的那把刀。玩家抢到手，能挥的就是**这机器的节拍**。
//
// 机制：按下 → 身前 6 / 7 / 8 格、宽 3.4 格里的一切被横着切一刀，
// 命中怪掉「最大生命 30% / 40% / 50%」，并被打退；冷却 30 / 26 / 22 秒。
//
// 为什么要按**最大生命百分比**而不是固定攻击力：
// 它是这一关唯一的「破甲刀」—— 打立牌（正面减伤 75%）、打称量官、打精英，
// 固定伤害会被减伤链吃掉，百分比不会（减伤仍然生效，但基数是血量不是攻击）。
// 同一只怪被同一局里的刀反复切，第二刀起只算 55%，最低 25%
// （防止「一直按技能把 BOSS 削成纸」）。
//
// 和场地上的「裁切刀」（cutter.js）是两回事：那个是机器的节拍、躲的；
// 这个是玩家手里的、要瞄准的。名字刻意区分，别混成同一套。
//
// 数值骨架和 board.js / candle.js 同一套（三级 + 卡片 + 两件商店货 + 存档）。
// ============================================================
import * as THREE from '../lib/three.module.js?v=142';

// 三级数值：百分比 / 冷却 / 射程
const LV_CUT = [0.30, 0.40, 0.50];
const LV_CD = [30.0, 26.0, 22.0];
const LV_RANGE = [6.0, 7.0, 8.0];

const CD_MIN = 12.0;
const CUT_WIDTH = 3.4;      // 判定横向总宽（格）
const CUT_NEAR = 0.5;       // 身前这么近之内不算（贴脸时别把刀挥过头顶）
const REPEAT_MUL = 0.55;    // 同一只怪第二刀起递减
const REPEAT_FLOOR = 0.25;  // 递减下限
const KNOCK_DIST = 1.6;

// 对外只读表（测试 / 商店文案要查）
export const GUILLOTINE_LEVELS = {
  cut: LV_CUT,
  cd: LV_CD,
  range: LV_RANGE,
  width: CUT_WIDTH,
};

// 判定：以 (px,pz) 为原点、朝向 yaw（atan2(dx,dz) 约定）的一个矩形。
// 和画面上的刀光同源 —— 刀光就是按 range / width 摆的（「画在这、打在那」）。
export function guillotineHit(x, z, px, pz, yaw, range, width) {
  const dx = x - px;
  const dz = z - pz;
  const s = Math.sin(yaw);
  const c = Math.cos(yaw);
  const fwd = dx * s + dz * c;        // 前向
  const right = dx * c - dz * s;      // 右向
  return fwd >= CUT_NEAR && fwd <= range && Math.abs(right) <= width * 0.5;
}

export function createGuillotineSystem({ scene, fx, enemies }) {
  const mods = { cut: 0, cd: 0, range: 0, width: 0 };
  const shop = { hone: false, grip: false };   // 磨刀石 / 握把（一局一次）
  let relicLv = 0;
  let cd = 0;
  let cdMul = 1;
  let amp = { cd: 1, dmg: 1, radius: 0 };
  let lastFail = '';
  let cuts = 0;          // 本局切了几刀（成就 / 调试用）
  let lastHits = 0;      // 最近一刀命中几只

  const idx = () => Math.min(2, Math.max(0, relicLv - 1));
  const cutV = () => LV_CUT[idx()] + mods.cut + (shop.hone ? 0.08 : 0);
  const rangeV = () => LV_RANGE[idx()] + mods.range + amp.radius + (shop.grip ? 0.8 : 0);
  const widthV = () => CUT_WIDTH + mods.width;
  const cdMaxV = () => Math.max(CD_MIN, LV_CD[idx()] - mods.cd) * cdMul * amp.cd;

  // ---------------- 刀光 ----------------
  // 一块横着的薄板 + 一道亮边：从玩家身前铺到 range，宽 width。
  // 每次挥刀复用同一个 mesh（只做显隐和缩放），不新建几何。
  const flash = new THREE.Group();
  flash.visible = false;
  const bladeMat = new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide,
  });
  const edgeMat = new THREE.MeshBasicMaterial({
    color: 0xfff3cf, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide,
  });
  const bladeMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), bladeMat);
  const edgeMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), edgeMat);
  bladeMesh.renderOrder = 8;
  edgeMesh.renderOrder = 9;
  flash.add(bladeMesh, edgeMesh);
  scene.add(flash);
  let flashT = 0;        // 剩余可见时间
  const FLASH_LIFE = 0.26;

  function placeFlash(pos, yaw, range) {
    const w = widthV();
    const mid = CUT_NEAR + (range - CUT_NEAR) * 0.5;
    const len = range - CUT_NEAR;
    // 刀光本身：长条沿前向铺开，所以「平面的 z 边」对着前向
    bladeMesh.scale.set(w, 1, len);
    bladeMesh.position.set(0, 0, 0);
    edgeMesh.scale.set(w, 1, 0.20);
    edgeMesh.position.set(0, 0.004, len * 0.5);
    flash.position.set(pos.x + Math.sin(yaw) * mid, 0.06, pos.z + Math.cos(yaw) * mid);
    flash.rotation.y = yaw;
  }

  /**
   * 挥一刀。
   * @param {{x:number,z:number}} pos 玩家位置
   * @param {number} yaw 玩家朝向
   * @returns {boolean} 挥出去了没（没解锁 / 冷却 / 没敌人 → false）
   */
  function drop(pos, yaw = 0) {
    if (!relicLv) { lastFail = 'lock'; return false; }
    if (cd > 0) { lastFail = 'cd'; return false; }
    const p = pos || { x: 0, z: 0 };
    const range = rangeV();
    const w = widthV();
    const base = cutV();

    let hits = 0;
    if (enemies) {
      // 先收集再结算：被切死的怪会在 takeDamage 里被移出 list 的语义
      // （实际上 die 只改 state，但收集一遍更稳，也方便算命中数）
      const targets = [];
      for (const e of enemies.list) {
        if (!enemies.hittable(e)) continue;
        if (!guillotineHit(e.pos.x, e.pos.z, p.x, p.z, yaw, range, w)) continue;
        targets.push(e);
      }
      for (const e of targets) {
        const n = (e.guillotineHits || 0) + 1;
        e.guillotineHits = n;
        const decay = Math.max(REPEAT_FLOOR, Math.pow(REPEAT_MUL, n - 1));
        const raw = Math.max(6, (e.maxHp || 10) * base * decay) * amp.dmg;
        const killed = enemies.takeDamage(e, raw, true, { cls: 'phys' });
        if (enemies.knockback) {
          enemies.knockback(e, p.x + Math.sin(yaw) * (range + KNOCK_DIST), p.z + Math.cos(yaw) * (range + KNOCK_DIST), 1.4);
        }
        hits++;
        if (fx) {
          fx.text({ x: e.pos.x, z: e.pos.z }, '裁', {
            color: '#fff6d8', y: e.height * 1.0, size: 0.62,
          });
          fx.burst({ x: e.pos.x, z: e.pos.z }, {
            color: 0xf2ead6, count: 10, speed: 2.8, life: 0.42, size: 0.11, y: 0.55, up: 1.4,
          });
        }
        if (killed) continue;
      }
    }
    // 刀光即使没打到也要亮一下（不然按了没反馈，玩家会以为键坏了）
    placeFlash(p, yaw, range);
    flash.visible = true;
    flashT = FLASH_LIFE;
    bladeMat.opacity = 0.72;
    edgeMat.opacity = 0.95;
    if (fx) {
      fx.ring({ x: p.x + Math.sin(yaw) * (range * 0.6), z: p.z + Math.cos(yaw) * (range * 0.6) }, {
        from: 0.4, to: w * 0.6, color: 0xfff3cf, life: 0.24, opacity: 0.5, y: 0.08,
      });
    }
    cuts++;
    lastHits = hits;
    cd = cdMaxV();
    lastFail = '';
    return true;
  }

  function update(dt) {
    if (cd > 0) cd = Math.max(0, cd - dt);
    if (flashT > 0) {
      flashT = Math.max(0, flashT - dt);
      const k = flashT / FLASH_LIFE;
      bladeMat.opacity = 0.72 * k;
      edgeMat.opacity = 0.95 * k;
      if (flashT <= 0) flash.visible = false;
    }
  }

  function clearField() {
    flash.visible = false;
    flashT = 0;
  }

  function reset() {
    clearField();
    mods.cut = 0; mods.cd = 0; mods.range = 0; mods.width = 0;
    shop.hone = false; shop.grip = false;
    relicLv = 0; cd = 0; lastFail = ''; cuts = 0; lastHits = 0;
  }

  function setRelicLevel(lv) { relicLv = Math.max(0, Math.min(3, lv | 0)); }
  function applyCard(card) {
    if (!card) return;
    if (card.cut) mods.cut += card.cut;
    if (card.cd) mods.cd += card.cd;
    if (card.range) mods.range += card.range;
    if (card.width) mods.width += card.width;
  }
  function buyHone() { if (shop.hone) return false; shop.hone = true; return true; }
  function buyGrip() { if (shop.grip) return false; shop.grip = true; return true; }

  return {
    owned: () => relicLv > 0,
    level: () => relicLv,
    setRelicLevel,
    applyCard,
    buyHone, buyGrip,
    hasHone: () => shop.hone,
    hasGrip: () => shop.grip,
    drop,
    update,
    clearField,
    reset,
    ready: () => relicLv > 0 && cd <= 0,
    cdLeft: () => +cd.toFixed(3),
    cdMax: () => +cdMaxV().toFixed(3),
    progress: () => (cdMaxV() > 0 ? Math.max(0, Math.min(1, 1 - cd / cdMaxV())) : 1),
    range: () => +rangeV().toFixed(3),
    width: () => +widthV().toFixed(3),
    cutPct: () => +(cutV() * 100).toFixed(1),
    hits: () => lastHits,
    totalCuts: () => cuts,
    lastFail: () => lastFail,
    setCdMul: (m) => { cdMul = Math.max(0.2, m || 1); },
    setRelicAmp: (a) => { amp = { ...amp, ...(a || {}) }; },
    bonuses: () => ({
      ...mods, cut: +(cutV() * 100).toFixed(1), range: +rangeV().toFixed(2), width: +widthV().toFixed(2),
      cdMax: +cdMaxV().toFixed(2), hone: shop.hone, grip: shop.grip, level: relicLv,
    }),
    snapshot: () => ({ mods: { ...mods }, shop: { ...shop } }),
    restore: (s) => {
      if (!s) return;
      Object.assign(mods, s.mods || {});
      Object.assign(shop, s.shop || {});
    },
  };
}
