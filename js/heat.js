// ============================================================
// heat.js —— 连杀热度条（局内手感 · 创意 A3）
//
// 连续击杀累积「热度」，热度越高移速/攻速微增；断连（超时没击杀）热度掉落。
// 鼓励进攻节奏，和「幸存者」的逃命心态形成张力。
//
// 设计原则：零 import 业务模块，纯逻辑 + 依赖注入，Node 可测。
// 接线方把 heat 条 UI 显示出来，并把 heat 提供的 speedMul/atkMul 乘进移速/攻速。
// ============================================================

// 连杀的「数字」与「加成」是两件事，各有各的上限（用户 2026-10-31 二次定案）：
//   第 125 块：「连击打到十次以上就不在往上了」→ 当时把计数和加成一齐放开。
//   第 127 块：「要求连击数量显示无上限，但是属性加成有上限」→ 拆开：
//     · 计数（连杀 ×N）**永不封顶**，一路往上数；
//     · 移速 / 攻速加成封顶在 HEAT_BONUS_CAP（默认 10 连杀 = +12% / +18%）。
//   所以 setHeat 不钳制，只有 speedMul / atkMul 读的时候钳。
//   ⚠️ 反过来写（在 setHeat 里 Math.min）就是退回第 125 块的那个 bug：数字停住、玩家以为坏了。
//   ⚠️ 上限值是 HEAT_BONUS_CAP 一个常量，想调手感只改这一处。

// 基础满格（10 连杀 = 下面两个 MAX 值，和前 10 杀的手感一比一）
export const HEAT_MAX = 10;
// 加成封顶：连杀涨到这么多次之后，移速 / 攻速不再变强（数字照样涨）
export const HEAT_BONUS_CAP = HEAT_MAX;
// 每次击杀 +1 热度
export const HEAT_PER_KILL = 1;
// 断连阈值（秒）：超过这个时长没击杀，热度开始掉
export const HEAT_DECAY_AFTER = 3.0;
// 断连后每 HEAT_DECAY_TICK 秒掉 1 点
export const HEAT_DECAY_TICK = 1.2;
// 满热度时移速加成（比例，0.12 = +12%）
export const HEAT_SPEED_MAX = 0.12;
// 满热度时攻速加成（比例）
export const HEAT_ATK_MAX = 0.18;
// 每一点热度的增益（不封顶：heat 多少就乘多少）
export const HEAT_SPEED_PER_KILL = HEAT_SPEED_MAX / HEAT_MAX;   // 0.012
export const HEAT_ATK_PER_KILL = HEAT_ATK_MAX / HEAT_MAX;       // 0.018

/**
 * 创建热度条。
 * @param {object} opts
 *   opts.now      时间源（秒），测试可注入
 *   opts.onChange(heat)  热度变化回调（UI 刷新）
 */
export function createHeat(opts = {}) {
  const now = opts.now || (() => performance.now() / 1000);
  const onChange = opts.onChange || (() => {});

  let heat = 0;
  let lastKillT = -1e9;   // 上一次击杀时刻（用于断连判定）

  function setHeat(v) {
    // 只兜底（不封顶）：连杀可以一直往上加，只有断连才会往下掉
    const nv = Math.max(0, v);
    if (nv !== heat) { heat = nv; onChange(heat); }
  }

  // 击杀一次：热度 +1，刷新断连计时
  function onKill() {
    lastKillT = now();
    setHeat(heat + HEAT_PER_KILL);
    return heat;
  }

  // 走表：超时没击杀 → 掉热度
  function tick(dt) {
    const idle = now() - lastKillT;
    if (idle > HEAT_DECAY_AFTER && heat > 0) {
      // 超过阈值后按 tick 间隔掉点（用累积时间简化：每 tick 掉 1）
      const over = idle - HEAT_DECAY_AFTER;
      const drop = Math.floor(over / HEAT_DECAY_TICK);
      if (drop > 0) {
        setHeat(heat - drop);
        // 掉点后重置计时基准（避免每帧重复扣）
        lastKillT = now() - (HEAT_DECAY_AFTER + (over % HEAT_DECAY_TICK));
      }
    }
    return heat;
  }

  // 热度 → 移速倍率（封顶：10 点 = +12%，之后不再涨 —— 数字照涨，加成不动）
  function speedMul() {
    return 1 + Math.min(heat, HEAT_BONUS_CAP) * HEAT_SPEED_PER_KILL;
  }

  // 热度 → 攻速倍率（同上，共用同一个封顶）
  function atkMul() {
    return 1 + Math.min(heat, HEAT_BONUS_CAP) * HEAT_ATK_PER_KILL;
  }

  function reset() {
    const had = heat > 0;
    heat = 0; lastKillT = -1e9;
    if (had) onChange(0);   // 第 117 块：断连归零时通知 UI 收起提示
  }

  return {
    onKill,
    tick,
    speedMul,
    atkMul,
    reset,
    get heat() { return heat; },
    // 相对「基础满格」的倍数。**已经钳在 1**：连杀数字不封顶，但加成到满格就停，
    // 进度条 / 满热判断都读它，不用自己再 clip。
    get ratio() { return Math.min(1, heat / HEAT_MAX); },
    // 加成是否已经顶到上限（UI 用来给「满」的提示，别让玩家以为数字还在涨就应该更强）
    get bonusCapped() { return heat >= HEAT_BONUS_CAP; },
  };
}
