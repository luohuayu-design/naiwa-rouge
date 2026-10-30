// ============================================================
// challenge.js —— 回合挑战（第 122 块）
//
// 用户需求：**每关随机挑 2 个回合，回合开始前弹一张「挑战」**，比如
//   · 残血：这一回合生命上限只剩一半
//   · 绵软：这一回合攻击力大幅降低（最低降到 1）
//   · 断剑：这一回合剑失效，什么剑都没有
//   · 怪物潮：怪物数量翻倍
// 打完之后再弹一次「你获得了奖励」三选一：88 金币 / 再一次三选一 /
// 下一回合随机属性大涨（基本属性 + 技能 + 法器各一条，**只活一个回合**）。
//
// 本文件是**纯数据 + 纯函数**，零 DOM、零 import 业务模块 ——
// 效果怎么落地（stats / weapon / 技能 CD / 法器增幅）全部由 main.js 接线。
// 这样 Node 里能直接跑断言，也不会和另一组并行开发的 DOM 区域打架。
//
// 约定（和 enemies / relic 那套一致）：
//   · `stat`      → 直接写进属性表，src 由 main.js 统一打成 `chal`
//   · `attackTo`  → 「攻击力压到原值的 x 倍，且不低于 1」（mul 由运行时算，
//                   因为要读当前面板值，不能写死）
//   · `roundMod`  → 交给 wave.js 的 applyRoundMod（countScale / speedMul / hasteMul）
//   · `noSword` / `noSkill` → 布尔硬开关
//   · `dmgTaken`  → 受击加重，乘在 hurtPlayer 的 raw 上
// ============================================================

// 每关挑几个挑战回合
export const CHAL_PER_LEVEL = 2;

// 挑战回合的选取范围：第 3 回合起、倒数第 2 回合止。
//   · 第 1~2 回合是软启动（第一关还要走武器仪式），不塞挑战；
//   · 最后一回合打完就结算，奖励（尤其「下一回合大涨」）没有落点。
export const CHAL_FIRST_ROUND = 3;
export const CHAL_LAST_GAP = 1;

// ---- 九条挑战 ----
// 每条只碰一个轴：血量 / 攻击 / 剑 / 数量 / 怪物速度 / 攻速 / 技能 / 移速 / 受伤。
// 一回合只出一条，所以「两头都挨打」的组合不存在（这也是不叠两条的原因：
// 残血 + 破防一起出会直接把一回合变成必死）。
export const CHALLENGES = [
  {
    id: 'thinBlood',
    name: '残血挑战',
    icon: '🩸',
    tag: '生命',
    desc: '这一回合你的生命上限只剩一半。血会按新上限重新夹一次，打完立刻还给你。',
    rule: '生命上限 ×0.5',
    stat: [{ stat: 'maxHp', mul: 0.5 }],
    clampHp: true,
  },
  {
    id: 'softPaw',
    name: '绵软挑战',
    icon: '🥀',
    tag: '攻击',
    desc: '这一回合你的攻击力大幅下降 —— 最低降到 1。剑不吃这一项，只看你自己的巴掌。',
    rule: '攻击力 → 原值的 40%（最低 1）',
    attackTo: 0.4,
  },
  {
    id: 'brokenSword',
    name: '断剑挑战',
    icon: '🗡️',
    tag: '武器',
    desc: '这一回合剑彻底失效：环上的剑不见了、也不再补，近战只剩你自己的巴掌。',
    rule: '环剑消失 · 剑技能按不动',
    noSword: true,
  },
  {
    id: 'tide',
    name: '怪物潮',
    icon: '🌊',
    tag: '数量',
    desc: '这一回合的怪物数量翻倍。慢慢打也行，就是得站得住。',
    rule: '怪物数量 ×2',
    roundMod: { countScale: 2 },
  },
  {
    id: 'gale',
    name: '疾风挑战',
    icon: '🌪️',
    tag: '怪物',
    desc: '这一回合的怪走得更快、出手也更密。别在空地上站桩。',
    rule: '怪物移速 ×1.45 · 出手频率 ×1.3',
    roundMod: { speedMul: 1.45, hasteMul: 1.3 },
  },
  {
    id: 'coldHand',
    name: '冷手挑战',
    icon: '❄️',
    tag: '攻速',
    desc: '这一回合你的手冻住了：两拍之间多出来的那段空档，怪会用它贴上来。',
    rule: '攻击速度 ×0.55',
    stat: [{ stat: 'attackSpeed', mul: 0.55 }],
  },
  {
    id: 'mute',
    name: '禁术挑战',
    icon: '🚫',
    tag: '技能',
    desc: '这一回合所有技能都按不动（万剑 / 箭雨 / 回血 / 法器主动全锁）。只剩走位和巴掌。',
    rule: '技能栏全锁',
    noSkill: true,
  },
  {
    id: 'heavyStep',
    name: '沉重挑战',
    icon: '⚖️',
    tag: '移动',
    desc: '这一回合脚上像绑了石头。拉扯变贵，被围住更难脱身。',
    rule: '移动速度 ×0.62',
    stat: [{ stat: 'moveSpeed', mul: 0.62 }],
  },
  {
    id: 'fragile',
    name: '破防挑战',
    icon: '🪨',
    tag: '防御',
    desc: '这一回合你挨的每一下都更疼。金钟罩照挡，但漏一下会记账。',
    rule: '受到的伤害 ×1.6',
    dmgTaken: 0.6,
  },
];

export const CHAL_BY_ID = Object.fromEntries(CHALLENGES.map((c) => [c.id, c]));

export function chalById(id) {
  return CHAL_BY_ID[id] || null;
}

// ---- 挑战回合规划 ----
// 从 [CHAL_FIRST_ROUND, total - CHAL_LAST_GAP] 里无放回抽 count 个，升序返回。
// rng 由 main.js 注入（种子局走固定随机流，非种子局走 Math.random）。
export function planRounds(rng, totalRounds, count = CHAL_PER_LEVEL) {
  const last = Math.max(0, (totalRounds | 0) - CHAL_LAST_GAP);
  const pool = [];
  for (let r = CHAL_FIRST_ROUND; r <= last; r++) pool.push(r);
  const pick = [];
  const n = Math.min(count, pool.length);
  for (let i = 0; i < n; i++) {
    const k = Math.floor(rng() * pool.length) % pool.length;
    pick.push(pool.splice(k, 1)[0]);
  }
  pick.sort((a, b) => a - b);
  return pick;
}

// 抽一条挑战。exclude = 本关已经出过的 id（一关两条尽量不重复，重复了就重抽几次）
export function rollChallenge(rng, exclude = []) {
  const used = new Set(exclude);
  const pool = CHALLENGES.filter((c) => !used.has(c.id));
  const src = pool.length ? pool : CHALLENGES;
  const i = Math.min(src.length - 1, Math.floor(rng() * src.length));
  return src[i];
}

// ---- 挑战奖励 ----
// 三选一，固定顺序（不抽签）：玩家每次都看到同样的三个位置，选起来不用重读。
export const REWARDS = [
  {
    id: 'coin',
    name: '88 金币',
    icon: '🪙',
    text: '直接进账 88 枚本局金币 —— 商店里那几格基本都能拿下了。',
    hint: '立刻生效',
    coin: 88,
  },
  {
    id: 'card',
    name: '再一次三选一',
    icon: '🃏',
    text: '额外开一次三选一。和回合结束本来那一次是叠加的，一回合能拿两张。',
    hint: '立刻开一张新面板',
    card: true,
  },
  {
    id: 'boost',
    name: '下一回合属性大涨',
    icon: '✨',
    text: '下一回合随机拿到三条大幅强化（基本属性 / 技能 / 法器各一条），只活这一个回合。',
    hint: '只持续一回合',
    boost: true,
  },
];

export const REWARD_BY_ID = Object.fromEntries(REWARDS.map((r) => [r.id, r]));

// ---- 「下一回合大涨」的池子（三类各抽一条） ----
// 幅度刻意做得夸张：它只活一个回合，等于「用一回合赌一把」。
// 基本属性里 maxHp 那条同时补满血（否则加了上限却还是残血，等于白给）。
export const BOOST_POOL = {
  base: [
    { id: 'bAtk', name: '攻击力 ×1.9', kind: 'stat', text: '攻击力 暴涨',
      mods: [{ stat: 'attack', mul: 1.9 }] },
    { id: 'bAspd', name: '攻击速度 ×1.7', kind: 'stat', text: '出手快到看不清',
      mods: [{ stat: 'attackSpeed', mul: 1.7 }] },
    { id: 'bMove', name: '移动速度 ×1.45', kind: 'stat', text: '脚下带风',
      mods: [{ stat: 'moveSpeed', mul: 1.45 }] },
    { id: 'bHp', name: '生命上限 ×1.6 · 回满', kind: 'stat', text: '皮糙肉厚还回满',
      mods: [{ stat: 'maxHp', mul: 1.6 }], healFull: true },
    { id: 'bRange', name: '攻击范围 +1.5 格', kind: 'stat', text: '巴掌变长',
      mods: [{ stat: 'attackRange', flat: 1.5 }] },
    { id: 'bCrit', name: '暴击率 +35%', kind: 'stat', text: '每三下一下狠的',
      mods: [{ stat: 'critRate', flat: 0.35 }] },
    { id: 'bArmor', name: '防御 +14', kind: 'stat', text: '拍在身上像拍墙',
      mods: [{ stat: 'armor', flat: 14 }] },
    { id: 'bSword', name: '剑伤害 ×1.7', kind: 'weapon', text: '环剑也吃这一口',
      mods: [{ stat: 'swordDamage', mul: 1.7 }] },
  ],
  skill: [
    { id: 'sCd', name: '技能冷却 ×0.5', kind: 'cd', text: '所有技能快一倍',
      cdFactor: 0.5 },
    { id: 'sCd2', name: '技能冷却 ×0.35', kind: 'cd', text: '技能几乎连着放',
      cdFactor: 0.35 },
  ],
  relic: [
    { id: 'rAmp', name: '法器增幅 ×1.6', kind: 'relic', text: '所有法器更疼更大',
      relicAmp: { dmg: 1.6, radius: 0.4 } },
    { id: 'rCd', name: '法器冷却 ×0.6', kind: 'relic', text: '法器转得飞快',
      relicAmp: { cd: 0.6 } },
  ],
};

// 抽三条：基本属性 / 技能 / 法器各一条（用户要求「包括基本属性、技能和法器」）
export function rollBoosts(rng) {
  const one = (list) => list[Math.min(list.length - 1, Math.floor(rng() * list.length))];
  return [one(BOOST_POOL.base), one(BOOST_POOL.skill), one(BOOST_POOL.relic)];
}

// 一行摘要（弹窗与 toast 共用：「攻击力 ×1.9 · 技能冷却 ×0.5 · 法器增幅 ×1.6」）
export function boostSummary(list) {
  return (list || []).map((b) => b.name).join(' · ');
}
