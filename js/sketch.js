// ============================================================
// sketch.js —— 第十六关「钟楼画室」的场地机制：线稿 / 定稿（第 129 块）
// ============================================================
// 画室的地上会自己冒出一圈**铅笔线稿**：先是一圈很淡的手绘线（草稿），
// 两秒后「定稿」——线条变深、变实，同时圈里那块地被钉死。
//
//   · 线稿阶段（draft）：随便站，只是看得见的警告
//   · 定稿阶段（ink）：那一瞬间站在圈里的人会被钉住 1.2 秒 + 掉血
//   · 定稿后圈还在约 1.5 秒，然后擦掉，换下一个位置
//
// 它和第十三 / 十四关的场地是同一路「按时间收网」，但这次收的是**圆**不是线：
// 想安全就得在草稿变成定稿之前走出去，而不是等它落下来再闪。
//
// 另外还管画框怪（frame）的**囚笼**：框住主角之后，主角在框消失前出不去。
// 钳制放在 main 的位移之后（圆形边界钳制之后），按轴分离，速度对应轴归零。
//
// 零业务 import（和 spotlight.js / cutter.js / track.js 一套写法）：
// 自己建几何、自己算位置，业务侧只调 update() / 查询函数 / takeEvents()。
import * as THREE from '../lib/three.module.js?v=147';

const Y = 0.046;   // 贴地抬高，别和地面 z-fighting

// 铅笔线稿贴图：draft 是浅灰的双线手绘圈，ink 是压深的石墨实线 + 排线。
// 只有一张 256 的画布，两种模式各画一次，所有圈共用。
function makeSketchTexture(mode) {
  const S = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  const cx = S / 2, cy = S / 2, R = S * 0.36;
  const inkMode = mode === 'ink';

  // ① 主圈：故意画得不圆 —— 铅笔是手画的，不是机器印的
  //    用几段带抖动的弧拼起来，接缝处稍微出一点头。
  const segs = 9;
  for (let pass = 0; pass < (inkMode ? 1 : 2); pass++) {
    g.beginPath();
    for (let i = 0; i <= segs * 4; i++) {
      const a = (i / (segs * 4)) * Math.PI * 2 + (inkMode ? 0.02 : 0.06);
      const wob = Math.sin(i * 2.1 + pass * 1.7) * (inkMode ? 1.2 : 2.2);
      const rr = R + wob + (pass ? 2.4 : 0);
      const x = cx + Math.cos(a) * rr;
      const y = cy + Math.sin(a) * rr;
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    if (inkMode) {
      g.strokeStyle = 'rgba(30,30,36,0.92)';
      g.lineWidth = 7.2;
      g.lineCap = 'round';
    } else {
      g.strokeStyle = pass ? 'rgba(196,196,190,0.34)' : 'rgba(180,180,176,0.46)';
      g.lineWidth = pass ? 2.2 : 3.0;
      g.lineCap = 'round';
    }
    g.stroke();
  }

  // ② 收笔的小尾巴：草稿圈起笔 / 收笔那两下会出头
  if (!inkMode) {
    g.strokeStyle = 'rgba(186,186,180,0.40)';
    g.lineWidth = 2.6;
    g.lineCap = 'round';
    for (let k = 0; k < 3; k++) {
      const a = 0.4 + k * 2.1;
      const x = cx + Math.cos(a) * (R + 4);
      const y = cy + Math.sin(a) * (R + 4);
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(a + 0.9) * 14, y + Math.sin(a + 0.9) * 14);
      g.stroke();
    }
  }

  // ③ 定稿的排线：圈内靠边一小段一小段的短斜线（像上铅笔阴影）
  if (inkMode) {
    g.strokeStyle = 'rgba(38,38,44,0.30)';
    g.lineWidth = 2.0;
    for (let i = 0; i < 44; i++) {
      const a = (i / 44) * Math.PI * 2;
      const rr = R * (0.72 + (i % 5) * 0.05);
      const x = cx + Math.cos(a) * rr;
      const y = cy + Math.sin(a) * rr;
      g.beginPath();
      g.moveTo(x - 4, y + 5);
      g.lineTo(x + 5, y - 4);
      g.stroke();
    }
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createSketchSystem({ scene, arena = 19 } = {}) {
  let cfg = {
    arena,
    count: 1,              // 开局几圈
    radius: 1.55,          // 圈半径（世界单位）
    warn: 2.0,             // 线稿到定稿的秒数（玩家的反应时间）
    gap: 2.4,              // 一圈擦掉后隔多久冒下一圈
    inkLife: 1.6,          // 定稿后圈在地上留多久（钉 1.2 秒 + 余韵）
    pct: 0.06,             // 钉住时掉多少最大生命（按比例，不吃固定减伤）
    pin: 1.2,              // 定住秒数
    extraAt: [],           // [{ round: 6, add: 1 }, ...]
  };

  const group = new THREE.Group();
  group.visible = false;
  scene.add(group);

  const draftTex = makeSketchTexture('draft');
  const inkTex = makeSketchTexture('ink');

  // 每圈 = 一张贴地平面（draft / ink 两张贴图切换）+ 定稿时的一层淡填充
  const planes = [];
  let built = null;
  let t = 0;
  let round = 1;
  let spawnT = 0.8;         // 第一圈什么时候冒出来
  let serial = 0;
  const events = [];        // [{ kind:'pin', x, z, damage, sec }]

  function activeCount() {
    let n = cfg.count;
    for (const e of cfg.extraAt || []) if (round >= e.round) n += (e.add || 1);
    return Math.max(0, n);
  }

  function disposeBuilt() {
    if (!built) return;
    group.remove(built);
    built.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    built = null;
    planes.length = 0;
  }

  // 几何一次画够（count + extraAt 的全部增量，按整局最多值建），
  // ⚠️ 不能只建 activeCount()：setLevel 时先 build、再 setRound，那时 round 还是 1，
  //    只按当前回合建的话，第 6 回合 extraAt 要加圈时 planes 里根本没有空槽。
  function rebuild() {
    disposeBuilt();
    let total = cfg.count;
    for (const e of cfg.extraAt || []) total += (e.add || 1);
    total = Math.max(1, total);
    const root = new THREE.Group();
    const size = cfg.radius * 2.16;   // 贴图圆占画布 0.72，留一点手绘出头的余量
    const geo = new THREE.PlaneGeometry(size, size);
    for (let i = 0; i < total; i++) {
      const mat = new THREE.MeshBasicMaterial({
        map: draftTex, transparent: true, opacity: 0.0, depthWrite: false,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = Y;
      mesh.renderOrder = 3;
      mesh.visible = false;
      const fill = new THREE.Mesh(
        new THREE.CircleGeometry(cfg.radius * 0.94, 40).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({
          color: 0x3a3a44, transparent: true, opacity: 0.0,
          depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        })
      );
      fill.position.y = Y + 0.003;
      fill.renderOrder = 2;
      fill.visible = false;
      root.add(mesh, fill);
      planes.push({ mesh, fill, x: 0, z: 0, r: cfg.radius, phase: 'idle', t: 0, id: 0, born: 0 });
    }
    group.add(root);
    built = root;
  }

  function build(spec) {
    if (!spec) {
      clearCircles();
      group.visible = false;
      return;
    }
    cfg = { ...cfg, ...spec };
    if (spec.arena != null) cfg.arena = spec.arena;
    rebuild();
    group.visible = true;
    clearCircles();
    spawnT = 0.8;
  }

  function clearCircles() {
    for (const p of planes) {
      p.phase = 'idle';
      p.t = 0;
      p.mesh.visible = false;
      p.fill.visible = false;
      p.mesh.material.map = draftTex;
    }
    events.length = 0;
  }

  function reset() {
    t = 0;
    round = 1;
    serial = 0;
    spawnT = 0.8;
    clearCircles();
    clearFrames();
  }

  function setRound(r) { round = Math.max(1, r); }

  /** 在场地里挑一个离主角不太远的位置（逼玩家动，但不要直接叠在脚下） */
  function pickSpot(playerPos) {
    const lim = Math.max(1.4, cfg.arena - cfg.radius - 0.8);
    const px = playerPos ? playerPos.x : 0;
    const pz = playerPos ? playerPos.z : 0;
    for (let i = 0; i < 12; i++) {
      // 七成落在主角周围 2~7 格，三成全場随機
      let x, z;
      if (Math.random() < 0.7) {
        const a = Math.random() * Math.PI * 2;
        const d = 2.0 + Math.random() * 5.0;
        x = px + Math.cos(a) * d;
        z = pz + Math.sin(a) * d;
      } else {
        const a = Math.random() * Math.PI * 2;
        const d = Math.sqrt(Math.random()) * lim;
        x = Math.cos(a) * d;
        z = Math.sin(a) * d;
      }
      const rr = Math.hypot(x, z);
      if (rr > lim) { x = (x / rr) * lim; z = (z / rr) * lim; }
      // 离别的圈太近就重挑
      let ok = true;
      for (const p of planes) {
        if (p.phase === 'idle') continue;
        if (Math.hypot(x - p.x, z - p.z) < cfg.radius * 2.4) { ok = false; break; }
      }
      if (ok) return { x, z };
    }
    return { x: px, z: pz };
  }

  function spawnCircle(playerPos) {
    const free = planes.find((p) => p.phase === 'idle');
    if (!free) return;
    const s = pickSpot(playerPos);
    free.id = ++serial;
    free.x = s.x;
    free.z = s.z;
    free.phase = 'draft';
    free.t = 0;
    free.mesh.position.set(s.x, Y, s.z);
    free.mesh.material.map = draftTex;
    free.mesh.material.opacity = 0.5;
    free.mesh.visible = true;
    free.fill.visible = false;
  }

  function update(dt, { playerPos } = {}) {
    if (!group.visible) return;
    t += dt;

    // 空圈：按 gap 节拍补位
    const n = activeCount();
    const live = planes.filter((p) => p.phase !== 'idle').length;
    if (live < n) {
      spawnT -= dt;
      if (spawnT <= 0) {
        spawnCircle(playerPos);
        spawnT = cfg.gap;
      }
    }

    for (const p of planes) {
      if (p.phase === 'idle') continue;
      p.t += dt;
      if (p.phase === 'draft') {
        // 草稿在闪：越接近定稿闪得越快，最后一秒几乎是在催
        const k = Math.min(1, p.t / cfg.warn);
        p.mesh.material.opacity = 0.30 + 0.20 * Math.abs(Math.sin(p.t * (2.2 + k * 3.0)));
        if (p.t >= cfg.warn) {
          p.phase = 'ink';
          p.t = 0;
          p.mesh.material.map = inkTex;
          p.mesh.material.opacity = 0.92;
          p.fill.visible = true;
          p.fill.material.opacity = 0.16;
          // 定稿那一瞬：圈里的人被钉住 + 掉血
          if (playerPos) {
            const dx = playerPos.x - p.x, dz = playerPos.z - p.z;
            if (dx * dx + dz * dz <= (cfg.radius + 0.28) * (cfg.radius + 0.28)) {
              events.push({
                kind: 'pin', x: p.x, z: p.z, id: p.id,
                damage: cfg.pct, sec: cfg.pin,
              });
            }
          }
        }
      } else {
        // 定稿：深线维持一小段，最后 0.35 秒淡出
        const left = cfg.inkLife - p.t;
        p.mesh.material.opacity = 0.92 * Math.min(1, left / 0.35);
        p.fill.material.opacity = 0.16 * Math.min(1, left / 0.35);
        if (p.t >= cfg.inkLife) {
          p.phase = 'idle';
          p.mesh.visible = false;
          p.fill.visible = false;
          spawnT = Math.min(spawnT, cfg.gap);
        }
      }
    }
  }

  /** 取出这一帧发生的定稿事件（main 负责结算伤害与定身） */
  function takeEvents() {
    if (!events.length) return [];
    const out = events.slice();
    events.length = 0;
    return out;
  }

  // ---------------- 画框怪的囚笼 ----------------
  // 框住主角：一个正方形，half 是半边长。框消失前主角出不去。
  let frames = [];

  const frameGroup = new THREE.Group();
  frameGroup.visible = false;
  scene.add(frameGroup);

  function buildFrame(half) {
    const g = new THREE.Group();
    const barMat = new THREE.MeshBasicMaterial({
      color: 0xd8c79a, transparent: true, opacity: 0.78,
      depthWrite: false, side: THREE.DoubleSide,
    });
    const w = 0.10, h = 1.25;
    // 四根立柱 + 四边横梁（上下各一圈），看起来就是一个悬浮的画框
    const post = new THREE.BoxGeometry(w, h, w);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const m = new THREE.Mesh(post, barMat);
      m.position.set(sx * half, h / 2, sz * half);
      g.add(m);
    }
    const span = new THREE.BoxGeometry(half * 2 + w, w, w);
    const spanZ = new THREE.BoxGeometry(w, w, half * 2 + w);
    for (const hy of [0.18, h]) {
      const a = new THREE.Mesh(span, barMat); a.position.set(0, hy, -half); g.add(a);
      const b = new THREE.Mesh(span, barMat); b.position.set(0, hy, half); g.add(b);
      const c = new THREE.Mesh(spanZ, barMat); c.position.set(-half, hy, 0); g.add(c);
      const d = new THREE.Mesh(spanZ, barMat); d.position.set(half, hy, 0); g.add(d);
    }
    // 地面上的框线（贴地一圈，告诉玩家「这是边界」）
    const floorMat = new THREE.MeshBasicMaterial({
      color: 0x9a8250, transparent: true, opacity: 0.5,
      depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    const fw = new THREE.PlaneGeometry(half * 2, 0.12);
    for (const sz of [-1, 1]) {
      const m = new THREE.Mesh(fw, floorMat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(0, Y + 0.004, sz * half);
      m.renderOrder = 4;
      g.add(m);
    }
    const fz = new THREE.PlaneGeometry(0.12, half * 2);
    for (const sx of [-1, 1]) {
      const m = new THREE.Mesh(fz, floorMat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(sx * half, Y + 0.004, 0);
      m.renderOrder = 4;
      g.add(m);
    }
    g.visible = false;
    frameGroup.add(g);
    return { node: g, barMat, floorMat };
  }

  // 一个模板按最大 half 建，用时缩放 —— 囚笼尺寸固定（1.8 格半边长），
  // 缩放也只影响视觉，逻辑用 half 值算。
  const frameTpl = buildFrame(1.8);
  frameGroup.visible = true;

  function trapFrame({ x, z, half = 1.8, life = 3.0 } = {}) {
    const id = ++serial;
    const slot = buildFrame(half);
    slot.node.position.set(x, 0, z);
    slot.node.visible = true;
    frames.push({ id, x, z, half, t: 0, life, ...slot });
    frameGroup.visible = true;
    return id;
  }

  function clearFrames() {
    for (const f of frames) {
      frameGroup.remove(f.node);
      f.node.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    }
    frames = [];
  }

  /**
   * 把主角钳在囚笼里。main 在圆形边界钳制之后调用：
   *   const c = sketch.clampPoint(pos.x, pos.z);
   *   pos.x = c.x; pos.z = c.z;
   *   if (c.xClamped) vel.x = 0; if (c.zClamped) vel.z = 0;
   */
  function clampPoint(x, z) {
    let out = { x, z, xClamped: false, zClamped: false };
    for (const f of frames) {
      const lim = Math.max(0, f.half - 0.16);
      if (Math.abs(out.x - f.x) > lim) {
        out.x = f.x + Math.sign(out.x - f.x) * lim;
        out.xClamped = true;
      }
      if (Math.abs(out.z - f.z) > lim) {
        out.z = f.z + Math.sign(out.z - f.z) * lim;
        out.zClamped = true;
      }
    }
    return out;
  }

  function updateFrames(dt) {
    if (!frames.length) return;
    for (const f of frames) {
      f.t += dt;
      const left = f.life - f.t;
      const fade = Math.min(1, left / 0.4);
      f.barMat.opacity = 0.78 * fade;
      f.floorMat.opacity = 0.5 * fade;
    }
    const alive = frames.filter((f) => f.t < f.life);
    if (alive.length !== frames.length) {
      for (const f of frames) {
        if (f.t >= f.life) {
          frameGroup.remove(f.node);
          f.node.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
        }
      }
      frames = alive;
    }
    if (!frames.length) frameGroup.visible = false;
  }

  return {
    build, reset, setRound, update, takeEvents,
    get enabled() { return group.visible; },
    get count() { return activeCount(); },
    /** 调试 / 测试用：当前每一圈的位置、半径与相位 */
    list() {
      return planes.filter((p) => p.phase !== 'idle').map((p) => ({
        id: p.id, x: +p.x.toFixed(2), z: +p.z.toFixed(2), r: cfg.radius,
        phase: p.phase, t: +p.t.toFixed(2),
      }));
    },
    state() {
      return {
        enabled: group.visible,
        count: activeCount(),
        round,
        radius: cfg.radius,
        warn: cfg.warn,
        pin: cfg.pin,
        pct: cfg.pct,
        circles: this.list(),
        frames: frames.map((f) => ({
          id: f.id, x: +f.x.toFixed(2), z: +f.z.toFixed(2),
          half: f.half, t: +f.t.toFixed(1), life: f.life,
        })),
      };
    },
    // —— 囚笼 ——
    trapFrame, clearFrames, clampPoint, updateFrames,
    get frameCount() { return frames.length; },
    // 调试：立刻定稿（测试不必真等 2 秒）；返回定稿的圈数
    debugInk() {
      let n = 0;
      for (const p of planes) {
        if (p.phase === 'draft') { p.t = cfg.warn; n++; }
      }
      return n;
    },
  };
}
