// ============================================================
// wave.js —— 第一关：波次编排与刷怪位置
//
// 关卡设计（数值都在这一个文件里，改这里就能调节奏）：
//   第一关 · 荒草地：5 波，25 只小兵 + 8 只战士，合计 33 只
//   每波「生成完 + 清空」后停 2.8 秒进下一波；单波超过 15 秒也会推进，
//   避免玩家绕圈遛怪导致卡关。
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
  gap: 2.8,                // 清场后到下一波的间隔（秒）
  autoNextAfter: 15,       // 单波最长停留（秒），防止遛怪卡关
  waves: [
    {
      label: '第 1 波', tip: '小兵从草里钻出来了',
      spawns: pack('minion', 4, 1.0, 0.75),
    },
    {
      label: '第 2 波', tip: '战士会抬手，看到红圈就躲',
      spawns: [...pack('minion', 4, 0.6, 0.6), { type: 'warrior', delay: 2.4 }],
    },
    {
      label: '第 3 波', tip: '别被围住，边打边退',
      spawns: [...pack('minion', 5, 0.5, 0.55), { type: 'warrior', delay: 1.8 }, { type: 'warrior', delay: 3.0 }],
    },
    {
      label: '第 4 波', tip: '先点掉战士，小兵会自己送',
      spawns: [...pack('minion', 6, 0.4, 0.5), { type: 'warrior', delay: 2.2 }, { type: 'warrior', delay: 3.4 }],
    },
    {
      label: '第 5 波', tip: '最后一波，撑住',
      spawns: [...pack('minion', 6, 0.4, 0.5), { type: 'warrior', delay: 1.4 }, { type: 'warrior', delay: 2.6 }, { type: 'warrior', delay: 3.8 }],
    },
  ],
};

// 把「n 只同类型怪，从 start 秒开始每 gap 秒一只」写成生成列表
function pack(type, n, start, gap) {
  return Array.from({ length: n }, (_, i) => ({ type, delay: start + i * gap }));
}

export function levelStats(level = LEVEL_1) {
  let minion = 0, warrior = 0;
  for (const w of level.waves) {
    for (const s of w.spawns) {
      if (s.type === 'minion') minion++;
      else if (s.type === 'warrior') warrior++;
    }
  }
  return { minion, warrior, total: minion + warrior, waves: level.waves.length };
}

export function createLevel1({ enemies, fx, getPlayerPos, onWave, onVictory, onKill }) {
  const level = LEVEL_1;
  const recentSpawns = [];
  let waveIndex = -1;
  let phase = 'idle';     // idle | spawning | gap | done
  let t = 0;
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
    nextWave();
  }

  function nextWave() {
    waveIndex++;
    if (waveIndex >= level.waves.length) {
      phase = 'done';
      onVictory?.();
      return;
    }
    const w = level.waves[waveIndex];
    phase = 'spawning';
    t = 0;
    spawnIdx = 0;
    gapT = 0;
    onWave?.(waveIndex + 1, level.waves.length, w.label, w.tip);
  }

  function update(dt) {
    if (phase === 'spawning') {
      t += dt;
      const w = level.waves[waveIndex];

      while (spawnIdx < w.spawns.length && t >= w.spawns[spawnIdx].delay) {
        const sp = w.spawns[spawnIdx++];
        const at = pickSpawn();
        if (enemies.spawn(sp.type, at)) spawned++;
      }

      if (spawnIdx >= w.spawns.length) {
        const isLast = waveIndex === level.waves.length - 1;
        const cleared = enemies.aliveCount() === 0;
        const timeout = !isLast && t >= level.autoNextAfter;
        if (cleared || timeout) {
          phase = 'gap';
          gapT = 0;
        }
      }
    } else if (phase === 'gap') {
      gapT += dt;
      if (gapT >= level.gap) nextWave();
    }
  }

  function reset() {
    waveIndex = -1;
    phase = 'idle';
    t = 0; spawnIdx = 0; gapT = 0; spawned = 0;
    recentSpawns.length = 0;
  }

  return {
    start, update, reset,
    level,
    get waveIndex() { return waveIndex; },
    get phase() { return phase; },
    get spawned() { return spawned; },
    totals: levelStats(level),
    onKill,
  };
}
