// ============================================================
// broadcast.js —— 技能「开播」（第 128 块）
//
// 第十五关 · 钟楼直播间：你在直播，观众在看。
// 按下之后 6 秒内整个人「进状态」：攻速 +20%、移速 +15%，
// 而且每一次击杀都额外拿 1 枚打赏金币 —— 但直播不设防，受伤 +10%。
//
// 它不挂在任何法器上：通关第十四关后永久可用（档案里的通关记录）。
// 和法器一样，临时属性 mod 全部带 src，到期 / reset 必须撤干净。
// ============================================================
export const BROADCAST_BASE = {
  duration: 6.0,
  cd: 45.0,
  cdMin: 24.0,
  haste: 0.20,
  move: 0.15,
  coin: 1,
  dmgTaken: 0.10,
};

export function createBroadcastSystem({ stats, fx, onStart, onEnd }) {
  const src = 'broadcast';
  let cd = 0;
  let cdMul = 1;
  let on = false;            // 是否在直播中（别用 t>0 判断：update 里 t 会先减到 <=0 再调 stop）
  let t = 0;                 // 剩余直播秒数
  let serial = 0;

  const cdMaxV = () => Math.max(BROADCAST_BASE.cdMin, BROADCAST_BASE.cd * cdMul);
  const activeNow = () => on;

  function stop() {
    if (!on) return;
    on = false;
    t = 0;
    stats.removeBySource(src);
    if (onEnd) onEnd();
  }

  function cast(playerPos) {
    if (cd > 0) return false;
    if (on) return false;
    cd = cdMaxV();
    on = true;
    t = BROADCAST_BASE.duration;
    serial += 1;
    stats.addMod({ stat: 'attackSpeed', pct: BROADCAST_BASE.haste, src });
    stats.addMod({ stat: 'moveSpeed', pct: BROADCAST_BASE.move, src });
    if (fx) fx.ring(playerPos || { x: 0, z: 0 }, { from: 0.5, to: 2.2, color: 0xff9ad6, life: 0.36, opacity: 0.7, y: 0.08 });
    if (onStart) onStart(serial);
    return true;
  }

  function update(dt) {
    if (cd > 0) cd = Math.max(0, cd - dt);
    if (!on) return;
    t -= dt;
    if (t <= 0) stop();
  }

  function clearField() {
    stop();
    cd = 0;
  }

  return {
    cast, update, reset: clearField, clearField,
    get owned() { return true; },           // 「有没有」由 main 用通关记录决定
    get active() { return activeNow(); },
    get ready() { return !activeNow() && cd <= 0; },
    get cdLeft() { return cd; },
    get cdMax() { return cdMaxV(); },
    get progress() { return 1 - cd / cdMaxV(); },
    get remain() { return Math.max(0, t); },
    // 开播期间：击杀额外打赏 / 受伤倍率
    coinBonus: () => (activeNow() ? BROADCAST_BASE.coin : 0),
    takenMul: () => (activeNow() ? 1 + BROADCAST_BASE.dmgTaken : 1),
    bonuses: () => ({
      duration: BROADCAST_BASE.duration,
      haste: BROADCAST_BASE.haste,
      move: BROADCAST_BASE.move,
      coin: BROADCAST_BASE.coin,
      dmgTaken: BROADCAST_BASE.dmgTaken,
      cdMax: +cdMaxV().toFixed(2),
    }),
    snapshot: () => ({ cd: +cd.toFixed(2) }),
    restore(saved) {
      clearField();
      if (!saved) return;
      cd = Math.max(0, Number(saved.cd) || 0);
    },
    setCdMul(m) {
      cdMul = Math.max(0.1, Number(m) || 1);
      if (cd > 0) cd = Math.min(cd, cdMaxV());
    },
    debugForce: () => cast(),
  };
}
