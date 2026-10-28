// ============================================================
// heat.js —— 连杀热度条（局内手感 · 创意 A3）
//
// 连续击杀累积「热度」，热度越高移速/攻速微增；断连（超时没击杀）热度掉落。
// 鼓励进攻节奏，和「幸存者」的逃命心态形成张力。
//
// 设计原则：零 import 业务模块，纯逻辑 + 依赖注入，Node 可测。
// 接线方把 heat 条 UI 显示出来，并把 heat 提供的 speedMul/atkMul 乘进移速/攻速。
// ============================================================

// 热度上限（满格）
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
    const nv = Math.max(0, Math.min(HEAT_MAX, v));
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

  // 热度 → 移速倍率（线性：0 热度 = 1.0，满热度 = 1 + HEAT_SPEED_MAX）
  function speedMul() {
    return 1 + (heat / HEAT_MAX) * HEAT_SPEED_MAX;
  }

  // 热度 → 攻速倍率
  function atkMul() {
    return 1 + (heat / HEAT_MAX) * HEAT_ATK_MAX;
  }

  function reset() {
    heat = 0; lastKillT = -1e9;
  }

  return {
    onKill,
    tick,
    speedMul,
    atkMul,
    reset,
    get heat() { return heat; },
    get ratio() { return heat / HEAT_MAX; },
  };
}
