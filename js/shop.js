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
import { rarityWeight } from './rarity.js?v=135';
import { TURRET } from './turret.js?v=135';
import { RELIC_DEFS } from './relics.js?v=135';

export const SHOP_ITEMS = [
  // ---------------- 生命药水（第 13 块起：买进背包，作战中随时用） ----------------
  // 第 87 块（用户定案）：药水**不售罄**（同店可反复买），价格下调 ——
  // 8 → 5 / 18 → 12。它现在是「钱够就能把血灌满」的续命位，
  // 和属性、剑、法器那种「一件就买断」的货分开算。
  {
    // 第 88 块：3 → 4 —— 上限从 6 抬到 10 以后，回 3 只顶 30%，一罐药会显得像开玩笑
    id: 'potion', type: 'heal', amount: 4, price: 5,
    rarity: 0,
    glyph: '⚗', name: '生命药水',
    desc: '回复 4.0 生命（不超上限）。买进背包，作战中随时打开喝；同一家店可以反复买。',
  },
  {
    id: 'bigPotion', type: 'healFull', price: 12,
    rarity: 1,
    glyph: '🧪', name: '大生命药水',
    desc: '喝下直接回满。买进背包，关键时刻续命；同一家店可以反复买。',
  },
  // ---------------- 属性加成（永久） ----------------
  {
    id: 'whetstone', type: 'stat', stat: 'attack', flat: 1, price: 15,
    rarity: 0,
    glyph: '🪨', name: '磨刀石',
    desc: '近战攻击力 +1.0（永久）。只加奶蛙自己的普攻，不加剑。',
  },
  {
    // 第 88 块：上限 2 → 4（血量存量转型）。价格刻意不跟着涨 —— 转型期要让人愿意买血。
    id: 'shell', type: 'stat', stat: 'maxHp', flat: 4, heal: 4, price: 14,
    rarity: 1,
    glyph: '🛡', name: '硬壳',
    desc: '生命上限 +4.0（永久），并把多出来的血补满。',
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
    // 第 89 块：暴击率整体削 1/3 → +5% 降 +3%，价格同步 22 → 18（和剑油同价）
    id: 'grindstone', type: 'stat', scope: 'weapon', stat: 'swordCrit', flat: 0.03, price: 18,
    rarity: 2,
    needWeapon: true, glyph: '🔪', name: '磨剑石',
    desc: '剑暴击率 +3%（永久）。环剑自己的暴击，与主角暴击无关。',
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
    desc: '命中点周围 7.0 格内每只怪都中毒：每秒 0.15 毒伤、持续 5 秒（属性可升级）。怪越挤越划算。',
  },
  {
    id: 'buyFrost', type: 'sword', kind: 'frost', price: 26, needWeapon: true,
    rarity: 1,
    icon: 'assets/weapons/icon-frost.svg', name: '冰剑',
    desc: '命中点周围 7.0 格内的怪全部冻住 1.6 秒（属性可升级）：定身期间不能移动也不能攻击。放投手风筝、断骨骑冲锋都好用。',
  },
  {
    id: 'buyThunder', type: 'sword', kind: 'thunder', price: 34, needWeapon: true,
    rarity: 2,
    icon: 'assets/weapons/icon-thunder.svg', name: '雷剑',
    desc: '命中时一道闪电打到场上所有怪（不限距离、不限只数），每道 45% 伤害（属性可升级）。怪越密越是清场技。',
  },
  {
    id: 'buyLeech', type: 'sword', kind: 'leech', price: 38, needWeapon: true,
    rarity: 3,
    icon: 'assets/weapons/icon-leech.svg', name: '血剑',
    desc: '按「这一剑对周围所有怪造成的总伤害 × 15%」回血（属性可升级）。一圈扫到五只就按五只的总伤害算。',
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
    desc: '环剑阵里 +1 把震剑。命中时周围 7.0 格内每只怪 35% 概率被震退 1.4 格，并打断它的蓄力 / 读条。',
  },
  // ---------------- 第四关新增（第 35 块）：暖炉 ----------------
  {
    id: 'buyStove', type: 'relic', relic: 'stove', price: 32, needRound: 8,
    rarity: 3,
    glyph: '🔥', name: '暖炉图样',
    desc: '推着一只烧炭的油桶走：每秒灼烧身边一圈怪。高频低伤，专治雾里那种血少量大的小怪。再买可升级（最多 3 级）。',
  },
  // ---------------- 第五关新增（第 63 块）：路口灯 ----------------
  {
    id: 'buyLantern', type: 'relic', relic: 'lantern', price: 34, needRound: 9, needLevel: 5,
    rarity: 3,
    glyph: '🏮', name: '路口灯',
    desc: '每几秒点亮一圈：圈里的雾鬼被迫显形、所有怪减速。全游戏唯一的反隐手段 —— 雾鬼隐身时能咬你，你却打不着它。再买可升级（最多 3 级）。',
  },
  // ---------------- 第六关新增（第 63 块）：绝缘斗篷 ----------------
  // 第 111 块：绝缘斗篷只对第六关的漏电地板有用，别的关摆了也只是一件薄披风
  // —— 所以它不能「第六关起都能抽到」，而是**只在第六关出售**（onlyLevel）。
  {
    id: 'buyInsulator', type: 'relic', relic: 'insulator', price: 32, needRound: 8, needLevel: 6, onlyLevel: 6,
    rarity: 3,
    glyph: '🧥', name: '绝缘斗篷',
    desc: '站在漏电地板上不掉血，反而把电导给身边的怪（每 0.5 秒结算一次）。第六关的地板本来是惩罚，穿上它就是武器。再买可升级（最多 3 级）。',
  },
  // ---------------- 第七关新增（第 71 块）：木鱼 ----------------
  {
    id: 'buyWoodfish', type: 'relic', relic: 'woodfish', price: 32, needRound: 8, needLevel: 7,
    rarity: 3,
    glyph: '🪵', name: '木鱼图样',
    desc: '井底捡的木鱼槌：主角挨打 / 击杀时震一圈，把身边怪击退并短暂定身。窄井里被围时的救命底牌。再买可升级（最多 3 级）。',
  },
  // ---------------- 第八关新增（第 84 块）：镇牌铃 ----------------
  // 用户定案：第 9 / 12 回合的商店**常驻**摆它（不参与抽签，见 SHOP_PINNED）。
  // 它不打架，只把寄存柜收牌的概率往下压 —— 属于「花钱买平安」那种法器。
  // 第 111 块：没有寄存柜的关卡里它什么也不做 → **只在第八关出售**（onlyLevel）。
  {
    id: 'buySeal', type: 'relic', relic: 'seal', price: 26, needRound: 9, needLevel: 8, onlyLevel: 8,
    rarity: 3,
    glyph: '🔕', name: '镇牌铃',
    desc: `挂在寄存柜门上的铜铃：掉牌概率从 ${Math.round(RELIC_DEFS.seal.tagChance[0] * 100)}% 压到 ${Math.round(RELIC_DEFS.seal.tagChance[1] * 100)}%，再买还能更低 —— 柜子攒得慢，寄存处看守就来得晚。挡回去的牌子每 ${RELIC_DEFS.seal.coinPer} 块化一枚骨币。`,
  },
  // ---------------- 第十关新增（第 107 块）：傀儡术 ----------------
  // 第十关起上架；第 12 回合的商店常驻摆它（SHOP_PINNED）—— 这是本关的
  // 头号新玩具，不让人抽不到。买到后技能栏多一颗「傀儡术」。
  {
    id: 'buyPuppet', type: 'relic', relic: 'puppet', price: 34, needRound: 8, needLevel: 10,
    rarity: 3,
    glyph: '🎎', name: '傀儡术',
    desc: '学会召傀：技能栏多一颗「傀儡术」。按下真暂停，在铁 / 雪傀儡里选一只召在脚下'
      + '—— 铁的不拉仇恨、两秒一拳（一拳 = 你攻击的 1.5 倍）；雪的替你挨打（追你的怪改去围殴它）、'
      + '雪球把怪推开但不伤人。同时最多一只，碎了等 40 秒冷却再召。再买可升级（最多 3 级）。',
  },
  // ---------------- 第 108 块：强化箭袋 ----------------
  // 箭雨一直只有技能本体、没有任何成长线（用户点名的缺口）。这是商店侧的
  // 买断强化：一局只能买一次（quiver 标记防重复），三选一的箭雨卡不受它影响。
  {
    id: 'buyQuiver', type: 'quiver', price: 26, needRound: 5,
    rarity: 2,
    glyph: '🏹', name: '强化箭袋',
    desc: '箭雨每次多落 5 支、每支伤害 +15%（一局只能买一次）。三选一的箭雨卡不受影响，可以继续叠。',
  },
  // ---------------- 第十一关新增（第 114 块）：墨丸 ----------------
  // 用户定案：「获得之后解锁技能按钮，按下一次就放下一个地雷，被怪物踩到
  // 瞬间触发范围伤害」+「有自己独立的升级卡和商店物品，要多样」。
  // 第 12 回合的商店常驻摆它（SHOP_PINNED）—— 这是本关的头号新玩具。
  {
    id: 'buyMine', type: 'relic', relic: 'mine', price: 32, needRound: 8, needLevel: 11,
    rarity: 3,
    glyph: '⚫', name: '墨丸',
    desc: '捡到空白的墨：技能栏多一颗「墨丸」。按下在脚下留一枚雷，怪踩到就炸开一片'
      + '（半径 2.6、伤害 = 你攻击的 2.5 倍），同屏最多 3 枚、冷却 8 秒。'
      + '雾里提前布好，让它们自己走过来。再买可升级（最多 3 级）。',
  },
  // 墨丸的两件买断强化（和「强化箭袋」同一个套路：一局各一次，与三选一的卡互不冲突）
  {
    id: 'buyInkSac', type: 'ink', ink: 'sac', price: 24, needRound: 5, needLevel: 11,
    rarity: 2,
    glyph: '🖋', name: '墨囊',
    desc: '墨丸同屏 +1 枚、伤害 +15%（一局只能买一次）。三选一的墨丸卡不受影响，可以继续叠。',
  },
  {
    id: 'buyInkThick', type: 'ink', ink: 'thick', price: 24, needRound: 9, needLevel: 11,
    rarity: 2,
    glyph: '🪣', name: '浓墨',
    desc: '墨丸炸得更开：半径 +0.5 格、冷却 −1.5 秒（一局只能买一次）。雾里看不清脚下时，大一圈就是多一条命。',
  },
  // ---------------- 第十二关新增（第 116 块）：苔藓拿铁 ----------------
  // 用户定案：「配套 2 件一次性商店强化」。和墨丸同一个套路（relic + 两件买断）。
  // 第 12 回合的商店常驻摆它（SHOP_PINNED）—— 这是本关的头号新玩具。
  {
    id: 'buyLatte', type: 'relic', relic: 'latte', price: 32, needRound: 8, needLevel: 12,
    rarity: 3,
    glyph: '☕', name: '苔藓拿铁',
    desc: '牛给你调一杯：技能栏多一颗「拿铁」。按下在脚下放一杯咖啡，圈里你加攻速 / 移速、怪被减速，'
      + '持续 5 秒、冷却 30 秒、同屏最多 1 杯。在车道边放一杯，把怪留在危险区，再借车收割。再买可升级（最多 3 级）。',
  },
  // 拿铁的两件买断强化（和「强化箭袋」「墨囊」同一个套路：一局各一次，与三选一的卡互不冲突）
  {
    id: 'buyLatteFoam', type: 'latte', latte: 'foam', price: 24, needRound: 5, needLevel: 12,
    rarity: 2,
    glyph: '🥛', name: '奶泡',
    desc: '拿铁持续 +2 秒、减速 +8%（一局只能买一次）。三选一的拿铁卡不受影响，可以继续叠。',
  },
  {
    id: 'buyLatteThermos', type: 'latte', latte: 'thermos', price: 24, needRound: 9, needLevel: 12,
    rarity: 2,
    glyph: '🫙', name: '保温杯',
    desc: '拿铁同屏 +1 杯、冷却 −4 秒（一局只能买一次）。多一杯，就能同时守住两条车道。',
  },
  // ---------------- 第十一关新增（第 118 块）：守夜烛 / 落款 ----------------
  // 用户定案：「完善第十一关，考虑设计多样法器配套技能」。
  // 两件都和墨丸一样：relic 本体（可升 3 级）+ 两件一局一次的买断强化。
  {
    id: 'buyCandle', type: 'relic', relic: 'candle', price: 30, needRound: 8, needLevel: 11,
    rarity: 3,
    glyph: '🕯', name: '守夜烛',
    desc: '钟楼守夜人的半截蜡：技能栏多一颗「守夜烛」。按下在脚下点一盏，持续 6 秒 ——'
      + '圈里怪被灼烧并减速，而且**圈内的雾会被照散**（第十一关唯一能主动开视野的法器）。'
      + '同屏 1 盏、冷却 22 秒。再买可升级（最多 3 级）。',
  },
  // 守夜烛的两件买断强化
  {
    id: 'buyCandleWax', type: 'candle', candle: 'wax', price: 20, needRound: 5, needLevel: 11,
    rarity: 2,
    glyph: '🪔', name: '蜡油',
    desc: '守夜烛持续 +1.5 秒、灼烧 +8%（一局只能买一次）。三选一的守夜烛卡不受影响，可以继续叠。',
  },
  {
    id: 'buyCandleShade', type: 'candle', candle: 'shade', price: 20, needRound: 9, needLevel: 11,
    rarity: 2,
    glyph: '🏮', name: '灯罩',
    desc: '守夜烛半径 +0.6 格、减速 +6%（一局只能买一次）。照得更远，雾里那块空地就更大。',
  },
  {
    id: 'buyMark', type: 'relic', relic: 'mark', price: 30, needRound: 8, needLevel: 11,
    rarity: 3,
    glyph: '📕', name: '落款',
    desc: '把名字写回去：技能栏多一颗「落款」。按下给最近的怪盖印，持续 5 秒掉血，'
      + '它死的时候名字炸开（半径 1.8、伤害 = 你攻击的 1.5 倍）。冷却 14 秒。再买可升级（最多 3 级）。',
  },
  // 落款的两件买断强化
  {
    id: 'buyMarkCinnabar', type: 'mark', mark: 'cinnabar', price: 20, needRound: 5, needLevel: 11,
    rarity: 2,
    glyph: '🔻', name: '朱砂',
    desc: '落款持续伤害 +25%（一局只能买一次）。三选一的落款卡不受影响，可以继续叠。',
  },
  {
    id: 'buyMarkPaper', type: 'mark', mark: 'paper', price: 20, needRound: 9, needLevel: 11,
    rarity: 2,
    glyph: '📜', name: '旧纸',
    desc: '落款墨爆伤害 +40%（一局只能买一次）。死时那一下炸得更疼，一堆怪挤一起时最划算。',
  },
];

// 第 118 块：付**夜行骨币**刷新（用户定案「本次进店递增、离店重置」）。
// 首刷 6 骨币，之后每刷一次 ×1.6，四舍五入 —— 6 / 10 / 15 / 25 / 39 …
// 每次打开商店时 main 把次数清零，所以不会跨店累计。
export const SHOP_REFRESH_BASE = 6;
export const SHOP_REFRESH_STEP = 1.6;
export function shopRefreshCost(n) {
  return Math.round(SHOP_REFRESH_BASE * Math.pow(SHOP_REFRESH_STEP, Math.max(0, n | 0)));
}

// 商店里买不到 / 已卖光时给出原因（渲染禁用态用）
// ctx: hasWeapon / round（当前回合）/ level（第几关）/ turretCount / relicLevels
// needLevel（第 63 块）：只在某几关起出现的货（路口灯、木鱼、傀儡术）。
//   缺省 99 = 不限制，老调用与老测试不用动。
// onlyLevel（第 111 块）：**只在某一关出现**的关卡专属货（绝缘斗篷 = 6、镇牌铃 = 8）。
//   needLevel 是「从第 N 关起都能抽到」，对这两件是错的 —— 它们离开本关就完全没用。
export function itemLocked(item, ctx = {}) {
  if (item.needWeapon && !ctx.hasWeapon) return '第 5 回合获得环剑后解锁';
  if (item.onlyLevel != null && (ctx.level == null ? 99 : Number(ctx.level)) !== item.onlyLevel) {
    return `只在第 ${item.onlyLevel} 关出售`;
  }
  if (item.needLevel != null && (ctx.level ?? 99) < item.needLevel) {
    return `第 ${item.needLevel} 关起才会出现`;
  }
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
  // 第 108 块：强化箭袋一局只能买一次（main 会把 arrowRain.hasQuiver() 传进来）
  if (item.type === 'quiver' && ctx.quiver) return '这一局已经强化过了';
  // 第 114 块：墨丸的两件买断货 —— 没学会墨丸之前摆了也没用
  if (item.type === 'ink') {
    if (!ctx.mineLevel) return '要先拥有「墨丸」';
    if (item.ink === 'sac' && ctx.inkSac) return '这一局已经买过了';
    if (item.ink === 'thick' && ctx.inkThick) return '这一局已经买过了';
  }
  // 第 116 块：拿铁的两件买断货 —— 没学会拿铁之前摆了也没用
  if (item.type === 'latte') {
    if (!ctx.latteLevel) return '要先拥有「苔藓拿铁」';
    if (item.latte === 'foam' && ctx.latteFoam) return '这一局已经买过了';
    if (item.latte === 'thermos' && ctx.latteThermos) return '这一局已经买过了';
  }
  // 第 118 块：守夜烛 / 落款的两件买断货
  if (item.type === 'candle') {
    if (!ctx.candleLevel) return '要先拥有「守夜烛」';
    if (item.candle === 'wax' && ctx.candleWax) return '这一局已经买过了';
    if (item.candle === 'shade' && ctx.candleShade) return '这一局已经买过了';
  }
  if (item.type === 'mark') {
    if (!ctx.markLevel) return '要先拥有「落款」';
    if (item.mark === 'cinnabar' && ctx.markCinnabar) return '这一局已经买过了';
    if (item.mark === 'paper' && ctx.markPaper) return '这一局已经买过了';
  }
  return null;
}

// 每次进店摆几件
export const SHOP_SHOW = 4;

// 第 84 块：**常驻货** —— 这几个回合进店时，这些货一定摆在架子上。
// 用户定案：「第 9 回合、12 回合的商店加入法器购买（不是随机，是常驻）」。
// 常驻只占固定格子（4 件里 1 件常驻 → 剩下 3 件照旧抽签），
// 而且**仍然要过可用性判定**：铃已满级 / 没到解锁回合时不会硬摆出来。
// 第 114 块：第 9 回合也钉上「墨丸」—— 第八关的镇牌铃和第十一关的墨丸
// 都挂在 9 这一格，靠 onlyLevel / needLevel 各自过滤，同一格互不干扰
// （第 8 关只摆铃、第 11 关只摆墨丸、第 10 关两件都被滤掉）。
export const SHOP_PINNED = { 9: ['buySeal', 'buyMine', 'buyLatte'], 12: ['buySeal', 'buyPuppet'] };

// 抽本次商店的货物：返回一个**不含重复**的物品数组（默认 4 件）。
// hasWeapon = 已拿到环剑（没有时剑类买了也用不了，先不进池）
// round     = 当前回合（没到解锁回合的法器不进池；缺省 99 = 全部可摆）
// luck      = 幸运：按品质加权（第 11 块），幸运高更容易摆出金/红货
// pinned    = 常驻货的 id 列表（第 84 块）：先占位，再抽其余的
// rng 可注入，测试里能固定结果。
export function rollShopItems(rng = Math.random, {
  hasWeapon = false, round = 99, level = 99, turretCount = 0, relicLevels = null, count = SHOP_SHOW, luck = 0, pinned = [],
} = {}) {
  const usable = SHOP_ITEMS.filter((it) => {
    if (it.needWeapon && !hasWeapon) return false;
    if (it.onlyLevel != null && Number(level) !== it.onlyLevel) return false;   // 第 111 块：关卡专属货只在那一关出现
    if (it.needLevel != null && level < it.needLevel) return false;
    if (it.needRound != null && round < it.needRound) return false;
    if (it.type === 'turret' && turretCount >= TURRET.MAX_COUNT) return false;
    if (it.type === 'relic' && (relicLevels?.[it.relic] || 0) >= RELIC_DEFS[it.relic].maxLevel) return false;
    return true;
  });
  // 常驻货先落位（可能是 0 件：没解锁 / 已满级 / id 写错都会自然跳过）
  const forced = [];
  for (const id of pinned) {
    const it = usable.find((x) => x.id === id);
    if (it && !forced.includes(it)) forced.push(it);
  }
  const rest = usable.filter((it) => !forced.includes(it));
  // 按「品质系数 × 幸运」加权，不放回地抽剩下的格子。
  // ⚠️ want 必须先算：rest 会越抽越短，边抽边算会提前收工（少摆几件）。
  const want = Math.max(0, Math.min(count, forced.length + rest.length) - forced.length);
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
  return forced.concat(picked);
}
