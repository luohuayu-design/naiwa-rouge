// ============================================================
// curses.js —— 夜行诅咒（第 21 块：自选 debuff 换骨币倍率）
//
// 设计原则（承第 19 块「局外因素不能把难度吃掉」的反面）：
//   · 诅咒是**玩家自己加的负担**，方向永远是把这局变难；
//   · 换来的只有骨币倍率（局外货币，而局外成长是刻意很弱的六簇火种），
//     所以「越狠越富」不会把难度吃掉，只会让富的人更早把火点完；
//   · 每条只碰一个数，彼此不联动：脆骨少血、铅足慢脚、迟滞减攻速、
//     空囊少掉钱、薄刃低攻、荆棘受伤更重；
//   · 数值一律走 stats 的 **mul 最终乘算**（第 112 块）：先算完所有升级 / 道具 / 火种，
//     最后再乘诅咒倍率 —— 局中 +3 生命上限，脆骨下实际只 +1.98；
//   · 骨币倍率是**加法叠加**（1 + Σ），第 112 块起各条减半，六条全选 ×1.65。
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
    id: 'frail', name: '脆骨', icon: '🦴', mul: 0.125,
    desc: '最终生命上限 ×0.66，实时计算：基础 10 → 6.6；局中再 +3 上限，实际只 +1.98（面板约 2 点）。',
    eff: '生命上限 10 → 6.6（最终 ×0.66）',
    mods: [{ stat: 'maxHp', mul: 0.66 }],
  },
  {
    id: 'lead', name: '铅足', icon: '⛓️', mul: 0.10,
    desc: '最终移动速度 ×0.85。拉扯变贵，被围住更难脱身。',
    eff: '移动速度 4.40 → 3.74（格/秒）',
    mods: [{ stat: 'moveSpeed', mul: 0.85 }],
  },
  {
    // ⚠️ 原本这里是「幸运 −0.6」，实测**无效**：幸运 base = 0，
    //    stats.get() 把负数夹回 0（公式下限 0），开局根本没有可减的部分。
    //    改成减攻速 —— base 1.20，减得动，而且和「薄刃」不是一个味道：
    //    薄刃是每一拍更轻，迟滞是两拍之间更长
    id: 'sluggish', name: '迟滞', icon: '⏳', mul: 0.10,
    desc: '最终攻击速度 ×0.88（1.20 → 1.06 次/秒）。两拍之间多出来的那点空档，怪会用它贴上来。',
    eff: '攻击速度 1.20 → 1.06 次/秒',
    mods: [{ stat: 'attackSpeed', mul: 0.88 }],
  },
  {
    id: 'hunger', name: '空囊', icon: '💸', mul: 0.10,
    desc: '最终金币掉落 ×0.65（45% → 29%）。商店那几格会看得更久。',
    eff: '金币掉落率 45% → 29%',
    mods: [{ stat: 'goldRate', mul: 0.65 }],
  },
  {
    id: 'thin', name: '薄刃', icon: '🗡️', mul: 0.075,
    desc: '最终攻击力 ×0.88。拍下去不够疼，后面的回合会记账。',
    eff: '攻击力 1.0 → 0.88',
    mods: [{ stat: 'attack', mul: 0.88 }],
  },
  {
    id: 'thorn', name: '荆棘', icon: '🩸', mul: 0.15,
    desc: '受到的最终伤害 ×1.30。金钟罩照挡，但漏一下很疼。',
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
      target.addMod({ stat: m.stat, flat: m.flat || 0, pct: m.pct || 0, mul: m.mul, src: 'curse' });
    }
  }
  return { count: list.length, mul: curseMul(ids), dmgTaken: curseDmg(ids) };
}

// 「脆骨 / 铅足 / 荆棘」这样的一行摘要（结算与调试用）
export function curseNames(ids) {
  return curseList(ids).map((c) => c.name).join(' / ');
}

// ============================================================
// 第 122 块追加：盲盒式减成（三选一「刷新」的价格）
//
// 与上面 RUN_CURSES 是两套东西，别混：
//   · RUN_CURSES = 开局**自选**的大刀，换局外骨币倍率，写进 profile，进诅咒勾选面板；
//   · BOX_CURSES = 局内**随机抽**的小减成，**没有任何补偿** —— 它就是刷新的价格。
//     味道照局外盲盒的负面池（`metaShop.js` 的 NEG）：一次只碰一个数、幅度小、成对挤压手感。
//   · 一局内不重复（抽过的不会再抽），池子就这 10 条；全部走 stats 的 **mul 最终乘算**，
//     叠几条是连乘，不会像 flat 那样被 pct 反向放大，也不会线性失控。
//   · **只影响本局**：不写 profile、不改骨币倍率、不进诅咒勾选面板、读档成对抹掉。
// ============================================================
export const BOX_CURSES = [
  {
    id: 'weak', name: '薄刃', icon: '🗡️', eff: '攻击力 −10%',
    desc: '拍下去轻了一成。前期怪血薄还看不出来，越往后越记账。',
    mods: [{ stat: 'attack', mul: 0.90 }],
  },
  {
    id: 'anemic', name: '瘪血', icon: '💔', eff: '生命上限 −10%',
    desc: '血条短一截（基础 10 → 9 起步）。这一局没有满血开局这回事。',
    mods: [{ stat: 'maxHp', mul: 0.90 }],
  },
  {
    id: 'lead', name: '铅靴', icon: '🥾', eff: '移动速度 −12%',
    desc: '拉扯变贵。躲红圈、绕背、切车道都会差那半步。',
    mods: [{ stat: 'moveSpeed', mul: 0.88 }],
  },
  {
    id: 'numb', name: '钝拍', icon: '🐌', eff: '攻击速度 −10%',
    desc: '两拍之间多一道空档，怪会用这点时间贴上来。',
    mods: [{ stat: 'attackSpeed', mul: 0.90 }],
  },
  {
    id: 'shortarm', name: '短臂', icon: '🧤', eff: '攻击范围 −15%',
    desc: '脚下的圈小一圈，走位要更贴脸 —— 也更危险。',
    mods: [{ stat: 'attackRange', mul: 0.85 }],
  },
  {
    id: 'dull', name: '哑锋', icon: '💥', eff: '暴击伤害 −10%',
    desc: '暴击还在，但没那么炸。堆暴击的流派会先感觉到。',
    mods: [{ stat: 'critDamage', mul: 0.90 }],
  },
  {
    id: 'holey', name: '漏财', icon: '🕳️', eff: '金币掉落 −15%',
    desc: '商店那几格会看得更久。不致命，但这一局的装备会慢半拍。',
    mods: [{ stat: 'goldRate', mul: 0.85 }],
  },
  {
    id: 'thorns', name: '荆棘皮', icon: '🩸', eff: '每次受伤 +12%',
    desc: '挨打更疼，金钟罩照挡。和「荆棘」那条夜行诅咒不是一回事，别叠加算。',
    dmgTaken: 0.12,
  },
  {
    id: 'rusty', name: '剑锈', icon: '🌫️', eff: '剑伤害 −10%',
    desc: '环剑整把钝掉一成（元素波及的伤害同源，一起变轻）。',
    mods: [{ stat: 'swordDamage', scope: 'weapon', mul: 0.90 }],
  },
  {
    id: 'blunt', name: '钝锋', icon: '🪤', eff: '剑暴击率 −15%',
    desc: '剑的暴击（基础 10%）被削到 8.5%。剑流前期最难受的一条。',
    mods: [{ stat: 'swordCrit', scope: 'weapon', mul: 0.85 }],
  },
];

export const BOX_CURSE_BY_ID = Object.fromEntries(BOX_CURSES.map((c) => [c.id, c]));

export function boxCurseById(id) {
  return BOX_CURSE_BY_ID[id] || null;
}

// 只留认识的 id、去重、按表顺序排（存档塞了怪东西也不炸）
export function boxCurseList(ids) {
  const set = new Set(Array.isArray(ids) ? ids : []);
  return BOX_CURSES.filter((c) => set.has(c.id));
}

// 受伤加重合计（荆棘皮；没背就是 0）
export function boxCurseDmg(ids) {
  const sum = boxCurseList(ids).reduce((a, c) => a + (c.dmgTaken || 0), 0);
  return Math.round(sum * 100) / 100;
}

// 落账：先按 src='boxcurse' 全撤再重放（刷新多次不会叠两遍）。
// 返回 { count, dmgTaken } —— main.js 把 dmgTaken 存给 hurtPlayer 用。
export function applyBoxCurses(stats, wstats, ids = []) {
  stats.removeBySource('boxcurse');
  wstats.removeBySource('boxcurse');
  const list = boxCurseList(ids);
  for (const c of list) {
    for (const m of c.mods || []) {
      const target = m.scope === 'weapon' ? wstats : stats;
      target.addMod({ stat: m.stat, flat: 0, pct: 0, mul: m.mul, src: 'boxcurse' });
    }
  }
  return { count: list.length, dmgTaken: boxCurseDmg(ids) };
}

// 「薄刃 / 漏财」这样的一行摘要（刷新面板的提示行 + 调试口用）
export function boxCurseNames(ids) {
  return boxCurseList(ids).map((c) => c.name).join(' · ');
}
