// ============================================================
// board.js —— 第 15 件法器「纸立牌」（第 123 块，第十三关起上架）
// ============================================================
// 剧情出处：s13「流动的那块牌子」—— 那张画着你的两米立牌。
// 玩家能做的事，是把牌子**立在自己想让它在的地方**。
//
// 机制：按下在身前 2 格立一块牌，持续 6 / 8 / 10 秒（三级），
// **挡掉所有穿过它的敌方投掷物**（骨刀这类飞行弹道），
// 连「取景的」的快门都会被纸板吃掉（算它空拍），冷却 26 / 22 / 18 秒。
// 三级额外送第二块牌（错开 90° 立在另一侧）。
//
// 为什么是「挡弹道」而不是「加护甲」：这一关已经有立牌怪（正面减伤）了，
// 再来一个同样手感的防御就重复；而「预料到箭会从哪来、提前把牌挡在那儿」
// 是新的一层判断 —— 和前十几关的躲、绕、借刀都不一样。
//
// 实现要点：
//   · 牌是**逻辑对象先落地、模型后到**：加载完成前牌已经在挡弹道了，
//     不会出现「按了技能但前两秒没有判定」的坑。
//   · 判定用局部坐标（前向 ±0.35 格、横向 ±width），和画面上的牌同源。
//   · enemy.js 的弹道循环每帧问一句 ctx.blockShot(x, z)，命中就消掉；
//     「取景的」则是沿视线每 0.5 格采样一次 —— 两端取点会整块漏过去。
//
// 数值骨架和 candle.js / mine.js / latte.js 同一套：
//   持续 / 冷却 / 判定宽度 / 同时几块 各有独立通道，reset() 清零（局内成长，不跨局）。
// ============================================================
import * as THREE from '../lib/three.module.js?v=140';
import { GLTFLoader } from '../lib/jsm/loaders/GLTFLoader.js?v=140';
import { withV } from './assetUrl.js?v=140';

// 三级数值：时长 / 冷却 / 一次立几块
const LV_LIFE = [6.0, 8.0, 10.0];
const LV_CD = [26.0, 22.0, 18.0];
const LV_COUNT = [1, 1, 2];

const CD_MIN = 10.0;       // 冷却下限（卡叠满也不会变成无限立牌）
const BOARD_H = 2.60;      // 牌高（世界单位）：比主角高一截
const BOARD_HALF_W = 1.15; // 判定半宽基准（模型本身约 1.2 宽，判定略放一点水）
const BOARD_THICK = 0.35;  // 判定厚度（前后各 0.35 格）
const PLACE_AHEAD = 2.0;   // 立在身前多远

// 对外只读表（测试 / 商店文案要查）
export const BOARD_LEVELS = {
  life: LV_LIFE,
  cd: LV_CD,
  count: LV_COUNT,
};

export function createBoardSystem({ scene, fx }) {
  const boards = [];       // { x, z, yaw, life, lifeMax, mesh, t }
  const mods = { duration: 0, cd: 0, width: 0, count: 0 };
  const shop = { oil: false, brace: false };   // 两件商店货（一局一次）
  let relicLv = 0;
  let cd = 0;
  let cdMul = 1;                               // 局外技能 CD 缩短
  let amp = { cd: 1, dur: 0 };                 // 火种 / 盲盒的法器增幅
  let lastFail = '';

  let tpl = null;
  let loading = null;

  const idx = () => Math.min(2, Math.max(0, relicLv - 1));
  const widthV = () => BOARD_HALF_W + mods.width + (shop.oil ? 0.20 : 0);
  const lifeV = () => LV_LIFE[idx()] + mods.duration + (shop.oil ? 2.0 : 0) + amp.dur;
  const cdMaxV = () => Math.max(CD_MIN, LV_CD[idx()] - mods.cd) * cdMul * amp.cd;
  const capV = () => LV_COUNT[idx()] + mods.count + (shop.brace ? 1 : 0);

  // ---------------- 模型：KayKit「banner」（CC0，25KB） ----------------
  // 加载好之前逻辑照常工作，只是看不见 —— 见文件头「模型后到」那条。
  function loadTpl() {
    if (tpl) return Promise.resolve(tpl);
    if (loading) return loading;
    loading = (async () => {
      try {
        const gltf = await new GLTFLoader().loadAsync(withV('assets/props/paper-board.glb'));
        const root = gltf.scene;
        const box = new THREE.Box3().setFromObject(root);
        const h = Math.max(0.001, box.max.y - box.min.y);
        root.scale.setScalar(BOARD_H / h);
        const b2 = new THREE.Box3().setFromObject(root);
        root.position.y -= b2.min.y;        // 底部落地（模型原点是挂点，不在底边）
        root.traverse((o) => {
          if (!o.isMesh) return;
          o.castShadow = false;
          o.frustumCulled = false;
          if (!o.material) return;
          o.material = o.material.clone();
          // 这块布原本是 KayKit 的「横幅」，夜里在操场上是一片黑：
          //   ① 背面被 FrontSide 剔掉了 → 从背后看是一整块空洞，玩家会以为牌坏了
          //   ② 主光打在背面时整块掉进阴影，看不出是纸
          // 所以翻成双面 + 抬一点自发光（纸本来就是浅色、会被环境光反着照亮）。
          o.material.side = THREE.DoubleSide;
          if ('emissive' in o.material) {
            o.material.emissive = new THREE.Color(0x6a5f48);
            o.material.emissiveIntensity = 0.55;
          }
        });
        tpl = root;
      } catch (e) {
        console.warn('[board] 纸立牌模型加载失败（逻辑照常，画面缺一块牌）', e && e.message);
      }
      return tpl;
    })();
    return loading;
  }

  function attachMesh(b) {
    if (!tpl || b.mesh) return;
    const m = tpl.clone(true);
    // ⚠️ 模板根节点自己带 scale（BOARD_H / 源高度），克隆后**不能**直接 set，
    //    只能乘上去 —— 否则归一化那一步被覆盖，牌会变回原尺寸（KayKit 的 banner 很高）。
    const baseX = tpl.scale.x;
    const baseY = tpl.scale.y;
    const wMul = widthV() / BOARD_HALF_W;
    m.scale.set(baseX * wMul, baseY, baseY);
    m.position.set(b.x, 0, b.z);
    m.rotation.y = b.yaw;
    scene.add(m);
    b.mesh = m;
    b.baseX = baseX;
    b.baseY = baseY;
  }

  /**
   * 立一块牌。
   * @param {{x:number,z:number}} pos 主角位置
   * @param {number} yaw 主角朝向（atan2(dx, dz) 约定，和 enemy.js 一致）
   * @returns {boolean} 立成功了没（冷却 / 满场地 → false，不播音效）
   */
  function drop(pos, yaw = 0) {
    if (!relicLv) { lastFail = 'lock'; return false; }
    if (cd > 0) { lastFail = 'cd'; return false; }
    if (boards.length >= capV()) { lastFail = 'full'; return false; }
    const p = pos || { x: 0, z: 0 };
    // 一次能立几块：老牌还站着也算数，只立「还差的那几块」，不超上限
    const n = Math.min(capV() - boards.length, LV_COUNT[idx()]);
    for (let k = 0; k < n; k++) {
      // 第二块错开 90°：一块挡正面，一块挡侧面
      const a = yaw + (k === 0 ? 0 : Math.PI * 0.5);
      const b = {
        x: p.x + Math.sin(a) * PLACE_AHEAD,
        z: p.z + Math.cos(a) * PLACE_AHEAD,
        yaw: a,
        life: lifeV(),
        lifeMax: lifeV(),
        mesh: null,
        t: 0,
      };
      boards.push(b);
      if (tpl) attachMesh(b);
      else loadTpl().then(() => attachMesh(b));
      if (fx && fx.ring) fx.ring({ x: b.x, z: b.z }, { from: 0.2, to: 1.2, color: 0xf2ead6, life: 0.32, opacity: 0.55, y: 0.05 });
    }
    cd = cdMaxV();
    lastFail = '';
    return n > 0;
  }

  /** 判定：某个点是不是撞在某块牌上了（弹道每帧问一次） */
  function hitAt(x, z) {
    const hw = widthV();
    for (let i = 0; i < boards.length; i++) {
      const b = boards[i];
      const dx = x - b.x;
      const dz = z - b.z;
      const c = Math.cos(b.yaw);
      const s = Math.sin(b.yaw);
      // 前向 = (sin yaw, cos yaw)；右向 = (cos yaw, -sin yaw)
      const fwd = dx * s + dz * c;
      const right = dx * c - dz * s;
      if (Math.abs(fwd) <= BOARD_THICK && Math.abs(right) <= hw) return true;
    }
    return false;
  }

  function update(dt) {
    if (cd > 0) cd = Math.max(0, cd - dt);
    for (let i = boards.length - 1; i >= 0; i--) {
      const b = boards[i];
      b.t += dt;
      b.life -= dt;
      if (b.mesh) {
        // 最后 1 秒淡出 + 往下缩一点（「纸板塌下去」）
        const k = b.life < 1 ? Math.max(0, b.life) : 1;
        const s = 0.25 + 0.75 * k;
        b.mesh.scale.set(b.baseX, b.baseY * s, b.baseY * s);
        b.mesh.position.y = -0.35 * (1 - k);
      }
      if (b.life <= 0) {
        if (b.mesh) scene.remove(b.mesh);
        boards.splice(i, 1);
      }
    }
  }

  /** 清场（换关 / 重开）。牌是局内临时物，不该跨关存活。 */
  function clearField() {
    for (const b of boards) if (b.mesh) scene.remove(b.mesh);
    boards.length = 0;
  }

  function reset() {
    clearField();
    mods.duration = 0; mods.cd = 0; mods.width = 0; mods.count = 0;
    shop.oil = false; shop.brace = false;
    relicLv = 0; cd = 0; lastFail = '';
  }

  function setRelicLevel(lv) { relicLv = Math.max(0, Math.min(3, lv | 0)); }
  function applyCard(card) {
    if (!card) return;
    if (card.duration) mods.duration += card.duration;
    if (card.cd) mods.cd += card.cd;
    if (card.width) mods.width += card.width;
    if (card.count) mods.count += card.count;
  }
  function buyOil() { if (shop.oil) return false; shop.oil = true; return true; }
  function buyBrace() { if (shop.brace) return false; shop.brace = true; return true; }

  return {
    // ---- 技能栏 / 商店 / 存档要的一套（和 candle.js 同签名，main.js 直接照抄）----
    owned: () => relicLv > 0,
    level: () => relicLv,
    setRelicLevel,
    applyCard,
    buyOil, buyBrace,
    hasOil: () => shop.oil,
    hasBrace: () => shop.brace,
    drop,
    update,
    clearField,
    reset,
    /** 弹道判定：enemy.js 走 combatCtx.blockShot 转到这里 */
    blockShot: hitAt,
    hitAt,
    count: () => boards.length,
    cap: () => capV(),
    ready: () => relicLv > 0 && cd <= 0 && boards.length < capV(),
    cdLeft: () => +cd.toFixed(3),
    cdMax: () => +cdMaxV().toFixed(3),
    progress: () => (cdMaxV() > 0 ? Math.max(0, Math.min(1, 1 - cd / cdMaxV())) : 1),
    life: () => +lifeV().toFixed(3),
    width: () => +widthV().toFixed(3),
    lastFail: () => lastFail,
    setCdMul: (m) => { cdMul = Math.max(0.2, m || 1); },
    setRelicAmp: (a) => { amp = { ...amp, ...(a || {}) }; },
    list: () => boards.map((b) => ({ x: b.x, z: b.z, yaw: b.yaw, t: b.t, life: b.life })),
    bonuses: () => ({
      ...mods, cap: capV(), life: +lifeV().toFixed(2), width: +widthV().toFixed(2),
      cdMax: +cdMaxV().toFixed(2), oil: shop.oil, brace: shop.brace, level: relicLv,
    }),
    snapshot: () => ({ mods: { ...mods }, shop: { ...shop } }),
    restore: (s) => {
      if (!s) return;
      Object.assign(mods, s.mods || {});
      Object.assign(shop, s.shop || {});
    },
    preload: loadTpl,
  };
}
