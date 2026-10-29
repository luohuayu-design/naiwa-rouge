// ============================================================
// upgrade.js —— 局内成长：回合结束的三选一
//
// 设计原则：
//   1. 每次只给 3 张，分别来自「进攻 / 生存 / 机动」三系 ——
//      保证不论抽到什么，玩家都要在「打得更疼 / 活得更久 / 走位更稳」之间取舍，
//      不会出现三张都是废牌（比如暴击率 0 时抽到暴伤）的尴尬。
//   2. 数值都按「一次选择 ≈ 一次可感知的提升」定：
//      攻击力 +1（前期最直观）、攻速 +18%、范围 +0.40、
//      生命 +2、防御 +0.3、回复 +0.05/秒；越界的数值由 stats 的统一公式兜住。
//      ⚠️ 第 73 块起这些只是「小档」：每条属性另有中档（≈1.8 倍）与大档
//      （≈3.2 倍），详见文件里 FAMILIES / TIERS 那一段。
//   3. 同一项可以重复抽到、重复叠加（src 里带序号，便于测试与回滚）。
//   4. **不同回合的概率不同**：每项的权重 = w0 + gw ×(回合-1)，逐回合线性变化。
//      前期攻击力、生命上限更容易出；后期暴击、吸血、剑系抬权重，
//      弱项（再生 / 纯移速）逐步降权。权重只在「同一系内」竞争 ——
//      三张卡仍然是三系各一张，所以每系的概率和为 100%。
//   5. **每张卡有品质**（第 11 块）：0 普通(灰) / 1 稀有(绿) / 2 精良(蓝) /
//      3 史诗(金) / 4 传说(红)。品质在抽签里是一层额外权重（rarity.js 的 mul），
//      「幸运」只放宽高品质那一头 —— 幸运越高，越容易见到史诗与传说。
//      三系各一张的规矩不变，所以高稀有卡的出现率是「系内概率 × 1/3」。
//
// 对外：
//   UPGRADES           全部升级项（tag: atk|def|mov；scope: player|weapon）
//   FAMILIES / TIERS   第 73 块的「属性族」与「小/中/大」三档（UPGRADES 由两者生成）
//   weightOf(up,round) 某项在某回合的权重（线性）
//   rollChoices(rng, {round, hasWeapon})  抽 3 张（三系各一，已洗牌）
//   chanceTable(round) 各系内每一项被抽中的概率（文档/测试用）
//   applyUpgrade()     应用并返回本次加成的来源标识
//   previewUpgrade()   预演一张升级（不改状态）
//   upgradeText()      一句话描述这次加成（面板 / 提示用）
//
// ⚠️ 第 6 块起属性分两块表：主角 stats 与武器 wstats 完全独立。
//   标了 scope:'weapon' 的项改的是武器表（剑系 / 元素系），其余改主角表。
//   两块表都要传进来，没传 wstats 时武器项会退化到主角表（只为兼容老调用）。
// ============================================================
import { STAT_DEFS } from './stats.js?v=137';
import { WEAPON_STAT_DEFS } from './weaponStats.js?v=137';
import { RARITIES, rarityWeight, oddsOf } from './rarity.js?v=137';

// 一张卡改的是哪块表
function tableFor(scope, stats, wstats) {
  return scope === 'weapon' ? (wstats || stats) : stats;
}

// 属性定义查两块表（面板/文案里要显示中文名）
function defFor(key, scope) {
  const main = scope === 'weapon' ? WEAPON_STAT_DEFS : STAT_DEFS;
  return main.find((d) => d.key === key)
    || STAT_DEFS.find((d) => d.key === key)
    || WEAPON_STAT_DEFS.find((d) => d.key === key);
}

// ============================================================
// 第 73 块：卡池从「一条属性一张卡」改成「一条属性三档」
//
// 旧池子 28 张，同一条属性永远只有一种数值 —— 拿到「攻击力 +1」就是 +1，
// 没有「这次手气好」的差别。现在每个**数值型**属性拆成三档：
//
//     小（灰 · 普通）  数值 = 旧版那一张，是稳定来源
//     中（绿 · 稀有 / 蓝 · 精良）  ≈ 1.8 倍，一局能见几次
//     大（金 · 史诗）  ≈ 3.2 倍，抽到就是肉眼可见的一大截
//
// 概率怎么分：档位自带权重系数 wf（0.62 / 0.28 / 0.10），再乘品质的稀有
// 系数（普通 1.00 / 稀有 0.92 / 精良 0.72 / 史诗 0.40）。于是一个属性内部
// 「抽到哪一档」≈ 68% / 28% / 4.4% —— 大档一整关能见一两次，整局能见五六次，
// 而幸运会把它往上抬（史诗 0.35/点，幸运 3 时约翻一倍）。
// 三档合计权重 ≈ 旧版那一张的 0.92 倍，所以**各属性之间的相对比例没变**，
// 只是每条属性内部多了粗细。期望收益约是旧版的 1.3 倍（大档拉高的那一截）。
//
// ⚠️ 三档拆不动的卡保持原样（放在 UNIQUE 里）：双拍 / 剑阵 / 金钟罩 /
//    福星 / 不灭 —— 它们给的是「+1 只 / +1 把 / +1 层 / 一组效果」，
//    没有中间值可言。
// ============================================================

// 三档：小 / 中 / 大。wf = 这条档位分到的权重比例（同一属性内三档相加 ≈ 1）
export const TIERS = [
  { key: 's', mark: '', name: '小', rarity: 0, wf: 0.62 },
  { key: 'm', mark: 'Ⅱ', name: '中', rarity: 1, wf: 0.28 },
  { key: 'l', mark: 'Ⅲ', name: '大', rarity: 3, wf: 0.10 },
];
// 原本就是「精良 / 史诗」身价的属性，中档抬到精良（蓝）—— 保持它们的身价
const RQ_FINE = [0, 2, 3];

// 数字显示：最多两位小数，去掉尾巴上的 0（0.60 → 0.6、2.00 → 2）
const trim = (v) => String(Number(v.toFixed(2)));
const pctTxt = (v) => `${Math.round(v * 100)}%`;

// ———— 属性族：一条属性一族，族内三档数值写死在 vals 里 ————
//   mode: 'flat' 加绝对值 / 'pct' 乘百分比（base 为 0 的属性只能用 flat）
//   vals: [小, 中, 大]
//   extras: 顺带一起给的副属性，同样三档
//   rq:    这一族三档各自的品质（默认 [普通, 稀有, 史诗]）
export const FAMILIES = [
  // ---------------- 进攻 · 主角 ----------------
  {
    id: 'edge', tag: 'atk', glyph: '⚔', name: '锋利', w0: 1.60, gw: -0.060,
    stat: 'attack', mode: 'flat', vals: [1, 2, 4],
    title: (v) => `攻击力 +${trim(v)}`,
    desc: () => '每次近战命中的基础伤害；前期一刀一只小兵，后期靠它把基数堆起来',
  },
  {
    id: 'haste', tag: 'atk', glyph: '⚡', name: '连击', w0: 1.00, gw: +0.030,
    stat: 'attackSpeed', mode: 'pct', vals: [0.18, 0.34, 0.60],
    title: (v) => `攻击速度 +${pctTxt(v)}`,
    desc: () => '出手更密，等效输出按这个比例往上叠；和攻击力是乘法关系',
  },
  {
    id: 'reach', tag: 'atk', glyph: '◎', name: '长臂', w0: 1.00, gw: +0.010,
    stat: 'attackRange', mode: 'flat', vals: [0.40, 0.72, 1.30],
    title: (v) => `攻击范围 +${trim(v)}`,
    desc: () => '脚下的圈更大，能先手拍到还没贴脸的怪',
  },
  {
    // 第 89 块：玩家「适当削弱暴击率的提升幅度」→ 三档各削约 1/3（15/27/48 → 10/18/32）。
    id: 'eye', tag: 'atk', glyph: '✦', name: '锐目', w0: 0.70, gw: +0.090,
    stat: 'critRate', mode: 'flat', vals: [0.10, 0.18, 0.32],
    title: (v) => `暴击率 +${pctTxt(v)}`,
    desc: () => '近战命中时按这个概率打出暴击；暴击有多疼看「致命」那条线',
  },
  {
    id: 'fang', tag: 'atk', glyph: '✧', name: '致命', w0: 0.50, gw: +0.180, rq: RQ_FINE,
    stat: 'critDamage', mode: 'pct', vals: [0.50, 0.90, 1.60],
    extras: [{ stat: 'critRate', mode: 'flat', vals: [0.04, 0.07, 0.12] }],
    title: (v, e) => `暴击伤害 +${pctTxt(v)} · 暴击率 +${pctTxt(e[0])}`,
    desc: () => '暴击更疼；自带一点暴击率，单独拿到也有收益',
  },
  {
    id: 'fortune', tag: 'atk', glyph: '🪙', name: '财运', w0: 0.70, gw: +0.020,
    stat: 'goldRate', mode: 'flat', vals: [0.10, 0.18, 0.32],
    title: (v) => `金币掉落率 +${pctTxt(v)}`,
    desc: () => '怪死掉时更容易掉金币，商店里多几件可选',
  },
  {
    // 用户（第 73 块）：「幸运 +1 数值一般，品质不该那么高」——
    // 小档从稀有降回普通，要更多幸运就得抽中/大档。
    id: 'luckUp', tag: 'atk', glyph: '🍀', name: '好运', w0: 0.55, gw: +0.050,
    stat: 'luck', mode: 'flat', vals: [1, 2, 3],
    title: (v) => `幸运 +${trim(v)}`,
    desc: () => '三选一更容易出精良以上的卡，商店也更容易摆出好货（面板「经济」里能看）',
  },

  // -------- 进攻 · 武器系（needsWeapon：第 5 回合拿到环剑后才进抽取池）--------
  //   scope:'weapon' = 改武器自己的属性表，与主角的攻击 / 暴击毫无关系。
  //   第 64 块把这一组整体翻倍过；第 73 块再拆三档，大档是肉眼可见的一大截。
  {
    id: 'swordEdge', tag: 'atk', glyph: '🗡', name: '剑刃', w0: 1.20, gw: +0.060,
    needsWeapon: true, scope: 'weapon',
    stat: 'swordDamage', mode: 'pct', vals: [0.60, 1.10, 2.00],
    title: (v) => `剑伤害 +${pctTxt(v)}`,
    desc: () => '直接放大环剑每一剑的伤害，与主角攻击力无关',
  },
  {
    id: 'swordCrit', tag: 'atk', glyph: '✦', name: '剑锋', w0: 0.90, gw: +0.070,
    needsWeapon: true, scope: 'weapon',
    stat: 'swordCrit', mode: 'flat', vals: [0.11, 0.19, 0.34],
    title: (v) => `剑暴击率 +${pctTxt(v)}`,
    desc: () => '环剑自己的暴击概率（基础 10%），不吃主角暴击率',
  },
  {
    id: 'swordFang', tag: 'atk', glyph: '✧', name: '淬锋', w0: 0.70, gw: +0.090, rq: RQ_FINE,
    needsWeapon: true, scope: 'weapon',
    stat: 'swordCritMul', mode: 'pct', vals: [0.80, 1.45, 2.60],
    title: (v) => `剑暴击伤害 +${pctTxt(v)}`,
    desc: () => '剑暴击时更疼；和剑锋一起拿收益最大',
  },
  {
    id: 'swordSpin', tag: 'atk', glyph: '⟳', name: '疾轮', w0: 1.00, gw: +0.020,
    needsWeapon: true, scope: 'weapon',
    stat: 'swordOrbit', mode: 'pct', vals: [0.50, 0.90, 1.60],
    title: (v) => `剑转速 +${pctTxt(v)}`,
    desc: () => '剑转得更快，同样时间扫过更多怪',
  },
  {
    id: 'swordForge', tag: 'atk', glyph: '⚒', name: '锻造', w0: 0.90, gw: +0.010,
    needsWeapon: true, scope: 'weapon',
    stat: 'swordRefill', mode: 'flat', vals: [-2.0, -3.5, -6.0],
    title: (v) => `剑匣补满 −${trim(Math.abs(v))} 秒`,
    desc: () => '整环补满所需的时间再缩短（无论几把剑都在时限内补满）',
  },
  // ---- 元素剑系（拿到对应剑才真正有意义，但只要有环剑就可抽；商店可买元素剑）----
  {
    id: 'venom', tag: 'atk', glyph: '☠', name: '淬毒', w0: 0.80, gw: +0.030, rq: RQ_FINE,
    needsWeapon: true, scope: 'weapon',
    stat: 'poisonDps', mode: 'flat', vals: [0.12, 0.22, 0.40],
    title: (v) => `毒伤 +${trim(v)}/秒`,
    desc: () => '毒剑的中毒更疼，且毒会铺满整片波及范围',
  },
  {
    id: 'chill', tag: 'atk', glyph: '❆', name: '严寒', w0: 0.80, gw: +0.030, rq: RQ_FINE,
    needsWeapon: true, scope: 'weapon',
    stat: 'frostTime', mode: 'flat', vals: [0.6, 1.1, 2.0],
    title: (v) => `冰冻 +${trim(v)} 秒`,
    desc: () => '冰剑把怪冻得更久，波及范围内一片全定住',
  },
  {
    id: 'volt', tag: 'atk', glyph: '⚡', name: '导电', w0: 0.60, gw: +0.040, rq: RQ_FINE,
    needsWeapon: true, scope: 'weapon',
    stat: 'chainRatio', mode: 'flat', vals: [0.20, 0.36, 0.65],
    title: (v) => `闪电伤害 +${pctTxt(v)}`,
    desc: () => '雷剑连锁的每道闪电更疼，连锁目标是场上所有怪',
  },
  {
    id: 'spring', tag: 'atk', glyph: '❥', name: '活血', w0: 0.60, gw: +0.030, rq: RQ_FINE,
    needsWeapon: true, scope: 'weapon',
    stat: 'leechRate', mode: 'flat', vals: [0.10, 0.18, 0.32],
    title: (v) => `血剑回血 +${pctTxt(v)}`,
    desc: () => '血剑按伤害回血的比例提高（群体命中时按总伤害算）',
  },

  // ---------------- 生存 ----------------
  {
    id: 'hide', tag: 'def', glyph: '❤', name: '厚皮', w0: 1.40, gw: -0.060,
    // 第 88 块：2/4/7 → 3/6/10。基础上限已抬到 10，这张卡是整个「血量存量」路线的主动力，
    // 提档后一张稀有卡 ≈ 一整条命，才撑得住后期靠血皮硬扛高伤。
    stat: 'maxHp', mode: 'flat', vals: [3, 6, 10], heal: 'same',
    title: (v) => `生命上限 +${trim(v)}`,
    desc: () => '上限提高的同时立刻回满这些血',
  },
  {
    id: 'shell', tag: 'def', glyph: '⬢', name: '甲壳', w0: 0.90, gw: +0.040,
    stat: 'armor', mode: 'flat', vals: [0.3, 0.55, 1.0],
    title: (v) => `防御 +${trim(v)}`,
    desc: () => '每次受击实际伤害 = 攻击 − 防御，可以一直叠（单次受击最少仍掉 1 点）。'
      + ' 但防御最多减掉 70% —— 堆得再高，每一下也至少吃 30% 伤害。',
  },
  {
    // 第 87 块（用户定案）：数值整体砍到原来的 1/4 —— 0.2/0.36/0.65 → 0.05/0.09/0.16。
    // 原来的量级下，选两三张再生就能「站着不动把血回满」，续航类选项直接盖过一切防守。
    id: 'regen', tag: 'def', glyph: '✚', name: '再生', w0: 0.60, gw: +0.010,
    stat: 'hpRegen', mode: 'flat', vals: [0.05, 0.09, 0.16],
    title: (v) => `生命回复 +${trim(v)}/秒`,
    desc: () => '边跑边回血；现在只是「少掉一点」，别指望靠它硬抗',
  },
  {
    // 第 87 块（用户定案）：数值整体砍到原来的 1/3 —— 0.10/0.18/0.32 → 0.03/0.06/0.11。
    // 吸血是乘在伤害上的，攻速一高就指数往上翻，原来 32% 的大档等于「每一下都回满」。
    id: 'vamp', tag: 'def', glyph: '❦', name: '吸血', w0: 0.50, gw: +0.120, rq: RQ_FINE,
    stat: 'lifesteal', mode: 'flat', vals: [0.03, 0.06, 0.11],
    title: (v) => `近战吸血 +${pctTxt(v)}`,
    desc: () => '造成伤害的这个比例转成生命，伤害越高回得越多',
  },

  // ---------------- 机动 ----------------
  // 第 73 块：旧的「轻功 10% / 疾风 16%」是同一条属性的两个数值，
  // 拆三档之后完全重复 —— 合并成一族「轻功」，三档就是原来的粗细。
  {
    id: 'step', tag: 'mov', glyph: '➤', name: '轻功', w0: 1.30, gw: -0.015,
    stat: 'moveSpeed', mode: 'pct', vals: [0.10, 0.18, 0.32],
    title: (v) => `移动速度 +${pctTxt(v)}`,
    desc: () => '拉开距离就是最好的防御，遛小兵很管用',
  },
  {
    id: 'cross', tag: 'mov', glyph: '✕', name: '游刃', w0: 1.00, gw: +0.020, rq: RQ_FINE,
    stat: 'moveSpeed', mode: 'pct', vals: [0.08, 0.14, 0.25],
    extras: [{ stat: 'attackSpeed', mode: 'pct', vals: [0.08, 0.14, 0.25] }],
    title: (v, e) => `移速 +${pctTxt(v)} · 攻速 +${pctTxt(e[0])}`,
    desc: () => '走位和出手兼顾，不挑流派',
  },
];

// ———— 拆不成三档的卡：给的是「+1 只 / +1 把 / +1 层 / 一组效果」————
const UNIQUE = [
  {
    // 第 12 块：一次出手同时打两只不同的怪。不是「伤害 ×2」而是「多挑一个目标」——
    // 单挑时毫无收益，被围住时才是质变，所以做成史诗档、低权重、不随回合升温。
    id: 'doublePalm', tag: 'atk', glyph: '🖐', name: '双拍',
    rarity: 3,
    w0: 0.34, gw: +0.020,
    title: '同时命中 +1 只',
    desc: '一次出手同时拍中两只不同的怪：最近的那只先挨打，第二只顺延到次近的',
    stat: 'multiHit', flat: 1,
  },
  {
    id: 'swordArray', tag: 'atk', glyph: '✹', name: '剑阵',
    rarity: 3, needsWeapon: true, scope: 'weapon',
    w0: 1.00, gw: +0.050,
    title: '环上再多一把剑',
    desc: '永久 +1 把铁剑。剑的数量没有上限，有多少把就转多少把',
    sword: 'iron',
  },
  {
    // 第 13 块：金钟罩 —— 周期无敌。它是节拍器不是血条：15 秒里只有 3 秒能硬抗。
    id: 'aegisUp', tag: 'def', glyph: '🔔', name: '金钟罩',
    rarity: 3,
    w0: 0.30, gw: +0.020,
    title: '每 15s 无敌 3s',
    desc: '周期无敌：罩子亮起时完全不受伤害（炮台弹道、红圈落箭全都挡掉）；再拿一层周期缩短 1.5 秒',
    stat: 'aegis', flat: 1,
  },
  {
    // 第 11 块：生存系的传说卡 —— 把「活下来」这件事直接抬一个档
    // 第 87 块：附赠的 `hpRegen` 跟着全局口径从 0.3 砍到 0.08（其它来源都砍了 1/4，
    // 唯独传说卡不动的话，它就成了「唯一值得拿的续航」）。
    id: 'undying', tag: 'def', glyph: '♾', name: '不灭',
    rarity: 4,
    w0: 0.50, gw: +0.030,
    // 第 88 块：上限 3 → 6（血量存量路线，传说卡要顶得上两张普通厚皮）
    title: '生命上限 +6 · 生命回复 +0.08/秒',
    desc: '传说：上限抬满并立刻补 6 点，同时开始自己回血',
    stat: 'maxHp', flat: 6, heal: 6,
    extras: [{ stat: 'hpRegen', flat: 0.08 }],
  },
  {
    id: 'luckStar', tag: 'atk', glyph: '🌟', name: '福星',
    rarity: 4,
    w0: 0.40, gw: +0.020,
    title: '幸运 +2 · 暴击 +3% · 金币掉落率 +10%',
    desc: '整晚只该见一两张的传说卡：运气、暴击、财运一次给齐',
    stat: 'luck', flat: 2,
    extras: [
      // 第 89 块：暴击率整体削 1/3，福星这条从 +5% 降到 +3%
      { stat: 'critRate', flat: 0.03 },
      { stat: 'goldRate', flat: 0.10 },
    ],
  },
  // ---------------- 傀儡卡（第 107 块，用户定案） ----------------
  // 买到「傀儡术」后才会进池子（weightOf 里拦：opts.puppetOwned）。
  // 这四张不走属性表：up.golem 由 applyUpgrade 转交给 golem.applyCard()。
  {
    id: 'golemSnowHp', tag: 'def', glyph: '⛄', name: '雪傀儡强化',
    rarity: 1,
    w0: 0.55, gw: +0.015,
    golem: { stat: 'hp', kind: 'snow', flat: 4 },
    title: '雪傀儡生命 +4',
    desc: '雪傀儡的最大生命 +4（对下一只召出的生效；能重复拿）',
  },
  {
    id: 'golemIronHp', tag: 'def', glyph: '🗿', name: '铁傀儡强化',
    rarity: 1,
    w0: 0.55, gw: +0.015,
    golem: { stat: 'hp', kind: 'iron', flat: 5 },
    title: '铁傀儡生命 +5',
    desc: '铁傀儡的最大生命 +5（对下一只召出的生效；能重复拿）',
  },
  {
    id: 'golemIronAtk', tag: 'atk', glyph: '⚒', name: '铁傀儡重拳',
    rarity: 2,
    w0: 0.40, gw: +0.020,
    golem: { stat: 'atk', flat: 0.3 },
    title: '铁傀儡攻击 +30%',
    desc: '铁傀儡每一拳都在你攻击的 1.5 倍上再乘一档（能重复拿，乘算叠加大）',
  },
  {
    id: 'golemCap', tag: 'atk', glyph: '🎎', name: '双傀合璧',
    rarity: 4,
    w0: 0.35, gw: +0.010,
    golem: { stat: 'cap', flat: 1 },
    title: '场上可同时站两只傀儡',
    desc: '传说：傀儡上限 +1 —— 铁 / 雪可以各站一只（只能拿一次）',
  },
  // ---------------- 傀儡卡第二批（第 108 块，用户定案「幅度大一些」） ----------------
  {
    id: 'golemSnowKnock', tag: 'def', glyph: '❄', name: '重型雪球',
    rarity: 0,
    w0: 0.60, gw: +0.015,
    golem: { stat: 'snowKnock', flat: 1.0 },
    title: '雪球击退 +1.0 格',
    desc: '雪傀儡的雪球把怪推得更远（能重复拿）—— 控住场面，给自己留出走位空间',
  },
  {
    id: 'golemCd', tag: 'def', glyph: '⏱', name: '傀儡速召',
    rarity: 2,
    w0: 0.40, gw: +0.020,
    golem: { stat: 'cdCut', flat: 8 },
    title: '召唤冷却 −8 秒',
    desc: '傀儡碎了之后等得更短（能重复拿，最低 16 秒）—— 傀儡流的核心续航',
  },
  {
    id: 'golemIronSpd', tag: 'atk', glyph: '🥊', name: '铁腕连击',
    rarity: 3,
    w0: 0.35, gw: +0.015,
    golem: { stat: 'ironSpd', flat: 0.20 },
    title: '铁傀儡出手快 20%',
    desc: '铁傀儡的拳越来越密（能重复拿，最快 0.8 秒一拳）—— 配合重拳卡，输出翻着涨',
  },
  {
    id: 'golemSnowSlow', tag: 'def', glyph: '🧊', name: '彻骨寒雪',
    rarity: 3,
    w0: 0.35, gw: +0.015,
    golem: { stat: 'snowSlow', flat: 1.2 },
    title: '雪球命中减速 45%',
    desc: '被雪球砸中的怪减速 45%，持续随卡叠加（每张 +1.2 秒）—— 雪傀儡从推怪变成控怪',
  },
  // ---------------- 箭雨卡（第 108 块，用户定案：四方向 × 两档品质） ----------------
  // 箭雨是开局就有的技能，这些卡不需要门控。
  {
    id: 'arrowCountS', tag: 'atk', glyph: '🏹', name: '箭袋扩充',
    rarity: 0,
    w0: 0.60, gw: +0.015,
    arrow: { stat: 'arrows', flat: 3 },
    title: '箭雨 +3 支',
    desc: '每次箭雨多落 3 支箭（能重复拿）—— 火力密度直接加',
  },
  {
    id: 'arrowDmgS', tag: 'atk', glyph: '🎯', name: '磨尖箭镞',
    rarity: 0,
    w0: 0.60, gw: +0.015,
    arrow: { stat: 'dmg', flat: 0.06 },
    title: '箭雨伤害 +6%',
    desc: '每支箭的伤害在剑伤害的基础上再提一档（能重复拿）',
  },
  {
    id: 'arrowZoneS', tag: 'atk', glyph: '⭕', name: '扩容箭阵',
    rarity: 1,
    w0: 0.55, gw: +0.015,
    arrow: { stat: 'zone', flat: 0.4 },
    title: '箭雨范围 +0.4 格',
    desc: '覆盖圈变大，更多的怪被罩进来（能重复拿）—— 群怪时尤其明显',
  },
  {
    id: 'arrowDmgL', tag: 'atk', glyph: '💥', name: '穿云箭',
    rarity: 2,
    w0: 0.40, gw: +0.020,
    arrow: { stat: 'dmg', flat: 0.12 },
    title: '箭雨伤害 +12%',
    desc: '一次顶两张磨尖箭镞（能重复拿）—— 配合箭袋扩充，箭雨成型很快',
  },
  {
    id: 'arrowCdS', tag: 'mov', glyph: '⏳', name: '速射号令',
    rarity: 2,
    w0: 0.40, gw: +0.020,
    arrow: { stat: 'cd', flat: 0.8 },
    title: '箭雨冷却 −0.8 秒',
    desc: '箭雨来得更勤（能重复拿，最低 3 秒）',
  },
  {
    id: 'arrowCountL', tag: 'atk', glyph: '🌪', name: '万箭齐发',
    rarity: 3,
    w0: 0.35, gw: +0.010,
    arrow: { stat: 'arrows', flat: 6 },
    title: '箭雨 +6 支',
    desc: '一次顶两张箭袋扩充（能重复拿）—— 天上像下暴雨',
  },
  {
    id: 'arrowZoneL', tag: 'atk', glyph: '🌀', name: '箭如雨下',
    rarity: 3,
    w0: 0.35, gw: +0.010,
    arrow: { stat: 'zone', flat: 0.8 },
    title: '箭雨范围 +0.8 格',
    desc: '覆盖圈大了一圈（能重复拿）—— 几乎小半个场都在箭雨里',
  },
  {
    id: 'arrowCdL', tag: 'mov', glyph: '⚡', name: '连珠箭令',
    rarity: 4,
    w0: 0.30, gw: +0.008,
    arrow: { stat: 'cd', flat: 1.6 },
    title: '箭雨冷却 −1.6 秒',
    desc: '传说：一次顶两张速射号令（能重复拿，最低 3 秒）—— 箭雨接近常驻技',
  },
  // ---------------- 墨丸卡（第 114 块，用户定案「要有自己独立的升级卡、要多样」） ----------------
  // 买到「墨丸」后才会进池子（weightOf 里拦：opts.mineOwned）。
  // 四个通道 × 两档品质：伤害 / 同屏上限 / 爆炸半径 / 冷却。
  // 和傀儡卡、箭雨卡一样**不走属性表**：up.mine 由 applyUpgrade 转交 mine.applyCard()。
  {
    id: 'mineDmgS', tag: 'atk', glyph: '🖤', name: '浓黑一笔',
    rarity: 0,
    w0: 0.60, gw: +0.015,
    mine: { stat: 'dmg', flat: 0.08 },
    title: '墨丸伤害 +8%',
    desc: '每颗墨丸炸得更狠（能重复拿）—— 它吃武器攻击，所以剑越强它越强',
  },
  {
    id: 'mineMaxS', tag: 'def', glyph: '⚫', name: '多带一颗',
    rarity: 1,
    w0: 0.55, gw: +0.015,
    mine: { stat: 'max', flat: 1 },
    title: '墨丸同屏 +1 枚',
    desc: '能同时布下的雷多一颗（能重复拿，硬上限 8）—— 雾里提前铺满一整条路',
  },
  {
    id: 'mineRadiusS', tag: 'atk', glyph: '💥', name: '墨开一片',
    rarity: 0,
    w0: 0.60, gw: +0.015,
    mine: { stat: 'radius', flat: 0.4 },
    title: '墨丸爆炸半径 +0.4 格',
    desc: '炸得更开，一群怪一起踩进去就一起没（能重复拿）',
  },
  {
    id: 'mineCdS', tag: 'mov', glyph: '⏱', name: '随手一掷',
    rarity: 2,
    w0: 0.40, gw: +0.020,
    mine: { stat: 'cd', flat: 0.8 },
    title: '墨丸冷却 −0.8 秒',
    desc: '布得更勤（能重复拿，最低 3 秒）—— 配合「多带一颗」可以边走边铺',
  },
  {
    id: 'mineDmgL', tag: 'atk', glyph: '🩸', name: '血墨',
    rarity: 3,
    w0: 0.35, gw: +0.015,
    mine: { stat: 'dmg', flat: 0.18 },
    title: '墨丸伤害 +18%',
    desc: '一次顶两张浓黑一笔（能重复拿）—— 一颗雷清掉一圈小兵',
  },
  {
    id: 'mineSetL', tag: 'atk', glyph: '📕', name: '整页划掉',
    rarity: 4,
    w0: 0.30, gw: +0.008,
    mine: { stat: 'radius', flat: 0.5, extra: [{ stat: 'dmg', flat: 0.10 }, { stat: 'max', flat: 1 }] },
    title: '半径 +0.5 · 伤害 +10% · 同屏 +1',
    desc: '传说：一次给三样 —— 墨的范围、浓度、份数一起来。拿到这张，墨丸就从「补刀」变成「清场」',
  },
  // ---------------- 拿铁卡（第 116 块，用户定案「配套 6 张升级卡」） ----------------
  // 买到「苔藓拿铁」后才会进池子（weightOf 里拦：opts.latteOwned）。
  // 六个通道：持续 / 半径 / 攻速 / 减速 / 冷却 / 同屏。
  // 和墨丸卡、傀儡卡一样**不走属性表**：up.latte 由 applyUpgrade 转交 latte.applyCard()。
  {
    id: 'latteDur', tag: 'def', glyph: '☕', name: '续杯',
    rarity: 0,
    w0: 0.60, gw: +0.015,
    latte: { stat: 'duration', flat: 1.0 },
    title: '拿铁持续 +1 秒',
    desc: '咖啡多香一会儿（能重复拿）—— 圈撑得久，怪就在减速里泡得久',
  },
  {
    id: 'latteRad', tag: 'atk', glyph: '🫧', name: '奶泡溢出',
    rarity: 0,
    w0: 0.60, gw: +0.015,
    latte: { stat: 'radius', flat: 0.4 },
    title: '拿铁半径 +0.4 格',
    desc: '咖啡洒得更开（能重复拿）—— 圈大一圈，能留住的怪就多一圈',
  },
  {
    id: 'latteHaste', tag: 'atk', glyph: '⚡', name: '一口提神',
    rarity: 1,
    w0: 0.55, gw: +0.015,
    latte: { stat: 'haste', flat: 0.05 },
    title: '拿铁攻速 +5%',
    desc: '圈里出手更快（能重复拿）—— 站在咖啡里输出就是这关的打法',
  },
  {
    id: 'latteSlow', tag: 'def', glyph: '🧊', name: '冰镇拿铁',
    rarity: 1,
    w0: 0.55, gw: +0.015,
    latte: { stat: 'slow', flat: 0.06 },
    title: '拿铁减速 +6%',
    desc: '怪在圈里更挪不动（能重复拿，硬上限 65%）—— 更容易留在车道里挨车',
  },
  {
    id: 'latteCd', tag: 'mov', glyph: '⏱', name: '再来一杯',
    rarity: 2,
    w0: 0.40, gw: +0.020,
    latte: { stat: 'cd', flat: 3.0 },
    title: '拿铁冷却 −3 秒',
    desc: '放得更勤（能重复拿，最低 14 秒）—— 咖啡几乎不断档',
  },
  {
    id: 'latteSet', tag: 'atk', glyph: '🍯', name: '招牌特调',
    rarity: 4,
    w0: 0.30, gw: +0.008,
    latte: { stat: 'radius', flat: 0.5, extra: [{ stat: 'duration', flat: 1.5 }, { stat: 'slow', flat: 0.05 }] },
    title: '半径 +0.5 · 持续 +1.5 秒 · 减速 +5%',
    desc: '传说：一次给三样 —— 圈更大、更久、更黏。拿到这张，咖啡就从「补位」变成「阵地」',
  },
  // ---------------- 守夜烛卡（第 118 块，第十一关专属法器） ----------------
  // 买到「守夜烛」后才会进池子（weightOf 里拦：opts.candleOwned）。
  // 四个通道：持续 / 半径 / 灼烧 / 冷却；up.candle 由 applyUpgrade 转交 candle.applyCard()。
  {
    id: 'candleDur', tag: 'def', glyph: '🕯', name: '多烧一会儿',
    rarity: 0,
    w0: 0.60, gw: +0.015,
    candle: { duration: 1.2 },
    title: '守夜烛持续 +1.2 秒',
    desc: '蜡烛烧得更久（能重复拿）—— 雾里那块空地能多留一会儿',
  },
  {
    id: 'candleRad', tag: 'atk', glyph: '🌙', name: '照亮一片',
    rarity: 0,
    w0: 0.60, gw: +0.015,
    candle: { radius: 0.4 },
    title: '守夜烛半径 +0.4 格',
    desc: '光圈更大（能重复拿）—— 一块地能照到的雾更多，能烧到的怪也更多',
  },
  {
    id: 'candleDps', tag: 'atk', glyph: '🔥', name: '烛芯加粗',
    rarity: 1,
    w0: 0.55, gw: +0.015,
    candle: { dps: 0.12 },
    title: '守夜烛灼烧 +12%',
    desc: '火更旺（能重复拿）—— 它吃武器攻击，剑越强它烧得越狠',
  },
  {
    id: 'candleCd', tag: 'mov', glyph: '⏱', name: '随手点亮',
    rarity: 2,
    w0: 0.40, gw: +0.020,
    candle: { cd: 2.5 },
    title: '守夜烛冷却 −2.5 秒',
    desc: '点得更勤（能重复拿，最低 8 秒）—— 一盏接一盏，雾根本贴不上来',
  },
  {
    id: 'candleSet', tag: 'atk', glyph: '🏮', name: '长明灯',
    rarity: 4,
    w0: 0.30, gw: +0.008,
    candle: { radius: 0.5, duration: 2.0, dps: 0.2 },
    title: '半径 +0.5 · 持续 +2 秒 · 灼烧 +20%',
    desc: '传说：一次给三样 —— 灯光、长明、火势一起涨。拿到这张，守夜烛就从「开路」变成「圈地」',
  },
  // ---------------- 落款卡（第 118 块，第十一关专属法器） ----------------
  // 买到「落款」后才会进池子（weightOf 里拦：opts.markOwned）。
  // 四个通道：目标数 / 持续伤害 / 墨爆范围 / 冷却；up.mark 由 applyUpgrade 转交 mark.applyCard()。
  {
    id: 'markTarget', tag: 'def', glyph: '📇', name: '多写一名',
    rarity: 1,
    w0: 0.55, gw: +0.015,
    mark: { targets: 1 },
    title: '落款一次多盖 1 个',
    desc: '一次给更多怪点名（能重复拿）—— 雾里分不清谁是谁的时候，多写几个名字总没错',
  },
  {
    id: 'markDps', tag: 'atk', glyph: '🖋', name: '重墨',
    rarity: 0,
    w0: 0.60, gw: +0.015,
    mark: { dps: 0.12 },
    title: '落款持续伤害 +12%',
    desc: '名字写得更重（能重复拿）—— 被点名的怪血掉得更快',
  },
  {
    id: 'markBoom', tag: 'atk', glyph: '💥', name: '墨溅',
    rarity: 1,
    w0: 0.55, gw: +0.015,
    mark: { boomR: 0.3 },
    title: '落款墨爆半径 +0.3 格',
    desc: '死时炸得更开（能重复拿）—— 一堆怪挤在一起时，一个名字能带走一片',
  },
  {
    id: 'markCd', tag: 'mov', glyph: '⏱', name: '速记',
    rarity: 2,
    w0: 0.40, gw: +0.020,
    mark: { cd: 1.5 },
    title: '落款冷却 −1.5 秒',
    desc: '写得更快（能重复拿，最低 5 秒）—— 一页又一页地记，谁也别想蒙混过去',
  },
  {
    id: 'markSet', tag: 'atk', glyph: '📕', name: '一页三名',
    rarity: 4,
    w0: 0.30, gw: +0.008,
    mark: { targets: 1, dps: 0.2, boomR: 0.4 },
    title: '目标 +1 · 持续伤害 +20% · 墨爆 +0.4',
    desc: '传说：一次给三样 —— 名字更多、写得更重、炸得更开。拿到这张，落款就是「点名清场」',
  },
];

// 把「族 × 三档」摊平成一张张卡。小档沿用原来的 id（老存档 / 老测试照旧认得）。
function buildUpgrades() {
  const out = [];
  for (const f of FAMILIES) {
    const rq = f.rq || [0, 1, 3];
    TIERS.forEach((t, i) => {
      const v = f.vals[i];
      const exVals = (f.extras || []).map((e) => e.vals[i]);
      const up = {
        id: i === 0 ? f.id : `${f.id}${t.key === 'm' ? 'M' : 'B'}`,
        tag: f.tag, glyph: f.glyph, name: `${f.name}${t.mark}`,
        rarity: rq[i],
        family: f.id, tier: t.key,
        // 档位权重系数折进 w0 / gw：weightOf 仍是 w0 + gw ×(回合-1)
        w0: f.w0 * t.wf, gw: (f.gw || 0) * t.wf,
        title: f.title(v, exVals), desc: f.desc(v, exVals),
        stat: f.stat,
        flat: f.mode === 'flat' ? v : 0,
        pct: f.mode === 'pct' ? v : 0,
      };
      if (f.needsWeapon) up.needsWeapon = true;
      if (f.scope) up.scope = f.scope;
      if (f.heal === 'same') up.heal = v;
      if (exVals.length === 1) {
        const e = f.extras[0];
        up.extra = { stat: e.stat, flat: e.mode === 'flat' ? exVals[0] : 0, pct: e.mode === 'pct' ? exVals[0] : 0 };
      } else if (exVals.length > 1) {
        up.extras = f.extras.map((e, k) => ({
          stat: e.stat, flat: e.mode === 'flat' ? exVals[k] : 0, pct: e.mode === 'pct' ? exVals[k] : 0,
        }));
      }
      out.push(up);
    });
  }
  for (const u of UNIQUE) out.push({ ...u, family: null, tier: null });
  return out;
}

export const UPGRADES = buildUpgrades();

const TAGS = ['atk', 'def', 'mov'];

export const TAG_NAMES = { atk: '进攻', def: '生存', mov: '机动' };

// 某项在第 round 回合的抽中权重（0 = 不进池子）。
// 权重随回合线性变化：w0 + gw × (回合 - 1) —— 所以每个回合的概率都不一样，
// 前期偏「立刻能感知」的属性（攻击力/生命上限），后期偏暴击/吸血/剑系。
export function weightOf(up, round = 1, opts = {}) {
  // 第 107 块：傀儡卡只有买到「傀儡术」后才进池子；上限卡拿过一次就收摊
  if (up.golem) {
    if (!opts.puppetOwned) return 0;
    if (up.golem.stat === 'cap' && (opts.golemCap || 0) >= 1) return 0;
  }
  // 第 114 块：墨丸卡同理 —— 没买到墨丸之前它们一张都不该出现
  // （不然三选一里会弹出「墨丸伤害 +8%」，而你连墨丸都没有）
  if (up.mine && !opts.mineOwned) return 0;
  // 第 116 块：拿铁卡同理 —— 没买到拿铁之前它们一张都不该出现
  if (up.latte && !opts.latteOwned) return 0;
  // 第 118 块：守夜烛 / 落款卡同理
  if (up.candle && !opts.candleOwned) return 0;
  if (up.mark && !opts.markOwned) return 0;
  if (up.needsWeapon && !opts.hasWeapon) return 0;
  const r = Math.max(1, round);
  return Math.max(0, (up.w0 ?? 1) + (up.gw ?? 0) * (r - 1));
}

// 某系在某回合的候选池（已过滤权重 0 的项）
export function poolOf(tag, round = 1, opts = {}) {
  const luck = opts.luck ?? 0;
  return UPGRADES
    .filter((u) => u.tag === tag)
    .map((u) => {
      const w = weightOf(u, round, opts);
      return { up: u, w, rw: rarityWeight(u, luck) };
    })
    .filter((x) => x.w > 0);
}

// 加权随机取一个。实际权重 = 回合权重 × 品质系数（幸运放大高品质那一头）
function pickFromPool(list, rng) {
  const total = list.reduce((a, x) => a + x.w * x.rw, 0);
  if (total <= 0) return list[0]?.up || null;
  let r = rng() * total;
  for (const x of list) {
    r -= x.w * x.rw;
    if (r < 0) return x.up;
  }
  return list[list.length - 1].up;
}

// 抽三张：三系各一张（系内按「回合权重 × 品质系数」加权）+ 洗牌。
// opts.round：当前回合（决定权重档位）
// opts.hasWeapon：拿到环剑后武器系升级才会进池子（没武器抽到等于废牌）。
// opts.luck：幸运（只放宽高品质卡，见 rarity.js）
// rng 可注入，测试里能固定结果。
export function rollChoices(rng = Math.random, opts = {}) {
  const round = opts.round ?? 1;
  const picks = TAGS.map((tag) => pickFromPool(poolOf(tag, round, opts), rng));
  for (let i = picks.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(rng() * (i + 1)));
    const tmp = picks[i]; picks[i] = picks[j]; picks[j] = tmp;
  }
  return picks;
}

// 应用一张升级。serial 只用来让每次加成的 src 唯一（便于 removeBySource 回滚）。
// wstats = 武器属性表：scope:'weapon' 的条目改它，其余改主角 stats。
// weapon = 武器系统本身：只有「直接给一把剑」的卡（sword 字段）才需要它。
// 返回 { src, changes }：changes 是精确的「选前 → 选后」（用于卡片/提示文案）。
export function applyUpgrade(stats, up, serial = 0, wstats = null, weapon = null, golems = null, arrowRain = null, mines = null, latte = null, candle = null, mark = null) {
  // 第 107 块：傀儡卡不碰属性表，交给傀儡系统记账（golem.applyCard）
  if (up.golem) {
    const g = up.golem;
    const before = golems ? golems.bonuses() : null;
    if (golems) golems.applyCard(g);
    return {
      src: `upg:${up.id}:${serial}`,
      changes: [golemChange(g, before)],
    };
  }
  // 第 108 块：箭雨卡交给箭雨系统记账（arrowRain.applyCard）
  if (up.arrow) {
    const a = up.arrow;
    const before = arrowRain ? arrowRain.bonuses() : null;
    if (arrowRain) arrowRain.applyCard(a);
    return {
      src: `upg:${up.id}:${serial}`,
      changes: [arrowChange(a, before)],
    };
  }
  // 第 114 块：墨丸卡交给墨丸系统记账（mine.applyCard）
  if (up.mine) {
    const m = up.mine;
    const before = mines ? mines.bonuses() : null;
    if (mines) mines.applyCard(m);
    return {
      src: `upg:${up.id}:${serial}`,
      changes: [mineChange(m, before)],
    };
  }
  // 第 116 块：拿铁卡交给拿铁系统记账（latte.applyCard）
  if (up.latte) {
    const l = up.latte;
    const before = latte ? latte.bonuses() : null;
    if (latte) latte.applyCard(l);
    return {
      src: `upg:${up.id}:${serial}`,
      changes: [latteChange(l, before)],
    };
  }
  // 第 118 块：守夜烛 / 落款卡交给各自的系统记账
  if (up.candle) {
    const c = up.candle;
    const before = candle ? candle.bonuses() : null;
    if (candle) candle.applyCard(c);
    return {
      src: `upg:${up.id}:${serial}`,
      changes: [candleChange(c, before)],
    };
  }
  if (up.mark) {
    const m = up.mark;
    const before = mark ? mark.bonuses() : null;
    if (mark) mark.applyCard(m);
    return {
      src: `upg:${up.id}:${serial}`,
      changes: [markChange(m, before)],
    };
  }
  // 剑阵这类「直接加一把剑」的卡：不碰属性表，交给武器系统上环
  if (up.sword) {
    const before = weapon ? weapon.count : 0;
    if (weapon) weapon.addSword(up.sword);
    const kindName = up.sword === 'iron' ? '铁剑' : up.sword;
    return {
      src: `upg:${up.id}:${serial}`,
      changes: [{
        key: 'sword', scope: 'weapon', name: `环剑（${kindName}）`,
        from: before, to: before + 1,
        fromText: `${before} 把`, toText: `${before + 1} 把`,
        text: `${before} → ${before + 1} 把`,
      }],
    };
  }
  const list = [up, up.extra].concat(up.extras || []).filter(Boolean);
  const scopeOf = (m) => m.scope || up.scope || 'player';
  const before = list.map((m) => tableFor(scopeOf(m), stats, wstats).get(m.stat));
  const src = `upg:${up.id}:${serial}`;

  for (const m of list) {
    const t = tableFor(scopeOf(m), stats, wstats);
    t.addMod({ stat: m.stat, flat: m.flat || 0, pct: m.pct || 0, src });
    // 上限变了要补血并夹紧当前血量
    if (m.stat === 'maxHp') t.syncHp(m.heal || 0);
  }

  const changes = list.map((m, i) => {
    const def = defFor(m.stat, scopeOf(m));
    const from = before[i];
    const to = tableFor(scopeOf(m), stats, wstats).get(m.stat);
    return {
      key: m.stat,
      scope: scopeOf(m),
      name: def ? def.name : m.stat,
      from, to,
      fromText: def ? def.fmt(from) : String(from),
      toText: def ? def.fmt(to) : String(to),
      text: def ? `${def.fmt(from)} → ${def.fmt(to)}` : '',
    };
  });
  return { src, changes };
}

// 预演一张升级：返回与 applyUpgrade 同结构的 changes，但不改任何状态。
// 三选一卡片上的「1 → 2」就是用它算的，所以点下去之后数值一定与预览一致。
// ---- 第 108 块：傀儡卡 / 箭雨卡的 changes 文案（apply 与 preview 共用，保证两者一致） ----
function golemChange(g, b) {
  let name, from, to, fromText, toText;
  if (g.stat === 'hp') {
    name = g.kind === 'iron' ? '铁傀儡生命' : '雪傀儡生命';
    from = b ? b.hp[g.kind] : 0;
    to = from + g.flat;
    fromText = String(from); toText = `+${g.flat}`;
  } else if (g.stat === 'atk') {
    name = '铁傀儡攻击';
    from = b ? b.atk : 0;
    to = from + g.flat;
    fromText = String(from); toText = `+${g.flat}`;
  } else if (g.stat === 'cap') {
    name = '傀儡上限';
    from = b ? b.cap : 1;
    to = from + g.flat;
    fromText = String(from); toText = String(to);
  } else if (g.stat === 'cdCut') {
    name = '召唤冷却';
    from = b ? b.cdTotal : 40;
    to = Math.max(16, from - g.flat);
    fromText = `${Math.round(from)}秒`; toText = `${Math.round(to)}秒`;
  } else if (g.stat === 'ironSpd') {
    name = '铁傀儡出手';
    from = b ? b.ironAtkCd : 2.0;
    const oldPct = b ? b.ironSpd : 0;
    to = Math.max(0.8, 2.0 * (1 - (oldPct + g.flat)));
    fromText = `${from.toFixed(1)}秒/拳`; toText = `${to.toFixed(1)}秒/拳`;
  } else if (g.stat === 'snowKnock') {
    name = '雪球击退';
    from = 2.2 + (b ? b.snowKnock : 0);
    to = from + g.flat;
    fromText = `${from.toFixed(1)}格`; toText = `${to.toFixed(1)}格`;
  } else { // snowSlow
    name = '雪球减速';
    from = b ? b.snowSlowT : 0;
    to = from + g.flat;
    fromText = from > 0 ? `${from.toFixed(1)}秒` : '无';
    toText = `${to.toFixed(1)}秒`;
  }
  return {
    key: `golem_${g.stat}`, scope: 'golem', name,
    from, to, fromText, toText,
    text: `${fromText} → ${toText}`,
  };
}

function arrowChange(a, b) {
  let name, from, to, fromText, toText;
  if (a.stat === 'arrows') {
    name = '箭雨箭数';
    from = b ? b.arrowsN : 14;
    to = from + a.flat;
    fromText = `${from} 支`; toText = `${to} 支`;
  } else if (a.stat === 'dmg') {
    name = '箭雨伤害';
    from = b ? b.dmgPct : 0;
    to = from + a.flat;
    fromText = `+${Math.round(from * 100)}%`; toText = `+${Math.round(to * 100)}%`;
  } else if (a.stat === 'zone') {
    name = '箭雨范围';
    from = b ? b.zoneR : 2.3;
    to = from + a.flat;
    fromText = `${from.toFixed(1)}格`; toText = `${to.toFixed(1)}格`;
  } else { // cd
    name = '箭雨冷却';
    from = b ? b.cdMax : 8.0;
    to = Math.max(3.0, from - a.flat);
    fromText = `${from.toFixed(1)}秒`; toText = `${to.toFixed(1)}秒`;
  }
  return {
    key: `arrow_${a.stat}`, scope: 'arrowRain', name,
    from, to, fromText, toText,
    text: `${fromText} → ${toText}`,
  };
}

// ---- 第 114 块：墨丸卡的 changes 文案（apply 与 preview 共用）----
// b = mine.bonuses()：{ dmgPct, cap, radius, cdMax, ... }
// 传说卡一张动三个通道（半径 / 伤害 / 同屏），所以 extras 也要写进文案，
// 否则玩家看到的「半径 +0.5」背后还有两项没声张。
function mineChange(m, b) {
  const sum = (stat) => (m.stat === stat ? m.flat : 0)
    + (m.extra || []).reduce((a, e) => a + (e.stat === stat ? e.flat : 0), 0);
  const b0 = b || { dmgPct: 0, cap: 3, radius: 2.6, cdMax: 8.0 };
  const meta = {
    dmg: { name: '墨丸伤害', from: b0.dmgPct, fmt: (v) => `+${Math.round(v * 100)}%` },
    max: { name: '墨丸同屏', from: b0.cap, fmt: (v) => `${v} 枚` },
    radius: { name: '墨丸半径', from: b0.radius, fmt: (v) => `${v.toFixed(1)} 格` },
    cd: { name: '墨丸冷却', from: b0.cdMax, fmt: (v) => `${v.toFixed(1)} 秒` },
  };
  const stat = meta[m.stat] ? m.stat : 'dmg';
  const mm = meta[stat];
  const flat = sum(stat);
  const to = stat === 'cd' ? Math.max(3.0, mm.from - flat) : mm.from + flat;
  // 附带通道（只有传说卡有）：每条都写成「名字 旧 → 新」
  const extraNotes = (m.extra || []).map((e) => {
    const x = meta[e.stat];
    if (!x) return '';
    const f = e.flat;
    const t = e.stat === 'cd' ? Math.max(3.0, x.from - f) : x.from + f;
    return `${x.name} ${x.fmt(x.from)} → ${x.fmt(t)}`;
  }).filter(Boolean);
  return {
    key: `mine_${stat}`, scope: 'mine', name: mm.name,
    from: mm.from, to, fromText: mm.fmt(mm.from), toText: mm.fmt(to),
    text: `${mm.fmt(mm.from)} → ${mm.fmt(to)}` + (extraNotes.length ? ` · ${extraNotes.join(' · ')}` : ''),
  };
}

// ---- 第 116 块：拿铁卡的 changes 文案（apply 与 preview 共用）----
// b = latte.bonuses()：{ duration, radius, haste, slow, cdMax, cap, ... }
function latteChange(l, b) {
  const sum = (stat) => (l.stat === stat ? l.flat : 0)
    + (l.extra || []).reduce((a, e) => a + (e.stat === stat ? e.flat : 0), 0);
  const b0 = b || { duration: 5.0, radius: 3.2, haste: 0.20, slow: 0.28, cdMax: 30.0, cap: 1 };
  const meta = {
    duration: { name: '拿铁持续', from: b0.duration, fmt: (v) => `${v.toFixed(1)} 秒` },
    radius: { name: '拿铁半径', from: b0.radius, fmt: (v) => `${v.toFixed(1)} 格` },
    haste: { name: '拿铁攻速', from: b0.haste, fmt: (v) => `+${Math.round(v * 100)}%` },
    slow: { name: '拿铁减速', from: b0.slow, fmt: (v) => `${Math.round(v * 100)}%` },
    cd: { name: '拿铁冷却', from: b0.cdMax, fmt: (v) => `${v.toFixed(1)} 秒` },
    cap: { name: '拿铁同屏', from: b0.cap, fmt: (v) => `${v} 杯` },
  };
  const stat = meta[l.stat] ? l.stat : 'haste';
  const mm = meta[stat];
  const flat = sum(stat);
  const to = stat === 'cd' ? Math.max(14.0, mm.from - flat) : mm.from + flat;
  const extraNotes = (l.extra || []).map((e) => {
    const x = meta[e.stat];
    if (!x) return '';
    const f = e.flat;
    const t = e.stat === 'cd' ? Math.max(14.0, x.from - f) : x.from + f;
    return `${x.name} ${x.fmt(x.from)} → ${x.fmt(t)}`;
  }).filter(Boolean);
  return {
    key: `latte_${stat}`, scope: 'latte', name: mm.name,
    from: mm.from, to, fromText: mm.fmt(mm.from), toText: mm.fmt(to),
    text: `${mm.fmt(mm.from)} → ${mm.fmt(to)}` + (extraNotes.length ? ` · ${extraNotes.join(' · ')}` : ''),
  };
}

// ---- 第 118 块：守夜烛卡的 changes 文案（apply 与 preview 共用）----
function candleChange(c, b) {
  const sum = (k) => (c[k] || 0) + ((c.extra || []).reduce((a, e) => a + (e[k] || 0), 0));
  const b0 = b || { duration: 6.0, radius: 3.2, dpsMul: 0.55, cdMax: 22.0 };
  const meta = {
    duration: { name: '守夜烛持续', from: b0.duration, fmt: (v) => `${v.toFixed(1)} 秒` },
    radius: { name: '守夜烛半径', from: b0.radius, fmt: (v) => `${v.toFixed(1)} 格` },
    dps: { name: '守夜烛灼烧', from: b0.dpsMul, fmt: (v) => `×${v.toFixed(2)}` },
    cd: { name: '守夜烛冷却', from: b0.cdMax, fmt: (v) => `${v.toFixed(1)} 秒` },
  };
  const stat = meta[c.stat] ? c.stat : 'radius';
  const mm = meta[stat];
  const flat = sum(stat);
  const to = stat === 'cd' ? Math.max(8.0, mm.from - flat) : mm.from + flat;
  return {
    key: `candle_${stat}`, scope: 'candle', name: mm.name,
    from: mm.from, to, fromText: mm.fmt(mm.from), toText: mm.fmt(to),
    text: `${mm.fmt(mm.from)} → ${mm.fmt(to)}`,
  };
}

// ---- 第 118 块：落款卡的 changes 文案（apply 与 preview 共用）----
function markChange(m, b) {
  const sum = (k) => (m[k] || 0) + ((m.extra || []).reduce((a, e) => a + (e[k] || 0), 0));
  const b0 = b || { targets: 1, dpsMul: 0.9, boomR: 1.8, cdMax: 14.0 };
  const meta = {
    targets: { name: '落款目标', from: b0.targets, fmt: (v) => `${v} 个` },
    dps: { name: '落款伤害', from: b0.dpsMul, fmt: (v) => `×${v.toFixed(2)}` },
    boomR: { name: '墨爆半径', from: b0.boomR, fmt: (v) => `${v.toFixed(1)} 格` },
    cd: { name: '落款冷却', from: b0.cdMax, fmt: (v) => `${v.toFixed(1)} 秒` },
  };
  const stat = meta[m.stat] ? m.stat : 'targets';
  const mm = meta[stat];
  const flat = sum(stat);
  const to = stat === 'cd' ? Math.max(5.0, mm.from - flat) : mm.from + flat;
  return {
    key: `mark_${stat}`, scope: 'mark', name: mm.name,
    from: mm.from, to, fromText: mm.fmt(mm.from), toText: mm.fmt(to),
    text: `${mm.fmt(mm.from)} → ${mm.fmt(to)}`,
  };
}

export function previewUpgrade(stats, up, wstats = null, weapon = null, golems = null, arrowRain = null, mines = null, latte = null, candle = null, mark = null) {
  if (up.golem) {
    const g = up.golem;
    const b = golems ? golems.bonuses() : null;
    return [golemChange(g, b)];
  }
  if (up.arrow) {
    const a = up.arrow;
    const bb = arrowRain ? arrowRain.bonuses() : null;
    return [arrowChange(a, bb)];
  }
  // 第 114 块：墨丸卡 —— 和 applyUpgrade 走同一个 mineChange，预览与实值永远一致
  if (up.mine) {
    const m = up.mine;
    const bb = mines ? mines.bonuses() : null;
    return [mineChange(m, bb)];
  }
  // 第 116 块：拿铁卡 —— 和 applyUpgrade 走同一个 latteChange，预览与实值永远一致
  if (up.latte) {
    const l = up.latte;
    const bb = latte ? latte.bonuses() : null;
    return [latteChange(l, bb)];
  }
  // 第 118 块：守夜烛 / 落款卡 —— 预览与实值共用同一个 change 函数
  if (up.candle) {
    const b = candle ? candle.bonuses() : null;
    return [candleChange(up.candle, b)];
  }
  if (up.mark) {
    const b = mark ? mark.bonuses() : null;
    return [markChange(up.mark, b)];
  }
  if (up.sword) {
    const n = weapon ? weapon.count : 0;
    return [{
      key: 'sword', scope: 'weapon', name: '环剑',
      from: n, to: n + 1,
      fromText: `${n} 把`, toText: `${n + 1} 把`,
      text: `${n} → ${n + 1} 把`,
    }];
  }
  const list = [up, up.extra].concat(up.extras || []).filter(Boolean);
  const scopeOf = (m) => m.scope || up.scope || 'player';
  return list.map((m) => {
    const def = defFor(m.stat, scopeOf(m));
    const t = tableFor(scopeOf(m), stats, wstats);
    const from = t.get(m.stat);
    const to = t.preview(m.stat, { flat: m.flat || 0, pct: m.pct || 0 });
    return {
      key: m.stat,
      scope: scopeOf(m),
      name: def ? def.name : m.stat,
      from, to,
      fromText: def ? def.fmt(from) : String(from),
      toText: def ? def.fmt(to) : String(to),
      text: def ? `${def.fmt(from)} → ${def.fmt(to)}` : '',
    };
  }).filter((c) => c.text);
}

// 一句话文案，例如「攻击力 1 → 2」
export function upgradeText(result) {
  return (result?.changes || []).map((c) => `${c.name} ${c.text}`).join(' · ');
}

// 各系内每一项被抽中的概率（0~1）。用于文档与测试：
// 注意这是「条件概率」—— 三张卡固定三系各一，所以每个系的和为 1。
// 加权时算上品质系数与幸运（第 11 块），所以这里给出的是**真实抽中概率**。
export function chanceTable(round = 1, opts = {}) {
  const luck = opts.luck ?? 0;
  return TAGS.map((tag) => {
    const pool = poolOf(tag, round, opts);
    const total = pool.reduce((a, x) => a + x.w * x.rw, 0) || 1;
    return {
      tag,
      name: TAG_NAMES[tag],
      items: pool.map((x) => ({
        id: x.up.id,
        name: x.up.name,
        title: x.up.title,
        rarity: x.up.rarity ?? 0,
        weight: x.w,
        p: (x.w * x.rw) / total,
      })),
    };
  });
}

// 三选一里「各品质」的总体概率（三系平均，因为固定三系各一张）。
// 面板页脚用它写一句「幸运 2.0 · 精良及以上 18%」，让幸运看得见。
export function rarityOdds(round = 1, opts = {}) {
  const luck = opts.luck ?? 0;
  const perTag = TAGS.map((tag) => oddsOf(
    // oddsOf 按对象的 rarity 分档；池子里装的是 { up, w }，这里摊平成它认得的样子
    poolOf(tag, round, opts).map((x) => ({ rarity: x.up.rarity ?? 0, w: x.w })),
    { luck, weightOf: (x) => x.w }
  ));
  return RARITIES.map((r, i) => ({
    id: r.id,
    name: r.name,
    color: r.color,
    p: perTag.reduce((a, list) => a + list[i].p, 0) / perTag.length,
  }));
}

