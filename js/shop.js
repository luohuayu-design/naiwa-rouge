// ============================================================
// shop.js —— 流浪商人商店
//
// 规则（用户定案）：
//   · 每 3 回合触发一次（第 3/6/9/12 回合清空后，先三选一再商店；
//     第 15 回合是最后一关，清完直接结算不弹商店）；
//   · 用金币购买三类东西：生命药水 / 属性加成 / 武器（元素剑）；
//   · 一个商店可以连买多件（金币够就行），关掉继续打。
//   · **每次进店只随机摆 4 件**（第 9 块）：同一批货在本次商店里保持不变，
//     关掉再进来（下一回合）才重新抽 —— 所以每次逛店看到的东西都不一样。
//     抽签会先剔掉「现在买了也没用」的（没环剑时的剑类、满血时的药水），
//     池子不够 4 件才把它们放回来兜底。
//
// type 说明：
//   heal      立刻回复 amount 生命
//   healFull  立刻回满生命
//   stat      永久属性加成（flat/pct，走 stats.addMod）
//   sword     获得一把 kind 元素剑（needWeapon：没环剑时买不了）
//
// 第 11 块：每件货都带 rarity（0 普通 ~ 4 传说），店里按品质加权抽取 ——
// 幸运越高，摆出来的货越往金/红那一头走（见 rarity.js）。
// ============================================================
import { rarityWeight } from './rarity.js';

export const SHOP_ITEMS = [
  // ---------------- 生命药水 ----------------
  {
    id: 'potion', type: 'heal', amount: 3, price: 8,
    rarity: 0,
    glyph: '⚗', name: '生命药水',
    desc: '立刻回复 3.0 生命（不超上限）。可以多囤，战斗里买不到。',
  },
  {
    id: 'bigPotion', type: 'healFull', price: 18,
    rarity: 1,
    glyph: '🧪', name: '大生命药水',
    desc: '生命直接回满。贵，但关键时刻能续命。',
  },
  // ---------------- 属性加成（永久） ----------------
  {
    id: 'whetstone', type: 'stat', stat: 'attack', flat: 1, price: 15,
    rarity: 0,
    glyph: '🪨', name: '磨刀石',
    desc: '近战攻击力 +1.0（永久）。只加奶蛙自己的普攻，不加剑。',
  },
  {
    id: 'shell', type: 'stat', stat: 'maxHp', flat: 2, heal: 2, price: 14,
    rarity: 1,
    glyph: '🛡', name: '硬壳',
    desc: '生命上限 +2.0（永久），并把多出来的血补满。',
  },
  {
    id: 'feather', type: 'stat', stat: 'moveSpeed', pct: 0.08, price: 12,
    rarity: 0,
    glyph: '🪶', name: '轻羽',
    desc: '移动速度 +8%（永久）。跑得快就少挨打。',
  },
  {
    id: 'oilstone', type: 'stat', stat: 'attackSpeed', pct: 0.10, price: 16,
    rarity: 2,
    glyph: '🫗', name: '滑石粉',
    desc: '近战攻击速度 +10%（永久）。出手更密。',
  },
  // ---------------- 武器属性（永久，改武器自己的表） ----------------
  {
    id: 'swordOil', type: 'stat', scope: 'weapon', stat: 'swordDamage', pct: 0.15, price: 18,
    rarity: 2,
    needWeapon: true, glyph: '🫙', name: '剑油',
    desc: '剑伤害 +15%（永久）。只加环剑，不加主角普攻。',
  },
  {
    id: 'grindstone', type: 'stat', scope: 'weapon', stat: 'swordCrit', flat: 0.05, price: 22,
    rarity: 2,
    needWeapon: true, glyph: '🔪', name: '磨剑石',
    desc: '剑暴击率 +5%（永久）。环剑自己的暴击，与主角暴击无关。',
  },
  // ---------------- 武器（元素剑，永久 +1 把） ----------------
  {
    id: 'buyIron', type: 'sword', kind: 'iron', price: 20, needWeapon: true,
    rarity: 0,
    icon: 'assets/weapons/icon-iron.svg', name: '铁剑',
    desc: '环剑阵里永久 +1 把铁剑。剑多转得密，命中更稳。',
  },
  {
    id: 'buyPoison', type: 'sword', kind: 'poison', price: 26, needWeapon: true,
    rarity: 1,
    icon: 'assets/weapons/icon-poison.svg', name: '毒剑',
    desc: '命中后中毒：每秒 0.1 持续 5 秒（属性可升级）。适合磨血。',
  },
  {
    id: 'buyFrost', type: 'sword', kind: 'frost', price: 26, needWeapon: true,
    rarity: 1,
    icon: 'assets/weapons/icon-frost.svg', name: '冰剑',
    desc: '命中后减速 35% 持续 2.5 秒（属性可升级）。放投手风筝的好搭档。',
  },
  {
    id: 'buyThunder', type: 'sword', kind: 'thunder', price: 34, needWeapon: true,
    rarity: 2,
    icon: 'assets/weapons/icon-thunder.svg', name: '雷剑',
    desc: '命中时对附近 1 只怪连锁一道闪电（60% 伤害，可升级链数）。',
  },
  {
    id: 'buyLeech', type: 'sword', kind: 'leech', price: 38, needWeapon: true,
    rarity: 3,
    icon: 'assets/weapons/icon-leech.svg', name: '血剑',
    desc: '命中按伤害 15% 回血（属性可升级）。站撸的底气。',
  },
  // ---------------- 运气（第 11 块） ----------------
  {
    id: 'luckyCoin', type: 'stat', stat: 'luck', flat: 1, price: 34,
    rarity: 4,
    glyph: '🧿', name: '压胜钱',
    desc: '幸运 +1.0（永久）。三选一更容易出高稀有卡，之后每次进店也更容易碰到好货。',
  },
];

// 商店里买不到 / 已卖光时给出原因（渲染禁用态用）
export function itemLocked(item, ctx = {}) {
  if (item.needWeapon && !ctx.hasWeapon) return '第 5 回合获得环剑后解锁';
  if (item.type === 'heal' && ctx.hpFull) return '生命已满';
  return null;
}

// 每次进店摆几件
export const SHOP_SHOW = 4;

// 抽本次商店的货物：返回一个**不含重复**的物品数组（默认 4 件）。
// hasWeapon = 已拿到环剑（没有时剑类买了也用不了，先不进池）
// hpFull    = 满血（药水先不进池，否则白发一格；池子不够再兜底）
// luck      = 幸运：按品质加权（第 11 块），幸运高更容易摆出金/红货
// rng 可注入，测试里能固定结果。
export function rollShopItems(rng = Math.random, {
  hasWeapon = false, hpFull = false, count = SHOP_SHOW, luck = 0,
} = {}) {
  const usable = SHOP_ITEMS.filter((it) => !(it.needWeapon && !hasWeapon));
  const useful = hpFull
    ? usable.filter((it) => it.type !== 'heal' && it.type !== 'healFull')
    : usable;
  const rest = (useful.length >= count ? useful : usable).slice();
  // 按「品质系数 × 幸运」加权，不放回地抽 count 件。
  // ⚠️ want 必须先算：rest 会越抽越短，边抽边算会提前收工（少摆几件）。
  const want = Math.min(count, rest.length);
  const picked = [];
  while (picked.length < want) {
    const total = rest.reduce((a, it) => a + rarityWeight(it, luck), 0);
    let r = rng() * total;
    let idx = rest.length - 1;
    for (let i = 0; i < rest.length; i++) {
      r -= rarityWeight(rest[i], luck);
      if (r < 0) { idx = i; break; }
    }
    picked.push(rest.splice(idx, 1)[0]);
  }
  return picked;
}
