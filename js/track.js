// ============================================================
// 第十三关「焦土操场」的环形跑道（第 123 块）
// ============================================================
// 场地中央套一条塑胶跑道：站上去**自己更快，怪也更快**（1.35 / 1.25），
// 还带一点点切向推力（push = 0.42 格/秒，约等于移速的一成）。
//
// 为什么是「两边都加速」而不是只给玩家：只给玩家就是白捡一个永久加速带，
// 最优解会退化成「永远绕圈跑」。两边一起抬之后，跑道的意义变成
// **换一种走位**：你在这条带上比在草地上更快，但敌人也会从切线方向抄近路堵你。
// 推力刻意做得很轻 —— 单摇杆里被场地推着走的手感最忌讳「跟摇杆打架」，
// 0.42 只是让你在带上跑的时候明显「顺」一点，方向权始终在玩家手里。
//
// 零 import、纯注入（和 traffic.js / fog.js 一套写法）：自己建几何、自己画流光，
// 业务侧只调 update() 和 sample()。
import * as THREE from '../lib/three.module.js?v=145';

// 不在带上时统一返回这一份（调用方可以无条件相乘，不用判空）
const OFF = { on: false, mul: 1, push: 0, tx: 0, tz: 0 };

// 不在带上时统一返回这一份（调用方可以无条件相乘，不用判空）

export function createTrackSystem({
  scene,
  inner = 6.4,          // 内半径
  outer = 8.8,          // 外半径
  playerMul = 1.35,     // 玩家在带上的移速乘数
  enemyMul = 1.25,      // 敌人在带上的移速乘数
  push = 0.42,          // 切向推力（格/秒）
  dir = 1,              // +1 = 逆时针（俯视角下顺表针为负）
  color = 0x8c4a38,     // 塑胶跑道的暗红
  flowColor = 0xffd9a0, // 流光暖白
} = {}) {
  const group = new THREE.Group();
  group.visible = false;
  scene.add(group);

  let cfg = { inner, outer, playerMul, enemyMul, push, dir };
  let built = null;
  let flow = [];
  let t = 0;

  const Y = 0.03;          // 贴地抬高一点，别和地面 z-fighting（traffic 用的是同量级）
  const flowMat = new THREE.MeshBasicMaterial({
    color: flowColor, transparent: true, opacity: 0.42, depthWrite: false,
  });

  function rebuild() {
    if (built) {
      group.remove(built.root);
      built.root.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
      });
      built = null;
    }
    flow = [];
    const root = new THREE.Group();

    // 跑道本体：一条环带
    const band = new THREE.Mesh(
      new THREE.RingGeometry(cfg.inner, cfg.outer, 96),
      new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide,
      })
    );
    band.rotation.x = -Math.PI / 2;
    band.position.y = Y;
    band.renderOrder = 2;
    root.add(band);

    // 两条分道线：内外沿各一条细白环
    for (const r of [cfg.inner + 0.12, cfg.outer - 0.12]) {
      const line = new THREE.Mesh(
        new THREE.RingGeometry(r - 0.04, r + 0.04, 96),
        new THREE.MeshBasicMaterial({
          color: 0xf2e6d0, transparent: true, opacity: 0.30, depthWrite: false, side: THREE.DoubleSide,
        })
      );
      line.rotation.x = -Math.PI / 2;
      line.position.y = Y + 0.002;
      line.renderOrder = 3;
      root.add(line);
    }

    // 流光：沿环摆一圈短箭头，整组慢慢自转 —— 让人一眼看出「这条带是有方向的」
    const N = 30;
    const arrow = new THREE.PlaneGeometry(0.34, 0.10);
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const r = (cfg.inner + cfg.outer) / 2;
      const m = new THREE.Mesh(arrow, flowMat);
      m.position.set(Math.sin(a) * r, Y + 0.004, Math.cos(a) * r);
      m.rotation.x = -Math.PI / 2;
      // 平面绕 -x 摊平以后，绕自身 z 转 = 在世界里指向切线方向
      m.rotation.z = -a - Math.PI / 2 * cfg.dir;
      m.renderOrder = 4;
      flow.push(m);
      root.add(m);
    }

    group.add(root);
    built = { root };
  }

  function setEnabled(on) {
    group.visible = !!on;
    if (on && !built) rebuild();
  }

  /** 换参数（不重建几何的话下一帧就能看到新数值，但半径变了要重画） */
  function configure(next = {}) {
    cfg = { ...cfg, ...next };
    rebuild();
  }

  /**
   * 换关入口（和 traffic.build / fog.build 同一套写法）：
   * 传 null / undefined = 这一关没有跑道，整条带藏起来，sample() 全部返回原值。
   */
  function build(spec) {
    if (!spec) {
      group.visible = false;
      return;
    }
    configure(spec);
    group.visible = true;
  }

  function reset() {
    t = 0;
  }

  /**
   * 查一个世界坐标在不在跑道上。
   * 返回 { on, mul, push, tx, tz }：tx/tz 是切向单位向量（已乘 dir）。
   * 不在带上时 mul = 1、push = 0，调用方可以无条件相乘。
   */
  function sample(x, z) {
    if (!group.visible) return OFF;
    const r = Math.hypot(x, z);
    if (r < cfg.inner || r > cfg.outer || r < 1e-4) return OFF;
    // 切向：半径方向的法向旋转 90°，再按 dir 定符号
    const tx = (-z / r) * cfg.dir;
    const tz = (x / r) * cfg.dir;
    return { on: true, mul: cfg.playerMul, push: cfg.push, tx, tz };
  }

  /** 敌人侧的移速乘数（只判断在不在带上，不推） */
  function enemyMulAt(x, z) {
    if (!group.visible) return 1;
    const r = Math.hypot(x, z);
    return (r >= cfg.inner && r <= cfg.outer) ? cfg.enemyMul : 1;
  }

  function update(dt) {
    if (!group.visible) return;
    t += dt;
    // 流光慢慢绕场转：0.22 圈/秒的观感，不抢眼睛
    const spin = t * 0.22 * cfg.dir;
    for (let i = 0; i < flow.length; i++) {
      const a = (i / flow.length) * Math.PI * 2 + spin;
      const r = (cfg.inner + cfg.outer) / 2;
      const m = flow[i];
      m.position.set(Math.sin(a) * r, m.position.y, Math.cos(a) * r);
      m.rotation.z = -a - Math.PI / 2 * cfg.dir;
    }
    // 呼吸：整圈一起亮暗（材质是共享的，逐箭头改会互相覆盖）
    flowMat.opacity = 0.26 + 0.16 * (0.5 + 0.5 * Math.sin(t * 2));
  }

  return {
    build, setEnabled, configure, reset, sample, enemyMulAt, update,
    get enabled() { return group.visible; },
    get spec() { return { ...cfg }; },
  };
}

