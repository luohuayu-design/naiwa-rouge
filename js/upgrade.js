// ============================================================
// upgrade.js —— 局内成长：回合结束的三选一
//
// 设计原则：
//   1. 每次只给 3 张，分别来自「进攻 / 生存 / 机动」三系 ——
//      保证不论抽到什么，玩家都要在「打得更疼 / 活得更久 / 走位更稳」之间取舍，
//      不会出现三张都是废牌（比如暴击率 0 时抽到暴伤）的尴尬。
//   2. 数值都按「一次选择 ≈ 一次可感知的提升」定：
//      攻击力 +1（前期最直观）、攻速 +18%、范围 +0.40、
//      生命 +2、防御 +15、回复 +0.2/秒；越界的数值由 stats 的统一公式兜住。
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
import { STAT_DEFS } from './stats.js';
import { WEAPON_STAT_DEFS } from './weaponStats.js';
import { RARITIES, rarityWeight, oddsOf } from './rarity.js';

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

export const UPGRADES = [
  // ---------------- 进攻 ----------------
  {
    id: 'edge', tag: 'atk', glyph: '⚔', name: '锋利',
    rarity: 0,
    w0: 1.60, gw: -0.060,   // 权重 = w0 + gw × (回合-1)
    title: '攻击力 +1', desc: '每次近战命中的基础伤害 +1，前期一刀一只小兵',
    stat: 'attack', flat: 1,
  },
  {
    id: 'haste', tag: 'atk', glyph: '⚡', name: '连击',
    rarity: 0,
    w0: 1.00, gw: +0.030,   // 权重 = w0 + gw × (回合-1)
    title: '攻击速度 +18%', desc: '出手更密，等效输出 +18%，和攻击力叠乘',
    stat: 'attackSpeed', pct: 0.18,
  },
  {
    id: 'reach', tag: 'atk', glyph: '◎', name: '长臂',
    rarity: 0,
    w0: 1.00, gw: +0.010,   // 权重 = w0 + gw × (回合-1)
    title: '攻击范围 +0.40', desc: '脚下的圈更大，能先手拍到还没贴脸的怪',
    stat: 'attackRange', flat: 0.40,
  },
  {
    id: 'eye', tag: 'atk', glyph: '✦', name: '锐目',
    rarity: 1,
    w0: 0.70, gw: +0.090,   // 权重 = w0 + gw × (回合-1)
    title: '暴击率 +15%', desc: '命中时按概率打出 1.5 倍伤害',
    stat: 'critRate', flat: 0.15,
  },
  {
    id: 'fang', tag: 'atk', glyph: '✧', name: '致命',
    rarity: 2,
    w0: 0.50, gw: +0.180,   // 权重 = w0 + gw × (回合-1)
    // 剑系 10 项把进攻池摊薄了，暴击这条线要抬得更陡才保持「后期更常见」
    title: '暴击伤害 +50% · 暴击率 +6%',
    desc: '暴击更疼；自带一点暴击率，单独拿到也有收益',
    stat: 'critDamage', pct: 0.50,
    extra: { stat: 'critRate', flat: 0.06 },
  },
  {
    // 第 12 块：一次出手同时打两只不同的怪。
    // 注意它不是「伤害 ×2」，而是「多挑一个目标」——单挑时毫无收益，
    // 被围住时才是质变，所以做成史诗档、低权重、不随回合升温。
    id: 'doublePalm', tag: 'atk', glyph: '🖐', name: '双拍',
    rarity: 3,
    w0: 0.34, gw: +0.020,
    title: '同时命中 +1 只',
    desc: '一次出手同时拍中两只不同的怪：最近的那只先挨打，第二只顺延到次近的',
    stat: 'multiHit', flat: 1,
  },
  // ---- 武器系（needsWeapon：第 5 回合拿到环剑后才会进抽取池）
  //      scope:'weapon' = 改的是武器自己的属性表，与主角的攻击/暴击毫无关系 ----
  {
    id: 'swordEdge', tag: 'atk', glyph: '🗡', name: '剑刃',
    rarity: 1, needsWeapon: true, scope: 'weapon',
    w0: 1.20, gw: +0.060,   // 权重 = w0 + gw × (回合-1)
    title: '剑伤害 +30%', desc: '直接放大环剑每一剑的伤害',
    stat: 'swordDamage', pct: 0.30,
  },
  {
    id: 'swordCrit', tag: 'atk', glyph: '✦', name: '剑锋',
    rarity: 1, needsWeapon: true, scope: 'weapon',
    w0: 0.90, gw: +0.070,
    title: '剑暴击率 +8%', desc: '环剑自己的暴击概率（基础 10%），不吃主角暴击率',
    stat: 'swordCrit', flat: 0.08,
  },
  {
    id: 'swordFang', tag: 'atk', glyph: '✧', name: '淬锋',
    rarity: 2, needsWeapon: true, scope: 'weapon',
    w0: 0.70, gw: +0.090,
    title: '剑暴击伤害 +40%', desc: '剑暴击时更疼；和剑锋一起拿收益最大',
    stat: 'swordCritMul', pct: 0.40,
  },
  {
    id: 'swordArray', tag: 'atk', glyph: '✹', name: '剑阵',
    rarity: 3, needsWeapon: true, scope: 'weapon',
    w0: 1.00, gw: +0.050,   // 权重 = w0 + gw × (回合-1)
    title: '环上再多一把剑', desc: '永久 +1 把铁剑。剑的数量没有上限，有多少把就转多少把',
    sword: 'iron',
  },
  {
    id: 'swordSpin', tag: 'atk', glyph: ' ⟳', name: '疾轮',
    rarity: 0, needsWeapon: true, scope: 'weapon',
    w0: 1.00, gw: +0.020,   // 权重 = w0 + gw × (回合-1)
    title: '剑转速 +25%', desc: '剑转得更快，同样时间扫过更多怪',
    stat: 'swordOrbit', pct: 0.25,
  },
  {
    id: 'swordForge', tag: 'atk', glyph: '⚒', name: '锻造',
    rarity: 0, needsWeapon: true, scope: 'weapon',
    w0: 0.90, gw: +0.010,   // 权重 = w0 + gw × (回合-1)
    title: '剑匣收紧', desc: '整环补满时间 10 → 9 秒（无论几把剑都在时限内补满）',
    stat: 'swordRefill', flat: -1.0,
  },
  // ---- 元素剑系（拿到对应剑才真正有意义，但只要有环剑就可抽；商店可买元素剑） ----
  {
    id: 'venom', tag: 'atk', glyph: '☠', name: '淬毒',
    rarity: 2, needsWeapon: true, scope: 'weapon',
    w0: 0.80, gw: +0.030,
    title: '毒伤 +0.05/秒', desc: '毒剑的中毒更疼（0.10 → 0.15/秒），持续 5 秒不变',
    stat: 'poisonDps', flat: 0.05,
  },
  {
    id: 'chill', tag: 'atk', glyph: '❆', name: '严寒',
    rarity: 2, needsWeapon: true, scope: 'weapon',
    w0: 0.80, gw: +0.030,
    title: '冰缓 +8%', desc: '冰剑把怪冻得更狠（35% → 43% 减速），持续 2.5 秒',
    stat: 'frostSlow', flat: 0.08,
  },
  {
    id: 'volt', tag: 'atk', glyph: '⚡', name: '导电',
    rarity: 3, needsWeapon: true, scope: 'weapon',
    w0: 0.60, gw: +0.040,
    title: '雷链数 +1', desc: '雷剑多连锁一只怪，每道闪电 60% 伤害',
    stat: 'chainCount', flat: 1,
  },
  {
    id: 'spring', tag: 'atk', glyph: '❥', name: '活血',
    rarity: 2, needsWeapon: true, scope: 'weapon',
    w0: 0.60, gw: +0.030,
    title: '血剑回血 +5%', desc: '血剑按伤害回血的比例 15% → 20%',
    stat: 'leechRate', flat: 0.05,
  },
  // ---- 经济 ----
  {
    id: 'fortune', tag: 'atk', glyph: '🪙', name: '财运',
    rarity: 0,
    w0: 0.70, gw: +0.020,
    title: '金币掉落率 +10%', desc: '怪死掉时更容易掉金币，商店里多几件可选',
    stat: 'goldRate', flat: 0.10,
  },
  // ---- 运气（第 11 块）：不直接加伤害，改的是「你能挑到什么」 ----
  {
    id: 'luckUp', tag: 'atk', glyph: '🍀', name: '好运',
    rarity: 1,
    w0: 0.55, gw: +0.050,
    title: '幸运 +1',
    desc: '三选一更容易出精良以上的卡，商店也更容易摆出好货（面板「经济」里能看）',
    stat: 'luck', flat: 1,
  },
  {
    id: 'luckStar', tag: 'atk', glyph: '🌟', name: '福星',
    rarity: 4,
    w0: 0.40, gw: +0.020,
    title: '幸运 +2 · 暴击 +5% · 金币掉落率 +10%',
    desc: '整晚只该见一两张的传说卡：运气、暴击、财运一次给齐',
    stat: 'luck', flat: 2,
    extras: [
      { stat: 'critRate', flat: 0.05 },
      { stat: 'goldRate', flat: 0.10 },
    ],
  },

  // ---------------- 生存 ----------------
  {
    id: 'hide', tag: 'def', glyph: '❤', name: '厚皮',
    rarity: 0,
    w0: 1.40, gw: -0.060,   // 权重 = w0 + gw × (回合-1)
    title: '生命上限 +2', desc: '上限提高的同时立刻回满这 2 点',
    stat: 'maxHp', flat: 2, heal: 2,
  },
  {
    id: 'shell', tag: 'def', glyph: '⬢', name: '甲壳',
    rarity: 1,
    w0: 0.90, gw: +0.040,   // 权重 = w0 + gw × (回合-1)
    title: '防御 +15', desc: '减伤 = 防 /(100+防)，+15 约等于少挨 13% 的伤害',
    stat: 'armor', flat: 15,
  },
  {
    id: 'regen', tag: 'def', glyph: '✚', name: '再生',
    rarity: 0,
    w0: 0.60, gw: +0.010,   // 权重 = w0 + gw × (回合-1)
    title: '生命回复 +0.2/秒', desc: '边跑边回血，5 秒回一点；数值保守，靠它硬抗不现实',
    stat: 'hpRegen', flat: 0.2,
  },
  {
    id: 'vamp', tag: 'def', glyph: '❦', name: '吸血',
    rarity: 2,
    w0: 0.50, gw: +0.120,   // 权重 = w0 + gw × (回合-1)
    title: '吸血 +10%', desc: '造成伤害的 10% 转成生命，伤害越高回得越多',
    stat: 'lifesteal', flat: 0.10,
  },
  // 第 13 块：金钟罩 —— 周期无敌。数值上「3 秒无敌」胜过任何血量，
  // 但它是节拍器不是血条：15 秒里只有 3 秒能硬抗，逼你算着周期走位。
  {
    id: 'aegisUp', tag: 'def', glyph: '🔔', name: '金钟罩',
    rarity: 3,
    w0: 0.30, gw: +0.020,
    title: '每 15s 无敌 3s',
    desc: '周期无敌：罩子亮起时完全不受伤害（炮台弹道、红圈落箭全都挡掉）；再拿一层周期缩短 1.5 秒',
    stat: 'aegis', flat: 1,
  },
  // 第 11 块：生存系的传说卡 —— 把「活下来」这件事直接抬一个档
  {
    id: 'undying', tag: 'def', glyph: '♾', name: '不灭',
    rarity: 4,
    w0: 0.50, gw: +0.030,
    title: '生命上限 +3 · 生命回复 +0.3/秒',
    desc: '传说：上限抬满并立刻补 3 点，同时开始自己回血',
    stat: 'maxHp', flat: 3, heal: 3,
    extras: [{ stat: 'hpRegen', flat: 0.3 }],
  },

  // ---------------- 机动 ----------------
  {
    id: 'step', tag: 'mov', glyph: '➤', name: '轻功',
    rarity: 0,
    w0: 1.10, gw: -0.040,   // 权重 = w0 + gw × (回合-1)
    title: '移动速度 +10%', desc: '拉开距离就是最好的防御，遛小兵很管用',
    stat: 'moveSpeed', pct: 0.10,
  },
  {
    id: 'wind', tag: 'mov', glyph: '≫', name: '疾风',
    rarity: 1,
    w0: 0.90, gw: +0.010,   // 权重 = w0 + gw × (回合-1)
    title: '移动速度 +16%', desc: '大幅提速；代价是这一格不涨输出',
    stat: 'moveSpeed', pct: 0.16,
  },
  {
    id: 'cross', tag: 'mov', glyph: '✕', name: '游刃',
    rarity: 2,
    w0: 1.00, gw: +0.020,   // 权重 = w0 + gw × (回合-1)
    title: '移速 +8% · 攻速 +8%', desc: '走位和出手兼顾，不挑流派',
    stat: 'moveSpeed', pct: 0.08,
    extra: { stat: 'attackSpeed', pct: 0.08 },
  },
];

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

