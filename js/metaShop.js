// ============================================================
// metaShop.js —— 局外商店 · 宝箱（第 58 块）
//
// 设计（用户定案）：
//   · 花夜行骨币买三种品质的宝箱（木 / 银 / 金），买到后**自动开启**；
//   · 开启**直接随机给 1 个属性变化**（盲盒，没有选择环节）；
//   · 开箱先掷「诅咒」判定：中诅咒 = **强制给 1 个负面**（不可躲）；
//     三档诅咒率依次 35% / 18% / 7% —— 高品箱更不容易踩雷；
//   · 不封顶：骨币可反复 farming，同一正向项可一直叠（和篝火同思路，
//     靠骨币成本自然兜底，局外因素不能把难度吃平靠的是「每次只给一点」）；
//   · 高品箱（银 / 金）有概率开出**稀有项**：永久拥有的法器、技能CD缩短。
//
// 所有效果都落进 profile().metaShop，由 main.js 在每局开局用 metaApply 注入：
//   · 属性加成 → stats/wstats.addMod，src='meta'（和篝火/火种并列，互不踩）；
//   · 永久法器 → relics.restore（每局开局自动 Lv，不占店内购买名额）；
//   · 技能CD缩短 → weapon/arrowRain 的 cdMul（万剑齐发 + 箭雨一起短）。
//
// 数值平衡原则（用户：平衡性要好）：
//   · 单次给的量很小（约等于篝火一两级），叠很多次才看得出来；
//   · 负面项与正面项一一对应，幅度一致，靠「诅咒率」而非「幅度」制造风险；
//   · 倍率 mag 只放大**百分比 / 小数型**加成，整数型（生命上限、同时命中）
//     按档位给，避免高品箱把生命上限刷成离谱数字。
// ============================================================
import {
  profile, bones, addBones, metaShopState, metaAddMod, metaGrantRelic,
  metaGrantSkillCd, metaLog, metaBought, save,
} from './profile.js?v=70';
import { RELIC_DEFS } from './relics.js?v=70';

// ---------------- 三档宝箱 ----------------
// tier 0/1/2 对应「最低可出现的池子档位」；mag 是木匣基准的强度倍率；
// special / specialW 只有银、金能出稀有项；curse 是诅咒（强制负面）概率。
export const BOXES = [
  { id: 'wood',   tier: 0, name: '木匣', icon: '📦', cost: 30,  curse: 0.35, mag: 1.0, special: false, specialW: 0 },
  { id: 'silver', tier: 1, name: '银匣', icon: '🎁', cost: 100, curse: 0.18, mag: 1.6, special: true,  specialW: 0.12 },
  { id: 'gold',   tier: 2, name: '金匣', icon: '🏆', cost: 280, curse: 0.07, mag: 2.4, special: true,  specialW: 0.28 },
];

export const BOX_BY_ID = Object.fromEntries(BOXES.map((b) => [b.id, b]));

// ---------------- 属性池 ----------------
// 每条：stat（走 stats 的 key）/ flat 或 pct / scope（weapon 走武器表）/
//   icon / name（buff 名）/ desc（属性名）/ minTier（最低可出现的宝箱档位）/
//   weight（摇中权重）/ int（是否为整数型，true 则按档位取整而非乘 mag）
// 正面池：
const POS = [
  { stat: 'maxHp',       flat: 1,    icon: '❤️', name: '强健', desc: '生命上限',   minTier: 0, weight: 1.0, int: true },
  { stat: 'attack',      pct: 0.06,  icon: '⚔️', name: '锋锐', desc: '攻击力',     minTier: 0, weight: 1.0 },
  { stat: 'moveSpeed',   pct: 0.03,  icon: '🥾', name: '轻捷', desc: '移动速度',   minTier: 0, weight: 1.0 },
  { stat: 'armor',       flat: 0.10, icon: '🛡️', name: '坚甲', desc: '防御',       minTier: 0, weight: 1.0 },
  { stat: 'goldRate',    flat: 0.05, icon: '🪙', name: '招财', desc: '金币掉落率', minTier: 0, weight: 0.9 },
  { stat: 'critRate',    flat: 0.03, icon: '✨', name: '锐眼', desc: '暴击率',     minTier: 0, weight: 0.9 },
  { stat: 'luck',        flat: 0.15, icon: '🍀', name: '鸿运', desc: '幸运',       minTier: 0, weight: 0.9 },
  { stat: 'swordDamage', pct: 0.04, scope: 'weapon', icon: '🗡️', name: '剑芒', desc: '环剑伤害', minTier: 0, weight: 1.0 },
  { stat: 'attackSpeed', pct: 0.02,  icon: '💨', name: '疾袭', desc: '攻击速度',   minTier: 0, weight: 0.9 },
  { stat: 'hpRegen',     flat: 0.20, icon: '🌿', name: '回春', desc: '生命回复',   minTier: 1, weight: 0.7 },
  { stat: 'lifesteal',   flat: 0.04, icon: '🩸', name: '嗜血', desc: '近战吸血',   minTier: 1, weight: 0.6 },
  { stat: 'multiHit',    flat: 1,    icon: '🎯', name: '连击', desc: '同时命中',   minTier: 1, weight: 0.45, int: true },
  { stat: 'critDamage',  pct: 0.10,  icon: '💥', name: '暴怒', desc: '暴击伤害',   minTier: 1, weight: 0.55 },
];

// 负面池（与正面一一对应，幅度一致；诅咒时强制给其中一条）
const NEG = [
  { stat: 'maxHp',       flat: 1,    icon: '💔', name: '孱弱', desc: '生命上限',   minTier: 0, weight: 1.0, int: true },
  { stat: 'attack',      pct: 0.05,  icon: '🪓', name: '钝兵', desc: '攻击力',     minTier: 0, weight: 1.0 },
  { stat: 'moveSpeed',   pct: 0.03,  icon: '🪨', name: '跛足', desc: '移动速度',   minTier: 0, weight: 1.0 },
  { stat: 'armor',       flat: 0.10, icon: '🥀', name: '破甲', desc: '防御',       minTier: 0, weight: 1.0 },
  { stat: 'goldRate',    flat: 0.05, icon: '🕳️', name: '漏财', desc: '金币掉落率', minTier: 0, weight: 0.9 },
  { stat: 'critRate',    flat: 0.03, icon: '🌑', name: '晦目', desc: '暴击率',     minTier: 0, weight: 0.9 },
  { stat: 'luck',        flat: 0.15, icon: '🥀', name: '厄运', desc: '幸运',       minTier: 0, weight: 0.9 },
  { stat: 'swordDamage', pct: 0.04, scope: 'weapon', icon: '🌫️', name: '剑锈', desc: '环剑伤害', minTier: 0, weight: 1.0 },
  { stat: 'attackSpeed', pct: 0.02,  icon: '🐌', name: '迟滞', desc: '攻击速度',   minTier: 0, weight: 0.9 },
  { stat: 'hpRegen',     flat: 0.20, icon: '🥀', name: '枯萎', desc: '生命回复',   minTier: 1, weight: 0.7 },
];

// 稀有项里可永久拥有的法器（不含任何一关才有的，全部 5 种都能常驻）
const RELIC_KINDS = Object.keys(RELIC_DEFS);
// 技能CD缩短每次乘的倍率（−12%）
export const SKILL_CD_MUL = 0.88;

// ---------------- 工具 ----------------
function pickWeighted(list, rng) {
  let total = 0;
  for (const e of list) total += e.weight;
  let r = rng() * total;
  for (const e of list) {
    r -= e.weight;
    if (r <= 0) return e;
  }
  return list[list.length - 1];
}

// 把一条属性按宝箱倍率算出最终数值，返回 { flat, pct, text }
function scaleMod(e, mag) {
  if (e.pct != null) {
    const v = +(e.pct * mag).toFixed(4);
    return { flat: 0, pct: v, text: `${Math.round(v * 1000) / 10}%` };
  }
  // flat
  if (e.int) {
    const v = Math.max(1, Math.floor((e.flat || 1) * mag + 0.0001));
    return { flat: v, pct: 0, text: `${v}` };
  }
  const v = +(e.flat * mag).toFixed(2);
  return { flat: v, pct: 0, text: `${v}` };
}

function effectText(e, mag, positive) {
  const s = scaleMod(e, mag);
  const sign = positive ? '+' : '−';
  // ⚠️ 第 59 块修的真 bug：负面项的 flat/pct 以前存的是**正数**（只有文案带减号），
  // 结果 metaApplyStats 把「诅咒」当正加成注入 —— 开箱踩雷反而变强。
  // 这里按正负落账，文案照旧用绝对值。
  const flat = positive ? s.flat : -s.flat;
  const pct = positive ? s.pct : -s.pct;
  return { flat, pct, effectText: `${e.desc} ${sign}${s.text}`, icon: e.icon, name: e.name, stat: e.stat, scope: e.scope || null };
}

// 挑一个还没满级的永久法器（都满级了返回 null，调用方回退到普通属性）
function pickRelicKind(rng) {
  const owned = metaShopState().relics || {};
  const avail = RELIC_KINDS.filter((k) => (Number(owned[k]) || 0) < RELIC_DEFS[k].maxLevel);
  if (!avail.length) return null;
  return avail[Math.floor(rng() * avail.length)];
}

// ---------------- 开箱结果（纯计算，不落账） ----------------
// 返回 { cursed, kind:'stat'|'relic'|'skillcd', ... }
export function rollBox(boxId, rng = Math.random) {
  const box = BOX_BY_ID[boxId];
  if (!box) return null;

  // 1) 诅咒判定 → 强制负面
  if (rng() < box.curse) {
    const pool = NEG.filter((e) => e.minTier <= box.tier);
    const e = pickWeighted(pool, rng);
    const t = effectText(e, box.mag, false);
    return { cursed: true, kind: 'stat', mod: { stat: t.stat, flat: t.flat, pct: t.pct, scope: t.scope }, icon: t.icon, name: t.name, effectText: t.effectText, stat: t.stat, scope: t.scope, flat: t.flat, pct: t.pct };
  }

  // 2) 非诅咒：先看能不能出稀有项（银/金）
  if (box.special && rng() < box.specialW) {
    // 一半概率永久法器，另一半技能CD缩短；法器若已满级则回退为技能CD
    if (rng() < 0.5) {
      const kind = pickRelicKind(rng);
      if (kind) {
        const def = RELIC_DEFS[kind];
        return { cursed: false, kind: 'relic', relic: kind, icon: '🔮', name: `法器 · ${def.name}`, effectText: `永久拥有「${def.name}」Lv.1（每局开局自动生效）`, desc: def.desc[0] };
      }
    }
    return { cursed: false, kind: 'skillcd', mul: SKILL_CD_MUL, icon: '⏱️', name: '迅捷', effectText: `技能冷却 −${Math.round((1 - SKILL_CD_MUL) * 100)}%（万剑齐发 / 箭雨）` };
  }

  // 3) 普通正面属性
  const pool = POS.filter((e) => e.minTier <= box.tier);
  const e = pickWeighted(pool, rng);
  const t = effectText(e, box.mag, true);
  return { cursed: false, kind: 'stat', mod: { stat: t.stat, flat: t.flat, pct: t.pct, scope: t.scope }, icon: t.icon, name: t.name, effectText: t.effectText, stat: t.stat, scope: t.scope, flat: t.flat, pct: t.pct };
}

// ---------------- 购买并开箱（落账） ----------------
// admin=true 时不查余额也不扣钱（第 30 块：管理员模式测着方便）
// 返回 { ok, box, res, bones } 或 { ok:false, reason:'poor'|'nobox', ... }
export function buyBox(boxId, rng = Math.random, admin = false) {
  const box = BOX_BY_ID[boxId];
  if (!box) return { ok: false, reason: 'nobox' };
  if (!admin && bones() < box.cost) {
    return { ok: false, reason: 'poor', cost: box.cost, have: bones() };
  }
  if (!admin) addBones(-box.cost);     // 扣骨币只在这里做
  metaBought(boxId);

  const res = rollBox(boxId, rng);
  // 落账
  if (res.kind === 'stat') metaAddMod(res.mod);
  else if (res.kind === 'relic') metaGrantRelic(res.relic);
  else if (res.kind === 'skillcd') metaGrantSkillCd(res.mul);

  metaLog({
    box: boxId, boxName: box.name, cursed: res.cursed, kind: res.kind,
    icon: res.icon, name: res.name, effect: res.effectText, ts: Date.now(),
  });
  save();
  return { ok: true, box, res, bones: bones() };
}

// ---------------- 开局注入（纯属性，不碰任何实例） ----------------
// stat 页预览与每局开局都用它；不触发 weapon/arrowRain/relics，避免污染临时实例。
//
// 第 59 块两处加固：
//   1) **合并同项**：开箱记录是一条一条存的（开 500 次箱 = 500 条 mod），
//      以前一条一条 addMod，stats.get() 每帧要遍历 500 次 × 十几个属性 ——
//      开得越多战斗越卡。这里按「属性 + 作用域」求和，最多注入二十几条。
//   2) **生命上限兜底**：木匣诅咒率 35%，长期踩雷能把 maxHp 扣到 0（开局即死）。
//      负向 maxHp 最多扣到「不含局外商店加成时剩 1 点」。
export function metaApplyStats(stats, wstats) {
  const s = metaShopState();
  stats.removeBySource('meta');
  wstats.removeBySource('meta');

  const baseMaxHp = stats.get('maxHp');     // 此刻还没注入 meta，量到的是篝火/火种的底
  let hpLeft = Math.max(0, baseMaxHp - 1);  // 还能往下扣多少

  const agg = new Map();   // 'weapon|attack' -> { stat, scope, flat, pct }
  for (const m of (s.mods || [])) {
    if (!m || !m.stat) continue;
    const scope = m.scope === 'weapon' ? 'weapon' : '';
    let flat = Number(m.flat) || 0;
    const pct = Number(m.pct) || 0;
    if (scope === '' && m.stat === 'maxHp' && flat < 0) {
      if (hpLeft <= 0) continue;
      flat = -Math.min(-flat, hpLeft);
      hpLeft += flat;
    }
    const key = scope + '|' + m.stat;
    const cur = agg.get(key);
    if (cur) { cur.flat += flat; cur.pct += pct; }
    else agg.set(key, { stat: m.stat, scope, flat, pct });
  }
  for (const a of agg.values()) {
    if (!a.flat && !a.pct) continue;
    const target = a.scope === 'weapon' ? wstats : stats;
    target.addMod({ stat: a.stat, flat: a.flat, pct: a.pct, src: 'meta' });
  }
  return agg.size;
}

// ---------------- 开局注入（含实例：技能CD + 永久法器） ----------------
// 只在「真的开局这一局」时调用（fresh start）；resume 走 main.js 的合并逻辑。
export function applyMeta(stats, wstats, { weapon, arrowRain, relics } = {}) {
  metaApplyStats(stats, wstats);
  const s = metaShopState();
  const mul = Math.max(0.3, s.skillCdMul || 1);
  if (weapon && weapon.setCdMul) weapon.setCdMul(mul);
  if (arrowRain && arrowRain.setCdMul) arrowRain.setCdMul(mul);
  if (relics && relics.restore) relics.restore(s.relics || {});
  return mul;
}
