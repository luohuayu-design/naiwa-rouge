// ============================================================
// weather.js —— 天气 / 环境变化系统（第 115 块 · 创意 14）
//
// 创意（用户 2026-10-28）：「每关随机一种天气，低成本，但每关观感立刻不同」。
// 呼应主线「永夜」的压抑基调，天气都是「夜色下的环境异变」，不是晴天暴雨。
//
//   每关开局 roll 一种天气（可配概率），只影响**局内表现**，不碰数值核心：
//     mist  夜雾   —— 视野轻微收窄（配合第十一关的雾，但不那么极端）
//     ember 余烬   —— 空气中飘火星，站久会掉血，但攻速 +10%
//     drizzle 冷雨 —— 地面湿滑，移速 −8%，但中毒持续 −1 秒
//     still 死寂   —— 无风，怪物更早警觉（仇恨半径 +15%）
//     clear 清朗   —— 无天气（保底，概率最高）
//
// 设计原则（HANDOFF §7 用户铁律）：**局外因素对局内影响要小** —— 天气只是
// 一层「气氛 + 轻微数值微调」，不改变玩法骨架，任何天气都不该让玩家觉得
// 「这局废了」。
//
// ⚠️ 零 import 业务模块。天气的**实际渲染 / 判定**由 main.js 接入（粒子、
//   雾、移速乘数），本文件只给「抽签 + 数据表 + 每关效果查询」。
// ============================================================

// ---------------- 天气表 ----------------
// weight：抽签权重（clear 最高，保底「没天气」是常态）
// effect：对人 / 怪 / 环境各挂什么微调，字段语义：
//   player: { move?: 移速乘数, atk?: 攻速乘数, hpDrain?: 每秒掉血, poisonTime?: 中毒时长乘数 }
//   enemy:  { aggro?: 仇恨半径乘数 }
//   visual: 描述（渲染时用）
export const WEATHER_DEFS = {
  clear: {
    name: '清朗', weight: 40,
    effect: { player: {}, enemy: {}, visual: '无风无雨，永夜下难得的清朗' },
  },
  mist: {
    name: '夜雾', weight: 20,
    effect: { player: {}, enemy: {}, visual: '夜雾弥漫，视野微微收窄' },
  },
  ember: {
    name: '余烬', weight: 15,
    effect: { player: { atk: 1.10, hpDrain: 0.05 }, enemy: {}, visual: '火星在空气里飘，站久了灼人，但浑身发烫、出手更快' },
  },
  drizzle: {
    name: '冷雨', weight: 15,
    effect: { player: { move: 0.92, poisonTime: 0.8 }, enemy: {}, visual: '冷雨淅沥，地面湿滑，但毒也散得快' },
  },
  still: {
    name: '死寂', weight: 10,
    effect: { player: {}, enemy: { aggro: 1.15 }, visual: '一丝风也没有，怪隔着更远就察觉到你' },
  },
};
export const WEATHER_IDS = Object.keys(WEATHER_DEFS);

// ============================================================
// 系统本体
// ============================================================
export function createWeatherSystem(deps = {}) {
  const { rng = Math.random } = deps;
  let current = 'clear';

  // 每关开局 roll 一种天气（按 weight 加权）
  function roll() {
    let total = 0;
    for (const id of WEATHER_IDS) total += WEATHER_DEFS[id].weight;
    let r = rng() * total;
    for (const id of WEATHER_IDS) {
      r -= WEATHER_DEFS[id].weight;
      if (r < 0) { current = id; return id; }
    }
    current = 'clear';
    return 'clear';
  }

  function get() { return current; }
  function def() { return WEATHER_DEFS[current]; }
  function effect() { return WEATHER_DEFS[current].effect; }

  // 该天气对玩家的某项微调（无则返回 1，即不生效）
  function playerMult(field) {
    const e = effect().player || {};
    return (e[field] ?? 1);
  }

  return { roll, get, def, effect, playerMult, DEFS: WEATHER_DEFS };
}

// 纯函数：按权重抽签（导出测试用）
export function rollWeather(rng = Math.random) {
  let total = 0;
  for (const id of WEATHER_IDS) total += WEATHER_DEFS[id].weight;
  let r = rng() * total;
  for (const id of WEATHER_IDS) {
    r -= WEATHER_DEFS[id].weight;
    if (r < 0) return id;
  }
  return 'clear';
}
