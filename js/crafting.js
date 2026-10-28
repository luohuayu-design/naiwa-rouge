// ============================================================
// crafting.js —— 合成台系统（第 115 块 · 设计见 DESIGN.md）
//
// 「先写代码，之后再接进 main.js」的独立引擎。本文件**零 import 现有
// 业务模块**（不碰 enemy.js / relics.js / weapon.js / main.js），
// 所有与外部世界的交互都通过「依赖注入 + 回调」完成，这样：
//   ① 现在就能在 Node 里独立跑契约测试（不依赖浏览器 / 其它模块）；
//   ② 之后接 main.js 只加「一处创建 + 一处 onKill 调用」，不污染
//      正在被另一组（第 114 块第十一关）大改的 enemy.js / relics.js。
//
// 设计已由用户 2026-10-28 拍板（DESIGN.md §1）：
//   消耗原料（合成拆掉投入的剑 / 法器，赌输真亏）
//   局内随时（战斗中也随时开暂停弹窗）
//   高风险权重（废 40% / 平 40% / 杰作 15% / 事故 5%）
//   残片本局限定（不跨局，resetRunState 清空）
//
// ============================================================

// ---------------- 残片（打怪掉落，本局限定） ----------------
// 名字呼应主线三印记（笑声 / 名字 / 记忆），让「空白」反派渗进掉落物。
// rarity 权重决定掉落概率（越大越常见）。
export const SHARD_DEFS = {
  rust:   { name: '锈铁屑',   rarity: 60, theme: '日常' },
  name:   { name: '空白的名字', rarity: 16, theme: '名字' },
  laugh:  { name: '笑声的回音', rarity: 16, theme: '笑声' },
  memory: { name: '记忆的灰',   rarity: 16, theme: '记忆' },
  moss:   { name: '井水苔',   rarity: 12, theme: '井底' },
  frost:  { name: '钟楼的霜',   rarity: 6,  theme: '钟楼' },
};
export const SHARD_IDS = Object.keys(SHARD_DEFS);

// ---------------- 掉落权重 ----------------
// 打怪死亡时有 DROP_CHANCE 概率掉一枚残片；掉哪一枚按 rarity 加权。
// 精英 / 强怪可以传 bonus 提高概率（0~1 额外加成）。
const DROP_CHANCE = 0.03;      // 3% 基础掉率
const ELITE_BONUS = 0.06;      // 精英怪额外 +6%

// ---------------- 合成结果三档 + 事故 ----------------
// 权重已按用户定案：废 40 / 平 40 / 杰作 15 / 事故 5。
const OUTCOME_W = { junk: 40, normal: 40, master: 15, accident: 5 };

// ---------------- 配方表（内部实现用，玩家不可见） ----------------
// 每个配方给「好 / 坏」两种可能结果；同配方也可能赌输。
// match 描述原料需求（三种语义严格区分）：
//   shards: { id: 数量 }   需要的残片（双向严格相等，不多不少）
//   weapon: undefined = 不需要剑；null = 需要任意剑；'iron' 等 = 需要特定剑
//   relic:  undefined = 不需要法器；null = 需要任意法器；'frost' 等 = 需要特定法器
// good / bad：结果定义，字段见 resolveOutcome。
export const RECIPES = [
  {
    id: 'rust_iron',
    match: { shards: { rust: 1 }, weapon: 'iron', relic: undefined },
    good: { kind: 'sword', sword: 'poison', name: '淬毒铁剑', desc: '铁剑淬了毒，命中附带中毒', dmgMul: 1.15 },
    bad:  { kind: 'junk_sword', name: '锈剑', desc: '锈蚀严重，伤害 −20%，无法丢弃', dmgMul: 0.8 },
  },
  {
    id: 'moss_frost',
    match: { shards: { moss: 1 }, weapon: undefined, relic: 'frost' },
    good: { kind: 'relic_buff', relic: 'frost', name: '苔霜环', desc: '减速的同时缓慢回血', buff: 'heal' },
    bad:  { kind: 'junk_relic', relic: 'frost', name: '霉环', desc: '移速 −10%', buff: 'slowSelf' },
  },
  {
    id: 'name_any',
    match: { shards: { name: 1 }, weapon: null, relic: undefined },
    good: { kind: 'sword', sword: 'master', name: '空白之剑', desc: '命中概率抹掉目标一个增益', master: true },
    bad:  { kind: 'junk_sword', name: '无名的剑', desc: '打怪不掉落，纯亏', noLoot: true },
  },
  {
    id: 'laugh_bell',
    match: { shards: { laugh: 1 }, weapon: undefined, relic: 'bell' },
    good: { kind: 'relic_buff', relic: 'bell', name: '狂笑之钟', desc: '打断范围翻倍', buff: 'range2x' },
    bad:  { kind: 'junk_relic', relic: 'bell', name: '哑钟', desc: '不再打断', buff: 'noInterrupt' },
  },
  {
    id: 'memory_puppet',
    match: { shards: { memory: 2 }, weapon: undefined, relic: 'puppet' },
    good: { kind: 'relic_buff', relic: 'puppet', name: '灰傀', desc: '傀儡上限永久 +1', buff: 'cap1' },
    bad:  { kind: 'junk_relic', relic: 'puppet', name: '碎傀', desc: '傀儡术降一级', buff: 'downgrade' },
  },
  {
    id: 'frost_thunder',
    match: { shards: { frost: 1 }, weapon: 'thunder', relic: undefined },
    good: { kind: 'sword', sword: 'master', name: '冬雷', desc: '冻结 + 全场连锁', master: true },
    bad:  { kind: 'junk_sword', name: '哑雷', desc: '雷剑不再连锁', noChain: true },
  },
];

// 通用「事故」彩蛋：炸炉 —— 全场怪受伤 + 玩家也被震掉血。
// 数值由外部回调结算（因为伤害系统在 enemy.js / main.js），这里只描述。
export const ACCIDENT = {
  id: 'boom',
  name: '炸炉',
  desc: '炉子炸了：全场怪物受伤，你也被震掉血',
};

// ============================================================
// 系统本体
// ============================================================
export function createCraftingSystem(deps = {}) {
  const {
    rng = Math.random,           // 随机源（测试可注入定值）
    // 以下回调由 main.js 注入，本文件不 import 任何业务模块：
    onShardDrop = () => {},      // (shardId) 捡到一枚残片
    onCraftResult = () => {},    // (result) 合成出结果
  } = deps;

  // 本局拥有的残片数量表（本局限定，不跨局）
  const shards = { rust: 0, name: 0, laugh: 0, memory: 0, moss: 0, frost: 0 };

  // 本局已合成的「杰作 / 废料」物品（影响后续合成判定 / 结算展示）
  const crafted = [];

  // ---------------- 掉落 ----------------
  // 怪死亡时调用。isElite 提高掉率。
  function onKill(isElite = false) {
    const p = DROP_CHANCE + (isElite ? ELITE_BONUS : 0);
    if (rng() >= p) return null;
    const id = rollShard(rng);
    shards[id] = (shards[id] || 0) + 1;
    onShardDrop(id);
    return id;
  }

  // 按 rarity 加权抽一枚残片
  function rollShard(r = rng) {
    let total = 0;
    for (const id of SHARD_IDS) total += SHARD_DEFS[id].rarity;
    let roll = r() * total;
    for (const id of SHARD_IDS) {
      roll -= SHARD_DEFS[id].rarity;
      if (roll < 0) return id;
    }
    return SHARD_IDS[SHARD_IDS.length - 1];
  }

  // ---------------- 配方匹配 ----------------
  // 输入玩家选择的原料，返回匹配的配方，或 null（配方不存在）。
  // 匹配规则：残片必须完全一致；weapon/relic 若配方要求则必须匹配。
  function findRecipe(input) {
    const { shards: want, weapon: needWeapon, relic: needRelic } = input;
    return RECIPES.find((r) => {
      const m = r.match;
      // 残片：双向严格相等（配方要的和玩家给的，数量完全一致，不多不少）
      if (!shardsEqual(want, m.shards)) return false;
      // 武器
      if (m.weapon === null) {
        // 需要「任意剑」→ 玩家必须提供了剑
        if (!needWeapon) return false;
      } else if (m.weapon) {
        if (needWeapon !== m.weapon) return false;
      }
      // 法器
      if (m.relic === null) {
        if (!needRelic) return false;
      } else if (m.relic !== undefined) {
        if (needRelic !== m.relic) return false;
      }
      return true;
    }) || null;
  }

  // ---------------- 合成 ----------------
  // 输入原料，消耗后返回结果。result = { outcome, recipe, result, accident }。
  //   outcome: 'junk' | 'normal' | 'master' | 'accident' | 'no_recipe'
  //   result:  好 / 坏结果对象（accident 时为 ACCIDENT）
  // 消耗由调用方（main.js）负责 —— 本函数只返回「要消耗什么 + 结果」，
  // 不直接改武器 / 法器（那是 weapon.js / relics.js 的职责，避免 import）。
  function craft(input) {
    const recipe = findRecipe(input);
    if (!recipe) return { outcome: 'no_recipe', recipe: null, result: null };

    // 抽结果档位
    const outcome = rollOutcome(rng);
    // 四档语义（各有区别，不能 master 和 normal 撞车）：
    //   master   = 杰作：出 recipe.good，且额外返还 1 枚残片（净赚，最高价值）
    //   normal   = 寻常：出 recipe.good（正常的好结果）
    //   junk     = 废料：出 recipe.bad（赌输了）
    //   accident = 事故：炸炉彩蛋（好坏参半，见 ACCIDENT）
    let result;
    let bonusShard = null;   // master 档返还的残片（配方要求的第一个残片）
    if (outcome === 'accident') {
      result = ACCIDENT;
    } else if (outcome === 'master') {
      result = recipe.good;
      // 杰作额外返还：把配方消耗的第一个残片还回来（净赚感）
      bonusShard = Object.keys(recipe.match.shards)[0] || null;
    } else if (outcome === 'normal') {
      result = recipe.good;
    } else {
      result = recipe.bad;
    }

    // 扣除残片（master 档返还的那枚在下面加回）
    for (const id of Object.keys(recipe.match.shards)) {
      shards[id] = Math.max(0, (shards[id] || 0) - recipe.match.shards[id]);
    }
    if (bonusShard) shards[bonusShard] = (shards[bonusShard] || 0) + 1;

    const rec = {
      outcome,
      recipe: recipe.id,
      result,
      bonusShard,
      accident: outcome === 'accident',
    };
    crafted.push(rec);
    onCraftResult(rec);
    return rec;
  }

  // 结果档位抽签（权重废 40 / 平 40 / 杰作 15 / 事故 5）
  function rollOutcome(r = rng) {
    const total = OUTCOME_W.junk + OUTCOME_W.normal + OUTCOME_W.master + OUTCOME_W.accident;
    let roll = r() * total;
    for (const k of ['junk', 'normal', 'master', 'accident']) {
      roll -= OUTCOME_W[k];
      if (roll < 0) return k;
    }
    return 'junk';
  }

  // ---------------- 查询 ----------------
  function shardCount(id) { return shards[id] || 0; }
  function shardSnapshot() { return { ...shards }; }
  function craftedList() { return crafted.slice(); }

  // ---------------- 序列化（局内存档，本局限定） ----------------
  // 只序列化残片 + 已合成记录。武器 / 法器状态由各自系统负责，
  // 本系统不重复保存。
  function serialize() {
    return { shards: { ...shards }, crafted: crafted.slice() };
  }

  function restore(saved) {
    if (saved && saved.shards) {
      for (const id of SHARD_IDS) shards[id] = saved.shards[id] || 0;
    }
    if (saved && Array.isArray(saved.crafted)) {
      crafted.length = 0;
      crafted.push(...saved.crafted);
    }
  }

  // ---------------- 重置（新开一局） ----------------
  function reset() {
    for (const id of SHARD_IDS) shards[id] = 0;
    crafted.length = 0;
  }

  return {
    onKill,
    craft,
    findRecipe,
    rollShard,
    rollOutcome,
    shardCount,
    shardSnapshot,
    craftedList,
    serialize,
    restore,
    reset,
    DEFS: { SHARD_DEFS, RECIPES, ACCIDENT, DROP_CHANCE, ELITE_BONUS, OUTCOME_W },
  };
}

// ============================================================
// 纯函数工具（导出给测试直接验）
// ============================================================

// 残片集合双向严格相等（键和数量都一致，配方要的不多不少）
function shardsEqual(a, b) {
  const ka = Object.keys(a).filter((k) => (a[k] || 0) > 0);
  const kb = Object.keys(b).filter((k) => (b[k] || 0) > 0);
  if (ka.length !== kb.length) return false;
  for (const k of ka) {
    if ((a[k] || 0) !== (b[k] || 0)) return false;
  }
  return true;
}

// 输入是否匹配某配方（对外暴露，测试用）
export function matchesRecipe(recipe, shards, weapon, relic) {
  const m = recipe.match;
  if (!shardsEqual(shards, m.shards)) return false;
  if (m.weapon === null) { if (!weapon) return false; }
  else if (m.weapon) { if (weapon !== m.weapon) return false; }
  if (m.relic === null) { if (!relic) return false; }
  else if (m.relic !== undefined) { if (relic !== m.relic) return false; }
  return true;
}
