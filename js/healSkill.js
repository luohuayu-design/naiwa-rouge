// ============================================================
// healSkill.js —— 回血技能（第 62 块，用户需求）
//
// 规则（2026-10-24 用户定案）：
//   · **第四关通关后永久解锁**（写在本机档案里，之后每局都带着）；
//   · 按下瞬间回 5 点生命，**不超上限**；
//   · 冷却 25 秒，满血时按不动（不浪费）；
//   · 走技能栏第 3 格（`skills.js` 里注册），和万剑齐发 / 箭雨同一条栏。
//
// 为什么做成独立模块：技能栏的注册表只负责「长什么样、能不能按」，
// 真正的冷却与结算放在这里，和 arrowRain.js 一个套路 —— 这样
// 存档快照（snapshot/restore）与调试钩子都能单独测。
// ============================================================

export const HEAL_AMOUNT = 5;    // 一口回多少
export const HEAL_CD = 25;       // 冷却秒数

export function createHealSkill({ stats, audio, fx, playerPos, onHeal }) {
  let unlocked = false;
  let cd = 0;
  let used = 0;                  // 本局用了几次（战绩/调试用）
  let lastHeal = 0;              // 上一口实际回了多少（给飘字用）

  // 满血（含上限被诅咒压到很低的情况）时不该允许按 —— 浪费一次 25 秒
  function hurt() {
    const max = stats.get('maxHp');
    return stats.hp.cur < max - 0.01;
  }

  function canFire() {
    return unlocked && cd <= 0 && hurt();
  }

  // 真正结算：回血 + 特效 + 音效。返回实际回复量（0 表示没回）
  function fire() {
    if (!unlocked || cd > 0) return 0;
    const max = stats.get('maxHp');
    const before = stats.hp.cur;
    if (before >= max - 0.01) return 0;      // 满血按不动，不进冷却
    stats.heal(HEAL_AMOUNT);
    lastHeal = Math.max(0, stats.hp.cur - before);
    cd = HEAL_CD;
    used++;
    const p = playerPos();
    if (fx) {
      // 三层绿色反馈：脚下一圈扩散 + 上浮的绿孢子 + 头顶「+5」飘字
      fx.ring(p, { from: 0.3, to: 1.6, color: 0x7df0b0, life: 0.45, opacity: 0.85, y: 0.06 });
      fx.burst(p, { color: 0x8ef0b8, count: 16, speed: 1.8, life: 0.6, size: 0.12, y: 0.4, up: 2.0 });
      fx.text({ x: p.x, z: p.z }, `+${lastHeal.toFixed(0)}`, { color: '#7df0b0', y: 1.9, size: 0.55 });
    }
    if (audio) audio.sfx('heal');
    if (onHeal) onHeal(lastHeal);      // main.js 用它刷新 HUD 血条
    return lastHeal;
  }

  function update(dt) {
    if (cd > 0) cd = Math.max(0, cd - dt);
  }

  // ---- 永久解锁（档案层负责调用）----
  function unlock() {
    if (unlocked) return false;
    unlocked = true;
    return true;
  }
  function setUnlocked(v) { unlocked = !!v; }

  // ---- 每局开局 / 读档 ----
  function reset() {
    cd = 0;
    used = 0;
    lastHeal = 0;
  }
  function snapshot() {
    return { cd: +cd.toFixed(2), used };
  }
  function restore(s) {
    if (!s) return;
    cd = Math.max(0, Math.min(HEAL_CD, Number(s.cd) || 0));
    used = Math.max(0, Number(s.used) || 0);
  }

  return {
    unlock, setUnlocked, fire, update, reset, snapshot, restore,
    get unlocked() { return unlocked; },
    get ready() { return canFire(); },
    get cdLeft() { return cd; },
    get cdTotal() { return HEAL_CD; },
    get progress() { return unlocked ? 1 - cd / HEAL_CD : 0; },   // 技能键竖条
    get used() { return used; },
    get amount() { return HEAL_AMOUNT; },
    // 满血但冷却好了：status 用来给按钮一个「现在按不了」的真实原因
    get status() {
      if (!unlocked) return 'locked';
      if (cd > 0) return 'cd';
      if (!hurt()) return 'full';
      return 'ok';
    },
  };
}
