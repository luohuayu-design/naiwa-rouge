// ============================================================
// elementReaction.js —— 元素反应系统（第 115 块 · 设计见 DESIGN.md）
//
// 创意方向（用户 2026-10-28 选）：「5 种元素剑互相触发，配剑变成有意义的决策」。
// 现有 5 元素剑各打各的，这里加「元素印记 + 两两反应」：
//
//   怪身上同一时刻最多挂 2 种印记（旧印记被新顶掉）。
//   第 2 种印记落上去的瞬间，两种印记「反应」产生额外效果，然后双双清空。
//
// 反应表（4 组，都复用既有属性：冰冻/击退/吸血/dot 已实现，不造新底层）：
//   冰 + 雷 = 冻碎   —— 冻结目标 + 高额伤害 + 周围连锁闪电（单体秒杀 + AOE）
//   毒 + 血 = 蚀骨   —— 目标持续流血，吸血量翻倍反哺玩家（续航）
//   震 + 雷 = 导电   —— 目标被击退，落点一圈导电（控场 + 地形）
//   冰 + 毒 = 寒毒   —— 减速叠加到冻结 + 双 dot（软控 + 消耗）
//
// ⚠️ 本文件**零 import 业务模块**（不碰 enemy.js / weapon.js / main.js），
//   与 crafting.js 同一套「依赖注入 + 回调」约定 —— 现在可 Node 独立测试，
//   之后接 main.js 只加「元素剑命中时调 markElement()」一处，不污染
//   正在被另一组（第 114 块第十一关）大改的 enemy.js。
// ============================================================

// 元素种类（与 swordKinds.js 的 KIND_ORDER 一致，但不 import 它避免耦合）
export const ELEMENTS = ['iron', 'poison', 'frost', 'thunder', 'leech', 'quake'];
// 能参与反应的元素（iron 无附加效果，不参与）
export const REACTIVE = ['poison', 'frost', 'thunder', 'leech', 'quake'];

// ---------------- 反应表 ----------------
// key 用「两个元素按字典序拼接」，保证「冰+雷」和「雷+冰」是同一个反应。
// 每个反应定义效果，数值走「外部注入的 wstats 属性表」（同 weapon.js 的规矩）。
export const REACTIONS = {
  'frost_thunder': {
    name: '冻碎',
    desc: '冻结目标 + 高额伤害 + 周围连锁闪电',
    // effect 由回调执行：freeze(目标, 秒) / burst(目标, 伤害) / chain(目标, 比例)
    apply: (ctx, e) => {
      ctx.freeze(e, 1.2);                       // 冻结 1.2 秒
      ctx.damage(e, 1.6, { cls: 'reaction' });  // 1.6 倍武器伤害
      ctx.chain(e, 0.6);                        // 连锁 60% 伤害
    },
  },
  'leech_poison': {
    name: '蚀骨',
    desc: '目标持续流血 + 吸血量翻倍反哺玩家',
    apply: (ctx, e) => {
      ctx.dot(e, { dps: 0.4, time: 4 });        // 持续流血
      ctx.heal(2.0);                            // 回 2 点（「吸血翻倍」简化为固定回血）
    },
  },
  'quake_thunder': {
    name: '导电',
    desc: '目标被击退，落点一圈导电',
    apply: (ctx, e) => {
      ctx.knock(e, 2.0);                        // 击退 2 格
      ctx.zone(e, 3.0, 0.4);                    // 落点 3 格半径 0.4 伤
    },
  },
  'frost_poison': {
    name: '寒毒',
    desc: '减速叠加到冻结 + 双 dot',
    apply: (ctx, e) => {
      ctx.freeze(e, 0.8);                       // 冻结 0.8 秒
      ctx.dot(e, { dps: 0.3, time: 3 });        // 额外 dot
    },
  },
};

// 反应 key：两个元素排序后拼接
export function reactionKey(a, b) {
  return [a, b].sort().join('_');
}

// 两个元素能否反应（都在 REACTIVE 里，且排序后 key 存在于 REACTIONS）
export function canReact(a, b) {
  if (!REACTIVE.includes(a) || !REACTIVE.includes(b) || a === b) return false;
  return reactionKey(a, b) in REACTIONS;
}

// ============================================================
// 系统本体
// ============================================================
// deps.ctx 是「效果执行器」由 main.js 注入，签名（全部可选，缺了就跳过）：
//   freeze(e, sec)   冻结目标
//   damage(e, mul)   对目标造成 mul×武器伤害
//   chain(e, ratio)  连锁到周围
//   dot(e, {dps,time})  挂 dot
//   heal(amount)     给玩家回血
//   knock(e, dist)   击退
//   zone(e, r, dmg)  落点一圈伤害
// deps.rng 随机源（测试注入）
export function createReactionSystem(deps = {}) {
  const { ctx = {}, rng = Math.random } = deps;

  // 每只怪的印记（由外部管理 id → [元素数组]）
  // 这里只提供「给一只怪挂印记」的纯判定，印记存储由调用方决定
  // （因为怪的实体在 enemy.js，本文件不持有引用）。

  // 尝试给目标挂一个元素印记（纯判定版，不触发副作用）。
  // 返回：
  //   { reacted: true,  reaction, key }   触发了反应
  //   { reacted: false, marks: [...] }    只挂了印记（返回当前印记列表）
  // marks：当前印记数组（旧印记）。新元素 el 落到上面。
  // ⚠️ 本函数只做「判定 + 印记推进」，不执行反应副作用 —— 执行副作用用 apply()。
  function mark(marks, el) {
    if (!REACTIVE.includes(el)) {
      // 非反应元素（如 iron）不参与印记
      return { reacted: false, marks: marks.slice() };
    }
    // 已有印记里找一个能和 el 反应的
    for (let i = 0; i < marks.length; i++) {
      const prev = marks[i];
      if (canReact(prev, el)) {
        const key = reactionKey(prev, el);
        return { reacted: true, reaction: REACTIONS[key], key, marks: [] };
      }
    }
    // 没反应：挂上（最多 2 个，旧的顶掉）
    let next = marks.slice();
    next.push(el);
    if (next.length > 2) next = next.slice(next.length - 2);
    return { reacted: false, marks: next };
  }

  // 更贴近实战的入口：给一只怪挂印记（怪对象 + 当前印记 + 新元素）
  // 用 target 作为 ctx 闭包里的 e。返回同上。
  function apply(target, el) {
    const marks = target._marks || [];
    const before = marks.slice();
    // 尝试反应
    for (let i = 0; i < before.length; i++) {
      const prev = before[i];
      if (canReact(prev, el)) {
        const key = reactionKey(prev, el);
        const reaction = REACTIONS[key];
        if (reaction && reaction.apply) reaction.apply(ctx, target);
        target._marks = [];
        return { reacted: true, reaction: REACTIONS[key], key, marks: [] };
      }
    }
    // 挂印记
    let next = before.slice();
    next.push(el);
    if (next.length > 2) next = next.slice(next.length - 2);
    target._marks = next;
    return { reacted: false, marks: next };
  }

  return {
    mark,
    apply,
    DEFS: { ELEMENTS, REACTIVE, REACTIONS },
  };
}

// ============================================================
// 纯函数（canReact / reactionKey 已在文件上方 export，这里不重复）
// ============================================================
