// ============================================================
// curses.js —— 夜行诅咒（第 21 块：自选 debuff 换骨币倍率）
//
// 设计原则（承第 19 块「局外因素不能把难度吃掉」的反面）：
//   · 诅咒是**玩家自己加的负担**，方向永远是把这局变难；
//   · 换来的只有骨币倍率（局外货币，而局外成长是刻意很弱的六簇火种），
//     所以「越狠越富」不会把难度吃掉，只会让富的人更早把火点完；
//   · 每条只碰一个数，彼此不联动：脆骨少血、铅足慢脚、昏暗减幸运、
//     空囊少掉钱、薄刃低攻、荆棘受伤更重；
//   · 倍率是**加法叠加**（1 + Σ），六条全选 ×2.30 —— 好算，也好解释。
//
// ⚠️ 命名：这里叫「诅咒」，第二关咒面图腾的减速是「咒」（main.js 的
//    cursePlayer / curseT / HUD 的「咒」角标）—— 两套东西，互不相干。
//    本文件的 DOM 类名统一 rc- 前缀，别和 HUD 的 .curse-chip 撞。
//
// 选择结果存在 profile().runCurses（数组，存 id），开局一次性落账；
// 续玩时从 runSave 的 curses 字段恢复（mods 已经带 src='curse' 回放了）。
// ============================================================

// mul：这条诅咒给多少骨币倍率（0.25 = +25%）。dmgTaken：受伤加重（荆棘专用）
// eff：给玩家看的具体数字（按 STAT_DEFS 基础值算的「改前 → 改后」，选卡面板直接展示）
export const RUN_CURSES = [
  {
    id: 'frail', name: '脆骨', icon: '🦴', mul: 0.25,
    desc: '生命上限 −2（6 → 4）。挨两下就没了。',
    eff: '生命上限 6 → 4',
    mods: [{ stat: 'maxHp', flat: -2 }],
  },
  {
    id: 'lead', name: '铅足', icon: '⛓️', mul: 0.20,
    desc: '移动速度 −15%。拉扯变贵，被围住更难脱身。',
    eff: '移动速度 4.40 → 3.74（格/秒）',
    mods: [{ stat: 'moveSpeed', pct: -0.15 }],
  },
  {
    // ⚠️ 原本这里是「幸运 −0.6」，实测**无效**：幸运 base = 0，
    //    stats.get() 把负数夹回 0（公式下限 0），开局根本没有可减的部分。
    //    改成减攻速 —— base 1.20，减得动，而且和「薄刃」不是一个味道：
    //    薄刃是每一拍更轻，迟滞是两拍之间更长
    id: 'sluggish', name: '迟滞', icon: '⏳', mul: 0.20,
    desc: '攻击速度 −12%（1.20 → 1.06 次/秒）。两拍之间多出来的那点空档，怪会用它贴上来。',
    eff: '攻击速度 1.20 → 1.06 次/秒',
    mods: [{ stat: 'attackSpeed', pct: -0.12 }],
  },
  {
    id: 'hunger', name: '空囊', icon: '💸', mul: 0.20,
    desc: '金币掉落 −35%。商店那几格会看得更久。',
    eff: '金币掉落率 45% → 29%',
    mods: [{ stat: 'goldRate', pct: -0.35 }],
  },
  {
    id: 'thin', name: '薄刃', icon: '🗡️', mul: 0.15,
    desc: '攻击力 −12%。拍下去不够疼，后面的回合会记账。',
    eff: '攻击力 1.0 → 0.88',
    mods: [{ stat: 'attack', pct: -0.12 }],
  },
  {
    id: 'thorn', name: '荆棘', icon: '🩸', mul: 0.30,
    desc: '受到的伤害 +30%。金钟罩照挡，但漏一下很疼。',
    eff: '每次受伤 ×1.30',
    dmgTaken: 0.30,
  },
];

export const CURSE_BY_ID = Object.fromEntries(RUN_CURSES.map((c) => [c.id, c]));

export function curseById(id) {
  return CURSE_BY_ID[id] || null;
}

// 只留下认识的 id（存档里塞了怪东西也不会炸），按表顺序排好
export function curseList(ids) {
  const set = new Set(Array.isArray(ids) ? ids : []);
  return RUN_CURSES.filter((c) => set.has(c.id));
}

// 骨币倍率：1 + Σ mul，保留两位小数（1.75 而不是 1.7499999999）
export function curseMul(ids) {
  const sum = curseList(ids).reduce((a, c) => a + (c.mul || 0), 0);
  return Math.round((1 + sum) * 100) / 100;
}

// 受伤加重合计（0 = 没有荆棘）
export function curseDmg(ids) {
  const sum = curseList(ids).reduce((a, c) => a + (c.dmgTaken || 0), 0);
  return Math.round(sum * 100) / 100;
}

// 落账：先按来源撤一次（重复开局不叠加），再把每条诅咒写进属性表。
// 返回 { count, mul, dmgTaken } —— main.js 用 dmgTaken 存起来给 hurtPlayer 用。
export function applyRunCurses(stats, wstats, ids = []) {
  stats.removeBySource('curse');
  wstats.removeBySource('curse');
  const list = curseList(ids);
  for (const c of list) {
    for (const m of c.mods || []) {
      const target = m.scope === 'weapon' ? wstats : stats;
      target.addMod({ stat: m.stat, flat: m.flat || 0, pct: m.pct || 0, src: 'curse' });
    }
  }
  return { count: list.length, mul: curseMul(ids), dmgTaken: curseDmg(ids) };
}

// 「脆骨 / 铅足 / 荆棘」这样的一行摘要（结算与调试用）
export function curseNames(ids) {
  return curseList(ids).map((c) => c.name).join(' / ');
}
