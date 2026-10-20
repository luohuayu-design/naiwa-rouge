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
//
// 对外：
//   UPGRADES           全部升级项（tag: atk|def|mov）
//   weightOf(up,round) 某项在某回合的权重（线性）
//   rollChoices(rng, {round, hasWeapon})  抽 3 张（三系各一，已洗牌）
//   chanceTable(round) 各系内每一项被抽中的概率（文档/测试用）
//   applyUpgrade()     应用并返回本次加成的来源标识
//   previewUpgrade()   预演一张升级（不改状态）
//   upgradeText()      一句话描述这次加成（面板 / 提示用）
// ============================================================
import { STAT_DEFS } from './stats.js';

export const UPGRADES = [
  // ---------------- 进攻 ----------------
  {
    id: 'edge', tag: 'atk', glyph: '⚔', name: '锋利',
    w0: 1.60, gw: -0.060,   // 权重 = w0 + gw × (回合-1)
    title: '攻击力 +1', desc: '每次近战命中的基础伤害 +1，前期一刀一只小兵',
    stat: 'attack', flat: 1,
  },
  {
    id: 'haste', tag: 'atk', glyph: '⚡', name: '连击',
    w0: 1.00, gw: +0.030,   // 权重 = w0 + gw × (回合-1)
    title: '攻击速度 +18%', desc: '出手更密，等效输出 +18%，和攻击力叠乘',
    stat: 'attackSpeed', pct: 0.18,
  },
  {
    id: 'reach', tag: 'atk', glyph: '◎', name: '长臂',
    w0: 1.00, gw: +0.010,   // 权重 = w0 + gw × (回合-1)
    title: '攻击范围 +0.40', desc: '脚下的圈更大，能先手拍到还没贴脸的怪',
    stat: 'attackRange', flat: 0.40,
  },
  {
    id: 'eye', tag: 'atk', glyph: '✦', name: '锐目',
    w0: 0.70, gw: +0.090,   // 权重 = w0 + gw × (回合-1)
    title: '暴击率 +15%', desc: '命中时按概率打出 1.5 倍伤害',
    stat: 'critRate', flat: 0.15,
  },
  {
    id: 'fang', tag: 'atk', glyph: '✧', name: '致命',
    w0: 0.50, gw: +0.140,   // 权重 = w0 + gw × (回合-1)
    title: '暴击伤害 +50% · 暴击率 +6%',
    desc: '暴击更疼；自带一点暴击率，单独拿到也有收益',
    stat: 'critDamage', pct: 0.50,
    extra: { stat: 'critRate', flat: 0.06 },
  },
  // ---- 武器系（needsWeapon：第 5 回合拿到环剑后才会进抽取池） ----
  {
    id: 'swordEdge', tag: 'atk', glyph: '🗡', name: '剑刃', needsWeapon: true,
    w0: 1.20, gw: +0.060,   // 权重 = w0 + gw × (回合-1)
    title: '剑刃倍率 +30%', desc: '环剑转着圈就能砍人，倍率直接放大它的伤害',
    stat: 'swordPower', pct: 0.30,
  },
  {
    id: 'swordArray', tag: 'atk', glyph: '✹', name: '剑阵', needsWeapon: true,
    w0: 1.00, gw: +0.050,   // 权重 = w0 + gw × (回合-1)
    title: '剑数量上限 +1', desc: '多一把剑轮转，环上更密、散射覆盖更广',
    stat: 'swordMax', flat: 1,
  },
  {
    id: 'swordSpin', tag: 'atk', glyph: ' ⟳', name: '疾轮', needsWeapon: true,
    w0: 1.00, gw: +0.020,   // 权重 = w0 + gw × (回合-1)
    title: '剑转速 +25%', desc: '剑转得更快，同样时间扫过更多怪',
    stat: 'swordOrbit', pct: 0.25,
  },
  {
    id: 'swordForge', tag: 'atk', glyph: '⚒', name: '锻造', needsWeapon: true,
    w0: 0.90, gw: +0.010,   // 权重 = w0 + gw × (回合-1)
    title: '剑回复快 20%', desc: '被消耗的剑更快回到环上（3.0 → 2.4 秒/把）',
    stat: 'swordRegen', pct: -0.20,
  },

  // ---------------- 生存 ----------------
  {
    id: 'hide', tag: 'def', glyph: '❤', name: '厚皮',
    w0: 1.40, gw: -0.060,   // 权重 = w0 + gw × (回合-1)
    title: '生命上限 +2', desc: '上限提高的同时立刻回满这 2 点',
    stat: 'maxHp', flat: 2, heal: 2,
  },
  {
    id: 'shell', tag: 'def', glyph: '⬢', name: '甲壳',
    w0: 0.90, gw: +0.040,   // 权重 = w0 + gw × (回合-1)
    title: '防御 +15', desc: '减伤 = 防 /(100+防)，+15 约等于少挨 13% 的伤害',
    stat: 'armor', flat: 15,
  },
  {
    id: 'regen', tag: 'def', glyph: '✚', name: '再生',
    w0: 0.60, gw: +0.010,   // 权重 = w0 + gw × (回合-1)
    title: '生命回复 +0.2/秒', desc: '边跑边回血，5 秒回一点；数值保守，靠它硬抗不现实',
    stat: 'hpRegen', flat: 0.2,
  },
  {
    id: 'vamp', tag: 'def', glyph: '❦', name: '吸血',
    w0: 0.50, gw: +0.120,   // 权重 = w0 + gw × (回合-1)
    title: '吸血 +10%', desc: '造成伤害的 10% 转成生命，伤害越高回得越多',
    stat: 'lifesteal', flat: 0.10,
  },

  // ---------------- 机动 ----------------
  {
    id: 'step', tag: 'mov', glyph: '➤', name: '轻功',
    w0: 1.10, gw: -0.040,   // 权重 = w0 + gw × (回合-1)
    title: '移动速度 +10%', desc: '拉开距离就是最好的防御，遛小兵很管用',
    stat: 'moveSpeed', pct: 0.10,
  },
  {
    id: 'wind', tag: 'mov', glyph: '≫', name: '疾风',
    w0: 0.90, gw: +0.010,   // 权重 = w0 + gw × (回合-1)
    title: '移动速度 +16%', desc: '大幅提速；代价是这一格不涨输出',
    stat: 'moveSpeed', pct: 0.16,
  },
  {
    id: 'cross', tag: 'mov', glyph: '✕', name: '游刃',
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
  return UPGRADES
    .filter((u) => u.tag === tag)
    .map((u) => ({ up: u, w: weightOf(u, round, opts) }))
    .filter((x) => x.w > 0);
}

// 加权随机取一个
function weightedPick(list, rng) {
  const total = list.reduce((a, x) => a + x.w, 0);
  if (total <= 0) return list[0]?.up || null;
  let r = rng() * total;
  for (const x of list) {
    r -= x.w;
    if (r < 0) return x.up;
  }
  return list[list.length - 1].up;
}

// 抽三张：三系各一张（系内按回合权重加权）+ 洗牌。
// opts.round：当前回合（决定权重档位）
// opts.hasWeapon：拿到环剑后武器系升级才会进池子（没武器抽到等于废牌）。
// rng 可注入，测试里能固定结果。
export function rollChoices(rng = Math.random, opts = {}) {
  const round = opts.round ?? 1;
  const picks = TAGS.map((tag) => weightedPick(poolOf(tag, round, opts), rng));
  for (let i = picks.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(rng() * (i + 1)));
    const tmp = picks[i]; picks[i] = picks[j]; picks[j] = tmp;
  }
  return picks;
}

// 应用一张升级。serial 只用来让每次加成的 src 唯一（便于 removeBySource 回滚）。
// 返回 { src, changes }：changes 是精确的「选前 → 选后」（用于卡片/提示文案）。
export function applyUpgrade(stats, up, serial = 0) {
  const list = [up, up.extra].filter(Boolean);
  const before = list.map((m) => stats.get(m.stat));
  const src = `upg:${up.id}:${serial}`;

  if (up.stat) stats.addMod({ stat: up.stat, flat: up.flat || 0, pct: up.pct || 0, src });
  if (up.extra) stats.addMod({ stat: up.extra.stat, flat: up.extra.flat || 0, pct: up.extra.pct || 0, src });

  // 上限变了要补血并夹紧当前血量
  if (up.stat === 'maxHp' || up.extra?.stat === 'maxHp') stats.syncHp(up.heal || 0);

  const changes = list.map((m, i) => {
    const def = STAT_DEFS.find((d) => d.key === m.stat);
    const from = before[i];
    const to = stats.get(m.stat);
    return {
      key: m.stat,
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
export function previewUpgrade(stats, up) {
  const list = [up, up.extra].filter(Boolean);
  return list.map((m) => {
    const def = STAT_DEFS.find((d) => d.key === m.stat);
    const from = stats.get(m.stat);
    const to = stats.preview(m.stat, { flat: m.flat || 0, pct: m.pct || 0 });
    return {
      key: m.stat,
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
export function chanceTable(round = 1, opts = {}) {
  return TAGS.map((tag) => {
    const pool = poolOf(tag, round, opts);
    const total = pool.reduce((a, x) => a + x.w, 0) || 1;
    return {
      tag,
      name: TAG_NAMES[tag],
      items: pool.map((x) => ({
        id: x.up.id,
        name: x.up.name,
        title: x.up.title,
        weight: x.w,
        p: x.w / total,
      })),
    };
  });
}
