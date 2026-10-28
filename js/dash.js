// ============================================================
// dash.js —— 冲刺斩位移技（局内手感 · 创意 A2）
//
// 摇杆快速「双推」（同一方向在 DASH_WINDOW 秒内推两次）触发一次短冲刺，
// 冲刺路径上的怪被击退。给玩家一个主动位移手段，破解「被围就等死」。
//
// 设计原则：零 import 业务模块，纯逻辑 + 依赖注入，Node 可测。
//
// 输入：把 input.read() 的方向向量（屏幕坐标 x 右正 / y 下正）喂给 push()。
// 输出：dash 生效时返回冲刺向量（世界方向，已归一化 × 距离），接线方据此位移 + 击退。
//
// 双推判定：
//   1. 摇杆从「无输入」→「有输入」算一次「推」。
//   2. 两次推的夹角 < DASH_ANGLE_TOL（同方向），且间隔 < DASH_WINDOW 秒 → 触发冲刺。
//   3. 冲刺中 / 冷却中不触发。
// ============================================================

// 双推窗口（秒）：两次推间隔小于它才算「快速双推」
export const DASH_WINDOW = 0.32;
// 两次推的方向夹角容差（度）
export const DASH_ANGLE_TOL = 40;
// 冲刺距离（世界单位）
export const DASH_DIST = 3.2;
// 冲刺时长（秒）
export const DASH_T = 0.16;
// 冲刺冷却（秒）
export const DASH_CD = 1.6;
// 摇杆判定为「有输入」的最小幅度（避免手指抖动误判）
export const DASH_DEADZONE = 0.55;

/**
 * 创建冲刺控制器。
 * @param {object} opts
 *   opts.now      时间源（秒），测试可注入
 *   opts.onDash(dir)  冲刺触发回调，dir = {x, z}（世界方向）
 */
export function createDash(opts = {}) {
  const now = opts.now || (() => performance.now() / 1000);
  const onDash = opts.onDash || (() => {});

  let dashLeft = 0;       // 冲刺剩余秒数
  let dashVec = { x: 0, z: 0 };   // 当前冲刺方向（世界坐标）
  let cd = 0;             // 冷却
  let active = false;     // 摇杆当前是否按住
  let lastPushT = -1e9;   // 上一次「推」的时刻
  let lastPushDir = null; // 上一次「推」的方向（屏幕坐标）

  // 屏幕坐标 → 世界坐标：y 下正翻成 z 正（屏幕 y 正向 = 世界 z 正向）
  function toWorld(sx, sy) {
    return { x: sx, z: sy };
  }

  // 两方向夹角（度）
  function angleDeg(a, b) {
    if (!a || !b) return 180;
    const dot = a.x * b.x + a.y * b.y;
    const la = Math.hypot(a.x, a.y);
    const lb = Math.hypot(b.x, b.y);
    if (la < 1e-6 || lb < 1e-6) return 180;
    const c = Math.max(-1, Math.min(1, dot / (la * lb)));
    return Math.acos(c) * 180 / Math.PI;
  }

  /**
   * 每帧喂摇杆输入（屏幕坐标，可能 {x:0,y:0}）。
   * @returns {object|null} 若本帧触发/正在冲刺，返回 {x,z} 位移增量（已乘 dt 前的速度），否则 null
   */
  function push(sx, sy) {
    const mag = Math.hypot(sx, sy);
    const pressed = mag >= DASH_DEADZONE;

    // 摇杆从「松开」→「按住」= 一次推
    if (pressed && !active) {
      const t = now();
      const cur = { x: sx / mag, y: sy / mag };
      // 是否算双推
      const gap = t - lastPushT;
      if (lastPushDir && gap <= DASH_WINDOW && angleDeg(cur, lastPushDir) <= DASH_ANGLE_TOL) {
        // 触发冲刺（冷却中不触发）
        if (cd <= 0 && dashLeft <= 0) {
          const w = toWorld(sx / mag, sy / mag);
          dashVec = { x: w.x, z: w.z };
          dashLeft = DASH_T;
          cd = DASH_CD;
          onDash(dashVec);
        }
      }
      lastPushT = t;
      lastPushDir = cur;
    }
    active = pressed;
    return null;
  }

  /**
   * 走表 + 返回本帧冲刺位移（世界坐标）。
   * @param {number} dt 秒
   * @returns {{x:number,z:number}|null} 冲刺中返回本帧位移，否则 null
   */
  function step(dt) {
    if (cd > 0) cd = Math.max(0, cd - dt);
    if (dashLeft > 0) {
      const speed = DASH_DIST / DASH_T;
      const move = { x: dashVec.x * speed * dt, z: dashVec.z * speed * dt };
      dashLeft = Math.max(0, dashLeft - dt);
      return move;
    }
    return null;
  }

  function reset() {
    dashLeft = 0; cd = 0; active = false; lastPushT = -1e9; lastPushDir = null;
  }

  return {
    push,
    step,
    reset,
    get dashing() { return dashLeft > 0; },
    get vec() { return dashVec; },
    get cd() { return cd; },
  };
}
