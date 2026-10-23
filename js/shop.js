// ============================================================
// shop.js —— 流浪商人商店
//
// 规则（用户定案）：
//   · 每 3 回合触发一次（第 3/6/9/12/15/18 回合清空后，先三选一再商店；
//     第 20 回合是最后一关，清完直接结算不弹商店）；
//   · 用金币购买：生命药水（进背包）/ 属性加成 / 武器（元素剑）/
//     自动炮台 / 随身法器（第 13 块）；
//   · 一个商店可以连买多件（金币够就行），关掉继续打；
//   · **同一件货一次进店只能买一件**（第 25 块改，2026-10-21 用户定）：
//     买完挂「售罄」，不能在一家店里反复叠同一件属性；下次进店（回合刷新）
//     重新上架。售罄状态由 main.js 的 shopSoldOut 维护（进店清零）。
//   · **每次进店只随机摆 4 件**（第 9 块）：同一批货在本次商店里保持不变，
//     关掉再进来（下一回合）才重新抽 —— 所以每次逛店看到的东西都不一样。
//     抽签会先剔掉「现在买了也没用」的（没环剑时的剑类、没到解锁回合的
//     法器、放满的炮台），池子不够 4 件才把它们放回来兜底。
//     药水**不再因为满血被剔**（第 13 块）：药水买进背包，满血也能囤。
//
// type 说明：
//   heal      药水进背包（第 13 块起不再立刻喝，作战中随时打开背包用）
//   stat      永久属性加成（flat/pct，走 stats.addMod）
//   sword     获得一把 kind 元素剑（needWeapon：没环剑时买不了）
//   turret    立一台自动炮台（本局永久，上限见 turret.js）
//   relic     随身法器（needRound：没到解锁回合不摆；最多 maxLevel 级）
//
// 第 11 块：每件货都带 rarity（0 普通 ~ 4 传说），店里按品质加权抽取 ——
// 幸运越高，摆出来的货越往金/红那一头走（见 rarity.js）。
// ============================================================
import { rarityWeight } from './rarity.js?v=68';
import { TURRET } from './turret.js?v=68';
import { RELIC_DEFS } from './relics.js?v=68';

export const SHOP_ITEMS = [
  // ---------------- 生命药水（第 13 块起：买进背包，作战中随时用） ----------------
  {
    id: 'potion', type: 'heal', amount: 3, price: 8,
    rarity: 0,
    glyph: '⚗', name: '生命药水',
    desc: '回复 3.0 生命（不超上限）。买进背包，作战中随时打开喝。',
  },
  {
    id: 'bigPotion', type: 'healFull', price: 18,
    rarity: 1,
    glyph: '🧪', name: '大生命药水',
    desc: '喝下直接回满。买进背包，关键时刻续命。',
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
    desc: '命中后直接把怪冻住 1.2 秒：定身期间它不能移动也不能攻击。放投手风筝、断骨骑冲锋都好用。',
  },
  {
    id: 'buyThunder', type: 'sword', kind: 'thunder', price: 34, needWeapon: true,
    rarity: 2,
    icon: 'assets/weapons/icon-thunder.svg', name: '雷剑',
    desc: '命中时一道闪电打到场上所有怪，每道 35% 伤害（属性可升级）。怪越密越是清场技。',
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
  // ---------------- 金钟罩（第 13 块） ----------------
  {
    id: 'aegisCharm', type: 'stat', stat: 'aegis', flat: 1, price: 36,
    rarity: 4,
    glyph: '🔔', name: '金钟罩符',
    desc: '每 15 秒护体 3 秒、完全无敌；多买一层周期缩短 1.5 秒（最快 10 秒）。',
  },
  // ---------------- 自动炮台（第 13 块）：买下就立起来，本局永久 ----------------
  {
    id: 'turret', type: 'turret', price: 32,
    rarity: 3,
    glyph: '🏹', name: '弩炮台',
    desc: `在身边立一台自动弩炮（最多 ${TURRET.MAX_COUNT} 台）：自己索敌射弩箭，弹道直、飞得快基本必中，本局一直都在。`,
  },
  // ---------------- 随身法器（第 13 块）：特定回合解锁，最多 3 级 ----------------
  {
    id: 'buySpikes', type: 'relic', relic: 'spikes', price: 28, needRound: 8,
    rarity: 3,
    glyph: '🔻', name: '地刺图样',
    desc: '主角周围周期性刺出石刺，对所有怪造成物理伤害。再买可升级（最多 3 级）。',
  },
  {
    id: 'buyFrostRing', type: 'relic', relic: 'frost', price: 30, needRound: 11,
    rarity: 3,
    glyph: '❄', name: '霜环图样',
    desc: '主角周围结一圈冰环：环内怪持续掉血并被减速。再买可升级（最多 3 级）。',
  },
  // ---------------- 第三关新增（第 29 块）：打断 / 反伤 / 震退 ----------------
  {
    id: 'buyBell', type: 'relic', relic: 'bell', price: 34, needRound: 9,
    rarity: 3,
    glyph: '🔔', name: '震钟图样',
    desc: '每几秒敲一圈钟波：打断蓄力与读条、把怪震退，还带一点伤害。再买可升级（最多 3 级）。',
  },
  {
    id: 'buyThorns', type: 'relic', relic: 'thorns', price: 30, needRound: 7,
    rarity: 3,
    glyph: '🌵', name: '棘甲图样',
    desc: '每次挨打，身边一圈的怪各吃一次反伤。被围住时的被动解场。再买可升级（最多 3 级）。',
  },
  {
    id: 'buyQuake', type: 'sword', kind: 'quake', price: 36, needWeapon: true,
    rarity: 3,
    icon: 'assets/weapons/icon-quake.svg', name: '震剑',
    desc: '环剑阵里 +1 把震剑。命中时 35% 概率震退目标并打断它的蓄力 / 读条。',
  },
  // ---------------- 第四关新增（第 35 块）：暖炉 ----------------
  {
    id: 'buyStove', type: 'relic', relic: 'stove', price: 32, needRound: 8,
    rarity: 3,
    glyph: '🔥', name: '暖炉图样',
    desc: '推着一只烧炭的油桶走：每秒灼烧身边一圈怪。高频低伤，专治雾里那种血少量大的小怪。再买可升级（最多 3 级）。',
  },
];

// 商店里买不到 / 已卖光时给出原因（渲染禁用态用）
// ctx: hasWeapon / round（当前回合）/ turretCount（场上炮台数）/ relicLevels（{spikes, frost}）
export function itemLocked(item, ctx = {}) {
  if (item.needWeapon && !ctx.hasWeapon) return '第 5 回合获得环剑后解锁';
  if (item.needRound != null && (ctx.round ?? 99) < item.needRound) {
    return `第 ${item.needRound} 回合后解锁`;
  }
  if (item.type === 'turret' && (ctx.turretCount ?? 0) >= TURRET.MAX_COUNT) {
    return `最多放 ${TURRET.MAX_COUNT} 台`;
  }
  if (item.type === 'relic') {
    const lv = (ctx.relicLevels || {})[item.relic] || 0;
    if (lv >= RELIC_DEFS[item.relic].maxLevel) return '已到满级';
  }
  return null;
}

// 每次进店摆几件
export const SHOP_SHOW = 4;

// 抽本次商店的货物：返回一个**不含重复**的物品数组（默认 4 件）。
// hasWeapon = 已拿到环剑（没有时剑类买了也用不了，先不进池）
// round     = 当前回合（没到解锁回合的法器不进池；缺省 99 = 全部可摆）
// luck      = 幸运：按品质加权（第 11 块），幸运高更容易摆出金/红货
// rng 可注入，测试里能固定结果。
export function rollShopItems(rng = Math.random, {
  hasWeapon = false, round = 99, turretCount = 0, relicLevels = null, count = SHOP_SHOW, luck = 0,
} = {}) {
  const usable = SHOP_ITEMS.filter((it) => {
    if (it.needWeapon && !hasWeapon) return false;
    if (it.needRound != null && round < it.needRound) return false;
    if (it.type === 'turret' && turretCount >= TURRET.MAX_COUNT) return false;
    if (it.type === 'relic' && (relicLevels?.[it.relic] || 0) >= RELIC_DEFS[it.relic].maxLevel) return false;
    return true;
  });
  const rest = usable.slice();
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
