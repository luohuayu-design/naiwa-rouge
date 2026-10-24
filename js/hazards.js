// ============================================================
// hazards.js —— 场上的周期性危险区（第 63 块，第六关「漏电地板」）
//
// 骨塔地下机房的地板是拆下来的机柜格栅，年头久了会漏电：
// 每隔几秒某一块「通电」，站上去就掉血。它不是怪，打不掉，只能躲。
//
// 设计要点（和「怪在地上留一片火」的区别）：
//   1. **位置固定**： pyro 的火是打完才出现、随便落；漏电地板从回合一开始
//      就在那儿，玩家可以提前规划「哪条路能走」。
//   2. **周期可读**： 通电前 0.8 秒开始闪（预警），通电 1.4 秒，然后灭 2.6 秒。
//      会看节奏的玩家可以踩着「灭」的窗口穿过去 —— 这是走位，不是运气。
//   3. **只伤玩家**：怪是机房的「自己人」，电流不认它们。所以它逼你走位，
//      但不会替你把怪清掉 —— 收益全在你自己身上。
//
// 通电状态对外暴露 `isPowered(x, z)`：法器的「绝缘斗篷」靠它决定要不要把电引出去。
// ============================================================
import * as THREE from '../lib/three.module.js?v=80';

export function createHazards({ scene, fx, playerPos, playerRadius = 0.32, hurtPlayer }) {
  // def: { x, z, r, cycle, on, warm, damage }
  //   cycle  一整轮多少秒（灭 → 预警 → 通电 → 灭）
  //   on     通电持续多少秒
  //   warm   通电前多少秒开始预警闪
  //   damage 通电时每 0.6 秒掉多少血
  let defs = [];
  let nodes = [];
  let clock = 0;
  let tickT = 0;
  let playerHurt = 0;       // 本次「站在电上」累计时间（离开就清零）
  let currentOn = false;

  const geoDisc = new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2);
  const geoRim = new THREE.RingGeometry(0.9, 1, 56).rotateX(-Math.PI / 2);

  function clear() {
    for (const n of nodes) {
      scene.remove(n.disc, n.rim);
      n.disc.material.dispose();
      n.rim.material.dispose();
    }
    nodes = [];
  }

  function build(list) {
    clear();
    defs = (list || []).map((d) => ({ cycle: 4.8, on: 1.4, warm: 0.8, damage: 1, ...d }));
    for (const d of defs) {
      const disc = new THREE.Mesh(geoDisc, new THREE.MeshBasicMaterial({
        color: 0x2a6a7a, transparent: true, opacity: 0.16, depthWrite: false,
      }));
      disc.position.set(d.x, 0.035, d.z);
      disc.scale.setScalar(d.r);
      disc.frustumCulled = false;
      const rim = new THREE.Mesh(geoRim, new THREE.MeshBasicMaterial({
        color: 0x6fd8e0, transparent: true, opacity: 0.30, depthWrite: false, side: THREE.DoubleSide,
      }));
      rim.position.set(d.x, 0.042, d.z);
      rim.scale.setScalar(d.r);
      rim.frustumCulled = false;
      scene.add(disc, rim);
      nodes.push({ disc, rim });
    }
    clock = 0;
    tickT = 0;
    playerHurt = 0;
    currentOn = false;
  }

  // 每一块的相位（0~1）：0~0.45 灭 / 0.45~0.62 预警 / 0.62~0.91 通电 / 其余收尾
  function phaseOf(i) {
    const d = defs[i];
    const cyc = Math.max(0.5, d.cycle);
    const p = ((clock + i * (cyc / Math.max(1, defs.length))) % cyc) / cyc;
    return p;
  }

  // 某一块此刻是不是通电（预警不算）
  function poweredNow(i) {
    const d = defs[i];
    const onFrac = Math.min(0.9, d.on / Math.max(0.5, d.cycle));
    const warmFrac = Math.min(0.9 - onFrac, d.warm / Math.max(0.5, d.cycle));
    const p = phaseOf(i);
    return p >= 0.45 + warmFrac && p < 0.45 + warmFrac + onFrac;
  }

  function warnNow(i) {
    const d = defs[i];
    const onFrac = Math.min(0.9, d.on / Math.max(0.5, d.cycle));
    const warmFrac = Math.min(0.9 - onFrac, d.warm / Math.max(0.5, d.cycle));
    const p = phaseOf(i);
    return p >= 0.45 && p < 0.45 + warmFrac;
  }

  // 点位是否踩在**通电**的地板上（法器「绝缘斗篷」用这个）
  function isPowered(x, z) {
    for (let i = 0; i < defs.length; i++) {
      const d = defs[i];
      if (!poweredNow(i)) continue;
      if (Math.hypot(x - d.x, z - d.z) <= d.r) return true;
    }
    return false;
  }

  function update(dt, extra = {}) {
    if (!defs.length) return;
    clock += dt;
    const pp = extra.playerPos || playerPos;
    let onMe = false;
    let dmg = 1;

    for (let i = 0; i < defs.length; i++) {
      const d = defs[i];
      const n = nodes[i];
      const on = poweredNow(i);
      const warn = warnNow(i);
      // 视觉：灭 = 暗青 / 预警 = 橙红快闪 / 通电 = 亮青
      const t = performance.now() / 1000;
      if (on) {
        n.disc.material.color.setHex(0x2fb8c8);
        n.disc.material.opacity = 0.34;
        n.rim.material.color.setHex(0x9ff4ff);
        n.rim.material.opacity = 0.62;
      } else if (warn) {
        const k = 0.5 + 0.5 * Math.sin(t * 22);
        n.disc.material.color.setHex(0x8a4a2a);
        n.disc.material.opacity = 0.14 + 0.12 * k;
        n.rim.material.color.setHex(0xff9a5c);
        n.rim.material.opacity = 0.28 + 0.34 * k;
      } else {
        n.disc.material.color.setHex(0x2a6a7a);
        n.disc.material.opacity = 0.13;
        n.rim.material.color.setHex(0x6fd8e0);
        n.rim.material.opacity = 0.26;
      }
      if (on && Math.hypot(pp.x - d.x, pp.z - d.z) <= d.r + playerRadius * 0.5) {
        onMe = true;
        dmg = Math.max(dmg, d.damage);
        // 电弧：通电期间偶发，站在上面会明显变密
        if (fx && Math.random() < dt * 6) {
          fx.burst({ x: pp.x, z: pp.z }, {
            color: 0x9ff4ff, count: 3, speed: 2.2, life: 0.22, size: 0.07, y: 0.25, up: 1.6,
          });
        }
      }
    }

    // 站在通电地板上：每 0.6 秒结算一次（不是每帧扣，掉血数字才看得清）
    if (onMe) {
      playerHurt += dt;
      tickT += dt;
      if (tickT >= 0.6) {
        tickT = 0;
        hurtPlayer?.(dmg, 'hazard');
        if (fx) fx.ring(pp, { from: 0.2, to: 1.1, color: 0x9ff4ff, life: 0.28, opacity: 0.7, y: 0.06 });
      }
    } else {
      tickT = 0;
    }
    currentOn = onMe;
  }

  return {
    build, update, clear, isPowered,
    get count() { return defs.length; },
    get onPlayer() { return currentOn; },
    get defs() { return defs.map((d) => ({ ...d })); },
    // 调试/测试：把时钟调到某个相位（0~1），立刻停在那一帧
    setPhase(p) {
      let cyc = 1;
      for (const d of defs) cyc = Math.max(cyc, d.cycle);
      clock = Math.max(0, Math.min(0.999, p)) * cyc;
    },
    // 测试用：某一块现在通不通电
    stateOf(i) { return { on: poweredNow(i), warn: warnNow(i), phase: +phaseOf(i).toFixed(3) }; },
  };
}
