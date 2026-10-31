// ============================================================
// traffic.js —— 第十二关「三幻神驿站」的配送车流（第 116 块）
//
// 这不是又一块只伤玩家的地板：车会撞人，也会撞怪。玩家可以躲开，
// 也可以借击退 / 减速把怪留在车道里。预警和碰撞共用 lanes / width，
// 不许出现「线画在这里、车却撞在那里」。
// ============================================================
import * as THREE from '../lib/three.module.js?v=142';

export const TRAFFIC_DEFAULTS = {
  lanes: [-4.5, 4.5],
  width: 2.4,
  warn: 2.2,
  speed: 18.0,
  gap: 10.5,
  first: 4.0,
  damage: 2.0,
  enemyPct: 0.36,
  doubleFrom: 13,
};

export function trafficLaneHit(x, z, vehicleX, laneZ, width, radius = 0) {
  return Math.abs(z - laneZ) <= width * 0.5 + radius * 0.35
    && Math.abs(x - vehicleX) <= 1.35 + radius;
}

function makeVan() {
  const g = new THREE.Group();
  const yellow = new THREE.MeshLambertMaterial({ color: 0xf2c14e, emissive: 0x4a2c08 });
  const dark = new THREE.MeshLambertMaterial({ color: 0x25262b });
  const glass = new THREE.MeshBasicMaterial({ color: 0x9ed8e8 });
  const box = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.15, 1.35), yellow);
  box.position.set(-0.35, 0.88, 0);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.95, 1.30), yellow);
  cab.position.set(1.05, 0.72, 0);
  const wind = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.43, 0.92), glass);
  wind.position.set(1.54, 0.92, 0);
  g.add(box, cab, wind);
  for (const x of [-0.95, 0.95]) {
    for (const z of [-0.67, 0.67]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.16, 12), dark);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(x, 0.27, z);
      g.add(wheel);
    }
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
  return g;
}

export function createTrafficSystem({ scene, fx, enemies, hurtPlayer, onEnemyHit, onPlayerHit }) {
  let cfg = null;
  let enabled = false;
  let arena = 19;
  let timer = 0;
  let serial = 0;
  let laneCursor = 0;
  let dirCursor = 1;
  let pending = null;
  const roads = [];
  const cars = [];

  const roadGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const dashGeo = new THREE.BoxGeometry(0.72, 0.025, 0.07);

  function removeRoad(r) {
    scene.remove(r.group);
    r.group.traverse((o) => {
      if (!o.isMesh) return;
      if (o.material) o.material.dispose();
    });
  }

  function clearCars() {
    for (const c of cars) {
      scene.remove(c.group, c.warnMesh);
      if (c.warnMesh) c.warnMesh.material.dispose();
    }
    cars.length = 0;
    pending = null;
  }

  function build(next, arenaRadius = 19) {
    clear();
    if (!next) return;
    cfg = { ...TRAFFIC_DEFAULTS, ...next };
    arena = arenaRadius;
    enabled = true;
    timer = cfg.first;
    for (const z of cfg.lanes) {
      const group = new THREE.Group();
      const mat = new THREE.MeshBasicMaterial({ color: 0x24262a, depthWrite: false });
      const road = new THREE.Mesh(roadGeo, mat);
      road.scale.set(arena * 2 + 8, 1, cfg.width);
      road.position.set(0, 0.018, z);
      group.add(road);
      const dashMat = new THREE.MeshBasicMaterial({ color: 0xe8c75c, depthWrite: false });
      for (let x = -arena - 2; x <= arena + 2; x += 1.55) {
        const dash = new THREE.Mesh(dashGeo, dashMat);
        dash.position.set(x, 0.042, z);
        group.add(dash);
      }
      scene.add(group);
      roads.push({ group, z });
    }
  }

  function clear() {
    for (const r of roads) removeRoad(r);
    roads.length = 0;
    clearCars();
    cfg = null;
    enabled = false;
    timer = 0;
    serial = 0;
    laneCursor = 0;
    dirCursor = 1;
  }

  function spawn(laneIndex, dir) {
    if (!enabled || !cfg) return null;
    const lane = ((laneIndex % cfg.lanes.length) + cfg.lanes.length) % cfg.lanes.length;
    const z = cfg.lanes[lane];
    const d = dir >= 0 ? 1 : -1;
    const id = ++serial;
    const warnMat = new THREE.MeshBasicMaterial({
      color: 0xffd35a, transparent: true, opacity: 0.18,
      depthWrite: false, depthTest: false, side: THREE.DoubleSide,
    });
    const warnMesh = new THREE.Mesh(roadGeo, warnMat);
    warnMesh.scale.set(arena * 2 + 5, 1, cfg.width);
    warnMesh.position.set(0, 0.072, z);
    warnMesh.renderOrder = 850;
    warnMesh.frustumCulled = false;
    scene.add(warnMesh);
    const group = makeVan();
    group.visible = false;
    group.rotation.y = d > 0 ? 0 : Math.PI;
    scene.add(group);
    const car = {
      id, lane, z, dir: d, t: 0, phase: 'warn', x: -d * (arena + 3.2),
      group, warnMesh, hitEnemies: new Set(), hitPlayer: false,
    };
    cars.push(car);
    return id;
  }

  function schedule(roundNo) {
    const lane = laneCursor++ % cfg.lanes.length;
    const dir = dirCursor;
    dirCursor *= -1;
    spawn(lane, dir);
    if (roundNo >= cfg.doubleFrom && laneCursor % 2 === 0) {
      pending = { t: 1.35, lane: (lane + 1) % cfg.lanes.length, dir: -dir };
    }
  }

  function finish(i) {
    const c = cars[i];
    if (!c) return;
    scene.remove(c.group, c.warnMesh);
    if (c.warnMesh) c.warnMesh.material.dispose();
    cars.splice(i, 1);
  }

  function collide(c, playerPos, playerRadius, roundNo) {
    for (const e of enemies.list) {
      if (!enemies.hittable(e) || c.hitEnemies.has(e.id)) continue;
      if (!trafficLaneHit(e.pos.x, e.pos.z, c.x, c.z, cfg.width, e.cfg.radius || 0.4)) continue;
      c.hitEnemies.add(e.id);
      const eliteMul = e.cfg.elite ? 0.55 : 1;
      const raw = Math.max(10 + roundNo * 1.5, (e.maxHp || 1) * cfg.enemyPct) * eliteMul;
      const killed = enemies.takeDamage(e, raw, false, { cls: 'hazard' });
      enemies.knockback(e, c.x - c.dir * 2.0, c.z, 1.2);
      if (onEnemyHit) onEnemyHit(e, killed);
      if (fx) fx.text({ x: e.pos.x, z: e.pos.z }, '配送', { color: '#ffd35a', y: e.height, size: 0.55 });
    }
    if (!c.hitPlayer && trafficLaneHit(playerPos.x, playerPos.z, c.x, c.z, cfg.width, playerRadius)) {
      c.hitPlayer = true;
      hurtPlayer(cfg.damage, 'traffic');
      if (onPlayerHit) onPlayerHit(c.id);
    }
  }

  function update(dt, { playerPos, playerRadius = 0.32, roundNo = 1 } = {}) {
    if (!enabled || !cfg || !playerPos) return;
    timer -= dt;
    if (timer <= 0) {
      timer += Math.max(5.5, cfg.gap - Math.min(2.5, (roundNo - 1) * 0.10));
      schedule(roundNo);
    }
    if (pending) {
      pending.t -= dt;
      if (pending.t <= 0) {
        spawn(pending.lane, pending.dir);
        pending = null;
      }
    }
    for (let i = cars.length - 1; i >= 0; i--) {
      const c = cars[i];
      c.t += dt;
      if (c.phase === 'warn') {
        c.warnMesh.material.opacity = 0.12 + 0.18 * (0.5 + 0.5 * Math.sin(c.t * 15));
        if (c.t >= cfg.warn) {
          c.phase = 'drive';
          c.t = 0;
          c.group.visible = true;
          c.warnMesh.visible = false;
          c.group.position.set(c.x, 0, c.z);
        }
        continue;
      }
      c.x += c.dir * cfg.speed * dt;
      c.group.position.set(c.x, 0, c.z);
      collide(c, playerPos, playerRadius, roundNo);
      if (Math.abs(c.x) > arena + 4.2) finish(i);
    }
  }

  return {
    build, update, clear, spawn,
    get on() { return enabled; },
    get count() { return cars.length; },
    get nextIn() { return enabled ? Math.max(0, timer) : null; },
    list: () => cars.map((c) => ({
      id: c.id, phase: c.phase, lane: c.lane, z: c.z, dir: c.dir,
      x: +c.x.toFixed(2), t: +c.t.toFixed(2), hits: c.hitEnemies.size,
    })),
    config: () => (cfg ? { ...cfg, lanes: cfg.lanes.slice() } : null),
  };
}
