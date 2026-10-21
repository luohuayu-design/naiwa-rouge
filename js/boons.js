// ============================================================
// boons.js —— 永夜火种（第 23 块：局外永久成长）
//
// 用户定案（2026-10-21）：
//   · 局内的一切加成不跨局保留（本来就是这样：每局 stats 从 base 重建）
//   · **通关一大关**之后额外触发 3 次「永久三选一」，直接写进局外档案
//   · 这 3 次的品质照旧吃幸运 —— 幸运越高越容易见到史诗 / 传说
//   · 局外因素不能吃掉难度：每张卡数值都很小，而且每项有层数上限
//
// 和 campfire.js 的分工：
//   campfire = 花骨币买，可控、可预期（想要的属性自己点，贵但稳）
//   boons    = 通关白给，抽签决定（今晚运气好，多一条路）
//   两者给的属性来源不同（src = 'camp' / 'boon'），开局各落一次账，互不覆盖。
//
// 数据落在 profile：
//   boons        { id: 层数 }
//   boonPending  还没领的永久选择次数（通关 +3；关页面也不丢，回标题会补弹）
// ============================================================

import { profile, save } from './profile.js';
import { rarityWeight } from './rarity.js';

// 每次通关给几次永久选择（用户定案：三次）
export const BOON_PICKS = 3;

// ---------------- 永久卡池 ----------------
// 数值原则：**一张卡 ≈ 一张局内普通卡的三分之一到一半**，而且全部有层数上限。
// 算一笔总账：每项满层合计约等于「生命 +3、攻击 +18%、移速 +9%、
// 攻速 +15%、范围 +0.45、防御 +21、回复 +0.36/s、掉钱 +15%、幸运 +1.1」，
// 再加上两张传说各一层 —— 大约是一局里 6~8 次三选一的分量，
// 需要通关好几轮才攒得出来，不会把噩梦走成平地。
//
// rarity 是抽签权重（rarity.js 的 mul × 幸运系数），不是「越稀有数值越大」的
// 唯一依据 —— 但高品质那几张确实更贵。
export const BOONS = [
  // ---------------- 普通 ----------------
  {
    id: 'b_bone', name: '坚骨', glyph: '🦴', rarity: 0, maxStack: 3,
    stat: 'maxHp', flat: 1,
    title: '生命上限 +1', desc: '下一局开局多 1 点血上限，叠三层就是 6 → 9。',
  },
  {
    id: 'b_claw', name: '利爪', glyph: '🐾', rarity: 0, maxStack: 3,
    stat: 'attack', pct: 0.06,
    title: '攻击力 +6%', desc: '只加奶蛙自己的普攻，环剑不吃这一项。',
  },
  {
    id: 'b_step', name: '快步', glyph: '🌿', rarity: 0, maxStack: 3,
    stat: 'moveSpeed', pct: 0.03,
    title: '移动速度 +3%', desc: '拉扯时脚下快半拍，跑圈更省力。',
  },
  {
    id: 'b_hand', name: '快手', glyph: '⚡', rarity: 0, maxStack: 3,
    stat: 'attackSpeed', pct: 0.05,
    title: '攻击速度 +5%', desc: '出手更密一点，和攻击力叠乘。',
  },
  // ---------------- 稀有 ----------------
  {
    id: 'b_reach', name: '长臂', glyph: '◎', rarity: 1, maxStack: 3,
    stat: 'attackRange', flat: 0.15,
    title: '攻击范围 +0.15', desc: '脚下那圈更大 —— 也意味着金币吸得更远。',
  },
  {
    id: 'b_hide', name: '铜皮', glyph: '🛡', rarity: 1, maxStack: 3,
    stat: 'armor', flat: 5,
    title: '防御 +5', desc: '减伤率 = 防御 /(100 + 防御)，叠三层约 13%。',
  },
  {
    id: 'b_purse', name: '拾荒', glyph: '🪙', rarity: 1, maxStack: 3,
    stat: 'goldRate', flat: 0.05,
    title: '金币掉落率 +5%', desc: '地上的钱多一点，商店里能挑的东西就多一点。',
  },
  // ---------------- 精良 ----------------
  {
    id: 'b_regen', name: '回春', glyph: '🌱', rarity: 2, maxStack: 3,
    stat: 'hpRegen', flat: 0.12,
    title: '生命回复 +0.12/秒', desc: '一场仗打下来能多回十几点，但救不了被围住的时候。',
  },
  {
    id: 'b_star', name: '星屑', glyph: '✨', rarity: 2, maxStack: 3,
    stat: 'luck', flat: 0.2,
    title: '幸运 +0.2', desc: '只让三选一和商店更容易出好东西，不加任何伤害。',
  },
  {
    id: 'b_eye', name: '锐目', glyph: '✦', rarity: 2, maxStack: 3,
    stat: 'critRate', flat: 0.05,
    title: '暴击率 +5%', desc: '近战命中时按概率打出 1.5 倍伤害。',
  },
  // ---------------- 史诗 ----------------
  {
    id: 'b_leech', name: '吸血', glyph: '🩸', rarity: 3, maxStack: 2,
    stat: 'lifesteal', flat: 0.03,
    title: '近战吸血 +3%', desc: '近战伤害按比例回血，环剑不吃这一项。',
  },
  {
    id: 'b_heavy', name: '重击', glyph: '💥', rarity: 3, maxStack: 2,
    stat: 'critDamage', pct: 0.12,
    title: '暴击伤害 +12%', desc: '没有暴击率时它一文不值 —— 两张一起拿才成套路。',
  },
  {
    id: 'b_plate', name: '厚甲', glyph: '🪨', rarity: 3, maxStack: 2,
    stat: 'armor', flat: 12,
    title: '防御 +12', desc: '比铜皮厚一倍多，被围住时能多撑两下。',
  },
  // ---------------- 传说 ----------------
  {
    id: 'b_double', name: '双拍', glyph: '✌', rarity: 4, maxStack: 1,
    stat: 'multiHit', flat: 1,
    title: '同时命中 +1', desc: '一次出手拍中两只不同的怪。只有一层，拿到就是永久改手感。',
  },
  {
    id: 'b_aegis', name: '不灭', glyph: '🔆', rarity: 4, maxStack: 1,
    stat: 'aegis', flat: 1,
    title: '金钟罩 +1 层', desc: '开局就有周期护体：每 15 秒无敌 3 秒。只有一层。',
  },
  {
    id: 'b_fate', name: '福星', glyph: '🍀', rarity: 4, maxStack: 2,
    title: '幸运 +0.5', stat: 'luck', flat: 0.5,
    desc: '幸运是唯一会「自己喂自己」的属性 —— 它让下一次抽到福星的概率也变高。',
  },
];

export const BOON_BY_ID = Object.fromEntries(BOONS.map((b) => [b.id, b]));

// ---------------- 档案读写 ----------------
function owned() {
  const o = profile().boons;
  return o && typeof o === 'object' ? o : {};
}

export function boonStacks(id) {
  const n = Number(owned()[id]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

export function boonOwned() {
  const out = {};
  for (const b of BOONS) {
    const n = boonStacks(b.id);
    if (n > 0) out[b.id] = n;
  }
  return out;
}

// 已叠的总层数（成就 / 面板统计用）
export function boonTotalStacks() {
  return BOONS.reduce((a, b) => a + boonStacks(b.id), 0);
}

export function boonPending() {
  const n = Number(profile().boonPending);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

// 通关发次数。写进档案 —— 玩家在结算界面直接关网页也不会把奖励弄丢。
export function grantBoons(n = BOON_PICKS) {
  const p = profile();
  p.boonPending = boonPending() + Math.max(0, Math.floor(n));
  save();
  return p.boonPending;
}

// 还没满层的卡（抽签池）。全满时返回空数组 —— 那时候面板不再弹。
export function boonPool() {
  return BOONS.filter((b) => boonStacks(b.id) < b.maxStack);
}

// 抽 count 张互不相同的卡。权重 = 品质系数 ×（1 + 幸运 × 该档系数），
// 和局内三选一用的是同一套 rarity.js，所以「幸运有用」这件事是连续的。
export function rollBoons(rng = Math.random, opts = {}) {
  const count = Math.max(1, Math.floor(opts.count ?? BOON_PICKS));
  const luck = Math.max(0, Number(opts.luck) || 0);
  const pool = boonPool();
  const out = [];
  while (out.length < count && pool.length) {
    let total = 0;
    for (const b of pool) total += Math.max(0.001, rarityWeight(b.rarity, luck));
    let r = rng() * total;
    let idx = pool.length - 1;
    for (let i = 0; i < pool.length; i++) {
      r -= Math.max(0.001, rarityWeight(pool[i].rarity, luck));
      if (r <= 0) { idx = i; break; }
    }
    out.push(pool.splice(idx, 1)[0]);
  }
  return out;
}

// 领取一张：层数 +1、待选次数 -1。返回 { ok, reason, boon, stacks }
export function takeBoon(id) {
  const boon = BOON_BY_ID[id];
  if (!boon) return { ok: false, reason: 'noboon' };
  const cur = boonStacks(id);
  // 先判「已满」再判「没次数」：对一张满层的卡，「到顶了」是更准确的拒绝理由
  if (cur >= boon.maxStack) return { ok: false, reason: 'maxed', boon, stacks: cur };
  if (boonPending() <= 0) return { ok: false, reason: 'nopending', boon };
  const p = profile();
  if (!p.boons || typeof p.boons !== 'object') p.boons = {};
  p.boons[id] = cur + 1;
  p.boonPending = Math.max(0, boonPending() - 1);
  save();
  return { ok: true, boon, stacks: cur + 1 };
}

// ---------------- 开局落账 ----------------
// 先按来源撤一次，保证重复开局 / 教程后重进不会叠加。
// 层数直接按次数调 addMod（同 src 多条会累加），不额外做乘方。
export function applyBoons(stats, wstats) {
  stats.removeBySource('boon');
  if (wstats) wstats.removeBySource('boon');
  let count = 0;
  for (const b of BOONS) {
    const n = boonStacks(b.id);
    if (!n) continue;
    const target = b.scope === 'weapon' ? (wstats || stats) : stats;
    for (let i = 0; i < n; i++) {
      target.addMod({ stat: b.stat, flat: b.flat || 0, pct: b.pct || 0, src: 'boon' });
    }
    count += n;
  }
  return count;
}

// 面板文案：这一项现在一共加了多少（第几层 / 上限）
export function boonStackText(b) {
  const n = boonStacks(b.id);
  return `${n} / ${b.maxStack}`;
}
