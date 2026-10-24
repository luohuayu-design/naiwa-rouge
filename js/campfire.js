// ============================================================
// campfire.js —— 篝火 · 夜行骨币（第 19 块：局外成长；第 23 块：多级）
//
// 设计原则（用户拍板）：**局外因素不能把难度吃掉**。
//   · 火种基本无限升级（第 27 块定案）：每级效果相同、价格阶梯上涨，不显示上限
//   · 每级都很小：生命 +1、攻击 +8%、移速 +4%、幸运 +0.2 —— 一次升级
//     约等于半张三选一，地狱难度照旧凶
//   · 价格阶梯：第一级原价，之后每级 ×1.35，越点越贵
//   · 骨币只在「结算」发，和这一局打得多深、杀得多狠、选多难、打哪一关有关
//
// 骨币不进战斗 HUD，也不跨关结算 —— 它只存在于篝火边（主菜单）。
// 数据落在 profile.js 的 naiwa_rouge_profile_v1：
//   bones  余额（第 18 块就留好了字段）
// camp   { id: 等级 } 已点燃的火种（数字等级，无限级，天然兼容老档案）
// ============================================================

import { profile, save, bones, addBones } from './profile.js?v=83';

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
  // 第 63 块补齐 4/5/6：以前 4 关以后没写，全部退回 1 倍 —— 打完最难的一关
  // 拿到的骨币跟第一关一样，这是漏的（第 35 块加第四关时就该补）。
  levelMul: { 1: 1, 2: 1.4, 3: 1.8, 4: 2.2, 5: 2.6, 6: 3.0 },
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
// 第 27 块（用户定案）：取消等级上限 —— 火种**基本无限升级**，不显示「能升几级」。
// 每级效果相同，价格**线性**上涨（CAMP_STEP 是每级加价的百分比，和关卡难度一样是线性的，
// 不再是早期的指数翻倍），越点越贵但增速恒定；第一档价格整体下调约 4 成，
// 让局外成长更快起步、更好地支撑难度梯度。
export const CAMP_STEP = 0.35;         // 每级加价 35%（线性：price = base × (1 + 0.35 × 当前等级)）

export const CAMPFIRE = [
  {
    id: 'hide', name: '火种 · 厚皮', icon: '🫀', cost: 90,
    desc: '每级开局生命上限 +1。多挨一下，就多一次转身的机会。',
    mods: [{ stat: 'maxHp', flat: 1 }],
  },
  {
    id: 'claw', name: '火种 · 尖爪', icon: '🐾', cost: 80,
    desc: '每级开局攻击力 +8%。普攻涨一点点，环剑不吃这一项。',
    mods: [{ stat: 'attack', pct: 0.08 }],
  },
  {
    id: 'step', name: '火种 · 轻足', icon: '🌿', cost: 85,
    desc: '每级开局移动速度 +4%。拉扯时脚下快半拍。',
    mods: [{ stat: 'moveSpeed', pct: 0.04 }],
  },
  {
    id: 'star', name: '火种 · 星屑', icon: '✨', cost: 75,
    desc: '每级开局幸运 +0.2。只让三选一与商店更容易出好东西，不加任何伤害。',
    mods: [{ stat: 'luck', flat: 0.2 }],
  },
  {
    id: 'edge', name: '火种 · 剑锋', icon: '🗡', cost: 110,
    desc: '每级剑伤害 +5%。喂给环上的剑，怪越硬越看得出来。',
    mods: [{ stat: 'swordDamage', pct: 0.05, scope: 'weapon' }],
  },
  {
    id: 'gale', name: '火种 · 疾风', icon: '🌀', cost: 100,
    desc: '每级攻击速度 +3%。弹幕更密，普攻的节奏更顺。',
    mods: [{ stat: 'attackSpeed', pct: 0.03 }],
  },
  {
    id: 'shell', name: '火种 · 铁壳', icon: '🛡', cost: 85,
    desc: '每级护甲 +0.12。怪撞你一下，你少掉一点。',
    mods: [{ stat: 'armor', flat: 0.12 }],
  },
  {
    id: 'purse', name: '布袋 · 铜板', icon: '🪙', cost: 50,
    // 第 54 块（用户定案）：每级 30 → 10。30 金币一档等于白送半家摊子，
    // 局内经济被它一个人抬起来了；10 金币是「少打两只怪」的量，叠几级才有味道。
    desc: '每级开局多 10 金币。一档不多，点几级才看得出差别。',
    coins: 10,
  },
  {
    id: 'pouch', name: '行囊 · 小药', icon: '🧪', cost: 60,
    desc: '每级开局背包里多 1 瓶小药（回 3 点血，战斗中按 B 喝）。',
    potion: 1,
  },
];

export const CAMP_BY_ID = Object.fromEntries(CAMPFIRE.map((c) => [c.id, c]));

// 第 level+1 级的价格（level = 当前等级，0 表示还没点）。无限级：永远有下一档。
export function campCost(id, level = null) {
  const item = CAMP_BY_ID[id];
  if (!item) return 0;
  const cur = level == null ? campLevel(id) : Math.max(0, Math.floor(level));
  return Math.round(item.cost * (1 + CAMP_STEP * cur));   // 线性：每级比上一档固定多 base×CAMP_STEP
}

// ---------------- 等级 ----------------
export function campOwned() {
  const c = profile().camp;
  return c && typeof c === 'object' ? c : {};
}

// 老档案里存的是数字等级；无限级后不再封顶，直接取整数
export function campLevel(id) {
  const n = Number(campOwned()[id]);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n);
}

export function campHas(id) {
  return campLevel(id) > 0;
}

// 点火（升一级）：余额够就成功 —— 没有等级上限。返回 { ok, bones, item, level, reason }
// free = true 时不查余额也不扣钱（第 30 块：管理员模式）
export function campBuy(id, free = false) {
  const item = CAMP_BY_ID[id];
  if (!item) return { ok: false, reason: 'noitem', bones: bones() };
  const cur = campLevel(id);
  const price = campCost(id, cur);
  if (!free && bones() < price) return { ok: false, reason: 'poor', bones: bones(), item, price, level: cur };
  if (!free) addBones(-price);           // 扣钱只在这里做，效果里不写负数
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
