// ============================================================
// bell.js —— 第十七关「钟楼顶」的场地机制：整点钟声（第 130 块）
// ============================================================
// 钟楼顶的北沿挂着一口大钟。它按节拍自己响：
//
//   · 钟响前 1 秒：钟身亮起、脚下那圈警示环往里收（听得见「要响了」）
//   · 钟响那一下：**全场定住 0.6 秒**（主角也算），所有怪的脚步停住；
//     余波把主角身边 3 格内的怪往外推开 —— 这是玩家唯一的「解围」窗口
//   · 响过之后：按 interval 秒（随回合略缩短）等下一声
//
// 因此这一关的节奏不是「躲弹道」，而是「卡在钟响的缝里输出」：
// 钟一响连你自己也动不了，输出全断；但被围住时那一下又刚好救命。
//
// 零业务 import（和 sketch.js / spotlight.js 一套写法）：
// 自己建几何、自己算位置，业务侧只调 update() / state() / takeEvents()。
import * as THREE from '../lib/three.module.js?v=147';

const Y = 0.05;          // 贴地抬高，别和地面 z-fighting

export function createBellSystem({ scene, arena = 19 } = {}) {
  let cfg = {
    arena,
    interval: 9.0,        // 两声钟响之间隔多久
    minInterval: 6.0,     // 回合再往后也不会比这个更密
    warn: 1.0,            // 响之前预警多久
    hold: 0.6,            // 全场定住多久
    push: 3.0,            // 余波把主角身边几格内的怪推开
  };

  const group = new THREE.Group();
  group.visible = false;
  scene.add(group);

  const zBell = -(Math.max(3, arena) + 1.0);   // 北沿，场地外 —— 不挡路

  // ---- 北沿的钟架（石台 + 两根立柱 + 横梁 + 铜钟）----
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x3a3630, roughness: 0.92, metalness: 0.06 });
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x2a211a, roughness: 0.85, metalness: 0.04 });
  const bronzeMat = new THREE.MeshStandardMaterial({
    color: 0x8a6a2a, emissive: 0x3a2408, emissiveIntensity: 0.25,
    roughness: 0.42, metalness: 0.72,
  });
  bronzeMat.emissiveIntensity = 0.25;

  const base = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.18, 0.36, 14), stoneMat);
  base.position.set(0, 0.18, zBell);
  group.add(base);

  for (const sx of [-0.98, 0.98]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.24, 4.4, 0.26), woodMat);
    post.position.set(sx, 2.55, zBell);
    group.add(post);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.28, 0.34), woodMat);
  beam.position.set(0, 4.72, zBell);
  group.add(beam);

  // 钟身：上小下大的圆台 + 顶盖 + 钟舌，整体挂在一根横轴上前后摆
  const pivot = new THREE.Group();
  pivot.position.set(0, 4.62, zBell);
  group.add(pivot);
  const bellBody = new THREE.Mesh(
    new THREE.CylinderGeometry(0.34, 0.62, 0.94, 18, 1, true),
    bronzeMat
  );
  bellBody.material.side = THREE.DoubleSide;
  bellBody.position.y = -0.55;
  pivot.add(bellBody);
  const bellCap = new THREE.Mesh(new THREE.SphereGeometry(0.35, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), bronzeMat);
  bellCap.position.y = -0.08;
  bellCap.scale.y = 0.55;
  pivot.add(bellCap);
  const clapper = new THREE.Mesh(
    new THREE.SphereGeometry(0.17, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0x4a3a1a, roughness: 0.6, metalness: 0.5 })
  );
  clapper.position.y = -0.95;
  pivot.add(clapper);

  // ---- 地面：预警环（往里收）+ 钟响冲击环（往外扩）----
  const warnRing = new THREE.Mesh(
    new THREE.RingGeometry(0.9, 1.0, 64),
    new THREE.MeshBasicMaterial({
      color: 0xffd86b, transparent: true, opacity: 0,
      depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    })
  );
  warnRing.rotation.x = -Math.PI / 2;
  warnRing.position.set(0, Y + 0.01, zBell);
  warnRing.renderOrder = 3;
  warnRing.visible = false;
  group.add(warnRing);

  const pulse = new THREE.Mesh(
    new THREE.RingGeometry(0.92, 1.0, 64),
    new THREE.MeshBasicMaterial({
      color: 0xffe6a0, transparent: true, opacity: 0,
      depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    })
  );
  pulse.rotation.x = -Math.PI / 2;
  pulse.position.set(0, Y + 0.02, zBell);
  pulse.renderOrder = 4;
  pulse.visible = false;
  group.add(pulse);

  let next = cfg.interval;
  let round = 1;
  let pulseT = -1;
  let swingT = -1;
  let swingAmp = 0;
  const events = [];

  function intervalNow() {
    const shrink = Math.max(0, round - 1) * 0.32;
    return Math.max(cfg.minInterval, cfg.interval - shrink);
  }

  function build(spec) {
    if (!spec) {
      group.visible = false;
      events.length = 0;
      return;
    }
    cfg = { ...cfg, ...spec };
    if (spec.arena != null) cfg.arena = spec.arena;
    group.visible = true;
    reset();
  }

  function reset() {
    round = 1;
    next = intervalNow();
    pulseT = -1;
    swingT = -1;
    swingAmp = 0;
    pulse.visible = false;
    warnRing.visible = false;
    bronzeMat.emissiveIntensity = 0.25;
    events.length = 0;
  }

  function setRound(r) { round = Math.max(1, r); }

  function toll() {
    events.push({ kind: 'toll', hold: cfg.hold, push: cfg.push });
    next = intervalNow();
    pulseT = 0;
    swingT = 0;
    swingAmp = 1.0;
    pulse.visible = true;
    warnRing.visible = false;
  }

  function update(dt) {
    if (!group.visible) return;

    next -= dt;

    // ---- 预警：进入最后一秒，钟身亮、警示环往里收 ----
    const w = cfg.warn;
    if (next <= w) {
      const k = Math.max(0, Math.min(1, 1 - next / w));   // 0 → 1
      warnRing.visible = true;
      const s = 3.2 - k * 2.5;
      warnRing.scale.set(s, s, 1);
      warnRing.material.opacity = 0.16 + k * 0.5;
      bronzeMat.emissiveIntensity = 0.25 + k * 1.35;
    } else if (next > w && warnRing.visible) {
      warnRing.visible = false;
      bronzeMat.emissiveIntensity = 0.25;
    }

    if (next <= 0) toll();

    // ---- 钟响的冲击环：从钟架往外扫过整个场地 ----
    if (pulseT >= 0) {
      pulseT += dt;
      const k = pulseT / 1.15;
      if (k >= 1) {
        pulseT = -1;
        pulse.visible = false;
      } else {
        const r = 1.2 + k * (cfg.arena * 2.3);
        pulse.scale.set(r, r, 1);
        pulse.material.opacity = (1 - k) * 0.55;
      }
    }

    // ---- 钟摆：被敲一下之后来回摆，慢慢停 ----
    if (swingT >= 0) {
      swingT += dt;
      const damp = Math.max(0, 1 - swingT / 2.2);
      swingAmp *= Math.exp(-dt * 2.1);
      pivot.rotation.x = Math.sin(swingT * 4.6) * 0.26 * swingAmp * damp;
      if (swingT > 2.2 || swingAmp < 0.02) {
        swingT = -1;
        pivot.rotation.x = 0;
      }
    }
  }

  function takeEvents() {
    if (!events.length) return [];
    const out = events.slice();
    events.length = 0;
    return out;
  }

  function state() {
    return {
      on: !!group.visible,
      next: +Math.max(0, next).toFixed(2),
      interval: +intervalNow().toFixed(2),
      warn: cfg.warn,
      hold: cfg.hold,
      push: cfg.push,
      inWarn: next <= cfg.warn,
    };
  }

  // 调试 / 测试：不用真等到整点，直接把下一声提前到现在
  function debugToll() {
    next = 0.0001;
    return true;
  }

  return {
    build, reset, setRound, update, state, takeEvents, debugToll,
    get enabled() { return !!group.visible; },
    get count() { return 1; },
    bellPos: () => ({ x: 0, z: zBell }),
  };
}
