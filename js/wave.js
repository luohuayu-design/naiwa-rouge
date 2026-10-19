// ============================================================
// wave.js —— 第一关：10 个回合的编排与刷怪位置
//
// 关卡设计（数值都在这一个文件里，改这里就能调节奏）：
//   第一关 · 荒草地：10 回合，61 只小兵 + 18 只战士，合计 79 只
//   清空一回合后停 2.6 秒进下一回合；**必须清完**才推进（不设超时跳过，
//   否则会带着上一回合的怪滚雪球，也没法在回合结束时弹升级）
//
// 回合成长（用户要求「怪物不止数目变多，属性也适当提高」）：
//   数量：3 → 13 只/回合（见 rounds）
//   生命：每回合 +16%（第 10 回合 ×2.44，战士 3 → 7 血）
//   伤害：每回合 +10%（第 10 回合 ×1.90，1 → 2 点）
//   速度：每回合 +3.5%（第 10 回合 ×1.32，小兵 2.15 → 2.84，主角 4.4 仍能拉开）
//   小兵基础 1 血，四舍五入后第 5 回合起变 2 血（R1~R4 仍是一刀一只）；
//   战士 3 血，第 5 回合 5 血、第 10 回合 7 血。
//
// 升级：第 1/3/5/8/10 回合清空后弹三选一（见 upgrade.js）。
//
// 刷怪位置规则（用户要求的「生成位置」）：
//   1. 只从场地边缘的圆环上出现（半径 13.2 ± 0.5），不会凭空出现在脚下
//   2. 与主角的距离必须 ≥ 7，主角贴边时近侧不刷，改从对面来
//   3. 相邻两次刷怪至少隔 2 个单位，避免一坨怪叠在一起出生
// ============================================================

export const LEVEL_1 = {
  id: 1,
  name: '第一关 · 荒草地',
  spawnRadius: 13.2,       // 刷怪圆环半径
  spawnJitter: 0.5,        // 半径随机浮动
  minPlayerDistance: 7.0,  // 离主角至少这么远
  minSpawnGap: 2.0,        // 两次刷怪的最小间距
  gap: 2.6,                // 清场后到下一回合的间隔（秒）
  upgradeAfter: [1, 3, 5, 8, 10],   // 打完这些回合弹三选一
  // 属性随回合成长：1 + k × (回合 - 1)
  scale: { hp: 0.16, damage: 0.10, speed: 0.035 },
  rounds: [
    { minion: 3, warrior: 0, gap: 0.90, tip: '小兵从草里钻出来了' },
    { minion: 4, warrior: 0, gap: 0.80, tip: '数量多起来了，边走边拍' },
    { minion: 5, warrior: 1, gap: 0.80, tip: '战士会抬手，看到红圈就躲' },
    { minion: 5, warrior: 1, gap: 0.75, tip: '它们变硬了一点，别硬顶' },
    { minion: 6, warrior: 2, gap: 0.70, tip: '两个战士，先点掉它们' },
    { minion: 6, warrior: 2, gap: 0.65, tip: '小兵开始要两下了，稳住节奏' },
    { minion: 7, warrior: 2, gap: 0.60, tip: '别贪刀，血留着' },
    { minion: 8, warrior: 3, gap: 0.55, tip: '这一波很凶，绕圈拉扯' },
    { minion: 8, warrior: 3, gap: 0.50, tip: '撑住，马上就到最后了' },
    { minion: 9, warrior: 4, gap: 0.50, tip: '最后一回合，全部拍碎' },
  ],
};

// 第 roundNo 回合（从 1 开始）的怪物属性倍率
export function roundScale(roundNo) {
  const s = LEVEL_1.scale;
  const k = Math.max(0, roundNo - 1);
  return {
    hp: 1 + s.hp * k,
    damage: 1 + s.damage * k,
    speed: 1 + s.speed * k,
  };
}

export function levelStats(level = LEVEL_1) {
  let minion = 0, warrior = 0;
  for (const r of level.rounds) {
    minion += r.minion || 0;
    warrior += r.warrior || 0;
  }
  return { minion, warrior, total: minion + warrior, rounds: level.rounds.length };
}

// 把「n 只小兵 + m 只战士」展开成带延迟的生成列表：
// 小兵先到，战士晚半拍出场（给玩家先清小兵的窗口）
function buildSpawns(roundNo) {
  const cfg = LEVEL_1.rounds[roundNo - 1];
  const out = [];
  let t = 0.75;
  for (let i = 0; i < cfg.minion; i++) {
    out.push({ type: 'minion', delay: t });
    t += cfg.gap;
  }
  t += 0.35;
  for (let i = 0; i < cfg.warrior; i++) {
    out.push({ type: 'warrior', delay: t });
    t += cfg.gap * 1.6;
  }
  return out;
}

export function createLevel1({ enemies, fx, getPlayerPos, onRound, onRoundClear, onVictory, onKill }) {
  const level = LEVEL_1;
  const recentSpawns = [];
  let roundIndex = -1;      // 0 基：0 = 第 1 回合
  let phase = 'idle';       // idle | spawning | gap | done
  let t = 0;
  let spawns = [];
  let spawnIdx = 0;
  let gapT = 0;
  let spawned = 0;

  function pickSpawn() {
    const p = getPlayerPos();
    const R = level.spawnRadius;

    for (let i = 0; i < 30; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = R + (Math.random() - 0.5) * level.spawnJitter * 2;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;

      // 规则 2：不能刷在主角脸上
      if (Math.hypot(x - p.x, z - p.z) < level.minPlayerDistance) continue;

      // 规则 3：不能和最近的出生点重叠
      let ok = true;
      for (const q of recentSpawns) {
        if (Math.hypot(x - q.x, z - q.z) < level.minSpawnGap) { ok = false; break; }
      }
      if (!ok) continue;

      return remember({ x, z });
    }

    // 兜底：从主角的正对面来
    const a = Math.atan2(p.z, p.x) + Math.PI;
    const r = R - 0.4;
    return remember({ x: Math.cos(a) * r, z: Math.sin(a) * r });
  }

  function remember(at) {
    recentSpawns.push(at);
    if (recentSpawns.length > 6) recentSpawns.shift();
    return at;
  }

  function start() {
    reset();
    nextRound();
  }

  function nextRound() {
    roundIndex++;
    if (roundIndex >= level.rounds.length) {
      phase = 'done';
      onVictory?.();
      return;
    }
    const roundNo = roundIndex + 1;
    const cfg = level.rounds[roundIndex];
    phase = 'spawning';
    t = 0;
    spawnIdx = 0;
    gapT = 0;
    spawns = buildSpawns(roundNo);
    onRound?.(roundNo, level.rounds.length, cfg.tip);
  }

  function update(dt) {
    if (phase === 'spawning') {
      t += dt;
      while (spawnIdx < spawns.length && t >= spawns[spawnIdx].delay) {
        const sp = spawns[spawnIdx++];
        const at = pickSpawn();
        const sc = roundScale(roundIndex + 1);
        const e = enemies.spawn(sp.type, at, {
          hpScale: sc.hp, damageScale: sc.damage, speedScale: sc.speed,
        });
        if (e) spawned++;
      }

      // 必须全部清掉才算这回合结束（含刚钻出来、还没死的）
      if (spawnIdx >= spawns.length && enemies.aliveCount() === 0) {
        phase = 'gap';
        gapT = 0;
        onRoundClear?.(roundIndex + 1, level.rounds.length);
      }
    } else if (phase === 'gap') {
      gapT += dt;
      if (gapT >= level.gap) nextRound();
    }
  }

  function reset() {
    roundIndex = -1;
    phase = 'idle';
    t = 0; spawnIdx = 0; gapT = 0; spawned = 0;
    spawns = [];
    recentSpawns.length = 0;
  }

  return {
    start, update, reset,
    level,
    // waveIndex 是 0 基的历史名字，按「第几回合」用时读 roundNo
    get waveIndex() { return roundIndex; },
    get roundIndex() { return roundIndex; },
    get roundNo() { return roundIndex + 1; },
    get phase() { return phase; },
    get spawned() { return spawned; },
    totals: levelStats(level),
    shouldUpgrade(roundNo) { return level.upgradeAfter.includes(roundNo); },
    onKill,
  };
}
