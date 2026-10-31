// ============================================================
// 第十五关「钟楼直播间」的补光曝光区（第 128 块）
// ============================================================
// 直播间地上打了几盏补光灯，光圈会像潮水一样缓慢漂移。
//
// 这一关要反过来用上一关的教训：第十四关是「别站着不动」，这一关是
// **你必须主动走进光里**才赚得到钱（在光里击杀额外掉打赏金币），
// 但光里没有遮挡 —— 挨打更疼（×1.30），光里的怪也跑得更急（×1.20）。
// 于是「追光」变成一种主动的贪：想多拿钱就得一直往光里钻、往怪身上贴。
//
// 漂移 + 回合成长：开局两盏，第 6 / 11 / 16 回合各多一盏（spec.extraAt），
// 同时漂移变快。到后场三四盏一起亮，玩家没有一块能一直站的安全地。
//
// 零 import 业务模块（和 track.js / cutter.js / traffic.js 一套写法）：
// 自己建几何、自己算位置，业务侧只调 update() 和三个查询函数。
import * as THREE from '../lib/three.module.js?v=147';

export function createSpotlightSystem({ scene, arena = 19 } = {}) {
  const group = new THREE.Group();
  group.visible = false;
  scene.add(group);

  /** 当前参数（build 时被 spec 覆盖） */
  let cfg = {
    arena,
    count: 2,              // 开局几盏灯
    radius: 2.8,           // 光斑半径（世界单位）
    drift: 0.10,           // 角速度基准（弧度/秒），越往后越快
    coinKill: 3,           // 光里击杀额外掉多少打赏金币
    playerTakenMul: 1.30,  // 光里受伤的倍率（过曝）
    enemyMul: 1.20,        // 光里的怪移速倍率
    extraAt: [],           // [{ round: 6, add: 1 }, ...]
  };

  // 每盏灯一份状态：绕着场地中心缓慢公转（不往外跑，保证一直在场内）
  let spots = [];
  let built = null;
  let t = 0;
  let round = 1;
  const Y = 0.045;         // 贴地抬高，别和地面 z-fighting

  const coreMat = new THREE.MeshBasicMaterial({
    color: 0xfff3d0, transparent: true, opacity: 0.30,
    depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const glowMat = new THREE.MeshBasicMaterial({
    color: 0xffe9b0, transparent: true, opacity: 0.10,
    depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xfff6dc, transparent: true, opacity: 0.44,
    depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });

  /** 当前这一回合应该亮几盏（基础 count + 已解锁的 extraAt） */
  function activeCount() {
    let n = cfg.count;
    for (const e of cfg.extraAt || []) {
      if (round >= e.round) n += (e.add || 1);
    }
    return Math.max(1, n);
  }

  /** 这一回合的漂移速度（每盏灯多一次就快一点） */
  function driftSpeed() {
    const extra = activeCount() - cfg.count;
    return cfg.drift * (1 + 0.16 * extra);
  }

  function disposeBuilt() {
    if (!built) return;
    group.remove(built);
    built.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    built = null;
  }

  /** 按当前盏数重画（盏数变了才调；半径 / 数值变了不用重画也能生效） */
  function rebuild() {
    disposeBuilt();
    const root = new THREE.Group();
    const n = Math.max(1, (cfg.extraAt ? cfg.count + (cfg.extraAt || []).reduce((a, e) => a + (e.add || 1), 0) : cfg.count));
    // 几何按「最坏情况」一次画够，多出来的灯隐藏 —— update 里按 activeCount 开关，
    // 免得回合推进时每加一盏就重建整组几何。
    const total = Math.max(n, 1);
    spots = [];
    for (let i = 0; i < total; i++) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(cfg.radius - 0.10, cfg.radius, 64), ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = Y + 0.004;
      ring.renderOrder = 5;
      const glow = new THREE.Mesh(new THREE.CircleGeometry(cfg.radius * 1.42, 48), glowMat);
      glow.rotation.x = -Math.PI / 2;
      glow.position.y = Y + 0.002;
      glow.renderOrder = 4;
      const core = new THREE.Mesh(new THREE.CircleGeometry(cfg.radius, 48), coreMat);
      core.rotation.x = -Math.PI / 2;
      core.position.y = Y;
      core.renderOrder = 3;
      const node = new THREE.Group();
      node.add(glow, core, ring);
      root.add(node);
      spots.push({
        node,
        // 每盏灯各自的公转参数：错开相位、半径、方向
        ang: (i / total) * Math.PI * 2 + 0.7,
        orbit: Math.min(cfg.arena * 0.46, 8.6) * (0.72 + 0.18 * (i % 3)),
        dir: i % 2 === 0 ? 1 : -1,
        x: 0, z: 0,
      });
    }
    group.add(root);
    built = root;
    applyPositions();
  }

  function build(spec) {
    if (!spec) {
      group.visible = false;
      return;
    }
    cfg = { ...cfg, ...spec };
    if (spec.arena != null) cfg.arena = spec.arena;
    rebuild();
    group.visible = true;
  }

  function reset() {
    t = 0;
    round = 1;
    for (const s of spots) s.ang = (spots.indexOf(s) / Math.max(1, spots.length)) * Math.PI * 2 + 0.7;
    applyPositions();
  }

  function setRound(r) {
    round = Math.max(1, r);
  }

  function applyPositions() {
    const n = activeCount();
    for (let i = 0; i < spots.length; i++) {
      const s = spots[i];
      s.x = Math.cos(s.ang) * s.orbit;
      s.z = Math.sin(s.ang) * s.orbit;
      s.node.position.set(s.x, 0, s.z);
      s.node.visible = i < n;
    }
  }

  function update(dt) {
    if (!group.visible) return;
    t += dt;
    const w = driftSpeed();
    // 每盏灯的相位按各自方向推进（错开的相位保证它们不会叠成一团）
    for (let i = 0; i < spots.length; i++) {
      const s = spots[i];
      s.ang += w * s.dir * dt * (1 + 0.30 * (i % 3));
    }
    applyPositions();
    // 呼吸：整组一起亮暗，像补光灯在跟曝光
    const breathe = 0.5 + 0.5 * Math.sin(t * 1.6);
    coreMat.opacity = 0.22 + 0.12 * breathe;
    glowMat.opacity = 0.07 + 0.05 * breathe;
    ringMat.opacity = 0.34 + 0.14 * breathe;
  }

  /** 该点是否落在任一光斑里 */
  function inLight(x, z) {
    if (!group.visible) return false;
    const n = activeCount();
    for (let i = 0; i < n; i++) {
      const s = spots[i];
      const dx = x - s.x, dz = z - s.z;
      if (dx * dx + dz * dz <= cfg.radius * cfg.radius) return true;
    }
    return false;
  }

  /** 光里击杀的额外金币（不在光里 = 0，调用方可以直接加） */
  function coinAt(x, z) {
    return inLight(x, z) ? cfg.coinKill : 0;
  }

  /** 玩家在这个点受伤的倍率（过曝） */
  function takenMulAt(x, z) {
    return inLight(x, z) ? cfg.playerTakenMul : 1;
  }

  /** 怪在这个点的移速倍率（光里跑得更急） */
  function enemyMulAt(x, z) {
    return inLight(x, z) ? cfg.enemyMul : 1;
  }

  return {
    build, reset, setRound, update,
    inLight, coinAt, takenMulAt, enemyMulAt,
    get enabled() { return group.visible; },
    get count() { return activeCount(); },
    get spec() { return { ...cfg }; },
    /** 调试 / 测试用：当前每一盏灯的位置与参数 */
    list() {
      const out = [];
      const n = activeCount();
      for (let i = 0; i < n; i++) {
        const s = spots[i];
        out.push({ x: s.x, z: s.z, r: cfg.radius });
      }
      return out;
    },
    /** 调试 / 测试用：一份快照 */
    state() {
      return {
        enabled: group.visible,
        count: activeCount(),
        round,
        radius: cfg.radius,
        coinKill: cfg.coinKill,
        playerTakenMul: cfg.playerTakenMul,
        enemyMul: cfg.enemyMul,
        spots: this.list(),
      };
    },
  };
}
