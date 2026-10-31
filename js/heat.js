// ============================================================
// heat.js —— 连杀热度条（局内手感 · 创意 A3）
//
// 连续击杀累积「热度」，热度越高移速/攻速微增；断连（超时没击杀）热度掉落。
// 鼓励进攻节奏，和「幸存者」的逃命心态形成张力。
//
// 设计原则：零 import 业务模块，纯逻辑 + 依赖注入，Node 可测。
// 接线方把 heat 条 UI 显示出来，并把 heat 提供的 speedMul/atkMul 乘进移速/攻速。
// ============================================================

// 第 125 块（用户 2026-10-31 报的 bug / 决定）：
//   「连击打到十次以上就不在往上了」—— 原来 HEAT_MAX = 10 是**硬上限**，
//   数字和加成一齐卡在 ×10。现在改成 **连杀与增益都不封顶**：
//   数字一直往上加，移速 / 攻速也按同一斜率一直涨。
//   `HEAT_MAX` 保留但只表示「基础满格」= 前 10 连杀的增益口径，
//   绝不拿来钳制计数（钳了就是回到这个 bug）。
//   ⚠️ 唯一的风险是后期移速过大导致单帧穿过井口 / 场地边界。
//   真出现了就去**位移处夹单帧步长**，别把这里改回封顶 —— 那是把症状按回去。

// 基础满格（10 连杀 = 下面两个 MAX 值，和前 10 杀的手感一比一）
export const HEAT_MAX = 10;
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

  // 热度 → 移速倍率（线性、不封顶：10 点 = +12%，30 点 = +36%）
  function speedMul() {
    return 1 + heat * HEAT_SPEED_PER_KILL;
  }

  // 热度 → 攻速倍率（同上）
  function atkMul() {
    return 1 + heat * HEAT_ATK_PER_KILL;
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
    // 相对「基础满格」的倍数，**会大于 1**（连杀不封顶）。只给调试口与「满热」判断用，
    // 别拿它当进度条宽度（会溢出 100%）。
    get ratio() { return heat / HEAT_MAX; },
  };
}
