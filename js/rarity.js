// ============================================================
// rarity.js —— 卡牌品质（第 11 块）
//
// 用户定案的五档，颜色从冷到热：
//   普通（灰）→ 稀有（绿）→ 精良（蓝）→ 史诗（金）→ 传说（红）
//
// 品质管两件事：
//   1. 长得不一样：三选一卡与商店货都带品质色（左边框 + 角标 + 内发光）。
//   2. 抽得不一样：品质是抽签里的**一层权重**。
//
//      某一件的权重 = 它自己的基础权重 × 品质系数 mul × (1 + 幸运 × luck)
//      · 基础权重：三选一是 upgrade.js 的 w0 + gw×(回合-1)，商店统一 1；
//      · mul：普通 1.00 / 稀有 0.92 / 精良 0.72 / 史诗 0.40 / 传说 0.22；
//      · luck：每点幸运给该档的额外倍率（普通 0，传说 0.55 —— 5 点幸运传说 ×3.75）。
//      实测（第 1 / 10 回合、幸运 0）：普通 58% → 35%，稀有 25% → 32%，
//      精良 15% → 30%，史诗 0% → 1.8%，传说 1.6% → 1.6%；
//      幸运 3 时「精良及以上」第 1 回合 16% → 23%、第 10 回合 33% → 42%
//      （每点幸运约 +2~3 个百分点），幸运 5 时传说单项 ×3.75。
//
//   所以「前期攻击力多、后期暴击多」这类按回合的权重变化完全没被动过，
//   品质只是在上面又压了一层「越高档越难抽」。
//   幸运只放宽高品质那一头，不会让好卡变少。
//
// ⚠️ 品质怎么分：**日常在用的卡才是普通**。
//   否则「稀有」会因为它卡片数量多，反而比「普通」更常见 —— 那就不叫稀有了。
//   现在的分法（共 26 张）：普通 9（锋利/连击/长臂/疾轮/锻造/财运/厚皮/再生/轻功）、
//   稀有 6（锐目/剑刃/剑锋/好运/甲壳/疾风）、
//   精良 7（致命/淬锋/淬毒/严寒/活血/吸血/游刃）、
//   史诗 2（剑阵/导电）、传说 2（福星/不灭）。
//   **每个系都要有高有低**，否则「机动系全是普通、进攻系全是精良」，
//   三张卡摆在一起时品质就失去意义了。
// ============================================================

export const RARITIES = [
  {
    id: 'common', name: '普通', short: '普',
    color: '#9aaba4',      // 灰
    mul: 1.00, luck: 0.00,
    desc: '基础强化',
  },
  {
    id: 'rare', name: '稀有', short: '稀',
    color: '#4fd07a',      // 绿
    mul: 0.92, luck: 0.10,
    desc: '比普通强一档',
  },
  {
    id: 'fine', name: '精良', short: '精',
    color: '#4aa8ff',      // 蓝
    mul: 0.72, luck: 0.20,
    desc: '成型的套路',
  },
  {
    id: 'epic', name: '史诗', short: '史',
    color: '#f0b93c',      // 金
    mul: 0.40, luck: 0.35,
    desc: '能改一手打法',
  },
  {
    id: 'legend', name: '传说', short: '传',
    color: '#f0554e',      // 红
    mul: 0.22, luck: 0.55,
    desc: '一整晚只该见一两张',
  },
];

export const RARITY_MAX = RARITIES.length - 1;

// 数字 / {rarity} / 别的都容错成 0（普通）
export function rarityIndex(x) {
  const v = typeof x === 'number' ? x : (x && typeof x.rarity === 'number' ? x.rarity : 0);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(RARITY_MAX, Math.round(v)));
}

export function rarityInfo(x) {
  return RARITIES[rarityIndex(x)];
}

// 幸运对某一档的倍率：1 + 幸运 × luck（幸运为负时按 0 算，别把好卡抽没了）
export function luckFactor(idx, luck = 0) {
  const i = rarityIndex(idx);
  return 1 + Math.max(0, luck || 0) * RARITIES[i].luck;
}

// 抽签权重里的「品质部分」：mul × 幸运倍率
export function rarityWeight(x, luck = 0) {
  const i = rarityIndex(x);
  return RARITIES[i].mul * luckFactor(i, luck);
}

// 一组候选在各档的合计概率（0~1，五档相加为 1）。
// weightOf(item) 给出「品质之外的权重」：三选一传回合权重，商店传 () => 1。
export function oddsOf(items, { luck = 0, weightOf = () => 1 } = {}) {
  const sum = RARITIES.map(() => 0);
  let total = 0;
  for (const it of items) {
    const base = Math.max(0, weightOf(it) || 0);
    if (base <= 0) continue;
    const w = base * rarityWeight(it, luck);
    sum[rarityIndex(it)] += w;
    total += w;
  }
  return RARITIES.map((r, i) => ({
    id: r.id,
    name: r.name,
    color: r.color,
    p: total > 0 ? sum[i] / total : 0,
  }));
}

// 「精良及以上」的合计概率，面板上一句话说明幸运值多少钱
export function highTierOdds(odds) {
  return odds.reduce((a, o, i) => a + (i >= 2 ? (typeof o === 'number' ? o : o.p) : 0), 0);
}
