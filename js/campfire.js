// ============================================================
// campfire.js —— 篝火 · 夜行骨币（第 19 块：局外成长）
//
// 设计原则（用户拍板）：**局外因素不能把难度吃掉**。
//   · 每簇火种只点一次（1 级，没有 II、III 级）
//   · 每项都很小：生命 +1、攻击 +8%、移速 +4%、幸运 +0.2 —— 合计约等于
//     两三张三选一的普通卡，地狱难度照旧凶
//   · 价格高：六项全点要 780 骨币，普通难度全通一局约 180 骨币
//   · 骨币只在「结算」发，和这一局打得多深、杀得多狠、选多难有关
//
// 骨币不进战斗 HUD，也不跨关结算 —— 它只存在于篝火边（主菜单）。
// 数据落在 profile.js 的 naiwa_rouge_profile_v1：
//   bones  余额（第 18 块就留好了字段）
//   camp   { id: 1 } 已点燃的火种
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
  diffMul: { normal: 1, nightmare: 1.4, hell: 1.8 },   // 难度倍率
  dailyMul: 1.25,   // 每日挑战（第 22 块）：同一颗种子只发一次好成绩，给一点额外
};

// 一局该发多少骨币。diffKey 用 profile().difficulty（normal / nightmare / hell）；
// extraMul 是「本局诅咒倍率」（第 21 块，curseMul）与每日挑战加成的乘积，默认 1。
export function bonesFor({ roundShown = 1, kills = 0, isWin = false } = {}, diffKey = 'normal', extraMul = 1) {
  const raw = Math.max(1, roundShown | 0) * BONE.perRound
    + Math.max(0, kills || 0) * BONE.perKill
    + (isWin ? BONE.win : 0);
  const extra = Number.isFinite(extraMul) && extraMul > 0 ? extraMul : 1;
  const mul = (BONE.diffMul[diffKey] || 1) * extra;
  return Math.max(0, Math.round(raw * mul));
}

export function diffBoneMul(diffKey = 'normal') {
  return BONE.diffMul[diffKey] || 1;
}

// ---------------- 火种表 ----------------
// mods 走 stats.addMod 的字段（stat / flat / pct），scope:'weapon' 落到武器表。
// coins / potion 是「开局补给」，由 main.js 在开局时发放。
export const CAMPFIRE = [
  {
    id: 'hide', name: '火种 · 厚皮', icon: '🫀', cost: 160,
    desc: '开局生命上限 +1（6 → 7）。多挨一下，就多一次转身的机会。',
    mods: [{ stat: 'maxHp', flat: 1 }],
  },
  {
    id: 'claw', name: '火种 · 尖爪', icon: '🐾', cost: 140,
    desc: '开局攻击力 +8%（1 → 1.08）。普攻涨一点点，环剑不吃这一项。',
    mods: [{ stat: 'attack', pct: 0.08 }],
  },
  {
    id: 'step', name: '火种 · 轻足', icon: '🌿', cost: 150,
    desc: '开局移动速度 +4%（4.40 → 4.58）。拉扯时脚下快半拍。',
    mods: [{ stat: 'moveSpeed', pct: 0.04 }],
  },
  {
    id: 'star', name: '火种 · 星屑', icon: '✨', cost: 130,
    desc: '开局幸运 +0.2。只让三选一与商店更容易出好东西，不加任何伤害。',
    mods: [{ stat: 'luck', flat: 0.2 }],
  },
  {
    id: 'purse', name: '布袋 · 铜板', icon: '🪙', cost: 90,
    desc: '开局多 30 金币。够在第一家摊子上先挑一件。',
    coins: 30,
  },
  {
    id: 'pouch', name: '行囊 · 小药', icon: '🧪', cost: 110,
    desc: '开局背包里就有 1 瓶小药（回 3 点血，战斗中按 B 喝）。',
    potion: 1,
  },
];

export const CAMP_BY_ID = Object.fromEntries(CAMPFIRE.map((c) => [c.id, c]));
export const CAMP_TOTAL_COST = CAMPFIRE.reduce((a, c) => a + c.cost, 0);

// ---------------- 已点燃 ----------------
export function campOwned() {
  const c = profile().camp;
  return c && typeof c === 'object' ? c : {};
}

export function campHas(id) {
  return !!campOwned()[id];
}

// 点火：余额够且没点过才成功。返回 { ok, bones, item, reason }
export function campBuy(id) {
  const item = CAMP_BY_ID[id];
  if (!item) return { ok: false, reason: 'noitem', bones: bones() };
  if (campHas(id)) return { ok: false, reason: 'owned', bones: bones(), item };
  if (bones() < item.cost) return { ok: false, reason: 'poor', bones: bones(), item };
  addBones(-item.cost);                  // 扣钱只在这里做，效果里不写负数
  const p = profile();
  if (!p.camp || typeof p.camp !== 'object') p.camp = {};
  p.camp[id] = 1;
  save();
  return { ok: true, bones: bones(), item };
}

// 把已点燃的火种落进这一局：返回要发的补给（金币 / 药水），
// 属性加成直接写进两套属性表（src='camp'，读档回放时靠它认出来）。
export function campApply(stats, wstats) {
  const out = { coins: 0, potion: 0, count: 0 };
  const owned = campOwned();
  for (const item of CAMPFIRE) {
    if (!owned[item.id]) continue;
    out.count++;
    if (item.coins) out.coins += item.coins;
    if (item.potion) out.potion += item.potion;
    for (const m of item.mods || []) {
      const target = m.scope === 'weapon' ? wstats : stats;
      target.addMod({ stat: m.stat, flat: m.flat || 0, pct: m.pct || 0, src: 'camp' });
    }
  }
  return out;
}
