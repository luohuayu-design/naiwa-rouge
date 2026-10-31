// ============================================================
// 第十四关「钟楼打样间」的裁切刀（第 124 块）
// ============================================================
// 打样间的机器一直在裁纸：整场横着（或竖着）被一刀切开。
//   预警 1.25 秒 —— 地上一条白线，越缩越亮，玩家看到就知道哪一段要没了；
//   刀落 0.22 秒 —— 判定只在这一瞬，站在带上的**人和怪一起吃这一刀**；
//   然后收刀，隔 5.2 秒再来一刀（越到后面越快）。
//
// 为什么是「切位轮换 + 横竖交替」而不是固定一条线：
// 固定线的解太简单（站到线外就完事），轮换之后它就是**逼你换位置**的节拍器 ——
// 但只要你看得懂预警，它就永远躲得掉，不变成随机掉血。
//
// 和前面三关场地的分工：
//   第十一关 fog.js —— 看不见；第十二关 traffic.js —— 车流横穿、可以把怪送进去；
//   第十三关 track.js —— 让你和怪一起变快的跑道；
//   这一关是**周期性的整场切分**：不追你、不推你，只是按时把场地切一次。
//
// 和玩家的「裁纸刀」法器（guillotine.js）是两回事：那是你手里的近身一刀，
// 这是机器的节拍。名字刻意区分（裁切刀 / 裁纸刀），别混成同一套。
//
// 零 import 之外的依赖只有一个 three，业务侧只注入（和 traffic.js / track.js 同款）。
import * as THREE from '../lib/three.module.js?v=144';

export const CUTTER_DEFAULTS = {
  arena: 19,           // 场地半径（刀横跨整个场地用）
  warn: 1.25,          // 预警时长（秒）
  slice: 0.22,         // 刀落下的判定窗口（秒）
  recover: 0.55,       // 收刀（视觉淡出）
  gap: 5.2,            // 两刀之间的间隔（从收刀完开始算）
  gapMin: 3.1,         // 后期最快间隔
  width: 1.30,         // 刀带宽度（格）—— 判定和画面共用这一个常量
  playerPct: 0.12,     // 玩家吃最大生命的 12%
  enemyPct: 0.22,      // 怪吃最大生命的 22%（有固定保底，见 dmgOf）
  enemyBase: 8,        // 对怪的固定保底伤害（再随回合成长）
  slots: [-7.0, -2.3, 2.3, 7.0],   // 切位（横切看 z、竖切看 x）
  doubleFrom: 15,      // 从第 15 回合起，偶尔一次落两刀
  warnColor: 0xfff2c0,
  bladeColor: 0xffffff,
  edgeColor: 0xbfc6cc,
};

// 判定：一条无限长的带子（axis 0 = 横切，沿 X 延伸、按 z 判；1 = 竖切，按 x 判）
// 单独导出给测试用 —— 画面和判定必须同源（「画在这、打在那」的老坑）。
export function cutterBandHit(x, z, axis, slot, width, radius = 0) {
  const across = axis === 0 ? z : x;
  return Math.abs(across - slot) <= width * 0.5 + radius * 0.55;
}

export function createCutterSystem({
  scene, fx, enemies, hurtPlayer,
  onPlayerHit, onEnemyHit, onSlice,
} = {}) {
  const group = new THREE.Group();
  group.visible = false;
  scene.add(group);

  let cfg = { ...CUTTER_DEFAULTS };
  let phase = 'idle';     // idle / warn / slice / recover
  let phaseT = 0;
  let nextIn = 0;
  let cursor = 0;         // slots 游标
  let axis = 0;           // 0 = 横切，1 = 竖切（每刀交替）
  let serial = 0;
  let shakeT = 0;

  // 同时最多两刀（doubleFrom 之后偶尔双刀），预先做两组，不运行时新建几何
  const MAX_BLADES = 2;
  const slots_ = [];
  for (let i = 0; i < MAX_BLADES; i++) slots_.push(makeBladeSlot());

  const Y = 0.035;   // 贴地抬高：和 traffic / track 同量级，避免 z-fighting

  function makeBladeSlot() {
    const root = new THREE.Group();
    root.visible = false;

    // 预警带：一条半透明的宽条，随时间收窄、变亮
    const warn = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        color: CUTTER_DEFAULTS.warnColor, transparent: true, opacity: 0.0,
        depthWrite: false, side: THREE.DoubleSide,
      })
    );
    warn.renderOrder = 3;
    // 预警带正中的那条实线：这条线就是「刀会落在哪」的唯一真相
    const line = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0.0,
        depthWrite: false, side: THREE.DoubleSide,
      })
    );
    line.renderOrder = 4;
    // 刀光：落刀那一瞬的亮条（比预警窄，一闪就没）
    const blade = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        color: CUTTER_DEFAULTS.bladeColor, transparent: true, opacity: 0.0,
        depthWrite: false, side: THREE.DoubleSide,
      })
    );
    blade.renderOrder = 6;

    // 两端的夹具：告诉玩家「这条线是有端点的，端点在场地边缘」
    const clampMat = new THREE.MeshBasicMaterial({ color: CUTTER_DEFAULTS.edgeColor });
    const clampA = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.30, 0.34), clampMat);
    const clampB = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.30, 0.34), clampMat);
    clampA.castShadow = false;
    clampB.castShadow = false;

    root.add(warn, line, blade, clampA, clampB);
    group.add(root);
    return {
      root, warn, line, blade, clampA, clampB,
      axis: 0, slot: 0, hitEnemies: new Set(), hitPlayer: false, id: 0,
    };
  }

  // 把一条带子摆到它自己记住的 (axis, slot)。
  // ⚠️ 只读 s.axis / s.slot，**不读全局** —— 双刀时两条带子的方向/位置各不相同，
  // 预警阶段每帧重摆时若去读全局，两条会叠成同一条（第 124 块自己抓到的坑）。
  function place(s, w) {
    const along = cfg.arena * 2;
    const ax = s.axis;
    const sl = s.slot;
    // 三个 mesh 都是 1×1 平面：横切长边给 x，竖切长边给 z
    for (const m of [s.warn, s.line]) {
      m.scale.set(ax === 0 ? along : w, 1, ax === 0 ? w : along);
      m.position.set(ax === 0 ? 0 : sl, Y, ax === 0 ? sl : 0);
      m.rotation.y = 0;
    }
    const bw = Math.max(0.16, w * 0.42);
    s.blade.scale.set(ax === 0 ? along : bw, 1, ax === 0 ? bw : along);
    s.blade.position.set(ax === 0 ? 0 : sl, Y + 0.004, ax === 0 ? sl : 0);
    // 端头夹具
    const half = cfg.arena - 0.5;
    s.clampA.position.set(ax === 0 ? -half : sl, 0.16, ax === 0 ? sl : -half);
    s.clampB.position.set(ax === 0 ? half : sl, 0.16, ax === 0 ? sl : half);
  }

  function setEnabled(on) {
    group.visible = !!on;
    if (!on) hideAll();
  }

  function configure(next = {}) {
    cfg = { ...cfg, ...next };
    // 换参数时把场地尺寸同步到夹具位置（下一刀生效）
    for (const s of slots_) s.root.visible = false;
  }

  /**
   * 换关入口（和 traffic.build / track.build / fog.build 同一套写法）：
   * 传 null = 这一关没有裁切刀。
   */
  function build(spec) {
    if (!spec) {
      group.visible = false;
      hideAll();
      reset();
      return;
    }
    configure(spec);
    group.visible = true;
    reset();
  }

  function hideAll() {
    for (const s of slots_) s.root.visible = false;
  }

  function reset() {
    phase = 'idle';
    phaseT = 0;
    nextIn = cfg.gap * 0.55;   // 进关先缓半拍，别一落地就切
    cursor = 0;
    axis = 0;
    serial = 0;
    shakeT = 0;
    hideAll();
  }

  function nextSlot() {
    const list = cfg.slots && cfg.slots.length ? cfg.slots : [0];
    const v = list[cursor % list.length];
    cursor++;
    // 每次换切位顺手把横/竖也换一下：四条切位 + 两个方向，八种组合轮着来
    if (cursor % 2 === 0) axis = 1 - axis;
    return v;
  }

  function startSlice(roundNo) {
    const count = roundNo >= cfg.doubleFrom && cursor % 3 === 0 ? 2 : 1;
    for (let i = 0; i < MAX_BLADES; i++) {
      const s = slots_[i];
      s.root.visible = i < count;
      if (i >= count) continue;
      s.slot = nextSlot();
      s.axis = axis;
      place(s, cfg.width);
      s.hitEnemies.clear();
      s.hitPlayer = false;
      s.warn.material.opacity = 0.10;
      s.line.material.opacity = 0.55;
      if (fx) {
        // 端头打一道火星：告诉玩家「夹具通电了」
        for (const c of [s.clampA, s.clampB]) {
          fx.burst({ x: c.position.x, z: c.position.z }, {
            color: 0xffd98a, count: 5, speed: 1.4, life: 0.28, size: 0.08, y: 0.25, up: 1.0,
          });
        }
      }
    }
    if (onSlice) onSlice({ count, axis, serial });
  }

  function resolveHits(playerPos, playerRadius, playerMaxHp, roundNo) {
    for (const s of slots_) {
      if (!s.root.visible) continue;
      const w = cfg.width;
      // ---- 怪 ----
      if (enemies) {
        for (const e of enemies.list) {
          if (!enemies.hittable(e) || s.hitEnemies.has(e.id)) continue;
          const r = (e.cfg && e.cfg.radius) || 0.4;
          if (!cutterBandHit(e.pos.x, e.pos.z, s.axis, s.slot, w, r)) continue;
          s.hitEnemies.add(e.id);
          const eliteMul = e.cfg && e.cfg.elite ? 0.55 : 1;
          const raw = Math.max(cfg.enemyBase + roundNo * 1.4, (e.maxHp || 1) * cfg.enemyPct) * eliteMul;
          const killed = enemies.takeDamage(e, raw, false, { cls: 'hazard' });
          if (enemies.knockback) enemies.knockback(e, e.pos.x, e.pos.z, 0.6);
          if (fx) {
            fx.text({ x: e.pos.x, z: e.pos.z }, '裁', {
              color: '#fff3cf', y: e.height * 0.9, size: 0.5,
            });
            fx.burst({ x: e.pos.x, z: e.pos.z }, {
              color: 0xf2ead6, count: 8, speed: 2.2, life: 0.4, size: 0.1, y: 0.5, up: 1.2,
            });
          }
          if (onEnemyHit) onEnemyHit(e, killed);
        }
      }
      // ---- 玩家 ----
      if (!s.hitPlayer && playerPos && hurtPlayer) {
        if (cutterBandHit(playerPos.x, playerPos.z, s.axis, s.slot, w, playerRadius || 0.32)) {
          s.hitPlayer = true;
          // 12% 最大生命：不吃防御（走 damageTrue 由 main 的 hurtPlayer 决定），
          // 但**用 'cut' 而不是 'hazard'** —— 否则「绝缘体」法器会顺带免疫掉整关机制。
          const raw = Math.max(1, (playerMaxHp || 20) * cfg.playerPct);
          hurtPlayer(raw, 'cut');
          shakeT = 0.35;
          if (onPlayerHit) onPlayerHit(raw);
        }
      }
    }
  }

  function update(dt, { playerPos, playerRadius = 0.32, playerMaxHp = 20, roundNo = 1 } = {}) {
    if (!group.visible) return;
    if (phase === 'idle') {
      nextIn -= dt;
      if (nextIn <= 0) {
        phase = 'warn';
        phaseT = 0;
        startSlice(roundNo);
      }
      return;
    }
    phaseT += dt;
    if (phase === 'warn') {
      const k = Math.min(1, phaseT / Math.max(0.01, cfg.warn));
      // 越接近落刀：带子越窄、越亮 —— 收窄的终点正好是 width
      for (const s of slots_) {
        if (!s.root.visible) continue;
        const w = cfg.width * (2.6 - 1.6 * k);
        place(s, w);
        s.warn.material.opacity = 0.08 + 0.22 * k;
        s.line.material.opacity = 0.35 + 0.6 * k;
      }
      if (phaseT >= cfg.warn) {
        phase = 'slice';
        phaseT = 0;
        // 落刀：先按最终宽度重摆一次（预警期间是宽的，判定用 cfg.width）
        for (const s of slots_) if (s.root.visible) place(s, cfg.width);
        resolveHits(playerPos, playerRadius, playerMaxHp, roundNo);
        for (const s of slots_) {
          if (!s.root.visible) continue;
          s.blade.material.opacity = 0.95;
          s.line.material.opacity = 0.0;
          s.warn.material.opacity = 0.0;
        }
        if (fx) {
          const s0 = slots_[0];
          fx.ring({ x: s0.axis === 0 ? 0 : s0.slot, z: s0.axis === 0 ? s0.slot : 0 }, {
            from: 0.6, to: cfg.width * 3.2, color: 0xffffff, life: 0.3, opacity: 0.5, y: 0.08,
          });
        }
      }
      return;
    }
    if (phase === 'slice') {
      const k = Math.min(1, phaseT / Math.max(0.01, cfg.slice));
      for (const s of slots_) {
        if (!s.root.visible) continue;
        s.blade.material.opacity = 0.95 * (1 - k);
      }
      if (phaseT >= cfg.slice) {
        phase = 'recover';
        phaseT = 0;
      }
      return;
    }
    if (phase === 'recover') {
      if (phaseT >= cfg.recover) {
        phase = 'idle';
        phaseT = 0;
        hideAll();
        // 越到后面越快：第 20 回合大约 3.9 秒一刀
        const accel = Math.min(1, (roundNo - 1) / 19);
        nextIn = Math.max(cfg.gapMin, cfg.gap - (cfg.gap - cfg.gapMin) * accel);
      }
    }
    if (shakeT > 0) shakeT = Math.max(0, shakeT - dt);
  }

  /** 立刻进入预警（调试 / 测试用：不想等那半拍） */
  function trigger(roundNo = 1) {
    if (!group.visible) return false;
    if (phase !== 'idle') return false;
    nextIn = 0;
    return true;
  }

  function state() {
    return {
      phase, t: +phaseT.toFixed(3), nextIn: +Math.max(0, nextIn).toFixed(3),
      axis, active: slots_.filter((s) => s.root.visible).map((s) => ({ axis: s.axis, slot: s.slot })),
      count: slots_.filter((s) => s.root.visible).length,
      width: cfg.width,
    };
  }

  return {
    build, setEnabled, configure, reset, update, trigger, state,
    get enabled() { return group.visible; },
    get spec() { return { ...cfg }; },
    get shake() { return shakeT; },
  };
}
