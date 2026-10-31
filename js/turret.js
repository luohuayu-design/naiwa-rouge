// ============================================================
// turret.js —— 自动炮台（第 13 块，商店新品「弩炮台」）
//
// 玩法（用户定案）：
//   · 商店买下后在主角附近立一台炮台，**本局永久存在**（不会消失、不占格子）；
//   · 炮台自己索敌：射程内最近的活怪，炮头转向它；
//   · 弹道逻辑与骷髅投手的骨刀**完全一致** —— 直线、出手瞬间的目标位置、
//     不追踪 —— 但飞得快得多（骨刀 5.6 → 弩箭 10），普通走位基本躲不开，
//     所以「基本命中」；怪的移速再快也快不过 10 单位/秒的弩箭。
//   · 上限 3 台（itemLocked 里拦），买第 4 台时店员会告诉你放不下了。
//
// 模型（第 24 块）：CC0 低模拼装 —— Quaternius 木箱（压扁做基座）+ 长弓横放
// 做弩臂 + 上膛的箭 + 骨头点缀（均 CC0），加载失败时退回程序化炮台（外观稍简，
// 逻辑完全一致）。深夜里靠自发光宝珠看清楚。
// ============================================================
import * as THREE from '../lib/three.module.js?v=143';
import { GLTFLoader } from '../lib/jsm/loaders/GLTFLoader.js?v=143';
import { withV } from './assetUrl.js?v=143';   // 第 80 块：glb 带版本号，SW 才走缓存优先
import { distance2D } from './stats.js?v=143';
import audio from './audio.js?v=143';

// ---------------- 可调参数（平衡都在这里） ----------------
export const TURRET = {
  RANGE: 6.5,          // 索敌半径（比主角攻击范围大一圈多）
  FIRE_INTERVAL: 1.5,  // 每台炮台的射击间隔（秒）
  DAMAGE: 1.0,         // 每发弩箭伤害（直线命中一次）
  BOLT_SPEED: 10,      // 弩箭飞行速度（骨刀 5.6 → 弩箭 10，快到基本躲不开）
  BOLT_HIT_R: 0.55,    // 弩箭判定半径（加怪的碰撞半径，实际命中圈更大）
  BOLT_MAX_DIST: 16,   // 飞行最大距离（出场地就散掉）
  BOLT_Y: 0.85,        // 飞行高度
  MAX_COUNT: 3,        // 场上最多几台
  PLACE_DIST: 1.6,     // 放置点离主角的距离
};

export function createTurretSystem({ scene, fx, enemies }) {
  const list = [];       // { group, head, x, z, cd }
  const bolts = [];      // { mesh, vx, vz, x, z, dist, dmg }

  // ---------------- 程序化模型 ----------------
  const baseGeo = new THREE.CylinderGeometry(0.34, 0.46, 0.34, 10);
  const headGeo = new THREE.BoxGeometry(0.42, 0.30, 0.58);
  const barrelGeo = new THREE.CylinderGeometry(0.075, 0.09, 0.62, 8);
  const woodMat = new THREE.MeshLambertMaterial({ color: 0x7a5a38 });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x3a2f24 });
  const glowMat = new THREE.MeshBasicMaterial({ color: 0x8ef2ff });
  const boltGeo = new THREE.ConeGeometry(0.07, 0.42, 6);
  const boltMat = new THREE.MeshBasicMaterial({ color: 0xbff3ff });

  // ---------------- CC0 模型版（第 24 块） ----------------
  // 木箱压扁做基座，长弓横放做弩臂（放不放箭都行——夜里主要看发光宝珠），
  // 全部塞进名为 tHead 的组里随索敌旋转。加载好之前 buildTurret 先走程序化。
  let tpl = null;            // { group, head } 模板（clone 出每台炮台）
  (async () => {
    try {
      const loader = new GLTFLoader();
      const [crate, bow, bolt, bone] = await Promise.all([
        loader.loadAsync(withV('assets/props/turret-crate.glb')),
        loader.loadAsync(withV('assets/props/ballista-bow.glb')),
        loader.loadAsync(withV('assets/props/ballista-bolt.glb')),
        loader.loadAsync(withV('assets/props/bone-deco.glb')),
      ]);
      // fit：等比缩到目标尺寸并把包围盒中心挪回原点
      const fit = (obj, target) => {
        const box = new THREE.Box3().setFromObject(obj);
        const size = new THREE.Vector3(); box.getSize(size);
        const k = target / Math.max(size.x, size.y, size.z);
        obj.scale.setScalar(k);
        const b2 = new THREE.Box3().setFromObject(obj);
        const c = new THREE.Vector3(); b2.getCenter(c);
        obj.position.sub(c);
        return obj;
      };

      const group = new THREE.Group();
      // 基座：压扁的木箱（⚠️ Quaternius 根节点自带旋转，只用 scale/position，转向全靠外层组）
      const base = fit(crate.scene, 1.0);
      base.scale.y *= 0.38;
      base.position.y = 0.19;
      group.add(base);

      const head = new THREE.Group();       // 旋转部分
      head.name = 'tHead';
      // 弩臂：长弓横放（弓根节点自带 -90°X 旋转，长轴本立着，用外层组放倒）
      const prod = fit(bow.scene, 1.45);
      const prodG = new THREE.Group();
      prodG.add(prod);
      prodG.rotation.z = -Math.PI / 2;
      prodG.position.set(0, 0.60, -0.02);
      head.add(prodG);
      // 上膛的箭：长轴本就沿 Z，只调头让箭头朝前
      const boltM = fit(bolt.scene, 0.85);
      const boltG = new THREE.Group();
      boltG.add(boltM);
      boltG.rotation.y = Math.PI;
      boltG.position.set(0, 0.62, 0.10);
      head.add(boltG);
      // 弓和箭都给一点自发光：深夜里不至于糊成一团
      [prodG, boltG].forEach((g) => g.traverse((o) => {
        if (o.isMesh && o.material && 'emissive' in o.material) {
          o.material.emissive = new THREE.Color(0x2a2418);
          o.material.emissiveIntensity = 0.6;
        }
      }));
      // 自发光宝珠：深夜里的「它活着」信号
      const gem = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), glowMat);
      gem.position.set(0, 1.12, -0.12);
      head.add(gem);
      group.add(head);

      // 点缀：基座边上一根骨头
      const deco = fit(bone.scene, 0.42);
      const decoG = new THREE.Group();
      decoG.add(deco);
      decoG.rotation.z = 0.5;
      decoG.position.set(0.52, 0.10, 0.30);
      group.add(decoG);

      tpl = { group, head };
    } catch (e) {
      console.warn('[turret] 模型加载失败，用程序化外观', e && e.message);
    }
  })();

  function buildTurret() {
    if (tpl) {
      const group = tpl.group.clone();
      const head = group.getObjectByName('tHead') || group;
      return { group, head };
    }
    const group = new THREE.Group();
    const base = new THREE.Mesh(baseGeo, woodMat);
    base.position.y = 0.17;
    base.castShadow = true;
    const head = new THREE.Group();
    const body = new THREE.Mesh(headGeo, darkMat);
    body.position.y = 0.50;
    const barrel = new THREE.Mesh(barrelGeo, woodMat);
    barrel.rotation.x = Math.PI / 2;      // 炮管沿 -Z 指向前方
    barrel.position.set(0, 0.52, -0.30);
    const gem = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 6), glowMat);
    gem.position.set(0, 0.70, -0.12);
    head.add(body, barrel, gem);
    group.add(base, head);
    return { group, head };
  }

  // 买下后放置：贴着主角身后错开角度，几台之间不重叠
  function spawn(playerPos) {
    if (list.length >= TURRET.MAX_COUNT) return null;
    const idx = list.length;
    const a = Math.PI * (0.25 + idx * 0.5) + Math.random() * 0.4;   // 45°/135°/225° 起步
    const { group, head } = buildTurret();
    const x = playerPos.x + Math.cos(a) * TURRET.PLACE_DIST;
    const z = playerPos.z + Math.sin(a) * TURRET.PLACE_DIST;
    group.position.set(x, 0, z);
    scene.add(group);
    const turret = { group, head, x, z, cd: 0.6, angle: 0 };
    list.push(turret);
    if (fx) fx.ring({ x, z }, { from: 0.2, to: 1.2, color: 0x8ef2ff, life: 0.5, opacity: 0.8, y: 0.05 });
    audio.sfx('buy');
    return turret;
  }

  // 射一发：目标 = 炮台射程内最近的活怪；弹道 = 出手瞬间目标的位置（直线）
  function fire(t, ctx) {
    const foes = enemies.list.filter((e) =>
      enemies.hittable(e) && !e.ghostHidden   // 雾鬼隐身：炮台当它不存在（第 35 块）；躺尸重启体不打（第 97 块）
      && distance2D(t, e.pos) <= TURRET.RANGE
    );
    if (!foes.length) return;
    let best = foes[0];
    let bestD = Infinity;
    for (const e of foes) {
      const d = distance2D(t, e.pos);
      if (d < bestD) { bestD = d; best = e; }
    }
    const dx = best.pos.x - t.x;
    const dz = best.pos.z - t.z;
    const len = Math.max(0.001, Math.hypot(dx, dz));
    const mesh = new THREE.Mesh(boltGeo, boltMat);
    mesh.position.set(t.x, TURRET.BOLT_Y, t.z);
    // 锥体默认指向 +Y：先绕 Y 转向目标方位，再把锥尖从 +Y 扳到水平 +Z
    mesh.rotation.set(0, Math.atan2(dx, dz), 0);
    mesh.rotateX(Math.PI / 2);
    mesh.frustumCulled = false;
    scene.add(mesh);
    bolts.push({
      mesh, x: t.x, z: t.z, dist: 0, dmg: TURRET.DAMAGE,
      vx: (dx / len) * TURRET.BOLT_SPEED,
      vz: (dz / len) * TURRET.BOLT_SPEED,
    });
    audio.sfx('turretShot', { vol: 0.9 });   // 第 25 块：专用的短促机括声（不再蹭万剑齐发）
  }

  // ---------------- 每帧推进 ----------------
  function update(dt, { playerPos } = {}) {
    // 炮台待机：炮头缓慢转向目标；没目标就慢速空转（看得见「它活着」）
    for (const t of list) {
      t.cd -= dt;
      if (t.cd <= 0) {
        t.cd = TURRET.FIRE_INTERVAL;
        fire(t);
      }
      // 炮头朝向：射程内最近怪，否则回到初始角
      let target = null;
      let bestD = Infinity;
      for (const e of enemies.list) {
        if (e.state === 'dead' || e.state === 'spawn' || e.ghostHidden) continue;
        const d = distance2D(t, e.pos);
        if (d <= TURRET.RANGE && d < bestD) { bestD = d; target = e; }
      }
      const want = target
        ? Math.atan2(target.pos.x - t.x, target.pos.z - t.z)
        : t.angle;
      t.angle = want;
      t.head.rotation.y = want + Math.PI;   // 炮管朝 -Z，补半圈
    }

    // 弩箭飞行：直线、不追踪；撞到任何活怪就结算（骨刀同款逻辑）
    for (let i = bolts.length - 1; i >= 0; i--) {
      const b = bolts[i];
      const step = Math.hypot(b.vx, b.vz) * dt;
      b.x += b.vx * dt;
      b.z += b.vz * dt;
      b.dist += step;
      b.mesh.position.x = b.x;
      b.mesh.position.z = b.z;

      let hit = null;
      for (const e of enemies.list) {
        if (e.state === 'dead' || e.state === 'spawn' || e.ghostHidden) continue;
        if (distance2D(b, e.pos) <= TURRET.BOLT_HIT_R + 0.35) { hit = e; break; }
      }
      const gone = b.dist >= TURRET.BOLT_MAX_DIST;
      if (hit || gone) {
        if (hit) {
          enemies.takeDamage(hit, b.dmg, false, { cls: 'phys' });
          if (fx) fx.hit(new THREE.Vector3(hit.pos.x, 0.7, hit.pos.z), 0x8ef2ff);
        }
        scene.remove(b.mesh);
        bolts.splice(i, 1);
      }
    }
    void playerPos;
  }

  function reset() {
    for (const t of list) scene.remove(t.group);
    list.length = 0;
    for (const b of bolts) scene.remove(b.mesh);
    bolts.length = 0;
  }

  // 存档续玩（第 17 块）：按存档坐标重建炮台（不走 spawn 的随机摆位与音效）
  function spawnAt(x, z) {
    if (list.length >= TURRET.MAX_COUNT) return null;
    const { group, head } = buildTurret();
    group.position.set(x, 0, z);
    scene.add(group);
    const turret = { group, head, x, z, cd: 0.6, angle: 0 };
    list.push(turret);
    return turret;
  }

  function restore(saved) {
    reset();
    let n = 0;
    for (const p of (Array.isArray(saved) ? saved : []).slice(0, TURRET.MAX_COUNT)) {
      if (spawnAt(Number(p.x) || 0, Number(p.z) || 0)) n++;
    }
    return n;
  }

  return {
    spawn, spawnAt, update, reset, restore,
    count: () => list.length,
    boltCount: () => bolts.length,
    list: () => list.map((t) => ({ x: t.x, z: t.z })),
  };
}
