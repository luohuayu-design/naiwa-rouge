// ============================================================
// campfire.js —— 篝火 · 夜行骨币（第 19 块：局外成长；第 23 块：多级）
//
// 设计原则（用户拍板）：**局外因素不能把难度吃掉**。
//   · 每簇火种可点 3 级（第 23 块从「只能点一次」改的，价格阶梯上涨）
//   · 每级都很小：生命 +1、攻击 +8%、移速 +4%、幸运 +0.2 —— 点满一簇
//     约等于两三张三选一，地狱难度照旧凶
//   · 价格阶梯：第一级原价，之后每级 ×1.6（第 1/2/3 级 = 1 : 1.6 : 2.56）
//   · 骨币只在「结算」发，和这一局打得多深、杀得多狠、选多难、打哪一关有关
//
// 骨币不进战斗 HUD，也不跨关结算 —— 它只存在于篝火边（主菜单）。
// 数据落在 profile.js 的 naiwa_rouge_profile_v1：
//   bones  余额（第 18 块就留好了字段）
//   camp   { id: 等级 } 已点燃的火种（老档案里的 1 表示 1 级，天然兼容）
// ============================================================

import { profile, save, bones, addBones } from './profile.js';

// ---------------- 骨币产出 ----------------
// 一局打完全程普通（20 回合 273 杀）：60 + 81 + 40 ≈ 181 骨币。
// 半路倒下（第 10 回合、约 80 杀）：30 + 24 ≈ 54 骨币 —— 输了也有进项，
// 但明显少于撑完的人，这是唯一「劝你再来一局」的钩子。
export const BONE = {
  perRound: 3,      // 每通过一个回合
  perKill: 0.3,     // 每只怪（最后一次性取整）
  win: 40,          // 通关额外奖励
  coinRate: 0.25,   // 第 23 块：局内没花完的金币按 4 : 1 折成骨币
  diffMul: { normal: 1, nightmare: 1.4, hell: 1.8 },   // 难度倍率
  dailyMul: 1.25,   // 每日挑战（第 22 块）：同一颗种子只发一次好成绩，给一点额外
  // 第 23 块：越往后的关卡越值钱（第二关是骨塔，怪更硬、路更长）
  levelMul: { 1: 1, 2: 1.4, 3: 1.8 },
};

export function coinBones(coins = 0) {
  return Math.floor(Math.max(0, Number(coins) || 0) * BONE.coinRate);
}

// 一局该发多少骨币。diffKey 用 profile().difficulty（normal / nightmare / hell）；
// extraMul 是「本局诅咒倍率」（第 21 块，curseMul）与每日挑战加成的乘积，默认 1。
// coins = 结算时还没花掉的金币，levelId = 打的是第几关（第 23 块加的两个参数，
// 老调用不传就是 0 / 1 关，数值和以前完全一致）。
export function bonesFor(
  { roundShown = 1, kills = 0, isWin = false, coins = 0, levelId = 1 } = {},
  diffKey = 'normal',
  extraMul = 1,
) {
  const raw = Math.max(1, roundShown | 0) * BONE.perRound
    + Math.max(0, kills || 0) * BONE.perKill
    + (isWin ? BONE.win : 0)
    + coinBones(coins);
  const extra = Number.isFinite(extraMul) && extraMul > 0 ? extraMul : 1;
  const mul = (BONE.diffMul[diffKey] || 1) * extra;
  const lv = BONE.levelMul[levelId | 0] || 1;
  return Math.max(0, Math.round(raw * mul * lv));
}

export function diffBoneMul(diffKey = 'normal') {
  return BONE.diffMul[diffKey] || 1;
}

export function levelBoneMul(levelId = 1) {
  return BONE.levelMul[levelId | 0] || 1;
}

// ---------------- 火种表 ----------------
// mods 走 stats.addMod 的字段（stat / flat / pct），scope:'weapon' 落到武器表。
// coins / potion 是「开局补给」，由 main.js 在开局时发放。
//
// 第 23 块：每簇从「点一次」改成「可点 3 级」，**每级效果相同、价格阶梯上涨**。
// cost 是第 1 级的价格，第 N 级 = cost × CAMP_STEP^(N-1)。
export const CAMP_MAX_LEVEL = 3;
export const CAMP_STEP = 1.6;          // 每级涨价 60%（1 : 1.6 : 2.56）

export const CAMPFIRE = [
  {
    id: 'hide', name: '火种 · 厚皮', icon: '🫀', cost: 160, maxLevel: 3,
    desc: '每级开局生命上限 +1（1 级 7、3 级 9）。多挨一下，就多一次转身的机会。',
    mods: [{ stat: 'maxHp', flat: 1 }],
  },
  {
    id: 'claw', name: '火种 · 尖爪', icon: '🐾', cost: 140, maxLevel: 3,
    desc: '每级开局攻击力 +8%。普攻涨一点点，环剑不吃这一项。',
    mods: [{ stat: 'attack', pct: 0.08 }],
  },
  {
    id: 'step', name: '火种 · 轻足', icon: '🌿', cost: 150, maxLevel: 3,
    desc: '每级开局移动速度 +4%。拉扯时脚下快半拍。',
    mods: [{ stat: 'moveSpeed', pct: 0.04 }],
  },
  {
    id: 'star', name: '火种 · 星屑', icon: '✨', cost: 130, maxLevel: 3,
    desc: '每级开局幸运 +0.2。只让三选一与商店更容易出好东西，不加任何伤害。',
    mods: [{ stat: 'luck', flat: 0.2 }],
  },
  {
    id: 'purse', name: '布袋 · 铜板', icon: '🪙', cost: 90, maxLevel: 3,
    desc: '每级开局多 30 金币。够在第一家摊子上先挑一件。',
    coins: 30,
  },
  {
    id: 'pouch', name: '行囊 · 小药', icon: '🧪', cost: 110, maxLevel: 3,
    desc: '每级开局背包里多 1 瓶小药（回 3 点血，战斗中按 B 喝）。',
    potion: 1,
  },
];

export const CAMP_BY_ID = Object.fromEntries(CAMPFIRE.map((c) => [c.id, c]));

// 某一簇点满一共产多少级（用来算总价与文案）
export function campMaxLevel(item) {
  return Math.max(1, Math.min(CAMP_MAX_LEVEL, item && Number(item.maxLevel) || 1));
}

// 第 level+1 级的价格（level = 当前等级，0 表示还没点）
export function campCost(id, level = null) {
  const item = CAMP_BY_ID[id];
  if (!item) return 0;
  const cur = level == null ? campLevel(id) : Math.max(0, Math.floor(level));
  return Math.round(item.cost * Math.pow(CAMP_STEP, cur));
}

// 点满一簇要花的总价
export function campFullCost(id) {
  const item = CAMP_BY_ID[id];
  if (!item) return 0;
  let sum = 0;
  for (let i = 0; i < campMaxLevel(item); i++) sum += campCost(id, i);
  return sum;
}

// 全部点满的总价（面板页脚用）
export const CAMP_TOTAL_COST = CAMPFIRE.reduce((a, c) => a + campFullCost(c.id), 0);

// ---------------- 等级 ----------------
export function campOwned() {
  const c = profile().camp;
  return c && typeof c === 'object' ? c : {};
}

// 老档案里存的是 1（点过一次），读出来就是 1 级，不需要迁移
export function campLevel(id) {
  const n = Number(campOwned()[id]);
  if (!Number.isFinite(n) || n <= 0) return 0;
  const item = CAMP_BY_ID[id];
  return Math.min(campMaxLevel(item), Math.floor(n));
}

export function campHas(id) {
  return campLevel(id) > 0;
}

export function campMaxed(id) {
  const item = CAMP_BY_ID[id];
  return !!item && campLevel(id) >= campMaxLevel(item);
}

// 点火（升一级）：余额够、没到顶才成功。返回 { ok, bones, item, level, reason }
export function campBuy(id) {
  const item = CAMP_BY_ID[id];
  if (!item) return { ok: false, reason: 'noitem', bones: bones() };
  const cur = campLevel(id);
  if (cur >= campMaxLevel(item)) return { ok: false, reason: 'maxed', bones: bones(), item, level: cur };
  const price = campCost(id, cur);
  if (bones() < price) return { ok: false, reason: 'poor', bones: bones(), item, price, level: cur };
  addBones(-price);                      // 扣钱只在这里做，效果里不写负数
  const p = profile();
  if (!p.camp || typeof p.camp !== 'object') p.camp = {};
  p.camp[id] = cur + 1;
  save();
  return { ok: true, bones: bones(), item, level: cur + 1, price };
}

// 把已点燃的火种落进这一局：返回要发的补给（金币 / 药水），
// 属性加成直接写进两套属性表（src='camp'，读档回放时靠它认出来）。
// 等级 N = 同一份 mods 叠 N 次。
export function campApply(stats, wstats) {
  const out = { coins: 0, potion: 0, count: 0, levels: 0 };
  for (const item of CAMPFIRE) {
    const lv = campLevel(item.id);
    if (!lv) continue;
    out.count++;
    out.levels += lv;
    if (item.coins) out.coins += item.coins * lv;
    if (item.potion) out.potion += item.potion * lv;
    for (let i = 0; i < lv; i++) {
      for (const m of item.mods || []) {
        const target = m.scope === 'weapon' ? wstats : stats;
        target.addMod({ stat: m.stat, flat: m.flat || 0, pct: m.pct || 0, src: 'camp' });
      }
    }
  }
  return out;
}
