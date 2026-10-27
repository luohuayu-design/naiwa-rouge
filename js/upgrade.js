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
import { STAT_DEFS } from './stats.js?v=111';
import { WEAPON_STAT_DEFS } from './weaponStats.js?v=111';
import { RARITIES, rarityWeight, oddsOf } from './rarity.js?v=111';

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
export function applyUpgrade(stats, up, serial = 0, wstats = null, weapon = null) {
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
export function previewUpgrade(stats, up, wstats = null, weapon = null) {
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

