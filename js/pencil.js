// ============================================================
// pencil.js —— 第 18 件法器「铅笔」（第 129 块，第十六关专属）
//
// 钟楼画室桌上那支铅笔。两件事：
//
//   ① 自动划线（被动）：每隔几秒，铅笔在你**面朝的方向**往前划一道约 5 格的线，
//      线在地上留 8 秒。踩在线上的怪移速 −30%，并且一直掉血 ——
//      它是「站位工具」：往怪要来的方向划，让它们自己走进你的线里。
//      （买「加长笔杆」= 每道线更长；买「双头铅笔」= 同时划出十字两道。）
//
//   ② 描红（主动技能，键位 R）：朝面前一条线扫过去，被扫到的怪标红 5 秒，
//      受到的所有伤害 +25%。冷却 30 秒（法器三级 22 秒）。
//      它对应场地机制「线稿 → 定稿」：场地是怪画圈钉你，描红是你把标记
//      按回怪身上 —— 被描红的怪，打它反而更快。
//
// 骨架照 ringlight.js：等级 / 卡 / 商店两件买断各有独立通道，
// 临时属性 mod 全带 src，到期 / reset 必须撤掉（这里有 cd 与标记，没有玩家属性）。
// ============================================================
import * as THREE from '../lib/three.module.js?v=147';

export const PENCIL_BASE = {
  cd: 30.0,
  cdMin: 15.0,
  range: 7.5,          // 描红扫过的长度（世界单位）
  width: 2.0,          // 描红扫过的宽度
  markTime: 5.0,       // 被描红的秒数
  markMul: 1.25,       // 被描红后受到的伤害倍率
  lineWidth: 0.34,     // 地上线的视觉宽度
  lineHitWidth: 0.62,  // 线的判定宽度（怪中心到线的距离 ≤ 这个 + 半径）
  lineLife: 8.0,       // 线在地上留多久
  lineDps: 0.6,        // 线上每秒掉血（按等级另查表乘）
  lineSlow: 0.30,      // 线上减速比例
  lineSlowTime: 0.55,  // 减速持续时间（比结算间隔略长）
  tick: 0.4,           // 线的伤害结算节拍
};

// 等级表（0 位留空：relicLv = 0 表示没买）
const LV = {
  len: [0, 5.0, 6.0, 7.0],        // 每道线长度
  interval: [0, 8.0, 7.0, 6.0],   // 多久自动划一道
  dps: [0, 0.60, 0.80, 1.00],     // 线上每秒伤害
  cd: [0, 30.0, 26.0, 22.0],      // 描红冷却
};

// 地上的铅笔线贴图：一条横向的粗糙石墨线（两端略淡，中间有几道来回的笔触）。
function makeLineTexture() {
  const W = 256, H = 32;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const mid = H / 2;

  // 主线：三段叠着画，模拟铅笔来回
  for (let pass = 0; pass < 3; pass++) {
    const y = mid + (pass - 1) * 1.6;
    const grd = g.createLinearGradient(0, 0, W, 0);
    grd.addColorStop(0, 'rgba(220,220,214,0)');
    grd.addColorStop(0.08, 'rgba(214,214,208,0.55)');
    grd.addColorStop(0.9, 'rgba(214,214,208,0.55)');
    grd.addColorStop(1, 'rgba(220,220,214,0)');
    g.strokeStyle = grd;
    g.lineWidth = pass === 1 ? 4.6 : 2.0;
    g.lineCap = 'round';
    g.beginPath();
    for (let x = 0; x <= W; x += 8) {
      const yy = y + Math.sin(x * 0.09 + pass * 2.0) * 1.3;
      if (x === 0) g.moveTo(x, yy); else g.lineTo(x, yy);
    }
    g.stroke();
  }

  // 笔尖起落的小点
  g.fillStyle = 'rgba(206,206,200,0.5)';
  for (let i = 0; i < 10; i++) {
    const x = 18 + Math.random() * (W - 36);
    g.beginPath();
    g.arc(x, mid + (Math.random() - 0.5) * 10, 0.8 + Math.random() * 1.2, 0, Math.PI * 2);
    g.fill();
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

export function createPencilSystem({ scene, fx, enemies, onCast }) {
  const mods = { len: 0, interval: 0, dps: 0, cdCut: 0, markTime: 0, markMul: 0 };
  const shop = { long: false, twin: false };
  let relicLv = 0;
  let cd = 0;
  let cdMul = 1;
  let amp = { dmg: 1, radius: 0, cd: 1, dur: 0, coin: 0 };
  let serial = 0;
  let lastFail = '';
  let tickT = 0;

  const lineTex = makeLineTexture();
  const lineMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({
      map: lineTex, transparent: true, opacity: 0.8,
      depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    })
  );
  lineMesh.visible = false;
  lineMesh.renderOrder = 4;
  scene.add(lineMesh);

  const lines = [];   // { x, z, yaw, len, t, id, node }
  const bands = [];   // 描红的红色扫痕 { x, z, yaw, len, t, life, node }

  const lenV = () => ((LV.len[relicLv] || 0) + mods.len + (shop.long ? 1.5 : 0));
  const intervalV = () => Math.max(3.2, (LV.interval[relicLv] || 8.0) - mods.interval);
  const dpsV = () => ((LV.dps[relicLv] || 0) + mods.dps) * amp.dmg;
  const cdMaxV = () => Math.max(PENCIL_BASE.cdMin, Math.max(0, (LV.cd[relicLv] || 0) - mods.cdCut) * cdMul * amp.cd);
  const rangeV = () => PENCIL_BASE.range + amp.radius;
  const widthV = () => PENCIL_BASE.width;
  const markTimeV = () => PENCIL_BASE.markTime + mods.markTime + (amp.dur || 0);
  const markMulV = () => PENCIL_BASE.markMul + mods.markMul;

  let drawT = 0;   // 自动划线的节拍

  function yawOf(p, y) {
    if (typeof y === 'number') return y;
    if (y && typeof y === 'object' && typeof y.yaw === 'number') return y.yaw;
    return (p && p.yaw) || 0;
  }

  // 划一道线：起点在主角脚下，沿 yaw 往前 len 格
  function addLine(p, yaw, len) {
    const id = ++serial;
    const node = lineMesh.clone();
    node.material = lineMesh.material.clone();
    node.geometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    node.visible = true;
    node.renderOrder = 4;
    const mx = p.x + Math.sin(yaw) * len * 0.5;
    const mz = p.z + Math.cos(yaw) * len * 0.5;
    node.position.set(mx, 0.055, mz);
    node.rotation.y = yaw - Math.PI / 2;
    node.scale.set(len, 1, PENCIL_BASE.lineWidth);
    node.material.opacity = 0.82;
    scene.add(node);
    lines.push({ id, x: p.x, z: p.z, yaw, len, t: 0, node });
  }

  function removeLine(l) {
    scene.remove(l.node);
    if (l.node.geometry) l.node.geometry.dispose();
    if (l.node.material) l.node.material.dispose();
  }

  // 点 (px,pz) 到线段（起点 l.x/l.z，方向 yaw，长 len）的距离
  function distToLine(l, px, pz) {
    const dx = Math.sin(l.yaw), dz = Math.cos(l.yaw);
    const vx = px - l.x, vz = pz - l.z;
    let proj = vx * dx + vz * dz;
    proj = Math.max(0, Math.min(l.len, proj));
    const qx = l.x + dx * proj, qz = l.z + dz * proj;
    return Math.hypot(px - qx, pz - qz);
  }

  function lineTick(dt) {
    tickT -= dt;
    if (tickT > 0) return;
    tickT = PENCIL_BASE.tick;
    const dmg = dpsV() * PENCIL_BASE.tick;
    for (const l of lines) {
      for (const e of enemies.list) {
        if (!enemies.hittable(e)) continue;
        if (distToLine(l, e.pos.x, e.pos.z) > PENCIL_BASE.lineHitWidth + (e.cfg.radius || 0.4)) continue;
        enemies.applySlow(e, { factor: PENCIL_BASE.lineSlow, time: PENCIL_BASE.lineSlowTime });
        enemies.takeDamage(e, dmg, false, { dot: true, cls: 'phys' });
      }
    }
  }

  function update(dt, { playerPos, yaw } = {}) {
    if (cd > 0) cd = Math.max(0, cd - dt);

    // 自动划线（只有买了法器、且这一关在跑时才划）
    if (relicLv > 0 && playerPos) {
      drawT -= dt;
      if (drawT <= 0) {
        drawT = intervalV();
        const y = yawOf(playerPos, yaw);
        const len = lenV();
        addLine(playerPos, y, len);
        // 双头铅笔：同时划十字的另一道
        if (shop.twin) addLine(playerPos, y + Math.PI / 2, len);
      }
    }

    // 线的淡出与回收
    for (const l of lines) {
      l.t += dt;
      const left = PENCIL_BASE.lineLife - l.t;
      l.node.material.opacity = 0.82 * Math.min(1, left / 0.8);
    }
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].t >= PENCIL_BASE.lineLife) {
        removeLine(lines[i]);
        lines.splice(i, 1);
      }
    }

    lineTick(dt);

    // 描红的红痕淡出
    for (const b of bands) {
      b.t += dt;
      b.node.material.opacity = 0.75 * Math.max(0, 1 - b.t / b.life);
    }
    for (let i = bands.length - 1; i >= 0; i--) {
      if (bands[i].t >= bands[i].life) {
        scene.remove(bands[i].node);
        bands[i].node.geometry.dispose();
        bands[i].node.material.dispose();
        bands.splice(i, 1);
      }
    }
  }

  /** 描红：朝 yaw 方向一条线，被扫到的怪标红（主动技能 R） */
  function mark(p, yaw) {
    if (!relicLv) { lastFail = 'lock'; return false; }
    if (cd > 0) { lastFail = 'cd'; return false; }
    const src = p || { x: 0, z: 0 };
    const y = yawOf(src, yaw);
    const len = rangeV();
    const id = ++serial;

    // 视觉：一条红色的扫痕
    const node = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        color: 0xff5a5a, transparent: true, opacity: 0.75,
        depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      })
    );
    node.position.set(src.x + Math.sin(y) * len * 0.5, 0.06, src.z + Math.cos(y) * len * 0.5);
    node.rotation.y = y - Math.PI / 2;
    node.scale.set(len, 1, 0.9);
    node.renderOrder = 5;
    scene.add(node);
    bands.push({ node, t: 0, life: 0.45 });

    // 判定：以玩家为起点的线段，宽 width
    let hit = 0;
    const dx = Math.sin(y), dz = Math.cos(y);
    for (const e of enemies.list) {
      if (!enemies.hittable(e)) continue;
      const vx = e.pos.x - src.x, vz = e.pos.z - src.z;
      let proj = vx * dx + vz * dz;
      proj = Math.max(0, Math.min(len, proj));
      const qx = src.x + dx * proj, qz = src.z + dz * proj;
      if (Math.hypot(e.pos.x - qx, e.pos.z - qz) > widthV() * 0.5 + (e.cfg.radius || 0.4)) continue;
      e.redlined = { t: markTimeV(), dmgMul: markMulV(), ringT: 1 };
      hit++;
      if (fx) fx.ring(e.pos, { from: 0.2, to: 1.4, color: 0xff5a5a, life: 0.35, opacity: 0.7, y: 0.07 });
    }

    cd = cdMaxV();
    lastFail = '';
    if (onCast) onCast(id, hit);
    if (fx) fx.ring(src, { from: 0.5, to: len, color: 0xff5a5a, life: 0.32, opacity: 0.6, y: 0.07 });
    return true;
  }

  function removeAllLines() {
    for (const l of lines) removeLine(l);
    lines.length = 0;
  }
  function clearField() {
    removeAllLines();
    for (const b of bands) {
      scene.remove(b.node);
      b.node.geometry.dispose();
      b.node.material.dispose();
    }
    bands.length = 0;
    cd = 0;
    drawT = 0;
    tickT = 0;
  }

  function reset() {
    clearField();
    for (const k of Object.keys(mods)) mods[k] = 0;
    shop.long = false;
    shop.twin = false;
    relicLv = 0;
    lastFail = '';
  }

  return {
    update, mark, reset, clearField,
    get owned() { return relicLv > 0; },
    get ready() { return relicLv > 0 && cd <= 0; },
    get cdLeft() { return cd; },
    get cdMax() { return cdMaxV(); },
    get progress() { return relicLv ? 1 - cd / cdMaxV() : 0; },
    get lastFail() { return lastFail; },
    setRelicLevel(n) { relicLv = Math.max(0, Math.min(3, Number(n) || 0)); },
    applyCard(card) {
      const put = (c) => {
        if (!c) return;
        if (c.stat === 'len') mods.len += c.flat;
        else if (c.stat === 'interval') mods.interval += c.flat;
        else if (c.stat === 'dps') mods.dps += c.flat;
        else if (c.stat === 'cd') mods.cdCut += c.flat;
        else if (c.stat === 'markTime') mods.markTime += c.flat;
        else if (c.stat === 'markMul') mods.markMul += c.flat;
      };
      put(card);
      for (const ex of (card.extra || [])) put(ex);
    },
    buyLong() { if (shop.long) return false; shop.long = true; return true; },
    buyTwin() { if (shop.twin) return false; shop.twin = true; return true; },
    hasLong: () => shop.long,
    hasTwin: () => shop.twin,
    bonuses: () => ({
      ...mods,
      len: +lenV().toFixed(2),
      interval: +intervalV().toFixed(2),
      dps: +dpsV().toFixed(2),
      cdMax: +cdMaxV().toFixed(2),
      range: +rangeV().toFixed(2),
      markTime: +markTimeV().toFixed(2),
      markMul: +markMulV().toFixed(3),
      long: shop.long,
      twin: shop.twin,
      level: relicLv,
    }),
    snapshot: () => ({ ...mods, long: shop.long, twin: shop.twin }),
    restore(saved) {
      reset();
      if (!saved) return;
      for (const k of Object.keys(mods)) mods[k] = Number(saved[k]) || 0;
      shop.long = !!saved.long;
      shop.twin = !!saved.twin;
    },
    setCdMul(m) {
      cdMul = Math.max(0.1, Number(m) || 1);
      if (cd > 0) cd = Math.min(cd, cdMaxV());
    },
    setRelicAmp: (a) => { amp = { ...amp, ...(a || {}) }; },
    list: () => ({
      lines: lines.map((l) => ({
        id: l.id, x: +l.x.toFixed(2), z: +l.z.toFixed(2),
        yaw: +l.yaw.toFixed(2), len: +l.len.toFixed(2), t: +l.t.toFixed(1),
      })),
      bands: bands.map((b) => ({ t: +b.t.toFixed(2), life: b.life })),
    }),
    // 调试：立刻划一道线 / 直接描红（不扣冷却）
    debugLine: (x = 0, z = 0, yaw = 0) => {
      const keep = relicLv;
      if (!keep) relicLv = 1;
      addLine({ x, z }, yaw, lenV());
      if (shop.twin) addLine({ x, z }, yaw + Math.PI / 2, lenV());
      relicLv = keep;
      return lines.length;
    },
    debugMark: (x = 0, z = 0, yaw = 0) => {
      const keep = relicLv;
      if (!keep) relicLv = 1;
      const keepCd = cd;
      cd = 0;
      const ok = mark({ x, z }, yaw);
      if (!keep) relicLv = keep;
      cd = keepCd;
      return ok;
    },
  };
}
