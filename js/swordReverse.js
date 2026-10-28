// ============================================================
// swordReverse.js —— 剑阵反向切换（局内手感 · 创意 A1）
//
// 环剑平时自动朝一个方向转。玩家按下切换键后，环剑**反向转 + 短暂加速**，
// 打乱怪的预判、解围时手感极佳。
//
// 设计原则（与 crafting.js 一致）：
//   · 零 import 业务模块 —— 不碰 weapon.js / main.js。
//   · 纯逻辑 + 依赖注入 —— 方向系数、冷却、时长全在这算，Node 可直接测。
//   · 接线只需 main.js 把本系统的「方向系数」乘进 weapon.js 的 orbitAngle 增量。
//
// 状态机：
//   idle ——→ reversed（按住/触发，持续 REVERSE_T 秒）——→ idle
// 反向期间转速 ×REVERSE_SPEED_MUL（加速感），到点自动切回正转。
// ============================================================

// 反向持续秒数
export const REVERSE_T = 1.4;
// 反向期间转速倍率（>1 = 加速）
export const REVERSE_SPEED_MUL = 1.5;
// 触发冷却（秒）：避免连按把反向当无限位移用
export const REVERSE_CD = 2.2;

// 方向枚举：1 = 正转，-1 = 反转
export const DIR = { FWD: 1, REV: -1 };

/**
 * 创建剑阵反向控制器。
 * @param {object} opts
 *   opts.rng   随机源（默认 Math.random）
 *   opts.onFlip(dir)  方向翻转回调（dir ∈ {1,-1}），接线时用来播音效/特效
 *   opts.now   时间源（默认 () => performance.now()/1000）——测试可注入
 */
export function createSwordReverse(opts = {}) {
  const rng = opts.rng || Math.random;
  const onFlip = opts.onFlip || (() => {});
  const now = opts.now || (() => performance.now() / 1000);

  let dir = DIR.FWD;          // 当前方向
  let reverseLeft = 0;        // 反向剩余秒数
  let cd = 0;                 // 触发冷却剩余
  let last = now();

  function tick(dt) {
    // 冷却走表
    if (cd > 0) cd = Math.max(0, cd - dt);
    // 反向倒计时
    if (reverseLeft > 0) {
      reverseLeft = Math.max(0, reverseLeft - dt);
      if (reverseLeft === 0 && dir === DIR.REV) {
        dir = DIR.FWD;
        onFlip(dir);
      }
    }
    return { dir, reverseLeft, cd };
  }

  /**
   * 尝试触发反向。冷却中 / 已在反向中则失败。
   * @returns {boolean} 是否成功进入反向
   */
  function flip() {
    if (cd > 0 || reverseLeft > 0) return false;
    dir = DIR.REV;
    reverseLeft = REVERSE_T;
    cd = REVERSE_CD;
    onFlip(DIR.REV);
    return true;
  }

  // 当前转速系数：反向期间 ×REVERSE_SPEED_MUL，否则 1
  function speedMul() {
    return dir === DIR.REV ? REVERSE_SPEED_MUL : 1;
  }

  return {
    tick,
    flip,
    speedMul,
    get dir() { return dir; },
    get reverseLeft() { return reverseLeft; },
    get cd() { return cd; },
  };
}
