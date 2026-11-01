// ============================================================
// blank.js —— 第十八关「天亮之前」的场地与 BOSS 招式引擎（第 139 块）
//
// 两套东西装在一个文件里（模块数只 +1，见设计稿 §9）：
//
//   ① createBlankSystem —— 名字牌 + 空白八招 + BOSS 轮转 / 阶段 / 护卫
//      前 19 回合，每种残影死后掉一枚金色名字牌。牌落地 5 秒后飘走，
//      飘走前走到 1.2 格内就能「抢回」—— 抢回的每一个名字都会在第 20 回合
//      把空白的对应招封印掉。名字板 8 格 = BLANK_MOVES 的顺序。
//
//   ② createHammerSystem —— 第 20 件法器「镇纸锤」
//      被动每隔几秒在身前砸一下（破甲 + 对空白族加伤），
//      技能「砸地」(G) 是半径 4 格的一记定身重砸。
//
// 本文件**不 import 任何业务模块**（只有 three）：
//   · 怪的位置 / 受伤 / 冰冻 / 击退一律走创建时注入的 enemies 接口；
//   · 掉牌由 main.js 的 onDeath 调 dropPlate；
//   · 抢回、剥夺预告这类「要弹 UI 的事」一律 push 进事件表，让 main 取。
// 这样它和 bell.js / sketch.js / crate.js 是同一套写法，测试也能脱离主循环跑。
// ============================================================
import * as THREE from '../lib/three.module.js?v=158';

// ------------------------------------------------------------
// 八招（顺序 = 名字板从左到右的八格）
// ------------------------------------------------------------
export const BLANK_MOVES = [
  { key: 'scatter', name: '散名', short: '散', text: '向四周撒出一圈字牌' },
  { key: 'homing', name: '盯上你', short: '盯', text: '墨点追着你不放' },
  { key: 'arm', name: '写错一笔', short: '错', text: '笔迹臂扫过场地' },
  { key: 'steal', name: '收走一样', short: '收', text: '按顺序收走你的东西' },
  { key: 'copy', name: '照着我造', short: '照', text: '撕出一只小空白' },
  { key: 'spot', name: '这里没有东西', short: '空', text: '白斑抹掉脚下的一切' },
  { key: 'wall', name: '合上这一页', short: '合', text: '纸墙把场地切成两半' },
  { key: 'stroke', name: '最后一笔', short: '终', text: '身前扫过一道笔痕' },
];

// 「收走一样」的固定轮转顺序（可预判的意义就在这里：屏幕会提前写下一项）
export const BLANK_STEAL_ORDER = ['ground', 'skill', 'weapon', 'buff', 'combo', 'hp'];
const STEAL_TEXT = {
  ground: '地上的东西',
  skill: '技能栏',
  weapon: '环上的一把剑',
  buff: '脚下的增益',
  combo: '连杀',
  hp: '当前生命',
};

// 数值全部集中在这里：调平衡只改这张表
export const BLANK_BASE = {
  plateLife: 5.0,        // 名字牌落地后多久开始飘走
  plateFade: 1.1,        // 飘走的那一段淡出
  pickRadius: 1.2,       // 抢回的半径
  coinPerName: 30,       // 抢回一个名字给多少金币
  totalNames: 8,         // 名字板总格数
  bossInterval: [3.5, 3.0, 2.5],   // 三阶的技能间隔
  guardRespawn: 8.0,     // 护卫死后多久补一只
  // 八招：boss = 本体威力 / avatar = 分身（约一半）
  scatter: { boss: { count: 8, range: 6.0, speed: 2.0 }, avatar: { count: 4, range: 4.5, speed: 2.0 }, pct: [0.06, 0.03] },
  homing: { boss: { count: 2, speed: 1.4, reaim: 1.6, life: 6.0 }, avatar: { count: 1, speed: 1.4, reaim: 3.0, life: 3.0 }, pct: [0.06, 0.03] },
  arm: { boss: { count: 3, dur: 2.2 }, avatar: { count: 2, dur: 1.2 }, pct: [0.10, 0.05] },
  steal: { windup: 2.4, pct: 0.15 },
  copy: { windup: 1.8 },
  spot: { boss: { count: 2, radius: 2.0, life: 5.0, pctPerSec: 0.04 }, avatar: { count: 1, radius: 2.0, life: 2.5, pctPerSec: 0.02 } },
  wall: { boss: { life: 3.5 }, avatar: { life: 2.0 }, halfWidth: 0.30 },
  stroke: { boss: { windup: 1.2, halfAngle: Math.PI / 2, range: 6.0, pct: 0.15, pin: 1.0 }, avatar: { windup: 1.0, halfAngle: Math.PI / 4, range: 4.5, pct: 0.075, pin: 0.6 } },
  // 通用五式
  g1: { range: 1.8, windup: 0.5, pct: 0.06 },
  g2: { count: 5, speed: 2.0, range: 6.0, pct: 0.05 },
  g3: { dash: 4.0, dur: 0.36, pct: 0.07, knock: 1.2 },
  g4: { radius: 1.8, windup: 1.2, pct: 0.08 },
  g5: { radius: 2.0, windup: 1.0, pct: 0.07 },
};

const GOLD = 0xffd86b;
const WHITE = 0xf2f6f8;
const PAPER = 0xf6f2e6;

const v2 = (x, z) => ({ x, z });
const clampArena = (x, z, r) => {
  const d = Math.hypot(x, z);
  if (d <= r) return v2(x, z);
  return v2((x / d) * r, (z / d) * r);
};
// 点到线段的距离（旋转笔迹臂的扇形判定用）
function pointSegDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const len2 = dx * dx + dz * dz || 1;
  let t = ((px - ax) * dx + (pz - az) * dz) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

// ============================================================
// ① 场地 + 八招
// ============================================================
export function createBlankSystem({ scene, fx, enemies }) {
  let cfg = null;
  let enabled = false;
  let arena = 20;
  let scale = { hp: 1, damage: 1, speed: 1, haste: 1 };
  let roundNo = 1;
  let playerMaxHp = 10;
  let playerRadius = 0.34;

  const names = new Set();       // 已经抢回（= 已封印）的招式 key
  const plates = [];
  const events = [];
  const shots = [];
  const arms = [];
  const jobs = [];
  const patches = [];
  const walls = [];
  const ai = new Map();          // e.id -> { cd, last, busy, guards, guardT, stealIdx }

  // ---------------- 共享几何 / 材质 ----------------
  const plateGeo = new THREE.BoxGeometry(0.46, 0.30, 0.05);
  const plateMat = new THREE.MeshStandardMaterial({
    color: 0xffe6a8, emissive: 0xffbf4a, emissiveIntensity: 0.85, roughness: 0.4, metalness: 0.25,
  });
  const plateGlowMat = new THREE.MeshBasicMaterial({
    color: GOLD, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const plateGlowGeo = new THREE.RingGeometry(0.34, 0.52, 20).rotateX(-Math.PI / 2);

  const shotGeo = new THREE.BoxGeometry(0.24, 0.30, 0.05);
  const shotMat = new THREE.MeshBasicMaterial({ color: 0xfff0b8, transparent: true, opacity: 0.95 });
  const inkShotMat = new THREE.MeshBasicMaterial({ color: 0x2a2338, transparent: true, opacity: 0.95 });
  const shotRingMat = new THREE.MeshBasicMaterial({
    color: GOLD, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending,
  });

  const patchMat = new THREE.MeshBasicMaterial({
    color: WHITE, transparent: true, opacity: 0.22, depthWrite: false,
  });
  const patchEdgeMat = new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false,
    side: THREE.DoubleSide,
  });
  const patchGeo = new THREE.CircleGeometry(1, 36).rotateX(-Math.PI / 2);
  const patchEdgeGeo = new THREE.RingGeometry(0.9, 1, 40).rotateX(-Math.PI / 2);

  const wallGeo = new THREE.BoxGeometry(1, 2.2, 0.16);
  const wallMat = new THREE.MeshBasicMaterial({
    color: 0xf4efe2, transparent: true, opacity: 0.42, depthWrite: false, side: THREE.DoubleSide,
  });

  const warnMat = new THREE.MeshBasicMaterial({
    color: 0xff6b5a, transparent: true, opacity: 0.55, depthWrite: false,
    side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
  });
  const warnGeo = new THREE.RingGeometry(0.72, 1, 40).rotateX(-Math.PI / 2);
  const arcMat = new THREE.MeshBasicMaterial({
    color: 0xffe9a8, transparent: true, opacity: 0.4, depthWrite: false,
    side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
  });

  // ---------------- 对外：构建 ----------------
  function build(c) {
    enabled = !!c;
    cfg = c ? { ...c } : null;
    if (c && Number.isFinite(c.arena)) arena = c.arena;
    names.clear();
    clearField();
    roundNo = 1;
  }

  function setRound(no, sc) {
    roundNo = Math.max(1, Number(no) || 1);
    if (sc) scale = { ...scale, ...sc };
  }

  function setPlayerInfo({ maxHp, radius } = {}) {
    if (Number.isFinite(maxHp) && maxHp > 0) playerMaxHp = maxHp;
    if (Number.isFinite(radius) && radius > 0) playerRadius = radius;
  }

  // ---------------- 名字牌 ----------------
  function makePlate(key, x, z) {
    const g = new THREE.Group();
    const mesh = new THREE.Mesh(plateGeo, plateMat.clone());
    mesh.position.y = 0.42;
    g.add(mesh);
    const glow = new THREE.Mesh(plateGlowGeo, plateGlowMat.clone());
    glow.position.y = 0.05;
    g.add(glow);
    const tag = BLANK_MOVES.find((m) => m.key === key);
    g.position.set(x, 0, z);
    scene.add(g);
    return {
      key, name: tag ? tag.name : '名字', x, z, t: 0, gone: false,
      group: g, mesh, glow,
    };
  }

  // main.js 的 onDeath 调：这一只残影该不该掉名字，由这里统一判
  function dropPlate(e) {
    if (!enabled || !cfg) return false;
    const key = e && e.cfg && e.cfg.blankMove;
    if (!key) return false;
    if (names.has(key)) return false;                       // 已经抢回来了
    if (plates.some((p) => p.key === key && !p.gone)) return false;  // 地上还躺着一枚
    const at = e.pos || { x: 0, z: 0 };
    const p = makePlate(key, at.x, at.z);
    plates.push(p);
    if (fx) {
      fx.ring(at, { from: 0.2, to: 1.3, color: GOLD, life: 0.45, opacity: 0.7, y: 0.06 });
      fx.text(at, '名字牌', { color: '#ffd86b', size: 0.5, life: 0.8, y: 1.2 });
    }
    return true;
  }

  function reclaim(p) {
    if (p.gone) return;
    p.gone = true;
    names.add(p.key);
    const tag = BLANK_MOVES.find((m) => m.key === p.key);
    const coin = (cfg && cfg.coinPerName) || BLANK_BASE.coinPerName;
    const total = (cfg && cfg.totalNames) || BLANK_BASE.totalNames;
    events.push({
      kind: 'name', key: p.key, name: tag ? tag.name : '名字',
      got: names.size, total, coin,
    });
    if (fx) {
      fx.ring(v2(p.x, p.z), { from: 0.3, to: 2.0, color: GOLD, life: 0.55, opacity: 0.8, y: 0.08 });
      fx.text(v2(p.x, p.z), `抢回：${tag ? tag.name : '名字'}`, {
        color: '#ffd86b', size: 0.62, life: 1.1, y: 1.6,
      });
    }
  }

  // ---------------- 弹幕 ----------------
  function addShot(o) {
    const mat = o.ink ? inkShotMat : shotMat;
    const mesh = new THREE.Mesh(shotGeo, mat);
    mesh.position.set(o.x, o.y || 0.55, o.z);
    mesh.rotation.y = Math.atan2(o.vx, o.vz);
    scene.add(mesh);
    shots.push({
      x: o.x, z: o.z, vx: o.vx, vz: o.vz, life: o.life || 4.0,
      range: o.range || 6.0, pct: o.pct || 0.05, src: o.src || null,
      homing: !!o.homing, reaim: o.reaim || 99, reaimT: o.reaim || 0,
      ink: !!o.ink, mesh,
    });
  }

  // ---------------- 白斑 / 纸墙 ----------------
  function addPatch(x, z, radius, life, pctPerSec) {
    const g = new THREE.Group();
    const disc = new THREE.Mesh(patchGeo, patchMat.clone());
    disc.scale.setScalar(radius);
    const edge = new THREE.Mesh(patchEdgeGeo, patchEdgeMat.clone());
    edge.scale.setScalar(radius);
    g.add(disc, edge);
    g.position.set(x, 0.04, z);
    scene.add(g);
    patches.push({ x, z, radius, life, t: 0, tick: 0, pct: pctPerSec, group: g, disc, edge });
  }

  function addWall(x, z, nx, nz, len, life) {
    const mesh = new THREE.Mesh(wallGeo, wallMat.clone());
    mesh.scale.x = len;
    mesh.position.set(x, 1.12, z);
    mesh.rotation.y = Math.atan2(nx, nz) + Math.PI / 2;
    scene.add(mesh);
    // 玩家出生在哪一侧就永远留在哪一侧：纸墙只对「跨过去」这件事生效
    const side = ((x * nx) + (z * nz)) >= 0 ? 1 : -1;
    walls.push({ x, z, nx, nz, len, life, t: 0, side, mesh });
  }

  function clampPoint(x, z) {
    let cx = x, cz = z, xClamped = false, zClamped = false;
    for (const w of walls) {
      if (w.t >= w.life) continue;
      const s = (cx - w.x) * w.nx + (cz - w.z) * w.nz;
      if (s * w.side > 0) continue;                    // 还在自己这一侧
      const along = Math.abs((cx - w.x) * -w.nz + (cz - w.z) * w.nx);
      if (along > w.len / 2) continue;                  // 已经绕过墙的两端
      const want = w.side * BLANK_BASE.wall.halfWidth;
      const d = want - s;
      cx += w.nx * d;
      cz += w.nz * d;
      if (Math.abs(w.nx) > Math.abs(w.nz)) xClamped = true; else zClamped = true;
    }
    return { x: cx, z: cz, xClamped, zClamped };
  }

  // ---------------- 每帧 ----------------
  function update(dt, opts = {}) {
    const p = opts.playerPos || { x: 0, z: 0 };
    if (Number.isFinite(opts.playerMaxHp)) playerMaxHp = opts.playerMaxHp;
    if (Number.isFinite(opts.playerRadius)) playerRadius = opts.playerRadius;

    // 名字牌：5 秒后飘走
    const plateLife = (cfg && cfg.plateLife) || BLANK_BASE.plateLife;
    const pickR = (cfg && cfg.pickRadius) || BLANK_BASE.pickRadius;
    for (let i = plates.length - 1; i >= 0; i--) {
      const pl = plates[i];
      pl.t += dt;
      const bob = Math.sin(pl.t * 2.4 + pl.x) * 0.06;
      pl.mesh.position.y = 0.42 + bob;
      pl.glow.scale.setScalar(1 + Math.sin(pl.t * 3.0) * 0.12);
      if (!pl.gone && Math.hypot(p.x - pl.x, p.z - pl.z) <= pickR + playerRadius * 0.4) {
        reclaim(pl);
      }
      if (pl.gone || pl.t > plateLife) {
        // 飘走：往上抬、缩小、淡出
        const k = Math.min(1, (pl.t - plateLife) / BLANK_BASE.plateFade);
        pl.group.position.y = k * 1.4;
        pl.group.scale.setScalar(1 - k * 0.35);
        pl.mesh.material.opacity = 1 - k;
        pl.mesh.material.transparent = true;
        pl.glow.material.opacity = (1 - k) * 0.5;
        if (pl.gone || k >= 1) {
          scene.remove(pl.group);
          plates.splice(i, 1);
        }
      }
    }

    // 弹幕
    for (let i = shots.length - 1; i >= 0; i--) {
      const s = shots[i];
      s.life -= dt;
      if (s.homing) {
        s.reaimT -= dt;
        if (s.reaimT <= 0) {
          s.reaimT = s.reaim;
          const d = Math.hypot(p.x - s.x, p.z - s.z) || 1;
          s.vx = ((p.x - s.x) / d) * Math.hypot(s.vx, s.vz);
          s.vz = ((p.z - s.z) / d) * Math.hypot(s.vx, s.vz);
          s.mesh.rotation.y = Math.atan2(s.vx, s.vz);
        }
      }
      s.x += s.vx * dt;
      s.z += s.vz * dt;
      s.mesh.position.x = s.x;
      s.mesh.position.z = s.z;
      s.mesh.rotation.z += dt * 1.6;
      const hit = Math.hypot(p.x - s.x, p.z - s.z) <= playerRadius + 0.42;
      if (hit) {
        if (opts.hurtPlayer) opts.hurtPlayer(playerMaxHp * s.pct, s.src || 'blank');
        if (fx) fx.ring(v2(s.x, s.z), { from: 0.1, to: 0.9, color: WHITE, life: 0.26, opacity: 0.7, y: 0.4 });
      }
      if (hit || s.life <= 0 || Math.hypot(s.x, s.z) > arena + 1.5) {
        scene.remove(s.mesh);
        shots.splice(i, 1);
      }
    }

    // 旋转笔迹臂
    for (let i = arms.length - 1; i >= 0; i--) {
      const a = arms[i];
      a.t += dt;
      a.hitCd = Math.max(0, a.hitCd - dt);
      const half = a.dur / 2;
      const dir = a.t < half ? 1 : -1;
      a.group.rotation.y += dir * a.spin * dt;
      if (a.e && a.e.pos) a.group.position.set(a.e.pos.x, 0, a.e.pos.z);
      // 判定：主角到每一条臂的线段距离
      if (a.hitCd <= 0) {
        for (let k = 0; k < a.count; k++) {
          const ang = a.group.rotation.y + (k / a.count) * Math.PI * 2;
          const ex = a.group.position.x + Math.sin(ang) * a.len;
          const ez = a.group.position.z + Math.cos(ang) * a.len;
          if (pointSegDist(p.x, p.z, a.group.position.x, a.group.position.z, ex, ez) <= 0.20 + playerRadius) {
            if (opts.hurtPlayer) opts.hurtPlayer(playerMaxHp * a.pct, a.e || 'blank');
            a.hitCd = 0.55;
            if (fx) fx.ring(v2(p.x, p.z), { from: 0.1, to: 1.0, color: 0xffe9a8, life: 0.25, opacity: 0.7, y: 0.3 });
            break;
          }
        }
      }
      if (a.t >= a.dur) {
        scene.remove(a.group);
        arms.splice(i, 1);
      }
    }

    // 白斑
    for (let i = patches.length - 1; i >= 0; i--) {
      const q = patches[i];
      q.t += dt;
      q.tick -= dt;
      const inPlayer = Math.hypot(p.x - q.x, p.z - q.z) <= q.radius;
      if (inPlayer && q.tick <= 0) {
        q.tick = 0.5;
        if (opts.hurtPlayer) opts.hurtPlayer(playerMaxHp * q.pct * 0.5, 'hazard');
        if (fx) fx.text(v2(p.x, p.z), '被抹', { color: '#ffffff', size: 0.42, life: 0.5, y: 1.2 });
      }
      // 怪进去直接被收走（这不讲道理，所以白斑不能一直留着）
      if (enemies) {
        for (const e of enemies.list) {
          if (!enemies.hittable(e)) continue;
          if (Math.hypot(e.pos.x - q.x, e.pos.z - q.z) > q.radius + (e.cfg.radius || 0.3)) continue;
          enemies.takeDamage(e, (e.maxHp || 1) * 10, false, { quiet: false });
          if (fx) fx.text(e.pos, '收走', { color: '#ffffff', size: 0.5, life: 0.6, y: (e.height || 1) + 0.3 });
        }
      }
      const k = Math.min(1, q.t / q.life);
      q.disc.material.opacity = 0.22 * (1 - k) + 0.04;
      q.edge.material.opacity = 0.55 * (1 - k) + 0.06;
      if (q.t >= q.life) {
        scene.remove(q.group);
        patches.splice(i, 1);
      }
    }

    // 纸墙
    for (let i = walls.length - 1; i >= 0; i--) {
      const w = walls[i];
      w.t += dt;
      w.mesh.material.opacity = 0.42 * Math.max(0, 1 - w.t / w.life);
      if (w.t >= w.life) {
        scene.remove(w.mesh);
        walls.splice(i, 1);
      }
    }

    // 延时招（读条 / 落地 / 笔痕）
    for (let i = jobs.length - 1; i >= 0; i--) {
      const j = jobs[i];
      j.t += dt;
      if (j.kind === 'dash') {
        const k = Math.min(1, j.t / j.dur);
        const e = j.e;
        if (e && e.pos) {
          e.pos.x = j.sx + j.dx * j.len * k;
          e.pos.z = j.sz + j.dz * j.len * k;
          const at = clampArena(e.pos.x, e.pos.z, arena - 0.6);
          e.pos.x = at.x; e.pos.z = at.z;
        }
        if (j.t >= j.dur) {
          const d = Math.hypot(p.x - (e ? e.pos.x : j.sx), p.z - (e ? e.pos.z : j.sz));
          if (d <= playerRadius + 1.25) {
            if (opts.hurtPlayer) opts.hurtPlayer(playerMaxHp * j.pct, e || 'blank');
            if (opts.pushPlayer) opts.pushPlayer(j.dx, j.dz, j.knock);
          }
          jobs.splice(i, 1);
        }
        continue;
      }
      if (j.kind === 'warn') {
        const k = Math.min(1, j.t / j.windup);
        j.mesh.scale.setScalar(j.radius * (0.35 + 0.65 * k));
        j.mesh.material.opacity = 0.55 * (0.5 + 0.5 * k);
        if (j.mesh.position && j.follow && j.e && j.e.pos) {
          j.mesh.position.x = j.e.pos.x;
          j.mesh.position.z = j.e.pos.z;
        }
        if (j.t >= j.windup) {
          const cx = j.mesh.position.x, cz = j.mesh.position.z;
          const hit = Math.hypot(p.x - cx, p.z - cz) <= j.radius + playerRadius;
          if (hit && opts.hurtPlayer) opts.hurtPlayer(playerMaxHp * j.pct, j.src || 'blank');
          if (fx) {
            fx.ring(v2(cx, cz), { from: 0.2, to: j.radius, color: j.color || 0xff6b5a, life: 0.4, opacity: 0.8, y: 0.07 });
            if (hit) fx.text(v2(p.x, p.z), '中', { color: '#ffd86b', size: 0.5, life: 0.5, y: 1.3 });
          }
          scene.remove(j.mesh);
          jobs.splice(i, 1);
        }
        continue;
      }
      if (j.kind === 'stroke') {
        const w = j.windup;
        if (j.t <= w) {
          j.mesh.material.opacity = 0.25 + 0.35 * (j.t / w);
          if (j.e && j.e.pos) {
            j.mesh.position.set(j.e.pos.x, 0.09, j.e.pos.z);
            j.mesh.rotation.z = -j.e.root.rotation.y;
          }
        } else {
          if (!j.hitDone) {
            j.hitDone = true;
            scene.remove(j.mesh);
            const e = j.e;
            const bx = e ? e.pos.x : j.mesh.position.x;
            const bz = e ? e.pos.z : j.mesh.position.z;
            const dx = p.x - bx, dz = p.z - bz;
            const d = Math.hypot(dx, dz);
            const face = e ? e.root.rotation.y : 0;
            const ang = Math.atan2(dx, dz);
            let diff = ang - face;
            diff = Math.atan2(Math.sin(diff), Math.cos(diff));
            const hit = d <= j.range + playerRadius && Math.abs(diff) <= j.halfAngle;
            if (hit) {
              if (opts.hurtPlayer) opts.hurtPlayer(playerMaxHp * j.pct, e || 'blank');
              if (opts.rootPlayer) opts.rootPlayer(j.pin);
            }
            if (fx) {
              fx.ring(v2(bx, bz), { from: 0.4, to: j.range, color: 0xffe9a8, life: 0.45, opacity: 0.65, y: 0.08 });
              fx.text(v2(bx, bz), hit ? '最后一笔' : '落空', {
                color: hit ? '#ffe9a8' : '#b8b0a0', size: hit ? 0.62 : 0.46, y: 1.9,
              });
            }
          }
          if (j.t >= w + 0.25) jobs.splice(i, 1);
        }
        continue;
      }
      if (j.kind === 'steal') {
        if (!j.hitDone && j.t >= j.windup) {
          j.hitDone = true;
          applySteal(j.what, j.e, opts);
        }
        if (j.t >= j.windup + 0.2) jobs.splice(i, 1);
        continue;
      }
      if (j.kind === 'copy') {
        if (!j.hitDone && j.t >= j.windup) {
          j.hitDone = true;
          doCopySpawn(j.e, opts);   // 这里只能 spawn，不能再调 doCopy —— 会无限续读条
        }
        if (j.t >= j.windup + 0.2) jobs.splice(i, 1);
        continue;
      }
      jobs.splice(i, 1);
    }
  }

  // ---------------- 招式的具体实现 ----------------
  function hurtPct(pct, src, opts) {
    if (opts && opts.hurtPlayer) opts.hurtPlayer(playerMaxHp * pct, src || 'blank');
  }

  function doScatter(e, boss, opts) {
    const s = BLANK_BASE.scatter[boss ? 'boss' : 'avatar'];
    const pct = BLANK_BASE.scatter.pct[boss ? 0 : 1];
    const n = s.count;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + (e.root ? e.root.rotation.y : 0);
      addShot({
        x: e.pos.x + Math.sin(a) * 0.45, z: e.pos.z + Math.cos(a) * 0.45,
        vx: Math.sin(a) * s.speed, vz: Math.cos(a) * s.speed,
        range: s.range, pct, src: e,
      });
    }
    if (fx) {
      fx.ring(e.pos, { from: 0.3, to: 1.5, color: WHITE, life: 0.4, opacity: 0.7, y: 0.08 });
      fx.text(e.pos, '散名', { color: '#f2f6f8', size: 0.5, life: 0.7, y: (e.height || 1) + 0.3 });
    }
  }

  function doHoming(e, boss, opts) {
    const s = BLANK_BASE.homing[boss ? 'boss' : 'avatar'];
    const pct = BLANK_BASE.homing.pct[boss ? 0 : 1];
    const p = opts.playerPos || { x: 0, z: 0 };
    for (let i = 0; i < s.count; i++) {
      const a = Math.atan2(p.x - e.pos.x, p.z - e.pos.z) + (i - (s.count - 1) / 2) * 0.5;
      addShot({
        x: e.pos.x, z: e.pos.z,
        vx: Math.sin(a) * s.speed, vz: Math.cos(a) * s.speed,
        life: s.life, range: 99, pct, src: e, homing: true, reaim: s.reaim,
        ink: true, y: 0.62,
      });
    }
    if (fx) fx.text(e.pos, '盯上你', { color: '#cfd6db', size: 0.5, life: 0.7, y: (e.height || 1) + 0.3 });
  }

  function doArm(e, boss, opts) {
    const s = BLANK_BASE.arm[boss ? 'boss' : 'avatar'];
    const pct = BLANK_BASE.arm.pct[boss ? 0 : 1];
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({
      color: 0xd8c79a, transparent: true, opacity: 0.55, depthWrite: false,
      side: THREE.DoubleSide,
    });
    const len = boss ? 5.2 : 4.0;
    for (let i = 0; i < s.count; i++) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.06, len), mat);
      arm.position.set(0, 0.10, len / 2);
      arm.rotation.y = (i / s.count) * Math.PI * 2;
      g.add(arm);
    }
    g.position.set(e.pos.x, 0, e.pos.z);
    scene.add(g);
    arms.push({
      e, group: g, count: s.count, len, dur: s.dur, t: 0, spin: 1.9, pct, hitCd: 0.2,
    });
    if (fx) fx.text(e.pos, '写错一笔', { color: '#e8dcc2', size: 0.5, life: 0.7, y: (e.height || 1) + 0.3 });
  }

  function nextSteal(st) {
    const what = BLANK_STEAL_ORDER[(st.stealIdx || 0) % BLANK_STEAL_ORDER.length];
    st.stealIdx = ((st.stealIdx || 0) + 1) % BLANK_STEAL_ORDER.length;
    return what;
    // 顺序固定 → 玩家看得见「下一次收什么」，这就是可预判
  }

  function applySteal(what, e, opts) {
    if (what === 'ground') {
      if (opts.clearGround) opts.clearGround();
    } else if (what === 'skill') {
      if (opts.silenceSkills) opts.silenceSkills(3.0);
    } else if (what === 'weapon') {
      if (opts.stealSword) opts.stealSword();
    } else if (what === 'buff') {
      if (opts.rootPlayer) opts.rootPlayer(1.6);
    } else if (what === 'combo') {
      if (opts.breakCombo) opts.breakCombo();
    } else {
      hurtPct(BLANK_BASE.steal.pct, e, opts);
    }
    if (fx) {
      fx.ring(v2(opts.playerPos ? opts.playerPos.x : 0, opts.playerPos ? opts.playerPos.z : 0), {
        from: 0.4, to: 2.4, color: 0xcfd6db, life: 0.5, opacity: 0.75, y: 0.08,
      });
      fx.text(opts.playerPos || { x: 0, z: 0 }, `收走：${STEAL_TEXT[what] || what}`, {
        color: '#cfd6db', size: 0.56, life: 1.0, y: 1.8,
      });
    }
  }

  function doSteal(e, boss, opts, st) {
    const what = boss ? nextSteal(st) : 'ground';
    jobs.push({ kind: 'steal', e, what, t: 0, windup: BLANK_BASE.steal.windup, hitDone: false });
    events.push({ kind: 'stealWarn', what, text: STEAL_TEXT[what] || what, boss });
    if (fx) {
      fx.ring(e.pos, { from: 0.3, to: 2.0, color: 0xcfd6db, life: BLANK_BASE.steal.windup, opacity: 0.45, y: 0.07 });
      fx.text(e.pos, `下一次：${STEAL_TEXT[what]}`, { color: '#cfd6db', size: 0.5, life: BLANK_BASE.steal.windup, y: (e.height || 1) + 0.4 });
    }
  }

  function doCopy(e, boss, opts) {
    if (!boss) {
      // 分身：不召唤，改为一次短冲（设计稿 §2）
      startDash(e, opts);
      return;
    }
    jobs.push({ kind: 'copy', e, t: 0, windup: BLANK_BASE.copy.windup, hitDone: false });
    if (fx) fx.text(e.pos, '照着我造', { color: '#f2f6f8', size: 0.5, life: 0.8, y: (e.height || 1) + 0.3 });
  }

  function doSpot(e, boss, opts) {
    const s = BLANK_BASE.spot[boss ? 'boss' : 'avatar'];
    const p = opts.playerPos || { x: 0, z: 0 };
    for (let i = 0; i < s.count; i++) {
      let x, z;
      if (i === 0) {
        x = p.x; z = p.z;
      } else {
        const a = Math.random() * Math.PI * 2;
        const d = 3.0 + Math.random() * 3.0;
        x = p.x + Math.sin(a) * d;
        z = p.z + Math.cos(a) * d;
      }
      const at = clampArena(x, z, arena - s.radius);
      addPatch(at.x, at.z, s.radius, s.life, s.pctPerSec);
    }
    if (fx) fx.text(e.pos, '这里没有东西', { color: '#ffffff', size: 0.5, life: 0.8, y: (e.height || 1) + 0.3 });
  }

  function doWall(e, boss, opts) {
    const s = BLANK_BASE.wall[boss ? 'boss' : 'avatar'];
    const p = opts.playerPos || { x: 0, z: 0 };
    // 墙穿过主角与空白的中点，法线朝「空白 → 主角」—— 就是把你们隔开的那一页
    const dx = p.x - e.pos.x, dz = p.z - e.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    const nx = dx / d, nz = dz / d;
    const mx = e.pos.x + dx * 0.5;
    const mz = e.pos.z + dz * 0.5;
    const len = boss ? arena * 1.9 : arena * 1.15;
    addWall(mx, mz, nx, nz, len, s.life);
    if (fx) fx.text(v2(mx, mz), '合上这一页', { color: '#f4efe2', size: 0.5, life: 0.8, y: 2.4 });
  }

  function doStroke(e, boss, opts) {
    const s = BLANK_BASE.stroke[boss ? 'boss' : 'avatar'];
    const geo = new THREE.RingGeometry(s.range * 0.72, s.range, 48, 1,
      Math.PI / 2 - s.halfAngle, s.halfAngle * 2);
    const mesh = new THREE.Mesh(geo.rotateX(-Math.PI / 2), arcMat.clone());
    mesh.position.set(e.pos.x, 0.09, e.pos.z);
    scene.add(mesh);
    jobs.push({
      kind: 'stroke', e, mesh, t: 0, windup: s.windup,
      halfAngle: s.halfAngle, range: s.range, pct: s.pct, pin: s.pin, hitDone: false,
    });
    if (fx) fx.text(e.pos, '最后一笔', { color: '#ffe9a8', size: 0.55, life: 0.9, y: (e.height || 1) + 0.35 });
  }

  function startDash(e, opts) {
    const p = opts.playerPos || { x: 0, z: 0 };
    const dx = p.x - e.pos.x, dz = p.z - e.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    jobs.push({
      kind: 'dash', e, sx: e.pos.x, sz: e.pos.z, dx: dx / d, dz: dz / d,
      len: Math.min(BLANK_BASE.g3.dash, Math.max(0, d - 0.8)),
      dur: BLANK_BASE.g3.dur, t: 0, pct: BLANK_BASE.g3.pct, knock: BLANK_BASE.g3.knock,
    });
    const st = ai.get(e.id);
    if (st) st.busy = BLANK_BASE.g3.dur + 0.05;
  }

  function doGeneric(e, key, opts, boss) {
    const p = opts.playerPos || { x: 0, z: 0 };
    if (key === 'g1') {
      const g = BLANK_BASE.g1;
      const dx = p.x - e.pos.x, dz = p.z - e.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > g.range + 1.2) return;    // 太远就这一下空挥（它自己会继续追）
      if (d <= g.range + playerRadius) hurtPct(g.pct, e, opts);
      if (fx) fx.ring(v2(e.pos.x + dx * 0.5, e.pos.z + dz * 0.5), {
        from: 0.2, to: g.range, color: 0xffe9a8, life: 0.28, opacity: 0.65, y: 0.08,
      });
    } else if (key === 'g2') {
      const g = BLANK_BASE.g2;
      const base = Math.atan2(p.x - e.pos.x, p.z - e.pos.z);
      for (let i = 0; i < g.count; i++) {
        const a = base + (i - (g.count - 1) / 2) * 0.22;
        addShot({
          x: e.pos.x, z: e.pos.z,
          vx: Math.sin(a) * g.speed, vz: Math.cos(a) * g.speed,
          range: g.range, pct: g.pct, src: e,
        });
      }
    } else if (key === 'g3') {
      startDash(e, opts);
    } else if (key === 'g4') {
      const g = BLANK_BASE.g4;
      const mesh = new THREE.Mesh(warnGeo, warnMat.clone());
      mesh.scale.setScalar(g.radius * 0.35);
      mesh.position.set(p.x, 0.06, p.z);
      scene.add(mesh);
      jobs.push({
        kind: 'warn', mesh, t: 0, windup: g.windup, radius: g.radius, pct: g.pct, src: e,
        color: 0xff6b5a,
      });
    } else if (key === 'g5') {
      const g = BLANK_BASE.g5;
      const mesh = new THREE.Mesh(warnGeo, warnMat.clone());
      mesh.scale.setScalar(g.radius * 0.35);
      const at = clampArena(p.x, p.z, arena - 0.6);
      mesh.position.set(at.x, 0.06, at.z);
      scene.add(mesh);
      jobs.push({
        kind: 'warn', mesh, t: 0, windup: g.windup, radius: g.radius, pct: g.pct, src: e,
        color: 0xd8c79a,
      });
    }
  }

  function doCopySpawn(e, opts) {
    if (!enemies) return;
    let alive = 0;
    for (const o of enemies.list) {
      if (o.type === 'blankMinion' && enemies.hittable(o)) alive++;
    }
    if (alive >= 1) return;
    const a = Math.random() * Math.PI * 2;
    let x = e.pos.x + Math.sin(a) * 2.0;
    let z = e.pos.z + Math.cos(a) * 2.0;
    const at = clampArena(x, z, arena - 1.0);
    enemies.spawn('blankMinion', at, {
      hpScale: scale.hp * 0.55, damageScale: 1, speedScale: scale.speed,
      hasteScale: 1, scale: 0.55,
    });
    if (fx) fx.ring(at, { from: 0.2, to: 1.6, color: WHITE, life: 0.45, opacity: 0.75, y: 0.07 });
    events.push({ kind: 'minion' });
  }

  // ---------------- BOSS / 分身：每帧的「脑子」 ----------------
  function moveEnemy(e, dt, boss, opts) {
    const p = opts.playerPos || { x: 0, z: 0 };
    const dx = p.x - e.pos.x, dz = p.z - e.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    let want = 0;
    if (boss) {
      if (d < 6.0) want = -1;         // 太近：退
      else if (d > 9.0) want = 1;     // 太远：靠
    } else {
      if (d > 4.2) want = 1;
      else if (d < 1.5) want = -0.6;
    }
    if (!want) return;
    const sp = (e.speed || 1.0) * (boss ? 0.55 : 1.0);
    const nx = (dx / d) * want, nz = (dz / d) * want;
    const at = clampArena(e.pos.x + nx * sp * dt, e.pos.z + nz * sp * dt, arena - 0.7);
    e.pos.x = at.x;
    e.pos.z = at.z;
  }

  const GENERIC = ['g1', 'g2', 'g3', 'g4', 'g5'];

  function pickKey(e, st) {
    const boss = !!e.cfg.blankBoss;
    const specials = boss
      ? BLANK_MOVES.filter((m) => !names.has(m.key)).map((m) => m.key)
      : (e.cfg.blankMove ? [e.cfg.blankMove] : (e.cfg.blankMoves || []));
    const special = !!(specials.length && Math.random() < (boss ? 0.62 : 0.72));
    if (special) {
      const pool = specials.filter((k) => k !== st.last);
      return (pool.length ? pool : specials)[Math.floor(Math.random() * (pool.length ? pool.length : specials.length))];
    }
    const gpool = GENERIC.filter((k) => k !== st.last);
    return (gpool.length ? gpool : GENERIC)[Math.floor(Math.random() * (gpool.length ? gpool.length : GENERIC.length))];
  }

  function startMove(e, key, opts, st) {
    if (GENERIC.includes(key)) { doGeneric(e, key, opts, !!e.cfg.blankBoss); return; }
    if (key === 'scatter') doScatter(e, !!e.cfg.blankBoss, opts);
    else if (key === 'homing') doHoming(e, !!e.cfg.blankBoss, opts);
    else if (key === 'arm') doArm(e, !!e.cfg.blankBoss, opts);
    else if (key === 'steal') doSteal(e, !!e.cfg.blankBoss, opts, st);
    else if (key === 'copy') doCopy(e, !!e.cfg.blankBoss, opts);
    else if (key === 'spot') doSpot(e, !!e.cfg.blankBoss, opts);
    else if (key === 'wall') doWall(e, !!e.cfg.blankBoss, opts);
    else if (key === 'stroke') doStroke(e, !!e.cfg.blankBoss, opts);
  }

  function bossPhase(e) {
    const k = e.maxHp > 0 ? e.hp / e.maxHp : 1;
    return k >= 0.66 ? 0 : (k >= 0.33 ? 1 : 2);
  }

  function bossGuards(e, dt, opts, st) {
    if (!enemies) return;
    if (!st.guards) st.guards = [];
    st.guards = st.guards.filter((o) => o && enemies.hittable(o));
    const phase = bossPhase(e);
    if (st.phase == null) st.phase = phase;
    if (phase > st.phase) st.phase = phase;
    const want = 2 + st.phase;
    st.guardT -= dt;
    if (st.guards.length < want && st.guardT <= 0) {
      st.guardT = BLANK_BASE.guardRespawn;
      // 首帧一次补到 want（设计稿 §5：上台就带 2 只），之后每 8 秒补一只。
      for (let n = st.guards.length; n < want; n++) {
        const pool = BLANK_MOVES.filter((m) => !names.has(m.key));
        const pick = pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
        const type = pick ? avatarTypeOf(pick.key) : 'blankMinion';
        if (!type) continue;
        const a = Math.random() * Math.PI * 2;
        const r = 5.5 + Math.random() * 2.0;
        const at = clampArena(e.pos.x + Math.sin(a) * r, e.pos.z + Math.cos(a) * r, arena - 1.0);
        const o = enemies.spawn(type, at, {
          hpScale: scale.hp * 0.78, damageScale: scale.hp * 0.78,
          speedScale: scale.speed, hasteScale: 1,
        });
        if (o) st.guards.push(o);
      }
    }
  }

  function avatarTypeOf(key) {
    const map = {
      scatter: 'blankScatter', homing: 'blankHoming', arm: 'blankArm', steal: 'blankSteal',
      copy: 'blankCopy', spot: 'blankSpot', wall: 'blankWall', stroke: 'blankStroke',
    };
    return map[key] || null;
  }

  // enemy.js 的分派区每帧调这里：它只负责「什么时候出招」，招式全在上面
  function tick(e, dt, ctx) {
    if (!enabled || !e) return;
    let st = ai.get(e.id);
    if (!st) {
      st = { cd: 1.0 + Math.random() * 0.8, last: null, busy: 0, stealIdx: 0, guards: [], guardT: 0, phase: null };
      ai.set(e.id, st);
    }
    if (st.busy > 0) { st.busy -= dt; return; }
    const boss = !!e.cfg.blankBoss;
    moveEnemy(e, dt, boss, ctx);
    if (boss) bossGuards(e, dt, ctx, st);
    st.cd -= dt;
    if (st.cd <= 0) {
      const key = pickKey(e, st);
      startMove(e, key, ctx, st);
      st.last = key;
      st.cd = boss
        ? BLANK_BASE.bossInterval[Math.min(2, bossPhase(e))]
        : 4.2 + Math.random() * 1.8;
    }
  }

  // ---------------- 清场 / 存档 / 调试 ----------------
  function clearField() {
    for (const p of plates) scene.remove(p.group);
    for (const s of shots) scene.remove(s.mesh);
    for (const a of arms) scene.remove(a.group);
    for (const q of patches) scene.remove(q.group);
    for (const w of walls) scene.remove(w.mesh);
    for (const j of jobs) {
      if (j.mesh) scene.remove(j.mesh);
      if (j.group) scene.remove(j.group);
    }
    plates.length = 0;
    shots.length = 0;
    arms.length = 0;
    patches.length = 0;
    walls.length = 0;
    jobs.length = 0;
    ai.clear();
  }

  // 「收走一样」专用：只清摆在地面上的东西（白斑 / 纸墙 / 旋臂 / 落笔圈），
  // **不清名字牌**（那是玩家挣回来的），也不清飞行中的弹幕。
  function clearGround() {
    for (const q of patches) scene.remove(q.group);
    for (const w of walls) scene.remove(w.mesh);
    for (const a of arms) scene.remove(a.group);
    patches.length = 0;
    walls.length = 0;
    arms.length = 0;
    for (let i = jobs.length - 1; i >= 0; i--) {
      const j = jobs[i];
      if (j.kind !== 'warn') continue;
      if (j.mesh) scene.remove(j.mesh);
      jobs.splice(i, 1);
    }
  }

  function serialize() {
    return { names: [...names] };
  }

  function restore(o) {
    names.clear();
    if (o && Array.isArray(o.names)) {
      for (const k of o.names) if (BLANK_MOVES.some((m) => m.key === k)) names.add(k);
    }
  }

  function state() {
    return {
      enabled, roundNo,
      moves: BLANK_MOVES.map((m) => ({ ...m, sealed: names.has(m.key) })),
      names: [...names],
      plates: plates.map((p) => ({ key: p.key, x: p.x, z: p.z, t: p.t, gone: p.gone })),
      walls: walls.map((w) => ({ x: w.x, z: w.z, life: w.life, t: w.t })),
      shots: shots.length, patches: patches.length, jobs: jobs.length,
      steals: [...ai.values()].map((s) => s.stealIdx),
    };
  }

  return {
    build, setRound, setPlayerInfo, update, tick,
    dropPlate, clampPoint, clearField, clearGround,
    takeEvents: () => events.splice(0, events.length),
    serialize, restore, state,
    names, config: () => cfg, enabled: () => enabled,
  };
}

// ============================================================
// ② 第 20 件法器「镇纸锤」
// ============================================================
export const HAMMER_BASE = {
  interval: [6.5, 5.5, 4.5],
  reach: 2.4,
  radius: 2.0,
  dmg: [3.2, 4.4, 5.6],
  knock: 0.8,
  breakAdd: 0.20,
  breakTime: 3.0,
  bornKill: 1.5,           // 对空白族 ×1.5
  cd: [26.0, 23.0, 20.0],
  cdMin: 15.0,
  castRadius: 4.0,
  castPct: 0.25,
  castMin: 8.0,
  castPin: 1.0,
  headAdd: 0.35,           // 加重锤头：破甲 35%
  headRadius: 0.4,
  gripCd: 0.8,             // 握柄：CD −20%
  gripBorn: 1.75,          // 握柄：对空白族 1.75
};

export function createHammerSystem({ scene, fx, enemies, onSmash }) {
  const mods = { dmg: 0, interval: 0, radius: 0, brk: 0, cdCut: 0 };
  const shop = { head: false, grip: false };
  let relicLv = 0;
  let cd = 0;
  let cdMul = 1;
  let amp = { dmg: 1, radius: 0, cd: 1, dur: 0 };
  let autoT = 0;
  let swing = 0;
  let lastFail = '';
  let serial = 0;

  // ---------------- 外观：一柄纸镇大小的锤子，悬在主角身后半步 ----------------
  const root = new THREE.Group();
  root.visible = false;
  scene.add(root);
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x8a6136, roughness: 0.9, metalness: 0.05 });
  const headMat = new THREE.MeshStandardMaterial({ color: 0x8e9aa4, roughness: 0.45, metalness: 0.65 });
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.09, 1.05, 0.09), woodMat);
  handle.position.y = 0.52;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.34, 0.34), headMat);
  head.position.y = 1.18;
  root.add(handle, head);

  const glowMat = new THREE.MeshBasicMaterial({
    color: 0xffd86b, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const glow = new THREE.Mesh(new THREE.RingGeometry(0.24, 0.40, 24).rotateX(-Math.PI / 2), glowMat);
  glow.position.y = 0.02;
  root.add(glow);

  const lvIdx = () => Math.max(0, Math.min(2, relicLv - 1));
  const intervalV = () => Math.max(1.8, (relicLv ? HAMMER_BASE.interval[lvIdx()] : 6.5) - mods.interval);
  const radiusV = () => (relicLv ? HAMMER_BASE.radius : 2.0) + mods.radius + amp.radius + (shop.head ? HAMMER_BASE.headRadius : 0);
  const dmgV = () => ((relicLv ? HAMMER_BASE.dmg[lvIdx()] : 3.2) + mods.dmg) * amp.dmg;
  const breakV = () => HAMMER_BASE.breakAdd + mods.brk + (shop.head ? HAMMER_BASE.headAdd - HAMMER_BASE.breakAdd : 0);
  const bornMul = () => shop.grip ? HAMMER_BASE.gripBorn : HAMMER_BASE.bornKill;
  const cdMaxV = () => Math.max(HAMMER_BASE.cdMin,
    Math.max(0, (relicLv ? HAMMER_BASE.cd[lvIdx()] : HAMMER_BASE.cd[0]) - mods.cdCut)
      * cdMul * amp.cd * (shop.grip ? HAMMER_BASE.gripCd : 1));

  function breakArmor(e, add, time) {
    if (!e) return;
    e.armorBreak = { t: time, add: Math.max((e.armorBreak && e.armorBreak.add) || 0, add) };
  }

  function smashAt(x, z, radius, dmg, opts = {}) {
    let hits = 0;
    let kills = 0;
    for (const e of enemies.list) {
      if (!enemies.hittable(e)) continue;
      if (Math.hypot(e.pos.x - x, e.pos.z - z) > radius + (e.cfg.radius || 0.3)) continue;
      const blankFamily = e.type === 'blank' || e.type === 'blankMinion'
        || String(e.type).startsWith('blank') || e.type === 'shadow';
      const amount = dmg * (blankFamily ? bornMul() : 1);
      enemies.takeDamage(e, amount, false, { quiet: true, cls: 'phys' });
      hits++;
      // 第 139 块：这一锤是不是最后一下 —— 交给 main 记账（成就「一锤一个」）。
      // 只认 state === 'dead'：重启体归零会转成 'down'（4 秒后站起来），那不算击杀。
      if (e.state === 'dead') { kills++; continue; }
      if (enemies.hittable(e)) {
        breakArmor(e, breakV(), HAMMER_BASE.breakTime);
        if (opts.knock) enemies.knockback(e, x, z, opts.knock);
        if (opts.pin) enemies.applyFreeze(e, { time: opts.pin, color: 0xd8c79a });
      }
    }
    if (fx) {
      fx.ring({ x, z }, {
        from: 0.25, to: radius, color: 0xffd86b, life: 0.36, opacity: 0.75, y: 0.07,
      });
      fx.ring({ x, z }, {
        from: 0.1, to: radius * 0.6, color: 0xf2f6f8, life: 0.22, opacity: 0.6, y: 0.10,
      });
    }
    if (hits && onSmash) onSmash(hits, kills);
    return hits;
  }

  function autoSmash(p, yaw) {
    const x = p.x + Math.sin(yaw) * HAMMER_BASE.reach;
    const z = p.z + Math.cos(yaw) * HAMMER_BASE.reach;
    smashAt(x, z, radiusV(), dmgV(), { knock: HAMMER_BASE.knock });
    swing = 1;
    serial++;
  }

  /** 主动技能「砸地」(G) */
  function cast(p, yaw, maxHp) {
    if (!relicLv) { lastFail = 'lock'; return false; }
    if (cd > 0) { lastFail = 'cd'; return false; }
    const src = p || { x: 0, z: 0 };
    const r = HAMMER_BASE.castRadius + mods.radius + amp.radius + (shop.head ? HAMMER_BASE.headRadius : 0);
    const hp = Number(maxHp) || 10;
    const dmg = Math.max(HAMMER_BASE.castMin, hp * HAMMER_BASE.castPct) * amp.dmg + mods.dmg;
    smashAt(src.x, src.z, r, dmg, { pin: HAMMER_BASE.castPin });
    cd = cdMaxV();
    swing = 1.4;
    lastFail = '';
    if (fx) {
      fx.ring(src, { from: 0.4, to: r, color: 0xffe9a8, life: 0.5, opacity: 0.8, y: 0.08 });
      fx.text(src, '砸地', { color: '#ffd86b', size: 0.62, life: 0.9, y: 1.6 });
    }
    return true;
  }

  let cx = 0, cz = 0, firstPos = true;

  function update(dt, { playerPos, yaw } = {}) {
    if (cd > 0) cd = Math.max(0, cd - dt);
    if (swing > 0) swing = Math.max(0, swing - dt * 4.0);
    if (!relicLv || !playerPos) { root.visible = false; return; }
    const y = typeof yaw === 'number' ? yaw : ((playerPos && playerPos.yaw) || 0);
    const bx = playerPos.x - Math.sin(y) * 0.85 - Math.cos(y) * 0.10;
    const bz = playerPos.z - Math.cos(y) * 0.85 + Math.sin(y) * 0.10;
    if (firstPos) { cx = bx; cz = bz; firstPos = false; }
    const k = 1 - Math.exp(-8.0 * dt);
    cx += (bx - cx) * k;
    cz += (bz - cz) * k;
    root.position.set(cx, 0.02 + Math.sin(performance.now() / 650 + serial) * 0.012, cz);
    root.rotation.y = y;
    // 砸下去的那一下：锤头往前点、再慢慢回正
    root.rotation.x = -swing * 0.55;
    head.scale.setScalar(1 + swing * 0.12);
    root.visible = true;
    glowMat.opacity = 0.10 + (cd > 0 ? 0.05 : 0.18);

    autoT -= dt;
    if (autoT <= 0) {
      autoT = intervalV();
      autoSmash({ x: playerPos.x, z: playerPos.z }, y);
    }
  }

  // 入参就是卡片里的 hammer 描述（和 crate.js 一样：upgrade.js 传的是 up.hammer，
  // 不是整张卡）。写成 up.hammer 会永远拿到 undefined，卡片静默失效。
  function applyCard(h) {
    if (!h) return;
    const flat = Number(h.flat) || 0;
    if (h.stat === 'dmg') mods.dmg += flat;
    else if (h.stat === 'interval') mods.interval += flat;
    else if (h.stat === 'radius') mods.radius += flat;
    else if (h.stat === 'brk') mods.brk += flat;
    else if (h.stat === 'cd') mods.cdCut += Math.abs(flat);
    if (h.extra && h.extra.radius) mods.radius += h.extra.radius;
    if (h.extra && h.extra.dmg) mods.dmg += h.extra.dmg;
  }

  function setRelicLevel(lv) {
    const n = Math.max(0, Number(lv) || 0);
    if (n === relicLv) return;
    relicLv = n;
    if (!n) { autoT = 0; cd = 0; firstPos = true; }
    if (n > 0 && autoT > intervalV()) autoT = intervalV();
  }

  function clearField() {
    autoT = 0;
    cd = 0;
    swing = 0;
    firstPos = true;
    root.visible = false;
  }

  const snapshot = () => ({ mods: { ...mods }, shop: { ...shop }, cd, autoT });
  function restore(o) {
    if (!o) return;
    if (o.mods) Object.assign(mods, o.mods);
    if (o.shop) Object.assign(shop, o.shop);
    if (Number.isFinite(o.cd)) cd = o.cd;
    if (Number.isFinite(o.autoT)) autoT = o.autoT;
  }

  return {
    get owned() { return relicLv > 0; },
    get relicLv() { return relicLv; },
    get ready() { return relicLv > 0 && cd <= 0; },
    get cdLeft() { return cd; },
    get progress() { return 1 - cd / Math.max(0.01, cdMaxV()); },
    get lastFail() { return lastFail; },
    cdMax: cdMaxV,
    interval: intervalV,
    radius: radiusV,
    damage: dmgV,
    applyCard, setRelicLevel, setCdMul: (m) => { cdMul = Math.max(0.1, m || 1); },
    setRelicAmp: (a) => { amp = { dmg: 1, radius: 0, cd: 1, dur: 0, ...(a || {}) }; },
    setShop: (key) => { if (key === 'head' || key === 'grip') shop[key] = true; },
    bonuses: () => ({
      dmg: dmgV(), interval: intervalV(), radius: radiusV(), break: breakV(),
      born: bornMul(), cd: cdMaxV(),
    }),
    update, cast, clearField, snapshot, restore,
    state: () => ({ relicLv, cd, autoT, swing, mods: { ...mods }, shop: { ...shop } }),
  };
}
